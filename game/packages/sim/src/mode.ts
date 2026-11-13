/**
 * A mode is the set of rules a world runs under besides the core game: how it starts, what drives its encounters,
 * what its seats can hold, and what extra state it keeps. The core step calls these hooks and never asks which
 * mode it is in, so a new mode (a campaign chapter's rules, an arcade mode) is a new Mode, not a branch in step.ts,
 * createWorld or runeMax. The registry is modes.ts; a world holds its mode as `w.mode` (code, not state: it is fixed
 * by the room, like `def`, and never in buffers()).
 */
import type { PlayerInput } from './input';
import type { Room, World } from './world';

export type ModeId = 'sandbox' | 'arena' | 'survive' | 'battery' | 'tutorial';

export interface WorldOpts {
  /** False: no practice dummies in a room that would have them. */
  dummies?: boolean;
  room?: Room;
  /** The tutorial starts at this beat (design numbering; the first if it isn't one the build has). */
  tutorialBeat?: number;
}

export interface Mode {
  readonly id: ModeId;
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
}
