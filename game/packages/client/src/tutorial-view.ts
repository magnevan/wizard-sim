/**
 * The tutorial's look (docs/explorations/2026-11-06-tutorial.md), in the Pixel Battlefield style:
 *
 *   on the floor   beat 1's glowing floor stones, beat 3's chalk ring, beat 14's pit, the gates
 *                  enemies walk in through (dim in the calm, glowing as they open), the ready stone,
 *                  the "I know this" stone with its fill ring; all drawn into the field canvas under
 *                  the actors
 *   standing       the exit arch on the east (dark until the beat is done, then a lit portal) and the
 *                  end card's three arches, depth-sorted with the actors
 *   HUD            the prompt box at the top of the view: the step, the beat's title, its lines, its
 *                  counter and the calm's countdown; a big title when a beat begins; the fade between beats
 *
 * Reads the sim, never writes it, and every word comes from tutorial-text.ts. Bodies (brambles,
 * straw goblins, the sack) are rigs (art/rigs.ts).
 */
import { Graphics, Sprite, Texture } from 'pixi.js';
import {
  KIND, MAX_SEATS, T, TUT_BEAT, TUT_END, TUT_ORDER, TUT_PLACES as P, TUT_STATE as TS, TUT_TAG, TUT_TIMES, allArrived, arrivalsOf, calmOf, skipOpen, wavesOf, type World,
} from '@wizard-sim/sim';
import { PPU } from './camera';
import { gx, gy } from './art/field';
import * as X from './art/px';
import type { Ctx } from './art/px';
import { FY, TAU, clamp, easeOut, mod } from './art/util';
import { toU, toV } from './iso-world';
import type { LightFn } from './art/vfx';
import { BEAT_TEXT, EXITS, LINES, counterFor, promptFor } from './tutorial-text';

/** Where a fixed spot of the room (real world units) is drawn: the turned world's field px. */
const sx = (x: number, y: number): number => gx(toU(x, y)), sy = (x: number, y: number): number => gy(toV(x, y));

/** A depth-sorted canvas covering field rect (rx, ry, w, h), sorted at ground y z (view-structures.ts Pieces). */
export type PieceFn = (rx: number, ry: number, w: number, h: number, z: number) => Ctx;

const STONE = { light: '#c8ccd4', top: '#868c9a', main: '#555a68', side: '#40434f', dark: '#2c2e38', deep: '#1c1d25' };
const GOLD = ['#ffffff', '#fff6d0', '#ffd860', '#e0a030', '#9a6020'] as const;
const RUNE = ['#ffffff', '#d8fbff', '#8ae8ff', '#3ab0e0', '#1a5a80'] as const;

