// npm run content:check: everything that must hold for the maps before the game may use them.
//   1. the project and every level file against LDtk's official JSON schema (pinned, 1.5.3);
//   2. references: layer and entity definitions, field definitions, IntGrid values, entity
//      reference fields, level files, unique iids;
//   3. the rooms compile, and the game's own rules for them (starts, altars);
//   4. placement: every spawn, portal, altar and dummy inside the room and clear of rock, and
//      reachable on foot from seat 0's start;
//   5. the generated module (packages/sim/src/rooms.gen.ts) is up to date;
//   6. the asset registry: every prop's meta.json is whole and names images that exist.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { compileProject, emitGrounds, emitModule, ROCK } from './compile.mjs';
import { CELL, GAME, GEN_OUT, GROUND_OUT, LDTK_VERSION, SCHEMA, loadProject, loadProps } from './ldtk.mjs';

const require = createRequire(import.meta.url);

/** The sim's numbers the check needs (a test keeps them equal to the sim's). */
export const SIM = {
  /** STRUCT.wallThickness: a wall's half-thickness. */
  wallThickness: 0.25,
  /** nav.ts INFLATE: how much nav widens rock for an enemy's size. */
  navInflate: 0.45,
  /** BODY.wizardRadius */
  wizardRadius: 0.45,
  /** N_ALTARS */
  altars: 3,
  /** The rooms the sim's code names (createWorld, the scenarios). */
  rooms: ['sanctum', 'arena', 'survive', 'tutorial', 'academy'],
};

let validators = null;
function schemaValidators() {
  if (validators) return validators;
  const Ajv = require('ajv');
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  schema.$id = 'ldtk';
  delete schema.$schema; // draft-07, named by an https URL ajv doesn't map to its built-in draft-07 meta-schema
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addSchema(schema);
  validators = { project: ajv.getSchema('ldtk'), level: ajv.compile({ $ref: 'ldtk#/otherTypes/Level' }) };
  return validators;
}
const ajvErrors = (where, errs) => (errs ?? []).slice(0, 12).map((e) => `${where}: schema: ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);

/** Distance from (px, py) to the segment (x1, y1)-(x2, y2). */
export function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function checkSchema(loaded, errors) {
  const v = schemaValidators();
  if (!v.project(loaded.project)) errors.push(...ajvErrors('world.ldtk', v.project.errors));
  if (loaded.project.jsonVersion !== LDTK_VERSION) errors.push(`world.ldtk: jsonVersion ${loaded.project.jsonVersion}; the pipeline is pinned to LDtk ${LDTK_VERSION} (see game/content/README.md)`);
  for (const { level, path } of loaded.levels) {
    if (!path) continue;
    const { __header__, ...body } = level;
    if (!v.level(body)) errors.push(...ajvErrors(level.identifier + '.ldtkl', v.level.errors));
  }
}

function checkReferences(loaded, errors) {
  const { project } = loaded;
  const layerDefs = new Map(project.defs.layers.map((l) => [l.uid, l]));
  const entityDefs = new Map(project.defs.entities.map((e) => [e.uid, e]));
  const iids = new Map(), entityIids = new Set();
  const seeIid = (iid, where) => { if (iids.has(iid)) errors.push(`${where}: iid ${iid} is also used by ${iids.get(iid)}`); else iids.set(iid, where); };
  seeIid(project.iid, 'the project');
  const names = new Set();
  project.levels.forEach((stub, i) => {
    if (names.has(stub.identifier)) errors.push(`two levels are called ${stub.identifier}`);
    names.add(stub.identifier);
    if (project.externalLevels && stub.externalRelPath && !loaded.levels[i].path) errors.push(`${stub.identifier}: level file ${stub.externalRelPath} is missing`);
  });
  for (const { level, path } of loaded.levels) {
    if (path && !existsSync(path)) errors.push(`${level.identifier}: ${path} is missing`);
    const stub = project.levels.find((s) => s.iid === level.iid);
    if (!stub || stub.identifier !== level.identifier || stub.pxWid !== level.pxWid || stub.pxHei !== level.pxHei) errors.push(`${level.identifier}: its file doesn't match the project's entry for it (identifier, iid or size)`);
    seeIid(level.iid, level.identifier);
    for (const li of level.layerInstances ?? []) {
      const where = `${level.identifier}/${li.__identifier}`;
      seeIid(li.iid, where);
      const def = layerDefs.get(li.layerDefUid);
      if (!def) { errors.push(`${where}: layer definition ${li.layerDefUid} doesn't exist`); continue; }
      if (def.identifier !== li.__identifier) errors.push(`${where}: its definition is called ${def.identifier}`);
      if (li.__cWid !== Math.ceil(level.pxWid / def.gridSize) || li.__cHei !== Math.ceil(level.pxHei / def.gridSize)) errors.push(`${where}: ${li.__cWid}x${li.__cHei} cells doesn't fit the level`);
      if (li.__type === 'IntGrid') {
        if (li.intGridCsv.length !== li.__cWid * li.__cHei) errors.push(`${where}: intGridCsv has ${li.intGridCsv.length} cells, not ${li.__cWid * li.__cHei}`);
        const known = new Set([0, ...def.intGridValues.map((v) => v.value)]);
        const bad = [...new Set(li.intGridCsv.filter((v) => !known.has(v)))];
        if (bad.length) errors.push(`${where}: IntGrid values ${bad.join(', ')} aren't defined`);
      }
      for (const e of li.entityInstances ?? []) {
        const ew = `${where}/${e.__identifier}@${e.px}`;
        seeIid(e.iid, ew);
        entityIids.add(e.iid);
        const ed = entityDefs.get(e.defUid);
        if (!ed) { errors.push(`${ew}: entity definition ${e.defUid} doesn't exist`); continue; }
        if (ed.identifier !== e.__identifier) errors.push(`${ew}: its definition is called ${ed.identifier}`);
        for (const f of e.fieldInstances) {
          const fd = ed.fieldDefs.find((d) => d.uid === f.defUid);
          if (!fd) errors.push(`${ew}: field ${f.__identifier} has no definition ${f.defUid}`);
          else if (fd.identifier !== f.__identifier) errors.push(`${ew}: field ${f.__identifier}'s definition is called ${fd.identifier}`);
          else if (!fd.canBeNull && f.__value === null) errors.push(`${ew}: field ${f.__identifier} must be set`);
        }
        for (const fd of ed.fieldDefs) if (!e.fieldInstances.some((f) => f.defUid === fd.uid)) errors.push(`${ew}: field ${fd.identifier} is missing`);
      }
    }
  }
  // Entity reference fields (none are defined yet; any added later must point at a real entity).
  for (const { level } of loaded.levels) for (const li of level.layerInstances ?? []) for (const e of li.entityInstances ?? []) for (const f of e.fieldInstances) {
    if (!String(f.__type).includes('EntityRef')) continue;
    for (const ref of [f.__value].flat()) if (ref && !entityIids.has(ref.entityIid)) errors.push(`${level.identifier}/${e.__identifier}: field ${f.__identifier} points at entity ${ref.entityIid}, which doesn't exist`);
  }
}

