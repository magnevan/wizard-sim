/**
 * A concept's grey box: buildings as plain blocks at their real size, drawn in the real camera so
 * their scale can be judged against a wizard before any art exists (?massing=academy). Client only,
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
/** Buttresses along a face: small blocks standing out of it. */
function buttresses(id: string, face: 'south' | 'east', line: number, from: number, to: number, every: number, h: number): Block[] {
  const out: Block[] = [], d = 1.2 * M, t = 0.9 * M;
  for (let s = from, k = 0; s <= to + 1e-6; s += every * M, k++) {
    if (face === 'east') out.push({ id: `${id}-b${k}`, x0: line, x1: line + d, y0: s - t / 2, y1: s + t / 2, h, wall: 0xb9b2a4, side: 0x8f8879 });
    else out.push({ id: `${id}-b${k}`, x0: s - t / 2, x1: s + t / 2, y0: line, y1: line + d, h, wall: 0xb9b2a4, side: 0x8f8879 });
  }
  return out;
}

/**
 * The academy round the drill yard (concept, 2026-11-15). The map is 90 x 68 u (54 x 41 m); the
 * academy closes its far sides. West: the Great Hall, the lecture hall of beat 1, 30 x 20 m inside.
 * North: the workshops range, three storeys, with the gate tower over the passage out to the battery.
 */
const HALL_E = 6, NORTH_S = 4;
const hall: Block = {
  id: 'great-hall', x0: HALL_E - 22 * M, x1: HALL_E, y0: NORTH_S - 2 * M, y1: NORTH_S + 33 * M, h: 14, rise: 10, ridge: 'y',
  east: [
    // a bay every 5 m between the buttresses (at 3, 8 ... 33 m); the door has the bay at 25.5 m to itself
    { from: 4.4, to: 22, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { from: 29.4, to: 35, every: 5, w: 2.2, z0: 3.5, z1: 11.5, kind: 'window' },
    { at: 23.9, w: 3.2, z0: 0, z1: 5.2, kind: 'door' },
    { at: 24.4, w: 2.2, z0: 7, z1: 11.5, kind: 'window' },
  ],
  south: [{ at: 8.5, w: 5, z0: 4, z1: 13, kind: 'window' }],
};
const works: Block = {
  id: 'workshops', x0: HALL_E - 2 * M, x1: 104, y0: NORTH_S - 12 * M, y1: NORTH_S, h: 13, rise: 6, ridge: 'x',
  south: [
    { from: 3, to: 60, every: 4.5, w: 2.4, z0: 1, z1: 3.9, kind: 'window' },
    { from: 3, to: 60, every: 4.5, w: 1.4, z0: 6.2, z1: 8.4, kind: 'window' },
    { from: 3, to: 60, every: 4.5, w: 1.4, z0: 10.2, z1: 12.2, kind: 'window' },
  ],
};
/** The gate tower: 7 m square, a step proud of the range, with the passage (4 x 5 m) through it. */
const GATE_X = 46;
const tower: Block = {
  id: 'gate-tower', x0: GATE_X - 3.5 * M, x1: GATE_X + 3.5 * M, y0: NORTH_S - 10 * M, y1: NORTH_S + 1 * M, h: 24, rise: 5, ridge: 'x',
  wall: 0xc4bdae, side: 0x958e7f,
  south: [
    { at: 1.5, w: 4, z0: 0, z1: 5, kind: 'void' },
    { at: 2.5, w: 2, z0: 8, z1: 11, kind: 'window' },
    { at: 2.5, w: 2, z0: 14, z1: 17, kind: 'window' },
    { at: 2.2, w: 2.6, z0: 19.5, z1: 22.5, kind: 'window' },
  ],
};
const ACADEMY: MassingPlan = {
  id: 'academy',
  room: 'yard',
  clear: 1.5,
  blocks: [works, tower, hall, ...buttresses('great-hall', 'east', HALL_E, hall.y0 + 3 * M, hall.y1 - 1 * M, 5, 11.5)],
};
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

/** ?massing=<plan> names the concept to preview, or nothing. */
export const massingParam = (): MassingPlan | null => {
  if (typeof location === 'undefined') return null;
  const id = new URLSearchParams(location.search).get('massing');
  return id ? MASSING[id] ?? null : null;
};