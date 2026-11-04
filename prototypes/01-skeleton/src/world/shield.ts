import { angleDiff, angleOf, len, scale, type Vec2 } from '../core/vec2';
import { canCast } from '../statuses/statuses';
import { ARCHETYPES, type ArchetypeDef } from './archetypes';
import type { Entity } from './entity';
import type { World } from './world';

export function archetypeOf(e: Entity): ArchetypeDef | null {
  return e.ai?.kind === 'enemy' ? ARCHETYPES[e.ai.archetype] : null;
}

/**
 * Shieldbearer: something travelling along `travel` hits the frontal arc.
 * A frozen or stunned bearer drops its guard.
 */
export function shieldBlocks(holder: Entity, travel: Vec2): boolean {
  const s = archetypeOf(holder)?.shield;
  if (!s || len(travel) < 1e-6 || !canCast(holder.statuses)) return false;
  return frontalHit(holder.facing ?? 0, travel, s.halfArc);
}

/** Pure: does a hit travelling along `travel` come from inside the arc around `facing`? */
export function frontalHit(facing: number, travel: Vec2, halfArc: number): boolean {
  return Math.abs(angleDiff(facing, angleOf(scale(travel, -1)))) <= halfArc;
}

/** Shield flash + a rate-limited "Blocked" floater. */
export function noteBlock(world: World, holder: Entity): void {
  if (world.time - (holder.blockedAt ?? -9) > 0.7) world.floater({ x: holder.pos.x, y: holder.pos.y - 1.1 }, 'Blocked', '#c9d6f0');
  holder.blockedAt = world.time;
}
