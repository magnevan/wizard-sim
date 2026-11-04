// Enemy archetypes (docs/explorations/2026-11-03-encounters.md). Each one asks
// the players one readable question. Pure data: behavior lives in ai.ts,
// visuals in render/drawEnemies.ts. Speeds sit at ~70-80% of the player's 4.2.

import type { DamageType } from '../spells/elements';
import type { StatusApplication, StatusId } from '../statuses/statuses';

export const ARCHETYPE_IDS = ['swarmer', 'brute', 'shieldbearer', 'caster', 'grabber', 'imp'] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export type AttackKind = 'melee' | 'slam' | 'bolt' | 'grab';

export interface ArchetypeDef {
  name: string;
  /** The question it asks (help overlay / README). */
  question: string;
  color: string;
  radius: number;
  hp: number;
  speed: number;
  mass: number;
  attack: AttackKind;
  /** Start the wind-up when the gap to the target is this small (bolt / grab: distance). */
  reach: number;
  /** Telegraph time, 0.6-1.2 s on everything dangerous. */
  windup: number;
  cooldown: number;
  damage: number;
  knockback: number;
  /** Brute: slam radius around the locked target point. */
  slamRadius?: number;
  /** Back-line caster: slow bolt and the distance band it keeps. */
  bolt?: { speed: number; radius: number; range: number; keepAway: number };
  /** Grabber: dash speed and duration, drag speed, hold time, damage that breaks the hold. */
  grab?: { dashSpeed: number; dashTime: number; dragSpeed: number; hold: number; breakDamage: number };
  /** Shieldbearer: frontal arc (half angle, radians) that blocks projectiles / beams / sprays. */
  shield?: { halfArc: number; turnRate: number };
  /** Incoming damage multipliers (0 = immune). */
  damageTaken?: Partial<Record<DamageType, number>>;
  immune?: StatusId[];
  /** Damage taken whenever this status lands (imp: doused by water). */
  soakedBy?: { status: StatusId; damage: number };
  hitStatus?: StatusApplication;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  swarmer: {
    name: 'Swarmer', question: 'Can you hit many at once?', color: '#b0487a',
    radius: 0.3, hp: 16, speed: 3.2, mass: 0.6,
    attack: 'melee', reach: 0.3, windup: 0.6, cooldown: 0.9, damage: 6, knockback: 3,
  },
  brute: {
    name: 'Brute', question: 'Can you sustain damage and protect its target?', color: '#8a4630',
    radius: 0.85, hp: 230, speed: 1.8, mass: 6,
    attack: 'slam', reach: 2.6, windup: 1.1, cooldown: 1.8, damage: 30, knockback: 16, slamRadius: 2.1,
  },
  shieldbearer: {
    name: 'Shieldbearer', question: 'Can you go around?', color: '#4d5f80',
    radius: 0.55, hp: 90, speed: 2.2, mass: 2.5,
    attack: 'melee', reach: 0.4, windup: 0.8, cooldown: 1.2, damage: 14, knockback: 8,
    shield: { halfArc: 1.15, turnRate: 1.5 },
  },
  caster: {
    name: 'Caster', question: 'Can you reach past the front?', color: '#3f7a52',
    radius: 0.4, hp: 45, speed: 2.4, mass: 0.9,
    attack: 'bolt', reach: 11, windup: 1.0, cooldown: 2.4, damage: 16, knockback: 4,
    bolt: { speed: 6, radius: 0.28, range: 15, keepAway: 8 },
  },
  grabber: {
    name: 'Grabber', question: 'Can you rescue?', color: '#2f8a84',
    radius: 0.45, hp: 60, speed: 2.8, mass: 1.5,
    attack: 'grab', reach: 5, windup: 0.8, cooldown: 3, damage: 10, knockback: 9,
    grab: { dashSpeed: 12, dashTime: 0.55, dragSpeed: 2.3, hold: 3.5, breakDamage: 25 },
  },
  imp: {
    name: 'Fire imp', question: 'Do you read the battlefield?', color: '#e8561c',
    radius: 0.36, hp: 40, speed: 3.0, mass: 0.8,
    attack: 'melee', reach: 0.3, windup: 0.6, cooldown: 1.0, damage: 7, knockback: 2,
    damageTaken: { fire: 0, cold: 2.5, ice: 2, steam: 2 },
    immune: ['burning'],
    soakedBy: { status: 'wet', damage: 14 },
    hitStatus: { id: 'burning', intensity: 1, duration: 3 },
  },
};
