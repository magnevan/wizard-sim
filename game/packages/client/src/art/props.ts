/**
 * A room's props: image sprites from the asset registry (art/assets.ts). A standing prop sits among
 * the actors, sorted by its spot on the ground as they are by their feet. Its walls keep bodies out of
 * its footprint, so nothing stands where the order would look wrong. A flat one (a rune circle) and
 * every prop's shadow lie in the floor layer, under everything.
 *
 * Props don't animate and the sim doesn't know them: a room is laid out once, and only moves with the camera.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { RoomDef } from '@wizard-sim/sim';
import { FY, PPU } from '../camera';
import { loadTexture, propImage, propMeta, type PropMeta, type PropSet } from './assets';
import { FIELD, gx, gy } from './field';
import * as X from './px';

interface Item { asset: string; meta: PropMeta; spr: Sprite; x: number; y: number; ox: number; oy: number }

export class PropView {
  /** Flat props and shadows. Add this just over the floor. */
  readonly under = new Container();
  private shadows = new Sprite();
  private shadowTex: Texture | null = null;
  private items: Item[] = [];
  private def: RoomDef | null = null;
  private fx = NaN;
  private fy = NaN;
  private wanted = 0;
  /** True once the current set's images are all in place (tests and screenshots wait on it). */
  ready = true;

  constructor(private actors: Container, private tint: number, private current: PropSet) { this.under.addChild(this.shadows); }

  get set(): PropSet { return this.current; }
  set set(s: PropSet) { if (s !== this.current) { this.current = s; void this.dress(); } }

  /** Lays out `def`'s props, if it isn't the room already laid out. Call after the field is fitted. */
  room(def: RoomDef): void {
    if (def === this.def) return;
    this.def = def;
    for (const it of this.items) it.spr.destroy();
    this.items = [];
    this.shadows.visible = false;
    this.shadowTex?.destroy(true);
    this.shadowTex = null;
    this.fx = NaN;
    if (!def.props.length) { this.ready = true; return; }
    const { c, x } = X.canvas(FIELD.W, FIELD.H);
    for (const p of def.props) {
      const meta = propMeta(p.asset);
      if (!meta) continue;
      const spr = new Sprite();
      spr.tint = this.tint; spr.visible = false;
      spr.zIndex = Math.round(gy(p.y)) * 128 + 100;
      (meta.flat ? this.under : this.actors).addChild(spr);
      this.items.push({ asset: p.asset, meta, spr, x: gx(p.x), y: gy(p.y) - (meta.lift ?? 0), ox: 0, oy: 0 });
      if (meta.flat || meta.lift) continue;
      const [fw, fh] = meta.footprint;
      X.shadow(x, gx(p.x), gy(p.y), (fw / 2) * PPU * 0.9, Math.max(2, (fh / 2) * PPU * FY), 10);
    }
    this.shadowTex = Texture.from(c);
    this.shadows.texture = this.shadowTex;
    this.shadows.visible = true;
    void this.dress();
  }

  /** Puts the current set's images on the sprites, all at once when the last has arrived. */
  private async dress(): Promise<void> {
    const ticket = ++this.wanted, items = this.items;
    this.ready = false;
    const art = items.map((it) => propImage(it.asset, this.current));
    const tex = await Promise.all(art.map((a) => (a ? loadTexture(a.url) : Promise.resolve(null))));
    if (ticket !== this.wanted) return; // another set or room was asked for meanwhile
    items.forEach((it, i) => {
      const t = tex[i], a = art[i];
      it.spr.visible = !!t;
      if (!t || !a) return;
      it.spr.texture = t; it.ox = a.foot[0]; it.oy = a.foot[1];
    });
    this.fx = NaN;
    this.ready = true;
  }

  /** Follows the camera: fx0, fy0 is where the field's corner is in the scene. */
  place(fx0: number, fy0: number): void {
    if (fx0 === this.fx && fy0 === this.fy) return;
    this.fx = fx0; this.fy = fy0;
    this.shadows.position.set(fx0, fy0);
    for (const it of this.items) it.spr.position.set(fx0 + Math.round(it.x) - it.ox, fy0 + Math.round(it.y) - it.oy);
  }

  /** Every prop as it stands, for the lighting: its texture, foot, spot in the scene, and id. */
  standing(fn: (tex: Texture, footX: number, footY: number, x: number, y: number, asset: string, flat: boolean) => void): void {
    for (const it of this.items) if (it.spr.visible) fn(it.spr.texture, it.ox, it.oy, it.spr.position.x + it.ox, it.spr.position.y + it.oy, it.asset, !!it.meta.flat || !!it.meta.lift);
  }

  get count(): number { return this.items.length; }
}
