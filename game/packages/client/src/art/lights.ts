/**
 * Coloured light from spells, added over the lit layers (floor and actors) and under the
 * effects, which are emissive anyway. The Battlefield multiplies a light map into the scene;
 * here each light is a pooled additive sprite whose texture is a banded, ordered-dithered
 * disc, squashed onto the ground (FY), so the light keeps the pixel-art look of its bands.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { FY } from './util';
import * as X from './px';

const RADII = [10, 16, 24, 36, 54, 80, 120];
const LEVELS = 5;

/** A smooth disc, for lights that travel: a dither pattern would be dragged along with them, and read as a decal. */
function softDiscTexture(r: number): Texture {
  const w = r * 2 + 1, h = Math.ceil(r * FY) * 2 + 1, { c, x } = X.canvas(w, h), img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i - r) / r, dy = (j - (h - 1) / 2) / (r * FY), q = Math.sqrt(dx * dx + dy * dy);
    if (q >= 1) continue;
    const k = (j * w + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.pow(1 - q, 2) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

function discTexture(r: number): Texture {
  const w = r * 2 + 1, h = Math.ceil(r * FY) * 2 + 1, { c, x } = X.canvas(w, h), img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i - r) / r, dy = (j - (h - 1) / 2) / (r * FY), q = Math.sqrt(dx * dx + dy * dy);
    if (q >= 1) continue;
    const v = Math.pow(1 - q, 1.5) * LEVELS, lv = Math.floor(v + (X.bay(i, j) - 0.5) * 0.9);
    if (lv <= 0) continue;
    const k = (j * w + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round((Math.min(LEVELS, lv) / LEVELS) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

export class Lights {
  readonly layer = new Container();
  private tex = RADII.map(discTexture);
  private discs = this.tex.map((tex, b) => ({ tex, R: RADII[b] }));
  private softs: { tex: Texture; R: number }[] = [];
  private pool: Sprite[] = [];
  private n = 0;

  /** gain: how strong an intensity-1 light is drawn. */
  constructor(private gain = 0.55) {}

  begin(): void { this.n = 0; }

  /** The disc a light of radius r is drawn with, and that disc's true radius. */
  disc(r: number, soft = false): { tex: Texture; R: number } {
    let b = 0;
    while (b < RADII.length - 1 && RADII[b] < r) b++;
    if (!soft) return this.discs[b];
    return this.softs[b] ??= { tex: softDiscTexture(RADII[b]), R: RADII[b] };
  }

  /** A light at art (x, y) on the ground, radius r art px, colour '#rrggbb', intensity a (0..1+). */
  add(x: number, y: number, r: number, col: string, a: number, soft = false): void {
    if (a <= 0.02 || this.n >= 160) return;
    let s = this.pool[this.n];
    if (!s) { s = new Sprite(this.tex[0]); s.anchor.set(0.5); s.blendMode = 'add'; this.layer.addChild(s); this.pool.push(s); }
    s.texture = this.disc(r, soft).tex;
    s.position.set(Math.round(x), Math.round(y));
    s.tint = X.hexNum(col);
    s.alpha = Math.min(1, a * this.gain);
    s.visible = true;
    this.n++;
  }

  end(): void { for (let i = this.n; i < this.pool.length; i++) this.pool[i].visible = false; }
}
