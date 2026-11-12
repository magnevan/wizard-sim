/**
 * The battery's well, alive (the user, 2026-11-12): the crystal pulses with light and bobs slowly up and down, the three
 * brass rings turn, each about its own tilted axis, and the runes on the drum shimmer. As the well fails it gets
 * unsteady; when it dies (art/power-down.ts) the crystal stutters, darkens and sinks, the rings slow, tip flat and drop
 * onto the drum's rim, and the seams go out.
 *
 * The drum and crystal are layers cut from the bought well-top (tools/art-import/well_layers.py); the rings are drawn
 * here, as real circles in 3D, so they can turn. Everything is painted each frame into one canvas that is the well-top
 * prop's texture, so it sorts among the actors as the prop did (art/props.ts).
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

/** Room round the bought canvas for the rings as they turn, px. */
export const WELL_MARGIN = 8;
/** The art's own projection: the drum's top is a 68 x 15 ellipse, so the ground squashes to about a quarter, and height a little. */
const GY = 0.24, GZ = 0.95;
/** Where the rings turn about, on the bought canvas, and how far above the drum's top that is (art px of height). */
const RING_C = [51.5, 27] as const;
const DRUM_Z = -(55.5 - 27) / GZ;
/** The rings: radius, tilt from level (radians), how fast the tilt's axis turns (rad/s), how fast the ring spins about its own axis, start. */
const RINGS = [
  { r: 33, tilt: 0.22, turn: 0.22, spin: 0.55, a0: 0.4 },
  { r: 32, tilt: 0.98, turn: -0.3, spin: -0.45, a0: 0.9 },
  { r: 31, tilt: 0.98, turn: 0.26, spin: 0.4, a0: 2.6 },
];
/** Brass, darkest to brightest, and the outline. */
const BRASS = ['#4a361e', '#6e5331', '#977448', '#c39b62', '#e9c98a'], LINE = '#22160c';
const HOT = [255, 230, 160];

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });

