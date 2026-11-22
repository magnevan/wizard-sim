/**
 * The extras accent: one shared way to show the elements a conjured weapon or guard carries besides
 * its lead (docs/decisions "The look rule": the look follows the carried element; the extras ride on
 * it). Every extra element gets equal weight, the same everywhere:
 *
 *   - a colour band: a second stripe along the weapon (or a coloured arc on a guard's rim), in that element's ramp
 *   - its own particle: fire licks and embers rising, frost rime and glints, lightning crackle, water drips,
 *     stone chunks, arcane rune sparks, life motes rising, shield glints
 *
 * Guards call `around`, moves (Strike thrust, Sweep ring, Heavies, guard moves) `trail` and `burst`, bolts `bolt`.
 * Held weapons no longer band every extra along the blade (issue #4, "the particles just read as noise"): their
 * extras set the prop's material (infuse.ts, live3d.ts) and `infused` draws what goes with it; Healing hands get
 * `shells`. Pure functions of time and seed: no state.
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt, Ramp } from './px';
import { TAU, emit, lerp, rand } from './util';

// element ids, as the sim's EL (rules ALL order + 1: the nine keyed elements, then Ice)
const ID = { water: 1, life: 2, shield: 3, cold: 4, lightning: 5, arcane: 6, sigil: 7, fire: 8, earth: 9, ice: 10 } as const;
const N = 10; // the sim's N_EL
const NAME = ['', 'water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth', 'ice'];

/** The ramp an extra is drawn in (brightest first). */
export function accentRamp(id: number): Ramp {
  if (id === ID.cold) return X.FROST;
  if (id === ID.ice) return X.EL.ice;
  if (id === ID.life) return X.LIFE;
  if (id === ID.earth) return X.EARTH;
  return X.EL[NAME[id]] ?? X.EL.arcane;
}

