// Proposal A resolver: tree.ts picks the form, this file picks the numbers.
// Every spell is pure data (SpellSpec); cast time always comes from the spec.

import { ELEMENTS, type DamageType, type Element } from './elements';
import { EMPTY_PAYLOAD, payloadFrom } from './payload';
import { classify, type RuleSet, type TreeLeaf } from './tree';
import type { Anchor, CastMode, EffectSpec, EnchantId, EnchantSpec, ResolveContext, SpellResolver, SpellSpec, WardSpec } from './types';

type Timing = Pick<SpellSpec, 'castTime'> & Partial<Pick<SpellSpec, 'recovery' | 'moveMult' | 'channel' | 'charge'>>;

const count = (els: readonly Element[], e: Element) => els.filter((x) => x === e).length;
const without = (els: readonly Element[], ...ex: Element[]) => els.filter((e) => !ex.includes(e));

function spell(tree: TreeLeaf, mode: CastMode, els: readonly Element[], t: Timing, effects: EffectSpec[]): SpellSpec {
  return {
    name: tree.title,
    form: tree.form,
    leaf: tree.leaf,
    attuned: tree.attuned,
    mode,
    elements: els,
    recovery: 0.2,
    moveMult: 0.4,
    ...t,
    effects,
  };
}

/** Resistances: Shield alone guards a bit against everything; each other element guards strongly against itself. */
function wardResist(els: readonly Element[]): Partial<Record<DamageType, number>> {
  const others = without(els, 'shield');
  const resist: Partial<Record<DamageType, number>> = {};
  if (others.length === 0) for (const t of ['physical', ...Object.keys(ELEMENTS)] as DamageType[]) resist[t] = 0.35;
  for (const e of others) resist[e] = Math.min(0.9, (resist[e] ?? 0) + 0.5);
  return resist;
}

const CHANNEL_BEAM = { maxDuration: 4, minDuration: 0.3, moveMult: 0.2 };
const CHANNEL_SPRAY = { maxDuration: 3, minDuration: 0.25, moveMult: 0.35 };

type Builder = (els: readonly Element[], tree: TreeLeaf, ctx: ResolveContext) => SpellSpec;

const force: Builder = (els, tree) => {
  const n = els.length;
  const att = tree.attuned;
  switch (tree.form) {
    case 'wall': {
      const rock = els.includes('earth');
      return spell(tree, 'force', els, { castTime: 0.3 + 0.05 * n }, [
        { kind: 'wall', material: rock ? 'rock' : 'ice', layout: 'across', length: 3.6 + 0.3 * n, thickness: 0.55, distance: 2.0, duration: 10, payload: EMPTY_PAYLOAD },
      ]);
    }
    case 'barrier': {
      const rest = without(els, 'shield');
      if (rest.length === 0) {
        return spell(tree, 'force', els, { castTime: 0.25 }, [
          { kind: 'wall', material: 'shield', layout: 'across', length: 3.0, thickness: 0.25, distance: 1.5, duration: 6, reflectAll: true, payload: EMPTY_PAYLOAD },
        ]);
      }
      // Elemental barrier: the payload is per second, pulsed onto whatever touches it.
      return spell(tree, 'force', els, { castTime: 0.25 + 0.05 * n }, [
        { kind: 'wall', material: 'elemental', layout: 'across', length: 3.2, thickness: 0.35, distance: 1.6, duration: 6, tint: rest, payload: payloadFrom(rest, 1.4, 0.6, {}, att) },
      ]);
    }
    case 'projectile':
      if (tree.title === 'Rock') {
        const rest = without(els, 'earth');
        const onImpact: EffectSpec | undefined = rest.length ? { kind: 'burst', radius: 1.6, duration: 0.2, tint: rest, payload: payloadFrom(rest, 0.8, 0.5, { hitsCaster: true }, att) } : undefined;
        return spell(tree, 'force', els, { castTime: 0.2 + 0.08 * n, charge: { maxTime: 0.9, moveMult: 0.4 } }, [
          { kind: 'projectile', speed: 15, radius: 0.2 + 0.06 * count(els, 'earth'), range: 14, chargeable: true, payload: payloadFrom(els, 1.6, 1.4, {}, att), onImpact },
        ]);
      }
      return spell(tree, 'force', els, { castTime: 0.15 + 0.06 * n }, [
        { kind: 'projectile', speed: 18, radius: 0.12, range: 16, count: Math.min(7, 1 + 2 * count(els, 'ice')), spread: 0.45, bounces: 3, payload: payloadFrom(els, 0.6, 0.5, {}, att) },
      ]);
    case 'beam':
      return spell(tree, 'force', els, { castTime: 0.15 + 0.05 * n, channel: CHANNEL_BEAM }, [
        { kind: 'beam', length: 14, width: 0.25 + 0.06 * n, pulse: 0.25, payload: payloadFrom(els, 2.4, 1, {}, att) },
      ]);
    case 'arc':
      return spell(tree, 'force', els, { castTime: 0.12 + 0.05 * n, channel: CHANNEL_SPRAY }, [
        { kind: 'arc', range: 6.5, jumps: 2 + count(els, 'lightning'), jumpRange: 3.2, pulse: 0.25, payload: payloadFrom(els, 2.2, 0, {}, att) },
      ]);
    default:
      return spell(tree, 'force', els, { castTime: 0.1 + 0.04 * n, channel: CHANNEL_SPRAY }, [
        { kind: 'spray', range: Math.min(6.5, 3.4 + 0.6 * n), halfAngle: 0.38, pulse: 0.25, payload: payloadFrom(els, 2.8, 1.4, {}, att) },
      ]);
  }
};

