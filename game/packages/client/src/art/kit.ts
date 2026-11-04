/**
 * The effects kit, ported from tools/spell-vfx/fx.js (and the helpers it took from the
 * Battlefield's render.js): flame tongues, puffs, jagged bolts, beams, sprays, rings,
 * shards, the fireball, the plasma arc, healing sparkles. All coordinates are art pixels in
 * one of the field canvases; heights are screen pixels up. Every function is pure in
 * (time, seed), so a frame is reproducible.
 */
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import { FY, TAU, easeOut, emit, lerp, mod, rand, seg, smooth } from './util';

const EL = X.EL;
export const fireCol = (age: number): string => EL.fire[age < 0.18 ? 0 : age < 0.38 ? 1 : age < 0.6 ? 2 : age < 0.8 ? 3 : 4];
export function sq(c: Ctx, x: number, y: number, s: number, col: string): void { const k = Math.max(1, Math.round(s)); X.rect(c, Math.round(x) - (k >> 1), Math.round(y) - (k >> 1), k, k, col); }

/** A pixel flame tongue: stacked rows, outer red -> core yellow. */
export function tongue(c: Ctx, x: number, y: number, w: number, h: number, sway: number, R: Ramp = EL.fire): void {
  for (let r = 0; r < h; r++) {
    const k = r / h, hw = w * (1 - k) * (k < 0.25 ? 0.7 + k * 1.2 : 1), xx = x + sway * k * k;
    if (hw < 0.3) { X.px(c, xx, y - r, R[3]); continue; }
    X.rect(c, Math.round(xx - hw), Math.round(y - r), Math.max(1, Math.round(hw * 2)), 1, R[4]);
    if (hw > 1) X.rect(c, Math.round(xx - hw * 0.62), Math.round(y - r), Math.max(1, Math.round(hw * 1.24)), 1, k < 0.55 ? R[2] : R[3]);
    if (hw > 1.6 && k < 0.5) X.rect(c, Math.round(xx - hw * 0.28), Math.round(y - r), Math.max(1, Math.round(hw * 0.56)), 1, R[1]);
  }
}
/** Smoke / dust / steam puff with stepped dither: solid, then a 50% checker, then gone. */
export function puff(c: Ctx, x: number, y: number, r: number, col: string, a: number): void {
  if (a < 0.28) return;
  const rr = a < 0.55 ? r * 0.8 : r;
  X.ellipse(c, x, y, rr, rr * 0.85, col, a < 0.55 ? 0.5 : 1);
}
/** Jagged lightning between two points (midpoint displacement, seeded). */
export function bolt(a: Pt, z: Pt, seed: number, rough = 0.28, depth = 4): Pt[] {
  let pts: Pt[] = [a, z];
  for (let d = 0; d < depth; d++) {
    const nx: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const off = (rand(seed, d * 64 + i, 7) - 0.5) * L * rough;
      nx.push([(p[0] + q[0]) / 2 - ((q[1] - p[1]) / L) * off, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / L) * off], q);
    }
    pts = nx;
  }
  return pts;
}
/** Ground ellipse ring, optionally thick (rings inward), dithered by alpha. */
export function gring(c: Ctx, x: number, y: number, r: number, col: string, a = 1, thick = 1): void { for (let k = 0; k < thick; k++) if (r - k > 0.5) X.ring(c, x, y, r - k, (r - k) * FY, col, a); }
/** A soft blob on the ground: puddles, floods, ice sheets, patches. */
export function blobPts(x: number, y: number, rx: number, ry: number, seed = 0, n = 28): Pt[] {
  const p: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 + Math.sin(a * 3 + seed) * 0.1 + Math.sin(a * 5 + seed * 2) * 0.07; p.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]); }
  return p;
}

