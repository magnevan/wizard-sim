/**
 * Enemy deaths, ported from the Spell VFX gallery (tools/spell-vfx/vfx-deaths.js), with the
 * user's verdicts on its cards: one base death per enemy plus an element overlay, and two
 * bespoke deaths that animate the body's own pixels.
 *
 *   base       knocked back along the blow, topples, lies a beat, a cartoon poof, the dropped weapon
 *              (water, life, shield, sigil and unknown kills; earth that is neither boulder nor quake)
 *   fire       stays on its feet, flames hug its silhouette (no combustion burst), chars, crumbles to ash
 *   cold       chilled stiff: tips over like a plank, cracks on landing, puffs away in snow
 *   lightning  the skeleton flash, then a sooty, smoking topple with sparks crawling over it
 *              (wet changes nothing: the world's own surge through the puddle shows that)
 *   earth      the boulder (earth missiles only): flung along the throw, spinning, lands flat
 *   quake      earth by burst or wave: bounced straight up, tumbles, lands crumpled in cracked ground
 *   steam      the scald mix: a steady red flush, kettle jets from the ears, slumps, a soot cloud
 *   shatter    frozen at death (any blow): the body-shaped ice and the body break into shards
 *   arcane     v3 (the user: v2's spread too big, too few pieces, too dramatic): the magic that
 *              binds the body tears along seams into many small pieces that drift a little apart
 *              and unravel into nothing
 *
 * Only the goblin's deaths were rated. The other archetypes (brute, archer, imp, grabber,
 * shieldbearer) play the same set on their own rig, with sizes scaled to the body (S below),
 * until they get deaths of their own.
 *
 * Each death paints into its own small canvas, a sprite depth-sorted with the actors; ground
 * marks go to the field's ground canvas and effects to its over canvas. Deaths are cosmetic and
 * run on real time (ct), from the first frame drawn after the death event; the sim never sees
 * them. Under rollback the view only hears events from ticks it has not shown yet, and add()
 * drops a second death for the same body, so a death never plays twice.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { EL as ELID, HIT_KIND, STATUS_BIT } from '@wizard-sim/sim';
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import { CELL_H, CELL_W, FEET_X, FEET_Y, HEIGHT, WIDTH, paint, type Anchors, type RigState } from './rigs';
import { FY, TAU, clamp, easeOut, emit, lerp, mod, rand, seg, smooth } from './util';
import type { LightFn } from './vfx';

const EL = X.EL;
const AMBIENT = 0xe4e8ff;
/** How long a death lasts (s), and the fade of what it leaves on the ground at the end. */
const LIFE = 3.2, FADE = 0.6;
/** At most this many deaths at once; past it the oldest gives way. */
const MAX = 32;
/** A death's canvas, and where the body's feet sit in it. */
const SW = 192, SH = 128, SX = 96, SY = 88;

/** A rig state placed in the field: feet at (x, y) field px, lifted z px. */
export interface Pose extends RigState { x: number; y: number; z: number }
/** What the death event says (see tickDeaths in the sim). */
export interface DeathInfo { el: number; mix: number; shape: number; status: number; dirX: number; dirY: number; overkill: number; arch: number }

type Kind = 'base' | 'fire' | 'cold' | 'lightning' | 'earth' | 'quake' | 'steam' | 'shatter' | 'arcane';
/** Which death, first match wins. */
export function pickDeath(e: DeathInfo): Kind {
  if (e.status & STATUS_BIT.frozen) return 'shatter';
  if (e.mix === 1) return 'steam';
  if (e.mix === 2) return 'cold'; // the freeze mix that didn't freeze it: a chilled death
  if (e.el === ELID.earth) return e.shape === HIT_KIND.missile ? 'earth' : e.shape === HIT_KIND.burst || e.shape === HIT_KIND.wave ? 'quake' : 'base';
  if (e.el === ELID.fire) return 'fire';
  if (e.el === ELID.cold) return 'cold';
  if (e.el === ELID.lightning) return 'lightning';
  if (e.el === ELID.arcane) return 'arcane';
  return 'base'; // water (the user: "probably just base"), life, shield, sigil, unknown
}

/** A captured body pixel (field px). Chunks and pieces add their own marks. */
interface Px { x: number; y: number; col: string; dark: boolean; i: number; top?: boolean; ice?: string; seam?: boolean; edge?: boolean; rim?: boolean; d?: number }
type Stand = [number, (c: Ctx) => void];
type Light = [number, number, number, string, number];

interface Slot { c: HTMLCanvasElement; x: Ctx; tex: Texture; spr: Sprite }
interface Death {
  who: number; tick: number;
  /** Real time of the first frame drawn (NaN until then). */
  t0: number;
  g0: Pose; dir: Pt; ov: number; kind: Kind;
  /** Body size against the goblin's, for offsets and sizes. */
  S: number;
  slot: Slot;
  cache: Map<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Small shared pieces: hop and flash curves, the cartoon poof, the dropped weapon, an impact star.
const hop = (t: number, t0: number, h = 8, dur = 0.4): number => { const e = (t - t0) / dur; return e > 0 && e < 1 ? h * 4 * e * (1 - e) : 0; };
const flashOf = (t: number, t0: number): number => (t >= t0 && t < t0 + 0.25 ? 1 - (t - t0) / 0.25 : 0);
/** The gallery's 0..1 hit flash as the rig's dither level. */
const flashLvl = (f: number): number => (f > 0.55 ? 16 : f > 0.25 ? 9 : f > 0.15 ? 4 : f > 0.02 ? 2 : 0);
/** A dithered fade test for marks and particles. */
const keep = (x: number, y: number, a: number): boolean => a >= 1 || a > X.bay(Math.round(x), Math.round(y));
const rgba = (r: number, g: number, b: number, a: number): string => `rgba(${r},${g},${b},${a.toFixed(2)})`;

const POOF: Ramp = ['#f6f2fc', '#cfc8e0', '#8f88a8'];
const SNOW: Ramp = ['#ffffff', '#cdeffc', '#7ab4d8'];
const SMOKE: Ramp = ['#a8a2b4', '#6e6878', '#3e3846'];
const SOOT: Ramp = ['#6a6470', '#423c48', '#1e1a24'];
const DIRT: Ramp = ['#c8a878', '#9a7a54', '#6a5038', '#3a2a1c'];

function poof(c: Ctx, x: number, y: number, e: number, P: Ramp = POOF, R = 11, seed = 0, S = 1): void {
  if (e < 0 || e > 1) return;
  if (e < 0.08) X.ellipse(c, x, y, (6 + e * 40) * S, (6 + e * 40) * 0.8 * S, P[0]);
  const n = 9, r = (3 + R * easeOut(e)) * S, pr = 4.4 * (1 - e * 0.65) * Math.sqrt(S), a = 1 - seg(e, 0.5, 1);
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU + rand(i, seed) * 0.4, rr = r * (0.7 + rand(i, seed, 2) * 0.45), px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.7 - e * 5;
    K.puff(c, px + 0.8, py + 1, pr, P[2], a); K.puff(c, px, py, pr * 0.85, P[1], a); if (pr > 2.2) K.puff(c, px - 0.8, py - 0.9, pr * 0.45, P[0], a);
  }
  K.puff(c, x, y - e * 4, 6.5 * (1 - e * 0.8) * S, P[1], 1 - seg(e, 0.25, 0.65));
  K.puff(c, x - 1, y - 1 - e * 4, 4 * (1 - e * 0.8) * S, P[0], 1 - seg(e, 0.2, 0.55));
  // cartoon sparkles thrown up and out
  if (e < 0.75) for (let i = 0; i < 4; i++) {
    const an = -Math.PI / 2 + (i - 1.5) * 0.75, d = (7 + easeOut(e) * 15) * S, sx = x + Math.cos(an) * d, sy = y + Math.sin(an) * d * 0.8 - 2;
    X.px(c, sx, sy, '#ffffff'); if (e < 0.45) { X.px(c, sx - 1, sy, P[1]); X.px(c, sx + 1, sy, P[1]); X.px(c, sx, sy - 1, P[1]); X.px(c, sx, sy + 1, P[1]); }
  }
}
/**
 * The weapon left lying where it fell: the goblin's club (the rated look; outlined, a shade lighter
 * than the rig's so it reads on the floor), and in the same style the dagger, the spear, the bow
 * and the shield. Imps, grabbers and brutes fight bare-handed and drop nothing.
 */