const area: Builder = (els, tree) => {
  const n = els.length;
  const att = tree.attuned;
  const radius = 2.8 + 0.4 * n;
  const timing = { castTime: 0.2 + 0.06 * n, recovery: 0.25, moveMult: 0.3 };
  if (tree.form === 'ring-ward') {
    if (tree.title === 'Ring of stone') {
      return spell(tree, 'area', els, timing, [
        { kind: 'wall', material: 'rock', layout: 'ring', length: 1.7, thickness: 0.5, distance: 2.4, duration: 7, payload: EMPTY_PAYLOAD },
      ]);
    }
    return spell(tree, 'area', els, timing, [{ kind: 'ward', resist: wardResist(els), duration: 8, radius: 3 }]);
  }
  if (tree.form === 'zone') {
    // Sustained Circle: lasts while held; first pulse lands immediately.
    return spell(tree, 'area', els, { ...timing, channel: { maxDuration: 8, minDuration: 0.3, moveMult: 0.45 } }, [
      { kind: 'zone', radius: 3.2, duration: 99, pulse: 0.25, follow: true, payload: payloadFrom(els, 1.0, 0, { hitsCaster: true }) },
    ]);
  }
  const burst = payloadFrom(els, 1.3, 0, {}, att);
  burst.knockback = 5 + count(els, 'earth') * 4 + count(els, 'water') * 3;
  if (tree.title === 'Earthquake') burst.statuses.push({ id: 'stunned', intensity: 1, duration: 0.4 });
  const effects: EffectSpec[] = [{ kind: 'burst', radius, duration: 0.35, style: tree.title === 'Earthquake' ? 'quake' : undefined, payload: burst }];
  const lingering = els.filter((e) => e === 'water' || e === 'fire' || e === 'cold' || e === 'steam');
  if (lingering.length) effects.push({ kind: 'zone', radius: radius * 0.85, duration: 3.5, pulse: 0.5, tint: lingering, payload: payloadFrom(lingering, 0.5, 0, {}, att) });
  return spell(tree, 'area', els, timing, effects);
};

const self: Builder = (els, tree) => {
  const n = els.length;
  const timing = { castTime: 0.25 + 0.04 * n, recovery: 0.2, moveMult: 0.5 };
  if (tree.form === 'heal') {
    // Instant heal, then heal over time while held.
    return spell(tree, 'self', els, { ...timing, channel: { maxDuration: 6, minDuration: 0.2, moveMult: 0.4 } }, [
      { kind: 'self', payload: payloadFrom(els, 1.8, 0, { hitsCaster: true }) },
      { kind: 'zone', radius: 0.6, duration: 99, pulse: 0.5, follow: true, selfOnly: true, tint: ['life'], payload: payloadFrom(els, 0.7, 0, { hitsCaster: true }) },
    ]);
  }
  if (tree.form === 'enchant') return spell(tree, 'self', els, timing, [enchantFor(els, tree.title)]);
  return spell(tree, 'self', els, timing, [{ kind: 'ward', resist: wardResist(els), duration: 8 }]);
};

