import { describe, expect, it } from 'vitest';
import { floorMats } from '../src/lab/kit-render';

describe('kit floors', () => {
  it('offers every flat-tone floor, and never a wall, step or prop texture', () => {
    const m = floorMats();
    for (const f of ['paving', 'plaza', 'road', 'lawn', 'woods', 'dirt', 'sand', 'rock', 'deck', 'water']) expect(m).toContain(f);
    for (const n of m) expect(n).not.toMatch(/^(ashlar|smooth-stone|tread|kerb|plaza-disc|tiles|vine-|banner-)/);
    expect([...m].sort()).toEqual(m);
  });
});
