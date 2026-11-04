/**
 * Enemy steering around rock walls, ported from the skeleton: a 0.5 u grid marks cells blocked by
 * rock (inflated by an enemy's size), and a Dijkstra distance field toward each wizard is rebuilt
 * every 0.3 s. An enemy with a clear line walks straight; otherwise it walks downhill on the
 * field. A fresh wall is only noticed at the next rebuild, and detours are slower, so walls
 * still buy time.
 *
 * The grid and fields live in world state (nav), so a restored snapshot steers the same way.
 * Integer costs (10 straight, 14 diagonal) and a fixed neighbour order keep it deterministic.
 */
import { WALL } from './compile';
import { ARENA, CELL, STRUCT, T } from './config';
import { len } from './geom';
import { segDist } from './walls';
import { GRID_H, GRID_W, KIND, MAX_SEATS, MAX_WALLS, type World } from './world';

const CELLS = GRID_W * GRID_H;
const INF = 0x3fffffff;
const INFLATE = 0.45;
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [-1, 1, 14], [1, -1, 14], [-1, -1, 14]] as const;

const cellOf = (x: number, y: number): number => {
  const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor((x + ARENA.w / 2) / CELL)));
  const cy = Math.max(0, Math.min(GRID_H - 1, Math.floor((y + ARENA.h / 2) / CELL)));
  return cy * GRID_W + cx;
};
const centreX = (c: number) => -ARENA.w / 2 + ((c % GRID_W) + 0.5) * CELL;
const centreY = (c: number) => -ARENA.h / 2 + (Math.floor(c / GRID_W) + 0.5) * CELL;

function rebuildBlocked(w: World): void {
  const nb = w.nav.blocked, wl = w.walls;
  nb.fill(0);
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k] !== WALL.rock) continue;
    const pad = STRUCT.wallThickness + INFLATE;
    const minX = Math.min(wl.x1[k], wl.x2[k]) - pad, maxX = Math.max(wl.x1[k], wl.x2[k]) + pad;
    const minY = Math.min(wl.y1[k], wl.y2[k]) - pad, maxY = Math.max(wl.y1[k], wl.y2[k]) + pad;
    for (let y = minY; y <= maxY + CELL; y += CELL) for (let x = minX; x <= maxX + CELL; x += CELL) {
      const c = cellOf(x, y);
      if (segDist(centreX(c), centreY(c), wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0] < pad) nb[c] = 1;
    }
  }
}

// A binary heap over (distance, cell); ties broken by cell index so the order never varies.
const heapD = new Int32Array(CELLS * 8), heapC = new Int32Array(CELLS * 8);
function dijkstra(w: World, seat: number, goal: number): void {
  const f = w.nav.field, base = seat * CELLS, nb = w.nav.blocked;
  f.fill(INF, base, base + CELLS);
  let n = 0;
  const push = (d: number, c: number) => {
    let i = n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapD[p] < d || (heapD[p] === d && heapC[p] <= c)) break;
      heapD[i] = heapD[p]; heapC[i] = heapC[p]; i = p;
    }
    heapD[i] = d; heapC[i] = c;
  };
  const pop = (): number => {
    const top = heapC[0], d = heapD[--n], c = heapC[n];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= n) break;
      if (m + 1 < n && (heapD[m + 1] < heapD[m] || (heapD[m + 1] === heapD[m] && heapC[m + 1] < heapC[m]))) m++;
      if (heapD[m] > d || (heapD[m] === d && heapC[m] >= c)) break;
      heapD[i] = heapD[m]; heapC[i] = heapC[m]; i = m;
    }
    heapD[i] = d; heapC[i] = c;
    return top;
  };
  f[base + goal] = 0;
  push(0, goal);
  while (n > 0) {
    const d0 = heapD[0];
    const c = pop();
    if (d0 > f[base + c]) continue;
    const cx = c % GRID_W, cy = (c - cx) / GRID_W;
    for (const [dx, dy, cost] of NB) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const nc = ny * GRID_W + nx;
      if (nb[nc]) continue;
      if (dx && dy && (nb[cy * GRID_W + nx] || nb[ny * GRID_W + cx])) continue; // no corner cutting
      const nd = d0 + cost;
      if (nd < f[base + nc]) { f[base + nc] = nd; push(nd, nc); }
    }
  }
}

/** Rebuilds the grid and fields every 0.3 s. */
export function tickNav(w: World): void {
  if (w.nav.timer[0]-- > 0) return;
  w.nav.timer[0] = T(0.3) - 1;
  rebuildBlocked(w);
  const b = w.bodies;
  for (let s = 0; s < MAX_SEATS; s++) {
    if (!w.seats.active[s] || b.kind[s] !== KIND.wizard) continue;
    dijkstra(w, s, cellOf(b.x[s], b.y[s]));
  }
}

/** Is the straight line from a to b free of rock? */
function clearLine(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const wl = w.walls, d = len(bx - ax, by - ay);
  if (d < 1e-6) return true;
  const steps = Math.ceil(d / 0.4);
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k] !== WALL.rock) continue;
    for (let s = 1; s < steps; s++) {
      const px = ax + ((bx - ax) * s) / steps, py = ay + ((by - ay) * s) / steps;
      if (segDist(px, py, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0] < STRUCT.wallThickness + 0.3) return false;
    }
  }
  return true;
}

/**
 * Unit direction for enemy `i` to walk toward (tx, ty), chasing wizard `seat` (its field), and
 * whether it is detouring (detours are walked at 80%).
 */
export function steer(w: World, i: number, tx: number, ty: number, seat: number): [number, number, boolean] {
  const b = w.bodies, x = b.x[i], y = b.y[i];
  const dx = tx - x, dy = ty - y, d = len(dx, dy);
  if (d < 1e-6) return [0, 0, false];
  if (seat < 0 || clearLine(w, x, y, tx, ty)) return [dx / d, dy / d, false];
  const f = w.nav.field, base = seat * CELLS;
  let c = cellOf(x, y), aim = -1;
  // Walk the field downhill up to 8 cells, and head for the farthest one still in clear view
  // (heading for one behind a corner would walk into the wall's end).
  for (let s = 0; s < 8; s++) {
    const cx = c % GRID_W, cy = (c - cx) / GRID_W;
    let best = c;
    for (const [ox, oy] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const nc = ny * GRID_W + nx;
      if (f[base + nc] < f[base + best]) best = nc;
    }
    if (best === c) break;
    c = best;
    if (aim < 0 || clearLine(w, x, y, centreX(c), centreY(c))) aim = c;
  }
  if (aim < 0) aim = c;
  const ex = centreX(aim) - x, ey = centreY(aim) - y, el = len(ex, ey);
  return el < 1e-6 ? [dx / d, dy / d, false] : [ex / el, ey / el, true];
}
