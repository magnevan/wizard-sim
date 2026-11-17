/**
 * Dev-only world edits for the tuning panel: spawn an enemy, refill runes, jump to a wave,
 * clear the field. They change world state from outside step(), so a run that used them no
 * longer replays from its inputs alone (the panel marks such runs).
 */
import { STRUCT, T } from './config';
import { EL, N_EL } from './elements';
import { len } from './geom';
import { atan2Turns, cosTurns, sinTurns } from './trig';
import type { Mode } from './mode';
import { openPortals } from './waves';
import { openGates, restartRun } from './survive';
import { AI, KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, runeMax, type World } from './world';
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

/**
 * The dev stage (the Tools panel's Stage section, which the Model Viewer's play area opens): enemies held where they
 * stand, and one driven by hand, a puppet. It wraps the mode's enemy rules (mode.ts EnemyRules), so the core's own enemy
 * code walks, turns, swings and strikes; devStageOff puts the mode's rules back. `st` is read live each tick. Call it
 * after every step while the stage is on: it does nothing while its rules are in place, and wraps the new mode's after a
 * room switch.
 */
export interface DevStage {
  /** Every enemy but the puppet stands where it is (blows still knock it about; it doesn't walk back). */
  hold: boolean;
  /** The puppet's body, or -1. */
  puppet: number;
  /** Where the puppet walks to; null: it stands where it is. */
  goal: [number, number] | null;
  /** Which way a swing at nobody faces (turns). */
  aim: number;
}
/** A mode wrapped by devStage: it keeps the mode it wraps. */
interface Staged extends Mode { readonly devOwn: Mode; readonly devSt: DevStage }

export function devStage(w: World, st: DevStage): void {
  if ((w.mode as Staged).devSt === st) return;
  const own = w.mode, rules = own.enemies;
  // the puppet is busy from its wind-up to the end of its cooldown; meanwhile the core's attack code has it
  const busy = (x: World, i: number) => x.bodies.ai[i] !== AI.approach;
  const wrap: Staged = {
    ...own,
    devOwn: own,
    devSt: st,
    enemies: {
      ...rules,
      holdAt: (x, i) => (i === st.puppet ? (busy(x, i) && x.bodies.target[i] < 0 ? [x.bodies.x[i], x.bodies.y[i]] : undefined) : rules?.holdAt?.(x, i)),
      holdFace: (x, i) => (i === st.puppet ? st.aim : rules?.holdFace?.(x, i)),
      restAt: (x, i) => {
        if (i === st.puppet) return busy(x, i) ? undefined : st.goal ?? [x.bodies.x[i], x.bodies.y[i]];
        if (st.hold) return [x.bodies.x[i], x.bodies.y[i]];
        return rules?.restAt?.(x, i);
      },
    },
  };
  w.mode = wrap;
}

/** The mode's own enemy rules again. */
export function devStageOff(w: World): void {
  const own = (w.mode as Staged).devOwn;
  if (own) w.mode = own;
}

/**
 * The puppet attacks toward (tx, ty): the nearest wizard (or double) within 2.5 u of that point is its target, struck,
 * shot or grabbed by the core's own attack code; with nobody there it swings at the air, harmlessly.
 */
export function devPuppetAttack(w: World, i: number, tx: number, ty: number, st: DevStage): void {
  const b = w.bodies;
  if (b.kind[i] !== KIND.enemy || b.ai[i] !== AI.approach) return;
  let t = -1, best = 2.5;
  for (let s = 0; s < b.kind.length; s++) {
    if (!((b.kind[s] === KIND.wizard && !b.downed[s]) || b.kind[s] === KIND.double)) continue;
    const d = len(b.x[s] - tx, b.y[s] - ty);
    if (d < best) { best = d; t = s; }
  }
  st.aim = atan2Turns(ty - b.y[i], tx - b.x[i]); st.goal = null;
  b.face[i] = st.aim; b.target[i] = t;
  b.lockX[i] = t >= 0 ? b.x[t] : tx; b.lockY[i] = t >= 0 ? b.y[t] : ty;
  b.slamX[i] = b.x[i] + cosTurns(st.aim) * b.r[i] * 0.6; b.slamY[i] = b.y[i] + sinTurns(st.aim) * b.r[i] * 0.6;
  b.ai[i] = AI.windup; b.aiT[i] = 0;
}

/** Seat's conjured weapon: an element (EL id; EL.ice is the bow), 'wand', or 0 to put it away, with its full uses. */
export function devConjure(w: World, seat: number, what: number | 'wand'): void {
  const s = w.seats;
  s.wand[seat] = what === 'wand' ? 1 : 0;
  s.weapon[seat] = what === 'wand' ? 0 : what;
  s.wandBorn[seat] = w.clock[0];
  s.weaponEls.fill(0, seat * N_EL, (seat + 1) * N_EL);
  s.weaponUses[seat] = what && what !== 'wand' ? STRUCT.weaponUses : 0;
}
/** The weapons devConjure can give, by name. */
export const DEV_WEAPONS: readonly [string, number | 'wand'][] = [
  ['wand', 'wand'], ['maul (earth)', EL.earth], ['hook (arcane)', EL.arcane], ['sword (fire)', EL.fire], ['spear (cold)', EL.cold],
  ['bow (ice)', EL.ice], ['whip (lightning)', EL.lightning], ['trident (water)', EL.water], ['hands (life)', EL.life],
];
