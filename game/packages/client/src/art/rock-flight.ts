/**
 * The Earth form's missiles in flight, one look per carried element (the user, 2026-11-10/11: the fireball's ball and
 * stiff tail, the heal-stone's tail snapping at its midpoint, the frost rock a smooth marble that also stood for ice,
 * the arcane rock not magical). Each trail is particles left where the missile passed, so they hang in the air and
 * live out their own lives instead of being dragged along behind it.
 *
 * A missile flies straight (the lobbed heal-stone along its arc), so where it was at time ts is a pure function of
 * now, its screen velocity and ts: `back(ts)` px behind it along its line. Pure in time and seed, like the other effects.
 */
import * as X from './px';
import type { Ctx, Pt } from './px';
import { puff, rock, ROCK_MAT, shard, sq } from './kit';
import { FY, TAU, clamp, emit, rand } from './util';

export interface Flight {
  /** Where it is on screen (at its flying height) and the ground under it. */
  x: number; y: number; yg: number;
  /** Its direction on screen, and its speed on screen in px a second. */
  ux: number; uy: number; v: number;
  /** Its radius, px. */
  r: number;
  /** When it was thrown. */
  born: number;
  seed: number;
}

const HEAT = ['#fffbe8', '#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#d8401c', '#9a2a1c'];
const heatCol = (h: number): string => HEAT[clamp(Math.floor(h * HEAT.length), 0, HEAT.length - 1)];
const COLD = ['#ffffff', '#e0ffff', '#9ff4ff', '#4ad0f4', '#2080c8', '#163e7a'];
const ARC = ['#ffffff', '#ffc0e0', '#ff6ab0', '#ff2d8a', '#a01e6a', '#4a1450'];
const LIFE = ['#ffffff', '#f2ffe8', '#c8fab0', '#8ef07e', '#46c450', '#1e7a34'];

/** A filled pixel disc. */
function disc(c: Ctx, x: number, y: number, r: number, col: string): void {
  if (r < 0.9) { X.px(c, x, y, col); return; }
  const cx = Math.round(x), cy = Math.round(y), R = Math.round(r);
  for (let dy = -R; dy <= R; dy++) { const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35); X.rect(c, cx - hw, cy + dy, hw * 2 + 1, 1, col); }
}

/** Particles left along the flight: `rate` a second, each living `life` s, handed where the missile was when it left them. */
function trail<T>(f: Flight, t: number, rate: number, life: number, fn: (i: number, age: number, px: number, py: number, pyg: number) => T | null): T[] {
  return emit(t, rate, life, (i, age, ts) => {
    const back = (t - ts) * f.v;
    return fn(i, age, f.x - f.ux * back, f.y - f.uy * back, f.yg - f.uy * back);
  }, f.born, t);
}

