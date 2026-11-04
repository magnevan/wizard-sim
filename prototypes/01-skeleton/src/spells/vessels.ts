// Seal / Release. Seal stores a spell in a vessel picked by the cast mode:
//   Self -> staff slot   Point -> rune (Effigy with Life+Shield)   Force -> line rune
//   Area -> orbitals     Weapon -> loaded blow
// Release sets off every latent spell of the caster at once and shatters
// the caster's own rock/ice walls into shrapnel. Vessels store the spec to
// fire (resolved at seal time), so triggering never needs the resolver.

import { add, angleOf, dist, fromAngle, len, lerp, normalize, scale, sub, type Vec2 } from '../core/vec2';
import { distToSegment, rayWalls } from '../world/geometry';
import { isHittable, type Entity, type RuneState } from '../world/entity';
import type { World } from '../world/world';
import { originOf, spawnEffect, type EffectOrigin } from './effects';
import type { Element } from './elements';
import { ctxAt, fireSpell } from './fire';
import type { CastContext, ProjectileSpec, SealSpec, SpellRunner, SpellSpec } from './types';

export const RUNE_CAP = 3;
export const ORBITAL_CAP = 8;
export const RUNE_ARM_TIME = 0.8;
export const RUNE_RADIUS = 0.9;
export const LINE_RUNE_LENGTH = 6;
export const EFFIGY_HP = 60;
const RUNE_LIFE = 60;
const ORBIT_RADIUS = 1.05;
const ORBIT_SPEED = 2.4;

// --- Pure rules (unit-tested) ---

/** How many of the oldest runes to remove before placing one more. */
export function runesToEvict(existing: number, cap = RUNE_CAP): number {
  return Math.max(0, existing + 1 - cap);
}

/** How many orbital charges a seal adds, given the current count. */
export function orbitalsToAdd(current: number, charges: number, cap = ORBITAL_CAP): number {
  return Math.max(0, Math.min(charges, cap - current));
}

/** Charges a sealed Area spell becomes: one per element, at least one. */
export function orbitalCharges(elements: readonly Element[]): number {
  return Math.max(1, elements.length);
}

export function runeArmed(rune: Pick<RuneState, 'armAt'>, now: number): boolean {
  return now >= rune.armAt;
}

export function contingencyFires(staff: { contingency: SpellSpec | null } | null, tookDamage: boolean): boolean {
  return !!staff?.contingency && tookDamage;
}

/** Orbital i of n around a caster at time t. */
export function orbitalPos(center: Vec2, i: number, n: number, t: number): Vec2 {
  return add(center, fromAngle(t * ORBIT_SPEED + (i / Math.max(1, n)) * Math.PI * 2, ORBIT_RADIUS));
}

// --- Sealing ---

export function sealIntoVessel(world: World, o: EffectOrigin, eff: SealSpec, ctx: CastContext): void {
  const caster = world.get(o.ownerId);
  const c = caster?.caster;
  if (!caster || !c) return;
  const elements = eff.release.elements;
  const above = { x: caster.pos.x, y: caster.pos.y - 1.1 };
  switch (eff.vessel) {
    case 'staff':
      c.staff = { elements, release: eff.release, contingency: eff.contingency ?? null };
      world.floater(above, eff.contingency ? 'Contingency set' : 'Stored', '#ffd98a');
      break;
    case 'loaded':
      c.loaded = { elements, release: eff.release };
      world.floater(above, 'Blow loaded', '#ffd98a');
      break;
    case 'orbit': {
      const add = orbitalsToAdd(c.orbitals.length, eff.charges ?? 1);
      for (let i = 0; i < add; i++) c.orbitals.push({ elements, release: eff.release, orbit: eff.orbit ?? 'projectile' });
      world.floater(above, add ? `+${add} orbital${add > 1 ? 's' : ''}` : 'Orbit full', '#ffd98a');
      break;
    }
    case 'rune':
    case 'line':
      placeRune(world, caster, eff, ctx);
      break;
  }
  world.cue('seal', caster.pos);
  world.sealedStored++;
}

export function runesOf(world: World, ownerId: number): Entity[] {
  return world.entities.filter((e) => e.rune && !e.removed && e.rune.ownerId === ownerId).sort((a, b) => a.rune!.createdAt - b.rune!.createdAt);
}

