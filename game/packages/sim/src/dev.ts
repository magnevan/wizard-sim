/**
 * Dev-only world edits for the tuning panel: spawn an enemy, refill runes, jump to a wave,
 * clear the field. They change world state from outside step(), so a run that used them no
 * longer replays from its inputs alone (the panel marks such runs).
 */
import { ARCHETYPES } from './archetypes';
import { RUNES, T } from './config';
import { N_EL, elementName } from './elements';
import { openPortals } from './waves';
import { KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, TEAM, spawnBody, type World } from './world';

export function devSpawnEnemy(w: World, arch: number, x: number, y: number): number {
  const a = ARCHETYPES[arch];
  if (!a || arch === 0) return -1;
  const i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, a.hp, a.radius);
  if (i >= 0) w.bodies.arch[i] = arch;
  return i;
}

export function devRefillRunes(w: World, seat: number): void {
  for (let e = 1; e <= N_EL; e++) w.seats.runes[seat * N_EL + e - 1] = RUNES.max[elementName(e)];
}

export function devHeal(w: World, seat: number): void {
  const b = w.bodies;
  b.hp[seat] = b.maxHp[seat]; b.downed[seat] = 0; b.burn[seat] = b.frozen[seat] = b.stun[seat] = 0; b.chill[seat] = 0;
}

export function devClearEnemies(w: World): void {
  const b = w.bodies;
  for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy) b.kind[i] = KIND.none;
  for (let p = 0; p < MAX_PORTALS; p++) w.enc.left[p] = 0;
}

/** Turns the wave director on (if this is the Sanctum) and starts a lull before wave `n`. */
export function devStartWave(w: World, n: number, lullSeconds = 2): void {
  devClearEnemies(w);
  const st = w.enc.state;
  st[0] = PHASE_ENC.lull; st[1] = Math.max(1, Math.floor(n)); st[3] = Math.max(st[3], 1);
  openPortals(w);
  st[2] = T(lullSeconds);
}

/** Skips the rest of a lull or breather. */
export function devSkipLull(w: World): void {
  if (w.enc.state[0] === PHASE_ENC.lull || w.enc.state[0] === PHASE_ENC.breather) w.enc.state[2] = 1;
}

/** Stops the wave director (enemies stay). */
export function devStopWaves(w: World): void { w.enc.state[0] = PHASE_ENC.off; }