function weapon(c: Ctx, g: RigState, x: number, y: number, side: number, col?: [string, string]): void {
  const O = '#120e1a';
  if (g.kind === 'archer') { X.lines(c, [[x - side * 5, y - 1], [x, y + 1], [x + side * 5, y - 1]], O, 2); X.lines(c, [[x - side * 5, y - 1], [x, y + 1], [x + side * 5, y - 1]], col?.[0] ?? '#b8844a'); X.line(c, x - side * 5, y - 1, x + side * 5, y - 1, '#d0d0dc'); return; }
  if (g.kind !== 'goblin') return;
  if (g.variant === 5) { X.rect(c, x - 4, y - 2, 9, 4, O); X.rect(c, x - 3, y - 1, 7, 2, col?.[0] ?? '#6a4a2c'); X.px(c, x, y - 1, '#c8ccd8'); return; }
  if (g.variant === 1) { X.line(c, x - side * 3, y + 1, x + side * 3, y + 1, O, 2); X.line(c, x - side * 3, y, x, y, col?.[0] ?? '#7a5234'); X.line(c, x + side, y, x + side * 3, y, '#c8ccd8'); return; }
  if (g.variant === 2) { X.line(c, x - side * 7, y + 1, x + side * 6, y + 1, O, 2); X.line(c, x - side * 7, y, x + side * 4, y, col?.[0] ?? '#8a6a48'); X.rect(c, x + side * 5 - 1, y - 1, 2, 2, '#c8ccd8'); return; }
  if (g.variant !== 0) return;
  const cl = col?.[0] ?? '#a8743e', hi = col?.[1] ?? '#e0aa6a';
  X.line(c, x - side * 5, y + 1, x + side * 2, y + 1, O, 2); X.line(c, x - side * 5, y, x + side * 2, y, cl);
  X.rect(c, x + side * 2 - 2, y - 3, 5, 5, O); X.rect(c, x + side * 2 - 1, y - 2, 3, 3, cl); X.px(c, x + side * 2 - 1, y - 2, hi); X.px(c, x - side * 4, y, hi);
}
function star(c: Ctx, p: Pt, e: number, col = '#ffffff', R = 7): void {
  if (e < 0 || e > 0.16) return;
  const k = 1 - e / 0.16, r = 3 + R * (1 - k);
  for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + 0.3; X.line(c, p[0] + Math.cos(an) * 2, p[1] + Math.sin(an) * 2, p[0] + Math.cos(an) * r, p[1] + Math.sin(an) * r, i % 2 ? col : '#ffffff'); }
  if (k > 0.5) X.rect(c, p[0] - 1, p[1] - 1, 3, 3, '#ffffff');
}

// ---------------------------------------------------------------------------------------------
// Captures: a pose painted once into a scratch cell, kept as a pixel list in field px, so a death
// can animate the body itself (tip it rigidly, shatter it, crumble it, tear it apart). Per death.
const CAP = X.canvas(CELL_W, CELL_H);
function capture(d: Death, key: string, p: Pose): Px[] {
  const hit = d.cache.get(key) as Px[] | undefined;
  if (hit) return hit;
  const c = CAP.x;
  c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, CELL_W, CELL_H); c._fs = null;
  paint({ ...p, alpha: 1 }, c, FEET_X, FEET_Y);
  const data = c.getImageData(0, 0, CELL_W, CELL_H).data, out: Px[] = [];
  const x0 = Math.round(p.x) - FEET_X, y0 = Math.round(p.y - p.z) - FEET_Y;
  for (let j = 0; j < CELL_H; j++) for (let i = 0; i < CELL_W; i++) {
    const k = (j * CELL_W + i) * 4; if (data[k + 3] < 128) continue;
    out.push({ x: x0 + i, y: y0 + j, col: X.toHex(data[k], data[k + 1], data[k + 2]), dark: data[k] + data[k + 1] + data[k + 2] < 90, i: out.length });
  }
  d.cache.set(key, out);
  return out;
}
/** Body anchors when the rig isn't drawn as itself this frame (captured pixels instead). */
const anchorsAt = (p: Pose, S: number): Anchors => ({
  chest: [p.x, p.y - p.z - 9 * S], head: [p.x, p.y - p.z - 14 * S], tip: [p.x + 4, p.y - p.z - 20 * S], charge: [p.x + 4, p.y - p.z - 26 * S], hands: [],
});

/**
 * Captured pixels drawn rotated by ang about a pivot (the feet), sampling back from each destination
 * pixel so the turned body has no holes. off moves the pivot on screen; full samples below the pivot
 * too, for a spin about the middle of the body rather than a tip about the feet.
 */
function rigid(c: Ctx, px: Px[], pv: Pt, ang: number, flash: number, alpha: number, off: Pt = [0, 0], full = false): void {
  const M = new Map<number, Px>(); let r = 0;
  for (const p of px) { M.set((p.x - pv[0]) * 256 + (p.y - pv[1]), p); r = Math.max(r, Math.hypot(p.x - pv[0], p.y - pv[1])); }
  const cs = Math.cos(ang), sn = Math.sin(ang), R = Math.ceil(r) + 1;
  for (let dy = -R; dy <= (full ? R : 1); dy++) for (let dx = -R; dx <= R; dx++) {
    const sx = Math.round(dx * cs + dy * sn), sy = Math.round(-dx * sn + dy * cs), p = M.get(sx * 256 + sy);
    if (!p) continue;
    const x = Math.round(pv[0] + off[0]) + dx, y = Math.round(pv[1] + off[1]) + dy; if (!keep(x, y, alpha)) continue;
    X.px(c, x, y, flash > 0.3 ? '#ffffff' : p.col);
  }
}

// ---------------------------------------------------------------------------------------------
// The base death. Motion profiles: topple (default), plank (stiff), none (stays upright),
// fling (thrown along the blow, bounces, can flatten), slide, bounce (up off its feet), slump.
interface Motion {
  fall?: 'topple' | 'plank' | 'none' | 'fling' | 'slide' | 'bounce' | 'slump';
  exitAt?: number; exit?: 'poof' | 'crumble'; club?: boolean; hitCol?: string; exitCols?: Ramp; exitR?: number;
  clubCol?: [string, string]; clubStill?: boolean; overkill?: number;
  fling?: number; h1?: number; flatten?: boolean; t1?: number; air?: number; drift?: number; spin?: number; slumpAt?: number; slide?: number;
}
interface Base { g: Pose; side: number; exitAt: number; gone: number; mid: Pt; fall: string; rot: number | null; g0: Pose; o: Motion }