const ENCHANTS: Record<string, EnchantId> = { Ethereal: 'ethereal', Haste: 'haste', 'Glass cannon': 'glass', Stoneskin: 'stoneskin', Cleanse: 'cleanse' };

/** A.1 enchantments. `title` may carry the " (on ally)" suffix of a Point cast. */
function enchantFor(els: readonly Element[], title: string, at?: Anchor): EnchantSpec {
  const enchant = ENCHANTS[title.replace(' (on ally)', '')];
  switch (enchant) {
    case 'ethereal':
      return { kind: 'enchant', enchant, duration: 3, at };
    case 'haste':
      return { kind: 'enchant', enchant, duration: 2 + 2 * count(els, 'lightning'), at };
    case 'glass':
      return { kind: 'enchant', enchant, duration: 6, at };
    case 'stoneskin':
      return { kind: 'enchant', enchant, duration: 12, amount: 20 + 20 * count(els, 'earth'), at };
    default:
      return { kind: 'enchant', enchant: 'cleanse', duration: 0, at };
  }
}

const SWING = { kind: 'swing' as const, range: 1.8, halfAngle: 1.0 };

function swingPayload(els: readonly Element[], att: boolean) {
  const p = payloadFrom(els, 1.0, 0.6, {}, att);
  p.damage.physical = 10;
  p.knockback += 3;
  return p;
}

const CONJURED_SWINGS: Record<'iceblade' | 'whip', (els: readonly Element[]) => { title: string; castTime: number; swing: EffectSpec }> = {
  iceblade: () => ({
    title: 'Ice blade swing',
    castTime: 0.07,
    swing: { kind: 'swing', range: 2.0, halfAngle: 1.1, tint: ['ice'], payload: { damage: { physical: 6, ice: 7 }, statuses: [{ id: 'chilled', intensity: 1, duration: 3 }], knockback: 2 } },
  }),
  whip: () => ({
    title: 'Lightning whip lash',
    castTime: 0.14,
    swing: { kind: 'swing', range: 3.6, halfAngle: 0.45, tint: ['lightning'], style: 'whip', payload: { damage: { physical: 4, lightning: 12 }, statuses: [], knockback: 2 } },
  }),
};

const weapon: Builder = (els, tree, ctx) => {
  const n = els.length;
  const att = tree.attuned;
  const timing = { castTime: 0.12 + 0.03 * n, recovery: 0.25, moveMult: 0.6 };
  if (tree.form === 'swing') {
    if (ctx.conjured) {
      const c = CONJURED_SWINGS[ctx.conjured](els);
      return { ...spell(tree, 'weapon', els, { ...timing, castTime: c.castTime }, [c.swing]), name: c.title };
    }
    return { ...spell(tree, 'weapon', els, timing, [{ ...SWING, payload: swingPayload(els, att) }]), name: 'Sword' };
  }
  const swing: EffectSpec = { ...SWING, payload: swingPayload(els, att) };
  if (tree.form === 'weapon') {
    if (tree.title === 'Bulwark') {
      // Held: a tower shield in front of you that blocks bodies and reflects projectiles.
      const bash: EffectSpec = { ...SWING, range: 1.6, payload: { damage: { physical: 8 }, statuses: [], knockback: 9 } };
      return spell(tree, 'weapon', els, { ...timing, channel: { maxDuration: 8, minDuration: 0.2, moveMult: 0.55 } }, [
        bash,
        { kind: 'wall', material: 'shield', layout: 'guard', length: 1.6, thickness: 0.18, distance: 0.85, duration: 99, reflectAll: true, payload: EMPTY_PAYLOAD },
      ]);
    }
    const kind = tree.title === 'Ice blade' ? 'iceblade' : 'whip';
    return spell(tree, 'weapon', els, timing, [{ kind: 'conjure', weapon: kind, duration: 12 }, CONJURED_SWINGS[kind](els).swing]);
  }
  if (tree.form === 'wave') {
    const p = payloadFrom(els, 0.8, 0, {}, att);
    p.knockback = 9 + 2 * count(els, 'water');
    return spell(tree, 'weapon', els, { ...timing, castTime: 0.2 + 0.05 * n }, [
      swing,
      { kind: 'front', width: 4.6, speed: 6.5, range: 8.5, push: 'forward', style: 'wave', payload: p },
    ]);
  }
  if (tree.title === 'Fault line') {
    const p = payloadFrom(els, 1.2, 0, {}, att);
    p.knockback = 10;
    return spell(tree, 'weapon', els, { ...timing, castTime: 0.2 + 0.05 * n }, [
      swing,
      { kind: 'front', width: 1.3, speed: 10, range: 8, push: 'aside', ridge: 4, style: 'fault', payload: p },
    ]);
  }
  if (tree.title === 'Healing line') {
    return spell(tree, 'weapon', els, timing, [
      { kind: 'front', width: 1.8, speed: 9, range: 8, push: 'forward', style: 'line', payload: payloadFrom(els, 1.6, 0, { alliesOnly: true }) },
    ]);
  }
  return spell(tree, 'weapon', els, timing, [
    swing,
    { kind: 'front', width: 1.1, speed: 11, range: 8, push: 'forward', style: 'line', payload: payloadFrom(els, 1.0, 0.4, {}, att) },
  ]);
};