// ---- Earth + Fire: a meteor -------------------------------------------------------------------------
/** A molten core wrapped in churning flame; behind it, flames that hang where it passed, rise and cool, then smoke. */
export function meteor(c: Ctx, f: Flight, t: number): void {
  const { x, y, ux, uy, r } = f, sd = f.seed;
  // smoke, behind everything
  for (const p of trail(f, t, 26, 0.9, (i, age, px, py) => (age < 0.15 ? null : { x: px + (rand(i, 2, sd) - 0.5) * r + age * 3, y: py - age * 16, age, i }))) puff(c, p.x, p.y, 1.4 + p.age * (2 + r * 0.4), p.age < 0.5 ? '#4e4648' : '#6a6466', (1 - p.age) * 0.75);
  // flames left behind: born white-hot at the ball's edge, swelling, rising, cooling, smeared back along the flight
  type Fl = { x: number; y: number; r: number; heat: number };
  const fl: Fl[] = trail(f, t, 150, 0.34, (i, age, px, py) => {
    const side = (rand(i, 4, sd) - 0.5) * r * (1.2 + age * 3.2), up = age * (9 + 9 * rand(i, 5, sd));
    const sw = Math.sin(age * 9 + i) * 1.5 * age;
    return { x: px - uy * side + sw, y: py + ux * side * FY - up, r: (0.6 + r * 0.32) * (1 + age * 1.2) * (age > 0.7 ? 1 - (age - 0.7) * 2.6 : 1), heat: age * (0.9 + 0.3 * rand(i, 6, sd)) };
  });
  fl.sort((a, b) => b.heat - a.heat);
  for (const p of fl) {
    if (p.r < 0.5) continue;
    const col = heatCol(p.heat);
    if (p.r >= 1.5) { X.ellipse(c, p.x + ux * p.r * 0.5, p.y + uy * p.r * 0.5, p.r, p.r * 0.85, col, 0.5); disc(c, p.x, p.y, p.r * 0.7, col); } else disc(c, p.x, p.y, p.r, col);
  }
  // embers flung off
  for (const p of trail(f, t, 24, 0.6, (i, age, px, py) => { const a = rand(i, 7, sd) * TAU, sp = 8 + rand(i, 8, sd) * 12; return { x: px + Math.cos(a) * sp * age, y: py + Math.sin(a) * sp * age * 0.7 + age * age * 14, age, i }; }))
    if ((p.i + Math.floor(t * 20)) % 4) X.px(c, p.x, p.y, p.age < 0.4 ? HEAT[1] : HEAT[3]);
  // the ball: a glow, licks of flame churning round it (each a soft blob on its own little orbit), a molten core
  X.glow(c, x, y, r + 7, HEAT[3], 0.55);
  for (let k = 0; k < 7; k++) {
    const a = t * (9 + k) + k * 2.1, rr = r * (0.55 + 0.25 * Math.sin(t * 13 + k * 1.7));
    const bx = x + Math.cos(a) * rr - ux * r * 0.35, by = y + Math.sin(a) * rr * 0.8 - uy * r * 0.35 - 0.5;
    disc(c, bx, by, r * 0.45, k % 3 === 0 ? HEAT[4] : HEAT[3]);
  }
  disc(c, x, y, r * 0.72, HEAT[2]);
  disc(c, x + ux * r * 0.15, y + uy * r * 0.15 - 0.5, r * 0.45, HEAT[1]);
  sq(c, x + ux * r * 0.25, y + uy * r * 0.25 - 1, 2, HEAT[0]);
}

// ---- Earth + Cold: a snowball comet -----------------------------------------------------------------
/** A fuzzy ball of packed snow and frost with a comet's tail of snow puffs and flakes hanging where it passed. */
export function snowball(c: Ctx, f: Flight, t: number): void {
  const { x, y, r } = f, sd = f.seed, tw = Math.floor(t * 20);
  // the tail: soft cold puffs, hanging and spreading as they fade
  for (const p of trail(f, t, 70, 0.42, (i, age, px, py) => ({ x: px + (rand(i, 11, sd) - 0.5) * r * (0.8 + age * 1.6), y: py + (rand(i, 12, sd) - 0.5) * r * 0.9 + age * 3, age })))
    X.glow(c, p.x, p.y, (r * 0.55 + 1) * (1 + p.age * 1.4), p.age < 0.35 ? '#e8fbff' : '#a8d8ec', 0.85 * (1 - p.age));
  // flakes falling out of the tail, twinkling
  for (const p of trail(f, t, 50, 0.7, (i, age, px, py) => ({ x: px + (rand(i, 13, sd) - 0.5) * r * 2 + Math.sin(age * 8 + i) * 1.5, y: py + (rand(i, 14, sd) - 0.5) * r + age * age * 10, age, i })))
    X.px(c, p.x, p.y, (p.i + tw) % 4 === 0 ? COLD[0] : p.age < 0.5 ? COLD[1] : COLD[3]);
  // the ball: a frosty halo, a packed core shaded down and right, a fuzzy rim that never sits still
  X.glow(c, x, y, r + 4, '#dffaff', 0.7);
  disc(c, x, y, r * 0.85, '#bfe6f2');
  disc(c, x - r * 0.15, y - r * 0.18, r * 0.66, '#f4fdff');
  X.px(c, x - r * 0.35, y - r * 0.4, '#ffffff');
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU + rand(k, tw, sd) * 0.4, rr = r * (0.8 + 0.45 * rand(k, tw + 1, sd));
    X.px(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9, k % 3 ? '#e8fbff' : COLD[2]);
  }
}

