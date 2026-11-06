// LDtk levels -> room definitions (plain data), and room definitions -> the generated module
// packages/sim/src/rooms.gen.ts. The build reads only the data layers: the Terrain IntGrid and
// the Entities layer. Auto-tiles LDtk may bake are ignored (the client draws with our art).
import { GRID_PX, PX_PER_UNIT, layerOf, fieldOf, loadProps, roomId, toWorldX, toWorldY } from './ldtk.mjs';

/** Terrain: IntGrid value identifier -> the character in a room's terrain rows. 0 (unpainted) is floor. */
export const TERRAIN_CHARS = { floor: '.', rock: '#' };
export const FLOOR = TERRAIN_CHARS.floor, ROCK = TERRAIN_CHARS.rock;

/** The entities the game understands, and what each becomes in a room. */
export const ENTITY_KINDS = ['PlayerStart', 'Dummy', 'Portal', 'Altar', 'Rock', 'Prop'];

/** A wall's half-thickness (the sim's STRUCT.wallThickness; check.mjs's SIM copy is tested against it). */
const WALL_HALF = 0.25;
const r3 = (v) => Math.round(v * 1000) / 1000;
/**
 * A blocking prop's footprint (w x h, world units, centred on x, y) -> wall segments. A wall is a
 * capsule 0.5 u thick, so a footprint up to 0.6 deep is one segment down its long side, and a deeper
 * one two side by side: that fills the box with one or two of a room's 40 wall slots, where tracing
 * its outline would take four.
 */
export function footprintWalls(x, y, [fw, fh]) {
  const along = Math.max(0, Math.max(fw, fh) / 2 - WALL_HALF), short = Math.min(fw, fh);
  const rows = short <= 0.6 ? [0] : [-(short / 2 - WALL_HALF), short / 2 - WALL_HALF];
  return rows.map((o) => (fw >= fh ? [x - along, y + o, x + along, y + o] : [x + o, y - along, x + o, y + along]).map(r3));
}

/** Value -> char for a project's Terrain layer, from its definition (unknown identifiers -> null). */
export function terrainLegend(project) {
  const def = project.defs.layers.find((l) => l.identifier === 'Terrain' && l.type === 'IntGrid');
  const legend = new Map([[0, FLOOR]]);
  for (const v of def?.intGridValues ?? []) legend.set(v.value, TERRAIN_CHARS[v.identifier] ?? null);
  return legend;
}

/**
 * Grid-aligned rock (cells marked '#') -> wall segments along every rock / floor boundary, merged
 * into the longest straight runs. Edges on the room's border are left out (the room's edge already
 * stops everything). Order: horizontal runs top to bottom, then vertical runs left to right.
 */
export function traceRock(rows, w, h) {
  const gh = rows.length, gw = rows[0]?.length ?? 0;
  const rock = (x, y) => rows[y][x] === ROCK;
  const X = (cx) => (cx * GRID_PX - (w * PX_PER_UNIT) / 2) / PX_PER_UNIT;
  const Y = (cy) => (cy * GRID_PX - (h * PX_PER_UNIT) / 2) / PX_PER_UNIT;
  const segs = [];
  for (let y = 1; y < gh; y++) {
    let start = -1;
    for (let x = 0; x <= gw; x++) {
      const edge = x < gw && rock(x, y - 1) !== rock(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) { segs.push([X(start), Y(y), X(x), Y(y)]); start = -1; }
    }
  }
  for (let x = 1; x < gw; x++) {
    let start = -1;
    for (let y = 0; y <= gh; y++) {
      const edge = y < gh && rock(x - 1, y) !== rock(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) { segs.push([X(x), Y(start), X(x), Y(y)]); start = -1; }
    }
  }
  return segs;
}

/** A level's Terrain layer as rows of characters (row 0 is the top, y = -h / 2). */
export function terrainRows(project, level) {
  const layer = layerOf(level, 'Terrain');
  if (!layer) return { rows: null, error: `${level.identifier}: no Terrain layer` };
  const legend = terrainLegend(project), rows = [];
  for (let y = 0; y < layer.__cHei; y++) {
    let row = '';
    for (let x = 0; x < layer.__cWid; x++) {
      const v = layer.intGridCsv[y * layer.__cWid + x] ?? 0, ch = legend.get(v);
      if (ch == null) return { rows: null, error: `${level.identifier}: Terrain cell ${x},${y} has value ${v}, which the game doesn't know (known: ${Object.keys(TERRAIN_CHARS).join(', ')})` };
      row += ch;
    }
    rows.push(row);
  }
  return { rows, error: null };
}

/**
 * One level -> a room definition. Returns { room, errors }. The room's key order is fixed: it is
 * what the room hash is taken over.
 */
