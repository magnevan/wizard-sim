import { canCast, castSpeed } from '../statuses/statuses';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import { originOf } from './effects';
import { fireSpell } from './fire';
import type { CastContext, SpellRunner, SpellSpec } from './types';

/** A charge held this long past full fires by itself. */
const CHARGE_HOLD_CAP = 1.5;

/**
 * Plays a SpellSpec: wind-up -> (charge while held) -> (channel while held) -> recovery.
 * Knows nothing about elements; everything comes from the spec.
 */
export class DefaultSpellRunner implements SpellRunner {
  begin(world: World, caster: Entity, spec: SpellSpec, ctx: CastContext): void {
    const c = caster.caster!;
    c.active = { spec, ctx: { ...ctx }, phase: 'windup', t: 0, channelEffectIds: [] };
    c.moveMult = spec.moveMult;
    c.lastCast = { name: spec.name, at: world.time };
    if (spec.castTime <= 0) this.update(world, caster, 0, c.held);
  }

  update(world: World, caster: Entity, dt: number, held: boolean): void {
    const c = caster.caster!;
    const a = c.active;
    if (!a) return;
    if (caster.downed || !canCast(caster.statuses)) {
      this.cancel(world, caster);
      return;
    }
    // Haste: wind-up and recovery run faster (charge and channel keep their timing).
    a.t += a.phase === 'windup' || a.phase === 'recovery' ? dt * castSpeed(caster.statuses) : dt;
    switch (a.phase) {
      case 'windup':
        if (a.t < a.spec.castTime) return;
        a.t = 0;
        if (a.spec.charge) {
          a.phase = 'charge';
          c.moveMult = a.spec.charge.moveMult;
          return;
        }
        this.fire(world, caster);
        return;
      case 'charge': {
        const ch = a.spec.charge!;
        const done = !held || a.t >= ch.maxTime + CHARGE_HOLD_CAP || !!c.pending;
        if (!done) return;
        a.ctx.charge = Math.min(1, a.t / ch.maxTime);
        a.t = 0;
        this.fire(world, caster);
        return;
      }
      case 'channel': {
        const ch = a.spec.channel!;
        // A newer cast request also ends the channel: input always wins.
        const done = a.t >= ch.maxDuration || (!held && a.t >= ch.minDuration) || !!c.pending;
        if (!done) return;
        this.endChannel(world, a.channelEffectIds);
        a.phase = 'recovery';
        a.t = 0;
        c.moveMult = a.spec.moveMult;
        return;
      }
      case 'recovery':
        if (a.t >= a.spec.recovery) {
          c.active = null;
          c.moveMult = 1;
        }
        return;
    }
  }

  cancel(world: World, caster: Entity): void {
    const c = caster.caster!;
    if (c.active) this.endChannel(world, c.active.channelEffectIds);
    c.active = null;
    c.moveMult = 1;
  }

  private fire(world: World, caster: Entity): void {
    const c = caster.caster!;
    const a = c.active!;
    const ids = fireSpell(world, originOf(caster), a.spec, a.ctx);
    if (a.spec.channel) {
      a.channelEffectIds.push(...ids);
      a.phase = 'channel';
      c.moveMult = a.spec.channel.moveMult;
    } else {
      a.phase = 'recovery';
      c.moveMult = a.spec.moveMult;
    }
  }

  private endChannel(world: World, ids: number[]): void {
    for (const id of ids) {
      const e = world.get(id);
      if (e) world.remove(e);
    }
    ids.length = 0;
  }
}
