import { add, angleDiff, angleOf, clampLen, dist, fromAngle, len, normalize, scale, sub, ZERO, type Vec2 } from '../core/vec2';
import { spawnEffect } from '../spells/effects';
import type { ProjectileSpec } from '../spells/types';
import { canCast, isIntangible } from '../statuses/statuses';
import { ARCHETYPES, type ArchetypeDef } from './archetypes';
import { cageOf } from './cage';
import { isHittable, type EnemyAi, type Entity } from './entity';
import { rayWalls } from './geometry';
import { steer } from './nav';
import type { World } from './world';

const DUMMY_REGEN_DELAY = 3;
const TAUNT_BONUS = 6;
/** Bolt and dash aims track the target for this share of the wind-up, then lock (dodge window). */
const TRACK_SHARE = 0.55;
/** Back-line casters stand this far behind a front-liner, on the far side from their target. */
const COVER_DIST = 2.2;
const EDGE_MARGIN = 1.7;

export function aiSystem(world: World, dt: number): void {
  for (const e of world.entities) {
    if (!e.ai || e.removed || e.downed) continue;
    if (e.ai.kind === 'dummy') updateDummy(world, e);
    else updateEnemy(world, e, e.ai, dt);
  }
}

function updateDummy(world: World, e: Entity): void {
  const d = e.dummy!;
  // Dummies can be knocked around but walk back to their post.
  const toHome = sub(d.home, e.pos);
  e.move = len(toHome) > 0.05 ? clampLen(scale(toHome, 1.5), 1) : ZERO;
  if (d.lastHit && world.time - d.lastHit.at > DUMMY_REGEN_DELAY) e.hp = e.maxHp;
}

