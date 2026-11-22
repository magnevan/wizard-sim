/**
 * The courtyard (docs/campaign/01-opening): the academy's central court with the great armillary, the opening's hub.
 * Every road starts and ends here. Its level: tools/segments/01-opening/court-level.py.
 *
 * For now it is only its gates: walking into one takes the party on. gate-yard is the archway through the west range
 * to the drill yard; gate-battery the east gate onto the battery road. The briefing at the armillary (beat 1) and the
 * gates to the other stops come later.
 */
import { len } from './geom';
import { markerOf } from './room';
import { KIND, MAX_SEATS, type World } from './world';

export const COURT = {
  /** How near a gate's marker a wizard has to be for the party to go through it. */
  reach: 3,
} as const;

/** The gates and where each leads. */
const GATES: readonly (readonly [string, string])[] = [['gate-yard', 'yard'], ['gate-battery', 'battery']];

/** Where the party is going now: the first gate someone stands in, or undefined. */
export function courtLeaveTo(w: World): string | undefined {
  for (const [id, to] of GATES) {
    const m = markerOf(w.def, id);
    if (!m) continue;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!w.seats.active[i] || w.bodies.kind[i] !== KIND.wizard) continue;
      if (len(w.bodies.x[i] - m.x, w.bodies.y[i] - m.y) < COURT.reach) return to;
    }
  }
  return undefined;
}
