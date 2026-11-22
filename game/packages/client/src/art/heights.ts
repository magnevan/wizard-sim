/**
 * Height in the drawing (phase 4 of docs/threads/height.md, the minimal part): a tiered room's ground is drawn at each
 * cell's height, the drops between tiers as flat-coloured faces, and bodies, props and people stand at the height under
 * their feet. Sorting is unchanged (by the feet's ground row), and lighting, shadows and spell effects still lie on the
 * flat ground: those come with the rest of phase 4.
 *
 * A room's tiers come from RoomDef.height (content/README.md, Height). A flat room has none, and nothing here changes it.
 */
import { CELL, type RoomDef } from '@wizard-sim/sim';
import { toX, toY } from '../iso-world';

/** Art px per metre of height (a 1.8 m person is a 26 px wizard). */
export const PX_PER_M = 14.5;

/** The characters of tiers 0 to 61 in the rows (packages/content/src/compile.mjs TIER_CHARS). */
const TIER_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const STAIR = '/';

export interface HeightMap {
  /** Cells across and down, and the room's size in world units. */
  gw: number; gh: number; w: number; h: number;
  /** Metres per cell, row by row. */
  m: Float32Array;
  /** Is the cell outside the room's outline (void)? */
  out: Uint8Array;
  lo: number; hi: number;
  /** The block size the heights come in, in cells: 2 for a level written from a plan (1 u blocks), else 1. */
  b: number;
}

const maps = new WeakMap<object, HeightMap>();

/**
 * The room's heights per cell, or null for a flat room. A stair cell ('/') takes the height its neighbours settle it at
 * (relaxed until still), so a painted flight ramps from the tier below to the tier above.
 */
export function heightMap(def: RoomDef): HeightMap | null {
  const hd = def.height;
  if (!hd) return null;
  let hm = maps.get(hd);
  if (hm) return hm;
  const gh = hd.rows.length, gw = hd.rows[0].length, m = new Float32Array(gw * gh), out = new Uint8Array(gw * gh);
  const stairs: number[] = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const ch = hd.rows[y][x], k = y * gw + x;
    if (def.terrain[y]?.[x] === '_') out[k] = 1;
    if (ch === STAIR) { stairs.push(k); continue; }
    m[k] = hd.metres[TIER_CHARS.indexOf(ch)] ?? 0;
  }
  // stairs: start each at the mean of the tiers about, then relax
  for (let it = 0; it < 400 && stairs.length; it++) {
    let moved = 0;
    for (const k of stairs) {
      const x = k % gw, y = (k - x) / gw;
      let s = 0, n = 0;
      if (x > 0) { s += m[k - 1]; n++; } if (x < gw - 1) { s += m[k + 1]; n++; }
      if (y > 0) { s += m[k - gw]; n++; } if (y < gh - 1) { s += m[k + gw]; n++; }
      const v = n ? s / n : 0;
      moved = Math.max(moved, Math.abs(v - m[k])); m[k] = v;
    }
    if (moved < 0.001) break;
  }
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < m.length; k++) if (!out[k]) { lo = Math.min(lo, m[k]); hi = Math.max(hi, m[k]); }
  // a plan-made level comes in 1 u blocks (2 x 2 cells): its edges are cut at that size, so its 45 degree runs come out straight
  let b = gw % 2 === 0 && gh % 2 === 0 ? 2 : 1;
  for (let y = 0; y < gh && b === 2; y += 2) for (let x = 0; x < gw && b === 2; x += 2) {
    const k = y * gw + x;
    for (const o of [1, gw, gw + 1]) if (m[k + o] !== m[k] || out[k + o] !== out[k]) { b = 1; break; }
  }
  hm = { gw, gh, w: def.w, h: def.h, m, out, lo: Math.min(0, lo), hi: Math.max(0, hi), b };
  maps.set(hd, hm);
  return hm;
}

/** Metres at a real world point (0 in a flat room or off the map). */
export function zAt(def: RoomDef, x: number, y: number): number {
  const hm = heightMap(def);
  if (!hm) return 0;
  const cx = Math.floor((x + hm.w / 2) / CELL), cy = Math.floor((y + hm.h / 2) / CELL);
  if (cx < 0 || cy < 0 || cx >= hm.gw || cy >= hm.gh) return 0;
  return hm.m[cy * hm.gw + cx];
}

