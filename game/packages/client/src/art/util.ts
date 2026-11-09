/**
 * Cosmetic maths shared by the art code. Every random-looking choice is a hash of integers
 * (an effect's seed, a particle index), never Math.random, so a frame is a pure function of
 * the sim state and the clock and screenshots don't flicker between runs.
 */
export const TAU = Math.PI * 2;
/** The true isometric camera, on trial behind ?camera=iso (iso-world.ts). Off everywhere else. */
export const ISO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('camera') === 'iso';
/** Ground squash of the camera: Pixel Battlefield's 3/4 view (pass 4), or isometric's 2:1. */
export const FY = ISO ? 0.5 : 0.6;
/** Height is drawn at CU px per rig unit: squat under the steep camera, but still readable. */
export const CU = 0.8;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
export const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Integer hash -> [0, 1). The mock-ups' rand, so ported effects keep their exact scatter. */
export function rand(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 40503, 668265263) ^ Math.imul((c | 0) + 32587, 1442695041);
  h = Math.imul(h ^ (h >>> 15), -2048144777); h = Math.imul(h ^ (h >>> 13), -1028477379); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * A steady particle emitter as a pure function of time: particle k is born at k / rate and
 * lives `life` seconds. Only the live ones are visited, and with from/to only those born in
 * that window. Unlike the gallery's looping version, indices never wrap.
 */
export function emit<T>(t: number, rate: number, life: number, fn: (i: number, age: number, ts: number) => T | null, from?: number, to?: number): T[] {
  const out: T[] = [];
  if (rate <= 0 || !Number.isFinite(t) || !Number.isFinite(life)) return out;
  const dt = 1 / rate;
  let k0 = Math.ceil((t - life) / dt), k1 = Math.floor(t / dt);
  if (from !== undefined) k0 = Math.max(k0, Math.ceil(from / dt));
  if (to !== undefined) k1 = Math.min(k1, Math.floor(to / dt));
  if (k1 - k0 > 4000) k0 = k1 - 4000;
  for (let k = k0; k <= k1; k++) {
    const ts = k * dt, age = (t - ts) / life;
    if (age < 0 || age >= 1) continue;
    const p = fn(k, age, ts);
    if (p) out.push(p);
  }
  return out;
}

/** Smooth value noise, 0..1. */
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(rand(xi, yi, s), rand(xi + 1, yi, s), u), lerp(rand(xi, yi + 1, s), rand(xi + 1, yi + 1, s), u), v);
}
