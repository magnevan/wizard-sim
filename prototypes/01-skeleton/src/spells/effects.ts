// Generic effect entities. Every effect is parameterized by its spec and
// payload, so a new resolver can reuse them without touching this file.

import { add, angleDiff, angleOf, dist, dot, fromAngle, len, normalize, scale, sub, ZERO, type Vec2 } from '../core/vec2';
import { has as hasStatus, isIntangible } from '../statuses/statuses';
import { projectileCaged } from '../world/cage';
import { applyImpulse } from '../world/physics';
import { isHittable, type Entity, type Team } from '../world/entity';
import { circleAabbPush, circleCapsulePush, rayCircle, rayWalls } from '../world/geometry';
import { noteBlock, shieldBlocks } from '../world/shield';
import { rayBlockers, spawnWall } from '../world/structures';
import type { World } from '../world/world';
import type { Element } from './elements';
import { applyPayload } from './hit';
import { scalePayload } from './payload';
import type { EffectState, Payload, SpawnableSpec } from './types';
import { triggerLoaded } from './vessels';

export interface EffectOrigin {
  ownerId: number;
  team?: Team;
  pos: Vec2;
  /** Aim angle in radians. */
  facing: number;
  /** Projectiles spawn just outside this radius. */
  ownerRadius: number;
}

export interface SpawnOptions {
  /** 0..1 hold-to-charge level (chargeable projectiles). */
  charge?: number;
  /** Tether target. */
  targetId?: number;
  /** Not owned by a held cast: sustained zones become stationary with a fixed lifetime. */
  free?: boolean;
}

const SWING_LIFE = 0.22;
const BURST_FADE = 0.25;
const FREE_SUSTAIN = 3;
const LENS_BOOST = 1.5;
const LENS_MERGED_BOOST = 2.25;

export function originOf(e: Entity): EffectOrigin {
  return { ownerId: e.id, team: e.team, pos: e.pos, facing: e.facing ?? 0, ownerRadius: e.radius ?? 0 };
}

function isAttached(spec: SpawnableSpec): boolean {
  return spec.kind === 'beam' || spec.kind === 'spray' || spec.kind === 'swing' || spec.kind === 'arc' || (spec.kind === 'zone' && !!spec.follow);
}

export function spawnEffect(world: World, o: EffectOrigin, spec0: SpawnableSpec, elements: readonly Element[], opts: SpawnOptions = {}): Entity[] {
  let spec = spec0;
  if (opts.free && spec.kind === 'zone' && (spec.follow || spec.duration > 20)) spec = { ...spec, follow: false, duration: Math.min(spec.duration, FREE_SUSTAIN) };
  const base = (dir: Vec2, payload: Payload = spec.payload): EffectState => ({
    spec,
    payload,
    ownerId: o.ownerId,
    elements: spec.tint ?? elements,
    age: 0,
    dir,
    attached: isAttached(spec),
    hit: new Set(),
    pulseTimer: 'pulse' in spec ? spec.pulse : 0, // first pulse lands immediately
    reach: 0,
    traveled: 0,
    start: { ...o.pos },
    targetId: opts.targetId,
    bounces: spec.kind === 'projectile' ? (spec.bounces ?? 0) : 0,
    reflects: 0,
  });

  if (spec.kind === 'projectile') {
    const k = spec.chargeable ? Math.max(0, Math.min(1, opts.charge ?? 0)) : 0;
    const speed = spec.speed * (spec.chargeable ? 0.75 + 0.6 * k : 1);
    const radius = spec.radius * (1 + 0.35 * k);
    const payload = spec.chargeable ? scalePayload(spec.payload, 0.6 + 0.9 * k) : spec.payload;
    const n = spec.count ?? 1;
    const spread = spec.spread ?? 0;
    const out: Entity[] = [];
    for (let i = 0; i < n; i++) {
      const a = o.facing + (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1));
      const dir = fromAngle(a);
      const st = base(dir, payload);
      st.pierce = k >= 0.999;
      out.push(world.spawn({ kind: 'effect', team: o.team, pos: add(o.pos, scale(dir, o.ownerRadius + radius + 0.05)), vel: scale(dir, speed), radius, effect: st }));
    }
    if (k >= 0.999) world.cue('charged', o.pos);
    return out;
  }
  return [world.spawn({ kind: 'effect', team: o.team, pos: { ...o.pos }, radius: 0, effect: base(fromAngle(o.facing)) })];
}

