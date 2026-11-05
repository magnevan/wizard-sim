/**
 * The arena floor, painted once: the Battlefield's flagstone plaza (pass 4: slabs seen at the
 * 3/4 camera, a light top face, two rows of darker front edge, the dark joint to the next
 * slab, the east side a shade darker, mixed sizes) laid over the arena, a kerb of larger
 * stones round it whose south side shows its front face, and outside it the plaza's ruined
 * rim breaking up into grass, dirt, flowers and pebbles.
 *
 * The dusk light of the Battlefield's light map is baked in: neutral-blue in the middle,
 * darker toward the edges. Lights from spells are added on top each frame (art/lights.ts).
 */
import { Texture } from 'pixi.js';
import { FY, PPU } from '../camera';
import * as X from './px';
import { clamp, lerp, rand } from './util';

/**
 * Margin round the arena, world units: for an arena that fits the view, enough to fill a 1080p view
 * at 4x and 1280x800 at 2x (the camera sits a little low); one the camera pans over shows at most
 * a few units past its edge (camera.ts clamps), so it needs less.
 */
const marginFor = (aw: number): number => (aw > 30 ? 14 : 19);
/** The floor texture's layout for the current world (set by floorTexture). */
export const FLOOR = { OX: 0, OY: 0, W: 0, H: 0 };

/**
 * How ruined the paving is at a world point, 0 (whole) to about 0.5: survive's big arena is
 * whole in the keep, on the causeways and in the gate funnels' mouths, and breaks up across the
 * field between them, so the zones read from the floor too.
 */
export type Ruin = (x: number, y: number) => number;
export const surviveRuin: Ruin = (x, y) => {
  const keep = Math.max(Math.abs(x) - 8.5, (Math.abs(y) - 6) * 1.4, (Math.abs(x) + Math.abs(y) - 12.6) * 0.8);
  const causeway = Math.max(Math.abs(y) - 2.6, 11 - Math.abs(x), Math.abs(x) - 21);
  const near = Math.min(keep, causeway);
  return clamp((near - 0.6) / 7, 0, 0.5);
};

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(rand(xi, yi, s), rand(xi + 1, yi, s), u), lerp(rand(xi, yi + 1, s), rand(xi + 1, yi + 1, s), u), v);
}
const fbm = (x: number, y: number, s: number) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15;

const G = ['#24402f', '#2c4b36', '#35573c', '#3f6443', '#4b724a', '#5a8352'].map(X.hex);
const D = ['#463628', '#554232', '#66503c', '#7a6248', '#8e7656'].map(X.hex);
const F = ['#353e34', '#3e483c', '#4a5446', '#58614f', '#67705c'].map(X.hex); // old flagstones, mossy (top faces)
const FE = ['#1e231f', '#2a302a'].map(X.hex); // their front edges
const JOINT = X.hex('#181c1a');
const KB = ['#8a8c80', '#74786c', '#62665a', '#4c5046', '#363a32', '#22261f'].map(X.hex); // kerb stones

/** Flagstones: 2 x 2 blocks of 14 x 8 px cells, each block split one of five ways; alternate block rows shift half a block. */
const CW = 14, CHT = 8;
function flagstone(wx: number, wy: number) {
  const by = Math.floor(wy / (CHT * 2)), sx = wx + (by & 1) * CW, bx = Math.floor(sx / (CW * 2));
  const cx = Math.floor(sx / CW) - bx * 2, cy = Math.floor(wy / CHT) - by * 2;
  const p = Math.floor(rand(bx, by, 25) * 5), X0 = bx * CW * 2 - (by & 1) * CW, Y0 = by * CHT * 2;
  const Rr = p === 0 ? [0, 0, 2, 2] : p === 1 ? [0, cy, 2, 1] : p === 2 ? [cx, 0, 1, 2] : p === 3 ? (cy === 0 ? [0, 0, 2, 1] : [cx, 1, 1, 1]) : [cx, cy, 1, 1];
  const x0 = Math.round(X0 + Rr[0] * CW), y0 = Math.round(Y0 + Rr[1] * CHT), x1 = Math.round(X0 + (Rr[0] + Rr[2]) * CW), y1 = Math.round(Y0 + (Rr[1] + Rr[3]) * CHT);
  const id = bx * 131 + by * 977 + Rr[0] * 7 + Rr[1] * 3 + p;
  return { id, x0, y0, w: x1 - x0, h: y1 - y0, crack: rand(id, 8) < 0.22 ? (rand(id, 10) - 0.5) * 1.6 : 0 };
}

