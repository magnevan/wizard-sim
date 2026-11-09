/**
 * The painted ground: a room's Ground layer (a material per half-unit cell, from LDtk) turned into
 * pixels. It isn't tiles. Each pixel asks where it is in the world, through a camera projection, and
 * which material is there, then takes its colour from that material's texture. So any camera works,
 * today's or the isometric one, and paths wander without a tile for every bend.
 *
 * Where two materials meet, the one on top (the higher layer) decides how the edge looks: grass and
 * forest floor fray into blades, loose ground breaks into clumps, paving loses whole stones, and water
 * gets a wet bank and a foam line. Both sides are shaded a little at the join.
 *
 * Variation comes in layers, all free and all a pure function of position: alternate tiles chosen
 * by region, a random shift and mirror per block, broad warm and cool patches, stone-by-stone shade, then
 * scattered small objects (art/ground-room.ts).
 *
 * This file is pure (arrays in, arrays out) so it runs in node for the tests; art/ground-room.ts loads
 * the images and makes the texture. It's client-only: the sim never knows what the ground looks like.
 */
import { FY, PPU } from '../camera';
import { clamp, lerp, rand, vnoise } from './util';

/** A tiling texture: width, height and RGBA bytes. `flip` shifts and mirrors it at random per block, for things with no grid in them. */
export interface Material {
  w: number; h: number; data: Uint8ClampedArray; flip: boolean;
  /** Other tiles of the same material, chosen region by region. */
  alts?: readonly Material[];
}

export type EdgeStyle = 'grow' | 'clump' | 'block' | 'shore';
/** How a material meets its neighbours. Higher layers sit on top. bw x bh is the piece that drops out of a 'block' edge, in art px. */
export interface MaterialStyle { layer: number; edge: EdgeStyle; bw: number; bh: number }
const S = (layer: number, edge: EdgeStyle, bw = 16, bh = 16): MaterialStyle => ({ layer, edge, bw, bh });
export const MATERIAL_STYLES: Readonly<Record<string, MaterialStyle>> = {
  w: S(0, 'shore'), m: S(1, 'clump'), d: S(2, 'clump'), s: S(3, 'clump'), r: S(3, 'clump'), a: S(3, 'clump'),
  c: S(5, 'block'), f: S(5, 'block'), h: S(6, 'block', 32, 32), p: S(6, 'block', 32, 8), l: S(7, 'grow'), g: S(8, 'grow'),
};
const DEFAULT_STYLE = S(4, 'clump');
const styleOf = (ch: string): MaterialStyle => MATERIAL_STYLES[ch] ?? DEFAULT_STYLE;

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
/** How far edges wander, world units. */
const WANDER = 0.5;
/** Cells of padding round the map in the blend field, and the blur radius that sets how wide a transition is. */
const PAD = 6, BLUR = 2;
/** The floor's dusk grade (art/floor.ts), so painted ground sits under the same light as the actors. */
const GRADE = [0.92, 0.95, 1.08];
/** Broad colour drift across a field: dry and warm, or lush and cool. */
const WARM = [1.09, 1.03, 0.92], COOL = [0.9, 0.98, 1.04];

/** The character at a world point; off the map, `outside` or the nearest edge cell. */
export function groundAt(g: GroundMap, wx: number, wy: number): string {
  const gw = g.rows[0].length, gh = g.rows.length;
  if (g.outside && (Math.abs(wx) > g.w / 2 || Math.abs(wy) > g.h / 2)) return g.outside;
  const cx = clamp(Math.floor((wx + g.w / 2) / CELL), 0, gw - 1), cy = clamp(Math.floor((wy + g.h / 2) / CELL), 0, gh - 1);
  return g.rows[cy][cx];
}

/** Per material, how much of it is near each cell: the blurred map that transitions are read from. */
interface Field { cols: number; rows: number; chars: string[]; weight: Float32Array[]; pure: Uint8Array }

function blurLine(src: Float32Array, dst: Float32Array, n: number, step: number, start: number): void {
  let sum = 0;
  const at = (i: number) => src[start + clamp(i, 0, n - 1) * step];
  for (let i = -BLUR; i <= BLUR; i++) sum += at(i);
  for (let i = 0; i < n; i++) { dst[start + i * step] = sum / (2 * BLUR + 1); sum += at(i + BLUR + 1) - at(i - BLUR); }
}

