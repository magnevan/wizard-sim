import type { StatusApplication } from '../statuses/statuses';
import { elementDef, type DamageType, type Element } from './elements';
import type { Payload } from './types';

/** Heal per Life gem that an attuned spell gives allies instead of hurting them (scaled by `dmg`). */
export const ATTUNED_HEAL_PER_LIFE = 4;

export const EMPTY_PAYLOAD: Payload = { damage: {}, statuses: [], knockback: 0 };

/**
 * Sum each element's power/knockback/status, scaled by `dmg` and `kb`.
 * Attuned: Life is spent making the spell ally-safe, so it adds no damage or
 * healing to enemies; allies get a small heal instead of the payload.
 */
export function payloadFrom(elements: readonly Element[], dmg: number, kb: number, extra: Partial<Payload> = {}, attuned = false): Payload {
  const damage: Partial<Record<DamageType, number>> = {};
  const statuses = new Map<string, StatusApplication>();
  let knockback = 0;
  let life = 0;
  for (const e of elements) {
    if (attuned && e === 'life') {
      life++;
      continue;
    }
    const def = elementDef(e);
    if (def.power) damage[e] = (damage[e] ?? 0) + def.power * dmg;
    knockback += def.knockback * kb;
    if (def.status) {
      const cur = statuses.get(def.status.id);
      statuses.set(def.status.id, {
        id: def.status.id,
        intensity: (cur?.intensity ?? 0) + def.status.intensity,
        duration: Math.max(cur?.duration ?? 0, def.status.duration),
      });
    }
  }
  const p: Payload = { damage, statuses: [...statuses.values()], knockback, ...extra };
  if (attuned) {
    p.attuned = true;
    p.allyHeal = ATTUNED_HEAL_PER_LIFE * life * dmg;
  }
  return p;
}

/** Copy of a payload with damage and knockback multiplied (charge, lens). */
export function scalePayload(p: Payload, damageMult: number, knockbackMult = damageMult): Payload {
  const damage: Partial<Record<DamageType, number>> = {};
  for (const [t, v] of Object.entries(p.damage)) damage[t as DamageType] = v! * damageMult;
  return { ...p, damage, knockback: p.knockback * knockbackMult, allyHeal: p.allyHeal !== undefined ? p.allyHeal * damageMult : undefined };
}