// ---- Earth + Water + Cold: a cluster of ice shards --------------------------------------------------
/** Three shards flying point first in a tight bunch, turning a little against each other, shedding glitter. */
export function iceCluster(c: Ctx, f: Flight, t: number): void {
  const { x, y, ux, uy, r } = f, sd = f.seed, ang = Math.atan2(uy, ux), tw = Math.floor(t * 20);
  for (const p of trail(f, t, 60, 0.45, (i, age, px, py) => ({ x: px + (rand(i, 21, sd) - 0.5) * r * 1.4, y: py + (rand(i, 22, sd) - 0.5) * r + age * age * 8, age, i })))
    X.px(c, p.x, p.y, (p.i + tw) % 3 === 0 ? '#ffffff' : p.age < 0.5 ? COLD[2] : COLD[3]);
  X.glow(c, x, y, r + 3, COLD[2], 0.4);
  const L = 8 + r * 1.4, nx = -uy, ny = ux;
  const parts: [number, number, number, number][] = [ // back, across, length, turn
    [r * 0.9, -r * 0.8, L * 0.7, -0.22 + 0.05 * Math.sin(t * 7 + sd)],
    [r * 0.8, r * 0.85, L * 0.75, 0.2 + 0.05 * Math.sin(t * 6 + sd * 2)],
    [0, 0, L, 0.03 * Math.sin(t * 9)],
  ];
  for (const [b, a, len, turn] of parts) shard(c, x - ux * b + nx * a, y - uy * b + ny * a * FY, ang + turn, len, sd + Math.round(a * 7), 1, COLD);
}

// ---- Earth + Arcane: a charged stone ----------------------------------------------------------------
/** A stone carved with a glowing rune, wrapped in a pulsing magenta aura, three motes on orbit, sparkles behind. */
export function arcaneOrb(c: Ctx, f: Flight, t: number, spin: number): void {
  const { x, y, r } = f, sd = f.seed, tw = Math.floor(t * 20), pulse = 0.5 + 0.5 * Math.sin(t * 14 + sd);
  for (const p of trail(f, t, 70, 0.55, (i, age, px, py) => {
    const a = rand(i, 31, sd) * TAU, sp = 3 + rand(i, 32, sd) * 7;
    return { x: px + Math.cos(a) * sp * age + (rand(i, 33, sd) - 0.5) * r, y: py + Math.sin(a) * sp * age * 0.8 + (rand(i, 34, sd) - 0.5) * r * 0.8, age, i };
  })) {
    if ((p.i + tw) % 5 === 0) continue;
    const col = p.age < 0.25 ? ARC[0] : p.age < 0.6 ? ARC[2] : ARC[4];
    X.px(c, p.x, p.y, col);
    if (p.i % 7 === 0 && p.age < 0.5) { X.px(c, p.x - 1, p.y, ARC[3]); X.px(c, p.x + 1, p.y, ARC[3]); X.px(c, p.x, p.y - 1, ARC[3]); X.px(c, p.x, p.y + 1, ARC[3]); }
  }
  const motes = [0, 1, 2].map((k) => { const a = t * 8 + (k * TAU) / 3; return { x: x + Math.cos(a) * (r + 4), y: y + Math.sin(a) * (r + 4) * 0.45, front: Math.sin(a) > 0 }; });
  for (const m of motes) if (!m.front) { X.px(c, m.x, m.y, ARC[2]); }
  // a shell of arcane light round the stone: a dithered haze, then solid layers brightening inward
  const sh = r + 1.5 + pulse * 1.5;
  X.ellipse(c, x, y, sh + 4, (sh + 4) * 0.9, ARC[4], 0.5);
  X.ellipse(c, x, y, sh + 1.5, (sh + 1.5) * 0.9, ARC[3]);
  X.ellipse(c, x - 0.5, y - 0.5, sh, sh * 0.9, ARC[2]);
  rock(c, x, y, r * 0.75, sd, ROCK_MAT.arcane, spin);
  X.ring(c, x, y, r + 1 + pulse * 2, (r + 1 + pulse * 2) * 0.85, pulse > 0.5 ? ARC[0] : ARC[1], 0.7);
  // the rune: a bright cross turning with the stone, its arms flaring with the pulse
  const cs = Math.cos(spin), sn = Math.sin(spin), arm = r * 0.5;
  for (const [u, v] of [[cs, sn], [-sn, cs]] as Pt[]) X.line(c, x - u * arm, y - v * arm * 0.85, x + u * arm, y + v * arm * 0.85, pulse > 0.5 ? ARC[0] : ARC[1]);
  X.px(c, x, y, '#ffffff');
  for (const m of motes) if (m.front) { sq(c, m.x, m.y, 2, ARC[1]); X.px(c, m.x, m.y, '#ffffff'); }
}

