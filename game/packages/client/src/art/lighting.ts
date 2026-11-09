/**
 * Scene lighting, for the isometric camera. Two low-resolution maps are drawn each frame, at art
 * pixels so they stay crisp and multiplied over the scene:
 *
 *   the shadow map, over the ground and under the actors: flat, hard-edged cast shadows from
 *   props, bodies and rock walls (a shadow on the ground must not darken someone standing in front of it);
 *   the light map, over the ground and the actors: the mood's ambient colour, drifting cloud shade,
 *   every spell's light, lamps on props, a small light each wizard carries, and a vignette.
 *
 * Effects drawn over the actors stay out of both maps: they're light, not lit. The look follows
 * what shipped pixel-art games do: a graded mood per time of day (Graveyard Keeper keeps ten), shadows
 * as sheared silhouettes, flat bands with dither only at the seams. A colour matrix over the lit
 * layers takes the edge off saturated art.
 */
import { ColorMatrixFilter, Container, Graphics, RenderTexture, Sprite, Texture, TilingSprite, type Renderer } from 'pixi.js';
import { Lights } from './lights';
import * as X from './px';
import { rand } from './util';

type RGB = readonly [number, number, number];
export interface Mood {
  /** What unlit ground and bodies are multiplied by. */
  ambient: RGB;
  /** The colour of a cast shadow. Hue-shifted, never plain grey. */
  shadow: RGB;
  /** Shadow length per art px of height: to the right and down the screen. 0, 0 casts none. */
  sun: readonly [number, number];
  /** -1 to 1: 0 leaves colour alone. */
  saturate: number;
  /** How dark passing cloud shade gets, 0 for none. */
  clouds: number;
  /** How dark the screen's corners get. */
  vignette: number;
  /** How bright the small light each wizard carries is. */
  carry: number;
}

export const MOODS: Readonly<Record<string, Mood>> = {
  day: { ambient: [0.94, 0.92, 0.87], shadow: [0.62, 0.62, 0.76], sun: [0.55, 0.28], saturate: -0.14, clouds: 0.1, vignette: 0.16, carry: 0 },
  dusk: { ambient: [0.76, 0.66, 0.7], shadow: [0.48, 0.44, 0.62], sun: [0.95, 0.42], saturate: -0.2, clouds: 0.06, vignette: 0.32, carry: 0.2 },
  night: { ambient: [0.38, 0.44, 0.66], shadow: [0.26, 0.3, 0.48], sun: [0.3, 0.15], saturate: -0.34, clouds: 0, vignette: 0.42, carry: 0.55 },
  interior: { ambient: [0.68, 0.61, 0.6], shadow: [0.48, 0.44, 0.54], sun: [0.18, 0.1], saturate: -0.12, clouds: 0, vignette: 0.36, carry: 0.32 },
};
const ROOM_MOOD: Readonly<Record<string, string>> = { academy: 'interior', survive: 'dusk', arena: 'dusk' };
export const moodOf = (room: string, override?: string | null): Mood => MOODS[override ?? ''] ?? MOODS[ROOM_MOOD[room] ?? 'day'];

/** Props that give off light: colour, radius in art px, strength, and how far above the prop's foot it sits. */
export const PROP_LIGHTS: Readonly<Record<string, readonly [string, number, number, number]>> = {
  'crystal-ball': ['#b08aff', 46, 0.6, 18], 'rune-circle': ['#b08aff', 54, 0.5, 0], cauldron: ['#8ef07e', 36, 0.35, 8], armillary: ['#ffd860', 30, 0.25, 14],
  'lantern-post': ['#ffb060', 62, 0.8, 24], 'ward-lamp': ['#9fd8ff', 58, 0.7, 26], 'wax-candle-on-a-brass-holder': ['#ffb060', 26, 0.5, 6], 'campfire-ring': ['#ff8a30', 72, 0.85, 4],
  'test-rig': ['#b08aff', 34, 0.45, 12], 'control-pedestal': ['#ffb060', 26, 0.35, 12], 'small-glowing-blue-crystal': ['#6ab8ff', 22, 0.4, 3],
};

const asNum = (c: RGB): number => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
/** Extra room round the view, so a screen shake never shows an unlit edge. */
const PAD = 12;
/** The height, in art px, a rock wall's shadow is cast from. */
const WALL_H = 22;

