/**
 * Rules descriptor -> mechanics. The rules (rules-c) say what a spell is: its form, its look,
 * what each extra element adds. This file decides what that means in the world: which shape
 * entity to spawn, whether it channels or charges, and whether it heals or harms.
 *
 * A spec is derived from the queue and cast alone, so it is never stored: the effect pools
 * keep the element counts and recompute what they need.
 */
import { rules, type Cast, type Element } from '@wizard-sim/rules';
import { EL, countsOf } from './elements';

export type Shape =
  | 'beam' | 'spray' | 'arc' | 'missile' | 'shards'      // Force
  | 'nova' | 'quake' | 'discharge'                        // Area
  | 'patch' | 'blast' | 'geyser' | 'strike' | 'spring'    // Place
  | 'swing' | 'palm' | 'imbue'                            // Weapon (swing: the bare staff; imbue: the imbued burst)
  | 'self' | 'blink'
  | 'wave' | 'ring' | 'arcwall' | 'drawnwall' | 'ward' | 'guard' // Shield
  | 'turret' | 'orbitals' | 'motes' | 'glyph' | 'lineglyph' | 'lens' | 'wand' | 'weapon' | 'aura' | 'double' // Sigil
  | 'todo';                                               // in the rules, not in the engine yet

/** The S2 shape change that bends a spell (only the leading one applies). */
export type Mod = 'push' | 'shatter' | 'chain' | 'burst' | null;

export interface SpellSpec {
  title: string;
  cast: Cast;
  shape: Shape;
  /** Element counts, index = id - 1. */
  counts: Uint8Array;
  form: number; // element id, 0 for none
  formN: number; // runes of the form element
  /** Runes that set the shape's size: the form's, or for a Life spell the element lending its shape (more Fire, a wider healing cone; more Life, stronger healing). */
  sizeN: number;
  power: number; // queue length
  look: number; // element id the spell looks like
  mod: Mod;
  /** A Life spell: it heals and never harms (direction L3). */
  heal: boolean;
  /** Water + fire in one spell (scald); Ice in the spell (freeze: it douses but never soaks, so it can't set up its own freeze). */
  scald: boolean;
  freeze: boolean;
  channel: boolean;
  charge: boolean;
  /** Shield: 1 rock (Earth), 2 barrier (Shield alone), 3 curtain (other elements). */
  wall: number;
  /** Sigil: the leading other element (picks the device's spell), 0 for none. */
  sub: number;
}

/** What a Shield structure is made of. */
export const WALL = { none: 0, rock: 1, barrier: 2, curtain: 3 } as const;

const MOD: Record<string, Mod> = { water: 'push', cold: 'shatter', ice: 'shatter', lightning: 'chain', arcane: 'burst' };

/** The element lending its shape to a Life spell: most runes, ties in the rules' LIFE_LEND_ORDER. */
const LEND_ORDER: Element[] = ['earth', 'ice', 'lightning', 'cold', 'fire', 'water'];
function lendOf(counts: Uint8Array): Element | null {
  let best: Element | null = null, n = 0;
  for (const e of LEND_ORDER) { const c = counts[EL[e] - 1]; if (c > n) { best = e; n = c; } }
  return best;
}

