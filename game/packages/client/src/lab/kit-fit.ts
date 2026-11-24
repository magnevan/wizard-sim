/** Pure fitting rules for the kit renderer (kit-render.ts), kept apart so they can be tested without three.js. */

/** The made balustrade's module length (u) and how far a run may reach into a pier at each end (hidden in its solid). */
export const RAIL_MOD = 1.45, RAIL_HIDE = 0.25;

/**
 * The made balustrade along a span between two piers' faces, at its own proportions as near as can be: n whole
 * modules end to end, `shown` long (the span, plus up to RAIL_HIDE into each pier), each stretched by sx. Picks the
 * count whose stretch is least. A chamfer's 0.86 u span used to squash one module to 60%; now it is 94%.
 */
export function railFit(span: number): { n: number; shown: number; sx: number } {
  let best = { n: 1, shown: span, sx: span / RAIL_MOD };
  for (let n = 1; n <= 4; n++) {
    const shown = Math.min(Math.max(n * RAIL_MOD, span), span + 2 * RAIL_HIDE), sx = shown / (n * RAIL_MOD);
    if (Math.abs(Math.log(sx)) < Math.abs(Math.log(best.sx)) - 1e-9) best = { n, shown, sx };
  }
  return best;
}
