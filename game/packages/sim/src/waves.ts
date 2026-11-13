/**
 * The Arena's wave director, ported from the skeleton (rooms/waves.ts). Pillar 7: downtime is
 * for preparing, so every wave is announced.
 *
 *   LULL      portals open at the arena's edge, as far from the wizards as possible, each with
 *             its archetype, count and a countdown (8 s before the first wave, 10 s after).
 *   WAVE      the portals spill one enemy every 0.45 s. Downed wizards are out until it ends;
 *             if everyone is down, the wave is wiped and retried after a lull.
 *   BREATHER  3 s: downed wizards get back up, at half health.
 * Six authored waves of two or three archetypes, then they loop with more and tougher enemies.
 */
import { ARCH } from './archetypes';
import { T } from './config';
import { len } from './geom';
import type { RoomDef } from './room';
import { EV, KIND, MAX_PORTALS, MAX_SEATS, PHASE_ENC, ROOMS, type World } from './world';
import { spawnEnemy } from './spawn';

const WAVES: readonly (readonly [number, number])[][] = [
  [[ARCH.swarmer, 6]],
  [[ARCH.brute, 1], [ARCH.swarmer, 5]],
  [[ARCH.shieldbearer, 2], [ARCH.caster, 2]],
  [[ARCH.grabber, 1], [ARCH.swarmer, 6], [ARCH.imp, 2]],
  [[ARCH.brute, 1], [ARCH.shieldbearer, 1], [ARCH.caster, 2]],
  [[ARCH.brute, 2], [ARCH.grabber, 1], [ARCH.caster, 2]],
];
export const WAVE_TIMES = { firstLull: 8, lull: 10, breather: 3, spawnEvery: 0.45 };

/**
 * Candidate portal spots, in a fixed order: the room's Portal entities (the Arena's ring round the
 * edge, from game/content/maps). A room with none (the Sanctum, when the tuning panel starts waves)
 * borrows the Arena's.
 */
const spotsOf = (w: World): RoomDef['portals'] => (w.def.portals.length ? w.def.portals : ROOMS.arena.portals);

export function wavePlan(n: number): { groups: [number, number][]; loop: number } {
  const i = Math.max(0, n - 1), loop = Math.floor(i / WAVES.length);
  return { groups: WAVES[i % WAVES.length].map(([a, c]) => [a, Math.ceil(c * (1 + 0.35 * loop))] as [number, number]), loop };
}

export function openPortals(w: World): void {
  const e = w.enc, b = w.bodies, { groups } = wavePlan(e.state[1]), SPOTS = spotsOf(w);
  const used: number[] = [];
  for (let p = 0; p < MAX_PORTALS; p++) e.left[p] = e.total[p] = 0;
  groups.forEach(([arch, count], p) => {
    // The spot farthest from every wizard and from the portals already open.
    let best = 0, bestD = -1;
    SPOTS.forEach(([x, y], k) => {
      if (used.includes(k)) return;
      let d = Infinity;
      for (let s = 0; s < MAX_SEATS; s++) if (b.kind[s] === KIND.wizard) d = Math.min(d, len(b.x[s] - x, b.y[s] - y));
      for (const u of used) d = Math.min(d, len(SPOTS[u][0] - x, SPOTS[u][1] - y) * 1.5);
      if (d > bestD) { bestD = d; best = k; }
    });
    used.push(best);
    e.px[p] = SPOTS[best][0]; e.py[p] = SPOTS[best][1]; e.arch[p] = arch; e.left[p] = e.total[p] = count; e.next[p] = p * 8;
  });
}

const enemiesAlive = (w: World): number => { let n = 0; for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) n++; return n; };
const wizardsUp = (w: World): number => { let n = 0; for (let s = 0; s < MAX_SEATS; s++) if (w.bodies.kind[s] === KIND.wizard && !w.bodies.downed[s]) n++; return n; };

export function tickWaves(w: World): void {
  const e = w.enc, st = e.state, b = w.bodies;
  if (st[0] === PHASE_ENC.off) return;
  const tick = w.clock[0];
  if (st[0] === PHASE_ENC.lull) {
    if (!e.total[0]) { openPortals(w); st[2] = T(st[1] === 1 && !st[3] ? WAVE_TIMES.firstLull : WAVE_TIMES.lull); }
    if (--st[2] > 0) return;
    st[0] = PHASE_ENC.wave; st[2] = 0;
    w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, ev: EV.waveStart, text: `Wave ${st[1]}` });
    return;
  }
  if (st[0] === PHASE_ENC.wave) {
    st[2]++;
    const { loop } = wavePlan(st[1]);
    for (let p = 0; p < MAX_PORTALS; p++) {
      if (!e.left[p] || --e.next[p] > 0) continue;
      spawnEnemy(w, e.arch[p], e.px[p], e.py[p], { hpMult: 1 + 0.3 * loop, dmg: 1 + 0.2 * loop, speed: 1 + 0.06 * loop });
      e.left[p]--; e.next[p] = T(WAVE_TIMES.spawnEvery);
    }
    if (!wizardsUp(w)) { // wiped: clear the field and try again after a lull
      for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy) b.kind[i] = KIND.none;
      st[0] = PHASE_ENC.breather; st[2] = T(WAVE_TIMES.breather);
      w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, ev: EV.wiped, text: 'Wiped' });
      return;
    }
    let pending = 0;
    for (let p = 0; p < MAX_PORTALS; p++) pending += e.left[p];
    if (!pending && !enemiesAlive(w)) {
      st[0] = PHASE_ENC.breather; st[2] = T(WAVE_TIMES.breather); st[3]++;
      st[1]++;
      w.events.push({ tick, kind: 'cast', who: -1, x: 0, y: 0, ev: EV.waveClear, text: 'Cleared' });
    }
    return;
  }
  // Breather: the downed get back up, then the next lull opens its portals.
  for (let s = 0; s < MAX_SEATS; s++) if (b.downed[s]) { b.downed[s] = 0; b.hp[s] = b.maxHp[s] / 2; }
  if (--st[2] > 0) return;
  st[0] = PHASE_ENC.lull;
  for (let p = 0; p < MAX_PORTALS; p++) e.total[p] = 0;
}
