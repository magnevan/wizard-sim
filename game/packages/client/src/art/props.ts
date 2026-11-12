/**
 * A room's props: image sprites from the asset registry (art/assets.ts). A standing prop sits among
 * the actors, sorted by its spot on the ground as they are by their feet. Its walls keep bodies out of
 * its footprint, so nothing stands where the order would look wrong. A flat one (a rune circle) and
 * every prop's shadow lie in the floor layer, under everything.
 *
 * Props don't animate and the sim doesn't know them: a room is laid out once, and only moves with the camera.
 */
import { BATTERY, type World } from '@wizard-sim/sim';
import { toX, toY } from '../iso-world';
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { RoomDef } from '@wizard-sim/sim';
import { FY, PPU } from '../camera';
import { loadTexture, propImage, propMeta, type PropMeta, type PropSet } from './assets';
import { FIELD, gx, gy } from './field';
import { towersLit, unstable, wellPower } from './power-down';
import * as X from './px';
import { clamp } from './util';
import { WELL_MARGIN, WellAnim } from './well-anim';

/** `lit`: how much of its own light it gives now (the battery's power going down); `over`: its burnt-out art, laid over it. */
interface Item { asset: string; meta: PropMeta; spr: Sprite; x: number; y: number; ox: number; oy: number; lit: number; over?: { spr: Sprite; ox: number; oy: number; ready: boolean } }

const HEAD = 'defence-head-north-east';
/** What the battery's pieces fade into as the power goes down. */
const BURNT: Readonly<Record<string, string>> = { 'defence-tower': 'defence-tower-burnt', [HEAD]: 'defence-head-burnt', 'battery-well': 'battery-well-drained' };

/** The flame turret's head: pre-rendered facings across its swing, in one sheet (tools/turret-3d). */
interface HeadSheet { cell: number; facings: number[]; collar: [number, number]; pivot: [number, number]; tips: [number, number][] }
const sheets = import.meta.glob('../../../../content/assets/turrets/flame/sheet.json', { eager: true, import: 'default' });
const sheetUrls = import.meta.glob<string>('../../../../content/assets/turrets/flame/sheet.png', { eager: true, query: '?url', import: 'default' });
const SHEET = Object.values(sheets)[0] as HeadSheet;
const SHEET_URL = Object.values(sheetUrls)[0];
/** How fast a head turns, degrees a second. It eases toward the aim, so the facings pass one at a time. */
const TURN_RATE = 320;
/** Each tower's head, degrees from straight out. Client-only: the sim aims straight at the cursor. */
const headDeg = new Float64Array(8);
const facingOf = (deg: number): number => {
  const f = SHEET.facings, step = (f[f.length - 1] - f[0]) / (f.length - 1);
  return Math.max(0, Math.min(f.length - 1, Math.round((deg - f[0]) / step)));
};

/**
 * How far the barrel's root is above the swivel, art px. The barrel is level, so what the eye reads as its line runs
 * from there to the nozzle: fitted from sheet.json, where every tip is 40 px out along the ground from a point this high.
 */
export const BARREL_RISE = 9.6;

/** Defence k's nozzle tip as it's drawn now, and the tower's spot on the ground under it, field px. */
export function towerTip(w: World, k: number): { tip: [number, number]; swivel: [number, number]; ground: [number, number] } | null {
  const tower = w.def.props.filter((p) => p.asset === 'defence-tower')[k];
  if (!tower || !SHEET) return null;
  const t = SHEET.tips[facingOf(headDeg[k])], x = gx(tower.x), y = gy(tower.y);
  return { tip: [x + SHEET.collar[0] + t[0] - SHEET.pivot[0], y + SHEET.collar[1] + t[1] - SHEET.pivot[1]], swivel: [x + SHEET.collar[0], y + SHEET.collar[1]], ground: [x, y] };
}

/** The field point this seat's fire comes from if it's driving a defence, else null. */
export function headTip(w: World, seat: number): [number, number] | null {
  const k = w.battery ? w.battery.drive[seat] : -1;
  return k < 0 ? null : towerTip(w, k)?.tip ?? null;
}