function buildField(g: GroundMap, base: string): Field {
  const gw = g.rows[0].length, gh = g.rows.length, cols = gw + 2 * PAD, rows = gh + 2 * PAD;
  const cellAt = (cx: number, cy: number): string => {
    if (g.outside && (cx < 0 || cy < 0 || cx >= gw || cy >= gh)) return g.outside;
    const ch = g.rows[clamp(cy, 0, gh - 1)][clamp(cx, 0, gw - 1)];
    return ch === '.' ? base : ch;
  };
  const chars: string[] = [], index = new Map<string, number>(), grid = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = cellAt(x - PAD, y - PAD);
    let k = index.get(ch);
    if (k === undefined) { k = chars.length; chars.push(ch); index.set(ch, k); }
    grid[y * cols + x] = k;
  }
  const weight = chars.map((_, k) => {
    let a = new Float32Array(cols * rows), b = new Float32Array(cols * rows);
    for (let i = 0; i < a.length; i++) a[i] = grid[i] === k ? 1 : 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < rows; y++) blurLine(a, b, cols, 1, y * cols);
      [a, b] = [b, a];
      for (let x = 0; x < cols; x++) blurLine(a, b, rows, cols, x);
      [a, b] = [b, a];
    }
    return a;
  });
  const pure = new Uint8Array(cols * rows).fill(255);
  weight.forEach((w, k) => { for (let i = 0; i < w.length; i++) if (w[i] > 0.999) pure[i] = k; });
  return { cols, rows, chars, weight, pure };
}

/** The two materials most present at a point: reused to avoid allocating per pixel. */
const mix = { a: 0, b: 0, s: 1 };
/** Fills `mix`: a is the higher layer, b the lower, s runs -1 (all b) to 1 (all a), 0 on the boundary. A pure spot has a === b. */
function readMix(f: Field, layers: readonly number[], g: GroundMap, wx: number, wy: number): void {
  const fx = clamp((wx + g.w / 2) / CELL + PAD - 0.5, 0, f.cols - 1.001), fy = clamp((wy + g.h / 2) / CELL + PAD - 0.5, 0, f.rows - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, c0 = j * f.cols + i, c1 = c0 + f.cols;
  const p = f.pure[c0];
  if (p !== 255 && p === f.pure[c0 + 1] && p === f.pure[c1] && p === f.pure[c1 + 1]) { mix.a = mix.b = p; mix.s = 1; return; }
  let top = 0, second = 0, kt = 0, ks = 0;
  for (let k = 0; k < f.weight.length; k++) {
    const w = f.weight[k], val = (w[c0] * (1 - u) + w[c0 + 1] * u) * (1 - v) + (w[c1] * (1 - u) + w[c1 + 1] * u) * v;
    if (val > top) { second = top; ks = kt; top = val; kt = k; } else if (val > second) { second = val; ks = k; }
  }
  if (second <= 0.001) { mix.a = mix.b = kt; mix.s = 1; return; }
  const q = (top - second) / (top + second);
  if (layers[kt] >= layers[ks]) { mix.a = kt; mix.b = ks; mix.s = q; } else { mix.a = ks; mix.b = kt; mix.s = -q; }
}

/** A copy of `alt` with `base`'s average colour, so alternates vary a surface's detail without blotching it. */
export function matchColour(alt: Material, base: Material): Material {
  const mean = (m: Material) => { const c = [0, 0, 0]; for (let i = 0; i < m.data.length; i += 4) for (let k = 0; k < 3; k++) c[k] += m.data[i + k]; return c; };
  const ma = mean(alt), mb = mean(base), na = alt.data.length / 4, nb = base.data.length / 4, data = new Uint8ClampedArray(alt.data);
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) data[i + k] = data[i + k] * ((mb[k] / nb) / Math.max(1, ma[k] / na));
  return { ...alt, data };
}

/** A texel of material `m` at screen pixel x, y, as [r, g, b] in `rgb`; blockwise shift and mirror for loose materials. */
const rgb = [0, 0, 0];
function texel(base: Material, x: number, y: number, px: number, py: number): void {
  let m = base;
  if (base.alts?.length) {
    // alternate tiles by region, with a dissolve between them
    const n = base.alts.length + 1, r = vnoise(px * 0.05, py * 0.05, 71) * 0.65 + vnoise(px * 0.14, py * 0.14, 72) * 0.35 + (rand(x, y, 73) - 0.5) * 0.2;
    const k = clamp(Math.floor(((r - 0.2) / 0.6) * n), 0, n - 1);
    if (k > 0) m = base.alts[k - 1];
  }
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
  rgb[0] = m.data[t]; rgb[1] = m.data[t + 1]; rgb[2] = m.data[t + 2];
}

/**
 * Paints into `out` (W x H RGBA). OX, OY: where the room's centre is in the image. `base` is the
 * material for unpainted cells. Colours come from screen position, so textures don't shear with the
 * camera; a material with a grid in it (flagstones) is the one thing that would need its own version.
 */
