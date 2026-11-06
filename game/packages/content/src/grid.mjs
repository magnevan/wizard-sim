// The Terrain IntGrid as text rows, for reading and diffs, and text rows written back into a level.
import { readFileSync } from 'node:fs';
import { FLOOR, ROCK, terrainLegend, terrainRows } from './compile.mjs';
import { CELL, GRID_PX, PX_PER_UNIT, layerOf, saveJson, toWorldX, toWorldY } from './ldtk.mjs';

/** Overlay marks for --entities (read-only: write refuses them). */
export const MARKS = { PlayerStart: 'S', Dummy: 'D', Portal: 'P', Altar: 'A', Rock: '+', Prop: 'O' };

const header = (level, layer, legend) => [
  `// ${level.identifier}: ${layer.__cWid} x ${layer.__cHei} cells of ${CELL} u (${level.pxWid / PX_PER_UNIT} x ${level.pxHei / PX_PER_UNIT} u). Row 0 is the top.`,
  `// legend: ${[...legend].filter(([, ch]) => ch).map(([v, ch]) => `'${ch}' ${v === 0 ? 'floor (unpainted)' : `${v} ${terrainName(ch)}`}`).join(', ')}`,
];
const terrainName = (ch) => (ch === ROCK ? 'rock' : ch === FLOOR ? 'floor' : '?');

/** A level's terrain as text. With `entities`, entity cells are marked (S start, D dummy, P portal, A altar, + free rock). */
export function printGrid(project, level, { entities = false } = {}) {
  const layer = layerOf(level, 'Terrain');
  if (!layer) throw new Error(`${level.identifier} has no Terrain layer`);
  const { rows, error } = terrainRows(project, level);
  if (error) throw new Error(error);
  const legend = terrainLegend(project);
  const lines = header(level, layer, legend);
  let out = rows.map((r) => r.split(''));
  if (entities) {
    lines.push(`// entities: ${Object.entries(MARKS).map(([k, m]) => `'${m}' ${k}`).join(', ')} (a view only: don't write these back)`);
    const put = (x, y, m) => {
      const cx = Math.floor((x * PX_PER_UNIT + level.pxWid / 2) / GRID_PX), cy = Math.floor((y * PX_PER_UNIT + level.pxHei / 2) / GRID_PX);
      if (cy >= 0 && cy < out.length && cx >= 0 && cx < out[0].length) out[cy][cx] = m;
    };
    for (const e of layerOf(level, 'Entities')?.entityInstances ?? []) {
      const m = MARKS[e.__identifier] ?? '?';
      if (e.__identifier === 'Rock') {
        const f = Object.fromEntries(e.fieldInstances.map((fi) => [fi.__identifier, fi.__value]));
        const n = Math.ceil(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / (CELL / 2)) + 1;
        for (let i = 0; i <= n; i++) put(f.x1 + ((f.x2 - f.x1) * i) / n, f.y1 + ((f.y2 - f.y1) * i) / n, m);
      }
    }
    for (const e of layerOf(level, 'Entities')?.entityInstances ?? []) {
      if (e.__identifier === 'Rock') continue;
      const ex = e.fieldInstances.find((f) => f.__identifier === 'x')?.__value, ey = e.fieldInstances.find((f) => f.__identifier === 'y')?.__value;
      put(typeof ex === 'number' ? ex : toWorldX(e.px[0], level.pxWid), typeof ey === 'number' ? ey : toWorldY(e.px[1], level.pxHei), MARKS[e.__identifier] ?? '?');
    }
  }
  return [...lines, ...out.map((r) => r.join(''))].join('\n') + '\n';
}

/** Text rows (comment lines start with //) -> the level's intGridCsv. Throws on a bad size or character. */
export function parseRows(text, project, level) {
  const layer = layerOf(level, 'Terrain');
  if (!layer) throw new Error(`${level.identifier} has no Terrain layer`);
  const rows = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !l.startsWith('//'));
  if (rows.length !== layer.__cHei) throw new Error(`${level.identifier} is ${layer.__cHei} rows tall; got ${rows.length}`);
  const byChar = new Map([...terrainLegend(project)].filter(([, ch]) => ch).map(([v, ch]) => [ch, v]));
  const csv = [];
  rows.forEach((row, y) => {
    if (row.length !== layer.__cWid) throw new Error(`row ${y} is ${row.length} wide; ${level.identifier} is ${layer.__cWid}`);
    for (let x = 0; x < row.length; x++) {
      const v = byChar.get(row[x]);
      if (v === undefined) throw new Error(`row ${y}, column ${x}: '${row[x]}' is not a terrain character (${[...byChar.keys()].map((c) => `'${c}'`).join(' ')})`);
      csv.push(v);
    }
  });
  return csv;
}

/** Writes rows into the level's file (or the project, for a level kept inside it). Returns cells changed. */
export function writeGrid(loaded, entry, text) {
  const { level, path } = entry;
  const layer = layerOf(level, 'Terrain');
  const csv = parseRows(text, loaded.project, level);
  let changed = 0;
  csv.forEach((v, i) => { if (layer.intGridCsv[i] !== v) changed++; });
  layer.intGridCsv = csv;
  if (path) saveJson(path, level);
  else saveJson(loaded.path, loaded.project);
  return changed;
}

export const readText = (file) => readFileSync(file === '-' ? 0 : file, 'utf8');