function baseDeath(g: Pose, td: number, dir: Pt, o: Motion, S: number): Base {
  const ov = o.overkill ?? 0, fall = o.fall ?? 'topple';
  const side = Math.abs(dir[0]) > 0.2 ? Math.sign(dir[0]) : (g.seed & 1 ? 1 : -1);
  let kb = 0, z = 0, dead = 0, sq = 0, face = g.face, exitAt = o.exitAt ?? -1, rot: number | null = null;
  if (fall === 'topple') {
    kb = (5 + 8 * ov) * easeOut(seg(td, 0, 0.35));
    z = hop(td, 0, 3 + 4 * ov, 0.32) + hop(td, 0.42, 1.5, 0.16);
    dead = 0.9 * smooth(seg(td, 0.05, 0.38));
    sq = td > 0.38 && td < 0.52 ? 0.6 * (1 - seg(td, 0.38, 0.52)) : 0;
    if (exitAt < 0) exitAt = 1.1;
  } else if (fall === 'plank') {
    // stiff: a wobble on the spot, a slow tilt that speeds up, a hard slam with no give. The rig's
    // topple is a shear and squash (a slump), so a stiff fall turns the captured pixels about the
    // feet instead (rigid()): rot is that angle
    const k = seg(td, 0.16, 0.62);
    rot = td < 0.16 ? 0.12 * Math.sin(td * 45) * (1 - td / 0.16) : (Math.PI / 2) * k * k * k;
    kb = 1.5 * easeOut(seg(td, 0, 0.12));
    z = hop(td, 0.62, 2, 0.14);
    if (exitAt < 0) exitAt = 1.25;
  } else if (fall === 'none') {
    kb = 3 * easeOut(seg(td, 0, 0.2)); z = hop(td, 0, 2, 0.22);
    if (exitAt < 0) exitAt = 0.9;
  } else if (fall === 'fling') {
    const F = o.fling ?? 40, T1 = o.t1 ?? 0.46, T2 = 0.24, T3 = T1 + T2, H1 = o.h1 ?? 15;
    const p = td < T1 ? 0.7 * (td / T1) : td < T3 ? 0.7 + 0.24 * ((td - T1) / T2) : 0.94 + 0.06 * easeOut(seg(td, T3, T3 + 0.25));
    kb = F * p;
    z = hop(td, 0, H1, T1) + hop(td, T1, H1 * 0.3, T2);
    dead = 0.9 * smooth(seg(td, 0.04, 0.25));
    face = g.face + Math.min(td, T3) * 13;
    if (o.flatten) { const f = seg(td, T3, T3 + 0.05); sq = 2.7 * f + (f > 0 && f < 1 ? 0.5 : 0); }
    else sq = td > T1 && td < T1 + 0.1 ? 0.6 : 0;
    if (exitAt < 0) exitAt = 1.35;
  } else if (fall === 'slide') {
    const Sl = o.slide ?? 40;
    dead = 0.9 * smooth(seg(td, 0, 0.18));
    kb = Sl * easeOut(seg(td, 0, 1.15));
    z = hop(td, 0, 5, 0.3);
    face = g.face + 5 * easeOut(seg(td, 0, 1.15));
    if (exitAt < 0) exitAt = 1.4;
  } else if (fall === 'bounce') {
    // bounced straight up off its feet by the ground (quake): it tumbles in the air (a rigid spin of
    // the captured pixels about the middle of the body), lands, and lies crumpled
    const T0 = 0.05, T1 = T0 + (o.air ?? 0.56), Hh = o.h1 ?? 18;
    kb = (o.drift ?? 2) * seg(td, 0, T1);
    if (td < T1) {
      z = hop(td, T0, Hh, T1 - T0);
      if (td > T0) rot = (o.spin ?? TAU + Math.PI / 2) * smooth(seg(td, T0, T1));
    } else {
      // the landing: a small bounce, then the rig's slump (a crumple, not a plank)
      z = hop(td, T1, 2.5, 0.16);
      dead = 0.9; sq = td < T1 + 0.08 ? 0.9 : td < T1 + 0.24 ? 0.35 * (1 - seg(td, T1 + 0.16, T1 + 0.24)) : 0;
    }
    if (exitAt < 0) exitAt = 1.5;
  } else if (fall === 'slump') {
    // sinks where it stands in one smooth movement, no hop, no bounce, no shake
    const a = o.slumpAt ?? 0.5;
    dead = 0.9 * smooth(seg(td, a, a + 0.35));
    if (exitAt < 0) exitAt = 1.2;
  }
  const x = g.x + dir[0] * kb, y = g.y + dir[1] * kb * FY;
  const gone = seg(td, exitAt + 0.04, exitAt + 0.12);
  const out: Pose = { ...g, x, y, z, dead, sq, face, fallSide: side, flash: flashOf(td, 0), flashCol: o.hitCol ?? '#ffffff', spd: 0, alpha: g.alpha * (1 - gone) };
  // where the body is (a lying body sits off to the fall side, low), for poofs and marks
  let lie = dead / 0.9; if (rot != null) lie = fall === 'bounce' ? 0.5 : clamp(rot / (Math.PI / 2), 0, 1);
  const mid: Pt = [x + side * (rot != null ? 6 : 4) * lie * S, y - z - lerp(7, 3, lie) * S + (sq > 1 ? 1.5 : 0)];
  return { g: out, side, exitAt, gone, mid, fall, rot, g0: g, o };
}

// ---------------------------------------------------------------------------------------------
// Overlays: what each element adds to the base death.
interface Ctx2 { d: Death; m: Base; td: number; fade: number; A: Anchors }
interface Overlay {
  motion: Motion;
  motionFor?: (o: Motion) => Motion;
  /** A patch for the rig's state. */
  body?: (td: number) => Partial<RigState>;
  /** Over the actors. */
  fx?: (c: Ctx, q: Ctx2) => void;
  /** The lingering mark on the floor. */
  ground?: (c: Ctx, q: Ctx2) => void;
  lights?: (q: Ctx2) => Light[];
}

// Flames that follow the body's silhouette (fire v2): tongues rise off every sky-facing edge pixel
// (head, ears, shoulders, arms) and short licks curl off its sides, so the fire is the body burning,
// not a flame shape stamped over it.
interface Edges { tops: Pt[]; sides: [number, number, number][]; top: number; bot: number; cx: number }
function edgesOf(d: Death, key: string, px: Px[]): Edges {
  const hit = d.cache.get(key + '#edges') as Edges | undefined;
  if (hit) return hit;
  const S = new Set(px.map((p) => p.x * 4096 + p.y)), has = (x: number, y: number) => S.has(x * 4096 + y);
  const tops: Pt[] = [], sides: [number, number, number][] = [];
  let top = 1e9, bot = -1e9, sx = 0;
  for (const p of px) { top = Math.min(top, p.y); bot = Math.max(bot, p.y); sx += p.x; }
  for (const p of px) {
    if (!has(p.x, p.y - 1)) tops.push([p.x, p.y]);
    else if (p.y < bot - 3 && (!has(p.x - 1, p.y) || !has(p.x + 1, p.y)) && (p.x + p.y) % 2 === 0) sides.push([p.x, p.y, has(p.x - 1, p.y) ? 1 : -1]);
  }
  const out = { tops, sides, top, bot, cx: px.length ? sx / px.length : 0 };
  d.cache.set(key + '#edges', out);
  return out;
}
function silFlames(c: Ctx, ed: Edges, dx: number, dy: number, k: number, t: number): void {
  if (k < 0.04) return;
  const F = EL.fire, span = Math.max(1, ed.bot - ed.top);
  for (const [px0, py0] of ed.tops) {
    const u = (ed.bot - py0) / span, fl = 0.72 + 0.28 * Math.sin(t * 17 + px0 * 1.9) + 0.16 * Math.sin(t * 29 + px0 * 3.3);
    const h = Math.max(1, k * (1.5 + 5.5 * u * u) * fl * (0.75 + 0.5 * rand(px0, py0, 5)));
    const lean = Math.sin(t * 6 + px0 * 0.7) * 1.1 + (px0 - ed.cx) * 0.12;
    for (let r = 0; r <= h; r++) {
      const q = r / h;
      X.px(c, px0 + dx + lean * q * q, py0 + dy - r, q < 0.2 ? F[1] : q < 0.5 ? F[2] : q < 0.8 ? F[3] : F[4]);
    }
    // a tongue breaking off the tip now and then
    if (k > 0.5 && u > 0.5 && mod(px0 + Math.floor(t * 14), 4) === 0) X.px(c, px0 + dx + lean, py0 + dy - h - 2 - ((Math.floor(t * 20) + px0) & 1), F[3]);
  }
  for (const [px0, py0, s] of ed.sides) {
    const n = Math.round(k * (1 + 2 * (0.5 + 0.5 * Math.sin(t * 13 + py0 * 1.7 + px0))));
    for (let j = 0; j <= n; j++) X.px(c, px0 + dx + s * (1 + j * 0.6), py0 + dy - j, j === 0 ? F[2] : F[3]);
  }
}

const OVERLAY: Partial<Record<Kind, Overlay>> = {};

