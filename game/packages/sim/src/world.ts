/**
 * World state. Everything that affects gameplay lives here, in fixed-capacity typed arrays
 * (struct of arrays), so snapshot / restore is a few buffer copies and the state hash is one
 * pass over the bytes. No objects, Maps or closures hold gameplay state.
 *
 * Entities are slots in a pool: `alive[i]` (or `kind[i]`) marks a used slot, and iteration
 * always runs in slot order, so every peer visits entities in the same order.
 */
import { ARENA, BODY, CELL, PERKS, RUNES, T, WELL } from './config';
import { EL, KEYED_EL, N_EL, elementName } from './elements';
import { createRng, type RngState } from './rng';
import { roomHash, type RoomDef, type Seg } from './room';
import { createTerrain, type Terrain } from './terrain';
import { ROOM_DEFS } from './rooms.gen';
import { TS_LEN, TUT_ORDER } from './tutorial-data';
import type { Mode, WorldOpts } from './mode';

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const MAX_SEATS = 4;
export const MAX_BODIES = 96;
export const MAX_MISSILES = 256;
export const MAX_ZONES = 64;
export const MAX_WALLS = 160; // the walls players cast: four at structures.wallsPerOwner (40) each. A room's terrain isn't here (world.terrain).
export const MAX_WAVES = 8;
export const MAX_DEVICES = 48;
export const QUEUE_MAX = 5;

export { ARENA };

/**
 * A world's play area: its size in world units (centred on the origin) and its surface / nav grid
 * in CELL-sized cells. Fixed by the room when the world is made, so it is not state: two worlds of
 * the same room always share it, and the grids' arrays (which are state) are sized from it.
 *
 * Rooms come from the LDtk maps in game/content/maps, compiled into rooms.gen.ts (plain data; see
 * room.ts). A level added there is a room here.
 */
export interface Dims { readonly w: number; readonly h: number; readonly gw: number; readonly gh: number }
const dimsOf = (w: number, h: number): Dims => ({ w, h, gw: Math.round(w / CELL), gh: Math.round(h / CELL) });
export type Room = keyof typeof ROOM_DEFS;
/** Every room's layout, by id. */
export const ROOMS: Readonly<Record<Room, RoomDef>> = ROOM_DEFS;
const ROOM_IDS = Object.keys(ROOMS).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) as Room[];
/** Each room's hash (room.ts roomHash): what peers compare before a match. */
export const ROOM_HASH: Readonly<Record<Room, number>> = Object.fromEntries(ROOM_IDS.map((id) => [id, roomHash(ROOMS[id])])) as Record<Room, number>;
/** One hash for every room (FNV-1a over the rooms' hashes, by id): the lobby compares it. */
export const CONTENT_HASH: number = ROOM_IDS.reduce((h, id) => Math.imul(h ^ ROOM_HASH[id], 0x01000193), 0x811c9dc5) >>> 0;
/**
 * Survive's arena: over four times the Arena's floor, too big to fit on screen at any scale the
 * camera picks for a 1280 x 800 window or larger (at 2x such a window shows 40 x 31 u of play area;
 * the camera follows).
 */
