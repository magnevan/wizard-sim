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
export const MAX_WALLS = 160; // four players at structures.wallsPerOwner (40) each
export const MAX_WAVES = 8;
export const MAX_DEVICES = 48;
export const QUEUE_MAX = 5;

export { ARENA };

/**
 * A world's play area: its size in world units (centred on the origin) and its surface / nav grid
 * in CELL-sized cells. Fixed by the room when the world is made, so it is not state: two worlds of
 * the same room always share it, and the grids' arrays (which are state) are sized from it. The
 * Sanctum and the Arena use ARENA, as before, so their layout and the golden hash are unchanged.
 */
export interface Dims { readonly w: number; readonly h: number; readonly gw: number; readonly gh: number }
const dimsOf = (w: number, h: number): Dims => ({ w, h, gw: Math.round(w / CELL), gh: Math.round(h / CELL) });
/**
 * Survive's arena: over four times the Arena's floor, too big to fit on screen at any scale the
 * camera picks for a 1280 x 800 window or larger (at 2x such a window shows 40 x 31 u of play area;
 * the camera follows).
 */
export const SURVIVE_ARENA = { w: 48, h: 34 } as const;
export const ROOM_DIMS: Readonly<Record<Room, Dims>> = {
  sanctum: dimsOf(ARENA.w, ARENA.h), arena: dimsOf(ARENA.w, ARENA.h), survive: dimsOf(SURVIVE_ARENA.w, SURVIVE_ARENA.h),
};
/** The most cells any room's grid has (nav's scratch heap is sized for it). */
export const MAX_CELLS = Math.max(...Object.values(ROOM_DIMS).map((d) => d.gw * d.gh));

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
  /** Pinned (the spear's javelin): ticks left it can't walk. It can still act. */
  root: Int32Array;
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
  /** Ticks RMB has been held for a Strike or Heavy with no runes queued (0: not held). */
  handT: Int32Array;
  /** A guard's elements other than Shield (9 per seat): the lead picks the guard, a second adds half its resistance. */
  guardEls: Uint8Array;
  /** Ticks left of the fixed recovery after a Retreat (no Retreat or Defend), and of the Retreat itself (Brace, Phase). */
  guardCd: Int32Array; retreatT: Int32Array;
  /** Ticks left of the spear's impaling dash (you pass through bodies). */
  dashT: Int32Array;
  /** The Healing link: the ally it holds (-1 none) and ticks it has held (it costs a use a second). */
  linkTo: Int16Array; linkT: Int32Array;
  /** Ticks a held weapon Special has channelled (the wand's Siphon, the hands' Mend); 0 when not. */
  specT: Int32Array;
  /** Your Double's body, or -1; where it keeps itself relative to you; whether it paid for the current channel; where its beam reached. */
  double: Int16Array; dblOX: Float64Array; dblOY: Float64Array; dblPaid: Uint8Array; dblEndX: Float64Array; dblEndY: Float64Array;
  /** When the Double, and the wand or conjured weapon, were made (for recalling the oldest). */
  dblBorn: Int32Array; wandBorn: Int32Array;
}

/**
 * Conjured guards, one per lead element (Shield + it), and Shield alone = the Mirror buckler
 * (docs/explorations/2026-11-05-guards.md). `buckler` is the Mirror's old name.
 */
export const GUARD = { none: 0, bulwark: 1, mirror: 2, buckler: 2, ember: 3, rime: 4, spark: 5, tide: 6, prism: 7, leaf: 8 } as const;
/** Guard id -> its name in ARMS.hp (and the view). */
export const GUARD_NAME: readonly string[] = ['none', 'bulwark', 'mirror', 'ember', 'rime', 'spark', 'tide', 'prism', 'leaf'];

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
export const PF = { heal: 1, scald: 2, freeze: 4, lensed: 8, pin: 16 } as const;
/** Lens amplification (kept here so effects and structures share it). */
export const STRUCT_SCALE = { lens: 1.5 } as const;
export const MOD_ID = { none: 0, push: 1, shatter: 2, chain: 3, burst: 4 } as const;
export const ZONE = { none: 0, blast: 1, geyser: 2, spring: 3, steam: 4, spark: 5 } as const;

