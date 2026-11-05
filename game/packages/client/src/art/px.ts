/**
 * Crisp pixel primitives, ported from tools/art-pixel-hd/pixel.js. Everything is drawn into
 * low-res canvases in whole art pixels (fillRect on integers, own scanline fills, no
 * anti-aliasing), so shapes, particles and UI all sit on the same grid. Translucency is
 * ordered dither, never alpha blending, so it stays pixel art at any integer scale.
 */

/** A 2D context that remembers its last fillStyle: parsing it is the hot path for tiny rects. */
export type Ctx = CanvasRenderingContext2D & { _fs?: string | null };
export type Pt = readonly [number, number];
export type Ramp = readonly string[];

const R = Math.round;
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bay = (x: number, y: number): number => BAYER[(x & 3) + ((y & 3) << 2)];

/** A CPU-side canvas (getImageData and drawImage between canvases stay off the GPU). */
export function canvas(w: number, h: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }) as Ctx;
  x.imageSmoothingEnabled = false;
  return { c, x };
}

/** Rough cost meter for the debug line: fills issued since the counter was last reset. */
export const stats = { fills: 0 };
const ok = (...v: number[]) => { for (const n of v) if (!Number.isFinite(n) || Math.abs(n) > 1e5) return false; return true; };

/** Anything that sets fillStyle directly must go through fs() too (or reset c._fs = null). */
export function fs(c: Ctx, col: string): void { if (c._fs !== col) { c.fillStyle = col; c._fs = col; } }
export function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void { stats.fills++; fs(c, col); c.fillRect(R(x), R(y), R(w), R(h)); }
export function px(c: Ctx, x: number, y: number, col: string): void { stats.fills++; fs(c, col); c.fillRect(R(x), R(y), 1, 1); }

/** Filled ellipse by rows; with a < 1 it is ordered-dithered. */
export function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string, a = 1): void {
  if (!ok(cx, cy, rx, ry) || ry > 2000) return;
  fs(c, col); stats.fills += Math.ceil(ry * 2) * (a >= 1 ? 1 : Math.ceil(rx));
  const y0 = R(cy), iry = Math.max(0, R(ry)), irx = Math.max(0, rx);
  for (let dy = -iry; dy <= iry; dy++) {
    const k = iry ? dy / (ry + 0.5) : 0, hw = irx * Math.sqrt(Math.max(0, 1 - k * k));
    const xa = R(cx - hw), xb = R(cx + hw);
    if (a >= 1) { c.fillRect(xa, y0 + dy, Math.max(1, xb - xa), 1); continue; }
    for (let x = xa; x < Math.max(xa + 1, xb); x++) if (a > bay(x, y0 + dy)) c.fillRect(x, y0 + dy, 1, 1);
  }
}

/** 1 px ellipse outline, optionally dithered and partial (from..to in radians). */
export function ring(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string, a = 1, from = 0, to = Math.PI * 2): void {
  if (a <= 0 || !ok(cx, cy, rx, ry, from, to)) return;
  fs(c, col);
  const n = Math.max(12, Math.ceil((rx + ry) * 3));
  let lx = 1e9, ly = 1e9;
  for (let i = 0; i <= n; i++) {
    const th = from + (to - from) * (i / n), x = R(cx + Math.cos(th) * rx), y = R(cy + Math.sin(th) * ry);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    if (a >= 1 || a > bay(x, y)) c.fillRect(x, y, 1, 1);
  }
}

/** Scanline polygon fill (pixel centres), optional dither alpha. */
export function poly(c: Ctx, pts: readonly Pt[], col: string, a = 1): void {
  if (pts.length < 3 || a <= 0) return;
  fs(c, col);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (!ok(p[0], p[1])) return; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  stats.fills += Math.ceil(y1 - y0) * (a >= 1 ? 1 : 8);
  y0 = Math.floor(y0); y1 = Math.ceil(y1);
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = R(xs[k]), xb = R(xs[k + 1]);
      if (xb <= xa) continue;
      if (a >= 1) c.fillRect(xa, y, xb - xa, 1);
      else for (let x = xa; x < xb; x++) if (a > bay(x, y)) c.fillRect(x, y, 1, 1);
    }
  }
}

