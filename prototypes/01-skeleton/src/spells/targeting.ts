import { add, dist, normalize, scale, sub, type Vec2 } from '../core/vec2';
import { isHittable, type Entity } from '../world/entity';
import type { PointTarget } from './types';

/** Max distance of a Point cast from the caster, in world units. */
export const POINT_RANGE = 9;
/** Extra slack around a body's radius for "the cursor is on it". */
const HOVER_SLACK = 0.35;

export interface PointAim {
  point: Vec2;
  targetId: number | null;
  target: PointTarget;
}

/** Clamp the cursor to Point range and find the body under it (ally or enemy). */
export function pointAim(caster: Entity, cursor: Vec2, entities: readonly Entity[]): PointAim {
  const off = sub(cursor, caster.pos);
  const point = dist(cursor, caster.pos) > POINT_RANGE ? add(caster.pos, scale(normalize(off), POINT_RANGE)) : { ...cursor };
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of entities) {
    if (e.id === caster.id || !isHittable(e) || e.kind === 'effect' || e.kind === 'structure') continue;
    const d = dist(e.pos, cursor);
    if (d > (e.radius ?? 0) + HOVER_SLACK || d >= bestD) continue;
    if (dist(e.pos, caster.pos) > POINT_RANGE + (e.radius ?? 0)) continue;
    best = e;
    bestD = d;
  }
  if (!best) return { point, targetId: null, target: 'ground' };
  return { point: { ...best.pos }, targetId: best.id, target: best.team === caster.team ? 'ally' : 'enemy' };
}
