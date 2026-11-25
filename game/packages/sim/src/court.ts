/**
 * The courtyard (docs/campaign/01-opening): the academy's central court with the great armillary, the opening's hub.
 * Every road starts and ends here. Its map is the kit scene tools/kit/scenes/court.scene.json, the one the map editor
 * edits: tools/kit/room.py exports the room the sim walks on (game/content/generated/rooms/court.room.json), and
 * `npm run content:build` folds it into rooms.gen.ts. The LDtk Court level is no longer built.
 *
 * For now it is only its gates: walking into one takes the party on. gate-yard is the west road between the gate piers,
 * on to the drill yard; gate-battery the east road's end, on to the battery. The scene's gate-north and gate-sea lead
 * nowhere yet. The briefing at the armillary (beat 1) and the gates to the other stops come later.
 */
import { len } from './geom';
import { markerOf } from './room';
import { KIND, MAX_SEATS, type World } from './world';

export const COURT = {
  /** How near a gate's marker a wizard has to be for the party to go through it. */
  reach: 3,
} as const;

/**
 * A room's leaveTo from its gates: [marker id, the room it leads to]. The party goes the moment a wizard stands within
 * COURT.reach of a gate's marker (the first gate in the list wins). Shared by the court and the infirmary.
 */
export const gatesLeaveTo = (gates: readonly (readonly [string, string])[]) => (w: World): string | undefined => {
  for (const [id, to] of gates) {
    const m = markerOf(w.def, id);
    if (!m) continue;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!w.seats.active[i] || w.bodies.kind[i] !== KIND.wizard) continue;
      if (len(w.bodies.x[i] - m.x, w.bodies.y[i] - m.y) < COURT.reach) return to;
    }
  }
  return undefined;
};

/** Where the party is going now from the court: the first gate someone stands in, or undefined. */
export const courtLeaveTo = gatesLeaveTo([['gate-yard', 'yard'], ['gate-battery', 'battery']]);