/** Bresenham line with a square brush of width w. */
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, w = 1): void {
  if (!ok(x0, y0, x1, y1)) return;
  fs(c, col);
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  stats.fills += Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = Math.floor((w - 1) / 2);
  let err = dx + dy, guard = 0;
  for (;;) {
    c.fillRect(x0 - o, y0 - o, w, w);
    if ((x0 === x1 && y0 === y1) || ++guard > 2000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
export function lines(c: Ctx, pts: readonly Pt[], col: string, w = 1): void { for (let i = 1; i < pts.length; i++) line(c, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, w); }

/** Dithered radial glow (solid colour: a core, then a checker rim). Ground-flattened with fy. */
export function glow(c: Ctx, cx: number, cy: number, r: number, col: string, a: number, fy = 1): void {
  if (r < 0.6 || a <= 0.02 || !ok(cx, cy, r) || r > 300) return;
  fs(c, col);
  // per row: the solid core as one span, the checker rim pixel by pixel
  const ry = r * fy, x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  const dCore = a > 0.5 ? Math.pow(1 - Math.pow(0.5 / a, 1 / 1.6), 2) : -1, dRim = a > 0.22 ? Math.pow(1 - Math.pow(0.22 / a, 1 / 1.6), 2) : -1;
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry, dy2 = dy * dy;
    if (dy2 >= dRim) continue;
    const hr = Math.sqrt(dRim - dy2) * r, hc = dCore > dy2 ? Math.sqrt(dCore - dy2) * r : -1;
    const ra = Math.max(x0, Math.ceil(cx - hr - 0.5)), rb = Math.min(x1, Math.floor(cx + hr - 0.5));
    if (hc >= 0) {
      const ca = Math.ceil(cx - hc - 0.5), cb = Math.floor(cx + hc - 0.5);
      if (cb >= ca) { c.fillRect(ca, y, cb - ca + 1, 1); stats.fills++; }
      for (let x = ra; x < ca; x++) if ((x + y) & 1) { c.fillRect(x, y, 1, 1); stats.fills++; }
      for (let x = Math.max(cb + 1, ra); x <= rb; x++) if ((x + y) & 1) { c.fillRect(x, y, 1, 1); stats.fills++; }
    } else for (let x = ra; x <= rb; x++) if ((x + y) & 1) { c.fillRect(x, y, 1, 1); stats.fills++; }
  }
}

/**
 * Cast shadow of something round standing h px tall: the hull of its footprint ellipse and
 * the same ellipse moved along the light (from the upper left), so tall things throw long
 * shadows to the lower right, all the same way. One fill, so a translucent colour doesn't stack.
 */
export const SHADOW_DIR = [0.42, 0.26] as const;
const shadowPts: [number, number][] = [];
for (let i = 0; i < 40; i++) shadowPts.push([0, 0]);
export function shadow(c: Ctx, cx: number, cy: number, rx: number, ry: number, h: number, col = 'rgba(8,6,16,0.5)'): void {
  const ox = SHADOW_DIR[0] * h, oy = SHADOW_DIR[1] * h, pts = shadowPts;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts[i * 2][0] = cx + x; pts[i * 2][1] = cy + y; pts[i * 2 + 1][0] = cx + x + ox; pts[i * 2 + 1][1] = cy + y + oy;
  }
  const sorted = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], hi: Pt[] = [];
  for (const p of sorted) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  poly(c, lo.slice(0, -1).concat(hi.slice(0, -1)), col);
}

/** The 3x5 font (upper case, digits, a few signs). */
export const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
  '/': '001001010100100', '!': '010010010000010', '×': '000101010101000', ':': '000010000010000', '_': '000000000000111', '(': '001010010010001', ')': '100010010010100', ',': '000000000010100', '%': '101001010100101',
};
/** Draws text in the 3x5 font; returns its width. shadow draws a 1 px outline round it. */
export function text(c: Ctx, str: string, x: number, y: number, col: string, shadowCol?: string, k = 1): number {
  const s = str.toUpperCase();
  const draw = (ox: number, oy: number, cc: string) => {
    fs(c, cc);
    for (let j = 0; j < s.length; j++) {
      const g = FONT[s[j]] ?? FONT[' '];
      for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(R(x) + (j * 4 + (i % 3)) * k + ox, R(y) + ((i / 3) | 0) * k + oy, k, k);
    }
  };
  if (shadowCol) for (const [ox, oy] of [[1, 1], [0, 1], [1, 0], [-1, 0], [0, -1]]) draw(ox, oy, shadowCol);
  draw(0, 0, col);
  return (s.length * 4 - 1) * k;
}

/** 7x7 element icons. */
export const ICON: Record<string, string[]> = {
  water: ['...#...', '..###..', '.#####.', '###.###', '##.####', '.#####.', '..###..'],
  life: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
  shield: ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  cold: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  lightning: ['....###', '...###.', '..###..', '.######', '...###.', '..##...', '.#.....'],
  arcane: ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  earth: ['..###..', '.##.##.', '###.###', '#######', '##.####', '.#####.', '.......'],
  fire: ['...#...', '..##...', '..###.#', '.#####.', '###.###', '##...##', '.#####.'],
  sigil: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
};
export function icon(c: Ctx, el: string, x: number, y: number, col: string, k = 1): void {
  const g = ICON[el]; if (!g) return;
  fs(c, col);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (g[j][i] === '#') c.fillRect(R(x) + i * k, R(y) + j * k, k, k);
}

