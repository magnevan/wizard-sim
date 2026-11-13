/**
 * The battery's well, alive, painted each frame from layers (2026-11-13; the user's plan after the bought animations
 * morphed the rings):
 *
 *   the drum and the crystal   cut from the bought well (tools/art-import/well_layers.py; the drum's back rim rebuilt
 *                              where the bought rings sat, tools/well-3d/drum_fill.py), lit or drained
 *   the rings                  3D, rendered and snapped to the bought palette (tools/well-3d): a whole turn of the spin
 *                              (240 frames, worn bands, a slight wobble), split at the crystal (back rings, crystal, front
 *                              rings), and a 60-frame physical fall
 *   light, lightning, sparks   code, over the layers
 *
 * Its states:
 *   steady      the rings turning about their own axes (one each way), the drum's runes and the crystal pulsing lightly
 *   overloaded  (`unstable` rising) the rings spinning ever faster and shaking, the crystal jittering, runes and crystal
 *               blazing, lightning from all over the crystal (some from behind it) striking the rings, molten metal
 *               spitting from the runes of all eight legs
 *   failing     (`power` falling, art/power-down.ts) it ends in one great flare, lightning everywhere and the runes
 *               erupting; then the rings fall and settle on the drum and the steps as the light goes out of everything
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
/** A strip of frames: `cols` cells to a row (all of them in one row when absent). */
interface Strip { frames: number; cell: [number, number]; cols?: number; fps?: number; release?: number }
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
const FLARE = 0.2, DARKEN = 0.5;
const HOT = [255, 196, 70];   // the runes run hot as molten metal does, orange to gold (a pale cream read as plastic)
const GRAVITY = 140;
/**
 * The drum's eight legs, each with its column of runes (three show on the bought drum; the user: all eight surely carry
 * them). Its rim as an ellipse on the canvas, the legs round it from the front (angle pi/2, toward the camera) every
 * eighth of a turn; those behind (sin < -0.1) are hidden by the drum, so what they spit is drawn behind it.
 */
