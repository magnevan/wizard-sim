/**
 * The battery's prompts: the keys for what each step of the lesson asks of you (sim/src/battery-waves.ts has the
 * steps), drawn as pictures (key-caps.ts), with a few words over them for what each is for. No sentences: the user,
 * 2026-11-12, "it's unintuitive to read text as you're entering a battle". The infusion's line is the user's own.
 */
import { BSTEP } from '@wizard-sim/sim';
import type { Token } from './key-caps';

export interface BatteryPrompt { keys: Token[]; head?: string }

const F: Token = { key: 'fire' };

/** For a seat away from the defences while the lesson is on: stand in a glyph circle, press X. */
export const STEP_UP: BatteryPrompt = { head: 'Possess a defence', keys: [{ key: 'circle' }, 'then', { key: 'x' }] };

/**
 * For a seat driving a defence, by step. A step with none shows nothing. Each has a few words over its keys for what
 * the cast is for (the user, 2026-11-12: "very succinct tutorial instructions to give a little context").
 */
export const DRIVING: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.ring]: { head: 'Fire ring: clear the wall', keys: [F, 'then', { key: 'shift' }, 'plus', { key: 'rmb' }] },
  [BSTEP.spray]: { head: 'Flamethrower', keys: [F, 'then', { key: 'rmb', hold: true }] },
  [BSTEP.place]: { head: 'Drop fire on the archers', keys: [F, 'then', { key: 'shift', hold: true }, 'plus', { key: 'rmb', hold: true }] },
  [BSTEP.brute]: { head: 'More runes, more fire', keys: [F, F, F, 'then', { key: 'rmb', hold: true }] },
};

/**
 * For every seat once the well has run dry, by step (beats 6 and 7, and the repair). The infusion's head is the user's
 * line (r2-battery-transition); the repair's is theirs too ("press X to stabilize", the opening's settled notes).
 */
export const OWN_FIRE: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.hands]: { head: 'You\'ve learned to channel fire', keys: [F, 'then', { key: 'rmb' }] },
  [BSTEP.after]: { head: 'Stabilize the well', keys: [{ key: 'x' }] },
};
