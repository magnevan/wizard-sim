/**
 * World state. Everything that affects gameplay lives here, in fixed-capacity typed arrays
 * (struct of arrays), so snapshot / restore is a few buffer copies and the state hash is one
 * pass over the bytes. No objects, Maps or closures hold gameplay state.
 *
 * Entities are slots in a pool: `alive[i]` (or `kind[i]`) marks a used slot, and iteration
 * always runs in slot order, so every peer visits entities in the same order.
 */
import { ARENA, BODY, CELL, RUNES } from './config';
import { N_EL, elementName } from './elements';
import { createRng, type RngState } from './rng';

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const MAX_SEATS = 4;
export const MAX_BODIES = 96;
export const MAX_MISSILES = 256;
export const MAX_ZONES = 64;
export const MAX_WALLS = 128; // four players at structures.wallsPerOwner (30) each
export const MAX_WAVES = 8;
export const MAX_DEVICES = 48;
export const QUEUE_MAX = 5;
export const GRID_W = Math.round(ARENA.w / CELL);
export const GRID_H = Math.round(ARENA.h / CELL);

export { ARENA };

export const KIND = { none: 0, wizard: 1, dummy: 2, enemy: 3, double: 4 } as const;
export const TEAM = { players: 1, enemies: 2 } as const;

/** Wizards, dummies and enemies: everything that can be hit. Seats 0-3 own bodies 0-3. */
export interface Bodies {
  kind: Uint8Array;
  team: Uint8Array;
  x: Float64Array; y: Float64Array;
  vx: Float64Array; vy: Float64Array;
  /** Knockback velocity, decays on its own. */
  kx: Float64Array; ky: Float64Array;
  r: Float64Array;
  hp: Float64Array; maxHp: Float64Array;
  /** Facing in turns. */
  face: Float64Array;
  // Statuses, in ticks left (chill is stacks).
  wet: Int32Array; burn: Int32Array; frozen: Int32Array; stun: Int32Array; expose: Int32Array; down: Int32Array;
  chill: Float64Array;
  /** Tick of the last hit taken (dummies reset after a quiet spell). */
  lastHit: Int32Array;
  // ---- enemies ----
  /** ARCH id (archetypes.ts). */
  arch: Uint8Array;
  /** AI state (AI), ticks in it, the body it is after, and where its attack is locked. */
  ai: Uint8Array; aiT: Int32Array; target: Int16Array; lockX: Float64Array; lockY: Float64Array;
  /** Grabber: who it holds, and its hp when it grabbed (enough damage breaks the hold). Victims: who holds them. */
  holding: Int16Array; grabHp: Float64Array; heldBy: Int16Array;
  /** Wave scaling. */
  dmgMult: Float64Array; speedMult: Float64Array;
  /** A wizard who went down in a wave: out until the wave ends. */
  downed: Uint8Array;
  /** Who set this body burning (-1: the world), so burn damage is credited. */
  burnSrc: Int16Array;
  /** The last damaging hit: its element (the form of the payload) and direction. Death effects read these. */
  lastEl: Uint8Array; lastDX: Float64Array; lastDY: Float64Array;
  /** The last damaging hit's mix: 1 scald (steam), 2 freeze, 0 none. */
  lastMix: Uint8Array;
  /** How the last damaging hit was delivered (HIT_KIND in hit.ts): a boulder and an earthquake kill differently. */
  lastKind: Uint8Array;
}

export const AI = { approach: 0, windup: 1, cooldown: 2, dash: 3, grab: 4 } as const;
/** Statuses at death, as bits. */
export const STATUS_BIT = { frozen: 1, wet: 2, burning: 4, stunned: 8, chilled: 16 } as const;

export const PHASE = { idle: 0, windup: 1, charge: 2, channel: 3, recover: 4 } as const;
export const CAST_ID = { force: 1, area: 2, place: 3, self: 4, conjure: 5 } as const;

