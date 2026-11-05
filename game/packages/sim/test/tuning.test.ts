import { afterEach, describe, expect, it } from 'vitest';
import { RUNES, applyOverrides, findTunable, overrides, resetTuning, tunables, tuningHash } from '../src';

afterEach(() => resetTuning());

describe('tuning registry', () => {
  it('lists every table with unique ids and sane ranges', () => {
    const t = tunables();
    expect(t.length).toBeGreaterThan(100);
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length);
    for (const x of t) { expect(x.def).toBeGreaterThanOrEqual(x.min); expect(x.def).toBeLessThanOrEqual(x.max); }
  });

  it('setting a tunable changes the game table, and overrides / reset / hash follow', () => {
    expect(tuningHash()).toBe(0);
    findTunable('runes.regen')!.set(0.5);
    expect(RUNES.regen).toBe(0.5);
    expect(overrides()).toEqual({ 'runes.regen': 0.5 });
    const h = tuningHash();
    expect(h).not.toBe(0);
    resetTuning();
    expect(RUNES.regen).toBe(1);
    expect(applyOverrides({ 'runes.regen': 0.5, 'nope.x': 1 })).toEqual(['nope.x']);
    expect(tuningHash()).toBe(h);
  });

  it('covers enemies', () => expect(findTunable('enemy.brute.hp')?.def).toBeGreaterThan(100));
});

describe('dev helpers', () => {
  it('start a wave in the Sanctum and spawn enemies on demand', async () => {
    const { ARCH, KIND, createWorld, devSpawnEnemy, devStartWave, step, NO_INPUT } = await import('../src');
    const w = createWorld(1, 1);
    const i = devSpawnEnemy(w, ARCH.brute, 3, 3);
    expect(w.bodies.kind[i]).toBe(KIND.enemy);
    devStartWave(w, 3, 0.5);
    expect(w.enc.total[0]).toBeGreaterThan(0);
    for (let t = 0; t < 120; t++) step(w, [NO_INPUT]);
    expect(Array.from(w.bodies.arch).filter((a) => a === ARCH.shieldbearer || a === ARCH.caster).length).toBeGreaterThan(0);
  });
});
