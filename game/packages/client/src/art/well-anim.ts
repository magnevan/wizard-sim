/**
 * The battery's well, alive (the user, 2026-11-12). The crystal pulses with light and bobs slowly up and down; the three
 * brass rings stay where the bought art has them, two tilted into an X and one nearly level below, and each spins about
 * its own axis, the engraving and studs on its band carried round; the runes on the drum shimmer.
 *
 * Its three states (the user: overloaded/failing, failed, repaired). Overloaded, as the well fails (beat 5, `unstable`
 * rising): the crystal overcharges, flaring white and shaking, arcs jump from it to the rings, the rings are knocked
 * askew and judder, the runes stutter. Failed (`power` falling to 0, art/power-down.ts): the crystal stutters, darkens and
 * sinks, the rings slow and drop flat onto the drum's rim. Repaired: steady, as it starts (the repair is to come).
 *
 * The drum and crystal are layers cut from the bought well-top (tools/art-import/well_layers.py); the rings are drawn
 * here, as flat brass bands in 3D, so they can turn. Everything is painted each frame into one canvas that is the
 * well-top prop's texture, so it sorts among the actors as the prop did (art/props.ts). The column of light standing up
 * out of the crystal is drawn by the effects (vfx.ts, from tip()), since it rises past everything.
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, mod, rand, seg } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; drumTop: { cx: number; cy: number; rx: number; ry: number }; seams: number[][] }
const metas = import.meta.glob<Layers>('../../../../content/assets/well/layers.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/well/*.png', { eager: true, query: '?url', import: 'default' });
const LAYERS = Object.values(metas)[0];
const url = (name: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith('/' + name))?.[1];

/** Room round the bought canvas for the rings as they judder, px. */
export const WELL_MARGIN = 8;
/** The art's own projection: the drum's top is a 68 x 15 ellipse, so the ground squashes to about a quarter, and height a little. */
const SIN_E = 0.24, COS_E = 0.97;
/** Where the rings sit, on the bought canvas, and how far above that the drum's top is (art px of height, negative: below). */
const RING_C = [51.5, 23] as const;
const DRUM_Z = -(55.5 - 23) / COS_E;
/**
 * The rings, as the bought art has them: two big ones seen nearly face on, their long axes on the diagonals so they
 * cross in an X, and one nearly level below. Each is given by its two axes in 3D (x across, y toward the viewer, z up):
 * `slant` turns the long axis off level (radians, in the picture's plane), `open` how far the short axis tips into depth
 * (90 degrees: a level ring seen from the side; 0: face on). Also its radius, the height of its middle, how fast it
 * spins about its own axis (rad/s), and its band's half-width.
 */