/** Per player: runes, queue and the cast state machine. */
export interface Seats {
  active: Uint8Array;
  /** Rune pools: MAX_SEATS x 9 (floats; whole runes are what you can queue). */
  runes: Float64Array;
  /** Runes reserved by the queue: paid on cast, refunded on clear or cancel. */
  queue: Uint8Array; queueLen: Uint8Array;
  prevButtons: Uint16Array;
  /** Last aim point, relative to the body. */
  aimX: Float64Array; aimY: Float64Array;
  phase: Uint8Array; timer: Int32Array;
  /** The spell being cast: its cast id and queue, copied when the cast starts. */
  castId: Uint8Array; castQueue: Uint8Array; castLen: Uint8Array;
  /** Area button: ticks held, and where the press started (world). */
  areaHeld: Int32Array; holdX: Float64Array; holdY: Float64Array; dragged: Uint8Array;
  /** Channel ticks so far (natural duration, then upkeep); charge ticks for Earth Force. */
  chanTicks: Int32Array; chanTimer: Int32Array;
  /** Where the beam (or spray tip) reached this tick, for the view. */
  chanEndX: Float64Array; chanEndY: Float64Array;
  attune: Int32Array;
  /** A cast pressed while busy, waiting to start (CAST_ID), and ticks it keeps waiting. */
  bufCast: Uint8Array; bufTicks: Int32Array;
  // ---- Shield and Sigil on yourself ----
  /** Ward: WARD kind, what it resists (9 counts per seat), how much it can still absorb. */
  ward: Uint8Array; wardEls: Uint8Array; wardHp: Float64Array;
  /** Who keeps this seat's ward up (it drains their Shield pool; a ward cast on an ally is still yours), -1 none. */
  wardBy: Int16Array;
  /** Sigil aura: what it carries (9 per seat) and ticks left. */
  auraEls: Uint8Array; aura: Int32Array;
  /** The sculpting wand: your harm spares allies and your heals spare enemies. */
  wand: Uint8Array;
  /** A conjured weapon: its leading element (0 none), payload (9 per seat) and swings left. */
  weapon: Uint8Array; weaponEls: Uint8Array; weaponUses: Int32Array;
  /** Rune motes circling you. */
  motes: Uint8Array;
  /** A conjured shield: GUARD kind, what it can still take, and ticks the Weapon button has been held (0 = not blocking). */
  guard: Uint8Array; guardHp: Float64Array; guardT: Int32Array;
  /** Your Double's body, or -1; where it keeps itself relative to you; whether it paid for the current channel; where its beam reached. */
  double: Int16Array; dblOX: Float64Array; dblOY: Float64Array; dblPaid: Uint8Array; dblEndX: Float64Array; dblEndY: Float64Array;
  /** When the Double, and the wand or conjured weapon, were made (for recalling the oldest). */
  dblBorn: Int32Array; wandBorn: Int32Array;
}

export const GUARD = { none: 0, bulwark: 1, buckler: 2 } as const;

export const WARD = { none: 0, ward: 1, mirror: 2, stone: 3 } as const;

export interface Missiles {
  alive: Uint8Array;
  x: Float64Array; y: Float64Array; vx: Float64Array; vy: Float64Array;
  life: Int32Array;
  owner: Int16Array;
  /** Element counts, 9 per missile. */
  els: Uint8Array;
  scale: Float64Array;
  r: Float64Array;
  /** 0 bolt, 1 rock (charged), 2 shard, 3 heal-stone (bursts where it lands). */
  type: Uint8Array;
  pierce: Uint8Array;
  look: Uint8Array;
  /** Last body hit, so a piercing rock hits each body once. */
  lastHit: Int16Array;
  /** Payload flags (PF) and shape modifier (MOD_ID). */
  flags: Uint8Array; mod: Uint8Array;
  /** Heal-stone: where it lands. */
  tx: Float64Array; ty: Float64Array;
}

/** Things that sit in the world for a while: delayed blasts, geysers, healing springs, steam clouds. */
export interface Zones {
  type: Uint8Array; // ZONE
  x: Float64Array; y: Float64Array; r: Float64Array;
  life: Int32Array; timer: Int32Array;
  owner: Int16Array;
  els: Uint8Array;
  scale: Float64Array;
  flags: Uint8Array; mod: Uint8Array; look: Uint8Array;
}
/** Payload flags. */
export const PF = { heal: 1, scald: 2, freeze: 4, lensed: 8 } as const;
/** Lens amplification (kept here so effects and structures share it). */
export const STRUCT_SCALE = { lens: 1.5 } as const;
export const MOD_ID = { none: 0, push: 1, shatter: 2, chain: 3, burst: 4 } as const;
export const ZONE = { none: 0, blast: 1, geyser: 2, spring: 3, steam: 4 } as const;

/** The floor: one byte of surface per cell, plus ticks left. */
export const SURF = { none: 0, water: 1, ice: 2, fire: 3 } as const;
export interface Surfaces {
  kind: Uint8Array;
  life: Int32Array;
}

