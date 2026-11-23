/**
 * A concept's grey box: buildings as plain blocks at their real size, drawn in the real camera so
 * their scale can be judged against a wizard before any art exists (on in the yard; ?massing=off hides it). Client only,
 * a preview: the sim never sees it, nothing collides with it, and no room hash changes.
 *
 * Blocks are given on the level's plan (units, origin at the map's top-left, as in yard-level.py)
 * with heights in metres. The camera looks toward the plan's north-west, so a block shows its south
 * face, its east face and the slope of its roof that faces them. Openings (windows, doors, a
 * passage) are dark quads on those faces, so a storey and a door read at a glance.
 *
 * Scale: a wizard is 0.9 u across and about 26 art px tall with his hat, so 1 u is about 0.6 m
 * on the ground and a metre of height is about 14.5 art px.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { toU, toV, toX, toY } from '../iso-world';
import { gx, gy } from './field';
import { opt } from '../dev-options';
import { PX_PER_M } from './heights';
import { loadTexture } from './assets';

/** The buildings' painted art (tools/building-art/cut.py): an image and where its block's (x1, y1, 0) lands in it. */
const ART_URL = import.meta.glob<string>('../../../../content/assets/buildings/*.png', { eager: true, query: '?url', import: 'default' });
const ART_META = import.meta.glob<{ anchor: [number, number] }>('../../../../content/assets/buildings/*.json', { eager: true, import: 'default' });
const artOf = (name: string): { url: string; anchor: [number, number] } | null => {
  const key = (ext: string) => `../../../../content/assets/buildings/${name}.${ext}`;
  const url = ART_URL[key('png')], meta = ART_META[key('json')];
  return url && meta ? { url, anchor: meta.anchor } : null;
};

export { PX_PER_M } from './heights';
/** Ground units per metre (a wizard 0.9 u across is about 0.55 m). */
export const U_PER_M = 1 / 0.6;

/** An opening on a face: `at` and `w` along the face in metres from its west or north end, `z0`..`z1` in metres. */
export interface Opening { at: number; w: number; z0: number; z1: number; kind?: 'window' | 'door' | 'void' }
/** A row of equal openings every `every` metres along a face, from `from` to `to`. */
export interface Row { from: number; to: number; every: number; w: number; z0: number; z1: number; kind?: Opening['kind'] }

export interface Block {
  id: string;
  /** Plan rectangle, units: x0 < x1 (west to east), y0 < y1 (north to south). */
  x0: number; y0: number; x1: number; y1: number;
  /** Eaves height, metres. */
  h: number;
  /** A gable roof's rise above the eaves (metres) and the ridge's direction; 0 for a flat top. */
  rise?: number; ridge?: 'x' | 'y';
  wall?: number; side?: number; roof?: number;
  /** Openings on the south face (along x) and the east face (along y). */
  south?: (Opening | Row)[]; east?: (Opening | Row)[];
  /**
   * Painted art for the block (content/assets/buildings/<art>.png, made by tools/building-art from the block's own
   * shape): drawn instead of the grey block once it has loaded, placed by its json's anchor, the block's (x1, y1, 0).
   */
  art?: string;
  /** This block is painted into another block's art (that block's id): hidden while that art shows. */
  paintedIn?: string;
}

export interface MassingPlan { id: string; /** The room it stands round. */ room: string; /** Far to near: each is drawn over the ones before it. */ blocks: Block[]; /** Props whose foot is inside this margin (units) of a block are hidden. */ clear: number }

const M = U_PER_M;
/**
 * The rooms' grey boxes. Empty since the courtyard and the drill yard became plan-made levels (2026-11-22,
 * tools/place-plans/): their buildings are tiers in the level now. The old academy and courtyard blockouts were
 * removed on 2026-11-23 (nothing read them; tools/building-art/silhouette.py keeps its own copy of the numbers); they
 * are in git history before that date.
 */
export const MASSING: Record<string, MassingPlan> = {};

const DARK = { window: 0x2c3340, door: 0x4a3626, void: 0x14161b };
const ROOF = 0x56627a, ROOF_EDGE = 0x3a4458, WALL = 0xaaa394, SIDE = 0x837c6e, EDGE = 0x5d574c;

/** Draws a plan's blocks under everything that stands, at the plan's real place in the turned view: each as its painted art once that has loaded, else as a grey block. */
export class Massing {
  readonly g = new Container();
  private key = '';
  private dims = { w: 0, h: 0 };
  /** One layer per block, in the plan's order (far to near): its grey block, and its art once loaded. */
  private parts: { b: Block; box: Graphics; art: Sprite | null; anchor: [number, number] }[];
  constructor(parent: Container, readonly plan: MassingPlan) {
    this.g.zIndex = -1e9;
    parent.addChild(this.g);
    this.parts = plan.blocks.map((b) => {
      const part = { b, box: new Graphics(), art: null as Sprite | null, anchor: [0, 0] as [number, number] };
      this.g.addChild(part.box);
      const a = b.art ? artOf(b.art) : null;
      if (a) void loadTexture(a.url).then((tex) => {
        tex.source.scaleMode = 'nearest';
        const spr = new Sprite(tex);
        this.g.addChildAt(spr, this.g.getChildIndex(part.box));
        part.art = spr; part.anchor = a.anchor;
        this.show();
      }).catch(() => { /* the grey block stays */ });
      return part;
    });
  }

