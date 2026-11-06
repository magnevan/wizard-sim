/**
 * Procedural character rigs, ported from tools/art-pixel-hd/actors.js (with the Spell VFX
 * gallery's changes: the Force cast holds the staff out level along the aim, and chill
 * tints the body icy with rime on its top edges). No sprite sheets: each character is a
 * handful of parts in its own local frame (f = forward, r = right, u = up), turned by its
 * facing and projected with the camera's foreshortening, so every direction, walk cycle,
 * sway and status is a function of the actor's state.
 *
 * paint() draws one actor into a scratch canvas and composes it (outline, colour, emissive,
 * status on the body) into a destination cell. art/actors.ts caches the results, so a rig
 * is painted once per distinct quantized state, not per frame.
 */
import { CU, FY, clamp, lerp, rand, smooth } from './util';
import * as X from './px';
import type { Ctx } from './px';

export type RigKind = 'wizard' | 'goblin' | 'archer' | 'brute' | 'dummy' | 'bramble' | 'sack';

/** Everything a rig needs to draw one frame. art/actors.ts fills it with quantized values. */
export interface RigState {
  kind: RigKind;
  /** Wizard: seat (robe). Goblin: palette 0..2. */
  pal: number;
  variant: number;
  seed: number;
  /** Facing in radians on the un-squashed ground: 0 = east, PI/2 = toward the camera. */
  face: number;
  /** Walk amount 0..1.2 and phase (radians, one stride per PI). */
  spd: number; ph: number;
  /** Idle breathing phase, radians. */
  idle: number;
  /** Screen velocity (art px/s): robe sway and hat lag. */
  vx: number; vy: number;
  /** Poses 0..1: prep = staff raised (gathering, Area, Place); cast = staff held out level (Force). */
  prep: number; cast: number;
  sq: number;
  /** Knocked down: 0 standing .. 1 lying. */
  dead: number;
  // statuses, 0..1, and the animation frame of the ones that flicker
  burn: number; burnF: number;
  wet: number; wetF: number;
  frozen: number;
  chill: number;
  shock: number;
  /** Hit flash level 0..16 (dithered white silhouette). */
  flash: number;
  /** Brute arm poses (-1 = none) and the archer's draw. */
  punch: number; smash: number; draw: number;
  /**
   * An enemy's attack (art/enemy-attacks.ts): -1 none; 0..0.5 the wind-up (the telegraph pose builds
   * to 0.5), 0.5..0.6 the blow landing, 0.6 the strike held, 0.6..1 the recovery back to rest.
   * The grabber's dash is 0.6. hold: the grabber has a wizard in its claws (1 / 2: the squeeze frames).
   */
  atk: number; hold: number;
  // Deaths only (art/deaths.ts paints these states uncached each frame; the view's cached states
  // never set them, so the frame cache key leaves them out):
  /** Tint every colour toward `tint` by tintK (a char, a scald flush). */
  tint: string | null; tintK: number;
  /** Outline colour (embers round a charred body); null = the usual dark outline. */
  outline: string | null;
  /** Eye colour (null = the usual), or eyes shut (a blink). */
  eyeCol: string | null; eyesShut: number;
  /** Which way a fall topples on screen: -1 / 1, or 0 to go by the seed. */
  fallSide: number;
  /** Hit flash colour (null = white). */
  flashCol: string | null;
  /** The weapon has left its hands (a dropped bow or shield), so it isn't drawn. */
  bare: number;
  /** The imp's crown flame, 1 = burning, 0 = out. */
  crown: number;
  /** Opacity, ordered-dithered (1 = solid). */
  alpha: number;
}

export const newRigState = (): RigState => ({
  kind: 'goblin', pal: 0, variant: 0, seed: 0, face: 0, spd: 0, ph: 0, idle: 0, vx: 0, vy: 0, prep: 0, cast: 0, sq: 0, dead: 0,
  burn: 0, burnF: 0, wet: 0, wetF: 0, frozen: 0, chill: 0, shock: 0, flash: 0, punch: -1, smash: -1, draw: 0, atk: -1, hold: 0,
  tint: null, tintK: 0, outline: null, eyeCol: null, eyesShut: 0, fallSide: 0, flashCol: null, bare: 0, crown: 1, alpha: 1,
});

/** Anchor points relative to the feet, in art px: where effects attach. */
export interface Anchors { tip: [number, number]; chest: [number, number]; head: [number, number]; hands: [number, number][]; charge: [number, number] }

export const HEIGHT: Record<RigKind, number> = { wizard: 23, goblin: 12, archer: 12, brute: 23, dummy: 18, bramble: 11, sack: 12 };
export const WIDTH: Record<RigKind, number> = { wizard: 6, goblin: 5, archer: 5, brute: 9, dummy: 6, bramble: 8, sack: 5 };

const SW = 88, SH = 88, AX = 44, AY = 70;
/** Only this box of the scratch canvases is ever cleared or copied. */
const BX = AX - 23, BY = AY - 46, BW = 46, BH = 54;
/** A composed frame: the box plus a 1 px outline all round; the feet sit at (FX, FY0). */
export const CELL_W = BW + 2, CELL_H = BH + 2, FEET_X = AX - BX + 1, FEET_Y = AY - BY + 1;

const SC = X.canvas(SW, SH), SE = X.canvas(SW, SH), SIL = X.canvas(SW, SH);
const sc = SC.x, se = SE.x, sil = SIL.x;
const OUTLINE = '#120e1a';
const SKIN = { main: '#e8b796', dark: '#b8806a' };
const GOB = [
  { main: '#7aa83a', light: '#a4cc5a', dark: '#4e7228', deep: '#2e4a1c' },
  { main: '#86a034', light: '#b0c452', dark: '#566a22', deep: '#34421a' },
  { main: '#6a9e48', light: '#94c266', dark: '#466a30', deep: '#28421e' },
  // 3: the fire imp (red skin, hot), 4: the grabber (grey-green, long arms), 5: the shieldbearer (dark, armoured)
  { main: '#c8442a', light: '#f07a3a', dark: '#7e2218', deep: '#4a1210' },
  { main: '#6a8a6e', light: '#94b498', dark: '#425a46', deep: '#263a2a' },
  { main: '#5a7a3a', light: '#80a058', dark: '#3a5226', deep: '#22341a' },
  // 6: the tutorial's straw goblin (a goblin-shaped target stuffed with straw)
  { main: '#c9a45a', light: '#e2c47a', dark: '#94733a', deep: '#5a4426' },
];
const BRUTE = { main: '#8a7aa6', light: '#b2a4cc', dark: '#584a74', deep: '#342a4a', belly: '#c4b4d0' };
const STRAW = { main: '#c9a45a', light: '#e2c47a', dark: '#94733a', deep: '#5a4426' };

type V3 = [number, number, number];
type Proj = (f: number, r: number, u: number) => V3;

/** Tint every colour of a status-affected actor. */
function tinter(s: RigState): (col: string) => string {
  return (col) => {
    if (s.burn > 0) col = X.mix(col, '#3a1410', 0.4 * s.burn);
    if (s.wet > 0) col = X.mix(col, '#14284e', 0.42 * s.wet); // wet: darker and bluer
    if (s.chill > 0) col = X.mix(col, '#9cdcff', 0.42 * s.chill);
    if (s.tint) col = X.mix(col, s.tint, s.tintK);
    return col;
  };
}
function frame(s: RigState): { cs: number; sn: number; kx: number; ku: number; P: Proj } {
  const cs = Math.cos(s.face), sn = Math.sin(s.face), fall = s.dead;
  const kx = (1 + 0.24 * s.sq) * (1 + 0.35 * fall), ku = (1 - 0.24 * s.sq) * (1 - 0.6 * fall);
  // falling over topples the body sideways on screen (top rows shift most)
  const side = s.fallSide || (s.seed & 1 ? 1 : -1), tip = fall * fall * 0.85 * side;
  const P: Proj = (f, r, u) => {
    const fx = f * cs - r * sn, fy = f * sn + r * cs, uu = u * CU;
    return [AX + fx * kx + uu * tip, AY + fy * FY - uu * ku, fy];
  };
  return { cs, sn, kx, ku, P };
}
const visible = (sn: number, cs: number, f: number, r: number) => f * sn + r * cs > -0.25;

