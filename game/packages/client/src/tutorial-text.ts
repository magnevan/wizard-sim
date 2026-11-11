/**
 * Every word the tutorial shows the player, in one place (docs/explorations/2026-11-06-tutorial.md,
 * pass 2: 2026-11-06-tutorial-pass-2.md). The sim only knows the beat number and its counters; this
 * file turns them into text, and tutorial-view.ts only draws what it's given.
 *
 * The lines are deliberately plain placeholders: a story wrapper (the setting, a voice) is the
 * user's to write, and it replaces this file's strings, not its shape. Per beat there's a title,
 * the prompt lines (one or two short lines naming keys, never rules), and optionally the line shown
 * once the beat is done. The shared lines (the calm, the stones, fainting) and the HUD's own words
 * are below the beats.
 *
 * The 3x5 pixel font (art/px.ts FONT) has plain signs only: no curly quotes.
 */
import { KIND, MAX_SEATS, TUT_BEAT, TUT_PLACES, TUT_STATE as TS, TUT_TAG, wavesOf, type World } from '@wizard-sim/sim';

export interface BeatText {
  /** The beat's name: the big banner as it begins (up to any ':'), and the head of the prompt box. */
  title: string;
  /** What to do: one or two short lines. */
  lines: readonly string[];
  /** Shown once the beat is done, instead of LINES.done. */
  done?: string;
}

export const BEAT_TEXT: Readonly<Record<number, BeatText>> = {
  // chapter 1: your hands
  [TUT_BEAT.walk]: { title: 'Walk', lines: ['Hold LMB to walk toward the cursor.', 'Step on the three glowing stones.'] },
  [TUT_BEAT.strike]: { title: 'Strike', lines: ['Tap RMB to strike with your staff.'] },
  [TUT_BEAT.heavy]: { title: 'Heavy', lines: ['Hold RMB, then let go: a Heavy shoves hard.', 'Shove the sack into the ring.'] },
  [TUT_BEAT.retreat]: { title: 'Retreat', lines: ['Shift+LMB hops you back.', 'Get out of the circle before the slam lands.'] },
  [TUT_BEAT.defend]: { title: 'Defend: the training buckler', lines: ['Hold Space to block.', 'Tap it just as the arrow lands to send it back.'] },
  [TUT_BEAT.hands]: { title: 'Hands test', lines: ['Shift+RMB sweeps all the way round you.', 'Let them come close.'] },
  // chapter 2: one rune at a time
  [TUT_BEAT.fire]: { title: 'Fire', lines: ['Press F to ready Fire, then RMB to cast it.', 'Thick brambles need F F. (F1 shows what your runes will do.)'] },
  [TUT_BEAT.douse]: { title: 'Water', lines: ['Cross the burning floor to the arch.'] },
  [TUT_BEAT.steam]: { title: 'Steam', lines: ['Wet things will not burn.', 'Q + F together: steam scalds them anyway.'] },
  [TUT_BEAT.cold]: { title: 'Cold', lines: ['R is Cold. R, then tap Shift+RMB: a frost ring round you.', 'Chill all five.'] },
  [TUT_BEAT.cancel]: { title: 'Opposites', lines: ['Fire and Cold cancel each other out.', 'Queue F, then R: both are gone, and the runes come back.'] },
  [TUT_BEAT.lightning]: { title: 'Lightning', lines: ['A is Lightning: wet things take double.', 'Q, then hold Shift+RMB: rain on them. Then A and RMB.'] },
  [TUT_BEAT.shatter]: { title: 'Freeze and shatter', lines: ['Q + R, then RMB: ice freezes wet things.', 'G is Earth. G, then RMB: a rock shatters the frozen.'] },
  [TUT_BEAT.fireball]: { title: 'The strongest leads', lines: ['G + F, then RMB: Earth gives the shape, Fire rides along.', 'Burn the bramble across the pit.'] },
  [TUT_BEAT.life]: { title: 'Life', lines: ['W is Life. It heals whatever it touches, friend or foe.', 'Heal the dummy. Do not wake the goblin.'] },
  [TUT_BEAT.shield]: {
    title: 'Shield', lines: ['E is Shield. E, then hold Shift+RMB: a wall arrows can not cross.', 'Drag while holding to draw the wall where you like.'],
    done: 'E, then Shift+LMB conjures a buckler like your training one.',
  },
  [TUT_BEAT.arcane]: { title: 'Arcane', lines: ['S is Arcane. S, then hold RMB: a beam that reaches far.'] },
  [TUT_BEAT.sigil]: { title: 'Sigil', lines: ['D is Sigil: it makes things that last.', 'D + F, then Shift+LMB: a flame sword. D + F, then RMB: a turret.'] },
  // chapter 3
  [TUT_BEAT.test]: { title: 'The test', lines: ['Two waves, everything you have.', 'Build before they come: walls, turrets.'] },
  [TUT_BEAT.end]: { title: 'That is the alphabet', lines: ['F1 shows what any runes you hold will do. The rest is yours to find.', 'Walk into an arch.'] },
};