function placeRune(world: World, caster: Entity, eff: SealSpec, ctx: CastContext): void {
  const mine = runesOf(world, caster.id);
  for (const old of mine.slice(0, runesToEvict(mine.length))) {
    world.cue('fizzle', old.pos);
    world.remove(old);
  }
  const rune: RuneState = {
    ownerId: caster.id,
    shape: eff.vessel === 'line' ? 'line' : eff.effigy ? 'effigy' : 'point',
    elements: eff.release.elements,
    release: eff.release,
    armAt: world.time + RUNE_ARM_TIME,
    createdAt: world.time,
    radius: RUNE_RADIUS,
  };
  if (rune.shape === 'line') {
    const dir = normalize(sub(caster.caster!.aim, caster.pos));
    const d = len(dir) > 0 ? dir : fromAngle(caster.facing ?? 0);
    const a = add(caster.pos, scale(d, (caster.radius ?? 0) + 0.4));
    rune.end = add(a, scale(d, Math.max(1, rayWalls(a, d, world.walls, LINE_RUNE_LENGTH) - 0.2)));
    rune.radius = 0.3;
    world.spawn({ kind: 'structure', team: caster.team, pos: a, rune, expiresAt: world.time + RUNE_LIFE });
    return;
  }
  if (rune.shape === 'effigy') {
    world.spawn({
      kind: 'effigy',
      team: caster.team,
      pos: { ...ctx.point },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      mass: 50,
      friction: 10,
      solid: true,
      hp: EFFIGY_HP,
      maxHp: EFFIGY_HP,
      statuses: {},
      taunt: true,
      rune,
      expiresAt: world.time + RUNE_LIFE,
    });
    return;
  }
  world.spawn({ kind: 'structure', team: caster.team, pos: { ...ctx.point }, rune, expiresAt: world.time + RUNE_LIFE });
}

// --- Triggering ---

function triggerRune(world: World, e: Entity): void {
  const r = e.rune!;
  e.rune = undefined;
  world.remove(e);
  world.sealedFired++;
  const o: EffectOrigin = { ownerId: r.ownerId, team: e.team, pos: { ...e.pos }, facing: 0, ownerRadius: 0 };
  world.cue('rune', e.pos);
  if (r.shape !== 'line' || !r.end) {
    fireSpell(world, o, r.release, ctxAt(e.pos), { free: true });
    return;
  }
  // Tripwire: the sealed burst goes off along the whole line, in smaller pieces.
  const burst = r.release.effects.find((x) => x.kind === 'burst');
  if (!burst || burst.kind !== 'burst') {
    fireSpell(world, { ...o, pos: lerp(e.pos, r.end, 0.5) }, r.release, ctxAt(r.end), { free: true });
    return;
  }
  const n = Math.max(2, Math.ceil(dist(e.pos, r.end) / 1.3));
  for (let i = 0; i <= n; i++) {
    const p = lerp(e.pos, r.end, i / n);
    spawnEffect(world, { ...o, pos: p }, { ...burst, radius: 1.1, duration: 0.2, payload: { ...burst.payload, damage: scaleMap(burst.payload.damage, 0.6) } }, r.elements);
  }
}

const scaleMap = <T extends Record<string, number | undefined>>(m: T, k: number): T =>
  Object.fromEntries(Object.entries(m).map(([key, v]) => [key, (v ?? 0) * k])) as T;

/** Seal + Weapon: the next swing that connects unleashes the sealed spell at the hit. */
export function triggerLoaded(world: World, ownerId: number, at: Vec2): void {
  const owner = world.get(ownerId);
  const c = owner?.caster;
  if (!owner || !c?.loaded) return;
  const spec = c.loaded.release;
  c.loaded = null;
  world.sealedFired++;
  world.floater({ x: at.x, y: at.y - 1 }, 'Loaded blow!', '#ffd98a', true);
  fireSpell(world, { ownerId, team: owner.team, pos: { ...at }, facing: owner.facing ?? 0, ownerRadius: 0 }, spec, ctxAt(at), { free: true });
}

/** Release: everything latent goes off at once. */
export function releaseAll(world: World, caster: Entity, runner: SpellRunner): void {
  const c = caster.caster!;
  const aim = c.aim;
  let any = false;

  for (const r of runesOf(world, caster.id)) {
    triggerRune(world, r);
    any = true;
  }

  if (c.orbitals.length) {
    any = true;
    flingOrbitals(world, caster, aim);
  }

  if (shatterWalls(world, caster)) any = true;

  if (c.staff) {
    const spec = c.staff.release;
    c.staff = null;
    world.sealedFired++;
    runner.cancel(world, caster);
    c.pending = null;
    runner.begin(world, caster, { ...spec, castTime: 0 }, ctxAt(aim));
    any = true;
  }
  world.cue(any ? 'release' : 'fizzle', caster.pos);
}

