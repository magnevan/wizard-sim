import type { StatusApplication } from '../statuses/statuses';

export interface ElementDef {
  name: string;
  /** Display color for gems, effects and damage numbers. */
  color: string;
  /** Single letter drawn on the HUD gem. */
  glyph: string;
  /** Default KeyboardEvent.code for player 1, or null for combined-only elements. */
  key: string | null;
  /** Base damage per unit of this element. For life this is healing. */
  power: number;
  /** Base knockback per unit of this element. */
  knockback: number;
  /** Status applied on hit, if any. */
  status?: StatusApplication;
}

/**
 * Element ids. Adding an element (e.g. wind) means adding its id here and its
 * entry in ELEMENTS below (the compiler enforces the pair); the HUD, default
 * bindings and resolver all derive from the registry.
 * Steam and ice only appear through queue combination (see queue.ts).
 */
export const ELEMENT_IDS = [
  'water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'earth', 'fire', 'steam', 'ice',
] as const;

export type Element = (typeof ELEMENT_IDS)[number];

export const ELEMENTS: Record<Element, ElementDef> = {
  water: { name: 'Water', color: '#3fa9f5', glyph: 'W', key: 'KeyQ', power: 0, knockback: 7, status: { id: 'wet', intensity: 1, duration: 6 } },
  life: { name: 'Life', color: '#5ee26a', glyph: 'L', key: 'KeyW', power: 14, knockback: 0 },
  shield: { name: 'Shield', color: '#f3d36b', glyph: 'S', key: 'KeyE', power: 0, knockback: 3 },
  cold: { name: 'Cold', color: '#c8f2ff', glyph: 'C', key: 'KeyR', power: 4, knockback: 0, status: { id: 'chilled', intensity: 1, duration: 4 } },
  lightning: { name: 'Lightning', color: '#b48cff', glyph: 'Z', key: 'KeyA', power: 9, knockback: 0 },
  arcane: { name: 'Arcane', color: '#ff4f8b', glyph: 'A', key: 'KeyS', power: 12, knockback: 0 },
  earth: { name: 'Earth', color: '#b07a45', glyph: 'E', key: 'KeyD', power: 14, knockback: 4 },
  fire: { name: 'Fire', color: '#ff7a1a', glyph: 'F', key: 'KeyF', power: 6, knockback: 0, status: { id: 'burning', intensity: 1, duration: 4 } },
  steam: { name: 'Steam', color: '#e3e9ef', glyph: 'St', key: null, power: 9, knockback: 3, status: { id: 'wet', intensity: 1, duration: 4 } },
  ice: { name: 'Ice', color: '#8fdcff', glyph: 'I', key: null, power: 8, knockback: 1 },
};

/** Elements a player can type directly (those with a key binding). */
export const TYPEABLE_ELEMENTS = ELEMENT_IDS.filter((e) => elementDef(e).key !== null);

export function elementDef(e: Element): ElementDef {
  return ELEMENTS[e];
}

/** Damage types: every element plus untyped physical (melee, falling rocks...). */
export type DamageType = Element | 'physical';

export const PHYSICAL_COLOR = '#f2ece0';

export function damageColor(t: DamageType): string {
  return t === 'physical' ? PHYSICAL_COLOR : ELEMENTS[t].color;
}