/** What happened this tick, for the view (VFX, sound). Not state: cleared every step. */
export interface SimEvent {
  tick: number;
  kind: 'queue' | 'cancel' | 'dry' | 'cast' | 'hit' | 'heal' | 'fizzle' | 'burst' | 'zap' | 'surge' | 'blink' | 'shatter' | 'freeze' | 'todo';
  who: number;
  /** hit / heal: the body that dealt it (-1 for the world: burning, surfaces). */
  src?: number;
  /** Deaths: the killing element, and the body's statuses then (STATUS_BIT). Direction of the blow in x2/y2. */
  el?: number;
  status?: number;
  /** Deaths: the killing hit's mix (1 scald, 2 freeze, 0 none). */
  mix?: number;
  /** Deaths: how the killing hit was delivered (HIT_KIND: missile, burst, channel, arc, melee, wave). */
  shape?: number;
  x: number; y: number;
  x2?: number; y2?: number;
  text?: string;
  look?: number;
  amount?: number;
}

/** Shield structures: rock walls (stuff), barriers and curtains (energy). Segments x1,y1 -> x2,y2. */
export interface Walls {
  type: Uint8Array; // WALL (compile.ts): 0 none, 1 rock, 2 barrier, 3 curtain
  x1: Float64Array; y1: Float64Array; x2: Float64Array; y2: Float64Array;
  hp: Float64Array; maxHp: Float64Array;
  owner: Int16Array;
  els: Uint8Array;
  /** Tick it was raised (the oldest breaks first). */
  born: Int32Array;
  /** Curtain: tick of the last pulse. */
  pulse: Int32Array;
}

/** Shield + Force: a front that sweeps forward and hits each body once. */
export interface Waves {
  alive: Uint8Array;
  x: Float64Array; y: Float64Array; dx: Float64Array; dy: Float64Array;
  half: Float64Array; travelled: Float64Array;
  owner: Int16Array; els: Uint8Array;
  /** One flag per body: already hit. MAX_WAVES x MAX_BODIES. */
  hit: Uint8Array;
}

/** Sigil devices. Each binds one of its owner's Sigil runes while it stands. */
export interface Devices {
  type: Uint8Array; // DEVICE
  x: Float64Array; y: Float64Array; x2: Float64Array; y2: Float64Array;
  owner: Int16Array;
  /** The device's payload: the spell minus its Sigil (9 per device). */
  els: Uint8Array;
  timer: Int32Array; life: Int32Array;
  /** Orbitals: charges left and orbit phase (turns). */
  charges: Uint8Array; phase: Float64Array;
  heal: Uint8Array;
  look: Uint8Array;
  /** Tick it was made (the oldest is recalled first). */
  born: Int32Array;
  /** Turrets: ticks left of the spray, beam or arc they're channelling (0 = none). Its far end is x2, y2. */
  chan: Int32Array;
}
export const DEVICE = { none: 0, turret: 1, glyph: 2, lineglyph: 3, orbital: 4, lens: 5 } as const;

/** The arena's wave director. */
export const PHASE_ENC = { off: 0, lull: 1, wave: 2, breather: 3 } as const;
export const MAX_PORTALS = 4;
export interface Encounter {
  /** [0] phase (PHASE_ENC), [1] wave number, [2] ticks left in the lull or breather (or ticks into the wave), [3] waves cleared. */
  state: Int32Array;
  px: Float64Array; py: Float64Array;
  arch: Uint8Array;
  /** Enemies still to come out, and ticks to the next. */
  left: Int32Array; next: Int32Array; total: Int32Array;
}

/** Enemy steering: a blocked-cell grid (rock walls) and one distance field per wizard. */
export interface Nav {
  blocked: Uint8Array;
  field: Int32Array; // MAX_SEATS x cells
  /** [0] ticks until the next rebuild. */
  timer: Int32Array;
}

export interface World {
  /** [0] = tick, [1] = seed. */
  clock: Uint32Array;
  rng: RngState;
  bodies: Bodies;
  seats: Seats;
  missiles: Missiles;
  zones: Zones;
  surf: Surfaces;
  walls: Walls;
  waves: Waves;
  devices: Devices;
  enc: Encounter;
  nav: Nav;
  events: SimEvent[];
}

const f64 = (n: number) => new Float64Array(n), i32 = (n: number) => new Int32Array(n), u8 = (n: number) => new Uint8Array(n);