function nearestFoe(world: World, e: Entity, wizardsOnly = false): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of world.entities) {
    if (o.team !== 'player' || !isHittable(o) || o.kind === 'effect' || (wizardsOnly && !o.player)) continue;
    // Ethereal wizards aren't worth chasing.
    if (isIntangible(o.statuses)) continue;
    // Effigies draw enemies in: they count as much closer than they are.
    const d = dist(o.pos, e.pos) - (o.taunt ? TAUNT_BONUS : 0);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function setState(ai: EnemyAi, state: EnemyAi['state']): void {
  ai.state = state;
  ai.t = 0;
}

/** Shieldbearers turn slowly (flank them); everything else faces its target at once. */
function turnToward(e: Entity, def: ArchetypeDef, angle: number, dt: number): void {
  const f = e.facing ?? 0;
  if (!def.shield) e.facing = angle;
  else e.facing = f + Math.max(-def.shield.turnRate * dt, Math.min(def.shield.turnRate * dt, angleDiff(f, angle)));
}

const clearShot = (world: World, from: Vec2, to: Vec2) => rayWalls(from, normalize(sub(to, from)), world.walls, dist(from, to)) >= dist(from, to) - 0.3;

function updateEnemy(world: World, e: Entity, ai: EnemyAi, dt: number): void {
  const def = ARCHETYPES[ai.archetype];
  if (!canCast(e.statuses)) {
    // Frozen / stunned: interrupt the attack, drop whoever is held.
    if (ai.state === 'grab') releaseGrab(world, ai, null);
    if (ai.state !== 'approach') setState(ai, 'approach');
    ai.lock = null;
    e.move = ZERO;
    return;
  }
  ai.t += dt;
  if (ai.state === 'dash') return updateDash(world, e, ai, def, dt);
  if (ai.state === 'grab') return updateGrab(world, e, ai, def);

  let target = ai.state === 'windup' ? world.get(ai.targetId) : undefined;
  if (!target || !isHittable(target)) {
    if (ai.state === 'windup') setState(ai, 'approach');
    target = nearestFoe(world, e, def.attack === 'grab');
  }
  ai.targetId = target?.id ?? null;
  if (!target) {
    e.move = ZERO;
    return;
  }
  const toT = sub(target.pos, e.pos);
  const d = len(toT);
  const gap = d - (e.radius ?? 0) - (target.radius ?? 0);
  turnToward(e, def, angleOf(toT), dt);

  switch (ai.state) {
    case 'approach': {
      e.move = approachMove(world, e, def, target);
      const ready =
        def.attack === 'bolt' || def.attack === 'grab'
          ? d <= def.reach && ai.t > 0.4 && clearShot(world, e.pos, target.pos)
          : gap <= def.reach;
      if (ready) {
        setState(ai, 'windup');
        ai.lock = { ...target.pos };
      }
      break;
    }
    case 'windup':
      e.move = ZERO;
      if ((def.attack === 'bolt' || def.attack === 'grab') && ai.t < def.windup * TRACK_SHARE) ai.lock = { ...target.pos };
      if (ai.t >= def.windup) attack(world, e, ai, def, target, gap);
      break;
    case 'cooldown':
      e.move = def.attack === 'bolt' ? approachMove(world, e, def, target) : scale(steer(world, e, target.pos, target), 0.3);
      if (ai.t >= def.cooldown) setState(ai, 'approach');
      break;
  }
}

function approachMove(world: World, e: Entity, def: ArchetypeDef, target: Entity): Vec2 {
  if (def.attack !== 'bolt') return steer(world, e, target.pos, target);
  // Back-line caster: hide behind the nearest brute / shieldbearer, else keep its distance.
  let front: Entity | undefined;
  for (const o of world.entities) {
    if (o.ai?.kind !== 'enemy' || o.removed || (o.ai.archetype !== 'brute' && o.ai.archetype !== 'shieldbearer')) continue;
    if (!front || dist(o.pos, e.pos) < dist(front.pos, e.pos)) front = o;
  }
  const away = normalize(sub(e.pos, target.pos));
  const spot = front
    ? add(front.pos, scale(normalize(sub(front.pos, target.pos)), COVER_DIST + (front.radius ?? 0)))
    : add(target.pos, scale(len(away) > 0 ? away : { x: 1, y: 0 }, def.bolt!.keepAway));
  return dist(spot, e.pos) > 0.5 ? steer(world, e, spot, target) : ZERO;
}

function attack(world: World, e: Entity, ai: EnemyAi, def: ArchetypeDef, target: Entity, gap: number): void {
  const dmg = def.damage * ai.damageMult;
  switch (def.attack) {
    case 'melee': {
      const toT = sub(target.pos, e.pos);
      const inFront = Math.abs(angleDiff(e.facing ?? 0, angleOf(toT))) < 1.2;
      if (gap <= def.reach + 0.45 && inFront) {
        world.hit({ targetId: target.id, sourceId: e.id, damage: { physical: dmg }, statuses: def.hitStatus ? [def.hitStatus] : [], impulse: scale(normalize(toT), def.knockback) });
        world.cue('slash', target.pos);
      }
      break;
    }
    case 'slam': {
      const at = ai.lock ?? target.pos;
      for (const o of world.entities) {
        if (o.team !== 'player' || !isHittable(o) || o.kind === 'effect') continue;
        if (dist(o.pos, at) - (o.radius ?? 0) > def.slamRadius!) continue;
        const out = sub(o.pos, at);
        world.hit({ targetId: o.id, sourceId: e.id, damage: { physical: dmg }, statuses: [], impulse: scale(len(out) > 0.05 ? normalize(out) : fromAngle(e.facing ?? 0), def.knockback) });
      }
      world.cue('quake', at);
      world.cue('slam', at);
      break;
    }
    case 'bolt': {
      const b = def.bolt!;
      const spec: ProjectileSpec = {
        kind: 'projectile', speed: b.speed, radius: b.radius, range: b.range, style: 'hex', tint: ['arcane'],
        payload: { damage: { arcane: dmg }, statuses: [], knockback: def.knockback, sparesTeam: true },
      };
      const facing = angleOf(sub(ai.lock ?? target.pos, e.pos));
      e.facing = facing;
      spawnEffect(world, { ownerId: e.id, team: e.team, pos: e.pos, facing, ownerRadius: e.radius ?? 0 }, spec, ['arcane']);
      break;
    }
    case 'grab': {
      const dir = normalize(sub(ai.lock ?? target.pos, e.pos));
      ai.lock = add(e.pos, scale(dir, def.grab!.dashSpeed * def.grab!.dashTime));
      e.facing = angleOf(dir);
      setState(ai, 'dash');
      return;
    }
  }
  ai.lock = null;
  setState(ai, 'cooldown');
}

function updateDash(world: World, e: Entity, ai: EnemyAi, def: ArchetypeDef, dt: number): void {
  const g = def.grab!;
  const to = sub(ai.lock ?? e.pos, e.pos);
  e.move = ZERO;
  if (len(to) > 0.05) e.pos = add(e.pos, clampLen(to, g.dashSpeed * dt));
  const caged = !!cageOf(world, e.id);
  for (const o of world.entities) {
    if (caged || !o.player || !isHittable(o) || o.grabbedBy || isIntangible(o.statuses)) continue;
    if (dist(o.pos, e.pos) > (o.radius ?? 0) + (e.radius ?? 0) + 0.2) continue;
    ai.grabbedId = o.id;
    ai.grabHp = e.hp ?? 0;
    o.grabbedBy = e.id;
    world.floater({ x: o.pos.x, y: o.pos.y - 1.2 }, 'Grabbed!', '#7fe8e0', true);
    world.cue('slash', o.pos);
    setState(ai, 'grab');
    return;
  }
  if (ai.t >= g.dashTime || len(to) <= 0.05) {
    ai.lock = null;
    setState(ai, 'cooldown');
  }
}

/** Nearest point inside the arena, EDGE_MARGIN from the outer wall closest to `p`. */
export function edgePoint(p: Vec2, w: number, h: number): Vec2 {
  const d = [p.x, w - p.x, p.y, h - p.y];
  const i = d.indexOf(Math.min(...d));
  if (i === 0) return { x: EDGE_MARGIN, y: p.y };
  if (i === 1) return { x: w - EDGE_MARGIN, y: p.y };
  if (i === 2) return { x: p.x, y: EDGE_MARGIN };
  return { x: p.x, y: h - EDGE_MARGIN };
}

function updateGrab(world: World, e: Entity, ai: EnemyAi, def: ArchetypeDef): void {
  const g = def.grab!;
  const t = world.get(ai.grabbedId);
  if (!t || !isHittable(t)) return releaseGrab(world, ai, null);
  const yanked = world.entities.some((x) => x.effect?.spec.kind === 'tether' && x.effect.targetId === t.id && !x.removed);
  if (yanked) return releaseGrab(world, ai, 'Yanked free!');
  if (isIntangible(t.statuses)) return releaseGrab(world, ai, 'Phased free!');
  if ((e.hp ?? 0) <= ai.grabHp - g.breakDamage) return releaseGrab(world, ai, 'Broke free!');

  const dest = edgePoint(e.pos, world.width, world.height);
  const to = sub(dest, e.pos);
  const atEdge = len(to) < 0.3;
  const dir = atEdge ? fromAngle(e.facing ?? 0) : normalize(to);
  e.facing = angleOf(dir);
  e.move = atEdge ? ZERO : scale(dir, Math.min(1, g.dragSpeed / (e.moveSpeed ?? 1)));
  // The victim is dragged along behind.
  t.pos = sub(e.pos, scale(dir, (e.radius ?? 0) + (t.radius ?? 0) + 0.05));
  t.vel = { x: 0, y: 0 };
  if (ai.t >= g.hold) {
    world.hit({ targetId: t.id, sourceId: e.id, damage: { physical: def.damage * ai.damageMult }, statuses: [], impulse: scale(dir, def.knockback) });
    world.cue('slash', t.pos);
    releaseGrab(world, ai, null);
  }
}

function releaseGrab(world: World, ai: EnemyAi, why: string | null): void {
  const t = world.get(ai.grabbedId);
  if (t) {
    t.grabbedBy = undefined;
    if (why) world.floater({ x: t.pos.x, y: t.pos.y - 1.2 }, why, '#8ff09a', true);
  }
  ai.grabbedId = null;
  ai.lock = null;
  setState(ai, 'cooldown');
}
