// The agreement check (step 1 of tools/pipeline-3d): what a room's resolved scene shows must be what the sim walks on.
//
// A plan-made level has a resolved scene beside it (content/maps/scenes/<room>.json, written by
// tools/place-plans/vector.py): exact regions with a material and a height, the shapes the 3D view draws. The sim
// walks the level's cells. This rasterises the scene at the room's own cell centres and compares, cell by cell:
//   - blocked in the sim but walkable in the scene (an invisible wall),
//   - walkable in the sim but solid or void in the scene (a hole you can't see),
//   - both walkable, heights more than a tread apart (stairs are skipped: their cells ramp).
// While plans still carry cell edits (finishing passes), today's mismatches are allowed up to a committed baseline
// (scenes/agreement-baseline.json): a room may not get worse; step 2b of the pipeline brings every baseline to 0.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from './ldtk.mjs';
import { TIER_CHARS } from './compile.mjs';

export const SCENES = join(CONTENT, 'maps/scenes');
const BASELINE = join(SCENES, 'agreement-baseline.json');
const CELL = 0.5;
/** A tread is 0.35 m; heights closer than this agree. */
const HEIGHT_TOL = 0.36;
const WALKABLE = new Set(['grass', 'path', 'road', 'paving', 'plaza', 'dais', 'stairs', 'wood', 'sand']);

/** Scanline fill of one region's polygons (exterior and holes, even-odd) at the cell centres; calls fill(cx, cy). */
function rasterise(polys, gw, gh, w, h, fill) {
  for (const poly of polys) {
    let y0 = Infinity, y1 = -Infinity;
    for (const ring of poly) for (const [, y] of ring) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const r0 = Math.max(0, Math.floor((y0 + h / 2) / CELL - 0.5)), r1 = Math.min(gh - 1, Math.ceil((y1 + h / 2) / CELL - 0.5));
    for (let cy = r0; cy <= r1; cy++) {
      const yc = -h / 2 + (cy + 0.5) * CELL, xs = [];
      for (const ring of poly) for (let i = 0, n = ring.length; i < n; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n];
        if ((ay > yc) !== (by > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + w / 2) / CELL - 0.5)), c1 = Math.min(gw - 1, Math.floor((xs[k + 1] + w / 2) / CELL - 0.5));
        for (let cx = c0; cx <= c1; cx++) fill(cx, cy);
      }
    }
  }
}

/** Compares one room with its scene: counts by kind, and up to 3 examples of each. */
export function agreement(room, scene) {
  const gh = room.terrain.length, gw = room.terrain[0].length, w = room.w, h = room.h;
  const walk = new Int8Array(gw * gh).fill(-1), sh = new Float32Array(gw * gh).fill(NaN);   // -1 nothing drawn, 0 solid, 1 walkable
  for (const rg of scene.regions) {
    const ok = rg.kind !== 'building' && WALKABLE.has(rg.mat) ? 1 : 0;
    rasterise(rg.polys, gw, gh, w, h, (cx, cy) => { walk[cy * gw + cx] = ok; sh[cy * gw + cx] = rg.h; });
  }
  const hd = room.height, counts = { invisibleWall: 0, hiddenHole: 0, height: 0 }, eg = { invisibleWall: [], hiddenHole: [], height: [] };
  const note = (kind, cx, cy, extra = '') => { counts[kind]++; if (eg[kind].length < 3) eg[kind].push(`${(-w / 2 + (cx + 0.5) * CELL).toFixed(1)},${(-h / 2 + (cy + 0.5) * CELL).toFixed(1)}${extra}`); };
  // A cell agrees if the scene agrees there or at one of its four neighbours: a curve rasterised onto the 45-degree grid
  // is a staircase a cell deep, which isn't a disagreement (step 2b removes it, with collision from outlines).
  const near = (cx, cy, ok) => { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < gw && y < gh && ok(y * gw + x)) return true; } return false; };
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const t = room.terrain[cy][cx], simWalk = t !== '#' && t !== '_';
    if (!simWalk) { if (!near(cx, cy, (k) => walk[k] !== 1)) note('invisibleWall', cx, cy); continue; }
    if (!near(cx, cy, (k) => walk[k] === 1)) { note('hiddenHole', cx, cy); continue; }
    if (!hd) continue;
    const ch = hd.rows[cy]?.[cx];
    if (ch === undefined || ch === '/') continue;
    const m = hd.metres[TIER_CHARS.indexOf(ch)] ?? 0;
    if (!near(cx, cy, (k) => walk[k] === 1 && Math.abs(m - sh[k]) <= HEIGHT_TOL)) note('height', cx, cy, ` (sim ${m.toFixed(2)} m, scene ${sh[cy * gw + cx].toFixed(2)} m)`);
  }
  return { counts, eg, total: counts.invisibleWall + counts.hiddenHole + counts.height };
}

/** Every room with a scene: errors when a room is worse than its baseline, warnings with today's numbers. */
export function agreementAll(rooms) {
  const errors = [], warnings = [];
  if (!existsSync(SCENES)) return { errors, warnings };
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  for (const room of rooms) {
    const f = join(SCENES, room.id + '.json');
    if (!existsSync(f)) continue;
    const scene = JSON.parse(readFileSync(f, 'utf8'));
    // the stamp: a scene built for a different version of its level is stale (step 3 of tools/pipeline-3d)
    const lf = join(CONTENT, 'maps/world', (scene.level ?? room.id) + '.ldtkl');
    if (scene.levelHash && existsSync(lf)) {
      const now = createHash('sha1').update(readFileSync(lf, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
      if (now !== scene.levelHash) { errors.push(`${room.id}: the resolved scene was built for another version of ${scene.level}.ldtkl: run \`python tools/place-plans/build.py ${scene.plan}\``); continue; }
    }
    const { counts, eg, total } = agreement(room, scene);
    const detail = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k} (e.g. ${eg[k].join('; ')})`).join(', ');
    const allowed = baseline[room.id] ?? 0;
    if (total > allowed) errors.push(`${room.id}: the scene and the sim disagree on ${total} cells, more than the baseline ${allowed} (scenes/agreement-baseline.json): ${detail}`);
    else if (total) warnings.push(`${room.id}: scene and sim disagree on ${total} cells (baseline ${allowed}${total < allowed ? '; lower the baseline' : ''}): ${detail}`);
  }
  return { errors, warnings };
}
