/**
 * The drill yard's prompts (sim yard.ts has the stations): the keys for each station, drawn as pictures (key-caps.ts),
 * with a few plain words over them, as the battery's are. The words are placeholders: the story's voice is the user's
 * (docs/campaign: the script stage comes after the blockout).
 */
import { EL, MAX_SEATS, N_EL, YARD, YST, markerOf, yardDone, type World } from '@wizard-sim/sim';
import type { Token } from './key-caps';

export interface YardPrompt { keys: Token[]; head?: string }

const RMB: Token = { key: 'rmb' };
export const WALK: YardPrompt = { head: 'Walk', keys: [{ key: 'lmb', hold: true }] };
/** Each station's prompt, by its marker in the level. */
export const STATIONS: readonly { st: number; at: string; p: YardPrompt }[] = [
  { st: YST.strike, at: 'strike', p: { head: 'Strike', keys: [RMB] } },
  { st: YST.heavy, at: 'heavy', p: { head: 'Heavy: shove it into the ring', keys: [{ key: 'rmb', hold: true }] } },
  { st: YST.retreat, at: 'retreat', p: { head: 'Hop out of the slam', keys: [{ key: 'shift' }, 'plus', { key: 'lmb' }] } },
  { st: YST.parry, at: 'parry', p: { head: 'Tap as the bolt lands', keys: [{ key: 'space' }] } },
  { st: YST.hands, at: 'hands', p: { head: 'Sweep: all the way round', keys: [{ key: 'shift' }, 'plus', RMB] } },
  { st: YST.focus, at: 'focus', p: { head: 'Take a charged focus', keys: [{ key: 'x' }] } },
];
/** With a charged focus and nothing conjured yet: the flame sword (beat 3). */
export const CONJURE: YardPrompt = { head: 'Conjure a flame sword', keys: [{ key: 'sigil' }, { key: 'fire' }, 'then', { key: 'shift' }, 'plus', { key: 'lmb' }] };

/** Does seat i still hold the focus's charge (a whole Sigil and Fire to conjure with)? */
const haveCharge = (w: World, i: number): boolean => w.seats.runes[i * N_EL + EL.sigil - 1] >= 1 && w.seats.runes[i * N_EL + EL.fire - 1] >= 1;

/** What seat i should see now: the station it's at that isn't done, the blade once it has a charge, or the first step. */
export function yardPrompt(w: World, i: number): YardPrompt | undefined {
  const y = w.yard;
  if (!y || i < 0 || i >= MAX_SEATS) return undefined;
  const s = w.seats, b = w.bodies;
  if (y.focus[i] && !s.weapon[i] && haveCharge(w, i)) return CONJURE;
  let best: YardPrompt | undefined, bd: number = YARD.near;
  for (const { st, at, p } of STATIONS) {
    if (st === YST.focus ? y.focus[i] : yardDone(w, st)) continue;
    const m = markerOf(w.def, at);
    if (!m) continue;
    const d = Math.hypot(b.x[i] - m.x, b.y[i] - m.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ?? (yardDone(w, YST.walk) ? undefined : WALK);
}