/** How many defences have a working head (not burnt out). */
export const liveHeads = (w: World): number => (w.battery ? w.def.props.filter((p) => p.asset === HEAD).length : 0);

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

  private headFrames: Texture[] = [];
  private headClock = 0;
  constructor(private actors: Container, private tint: number, private current: PropSet) { this.under.addChild(this.shadows); }

  get set(): PropSet { return this.current; }
  set set(s: PropSet) { if (s !== this.current) { this.current = s; void this.dress(); } }

  /** Lays out `def`'s props, if it isn't the room already laid out. Call after the field is fitted. */
  room(def: RoomDef): void {
    if (def === this.def) return;
    this.def = def;
    for (const it of this.items) { it.spr.destroy(); it.over?.spr.destroy(); }
    this.items = [];
    this.wellOn = false;
    this.shadows.visible = false;
    this.shadowTex?.destroy(true);
    this.shadowTex = null;
    this.fx = NaN;
    if (!def.props.length) { this.wanted++; this.ready = true; return; } // a dress still on its way is for the old room
    const { c, x } = X.canvas(FIELD.W, FIELD.H);
    for (const p of def.props) {
      const meta = propMeta(p.asset);
      if (!meta) continue;
      const spr = new Sprite();
      spr.tint = this.tint; spr.visible = false;
      spr.zIndex = Math.round(gy(p.y) + (meta.sort ?? 0)) * 128 + 100;
      (meta.flat ? this.under : this.actors).addChild(spr);
      this.items.push({ asset: p.asset, meta, spr, x: gx(p.x), y: gy(p.y) - (meta.lift ?? 0), ox: 0, oy: 0, lit: 1 });
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
    if (items.some((it) => it.asset === HEAD) && !this.headFrames.length) {
      const base = await loadTexture(SHEET_URL);
      this.headFrames = SHEET.facings.map((_, i) => new Texture({ source: base.source, frame: new Rectangle(i * SHEET.cell, 0, SHEET.cell, SHEET.cell) }));
    }
    // the well's top is painted each frame (art/well-anim.ts), on the same foot with room round it for the rings
    const top = items.find((it) => it.asset === 'battery-well-top'), topArt = top ? propImage(top.asset, this.current) : null;
    if (top && topArt && (this.well.ready || (await this.well.load())) && ticket === this.wanted) {
      top.spr.texture = this.well.tex; top.ox = topArt.foot[0] + WELL_MARGIN; top.oy = topArt.foot[1] + WELL_MARGIN; top.spr.visible = true;
      this.wellOn = true;
    }
    this.fx = NaN;
    this.ready = true;
  }

  /** Every defence's head: a driven one eases toward its driver's aim, an idle one back to straight out. */
  turnHeads(w: World, fx0: number, fy0: number): void {
    if (!w.battery || !this.headFrames.length) return;
    const now = performance.now(), dt = Math.min(0.1, (now - this.headClock) / 1000), limit = BATTERY.swing * 360;
    this.headClock = now;
    let k = 0;
    for (const it of this.items) {
      if (it.asset !== HEAD) continue;
      const n = k++, seat = w.battery.drive.indexOf(n);
      let want = 0;
      if (seat >= 0) {
        // at the ground under the cursor, as the sim aims (aimFromTower): the view's world is turned, so it's turned back
        const tw = w.def.props.filter((p) => p.asset === 'defence-tower')[n];
        const ax = w.bodies.x[seat] + w.seats.aimX[seat] - tw.x, ay = w.bodies.y[seat] + w.seats.aimY[seat] - tw.y;
        want = Math.max(-limit, Math.min(limit, (Math.atan2(toX(ax, ay), -toY(ax, ay)) * 180) / Math.PI));
      }
      const gap = want - headDeg[n], most = TURN_RATE * dt;
      headDeg[n] += Math.max(-most, Math.min(most, gap));
      const tex = this.headFrames[facingOf(headDeg[n])];
      if (it.spr.texture === tex) continue;
      it.spr.texture = tex; it.ox = SHEET.pivot[0] - SHEET.collar[0]; it.oy = SHEET.pivot[1] - SHEET.collar[1];
      it.spr.position.set(fx0 + Math.round(it.x) - it.ox, fy0 + Math.round(it.y) - it.oy);
    }
  }

  private broken = false;
  private brokenTex: { tex: Texture; foot: readonly [number, number] } | null = null;
  /**
   * The battery's stakes, whole or knocked over (stakes-broken, a local edit: tools/art-import/stakes_broken.py). They
   * break as a defence is taken (sim/src/battery-waves.ts). Returns true on the frame they break.
   */
  breakStakes(broken: boolean, fx0: number, fy0: number): boolean {
    if (broken === this.broken) return false;
    const img = propImage(broken ? 'stakes-broken' : 'stakes', this.current);
    if (!img) return false;
    if (broken && !this.brokenTex) { void loadTexture(img.url).then((tex) => { this.brokenTex = { tex, foot: img.foot }; }); return false; }
    this.broken = broken;
    for (const it of this.items) {
      if (it.asset !== 'stakes') continue;
      if (broken) { it.spr.texture = this.brokenTex!.tex; it.ox = this.brokenTex!.foot[0]; it.oy = this.brokenTex!.foot[1]; }
      else { const a = propImage('stakes', this.current); if (a) void loadTexture(a.url).then((t) => { it.spr.texture = t; it.ox = a.foot[0]; it.oy = a.foot[1]; it.spr.position.set(fx0 + Math.round(it.x) - it.ox, fy0 + Math.round(it.y) - it.oy); }); }
      it.spr.position.set(fx0 + Math.round(it.x) - it.ox, fy0 + Math.round(it.y) - it.oy);
    }
    return broken;
  }

  private well = new WellAnim();
  private wellOn = false;
  /**
   * The battery, each frame: the well alive (art/well-anim.ts), and its power going down as an animation once it runs
   * dry (art/power-down.ts). Towers and heads fade, sputtering, into their burnt-out art laid over them
   * (tools/art-import/defence.py), the well's steps into their drained version (tools/art-import/well_drained.py), and
   * every one's light with them (standing()'s `lit`).
   */
  powerDown(w: World, t: number, fx0: number, fy0: number): void {
    if (!w.battery) return;
    const towers = towersLit(w), power = wellPower(w);
    const glow = this.wellOn ? this.well.draw(t, power, unstable(w)) : power; // the well's light pulses with its crystal
    for (const it of this.items) {
      if (it.asset === 'battery-well-top' || it.asset === 'control-pedestal') { it.lit = it.asset === 'control-pedestal' ? towers : glow; continue; }
      const fade = it.asset === 'defence-tower' || it.asset === HEAD ? 1 - towers : it.asset === 'battery-well' ? 1 - power : -1;
      if (fade < 0) continue;
      it.lit = it.asset === 'battery-well' ? glow : 1 - fade; // the well's light is at its steps' foot
      this.overlay(it, BURNT[it.asset], fade, fx0, fy0);
    }
  }

  /** Lays `asset` over item `it` at opacity `a` (loaded the first time it's wanted). */
  private overlay(it: Item, asset: string, a: number, fx0: number, fy0: number): void {
    if (!it.over) {
      if (a <= 0.001) return;
      const img = propImage(asset, this.current);
      if (!img) return;
      const spr = new Sprite(), ticket = this.wanted;
      spr.tint = this.tint; spr.visible = false; spr.zIndex = it.spr.zIndex + 1;
      it.over = { spr, ox: img.foot[0], oy: img.foot[1], ready: false };
      it.spr.parent?.addChild(spr);
      void loadTexture(img.url).then((tex) => { if (ticket !== this.wanted || !it.over) return; spr.texture = tex; it.over.ready = true; });
    }
    const o = it.over;
    o.spr.visible = o.ready && a > 0.001;
    o.spr.alpha = clamp(a, 0, 1);
    o.spr.position.set(fx0 + Math.round(it.x) - o.ox, fy0 + Math.round(it.y) - o.oy);
  }

  /** Follows the camera: fx0, fy0 is where the field's corner is in the scene. */
  place(fx0: number, fy0: number): void {
    if (fx0 === this.fx && fy0 === this.fy) return;
    this.fx = fx0; this.fy = fy0;
    this.shadows.position.set(fx0, fy0);
    for (const it of this.items) {
      it.spr.position.set(fx0 + Math.round(it.x) - it.ox, fy0 + Math.round(it.y) - it.oy);
      it.over?.spr.position.set(fx0 + Math.round(it.x) - it.over.ox, fy0 + Math.round(it.y) - it.over.oy);
    }
  }

  /** Every standing prop's sprite and where its foot is in the scene. */
  sprites(fn: (s: Sprite, x: number, y: number) => void): void {
    for (const it of this.items) if (it.spr.visible && !it.meta.flat) fn(it.spr, it.spr.position.x + it.ox, it.spr.position.y + it.oy);
  }

  /** Every prop as it stands, for the lighting: its texture, foot, spot in the scene, id, and how lit it is (its own light, 0..1). */
  standing(fn: (tex: Texture, footX: number, footY: number, x: number, y: number, asset: string, flat: boolean, lit: number) => void): void {
    for (const it of this.items) if (it.spr.visible) fn(it.spr.texture, it.ox, it.oy, it.spr.position.x + it.ox, it.spr.position.y + it.oy, it.asset, !!it.meta.flat || !!it.meta.lift, it.lit);
  }

  get count(): number { return this.items.length; }
}