interface Cols { light: string; main: string; dark: string }
/** A filled body built from rows: prof(u) -> half width; shaded light / main / dark across. */
function bodyRows(c: Ctx, P: (f: number, r: number, u: number) => readonly number[], u0: number, u1: number, prof: (u: number) => number,
  off: ((u: number) => number) | null, cols: Cols, T: (c: string) => string, extra?: (u: number, x: number, k: number, col: string) => string | null): void {
  for (let u = u0; u <= u1; u++) {
    const p = P(off ? off(u) : 0, 0, u), cx = p[0], cy = p[1], hw = prof(u);
    if (hw <= 0) continue;
    const xa = Math.round(cx - hw), xb = Math.round(cx + hw), yy = Math.round(cy);
    let run = xa, runCol: string | null = null;
    for (let x = xa; x <= xb + 1; x++) {
      let col: string | null = null;
      if (x <= xb) {
        const k = (x - xa) / Math.max(1, xb - xa);
        col = k < 0.26 ? cols.light : k > 0.74 ? cols.dark : cols.main;
        if (extra) col = extra(u, x, k, col) ?? col;
        col = T(col);
      }
      if (col !== runCol) { if (runCol) X.rect(c, run, yy, x - run, 1, runCol); run = x; runCol = col; }
    }
  }
}

const out: Partial<Anchors> = {};

// ======================================================================
// Wizard
// ======================================================================
function drawWizard(s: RigState): void {
  const pal = X.TEAMS[s.pal % 4], T = tinter(s), { cs, sn, kx, P } = frame(s);
  const walk = Math.min(1, s.spd), cast = s.cast, prep = s.prep;
  const bob = Math.abs(Math.sin(s.ph)) * 1.3 * walk + Math.sin(s.idle) * 0.35 * (1 - walk);
  const st = Math.sin(s.ph) * 3.4 * walk;
  const lift = (k: number) => Math.max(0, Math.cos(s.ph + k)) * 1.8 * walk;
  // feet
  const fl = P(st, -2, lift(0)), fr = P(-st, 2, lift(Math.PI));
  for (const f of fl[2] < fr[2] ? [fl, fr] : [fr, fl]) { X.rect(sc, f[0] - 1, f[1] - 1, 3, 2, '#2a2030'); X.px(sc, f[0] - 1, f[1] - 1, '#4a3a4a'); }
  // arms: shoulder -> hand. Poses: idle, prep (gathering: staff held up in front, the off hand
  // cupped under the orb), cast (the staff held out in front along the aim, nearly level).
  const idleL: V3 = [0.8 - st * 0.5, -4.3, 6.6 + bob], idleR: V3 = [0.8 + st * 0.5, 4.3, 6.6 + bob];
  const prepL: V3 = [3.6, -2.6, 9.6 + bob], prepR: V3 = [2.8, 3.4, 15.6 + bob];
  const castL: V3 = [5.2, -1.6, 9.6 + bob], castR: V3 = [7.4, 1.7, 9.8 + bob];
  const pose = (a: V3, b: V3, c: V3): V3 => a.map((v, i) => lerp(lerp(v, b[i], prep * (1 - cast)), c[i], cast)) as V3;
  const hL = pose(idleL, prepL, castL), hR = pose(idleR, prepR, castR);
  const arm = (side: number, h: V3) => {
    const sh = P(0, side * 3.4, 11.4 + bob), hp = P(...h);
    X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark), 2);
    X.px(sc, hp[0], hp[1] - 1, T(pal.trim));
    X.rect(sc, hp[0] - 0.5, hp[1] - 0.5, 2, 2, T(SKIN.main));
  };
  const armDepth = (h: V3) => P(...h)[2];
  const g = prep * (1 - cast);
  // in prep the staff is raised high so the gathering charge sits above the hat
  const staffBot: V3 = [lerp(lerp(hR[0], 2.6, g), 1.0, cast), lerp(4.6, 3.0, g) - 0.8 * cast, lerp(lerp(-0.5, 7, g), 7, cast)];
  const staffTop: V3 = [lerp(lerp(hR[0] + 0.2, 3.4, g), 12.5, cast), lerp(lerp(4.7, 3.4, g), 1.8, cast), lerp(lerp(21.5 + bob * 0.6, 30 + bob, g), 12.5 + bob, cast)];
  const drawStaff = () => {
    const b = P(...staffBot), a = P(...staffTop);
    X.line(sc, b[0], b[1], a[0], a[1], '#7a5034'); X.px(sc, a[0], a[1] + 1, '#a8784a');
    // the orb's socket; the orb itself glows in the overlay, in the colour of what is being cast
    X.rect(se, a[0] - 1, a[1] - 2, 3, 3, '#3a3048');
    out.tip = [a[0], a[1] - 1];
  };
  const back: (() => void)[] = [], front: (() => void)[] = [];
  (armDepth(hL) < -0.2 ? back : front).push(() => arm(-1, hL));
  (armDepth(hR) < -0.2 ? back : front).push(() => { arm(1, hR); drawStaff(); });
  back.forEach((f) => f());
  // robe: a bell, with a cape panel down the back and a trim seam down the front
  const sway = (u: number) => (-s.vx * 0.03 + Math.sin(s.ph) * 0.8 * walk) * Math.pow(clamp((12 - u) / 11, 0, 1), 1.5);
  const prof = (u: number) => (u > 10 ? 3.1 - (u - 10) * 0.45 : 3.3 + (10 - u) * 0.3) * kx;
  const frontVis = sn > -0.3, seamX = cs;
  bodyRows(sc, (f, r, u) => { const p = P(f, r, u + bob); return [p[0] + sway(u), p[1]]; }, 1, 12, prof, null,
    { light: pal.light, main: pal.main, dark: pal.dark }, T,
    (u, _x, k) => {
      if (u <= 1) return pal.deep;
      if (u <= 2.5) return k < 0.3 ? pal.trim : X.mix(pal.trim, pal.dark, 0.35);
      if (u === 7) return k > 0.42 && k < 0.6 && frontVis ? pal.trim : pal.deep; // belt
      if (frontVis && u > 2 && u < 12 && Math.abs(k - (0.5 + seamX * 0.36)) < 0.08) return pal.trim;
      // the cape covers the back: from behind it is a deep panel with a lit edge
      const backK = 0.5 - seamX * 0.42;
      if (sn < 0.35 && u >= 3 && Math.abs(k - backK) < 0.26 * clamp(0.35 - sn, 0, 1) * 2.2) return Math.abs(k - backK) > 0.2 ? pal.dark : pal.deep;
      return null;
    });
  // shoulders seen from above: a mantle in trim colour
  const sh = P(0.3, 0, 11.4 + bob);
  X.ellipse(sc, sh[0], sh[1], 3.6 * kx, 2.2, T(pal.dark));
  X.ellipse(sc, sh[0] - 0.5, sh[1] - 0.5, 2.6 * kx, 1.4, T(X.mix(pal.trim, pal.main, 0.4)));
  // head: hood from behind; face and beard from the front and side
  const hc = P(0.2, 0, 14.4 + bob);
  X.ellipse(sc, hc[0], hc[1], 3 * kx, 2.6, T(pal.dark));
  if (sn > -0.5) {
    const fc = P(2.3, 0, 13.6 + bob);
    X.ellipse(sc, fc[0], fc[1], 2.5 * kx, 2.0, T(SKIN.main));
    X.px(sc, fc[0] + 1, fc[1] + 1, T(SKIN.dark));
    for (const r of [-1.2, 1.2]) if (visible(sn, cs, 2.7, r)) { const e = P(3.2, r, 14.2 + bob); X.px(sc, e[0], e[1], '#1a1420'); }
    const nose = P(4.0, 0, 13.6 + bob); if (Math.abs(cs) > 0.5) X.px(sc, nose[0], nose[1], T(SKIN.dark));
  }
  if (sn > -0.55) {
    // beard: a white wedge on the chest from the front; from the side it juts forward
    const sway2 = Math.sin(s.idle * 1.15) * 0.4 + sway(6) * 0.6;
    const a = P(2.8, -2.4, 12.6 + bob), b = P(2.8, 2.4, 12.6 + bob), tip = P(4.4, 0, 6.6 + bob);
    X.poly(sc, [[a[0], a[1]], [b[0], b[1]], [tip[0] + sway2, tip[1]]], T('#f2f0f6'));
    X.line(sc, (a[0] + b[0]) / 2 + 1, a[1] + 1, tip[0] + sway2 + 0.5, tip[1] - 1, T('#b8b4c8'));
  }
  front.forEach((f) => f());
  // hat, one value darker than the robe. The brim is a disc (steep camera) with a light band;
  // the cone stands up and its floppy tip falls back, away from the facing, lagging motion.
  const brim = P(0.2, 0, 19.2 + bob), bry = 3.7;
  X.ellipse(sc, brim[0], brim[1] + 1, 6.8 * kx, bry, T(pal.deep));
  X.ellipse(sc, brim[0], brim[1], 6.5 * kx, bry - 0.5, T(pal.dark));
  X.ellipse(sc, brim[0] - 1.2, brim[1] - 0.7, 4.4 * kx, bry - 1.8, T(pal.main));
  const lagX = -s.vx * 0.04 + Math.sin(s.idle * 0.85) * 0.35, lagY = -s.vy * 0.02;
  // Seen from behind a tip falling "back" would fold over the cone: there it stands taller and flops sideways.
  const backV = clamp(-sn * 1.6, 0, 1), side = s.seed & 1 ? 1 : -1;
  const u0 = 19.6, tipU = 31 + backV * 2 - Math.min(2, Math.abs(s.vx) * 0.02) - Math.max(0, s.sq) * 2;
  for (let u = u0; u <= tipU; u += 0.6) {
    const k = (u - u0) / (tipU - u0), e = Math.pow(k, 1.6), fall = k > 0.62 ? (k - 0.62) / 0.38 : 0;
    const c = P((-0.3 - e * 1.6 - fall * fall * 5.5) * (1 - 0.8 * backV), side * fall * fall * 4.5 * backV, u + bob - fall * fall * 3 * (1 - 0.5 * backV));
    const cx = c[0] + lagX * e, cy = c[1] + lagY * e;
    const hw = 3.7 * (1 - k) * kx + 0.45;
    const xa = Math.round(cx - hw), xb = Math.round(cx + hw);
    for (let x = xa; x <= xb; x++) {
      const q = (x - xa) / Math.max(1, xb - xa);
      let col = q < 0.3 ? pal.main : q > 0.72 ? pal.deep : pal.dark;
      if (u < u0 + 1.3) col = q < 0.3 ? pal.trim : X.mix(pal.trim, pal.dark, 0.45); // hat band
      X.px(sc, x, cy, T(col));
    }
    if (u + 0.6 > tipU) X.px(sc, Math.round(cx), Math.round(cy), T(pal.light));
  }
  // a star on the hat band, on the side that faces the camera
  if (sn > 0.1) { const em = P(3.0, 0, 20.2 + bob); X.px(se, em[0], em[1], pal.trim); }
  const c2 = P(2, 0, 11 + bob), h2 = P(0, 0, 16 + bob);
  out.chest = [c2[0], c2[1]]; out.head = [h2[0], h2[1]];
  const a = P(...hL), b = P(...hR);
  out.hands = [[a[0], a[1]], [b[0], b[1]]];
  out.charge = out.tip ? [out.tip[0], out.tip[1]] : [h2[0], h2[1] - 10];
}