// ---- colour ----
export const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const toHex = (r: number, g: number, b: number): string => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixCache = new Map<string, string>();
/** a toward b by k, in 32 steps (cached: it runs per pixel in the rigs). */
export function mix(a: string, b: string, k: number): string {
  k = Math.max(0, Math.min(1, k));
  const key = a + b + ((k * 32) | 0);
  let v = mixCache.get(key);
  if (v) return v;
  const A = hex(a), B = hex(b), q = ((k * 32) | 0) / 32;
  v = toHex(A[0] + (B[0] - A[0]) * q, A[1] + (B[1] - A[1]) * q, A[2] + (B[2] - A[2]) * q);
  mixCache.set(key, v);
  return v;
}
export const hexNum = (h: string): number => parseInt(h.slice(1, 7), 16);

/** Element ramps, brightest first (the Battlefield's). */
export const EL: Record<string, Ramp> = {
  fire: ['#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#c8302a', '#6a1a20'],
  arcane: ['#ffffff', '#ffc0e0', '#ff6ab0', '#ff2d8a', '#a01e6a', '#4a1450'],
  water: ['#e0f6ff', '#8ad0ff', '#3a98ff', '#1a5ec0', '#163a7a'],
  cold: ['#ffffff', '#e0ffff', '#9ff4ff', '#4ad0f4', '#2080c8', '#163e7a'],
  lightning: ['#ffffff', '#efe4ff', '#c4a4ff', '#8a5af0', '#4a2aa0'],
  shield: ['#fffbe0', '#ffe68a', '#ffc83a', '#c8901a', '#6a4a10'],
  earth: ['#e0c8a0', '#b8946a', '#8a6a48', '#5a4430', '#33261c'],
  life: ['#e8ffd8', '#9af07a', '#46c450', '#1e7a34', '#0e3a1e'],
  steam: ['#ffffff', '#e4e8f0', '#b8c0d0', '#8a90a8'],
  sigil: ['#fbe0ff', '#ec8cff', '#d400ff', '#9a00c4', '#5c0080', '#30004a'],
};
/** Lighter, warmer ramps the gallery settled on for some looks. */
export const LIFE_L: Ramp = ['#ffffff', '#f2ffe8', '#c8fab0', '#8ef07e', '#58d268'];
export const LIFE: Ramp = ['#ffffff', '#f2ffe8', '#c8fab0', '#8ef07e', '#46c450', '#1e7a34'];
export const WARM: Ramp = ['#ffffff', '#fff6d0', '#ffe68a', '#d8f07a', '#8ee070', '#3aa048'];
export const FROST: Ramp = ['#ffffff', '#e8ffff', '#a8f2ff', '#5ad4f4', '#2a8ccc'];
export const PLASMA: Ramp = ['#ffffff', '#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#a82818'];
export const EARTH: Ramp = ['#d8b88a', '#b8946a', '#977552', '#76583c', '#553e2a', '#33241a'];

export interface TeamPal { main: string; light: string; dark: string; deep: string; trim: string; name: string }
/** Robes per seat: Red, Blue, Gold, Violet. */
export const TEAMS: TeamPal[] = [
  { main: '#d23440', light: '#f2666a', dark: '#7e1a2a', deep: '#4a1020', trim: '#f4c44a', name: 'Red' },
  { main: '#2f6ad6', light: '#64a0f6', dark: '#1a3a86', deep: '#10204a', trim: '#d8ecfa', name: 'Blue' },
  { main: '#dca22a', light: '#f8d26a', dark: '#8a5c14', deep: '#4a300c', trim: '#fff4cc', name: 'Gold' },
  { main: '#8048d0', light: '#ac80f0', dark: '#46267e', deep: '#28143e', trim: '#e6d8ff', name: 'Violet' },
];

/** Ordered-dither masks for fading whole sprites: mask(level 0..16) is opaque where the Bayer threshold < level/16. */
const masks: HTMLCanvasElement[] = [];
export function mask(level: number, size = 96): HTMLCanvasElement {
  level = Math.max(0, Math.min(16, Math.round(level)));
  if (masks[level]) return masks[level];
  const m = canvas(size, size);
  m.x.fillStyle = '#000';
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (level / 16 > bay(i, j)) m.x.fillRect(i, j, 1, 1);
  return (masks[level] = m.c);
}
