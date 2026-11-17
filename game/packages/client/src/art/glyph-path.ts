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
import { clamp, lerp, rand, smooth } from './util';

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

/**
 * A shimmer behind the paths, seen only through them (the user's idea, 2026-11-12): two streaky textures drift across
 * the ground in different directions, pinned to the ground so the camera doesn't drag them; where their bright streaks
 * pass under a lit rune, that part of it flares. Paths are stamped into `mask` (drawGlyphPath's `mask`) between begin()
 * and end(); end() fills the textures through it and adds the result onto the ground canvas.
 */
export class Shimmer {
  private m = X.canvas(4, 4);
  private s = X.canvas(4, 4);
  private pats: CanvasPattern[] = [];
  /** The parts of the canvases this frame works in (begin's `boxes`). */
  private boxes: Box[] = [];
  /** `col`: the shimmer's colour (a hot tone of the paths' own). */
  constructor(private col: string) {}

  /**
   * Clears the mask to the ground canvas's size and turn; returns it to stamp into. `boxes` (canvas px, not
   * overlapping): where the paths can be; every pass over the whole canvas keeps to them (each is a full-canvas
   * composite otherwise, every frame, and the paths are thin).
   */
  begin(g: Ctx, boxes?: readonly Box[]): Ctx {
    for (const cv of [this.m, this.s]) if (cv.c.width !== g.canvas.width || cv.c.height !== g.canvas.height) { cv.c.width = g.canvas.width; cv.c.height = g.canvas.height; cv.x.imageSmoothingEnabled = false; }
    this.boxes = boxesIn(boxes, g.canvas);
    const x = this.m.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.m.c.width, this.m.c.height); x._fs = null; // whole: see layerLike
    x.setTransform(g.getTransform());
    return x;
  }

  /** Fills the drifting shimmer through the mask and adds it onto `g`, at `k` (0..1) strength. `t`: seconds. `erase` wears the mask first. */
  end(g: Ctx, t: number, k: number, erase?: (mask: Ctx) => void): void {
    if (k <= 0.01) return;
    erase?.(this.m.x);
    if (!this.pats.length) this.pats = [streaks(96, 48, [[2, 1, 0], [-1, 2, 1.7], [3, -1, 3.1]], this.col, this.m.x), streaks(64, 40, [[1, -2, 0.4], [3, 1, 2.2]], this.col, this.m.x)];
    const s = this.s.x, at = g.getTransform();
    if (!this.boxes.length) return;
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1; s.clearRect(0, 0, this.s.c.width, this.s.c.height);
    // the two layers, drifting, in the ground's own coordinates
    const drift: [number, number][] = [[t * 9, -t * 4], [-t * 6, -t * 7]];
    this.pats.forEach((p, i) => {
      p.setTransform(new DOMMatrix().translate(at.e + drift[i][0], at.f + drift[i][1]));
      s.globalCompositeOperation = i ? 'lighter' : 'source-over';
      s.fillStyle = p;
      for (const b of this.boxes) s.fillRect(b.x, b.y, b.w, b.h);
    });
    // destination-in clears whatever it isn't drawn over, so it's one draw over them all
    s.globalCompositeOperation = 'destination-in';
    unbounded(this.boxes, (b) => s.drawImage(this.m.c, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h));
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = k;
    for (const b of this.boxes) g.drawImage(this.s.c, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    g.restore(); g._fs = null;
  }
}

/**
 * How a path sits in the ground (the user, 2026-11-12: too clean and uniform, "not part of the world"). `rune` and
 * `line`: their opacity; `wear`: pixels chipped out of them; `patch`: larger stretches faded, as if worn by feet and
 * weather; `carve`: a dark groove a pixel under every stroke, as if cut into the earth.
 */
export interface PathStyle { rune: number; line: number; wear: number; patch: number; carve: boolean }
export const PATH_STYLES: Readonly<Record<string, PathStyle>> = {
  a: { rune: 1, line: 1, wear: 0, patch: 0, carve: false },          // clean, as first built
  b: { rune: 0.65, line: 0.45, wear: 0, patch: 0, carve: false },    // see-through
  c: { rune: 1, line: 1, wear: 0.35, patch: 0.6, carve: false },     // worn
  d: { rune: 0.72, line: 0.5, wear: 0.35, patch: 0.6, carve: false },// see-through and worn
  e: { rune: 0.78, line: 0.55, wear: 0.35, patch: 0.6, carve: true },// see-through, worn and carved
};

/** The wear, as a texture to erase with: specks and blotches, tileable, so it can be pinned to the ground. */
function wearTexture(style: PathStyle, ctx: Ctx): CanvasPattern {
  const S = 128, CELL = 16, cv = X.canvas(S, S), img = cv.x.createImageData(S, S), n = S / CELL;
  const corner = (i: number, j: number) => rand(((i % n) + n) % n, ((j % n) + n) % n, 211);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / CELL, fy = y / CELL, i = Math.floor(fx), j = Math.floor(fy), u = smooth(fx - i), v = smooth(fy - j);
    const blot = lerp(lerp(corner(i, j), corner(i + 1, j), u), lerp(corner(i, j + 1), corner(i + 1, j + 1), u), v);
    const r = rand(x, y, 97);
    const speck = r > 0.62 ? style.wear : r > 0.45 ? style.wear * 0.4 : 0;
    const patch = style.patch * clamp((blot - 0.42) / 0.33, 0, 1);
    const o = (y * S + x) * 4;
    img.data[o + 3] = Math.round(255 * clamp(1 - (1 - speck) * (1 - patch), 0, 1));
  }
  cv.x.putImageData(img, 0, 0);
  return ctx.createPattern(cv.c, 'repeat')!;
}

