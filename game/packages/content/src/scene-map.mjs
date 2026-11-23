#!/usr/bin/env node
// usage: node packages/content/src/scene-map.mjs <room> <out.ppm>
// Draws where a room's resolved scene and the sim disagree (scene.mjs agreement), one pixel per cell: red an invisible
// wall, blue a hidden hole, yellow a height mismatch, grey walkable, dark solid.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from './ldtk.mjs';
import { compileProject, TIER_CHARS } from './compile.mjs';
import { SCENES } from './scene.mjs';

const [id, out] = process.argv.slice(2);
const { rooms } = compileProject(loadProject());
const room = rooms.find((r) => r.id === id);
const scene = JSON.parse(readFileSync(join(SCENES, id + '.json'), 'utf8'));
const gh = room.terrain.length, gw = room.terrain[0].length, C = 0.5;
const walk = new Int8Array(gw * gh).fill(-1), sh = new Float32Array(gw * gh).fill(NaN);
const WALK = new Set(['grass', 'path', 'road', 'paving', 'plaza', 'dais', 'stairs', 'wood', 'sand']);
for (const rg of scene.regions) {
  const ok = rg.kind !== 'building' && rg.kind !== 'post' && WALK.has(rg.mat) ? 1 : 0;
  for (const poly of rg.polys) for (let cy = 0; cy < gh; cy++) {
    const yc = -room.h / 2 + (cy + 0.5) * C, xs = [];
    for (const ring of poly) for (let i = 0; i < ring.length; i++) { const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length]; if ((ay > yc) !== (by > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let cx = Math.max(0, Math.ceil((xs[k] + room.w / 2) / C - 0.5)); cx <= Math.min(gw - 1, Math.floor((xs[k + 1] + room.w / 2) / C - 0.5)); cx++) { walk[cy * gw + cx] = ok; sh[cy * gw + cx] = rg.h; }
  }
}
const px = Buffer.alloc(gw * gh * 3);
for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
  const k = cy * gw + cx, t = room.terrain[cy][cx], sw = t !== '#' && t !== '_', s = walk[k];
  let c = sw ? [150, 150, 150] : [40, 40, 50];
  if (!sw && s === 1) c = [230, 40, 40];
  else if (sw && s !== 1) c = [40, 90, 240];
  else if (sw && s === 1 && room.height) { const ch = room.height.rows[cy][cx]; if (ch !== '/' && Math.abs((room.height.metres[TIER_CHARS.indexOf(ch)] ?? 0) - sh[k]) > 0.36) c = [240, 220, 40]; }
  px.set(c, k * 3);
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${gw} ${gh} 255\n`), px]));
console.log('wrote', out, gw, gh);