const point: Builder = (els, tree) => {
  const n = els.length;
  const att = tree.attuned;
  const timing = { castTime: 0.25 + 0.06 * n, recovery: 0.2, moveMult: 0.4 };
  const at = 'point' as const;
  const burst = (radius: number, payload = payloadFrom(els, 1.3, 0.8, {}, att), extra: Partial<EffectSpec> = {}): EffectSpec =>
    ({ kind: 'burst', radius, duration: 0.3, at, payload, ...extra }) as EffectSpec;

  // A.1: Point on an ally casts your Self spell on them.
  if (tree.title.endsWith(' (on ally)')) {
    if (tree.form === 'enchant') return spell(tree, 'point', els, timing, [enchantFor(els, tree.title, 'target')]);
    return spell(tree, 'point', els, timing, [{ kind: 'ward', resist: wardResist(els), duration: 8, at: 'target' } satisfies WardSpec]);
  }
  switch (tree.title) {
    case 'Cage':
      return spell(tree, 'point', els, timing, [{ kind: 'cage', margin: 0.75, duration: 3, at: 'target' }]);
    case 'Lens':
      return spell(tree, 'point', els, timing, [{ kind: 'lens', radius: 0.7, duration: 14, at }]);
    case 'Lantern':
      return spell(tree, 'point', els, timing, [{ kind: 'zone', radius: 2.4, duration: 2.5, pulse: 0.1, at, style: 'lantern', payload: { ...EMPTY_PAYLOAD, grant: 'deathless', hitsCaster: true } }]);
    case 'Ward toss':
      return spell(tree, 'point', els, timing, [{ kind: 'ward', resist: wardResist(els), duration: 8, at: 'target' } satisfies WardSpec]);
    case 'Placed ward':
      return spell(tree, 'point', els, timing, [{ kind: 'ward', resist: wardResist(els), duration: 8, at, radius: 1.8 } satisfies WardSpec]);
    case 'Yank':
      return spell(tree, 'point', els, { ...timing, castTime: 0.2 + 0.04 * n }, [{ kind: 'tether', duration: 0.4, at: 'target', payload: payloadFrom(without(els, 'arcane'), 1.0, 0, {}, att) }]);
    case 'Mend':
      return spell(tree, 'point', els, timing, [{ kind: 'self', at: 'target', payload: payloadFrom(els, 2.2, 0) }]);
    case 'Healing bloom':
      return spell(tree, 'point', els, timing, [burst(1.6, payloadFrom(els, 1.4, 0, { hitsCaster: true }), { style: 'bloom' })]);
    case 'Geyser': {
      const p = payloadFrom(els, 1.5, 0, {}, att);
      p.knockback = 14 + 2 * count(els, 'earth');
      p.statuses.push({ id: 'stunned', intensity: 1, duration: 0.5 });
      return spell(tree, 'point', els, timing, [burst(els.includes('arcane') ? 2.8 : 2.0, p, { delay: 0.6, style: 'geyser' })]);
    }
    case 'Ice spikes':
      return spell(tree, 'point', els, timing, [burst(1.6, payloadFrom(els, 1.6, 0.6, {}, att), { delay: 0.25, style: 'spikes' })]);
    case 'Lightning strike':
      return spell(tree, 'point', els, timing, [burst(1.2, payloadFrom(els, 1.7, 0, {}, att), { delay: 0.3, style: 'strike' })]);
    case 'Flood':
      return spell(tree, 'point', els, timing, [
        { kind: 'surface', surface: 'puddle', radius: 1.6 + 0.3 * n, at },
        burst(1.6 + 0.3 * n, payloadFrom(els, 1, 0.4), { style: 'splash' }),
      ]);
    case 'Frost patch':
      return spell(tree, 'point', els, timing, [burst(2.0, payloadFrom(els, 1.0, 0, {}, att), { style: 'frost' })]);
    case 'Arcane blast':
      return spell(tree, 'point', els, timing, [burst(2.2, payloadFrom(els, 1.4, 1, {}, att), { delay: 0.2, style: 'blast' })]);
    default:
      return spell(tree, 'point', els, timing, [burst(1.8)]);
  }
};

