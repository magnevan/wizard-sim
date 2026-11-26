/**
 * The cosmetic state the bodies' poses need beyond the sim's own (view3d/bodies.ts): how far each body has walked and
 * how fast, its steps when it turns on the spot, its hit flash, each seat's last weapon blow or cast and its combo,
 * the eased Force pose, each enemy's swing count and the time from its hit, and the deaths of the warband. Read from
 * the sim each step, never written back; turned into the same RigState the pixel view builds (view.ts rigState), so
 * art/live-pose.ts picks the same pose for both renderers.
 *
 * A copy of what view.ts keeps for its bodies (its afterStep and rigState), without the pixel-only parts (the rigs'
 * rounded frame keys, walk phase, sway); view.ts's copy goes when the pixel view is deleted. No Pixi, no canvas.
 */
import {
  AI, ARCH, ARMS, CAST_ID, EL, EV, KIND, MAX_BODIES, MAX_SEATS, PHASE, TAP, TUT_TAG, YTAG, elementName, heavyCharge,
  type World,
} from '@wizard-sim/sim';
import type { RigKind, RigState } from '../art/rigs';
import { comboNext } from '../art/live-pose';
import { attackK, hitT } from '../art/enemy-attacks';
import { infusion } from '../art/infuse';
import { extrasOf } from '../art/accent';

const TAU = Math.PI * 2;
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Art px per world unit, as the pixel game counts a walked distance (art/live-pose.ts plays walk and run by it). */
const DIST_PX = 16;
/** Turn steps (view.ts turnPh): the same numbers as view.ts's. */
const TURN_MIN = 0.001, TURN_STEPS = 2, TURN_RATE = 1.8, TURN_OWE_MAX = 1.5, TURN_START = 0.2;
/** The blow moves that put the wizard's body through its weapon's blow clip, and which of them are a Heavy (view.ts). */
const HEAVY_MOVES = new Set(['tideslash', 'firewave', 'fissure', 'dash', 'chargedbolt']);
const BLOW_MOVES = new Set(['strike', 'sweep', 'arrow', 'volley', 'splinter', 'dash', 'javelin', 'lash', 'tideslash', 'firewave', 'fissure', 'bolt', 'chargedbolt']);
/** The bow is held drawn while an enemy is within this share of its arrows' range and AIM_SIDE units of the aim line. */
const AIM_REACH = 0.8, AIM_SIDE = 1.2;

/** A warband body that died this step: the knock-down plays where it fell (bodies.ts), from its last rig state. */
export interface Fallen { who: number; tick: number; x: number; y: number; face: number; s: RigState }

/** A fresh RigState (art/rigs.ts newRigState, without importing rigs.ts, which makes canvases as it loads). */
const blankRig = (): RigState => ({
  kind: 'goblin', pal: 0, variant: 0, seed: 0, face: 0, spd: 0, ph: 0, idle: 0, vx: 0, vy: 0, prep: 0, cast: 0, sq: 0, dead: 0,
  burn: 0, burnF: 0, wet: 0, wetF: 0, frozen: 0, chill: 0, shock: 0, flash: 0, punch: -1, smash: -1, draw: 0, atk: -1, hold: 0, hitT: NaN, swing: 0, faceT: 0, dist: 0, turnPh: 0, shot: 0, shotT: 0, blow: 0, charge: 0, combo: 0, aimed: 0, weapon: 0, guard: 0, infuse: 0, block: 0,
  tint: null, tintK: 0, outline: null, eyeCol: null, eyesShut: 0, fallSide: 0, flashCol: null, bare: 0, crown: 1, alpha: 1, hd: 0,
});

/** The rig a body is drawn as (view.ts rigOf). */
export function rigOf(w: World, i: number): RigKind {
  const k = w.bodies.kind[i];
  if (k === KIND.wizard || k === KIND.double) return 'wizard';
  if (k === KIND.dummy) return 'dummy';
  const a = w.bodies.arch[i];
  if (a === ARCH.bramble) return 'bramble';
  if (a === ARCH.straw && (w.tut?.tag[i] === TUT_TAG.sack || w.yard?.tag[i] === YTAG.sack)) return 'sack';
  const yt = w.yard?.tag[i];
  if (yt === YTAG.mallet || yt === YTAG.bow) return 'soldier';
  return a === ARCH.brute ? 'brute' : a === ARCH.caster ? 'archer' : 'goblin';
}