// FIRE v2: stays on its feet and burns: flames hug its silhouette (no combustion burst), it chars to
// a black silhouette with an ember outline and blinking eyes, then crumbles from the top into ash.
OVERLAY.fire = {
  motion: { fall: 'none', exitAt: 1.2, exit: 'crumble', club: false, hitCol: EL.fire[0] },
  body(td) {
    const ch = smooth(seg(td, 0.1, 0.7)), blink = ch > 0.7 && mod(td, 0.55) < 0.07;
    return { burn: 0.7 * (1 - ch), burnF: Math.floor(td * 16) % 4, tint: '#140e10', tintK: 0.9 * ch, outline: ch > 0.35 ? (Math.floor(td * 9) % 3 ? '#ff5a20' : '#c8302a') : null, eyeCol: ch > 0.5 ? '#ffffff' : null, eyesShut: blink ? 1 : 0, sq: 0.12 * ch };
  },
  fx(c, { d, m, td, A }) {
    const x = m.g0.x + d.dir[0] * 3, y = m.g0.y, S = d.S;
    const k = Math.min(seg(td, 0, 0.1), 1 - smooth(seg(td, 0.35, 0.95)));
    if (td < m.exitAt && k > 0.04) {
      const cap = baseDeath(m.g0, 0.3, d.dir, m.o, S).g;
      Object.assign(cap, OVERLAY.fire!.body!(0.3), { alpha: 1, flash: 0, burnF: 0 });
      const ed = edgesOf(d, 'burn', capture(d, 'burn', cap));
      silFlames(c, ed, m.g.x - cap.x, -m.g.z, k, td + 0.3);
    }
    // the last licks on the charred head and shoulders
    if (td > 0.6 && td < m.exitAt) { const kk = 1 - seg(td, 0.75, m.exitAt); for (let j = 0; j < 3; j++) K.tongue(c, A.head[0] - 3 * S + j * 3 * S, A.head[1] - 1 + (j === 1 ? -2 : 1), 1.1, (2 + 2 * Math.sin(td * 15 + j * 2)) * kk, Math.sin(td * 7 + j)); }
    // smoke curling off the char
    for (const p of emit(td, 7, 1.3, (i, age) => ({ x: x + (rand(i, 4) - 0.5) * 6 * S + age * 5, y: y - 19 * S - age * 16, age }), 0.5, 99)) K.puff(c, p.x, p.y, 1.5 + p.age * 3.5, '#3a3644', (1 - p.age) * 0.8 * (1 - seg(td, m.exitAt + 0.6, m.exitAt + 1.2)));
  },
  ground(c, { d, m, td, fade }) {
    const S = d.S, gx = m.g0.x + 2, gy = m.g0.y + 1;
    K.scorch(c, gx, gy, (5 + 5 * seg(td, 0, 0.7)) * S, 0.7 * fade);
    for (let i = 0; i < 8; i++) { const an = rand(i, 41) * TAU, r = Math.sqrt(rand(i, 42)) * 7 * S; if (rand(i, Math.floor(td * 5), 43) < 0.5 * fade * (1 - seg(td, 1.6, 2.4))) X.px(c, gx + Math.cos(an) * r, gy + Math.sin(an) * r * 0.45, i % 3 ? EL.fire[4] : EL.fire[3]); }
  },
  lights: ({ m, td }) => [[m.g0.x, m.g0.y - 8, 38, '#ff7020', 0.8 * Math.min(seg(td, 0, 0.1), 1 - seg(td, 0.35, 0.95))], [m.g0.x, m.g0.y - 4, 26, '#ff5a20', 0.35 * (1 - seg(td, m.exitAt + 0.5, m.exitAt + 1.5))]],
};