// ---------------------------------------------------------------------------
/** Sparks thrown back from an impact point, centred on angle ang. */
export function splash(c: Ctx, z: Pt, t: number, R: Ramp, Q: Ramp, ang: number, rate = 30, spread = 2.6, seed = 0): void {
  X.glow(c, z[0], z[1], 9, R[2], 0.7); if (Q !== R) X.glow(c, z[0], z[1], 6, Q[2], 0.6);
  sq(c, z[0], z[1], 3 + (Math.floor(t * 20) % 2) * 2, '#ffffff');
  for (const p of emit(t, rate, 0.35, (i, age) => { const a2 = ang + (rand(i, 21, seed) - 0.5) * spread, v = 16 + rand(i, 22, seed) * 18; return { x: z[0] + Math.cos(a2) * v * age, y: z[1] + Math.sin(a2) * v * age + age * age * 12, age, r: rand(i, 23, seed) }; }))
    X.px(c, p.x, p.y, p.r < 0.5 ? Q[p.age < 0.4 ? 1 : 2] : p.age < 0.5 ? '#ffffff' : R[2]);
}
/** A beam: a thick core in the look's ramp, an optional strand twisting round it; on = 0..1 how far it reached. */
export function beam(c: Ctx, o: Pt, z: Pt, t: number, R: Ramp, opt: { on?: number; w?: number; strand?: Ramp; hit?: boolean; seed?: number } = {}): void {
  const on = opt.on ?? 1, w = opt.w ?? 1;
  const dx = z[0] - o[0], dy = z[1] - o[1], Lb = Math.hypot(dx, dy) || 1, ux = dx / Lb, uy = dy / Lb, nx = -uy, ny = ux, len = Lb * on;
  if (len < 1) return;
  const n = Math.max(6, Math.round(len / 2)), core: Pt[] = [], strand: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, d = k * len, en = Math.min(1, k * 6) * Math.min(1, (1 - k) * 8 + 0.3), j = Math.sin(d * 0.45 - t * 38) * 0.7 * en;
    core.push([o[0] + ux * d + nx * j, o[1] + uy * d + ny * j]);
    const th = d * 0.16 - t * 16;
    strand.push({ x: o[0] + ux * d + nx * Math.sin(th) * 3.4 * en * w, y: o[1] + uy * d + ny * Math.sin(th) * 3.4 * en * w, z: Math.cos(th) });
  }
  const P = opt.strand;
  const sp = (front: boolean, col: string, ww: number) => { for (let i = 1; i < strand.length; i++) { const p = strand[i - 1], q = strand[i]; if ((p.z + q.z > 0) === front) X.line(c, p.x, p.y, q.x, q.y, col, ww); } };
  if (P) sp(false, P[4] ?? P[3], 2);
  X.lines(c, core, R[4] ?? R[3], Math.round(5 * w)); X.lines(c, core, R[3], Math.max(1, Math.round(3 * w))); X.lines(c, core, R[1], 1);
  for (let i = 1; i < core.length; i++) if ((i + Math.floor(t * 30)) % 5 === 0) X.px(c, core[i][0], core[i][1], '#ffffff');
  if (P) { sp(true, P[2], 2); sp(true, P[1], 1); }
  X.glow(c, o[0], o[1], 6 * w + 1, R[2], 0.85); sq(c, o[0], o[1], 3, R[1]);
  if (on > 0.95 && opt.hit !== false) splash(c, z, t, R, P ?? R, Math.atan2(-uy, -ux), 30, 2.6, opt.seed ?? 0);
}
/**
 * The fire beam (Battlefield pass 4: arcane carrying fire reads as a FIRE beam): a white-hot
 * core, orange body, ragged red rim, flame licks peeling off its top edge, embers falling.
 */
export function fireBeam(c: Ctx, o: Pt, z: Pt, t: number, hit: boolean): void {
  const dx = z[0] - o[0], dy = z[1] - o[1], Lb = Math.hypot(dx, dy) || 1, ux = dx / Lb, uy = dy / Lb, nx = -uy, ny = ux, len = Lb;
  const n = Math.max(8, Math.round(len / 2)), core: [number, number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, d = k * len, env = Math.min(1, k * 6) * Math.min(1, (1 - k) * 8 + 0.3);
    const j = (Math.sin(d * 0.35 - t * 30) * 0.6 + Math.sin(d * 0.9 + t * 21) * 0.3) * env;
    core.push([o[0] + ux * d + nx * j, o[1] + uy * d + ny * j, d, env]);
  }
  const width = (q: (typeof core)[number]) => Math.round(5 + (0.5 + 0.5 * Math.sin(q[2] * 0.28 - t * 26)) * 2 * q[3]);
  for (let i = 1; i < core.length; i++) X.line(c, core[i - 1][0], core[i - 1][1], core[i][0], core[i][1], EL.fire[5], width(core[i]) + 2);
  for (let i = 1; i < core.length; i++) X.line(c, core[i - 1][0], core[i - 1][1], core[i][0], core[i][1], EL.fire[4], width(core[i]));
  const pts: Pt[] = core.map((q) => [q[0], q[1]]);
  X.lines(c, pts, EL.fire[3], 4); X.lines(c, pts, EL.fire[2], 2); X.lines(c, pts, EL.fire[1], 1);
  for (let i = 1; i < core.length; i++) if ((i + Math.floor(t * 30)) % 4 === 0) X.px(c, core[i][0], core[i][1], (i + Math.floor(t * 30)) % 8 ? EL.fire[0] : '#ffffff');
  const NL = Math.max(4, Math.round(len / 9));
  for (let k = 0; k < NL; k++) {
    const p = mod(t * 0.9 + k / NL + rand(k, 31) * 0.05, 1), d = p * Lb; if (d > len - 3 || d < 4) continue;
    const env = Math.min(1, p * 6) * Math.min(1, (1 - p) * 5);
    const bx = o[0] + ux * d, by = o[1] + uy * d - 2;
    const life = mod(t * 3.1 + rand(k, 32), 1), h = (3 + rand(k, 33) * 4) * Math.sin(life * Math.PI) * env;
    if (h > 1) tongue(c, bx, by, 1.3 + rand(k, 34) * 0.8, h, -ux * 2 + Math.sin(t * 9 + k) * 1.2);
    if (rand(k, Math.floor(t * 10), 35) < 0.3) X.px(c, bx + (rand(k, 36) - 0.5) * 3, by + 5, EL.fire[3]);
  }
  for (const p of emit(t, 26, 0.6, (i, age) => { const d = rand(i, 37) * len; return { x: o[0] + ux * d + (rand(i, 38) - 0.5) * 4, y: o[1] + uy * d + 2 + age * 8, age }; })) X.px(c, p.x, p.y, fireCol(0.3 + p.age * 0.7));
  if (hit) {
    X.glow(c, z[0], z[1], 12, EL.fire[3], 0.8); X.glow(c, z[0], z[1], 8, EL.fire[1], 0.7);
    sq(c, z[0], z[1], 3 + (Math.floor(t * 20) % 2) * 2, '#fff4c0');
    for (const p of emit(t, 40, 0.35, (i, age) => { const a2 = Math.atan2(-uy, -ux) + (rand(i, 21) - 0.5) * 2.6, sp = 18 + rand(i, 22) * 20; return { x: z[0] + Math.cos(a2) * sp * age, y: z[1] + Math.sin(a2) * sp * age - age * 10, age, r: rand(i, 23) }; })) sq(c, p.x, p.y, p.r < 0.3 && p.age < 0.4 ? 2 : 1, fireCol(p.age));
    for (let k = 0; k < 3; k++) tongue(c, z[0] + (k - 1) * 3, z[1] + 2, 2, 6 + 3 * Math.sin(t * 15 + k * 2), Math.sin(t * 8 + k) * 2);
  }
  X.glow(c, o[0], o[1], 7, EL.fire[2], 0.85); sq(c, o[0], o[1], 3, EL.fire[1]); X.px(c, o[0], o[1], '#ffffff');
}

