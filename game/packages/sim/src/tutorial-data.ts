/**
 * The tutorial's constant data (docs/explorations/2026-11-06-tutorial.md, pass 2 in
 * 2026-11-06-tutorial-pass-2.md): the beats, each beat's rune pools, where things stand in the
 * chamber, and who walks in through which gate. No state and no sim imports beyond the element and
 * archetype ids, so world.ts (runeMax) can read the pools without a cycle. The logic is in
 * tutorial.ts; every line of text is the client's (packages/client/src/tutorial-text.ts).
 *
 * Beats keep the design's numbers (1-19, the end card 20).
 */
import { ARCH } from './archetypes';
import { EL, N_EL } from './elements';

export const TUT_BEAT = {
  // chapter 1: your hands
  walk: 1, strike: 2, heavy: 3, retreat: 4, defend: 5, hands: 6,
  // chapter 2: one rune at a time
  fire: 7, douse: 8, steam: 9, cold: 10, cancel: 11, lightning: 12, shatter: 13, fireball: 14, life: 15, shield: 16, arcane: 17, sigil: 18,
  // chapter 3
  test: 19,
  end: 20,
} as const;
/** The beats in order, the end card last. */
export const TUT_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
export const TUT_END = TUT_BEAT.end;
/** The first beat of the rune chapter (the rune bar shows, empty, from here on). */
export const TUT_RUNES_FROM = TUT_BEAT.fire;
/** The beat after `beat` (the end card stays the end card). */
export const nextBeat = (beat: number): number => TUT_ORDER[Math.min(TUT_ORDER.length - 1, TUT_ORDER.indexOf(beat) + 1)] ?? TUT_END;

/** w.tut.state slots. */
export const TS = {
  /** The beat (design numbering). */
  beat: 0,
  /** Ticks into the beat. */
  ticks: 1,
  /** Counters the beat's check uses (stones stepped, slams dodged, parries...). */
  a: 2, b: 3,
  /** Ticks left of the fade between beats (0: none). */
  fade: 4,
  /** Ticks everyone has stood on the "I know this" stone. */
  skip: 5,
  /** The exit arch is lit (1 done, 2 skipped). */
  lit: 6,
  /** The end card: the arch chosen (1 Sanctum, 2 Survive, 3 Arena; 0 none yet). */
  exit: 7,
  /** The calm before a beat's arrivals: ticks of it so far. */
  calm: 8,
  /** The arrivals: 0 not yet released; else ticks since they were released, plus one. */
  go: 9,
  /** The wave (the test): 0 the first. */
  wave: 10,
  /** Spare counter. */
  c: 11,
} as const;
export const TS_LEN = 12;

/** What a body is to the tutorial (w.tut.tag). */
export const TAG = {
  none: 0, straw: 1, sack: 2, hedge: 3, bramble: 4, foe: 5, goblin: 6,
  /** A goblin the frost has touched (the Cold beat counts them). */
  chilled: 7,
  /** The Life beat: the wounded dummy to heal, and the goblin asleep beside it. */
  patient: 8, sleeper: 9,
  /** The Fireball beat: the bramble out in the pit. */
  far: 10,
} as const;

/** Each beat's rune pools: max runes per element id (index = id; 0 unused). Locked = 0. */
const pools = (o: Partial<Record<number, number>>): readonly number[] => {
  const a: number[] = new Array(N_EL + 1).fill(0);
  for (const k of Object.keys(o)) a[Number(k)] = o[Number(k)]!;
  return a;
};
const F2 = { [EL.fire]: 2 }, FW = { ...F2, [EL.water]: 2 }, FWC = { ...FW, [EL.cold]: 2 }, L = { ...FWC, [EL.lightning]: 2 };
const E = { ...L, [EL.earth]: 2 }, LI = { ...E, [EL.life]: 2 }, SH = { ...LI, [EL.shield]: 2 }, AR = { ...SH, [EL.arcane]: 2 };
const ALL = pools({ ...AR, [EL.sigil]: 1 });
export const TUT_POOLS: Readonly<Record<number, readonly number[]>> = {
  1: pools({}), 2: pools({}), 3: pools({}), 4: pools({}), 5: pools({}), 6: pools({}),
  7: pools(F2),
  8: pools({ ...F2, [EL.water]: 1 }),
  9: pools(FW),
  10: pools(FWC), 11: pools(FWC),
  12: pools(L),
  13: pools(E), 14: pools(E),
  15: pools(LI),
  16: pools(SH),
  17: pools(AR),
  18: ALL, 19: ALL, 20: ALL,
};
/** Max runes of element `id` in tutorial beat `beat`. */
export const tutPool = (beat: number, id: number): number => TUT_POOLS[beat]?.[id] ?? 0;

