/**
 * The tuning panel's pure parts: the meters' accounting and reading a pasted tuning. The DOM
 * half is checked by the screenshots.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARCH, EV, PHASE_ENC, findTunable, overrides, resetTuning, tuningHash, type SimEvent } from '@wizard-sim/sim';
import { Meters, type MeterProbe } from '../src/meters';
import { STORE_KEY, exportText, loadSaved, parseOverrides, replaceTuning, saveTuning } from '../src/tune-io';

const ev = (tick: number, kind: SimEvent['kind'], who: number, more: Partial<SimEvent> = {}): SimEvent => ({ tick, kind, who, x: 0, y: 0, ...more });

function probe(runes = 3, phase: number = PHASE_ENC.off, enemies = new Set([10, 11])): MeterProbe & { phase: number; runes: number } {
  const p = {
    phase, runes,
    castRunes: () => p.runes,
    isEnemy: (i: number) => enemies.has(i),
    encPhase: () => p.phase,
    waveNo: () => 2,
  };
  return p;
}

describe('Meters', () => {
  it('credits seat hits to the last cast spell, with runes and damage per rune', () => {
    const m = new Meters(0), p = probe(3);
    m.step(0, [ev(0, 'cast', 0, { text: 'Steam Beam' })], p);
    m.step(1, [ev(1, 'hit', 10, { src: 0, amount: 12 }), ev(1, 'hit', 11, { src: 1, amount: 50 })], p);
    p.runes = 2;
    m.step(2, [ev(2, 'cast', 0, { text: 'Rock' }), ev(2, 'hit', 10, { src: 0, amount: 30 })], p);
    m.step(3, [ev(3, 'hit', 0, { src: 0, amount: 5 }), ev(3, 'heal', 0, { src: 0, amount: 7 })], p); // self-damage doesn't count
    const rows = m.spellRows();
    expect(rows.map((r) => r.title)).toEqual(['Rock', 'Steam Beam']);
    expect(rows[0]).toMatchObject({ casts: 1, damage: 30, heal: 7, runes: 2 });
    expect(rows[1]).toMatchObject({ casts: 1, damage: 12, runes: 3 });
    expect(m.totalDamage).toBe(42);
    expect(m.totalHeal).toBe(7);
    expect(m.totalRunes).toBe(5);
  });

  it('measures DPS over the last 3 s only', () => {
    const m = new Meters(0), p = probe();
    m.step(0, [ev(0, 'hit', 10, { src: 0, amount: 600 })], p);
    for (let t = 1; t < 600; t++) m.step(t, t === 500 ? [ev(t, 'hit', 10, { src: 0, amount: 90 })] : [], p);
    expect(m.dps()).toBeCloseTo(30, 5); // 90 in the 3 s window; the early 600 has aged out
  });

  it('times a kill from the first hit to its death, per archetype', () => {
    const m = new Meters(0), p = probe();
    m.step(10, [ev(10, 'hit', 10, { src: 1, amount: 5 })], p);
    m.step(40, [ev(40, 'hit', 10, { src: 0, amount: 5 })], p);
    m.step(100, [ev(100, 'fizzle', 10, { ev: EV.death, text: 'dies', look: ARCH.brute })], p);
    expect(m.kills.get(ARCH.brute)).toEqual({ arch: ARCH.brute, kills: 1, seconds: 1.5 });
  });

  it('records a wave clear time, but not a wipe', () => {
    const m = new Meters(0), p = probe(1, PHASE_ENC.lull);
    m.step(0, [], p);
    p.phase = PHASE_ENC.wave; m.step(60, [], p);
    p.phase = PHASE_ENC.breather; m.step(660, [], p);
    p.phase = PHASE_ENC.wave; m.step(700, [], p);
    p.phase = PHASE_ENC.breather; m.step(800, [ev(800, 'cast', -1, { ev: EV.wiped, text: 'Wiped' })], p);
    expect(m.waves).toEqual([{ wave: 2, seconds: 10 }]);
  });

  it('counts runes per minute', () => {
    const m = new Meters(0), p = probe(4);
    for (let t = 0; t < 3600; t++) m.step(t, t % 600 === 0 ? [ev(t, 'cast', 0, { text: 'X' })] : [], p);
    expect(m.runesPerMinute()).toBeCloseTo(24, 5); // 6 casts × 4 runes in 60 s
  });
});

describe('tuning import and storage', () => {
  afterEach(() => resetTuning());

  it('parses an overrides map and rejects anything else', () => {
    expect(parseOverrides('')).toEqual({ ok: true, map: {} });
    expect(parseOverrides('{"runes.regen": 0.5}')).toEqual({ ok: true, map: { 'runes.regen': 0.5 } });
    expect(parseOverrides('{"runes.regen": "fast"}').ok).toBe(false);
    expect(parseOverrides('[1, 2]').ok).toBe(false);
    expect(parseOverrides('{nope').ok).toBe(false);
  });

  it('replaces the tuning, reports unknown ids, and round-trips through export', () => {
    findTunable('rhythm.recovery')!.set(9);
    const unknown = replaceTuning({ 'runes.regen': 0.5, 'no.such': 1 });
    expect(unknown).toEqual(['no.such']);
    expect(overrides()).toEqual({ 'runes.regen': 0.5 }); // the old recovery change is gone
    const p = parseOverrides(exportText());
    expect(p.ok && p.map).toEqual({ 'runes.regen': 0.5 });
    expect(tuningHash()).not.toBe(0);
  });

  it('saves to and loads from a store, and survives a broken one', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    findTunable('runes.regen')!.set(0.25);
    saveTuning(store);
    resetTuning();
    loadSaved(store);
    expect(overrides()).toEqual({ 'runes.regen': 0.25 });
    resetTuning(); saveTuning(store);
    expect(data.has(STORE_KEY)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(() => { loadSaved(broken); saveTuning(broken); }).not.toThrow();
  });
});
