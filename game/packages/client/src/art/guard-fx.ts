/**
 * The live guards' particles (docs/explorations/2026-11-17-guard-refinement.md): each guard drawn from 3D is a solid
 * core (the model's prop), an animated shell (art/live3d.ts FX_GLSL) and these, the parts that move: the Ember's flames,
 * the Spark ring's arcs, the Rime's falling mist, the Tide's spray, the Leaf's pollen, the Bulwark's grit, the Prism's
 * spectral glints. They lie in the guard's plane through its frame (Anchors.guardFrame), so a ring of arcs tilts with it.
 *
 * Blocking, every guard but the Mirror throws out bursts of its own element (the user, 2026-11-17: no Shield shimmer
 * on the others, "some colored particles that burst out for that element"); the Mirror keeps its ward.
 * Pure functions of time and seed.
 */
import * as K from './kit';
import * as X from './px';
import type { Ctx, Pt } from './px';
import * as A from './accent';
import { TAU, emit, rand } from './util';

/** The guard's frame on screen: centre, half-extent offsets in its face (u the longer), and how squarely it faces the camera. */
export interface GuardFrame { x: number; y: number; u: Pt; v: Pt; face: number }

/** A point on the guard's rim (angle a, k of the way out), on screen. */
const rim = (f: GuardFrame, a: number, k = 1): Pt => [f.x + (f.u[0] * Math.cos(a) + f.v[0] * Math.sin(a)) * k, f.y + (f.u[1] * Math.cos(a) + f.v[1] * Math.sin(a)) * k];
/** How far out the rim reaches on screen (px), for spreads. */
const reach = (f: GuardFrame): number => Math.max(3, Math.hypot(f.u[0], f.u[1]), Math.hypot(f.v[0], f.v[1]));
const SPECTRUM = ['#ff6a8a', '#ffb84a', '#fff27a', '#7af08a', '#6ad8ff', '#9a8aff', '#f08aff'];

/**
 * Draws a live guard's moving parts. `id` is the guard's name (GUARD_NAME), `el` its element id (for the block bursts),
 * `blocking` / `raise` its block, `feet` the wizard's feet y (where mist pools and grit lands).
 */