interface Pt3 { sx: number; sy: number; depth: number; shade: number; rivet: boolean }

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  ready = false;
  private angle = RINGS.map((r) => r.a0);
  private spun = RINGS.map(() => 0);
  private last = -1;

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

  /**
   * Paints the well for time t (s). `power` 1 working to 0 dead; `unstable` 0 steady to 1 failing. Returns how bright
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
    // the crystal's light: a slow pulse, uneven while the well fails, stuttering as it dies
    let pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    if (unstable > 0) pulse *= 1 - unstable * 0.7 * rand(Math.floor(t * 11), 5, 31);
    let lit = power;
    if (power > 0.03 && power < 0.92 && rand(Math.floor(t * 13), 9, 17) < 0.35 * dead) lit = power * 0.25;

    // the drum: lit, its seams shimmering, the drained one over it as it dies
    g.drawImage(this.img['drum.png'], M, M);
    this.seams(g, t, pulse, lit, unstable);
    if (dead > 0) { g.globalAlpha = clamp(dead * 1.15, 0, 1); g.drawImage(this.img['drum-drained.png'], M, M); g.globalAlpha = 1; }

    // the rings: where every point of each one is
    const pts: Pt3[][] = RINGS.map((rg, k) => {
      const wob = unstable * 0.07 * Math.sin(t * 7.3 + k * 2.1);
      this.angle[k] += rg.turn * dt * power * (1 + unstable * 0.6 * Math.sin(t * 3 + k));
      this.spun[k] += rg.spin * dt * power;
      const tilt = (rg.tilt + wob) * (1 - drop) + 0.03 * k * drop;
      const z0 = DRUM_Z + 1.2 + k * 1.4, cz = fall * z0 + bounce * (drop >= 1 ? 1 : 0);
      return this.ring(rg.r, tilt, this.angle[k], this.spun[k], cz, M);
    });
    for (const half of [false, true]) {
      if (half) this.crystal(g, t, pulse, lit, power, fall, M);
      for (const p of pts) this.band(g, p, half, 'line');
      for (const p of pts) this.band(g, p, half, 'fill');
    }
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse);
  }

  /** The runes on the panels shimmer in a slow wave; the drum's lit top breathes with the crystal. */
  private seams(g: Ctx, t: number, pulse: number, lit: number, unstable: number): void {
    if (lit <= 0.02) return;
    const M = WELL_MARGIN, f = Math.floor(t * 9);
    g.globalAlpha = clamp(lit, 0, 1);
    for (let i = 0; i < LAYERS.seams.length; i++) {
      const [x, y, r, gg, b, top] = LAYERS.seams[i];
      let k: number;
      if (top) k = 0.45 * pulse;
      else { const s = Math.sin(t * 2.6 - x * 0.42 - y * 0.23); k = s > 0.5 ? ((s - 0.5) / 0.5) * 0.85 : 0; }
      if (unstable > 0 && rand(i, f, 53) < unstable * 0.35) { X.px(g, M + x, M + y, '#5a2a10'); continue; }
      if (k <= 0.02) continue;
      X.px(g, M + x, M + y, `rgb(${Math.round(r + (HOT[0] - r) * k)},${Math.round(gg + (HOT[1] - gg) * k)},${Math.round(b + (HOT[2] - b) * k)})`);
    }
    g.globalAlpha = 1;
  }

  /** The crystal: a halo behind, bobbing, pulsing brighter, the dark one over it as the well dies, sinking as the rings fall. */
  private crystal(g: Ctx, t: number, pulse: number, lit: number, power: number, fall: number, M: number): void {
    const bob = Math.round(Math.sin(t * 1.3) * 1.5 * power), sink = Math.round(fall * 9), y = M + bob + sink;
    const cx = M + LAYERS.crystal.cx, cy = y + LAYERS.crystal.cy;
    if (lit > 0.05) X.glow(g, cx, cy, 15, '#ff9a30', 0.2 * (0.6 + 0.4 * pulse) * lit);
    g.drawImage(this.img['crystal.png'], M, y);
    if (lit > 0.05) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.42 * pulse * lit;
      g.drawImage(this.img['crystal.png'], M, y);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (lit < 1) { g.globalAlpha = clamp(1 - lit, 0, 1); g.drawImage(this.img['crystal-dark.png'], M, y); g.globalAlpha = 1; }
  }

  /** One ring's points on the canvas: radius r, tilted `tilt` from level about an axis at `turn`, spun `spin`, its centre `cz` up. */
  private ring(r: number, tilt: number, turn: number, spin: number, cz: number, M: number): Pt3[] {
    const n = [Math.sin(tilt) * Math.cos(turn), Math.sin(tilt) * Math.sin(turn), Math.cos(tilt)];
    let e1 = [n[1], -n[0], 0];
    const l1 = Math.hypot(e1[0], e1[1]);
    e1 = l1 < 1e-6 ? [1, 0, 0] : [e1[0] / l1, e1[1] / l1, 0];
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const N = Math.round(r * 4.4), out: Pt3[] = [], L = [-0.45, -0.35, 0.82];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const px = r * (c * e1[0] + s * e2[0]), py = r * (c * e1[1] + s * e2[1]), pz = r * (c * e1[2] + s * e2[2]);
      const shade = clamp(0.5 + 0.5 * ((px * L[0] + py * L[1] + pz * L[2]) / r), 0, 1); // lit from above and to the upper left
      const rv = mod(((th - spin) / (Math.PI * 2)) * 12, 1); // twelve rivets round it, turning with its spin
      // depth: toward the camera is +y; the crystal stands at 0
      out.push({ sx: M + RING_C[0] + px, sy: M + RING_C[1] + py * GY - (pz + cz) * GZ, depth: py, shade, rivet: rv < 0.06 });
    }
    return out;
  }

  /** A ring's half nearer the camera (front) or further (back): its dark outline, or its brass. */
  private band(g: Ctx, pts: Pt3[], front: boolean, pass: 'line' | 'fill'): void {
    for (const p of pts) {
      if (p.depth > 0 !== front) continue;
      const x = Math.round(p.sx), y = Math.round(p.sy);
      if (pass === 'line') { X.rect(g, x - 2, y - 2, 5, 5, LINE); continue; }
      const k = clamp(Math.floor(p.shade * BRASS.length * (front ? 1 : 0.8)), 0, BRASS.length - 1);
      X.rect(g, x - 1, y - 1, 3, 3, BRASS[Math.max(0, k - 1)]);
      X.px(g, x, y - 1, BRASS[k]);
      if (p.rivet) X.px(g, x, y, front ? BRASS[4] : BRASS[2]);
    }
  }
}