const BUILDERS: Record<CastMode, Builder> = { force, area, self, weapon, point };

export class ProposalAResolver implements SpellResolver {
  /** 'a' = Proposal A (default), 'a1' = the audit's A.1 tweaks. Switchable at runtime (F2). */
  constructor(public rules: RuleSet = 'a') {}

  resolve(elements: readonly Element[], mode: CastMode, ctx: ResolveContext = {}): SpellSpec | null {
    const tree = this.classify(elements, mode, ctx);
    if (tree.form === 'nothing') return null;
    if (ctx.seal) return this.sealed(elements, mode, tree);
    return BUILDERS[mode](elements, tree, ctx);
  }

  /** The leaf a queue would produce, without numbers (HUD, tests). */
  classify(elements: readonly Element[], mode: CastMode, ctx: ResolveContext = {}): TreeLeaf {
    return classify(elements, mode, { seal: ctx.seal, target: ctx.target, variant: this.rules === 'a1' ? 'a1' : undefined });
  }

  private sealed(els: readonly Element[], mode: CastMode, tree: TreeLeaf): SpellSpec {
    const n = els.length;
    const timing = { castTime: 0.25 + 0.05 * n, recovery: 0.15, moveMult: 0.5 };
    const areaSpec = this.resolve(els, 'area')!;
    const seal = (e: Omit<Extract<EffectSpec, { kind: 'seal' }>, 'kind'>) => spell(tree, mode, els, timing, [{ kind: 'seal', ...e }]);
    switch (mode) {
      case 'self':
        return seal({ vessel: 'staff', release: this.resolve(els, 'force')!, contingency: els.includes('shield') ? areaSpec : undefined });
      case 'point':
        return seal({ vessel: 'rune', release: areaSpec, effigy: tree.title === 'Effigy' });
      case 'force':
        return seal({ vessel: 'line', release: areaSpec });
      case 'weapon':
        return seal({ vessel: 'loaded', release: areaSpec });
      case 'area': {
        const orbit = tree.title === 'Healing orbitals' ? 'heal' : tree.title === 'Shield plates' ? 'ward' : 'projectile';
        const att = tree.attuned;
        const charge: EffectSpec =
          orbit === 'heal' ? { kind: 'self', at: 'target', payload: payloadFrom(['life'], 1.6, 0) }
          : orbit === 'ward' ? { kind: 'ward', resist: wardResist(els), duration: 6, at: 'target' }
          : { kind: 'projectile', speed: 16, radius: 0.2, range: 14, payload: payloadFrom(els, 0.7, 0.8, {}, att), onImpact: { kind: 'burst', radius: 1.1, duration: 0.18, payload: payloadFrom(els, 0.35, 0.5, {}, att) } };
        const release = spell(tree, 'force', els, { castTime: 0 }, [charge]);
        return seal({ vessel: 'orbit', release, charges: Math.max(1, n), orbit });
      }
    }
  }
}
