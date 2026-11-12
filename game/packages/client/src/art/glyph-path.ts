/**
 * Glyph paths: runes cut into the ground in a row, between a thin line on either side, laid out like the traces on a
 * circuit board: straight runs that turn only by 45 degrees (the user, 2026-11-12). The battery's well feeds its
 * defences and gate by them (art/feed-lines.ts); any later path can use the same tileset in its own colour.
 *
 *   The tileset   game/content/assets/tiles/glyph-path (tools/art-import/glyph_tiles.py): white runes, a pad for a
 *                 path's end and a node for a bend, tinted at draw time. One tinted copy per colour, made once.
 *   A path        waypoints in the sim's world (x, y units), each leg along an axis or a diagonal (snap() makes it so);
 *                 the view turns them into its own (iso-world.ts), so a leg along an axis runs up a slope of the screen
 *                 and a diagonal one runs straight across or down it.
 *   Drawing       glyph(s, k) says how each rune along it shows: s its distance along the path, k its index. The lines
 *                 either side, the pads and nodes take the path's tint.
 */
import { gx, gy } from './field';
import { toU, toV } from '../iso-world';
import * as X from './px';
import type { Ctx } from './px';
import { rand } from './util';

interface Tiles { cell: [number, number]; pitch: number; glyphs: number; pad: number; node: number }
const metas = import.meta.glob<Tiles>('../../../../content/assets/tiles/glyph-path/tiles.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/tiles/glyph-path/tiles.png', { eager: true, query: '?url', import: 'default' });
const TILES = Object.values(metas)[0];
const URL_ = Object.values(urls)[0];

export type P = readonly [number, number];
export interface GlyphPath {
  /** Waypoints in the sim's world: every leg straight along an axis or a diagonal. */
  pts: P[];
  /** What marks each end: a pad (a path ends at something), a node (it joins another path), or nothing. */
  start: 'pad' | 'node' | 'none'; end: 'pad' | 'node' | 'none';
  /** Which runes it uses, so neighbouring paths don't read the same. */
  seed: number;
}
/** How one rune shows: its colour, and how strongly it glows (0: not at all). Null: it's out (not drawn lit). */
export type RuneLook = { col: string; glow: number } | null;

/** Half the path's width, between its two lines, and how far apart its runes are, world units. */
export const PATH = { half: 0.42, gap: 0.9, clearCorner: 0.45 } as const;

let atlas: HTMLImageElement | null = null, loading = false;
const tinted = new Map<string, HTMLCanvasElement>();
function load(): void {
  if (loading || !URL_) return;
  loading = true;
  const im = new Image();
  im.onload = () => { atlas = im; };
  im.src = URL_;
}
/** The tileset in one colour: white becomes `col`, grey a darker shade of it. */
function tint(col: string): HTMLCanvasElement | null {
  if (!atlas) { load(); return null; }
  let c = tinted.get(col);
  if (!c) {
    const cv = X.canvas(atlas.width, atlas.height), x = cv.x;
    x.drawImage(atlas, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, atlas.width, atlas.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(atlas, 0, 0);
    c = cv.c; tinted.set(col, c);
  }
  return c;
}

/** Moves each waypoint so every leg runs along an axis or at 45 degrees: a leg that's neither keeps its longer part straight. */
export function snap(pts: readonly P[]): P[] {
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 1e-6 || ady < 1e-6 || Math.abs(adx - ady) < 1e-6) { out.push(pts[i]); continue; }
    // straight first, then the diagonal: the bend sits where the straight part runs out
    const d = Math.min(adx, ady), sx = Math.sign(dx), sy = Math.sign(dy);
    out.push(adx > ady ? [bx - sx * d, ay] : [ax, by - sy * d]);
    out.push(pts[i]);
  }
  return out;
}

/** A point of the sim's world on the field canvas (through the view's turn). */
const F = (x: number, y: number): [number, number] => [gx(toU(x, y)), gy(toV(x, y))];