// COLD (chilled, not frozen): frost-stiff, it tips over like a plank, cracks on landing.
OVERLAY.cold = {
  motion: { fall: 'plank', exitAt: 1.3, exitCols: SNOW, hitCol: '#e0ffff' },
  body: () => ({ chill: 1, wet: 0 }),
  fx(c, { d, m, td, A }) {
    if (td < 0.55) K.chilled(c, A.chest, A.head, td + 5, 1, d.who, d.S > 1.4 ? 1.8 : 1);
    // the slam: a crack runs across the body, ice chips jump off it
    const e = td - 0.62, S = d.S;
    if (e > 0 && td < m.exitAt + 0.05) {
      const p = m.mid, run = seg(e, 0, 0.08);
      const pts: Pt[] = [[p[0] - 6 * S, p[1] - 1], [p[0] - 3 * S, p[1] + 1], [p[0] - 1 * S, p[1] - 1], [p[0] + 2 * S, p[1] + 1], [p[0] + 5 * S, p[1] - 1]];
      const n = Math.max(2, Math.ceil(pts.length * run));
      X.lines(c, pts.slice(0, n), '#ffffff'); if (e < 0.1) X.lines(c, pts.slice(0, n).map(([x, y]) => [x, y + 1] as Pt), '#1e5a96');
      for (let k = 0; k < 9; k++) { const an = rand(k, 51) * Math.PI + Math.PI, sp = 14 + rand(k, 52) * 22, vz = 22 + rand(k, 53) * 26, z = vz * e - 110 * e * e; if (z < -1 || e > 0.6) continue; X.px(c, p[0] + Math.cos(an) * sp * e * 0.8, p[1] + Math.sin(an) * sp * e * 0.3 - Math.max(0, z), k % 3 ? '#e0ffff' : '#ffffff'); }
      if (e < 0.35) K.gring(c, p[0], p[1] + 3, 4 + e * 30, '#e0ffff', 1 - e / 0.35, 1);
    }
  },
  ground(c, { d, m, td, fade }) {
    const k = seg(td, 0, 0.9) * fade, x = m.g0.x + m.side * 5 * d.S, y = m.g0.y + 1;
    if (k > 0.02) for (let i = 0; i < 60; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.7) * 15 * k * d.S, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * FY * 0.6; if (keep(px, py, fade)) X.px(c, px, py, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
  },
  lights: ({ m, td }) => [[m.g0.x + 4, m.g0.y, 40, '#9ff4ff', 0.45 * (1 - seg(td, m.exitAt, m.exitAt + 1))]],
};

// LIGHTNING: the skeleton flash (the rig's shock x-ray), then a sooty, smoking body with a few sparks
// crawling over it. Wet at death changes nothing here: a soaked target gets this death plus the
// world's own wet-lightning surge through the puddle.
OVERLAY.lightning = {
  motion: { fall: 'topple', exitAt: 1.15, exitCols: SMOKE, hitCol: '#efe4ff' },
  body: (td) => ({ shock: td < 0.22 ? Math.floor(td * 26) % 2 : 0, tint: '#241e24', tintK: 0.55 * seg(td, 0.18, 0.45), wet: 0, ...(td < 0.05 ? { flash: 1 } : {}) }),
  fx(c, { d, m, td }) {
    const seedF = Math.floor(td * 18), S = d.S, sparks = 1 - seg(td, 0.3, m.exitAt);
    if (td > 0.15 && td < m.exitAt) {
      // sparks: tiny bolts crawling over the body on random frames
      for (let k = 0; k < 2; k++) if (rand(seedF, k, 3) < 0.55 * sparks + 0.1) { const p: Pt = [m.mid[0] + (rand(seedF, k, 4) - 0.5) * 9 * S, m.mid[1] + (rand(seedF, k, 5) - 0.5) * 5 * S], an = rand(seedF, k, 6) * TAU; X.lines(c, K.bolt(p, [p[0] + Math.cos(an) * 5, p[1] + Math.sin(an) * 3], seedF + k, 0.6, 2), k % 2 ? '#ffffff' : EL.lightning[1]); }
      // smoke curling off the singed body
      for (const p of emit(td, 8, 1.2, (i, age) => ({ x: m.mid[0] + (rand(i, 7) - 0.5) * 7 * S + age * 4, y: m.mid[1] - 3 - age * 15, age }), 0.1, 99)) K.puff(c, p.x, p.y, 1.3 + p.age * 3, '#4a4454', (1 - p.age) * 0.85);
    }
  },
  ground(c, { d, m, td, fade }) { K.scorch(c, m.mid[0], m.g.y + 1, 5 * d.S, 0.5 * fade * seg(td, 0, 0.3)); },
  lights: ({ m, td }) => [[m.g0.x, m.g0.y - 4, 50, '#b08aff', 0.8 * (1 - seg(td, 0, 0.45))]],
};

// EARTH, the boulder (earth + missile only; the user: "very cool for a boulder" but not for a quake):
// flung along the blow, a bounce, dust and pebbles; a heavy hit lands it flat.
const B_T1 = 0.46, B_T3 = 0.7;
OVERLAY.earth = {
  motion: { fall: 'fling', fling: 44, h1: 14, flatten: true, exitAt: 1.4, hitCol: '#fff4e0' },
  motionFor: (o) => ({ ...o, fling: 30 + 26 * clamp(o.overkill ?? 0, 0, 1), flatten: (o.overkill ?? 0) > 0.6 }),
  fx(c, { d, m, td }) {
    const p0: Pt = [m.g0.x, m.g0.y], S = d.S;
    K.dust(c, p0[0], p0[1], td, 5, 7, 14 * S, '#8a7a68', 0.8);
    K.debris(c, p0[0], p0[1] - 6 * S, td, 6, 10, 46, ['#b8946a', '#76583c', '#553e2a'], 40);
    const l1 = baseDeath(m.g0, B_T1, d.dir, m.o, S).g, l2 = baseDeath(m.g0, B_T3, d.dir, m.o, S).g;
    K.dust(c, l1.x, l1.y, td - B_T1, 7, 6, 10 * S, '#8a7a68', 0.6);
    K.dust(c, l2.x, l2.y, td - B_T3, 8, 10, 18 * S, '#8a7a68', 0.9);
    if (td > B_T3 && td < B_T3 + 0.3) K.gring(c, l2.x + m.side * 3, l2.y, 4 + (td - B_T3) * 50, '#d8c0a0', 1 - (td - B_T3) / 0.3, 1);
    // pebbles skittering after the body
    for (let k = 0; k < 6; k++) { const e = td - B_T3; if (e < 0 || e > 1.2) continue; const dd = 6 + rand(k, 71) * 14, x = l2.x + m.side * (4 + dd * easeOut(Math.min(1, e * 2))), y = l2.y + (rand(k, 72) - 0.5) * 6 - hop(e, 0, 3, 0.25); X.rect(c, x, y, k % 3 ? 1 : 2, k % 3 ? 1 : 2, k % 2 ? '#977552' : '#6a5038'); }
  },
  ground(c, { d, m, td, fade }) {
    const S = d.S, l1 = baseDeath(m.g0, B_T1, d.dir, m.o, S).g, l2 = baseDeath(m.g0, B_T3, d.dir, m.o, S).g;
    if (td > B_T1) { const a = 0.55 * fade; X.line(c, l1.x - 2, l1.y + 1, l1.x + 4, l1.y + 1, rgba(40, 28, 20, a)); K.cracks(c, l1.x, l1.y + 1, 5 * S, 3, 1, rgba(26, 18, 12, a), 4); }
    if (td > B_T3) {
      const a = 0.6 * fade, x0 = l2.x + m.side * 3;
      X.ellipse(c, x0, l2.y + 1, 9 * S, 3 * S, rgba(40, 28, 20, a * 0.8)); K.cracks(c, x0, l2.y + 1, 9 * S, 4, seg(td, B_T3, B_T3 + 0.1), rgba(26, 18, 12, a), 6);
      for (let i = 0; i < 5; i++) { const x = l2.x + m.side * (8 + rand(i, 74) * 16), y = l2.y + (rand(i, 75) - 0.5) * 6; if (keep(x, y, fade)) { X.rect(c, x, y, 2, 1, '#6a6157'); X.px(c, x, y - 1, '#8a8174'); } }
    }
  },
};

// QUAKE (earth by burst or wave: quake, geyser, fault line): the ground heaves under its feet and
// bounces it straight up; it tumbles in the air, lands crumpled where it stood (not flung sideways),
// and lies in cracked ground, debris and dust.
OVERLAY.quake = {
  motion: { fall: 'bounce', h1: 18, air: 0.56, exitAt: 1.55, hitCol: '#fff4e0', exitCols: ['#efe4d0', '#bfae94', '#7a6a58'] },
  fx(c, { d, m, td }) {
    const T1 = 0.61, x0 = m.g0.x, y0 = m.g0.y, lx = m.g.x, ly = m.g.y, S = d.S;
    // the ground bursts up under it: clods and stones thrown up, dust rolling out
    K.debris(c, x0, y0 - 1, td, 11, 14, 34, [DIRT[0], DIRT[1], DIRT[2]], 70);
    K.dust(c, x0, y0, td, 12, 7, 14 * S, '#8a7a68', 0.7);
    if (td < 0.3) K.gring(c, x0, y0 + 1, 3 + td * 60, '#d8c0a0', 1 - td / 0.3, 1);
    // the landing: a thump of dust and a few pebbles hopping out
    if (td > T1) {
      const e = td - T1;
      K.dust(c, lx + m.side * 3, ly, e, 13, 9, 14 * S, '#8a7a68', 0.8);
      if (e < 0.25) K.gring(c, lx + m.side * 3, ly + 1, 4 + e * 40, '#d8c0a0', 1 - e / 0.25, 1);
      for (let k = 0; k < 5; k++) { if (e > 0.6) break; const a = (rand(k, 121) - 0.5) * 2.6 + (k % 2 ? 0 : Math.PI), dd = 4 + rand(k, 122) * 8 * easeOut(Math.min(1, e * 2.5)), x = lx + m.side * 3 + Math.cos(a) * dd, y = ly + Math.sin(a) * dd * 0.4 - hop(e, 0, 3 + rand(k, 123) * 3, 0.3); X.rect(c, x, y, k % 3 ? 1 : 2, 1, k % 2 ? DIRT[1] : DIRT[2]); }
    }
  },
  ground(c, { d, m, td, fade }) {
    const x = m.g0.x, y = m.g0.y + 1, up = hop(td, 0, 3, 0.3), S = d.S;
    // the heaved, broken ground: a dark rim, a lit mound that rises and settles, cracks
    const k = seg(td, 0, 0.12);
    if (k > 0) {
      X.ellipse(c, x, y, (5 + 3 * k) * S, (1.8 + 0.8 * k) * S, rgba(40, 28, 20, 0.55 * fade));
      // the bulge while the ground heaves, gone once it settles
      if (up > 0.4) { X.ellipse(c, x, y - up, 4 * S, 1.4 * S, DIRT[2]); X.ellipse(c, x - 1, y - up - 0.5, 2.5 * S, 0.8 * S, DIRT[1]); }
      K.cracks(c, x, y, 15 * S, 14, k, rgba(26, 18, 12, 0.85 * fade), 7);
      for (let i = 0; i < 7; i++) { const an = rand(i, 131) * TAU, r = (6 + rand(i, 132) * 10) * S, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.45; if (keep(px, py, fade * seg(td, 0.3, 0.6))) { X.rect(c, px, py, i % 3 ? 1 : 2, 1, DIRT[2]); X.px(c, px, py - 1, DIRT[1]); } }
    }
  },
  lights: ({ m, td }) => [[m.g0.x, m.g0.y, 50, '#e0c8a0', 0.7 * (1 - seg(td, 0, 0.5))]],
};

// WATER: no overlay (the user: "probably just base"). Any puddle is the spell's own.

// STEAM v2 (the scald mix): no shaking at all. A steady red flush with steam rising off it and
// whistling from its ears; it sinks where it stands in one smooth movement, a puff of steam bursts
// off it, then a soot cloud; the sooty remains lie still.
OVERLAY.steam = {
  motion: { fall: 'slump', slumpAt: 0.45, exitAt: 1.35, exitCols: SOOT, exitR: 12, hitCol: '#ffe6c8', clubCol: ['#3a3236', '#6a6268'], clubStill: true },
  body: (td) => ({ wet: 0.6 * (1 - seg(td, 0.6, 1.0)), tint: X.mix('#d0304a', '#2a2226', seg(td, 0.6, 1.1)), tintK: 0.25 + 0.35 * seg(td, 0, 0.5) + 0.2 * seg(td, 0.6, 1.1), burn: 0, chill: 0 }),
  fx(c, { d, m, td, A }) {
    const S = d.S;
    if (td < m.exitAt) {
      const h = A.head, ch = A.chest;
      for (const p of emit(td, 8, 0.9, (i, age) => ({ x: ch[0] + (rand(i, 91) - 0.5) * 10 * S + age * 3, y: ch[1] - 4 - age * 15, age }))) K.puff(c, p.x, p.y, 1 + p.age * 2.5, p.age < 0.4 ? EL.steam[1] : EL.steam[2], (1 - p.age) * 0.85);
      // the kettle: thin jets out of both ears, steady (they stop once it sinks)
      const k = Math.min(seg(td, 0.15, 0.35), 1 - seg(td, 0.55, 0.75));
      if (k > 0) for (const s of [-1, 1]) for (let j = 0; j < 6; j++) { const q = mod(td * 3 + j / 6, 1), x = h[0] + s * (4 * S + q * 7), y = h[1] - 2 - q * 9; if (q < k) X.px(c, x, y, q < 0.4 ? '#ffffff' : EL.steam[1]); }
    }
    // the steam puff as it gives out: white, rising, over the body
    if (td > 0.82 && td < 1.4) poof(c, m.mid[0], m.mid[1] - 3, (td - 0.82) / 0.55, ['#ffffff', EL.steam[1], EL.steam[2]], 7, 11, S);
  },
  ground(c, { d, m, td, fade }) {
    if (td < m.exitAt) return;
    const k = seg(td, m.exitAt, m.exitAt + 0.3) * fade, S = d.S;
    K.scorch(c, m.mid[0], m.g0.y + 1, 10 * S, 0.75 * k);
    for (let i = 0; i < 14; i++) { const an = rand(i, 95) * TAU, r = (6 + rand(i, 96) * 9) * S, x = m.mid[0] + Math.cos(an) * r, y = m.g0.y + 1 + Math.sin(an) * r * 0.45; if (keep(x, y, k)) X.px(c, x, y, '#1e1a22'); }
  },
  lights: ({ m, td }) => [[m.g0.x, m.g0.y - 6, 34, '#ffd0c0', 0.25 * (1 - seg(td, 0.8, 1.2))]],
};

// Shield, Life, Sigil: no overlay, so they get the base death as it is.

// ---------------------------------------------------------------------------------------------
// Bespoke deaths: the body is replaced by its own pixels.
interface Bespoke { stand: Stand[]; under: (c: Ctx) => void; fx: (c: Ctx) => void; lights: Light[] }

// SHATTER v2 (frozen at death, any blow): the body-shaped ice (rigs.ts frozenBody) and the body
// inside it break into shards along the ice, which fly along the blow, bounce and skitter over the
// ground, then melt.
interface Chunk { pts: Px[]; cx: number; cy: number; hh: number }
function chunksOf(d: Death, px: Px[], n: number, seed: number): Chunk[] {
  const hit = d.cache.get('chunks') as Chunk[] | undefined;
  if (hit) return hit;
  const out: Chunk[] = [];
  d.cache.set('chunks', out);
  if (!px.length) return out;
  const seeds: Pt[] = []; for (let i = 0; i < n; i++) { const p = px[Math.floor(rand(i, seed, 1) * px.length)]; seeds.push([p.x + (rand(i, seed, 2) - 0.5), p.y + (rand(i, seed, 3) - 0.5)]); }
  const ch: Chunk[] = seeds.map(() => ({ pts: [], cx: 0, cy: 0, hh: 1 }));
  for (const p of px) { let b = 0, bd = 1e9; seeds.forEach((s, i) => { const dd = (p.x - s[0]) ** 2 + ((p.y - s[1]) * 1.2) ** 2; if (dd < bd) { bd = dd; b = i; } }); ch[b].pts.push(p); }
  for (const c of ch) {
    if (!c.pts.length) continue;
    let y0 = 1e9, y1 = -1e9;
    for (const p of c.pts) { c.cx += p.x; c.cy += p.y; y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    c.cx /= c.pts.length; c.cy /= c.pts.length; c.hh = Math.max(1, (y1 - y0) / 2);
    // the captured body is already iced, so a shard keeps its colours: a white lip on top, a
    // deep-blue edge where it broke, and the dark outline turned to deep ice blue
    const has = new Set(c.pts.map((p) => p.x * 4096 + p.y)), hh = (x: number, y: number) => has.has(x * 4096 + y);
    for (const p of c.pts) {
      p.top = !hh(p.x, p.y - 1);
      const edge = !hh(p.x - 1, p.y) || !hh(p.x + 1, p.y) || !hh(p.x, p.y + 1);
      p.ice = p.dark ? '#1e5a96' : p.top ? '#ffffff' : edge ? X.mix(p.col, '#2a6aa8', 0.5) : p.col;
    }
    out.push(c);
  }
  return out;
}
function simChunk(c: Chunk, j: number, td: number, dir: Pt, gy: number): [number, number, number] {
  const sp = 25 + rand(j, 1) * 55, side = (rand(j, 2) - 0.5) * 60;
  let x = c.cx, y = gy + (rand(j, 3) - 0.5) * 2, z = gy - c.cy, vx = dir[0] * sp - dir[1] * side, vy = (dir[1] * sp + dir[0] * side) * FY * 0.7, vz = 10 + rand(j, 4) * 40 + (gy - c.cy) * 1.2;
  const dt = 1 / 90, n = Math.min(400, Math.round(td / dt)), floor = c.hh;
  for (let i = 0; i < n; i++) {
    x += vx * dt; y += vy * dt; z += vz * dt; vz -= 220 * dt;
    if (z <= floor) { z = floor; if (vz < -14) { vz = -vz * 0.38; vx *= 0.72; vy *= 0.72; } else { vz = 0; vx *= 1 - 2.6 * dt; vy *= 1 - 2.6 * dt; } }
  }
  return [x, y, z];
}
function shatter(d: Death, td: number, fade: number): Bespoke {
  const g0 = d.g0, dir = d.dir, gy = g0.y, S = d.S;
  const px = capture(d, 'ice', { ...g0, flash: 0, frozen: 1 }), ch = chunksOf(d, px, Math.round(14 * Math.sqrt(S)), 7);
  const melt = seg(td, 1.3, 2.2);
  const pos = ch.map((c, j) => simChunk(c, j, td, dir, gy));
  const stand: Stand[] = ch.map((c, j) => [pos[j][1], (cc: Ctx) => {
    const [x, y, z] = pos[j];
    for (const p of c.pts) {
      if (melt > 0 && rand(p.i, 77) < melt * 1.1) continue;
      X.px(cc, x + p.x - c.cx, y - z + p.y - c.cy, p.ice ?? p.col);
    }
  }]);
  return {
    stand,
    under(c) {
      // the frost patch where it stood, and a thin wet sheen under each melting chunk
      const k = seg(td, 0, 0.25) * fade;
      if (k > 0.02) for (let i = 0; i < 80; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.6) * 17 * k * S, x = g0.x + 3 + Math.cos(an) * r, y = gy + 1 + Math.sin(an) * r * FY * 0.6; if (keep(x, y, fade)) X.px(c, x, y, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
      for (let j = 0; j < ch.length; j++) if (td > 0.5 && pos[j][2] <= ch[j].hh + 0.1) X.ellipse(c, pos[j][0], pos[j][1] + 1, 2 + melt * 2, 1, rgba(120, 190, 230, 0.5 * fade));
    },
    fx(c) {
      const p: Pt = [g0.x - 1, gy - 9 * S];
      if (td < 0.06) X.ellipse(c, p[0], p[1], 12 * S, 10 * S, '#ffffff');
      star(c, p, td, '#bfeeff', 10 * S);
      // glitter thrown off the burst
      if (td < 0.6) for (let k = 0; k < 22; k++) { const an = rand(k, 41) * TAU, sp = 20 + rand(k, 42) * 40; X.px(c, p[0] + Math.cos(an) * sp * td + dir[0] * 20 * td, p[1] + Math.sin(an) * sp * td * 0.6 + 40 * td * td, k % 3 ? '#e0ffff' : '#ffffff'); }
      // twinkles on the resting shards
      for (let j = 0; j < ch.length; j++) if (td > 0.6 && melt < 0.9 && (Math.floor(td * 8) + j) % 7 === 0) X.px(c, pos[j][0], pos[j][1] - pos[j][2] - 1, '#ffffff');
      K.dust(c, p[0], gy, td, 3, 6, 12 * S, '#d8ecf6', 0.6);
    },
    lights: [[g0.x, gy - 4, 60, '#9ff4ff', 1.0 * (1 - seg(td, 0, 0.5)) + 0.3 * fade]],
  };
}

// ARCANE v3: the magic that binds the body comes undone. v2 tore it into five big pieces flung wide
// on snapping threads; the user found that too dramatic, the spread too wide and the pieces too few.
// v3 keeps the idea (disintegration, not fire's dust, no spiral upward) and calms it: a small nudge,
// fine pink seams crack across it, a dozen small pieces drift only a few pixels apart on short
// threads that let go quietly, and each piece unravels from its edges inward, pixel by pixel.
interface Piece { pts: Px[]; cx: number; cy: number; ux: number; uy: number; nb: Map<number, Px[]> }
interface Pieces { P: Piece[]; threads: { a: number; b: number; pa: Px; pb: Px; r: number }[]; cx: number; cy: number }
function piecesOf(d: Death, px: Px[], n: number, seed: number): Pieces {
  const hit = d.cache.get('pieces') as Pieces | undefined;
  if (hit) return hit;
  let cx = 0, cy = 0; for (const p of px) { cx += p.x; cy += p.y; }
  if (px.length) { cx /= px.length; cy /= px.length; }
  // seeds by farthest-point sampling, so the pieces come out about the same size
  const S: Pt[] = [[cx + 0.3, cy - 6]];
  while (px.length && S.length < Math.min(n, px.length)) {
    let best: Pt = [px[0].x, px[0].y], bd = -1;
    for (const p of px) { let dm = 1e9; for (const q of S) dm = Math.min(dm, (p.x - q[0]) ** 2 + ((p.y - q[1]) * 0.8) ** 2); dm *= 0.75 + 0.5 * rand(p.i, seed); if (dm > bd) { bd = dm; best = [p.x, p.y]; } }
    S.push(best);
  }
  const own = new Map<number, number>(), P: Piece[] = S.map(() => ({ pts: [], cx: 0, cy: 0, ux: 0, uy: 0, nb: new Map() }));
  for (const p of px) {
    let b = 0, bd = 1e9;
    S.forEach((q, i) => { const dd = (p.x - q[0]) ** 2 + ((p.y - q[1]) * 0.8) ** 2 + rand(p.i, seed, 2) * 3; if (dd < bd) { bd = dd; b = i; } });
    own.set(p.x * 4096 + p.y, b); P[b].pts.push(p);
  }
  const at = (x: number, y: number) => own.get(x * 4096 + y);
  P.forEach((c, j) => {
    if (!c.pts.length) return;
    for (const p of c.pts) { c.cx += p.x; c.cy += p.y; }
    c.cx /= c.pts.length; c.cy /= c.pts.length;
    let ux = c.cx - cx, uy = c.cy - cy; const L = Math.hypot(ux, uy);
    if (L < 1.5) { const an = rand(j, seed, 3) * TAU; ux = Math.cos(an); uy = Math.sin(an); } else { ux /= L; uy /= L; }
    c.ux = ux; c.uy = uy;
    for (const p of c.pts) {
      p.seam = false; p.edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = at(p.x + dx, p.y + dy);
        if (o == null) p.edge = true;
        else if (o !== j) { if (o > j) p.seam = true; p.rim = true; if (!c.nb.has(o)) c.nb.set(o, []); c.nb.get(o)!.push(p); }
      }
    }
    // depth: how far in from the piece's edge (it unravels from the edges inward)
    const rim = c.pts.filter((p) => p.edge || p.rim);
    for (const p of c.pts) { let dd = 9; for (const q of rim) { const e = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (e < dd) dd = e; } p.d = dd; }
  });
  // threads: one per shared seam, anchored on each side of it
  const threads: Pieces['threads'] = [];
  P.forEach((c, j) => c.nb.forEach((pts, o) => {
    if (o < j) return;
    const back = P[o].nb.get(j) ?? pts;
    threads.push({ a: j, b: o, pa: pts[Math.floor(pts.length / 2)], pb: back[Math.floor(back.length / 2)], r: rand(j, o, seed) });
  }));
  // keep the indices the threads use: pieces with no pixels stay in the list (empty)
  const out = { P, threads, cx, cy };
  d.cache.set('pieces', out);
  return out;
}
function arcane(d: Death, td: number): Bespoke {
  const R = EL.arcane, dir = d.dir, g0 = d.g0, S = d.S;
  const PC = piecesOf(d, capture(d, 'arcane', { ...g0, flash: 0 }), Math.round(12 * Math.sqrt(S)), 13);
  // the nudge: the blow shoves the body back a little along the blow
  const sh = 2 * easeOut(seg(td, 0, 0.16)), ox = dir[0] * sh, oy = dir[1] * sh * FY;
  const imp: Pt = [PC.cx - dir[0] * 3, PC.cy - 2];
  const SEAM = (p: Px) => 0.05 + 0.3 * Math.min(1, Math.hypot(p.x - imp[0], p.y - imp[1]) / (14 * S)); // when a seam pixel cracks
  const STRAIN0 = 0.4, LET = 0.8;
  const goOf = (j: number) => LET + rand(j, 17) * 0.25;
  const vanish = (p: Px, sp: number) => sp + 0.15 + (p.d ?? 0) * 0.1 + rand(p.i, 23) * 0.3;
  // a piece's offset: a slow creep as the seams open, then a short, soft drift once it lets go
  const D2: Pt[] = PC.P.map((c, j) => {
    const sp = goOf(j), creep = 1.5 * smooth(seg(td, STRAIN0, sp)), drift = td > sp ? 4.5 * (0.7 + 0.4 * rand(j, 19)) * easeOut(seg(td, sp, sp + 0.7)) * Math.sqrt(S) : 0;
    return [ox + c.ux * (creep + drift), oy + c.uy * (creep + drift) * 0.8];
  });
  const strain = seg(td, STRAIN0, LET);
  const stand: Stand[] = [[g0.y, (c: Ctx) => {
    PC.P.forEach((pc, j) => {
      const [dx, dy] = D2[j], sp = goOf(j);
      for (const p of pc.pts) {
        const tv = vanish(p, sp);
        if (td > tv) continue;
        const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
        // the last instant before a pixel goes: it glows
        if (td > tv - 0.06) { X.px(c, x, y, td > tv - 0.03 ? R[1] : R[2]); continue; }
        if (p.seam && !p.dark && td > SEAM(p)) X.px(c, x, y, td - SEAM(p) < 0.04 ? '#ffffff' : (p.x + p.y) % 2 ? R[2] : R[3]);
        else X.px(c, x, y, td > 0.1 && !p.dark ? X.mix(p.col, '#ff9ad0', 0.1 + 0.15 * strain) : p.col);
      }
    });
  }]];
  return {
    stand,
    under(c) {
      // the shadow, fading as the pieces let go
      if (td < LET + 0.3) X.ellipse(c, g0.x + ox, g0.y + 1, 5 * S, 1.6 * S, 'rgba(8,6,16,0.45)', 1 - seg(td, LET - 0.1, LET + 0.3) * 0.6);
    },
    fx(c) {
      // the small pop that nudges it
      star(c, imp, td, R[1], 4 * S);
      if (td < 0.18) { const q = td / 0.18; X.ring(c, imp[0], imp[1], 2 + q * 5 * S, (2 + q * 5 * S) * 0.8, R[1], 1 - q); }
      // short threads across the opening seams: they brighten a little as the gap grows, then let go
      if (td > STRAIN0 - 0.05) for (const th of PC.threads) {
        const ia = th.a, ib = th.b, ts = Math.min(goOf(ia), goOf(ib)) + th.r * 0.05;
        const a: Pt = [th.pa.x + D2[ia][0], th.pa.y + D2[ia][1]], b: Pt = [th.pb.x + D2[ib][0], th.pb.y + D2[ib][1]];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1.5) continue; // nothing to span yet
        if (td < ts) X.line(c, a[0], a[1], b[0], b[1], strain > 0.6 && Math.floor(td * 20 + th.r * 7) % 4 === 0 ? R[1] : R[3]);
        else if (td < ts + 0.1) X.px(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, R[2]); // let go: a last glint
      }
      // tiny pops where pixels wink out
      PC.P.forEach((pc, j) => {
        const sp = goOf(j); if (td < sp + 0.1) return;
        for (const p of pc.pts) {
          if (p.i % 9) continue;
          const e = td - vanish(p, sp); if (e < 0 || e > 0.06) continue;
          X.px(c, p.x + D2[j][0], p.y + D2[j][1], '#ffffff');
        }
      });
    },
    lights: [[PC.cx + ox, g0.y - 4, 30, '#ff4f9b', td < 0.12 ? 0.6 : (0.1 + 0.25 * seg(td, 0.1, LET)) * (1 - seg(td, LET, LET + 0.9))]],
  };
}

// ---------------------------------------------------------------------------------------------
/** The pool of death sprites, and the deaths playing in them. */
export class Deaths {
  private slots: Slot[] = [];
  private live: Death[] = [];
  constructor(private parent: Container) {}

  /** A body died: g0 is its rig state then, placed at its feet (field px). */
  add(g0: Pose, info: DeathInfo, who: number, tick: number): void {
    // rollback: a tick shown twice (or a corrected one) must not play the same death again
    if (this.live.some((d) => d.who === who && Math.abs(d.tick - tick) < 90)) return;
    if (this.live.length >= MAX) this.end(this.live[0]);
    const L = Math.hypot(info.dirX, info.dirY);
    const dir: Pt = L > 1e-6 ? [info.dirX / L, info.dirY / L] : [g0.seed & 1 ? 1 : -1, 0];
    // other archetypes play the goblin's deaths on their own rig, scaled to its height (for now)
    const S = HEIGHT[g0.kind] / HEIGHT.goblin;
    const d: Death = { who, tick, t0: NaN, g0: { ...g0, alpha: 1, spd: 0, vx: 0, vy: 0, sq: 0, flash: 0, punch: -1, smash: -1, draw: 0 }, dir, ov: info.overkill, kind: pickDeath(info), S, slot: this.slot(), cache: new Map() };
    this.live.push(d);
  }

  /** Clears the old effects' ground and over canvases each frame first (vfx.ts); this draws into them. */
  draw(g: Ctx, o: Ctx, ct: number, light: LightFn, fx0: number, fy0: number): void {
    for (const d of this.live.slice()) {
      if (Number.isNaN(d.t0)) d.t0 = ct;
      const td = ct - d.t0;
      if (td >= LIFE || td < -1) { this.end(d); continue; }
      this.frame(d, td, 1 - seg(td, LIFE - FADE, LIFE), g, o, light, fx0, fy0);
    }
  }

  get count(): number { return this.live.length; }

  private slot(): Slot {
    const free = this.slots.find((s) => !this.live.some((d) => d.slot === s));
    if (free) return free;
    const { c, x } = X.canvas(SW, SH);
    const tex = Texture.from(c); tex.source.scaleMode = 'nearest';
    const spr = new Sprite(tex); spr.tint = AMBIENT; spr.visible = false;
    this.parent.addChild(spr);
    const s = { c, x, tex, spr };
    this.slots.push(s);
    return s;
  }
  private end(d: Death): void {
    d.slot.spr.visible = false;
    this.live.splice(this.live.indexOf(d), 1);
  }

  /** One frame of one death: marks under, the body (and what it became) in its sprite, effects over. */
  private frame(d: Death, td: number, fade: number, g: Ctx, o: Ctx, light: LightFn, fx0: number, fy0: number): void {
    const { g0, S } = d, sx = Math.round(g0.x) - SX, sy = Math.round(g0.y) - SY, c = d.slot.x;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, SW, SH); c.setTransform(1, 0, 0, 1, -sx, -sy); c._fs = null;
    let stand: Stand[] = [], lights: Light[] = [], zy = g0.y;
    let fxFn: (c: Ctx, A: Anchors) => void = () => {};
    let underFn: (c: Ctx) => void = () => {};
    let A: Anchors = anchorsAt(g0, S);
    if (d.kind === 'shatter' || d.kind === 'arcane') {
      const b = d.kind === 'shatter' ? shatter(d, td, fade) : arcane(d, td);
      stand = b.stand; lights = b.lights; underFn = b.under; fxFn = (cc) => b.fx(cc);
    } else {
      const O = d.kind === 'base' ? null : OVERLAY[d.kind] ?? null;
      let mo: Motion = { overkill: d.ov, ...O?.motion };
      if (O?.motionFor) mo = O.motionFor(mo);
      const m = baseDeath(g0, td, d.dir, mo, S);
      if (O?.body) { const keepA = m.g.alpha; Object.assign(m.g, O.body(td)); m.g.alpha = keepA; }
      const exit = mo.exit ?? 'poof', ex = td - m.exitAt;
      let bodyA = m.g.alpha, drawn = false;
      zy = m.g.y;
      if (m.rot != null && m.fall === 'bounce') {
        // the tumble: the captured body spun about its middle, carried up by z
        const px = capture(d, 'tumble', { ...g0, flash: 0, dead: 0, z: 0 }), pv: Pt = [Math.round(g0.x), Math.round(g0.y) - Math.round(7 * S)], a = bodyA, rot = m.rot;
        if (a > 0.05) stand.push([m.g.y, (cc) => rigid(cc, px, pv, rot * m.side, m.g.flash, a, [m.g.x - g0.x, m.g.y - g0.y - m.g.z], true)]);
        A = anchorsAt(m.g, S); drawn = true;
      } else if (m.rot != null) {
        // the plank: the captured body tipped about its feet
        const cx = Math.round(g0.x + d.dir[0] * 1.5), cy = Math.round(g0.y + d.dir[1] * 1.5 * FY);
        const px = capture(d, 'rigid', { ...m.g, x: cx, y: cy, z: 0, flash: 0, dead: 0 }), pv: Pt = [cx, cy], a = bodyA, rot = m.rot;
        if (a > 0.05) stand.push([m.g.y, (cc) => rigid(cc, px, pv, rot * m.side, m.g.flash, a, [0, -m.g.z])]);
        A = anchorsAt(m.g, S); drawn = true;
      }
      // crumble: the captured body falls apart from the top into ash, embers rising off it
      if (exit === 'crumble' && ex >= 0 && O?.body) {
        bodyA = 0; // a hard cut to the captured pixels (a dithered fade of a glowing outline checkers)
        const cap = baseDeath(g0, m.exitAt, d.dir, mo, S).g;
        Object.assign(cap, O.body(m.exitAt), { alpha: 1, flash: 0, eyesShut: 0, burnF: 0 });
        const px = capture(d, 'crumble', cap), gx = cap.x, gy = cap.y, H = 16 * S;
        stand.push([gy, (cc) => {
          const pk = seg(ex, 0.1, 0.6);
          if (pk > 0 && keep(gx, gy, fade)) { X.ellipse(cc, gx, gy, (2 + 4.5 * pk) * S, (1 + 1.4 * pk) * S, '#2a2428'); X.ellipse(cc, gx - 1, gy - 1, (1 + 3 * pk) * S, (0.5 + pk * 0.8) * S, '#4e484c'); X.px(cc, gx - 2, gy - 2, '#6a6468'); }
          for (const p of px) {
            const u = clamp((gy - p.y) / H, 0, 1), r = (1 - u) * 0.38 + rand(p.i, 7) * 0.12, te = ex - r;
            if (te < 0) { X.px(cc, p.x, p.y, p.col); continue; }
            if (rand(p.i, 8) < 0.2) { if (te < 0.8 && (Math.floor(td * 12) + p.i) % 5) X.px(cc, p.x + Math.sin(te * 6 + p.i) * 1.5 + m.side * te * 3, p.y - te * 16, te < 0.3 ? EL.fire[2] : EL.fire[3]); continue; }
            const dist = gy - 1 - p.y, ft = Math.sqrt(2 * Math.max(0, dist) / 150);
            if (te < ft) X.px(cc, p.x + (rand(p.i, 9) - 0.5) * te * 10, p.y + 75 * te * te, te < ft * 0.4 ? p.col : '#5a5458');
          }
          // embers glowing in the ash pile
          if (pk > 0.5) for (let i = 0; i < 5; i++) if (rand(i, Math.floor(td * 4), 3) < 0.6 * fade * (1 - seg(ex, 1.2, 2))) X.px(cc, gx - 3 * S + rand(i, 4) * 6 * S, gy - 1 + rand(i, 5) * 2, i % 2 ? EL.fire[3] : EL.fire[2]);
        }]);
      }
      // the rig itself, as it falls
      if (!drawn && bodyA > 0.02) {
        const pose: Pose = { ...m.g, alpha: bodyA, flash: flashLvl(m.g.flash) };
        stand.push([m.g.y, (cc) => {
          const a = paint(pose, cc, Math.round(pose.x), Math.round(pose.y - pose.z));
          A = { chest: [pose.x + a.chest[0], pose.y - pose.z + a.chest[1]], head: [pose.x + a.head[0], pose.y - pose.z + a.head[1]], tip: [pose.x + a.tip[0], pose.y - pose.z + a.tip[1]], charge: [pose.x + a.charge[0], pose.y - pose.z + a.charge[1]], hands: [] };
        }]);
      }
      // the dropped weapon pops out of the poof and lands beside it (clubStill: it is simply there when
      // the cloud clears, lying still)
      if (exit === 'poof' && mo.club !== false && ex > 0) {
        const gx = m.g.x + m.side * 6 * S, z = mo.clubStill ? 0 : hop(ex, 0, 6, 0.35), x = mo.clubStill ? gx : lerp(m.mid[0], gx, seg(ex, 0, 0.35));
        if (!(mo.clubStill && ex < 0.25)) stand.push([m.g.y + 1, (cc) => { if (keep(x, m.g.y, fade)) weapon(cc, g0, x, m.g.y + 1 - z, m.side, mo.clubCol); }]);
      }
      const q = (): Ctx2 => ({ d, m, td, fade, A });
      lights = O?.lights ? O.lights(q()) : [];
      underFn = (cc) => {
        // the body's shadow while it is there (shrinking as it is thrown up, flat once it lies)
        if (bodyA > 0.2 || (drawn && m.g.alpha > 0.2)) {
          const lie = m.g.dead / 0.9, wd = WIDTH[g0.kind] * 1.15 * (1 - Math.min(0.5, m.g.z / 30)) * (1 + 0.4 * lie);
          X.shadow(cc, m.g.x + 0.5, m.g.y + 0.5, wd, Math.max(1.5, wd * FY), HEIGHT[g0.kind] * 0.25 * (1 - 0.7 * lie) * (1 - Math.min(1, m.g.z / 20)));
        }
        O?.ground?.(cc, q());
      };
      fxFn = (cc, AA) => {
        A = AA;
        star(cc, [AA.chest[0] - d.dir[0] * 2, AA.chest[1]], td, mo.hitCol ?? '#ffffff', 7 * Math.sqrt(S));
        O?.fx?.(cc, q());
        if (exit === 'poof') poof(cc, m.mid[0], m.mid[1], ex / 0.7, mo.exitCols ?? POOF, mo.exitR ?? 11, 3, S);
      };
    }
    underFn(g); g._fs = null;
    stand.sort((p, q) => p[0] - q[0]);
    for (const [, fn] of stand) fn(c);
    fxFn(o, A); o._fs = null;
    for (const [x, y, r, col, a] of lights) if (a > 0.01) light(x, y, r, col, a);
    const s = d.slot.spr;
    s.visible = true; s.position.set(fx0 + sx, fy0 + sy); s.zIndex = Math.round(zy) * 128 + 110;
    d.slot.tex.source.update();
  }
}
