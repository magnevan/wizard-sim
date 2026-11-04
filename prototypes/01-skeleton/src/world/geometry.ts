import { type Vec2, dot, sub } from '../core/vec2';

/** Axis-aligned box: min corner + size. */
export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Push vector that moves a circle out of a box, or null if not overlapping. */
export function circleAabbPush(c: Vec2, r: number, b: Aabb): Vec2 | null {
  const cx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(c.y, b.y + b.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
  }
  // Center inside the box: push out along the shallowest axis.
  const left = c.x - b.x + r;
  const right = b.x + b.w - c.x + r;
  const up = c.y - b.y + r;
  const down = b.y + b.h - c.y + r;
  const m = Math.min(left, right, up, down);
  if (m === left) return { x: -left, y: 0 };
  if (m === right) return { x: right, y: 0 };
  if (m === up) return { x: 0, y: -up };
  return { x: 0, y: down };
}

export function pointInAabb(p: Vec2, b: Aabb): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Distance along a unit ray to a box (slab test), or null. */
export function rayAabb(o: Vec2, d: Vec2, b: Aabb): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ['x', 'y'] as const) {
    const lo = axis === 'x' ? b.x : b.y;
    const hi = lo + (axis === 'x' ? b.w : b.h);
    if (Math.abs(d[axis]) < 1e-9) {
      if (o[axis] < lo || o[axis] > hi) return null;
      continue;
    }
    let t1 = (lo - o[axis]) / d[axis];
    let t2 = (hi - o[axis]) / d[axis];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** Distance along a unit ray to a circle's surface, or null. */
export function rayCircle(o: Vec2, d: Vec2, c: Vec2, r: number): number | null {
  const oc = sub(o, c);
  const b = dot(oc, d);
  const cc = dot(oc, oc) - r * r;
  if (cc <= 0) return 0; // origin inside
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const c = closestOnSegment(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

/** Push vector moving a circle out of a capsule (segment a-b with half-thickness h), or null. */
export function circleCapsulePush(c: Vec2, r: number, a: Vec2, b: Vec2, h: number): Vec2 | null {
  const q = closestOnSegment(c, a, b);
  const dx = c.x - q.x;
  const dy = c.y - q.y;
  const d = Math.hypot(dx, dy);
  const reach = r + h;
  if (d >= reach) return null;
  if (d < 1e-9) {
    // Exactly on the axis: push out along the segment normal.
    const n = { x: -(b.y - a.y), y: b.x - a.x };
    const l = Math.hypot(n.x, n.y) || 1;
    return { x: (n.x / l) * reach, y: (n.y / l) * reach };
  }
  return { x: (dx / d) * (reach - d), y: (dy / d) * (reach - d) };
}

/** Distance along a unit ray to segment p-q, or null. */
function raySegment(o: Vec2, d: Vec2, p: Vec2, q: Vec2): number | null {
  const e = sub(q, p);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(p, o);
  const t = (w.x * e.y - w.y * e.x) / den;
  const u = (w.x * d.y - w.y * d.x) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}

/** Distance along a unit ray to a capsule's surface, or null. */
export function rayCapsule(o: Vec2, d: Vec2, a: Vec2, b: Vec2, h: number): number | null {
  if (distToSegment(o, a, b) <= h) return 0;
  const ab = sub(b, a);
  const l = Math.hypot(ab.x, ab.y) || 1;
  const n = { x: (-ab.y / l) * h, y: (ab.x / l) * h };
  let best: number | null = null;
  const consider = (t: number | null) => {
    if (t !== null && (best === null || t < best)) best = t;
  };
  consider(raySegment(o, d, { x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }));
  consider(raySegment(o, d, { x: a.x - n.x, y: a.y - n.y }, { x: b.x - n.x, y: b.y - n.y }));
  consider(rayCircle(o, d, a, h));
  consider(rayCircle(o, d, b, h));
  return best;
}

/** Nearest wall hit along a ray, capped at maxDist. */
export function rayWalls(o: Vec2, d: Vec2, walls: readonly Aabb[], maxDist: number): number {
  let best = maxDist;
  for (const w of walls) {
    const t = rayAabb(o, d, w);
    if (t !== null && t < best) best = t;
  }
  return best;
}
