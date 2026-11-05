/**
 * The extras accent: one shared way to show the elements a conjured weapon or guard carries besides
 * its lead (docs/decisions "The look rule": the look follows the carried element; the extras ride on
 * it). Every extra element gets equal weight, the same everywhere:
 *
 *   - a colour band: a second stripe along the weapon (or a coloured arc on a guard's rim), in that element's ramp
 *   - its own particle: fire licks and embers rising, frost rime and glints, lightning crackle, water drips,
 *     stone chunks, arcane rune sparks, life motes rising, shield glints
 *
 * Held weapons call `along`, guards and orbs `around`, moves (Strike thrust, Sweep ring, Heavies, guard
 * moves) `trail` and `burst`, bolts `bolt`. Pure functions of time and seed: no state.
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import { TAU, emit, lerp, rand } from './util';

// element ids, as the sim's EL (rules BASE order + 1)
const ID = { water: 1, life: 2, shield: 3, cold: 4, lightning: 5, arcane: 6, sigil: 7, fire: 8, earth: 9 } as const;
const NAME = ['', 'water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth'];

/** The ramp an extra is drawn in (brightest first). */
export function accentRamp(id: number): Ramp {
  if (id === ID.cold) return X.FROST;
  if (id === ID.life) return X.LIFE;
  if (id === ID.earth) return X.EARTH;
  return X.EL[NAME[id]] ?? X.EL.arcane;
}

/** The elements in a 9-count block at `at`, skipping `skip` (the lead, Shield, Sigil): the extras, in id order. */
export function extrasOf(els: Uint8Array | undefined, at: number, ...skip: number[]): number[] {
  const out: number[] = [];
  if (!els) return out;
  for (let id = 1; id <= 9; id++) if (els[at * 9 + id - 1] > 0 && !skip.includes(id) && id !== ID.sigil) out.push(id);
  return out;
}

/**
 * One particle of element `id` at (x, y): `k` 0..1 is its age (fades out toward 1), `j` its index,
 * `dir` the way it streams (radians, for shards and crackle).
 */
export function bit(o: Ctx, id: number, x: number, y: number, k: number, j: number, dir = -Math.PI / 2): void {
  const R = accentRamp(id), a = 1 - k;
  switch (id) {
    case ID.fire: if (a > 0.3) K.tongue(o, x, y, 1.3 * a + 0.3, 2 + 3 * a, Math.sin(j * 1.7) * 0.8); else X.px(o, x, y, K.fireCol(0.5 + k * 0.5)); return;
    case ID.cold: if (j % 3 === 0 && a > 0.4) K.shard(o, x, y, dir, 3.5 * a + 1, j, a); else { X.px(o, x, y, j % 2 ? '#ffffff' : R[2]); if (a > 0.5) { X.px(o, x - 1, y, R[1]); X.px(o, x + 1, y, R[1]); } } return;
    case ID.lightning: {
      if ((j + Math.floor(k * 12)) % 3 === 2) { X.px(o, x, y, R[2]); return; }
      const l = 2 + 3 * a, c = Math.cos(dir + (j % 2 ? 1.2 : -1.2)), s = Math.sin(dir + (j % 2 ? 1.2 : -1.2));
      X.line(o, x, y, x + c * l, y + s * l, '#ffffff'); X.line(o, x + c * l, y + s * l, x + c * l + Math.cos(dir) * l, y + s * l + Math.sin(dir) * l, R[2]);
      return;
    }
    case ID.water: X.px(o, x, y, '#e0f6ff'); X.px(o, x, y + 1, R[1]); if (a > 0.5) X.px(o, x, y + 2, R[2]); return;
    case ID.earth: X.rect(o, x - 1, y - 1, 3, 2, R[4]); X.rect(o, x - 1, y - 1, 2, 1, R[1]); X.px(o, x + 1, y, R[2]); return;
    case ID.arcane: X.px(o, x, y, '#ffffff'); if (a > 0.35) { X.px(o, x - 1, y, R[2]); X.px(o, x + 1, y, R[2]); X.px(o, x, y - 1, R[2]); X.px(o, x, y + 1, R[2]); } return;
    case ID.life: X.px(o, x, y, R[1]); if (a > 0.4) { X.px(o, x, y - 1, '#ffffff'); X.px(o, x - 1, y, R[3]); X.px(o, x + 1, y, R[3]); } return;
    default: X.px(o, x, y, j % 2 ? '#ffffff' : R[1]);
  }
}

/** How each element's particles drift: fire and life rise, water and earth fall, the rest hang. */
const drift = (id: number): number => (id === ID.fire ? -9 : id === ID.life ? -6 : id === ID.water ? 12 : id === ID.earth ? 8 : id === ID.arcane ? -3 : 0);