/** How many art px something standing at real world point (x, y) is drawn above the flat ground. */
export const liftAtWorld = (def: RoomDef, x: number, y: number): number => (def.height ? Math.round(zAt(def, x, y) * PX_PER_M) : 0);
/** How many art px something standing at view point (u, v) is drawn above the flat ground. */
export const liftAt = (def: RoomDef, u: number, v: number): number => (def.height ? Math.round(zAt(def, toX(u, v), toY(u, v)) * PX_PER_M) : 0);

/**
 * Metres the ground is drawn at, at a real world point: NaN in the void, 0 off the map. Unlike zAt (the cell a body
 * stands in), a block's corner takes its two neighbours' height where they agree and the block's differs, cut on the
 * diagonal: a staircase of blocks draws as a straight 45 degree edge and a curve as a chamfered one, while a straight
 * strip (a parapet, a lip) keeps its width, since one of its neighbours is itself.
 */
export function drawnZ(hm: HeightMap, x: number, y: number): number {
  const s = CELL * hm.b, ux = (x + hm.w / 2) / s, uy = (y + hm.h / 2) / s, bx = Math.floor(ux), by = Math.floor(uy);
  const bw = hm.gw / hm.b, bh = hm.gh / hm.b;
  if (bx < 0 || by < 0 || bx >= bw || by >= bh) return 0;
  const v = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= bw || j >= bh) return 0;
    const k = j * hm.b * hm.gw + i * hm.b;
    return hm.out[k] ? NaN : hm.m[k];
  };
  const c = v(bx, by), fx = ux - bx, fy = uy - by;
  if (Math.abs(fx - 0.5) + Math.abs(fy - 0.5) <= 0.5) return c;
  const a = v(bx + (fx < 0.5 ? -1 : 1), by), d = v(bx, by + (fy < 0.5 ? -1 : 1));
  return Object.is(a, d) && !Object.is(a, c) ? a : c;
}

const STONE = new Float32Array(3);
/** A small hash for a block's own tone. */
const hash2 = (a: number, b: number): number => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/**
 * One pixel of a retaining wall's face: cream ashlar in courses with staggered joints, each block its own tone, under a
 * pale coping, the stone warmed a little by the ground on top (the beauty critic, 2026-11-22: the faces streaked the
 * edge's own colour down, and read as a quarry, not an academy). k is px below the edge, fy the screen row (the courses
 * line up across neighbouring columns).
 */
function faceStone(px: number, k: number, fy: number, tr: number, tg: number, tb: number, out: Float32Array): void {
  if (k < 3) { const c = k === 2 ? 0.62 : 1; out[0] = 228 * c; out[1] = 218 * c; out[2] = 196 * c; return; }   // the coping and its shadow line
  const COURSE = 7, BLOCK = 17, row = Math.floor(fy / COURSE), off = row & 1 ? 8 : 0, bx = Math.floor((px + off) / BLOCK);
  if (fy % COURSE === 0 || (px + off) % BLOCK === 0) { out[0] = 118; out[1] = 106; out[2] = 94; return; }       // mortar
  const t = 0.9 + 0.16 * hash2(bx, row), w = 0.12;
  out[0] = (196 * (1 - w) + tr * w) * t; out[1] = (182 * (1 - w) + tg * w) * t; out[2] = (158 * (1 - w) + tb * w) * t;
}

const set = (out: Float32Array, r: number, g: number, b: number): void => { out[0] = r; out[1] = g; out[2] = b; };
/**
 * One pixel of a building's front (a face whose top is roof): a dark slate eave, pilasters, rows of arched windows (a
 * few lit), and a darker plinth, over the same ashlar (the beauty critic, 2026-11-22: the fronts were huge identical
 * slabs and the roofs read as holes without an eave). k is px below the eave, n the face's height in px.
 */