/** Nothing in it hurts or shoves (heals, Lantern): it still reaches Ethereal bodies. */
export function harmless(p: Payload): boolean {
  return p.knockback <= 0 && p.statuses.length === 0 && Object.entries(p.damage).every(([type, v]) => type === 'life' || !v);
}

function canHit(eff: EffectState, t: Entity): boolean {
  if (!isHittable(t) || t.kind === 'effect') return false;
  if (eff.spec.kind === 'zone' && eff.spec.selfOnly) return t.id === eff.ownerId;
  // Ethereal: attacks pass straight through.
  if (isIntangible(t.statuses) && !harmless(eff.payload)) return false;
  return t.id !== eff.ownerId || !!eff.payload.hitsCaster;
}

function deliver(world: World, e: Entity, eff: EffectState, t: Entity, k: number, dir: Vec2): void {
  applyPayload(world, { ownerId: eff.ownerId, team: e.team }, t, eff.payload, k, dir);
}

function pulses(eff: EffectState, dt: number, interval: number): number {
  eff.pulseTimer += dt;
  let n = 0;
  while (eff.pulseTimer >= interval) {
    eff.pulseTimer -= interval;
    n++;
  }
  return n;
}

const UPDATERS: Record<SpawnableSpec['kind'], (world: World, e: Entity, eff: EffectState, dt: number) => void> = {
  projectile: updateProjectile,
  beam: updateBeam,
  spray: updateSpray,
  burst: updateBurst,
  zone: updateZone,
  swing: updateSwing,
  front: updateFront,
  arc: updateArc,
  tether: updateTether,
};

export function updateEffects(world: World, dt: number): void {
  for (const e of world.entities) {
    const eff = e.effect;
    if (!eff || e.removed) continue;

    if (eff.attached) {
      const owner = world.get(eff.ownerId);
      if (!owner || owner.removed || owner.downed) {
        world.remove(e);
        continue;
      }
      e.pos = { ...owner.pos };
      eff.dir = fromAngle(owner.facing ?? 0);
    }
    UPDATERS[eff.spec.kind](world, e, eff, dt);
    eff.age += dt;
  }
}

function impact(world: World, e: Entity, eff: EffectState): void {
  world.remove(e);
  world.cue('impact', e.pos, undefined);
  world.touch(e.pos, 0.6, eff.elements, eff.ownerId);
  const carried = world.get(eff.carriedId);
  if (carried) applyImpulse(carried, scale(eff.dir, 6));
  if (eff.spec.kind === 'projectile' && eff.spec.onImpact) {
    const o: EffectOrigin = { ownerId: eff.ownerId, team: e.team, pos: e.pos, facing: angleOf(eff.dir), ownerRadius: 0 };
    spawnEffect(world, o, eff.spec.onImpact as SpawnableSpec, eff.elements);
  }
}

/** Reflect a projectile off a surface whose outward push is `push`. */
function bounce(world: World, e: Entity, eff: EffectState, push: Vec2): void {
  const n = normalize(push);
  const dn = dot(eff.dir, n);
  if (dn < 0) eff.dir = sub(eff.dir, scale(n, 2 * dn));
  e.vel = scale(eff.dir, len(e.vel ?? ZERO));
  e.pos = add(e.pos, push);
  world.cue('bounce', e.pos);
}

