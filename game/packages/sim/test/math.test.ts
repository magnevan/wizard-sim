import { describe, expect, it } from 'vitest';
import { atan2Turns, cosTurns, createRng, nextFloat, nextU32, sinTurns } from '../src';

// The test may use Math.sin as a reference; the sim may not.
describe('deterministic trig', () => {
  it('sinTurns and cosTurns match Math.sin within 1e-8', () => {
    for (let k = -2000; k <= 2000; k++) {
      const t = k / 397;
      expect(Math.abs(sinTurns(t) - Math.sin(t * 2 * Math.PI))).toBeLessThan(1e-8);
      expect(Math.abs(cosTurns(t) - Math.cos(t * 2 * Math.PI))).toBeLessThan(1e-8);
    }
  });

  it('atan2Turns matches Math.atan2 within 1e-7 turns', () => {
    for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
      const y = i / 7, x = j / 3;
      if (x === 0 && y === 0) continue;
      expect(Math.abs(atan2Turns(y, x) - Math.atan2(y, x) / (2 * Math.PI))).toBeLessThan(1e-7);
    }
  });
});

describe('rng', () => {
  it('is reproducible from a seed and spreads over [0, 1)', () => {
    const a = createRng(42), b = createRng(42);
    const xs = Array.from({ length: 1000 }, () => nextU32(a));
    expect(Array.from({ length: 1000 }, () => nextU32(b))).toEqual(xs);
    const c = createRng(1);
    let lo = 0;
    for (let i = 0; i < 10000; i++) { const f = nextFloat(c); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1); if (f < 0.5) lo++; }
    expect(lo).toBeGreaterThan(4800);
    expect(lo).toBeLessThan(5200);
  });

  it('known first values for seed 7 (a change here changes every replay)', () => {
    const s = createRng(7);
    expect([nextU32(s), nextU32(s), nextU32(s)]).toMatchInlineSnapshot(`
      [
        838155491,
        1550620431,
        3610122010,
      ]
    `);
  });
});
