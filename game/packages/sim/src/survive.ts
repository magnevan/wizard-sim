/**
 * Survive (docs/explorations/2026-11-05-survive-mode.md): the Arena's waves without an end, in a
 * walled arena, with a power-up pick between waves. The loop:
 *
 *   LULL      the next wave's portals are open behind their gates, its mix announced (6 s; 10 s
 *             before the first wave).
 *   WAVE      as the Arena's. Downed wizards are out until it ends. Everyone down: the run is OVER.
 *   BREATHER  3 s: the downed get back up at half health.
 *   PICK      three altars rise in the plaza and the next wave's portals open (so you can pick for
 *             what is coming). Each player stands on one for STAND_TIME to take it; two players
 *             may take the same one. Once everyone has picked (or after PICK_MAX), the lull starts.
 *   OVER      the results; any player pressing Self (Space) after a moment starts a new run.
 *
 * Power-ups are per-seat stacks in `w.run` (world.ts PU); the sim reads them where they apply.
 */
import { ARCH, ARCHETYPES } from './archetypes';
import { canAct } from './cast';
import { PERKS, STRUCT, T } from './config';
import { EL, N_EL } from './elements';
import { len } from './geom';
import { BTN, type PlayerInput } from './input';
import { nextInt } from './rng';
import { snapshot } from './state';
import { spawnDouble } from './structures';
import {
  ALTAR_SPOTS, KIND, MAX_PORTALS, MAX_SEATS, N_ALTARS, N_PU, PHASE, PHASE_ENC, PICK_LOG, PU, PU_CAP, SURVIVE_GATES, TEAM, WARD,
  buffers, createWorld, freeDouble, joinSeat, spawnBody, stackOf, type World,
} from './world';

export const SURVIVE_TIMES = { firstLull: 10, lull: 6, breather: 3, pickMax: 30, stand: 0.75, spawnEvery: 0.45, portalStagger: 1, restartAfter: 1.5, charm: 12 };

/** Eight authored waves; past them they loop with more enemies. Every wave also grows tougher (survivePlan). */
const WAVES: readonly (readonly [number, number])[][] = [
  [[ARCH.swarmer, 5]],
  [[ARCH.swarmer, 5], [ARCH.imp, 2]],
  [[ARCH.shieldbearer, 1], [ARCH.swarmer, 6]],
  [[ARCH.caster, 2], [ARCH.shieldbearer, 1], [ARCH.swarmer, 4]],
  [[ARCH.brute, 1], [ARCH.swarmer, 6]],
  [[ARCH.grabber, 1], [ARCH.imp, 3], [ARCH.caster, 1]],
  [[ARCH.brute, 1], [ARCH.shieldbearer, 2], [ARCH.caster, 2]],
  [[ARCH.brute, 2], [ARCH.grabber, 1], [ARCH.swarmer, 6], [ARCH.imp, 2]],
];

export interface SurvivePlan { groups: [number, number][]; hp: number; dmg: number; speed: number }

/** The big arena takes bigger waves: the authored counts are scaled by this. */
export const SURVIVE_CROWD = 1.3;

/**
 * Wave n for `players` wizards: the authored mix, scaled for the big arena (SURVIVE_CROWD), with
 * counts that grow each loop of eight and with the team's size (a quarter more per extra wizard),
 * and enemies 7% tougher and 4% harder-hitting each wave from the 4th.
 */
export function survivePlan(n: number, players = 1): SurvivePlan {
  const i = Math.max(0, n - 1), loop = Math.floor(i / WAVES.length), ramp = Math.max(0, n - 3);
  const size = SURVIVE_CROWD * (1 + 0.35 * loop) * (0.75 + 0.25 * Math.max(1, players));
  return {
    groups: WAVES[i % WAVES.length].map(([a, c]) => [a, Math.max(1, Math.round(c * size))] as [number, number]),
    hp: 1 + 0.07 * ramp, dmg: 1 + 0.04 * ramp, speed: 1 + 0.015 * Math.min(ramp, 12),
  };
}