function updateProjectile(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'projectile') return;
  const r = e.radius!;
  eff.traveled += len(e.vel ?? ZERO) * dt;
  if (eff.traveled > eff.spec.range) return impact(world, e, eff);

  for (const w of world.walls) {
    const push = circleAabbPush(e.pos, r, w);
    if (!push) continue;
    if (eff.bounces <= 0) return impact(world, e, eff);
    eff.bounces--;
    bounce(world, e, eff, push);
  }
  for (const s of world.entities) {
    const w = s.wall;
    if (!w || s.removed) continue;
    const push = circleCapsulePush(e.pos, r, w.a, w.b, w.half);
    if (!push) continue;
    // Ice shards bounce off anything; any projectile bounces off its owner's walls and off shields.
    if (eff.bounces > 0) eff.bounces--;
    else if ((w.reflectAll || w.ownerId === eff.ownerId) && eff.reflects < 6) eff.reflects++;
    else return impact(world, e, eff);
    bounce(world, e, eff, push);
  }
  // Cage bubbles: shots from inside stay inside, shots from outside stay outside.
  const cage = projectileCaged(world, e.pos, eff.start, r);
  if (cage) {
    world.cue('cageHit', e.pos);
    return impact(world, e, eff);
  }

  for (const t of world.entities) {
    if (!canHit(eff, t) || eff.hit.has(t.id) || t.id === eff.carriedId) continue;
    if (dist(t.pos, e.pos) > (t.radius ?? 0) + r) continue;
    if (eff.payload.sparesTeam && t.team === e.team) continue;
    // Shields stop straight shots from the front; a shard that has bounced comes round it.
    const bounced = eff.reflects > 0 || eff.bounces < (eff.spec.bounces ?? 0);
    if (!bounced && shieldBlocks(t, eff.dir)) {
      noteBlock(world, t);
      return impact(world, e, eff);
    }
    deliver(world, e, eff, t, 1, eff.dir);
    if (!eff.pierce) return impact(world, e, eff);
    // Pinning Javelin: pierce, and carry the first enemy along.
    eff.hit.add(t.id);
    if (eff.carriedId === undefined && t.team !== e.team) {
      eff.carriedId = t.id;
      world.floater({ x: t.pos.x, y: t.pos.y - 1 }, 'Pinned!', '#ffd98a');
    }
  }
  const c = world.get(eff.carriedId);
  if (c && !c.removed) {
    c.pos = add(e.pos, scale(eff.dir, r + (c.radius ?? 0) * 0.6));
    c.vel = { x: 0, y: 0 };
  }
}

function updateBeam(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'beam') return;
  const spec = eff.spec;
  const owner = world.get(eff.ownerId);
  const dir = eff.dir;
  let o = add(e.pos, scale(dir, (owner?.radius ?? 0) + 0.1));
  let remaining = spec.length;
  let boost = 1;
  let target: Entity | undefined;
  const used = new Set<number>();
  const path: Vec2[] = [o];

  for (let seg = 0; seg < 3; seg++) {
    let reach = rayBlockers(world, o, dir, remaining);
    let lens: Entity | undefined;
    target = undefined;
    for (const t of world.entities) {
      if (t.lens && !t.removed && !used.has(t.id)) {
        const hit = rayCircle(o, dir, t.pos, t.radius ?? 0.6);
        if (hit !== null && hit < reach) {
          reach = hit;
          lens = t;
          target = undefined;
        }
      } else if (canHit(eff, t)) {
        const hit = rayCircle(o, dir, t.pos, (t.radius ?? 0) + (spec.width * boost) / 2);
        if (hit !== null && hit < reach) {
          reach = hit;
          target = t;
          lens = undefined;
        }
      }
    }
    if (!lens) {
      path.push(add(o, scale(dir, reach)));
      break;
    }
    // Through a lens: the first beam in steers the output; later beams merge into it.
    const L = lens.lens!;
    path.push({ ...lens.pos });
    const primaryActive = L.primaryId !== null && L.primaryId !== e.id && world.time - L.primarySeenAt < 0.1;
    if (primaryActive) {
      L.mergedSeenAt = world.time;
      break;
    }
    L.primaryId = e.id;
    L.primarySeenAt = world.time;
    boost *= world.time - L.mergedSeenAt < 0.1 ? LENS_MERGED_BOOST : LENS_BOOST;
    used.add(lens.id);
    remaining = Math.max(6, remaining - dist(o, lens.pos));
    o = { ...lens.pos };
  }

  eff.path = path;
  eff.boost = boost;
  eff.reach = dist(path[0], path[path.length - 1]);
  const n = pulses(eff, dt, spec.pulse);
  if (n === 0) return;
  const end = path[path.length - 1];
  const blocked = !!target && shieldBlocks(target, dir);
  if (blocked) noteBlock(world, target!);
  for (let i = 0; i < n; i++) {
    if (target && !blocked) deliver(world, e, eff, target, spec.pulse * boost, dir);
    world.touch(end, 0.5, eff.elements, eff.ownerId);
  }
}