/**
 * The model a rig state is drawn with, or null for a body that has none yet (the imp, the tutorial's straw goblin,
 * dummies, brambles, sacks, the yard's soldiers and students): as art/sprites.ts slugOf, without its switches.
 */
export function modelOf(s: RigState): string | null {
  if (s.kind === 'wizard') return s.pal < 4 ? 'wizard' : null;
  if (s.kind === 'archer') return 'archer';
  if (s.kind === 'brute') return 'chieftain';
  if (s.kind !== 'goblin' || s.pal === 6) return null;
  if (s.variant === 5) return 'shieldbearer';
  if (s.variant === 4) return 'hooker';
  if (s.variant === 3) return null;
  return s.variant === 1 ? 'raider-goggles' : 'raider-hooded';
}

export class BodyTrack {
  /** Where each body was before the step being shown (interpolation runs from here to the sim's position). */
  readonly prevX = new Float64Array(MAX_BODIES);
  readonly prevY = new Float64Array(MAX_BODIES);
  private prevKind = new Uint8Array(MAX_BODIES);
  private prevFace = new Float64Array(MAX_BODIES);
  /** Art px each body has walked (DIST_PX a unit), its eased speed (1 a run), its turn steps' phase and what it still owes. */
  private dist = new Float64Array(MAX_BODIES);
  private spd = new Float64Array(MAX_BODIES);
  private turnPh = new Float64Array(MAX_BODIES);
  private turnOwe = new Float64Array(MAX_BODIES);
  private flashT = new Float64Array(MAX_BODIES).fill(-9);
  private flashSoft = new Uint8Array(MAX_BODIES);
  /** Each body's last real hit, for its recoil (bodies.ts): when, the unit direction away from who dealt it (sim x, y), how hard. */
  private recT = new Float64Array(MAX_BODIES).fill(-9);
  private recX = new Float32Array(MAX_BODIES);
  private recY = new Float32Array(MAX_BODIES);
  private recK = new Float32Array(MAX_BODIES);
  private swingN = new Uint16Array(MAX_BODIES);
  private lastHitT = new Float64Array(MAX_BODIES).fill(NaN);
  private hitAt = new Float64Array(MAX_BODIES).fill(NaN);
  private shot = new Uint8Array(MAX_SEATS);
  private shotAt = new Float64Array(MAX_SEATS);
  private blowK = new Uint8Array(MAX_SEATS);
  private combo = new Uint8Array(MAX_SEATS);
  private strikeAt = new Float64Array(MAX_SEATS).fill(-9);
  private castS = new Float64Array(MAX_SEATS);
  private holdUntil = new Float64Array(MAX_SEATS);
  private lastPhase = new Uint8Array(MAX_SEATS);
  private recFromCast = new Uint8Array(MAX_SEATS);
  private rig = blankRig();
  /** The sim time's offset after a world with a lower tick replaced the last (a new room): times only go forward. */
  private epoch = 0;
  private lastTick = 0;
  /** Whether the loop calls beforeStep/afterStep; if not, observe() notices each new tick itself. */
  private hooked = false;
  private seenTick = -1;
  private snapX = new Float64Array(MAX_BODIES);
  private snapY = new Float64Array(MAX_BODIES);
  private snapKind = new Uint8Array(MAX_BODIES);
  private snapFace = new Float64Array(MAX_BODIES);
  /** Called for each warband body that dies in a step seen here. */
  onFall: ((f: Fallen) => void) | null = null;

  /** Sim seconds at the world's tick plus alpha of the next. */
  simTime(w: World, alpha = 0): number {
    const tick = w.clock[0];
    if (tick < this.lastTick) this.epoch += this.lastTick / 60 + 60;
    this.lastTick = tick;
    return this.epoch + (tick + alpha) / 60;
  }

  beforeStep(w: World): void {
    this.hooked = true;
    this.prevX.set(w.bodies.x); this.prevY.set(w.bodies.y); this.prevKind.set(w.bodies.kind); this.prevFace.set(w.bodies.face);
  }

