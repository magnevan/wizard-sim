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

export type RigKind = 'wizard' | 'goblin' | 'archer' | 'brute' | 'dummy';

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
}

export const newRigState = (): RigState => ({
  kind: 'goblin', pal: 0, variant: 0, seed: 0, face: 0, spd: 0, ph: 0, idle: 0, vx: 0, vy: 0, prep: 0, cast: 0, sq: 0, dead: 0,
  burn: 0, burnF: 0, wet: 0, wetF: 0, frozen: 0, chill: 0, shock: 0, flash: 0, punch: -1, smash: -1, draw: 0,
});

/** Anchor points relative to the feet, in art px: where effects attach. */
export interface Anchors { tip: [number, number]; chest: [number, number]; head: [number, number]; hands: [number, number][]; charge: [number, number] }

export const HEIGHT: Record<RigKind, number> = { wizard: 23, goblin: 12, archer: 12, brute: 23, dummy: 18 };
export const WIDTH: Record<RigKind, number> = { wizard: 6, goblin: 5, archer: 5, brute: 9, dummy: 6 };

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
    return col;
  };
}
function frame(s: RigState): { cs: number; sn: number; kx: number; ku: number; P: Proj } {
  const cs = Math.cos(s.face), sn = Math.sin(s.face), fall = s.dead;
  const kx = (1 + 0.24 * s.sq) * (1 + 0.35 * fall), ku = (1 - 0.24 * s.sq) * (1 - 0.6 * fall);
  // falling over topples the body sideways on screen (top rows shift most)
  const side = s.seed & 1 ? 1 : -1, tip = fall * fall * 0.85 * side;
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
function drawGoblin(s: RigState, archer: boolean): void {
  const pal = GOB[s.pal % GOB.length], T = tinter(s), { cs, sn, kx, P } = frame(s);
  const walk = Math.min(1.2, s.spd), dead = s.dead;
  const bob = Math.abs(Math.sin(s.ph)) * 1.4 * walk + Math.sin(s.idle * 1.3) * 0.3 * (1 - walk);
  const st = Math.sin(s.ph) * 2.6 * walk, lift = (k: number) => Math.max(0, Math.cos(s.ph + k)) * 1.8 * walk;
  for (const side of [-1, 1]) {
    const k = side < 0 ? 0 : Math.PI, f = P(side * st * -1, side * 1.7, lift(k)), hip = P(0, side * 1.6, 4 + bob);
    X.line(sc, hip[0], hip[1], f[0], f[1], T(pal.deep));
    X.rect(sc, f[0] - 1, f[1], 2, 1, '#2a2018');
  }
  const draw = s.draw;
  const arm = (side: number, h: V3) => { const sh = P(0, side * 3.1, 8.4 + bob), hp = P(...h); X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark)); X.px(sc, hp[0], hp[1], T(pal.main)); };
  // the grabber reaches forward with both long arms; the shieldbearer holds its shield out front
  const reach = s.variant === 4 ? 1 : 0, guard = s.variant === 5 ? 1 : 0;
  const hL: V3 = archer ? [4.6, -0.8, 9 + bob] : reach ? [6.5 + draw * 2, -3, 6 + bob] : guard ? [4.2, -2.2, 6 + bob] : [1 + st * 0.5, -4.2, 5 + bob];
  const hR: V3 = archer ? [4.2 - draw * 3.6, 0.6, 9.4 + bob] : reach ? [6.5 + draw * 2, 3, 6 + bob] : [1 - st * 0.5, 4.2, 5 + bob];
  const weapon = () => {
    const hp = P(...hR);
    if (archer) {
      const top = P(4.4, -0.8, 14.2 + bob), mid = P(6.0, -0.8, 9 + bob), bot = P(4.4, -0.8, 3.8 + bob), pull = P(4.4 - draw * 3.4, -0.8, 9 + bob);
      X.lines(sc, [[top[0], top[1]], [mid[0], mid[1]], [bot[0], bot[1]]], '#b8844a');
      X.px(sc, top[0], top[1], '#d8a868'); X.px(sc, bot[0], bot[1], '#d8a868');
      X.line(sc, top[0], top[1], pull[0], pull[1], '#d0d0dc'); X.line(sc, pull[0], pull[1], bot[0], bot[1], '#d0d0dc');
      if (draw > 0.05) { const tipA = P(8.6 - draw * 1.2, -0.8, 9 + bob); X.line(sc, pull[0], pull[1], tipA[0], tipA[1], '#e8d8b0'); X.px(sc, tipA[0], tipA[1], '#c0cbdc'); }
      return;
    }
    if (s.variant === 4) { for (const h of [hL, hR]) { const p = P(...h); X.px(sc, p[0] + 1, p[1], '#e8e0c8'); X.px(sc, p[0] + 1, p[1] + 1, '#e8e0c8'); } return; }
    if (s.variant === 3) return; // the imp fights with its claws
    if (s.variant === 5) {
      // a tall wooden shield with an iron rim and boss, held out in front
      const c0 = P(4.6, -3.6, 1.5 + bob), c1 = P(4.6, 3.6, 1.5 + bob), c2 = P(4.6, 3.6, 12 + bob), c3 = P(4.6, -3.6, 12 + bob);
      if (P(5, 0, 6)[2] > -0.5) {
        X.poly(sc, [[c0[0], c0[1]], [c1[0], c1[1]], [c2[0], c2[1]], [c3[0], c3[1]]], T('#6a4a2c'));
        X.lines(sc, [[c0[0], c0[1]], [c1[0], c1[1]], [c2[0], c2[1]], [c3[0], c3[1]], [c0[0], c0[1]]], T('#8a8e98'));
        const m = P(4.8, 0, 6.5 + bob); X.rect(sc, m[0] - 1, m[1] - 1, 2, 2, '#c8ccd8'); X.px(sc, m[0] - 1, m[1] - 1, '#ffffff');
      }
      return;
    }
    if (s.variant === 1) { const tp = P(hR[0] + 3.5, hR[1], hR[2] + 1.5); X.line(sc, hp[0], hp[1], tp[0], tp[1], '#c8ccd8'); X.px(sc, tp[0], tp[1], '#ffffff'); return; }
    if (s.variant === 2) { const a = P(hR[0] - 3, hR[1] + 0.5, hR[2] - 4), b = P(hR[0] + 2, hR[1] + 0.5, hR[2] + 12); X.line(sc, a[0], a[1], b[0], b[1], '#8a6a48'); X.rect(sc, b[0] - 0.5, b[1] - 2, 2, 3, '#c8ccd8'); return; }
    const top = P(hR[0] + 1.2, hR[1] + 0.8, hR[2] + 7);
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
  const earBack = P(0, -6, 13)[2] < P(0, 6, 13)[2] ? -1 : 1;
  ear(earBack);
  X.ellipse(sc, head[0], head[1], 3.9 * kx, 3.1, T(pal.main));
  X.rect(sc, head[0] - 2, head[1] - 3, 3, 1, T(pal.light));
  X.rect(sc, head[0] - 3, head[1] + 2, 7, 1, T(pal.dark));
  if (archer) { X.ellipse(sc, head[0] - cs * 0.6, head[1] - 1.5, 4.2 * kx, 2.2, T('#5a3448')); X.px(sc, head[0] - 2, head[1] - 3, T('#7a4a5a')); }
  if (sn > -0.45) {
    const nose = P(4.1, 0, 11.3 + bob); X.px(sc, nose[0], nose[1], T(pal.dark));
    const m = P(3.4, 0, 9.9 + bob); X.px(sc, m[0], m[1], '#2a1a1a'); if (sn > 0.3) X.px(sc, m[0] + 1, m[1], '#f0f0e0');
    for (const r of [-1.4, 1.4]) if (visible(sn, cs, 3, r)) { const e = P(3.1, r, 12.2 + bob); X.px(dead > 0.3 ? sc : se, e[0], e[1], dead > 0.3 ? '#1a1420' : '#ffe040'); }
  }
  ear(-earBack);
  if (s.variant === 3) {
    // the imp: two small horns and a flicker of flame on its crown (emissive: it glows)
    for (const r of [-1.6, 1.6]) { const a = P(0.4, r, 14 + bob), b = P(-0.2, r * 1.3, 16.5 + bob); X.line(sc, a[0], a[1], b[0], b[1], '#2a1410'); }
    const cr = P(0, 0, 15.5 + bob); X.px(se, cr[0], cr[1] - 1, '#ffd860'); X.px(se, cr[0] - 1, cr[1], '#ff9a30'); X.px(se, cr[0] + 1, cr[1], '#ff5a20');
  }
  if (dL >= -0.3) arm(-1, hL);
  if (dR >= -0.3) { arm(1, hR); weapon(); }
  const c2 = P(1, 0, 7 + bob), h2 = P(0.6, 0, 12 + bob), bt = P(8, -0.8, 9 + bob);
  out.chest = [c2[0], c2[1]]; out.head = [h2[0], h2[1]]; out.tip = [bt[0], bt[1]];
}

