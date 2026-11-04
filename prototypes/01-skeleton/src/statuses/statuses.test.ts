import { describe, expect, it } from 'vitest';
import { applyStatus, canCast, damageTakenMultiplier, speedMultiplier, tickStatuses, type StatusBag } from './statuses';

const wet = { id: 'wet', intensity: 1, duration: 5 } as const;
const chill = { id: 'chilled', intensity: 1, duration: 4 } as const;
const burn = { id: 'burning', intensity: 1, duration: 4 } as const;

describe('status interactions', () => {
  it('wet + cold -> frozen', () => {
    const bag: StatusBag = {};
    applyStatus(bag, wet);
    const fx = applyStatus(bag, chill);
    expect(Object.keys(bag)).toEqual(['frozen']);
    expect(fx).toContain('freeze');
  });

  it('cold + wet -> frozen (other order)', () => {
    const bag: StatusBag = {};
    applyStatus(bag, chill);
    applyStatus(bag, wet);
    expect(Object.keys(bag)).toEqual(['frozen']);
  });

  it('burning dries a wet target and is spent', () => {
    const bag: StatusBag = {};
    applyStatus(bag, wet);
    expect(applyStatus(bag, burn)).toContain('steam');
    expect(bag).toEqual({});
  });

  it('burning removes chill', () => {
    const bag: StatusBag = {};
    applyStatus(bag, chill);
    applyStatus(bag, burn);
    expect(bag.chilled).toBeUndefined();
  });

  it('burning thaws frozen', () => {
    const bag: StatusBag = {};
    applyStatus(bag, wet);
    applyStatus(bag, chill);
    expect(applyStatus(bag, burn)).toContain('thaw');
    expect(bag).toEqual({});
  });

  it('wet extinguishes burning and still soaks', () => {
    const bag: StatusBag = {};
    applyStatus(bag, burn);
    applyStatus(bag, wet);
    expect(bag.burning).toBeUndefined();
    expect(bag.wet).toBeDefined();
  });

  it('chill stacks to max intensity and converts to frozen', () => {
    const bag: StatusBag = {};
    applyStatus(bag, chill);
    applyStatus(bag, chill);
    expect(bag.chilled?.intensity).toBe(2);
    applyStatus(bag, chill);
    expect(bag.chilled).toBeUndefined();
    expect(bag.frozen).toBeDefined();
  });

  it('accepts a custom interaction table', () => {
    const bag: StatusBag = {};
    applyStatus(bag, burn, []);
    applyStatus(bag, wet, []);
    expect(bag.burning).toBeDefined();
    expect(bag.wet).toBeDefined();
  });
});

describe('status effects', () => {
  it('stacking refreshes duration and caps intensity', () => {
    const bag: StatusBag = {};
    for (let i = 0; i < 10; i++) applyStatus(bag, burn);
    expect(bag.burning?.intensity).toBe(3);
    expect(bag.burning?.remaining).toBe(4);
  });

  it('burning deals damage over time and expires', () => {
    const bag: StatusBag = {};
    applyStatus(bag, burn);
    let total = 0;
    for (let i = 0; i < 300; i++) for (const t of tickStatuses(bag, 1 / 60)) total += t.amount;
    expect(total).toBeCloseTo(24, 0); // 6/s for 4s
    expect(bag.burning).toBeUndefined();
  });

  it('frozen is immobile and cannot cast', () => {
    const bag: StatusBag = {};
    applyStatus(bag, wet);
    applyStatus(bag, chill);
    expect(speedMultiplier(bag)).toBe(0);
    expect(canCast(bag)).toBe(false);
  });

  it('wet doubles lightning damage', () => {
    const bag: StatusBag = {};
    applyStatus(bag, wet);
    expect(damageTakenMultiplier(bag, 'lightning')).toBe(2);
    expect(damageTakenMultiplier(bag, 'fire')).toBe(1);
  });
});