// ---------------------------------------------------------------------------
export type ConeKind = 'water' | 'fire' | 'cold' | 'scald' | 'freeze';
/** A spray cone (Force with water, fire or cold). o = staff tip, z = where it reaches; t0 = when it started. */
export function cone(c: Ctx, o: Pt, z: Pt, t: number, kind: ConeKind, t0: number, opt: { spread?: number; power?: number; seed?: number } = {}): void {
  const dx = z[0] - o[0], dy = z[1] - o[1], Lz = Math.hypot(dx, dy) || 1, ux = dx / Lz, uy = dy / Lz;
  const spread = opt.spread ?? 0.28, on = seg(t, t0, t0 + 0.12), k = opt.power ?? 1, sd = opt.seed ?? 0;
  const dir = (i: number, s1: number): [number, number] => { const ang = (rand(i, s1, sd) - 0.5) * 2 * spread, cs = Math.cos(ang), sn = Math.sin(ang); return [ux * cs - uy * sn, ux * sn + uy * cs]; };
  const live = (ts: number) => ts >= t0;
  // the body of the spray: a solid jet near the nozzle that breaks up with distance
  const Rj: Ramp = kind === 'fire' ? EL.fire : kind === 'cold' ? EL.cold : kind === 'scald' ? ['#fff4e8', '#ffd8b8', '#8ad0ff', '#3a98ff', '#1a5ec0'] : EL.water;
  const jl = Lz * (kind === 'fire' ? 0.5 : 0.62) * on, nj = Math.max(4, Math.round(jl / 2));
  for (let w = 0; w < 3; w++) {
    const pts: Pt[] = [];
    for (let i = 0; i <= nj; i++) { const d = (i / nj) * jl, j = Math.sin(d * 0.5 - t * 30 + w * 2) * (0.4 + (d / (jl || 1)) * 1.6); pts.push([o[0] + ux * d - uy * j * (w - 1) * 1.5, o[1] + uy * d + ux * j * (w - 1) * 1.5]); }
    for (let i = 1; i < pts.length; i++) { const k2 = i / pts.length; if (k2 > 0.55 && (i + Math.floor(t * 24) + w) % 3 === 0) continue; X.line(c, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w === 1 ? (k2 < 0.4 ? Rj[0] : Rj[1]) : Rj[2], w === 1 && k2 < 0.6 ? 2 : 1); }
  }
  if (kind === 'water' || kind === 'scald' || kind === 'freeze') {
    const R = EL.water;
    for (const p of emit(t, 200 * k, 0.42, (i, age, ts) => {
      if (!live(ts)) return null;
      const [vx, vy] = dir(i, 1), d = age * Lz * (0.9 + rand(i, 2, sd) * 0.25);
      return { x: o[0] + vx * d, y: o[1] + vy * d - Math.sin(age * Math.PI) * 5 + age * age * 4, age, r: rand(i, 3, sd) };
    })) {
      let col = p.r > 0.5 ? R[2] : R[1];
      if (kind === 'scald') col = p.r > 0.7 ? '#ffe6c8' : p.r > 0.35 ? R[1] : '#ffb890';
      if (kind === 'freeze' && p.age > 0.55) col = p.r > 0.5 ? EL.cold[1] : '#ffffff';
      sq(c, p.x, p.y, p.age < 0.5 && p.r > 0.6 ? 2 : 1, col);
    }
    if (kind === 'scald') for (const p of emit(t, 26 * k, 1.1, (i, age, ts) => {
      if (!live(ts)) return null;
      const f = 0.25 + rand(i, 41, sd) * 0.8, d = f * Lz;
      return { x: o[0] + ux * d + (rand(i, 42, sd) - 0.5) * 10 * f + age * 4, y: o[1] + uy * d - age * 16, age, r: 1.5 + f * 2 + age * 4 };
    })) puff(c, p.x, p.y, p.r, p.age < 0.25 ? EL.steam[1] : p.age < 0.6 ? EL.steam[2] : '#9aa2b8', (1 - p.age) * 0.85);
    X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 6, kind === 'scald' ? '#ffd8b0' : R[1], 0.7 * on);
  } else if (kind === 'fire') {
    // fine flame particles: mostly single pixels, a few 2 px licks in the hot middle
    for (const p of emit(t, 380 * k, 0.5, (i, age, ts) => {
      if (!live(ts)) return null;
      const [vx, vy] = dir(i, 11), d = easeOut(age) * Lz * (0.8 + rand(i, 12, sd) * 0.3), sw = Math.sin(age * 9 + i) * 1.6;
      return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw - age * age * 7, age, r: rand(i, 13, sd) };
    })) { const col = fireCol(p.age * (0.85 + p.r * 0.3)); if (p.r > 0.78 && p.age > 0.12 && p.age < 0.6) X.rect(c, p.x, p.y - 1, 1, 2, col); else X.px(c, p.x, p.y, col); }
    for (const p of emit(t, 16 * k, 0.9, (i, age, ts) => { if (!live(ts)) return null; const d = Lz * (0.7 + rand(i, 14, sd) * 0.4); return { x: o[0] + ux * d + (rand(i, 15, sd) - 0.5) * 10 + age * 4, y: o[1] + uy * d - 4 - age * 18, age }; })) puff(c, p.x, p.y, 1.5 + p.age * 3, '#3a3448', (1 - p.age) * 0.7);
    X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 7, EL.fire[1], 0.8 * on);
  } else {
    // organic frost: curling wisps of cold mist, a haze of crystal glitter, a soft billow
    for (const p of emit(t, 26 * k, 0.75, (i, age, ts) => { if (!live(ts)) return null; const [vx, vy] = dir(i, 11); return { vx, vy, cu: (rand(i, 16, sd) - 0.5) * 2, age, i }; })) {
      const n = 7;
      for (let j = 0; j < n; j++) {
        const a2 = Math.max(0, p.age - j * 0.035), d = easeOut(a2) * Lz * (0.85 + rand(p.i, 12, sd) * 0.3), sw = Math.sin(a2 * 7 + p.i) * (2 + a2 * 5) * p.cu;
        const x = o[0] + p.vx * d - p.vy * sw, y = o[1] + p.vy * d + p.vx * sw - a2 * 3;
        const fade = (1 - p.age) * (1 - j / n);
        if (fade < 0.15 || fade < X.bay(Math.round(x), Math.round(y)) * 0.8) continue;
        X.px(c, x, y, a2 < 0.3 ? EL.cold[1] : a2 < 0.6 ? EL.cold[2] : '#bfe8f4');
      }
    }
    for (const p of emit(t, 150 * k, 0.65, (i, age, ts) => {
      if (!live(ts)) return null;
      const [vx, vy] = dir(i, 11), d = easeOut(age) * Lz * (0.75 + rand(i, 12, sd) * 0.45), sw = Math.sin(age * 6 + i) * 2.5;
      return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw + age * age * 3, age, r: rand(i, 13, sd) };
    })) { const tw = (Math.floor(t * 20) + ((p.r * 97) | 0)) % 4 === 0; X.px(c, p.x, p.y, tw || p.r > 0.85 ? '#ffffff' : p.age < 0.5 ? EL.cold[1] : EL.cold[3]); }
    for (const p of emit(t, 16 * k, 1.0, (i, age, ts) => { if (!live(ts)) return null; const d = (0.45 + easeOut(age) * 0.65) * Lz; return { x: o[0] + ux * d + (rand(i, 14, sd) - 0.5) * 12 * age, y: o[1] + uy * d + (rand(i, 15, sd) - 0.5) * 9 * age - age * 2, age }; })) X.glow(c, p.x, p.y, 3 + p.age * 7, '#dffaff', 0.38 * (1 - p.age));
    X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 6, EL.cold[1], 0.75 * on);
  }
}
/** The healing spray (Life + Fire): a cone of warm light, not burning particles. */
export function warmCone(c: Ctx, o: Pt, z: Pt, t: number, t0: number, R: Ramp = X.WARM, seed = 0): void {
  const dx = z[0] - o[0], dy = z[1] - o[1], Lz = Math.hypot(dx, dy) || 1, ux = dx / Lz, uy = dy / Lz;
  const on = seg(t, t0, t0 + 0.12), spread = 0.42;
  for (let w = 0; w < 3; w++) {
    const jl = Lz * 0.45 * on, n = Math.max(4, Math.round(jl / 2)), pts: Pt[] = [];
    for (let i = 0; i <= n; i++) { const d = (i / n) * jl, j = Math.sin(d * 0.5 - t * 26 + w * 2) * (0.4 + (d / (jl || 1)) * 1.4); pts.push([o[0] + ux * d - uy * j * (w - 1) * 1.6, o[1] + uy * d + ux * j * (w - 1) * 1.6]); }
    X.lines(c, pts, w === 1 ? R[1] : R[3], w === 1 ? 2 : 1);
  }
  for (let k = 1; k <= 5; k++) { const d = (Lz * k) / 5.5; if (on > 0.1) X.glow(c, o[0] + ux * d, o[1] + uy * d, 3 + k * 3.2, k < 3 ? R[2] : R[3], 0.5 * on); }
  for (const p of emit(t, 420, 0.55, (i, age, ts) => {
    if (ts < t0) return null;
    const ang = (rand(i, 11, seed) - 0.5) * 2 * spread, cs = Math.cos(ang), sn = Math.sin(ang), vx = ux * cs - uy * sn, vy = ux * sn + uy * cs;
    const d = easeOut(age) * Lz * (0.8 + rand(i, 12, seed) * 0.3), sw = Math.sin(age * 8 + i) * 1.4;
    return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw - age * age * 6, age, r: rand(i, 13, seed), i };
  })) {
    const col = R[p.age < 0.15 ? 0 : p.age < 0.35 ? 1 : p.age < 0.55 ? 2 : p.age < 0.78 ? 3 : 4];
    if (p.i % 11 === 0 && p.age > 0.3) { X.px(c, p.x - 1, p.y, col); X.px(c, p.x + 1, p.y, col); X.px(c, p.x, p.y - 1, col); X.px(c, p.x, p.y + 1, col); }
    if (p.r > 0.7 && p.age > 0.1 && p.age < 0.6) X.rect(c, p.x, p.y, 2, 2, col); else X.px(c, p.x, p.y, col);
  }
  X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 7, R[1], 0.85 * on);
}

