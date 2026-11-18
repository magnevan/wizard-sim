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
/**
 * The frame with its narrow side kept at least k of its wide one: seen edge-on a guard's face is a line, and things
 * drawn round its rim (the Ember's flames) should still make a shield's shape, not a vertical streak (round 3).
 */
function widen(f: GuardFrame, k: number): GuardFrame {
  const lu = Math.hypot(f.u[0], f.u[1]), lv = Math.hypot(f.v[0], f.v[1]);
  if (lv >= lu * k || lu < 1e-6) return f;
  const px = -f.u[1] / lu, py = f.u[0] / lu, sgn = f.v[0] * px + f.v[1] * py >= 0 ? 1 : -1, want = lu * k;
  return { ...f, v: [px * want * sgn, py * want * sgn] };
}
/** How far out the rim reaches on screen (px), for spreads. */
const reach = (f: GuardFrame): number => Math.max(3, Math.hypot(f.u[0], f.u[1]), Math.hypot(f.v[0], f.v[1]));
const SPECTRUM = ['#ff6a8a', '#ffb84a', '#fff27a', '#7af08a', '#6ad8ff', '#9a8aff', '#f08aff'];
/** The Ember's flame, brightest first (K.tongue: core, middle, edge): yellow at the heart, orange, red round the rim. */
const HEART = ['#ffffff', '#fffbe0', '#fff4c0', '#ffe060', '#ffc040'], MID = ['#fff4c0', '#ffd860', '#ffb040', '#ff9a30', '#ff7a28'];
const OUTER = ['#ffd860', '#ff9a30', '#ff6a24', '#e8402a', '#b8281e'];

/**
 * Where each guard was lately (by seed): things that fall off it (mist, grit, chips, leaves) start from where the guard
 * was when they fell, so they stay behind as the wizard moves on instead of riding along. Field px, which the camera
 * doesn't move. View state only, never the sim's.
 */
const TRAIL = new Map<number, { t: number; f: GuardFrame; feet: number }[]>();
const KEEP = 2.5;
function remember(seed: number, t: number, f: GuardFrame, feet: number): void {
  let h = TRAIL.get(seed);
  if (!h) TRAIL.set(seed, (h = []));
  if (h.length && t < h[h.length - 1].t) h.length = 0;   // time went back (a new room, a reset)
  if (!h.length || t > h[h.length - 1].t) h.push({ t, f, feet });
  while (h.length > 1 && h[0].t < t - KEEP) h.shift();
}
/** The guard as it was at time ts (the latest record at or before it; the oldest kept if ts is older). */
function born(seed: number, ts: number): { f: GuardFrame; feet: number } {
  const h = TRAIL.get(seed)!;
  for (let k = h.length - 1; k >= 0; k--) if (h[k].t <= ts) return h[k];
  return h[0];
}

/**
 * Draws a live guard's moving parts. `id` is the guard's name (GUARD_NAME), `el` its element id (for the block bursts),
 * `blocking` / `raise` its block, `feet` the wizard's feet y (where mist pools and grit lands).
 */
