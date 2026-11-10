/**
 * The sprays (Force with Water, Fire or Cold), redrawn as streams in the scene (the user, 2026-11-10: the middle
 * looked static, the frost's ground patch was dragged around by the aim, and more runes didn't look like much more).
 *
 * The model is the defence's flame jet (flame-jet.ts): every particle has a spot on the ground and a height over it,
 * so a spray leaves the staff at its height and comes down toward chest height where it ends. Three things are new:
 *
 * - Each particle flies along the aim it was born with (`Jet.aim(ts)`, from a short history the view keeps). Sweeping
 *   a spray bends it like a hose, and what lands (droplets, settling frost) stays where it landed.
 * - The fan is the sim's: half-angle `half` and reach both grow with the runes (effects.ts channelTick), so what you
 *   see wetting, burning or chilling is what's hit. Particles crowd the middle, so the edges read as thin spray.
 * - Runes show. `n` (the form's runes, 1..5) raises density, speed, size and heat, and the top tiers add features
 *   of their own: water gets pressure rings and, at five, blowback and a rainbow in its mist; fire burns blue-white
 *   at the root from four and rolls fireballs at five; frost throws ice shards from three and tumbling snowflakes
 *   and a frost ring at five.
 *
 * Pure in (time, aim history, seed), like the other effects.
 */
import * as X from './px';
import type { Ctx } from './px';
import { puff, sq } from './kit';
import { FY, TAU, clamp, easeOut, emit, lerp, rand } from './util';

export type JetKind = 'water' | 'fire' | 'cold' | 'scald';

/** Where a spray came from and went at one moment: the nozzle on screen, the ground under it, and its far end on the ground. */
export interface Aim { x: number; y: number; ground: number; ex: number; ey: number }

export interface Jet {
  kind: JetKind;
  /** Runes of the form element, 1..5. */
  n: number;
  /** The sim's half-angle of the cone, radians. */
  half: number;
  /** Height over the ground at the far end, px. */
  endH: number;
  t0: number;
  seed: number;
  /** The aim at time ts (a particle's birth). */
  aim: (ts: number) => Aim;
  /** Fewer, thinner particles: 1 for a wizard's own spray, about 0.45 for an echo. */
  thin?: number;
}

const WATER = ['#ffffff', '#e0f6ff', '#8ad0ff', '#3a98ff', '#1a5ec0', '#163a7a'];
const SCALD = ['#ffffff', '#fff0e0', '#ffc8a0', '#8ad0ff', '#3a98ff', '#1a5ec0'];
/** Hottest to coolest; the last two are the flame going out (flame-jet.ts). */
const HEAT = ['#fffbe8', '#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#d8401c', '#9a2a1c'];
const BLUE = ['#ffffff', '#e4f2ff', '#a8d0ff'];
const SMOKE = ['#4e4648', '#666064', '#7e787a'];
const COLD = ['#ffffff', '#e0ffff', '#9ff4ff', '#4ad0f4', '#2080c8'];
const RAINBOW = ['#ff7a7a', '#ffc860', '#fff07a', '#8af07a', '#6ab0ff', '#b08aff'];

/** -1..1 -> -1..1, crowding toward 0 as p grows. */
const fan = (u: number, p: number): number => Math.sign(u) * Math.pow(Math.abs(u), p);

/** A filled pixel disc (no anti-aliasing). */
function disc(c: Ctx, x: number, y: number, r: number, col: string): void {
  if (r < 0.9) { X.px(c, x, y, col); return; }
  const cx = Math.round(x), cy = Math.round(y), R = Math.round(r);
  for (let dy = -R; dy <= R; dy++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
    X.rect(c, cx - hw, cy + dy, hw * 2 + 1, 1, col);
  }
}

/**
 * A point of the spray as aimed at A: `s` of the way out (1 = the far end), `a` radians off the middle, `l` px
 * across, `h` px up. Returns the ground spot and the screen spot.
 */
function place(A: Aim, s: number, a: number, l: number, h: number): [number, number, number, number] {
  const dx = A.ex - A.x, dy = (A.ey - A.ground) / FY, L = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx) + a, cs = Math.cos(ang), sn = Math.sin(ang), d = s * L;
  const gxp = A.x + cs * d - sn * l, gyp = A.ground + (sn * d + cs * l) * FY;
  return [gxp, gyp, gxp, gyp - h];
}
/** Height of the spray's middle `s` of the way out: from the nozzle's down to endH. */
const axisH = (A: Aim, s: number, endH: number): number => lerp(A.ground - A.y, endH, clamp(s, 0, 1));