export const SURVIVE_ARENA = { w: ROOMS.survive.w, h: ROOMS.survive.h } as const;
export const ROOM_DIMS: Readonly<Record<Room, Dims>> = Object.fromEntries(ROOM_IDS.map((id) => [id, dimsOf(ROOMS[id].w, ROOMS[id].h)])) as Record<Room, Dims>;
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
  // Statuses, in ticks left (chill is how full the frost pool is, 0..1; burnPool is the damage still to burn).
  burnPool: Float64Array;
  wet: Int32Array; burn: Int32Array; frozen: Int32Array; stun: Int32Array; expose: Int32Array; down: Int32Array;
  /** A heal's lent resistance (guards.ts bless): r per resistance column (5 a body), and ticks left. */
  bless: Float64Array; blessT: Int32Array;
  chill: Float64Array;
  /** How soaked a wet body is, 0..1 (hit.ts addSoak). Wet's synergies scale with it; it counts only while wet > 0. */
  soak: Float64Array;
  /** Tick of the last hit taken (dummies reset after a quiet spell). */
  lastHit: Int32Array;
  // ---- enemies ----
  /** ARCH id (archetypes.ts). */
  arch: Uint8Array;
  /** AI state (AI), ticks in it, the body it is after, and where its attack is locked. */
  ai: Uint8Array; aiT: Int32Array; target: Int16Array; lockX: Float64Array; lockY: Float64Array;
  /** Grabber: who it holds, and its hp when it grabbed (enough damage breaks the hold). Victims: who holds them. */
  holding: Int16Array; grabHp: Float64Array; heldBy: Int16Array;
  /** Brute: where its slam's shockwave starts (its fists). Victims: the brute and strike tick of the last shockwave that hit them (once each). */
  slamX: Float64Array; slamY: Float64Array; slamBy: Int16Array; slamAt: Int32Array;
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
  /**
   * The stored spell (Sigil alone on Force, spell audit 2026-11-11): storeArm 1 while the staff waits for the next spell; then
   * that spell's queue (storeQ, storeLen) and cast (storeCast, a CAST_ID) are held until an empty-queue Force releases them
   * with no wind-up. It binds a Sigil rune from arming to release; storeBorn is when it was armed (for recalling the oldest).
   */
  storeArm: Uint8Array; storeQ: Uint8Array; storeLen: Uint8Array; storeCast: Uint8Array; storeBorn: Int32Array;
  /** The tick (+1; 0 none) of your last Sigil press with no free Sigil rune: a second within RHYTHM.dryTap is a dry double-tap. */
  drySigil: Int32Array;
  /** Ghost runes: per queue slot, what it still owes (bit 1 its element, or Ice's Water; bit 2 Ice's Cold). cast.ts. */
  owe: Uint8Array;
  /** A conjured shield: GUARD kind, what it can still take, and ticks the Weapon button has been held (0 = not blocking). */
  guard: Uint8Array; guardHp: Float64Array; guardT: Int32Array; guardCharge: Float64Array;
  /** Ticks RMB has been held for a Strike or Heavy with no runes queued (0: not held). */
  handT: Int32Array;
  /** A guard's elements other than Shield and Sigil (9 per seat): the lead picks the guard, the others mix in (guards.ts). */
  guardEls: Uint8Array;
  /** Ticks left of the fixed recovery after a Retreat (no Retreat or Defend), and of the Prism's Phase (through bodies). */
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
  /** Ticks before it leaves (a staggered volley): till then it waits at its caster's staff, harmless and unseen. */
  wait: Uint8Array;
}

/** Things that sit in the world for a while: delayed blasts, geysers, healing springs, steam clouds, rain. */
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
export const PF = { heal: 1, scald: 2, freeze: 4, lensed: 8, pin: 16, coated: 32 } as const;
export const MOD_ID = { none: 0, push: 1, shatter: 2, chain: 3, burst: 4 } as const;
export const ZONE = { none: 0, blast: 1, geyser: 2, spring: 3, steam: 4, spark: 5, rain: 6, frost: 7, caltrops: 8 } as const;

/** The floor: one byte of surface per cell, plus ticks left. */
export const SURF = { none: 0, water: 1, ice: 2, fire: 3 } as const;
export interface Surfaces {
  kind: Uint8Array;
  life: Int32Array;
  /** A fire floor's heat: the Fire runes in what lit it (its touch and its burn while you stand in it scale by it). 0 elsewhere. */
  heat: Uint8Array;
}

/** What happened this tick, for the view (VFX, sound). Not state: cleared every step. */
/**
 * What an event means, apart from how it looks: the view, the sound and the modes read this, never `text`, which is a
 * label for the screen and can be reworded freely. Most events need none (their kind says it all).
 */
export const EV = {
  none: 0,
  /** A body died (fizzle); a wizard went down (fizzle). */
  death: 1, downed: 2,
  /** Banners (who -1): a wave starts, is cleared, everyone fell (the Arena), a Survive run ends or starts again. */
  waveStart: 3, waveClear: 4, wiped: 5, runOver: 6, newRun: 7,
  /** A Sigil device, ward or weapon was let go (burst). */
  dismiss: 8,
  /** Survive: a downed wizard is rallied (burst, src = the rallier), or the rally is broken (fizzle). */
  rally: 9, rallyBroken: 10,
  /** A soaking enemy is doused (hit); a guard parries (hit); a grabber takes someone (hit); a blow or status is blocked (fizzle). */
  doused: 11, parry: 12, grabbed: 13, blocked: 14,
  /** A turret's orbital strike (zap). */
  orbital: 15,
  /** The battery: the well runs dry (burst, who -1), a defence gutters out (burst), a wizard is infused (burst). */
  wellDry: 16, gutter: 17, infuse: 18,
  /** Notes (kind 'note', never drawn): an enemy's shot met a wall a wizard made; an enemy's slam finished (amount 1: it hit someone). */
  shotWalled: 19, slamDone: 20,
} as const;

