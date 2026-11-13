/**
 * Dev-only world edits for the tuning panel: spawn an enemy, refill runes, jump to a wave,
 * clear the field. They change world state from outside step(), so a run that used them no
 * longer replays from its inputs alone (the panel marks such runs).
 */
import { T } from './config';
import { N_EL } from './elements';
import { openPortals } from './waves';
import { openGates, restartRun } from './survive';
import { KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, runeMax, type World } from './world';
import { spawnEnemy } from './spawn';

export function devSpawnEnemy(w: World, arch: number, x: number, y: number): number {
  return spawnEnemy(w, arch, x, y);
}

export function devRefillRunes(w: World, seat: number): void {
  for (let e = 1; e <= N_EL; e++) w.seats.runes[seat * N_EL + e - 1] = runeMax(w, seat, e);
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
  if (w.run) { for (let a = 0; a < w.run.offer.length; a++) w.run.offer[a] = 0; openGates(w); } else openPortals(w);
  st[2] = T(lullSeconds);
}

/** Skips the rest of a lull or breather, or (survive) ends the pick: unpicked seats go without. */
export function devSkipLull(w: World): void {
  const st = w.enc.state;
  if (st[0] === PHASE_ENC.lull || st[0] === PHASE_ENC.breather) st[2] = 1;
  if (st[0] === PHASE_ENC.pick && w.run) { w.run.offer.fill(0); w.run.choose.fill(0); st[0] = PHASE_ENC.lull; st[2] = 0; }
}

/** Survive: start a new run now (the run-over screen does this with Space). */
export function devRestartRun(w: World): void { if (w.run) restartRun(w); }

/** Stops the wave director (enemies stay). */
export function devStopWaves(w: World): void { w.enc.state[0] = PHASE_ENC.off; }