const seatsIn = (w: World): number => { let n = 0; for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && w.bodies.kind[s] === KIND.wizard) n++; return n; };
const wizardsUp = (w: World): number => { let n = 0; for (let s = 0; s < MAX_SEATS; s++) if (w.bodies.kind[s] === KIND.wizard && !w.bodies.downed[s]) n++; return n; };
const enemiesAlive = (w: World): number => { let n = 0; for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) n++; return n; };

/**
 * Opens the next wave's portals at the back of the gates farthest from the wizards and from each
 * other (one archetype per gate). The gates are at the far edges, so enemies take a while to come
 * in; the portals start a second apart, so a wave arrives from its gates in turn.
 */
export function openGates(w: World): void {
  const e = w.enc, b = w.bodies, { groups } = survivePlan(e.state[1], seatsIn(w));
  for (let p = 0; p < MAX_PORTALS; p++) e.left[p] = e.total[p] = 0;
  const used: number[] = [];
  groups.forEach(([arch, count], p) => {
    let best = -1, bestD = -1;
    for (let k = 0; k < SURVIVE_GATES.length; k++) {
      if (used.includes(k)) continue;
      const [x, y] = SURVIVE_GATES[k];
      let d = 1e9;
      for (let s = 0; s < MAX_SEATS; s++) if (b.kind[s] === KIND.wizard) d = Math.min(d, len(b.x[s] - x, b.y[s] - y));
      for (const u of used) d = Math.min(d, len(SURVIVE_GATES[u][0] - x, SURVIVE_GATES[u][1] - y) * 1.2);
      if (d > bestD) { bestD = d; best = k; }
    }
    used.push(best);
    e.px[p] = SURVIVE_GATES[best][0]; e.py[p] = SURVIVE_GATES[best][1]; e.arch[p] = arch; e.left[p] = e.total[p] = count; e.next[p] = p * T(SURVIVE_TIMES.portalStagger);
  });
}

/** Which power-ups an altar may offer: everything someone in the team can still take. */
function offerable(w: World, pu: number): boolean {
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && w.run!.stacks[s * N_PU + pu] < PU_CAP[pu]) return true;
  return false;
}

/** Raises three altars with three different power-ups, drawn from the world's RNG. */
export function raiseAltars(w: World): void {
  const r = w.run!;
  const pool: number[] = [];
  for (let pu = 1; pu < N_PU; pu++) if (offerable(w, pu)) pool.push(pu);
  for (let a = 0; a < N_ALTARS; a++) {
    let pu: number = PU.deep;
    if (pool.length) { const k = nextInt(w.rng, 0, pool.length - 1); pu = pool[k]; pool.splice(k, 1); }
    r.offer[a] = pu;
    // Deep (one element) names one of the eight non-Sigil elements.
    r.offerEl[a] = pu === PU.deepEl ? [EL.water, EL.life, EL.shield, EL.cold, EL.lightning, EL.arcane, EL.fire, EL.earth][nextInt(w.rng, 0, 7)] : 0;
    r.ax[a] = ALTAR_SPOTS[a][0]; r.ay[a] = ALTAR_SPOTS[a][1];
  }
  for (let s = 0; s < MAX_SEATS; s++) { r.picked[s] = -1; r.stand[s] = 0; r.standOn[s] = -1; }
  r.state[0] = 0;
}

/** Seat `s` takes power-up `pu` (element `el` for Deep of one element). Exported for tests and the dev panel. */
export function grant(w: World, s: number, pu: number, el = 0): void {
  const r = w.run;
  if (!r || pu <= 0 || pu >= N_PU || r.stacks[s * N_PU + pu] >= PU_CAP[pu]) return;
  r.stacks[s * N_PU + pu]++;
  const add = (id: number, n: number) => { r.maxBonus[s * N_EL + id - 1] += n; w.seats.runes[s * N_EL + id - 1] += n; };
  if (pu === PU.deep) for (let id = 1; id <= N_EL; id++) add(id, 1);
  if (pu === PU.deepEl && el >= 1 && el <= N_EL) add(el, 2);
  if (pu === PU.spareSigil) add(EL.sigil, 1);
  if (pu === PU.charm) r.charm[s] = T(1); // the first mirror comes almost at once
  if (pu === PU.echo) summonEcho(w, s);
  const n = r.logN[s];
  if (n < PICK_LOG) { r.log[s * PICK_LOG + n] = pu; r.logEl[s * PICK_LOG + n] = el; r.logN[s] = n + 1; }
}

