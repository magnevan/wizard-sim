/**
 * True isometric, without touching the sim or the drawing code. An isometric view is today's
 * straight-on view of a world turned 45 degrees, with the ground squashed 2:1 instead of 0.6. So the
 * view is handed a turned copy of the world: every position and direction rotated, everything else
 * read through from the real one. Circles stay circles and lines stay lines, so spell effects,
 * rigs and walls need no changes of their own.
 *
 * View axes: u = (x - y) / sqrt 2 runs right on the screen, v = (x + y) / sqrt 2 runs down it. World +x
 * goes to the lower right and +y to the lower left, as isometric games do.
 *
 * Read-only and client-only: the real world is never written to. Called once per view entry point.
 */
import { CELL, createTerrain, type RoomDef, type SimEvent, type World } from '@wizard-sim/sim';

const S = Math.SQRT1_2;
/** How much a facing (in turns) changes: world +x points 45 degrees below screen-right. */
const FACE_TURN = 1 / 8;

export const toU = (x: number, y: number): number => (x - y) * S;
export const toV = (x: number, y: number): number => (x + y) * S;
export const toX = (u: number, v: number): number => (u + v) * S;
export const toY = (u: number, v: number): number => (v - u) * S;

type Pair = readonly [string, string];
/** Every world-space pair in the state the view reads. Rotation is linear, so points and directions are alike. */
const FIELDS: Readonly<Record<string, readonly Pair[]>> = {
  bodies: [['x', 'y'], ['vx', 'vy'], ['kx', 'ky'], ['lockX', 'lockY'], ['slamX', 'slamY'], ['lastDX', 'lastDY']],
  seats: [['aimX', 'aimY'], ['holdX', 'holdY'], ['chanEndX', 'chanEndY'], ['dblOX', 'dblOY'], ['dblEndX', 'dblEndY']],
  missiles: [['x', 'y'], ['vx', 'vy']],
  zones: [['x', 'y']],
  walls: [['x1', 'y1'], ['x2', 'y2']],
  waves: [['x', 'y'], ['dx', 'dy']],
  devices: [['x', 'y'], ['x2', 'y2']],
  enc: [['px', 'py']],
  run: [['ax', 'ay'], ['echoEndX', 'echoEndY']],
};
/** The facings, in turns. */
const FACES: Readonly<Record<string, readonly string[]>> = { bodies: ['face'], run: ['echoFace'] };

type Arr = Float64Array & { [k: number]: number };
type Group = Record<string, unknown>;

interface Turned {
  view: World;
  /** group -> field -> [the real array, the rotated one] */
  pairs: { src: [Arr, Arr]; dst: [Arr, Arr] }[];
  faces: { src: Arr; dst: Arr }[];
  /** The view's floor grid, resampled from the real one. */
  surf: { kind: Uint8Array; life: Int32Array };
  /** For each view floor cell, the real cell under it, or -1 off the map. Worked out once. */
  under: Int32Array;
  events: WeakMap<SimEvent, SimEvent>;
  real: World;
}

const made = new WeakMap<World, Turned>();
const defs = new WeakMap<RoomDef, RoomDef>();

/** The size of a square that holds the room once it's turned: whole units, so canvases keep whole-pixel origins. */
export const turnedSize = (w: number, h: number): number => Math.ceil((w + h) * S);

const spin = <T extends readonly number[]>(p: T): T => {
  const out = [...p];
  for (let i = 0; i + 1 < out.length; i += 2) { const x = out[i], y = out[i + 1]; out[i] = toU(x, y); out[i + 1] = toV(x, y); }
  return out as unknown as T;
};

function turnDef(def: RoomDef): RoomDef {
  let t = defs.get(def);
  if (!t) {
    t = {
      ...def,
      rock: def.rock.map(spin), propRock: def.propRock.map(spin),
      starts: def.starts.map(spin), dummies: def.dummies.map(spin), portals: def.portals.map(spin), altars: def.altars.map(spin),
      props: def.props.map((p) => ({ ...p, x: toU(p.x, p.y), y: toV(p.x, p.y) })),
    } as RoomDef;
    defs.set(def, t);
  }
  return t;
}