export function paintGround(out: Uint8ClampedArray, W: number, H: number, OX: number, OY: number, g: GroundMap, mats: Readonly<Record<string, Material>>, base: string, cam: GroundCamera, extent = g.w): void {
  // the dusk falloff follows what's on screen: for a turned room, the square that holds it (extent)
  const AW = (extent / 2) * PPU, AH = ((extent === g.w ? g.h : extent) / 2) * PPU * FY;
  const f = buildField(g, base);
  const layers = f.chars.map((c) => styleOf(c).layer), styles = f.chars.map(styleOf), byIndex = f.chars.map((c) => mats[c] ?? mats[base]);
  const water = f.chars.indexOf('w');
  const wob = WANDER * 2;
  // a dropped-out piece of paving is decided once, at the piece's centre, so stones go whole
  const pieces = new Map<number, boolean>();
  const worldX = (px: number, py: number) => cam.x(px, py) + (vnoise(px * 0.05, py * 0.05, 53) - 0.5) * wob;
  const worldY = (px: number, py: number) => cam.y(px, py) + (vnoise(px * 0.05, py * 0.05, 54) - 0.5) * wob;
  for (let y = 0; y < H; y++) {
    const py = y - OY;
    for (let x = 0; x < W; x++) {
      const px = x - OX, i = (y * W + x) * 4;
      readMix(f, layers, g, worldX(px, py), worldY(px, py));
      let k = mix.a, shade = 1;
      const seam = mix.a !== mix.b;
      if (seam) {
        const a = mix.a, b = mix.b, s = mix.s, st = styles[a];
        if (a === water || b === water) {
          // the water is always the lower layer: a dark wet bank, then a broken foam line, then depth
          const foam = (vnoise(px * 0.16, py * 0.3, 74) - 0.5) * 0.14;
          k = s + foam > -0.02 ? a : b;
          if (k === a) shade = s + foam < 0.28 ? 0.72 : 1;
          else shade = s + foam > -0.12 ? 1.22 : 1;
        } else if (st.edge === 'block') {
          // the pieces are irregular: each pixel belongs to the nearest of a jittered lattice of stone centres
          const lx = Math.floor(x / st.bw), ly = Math.floor(y / st.bh);
          let best = Infinity, bx = lx, by = ly, cx = 0, cy = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = lx + dx, ny = ly + dy;
            const ccx = (nx + 0.5 + (rand(nx, ny, 82) - 0.5) * 0.75) * st.bw, ccy = (ny + 0.5 + (rand(nx, ny, 83) - 0.5) * 0.75) * st.bh;
            const d = ((x - ccx) / st.bw) ** 2 + ((y - ccy) / st.bh) ** 2;
            if (d < best) { best = d; bx = nx; by = ny; cx = ccx; cy = ccy; }
          }
          const key = (bx + 4096) * 65536 + by + 4096 + a * 1e10;
          let on = pieces.get(key);
          if (on === undefined) {
            readMix(f, layers, g, worldX(cx - OX, cy - OY), worldY(cx - OX, cy - OY));
            on = mix.a === a ? mix.s + (rand(bx, by, 75) - 0.5) * 0.9 > 0 : mix.a === mix.b ? mix.a === a : false;
            pieces.set(key, on);
          }
          k = on ? a : b;
          if (!on && s > -0.5) shade = 0.84; // the bare ground where a stone used to be sits in shadow
        } else {
          const n = st.edge === 'grow'
            ? (vnoise(px * 0.42, py * 0.8, 76) - 0.5) * 1.0 + (rand(x, y, 77) - 0.5) * 0.2
            : (vnoise(px * 0.14, py * 0.2, 78) - 0.5) * 1.1 + (vnoise(px * 0.4, py * 0.5, 79) - 0.5) * 0.5;
          k = s + n > 0 ? a : b;
          if (k === b && s + n > -0.18) shade = 0.82; // the lower material darkens where the upper one overhangs it
        }
      }
      const m = byIndex[k], st = styles[k];
      texel(m, x, y, px, py);
      // broad light and dark patches hide the repeat; a slow warm-to-cool drift; stones each their own shade
      const patch = 0.9 + vnoise(px * 0.012, py * 0.012, 57) * 0.2;
      const drift = vnoise(px * 0.007 + 3, py * 0.007, 80);
      const dk = clamp((drift - 0.5) * 2.6, -1, 1), tint = dk > 0 ? WARM : COOL, ta = Math.abs(dk);
      let stone = 1;
      if (st.edge === 'block') stone = 0.96 + rand(Math.floor(x / 32), Math.floor(y / 32), 81) * 0.08;
      const e = clamp(Math.hypot(px / (AW + 90), py / (AH + 70)), 0, 1.6);
      const light = patch * stone * shade * lerp(1, 0.55, clamp((e - 0.55) / 0.9, 0, 1));
      out[i] = rgb[0] * GRADE[0] * light * lerp(1, tint[0], ta);
      out[i + 1] = rgb[1] * GRADE[1] * light * lerp(1, tint[1], ta);
      out[i + 2] = Math.min(255, rgb[2] * GRADE[2] * light * lerp(1, tint[2], ta));
      out[i + 3] = 255;
    }
  }
}