export interface SimEvent {
  tick: number;
  kind: 'queue' | 'cancel' | 'dry' | 'cast' | 'hit' | 'heal' | 'fizzle' | 'burst' | 'zap' | 'surge' | 'blink' | 'shatter' | 'freeze' | 'todo'
    /** A weapon or guard move (hands.ts, guards.ts): `text` names it (dash, link, retreat kinds, block, parry...). */
    | 'move'
    /** Facts for the modes (EV.shotWalled, EV.slamDone): no picture, no sound. */
    | 'note';
  /** What it means (EV), when the kind alone doesn't say. */
  ev?: number;
  who: number;
  /** hit / heal: the body that dealt it (-1 for the world: burning, surfaces). */
  src?: number;
  /** hit: damage over time (a burn's tick), not a blow. The sound leaves it to the burning loop. */
  dot?: 1;
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
  /** The imbued burst's move: which elements it carried (bit 1 << element id). */
  els?: number;
}

/**
 * The walls that come and go: what players cast (rock, barriers, curtains) and the tutorial's per-beat rock.
 * Segments x1,y1 -> x2,y2. A room's own rock lives in world.terrain, read by the same rules (walls.ts).
 */
export interface Walls {
  type: Uint8Array; // WALL (compile.ts): 0 none, 1 rock, 2 barrier, 3 curtain
  x1: Float64Array; y1: Float64Array; x2: Float64Array; y2: Float64Array;
  hp: Float64Array; maxHp: Float64Array;
  owner: Int16Array;
  els: Uint8Array;
  /** Tick it was raised (the oldest breaks first). */
  born: Int32Array;
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
  /** +1 to three: +1 max rune of three different elements the wizard picks by tapping their keys (not Shield or Sigil). */
  three: 1,
  /** +2 max runes of one element (the altar names it). */
  deepEl: 2,
  /** +PERKS.wellspring total rune regen R. */
  wellspring: 3,
  /** +1 Shield and +1 Sigil max rune. */
  shieldSigil: 4,
  /** Your rock walls stand twice as long, with half again the hit points. */
  bedrock: 5,
  /** Enemies you set burning explode in fire when they die. */
  pyre: 6,
  /** A mirror ward regrows on you 12 s after you last wore a ward. */
  charm: 7,
  /** Clockwork: your turrets bind no Sigil rune (they still cost their runes, and their shots still fit the regen budget). */
  clockwork: 8,
  /** Echo: until the next wave is cleared, every spell you cast goes off again PERKS.echoDelay s later, free (one-shot: it can be picked again). */
  echo: 9,
  /** Glass heart: PERKS.glassDmg more damage dealt and PERKS.glassHp less max health, per stack. */
  glass: 10,
  /** Lingering: your placed and lingering areas (patches, floors, rain, steam, springs, glyphs, rock walls) last PERKS.lingerLife times as long and are PERKS.lingerSize times as big. */
  lingering: 11,
  /** Quickstep: a permanent, weaker haste (PERKS.quickstep a stack): faster walking, wind-up and recovery. */
  quickstep: 12,
} as const;
export const N_PU = 13;
export const PU_CAP: readonly number[] = [0, 6, 4, 3, 3, 1, 1, 1, 1, 9, 2, 1, 2];
/** Echo: spells waiting to go off again, per seat; and how many ticks of aim a channel's echo trails by. */
export const ECHO_Q = 4, ECHO_LAG = 24;
export const N_ALTARS = 3;
/** Picks remembered per seat, in order, for the HUD and the results. */
export const PICK_LOG = 32;

/** The battery: which defence each seat is driving, and where it stood to step up (battery.ts). Only a battery world has one. */
export interface Battery {
  /** The defence each seat drives (its index among the room's towers), or -1. */
  drive: Int8Array;
  homeX: Float64Array; homeY: Float64Array;
  /** Each body's lane: the defence it was sent at (battery-waves.ts), or -1. */
  lane: Int8Array;
  /** How much the well still gives, 1 to 0: a defence's pool refills at this share of R (beat 5, battery-waves.ts). */
  flow: Float64Array;
  /** [0] ticks since the flow ran out, [1] ticks since the well ran dry, [2] ticks since its repair began (0: not yet). */
  wellT: Int32Array;
}

