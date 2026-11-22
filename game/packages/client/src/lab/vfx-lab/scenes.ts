/**
 * The VFX Lab's scenes, as data: who stands where, what they cast, what stands round the target, the light. A new
 * scene is one entry here. Positions are in the view's own space (iso-world.ts: u runs right on the screen, v down
 * it; one unit is PPU art px across and PPU * FY down), measured from the middle of the Sanctum, so a scene reads the
 * same way on screen whatever the 45-degree turn does to the world.
 *
 * Wizard 0 casts the spell in the URL; the others cast their own `spell` (a recipe as `?spell=` takes it, with its form
 * after a slash: `water,cold/force`), or nothing. `?others=` replaces those recipes, in order, joined by `;`.
 */
import type { Room } from '@wizard-sim/sim';

export type V = readonly [number, number];
export interface LabWizard {
  at: V;
  /** Where this wizard aims; the scene's target by default. */
  aim?: V;
  /** Wizards after the first: what they cast (`els/form`), or nothing. */
  spell?: string;
}
export interface SceneDef {
  blurb: string;
  room: Room;
  /** A lighting mood instead of the room's (art/lighting.ts MOODS); `?mood=` overrides it. */
  mood?: string;
  wizards: readonly LabWizard[];
  /** Where wizard 0 aims. */
  target: V;
  dummies?: readonly V[];
  /** Enemies, held where they stand (sim/src/dev.ts devStage: blows still knock them about and kill them). */
  enemies?: readonly { arch: 'swarmer' | 'brute' | 'shieldbearer' | 'caster' | 'grabber' | 'imp'; at: V }[];
  /** The middle of the frame. */
  look: V;
}

/** A ring of n spots round c, radius r (view units), starting at angle a0 (turns). */
const ring = (c: V, r: number, n: number, a0 = 0): V[] =>
  Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((a0 + k / n) * Math.PI * 2), c[1] + r * Math.sin((a0 + k / n) * Math.PI * 2) * 0.8] as const);

const T: V = [2.5, 0];

export const SCENES: Readonly<Record<string, SceneDef>> = {
  empty: {
    blurb: 'The caster and one practice dummy.',
    room: 'sanctum', wizards: [{ at: [-2.5, 0] }], target: T, dummies: [T], look: [0, -0.6],
  },
  crowd: {
    blurb: 'Ten goblins and a brute round the target, held where they stand.',
    room: 'sanctum', wizards: [{ at: [-3, 0] }], target: T, look: [0.3, -0.6],
    enemies: [
      { arch: 'brute', at: [T[0] + 0.4, T[1] - 0.2] },
      ...ring(T, 1.5, 5, 0.1).map((at) => ({ arch: 'swarmer' as const, at })),
      ...ring([T[0] + 0.6, T[1]], 2.9, 5, 0.2).map((at) => ({ arch: 'swarmer' as const, at })),
    ],
  },
  dark: {
    blurb: 'The empty scene at night (the lighting mood night: spell light carries it).',
    room: 'sanctum', mood: 'night', wizards: [{ at: [-2.5, 0] }], target: T, dummies: [T, [T[0] + 1.2, T[1] - 1.4]], look: [0, -0.6],
  },
  coop: {
    blurb: 'Four wizards casting at once into one group, each a different spell.',
    room: 'sanctum', target: [0, 0], look: [0, -0.8],
    wizards: [
      { at: [-4.5, 0.8] },
      { at: [-2.5, -4.5], spell: 'water/force' },
      { at: [4.5, -3], spell: 'lightning/force' },
      { at: [3.5, 4], spell: 'earth,fire/force' },
    ],
    dummies: [[0, 0]],
    enemies: [{ arch: 'swarmer', at: [1, -0.8] }, { arch: 'swarmer', at: [-0.9, 1] }, { arch: 'swarmer', at: [0.8, 1.2] }],
  },
  ally: {
    blurb: 'An ally wizard stands at the target, beside a dummy (friendly fire is on).',
    room: 'sanctum', wizards: [{ at: [-2.5, 0] }, { at: [2.3, 0.2] }], target: [2.3, 0.2], dummies: [[3.2, -0.5]], look: [0.2, -0.6],
  },
};
