// The sense lint (phase 7 of docs/threads/height.md): the sense rules a script can check
// (docs/campaign/making-a-place.md#the-sense-rules). Warnings, not errors: content:check prints them and passes.
//   - a door or gate has 3 u clear in front of it: some straight approach, 3 u long and 1 u wide, that's walkable,
//     crosses no cliff and no blocking prop (so nothing tall stands in it);
//   - a path leads to a door: that approach's ground isn't grass or leaves;
//   - water meets a shore, a quay or a cliff, never grass or paving at the same height;
//   - a door doesn't open straight onto a road (its approach isn't mostly road);
//   - the void outside the outline isn't within a screen of walkable ground;
//   - a roof (blocked ground standing a metre or more over walkable ground beside it) isn't in a floor material.
// Unguarded drops along a route and regions no route reaches need the plan's routes: tools/place-plans/to_ldtk.py --report.
// Stairs joined at both ends are the compiler's rule for painted stairs and to_ldtk.py --report's for plan-made levels.
import { CELL, layerOf } from './ldtk.mjs';
import { STAIR, STEP_M, groundRows, isBlocked, tierOf } from './compile.mjs';
import { segDist } from './check.mjs';

/** How far in front of a door or gate must be clear, world units, and how wide. */
export const APPROACH = 3, APPROACH_W = 1;
/** Ground that isn't a path: a door's approach shouldn't be this. */
const NOT_PATH = new Set(['g', 'l']);
/** What water may not touch at its own height: grass and paving. */
const NOT_SHORE = { g: 'grass', f: 'flagstone', c: 'cobble', h: 'slabs' };
/** Road: a door's approach shouldn't be mostly this (it wants a forecourt). */
const ROAD = 'c';
/** Floor materials: a roof painted in one reads as a walkable terrace. */
const FLOOR = { f: 'flagstone', h: 'slabs', c: 'cobble', p: 'planks', d: 'dirt' };
/** How near walkable ground the void may come, world units: about a screen, so it never shows in play. */
export const VOID_MARGIN = 12;