// ---------------------------------------------------------------------------
/** Area: a ring band expanding from (x, y) to Rmax between t0 and t0 + dur. Returns its radius, or -1. */
export function nova(c: Ctx, x: number, y: number, t: number, t0: number, dur: number, Rmax: number, Rp: Ramp, opt: { n?: number; lift?: number; seed?: number } = {}): number {
  const e = (t - t0) / dur; if (e < 0 || e > 1.25) return -1;
  const k = easeOut(Math.min(1, e)), r = 4 + (Rmax - 4) * k, a = 1 - seg(e, 0.6, 1.2);
  gring(c, x, y, r + 1, Rp[3], a * 0.8, 1);
  gring(c, x, y, r, Rp[1], a, 2);
  gring(c, x, y, r - 2, Rp[2], a * 0.8, 2);
  if (e < 0.08) X.ellipse(c, x, y - 4, 10, 8, '#ffffff', 1 - e / 0.08);
  const n = opt.n ?? 26, sd = opt.seed ?? 0;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + rand(i, 3, sd) * 0.2, rr = r + (rand(i, 4, sd) - 0.5) * 4;
    if (rand(i, 5, Math.floor(t * 20)) > a + 0.1) continue;
    const px2 = x + Math.cos(th) * rr, py2 = y + Math.sin(th) * rr * FY - (opt.lift ?? 0) * rand(i, 6, sd) * Math.sin(e * Math.PI);
    sq(c, px2, py2, i % 3 ? 1 : 2, i % 2 ? Rp[0] : Rp[2]);
  }
  return r;
}
/** A jagged bolt with branches in ramp R. */
export function zap(c: Ctx, a: Pt, z: Pt, seed: number, R: Ramp = EL.lightning, w = 3, branches = 2): Pt[] {
  const pts = bolt(a, z, seed, 0.32, 4);
  X.lines(c, pts, R[3], w); X.lines(c, pts, R[1], 1);
  for (let k = 0; k < branches; k++) {
    const j = 2 + Math.floor(rand(seed, k, 1) * (pts.length - 4)), p = pts[j], a2 = rand(seed, k, 2) * TAU;
    X.lines(c, bolt(p, [p[0] + Math.cos(a2) * 9, p[1] + Math.sin(a2) * 7], seed + k * 7, 0.5, 2), R[2], 1);
  }
  return pts;
}
export function zapHit(c: Ctx, p: Pt, seed: number, R: Ramp = EL.lightning): void { X.glow(c, p[0], p[1], 9, R[2], 0.8); for (let k = 0; k < 5; k++) { const a2 = rand(seed, k, 3) * TAU; X.line(c, p[0], p[1], p[0] + Math.cos(a2) * 5, p[1] + Math.sin(a2) * 4, '#ffffff'); } }
/** Molten sparks for the plasma (flame) arc: they fly out, fall, and cool on the ground. */
export function moltenSparks(c: Ctx, gx: number, gy: number, z0: number, t: number, rate: number, seed: number, from: number, to: number): void {
  for (const p of emit(t, rate, 0.75, (i, age) => ({ i, age, a: rand(i, 1, seed) * TAU, sp: 14 + rand(i, 2, seed) * 30, vz: 6 + rand(i, 3, seed) * 34 }), from, to)) {
    const g = 120, T = p.age * 0.75, tl = (p.vz + Math.sqrt(p.vz * p.vz + 2 * g * z0)) / g;
    const at = (tt: number): Pt => { const ttc = Math.min(tt, tl); return [gx + Math.cos(p.a) * p.sp * ttc, gy + Math.sin(p.a) * p.sp * ttc * FY - Math.max(0, z0 + p.vz * ttc - 0.5 * g * ttc * ttc)]; };
    const q = at(T), col = X.PLASMA[Math.min(5, Math.floor(p.age * 5.5))];
    if (T < tl) { const r = at(Math.max(0, T - 0.04)); X.line(c, r[0], r[1], q[0], q[1], p.age < 0.25 ? '#ffffff' : col); }
    else if ((p.i + Math.floor(t * 20)) % 4) X.px(c, q[0] + Math.min(3, (T - tl) * 10) * Math.cos(p.a), q[1], p.age < 0.6 ? X.PLASMA[3] : X.PLASMA[5]);
  }
}