/** Everything on the floor and standing in the chamber. Called from the structure view's draw. */
export function drawTutorialWorld(w: World, t: number, g: Ctx, o: Ctx, light: LightFn, piece: PieceFn): void {
  const tut = w.tut;
  if (!tut) return;
  const st = tut.state, beat = st[TS.beat], b = w.bodies;
  if (st[TS.fade] < 0) return; // not laid out yet

  if (beat === TUT_BEAT.walk) P.stones.forEach(([x, y], k) => floorStone(g, light, sx(x, y), sy(x, y), !!(st[TS.a] & (1 << k)), t, k));
  if (beat === TUT_BEAT.heavy) {
    let inside = false;
    for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && tut.tag[i] === TUT_TAG.sack) inside = Math.hypot(b.x[i] - P.ring[0], b.y[i] - P.ring[1]) < P.ringR;
    chalkRing(g, light, sx(P.ring[0], P.ring[1]), sy(P.ring[0], P.ring[1]), P.ringR * PPU, inside, t);
  }

  if (beat === TUT_BEAT.fireball) pit(g, light, sx(P.pit[0], P.pit[1]), sy(P.pit[0], P.pit[1]), P.pitR * PPU, t);
  // the Life beat's sleeping goblin: little z's drifting up off it
  if (beat === TUT_BEAT.life) for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy || tut.tag[i] !== TUT_TAG.sleeper) continue;
    for (let k = 0; k < 3; k++) {
      const u = mod(t * 0.4 + k / 3, 1), zx = Math.round(gx(b.x[i]) + 4 + u * 6 + Math.sin(u * 6 + k) * 2), zy = Math.round(gy(b.y[i]) - 14 - u * 14);
      X.text(o, LINES.asleep, zx, zy, u > 0.7 ? '#6a6484' : '#cfc9e6');
    }
  }

  if (beat === TUT_END) {
    P.exits.forEach(([x, y], k) => {
      const on = st[TS.a] === k + 1 ? clamp(st[TS.b] / T(P.exitTime), 0, 1) : 0;
      arch(piece, o, light, sx(x, y), sy(x, y), true, t, k, on, EXITS[k].label);
    });
    return;
  }
  // the gates this beat's enemies come through, and the ready stone while the calm lasts
  if (wavesOf(beat)) {
    const gates = new Set<number>();
    for (let k = 0; k < wavesOf(beat); k++) for (const a of arrivalsOf(beat, k)) gates.add(a.gate);
    const now = new Set(arrivalsOf(beat, st[TS.wave]).map((a) => a.gate));
    const left = st[TS.go] === 0 ? T(calmOf(beat, st[TS.wave])) - st[TS.calm] : 0;
    // 0 shut; warming as the calm runs out; 1 open while they walk in; a faint glow after
    const heat = st[TS.lit] ? 0 : st[TS.go] === 0 ? 0.8 * clamp(1 - left / T(TUT_TIMES.warn * 2), 0, 1) : allArrived(w) ? 0.15 : 1;
    gates.forEach((k) => gate(g, o, light, sx(P.gates[k][0], P.gates[k][1]), sy(P.gates[k][0], P.gates[k][1]), now.has(k) ? heat : Math.min(heat, 0.15), t, k));
    if (st[TS.go] === 0 && st[TS.wave] === 0 && !st[TS.lit]) readyStone(g, o, light, w, t);
  }
  if (skipOpen(w)) skipStone(g, o, light, w, t);
  arch(piece, o, light, sx(P.arch[0], P.arch[1]), sy(P.arch[0], P.arch[1]), !!st[TS.lit], t, 7, 0, st[TS.lit] ? LINES.arch : '');
}

/** Beat 14: a round pit in the floor nobody can step into, and a stone pillar in its middle the bramble grows on. */
function pit(g: Ctx, light: LightFn, x: number, y: number, r: number, t: number): void {
  x = Math.round(x); y = Math.round(y);
  X.ellipse(g, x, y + 2, r + 3, (r + 3) * FY, STONE.dark);
  X.ellipse(g, x, y, r + 1, (r + 1) * FY, STONE.side);
  X.ellipse(g, x, y + 2, r - 1, (r - 1) * FY, '#0c0a12');
  X.ellipse(g, x, y + 5, r - 6, (r - 6) * FY, '#06050a');
  // the lip's chipped edge on the far side
  for (let k = 0; k < 40; k++) { const a = Math.PI + (k / 40) * Math.PI; X.px(g, x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1) * FY, k % 3 ? STONE.top : STONE.light); }
  // the pillar
  X.ellipse(g, x, y + 3, 9, 9 * FY, STONE.deep);
  X.ellipse(g, x, y, 8, 8 * FY, STONE.main);
  X.ellipse(g, x - 1, y - 1, 6, 6 * FY, STONE.top);
  light(x, y + 4, 40, '#3a2a60', 0.15 + 0.05 * Math.sin(t * 1.3));
}