/** A rectangle in a canvas's own pixels. */
export interface Box { x: number; y: number; w: number; h: number }
/** `boxes` in whole pixels, cut to the canvas, empty ones dropped; the whole canvas without any. */
function boxesIn(boxes: readonly Box[] | undefined, c: { width: number; height: number }): Box[] {
  if (!boxes) return [{ x: 0, y: 0, w: c.width, h: c.height }];
  const out: Box[] = [];
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y)), x1 = Math.min(c.width, Math.ceil(box.x + box.w)), y1 = Math.min(c.height, Math.ceil(box.y + box.h));
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

/**
 * Runs `op` once over the boxes' bounding box: for the composite modes that clear what they don't draw over
 * (source-in, destination-in), which one op per box would do to the boxes before it. No clip is needed (and a clip
 * rounds the blend a shade differently): between the boxes these canvases hold nothing, so there's nothing to keep.
 */
function unbounded(boxes: readonly Box[], op: (b: Box) => void): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  op({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

/**
 * A canvas the size and turn of the ground canvas `g`, cleared. Cleared whole, though only boxes of it are used: these
 * layers are copied from every frame, and a write that leaves any of the old picture standing copies all of it first.
 */
function layerLike(cv: { c: HTMLCanvasElement; x: Ctx }, g: Ctx): Ctx {
  if (cv.c.width !== g.canvas.width || cv.c.height !== g.canvas.height) { cv.c.width = g.canvas.width; cv.c.height = g.canvas.height; cv.x.imageSmoothingEnabled = false; }
  const x = cv.x;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, cv.c.width, cv.c.height); x._fs = null;
  x.setTransform(g.getTransform());
  return x;
}

/**
 * Paths drawn on a layer of their own, then laid into the ground in a style: worn (erased with a wear texture pinned to
 * the ground), carved (a dark copy a pixel lower first), at their opacity. begin() returns the layer to draw paths on.
 */
export class PathLayer {
  private l = X.canvas(4, 4);
  private dark = X.canvas(4, 4);
  private wear = new Map<PathStyle, CanvasPattern>();
  /** The parts of the canvases this frame works in (begin's `boxes`). */
  private boxes: Box[] = [];

  /** `boxes` (canvas px, not overlapping): where the paths can be, as for Shimmer.begin. */
  begin(g: Ctx, boxes?: readonly Box[]): Ctx { this.boxes = boxesIn(boxes, g.canvas); return layerLike(this.l, g); }

  /** Erases the style's wear out of `x` (a canvas laid out like the ground canvas `g`). */
  wearOut(x: Ctx, g: Ctx, style: PathStyle): void {
    if (style.wear <= 0 && style.patch <= 0) return;
    let p = this.wear.get(style);
    if (!p) { p = wearTexture(style, x); this.wear.set(style, p); }
    const at = g.getTransform();
    p.setTransform(new DOMMatrix().translate(at.e, at.f));
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.fillStyle = p;
    for (const b of this.boxes) x.fillRect(b.x, b.y, b.w, b.h);
    x.restore(); x._fs = null;
  }

  end(g: Ctx, style: PathStyle): void {
    const l = this.l, B = this.boxes;
    if (!B.length) return;
    this.wearOut(l.x, g, style);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    if (style.carve) {
      const d = layerLike(this.dark, g);
      d.setTransform(1, 0, 0, 1, 0, 0);
      for (const b of B) d.drawImage(l.c, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
      d.globalCompositeOperation = 'source-in'; d.fillStyle = '#1a0e08';
      unbounded(B, (b) => d.fillRect(b.x, b.y, b.w, b.h));
      d._fs = null;
      g.globalAlpha = 0.7 * style.rune;
      for (const b of B) g.drawImage(this.dark.c, b.x, b.y, b.w, b.h, b.x, b.y + 1, b.w, b.h);
    }
    g.globalAlpha = style.rune;
    for (const b of B) g.drawImage(l.c, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    g.restore(); g._fs = null;
  }
}

/** A tileable texture of soft bright streaks: sums of whole-number sine waves across a w x h tile, only their crests kept. */
function streaks(w: number, h: number, waves: readonly (readonly [number, number, number])[], col: string, ctx: Ctx): CanvasPattern {
  const cv = X.canvas(w, h), img = cv.x.createImageData(w, h);
  const m = /^#(..)(..)(..)$/.exec(col), [r, gg, b] = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [255, 230, 160];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (const [fx, fy, ph] of waves) v += Math.sin(2 * Math.PI * ((fx * x) / w + (fy * y) / h) + ph);
    const n = (v / waves.length + 1) / 2, a = Math.max(0, (n - 0.62) / 0.38) ** 1.6; // only the crests
    const o = (y * w + x) * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = Math.round(255 * Math.min(1, a));
  }
  cv.x.putImageData(img, 0, 0);
  return ctx.createPattern(cv.c, 'repeat')!;
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

/**
 * A glyph circle on the ground (sim world centre and radius): two thin rings with runes between them, turned `spin`
 * radians, a pad at its middle. The same tileset and the same mask as a path; `rune(k)` says how its k-th rune shows.
 */
export function drawGlyphCircle(g: Ctx, cx: number, cy: number, r: number, seed: number, line: string, dark: string, rune: (k: number) => RuneLook,
  opts: { spin?: number; mask?: { g: Ctx; line: number }; lineAlpha?: number } = {}): void {
  if (!TILES) return;
  const darkSheet = tint(dark), lineSheet = tint(line), white = opts.mask ? tint('#ffffff') : null;
  if (!darkSheet || !lineSheet) return;
  const { spin = 0, mask, lineAlpha = 1 } = opts, gap = PATH.half * 2;
  for (const rr of [r, r - gap]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push(F(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); }
    g.globalAlpha = lineAlpha; X.lines(g, pts, line, 1); g.globalAlpha = 1;
    if (mask && mask.line > 0) { mask.g.globalAlpha = mask.line; X.lines(mask.g, pts, '#ffffff', 1); mask.g.globalAlpha = 1; }
  }
  const rr = r - gap / 2, n = Math.max(6, Math.floor((Math.PI * 2 * rr) / (PATH.gap * 0.85)));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + spin, [x, y] = F(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    const look = rune(k), tile = Math.floor(rand(k, seed, 7) * TILES.glyphs);
    if (!look) { stamp(g, darkSheet, tile, x, y); continue; }
    if (look.glow > 0.02) X.glow(g, x, y, 4, look.col, 0.28 * look.glow, 0.5);
    const sheet = tint(look.col);
    if (sheet) stamp(g, sheet, tile, x, y);
    if (mask && white) { mask.g.globalAlpha = Math.min(1, look.glow); stamp(mask.g, white, tile, x, y); mask.g.globalAlpha = 1; }
  }
  const [mx, my] = F(cx, cy);
  stamp(g, lineSheet, TILES.pad, mx, my);
}

function stamp(g: Ctx, sheet: HTMLCanvasElement, tile: number, x: number, y: number): void {
  const [w, h] = TILES.cell;
  g.drawImage(sheet, tile * TILES.pitch, 0, w, h, Math.round(x - (w - 1) / 2), Math.round(y - (h - 1) / 2), w, h);
}

/**
 * Draws one path on `g`. `line`: the colour of the lines either side and of the pads and nodes; `rune(s, k)` how each
 * rune shows (null: dark, in `dark`); `from` is how far along a longer run this path starts (for the runes' look).
 * `light`, if given, gets a small light at every third rune glowing near full. `mask`, if given, gets every lit rune
 * stamped in white at its glow, and the lines at `mask.line`, for a Shimmer to show through. `lineAlpha`: the lines'
 * opacity against the runes'.
 */
export function drawGlyphPath(g: Ctx, p: GlyphPath, line: string, dark: string, rune: (s: number, k: number) => RuneLook,
  opts: { from?: number; light?: (x: number, y: number, r: number, col: string, a: number) => void; mask?: { g: Ctx; line: number }; lineAlpha?: number } = {}): void {
  if (!TILES) return;
  const { from = 0, light, mask, lineAlpha = 1 } = opts;
  const darkSheet = tint(dark), lineSheet = tint(line);
  if (!darkSheet || !lineSheet) return;
  const white = mask ? tint('#ffffff') : null;
  // the two lines
  for (const side of [PATH.half, -PATH.half]) {
    const o = offset(p.pts, side).map(([x, y]) => F(x, y));
    g.globalAlpha = lineAlpha; X.lines(g, o, line, 1); g.globalAlpha = 1;
    if (mask && mask.line > 0) { mask.g.globalAlpha = mask.line; X.lines(mask.g, o, '#ffffff', 1); mask.g.globalAlpha = 1; }
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
      // the shimmer shows through the lit runes, as strongly as they glow
      if (mask && white) { mask.g.globalAlpha = Math.min(1, look.glow); stamp(mask.g, white, tile, x, y); mask.g.globalAlpha = 1; }
    }
    // a bend: a node
    if (i < p.pts.length - 1) { const [x, y] = F(bx, by); stamp(g, lineSheet, TILES.node, x, y); }
    s0 += L;
  }
  // the ends
  const ends: [P, 'pad' | 'node' | 'none'][] = [[p.pts[0], p.start], [p.pts[p.pts.length - 1], p.end]];
  for (const [[x, y], mark] of ends) if (mark !== 'none') { const [fx, fy] = F(x, y); stamp(g, lineSheet, mark === 'pad' ? TILES.pad : TILES.node, fx, fy); }
}
