import { describe, expect, it } from 'vitest';
import { MOODS, PROP_LIGHTS, moodOf } from '../src/art/lighting';
import { propMeta } from '../src/art/assets';

describe('scene lighting', () => {
  it('picks a room\'s own mood, and lets the URL override it', () => {
    expect(moodOf('academy')).toBe(MOODS.interior);
    expect(moodOf('survive')).toBe(MOODS.dusk);
    expect(moodOf('sanctum')).toBe(MOODS.day);
    expect(moodOf('academy', 'night')).toBe(MOODS.night);
    expect(moodOf('academy', 'nonsense')).toBe(MOODS.interior);
  });

  it('keeps every mood\'s shadow darker than its ambient, and never plain grey', () => {
    for (const m of Object.values(MOODS)) {
      for (let c = 0; c < 3; c++) expect(m.shadow[c]).toBeLessThan(m.ambient[c]);
      expect(m.shadow[2]).toBeGreaterThan(m.shadow[0]); // shadows lean blue
    }
  });

  it('only names props that exist', () => {
    for (const id of Object.keys(PROP_LIGHTS)) expect(propMeta(id), id).toBeDefined();
  });
});
