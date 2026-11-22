// The sense lint (phase 7 of docs/threads/height.md): the sense rules a script can check
// (docs/campaign/making-a-place.md#the-sense-rules). Warnings, not errors: content:check prints them and passes.
//   - a door or gate has 3 u clear in front of it: some straight approach, 3 u long and 1 u wide, that's walkable,
//     crosses no cliff and no blocking prop (so nothing tall stands in it);
//   - a path leads to a door: that approach's ground isn't grass or leaves;
//   - water meets a shore, a quay or a cliff, never grass or paving at the same height.
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
      let ok = true, last = null, grassy = 0, n = 0;
      for (let t = 0.75; t <= APPROACH + 1e-9 && ok; t += 0.25) {
        for (const o of [-APPROACH_W / 2, 0, APPROACH_W / 2]) {
          const px = x + dx * t - dy * o, py = y + dy * t + dx * o, [cx, cy] = cellOf(px, py);
          if (!inside(cx, cy) || isBlocked(room.terrain[cy][cx])) { ok = false; break; }
          if (walls.some((s) => segDist(px, py, ...s) < 0.3)) { ok = false; break; }
          if (o === 0) {
            const m = metres(cx, cy);
            if (last !== undefined && last !== null && !step(last, m)) { ok = false; break; }
            last = m;
            n++; if (ground && NOT_PATH.has(ground[cy]?.[cx])) grassy++;
          }
        }
      }
      if (ok && (!best || grassy / n < best.grassy)) best = { dx, dy, grassy: grassy / n };
    }
    return best;
  };
  for (const m of room.markers) {
    const door = m.id.startsWith('door-'), gate = m.id.startsWith('gate-');
    if (!door && !gate) continue;
    const a = approach(m.x, m.y);
    if (!a) { out.push(`${R}: ${m.id} at ${m.x.toFixed(1)},${m.y.toFixed(1)} has no clear approach ${APPROACH} u long and ${APPROACH_W} u wide (something tall, a cliff or the edge is in front of it)`); continue; }
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