function cloudTexture(): Texture {
  const N = 256, cell = 32, P = N / cell, { c, x } = X.canvas(N, N), img = x.createImageData(N, N), d = img.data;
  const lat = (i: number, j: number) => rand(((i % P) + P) % P, ((j % P) + P) % P, 301);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const fx = xx / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const n = (lat(i, j) * (1 - su) + lat(i + 1, j) * su) * (1 - sv) + (lat(i, j + 1) * (1 - su) + lat(i + 1, j + 1) * su) * sv;
    // flat bands, with dither only where one meets the next
    const lv = Math.floor((n - 0.42) * 7 + (X.bay(xx, y) - 0.5) * 0.7);
    const k = (y * N + xx) * 4;
    d[k + 3] = lv <= 0 ? 0 : Math.round((Math.min(3, lv) / 3) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest'; t.source.addressMode = 'repeat';
  return t;
}

function vignetteTexture(w: number, h: number): Texture {
  const { c, x } = X.canvas(w, h), img = x.createImageData(w, h), d = img.data, L = 6;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const e = Math.hypot((i - w / 2) / (w * 0.62), (j - h / 2) / (h * 0.62));
    const lv = Math.floor(Math.max(0, (e - 0.5) * 2) * L + (X.bay(i, j) - 0.5) * 0.8);
    const k = (j * w + i) * 4;
    d[k + 3] = lv <= 0 ? 0 : Math.round((Math.min(L, lv) / L) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

export class SceneLighting {
  readonly shadowSprite = new Sprite();
  readonly lightSprite = new Sprite();
  readonly grade = new ColorMatrixFilter();
  private shadowRoot = new Container();
  private lightRoot = new Container();
  private walls = new Graphics();
  private pool: Sprite[] = [];
  private used = 0;
  private bg = new Sprite(Texture.WHITE);
  private clouds = new TilingSprite({ texture: cloudTexture(), width: 16, height: 16 });
  private vig = new Sprite();
  readonly lights = new Lights(0.9);
  private shadowTex: RenderTexture | null = null;
  private lightTex: RenderTexture | null = null;
  private w = 0;
  private h = 0;
  private mood = MOODS.day;
  private shadowCol = 0;

  constructor() {
    this.shadowSprite.blendMode = 'multiply';
    this.lightSprite.blendMode = 'multiply';
    this.shadowRoot.addChild(this.walls);
    this.clouds.tint = 0x000000;
    this.vig.tint = 0x000000;
    this.lightRoot.addChild(this.bg, this.clouds, this.lights.layer, this.vig);
    this.shadowSprite.position.set(-PAD, -PAD);
    this.lightSprite.position.set(-PAD, -PAD);
    this.shadowRoot.position.set(PAD, PAD);
    this.lightRoot.position.set(PAD, PAD);
    this.bg.position.set(-PAD, -PAD);
    this.clouds.position.set(-PAD, -PAD);
    this.vig.position.set(-PAD, -PAD);
  }

  /** The art-pixel size of the view. Remakes the maps when it changes. */
  fit(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const W = w + 2 * PAD, H = h + 2 * PAD;
    this.shadowTex?.destroy(true); this.lightTex?.destroy(true);
    const make = () => RenderTexture.create({ width: W, height: H, resolution: 1, scaleMode: 'nearest', antialias: false });
    this.shadowTex = make(); this.lightTex = make();
    this.shadowSprite.texture = this.shadowTex; this.lightSprite.texture = this.lightTex;
    this.bg.width = W; this.bg.height = H;
    this.clouds.width = W; this.clouds.height = H;
    this.vig.texture?.destroy(true);
    this.vig.texture = vignetteTexture(W, H);
  }

  begin(mood: Mood, ct: number, fx0: number, fy0: number): void {
    this.mood = mood;
    this.shadowCol = asNum(mood.shadow);
    this.used = 0;
    this.walls.clear();
    this.bg.tint = asNum(mood.ambient);
    this.clouds.alpha = mood.clouds;
    this.clouds.visible = mood.clouds > 0;
    // cloud shade is anchored to the world and drifts over it
    this.clouds.tilePosition.set(fx0 + ct * 3, fy0 + ct * 1.5);
    this.vig.alpha = mood.vignette;
    this.grade.reset();
    this.grade.saturate(mood.saturate);
    this.lights.begin();
  }

  /** A cast shadow from a sprite standing with its foot at scene x, y. */
  shadow(tex: Texture, footX: number, footY: number, x: number, y: number): void {
    const [sx, sy] = this.mood.sun;
    if (!sx && !sy) return;
    let s = this.pool[this.used];
    if (!s) { s = new Sprite(); this.shadowRoot.addChild(s); this.pool.push(s); }
    s.texture = tex;
    s.visible = true;
    s.tint = this.shadowCol;
    s.pivot.set(footX, footY);
    s.position.set(x, y);
    // height (up the image) is laid along the ground, in the sun's direction
    s.scale.set(1, -Math.hypot(sx, sy));
    s.skew.x = Math.atan2(sx, sy);
    this.used++;
  }

  /** The shadow of a rock wall standing on a line in scene px. */
  wall(x1: number, y1: number, x2: number, y2: number): void {
    const [sx, sy] = this.mood.sun;
    if (!sx && !sy) return;
    const dx = sx * WALL_H, dy = sy * WALL_H;
    this.walls.poly([x1, y1, x2, y2, x2 + dx, y2 + dy, x1 + dx, y1 + dy]).fill(this.shadowCol);
  }

  /** Draws the maps. Call after every shadow and light is in, and after the actors' frames are uploaded. */
  render(renderer: Renderer): void {
    if (!this.shadowTex || !this.lightTex) return;
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
    this.lights.end();
    renderer.render({ container: this.shadowRoot, target: this.shadowTex, clear: true, clearColor: [1, 1, 1, 1] });
    renderer.render({ container: this.lightRoot, target: this.lightTex, clear: true, clearColor: [1, 1, 1, 1] });
  }

  get carry(): number { return this.mood.carry; }
}
