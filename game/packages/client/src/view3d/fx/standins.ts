/**
 * Stand-ins for every spell (the port's decision 3: docs/explorations/2026-11-25-port-3d-plan.md): until a family gets
 * its real 3D effect, what the sim does is drawn as its own hit shape, in the element's colour, so the 3D game is
 * playable and readable. Fire's spray and floor are the exception: they keep look B (fire.ts) and draw nothing here.
 *
 * Everything is read from the sim each frame, as the pixel view does (art/vfx.ts, view-structures.ts, the VFX Lab's
 * hit overlay), and drawn with standins-batch.ts:
 *   - channels: a spray's cone on the floor (range and half-angle by its runes; cut at where it stops), a beam's ribbon
 *     to its end, a turret's or a Double's channel; Earth's Force charging (a rock growing at the staff)
 *   - missiles: a ball (bolt), a rock, an ice shard or a healing stone at their spot, at staff height, with a trail and
 *     a mark on the floor under them
 *   - zones: delayed blasts and geysers (a disc filling to the moment it goes off), springs, steam, frost fog, rain,
 *     caltrops, sparks
 *   - the floor (w.surf): water and ice cells (fire is fire.ts's)
 *   - walls: rock and ice as shaded boxes, barriers and curtains (coated fields) as standing sheets, lower when hurt
 *   - Shield waves (a front sweeping forward, its trail), Sigil devices (turrets, glyphs, line glyphs, orbitals, the
 *     Lens), wards, auras, motes, the Healing link and the Double's ring, statuses on bodies
 *   - telegraphs: enemy wind-ups (the goblin's red cone, the grabber's line, the brute's circle), portals, the local
 *     seat's placement preview, and every seat's held imbued burst
 *   - events, kept a moment each: area bursts (rings at the sim's radius), imbued bursts (their cone or line), zaps
 *     (lightning arcs, strikes, chain heals), blinks, freezes, shatters, Self casts, weapon blows
 *
 * The events are the only thing remembered between frames (records keyed by their tick, so a replayed step doesn't
 * add one twice); everything else is a function of the world and the clock, so rollback and "freeze at t" stay right.
 */
import * as THREE from 'three';
import {
  AI, ARCHETYPES, ATTACK, ARCH, BTN, CELL, DEVICE, EL, EV, KIND, MAX_BODIES, MAX_DEVICES, MAX_MISSILES, MAX_PORTALS, MAX_SEATS, MAX_WALLS, MAX_WAVES, MAX_ZONES,
  N_EL, PHASE, SHAPES, STRUCT, SURF, T, WALL, WARD, ZONE, arcShape, compile, glyphRadiusOf, imbueHalf, imbueLine, imbueReach, imbueStretch, orbitAngle,
  placeRadius, queueOf, specOf, type SimEvent, type SpellSpec, type World,
} from '@wizard-sim/sim';
import * as X from '../../art/px';
import type { SpellLights } from './lights';
import { Batch, type RGB } from './standins-batch';

const TAU = Math.PI * 2;
/** Heights (u over the floor): a staff's tip, a missile's flight, a beam, a wizard's chest. */
const STAFF_H = 1.35, MISSILE_H = 1.25, BEAM_H = 1.35;
/** Wall heights (u) when whole: a wizard is 2.7. */
const WALL_H: Record<number, number> = { [WALL.rock]: 1.9, [WALL.ice]: 2.0, [WALL.barrier]: 2.5, [WALL.curtain]: 2.5 };
/** How long (s) an event's stand-in stays. */
const LIFE = { burst: 0.9, imbue: 0.7, zap: 0.2, strike: 0.5, blink: 0.45, freeze: 0.6, shatter: 0.7, self: 1.0, blow: 0.35, slam: 0.9 } as const;

/** An element's colours: light (core, edges), mid (fills), deep (dark fills that read on bright stone). Linear RGB. */
export interface Pal { light: RGB; mid: RGB; deep: RGB }
const lin = (hex: string, k = 1): RGB => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
/** A ramp's light end for cores, and two steps darker than the pixel game's mid tones for fills and rims: pale fills vanish on the court's bright stone. */
const fromRamp = (r: readonly string[]): Pal => ({ light: lin(r[1]), mid: lin(r[Math.min(3, r.length - 1)]), deep: lin(r[Math.min(4, r.length - 1)]) });
const NAMES = ['', 'water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth', 'ice'];
const PALS: Pal[] = NAMES.map((n, id) => (id === 0 ? fromRamp(['#ffffff', '#e8e4f0', '#b8b4c8', '#8a8498']) : id === EL.life ? fromRamp(X.LIFE) : fromRamp(X.EL[n] ?? X.EL.arcane)));
const STEAM = fromRamp(X.EL.steam);
const ENEMY: RGB = lin('#ff3a3a'), SLAM: RGB = lin('#ff8a3a'), GRAB: RGB = lin('#4fe0d6'), PORTAL: RGB = lin('#ff4f9b');
const WHITE: RGB = [1, 1, 1];
const ROCK_COL: RGB = lin('#8a6a48'), ROCK_TOP: RGB = lin('#b8946a'), ICE_COL: RGB = lin('#a8dcef'), ICE_TOP: RGB = lin('#e8fbff');
/** An element id's colours (0: the bare staff's grey-white). */
export const palOf = (id: number): Pal => PALS[id] ?? PALS[EL.arcane];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** The element with the most runes in counts `els` at slot `at`, skipping `skip` (0: none). */
function leadOf(els: Uint8Array, at: number, ...skip: number[]): number {
  let best = 0, n = 0;
  for (let e = 1; e <= N_EL; e++) { const c = els[at * N_EL + e - 1]; if (c > n && !skip.includes(e)) { best = e; n = c; } }
  return best;
}
const has = (els: Uint8Array, at: number, id: number): boolean => els[at * N_EL + id - 1] > 0;
/** A spell's colours: its look (a heal is Life's), steam for a scald. */
const specPal = (s: SpellSpec): Pal => (s.scald ? STEAM : s.heal ? palOf(EL.life) : palOf(s.look || s.form));
/** Cheap deterministic noise in 0..1. */
const hash = (a: number, b = 0, c = 0): number => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

/** A remembered event: what it was, when (tick), and what it needs to be drawn. */
interface Rec { key: string; tick: number; life: number; kind: keyof typeof LIFE; x: number; y: number; x2: number; y2: number; r: number; look: number; who: number; half: number; line: boolean; heal: boolean }

/** What the host passes each frame. */
export interface StandinFrame {
  /** Sim time (s) of this frame and how far toward the next step (0..1). */
  t: number; alpha: number;
  /** The seat whose placement preview shows (-1: none). */
  localSeat: number;
  /** The camera the effects are drawn with (fx space). */
  cam: THREE.Camera;
  lights?: SpellLights | null;
  /** Where body i is drawn (sim u), if the host interpolates; else its sim spot. */
  bodyAt?: (i: number) => [number, number];
}

export class Standins {
  readonly batch = new Batch();
  /** What's on the floor at sim (x, y) (u). */
  ground: (x: number, y: number) => number = () => 0;
  private recs: Rec[] = [];
  private keys = new Set<string>();
  /** Fire's spray and floor draw as look B (fire.ts); true draws their stand-ins instead of nothing (the lab's ?standins=all). */
  drawFire = false;