/**
 * On a held weapon: `pts` is its line from grip to tip. Each extra adds a band of its colour beside
 * the blade (offset, so several sit side by side), a glow at the tip, and its particles along it.
 */
export function along(c: Ctx, o: Ctx, pts: readonly Pt[], ids: readonly number[], t: number, seed: number, light?: (x: number, y: number, r: number, col: string, a: number) => void): void {
  if (!ids.length || pts.length < 2) return;
  const a = pts[0], z = pts[pts.length - 1], L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, nx = -(z[1] - a[1]) / L, ny = (z[0] - a[0]) / L;
  const at = (f: number): Pt => { const s = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(s)), u = s - k; return [lerp(pts[k][0], pts[k + 1][0], u), lerp(pts[k][1], pts[k + 1][1], u)]; };
  ids.forEach((id, m) => {
    const R = accentRamp(id), off = (m % 2 ? -1 : 1) * (1.5 + Math.floor(m / 2));
    // the band: a stripe of the extra's colour along the blade, its light running up and down it
    const run = (t * 1.6 + m * 0.37) % 1;
    for (let q = 0; q <= 10; q++) {
      const f = 0.15 + 0.85 * (q / 10), p = at(f), hot = Math.abs(f - run) < 0.12;
      X.px(c, p[0] + nx * off, p[1] + ny * off, hot ? '#ffffff' : q % 2 ? R[1] : R[2]);
      X.px(c, p[0] + nx * (off + Math.sign(off)), p[1] + ny * (off + Math.sign(off)), q % 2 ? R[2] : R[3] ?? R[2]);
    }
    const mid = at(0.6);
    X.glow(o, mid[0], mid[1], 6, R[2], 0.3);
    // a glow at the tip in the extra's colour, and its particles streaming off the blade
    X.glow(o, z[0] + nx * off * 0.5, z[1] + ny * off * 0.5, 4.5, R[2], 0.5);
    const dir = Math.atan2(z[1] - a[1], z[0] - a[0]);
    if (id === ID.lightning) { // crackle hops between points on the blade
      if (Math.floor(t * 16 + m) % 3 !== 2) { const f0 = rand(Math.floor(t * 16), m, seed), p0 = at(0.2 + 0.6 * f0), p1 = at(Math.min(1, 0.3 + 0.6 * f0)); K.zap(o, [p0[0] + nx * 3, p0[1] + ny * 3], [p1[0] - nx * 3, p1[1] - ny * 3], Math.floor(t * 16) + seed + m, R, 1, 0); }
    }
    if (id === ID.cold || id === ID.earth) { // rime crusted on the blade, stone chunks set in it: they stay put
      for (let q = 0; q < 4; q++) { const p = at(0.3 + 0.18 * q); bit(c, id, p[0] + nx * off * (q % 2 ? -1 : 1), p[1] + ny * off * (q % 2 ? -1 : 1), 0.2, q + (id === ID.cold ? 1 : 0), dir + Math.PI / 2); }
    }
    for (const p of emit(t, 15, 0.6, (q, age) => { const f = 0.2 + 0.8 * rand(q, 5 + m, seed), b = at(f); return { x: b[0] + nx * off + Math.sin(q + age * 6) * 1.5, y: b[1] + ny * off + drift(id) * age, age, q }; })) bit(o, id, p.x, p.y, p.age, p.q, dir);
    light?.(z[0], z[1] + 10, 22, R[2], 0.35);
  });
}

/**
 * Round a point (a guard, a pair of hands, an orb): each extra is an arc of the rim, thick and in its
 * colour, turning slowly, with its particles shed off the rim.
 */
export function around(o: Ctx, x: number, y: number, rx: number, ry: number, ids: readonly number[], t: number, seed: number): void {
  if (!ids.length) return;
  const n = ids.length, span = TAU / n;
  ids.forEach((id, m) => {
    const R = accentRamp(id), a0 = t * 0.8 + m * span, a1 = a0 + span * 0.8;
    X.ring(o, x, y, rx + 1, ry + 1, R[3] ?? R[2], 1, a0, a1);
    X.ring(o, x, y, rx, ry, R[1], 1, a0, a1);
    X.ring(o, x, y, rx - 1, ry - 1, R[2], 0.8, a0, a1);
    for (const p of emit(t, 7, 0.7, (q, age) => { const a = a0 + rand(q, 3 + m, seed) * (a1 - a0); return { x: x + Math.cos(a) * (rx + 1 + age * 3), y: y + Math.sin(a) * (ry + 1) + drift(id) * age, age, q, a }; })) bit(o, id, p.x, p.y, p.age, p.q, p.a);
  });
}

