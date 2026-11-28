/**
 * Natural ground (docs/explorations/2026-11-27-grass-fields.md): what makes a lawn read as grass from the game's steep
 * camera rather than felt. Reusable for any painted ground, not only the infirmary's meadow:
 *
 *  - the tile repeats in random hex patches (Mikkelsen's hex tiling, simplified), so no grid shows over a field;
 *  - tufts at clump scale (about 0.4 m and 1 m), each lit on its sunward side with a dark crevice round it, the scale
 *    the painted tile lacks;
 *  - a ground map over the scene, built here from the compiled scene, saying per half-u cell how worn the ground is
 *    (worn paths, `ground.wear`), how long the grass is (away from paving and paths, in rings round anything standing
 *    on the lawn, and where a `grass-long` patch was set), how much contact shade it has (at the foot of props) and how
 *    far it is from hard ground;
 *  - wind sheen: long grass brightens in combed bands as the foliage's gusts cross it (the same wind field);
 *  - cloud shadows over the whole level, on every lit material (cloudify), so ground, plants and roofs darken together.
 */
import * as THREE from 'three';
import { FOLIAGE_TIME, PALETTES } from './foliage';
import { CLOUD_TIME, WEATHER } from './weather';

type Pt = number[];
type GFloor = { h: number; mat: string; polys: number[][][][] };
type GInst = { p: string; x: number; y: number; rot: number; scale?: number; pts?: number[][]; w?: number };
type GPiece = { class?: string; shape?: string; footprint?: [number, number]; height?: number;
  grow?: { kind?: string; blooms?: readonly string[]; spikes?: readonly string[]; bloom?: unknown } };

/** The last ground map's fields, for the margin grass (marginGrass). */
let FIELDS: { nx: number; ny: number; x0: number; y0: number; top: Float32Array; lawn: Uint8Array; R: Float32Array; G: Float32Array; B: Float32Array; dHard: Float32Array; dWear: Float32Array; hems: Hem[] } | null = null;
/** A plant's outline on the ground (signed distance, u) and its middle and reach: the margin grass hems it. */
type Hem = { x: number; y: number; r: number; sd: (x: number, y: number) => number; tall: number };
/** The ground map's cell (u). */
const CELL = 0.5;
/** Shared by every ground material: the map, where it lies, and the wind's time. */
export const GROUND_U = {
  grOn: { value: 0 }, grMap: { value: null as THREE.Texture | null },
  grO: { value: new THREE.Vector2() }, grS: { value: new THREE.Vector2(1, 1) }, grTime: FOLIAGE_TIME,
  /** the weather's wind strength and the sheen's (weather.ts) */
  grWind: WEATHER.wind, grSheen: WEATHER.sheen,
  /** The painted tufts (textures/foliage-tufts.png: a 4 x 4 sheet of grey tufts, rows short, clumps, long, sparse) and
   * the bare earth worn paths show (the weathered paving's own tile, and its size in u); kit-render sets them. */
  grTuft: { value: null as THREE.Texture | null }, grTuftOn: { value: 0 },
  grEarth: { value: null as THREE.Texture | null }, grEarthS: { value: 3 }, grEarthOn: { value: 0 },
  /** the lawn's own tile and its size (u), so a margin tuft takes the colour of the ground at its root */
  grLawn: { value: null as THREE.Texture | null }, grLawnS: { value: 5 },
  /** flowers: the blossom sheet (foliage-blossoms.png) and a second map per cell: how much a flowering plant spills
   * its blossoms into the grass round it (A) and their colour (RGB) */
  grBloom: { value: null as THREE.Texture | null }, grBloomOn: { value: 0 }, grFlw: { value: null as THREE.Texture | null },
  /** the spill's colours: R of grFlw is how much, G which of these eight (i / 7) */
  grFlwPal: { value: Array.from({ length: 8 }, () => new THREE.Vector3(1, 1, 1)) },
  /** who's walking through the grass (setGrassPushers): world x, z, radius (u), strength (0: none) */
  grPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
};
/** Hand the ground its painted tufts and its earth tile (either may be missing: the ground then does without). */
export function setGroundArt(tuft: THREE.Texture | undefined, earth: THREE.Texture | undefined, earthTile: number, lawn?: THREE.Texture, lawnTile = 5, bloom?: THREE.Texture) {
  GROUND_U.grBloom.value = bloom ?? null; GROUND_U.grBloomOn.value = bloom ? 1 : 0;
  GROUND_U.grLawn.value = lawn ?? null; GROUND_U.grLawnS.value = lawnTile;
  GROUND_U.grTuft.value = tuft ?? null; GROUND_U.grTuftOn.value = tuft ? 1 : 0;
  GROUND_U.grEarth.value = earth ?? null; GROUND_U.grEarthS.value = earthTile; GROUND_U.grEarthOn.value = earth ? 1 : 0;
}
/** Who stands in the grass this frame (world x, z and radius in u; up to 8, nearest first): the grass parts round them. */
export function setGrassPushers(list: readonly { x: number; z: number; r: number }[]) {
  const P = GROUND_U.grPush.value;
  for (let i = 0; i < P.length; i++) { const b = list[i]; if (b) P[i].set(b.x, b.z, b.r, 1); else P[i].w = 0; }
  fillFootGrass(list.slice(0, P.length));
}
/** The clouds: on (1) or off, their clock, cover, darkness and size (weather.ts; at their defaults a picture at &t= is as before). */
export const CLOUD_U = { clOn: WEATHER.clouds, clT: CLOUD_TIME, clCover: WEATHER.cover, clDark: WEATHER.dark, clSize: WEATHER.size };

// ---------------------------------------------------------------------------------------------------------------
// the ground map
// ---------------------------------------------------------------------------------------------------------------
/** Fill the cells inside a polygon set (outer ring plus holes), row by row, calling put(cell index). */
function scanFill(rings: number[][][], x0: number, y0: number, nx: number, ny: number, put: (k: number) => void) {
  let ya = Infinity, yb = -Infinity;
  for (const r of rings) for (const p of r) { ya = Math.min(ya, p[1]); yb = Math.max(yb, p[1]); }
  const j0 = Math.max(0, Math.floor((ya - y0) / CELL)), j1 = Math.min(ny - 1, Math.ceil((yb - y0) / CELL));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const yc = y0 + (j + 0.5) * CELL; xs.length = 0;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) put(j * nx + i);
    }
  }
}
/** Distance (u) from each cell to the nearest cell where src is true (two-pass chamfer). */
function distField(src: Uint8Array, nx: number, ny: number): Float32Array {
  const d = new Float32Array(nx * ny), BIG = 1e6, a = CELL, b = CELL * Math.SQRT2;
  for (let k = 0; k < nx * ny; k++) d[k] = src[k] ? 0 : BIG;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - nx] + a); if (i > 0) v = Math.min(v, d[k - nx - 1] + b); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + b); }
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
    if (j < ny - 1) { v = Math.min(v, d[k + nx] + a); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + b); if (i > 0) v = Math.min(v, d[k + nx - 1] + b); }
    d[k] = v;
  }
  return d;
}
const segDist = (px: number, py: number, a: Pt, b: Pt) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / L)) : 0;
  return Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t);
};
const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * Build the ground map for a compiled scene and hand it to every ground material. RGBA per half-u cell:
 * R worn (bare earth), G long grass, B contact shade, A distance from hard ground (u / 8).
 */