// ======================================================================
// Goblin (and archer)
// ======================================================================
/**
 * An attack's blend weights from s.atk (see RigState): wW the wind-up pose, wS the strike pose.
 * The wind-up builds over the whole telegraph, the blow lands in one step, the recovery eases out.
 */
export function atkWeights(k: number): [number, number] {
  if (k < 0) return [0, 0];
  if (k < 0.5) return [smooth(k / 0.5), 0];
  if (k < 0.6) { const q = (k - 0.5) / 0.1; return [1 - q, q]; }
  return [0, 1 - smooth(clamp((k - 0.6) / 0.4, 0, 1))];
}
const blend = (a: V3, w: V3, sk: V3, wW: number, wS: number): V3 => [0, 1, 2].map((i) => a[i] + (w[i] - a[i]) * wW + (sk[i] - a[i]) * wS) as V3;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function drawGoblin(s: RigState, archer: boolean): void {
  const pal = GOB[s.pal % GOB.length], T = tinter(s), { cs, sn, kx, P: P0 } = frame(s);
  const walk = Math.min(1.2, s.spd), dead = s.dead, v = s.variant;
  const [wW, wS] = archer ? [0, 0] : atkWeights(s.atk);
  // the attack leans the body: back while it winds up (the coil), forward into the blow
  const imp = v === 3, grabber = v === 4, guardV = v === 5;
  const leanW = grabber ? -0.16 : imp ? -0.16 : guardV ? -0.12 : -0.1, leanS = grabber ? (s.hold ? 0.08 : 0.3) : 0.2;
  const lean = leanW * wW + leanS * wS, lunge = (grabber ? 2.5 : guardV ? 1.5 : 1) * wS;
  const P: Proj = (f, r, u) => P0(f + lunge + lean * Math.max(0, u - 2), r, u);
  const bob = Math.abs(Math.sin(s.ph)) * 1.4 * walk + Math.sin(s.idle * 1.3) * 0.3 * (1 - walk) - (grabber ? wW * 1.2 : 0);
  const st = Math.sin(s.ph) * 2.6 * walk, lift = (k: number) => Math.max(0, Math.cos(s.ph + k)) * 1.8 * walk;
  for (const side of [-1, 1]) {
    // feet: a wide stance in the wind-up, the front foot stepping into the blow
    const spread = 1.7 + (wW + wS) * 0.6, stepF = side < 0 ? wS * 1.5 - wW * 0.6 : -wS * 0.8 + wW * 0.4;
    const k = side < 0 ? 0 : Math.PI, f = P0(side * st * -1 + stepF + lunge * 0.5, side * spread, lift(k)), hip = P(0, side * 1.6, 4 + bob);
    X.line(sc, hip[0], hip[1], f[0], f[1], T(pal.deep));
    X.rect(sc, f[0] - 1, f[1], 2, 1, '#2a2018');
  }
  // the archer's draw, and after the release its string snapping (atk 0.6..1: it shudders and settles)
  const draw = s.draw;
  const snap = archer && s.atk >= 0.6 ? [1.4, -0.8, 0.5, 0][Math.min(3, Math.floor((s.atk - 0.6) / 0.1))] : 0;
  const recoil = archer && s.atk >= 0.6 && s.atk < 0.75 ? -0.8 : 0;
  const arm = (side: number, h: V3) => { const sh = P(0, side * 3.1, 8.4 + bob), hp = P(...h); X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark)); X.px(sc, hp[0], hp[1], T(pal.main)); };
  // the grabber reaches forward with both long arms; the shieldbearer holds its shield out front
  const reach = grabber ? 1 : 0, guard = guardV ? 1 : 0;
  let hL: V3, hR: V3;
  if (archer) { hL = [4.6 + recoil, -0.8, 9 + bob]; hR = [4.2 - draw * 3.6, 0.6, 9.4 + bob]; }
  else if (reach) {
    // coil: arms flung back and wide, claws up; dash: both arms thrown forward; hold: clamped shut
    const sq = s.hold === 2 ? 0.5 : 0;
    const idle = (side: number): V3 => [6.5 + draw * 2, side * 3, 6 + bob];
    const W = (side: number): V3 => [1.2, side * 5.6, 10 + bob];
    const S = (side: number): V3 => s.hold ? [7.2, side * (1.5 - sq), 6.5 + bob] : [9.5, side * 2.6, 7 + bob];
    hL = blend(idle(-1), W(-1), S(-1), wW, s.hold ? 1 : wS); hR = blend(idle(1), W(1), S(1), wW, s.hold ? 1 : wS);
  } else if (guard) {
    hL = blend([4.2, -2.2, 6 + bob], [2.6, -2.2, 6 + bob], [5.6, -2.2, 7 + bob], wW, wS);
    hR = blend([1 - st * 0.5, 4.2, 5 + bob], [-0.5, 4.2, 6 + bob], [1.5, 3.6, 6 + bob], wW, wS);
  } else if (imp) {
    // fire-spit: claws cupped at the glowing mouth, then flung forward as it spits
    hL = blend([1 + st * 0.5, -4.2, 5 + bob], [3.2, -1.9, 10 + bob], [6, -2.6, 8 + bob], wW, wS);
    hR = blend([1 - st * 0.5, 4.2, 5 + bob], [3.2, 1.9, 10 + bob], [6, 2.6, 8 + bob], wW, wS);
  } else {
    // goblins: the weapon hand draws back for the whole wind-up, then the blow lands; the off hand counters
    const W: V3 = v === 0 ? [-1.6, 3.4, 11 + bob] : v === 1 ? [-1.8, 3.8, 7 + bob] : [-1.2, 3, 7 + bob];
    const S: V3 = v === 0 ? [5.2, 1.6, 4.5 + bob] : v === 1 ? [6.4, 1.2, 6.5 + bob] : [5, 1.6, 7 + bob];
    hR = blend([1 - st * 0.5, 4.2, 5 + bob], W, S, wW, wS);
    hL = blend([1 + st * 0.5, -4.2, 5 + bob], [3, -3.6, 7 + bob], [-1.2, -4.2, 6 + bob], wW, wS);
  }
  const weapon = () => {
    const hp = P(...hR);
    if (s.bare) return;
    if (archer) {
      const top = P(4.4 + recoil, -0.8, 14.2 + bob), mid = P(6.0 + recoil, -0.8, 9 + bob), bot = P(4.4 + recoil, -0.8, 3.8 + bob), pull = P(4.4 + recoil - draw * 3.4 + snap, -0.8, 9 + bob);
      X.lines(sc, [[top[0], top[1]], [mid[0], mid[1]], [bot[0], bot[1]]], '#b8844a');
      X.px(sc, top[0], top[1], '#d8a868'); X.px(sc, bot[0], bot[1], '#d8a868');
      const strCol = snap ? '#ffffff' : '#d0d0dc';
      X.line(sc, top[0], top[1], pull[0], pull[1], strCol); X.line(sc, pull[0], pull[1], bot[0], bot[1], strCol);
      if (draw > 0.05) {
        // the arrow nocked; once the aim locks (the dodge window) its head glows in the bolt's colour
        const tipA = P(8.6 - draw * 1.2, -0.8, 9 + bob); X.line(sc, pull[0], pull[1], tipA[0], tipA[1], '#e8d8b0');
        const locked = s.atk >= 0.275;
        X.px(locked ? se : sc, tipA[0], tipA[1], locked ? '#ff6ab0' : '#c0cbdc');
        if (locked) { X.px(se, tipA[0] + 1, tipA[1], '#ffc0e0'); X.px(sc, pull[0], pull[1], '#e8d8b0'); }
      }
      return;
    }
    if (reach) {
      // claws: splayed while it coils and dashes, closed on a held wizard
      for (const h of [hL, hR]) {
        const p = P(...h);
        if (s.hold) { X.px(sc, p[0] + 1, p[1], '#e8e0c8'); X.px(sc, p[0], p[1] + 1, '#e8e0c8'); continue; }
        X.px(sc, p[0] + 1, p[1], '#e8e0c8'); X.px(sc, p[0] + 1, p[1] + 1, '#e8e0c8');
        if (wW > 0.3 || wS > 0.3) { X.px(sc, p[0], p[1] - 1, '#e8e0c8'); X.px(sc, p[0] + 2, p[1] - 1, '#fffaf0'); }
      }
      return;
    }
    if (imp) {
      // claws glowing with the fire it is about to spit
      if (wW > 0.2 || wS > 0.2) for (const h of [hL, hR]) { const p = P(...h); X.px(se, p[0], p[1] - 1, wW > 0.7 || wS > 0.5 ? '#ffd860' : '#ff9a30'); }
      return;
    }
    if (guard) {
      // a tall wooden shield with an iron rim and boss, held out in front (pulled in to wind up, shoved out to bash)
      const sf = hL[0] + 0.4, su = hL[2] - 6 - bob;
      const c0 = P(sf, -3.6, 1.5 + su + bob), c1 = P(sf, 3.6, 1.5 + su + bob), c2 = P(sf, 3.6, 12 + su + bob), c3 = P(sf, -3.6, 12 + su + bob);
      if (P0(5, 0, 6)[2] > -0.5) {
        X.poly(sc, [[c0[0], c0[1]], [c1[0], c1[1]], [c2[0], c2[1]], [c3[0], c3[1]]], T('#6a4a2c'));
        X.lines(sc, [[c0[0], c0[1]], [c1[0], c1[1]], [c2[0], c2[1]], [c3[0], c3[1]], [c0[0], c0[1]]], T(wS > 0.5 ? '#c8ccd8' : '#8a8e98'));
        const m = P(sf + 0.2, 0, 6.5 + su + bob); X.rect(sc, m[0] - 1, m[1] - 1, 2, 2, '#c8ccd8'); X.px(wS > 0.5 ? se : sc, m[0] - 1, m[1] - 1, '#ffffff');
      }
      return;
    }
    if (v === 1) {
      // a dagger: always pointing at the target, drawn back and stabbed out
      const tp = add(hR, [3.5, 0, 1.5 * (1 - wS) + 0.3 * wS]), t2 = P(...tp);
      X.line(sc, hp[0], hp[1], t2[0], t2[1], '#c8ccd8'); X.px(wS > 0.5 ? se : sc, t2[0], t2[1], '#ffffff');
      return;
    }
    if (v === 2) {
      // a spear: upright at rest, levelled at the target for the thrust
      const lv = Math.max(wW, wS), dir: V3 = [1, -0.12, 0.04];
      const a = blend(add(hR, [-3, 0.5, -4]), add(hR, dir, -5), add(hR, dir, -5), lv, 0), b = blend(add(hR, [2, 0.5, 12]), add(hR, dir, 11), add(hR, dir, 11), lv, 0);
      const pa = P(...a), pb = P(...b);
      X.line(sc, pa[0], pa[1], pb[0], pb[1], '#8a6a48'); X.rect(sc, pb[0] - 0.5, pb[1] - (lv > 0.5 ? 1 : 2), 2, lv > 0.5 ? 2 : 3, '#c8ccd8');
      if (wS > 0.5) X.px(se, pb[0] + (cs > 0 ? 1 : -1), pb[1], '#ffffff');
      return;
    }
    // a club: raised over the shoulder for the wind-up, brought down in front for the blow
    const dir = blend([0.17, 0.11, 1], [-0.55, 0.1, 0.83], [0.95, -0.15, -0.25], wW, wS), dl = Math.hypot(...dir) || 1;
    const top = P(...add(hR, dir, 7 / dl));
    X.line(sc, hp[0], hp[1], top[0], top[1], '#7a5234', 2); X.rect(sc, top[0] - 1, top[1] - 1, 3, 3, '#5a3a24'); X.px(sc, top[0] - 1, top[1] - 1, '#9a6a44');
  };
  const dL = P(...hL)[2], dR = P(...hR)[2];
  if (dL < -0.3) arm(-1, hL);
  if (dR < -0.3) { arm(1, hR); weapon(); }
  const PROF = [0, 0, 0, 2.7, 3.3, 3.7, 3.8, 3.7, 3.3, 2.6];
  const prof = (u: number) => PROF[Math.round(u)] * kx;
  bodyRows(sc, (f, r, u) => P(f, r, u + bob), 3, 9, prof, null, pal, T, (u, _x, k) => {
    if (u <= 4) return k < 0.25 ? '#8a6040' : '#6a4630';
    if (sn > -0.2 && u >= 5 && u <= 7 && Math.abs(k - (0.5 + cs * 0.3)) < 0.22) return pal.light; // belly
    return null;
  });
  if (archer) bodyRows(sc, (f, r, u) => P(f, r, u + bob), 7, 9, (u) => prof(u) + 0.3, null, { light: '#7a4a5a', main: '#5a3448', dark: '#3e2234' }, T);
  const head = P(0.6, 0, 11.6 + bob);
  const ear = (side: number) => {
    const a = P(0, side * 3.2, 12.4 + bob), b = P(-1.6, side * 7.6, 14.2 + bob), c2 = P(0.4, side * 3.2, 10.6 + bob);
    X.poly(sc, [[a[0], a[1]], [b[0], b[1]], [c2[0], c2[1]]], T(pal.main)); X.px(sc, (a[0] * 2 + b[0]) / 3, (a[1] * 2 + b[1]) / 3 + 0.5, T('#c87a6a'));
  };
  const earBack = P0(0, -6, 13)[2] < P0(0, 6, 13)[2] ? -1 : 1;
  ear(earBack);
  X.ellipse(sc, head[0], head[1], 3.9 * kx, 3.1, T(pal.main));
  X.rect(sc, head[0] - 2, head[1] - 3, 3, 1, T(pal.light));
  X.rect(sc, head[0] - 3, head[1] + 2, 7, 1, T(pal.dark));
  if (archer) { X.ellipse(sc, head[0] - cs * 0.6, head[1] - 1.5, 4.2 * kx, 2.2, T('#5a3448')); X.px(sc, head[0] - 2, head[1] - 3, T('#7a4a5a')); }
  if (sn > -0.45) {
    const nose = P(4.1, 0, 11.3 + bob); X.px(sc, nose[0], nose[1], T(pal.dark));
    const m = P(3.4, 0, 9.9 + bob);
    // the mouth: a snarl as the blow lands; the imp's glows as it winds up its spit and flares as it spits
    const glowing = imp && (wW > 0.2 || wS > 0.2);
    if (glowing) {
      const hot = wW > 0.7 || wS > 0.5;
      X.px(se, m[0], m[1], hot ? '#fff4c0' : '#ffd860'); X.px(se, m[0] + 1, m[1], hot ? '#ffd860' : '#ff9a30');
      if (hot) { X.px(se, m[0], m[1] + 1, '#ff9a30'); X.px(se, m[0] - 1, m[1], '#ff5a20'); }
    } else {
      X.px(sc, m[0], m[1], '#2a1a1a'); if (sn > 0.3 || wS > 0.5) X.px(sc, m[0] + 1, m[1], '#f0f0e0');
    }
    for (const r of [-1.4, 1.4]) if (visible(sn, cs, 3, r)) { const e = P(3.1, r, 12.2 + bob), shut = dead > 0.3 || s.eyesShut; X.px(shut ? sc : se, e[0], e[1], shut ? '#1a1420' : s.eyeCol ?? (wW > 0.6 && !archer ? '#fff4c0' : '#ffe040')); }
  }
  ear(-earBack);
  if (imp) {
    // the imp: two small horns and a flicker of flame on its crown (emissive: it glows); it flares up as it winds up
    for (const r of [-1.6, 1.6]) { const a = P(0.4, r, 14 + bob), b = P(-0.2, r * 1.3, 16.5 + bob); X.line(sc, a[0], a[1], b[0], b[1], '#2a1410'); }
    const cr = P(0, 0, 15.5 + bob);
    if (s.crown > 0.66) { X.px(se, cr[0], cr[1] - 1, '#ffd860'); X.px(se, cr[0] - 1, cr[1], '#ff9a30'); X.px(se, cr[0] + 1, cr[1], '#ff5a20'); if (wW > 0.5) { X.px(se, cr[0], cr[1] - 2, '#fff4c0'); X.px(se, cr[0], cr[1] - 1, '#fff4c0'); } }
    else if (s.crown > 0.25) X.px(se, cr[0], cr[1], '#ff5a20');
  }
  if (dL >= -0.3) arm(-1, hL);
  if (dR >= -0.3) { arm(1, hR); weapon(); }
  const c2 = P(1, 0, 7 + bob), h2 = P(0.6, 0, 12 + bob), bt = P(8, -0.8, 9 + bob);
  out.chest = [c2[0], c2[1]]; out.head = [h2[0], h2[1]]; out.tip = [bt[0], bt[1]];
  // the grabber's claws (deaths: the lightning arc jumps between them)
  if (reach) { const a = P(hL[0] + 1, hL[1], hL[2]), b = P(hR[0] + 1, hR[1], hR[2]); out.hands = [[a[0], a[1]], [b[0], b[1]]]; }
}

