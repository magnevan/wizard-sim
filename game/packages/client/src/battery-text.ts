/**
 * The battery's prompts: what the lesson asks of you at each step, and the keys (sim/src/battery-waves.ts has the
 * steps). Plain instructions only; the story's words are the user's to write (as tutorial-text.ts).
 */
import { BSTEP } from '@wizard-sim/sim';

export interface BatteryPrompt { head: string; line: string; keys: string }

/** For a seat away from the defences. */
export const STEP_UP: BatteryPrompt = { head: 'The defences', line: 'Goblins are breaking the stakes. Step up to a defence.', keys: 'X at its pedestal' };

/** For a seat driving a defence, by step. A step with none shows nothing. */
export const DRIVING: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.ring]: { head: 'Fire ring', line: 'They broke through. Clear them from the wall with a ring of fire.', keys: 'F, then Shift + right click' },
  [BSTEP.spray]: { head: 'Flamethrower', line: 'More across the field. Burn them before they reach the wall.', keys: 'F, then hold right click where it should land' },
  [BSTEP.place]: { head: 'Place', line: 'Archers, out of the flame\'s reach. Drop fire on them.', keys: 'F, then hold Shift + right click, aim, let go' },
  [BSTEP.brute]: { head: 'More fire', line: 'Something heavy. Press F more times: each Fire rune adds damage.', keys: 'F F F, then hold right click' },
  [BSTEP.free]: { head: 'The well is failing', line: 'The pool refills slower and slower. Make each rune count.', keys: '' },
};

/** For every seat once the well has run dry, by step (beats 6 and 7). The head is the user's line (r2-battery-transition). */
export const OWN_FIRE: Partial<Record<number, BatteryPrompt>> = {
  [BSTEP.dry]: { head: 'The well ran dry', line: '', keys: '' },
  [BSTEP.hands]: { head: 'You\'ve learned to channel fire', line: 'They are coming through the gate. The fire is yours now: one rune of it.', keys: 'F, then right click' },
};
