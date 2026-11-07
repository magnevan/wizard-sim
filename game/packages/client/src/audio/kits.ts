/**
 * An element's own sound kit: one small set of clips, played in a different arrangement for each thing
 * the element does, in place of the element-times-shape mix in recipes.ts. A held flame and a ball of
 * flame are not the same noise at two lengths: they need their own starts, bodies and ends, and a kit
 * says so. The clips are shared, so a kit is about a dozen files, not one recording per spell.
 *
 * A kit takes over for spells its element leads. Nothing uses one until useKit says so: on the dev server
 * that's the local baseline (baseline.ts) and the Sound Lab (lab.ts). An element's kit joins the public
 * game once its own clips are approved.
 */
import type { ElementName, Layer, Plan } from './recipes';
import { pick, type Rand } from './variation';

export interface KitLayer {
  /** One of these, at random. */
  clips: readonly string[];
  gain: number;
  /** Seconds after the sound's start. */
  at?: number;
  /** Random pitch either way, in cents. */
  cents?: number;
  loop?: boolean;
  /** Playback rate, and where it glides to. */
  rate?: number;
  glide?: number;
  attack?: number;
  release?: number;
}

/** What a kit can cover. Anything it leaves out falls through to the element's stage 1 sound. */
export interface Kit {
  /** A held spell catching, then what it sounds like held, then its dying breath. */
  start?: readonly KitLayer[];
  hold?: readonly KitLayer[];
  stop?: readonly KitLayer[];
  /** A beam catching, and held. */
  beamStart?: readonly KitLayer[];
  beam?: readonly KitLayer[];
  /** A quick shove of it, at arm's length. */
  force?: readonly KitLayer[];
  /** Something thrown leaving the hand. */
  launch?: readonly KitLayer[];
  /** Going off all around you. */
  burst?: readonly KitLayer[];
  /** Set down at a distance. */
  place?: readonly KitLayer[];
  /** Raised as a barrier. */
  wall?: readonly KitLayer[];
  /** Cast on yourself. */
  self?: readonly KitLayer[];
  /** Landing on something. */
  land?: readonly KitLayer[];
  /** A body with this on it. */
  status?: readonly KitLayer[];
  /** The floor, burning or otherwise covered in it. */
  ground?: readonly KitLayer[];
  /** Building up in the hand, and in the air on its way. Empty means silent. */
  charge?: readonly KitLayer[];
  flight?: readonly KitLayer[];
  /** A device taken back. */
  dismiss?: readonly KitLayer[];
  /**
   * One spell's own cast, in place of its shape's, by the sim's shape: `lens`, or `aura+lightning` for that
   * one with Lightning in it. A spell is its own thing on screen, so it wants a sound cut to what you see.
   * Empty means silent, for a spell with no sound of its own yet that shouldn't borrow a wrong one.
   * `hold:aura+fire` is what plays for as long as that aura lasts, after its cast. `queue`, in Sigil's
   * kit, is the tick of any rune being queued, pitched by its element.
   */
  spells?: Readonly<Record<string, readonly KitLayer[]>>;
}

const FIRE_PUFFS = ['fire-puff-1', 'fire-puff-2', 'fire-puff-3'];

/** Fire, as it stands in the lab. */
export const FIRE_KIT: Required<Pick<Kit, 'start' | 'hold' | 'stop' | 'beam' | 'launch' | 'burst' | 'land' | 'status' | 'ground' | 'charge' | 'flight'>> = {
  start: [{ clips: ['fire-catch'], gain: 0.9, cents: 100 }],
  hold: [{ clips: ['fire-jet'], gain: 0.95, loop: true, attack: 0.05 }, { clips: ['fire-jet-sub'], gain: 0.7, loop: true, attack: 0.08 }],
  stop: [{ clips: ['fire-die-1', 'fire-die-2'], gain: 0.5, cents: 150 }],
  beam: [{ clips: ['fire-jet'], gain: 0.85, loop: true, attack: 0.04 }],
  launch: [{ clips: ['fire-launch'], gain: 0.75, cents: 100 }, { clips: ['fire-rush'], gain: 0.5, cents: 100 }, { clips: FIRE_PUFFS, gain: 0.5, cents: 200 }, { clips: ['fire-catch'], gain: 0.8, cents: 100 }],
  burst: [{ clips: ['fire-bloom-1', 'fire-bloom-2'], gain: 0.85, cents: 100 }, { clips: FIRE_PUFFS, gain: 0.6, cents: 200 }, { clips: ['fire-thud'], gain: 0.8, at: 0.05, cents: 100 }],
  land: [{ clips: FIRE_PUFFS, gain: 0.85, cents: 200 }],
  status: [{ clips: ['fire-lick'], gain: 0.7, loop: true, attack: 0.3, release: 0.3 }],
  ground: [{ clips: ['fire-lick'], gain: 0.45, rate: 1.15, loop: true, attack: 0.3, release: 0.3 }, { clips: ['fire-crackle'], gain: 0.3, rate: 0.8, loop: true, attack: 0.3, release: 0.3 }],
  charge: [{ clips: ['fire-jet'], gain: 0.5, rate: 0.7, glide: 1.25, loop: true, attack: 0.15 }],
  flight: [{ clips: ['fire-jet'], gain: 0.28, rate: 1.2, loop: true, attack: 0.05 }],
};

/** Every layer in a kit. */
export const layersOf = (kit: Kit): readonly KitLayer[] => {
  const { spells, ...roles } = kit;
  return [...Object.values(roles), ...Object.values(spells ?? {})].flat();
};

const live: Partial<Record<ElementName, Kit>> = {};

/** Gives an element a kit, or takes it away again. */
export function useKit(el: ElementName, kit: Kit | null): void {
  if (kit) live[el] = kit; else delete live[el];
}
export const kitOf = (el: ElementName | undefined): Kit | undefined => (el ? live[el] : undefined);

/** Layers to a plan. `rate` and `gain` are the spell's own, from its rune count. */
export function kitPlan(name: string, ls: readonly KitLayer[], rand: Rand, rate = 1, gain = 1, wet = 0): Plan {
  const layers = ls.map((l): Layer => ({
    clip: pick(l.clips, rand),
    gain: l.gain * gain,
    rate: rate * (l.rate ?? 1) * Math.pow(2, ((rand() * 2 - 1) * (l.cents ?? 0)) / 1200),
    rateTo: l.glide ? rate * l.glide : undefined,
    at: l.at ?? 0,
    attack: l.attack ?? 0.002,
    hold: 0,
    release: l.release ?? 0.1,
    loop: l.loop,
  }));
  return { name, layers, wet };
}