function checkRoom(room, errors) {
  const R = room.id, hw = room.w / 2, hh = room.h / 2;
  if (room.altars.length !== 0 && room.altars.length !== SIM.altars) errors.push(`${R}: ${room.altars.length} altars; a room has none or exactly ${SIM.altars}`);
  if (room.id === 'survive' && room.altars.length !== SIM.altars) errors.push(`${R}: Survive needs ${SIM.altars} altars`);
  if ((room.id === 'survive' || room.id === 'arena') && room.portals.length < 4) errors.push(`${R}: needs at least 4 portal spots (a wave opens up to 4)`);
  const walls = [...room.rock, ...room.propRock];
  const gw = Math.round(room.w / CELL), gh = Math.round(room.h / CELL);
  const rockCell = (cx, cy) => room.terrain[cy]?.[cx] === ROCK;
  const cellX = (x) => Math.floor((x + hw) / CELL), cellY = (y) => Math.floor((y + hh) / CELL);

  // Placement: inside the room and clear of rock.
  const points = [
    ...room.starts.map((p, i) => ['start ' + i, p]), ...room.dummies.map((p, i) => ['dummy ' + i, p]),
    ...room.portals.map((p, i) => ['portal ' + i, p]), ...room.altars.map((p, i) => ['altar ' + i, p]),
  ];
  for (const p of room.props) if (Math.abs(p.x) > hw || Math.abs(p.y) > hh) errors.push(`${R}: prop ${p.asset} at ${p.x},${p.y} is outside the room`);
  const clear = SIM.wallThickness + SIM.wizardRadius;
  for (const [name, [x, y]] of points) {
    if (Math.abs(x) > hw || Math.abs(y) > hh) { errors.push(`${R}: ${name} at ${x},${y} is outside the room`); continue; }
    if (rockCell(cellX(x), cellY(y))) errors.push(`${R}: ${name} at ${x},${y} is inside painted rock`);
    for (const s of walls) {
      const d = segDist(x, y, ...s);
      if (d < clear) { errors.push(`${R}: ${name} at ${x},${y} is ${d.toFixed(2)} u from the rock wall ${s.join(',')} (needs ${clear})`); break; }
    }
  }

  // Reachability on the enemies' nav grid (rock widened as nav.ts widens it), 8 neighbours.
  const pad = SIM.wallThickness + SIM.navInflate;
  const blocked = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    if (rockCell(cx, cy)) { blocked[cy * gw + cx] = 1; continue; }
    const x = -hw + (cx + 0.5) * CELL, y = -hh + (cy + 0.5) * CELL;
    for (const s of walls) if (segDist(x, y, ...s) < pad) { blocked[cy * gw + cx] = 1; break; }
  }
  if (!room.starts[0]) return;
  const seen = new Uint8Array(gw * gh), queue = [];
  const from = cellY(room.starts[0][1]) * gw + cellX(room.starts[0][0]);
  seen[from] = 1; queue.push(from);
  while (queue.length) {
    const c = queue.shift(), cx = c % gw, cy = (c - cx) / gw;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const n = ny * gw + nx;
      // No cutting a corner between two blocked cells.
      if (seen[n] || blocked[n] || (dx && dy && blocked[cy * gw + nx] && blocked[ny * gw + cx])) continue;
      seen[n] = 1; queue.push(n);
    }
  }
  for (const [name, [x, y]] of points) {
    const cx = Math.min(gw - 1, cellX(x)), cy = Math.min(gh - 1, cellY(y));
    let ok = false;
    for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) ok = !!seen[(cy + dy) * gw + cx + dx] && cx + dx >= 0 && cx + dx < gw && cy + dy >= 0 && cy + dy < gh;
    if (!ok) errors.push(`${R}: ${name} at ${x},${y} can't be reached on foot from seat 0's start`);
  }
}

