import { CAST_BUFFER_SECONDS } from '../config';
import { angleOf, dist, sub } from '../core/vec2';
import { canCast, isIntangible } from '../statuses/statuses';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import { harmless, updateEffects } from './effects';
import type { PointTarget, SpellResolver, SpellRunner, SpellSpec } from './types';
import { releaseAll } from './vessels';

/** What a caster's request resolves to (also used by the HUD preview). */
export function resolveRequest(resolver: SpellResolver, world: World, e: Entity): SpellSpec | null {
  const c = e.caster!;
  const r = c.request!;
  const conjured = c.conjured && c.conjured.until > world.time ? c.conjured.kind : null;
  return resolver.resolve(r.elements, r.mode, { seal: r.sealed, target: r.target, conjured });
}

/** Could this spell hurt, shove or trap someone? (Ethereal casters can't cast those.) */
export function isOffensive(spec: SpellSpec, target: PointTarget = 'ground'): boolean {
  return spec.effects.some((eff) => {
    if (eff.kind === 'cage') return true;
    if (eff.kind === 'tether') return target === 'enemy';
    if (eff.kind === 'seal') return isOffensive(eff.release) || (!!eff.contingency && isOffensive(eff.contingency));
    if (eff.kind === 'projectile' && eff.onImpact && 'payload' in eff.onImpact && !harmless(eff.onImpact.payload)) return true;
    return 'payload' in eff && !harmless(eff.payload);
  });
}

function etherealFizzle(world: World, e: Entity): void {
  world.cue('fizzle', e.pos);
  if (world.time - (e.phasedAt ?? -9) > 0.6) {
    e.phasedAt = world.time;
    world.floater({ x: e.pos.x, y: e.pos.y - 1.2 }, "Ethereal: can't attack", '#b9f3ff');
  }
}

/**
 * Turns cast requests into running spells, then advances all effects.
 * The queue was already snapshotted and cleared at the moment of the press
 * (see CasterComponent.request), so what you typed is what you get even if
 * the spell starts a moment later.
 */
export function castSystem(world: World, resolver: SpellResolver, runner: SpellRunner, dt: number): void {
  for (const e of world.entities) {
    const c = e.caster;
    if (!c || e.removed) continue;

    if (e.downed) {
      if (c.active) runner.cancel(world, e);
      c.request = null;
      c.pending = null;
      c.releaseRequested = false;
      continue;
    }

    if (dist(c.aim, e.pos) > 0.05) e.facing = angleOf(sub(c.aim, e.pos));

    const ghost = isIntangible(e.statuses);
    if (c.releaseRequested) {
      c.releaseRequested = false;
      if (ghost) etherealFizzle(world, e);
      else releaseAll(world, e, runner);
    }

    if (c.request) {
      const r = c.request;
      const spec = resolveRequest(resolver, world, e);
      c.request = null;
      if (spec && ghost && isOffensive(spec, r.target)) etherealFizzle(world, e);
      else if (spec) {
        // Seal is spent only by a cast that actually seals something.
        if (r.sealed) c.sealArmed = false;
        c.pending = { spec, ctx: { point: r.point, targetId: r.targetId, charge: 0 }, expiresAt: world.time + CAST_BUFFER_SECONDS };
      }
    }

    if (c.pending) {
      if (!c.active && canCast(e.statuses)) {
        runner.begin(world, e, c.pending.spec, c.pending.ctx);
        c.pending = null;
      } else if (world.time > c.pending.expiresAt) {
        c.pending = null;
        world.cue('fizzle', e.pos);
      }
    }

    runner.update(world, e, dt, c.held);
  }
  updateEffects(world, dt);
}
