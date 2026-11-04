/**
 * Deterministic trig. JS only guarantees + - * / and sqrt bit-for-bit across engines;
 * Math.sin, atan2, exp and pow may differ between V8, SpiderMonkey and JavaScriptCore.
 * These use only exact ops, so every peer computes the same bits.
 *
 * Angles are in turns (1 = a full circle), which keeps range reduction exact.
 */
const TAU = 6.283185307179586;

/** sin of an angle in turns. Max error about 4e-9. */
export function sinTurns(t: number): number {
  let x = t - Math.floor(t); // [0, 1)
  // Fold to [-0.25, 0.25] using sin(0.5 - x) = sin(x).
  if (x > 0.75) x -= 1;
  else if (x > 0.25) x = 0.5 - x;
  const r = x * TAU; // [-π/2, π/2]
  const r2 = r * r;
  // Taylor series to r^15, evaluated Horner-style.
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))));
}

export function cosTurns(t: number): number {
  return sinTurns(t + 0.25);
}

/** atan2 in turns, in (-0.5, 0.5]. Max error about 1e-7 turns. */
export function atan2Turns(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y);
  const swap = ay > ax;
  const z = swap ? ax / ay : ay / ax; // [0, 1]
  // atan(z) on [0, 1]: above tan(π/8), use atan(z) = π/4 + atan((z - 1) / (z + 1)), so the
  // series argument u always stays within ±0.4143 and 18 terms reach full precision.
  const high = z > 0.41421356237309503;
  const u = high ? (z - 1) / (z + 1) : z;
  const u2 = u * u;
  let s = 0;
  let p = u;
  for (let k = 0; k < 18; k++) { s += p / (2 * k + 1) * (k % 2 === 0 ? 1 : -1); p *= u2; }
  let a = (high ? 0.125 : 0) + s / TAU; // turns, [0, 0.125]
  if (swap) a = 0.25 - a;
  if (x < 0) a = 0.5 - a;
  return y < 0 ? -a : a;
}
