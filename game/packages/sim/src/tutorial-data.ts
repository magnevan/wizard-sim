/**
 * The tutorial's constant data (docs/explorations/2026-11-06-tutorial.md): which beats the prototype
 * runs, each beat's rune pools, and where things stand in the chamber. No state and no sim imports
 * beyond the element ids, so world.ts (runeMax) can read the pools without a cycle. The logic is in
 * tutorial.ts; the prompt text is the client's (packages/client/src/tutorial-text.ts).
 *
 * Beats keep the design's numbers (1-19), so the full build slots in without renumbering. The first
 * prototype runs 1-5 and 7-9 (the hands test, 6, is deferred), then the end card (TUT_END).
 */
import { EL, N_EL } from './elements';

export const TUT_BEAT = { walk: 1, strike: 2, heavy: 3, retreat: 4, defend: 5, fire: 7, douse: 8, steam: 9, end: 20 } as const;
/** The beats in order, the end card last. */
export const TUT_ORDER: readonly number[] = [1, 2, 3, 4, 5, 7, 8, 9, 20];
export const TUT_END = TUT_BEAT.end;
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
} as const;

/** What a body is to the tutorial (w.tut.tag). */
export const TAG = { none: 0, straw: 1, sack: 2, hedge: 3, bramble: 4, foe: 5 } as const;

/** Each beat's rune pools: max runes per element id (index = id; 0 unused). Locked = 0. */
const pools = (o: Partial<Record<number, number>>): readonly number[] => {
  const a: number[] = new Array(N_EL + 1).fill(0);
  for (const k of Object.keys(o)) a[Number(k)] = o[Number(k)]!;
  return a;
};
const ALL = pools({ [EL.water]: 2, [EL.life]: 2, [EL.shield]: 2, [EL.cold]: 2, [EL.lightning]: 2, [EL.arcane]: 2, [EL.sigil]: 1, [EL.fire]: 2, [EL.earth]: 2 });
export const TUT_POOLS: Readonly<Record<number, readonly number[]>> = {
  1: pools({}), 2: pools({}), 3: pools({}), 4: pools({}), 5: pools({}), 6: pools({}),
  7: pools({ [EL.fire]: 2 }),
  8: pools({ [EL.fire]: 2, [EL.water]: 1 }),
  9: pools({ [EL.fire]: 2, [EL.water]: 2 }),
  20: ALL,
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
  /** Beat 1's floor stones. */
  stones: [[-4, -4.5], [1.5, 4.5], [6, -2.5]] as const, stoneR: 0.75,
  /** Beat 3: where the sack starts, and the ring to shove it into. */
  sack: [-1.5, 0] as const, ring: [2.2, 0] as const, ringR: 1.15,
  /** Beat 7: the hedge line and the thick bramble. */
  hedgeX: 5.5, hedgeGap: 1.6, hedgeN: 3, thick: [-1, -5] as const,
  /** Beat 8: the burning band you cross (x from, x to). */
  fireBand: [0, 2.2] as const,
  /** Beat 9: the rain over the pen. */
  pen: [4, 0] as const, penR: 2.3,
  /** The end card's three arches (Sanctum, Survive, Arena). */
  exits: [[-1, -1.5], [4, -1.5], [9, -1.5]] as const, exitR: 1, exitTime: 1,
} as const;

/** Seconds a wizard lies fainted, and the fade between beats. */
export const TUT_TIMES = { faint: 1.5, fade: 0.6 } as const;
/** The training buckler's guard HP, times a Mirror buckler's. */
export const TUT_BUCKLER_HP = 4;

/**
 * A brute's slam just landed (enemies.ts): in the Retreat beat, one that hit nobody counts; one that
 * hit a wizard starts the count again.
 */
export function noteSlam(tut: { state: Int32Array }, hitAny: boolean): void {
  if (tut.state[TS.beat] !== TUT_BEAT.retreat || tut.state[TS.lit]) return;
  tut.state[TS.a] = hitAny ? 0 : tut.state[TS.a] + 1;
}