  /**
   * Without the loop's beforeStep/afterStep (a lab page that steps the sim itself), each draw calls this: a tick not
   * seen yet is taken as one step from the positions of the last tick seen.
   */
  observe(w: World): void {
    const tick = w.clock[0];
    if (tick === this.seenTick) return;
    if (!this.hooked) {
      if (this.seenTick >= 0) { this.prevX.set(this.snapX); this.prevY.set(this.snapY); this.prevKind.set(this.snapKind); this.prevFace.set(this.snapFace); }
      else { this.prevX.set(w.bodies.x); this.prevY.set(w.bodies.y); this.prevKind.set(w.bodies.kind); this.prevFace.set(w.bodies.face); }
      this.afterStep(w);
    }
    this.seenTick = tick;
    this.snapX.set(w.bodies.x); this.snapY.set(w.bodies.y); this.snapKind.set(w.bodies.kind); this.snapFace.set(w.bodies.face);
  }

  /**
   * Body i's recoil at sim time t: how far it leans (radians) and which way (a unit sim x, y away from the blow). Fast
   * in (0.06 s), then back with a small rebound over about 0.4 s; none for a body that's down.
   */
  recoil(w: World, i: number, t: number): { lean: number; dx: number; dy: number } | null {
    const a = t - this.recT[i];
    if (!(a >= 0 && a < 0.5) || w.bodies.downed[i] || w.bodies.down[i] > 0) return null;
    const env = a < 0.06 ? Math.sin((a / 0.06) * Math.PI / 2) : Math.exp(-(a - 0.06) * 7) * Math.cos((a - 0.06) * 9);
    return { lean: 0.2 * this.recK[i] * env, dx: this.recX[i], dy: this.recY[i] };
  }

  afterStep(w: World): void {
    const b = w.bodies, s = w.seats, t = this.simTime(w);
    this.seenTick = w.clock[0];
    for (const e of w.events) {
      if (e.kind === 'hit' && (e.amount ?? 0) > 0 && e.who >= 0) {
        // a repeat hit, or one on a burning body (burning is spent as a steady trickle of hits), only glimmers: as full
        // flashes they kept burning goblins ghost-white (the 3D fire's round 8)
        this.flashSoft[e.who] = t - this.flashT[e.who] < 0.35 || b.burn[e.who] > 0 ? 1 : 0;
        this.flashT[e.who] = t;
        // the recoil: away from who dealt it (a burn's ticks and hits from the world don't push); a repeat only nudges
        const src = e.src ?? -1;
        if (!e.dot && src >= 0 && src !== e.who && b.kind[src]) {
          const dx = b.x[e.who] - b.x[src], dy = b.y[e.who] - b.y[src], d = Math.hypot(dx, dy);
          if (d > 1e-3) { this.recX[e.who] = dx / d; this.recY[e.who] = dy / d; this.recK[e.who] = this.flashSoft[e.who] ? 0.3 : 1; this.recT[e.who] = t; }
        }
      }
      if (e.kind === 'blink' && e.who >= 0) { this.prevX[e.who] = b.x[e.who]; this.prevY[e.who] = b.y[e.who]; }
      if (e.kind === 'fizzle' && e.ev === EV.death && e.who >= 0) this.fall(w, e.who, e.tick, t);
      if (e.kind === 'move' && BLOW_MOVES.has(e.text ?? '') && e.who >= 0 && e.who < MAX_SEATS) {
        this.shot[e.who] = 1; this.shotAt[e.who] = t; this.blowK[e.who] = HEAVY_MOVES.has(e.text ?? '') ? 1 : e.text === 'sweep' ? 2 : 0;
        if (e.text === 'strike') {
          const wk = s.weapon[e.who] ? elementName(s.weapon[e.who]) : 'staff', rec = (ARMS.strikeRecovery as Record<string, number>)[wk] ?? ARMS.strikeRecovery.staff;
          this.combo[e.who] = comboNext(this.combo[e.who], t - this.strikeAt[e.who], rec); this.strikeAt[e.who] = t;
        }
      }
      if (e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS) {
        const id = s.castId[e.who];
        if (id === CAST_ID.force || id === CAST_ID.conjure) this.holdUntil[e.who] = t + 0.35;
        if (id === CAST_ID.area || id === CAST_ID.self) { this.shot[e.who] = id === CAST_ID.area ? 2 : 3; this.shotAt[e.who] = t; }
      }
    }
    for (let i = 0; i < MAX_BODIES; i++) {
      if (!b.kind[i]) continue;
      if (this.prevKind[i] !== b.kind[i]) {
        this.prevX[i] = b.x[i]; this.prevY[i] = b.y[i]; this.dist[i] = 0; this.flashT[i] = -9; this.hitAt[i] = NaN;
        this.prevFace[i] = b.face[i]; this.turnPh[i] = 0; this.turnOwe[i] = 0;
      }
      const d = Math.hypot(b.x[i] - this.prevX[i], b.y[i] - this.prevY[i]);
      this.spd[i] += ((d * 60) / 4.2 - this.spd[i]) * 0.3;
      this.dist[i] += d * DIST_PX;
      const turned = Math.abs(mod(b.face[i] - this.prevFace[i] + 0.5, 1) - 0.5);
      if (this.spd[i] >= 0.15) { this.turnPh[i] = 0; this.turnOwe[i] = 0; }
      else {
        if (turned > TURN_MIN) this.turnOwe[i] = Math.min(TURN_OWE_MAX, this.turnOwe[i] + turned * TURN_STEPS);
        else if (this.turnPh[i] === 0) this.turnOwe[i] *= 0.9;
        const ph = this.turnPh[i];
        if ((ph === 0 && this.turnOwe[i] >= TURN_START) || ph > 0) {
          const k = TURN_RATE / 60;
          if (this.turnOwe[i] <= 0 && ph + k >= 1) this.turnPh[i] = 0;
          else { this.turnPh[i] = (ph + k) % 1; this.turnOwe[i] = Math.max(0, this.turnOwe[i] - k); }
        }
      }
    }
    // the Force pose, eased in and out (view.ts castS; the rigs' raised-staff prep has no live clip)
    for (let i = 0; i < MAX_SEATS; i++) {
      const ph = s.phase[i], id = s.castId[i];
      if (ph === PHASE.recover && this.lastPhase[i] !== PHASE.recover) this.recFromCast[i] = this.lastPhase[i] === PHASE.idle ? 0 : 1;
      this.lastPhase[i] = ph;
      const fromCast = ph !== PHASE.recover || this.recFromCast[i] === 1;
      const force = fromCast && (id === CAST_ID.force || id === CAST_ID.conjure);
      const cast = ph === PHASE.channel || (force && ph === PHASE.recover) || t < this.holdUntil[i] ? 1 : 0;
      this.castS[i] += (cast - this.castS[i]) * 0.35;
    }
  }

