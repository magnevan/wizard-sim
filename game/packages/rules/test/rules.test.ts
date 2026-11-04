import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS script module
import { ATLAS, OUT, wrapRules } from '../../../scripts/sync-rules.mjs';
import { rules, type Element } from '../src';

describe('@wizard-sim/rules', () => {
  it('is in sync with the Atlas copy (run `npm run sync-rules` after a rules change)', () => {
    const fresh = wrapRules(readFileSync(ATLAS, 'utf8'));
    const ours = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
    expect(ours === fresh).toBe(true);
  });

  it('resolves the look rule: arcane carrying fire is a fire beam', () => {
    let q: Element[] = [];
    for (const e of ['arcane', 'fire'] as const) q = rules.addElement(q, e).queue;
    const s = rules.resolve(q, 'force');
    expect(s.title).toBe('Fire beam');
    expect(s.form).toBe('arcane');
    expect(s.look).toBe('fire');
  });

  it('cancels opposites', () => {
    const { queue, event } = rules.addElement(['fire'], 'cold');
    expect(queue).toEqual([]);
    expect(event).toMatch(/cancels/);
  });
});