/** Where things stand in the chamber (the Sanctum's 24 x 16 u). You come in on the west, the arch is on the east. */
export const TUT_PLACES = {
  entry: [-9.5, 0] as const,
  /** Seat offsets from the entry. */
  seatOff: [[0, 0], [0, 1.3], [0, -1.3], [-1.3, 0]] as const,
  arch: [11.1, 0] as const, archR: 1.1,
  /** The "I know this" stone: by the entry, off the path. */
  skip: [-9.5, 5.6] as const, skipR: 0.8, skipTime: 1,
  /** The ready stone: a step ahead of the entry. Standing on it lets a beat's arrivals in (soon). */
  ready: [-7, 0] as const, readyR: 0.75,
  /**
   * The gates along the chamber's walls, where enemies walk in: far from the entry, never round it.
   * 0-5 on the north and south walls (west to east), 6-7 on the east wall either side of the arch.
   */
  gates: [[-5, -7.3], [-5, 7.3], [1, -7.3], [1, 7.3], [6.5, -7.3], [6.5, 7.3], [11.2, -5.7], [11.2, 5.7]] as const,
  /** Beat 1's floor stones. */
  stones: [[-4, -4.5], [1.5, 4.5], [6, -2.5]] as const, stoneR: 0.75,
  /** Beat 3: where the sack starts, and the ring to shove it into. */
  sack: [-1.5, 0] as const, ring: [2.2, 0] as const, ringR: 1.15,
  /**
   * Beat 7: the rock line across the chamber and its gap, the hedge of brambles stopping the gap
   * (just in front of the rock, so the rock rising behind doesn't hide it), and the thick bramble.
   */
  rockX: 5.5, hedgeGap: 1.6, hedgeX: 4.6, hedgeN: 4, thick: [-1, -5] as const,
  /** Beat 8: the burning band you cross (x from, x to). */
  fireBand: [0, 2.2] as const,
  /** Beat 9: the rain over the pen. */
  pen: [4, 0] as const, penR: 2.3,
  /** Beat 12: the cluster of straw goblins out in the open. */
  cluster: [[2.6, -0.7], [3.4, 0.2], [2.4, 0.9], [3.6, -1.3], [4.2, 1.0]] as const,
  /** Beat 13: the puddle, and the two straw goblins standing in it. */
  puddle: [3, 0] as const, puddleR: 1.7, puddled: [[3, -0.75], [3, 0.75]] as const,
  /** Beat 14: the pit you can't step into, and the bramble in its middle. */
  pit: [3.5, -2] as const, pitR: 5.5,
  /** Beat 15: the wounded dummy, and the goblin asleep beside it. */
  patient: [1.5, 1.5] as const, sleeper: [2.6, 2.4] as const,
  /** The end card's three arches (Sanctum, Survive, Arena). */
  exits: [[-1, -1.5], [4, -1.5], [9, -1.5]] as const, exitR: 1, exitTime: 1,
} as const;

/**
 * Seconds: a wizard lies fainted; the fade between beats; the calm before arrivals come by
 * themselves; the shortest warning once someone steps on the ready stone; the test's lulls.
 */
export const TUT_TIMES = { faint: 1.5, fade: 0.6, calm: 8, warn: 1.5, testCalm: 10, lull: 8 } as const;
/** The training buckler's guard HP, times a Mirror buckler's. */
export const TUT_BUCKLER_HP = 4;

/**
 * Someone who walks in through a gate once the calm is over: an archetype, the tutorial's tag, the
 * gate (TUT_PLACES.gates), seconds after the release, and how soft it is.
 */
