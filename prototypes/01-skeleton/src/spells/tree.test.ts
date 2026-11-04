import { describe, expect, it } from 'vitest';
// The canonical Proposal A rules (shared with the explorer page).
import resolverSource from '../../../../tools/spell-tree/resolver.js?raw';
import { ELEMENT_IDS, type Element } from './elements';
import { ProposalAResolver } from './proposalA';
import { classify, RECIPES, type TreeOptions } from './tree';
import { CAST_MODES, type CastMode, type PointTarget } from './types';

interface JsLeaf {
  form: string;
  title: string;
  leaf: string | null;
  attuned: boolean;
}
interface JsTree {
  resolve(queue: string[], mode: string, opts?: TreeOptions): JsLeaf;
  RECIPES: [string, string, string[], string, TreeOptions][];
}

function loadJs(): JsTree {
  const win: { SpellTreeA?: JsTree } = {};
  new Function('window', resolverSource)(win);
  return win.SpellTreeA!;
}

const js = loadJs();
const r = new ProposalAResolver();
const pick = (l: JsLeaf) => ({ form: l.form, title: l.title, leaf: l.leaf, attuned: l.attuned });

describe('Proposal A tree (port of tools/spell-tree/resolver.js)', () => {
  it('has the same RECIPES table', () => {
    expect(RECIPES.map(([name, star, els, mode, opts]) => [name, star, els, mode, opts])).toEqual(js.RECIPES);
  });

  it.each(js.RECIPES.map((rec) => [rec[0], rec] as const))('recipe %s resolves to the same leaf and form', (_name, [name, , els, mode, opts]) => {
    const ts = classify(els as Element[], mode as CastMode, opts);
    expect(pick(ts)).toEqual(pick(js.resolve(els, mode, opts)));
    expect(ts.leaf ?? '').toContain(name === 'Primed Orbitals' || name === 'Spell Quiver' ? 'Orbitals' : name === 'Trap Rune' || name === 'Detonation Lattice' ? 'Rune' : name.split(' ')[0]);
  });

  it('every recipe resolves to a playable SpellSpec of the same form', () => {
    for (const [, , els, mode, opts] of RECIPES) {
      const spec = r.resolve(els, mode, opts);
      expect(spec, `${els.join('+')} ${mode}`).not.toBeNull();
      expect(spec!.form).toBe(classify(els, mode, opts).form);
      expect(spec!.effects.length).toBeGreaterThan(0);
      expect(spec!.castTime).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([['A', undefined], ['A.1', 'a1']] as const)('rule set %s matches the JS rules for every queue of up to 3 elements, in every mode, target and seal state', (_name, variant) => {
    const queues: Element[][] = [[]];
    for (let n = 0; n < 3; n++) {
      for (const q of queues.filter((x) => x.length === n)) for (const e of ELEMENT_IDS) queues.push([...q, e]);
    }
    const targets: PointTarget[] = ['ground', 'ally', 'enemy'];
    let checked = 0;
    for (const q of queues) {
      for (const mode of CAST_MODES) {
        for (const seal of [false, true]) {
          for (const target of mode === 'point' ? targets : [undefined]) {
            const opts: TreeOptions = { seal, target, variant };
            expect(pick(classify(q, mode, opts)), `${q.join('+')} ${mode} ${JSON.stringify(opts)}`).toEqual(pick(js.resolve(q, mode, opts)));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it.each(['a', 'a1'] as const)('rule set %s resolves everything non-empty to a spec (no crashes, cast time from the spec)', (rules) => {
    const res = new ProposalAResolver(rules);
    for (const a of ELEMENT_IDS) {
      for (const b of ELEMENT_IDS) {
        for (const mode of CAST_MODES) {
          for (const seal of [false, true]) {
            for (const target of ['ground', 'ally', 'enemy'] as const) {
              const spec = res.resolve([a, b], mode, { seal, target });
              if (spec) {
                expect(spec.castTime).toBeGreaterThanOrEqual(0);
                expect(spec.form).toBe(res.classify([a, b], mode, { seal, target }).form);
                expect(spec.effects.length).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });
});

describe('Proposal A.1 spells', () => {
  const a1 = new ProposalAResolver('a1');
  const first = (els: Element[], mode: CastMode, target?: PointTarget) => a1.resolve(els, mode, { target })!.effects[0];
  it('Self casts enchant', () => {
    expect(first(['shield', 'arcane'], 'self')).toMatchObject({ kind: 'enchant', enchant: 'ethereal' });
    expect(first(['lightning'], 'self')).toMatchObject({ kind: 'enchant', enchant: 'haste' });
    expect(first(['arcane', 'fire'], 'self')).toMatchObject({ kind: 'enchant', enchant: 'glass' });
    expect(first(['earth'], 'self')).toMatchObject({ kind: 'enchant', enchant: 'stoneskin' });
    expect(first(['water'], 'self')).toMatchObject({ kind: 'enchant', enchant: 'cleanse' });
    expect(first(['shield'], 'self').kind).toBe('ward');
  });
  it('Haste lasts longer with more lightning', () => {
    const d = (n: number) => {
      const e = first(Array(n).fill('lightning'), 'self');
      return e.kind === 'enchant' ? e.duration : 0;
    };
    expect(d(3)).toBeGreaterThan(d(1));
  });
  it('Point on an ally casts the Self spell on them', () => {
    expect(first(['lightning'], 'point', 'ally')).toMatchObject({ kind: 'enchant', enchant: 'haste', at: 'target' });
    expect(first(['life'], 'point', 'ally')).toMatchObject({ kind: 'self', at: 'target' });
    expect(first(['shield', 'fire'], 'point', 'ally')).toMatchObject({ kind: 'ward', at: 'target' });
  });
  it('Shield on an enemy cages it; Yank needs Arcane alone', () => {
    expect(first(['shield'], 'point', 'enemy').kind).toBe('cage');
    expect(first(['shield', 'arcane'], 'point', 'enemy').kind).toBe('lens');
    expect(first(['arcane'], 'point', 'enemy').kind).toBe('tether');
    expect(first(['earth', 'arcane'], 'point', 'enemy')).toMatchObject({ kind: 'burst', style: 'geyser' });
  });
});

describe('Proposal A spells', () => {
  it('maps forms to effect kinds', () => {
    expect(r.resolve(['shield', 'earth'], 'force')!.effects[0]).toMatchObject({ kind: 'wall', material: 'rock' });
    expect(r.resolve(['ice'], 'force')!.effects[0]).toMatchObject({ kind: 'projectile', bounces: 3 });
    expect(r.resolve(['earth'], 'force')!.charge).toBeDefined();
    expect(r.resolve(['lightning'], 'force')!.effects[0].kind).toBe('arc');
    expect(r.resolve(['water', 'water'], 'weapon')!.effects.some((e) => e.kind === 'front' && e.style === 'wave')).toBe(true);
    expect(r.resolve(['earth', 'arcane'], 'point')!.effects[0]).toMatchObject({ kind: 'burst', at: 'point', delay: 0.6 });
    expect(r.resolve(['arcane'], 'point', { target: 'enemy' })!.effects[0].kind).toBe('tether');
    expect(r.resolve(['life'], 'point', { target: 'ally' })!.effects[0]).toMatchObject({ kind: 'self', at: 'target' });
    expect(r.resolve(['water'], 'point')!.effects[0].kind).toBe('surface');
    expect(r.resolve(['shield', 'arcane'], 'point')!.effects[0].kind).toBe('lens');
  });

  it('Life in a damaging spell makes it attuned (spares allies)', () => {
    const p = r.resolve(['fire', 'earth', 'life'], 'area')!.effects[0];
    expect('payload' in p && p.payload.attuned).toBe(true);
    expect('payload' in p && p.payload.damage.life).toBeUndefined();
    const plain = r.resolve(['fire', 'earth'], 'area')!.effects[0];
    expect('payload' in plain && plain.payload.attuned).toBeFalsy();
  });

  it('sealed spells pick the vessel by mode', () => {
    const vessel = (els: Element[], mode: CastMode) => {
      const e = r.resolve(els, mode, { seal: true })!.effects[0];
      return e.kind === 'seal' ? e.vessel : null;
    };
    expect(vessel(['fire'], 'self')).toBe('staff');
    expect(vessel(['fire'], 'point')).toBe('rune');
    expect(vessel(['fire'], 'force')).toBe('line');
    expect(vessel(['fire'], 'area')).toBe('orbit');
    expect(vessel(['fire'], 'weapon')).toBe('loaded');
    const staff = r.resolve(['shield', 'fire'], 'self', { seal: true })!.effects[0];
    expect(staff.kind === 'seal' && staff.contingency?.mode).toBe('area');
    expect(r.resolve([], 'point', { seal: true })).toBeNull();
  });
});
