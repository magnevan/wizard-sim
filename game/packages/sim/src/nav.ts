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
import { solidWall } from './compile';
import { CELL, STRUCT, T } from './config';
import { len } from './geom';
import { terrainAlong } from './terrain';
import { segLen } from './walls';
import { KIND, MAX_CELLS, MAX_SEATS, MAX_WALLS, type World } from './world';

const INF = 0x3fffffff;
const INFLATE = 0.45;
// The eight neighbours (dx, dy, cost), in a fixed order; flat arrays, so the hot loops allocate nothing.
const NBX = [1, -1, 0, 0, 1, -1, 1, -1] as const, NBY = [0, 0, 1, -1, 1, 1, -1, -1] as const, NBC = [10, 10, 10, 10, 14, 14, 14, 14] as const;

// The grid is the world's (w.dims): the survive arena's is bigger than the other rooms'.
const cellOf = (w: World, x: number, y: number): number => {
  const d = w.dims;
  const cx = Math.max(0, Math.min(d.gw - 1, Math.floor((x + d.w / 2) / CELL)));
  const cy = Math.max(0, Math.min(d.gh - 1, Math.floor((y + d.h / 2) / CELL)));
  return cy * d.gw + cx;
};
const centreX = (w: World, c: number) => -w.dims.w / 2 + ((c % w.dims.gw) + 0.5) * CELL;
const centreY = (w: World, c: number) => -w.dims.h / 2 + (Math.floor(c / w.dims.gw) + 0.5) * CELL;

/** Marks the cells a rock segment blocks. */
function markRock(w: World, nb: Uint8Array, x1: number, y1: number, x2: number, y2: number): void {
  const pad = STRUCT.wallThickness + INFLATE;
  const minX = Math.min(x1, x2) - pad, maxX = Math.max(x1, x2) + pad;
  const minY = Math.min(y1, y2) - pad, maxY = Math.max(y1, y2) + pad;
  for (let y = minY; y <= maxY + CELL; y += CELL) for (let x = minX; x <= maxX + CELL; x += CELL) {
    const c = cellOf(w, x, y);
    if (segLen(centreX(w, c), centreY(w, c), x1, y1, x2, y2) < pad) nb[c] = 1;
  }
}

function rebuildBlocked(w: World): void {
  const nb = w.nav.blocked, wl = w.walls, tr = w.terrain;
  nb.fill(0);
  for (let k = 0; k < tr.n; k++) markRock(w, nb, tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k]);
  for (let k = 0; k < MAX_WALLS; k++) if (solidWall(wl.type[k])) markRock(w, nb, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]);
}

// A binary heap over (distance, cell); ties broken by cell index so the order never varies.
const heapD = new Int32Array(MAX_CELLS * 8), heapC = new Int32Array(MAX_CELLS * 8);
function dijkstra(w: World, seat: number, goal: number): void {
  const GW = w.dims.gw, GH = w.dims.gh, CELLS = GW * GH;
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
    const cx = c % GW, cy = (c - cx) / GW;
    for (let q = 0; q < 8; q++) {
      const dx = NBX[q], dy = NBY[q], cost = NBC[q];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const nc = ny * GW + nx;
      if (nb[nc]) continue;
      if (dx && dy && (nb[cy * GW + nx] || nb[ny * GW + cx])) continue; // no corner cutting
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
    dijkstra(w, s, cellOf(w, b.x[s], b.y[s]));
  }
}

