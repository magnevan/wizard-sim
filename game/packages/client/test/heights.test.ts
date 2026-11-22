// Drawing at height (art/heights.ts): a plan-made level's block edges are cut on the diagonal, thin strips aren't.
import { describe, expect, it } from 'vitest';
import type { RoomDef } from '@wizard-sim/sim';
import { drawnZ, heightMap } from '../src/art/heights';

/** A room from rows of tiers given per 1 u block (each block is 2 x 2 cells), tier n at n metres. */
function room(blocks: string[]): RoomDef {
  const rows = blocks.flatMap((r) => { const wide = [...r].map((c) => c + c).join(''); return [wide, wide]; });
  const w = blocks[0].length, h = blocks.length;
  return { id: 't', w, h, terrain: rows.map((r) => '.'.repeat(r.length)), height: { metres: [0, 1, 2, 3], rows, cliffs: [] } } as unknown as RoomDef;
}
/** drawnZ at the middle of block (bx, by) nudged by (dx, dy) world units. */
const at = (def: RoomDef, bx: number, by: number, dx = 0, dy = 0) => drawnZ(heightMap(def)!, bx + 0.5 + dx - def.w / 2, by + 0.5 + dy - def.h / 2);

describe('drawing at height', () => {
  it('a 45 degree staircase of blocks draws as a straight diagonal', () => {
    // high (1) above the anti-diagonal staircase, low (0) below it
    const def = room(['1110', '1100', '1000', '0000']);
    expect(heightMap(def)!.b).toBe(2);
    // block (1,1) is high; its lower-right corner (both neighbours low) is cut to low, the rest of it stays high
    expect(at(def, 1, 1)).toBe(1);
    expect(at(def, 1, 1, 0.45, 0.45)).toBe(0);
    expect(at(def, 1, 1, -0.45, -0.45)).toBe(1);
    // and the low block (2,1) has its upper-left corner filled high: one straight edge across both
    expect(at(def, 2, 1, -0.45, -0.45)).toBe(1);
  });

  it('a one-block strip keeps its width along its length; only the outer corners of its ends are chamfered', () => {
    const def = room(['0000', '0220', '0000']);
    expect(at(def, 1, 1, 0.45, 0.45)).toBe(2); // a strip end's corner: one neighbour is the strip itself
    expect(at(def, 2, 1, 0, -0.45)).toBe(2); // full width along its length (the middle of each long edge)
    expect(at(def, 1, 1, 0, 0.45)).toBe(2);
    expect(at(def, 2, 1, 0.45, -0.45)).toBe(0); // only an end's outer corners are chamfered
  });

  it('a hand-painted room (heights not in 2 x 2 blocks) is cut at the cell', () => {
    const def = { id: 't', w: 2, h: 1, terrain: ['....', '....'], height: { metres: [0, 1], rows: ['0100', '0000'], cliffs: [] } } as unknown as RoomDef;
    expect(heightMap(def)!.b).toBe(1);
  });
});
