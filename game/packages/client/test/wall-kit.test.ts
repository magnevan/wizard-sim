import { describe, expect, it } from 'vitest';
import { kitRun } from '../src/art/wall-kit';

describe('kit walls', () => {
  it('only takes walls that run along a tile edge', () => {
    expect(kitRun(0, 0, 100, 50, 0, -5)).not.toBeNull();
    expect(kitRun(0, 0, 100, 0, 0, -5)).toBeNull(); // straight across the screen
    expect(kitRun(0, 0, 0, 50, 0, -5)).toBeNull();
  });

  it('tells far walls from near ones', () => {
    expect(kitRun(0, 0, 96, 48, 0, -5)![0].side).toBe('n');
    expect(kitRun(0, 0, 96, 48, 0, 5)![0].side).toBe('s');
    expect(kitRun(96, 0, 0, 48, -5, 0)![0].side).toBe('w');
    expect(kitRun(96, 0, 0, 48, 5, 0)![0].side).toBe('e');
  });

  it('is the same wall whichever end it was drawn from', () => {
    expect(kitRun(0, 0, 96, 48, 0, -5)).toEqual(kitRun(96, 48, 0, 0, 0, -5));
  });

  it('lays whole pieces, and only part of the last', () => {
    const run = kitRun(0, 0, 60, 30, 0, -5)!;
    expect(run.length).toBe(3);
    expect(run[0].part).toBe(24);
    expect(run[1].part).toBe(24);
    expect(run[2].part).toBe(12);
  });

  it('steps exactly one tile at a time, on the 2:1 line', () => {
    const run = kitRun(0, 0, 96, 48, 0, -5)!;
    expect(run[1].x - run[0].x).toBe(24);
    expect(run[1].y - run[0].y).toBe(12);
  });
});