/** One slab pixel at (lx, ly) inside slab st; pz 0..1 how ruined the spot is. Returns null where the slab is gone. */
function slabPixel(wx: number, wy: number, st: ReturnType<typeof flagstone>, pz: number, under: number[]): number[] | null {
  const lx = wx - st.x0, ly = wy - st.y0;
  if (rand(st.id, 7, 21) <= pz * 1.1 + (pz > 0 ? 0.3 : -1)) return null;
  const sunk = rand(st.id, 11, 26) < 0.18; // a few slabs sit lower: a thinner edge
  const edge = sunk ? 1 : 2;
  if (lx === 0 || ly === 0) return rand(wx, wy, 27) < 0.25 * (1 + pz) ? [under[0] * 0.6, under[1] * 0.7, under[2] * 0.6] : JOINT; // joint, a little grass in it
  if (ly >= st.h - edge) return FE[ly === st.h - 1 ? 0 : 1]; // front edge
  let sh = Math.floor(rand(st.id, 3, 22) * 2) + 2.2 - (sunk ? 0.6 : 0);
  if (ly === 1) sh += 1; // lit far lip
  else if (lx === st.w - 1) sh -= 1; // east side
  else if (lx === 1) sh += 0.5;
  sh += (vnoise(wx * 0.3, wy * 0.5, 24) - 0.5) * 0.8;
  let col = F[clamp(Math.round(sh), 0, 4)];
  // a crack across some slabs; moss creeping in from the joints
  if (st.crack && Math.abs((lx - st.w * 0.5) * st.crack * 0.6 - (ly - st.h * 0.5)) < 0.5 && rand(st.id, 9) < 0.95) col = F[0];
  if ((lx <= 2 || ly <= 1) && rand(wx, wy, 23) < 0.12 + 0.3 * pz) col = G[2];
  else if (rand(wx, wy, 23) < 0.025) col = G[2];
  return col;
}