// ======================================================================
// Brute
// ======================================================================
function drawBrute(s: RigState): void {
  const pal = BRUTE, T = tinter(s), { cs, sn, kx, P: P0 } = frame(s);
  // the slam leans the whole body: rearing back under the raised fists, then folding over the blow
  const [sW, sS] = atkWeights(s.smash), lean = -0.08 * sW + 0.16 * sS;
  const P: Proj = (f, r, u) => P0(f + lean * Math.max(0, u - 4), r, u);
  const walk = Math.min(1, s.spd);
  const bob = Math.abs(Math.sin(s.ph)) * 1.8 * walk + Math.sin(s.idle * 0.8) * 0.5 * (1 - walk);
  const st = Math.sin(s.ph) * 3.6 * walk, lift = (k: number) => Math.max(0, Math.cos(s.ph + k)) * 2.4 * walk;
  for (const side of [-1, 1]) {
    const k = side < 0 ? 0 : Math.PI, f = P(-side * st, side * 3.6, lift(k)), hip = P(0, side * 3.2, 8 + bob);
    X.line(sc, hip[0], hip[1], f[0], f[1] - 1, T(pal.dark), 3);
    X.rect(sc, f[0] - 2, f[1] - 1, 5, 2, T(pal.deep));
  }
  // arm poses: idle swing, punch, overhead smash
  let hL: V3 = [2.5 + st * 0.6, -8.8, 6.5 + bob], hR: V3 = [2.5 - st * 0.6, 8.8, 6.5 + bob];
  if (s.punch >= 0) { const p = s.punch < 0.45 ? -smooth(s.punch / 0.45) * 0.6 : s.punch < 0.6 ? lerp(-0.6, 1, (s.punch - 0.45) / 0.15) : lerp(1, 0, smooth(clamp((s.punch - 0.6) / 0.4, 0, 1))); hR = [2.5 + p * 8, 6 - p * 2, 8 + p * 6 + bob]; }
  if (s.smash >= 0) {
    const k = s.smash;
    const up = k < 0.5 ? smooth(k / 0.5) : k < 0.6 ? 1 - (k - 0.5) / 0.1 : 0;
    const fwd = k < 0.5 ? -1 * smooth(k / 0.5) : k < 0.6 ? lerp(-1, 7, (k - 0.5) / 0.1) : lerp(7, 2.5, smooth(clamp((k - 0.7) / 0.3, 0, 1)));
    const hz = k < 0.6 ? lerp(6.5, 31, up) : lerp(1.5, 6.5, smooth(clamp((k - 0.75) / 0.25, 0, 1)));
    hL = [fwd, -2.8 - (1 - up) * 1.5, hz + bob]; hR = [fwd, 2.8 + (1 - up) * 1.5, hz + bob];
  }
  const arm = (side: number, h: V3) => {
    const sh = P(1.6, side * 6.8, 17.4 + bob), hp = P(...h);
    X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark), 3); X.line(sc, sh[0] - 1, sh[1], hp[0] - 1, hp[1], T(pal.main), 1);
    X.ellipse(sc, hp[0], hp[1], 2.4, 2, T(pal.main)); X.px(sc, hp[0] - 1, hp[1] - 1, T(pal.light));
  };
  const handsUp = s.smash >= 0 && s.smash < 0.55;
  const dL = P(...hL)[2], dR = P(...hR)[2];
  if (dL < -0.5 && !handsUp) arm(-1, hL);
  if (dR < -0.5 && !handsUp) arm(1, hR);
  // torso, hunched forward
  const PR = [6.2, 7, 7.6, 8, 8.2, 8.2, 8, 7.6, 7.1, 6.4, 5.6, 4.6, 3.4];
  bodyRows(sc, (f, r, u) => P(f, r, u + bob), 7, 20, (u) => (PR[u - 8] ?? 5.8) * kx, (u) => (u - 8) * 0.18, pal, T, (u, _x, k) => {
    if (u <= 9) return k < 0.25 ? '#8a6040' : '#5a3a28';
    if (sn > -0.3 && u >= 10 && u <= 15 && Math.abs(k - (0.5 + cs * 0.28)) < 0.2) return pal.belly;
    return null;
  });
  const hc = P(3.4, 0, 21 + bob);
  const horn = (side: number) => {
    const a = P(2.6, side * 2.8, 22.6 + bob), b = P(1.8, side * 5.4, 25.4 + bob), c2 = P(0.6, side * 5.8, 28 + bob);
    X.line(sc, a[0], a[1], b[0], b[1], '#d8ccb0', 2); X.line(sc, b[0], b[1], c2[0], c2[1], '#f0e8d4'); X.px(sc, c2[0], c2[1], '#fffaf0');
  };
  const hb = P(0, -5, 0)[2] < P(0, 5, 0)[2] ? -1 : 1;
  horn(hb);
  X.ellipse(sc, hc[0], hc[1], 3.5 * kx, 2.9, T(pal.main));
  X.rect(sc, hc[0] - 2, hc[1] - 2, 3, 1, T(pal.light));
  if (sn > -0.4) {
    const dead = s.dead > 0.4;
    for (const r of [-1.3, 1.3]) if (visible(sn, cs, 5, r)) {
      const e = P(5.6, r, 21.6 + bob);
      if (dead) for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1], [0, 0]]) X.px(sc, e[0] + dx, e[1] + dy, '#1a1420');
      else { X.px(s.eyesShut ? sc : se, e[0], e[1], s.eyesShut ? '#1a1420' : s.eyeCol ?? '#ffe8a0'); X.px(sc, e[0], e[1] - 1, '#2a1a30'); }
    }
    for (const r of [-1.5, 1.5]) if (visible(sn, cs, 5, r)) { const k = P(6, r, 19.2 + bob); X.px(sc, k[0], k[1], '#fffaf0'); X.px(sc, k[0], k[1] - 1, '#fffaf0'); }
  }
  horn(-hb);
  if (dL >= -0.5 || handsUp) arm(-1, hL);
  if (dR >= -0.5 || handsUp) arm(1, hR);
  const c2 = P(3, 0, 14 + bob), h2 = P(3.4, 0, 22 + bob), fR = P(...hR);
  out.chest = [c2[0], c2[1]]; out.head = [h2[0], h2[1]]; out.tip = [fR[0], fR[1]];
}