/** Has the repair begun (X at the well once the fight is over, battery-waves.ts)? */
export const wellRepaired = (w: World): boolean => !!w.battery && w.battery.wellT[2] > 0;

/** Has the battery's well run dry (beat 6)? From then on the defences are dead and your runes are your own. */
export const wellDry = (w: World): boolean => !!w.battery && w.battery.wellT[1] > 0;
/** Has the infusion come (WELL.surge after the well ran dry)? Then every wizard has a Fire pool of its own. */
export const infused = (w: World): boolean => !!w.battery && w.battery.wellT[1] > T(WELL.surge);

/** Survive's run: the altar pick and every seat's power-ups. Only a survive world has one. */
export interface Run {
  /** [0] ticks into the pick, [1] waves survived when the run ended, [2] restarts, [3] ticks since the run ended, [4] the wave the run ended on. */
  state: Int32Array;
  /** Power-up stacks, N_PU per seat. */
  stacks: Uint8Array;
  /** Extra max runes, N_EL per seat (from three, deepEl and shieldSigil). */
  maxBonus: Float64Array;
  /** +1 to three, per seat: picks still to make (0: not choosing). While choosing, element keys pick instead of queueing. */
  choose: Uint8Array;
  /** +1 to three: the elements picked so far, 3 per seat (0: not yet). */
  chosen: Uint8Array;
  /** The altars of this pick: their power-up, its element (deepEl) and where they stand. */
  offer: Uint8Array; offerEl: Uint8Array; ax: Float64Array; ay: Float64Array;
  /** The altar each seat took this pick (-1: none yet), and ticks it has stood on one. */
  picked: Int8Array; stand: Int32Array; standOn: Int8Array;
  /** Every pick so far, per seat (power-up, element). */
  log: Uint8Array; logEl: Uint8Array; logN: Uint8Array;
  /** Charm: ticks until the mirror regrows. */
  charm: Int32Array;
  /** Rally (everyone can), per downed seat: ticks of revive so far, and the seat reviving them (-1: nobody). */
  rally: Int32Array; rallyBy: Int8Array; rallyCd: Int32Array;
  /** Echo: 1 while the seat's spells echo (from the pick until the next wave is cleared). */
  echoOn: Uint8Array;
  /** Echo's pending repeats, ECHO_Q per seat: the tick each goes off (0: an empty slot), its runes (QUEUE_MAX each) and their count, its cast (CAST_ID), whether it was dragged, its charge. */
  echoAt: Int32Array; echoQ: Uint8Array; echoLen: Uint8Array; echoCast: Uint8Array; echoDrag: Uint8Array; echoCharge: Float64Array;
  /** Echo of a channel: the seat's aim over the last ECHO_LAG ticks (a ring, by tick), and where the trailing channel ends. */
  echoFace: Float64Array; echoEndX: Float64Array; echoEndY: Float64Array;
}

/**
 * The tutorial's state (tutorial.ts; docs/explorations/2026-11-06-tutorial.md). Only a tutorial world
 * has one. `state` slots are TS in tutorial-data.ts.
 */
export interface Tutorial {
  state: Int32Array;
  /** Personal done-bits, per seat (the prototype completes a personal beat when any one player does it). */
  done: Uint8Array;
  /** Ticks each seat stays fainted (you can't die in the tutorial: you faint and get up). */
  faint: Int32Array;
  /** What each body is to the tutorial (TAG). */
  tag: Uint8Array;
}

export interface World {
  /** The play area (not state: fixed by the room, see Dims). */
  dims: Dims;
  /** The room's layout (not state either: fixed by the room, from the maps; room.ts). */
  def: RoomDef;
  /** The room's static rock and blocking props, with a spatial lookup (not state: read-only, derived from def; terrain.ts). */
  terrain: Terrain;
  /** The rules this world runs under besides the core game (not state: fixed by the room; mode.ts, modes.ts). */
  mode: Mode;
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
  battery: Battery | null;
  /** Tutorial only (null elsewhere, like run). */
  tut: Tutorial | null;
  events: SimEvent[];
}

