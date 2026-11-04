/**
 * Rock walls, ported from tools/art-pixel-hd/walls.js (Battlefield pass 3). A sim wall segment
 * is a row of thick slabs standing on a line on the ground. Each slab is painted once per state
 * into a small cached canvas by a tiny raycaster: for every sprite pixel it walks down the view
 * ray (screen y = ground y - z) and takes the first solid point, so tops, front faces, the
 * visible end face, damage notches and rubble come out with correct occlusion on the pixel grid.
 *
 * States: damage 0..4 (whole, cracked, a chunk out of the top, half height, rubble) and a rise
 * fraction (quantised to RISE_STEPS). Materials: raised earth (turf on top) and frost-coated
 * stone (Shield + Earth + Cold). Light is the pixel-art cheat: tops brightest, faces turned west
 * (toward the upper-left light) brighter than faces turned east.
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import { FY, clamp, rand } from './util';

export const SLAB_W = 60, SLAB_H = 60, SLAB_OX = 30, SLAB_OY = 46;
export const RISE_STEPS = 4;
const OUTLINE = X.hex('#120e1a');
type RGB = [number, number, number];
const MAT: Record<string, { rock: RGB[]; turf?: RGB[]; rime?: RGB[] }> = {
  stone: {
    rock: ['#e4cfac', '#c8ab86', '#a88d6c', '#8a7156', '#6c5744', '#503f33', '#362a23', '#221a16'].map(X.hex),
    turf: ['#7ca85a', '#5e8a48', '#46703a', '#2e4e2a'].map(X.hex),
  },
  frost: {
    rock: ['#bcc0c8', '#9da2ae', '#81868f', '#686c76', '#52555f', '#3d3f48', '#2b2c34', '#1c1d23'].map(X.hex),
    rime: ['#ffffff', '#e6f8ff', '#c4ecfa', '#98d8f0', '#68bce2', '#4090c4', '#2a6a9e'].map(X.hex),
  },
};

/** Smooth value noise in [0, 1) (bilinear between hashed lattice points). */
export function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = rand(x0, y0, seed), b = rand(x0 + 1, y0, seed), c = rand(x0, y0 + 1, seed), d = rand(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface WallSpec {
  /** Ends on the ground, field px. */
  a: [number, number]; b: [number, number];
  n: number; H: number; T: number; mat: 'stone' | 'frost'; seed: number;
  /** Outline the two ends (no neighbouring wall joins there). */
  endA: boolean; endB: boolean;
}
interface Slab { i: number; cx: number; cy: number; U0: number; H: number; tilt: number; Lh: number; Th: number; notch: number }
export interface WallGeom { du: [number, number]; nv: [number, number]; L: number; slabs: Slab[]; seed: number }

export function wallGeom(spec: WallSpec): WallGeom {
  const A = [spec.a[0], spec.a[1] / FY], B = [spec.b[0], spec.b[1] / FY];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, du: [number, number] = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  let nv: [number, number] = [-du[1], du[0]]; if (nv[1] < 0) nv = [-nv[0], -nv[1]]; // the side facing the camera
  const L = len / spec.n, seed = spec.seed;
  const slabs: Slab[] = [];
  for (let i = 0; i < spec.n; i++) {
    const cu = (i + 0.5) * L, c = [A[0] + du[0] * cu, A[1] + du[1] * cu];
    slabs.push({
      i, cx: c[0], cy: c[1] * FY, U0: i * L,
      H: spec.H + Math.round((rand(i, 1, seed) - 0.5) * 4), tilt: (rand(i, 2, seed) - 0.5) * 4,
      Lh: L / 2 + 1.4, Th: spec.T / 2 + (rand(i, 3, seed) - 0.5) * 1.2, notch: (rand(i, 4, seed) - 0.5) * L * 0.5,
    });
  }
  return { du, nv, L, slabs, seed };
}

/** A point on the camera-facing side of slab i, at along-offset u and height z (field px). */
export function facePoint(g: WallGeom, i: number, u: number, z: number): [number, number] {
  const s = g.slabs[i], v = s.Th;
  return [s.cx + g.du[0] * u + g.nv[0] * v, s.cy + (g.du[1] * u + g.nv[1] * v) * FY - z];
}

const jag = (k: number, i: number, s: number) => rand(Math.floor(k), i, s) - 0.5;
function heightFn(g: WallGeom, s: Slab, st: number, rise: number): (u: number, v: number) => [number, number] {
  const H = s.H, i = s.i, sd = g.seed;
  const rub: [number, number, number, number][] = [];
  if (st >= 2) for (let k = 0; k < st * 3; k++) rub.push([(rand(i, k, sd + 50) - 0.5) * s.Lh * 2.2, s.Th + 0.5 + rand(i, k, sd + 51) * (st >= 4 ? 6 : 3.5) * (rand(i, k, sd + 54) < 0.25 ? -1.6 : 1), 1.2 + rand(i, k, sd + 52) * 1.6, 1 + rand(i, k, sd + 53) * (st >= 4 ? 3.5 : 2.2)]);
  return (u, v) => {
    let top = -1, cut = 0;
    const ju = Math.sin(v * 1.7 + i * 3) * 0.6, jv = Math.sin(u * 1.3 + i * 5) * 0.5;
    if (Math.abs(u) <= s.Lh + ju && Math.abs(v) <= s.Th + jv) {
      top = H + s.tilt * (u / s.Lh) - (Math.abs(v) > s.Th - 1.1 + jv ? 1 : 0) - (Math.abs(u) > s.Lh - 1.1 + ju ? 1 : 0);
      top -= Math.max(0, jag(u * 0.7 + v * 0.3 + 20, i, sd + 7)) * 1.2;
      let lim = top;
      if (st >= 2) {
        const w = s.Lh * 0.55, d = Math.abs(u - s.notch) / w;
        if (d < 1) lim = Math.min(lim, top - H * (st >= 3 ? 0.22 : 0.34) * (1 - d * d) - jag(u * 0.9 + v, i, sd + 8) * 2.4);
      }
      if (st === 3) lim = Math.min(lim, H * 0.55 + jag(u * 0.6, i, sd + 9) * 4 + jag(u * 1.7 + v, i, sd + 10) * 1.5);
      if (st >= 4) lim = Math.min(lim, H * 0.22 + jag(u * 0.8, i, sd + 11) * 3.6 + jag(u * 1.9 + v * 1.3, i, sd + 12) * 1.6);
      cut = top - lim; top = lim;
    }
    for (const [ru, rv, rr, rh] of rub) {
      const d = ((u - ru) ** 2 + (v - rv) ** 2) / (rr * rr);
      if (d < 1) { const h = rh * Math.sqrt(1 - d); if (h > top) { top = h; cut = -1; } }
    }
    return [top * rise, cut];
  };
}

function facet(x: number, y: number, cw: number, ch: number, sd: number): { edge: number; id: number; ux: number; uy: number } {
  const gx0 = Math.floor(x / cw), gy0 = Math.floor(y / ch);
  let d1 = 1e9, d2 = 1e9, id = 0, ux = 0, uy = 0;
  for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const gx = gx0 + k, gy = gy0 + j, px = (gx + 0.15 + rand(gx, gy, sd) * 0.7) * cw, py = (gy + 0.15 + rand(gx, gy, sd + 1) * 0.7) * ch;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < d1) { d2 = d1; d1 = d; id = gx * 7919 + gy; ux = x - px; uy = y - py; } else if (d < d2) d2 = d;
  }
  return { edge: Math.sqrt(d2) - Math.sqrt(d1), id, ux, uy };
}
function crackSet(s: Slab, st: number, sd: number): { path: number[]; len: number }[] {
  const out: { path: number[]; len: number }[] = [];
  const n = [0, 2, 3, 4, 3][st];
  for (let k = 0; k < n; k++) {
    const u0 = (rand(s.i, k, sd + 60) - 0.5) * s.Lh * 1.6, len = s.H * (0.35 + rand(s.i, k, sd + 61) * 0.45) * (st >= 3 ? 1.2 : 1);
    const path: number[] = [];
    let u = u0;
    for (let z = 0; z <= s.H + 2; z++) { if (rand(s.i, k * 97 + z, sd + 62) < 0.42) u += rand(s.i, k * 97 + z, sd + 63) < 0.5 ? -1 : 1; path.push(u); }
    out.push({ path, len });
  }
  return out;
}