const HOT = ['#fff0e0', '#ffb090', '#ff5a4a', '#b02a3a', '#5a1428'] as const;
/** A gate in the floor by the wall, where enemies walk in: a dark ring of stone, glowing red as it opens. */
function gate(g: Ctx, o: Ctx, light: LightFn, x: number, y: number, heat: number, t: number, k: number): void {
  x = Math.round(x); y = Math.round(y);
  const r = 13, p = 0.5 + 0.5 * Math.sin(t * (3 + 6 * heat) + k);
  X.ellipse(g, x, y + 1, r + 2, (r + 2) * FY, STONE.deep);
  X.ellipse(g, x, y, r, r * FY, STONE.side);
  X.ellipse(g, x, y, r - 3, (r - 3) * FY, '#0e0a14');
  // runes round the rim, lit as it opens
  for (let q = 0; q < 8; q++) { const a = (q / 8) * TAU + t * 0.2; X.px(g, x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5) * FY, heat > 0.05 ? HOT[heat > 0.6 ? 1 : 2] : '#3a3450'); }
  if (heat > 0.05) {
    X.ellipse(g, x, y, (r - 4) * heat, (r - 4) * heat * FY, HOT[3], 0.5 + 0.3 * p);
    X.ellipse(g, x, y, (r - 7) * heat, (r - 7) * heat * FY, HOT[2], 0.4 * heat);
    for (let q = 0; q < 5; q++) { const a = t * 2 + (q / 5) * TAU, rr = (r - 5) * heat; X.px(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY, HOT[1]); }
    // embers rising out of it
    for (let q = 0; q < 4; q++) { const u = mod(t * 0.8 + q / 4 + k * 0.13, 1); X.px(o, x - 6 + ((q * 5 + k * 3) % 12), y - u * 18 * heat, u > 0.6 ? HOT[2] : HOT[1]); }
    light(x, y, 30 + 30 * heat, HOT[2], 0.25 + 0.35 * heat * p);
  }
}

/** The ready stone ahead of the entry: a gold-runed stone; stepping on it lets the enemies in. */
function readyStone(g: Ctx, o: Ctx, light: LightFn, w: World, t: number): void {
  const b = w.bodies, x = Math.round(sx(P.ready[0], P.ready[1])), y = Math.round(sy(P.ready[0], P.ready[1])), r = P.readyR * PPU * 0.85, p = 0.5 + 0.5 * Math.sin(t * 2.6);
  let on = false;
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && b.kind[s] === KIND.wizard && Math.hypot(b.x[s] - P.ready[0], b.y[s] - P.ready[1]) < P.readyR) on = true;
  X.ellipse(g, x, y + 1, r + 1, (r + 1) * FY, STONE.deep);
  X.ellipse(g, x, y, r, r * FY, STONE.main);
  X.ellipse(g, x - 1, y - 1, r - 2, (r - 2) * FY, STONE.top);
  X.ring(g, x, y, r - 3, (r - 3) * FY, GOLD[on ? 1 : 3]);
  // an arrow cut in it, pointing on into the chamber
  for (let k = -3; k <= 3; k++) X.px(g, x + k, y, GOLD[on ? 0 : 2]);
  for (const [dx, dy] of [[2, -1], [2, 1], [1, -2], [1, 2]]) X.px(g, x + dx, y + dy, GOLD[2]);
  X.ellipse(g, x, y, r + 3 + p, (r + 3 + p) * FY, GOLD[2], on ? 0.3 : 0.1 + 0.08 * p);
  light(x, y - 2, 28, GOLD[2], on ? 0.5 : 0.2 + 0.12 * p);
  const label = LINES.readyStone.toUpperCase(), tw = label.length * 4 - 1;
  X.text(o, label, x - Math.floor(tw / 2), y - 14 - Math.round(p), on ? GOLD[1] : '#cfc9e6', '#0a0810');
}

