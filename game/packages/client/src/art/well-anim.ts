/**
 * The battery's well, alive, from bought frames (PixelLab, the user's approval 2026-11-12; tools/art-import/
 * well_frames.py). Its three states:
 *
 *   steady      the well as bought, still, its runes shimmering and its crystal's light breathing. The bought 16-frame
 *               loop is kept but not played: its rings morph into one face-on hoop and back rather than turn (the
 *               user, 2026-11-12: "they just wobble weirdly")
 *   overloaded  as the well fails (`unstable` rising): the bought Overloaded picture (rings knocked askew, the crystal
 *               cracked and blazing), cross-faded to as failing starts (the user: no bought transition needed there),
 *               juddering, flaring, arcs jumping from the crystal to the rings
 *   failed      as it dies (`power` falling, art/power-down.ts): the 13-frame overloaded-to-failed animation, played
 *               by how far the power is gone, ending on the bought Failed picture
 *   repaired    `repair` rising from 0 to 1 plays the failed-to-repaired animation (the repair beat is to come)
 *
 * Clicking the well steps through every version (`preview`, main.ts), so they can be looked at side by side.
 *
 * Code adds only light on top: a halo behind the crystal and the drum's runes shimmering while steady. Everything is
 * painted each frame into one canvas that is the well-top prop's texture, so it sorts among the actors as the prop did
 * (art/props.ts). The frames have `rise` rows above the bought well's crop, for the flare and the lifting rings.
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, rand } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; seams: number[][] }
interface Frames { cell: [number, number]; rise?: number; sets: Record<string, number> }
const metas = import.meta.glob<Layers>('../../../../content/assets/well/layers.json', { eager: true, import: 'default' });
const frameMetas = import.meta.glob<Frames>('../../../../content/assets/well/frames/frames.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/well/frames/*.png', { eager: true, query: '?url', import: 'default' });
const LAYERS = Object.values(metas)[0];
const FRAMES = Object.values(frameMetas)[0];
const url = (name: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith('/' + name))?.[1];

/** Room round the bought canvas for the judder and the arcs, px. */
export const WELL_MARGIN = 8;
/** Rows the frames reach above the bought well's crop. */
export const WELL_RISE = FRAMES?.rise ?? 0;
/** Animation speed, frames a second; how long failing takes to cross-fade into the Overloaded picture, s. */
const FPS = 5, TO_OVERLOAD = 0.5;
/** How squashed the rings are seen from here, for where an arc lands round them. */
const RING_SQUASH = 0.62;
const HOT = [255, 230, 160];

