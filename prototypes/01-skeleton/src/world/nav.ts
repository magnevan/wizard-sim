// Enemy steering around walls: a coarse grid (0.5 u cells) of blocked cells
// (level walls, conjured walls and ridges, cage bubbles, inflated by about a
// body radius) and one Dijkstra flow field per chased target. Both are
// rebuilt a few times per second, so a fresh wall is ignored for a moment
// and enemies bump into it before they reroute: walls still buy time.
//
// steer(): straight at the goal when the grid line is clear; otherwise walk
// the flow field downhill a few cells and head for the farthest one still in
// view (string pulling, so paths hug pillar corners instead of zig-zagging).

import { dist, normalize, scale, sub, ZERO, type Vec2 } from '../core/vec2';
import type { Entity } from './entity';
import { distToSegment } from './geometry';
import type { World } from './world';

export const NAV_CELL = 0.5;
/** Obstacles grow by this much (≈ a mid-sized body radius). */
const INFLATE = 0.45;
/** Seconds between grid / field rebuilds. */
export const NAV_REFRESH = 0.3;
/** Detours are walked a little slower than a straight charge. */
export const DETOUR_SPEED = 0.8;
/** Downhill cells considered for string pulling. */
const LOOKAHEAD = 8;
/** Fields nobody asked for in this long are dropped. */
const FIELD_TTL = 2;

interface Field {
  dist: Float64Array;
  builtAt: number;
  usedAt: number;
}

export interface NavGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
  builtAt: number;
  fields: Map<number, Field>;
}

const grids = new WeakMap<World, NavGrid>();

/** The world's nav grid, rebuilt every NAV_REFRESH seconds. */
export function navGrid(world: World): NavGrid {
  let g = grids.get(world);
  if (!g || world.time - g.builtAt >= NAV_REFRESH || world.time < g.builtAt) {
    const cols = Math.ceil(world.width / NAV_CELL);
    const rows = Math.ceil(world.height / NAV_CELL);
    const fields = g?.fields ?? new Map<number, Field>();
    for (const [id, f] of fields) if (world.time - f.usedAt > FIELD_TTL) fields.delete(id);
    g = { cols, rows, blocked: buildBlocked(world, cols, rows), builtAt: world.time, fields };
    grids.set(world, g);
  }
  return g;
}

const center = (i: number, j: number): Vec2 => ({ x: (i + 0.5) * NAV_CELL, y: (j + 0.5) * NAV_CELL });

