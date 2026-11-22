// LDtk levels -> room definitions (plain data), and room definitions -> the generated module
// packages/sim/src/rooms.gen.ts. The build reads only the data layers: the Terrain IntGrid and
// the Entities layer. Auto-tiles LDtk may bake are ignored (the client draws with our art).
import { GRID_PX, PX_PER_UNIT, layerOf, fieldOf, loadProps, loadTags, roomId, toWorldX, toWorldY } from './ldtk.mjs';

/** Terrain: IntGrid value identifier -> the character in a room's terrain rows. 0 (unpainted) is floor. */
export const TERRAIN_CHARS = { floor: '.', rock: '#', void: '_' };
export const FLOOR = TERRAIN_CHARS.floor, ROCK = TERRAIN_CHARS.rock, VOID = TERRAIN_CHARS.void;
/** Rock and void both stop everything; void is outside the room's outline and is drawn as nothing. */
export const isBlocked = (ch) => ch === ROCK || ch === VOID;

/**
 * Ground: IntGrid value identifier -> the character in a room's ground rows. 0 (unpainted) is '.'.
 * What the ground looks like is the client's business, so none of this reaches the room or its hash.
 */
export const GROUND_CHARS = {
  grass: 'g', dirt: 'd', sand: 's', flagstone: 'f', cobble: 'c', mud: 'm',
  leaves: 'l', gravel: 'r', ash: 'a', planks: 'p', slabs: 'h', water: 'w',
};

/** The entities the game understands, and what each becomes in a room. */
export const ENTITY_KINDS = ['PlayerStart', 'Dummy', 'Portal', 'Altar', 'Rock', 'Prop', 'Marker', 'Region'];

/** A wall's half-thickness (the sim's STRUCT.wallThickness; check.mjs's SIM copy is tested against it). */
const WALL_HALF = 0.25;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Two side-by-side walls touch, leaving no way in, up to this deep. */
const TWO_WALLS_DEEP = 1;
/** Inside a closed outline no point may be further than half of this from a wall, so Blink finds nowhere to land. */
const FILL_STEP = 1.3;
/** Sides of a round footprint's outline. */
const ROUND_SIDES = 12;
/**
 * A blocking prop's footprint (w x h, world units, centred on x, y) -> wall segments. A wall is a
 * capsule 0.5 u thick, so a footprint up to 0.6 deep is one segment down its long side, and up to 1 deep
 * two side by side, which touch. A deeper one gets a closed outline (a rectangle, or if `round` a
 * 12-sided ring), so a body can't come in at any side, with rows across the inside so nothing can be
 * placed in the hollow.
 */
export function footprintWalls(x, y, [fw, fh], round = false) {
  const wide = fw >= fh, short = Math.min(fw, fh);
  const hLong = Math.max(0, Math.max(fw, fh) / 2 - WALL_HALF), hShort = short / 2 - WALL_HALF;
  const row = (o, half) => (wide ? [x - half, y + o, x + half, y + o] : [x + o, y - half, x + o, y + half]).map(r3);
  if (short <= 0.6) return [row(0, hLong)];
  if (short <= TWO_WALLS_DEEP) return [row(-hShort, hLong), row(hShort, hLong)];
  const hw = fw / 2 - WALL_HALF, hh = fh / 2 - WALL_HALF, corners = [];
  if (round) for (let i = 0; i < ROUND_SIDES; i++) { const a = ((i + 0.5) / ROUND_SIDES) * 2 * Math.PI; corners.push([x + hw * Math.cos(a), y + hh * Math.sin(a)]); }
  else corners.push([x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh]);
  const walls = corners.map((c, i) => [...c, ...corners[(i + 1) % corners.length]].map(r3));
  const rows = Math.ceil((2 * hShort) / FILL_STEP);
  for (let k = 1; k < rows; k++) {
    const o = -hShort + (k * 2 * hShort) / rows;
    walls.push(row(o, round ? hLong * Math.sqrt(1 - (o / hShort) ** 2) : hLong));
  }
  return walls;
}

/** Value -> char for a project's Terrain layer, from its definition (unknown identifiers -> null). */
export function terrainLegend(project) {
  const def = project.defs.layers.find((l) => l.identifier === 'Terrain' && l.type === 'IntGrid');
  const legend = new Map([[0, FLOOR]]);
  for (const v of def?.intGridValues ?? []) legend.set(v.value, TERRAIN_CHARS[v.identifier] ?? null);
  return legend;
}

