#!/usr/bin/env node
// Usage (from game/): node packages/content/src/terraces-level.mjs
// Writes content/maps/world/Terraces.ldtkl, the test room for height tiers (#terraces), and lists it in
// world.ldtk. A lower floor (tier 0), a terrace 3 m up (tier 1) joined by a wide stair, a balcony 6 m up
// (tier 2) reached by a narrow stair off the terrace, a rock pillar, and a void corner so the outline isn't
// a rectangle. Portals stand on every tier, so content:check's reachability proves the stairs join them.
// Then run: npm run content:build && npm run content:check
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT, GRID_PX, PROJECT, PX_PER_UNIT, loadProject, saveJson, toPx } from './ldtk.mjs';

const W = 32, H = 24, CW = (W * PX_PER_UNIT) / GRID_PX, CH = (H * PX_PER_UNIT) / GRID_PX;
const NAME = 'Terraces', FILE = join(CONTENT, 'maps/world', `${NAME}.ldtkl`), UID = 120;
const METRES = [0, 3, 6];

// ---- the cells ('0'-'2' tier, '/' stair; '.' floor, '#' rock, '_' void) -----------------------------------------
const tier = (cx, cy) => {
  if (cx >= 28 && cx <= 35 && cy >= 19 && cy <= 25) return '/'; // the wide stair, terrace to floor
  if (cx >= 40 && cx <= 43 && cy >= 3 && cy <= 7) return '/'; // the narrow stair, terrace to balcony
  if (cx >= 44 && cy <= 9) return '2';
  return cy <= 21 ? '1' : '0';
};
const ground = (cx, cy) => {
  if (cx + (CH - 1 - cy) < 14) return '_'; // the south-west corner is outside the room
  if (cx >= 14 && cx <= 17 && cy >= 8 && cy <= 11) return '#'; // a pillar on the terrace
  return '.';
};
const rows = (f) => Array.from({ length: CH }, (_, cy) => Array.from({ length: CW }, (_, cx) => f(cx, cy)).join(''));

// ---- the level, cloned from the Sanctum's layout -------------------------------------------------------------------
const loaded = loadProject();
const { project } = loaded;
const source = JSON.parse(readFileSync(join(CONTENT, 'maps/world/Sanctum.ldtkl'), 'utf8'));
const arena = JSON.parse(readFileSync(join(CONTENT, 'maps/world/Arena.ldtkl'), 'utf8'));
const samples = {};
for (const l of [source, arena]) for (const li of l.layerInstances) for (const e of li.entityInstances) samples[e.__identifier] ??= e;
const values = (layer) => new Map(project.defs.layers.find((l) => l.identifier === layer).intGridValues.map((v) => [v.identifier, v.value]));
const TV = values('Terrain'), HV = values('Height');
const terrainValue = { '.': 0, '#': TV.get('rock'), _: TV.get('void') };
const heightValue = (ch) => (ch === '0' ? 0 : ch === '/' ? HV.get('stair') : HV.get(`t${ch}`));

let n = 0;
const id = (kind) => `7e44ace5-0000-4000-8000-${(kind.length * 1000 + n++).toString().padStart(12, '0')}`;
const pxW = W * PX_PER_UNIT, pxH = H * PX_PER_UNIT;
function entity(kind, x, y, fields = {}) {
  const e = structuredClone(samples[kind]);
  const px = [Math.round(toPx(x, pxW)), Math.round(toPx(y, pxH))];
  Object.assign(e, { iid: id(kind), px, __grid: [Math.floor(px[0] / GRID_PX), Math.floor(px[1] / GRID_PX)], __worldX: null, __worldY: null });
  for (const f of e.fieldInstances) {
    const v = fields[f.__identifier] ?? null;
    f.__value = v;
    f.realEditorValues = v === null ? [] : [{ id: `V_${f.__type}`, params: [v] }];
  }
  return e;
}
const es = [
  ...[[-1.5, 7], [1.5, 7], [-1.5, 9], [1.5, 9]].map(([x, y], seat) => entity('PlayerStart', x, y, { seat })),
  entity('Portal', -10, -4), entity('Portal', 8, -6), entity('Portal', 12, -9), entity('Portal', 12, 8),
  entity('Dummy', 10, -10.5), entity('Dummy', -4, -6),
];

const level = structuredClone(source);
Object.assign(level, { identifier: NAME, iid: id('level'), uid: UID, worldX: 7640, worldY: 0, pxWid: pxW, pxHei: pxH });
for (const li of level.layerInstances) {
  Object.assign(li, { __cWid: CW, __cHei: CH, iid: id(li.__identifier), levelId: UID });
  if (li.__identifier === 'Entities') li.entityInstances = es;
  if (li.__identifier === 'Terrain') li.intGridCsv = rows(ground).join('').split('').map((c) => terrainValue[c]);
  if (li.__identifier === 'Height') li.intGridCsv = rows(tier).join('').split('').map(heightValue);
  if (li.__identifier === 'Ground') li.intGridCsv = new Array(CW * CH).fill(0);
}
const tm = level.fieldInstances.find((f) => f.__identifier === 'tierMetres');
tm.__value = METRES;
tm.realEditorValues = METRES.map((v) => ({ id: 'V_Float', params: [v] }));
saveJson(FILE, level);

// ---- list it in the project ---------------------------------------------------------------------------------------
const { __header__, ...stub } = structuredClone(level);

Object.assign(stub, { layerInstances: null, externalRelPath: `world/${NAME}.ldtkl` });
const at = project.levels.findIndex((l) => l.identifier === NAME);
if (at >= 0) project.levels[at] = stub; else project.levels.push(stub);
project.nextUid = Math.max(project.nextUid, UID + 1);
saveJson(PROJECT, project);
console.log(`wrote ${FILE}${existsSync(FILE) ? '' : ' (?)'}. Now run: npm run content:build && npm run content:check`);