const DRUM = { cx: 51.5, cy: 54, rx: 33, ry: 8 };
const LEGS = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 2 + (i * Math.PI) / 4;
  return { a, x: DRUM.cx + DRUM.rx * Math.cos(a), top: DRUM.cy + DRUM.ry * Math.sin(a), back: Math.sin(a) < -0.1 };
});
/** Lightning's colour from root to tip: white-hot at the crystal, orange where it strikes (the bought flare's). */
const BOLT_CORE = ['#ffffff', '#fff2b8', '#ffc860', '#ff8a28'];
const BOLT_EDGE = ['#ffe8a0', '#ffb848', '#ff8a28', '#d04a18'];

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; back: boolean }

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
/** Where frame k of a strip sits in its image. */
const cellAt = (s: Strip, k: number): [number, number] => {
  const f = ((Math.floor(k) % s.frames) + s.frames) % s.frames, cols = s.cols ?? s.frames;
  return [(f % cols) * s.cell[0], Math.floor(f / cols) * s.cell[1]];
};
/** A colour along a ramp, k 0..1. */
const ramp = (r: readonly string[], k: number): string => {
  const p = clamp(k, 0, 1) * (r.length - 1), i = Math.min(r.length - 2, Math.floor(p));
  return X.mix(r[i], r[i + 1], p - i);
};

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
  /** Every ring pixel of each spin frame, behind the crystal and in front, for where the lightning strikes. */
  private ringPx: { back: Int16Array[]; front: Int16Array[] } = { back: [], front: [] };
  /** The crystal's pixels, where the lightning leaves from: [x0, y0, x1, y1, ...]. */
  private crystalPx: Int16Array = new Int16Array(0);
  private runes: number[][] = [];
  /** The visible runes by the leg they're on (LEGS' index). */
  private legRunes: number[][][] = LEGS.map(() => []);

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
    this.ringPx.back = this.findPixels('spin-back.png', RINGS.spin);
    this.ringPx.front = this.findPixels('spin-front.png', RINGS.spin);
    this.crystalPx = this.findPixels('crystal.png', { frames: 1, cell: LAYERS.size })[0] ?? new Int16Array(0);
    this.runes = LAYERS.seams.filter((s) => !s[5]);
    for (const r of this.runes) {
      let best = 0;
      LEGS.forEach((l, i) => { if (!l.back && Math.abs(l.x - r[0]) < Math.abs(LEGS[best].x - r[0])) best = i; });
      this.legRunes[best].push(r);
    }
    this.ready = true;
    return true;
  }

  /** Every opaque pixel of each frame of an image laid out as strip s: [x0, y0, x1, y1, ...] per frame. */
  private findPixels(name: string, s: Strip): Int16Array[] {
    const im = this.img[name], [W, H] = s.cell;
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return [];
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out: Int16Array[] = [];
    for (let f = 0; f < s.frames; f++) {
      const [ox, oy] = cellAt(s, f), pts: number[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[((oy + y) * c.width + ox + x) * 4 + 3] > 0) pts.push(x, y);
      out.push(Int16Array.from(pts));
    }
    return out;
  }

  /** The next version in the preview, then back to the game's own state. Returns its label, or null when back. */
  nextPreview(): string | null {
    this.preview = this.preview + 1 >= PREVIEWS.length ? -1 : this.preview + 1;
    this.previewAt = -1;
    this.sparks = [];
    return this.preview < 0 ? null : PREVIEWS[this.preview].label;
  }

  /** Draws frame k of a strip at the canvas's layer origin (moved dx, dy), at opacity a. */
  private strip(g: Ctx, name: string, s: Strip, k: number, a = 1, dx = 0, dy = 0): void {
    if (a <= 0.001) return;
    const [W, H] = s.cell, [sx, sy] = cellAt(s, k);
    g.globalAlpha = a;
    g.drawImage(this.img[name], sx, sy, W, H, WELL_MARGIN + dx, WELL_MARGIN + dy, W, H);
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
      if (!this.burst && dead > FLARE * 0.5) { this.burst = true; this.burstSparks(); }
    } else {
      glow = 1; ringsLit = 1; crystalLit = 1;
    }
    // lightning while overloaded and through the flare (in the game `unstable` is already 0 once it's dry)
    const overloaded = repair <= 0 && ((unstable > 0.05 && dead <= 0) || flare > 0);
    const runeK = repair > 0 || dead > 0 ? glow * (1 + 1.6 * flare) + (dead < FLARE ? unstable * 0.9 * flick : 0)
      : (0.35 + 0.15 * pulse) + unstable * 1.3 * flick;

    // the crystal bobs gently when steady; overloaded it jitters, fast and erratic
    const jit = Math.floor(t * 14);
    const bob = falling ? 0 : Math.round(Math.sin(t * 1.3) * 0.6 * (1 - unstable)
      + unstable * (Math.sin(t * 9.7) * 0.9 + (rand(jit, 3, 91) - 0.5) * 1.8));
    // and the rings shake in their spin, now and then a pixel off true
    const shake = overloaded && rand(Math.floor(t * 11), 5, 93) < 0.4 * unstable;
    const rx = shake ? Math.round((rand(Math.floor(t * 11), 6, 94) - 0.5) * 2.4) : 0;
    const ry = shake ? Math.round((rand(Math.floor(t * 11), 7, 95) - 0.5) * 2.4) : 0;

    // what's behind the drum: the back legs' glow and the metal they spit (hidden till it clears the rim)
    this.stepSparks(dt);
    if (runeK > 1) for (const l of LEGS) if (l.back) X.glow(g, M + l.x, M + l.top - 1, 7, '#ff8a28', Math.min(0.8, 0.4 * (runeK - 1)));
    this.drawSparks(g, true);

    // the drum, lit fading to drained
    this.layer(g, 'drum-clear.png', 1);
    this.layer(g, 'drum-drained-clear.png', 1 - glow);
    this.runeLight(g, t, runeK);
    // a soft halo round the crystal
    // (kept small: at full size the flare's halo showed as a dithered square round the crystal)
    const cx = M + LAYERS.crystal.cx, cy = M + LAYERS.crystal.cy;
    const halo = (0.08 + 0.06 * pulse + 0.22 * unstable * flick + 0.35 * flare) * Math.max(glow, flare);
    if (halo > 0.01) X.glow(g, cx, cy, 14 + 6 * unstable + 8 * flare, flare > 0.3 ? '#fff4d0' : '#ff9a30', halo);

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
      this.strip(g, 'spin-back.png', S, this.phase, 1, rx, ry);
      if (overloaded) this.lightning(g, t, unstable, flare, 'back', bob, rx, ry);
      this.crystal(g, crystalLit, flare, unstable, flick, pulse, bob);
      this.strip(g, 'spin-front.png', S, this.phase, 1, rx, ry);
      if (overloaded) this.lightning(g, t, unstable, flare, 'front', bob, rx, ry);
    }
    if (overloaded) this.spit(dt, Math.max(unstable, flare));
    this.drawSparks(g, false);
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

  /** The drum's runes brighten toward white-hot by k (0..2.6), each a little out of step with the next; past 1 they
   * blaze, a glow round each and round each leg (the bought overload's runes flare out). */
  private runeLight(g: Ctx, t: number, k: number): void {
    if (k <= 0.01) return;
    const M = WELL_MARGIN;
    // the legs' glow first, under the runes, so the runes' own shapes stay crisp on it (a glow on each of the ~220 rune
    // pixels washed the whole drum gold)
    if (k > 1) {
      LEGS.forEach((l, i) => {
        const rs = this.legRunes[i];
        if (l.back || !rs.length) return;
        const my = rs.reduce((a, r) => a + r[1], 0) / rs.length;
        const fl = 0.8 + 0.2 * Math.sin(t * 17 + i * 2.3);
        X.glow(g, M + l.x, M + my, 5 + 1.5 * Math.min(1, k - 1), '#ff8a28', Math.min(0.45, 0.25 * (k - 1) * fl));
      });
    }
    for (const [x, y, r, gg, b] of this.runes) {
      const s = clamp(k * (0.8 + 0.2 * Math.sin(t * 2.6 - x * 0.3 - y * 0.2)), 0, 2.6);
      const m = Math.min(1, s), w = clamp((s - 1.7) / 0.9, 0, 1);   // only the flare drives them on toward white (overloaded, a pale cream read as plastic)
      const hr = HOT[0] + (255 - HOT[0]) * w, hg = HOT[1] + (246 - HOT[1]) * w, hb = HOT[2] + (200 - HOT[2]) * w;
      X.px(g, M + x, M + y, `rgb(${Math.round(r + (hr - r) * m)},${Math.round(gg + (hg - gg) * m)},${Math.round(b + (hb - b) * m)})`);
    }
  }

  /** Overloaded: lightning from points all over the crystal to the rings, a few at a time, each for a moment. `back`:
   * the bolts behind the crystal, to the back rings (drawn before it, so they leap out from behind it); `front`: over it,
   * to the front rings. The flare throws many at once. */
  private lightning(g: Ctx, t: number, unstable: number, flare: number, part: 'back' | 'front', bob: number, rx: number, ry: number): void {
    const f = Math.floor(t * 16), frame = ((Math.floor(this.phase) % RINGS.spin.frames) + RINGS.spin.frames) % RINGS.spin.frames;
    const ends = this.ringPx[part][frame], starts = this.crystalPx;
    if (!ends || !ends.length || !starts.length) return;
    const M = WELL_MARGIN, salt = part === 'back' ? 0 : 50;
    const ccx = M + LAYERS.crystal.cx, ccy = M + LAYERS.crystal.cy + bob;
    const n = flare > 0 ? 3 + Math.round(flare * 5) : 1 + Math.floor(unstable * (part === 'back' ? 1.5 : 2.5));
    for (let a = 0; a < n; a++) {
      if (flare <= 0 && rand(f, a + salt, 61) > 0.3 + unstable * 0.5) continue;
      // from a point on the crystal, to a ring pixel well away from it
      const si = Math.floor(rand(f, a + salt, 66) * (starts.length / 2)) * 2;
      const sx = M + starts[si] + 0.5, sy = M + starts[si + 1] + bob + 0.5;
      let ex = 0, ey = 0;
      for (let tries = 0; tries < 10; tries++) {
        const i = Math.floor(rand(f, a * 13 + tries + salt, 62) * (ends.length / 2)) * 2;
        ex = M + ends[i] + rx; ey = M + ends[i + 1] + ry;
        if (Math.hypot(ex - ccx, ey - ccy) > 16) break;
      }
      this.bolt(g, sx, sy, ex, ey, f * 97 + a + salt, flare);
    }
  }

  /** One bolt, jagged, white-hot at its root, orange at its tip, with now and then a short fork. */
  private bolt(g: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, flare: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(3, Math.round(len / 5));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    const pts: [number, number][] = [[x0, y0]];
    for (let s = 1; s < steps; s++) {
      const k = s / steps, j = (rand(seed, s, 64) - 0.5) * 6 * Math.sin(k * Math.PI);
      pts.push([x0 + (x1 - x0) * k + nx * j, y0 + (y1 - y0) * k + ny * j]);
    }
    pts.push([x1, y1]);
    const hot = Math.min(0.6, flare * 0.6);   // at the flare the whole bolt runs whiter
    for (let i = 1; i < pts.length; i++) {
      const k = Math.max(0, (i - 0.5) / (pts.length - 1) - hot);
      X.line(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], ramp(BOLT_EDGE, k), 2);
    }
    for (let i = 1; i < pts.length; i++) {
      const k = Math.max(0, (i - 0.5) / (pts.length - 1) - hot);
      X.line(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], ramp(BOLT_CORE, k), 1);
    }
    if (rand(seed, 99, 67) < 0.45 && pts.length > 3) {
      const m = Math.floor(pts.length / 2), [bx, by] = pts[m];
      const fx = bx + (x1 - x0) * 0.25 + nx * (rand(seed, 98, 68) - 0.5) * 14, fy = by + (y1 - y0) * 0.25 + ny * (rand(seed, 97, 69) - 0.5) * 14;
      X.line(g, bx, by, fx, fy, ramp(BOLT_EDGE, 0.8), 1);
    }
    X.glow(g, x1, y1, 4, '#ff9a30', 0.7);
  }

  /** A spark from leg i's runes, out from the drum and up: from its rune pixels if it shows, else from where it stands
   * behind the drum (drawn behind it, so it appears over the rim). */
  private legSpark(i: number, speed: number, life: number): void {
    const l = LEGS[i], rs = this.legRunes[i], M = WELL_MARGIN;
    let x: number, y: number;
    if (!l.back && rs.length) { const r = rs[Math.floor(Math.random() * rs.length)]; x = r[0] + 0.5; y = r[1] + 0.5; }
    else { x = l.x + (Math.random() - 0.5) * 3; y = l.top + 2 + Math.random() * (l.back ? 6 : 18); }
    const out = (0.4 + 0.6 * Math.random()) * speed, up = (0.5 + 0.7 * Math.random()) * speed;
    this.sparks.push({
      x: M + x, y: M + y, back: l.back, life: 0, max: life * (0.6 + 0.6 * Math.random()),
      vx: Math.cos(l.a) * out + (Math.random() - 0.5) * 18, vy: -up + Math.sin(l.a) * out * 0.45,
    });
  }

  /** Overloaded: molten metal spitting from the runes of all eight legs, more the hotter it runs. */
  private spit(dt: number, unstable: number): void {
    let want = dt * 70 * unstable * unstable;
    while (want > 0) {
      if (want < 1 && Math.random() > want) break;
      want -= 1;
      this.legSpark(Math.floor(Math.random() * LEGS.length), 55, 0.6);
    }
  }

  /** The flare: a burst from the crystal and every leg's runes erupting at once as the light breaks. */
  private burstSparks(): void {
    const cx = WELL_MARGIN + LAYERS.crystal.cx, cy = WELL_MARGIN + LAYERS.crystal.cy;
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 80;
      this.sparks.push({ x: cx, y: cy, back: false, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7 - 20, life: 0, max: 0.4 + Math.random() * 0.6 });
    }
    for (let i = 0; i < 64; i++) this.legSpark(i % LEGS.length, 85, 0.9);
  }

  private stepSparks(dt: number): void {
    const keep: Spark[] = [];
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life >= s.max) continue;
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 0 || s.y < 0 || s.x >= this.cv.c.width || s.y >= this.cv.c.height) continue;
      keep.push(s);
    }
    this.sparks = keep;
  }

  /** The sparks behind the drum (`back`) or in front of everything. */
  private drawSparks(g: Ctx, back: boolean): void {
    for (const s of this.sparks) {
      if (s.back !== back) continue;
      const k = s.life / s.max;
      const col = k < 0.3 ? '#fff2b0' : k < 0.65 ? '#ffb040' : '#d0502a';
      // a hot spark is two pixels along its flight, then one as it cools
      X.px(g, Math.floor(s.x), Math.floor(s.y), col);
      if (k < 0.5) X.px(g, Math.floor(s.x - s.vx * 0.02), Math.floor(s.y - s.vy * 0.02), col);
      if (k < 0.4) X.glow(g, s.x, s.y, 3, '#ffc050', 0.45 * (1 - k / 0.4));
    }
  }
}