export function buildGround(floors: GFloor[], instances: GInst[], piece: (p: string) => GPiece | undefined) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of floors) for (const poly of f.polys) for (const p of poly[0]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (!Number.isFinite(x0)) { GROUND_U.grOn.value = 0; return; }
  x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), N = nx * ny;
  // which floor is on top in each cell: lawn (meadow) or hard ground (everything else)
  const top = new Float32Array(N).fill(-Infinity), lawn = new Uint8Array(N);
  for (const f of floors) for (const poly of f.polys) scanFill(poly, x0, y0, nx, ny, (k) => {
    if (f.h >= top[k]) { top[k] = f.h; lawn[k] = f.mat === 'meadow' ? 1 : 0; }
  });
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  // what stands on the lawn: buildings are hard ground; anything else gets contact shade and a ring of long grass
  const box = (it: GInst, k: GPiece) => {
    const s = it.scale ?? 1, [w, d] = k.footprint ?? [1, 1], th = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));
    const c = Math.cos(th), sn = Math.sin(th), hw = (w * s) / 2, hd = (d * s) / 2;
    // signed distance from (x, y) to the footprint (round ones as an ellipse's inscribed circle-ish)
    const sd = k.shape === 'round'
      ? (x: number, y: number) => Math.hypot(x - it.x, y - it.y) - Math.min(hw, hd)
      : (x: number, y: number) => {
        const dx = x - it.x, dy = y - it.y, lx = dx * c - dy * sn, lz = dx * sn + dy * c;
        const qx = Math.abs(lx) - hw, qz = Math.abs(lz) - hd;
        return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
      };
    return { sd, r: Math.hypot(hw, hd) };
  };
  const hard = new Uint8Array(N);
  for (let k = 0; k < N; k++) hard[k] = lawn[k] ? 0 : 1;
  const each = (it: GInst, reach: number, fn: (k: number, x: number, y: number) => void) => {
    const i0 = Math.max(0, Math.floor((it.x - reach - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((it.x + reach - x0) / CELL));
    const j0 = Math.max(0, Math.floor((it.y - reach - y0) / CELL)), j1 = Math.min(ny - 1, Math.ceil((it.y + reach - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * nx + i, x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL);
  };
  const standing: { it: GInst; k: GPiece; sd: (x: number, y: number) => number; r: number }[] = [], patches: typeof standing = [];
  for (const it of instances) {
    const k = piece(it.p);
    if (!k || !/^(setpiece|dress)\./.test(it.p)) continue;
    const g = k.grow?.kind;
    if (g === 'patch' && it.p === 'setpiece.grass-long') {   // a drift of long grass: painted into the ground
      const s = it.scale ?? 1, r = ((k.footprint?.[0] ?? 3) * s) / 2 * 1.35;
      each(it, r + 1, (q, x, y) => { G[q] = Math.max(G[q], 1 - smooth(r * 0.55, r, Math.hypot(x - it.x, y - it.y))); });
      continue;
    }
    if (g === 'field') continue;                            // worked fields: nothing
    if (g === 'patch') {   // low drifts: their flowers spill, and grass grows up round their foot so they rise out of the lawn
      const b = box(it, k); patches.push({ it, k, ...b });
      each(it, b.r + 1.5, (q, x, y) => { const d = b.sd(x, y) + 0.4; if (d > 1.2) return;
        G[q] = Math.max(G[q], (1 - smooth(0.2, 1.2, d)) * 0.9); B[q] = Math.max(B[q], (1 - smooth(-0.2, 0.9, d)) * 0.2); });
      continue;
    }
    const b = box(it, k);
    if (!g && (k.height ?? 0) >= 2.5 && k.shape !== 'round') { each(it, b.r + 1, (q, x, y) => { if (b.sd(x, y) < 0) hard[q] = 1; }); }
    standing.push({ it, k, ...b });
  }
  const dHard = distField(hard, nx, ny);
  // worn paths
  const wears = instances.filter((it) => it.p === 'ground.wear' && it.pts && it.pts.length > 1);
  const dWear = new Float32Array(N).fill(1e6);
  for (const it of wears) {
    const w = it.w ?? 1.2, P = it.pts!;
    let xa = Infinity, ya = Infinity, xb = -Infinity, yb = -Infinity;
    for (const p of P) { xa = Math.min(xa, p[0]); ya = Math.min(ya, p[1]); xb = Math.max(xb, p[0]); yb = Math.max(yb, p[1]); }
    const reach = w + 6;
    const i0 = Math.max(0, Math.floor((xa - reach - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((xb + reach - x0) / CELL));
    const j0 = Math.max(0, Math.floor((ya - reach - y0) / CELL)), j1 = Math.min(ny - 1, Math.ceil((yb + reach - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * CELL, y = y0 + (j + 0.5) * CELL, q = j * nx + i;
      let d = Infinity;
      for (let s = 0; s + 1 < P.length; s++) d = Math.min(d, segDist(x, y, P[s], P[s + 1]));
      dWear[q] = Math.min(dWear[q], d - w / 2);
      R[q] = Math.max(R[q], 1 - smooth(-w * 0.15, w * 0.4, d - w / 2 + w * 0.15));
    }
  }
  // long grass: away from hard ground and paths
  for (let q = 0; q < N; q++) {
    if (!lawn[q]) continue;
    G[q] = Math.max(G[q], smooth(2, 4.5, dHard[q]) * smooth(1.5, 4, dWear[q]));
  }
  // rings of long grass and contact shade round what stands on the lawn (not on paths)
  for (const s of standing) {
    const tall = Math.min(1, (s.k.height ?? 1) / 3), ring = 0.7 + 0.8 * tall;
    each(s.it, s.r + ring + 1.5, (q, x, y) => {
      if (!lawn[q]) return;
      const d = s.sd(x, y);
      B[q] = Math.max(B[q], (1 - smooth(-0.1, 0.5 + 0.9 * tall, d)) * (0.55 + 0.45 * tall));
      const g = smooth(-0.3, 0.15, d) * (1 - smooth(ring * 0.6, ring + 0.4, d)) * smooth(0.5, 1.8, dWear[q]);
      G[q] = Math.max(G[q], g);
    });
  }
  // flowering plants spill their blossoms into the grass round them, thinning out over a couple of metres, so a clump
  // grows out of the lawn instead of sitting on it (the user, 2026-11-27: the flowers "feel artificially placed on top")
  const FL = new Float32Array(N), FI = new Uint8Array(N), used: string[] = [];
  const palOf = (g: GPiece['grow']): string[] => {
    if (!g) return [];
    if (g.blooms) return [...g.blooms]; if (g.spikes) return [...g.spikes];
    const bl = g.bloom as { pal?: string } | undefined;
    if (bl && typeof bl === 'object' && bl.pal) return [bl.pal];
    return [];
  };
  for (const s of [...standing, ...patches]) {
    const pals = palOf(s.k.grow).filter((n) => n in PALETTES);
    if (!pals.length) continue;
    const idx = pals.map((n) => { let i = used.indexOf(n); if (i < 0 && used.length < 8) { used.push(n); i = used.length - 1; } return Math.max(0, i); });
    const reach = 0.9 + s.r * 0.35;
    each(s.it, s.r + reach, (q, x, y) => {
      if (!lawn[q]) return;
      const d = s.sd(x, y), v = (1 - smooth(-0.3, reach * (0.55 + 0.9 * vnoise(x * 0.35 + 7, y * 0.35)), d)) ** 2 * smooth(0.42, 0.75, vnoise(x * 0.8, y * 0.8));
      if (v <= FL[q]) return;
      FL[q] = v; FI[q] = idx[Math.floor(hash(x * 3.1, y * 1.7) * idx.length) % idx.length];
    });
  }
  used.forEach((n, i) => {
    const c = parseInt(PALETTES[n as keyof typeof PALETTES][5].slice(1), 16);
    GROUND_U.grFlwPal.value[i].set((c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  });
  const fpx = new Uint8Array(N * 4);
  for (let q = 0; q < N; q++) { fpx[q * 4] = Math.round(Math.min(1, FL[q]) * 255); fpx[q * 4 + 1] = Math.round((FI[q] / 7) * 255); fpx[q * 4 + 3] = 255; }
  const ft = new THREE.DataTexture(fpx, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  ft.magFilter = ft.minFilter = THREE.NearestFilter; ft.generateMipmaps = false; ft.needsUpdate = true;
  GROUND_U.grFlw.value?.dispose(); GROUND_U.grFlw.value = ft;
  const px = new Uint8Array(N * 4);
  for (let q = 0; q < N; q++) {
    px[q * 4] = Math.round(R[q] * 255); px[q * 4 + 1] = Math.round(Math.min(1, G[q]) * 255);
    px[q * 4 + 2] = Math.round(Math.min(1, B[q]) * 255); px[q * 4 + 3] = Math.round(Math.min(1, dHard[q] / 8) * 255);
  }
  const t = new THREE.DataTexture(px, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  GROUND_U.grMap.value?.dispose();
  GROUND_U.grMap.value = t; GROUND_U.grO.value.set(x0, y0); GROUND_U.grS.value.set(nx * CELL, ny * CELL); GROUND_U.grOn.value = 1;
  // every plant standing on the lawn gets a hem of grass round its foot (marginGrass), so it grows out of the lawn
  const hems: Hem[] = [...standing, ...patches].filter((s) => s.k.grow && s.it.p !== 'setpiece.grass-long')
    .map((s) => ({ x: s.it.x, y: s.it.y, r: s.r, sd: s.sd, tall: Math.min(1, (s.k.height ?? 1) / 2) }));
  FIELDS = { nx, ny, x0, y0, top, lawn, R, G, B, dHard, dWear, hems };
}

// ---------------------------------------------------------------------------------------------------------------
// the shader
// ---------------------------------------------------------------------------------------------------------------
/**
 * GLSL for natural ground: the uniforms, hex tiling, tufts, the wind, and lawnVary (the meadow's broad drift, as
 * before) and groundLawn (all of it together). A material using it gets GROUND_U in its uniforms.
 */
/** GLSL: how the grass at a world point (u) is pushed by whoever walks in it: xy away from them (0 to 1), z crushed flat. */
const PUSH_GLSL = `
uniform vec4 grPush[8];
vec3 grPushAt(vec2 p) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 b = grPush[i];
    if (b.w <= 0.0) continue;
    vec2 v = p - b.xy; float d = length(v);
    o.xy += (d > 0.001 ? v / d : vec2(0.0)) * (1.0 - smoothstep(b.z * 0.5, b.z * 2.4, d)) * b.w;
    o.z = max(o.z, (1.0 - smoothstep(b.z * 0.4, b.z * 1.5, d)) * b.w);
  }
  float l = length(o.xy); if (l > 1.0) o.xy /= l;
  return o;
}
`;
export const GROUND_GLSL = `
${PUSH_GLSL}
uniform float grOn, grTime, grWind, grSheen, grTuftOn, grEarthS, grEarthOn, grBloomOn; uniform sampler2D grMap, grTuft, grEarth, grBloom, grFlw; uniform vec2 grO, grS; uniform vec3 grFlwPal[8];
float lwH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
vec2 lwH2(vec2 q) { return fract(sin(vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)))) * 43758.5453); }
float lwN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lwH(i), lwH(i + vec2(1.0, 0.0)), f.x), mix(lwH(i + vec2(0.0, 1.0)), lwH(i + vec2(1.0, 1.0)), f.x), f.y); }
// The meadow's broad change over the ground (2026-11-27): a little less saturated, drifting between straw-warm and cool
// blue-green over about 20 u, with lusher darker patches and a soft mottle, so a large lawn never reads as one colour.
vec3 lawnVary(vec3 c, vec2 p) {
  float big = lwN(p * 0.045) * 0.6 + lwN(p * 0.11 + 7.3) * 0.4, mid = lwN(p * 0.17 + 3.1) * 0.7 + lwN(p * 0.5 + 9.0) * 0.3;
  c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.9);
  c *= mix(vec3(0.86, 0.94, 0.7), vec3(1.28, 1.08, 0.66), smoothstep(0.28, 0.78, big));
  c *= mix(vec3(1.0), vec3(0.8, 0.9, 0.68), smoothstep(0.48, 0.8, mid));
  return c * (0.95 + 0.3 * lwN(p * 0.8 + 1.7));
}
// hex tiling (Mikkelsen 2022, simplified): three samples at random offsets on a triangle lattice, blended by sharpened
// weights, so a tile's repeat never shows as a grid. Gradients from the unbroken uv, so the mips don't seam.
vec3 grHex(sampler2D t, vec2 uv) {
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  vec2 s = uv * 2.2;
  vec2 sk = vec2(s.x - 0.57735027 * s.y, 1.15470054 * s.y);
  vec2 b = floor(sk), f = fract(sk); float z = 1.0 - f.x - f.y;
  vec2 v1, v2, v3; vec3 w;
  if (z > 0.0) { w = vec3(z, f.y, f.x); v1 = b; v2 = b + vec2(0.0, 1.0); v3 = b + vec2(1.0, 0.0); }
  else { w = vec3(-z, 1.0 - f.y, 1.0 - f.x); v1 = b + vec2(1.0); v2 = b + vec2(1.0, 0.0); v3 = b + vec2(0.0, 1.0); }
  vec3 c1 = textureGrad(t, uv + lwH2(v1), gx, gy).rgb, c2 = textureGrad(t, uv + lwH2(v2), gx, gy).rgb, c3 = textureGrad(t, uv + lwH2(v3), gx, gy).rgb;
  w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z);
  return c1 * w.x + c2 * w.y + c3 * w.z;
}
// tufts: a cellular field, each cell one clump painted as the concept paints them from this camera: a fan wider than
// it is deep, light along its far (upper) side where the blades catch the sky, a dark crescent under its near side,
// dark gaps between clumps. x: light (0 gap or crescent to 1 lit top), y: the clump's own random value.
// (+z is toward the camera, the screen's down.)
vec2 grTufts(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, id = 0.0; vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), r = g + lwH2(i + g) * 0.8 + 0.1 - f;
    float d = dot(r * vec2(0.8, 1.3), r * vec2(0.8, 1.3));
    if (d < d1) { d1 = d; best = r; id = lwH(i + g + 3.1); }
  }
  vec2 pos = -best;                                  // this point from the clump's middle
  float e = length(pos * vec2(0.8, 1.3));
  float body = 1.0 - smoothstep(0.3, 0.62, e);
  float top = smoothstep(0.3, -0.35, pos.y);
  float cres = smoothstep(0.05, 0.4, pos.y) * smoothstep(0.75, 0.4, e);
  float lit = mix(0.32, 0.5 + 0.5 * top, body) - 0.35 * cres;
  return vec2(clamp(lit, 0.0, 1.0), id);
}
// the foliage's wind (foliage.ts): one heading, gusts drifting downwind; 0 calm to 1 in a gust
float grGust(vec2 p, float t) {
  vec2 W = vec2(0.93, 0.37); float al = dot(p, W), ac = dot(p, vec2(-W.y, W.x));
  float e = 0.42 + 0.3 * sin(al * 0.21 - t * 0.83 + 1.4 * sin(ac * 0.13 + t * 0.11)) + 0.26 * sin(al * 0.078 - t * 0.31 + ac * 0.05 + 1.7)
          + 0.14 * sin(al * 0.47 - t * 1.57 + ac * 0.29);
  e = clamp(e, 0.0, 1.0); return e * e;
}
// Painted tufts stamped over the ground (texture bombing): a jittered grid of cell u; in each cell, with chance dens,
// one sprite from the sheet's rows row0..row0+rows-1, size u across (and 1/0.72 deeper on the ground, as the game's
// 46-degree camera foreshortens it), flipped at random. Cells are visited far to near, so a nearer tuft is painted over
// a farther one. Returns (grey value, coverage).
vec2 grBomb(vec2 p, float cell, float row0, float rows, float size, float dens, float seed, vec3 pu) {
  vec2 i = floor(p / cell), gx = dFdx(p), gy = dFdy(p);
  vec2 acc = vec2(0.5, 0.0);
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    vec2 c = i + vec2(float(dx), float(dy));
    float h3 = lwH(c + seed + 9.1);
    if (h3 > dens) continue;
    vec2 h = lwH2(c + seed);
    float sc = size * (0.75 + 0.5 * lwH(c + seed + 4.4));
    vec2 d = (p - (c + 0.15 + 0.7 * h) * cell) / sc;
    float fl = h.x > 0.5 ? 1.0 : -1.0;
    // the wind: the tuft leans downwind (+x on screen) with the gust at its foot, more toward its tips, and flutters a little
    vec2 foot = (c + 0.15 + 0.7 * h) * cell;
    float tip = max(0.1 - d.y * 0.72 - 0.1, 0.0);
    d.x -= grWind * (0.22 * grGust(foot, grTime) + 0.03 * sin(grTime * 3.1 + h.y * 40.0)) * tip * tip;
    // someone walking through: the blades lean away from them and lie flatter (shorter on screen) the nearer they are
    d.x -= pu.x * 0.45 * tip * tip;
    vec2 uv = vec2(0.5 + d.x * fl, 0.1 + (-d.y * 0.72) / max(0.35, 1.0 - 0.6 * pu.z + 0.25 * pu.y));   // its foot at the cell's point, the blades rising over the ground behind it
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float row = row0 + floor(lwH(c + seed + 2.7) * rows), col = floor(lwH(c + seed + 6.3) * 4.0);
    vec2 cuv = (vec2(col, 3.0 - row) + clamp(uv, 0.01, 0.99)) / 4.0;
    vec4 tx = textureGrad(grTuft, cuv, gx * fl / sc / 4.0, gy / sc / 4.0 * 0.72);
    acc = vec2(mix(acc.x, tx.r, tx.a), acc.y + tx.a * (1.0 - acc.y));
  }
  return acc;
}
#ifdef GR_NO_FLOWERS
#define GR_SPILL 0.0
#else
#define GR_SPILL 1.0
#endif
// Wild flowers stamped over the grass: a jittered grid of cell u, a blossom (the painted sheet's front faces, row 0) in a
// cell with chance dens, size u across, coloured col with its golden eye kept. Returns (colour, coverage).
vec4 grFlowers(vec2 p, float cell, float size, float dens, vec3 col, float seed) {
  vec2 i = floor(p / cell), gx = dFdx(p), gy = dFdy(p);
  vec4 acc = vec4(0.0);
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    vec2 c = i + vec2(float(dx), float(dy));
    if (lwH(c + seed + 9.1) > dens) continue;
    vec2 h = lwH2(c + seed);
    float sc = size * (0.7 + 0.6 * lwH(c + seed + 4.4));
    vec2 d = (p - (c + 0.15 + 0.7 * h) * cell) / sc;
    vec2 uv = vec2(0.5 + d.x, 0.5 - d.y * 0.72);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float k = floor(lwH(c + seed + 6.3) * 4.0);
    vec4 tx = textureGrad(grBloom, (vec2(k, 3.0) + clamp(uv, 0.02, 0.98)) / 4.0, gx / sc / 4.0, gy / sc / 4.0 * 0.72);
    float eye = clamp((tx.r - tx.b - 0.18) / 0.2, 0.0, 1.0);
    float v = dot(tx.rgb, vec3(0.3, 0.59, 0.11));
    vec3 fc = mix(col * mix(0.62, 1.12, v), vec3(0.95, 0.72, 0.18) * (0.6 + 0.5 * v), eye);
    acc.rgb = mix(acc.rgb, fc, tx.a); acc.a = acc.a + tx.a * (1.0 - acc.a);
  }
  return acc;
}
// all of it: the lawn's colour at p (u) from its tile t (tile u across). The tile is painted in perspective, its
// blades rising up the image, so its v runs against world z: the picture's top lies away from the camera (-z).
vec3 groundLawn(sampler2D t, float tile, vec2 p) {
  vec3 c = lawnVary(grHex(t, vec2(p.x, -p.y) / tile), p);
  vec4 s = grOn > 0.5 ? texture2D(grMap, (p - grO) / grS) : vec4(0.0, 0.0, 0.0, 1.0);
  float n1 = lwN(p * 0.45 + 4.0);
  float lg = smoothstep(0.15, 0.85, s.g + (n1 - 0.5) * 0.6 * s.g);
  // the concept's grass: olive and warm yellow-green, not lime
  c *= vec3(1.06, 1.0, 0.78);
  vec2 W = vec2(0.93, 0.37), q = vec2(dot(p, W), dot(p, vec2(-W.y, W.x)));
  // sweeps: long warm shoulders of grass beside cool olive hollows, about 8 u long and 1.6 u across, running with the
  // wind and gently warped, as a painter lays the lawn in strokes (the concept's broad gold drifts between beds)
  vec2 qw = q + vec2(0.0, 2.2 * (lwN(p * 0.07 + 31.0) - 0.5) + 1.2 * (lwN(p * 0.19 + 5.0) - 0.5));
  float sweep = lwN(vec2(qw.x / 8.0, qw.y / 1.6)) * 0.7 + lwN(vec2(qw.x / 3.5, qw.y / 0.9) + 13.0) * 0.3;
  c *= mix(vec3(0.65, 0.77, 0.65), vec3(1.18, 1.08, 0.75), smoothstep(0.25, 0.75, sweep));
  // a soft mottle at clump scale (the cells read as scales if pushed harder)
  vec2 tA = grTufts(p / 0.62);
  vec3 pu = grPushAt(p);   // whoever walks here parts the grass
  c *= mix(0.9, 1.06, tA.x) * mix(0.95, 1.05, tA.y);
  // worn to earth along paths: ragged where the grass breaks into it
  float wn = s.r + (lwN(p * 1.3) - 0.5) * 0.8 + (lwN(p * 4.1 + 7.0) - 0.5) * 0.45 + (tA.x - 0.5) * 0.3;
  float bare = smoothstep(0.58, 0.95, wn), fringe = smoothstep(0.12, 0.5, wn) * (1.0 - bare);
  // painted tufts: short lawn everywhere, big combed clumps in long grass, sparse ones at a path's fringe; none on bare earth
  if (grTuftOn > 0.5) {
    vec2 b1 = grBomb(p, 0.85, 0.0, 2.0, 1.45, 0.7 * (1.0 - lg * 0.85) * (1.0 - bare), 1.0, pu);
    vec2 b2 = grBomb(p, 1.2, 2.0, 1.0, 2.2, 0.65 * lg * (1.0 - bare), 7.0, pu);
    vec2 b3 = grBomb(p, 0.5, 3.0, 1.0, 0.7, fringe * 0.9, 13.0, pu);
    vec2 b = b1;
    b = vec2(mix(b.x, b2.x, b2.y), b.y + b2.y * (1.0 - b.y));
    b = vec2(mix(b.x, b3.x, b3.y), b.y + b3.y * (1.0 - b.y));
    // between tufts the ground is the darker underside of the lawn; a tuft takes the lawn's colour at its own value
    c *= mix(0.82, mix(0.7, 1.4, b.x), b.y);
  }
  // long grass: paler and warmer toward straw, and a sheen rolling across it in the gusts
  // (straw only out in the open; at the foot of things long grass is lush and deep)
  // trodden: flattened grass round someone's feet shows its paler, flatter side
  c *= 1.0 + 0.1 * pu.z * (1.0 - bare);
  float lush = smoothstep(0.05, 0.4, s.b);
  c = mix(c, c * vec3(1.18, 1.1, 0.74), lg * 0.3 * (1.0 - lush));
  c = mix(c, c * vec3(0.72, 0.86, 0.62), lg * lush * 0.8);
  float comb = sweep;
  c += grSheen * vec3(0.1, 0.085, 0.025) * lg * (0.45 + 0.55 * min(1.0, grWind) * grGust(p, grTime)) * smoothstep(0.35, 0.8, comb);
  // wild flowers: drifts of one kind each (daisies, buttercups, clover pink, a little lilac) wandering over the lawn,
  // a few strays anywhere, and each flowering plant's own blossoms spilling into the grass round it; fewer in long grass
  // (hidden in it) and none on bare earth
  if (grBloomOn > 0.5) {
    float dn = lwN(p * 0.075 + 41.0) * 0.65 + lwN(p * 0.23 + 3.0) * 0.35;
    float drift = smoothstep(0.58, 0.8, dn);
    float kind = lwN(p * 0.04 + 77.0);
    vec3 wc = kind < 0.3 ? vec3(0.96, 0.95, 0.9) : kind < 0.55 ? vec3(1.0, 0.8, 0.18) : kind < 0.72 ? vec3(0.92, 0.5, 0.66) : kind < 0.86 ? vec3(0.62, 0.52, 0.92) : vec3(0.98, 0.58, 0.28);
    float open = (1.0 - bare) * (1.0 - fringe * 0.7) * (1.0 - 0.6 * lg);
    #ifdef GR_NO_FLOWERS
    open = 0.0;
    #endif
    vec4 fw = grFlowers(p, 0.45, 0.3, (drift * 0.5 + 0.022) * open, wc, 23.0);
    vec4 fs = grOn > 0.5 ? texture2D(grFlw, (p - grO) / grS) : vec4(0.0);
    vec4 sp = grFlowers(p, 0.3, 0.3, fs.r * 0.35 * (1.0 - bare) * GR_SPILL, grFlwPal[int(fs.g * 7.0 + 0.5)], 37.0);
    // grass in front of the blossoms in longer grass, so they read as in it, not stuck on it
    float flowerCover = mix(1.0, 0.55, lg * smoothstep(0.45, 0.8, tA.x));
    c = mix(c, fw.rgb * vec3(0.96, 0.95, 0.92), fw.a * flowerCover);
    c = mix(c, sp.rgb, sp.a * flowerCover);
  }
  // the earth: the weathered paving's own, so paths and paving share one ground
  vec3 earth = grEarthOn > 0.5 ? mix(vec3(dot(texture2D(grEarth, p / grEarthS).rgb, vec3(0.3, 0.59, 0.11))), texture2D(grEarth, p / grEarthS).rgb, 0.6) * vec3(1.0, 0.88, 0.6) : vec3(0.32, 0.27, 0.18);
  earth *= 0.8 + 0.35 * lwN(p * 2.7 + 2.0);
  c *= 1.0 - 0.2 * fringe;
  c = mix(c, earth, bare);
  // contact shade at the foot of what stands on the lawn
  c *= 1.0 - 0.42 * s.b;
  return c;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// soft shadows on the lawn: a meadow breaks a shadow's edge up in its blades, so the sun's shadow on an upward lawn is
// looked up over a wider disc (grShadowBlur texels) and that disc is nudged by a blade-scale noise in the world, so the
// edge comes out soft and ragged. Paving and everything else keep the sun's own crisp shadow.
// ---------------------------------------------------------------------------------------------------------------
const SOFT_SHADOW_GLSL = `
#if defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
uniform float grShadowBlur;
float grShadow(sampler2DShadow sm, vec2 size, float inten, float bias, float rad, vec4 sc) {
  sc.xyz /= sc.w;
  #ifdef USE_REVERSED_DEPTH_BUFFER
  sc.z -= bias;
  #else
  sc.z += bias;
  #endif
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float up = smoothstep(0.6, 0.85, normalize(vTpNrm).y);
  vec2 tx = vec2(1.0) / size, r = max(rad, mix(rad, grShadowBlur, up)) * tx;
  // the ragged edge: blade-scale wobble, about half the blur
  vec2 q = vTpPos.xz;
  sc.xy += (vec2(lwN(q * 3.3), lwN(q * 3.3 + 17.0)) - 0.5) * grShadowBlur * 0.9 * up * tx;
  float phi = interleavedGradientNoise(gl_FragCoord.xy) * PI2, s = 0.0;
  for (int i = 0; i < 16; i++) s += texture(sm, vec3(sc.xy + vogelDiskSample(i, 16, phi) * r, sc.z));
  return mix(1.0, s / 16.0, inten);
}
#define GR_SHADOW grShadow
#else
#define GR_SHADOW getShadow
#endif
`;
/** Give a lawn material (one with vTpPos, vTpNrm and GROUND_GLSL) the soft, ragged sun shadow. */
export function softLawnShadow(sh: { fragmentShader: string; uniforms: Record<string, unknown> }) {
  sh.uniforms.grShadowBlur = WEATHER.shadowBlur;
  const dir = 'getShadow( directionalShadowMap[ i ]';
  if (!THREE.ShaderChunk.lights_fragment_begin.includes(dir)) return;   // (three changed: keep the stock shadow)
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>\n${SOFT_SHADOW_GLSL}`)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(dir, 'GR_SHADOW( directionalShadowMap[ i ]'));
}

// ---------------------------------------------------------------------------------------------------------------
// margin grass: raised painted fans where height reads (the advisor, 2026-11-27): the grass side of paving and walls, the
// shoulders of worn paths, the foot of what stands on the lawn. One camera-facing card per fan, its foot on the ground,
// coloured by the ground at its root and lit with the ground's up normal, so a fan reads as the lawn standing up at an
// edge, never as a spot. Open lawn gets none: there the painted ground is enough.
// ---------------------------------------------------------------------------------------------------------------
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, y: number) => {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
};
const UPM = 1 / 0.6;   // u per metre (kit-render's M)
const marginMats: (THREE.MeshLambertMaterial | null)[] = [null, null];
/** The edge grass's material; `feet`: the foot grass's (footGrass), each card fading by its own aFade, never pressed flat. */
function marginMaterial(feet = false): THREE.MeshLambertMaterial {
  const have = marginMats[feet ? 1 : 0];
  if (have) return have;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, alphaToCoverage: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GROUND_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 aRoot; attribute vec3 aFan; attribute vec2 aCorner; uniform float grTime, grWind;
      ${PUSH_GLSL}
      varying vec2 vMgUv; varying vec2 vMgRoot; varying float vMgCol; varying float vMgFade;
      ${feet ? 'attribute float aFade;' : ''}
      float mgGust(vec2 p, float t) {
        vec2 W = vec2(0.93, 0.37); float al = dot(p, W), ac = dot(p, vec2(-W.y, W.x));
        float e = 0.42 + 0.3 * sin(al * 0.21 - t * 0.83 + 1.4 * sin(ac * 0.13 + t * 0.11)) + 0.26 * sin(al * 0.078 - t * 0.31 + ac * 0.05 + 1.7)
                + 0.14 * sin(al * 0.47 - t * 1.57 + ac * 0.29);
        e = clamp(e, 0.0, 1.0); return e * e; }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        // aFan: width u, height u, sprite (row * 4 + column; negative: mirrored)
        vec3 mgR = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        mgR = normalize(vec3(mgR.x, 0.0, mgR.z));
        float mgH = aCorner.y * aFan.y, mgB = aCorner.y * aCorner.y * (0.12 + 0.3 * grWind * mgGust(aRoot.xz, grTime)) * aFan.y;
        // its height along the camera's own up (leaning back, away from the eye), so the steep camera sees the whole
        // painted tuft rather than an upright card foreshortened to a streak
        vec3 mgU = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
        // someone walking through bends the tuft away from them and presses it down
        vec3 mgP = grPushAt((modelMatrix * vec4(aRoot, 1.0)).xz);
        ${feet ? 'vMgFade = aFade;' : 'mgH *= 1.0 - 0.55 * mgP.z; vMgFade = 1.0;'}
        vec3 transformed = aRoot + mgR * (aCorner.x * aFan.x + mgB) + mgU * mgH + vec3(mgP.x, 0.0, mgP.y) * aCorner.y * aCorner.y * aFan.y * 0.6;
        float sp = abs(aFan.z); vMgCol = sp;
        vMgUv = vec2(aFan.z < 0.0 ? 0.5 - aCorner.x : 0.5 + aCorner.x, aCorner.y);
        vMgRoot = aRoot.xz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      #define GR_NO_FLOWERS
      ${GROUND_GLSL}
      uniform sampler2D grLawn; uniform float grLawnS;
      varying vec2 vMgUv; varying vec2 vMgRoot; varying float vMgCol; varying float vMgFade;`)
      .replace('#include <map_fragment>', `{
        float sp = floor(vMgCol + 0.5), col = mod(sp, 4.0), row = floor(sp / 4.0);
        // the sprite's own cell, its foot (painted about a tenth up the cell) at the card's foot
        vec2 suv = vec2(vMgUv.x, 0.1 + vMgUv.y * 0.85);
        vec4 tx = texture2D(grTuft, (vec2(col, 3.0 - row) + clamp(suv, 0.01, 0.99)) / 4.0);
        tx.a *= vMgFade;   // (fading out: the tuft thins to its densest blades)
        diffuseColor.a = clamp((tx.a - 0.45) / max(fwidth(tx.a), 0.0001) + 0.5, 0.0, 1.0);
        if (diffuseColor.a < 0.02) discard;
        vec3 g = groundLawn(grLawn, grLawnS, vMgRoot);
        // the ground's colour at its root, lifted toward the tips as the painted blades catch the light
        diffuseColor.rgb = g * mix(0.82, 1.5, tx.r) * mix(0.95, 1.08, vMgUv.y);
      }`);
  };
  m.customProgramCacheKey = () => (feet ? 'foot-grass-1' : 'margin-grass-6');
  return (marginMats[feet ? 1 : 0] = m);
}
/** Raised grass fans along the margins of the last ground map (buildGround first); null where there are none. */
export function marginGrass(): THREE.Mesh | null {
  const F = FIELDS;
  if (!F || !GROUND_U.grTuftOn.value) return null;
  const roots: number[] = [], fans: number[] = [];
  const step = 0.4;   // u: candidate spacing
  // a lawn cell beside q at about q's height (so grass can step over onto flat paving, not up a terrace's face)
  const lawnBeside = (i: number, j: number, q: number) => {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= F.nx || b >= F.ny) continue;
      const k = b * F.nx + a;
      if (F.lawn[k] && Math.abs(F.top[k] - F.top[q]) < 0.1) return true;
    }
    return false;
  };
  for (let y = F.y0; y < F.y0 + F.ny * CELL; y += step) for (let x = F.x0; x < F.x0 + F.nx * CELL; x += step) {
    const jx = x + (hash(x, y) - 0.5) * step, jy = y + (hash(y + 3.1, x) - 0.5) * step;
    const i = Math.floor((jx - F.x0) / CELL), j = Math.floor((jy - F.y0) / CELL);
    if (i < 0 || j < 0 || i >= F.nx || j >= F.ny) continue;
    const q = j * F.nx + i;
    // over the edge: the first strip of flat hard ground beside the lawn, so blades cross the line from both sides
    const over = !F.lawn[q] && lawnBeside(i, j, q);
    if ((!F.lawn[q] && !over) || F.R[q] > 0.35) continue;
    const verge = over || (F.dHard[q] > 0.15 && F.dHard[q] < 1.1);   // the grass side of paving and walls
    const shoulder = F.dWear[q] > -0.1 && F.dWear[q] < 0.7;           // the outer edge of a worn path
    const foot = F.B[q] > 0.05 && F.G[q] > 0.3;                       // round what stands on the lawn (a patch's ring just outside it)
    if (!verge && !shoulder && !foot) continue;
    // broken into irregular runs with gaps (thinner over the edge)
    if (vnoise(jx * 0.55, jy * 0.55) < (over ? 0.55 : foot ? 0.32 : 0.4)) continue;
    if (hash(jx * 1.7, jy * 2.3) < 0.15) continue;
    const tall = Math.max(F.G[q], foot ? 0.6 : 0);
    // about the painted tuft's own proportions (its cell is square, the tuft 0.85 of it high), so it isn't squashed
    const w = 0.5 + 0.3 * hash(jx, jy + 9.0) + 0.25 * tall;
    const h = w * (0.7 + 0.25 * hash(jx + 4.0, jy)) * (verge && !over ? 1.1 : over ? 0.75 : 1);
    // sprite: short fans and clumps on verges, combed long clumps at the foot of things, sparse ones on a path's shoulder
    const row = over ? 3 : shoulder && !verge ? 3 : foot && tall > 0.5 && hash(jx, jy + 2.0) > 0.4 ? 2 : Math.floor(hash(jx + 7.0, jy) * 2);
    const sp = row * 4 + Math.floor(hash(jx + 1.3, jy + 5.1) * 4);
    roots.push(jx, F.top[q] * UPM, jy);
    fans.push(w, h, hash(jx + 2.2, jy) > 0.5 ? sp : -sp - 0.0001);
  }
  // the hems: grass walked round each plant's outline, rooted just outside it, so its blades rise over the plant's foot
  for (const hm of F.hems) {
    const n = Math.max(6, Math.ceil((2 * Math.PI * hm.r) / 0.26));
    for (let k = 0; k < n; k++) {
      const a = ((k + hash(hm.x + k, hm.y) * 0.6) / n) * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
      // further out on the camera's side (+z), where a plant's low leaves spill forward past its outline
      const near = Math.max(0, dy);
      const off = 0.02 + 0.3 * hash(hm.x * 1.3 + k, hm.y + 4.1) + near * (0.3 + 0.2 * hm.tall);
      let t = hm.r + 0.5;
      for (let it = 0; it < 8; it++) t -= hm.sd(hm.x + dx * t, hm.y + dy * t) - off;   // walk in to `off` outside the outline
      const jx = hm.x + dx * t, jy = hm.y + dy * t;
      const i = Math.floor((jx - F.x0) / CELL), j = Math.floor((jy - F.y0) / CELL);
      if (i < 0 || j < 0 || i >= F.nx || j >= F.ny) continue;
      const q = j * F.nx + i;
      if (!F.lawn[q] || F.R[q] > 0.35 || hash(jx * 2.1, jy * 1.3) < 0.12) continue;
      const w = 0.45 + 0.3 * hash(jx + 3.3, jy) + 0.2 * hm.tall;
      const h = w * (0.8 + 0.35 * hash(jx, jy + 6.6)) * (1 + 0.3 * near);
      const row = hash(jx + 5.5, jy) < 0.45 ? 2 : Math.floor(hash(jx + 7.0, jy) * 2);
      const sp = row * 4 + Math.floor(hash(jx + 1.3, jy + 5.1) * 4);
      roots.push(jx, F.top[q] * UPM, jy);
      fans.push(w, h, hash(jx + 2.2, jy) > 0.5 ? sp : -sp - 0.0001);
    }
  }
  const n = roots.length / 3;
  if (!n) return null;
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  quad.setAttribute('aCorner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  quad.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 3));
  quad.setAttribute('aFan', new THREE.InstancedBufferAttribute(new Float32Array(fans), 3));
  quad.instanceCount = n;
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(F.x0 + (F.nx * CELL) / 2, 0, F.y0 + (F.ny * CELL) / 2), Math.hypot(F.nx, F.ny) * CELL);
  const mesh = new THREE.Mesh(quad, marginMaterial());
  mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.raycast = () => undefined;
  mesh.name = `margin-grass (${n})`;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// foot grass: a few tufts round each walker's feet on the lawn, so the soles are a little hidden in the grass. They stand
// on a fixed grid in the world and fade in only near someone's feet, so a wizard walks into grass that stays put rather
// than dragging a clump along. Short on mown lawn, taller in long grass; none on paving or worn paths.
// ---------------------------------------------------------------------------------------------------------------
const FOOT_MAX = 384, FOOT_STEP = 0.2;
let foot: { mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; root: Float32Array; fan: Float32Array; fade: Float32Array } | null = null;
/** The foot grass's mesh (add it to the scene once; setGrassPushers refills it each frame). */
export function footGrass(): THREE.Mesh {
  if (foot) return foot.mesh;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const root = new Float32Array(FOOT_MAX * 3), fan = new Float32Array(FOOT_MAX * 3), fade = new Float32Array(FOOT_MAX);
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aFan', new THREE.InstancedBufferAttribute(fan, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, marginMaterial(true));
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.raycast = () => undefined; mesh.name = 'foot-grass';
  foot = { mesh, geo, root, fan, fade };
  return mesh;
}
function fillFootGrass(list: readonly { x: number; z: number; r: number }[]) {
  const F = FIELDS;
  if (!foot) return;
  let n = 0;
  const seen = new Set<number>();
  if (F && GROUND_U.grTuftOn.value) for (const b of list) {
    // a band just in front of the feet (toward the camera, +z): its tufts rise over the robe's hem and the soles.
    // (Nearer in, they stand inside the robe and are hidden.)
    const rx = b.r * 1.15, rz = b.r * 0.55, cz = b.z + b.r * 0.8;
    for (let gz = Math.floor((cz - rz) / FOOT_STEP); gz <= Math.ceil((cz + rz) / FOOT_STEP); gz++)
      for (let gx = Math.floor((b.x - rx) / FOOT_STEP); gx <= Math.ceil((b.x + rx) / FOOT_STEP); gx++) {
        const key = gz * 100003 + gx;
        if (seen.has(key) || n >= FOOT_MAX) continue;
        const x = (gx + 0.5 + (hash(gx, gz) - 0.5) * 0.8) * FOOT_STEP, z = (gz + 0.5 + (hash(gz + 7.7, gx) - 0.5) * 0.8) * FOOT_STEP;
        const e = Math.hypot((x - b.x) / rx, (z - cz) / rz);
        if (e > 1 || hash(gx * 1.9, gz * 2.7) < 0.3) continue;
        const i = Math.floor((x - F.x0) / CELL), j = Math.floor((z - F.y0) / CELL);
        if (i < 0 || j < 0 || i >= F.nx || j >= F.ny) continue;
        const q = j * F.nx + i;
        if (!F.lawn[q] || F.R[q] > 0.35) continue;
        seen.add(key);
        const long = Math.min(1, F.G[q]), h = (0.4 + 0.25 * long) * (0.85 + 0.4 * hash(gx + 3.1, gz));
        const row = long > 0.5 && hash(gx, gz + 1.7) > 0.4 ? 2 : Math.floor(hash(gx + 5.3, gz) * 2), sp = row * 4 + Math.floor(hash(gx + 1.1, gz + 9.2) * 4);
        foot.root.set([x, F.top[q] * UPM, z], n * 3);
        foot.fan.set([h * 1.25, h, hash(gx + 2.2, gz) > 0.5 ? sp : -sp - 0.0001], n * 3);
        foot.fade[n] = 1 - smooth(0.55, 1, e);
        n++;
      }
  }
  foot.geo.instanceCount = n;
  for (const a of ['aRoot', 'aFan', 'aFade']) (foot.geo.getAttribute(a) as THREE.InstancedBufferAttribute).needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------------------------
// clouds: soft shadows drifting over the whole level, on every lit material
// ---------------------------------------------------------------------------------------------------------------
const CLOUD_GLSL = `
uniform float clOn, clT, clCover, clDark, clSize;
float clH(vec2 q) { return fract(sin(dot(q, vec2(41.3, 289.1))) * 15731.7431); }
float clN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(clH(i), clH(i + vec2(1.0, 0.0)), f.x), mix(clH(i + vec2(0.0, 1.0)), clH(i + vec2(1.0, 1.0)), f.x), f.y); }
// 0 in sun to 1 under a cloud, at a world point (u)
float cloudShade(vec3 wp) {
  vec2 p = wp.xz / (19.0 * clSize) - vec2(0.93, 0.37) * clT * 0.08 / clSize;
  float n = clN(p) * 0.55 + clN(p * 2.07 + 3.7) * 0.3 + clN(p * 4.3 + 9.1) * 0.15;
  float o = (0.5 - clCover) * 0.7;   // cover 0.5: the tuned band; 0 clear, 1 overcast
  return smoothstep(0.38 + o, 0.54 + o, n) * clOn;
}
`;
const cloudy = new WeakSet<THREE.Material>();
/** Let every lit material under root take the clouds' shadow on its sunlight (after any shader change it already makes). */
export function cloudify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (cloudy.has(m)) continue;
      if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshLambertMaterial).isMeshLambertMaterial && !(m as THREE.MeshPhongMaterial).isMeshPhongMaterial) continue;
      cloudy.add(m);
      const prev = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        Object.assign(sh.uniforms, CLOUD_U);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${CLOUD_GLSL}`)
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            { // a cloud takes most of the sun and some of the sky, and leaves what remains cooler
              vec3 clW = (inverse(viewMatrix) * vec4(-vViewPosition, 1.0)).xyz; float clS = cloudShade(clW);
              reflectedLight.directDiffuse *= mix(vec3(1.0), pow(vec3(0.34, 0.41, 0.36), vec3(clDark)), clS); reflectedLight.directSpecular *= 1.0 - min(1.0, 0.8 * clDark) * clS;
              reflectedLight.indirectDiffuse *= mix(vec3(1.0), pow(vec3(0.8, 0.86, 0.76), vec3(clDark)), clS); }`);
      };
      m.customProgramCacheKey = () => `${key()}|cl`;
      m.needsUpdate = true;
    }
  });
}
