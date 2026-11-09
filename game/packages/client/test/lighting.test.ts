import { describe, expect, it } from 'vitest';
import { MOODS, PROP_LIGHTS, moodOf } from '../src/art/lighting';
import { propMeta } from '../src/art/assets';
import { paintGround, todayCamera, type GroundMap, type Material } from '../src/art/ground';

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

  it('leaves the mood out of the painted ground when the scene is lit', () => {
    const data = new Uint8ClampedArray(16 * 4).fill(128);
    const m: Material = { w: 4, h: 4, data, flip: false };
    const g: GroundMap = { w: 4, h: 4, rows: Array.from({ length: 8 }, () => 'g'.repeat(8)) };
    const a = new Uint8ClampedArray(400 * 400 * 4), b = new Uint8ClampedArray(400 * 400 * 4);
    paintGround(a, 400, 400, 200, 200, g, { g: m }, 'g', todayCamera, g.w, false);
    paintGround(b, 400, 400, 200, 200, g, { g: m }, 'g', todayCamera, g.w, true);
    // far from the centre, the baked falloff darkens the unlit version and not the lit one
    expect(b[0]).toBeGreaterThan(a[0]);
  });
});
