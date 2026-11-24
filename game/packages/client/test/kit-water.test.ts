import { describe, expect, it } from 'vitest';
import { flowOf, MAX_D, shoreField } from '../src/lab/kit-water';

const decode = (v: number) => (v / 255 - 0.5) * 2 * MAX_D;

describe('kit water', () => {
  it('measures the distance to the shore, but not to the map edge', () => {
    // a 10 x 10 sea in the corner of a 10 x 20 map: its left, top and right sides are the map's edge, its bottom is shore
    const sea = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
    const f = shoreField(sea, { x0: 0, y0: 0, x1: 10, y1: 12 }, 1, [10, 20]);
    const at = (x: number, y: number) => decode(f.data[y * f.W + x]);
    expect(at(5, 9)).toBeCloseTo(1, 1);        // a cell from the shore
    expect(at(5, 2)).toBeCloseTo(MAX_D, 1);    // far from the shore (the map edge doesn't count)
    expect(at(0, 5)).toBeGreaterThan(3);       // on the map edge: no foam there
    expect(at(5, 11)).toBeLessThan(0);         // beyond the shore: outside the water
  });

  it('flows a stream along its length, and lets the sea drift', () => {
    const stream = [[0, 0], [40, 0], [40, 2], [0, 2]];
    const [sx, sy] = flowOf(stream);
    expect(Math.abs(sx)).toBeGreaterThan(Math.abs(sy) * 10);
    expect(flowOf([[0, 0], [20, 0], [20, 18], [0, 18]])).toEqual([0.012, 0.007]);
  });
});