export function compile(queue: readonly Element[], cast: Cast, opts: { drag?: boolean } = {}): SpellSpec {
  const d = rules.resolve(queue, cast, opts);
  const counts = countsOf(queue);
  const form = d.form ? EL[d.form] : 0;
  const has = (e: Element) => counts[EL[e] - 1] > 0;
  const heal = d.form === 'life';
  // A support spell carries no harmful mixes.
  const scald = !heal && has('water') && has('fire');
  const freeze = !heal && has('ice');
  const spec: SpellSpec = {
    title: d.title, cast, shape: 'todo', counts, form, formN: form ? counts[form - 1] : 0, sizeN: form ? counts[form - 1] : 0, power: queue.length,
    look: d.look ? (EL as Record<string, number>)[d.look] ?? form : form,
    mod: d.shape ? MOD[d.shape as string] ?? null : null,
    heal, scald, freeze, channel: false, charge: false, wall: 0, sub: d.sub ? EL[d.sub as Element] : 0,
  };
  if (!queue.length) { if (cast === 'conjure') spec.shape = 'swing'; return spec; } // an empty Weapon cast: a plain staff swing
  const lookName = d.look as string | null;
  if (lookName === 'scald') spec.look = EL.water;

  if (has('shield')) spec.wall = has('earth') ? WALL.rock : queue.some((e) => e !== 'shield') ? WALL.curtain : WALL.barrier;
  if (cast === 'self') {
    spec.shape = d.id === 'elements/self' ? 'self' : d.id === 'shield/self' ? 'ward' : queue.length > 1 ? 'aura' : 'double'; // Sigil alone on yourself: the Double
    return spec;
  }
  switch (d.form as Element) {
    case 'life': {
      const L = lendOf(counts);
      if (L) spec.sizeN = counts[EL[L] - 1];
      if (cast === 'force') {
        spec.shape = L === 'lightning' ? 'arc' : L === 'cold' || L === 'ice' ? 'shards' : L === 'water' || L === 'fire' ? 'spray' : L === 'earth' ? 'missile' : 'beam';
        spec.channel = spec.shape === 'beam' || spec.shape === 'spray' || spec.shape === 'arc';
        spec.charge = L === 'earth';
        spec.mod = L === 'water' ? 'push' : null;
      } else spec.shape = cast === 'area' ? 'nova' : cast === 'place' ? 'spring' : 'palm';
      return spec;
    }
    case 'earth':
      spec.shape = cast === 'force' ? 'missile' : cast === 'area' ? 'quake' : cast === 'place' ? 'geyser' : 'imbue';
      spec.charge = cast === 'force';
      return spec;
    case 'arcane':
      spec.shape = cast === 'force' ? 'beam' : cast === 'area' ? 'nova' : cast === 'place' ? 'blast' : 'imbue';
      spec.channel = cast === 'force';
      return spec;
    case 'lightning':
      spec.shape = cast === 'force' ? 'arc' : cast === 'area' ? 'discharge' : cast === 'place' ? 'strike' : 'imbue';
      spec.channel = cast === 'force';
      return spec;
    case 'ice':
      // Ice shards (a freezing spray was too strong), the Ice ring, the Ice sheet, the Ice burst.
      spec.shape = cast === 'force' ? 'shards' : cast === 'area' ? 'nova' : cast === 'place' ? 'patch' : 'imbue';
      return spec;
    case 'water': case 'fire': case 'cold':
      if (cast === 'force') {
        spec.shape = 'spray';
        spec.channel = true;
      } else spec.shape = cast === 'area' ? 'nova' : cast === 'place' ? 'patch' : 'imbue';
      // Water's own spray and splash push, as the rules say (SHAPES.push a Water rune); steam doesn't
      if (d.form === 'water' && !scald && (cast === 'force' || cast === 'area')) spec.mod = 'push';
      return spec;
    case 'sigil':
      if (cast === 'force') spec.shape = d.sub ? 'turret' : 'blink';
      else if (cast === 'area') spec.shape = d.sub ? 'orbitals' : 'motes';
      else if (cast === 'place') spec.shape = d.sub ? (d.drag ? 'lineglyph' : 'glyph') : 'lens';
      else spec.shape = d.sub ? 'weapon' : 'wand';
      return spec;
    case 'shield':
      if (cast === 'force') spec.shape = 'wave';
      else if (cast === 'area') spec.shape = 'ring';
      else if (cast === 'place') spec.shape = d.drag ? 'drawnwall' : 'arcwall';
      else if (cast === 'conjure') spec.shape = 'guard'; // Bulwark (with Earth) or Buckler
      return spec;
    default:
      return spec;
  }
}
