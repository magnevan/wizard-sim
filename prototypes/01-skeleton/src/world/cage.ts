// A.1 Cage (Point + Shield on an enemy): a bubble that traps one body for a
// few seconds. The body can't leave, other bodies can't enter, projectiles
// and rays stop at the bubble from either side, and hits across it are dropped.

import { add, dist, dot, len, scale, sub, type Vec2 } from '../core/vec2';
import type { Entity, Team } from './entity';
import type { World } from './world';

export function spawnCage(world: World, target: Entity, margin: number, duration: number, ownerId: number, team?: Team): Entity {
  // One cage per body: a new one replaces the old.
  for (const c of liveCages(world)) if (c.cage!.targetId === target.id) world.remove(c);
  world.cue('cage', target.pos);
  world.floater({ x: target.pos.x, y: target.pos.y - 1.3 }, 'Caged!', '#ffe08a', true);
  return world.spawn({
    kind: 'structure',
    team,
    pos: { ...target.pos },
    radius: (target.radius ?? 0.4) + margin,
    cage: { targetId: target.id, ownerId, createdAt: world.time },
    expiresAt: world.time + duration,
  });
}

export function liveCages(world: World): Entity[] {
  return world.entities.filter((e) => e.cage && !e.removed);
}

export function cageOf(world: World, id: number | null | undefined): Entity | undefined {
  if (id == null) return undefined;
  return world.entities.find((e) => e.cage?.targetId === id && !e.removed);
}

/** A hit crosses a bubble: the caged body hitting out, or anything else hitting in. Status ticks (no source) pass. */
export function cageBlocksHit(world: World, targetId: number, sourceId: number | null): boolean {
  if (sourceId === null || sourceId === targetId) return false;
  return !!cageOf(world, targetId) || !!cageOf(world, sourceId);
}

/** Keep the caged body inside and everyone else outside (runs with collisions). */
export function cageCollisions(world: World): void {
  for (const c of liveCages(world)) {
    const R = c.radius!;
    const caged = world.get(c.cage!.targetId);
    if (!caged || caged.removed || caged.downed) {
      world.remove(c);
      continue;
    }
    for (const e of world.entities) {
      if (!e.solid || !e.radius || e.removed || e.downed) continue;
      const d = sub(e.pos, c.pos);
      const l = len(d);
      const n = l > 1e-6 ? scale(d, 1 / l) : { x: 1, y: 0 };
      if (e === caged) {
        if (l + e.radius <= R) continue;
        e.pos = add(c.pos, scale(n, Math.max(0, R - e.radius)));
        killInto(e, n);
      } else if (l < R + e.radius) {
        e.pos = add(c.pos, scale(n, R + e.radius));
        killInto(e, scale(n, -1));
      }
    }
  }
}

/** Remove the velocity component along `n` (into the bubble wall). */
function killInto(e: Entity, n: Vec2): void {
  if (!e.vel) return;
  const v = dot(e.vel, n);
  if (v > 0) e.vel = sub(e.vel, scale(n, v));
}

/** Projectiles: one launched inside a bubble pops on its inside; one from outside pops on its outside. */
export function projectileCaged(world: World, pos: Vec2, start: Vec2, r: number): Entity | undefined {
  for (const c of liveCages(world)) {
    const R = c.radius!;
    const startedIn = dist(start, c.pos) < R;
    const d = dist(pos, c.pos);
    if (startedIn ? d > R - r : d < R + r) return c;
  }
  return undefined;
}

/** Distance along a unit ray to the nearest bubble wall (entry from outside, exit from inside), capped at max. */
export function rayCages(world: World, o: Vec2, dir: Vec2, max: number): number {
  let best = max;
  for (const c of liveCages(world)) {
    const R = c.radius!;
    const oc = sub(o, c.pos);
    const b = dot(oc, dir);
    const cc = dot(oc, oc) - R * R;
    const disc = b * b - cc;
    if (disc < 0) continue;
    const s = Math.sqrt(disc);
    const t = cc <= 0 ? -b + s : -b - s;
    if (t >= 0 && t < best) best = t;
  }
  return best;
}