// ---------------------------------------------------------------------------
// Statuses (the unlit pass): what hangs off a body, the rig shows the rest on the body itself.
/** Burning: short licks hugging the body and embers peeling off it. */
export function burningFx(c: Ctx, ch: Pt, t: number, k: number, big: boolean, seed: number): void {
  if (k < 0.05) return;
  const spots: [number, number, number][] = big ? [[-5, -2, 2.2], [4, -5, 2.4], [6, 1, 2], [-2, 2, 2]] : [[-1, 0, 1.4], [2, 2, 1.2], [0, -4, 1.2]];
  spots.forEach(([dx, dy, w], j) => tongue(c, ch[0] + dx, ch[1] + dy, w * (0.6 + 0.4 * k), (3 + 2 * Math.sin(t * 14 + j * 1.9 + seed)) * k * (big ? 1.2 : 0.9), Math.sin(t * 7 + j)));
  for (const p of emit(t, big ? 22 : 10, 0.45, (i, age) => ({ x: ch[0] + (rand(i, 1, seed) - 0.5) * (big ? 16 : 7) + Math.sin(age * 7 + i) * 1.2, y: ch[1] + (rand(i, 2, seed) - 0.3) * (big ? 14 : 8) - age * 11, age })))
    if (rand(p.x | 0, 3) < k + 0.2) X.px(c, p.x, p.y, fireCol(0.2 + p.age * 0.8));
}
/** Wet: drips running off the body to the ground. */
export function drips(c: Ctx, ch: Pt, groundY: number, t: number, seed: number): void {
  for (const p of emit(t, 6, 0.45, (i, age) => ({ x: ch[0] + (rand(i, 9, seed) - 0.5) * 7, y: lerp(ch[1] + 1, groundY, age * age), age }))) X.px(c, p.x, p.y, '#8ad0ff');
}
/** Chilled: glints twinkling on the body and a breath of cold mist sinking off it. */
export function chilled(c: Ctx, ch: Pt, hd: Pt, t: number, k: number, seed: number, big = 1): void {
  if (k < 0.05) return;
  for (let i = 0; i < 4; i++) {
    const ph = mod(t * 1.7 + i * 0.37 + seed * 0.13, 1); if (ph > 0.3 || rand(i, seed, 31) > k) continue;
    const cyc = Math.floor(t * 1.7 + i * 0.37), x = ch[0] + (rand(i, cyc, 32) - 0.5) * 8 * big, y = ch[1] + (rand(i, cyc, 33) - 0.6) * 10 * big;
    X.px(c, x, y, '#ffffff'); if (ph < 0.15) { X.px(c, x - 1, y, EL.cold[1]); X.px(c, x + 1, y, EL.cold[1]); X.px(c, x, y - 1, EL.cold[1]); X.px(c, x, y + 1, EL.cold[1]); }
  }
  for (const p of emit(t, 5, 1.1, (i, age) => ({ x: hd[0] + 2 + (rand(i, 34, seed) - 0.3) * 5 * big + age * 3, y: hd[1] + 2 + age * 7, age }))) if (rand(p.x | 0, p.y | 0) < k) X.glow(c, p.x, p.y, 2 + p.age * 2.5, '#e0ffff', 0.45 * (1 - p.age));
}
/** Frozen: glints on the ice that holds the body. */
export function iceGlints(c: Ctx, x: number, y: number, h: number, w: number, t: number, seed: number): void {
  for (let k = 0; k < 2; k++) {
    const ph = mod(t * 0.7 + k * 0.5 + seed * 0.13, 1); if (ph > 0.18) continue;
    const gx = x + (rand(k, Math.floor(t * 0.7 + k * 0.5), seed) - 0.5) * 2 * w, gy = y - 2 - rand(k, 5, seed) * h * 0.8;
    X.px(c, gx, gy, '#ffffff'); if (ph < 0.09) { X.px(c, gx - 1, gy, '#bfeefc'); X.px(c, gx + 1, gy, '#bfeefc'); }
  }
}
/** Stunned: sparks crawling over the body. */
export function shockSparks(c: Ctx, ch: Pt, t: number, seed: number): void {
  const f = Math.floor(t * 20);
  if (f % 3 === 2) return;
  for (let k = 0; k < 3; k++) {
    const a = rand(f, k, seed) * TAU, r = 3 + rand(f, k + 5, seed) * 4, p: Pt = [ch[0] + Math.cos(a) * r, ch[1] + Math.sin(a) * r * 1.3];
    X.lines(c, bolt(p, [p[0] + Math.cos(a + 1.6) * 4, p[1] + Math.sin(a + 1.6) * 4], seed + f + k, 0.6, 2), k ? EL.lightning[2] : '#ffffff');
  }
}
/** Down: little stars circling the head. */
export function dazed(c: Ctx, hd: Pt, t: number): void {
  for (let j = 0; j < 3; j++) { const ang = t * 6 + j * 2.1; X.px(c, hd[0] + Math.cos(ang) * 4, hd[1] - 3 + Math.sin(ang) * 2, j ? '#ffe070' : '#ffffff'); }
}
/** Healing reads as help: pluses and glints rising off a body, green and gold. */
export function sparkle(c: Ctx, x: number, y: number, t: number, k: number, spread = 10, seed = 0, R: Ramp = X.LIFE, rate = 14): void {
  if (k < 0.05) return;
  for (const p of emit(t, rate, 0.8, (i, age) => ({ x: x + (rand(i, 71, seed) - 0.5) * spread + Math.sin(age * 6 + i) * 1.2, y: y + (rand(i, 72, seed) - 0.5) * spread * 0.5 - age * 16, age, i }))) {
    if (rand(p.i, 73, seed) > k) continue;
    const col = p.age < 0.35 ? R[0] : p.age < 0.7 ? R[2] : R[3];
    if (p.i % 3 === 0 && p.age < 0.6) { X.px(c, p.x - 1, p.y, col); X.px(c, p.x + 1, p.y, col); X.px(c, p.x, p.y - 1, col); X.px(c, p.x, p.y + 1, col); }
    X.px(c, p.x, p.y, p.age < 0.5 ? '#ffffff' : col);
  }
}
/** A heal landing on a body: a soft green flash, a ring and a burst of sparkles. */
export function healHit(c: Ctx, p: Pt, e: number, R: Ramp = X.LIFE): void {
  if (e < 0 || e > 0.5) return;
  const q = e / 0.5;
  if (q < 0.25) X.glow(c, p[0], p[1], 9 * (1 - q), R[2], 0.85);
  X.ring(c, p[0], p[1] + 6, 4 + q * 10, (4 + q * 10) * FY * 0.6, R[2], 1 - q);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, d = 3 + q * 9; X.px(c, p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.7 - q * 5, k % 2 ? R[0] : R[2]); }
}

