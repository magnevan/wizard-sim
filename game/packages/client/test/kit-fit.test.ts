import { describe, expect, it } from 'vitest';
import { RAIL_HIDE, RAIL_MOD, railFit } from '../src/lab/kit-fit';

describe('kit renderer fitting', () => {
  it('lays balustrade modules near their own size, reaching no further into a pier than it hides', () => {
    expect(railFit(2 - 0.55)).toEqual({ n: 1, shown: RAIL_MOD, sx: 1 });            // a straight section: exactly one module, as before
    const ch = railFit(1.4142 - 0.55);                                               // a chamfer: 0.86 u between the piers
    expect(ch.n).toBe(1); expect(ch.sx).toBeGreaterThan(0.9);                        // was 0.6
    expect(ch.shown - (1.4142 - 0.55)).toBeLessThanOrEqual(2 * RAIL_HIDE + 1e-9);
    const long = railFit(1.95);                                                      // a long sweep section: two modules, not one stretched
    expect(long.n).toBe(2); expect(Math.abs(Math.log(long.sx))).toBeLessThan(0.2);
    for (let s = 0.3; s < 4; s += 0.05) { const f = railFit(s); expect(f.shown).toBeGreaterThanOrEqual(s - 1e-9); expect(f.shown).toBeLessThanOrEqual(s + 2 * RAIL_HIDE + 1e-9); }
  });
});
