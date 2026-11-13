/**
 * A mode is the set of rules a world runs under besides the core game: how it starts, what drives its encounters,
 * what its seats can hold, and what extra state it keeps. The core step calls these hooks and never asks which
 * mode it is in, so a new mode (a campaign chapter's rules, an arcade mode) is a new Mode, not a branch in step.ts,
 * createWorld or runeMax. The registry is modes.ts; a world holds its mode as `w.mode` (code, not state: it is fixed
 * by the room, like `def`, and never in buffers()).
 */
import type { PlayerInput } from './input';
import type { PartyState, Room, World } from './world';

export type ModeId = 'sandbox' | 'arena' | 'survive' | 'battery' | 'tutorial';

export interface WorldOpts {
  /** False: no practice dummies in a room that would have them. */
  dummies?: boolean;
  room?: Room;
  /** The tutorial starts at this beat (design numbering; the first if it isn't one the build has). */
  tutorialBeat?: number;
  /** Start at this checkpoint of the mode (Mode.checkpoints); unknown ids start at the beginning. */
  checkpoint?: string;
  /** A campaign area: what the party brings from the last one (world.ts PartyState); none, the campaign's start. */
  party?: PartyState;
}

/**
 * A named place to start a chapter from part-way: for the chapter jump while testing, and for saves. Applied by
 * createWorld after the mode's setup, so every peer of a match builds the same world from the same id.
 */
export interface Checkpoint {
  readonly id: string;
  readonly name: string;
  readonly apply: (w: World) => void;
}

/**
 * Possessing a fixture (possess.ts): a wizard steps into something built (the battery's defences; later others) and
 * casts from it. While possessing, the core holds them still, nothing can hurt them, and their hands are put away;
 * this says how the fixture they're in aims and what its casts do.
 */
export interface Possession {
  /** The fixture seat i possesses (an index the mode knows), or -1. */
  of(w: World, i: number): number;
  /** What the seat's buttons do in it (the battery: spells only). */
  buttons(w: World, i: number, held: number): number;
  /** The way its casts face, in turns. */
  face(w: World, i: number): number;
  /** Where its placed spells land. */
  target(w: World, i: number): [number, number];
  /** Its spray: the way it goes and how far. */
  spray(w: World, i: number): { face: number; range: number };
  /** The spray also catches what's this near where it lands (0: nothing more). */
  readonly splash: number;
  /** Its one close blast: Area, and the Weapon's imbued burst too, make a ring this wide on the side it faces. */
  readonly ring: number;
}

/** A mode's say in what enemies do (enemies.ts); each is asked first, and undefined leaves it to the core. */
export interface EnemyRules {
  /** Enemy i holds a spot instead of fighting, battering what's there (the battery's lanes). */
  holdAt?(w: World, i: number): [number, number] | undefined;
  /** Who enemy i goes for, before the nearest wizard (-1: nobody in particular). */
  target?(w: World, i: number): number;
  /** Where an archer stands against target t. */
  standoff?(w: World, i: number, t: number): [number, number] | undefined;
  /** How near an archer comes before it shoots. */
  shotRange?(w: World, i: number): number | undefined;
}

export interface Mode {
  readonly id: ModeId;
  /** A wizard can possess fixtures here (possess.ts). */
  readonly possession?: Possession;
  /** The mode's rules for enemies. */
  readonly enemies?: EnemyRules;
  /** A campaign area: its world has a party (world.ts Party), carried in from the last area and out to the next. */
  readonly campaign?: boolean;
  /** Makes the mode's state pools on a new world, before any seat joins (a joining seat reads runeMax). */
  state?(w: World, opts: WorldOpts): void;
  /** Lays the room out once the seats are in: the encounter's first phase, dummies, fixtures. */
  setup(w: World, opts: WorldOpts): void;
  /** First in a step, before the seats act: the mode's own buttons. */
  press?(w: World, inputs: readonly PlayerInput[]): void;
  /** The encounter: after the seats, before nav and the enemies. */
  director(w: World): void;
  /** Last in a step, so it sees every event of the tick. */
  late?(w: World): void;
  /** Seat i's most runes of element id (never Ice, which has no pool). Default: the config's. */
  runeMax?(w: World, i: number, id: number): number;
  /** Seat i's regen R in runes per second, or undefined for the config's. */
  regen?(w: World, i: number): number | undefined;
  /** The mode's own state pools, appended to buffers() in this order. */
  pools?(w: World): readonly object[];
  /** A body slot was (re)used: clear the mode's per-body columns. */
  onSpawn?(w: World, i: number): void;
  /** Where a chapter can be started from, in order (the first is its beginning). */
  readonly checkpoints?: readonly Checkpoint[];
  /** The last checkpoint this world has passed (what a save records), or undefined for none. */
  reached?(w: World): string | undefined;
}