// ---------------------------------------------------------------------------
export function dust(c: Ctx, x: number, y: number, e: number, seed: number, n = 8, spread = 16, col = '#7a6a5a', life = 1): void {
  const age = e / life; if (age < 0 || age >= 1) return;
  for (let k = 0; k < n; k++) { const a2 = rand(k, seed, 1) * TAU, d = spread * easeOut(age) * (0.5 + rand(k, seed, 2) * 0.6); puff(c, x + Math.cos(a2) * d, y + Math.sin(a2) * d * 0.5 - age * 6, 1.5 + age * 4, col, (1 - age) * 0.95); }
}
export function debris(c: Ctx, x: number, y: number, e: number, seed: number, n = 10, speed = 40, cols: Ramp = ['#977552', '#553e2a'], lift = 50): void {
  if (e < 0 || e > 1.2) return;
  for (let k = 0; k < n; k++) {
    const a2 = rand(k, seed, 81) * TAU, sp = speed * (0.4 + rand(k, seed, 82) * 0.6), vz = lift * (0.6 + rand(k, seed, 83) * 0.8);
    const z = vz * e - 140 * e * e; if (z < -1) continue;
    X.rect(c, x + Math.cos(a2) * sp * e, y + Math.sin(a2) * sp * e * FY - Math.max(0, z), k % 3 ? 1 : 2, k % 3 ? 1 : 2, cols[k % cols.length]);
  }
}
/** Radial ground cracks; k = 0..1 how far they have run. */
export function cracks(c: Ctx, x: number, y: number, r: number, seed: number, k: number, col = '#1a120c', n = 6): void {
  for (let i = 0; i < n; i++) {
    let a2 = (i / n) * TAU + rand(i, seed) * 0.6, px2 = x, py2 = y;
    const L = r * k * (0.6 + rand(i, seed, 2) * 0.5);
    for (let d = 0; d < L; d += 3) { a2 += (rand(i, d, seed) - 0.5) * 0.9; const nx = px2 + Math.cos(a2) * 3, ny = py2 + Math.sin(a2) * 3 * FY; X.line(c, px2, py2, nx, ny, col); px2 = nx; py2 = ny; }
  }
}
export function scorch(c: Ctx, x: number, y: number, r: number, a = 0.7): void { if (a > 0.02) X.ellipse(c, x, y, r, r * FY * 0.6, `rgba(22,14,16,${a.toFixed(2)})`); }

