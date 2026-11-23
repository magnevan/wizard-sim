/**
 * Rounds for the map editor: the scene's `round` object, a true circle (centre, r, in corners) that the compiler snaps
 * every terrace edge lying within tol of onto (tools/kit/compile.py, "rounds"), convex or concave. An optional arc
 * range from/to is in degrees, 0 east and 90 south (y runs down), taken from `from` the way the angle grows to `to`.
 */
export type Pt = [number, number];
export type RoundShape = { centre: Pt; r: number; from?: number; to?: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
export const angleOf = (c: Pt, p: Pt) => (((Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI) % 360 + 360) % 360;
/** Whether angle a (degrees) lies in the range from -> to, as the compiler reads it. */
export function inRange(a: number, from: number, to: number) {
  const a0 = ((from % 360) + 360) % 360, a1 = ((to % 360) + 360) % 360, x = ((a % 360) + 360) % 360;
  return a0 <= a1 ? a0 <= x && x <= a1 : x >= a0 || x <= a1;
}

/** The circle through three points, or null when they are (nearly) in a line. */
export function circle3(a: Pt, b: Pt, c: Pt): { centre: Pt; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return null;
  const s = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const x = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const y = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { centre: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}

/** A round through three points along an edge: the circle, and the arc from the first to the last through the middle. */
export function roundThrough(a: Pt, b: Pt, c: Pt): RoundShape | null {
  const k = circle3(a, b, c);
  if (!k || k.r > 500) return null;
  const A = angleOf(k.centre, a), B = angleOf(k.centre, b), C = angleOf(k.centre, c);
  const [from, to] = inRange(B, A, C) ? [A, C] : [C, A];
  return { centre: [r2(k.centre[0]), r2(k.centre[1])], r: r2(k.r), from: Math.floor(from) % 360, to: Math.ceil(to) % 360 };
}

/** A whole circle from its centre and a point on it. */
export const roundFrom = (centre: Pt, p: Pt): RoundShape => ({ centre: [r2(centre[0]), r2(centre[1])], r: Math.max(0.5, r2(Math.hypot(p[0] - centre[0], p[1] - centre[1]))) });

/** Points along a round (its arc, or the whole circle), about every half cell. */
export function roundPoints(o: RoundShape): Pt[] {
  const a0 = o.from ?? 0;
  let a1 = o.to ?? 360;
  if (o.from != null && o.to != null) { a1 = ((o.to - o.from) % 360 + 360) % 360 + o.from; if (a1 === o.from) a1 += 360; }
  const n = Math.max(12, Math.ceil(((a1 - a0) * Math.PI * o.r) / 180 / 0.5));
  return Array.from({ length: n + 1 }, (_, t) => { const a = ((a0 + ((a1 - a0) * t) / n) * Math.PI) / 180; return [o.centre[0] + o.r * Math.cos(a), o.centre[1] + o.r * Math.sin(a)] as Pt; });
}

/** Where a round's handles go: its centre, its radius (mid-arc), and its arc's ends if it has a range. */
export function roundHandles(o: RoundShape): [string, Pt][] {
  const at = (deg: number): Pt => [o.centre[0] + o.r * Math.cos((deg * Math.PI) / 180), o.centre[1] + o.r * Math.sin((deg * Math.PI) / 180)];
  if (o.from == null || o.to == null) return [['centre', o.centre], ['r', at(90)]];
  const span = ((o.to - o.from) % 360 + 360) % 360;
  return [['centre', o.centre], ['r', at(o.from + span / 2)], ['from', at(o.from)], ['to', at(o.to)]];
}