  get group(): THREE.Group { return this.batch.group; }

  /** After each sim step (shown or replayed): its events become records. */
  afterStep(w: World): void {
    const tick = w.clock[0];
    for (const e of w.events) this.note(w, e, tick);
    // forget what's long gone
    if (this.recs.length > 256 || (tick % 30 === 0 && this.recs.length)) {
      this.recs = this.recs.filter((r) => (tick - r.tick) / 60 < r.life + 0.1 && r.tick <= tick + 1);
      this.keys = new Set(this.recs.map((r) => r.key));
    }
  }

  /** A rewind dropped the steps after `tick`: their records go (the replay makes them again). */
  rewind(tick: number): void {
    this.recs = this.recs.filter((r) => r.tick <= tick);
    this.keys = new Set(this.recs.map((r) => r.key));
  }

  private note(w: World, e: SimEvent, tick: number): void {
    const add = (kind: keyof typeof LIFE, o: Partial<Rec>): void => {
      const key = `${tick}:${kind}:${e.who}:${Math.round(e.x * 20)}:${Math.round(e.y * 20)}:${Math.round((e.x2 ?? 0) * 20)}`;
      if (this.keys.has(key)) return;
      this.keys.add(key);
      this.recs.push({ key, tick, life: LIFE[kind], kind, x: e.x, y: e.y, x2: e.x2 ?? e.x, y2: e.y2 ?? e.y, r: 0, look: e.look ?? 0, who: e.who, half: 0, line: false, heal: false, ...o });
    };
    const seatSpec = (): SpellSpec | null => (e.who >= 0 && e.who < MAX_SEATS && w.seats.active[e.who] ? specOf(w, e.who) : null);
    switch (e.kind) {
      case 'burst': {
        if (e.ev === EV.dismiss || e.ev === EV.wellDry || e.ev === EV.gutter) return;
        const sp = seatSpec();
        add(e.who >= MAX_SEATS ? 'slam' : 'burst', { r: e.amount ?? 1, look: e.look ?? (sp ? sp.look || sp.form : 0), heal: !!sp?.heal });
        return;
      }
      case 'zap': {
        const sp = seatSpec(), x2 = e.x2 ?? e.x;
        if (sp?.shape === 'strike' && Math.abs(x2 - e.x) < 1e-6) { add('strike', { x: x2, y: e.y2 ?? e.y }); return; }
        add('zap', { look: e.look ?? EL.lightning, heal: !!sp?.heal || e.look === EL.life });
        return;
      }
      case 'blink': add('blink', {}); return;
      case 'freeze': add('freeze', {}); return;
      case 'shatter': add('shatter', {}); return;
      case 'cast': {
        const sp = seatSpec();
        if (sp?.shape === 'self') add('self', { look: sp.look || sp.form, heal: sp.heal });
        // a Discharge's reach (effects.ts: 4 u and one a rune), shown even when it finds nobody to zap
        if (sp?.shape === 'discharge') add('burst', { r: 4 + Math.max(1, sp.sizeN), look: EL.lightning });
        return;
      }
      case 'move': {
        if (e.text === 'imbue') {
          const sp = { form: e.look ?? 0, counts: new Uint8Array(N_EL) } as unknown as SpellSpec;
          if (e.els) for (let id = 1; id <= N_EL; id++) if (e.els & (1 << id)) sp.counts[id - 1] = 1;
          add('imbue', { r: e.amount ?? 2, half: (e.half ?? 0.1) * TAU, line: imbueLine(sp) });
          return;
        }
        if (e.text && /^(strike|sweep|heavy|lash|thrust|slam|cleave|smash|spin)/.test(e.text)) add('blow', {});
        return;
      }
      default:
    }
  }

  /** Draws everything for this frame. */
  draw(w: World, f: StandinFrame): void {
    const B = this.batch;
    B.ground = this.ground;
    B.begin(f.cam);
    const at = (i: number): [number, number] => f.bodyAt?.(i) ?? [w.bodies.x[i], w.bodies.y[i]];
    this.surfaces(w, f.t);
    this.zones(w, f.t);
    this.walls(w, f.t);
    this.waves(w, f.t);
    this.devices(w, f, at);
    this.channels(w, f, at);
    this.missiles(w, f);
    this.onBodies(w, f, at);
    this.telegraphs(w, f.t);
    this.previews(w, f, at);
    this.events(w, f);
    B.end();
  }

  // ---- the floor ------------------------------------------------------------------------------------------------------
  private surfaces(w: World, t: number): void {
    const s = w.surf, d = w.dims, B = this.batch;
    const water = palOf(EL.water), ice = palOf(EL.ice);
    for (let c = 0; c < s.kind.length; c++) {
      const k = s.kind[c];
      if (k === SURF.fire && this.drawFire) {
        const x0 = -d.w / 2 + (c % d.gw) * CELL, y0 = -d.h / 2 + Math.floor(c / d.gw) * CELL, fire = palOf(EL.fire);
        B.cell(B.tintBuf, x0, y0, CELL, hash(c, Math.floor(t * 8)) < 0.5 ? fire.mid : fire.deep, 0.6 * Math.min(1, s.life[c] / 60));
        continue;
      }
      if (k !== SURF.water && k !== SURF.ice) continue;
      const fade = Math.min(1, s.life[c] / 60), x0 = -d.w / 2 + (c % d.gw) * CELL, y0 = -d.h / 2 + Math.floor(c / d.gw) * CELL;
      if (k === SURF.water) B.cell(B.tintBuf, x0, y0, CELL, scale(water.deep, 0.9 + 0.1 * Math.sin(t * 2 + c)), 0.5 * fade);
      else { B.cell(B.tintBuf, x0, y0, CELL, ice.mid, 0.55 * fade); if (hash(c) < 0.12) B.cell(B.glowBuf, x0 + 0.1, y0 + 0.1, CELL * 0.3, ice.light, 0.5 * fade); }
    }
  }