function updateSpray(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'spray') return;
  const spec = eff.spec;
  eff.reach = rayBlockers(world, e.pos, eff.dir, spec.range);
  const n = pulses(eff, dt, spec.pulse);
  if (n === 0) return;
  world.touch(add(e.pos, scale(eff.dir, eff.reach * 0.8)), 1.0, eff.elements, eff.ownerId);
  const facing = angleOf(eff.dir);
  for (const t of world.entities) {
    if (!canHit(eff, t)) continue;
    const d = sub(t.pos, e.pos);
    const l = len(d);
    const r = t.radius ?? 0;
    if (l - r > spec.range || l < 1e-6) continue;
    const angularSlack = Math.atan2(r, l);
    if (Math.abs(angleDiff(facing, angleOf(d))) > spec.halfAngle + angularSlack) continue;
    if (rayBlockers(world, e.pos, normalize(d), l) < l - r) continue;
    if (shieldBlocks(t, d)) {
      noteBlock(world, t);
      continue;
    }
    for (let i = 0; i < n; i++) deliver(world, e, eff, t, spec.pulse, d);
  }
}

function updateBurst(world: World, e: Entity, eff: EffectState): void {
  if (eff.spec.kind !== 'burst') return;
  const spec = eff.spec;
  const t = eff.age - (spec.delay ?? 0);
  if (t < 0) return; // telegraph: drawn, but harmless
  if (!eff.fired) {
    eff.fired = true;
    world.touch(e.pos, spec.radius, eff.elements, eff.ownerId);
    if (spec.style) world.cue(spec.style, e.pos);
  }
  const r = spec.radius * Math.min(1, t / spec.duration);
  eff.reach = r;
  for (const target of world.entities) {
    if (!canHit(eff, target) || eff.hit.has(target.id)) continue;
    if (dist(target.pos, e.pos) - (target.radius ?? 0) > r) continue;
    eff.hit.add(target.id);
    deliver(world, e, eff, target, 1, sub(target.pos, e.pos));
  }
  if (t > spec.duration + BURST_FADE) world.remove(e);
}

function updateZone(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'zone') return;
  eff.reach = eff.spec.radius;
  const n = pulses(eff, dt, eff.spec.pulse);
  if (n > 0 && !eff.spec.selfOnly) world.touch(e.pos, eff.spec.radius, eff.elements, eff.ownerId);
  for (const t of world.entities) {
    if (!canHit(eff, t) || dist(t.pos, e.pos) > eff.spec.radius + (t.radius ?? 0)) continue;
    for (let i = 0; i < n; i++) deliver(world, e, eff, t, eff.spec.pulse, sub(t.pos, e.pos));
  }
  if (eff.age >= eff.spec.duration) world.remove(e);
}

function updateSwing(world: World, e: Entity, eff: EffectState): void {
  if (eff.spec.kind !== 'swing') return;
  eff.reach = eff.spec.range;
  if (eff.age === 0) {
    const facing = angleOf(eff.dir);
    let first: Entity | undefined;
    for (const t of world.entities) {
      if (!canHit(eff, t)) continue;
      const d = sub(t.pos, e.pos);
      if (len(d) - (t.radius ?? 0) > eff.spec.range) continue;
      if (Math.abs(angleDiff(facing, angleOf(d))) > eff.spec.halfAngle) continue;
      deliver(world, e, eff, t, 1, d);
      first ??= t;
    }
    if (first) triggerLoaded(world, eff.ownerId, first.pos);
  }
  if (eff.age >= SWING_LIFE) world.remove(e);
}

/** A front racing along the ground: lines, Fault line, Tidal wave. */
function updateFront(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'front') return;
  const spec = eff.spec;
  if (!eff.fired) {
    eff.fired = true;
    eff.reach = rayWalls(eff.start, eff.dir, world.walls, spec.range);
  }
  eff.traveled = Math.min(eff.reach, eff.traveled + spec.speed * dt);
  e.pos = add(eff.start, scale(eff.dir, eff.traveled));
  const side = { x: -eff.dir.y, y: eff.dir.x };
  for (const t of world.entities) {
    if (!canHit(eff, t)) continue;
    const rel = sub(t.pos, e.pos);
    const r = t.radius ?? 0;
    const across = dot(rel, side);
    if (Math.abs(dot(rel, eff.dir)) > 0.5 + r || Math.abs(across) > spec.width / 2 + r) continue;
    if (!eff.hit.has(t.id)) {
      eff.hit.add(t.id);
      const push = spec.push === 'aside' ? add(scale(side, across >= 0 ? 1 : -1), scale(eff.dir, 0.3)) : eff.dir;
      deliver(world, e, eff, t, 1, push);
    }
    // A wave carries what it catches.
    if (spec.style === 'wave' && t.vel && (!eff.payload.alliesOnly || t.team === e.team)) {
      const v = dot(t.vel, eff.dir);
      if (v < spec.speed) t.vel = add(t.vel, scale(eff.dir, spec.speed - v));
    }
  }
  if (pulses(eff, dt, 0.12) > 0) world.touch(e.pos, spec.width / 2, eff.elements, eff.ownerId);
  if (eff.traveled >= eff.reach) {
    if (spec.ridge && eff.reach > 1.5) {
      spawnWall(world, { ownerId: eff.ownerId, team: e.team, a: add(eff.start, scale(eff.dir, 1.0)), b: { ...e.pos }, half: 0.3, material: 'ridge', duration: spec.ridge });
    }
    world.remove(e);
  }
}

