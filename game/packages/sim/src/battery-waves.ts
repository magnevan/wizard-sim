/**
 * The battery's fight, as a lesson (docs/campaign/01-opening, beats 4 and 5). The user, 2026-11-11: no wave
 * announcements or timers, "you are coming over to a faltering defence and helping shore it up", and it's a tutorial:
 * each of the first encounters teaches one of the defence's casts, with its controls on screen (the client's
 * battery-text.ts). Driving a defence is risk free: nothing at the wall can hurt you.
 *
 * One lane per defence. An enemy goes for its own defence's wall (the muzzle, where a driver's body stands); when
 * nobody drives that one but somebody drives another, it walks along to the nearest driven one; with nobody at any
 * defence, it stays and batters its own wall.
 *
 *   ARRIVE  two goblins already battering the wall in front of each defence, as you come up.
 *   RING    once a defence is taken: clear them (they come along the wall to you). Teaches the ring.
 *   SPRAY   goblins across the field down each driven lane. Teaches the flamethrower.
 *   PLACE   archers that stand off past the flamethrower. Teaches Place.
 *   BRUTE   one heavy one at the wall. Keep the flame on it.
 *   FREE    mixed groups, quietly, one after another, while the well fails (beat 5): its flow falls to nothing over
 *           WELL.fail, and the defences' pools refill slower and slower.
 *   DRY     the well has run dry (beat 6): everyone is stepped off their defence, the defences and the gate's fire go
 *           out, and WELL.surge later the infusion gives every wizard a Fire pool of its own (world.ts infused).
 *   HANDS   the enemies left come through the gate for you, then a group or two more (beat 7): your own fire now.
 *   AFTER   the last of them is down. The repair is to come.
 *
 * The step and its timer live in the encounter's state (enc.state: [0] on, [1] step, [2] ticks to the next group,
 * [3] which group of FREE or HANDS); the lanes' portal slots are the encounter's, one per defence (MAX_PORTALS is 4).
 */
import { ARCH, ARCHETYPES } from './archetypes';
import { T, WELL } from './config';
import { EL, N_EL } from './elements';
import { len } from './geom';
import { BATTERY, stepAway } from './battery';
import { KIND, MAX_PORTALS, MAX_SEATS, TEAM, TERRAIN, spawnBody, type World } from './world';
import { WALL } from './compile';

export const BSTEP = { arrive: 0, ring: 1, spray: 2, place: 3, brute: 4, free: 5, dry: 6, hands: 7, after: 8 } as const;

/** Each step's group, per driven lane, as [archetype, count]. */
const GROUPS: Record<number, readonly (readonly [number, number])[]> = {
  [BSTEP.spray]: [[ARCH.swarmer, 5]],
  [BSTEP.place]: [[ARCH.caster, 2]],
  [BSTEP.brute]: [[ARCH.brute, 1]],
};
/** After the lesson: these in turn. */
const FREE: readonly (readonly (readonly [number, number])[])[] = [
  [[ARCH.swarmer, 4], [ARCH.caster, 1]],
  [[ARCH.brute, 1], [ARCH.swarmer, 3]],
  [[ARCH.caster, 2], [ARCH.swarmer, 3]],
];
/** Through the gate once the well is dry, per wizard, in turn: small, since you have one rune (beat 7). */
const HANDS: readonly (readonly (readonly [number, number])[])[] = [
  [[ARCH.swarmer, 3]],
  [[ARCH.swarmer, 3], [ARCH.caster, 1]],
];

export const BWAVES = {
  /** Goblins battering each defence's wall as you arrive. */
  arrivals: 2,
  /** s of quiet before each group comes out of the trees. */
  pause: 3,
  spawnEvery: 0.5,
  /** Archers here keep this far off their defence's muzzle: past the flamethrower, inside Place's 18. */
  archerStandoff: 13,
  /** How far out from the wall's line enemies stand to batter it, and north of the stakes they hack at. */
  wallStand: 4, stakeStand: 0.9,
  /** How far apart a group comes out of its gap, across it. */
  spread: 2.4,
} as const;

const TOWER = 'defence-tower';
const towersOf = (w: World) => w.def.props.filter((p) => p.asset === TOWER);
/** The spot in front of defence k's tower, just outside the wall: its muzzle, where a driver's body stands. */
export const muzzleOf = (w: World, k: number): [number, number] => [towersOf(w)[k].x, BATTERY.wallY - BATTERY.muzzleGap];

export const driverOf = (w: World, k: number): number => (w.battery ? w.battery.drive.indexOf(k) : -1);

/**
 * Where a lane enemy stands to batter something, spread out by its slot. With a driver to go for (`t`), the wall in
 * front of that driver's defence, `wallStand` out from it (the user: they hugged the wall). With nobody driving: as you
 * arrive, the line of stakes nearest its own defence, on the far side; after that, its own defence's wall.
 */
