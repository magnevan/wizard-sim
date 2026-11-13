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
 *   repaired    (`repair` 0 to 1) the fall played back, the rings lifting, the light returning, then the spin again,
 *               steady, from the very pose the fall began in (no snap)
 *
 * All of it is one canvas, the well-top prop's texture, so it sorts among the actors as the prop did (art/props.ts).
 * `game/scripts/well-frames.mjs` paints each state directly.
 */
import { Texture } from 'pixi.js';
import * as X from './px';
import type { Ctx } from './px';
import { clamp, rand } from './util';

interface Layers { size: [number, number]; crystal: { cx: number; cy: number; bottom: number }; seams: number[][] }
/** A strip of frames: `cols` cells to a row (all of them in one row when absent); each cell `top` rows taller than the
 * layers' crop, above it (the 3D rings reach a little higher than the bought ones). */
interface Strip { frames: number; cell: [number, number]; cols?: number; top?: number; fps?: number; release?: number; spinStep?: number }
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
/** The visible legs' rune columns on the layer, x from to (the left, front and right legs). */
const FIRE_COLS: readonly [number, number][] = [[29, 33], [48, 55], [71, 74]];
/** Which ways flame licks off a rune's stroke, and how far at full heat: up the most, a little to either side. */
const FLAME_DIRS: readonly (readonly [number, number, number])[] = [[0, -1, 2.8], [-1, 0, 1.6], [1, 0, 1.6]];
/** Lightning's colour from root to tip: white-hot at the crystal, orange where it strikes (the bought flare's). */
const BOLT_CORE = ['#ffffff', '#fff2b8', '#ffc860', '#ff8a28'];
const BOLT_EDGE = ['#ffe8a0', '#ffb848', '#ff8a28', '#d04a18'];

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; back: boolean }
/** One piece of a bolt: k 0 at its root .. 1 at its tips (its colour), w 2 for the main path, 1 for forks. */
interface BoltSeg { x0: number; y0: number; x1: number; y1: number; k: number; w: number }
/** A bolt, shaped once when it's born and held for its short life; `strike`: it ends on a ring at (ex, ey). */
interface Bolt { born: number; life: number; back: boolean; strike: boolean; ex: number; ey: number; segs: BoltSeg[] }