export function compileLevel(project, level, assets = loadProps()) {
  const errors = [];
  const id = roomId(level.identifier);
  const { pxWid, pxHei } = level;
  if (pxWid % GRID_PX || pxHei % GRID_PX) errors.push(`${level.identifier}: size ${pxWid}x${pxHei} px is not a whole number of ${GRID_PX} px cells`);
  const w = pxWid / PX_PER_UNIT, h = pxHei / PX_PER_UNIT;
  const { rows, error } = terrainRows(project, level);
  if (error) errors.push(error);
  const layer = layerOf(level, 'Entities');
  if (!layer) errors.push(`${level.identifier}: no Entities layer`);
  const ox = layer?.__pxTotalOffsetX ?? 0, oy = layer?.__pxTotalOffsetY ?? 0;
  const starts = [], dummies = [], portals = [], altars = [], rock = [], props = [], propRock = [];
  for (const e of layer?.entityInstances ?? []) {
    const where = `${level.identifier}: ${e.__identifier} at px ${e.px[0]},${e.px[1]}`;
    const x = toWorldX(e.px[0] + ox, pxWid), y = toWorldY(e.px[1] + oy, pxHei);
    switch (e.__identifier) {
      case 'PlayerStart': {
        const seat = fieldOf(e, 'seat');
        if (!Number.isInteger(seat) || seat < 0 || seat > 3) errors.push(`${where}: seat must be 0-3 (is ${seat})`);
        else if (starts[seat]) errors.push(`${where}: seat ${seat} has two starts`);
        else starts[seat] = [x, y];
        break;
      }
      case 'Dummy': dummies.push([x, y]); break;
      case 'Portal': {
        const ex = fieldOf(e, 'x'), ey = fieldOf(e, 'y');
        // Exact values must agree with where the entity stands (within a pixel): a portal moved in
        // LDtk with its old values left in would otherwise silently stay where it was.
        if ((typeof ex === 'number' && Math.abs(ex - x) > 1 / PX_PER_UNIT) || (typeof ey === 'number' && Math.abs(ey - y) > 1 / PX_PER_UNIT)) {
          errors.push(`${where}: its exact x/y (${ex}, ${ey}) are more than a pixel from where it stands (${x}, ${y}); clear them after moving it`);
        }
        portals.push([typeof ex === 'number' ? ex : x, typeof ey === 'number' ? ey : y]);
        break;
      }
      case 'Altar': altars.push([x, y]); break;
      case 'Rock': {
        const s = ['x1', 'y1', 'x2', 'y2'].map((k) => fieldOf(e, k));
        if (s.some((v) => typeof v !== 'number')) errors.push(`${where}: x1, y1, x2 and y2 must all be set`);
        else rock.push(s);
        break;
      }
      case 'Prop': {
        const asset = fieldOf(e, 'asset'), blocks = fieldOf(e, 'blocks') === true, meta = assets.get(asset);
        if (!meta) { errors.push(`${where}: no prop asset "${asset}" (game/content/assets/props/${asset}/meta.json)`); break; }
        props.push({ asset, x, y, blocks });
        if (blocks) propRock.push(...footprintWalls(x, y, meta.footprint));
        break;
      }
      default: errors.push(`${where}: the game doesn't know this entity (known: ${ENTITY_KINDS.join(', ')})`);
    }
  }
  for (let s = 0; s < 4; s++) if (!starts[s]) errors.push(`${level.identifier}: no PlayerStart for seat ${s}`);
  if (rows) rock.push(...traceRock(rows, w, h));
  const room = { id, w, h, terrain: rows ?? [], rock, starts: [...starts], dummies, portals, altars, props, propRock };
  return { room, errors };
}

/** Every level -> rooms. Returns { rooms, errors }. */
export function compileProject(loaded) {
  const rooms = [], errors = [], assets = loadProps();
  for (const { level } of loaded.levels) {
    const r = compileLevel(loaded.project, level, assets);
    rooms.push(r.room);
    errors.push(...r.errors);
  }
  return { rooms, errors };
}

/** FNV-1a over the room's JSON: the same function as the sim's roomHash (packages/sim/src/room.ts). */
export function roomHash(room) {
  const s = JSON.stringify(room);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
export const hex = (h) => h.toString(16).padStart(8, '0');

const num = (v) => JSON.stringify(v);
const pts = (list, per = 6) => {
  if (!list.length) return '[]';
  const items = list.map((p) => `[${p.map(num).join(', ')}]`);
  if (items.length <= per) return `[${items.join(', ')}]`;
  const lines = [];
  for (let i = 0; i < items.length; i += per) lines.push('      ' + items.slice(i, i + per).join(', ') + ',');
  return `[\n${lines.join('\n')}\n    ]`;
};

/** Rooms -> the source of packages/sim/src/rooms.gen.ts. */
export function emitModule(rooms) {
  const out = [
    '// Generated by game/packages/content from game/content/maps/world.ldtk (LDtk). Do not edit: change the',
    '// maps in LDtk (or with `npm run content -- grid ...`), then run `npm run content:build`. `npm run content:check`',
    '// fails while this file is stale.',
    "import type { RoomDef } from './room';",
    '',
    '/** Every room, by id (the LDtk level identifier with a lower-case first letter). */',
    'export const ROOM_DEFS = {',
  ];
  for (const r of rooms) {
    out.push(`  ${r.id}: {`);
    out.push(`    id: '${r.id}', w: ${num(r.w)}, h: ${num(r.h)},`);
    out.push(`    // ${hex(roomHash(r))}: ${r.terrain[0]?.length ?? 0} x ${r.terrain.length} cells, '${FLOOR}' floor, '${ROCK}' rock`);
    out.push('    terrain: [');
    for (const row of r.terrain) out.push(`      '${row}',`);
    out.push('    ],');
    out.push(`    rock: ${pts(r.rock, 3)},`);
    out.push(`    starts: ${pts(r.starts)},`);
    out.push(`    dummies: ${pts(r.dummies)},`);
    out.push(`    portals: ${pts(r.portals)},`);
    out.push(`    altars: ${pts(r.altars)},`);
    out.push(r.props.length ? `    props: [\n${r.props.map((p) => `      { asset: '${p.asset}', x: ${num(p.x)}, y: ${num(p.y)}, blocks: ${p.blocks} },`).join('\n')}\n    ],` : '    props: [],');
    out.push(`    propRock: ${pts(r.propRock, 3)},`);
    out.push('  },');
  }
  out.push('} as const satisfies Readonly<Record<string, RoomDef>>;', '');
  return out.join('\n');
}