const RINGS = [
  { r: 35, slant: 0, open: 1.43, z: -15, spin: 0.35, w: 2.6 },
  { r: 34, slant: 0.6, open: 0.9, z: 0, spin: -0.42, w: 2.4 },
  { r: 34, slant: -0.6, open: 0.9, z: 0, spin: 0.38, w: 2.4 },
];
/** A ring's axes: its long axis in the picture's plane at `slant`, its short one tipped `open` into depth. */
function axes(slant: number, open: number): [number[], number[]] {
  const e1 = [Math.cos(slant), 0, Math.sin(slant)], up = [-Math.sin(slant), 0, Math.cos(slant)];
  return [e1, [up[0] * Math.cos(open), Math.sin(open), up[2] * Math.cos(open)]];
}
/** Brass, darkest to brightest, and the outline. */
const BRASS = ['#3a2a18', '#5a4328', '#7d6038', '#a8844e', '#d0ac6c', '#f0d496'], LINE = '#1c120a';
const HOT = [255, 230, 160];
/** Lit from above, upper left; the viewer is toward +y and up (the art's own angle). */
const LIGHT = [-0.5, -0.25, 0.83], VIEW = [0, COS_E, SIN_E];

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: readonly number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One pixel of a ring's band: where, how near the viewer, its colour index (or -1 for outline). */
interface Px { x: number; y: number; depth: number; col: number }

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  ready = false;
  private spun = RINGS.map(() => 0);
  private last = -1;
  /** Where the crystal's top is on the canvas now, and how strong the column is: for the effects (tip()). */
  private top: [number, number] = [0, 0];
  private beam = { power: 1, unstable: 0, pulse: 0 };

  constructor() {
    const [W, H] = LAYERS ? LAYERS.size : [104, 113];
    this.cv = X.canvas(W + 2 * WELL_MARGIN, H + WELL_MARGIN);
    this.tex = Texture.from(this.cv.c);
    this.tex.source.scaleMode = 'nearest';
  }

  /** Loads the layers; resolves false if they aren't there (the prop's plain picture stays). */
  async load(): Promise<boolean> {
    if (!LAYERS) return false;
    const names = ['drum.png', 'drum-drained.png', 'crystal.png', 'crystal-dark.png'];
    try {
      const ims = await Promise.all(names.map((n) => { const u = url(n); if (!u) throw new Error('no ' + n); return loadImage(u); }));
      names.forEach((n, k) => { this.img[n] = ims[k]; });
      this.ready = true;
    } catch { return false; }
    return true;
  }

  /** The crystal's top on this canvas, and the column's power, steadiness and pulse, as last drawn. */
  tip(): { x: number; y: number; power: number; unstable: number; pulse: number } { return { x: this.top[0], y: this.top[1], ...this.beam }; }

  /**
   * Paints the well for time t (s). `power` 1 working to 0 dead; `unstable` 0 steady to 1 overloaded. Returns how bright
   * its light is now (0..1), for the scene's lighting.
   */
  draw(t: number, power: number, unstable: number): number {
    if (!this.ready) return power;
    const { c, x: g } = this.cv, M = WELL_MARGIN;
    const dt = this.last < 0 ? 0 : clamp(t - this.last, 0, 0.1);
    this.last = t;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g._fs = null;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const dead = 1 - power, drop = seg(dead, 0.3, 0.92), fall = drop * drop; // the rings fall as it dies, gathering speed
    const bounce = Math.sin(seg(dead, 0.92, 1) * Math.PI) * 2.5;
    // the crystal's light: a slow pulse; overloaded, it flares white in fits; dying, it stutters
    let pulse = 0.5 + 0.5 * Math.sin(t * (2.1 + unstable * 3));
    const flare = unstable > 0 && rand(Math.floor(t * 9), 3, 41) < unstable * 0.45 ? 1 : 0;
    let lit = power;
    if (power > 0.03 && power < 0.92 && rand(Math.floor(t * 13), 9, 17) < 0.35 * dead) lit = power * 0.25;
    if (flare) pulse = 1;

    // the drum: lit, its seams shimmering (stuttering when overloaded), the drained one over it as it dies
    g.drawImage(this.img['drum.png'], M, M);
    this.seams(g, t, pulse, lit, unstable);
    if (dead > 0) { g.globalAlpha = clamp(dead * 1.15, 0, 1); g.drawImage(this.img['drum-drained.png'], M, M); g.globalAlpha = 1; }

    // the rings' bands, every pixel with its depth
    const px: Px[] = [];
    RINGS.forEach((rg, k) => {
      this.spun[k] += rg.spin * dt * power * (1 + unstable * 1.2);
      // overloaded: knocked askew and juddering; dying: tipping flat to lie on the drum
      const knock = unstable * (0.18 * Math.sin(t * 2.3 + k * 2.1) + 0.07 * Math.sin(t * 17 + k * 5));
      const [a1, a2] = axes(rg.slant + knock, rg.open + unstable * 0.2 * Math.sin(t * 1.7 + k));
      const [f1, f2] = axes(0.05 * k, 1.47 - 0.02 * k);
      const e1 = unit(a1.map((v, i) => v + (f1[i] - v) * drop)), e2raw = a2.map((v, i) => v + (f2[i] - v) * drop);
      const e2 = unit(e2raw.map((v, i) => v - dot(e2raw, e1) * e1[i])); // square to e1 again
      const z = rg.z * (1 - fall) + fall * (DRUM_Z + 1.2 + k * 1.5) + (drop >= 1 ? bounce : 0);
      this.band(px, rg.r, e1, e2, z, this.spun[k], rg.w, M);
    });
    px.sort((a, b) => a.depth - b.depth);
    // the back of the rings, the crystal, then the front
    let i = 0;
    for (; i < px.length && px[i].depth < 0; i++) this.put(g, px[i]);
    this.crystal(g, t, pulse, lit, power, fall, unstable, flare, M);
    for (; i < px.length; i++) this.put(g, px[i]);
    if (unstable > 0.05 && lit > 0.2) this.arcs(g, t, unstable);
    this.beam = { power: lit, unstable, pulse };
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse) * (flare ? 1.3 : 1);
  }

  private put(g: Ctx, p: Px): void {
    X.px(g, p.x, p.y, p.col < 0 ? LINE : BRASS[p.col]);
  }

  /**
   * One ring's band: a flat strip of brass round a circle of radius r, its width along the ring's own axis. The face
   * toward the viewer is the outside (lit) or the inside (in shade) as the ring turns; engraved notches and studs ride
   * round with its spin.
   */
  private band(out: Px[], r: number, e1: readonly number[], e2: readonly number[], z: number, spin: number, hw: number, M: number): void {
    const n = cross(e1, e2), N = Math.round(r * 7), cx = M + RING_C[0], cy = M + RING_C[1];
    const proj = (p: readonly number[]): [number, number] => [cx + p[0], cy + p[1] * SIN_E - (p[2] + z) * COS_E];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * Math.PI * 2, rad = [Math.cos(th) * e1[0] + Math.sin(th) * e2[0], Math.cos(th) * e1[1] + Math.sin(th) * e2[1], Math.cos(th) * e1[2] + Math.sin(th) * e2[2]];
      const outer = dot(rad, VIEW) >= 0, lightK = outer ? 0.35 + 0.65 * Math.max(0, dot(rad, LIGHT)) : 0.12 + 0.3 * Math.max(0, -dot(rad, LIGHT));
      const u = mod(((th - spin) / (Math.PI * 2)) * 40, 1), notch = u < 0.14, stud = mod(((th - spin) / (Math.PI * 2)) * 8, 1) < 0.03;
      const depth = rad[1] * r;
      // across the band, edge to edge, and an outline pixel beyond each edge
      const steps = Math.ceil(hw * 2) + 2;
      for (let s = -1; s <= steps; s++) {
        const k = (s / steps) * 2 - 1, w = k * hw, edge = s < 0 || s === steps;
        const p = [r * rad[0] + n[0] * w, r * rad[1] + n[1] * w, r * rad[2] + n[2] * w];
        const [x, y] = proj(p);
        let col: number;
        if (edge) col = -1;
        else {
          const across = 1 - Math.abs(k); // the band's middle catches more light
          col = Math.round(clamp(lightK * 4 + across * 1.2 - 0.4, 0, 5));
          if (notch && Math.abs(k) < 0.6) col = Math.max(0, col - 2);
          if (stud && Math.abs(k) < 0.35) col = 5;
        }
        out.push({ x: Math.round(x), y: Math.round(y), depth: depth + (edge ? -0.4 : 0), col });
      }
    }
  }

  /** The runes on the panels shimmer in a slow wave; the drum's lit top breathes with the crystal; overloaded, they stutter. */
  private seams(g: Ctx, t: number, pulse: number, lit: number, unstable: number): void {
    if (lit <= 0.02) return;
    const M = WELL_MARGIN, f = Math.floor(t * 12);
    g.globalAlpha = clamp(lit, 0, 1);
    for (let i = 0; i < LAYERS.seams.length; i++) {
      const [x, y, r, gg, b, top] = LAYERS.seams[i];
      let k: number;
      if (top) k = 0.45 * pulse;
      else { const s = Math.sin(t * (2.6 + unstable * 4) - x * 0.42 - y * 0.23); k = s > 0.5 ? ((s - 0.5) / 0.5) * 0.85 : 0; }
      if (unstable > 0 && rand(i, f, 53) < unstable * 0.4) { X.px(g, M + x, M + y, rand(i, f, 54) < 0.5 ? '#5a2a10' : '#fff2c0'); continue; }
      if (k <= 0.02) continue;
      X.px(g, M + x, M + y, `rgb(${Math.round(r + (HOT[0] - r) * k)},${Math.round(gg + (HOT[1] - gg) * k)},${Math.round(b + (HOT[2] - b) * k)})`);
    }
    g.globalAlpha = 1;
  }

  /** The crystal: a halo behind, bobbing, pulsing brighter, shaking and flaring white when overloaded, the dark one over it as it dies, sinking as the rings fall. */
  private crystal(g: Ctx, t: number, pulse: number, lit: number, power: number, fall: number, unstable: number, flare: number, M: number): void {
    const shake = unstable > 0.2 ? Math.round((rand(Math.floor(t * 20), 1, 5) - 0.5) * 2 * unstable) : 0;
    const bob = Math.round(Math.sin(t * 1.3) * 1.5 * power), sink = Math.round(fall * 9), x = M + shake, y = M + bob + sink;
    const cx = x + LAYERS.crystal.cx, cy = y + LAYERS.crystal.cy;
    this.top = [cx, y + 1];
    if (lit > 0.05) X.glow(g, cx, cy, 15 + flare * 6, flare ? '#fff2c0' : '#ff9a30', (0.2 * (0.6 + 0.4 * pulse) + 0.25 * flare) * lit);
    g.drawImage(this.img['crystal.png'], x, y);
    if (lit > 0.05) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp((0.42 * pulse + 0.6 * flare) * lit, 0, 1);
      g.drawImage(this.img['crystal.png'], x, y);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (lit < 1) { g.globalAlpha = clamp(1 - lit, 0, 1); g.drawImage(this.img['crystal-dark.png'], x, y); g.globalAlpha = 1; }
  }

  /** Overloaded: arcs jump from the crystal out to the rings, a few at a time, each for a moment. */
  private arcs(g: Ctx, t: number, unstable: number): void {
    const f = Math.floor(t * 14), cx = this.top[0], cy = this.top[1] + LAYERS.crystal.cy - 1;
    const n = 1 + Math.floor(unstable * 3);
    for (let a = 0; a < n; a++) {
      if (rand(f, a, 61) > 0.35 + unstable * 0.5) continue;
      const ang = rand(f, a, 62) * Math.PI * 2, r = 26 + rand(f, a, 63) * 8;
      const ex = cx + Math.cos(ang) * r, ey = cy + Math.sin(ang) * r * 0.55;
      const pts: [number, number][] = [[cx, cy]];
      const steps = 5;
      for (let s = 1; s < steps; s++) {
        const k = s / steps;
        pts.push([cx + (ex - cx) * k + (rand(f, a * 9 + s, 64) - 0.5) * 7, cy + (ey - cy) * k + (rand(f, a * 9 + s, 65) - 0.5) * 6]);
      }
      pts.push([ex, ey]);
      X.lines(g, pts, '#ffb040', 2);
      X.lines(g, pts, '#fff2c0', 1);
      X.glow(g, ex, ey, 4, '#ffd860', 0.6);
    }
  }
}