function build(w: World): Turned {
  const view = Object.create(w) as World;
  const pairs: Turned['pairs'] = [], faces: Turned['faces'] = [];
  for (const group of new Set([...Object.keys(FIELDS), ...Object.keys(FACES)])) {
    const src = (w as unknown as Record<string, Group | null>)[group];
    if (!src) continue;
    const copy = Object.create(src) as Group;
    for (const [a, b] of FIELDS[group] ?? []) {
      const sa = src[a] as Arr, sb = src[b] as Arr, da = new Float64Array(sa.length) as Arr, db = new Float64Array(sb.length) as Arr;
      copy[a] = da; copy[b] = db;
      pairs.push({ src: [sa, sb], dst: [da, db] });
    }
    for (const f of FACES[group] ?? []) {
      const s = src[f] as Arr, d = new Float64Array(s.length) as Arr;
      copy[f] = d;
      faces.push({ src: s, dst: d });
    }
    (view as unknown as Record<string, unknown>)[group] = copy;
  }
  const size = turnedSize(w.dims.w, w.dims.h), gw = Math.round(size / CELL);
  const surf = { kind: new Uint8Array(gw * gw), life: new Int32Array(gw * gw) };
  const under = new Int32Array(gw * gw), d = w.dims;
  for (let cv = 0, c = 0; cv < gw; cv++) {
    const v = -size / 2 + (cv + 0.5) * CELL;
    for (let cu = 0; cu < gw; cu++, c++) {
      const u = -size / 2 + (cu + 0.5) * CELL;
      const rx = Math.floor((toX(u, v) + d.w / 2) / CELL), ry = Math.floor((toY(u, v) + d.h / 2) / CELL);
      under[c] = rx < 0 || ry < 0 || rx >= d.gw || ry >= d.gh ? -1 : ry * d.gw + rx;
    }
  }
  const t: Turned = { view, pairs, faces, surf, under, events: new WeakMap(), real: w };
  const assign = view as unknown as Record<string, unknown>;
  assign.surf = surf;
  assign.dims = { w: size, h: size, gw, gh: gw };
  assign.def = turnDef(w.def);
  assign.terrain = createTerrain(assign.def as RoomDef);
  Object.defineProperty(view, 'events', { get: () => w.events.map((e) => turnEvent(t, e)) });
  return t;
}

function turnEvent(t: Turned, e: SimEvent): SimEvent {
  let o = t.events.get(e);
  if (!o) {
    o = { ...e, x: toU(e.x, e.y), y: toV(e.x, e.y) };
    if (e.x2 !== undefined && e.y2 !== undefined) { o.x2 = toU(e.x2, e.y2); o.y2 = toV(e.x2, e.y2); }
    t.events.set(e, o);
  }
  return o;
}

/** The world as the isometric view sees it, brought up to date. Same object every call for the same world. */
export function turnedWorld(w: World): World {
  let t = made.get(w);
  if (!t) { t = build(w); made.set(w, t); }
  if ((t.view as unknown as { def: RoomDef }).def.id !== w.def.id) { t = build(w); made.set(w, t); }
  for (const { src: [sa, sb], dst: [da, db] } of t.pairs) {
    for (let i = 0; i < sa.length; i++) { const x = sa[i], y = sb[i]; da[i] = (x - y) * S; db[i] = (x + y) * S; }
  }
  for (const { src, dst } of t.faces) for (let i = 0; i < src.length; i++) dst[i] = src[i] + FACE_TURN;
  // The floor is a grid, so it can't be rotated in place: each view cell looks up the real cell under it.
  const { under, surf } = t, rk = w.surf.kind, rl = w.surf.life;
  for (let c = 0; c < under.length; c++) {
    const r = under[c];
    if (r < 0) { surf.kind[c] = 0; surf.life[c] = 0; } else { surf.kind[c] = rk[r]; surf.life[c] = rl[r]; }
  }
  return t.view;
}
