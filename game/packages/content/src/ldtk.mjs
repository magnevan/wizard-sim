// Reading and writing the LDtk project (game/content/maps/world.ldtk and its one-file-per-level
// .ldtkl files), and the mapping between LDtk pixels and world units.
//
// The scale: 1 world unit = 20 LDtk pixels, so one terrain cell (the sim's CELL, 0.5 u) is 10 px.
// A level's pixel origin is its top-left corner; the world's is the room's centre, y down in both.
// world = (px - pxWid / 2) / 20. Both operands are integers, so the division is correctly rounded:
// every coordinate that is a multiple of 0.05 u round-trips exactly (-2.6 u is 428 px in a 960 px
// level, and (428 - 480) / 20 is the same double as the literal -2.6).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** game/ */
export const GAME = resolve(here, '../../..');
export const CONTENT = join(GAME, 'content');
export const PROJECT = join(CONTENT, 'maps/world.ldtk');
/** The generated module the sim imports. */
export const GEN_OUT = join(GAME, 'packages/sim/src/rooms.gen.ts');
/** LDtk's official JSON schema, fetched from https://ldtk.io/files/JSON_SCHEMA.json and pinned. */
export const SCHEMA = join(here, '../schema/ldtk-1.5.3.schema.json');
/** The LDtk version the files are written for. */
export const LDTK_VERSION = '1.5.3';

export const PX_PER_UNIT = 20;
/** One terrain cell in LDtk pixels (the sim's CELL = 0.5 u). */
export const GRID_PX = 10;
export const CELL = GRID_PX / PX_PER_UNIT;

export const toWorldX = (px, pxWid) => (px - pxWid / 2) / PX_PER_UNIT;
export const toWorldY = (px, pxHei) => (px - pxHei / 2) / PX_PER_UNIT;
export const toPx = (u, pxSize) => u * PX_PER_UNIT + pxSize / 2;

/** The room id of a level: its identifier with a lower-case first letter ("Survive" -> "survive"). */
export const roomId = (identifier) => identifier[0].toLowerCase() + identifier.slice(1);

/**
 * Loads the project and every level file. Returns { project, levels: [{ level, path }] }, the
 * levels in the project's order, each with its layer instances filled in.
 */
export function loadProject(path = PROJECT) {
  const project = JSON.parse(readFileSync(path, 'utf8'));
  const levels = project.levels.map((stub) => {
    if (!project.externalLevels || !stub.externalRelPath) return { level: stub, path: null };
    const file = join(dirname(path), stub.externalRelPath);
    return { level: JSON.parse(readFileSync(file, 'utf8')), path: file };
  });
  return { project, levels, path };
}

/** A level by room id or identifier (case-insensitive). */
export function findLevel(loaded, name) {
  const n = name.toLowerCase();
  const hit = loaded.levels.find(({ level }) => level.identifier.toLowerCase() === n);
  if (!hit) throw new Error(`no level "${name}" (levels: ${loaded.levels.map(({ level }) => level.identifier).join(', ')})`);
  return hit;
}

export const layerOf = (level, identifier) => (level.layerInstances ?? []).find((l) => l.__identifier === identifier) ?? null;

/** An entity instance's field value by identifier (undefined if it has no such field). */
export const fieldOf = (entity, identifier) => entity.fieldInstances.find((f) => f.__identifier === identifier)?.__value;

/**
 * JSON in LDtk's layout: tabs, short arrays of numbers or strings on one line, and an IntGrid's
 * intGridCsv as one row of the grid per line. It keeps our writes close to what the editor saves,
 * so a GUI save after a CLI edit makes a small diff.
 */
export function stringify(value) {
  const out = [];
  const flat = (v) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
  const write = (v, indent, rowLen) => {
    if (v === null || typeof v !== 'object') { out.push(JSON.stringify(v)); return; }
    const pad = '\t'.repeat(indent + 1), end = '\t'.repeat(indent);
    if (Array.isArray(v)) {
      if (v.length === 0) { out.push('[]'); return; }
      if (rowLen && flat(v)) {
        out.push('[\n');
        for (let i = 0; i < v.length; i += rowLen) out.push(pad + v.slice(i, i + rowLen).map((x) => JSON.stringify(x)).join(',') + (i + rowLen < v.length ? ',' : '') + '\n');
        out.push(end + ']');
        return;
      }
      if (flat(v)) { out.push('[ ' + v.map((x) => JSON.stringify(x)).join(', ') + ' ]'); return; }
      out.push('[\n');
      v.forEach((x, i) => { out.push(pad); write(x, indent + 1); out.push(i < v.length - 1 ? ',\n' : '\n'); });
      out.push(end + ']');
      return;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) { out.push('{}'); return; }
    out.push('{\n');
    keys.forEach((k, i) => {
      out.push(pad + JSON.stringify(k) + ': ');
      write(v[k], indent + 1, k === 'intGridCsv' && v.__cWid ? v.__cWid : 0);
      out.push(i < keys.length - 1 ? ',\n' : '\n');
    });
    out.push(end + '}');
  };
  write(value, 0, 0);
  return out.join('') + '\n';
}

export function saveJson(path, value) {
  writeFileSync(path, stringify(value));
}
