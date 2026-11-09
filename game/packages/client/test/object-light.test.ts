import { describe, expect, it } from 'vitest';
import { lightOnObject, nearWalls, type ObjectLight } from '../src/art/lighting';

const light = (x: number, y: number, occ: number[] = []): ObjectLight => {
  const R = 60;
  return { x, y, r: R, R, a: 1, cr: 1, cg: 0.5, cb: 0, near: nearWalls(occ, x, y, R) };
};
const on = (L: ObjectLight, x: number, y: number): number[] => { const o = [0, 0, 0]; lightOnObject([L], 1, x, y, o); return o; };

describe('light on standing things', () => {
  it('reaches something in front of it, in the light\'s colour', () => {
    const o = on(light(0, 20), 0, 0);
    expect(o[0]).toBeGreaterThan(0.2);
    expect(o[1]).toBeCloseTo(o[0] / 2);
    expect(o[2]).toBe(0);
  });

  it('barely shows on something the light is behind', () => {
    const front = on(light(0, 16), 0, 0)[0], behind = on(light(0, -16), 0, 0)[0];
    expect(behind).toBeLessThan(front * 0.3);
  });

  it('fades with distance, and stops at its reach', () => {
    expect(on(light(0, 5), 0, 0)[0]).toBeGreaterThan(on(light(40, 15), 0, 0)[0]);
    expect(on(light(200, 200), 0, 0)[0]).toBe(0);
  });

  it('is stopped by a wall between them', () => {
    const wall = [-40, 10, 40, 10]; // across the screen, between the light below it and the thing above
    expect(on(light(0, 20), 0, 0)[0]).toBeGreaterThan(0.2);
    expect(on(light(0, 20, wall), 0, 0)[0]).toBe(0);
  });

  it('isn\'t stopped by the wall the thing stands against', () => {
    expect(on(light(0, 20, [-40, 0, 40, 0]), 0, 0)[0]).toBeGreaterThan(0.2);
  });
});
