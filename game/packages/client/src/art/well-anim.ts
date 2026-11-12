/**
 * The battery's well, alive (the user, 2026-11-12). The crystal pulses with light and bobs slowly up and down; the brass
 * rings are the bought art's own, exactly (the user: keep them as the original had them), and glints run round them as
 * they would round polished rings turning; the runes on the drum shimmer.
 *
 * Its three states (the user: overloaded/failing, failed, repaired). Overloaded, as the well fails (beat 5, `unstable`
 * rising): the crystal overcharges, flaring white and shaking, arcs jump from it to the rings, the rings judder, the
 * runes stutter. Failed (`power` falling to 0, art/power-down.ts): the crystal stutters, darkens and sinks, the rings go
 * dull and drop onto the drum. Repaired: steady, as it starts (the repair is to come).
 *
 * All layers are cut from the bought well-top (tools/art-import/well_layers.py) and painted each frame into one canvas
 * that is the well-top prop's texture, so it sorts among the actors as the prop did (art/props.ts).
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, rand, seg } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; drumTop: { cx: number; cy: number; rx: number; ry: number }; seams: number[][] }
const metas = import.meta.glob<Layers>('../../../../content/assets/well/layers.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/well/*.png', { eager: true, query: '?url', import: 'default' });
const LAYERS = Object.values(metas)[0];
const url = (name: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith('/' + name))?.[1];

/** Room round the bought canvas for the rings as they judder and the arcs, px. */
export const WELL_MARGIN = 8;
/** The rings' middle on the bought canvas, and how squashed they are seen from here, for where a glint is round them. */
const RING_C = [51.5, 26] as const, RING_SQUASH = 0.62;
/** Glints round the rings: how fast each runs (rad/s, signed), how wide (rad), and how bright at most. */
const GLINTS = [0.9, -0.7], GLINT_W = 0.24, GLINT_K = 0.8;
const HOT = [255, 230, 160], SHINE = [255, 240, 192];

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  /** The rings' lit pixels, [x, y, angle round the rings, r, g, b], for the glints. */
  private shine: number[][] = [];
  ready = false;

  constructor() {
    const [W, H] = LAYERS ? LAYERS.size : [104, 113];
    this.cv = X.canvas(W + 2 * WELL_MARGIN, H + WELL_MARGIN);
    this.tex = Texture.from(this.cv.c);
    this.tex.source.scaleMode = 'nearest';
  }

  /** Loads the layers; resolves false if they aren't there (the prop's plain picture stays). */
  async load(): Promise<boolean> {
    if (!LAYERS) return false;
    const names = ['drum.png', 'drum-drained.png', 'crystal.png', 'crystal-dark.png', 'rings.png', 'rings-dark.png'];
    try {
      const ims = await Promise.all(names.map((n) => { const u = url(n); if (!u) throw new Error('no ' + n); return loadImage(u); }));
      names.forEach((n, k) => { this.img[n] = ims[k]; });
    } catch { return false; }
    // the rings' lit brass, where a glint can catch
    const r = this.img['rings.png'], cv = X.canvas(r.width, r.height);
    cv.x.drawImage(r, 0, 0);
    const d = cv.x.getImageData(0, 0, r.width, r.height).data;
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      const o = (y * r.width + x) * 4;
      if (d[o + 3] < 200 || d[o] + d[o + 1] + d[o + 2] < 300) continue;
      this.shine.push([x, y, Math.atan2((y - RING_C[1]) / RING_SQUASH, x - RING_C[0]), d[o], d[o + 1], d[o + 2]]);
    }
    this.ready = true;
    return true;
  }

  /**
   * Paints the well for time t (s). `power` 1 working to 0 dead; `unstable` 0 steady to 1 overloaded. Returns how bright
   * its light is now (0..1), for the scene's lighting.
   */
  draw(t: number, power: number, unstable: number): number {
    if (!this.ready) return power;
    const { c, x: g } = this.cv, M = WELL_MARGIN;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g._fs = null;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const dead = 1 - power, drop = seg(dead, 0.3, 0.92), fall = drop * drop; // the rings fall as it dies, gathering speed
    const bounce = Math.round(Math.sin(seg(dead, 0.92, 1) * Math.PI) * 2);
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

    this.crystal(g, t, pulse, lit, power, fall, unstable, flare, M);

    // the rings, as bought: juddering when overloaded, dropping onto the drum and going dull as it dies, glints running round them
    const jit = unstable > 0.2 && rand(Math.floor(t * 14), 2, 7) < unstable * 0.6;
    const rx = M + (jit ? Math.round((rand(Math.floor(t * 14), 3, 7) - 0.5) * 2) : 0), ry = M + Math.round(fall * 7) - bounce + (jit ? Math.round(rand(Math.floor(t * 14), 4, 7) - 0.5) : 0);
    g.drawImage(this.img['rings.png'], rx, ry);
    if (lit > 0.05) this.glints(g, t, lit, rx, ry);
    if (dead > 0) { g.globalAlpha = clamp(dead * 1.2, 0, 1); g.drawImage(this.img['rings-dark.png'], rx, ry); g.globalAlpha = 1; }

    if (unstable > 0.05 && lit > 0.2) this.arcs(g, t, unstable, M);
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse) * (flare ? 1.3 : 1);
  }

  /** Glints running round the rings, as on polished rings turning: lit brass near each glint's angle brightens. */
  private glints(g: Ctx, t: number, k: number, x0: number, y0: number): void {
    const at = GLINTS.map((w) => w * t);
    for (const [x, y, a, r, gg, b] of this.shine) {
      let best = 1;
      for (const ga of at) { const d = Math.abs(((a - ga + Math.PI * 3) % (Math.PI * 2)) - Math.PI); best = Math.min(best, d / GLINT_W); }
      if (best >= 1) continue;
      const s = (1 - best) * GLINT_K * k;
      X.px(g, x0 + x, y0 + y, `rgb(${Math.round(r + (SHINE[0] - r) * s)},${Math.round(gg + (SHINE[1] - gg) * s)},${Math.round(b + (SHINE[2] - b) * s)})`);
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
    const bob = Math.round(Math.sin(t * 1.3) * power), sink = Math.round(fall * 9), x = M + shake, y = M + bob + sink;
    const cx = x + LAYERS.crystal.cx, cy = y + LAYERS.crystal.cy;
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
  private arcs(g: Ctx, t: number, unstable: number, M: number): void {
    const f = Math.floor(t * 14), cx = M + LAYERS.crystal.cx, cy = M + LAYERS.crystal.cy;
    const n = 1 + Math.floor(unstable * 3);
    for (let a = 0; a < n; a++) {
      if (rand(f, a, 61) > 0.35 + unstable * 0.5) continue;
      const ang = rand(f, a, 62) * Math.PI * 2, r = 26 + rand(f, a, 63) * 8;
      const ex = cx + Math.cos(ang) * r, ey = cy + Math.sin(ang) * r * RING_SQUASH;
      const pts: [number, number][] = [[cx, cy]];
      for (let s = 1; s < 5; s++) {
        const k = s / 5;
        pts.push([cx + (ex - cx) * k + (rand(f, a * 9 + s, 64) - 0.5) * 7, cy + (ey - cy) * k + (rand(f, a * 9 + s, 65) - 0.5) * 6]);
      }
      pts.push([ex, ey]);
      X.lines(g, pts, '#ffb040', 2);
      X.lines(g, pts, '#fff2c0', 1);
      X.glow(g, ex, ey, 4, '#ffd860', 0.6);
    }
  }
}