// ======================================================================
// Practice dummy (the Sanctum's): a straw figure on a post, in the same rig style
// ======================================================================
function drawDummy(s: RigState): void {
  const T = tinter(s), { kx, P } = frame(s);
  const wob = s.sq * 3; // a hit rocks it on its post
  const base = P(0, 0, 0), top = P(0, wob * 0.3, 12);
  X.line(sc, base[0], base[1], top[0], top[1], T('#5a3d24'), 2);
  X.rect(sc, base[0] - 2, base[1] - 1, 5, 2, T('#3e2a1a'));
  // the crossbar arms
  const aL = P(0.3, -6 + wob * 0.2, 14), aR = P(0.3, 6 + wob * 0.2, 14);
  X.line(sc, aL[0], aL[1], aR[0], aR[1], T('#6a4a2c'), 2);
  for (const a of [aL, aR]) { X.rect(sc, a[0] - 1, a[1] - 1, 3, 3, T(STRAW.main)); X.px(sc, a[0] - 1, a[1] - 1, T(STRAW.light)); }
  // the straw body, bound with a red sash
  bodyRows(sc, (f, r, u) => P(f, r + wob * (u / 20), u), 9, 17, (u) => (u > 15 ? 3.4 - (u - 15) * 0.8 : 3.6) * kx, null, STRAW, T, (u, x, k) => {
    if (u === 12) return '#7d2b22';
    if ((x + u) % 3 === 0 && k > 0.3 && k < 0.7) return STRAW.dark; // straw strands
    return null;
  });
  const hc = P(0.2, wob * 0.9, 20.5);
  X.ellipse(sc, hc[0], hc[1], 2.9 * kx, 2.5, T(STRAW.main));
  X.ellipse(sc, hc[0] - 0.8, hc[1] - 0.8, 1.6 * kx, 1.2, T(STRAW.light));
  X.px(sc, hc[0] - 1, hc[1], '#3a2a1a'); X.px(sc, hc[0] + 1, hc[1], '#3a2a1a');
  // a painted target on the chest
  const ch = P(1.5, wob * 0.6, 13.5);
  X.px(sc, ch[0], ch[1], '#e8e0c8'); X.px(sc, ch[0] - 1, ch[1], '#b83a2a'); X.px(sc, ch[0] + 1, ch[1], '#b83a2a');
  out.chest = [ch[0], ch[1]]; out.head = [hc[0], hc[1]]; out.tip = [ch[0], ch[1]];
}

