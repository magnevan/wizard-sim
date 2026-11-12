/**
 * Element ids and element-count vectors. In state an element is a byte (rules ALL order + 1,
 * 0 = none), and a spell's elements are N_EL counts in a Uint8Array slice, so effects can carry
 * their payload in typed arrays.
 *
 * Ids 1..9 are the keyed elements (rules.BASE), each with a rune pool. Id 10 is Ice, Water + Cold
 * combined into one queue rune: it has no key and its pool's max is always 0 (KEYED_EL).
 */
import { rules, type Element } from '@wizard-sim/rules';

export const N_EL = 10;
/** The keyed elements: ids 1..KEYED_EL have keys and pools. */
export const KEYED_EL = 9;
export const EL = {
  water: 1, life: 2, shield: 3, cold: 4, lightning: 5, arcane: 6, sigil: 7, fire: 8, earth: 9, ice: 10,
} as const satisfies Record<Element, number>;

export const elementName = (id: number): Element => rules.ALL[id - 1];
export const elementId = (el: Element): number => EL[el];

// The ids must match the rules' ALL order (they index rune pools and replays).
for (const el of rules.ALL) if (rules.ALL.indexOf(el) + 1 !== EL[el]) throw new Error('EL ids out of step with rules.ALL');
if (rules.ALL.length !== N_EL || rules.BASE.length !== KEYED_EL) throw new Error('N_EL out of step with rules.ALL');

/** How many runes of keyed pool `id` the counts at slot `at` cost: each Ice costs a Water and a Cold. 0 for Ice itself. */
export function poolCost(flat: Uint8Array, at: number, id: number): number {
  if (id > KEYED_EL) return 0;
  const n = flat[at * N_EL + id - 1];
  return id === EL.water || id === EL.cold ? n + flat[at * N_EL + EL.ice - 1] : n;
}

/** Counts of each element (index = id - 1) in a queue of names. */
export function countsOf(queue: readonly Element[], out = new Uint8Array(N_EL)): Uint8Array {
  out.fill(0);
  for (const e of queue) out[EL[e] - 1]++;
  return out;
}

/** A queue (element names) from 9 counts at slot `at`, in BASE order. Spells only depend on counts. */
export function queueFromCounts(flat: Uint8Array, at = 0): Element[] {
  const q: Element[] = [];
  for (let id = 1; id <= N_EL; id++) for (let k = 0; k < flat[at * N_EL + id - 1]; k++) q.push(elementName(id));
  return q;
}

/**
 * How much the form element's damage grows with its rune count n (1 = one rune's worth). Each form
 * has its own curve, as in Magicka: sprays flatten (stacking a spray barely pays), rocks steepen
 * (going all-in does), the rest grow linearly, beams included.
 * Exponents use exp/log-free maths: n is a small integer, so the curves are tabled by n.
 */
export function formCurve(form: number, n: number, sprayExp: number, rockExp: number, linear: number): number {
  if (n <= 1) return n;
  if (form === EL.life) return 1; // Life heals: its damage is none, its healing counts every rune
  if (form === EL.water || form === EL.fire || form === EL.cold) return powSmall(n, sprayExp);
  if (form === EL.earth) return powSmall(n, rockExp);
  return 1 + linear * (n - 1);
}

/** n^e for n in 1..9 and e a multiple of 0.5 (sqrt is exact); other exponents fall back to linear interpolation between halves. */
function powSmall(n: number, e: number): number {
  const half = Math.round(e * 2);
  const at = (h: number): number => {
    let r = 1;
    for (let k = 0; k < Math.floor(h / 2); k++) r *= n;
    return h % 2 ? r * Math.sqrt(n) : r;
  };
  if (Math.abs(e * 2 - half) < 1e-9) return at(half);
  const lo = Math.floor(e * 2), f = e * 2 - lo;
  return at(lo) * (1 - f) + at(lo + 1) * f;
}

/** The form element of a payload: the rules' dominant() on counts (order never matters). 0 for none. */
const PRIORITY = [EL.shield, EL.sigil, EL.life, EL.earth, EL.arcane, EL.ice, EL.lightning];
const SPRAY = [EL.water, EL.fire, EL.cold];
export function formOf(flat: Uint8Array, at = 0): number {
  for (const id of PRIORITY) if (flat[at * N_EL + id - 1]) return id;
  let best = 0, n = 0;
  for (const id of SPRAY) { const c = flat[at * N_EL + id - 1]; if (c > n) { best = id; n = c; } }
  return best;
}
