/**
 * The battery's prompts: the keys for what each step of the lesson asks of you (sim/src/battery-waves.ts has the
 * steps), drawn as pictures (key-caps.ts). No sentences: the user, 2026-11-12, "it's unintuitive to read text as
 * you're entering a battle... the player can intuit that". The one line kept is the user's own, at the infusion.
 */
import { BSTEP } from '@wizard-sim/sim';
import type { Token } from './key-caps';

export interface BatteryPrompt { keys: Token[]; head?: string }

const F: Token = { key: 'fire' };

/** For a seat away from the defences while the lesson is on: stand in a glyph circle, press X. */
export const STEP_UP: BatteryPrompt = { keys: [{ key: 'circle' }, 'then', { key: 'x' }] };

/** For a seat driving a defence, by step. A step with none shows nothing. */
export const DRIVING: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.ring]: { keys: [F, 'then', { key: 'shift' }, 'plus', { key: 'rmb' }] },
  [BSTEP.spray]: { keys: [F, 'then', { key: 'rmb', hold: true }] },
  [BSTEP.place]: { keys: [F, 'then', { key: 'shift', hold: true }, 'plus', { key: 'rmb', hold: true }] },
  [BSTEP.brute]: { keys: [F, F, F, 'then', { key: 'rmb', hold: true }] },
};

/** For every seat once the well has run dry, by step (beats 6 and 7). The head is the user's line (r2-battery-transition). */
export const OWN_FIRE: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.hands]: { head: 'You\'ve learned to channel fire', keys: [F, 'then', { key: 'rmb' }] },
};