// ======================================================================
// The tutorial's props: a bramble (only fire clears it) and a straw sack to shove
// ======================================================================
const THORN = { stem: '#4a2e1c', stemL: '#74502e', leaf: '#3a6428', leafL: '#5e8a32', leafD: '#203c18', thorn: '#e4d6aa', berry: '#c02a40' };
/** A thornbush: a dark leafy mound with thorny canes arching out of it. variant 1 is the thick one. */
function drawBramble(s: RigState): void {
  const T = tinter(s), { kx, P } = frame(s), big = s.variant === 1 ? 1.5 : 1, wob = s.sq * 2;
  const top = Math.round(8 * big);
  const cane = (k: number, front: boolean) => {
    const a = (k / 9) * Math.PI * 2 + 0.35 + rand(k, 1, s.seed) * 0.4, rr = (3.6 + rand(k, 2, s.seed) * 1.6) * big;
    const pts = [P(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 2 * big), P(Math.cos(a) * rr * 0.75, Math.sin(a) * rr * 0.75 + wob, (6 + rand(k, 3, s.seed) * 3) * big), P(Math.cos(a) * rr * 1.15, Math.sin(a) * rr * 1.15 + wob, (3.5 + rand(k, 4, s.seed) * 2) * big)];
    if ((pts[1][2] >= 0) !== front) return;
    for (let j = 1; j < pts.length; j++) X.line(sc, pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], T(j === 1 ? THORN.stemL : THORN.stem));
    // thorns along the cane, pale points on alternating sides
    for (let j = 1; j < pts.length; j++) for (let q = 1; q <= 2; q++) {
      const m = q / 3, x = lerp(pts[j - 1][0], pts[j][0], m), y = lerp(pts[j - 1][1], pts[j][1], m);
      X.px(sc, x + ((j + q) & 1 ? 1 : -1), y - 1, T(THORN.thorn));
    }
  };
  for (let k = 0; k < 9; k++) cane(k, false);
  bodyRows(sc, (f, r, u) => P(f, r + wob * (u / 10), u), 0, top, (u) => (4.6 * big - Math.max(0, u - 2.5 * big) * 0.62) * kx * (0.92 + 0.08 * Math.sin(u * 2.3 + s.seed)), null,
    { light: THORN.leafL, main: THORN.leaf, dark: THORN.leafD }, T, (u, x) => {
      const r = rand(x, u, s.seed + 3);
      if (r < 0.2) return THORN.leafD;
      if (r > 0.93) return THORN.leafL;
      if (r > 0.9 && u > 1) return THORN.stem; // a cane showing through the leaves
      return null;
    });
  for (let k = 0; k < 9; k++) cane(k, true);
  // a few red berries on the near side
  for (let k = 0; k < Math.round(3 * big); k++) { const b = P(1.5 + rand(k, 7, s.seed) * 2.5 * big, (rand(k, 8, s.seed) - 0.5) * 6 * big, (2 + rand(k, 9, s.seed) * 5) * big); X.px(sc, b[0], b[1], T(THORN.berry)); }
  const c = P(0, 0, 4 * big), h = P(0, 0, top);
  out.chest = [c[0], c[1]]; out.head = [h[0], h[1]]; out.tip = [h[0], h[1]];
}

