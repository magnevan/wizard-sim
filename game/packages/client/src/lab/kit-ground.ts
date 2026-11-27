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
import { FOLIAGE_TIME } from './foliage';

type Pt = number[];
type GFloor = { h: number; mat: string; polys: number[][][][] };
type GInst = { p: string; x: number; y: number; rot: number; scale?: number; pts?: number[][]; w?: number };
type GPiece = { class?: string; shape?: string; footprint?: [number, number]; height?: number; grow?: { kind?: string } };

/** The ground map's cell (u). */
const CELL = 0.5;
/** Shared by every ground material: the map, where it lies, and the wind's time. */
export const GROUND_U = {
  grOn: { value: 0 }, grMap: { value: null as THREE.Texture | null },
  grO: { value: new THREE.Vector2() }, grS: { value: new THREE.Vector2(1, 1) }, grTime: FOLIAGE_TIME,
  /** The painted tufts (textures/foliage-tufts.png: a 4 x 4 sheet of grey tufts, rows short, clumps, long, sparse) and
   * the bare earth worn paths show (the weathered paving's own tile, and its size in u); kit-render sets them. */
  grTuft: { value: null as THREE.Texture | null }, grTuftOn: { value: 0 },
  grEarth: { value: null as THREE.Texture | null }, grEarthS: { value: 3 }, grEarthOn: { value: 0 },
};
/** Hand the ground its painted tufts and its earth tile (either may be missing: the ground then does without). */
export function setGroundArt(tuft: THREE.Texture | undefined, earth: THREE.Texture | undefined, earthTile: number) {
  GROUND_U.grTuft.value = tuft ?? null; GROUND_U.grTuftOn.value = tuft ? 1 : 0;
  GROUND_U.grEarth.value = earth ?? null; GROUND_U.grEarthS.value = earthTile; GROUND_U.grEarthOn.value = earth ? 1 : 0;
}
/** The clouds: on (1) or off, and their time (the foliage's, so a picture at &t= is repeatable). */
export const CLOUD_U = { clOn: { value: 1 }, clT: FOLIAGE_TIME };

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
  const standing: { it: GInst; k: GPiece; sd: (x: number, y: number) => number; r: number }[] = [];
  for (const it of instances) {
    const k = piece(it.p);
    if (!k || !/^(setpiece|dress)\./.test(it.p)) continue;
    const g = k.grow?.kind;
    if (g === 'patch' && it.p === 'setpiece.grass-long') {   // a drift of long grass: painted into the ground
      const s = it.scale ?? 1, r = ((k.footprint?.[0] ?? 3) * s) / 2 * 1.35;
      each(it, r + 1, (q, x, y) => { G[q] = Math.max(G[q], 1 - smooth(r * 0.55, r, Math.hypot(x - it.x, y - it.y))); });
      continue;
    }
    if (g === 'patch' || g === 'field') continue;          // low drifts and worked fields: no ring
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
      R[q] = Math.max(R[q], 1 - smooth(-w * 0.3, w * 0.25, d - w / 2));
    }
  }
  // long grass: away from hard ground and paths
  for (let q = 0; q < N; q++) {
    if (!lawn[q]) continue;
    G[q] = Math.max(G[q], smooth(7, 12, dHard[q]) * smooth(2.5, 6, dWear[q]));
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
  const px = new Uint8Array(N * 4);
  for (let q = 0; q < N; q++) {
    px[q * 4] = Math.round(R[q] * 255); px[q * 4 + 1] = Math.round(Math.min(1, G[q]) * 255);
    px[q * 4 + 2] = Math.round(Math.min(1, B[q]) * 255); px[q * 4 + 3] = Math.round(Math.min(1, dHard[q] / 8) * 255);
  }
  const t = new THREE.DataTexture(px, nx, ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  GROUND_U.grMap.value?.dispose();
  GROUND_U.grMap.value = t; GROUND_U.grO.value.set(x0, y0); GROUND_U.grS.value.set(nx * CELL, ny * CELL); GROUND_U.grOn.value = 1;
}

// ---------------------------------------------------------------------------------------------------------------
// the shader
// ---------------------------------------------------------------------------------------------------------------
/**
 * GLSL for natural ground: the uniforms, hex tiling, tufts, the wind, and lawnVary (the meadow's broad drift, as
 * before) and groundLawn (all of it together). A material using it gets GROUND_U in its uniforms.
 */
export const GROUND_GLSL = `
uniform float grOn, grTime, grTuftOn, grEarthS, grEarthOn; uniform sampler2D grMap, grTuft, grEarth; uniform vec2 grO, grS;
float lwH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
vec2 lwH2(vec2 q) { return fract(sin(vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)))) * 43758.5453); }
float lwN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lwH(i), lwH(i + vec2(1.0, 0.0)), f.x), mix(lwH(i + vec2(0.0, 1.0)), lwH(i + vec2(1.0, 1.0)), f.x), f.y); }
// The meadow's broad change over the ground (2026-11-27): a little less saturated, drifting between straw-warm and cool
// blue-green over about 20 u, with lusher darker patches and a soft mottle, so a large lawn never reads as one colour.
vec3 lawnVary(vec3 c, vec2 p) {
  float big = lwN(p * 0.045) * 0.6 + lwN(p * 0.11 + 7.3) * 0.4, mid = lwN(p * 0.17 + 3.1) * 0.7 + lwN(p * 0.5 + 9.0) * 0.3;
  c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.78);
  c *= mix(vec3(0.8, 0.95, 1.0), vec3(1.18, 1.05, 0.7), smoothstep(0.28, 0.78, big));
  c *= mix(vec3(1.0), vec3(0.66, 0.82, 0.7), smoothstep(0.48, 0.8, mid));
  return c * (0.84 + 0.3 * lwN(p * 0.8 + 1.7));
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
vec2 grBomb(vec2 p, float cell, float row0, float rows, float size, float dens, float seed) {
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
    vec2 uv = vec2(0.5 + d.x * fl, 0.1 - d.y * 0.72);   // its foot at the cell's point, the blades rising over the ground behind it
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float row = row0 + floor(lwH(c + seed + 2.7) * rows), col = floor(lwH(c + seed + 6.3) * 4.0);
    vec2 cuv = (vec2(col, 3.0 - row) + clamp(uv, 0.01, 0.99)) / 4.0;
    vec4 tx = textureGrad(grTuft, cuv, gx * fl / sc / 4.0, gy / sc / 4.0 * 0.72);
    acc = vec2(mix(acc.x, tx.r, tx.a), acc.y + tx.a * (1.0 - acc.y));
  }
  return acc;
}
// all of it: the lawn's colour at p (u) from its tile t (tile u across)
vec3 groundLawn(sampler2D t, float tile, vec2 p) {
  vec3 c = lawnVary(grHex(t, p / tile), p);
  vec4 s = grOn > 0.5 ? texture2D(grMap, (p - grO) / grS) : vec4(0.0, 0.0, 0.0, 1.0);
  float n1 = lwN(p * 0.45 + 4.0);
  float lg = smoothstep(0.15, 0.85, s.g + (n1 - 0.5) * 0.6 * s.g);
  // the concept's grass: olive and warm yellow-green, not lime
  c *= vec3(1.06, 1.0, 0.78);
  vec2 W = vec2(0.93, 0.37), q = vec2(dot(p, W), dot(p, vec2(-W.y, W.x)));
  // a soft mottle at clump scale (the cells read as scales if pushed harder)
  vec2 tA = grTufts(p / 0.62);
  c *= mix(0.9, 1.06, tA.x) * mix(0.95, 1.05, tA.y);
  // worn to earth along paths: ragged where the grass breaks into it
  float wn = s.r + (lwN(p * 1.3) - 0.5) * 0.5 + (lwN(p * 4.1 + 7.0) - 0.5) * 0.3 + (tA.x - 0.5) * 0.3;
  float bare = smoothstep(0.5, 0.66, wn), fringe = smoothstep(0.12, 0.5, wn) * (1.0 - bare);
  // painted tufts: short lawn everywhere, big combed clumps in long grass, sparse ones at a path's fringe; none on bare earth
  if (grTuftOn > 0.5) {
    vec2 b1 = grBomb(p, 0.5, 0.0, 2.0, 0.85, 0.92 * (1.0 - lg * 0.6) * (1.0 - bare), 1.0);
    vec2 b2 = grBomb(p, 0.7, 2.0, 1.0, 1.3, lg * 0.95 * (1.0 - bare), 7.0);
    vec2 b3 = grBomb(p, 0.5, 3.0, 1.0, 0.7, fringe * 0.9, 13.0);
    vec2 b = b1;
    b = vec2(mix(b.x, b2.x, b2.y), b.y + b2.y * (1.0 - b.y));
    b = vec2(mix(b.x, b3.x, b3.y), b.y + b3.y * (1.0 - b.y));
    // between tufts the ground is the darker underside of the lawn; a tuft takes the lawn's colour at its own value
    c *= mix(0.6, mix(0.5, 1.34, b.x * b.x), b.y);
  }
  // long grass: paler and warmer toward straw, and a sheen rolling across it in the gusts
  c = mix(c, c * vec3(1.18, 1.1, 0.74), lg * 0.5);
  float comb = lwN(vec2(q.x * 0.3, q.y * 2.4));
  c += vec3(0.12, 0.11, 0.05) * lg * grGust(p, grTime) * smoothstep(0.35, 0.8, comb);
  // the earth: the weathered paving's own, so paths and paving share one ground
  vec3 earth = grEarthOn > 0.5 ? texture2D(grEarth, p / grEarthS).rgb * vec3(0.78, 0.66, 0.56) : vec3(0.36, 0.2, 0.09);
  earth *= 0.8 + 0.35 * lwN(p * 2.7 + 2.0);
  c *= 1.0 - 0.2 * fringe;
  c = mix(c, earth, bare);
  // contact shade at the foot of what stands on the lawn
  c *= 1.0 - 0.42 * s.b;
  return c;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// clouds: soft shadows drifting over the whole level, on every lit material
// ---------------------------------------------------------------------------------------------------------------
const CLOUD_GLSL = `
uniform float clOn, clT;
float clH(vec2 q) { return fract(sin(dot(q, vec2(41.3, 289.1))) * 15731.7431); }
float clN(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(clH(i), clH(i + vec2(1.0, 0.0)), f.x), mix(clH(i + vec2(0.0, 1.0)), clH(i + vec2(1.0, 1.0)), f.x), f.y); }
// 0 in sun to 1 under a cloud, at a world point (u)
float cloudShade(vec3 wp) {
  vec2 p = wp.xz / 13.0 - vec2(0.93, 0.37) * clT * 0.08;
  float n = clN(p) * 0.55 + clN(p * 2.07 + 3.7) * 0.3 + clN(p * 4.3 + 9.1) * 0.15;
  return smoothstep(0.44, 0.6, n) * clOn;
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
              reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(0.3, 0.34, 0.42), clS); reflectedLight.directSpecular *= 1.0 - 0.8 * clS;
              reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.78, 0.84, 0.98), clS); }`);
      };
      m.customProgramCacheKey = () => `${key()}|cl`;
      m.needsUpdate = true;
    }
  });
}