  /** A warband body died: its last rig state goes to onFall (a wizard's Double ends with its own effect, not a fall). */
  private fall(w: World, i: number, tick: number, t: number): void {
    if (!this.onFall) return;
    const s = this.rigState(w, i, t, performance.now() / 1000);
    if (s.kind === 'wizard') return;
    this.onFall({ who: i, tick, x: w.bodies.x[i], y: w.bodies.y[i], face: s.faceT, s: { ...s } });
  }

  private ownerOf(w: World, i: number): number {
    for (let k = 0; k < MAX_SEATS; k++) if (w.seats.double[k] === i) return k;
    return 0;
  }

  /** 1 when seat i's aim is on an enemy within its arrows' range (view.ts aimedAt). */
  private aimedAt(w: World, i: number): number {
    const b = w.bodies, a = b.face[i] * TAU, dx = Math.cos(a), dy = Math.sin(a), range = ARMS.arrowSpeed * ARMS.arrowLife * AIM_REACH;
    for (let j = 0; j < MAX_BODIES; j++) {
      if (!b.kind[j] || j === i || b.team[j] === b.team[i] || b.downed[j] || b.kind[j] === KIND.wizard) continue;
      const rx = b.x[j] - b.x[i], ry = b.y[j] - b.y[i], along = rx * dx + ry * dy;
      if (along > 0 && along < range && Math.abs(-rx * dy + ry * dx) < AIM_SIDE + b.r[j]) return 1;
    }
    return 0;
  }