/**
 * Grid-aligned rock and void (cells marked '#' or '_') -> wall segments along every blocked / floor boundary, merged
 * into the longest straight runs. Edges on the room's border are left out (the room's edge already
 * stops everything). Order: horizontal runs top to bottom, then vertical runs left to right.
 */
export function traceRock(rows, w, h) {
  const gh = rows.length, gw = rows[0]?.length ?? 0;
  const rock = (x, y) => isBlocked(rows[y][x]);
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

/** The characters for tiers 0 to 61 in a room's height rows, in order. */
export const TIER_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/**
 * Height: IntGrid identifier -> the character in a room's height rows. 0 (unpainted) is tier 0, t1..t61
 * are tiers 1-61 ('1'..'9', 'a'..'z', 'A'..'Z'), and a stair (or ramp) cell is '/': it joins the tiers it touches.
 */
export const HEIGHT_CHARS = { ...Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`t${i + 1}`, TIER_CHARS[i + 1]])), stair: '/' };
export const STAIR = HEIGHT_CHARS.stair;
/** A tier's number from its character. */
export const tierOf = (ch) => TIER_CHARS.indexOf(ch);
/** The most two cells' heights may differ, in metres, and still be walked between: a step, not a cliff. */
export const STEP_M = 0.5;

/** A level's Height layer as rows (TIER_CHARS tier, '/' stair), or null if it paints nothing. Throws on a value the game doesn't know. */
export function heightRows(project, level) {
  const layer = layerOf(level, 'Height');
  if (!layer || !layer.intGridCsv.some((v) => v !== 0)) return null;
  const def = project.defs.layers.find((l) => l.identifier === 'Height');
  const legend = new Map([[0, '0'], ...def.intGridValues.map((v) => [v.value, HEIGHT_CHARS[v.identifier]])]);
  const rows = [];
  for (let y = 0; y < layer.__cHei; y++) {
    let row = '';
    for (let x = 0; x < layer.__cWid; x++) {
      const ch = legend.get(layer.intGridCsv[y * layer.__cWid + x] ?? 0);
      if (!ch) throw new Error(`${level.identifier}: Height cell ${x},${y} is a value the game doesn't know`);
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

/** A level field's value by identifier (undefined if the level has no such field). */
const levelField = (level, identifier) => (level.fieldInstances ?? []).find((f) => f.__identifier === identifier)?.__value;

/**
 * Tier edges -> cliff segments. An edge between two cells whose heights differ by more than a step (STEP_M) is a cliff,
 * unless either cell is blocked (rock or void: their own outline is already a wall) or a stair (a stair
 * joins whatever it touches). Cliffs merge into the longest straight runs with the same two tiers, the
 * same order as traceRock. Returns { segs, tiers }: tiers[i] is [upper, lower] for segs[i].
 */
export function traceCliffs(terrain, height, metres, w, h) {
  const gh = height.length, gw = height[0]?.length ?? 0;
  const X = (cx) => (cx * GRID_PX - (w * PX_PER_UNIT) / 2) / PX_PER_UNIT;
  const Y = (cy) => (cy * GRID_PX - (h * PX_PER_UNIT) / 2) / PX_PER_UNIT;
  /** The edge between cells a and b: [upper, lower], or null if it isn't a cliff. */
  const cliff = (ax, ay, bx, by) => {
    const a = height[ay][ax], b = height[by][bx];
    if (a === STAIR || b === STAIR || isBlocked(terrain[ay]?.[ax]) || isBlocked(terrain[by]?.[bx])) return null;
    const ta = tierOf(a), tb = tierOf(b);
    if (Math.abs(metres[ta] - metres[tb]) <= STEP_M) return null;
    return metres[ta] > metres[tb] ? [ta, tb] : [tb, ta];
  };
  const segs = [], tiers = [];
  const run = (n, at, seg) => {
    let start = -1, key = null;
    for (let i = 0; i <= n; i++) {
      const c = i < n ? at(i) : null, k = c && c.join();
      if (start >= 0 && k !== key) { segs.push(seg(start, i)); tiers.push(key.split(',').map(Number)); start = -1; }
      if (c && start < 0) { start = i; key = k; }
    }
  };
  for (let y = 1; y < gh; y++) run(gw, (x) => cliff(x, y - 1, x, y), (a, b) => [X(a), Y(y), X(b), Y(y)]);
  for (let x = 1; x < gw; x++) run(gh, (y) => cliff(x - 1, y, x, y), (a, b) => [X(x), Y(a), X(x), Y(b)]);
  return { segs, tiers };
}

/**
 * A level's tiers -> the room's `height`, or null for a flat level. Errors: no metres for a painted tier,
 * a stair that doesn't join two heights. The cliffs come back separately: they go on the end of `rock`.
 */
export function compileHeight(project, level, terrain, w, h, errors) {
  let rows;
  try { rows = heightRows(project, level); } catch (e) { errors.push(e.message); return null; }
  if (!rows) return null;
  const L = level.identifier, raw = levelField(level, 'tierMetres');
  const metres = Array.isArray(raw) ? raw : [];
  const used = new Set();
  for (const r of rows) for (const ch of r) if (ch !== STAIR) used.add(tierOf(ch));
  for (const t of [...used].sort()) if (typeof metres[t] !== 'number') errors.push(`${L}: tier ${t} is painted but the level's tierMetres has no height for it (has ${JSON.stringify(metres)}; tier 0 is the first entry)`);
  if (errors.length) return null;
  // Each connected run of stair cells must touch at least two different heights, or it joins nothing.
  const gh = rows.length, gw = rows[0].length, seen = new Uint8Array(gw * gh);
  for (let y0 = 0; y0 < gh; y0++) for (let x0 = 0; x0 < gw; x0++) {
    if (rows[y0][x0] !== STAIR || seen[y0 * gw + x0]) continue;
    const touch = new Set(), stack = [[x0, y0]];
    seen[y0 * gw + x0] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || isBlocked(terrain[ny]?.[nx])) continue;
        const ch = rows[ny][nx];
        if (ch !== STAIR) { touch.add(metres[tierOf(ch)]); continue; }
        if (!seen[ny * gw + nx]) { seen[ny * gw + nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (touch.size < 2) errors.push(`${L}: the stair at cell ${x0},${y0} touches ${touch.size ? 'only one height' : 'no tier'}; a stair joins two`);
  }
  const { segs, tiers } = traceCliffs(terrain, rows, metres, w, h);
  return { height: { metres: metres.slice(0, Math.max(...used) + 1), rows, cliffs: tiers }, cliffRock: segs };
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
export function compileLevel(project, level, assets = loadProps(), tags = loadTags()) {
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
  const starts = [], dummies = [], portals = [], altars = [], rock = [], props = [], propRock = [], markers = [], regions = [];
  const ids = new Set();
  const named = (where, id) => {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) { errors.push(`${where}: id must be set, lower-case letters, digits and dashes (is ${JSON.stringify(id)})`); return false; }
    if (ids.has(id)) { errors.push(`${where}: another marker or region is also called "${id}"`); return false; }
    ids.add(id);
    return true;
  };
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
        const tag = fieldOf(e, 'tag');
        if (tag && !(tag in tags.props)) errors.push(`${where}: no prop tag "${tag}" in game/content/tags.json (known: ${Object.keys(tags.props).join(', ')})`);
        props.push(tag ? { asset, x, y, blocks, tag } : { asset, x, y, blocks });
        if (blocks) propRock.push(...footprintWalls(x, y, meta.footprint, meta.round === true));
        break;
      }
      case 'Marker': {
        const id = fieldOf(e, 'id'), tag = fieldOf(e, 'tag');
        if (tag && !(tag in tags.markers)) errors.push(`${where}: no marker tag "${tag}" in game/content/tags.json (known: ${Object.keys(tags.markers).join(', ')})`);
        if (named(where, id)) markers.push(tag ? { id, x, y, tag } : { id, x, y });
        break;
      }
      case 'Region': {
        const id = fieldOf(e, 'id');
        if (named(where, id)) regions.push({ id, x, y, w: e.width / PX_PER_UNIT, h: e.height / PX_PER_UNIT });
        break;
      }
      default: errors.push(`${where}: the game doesn't know this entity (known: ${ENTITY_KINDS.join(', ')})`);
    }
  }
  for (let s = 0; s < 4; s++) if (!starts[s]) errors.push(`${level.identifier}: no PlayerStart for seat ${s}`);
  if (rows) rock.push(...traceRock(rows, w, h));
  // Tiers: the cliffs go on the end of rock, so bodies, nav and shots stop at them like any rock wall.
  // A flat level has no `height` key at all, so its room (and its hash) is what it was before tiers existed.
  const tiered = rows ? compileHeight(project, level, rows, w, h, errors) : null;
  if (tiered) rock.push(...tiered.cliffRock);
  const room = { id, w, h, terrain: rows ?? [], rock, starts: [...starts], dummies, portals, altars, props, propRock, markers, regions };
  if (tiered) room.height = tiered.height;
  return { room, errors };
}

/** A level's Ground layer as rows of characters, or null if it has no painted cell. Throws on a value the game doesn't know. */
export function groundRows(project, level) {
  const layer = layerOf(level, 'Ground');
  if (!layer || !layer.intGridCsv.some((v) => v !== 0)) return null;
  const def = project.defs.layers.find((l) => l.identifier === 'Ground');
  const legend = new Map([[0, '.'], ...def.intGridValues.map((v) => [v.value, GROUND_CHARS[v.identifier]])]);
  const rows = [];
  for (let y = 0; y < layer.__cHei; y++) {
    let row = '';
    for (let x = 0; x < layer.__cWid; x++) {
      const ch = legend.get(layer.intGridCsv[y * layer.__cWid + x] ?? 0);
      if (!ch) throw new Error(`${level.identifier}: Ground cell ${x},${y} is a value the game doesn't know`);
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

/** The client's module: every painted room's ground rows. */
export function emitGrounds(loaded) {
  const out = ['// Generated by `npm run content:build` from the LDtk Ground layers. Don\'t edit.', 'export const GROUNDS: Readonly<Record<string, readonly string[]>> = {'];
  for (const { level } of loaded.levels) {
    const rows = groundRows(loaded.project, level);
    if (!rows) continue;
    out.push(`  ${roomId(level.identifier)}: [`, ...rows.map((r) => `    '${r}',`), '  ],');
  }
  out.push('};', '');
  return out.join('\n');
}

/** Every level -> rooms. Returns { rooms, errors }. */
export function compileProject(loaded) {
  const rooms = [], errors = [], assets = loadProps(), tags = loadTags();
  for (const { level } of loaded.levels) {
    const r = compileLevel(loaded.project, level, assets, tags);
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
    out.push(r.props.length ? `    props: [\n${r.props.map((p) => `      { asset: '${p.asset}', x: ${num(p.x)}, y: ${num(p.y)}, blocks: ${p.blocks}${p.tag ? `, tag: '${p.tag}'` : ''} },`).join('\n')}\n    ],` : '    props: [],');
    out.push(`    propRock: ${pts(r.propRock, 3)},`);
    out.push(r.markers.length ? `    markers: [\n${r.markers.map((m) => `      { id: '${m.id}', x: ${num(m.x)}, y: ${num(m.y)}${m.tag ? `, tag: '${m.tag}'` : ''} },`).join('\n')}\n    ],` : '    markers: [],');
    out.push(r.regions.length ? `    regions: [\n${r.regions.map((g) => `      { id: '${g.id}', x: ${num(g.x)}, y: ${num(g.y)}, w: ${num(g.w)}, h: ${num(g.h)} },`).join('\n')}\n    ],` : '    regions: [],');
    if (r.height) {
      out.push('    height: {', `      metres: [${r.height.metres.map(num).join(', ')}],`, `      // tiers '0'-'9', 'a'-'z', 'A'-'Z'; '${STAIR}' stair. The last ${r.height.cliffs.length} rock walls are the cliffs, each [upper, lower] in cliffs`, '      rows: [');
      for (const row of r.height.rows) out.push(`        '${row}',`);
      out.push('      ],', `      cliffs: ${pts(r.height.cliffs, 12)},`, '    },');
    }
    out.push('  },');
  }
  out.push('} as const satisfies Readonly<Record<string, RoomDef>>;', '');
  return out.join('\n');
}