/** The versions clicking the well steps through (the preview). A strip plays and then holds its last frame for a moment. */
export const PREVIEWS: readonly { name: string; label: string }[] = [
  { name: 'still', label: 'steady (in the game)' },
  { name: 'steady', label: 'steady, the bought loop (not used: the rings morph)' },
  { name: 'overloaded', label: 'overloaded (failing)' },
  { name: 'fail', label: 'overloaded → failed' },
  { name: 'failed', label: 'failed' },
  { name: 'repair', label: 'failed → repaired' },
];
const HOLD = 1.2;

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  ready = false;
  /** When failing began (view clock), for the cross-fade into Overloaded; -1 while it holds. */
  private overloadAt = -1;
  /** The preview: which of PREVIEWS is shown in place of the game's state (-1: the game's), and since when. */
  preview = -1;
  private previewAt = -1;

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

  /** The next version in the preview, then back to the game's own state. Returns its label, or null when back. */
  nextPreview(): string | null {
    this.preview = this.preview + 1 >= PREVIEWS.length ? -1 : this.preview + 1;
    this.previewAt = -1;
    return this.preview < 0 ? null : PREVIEWS[this.preview].label;
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
    if (this.preview >= 0) return this.showPreview(g, t);
    const dead = 1 - power, pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    const flare = unstable > 0 && power > 0.9 && rand(Math.floor(t * 9), 3, 41) < unstable * 0.45 ? 1 : 0;
    if (unstable > 0 && this.overloadAt < 0) this.overloadAt = t;
    if (unstable <= 0 && dead <= 0) this.overloadAt = -1;
    let lit: number;

    if (repair > 0 && dead >= 1) {
      // mended: the light comes back and the rings rise
      this.frame(g, 'repair', Math.round(repair * (FRAMES.sets.repair - 1)), M, M);
      lit = repair;
    } else if (dead > 0) {
      // dying: the bought power-down, by how far the power has gone
      this.frame(g, 'fail', Math.round(clamp(dead, 0, 1) * (FRAMES.sets.fail - 1)), M, M);
      lit = power;
    } else if (unstable > 0) {
      // overloaded: the still well cross-fades into the Overloaded picture, which judders
      const k = clamp((t - this.overloadAt) / TO_OVERLOAD, 0, 1);
      const jit = rand(Math.floor(t * 14), 2, 7) < 0.25 + unstable * 0.5;
      const jx = jit ? Math.round((rand(Math.floor(t * 14), 3, 7) - 0.5) * 2) : 0, jy = jit ? Math.round(rand(Math.floor(t * 14), 4, 7) - 0.5) : 0;
      if (k < 1) this.frame(g, 'still', 0, M, M);
      g.globalAlpha = k; this.frame(g, 'overloaded', 0, M + jx, M + jy); g.globalAlpha = 1;
      if (flare) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25; this.frame(g, 'overloaded', 0, M + jx, M + jy); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
      lit = 1;
    } else {
      // steady: the well as bought, its runes shimmering
      this.frame(g, 'still', 0, M, M);
      this.seams(g, t, 0.6);
      lit = 1;
    }
    this.halo(g, lit, pulse, flare);
    if (unstable > 0.05 && dead <= 0) this.arcs(g, t, unstable, M);
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse) * (flare ? 1.2 : 1);
  }

  /** A version from PREVIEWS: a still holds, a strip plays once at FPS and holds its last frame, then plays again. */
  private showPreview(g: Ctx, t: number): number {
    const M = WELL_MARGIN, p = PREVIEWS[this.preview], n = FRAMES.sets[p.name] ?? 1;
    if (this.previewAt < 0) this.previewAt = t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    let k = 0, lit = 1;
    if (p.name === 'steady') k = Math.floor(t * FPS) % n;
    else if (n > 1) {
      const e = (t - this.previewAt) % (n / FPS + HOLD);
      k = Math.min(n - 1, Math.floor(e * FPS));
      lit = p.name === 'fail' ? 1 - k / (n - 1) : k / (n - 1);
    } else if (p.name === 'failed') lit = 0;
    this.frame(g, p.name, k, M, M);
    if (p.name === 'still') this.seams(g, t, 0.6);
    this.halo(g, lit, pulse, 0);
    if (p.name === 'overloaded') this.arcs(g, t, 0.6, M);
    this.tex.source.update();
    return lit * (0.75 + 0.25 * pulse);
  }

  /** A soft halo round the crystal, behind the rest, its light breathing. Kept low: the frames are bright themselves. */
  private halo(g: Ctx, lit: number, pulse: number, flare: number): void {
    if (lit <= 0.05) return;
    const M = WELL_MARGIN;
    g.globalCompositeOperation = 'destination-over';
    X.glow(g, M + LAYERS.crystal.cx, M + WELL_RISE + LAYERS.crystal.cy, 14 + flare * 5, flare ? '#fff2c0' : '#ff9a30', (0.08 + 0.07 * pulse + 0.15 * flare) * lit);
    g.globalCompositeOperation = 'source-over';
  }

  /** The runes on the drum's panels shimmer in a slow wave (strength k): the steady state only. */
  private seams(g: Ctx, t: number, k0: number): void {
    const M = WELL_MARGIN, top0 = M + WELL_RISE;
    for (const [x, y, r, gg, b, top] of LAYERS.seams) {
      if (top) continue; // the drum's lit top is the frames' own
      const s = Math.sin(t * 2.6 - x * 0.42 - y * 0.23);
      if (s <= 0.6) continue;
      const k = ((s - 0.6) / 0.4) * k0;
      X.px(g, M + x, top0 + y, `rgb(${Math.round(r + (HOT[0] - r) * k)},${Math.round(gg + (HOT[1] - gg) * k)},${Math.round(b + (HOT[2] - b) * k)})`);
    }
  }

  /** Overloaded: arcs jump from the crystal out to the rings, a few at a time, each for a moment. */
  private arcs(g: Ctx, t: number, unstable: number, M: number): void {
    const f = Math.floor(t * 14), cx = M + LAYERS.crystal.cx, cy = M + WELL_RISE + LAYERS.crystal.cy;
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
