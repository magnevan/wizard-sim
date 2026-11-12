/**
 * The battery's well, alive, from bought frames (PixelLab, the user's approval 2026-11-12; tools/art-import/
 * well_frames.py). Its three states:
 *
 *   steady      the rings turning about their own axes, the crystal pulsing: a 16-frame loop
 *   overloaded  as the well fails (`unstable` rising): the bought Overloaded picture (rings knocked askew, the crystal
 *               cracked and blazing), cross-faded to from the loop as failing starts (the user: no bought transition
 *               needed there), juddering, flaring, arcs jumping from the crystal to the rings
 *   failed      as it dies (`power` falling, art/power-down.ts): the 13-frame overloaded-to-failed animation, played
 *               by how far the power is gone, ending on the bought Failed picture
 *   repaired    `repair` rising from 0 to 1 plays the failed-to-repaired animation, back into the loop (the repair beat
 *               is to come)
 *
 * Code adds only light on top: a halo behind the crystal and the drum's runes shimmering while steady. Everything is
 * painted each frame into one canvas that is the well-top prop's texture, so it sorts among the actors as the prop did
 * (art/props.ts).
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, rand } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; seams: number[][] }
interface Frames { cell: [number, number]; sets: Record<string, number> }
const metas = import.meta.glob<Layers>('../../../../content/assets/well/layers.json', { eager: true, import: 'default' });
const frameMetas = import.meta.glob<Frames>('../../../../content/assets/well/frames/frames.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/well/frames/*.png', { eager: true, query: '?url', import: 'default' });
const LAYERS = Object.values(metas)[0];
const FRAMES = Object.values(frameMetas)[0];
const url = (name: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith('/' + name))?.[1];

/** Room round the bought canvas for the judder and the arcs, px. */
export const WELL_MARGIN = 8;
/** The steady loop's speed, frames a second; how long failing takes to cross-fade into the Overloaded picture, s. */
const LOOP_FPS = 5, TO_OVERLOAD = 0.5;
/** How squashed the rings are seen from here, for where an arc lands round them. */
const RING_SQUASH = 0.62;
const HOT = [255, 230, 160];

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  ready = false;
  /** When failing began (view clock), for the cross-fade into Overloaded; -1 while it holds. */
  private overloadAt = -1;

  constructor() {
    const [W, H] = FRAMES ? FRAMES.cell : [104, 113];
    this.cv = X.canvas(W + 2 * WELL_MARGIN, H + WELL_MARGIN);
    this.tex = Texture.from(this.cv.c);
    this.tex.source.scaleMode = 'nearest';
  }

  /** Loads the frames; resolves false if they aren't there (the prop's plain picture stays). */
  async load(): Promise<boolean> {
    if (!FRAMES || !LAYERS) return false;
    try {
      const names = Object.keys(FRAMES.sets);
      const ims = await Promise.all(names.map((n) => { const u = url(n + '.png'); if (!u) throw new Error('no ' + n); return loadImage(u); }));
      names.forEach((n, k) => { this.img[n] = ims[k]; });
    } catch { return false; }
    this.ready = true;
    return true;
  }

  /** Draws frame k of strip `name` at (x, y). */
  private frame(g: Ctx, name: string, k: number, x: number, y: number): void {
    const [W, H] = FRAMES.cell, n = FRAMES.sets[name], f = Math.max(0, Math.min(n - 1, k));
    g.drawImage(this.img[name], f * W, 0, W, H, x, y, W, H);
  }

  /**
   * Paints the well for time t (s). `power` 1 working to 0 dead; `unstable` 0 steady to 1 overloaded; `repair` 0 to 1
   * as it's mended. Returns how bright its light is now (0..1), for the scene's lighting.
   */
  draw(t: number, power: number, unstable: number, repair = 0): number {
    if (!this.ready) return power;
    const { c, x: g } = this.cv, M = WELL_MARGIN;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g._fs = null;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const dead = 1 - power, pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    const flare = unstable > 0 && power > 0.9 && rand(Math.floor(t * 9), 3, 41) < unstable * 0.45 ? 1 : 0;
    if (unstable > 0 && this.overloadAt < 0) this.overloadAt = t;
    if (unstable <= 0 && dead <= 0) this.overloadAt = -1;
    const loop = Math.floor(t * LOOP_FPS) % FRAMES.sets.steady;
    let lit: number;

    if (repair > 0 && dead >= 1) {
      // mended: the light comes back and the rings rise, into the loop
      const n = FRAMES.sets.repair;
      this.frame(g, 'repair', Math.round(repair * (n - 1)), M, M);
      lit = repair;
    } else if (dead > 0) {
      // dying: the bought power-down, by how far the power has gone
      const n = FRAMES.sets.fail;
      this.frame(g, 'fail', Math.round(clamp(dead, 0, 1) * (n - 1)), M, M);
      lit = power;
    } else if (unstable > 0) {
      // overloaded: the loop cross-fades into the Overloaded picture, which judders
      const k = clamp((t - this.overloadAt) / TO_OVERLOAD, 0, 1);
      const jit = rand(Math.floor(t * 14), 2, 7) < 0.25 + unstable * 0.5;
      const jx = jit ? Math.round((rand(Math.floor(t * 14), 3, 7) - 0.5) * 2) : 0, jy = jit ? Math.round(rand(Math.floor(t * 14), 4, 7) - 0.5) : 0;
      if (k < 1) this.frame(g, 'steady', loop, M, M);
      g.globalAlpha = k; this.frame(g, 'overloaded', 0, M + jx, M + jy); g.globalAlpha = 1;
      if (flare) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; this.frame(g, 'overloaded', 0, M + jx, M + jy); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      lit = 1;
    } else {
      // steady: the rings turning, the runes shimmering
      this.frame(g, 'steady', loop, M, M);
      this.seams(g, t, 0.6);
      lit = 1;
    }
    // a soft halo round the crystal, behind nothing but bright enough to read through the rings
    if (lit > 0.05) {
      g.globalCompositeOperation = 'destination-over';
      X.glow(g, M + LAYERS.crystal.cx, M + LAYERS.crystal.cy, 16 + flare * 6, flare ? '#fff2c0' : '#ff9a30', (0.18 + 0.12 * pulse + 0.2 * flare) * lit);
      g.globalCompositeOperation = 'source-over';
    }
    if (unstable > 0.05 && dead <= 0) this.arcs(g, t, unstable, M);
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse) * (flare ? 1.3 : 1);
  }

  /** The runes on the drum's panels shimmer in a slow wave (strength k): the steady state only. */
  private seams(g: Ctx, t: number, k0: number): void {
    const M = WELL_MARGIN;
    for (const [x, y, r, gg, b, top] of LAYERS.seams) {
      if (top) continue; // the drum's lit top is the frames' own
      const s = Math.sin(t * 2.6 - x * 0.42 - y * 0.23);
      if (s <= 0.6) continue;
      const k = ((s - 0.6) / 0.4) * k0;
      X.px(g, M + x, M + y, `rgb(${Math.round(r + (HOT[0] - r) * k)},${Math.round(gg + (HOT[1] - gg) * k)},${Math.round(b + (HOT[2] - b) * k)})`);
    }
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
