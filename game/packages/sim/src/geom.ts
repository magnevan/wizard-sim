/** Small exact-maths geometry helpers (sqrt is exact; no trig except via trig.ts). */
import { atan2Turns } from './trig';

export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/** Signed difference between two angles in turns, in [-0.5, 0.5). */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  d -= Math.floor(d + 0.5);
  return d;
}

/** Is point (px, py) inside the cone from (ox, oy), facing `face` (turns), half-angle `half` (turns), radius `range`? */
export function inCone(ox: number, oy: number, face: number, half: number, range: number, px: number, py: number, pr = 0): boolean {
  const dx = px - ox, dy = py - oy;
  const d = len(dx, dy);
  if (d > range + pr) return false;
  if (d < 1e-6) return true;
  // Widen the cone by the target's angular radius.
  const slack = pr / (d * 6.283185307179586);
  return Math.abs(angleDiff(atan2Turns(dy, dx), face)) <= half + slack;
}

/** Distance along the ray (ox,oy)+(dx,dy)*t (d unit) to the first touch of a circle, or -1. */
export function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = cx - ox, fy = cy - oy;
  const t = fx * dx + fy * dy;
  if (t < 0) return -1;
  const px = fx - dx * t, py = fy - dy * t;
  const d2 = px * px + py * py;
  if (d2 > r * r) return -1;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}