/** The altar a wizard stands on, or -1. */
function altarUnder(w: World, s: number): number {
  const r = w.run!, b = w.bodies;
  for (let a = 0; a < N_ALTARS; a++) if (r.offer[a] && len(b.x[s] - r.ax[a], b.y[s] - r.ay[a]) < 0.85) return a;
  return -1;
}

function tickPick(w: World): boolean {
  const r = w.run!, b = w.bodies, tick = w.clock[0];
  r.state[0]++;
  let waiting = 0;
  for (let s = 0; s < MAX_SEATS; s++) {
    if (!w.seats.active[s] || b.kind[s] !== KIND.wizard || b.downed[s]) continue;
    if (r.picked[s] >= 0) continue;
    waiting++;
    const a = altarUnder(w, s);
    if (a !== r.standOn[s]) { r.standOn[s] = a; r.stand[s] = 0; }
    if (a < 0) continue;
    if (++r.stand[s] < T(SURVIVE_TIMES.stand)) continue;
    r.picked[s] = a;
    grant(w, s, r.offer[a], r.offerEl[a]);
    w.events.push({ tick, kind: 'burst', who: s, x: r.ax[a], y: r.ay[a], amount: 1.2, look: EL.sigil, text: 'Picked' });
    waiting--;
  }
  return waiting === 0 || r.state[0] >= T(SURVIVE_TIMES.pickMax);
}

/**
 * Echo: a free Double appears beside you at once (so you can plan round it during the lull) and
 * stands until the next wave is cleared. It is the cast Double in every way (it repeats your spells
 * at half power for half their runes, and enemies want it more), except that it binds no Sigil rune.
 * A Double you cast replaces it.
 */
function summonEcho(w: World, s: number): void {
  if (w.bodies.kind[s] !== KIND.wizard) return;
  const i = spawnDouble(w, s, w.bodies.face[s], PERKS.echoHp);
  if (i >= 0) w.run!.echo[s] = i;
}

/** The wave is cleared: Echo's Doubles fade. */
function endEchoes(w: World): void {
  const r = w.run!;
  for (let s = 0; s < MAX_SEATS; s++) {
    if (freeDouble(w, s)) { w.bodies.kind[w.seats.double[s]] = KIND.none; w.seats.double[s] = -1; }
    r.echo[s] = -1;
  }
}

/** Seat `s` can rally right now: up, holding Rally, and with hands and mind free (not casting, swinging, blocking or held). */
function canRally(w: World, s: number): boolean {
  const b = w.bodies, se = w.seats;
  if (!se.active[s] || b.kind[s] !== KIND.wizard || b.downed[s] || !stackOf(w, s, PU.rally)) return false;
  if (!canAct(w, s) || b.heldBy[s] >= 0) return false;
  return !(se.phase[s] !== PHASE.idle || se.handT[s] || se.specT[s] || se.guardT[s] || se.linkTo[s] >= 0);
}
/** Seat `s` took a hit since the last tick. */
const justHit = (w: World, s: number): boolean => w.bodies.lastHit[s] > 0 && w.bodies.lastHit[s] >= w.clock[0] - 1;

/**
 * Rally: a wizard holding it who stands within PERKS.rallyRange of a downed ally, hands free, fills
 * that ally's ring; after PERKS.rallyTime the ally gets up with PERKS.rallyHp of their health. Your
 * own break (a cast, a weapon move, a block, a grab, a stun, stepping away) empties the ring; a hit
 * only drains PERKS.rallyDrain of it, so one arrow doesn't undo a nearly finished rally.
 * Two rescuers don't fill it faster: one is enough, and the other can cover them.
 */