const f64 = (n: number) => new Float64Array(n), i32 = (n: number) => new Int32Array(n), u8 = (n: number) => new Uint8Array(n);

function bodies(n: number): Bodies {
  return {
    kind: u8(n), team: u8(n), x: f64(n), y: f64(n), vx: f64(n), vy: f64(n), kx: f64(n), ky: f64(n), r: f64(n),
    hp: f64(n), maxHp: f64(n), face: f64(n),
    burnPool: f64(n), wet: i32(n), burn: i32(n), frozen: i32(n), stun: i32(n), expose: i32(n), down: i32(n), bless: f64(n * 5), blessT: i32(n), chill: f64(n), soak: f64(n), lastHit: i32(n),
    arch: u8(n), ai: u8(n), aiT: i32(n), target: new Int16Array(n), lockX: f64(n), lockY: f64(n),
    holding: new Int16Array(n).fill(-1), grabHp: f64(n), heldBy: new Int16Array(n).fill(-1),
    slamX: f64(n), slamY: f64(n), slamBy: new Int16Array(n).fill(-1), slamAt: i32(n),
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
    weapon: u8(n), weaponEls: u8(n * N_EL), weaponUses: i32(n), motes: u8(n), storeArm: u8(n), storeQ: u8(n * QUEUE_MAX), storeLen: u8(n), storeCast: u8(n), storeBorn: i32(n), drySigil: i32(n), owe: u8(n * QUEUE_MAX),
    guard: u8(n), guardHp: f64(n), guardT: i32(n), guardCharge: f64(n), handT: i32(n), double: new Int16Array(n).fill(-1), dblOX: f64(n), dblOY: f64(n), dblPaid: u8(n), dblEndX: f64(n), dblEndY: f64(n), dblBorn: i32(n), wandBorn: i32(n),
    guardEls: u8(n * N_EL), guardCd: i32(n), retreatT: i32(n), dashT: i32(n), linkTo: new Int16Array(n).fill(-1), linkT: i32(n),
    specT: i32(n),
  };
}
function missiles(n: number): Missiles {
  return {
    alive: u8(n), x: f64(n), y: f64(n), vx: f64(n), vy: f64(n), life: i32(n), owner: new Int16Array(n), els: u8(n * N_EL),
    scale: f64(n), r: f64(n), type: u8(n), pierce: u8(n), look: u8(n), lastHit: new Int16Array(n),
    flags: u8(n), mod: u8(n), wait: u8(n),
  };
}
function zones(n: number): Zones {
  return {
    type: u8(n), x: f64(n), y: f64(n), r: f64(n), life: i32(n), timer: i32(n), owner: new Int16Array(n), els: u8(n * N_EL), scale: f64(n),
    flags: u8(n), mod: u8(n), look: u8(n),
  };
}

/** Survive's state for a new world (modes.ts). */
export function newRun(): Run {
  const n = MAX_SEATS;
  return {
    state: i32(6), stacks: u8(n * N_PU), maxBonus: f64(n * N_EL), choose: u8(n), chosen: u8(n * 3),
    offer: u8(N_ALTARS), offerEl: u8(N_ALTARS), ax: f64(N_ALTARS), ay: f64(N_ALTARS),
    picked: new Int8Array(n).fill(-1), stand: i32(n), standOn: new Int8Array(n).fill(-1),
    log: u8(n * PICK_LOG), logEl: u8(n * PICK_LOG), logN: u8(n),
    charm: i32(n),
    rally: i32(n), rallyBy: new Int8Array(n).fill(-1), rallyCd: i32(n),
    echoOn: u8(n), echoAt: i32(n * ECHO_Q), echoQ: u8(n * ECHO_Q * QUEUE_MAX), echoLen: u8(n * ECHO_Q), echoCast: u8(n * ECHO_Q), echoDrag: u8(n * ECHO_Q), echoCharge: f64(n * ECHO_Q),
    echoFace: f64(n * ECHO_LAG), echoEndX: f64(n), echoEndY: f64(n),
  };
}

/** The tutorial's state for a new world, starting at `beat` (modes.ts). */
export function newTutorial(beat: number): Tutorial {
  const t: Tutorial = { state: i32(TS_LEN), done: u8(MAX_SEATS), faint: i32(MAX_SEATS), tag: u8(MAX_BODIES) };
  t.state[0] = TUT_ORDER.includes(beat) ? beat : TUT_ORDER[0];
  t.state[4] = -1; // the beat is laid out on the first step (tutorial.ts; world.ts can't import it)
  return t;
}

