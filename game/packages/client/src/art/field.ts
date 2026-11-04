/**
 * Where the per-frame effect canvases sit in the world. They cover the arena plus a margin,
 * with room above for things that rise (sky strikes, steam, hats), not the whole view, so
 * redrawing and re-uploading them each frame stays cheap at any window size.
 *
 * Coordinates inside a canvas are art pixels: gx(x) = x * PPU + OX, gy(y) = y * PPU * FY + OY,
 * with OX and OY whole numbers, so they round exactly like the view's ax / ay.
 */
import { ARENA } from '@wizard-sim/sim';
import { FY, PPU } from '../camera';

/** Margins in world units round the arena, and the sky above it in art px. */
const MX = 2, MY = 1, SKY = 72, BELOW = 10;
export const FIELD = {
  OX: (ARENA.w / 2 + MX) * PPU,
  OY: Math.ceil((ARENA.h / 2 + MY) * PPU * FY) + SKY,
  W: (ARENA.w + 2 * MX) * PPU,
  H: Math.ceil((ARENA.h / 2 + MY) * PPU * FY) * 2 + SKY + BELOW,
};
export const gx = (x: number): number => x * PPU + FIELD.OX;
export const gy = (y: number): number => y * PPU * FY + FIELD.OY;