/** Paints the floor for an arena of aw x ah world units (ruin: how broken the paving is where, for survive). */
export function floorTexture(aw: number, ah: number, ruin?: Ruin): Texture {
  const M = marginFor(aw);
  FLOOR.OX = (aw / 2 + M) * PPU; FLOOR.OY = Math.ceil((ah / 2 + M) * PPU * FY);
  FLOOR.W = (aw + 2 * M) * PPU; FLOOR.H = Math.ceil((ah / 2 + M) * PPU * FY) * 2;
  const { W, H, OX, OY } = FLOOR;
  const { c, x: g } = X.canvas(W, H);
  const img = g.createImageData(W, H), d = img.data;
  const AW = aw / 2 * PPU, AH = ah / 2 * PPU * FY; // arena half sizes in art px
  const KX = 6, KY = 4, KF = 3; // kerb width (sides), depth (north/south) and its front face (south)
  for (let y = 0; y < H; y++) {
    const wy = y - OY;
    for (let x = 0; x < W; x++) {
      const wx = x - OX, i = (y * W + x) * 4;
      const n = fbm(wx * 0.045, wy * 0.07, 3), r = rand(wx, wy, 9);
      // grass with short vertical blade streaks, and worn dirt in patches
      let k = Math.floor(2.2 + (n - 0.5) * 4.5 + (r - 0.5) * 0.8);
      const st = rand(wx, Math.floor((wy + (wx % 3)) / 3), 4);
      if (st < 0.1) k += 1; else if (st > 0.93) k -= 1;
      let col: number[] = G[clamp(k, 0, 5)];
      if (fbm(wx * 0.025 + 7, wy * 0.035, 8) > 0.7) col = D[clamp(Math.floor(2 + (n - 0.5) * 3.5 + (r - 0.5) * 1.3), 0, 4)];
      // distance outside the arena, in ground px (vertical unsquashed)
      const ox = Math.abs(wx) - AW, oyN = -AH - wy, oyS = wy - AH;
      const out = Math.max(ox, oyN / FY, oyS / FY);
      const lx = wx + AW, ly = wy + AH;
      let shade = 1;
      if (out < 0) {
        // the plaza (in survive's field, breaking up into grass between the paved zones)
        // (a slab is ruined with a chance that grows with the ruin there, so the paving thins out gradually)
        const st = flagstone(Math.floor(lx), Math.floor(ly)), rz = ruin ? ruin(wx / PPU, wy / (PPU * FY)) : 0;
        col = slabPixel(Math.floor(lx), Math.floor(ly), st, rz > 0 && rand(st.id, 41) < rz * 1.5 ? rz : 0, col) ?? col;
        // the kerb throws a short shadow onto the slabs (light from the upper left)
        if (ly < 3 || lx < 3) shade = 0.72;
      } else if (oyS >= KY && oyS < KY + KF && ox < KX) {
        // the kerb's front face (the plaza is raised a little): dark stone, lit top row
        col = oyS - KY === 0 ? KB[3] : KB[5 - (oyS - KY >= KF - 1 ? 0 : 1)];
      } else if ((ox < KX && oyN < KY && oyS < KY) && (ox >= 0 || oyN >= 0 || oyS >= 0)) {
        // the kerb: long dressed stones with joints, a lit north lip and moss
        const along = ox >= 0 ? wy + AH : wx + AW, block = Math.floor((along + (ox >= 0 ? 3 : 0)) / (ox >= 0 ? 9 : 17));
        const jt = Math.floor(along + (ox >= 0 ? 3 : 0)) % (ox >= 0 ? 9 : 17) === 0;
        let kk = 1.6 + rand(block, ox >= 0 ? (wx > 0 ? 3 : 4) : (wy > 0 ? 5 : 6), 31) * 1.2 + (vnoise(wx * 0.4, wy * 0.6, 33) - 0.5) * 0.7;
        if (oyN >= 0 && oyN < 1) kk -= 1; // lit far lip
        if (ox >= 0 && wx > 0 && ox > KX - 2) kk += 0.8; // east face in shade
        col = jt ? KB[5] : KB[clamp(Math.round(kk), 0, 4)];
        if (rand(wx, wy, 35) < 0.06) col = G[2];
        if (rand(block, 36) < 0.25 && rand(wx, wy, 37) < 0.3) col = KB[4]; // a chipped corner
      } else if (out < 46) {
        // the ruined rim: stray slabs fading into the grass
        const pz = clamp(out / 46, 0, 1);
        const sl = slabPixel(Math.floor(lx), Math.floor(ly), flagstone(Math.floor(lx), Math.floor(ly)), 0.25 + pz * 0.75, col);
        if (sl) col = sl;
        if (oyS > KY + KF && oyS < KY + KF + 3 && ox < KX + 1) shade = 0.6; // shadow under the kerb's face
      }
      // dusk: neutral blue in the middle, darker toward the edges of the view
      const e = clamp(Math.hypot(wx / (AW + 90), wy / (AH + 70)), 0, 1.6);
      const m = shade * lerp(1.0, 0.55, clamp((e - 0.55) / 0.9, 0, 1));
      d[i] = col[0] * 0.92 * m; d[i + 1] = col[1] * 0.95 * m; d[i + 2] = Math.min(255, col[2] * 1.08 * m); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // stamps outside the kerb: flowers, pebbles, tufts of dark grass
  const put = (wx: number, wy: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(wx + OX), Math.round(wy + OY), 1, 1); };
  const FLOW = ['#f0e8f8', '#f6a0b4', '#ffe070', '#9ac4ff', '#ffffff'];
  for (let i = 0; i < 900; i++) {
    const wx = -OX + rand(i, 31) * W, wy = -OY + rand(i, 32) * H;
    if (Math.abs(wx) < AW + 10 && Math.abs(wy) < AH + 12) continue;
    const e = Math.hypot(wx / (AW + 90), wy / (AH + 70)), dim = e > 1 ? 0.6 : 1;
    const kind = rand(i, 33);
    if (kind < 0.25) {
      const col = X.mix('#000000', FLOW[Math.floor(rand(i, 34) * FLOW.length)], 0.85 * dim);
      for (let k = 0; k < 3; k++) { const fx = wx + (rand(i, k, 35) - 0.5) * 6, fy = wy + (rand(i, k, 36) - 0.5) * 3; put(fx, fy + 1, '#1e3a26'); put(fx, fy, col); }
    } else if (kind < 0.55) {
      put(wx, wy, '#20362a'); put(wx + 1, wy, '#20362a'); put(wx + 2, wy, '#20362a');
      put(wx + 1, wy - 1, '#3e6443'); put(wx + 2, wy - 2, '#4b724a');
    } else if (kind < 0.66) {
      put(wx, wy, '#6c6e72'); put(wx + 1, wy, '#868890'); put(wx, wy + 1, '#24222a');
    }
  }
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}