export function sprayJet(c: Ctx, j: Jet, t: number): void {
  if (j.kind === 'fire') fire(c, j, t);
  else if (j.kind === 'cold') frost(c, j, t);
  else water(c, j, t);
}

// ---- water: a pressure jet that frays into driving spray -------------------------------------------
function water(c: Ctx, j: Jet, t: number): void {
  const { n, half, t0, endH, aim } = j, sd = j.seed, thin = j.thin ?? 1, k = (n - 1) / 4;
  const W = j.kind === 'scald' ? SCALD : WATER;
  const T = 0.3 - 0.07 * k; // seconds to the far end: more Water, more pressure
  const m = (0.8 + 0.3 * (n - 1)) * thin;
  const live = (ts: number) => ts >= t0;
  const now = aim(t);

  // mist hanging over the far half, more of it the more Water there is (behind everything else)
  for (const q of emit(t, (8 + 14 * (n - 1)) * thin, 0.9, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), sb = 0.4 + 0.65 * rand(q.i, 41, sd), a = fan(rand(q.i, 42, sd) * 2 - 1, 1.3) * half * 0.85;
    const [, , x, y] = place(A, sb + q.age * 0.12, a, 0, axisH(A, sb, endH) + q.age * 7);
    X.glow(c, x, y, 2.5 + q.age * (4 + 1.6 * n), j.kind === 'scald' ? '#f0f0f4' : q.age < 0.4 ? '#cfe8ff' : '#8ab8e0', 0.8 * Math.pow(1 - q.age, 0.8));
  }
  if (j.kind === 'scald') for (const q of emit(t, (16 + 8 * n) * thin, 1.1, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), f = 0.25 + rand(q.i, 43, sd) * 0.85, a = (rand(q.i, 44, sd) * 2 - 1) * half * 0.7;
    const [, , x, y] = place(A, f, a, 0, axisH(A, f, endH) + 3 + q.age * 18);
    puff(c, x + q.age * 4, y, 1.5 + f * 2 + q.age * 4, q.age < 0.25 ? X.EL.steam[1] : q.age < 0.6 ? X.EL.steam[2] : '#9aa2b8', (1 - q.age) * 0.85);
  }
  // a rainbow in the mist, for the full five
  if (n >= 5 && t > t0 + 0.35) {
    const [, , x, y] = place(now, 0.72, 0, 0, axisH(now, 0.72, endH) + 4), sh = 0.5 + 0.1 * Math.sin(t * 3.1 + sd);
    for (let b = 0; b < RAINBOW.length; b++) X.ring(c, x, y, 20 - b, (20 - b) * 0.62, RAINBOW[b], sh, Math.PI * 1.08, Math.PI * 1.92);
  }

  // droplets: peel off the jet and drive outward, falling as they slow; the ones that land splash where they land
  const dropLife = T * 1.35;
  const drop = (i: number, A: Aim, age: number): [number, number, number] => {
    const sp = 0.86 + 0.28 * rand(i, 12, sd), u = (age * dropLife) / T;
    const s = u * sp * (1 - 0.18 * u);
    const a = fan(rand(i, 13, sd) * 2 - 1, 1.6) * half * 0.95;
    const h = axisH(A, s, endH) + 3 * Math.sin(Math.PI * Math.min(1, age * 1.3)) - 9 * age * age * age;
    const [, , x, y] = place(A, s, a, 0, Math.max(0, h));
    return [x, y, h];
  };
  for (const q of emit(t, (200 + 40 * n) * m, dropLife, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, r = rand(i, 11, sd);
    const [x, y, h] = drop(i, A, q.age);
    const peel = 0.1 + 0.25 * Math.abs(rand(i, 13, sd) * 2 - 1); // the middle stays a jet a little longer than the edges
    if (q.age * 1.35 < peel) continue;
    if (h <= 0) {
      // landed: a little crown on the floor, spreading
      const sp = Math.min(3, -h * 0.4);
      X.px(c, x - 1 - sp, y, W[2]); X.px(c, x + 1 + sp, y, W[2]); if (sp < 1.5) X.px(c, x, y - 1, W[1]);
      continue;
    }
    const [px0, py0] = drop(i, A, Math.max(0, q.age - 0.055));
    const col = r > 0.82 ? W[0] : r > 0.45 ? W[1] : W[2];
    X.line(c, px0, py0, x, y, r > 0.6 ? W[2] : W[3]);
    if (r > 0.9 && n >= 3) sq(c, x, y, 2, col); else X.px(c, x, y, col);
  }

  // the jet: a rope of water from the staff, pulsing as it surges and fraying as it goes; thicker with more Water
  const coreLife = T * 0.8, thick = n >= 4 ? 3 : n >= 2 ? 2 : 1;
  const core: { x: number; y: number; w: number; b: number; s: number }[] = [];
  for (const q of emit(t, (700 + 220 * n) * thin, coreLife, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, s = q.age * 0.78;
    if (s > 0.32 && rand(i, 5, sd) < (s - 0.32) * (2.4 - 0.25 * n)) continue; // frays into the droplets
    const wob = Math.sin(q.ts * 29 + sd) * 0.022 + Math.sin(q.ts * 11.3 + sd * 2) * 0.03;
    const a = wob + (rand(i, 6, sd) - 0.5) * 0.04 * (1 + s * 4);
    const [, , x, y] = place(A, s, a, 0, axisH(A, s, endH) + Math.sin(q.ts * 41) * 0.5);
    const surge = Math.sin(q.ts * TAU * 7.5 + sd); // bright slugs of water, born together, travelling out together
    core.push({ x, y, w: Math.max(1, thick - Math.floor(s * 2.6)), b: surge, s });
  }
  for (const p of core) sq(c, p.x, p.y + 1, p.w + 1, W[3]); // the underside, so the rope has a body
  for (const p of core) sq(c, p.x, p.y, p.w, p.b > 0.55 ? W[0] : p.s < 0.15 || p.b > -0.2 ? W[1] : W[2]);

  // pressure rings riding the jet out, from four runes
  if (n >= 4) for (const q of emit(t, 5 + 2 * n, T * 0.7, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), s = q.age * 0.55, [, , x, y] = place(A, s, 0, 0, axisH(A, s, endH)), r = 2 + q.age * (n >= 5 ? 6 : 4);
    X.ring(c, x, y, r * 0.6, r, q.age < 0.4 ? W[0] : W[1], 0.85 * (1 - q.age));
  }
  // blowback round the staff at five: the jet is pushing the caster as hard as the target
  if (n >= 5) for (const q of emit(t, 70, 0.28, (i, age, ts) => (live(ts) ? { i, age } : null))) {
    const ang = rand(q.i, 51, sd) * TAU, v = 10 + rand(q.i, 52, sd) * 12;
    X.px(c, now.x + Math.cos(ang) * v * q.age, now.y + Math.sin(ang) * v * q.age * 0.7 + q.age * q.age * 14, q.age < 0.4 ? W[1] : W[2]);
  }
  // the nozzle
  X.glow(c, now.x, now.y, 4 + n * 1.3, W[1], 0.75);
  sq(c, now.x, now.y, n >= 3 ? 3 : 2, W[0]);
}

// ---- fire: the defence's flame jet, with the fan and the heat of the runes --------------------------
function fire(c: Ctx, j: Jet, t: number): void {
  const { n, half, t0, endH, aim } = j, sd = j.seed, thin = j.thin ?? 1, k = (n - 1) / 4;
  const LIFE = 0.56 - 0.08 * k, m = (0.8 + 0.15 * n) * thin, rs = (0.9 + 0.08 * n) * (0.6 + 0.4 * thin), hot = 0.035 * (n - 1);
  const live = (ts: number) => ts >= t0;
  const now = aim(t);
  type P = { x: number; y: number; r: number; col: string; heat: number; kind: 0 | 1 | 2 | 3 }; // flame, smoke, ember, ball
  const out: P[] = [];
  const heatCol = (h: number) => HEAT[clamp(Math.floor(h * HEAT.length), 0, HEAT.length - 1)];

  // the core: a dense, hot stream over the first third; from four runes its root burns blue-white
  for (const q of emit(t, (700 + 120 * n) * thin, 0.16, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, a = q.age, s = a * 0.36;
    const off = (rand(i, 31, sd) * 2 - 1) * (0.6 + s * 6);
    const [, , x, y] = place(A, s, 0, off, axisH(A, s, endH) + Math.sin(i * 1.7 + t * 40) * 0.6);
    const heat = Math.max(0, a * 0.42 + rand(i, 32, sd) * 0.12 - hot * 0.5);
    const blue = n >= 4 && a < 0.12 + 0.08 * (n - 4);
    out.push({ x, y, r: (0.6 + s * 2.2) * rs, col: blue ? BLUE[Math.min(2, Math.floor(a * 18))] : heatCol(heat), heat: blue ? -1 : heat, kind: 0 });
  }
  // flame: born at the nozzle, slowing as it goes, so it bunches and billows at the far end
  for (const q of emit(t, (520 + 40 * n) * m, LIFE, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const i = q.i, life = 0.75 + 0.25 * rand(i, 1, sd), a = q.age / life;
    if (a >= 1) continue;
    const A = aim(q.ts), reach = 0.86 + 0.24 * rand(i, 2, sd), s = (1 - Math.pow(1 - a, 1.8)) * reach;
    const side = rand(i, 3, sd) * 2 - 1, ang = fan(side, 1.35) * half * 0.85;
    const l = Math.sin(a * 11 + i * 0.7) * 2.2 * s;
    const h = axisH(A, s, endH) + a * a * 14 + Math.sin(a * 9 + i * 1.3) * 1.6 * s;
    const [, , x, y] = place(A, s, ang, l, h);
    const heat = Math.max(0, a * (0.85 + 0.3 * rand(i, 4, sd)) + Math.abs(side) * 0.25 * s - hot);
    let r = (0.5 + s * 2.6 * (0.6 + 0.6 * rand(i, 5, sd))) * rs;
    if (a > 0.78) r *= 1 - (a - 0.78) * 2.2;
    out.push({ x, y, r, col: heatCol(heat), heat, kind: 0 });
  }
  // fireballs rolling up out of the far end, at five
  if (n >= 5) for (const q of emit(t, 11 * thin, 0.7, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, sb = 0.78 + 0.3 * rand(i, 61, sd), ang = (rand(i, 62, sd) * 2 - 1) * half * 0.6;
    const [, , x, y] = place(A, sb + q.age * 0.08, ang, 0, axisH(A, sb, endH) + 4 + q.age * 22);
    const r = (3 + 3 * rand(i, 63, sd)) * (1 - q.age * 0.5);
    out.push({ x, y, r, col: '', heat: q.age, kind: 3 });
  }
  // smoke: rises off the stream along its far two thirds, thickest at the end
  for (const q of emit(t, (34 + 14 * n) * thin, 1.4, (i, age, ts) => (ts < t0 + 0.12 ? null : { i, age, ts }))) {
    const A = aim(q.ts), i = q.i, a = q.age, sb = 0.32 + 0.78 * Math.sqrt(rand(i, 11, sd));
    const side = rand(i, 12, sd) * 2 - 1, s = sb + a * 0.12;
    const [, , x, y] = place(A, s, side * half * 0.8 * (0.6 + a * 0.4), 0, axisH(A, sb, endH) + 4 + a * 32 + Math.sin(a * 5 + i) * 2);
    out.push({ x: x + a * 5, y, r: (1.4 + sb * 1.2 + a * 3.5) * (0.8 + 0.1 * n), col: SMOKE[a < 0.3 ? 0 : a < 0.65 ? 1 : 2], heat: 0.54 - 0.3 * a, kind: 1 });
  }
  // embers: sparks that carry past the flame and fall
  for (const q of emit(t, (20 + 14 * n) * thin, 0.9, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, a = q.age, s = (1 - Math.pow(1 - a, 1.5)) * (0.95 + 0.35 * rand(i, 21, sd));
    const ang = (rand(i, 22, sd) * 2 - 1) * half;
    const h = axisH(A, s, endH) + Math.sin(a * Math.PI) * 10 - a * a * 18;
    if ((i + Math.floor(t * 18)) % 5 === 0) continue; // a flicker
    const [, , x, y] = place(A, s, ang, 0, Math.max(0, h));
    out.push({ x, y, r: 0, col: HEAT[1 + (i % 3)], heat: a, kind: 2 });
  }

  for (const p of out) if (p.kind === 1) puff(c, p.x, p.y, p.r, p.col, p.heat);
  // cooler first, so the hot middle shows on top
  const fl = out.filter((p) => p.kind === 0 || p.kind === 3).sort((a, b) => b.heat - a.heat);
  for (const p of fl) {
    if (p.kind === 3) { disc(c, p.x, p.y, p.r, HEAT[5]); disc(c, p.x, p.y - p.r * 0.2, p.r * 0.7, HEAT[3]); if (p.heat < 0.55) disc(c, p.x, p.y - p.r * 0.3, p.r * 0.35, HEAT[1]); continue; }
    disc(c, p.x, p.y, p.r, p.col);
  }
  for (const p of out) if (p.kind === 2) X.px(c, p.x, p.y, p.col);
  // the nozzle's flare
  X.glow(c, now.x, now.y, 5 + n * 1.2, n >= 4 ? '#fff4c0' : '#ffd860', 0.75);
  disc(c, now.x, now.y, n >= 4 ? 2 : 1.4, n >= 4 ? '#ffffff' : '#fffbe8');
}

// ---- frost: a freezing gale, crystals glittering in it, frost settling where it blows ----------------
function frost(c: Ctx, j: Jet, t: number): void {
  const { n, half, t0, endH, aim } = j, sd = j.seed, thin = j.thin ?? 1, k = (n - 1) / 4;
  const T = 0.42 - 0.08 * k, m = (0.8 + 0.4 * (n - 1)) * thin;
  const live = (ts: number) => ts >= t0;
  const now = aim(t), tw = Math.floor(t * 20);

  // frost settling on the floor where the gale blew, staying put as the aim moves on, then melting away
  for (const q of emit(t, (18 + 14 * n) * thin, 1.4, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, arrive = 0.22;
    if (q.age < arrive) continue;
    const s = 0.5 + 0.55 * rand(i, 71, sd), a = fan(rand(i, 72, sd) * 2 - 1, 1.2) * half * 0.85;
    const [gx0, gy0] = place(A, s, a, 0, 0), f = 1 - (q.age - arrive) / (1 - arrive);
    if (f < X.bay(Math.round(gx0), Math.round(gy0)) * 0.9) continue;
    const big = rand(i, 73, sd) > 0.7;
    X.px(c, gx0, gy0, (i + tw) % 7 === 0 ? COLD[0] : COLD[2]);
    if (big && f > 0.4) { X.px(c, gx0 - 1, gy0, COLD[3]); X.px(c, gx0 + 1, gy0, COLD[3]); }
  }
  // the gale's mist: cold puffs streaming out and spreading, curling as they go
  for (const q of emit(t, (40 + 22 * n) * thin, 0.75, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, a = q.age, s = 0.08 + easeOut(a) * (0.95 + 0.15 * rand(i, 81, sd));
    const ang = fan(rand(i, 82, sd) * 2 - 1, 1.4) * half * 0.85 * Math.min(1, 0.4 + a);
    const l = Math.sin(a * 7 + i) * (1.5 + a * 4);
    const [, , x, y] = place(A, s, ang, l, axisH(A, s, endH) + a * 4);
    X.glow(c, x, y, 2 + a * (5 + 1.6 * n), a < 0.3 ? COLD[1] : a < 0.6 ? '#bfe6f2' : '#8cc4dc', 0.9 * Math.pow(1 - a, 0.7));
  }
  // wind streaks: thin bright lines racing out through the mist, so the gale reads as moving
  for (const q of emit(t, (30 + 14 * n) * thin, T * 0.9, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, a = q.age, sp = 0.85 + 0.3 * rand(i, 91, sd);
    const ang = fan(rand(i, 92, sd) * 2 - 1, 1.8) * half * 0.7;
    const s1 = easeOut(a) * sp * 0.95, s0 = easeOut(Math.max(0, a - 0.08 - 0.02 * n)) * sp * 0.95;
    const [, , x1, y1] = place(A, s1, ang, 0, axisH(A, s1, endH));
    const [, , x0, y0] = place(A, s0, ang, 0, axisH(A, s0, endH));
    if (a > 0.75 && (i + tw) % 2) continue;
    X.line(c, x0, y0, x1, y1, a < 0.5 ? COLD[0] : COLD[1]);
  }
  // crystals: glitter tumbling in the gale, sinking slowly; from three runes some are shards, at five snowflakes
  for (const q of emit(t, (110 + 30 * n) * m, T * 1.8, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, a = q.age, r = rand(i, 13, sd);
    const s = easeOut(a) * (0.8 + 0.35 * rand(i, 12, sd));
    const ang = fan(rand(i, 11, sd) * 2 - 1, 1.3) * half * 0.92;
    const h = axisH(A, s, endH) - a * a * 7 + Math.sin(a * 6 + i) * 1.5;
    const [, , x, y] = place(A, s, ang, Math.sin(a * 6 + i) * 2.5, Math.max(1, h));
    const glint = (i + tw) % 4 === 0;
    if (n >= 5 && r > 0.94) { // a snowflake, turning
      const rot = (Math.floor(a * 10 + i) & 1) === 0, col = glint ? COLD[0] : COLD[1];
      X.px(c, x, y, COLD[0]);
      for (const [dx, dy] of rot ? [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] : [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 2], [-2, -2], [2, -2], [-2, 2]]) X.px(c, x + dx, y + dy, Math.abs(dx) + Math.abs(dy) > 2 ? COLD[3] : col);
    } else if (n >= 3 && r > 0.84) { // an ice shard flying point first
      const [, , bx, by] = place(A, Math.max(0, s - 0.06), ang, 0, Math.max(1, h));
      X.line(c, bx, by, x, y, COLD[3]); X.px(c, x, y, COLD[0]);
    } else if (r > 0.72) { // a little cross
      const col = glint ? COLD[0] : COLD[2];
      X.px(c, x, y, COLD[0]); X.px(c, x - 1, y, col); X.px(c, x + 1, y, col); X.px(c, x, y - 1, col); X.px(c, x, y + 1, col);
    } else X.px(c, x, y, glint || r > 0.6 ? COLD[0] : a < 0.5 ? COLD[1] : COLD[3]);
  }
  // the breath: a dense pale stream leaving the staff
  for (const q of emit(t, (420 + 120 * n) * thin, T * 0.5, (i, age, ts) => (live(ts) ? { i, age, ts } : null))) {
    const A = aim(q.ts), i = q.i, s = q.age * 0.5;
    const a = Math.sin(q.ts * 23 + sd) * 0.03 + (rand(i, 101, sd) - 0.5) * 0.08 * (1 + s * 5);
    const [, , x, y] = place(A, s, a, 0, axisH(A, s, endH));
    const surge = Math.sin(q.ts * TAU * 6 + sd);
    sq(c, x, y, n >= 3 && s < 0.2 ? 2 : 1, surge > 0.5 ? COLD[0] : s < 0.25 ? COLD[1] : COLD[2]);
  }
  // a frost ring pulsing off the staff, at five
  if (n >= 5) for (const q of emit(t, 3.2, 0.5, (i, age, ts) => (live(ts) ? { i, age } : null))) {
    const r = 3 + q.age * 13;
    X.ring(c, now.x, now.y, r, r * 0.72, q.age < 0.4 ? COLD[0] : COLD[2], 0.9 * (1 - q.age));
  }
  X.glow(c, now.x, now.y, 4 + n * 1.3, COLD[1], 0.75);
  sq(c, now.x, now.y, n >= 3 ? 3 : 2, COLD[0]);
}

/**
 * A short history of a spray's aim, so each particle can fly along the aim it was born with. The view records one
 * per frame per spray; a new channel (or time running backwards: a scene restart) clears it.
 */
export class AimTrail {
  private ts: number[] = []; private a: Aim[] = []; private t0 = NaN;
  record(t: number, t0: number, a: Aim): void {
    if (t0 !== this.t0 && Math.abs(t0 - this.t0) > 0.05) { this.ts.length = 0; this.a.length = 0; this.t0 = t0; }
    const last = this.ts.length ? this.ts[this.ts.length - 1] : -Infinity;
    if (t < last) { this.ts.length = 0; this.a.length = 0; }
    else if (t === last) { this.a[this.a.length - 1] = a; return; }
    this.ts.push(t); this.a.push(a);
    let cut = 0;
    while (cut < this.ts.length - 2 && this.ts[cut + 1] < t - 1.6) cut++;
    if (cut > 64) { this.ts.splice(0, cut); this.a.splice(0, cut); }
  }
  /** The aim at ts, between the two nearest records (the oldest one before them, the newest after). */
  at = (ts: number): Aim => {
    const T = this.ts, n = T.length;
    if (!n) return { x: 0, y: 0, ground: 0, ex: 0, ey: 0 };
    if (ts <= T[0]) return this.a[0];
    if (ts >= T[n - 1]) return this.a[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= ts) lo = mid; else hi = mid; }
    const k = (ts - T[lo]) / (T[hi] - T[lo] || 1), A = this.a[lo], B = this.a[hi];
    return { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), ground: lerp(A.ground, B.ground, k), ex: lerp(A.ex, B.ex, k), ey: lerp(A.ey, B.ey, k) };
  };
}