/** Beat 1: a round stone set in the floor with a rune that glows until someone steps on it. */
function floorStone(g: Ctx, light: LightFn, x: number, y: number, done: boolean, t: number, k: number): void {
  x = Math.round(x); y = Math.round(y);
  const r = P.stoneR * PPU * 0.85, p = 0.5 + 0.5 * Math.sin(t * 3 + k * 2);
  X.ellipse(g, x, y + 1, r + 1, (r + 1) * FY, STONE.deep);
  X.ellipse(g, x, y, r, r * FY, done ? STONE.side : STONE.main);
  X.ellipse(g, x - 1, y - 1, r - 2, (r - 2) * FY, done ? STONE.main : STONE.top);
  const R = done ? ['#9aa0ae', '#7a8090', '#5a6070', '#454a58', '#30343e'] : RUNE;
  // the rune: a ring and a cross, cut into the stone
  X.ring(g, x, y, r - 3, (r - 3) * FY, R[3]);
  X.rect(g, x - 3, y, 7, 1, R[done ? 3 : 1]); X.rect(g, x, y - 2, 1, 5, R[done ? 3 : 1]);
  if (!done) {
    X.ellipse(g, x, y, r + 3 + p, (r + 3 + p) * FY, R[2], 0.12 + 0.1 * p);
    for (let q = 0; q < 6; q++) { const a = t * 0.8 + (q / 6) * TAU; X.px(g, x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2) * FY, R[1]); }
    light(x, y - 2, 30, R[3], 0.35 + 0.15 * p);
  }
}

/** Beat 3: a chalk ring painted on the floor; it glows gold once the sack sits in it. */
function chalkRing(g: Ctx, light: LightFn, x: number, y: number, r: number, inside: boolean, t: number): void {
  x = Math.round(x); y = Math.round(y);
  const col = inside ? GOLD[1] : '#e8dcb0';
  X.ellipse(g, x, y, r, r * FY, inside ? GOLD[3] : '#e8dcb0', inside ? 0.25 : 0.08);
  for (let k = 0; k < 20; k++) { const a0 = (k / 20) * TAU + t * 0.15; X.ring(g, x, y, r, r * FY, col, 0.85, a0, a0 + TAU / 34); }
  X.ring(g, x, y, r - 2, (r - 2) * FY, col, 0.35);
  // an arrow chalked in front of it, pointing the way to shove
  for (let k = 0; k < 3; k++) X.rect(g, x - r - 14 + k * 4, y, 2, 1, col);
  X.rect(g, x - r - 3, y - 1, 1, 3, col);
  if (inside) light(x, y, 50, GOLD[2], 0.5);
}

/** The "I know this" stone: a carved slab by the entry with a check-mark rune; standing on it fills its ring. */
function skipStone(g: Ctx, o: Ctx, light: LightFn, w: World, t: number): void {
  const st = w.tut!.state, x = Math.round(sx(P.skip[0], P.skip[1])), y = Math.round(sy(P.skip[0], P.skip[1])), r = P.skipR * PPU, b = w.bodies;
  const p = 0.5 + 0.5 * Math.sin(t * 2.2);
  X.ellipse(g, x + 1, y + 2, r + 1, (r + 1) * FY, 'rgba(8,6,16,0.5)');
  X.ellipse(g, x, y + 1, r, r * FY, STONE.dark);
  X.ellipse(g, x, y, r - 1, (r - 1) * FY, STONE.main);
  X.ellipse(g, x - 1, y - 1, r - 3, (r - 3) * FY, STONE.top);
  // the check mark, cut in and glowing gold
  const mark: [number, number][] = [[-5, 0], [-4, 1], [-3, 2], [-2, 3], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2], [4, -3], [5, -4]];
  for (const [dx, dy] of mark) { X.rect(g, x + dx, y + dy, 1, 2, GOLD[3]); X.px(g, x + dx, y + dy, GOLD[1]); }
  light(x, y, 26, GOLD[2], 0.2 + 0.12 * p);
  // who stands on it, and how full the ring is
  let on = 0, n = 0;
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && b.kind[s] === KIND.wizard) { n++; if (Math.hypot(b.x[s] - P.skip[0], b.y[s] - P.skip[1]) < P.skipR) on++; }
  const f = clamp(st[TS.skip] / T(P.skipTime), 0, 1);
  X.ring(g, x, y, r + 2, (r + 2) * FY, '#1a1726', 0.8);
  if (f > 0) { X.ring(g, x, y, r + 2, (r + 2) * FY, GOLD[1], 1, -Math.PI / 2, -Math.PI / 2 + f * TAU); X.ring(g, x, y, r + 3, (r + 3) * FY, GOLD[2], 1, -Math.PI / 2, -Math.PI / 2 + f * TAU); }
  const label = LINES.skipStone.toUpperCase() + (n > 1 && on ? ` ${on}/${n}` : ''), tw = label.length * 4 - 1;
  X.text(o, label, x - Math.floor(tw / 2), y - 16 - Math.round(p), on ? GOLD[1] : '#cfc9e6', '#0a0810');
}