  /** Each block's art where it has loaded (its grey block hidden), and blocks painted into shown art hidden too. */
  private show(): void {
    const painted = new Set(this.parts.filter((p) => p.art).map((p) => p.b.id));
    for (const p of this.parts) {
      p.box.visible = !p.art && !(p.b.paintedIn && painted.has(p.b.paintedIn));
      if (!p.art) continue;
      const [x, y] = this.pt(p.b.x1, p.b.y1, 0);
      p.art.position.set(Math.round(x - p.anchor[0]), Math.round(y - p.anchor[1]));
    }
  }

  /** Plan (units) and height (metres) to the field's art px. */
  private pt(px: number, py: number, z: number): [number, number] {
    const x = px - this.dims.w / 2, y = py - this.dims.h / 2;
    return [gx(toU(x, y)), gy(toV(x, y)) - z * PX_PER_M];
  }

  /** True if a turned-view point is inside (or within `clear` of) a block: a prop there is hidden. */
  covers(u: number, v: number, dw: number, dh: number): boolean {
    const px = toX(u, v) + dw / 2, py = toY(u, v) + dh / 2, c = this.plan.clear;
    return this.plan.blocks.some((b) => px > b.x0 - c && px < b.x1 + c && py > b.y0 - c && py < b.y1 + c);
  }

  draw(dw: number, dh: number, fx0: number, fy0: number): void {
    const key = `${dw}x${dh}`;
    this.g.position.set(fx0, fy0);
    if (key === this.key) return;
    this.key = key; this.dims = { w: dw, h: dh };
    for (const p of this.parts) this.block(p.box.clear(), p.b); // in the plan's order, far to near
    this.show();
  }

  private quad(g: Graphics, pts: [number, number][], fill: number, edge?: number): void {
    g.poly(pts.flat()).fill({ color: fill });
    if (edge !== undefined) g.poly(pts.flat()).stroke({ color: edge, width: 1, alignment: 0.5 });
  }

  private block(g: Graphics, b: Block): void {
    const { x0, y0, x1, y1, h } = b, rise = b.rise ?? 0, P = (x: number, y: number, z: number) => this.pt(x, y, z);
    const wall = b.wall ?? WALL, side = b.side ?? SIDE;
    // east face (x = x1, along y), south face (y = y1, along x)
    this.quad(g, [P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)], side, EDGE);
    this.quad(g, [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], wall, EDGE);
    this.openings(g, b, 'east');
    this.openings(g, b, 'south');
    if (!rise) { this.quad(g, [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], 0xc9c2b2, EDGE); return; }
    if (b.ridge === 'x') {
      const ym = (y0 + y1) / 2;
      this.quad(g, [P(x0, y1, h), P(x1, y1, h), P(x1, ym, h + rise), P(x0, ym, h + rise)], ROOF, ROOF_EDGE); // the south slope
      this.quad(g, [P(x1, y0, h), P(x1, y1, h), P(x1, ym, h + rise)], side, EDGE); // the east gable
    } else {
      const xm = (x0 + x1) / 2;
      this.quad(g, [P(x1, y0, h), P(x1, y1, h), P(xm, y1, h + rise), P(xm, y0, h + rise)], ROOF, ROOF_EDGE); // the east slope
      this.quad(g, [P(x0, y1, h), P(x1, y1, h), P(xm, y1, h + rise)], wall, EDGE); // the south gable
    }
  }

  private openings(g: Graphics, b: Block, face: 'south' | 'east'): void {
    const list = b[face];
    if (!list) return;
    const along = face === 'south' ? b.x1 - b.x0 : b.y1 - b.y0, len = along / M;
    const at = (s: number, z: number) => face === 'south' ? this.pt(b.x0 + s * M, b.y1, z) : this.pt(b.x1, b.y0 + s * M, z);
    const one = (o: Opening) => {
      if (o.at < 0 || o.at + o.w > len) return;
      const c = DARK[o.kind ?? 'window'];
      this.quad(g, [at(o.at, o.z0), at(o.at + o.w, o.z0), at(o.at + o.w, o.z1), at(o.at, o.z1)], c);
    };
    for (const o of list) {
      if ('every' in o) for (let s = o.from; s + o.w <= Math.min(o.to, len) + 1e-6; s += o.every) one({ at: s, w: o.w, z0: o.z0, z1: o.z1, kind: o.kind });
      else one(o);
    }
  }
}

/** Every room's grey box (each shows only in its own room); ?massing=off shows none. */
export const massingParam = (): MassingPlan[] => (opt('massing') === 'off' ? [] : Object.values(MASSING));