function faceBuilding(px: number, k: number, n: number, fy: number, out: Float32Array): void {
  if (k < 3) return set(out, 74, 82, 102);                          // the eave
  if (k < 5) return set(out, 46, 50, 62);                           // its shadow
  if (k >= n - 6) return k === n - 6 ? set(out, 214, 202, 178) : set(out, 150, 138, 120);   // the plinth and its sill
  const bay = 38, bx = Math.floor(px / bay), u = ((px % bay) + bay) % bay;
  if (u < 5) return set(out, 216, 205, 182);                        // a pilaster
  const win = 18, gap = 9, row = Math.floor((k - 9) / (win + gap)), v = (k - 9) - row * (win + gap);
  if (k >= 9 && v >= 0 && v < win && k + (win - v) < n - 9 && u >= 15 && u < 29) {
    const inset = v === 0 ? 4 : v === 1 ? 2 : v === 2 ? 1 : 0;      // the arch
    if (u >= 15 + inset && u < 29 - inset) {
      if (u === 21 || u === 22) return set(out, 120, 112, 100);     // the mullion
      return hash2(bx, row + 7) < 0.3 ? set(out, 236, 186, 104) : set(out, 40, 46, 64);   // a lit pane, or dark glass
    }
    return set(out, 228, 218, 196);                                 // the window's stone surround
  }
  faceStone(px, k, fy, 196, 182, 158, out);
}

/** Art px of headroom a room's ground image needs above and below for its tiers. */
export function liftRange(def: RoomDef): { up: number; down: number } {
  const hm = heightMap(def);
  return hm ? { up: Math.ceil(hm.hi * PX_PER_M), down: Math.ceil(-hm.lo * PX_PER_M) } : { up: 0, down: 0 };
}

/** The ground camera: art px offsets from the room's centre to real world x, y (art/ground.ts isoCamera). */
export interface PxToWorld { x(px: number, py: number): number; y(px: number, py: number): number }

/**
 * Lifts a finished ground image by height. Each column is walked from the back (top) to the front, every pixel moved up
 * by its cell's height; where the ground drops toward the camera, the gap below the edge is filled with that edge's
 * face: cut stone (faceStone), under a pale coping, darkening toward its foot. Nearer pixels overwrite farther ones, so
 * a raised terrace hides what's behind it. Void (outside the outline) is left dark.
 */
export function liftGround(data: Uint8ClampedArray, W: number, H: number, OX: number, OY: number, cam: PxToWorld, def: RoomDef, isRoof?: (x: number, y: number) => boolean): void {
  const hm = heightMap(def);
  if (!hm) return;
  const src = data.slice(), col = new Int32Array(H), gone = new Uint8Array(H);
  data.fill(0);
  for (let i = 3; i < data.length; i += 4) { data[i - 3] = 14; data[i - 2] = 16; data[i - 1] = 22; data[i] = 255; }
  for (let px = 0; px < W; px++) {
    for (let py = 0; py < H; py++) {
      const z = drawnZ(hm, cam.x(px - OX, py - OY), cam.y(px - OX, py - OY));
      gone[py] = Number.isNaN(z) ? 1 : 0; col[py] = gone[py] ? 0 : Math.round(z * PX_PER_M);
    }
    for (let py = 0; py < H; py++) {
      if (gone[py]) continue;
      const dest = py - col[py];
      if (dest >= 0 && dest < H) { const s = (py * W + px) * 4, d = (dest * W + px) * 4; data[d] = src[s]; data[d + 1] = src[s + 1]; data[d + 2] = src[s + 2]; data[d + 3] = 255; }
      // a drop toward the camera: the face runs from just below this pixel down to where the next row lands
      const next = py + 1 < H ? py + 1 - col[py + 1] : dest + 1;
      if (next > dest + 1) {
        const s = (py * W + px) * 4, n = next - dest - 1;
        const front = isRoof?.(cam.x(px - OX, py - OY), cam.y(px - OX, py - OY)) ?? false;
        for (let fy = Math.max(0, dest + 1); fy < Math.min(H, next); fy++) {
          const d = (fy * W + px) * 4, k = fy - dest - 1, fade = 1 - 0.3 * ((fy - dest) / (next - dest));
          if (front) faceBuilding(px, k, n, fy, STONE); else faceStone(px, k, fy, src[s], src[s + 1], src[s + 2], STONE);
          data[d] = STONE[0] * fade; data[d + 1] = STONE[1] * fade; data[d + 2] = STONE[2] * fade; data[d + 3] = 255;
        }
      }
    }
  }
}