const BURLAP = { light: '#d2b27e', main: '#a8875a', dark: '#765a38', rope: '#5a3e22', patch: '#8a6a44' };
/** A burlap sack stuffed with straw, tied at the neck: rocks when hit, slides when shoved. */
function drawSack(s: RigState): void {
  const T = tinter(s), { kx, P } = frame(s), wob = s.sq * 3;
  const prof = (u: number) => (u <= 7 ? 3.4 + Math.sin((u / 7) * Math.PI) * 1.4 : u <= 9 ? 2.6 - (u - 8) * 0.9 : u === 10 ? 1.2 : 2) * kx;
  bodyRows(sc, (f, r, u) => P(f, r + wob * (u / 12), u), 0, 11, prof, null, BURLAP, T, (u, x, k) => {
    if (u === 9) return BURLAP.rope;
    if (u >= 2 && u <= 4 && k > 0.55 && k < 0.8) return u === 3 ? BURLAP.dark : BURLAP.patch; // a stitched patch
    if ((x + u * 2) % 5 === 0 && u < 9) return BURLAP.dark; // the weave
    if (u === 11 && (x & 1)) return STRAW.light; // straw poking out of the neck
    return null;
  });
  const c = P(0, wob * 0.4, 5), h = P(0, wob * 0.8, 10);
  out.chest = [c[0], c[1]]; out.head = [h[0], h[1]]; out.tip = [h[0], h[1]];
}

// ======================================================================
// Status on the body (Battlefield pass 4: on the body itself, never a symbol above it)
// ======================================================================
const cp = (dst: Ctx, src: HTMLCanvasElement, dx: number, dy: number) => dst.drawImage(src, BX, BY, BW, BH, dx + BX, dy + BY, BW, BH);
/** Paint flecks onto the body only: draw into SIL, keep what lies over body pixels, add to dst. */
function onBody(dst: Ctx, paint: (c: Ctx) => void): void {
  sil.globalCompositeOperation = 'source-over'; sil.clearRect(BX, BY, BW, BH); sil._fs = null;
  paint(sil);
  sil.globalCompositeOperation = 'destination-in'; cp(sil, SC.c, 0, 0); sil.globalCompositeOperation = 'source-over';
  cp(dst, SIL.c, 0, 0);
}
/** Wet: the tint darkens and blues the body; here, a few highlights that slide down it. */
function wetSheen(s: RigState): void {
  const k = s.wet;
  onBody(sc, (c) => {
    for (let x = BX; x < BX + BW; x++) {
      const run = s.wetF + Math.floor(rand(x, 3, s.seed) * 30);
      for (let y = BY; y < BY + BH; y++) if (rand(x, (y - run) >> 1, s.seed + 4) < 0.07 * k) X.px(c, x, y, y & 1 ? '#9ac8f0' : '#5a90d0');
    }
  });
}
/** Burning: the body flickers in fire colours from the feet up, the top edge brightest. */
function burning(s: RigState): void {
  const k = s.burn, ft = s.burnF, top = AY - HEIGHT[s.kind] * 0.9;
  onBody(se, (c) => {
    for (let y = BY; y < BY + BH; y++) {
      const up = clamp((AY - y) / (AY - top), 0, 1);
      for (let x = BX; x < BX + BW; x++) {
        const r = rand(x, (y + ft) >> 1, s.seed + 9);
        if (r < k * (0.12 + 0.22 * up)) X.px(c, x, y, r < k * 0.05 ? X.EL.fire[1] : up > 0.55 ? X.EL.fire[2] : X.EL.fire[3]);
      }
    }
  });
}
/** Chill (from the gallery): frost on the body's top edges, speckles, crystal spikes when heavy. */
function rime(s: RigState): void {
  const k = s.chill;
  const img = sc.getImageData(BX, BY, BW, BH), d = img.data, sd = (s.seed | 0) + 17;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= BW || y >= BH ? 0 : d[(y * BW + x) * 4 + 3]);
  const pts: [number, number, string][] = [];
  for (let y = 1; y < BH; y++) for (let x = 0; x < BW; x++) {
    if (!at(x, y)) continue;
    const topEdge = !at(x, y - 1), r = rand(x, y, sd);
    if (topEdge && r < 0.25 + k * 0.75) pts.push([x, y, r < 0.35 ? '#ffffff' : '#d8f8ff']);
    else if (!topEdge && r < k * 0.09) pts.push([x, y, r < k * 0.04 ? '#ffffff' : '#bfeeff']);
    if (topEdge && k > 0.55 && rand(x, y, sd + 5) < (k - 0.55) * 0.55) {
      const h = 1 + Math.floor(rand(x, y, sd + 6) * (1 + k * 2.2));
      for (let j = 1; j <= h; j++) pts.push([x + (j === h && rand(x, y, sd + 7) < 0.5 ? (rand(x, y, sd + 8) < 0.5 ? -1 : 1) : 0), y - j, j === h ? '#ffffff' : '#a8e8ff']);
    }
  }
  for (const [x, y, col] of pts) X.px(sc, BX + x, BY + y, col);
}
/**
 * Body-shaped ice (Spell VFX gallery, pass 6; the user's pick over the old cube). A pure function
 * of an alpha mask, so it serves the rig and the frozen shatter alike: give it the silhouette
 * (solid(x, y)), a colour reader (col(x, y) -> '#rrggbb'), the box size, how far the ice has grown
 * (0..1, from the feet up) and a seed; it returns the pixels to paint, [x, y, colour]:
 *   - the body under the ice: tinted pale blue, rime (white) on every sky-facing pixel
 *   - a shell of clear ice hugging the silhouette: 1 px all round, 2 px below the waist (ice pools
 *     thicker at the base), lit pale on the left, deep blue at the foot, a white lip on top and a
 *     diagonal glint
 *   - a few jagged crystal spikes growing out of the shell, leaning up and outward
 * Deterministic per seed, so the spikes don't crawl from frame to frame.
 */