export function guardFx(o: Ctx, id: string, el: number, f: GuardFrame, t: number, blocking: boolean, raise: number, feet: number, seed: number): void {
  const fl = Math.floor(t * 20), big = blocking ? 1.4 : 1, R = reach(f);
  remember(seed, t, f, feet);
  switch (id) {
    case 'ember': {
      f = widen(f, 0.6);
      // a shield made of flame (the user, 2026-11-18: "more yellow -> red ... the border less defined"): tongues across
      // the whole face, yellow at the heart, orange, then red round a ragged rim, all rising whatever the guard's tilt
      for (const [k, n, Rr, hk] of [[1.08, 12, OUTER, 1], [0.72, 9, MID, 0.85], [0.35, 5, HEART, 0.7]] as const) {
        for (let q = 0; q < n; q++) {
          const a = (q / n) * TAU + t * (0.5 + k * 0.3) + k, p = rim(f, a, k + (rand(q, fl >> 1, seed + k * 9) - 0.5) * 0.25);
          const h = (3 + 4 * rand(q, fl, seed + 1)) * big * hk * (p[1] < f.y ? 1.25 : 0.85), w = (0.9 + rand(q, fl >> 1, seed) * 0.7) * big;
          K.tongue(o, p[0], p[1] + 1, w, h, Math.sin(t * 9 + q * 1.7 + k * 3) * 1.4, Rr);
        }
      }
      for (const q of emit(t, 12 * big, 0.8, (j, age) => { const p = rim(f, rand(j, 2, seed) * TAU, 0.3 + 0.8 * rand(j, 3, seed)); return { x: p[0] + Math.sin(j + age * 7) * 2, y: p[1] - age * 16, age }; }))
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
      // ice chips breaking off and falling where it was, hard glints on the spikes
      for (const q of emit(t, 5 * big, 0.6, (j, age, ts) => { const g = born(seed, ts), p = rim(g.f, rand(j, 10, seed) * TAU); return { x: p[0], y: Math.min(g.feet, p[1] + age * age * 26), age }; }))
        X.px(o, q.x, q.y, q.age < 0.5 ? '#ffffff' : X.EL.ice[3]);
      for (let k = 0; k < 2; k++) if ((fl + k * 3) % 6 === 0) { const p = rim(f, rand(fl, 11 + k, seed) * TAU, 1.05); X.px(o, p[0], p[1], '#ffffff'); X.px(o, p[0] - 1, p[1], X.EL.ice[1]); X.px(o, p[0] + 1, p[1], X.EL.ice[1]); }
      break;
    }
    case 'rime': {
      // frost fog rolling off the lower edge (the user, 2026-11-18: not a stippled blue, and what has fallen stays where
      // it fell): pale wisps, each from where the shield was when it left it, sinking slowly and swelling as they thin,
      // then spreading low over the ground and fading
      for (const q of emit(t, 6 * big, 2.2, (j, age, ts) => {
        const g = born(seed, ts), a = Math.PI * (0.2 + 0.6 * rand(j, 3, seed)), p0 = rim(g.f, a), lo = p0[1] > g.f.y ? p0 : rim(g.f, a + Math.PI);
        const sink = Math.min(g.feet - lo[1], age * age * 30 + age * 6), ground = lo[1] + sink >= g.feet - 0.5;
        return { x: lo[0] + (rand(j, 4, seed) - 0.5) * 10 * age + Math.sin(age * 5 + j) * 1.2, y: lo[1] + sink, age, ground };
      })) {
        // solid pale wisps that thin by shrinking, never dithered (a half-tone read as a stippled blue patch, not frost)
        const fade = 1 - q.age;
        if (q.ground) K.puff(o, q.x, q.y, (1.5 + q.age * 3) * fade + 0.4, q.age < 0.6 ? X.FROST[0] : X.FROST[1], 1);
        else K.puff(o, q.x, q.y, (0.8 + q.age * 1.6) * (0.4 + 0.6 * fade), q.age < 0.3 ? '#ffffff' : X.FROST[0], 1);
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
      for (const q of emit(t, 1.2, 2, (j, age, ts) => { const g = born(seed, ts), p = rim(g.f, rand(j, 7, seed) * TAU); return { x: p[0] + Math.sin(age * 8 + j) * 3, y: p[1] + age * Math.max(4, g.feet - p[1]), age }; })) {
        X.px(o, q.x, q.y, X.LIFE[4]); X.px(o, q.x + 1, q.y, X.LIFE[3]);
      }
      break;
    }
    case 'bulwark': {
      // grit and pebbles shaking off its edges
      for (const q of emit(t, 6 * big, 0.7, (j, age, ts) => { const g = born(seed, ts), p = rim(g.f, rand(j, 8, seed) * TAU); return { x: p[0], y: Math.min(g.feet, p[1] + age * age * 30), age, j }; }))
        X.px(o, q.x, q.y, q.j % 2 ? X.EARTH[2] : X.EARTH[4]);
      break;
    }
    case 'prism': {
      // now and then a single spectral glint (the colour itself is the shell's, by each facet's angle to the camera)
      if (fl % 9 === 0) { const p = rim(f, rand(fl, 12, seed) * TAU, 0.8); X.px(o, p[0], p[1], '#ffffff'); X.px(o, p[0] + 1, p[1], SPECTRUM[(fl / 9) % SPECTRUM.length | 0]); }
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