/** The lint's warnings for one compiled room, given its level's Ground rows (or null). */
export function senseLint(room, ground) {
  const out = [], R = room.id, hw = room.w / 2, hh = room.h / 2;
  const gw = Math.round(room.w / CELL), gh = Math.round(room.h / CELL);
  const hd = room.height;
  const cellOf = (x, y) => [Math.floor((x + hw) / CELL), Math.floor((y + hh) / CELL)];
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < gw && cy < gh;
  /** Metres at a cell, or null on a stair (it joins whatever it touches) or in a flat room (0). */
  const metres = (cx, cy) => {
    if (!hd) return 0;
    const ch = hd.rows[cy][cx];
    return ch === STAIR ? null : hd.metres[tierOf(ch)];
  };
  const step = (a, b) => a === null || b === null || Math.abs(a - b) <= STEP_M;
  const walls = room.propRock;

  // ---- doors and gates: some clear approach ----
  const DIRS = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  const approach = (x, y) => {
    let best = null;
    for (const [dx, dy] of DIRS) {
      let ok = true, last = null, grassy = 0, road = 0, n = 0;
      for (let t = 0.75; t <= APPROACH + 1e-9 && ok; t += 0.25) {
        for (const o of [-APPROACH_W / 2, 0, APPROACH_W / 2]) {
          const px = x + dx * t - dy * o, py = y + dy * t + dx * o, [cx, cy] = cellOf(px, py);
          if (!inside(cx, cy) || isBlocked(room.terrain[cy][cx])) { ok = false; break; }
          if (walls.some((s) => segDist(px, py, ...s) < 0.3)) { ok = false; break; }
          if (o === 0) {
            const m = metres(cx, cy);
            if (last !== undefined && last !== null && !step(last, m)) { ok = false; break; }
            last = m;
            n++; if (ground && NOT_PATH.has(ground[cy]?.[cx])) grassy++; if (ground?.[cy]?.[cx] === ROAD) road++;
          }
        }
      }
      if (ok && (!best || grassy / n < best.grassy)) best = { dx, dy, grassy: grassy / n, road: road / n };
    }
    return best;
  };
  for (const m of room.markers) {
    const door = m.id.startsWith('door-'), gate = m.id.startsWith('gate-');
    if (!door && !gate) continue;
    const a = approach(m.x, m.y);
    if (!a) { out.push(`${R}: ${m.id} at ${m.x.toFixed(1)},${m.y.toFixed(1)} has no clear approach ${APPROACH} u long and ${APPROACH_W} u wide (something tall, a cliff or the edge is in front of it)`); continue; }
    if (door && ground && a.road > 0.5) out.push(`${R}: ${m.id} at ${m.x.toFixed(1)},${m.y.toFixed(1)} opens straight onto a road (${Math.round(a.road * 100)}% of its approach): give it a forecourt`);
    if (door && ground && a.grassy > 0.5) out.push(`${R}: ${m.id} at ${m.x.toFixed(1)},${m.y.toFixed(1)}: no path leads to it (its clearest approach is ${Math.round(a.grassy * 100)}% grass or leaves)`);
  }

  // ---- water beside grass or paving at the same height ----
  if (ground) {
    const hits = {};
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      if (ground[cy][cx] !== 'w') continue;
      for (const [nx, ny] of [[cx + 1, cy], [cx, cy + 1], [cx - 1, cy], [cx, cy - 1]]) {
        if (!inside(nx, ny)) continue;
        const what = NOT_SHORE[ground[ny][nx]];
        if (!what || !step(metres(cx, cy), metres(nx, ny))) continue; // a cliff between them is a proper edge
        const h = (hits[what] ??= { n: 0, x: -hw + (nx + 0.5) * CELL, y: -hh + (ny + 0.5) * CELL });
        h.n++;
      }
    }
    for (const [what, h] of Object.entries(hits)) out.push(`${R}: water meets ${what} directly along ${h.n} cell edge(s), e.g. near ${h.x.toFixed(1)},${h.y.toFixed(1)} (give it a shore, a quay or a drop)`);
  }
  // ---- the void within a screen of walkable ground ----
  const walkable = (cx, cy) => !isBlocked(room.terrain[cy][cx]);
  const voidCells = [];
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) if (room.terrain[cy][cx] === '_') voidCells.push(cy * gw + cx);
  if (voidCells.length) {
    const far = Math.ceil(VOID_MARGIN / CELL), dist = new Int32Array(gw * gh).fill(-1), q = voidCells.slice();
    for (const c of q) dist[c] = 0;
    let near = 0, eg = null;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % gw, cy = (c - cx) / gw;
      if (dist[c] > 0 && walkable(cx, cy)) { near++; eg ??= [-hw + (cx + 0.5) * CELL, -hh + (cy + 0.5) * CELL]; }
      if (dist[c] >= far) continue;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (!inside(nx, ny) || dist[ny * gw + nx] >= 0) continue;
        dist[ny * gw + nx] = dist[c] + 1; q.push(ny * gw + nx);
      }
    }
    if (near) out.push(`${R}: the void is within ${VOID_MARGIN} u (about a screen) of ${Math.round(near * CELL * CELL)} u2 of walkable ground, e.g. near ${eg[0].toFixed(1)},${eg[1].toFixed(1)}: it will show in play (carry the land or sea on past it)`);
  }

  // ---- a roof in a floor material ----
  if (ground && hd) {
    const hits = {};
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const what = FLOOR[ground[cy][cx]];
      if (!what || room.terrain[cy][cx] !== '#') continue;
      const top = metres(cx, cy);
      const over = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].some(([nx, ny]) => inside(nx, ny) && walkable(nx, ny) && metres(nx, ny) !== null && top - metres(nx, ny) >= 1);
      if (!over) continue;
      const h = (hits[what] ??= { n: 0, x: -hw + (cx + 0.5) * CELL, y: -hh + (cy + 0.5) * CELL });
      h.n++;
    }
    for (const [what, h] of Object.entries(hits)) out.push(`${R}: a roof or wall top is painted ${what}, a floor material, along ${h.n} edge cell(s), e.g. near ${h.x.toFixed(1)},${h.y.toFixed(1)}: it reads as a walkable terrace`);
  }
  return out;
}

/** The lint over every level that compiled to a room. */
export function senseLintAll(loaded, rooms) {
  const out = [];
  loaded.levels.forEach(({ level }, i) => {
    const room = rooms[i];
    if (!room || !layerOf(level, 'Terrain')) return;
    let ground = null;
    try { ground = groundRows(loaded.project, level); } catch { ground = null; }
    out.push(...senseLint(room, ground));
  });
  return out;
}
