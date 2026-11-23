import { describe, expect, it } from 'vitest';
import { angleOf, circle3, inRange, roundFrom, roundHandles, roundPoints, roundThrough } from '../src/lab/editor/round';

describe('map editor rounds', () => {
  it('reads angles as the compiler does: 0 east, 90 south, ranges that wrap', () => {
    expect(angleOf([0, 0], [0, 5])).toBeCloseTo(90);
    expect(angleOf([0, 0], [0, -5])).toBeCloseTo(270);
    expect(inRange(10, 350, 20)).toBe(true);
    expect(inRange(180, 350, 20)).toBe(false);
    expect(inRange(90, 17, 163)).toBe(true);
  });

  it('fits a circle and its arc through three points along an edge', () => {
    expect(circle3([0, 0], [1, 1], [2, 2])).toBeNull();
    const c = circle3([10, 0], [0, 10], [-10, 0])!;
    expect(c.centre[0]).toBeCloseTo(0); expect(c.centre[1]).toBeCloseTo(0); expect(c.r).toBeCloseTo(10);
    // east, south, west: the southern half (0 -> 180 through 90)
    expect(roundThrough([10, 0], [0, 10], [-10, 0])).toEqual({ centre: [0, 0], r: 10, from: 0, to: 180 });
    // east, north, west: the northern half, which runs from west (180) to east (360 = 0)
    expect(roundThrough([10, 0], [0, -10], [-10, 0])).toMatchObject({ from: 180, to: 0 });
  });

  it('draws the arc it stands for, and puts handles on it', () => {
    const o = { centre: [0, 0] as [number, number], r: 10, from: 0, to: 90 };
    const pts = roundPoints(o);
    expect(pts[0][0]).toBeCloseTo(10); expect(pts[pts.length - 1][1]).toBeCloseTo(10);
    expect(pts.every(([x, y]) => x >= -1e-9 && y >= -1e-9)).toBe(true);
    const wrap = roundPoints({ centre: [0, 0], r: 10, from: 270, to: 90 });   // the eastern half, across 0
    expect(wrap.every(([x]) => x >= -1e-9)).toBe(true);
    expect(roundHandles(o).map(([k]) => k)).toEqual(['centre', 'r', 'from', 'to']);
    const [, [hx, hy]] = roundHandles(roundFrom([0, 0], [3, 4]))[1];
    expect(hx).toBeCloseTo(0); expect(hy).toBeCloseTo(5);
  });
});
