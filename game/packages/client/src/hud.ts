/**
 * The rune HUD in the pixel view: hud-core.ts draws it into small canvases, and this hands each one to Pixi as a sprite
 * (nearest scaling, so it stays crisp at the integer scale), moving and showing it where the drawing says.
 */
import { Sprite, Texture } from 'pixi.js';
import type { World } from '@wizard-sim/sim';
import { HudCore, type HudLayer } from './hud-core';

export class Hud extends HudCore {
  /** The rune bar and its chips. */
  readonly sprite: Sprite;
  /** The wave strip at the top of the view (the Arena), or a mode's banner. */
  readonly top: Sprite;
  /** Survive: each player's power-ups (top left), and the run-over card (centre). */
  readonly perks: Sprite;
  readonly over: Sprite;
  private shown: [HudLayer, Sprite, Texture][] = [];

  constructor(seat = 0) {
    super(seat);
    const L = this.layers, sprite = (l: HudLayer): Sprite => {
      const tex = Texture.from(l.c);
      tex.source.scaleMode = 'nearest';
      const s = new Sprite(tex);
      s.visible = l.visible;
      this.shown.push([l, s, tex]);
      return s;
    };
    this.top = sprite(L.top); this.sprite = sprite(L.bar); this.perks = sprite(L.perks); this.over = sprite(L.over);
  }

  /** Frees the HUD's canvases' textures (a view going away). */
  destroy(): void { for (const [, , tex] of this.shown) tex.destroy(true); }

  draw(w: World, t: number, viewW: number, viewH: number): void {
    super.draw(w, t, viewW, viewH);
    for (const [l, s, tex] of this.shown) {
      s.visible = l.visible;
      s.position.set(l.x, l.y);
      if (l.dirty) { tex.source.update(); l.dirty = false; }
    }
  }
}
