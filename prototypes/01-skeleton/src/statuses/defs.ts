import type { DamageType } from '../spells/elements';

export interface StatusDef {
  label: string;
  color: string;
  maxIntensity: number;
  /** Movement multiplier lost per point of intensity (0.2 => -20% per point). */
  slowPerIntensity?: number;
  /** Cannot move. */
  immobile?: boolean;
  /** Cannot start or continue casts. */
  noCast?: boolean;
  /** Damage over time, emitted as discrete ticks. */
  dot?: { type: DamageType; perSecondPerIntensity: number; interval: number };
  /** Incoming damage multipliers while this status is active. */
  damageTaken?: Partial<Record<DamageType, number>>;
  /** Reaching max intensity converts into another status (chill stacks into freeze). */
  onMax?: { id: StatusId; intensity: number; duration: number };
  /** A.1 enchantment (good for you): Cleanse leaves it alone. */
  buff?: boolean;
  /** Plain movement multiplier (Haste > 1, Stoneskin < 1). */
  speedMult?: number;
  /** Wind-up and recovery run this much faster (Haste). */
  castSpeed?: number;
  /** Multiplier on all damage this entity deals / takes (Glass cannon). */
  damageDealt?: number;
  damageTakenAll?: number;
  /** Harmful hits pass through; the bearer can't cast offensive spells (Ethereal). */
  intangible?: boolean;
  /** Damage is soaked by the bearer's `armor` pool first (Stoneskin). */
  armor?: boolean;
}

/** Status ids; each needs an entry in STATUS_DEFS (compiler-enforced). */
export const STATUS_IDS = ['wet', 'burning', 'chilled', 'frozen', 'slowed', 'stunned', 'ethereal', 'haste', 'glass', 'stoneskin'] as const;

export type StatusId = (typeof STATUS_IDS)[number];

/** Status registry. Logic reads only these fields, so new statuses are data. */
export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  wet: { label: 'Wet', color: '#4fb4ff', maxIntensity: 2, damageTaken: { lightning: 2 } },
  burning: {
    label: 'Burning',
    color: '#ff7a1a',
    maxIntensity: 3,
    dot: { type: 'fire', perSecondPerIntensity: 6, interval: 0.5 },
  },
  chilled: {
    label: 'Chilled',
    color: '#c8f2ff',
    maxIntensity: 3,
    slowPerIntensity: 0.22,
    onMax: { id: 'frozen', intensity: 1, duration: 2.5 },
  },
  frozen: {
    label: 'Frozen',
    color: '#9fe3ff',
    maxIntensity: 1,
    immobile: true,
    noCast: true,
    damageTaken: { earth: 2, ice: 1.5 },
  },
  slowed: { label: 'Slowed', color: '#8c7bb5', maxIntensity: 1, slowPerIntensity: 0.5 },
  stunned: { label: 'Stunned', color: '#fff27a', maxIntensity: 1, immobile: true, noCast: true },
  // A.1 Self enchantments.
  ethereal: { label: 'Ethereal', color: '#b9f3ff', maxIntensity: 1, buff: true, intangible: true },
  haste: { label: 'Haste', color: '#c7a8ff', maxIntensity: 1, buff: true, speedMult: 1.45, castSpeed: 1.6 },
  glass: { label: 'Glass cannon', color: '#ff7bb5', maxIntensity: 1, buff: true, damageDealt: 1.5, damageTakenAll: 1.5 },
  stoneskin: { label: 'Stoneskin', color: '#c9955f', maxIntensity: 1, buff: true, armor: true, speedMult: 0.7 },
};

export function statusDef(id: StatusId): StatusDef {
  return STATUS_DEFS[id];
}

/**
 * What happens when `incoming` is applied to a target that already has `existing`.
 * Rules are checked in order; several may fire for one application.
 */
export interface StatusInteraction {
  incoming: StatusId;
  existing: StatusId;
  removeExisting?: boolean;
  /** The incoming status is consumed by the reaction and not applied. */
  blockIncoming?: boolean;
  add?: { id: StatusId; intensity: number; duration: number };
  /** Name of a visual cue for the renderer ('steam', 'freeze', 'thaw'...). */
  fx?: string;
}

export const STATUS_INTERACTIONS: readonly StatusInteraction[] = [
  // wet + cold -> frozen (either order)
  { incoming: 'chilled', existing: 'wet', removeExisting: true, blockIncoming: true, add: { id: 'frozen', intensity: 1, duration: 3 }, fx: 'freeze' },
  { incoming: 'wet', existing: 'chilled', removeExisting: true, blockIncoming: true, add: { id: 'frozen', intensity: 1, duration: 3 }, fx: 'freeze' },
  // fire dries and thaws, but is spent doing so
  { incoming: 'burning', existing: 'wet', removeExisting: true, blockIncoming: true, fx: 'steam' },
  { incoming: 'burning', existing: 'chilled', removeExisting: true, blockIncoming: true, fx: 'thaw' },
  { incoming: 'burning', existing: 'frozen', removeExisting: true, blockIncoming: true, fx: 'thaw' },
  // water extinguishes fire and still soaks
  { incoming: 'wet', existing: 'burning', removeExisting: true, fx: 'steam' },
  // cold puts out fire, and is spent
  { incoming: 'chilled', existing: 'burning', removeExisting: true, blockIncoming: true, fx: 'steam' },
];