/** The elements in an N-count block at `at`, skipping `skip` (the lead, Shield, Sigil): the extras, in id order. */
export function extrasOf(els: Uint8Array | undefined, at: number, ...skip: number[]): number[] {
  const out: number[] = [];
  if (!els) return out;
  for (let id = 1; id <= N; id++) if (els[at * N + id - 1] > 0 && !skip.includes(id) && id !== ID.sigil) out.push(id);
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
    case ID.ice: if (a > 0.25) K.shard(o, x, y, dir, 4 * a + 1.5, j, a, X.EL.ice); else X.px(o, x, y, R[1]); return; // Ice: always a glassy splinter
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
      case ID.ice: K.shard(o, x + ux * 3, y + uy * 3, dir, 7, seed, 1, X.EL.ice); K.shard(o, x - ux, y - uy, dir, 4, seed + 1, 1, X.EL.ice); break;
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

/** A small rune (five rows of art px, a stem with two arms): Arcane on an infused weapon, glowing on its head. */
const RUNE = ['x.x.x', '.xxx.', '..x..', '..x..', '..x..'];
/** Each infusion material's ramp (infuse.ts MAT; steam a neutral grey, never water's blue). */
export const MAT_COL: Record<number, Ramp> = { 1: X.EL.fire, 2: X.EL.water, 3: X.FROST, 4: X.EL.ice, 5: X.EL.lightning, 6: ['#ffffff', '#f0f2f6', '#d0d6de', '#a8b0bc', '#7a8290'] };

/**
 * An infused weapon (art/infuse.ts; docs/threads/elemental-weapons.md): the material is the 3D prop's (live3d.ts), so
 * this draws only what goes with it, all at the head (`pts` grip to tip; the head is near the tip): the material's light,
 * a few wisps where the material needs them (steam rising, water dripping), each leftover extra as one small effect in
 * one colour, and the rune. A few particles a second each, never a band along the blade (issue #4: "the particles just
 * read as noise").
 */
export function infused(o: Ctx, pts: readonly Pt[], inf: { mat: number; fx: readonly number[]; rune: boolean }, t: number, seed: number, light?: (x: number, y: number, r: number, col: string, a: number) => void, headAt = 0.82): void {
  if (pts.length < 2 || (!inf.mat && !inf.fx.length && !inf.rune)) return;
  const at = (f: number): Pt => { const s = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(s)), u = s - k; return [lerp(pts[k][0], pts[k + 1][0], u), lerp(pts[k][1], pts[k + 1][1], u)]; };
  const [hx, hy] = at(headAt);
  const M = MAT_COL[inf.mat];
  if (M) light?.(hx, hy + 10, 24, M[2], 0.4);
  // the material's own movement, where a solid colour can't carry it
  if (inf.mat === 6) for (const p of emit(t, 7, 0.9, (q, age) => ({ x: hx + (rand(q, 3, seed) - 0.5) * 6 + Math.sin(q + age * 4) * 1.5, y: hy - 2 - age * 11, age }))) K.puff(o, p.x, p.y, 1 + p.age * 2.2, p.age < 0.4 ? '#f4f6fa' : '#c8ced8', 0.75 * (1 - p.age));
  if (inf.mat === 2) for (const p of emit(t, 2.5, 0.45, (q, age) => ({ x: hx + (rand(q, 4, seed) - 0.5) * 5, y: hy + 3 + age * age * 22, age, q }))) bit(o, ID.water, p.x, p.y, p.age, p.q);
  if (inf.mat === 1) for (const p of emit(t, 4, 0.6, (q, age) => ({ x: hx + (rand(q, 5, seed) - 0.5) * 6 + Math.sin(q + age * 7), y: hy - 2 - age * 10, age }))) X.px(o, p.x, p.y, K.fireCol(0.3 + p.age * 0.7));
  // each leftover extra: one small effect
  inf.fx.forEach((id, m) => {
    const sd = seed + 17 * (m + 1);
    if (id === ID.lightning) {   // a short crackle over the head now and then
      const f = Math.floor(t * 9);
      if (rand(f, 1, sd) < 0.4) { const a = rand(f, 2, sd) * TAU; K.zap(o, [hx + Math.cos(a) * 3, hy + Math.sin(a) * 2], [hx - Math.cos(a) * 5, hy - Math.sin(a) * 4], f + sd, X.EL.lightning, 1, 0); }
    } else if (id === ID.water) for (const p of emit(t, 3, 0.45, (q, age) => ({ x: hx + (rand(q, 4, sd) - 0.5) * 5, y: hy + 3 + age * age * 22, age, q }))) bit(o, ID.water, p.x, p.y, p.age, p.q);
    else if (id === ID.cold) for (const p of emit(t, 4, 1.0, (q, age) => ({ x: hx + (rand(q, 6, sd) - 0.5) * 7 + Math.sin(q * 2 + age * 5) * 1.5, y: hy + 1 + age * 9, age }))) { X.px(o, p.x, p.y, '#ffffff'); if (p.age < 0.5) { X.px(o, p.x - 1, p.y, X.FROST[2]); X.px(o, p.x + 1, p.y, X.FROST[2]); } }   // snow puffs falling off
    else if (id === ID.fire) for (const p of emit(t, 4, 0.6, (q, age) => ({ x: hx + (rand(q, 5, sd) - 0.5) * 6 + Math.sin(q + age * 7), y: hy - 2 - age * 10, age }))) X.px(o, p.x, p.y, K.fireCol(0.3 + p.age * 0.7));   // embers
    else if (id === ID.ice) { if (Math.floor(t * 3 + m) % 4 === 0) { X.px(o, hx + 2, hy - 2, '#ffffff'); X.px(o, hx + 1, hy - 2, X.EL.ice[1]); X.px(o, hx + 2, hy - 3, X.EL.ice[1]); } }   // a glint
  });
  if (inf.rune) {
    const R = X.EL.arcane, pulse = 0.5 + 0.5 * Math.sin(t * 4 + seed);
    X.glow(o, hx, hy, 5, R[2], 0.35 + 0.25 * pulse);
    RUNE.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === 'x') X.px(o, hx - 2 + rx, hy - 2 + ry, ry === 1 && pulse > 0.6 ? '#ffffff' : R[1]); });
  }
}

/**
 * Healing hands' extras (the user, 2026-11-21: "glowing hands with a core of the heal color and shells made up of the
 * other colors. No model"): a shell of each extra's colour round the hand's green core, the first innermost, breathing.
 */
export function shells(o: Ctx, x: number, y: number, ids: readonly number[], t: number, k = 1): void {
  // solid glows nested outermost first, each a little wider than the one inside it; the caller draws the core on top
  for (let m = ids.length - 1; m >= 0; m--) {
    const R = accentRamp(ids[m]), r = 4.5 + (m + 1) * 2 + Math.sin(t * 5 + m * 1.3) * 0.4;
    X.glow(o, x, y, r, R[2], k);
  }
}