function buildBlocked(world: World, cols: number, rows: number): Uint8Array {
  const blocked = new Uint8Array(cols * rows);
  // Mark every cell whose centre lies within `test` inside the box [x0,x1]x[y0,y1].
  const mark = (x0: number, y0: number, x1: number, y1: number, test: (p: Vec2) => boolean) => {
    const i0 = Math.max(0, Math.floor(x0 / NAV_CELL));
    const i1 = Math.min(cols - 1, Math.floor(x1 / NAV_CELL));
    const j0 = Math.max(0, Math.floor(y0 / NAV_CELL));
    const j1 = Math.min(rows - 1, Math.floor(y1 / NAV_CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (test(center(i, j))) blocked[j * cols + i] = 1;
  };
  for (const w of world.walls) mark(w.x - INFLATE, w.y - INFLATE, w.x + w.w + INFLATE, w.y + w.h + INFLATE, () => true);
  for (const e of world.entities) {
    if (e.removed) continue;
    const w = e.wall;
    if (w && !w.guard) {
      const r = w.half + INFLATE;
      mark(Math.min(w.a.x, w.b.x) - r, Math.min(w.a.y, w.b.y) - r, Math.max(w.a.x, w.b.x) + r, Math.max(w.a.y, w.b.y) + r, (p) => distToSegment(p, w.a, w.b) < r);
    }
    if (e.cage) {
      const r = (e.radius ?? 1) + INFLATE;
      mark(e.pos.x - r, e.pos.y - r, e.pos.x + r, e.pos.y + r, (p) => dist(p, e.pos) < r);
    }
  }
  return blocked;
}

function cellOf(g: NavGrid, p: Vec2): [number, number] {
  return [Math.max(0, Math.min(g.cols - 1, Math.floor(p.x / NAV_CELL))), Math.max(0, Math.min(g.rows - 1, Math.floor(p.y / NAV_CELL)))];
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Can we step from (i,j) by (di,dj)? Diagonals may not cut a blocked corner. */
function canStep(g: NavGrid, i: number, j: number, di: number, dj: number): boolean {
  const ni = i + di;
  const nj = j + dj;
  if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows || g.blocked[nj * g.cols + ni]) return false;
  return di === 0 || dj === 0 || (!g.blocked[j * g.cols + ni] && !g.blocked[nj * g.cols + i]);
}

/** Dijkstra from the target's cell over free cells (the target cell itself may be blocked). */
function buildField(g: NavGrid, goal: Vec2): Float64Array {
  const n = g.cols * g.rows;
  const d = new Float64Array(n).fill(Infinity);
  const [gi, gj] = cellOf(g, goal);
  const start = gj * g.cols + gi;
  d[start] = 0;
  const heap = new MinHeap();
  heap.push(start, 0);
  while (heap.size) {
    const [k, dk] = heap.pop();
    if (dk > d[k]) continue;
    const i = k % g.cols;
    const j = (k - i) / g.cols;
    for (const [di, dj, cost] of NEIGHBOURS) {
      if (!canStep(g, i, j, di, dj)) continue;
      const nk = (j + dj) * g.cols + i + di;
      const nd = dk + cost;
      if (nd < d[nk]) {
        d[nk] = nd;
        heap.push(nk, nd);
      }
    }
  }
  return d;
}

function fieldFor(world: World, g: NavGrid, target: Entity): Field {
  let f = g.fields.get(target.id);
  if (!f || f.builtAt !== g.builtAt) {
    f = { dist: buildField(g, target.pos), builtAt: g.builtAt, usedAt: world.time };
    g.fields.set(target.id, f);
  }
  f.usedAt = world.time;
  return f;
}

/** Grid line of sight: samples along a-b, ignoring the ends (bodies pressed against a wall sit in inflated cells). */
export function gridClear(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const l = dist(a, b);
  const steps = Math.ceil(l / (NAV_CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (t * l < INFLATE + 0.1 || (1 - t) * l < INFLATE + 0.1) continue;
    const [i, j] = cellOf(g, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (g.blocked[j * g.cols + i]) return false;
  }
  return true;
}

/**
 * Unit-ish walk direction from `e` toward `goal`, around walls. `chase` is the
 * entity whose flow field guides detours (usually the goal itself; a back-line
 * caster heading for cover uses its target's field). Detours return length DETOUR_SPEED.
 */
export function steer(world: World, e: Entity, goal: Vec2, chase: Entity): Vec2 {
  const to = sub(goal, e.pos);
  const g = navGrid(world);
  if (gridClear(g, e.pos, goal)) return normalize(to);
  const f = fieldFor(world, g, chase);
  let [i, j] = cellOf(g, e.pos);
  let best: Vec2 | null = null;
  for (let step = 0; step < LOOKAHEAD; step++) {
    // Downhill: the neighbour closest to the target (from a blocked cell, any neighbour).
    let next: [number, number] | null = null;
    let nd = f.dist[j * g.cols + i];
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const blockedHere = g.blocked[j * g.cols + i] === 1;
      if (!blockedHere && !canStep(g, i, j, di, dj)) continue;
      const v = f.dist[nj * g.cols + ni];
      if (v < nd) {
        nd = v;
        next = [ni, nj];
      }
    }
    if (!next) break;
    [i, j] = next;
    const c = center(i, j);
    if (step > 0 && best && !gridClear(g, e.pos, c)) break;
    best = c;
  }
  // No route (fully walled in, or off the grid): push straight on.
  if (!best) return normalize(to);
  const d = sub(best, e.pos);
  return dist(best, e.pos) > 1e-3 ? scale(normalize(d), DETOUR_SPEED) : ZERO;
}

/** Tiny binary heap of (key, priority). */
class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, p: number): void {
    this.keys.push(k);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.keys[0], this.pri[0]];
    const k = this.keys.pop()!;
    const p = this.pri.pop()!;
    if (this.keys.length) {
      this.keys[0] = k;
      this.pri[0] = p;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.keys.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
  }
}
