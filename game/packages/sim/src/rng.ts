/**
 * Seeded PRNG (sfc32) whose whole state is four uint32s in a Uint32Array, so a world snapshot
 * copies it like any other buffer. Integer ops only: identical on every JS engine.
 * Cosmetic code (particles, screen shake) must use its own generator, never this one.
 */
export type RngState = Uint32Array;

export function createRng(seed: number): RngState {
  // splitmix32 spreads a small seed over the four words.
  const s = new Uint32Array(4);
  let x = seed >>> 0;
  for (let i = 0; i < 4; i++) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    s[i] = (z ^ (z >>> 16)) >>> 0;
  }
  for (let i = 0; i < 12; i++) nextU32(s);
  return s;
}

export function nextU32(s: RngState): number {
  const a = s[0], b = s[1], c = s[2], d = s[3];
  const t = (((a + b) | 0) + d) | 0;
  s[3] = (d + 1) | 0;
  s[0] = b ^ (b >>> 9);
  s[1] = (c + (c << 3)) | 0;
  const r = (c << 21) | (c >>> 11);
  s[2] = (r + t) | 0;
  return t >>> 0;
}

/** Uniform in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Integer in [min, maxInclusive]. */
export function nextInt(s: RngState, min: number, maxInclusive: number): number {
  return min + Math.floor(nextFloat(s) * (maxInclusive - min + 1));
}