  private zones(w: World, t: number): void {
    const z = w.zones, B = this.batch;
    for (let k = 0; k < MAX_ZONES; k++) {
      const ty = z.type[k];
      if (!ty) continue;
      const x = z.x[k], y = z.y[k], r = z.r[k], P = palOf(z.look[k] || leadOf(z.els, k)), fadeOut = Math.min(1, z.life[k] / 30);
      switch (ty) {
        case ZONE.blast: case ZONE.geyser: {
          // the fuse: the disc fills toward its rim until it goes off
          const f = 1 - z.timer[k] / Math.max(1, T(SHAPES.delayedBlast)), Q = ty === ZONE.geyser ? palOf(has(z.els, k, EL.water) ? EL.water : EL.earth) : P;
          B.ring(B.tintBuf, x, y, 0, r * f, Q.deep, 0.15, Q.mid, 0.45);
          B.circle(B.tintBuf, x, y, r, 0.14, Q.deep, 0.9);
          B.circle(B.glowBuf, x, y, r * f, 0.12, Q.light, 0.9);
          break;
        }
        case ZONE.rain: {
          B.ring(B.tintBuf, x, y, 0, r, P.deep, 0.12, P.deep, 0.3);
          B.circle(B.tintBuf, x, y, r, 0.1, P.mid, 0.8 * fadeOut);
          // streaks falling from a cloud 6 u up
          const g = this.ground(x, y);
          for (let i = 0; i < 26; i++) {
            const a = hash(i, k) * TAU, rr = Math.sqrt(hash(i, k, 1)) * r, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
            const ph = (t * 1.6 + hash(i, k, 2)) % 1, top = g + 6 * (1 - ph), gy = this.ground(px, py);
            if (top - 0.9 < gy) continue;
            B.ribbon(B.glowBuf, [[px, top, py], [px, top - 0.9, py]], 0.05, P.light, 0.7 * fadeOut, P.light, 0);
          }
          B.blob(B.tintBuf, x, g + 6, y, r * 1.1, STEAM.deep, 0.45 * fadeOut, 0.2);
          break;
        }
        case ZONE.caltrops: {
          B.ring(B.tintBuf, x, y, 0, r, palOf(EL.ice).deep, 0.18 * fadeOut);
          B.circle(B.tintBuf, x, y, r, 0.08, palOf(EL.ice).deep, 0.7 * fadeOut);
          for (let i = 0; i < Math.round(r * r * 6); i++) {
            const a = hash(i, k) * TAU, rr = Math.sqrt(hash(i, k, 1)) * r, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr, g = this.ground(px, py);
            B.tri(B.solidBuf, [px - 0.08, g, py], [px + 0.08, g, py + 0.04], [px, g + 0.28, py], ICE_COL, 1);
          }
          break;
        }
        case ZONE.steam: case ZONE.frost: case ZONE.spring: case ZONE.spark: default: {
          const Q = ty === ZONE.steam ? STEAM : ty === ZONE.frost ? palOf(EL.cold) : ty === ZONE.spring ? palOf(EL.life) : ty === ZONE.spark ? palOf(EL.lightning) : P;
          const pulse = 0.85 + 0.15 * Math.sin(t * 3 + k);
          B.ring(B.tintBuf, x, y, 0, r, Q.deep, 0.15 * fadeOut, Q.mid, 0.35 * fadeOut * pulse);
          B.circle(B.tintBuf, x, y, r, 0.1, Q.deep, 0.85 * fadeOut);
          if (ty === ZONE.steam || ty === ZONE.frost) {
            // a low cloud: puffs drifting over the disc
            for (let i = 0; i < 10; i++) {
              const a = hash(i, k) * TAU + t * 0.3, rr = Math.sqrt(hash(i, k, 1)) * r * 0.8, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
              B.blob(B.tintBuf, px, this.ground(px, py) + 0.5 + 0.3 * Math.sin(t + i), py, 0.9, Q.light, 0.35 * fadeOut, 0);
            }
          } else if (ty === ZONE.spring) {
            for (let i = 0; i < 6; i++) { const ph = (t * 0.7 + hash(i, k)) % 1, a = hash(i, k, 3) * TAU, px = x + Math.cos(a) * r * 0.6, py = y + Math.sin(a) * r * 0.6; B.blob(B.glowBuf, px, this.ground(px, py) + ph * 2, py, 0.15, Q.light, (1 - ph) * fadeOut); }
          } else if (ty === ZONE.spark && Math.floor(t * 12) % 2) {
            const a = hash(Math.floor(t * 12), k) * TAU, g = this.ground(x, y);
            B.ribbon(B.glowBuf, zig([x, g + 0.3, y], [x + Math.cos(a) * r, g + 0.3, y + Math.sin(a) * r], Math.floor(t * 12) + k, 0.25), 0.07, Q.light, 1);
          }
        }
      }
    }
  }

  // ---- walls, waves, devices ----------------------------------------------------------------------------------------
  private walls(w: World, t: number): void {
    const wl = w.walls, B = this.batch;
    for (let k = 0; k < MAX_WALLS; k++) {
      const ty = wl.type[k];
      if (!ty) continue;
      const hpK = wl.maxHp[k] > 0 ? Math.max(0, Math.min(1, wl.hp[k] / wl.maxHp[k])) : 1, h = (WALL_H[ty] ?? 2) * (0.45 + 0.55 * hpK);
      const ax = wl.x1[k], ay = wl.y1[k], bx = wl.x2[k], by = wl.y2[k];
      if (ty === WALL.rock) { B.slab(ax, ay, bx, by, 0.55, h, scale(ROCK_COL, 0.7 + 0.3 * hpK), ROCK_TOP); continue; }
      if (ty === WALL.ice) { B.slab(ax, ay, bx, by, 0.45, h, ICE_COL, ICE_TOP); B.sheet(B.glowBuf, ax, ay, bx, by, h, palOf(EL.ice).light, 0.0, palOf(EL.ice).light, 0.25); continue; }
      // a barrier (Shield alone) or a curtain (a coated field), thinning as it weakens
      const lead = ty === WALL.barrier ? EL.shield : leadOf(wl.els, k, EL.shield) || EL.shield, P = palOf(lead);
      const shim = 0.8 + 0.2 * Math.sin(t * 6 + k);
      B.sheet(B.tintBuf, ax, ay, bx, by, h, P.mid, 0.6 * shim * (0.5 + 0.5 * hpK), P.light, 0.25);
      B.strip(B.tintBuf, ax, ay, bx, by, 0.35, P.deep, 0.9);
      const g0 = this.ground(ax, ay), g1 = this.ground(bx, by);
      B.ribbon(B.tintBuf, [[ax, g0 + h, ay], [bx, g1 + h, by]], 0.16, P.deep, 0.9);
      B.ribbon(B.glowBuf, [[ax, g0 + h, ay], [bx, g1 + h, by]], 0.07, P.light, 1);
      // a post at each end, so the field reads as standing
      for (const [px, py, pg] of [[ax, ay, g0], [bx, by, g1]]) B.ribbon(B.tintBuf, [[px, pg, py], [px, pg + h, py]], 0.12, P.deep, 0.8);
    }
  }

  private waves(w: World, t: number): void {
    const v = w.waves, B = this.batch;
    for (let k = 0; k < MAX_WAVES; k++) {
      if (!v.alive[k]) continue;
      const els = v.els, earth = has(els, k, EL.earth), water = has(els, k, EL.water) || has(els, k, EL.ice);
      const P = palOf(earth ? EL.earth : has(els, k, EL.ice) ? EL.ice : water ? EL.water : leadOf(els, k, EL.shield) || EL.shield);
      const range = v.range[k] || STRUCT.waveRange, fade = Math.min(1, v.travelled[k] / 0.5, (range - v.travelled[k]) / 1.2);
      const dx = v.dx[k], dy = v.dy[k], px = -dy, py = dx, half = v.half[k], x = v.x[k], y = v.y[k];
      // the trail from where it started
      const sx = x - dx * v.travelled[k], sy = y - dy * v.travelled[k];
      B.strip(B.tintBuf, sx, sy, x, y, half * 2, P.deep, 0.0, P.deep, 0.35 * fade);
      // the front, bowed forward, standing up
      const N = Math.max(6, Math.round(half * 4)), H = (earth ? 1.0 : 1.4) * fade;
      for (let i = 0; i < N; i++) {
        const s0 = (i / N) * 2 - 1, s1 = ((i + 1) / N) * 2 - 1, b0 = (1 - s0 * s0) * 0.35, b1 = (1 - s1 * s1) * 0.35;
        B.sheet(B.tintBuf, x + px * s0 * half + dx * b0, y + py * s0 * half + dy * b0, x + px * s1 * half + dx * b1, y + py * s1 * half + dy * b1, H * Math.sqrt(1 - s0 * s0 * 0.7), P.mid, 0.7, P.light, 0.25);
      }
      B.strip(B.glowBuf, x - px * half, y - py * half, x + px * half, y + py * half, 0.18, P.light, 0.8 * fade);
      void t;
    }
  }