/** Lightning chains from target to target; wet targets make the next jump cheaper and longer. */
function updateArc(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'arc') return;
  const spec = eff.spec;
  const owner = world.get(eff.ownerId);
  const start = add(e.pos, scale(eff.dir, (owner?.radius ?? 0) + 0.15));
  const facing = angleOf(eff.dir);
  const chain: Entity[] = [];

  let first: Entity | undefined;
  let bestD = Infinity;
  for (const t of world.entities) {
    if (!canHit(eff, t)) continue;
    const d = sub(t.pos, start);
    const l = len(d);
    const r = t.radius ?? 0;
    if (l - r > spec.range || l >= bestD) continue;
    if (Math.abs(angleDiff(facing, angleOf(d))) > 0.55 + Math.atan2(r, Math.max(l, 0.01))) continue;
    if (rayBlockers(world, start, normalize(d), l) < l - r) continue;
    first = t;
    bestD = l;
  }
  if (first) {
    chain.push(first);
    let budget = spec.jumps;
    let cur = first;
    while (budget > 0) {
      const wet = hasStatus(cur.statuses, 'wet');
      const reach = spec.jumpRange + (wet ? 1.6 : 0);
      let next: Entity | undefined;
      let nd = Infinity;
      for (const t of world.entities) {
        if (!canHit(eff, t) || chain.includes(t)) continue;
        const d = dist(t.pos, cur.pos);
        if (d < reach && d < nd) {
          next = t;
          nd = d;
        }
      }
      if (!next) break;
      chain.push(next);
      budget -= wet ? 0.5 : 1;
      cur = next;
    }
  }
  const end = chain.length ? null : add(start, scale(eff.dir, rayBlockers(world, start, eff.dir, spec.range * 0.7)));
  eff.path = [start, ...chain.map((c) => ({ ...c.pos })), ...(end ? [end] : [])];

  const n = pulses(eff, dt, spec.pulse);
  for (let i = 0; i < n; i++) {
    let prev = start;
    for (const c of chain) {
      deliver(world, e, eff, c, spec.pulse, sub(c.pos, prev));
      world.touch(c.pos, 0.4, eff.elements, eff.ownerId);
      prev = c.pos;
    }
    if (end) world.touch(end, 0.6, eff.elements, eff.ownerId);
  }
}

/** Yank: pull the target to the caster over the tether's duration. */
function updateTether(world: World, e: Entity, eff: EffectState, dt: number): void {
  if (eff.spec.kind !== 'tether') return;
  const owner = world.get(eff.ownerId);
  const t = world.get(eff.targetId);
  if (!owner || !t || t.removed || t.downed || owner.downed) {
    world.remove(e);
    return;
  }
  const gap = (owner.radius ?? 0) + (t.radius ?? 0) + 0.25;
  const to = sub(owner.pos, t.pos);
  const d = len(to);
  const left = Math.max(1e-3, eff.spec.duration - eff.age);
  const step = Math.max(0, d - gap) * Math.min(1, dt / left);
  t.pos = add(t.pos, scale(normalize(to), step));
  if (t.vel) t.vel = { x: 0, y: 0 };
  e.pos = { ...t.pos };
  if (eff.age + dt >= eff.spec.duration || d - step - gap < 0.05) {
    if (t.team !== e.team) deliver(world, e, eff, t, 1, to);
    world.cue('impact', t.pos, '#ff4f8b');
    world.remove(e);
  }
}