function tickRally(w: World): void {
  const r = w.run!, b = w.bodies, tick = w.clock[0];
  for (let d = 0; d < MAX_SEATS; d++) {
    if (b.kind[d] !== KIND.wizard || !b.downed[d]) { r.rally[d] = 0; r.rallyBy[d] = -1; continue; }
    let by = -1;
    // whoever was already rallying keeps it while they can; otherwise the first able seat in range
    const keep = r.rallyBy[d];
    const inRange = (s: number) => len(b.x[s] - b.x[d], b.y[s] - b.y[d]) <= PERKS.rallyRange;
    if (keep >= 0 && canRally(w, keep) && inRange(keep)) by = keep;
    else for (let s = 0; s < MAX_SEATS && by < 0; s++) if (s !== d && b.team[s] === b.team[d] && canRally(w, s) && inRange(s)) by = s;
    if (by < 0 || by !== keep) {
      if (r.rally[d] > T(0.25) && keep >= 0) w.events.push({ tick, kind: 'fizzle', who: d, src: keep, x: b.x[d], y: b.y[d], text: 'rally broken' });
      r.rally[d] = 0;
    }
    r.rallyBy[d] = by;
    if (r.rallyCd[d] > 0) r.rallyCd[d]--;
    if (by >= 0 && justHit(w, by)) { // the ring doesn't fill while you're hit, and each hit drains some
      if (!r.rallyCd[d]) { r.rally[d] = Math.max(0, r.rally[d] - T(PERKS.rallyDrain)); r.rallyCd[d] = T(PERKS.rallyDrainGap); }
      continue;
    }
    if (by < 0 || ++r.rally[d] < T(PERKS.rallyTime)) continue;
    b.downed[d] = 0; b.hp[d] = b.maxHp[d] * PERKS.rallyHp;
    b.burn[d] = b.frozen[d] = b.stun[d] = b.down[d] = 0; b.chill[d] = 0;
    r.rally[d] = 0; r.rallyBy[d] = -1;
    w.events.push({ tick, kind: 'burst', who: d, src: by, x: b.x[d], y: b.y[d], amount: 1.2, look: EL.life, text: 'Rally' });
    w.events.push({ tick, kind: 'heal', who: d, src: by, x: b.x[d], y: b.y[d], amount: 0, look: EL.life, text: 'RALLIED' });
  }
}

/** Per-seat power-ups that tick: Slipstream's window, Charm's mirror ward, Rally. */
function tickPerks(w: World): void {
  tickRally(w);
  const r = w.run!, s = w.seats, b = w.bodies;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (r.dodge[i] > 0) r.dodge[i]--;
    if (!stackOf(w, i, PU.charm) || b.kind[i] !== KIND.wizard) continue;
    if (s.ward[i] !== WARD.none) { r.charm[i] = T(SURVIVE_TIMES.charm); continue; }
    if (b.downed[i] || --r.charm[i] > 0) continue;
    // A mirror ward of its own: nobody keeps it up, so it drains no Shield pool.
    s.ward[i] = WARD.mirror; s.wardHp[i] = STRUCT.mirrorShots; s.wardBy[i] = -1;
    s.wardEls.fill(0, i * N_EL, (i + 1) * N_EL);
    w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: b.x[i], y: b.y[i], amount: 0.8, look: EL.shield, text: 'Charm' });
  }
}

/**
 * A new run in place: a fresh survive world for the same seats, copied over this one. The tick and
 * the RNG carry on (the netcode counts ticks, and the next run's altars differ), as do the held buttons.
 */
