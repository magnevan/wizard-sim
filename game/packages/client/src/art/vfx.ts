/**
 * Spell VFX in the game, ported from the Spell VFX gallery and the Battlefield's effects pass.
 * Two canvases cover the field (art/field.ts) and are redrawn every frame: `ground` under the
 * actors (surfaces, shadows, rings, telegraphs, scorch) and `over` above them (beams, sprays,
 * arcs, missiles, bursts, statuses, pops). Both are crisp Canvas2D pixel art uploaded as one
 * texture each.
 *
 * Inputs are the sim state (channels, missiles, zones, surfaces, statuses: drawn as they are
 * each frame) and the sim's events (turned into short-lived effects with a start time and a
 * seed, kept here and never in the sim). The look rule holds throughout: the shape comes from
 * the spell's form, the material from its look element (arcane + fire is a fire beam, earth +
 * fire a fireball, earth + cold an ice boulder).
 */
import { Sprite, Texture } from 'pixi.js';
import {
  EV, BATTERY, CELL, DEVICE, ECHO_LAG, sprayReach, KIND, MAX_DEVICES, MAX_MISSILES, MAX_SEATS, MAX_WALLS, MAX_ZONES, N_EL, PF, PHASE, QUEUE_MAX, RHYTHM, SHAPES, STATUS, STRUCT, terrainNear, SURF, T, WALL, ZONE,
  compile, elementName, possessed, queueFromCounts, specOf,
  type SimEvent, type SpellSpec, type World,
} from '@wizard-sim/sim';
import { FIELD, gx, gy } from './field';
import { BARREL_RISE, headTip, liveHeads, towerTip } from './props';
import { flameJet, pilotFlame } from './flame-jet';
import { towersLit } from './power-down';
import { roomView } from '../room-views';
import { toX, toY } from '../iso-world';
import { PPU } from '../camera';
import * as A from './accent';
import { depthOf, rowsHidden } from './depth';
import * as K from './kit';
import { drawNova, hasNova, novaStretch } from './novas';
import { AimTrail, sprayJet, type JetKind } from './spray-jet';
import * as RF from './rock-flight';
import { SPLASH_LIGHT, beamImpact, wallSplash, type SplashKind } from './wall-splash';
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import type { Frame } from './actors';
import { HEIGHT, WIDTH, type Anchors, type RigKind } from './rigs';
import { FY, TAU, clamp, easeOut, emit, lerp, mod, rand, seg, smooth } from './util';
import { Sil } from './sil';

const EL = X.EL;

/** What the view knows about a body this frame: its feet in field px, its anchors and rig. */
export interface BodyView { on: boolean; x: number; y: number; a: Anchors | null; rig: RigKind; seat: number; f: Frame | null }
export type LightFn = (x: number, y: number, r: number, col: string, a: number, soft?: boolean) => void;
/** A little unsteadiness, so a held beam's light is alive. */
const flick = (t: number, seed: number): number => 0.9 + 0.1 * Math.sin(t * 17 + seed);
const beamRamp = (spec: SpellSpec, look: string): Ramp => spec.heal ? X.LIFE_L : look === 'fire' ? EL.fire : look === 'cold' ? X.FROST : ramp(spec.look);
const splashKind = (spec: SpellSpec, look: string): SplashKind => spec.heal && look !== 'water' ? 'warm' : spec.scald ? 'scald' : look === 'fire' ? 'fire' : frosty(look) ? 'cold' : 'water';
/** Light along a line on the ground, a row of overlapping lights, each dimmer to make up for the overlap. */
function glowAlong(light: LightFn, ax: number, ay: number, bx: number, by: number, r: number, col: string, a: number): void {
  const n = Math.max(1, Math.min(10, Math.ceil(Math.hypot(bx - ax, by - ay) / (r * 0.85))));
  for (let q = 0; q <= n; q++) light(ax + ((bx - ax) * q) / n, ay + ((by - ay) * q) / n, r, col, a * 0.7);
}

/** A short-lived effect born from an event. */
/** A spray or beam meeting a wall, for the frame it's drawn. */
interface Strike { x: number; y: number; ux: number; uy: number; kind: SplashKind | 'beam'; t0: number; seed: number; power: number; R?: Ramp }
interface Fx {
  kind: string; t0: number; life: number; seed: number;
  x: number; y: number; x2: number; y2: number;
  look: number; who: number; r: number; n: number;
  text?: string; els?: number[];
  /** A missile's flags (PF) and its tier (the spell's runes), for its impact. */
  flags?: number; tier?: number;
  /** A defence's ring: only the half on the enemy's side of the wall is drawn. */
  half?: boolean;
}

/** An element id's name ('arcane' for none): the key of its ramp in X.EL. */
export const elName = (id: number): string => (id >= 1 && id <= N_EL ? elementName(id) : 'arcane');
export const ramp = (id: number): Ramp => EL[elName(id)] ?? EL.arcane;
/** Cold and Ice share the frosty branches; Ice draws them in its own ramp (EL.ice) where a ramp is picked by look. */
export const frosty = (el: string): boolean => el === 'cold' || el === 'ice';
/** The imbue's colours by resistance column (guards.ts RES: physical, fire, cold, lightning, arcane). */
const IMBUE: readonly Ramp[] = [EL.earth, EL.fire, X.FROST, EL.lightning, EL.arcane];
/** The seats' default staff orbs (the Battlefield's: Red arcane, Blue cold, Gold lightning, Violet earth). */
const SEAT_EL = [6, 4, 5, 9];
const STAFF_Z = 10; // missiles fly about this high (art px)
const EL_COLD = 4; // Cold's element id (sim elements.ts)
/** A missile's tier for its look: the runes it carries, 1..5. */
const tierOf = (els: Uint8Array, j: number): number => { let s = 0; for (let k = 0; k < N_EL; k++) s += els[j * N_EL + k]; return clamp(s, 1, 5); };
const LIFT = 9; // a beam or spray end is lifted to about chest height
/** How far below a far-side hit (art px) the foot of the wall's near face is. */
const FAR_FOOT = 6;
/** Timed effects that read over everything: numbers, banners, and arcs, which join two points. */
const DEPTHLESS: ReadonlySet<string> = new Set(['pop', 'banner', 'zap']);
/** Timed effects that lie out over the ground from where they happen. */
const SPREADS: ReadonlySet<string> = new Set(['patch', 'nova', 'quake', 'slam', 'blast', 'geyser', 'healburst']);
/** How far above the ground a beam or spray is drawn, with a little to spare: above this a standing thing is taken to hide it. */
const CHEST = LIFT + 3;
/** The colour an enemy hidden behind a wall shows through it in. */
const GHOST = '#ff6a4a';
/** How far past the wall's line a defence's jet is still over the wall's top, units: there the wall's pieces don't hide it. */
const JET_OVER_WALL = 1.5;
/** A late remote spell (rollback) catches up with where it really is over this much real time, s. */
const CATCH_S = 0.15;
/** Floors fade out over their last second (ticks), in this many dither steps. */
export const FLOOR_FADE = 60;
const FADE_STEPS = 6;
/** How much of a floor cell is still drawn, given its sim life in ticks: 1, then down in steps to 1/FADE_STEPS. */
export const floorFade = (life: number): number => (life >= FLOOR_FADE ? 1 : Math.max(1, Math.floor((FADE_STEPS * life) / FLOOR_FADE)) / FADE_STEPS);

/** The fire ramp as pixel values (ImageData's byte order, opaque), for the flames' buffer. */
const F32 = EL.fire.map((h) => { const [r, g, b] = X.hex(h); return (0xff << 24 | b << 16 | g << 8 | r) >>> 0; });

/** Seconds a cast's sound takes to reach the ear (measured: about 0.06). It can't start sooner, so the burst waits for it. */
const HEARD = 0.06;

export class Vfx {
  /** The local player's seat: their ring is solid and their rune swirl sparse (their HUD shows the detail). */
  localSeat = 0;
  /** The imbue draws the ward's skin (art/sil.ts). */
  private sil = new Sil();
  readonly ground: Sprite;
  readonly over: Sprite;
  /** Reports what stands in the scene: texture, top-left and foot y, in field px. Set by the view. */
  occluders: ((emit: (tex: Texture, x: number, y: number, footY: number, solid: boolean, z: number, piece?: boolean) => void) => void) | null = null;
  /** This frame's walls and furniture, for behind(). */
  private solids: { tex: Texture; x: number; y: number; footY: number; z: number; piece: boolean }[] = [];
  /** The bodies, which only the novas' far pass goes behind (novaDepth). */
  private softs: { tex: Texture; x: number; y: number; footY: number; z: number; piece: boolean }[] = [];
  private cover: { tex: Texture; x: number; y: number; rows: number }[] = [];
  private gh = X.canvas(96, 96);
  /** Every enemy's sprite, its spot in the field and its sort key: those a wall stands in front of show through it (ghosts). */
  ghostSource: ((emit: (tex: Texture, x: number, y: number, z: number) => void) => void) | null = null;
  /** This frame's sprays that struck the face of a wall we can see: drawn last, over the wall. */
  private strikes: Strike[] = [];
  /** Where this frame's beams and sprays struck the far side of something: what's there hides them whole. */
  private farHits: Pt[] = [];
  /** The beams and sprays, drawn apart so what's in front can hide them. */
  private b = X.canvas(FIELD.W, FIELD.H);
  private g = X.canvas(FIELD.W, FIELD.H);
  private o = X.canvas(FIELD.W, FIELD.H);
  private surf = X.canvas(FIELD.W, FIELD.H);
  private gt: Texture; private ot: Texture;
  private fx: Fx[] = [];
  /** What the floor canvas was painted for: each cell's kind and fade step (repainted when any changes). */
  private surfSeen = new Uint8Array(0);
  /** surfaces()' scratch: the burning cells along a row whose embers draw together. */
  private runCells: number[] = [];
  // per slot: when a zone or a lobbed stone appeared, and the stone's flight time
  private zoneT0 = new Float64Array(MAX_ZONES);
  private zoneType = new Uint8Array(MAX_ZONES);
  private mT0 = new Float64Array(MAX_MISSILES);
  private mLife0 = new Int32Array(MAX_MISSILES);
  private mAlive = new Uint8Array(MAX_MISSILES);
  private mType = new Uint8Array(MAX_MISSILES);
  private mLook = new Uint8Array(MAX_MISSILES);
  private mX = new Float64Array(MAX_MISSILES); private mY = new Float64Array(MAX_MISSILES);
  private mVX = new Float64Array(MAX_MISSILES); private mVY = new Float64Array(MAX_MISSILES);
  // per seat: the queued motes and when each arrived; when the channel started
  private motes: { el: number; tq: number }[][] = [[], [], [], []];
  // per body: last heal (for sparkles that follow the body)
  healAt = new Float64Array(128).fill(-9);
  /** Events another view part (view-structures.ts) already turned into effects: skipped here. */
  readonly skip = new Set<SimEvent>();

  // ---- late remote spells (rollback): shown from their first frame, fast-forwarded ----------------
  // A remote cast usually reaches us a few ticks after it happened; rollback then inserts it in the
  // past, and the replay skips the view (it would play effects twice). Without help, the missile
  // pops in mid-flight and the beam at full length. Instead the replay notes where each new
  // missile started and which casts we never showed, and after it the missile is drawn sliding
  // from its start to where it really is over CATCH_S of real time, a channel plays its opening
  // at speed, and the cast flash plays. Purely cosmetic: the sim never sees any of it.
  /** Off: late spells pop in where they are (for comparing in the Network test). */
  catchUp = true;
  /** Missile slots alive before the current step (beforeStep), to see which ones a replayed step made. */
  private rpAlive = new Uint8Array(MAX_MISSILES);
  /** Per missile slot: the tick a replayed step spawned it and where (-1: none). */
  private spTick = new Int32Array(MAX_MISSILES).fill(-1);
  private spX = new Float64Array(MAX_MISSILES); private spY = new Float64Array(MAX_MISSILES);
  /** Per missile slot / seat: the real time (s) a catch-up began; -1 pending (set at the next draw), NaN none. */
  private mCatch = new Float64Array(MAX_MISSILES).fill(NaN);
  private chCatch = new Float64Array(MAX_SEATS).fill(NaN);
  /** Per seat: channelling or charging as of the last shown step. */
  private chanSeen = new Uint8Array(MAX_SEATS);
  /** Cast events already shown, as tick * 8 + seat (recent ones only), and late ones a replay found. */
  private shownCast = new Set<number>();
  private late: SimEvent[] = [];
  /** Late spells caught up so far (missiles, channels, casts), for the Network test. */
  readonly caught = { missiles: 0, channels: 0, casts: 0 };

  /** Before every step, shown or replayed. */
  noteBefore(w: World): void { this.rpAlive.set(w.missiles.alive); }

  /** After a step the rollback replay runs (the view skips its effects): note late remote spell starts. */
  replayStep(w: World): void {
    const m = w.missiles, tick = w.clock[0];
    for (let j = 0; j < MAX_MISSILES; j++) if (m.alive[j] && !this.rpAlive[j]) { this.spTick[j] = tick; this.spX[j] = m.x[j] - m.vx[j] / 60; this.spY[j] = m.y[j] - m.vy[j] / 60; }
    for (const e of w.events) if (e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS && e.who !== this.localSeat && !this.shownCast.has(e.tick * 8 + e.who)) this.late.push(e);
  }

  /** The replay is done (t = sim seconds now): start the catch-ups. Returns the late cast events, for the poses. */
  postRewind(w: World, t: number): SimEvent[] {
    const m = w.missiles, s = w.seats, tick = w.clock[0];
    if (this.catchUp) {
      for (let j = 0; j < MAX_MISSILES; j++) {
        if (!m.alive[j] || this.mAlive[j] || this.spTick[j] < 0 || this.spTick[j] >= tick || m.owner[j] === this.localSeat) continue;
        this.mAlive[j] = 1; this.mT0[j] = this.spTick[j] / 60; this.mLife0[j] = m.life[j] + (tick - this.spTick[j]);
        this.mType[j] = m.type[j]; this.mLook[j] = m.look[j]; this.mX[j] = m.x[j]; this.mY[j] = m.y[j]; this.mVX[j] = m.vx[j]; this.mVY[j] = m.vy[j];
        this.mCatch[j] = -1; this.caught.missiles++;
      }
      for (let i = 0; i < MAX_SEATS; i++) {
        const on = s.active[i] && (s.phase[i] === PHASE.channel || s.phase[i] === PHASE.charge);
        if (on && !this.chanSeen[i] && i !== this.localSeat && s.chanTicks[i] > 1) { this.chCatch[i] = -1; this.chanSeen[i] = 1; this.caught.channels++; }
      }
    }
    this.spTick.fill(-1);
    const late = this.late;
    this.late = [];
    if (!this.catchUp) return [];
    for (const e of late) { this.shownCast.add(e.tick * 8 + e.who); this.onEvent(w, e, t, [], [], () => false); this.caught.casts++; }
    return late;
  }

  /** How far a catch-up that began at c0 has got at real time ct (0..1, eased); 1 when there is none. */
  private catchK(c: Float64Array, i: number, ct: number): number {
    const c0 = c[i];
    if (Number.isNaN(c0)) return 1;
    if (c0 < 0) { c[i] = ct; return 0; }
    const k = (ct - c0) / CATCH_S;
    if (k >= 1) { c[i] = NaN; return 1; }
    return 1 - (1 - k) * (1 - k);
  }
  /** Where missile j is drawn: its true spot, or on its way there from where it started while catching up. */
  missileAt(w: World, j: number, ct: number): Pt {
    const m = w.missiles, k = this.catchK(this.mCatch, j, ct);
    return k >= 1 ? [m.x[j], m.y[j]] : [lerp(this.spX[j], m.x[j], k), lerp(this.spY[j], m.y[j], k)];
  }

  constructor() {
    this.gt = Texture.from(this.g.c); this.gt.source.scaleMode = 'nearest';
    this.ot = Texture.from(this.o.c); this.ot.source.scaleMode = 'nearest';
    this.ground = new Sprite(this.gt);
    this.over = new Sprite(this.ot);
  }

  /** FIELD changed size (a world with another play area): new canvases and textures to match. */
  resize(): void {
    this.surf = X.canvas(FIELD.W, FIELD.H);
    this.remake(FIELD.W, FIELD.H);
    this.surfSeen = new Uint8Array(0);
  }
  private remake(W: number, H: number): void {
    this.g = X.canvas(W, H); this.o = X.canvas(W, H); this.b = X.canvas(W, H);
    const old = [this.gt, this.ot];
    this.gt = Texture.from(this.g.c); this.gt.source.scaleMode = 'nearest';
    this.ot = Texture.from(this.o.c); this.ot.source.scaleMode = 'nearest';
    this.ground.texture = this.gt; this.over.texture = this.ot;
    for (const t of old) t.destroy(true);
    this.wx = this.wy = 0;
  }

  /**
   * The two effect canvases hold only the part of the field in view (a window, in field px), not the
   * whole field: they are cleared, drawn and re-uploaded every frame, and Survive's field is several
   * times the view. Drawing still happens in field px (the canvases are translated by the window), so
   * nothing else changes. The view calls this before draw with the field rect it shows; the sprites go
   * at the window's origin (wx, wy). A view bigger than the field gets the whole field, as before.
   */
  wx = 0;
  wy = 0;
  view(x0: number, y0: number, w: number, h: number): void {
    // sizes in steps of 32 px, so a camera easing about doesn't remake the canvases
    const W = Math.min(FIELD.W, Math.ceil(w / 32) * 32), H = Math.min(FIELD.H, Math.ceil(h / 32) * 32);
    if (W !== this.g.c.width || H !== this.g.c.height) this.remake(W, H);
    this.wx = Math.max(0, Math.min(FIELD.W - W, Math.floor(x0)));
    this.wy = Math.max(0, Math.min(FIELD.H - H, Math.floor(y0)));
  }

  /** Draws what lies under every effect (the scorch marks) into the ground canvas, given the window (field px). Set by the view. */
  underlay: ((g: Ctx, wx: number, wy: number, W: number, H: number) => void) | null = null;

  /** Where the wave banner goes, in field px: the top middle of the view (set by the view each frame). */
  bannerX = 0;
  bannerY = 0;

  /** The battery's stakes break here (world point, the view's turned world): splinters and dust. */
  splinters(x: number, y: number, t: number, seed: number): void { this.add('splinters', t, 0.9, { x, y, seed }); }

  private add(kind: string, t0: number, life: number, o: Partial<Fx>): void {
    if (this.fx.length > 500) this.fx.shift();
    this.fx.push({ kind, t0, life, seed: 0, x: 0, y: 0, x2: 0, y2: 0, look: 0, who: -1, r: 0, n: 0, ...o });
  }

