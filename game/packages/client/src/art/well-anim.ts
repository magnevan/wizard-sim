/**
 * The battery's well, alive, painted each frame from layers (2026-11-13; the user's plan after the bought animations
 * morphed the rings):
 *
 *   the drum and the crystal   cut from the bought well (tools/art-import/well_layers.py; the drum's back rim rebuilt
 *                              where the bought rings sat, tools/well-3d/drum_fill.py), lit or drained
 *   the rings                  3D, rendered and snapped to the bought palette (tools/well-3d): a 40-frame spin, split
 *                              at the crystal (back rings, crystal, front rings), and a 60-frame physical fall
 *   light, lightning, sparks   code, over the layers
 *
 * Its states:
 *   steady      the rings turning about their own axes (one each way), the drum's runes and the crystal pulsing lightly
 *   overloaded  (`unstable` rising) the rings spinning ever faster, runes and crystal blazing, lightning from the crystal
 *               striking the rings, molten sparks spitting from the runes
 *   failing     (`power` falling, art/power-down.ts) a white flare and a burst of sparks, then the rings fall and settle
 *               on the drum and the steps as the light goes out of everything
 *   failed      the fall's last frame, dark
 *   repaired    (`repair` 0 to 1) the fall played back, the rings lifting, the light returning, then the spin again
 *
 * Clicking the well steps through every version (`preview`, main.ts). All of it is one canvas, the well-top prop's
 * texture, so it sorts among the actors as the prop did (art/props.ts).
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, rand } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; seams: number[][] }
interface Strip { frames: number; cell: [number, number]; fps?: number; release?: number }
interface Rings3d { spin: Strip; fall: Strip }
const layerMeta = import.meta.glob<Layers>('../../../../content/assets/well/layers.json', { eager: true, import: 'default' });
const ringMeta = import.meta.glob<Rings3d>('../../../../content/assets/well/rings3d/rings3d.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>(['../../../../content/assets/well/*.png', '../../../../content/assets/well/rings3d/*.png'], { eager: true, query: '?url', import: 'default' });
const LAYERS = Object.values(layerMeta)[0];
const RINGS = Object.values(ringMeta)[0];
const url = (name: string): string | undefined => Object.entries(urls).find(([k]) => k.endsWith('/' + name))?.[1];
const IMAGES = ['drum-clear.png', 'drum-drained-clear.png', 'crystal.png', 'crystal-dark.png', 'spin-back.png', 'spin-front.png', 'fall.png', 'fall-dark.png'];

/** Room round the well's canvas for the flare, the lightning and the sparks, px. */
export const WELL_MARGIN = 12;
/** Rows the canvas reaches above the well-top prop's own picture (none: the layers are cut on that crop). */
export const WELL_RISE = 0;

/** The steady spin, frames a second (a frame is one column of the bands' ribs); at full overload, this many more. */
const SPIN_FPS = 8, OVERLOAD_FPS = 26;
/** The power-down: the flare's share of it, then the fall; and how much of the fall the light takes to go. */
const FLARE = 0.12, DARKEN = 0.5;
const HOT = [255, 196, 70];   // the runes run hot as molten metal does, orange to gold (a pale cream read as plastic)
const GRAVITY = 140;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number }

/** The versions clicking the well steps through (the preview). A change plays and then holds its end for a moment. */
export const PREVIEWS: readonly { name: string; label: string }[] = [
  { name: 'steady', label: 'steady' },
  { name: 'overloaded', label: 'overloaded (failing)' },
  { name: 'fail', label: 'overloaded → failed' },
  { name: 'failed', label: 'failed' },
  { name: 'repair', label: 'failed → repaired' },
];
const CHANGE = 2.6, HOLD = 1.4;

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail(new Error('could not load ' + src)); im.src = src; });

export class WellAnim {
  readonly cv: { c: HTMLCanvasElement; x: Ctx };
  readonly tex: Texture;
  private img: Record<string, HTMLImageElement> = {};
  ready = false;
  /** The preview: which of PREVIEWS is shown in place of the game's state (-1: the game's), and since when. */
  preview = -1;
  private previewAt = -1;
  /** The spin's place, in frames (it speeds up and slows, so it's integrated, not taken from the clock). */
  private phase = 0;
  private last = -1;
  private sparks: Spark[] = [];
  private burst = false;
  /** Every ring pixel of each spin frame, for where the lightning strikes: [x0, y0, x1, y1, ...] per frame. */
  private ringPx: Int16Array[] = [];
  private runes: number[][] = [];