  private devices(w: World, f: StandinFrame, at: (i: number) => [number, number]): void {
    const dv = w.devices, B = this.batch, t = f.t, SG = palOf(EL.sigil);
    for (let k = 0; k < MAX_DEVICES; k++) {
      const ty = dv.type[k];
      if (!ty) continue;
      const x = dv.x[k], y = dv.y[k], look = dv.look[k], P = palOf(look || EL.sigil), g = this.ground(x, y);
      if (ty === DEVICE.turret) {
        // a post on a rune ring, its orb in the spell's colour; its channel from the orb
        B.circle(B.tintBuf, x, y, 0.65, 0.1, SG.deep, 0.9);
        B.ring(B.tintBuf, x, y, 0, 0.65, SG.mid, 0.25);
        B.slab(x - 0.12, y, x + 0.12, y, 0.24, 1.1, lin('#6a5478'), lin('#9a80b0'));
        const top = g + 1.35, pulse = 0.8 + 0.2 * Math.sin(t * 8 + k);
        B.ball(x, top, y, 0.2, scale(P.light, 1.2));
        B.blob(B.glowBuf, x, top, y, 0.5, P.mid, 0.8 * pulse);
        if (dv.chan[k] > 0) this.beam(x, top, y, dv.x2[k], dv.y2[k], P, 0.22, t, look === EL.lightning);
        f.lights?.add(x, top, y, new THREE.Color(...P.mid), 1.5, 5);
      } else if (ty === DEVICE.glyph || ty === DEVICE.lineglyph) {
        const draw = Math.max(0, Math.min(1, 1 - dv.timer[k] / T(STRUCT.glyphArm))), armed = dv.timer[k] <= 0, pulse = armed ? 0.75 + 0.25 * Math.sin(t * 5 + k) : 1;
        if (ty === DEVICE.glyph) {
          const r = glyphRadiusOf(w, dv.owner[k]);
          B.circle(B.tintBuf, x, y, r, 0.12, armed ? P.deep : SG.deep, 0.95, -Math.PI / 2, -Math.PI / 2 + TAU * draw);
          B.circle(B.tintBuf, x, y, r * 0.62, 0.07, SG.deep, 0.8 * draw);
          if (armed) { B.ring(B.tintBuf, x, y, 0, r, P.mid, 0.4 * pulse); B.ring(B.glowBuf, x, y, r * 0.55, r * 0.7, P.light, 0.5 * pulse); }
          else B.circle(B.tintBuf, x, y, r * (1.6 - draw * 0.6), 0.06, SG.mid, 0.4 + 0.4 * draw);
        } else {
          const x2 = dv.x2[k], y2 = dv.y2[k];
          B.strip(B.tintBuf, x, y, x + (x2 - x) * draw, y + (y2 - y) * draw, 0.55, armed ? P.mid : SG.mid, armed ? 0.55 * pulse : 0.4);
          B.strip(B.tintBuf, x, y, x + (x2 - x) * draw, y + (y2 - y) * draw, 0.12, armed ? P.deep : SG.deep, 0.95);
        }
      } else if (ty === DEVICE.orbital) {
        const o = dv.owner[k];
        if (o < 0 || !w.bodies.kind[o]) continue;
        const [ox, oy] = at(o), R = STRUCT.orbitRadius, og = this.ground(ox, oy);
        B.circle(B.tintBuf, ox, oy, R, 0.08, SG.deep, 0.7);
        for (let p = 0; p < dv.charges[k]; p++) {
          const a = orbitAngle(w, k, p) * TAU, px = ox + Math.cos(a) * R, py = oy + Math.sin(a) * R, h = og + 1.4 + 0.08 * Math.sin(t * 4 + p);
          B.ball(px, h, py, 0.26, scale(P.light, 1.1), look === EL.earth);
          B.blob(B.glowBuf, px, h, py, 0.5, P.mid, 0.6);
          B.ring(B.tintBuf, px, py, 0, 0.3, P.deep, 0.55);
        }
      } else if (ty === DEVICE.lens) {
        // an upright ring facing the camera, over a circle of its reach
        B.ring(B.tintBuf, x, y, 0, STRUCT.lensRadius, SG.mid, 0.22);
        B.circle(B.tintBuf, x, y, STRUCT.lensRadius, 0.08, SG.deep, 0.9);
        const c: [number, number, number] = [x, g + 1.5, y], pts: [number, number, number][] = [];
        for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push([c[0] + (B.right.x * Math.cos(a) * 0.45 + B.up.x * Math.sin(a) * 0.95), c[1] + (B.right.y * Math.cos(a) * 0.45 + B.up.y * Math.sin(a) * 0.95), c[2] + (B.right.z * Math.cos(a) * 0.45 + B.up.z * Math.sin(a) * 0.95)]); }
        B.ribbon(B.tintBuf, pts, 0.14, SG.deep, 0.95);
        B.ribbon(B.glowBuf, pts, 0.07, SG.light, 0.9);
        B.blob(B.glowBuf, c[0], c[1], c[2], 0.8, SG.mid, 0.35);
      }
    }
  }

  // ---- channels and missiles ---------------------------------------------------------------------------------------
  /**
   * A beam's ribbon from (x, h, y) level to the floor point (ex, ey), a strip on the floor under it, a glow at the end.
   * Level, as the sim is flat: a beam stopped by a terrace's wall ends on the wall's face, not up on the terrace.
   */
  private beam(x: number, h: number, y: number, ex: number, ey: number, P: Pal, wd: number, t: number, crackle = false): void {
    const B = this.batch, eh = h, flick = 0.85 + 0.15 * Math.sin(t * 40);
    const pts: [number, number, number][] = crackle ? zig([x, h, y], [ex, eh, ey], Math.floor(t * 30), 0.25) : [[x, h, y], [ex, eh, ey]];
    B.strip(B.tintBuf, x, y, ex, ey, wd * 2.2, P.deep, 0.35);
    B.ribbon(B.tintBuf, pts, wd * 1.8, P.deep, 0.6);
    B.ribbon(B.glowBuf, pts, wd, P.light, 1.0 * flick);
    B.ribbon(B.glowBuf, pts, wd * 0.35, WHITE, 0.8 * flick);
    B.blob(B.glowBuf, ex, eh, ey, wd * 3, P.mid, 0.9 * flick);
    B.ring(B.tintBuf, ex, ey, 0, wd * 2.4, P.deep, 0.5);
  }

  private channels(w: World, f: StandinFrame, at: (i: number) => [number, number]): void {
    const s = w.seats, b = w.bodies, B = this.batch, t = f.t;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || !b.kind[i]) continue;
      if (s.phase[i] === PHASE.charge) {
        // Earth's Force charging: a rock growing at the staff
        const [x, y] = at(i), a = Math.atan2(s.aimY[i], s.aimX[i]), k = Math.min(1, s.chanTicks[i] / 60), px = x + Math.cos(a) * 0.7, py = y + Math.sin(a) * 0.7;
        B.ball(px, this.ground(x, y) + STAFF_H, py, 0.15 + 0.3 * k, ROCK_COL, true, undefined, 1, t * 3);
        B.ring(B.tintBuf, px, py, 0, 0.3 + 0.4 * k, palOf(EL.earth).deep, 0.4);
        continue;
      }
      if (s.phase[i] !== PHASE.channel) continue;
      const spec = specOf(w, i);
      const from: [number, number][] = [at(i)], ends: [number, number][] = [[s.chanEndX[i], s.chanEndY[i]]];
      const d = s.double[i];
      if (d >= 0 && b.kind[d] === KIND.double) { from.push(at(d)); ends.push([s.dblEndX[i], s.dblEndY[i]]); }
      for (let q = 0; q < from.length; q++) {
        const [x, y] = from[q], [ex, ey] = ends[q], P = specPal(spec), g = this.ground(x, y), ang = Math.atan2(ey - y, ex - x);
        if (spec.shape === 'spray') {
          const look = spec.look || spec.form;
          if (look === EL.fire && !spec.scald && !spec.heal && !this.drawFire) continue;   // look B (fire.ts)
          const n = Math.max(1, Math.min(5, spec.sizeN || 1)), half = SHAPES.sprayHalfAngle * (1 + 0.25 * (n - 1)) * TAU, range = SHAPES.sprayRange + 0.5 * (n - 1);
          const face = Math.atan2(s.aimY[i], s.aimX[i]), reach = Math.min(range, Math.hypot(ex - x, ey - y));
          B.ring(B.tintBuf, x, y, 0.3, reach, P.mid, 0.55, P.deep, 0.35, face - half, face + half);
          B.circle(B.tintBuf, x, y, range, 0.07, P.deep, 0.6, face - half, face + half);
          B.strip(B.tintBuf, x + Math.cos(face - half) * 0.3, y + Math.sin(face - half) * 0.3, x + Math.cos(face - half) * range, y + Math.sin(face - half) * range, 0.07, P.deep, 0.6);
          B.strip(B.tintBuf, x + Math.cos(face + half) * 0.3, y + Math.sin(face + half) * 0.3, x + Math.cos(face + half) * range, y + Math.sin(face + half) * range, 0.07, P.deep, 0.6);
          // the stream in the air: streaks flowing out along the cone
          for (let p = 0; p < 18; p++) {
            const ph = (t * 2.2 + hash(p, i)) % 1, a = face + (hash(p, i, 1) * 2 - 1) * half * 0.85, r0 = 0.5 + ph * (reach - 0.5), r1 = Math.min(reach, r0 + 0.6);
            const h0 = g + STAFF_H - ph * 0.9, h1 = h0 - 0.15;
            B.ribbon(B.glowBuf, [[x + Math.cos(a) * r0, h0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, h1, y + Math.sin(a) * r1]], 0.12 + 0.2 * ph, P.light, 0.8 * (1 - ph * 0.6));
          }
          f.lights?.add(x + Math.cos(face) * reach * 0.5, g + 1, y + Math.sin(face) * reach * 0.5, new THREE.Color(...P.mid), 3, 6);
        } else if (spec.shape === 'beam') {
          const sx = x + Math.cos(ang) * 0.6, sy = y + Math.sin(ang) * 0.6;
          this.beam(sx, g + BEAM_H, sy, ex, ey, P, SHAPES.beamWidth * (0.8 + 0.1 * spec.power), t);
          f.lights?.add(ex, this.ground(ex, ey) + 1, ey, new THREE.Color(...P.mid), 4, 6);
        } else if (spec.shape === 'arc') {
          // the arcs themselves come as zaps (events); a crackle at the staff while it's held
          B.blob(B.glowBuf, x + Math.cos(ang) * 0.6, g + STAFF_H, y + Math.sin(ang) * 0.6, 0.45 + 0.1 * Math.sin(t * 50), P.light, 0.9);
        }
      }
    }
  }

  private missiles(w: World, f: StandinFrame): void {
    const m = w.missiles, B = this.batch, t = f.t;
    for (let j = 0; j < MAX_MISSILES; j++) {
      if (!m.alive[j] || m.wait[j]) continue;
      const x = m.x[j] + m.vx[j] * f.alpha / 60, y = m.y[j] + m.vy[j] * f.alpha / 60, ty = m.type[j], r = m.r[j], g = this.ground(x, y), h = g + MISSILE_H;
      const sp = Math.hypot(m.vx[j], m.vy[j]) || 1, ux = m.vx[j] / sp, uy = m.vy[j] / sp;
      const lead = m.look[j] || leadOf(m.els, j), coat = leadOf(m.els, j, EL.earth, ty === 2 ? EL.ice : 0, ty === 2 ? EL.water : 0, ty === 2 ? EL.cold : 0);
      const P = m.flags[j] & 1 ? palOf(EL.life) : palOf(lead), C = coat ? palOf(coat) : P;
      // its mark on the floor: where it is
      B.ring(B.tintBuf, x, y, 0, r * 1.1, C.deep, 0.45);
      const tl = Math.min(2.6, sp * 0.12), tx = x - ux * tl, ty2 = y - uy * tl;
      if (ty === 1) {
        // a rock: shaded, tumbling, a dust (or coat) trail
        B.ball(x, h, y, r * 1.15, ROCK_COL, true, undefined, 1, t * 9 + j);
        B.ribbon(B.tintBuf, [[x, h, y], [tx, h, ty2]], r * 1.6, coat ? C.mid : lin('#8a7a68'), 0.55, coat ? C.mid : lin('#8a7a68'), 0, r * 0.4);
        if (coat) B.blob(B.glowBuf, x, h, y, r * 2.4, C.mid, 0.6);
      } else if (ty === 2) {
        // an ice shard: long along its flight
        B.ball(x, h, y, r * 0.75, ICE_COL, false, [ux, uy], 2.8);
        B.ribbon(B.glowBuf, [[x, h, y], [tx, h, ty2]], r * 0.9, palOf(EL.ice).light, 0.7, palOf(EL.ice).light, 0, 0);
      } else {
        // a bolt (or a healing stone): a glowing ball in its colour
        const Q = ty === 3 ? palOf(EL.life) : P;
        B.ribbon(B.tintBuf, [[x, h, y], [tx, h, ty2]], r * 1.7, Q.deep, 0.6, Q.deep, 0, r * 0.2);
        B.ribbon(B.glowBuf, [[x, h, y], [tx, h, ty2]], r * 1.3, Q.light, 0.9, Q.mid, 0, r * 0.2);
        B.blob(B.tintBuf, x, h, y, r * 1.5, Q.deep, 0.6, 0.2);
        B.blob(B.glowBuf, x, h, y, r * 2.2, Q.mid, 1.0);
        B.blob(B.glowBuf, x, h, y, r * 0.8, scale(Q.light, 1.6), 1.0, 0.6);
        f.lights?.add(x, h, y, new THREE.Color(...Q.mid), 3, 5);
      }
    }
  }

  // ---- on bodies ------------------------------------------------------------------------------------------------------
  private onBodies(w: World, f: StandinFrame, at: (i: number) => [number, number]): void {
    const s = w.seats, b = w.bodies, B = this.batch, t = f.t;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || !b.kind[i]) continue;
      const [x, y] = at(i), g = this.ground(x, y), r = b.r[i];
      if (s.ward[i]) {
        const kind = s.ward[i], P = kind === WARD.stone ? palOf(EL.earth) : kind === WARD.mirror ? palOf(0) : palOf(leadOf(s.wardEls, i, EL.shield) || EL.shield);
        const sh = 0.85 + 0.15 * Math.sin(t * 5 + i);
        B.band(B.tintBuf, x, g, y, r + 0.35, g + 2.6, P.mid, 0.5 * sh, 0.12, r + 0.15);
        B.circle(B.tintBuf, x, y, r + 0.35, 0.1, P.deep, 0.9);
        B.band(B.glowBuf, x, g + 0.02, y, r + 0.36, g + 0.25, P.light, 0.6 * sh, 0);
      }
      if (s.aura[i] > 0) {
        const P = palOf(leadOf(s.auraEls, i, EL.sigil) || EL.sigil), pulse = 0.75 + 0.25 * Math.sin(t * 4 + i);
        B.ring(B.tintBuf, x, y, 0.55, 1.05, P.mid, 0.0, P.mid, 0.45 * pulse);
        B.circle(B.tintBuf, x, y, 1.05, 0.08, P.deep, 0.9);
        for (let p = 0; p < 6; p++) { const ph = (t * 0.8 + hash(p, i)) % 1, a = hash(p, i, 2) * TAU + t; B.blob(B.glowBuf, x + Math.cos(a) * 0.8, g + ph * 2.4, y + Math.sin(a) * 0.8, 0.12, P.light, 1 - ph); }
      }
      for (let p = 0; p < s.motes[i]; p++) {
        const a = t * 1.8 + (p / Math.max(1, s.motes[i])) * TAU, SG = palOf(EL.sigil);
        const mx = x + Math.cos(a) * 0.8, my = g + 1.9 + 0.1 * Math.sin(t * 3 + p), mz = y + Math.sin(a) * 0.8;
        B.ball(mx, my, mz, 0.14, scale(SG.light, 1.1));
        B.blob(B.tintBuf, mx, my, mz, 0.3, SG.mid, 0.5, 0);
      }
      // a guard raised: an arc in front
      if (s.guard[i] && s.guardT[i] > 0) {
        const a = Math.atan2(s.aimY[i], s.aimX[i]), P = palOf(EL.shield);
        B.ring(B.tintBuf, x, y, r + 0.3, r + 0.55, P.mid, 0.7, P.deep, 0.7, a - 0.9, a + 0.9);
      }
      // the Healing link
      const l = s.linkTo[i];
      if (l >= 0 && b.kind[l]) { const [lx, ly] = at(l), P = palOf(EL.life); this.beam(x, g + BEAM_H, y, lx, ly, P, 0.12, t); }
      // the Double: a ring under it in Sigil's colour
      const d = s.double[i];
      if (d >= 0 && b.kind[d] === KIND.double) { const [dx, dy] = at(d); B.circle(B.tintBuf, dx, dy, b.r[d] + 0.3, 0.12, palOf(EL.sigil).deep, 0.85); B.ring(B.tintBuf, dx, dy, 0, b.r[d] + 0.3, palOf(EL.sigil).mid, 0.25); }
    }
    // statuses, on every body
    for (let i = 0; i < MAX_BODIES; i++) {
      if (!b.kind[i]) continue;
      const [x, y] = at(i), g = this.ground(x, y), r = b.r[i], h = b.kind[i] === KIND.wizard || b.kind[i] === KIND.double ? 2.7 : Math.max(1.6, Math.min(3.8, r * 6));
      if (b.frozen[i] > 0) { const P = palOf(EL.ice); B.band(B.tintBuf, x, g, y, r + 0.25, g + h * 0.95, P.mid, 0.55, 0.4, r + 0.15); B.band(B.glowBuf, x, g, y, r + 0.26, g + h * 0.95, P.light, 0.15, 0.35, r + 0.16); }
      else if (b.chill[i] > 0.05) B.circle(B.tintBuf, x, y, r + 0.2, 0.1, palOf(EL.cold).mid, 0.4 + 0.5 * b.chill[i]);
      if (b.burn[i] > 0) {
        const P = palOf(EL.fire);
        for (let p = 0; p < 5; p++) { const ph = (t * 1.6 + hash(p, i)) % 1, a = hash(p, i, 1) * TAU; B.blob(B.glowBuf, x + Math.cos(a) * r * 0.7, g + h * (0.3 + 0.7 * ph), y + Math.sin(a) * r * 0.7, 0.22 * (1 - ph) + 0.06, ph < 0.4 ? P.light : P.mid, 1 - ph); }
      }
      if (b.wet[i] > 0) { const P = palOf(EL.water); B.ring(B.tintBuf, x, y, 0, r + 0.25, P.deep, 0.35 * Math.max(0.4, b.soak[i])); for (let p = 0; p < 3; p++) { const ph = (t * 1.2 + hash(p, i)) % 1, a = hash(p, i, 4) * TAU; B.blob(B.tintBuf, x + Math.cos(a) * r, g + h * 0.8 * (1 - ph), y + Math.sin(a) * r, 0.07, P.mid, 0.8); } }
      if (b.stun[i] > 0) { const P = palOf(EL.shield); for (let p = 0; p < 3; p++) { const a = t * 4 + (p / 3) * TAU; B.blob(B.glowBuf, x + Math.cos(a) * 0.45, g + h + 0.2, y + Math.sin(a) * 0.45, 0.13, P.light, 1); } }
    }
  }

  // ---- telegraphs and previews -----------------------------------------------------------------------------------------
  private telegraphs(w: World, t: number): void {
    const b = w.bodies, B = this.batch, enc = w.enc;
    if (enc.state[0]) for (let p = 0; p < MAX_PORTALS; p++) {
      if (!enc.total[p]) continue;
      B.ring(B.tintBuf, enc.px[p], enc.py[p], 0, 1.2, lin('#2a0d33'), 0.6);
      B.circle(B.glowBuf, enc.px[p], enc.py[p], 1.2, 0.12, PORTAL, 0.6 + 0.3 * Math.sin(t * 6 + p));
    }
    for (let i = MAX_SEATS; i < MAX_BODIES; i++) {
      if (b.kind[i] !== KIND.enemy || b.ai[i] !== AI.windup) continue;
      const a = ARCHETYPES[b.arch[i]], f = Math.min(1, b.aiT[i] / Math.max(1, a.windup * 60));
      if (a.attack === ATTACK.slam) {
        const r = a.slamRadius ?? 2;
        B.ring(B.tintBuf, b.lockX[i], b.lockY[i], 0, r * f, SLAM, 0.15, SLAM, 0.35);
        B.circle(B.tintBuf, b.lockX[i], b.lockY[i], r, 0.12, SLAM, 0.4 + 0.5 * f);
      } else if (a.attack === ATTACK.grab) {
        B.strip(B.tintBuf, b.x[i], b.y[i], b.lockX[i], b.lockY[i], 0.18, GRAB, 0.4 + 0.5 * f);
      } else if (a.attack === ATTACK.melee && b.arch[i] !== ARCH.imp) {
        const reach = a.reach + b.r[i] + 0.5, face = b.face[i] * TAU, shy = b.arch[i] === ARCH.shieldbearer, k = shy ? 0.5 : 1;
        B.ring(B.tintBuf, b.x[i], b.y[i], 0, reach, ENEMY, (0.2 + 0.35 * f) * k, ENEMY, (0.35 + 0.45 * f) * k, face - 0.6, face + 0.6);
        B.circle(B.tintBuf, b.x[i], b.y[i], reach, 0.08, ENEMY, (0.5 + 0.5 * f) * k, face - 0.6, face + 0.6);
      }
    }
  }

  private previews(w: World, f: StandinFrame, at: (i: number) => [number, number]): void {
    const s = w.seats, B = this.batch, t = f.t;
    // every seat's held imbued burst (Shift+LMB held): its ring on yourself, else its cone or line toward the aim
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || !s.weaponArm[i] || !(s.prevButtons[i] & BTN.weapon) || !s.queueLen[i] || s.phase[i] !== PHASE.idle) continue;
      const d = Math.hypot(s.aimX[i], s.aimY[i]), onMe = d <= SHAPES.selfAim;
      let spec: SpellSpec;
      try { spec = compile(queueOf(w, i), onMe ? 'area' : 'conjure'); } catch { continue; }
      if (spec.shape === 'todo') continue;
      const P = specPal(spec), [x, y] = at(i), a = i === f.localSeat ? 0.8 : 0.5;
      if (onMe) { const r = SHAPES.novaRadius + (spec.shape === 'quake' ? 1 : 0) + SHAPES.novaPerRune * Math.max(0, spec.power - 1); B.circle(B.tintBuf, x, y, r, 0.1, P.deep, a); B.ring(B.tintBuf, x, y, 0, r, P.mid, 0.12 * a); continue; }
      const st = imbueStretch(d), reach = imbueReach(spec, st), face = Math.atan2(s.aimY[i], s.aimX[i]);
      if (imbueLine(spec)) {
        const ex = x + Math.cos(face) * reach, ey = y + Math.sin(face) * reach, nx = -Math.sin(face) * SHAPES.imbueLineHalf, ny = Math.cos(face) * SHAPES.imbueLineHalf;
        B.strip(B.tintBuf, x, y, ex, ey, SHAPES.imbueLineHalf * 2, P.mid, 0.2 * a);
        B.strip(B.tintBuf, x + nx, y + ny, ex + nx, ey + ny, 0.1, P.deep, a);
        B.strip(B.tintBuf, x - nx, y - ny, ex - nx, ey - ny, 0.1, P.deep, a);
        continue;
      }
      const half = imbueHalf(st) * TAU;
      B.ring(B.tintBuf, x, y, 0.3, reach, P.mid, 0.12 * a, P.mid, 0.3 * a, face - half, face + half);
      B.circle(B.tintBuf, x, y, reach, 0.08, P.deep, a, face - half, face + half);
    }
    // the local seat's Place (Area held) or turret (Force held) preview
    const i = f.localSeat;
    if (i < 0 || i >= MAX_SEATS || !s.active[i] || !s.queueLen[i] || s.phase[i] !== PHASE.idle) return;
    const held = !!(s.prevButtons[i] & BTN.area), aiming = !held && !!(s.prevButtons[i] & BTN.force);
    if (!held && !aiming) return;
    const [bx, by] = at(i), dd = Math.hypot(s.aimX[i], s.aimY[i]), lim = dd > SHAPES.placeRange ? SHAPES.placeRange / dd : 1;
    const cx = w.bodies.x[i] + s.aimX[i] * lim, cy = w.bodies.y[i] + s.aimY[i] * lim, team = lin(X.TEAMS[i % 4].main);
    const reticle = () => { B.circle(B.tintBuf, cx, cy, 0.35, 0.08, team, 0.9); B.ring(B.glowBuf, cx, cy, 0, 0.12, team, 0.8); };
    if (aiming) {
      let spec: SpellSpec;
      try { spec = compile(queueOf(w, i), 'force'); } catch { return; }
      if (spec.shape !== 'turret') return;
      B.circle(B.tintBuf, cx, cy, 0.65, 0.1, palOf(EL.sigil).deep, 0.6);
      reticle();
      return;
    }
    const drag = s.dragged[i] === 1, onMe = !drag && dd <= SHAPES.selfAim;
    let spec: SpellSpec;
    try { spec = compile(queueOf(w, i), 'place', { drag }); } catch { return; }
    if (onMe && (spec.form === EL.shield || spec.form === EL.sigil)) { try { spec = compile(queueOf(w, i), 'area'); } catch { return; } }
    if (spec.shape === 'todo') return;
    const P = specPal(spec), mat = spec.wall === WALL.rock ? ROCK_COL : spec.wall === WALL.ice ? ICE_COL : spec.wall === WALL.barrier ? palOf(EL.shield).mid : P.mid;
    const ghostWall = (pts: [number, number][]) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        B.strip(B.tintBuf, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.4, mat, 0.6);
        B.sheet(B.tintBuf, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.6 * (0.85 + 0.15 * Math.sin(t * 6)), mat, 0.25, mat, 0.0);
      }
    };
    if (spec.shape === 'ring' || spec.shape === 'orbitals' || spec.shape === 'motes') {
      const r = spec.shape === 'ring' ? STRUCT.ringRadius : STRUCT.orbitRadius;
      B.circle(B.tintBuf, bx, by, r, 0.12, mat, 0.8); B.circle(B.tintBuf, bx, by, r * 1.12, 0.06, mat, 0.35);
      return;
    }
    if (spec.shape === 'arcwall') {
      const face = Math.atan2(s.aimY[i], s.aimX[i]), arc = arcShape(dd), half = arc.half * TAU, pts: [number, number][] = [];
      for (let q = 0; q <= 16; q++) { const a = face - half + (2 * half * q) / 16; pts.push([w.bodies.x[i] + Math.cos(a) * arc.r, w.bodies.y[i] + Math.sin(a) * arc.r]); }
      ghostWall(pts);
      return;
    }
    if (spec.shape === 'drawnwall') { ghostWall([[s.holdX[i], s.holdY[i]], [cx, cy]]); reticle(); return; }
    if (spec.shape === 'lineglyph') { B.strip(B.tintBuf, s.holdX[i], s.holdY[i], cx, cy, 0.5, palOf(EL.sigil).mid, 0.5); reticle(); return; }
    if (spec.shape === 'glyph') { const r = glyphRadiusOf(w, i); B.circle(B.tintBuf, cx, cy, r, 0.1, palOf(EL.sigil).deep, 0.8); B.ring(B.tintBuf, cx, cy, 0, r, P.mid, 0.25); reticle(); return; }
    if (spec.shape === 'lens') { B.circle(B.tintBuf, cx, cy, STRUCT.lensRadius, 0.1, palOf(EL.sigil).deep, 0.8); reticle(); return; }
    const r = placeRadius(w, i, spec);
    B.circle(B.tintBuf, cx, cy, r, 0.12, P.deep, 0.9);
    B.ring(B.tintBuf, cx, cy, 0, r, P.mid, 0.25);
    reticle();
    B.strip(B.tintBuf, bx, by, cx, cy, 0.06, team, 0.5);
  }

  // ---- events ---------------------------------------------------------------------------------------------------------
  private events(w: World, f: StandinFrame): void {
    const B = this.batch, now = f.t;
    for (const r of this.recs) {
      const age = now - r.tick / 60;
      if (age < 0 || age > r.life) continue;
      const k = age / r.life, fade = 1 - k, P = r.heal ? palOf(EL.life) : palOf(r.look);
      switch (r.kind) {
        case 'burst': case 'slam': {
          // the sim hits the whole disc at once: its rim stands at the full radius from the first frame, a wave runs out to it
          const Q = r.kind === 'slam' ? { light: SLAM, mid: SLAM, deep: SLAM } : P, grow = Math.min(1, age / 0.22), rr = r.r * (0.3 + 0.7 * grow);
          B.ring(B.tintBuf, r.x, r.y, 0, r.r, Q.mid, 0.2 * fade, Q.deep, 0.4 * fade);
          B.circle(B.tintBuf, r.x, r.y, r.r, 0.22, Q.deep, 0.95 * fade);
          B.circle(B.glowBuf, r.x, r.y, r.r, 0.08, Q.light, fade);
          if (grow < 1) B.circle(B.glowBuf, r.x, r.y, rr, 0.18, Q.light, 0.8);
          // a short wall of light rising off the rim
          const g = this.ground(r.x, r.y);
          if (grow < 1 || k < 0.5) B.band(B.glowBuf, r.x, g, r.y, rr, g + 0.9 * (1 - k), Q.light, 0.5 * fade, 0);
          break;
        }
        case 'imbue': {
          const grow = Math.min(1, age / 0.15), reach = r.r * grow, face = Math.atan2(r.y2 - r.y, r.x2 - r.x);
          if (r.line) {
            const ex = r.x + Math.cos(face) * reach, ey = r.y + Math.sin(face) * reach, nx = -Math.sin(face) * SHAPES.imbueLineHalf, ny = Math.cos(face) * SHAPES.imbueLineHalf;
            B.strip(B.tintBuf, r.x, r.y, ex, ey, SHAPES.imbueLineHalf * 2, P.mid, 0.6 * fade, P.deep, 0.45 * fade);
            B.strip(B.tintBuf, r.x + nx, r.y + ny, ex + nx, ey + ny, 0.12, P.deep, fade);
            B.strip(B.tintBuf, r.x - nx, r.y - ny, ex - nx, ey - ny, 0.12, P.deep, fade);
            B.strip(B.glowBuf, r.x, r.y, ex, ey, 0.15, P.light, fade);
          } else {
            B.ring(B.tintBuf, r.x, r.y, 0.3, reach, P.mid, 0.55 * fade, P.deep, 0.4 * fade, face - r.half, face + r.half);
            B.circle(B.tintBuf, r.x, r.y, reach, 0.18, P.deep, 0.95 * fade, face - r.half, face + r.half);
            B.circle(B.glowBuf, r.x, r.y, reach, 0.08, P.light, fade, face - r.half, face + r.half);
          }
          break;
        }
        case 'zap': {
          const Q = r.heal ? palOf(EL.life) : r.look === EL.fire ? palOf(EL.fire) : palOf(EL.lightning);
          const ga = this.ground(r.x, r.y), gb = this.ground(r.x2, r.y2);
          const pts = zig([r.x, ga + STAFF_H, r.y], [r.x2, gb + 1.1, r.y2], r.tick + r.who * 7, 0.35);
          B.ribbon(B.tintBuf, pts, 0.34, Q.deep, 0.75 * fade);
          B.ribbon(B.glowBuf, pts, 0.16, Q.light, fade);
          B.ribbon(B.glowBuf, pts, 0.06, WHITE, fade);
          B.blob(B.glowBuf, r.x2, gb + 1.1, r.y2, 0.6, Q.mid, fade);
          B.ring(B.tintBuf, r.x2, r.y2, 0, 0.5, Q.deep, 0.5 * fade);
          f.lights?.add(r.x2, gb + 1.2, r.y2, new THREE.Color(...Q.mid), 6 * fade, 6);
          break;
        }
        case 'strike': {
          const Q = palOf(EL.lightning), g = this.ground(r.x, r.y), pts = zig([r.x + 0.6, g + 14, r.y - 0.3], [r.x, g, r.y], r.tick, 0.6);
          if (k < 0.5) { B.ribbon(B.glowBuf, pts, 0.25, Q.light, 1 - k * 2); B.ribbon(B.glowBuf, pts, 0.08, WHITE, 1 - k * 2); }
          B.ring(B.tintBuf, r.x, r.y, 0, 1.2, Q.deep, 0.5 * fade);
          B.circle(B.glowBuf, r.x, r.y, 1.2 * (0.5 + k), 0.1, Q.light, fade);
          f.lights?.add(r.x, g + 2, r.y, new THREE.Color(...Q.mid), 10 * fade, 10);
          break;
        }
        case 'blink': {
          const Q = palOf(EL.shield);
          B.strip(B.tintBuf, r.x, r.y, r.x2, r.y2, 0.5, Q.mid, 0.1 * fade, Q.mid, 0.5 * fade);
          B.circle(B.tintBuf, r.x, r.y, 0.6, 0.1, Q.deep, fade); B.circle(B.tintBuf, r.x2, r.y2, 0.6 + 0.6 * k, 0.12, Q.deep, fade);
          break;
        }
        case 'freeze': case 'shatter': {
          const Q = palOf(EL.ice), rr = r.kind === 'shatter' ? 0.4 + 1.4 * k : 0.9;
          B.circle(B.tintBuf, r.x, r.y, rr, 0.15, Q.deep, fade);
          B.ring(B.tintBuf, r.x, r.y, 0, rr, Q.mid, 0.35 * fade);
          if (r.kind === 'shatter') for (let p = 0; p < 8; p++) { const a = (p / 8) * TAU + hash(p, r.tick), g = this.ground(r.x, r.y); B.ball(r.x + Math.cos(a) * rr, g + 0.8 + 1.2 * k - 2 * k * k, r.y + Math.sin(a) * rr, 0.12 * fade + 0.02, ICE_COL, true, undefined, 1, a); }
          break;
        }
        case 'self': {
          const g = this.ground(r.x, r.y);
          B.band(B.glowBuf, r.x, g + 2.4 * k, r.y, 0.8, g + 2.4 * k + 0.5, P.light, 0.8 * fade, 0);
          B.circle(B.tintBuf, r.x, r.y, 0.9, 0.12, P.deep, fade);
          break;
        }
        case 'blow': {
          const face = Math.atan2(r.y2 - r.y, r.x2 - r.x), reach = Math.max(1, Math.hypot(r.x2 - r.x, r.y2 - r.y));
          B.ring(B.tintBuf, r.x, r.y, reach * 0.5, reach, P.mid, 0.0, P.deep, 0.45 * fade, face - 0.7, face + 0.7);
          break;
        }
        default:
      }
    }
  }
}

/** A zig-zag from a to b (3D points), jittered by `amp` u across, re-rolled by `seed`. */
export function zig(a: [number, number, number], b: [number, number, number], seed: number, amp: number): [number, number, number][] {
  const L = Math.hypot(b[0] - a[0], b[2] - a[2], b[1] - a[1]), n = Math.max(3, Math.round(L / 0.6)), out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, j = i === 0 || i === n ? 0 : 1;
    out.push([a[0] + (b[0] - a[0]) * f + (hash(i, seed) - 0.5) * 2 * amp * j, a[1] + (b[1] - a[1]) * f + (hash(i, seed, 1) - 0.5) * 2 * amp * j, a[2] + (b[2] - a[2]) * f + (hash(i, seed, 2) - 0.5) * 2 * amp * j]);
  }
  return out;
}
