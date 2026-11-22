/**
 * The ring has no button of its own since it merged into the burst (2026-11-22): it's the Weapon cast released with the
 * cursor on you, or for Shield and Sigil (whose Weapon cast conjures) a Place released on you. The balance tools cast a
 * ring with this button and aim 0.
 */
import { BTN } from '../packages/sim/src';

export const ringBtn = (queue: readonly string[]): number => (queue.some((e) => e === 'shield' || e === 'sigil') ? BTN.area : BTN.weapon);