function flingOrbitals(world: World, caster: Entity, aim: Vec2): void {
  const c = caster.caster!;
  const n = c.orbitals.length;
  world.sealedFired += n;
  const allies = world.entities
    .filter((e) => isHittable(e) && e.kind !== 'effect' && e.team === caster.team && e.id !== caster.id && dist(e.pos, caster.pos) < 9)
    .sort((a, b) => dist(a.pos, caster.pos) - dist(b.pos, caster.pos));
  c.orbitals.forEach((orb, i) => {
    const from = orbitalPos(caster.pos, i, n, world.time);
    const o: EffectOrigin = { ...originOf(caster), pos: from, ownerRadius: 0 };
    if (orb.orbit === 'projectile') {
      fireSpell(world, { ...o, facing: angleOf(sub(aim, from)) }, orb.release, ctxAt(aim));
      return;
    }
    // Heals and wards go one to each ally nearby (yourself if nobody is near).
    const ally = allies.length ? allies[i % allies.length] : caster;
    fireSpell(world, o, orb.release, ctxAt(ally.pos, ally.id));
    world.cue('fling', ally.pos, orb.orbit === 'heal' ? '#5ee26a' : '#f3d36b');
  });
  c.orbitals = [];
}

const SHRAPNEL: Record<'rock' | 'ice', ProjectileSpec> = {
  rock: { kind: 'projectile', speed: 13, radius: 0.15, range: 7, tint: ['earth'], payload: { damage: { earth: 9 }, statuses: [], knockback: 3 } },
  ice: { kind: 'projectile', speed: 15, radius: 0.12, range: 10, bounces: 2, tint: ['ice'], payload: { damage: { ice: 6 }, statuses: [{ id: 'chilled', intensity: 1, duration: 3 }], knockback: 1 } },
};

/** Shatter Bulwark: the caster's rock / ice walls burst into shrapnel flying away from the caster. */
export function shatterWalls(world: World, caster: Entity): boolean {
  let any = false;
  for (const e of world.entities) {
    const w = e.wall;
    if (!w || e.removed || w.ownerId !== caster.id || (w.material !== 'rock' && w.material !== 'ice')) continue;
    any = true;
    world.remove(e);
    world.cue('shatter', e.pos, w.material === 'ice' ? '#cdf3ff' : '#b07a45');
    const spec = SHRAPNEL[w.material];
    const n = Math.max(3, Math.round(dist(w.a, w.b) / 0.55));
    const along = normalize(sub(w.b, w.a));
    for (let i = 0; i < n; i++) {
      const p = lerp(w.a, w.b, (i + 0.5) / n);
      let nrm = { x: -along.y, y: along.x };
      if ((p.x - caster.pos.x) * nrm.x + (p.y - caster.pos.y) * nrm.y < 0) nrm = scale(nrm, -1);
      const facing = angleOf(nrm) + world.rng.range(-0.6, 0.6);
      spawnEffect(world, { ownerId: caster.id, team: caster.team, pos: p, facing, ownerRadius: 0 }, spec, spec.tint!);
    }
  }
  return any;
}

// --- Per-tick: contingency, rune triggers, effigies, conjured weapons ---

export function vesselSystem(world: World): void {
  for (const e of world.entities) {
    const c = e.caster;
    if (c && !e.removed && !e.downed) {
      if (contingencyFires(c.staff, world.damaged.has(e.id))) {
        const spec = c.staff!.contingency!;
        c.staff = null;
        world.sealedFired++;
        world.floater({ x: e.pos.x, y: e.pos.y - 1.2 }, 'Contingency!', '#ffd98a', true);
        fireSpell(world, originOf(e), spec, ctxAt(e.pos), { free: true });
      }
      if (c.conjured && world.time > c.conjured.until) c.conjured = null;
    }

    const r = e.rune;
    if (!r) continue;
    if (r.shape === 'effigy') {
      if (e.hp! <= 0) triggerRune(world, e);
      continue;
    }
    if (e.removed || !runeArmed(r, world.time)) continue;
    const tripped = world.entities.some((t) => {
      if (!isHittable(t) || t.kind === 'effect' || t.team === e.team || t.team === 'neutral') return false;
      const d = r.shape === 'line' && r.end ? distToSegment(t.pos, e.pos, r.end) : dist(t.pos, e.pos);
      return d < r.radius + (t.radius ?? 0);
    });
    if (tripped) triggerRune(world, e);
  }
  world.damaged.clear();
}