function bodies(n: number): Bodies {
  return {
    kind: u8(n), team: u8(n), x: f64(n), y: f64(n), vx: f64(n), vy: f64(n), kx: f64(n), ky: f64(n), r: f64(n),
    hp: f64(n), maxHp: f64(n), face: f64(n),
    wet: i32(n), burn: i32(n), frozen: i32(n), stun: i32(n), expose: i32(n), down: i32(n), chill: f64(n), lastHit: i32(n),
    arch: u8(n), ai: u8(n), aiT: i32(n), target: new Int16Array(n), lockX: f64(n), lockY: f64(n),
    holding: new Int16Array(n).fill(-1), grabHp: f64(n), heldBy: new Int16Array(n).fill(-1),
    dmgMult: f64(n).fill(1), speedMult: f64(n).fill(1), downed: u8(n), burnSrc: new Int16Array(n).fill(-1), lastEl: u8(n), lastDX: f64(n), lastDY: f64(n), lastMix: u8(n), lastKind: u8(n),
  };
}
function seats(n: number): Seats {
  return {
    active: u8(n), runes: f64(n * N_EL), queue: u8(n * QUEUE_MAX), queueLen: u8(n), prevButtons: new Uint16Array(n),
    aimX: f64(n), aimY: f64(n), phase: u8(n), timer: i32(n), castId: u8(n), castQueue: u8(n * QUEUE_MAX), castLen: u8(n),
    areaHeld: i32(n), holdX: f64(n), holdY: f64(n), dragged: u8(n), chanTicks: i32(n), chanTimer: i32(n), chanEndX: f64(n), chanEndY: f64(n), attune: i32(n), bufCast: u8(n), bufTicks: i32(n),
    ward: u8(n), wardEls: u8(n * N_EL), wardHp: f64(n), wardBy: new Int16Array(n).fill(-1), auraEls: u8(n * N_EL), aura: i32(n), wand: u8(n),
    weapon: u8(n), weaponEls: u8(n * N_EL), weaponUses: i32(n), motes: u8(n),
    guard: u8(n), guardHp: f64(n), guardT: i32(n), double: new Int16Array(n).fill(-1), dblOX: f64(n), dblOY: f64(n), dblPaid: u8(n), dblEndX: f64(n), dblEndY: f64(n), dblBorn: i32(n), wandBorn: i32(n),
  };
}
function missiles(n: number): Missiles {
  return {
    alive: u8(n), x: f64(n), y: f64(n), vx: f64(n), vy: f64(n), life: i32(n), owner: new Int16Array(n), els: u8(n * N_EL),
    scale: f64(n), r: f64(n), type: u8(n), pierce: u8(n), look: u8(n), lastHit: new Int16Array(n), tx: f64(n), ty: f64(n),
    flags: u8(n), mod: u8(n),
  };
}
function zones(n: number): Zones {
  return {
    type: u8(n), x: f64(n), y: f64(n), r: f64(n), life: i32(n), timer: i32(n), owner: new Int16Array(n), els: u8(n * N_EL), scale: f64(n),
    flags: u8(n), mod: u8(n), look: u8(n),
  };
}

const START = [[-4, 2], [4, 2], [-4, -2], [4, -2]] as const;
/** The Sanctum's practice dummies. */
const DUMMIES = [[-6, -4], [0, -5], [6, -4]] as const;