/** Thrown off at a point by each extra (where a blow lands, a guard flashes): `e` 0..1 through the effect. */
export function burst(o: Ctx, p: Pt, ids: readonly number[], e: number, seed: number, n = 5, spread = 14, dir?: number): void {
  if (!ids.length || e >= 1) return;
  ids.forEach((id, m) => {
    for (let j = 0; j < n; j++) {
      if (rand(j, 9 + m, seed) < e * 0.9) continue;
      const a = dir === undefined ? rand(j, 1 + m, seed) * TAU : dir + (rand(j, 1 + m, seed) - 0.5) * 1.8, d = (0.3 + 0.7 * rand(j, 4 + m, seed)) * spread * (0.4 + e);
      bit(o, id, p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.7 + drift(id) * e, e, j + m, a);
    }
  });
}

/**
 * Along a move's path (a thrust, a dash, a lash, a wave): each extra a thin line of its colour laid
 * beside the path, and its particles scattered along it; `e` 0..1 through the effect.
 */
export function trail(o: Ctx, a: Pt, z: Pt, ids: readonly number[], e: number, seed: number, n = 8): void {
  if (!ids.length || e >= 1) return;
  const L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, nx = -(z[1] - a[1]) / L, ny = (z[0] - a[0]) / L, dir = Math.atan2(z[1] - a[1], z[0] - a[0]);
  ids.forEach((id, m) => {
    const R = accentRamp(id), off = (m % 2 ? -1 : 1) * (2 + m);
    if (e < 0.5) X.line(o, a[0] + nx * off, a[1] + ny * off, z[0] + nx * off, z[1] + ny * off, R[2], e < 0.25 ? 2 : 1);
    for (let j = 0; j < n; j++) {
      if (rand(j, 7 + m, seed) < e) continue;
      const f = rand(j, 2 + m, seed), sp = (rand(j, 3 + m, seed) - 0.5) * 8;
      bit(o, id, lerp(a[0], z[0], f) + nx * (off + sp), lerp(a[1], z[1], f) + ny * (off + sp) + drift(id) * e, e, j, dir);
    }
  });
}

/**
 * A bolt in flight (the wand's), at (x, y) heading (ux, uy): each extra changes it the way that element
 * would: fire a flaming streak behind, cold an icy shard for a head, lightning crackling round it, water a
 * droplet trail, earth a stone pebble at its heart, life green motes, arcane rune sparks.
 */
export function bolt(o: Ctx, x: number, y: number, ux: number, uy: number, ids: readonly number[], t: number, t0: number, seed: number, light?: (x: number, y: number, r: number, col: string, a: number) => void): void {
  const dir = Math.atan2(uy, ux);
  ids.forEach((id, m) => {
    const R = accentRamp(id), side = (m % 2 ? -1 : 1) * (m + 1);
    // a streak of its colour behind the head
    for (let k = 1; k <= 5; k++) X.px(o, x - ux * k * 2.5 - uy * side, y - uy * k * 2.5 + ux * side, k < 3 ? R[1] : R[2]);
    switch (id) {
      case ID.fire:
        for (const p of emit(t, 50, 0.35, (q, age, ts) => ({ x: x - ux * (t - ts) * 160 + (rand(q, 2, seed) - 0.5) * 3, y: y - uy * (t - ts) * 160 - age * 8, age }), t0, t)) K.tongue(o, p.x, p.y, 1.4 * (1 - p.age) + 0.3, 4 * (1 - p.age) + 1, -ux);
        break;
      case ID.cold: K.shard(o, x + ux * 3, y + uy * 3, dir, 6, seed, 1, X.EL.cold); break;
      case ID.lightning:
        if (Math.floor(t * 18) % 3 !== 2) for (let k = 0; k < 2; k++) { const a = rand(Math.floor(t * 18), k, seed) * TAU; K.zap(o, [x, y], [x + Math.cos(a) * 7, y + Math.sin(a) * 5], Math.floor(t * 18) + k + seed, X.EL.lightning, 1, 0); }
        break;
      case ID.water:
        for (const p of emit(t, 30, 0.4, (q, age, ts) => ({ x: x - ux * (t - ts) * 160 + (rand(q, 4, seed) - 0.5) * 2, y: y - uy * (t - ts) * 160 + age * age * 14, age, q }), t0, t)) bit(o, ID.water, p.x, p.y, p.age, p.q);
        break;
      case ID.earth: K.rock(o, x, y + 1, 2.5, seed, K.ROCK_MAT.earth); break;
      default:
        for (const p of emit(t, 30, 0.45, (q, age, ts) => ({ x: x - ux * (t - ts) * 160 + Math.sin(q * 2.1 + age * 9) * 3, y: y - uy * (t - ts) * 160 + drift(id) * age, age, q }), t0, t)) bit(o, id, p.x, p.y, p.age, p.q, dir);
    }
    X.glow(o, x, y, 5, R[2], 0.45);
    light?.(x, y + 12, 22, R[2], 0.35);
  });
}
