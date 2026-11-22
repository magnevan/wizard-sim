/**
 * The infirmary (docs/campaign/01-opening): just outside the academy's main gate on the battery road, where the wounded
 * wait under tents round a failing well. Its level is written from its plan (tools/place-plans/plans/inf-d.py, by
 * tools/place-plans/to_ldtk.py).
 *
 * For now it is only its gates: gate-court back to the courtyard's main gate, gate-battery on along the road. The fix at
 * the well, the healing and the soft block on the east road until the well is lit come later.
 */
import { gatesLeaveTo } from './court';

/** Where the party is going now: the first gate someone stands in, or undefined. */
export const infirmaryLeaveTo = gatesLeaveTo([['gate-court', 'court'], ['gate-battery', 'battery']]);