/** The owner of rock in the wall pool that belongs to no one (the tutorial's chamber): it never times out or breaks. */
export const TERRAIN = -2;

/**
 * The survive arena's static rock (48 x 34 u), as segments, in zones from the middle out (the map is
 * game/content/maps/world/Survive.ldtkl; these are its free Rock entities):
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
 * It is the room's terrain (world.terrain), so however much of it there is, the players' walls have their own pool.
 */
export const SURVIVE_ROCK: readonly Seg[] = ROOMS.survive.rock;
/** Where survive's portals open: at the back of each gate funnel. */
export const SURVIVE_GATES: readonly (readonly [number, number])[] = ROOMS.survive.portals;
export const ALTAR_SPOTS: readonly (readonly [number, number])[] = ROOMS.survive.altars;

/** Max runes of element `id` for seat `i`: the mode's (the tutorial's beat, Survive's weak start and power-ups, a defence's Fire), else the config's. */
export const runeMax = (w: World, i: number, id: number): number =>
  id > KEYED_EL ? 0 : // Ice has no pool: it is made from Water's and Cold's
  w.mode.runeMax ? w.mode.runeMax(w, i, id) : RUNES.max[elementName(id)];
/** A seat's power-up stacks (0 outside survive). */
export const stackOf = (w: World, i: number, pu: number): number => (w.run && i >= 0 && i < MAX_SEATS ? w.run.stacks[i * N_PU + pu] : 0);
/** True when device `k` binds no Sigil rune: a turret of a seat with Clockwork. Dismissing or recalling it gives none back. */
export const freeDevice = (w: World, k: number): boolean =>
  !!w.run && w.devices.type[k] === DEVICE.turret && stackOf(w, w.devices.owner[k], PU.clockwork) > 0;
/** Lingering: how many times as long what `src` places or leaves lingering lasts (1 without it; a Double's or an enemy's spells never). */
export const lingerLife = (w: World, src: number): number => (stackOf(w, src, PU.lingering) ? PERKS.lingerLife : 1);
/** Lingering: how many times as wide what `src` places or leaves lingering is. */
export const lingerSize = (w: World, src: number): number => (stackOf(w, src, PU.lingering) ? PERKS.lingerSize : 1);
/** Seat `i`'s total regen R, runes per second shared among its pools: the mode's (Survive's Wellspring, a defence's well), else the config's. */
export const regenOf = (w: World, i: number): number => w.mode.regen?.(w, i) ?? RUNES.regen;

/**
 * The shared regen budget: seat `i`'s runes per second into element `id`, given `full`, a bitmask (1 << id) of the pools
 * that are full. The rune rework (2026-11-11, the user chose it): R is shared equally among the pools that aren't full, and
 * an empty one (under a whole rune: nothing to cast with) takes RUNES.emptyShare shares. A small pool refills as fast as a
 * big one (the old split by max made a 1-rune pool wait on an empty 5-rune one), and none of R is lost to full pools (the
 * old floor's share was). Attune and Siphon multiply the result.
 */
export function regenRate(w: World, i: number, id: number, full: number): number {
  if (full & (1 << id) || runeMax(w, i, id) <= 0) return 0;
  const wt = (e: number): number => (full & (1 << e) || runeMax(w, i, e) <= 0 ? 0 : w.seats.runes[i * N_EL + e - 1] < 1 ? RUNES.emptyShare : 1);
  let total = 0;
  for (let e = 1; e <= KEYED_EL; e++) total += wt(e);
  return total > 0 ? (regenOf(w, i) * wt(id)) / total : 0;
}

/**
 * Seat i's regen into element `id` this tick (runes a second, before Attune): while a queued ghost rune is owed, all of R
 * goes to what's owed, shared by what each owes; otherwise the shared budget (regenRate).
 */
export function runeRate(w: World, i: number, id: number, full: number): number {
  const s = w.seats, need = (e: number): number => {
    let n = 0;
    for (let k = 0; k < s.queueLen[i]; k++) {
      const q = s.queue[i * QUEUE_MAX + k], o = s.owe[i * QUEUE_MAX + k];
      if (!o) continue;
      if (q === e && o & 1 && q !== EL.ice) n++;
      if (q === EL.ice && ((e === EL.water && o & 1) || (e === EL.cold && o & 2))) n++;
    }
    return n;
  };
  let total = 0;
  for (let e = 1; e <= KEYED_EL; e++) total += need(e);
  if (!total) return regenRate(w, i, id, full);
  return id <= KEYED_EL ? (regenOf(w, i) * need(id)) / total : 0;
}