/**
 * A standing stone arch facing the camera: two pillars and a lintel. Dark between the pillars until
 * it's lit; lit, the doorway shimmers gold and throws light. `fill` (0..1) rings its threshold while
 * someone stands in it (the end card).
 */
function arch(piece: PieceFn, o: Ctx, light: LightFn, x: number, y: number, lit: boolean, t: number, seed: number, fill: number, label: string): void {
  x = Math.round(x); y = Math.round(y);
  const H = 30, half = 12;
  const c = piece(x - half - 6, y - H - 12, half * 2 + 13, H + 18, y - 6);
  // the shadow and the threshold step
  X.ellipse(c, x + 3, y + 2, half + 6, 4, 'rgba(8,6,16,0.45)');
  X.rect(c, x - half - 2, y - 2, half * 2 + 5, 4, STONE.dark); X.rect(c, x - half - 1, y - 2, half * 2 + 3, 1, STONE.top);
  // the doorway
  const doorW = half * 2 - 7, dx0 = x - half + 4, dy0 = y - H + 4;
  if (lit) {
    for (let k = 0; k < doorW; k++) for (let j = 0; j < H - 6; j += 1) {
      const wave = Math.sin((k * 0.7 + t * 5 + seed) + j * 0.25) * 0.5 + 0.5, up = j / (H - 6);
      const col = wave > 0.85 ? GOLD[0] : wave > 0.55 ? GOLD[1] : up > 0.5 ? GOLD[2] : GOLD[3];
      if ((k + j + Math.floor(t * 12)) % 3 === 0 || wave > 0.55) X.px(c, dx0 + k, dy0 + j, col);
    }
    light(x, y - H / 2, 60, GOLD[2], 0.7);
    // motes drifting up out of it
    for (let k = 0; k < 6; k++) { const q = mod(t * 0.5 + k / 6, 1); X.px(o, x - half + 4 + ((k * 7 + seed * 3) % doorW), y - 4 - q * (H + 10), q > 0.7 ? GOLD[2] : GOLD[1]); }
  } else {
    X.rect(c, dx0, dy0, doorW, H - 6, '#141220');
    X.rect(c, dx0, dy0, doorW, 1, '#221e30');
  }
  // the pillars
  for (const px of [x - half - 1, x + half - 4]) {
    X.rect(c, px - 1, y - H - 1, 7, H + 1, STONE.deep);
    X.rect(c, px, y - H, 5, H, STONE.main); X.rect(c, px, y - H, 2, H, STONE.top); X.rect(c, px + 4, y - H, 1, H, STONE.side);
    for (let k = 6; k < H; k += 7) X.rect(c, px, y - H + k, 5, 1, STONE.dark); // the courses
  }
  // the lintel, with a rune cut in its face
  X.rect(c, x - half - 3, y - H - 6, half * 2 + 7, 7, STONE.deep);
  X.rect(c, x - half - 2, y - H - 5, half * 2 + 5, 5, STONE.main); X.rect(c, x - half - 2, y - H - 5, half * 2 + 5, 1, STONE.light);
  const rc = lit ? GOLD[1] : '#4a4560';
  X.rect(c, x - 2, y - H - 3, 5, 1, rc); X.rect(c, x, y - H - 4, 1, 3, rc);
  if (fill > 0) {
    X.ring(o, x, y, half + 4, (half + 4) * FY, GOLD[1], 1, -Math.PI / 2, -Math.PI / 2 + fill * TAU);
    X.ring(o, x, y, half + 5, (half + 5) * FY, GOLD[2], 1, -Math.PI / 2, -Math.PI / 2 + fill * TAU);
  }
  if (label) { const s = label.toUpperCase(), tw = s.length * 4 - 1; X.text(o, s, x - Math.floor(tw / 2), y - H - 15, lit ? GOLD[1] : '#cfc9e6', '#0a0810'); }
}

