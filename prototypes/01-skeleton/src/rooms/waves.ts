// Wave director rules (pure; the Arena room drives them).
// LULL: the next wave's portals are visible with a countdown (prepare!)
// -> WAVE: portals spill 2-3 archetypes -> BREATHER: downed players return.

import type { Vec2 } from '../core/vec2';
import type { ArchetypeId } from '../world/archetypes';

export type WavePhase = 'lull' | 'wave' | 'breather';

export interface WaveGroup {
  archetype: ArchetypeId;
  count: number;
}

/** Six authored waves, escalating; then they loop with more and tougher enemies. */
export const WAVES: readonly WaveGroup[][] = [
  [{ archetype: 'swarmer', count: 6 }],
  [{ archetype: 'brute', count: 1 }, { archetype: 'swarmer', count: 5 }],
  [{ archetype: 'shieldbearer', count: 2 }, { archetype: 'caster', count: 2 }],
  [{ archetype: 'grabber', count: 1 }, { archetype: 'swarmer', count: 6 }, { archetype: 'imp', count: 2 }],
  [{ archetype: 'brute', count: 1 }, { archetype: 'shieldbearer', count: 1 }, { archetype: 'caster', count: 2 }],
  [{ archetype: 'brute', count: 2 }, { archetype: 'grabber', count: 1 }, { archetype: 'caster', count: 2 }],
];

export const LULL_SECONDS = 10;
export const FIRST_LULL_SECONDS = 8;
export const BREATHER_SECONDS = 3;
/** A portal releases one enemy this often once the wave starts. */
export const SPAWN_INTERVAL = 0.45;

export interface WavePlan {
  groups: WaveGroup[];
  /** 0 for the first pass through WAVES, 1 for the second... */
  loop: number;
  hp: number;
  speed: number;
  damage: number;
}

/** Wave n (1-based): the authored mix, scaled up on every loop. */
export function wavePlan(n: number): WavePlan {
  const i = Math.max(0, n - 1);
  const loop = Math.floor(i / WAVES.length);
  const groups = WAVES[i % WAVES.length].map((g) => ({ archetype: g.archetype, count: Math.ceil(g.count * (1 + 0.35 * loop)) }));
  return { groups, loop, hp: 1 + 0.3 * loop, speed: 1 + 0.06 * loop, damage: 1 + 0.2 * loop };
}

export interface Portal {
  pos: Vec2;
  archetype: ArchetypeId;
  /** Enemies still to come out of it. */
  left: number;
  total: number;
  /** Seconds until the next one emerges (during the wave). */
  next: number;
}

export interface WaveReport {
  wave: number;
  /** Sealed spells released or triggered from the lull through the end of the wave. */
  sealedFired: number;
  /** Spells sealed during the lull before it (preparation). */
  sealedInLull: number;
  wiped: boolean;
}

/** The arena's encounter state; lives on World so the HUD, renderer and bots can read it. */
export interface Encounter {
  phase: WavePhase;
  /** The current wave (wave / breather) or the upcoming one (lull). */
  wave: number;
  /** Seconds left in the lull / breather. */
  timer: number;
  portals: Portal[];
  /** World seal counters when the lull started / when the wave started. */
  firedAtLull: number;
  storedAtLull: number;
  storedAtWave: number;
  last: WaveReport | null;
}

export function newEncounter(): Encounter {
  return { phase: 'lull', wave: 1, timer: FIRST_LULL_SECONDS, portals: [], firedAtLull: 0, storedAtLull: 0, storedAtWave: 0, last: null };
}

export type WaveEvent = 'openPortals' | 'startWave' | 'cleared' | 'wiped' | 'nextLull' | null;

/**
 * Advance the phase clock. Returns what the room should do this tick.
 * `enemies`: alive enemies; `playersUp`: players not downed.
 */
export function advance(enc: Encounter, dt: number, enemies: number, playersUp: number): WaveEvent {
  switch (enc.phase) {
    case 'lull':
      if (enc.portals.length === 0) return 'openPortals';
      enc.timer -= dt;
      if (enc.timer > 0) return null;
      enc.phase = 'wave';
      enc.timer = 0;
      return 'startWave';
    case 'wave':
      enc.timer += dt;
      if (playersUp === 0) return 'wiped';
      if (enemies === 0 && enc.portals.every((p) => p.left === 0)) {
        enc.phase = 'breather';
        enc.timer = BREATHER_SECONDS;
        return 'cleared';
      }
      return null;
    case 'breather':
      enc.timer -= dt;
      if (enc.timer > 0) return null;
      enc.phase = 'lull';
      enc.wave++;
      enc.timer = LULL_SECONDS;
      enc.portals = [];
      return 'nextLull';
  }
}

/** Downed players stay out while a wave is on ("out until the wave ends"). */
export function respawnBlocked(enc: Encounter | undefined): boolean {
  return enc?.phase === 'wave';
}