/** Lines that replace a beat's prompt while something is true, and the HUD's own words. */
export const LINES = {
  done: 'Done! Walk through the lit arch.',
  skipped: 'Skipped. Walk through the lit arch.',
  onFire: 'You are on fire! Q, then Space: douse yourself.',
  fainted: 'You fainted. Up you get.',
  /** The stones' labels. */
  skipStone: 'I know this',
  readyStone: 'Ready',
  /** Drifting up off the sleeping goblin. */
  asleep: 'Z',
  /** The calm before enemies come: under the prompt. */
  calm: 'Step on the ready stone when you are.',
  coming: (s: number) => `Coming in ${s}...`,
  here: 'Here they come.',
  nextWave: (s: number) => `Next wave in ${s}. Build now.`,
  /** The prompt box's head, the end card's head, the banner at the end, the lit arch's label. */
  step: (n: number, of: number, title: string) => `Step ${n} of ${of}: ${title}`,
  endHead: 'The end',
  endBanner: 'Well done',
  arch: 'Next',
  /** Counter suffixes. */
  dodged: 'dodged', blocked: 'blocked', chilled: 'chilled', shattered: 'shattered', health: 'health', wave: 'wave',
};

/** The end card's arches, in the sim's order (TUT_PLACES.exits): label, and the room each one opens. */
export const EXITS: readonly { label: string; room: string }[] = [
  { label: 'Sanctum', room: 'sanctum' }, { label: 'Survive', room: 'survive' }, { label: 'Arena', room: 'arena' },
];

/** The prompt lines seat `seat` reads now. */
export function promptFor(w: World, seat: number): readonly string[] {
  const st = w.tut!.state, beat = st[TS.beat], b = w.bodies;
  if (w.tut!.faint[seat] > 0) return [LINES.fainted];
  if (st[TS.lit] === 1) return [BEAT_TEXT[beat]?.done ?? LINES.done];
  if (st[TS.lit] === 2) return [LINES.skipped];
  if (beat === TUT_BEAT.douse && b.kind[seat] === KIND.wizard && b.burn[seat] > 0) return [LINES.onFire];
  return BEAT_TEXT[beat]?.lines ?? [];
}

const count = (w: World, ...tags: number[]): number => {
  let n = 0;
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if ((w.bodies.kind[i] === KIND.enemy || w.bodies.kind[i] === KIND.dummy) && tags.includes(w.tut!.tag[i])) n++;
  return n;
};

/** The beat's counter ("2 / 3"), or '' for beats without one. */
export function counterFor(w: World): string {
  const st = w.tut!.state, b = w.bodies;
  switch (st[TS.beat]) {
    case TUT_BEAT.walk: { let n = 0; for (let k = 0; k < TUT_PLACES.stones.length; k++) if (st[TS.a] & (1 << k)) n++; return `${n} / ${TUT_PLACES.stones.length}`; }
    case TUT_BEAT.strike: case TUT_BEAT.steam: return `${3 - count(w, TUT_TAG.straw)} / 3`;
    case TUT_BEAT.lightning: return `${TUT_PLACES.cluster.length - count(w, TUT_TAG.straw)} / ${TUT_PLACES.cluster.length}`;
    case TUT_BEAT.hands: return st[TS.go] ? `${4 - count(w, TUT_TAG.goblin)} / 4` : '';
    case TUT_BEAT.retreat: return `${Math.min(2, st[TS.a])} / 2 ${LINES.dodged}`;
    case TUT_BEAT.fire: return `${TUT_PLACES.hedgeN - count(w, TUT_TAG.hedge)} / ${TUT_PLACES.hedgeN}`;
    case TUT_BEAT.cold: return `${Math.min(5, st[TS.a])} / 5 ${LINES.chilled}`;
    case TUT_BEAT.shatter: return `${Math.min(2, st[TS.a])} / 2 ${LINES.shattered}`;
    case TUT_BEAT.shield: return `${Math.min(3, st[TS.a])} / 3 ${LINES.blocked}`;
    case TUT_BEAT.arcane: return st[TS.go] ? `${2 - count(w, TUT_TAG.foe)} / 2` : '';
    case TUT_BEAT.sigil: return st[TS.go] ? `${6 - count(w, TUT_TAG.goblin)} / 6` : '';
    case TUT_BEAT.life: {
      for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.dummy && w.tut!.tag[i] === TUT_TAG.patient) return `${Math.round((100 * b.hp[i]) / b.maxHp[i])}% ${LINES.health}`;
      return '';
    }
    case TUT_BEAT.test: return `${LINES.wave} ${st[TS.wave] + 1} / ${wavesOf(TUT_BEAT.test)}`;
    default: return '';
  }
}
