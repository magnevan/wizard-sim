/**
 * Every line of text the tutorial shows, keyed by beat (docs/explorations/2026-11-06-tutorial.md).
 * Text isn't state: the sim only knows the beat number and its counters. Keep it all in this one
 * file, so a grammar change (a key, a cast, a mix) is one search away. One line at a time; it names
 * keys, never rules. The 3x5 pixel font has no apostrophe.
 */
import { EL, KIND, MAX_SEATS, TUT_BEAT, TUT_PLACES, TUT_STATE as TS, TUT_TAG, type World } from '@wizard-sim/sim';

export interface BeatText { title: string; prompt: string }

export const BEAT_TEXT: Readonly<Record<number, BeatText>> = {
  [TUT_BEAT.walk]: { title: 'Walk', prompt: 'Hold LMB to walk toward the cursor. Step on the three glowing stones.' },
  [TUT_BEAT.strike]: { title: 'Strike', prompt: 'Tap RMB to strike with your staff.' },
  [TUT_BEAT.heavy]: { title: 'Heavy', prompt: 'Hold RMB, then let go: a Heavy shoves hard. Shove the sack into the ring.' },
  [TUT_BEAT.retreat]: { title: 'Retreat', prompt: 'Shift+LMB hops you back. Get out of the red circle.' },
  [TUT_BEAT.defend]: { title: 'Defend: the training buckler', prompt: 'Hold Space to block. Tap it just as the arrow lands to send it back.' },
  [TUT_BEAT.fire]: { title: 'Fire', prompt: 'Press F to ready Fire, then RMB to cast it. Thick brambles need F F.' },
  [TUT_BEAT.douse]: { title: 'Water', prompt: 'Cross the burning floor to the arch.' },
  [TUT_BEAT.steam]: { title: 'Steam', prompt: 'Wet things will not burn. Q + F together: steam scalds them anyway.' },
  [TUT_BEAT.end]: { title: 'That is the start of the alphabet', prompt: 'F2 shows what any runes you hold will do. The rest is yours to find. Walk into an arch.' },
};

/** Lines that replace the beat's prompt while something is true. */
export const LINES = {
  done: 'Done! Walk through the lit arch.',
  skipped: 'Skipped. Walk through the lit arch.',
  onFire: 'You are on fire! Q, then Space: douse yourself.',
  fainted: 'You fainted. Up you get.',
  fireHint: '(F2 shows what your runes will do)',
  skipStone: 'I know this',
};

/** The end card's arches, in the sim's order (TUT_PLACES.exits): label, and the room each one opens. */
export const EXITS: readonly { label: string; room: string }[] = [
  { label: 'Sanctum', room: 'sanctum' }, { label: 'Survive', room: 'survive' }, { label: 'Arena', room: 'arena' },
];

/** The prompt seat `seat` reads now. */
export function promptFor(w: World, seat: number): string {
  const st = w.tut!.state, beat = st[TS.beat], b = w.bodies;
  if (w.tut!.faint[seat] > 0) return LINES.fainted;
  if (st[TS.lit] === 1) return LINES.done;
  if (st[TS.lit] === 2) return LINES.skipped;
  if (beat === TUT_BEAT.douse && b.kind[seat] === KIND.wizard && b.burn[seat] > 0) return LINES.onFire;
  return BEAT_TEXT[beat]?.prompt ?? '';
}

const count = (w: World, tag: number): number => { let n = 0; for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && w.tut!.tag[i] === tag) n++; return n; };

/** The beat's counter ("2 / 3"), or '' for beats without one. */
export function counterFor(w: World): string {
  const st = w.tut!.state;
  switch (st[TS.beat]) {
    case TUT_BEAT.walk: { let n = 0; for (let k = 0; k < TUT_PLACES.stones.length; k++) if (st[TS.a] & (1 << k)) n++; return `${n} / ${TUT_PLACES.stones.length}`; }
    case TUT_BEAT.strike: case TUT_BEAT.steam: return `${3 - count(w, TUT_TAG.straw)} / 3`;
    case TUT_BEAT.retreat: return `${Math.min(2, st[TS.a])} / 2 dodged`;
    case TUT_BEAT.fire: return `${5 - count(w, TUT_TAG.hedge)} / 5`;
    default: return '';
  }
}

/** Element keys a beat brings in, for the banner ("+ F Fire"). */
export const NEW_RUNES: Readonly<Record<number, readonly number[]>> = { [TUT_BEAT.fire]: [EL.fire], [TUT_BEAT.douse]: [EL.water] };
