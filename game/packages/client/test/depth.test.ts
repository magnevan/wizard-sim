import { describe, expect, it } from 'vitest';
import { depthOf, rowsHidden } from '../src/art/depth';

// a wall piece 40 px tall, its top at row 60, standing on row 100
const piece = (z: number, reach: number, spread: boolean) => rowsHidden(40, 60, 100, z, depthOf(90), reach, spread, 12);

describe('rowsHidden', () => {
  it('something standing in front hides the effect whole', () => {
    expect(piece(depthOf(100), 0, false)).toBe(40);
  });

  it('something behind leaves a held thing, like a sword, alone', () => {
    expect(piece(depthOf(80), 0, false)).toBe(0);
  });

  it('a spreading effect goes behind what its edge reaches, but keeps the rows at the foot', () => {
    expect(piece(depthOf(80), 95, true)).toBe(28); // 100 - 12 - 60
  });

  it('a spreading effect that stops short of a thing leaves it alone', () => {
    expect(piece(depthOf(80), 120, true)).toBe(0);
  });

  it('sorts like the sprites do: a lower row is in front', () => {
    expect(depthOf(101)).toBeGreaterThan(depthOf(100));
  });
});
