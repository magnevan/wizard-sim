/**
 * Spell grammar C, as the game sees it.
 *
 * `rules-c.gen.js` is generated from tools/spell-atlas/rules-c.js, which stays the source of truth
 * while the user reviews rules in the Atlas (`npm run sync-rules` refreshes it; a test fails when
 * they drift). This wrapper hands the untyped API out typed.
 *
 * The rules are pure data and string logic with no maths, so they are safe inside the
 * deterministic sim. Porting them to TypeScript is part of milestone 1.
 */
import SpellTreeC from './rules-c.gen.js';

export type Element = 'water' | 'life' | 'shield' | 'cold' | 'lightning' | 'arcane' | 'earth' | 'fire' | 'sigil';
/** The five casts. 'place' is hold Area; 'conjure' is the Weapon cast. */
export type Cast = 'force' | 'area' | 'place' | 'self' | 'conjure';

export interface PayloadTrait { el: Element; n: number; trait: string; text: string }
export interface SpellCost { kind: string; title: string; text: string }

/** What `resolve` returns: the spell's form, its look and what each extra element adds. */
export interface SpellDescriptor {
  cast: Cast;
  drag: boolean;
  onAlly: boolean;
  /** The element that sets the form, or null for an empty queue. */
  form: Element | null;
  formName: string;
  title: string;
  text: string;
  payload: PayloadTrait[];
  mix: unknown[];
  power: number;
  /** Grid cell, `form/cast`. */
  id: string;
  sub: string | null;
  /** The element the spell looks like (the look rule: the carried element sets the look). */
  look: Element | null;
  cost: SpellCost | null;
  [extra: string]: unknown;
}

export interface SpellRules {
  ELEMENTS: Record<Element, { name: string; key: string; color: string }>;
  BASE: Element[];
  MAX: number;
  /** Pairs that cancel rune for rune in the queue (the elements' opposites, then Shield and Sigil's own). */
  CANCEL: readonly (readonly [Element, Element])[];
  addElement(queue: readonly Element[], el: Element): { queue: Element[]; event: string | null };
  resolve(queue: readonly Element[], cast: Cast, opts?: { drag?: boolean; onAlly?: boolean }): SpellDescriptor;
  [table: string]: unknown;
}

export const rules = SpellTreeC as unknown as SpellRules;
