/**
 * The effects are drawn on one layer over the actors, so on their own they ignore what stands in
 * front of them. This is the rule for how much of a standing thing's picture hides one of them.
 */

/** The sort key a thing standing at ground row y gets: the same order the sprites are drawn in. */
export const depthOf = (y: number): number => Math.round(y) * 128 + 50;

/**
 * How many rows of a picture, counted from its top, hide an effect.
 * Something sorted in front of the effect hides it entirely. An effect that spreads over the ground
 * (`spread`, a nova or a floor) can also reach past something sorted behind its centre; there, only
 * the rows above the thing's foot are sure to be behind it, so the bottom `chest` rows stay visible.
 */
export function rowsHidden(height: number, y: number, footY: number, solidZ: number, z: number, reachY: number, spread: boolean, chest: number): number {
  if (solidZ > z) return height;
  if (!spread || footY < reachY) return 0;
  return Math.max(0, Math.min(height, Math.floor(footY - chest - y)));
}
