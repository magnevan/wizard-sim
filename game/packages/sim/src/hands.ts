/**
 * Your hands: with no runes queued, the cast gestures are weapon moves (grammar v2,
 * docs/explorations/2026-11-05-weapons-review-1.md). Runes queued = magic, none = your hands.
 *
 *   RMB tap     Strike   your weapon's swing, or the staff's shove           1 use
 *   RMB hold    Heavy    charge, then a bigger blow                          2 uses
 *   Shift+RMB   Special  the weapon's own move: a full-circle Sweep, the spear's javelin   2 uses
 *   Shift+LMB   Retreat  a quick hop backwards, away from where you face
 *   Space       Defend   hold to block with your conjured guard (cast.ts: guardT)
 *
 * The weapon-specific Heavies (a fire wave, an earth wave, the spear's long dash, Life's healing
 * link) and the guards' own Retreats come after the guards round; for now every weapon shares
 * these, so the grammar can be felt in the hands.
 */
import { compile, type SpellSpec } from './compile';
import { RHYTHM, STRUCT, T } from './config';
import { EL, elementName, queueFromCounts } from './elements';
import { fireSpell, type FireExtra } from './effects';
import { addKnock } from './hit';
import { cosTurns, sinTurns } from './trig';
import { PU, stackOf, type World } from './world';

/** Ticks a press may last and still be a tap (Strike rather than Heavy). */
export const TAP = T(0.25);

const weaponSpec = (w: World, i: number): SpellSpec => compile(queueFromCounts(w.seats.weaponEls, i), 'conjure');

/** One blow of your conjured weapon, or the staff's shove when you hold none. Spends `uses`. */
function blow(w: World, i: number, face: number, ex: FireExtra, uses: number): void {
  const s = w.seats;
  if (!s.weapon[i] || s.weaponUses[i] <= 0) { fireSpell(w, i, compile([], 'conjure'), face, 0, 0, 0, { ...ex, knock: (ex.knock ?? 3) * (ex.scale ?? 1) }); return; }
  const el = elementName(s.weapon[i]), reach = (STRUCT.reach[el] ?? 1.8) * (ex.reach ?? 1);
  fireSpell(w, i, weaponSpec(w, i), face, 0, 0, 0, { ...ex, reach, yank: el === 'arcane' });
  s.weaponUses[i] -= uses;
  if (s.weaponUses[i] <= 0) s.weapon[i] = 0;
}

export function strike(w: World, i: number, face: number): void {
  blow(w, i, face, {}, 1);
}

/** `charge` 0..1: how long past a tap the button was held, against RHYTHM.chargeMax. */
export function heavy(w: World, i: number, face: number, charge: number): void {
  blow(w, i, face, { scale: STRUCT.heavyScale * (0.6 + 0.4 * charge), reach: STRUCT.heavyReach, knock: 8 }, 2);
}

export function special(w: World, i: number, face: number, tx: number, ty: number): void {
  const s = w.seats;
  if (s.weapon[i] === EL.cold && s.weaponUses[i] > 0) { // the spear's javelin: thrown at the cursor, carrying its elements
    fireSpell(w, i, { ...weaponSpec(w, i), shape: 'missile', charge: false }, face, tx, ty, 0);
    s.weaponUses[i] -= 2;
    if (s.weaponUses[i] <= 0) s.weapon[i] = 0;
    return;
  }
  blow(w, i, face, { half: 0.5, scale: STRUCT.sweepScale }, 2); // a full circle round you, your partner too
}

/** A hop backwards, away from where you face. */
export function retreat(w: World, i: number, face: number): void {
  addKnock(w, i, -cosTurns(face), -sinTurns(face), STRUCT.retreatPush);
  if (w.run && stackOf(w, i, PU.slipstream)) w.run.dodge[i] = T(2); // survive: the next spell is free
}

/** How far a held RMB has charged a Heavy (0 at the end of the tap window, 1 when full). */
export const heavyCharge = (held: number): number => Math.max(0, Math.min(1, (held - TAP) / T(RHYTHM.chargeMax)));