  /**
   * Body i's rig state at sim time t and real time ct (s), as view.ts rigState fills it for a live model: the one
   * RigState is reused, so copy it to keep it.
   */
  rigState(w: World, i: number, t: number, ct: number): RigState {
    const b = w.bodies, s = this.rig, kind = rigOf(w, i), arch = b.arch[i], seat = i < MAX_SEATS;
    s.kind = kind; s.seed = i & 1; s.variant = 0; s.pal = 0;
    s.hold = 0; s.hitT = NaN; s.swing = 0; s.shot = 0; s.shotT = 0; s.cast = 0; s.blow = 0; s.combo = 0;
    const owner = b.kind[i] === KIND.double ? this.ownerOf(w, i) : i;
    s.bare = kind === 'wizard' && seat && (w.seats.weapon[i] || w.seats.wand[i]) ? 1 : 0;
    s.weapon = kind === 'wizard' && seat ? w.seats.weapon[i] : 0;
    s.infuse = s.weapon ? infusion(s.weapon, extrasOf(w.seats.weaponEls, i, s.weapon)).mat : 0;
    s.guard = kind === 'wizard' && seat ? w.seats.guard[i] : 0;
    s.block = kind === 'wizard' && seat && w.seats.guard[i] ? w.seats.guardT[i] : 0;
    if (kind === 'wizard') s.pal = owner % 4;
    else if (b.kind[i] === KIND.enemy || b.kind[i] === KIND.none) {
      if (arch === ARCH.shieldbearer) { s.pal = 5; s.variant = 5; }
      else if (arch === ARCH.grabber) { s.pal = 4; s.variant = 4; }
      else if (arch === ARCH.imp) { s.pal = 3; s.variant = 3; }
      else if (arch === ARCH.straw || w.yard?.tag[i] === YTAG.goblin) { s.pal = 6; s.variant = 0; }
      else { s.pal = i % 3; s.variant = kind === 'goblin' ? i % 3 : 0; }
    }
    const sp = this.spd[i];
    s.spd = sp < 0.15 ? 0 : sp < 0.6 ? 0.5 : 1;
    s.face = kind === 'dummy' || kind === 'bramble' || kind === 'sack' ? Math.PI / 2 : b.face[i] * TAU;
    s.faceT = b.face[i] * TAU; s.dist = this.dist[i]; s.turnPh = s.spd ? 0 : this.turnPh[i];
    if (owner < MAX_SEATS) { s.cast = Math.round(this.castS[owner] * 2) / 2; s.shot = this.shot[owner]; s.shotT = t - this.shotAt[owner]; s.blow = this.blowK[owner]; s.combo = this.combo[owner]; }
    s.charge = kind === 'wizard' && seat && w.seats.handT[i] > TAP ? Math.max(0.01, heavyCharge(w.seats.handT[i])) : 0;
    s.aimed = kind === 'wizard' && seat && w.seats.weapon[i] === EL.ice ? this.aimedAt(w, i) : 0;
    const fa = t - this.flashT[i];
    s.flash = fa < 0 ? 0 : this.flashSoft[i] ? (fa < 0.08 ? 4 : 0) : fa < 0.05 ? 16 : fa < 0.1 ? 9 : fa < 0.18 ? 4 : 0;
    s.dead = b.downed[i] ? 1 : b.down[i] > 0 ? 0.7 : 0;
    s.burn = b.burn[i] > 0 ? (b.burnPool[i] < 10 ? 0.5 : 1) : 0;
    s.burnF = s.burn ? Math.floor(ct * 16) % 4 : 0;
    s.wet = b.wet[i] > 0 ? 1 : 0;
    s.frozen = b.frozen[i] > 0 ? 1 : 0;
    s.chill = Math.round(b.chill[i] * 4) / 4;
    s.shock = b.stun[i] > 0 ? Math.floor(ct * 26) % 2 : 0;
    if (b.kind[i] === KIND.enemy) {
      s.atk = attackK(w, i);
      const h = hitT(w, i), was = this.lastHitT[i];
      if (h === h && !(was === was && h >= was - 0.3)) this.swingN[i] = (this.swingN[i] + 1) & 0xffff;
      this.lastHitT[i] = h; s.swing = this.swingN[i];
      if (h === h) { s.hitT = h; this.hitAt[i] = h >= 0 ? ct - h : NaN; }
      else s.hitT = ct - this.hitAt[i] < 3 ? ct - this.hitAt[i] : NaN;
      if (arch === ARCH.grabber) {
        if (b.ai[i] === AI.dash) s.spd = 1;
        if (b.ai[i] === AI.grab && b.holding[i] >= 0) s.hold = Math.floor(ct * 6) % 2 ? 2 : 1;
      }
    }
    return s;
  }
}
