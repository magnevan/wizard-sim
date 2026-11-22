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
import { loadTexture } from './assets';

/** The buildings' painted art (tools/building-art/cut.py): an image and where its block's (x1, y1, 0) lands in it. */
const ART_URL = import.meta.glob<string>('../../../../content/assets/buildings/*.png', { eager: true, query: '?url', import: 'default' });
const ART_META = import.meta.glob<{ anchor: [number, number] }>('../../../../content/assets/buildings/*.json', { eager: true, import: 'default' });
const artOf = (name: string): { url: string; anchor: [number, number] } | null => {
  const key = (ext: string) => `../../../../content/assets/buildings/${name}.${ext}`;
  const url = ART_URL[key('png')], meta = ART_META[key('json')];
  return url && meta ? { url, anchor: meta.anchor } : null;
};

/** Art px per metre of height (a 1.8 m person is a 26 px wizard). */
export const PX_PER_M = 14.5;
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
 * The academy round the drill yard (blockout, 2026-11-22: docs/explorations/2026-11-22-weapons-yard-and-walks.md).
 * The map is 130 x 100 u (78 x 60 m). The two ranges stand just past its far edges, so their faces are the map's
 * edge and nothing needs to collide with them: west, the Great Hall (the strike lanes, the sack and the slam ring
 * run along its foot) and the library wing south of it; north, the workshops, three storeys, with the armoury's
 * tower over the door where the rack stands. A garden terrace to the south-east, by the gate to the courtyard.
 */
const ARMOURY_X = 100;
const hall: Block = {
  id: 'great-hall', x0: -22 * M, x1: 0, y0: -12 * M, y1: 64, h: 14, rise: 10, ridge: 'y', art: 'great-hall',
  east: [
    { from: 4, to: 31, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { from: 39, to: 50, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { at: 33.4, w: 3.2, z0: 0, z1: 5.2, kind: 'door' },
    { at: 33.9, w: 2.2, z0: 7, z1: 11.5, kind: 'window' },
  ],
};
const library: Block = {
  id: 'library', x0: -18 * M, x1: 0, y0: 64, y1: 112, h: 9, rise: 6, ridge: 'y', art: 'library',
  east: [{ from: 2, to: 28, every: 4, w: 1.8, z0: 2.5, z1: 7.5, kind: 'window' }],
};
/** The workshops, in two halves so each fits one painted image (tools/building-art/silhouette.py draws the same). */
const worksRows = (from: number): Row[] => [
  { from, to: 42, every: 4.5, w: 2.4, z0: 1, z1: 3.9, kind: 'window' },
  { from, to: 42, every: 4.5, w: 1.4, z0: 6.2, z1: 8.4, kind: 'window' },
  { from, to: 42, every: 4.5, w: 1.4, z0: 10.2, z1: 12.2, kind: 'window' },
];
const worksWest: Block = { id: 'workshops-west', x0: 0, x1: 71, y0: -12 * M, y1: 0, h: 13, rise: 6, ridge: 'x', south: worksRows(3), art: 'workshops-west' };
const worksEast: Block = { id: 'workshops-east', x0: 71, x1: 142, y0: -12 * M, y1: 0, h: 13, rise: 6, ridge: 'x', south: worksRows(1.5), art: 'armoury' };
/** The armoury's tower over its door, 7 m square: the rack stands at its foot. */
const tower: Block = {
  id: 'armoury', x0: ARMOURY_X - 3.5 * M, x1: ARMOURY_X + 3.5 * M, y0: -10 * M, y1: 0, h: 22, rise: 5, ridge: 'x',
  wall: 0xc4bdae, side: 0x958e7f, paintedIn: 'workshops-east',
  south: [
    { at: 1.8, w: 3.4, z0: 0, z1: 4.2, kind: 'door' },
    { at: 2.5, w: 2, z0: 8, z1: 11, kind: 'window' },
    { at: 2.5, w: 2, z0: 14, z1: 17, kind: 'window' },
  ],
};
const ACADEMY: MassingPlan = { id: 'academy', room: 'yard', clear: 1.5, blocks: [worksWest, worksEast, tower, hall, library] };
/**
 * The courtyard (blockout, 2026-11-22: tools/segments/01-opening/court-level.py, 150 x 110 u): the academy's main
 * building along the north edge in two halves with its tower over the grand portal, and the cloister range along the
 * west edge in two halves with the archway through to the drill yard. The great armillary in the middle is a prop
 * (codex-armillary-grand), sorted with the bodies, since you walk all round it.
 */
const courtRows = (from: number, to: number): Row[] => [
  { from, to, every: 4.5, w: 2.4, z0: 1.2, z1: 4.6, kind: 'window' },
  { from, to, every: 4.5, w: 1.6, z0: 7.4, z1: 10.2, kind: 'window' },
  { from, to, every: 4.5, w: 1.6, z0: 12.2, z1: 14.8, kind: 'window' },
];
const COURT: MassingPlan = {
  id: 'court', room: 'court', clear: 1.5,
  blocks: [
    { id: 'court-north-west', x0: 0, x1: 69, y0: -14 * M, y1: 0, h: 16, rise: 8, ridge: 'x', south: courtRows(3, 40), art: 'court-north-west' },
    { id: 'court-north-east', x0: 81, x1: 154, y0: -14 * M, y1: 0, h: 16, rise: 8, ridge: 'x', south: courtRows(2, 43), art: 'court-north-east' },
    { id: 'court-tower', x0: 66, x1: 84, y0: -16 * M, y1: 1, h: 30, rise: 9, ridge: 'x', wall: 0xc4bdae, side: 0x958e7f, art: 'court-tower',
      south: [{ at: 2.6, w: 5.6, z0: 0, z1: 7.5, kind: 'door' }, { at: 3.6, w: 3.6, z0: 11, z1: 15, kind: 'window' }, { at: 3.6, w: 3.6, z0: 18.5, z1: 22.5, kind: 'window' }] },
    { id: 'court-west-north', x0: -20 * M, x1: 0, y0: -14 * M, y1: 55, h: 14, rise: 9, ridge: 'y', art: 'court-west-north',
      east: [{ from: 3, to: 27, every: 4.5, w: 2.2, z0: 3.5, z1: 11, kind: 'window' }, { from: 42, to: 55, every: 4.5, w: 2.2, z0: 3.5, z1: 11, kind: 'window' }, { at: 29.5, w: 7.5, z0: 0, z1: 7, kind: 'void' }] },
    { id: 'court-west-south', x0: -20 * M, x1: 0, y0: 55, y1: 124, h: 14, rise: 9, ridge: 'y', art: 'court-west-south',
      east: [{ from: 2, to: 40, every: 4.5, w: 2.2, z0: 3.5, z1: 11, kind: 'window' }] },
  ],
};
export const MASSING: Record<string, MassingPlan> = { academy: ACADEMY, court: COURT };

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