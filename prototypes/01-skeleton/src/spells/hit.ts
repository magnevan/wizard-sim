import { normalize, scale, ZERO, type Vec2 } from '../core/vec2';
import type { Entity, Team } from '../world/entity';
import type { World } from '../world/world';
import type { DamageMap, Payload } from './types';

export interface HitSource {
  ownerId: number;
  team?: Team;
}

/**
 * Queue a hit carrying `k` times a payload (k = pulse length for per-second
 * effects). The ally-aware rules live here: attuned spells heal allies a
 * little instead of hurting them, ally-only payloads skip enemies, and the
 * Lantern grant marks allies as unable to drop below 1 HP.
 */
export function applyPayload(world: World, src: HitSource, t: Entity, p: Payload, k: number, dir: Vec2): void {
  const ally = src.team !== undefined && t.team === src.team;
  if (p.alliesOnly && !ally) return;
  if (p.grant === 'deathless') {
    if (ally) t.deathlessUntil = Math.max(t.deathlessUntil ?? 0, world.time + 0.25);
    return;
  }
  if (p.attuned && ally) {
    const heal = (p.allyHeal ?? 0) * k;
    if (heal > 0) world.hit({ targetId: t.id, sourceId: src.ownerId, damage: { life: heal }, statuses: [], impulse: { ...ZERO } });
    return;
  }
  const damage: DamageMap = {};
  for (const [type, v] of Object.entries(p.damage)) damage[type as keyof DamageMap] = v! * k;
  world.hit({
    targetId: t.id,
    sourceId: src.ownerId,
    damage,
    statuses: p.statuses.map((s) => ({ ...s, intensity: s.intensity * k })),
    impulse: scale(normalize(dir), p.knockback * k),
  });
}