export function holdSpot(w: World, i: number, t: number): [number, number] {
  const d = w.battery!, k = t >= 0 ? d.drive[t] : d.lane[i], across = ((i % 5) - 2) * 0.8;
  if (t < 0 && w.enc.state[1] === BSTEP.arrive) {
    const tx = towersOf(w)[k].x, stakes = w.def.props.filter((p) => p.asset === 'stakes');
    let s = stakes[0];
    for (const p of stakes) if (Math.abs(p.x - tx) < Math.abs(s.x - tx)) s = p;
    if (s) return [s.x + across * 1.2, s.y - BWAVES.stakeStand];
  }
  return [towersOf(w)[k].x + across, BATTERY.wallY - BWAVES.wallStand];
}

/**
 * Who a lane enemy goes for: its own defence's driver, else the nearest driver, else nobody (-1: it batters its own
 * wall, enemies.ts holdWall).
 */
export function laneTarget(w: World, i: number): number {
  const d = w.battery, k = d ? d.lane[i] : -1;
  if (k < 0) return -1;
  const own = driverOf(w, k);
  if (own >= 0) return own;
  const b = w.bodies;
  let best = -1, bd = Infinity;
  for (let s = 0; s < MAX_SEATS; s++) {
    if (d!.drive[s] < 0) continue;
    const dd = len(b.x[s] - b.x[i], b.y[s] - b.y[i]);
    if (dd < bd) { bd = dd; best = s; }
  }
  return best;
}

/** An enemy out of the trees, sent at defence `k`'s lane (-1: none, it hunts wizards as anywhere else). */
function spawnAt(w: World, k: number, arch: number, x: number, y: number, loop: number): void {
  const a = ARCHETYPES[arch], b = w.bodies;
  const i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, a.hp * (1 + 0.3 * loop), a.radius);
  if (i >= 0) { b.arch[i] = arch; b.dmgMult[i] = 1; b.speedMult[i] = 1; b.face[i] = 0.25; w.battery!.lane[i] = k; }
}

/**
 * Open a group from the treeline gap nearest each defence that has someone: down every driven lane, or, once the well
 * is dry, one group for each wizard (from the gap nearest the defence of the same number).
 */
function openGroup(w: World, groups: readonly (readonly [number, number])[]): void {
  const e = w.enc, d = w.battery!, towers = towersOf(w), gaps = w.def.portals, dry = w.enc.state[1] >= BSTEP.dry;
  const n = groups.reduce((s, [, c]) => s + c, 0);
  for (let k = 0; k < MAX_PORTALS; k++) {
    e.left[k] = e.total[k] = 0;
    if (k >= towers.length || !gaps.length || !(dry ? k < MAX_SEATS && w.seats.active[k] : d.drive.includes(k))) continue;
    let best = 0;
    for (let g = 1; g < gaps.length; g++) if (Math.abs(gaps[g][0] - towers[k].x) < Math.abs(gaps[best][0] - towers[k].x)) best = g;
    e.px[k] = gaps[best][0]; e.py[k] = gaps[best][1];
    e.left[k] = e.total[k] = n; e.next[k] = k * 6;
  }
}

function archAt(groups: readonly (readonly [number, number])[], j: number): number {
  for (const [a, c] of groups) { if (j < c) return a; j -= c; }
  return groups[groups.length - 1][0];
}

const groupOf = (step: number, n: number) => (step === BSTEP.free ? FREE[n % FREE.length] : step === BSTEP.hands ? HANDS[n] : GROUPS[step]);

/** Enemies still standing, and still to come out. */
function remaining(w: World): number {
  let n = 0;
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) n++;
  for (let k = 0; k < MAX_PORTALS; k++) n += w.enc.left[k];
  return n;
}

/**
 * Beat 5: the well's flow falls, and once it's out the well runs dry when no defence has a whole rune left (or after
 * WELL.grace, so holding a rune back doesn't stall it).
 */
function failWell(w: World): void {
  const d = w.battery!, s = w.seats;
  d.flow[0] = Math.max(0, d.flow[0] - 1 / T(WELL.fail));
  if (d.flow[0] > 0) return;
  d.wellT[0]++;
  let held = false;
  for (let i = 0; i < MAX_SEATS; i++) if (d.drive[i] >= 0 && s.runes[i * N_EL + EL.fire - 1] >= 1) held = true;
  if (held && d.wellT[0] < T(WELL.grace)) return;
  runDry(w);
}

