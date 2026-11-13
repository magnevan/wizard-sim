/**
 * The one way an enemy enters the world. Every director (waves, Survive, the battery, the tutorial, dev tools) calls
 * this, so a new per-enemy column or setup rule is written once, here, and can't be missed in one of them.
 */
import { ARCHETYPES } from './archetypes';
import { KIND, TEAM, spawnBody, type World } from './world';

export interface EnemyOpts {
  /** Hit points: the archetype's times this (a wave's scaling), unless `hp` sets them outright. */
  hpMult?: number;
  hp?: number;
  /** Radius; the archetype's by default. */
  r?: number;
  /** Damage and speed multipliers (1: the archetype's own). */
  dmg?: number;
  speed?: number;
  /** Facing in turns (0: east). */
  face?: number;
}

/** Spawns an enemy of archetype `arch` at (x, y) in the first free slot. Returns the slot, or -1 when full or `arch` is no enemy. */
export function spawnEnemy(w: World, arch: number, x: number, y: number, o: EnemyOpts = {}): number {
  const a = ARCHETYPES[arch];
  if (!a || arch === 0) return -1;
  const i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, o.hp ?? a.hp * (o.hpMult ?? 1), o.r ?? a.radius);
  if (i < 0) return -1;
  const b = w.bodies;
  b.arch[i] = arch;
  b.dmgMult[i] = o.dmg ?? 1;
  b.speedMult[i] = o.speed ?? 1;
  b.face[i] = o.face ?? 0;
  return i;
}