/** The floor: one byte of surface per cell, plus ticks left. */
export const SURF = { none: 0, water: 1, ice: 2, fire: 3 } as const;
export interface Surfaces {
  kind: Uint8Array;
  life: Int32Array;
}

/** What happened this tick, for the view (VFX, sound). Not state: cleared every step. */
export interface SimEvent {
  tick: number;
  kind: 'queue' | 'cancel' | 'dry' | 'cast' | 'hit' | 'heal' | 'fizzle' | 'burst' | 'zap' | 'surge' | 'blink' | 'shatter' | 'freeze' | 'todo'
    /** A weapon or guard move (hands.ts, guards.ts): `text` names it (dash, link, retreat kinds, block, parry...). */
    | 'move';
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
  /** Power and how far it rolls: Shield waves 1 and STRUCT.waveRange; weapon waves (trident, fire wave, fissure) their own. */
  scale: Float64Array; range: Float64Array;
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

/** The arena's wave director. Survive adds the altar pick between waves and the run's end. */
export const PHASE_ENC = { off: 0, lull: 1, wave: 2, breather: 3, pick: 4, over: 5 } as const;
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

/**
 * Survive's power-ups (docs/explorations/2026-11-05-survive-mode.md): per-seat modifiers the sim
 * applies. `cap` is how many of one a seat can hold.
 */
export const PU = {
  none: 0,
  /** +1 max rune of every element. */
  deep: 1,
  /** +2 max runes of one element (the altar names it). */
  deepEl: 2,
  /** +30% rune regen. */
  wellspring: 3,
  /** +1 Sigil rune: one more standing device. */
  spareSigil: 4,
  /** Your rock walls stand twice as long, with half again the hit points. */
  bedrock: 5,
  /** Enemies you set burning explode in fire when they die. */
  pyre: 6,
  /** The first spell within 1.5 s of a Retreat hop costs no runes. */
  slipstream: 7,
  /** A mirror ward regrows on you 12 s after you last wore a ward. */
  charm: 8,
  /** Your heals splash half their healing onto allies near the one healed. */
  bloom: 9,
  /** Your turrets' shots cost no runes. */
  clockwork: 10,
} as const;
export const N_PU = 11;
export const PU_CAP: readonly number[] = [0, 3, 4, 3, 2, 1, 1, 1, 1, 1, 1];
export const N_ALTARS = 3;
/** Picks remembered per seat, in order, for the HUD and the results. */
export const PICK_LOG = 32;

/** Survive's run: the altar pick and every seat's power-ups. Only a survive world has one. */
export interface Run {
  /** [0] ticks into the pick, [1] waves survived when the run ended, [2] restarts, [3] ticks since the run ended, [4] the wave the run ended on. */
  state: Int32Array;
  /** Power-up stacks, N_PU per seat. */
  stacks: Uint8Array;
  /** Extra max runes, N_EL per seat (from deep, deepEl and spareSigil). */
  maxBonus: Float64Array;
  /** The altars of this pick: their power-up, its element (deepEl) and where they stand. */
  offer: Uint8Array; offerEl: Uint8Array; ax: Float64Array; ay: Float64Array;
  /** The altar each seat took this pick (-1: none yet), and ticks it has stood on one. */
  picked: Int8Array; stand: Int32Array; standOn: Int8Array;
  /** Every pick so far, per seat (power-up, element). */
  log: Uint8Array; logEl: Uint8Array; logN: Uint8Array;
  /** Slipstream: ticks left of the free-spell window after a hop. Charm: ticks until the mirror regrows. */
  dodge: Int32Array; charm: Int32Array;
}

export interface World {
  /** The play area (not state: fixed by the room, see Dims). */
  dims: Dims;
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
  /** Survive only (null elsewhere, so the other rooms' state, and the golden hash, are untouched). */
  run: Run | null;
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
    root: i32(n),
  };
}
function seats(n: number): Seats {
  return {
    active: u8(n), runes: f64(n * N_EL), queue: u8(n * QUEUE_MAX), queueLen: u8(n), prevButtons: new Uint16Array(n),
    aimX: f64(n), aimY: f64(n), phase: u8(n), timer: i32(n), castId: u8(n), castQueue: u8(n * QUEUE_MAX), castLen: u8(n),
    areaHeld: i32(n), holdX: f64(n), holdY: f64(n), dragged: u8(n), chanTicks: i32(n), chanTimer: i32(n), chanEndX: f64(n), chanEndY: f64(n), attune: i32(n), bufCast: u8(n), bufTicks: i32(n),
    ward: u8(n), wardEls: u8(n * N_EL), wardHp: f64(n), wardBy: new Int16Array(n).fill(-1), auraEls: u8(n * N_EL), aura: i32(n), wand: u8(n),
    weapon: u8(n), weaponEls: u8(n * N_EL), weaponUses: i32(n), motes: u8(n),
    guard: u8(n), guardHp: f64(n), guardT: i32(n), handT: i32(n), double: new Int16Array(n).fill(-1), dblOX: f64(n), dblOY: f64(n), dblPaid: u8(n), dblEndX: f64(n), dblEndY: f64(n), dblBorn: i32(n), wandBorn: i32(n),
    guardEls: u8(n * N_EL), guardCd: i32(n), retreatT: i32(n), dashT: i32(n), linkTo: new Int16Array(n).fill(-1), linkT: i32(n),
    specT: i32(n),
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

function run(): Run {
  const n = MAX_SEATS;
  return {
    state: i32(6), stacks: u8(n * N_PU), maxBonus: f64(n * N_EL),
    offer: u8(N_ALTARS), offerEl: u8(N_ALTARS), ax: f64(N_ALTARS), ay: f64(N_ALTARS),
    picked: new Int8Array(n).fill(-1), stand: i32(n), standOn: new Int8Array(n).fill(-1),
    log: u8(n * PICK_LOG), logEl: u8(n * PICK_LOG), logN: u8(n),
    dodge: i32(n), charm: i32(n),
  };
}

/** The owner of the arena's own rock (survive's cover and gates): it never times out or breaks. */
export const TERRAIN = -2;

/** A segment and its mirror images across x = 0 and / or y = 0 (the survive arena is symmetric both ways). */
type Seg = readonly [number, number, number, number];
const mirrored = (segs: Seg[], mx: boolean, my: boolean): Seg[] => {
  const out: Seg[] = [];
  for (const [x1, y1, x2, y2] of segs) {
    out.push([x1, y1, x2, y2]);
    if (mx) out.push([-x1, y1, -x2, y2]);
    if (my) out.push([x1, -y1, x2, -y2]);
    if (mx && my) out.push([-x1, -y1, -x2, -y2]);
  }
  return out;
};

/**
 * The survive arena's static rock (48 x 34 u), as segments, in zones from the middle out:
 *
 *   the keep     a walled courtyard (17 x 12 u) round the altar plaza, its corners cut, with a
 *                3.6 u door on each axis: the place to hold, and four doors to watch or wall shut.
 *                Two pillars inside screen the plaza from the west and east doors.
 *   causeways    west and east, a 4.4 u wide walled lane, 7 u long, from the gate to the keep's door:
 *                a long, narrow approach to fight down (a wave spray or a rock fills it).
 *   gates        six V-shaped funnels at the far edges (west, east, and two each north and south),
 *                each with its portal at the back: enemies leave them by a 2.8-3 u mouth, 12-15 u
 *                from the keep, so a wave arrives over several seconds.
 *   the field    the ring of open ground between the keep and the gates: screens in front of the
 *                north and south doors and an L of cover in each corner (archer cover, ricochet angles).
 *
 * 40 segments, so players keep 120 of the 160 wall slots.
 */
export const SURVIVE_ROCK: readonly Seg[] = [
  // the keep: one cut corner (three segments) per quadrant, doors on the axes
  ...mirrored([[-8.5, -1.8, -8.5, -3.6], [-8.5, -3.6, -6.2, -6], [-6.2, -6, -1.8, -6]], true, true),
  // pillars flanking the plaza
  [-5.2, -0.8, -5.2, 0.8], [5.2, -0.8, 5.2, 0.8],
  // causeways, west and east
  ...mirrored([[-18.5, -2.2, -11.5, -2.2], [-18.5, 2.2, -11.5, 2.2]], true, false),
  // gate funnels: west and east (the walls run a little past the edge, so nothing slips round their ends)
  ...mirrored([[-24.4, -5.4, -20.8, -1.5], [-24.4, 5.4, -20.8, 1.5]], true, false),
  // gate funnels: north-west, north-east, south-west, south-east
  ...mirrored([[-15.6, -17.4, -13.4, -13.6], [-8.4, -17.4, -10.6, -13.6]], true, true),
  // screens before the north and south doors
  [-2.2, -10.5, 2.2, -10.5], [-2.2, 10.5, 2.2, 10.5],
  // corner cover: an L in each quadrant, its corner pointing out
  ...mirrored([[-19, -10, -16.5, -10], [-19, -10, -19, -8]], true, true),
];
/** Where survive's portals open: at the back of each gate funnel. */
export const SURVIVE_GATES: readonly (readonly [number, number])[] = [[-23, 0], [23, 0], [-12, -15.8], [12, -15.8], [-12, 15.8], [12, 15.8]];
export const ALTAR_SPOTS: readonly (readonly [number, number])[] = [[-2.6, -0.4], [0, 2.1], [2.6, -0.4]];

/** Max runes of element `id` for seat `i`: the config, plus the seat's survive power-ups. */
export const runeMax = (w: World, i: number, id: number): number =>
  w.run ? RUNES.max[elementName(id)] + w.run.maxBonus[i * N_EL + id - 1] : RUNES.max[elementName(id)];
/** A seat's power-up stacks (0 outside survive). */
export const stackOf = (w: World, i: number, pu: number): number => (w.run && i >= 0 && i < MAX_SEATS ? w.run.stacks[i * N_PU + pu] : 0);
/** Runes per second for seat `i` (Wellspring adds 30% a stack). */
export const regenOf = (w: World, i: number): number => {
  const k = stackOf(w, i, PU.wellspring);
  return k ? RUNES.regen * (1 + 0.3 * k) : RUNES.regen;
};

const START = [[-4, 2], [4, 2], [-4, -2], [4, -2]] as const;
/** The Sanctum's practice dummies. */
const DUMMIES = [[-6, -4], [0, -5], [6, -4]] as const;

export type Room = 'sanctum' | 'arena' | 'survive';

export function createWorld(seed: number, players: number, opts: { dummies?: boolean; room?: Room } = {}): World {
  const dims = ROOM_DIMS[opts.room ?? 'sanctum'], cells = dims.gw * dims.gh;
  const w: World = {
    dims,
    clock: new Uint32Array([0, seed >>> 0]), rng: createRng(seed),
    bodies: bodies(MAX_BODIES), seats: seats(MAX_SEATS), missiles: missiles(MAX_MISSILES), zones: zones(MAX_ZONES),
    surf: { kind: u8(cells), life: i32(cells) },
    walls: {
      type: u8(MAX_WALLS), x1: f64(MAX_WALLS), y1: f64(MAX_WALLS), x2: f64(MAX_WALLS), y2: f64(MAX_WALLS), hp: f64(MAX_WALLS), maxHp: f64(MAX_WALLS),
      owner: new Int16Array(MAX_WALLS), els: u8(MAX_WALLS * N_EL), born: i32(MAX_WALLS), pulse: i32(MAX_WALLS),
    },
    waves: {
      alive: u8(MAX_WAVES), x: f64(MAX_WAVES), y: f64(MAX_WAVES), dx: f64(MAX_WAVES), dy: f64(MAX_WAVES), half: f64(MAX_WAVES), travelled: f64(MAX_WAVES),
      owner: new Int16Array(MAX_WAVES), els: u8(MAX_WAVES * N_EL), hit: u8(MAX_WAVES * MAX_BODIES),
      scale: f64(MAX_WAVES), range: f64(MAX_WAVES),
    },
    enc: {
      state: i32(4), px: f64(MAX_PORTALS), py: f64(MAX_PORTALS), arch: u8(MAX_PORTALS),
      left: i32(MAX_PORTALS), next: i32(MAX_PORTALS), total: i32(MAX_PORTALS),
    },
    nav: { blocked: u8(cells), field: i32(MAX_SEATS * cells), timer: i32(1) },
    devices: {
      type: u8(MAX_DEVICES), x: f64(MAX_DEVICES), y: f64(MAX_DEVICES), x2: f64(MAX_DEVICES), y2: f64(MAX_DEVICES), owner: new Int16Array(MAX_DEVICES),
      els: u8(MAX_DEVICES * N_EL), timer: i32(MAX_DEVICES), life: i32(MAX_DEVICES), charges: u8(MAX_DEVICES), phase: f64(MAX_DEVICES),
      heal: u8(MAX_DEVICES), look: u8(MAX_DEVICES), born: i32(MAX_DEVICES), chan: i32(MAX_DEVICES),
    },
    run: opts.room === 'survive' ? run() : null,
    events: [],
  };
  if (w.run) {
    SURVIVE_ROCK.forEach(([x1, y1, x2, y2], k) => {
      const wl = w.walls;
      wl.type[k] = 1; // WALL.rock (compile.ts)
      wl.owner[k] = TERRAIN; wl.x1[k] = x1; wl.y1[k] = y1; wl.x2[k] = x2; wl.y2[k] = y2;
      wl.hp[k] = wl.maxHp[k] = 1e6;
    });
  }
  for (let i = 0; i < Math.min(players, MAX_SEATS); i++) joinSeat(w, i);
  const arena = opts.room === 'arena' || opts.room === 'survive';
  if (arena) { w.enc.state[0] = PHASE_ENC.lull; w.enc.state[1] = 1; w.enc.state[2] = 0; }
  else if (opts.dummies !== false) for (const [x, y] of DUMMIES) spawnBody(w, -1, KIND.dummy, TEAM.enemies, x, y, BODY.dummyHp, BODY.dummyRadius);
  return w;
}

/** A player takes seat `i`: its wizard appears at the seat's start spot with full rune pools. */
export function joinSeat(w: World, i: number): void {
  if (w.seats.active[i]) return;
  w.seats.active[i] = 1;
  spawnBody(w, i, KIND.wizard, TEAM.players, START[i][0], START[i][1], BODY.wizardHp, BODY.wizardRadius);
  for (let e = 1; e <= N_EL; e++) w.seats.runes[i * N_EL + e - 1] = runeMax(w, i, e);
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
  b.dmgMult[i] = 1; b.speedMult[i] = 1; b.downed[i] = 0; b.root[i] = 0;
  return i;
}

export const tickOf = (w: World): number => w.clock[0];

/** Every typed array in the world, in a fixed order. Snapshot, restore and hash all walk this list. */
export function buffers(w: World): ArrayBufferView[] {
  const out: ArrayBufferView[] = [w.clock, w.rng];
  const pools: object[] = [w.bodies, w.seats, w.missiles, w.zones, w.surf, w.walls, w.waves, w.devices, w.enc, w.nav];
  if (w.run) pools.push(w.run); // survive only: the other rooms keep their layout (and hash) exactly
  for (const pool of pools) {
    // Sorted by field name, so the order never depends on how a pool object was built.
    for (const k of Object.keys(pool).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) out.push((pool as Record<string, ArrayBufferView>)[k]);
  }
  return out;
}
