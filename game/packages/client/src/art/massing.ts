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
import { Container, Graphics } from 'pixi.js';
import { toU, toV, toX, toY } from '../iso-world';
import { gx, gy } from './field';
import { opt } from '../dev-options';

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
}

export interface MassingPlan { id: string; /** The room it stands round. */ room: string; /** Far to near: each is drawn over the ones before it. */ blocks: Block[]; /** Props whose foot is inside this margin (units) of a block are hidden. */ clear: number }

const M = U_PER_M;
/**
 * The academy round the drill yard (blockout, 2026-11-22: docs/explorations/2026-11-22-weapons-yard-and-walks.md).
 * The map is 130 x 100 u (78 x 60 m). The two ranges stand just past its far edges, so their faces are the map's
 * edge and nothing needs to collide with them: west, the Great Hall (the strike lanes, the sack and the slam ring
 * run along its foot) and the library wing south of it; north, the workshops, three storeys, with the armoury's
 * tower over the door where the rack stands. The courtyard opens to the south-east, the armillary on its plinth.
 */
const ARMOURY_X = 100;
const hall: Block = {
  id: 'great-hall', x0: -22 * M, x1: 0, y0: -12 * M, y1: 64, h: 14, rise: 10, ridge: 'y',
  east: [
    { from: 4, to: 31, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { from: 39, to: 50, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { at: 33.4, w: 3.2, z0: 0, z1: 5.2, kind: 'door' },
    { at: 33.9, w: 2.2, z0: 7, z1: 11.5, kind: 'window' },
  ],
};
const library: Block = {
  id: 'library', x0: -18 * M, x1: 0, y0: 64, y1: 112, h: 9, rise: 6, ridge: 'y',
  east: [{ from: 2, to: 28, every: 4, w: 1.8, z0: 2.5, z1: 7.5, kind: 'window' }],
};
const works: Block = {
  id: 'workshops', x0: 0, x1: 142, y0: -12 * M, y1: 0, h: 13, rise: 6, ridge: 'x',
  south: [
    { from: 3, to: 85, every: 4.5, w: 2.4, z0: 1, z1: 3.9, kind: 'window' },
    { from: 3, to: 85, every: 4.5, w: 1.4, z0: 6.2, z1: 8.4, kind: 'window' },
    { from: 3, to: 85, every: 4.5, w: 1.4, z0: 10.2, z1: 12.2, kind: 'window' },
  ],
};
/** The armoury's tower over its door, 7 m square: the rack stands at its foot. */
const tower: Block = {
  id: 'armoury', x0: ARMOURY_X - 3.5 * M, x1: ARMOURY_X + 3.5 * M, y0: -10 * M, y1: 0, h: 22, rise: 5, ridge: 'x',
  wall: 0xc4bdae, side: 0x958e7f,
  south: [
    { at: 1.8, w: 3.4, z0: 0, z1: 4.2, kind: 'door' },
    { at: 2.5, w: 2, z0: 8, z1: 11, kind: 'window' },
    { at: 2.5, w: 2, z0: 14, z1: 17, kind: 'window' },
  ],
};
/** The armillary on its plinth in the courtyard, where the briefing is: a stand-in block for the sphere. */
const plinth: Block = { id: 'plinth', x0: 95, x1: 105, y0: 77, y1: 87, h: 1.6, wall: 0xb9b2a4, side: 0x8f8879 };
const sphere: Block = { id: 'armillary', x0: 98.5, x1: 101.5, y0: 80.5, y1: 83.5, h: 9, wall: 0xb08d57, side: 0x8a6c3f };
const ACADEMY: MassingPlan = { id: 'academy', room: 'yard', clear: 1.5, blocks: [works, tower, hall, library, plinth, sphere] };
export const MASSING: Record<string, MassingPlan> = { academy: ACADEMY };

const DARK = { window: 0x2c3340, door: 0x4a3626, void: 0x14161b };
const ROOF = 0x56627a, ROOF_EDGE = 0x3a4458, WALL = 0xaaa394, SIDE = 0x837c6e, EDGE = 0x5d574c;

/** Draws a plan's blocks under everything that stands, at the plan's real place in the turned view. */
export class Massing {
  readonly g = new Graphics();
  private key = '';
  private dims = { w: 0, h: 0 };
  constructor(parent: Container, readonly plan: MassingPlan) { this.g.zIndex = -1e9; parent.addChild(this.g); }

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
    const g = this.g.clear();
    for (const b of this.plan.blocks) this.block(g, b); // in the plan's order, far to near
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

/** ?massing=<plan> names the grey box to show (the academy's, in the yard, by default); ?massing=off shows none. */
export const massingParam = (): MassingPlan | null => MASSING[opt('massing') ?? 'academy'] ?? null;