/**
 * A new world of `opts.room` under `mode`: the core pools, then the mode's own, the seats, then the mode's layout.
 * Callers use createWorld (create.ts), which picks the room's mode; this half lives here because the pools do.
 */
export function createWorldWith(mode: Mode, seed: number, players: number, opts: WorldOpts = {}): World {
  const room = opts.room ?? 'sanctum', def = ROOMS[room], dims = ROOM_DIMS[room], cells = dims.gw * dims.gh;
  const w: World = {
    dims, def, terrain: createTerrain(def), mode,
    clock: new Uint32Array([0, seed >>> 0]), rng: createRng(seed),
    bodies: bodies(MAX_BODIES), seats: seats(MAX_SEATS), missiles: missiles(MAX_MISSILES), zones: zones(MAX_ZONES),
    surf: { kind: u8(cells), life: i32(cells), heat: u8(cells) },
    walls: {
      type: u8(MAX_WALLS), x1: f64(MAX_WALLS), y1: f64(MAX_WALLS), x2: f64(MAX_WALLS), y2: f64(MAX_WALLS), hp: f64(MAX_WALLS), maxHp: f64(MAX_WALLS),
      owner: new Int16Array(MAX_WALLS), els: u8(MAX_WALLS * N_EL), born: i32(MAX_WALLS),
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
    run: null, battery: null, tut: null,
    events: [],
  };
  mode.state?.(w, opts);
  for (let i = 0; i < Math.min(players, MAX_SEATS); i++) joinSeat(w, i);
  mode.setup(w, opts);
  return w;
}

/** A player takes seat `i`: its wizard appears at the seat's start spot with full rune pools. */
export function joinSeat(w: World, i: number): void {
  if (w.seats.active[i]) return;
  w.seats.active[i] = 1;
  spawnBody(w, i, KIND.wizard, TEAM.players, w.def.starts[i][0], w.def.starts[i][1], BODY.wizardHp, BODY.wizardRadius);
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
  b.wet[i] = b.burn[i] = b.frozen[i] = b.stun[i] = b.expose[i] = b.down[i] = b.blessT[i] = 0; b.bless.fill(0, i * 5, i * 5 + 5); b.chill[i] = 0; b.lastHit[i] = 0;
  b.arch[i] = 0; b.ai[i] = 0; b.aiT[i] = 0; b.target[i] = -1; b.holding[i] = -1; b.heldBy[i] = -1; b.grabHp[i] = 0; b.slamBy[i] = -1;
  b.dmgMult[i] = 1; b.speedMult[i] = 1; b.downed[i] = 0; b.root[i] = 0;
  w.mode.onSpawn?.(w, i); // a reused slot drops what the mode knew of its last body (a tutorial tag, a battery lane)
  return i;
}

/** Is terrain segment k a blocking prop's footprint? The client draws the prop there, not a wall. */
export const isPropWall = (w: World, k: number): boolean => k >= w.def.rock.length && k < w.terrain.n;

export const tickOf = (w: World): number => w.clock[0];
/** Is body slot i in use (anything that can be hit: a wizard, a dummy, an enemy, a Double)? */
export const alive = (w: World, i: number): boolean => w.bodies.kind[i] !== KIND.none;

/** Every typed array in the world, in a fixed order. Snapshot, restore and hash all walk this list. */
export function buffers(w: World): ArrayBufferView[] {
  const out: ArrayBufferView[] = [w.clock, w.rng];
  const pools: object[] = [w.bodies, w.seats, w.missiles, w.zones, w.surf, w.walls, w.waves, w.devices, w.enc, w.nav];
  const own = w.mode.pools?.(w); // only a world of that mode has them, so the other rooms keep their layout (and hash) exactly
  if (own) pools.push(...own);
  for (const pool of pools) {
    // Sorted by field name, so the order never depends on how a pool object was built.
    for (const k of Object.keys(pool).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) out.push((pool as Record<string, ArrayBufferView>)[k]);
  }
  return out;
}