// ---- the HUD ----------------------------------------------------------------------------------------

const HW = 440, HH = 64, BW = 300, BH = 30;

/** The calm's line under the prompt, if any: before enemies come, as they're about to, and just after. */
function cueFor(w: World): { text: string; urgent: boolean } | null {
  const st = w.tut!.state, beat = st[TS.beat];
  if (!wavesOf(beat) || st[TS.lit] || st[TS.fade]) return null;
  if (st[TS.go] === 0) {
    const left = T(calmOf(beat, st[TS.wave])) - st[TS.calm], secs = Math.max(1, Math.ceil(left / T(1)));
    if (left <= T(3)) return { text: LINES.coming(secs), urgent: true };
    return { text: beat === TUT_BEAT.test ? LINES.nextWave(secs) : LINES.calm, urgent: false };
  }
  return st[TS.go] - 1 < T(1.5) ? { text: LINES.here, urgent: true } : null;
}
/** Words that fit a line of `max` characters, greedily. */
function wrap(str: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of str.split(' ')) {
    if (line && line.length + 1 + word.length > max) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The prompt line, the beat's big title as it begins, and the fade between beats. */
export class TutorialHud {
  readonly sprite: Sprite;
  readonly banner: Sprite;
  readonly fade = new Graphics();
  /** Called once when the end card's arch has been chosen (main.ts switches rooms). */
  onExit: ((room: string) => void) | null = null;
  private c = X.canvas(HW, HH);
  private tex: Texture;
  private bc = X.canvas(BW, BH);
  private btex: Texture;
  private beat = -1;
  private beatAt = -9;
  private exited = false;

  constructor(public seat = 0) {
    this.tex = Texture.from(this.c.c); this.tex.source.scaleMode = 'nearest'; this.sprite = new Sprite(this.tex);
    this.btex = Texture.from(this.bc.c); this.btex.source.scaleMode = 'nearest'; this.banner = new Sprite(this.btex);
    this.sprite.visible = this.banner.visible = this.fade.visible = false;
  }

  /** A new world (the menu's restart, a room switch): greet whatever beat it starts on, even the one showing now. */
  restart(): void { this.beat = -1; this.exited = false; }

  /** ct: real time (s), for the banner and the fade-in; viewW / viewH in HUD px. */
  draw(w: World, ct: number, viewW: number, viewH: number): void {
    const tut = w.tut;
    this.sprite.visible = this.banner.visible = this.fade.visible = !!tut;
    if (!tut) { this.beat = -1; return; } // coming back later greets the beat again
    const st = tut.state, beat = st[TS.beat];
    if (beat !== this.beat) { this.beat = beat; this.beatAt = ct; }
    if (!st[TS.exit]) this.exited = false;
    else if (!this.exited) { this.exited = true; const to = EXITS[st[TS.exit] - 1].room; queueMicrotask(() => this.onExit?.(to)); }

    // the fade: out while walking through the arch, back in as the next beat begins
    const out = st[TS.fade] > 0 ? 1 - st[TS.fade] / T(TUT_TIMES.fade) : 0, back = 1 - clamp((ct - this.beatAt) / 0.35, 0, 1);
    const a = Math.max(out, back);
    this.fade.clear();
    if (a > 0.01) this.fade.rect(0, 0, viewW, viewH).fill({ color: 0x0a0810, alpha: a });

    // the prompt: step and title on the first row, the line (and counter) under it
    const c = this.c.x;
    c.clearRect(0, 0, HW, HH); c._fs = null;
    const text = BEAT_TEXT[beat], step = TUT_ORDER.indexOf(beat) + 1, steps = TUT_ORDER.length - 1;
    const head = (beat === TUT_END ? LINES.endHead : LINES.step(step, steps, text?.title ?? '')).toUpperCase();
    const counter = beat === TUT_END ? '' : counterFor(w).toUpperCase();
    const max = Math.floor((Math.min(HW, viewW - 8) - 12) / 4);
    const lines = promptFor(w, this.seat).flatMap((l) => wrap(l.toUpperCase(), max));
    const cue = cueFor(w);
    const cues = cue ? wrap(cue.text.toUpperCase(), max) : [];
    const wd = Math.min(HW - 2, Math.max(head.length + (counter ? counter.length + 3 : 0), ...lines.map((l) => l.length), ...cues.map((l) => l.length)) * 4 + 12);
    const h = 12 + (lines.length + cues.length) * 7 + 2 + (cues.length ? 2 : 0), x0 = Math.round(HW / 2 - wd / 2);
    X.rect(c, x0 - 1, 0, wd + 2, h + 1, '#0a0810'); X.rect(c, x0, 1, wd, h - 1, '#1a1726'); X.rect(c, x0, 1, wd, 1, '#3a3450');
    const done = st[TS.lit] > 0;
    X.text(c, head, x0 + 6, 4, done ? '#8ef07e' : '#ffd860');
    if (counter) X.text(c, counter, x0 + wd - 6 - (counter.length * 4 - 1), 4, '#cfc9e6');
    const flash = done && Math.floor(ct * 3) % 2 === 0;
    lines.forEach((l, k) => X.text(c, l, Math.round(HW / 2 - (l.length * 4 - 1) / 2), 12 + k * 7, flash ? '#ffffff' : '#e8e4f0'));
    // the calm's cue under the prompt: step on the stone / coming in 3... / here they come
    const urgent = cue?.urgent && Math.floor(ct * 4) % 2 === 0;
    cues.forEach((l, k) => X.text(c, l, Math.round(HW / 2 - (l.length * 4 - 1) / 2), 14 + (lines.length + k) * 7, cue!.urgent ? (urgent ? '#ffffff' : '#ff8a6a') : '#a8a0c0'));
    this.tex.source.update();
    this.sprite.position.set(Math.round(viewW / 2 - HW / 2), 3);

    // the big title as a beat begins
    const age = ct - this.beatAt, show = age < 2.4 && st[TS.fade] === 0;
    this.banner.visible = show;
    if (show) {
      const b = this.bc.x, title = (beat === TUT_END ? LINES.endBanner : (text?.title ?? '').split(':')[0]).toUpperCase();
      b.clearRect(0, 0, BW, BH); b._fs = null;
      const k = 2, tw = (title.length * 4 - 1) * k, rise = Math.round(easeOut(Math.min(1, age * 3)) * 4);
      X.text(b, title, Math.round(BW / 2 - tw / 2), 12 - rise, age > 2 && Math.floor(age * 10) % 2 ? '#8a8498' : '#ffd860', '#0a0810', k);
      this.btex.source.update();
      this.banner.position.set(Math.round(viewW / 2 - BW / 2), Math.round(viewH * 0.3));
    }
  }
}
