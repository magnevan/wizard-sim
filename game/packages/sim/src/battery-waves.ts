/**
 * The battery's waves (docs/campaign/01-opening, beats 4 and 5; the Opening Segment page, "One lane per player" and
 * "Each wave is built for one Fire attack").
 *
 * One lane per driven defence. A wave sends the same enemies down every lane: they come out of the treeline gap
 * nearest their defence and go for it first, which means the wall in front of its tower, where its driver's body
 * stands while driving (battery.ts). With nobody at that defence they go for the nearest wizard, as anywhere else.
 * Neighbouring reach overlaps, so players can help each other.
 *
 * Each wave asks for one of the defence's casts: a swarm of goblins for the burst or ring, archers standing off past
 * the flamethrower's reach for Place, a brute coming right up to the wall for the flamethrower. Then they come again,
 * mixed and more of them. The director uses the encounter's portal slots, one per defence (MAX_PORTALS is 4).
 *
 *   OFF      until somebody takes a defence.
 *   LULL     a few seconds, then the wave is announced.
 *   WAVE     each lane's portal spills its enemies, one every BWAVES.spawnEvery s.
 *   BREATHER when every lane is clear; then the next lull.
 */
import { ARCH, ARCHETYPES } from './archetypes';
import { T } from './config';
import { len } from './geom';
import { KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, TEAM, spawnBody, type World } from './world';

/** One wave: [archetype, count] per lane, spawned in this order. */
const BATTERY_WAVES: readonly (readonly [number, number])[][] = [
  [[ARCH.swarmer, 5]], // a crowd at once: the burst or the ring
  [[ARCH.caster, 2]], // they stand off past the flamethrower: Place
  [[ARCH.brute, 1]], // one heavy at the wall: the flamethrower
  [[ARCH.swarmer, 4], [ARCH.caster, 1]],
  [[ARCH.brute, 1], [ARCH.swarmer, 4]],
];

export const BWAVES = {
  /** s from taking the first defence to the first wave, and between waves. */
  firstLull: 5, lull: 6, breather: 2,
  spawnEvery: 0.5,
  /** Archers here keep this far off their defence's muzzle: past the flamethrower, inside Place's 18. */
  archerStandoff: 13,
  /** How far apart the enemies of one lane come out of their gap, across it. */
  spread: 2.4,
} as const;

const TOWER = 'defence-tower';

/** The groups each lane gets in wave n (from 1), looping larger. */
export function batteryWave(n: number): { groups: [number, number][]; loop: number } {
  const i = Math.max(0, n - 1), loop = Math.floor(i / BATTERY_WAVES.length);
  return { groups: BATTERY_WAVES[i % BATTERY_WAVES.length].map(([a, c]) => [a, Math.ceil(c * (1 + 0.4 * loop))] as [number, number]), loop };
}

/** The seat driving defence k, or -1. */
export const driverOf = (w: World, k: number): number => (w.battery ? w.battery.drive.indexOf(k) : -1);

/** The enemy's lane defence, if someone's driving it, as the body to go for; else -1. */
export function laneTarget(w: World, i: number): number {
  const k = w.battery ? w.battery.lane[i] : -1;
  return k < 0 ? -1 : driverOf(w, k);
}

/** Open the lanes for the wave: one portal slot per driven defence, at the gap nearest it. */
function openLanes(w: World): void {
  const e = w.enc, d = w.battery!, towers = w.def.props.filter((p) => p.asset === TOWER), gaps = w.def.portals;
  const { groups } = batteryWave(e.state[1]);
  for (let k = 0; k < MAX_PORTALS; k++) {
    e.left[k] = e.total[k] = 0;
    if (k >= towers.length || !d.drive.includes(k) || !gaps.length) continue;
    let best = 0;
    for (let g = 1; g < gaps.length; g++) if (Math.abs(gaps[g][0] - towers[k].x) < Math.abs(gaps[best][0] - towers[k].x)) best = g;
    e.px[k] = gaps[best][0]; e.py[k] = gaps[best][1];
    const n = groups.reduce((s, [, c]) => s + c, 0);
    e.left[k] = e.total[k] = n; e.next[k] = k * 6;
  }
}

/** Which archetype the lane's j-th enemy (from 0) is, in the wave's order. */
function archAt(groups: [number, number][], j: number): number {
  for (const [a, c] of groups) { if (j < c) return a; j -= c; }
  return groups[groups.length - 1][0];
}

const laneAlive = (w: World): number => {
  let n = 0;
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && w.battery!.lane[i] >= 0) n++;
  return n;
};

export function tickBatteryWaves(w: World): void {
  const e = w.enc, st = e.state, b = w.bodies, d = w.battery!, tick = w.clock[0];
  if (st[0] === PHASE_ENC.off) {
    if (!d.drive.some((k) => k >= 0)) return;
    st[0] = PHASE_ENC.lull; st[1] = 1; st[2] = T(BWAVES.firstLull); st[3] = 0;
    return;
  }
  if (st[0] === PHASE_ENC.lull) {
    if (--st[2] > 0) return;
    if (!d.drive.some((k) => k >= 0)) { st[2] = 1; return; } // nobody at a defence: the wave waits
    openLanes(w);
    st[0] = PHASE_ENC.wave; st[2] = 0;
    w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, text: `Wave ${st[1]}` });
    return;
  }
  if (st[0] === PHASE_ENC.wave) {
    st[2]++;
    const { groups, loop } = batteryWave(st[1]);
    for (let k = 0; k < MAX_PORTALS; k++) {
      if (!e.left[k] || --e.next[k] > 0) continue;
      const j = e.total[k] - e.left[k], arch = archAt(groups, j), a = ARCHETYPES[arch];
      const across = ((j % 3) - 1) * BWAVES.spread;
      const i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, e.px[k] + across, e.py[k] - (j % 2) * 0.8, a.hp * (1 + 0.3 * loop), a.radius);
      if (i >= 0) { b.arch[i] = arch; b.dmgMult[i] = 1 + 0.2 * loop; b.speedMult[i] = 1; b.face[i] = 0.25; d.lane[i] = k; }
      e.left[k]--; e.next[k] = T(BWAVES.spawnEvery);
    }
    let pending = 0;
    for (let k = 0; k < MAX_PORTALS; k++) pending += e.left[k];
    if (!pending && !laneAlive(w)) {
      st[0] = PHASE_ENC.breather; st[2] = T(BWAVES.breather); st[3]++; st[1]++;
      w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, text: 'Cleared' });
    }
    return;
  }
  if (st[0] === PHASE_ENC.breather) {
    if (--st[2] > 0) return;
    st[0] = PHASE_ENC.lull; st[2] = T(BWAVES.lull);
  }
}

/** Where a battery archer stands: off its defence's muzzle, on the line it came in on, past the flamethrower's reach. */
export function batteryStandoff(w: World, i: number, t: number): [number, number] {
  const b = w.bodies, ax = b.x[i] - b.x[t], ay = b.y[i] - b.y[t], al = len(ax, ay) || 1;
  return [b.x[t] + (ax / al) * BWAVES.archerStandoff, b.y[t] + (ay / al) * BWAVES.archerStandoff];
}