export interface Arrival { arch: number; tag: number; gate: number; at: number; hp?: number; dmg?: number; speed?: number }
const soft = (arch: number, gate: number, at: number, o: Partial<Arrival> = {}): Arrival => ({ arch, tag: TAG.foe, gate, at, dmg: 0.25, ...o });
const gob = (gate: number, at: number, o: Partial<Arrival> = {}): Arrival => soft(ARCH.swarmer, gate, at, { tag: TAG.goblin, ...o });

/** Each beat's arrivals (the test's are per wave). Beats not listed have nobody coming. */
export const TUT_ARRIVALS: Readonly<Record<number, readonly (readonly Arrival[])[]>> = {
  [TUT_BEAT.retreat]: [[soft(ARCH.brute, 0, 0, { speed: 0.8 })]],
  [TUT_BEAT.defend]: [[soft(ARCH.caster, 6, 0, { hp: 20 })]],
  [TUT_BEAT.hands]: [[gob(0, 0, { hp: 6, speed: 0.6 }), gob(1, 0, { hp: 6, speed: 0.6 }), gob(2, 0.4, { hp: 6, speed: 0.6 }), gob(3, 0.4, { hp: 6, speed: 0.6 })]],
  [TUT_BEAT.cold]: [[gob(0, 0, { hp: 15 }), gob(1, 0, { hp: 15 }), gob(2, 0.6, { hp: 15 }), gob(3, 0.6, { hp: 15 }), gob(4, 1.4, { hp: 15 })]],
  [TUT_BEAT.shield]: [[soft(ARCH.caster, 6, 0, { hp: 200 }), soft(ARCH.caster, 7, 0.8, { hp: 200 })]],
  [TUT_BEAT.arcane]: [[soft(ARCH.caster, 6, 0, { hp: 25 }), soft(ARCH.caster, 7, 0.8, { hp: 25 })]],
  [TUT_BEAT.sigil]: [[
    gob(2, 0, { hp: 15, speed: 0.8 }), gob(2, 0.5, { hp: 15, speed: 0.8 }), gob(2, 1, { hp: 15, speed: 0.8 }),
    gob(3, 4, { hp: 15, speed: 0.8 }), gob(3, 4.5, { hp: 15, speed: 0.8 }), gob(3, 5, { hp: 15, speed: 0.8 }),
  ]],
  [TUT_BEAT.test]: [
    [gob(4, 0, { dmg: 0.6 }), gob(5, 0, { dmg: 0.6 }), gob(6, 0.6, { dmg: 0.6 }), gob(7, 0.6, { dmg: 0.6 }), soft(ARCH.imp, 6, 1.5, { dmg: 0.6 })],
    [soft(ARCH.shieldbearer, 6, 0, { dmg: 0.6 }), soft(ARCH.caster, 7, 0.5, { dmg: 0.6 }), gob(2, 1, { dmg: 0.6 }), gob(3, 1, { dmg: 0.6 }), gob(4, 1.5, { dmg: 0.6 })],
  ],
};
/** The arrivals of `beat`'s wave `wave`, or none. */
export const arrivalsOf = (beat: number, wave = 0): readonly Arrival[] => TUT_ARRIVALS[beat]?.[wave] ?? [];
/** How many waves `beat` has (0: nobody comes). */
export const wavesOf = (beat: number): number => TUT_ARRIVALS[beat]?.length ?? 0;
/** Seconds of calm before wave `wave` of `beat` comes by itself. */
export const calmOf = (beat: number, wave: number): number => (beat === TUT_BEAT.test ? (wave ? TUT_TIMES.lull : TUT_TIMES.testCalm) : TUT_TIMES.calm);

/**
 * A brute's slam just landed (enemies.ts): in the Retreat beat, one that hit nobody counts; one that
 * hit a wizard starts the count again.
 */
export function noteSlam(tut: { state: Int32Array }, hitAny: boolean): void {
  if (tut.state[TS.beat] !== TUT_BEAT.retreat || tut.state[TS.lit]) return;
  tut.state[TS.a] = hitAny ? 0 : tut.state[TS.a] + 1;
}

/** An enemy's shot just met a wall a wizard made (effects.ts): the Shield beat counts them. */
export function noteBlocked(tut: { state: Int32Array }): void {
  if (tut.state[TS.beat] !== TUT_BEAT.shield || tut.state[TS.lit]) return;
  tut.state[TS.a]++;
}
