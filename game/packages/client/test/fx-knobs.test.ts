import { describe, expect, it } from 'vitest';
import { allKnobs, defKnob, getKnob, knobOverrides, onKnobChange, resetKnob, setKnob, setSavedKnobs, unsavedKnobs } from '../src/art/fx-knobs';
import { parseKnobValues } from '../src/art/fx-knobs-check';
import '../src/art/spray-jet';

describe('fx knobs', () => {
  it('declares knobs at their code defaults, once per id', () => {
    const k = defKnob('test.a.size', 1.5, { min: 0, max: 3 });
    expect(k.v).toBe(1.5);
    expect(defKnob('test.a.size', 9, { min: 0, max: 9 })).toBe(k);
    expect(getKnob('test.a.size')).toBe(k);
    expect(allKnobs().map((x) => x.id)).toContain('test.a.size');
  });

  it('the committed fx-knobs.json is valid and every spray knob is in range at its default', () => {
    const spray = allKnobs().filter((k) => k.id.startsWith('spray.'));
    expect(spray.length).toBeGreaterThanOrEqual(12);
    const bad = spray.filter((k) => !(k.min <= k.dflt && k.dflt <= k.max)).map((k) => k.id);
    expect(bad).toEqual([]);
  });

  it('sets, resets and reports overrides and unsaved values', () => {
    const k = defKnob('test.b.density', 1, { min: 0, max: 3 });
    const seen: (string | null)[] = [];
    const off = onKnobChange((x) => seen.push(x ? x.id : null));
    expect(setKnob('test.b.density', 2)).toBe(true);
    expect(setKnob('test.b.density', NaN)).toBe(false);
    expect(setKnob('test.nope.x', 1)).toBe(false);
    expect(k.v).toBe(2);
    expect(knobOverrides()['test.b.density']).toBe(2);
    expect(unsavedKnobs()['test.b.density']).toBe(2);
    setSavedKnobs({ ...knobOverrides() });
    expect(unsavedKnobs()['test.b.density']).toBeUndefined();
    resetKnob('test.b.density');
    expect(k.v).toBe(1);
    expect(knobOverrides()['test.b.density']).toBeUndefined();
    expect(unsavedKnobs()['test.b.density']).toBe(1);
    off();
    expect(seen).toEqual(['test.b.density', null, 'test.b.density']);
    setSavedKnobs({});
  });

  it('a new saved file moves knobs still at the old saved value, and keeps unsaved edits', () => {
    const a = defKnob('test.c.a', 1, { min: 0, max: 3 }), b = defKnob('test.c.b', 1, { min: 0, max: 3 });
    setKnob(b.id, 2.5);
    setSavedKnobs({ 'test.c.a': 0.5, 'test.c.b': 0.7 });
    expect(a.v).toBe(0.5);
    expect(b.v).toBe(2.5);
    setSavedKnobs({});
    expect(a.v).toBe(1);
    resetKnob(b.id);
  });

  it('parses override files, rejecting bad ids and values', () => {
    expect(parseKnobValues({ 'spray.fire.flameSize': 1.4, 'spray.cold.mist': 0 })).toEqual({ values: { 'spray.fire.flameSize': 1.4, 'spray.cold.mist': 0 }, errors: [] });
    const r = parseKnobValues({ 'spray.fire.heat': '0.2', 'spray.fire.flames': Infinity, 'spray.fire.embers': null, nodots: 1, 'Bad.id': 1, '../x.y': 1, 'spray.ok.v': -0.25 });
    expect(r.values).toEqual({ 'spray.ok.v': -0.25 });
    expect(r.errors).toHaveLength(6);
    for (const raw of [null, 3, 'x', [1, 2]]) expect(parseKnobValues(raw).errors).toEqual(['not an object of id: number']);
  });
});