/** Beat 6: everyone at a defence is put back where they stepped up, and the well goes dark (the gate's fire gutters: below). */
function runDry(w: World): void {
  const d = w.battery!, st = w.enc.state, tick = w.clock[0];
  st[1] = BSTEP.dry; st[2] = 0; d.wellT[1] = 1;
  w.enc.left.fill(0); // what was still to come out of the trees stays there
  for (let i = 0; i < MAX_SEATS; i++) if (d.drive[i] >= 0) stepAway(w, i);
  const well = w.def.props.find((p) => p.asset === 'battery-well');
  if (well) w.events.push({ tick, kind: 'burst', who: -1, x: well.x, y: well.y, amount: 1, look: EL.fire, text: 'dry' });
}

/** WELL.gutter after the well runs dry, the gate's fire is out (the view lowers it till then: view-structures.ts curtain). */
function gutterGate(w: World): void {
  const wl = w.walls;
  for (let k = 0; k < wl.type.length; k++) {
    if (wl.type[k] !== WALL.curtain || wl.owner[k] !== TERRAIN) continue;
    w.events.push({ tick: w.clock[0], kind: 'burst', who: -1, x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, amount: 0.6, look: EL.fire, text: 'gutter' });
    wl.type[k] = WALL.none;
  }
}

/** The infusion: a Fire pool of your own lights, full (world.ts infused), and the enemies left stop battering walls and come for you. */
function infuse(w: World): void {
  const d = w.battery!, s = w.seats, b = w.bodies, st = w.enc.state;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i]) continue;
    s.runes[i * N_EL + EL.fire - 1] = WELL.own;
    w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: b.x[i], y: b.y[i], amount: 1, look: EL.fire, text: 'infuse' });
  }
  d.lane.fill(-1);
  st[1] = BSTEP.hands; st[2] = T(WELL.through); st[3] = -1; // the first HANDS group opens once the pause is out (below)
}

export function tickBatteryWaves(w: World): void {
  const e = w.enc, st = e.state, d = w.battery!;
  if (!st[0]) {
    // as you arrive: goblins hacking at the stakes out in front of every defence (they take their spots: holdSpot)
    const towers = towersOf(w), stakes = w.def.props.filter((p) => p.asset === 'stakes');
    for (let k = 0; k < towers.length; k++) {
      let s = stakes[0];
      for (const p of stakes) if (Math.abs(p.x - towers[k].x) < Math.abs(s.x - towers[k].x)) s = p;
      const [x, y] = s ? [s.x, s.y - 2] : muzzleOf(w, k);
      for (let j = 0; j < BWAVES.arrivals; j++) spawnAt(w, k, ARCH.swarmer, x + (j - (BWAVES.arrivals - 1) / 2) * 1.4, y - (j % 2) * 0.5, 0);
    }
    st[0] = 1; st[1] = BSTEP.arrive; st[2] = 0; st[3] = 0;
    return;
  }
  const driven = d.drive.some((k) => k >= 0);
  if (st[1] === BSTEP.arrive) { if (driven) st[1] = BSTEP.ring; return; }
  if (d.wellT[1] > 0) { d.wellT[1]++; if (d.wellT[1] === T(WELL.gutter)) gutterGate(w); }
  if (st[1] === BSTEP.free) failWell(w);
  if (st[1] === BSTEP.dry) { if (d.wellT[1] > T(WELL.surge)) infuse(w); return; }
  if (st[1] === BSTEP.after) return;
  // a group still coming out of the trees
  const groups = groupOf(st[1], st[3]);
  if (groups) {
    for (let k = 0; k < MAX_PORTALS; k++) {
      if (!e.left[k] || --e.next[k] > 0) continue;
      const j = e.total[k] - e.left[k];
      spawnAt(w, st[1] === BSTEP.hands ? -1 : k, archAt(groups, j), e.px[k] + ((j % 3) - 1) * BWAVES.spread, e.py[k] - (j % 2) * 0.8, st[1] === BSTEP.free ? Math.floor(st[3] / FREE.length) : 0);
      e.left[k]--; e.next[k] = T(BWAVES.spawnEvery);
    }
  }
  // before the well is dry nothing comes while nobody is at a defence
  if (remaining(w) || (!driven && st[1] < BSTEP.dry)) return;
  // this step's enemies are all gone: a short quiet, then the next step's group
  if (st[2] === 0) { st[2] = T(BWAVES.pause); return; }
  if (--st[2] > 0) return;
  if (st[1] === BSTEP.free) st[3]++;
  else if (st[1] === BSTEP.hands) { if (!HANDS[++st[3]]) { st[1] = BSTEP.after; return; } }
  else st[1]++;
  openGroup(w, groupOf(st[1], st[3])!);
}

/** Where a battery archer stands: off its target, on the line it came in on, past the flamethrower's reach. */
export function batteryStandoff(w: World, i: number, t: number): [number, number] {
  const b = w.bodies, ax = b.x[i] - b.x[t], ay = b.y[i] - b.y[t], al = len(ax, ay) || 1;
  return [b.x[t] + (ax / al) * BWAVES.archerStandoff, b.y[t] + (ay / al) * BWAVES.archerStandoff];
}
