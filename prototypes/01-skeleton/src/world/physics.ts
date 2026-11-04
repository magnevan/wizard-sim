import { add, clampLen, dot, len, normalize, scale, sub, ZERO, type Vec2 } from '../core/vec2';
import { isIntangible, speedMultiplier } from '../statuses/statuses';
import { cageCollisions } from './cage';
import type { Entity } from './entity';
import { circleAabbPush, circleCapsulePush } from './geometry';
import type { World } from './world';

const active = (e: Entity) => !e.removed && !e.downed;

/** Friction multiplier on ice: knockback slides much further. */
const ICE_FRICTION = 0.12;

/** Integrate walking (intent) plus physical velocity (knockback), then apply friction. */
export function movementSystem(world: World, dt: number): void {
  for (const e of world.entities) {
    if (!active(e)) continue;
    let walk = ZERO;
    if (e.move && e.moveSpeed) {
      const mult = speedMultiplier(e.statuses) * (e.caster?.moveMult ?? 1);
      walk = scale(clampLen(e.move, 1), e.moveSpeed * mult);
    }
    const vel = e.vel ?? ZERO;
    e.pos = add(e.pos, scale(add(walk, vel), dt));
    if (e.vel && e.friction) e.vel = scale(e.vel, Math.exp(-e.friction * (e.onIce ? ICE_FRICTION : 1) * dt));
  }
}

/** Circle-vs-circle separation between solid bodies, then circle-vs-wall (level walls and conjured walls). */
export function collisionSystem(world: World): void {
  const bodies = world.entities.filter((e) => e.solid && e.radius && active(e));

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      // Ethereal bodies pass through other bodies (walls still stop them).
      if (isIntangible(a.statuses) || isIntangible(b.statuses)) continue;
      const d = sub(b.pos, a.pos);
      const r = a.radius! + b.radius!;
      const l = len(d);
      if (l >= r) continue;
      const n = l > 1e-6 ? scale(d, 1 / l) : { x: 1, y: 0 };
      const ia = 1 / (a.mass ?? 1);
      const ib = 1 / (b.mass ?? 1);
      const overlap = r - l;
      a.pos = sub(a.pos, scale(n, (overlap * ia) / (ia + ib)));
      b.pos = add(b.pos, scale(n, (overlap * ib) / (ia + ib)));
    }
  }

  const conjured = world.entities.filter((e) => e.wall && !e.removed);
  for (const e of bodies) {
    for (const w of world.walls) resolvePush(e, circleAabbPush(e.pos, e.radius!, w));
    for (const s of conjured) {
      const w = s.wall!;
      if (w.guard && w.ownerId === e.id) continue;
      resolvePush(e, circleCapsulePush(e.pos, e.radius!, w.a, w.b, w.half));
    }
  }
  cageCollisions(world);
}

function resolvePush(e: Entity, push: Vec2 | null): void {
  if (!push) return;
  e.pos = add(e.pos, push);
  if (e.vel) {
    // Kill the velocity component going into the wall.
    const nrm = normalize(push);
    const into = dot(e.vel, nrm);
    if (into < 0) e.vel = sub(e.vel, scale(nrm, into));
  }
}

export function applyImpulse(e: Entity, impulse: { x: number; y: number }): void {
  if (!e.vel) return;
  e.vel = add(e.vel, scale(impulse, 1 / (e.mass ?? 1)));
}