  constructor() {
    const [W, H] = LAYERS ? LAYERS.size : [104, 113];
    this.cv = X.canvas(W + 2 * WELL_MARGIN, H + 2 * WELL_MARGIN);
    this.tex = Texture.from(this.cv.c);
    this.tex.source.scaleMode = 'nearest';
  }

  /** Loads the layers and strips; resolves false if they aren't there (the prop's plain picture stays). */
  async load(): Promise<boolean> {
    if (!LAYERS || !RINGS) return false;
    try {
      const ims = await Promise.all(IMAGES.map((n) => { const u = url(n); if (!u) throw new Error('no ' + n); return loadImage(u); }));
      IMAGES.forEach((n, k) => { this.img[n] = ims[k]; });
    } catch { return false; }
    this.findRingPixels();
    this.runes = LAYERS.seams.filter((s) => !s[5]);
    this.ready = true;
    return true;
  }

  private findRingPixels(): void {
    const { frames, cell: [W, H] } = RINGS.spin;
    const c = document.createElement('canvas');
    c.width = W * frames; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.drawImage(this.img['spin-back.png'], 0, 0);
    g.drawImage(this.img['spin-front.png'], 0, 0);
    const d = g.getImageData(0, 0, c.width, H).data;
    for (let f = 0; f < frames; f++) {
      const pts: number[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * c.width + f * W + x) * 4 + 3] > 0) pts.push(x, y);
      this.ringPx.push(Int16Array.from(pts));
    }
  }

  /** The next version in the preview, then back to the game's own state. Returns its label, or null when back. */
  nextPreview(): string | null {
    this.preview = this.preview + 1 >= PREVIEWS.length ? -1 : this.preview + 1;
    this.previewAt = -1;
    this.sparks = [];
    return this.preview < 0 ? null : PREVIEWS[this.preview].label;
  }

  /** Draws frame k of a strip at the canvas's layer origin, at opacity a. */
  private strip(g: Ctx, name: string, s: Strip, k: number, a = 1): void {
    if (a <= 0.001) return;
    const [W, H] = s.cell, f = ((Math.floor(k) % s.frames) + s.frames) % s.frames;
    g.globalAlpha = a;
    g.drawImage(this.img[name], f * W, 0, W, H, WELL_MARGIN, WELL_MARGIN, W, H);
    g.globalAlpha = 1;
  }

  private layer(g: Ctx, name: string, a = 1, dy = 0): void {
    if (a <= 0.001) return;
    g.globalAlpha = a;
    g.drawImage(this.img[name], WELL_MARGIN, WELL_MARGIN + dy);
    g.globalAlpha = 1;
  }

  /**
   * Paints the well for time t (s). `power` 1 working to 0 dead; `unstable` 0 steady to 1 overloaded; `repair` 0 to 1
   * as it's mended. Returns how bright its light is now (0..1), for the scene's lighting.
   */
  draw(t: number, power: number, unstable: number, repair = 0): number {
    if (!this.ready) return power;
    if (this.preview >= 0) {
      const p = PREVIEWS[this.preview].name;
      if (this.previewAt < 0) this.previewAt = t;
      const e = (t - this.previewAt) % (CHANGE + HOLD), k = clamp(e / CHANGE, 0, 1);
      if (p === 'steady') return this.paint(t, 1, 0, 0);
      if (p === 'overloaded') return this.paint(t, 1, 1, 0);
      if (p === 'fail') { if (e < 0.05) { this.sparks = []; this.burst = false; } return this.paint(t, 1 - k, 1, 0); }
      if (p === 'failed') return this.paint(t, 0, 0, 0);
      if (e < 0.05) this.sparks = [];
      return this.paint(t, 0, 0, k);
    }
    return this.paint(t, power, unstable, repair);
  }

  private paint(t: number, power: number, unstable: number, repair: number): number {
    const { c, x: g } = this.cv, M = WELL_MARGIN;
    const dt = this.last < 0 ? 0 : clamp(t - this.last, 0, 0.1);
    this.last = t;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g._fs = null;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const dead = 1 - power, pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    const cx = M + LAYERS.crystal.cx, cy = M + LAYERS.crystal.cy;
    const flick = unstable > 0 ? 0.75 + 0.25 * rand(Math.floor(t * 18), 1, 77) : 1;
    const falling = dead > FLARE || repair > 0;
    if (!falling) this.phase += dt * (SPIN_FPS + OVERLOAD_FPS * unstable);
    if (dead <= 0) this.burst = false;

    // how lit each part is: the runes and the crystal glow (0 dark .. 1 full, more when overloaded), the rings' light
    let glow: number, ringsLit: number, crystalLit: number, flare = 0;
    if (repair > 0) {
      const k = clamp((repair - 0.35) / 0.55, 0, 1);
      glow = k; ringsLit = k; crystalLit = k;
    } else if (dead > 0) {
      flare = dead < FLARE ? Math.sin((dead / FLARE) * Math.PI) : 0;
      const out = clamp((dead - FLARE) / DARKEN, 0, 1);
      glow = (1 - out) * (dead < FLARE ? 1 : 0.6); ringsLit = 1 - out; crystalLit = 1 - out;
      if (!this.burst && dead > FLARE * 0.5) { this.burst = true; this.burstSparks(cx, cy); }
    } else {
      glow = 1; ringsLit = 1; crystalLit = 1;
    }
    const runeK = repair > 0 || dead > 0 ? glow * (1 + flare) : (0.35 + 0.15 * pulse) + unstable * 0.95 * flick;

    // the drum, lit fading to drained
    this.layer(g, 'drum-clear.png', 1);
    this.layer(g, 'drum-drained-clear.png', 1 - glow);
    this.runeLight(g, t, runeK);
    // a soft halo round the crystal
    // (kept small: at full size the flare's halo showed as a dithered square round the crystal)
    const halo = (0.08 + 0.06 * pulse + 0.22 * unstable * flick + 0.3 * flare) * Math.max(glow, flare);
    if (halo > 0.01) X.glow(g, cx, cy, 14 + 6 * unstable + 6 * flare, flare > 0.3 ? '#fff4d0' : '#ff9a30', halo);

    const bob = falling ? 0 : Math.round(Math.sin(t * 1.3) * 0.6);
    const S = RINGS.spin, F = RINGS.fall;
    if (falling) {
      // the crystal, then the fallen rings over it (the fall's stand-ins already cut them where the well covers them)
      this.crystal(g, crystalLit, flare, unstable, flick, pulse, 0);
      const rel = F.release ?? 0;
      const k = repair > 0 ? (1 - clamp(repair / 0.85, 0, 1)) : clamp((dead - FLARE) / (1 - FLARE), 0, 1);
      const f = rel + k * (F.frames - 1 - rel);
      this.strip(g, 'fall-dark.png', F, f, 1);
      this.strip(g, 'fall.png', F, f, ringsLit);
    } else {
      this.strip(g, 'spin-back.png', S, this.phase);
      this.crystal(g, crystalLit, flare, unstable, flick, pulse, bob);
      this.strip(g, 'spin-front.png', S, this.phase);
      if (unstable > 0.05 && dead <= 0) this.lightning(g, t, unstable, cx, cy + bob);
    }
    if (unstable > 0.05 && dead <= 0) this.spit(dt, unstable);
    this.drawSparks(g, dt);
    this.tex.source.update();
    return Math.max(flare, glow * (0.75 + 0.25 * pulse) * (1 + 0.3 * unstable * flick));
  }

  /** The crystal: lit or dark, pulsing, blazing when overloaded, white at the flare; `bob` px up or down. */
  private crystal(g: Ctx, lit: number, flare: number, unstable: number, flick: number, pulse: number, bob: number): void {
    this.layer(g, 'crystal-dark.png', 1, bob);
    this.layer(g, 'crystal.png', lit, bob);
    // lightly pulsing when steady (a strong overlay turned the orange crystal pale yellow), blazing overloaded
    const hot = Math.min(1, (0.03 + 0.07 * pulse) * lit + 0.45 * unstable * flick * lit + flare);
    if (hot > 0.01) {
      g.globalCompositeOperation = 'lighter';
      this.layer(g, 'crystal.png', hot, bob);
      if (flare > 0.4) this.layer(g, 'crystal.png', flare, bob);
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** The drum's runes brighten toward white-hot by k (0..2), each a little out of step with the next. */
  private runeLight(g: Ctx, t: number, k: number): void {
    if (k <= 0.01) return;
    const M = WELL_MARGIN;
    for (const [x, y, r, gg, b] of this.runes) {
      const s = clamp(k * (0.8 + 0.2 * Math.sin(t * 2.6 - x * 0.3 - y * 0.2)), 0, 1.6);
      const m = Math.min(1, s);
      X.px(g, M + x, M + y, `rgb(${Math.round(r + (HOT[0] - r) * m)},${Math.round(gg + (HOT[1] - gg) * m)},${Math.round(b + (HOT[2] - b) * m)})`);
      if (s > 1) X.glow(g, M + x + 0.5, M + y + 0.5, 2, '#ffd070', (s - 1) * 0.5);
    }
  }

  /** Overloaded: lightning from the crystal to a point on the rings, a few at a time, each for a moment. */
  private lightning(g: Ctx, t: number, unstable: number, cx: number, cy: number): void {
    const f = Math.floor(t * 16), frame = Math.floor(this.phase) % RINGS.spin.frames;
    const pts = this.ringPx[frame];
    if (!pts || !pts.length) return;
    const n = 1 + Math.floor(unstable * 3), M = WELL_MARGIN;
    for (let a = 0; a < n; a++) {
      if (rand(f, a, 61) > 0.3 + unstable * 0.55) continue;
      // a ring pixel well away from the crystal, so the bolt has somewhere to go
      let ex = 0, ey = 0;
      for (let tries = 0; tries < 8; tries++) {
        const i = Math.floor(rand(f, a * 13 + tries, 62) * (pts.length / 2)) * 2;
        ex = M + pts[i]; ey = M + pts[i + 1];
        if (Math.hypot(ex - cx, ey - cy) > 16) break;
      }
      const line: [number, number][] = [[cx, cy]];
      for (let s = 1; s < 5; s++) {
        const k = s / 5;
        line.push([cx + (ex - cx) * k + (rand(f, a * 9 + s, 64) - 0.5) * 6, cy + (ey - cy) * k + (rand(f, a * 9 + s, 65) - 0.5) * 5]);
      }
      line.push([ex, ey]);
      X.lines(g, line, '#ffb030', 2);
      X.lines(g, line, '#fff6b0', 1);
      X.glow(g, ex, ey, 4, '#ffe070', 0.7);
    }
  }

  /** Overloaded: molten metal spitting from the drum's runes, more the hotter it runs. */
  private spit(dt: number, unstable: number): void {
    const n = this.runes.length;
    if (!n) return;
    let want = dt * 40 * unstable * unstable;
    while (want > 0) {
      if (want < 1 && Math.random() > want) break;
      want -= 1;
      const [x, y] = this.runes[Math.floor(Math.random() * n)];
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 30 + Math.random() * 45;
      this.sparks.push({ x: WELL_MARGIN + x + 0.5, y: WELL_MARGIN + y + 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.35 + Math.random() * 0.45 });
    }
  }

  /** The flare: a burst from the crystal and the runes as the light breaks. */
  private burstSparks(cx: number, cy: number): void {
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
      this.sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7 - 20, life: 0, max: 0.4 + Math.random() * 0.6 });
    }
    for (let i = 0; i < 18 && this.runes.length; i++) {
      const [x, y] = this.runes[Math.floor(Math.random() * this.runes.length)];
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 35 + Math.random() * 55;
      this.sparks.push({ x: WELL_MARGIN + x, y: WELL_MARGIN + y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.5 + Math.random() * 0.5 });
    }
  }

  private drawSparks(g: Ctx, dt: number): void {
    const keep: Spark[] = [];
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life >= s.max) continue;
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 0 || s.y < 0 || s.x >= this.cv.c.width || s.y >= this.cv.c.height) continue;
      const k = s.life / s.max;
      const col = k < 0.3 ? '#fff2b0' : k < 0.65 ? '#ffb040' : '#d0502a';
      // a hot spark is two pixels along its flight, then one as it cools
      X.px(g, Math.floor(s.x), Math.floor(s.y), col);
      if (k < 0.5) X.px(g, Math.floor(s.x - s.vx * 0.02), Math.floor(s.y - s.vy * 0.02), col);
      if (k < 0.4) X.glow(g, s.x, s.y, 3, '#ffc050', 0.45 * (1 - k / 0.4));
      keep.push(s);
    }
    this.sparks = keep;
  }
}
