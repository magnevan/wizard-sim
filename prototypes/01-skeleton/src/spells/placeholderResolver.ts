// PLACEHOLDER spell resolver, kept for comparison. The game now uses
// ProposalAResolver (proposalA.ts). Point casts fall back to an area burst.

import { ELEMENTS, type DamageType, type Element } from './elements';
import { payloadFrom } from './payload';
import type { CastMode, EffectSpec, SpellResolver, SpellSpec } from './types';

type Counts = Partial<Record<Element, number>>;

function countOf(elements: readonly Element[]): Counts {
  const c: Counts = {};
  for (const e of elements) c[e] = (c[e] ?? 0) + 1;
  return c;
}

function nameOf(elements: readonly Element[], shape: string): string {
  const unique = [...new Set(elements)].map((e) => ELEMENTS[e].name);
  return unique.length ? `${unique.join('-')} ${shape}` : shape;
}

const has = (c: Counts, ...es: Element[]) => es.some((e) => (c[e] ?? 0) > 0);

export class PlaceholderResolver implements SpellResolver {
  resolve(elements: readonly Element[], mode: CastMode): SpellSpec | null {
    if (elements.length === 0 && mode !== 'weapon') return null;
    switch (mode) {
      case 'force':
        return this.force(elements);
      case 'area':
      case 'point':
        return this.area(elements);
      case 'self':
        return this.self(elements);
      case 'weapon':
        return this.weapon(elements);
    }
  }

  private force(els: readonly Element[]): SpellSpec {
    const c = countOf(els);
    const n = els.length;
    const base = { mode: 'force' as const, elements: els, recovery: 0.15, moveMult: 0.4 };

    if (has(c, 'earth')) {
      const rest = els.filter((e) => e !== 'earth');
      const onImpact: EffectSpec | undefined = rest.length
        ? { kind: 'burst', radius: 1.6, duration: 0.2, tint: rest, payload: payloadFrom(rest, 0.8, 0.5, { hitsCaster: true }) }
        : undefined;
      return {
        ...base,
        name: nameOf(els, 'Rock'),
        castTime: 0.2 + 0.1 * n,
        effects: [{ kind: 'projectile', speed: 15, radius: 0.2 + 0.06 * c.earth!, range: 14, payload: payloadFrom(els, 1.6, 1.4), onImpact }],
      };
    }
    if (has(c, 'ice')) {
      const shards = Math.min(7, 1 + 2 * c.ice!);
      return {
        ...base,
        name: nameOf(els, 'Shards'),
        castTime: 0.15 + 0.06 * n,
        effects: [{ kind: 'projectile', speed: 18, radius: 0.12, range: 11, count: shards, spread: 0.45, payload: payloadFrom(els, 0.6, 0.5) }],
      };
    }
    if (has(c, 'arcane', 'life')) {
      return {
        ...base,
        name: nameOf(els, 'Beam'),
        castTime: 0.15 + 0.05 * n,
        channel: { maxDuration: 4, minDuration: 0.3, moveMult: 0.2 },
        effects: [{ kind: 'beam', length: 14, width: 0.25 + 0.06 * n, pulse: 0.25, payload: payloadFrom(els, 2.4, 1) }],
      };
    }
    return {
      ...base,
      name: nameOf(els, 'Spray'),
      castTime: 0.1 + 0.04 * n,
      channel: { maxDuration: 3, minDuration: 0.25, moveMult: 0.35 },
      effects: [{ kind: 'spray', range: Math.min(6.5, 3.4 + 0.6 * n), halfAngle: 0.38, pulse: 0.25, payload: payloadFrom(els, 2.8, 1.4) }],
    };
  }

  private area(els: readonly Element[]): SpellSpec {
    const c = countOf(els);
    const radius = 2.8 + 0.4 * els.length;
    const burstPayload = payloadFrom(els, 1.3, 0);
    burstPayload.knockback = 5 + (c.earth ?? 0) * 4 + (c.water ?? 0) * 3 + (c.shield ?? 0) * 3;
    const effects: EffectSpec[] = [{ kind: 'burst', radius, duration: 0.35, payload: burstPayload }];

    const lingering = els.filter((e) => e === 'water' || e === 'fire' || e === 'cold' || e === 'steam');
    if (lingering.length) {
      effects.push({ kind: 'zone', radius: radius * 0.85, duration: 3.5, pulse: 0.5, tint: lingering, payload: payloadFrom(lingering, 0.5, 0) });
    }
    return {
      name: nameOf(els, 'Nova'),
      mode: 'area',
      elements: els,
      castTime: 0.2 + 0.06 * els.length,
      recovery: 0.25,
      moveMult: 0.3,
      effects,
    };
  }

  private self(els: readonly Element[]): SpellSpec {
    const c = countOf(els);
    const base = { mode: 'self' as const, elements: els, castTime: 0.25 + 0.04 * els.length, recovery: 0.2, moveMult: 0.5 };
    if (has(c, 'shield')) {
      const others = els.filter((e) => e !== 'shield');
      const resist: Partial<Record<DamageType, number>> = {};
      if (others.length === 0) for (const t of ['physical', ...Object.keys(ELEMENTS)] as DamageType[]) resist[t] = 0.35;
      for (const e of others) resist[e] = Math.min(0.9, (resist[e] ?? 0) + 0.5);
      return { ...base, name: nameOf(els, 'Ward'), effects: [{ kind: 'ward', resist, duration: 8 }] };
    }
    // Everything else is applied to yourself: life heals, water douses flames, fire burns you.
    return { ...base, name: has(c, 'life') ? nameOf(els, 'Heal') : nameOf(els, 'on Self'), effects: [{ kind: 'self', payload: payloadFrom(els, 1.8, 0, { hitsCaster: true }) }] };
  }

  private weapon(els: readonly Element[]): SpellSpec {
    const payload = payloadFrom(els, 1.0, 0.6);
    payload.damage.physical = 10;
    payload.knockback += 3;
    return {
      name: els.length ? nameOf(els, 'Sword') : 'Sword',
      mode: 'weapon',
      elements: els,
      castTime: 0.12,
      recovery: 0.25,
      moveMult: 0.6,
      effects: [{ kind: 'swing', range: 1.8, halfAngle: 1.0, payload }],
    };
  }
}