// ======================================================================
// Brute
// ======================================================================
function drawBrute(s: RigState): void {
  const pal = BRUTE, T = tinter(s), { cs, sn, kx, P } = frame(s);
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
      else { X.px(se, e[0], e[1], '#ffe8a0'); X.px(sc, e[0], e[1] - 1, '#2a1a30'); }
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
/** Frozen: the body is rimed, tinted icy and set inside a faceted block that grows from the feet. */
function iceBlock(s: RigState): void {
  const H = Math.round((HEIGHT[s.kind] * 0.8 + 2) * s.frozen), w = WIDTH[s.kind] + 2, x0 = AX - w, x1 = AX + w, y1 = AY + 3, y0 = y1 - H, TD = 6;
  if (H < 2) return;
  onBody(sc, (c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const r = rand(x, y, s.seed + 13); if (r < 0.2) X.px(c, x, y, r < 0.07 ? '#ffffff' : '#c8f0ff'); } });
  sc.save(); sc.beginPath(); sc.rect(x0, y0, x1 - x0 + 1, H + 1); sc.clip();
  sc.globalCompositeOperation = 'source-atop'; sc.globalAlpha = 0.4; X.fs(sc, '#9fe8ff'); sc.fillRect(x0, y0, x1 - x0 + 1, H + 1);
  sc.globalAlpha = 1;
  // the block itself, behind the body
  sc.globalCompositeOperation = 'destination-over';
  X.rect(sc, x0, y0, x1 - x0 + 1, H + 1, '#3a96cc');
  X.rect(sc, x0, y0, Math.round((x1 - x0) * 0.4), H + 1, '#7ad0f0');
  sc.restore(); sc._fs = null;
  sc.globalCompositeOperation = 'source-over';
  X.rect(sc, x0 - 1, y0, 1, H + 2, '#2a78b8'); X.rect(sc, x1 + 1, y0, 1, H + 2, '#2a78b8'); X.rect(sc, x0 - 1, y1 + 1, x1 - x0 + 3, 1, '#1e5a96');
  // the block's top face: a ground square at the 3/4 camera; clear ice, so the head shows through
  sc.globalAlpha = 0.72; X.rect(sc, x0, y0 - TD, x1 - x0 + 1, TD, '#bfeefc'); sc.globalAlpha = 1;
  X.rect(sc, x0 + 1, y0 - TD - 1, x1 - x0 - 1, 1, '#ffffff');
  X.rect(sc, x0, y0 - 1, x1 - x0 + 1, 1, '#e8ffff'); X.rect(sc, x0 + 1, y0 - TD, 3, 2, '#ffffff'); X.px(sc, x1 - 1, y0 - 3, '#8fd8f0'); X.rect(sc, x1 - 3, y0 - TD + 1, 3, TD - 2, '#9fdcf2');
  X.line(sc, x0 + 1, y0 + 2, x0 + 4, y0 + 5, '#ffffff'); X.px(sc, x1 - 2, y1 - 3, '#ffffff');
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
  else drawGoblin(s, s.kind === 'archer');
  if (s.chill > 0.05 && s.frozen < 0.2) rime(s);
  if (s.wet > 0.05 && s.frozen < 0.2) wetSheen(s);
  if (s.burn > 0.05) burning(s);
  if (s.frozen > 0.05) iceBlock(s);
  if (s.shock > 0) skeleton();
  if (s.flash > 0) {
    // hit flash: the whole silhouette pops white, dithered as it fades
    sil.globalCompositeOperation = 'copy'; cp(sil, SC.c, 0, 0); sil.globalCompositeOperation = 'source-in'; X.fs(sil, '#ffffff'); sil.fillRect(BX, BY, BW, BH);
    sil.globalCompositeOperation = 'destination-in'; cp(sil, X.mask(s.flash), 0, 0); sil.globalCompositeOperation = 'source-over'; sil._fs = null;
    cp(se, SIL.c, 0, 0);
  }
  // compose: silhouette in outline colour, offset four ways, then colour, then emissive
  const dx = Math.round(fx - AX), dy = Math.round(fy - AY);
  sil.globalCompositeOperation = 'copy'; cp(sil, SC.c, 0, 0);
  sil.globalCompositeOperation = 'source-over'; cp(sil, SE.c, 0, 0);
  sil.globalCompositeOperation = 'source-in'; X.fs(sil, OUTLINE); sil.fillRect(BX, BY, BW, BH);
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
