/**
 * A room's static terrain: its rock walls, then its blocking props' footprints (room.ts rock, propRock),
 * and a uniform grid over them so collision, rays, nav and the view ask only for what's nearby.
 *
 * Read-only data derived from the room, not state: it never changes during a match, so it isn't in
 * buffers() (a snapshot costs the same however much terrain a room has). The only things written are
 * the query scratch below, which holds no gameplay meaning.
 *
 * Segment numbers are the room's order (the old wall slots): a query returns them in ascending order,
 * whichever cells they came from, so "first in the room's order" means what it always did. The query
 * only ever narrows the candidates; the callers run the same exact tests on them as before.
 */
import type { RoomDef } from './room';

/** World units per grid cell: about the width of what a body or a shot touches at once. */
const CELL = 2;
/** Query padding: costs at most a candidate or two, so a rounding error can't drop a segment. */
const SLOP = 1e-3;

export interface Terrain {
  /** Segments: the room's rock, then its blocking props' (isPropWall tells them apart). */
  readonly n: number;
  readonly x1: Float64Array; readonly y1: Float64Array; readonly x2: Float64Array; readonly y2: Float64Array;
  /** The grid's corner and size in cells. It covers every segment; queries clamp to it. */
  readonly x0: number; readonly y0: number; readonly gw: number; readonly gh: number;
  /** Per cell, a run of `items` (segments overlapping the cell, ascending): start[c] up to start[c + 1]. */
  readonly start: Int32Array; readonly items: Int32Array;
  /** What the last query found (query result: don't hold it across another query). */
  readonly out: Int32Array;
  /** Query scratch: which query last saw each segment, so one in several cells comes out once. */
  readonly stamp: Uint32Array;
  mark: number;
}

const cellOf = (v: number, origin: number, size: number): number => Math.max(0, Math.min(size - 1, Math.floor((v - origin) / CELL)));

export function createTerrain(def: Pick<RoomDef, 'rock' | 'propRock'>): Terrain {
  const n = def.rock.length + def.propRock.length;
  const x1 = new Float64Array(n), y1 = new Float64Array(n), x2 = new Float64Array(n), y2 = new Float64Array(n);
  let lox = Infinity, loy = Infinity, hix = -Infinity, hiy = -Infinity;
  for (let k = 0; k < n; k++) {
    const s = k < def.rock.length ? def.rock[k] : def.propRock[k - def.rock.length];
    x1[k] = s[0]; y1[k] = s[1]; x2[k] = s[2]; y2[k] = s[3];
    lox = Math.min(lox, s[0], s[2]); hix = Math.max(hix, s[0], s[2]);
    loy = Math.min(loy, s[1], s[3]); hiy = Math.max(hiy, s[1], s[3]);
  }
  const x0 = n ? lox : 0, y0 = n ? loy : 0;
  const gw = n ? Math.floor((hix - lox) / CELL) + 1 : 1, gh = n ? Math.floor((hiy - loy) / CELL) + 1 : 1;
  const start = new Int32Array(gw * gh + 1);
  // Each segment, in every cell its box overlaps: count, then fill, so each cell's run stays ascending.
  const each = (visit: (c: number, k: number) => void): void => {
    for (let k = 0; k < n; k++) {
      const cx0 = cellOf(Math.min(x1[k], x2[k]), x0, gw), cx1 = cellOf(Math.max(x1[k], x2[k]), x0, gw);
      const cy0 = cellOf(Math.min(y1[k], y2[k]), y0, gh), cy1 = cellOf(Math.max(y1[k], y2[k]), y0, gh);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) visit(cy * gw + cx, k);
    }
  };
  each((c) => { start[c + 1]++; });
  for (let c = 0; c < gw * gh; c++) start[c + 1] += start[c];
  const items = new Int32Array(start[gw * gh]), used = new Int32Array(gw * gh);
  each((c, k) => { items[start[c] + used[c]++] = k; });
  return { n, x1, y1, x2, y2, x0, y0, gw, gh, start, items, out: new Int32Array(n), stamp: new Uint32Array(n), mark: 0 };
}

/** A new query's mark, starting the stamps over if the counter has run out. */
function nextMark(t: Terrain): number {
  if (t.mark === 0xffffffff) { t.stamp.fill(0); t.mark = 0; }
  return ++t.mark;
}

/** Adds cell (cx, cy)'s segments not yet seen by this query to `out`; returns the new count. */
function gather(t: Terrain, cx: number, cy: number, mark: number, n: number): number {
  const c = cy * t.gw + cx, end = t.start[c + 1], items = t.items, stamp = t.stamp, out = t.out;
  for (let i = t.start[c]; i < end; i++) {
    const k = items[i];
    if (stamp[k] !== mark) { stamp[k] = mark; out[n++] = k; }
  }
  return n;
}

/** out[0..n) into ascending order. The cells' runs are ascending already, so this is cheap. */
function ascending(out: Int32Array, n: number): void {
  for (let i = 1; i < n; i++) {
    const v = out[i];
    let j = i - 1;
    while (j >= 0 && out[j] > v) { out[j + 1] = out[j]; j--; }
    out[j + 1] = v;
  }
}

/**
 * The segments that might come within `r` of (x, y), ascending, in t.out; returns how many.
 * Every segment that does is listed; a few that don't may be.
 */
export function terrainNear(t: Terrain, x: number, y: number, r: number): number {
  if (!t.n) return 0;
  const d = r + SLOP;
  const cx0 = cellOf(x - d, t.x0, t.gw), cx1 = cellOf(x + d, t.x0, t.gw), cy0 = cellOf(y - d, t.y0, t.gh), cy1 = cellOf(y + d, t.y0, t.gh);
  const mark = nextMark(t);
  let n = 0;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) n = gather(t, cx, cy, mark, n);
  ascending(t.out, n);
  return n;
}

/**
 * The segments that might come within `pad` of the line from (ax, ay) to (bx, by), ascending, in t.out;
 * returns how many. Walks the grid's columns along the line, so a long diagonal doesn't take its whole box.
 */
export function terrainAlong(t: Terrain, ax: number, ay: number, bx: number, by: number, pad: number): number {
  if (!t.n) return 0;
  const d = pad + SLOP, dx = bx - ax;
  const lox = Math.min(ax, bx), hix = Math.max(ax, bx), loy = Math.min(ay, by), hiy = Math.max(ay, by);
  const cx0 = cellOf(lox - d, t.x0, t.gw), cx1 = cellOf(hix + d, t.x0, t.gw);
  const flat = Math.abs(dx) < 1e-9, slope = flat ? 0 : (by - ay) / dx;
  const mark = nextMark(t);
  let n = 0;
  for (let cx = cx0; cx <= cx1; cx++) {
    // The line over this column's width (and a pad either side): its y span is what the column must cover.
    let ya = loy, yb = hiy;
    if (!flat) {
      const left = t.x0 + cx * CELL - d, right = left + CELL + 2 * d;
      const from = Math.max(lox, left), to = Math.min(hix, right);
      const y1 = ay + slope * (from - ax), y2 = ay + slope * (to - ax);
      ya = Math.min(y1, y2); yb = Math.max(y1, y2);
    }
    const cy0 = cellOf(ya - d, t.y0, t.gh), cy1 = cellOf(yb + d, t.y0, t.gh);
    for (let cy = cy0; cy <= cy1; cy++) n = gather(t, cx, cy, mark, n);
  }
  ascending(t.out, n);
  return n;
}