export function createWorld(seed: number, players: number, opts: { dummies?: boolean; room?: 'sanctum' | 'arena' } = {}): World {
  const w: World = {
    clock: new Uint32Array([0, seed >>> 0]), rng: createRng(seed),
    bodies: bodies(MAX_BODIES), seats: seats(MAX_SEATS), missiles: missiles(MAX_MISSILES), zones: zones(MAX_ZONES),
    surf: { kind: u8(GRID_W * GRID_H), life: i32(GRID_W * GRID_H) },
    walls: {
      type: u8(MAX_WALLS), x1: f64(MAX_WALLS), y1: f64(MAX_WALLS), x2: f64(MAX_WALLS), y2: f64(MAX_WALLS), hp: f64(MAX_WALLS), maxHp: f64(MAX_WALLS),
      owner: new Int16Array(MAX_WALLS), els: u8(MAX_WALLS * N_EL), born: i32(MAX_WALLS), pulse: i32(MAX_WALLS),
    },
    waves: {
      alive: u8(MAX_WAVES), x: f64(MAX_WAVES), y: f64(MAX_WAVES), dx: f64(MAX_WAVES), dy: f64(MAX_WAVES), half: f64(MAX_WAVES), travelled: f64(MAX_WAVES),
      owner: new Int16Array(MAX_WAVES), els: u8(MAX_WAVES * N_EL), hit: u8(MAX_WAVES * MAX_BODIES),
    },
    enc: {
      state: i32(4), px: f64(MAX_PORTALS), py: f64(MAX_PORTALS), arch: u8(MAX_PORTALS),
      left: i32(MAX_PORTALS), next: i32(MAX_PORTALS), total: i32(MAX_PORTALS),
    },
    nav: { blocked: u8(GRID_W * GRID_H), field: i32(MAX_SEATS * GRID_W * GRID_H), timer: i32(1) },
    devices: {
      type: u8(MAX_DEVICES), x: f64(MAX_DEVICES), y: f64(MAX_DEVICES), x2: f64(MAX_DEVICES), y2: f64(MAX_DEVICES), owner: new Int16Array(MAX_DEVICES),
      els: u8(MAX_DEVICES * N_EL), timer: i32(MAX_DEVICES), life: i32(MAX_DEVICES), charges: u8(MAX_DEVICES), phase: f64(MAX_DEVICES),
      heal: u8(MAX_DEVICES), look: u8(MAX_DEVICES), born: i32(MAX_DEVICES), chan: i32(MAX_DEVICES),
    },
    events: [],
  };
  for (let i = 0; i < Math.min(players, MAX_SEATS); i++) joinSeat(w, i);
  const arena = opts.room === 'arena';
  if (arena) { w.enc.state[0] = PHASE_ENC.lull; w.enc.state[1] = 1; w.enc.state[2] = 0; }
  else if (opts.dummies !== false) for (const [x, y] of DUMMIES) spawnBody(w, -1, KIND.dummy, TEAM.enemies, x, y, BODY.dummyHp, BODY.dummyRadius);
  return w;
}

/** A player takes seat `i`: its wizard appears at the seat's start spot with full rune pools. */
export function joinSeat(w: World, i: number): void {
  if (w.seats.active[i]) return;
  w.seats.active[i] = 1;
  spawnBody(w, i, KIND.wizard, TEAM.players, START[i][0], START[i][1], BODY.wizardHp, BODY.wizardRadius);
  for (let e = 1; e <= N_EL; e++) w.seats.runes[i * N_EL + e - 1] = RUNES.max[elementName(e)];
}

/** Puts a body in `slot` (or the first free slot from MAX_SEATS on, if slot < 0). Returns the slot or -1. */
export function spawnBody(w: World, slot: number, kind: number, team: number, x: number, y: number, hp: number, r: number): number {
  const b = w.bodies;
  let i = slot;
  if (i < 0) { for (let j = MAX_SEATS; j < MAX_BODIES; j++) if (b.kind[j] === KIND.none) { i = j; break; } }
  if (i < 0) return -1;
  b.kind[i] = kind; b.team[i] = team; b.x[i] = x; b.y[i] = y; b.vx[i] = b.vy[i] = b.kx[i] = b.ky[i] = 0;
  b.r[i] = r; b.hp[i] = b.maxHp[i] = hp; b.face[i] = 0;
  b.wet[i] = b.burn[i] = b.frozen[i] = b.stun[i] = b.expose[i] = b.down[i] = 0; b.chill[i] = 0; b.lastHit[i] = 0;
  b.arch[i] = 0; b.ai[i] = 0; b.aiT[i] = 0; b.target[i] = -1; b.holding[i] = -1; b.heldBy[i] = -1; b.grabHp[i] = 0;
  b.dmgMult[i] = 1; b.speedMult[i] = 1; b.downed[i] = 0;
  return i;
}

export const tickOf = (w: World): number => w.clock[0];

/** Every typed array in the world, in a fixed order. Snapshot, restore and hash all walk this list. */
export function buffers(w: World): ArrayBufferView[] {
  const out: ArrayBufferView[] = [w.clock, w.rng];
  for (const pool of [w.bodies, w.seats, w.missiles, w.zones, w.surf, w.walls, w.waves, w.devices, w.enc, w.nav] as object[]) {
    // Sorted by field name, so the order never depends on how a pool object was built.
    for (const k of Object.keys(pool).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) out.push((pool as Record<string, ArrayBufferView>)[k]);
  }
  return out;
}