// ---- Life + Earth: a seed of light (the lobbed heal-stone) ------------------------------------------
/** A green seed of light, leaves turning round it, a trail of motes hanging along its arc and drifting down. */
export function lifeSeed(c: Ctx, f: Flight, t: number, at: (ts: number) => [number, number] | null): void {
  const { x, y } = f, sd = f.seed, tw = Math.floor(t * 16);
  for (const p of emit(t, 60, 0.7, (i, age, ts) => {
    const q = at(ts);
    if (!q) return null;
    return { x: q[0] + (rand(i, 41, sd) - 0.5) * 5 + Math.sin(age * 6 + i) * 1.5, y: q[1] + (rand(i, 42, sd) - 0.5) * 4 + age * 8, age, i };
  }, f.born, t)) {
    const col = (p.i + tw) % 6 === 0 ? '#ffffff' : p.age < 0.3 ? LIFE[2] : p.age < 0.65 ? LIFE[3] : LIFE[4];
    if (p.i % 5 === 0 && p.age < 0.6) X.rect(c, p.x, p.y, 2, 1, LIFE[3]); else X.px(c, p.x, p.y, col);
  }
  X.glow(c, x, y, 10, LIFE[4], 0.55);
  X.glow(c, x, y, 6, LIFE[3], 0.85);
  for (let k = 0; k < 3; k++) {
    const a = t * 6 + (k * TAU) / 3, lx = x + Math.cos(a) * 5.5, ly = y + Math.sin(a) * 3;
    X.rect(c, lx - 1, ly, 2, 1, LIFE[4]); X.px(c, lx, ly - 1, LIFE[3]);
  }
  disc(c, x, y, 2.6, LIFE[2]);
  disc(c, x - 0.5, y - 0.5, 1.5, LIFE[1]);
  X.px(c, x - 1, y - 1, '#ffffff');
}

/** Earth + Arcane landing: a flash, two rings racing out, sparks flung and slowing, a rune burned on the floor. */
export function arcaneBurst(o: Ctx, g: Ctx, x: number, y: number, iy: number, e: number, s: number, sd: number): void {
  if (e < 0.07) { X.ellipse(o, x, iy, 12 * s, 10 * s, '#ffffff'); return; }
  if (e < 0.4) { const q = e / 0.4; X.glow(o, x, iy, 20 * s * (0.6 + 0.4 * q), ARC[3], 0.9 * (1 - q)); X.glow(o, x, iy, 10 * s * (1 - q), ARC[1], 0.9 * (1 - q)); }
  for (const [d, w] of [[0, 2], [0.08, 1]] as const) {
    const q = (e - d) / 0.42;
    if (q <= 0 || q >= 1) continue;
    const rr = 4 + (1 - (1 - q) * (1 - q)) * 30 * s;
    for (let k = 0; k < w; k++) X.ring(o, x, y, rr - k, (rr - k) * FY, q < 0.4 ? ARC[0] : ARC[2], 1 - q);
  }
  if (e < 0.8) for (let k = 0; k < 26; k++) {
    const a = rand(k, 51, sd) * TAU, sp = (30 + rand(k, 52, sd) * 40) * s, d = sp * (1 - Math.exp(-e * 5)) / 5;
    const px = x + Math.cos(a) * d, py = iy + Math.sin(a) * d * 0.7 - 6 * Math.sin(Math.min(1, e * 2) * Math.PI);
    if ((k + Math.floor(e * 30)) % 4 === 0) continue;
    X.px(o, px, py, e < 0.3 ? ARC[0] : k % 2 ? ARC[2] : ARC[1]);
  }
  // a rune on the floor where it struck, fading
  const fade = 1 - clamp((e - 0.2) / 1.0, 0, 1);
  if (fade > 0) for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + sd; X.line(g, x, y, x + Math.cos(a) * 9 * s, y + Math.sin(a) * 9 * s * FY, fade > 0.5 ? ARC[2] : ARC[4]); }
  if (fade > 0) X.ring(g, x, y, 9 * s, 9 * s * FY, ARC[3], fade);
}