/** A rock lit from the upper left, outlined; `mat` recolours it (the look rule: ice boulder, mud ball...). */
export interface RockMat { out: string; body: string; lit: string; hi: string; crack: string }
export const ROCK_MAT: Record<string, RockMat> = {
  earth: { out: '#1a120c', body: '#76583c', lit: '#b8946a', hi: '#e0c8a0', crack: '#553e2a' },
  hot: { out: '#1a0a08', body: '#6a2a1a', lit: '#c8502a', hi: '#ffd860', crack: '#3a1410' },
  cold: { out: '#0e2a4a', body: '#3a8cc4', lit: '#9fe4fa', hi: '#ffffff', crack: '#1e5a96' },
  water: { out: '#0e140c', body: '#4a3c2a', lit: '#6a5a40', hi: '#8ad0ff', crack: '#2a2016' },
  life: { out: '#1a120c', body: '#76583c', lit: '#b8946a', hi: '#e8ffd8', crack: '#46c450' },
  arcane: { out: '#1a0a14', body: '#5a3c4a', lit: '#9a6a84', hi: '#ffc0e0', crack: '#ff2d8a' },
  lightning: { out: '#120c1a', body: '#5a4a6a', lit: '#8a7aa6', hi: '#efe4ff', crack: '#c4a4ff' },
};
export function rock(c: Ctx, x: number, y: number, r: number, seed: number, m: RockMat = ROCK_MAT.earth): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, rr = r * (0.8 + rand(i, seed) * 0.35); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]); }
  X.poly(c, pts.map(([a, b]) => [a + (a - x) * 0.25 + 0.5, b + (b - y) * 0.25 + 0.5] as Pt), m.out);
  X.poly(c, pts, m.body);
  X.ellipse(c, x - r * 0.25, y - r * 0.3, r * 0.55, r * 0.4, m.lit);
  X.px(c, x - r * 0.4, y - r * 0.45, m.hi);
  X.line(c, x + r * 0.1, y + r * 0.6, x + r * 0.6, y + r * 0.1, m.crack);
}
/** An ice shard: a long jagged sliver pointing along ang, len px long. R recolours it (healing shards). */
export function shard(c: Ctx, x: number, y: number, ang: number, len: number, seed: number, a = 1, R: Ramp = EL.cold): void {
  if (a < 0.1) return;
  const cs = Math.cos(ang), sn = Math.sin(ang), w = 1.3 + rand(seed, 1) * 0.9;
  const P = (f: number, s: number): Pt => [x + cs * f * len - sn * s * w, y + sn * f * len + cs * s * w];
  const j = (k: number) => (rand(seed, k) - 0.5) * 0.5;
  const pts = [P(1, 0), P(0.45, 1 + j(2)), P(0.05, 0.75 + j(3)), P(-0.38, 0.35 + j(4)), P(-0.5, -0.1), P(-0.3, -0.6 + j(5)), P(0.15, -1 + j(6)), P(0.6, -0.55)];
  X.poly(c, pts.map(([p, q]) => [p + (p - x) * 0.18 + 0.4, q + (q - y) * 0.18 + 0.6] as Pt), R[5] ?? '#163e7a', a);
  X.poly(c, pts, R[3], a);
  X.poly(c, [P(1, 0), P(0.45, 1 + j(2)), P(0.05, 0.75 + j(3)), P(-0.38, 0.35 + j(4)), P(-0.2, 0), P(0.5, -0.1)], R[2], a);
  const h0 = P(0.95, 0), h1 = P(-0.2, 0.3);
  X.line(c, h0[0], h0[1], h1[0], h1[1], a > 0.6 ? '#ffffff' : R[1]);
  const tp = P(1, 0); X.px(c, tp[0], tp[1], '#ffffff');
}
/** A fireball: layered flame body, tongues streaming back against the motion, white-hot core. */
export function fireball(c: Ctx, x: number, y: number, r: number, t: number, vx = 1, vy = 0, seed = 0): void {
  const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
  for (let i = 0; i < 9; i++) {
    const sp = (i / 9 - 0.5) * 1.7, ph = t * 22 + i * 1.7, len = r * (1.3 + 0.9 * (0.5 + 0.5 * Math.sin(ph)) + rand(i, seed, 3) * 0.6);
    const ex = -ux * Math.cos(sp) + uy * Math.sin(sp), ey = -ux * Math.sin(sp) - uy * Math.cos(sp);
    for (let k = 0; k < len; k++) {
      const q = k / len, xx = x + ex * (r * 0.6 + k), yy = y + ey * (r * 0.6 + k) - q * q * 3 + Math.sin(ph + k * 0.6) * 0.6;
      X.px(c, xx, yy, EL.fire[q < 0.25 ? 1 : q < 0.5 ? 2 : q < 0.8 ? 3 : 4]);
    }
  }
  X.ellipse(c, x, y, r + 1, r + 0.6, EL.fire[4]);
  X.ellipse(c, x, y, r, r - 0.3, EL.fire[3]);
  X.ellipse(c, x + ux * 0.8, y + uy * 0.8 - 0.5, r * 0.72, r * 0.68, EL.fire[2]);
  X.ellipse(c, x + ux * 1.2, y + uy * 1.2 - 0.8, r * 0.42, r * 0.4, EL.fire[1]);
  X.rect(c, x + ux * 1.4 - 1, y + uy * 1.4 - 1.5, 2, 2, Math.floor(t * 24) % 2 ? '#ffffff' : EL.fire[0]);
  for (let i = 0; i < 6; i++) { const a2 = (i / 6) * TAU + t * 9, rr = r + 0.5 + (rand(i, Math.floor(t * 20), seed) - 0.3) * 1.5; X.px(c, x + Math.cos(a2) * rr, y + Math.sin(a2) * rr - 1, EL.fire[2]); }
}
/** A rune mote flowing from a to b: e = 0..1 along a little arc. */
export function mote(c: Ctx, a: Pt, b: Pt, e: number, R: Ramp, lift = 10): void {
  if (e <= 0 || e >= 1) return;
  const P = (k: number): Pt => [lerp(a[0], b[0], smooth(k)), lerp(a[1], b[1], smooth(k)) - Math.sin(k * Math.PI) * lift];
  for (let j = 1; j <= 3; j++) { const q = P(Math.max(0, e - j * 0.06)); X.px(c, q[0], q[1], R[Math.min(R.length - 1, 1 + j)]); }
  const p = P(e); X.glow(c, p[0], p[1], 4, R[2], 0.7); X.rect(c, p[0] - 1, p[1] - 1, 2, 2, R[1]); X.px(c, p[0], p[1], '#ffffff');
}