  /** After each sim step: turn events and slot changes into effects. t = sim seconds of the new state. */
  afterStep(w: World, t: number): void {
    const m = w.missiles, z = w.zones, b = w.bodies, tick = w.clock[0];
    // missiles that ended this step: impacts (heal-stones burst through their 'burst' event)
    const healStones: Pt[] = [];
    for (let j = 0; j < MAX_MISSILES; j++) {
      const live = m.alive[j] && !m.wait[j] ? 1 : 0; // one waiting at its caster's staff (a staggered volley) isn't in the air yet
      if (live && !this.mAlive[j]) { this.mT0[j] = t; this.mLife0[j] = m.life[j]; }
      if (!live && this.mAlive[j] && !m.alive[j]) {
        if (this.mType[j] === 3) healStones.push([this.mX[j], this.mY[j]]);
        else this.add('impact', t, 1.4, { x: this.mX[j], y: this.mY[j], x2: this.mVX[j], y2: this.mVY[j], look: this.mLook[j], n: this.mType[j], seed: tick * 7 + j, r: m.r[j], flags: m.flags[j], tier: tierOf(m.els, j), els: Array.from(m.els.subarray(j * N_EL, j * N_EL + N_EL)) });
      }
      this.mAlive[j] = live;
      if (!live) this.mCatch[j] = NaN;
      if (live) { this.mType[j] = m.type[j]; this.mLook[j] = m.look[j]; this.mX[j] = m.x[j]; this.mY[j] = m.y[j]; this.mVX[j] = m.vx[j]; this.mVY[j] = m.vy[j]; }
    }
    // zones: when each began, and which ended this step
    const ended: { type: number; x: number; y: number }[] = [];
    for (let k = 0; k < MAX_ZONES; k++) {
      if (z.type[k] && z.type[k] !== this.zoneType[k]) this.zoneT0[k] = t;
      if (!z.type[k] && this.zoneType[k]) ended.push({ type: this.zoneType[k], x: z.x[k], y: z.y[k] });
      this.zoneType[k] = z.type[k];
    }
    const near = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) < 0.6;
    for (const e of w.events) if (!this.skip.has(e)) this.onEvent(w, e, t, ended, healStones, near);
    this.skip.clear();
    const s = w.seats;
    for (let i = 0; i < MAX_SEATS; i++) {
      this.chanSeen[i] = s.active[i] && (s.phase[i] === PHASE.channel || s.phase[i] === PHASE.charge) ? 1 : 0;
      if (!this.chanSeen[i]) this.chCatch[i] = NaN;
    }
    if (this.shownCast.size > 64) for (const k of this.shownCast) if (k < (tick - 300) * 8) this.shownCast.delete(k);
    this.fx = this.fx.filter((f) => t - f.t0 < f.life);
    void b;
  }

  private onEvent(w: World, e: SimEvent, t: number, ended: { type: number; x: number; y: number }[], healStones: Pt[], near: (a: number, b: number, c: number, d: number) => boolean): void {
    const seed = e.tick * 13 + (e.who + 2) * 101 + Math.round(e.x * 7);
    const look = e.look ?? 0, who = e.who;
    const spec = (): SpellSpec | null => (who >= 0 && who < MAX_SEATS && w.seats.active[who] ? specOf(w, who) : null);
    switch (e.kind) {
      case 'cast':
        if (who < 0) { if (e.text) this.add('banner', t, 2.4, { text: e.text }); return; }
        this.shownCast.add(e.tick * 8 + who);
        this.add('release', t + HEARD, 0.25, { who, look, els: this.motes[who]?.map((q) => q.el) });
        if (spec()?.shape === 'self') this.add('self', t, 1.0, { who, look, x: e.x, y: e.y, seed });
        return;
      case 'hit': case 'heal': {
        const amt = Math.round(e.amount ?? 0);
        if (e.kind === 'heal') this.healAt[who] = t;
        // a body taking hit after hit (a beam, a spray) shows one number that keeps counting up
        const heal = e.kind === 'heal' ? 1 : 0, open = !e.text && this.fx.find((f) => f.kind === 'pop' && f.who === who && f.look === heal && !f.text && t - f.t0 < 0.45);
        if (open) { open.n += amt; open.t0 = t; }
        else if (amt > 0 || e.text) this.add('pop', t, 0.9, { who, x: e.x, y: e.y, n: amt, look: heal, text: e.text, seed });
        return;
      }
      case 'zap': {
        const sp = spec(), x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y;
        if (sp?.shape === 'strike' && Math.abs(x2 - e.x) < 1e-6) { this.add('strike', t, 0.6, { x: x2, y: y2, look, seed }); return; }
        const style = look === 8 ? 'flame' : look === 2 || sp?.heal ? 'life' : 'bolt';
        this.add('zap', t, sp?.shape === 'discharge' ? 0.22 : 0.18, { who, x: e.x, y: e.y, x2, y2, look, seed, text: style });
        if (sp?.shape === 'discharge' && !this.fx.some((f) => f.kind === 'discharge' && f.who === who && t - f.t0 < 0.05)) this.add('discharge', t, 0.45, { who, x: e.x, y: e.y, look, seed });
        return;
      }
      case 'burst': {
        if (e.ev === EV.dismiss) return;
        const r = e.amount ?? 1;
        // the battery's well failing (sim/src/battery-waves.ts): the gate's fire gutters, and your own fire wells up in you
        if (e.ev === EV.wellDry) return; // the well's light just goes out (art/lighting.ts)
        if (e.ev === EV.gutter) { this.add('surge', t, 0.45, { x: e.x, y: e.y, seed }); return; }
        if (e.ev === EV.infuse) { this.add('kindle', t, 1.8, { x: e.x, y: e.y, r, look, seed }); return; }
        const zone = ended.find((q) => near(q.x, q.y, e.x, e.y));
        if (zone) { this.add(zone.type === ZONE.geyser ? 'geyser' : 'blast', t, 2.6, { x: e.x, y: e.y, r, look, seed }); return; }
        if (healStones.some((p) => near(p[0], p[1], e.x, e.y))) { this.add('healburst', t, 1.8, { x: e.x, y: e.y, r, look, seed }); return; }
        if (who >= MAX_SEATS) { this.add('slam', t, 1.3, { x: e.x, y: e.y, r, look, seed }); return; }
        const shape = spec()?.shape ?? 'nova';
        if (shape === 'swing' || shape === 'palm') this.add(shape, t, shape === 'palm' ? 0.9 : 0.4, { who, x: e.x, y: e.y, r, look, seed, x2: w.bodies.x[who], y2: w.bodies.y[who] });
        else if (shape === 'patch') { if (!spec()?.scald && !this.rainAt(w, e.x, e.y)) this.add('patch', t, 1.0, { x: e.x, y: e.y, r, look, seed }); } // rain draws as its zone, for its whole life
        // a bigger ring plays slower, its wave travelling at the same speed (art/novas.ts novaStretch), so it lives longer
        else this.add(shape === 'quake' ? 'quake' : 'nova', t, (look === 8 ? 1.8 : 1.3) * (shape === 'quake' ? 1 : Math.max(1, novaStretch(r * 16))), { who, x: e.x, y: e.y, r, look, seed, half: !!w.battery && who >= 0 && who < MAX_SEATS && w.battery.drive[who] >= 0 }); // the fire ring's scorch and smoke outlast the blast
        return;
      }
      case 'blink': this.add('blink', t, 0.4, { who, x: e.x, y: e.y, x2: e.x2 ?? e.x, y2: e.y2 ?? e.y, seed }); return;
      case 'shatter': this.add('shatter', t, 1.6, { x: e.x, y: e.y, seed }); return;
      case 'freeze': this.add('freeze', t, 0.5, { who, x: e.x, y: e.y, seed }); return;
      case 'surge': this.add('surge', t, 0.45, { x: e.x, y: e.y, seed }); return;
      case 'cancel': this.add('cancel', t, 0.3, { who, look, seed }); return;
      case 'dry': this.add('dry', t, 0.5, { who, x: e.x, y: e.y, seed }); return;
      // a death ('fizzle', 'dies') plays in art/deaths.ts, from the view
      default:
    }
  }

  /**
   * Redraw both canvases. t is sim time (with interpolation): event effects, missiles and other sim state
   * age by it. ct is the cosmetic clock (real time): loops, flicker, swirls, fire sheets and particle
   * drift run on it, so they keep moving while the sim waits on the network or is paused.
   * bodies[i] says where body i stands this frame.
   */
  draw(w: World, t: number, bodies: BodyView[], light: LightFn, structures?: (g: Ctx, o: Ctx) => void, ct = t): void {
    const g = this.g.x, o = this.o.x, W = this.g.c.width, H = this.g.c.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(1, 0, 0, 1, -this.wx, -this.wy);
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, W, H); o.setTransform(1, 0, 0, 1, -this.wx, -this.wy);
    g._fs = o._fs = null;
    this.underlay?.(g, this.wx, this.wy, W, H); // the scorch marks (view-structures.ts Scorch)
    this.solids.length = 0; this.softs.length = 0;
    this.occluders?.((tex, x, y, footY, solid, z, piece) => { (solid ? this.solids : this.softs).push({ tex, x, y, footY, z, piece: !!piece }); });
    const room = roomView(w);
    room.ground?.(g, w, ct, light); // the mode's ground marks, under everything (the battery's glyph paths)
    this.surfaces(w, ct, light);
    this.zones(w, t, light, ct);
    this.groundMarks(w, bodies, t);
    if (structures) { structures(g, o); g._fs = o._fs = null; }
    const hidden: { f: Fx; ux: number; uy: number }[] = [];
    for (const f of this.fx) {
      if (t < f.t0) continue;
      const far = f.kind === 'impact' && this.occluders ? this.farFace(w, f) : null;
      if (far) hidden.push({ f, ux: far.ux, uy: far.uy });
      else this.fxDepth(f, t, w, bodies, light);
    }
    if (hidden.length) this.impactsBehind(hidden, t, w, bodies, light);
    this.missiles(w, t, light, ct);
    this.occludedChannels(w, ct, bodies, light);
    this.pilots(w, ct, light);
    room.overBodies?.(this.o.x, w, bodies, ct); // the mode's prompts over the wizards (the battery's X key)
    this.casters(w, ct, bodies, light);
    this.statuses(w, t, bodies, light, ct);
    this.ghosts();
    this.bars(w, bodies);
    this.gt.source.update(); this.ot.source.update();
  }

  /**
   * Beams and sprays are drawn over the standing things, but they run at about chest height along the
   * ground, so whatever stands in front of them should hide them. They go on a layer of their own, and
   * each thing near them cuts its silhouette out of that layer, down to where the effect would be in front of it.
   */
  private occludedChannels(w: World, t: number, bodies: BodyView[], light: LightFn): void {
    const s = w.seats, real = this.o;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < MAX_SEATS; i++) {
      const v = bodies[i];
      if (!s.active[i] || s.phase[i] !== PHASE.channel || !v?.on) continue;
      const ex = gx(s.chanEndX[i]), ey = gy(s.chanEndY[i]);
      x0 = Math.min(x0, v.x, ex); x1 = Math.max(x1, v.x, ex); y0 = Math.min(y0, v.y, ey); y1 = Math.max(y1, v.y, ey);
    }
    // a fixture's fire comes from its head, above everything near it, so nothing standing hides it
    let driven = false;
    for (let i = 0; i < MAX_SEATS; i++) if (possessed(w, i)) driven = true;
    if (x1 < x0 || !this.occluders || driven) { this.channels(w, t, bodies, light); this.drawStrikes(t, light); return; }
    let lowest = -Infinity;
    for (let i = 0; i < MAX_SEATS; i++) if (s.active[i] && s.phase[i] === PHASE.channel && bodies[i]?.on) lowest = Math.max(lowest, bodies[i].y);
    const b = this.b.x, M = 44;
    x0 -= M; y0 -= M + 30; x1 += M; y1 += M;
    this.farHits.length = 0;
    this.scratchStart();
    this.channels(w, t, bodies, light);
    this.o = real;
    b.globalCompositeOperation = 'destination-out';
    this.occluders((tex, x, y, footY, solid) => {
      const f = tex.frame;
      if (!f) return;
      // every caster is behind this wall or desk: none of the effect can be in front of it, right down to its foot
      const whole = solid && (lowest < footY || this.farHits.some(([hx, hy]) => footY > hy - 24 && x < hx + 44 && x + f.width > hx - 44));
      const h = whole ? f.height : Math.min(f.height, Math.floor(footY - CHEST - y));
      if (h <= 0 || x > x1 || x + f.width < x0 || y > y1 || y + h < y0) return;
      const img = tex.source?.resource as CanvasImageSource | undefined;
      if (img) b.drawImage(img, f.x, f.y, f.width, h, x, y, f.width, h);
    });
    this.scratchBlit(real);
    this.drawStrikes(t, light);
  }

  /**
   * Draws something anchored on the ground at (ax, ay), reaching no further than R from there (and
   * up to 70 px above): whatever stands in front of that spot hides it, by the order the sprites sort
   * in. With nothing in front (the usual case) it goes straight on the layer. `spread`: it lies over
   * the ground out to R, so it can also pass behind things sorted behind its centre (art/depth.ts).
   * `overWalls`: it's high enough to pass over the wall pieces (not the props), so only props hide it.
   */
  behind = (ax: number, ay: number, R: number, draw: (o: Ctx) => void, spread = false, bodiesToo = false, overWalls = false): void => {
    if (this.o === this.b || this.inBehind) { draw(this.o.x); return; } // already inside a pass
    const z = depthOf(ay), x0 = Math.floor(ax - R - 24), x1 = Math.ceil(ax + R + 24), y0 = Math.floor(ay - R - 70), y1 = Math.ceil(ay + R + 24), reach = ay - R * FY;
    const cover = this.cover;
    cover.length = 0;
    for (const s of bodiesToo ? [...this.solids, ...this.softs] : this.solids) {
      const f = s.tex.frame;
      if (!f || (overWalls && s.piece) || s.x > x1 || s.x + f.width < x0 || s.y > y1 || s.y + f.height < y0) continue;
      const rows = rowsHidden(f.height, s.y, s.footY, s.z, z, reach, spread, CHEST);
      if (rows > 0) cover.push({ tex: s.tex, x: s.x, y: s.y, rows });
    }
    if (!cover.length) { draw(this.o.x); return; }
    const real = this.o, W = x1 - x0, H = y1 - y0;
    // A small canvas of its own, cleared whole. Copying from a canvas snapshots it, and the next write that leaves
    // any of it standing copies all of it first; a clear of the whole canvas lets the browser drop the old pixels
    // instead. So no clip either: what's drawn past the box lands outside the part copied, and goes at the next clear.
    const d = this.scratch(W, H), b = d.x;
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, d.c.width, d.c.height);
    b.setTransform(1, 0, 0, 1, -x0, -y0); b.save(); b._fs = null;
    this.o = d; this.inBehind = true;
    draw(b);
    this.o = real; this.inBehind = false;
    b.restore(); b._fs = null;
    b.globalCompositeOperation = 'destination-out';
    for (const c of cover) {
      const f = c.tex.frame, img = c.tex.source?.resource as CanvasImageSource | undefined;
      // only the part of the picture inside the box: a wall has dozens of pieces, and each costs its area
      const l = Math.max(c.x, x0), t = Math.max(c.y, y0), r = Math.min(c.x + f.width, x1), d = Math.min(c.y + c.rows, y1);
      if (img && r > l && d > t) b.drawImage(img, f.x + l - c.x, f.y + t - c.y, r - l, d - t, l, t, r - l, d - t);
    }
    b.globalCompositeOperation = 'source-over';
    const o = real.x;
    o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.drawImage(d.c, 0, 0, W, H, x0 - this.wx, y0 - this.wy, W, H); o.restore();
    o._fs = null;
  };
  /** behind()'s scratch canvases, by size class (powers of two): a small box never pays for a big canvas. */
  private scratches = new Map<number, ReturnType<typeof X.canvas>>();
  private inBehind = false;
  private scratch(W: number, H: number): ReturnType<typeof X.canvas> {
    const cls = (n: number) => Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, n))));
    const cw = cls(W), ch = cls(H), key = cw * 65536 + ch;
    let d = this.scratches.get(key);
    if (!d) { d = X.canvas(cw, ch); this.scratches.set(key, d); }
    return d;
  }

  /** A timed effect, behind what stands in front of where it happens. */
  private fxDepth(f: Fx, t: number, w: World, bodies: BodyView[], light: LightFn): void {
    if (f.kind === 'nova' && !f.half && hasNova(f.look)) { this.novaDepth(f, t, bodies, light); return; }
    const who = f.who >= 0 && f.who < bodies.length ? bodies[f.who] : null, placed = f.x !== 0 || f.y !== 0, e = t - f.t0;
    if (!DEPTHLESS.has(f.kind) && (placed || who?.on)) {
      const spread = SPREADS.has(f.kind), R = spread ? Math.max(f.r * 16, 64) * 1.2 + 40 : 60;
      this.behind(placed ? gx(f.x) : who!.x, placed ? gy(f.y) : who!.y, R, () => this.drawFx(f, e, t, w, bodies, light), spread);
    } else this.drawFx(f, e, t, w, bodies, light);
  }

  /**
   * A nova in two passes (art/novas.ts): the arc behind its centre goes behind every body and prop standing in front
   * of the centre, the caster included (the user, 2026-11-11: the back of the ring covered the caster in its first
   * frames); the arc in front goes over them. The wave drags along after a caster who moves, most of the way, while
   * what it leaves on the floor stays where it was cast.
   */
  private novaDepth(f: Fx, t: number, bodies: BodyView[], light: LightFn): void {
    const e = t - f.t0, mx = gx(f.x), my = gy(f.y), r = f.r * 16, sd = f.seed, g = this.g.x;
    const b = f.who >= 0 && f.who < bodies.length ? bodies[f.who] : null, drag = b?.on ? 0.8 : 0;
    const x = lerp(mx, b?.on ? b.x : mx, drag), y = lerp(my, b?.on ? b.y : my, drag), R = Math.max(r, 64) * 1.2 + 40;
    this.behind(x, y - 1, R, (c) => { drawNova(c, g, f.look, x, y, r, e, t, sd, light, 'far', mx, my); }, true, true);
    this.behind(x, y + 1, R, (c) => { drawNova(c, g, f.look, x, y, r, e, t, sd, light, 'near', mx, my); });
  }

  /** Point the drawing at the scratch layer, cleared. */
  /**
   * An enemy behind a wall shows through it as a flat silhouette, only where a wall piece in front of it covers it,
   * so what you can see of it is untouched. The battery's wall hides about 4 units of ground behind it, which is
   * where the enemies attacking a defence stand.
   */
  private ghosts(): void {
    if (!this.ghostSource) return;
    const o = this.o.x;
    this.ghostSource((tex, x, y, z) => {
      const f = tex.frame, img = tex.source?.resource as CanvasImageSource | undefined;
      if (!f || !img) return;
      const W = f.width, H = f.height;
      let any = false;
      for (const s of this.solids) {
        const sf = s.tex.frame;
        if (s.piece && s.z > z && sf && s.x < x + W && s.x + sf.width > x && s.y < y + H && s.y + sf.height > y) { any = true; break; }
      }
      if (!any) return;
      if (this.gh.c.width < W || this.gh.c.height < H) this.gh = X.canvas(Math.max(this.gh.c.width, W), Math.max(this.gh.c.height, H));
      const g = this.gh.x;
      g.setTransform(1, 0, 0, 1, -x, -y);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(x, y, W, H);
      // the wall in front of it, as a mask
      for (const s of this.solids) {
        const sf = s.tex.frame, si = s.tex.source?.resource as CanvasImageSource | undefined;
        if (!s.piece || s.z <= z || !sf || !si || s.x >= x + W || s.x + sf.width <= x || s.y >= y + H || s.y + sf.height <= y) continue;
        g.drawImage(si, sf.x, sf.y, sf.width, sf.height, s.x, s.y, sf.width, sf.height);
      }
      // less whatever stands in front of the wall there (a defence tower): the enemy isn't behind the wall in those pixels' view
      g.globalCompositeOperation = 'destination-out';
      for (const s of this.solids) {
        const sf = s.tex.frame, si = s.tex.source?.resource as CanvasImageSource | undefined;
        if (s.piece || s.z <= z || !sf || !si || s.x >= x + W || s.x + sf.width <= x || s.y >= y + H || s.y + sf.height <= y) continue;
        g.drawImage(si, sf.x, sf.y, sf.width, sf.height, s.x, s.y, sf.width, sf.height);
      }
      g.globalCompositeOperation = 'source-in';
      g.drawImage(img, f.x, f.y, W, H, x, y, W, H);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = GHOST; g.fillRect(x, y, W, H);
      g.globalCompositeOperation = 'source-over'; g._fs = null;
      o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 0.6;
      o.drawImage(this.gh.c, 0, 0, W, H, x - this.wx, y - this.wy, W, H);
      o.restore(); o._fs = null;
    });
  }

  private scratchStart(): void {
    const b = this.b.x;
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.b.c.width, this.b.c.height); b.setTransform(1, 0, 0, 1, -this.wx, -this.wy);
    this.o = this.b; b._fs = null;
  }
  /** Put the scratch layer down on `real` and point the drawing back at it. */
  private scratchBlit(real: ReturnType<typeof X.canvas>): void {
    this.b.x.globalCompositeOperation = 'source-over';
    this.o = real;
    const o = real.x;
    o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.drawImage(this.b.c, 0, 0); o.restore();
    o._fs = null;
  }

  /** The wall this missile burst against, if it was on the side the camera can't see. */
  private farFace(w: World, f: Fx): { ux: number; uy: number } | null {
    // its last recorded spot can be up to a step short of the wall
    const face = this.wallAt(w, f.x, f.y, f.x - f.x2, f.y - f.y2, STRUCT.wallThickness + f.r + Math.hypot(f.x2, f.y2) / 60 + 0.12);
    return face && !face.front ? face : null;
  }
  /** Keep what's drawn next on the far side of a wall running through (x, y): sparks and dust stop at its foot. */
  private clipFar(c: Ctx, x: number, y: number, ux: number, uy: number): void {
    const L = 240, H = 480, fy = y + FAR_FOOT;
    c.save();
    c.beginPath();
    c.moveTo(x - ux * L, fy - uy * L); c.lineTo(x + ux * L, fy + uy * L); c.lineTo(x + ux * L, fy + uy * L - H); c.lineTo(x - ux * L, fy - uy * L - H);
    c.closePath();
    c.clip();
  }
  /** Impacts on the far side of a wall: the wall hides them, and whatever flies up over it still shows. */
  private impactsBehind(fx: { f: Fx; ux: number; uy: number }[], t: number, w: World, bodies: BodyView[], light: LightFn): void {
    const real = this.o, b = this.b.x, R = 70, SIDE = 24;
    this.scratchStart();
    for (const { f, ux, uy } of fx) {
      this.clipFar(b, gx(f.x), gy(f.y), ux, uy);
      this.drawFx(f, t - f.t0, t, w, bodies, light);
      b.restore(); b._fs = null;
    }
    this.o = real;
    b.globalCompositeOperation = 'destination-out';
    this.occluders!((tex, x, y, footY, solid) => {
      const fr = tex.frame, img = tex.source?.resource as CanvasImageSource | undefined;
      if (!solid || !fr || !img) return;
      for (const { f } of fx) {
        const ix = gx(f.x), iy = gy(f.y);
        if (footY <= iy - SIDE || x > ix + R || x + fr.width < ix - R || y > iy + R || y + fr.height < iy - R) continue;
        b.drawImage(img, fr.x, fr.y, fr.width, fr.height, x, y, fr.width, fr.height);
        return;
      }
    });
    this.scratchBlit(real);
  }

  /**
   * Did a spray ending at (ex, ey) strike a wall? If it struck the face the camera sees, keep it for
   * drawStrikes. The far face is hidden by the wall itself, so that spray just ends.
   */
  private strike(w: World, t: number, light: LightFn, ex: number, ey: number, cx: number, cy: number, kind: SplashKind | 'beam', t0: number, seed: number, power = 1, R?: Ramp): void {
    const face = this.wallAt(w, ex, ey, cx, cy, STRUCT.wallThickness + 0.05);
    if (!face) return;
    const s: Strike = { x: gx(ex), y: gy(ey), ux: face.ux, uy: face.uy, kind, t0, seed, power, R };
    if (face.front) this.strikes.push(s);
    else {
      // on the layer the wall cuts: only what rises over its top still shows
      this.farHits.push([s.x, s.y]);
      const o = this.o.x, g = this.g.x;
      this.clipFar(o, s.x, s.y, s.ux, s.uy); this.clipFar(g, s.x, s.y, s.ux, s.uy);
      this.drawStrike(s, t, () => {}); // and no light of its own: this close to the wall it would come through it
      o.restore(); g.restore(); o._fs = g._fs = null;
    }
  }
  /** The wall a point is up against, its direction on screen, and whether (cx, cy) is on the side the camera sees. */
  private wallAt(w: World, ex: number, ey: number, cx: number, cy: number, near: number): { ux: number; uy: number; front: boolean } | null {
    const wl = w.walls, tr = w.terrain;
    const face = (x1: number, y1: number, x2: number, y2: number): { ux: number; uy: number; front: boolean } | null => {
      const ux = x2 - x1, uy = y2 - y1, l2 = ux * ux + uy * uy || 1;
      const q = clamp(((ex - x1) * ux + (ey - y1) * uy) / l2, 0, 1);
      if (Math.hypot(ex - x1 - ux * q, ey - y1 - uy * q) > near) return null;
      const sy = uy * FY, l = Math.hypot(ux, sy) || 1;
      // the wall's normal is (-uy, ux): the side (cx, cy) is on has to face down the screen, toward the camera
      return { ux: ux / l, uy: sy / l, front: ux * (ux * (cy - ey) - uy * (cx - ex)) > 0 };
    };
    for (let q = 0, n = terrainNear(tr, ex, ey, near); q < n; q++) { const k = tr.out[q], f = face(tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k]); if (f) return f; }
    for (let k = 0; k < MAX_WALLS; k++) {
      if (wl.type[k] !== WALL.rock && wl.type[k] !== WALL.ice && wl.type[k] !== WALL.barrier) continue;
      const f = face(wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]);
      if (f) return f;
    }
    return null;
  }
  private drawStrikes(t: number, light: LightFn): void {
    for (const s of this.strikes) this.drawStrike(s, t, light);
    this.strikes.length = 0;
  }
  private drawStrike(s: Strike, t: number, light: LightFn): void {
    const o = this.o.x, g = this.g.x;
    if (s.kind === 'beam') { beamImpact(o, g, s.x, s.y, s.ux, s.uy, t, s.t0, s.R!, s.seed, s.power); return; }
    wallSplash(o, g, s.x, s.y, s.ux, s.uy, t, s.t0, s.kind, s.seed, s.power);
    light(s.x, s.y + 2, 46, SPLASH_LIGHT[s.kind], 0.6 * s.power * flick(t, s.seed));
  }

  // ---- the floor: water, ice and one continuous sheet of fire ----------------------------------
  // Every floor fades out over its last FLOOR_FADE ticks (1 s): water and ice dither away in
  // FADE_STEPS steps, fire's flames shrink (the user: water and ice used to just vanish).
  private surfaces(w: World, t: number, light: LightFn): void {
    const s = w.surf, g = this.g.x, n = s.kind.length;
    // a cell's kind and fade step (no strings: this runs every frame, in every view)
    if (this.surfSeen.length !== n * 2) { this.surfSeen = new Uint8Array(n * 2).fill(255); }
    const seen = this.surfSeen;
    let changed = false, any = false;
    for (let c = 0; c < n; c++) {
      const k = s.kind[c], f = k && s.life[c] < FLOOR_FADE ? Math.round(floorFade(s.life[c]) * FADE_STEPS) : 0;
      if (k) any = true;
      if (seen[c * 2] !== k || seen[c * 2 + 1] !== f) { seen[c * 2] = k; seen[c * 2 + 1] = f; changed = true; }
    }
    if (changed) this.paintSurfaces(w);
    if (any) { const W = this.g.c.width, H = this.g.c.height; g.drawImage(this.surf.c, this.wx, this.wy, W, H, this.wx, this.wy, W, H); } // only the part in view
    const cw = CELL * 16;
    const GW = w.dims.gw, AW = w.dims.w, AH = w.dims.h;
    // the flames' columns go into a pixel buffer, put down in one go (flameFlush): thousands of 1 px wide fills a frame
    // were the floor's whole cost. The same pixels as X.rect(g, x, y, 1, h) in the same order (they're opaque).
    this.flameBegin();
    const col = (x: number, y: number, h: number, c32: number): void => this.flameCol(x, y, h, c32);
    const at = (c: number): Pt => [gx(-AW / 2 + ((c % GW) + 0.5) * CELL), gy(-AH / 2 + (Math.floor(c / GW) + 0.5) * CELL)];
    const kindAt = (c: number, dx: number, dy: number) => { const x = (c % GW) + dx, y = Math.floor(c / GW) + dy; return x < 0 || y < 0 || x >= GW || y * GW + x >= n ? 0 : s.kind[y * GW + x]; };
    // the run of burning cells along a row whose embers are drawn together (embers())
    const runCells = this.runCells;
    let runRow = -1, runEnd = -9, runX0 = 0, runX1 = 0, runY = 0;
    const flush = (): void => {
      if (!runCells.length) return;
      this.behind((runX0 + runX1) / 2, runY, (runX1 - runX0) / 2 + cw, (over) => this.embers(over, runCells, w, t));
      runCells.length = 0;
    };
    for (let c = 0; c < n; c++) {
      const k = s.kind[c]; if (!k) continue;
      const [x, y] = at(c), af = floorFade(s.life[c]);
      if (k !== SURF.fire && k !== 0) this.flameFlush(g); // keep the drawing order: the flames so far go down first
      if (k === SURF.water) {
        // ripples on a few cells
        if (rand(c, 5) < 0.08) { const e = mod(t * 0.7 + rand(c, 6), 1); X.ring(g, x, y, 1 + e * 5, (1 + e * 5) * 0.4, '#5aa8e8', (1 - e) * 0.8 * af); }
        if (af > 0.5 && rand(c, 7) < 0.04 && mod(t * 0.5 + rand(c, 8), 1) < 0.15) X.line(g, x - 2, y, x + 1, y - 1, '#8ad0ff');
      } else if (k === SURF.ice) {
        if (af > 0.5 && rand(c, 9) < 0.05 && Math.floor(t * 3 + rand(c, 10) * 9) % 6 === 0) { X.px(g, x, y - 1, '#ffffff'); X.px(g, x - 1, y - 1, '#c4eefa'); X.px(g, x + 1, y - 1, '#c4eefa'); }
      } else {
        // the flame body: a solid low base everywhere and tongues where travelling waves peak,
        // so neighbouring cells merge into one sheet with ragged tips (fire-place-v3)
        const nb = (kindAt(c, -1, 0) === k ? 1 : 0) + (kindAt(c, 1, 0) === k ? 1 : 0) + (kindAt(c, 0, -1) === k ? 1 : 0) + (kindAt(c, 0, 1) === k ? 1 : 0);
        // Every patch its own (the user: each fire patch looked the same): the cells laid together go out on the same
        // tick, so that tick seeds this patch's look. Edge cells burn low or not at all at random, heights vary cell to
        // cell, and the flames' travelling pattern starts somewhere else.
        const pseed = (w.clock[0] + s.life[c]) & 0xffff, vr = rand(c, pseed, 77), ph = rand(pseed, 78) * TAU + rand(c, 79) * 2;
        const cdir = rand(c, pseed, 80) < 0.5 ? -1 : 1, cspd = 3.5 + 3 * rand(c, pseed, 81);
        if ((nb <= 2 && vr < 0.5) || (nb === 3 && vr < 0.18)) continue;
        // a few scorched gaps inside, where the fire has burned low
        const hf = nb < 4 ? 0.45 + 0.9 * vr : vr < 0.12 ? 0.3 : 0.75 + 0.55 * vr;
        const inner = nb / 4, life = Math.min(1, s.life[c] / FLOOR_FADE) * hf;
        // edges round off: columns near a side with no fire beyond it are shorter, and jittered
        const openL = kindAt(c, -1, 0) !== k, openR = kindAt(c, 1, 0) !== k, openF = kindAt(c, 0, 1) !== k, openB = kindAt(c, 0, -1) !== k;
        for (let row = 0; row < 2; row++) {
          const yy = Math.round(y - 1 + row * 2.4), x0 = Math.round(x - cw / 2);
          const ef = row ? (openF ? 0.45 : 1) : openB ? 0.6 : 1;
          for (let xx = x0; xx < x0 + cw; xx++) {
            const lx = xx - x0, side = Math.min(openL ? (lx + 1) / 4 : 1, openR ? (cw - lx) / 4 : 1) * ef;
            if (side < 0.5 && rand(xx, yy, 3) > side * 1.6) continue;
            // each cell's flames run their own way at their own pace (the user: everything drifted uniformly right)
            const wv = 0.5 + 0.5 * Math.sin(xx * 0.5 - t * cdir * cspd + yy * 1.7 + Math.sin(yy * 0.6) * 3 + ph), w2 = 0.5 + 0.5 * Math.sin(xx * 0.23 + t * 3.1 * -cdir - yy * 0.8 + ph * 1.7 + t * 1.3 * Math.sin(t * 0.7 + c));
            const base = (1 + 1.5 * inner) * life * side, tg = (3 + 9 * inner) * Math.pow(wv, 2) * (0.55 + 0.45 * w2) * (0.85 + 0.15 * Math.sin(t * 13 + xx));
            const hh = Math.round(base + tg * life * side);
            if (hh < 1) continue;
            const sw = Math.sin(t * 9 + xx * 0.4 + yy);
            // the column in bands: gold roots in the middle, orange, then a red-orange tip
            const b1 = Math.round(hh * (inner > 0.7 ? 0.4 : 0.2)), b2 = Math.round(hh * 0.75);
            if (b1 > 0) col(xx, yy - b1 + 1, b1, F32[1]);
            if (b2 > b1) col(xx + Math.round(sw * b2 * 0.06), yy - b2 + 1, b2 - b1, F32[2]);
            if (hh > b2) col(xx + Math.round(sw * hh * 0.12), yy - hh + 1, hh - b2, hh > 6 ? F32[3] : F32[2]);
            if (hh > 8 && wv > 0.97) col(xx + Math.round(sw * hh * 0.14), yy - hh, 1, F32[0]);
          }
        }
        // embers and sparks spiralling up out of the fire, a little smoke: gathered per run of cells along a row (one
        // depth), so what stands in front hides them in one pass, not one per cell
        const row = Math.floor(c / GW);
        if (row !== runRow || c - runEnd > 2) flush();
        if (runCells.length === 0) { runRow = row; runX0 = x; runY = y; }
        runCells.push(c); runEnd = c; runX1 = x;
        if (c % 9 === 0) light(x, y - 4, 34, '#ff8a30', 0.5 * life + 0.06 * Math.sin(t * 13 + c));
      }
    }
    flush();
    this.flameFlush(g);
  }

  // ---- the flames' pixel buffer: the effect canvas's size, in its own pixels -------------------------------------
  private fl = { cv: X.canvas(4, 4), img: null as ImageData | null, px: new Uint32Array(0), x0: 0, y0: 0, x1: -1, y1: -1 };
  private flameBegin(): void {
    const W = this.g.c.width, H = this.g.c.height, f = this.fl;
    if (f.cv.c.width !== W || f.cv.c.height !== H) {
      f.cv = X.canvas(W, H);
      f.img = f.cv.x.createImageData(W, H);
      f.px = new Uint32Array(f.img.data.buffer);
    }
    f.x0 = f.y0 = Infinity; f.x1 = f.y1 = -1;
  }
  /** A 1 px wide column, as X.rect(g, x, y, 1, h) would fill it (field px, rounded the same way). */
  private flameCol(x: number, y: number, h: number, c32: number): void {
    const f = this.fl, W = f.cv.c.width, H = f.cv.c.height, cx = Math.round(x) - this.wx, top = Math.round(y) - this.wy, n = Math.round(h);
    X.stats.fills++;
    if (cx < 0 || cx >= W || n <= 0) return;
    const a = Math.max(0, top), b = Math.min(H, top + n);
    if (b <= a) return;
    for (let yy = a; yy < b; yy++) f.px[yy * W + cx] = c32;
    if (cx < f.x0) f.x0 = cx; if (cx > f.x1) f.x1 = cx;
    if (a < f.y0) f.y0 = a; if (b - 1 > f.y1) f.y1 = b - 1;
  }
  /** Puts the buffered flames down on `g` over what's there (they're opaque), and empties the buffer. */
  private flameFlush(g: Ctx): void {
    const f = this.fl;
    if (f.x1 < f.x0 || !f.img) return;
    const x0 = f.x0, y0 = f.y0, w = f.x1 - x0 + 1, h = f.y1 - y0 + 1, W = f.cv.c.width, b = f.cv.x;
    // cleared whole first: a canvas that's been drawn from is copied whole by a write that keeps any of it (see behind())
    b.clearRect(0, 0, W, f.cv.c.height);
    b.putImageData(f.img, 0, 0, x0, y0, w, h);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(f.cv.c, x0, y0, w, h, x0, y0, w, h);
    g.restore(); g._fs = null;
    for (let yy = y0; yy < y0 + h; yy++) f.px.fill(0, yy * W + x0, yy * W + x0 + w);
    f.x0 = f.y0 = Infinity; f.x1 = f.y1 = -1;
  }
  /** The fire floor's embers in a run of cells: the same particles util.emit(t, 1.4, 1.1) gives each cell. */
  private embers(over: Ctx, cells: readonly number[], w: World, t: number): void {
    const FR = EL.fire, cw = CELL * 16, GW = w.dims.gw, AW = w.dims.w, AH = w.dims.h;
    const dt = 1 / 1.4, life = 1.1;
    let k0 = Math.ceil((t - life) / dt);
    const k1 = Math.floor(t / dt);
    if (k1 - k0 > 4000) k0 = k1 - 4000;
    for (const c of cells) {
      const x = gx(-AW / 2 + ((c % GW) + 0.5) * CELL), y = gy(-AH / 2 + (Math.floor(c / GW) + 0.5) * CELL);
      for (let i = k0; i <= k1; i++) {
        const age = (t - i * dt) / life;
        if (age < 0 || age >= 1) continue;
        X.px(over, x + (rand(i, 3, c) - 0.5) * cw + Math.sin(age * 6 + i) * 2.5 + age * 4, y - 8 - age * 26, age < 0.35 ? FR[0] : age < 0.7 ? FR[1] : FR[3]);
      }
    }
  }
  private paintSurfaces(w: World): void {
    const s = w.surf, c = this.surf.x, n = s.kind.length;
    c.clearRect(0, 0, FIELD.W, FIELD.H); c._fs = null;
    const GW = w.dims.gw, AW = w.dims.w, AH = w.dims.h;
    const at = (k: number): Pt => [gx(-AW / 2 + ((k % GW) + 0.5) * CELL), gy(-AH / 2 + (Math.floor(k / GW) + 0.5) * CELL)];
    const same = (k: number) => {
      const x = k % GW, y = Math.floor(k / GW), v = s.kind[k];
      let m = 0;
      if (x > 0 && s.kind[k - 1] === v) m++; if (x < GW - 1 && s.kind[k + 1] === v) m++;
      if (y > 0 && s.kind[k - GW] === v) m++; if (k + GW < n && s.kind[k + GW] === v) m++;
      return m;
    };
    // rims first, so neighbouring cells merge into one soft blob, then the interiors
    // a cell in its last second is dithered thinner, step by step (af: 1 down to 1/FADE_STEPS)
    for (let k = 0; k < n; k++) {
      const v = s.kind[k]; if (!v) continue;
      const [x, y] = at(k), j = (rand(k, 1) - 0.5) * 1.2, af = floorFade(s.life[k]);
      if (v === SURF.water) X.ellipse(c, x + j, y, 6.4, 3.9, '#18325a', af);
      else if (v === SURF.ice) X.ellipse(c, x + j, y, 6.4, 3.9, '#7ab8d4', af);
      else { X.ellipse(c, x + j, y + 0.5, 7.2, 4.4, '#2a1a12', 0.6 * af); X.ellipse(c, x, y, 5.8, 3.4, EL.fire[4], 0.75 * af); }
    }
    for (let k = 0; k < n; k++) {
      const v = s.kind[k]; if (!v) continue;
      const [x, y] = at(k), m = same(k), af = floorFade(s.life[k]), lines = af > 0.5;
      if (v === SURF.water) {
        if (m >= 3) X.ellipse(c, x, y - 0.5, 5.4, 3.0, '#204a80', af);
        if (lines && rand(k, 2) < 0.12) X.line(c, x - 2, y - 1, x + 1, y - 2, '#5aa8e8');
      } else if (v === SURF.ice) {
        if (m >= 3) X.ellipse(c, x, y - 0.5, 5.4, 3.0, '#b4e4f4', af);
        if (lines && rand(k, 3) < 0.16) X.line(c, x - 2, y, x + 2 + rand(k, 4) * 2, y, '#ffffff');
        if (lines && rand(k, 5) < 0.1) X.lines(c, [[x - 3, y + 1], [x, y + 2], [x + 3, y + 1]], '#5a90b0');
      } else if (m >= 3) X.ellipse(c, x, y, 5, 2.8, EL.fire[3], af);
    }
  }

  /** Is a rain zone falling on (x, y)? (A Water Place's burst then draws nothing of its own.) */
  private rainAt(w: World, x: number, y: number): boolean {
    const z = w.zones;
    for (let k = 0; k < MAX_ZONES; k++) if (z.type[k] === ZONE.rain && Math.abs(z.x[k] - x) < 0.6 && Math.abs(z.y[k] - y) < 0.6) return true;
    return false;
  }

  // ---- zones: delayed blasts, geysers, healing springs, steam, rain -------------------------------
  private zones(w: World, simT: number, light: LightFn, t: number): void {
    const z = w.zones;
    for (let k = 0; k < MAX_ZONES; k++) {
      const ty = z.type[k]; if (!ty) continue;
      const x = gx(z.x[k]), y = gy(z.y[k]), r = z.r[k] * 16;
      // the freezing fog sorts billow by billow, so bodies stand up out of it (zone, ZONE.frost)
      if (ty === ZONE.frost) this.zone(w, k, ty, x, y, r, simT, light, t);
      else this.behind(x, y, r + 30, () => this.zone(w, k, ty, x, y, r, simT, light, t), true);
    }
  }
  private zone(w: World, k: number, ty: number, x: number, y: number, r: number, simT: number, light: LightFn, t: number): void {
    const z = w.zones, g = this.g.x, o = this.o.x, e = simT - this.zoneT0[k], R = ramp(z.look[k]), sd = k * 31 + 7;
    if (ty === ZONE.blast) {
      // arcane fuse: an outer ring and a ring tightening on the spot, the centre flickering faster
      const kk = clamp(e / 0.6, 0, 1);
      K.gring(g, x, y, r, R[3], 0.8, 1); K.gring(g, x, y, r * (1 - kk) + 2, R[1], 1, 1);
      if (Math.floor(t * (6 + kk * 14)) % 2) X.ellipse(g, x, y, 3, 2, R[2]);
      light(x, y, r + 10, R[2], 0.3 + 0.4 * kk);
    } else if (ty === ZONE.geyser) {
      // earth rumbles: cracks running out, a ring tightening, grit jumping
      const kk = clamp(e / 0.6, 0, 1);
      K.cracks(g, x, y, r, sd, kk, '#1a120c', 7);
      K.gring(g, x, y, r - kk * 4, '#8a6a48', 0.5 + 0.5 * kk, 1);
      for (let i = 0; i < 6; i++) if (rand(i, Math.floor(t * 20), sd) < 0.5) X.px(o, x + (rand(i, 3, sd) - 0.5) * r * 1.4, y + (rand(i, 4, sd) - 0.5) * r * FY - rand(i, Math.floor(t * 20), 5) * 3, EL.earth[1]);
    } else if (ty === ZONE.spring) {
      // a healing spring: soft green rings welling out, light rising, sparkles (it reads as help)
      const fade = Math.min(seg(e, 0, 0.3), seg(z.life[k], 0, 30));
      K.gring(g, x, y, r, EL.life[2], 0.9 * fade, 1); K.gring(g, x, y, r * 0.7, EL.life[3], 0.6 * fade, 1);
      X.ellipse(g, x, y, r * 0.9, r * 0.9 * FY, '#1e7a34', 0.3 * fade);
      for (let i = 0; i < 2; i++) { const pe = mod(t * 0.7 + i / 2, 1); K.gring(g, x, y, 4 + pe * (r - 4), EL.life[1], (1 - pe) * 0.7 * fade, 1); }
      K.sparkle(o, x, y - 4, t, fade, r * 1.4, sd, X.LIFE, 18);
      for (const p of emit(t, 10, 1.2, (i, age) => { const a = rand(i, 1, sd) * TAU, rr = Math.sqrt(rand(i, 2, sd)) * r; return { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * FY - age * 14, age }; })) if (fade > 0.3) X.px(o, p.x, p.y, p.age < 0.5 ? X.WARM[2] : EL.life[1]);
      light(x, y, r + 14, '#8ef07e', 0.45 * fade);
    } else if (ty === ZONE.steam) {
      // a steam cloud: big soft billows drawn over the bodies inside it
      const cl = easeOut(seg(e, 0, 0.6)) * seg(z.life[k], 0, 30);
      for (let i = 0; i < 22; i++) {
        const a = rand(i, 11, sd) * TAU, rr = Math.sqrt(rand(i, 12, sd)) * r * cl, px2 = x + Math.cos(a) * rr + Math.sin(t * 0.9 + i) * 2, py2 = y + Math.sin(a) * rr * 0.55 - 8 - rand(i, 13, sd) * 10 * cl + Math.sin(t * 1.3 + i) * 1.5;
        K.puff(o, px2, py2 + 2, (5 + rand(i, 14, sd) * 4) * (0.5 + cl * 0.5), '#6a7088', cl);
        K.puff(o, px2 - 1, py2, (4.5 + rand(i, 14, sd) * 4) * (0.5 + cl * 0.5), i % 4 === 0 ? EL.steam[1] : i % 2 ? '#a8b0c4' : EL.steam[2], cl);
      }
      for (const p of emit(t, 6, 1.5, (i, age) => ({ x: x + (rand(i, 21, sd) - 0.5) * r * 2, y: y - 14 - age * 16, age }))) K.puff(o, p.x, p.y, 3 + p.age * 4, EL.steam[2], (1 - p.age) * 0.7 * cl);
      light(x, y - 6, r + 20, '#d8e0f0', 0.3 * cl);
    } else if (ty === ZONE.caltrops) {
      // Caltrops (Ice Place): little ice spikes scattered over the ground, popping up when cast and melting away at the end.
      // Placeholder art: a dark base and a pale tip per spike, by area, so a trap reads as a trap from across the room.
      const cl = easeOut(seg(e, 0, 0.25)) * seg(z.life[k], 0, 40), span = r / 32, n = Math.min(90, Math.max(10, Math.round(22 * span * span)));
      X.ellipse(g, x, y, r * 0.95, r * 0.95 * FY, '#9fd4e8', 0.12 * cl);
      for (let i = 0; i < n; i++) {
        if (rand(i, 41, sd) > cl) continue;
        const a = rand(i, 42, sd) * TAU, d = Math.sqrt(rand(i, 43, sd)) * r * 0.92, px2 = x + Math.cos(a) * d, py2 = y + Math.sin(a) * d * FY;
        const hgt = 2 + Math.floor(rand(i, 44, sd) * 3);
        X.px(g, px2, py2, '#3a6a80');
        X.line(o, px2, py2 - 1, px2, py2 - hgt, i % 3 ? '#bfe8f6' : '#e8fbff');
        if ((Math.floor(t * 3 + rand(i, 45, sd) * 9)) % 7 === 0) X.px(o, px2, py2 - hgt, '#ffffff');
      }
      light(x, y, r + 8, '#9ff4ff', 0.15 * cl);
    } else if (ty === ZONE.frost) {
      // Freezing fog (Cold Place, the user: "like opening a deep freezer"): a low, heavy fog of cold air that pours out
      // over the floor and spills past its edge, curling slowly, with frost glinting on the ground under it
      const cl = easeOut(seg(e, 0, 0.5)) * seg(z.life[k], 0, 40);
      // everything scales with the size of the fog (the user: a big one looked thin): billows and glints by area, the
      // tendrils by the rim's length; a big bank's billows also grow a little, so it reads as heavier, not just busier
      const span = r / 32, area = span * span, bs = clamp(Math.sqrt(span), 1, 1.4);
      const nBill = Math.min(120, Math.max(8, Math.round(16 * area / (bs * bs)))), nGlint = Math.min(160, Math.max(10, Math.round(18 * area)));
      X.ellipse(g, x, y, r * 0.95 * cl, r * 0.95 * FY * cl, '#9fd4e8', 0.35 * cl);
      for (let i = 0; i < nGlint; i++) {
        if (rand(i, 31, sd) > cl) continue;
        const a = rand(i, 32, sd) * TAU, d = Math.sqrt(rand(i, 33, sd)) * r * 0.9;
        if ((Math.floor(t * 2 + rand(i, 34, sd) * 7)) % 5 === 0) X.px(g, x + Math.cos(a) * d, y + Math.sin(a) * d * FY, '#ffffff');
        else X.px(g, x + Math.cos(a) * d, y + Math.sin(a) * d * FY, '#c4eefa');
      }
      // The body of the fog (the user: no volume to it): a bank of low, heavy billows, each lit on top and shaded
      // underneath, the far ones first so the near ones roll over them. It lies low, but it has a body.
      const bill: { x: number; y: number; w: number; h: number; den: number; i: number }[] = [];
      for (let i = 0; i < nBill; i++) {
        const a = rand(i, 11, sd) * TAU + t * 0.06 * (i % 2 ? 1 : -1), rr = Math.sqrt(rand(i, 12, sd)) * r * 0.8 * cl;
        const swell = 1 + 0.12 * Math.sin(t * 0.8 + i * 2.1);
        const wr = (6 + rand(i, 14, sd) * 6) * bs * (0.5 + cl * 0.5) * swell, hr = wr * (0.55 + 0.15 * rand(i, 15, sd));
        bill.push({ x: x + Math.cos(a) * rr + Math.sin(t * 0.5 + i * 1.3) * 2.5, y: y + Math.sin(a) * rr * FY, w: wr, h: hr, den: cl, i });
      }
      bill.sort((p, q2) => p.y - q2.y);
      for (const p of bill) {
        // a billow sits on the floor and swells up over it: a shaded underside, a solid body with a thin dithered rim,
        // a lit crown; each behind whatever stands in front of its foot
        this.behind(p.x, p.y, p.w + 4, (c) => {
          const top = p.y - p.h * 0.8, den = p.den;
          if (den < 0.25) return;
          X.ellipse(c, p.x, top + p.h * 0.35, p.w, p.h * 0.75, '#a8d4e6', 0.5); // the soft rim
          X.ellipse(c, p.x, p.y - 1, p.w * 0.8, p.h * 0.4, '#5f8aa3'); // the shaded underside, on the floor
          X.ellipse(c, p.x, top + p.h * 0.35, p.w * 0.72, p.h * 0.55, den > 0.6 ? '#a8d4e6' : '#8fc0d6'); // the body
          X.ellipse(c, p.x - p.w * 0.15, top + p.h * 0.1, p.w * 0.45, p.h * 0.3, p.i % 3 ? '#e4f6fc' : '#f6fdff'); // the lit crown
        }, false, true);
      }
      // tendrils spilling over the rim and creeping out along the floor, thinning as they go
      for (const p of emit(t, 10 * Math.max(1, span), 2.4, (i, age) => {
        const a = rand(i, 21, sd) * TAU, d = r * (0.8 + age * 0.6);
        return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * FY, age, i };
      })) X.ellipse(o, p.x, p.y, (4 + p.age * 6) * (0.6 + 0.4 * cl), (1.2 + p.age * 1.6) * (0.6 + 0.4 * cl), p.i % 2 ? '#d4f0fa' : '#b8e2f2', (1 - p.age) * 0.45 * cl);
      // a breath of cold curling up off it now and then, thin
      for (const p of emit(t, 3 * Math.max(1, span), 1.6, (i, age) => ({ x: x + (rand(i, 41, sd) - 0.5) * r * 1.4 + Math.sin(age * 4 + i) * 2, y: y - 3 - age * 10, age }))) X.ellipse(o, p.x, p.y, 2 + p.age * 3, 1 + p.age * 1.5, '#e8fbff', (1 - p.age) * 0.4 * cl);
      light(x, y, r + 20, '#9ff4ff', 0.3 * cl);
    } else if (ty === ZONE.rain) {
      // rain: a dark cloud over the spot, streaks and splashes, for as long as the sim says it falls
      const t0 = this.zoneT0[k], end = simT + z.life[k] / 60;
      const cloud = Math.min(seg(e, 0, 0.3), seg(z.life[k], 0, 24)), CY = y - 46;
      for (const p of emit(simT, 90, 0.42, (i, age) => { const a = rand(i, 81, sd) * TAU, q = Math.sqrt(rand(i, 82, sd)) * r; return { gx2: x + Math.cos(a) * q, gy2: y + Math.sin(a) * q * FY, age, top: CY + 6 + rand(i, 83, sd) * 6 }; }, t0 + 0.1, end - 0.4)) {
        if (p.age <= 0.8) { const q = p.age / 0.8, px2 = lerp(p.gx2 + 9, p.gx2, q), py2 = lerp(p.top, p.gy2, q * q * 0.35 + q * 0.65); X.line(o, px2 + 1, py2 - 3, px2, py2, '#5aa8e8'); X.px(o, px2, py2, '#cfefff'); }
        else { const q = (p.age - 0.8) / 0.2; X.ring(g, p.gx2, p.gy2, 1 + q * 2.5, (1 + q * 2.5) * 0.45, '#8ad0ff', 1 - q); }
      }
      if (cloud > 0.05) for (let i = 0; i < 14; i++) {
        const cx = x + 6 + (rand(i, 91, sd) - 0.5) * r * 1.8 * (0.6 + 0.4 * cloud) + Math.sin(t * 0.8 + i) * 1.5, cy = CY + (rand(i, 92, sd) - 0.5) * 10, cr = (5 + rand(i, 93, sd) * 4) * (0.5 + 0.5 * cloud);
        K.puff(o, cx, cy + 2, cr, '#2e3246', cloud); K.puff(o, cx - 1, cy, cr * 0.85, i % 3 ? '#4a5068' : '#5c6480', cloud);
      }
      light(x, y, r + 16, '#2a8cff', 0.3 * cloud);
    }
  }

  // ---- shadows and team rings under the bodies ------------------------------------------------
  private groundMarks(w: World, bodies: BodyView[], t: number): void {
    const g = this.g.x, b = w.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const v = bodies[i]; if (!v.on) continue;
      const wd = WIDTH[v.rig] * 1.15;
      X.shadow(g, v.x + 0.5, v.y + 0.5, wd, Math.max(1.5, wd * FY), HEIGHT[v.rig] * 0.25 * (b.downed[i] ? 0.3 : 1));
      if (b.kind[i] === KIND.wizard) {
        const col = X.TEAMS[i % 4].light, me = i === this.localSeat;
        X.ring(g, v.x, v.y + 1, 8, 8 * FY, col, me ? 1 : 0.55);
        if (me) { X.px(g, v.x, v.y + 7, col); X.px(g, v.x - 1, v.y + 8, col); X.px(g, v.x + 1, v.y + 8, col); }
      }
    }
    void t;
  }

  // ---- missiles: the form sets the shape, the look element the material ------------------------
  private missiles(w: World, t: number, light: LightFn, ct: number): void {
    const m = w.missiles, o = this.o.x, g = this.g.x;
    for (let j = 0; j < MAX_MISSILES; j++) {
      if (!m.alive[j] || m.wait[j]) continue;
      const ty = m.type[j], look = m.look[j], el = elName(look), R = ramp(look), sd = j * 17 + 3;
      const [mx, my] = this.missileAt(w, j, ct);
      const yg = gy(my), vx = m.vx[j], vy = m.vy[j] * FY, L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
      const e = t - this.mT0[j];
      let x = gx(mx);
      if (ty === 3) {
        // a heal-stone lobbed over everything: a stone with green light seeping from its cracks
        const life0 = Math.max(1, this.mLife0[j]), k = clamp(1 - m.life[j] / life0, 0, 1), z = STAFF_Z + Math.sin(k * Math.PI) * 34, y = yg - z;
        X.ellipse(g, x, yg, 3, 1.5, 'rgba(8,6,16,0.45)');
        // where it was at ts: back along its line, at the height its arc had then
        const at = (ts: number): [number, number] | null => {
          const kt = 1 - (m.life[j] + (t - ts) * 60) / life0;
          if (kt < 0) return null;
          const back = (t - ts) * L * 16;
          return [x - ux * back, yg - uy * back - STAFF_Z - Math.sin(kt * Math.PI) * 34];
        };
        RF.lifeSeed(o, { x, y, yg, ux, uy, v: L * 16, r: 4, born: this.mT0[j], seed: sd, n: tierOf(m.els, j) }, t, at);
        light(x, yg, 36, '#8ef07e', 0.55);
        continue;
      }
      let y = yg - STAFF_Z;
      // a rock just thrown leaves from where it was charged (its ball at the hand), easing onto its real path
      const lc = m.owner[j] < MAX_SEATS ? this.lastCharge[m.owner[j]] : null;
      if (ty === 1 && lc && e < 0.08 && ct - lc[2] < 0.3) { const b = smooth(clamp(e / 0.08, 0, 1)); x = lerp(lc[0], x, b); y = lerp(lc[1], y, b); }
      if (ty === 2 && m.flags[j] & PF.pin) {
        // the spear's javelin: a long ice shaft along its flight, a bright head, frost shedding off the tail
        X.ellipse(g, x, yg, 6, 1.2, 'rgba(8,6,16,0.35)');
        X.line(o, x - ux * 13, y - uy * 13, x + ux * 2, y + uy * 2, '#163e7a', 3);
        X.line(o, x - ux * 12, y - uy * 12, x + ux * 2, y + uy * 2, '#9ff4ff', 1);
        K.shard(o, x + ux * 3, y + uy * 3, Math.atan2(uy, ux), 5, sd, 1, EL.cold);
        for (const p of emit(t, 30, 0.35, (i, age, ts) => { const back = (t - ts) * L * 16 + 12; return { x: x - ux * back + (rand(i, 2, sd) - 0.5) * 3, y: y - uy * back + age * 4, age }; }, this.mT0[j], t)) X.px(o, p.x, p.y, p.age < 0.4 ? '#ffffff' : EL.cold[2]);
        light(x, yg, 26, '#9ff4ff', 0.4);
        continue;
      }
      if (ty === 2) {
        // shards: jagged slivers with a glitter trail; Life's are pale crystal with a green heart
        X.ellipse(g, x, yg, 2, 1, 'rgba(8,6,16,0.35)');
        if (look === 2) {
          for (let k2 = 1; k2 <= 4; k2++) X.px(o, x - ux * k2 * 3, y - uy * k2 * 3, k2 < 2 ? X.LIFE[1] : X.LIFE[3]);
          X.line(o, x - ux * 3, y - uy * 3, x + ux * 2, y + uy * 2, '#9ff4ff', 2); X.line(o, x - ux * 2, y - uy * 2, x + ux * 3, y + uy * 3, '#ffffff');
          X.px(o, x, y, X.LIFE[3]); X.glow(o, x, y, 4, X.LIFE[2], 0.6);
        } else {
          const SR: Ramp = el === 'cold' || el === 'water' ? EL.cold : el === 'earth' ? X.EARTH : R.length >= 6 ? R : [...R, R[R.length - 1]];
          for (let k2 = 1; k2 <= 4; k2++) X.px(o, x - ux * k2 * 4, y - uy * k2 * 4, k2 === 1 ? SR[1] : k2 < 3 ? SR[2] : SR[4]);
          K.shard(o, x, y, Math.atan2(uy, ux), 6.5, sd, 1, SR);
        }
        continue;
      }
      if (ty === 1) {
        const r = clamp(m.r[j] * 16, 3, 8);
        X.ellipse(g, x, yg, r * 0.8, r * 0.4, 'rgba(8,6,16,0.45)');
        if (el === 'fire') {
          // a fireball: burning flecks and dark smoke peeling off behind it
          RF.meteor(o, { x, y, yg, ux, uy, v: L * 16, r, born: this.mT0[j], seed: sd, n: tierOf(m.els, j) }, t);
          light(x, yg, 44, '#ff7a2a', 0.9);
        } else {
          const fl: RF.Flight = { x, y, yg, ux, uy, v: L * 16, r, born: this.mT0[j], seed: sd, n: tierOf(m.els, j) };
          if (frosty(el)) {
            if (m.flags[j] & PF.freeze) RF.iceShard(o, fl, t); else RF.snowball(o, fl, t);
            light(x, yg, 34, '#9ff4ff', 0.45);
            continue;
          }
          if (el === 'arcane') {
            RF.arcaneOrb(o, fl, t, Math.sign(ux || 1) * (t - this.mT0[j]) * Math.hypot(m.vx[j], m.vy[j]) * 0.9);
            light(x, yg, 40, R[2], 0.6);
            continue;
          }
          // a rock, a mud ball, a charged stone...: the same heavy missile in the look's material
          const mat = frosty(el) ? K.ROCK_MAT.cold : el === 'water' ? K.ROCK_MAT.water : el === 'arcane' ? K.ROCK_MAT.arcane : el === 'lightning' ? K.ROCK_MAT.lightning : K.ROCK_MAT.earth;
          // in flight (the user, 2026-11-10: it moved but didn't feel like flying): air streaks off its sides, a wake
          // of dust hanging where it passed, grit falling out of it, and the rock tumbling, faster the faster it goes
          const spd = Math.hypot(m.vx[j], m.vy[j]), born = this.mT0[j], earth = mat === K.ROCK_MAT.earth;
          const dustC = frosty(el) ? ['#e8fbff', '#9fd4e8'] : el === 'water' ? ['#cfe8ff', '#6aa8e0'] : el === 'arcane' ? ['#ffd8ec', '#c06a9a'] : el === 'lightning' ? ['#e8dcff', '#8a6ad0'] : ['#cbb898', '#8a7458'];
          for (const p of emit(t, (20 + r * 3) * (0.6 + 0.2 * fl.n), 0.4 + 0.06 * fl.n, (i, age, ts) => {
            const back = (t - ts) * L * 16, side = (rand(i, 6, sd) - 0.5) * r * 1.2;
            // the wake is as wide as the rock: a big rock leaves a big wake (the user: big rocks' wakes looked small)
            return { x: x - ux * back - uy * side + age * (rand(i, 7, sd) - 0.5) * 6, y: y - uy * back + ux * side * FY + age * 3, age, r: (1 + age * 2.2) * (0.5 + r * 0.16) };
          }, born, t)) if (p.age > 0.05) K.puff(o, p.x, p.y, p.r, p.age < 0.35 ? dustC[0] : dustC[1], (1 - p.age) * 0.75);
          if (earth) for (const p of emit(t, 22, 0.5, (i, age, ts) => {
            const back = (t - ts) * L * 16, side = (rand(i, 8, sd) - 0.5) * r;
            return { x: x - ux * back - uy * side, y: y - uy * back + side * 0.4 + age * age * (STAFF_Z + 4), age, i };
          }, born, t)) if (p.y < yg + 2) X.px(o, p.x, p.y, p.i % 3 ? X.EARTH[3] : X.EARTH[1]);
          // a smear of the rock just behind it, so a big one reads as fast rather than heavy and slow
          for (let k2 = 2; k2 >= 1; k2--) X.ellipse(o, x - ux * r * 0.7 * k2, y - uy * r * 0.7 * k2, r * (1 - 0.12 * k2), r * 0.85 * (1 - 0.12 * k2), k2 === 1 ? '#8a7458' : '#5a4a3a', k2 === 1 ? 0.5 : 0.3);
          // air streaks trailing back from the rock's edges, longer when it's fast and when it's big; more of them on a big rock
          const sl = (6 + spd * 1.1) * (0.6 + r / 12), lanes = r >= 6 ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1];
          for (const s2 of lanes) {
            const ox = -uy * s2 * r * 0.8, oy = ux * s2 * r * 0.8 * FY - (s2 === 0 ? r * 0.6 : 0), ph = (Math.floor(t * 30) + Math.round(s2 * 2) + j) % 3;
            const l = sl * (s2 === 0 ? 1 : 0.75) * (0.8 + 0.2 * ph);
            X.line(o, x + ox - ux * (r + 1), y + oy - uy * (r + 1), x + ox - ux * (r + l), y + oy - uy * (r + l), s2 === 0 ? '#f4ecdc' : dustC[0]);
          }
          // A quick throw left no time to pack the ball at the hand (the user, 2026-11-11: an instant right click): the rock
          // grows to full size over its first moments in the air while stones torn up round the caster home in on it.
          // a tap may never have drawn a charge at all: then the caster's own spot stands in for it
          const ow = m.owner[j], lc0 = ow < MAX_SEATS ? this.lastCharge[ow] : null, fresh = !!lc0 && ct - lc0[2] < 0.5;
          const lq: [number, number, number, number, number, number] | null = ow < MAX_SEATS ? (fresh ? lc0 : [0, 0, ct, gx(w.bodies.x[ow]), gy(w.bodies.y[ow]), 0]) : null;
          const quick = !!lq && lq[5] < 0.5;
          const grow = quick ? 0.4 + 0.6 * smooth(clamp(e / 0.12, 0, 1)) : 1;
          if (quick && e < 0.2 && lq) for (let q2 = 0; q2 < 8 + 3 * fl.n; q2++) {
            const arrive = 0.05 + rand(q2, 85, sd) * 0.11, kk = smooth(clamp(e / arrive, 0, 1));
            if (kk >= 1) continue;
            const ang = rand(q2, 86, sd) * TAU, d = 8 + rand(q2, 87, sd) * 10, sx = lq[3] + Math.cos(ang) * d, sy = lq[4] + Math.sin(ang) * d * FY;
            if (kk < 0.3) K.puff(o, sx, sy - 1 - kk * 8, 1 + kk * 6, '#8a7a68', 0.75 * (1 - kk / 0.3));
            const px2 = lerp(sx, x, kk), py2 = lerp(sy, y, kk) - Math.sin(kk * Math.PI) * 6, sz = q2 % 3 === 0 ? 4 : 3;
            K.sq(o, px2, py2, sz + 1, mat.out); K.sq(o, px2, py2, sz, q2 % 2 ? mat.hi : mat.lit);
          }
          K.rock(o, x, y, r * grow, sd, mat, Math.sign(ux || 1) * (t - born) * spd * 0.9); // rolling the way it flies
          if (el === 'water') for (const p of emit(t, 14, 0.4, (i, age) => ({ x: x + (rand(i, 4, sd) - 0.5) * r, y: y + r * 0.5 + age * age * 10, age }))) X.px(o, p.x, p.y, '#8ad0ff');
          if (el === 'lightning' && Math.floor(t * 18) % 3 !== 2) { K.zap(o, [x - r, y], [x + r, y - 1], Math.floor(t * 18) + sd, EL.lightning, 1, 0); light(x, yg, 30, '#b08aff', 0.5); }
        }
        void e;
        continue;
      }
      // a plain bolt in the look's colours. The Arcane wand's (a wizard's bolt carrying Arcane) stays violet at its
      // heart, and every other element in it changes the bolt its own way (art/accent.ts: a flaming streak, an icy
      // shard head, crackle, a droplet trail, a stone pebble, life motes), so wand + Fire reads apart from wand + Cold.
      const wandBolt = m.owner[j] >= 0 && m.owner[j] < MAX_SEATS && m.els[j * N_EL + 5] > 0; // Arcane is element 6
      const RB = wandBolt ? X.EL.arcane : R, xs = wandBolt ? A.extrasOf(m.els, j, 6, 3) : [];
      const bolt = (c: Ctx): void => {
        for (let k2 = 6; k2 >= 1; k2--) K.sq(c, x - ux * k2 * 2.5, y - uy * k2 * 2.5, k2 < 3 ? 2 : 1, RB[Math.min(RB.length - 1, 1 + (k2 >> 1))]);
        X.glow(c, x, y, 6, RB[2], 0.7); K.sq(c, x, y, 3, RB[2]); K.sq(c, x, y, 2, RB[1]); X.px(c, x, y - 1, '#ffffff');
        if (xs.length) A.bolt(c, x, y, ux, uy, xs, t, this.mT0[j], sd, light);
      };
      // the battery's archers shoot at the wall from out in the field: what stands in front (the wall) hides their arrows
      if (w.battery && m.owner[j] >= MAX_SEATS) this.behind(x, yg, 16, bolt); else bolt(o);
      light(x, yg, 30, RB[2], 0.5);
    }
  }

  // ---- channels and charges: beams, sprays, the charging rock ------------------------------------
  /** Per seat: where its charging rock was last drawn and when (cosmetic clock), so the thrown rock leaves from there. */
  private lastCharge: ([number, number, number, number, number, number] | null)[] = [null, null, null, null]; // x, y, when, feet x, feet y, charge 0..1
  /** Each spray's recent aim (art/spray-jet.ts), by key: seat, 100 + seat for its Double, 200 + seat for its Echo, 300 + device. */
  private trails = new Map<number, AimTrail>();
  /**
   * A spray as a stream (art/spray-jet.ts): from nozzle (x, y) over ground y `ground` to (ex, ey) on the ground. Its
   * aim is recorded under `key`, so each particle keeps the aim it left with.
   */
  private jet(key: number, cone: K.ConeKind, spec: SpellSpec, x: number, y: number, ground: number, ex: number, ey: number, t: number, t0: number, seed: number, thin = 1): void {
    const kind: JetKind = cone === 'freeze' ? 'cold' : cone; // an Ice spray (rare: Ice's own Force is shards) streams as cold
    const tr = this.trails.get(key) ?? new AimTrail();
    this.trails.set(key, tr);
    tr.record(t, t0, { x, y, ground, ex, ey });
    const n = clamp(spec.sizeN || 1, 1, 5), half = SHAPES.sprayHalfAngle * (1 + 0.25 * (n - 1)) * TAU;
    sprayJet(this.o.x, { kind, n, half, endH: 6, t0, seed, aim: tr.at, thin }, t);
  }
  private channels(w: World, t: number, bodies: BodyView[], light: LightFn): void {
    const s = w.seats, o = this.o.x;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i]) continue;
      const ph = s.phase[i], v = bodies[i];
      if (!v?.on || !v.a) continue;
      const tip: Pt = headTip(w, i) ?? [v.x + v.a.tip[0], v.y + v.a.tip[1]];
      // a late remote channel (rollback) plays its opening at speed: its drawn age runs from 0 up to the true one
      const age = (s.chanTicks[i] / 60) * this.catchK(this.chCatch, i, t);
      if (ph === PHASE.charge) {
        const spec = specOf(w, i), ch: Pt = [v.x + v.a.charge[0], v.y + v.a.charge[1]], k = smooth(clamp(age, 0, 1)), el = elName(spec.look);
        for (let q = 0; q < 7; q++) { const a = t * 8 + q * 0.9, r = 10 - k * 6; X.px(o, ch[0] + Math.cos(a) * r, ch[1] + Math.sin(a) * r * 0.7, ramp(spec.look)[q % 2 ? 1 : 2]); }
        if (spec.heal) { K.rock(o, ch[0], ch[1] + 2, 1.5 + k * 3.5, 6, K.ROCK_MAT.life); X.glow(o, ch[0], ch[1] + 2, 4 + k * 3, X.LIFE[3], 0.5); }
        else if (el === 'fire') { K.fireball(o, ch[0], ch[1], 1.2 + k * 3.2, t, 0.2, -1, 4); light(ch[0], v.y, 30, '#ff7a2a', 0.5 * k + 0.2); }
        else {
          // Stones prised up from the floor round the caster fly in and pack into the ball (the user, 2026-11-11: the
          // rock blinked into being in front of you). Dust puffs where each leaves the floor; more stones with more
          // Earth; the ball grows to exactly the size the thrown rock will be.
          const mat = frosty(el) ? K.ROCK_MAT.cold : el === 'water' ? K.ROCK_MAT.water : K.ROCK_MAT.earth, n = Math.max(1, spec.formN);
          const R1 = clamp((0.22 + 0.08 * n) * 16, 3, 8), g = this.g.x, cy = ch[1] + 2;
          // a burst the moment it starts (a dozen and more stones at once), then a steady stream while it's held
          const stone = (q: number, a: number) => {
            const ang = rand(q, 81, i) * TAU, d = 9 + rand(q, 82, i) * 9 + n * 1.5, sx = v.x + Math.cos(ang) * d, sy = v.y + Math.sin(ang) * d * FY, kk = smooth(a);
            return { x: lerp(sx, ch[0], kk), y: lerp(sy, cy, kk) - Math.sin(a * Math.PI) * 8, a, sx, sy, q };
          };
          const t0c = t - age, stones = [...emit(t, 34 + 10 * n, 0.34, stone, t0c, t0c + 0.35), ...emit(t, 8 + 6 * n, 0.34, (q, a) => stone(q + 5000, a), t0c + 0.35, t)];
          for (const p of stones) {
            if (p.a < 0.3) { X.px(g, p.sx, p.sy, '#2a2018'); K.puff(o, p.sx + (rand(p.q, 83, i) - 0.5) * 3, p.sy - 1 - p.a * 10, 1 + p.a * 5, '#8a7a68', 0.75 * (1 - p.a / 0.3)); }
            const sz = p.q % 3 === 0 ? 4 : 3;
            K.sq(o, p.x, p.y, sz + 1, mat.out); K.sq(o, p.x, p.y, sz, p.q % 2 ? mat.hi : mat.lit); X.px(o, p.x - 1, p.y - 1, mat.hi);
          }
          K.rock(o, ch[0], cy, R1 * (0.3 + 0.7 * k), 4, mat, t * 1.5);
          this.lastCharge[i] = [ch[0], cy, t, v.x, v.y, k];
        }
        continue;
      }
      if (ph !== PHASE.channel) continue;
      const spec = specOf(w, i), t0 = t - age, sd = i * 977;
      const ex = gx(s.chanEndX[i]), ey = gy(s.chanEndY[i]);
      const look = elName(spec.look || spec.form);
      if (spec.shape === 'beam') {
        const z: Pt = [ex, ey - LIFT], on = easeOut(seg(t, t0, t0 + 0.12));
        const full: Pt = [lerp(tip[0], z[0], on), lerp(tip[1], z[1], on)];
        const hitBody = this.beamHits(w, s.chanEndX[i], s.chanEndY[i], i);
        // the spell's runes (all of them: Arcane + Fire + Fire is more than Arcane + Fire) set its tier
        const nb = clamp(spec.power, 1, 5), bw = K.beamW(nb);
        if (spec.heal) { K.beam(o, tip, full, t, X.LIFE_L, { on: 1, w: bw, hit: hitBody && on > 0.95, seed: sd }); }
        else if (look === 'fire') K.fireBeam(o, tip, full, t, hitBody && on > 0.95);
        else {
          const R = look === 'cold' ? X.FROST : ramp(spec.look);
          // a second element in the beam twists round it as a strand (arcane + fire's strand is the fire beam itself)
          K.beam(o, tip, full, t, R, { on: 1, w: bw, hit: hitBody && on > 0.95, seed: sd });
          if (frosty(look)) for (const p of emit(t, 60, 0.6, (q, age) => { const kk = rand(q, 71, sd); return { x: lerp(tip[0], full[0], kk) + (rand(q, 72, sd) - 0.5) * 4, y: lerp(tip[1], full[1], kk) + age * 9 + Math.sin(age * 8 + q) * 1.2, age, q }; })) X.px(o, p.x, p.y, (p.q + Math.floor(t * 16)) % 5 === 0 ? '#ffffff' : p.age < 0.5 ? X.FROST[2] : X.FROST[4]);
        }
        K.beamSurge(o, tip, full, t, spec.heal ? X.LIFE_L : look === 'fire' ? EL.fire : look === 'cold' ? X.FROST : ramp(spec.look), nb, sd, hitBody && on > 0.95);
        const lc = spec.heal ? '#8ef07e' : look === 'fire' ? '#ff6a20' : ramp(spec.look)[2];
        glowAlong(light, tip[0], v.y, full[0], lerp(v.y, ey, on), 34 + 6 * nb, lc, (0.45 + 0.06 * nb) * flick(t, sd));
        light(ex, ey, 50 + 10 * nb, lc, 0.85 * flick(t, sd + 3));
        if (!hitBody) this.strike(w, t, light, s.chanEndX[i], s.chanEndY[i], w.bodies.x[i], w.bodies.y[i], 'beam', t0 + 0.12, sd, 1, beamRamp(spec, look));
      } else if (spec.shape === 'spray') {
        const z: Pt = [ex, ey - 6];
        if (spec.heal) {
          if (look === 'water') {
            K.cone(o, tip, z, t, 'water', t0, { spread: 0.22, power: 0.7, seed: sd });
            for (const p of emit(t, 40, 0.45, (q, age) => ({ x: lerp(tip[0], z[0], age * 1.05), y: lerp(tip[1], z[1], age * 1.05) + (rand(q, 3, sd) - 0.5) * 10 * age - Math.sin(age * Math.PI) * 4, age }), t0, t)) X.px(o, p.x, p.y, p.age < 0.5 ? X.LIFE[1] : X.LIFE[3]);
          } else K.warmCone(o, tip, z, t, t0, X.WARM, sd);
          glowAlong(light, tip[0], v.y, ex, ey, 40, '#ffe68a', 0.4);
        } else {
          const kind: K.ConeKind = spec.scald ? 'scald' : look === 'fire' ? 'fire' : look === 'cold' ? 'cold' : look === 'ice' ? 'freeze' : 'water';
          const fromHead = !!w.battery && w.battery.drive[i] >= 0;
          const head = fromHead && kind === 'fire' ? towerTip(w, w.battery!.drive[i]) : null;
          if (head) {
            // a defence's flamethrower: one stream with depth, hidden by the wall and pillars it passes behind (art/flame-jet.ts)
            // The sim's spray lands on the barrel's line (battery.ts, driveSpray), so the jet runs straight along it. Its end
            // is taken onto the line as drawn, which can differ from the sim's by a few degrees; when the wall stopped the
            // spray, that's where the jet stops too. Aimed so far round that the barrel's line stays inside the wall, the
            // sim's spray runs from the muzzle into the wall and ends there; the jet is drawn its full length along the
            // inside instead, where the barrel points (it hits nothing there either way).
            const bx = head.tip[0] - head.swivel[0], by = head.tip[1] - head.swivel[1] + BARREL_RISE;
            const tw = w.def.props.filter((p) => p.asset === 'defence-tower')[w.battery!.drive[i]];
            const ul = Math.hypot(bx / PPU, by / (PPU * FY)) || 1, ux = bx / PPU / ul, uy = by / (PPU * FY) / ul;
            const aimed = (w.bodies.x[i] + s.aimX[i] - tw.x) * ux + (w.bodies.y[i] + s.aimY[i] - tw.y) * uy;
            const full = Math.max(2, Math.min(aimed, (w.bodies.x[i] - tw.x) * ux + (w.bodies.y[i] - tw.y) * uy + sprayReach(toX(ux, uy), toY(ux, uy))));
            const inside = toY(tw.x + ux * full, tw.y + uy * full) > BATTERY.wallY;
            const along = inside ? full : Math.max(1, (s.chanEndX[i] - tw.x) * ux + (s.chanEndY[i] - tw.y) * uy);
            const land: Pt = [gx(tw.x + ux * along), gy(tw.y + uy * along)];
            const side = (x: number, y: number) => { const u = (x - FIELD.OX) / PPU, vv = (y - FIELD.OY) / (PPU * FY), ry = toY(u, vv); return ry > BATTERY.wallY ? 'near' : ry > BATTERY.wallY - JET_OVER_WALL ? 'over' : 'far'; };
            flameJet(o, { nozzle: head.tip, from: head.ground, to: land, barrel: [bx, by], endH: LIFT, side, frontY: head.ground[1] + 6, t0, seed: sd }, t, this.behind);
          } else if (fromHead) {
            // a defence's other sprays: a jet from a fixed nozzle, three cones side by side, so it holds its body over the longer reach
            const L = Math.hypot(z[0] - tip[0], z[1] - tip[1]) || 1, nx = -(z[1] - tip[1]) / L, ny = (z[0] - tip[0]) / L;
            for (const j of [-1, 1]) K.cone(o, [tip[0] + nx * j * 2, tip[1] + ny * j], [z[0] + nx * j * 13, z[1] + ny * j * 6], t, kind, t0, { spread: 0.3, power: 1.5, seed: sd + 17 * j });
            K.cone(o, tip, z, t, kind, t0, { spread: 0.34, power: 2.2, seed: sd });
          } else this.jet(i, kind, spec, tip[0], tip[1], v.y, ex, ey, t, t0, sd);
          // more runes, more light: the five-rune spray lights the room round it
          const nl = clamp(spec.sizeN || 1, 1, 5);
          glowAlong(light, lerp(tip[0], ex, 0.25), lerp(v.y, ey, 0.25), ex, ey, 36 + 6 * nl, kind === 'fire' ? '#ff7a2a' : (kind === 'cold' || kind === 'freeze') ? '#7ff0ff' : kind === 'scald' ? '#ffd0b0' : '#2a8cff', (kind === 'fire' ? 0.5 : 0.32) * (0.85 + 0.15 * nl) * flick(t, sd));
        }
        this.strike(w, t, light, s.chanEndX[i], s.chanEndY[i], w.bodies.x[i], w.bodies.y[i], splashKind(spec, look), t0, sd);
      } else if (spec.shape === 'arc') {
        X.glow(o, tip[0], tip[1], 6, look === 'fire' ? X.PLASMA[2] : spec.heal ? X.LIFE[2] : EL.lightning[2], 0.8);
      }
      // the Double echoes the channel from its own spot at half power (the sim pays for it: dblPaid)
      const d = s.double[i], dv = d >= 0 && w.bodies.kind[d] === KIND.double ? bodies[d] : null;
      if (s.dblPaid[i] && dv?.on && dv.a && (spec.shape === 'beam' || spec.shape === 'spray')) {
        const dt: Pt = [dv.x + dv.a.tip[0], dv.y + dv.a.tip[1]], dex = gx(s.dblEndX[i]), dey = gy(s.dblEndY[i]), sd2 = sd + 31;
        if (spec.shape === 'beam') {
          const R = spec.heal ? X.LIFE_L : look === 'fire' ? EL.fire : look === 'cold' ? X.FROST : ramp(spec.look);
          K.beam(o, dt, [dex, dey - LIFT], t, R, { on: easeOut(seg(t, t0, t0 + 0.12)), w: 0.5, hit: this.beamHits(w, s.dblEndX[i], s.dblEndY[i], d), seed: sd2 });
          glowAlong(light, dt[0], dv.y, dex, dey, 30, spec.heal ? '#8ef07e' : R[2], 0.3);
          light(dex, dey, 44, spec.heal ? '#8ef07e' : R[2], 0.5);
          this.strike(w, t, light, s.dblEndX[i], s.dblEndY[i], w.bodies.x[d], w.bodies.y[d], 'beam', t0 + 0.12, sd2, 0.6, R);
        } else {
          const kind: K.ConeKind = spec.scald ? 'scald' : look === 'fire' ? 'fire' : look === 'cold' ? 'cold' : look === 'ice' ? 'freeze' : 'water';
          if (spec.heal && look !== 'water') K.warmCone(o, dt, [dex, dey - 6], t, t0, X.WARM, sd2);
          else if (spec.heal) K.cone(o, dt, [dex, dey - 6], t, kind, t0, { spread: 0.2, power: 0.45, seed: sd2 });
          else this.jet(100 + i, kind, spec, dt[0], dt[1], dv.y, dex, dey, t, t0, sd2, 0.5);
          light(lerp(dt[0], dex, 0.5), lerp(dv.y, dey, 0.5), 34, kind === 'fire' ? '#ff7a2a' : '#7fb0ff', 0.3);
          this.strike(w, t, light, s.dblEndX[i], s.dblEndY[i], w.bodies.x[d], w.bodies.y[d], splashKind(spec, look), t0, sd2, 0.6);
        }
        X.glow(o, dt[0], dt[1], 4, EL.sigil[2], 0.6);
      }
      // Survive's Echo: a free copy of the channel from your staff, trailing your aim (the sim's echoEnd)
      const r = w.run;
      if (r && r.echoOn[i] && s.chanTicks[i] >= ECHO_LAG && (spec.shape === 'beam' || spec.shape === 'spray')) {
        const eex = gx(r.echoEndX[i]), eey = gy(r.echoEndY[i]), sd3 = sd + 57, te = t0 + ECHO_LAG / 60;
        if (spec.shape === 'beam') {
          const R = spec.heal ? X.LIFE_L : look === 'fire' ? EL.fire : look === 'cold' ? X.FROST : ramp(spec.look);
          K.beam(o, tip, [eex, eey - LIFT], t, R, { on: easeOut(seg(t, te, te + 0.12)), w: 0.5, hit: this.beamHits(w, r.echoEndX[i], r.echoEndY[i], i), seed: sd3 });
          glowAlong(light, tip[0], v.y, eex, eey, 30, spec.heal ? '#8ef07e' : R[2], 0.3);
          light(eex, eey, 44, spec.heal ? '#8ef07e' : R[2], 0.5);
          this.strike(w, t, light, r.echoEndX[i], r.echoEndY[i], w.bodies.x[i], w.bodies.y[i], 'beam', te + 0.12, sd3, 0.6, R);
        } else {
          const kind: K.ConeKind = spec.scald ? 'scald' : look === 'fire' ? 'fire' : look === 'cold' ? 'cold' : look === 'ice' ? 'freeze' : 'water';
          if (spec.heal && look !== 'water') K.warmCone(o, tip, [eex, eey - 6], t, te, X.WARM, sd3);
          else if (spec.heal) K.cone(o, tip, [eex, eey - 6], t, kind, te, { spread: 0.2, power: 0.45, seed: sd3 });
          else this.jet(200 + i, kind, spec, tip[0], tip[1], v.y, eex, eey, t, te, sd3, 0.45);
          this.strike(w, t, light, r.echoEndX[i], r.echoEndY[i], w.bodies.x[i], w.bodies.y[i], splashKind(spec, look), te, sd3, 0.6);
        }
        X.glow(o, tip[0], tip[1], 3, EL.sigil[2], 0.5);
      }
    }
    this.turretChannels(w, t, light);
  }
  /** Every working defence keeps a small live flame at its nozzle, except while it's firing. */
  private pilots(w: World, t: number, light: LightFn): void {
    const k = towersLit(w), n = k > 0.5 ? liveHeads(w) : 0, s = w.seats; // as the well dies, the flames choke and sputter out (art/power-down.ts)
    for (let k = 0; k < n; k++) {
      const seat = w.battery!.drive.indexOf(k);
      if (seat >= 0 && s.phase[seat] === PHASE.channel) continue;
      const h = towerTip(w, k);
      if (!h) continue;
      pilotFlame(this.o.x, h.tip[0], h.tip[1], t, k * 3.7);
      light(h.tip[0], h.ground[1], 26, '#ff8a30', 0.35);
    }
  }
  /** Turrets channel the spray or beam they were made with, from their orb (structures.ts). */
  private turretChannels(w: World, t: number, light: LightFn): void {
    const dv = w.devices, o = this.o.x;
    for (let k = 0; k < MAX_DEVICES; k++) {
      if (dv.type[k] !== DEVICE.turret || dv.chan[k] <= 0) continue;
      const spec = compile(queueFromCounts(dv.els, k), 'force'), look = elName(spec.look || spec.form);
      const tip: Pt = [gx(dv.x[k]), gy(dv.y[k]) - 16], ex = gx(dv.x2[k]), ey = gy(dv.y2[k]);
      const t0 = t - (T(RHYTHM.naturalChannel) - dv.chan[k]) / 60, sd = k * 613 + 7;
      if (spec.shape === 'beam') {
        const R = spec.heal ? X.LIFE_L : look === 'fire' ? EL.fire : look === 'cold' ? X.FROST : ramp(spec.look);
        K.beam(o, tip, [ex, ey - LIFT], t, R, { on: easeOut(seg(t, t0, t0 + 0.12)), w: 0.7, hit: this.beamHits(w, dv.x2[k], dv.y2[k], -1), seed: sd });
        glowAlong(light, tip[0], tip[1] + LIFT, ex, ey, 30, spec.heal ? '#8ef07e' : R[2], 0.3);
        light(ex, ey, 48, spec.heal ? '#8ef07e' : R[2], 0.6);
        this.strike(w, t, light, dv.x2[k], dv.y2[k], dv.x[k], dv.y[k], 'beam', t0 + 0.12, sd, 0.7, R);
      } else if (spec.shape === 'spray') {
        const kind: K.ConeKind = spec.scald ? 'scald' : look === 'fire' ? 'fire' : look === 'cold' ? 'cold' : look === 'ice' ? 'freeze' : 'water';
        if (spec.heal && look !== 'water') K.warmCone(o, tip, [ex, ey - 6], t, t0, X.WARM, sd);
        else if (spec.heal) K.cone(o, tip, [ex, ey - 6], t, kind, t0, { spread: 0.24, power: 0.7, seed: sd });
        else this.jet(300 + k, kind, spec, tip[0], tip[1], gy(dv.y[k]), ex, ey, t, t0, sd, 0.7);
        light(lerp(tip[0], ex, 0.55), lerp(tip[1], ey, 0.55), 44, kind === 'fire' ? '#ff7a2a' : (kind === 'cold' || kind === 'freeze') ? '#7ff0ff' : '#2a8cff', 0.5);
        this.strike(w, t, light, dv.x2[k], dv.y2[k], dv.x[k], dv.y[k], splashKind(spec, look), t0, sd, 0.7);
      }
    }
  }

  /** Did a beam end on a body (so it splashes), or in the air? */
  private beamHits(w: World, x: number, y: number, src: number): boolean {
    const b = w.bodies;
    for (let i = 0; i < b.kind.length; i++) if (i !== src && b.kind[i] && Math.abs(b.x[i] - x) < b.r[i] + 0.4 && Math.abs(b.y[i] - y) < b.r[i] + 0.4) return true;
    return false;
  }

  // ---- wizards: staff orbs, the readiness swirl, queued runes gathering at the staff ---------------
  private casters(w: World, t: number, bodies: BodyView[], light: LightFn): void {
    const s = w.seats;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i]) { this.motes[i].length = 0; continue; }
      const v = bodies[i]; if (!v?.on || !v.a) continue;
      this.behind(v.x, v.y, 30, () => this.caster(w, t, i, v, light));
    }
  }
  private caster(w: World, t: number, i: number, v: BodyView, light: LightFn): void {
    const s = w.seats, o = this.o.x, g = this.g.x, a = v.a!;
    const casting = s.phase[i] === PHASE.windup || s.phase[i] === PHASE.charge;
    const q: number[] = [];
    const src = casting ? s.castQueue : s.queue, len = casting ? s.castLen[i] : s.queueLen[i];
    for (let k = 0; k < len; k++) q.push(src[i * QUEUE_MAX + k]);
    // keep the arrival time of motes that are still queued; new ones start their flight now
    const ms = this.motes[i];
    let same = 0;
    while (same < ms.length && same < q.length && ms[same].el === q[same]) same++;
    ms.length = same;
    for (let k = same; k < q.length; k++) ms.push({ el: q[k], tq: t });
    const ch: Pt = [v.x + a.charge[0], v.y + a.charge[1]], tip: Pt = [v.x + a.tip[0], v.y + a.tip[1]];
    // the staff orb: the colour of what is being built or cast, else the wizard's own
    const orbEl = ms.length ? ms[ms.length - 1].el : s.phase[i] !== PHASE.idle ? specOf(w, i).look || SEAT_EL[i] : SEAT_EL[i], OR = ramp(orbEl);
    X.rect(o, tip[0] - 1, tip[1] - 1, 3, 3, OR[2]); X.px(o, tip[0], tip[1] - 1, OR[0]); X.px(o, tip[0] - 1, tip[1], OR[1]);
    if (s.phase[i] !== PHASE.charge) X.glow(o, tip[0], tip[1], 5 + (s.phase[i] === PHASE.channel ? 2 : 0), OR[2], 0.55); // not over a charging ball, which sits at the staff
    // one wide pool from the staff, smooth so nothing about it is seen to travel with the wizard
    light(v.x, v.y, 80, '#a8a0d0', 0.24, true); light(tip[0], v.y + 2, 54, OR[2], 0.2, true);
    // the readiness swirl: one mote per ready rune, in runs of element colour, round the waist
    this.swirl(g, o, w, i, v, t, ms.length > 0 || s.phase[i] !== PHASE.idle);
    // queued runes fly from the swirl to the staff and orbit there as a charge
    let arrived = 0, last = 0;
    ms.forEach((mq, k) => {
      const e = (t - mq.tq) / 0.24, R = ramp(mq.el);
      if (e < 1) {
        const a0 = 2.4 + k * 1.3, sx = v.x + Math.cos(a0) * 11, sy = v.y - 9 + Math.sin(a0) * 11 * FY, kk = smooth(Math.max(0, e));
        const x = lerp(sx, ch[0], kk), y = lerp(sy, ch[1], kk) - Math.sin(e * Math.PI) * 5;
        for (let tr = 1; tr <= 3; tr++) { const k2 = smooth(Math.max(0, e - tr * 0.09)); X.px(o, lerp(sx, ch[0], k2), lerp(sy, ch[1], k2) - Math.sin(Math.max(0, e - tr * 0.09) * Math.PI) * 5, R[tr < 2 ? 2 : 3]); }
        X.rect(o, x - 1, y - 1, 2, 2, R[1]); X.px(o, x, y - 1, R[0]);
        return;
      }
      arrived++; last = mq.el;
      const n = ms.length, a2 = (k / n) * TAU + t * 7, r = 3.4 + n * 0.6, x = ch[0] + Math.cos(a2) * r, y = ch[1] + Math.sin(a2) * r * 0.75;
      X.px(o, x - Math.cos(a2 - 0.5) * 1.6, y - Math.sin(a2 - 0.5) * 1.2, R[3]);
      X.rect(o, x - 0.5, y - 0.5, 2, 2, R[0]); X.px(o, x + 1, y + 1, R[2]);
      const pe = (t - mq.tq - 0.24) / 0.22;
      if (pe >= 0 && pe < 1) { X.ring(o, ch[0], ch[1], 2 + pe * 7, (2 + pe * 7) * 0.8, R[pe < 0.4 ? 0 : 1], 1 - pe); if (pe < 0.25) X.rect(o, ch[0] - 1, ch[1] - 1, 3, 3, '#ffffff'); }
    });
    if (arrived) {
      const R = ramp(last);
      X.glow(o, ch[0], ch[1], 5 + arrived * 2.4, R[2], 0.75 + 0.15 * Math.sin(t * 30));
      X.ring(o, ch[0], ch[1], 3.4 + ms.length * 0.6, (3.4 + ms.length * 0.6) * 0.75, R[3], 0.5);
      X.rect(o, ch[0] - 1, ch[1] - 1, 2, 2, R[1]); X.px(o, ch[0], ch[1], arrived === ms.length ? '#ffffff' : R[0]);
      light(ch[0], v.y, 30 + arrived * 6, R[2], 0.3 + 0.12 * arrived);
    }
  }
  private swirl(g: Ctx, o: Ctx, w: World, i: number, v: BodyView, t: number, busy: boolean): void {
    // the local player's HUD shows the detail: their swirl is a third as dense, closer and dimmer
    const me = i === this.localSeat, sc = me ? 0.34 : 1, rr = me ? 11.5 : 14, ph = (i + 1) * 1.7, W1 = TAU / 12;
    let k = 0;
    for (let e = 1; e <= N_EL; e++) {
      const val = w.seats.runes[i * N_EL + e - 1] * sc, n = Math.floor(val + 1e-6), fr = val - n, R = ramp(e);
      for (let j = 0; j <= n; j++) {
        const part = j === n ? fr : 0;
        if (j === n && fr <= 0.3) break;
        const kk = k + j;
        if (part && Math.floor(t * 4 + j) % 2) continue; // a regenerating rune blinks in
        if (busy && j & 1) continue; // casting: the swirl steps back
        const slot = (q: number) => { const a = ph + W1 * 2 * t - q * 0.5 * (me ? 0.62 : 0.8), z = 10 + (me ? 2.5 : 4) * Math.sin(a + ph) + Math.sin(W1 * 7 * t + q) * 0.7; return { x: v.x + Math.cos(a) * rr, y: v.y + Math.sin(a) * rr * FY - z, front: Math.sin(a) > -0.1 }; };
        const p = slot(kk), b2 = slot(kk + 0.22), dim = part > 0 || busy || me;
        if (!p.front) { X.px(g, p.x, p.y, R[dim ? 3 : 2]); X.px(g, b2.x, b2.y, R[4] ?? R[3]); continue; }
        if (!dim) {
          X.px(o, b2.x, b2.y, R[3]);
          X.px(o, p.x - 1, p.y, R[2]); X.px(o, p.x + 1, p.y, R[2]); X.px(o, p.x, p.y - 1, R[2]); X.px(o, p.x, p.y + 1, R[3]);
          X.px(o, p.x, p.y, R[0]);
        } else { X.px(o, p.x, p.y, R[me ? 2 : 1]); if (!me) X.px(o, b2.x, b2.y, R[3]); }
      }
      k += val;
    }
  }

  // ---- statuses hanging off bodies (the rig draws what is on the body) --------------------------
  private statuses(w: World, simT: number, bodies: BodyView[], light: LightFn, t: number): void {
    const b = w.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const v = bodies[i]; if (!v.on || !v.a) continue;
      if (!(b.burn[i] > 0 || b.wet[i] > 0 || b.frozen[i] || b.chill[i] > 0.04 || b.stun[i] > 0 || b.expose[i] > 0 || (b.down[i] > 0 && !b.downed[i]) || b.blessT[i] > 0 || simT - this.healAt[i] < 1.2)) continue;
      this.behind(v.x, v.y, 30, (o) => {
      const ch: Pt = [v.x + v.a!.chest[0], v.y + v.a!.chest[1]], hd: Pt = [v.x + v.a!.head[0], v.y + v.a!.head[1]], big = v.rig === 'brute';
      if (b.burn[i] > 0) { K.burningFx(o, ch, t, b.burnPool[i] < 10 ? 0.5 : 1, big, i * 7); light(v.x, v.y - 4, big ? 70 : 44, '#ff7020', 0.6 + 0.06 * Math.sin(t * 19 + i)); }
      if (b.wet[i] > 0 && !b.frozen[i]) K.drips(o, ch, v.y, t, i * 5);
      if (b.frozen[i]) { K.iceGlints(o, v.x, v.y, HEIGHT[v.rig] + 3, WIDTH[v.rig] + 1, t, i); light(v.x, v.y - 4, 30, '#bff4ff', 0.3); }
      else if (b.chill[i] > 0.04) K.chilled(o, ch, hd, t, b.chill[i], i, big ? 1.8 : 1);
      if (b.stun[i] > 0) K.shockSparks(o, ch, t, i * 3);
      if (b.blessT[i] > 0 && Math.max(b.bless[i * 5], b.bless[i * 5 + 1], b.bless[i * 5 + 2], b.bless[i * 5 + 3], b.bless[i * 5 + 4]) >= 0.1) {
        // the imbue (a heal's elements, building up and fading): the elemental ward's skin round the body, in the colour of
        // what it resists most, thicker the stronger it is and thinning as it fades (the user, 2026-11-11: re-use the ward's look)
        let col = 0;
        for (let c2 = 1; c2 < 5; c2++) if (b.bless[i * 5 + c2] > b.bless[i * 5 + col]) col = c2;
        const r0 = b.bless[i * 5 + col], R = IMBUE[col];
        this.sil.halo(o, v, t, R[2], { col2: R[1], hi: R[0], ring: r0 > 1.2 ? 2 : 1, level: Math.round(clamp(3 + r0 * 5, 3, 13)) });
        light(v.x, v.y - 8, 24, R[2], clamp(0.12 + r0 * 0.12, 0.12, 0.35));
      }
      if (b.expose[i] > 0) {
        // exposed: its guard is broken open, cracked amber marks flicker on the body and a broken ring at its feet
        const f = Math.floor(t * 8 + i);
        if (f % 4) { X.lines(o, [[ch[0] - 3, ch[1] - 3], [ch[0] - 1, ch[1] - 1], [ch[0] - 2, ch[1] + 1]], '#ffb060'); X.lines(o, [[ch[0] + 3, ch[1] - 2], [ch[0] + 1, ch[1]], [ch[0] + 2, ch[1] + 2]], '#ff7a3a'); }
        for (let k = 0; k < 8; k++) if ((k + f) % 3) { const a = (k / 8) * TAU; X.px(this.g.x, v.x + Math.cos(a) * 7, v.y + 1 + Math.sin(a) * 7 * FY, '#ff7a3a'); }
      }
      if (b.down[i] > 0 && !b.downed[i]) K.dazed(o, hd, t);
      if (simT - this.healAt[i] < 1.2) K.sparkle(o, v.x, v.y - 10, t, 1 - seg(simT - this.healAt[i], 0.8, 1.2), 10, i, X.LIFE);
      });
    }
  }
  private bars(w: World, bodies: BodyView[]): void {
    const b = w.bodies, o = this.o.x;
    for (let i = 0; i < bodies.length; i++) {
      const v = bodies[i], chill = b.chill[i], burning = b.burn[i] > 0 ? b.burnPool[i] : 0;
      if (!v.on || !v.a || b.downed[i] || (b.hp[i] >= b.maxHp[i] && chill <= 0.02 && burning <= 0)) continue;
      const f = Math.max(0, b.hp[i] / b.maxHp[i]), wd = v.rig === 'brute' ? 18 : 12, cold = chill > 0.02;
      const x = Math.round(v.x - wd / 2), y = Math.round(v.y + v.a.head[1] - (v.rig === 'wizard' ? 18 : 9));
      X.rect(o, x - 1, y - 1, wd + 2, cold ? 5 : 4, '#120e1a'); X.rect(o, x, y, wd, 2, '#3a1420');
      const fill = Math.max(1, Math.round(wd * f));
      X.rect(o, x, y, fill, 2, b.team[i] === 1 ? (f > 0.5 ? '#5fe07a' : f > 0.25 ? '#e6c84a' : '#e05a5a') : '#e05a5a');
      // the health this burn will still take, if nothing puts it out
      if (burning > 0) { const left = Math.round(wd * Math.max(0, b.hp[i] - burning) / b.maxHp[i]); if (left < fill) X.rect(o, x + left, y, fill - left, 2, '#ff9a2a'); }
      // the frost pool, a 1 px strip that brightens once there's enough for Water to freeze
      if (cold) { X.rect(o, x, y + 2, wd, 1, '#1c2c44'); X.rect(o, x, y + 2, Math.max(1, Math.round(wd * chill)), 1, chill >= STATUS.freezeMin ? X.FROST[1] : X.FROST[3]); }
    }
  }

  // ---- event effects ---------------------------------------------------------------------------
  private drawFx(f: Fx, e: number, t: number, w: World, bodies: BodyView[], light: LightFn): void {
    if (f.half) {
      // north on the ground is up and to the right on screen; keep that side of the wall's line through the ring's centre
      const cx = gx(f.x), cy = gy(f.y), A = 500, B = 700;
      const cut = (c: Ctx) => { c.save(); c.beginPath(); c.moveTo(cx - A, cy - A / 2); c.lineTo(cx + A, cy + A / 2); c.lineTo(cx + A + B, cy + A / 2 - B / 2); c.lineTo(cx - A + B, cy - A / 2 - B / 2); c.closePath(); c.clip(); };
      const g = this.g.x, o = this.o.x;
      cut(g); cut(o);
      f.half = false;
      this.drawFx(f, e, t, w, bodies, light);
      f.half = true;
      g.restore(); o.restore();
      g._fs = null; o._fs = null; // restore() put back a fill the colour cache doesn't know about
      return;
    }
    const o = this.o.x, g = this.g.x, sd = f.seed, R = ramp(f.look), el = elName(f.look);
    const x = gx(f.x), y = gy(f.y), r = f.r * 16;
    const body = f.who >= 0 && f.who < bodies.length ? bodies[f.who] : null;
    switch (f.kind) {
      case 'release': {
        if (!body?.on || !body.a) return;
        const ch: Pt = [body.x + body.a.charge[0], body.y + body.a.charge[1]], els = f.els?.length ? f.els : [f.look || 6];
        els.forEach((id, k) => X.ring(o, ch[0], ch[1], 2 + e * 40 + k * 2, (2 + e * 40 + k * 2) * 0.8, ramp(id)[k ? 2 : 1], 1 - e / 0.25));
        if (e < 0.06) X.rect(o, ch[0] - 2, ch[1] - 2, 5, 5, '#ffffff');
        return;
      }
      case 'pop': {
        // small damage and heal numbers: rise a few pixels and fade (dithered), never noisy
        // it follows the body; once the body is gone (the hit killed it) it stays where the body was last
        // drawn, or where it was hit, so the killing blow's number shows too. r marks x2/y2 as set.
        const v = bodies[f.who];
        if (v?.on && v.a) { f.x2 = v.x; f.y2 = v.y + v.a.head[1]; f.r = 1; }
        const ax = f.r ? f.x2 : gx(f.x), ay = f.r ? f.y2 : gy(f.y) - 14;
        const k = e / f.life, px2 = ax + (rand(sd, 1) - 0.5) * 8, py2 = ay - 12 - easeOut(Math.min(1, k * 1.6)) * 8;
        if (k > 0.7 && X.bay(Math.round(px2), Math.round(py2 + e * 60)) < (k - 0.7) / 0.3) return;
        const heal = f.look === 1, str = f.text ? f.text : (heal ? '+' : '') + f.n;
        const col = f.text ? '#ffd36b' : heal ? X.LIFE[1] : f.n >= 20 ? '#ffd860' : '#f4f0f8';
        X.text(o, str, Math.round(px2 - str.length * 2), Math.round(py2), col, '#120e1a');
        return;
      }
      case 'zap': {
        if (Math.floor(t * 18) % 3 === 2 && e > 0.05) return;
        const from = this.bodyAt(bodies, w, f.x, f.y), to = this.bodyAt(bodies, w, f.x2, f.y2);
        const a: Pt = from ? (from.seat === f.who && from.a ? [from.x + from.a.tip[0], from.y + from.a.tip[1]] : [from.x + (from.a?.chest[0] ?? 0), from.y + (from.a?.chest[1] ?? -8)]) : [x, y - 8];
        const z: Pt = to?.a ? [to.x + to.a.chest[0], to.y + to.a.chest[1]] : [gx(f.x2), gy(f.y2) - 8];
        const s2 = sd + Math.floor(t * 18) * 13;
        if (f.text === 'flame') {
          // the flame arc: a white-hot plasma channel spraying molten sparks
          const pts = K.bolt(a, z, s2, 0.3, 4);
          X.lines(o, pts, X.PLASMA[4], 4); X.lines(o, pts, X.PLASMA[2], 2); X.lines(o, pts, '#ffffff', 1);
          X.glow(o, z[0], z[1], 7, X.PLASMA[2], 0.9); X.rect(o, z[0] - 1, z[1] - 1, 3, 3, '#ffffff');
          K.moltenSparks(o, z[0], to ? to.y : z[1] + 8, 9, t, 80, sd, f.t0, f.t0 + 0.15);
          light(z[0], to ? to.y : z[1] + 8, 46, '#ffb050', 0.8);
        } else if (f.text === 'life') {
          const pts = K.bolt(a, z, s2, 0.3, 4);
          X.lines(o, pts, X.LIFE[5], 3); X.lines(o, pts, X.LIFE[3], 2); X.lines(o, pts, X.LIFE[0], 1); X.glow(o, z[0], z[1], 6, X.LIFE[2], 0.8);
          light(z[0], z[1] + 8, 34, '#8ef07e', 0.6);
        } else {
          const LR = el === 'lightning' || !f.look ? EL.lightning : R;
          K.zap(o, a, z, s2, LR); K.zapHit(o, z, s2, LR);
          light(z[0], z[1] + 8, 60, '#b08aff', 0.8);
        }
        return;
      }
      case 'discharge': {
        if (!body?.on || !body.a) return;
        const c: Pt = [body.x + body.a.chest[0], body.y + body.a.chest[1] - 2];
        K.gring(g, body.x, body.y, (4 + SHAPES_DISCHARGE) * 16 * easeOut(Math.min(1, e / 0.2)), EL.lightning[3], 0.4 * (1 - e / f.life), 1);
        if (Math.floor(t * 20) % 3 !== 2) { X.glow(o, c[0], c[1], 10, EL.lightning[2], 0.9); for (let k = 0; k < 4; k++) { const a = rand(sd + Math.floor(t * 20), k) * TAU; X.lines(o, K.bolt(c, [c[0] + Math.cos(a) * 16, c[1] + Math.sin(a) * 12], sd + k + Math.floor(t * 20), 0.5, 2), EL.lightning[2], 1); } }
        light(body.x, body.y, 70, '#b08aff', 0.9 * (1 - e / f.life));
        return;
      }
      case 'strike': {
        // a sky strike: a bolt from above, a white flash, a ring, light everywhere
        const top: Pt = [x + 14, y - FIELD.OY + 4];
        if (e < 0.25 && Math.floor(t * 30) % 2 === 0) { const pts = K.bolt(top, [x, y - 2], sd + Math.floor(t * 30), 0.25, 5); X.lines(o, pts, EL.lightning[3], 4); X.lines(o, pts, '#ffffff', 2); }
        if (e < 0.06) X.ellipse(o, x, y - 4, 16, 10, '#ffffff');
        if (e < 0.4) K.gring(g, x, y, 4 + e * 60, EL.lightning[1], 1 - e / 0.4, 1);
        K.scorch(g, x, y, 8, 0.5 * (1 - seg(e, 0.3, 0.6)));
        light(x, y, 120, '#c4a4ff', 1.2 * (1 - e / 0.3));
        return;
      }
      case 'nova': {
        if (drawNova(o, g, f.look, x, y, r, e, t, sd, light, 'far')) { drawNova(o, g, f.look, x, y, r, e, t, sd, light, 'near'); return; }
        K.nova(o, x, y - 2, t, f.t0, 0.5, r, R, { n: 34, lift: 6, seed: sd });
        light(x, y, r + 30, R[2], 0.8 * (1 - seg(e, 0, 0.6)));
        return;
      }
      case 'splinters': {
        // a line of stakes giving way (the battery, as a defence is taken): chips of wood fly and fall, and some dust
        if (e < 0.5) K.puff(o, x, y - 4 - e * 8, 3 + e * 8, '#8a7a68', 0.7 * (1 - e / 0.5));
        for (let k = 0; k < 16; k++) {
          const a = rand(k, 81, sd) * TAU, sp = 10 + rand(k, 82, sd) * 22, vz = 22 + rand(k, 83, sd) * 30, z = vz * e - 90 * e * e;
          if (z < 0) continue;
          K.sq(o, x + Math.cos(a) * sp * e, y + Math.sin(a) * sp * e * FY - z - 3, k % 4 ? 1 : 2, k % 3 ? '#977552' : '#553e2a');
        }
        return;
      }
      case 'quake': case 'slam': {
        // the ground cracks out from the centre and a ring of dust and stones rolls out
        const front = Math.max(4, r * easeOut(Math.min(1, e / 0.5)));
        K.cracks(g, x, y, r * 0.9, sd, seg(e, 0, 0.4), '#1a120c', 9);
        X.ellipse(g, x, y, 12, 6, 'rgba(26,18,12,0.5)');
        if (e < 1) { const a = 1 - seg(e, 0.5, 1); K.gring(g, x, y, front, '#553e2a', a, 3); K.gring(g, x, y, front + 1, '#b8946a', a, 1); }
        if (e < 0.7) { const q = e / 0.7, a = 1 - q; K.gring(o, x, y, front, X.EARTH[1], a, 2); for (let i = 0; i < 22; i++) { const th = (i / 22) * TAU + rand(i, 2, sd) * 0.2, px2 = x + Math.cos(th) * front, py2 = y + Math.sin(th) * front * FY; K.puff(o, px2, py2 - 2 - q * 4, 2 + q * 3, i % 2 ? '#8a7a68' : '#6a5a4a', a); if (i % 3 === 0 && q < 0.5) X.rect(o, px2, py2 - 4 - Math.sin(q * 9) * 4, 2, 2, '#977552'); } }
        return;
      }
      case 'patch': {
        if (f.look === 8) {
          if (e < 0.9) for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, rr = r * easeOut(e / 0.9) + (rand(i, Math.floor(t * 20), 62) - 0.5) * 2; X.px(o, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY - 1, i % 2 ? EL.fire[1] : EL.fire[0]); }
        } else if (f.look === 4 || f.look === 10) {
          if (e < 0.6) { const front = x - r - 8 + (e / 0.6) * (r * 2 + 16); for (let i = 0; i < 10; i++) X.px(o, front + (rand(i, Math.floor(t * 20), sd) - 0.5) * 4, y - r * FY + i * r * FY * 0.2, i % 2 ? '#ffffff' : EL.cold[1]); }
          light(x, y, r + 20, '#9ff4ff', 0.4 * (1 - e / f.life));
        }
        return;
      }
      case 'blast': case 'geyser': {
        if (f.kind === 'blast') {
          K.scorch(g, x, y, r * 0.55, 0.35 * (1 - seg(e, f.life - 0.6, f.life))); K.cracks(g, x, y, r * 0.65, sd, 1, 'rgba(30,14,30,0.8)', 7);
          if (e < 0.5) { X.glow(o, x, y - 6, 24 * (1 - e * 1.5), R[2], 0.9); K.gring(o, x, y, 6 + e * 100, R[1], 1 - e / 0.5, 2); K.gring(o, x, y, 4 + e * 70, '#ffffff', 0.8 - e / 0.5, 1); }
          if (e < 0.8) for (let k = 0; k < 24; k++) { const a = rand(k, 91, sd) * TAU, sp = 30 + rand(k, 92, sd) * 40, vz = 30 + rand(k, 93, sd) * 50, z = vz * e - 120 * e * e; if (z < 0) continue; K.sq(o, x + Math.cos(a) * sp * e, y + Math.sin(a) * sp * e * FY - z, k % 3 ? 1 : 2, k % 2 ? R[1] : '#ffffff'); }
          light(x, y, r + 40, R[2], 1.1 * (1 - seg(e, 0, 0.5)));
        } else {
          // the geyser erupts: rock and earth thrown high, a column of dust, the ground broken
          K.scorch(g, x, y, r * 0.8, 0.6 * (1 - seg(e, f.life - 0.5, f.life))); K.cracks(g, x, y, r * 1.1, sd, 1, '#1a120c', 7);
          const gcols: Ramp = f.look === 1 ? [EL.water[1], EL.water[2], '#ffffff'] : f.look === 8 ? [EL.fire[1], EL.fire[3], '#6a2a1a'] : f.look === 4 || f.look === 10 ? [EL.cold[1], EL.cold[3], '#ffffff'] : ['#977552', '#553e2a', '#b8946a'];
          if (e < 0.45) K.gring(g, x, y, 8 + e * 80, '#e0c8a0', 1 - e / 0.45, 1);
          if (e < 0.08) X.ellipse(o, x, y - 6, 12, 9, '#ffffff');
          for (let i = 0; i < 6; i++) { const h = (14 + rand(i, 33, sd) * 10) * easeOut(seg(e, 0, 0.08 + i * 0.01)) * (1 - seg(e, 0.6, 1.1)); if (h < 1) continue; const a = (i / 6) * TAU + rand(i, 31, sd) * 0.5, rr = 3 + rand(i, 32, sd) * r * 0.5, sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr * FY, wd = 2.5 + rand(i, 34, sd); X.poly(o, [[sx - wd - 1, sy + 1], [sx + wd + 1, sy + 1], [sx + Math.cos(a) * 2 + 1, sy - h - 1], [sx + Math.cos(a) * 2 - 1, sy - h - 1]], '#1a120c'); X.poly(o, [[sx - wd, sy], [sx + wd, sy], [sx + Math.cos(a) * 2 + 0.5, sy - h]], gcols[1]); X.poly(o, [[sx - wd, sy], [sx - wd * 0.1, sy], [sx + Math.cos(a) * 2, sy - h + 1]], gcols[0]); }
          K.debris(o, x, y - 4, e, sd, 16, 40, gcols, 90);
          K.dust(o, x, y, e - 0.05, sd, 12, 28, '#8a7a68', 1.4);
          light(x, y, r + 30, f.look === 8 ? '#ff7a2a' : '#e0c8a0', 0.6 * (1 - seg(e, 0, 0.6)));
        }
        return;
      }
      case 'healburst': {
        if (e < 0.07) X.ellipse(o, x, y - 4, 12, 9, '#f2ffe8');
        K.nova(o, x, y, t, f.t0, 0.45, r, EL.life, { n: 26, lift: 8, seed: sd });
        K.debris(o, x, y - 4, e, sd, 9, 30, ['#c8fab0', '#977552', '#8ef07e'], 40);
        K.sparkle(o, x, y - 4, t, 1 - seg(e, 1, 1.6), 28, sd, X.LIFE, 22);
        const k = easeOut(seg(e, 0, 0.3)) * (1 - seg(e, 1.2, 1.8));
        if (k > 0.02) { K.gring(g, x, y, r * k, EL.life[2], 0.8 * k, 1); X.ellipse(g, x, y, r * 0.75 * k, r * 0.75 * k * FY, '#1e7a34', 0.35 * k); }
        light(x, y, r + 30, '#8ef07e', 0.9 * (1 - seg(e, 0, 1.5)));
        return;
      }
      case 'kindle': {
        // the battery's infusion (beat 6): fire wells up out of the ground round you and rises, and the light spreads out
        if (e < 0.07) X.ellipse(o, x, y - 4, 10, 8, '#fff2c8');
        K.sparkle(o, x, y - 6, t, 1 - seg(e, 1.1, 1.8), 18, sd, EL.fire, 30);
        K.debris(o, x, y - 4, e, sd, 7, 26, [EL.fire[0], EL.fire[1], EL.fire[2]], 30);
        const k = easeOut(seg(e, 0, 0.5)) * (1 - seg(e, 1.2, 1.8));
        if (k > 0.02) { K.gring(g, x, y, (r + 14) * k, EL.fire[2], 0.8 * k, 1); X.ellipse(g, x, y, (r + 10) * 0.75 * k, (r + 10) * 0.75 * k * FY, EL.fire[3], 0.3 * k); }
        light(x, y, 30 + 90 * easeOut(seg(e, 0, 1.2)), '#ff9a30', 0.9 * (1 - seg(e, 0.3, 1.8)));
        return;
      }
      case 'swing': {
        // the swing: a crescent smear sweeping across the front, white at the edge, then the look's colour
        const cx = gx(f.x2), cy = gy(f.y2) - 8, ang = Math.atan2((f.y - f.y2) * FY, f.x - f.x2), q = clamp(e / 0.18, 0, 1), rr = 14;
        const C = f.look ? R : ['#ffffff', '#e8e4f0', '#b8b4c8', '#8a8498', '#5a5468'];
        for (let k = 0; k < 10; k++) { const a0 = ang - 1.1 + q * 2.2 - k * 0.12; if (a0 < ang - 1.1) break; const a1 = a0 - 0.12; X.line(o, cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr * 0.7, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr * 0.7, k < 3 ? '#ffffff' : C[Math.min(C.length - 1, k < 6 ? 1 : 2)], k < 4 ? 3 : 2); }
        if (e > 0.12 && e < 0.3) for (let k = 0; k < 6; k++) { const a = ang + (rand(k, sd) - 0.5) * 1.6, d = rr + (e - 0.12) * 60; X.px(o, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, C[1]); }
        return;
      }
      case 'palm': {
        const h: Pt = body?.on && body.a ? [body.x + body.a.hands[0][0], body.y + body.a.hands[0][1]] : [gx(f.x2), gy(f.y2) - 8];
        const z: Pt = [x, y - 8], q = clamp(e / 0.32, 0, 1);
        if (e < 0.32) {
          const px2 = lerp(h[0] + 2, z[0], easeOut(q)), py2 = lerp(h[1], z[1], q);
          for (let k = 0; k < 3; k++) X.ring(o, px2 - k * 4 * Math.sign(z[0] - h[0] || 1), py2, 2 + k, 4 + k * 1.5, k ? X.LIFE[3] : X.LIFE[1], 1 - k * 0.3, -1.2, 1.2);
          X.glow(o, px2, py2, 5, X.LIFE[2], 0.7);
          for (let fn = 0; fn < 4; fn++) X.rect(o, px2 + 1, py2 - 3 + fn * 1.5, 2, 1, X.LIFE[0]);
          X.rect(o, px2 - 1, py2 - 2, 2, 4, X.LIFE[1]);
        } else K.healHit(o, z, e - 0.32);
        if (e < 0.12) X.glow(o, h[0] + 2, h[1], 6, X.LIFE[1], 0.9);
        light(z[0], y, 40, '#c8fab0', 0.7 * (1 - seg(e, 0.3, 0.9)));
        return;
      }
      case 'self': {
        if (!body?.on) return;
        const Rs = f.look === 2 ? X.LIFE : R;
        K.gring(g, body.x, body.y, 4 + e * 18, Rs[1], 1 - e, 1);
        if (f.look === 2) { K.healHit(o, [body.x, body.y - 10], e); K.sparkle(o, body.x, body.y - 10, t, 1 - e, 12, sd); }
        else for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + e * 4, d = 12 * (1 - e); X.px(o, body.x + Math.cos(a) * d, body.y - 10 + Math.sin(a) * d * 0.6, Rs[k % 2 ? 1 : 2]); }
        light(body.x, body.y, 40, Rs[2], 0.6 * (1 - e));
        return;
      }
      case 'blink': {
        // Blink is near-instant: the body's pixels streak out along the aim and land in a few frames,
        // no wind-up. Over a long jump each pixel draws its streak, so the path reads as one flash of light.
        const ax2 = gx(f.x2), ay2 = gy(f.y2), TEAM = X.TEAMS[(f.who + 4) % 4], SV = EL.sigil, cols = [TEAM.main, TEAM.light, SV[1], SV[0], '#ffffff', TEAM.dark];
        const D = Math.hypot(ax2 - x, ay2 - y), travel = 0.06 + Math.min(0.07, D / 5000);
        if (D > 40 && e < 0.22) {
          // the path: a thin violet seam that flares and fades
          const a = 1 - e / 0.22, n = Math.max(2, Math.round(D / 2));
          for (let i = 0; i <= n; i++) { const k = i / n, px2 = lerp(x, ax2, k), py2 = lerp(y, ay2, k) - 10; if (a > X.bay(Math.round(px2), Math.round(py2))) X.px(o, px2, py2, e < 0.06 ? '#ffffff' : SV[1]); }
          for (let i = 1; i < 6; i++) light(lerp(x, ax2, i / 6), lerp(y, ay2, i / 6), 30, '#ee8cff', 0.35 * a);
        }
        for (let i = 0; i < 48; i++) {
          const bx = (rand(i, 1, sd) - 0.5) * 9, bz = 1 + rand(i, 2, sd) * 22, t0 = rand(i, 3, sd) * 0.03 + (bz / 23) * 0.01, q0 = (e - t0) / travel;
          if (q0 < 0 || q0 > 1.2) continue;
          const q = Math.min(1, q0), k = q * q * (3 - 2 * q), px2 = lerp(x + bx, ax2 + bx, k), py2 = lerp(y - bz, ay2 - bz, k);
          if (q0 < 1) { const k2 = Math.max(0, q - 0.3), k3 = k2 * k2 * (3 - 2 * k2); X.line(o, lerp(x + bx, ax2 + bx, k3), lerp(y - bz, ay2 - bz, k3), px2, py2, i % 3 ? SV[2] : cols[i % cols.length]); }
          X.px(o, px2, py2, q0 > 1 ? '#ffffff' : cols[i % cols.length]);
        }
        if (e < 0.08) { const q = e / 0.08; X.ring(o, x, y - 10, 10 * (1 - q) + 1, 12 * (1 - q) + 1, SV[1], 1 - q * 0.5); }
        if (e > travel && e < travel + 0.25) { const q = (e - travel) / 0.25; K.gring(g, ax2, ay2, 4 + q * 12, SV[1], 1 - q, 1); }
        if (e < 0.25) { light(ax2, ay2, 46, '#ee8cff', 0.7 * (1 - e / 0.25)); light(x, y, 36, '#ee8cff', 0.5 * (1 - e / 0.25)); }
        return;
      }
      case 'impact': {
        const ty = f.n, look = elName(f.look), ix = x, iy = y - (ty === 2 ? STAFF_Z : 6), s = clamp(f.r * 16 / 5, 0.6, 1.6);
        if (ty === 2) {
          // a shard splinters into glitter
          if (e < 0.2) for (let k = 0; k < 6; k++) { const a = rand(k, sd, 9) * TAU; X.px(o, ix + Math.cos(a) * e * 40, iy + Math.sin(a) * e * 20, k % 2 ? '#ffffff' : (f.look === 2 ? X.LIFE[1] : EL.cold[1])); }
          if (f.look === 2) K.healHit(o, [ix, iy], e);
          return;
        }
        if (ty === 1 && look === 'fire') {
          // the fireball bursts: a white flash, a ball of flame, a ring of tongues, embers flung; all of it carrying on
          // the way the ball flew (the user: a burst sitting still on the impact broke the ball's momentum)
          const v = Math.hypot(f.x2, f.y2 * FY) || 1, fux = f.x2 / v, fuy = (f.y2 * FY) / v, wash = 18 * s * (1 - Math.exp(-e * 3.5));
          const x = ix + fux * wash, y = gy(f.y) + fuy * wash * 0.5, iy0 = iy + fuy * wash;
          K.scorch(g, x, y, 14 * s, 0.75 * (1 - seg(e, 0.8, 1.4))); K.cracks(g, x, y, 12 * s, sd, 1, `rgba(20,10,8,${(0.8 * (1 - seg(e, 0.8, 1.4))).toFixed(2)})`, 7);
          if (e < 0.07) X.ellipse(o, x, iy0, 14 * s, 11 * s, '#fff4c0');
          if (e < 0.45) { const q = e / 0.45; X.glow(o, x, iy0, 18 * s * (1 - q * 0.6), EL.fire[2], 0.95 * (1 - q)); X.glow(o, x, iy0, 10 * s * (1 - q), EL.fire[1], 0.9 * (1 - q)); }
          if (e < 0.6) { const q = e / 0.6, rr = 4 + easeOut(q) * 24 * s; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; K.tongue(o, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY, 1.8, (7 + 3 * Math.sin(i * 2.7)) * (1 - q), Math.cos(a) * 2); } K.gring(o, x, y, rr + 2, EL.fire[1], 1 - q, 1); }
          if (e < 1) for (let k = 0; k < 20; k++) { const a = rand(k, 5, sd) * TAU, sp = 18 + rand(k, 6, sd) * 28, vz = 30 + rand(k, 7, sd) * 40, z = vz * e - 90 * e * e; if (z < -1) continue; X.px(o, x + (Math.cos(a) + fux * 0.8) * sp * e, y + (Math.sin(a) * FY + fuy * 0.8) * sp * e - Math.max(0, z), K.fireCol(e * 0.9 + rand(k, 8, sd) * 0.2)); }
          if (e > 0.2) for (let i = 0; i < 6; i++) { const a = rand(i, 61, sd) * TAU, rr = Math.sqrt(rand(i, 62, sd)) * 8; K.tongue(o, x + Math.cos(a) * rr, y + Math.sin(a) * rr * FY * 0.7, 1.4, (3 + 2 * Math.sin(t * 12 + i * 2)) * (1 - seg(e, 0.8, 1.4)) * seg(e, 0.2, 0.5), Math.sin(t * 6 + i)); }
          K.dust(o, x, y, e, sd, 7, 16, '#5a4a48', 0.9);
          light(x, y, 110, '#ffb060', 1.2 * (1 - seg(e, 0, 0.5))); light(x, y, 34, '#ff7020', 0.5 * (1 - seg(e, 0.5, 1.4)));
          return;
        }
        if (ty === 1 && look === 'arcane') {
          RF.arcaneBurst(o, g, x, y, iy, e, s, sd);
          K.debris(o, x, iy, e, sd, 6, 40, ['#9a6a84', '#5a3c4a', '#ffc0e0']);
          light(x, y, 90, '#ff6ab0', 1.1 * (1 - seg(e, 0, 0.5)));
          return;
        }
        if (ty === 1 && look === 'cold' && !((f.flags ?? 0) & PF.freeze)) {
          // a snowball ends in a puff of frost over the sim's chill disc (effects.ts frostPuff)
          const cold = f.els ? f.els[EL_COLD - 1] : 1, R = (SHAPES.frostPuff + 0.3 * Math.max(0, cold - 1)) * 16;
          const v = Math.hypot(f.x2, f.y2 * FY) || 1;
          RF.frostPuff(o, g, x, y, iy, e, R, sd, f.x2 / v, (f.y2 * FY) / v);
          light(x, y, 40 + R * 0.5, '#9ff4ff', 0.7 * (1 - seg(e, 0, 1)));
          return;
        }
        if (ty === 1 && look === 'cold') {
          // an ice shard splinters
          if (e < 0.05) K.sq(o, x, iy, 3, '#ffffff');
          K.debris(o, x, iy, e, sd, 5, 35, [EL.cold[0], EL.cold[2], EL.cold[3]]);
          light(x, y, 30, '#9ff4ff', 0.5 * (1 - e));
          return;
        }
        if (ty === 1) {
          // a rock lands: dust and chips; an ice boulder bursts into ice; a mud ball splashes
          const cols: Ramp = frosty(look) ? [EL.cold[0], EL.cold[2], EL.cold[3]] : look === 'water' ? ['#4a3c2a', '#8ad0ff', '#6a5a40'] : ['#977552', '#553e2a', '#b8946a'];
          K.scorch(g, x, y, 7 * s, 0.4 * (1 - seg(e, 0.8, 1.4)));
          if (e < 0.06) K.sq(o, x, iy, 4, '#ffffff');
          K.debris(o, x, iy, e, sd, 10, 45, cols);
          K.dust(o, x, y, e, sd, 9, 18, frosty(look) ? '#d8f4ff' : look === 'water' ? '#5a6a80' : '#8a7a68', 0.9);
          if (frosty(look)) light(x, y, 50, '#9ff4ff', 0.6 * (1 - e));
          return;
        }
        // a bolt pops
        if (e < 0.3) { X.ring(o, x, iy, 3 + e * 30, (3 + e * 30) * FY, R[1], 1 - e / 0.3); if (e < 0.06) K.sq(o, x, iy, 5, '#ffffff'); }
        light(x, y, 40, R[2], 0.8 * (1 - seg(e, 0, 0.4)));
        return;
      }
      case 'shatter': {
        // the ice that held a body explodes: a white flash, chunks thrown out, bouncing to rest
        if (e < 0.12) X.ellipse(o, x, y - 8, 8, 9, '#ffffff', 1 - e / 0.12);
        for (let k = 0; k < 16; k++) {
          const a2 = rand(sd, k, 41) * TAU, sp = 18 + rand(sd, k, 42) * 34, vz = 30 + rand(sd, k, 43) * 50;
          let z = 8 + vz * e - 110 * e * e; if (z < 0) z = 0;
          const d = sp * Math.min(e, 0.55 + e * 0.15);
          if (e > 1.2 && rand(sd, k, 44) < (e - 1.2) / 0.4) continue;
          K.sq(o, x + Math.cos(a2) * d, y + Math.sin(a2) * d * FY - z, k % 3 === 0 ? 2 : 1, [EL.cold[0], EL.cold[2], EL.cold[3], EL.cold[4]][k % 4]);
        }
        light(x, y, 50, '#9ff4ff', 0.6 * (1 - seg(e, 0, 0.6)));
        return;
      }
      case 'freeze': {
        for (let k = 0; k < 10; k++) { const a = rand(k, sd) * TAU, d = 4 + e * 24; X.px(o, x + Math.cos(a) * d, y - 6 + Math.sin(a) * d * 0.5, k % 2 ? '#ffffff' : EL.cold[1]); }
        light(x, y, 40, '#bff4ff', 0.6 * (1 - e / 0.5));
        return;
      }
      case 'surge': {
        // the current runs through the water: sparks over every wet cell nearby
        if (Math.floor(t * 20) % 3 === 2) return;
        const s = w.surf, f2 = Math.floor(t * 20);
        for (let c = 0; c < s.kind.length; c++) {
          if (s.kind[c] !== SURF.water) continue;
          const cx = -w.dims.w / 2 + ((c % w.dims.gw) + 0.5) * CELL, cy = -w.dims.h / 2 + (Math.floor(c / w.dims.gw) + 0.5) * CELL;
          if (Math.abs(cx - f.x) > 6 || Math.abs(cy - f.y) > 6 || rand(c, f2, sd) > 0.4) continue;
          X.px(o, gx(cx) + (rand(c, f2, 1) - 0.5) * 7, gy(cy) + (rand(c, f2, 2) - 0.5) * 4, rand(c, f2, 3) < 0.3 ? '#ffffff' : EL.lightning[1]);
        }
        light(x, y, 70, '#b08aff', 0.6);
        return;
      }
      case 'cancel': {
        if (!body?.on || !body.a) return;
        const ch: Pt = [body.x + body.a.charge[0], body.y + body.a.charge[1]];
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, d = 2 + e * 30; X.px(o, ch[0] + Math.cos(a) * d, ch[1] + Math.sin(a) * d * 0.7, k % 2 ? R[1] : '#8a8498'); }
        return;
      }
      case 'dry': {
        if (!body?.on) return;
        for (let k = 0; k < 4; k++) K.puff(o, body.x + (rand(k, sd) - 0.5) * 8, body.y - 18 - e * 14, 1.5 + e * 3, '#6a6478', (1 - e / 0.5) * 0.8);
        return;
      }
      case 'banner': {
        // wave moments: a big title over the arena that pops in and fades
        const q = e / f.life, txt = (f.text ?? '').toUpperCase(), k = 2, wd = txt.length * 4 * k;
        if (q > 0.75 && X.bay(Math.round(e * 30), 1) < (q - 0.75) / 0.25) return;
        const col = /CLEAR/.test(txt) ? X.LIFE[1] : /WIPE/.test(txt) ? '#ff6a6a' : '#ffd860';
        const by = Math.round(this.bannerY - easeOut(Math.min(1, e * 4)) * 6); // near the top of the view, clear of the wave strip
        X.text(o, txt, Math.round(this.bannerX - wd / 2), by, col, '#120e1a', k);
        return;
      }
      default:
    }
  }

  /** The body standing at a world point (zap ends), if any. */
  private bodyAt(bodies: BodyView[], w: World, x: number, y: number): BodyView | null {
    const b = w.bodies;
    for (let i = 0; i < bodies.length; i++) if (bodies[i].on && Math.abs(b.x[i] - x) < 0.35 && Math.abs(b.y[i] - y) < 0.35) return bodies[i];
    return null;
  }
}

/** Discharge reach beyond the base 4 units is per lightning rune; the ring shows the base. */
const SHAPES_DISCHARGE = 1;
