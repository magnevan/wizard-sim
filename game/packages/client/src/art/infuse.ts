/**
 * What a conjured weapon's extras look like (issue #4; docs/archive/elemental-weapons.md, the spec). The user's rule,
 * 2026-11-21: "the leading element sets the shape, but the subsequent versions sets the element. Like with other
 * spells." So the lead keeps its prop, the first extra in MAT_ORDER turns the part that carries the element (the maul's
 * head, the wand's orb, the bow's limbs, the trident's prongs, the whip's lash) into that material, and each other
 * extra adds one small effect (FX). Arcane is never a material: it's a glowing rune. Pure: no state.
 */

// element ids, as the sim's EL
const W = 1, COLD = 4, LIGHTNING = 5, ARCANE = 6, FIRE = 8, EARTH = 9, ICE = 10;

/** The materials (live3d.ts's infuse shader modes; 0 the prop's own). */
export const MAT = { none: 0, fire: 1, water: 2, cold: 3, ice: 4, lightning: 5, steam: 6 } as const;

export interface Infusion {
  /** The material of the element-bearing part (MAT). */
  mat: number;
  /** The extras left over, each drawn as one small effect (element ids: the crackle, a drip, snow puffs, embers, glints). */
  fx: number[];
  /** Arcane among the extras: a rune glows on the element-bearing part. */
  rune: boolean;
}

const NONE: Infusion = { mat: 0, fx: [], rune: false };

/** The look of `lead` (element id) carrying `extras` (element ids, the lead and Sigil left out: accent.ts extrasOf). */
export function infusion(lead: number, extras: readonly number[]): Infusion {
  if (!extras.length) return NONE;
  const has = (id: number) => extras.includes(id) || lead === id;
  const rune = extras.includes(ARCANE);
  let rest = extras.filter((id) => id !== ARCANE);
  let mat = 0;
  const take = (m: number, ...ids: number[]) => { mat = m; rest = rest.filter((id) => !ids.includes(id)); };
  if (lead === ARCANE && extras.includes(COLD) && extras.includes(ICE)) take(MAT.cold, COLD, ICE);   // the wand's snowball (the user's note)
  else if (lead === ICE) { if (extras.includes(LIGHTNING)) take(MAT.lightning, LIGHTNING); else if (extras.includes(COLD)) take(MAT.cold, COLD); }   // the bow: Water only drips
  else if (extras.includes(ICE)) take(MAT.ice, ICE);
  else if (has(FIRE) && has(W)) take(MAT.steam, FIRE, W);
  else if (extras.includes(FIRE)) take(MAT.fire, FIRE);
  else if (extras.includes(W)) take(MAT.water, W);
  else if (extras.includes(COLD)) take(MAT.cold, COLD);
  else if (extras.includes(LIGHTNING)) take(MAT.lightning, LIGHTNING);
  // Earth is a lead only (it outranks everything it could join), Life likewise; neither is ever an effect here
  return { mat, fx: rest.filter((id) => id !== EARTH), rune };
}

/** The element a weapon blow's trail and burst show its infusion in: the material's alone, one colour (steam as water). */
const MAT_BLOW: Record<number, number> = { 1: FIRE, 2: W, 3: COLD, 4: ICE, 5: LIGHTNING, 6: W };
export const blowEls = (lead: number, extras: readonly number[]): number[] => { const m = infusion(lead, extras).mat; return m ? [MAT_BLOW[m]] : extras.includes(ARCANE) ? [ARCANE] : []; };