export function frozenBody(solid: (x: number, y: number) => boolean, col: (x: number, y: number) => string, w: number, h: number, grow: number, seed: number): [number, number, string][] {
  const res: [number, number, string][] = [], B = new Uint8Array(w * h);
  let top = h, bot = -1, sx = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { B[y * w + x] = 1; top = Math.min(top, y); bot = Math.max(bot, y); sx += x; n++; }
  if (!n) return res;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && B[y * w + x] === 1;
  const cx = sx / n, mid = (top + bot) / 2, yk = bot + 2 - (bot - top + 5) * clamp(grow, 0, 1);
  // the shell: every empty pixel within reach of the body
  const S = new Uint8Array(w * h), sh = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (S[y * w + x] === 1 || B[y * w + x] === 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (B[y * w + x] || y < yk) continue;
    const r = y > bot - 3 ? 2 : 1;
    let hit = false;
    for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && at(x + dx, y + dy)) hit = true;
    if (hit && y <= bot + 1) S[y * w + x] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y < yk) continue;
    const up = !sh(x, y - 1), r = rand(x, y, seed);
    if (B[y * w + x]) {
      // the body seen through the ice
      let c = X.mix(col(x, y), '#7cc8f0', 0.38);
      if (!at(x, y - 1) && r < 0.7) c = r < 0.3 ? '#ffffff' : '#d8f6ff';
      else if (r < 0.03) c = '#ffffff';
      res.push([x, y, c]);
    } else if (S[y * w + x]) {
      let c = x < cx - 1 ? '#a2e2fa' : '#6cc0ea';
      if (y >= bot) c = '#3e9ad4';
      else if (y > mid + 3 && x >= cx - 1) c = '#64b8e6';
      if (up) c = '#ffffff';
      if ((x - y + seed) % 11 === 0 && x < cx + 2 && !up) c = '#ffffff';
      res.push([x, y, c]);
    }
  }
  // crystal spikes: from sky- or side-facing shell pixels, spaced apart
  const cand: [number, number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S[y * w + x] || y > bot - 2) continue;
    if (!sh(x, y - 1) || !sh(x - 1, y) || !sh(x + 1, y)) cand.push([x, y, rand(x, y, seed + 3)]);
  }
  cand.sort((p, q) => p[2] - q[2]);
  const picked: [number, number, number][] = [];
  for (const p of cand) { if (picked.length >= 4) break; if (picked.every((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 5)) picked.push(p); }
  for (const [x0, y0, r] of picked) {
    let dx = x0 - cx, dy = (y0 - mid) - 4;
    const L0 = Math.hypot(dx, dy) || 1; dx /= L0; dy /= L0;
    const L = 3 + Math.floor(r * 5 * 4) % 4, px2 = -dy, py2 = dx;
    for (let j = 1; j <= L; j++) {
      const x = Math.round(x0 + dx * j), y = Math.round(y0 + dy * j);
      res.push([x, y, j === L ? '#ffffff' : '#dcfaff']);
      if (j < L * 0.55) res.push([Math.round(x + px2), Math.round(y + py2), '#5ab0e0']);
    }
  }
  return res;
}
/** Frozen: body-shaped ice over the scratch canvas (it grows from the feet up with s.frozen). */
function iceShell(s: RigState): void {
  const d = sc.getImageData(BX, BY, BW, BH).data;
  const px = frozenBody((x, y) => d[(y * BW + x) * 4 + 3] > 100, (x, y) => { const k = (y * BW + x) * 4; return X.toHex(d[k], d[k + 1], d[k + 2]); }, BW, BH, s.frozen, (s.seed | 0) + 29);
  for (const [x, y, col] of px) X.px(sc, BX + x, BY + y, col);
}
/** Shocked: a dark silhouette with bright bones (drawn on alternate frames). */
function skeleton(): void {
  sc.globalCompositeOperation = 'source-atop'; X.fs(sc, '#2a1460'); sc.fillRect(0, 0, SW, SH); sc.globalCompositeOperation = 'source-over'; sc._fs = null;
  se.clearRect(0, 0, SW, SH);
  const h = out.head, c = out.chest;
  if (!h || !c) return;
  const B = '#f4ecff';
  X.ellipse(se, h[0], h[1], 2.4, 1.8, B); X.px(se, h[0] - 1, h[1], '#2a1460'); X.px(se, h[0] + 1, h[1], '#2a1460');
  X.line(se, h[0], h[1] + 2, c[0], c[1] + 3, B);
  for (let k = 0; k < 3; k++) X.rect(se, c[0] - 2, c[1] - 1 + k * 2, 5, 1, B);
  X.px(se, c[0] - 1, AY - 1, B); X.px(se, c[0] + 1, AY - 1, B); X.px(se, c[0] - 1, AY - 3, B); X.px(se, c[0] + 1, AY - 3, B);
}

const rel = (p: [number, number] | undefined, fb: [number, number]): [number, number] => (p ? [p[0] - AX, p[1] - AY] : fb);

/**
 * Paint one actor into dst so that its feet land on (fx, fy) of dst (whole pixels). Draws the
 * outline, the colour and the emissive layer, statuses and the hit flash. Returns its anchors,
 * relative to the feet.
 */
export function paint(s: RigState, dst: Ctx, fx: number, fy: number): Anchors {
  sc.globalCompositeOperation = 'source-over'; se.globalCompositeOperation = 'source-over';
  sc.clearRect(BX - 1, BY - 1, BW + 2, BH + 2); se.clearRect(BX - 1, BY - 1, BW + 2, BH + 2);
  sc._fs = se._fs = sil._fs = null;
  out.tip = out.chest = out.head = out.hands = out.charge = undefined;
  if (s.kind === 'wizard') drawWizard(s);
  else if (s.kind === 'brute') drawBrute(s);
  else if (s.kind === 'dummy') drawDummy(s);
  else if (s.kind === 'bramble') drawBramble(s);
  else if (s.kind === 'sack') drawSack(s);
  else drawGoblin(s, s.kind === 'archer');
  if (s.chill > 0.05 && s.frozen < 0.2) rime(s);
  if (s.wet > 0.05 && s.frozen < 0.2) wetSheen(s);
  if (s.burn > 0.05) burning(s);
  if (s.frozen > 0.05) iceShell(s);
  if (s.shock > 0) skeleton();
  if (s.flash > 0) {
    // hit flash: the whole silhouette pops white, dithered as it fades
    sil.globalCompositeOperation = 'copy'; cp(sil, SC.c, 0, 0); sil.globalCompositeOperation = 'source-in'; X.fs(sil, s.flashCol ?? '#ffffff'); sil.fillRect(BX, BY, BW, BH);
    sil.globalCompositeOperation = 'destination-in'; cp(sil, X.mask(s.flash), 0, 0); sil.globalCompositeOperation = 'source-over'; sil._fs = null;
    cp(se, SIL.c, 0, 0);
  }
  if (s.alpha < 0.98) {
    // a fading body (deaths): ordered-dithered away, outline and all
    const m = X.mask(s.alpha * 16);
    for (const x of [sc, se]) { x.globalCompositeOperation = 'destination-in'; cp(x, m, 0, 0); x.globalCompositeOperation = 'source-over'; }
  }
  // compose: silhouette in outline colour, offset four ways, then colour, then emissive
  const dx = Math.round(fx - AX), dy = Math.round(fy - AY);
  sil.globalCompositeOperation = 'copy'; cp(sil, SC.c, 0, 0);
  sil.globalCompositeOperation = 'source-over'; cp(sil, SE.c, 0, 0);
  sil.globalCompositeOperation = 'source-in'; X.fs(sil, s.outline ?? OUTLINE); sil.fillRect(BX, BY, BW, BH);
  sil.globalCompositeOperation = 'source-over'; sil._fs = null;
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) cp(dst, SIL.c, dx + ox, dy + oy);
  cp(dst, SC.c, dx, dy); cp(dst, SE.c, dx, dy);
  const chest = rel(out.chest, [0, -9]);
  return {
    tip: rel(out.tip, [0, -18]), chest, head: rel(out.head, [0, -14]),
    hands: (out.hands as [number, number][] | undefined)?.map((h) => rel(h, chest)) ?? [chest, chest],
    charge: rel(out.charge ?? out.tip, [0, -18]),
  };
}