/** The registry: each prop's meta.json has what the build and the client read, and its images exist. */
export function checkAssets(assets, errors) {
  for (const [id, m] of assets) {
    const A = `asset ${id}`;
    if (m.id !== id) errors.push(`${A}: meta.json says its id is ${m.id}`);
    if (m.kind !== 'prop') errors.push(`${A}: kind ${m.kind}; only prop is known`);
    if (!Array.isArray(m.footprint) || m.footprint.length !== 2 || m.footprint.some((v) => !(v > 0))) errors.push(`${A}: footprint must be [w, h] in world units`);
    if (m.base && !assets.has(m.base)) errors.push(`${A}: its base ${m.base} doesn't exist`);
    const sets = Object.entries(m.sets ?? {});
    if (!sets.length) errors.push(`${A}: no sets`);
    for (const [name, s] of sets) {
      if (!s.file || !existsSync(join(m.dir, s.file))) errors.push(`${A}: set ${name}'s image ${s.file} is missing`);
      if (!Array.isArray(s.foot) || s.foot.length !== 2) errors.push(`${A}: set ${name} has no foot [x, y]`);
      if (!s.source) errors.push(`${A}: set ${name} doesn't say its source`);
      if (s.raw && !existsSync(join(GAME, '..', s.raw))) errors.push(`${A}: set ${name}'s raw file ${s.raw} is missing`);
      if (/pixellab|gemini/.test(s.source ?? '') && !s.raw) errors.push(`${A}: set ${name} is generated, so it must name its raw file (game/content/generated)`);
    }
    for (const f of readdirSync(m.dir)) if (f.endsWith('.png') && !sets.some(([, s]) => s.file === f)) errors.push(`${A}: ${f} isn't in its meta.json`);
  }
}

/** Runs every check. Returns { errors, rooms, source } (source: the module the maps compile to). */
export function runCheck({ project = undefined, genOut = GEN_OUT } = {}) {
  const errors = [];
  let loaded;
  try { loaded = loadProject(project); } catch (e) { return { errors: [`can't load the maps: ${e.message}`], rooms: [], source: '' }; }
  checkSchema(loaded, errors);
  checkReferences(loaded, errors);
  const { rooms, errors: compileErrors } = compileProject(loaded);
  errors.push(...compileErrors);
  for (const id of SIM.rooms) if (!rooms.some((r) => r.id === id)) errors.push(`no level for the room "${id}" (the game's code names it)`);
  for (const room of rooms) checkRoom(room, errors);
  checkAssets(loadProps(), errors);
  const source = emitModule(rooms);
  const current = existsSync(genOut) ? readFileSync(genOut, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== source) errors.push(`${genOut} is stale: run \`npm run content:build\``);
  try {
    const grounds = existsSync(GROUND_OUT) ? readFileSync(GROUND_OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (grounds !== emitGrounds(loaded)) errors.push(`${GROUND_OUT} is stale: run \`npm run content:build\``);
  } catch (e) { errors.push(e.message); }
  return { errors, rooms, source };
}
