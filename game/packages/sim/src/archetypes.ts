/**
 * Enemy archetypes (docs/explorations/2026-11-03-encounters.md), ported from the skeleton.
 * Each asks the players one readable question. Pure data: behaviour is in enemies.ts, and hit.ts
 * reads the defensive fields (the shieldbearer's guard, the imp's weaknesses).
 * Every dangerous attack has a 0.6-1.2 s telegraph. Speeds sit at ~70-80% of a wizard's 4.2.
 * The art names them as the Pixel Battlefield did: swarmers are goblins, casters are archers.
 */
export const ATTACK = { melee: 0, slam: 1, bolt: 2, grab: 3 } as const;

export interface Archetype {
  id: string;
  name: string;
  question: string;
  radius: number; hp: number; speed: number;
  attack: number;
  /** Start the wind-up within this gap (bolt and grab: distance). */
  reach: number;
  windup: number; cooldown: number;
  damage: number; knockback: number;
  slamRadius?: number;
  /** Slam: how fast its shockwave rolls out from the fists, u/s. */
  slamSpeed?: number;
  bolt?: { speed: number; keepAway: number };
  grab?: { dashSpeed: number; dashTime: number; dragSpeed: number; hold: number; breakDamage: number };
  /** Shieldbearer: a frontal guard (half angle in turns) that turns slowly (turns per second). */
  guard?: { half: number; turnRate: number };
  /** Imp: fire does nothing and it can't burn; cold hurts more; getting wet hurts. */
  fireMult?: number; coldMult?: number; burnImmune?: boolean; soakDamage?: number; hitBurn?: boolean;
  /** Never attacks or walks (the tutorial's straw targets and brambles). */
  passive?: boolean;
  /** Nothing moves it: not blows, not other bodies (brambles, like the Sanctum's dummies). */
  rooted?: boolean;
  /** Only fire hurts it (a bramble): every other element, and every blow, does nothing. */
  onlyFire?: boolean;
}

export const ARCHETYPES: readonly Archetype[] = [
  { id: 'none', name: '', question: '', radius: 0.4, hp: 1, speed: 0, attack: 0, reach: 0, windup: 1, cooldown: 1, damage: 0, knockback: 0 },
  { id: 'swarmer', name: 'Goblin', question: 'Can you hit many at once?', radius: 0.3, hp: 30, speed: 3.2, attack: ATTACK.melee, reach: 0.3, windup: 0.6, cooldown: 0.9, damage: 5, knockback: 3 },
  { id: 'brute', name: 'Brute', question: 'Can you sustain damage and protect its target?', radius: 0.85, hp: 345, speed: 1.8, attack: ATTACK.slam, reach: 2.6, windup: 1.1, cooldown: 1.8, damage: 38, knockback: 16, slamRadius: 2.1, slamSpeed: 14 },
  { id: 'shieldbearer', name: 'Shieldbearer', question: 'Can you go around?', radius: 0.55, hp: 135, speed: 2.2, attack: ATTACK.melee, reach: 0.4, windup: 0.8, cooldown: 1.2, damage: 18, knockback: 8, guard: { half: 0.18, turnRate: 0.24 } },
  { id: 'caster', name: 'Archer', question: 'Can you reach past the front?', radius: 0.4, hp: 68, speed: 2.4, attack: ATTACK.bolt, reach: 11, windup: 1.0, cooldown: 2.4, damage: 20, knockback: 4, bolt: { speed: 6, keepAway: 8 } },
  { id: 'grabber', name: 'Grabber', question: 'Can you rescue?', radius: 0.45, hp: 90, speed: 2.8, attack: ATTACK.grab, reach: 5, windup: 0.8, cooldown: 3, damage: 13, knockback: 9, grab: { dashSpeed: 12, dashTime: 0.55, dragSpeed: 2.3, hold: 3.5, breakDamage: 25 } },
  { id: 'imp', name: 'Fire imp', question: 'Do you read the battlefield?', radius: 0.36, hp: 60, speed: 3.0, attack: ATTACK.melee, reach: 0.3, windup: 0.6, cooldown: 1.0, damage: 9, knockback: 2, fireMult: 0, coldMult: 2.5, burnImmune: true, soakDamage: 14, hitBurn: true },
  // The tutorial's (docs/explorations/2026-11-06-tutorial.md): a thornbush only fire clears, and a goblin stuffed with straw.
  { id: 'bramble', name: 'Bramble', question: 'Can you burn it?', radius: 0.45, hp: 10, speed: 0, attack: ATTACK.melee, reach: 0, windup: 1, cooldown: 1, damage: 0, knockback: 0, passive: true, rooted: true, onlyFire: true },
  { id: 'straw', name: 'Straw goblin', question: 'Can you hit it?', radius: 0.3, hp: 12, speed: 0, attack: ATTACK.melee, reach: 0, windup: 1, cooldown: 1, damage: 0, knockback: 0, passive: true },
];

export const ARCH = { none: 0, swarmer: 1, brute: 2, shieldbearer: 3, caster: 4, grabber: 5, imp: 6, bramble: 7, straw: 8 } as const;