/** The path's line offset `off` to one side (left of travel), its corners mitred. */
function offset(pts: readonly P[], off: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    const n1 = norm(i > 0 ? [b[0] - a[0], b[1] - a[1]] : [c[0] - b[0], c[1] - b[1]]);
    const n2 = norm(i < pts.length - 1 ? [c[0] - b[0], c[1] - b[1]] : [b[0] - a[0], b[1] - a[1]]);
    const l1: P = [-n1[1], n1[0]], l2: P = [-n2[1], n2[0]];
    const m = norm([l1[0] + l2[0], l1[1] + l2[1]]), cos = m[0] * l1[0] + m[1] * l1[1];
    const k = off / Math.max(0.3, cos);
    out.push([b[0] + m[0] * k, b[1] + m[1] * k]);
  }
  return out;
}
const norm = ([x, y]: readonly number[]): P => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** The path's length, world units. */
export function pathLength(p: GlyphPath): number {
  let L = 0;
  for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
  return L;
}

function stamp(g: Ctx, sheet: HTMLCanvasElement, tile: number, x: number, y: number): void {
  const [w, h] = TILES.cell;
  g.drawImage(sheet, tile * TILES.pitch, 0, w, h, Math.round(x - (w - 1) / 2), Math.round(y - (h - 1) / 2), w, h);
}

/**
 * Draws one path on `g`. `line`: the colour of the lines either side and of the pads and nodes; `rune(s, k)` how each
 * rune shows (null: dark, in `dark`); `from` is how far along a longer run this path starts (for the runes' look).
 * `light`, if given, gets a small light at every third rune glowing near full.
 */
export function drawGlyphPath(g: Ctx, p: GlyphPath, line: string, dark: string, rune: (s: number, k: number) => RuneLook, from = 0, light?: (x: number, y: number, r: number, col: string, a: number) => void): void {
  if (!TILES) return;
  const darkSheet = tint(dark), lineSheet = tint(line);
  if (!darkSheet || !lineSheet) return;
  // the two lines
  for (const side of [PATH.half, -PATH.half]) {
    const o = offset(p.pts, side).map(([x, y]) => F(x, y));
    X.lines(g, o, line, 1);
  }
  // the runes along each leg, clear of the bends
  let s0 = 0, k = 0;
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i], L = Math.hypot(bx - ax, by - ay);
    const startClear = i === 1 && p.start === 'none' ? 0.3 : PATH.clearCorner, endClear = i === p.pts.length - 1 && p.end === 'none' ? 0.3 : PATH.clearCorner;
    const room = L - startClear - endClear, n = Math.max(0, Math.floor(room / PATH.gap) + 1), pad = (room - (n - 1) * PATH.gap) / 2;
    for (let j = 0; j < n; j++) {
      const d = startClear + pad + j * PATH.gap, s = from + s0 + d, [x, y] = F(ax + ((bx - ax) * d) / L, ay + ((by - ay) * d) / L);
      const look = rune(s, k), tile = Math.floor(rand(k, p.seed, 7) * TILES.glyphs);
      k++;
      if (!look) { stamp(g, darkSheet, tile, x, y); continue; }
      if (look.glow > 0.02) X.glow(g, x, y, 4, look.col, 0.28 * look.glow, 0.5);
      if (light && look.glow > 0.8 && k % 3 === 0) light(x, y, 16, look.col, 0.16 * look.glow);
      const sheet = tint(look.col);
      if (sheet) stamp(g, sheet, tile, x, y);
    }
    // a bend: a node
    if (i < p.pts.length - 1) { const [x, y] = F(bx, by); stamp(g, lineSheet, TILES.node, x, y); }
    s0 += L;
  }
  // the ends
  const ends: [P, 'pad' | 'node' | 'none'][] = [[p.pts[0], p.start], [p.pts[p.pts.length - 1], p.end]];
  for (const [[x, y], mark] of ends) if (mark !== 'none') { const [fx, fy] = F(x, y); stamp(g, lineSheet, mark === 'pad' ? TILES.pad : TILES.node, fx, fy); }
}
