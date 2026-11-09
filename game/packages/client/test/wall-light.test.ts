import { describe, expect, it } from 'vitest';
import { castRay, nearWalls } from '../src/art/lighting';
import { FY } from '../src/camera';

describe('walls stop light', () => {
  // a wall running across, 40 px to the right of the light (scene px)
  const occ = [40, -80, 40, 80];
  it('finds a wall within reach, in unsquashed ground space', () => {
    const near = nearWalls(occ, 0, 0, 60);
    expect(near.length).toBe(4);
    expect(near[0]).toBe(40);
    expect(near[1]).toBeCloseTo(-80 / FY);
  });
  it('ignores walls out of reach, and one the light stands on', () => {
    expect(nearWalls(occ, 0, 0, 30)).toEqual([]);
    expect(nearWalls(occ, 40, 0, 60)).toEqual([]);
  });
  it('stops a ray at the nearest wall, and lets others run to full length', () => {
    const near = nearWalls(occ, 0, 0, 60);
    expect(castRay(1, 0, near, 60)).toBeCloseTo(40);
    expect(castRay(-1, 0, near, 60)).toBeCloseTo(60);
    expect(castRay(0, 1, near, 60)).toBeCloseTo(60);
  });
  it('takes the closer of two walls', () => {
    const two = [20, -50, 20, 50, 40, -50, 40, 50];
    expect(castRay(1, 0, two, 60)).toBeCloseTo(20);
  });
});