/** The repair: the fall plays back till LIFT, then the spin; the light comes back from LIGHT_FROM over LIGHT_SPAN. */
const LIFT = 0.85, LIGHT_FROM = 0.35, LIGHT_SPAN = 0.55;
/** How lit the well is at `repair` 0..1 (its runes, crystal and rings; the steps' light follows it, art/props.ts). */
export const wellLit = (repair: number): number => clamp((repair - LIGHT_FROM) / LIGHT_SPAN, 0, 1);

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
  /** The spin's place, in frames (it speeds up and slows, so it's integrated, not taken from the clock). */
  private phase = 0;
  /** Were the rings down (fallen, or still rising) last frame? Leaving that, the spin starts from the fall's first pose. */
  private down = false;
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
  /** Every rune pixel, as x * 256 + y; and the rune pixels on the legs' rune columns, which burn when overloaded. */
  private runeSet = new Set<number>();
  private legGlyphs: number[][] = [];
  private bolts: Bolt[] = [];

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
    // the glyphs that burn: those on the three rune columns that show, on the front legs (where the rune pixels crowd,
    // read off the bought drum; the panels between carry stray ones)
    this.runeSet = new Set(this.runes.map((r) => r[0] * 256 + r[1]));
    this.legGlyphs = this.runes.filter((r) => FIRE_COLS.some(([x0, x1]) => r[0] >= x0 && r[0] <= x1));
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

  /** Draws frame k of a strip at the canvas's layer origin (moved dx, dy), at opacity a. */
  private strip(g: Ctx, name: string, s: Strip, k: number, a = 1, dx = 0, dy = 0): void {
    if (a <= 0.001) return;
    const [W, H] = s.cell, [sx, sy] = cellAt(s, k);
    g.globalAlpha = a;
    g.drawImage(this.img[name], sx, sy, W, H, WELL_MARGIN + dx, WELL_MARGIN + dy - (s.top ?? 0), W, H);
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
    const { c, x: g } = this.cv, M = WELL_MARGIN;
    const dt = this.last < 0 ? 0 : clamp(t - this.last, 0, 0.1);
    this.last = t;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g._fs = null;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // once the repair has begun it decides everything; the power-down is over by then
    if (repair > 0) power = 0;
    const dead = 1 - power, pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    const flick = unstable > 0 ? 0.8 + 0.2 * rand(Math.floor(t * 9), 1, 77) : 1;
    const falling = repair > 0 ? repair < LIFT : dead > FLARE;
    const S = RINGS.spin, F = RINGS.fall, rel = F.release ?? 0;
    // the rings back up: the spin picks up from the last pose the fall played back to, the one it left the spin from
    if (this.down && !falling && repair > 0) this.phase = Math.max(0, rel - 1) * (F.spinStep ?? 0);
    this.down = falling;
    if (!falling) this.phase += dt * (SPIN_FPS + OVERLOAD_FPS * unstable);
    if (dead <= 0) this.burst = false;

    // how lit each part is: the runes and the crystal glow (0 dark .. 1 full, more when overloaded), the rings' light
    let glow: number, ringsLit: number, crystalLit: number, flare = 0;
    if (repair > 0) {
      const k = wellLit(repair);
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
    this.runeFire(g, t, runeK);
    // a soft halo round the crystal
    // (kept small: at full size the flare's halo showed as a dithered square round the crystal)
    const cx = M + LAYERS.crystal.cx, cy = M + LAYERS.crystal.cy;
    const halo = (0.08 + 0.06 * pulse + 0.22 * unstable * flick + 0.35 * flare) * Math.max(glow, flare);
    if (halo > 0.01) X.glow(g, cx, cy, 14 + 6 * unstable + 8 * flare, flare > 0.3 ? '#fff4d0' : '#ff9a30', halo);

    if (falling) {
      // the crystal, then the fallen rings over it (the fall's stand-ins already cut them where the well covers them).
      // Falling, from the release on; rising, back to the frame before it, which is a pose of the spin's (rings.py)
      this.crystal(g, crystalLit, flare, unstable, flick, pulse, 0);
      const from = repair > 0 ? Math.max(0, rel - 1) : rel;
      const k = repair > 0 ? 1 - clamp(repair / LIFT, 0, 1) : clamp((dead - FLARE) / (1 - FLARE), 0, 1);
      const f = Math.round(from + k * (F.frames - 1 - from));
      this.strip(g, 'fall-dark.png', F, f, 1);
      this.strip(g, 'fall.png', F, f, ringsLit);
    } else {
      // the lightning lives between the layers, so the rings in front of it cover it (drawn last, it cut across the
      // front bands, the user): behind the crystal to the back rings, then over the crystal to the front rings, then the
      // front rings, then only the flashes where bolts strike
      if (overloaded) this.spawnBolts(dt, unstable, flare, bob, rx, ry);
      this.strip(g, 'spin-back.png', S, this.phase, 1, rx, ry);
      this.drawBolts(g, t, true);
      this.crystal(g, crystalLit, flare, unstable, flick, pulse, bob);
      this.drawBolts(g, t, false);
      this.strip(g, 'spin-front.png', S, this.phase, 1, rx, ry);
      this.drawStrikes(g, t);
    }
    if (falling) this.bolts = [];
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

  /**
   * The runes' fire, overloaded and at the flare (the bought overload's runes burn and flare out): the rune glyphs on
   * the legs blaze, and flame licks off their own strokes, up and out to the sides, a few pixels at most. The glyphs
   * burn, not the leg (filling the rune column made a bar of fire, the user). The flame's reach drifts with slow waves
   * over each stroke, so it licks rather than flickers.
   */
  private runeFire(g: Ctx, t: number, k: number): void {
    const f = clamp((k - 0.9) / 0.7, 0, 1.6);   // about 1 overloaded, more at the flare
    if (f <= 0.02) return;
    const M = WELL_MARGIN, cols = ['#ffd060', '#ff9a30', '#e0602a'], on = this.runeSet;
    for (const [x, y] of this.legGlyphs) {
      const v = 0.5 + 0.5 * Math.sin(x * 2.1 + y * 1.3 + t * 4.5) * Math.sin(x * 0.7 - y * 0.9 - t * 2.9);
      // the stroke itself, hottest where the flame swells
      if (v * f > 0.55) X.px(g, M + x, M + y, '#fff0b8');
      // flame off its open edges: up the most, a little to either side
      for (const [dx, dy, reach] of FLAME_DIRS) {
        if (on.has((x + dx) * 256 + y + dy)) continue;
        const n = Math.round(f * v * reach);
        for (let d = 1; d <= n; d++) {
          const px = x + dx * d, py = y + dy * d;
          if (on.has(px * 256 + py)) break;
          X.px(g, M + px, M + py, cols[Math.min(cols.length - 1, d - 1)]);
        }
      }
    }
  }

  /** A jagged line from (x0, y0) to (x1, y1): its midpoints pushed sideways by up to `rough` of each piece's length, again
   * and again, till the pieces are about 3 px. */
  private static jag(x0: number, y0: number, x1: number, y1: number, rough: number): [number, number][] {
    let pts: [number, number][] = [[x0, y0], [x1, y1]];
    for (let pass = 0; pass < 6; pass++) {
      const next: [number, number][] = [pts[0]];
      let split = false;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
        if (len > 3) {
          const j = (Math.random() - 0.5) * len * rough;
          next.push([(ax + bx) / 2 - ((by - ay) / len) * j, (ay + by) / 2 + ((bx - ax) / len) * j]);
          split = true;
        }
        next.push(pts[i]);
      }
      pts = next;
      if (!split) break;
    }
    return pts;
  }

  /**
   * A bolt: a jagged main path with forks off it, and forks off those, each fork thinner and redder further out (the
   * bought overload's lightning branches; a single line from the core read as a laser). `k` along each piece is how far
   * from the root it is, for its colour.
   */
  private makeBolt(x0: number, y0: number, x1: number, y1: number, back: boolean, strike: boolean, life: number): Bolt {
    const segs: BoltSeg[] = [], main = WellAnim.jag(x0, y0, x1, y1, 0.55);
    const add = (pts: [number, number][], k0: number, k1: number, w: number): void => {
      for (let i = 1; i < pts.length; i++) segs.push({ x0: pts[i - 1][0], y0: pts[i - 1][1], x1: pts[i][0], y1: pts[i][1], k: k0 + (k1 - k0) * (i / pts.length), w });
    };
    add(main, 0, 1, 2);
    let forks = 0;
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 2; i < main.length - 2 && forks < 4; i++) {
      if (Math.random() > 0.22) continue;
      forks++;
      const k = i / main.length, [bx, by] = main[i];
      const a = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.6);
      const fl = (0.2 + Math.random() * 0.25) * len * (1 - 0.4 * k) + 3;
      const fork = WellAnim.jag(bx, by, bx + Math.cos(a) * fl, by + Math.sin(a) * fl, 0.6);
      add(fork, k + 0.15, Math.min(1, k + 0.6), 1);
      if (Math.random() < 0.4 && fork.length > 3) {
        const [sx, sy] = fork[Math.floor(fork.length / 2)], b = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
        add(WellAnim.jag(sx, sy, sx + Math.cos(b) * fl * 0.45, sy + Math.sin(b) * fl * 0.45, 0.6), k + 0.4, 1, 1);
      }
    }
    return { born: this.last, life, back, strike, ex: x1, ey: y1, segs };
  }

  /** Overloaded: new bolts now and then (each lives a fraction of a second with one shape; re-drawn every frame they
   * read as a sped-up film, the user): long ones from the crystal to the rings, behind it to the back rings or over it
   * to the front ones, and short crackles off the crystal. The flare throws many at once. */
  private spawnBolts(dt: number, unstable: number, flare: number, bob: number, rx: number, ry: number): void {
    const frame = ((Math.floor(this.phase) % RINGS.spin.frames) + RINGS.spin.frames) % RINGS.spin.frames;
    const starts = this.crystalPx, M = WELL_MARGIN;
    if (!starts.length) return;
    const ccx = M + LAYERS.crystal.cx, ccy = M + LAYERS.crystal.cy + bob;
    const from = (): [number, number] => {
      const i = Math.floor(Math.random() * (starts.length / 2)) * 2;
      return [M + starts[i] + 0.5, M + starts[i + 1] + bob + 0.5];
    };
    const count = (rate: number): number => { const n = rate * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
    // bolts to the rings
    for (let n = count(unstable * 6 + flare * 26); n > 0; n--) {
      const back = Math.random() < 0.4, ends = this.ringPx[back ? 'back' : 'front'][frame];
      if (!ends || !ends.length) continue;
      let ex = 0, ey = 0;
      for (let tries = 0; tries < 10; tries++) {
        const i = Math.floor(Math.random() * (ends.length / 2)) * 2;
        ex = M + ends[i] + rx + 0.5; ey = M + ends[i + 1] - (RINGS.spin.top ?? 0) + ry + 0.5;
        if (Math.hypot(ex - ccx, ey - ccy) > 15) break;
      }
      const [sx, sy] = from();
      this.bolts.push(this.makeBolt(sx, sy, ex, ey, back, true, 0.22 + Math.random() * 0.22 + flare * 0.15));
    }
    // crackles: short forked sparks off the crystal into the air round it
    for (let n = count(unstable * 6 + flare * 30); n > 0; n--) {
      const [sx, sy] = from(), a = Math.atan2(sy - ccy, sx - ccx) + (Math.random() - 0.5) * 1.4, l = 5 + Math.random() * 8 + flare * 6;
      this.bolts.push(this.makeBolt(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, Math.random() < 0.35, false, 0.12 + Math.random() * 0.14));
    }
  }

  /** The live bolts behind the crystal (`back`) or over it; each holds its shape, bright, then fades out. */
  private drawBolts(g: Ctx, t: number, back: boolean): void {
    this.bolts = this.bolts.filter((b) => t - b.born < b.life && t >= b.born);
    for (const b of this.bolts) {
      if (b.back !== back) continue;
      const age = (t - b.born) / b.life;
      g.globalAlpha = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.45;
      const hot = age < 0.15 ? 0.3 : 0;   // the first moment of a strike runs whiter
      for (const s of b.segs) if (s.w > 1) X.line(g, s.x0, s.y0, s.x1, s.y1, ramp(BOLT_EDGE, s.k - hot), 2);
      for (const s of b.segs) X.line(g, s.x0, s.y0, s.x1, s.y1, ramp(BOLT_CORE, s.k - hot + (s.w > 1 ? 0 : 0.2)), 1);
      if (back && b.strike) X.glow(g, b.ex, b.ey, 3, '#ff9a30', 0.6);
      g.globalAlpha = 1;
    }
  }

  /** Where the bolts over the crystal strike the front rings: a flash on the band, over it. */
  private drawStrikes(g: Ctx, t: number): void {
    for (const b of this.bolts) {
      if (b.back || !b.strike) continue;
      const age = (t - b.born) / b.life, a = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.45;
      X.glow(g, b.ex, b.ey, 3.5, '#ffb040', 0.7 * a);
      if (age < 0.5) X.px(g, Math.floor(b.ex), Math.floor(b.ey), '#fff2b0');
    }
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