/** Paint slab i of a wall in state st at rise (0..1] into a fresh canvas. */
export function paintSlab(spec: WallSpec, g: WallGeom, i: number, st: number, rise: number): HTMLCanvasElement {
  const s = g.slabs[i], M = MAT[spec.mat], R = M.rock, isFrost = spec.mat === 'frost', sd = g.seed + (isFrost ? 300 : 0), fr = 0.7;
  const hf = heightFn(g, s, st, rise), cracks = crackSet(s, st, sd);
  const { c: cv, x: cx } = X.canvas(SLAB_W, SLAB_H);
  const img = cx.createImageData(SLAB_W, SLAB_H), d = img.data;
  const filled = new Uint8Array(SLAB_W * SLAB_H);
  const zMax = s.H * rise + 3;
  const toUV = (gx: number, gy: number): [number, number] => { const wy = gy / FY; return [gx * g.du[0] + wy * g.du[1], gx * g.nv[0] + wy * g.nv[1]]; };
  const set = (x: number, y: number, c: RGB) => { const o = (y * SLAB_W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; filled[y * SLAB_W + x] = 1; };
  const ex = Math.ceil(s.Lh * Math.abs(g.du[0]) + (s.Th + 8) * Math.abs(g.nv[0]) + 4), ey = (s.Lh * Math.abs(g.du[1]) + (s.Th + 8) * Math.abs(g.nv[1])) * FY;
  const bx0 = Math.max(0, SLAB_OX - ex), bx1 = Math.min(SLAB_W - 1, SLAB_OX + ex), by0 = Math.max(0, Math.floor(SLAB_OY - ey - zMax - 2)), by1 = Math.min(SLAB_H - 1, Math.ceil(SLAB_OY + ey + 2));
  for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
    const sx = px - SLAB_OX, sy = py - SLAB_OY;
    let hz = -1, hu = 0, hv = 0, hh = 0, hcut = 0, face = '';
    for (let z = Math.ceil(zMax); z >= 0; z--) {
      const [u, v] = toUV(sx, sy + z);
      const [h, cut] = hf(u, v);
      if (h < 0 || z > h) continue;
      face = cut < 0 ? 'rubble' : 'top';
      if (cut >= 0 && z < h - 1.0) {
        const [u2, v2] = toUV(sx, sy + z + 1.2);
        face = Math.abs(u2) > s.Lh + 0.3 && Math.abs(v2) <= s.Th + 0.6 ? 'end' : 'front';
      }
      hz = z; hu = u; hv = v; hh = h; hcut = cut;
      break;
    }
    if (hz < 0) continue;
    const z = hz, u = hu, v = hv, h = hh, cut = hcut, U = s.U0 + u, Hs = Math.max(1, s.H * rise);
    let k: number, frosted = false, col: RGB | null = null;
    if (face === 'top' || face === 'rubble') {
      const f = facet(U * 1.1, v * 1.3, 6, 5, sd + 20);
      k = face === 'rubble' ? 2.6 + rand(f.id, 3, sd) * 1.6 - (u < 0 ? 0.4 : 0) : (isFrost ? 1.25 : 1.7) + (rand(f.id, 4, sd) - 0.5) * 1.0 + (f.ux + f.uy) * 0.1;
      if (face === 'top' && v > s.Th - 1.6) k = 0.45;
      if (f.edge < 0.9) k += 1.6;
      if (cut > 0.6 && face === 'top') k = f.edge < 0.9 ? 2.2 : 0.9 + rand(f.id, 6, sd) * 0.6;
      if (!isFrost && face === 'top' && cut <= 0.6 && vnoise(U * 0.32, v * 0.45 + i * 3, 77) > 0.6) col = M.turf![v > s.Th - 1.6 ? 0 : clamp(Math.round(1 + rand(Math.round(U), Math.round(v), 78) * 1.4), 0, 3)];
      if (isFrost && cut <= 0.6 && face === 'top' && vnoise(U * 0.2, v * 0.3, 79) + (v > s.Th - 2 ? -0.3 : 0) < fr * 0.6) frosted = true;
      if (isFrost && face === 'rubble' && rand(Math.round(U), Math.round(v), 80) < fr * 0.5) frosted = true;
    } else {
      const nx = face === 'front' ? g.nv[0] : (u > 0 ? g.du[0] : -g.du[0]);
      const f = facet(U * 1.0, z * 1.25 + i * 3, isFrost ? 7 : 9, isFrost ? 6 : 7, sd + 30);
      k = 2.9 + nx * 1.3 + (1 - z / Hs) * 0.9 + (rand(f.id, 5, sd) - 0.5) * (isFrost ? 0.7 : 1.1) + (f.ux * 0.5 + f.uy) * (isFrost ? 0.05 : 0.1);
      if (face === 'end') k += 0.5;
      if (f.edge < 0.85) k = 5.6;
      else if (f.edge < 1.7 && f.uy < 0) k -= 0.7;
      if (!isFrost && Math.floor(z / 4 + Math.sin(U * 0.21) * 0.6) % 3 === 0) k += 0.4;
      if (Math.abs(u) > s.Lh - 0.8) k += 1.4;
      if (z < 1) k += 1.2;
      if (!isFrost && face === 'front' && h - z < 2.6 && cut <= 0.6 && vnoise(U * 0.32, s.Th * 0.45 + i * 3, 77) > 0.5 && rand(Math.round(U), 5, 81) < 0.8) col = M.turf![h - z < 1.3 ? 1 : 3];
      for (const c of cracks) { const zz = Math.round(s.H - z); if (zz >= 0 && zz < c.path.length && zz < c.len && Math.abs(u - c.path[zz]) < 0.55) { k = 7; col = null; } }
      if (isFrost) {
        const fm = vnoise(U * 0.17, z * 0.22 + i * 0.7, 83) * 0.85 + (z / Hs) * 0.4 - (h - z < 1.6 ? 0.6 : 0);
        if (fm < fr * 0.52 && k < 6.5) frosted = true;
        if (face === 'front' && cut <= 0.6 && h - z < 1 + rand(Math.round(U), 7, 84) * 4.5 && rand(Math.round(U), 6, 84) < 0.4) { frosted = true; k = h - z > 2.5 ? 2.2 : 0.8; }
      }
    }
    if (frosted) col = M.rime![face === 'top' || face === 'rubble' ? (k < 0.8 ? 0 : k < 2.4 ? 1 : 2) : (k < 1.6 ? 1 : k < 3.6 ? 2 : k < 5 ? 3 : 4)];
    set(px, py, col ?? R[clamp(Math.round(k), 0, 7)]);
  }
  // a 1 px outline round the slab; inner slabs get no side outline, so neighbours read as one wall
  const lo = (i === 0) === (g.du[0] > 0);
  const endL = (i === 0 && spec.endA) || (i === spec.n - 1 && spec.endB);
  const sideL = st >= 3 || (endL && lo), sideR = st >= 3 || (endL && !lo);
  for (let y = 0; y < SLAB_H; y++) for (let x = 0; x < SLAB_W; x++) {
    if (filled[y * SLAB_W + x]) continue;
    if ((sideR && x > 0 && filled[y * SLAB_W + x - 1]) || (sideL && x < SLAB_W - 1 && filled[y * SLAB_W + x + 1]) || (y > 0 && filled[(y - 1) * SLAB_W + x]) || (y < SLAB_H - 1 && filled[(y + 1) * SLAB_W + x])) {
      const o = (y * SLAB_W + x) * 4; d[o] = OUTLINE[0]; d[o + 1] = OUTLINE[1]; d[o + 2] = OUTLINE[2]; d[o + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return cv;
}

/** Slab textures by state. Paints are budgeted per frame; a miss falls back to the nearest painted state. */
export class SlabCache {
  private map = new Map<string, Texture | null>();
  private budget = 0;
  begin(n = 10): void { this.budget = n; }
  get(key: string, paint: () => HTMLCanvasElement | null, force = false): Texture | null | undefined {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    if (!force && this.budget <= 0) return undefined;
    this.budget--;
    const c = paint();
    let tex: Texture | null = null;
    if (c) { tex = Texture.from(c); tex.source.scaleMode = 'nearest'; }
    this.map.set(key, tex);
    return tex;
  }
  /** Drop every entry whose key starts with a prefix that is no longer live. */
  prune(live: Set<string>): void {
    for (const [k, tex] of this.map) {
      const p = k.slice(0, k.indexOf('|'));
      if (!live.has(p)) { tex?.destroy(true); this.map.delete(k); }
    }
  }
  get size(): number { return this.map.size; }
}
