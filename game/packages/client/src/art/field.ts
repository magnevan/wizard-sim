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
/** Sized for the world's play area (fitField): the canvases are remade when it changes (a survive world is bigger). */
export const FIELD = { OX: 0, OY: 0, W: 0, H: 0, aw: 0, ah: 0 };
/** Sizes FIELD for an arena of aw x ah world units. True if it changed. */
export function fitField(aw: number, ah: number): boolean {
  if (FIELD.aw === aw && FIELD.ah === ah) return false;
  FIELD.aw = aw; FIELD.ah = ah;
  FIELD.OX = (aw / 2 + MX) * PPU;
  FIELD.OY = Math.ceil((ah / 2 + MY) * PPU * FY) + SKY;
  FIELD.W = (aw + 2 * MX) * PPU;
  FIELD.H = Math.ceil((ah / 2 + MY) * PPU * FY) * 2 + SKY + BELOW;
  return true;
}
fitField(ARENA.w, ARENA.h);
export const gx = (x: number): number => x * PPU + FIELD.OX;
export const gy = (y: number): number => y * PPU * FY + FIELD.OY;