export function guardFx(o: Ctx, id: string, el: number, f: GuardFrame, t: number, blocking: boolean, raise: number, feet: number, seed: number): void {
  const fl = Math.floor(t * 20), big = blocking ? 1.4 : 1, R = reach(f);
  switch (id) {
    case 'ember': {
      // tongues all round the rim, rising (screen up) whatever the guard's tilt; the core's glow is the shell's pulse
      const n = 11;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + t * 0.6, p = rim(f, a, 1.05), w = 0.8 + rand(k, fl >> 1, seed) * 0.6;
        const h = (3 + 3 * rand(k, fl, seed + 1)) * big * (p[1] < f.y ? 1.25 : 0.8);
        K.tongue(o, p[0], p[1] + 1, w * big, h, Math.sin(t * 9 + k * 1.7) * 1.4);
      }
      for (const q of emit(t, 10 * big, 0.8, (j, age) => { const p = rim(f, rand(j, 2, seed) * TAU); return { x: p[0] + Math.sin(j + age * 7) * 2, y: p[1] - age * 14, age }; }))
        X.px(o, q.x, q.y, K.fireCol(q.age));
      break;
    }
    case 'spark': {
      // jagged arcs between points on the ring, re-rolled every few frames; blocking they cross the middle as a web
      const arcs = blocking ? 7 : 4, roll = Math.floor(t * 12);
      for (let k = 0; k < arcs; k++) {
        const a = rand(k, roll, seed) * TAU, b = a + (blocking ? Math.PI * (0.6 + 0.8 * rand(k, roll, seed + 2)) : 0.8 + 1.6 * rand(k, roll, seed + 2));
        const pts = K.bolt(rim(f, a), rim(f, b, blocking ? 1 : 0.95), roll * 7 + k, 0.35, 3);
        X.lines(o, pts, k % 3 ? X.EL.lightning[2] : X.EL.lightning[1]);
        if ((roll + k) % 4 === 0) X.px(o, pts[0][0], pts[0][1], '#ffffff');
      }
      break;
    }
    case 'spike': {
      // ice chips breaking off and falling, hard glints on the spikes
      for (const q of emit(t, 5 * big, 0.6, (j, age) => { const p = rim(f, rand(j, 10, seed) * TAU); return { x: p[0], y: Math.min(feet, p[1] + age * age * 26), age }; }))
        X.px(o, q.x, q.y, q.age < 0.5 ? '#ffffff' : X.EL.ice[3]);
      for (let k = 0; k < 2; k++) if ((fl + k * 3) % 6 === 0) { const p = rim(f, rand(fl, 11 + k, seed) * TAU, 1.05); X.px(o, p[0], p[1], '#ffffff'); X.px(o, p[0] - 1, p[1], X.EL.ice[1]); X.px(o, p[0] + 1, p[1], X.EL.ice[1]); }
      break;
    }
    case 'rime': {
      // cold mist pouring off the lower edge and falling to pool at the feet; a few glints on the face
      // thin wisps, dithered (half-tone puffs), the pooled ones flatter and fading
      for (const q of emit(t, 6 * big, 1.8, (j, age) => {
        const a = Math.PI * (0.15 + 0.7 * rand(j, 3, seed)), p = rim(f, a), lo = p[1] > f.y ? p : rim(f, a + Math.PI);
        const fall = Math.min(feet - lo[1], age * 22);
        return { x: lo[0] + (rand(j, 4, seed) - 0.5) * 8 * age, y: lo[1] + fall, age, pool: lo[1] + fall >= feet - 0.5 };
      })) {
        if (q.pool) X.ellipse(o, q.x, q.y, 2 + q.age * 5, 1 + q.age, X.FROST[3], 0.5);
        else K.puff(o, q.x, q.y, 1 + q.age * 1.5, q.age < 0.4 ? X.FROST[1] : X.FROST[3], 0.5);
      }
      if (fl % 5 === 0) { const p = rim(f, rand(fl, 5, seed) * TAU, 0.6); X.px(o, p[0], p[1], '#ffffff'); }
      break;
    }
    case 'tide': {
      // the curtain's edge throws spray outward, and droplets fall from it
      for (const q of emit(t, 26 * big, 0.5, (j, age) => {
        const a = rand(j, 6, seed) * TAU + t * 2, p = rim(f, a), dx = p[0] - f.x, dy = p[1] - f.y, d = Math.hypot(dx, dy) || 1;
        return { x: p[0] + (dx / d) * age * 8 * big, y: p[1] + (dy / d) * age * 8 * big + age * age * 10, age };
      })) X.px(o, q.x, q.y, q.age < 0.4 ? '#ffffff' : X.EL.water[1]);
      if (blocking) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + t * 3, p = rim(f, a, 1.1), z = rim(f, a, 1.6); X.lines(o, [p, z], X.EL.water[2]); }
      break;
    }
    case 'leaf': {
      // pollen drifting up, and now and then a small leaf falling
      K.sparkle(o, f.x, f.y, t, 1, R, seed, X.LIFE, 6);
      for (const q of emit(t, 1.2, 2, (j, age) => { const p = rim(f, rand(j, 7, seed) * TAU); return { x: p[0] + Math.sin(age * 8 + j) * 3, y: p[1] + age * Math.max(4, feet - p[1]), age }; })) {
        X.px(o, q.x, q.y, X.LIFE[4]); X.px(o, q.x + 1, q.y, X.LIFE[3]);
      }
      break;
    }
    case 'bulwark': {
      // grit and pebbles shaking off its edges
      for (const q of emit(t, 6 * big, 0.7, (j, age) => { const p = rim(f, rand(j, 8, seed) * TAU); return { x: p[0], y: Math.min(feet, p[1] + age * age * 30), age, j }; }))
        X.px(o, q.x, q.y, q.j % 2 ? X.EARTH[2] : X.EARTH[4]);
      break;
    }
    case 'prism': {
      // spectral glints chasing round the edges (the facets' sweep is the shell's)
      for (let k = 0; k < 3; k++) { const a = t * 1.7 + (k / 3) * TAU, p = rim(f, a, 0.95); X.px(o, p[0], p[1], SPECTRUM[(fl + k * 2) % SPECTRUM.length]); X.px(o, p[0], p[1] - 1, '#ffffff'); }
      break;
    }
    case 'mirror': {
      if (fl % 7 === 0) { const p = rim(f, rand(fl, 9, seed) * TAU, 0.5); X.px(o, p[0], p[1], '#ffffff'); }
      break;
    }
  }
  // Blocking, the element bursts out of the guard's face, in pulses; the first one as the guard comes up is the biggest.
  if (blocking && id !== 'mirror' && el) {
    const e = (t * 2.2) % 1;
    A.burst(o, [f.x, f.y], [el], e, seed + Math.floor(t * 2.2), 10, R * 2 * (1.4 - 0.4 * raise));
    if (raise < 1) A.burst(o, [f.x, f.y], [el], raise, seed + 77, 16, R * 3);
  }
}
