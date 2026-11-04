// Conjured structures: walls (capsules that block bodies, projectiles and
// beams) and lenses. Runes live in spells/vessels.ts, surfaces in surfaces.ts.

import { add, fromAngle, scale, sub, type Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import { applyPayload } from '../spells/hit';
import type { Payload, WallMaterial } from '../spells/types';
import { rayCages } from './cage';
import { distToSegment, rayCapsule, rayWalls } from './geometry';
import { isHittable, type Entity, type Team, type WallState } from './entity';
import type { World } from './world';

const BARRIER_PULSE = 0.5;

export interface WallOptions {
  ownerId: number;
  team?: Team;
  a: Vec2;
  b: Vec2;
  half: number;
  material: WallMaterial;
  duration: number;
  reflectAll?: boolean;
  payload?: Payload;
  elements?: readonly Element[];
  guard?: { distance: number; length: number };
}

export function spawnWall(world: World, o: WallOptions): Entity {
  const wall: WallState = {
    a: { ...o.a },
    b: { ...o.b },
    half: o.half,
    material: o.material,
    ownerId: o.ownerId,
    reflectAll: !!o.reflectAll,
    guard: o.guard,
    payload: o.payload,
    elements: o.elements ?? [],
    pulseTimer: BARRIER_PULSE,
  };
  return world.spawn({
    kind: 'structure',
    team: o.team,
    pos: scale(add(o.a, o.b), 0.5),
    wall,
    expiresAt: world.time + o.duration,
  });
}

/** A wall segment of `length` centered at `c`, perpendicular to `facing`. */
export function segmentAcross(c: Vec2, facing: number, length: number): [Vec2, Vec2] {
  const t = fromAngle(facing + Math.PI / 2, length / 2);
  return [sub(c, t), add(c, t)];
}

export function spawnLens(world: World, pos: Vec2, radius: number, duration: number, team?: Team): Entity {
  return world.spawn({
    kind: 'structure',
    team,
    pos: { ...pos },
    radius,
    lens: { primaryId: null, primarySeenAt: -1, mergedSeenAt: -1 },
    expiresAt: world.time + duration,
  });
}

export function liveWalls(world: World): Entity[] {
  return world.entities.filter((e) => e.wall && !e.removed);
}

/** Distance along a ray to the nearest level wall, conjured wall or cage bubble. */
export function rayBlockers(world: World, o: Vec2, d: Vec2, max: number): number {
  let best = rayCages(world, o, d, rayWalls(o, d, world.walls, max));
  for (const e of world.entities) {
    const w = e.wall;
    if (!w || e.removed) continue;
    const t = rayCapsule(o, d, w.a, w.b, w.half);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/** Expire structures, keep guards in front of their owner, pulse elemental barriers. */
export function structureSystem(world: World, dt: number): void {
  for (const e of world.entities) {
    if (e.removed) continue;
    if ((e.kind === 'structure' || e.kind === 'effigy') && e.expiresAt !== undefined && world.time >= e.expiresAt) {
      world.remove(e);
      continue;
    }
    const w = e.wall;
    if (!w) continue;
    if (w.guard) {
      const owner = world.get(w.ownerId);
      if (!owner || owner.removed || owner.downed) {
        world.remove(e);
        continue;
      }
      const f = owner.facing ?? 0;
      e.pos = add(owner.pos, fromAngle(f, w.guard.distance));
      [w.a, w.b] = segmentAcross(e.pos, f, w.guard.length);
    }
    if (w.payload) {
      w.pulseTimer += dt;
      if (w.pulseTimer < BARRIER_PULSE) continue;
      w.pulseTimer -= BARRIER_PULSE;
      for (const t of world.entities) {
        if (!isHittable(t) || t.kind === 'effect' || t.id === w.ownerId) continue;
        if (distToSegment(t.pos, w.a, w.b) > (t.radius ?? 0) + w.half + 0.15) continue;
        applyPayload(world, { ownerId: w.ownerId, team: e.team }, t, w.payload, BARRIER_PULSE, sub(t.pos, e.pos));
      }
    }
  }
}
