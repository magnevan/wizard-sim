// Firing a SpellSpec: instant effects act here (heal, ward, walls, surfaces,
// lens, seal, conjure); the rest become effect entities (effects.ts).
// Used by the runner (normal casts) and by vessels (triggered sealed spells).

import { add, angleOf, dist, fromAngle, len, sub, type Vec2 } from '../core/vec2';
import { STATUS_DEFS, type StatusId } from '../statuses/defs';
import { applyStatus, cleanse } from '../statuses/statuses';
import { spawnCage } from '../world/cage';
import { isHittable, type Entity } from '../world/entity';
import { segmentAcross, spawnLens, spawnWall } from '../world/structures';
import { spawnSurface } from '../world/surfaces';
import type { World } from '../world/world';
import { spawnEffect, type EffectOrigin } from './effects';
import type { CastContext, EnchantId, EnchantSpec, SpellSpec, WallSpec, WardSpec } from './types';
import { sealIntoVessel } from './vessels';

const TAU = Math.PI * 2;

export const ctxAt = (point: Vec2, targetId: number | null = null): CastContext => ({ point: { ...point }, targetId, charge: 0 });

export interface FireOptions {
  /** Fired by a trigger, not a held cast: sustained effects get a fixed lifetime instead. */
  free?: boolean;
}

/** Fire every effect of a spec. Returns ids that should end with the channel. */
export function fireSpell(world: World, o: EffectOrigin, spec: SpellSpec, ctx: CastContext, opts: FireOptions = {}): number[] {
  const channelIds: number[] = [];
  const t = world.get(ctx.targetId);
  const target = t && !t.removed && !t.downed ? t : undefined;
  const pointPos = target ? target.pos : ctx.point;
  const toPoint = sub(pointPos, o.pos);
  const pointFacing = len(toPoint) > 0.01 ? angleOf(toPoint) : o.facing;
  const caster = world.get(o.ownerId);

  for (const eff of spec.effects) {
    const at = ('at' in eff ? eff.at : undefined) ?? 'caster';
    const anchor = at === 'caster' ? o.pos : pointPos;
    switch (eff.kind) {
      case 'self': {
        const r = at === 'target' ? target : caster;
        if (!r) break;
        world.hit({ targetId: r.id, sourceId: o.ownerId, damage: eff.payload.damage, statuses: eff.payload.statuses, impulse: { x: 0, y: 0 } });
        world.cue('self', r.pos);
        break;
      }
      case 'ward':
        applyWard(world, eff, o, anchor, at === 'target' ? target : caster);
        break;
      case 'wall':
        channelIds.push(...raiseWalls(world, eff, o, anchor));
        break;
      case 'surface':
        spawnSurface(world, anchor, eff.surface, eff.radius);
        world.cue('splash', anchor);
        break;
      case 'lens':
        spawnLens(world, anchor, eff.radius, eff.duration, o.team);
        world.cue('ward', anchor);
        break;
      case 'conjure':
        if (caster?.caster) caster.caster.conjured = { kind: eff.weapon, until: world.time + eff.duration };
        break;
      case 'seal':
        sealIntoVessel(world, o, eff, ctx);
        break;
      case 'tether':
        if (target) spawnEffect(world, { ...o, facing: pointFacing }, eff, spec.elements, { targetId: target.id });
        break;
      case 'enchant':
        applyEnchant(world, eff, at === 'target' ? target : caster);
        break;
      case 'cage':
        if (target && target.team !== o.team) spawnCage(world, target, eff.margin, eff.duration, o.ownerId, o.team);
        else world.cue('fizzle', pointPos);
        break;
      default: {
        const origin = at === 'caster' ? o : { ...o, pos: anchor, facing: pointFacing, ownerRadius: 0 };
        const spawned = spawnEffect(world, origin, eff, spec.elements, { charge: ctx.charge, free: opts.free });
        channelIds.push(...spawned.filter((s) => s.effect?.attached).map((s) => s.id));
      }
    }
  }
  return channelIds;
}

function applyWard(world: World, eff: WardSpec, o: EffectOrigin, anchor: Vec2, recipient: Entity | undefined): void {
  const recipients = eff.radius
    ? world.entities.filter((e) => isHittable(e) && e.kind !== 'effect' && e.team === o.team && dist(e.pos, anchor) <= eff.radius! + (e.radius ?? 0))
    : recipient ? [recipient] : [];
  for (const r of recipients) {
    r.ward = { resist: { ...eff.resist }, remaining: eff.duration };
    world.cue('ward', r.pos);
  }
  if (eff.radius) world.cue('wardBubble', anchor);
}

const ENCHANT_TEXT: Record<Exclude<EnchantId, 'cleanse'>, [StatusId, string]> = {
  ethereal: ['ethereal', 'Ethereal'],
  haste: ['haste', 'Haste!'],
  glass: ['glass', 'Glass cannon'],
  stoneskin: ['stoneskin', 'Stoneskin'],
};

/** A.1 enchantments: buff statuses (Stoneskin also fills the armor pool), or Cleanse. */
function applyEnchant(world: World, eff: EnchantSpec, r: Entity | undefined): void {
  if (!r || !isHittable(r)) return;
  r.statuses ??= {};
  const above = { x: r.pos.x, y: r.pos.y - 1.2 };
  if (eff.enchant === 'cleanse') {
    const n = cleanse(r.statuses);
    world.cue('splash', r.pos);
    world.floater(above, n ? 'Cleansed' : 'Clean', '#8fd0ff', n > 0);
    return;
  }
  const [id, label] = ENCHANT_TEXT[eff.enchant];
  applyStatus(r.statuses, { id, intensity: 1, duration: eff.duration });
  if (eff.enchant === 'stoneskin') r.armor = Math.max(r.armor ?? 0, eff.amount ?? 0);
  world.cue('enchant', r.pos, STATUS_DEFS[id].color);
  world.floater(above, label, STATUS_DEFS[id].color, true);
}

function raiseWalls(world: World, eff: WallSpec, o: EffectOrigin, anchor: Vec2): number[] {
  const common = {
    ownerId: o.ownerId,
    team: o.team,
    half: eff.thickness / 2,
    material: eff.material,
    duration: eff.duration,
    reflectAll: eff.reflectAll,
    payload: eff.material === 'elemental' ? eff.payload : undefined,
    elements: eff.tint ?? [],
  };
  if (eff.layout === 'guard') {
    const w = spawnWall(world, { ...common, a: o.pos, b: o.pos, guard: { distance: eff.distance, length: eff.length } });
    return [w.id];
  }
  const centers: [Vec2, number][] =
    eff.layout === 'ring'
      ? Array.from({ length: 6 }, (_, i) => [add(anchor, fromAngle((i / 6) * TAU, eff.distance)), (i / 6) * TAU] as [Vec2, number])
      : [[add(anchor, fromAngle(o.facing, eff.distance)), o.facing]];
  for (const [c, f] of centers) {
    const [a, b] = segmentAcross(c, f, eff.length);
    spawnWall(world, { ...common, a, b });
    world.cue('rise', c, eff.material === 'ice' ? '#cdf3ff' : eff.material === 'rock' ? '#b07a45' : '#f3d36b');
  }
  return [];
}
