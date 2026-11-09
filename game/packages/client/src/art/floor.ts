/**
 * Where a room's ground image sits. The ground itself is painted by art/ground.ts; a plain colour
 * stands in for the moment its textures take to arrive.
 */
import { Texture } from 'pixi.js';
import { FY, PPU } from '../camera';
import * as X from './px';

export interface FloorLayout { OX: number; OY: number; W: number; H: number }

/** Margin round the area, world units: enough that the view never runs past the ground. */
const marginFor = (aw: number): number => (aw > 30 ? 14 : 19);

/** The ground image's size and where the room's centre is in it, for an area of aw x ah world units. */
export function floorLayout(aw: number, ah: number): FloorLayout {
  const M = marginFor(aw), half = Math.ceil((ah / 2 + M) * PPU * FY);
  return { OX: (aw / 2 + M) * PPU, OY: half, W: (aw + 2 * M) * PPU, H: half * 2 };
}

/** One flat colour, scaled to the layout by the sprite that shows it. */
export function floorPlaceholder(l: FloorLayout): Texture {
  const { c, x } = X.canvas(l.W, l.H);
  x.fillStyle = '#2c4b36';
  x.fillRect(0, 0, l.W, l.H);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}