export function restartRun(w: World): void {
  const fresh = createWorld(w.clock[1], 0, { room: 'survive' });
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s]) joinSeat(fresh, s);
  fresh.clock[0] = w.clock[0];
  fresh.rng.set(w.rng);
  fresh.seats.prevButtons.set(w.seats.prevButtons);
  fresh.run!.state[2] = w.run!.state[2] + 1;
  const src = snapshot(fresh), dst = buffers(w);
  for (let k = 0; k < dst.length; k++) new Uint8Array(dst[k].buffer, dst[k].byteOffset, dst[k].byteLength).set(src[k]);
  w.events.push({ tick: w.clock[0], kind: 'cast', who: -1, x: 0, y: 0, text: 'New run' });
}

/**
 * After a run ends, any player pressing Self (Space) starts a new one. Called by step() before the
 * seats read their buttons, so it sees the press edge. Returns true if the world was reset.
 */
export function survivePress(w: World, inputs: readonly PlayerInput[]): boolean {
  const r = w.run!;
  if (w.enc.state[0] !== PHASE_ENC.over || r.state[3] < T(SURVIVE_TIMES.restartAfter)) return false;
  for (let s = 0; s < MAX_SEATS; s++) {
    const inp = inputs[s];
    if (w.seats.active[s] && inp && inp.buttons & BTN.self && !(w.seats.prevButtons[s] & BTN.self)) { restartRun(w); return true; }
  }
  return false;
}

/** The survive director, called by step() where the Arena's wave director runs. */
export function tickSurvive(w: World): void {
  const e = w.enc, st = e.state, b = w.bodies, r = w.run!, tick = w.clock[0];
  if (st[0] === PHASE_ENC.over) { r.state[3]++; return; }
  tickPerks(w);
  if (st[0] === PHASE_ENC.lull) {
    if (!e.total[0]) openGates(w);
    if (st[2] <= 0) st[2] = T(st[1] === 1 ? SURVIVE_TIMES.firstLull : SURVIVE_TIMES.lull);
    if (--st[2] > 0) return;
    st[0] = PHASE_ENC.wave; st[2] = 0;
    w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, text: `Wave ${st[1]}` });
    return;
  }
  if (st[0] === PHASE_ENC.wave) {
    st[2]++;
    const plan = survivePlan(st[1], seatsIn(w));
    for (let p = 0; p < MAX_PORTALS; p++) {
      if (!e.left[p] || --e.next[p] > 0) continue;
      const a = ARCHETYPES[e.arch[p]];
      const i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, e.px[p], e.py[p], a.hp * plan.hp, a.radius);
      if (i >= 0) { b.arch[i] = e.arch[p]; b.dmgMult[i] = plan.dmg; b.speedMult[i] = plan.speed; b.face[i] = 0; }
      e.left[p]--; e.next[p] = T(SURVIVE_TIMES.spawnEvery);
    }
    if (!wizardsUp(w)) { // everyone is down: the run ends here
      st[0] = PHASE_ENC.over; r.state[1] = st[3]; r.state[3] = 0; r.state[4] = st[1];
      w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, text: 'Run over' });
      return;
    }
    let pending = 0;
    for (let p = 0; p < MAX_PORTALS; p++) pending += e.left[p];
    if (!pending && !enemiesAlive(w)) {
      st[0] = PHASE_ENC.breather; st[2] = T(SURVIVE_TIMES.breather); st[3]++; st[1]++;
      for (let p = 0; p < MAX_PORTALS; p++) e.total[p] = 0;
      endEchoes(w);
      w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, text: 'Cleared' });
    }
    return;
  }
  if (st[0] === PHASE_ENC.breather) {
    for (let s = 0; s < MAX_SEATS; s++) if (b.downed[s]) { b.downed[s] = 0; b.hp[s] = b.maxHp[s] / 2; }
    if (--st[2] > 0) return;
    st[0] = PHASE_ENC.pick; st[2] = 0;
    openGates(w); // the next wave shows itself now, so the pick can answer it
    raiseAltars(w);
    return;
  }
  if (st[0] === PHASE_ENC.pick) {
    if (!tickPick(w)) return;
    for (let a = 0; a < N_ALTARS; a++) r.offer[a] = 0;
    st[0] = PHASE_ENC.lull; st[2] = 0;
  }
}