/** Is the straight line from a to b free of rock? */
function clearLine(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const wl = w.walls, tr = w.terrain, d = len(bx - ax, by - ay);
  if (d < 1e-6) return true;
  const steps = Math.ceil(d / 0.4), lim = STRUCT.wallThickness + 0.3;
  // Every sample lies in the line's box, so a wall whose box, grown by lim, misses it can't come within
  // lim of any of them: skip it (a hair of slack covers rounding, so the answer is exactly the same).
  const m = lim + 1e-6, lx = Math.min(ax, bx) - m, hx = Math.max(ax, bx) + m, ly = Math.min(ay, by) - m, hy = Math.max(ay, by) + m;
  for (let q = 0, n = terrainAlong(tr, ax, ay, bx, by, m); q < n; q++) {
    const k = tr.out[q];
    if (Math.max(tr.x1[k], tr.x2[k]) < lx || Math.min(tr.x1[k], tr.x2[k]) > hx || Math.max(tr.y1[k], tr.y2[k]) < ly || Math.min(tr.y1[k], tr.y2[k]) > hy) continue;
    for (let s = 1; s < steps; s++) {
      const px = ax + ((bx - ax) * s) / steps, py = ay + ((by - ay) * s) / steps;
      if (segLen(px, py, tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k]) < lim) return false;
    }
  }
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!solidWall(wl.type[k])) continue;
    if (Math.max(wl.x1[k], wl.x2[k]) < lx || Math.min(wl.x1[k], wl.x2[k]) > hx || Math.max(wl.y1[k], wl.y2[k]) < ly || Math.min(wl.y1[k], wl.y2[k]) > hy) continue;
    for (let s = 1; s < steps; s++) {
      const px = ax + ((bx - ax) * s) / steps, py = ay + ((by - ay) * s) / steps;
      if (segLen(px, py, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]) < lim) return false;
    }
  }
  return true;
}

/**
 * Unit direction for enemy `i` to walk toward (tx, ty), chasing wizard `seat` (its field), and
 * whether it is detouring (detours are walked at 80%).
 */
/** No way round to that seat's wizard: walls close it off (enemies then break through, enemies.ts). */
export function cutOff(w: World, i: number, seat: number): boolean {
  if (seat < 0 || seat >= MAX_SEATS) return false;
  const c = cellOf(w, w.bodies.x[i], w.bodies.y[i]);
  if (c < 0) return false;
  const GW = w.dims.gw, GH = w.dims.gh, CELLS = GW * GH;
  // Its own cell can be blocked just from standing against a wall: cut off only if no neighbour has a way either.
  const f = w.nav.field, base = seat * CELLS, cx = c % GW, cy = (c - cx) / GW;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const nx = cx + ox, ny = cy + oy;
    if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && f[base + ny * GW + nx] < INF) return false;
  }
  return true;
}

export function steer(w: World, i: number, tx: number, ty: number, seat: number): [number, number, boolean] {
  const b = w.bodies, x = b.x[i], y = b.y[i];
  const dx = tx - x, dy = ty - y, d = len(dx, dy);
  if (d < 1e-6) return [0, 0, false];
  if (seat < 0 || clearLine(w, x, y, tx, ty) || cutOff(w, i, seat)) return [dx / d, dy / d, false];
  const GW = w.dims.gw, GH = w.dims.gh;
  const f = w.nav.field, base = seat * GW * GH;
  let c = cellOf(w, x, y), aim = -1;
  // Walk the field downhill up to 8 cells, and head for the farthest one still in clear view
  // (heading for one behind a corner would walk into the wall's end).
  for (let s = 0; s < 8; s++) {
    const cx = c % GW, cy = (c - cx) / GW;
    let best = c;
    for (let q = 0; q < 8; q++) {
      const nx = cx + NBX[q], ny = cy + NBY[q];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const nc = ny * GW + nx;
      if (f[base + nc] < f[base + best]) best = nc;
    }
    if (best === c) break;
    c = best;
    if (aim < 0 || clearLine(w, x, y, centreX(w, c), centreY(w, c))) aim = c;
  }
  if (aim < 0) aim = c;
  const ex = centreX(w, aim) - x, ey = centreY(w, aim) - y, el = len(ex, ey);
  return el < 1e-6 ? [dx / d, dy / d, false] : [ex / el, ey / el, true];
}
