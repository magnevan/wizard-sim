/**
 * The painted ground: a room's Ground layer (a material per half-unit cell, from LDtk) turned into
 * pixels. It isn't tiles. Each pixel asks where it is in the world, through a camera projection, and
 * which material is there, then takes its colour from that material's texture. So any camera works,
 * today's or the isometric one to come, and paths wander without a tile for every bend.
 *
 * This file is pure (arrays in, arrays out) so it runs in node for the tests; art/ground-room.ts loads
 * the images and makes the texture. It's client-only: the sim never knows what the ground looks like.
 */
import { FY, PPU } from '../camera';
import { clamp, lerp, rand, vnoise } from './util';

/** A tiling texture: width, height and RGBA bytes. `flip` mirrors it at random per block, for things with no grid in them. */
export interface Material { w: number; h: number; data: Uint8ClampedArray; flip: boolean }

/** From art pixels relative to the room's centre to world units from the room's centre. */
export interface GroundCamera { x(px: number, py: number): number; y(px: number, py: number): number }

/** Today's camera: straight on, the ground squashed by FY. */
export const todayCamera: GroundCamera = { x: (px) => px / PPU, y: (_px, py) => py / (PPU * FY) };

/** A true isometric camera, 2:1, with `a` art px of screen x per world unit along each ground axis. */
export const isoCamera = (a: number): GroundCamera => ({
  x: (px, py) => (px / a + (2 * py) / a) / 2,
  y: (px, py) => ((2 * py) / a - px / a) / 2,
});

export interface GroundMap {
  /** Room size, world units. */
  w: number; h: number;
  /** One character per cell (see GROUND_CHARS in the content build); '.' is unpainted. */
  rows: readonly string[];
  /** What lies past the map's edge. By default, whatever's at the nearest edge cell. */
  outside?: string;
}

const CELL = 0.5;
/** How far edges wander, and how far single pixels stray across them, in world units. */
const WANDER = 0.7, STRAY = 0.16;
/** The floor's dusk grade (art/floor.ts), so painted ground sits under the same light as the actors. */
const GRADE = [0.92, 0.95, 1.08];

/** The character at a world point; off the map, the nearest edge cell. */
export function groundAt(g: GroundMap, wx: number, wy: number): string {
  const gw = g.rows[0].length, gh = g.rows.length;
  if (g.outside && (Math.abs(wx) > g.w / 2 || Math.abs(wy) > g.h / 2)) return g.outside;
  const cx = clamp(Math.floor((wx + g.w / 2) / CELL), 0, gw - 1), cy = clamp(Math.floor((wy + g.h / 2) / CELL), 0, gh - 1);
  return g.rows[cy][cx];
}

/**
 * Paints into `out` (W x H RGBA). OX, OY: where the room's centre is in the image. `base` is the
 * material for unpainted cells. Colours come from screen position, so textures don't shear with the
 * camera; a material with a grid in it (flagstones) is the one thing that would need its own version.
 */
export function paintGround(out: Uint8ClampedArray, W: number, H: number, OX: number, OY: number, g: GroundMap, mats: Readonly<Record<string, Material>>, base: string, cam: GroundCamera, extent = g.w): void {
  // the dusk falloff follows what's on screen: for a turned room, the square that holds it (extent)
  const AW = (extent / 2) * PPU, AH = ((extent === g.w ? g.h : extent) / 2) * PPU * FY;
  for (let y = 0; y < H; y++) {
    const py = y - OY;
    for (let x = 0; x < W; x++) {
      const px = x - OX, i = (y * W + x) * 4;
      const wob = WANDER * 2, sx = (rand(x, y, 51) - 0.5) * 2 * STRAY, sy = (rand(x, y, 52) - 0.5) * 2 * STRAY;
      const wx = cam.x(px, py) + (vnoise(px * 0.05, py * 0.05, 53) - 0.5) * wob + sx;
      const wy = cam.y(px, py) + (vnoise(px * 0.05, py * 0.05, 54) - 0.5) * wob + sy;
      let ch = groundAt(g, wx, wy);
      if (ch === '.') ch = base;
      const m = mats[ch] ?? mats[base];
      const bx = Math.floor(x / m.w), by = Math.floor(y / m.h);
      let u = x - bx * m.w, v = y - by * m.h;
      if (m.flip) {
        // a random shift per block breaks up the grid a single tuft would otherwise draw across a field
        u = (u + Math.floor(rand(bx, by, 58) * m.w)) % m.w;
        v = (v + Math.floor(rand(bx, by, 59) * m.h)) % m.h;
        if (rand(bx, by, 55) < 0.5) u = m.w - 1 - u;
        if (rand(bx, by, 56) < 0.5) v = m.h - 1 - v;
      }
      const t = (v * m.w + u) * 4;
      // broad light and dark patches hide the texture's repeat, then the same dusk falloff as the old floor
      const patch = 0.9 + vnoise(px * 0.012, py * 0.012, 57) * 0.2;
      const e = clamp(Math.hypot(px / (AW + 90), py / (AH + 70)), 0, 1.6);
      const light = patch * lerp(1, 0.55, clamp((e - 0.55) / 0.9, 0, 1));
      out[i] = m.data[t] * GRADE[0] * light;
      out[i + 1] = m.data[t + 1] * GRADE[1] * light;
      out[i + 2] = Math.min(255, m.data[t + 2] * GRADE[2] * light);
      out[i + 3] = 255;
    }
  }
}
