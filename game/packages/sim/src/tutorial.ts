/**
 * The tutorial (docs/explorations/2026-11-06-tutorial.md; pass 2: 2026-11-06-tutorial-pass-2.md):
 * nineteen beats in one chamber, each a small problem the new skill solves, then an end card.
 *
 *   chapter 1, your hands (no runes)
 *   1 Walk       step on three glowing floor stones
 *   2 Strike     knock down three straw goblins with the staff
 *   3 Heavy      shove a straw sack into the painted ring with a Heavy
 *   4 Retreat    a soft Brute walks in and slams twice; hop out of it
 *   5 Defend     parry an archer's bolt with the training buckler
 *   6 Hands      four soft goblins walk in from four sides: Sweep (Shift+RMB) catches them all
 *   chapter 2, one rune at a time
 *   7 Fire       burn the bramble hedge across the way out (only fire hurts brambles)        Force
 *   8 Douse      cross the burning floor, then put yourself out (Water on yourself)          Self
 *   9 Steam      three straw goblins in the rain: Water + Fire scalds through the wet       a mix
 *   10 Cold      five goblins walk in: a frost ring (Cold, Shift+RMB tap) chills them all    Area
 *   11 Opposites queue Fire, then Cold: they cancel and the runes come back
 *   12 Lightning rain on a cluster (Water, hold Shift+RMB), then a lightning arc            Place
 *   13 Shatter   two straw goblins in a puddle: ice freezes the wet, a rock shatters them
 *   14 Fireball  a bramble out in a pit you can't step into: Earth + Fire throws the fire
 *   15 Life      heal the wounded dummy without waking the goblin asleep beside it
 *   16 Shield    two archers walk in: walls stop three of their arrows                       Place (wall)
 *   17 Arcane    the same archers, soft: an Arcane beam reaches them
 *   18 Sigil     two lanes of goblins: a flame sword (Shift+LMB) or a turret (RMB)           Weapon
 *   chapter 3
 *   19 The test  two announced waves, real fights at 0.6x damage
 *   20 End       three arches: the Sanctum, Survive, the Arena
 *
 * Shared rules: when a beat's check passes (or everyone stands on its "I know this" stone for a
 * second) the exit arch on the east lights; walking into it fades the chamber out and lays out the
 * next beat, with everyone back at the entry and the new beat's pools full (runeMax reads them, so
 * locked elements are max 0). You can't die: at 0 hp you faint for a moment and get up at full; if
 * every wizard has fainted, the beat starts over (the test: its current wave).
 *
 * A calm start: nothing hostile stands in the chamber when a beat begins. Enemies walk in through
 * gates on the far walls (tutorial-data TUT_ARRIVALS) only once the calm is over: when someone steps
 * on the ready stone ahead of the entry (after a short warning), or after a few seconds by
 * themselves. Straw targets, brambles and the sleeping goblin stand ready, away from the entry.
 *
 * The prototype completes the personal beats (Walk, Retreat, Defend, Douse) when any one player
 * does them; the full build gives each seat a done-bit (w.tut.done) and waits for everyone.
 *
 * Everything here is state in w.tut and the world's pools, and runs inside step(), so it rolls back
 * and replays like the rest. The checks read this tick's events: tickTutorial runs last in the step.
 */
import { ARCH, ARCHETYPES } from './archetypes';
import { ARMS, SHAPES, T } from './config';
import { EL, N_EL } from './elements';
import { WALL } from './compile';
import { cellAt, spawnZone, stored, touchFloor } from './effects';
import { conjureGuard } from './guards';
import { atan2Turns } from './trig';
import {
  CAST_ID, KIND, MAX_SEATS, PHASE, QUEUE_MAX, SURF, TEAM, TERRAIN, WARD, ZONE, runeMax, spawnBody, type World,
} from './world';
import {
  TAG, TS, TUT_BEAT, TUT_BUCKLER_HP, TUT_END, TUT_PLACES as P, TUT_TIMES, arrivalsOf, calmOf, nextBeat, wavesOf, type Arrival,
} from './tutorial-data';

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Active wizards (seat order). */
function wizards(w: World): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && w.bodies.kind[s] === KIND.wizard) out.push(s);
  return out;
}
/** Is any body tagged `tag` still standing? */
function anyTagged(w: World, tag: number): boolean {
  return firstTagged(w, tag) >= 0;
}
/** The first body tagged `tag`, or -1 (enemies and the tutorial's dummy). */
function firstTagged(w: World, tag: number): number {
  const b = w.bodies, t = w.tut!;
  for (let i = MAX_SEATS; i < b.kind.length; i++) if ((b.kind[i] === KIND.enemy || b.kind[i] === KIND.dummy) && t.tag[i] === tag) return i;
  return -1;
}
/** Is anything that walked in still standing (the sleeper doesn't count until it wakes)? */
function anyHostile(w: World): boolean {
  return anyTagged(w, TAG.foe) || anyTagged(w, TAG.goblin) || anyTagged(w, TAG.chilled);
}

/** Spawns an enemy of archetype `arch` tagged for the tutorial. hp / radius default to the archetype's. */
function spawn(w: World, arch: number, tag: number, x: number, y: number, o: { hp?: number; r?: number; dmg?: number; speed?: number } = {}): number {
  const a = ARCHETYPES[arch], i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, o.hp ?? a.hp, o.r ?? a.radius);
  if (i < 0) return -1;
  const b = w.bodies;
  b.arch[i] = arch; b.face[i] = 0.5; // facing west, toward the entry
  if (o.dmg !== undefined) b.dmgMult[i] = o.dmg;
  if (o.speed !== undefined) b.speedMult[i] = o.speed;
  w.tut!.tag[i] = tag;
  return i;
}
/** Someone walks in through their gate, facing into the chamber. */
function arrive(w: World, a: Arrival): void {
  const [x, y] = P.gates[a.gate], i = spawn(w, a.arch, a.tag, x, y, a);
  if (i >= 0) w.bodies.face[i] = atan2Turns(-y, -x);
}

/** Lays a rock segment the players can't break (the chamber's own). */
function rock(w: World, x1: number, y1: number, x2: number, y2: number): void {
  const wl = w.walls;
  for (let k = 0; k < wl.type.length; k++) {
    if (wl.type[k]) continue;
    wl.type[k] = WALL.rock; wl.owner[k] = TERRAIN; wl.x1[k] = x1; wl.y1[k] = y1; wl.x2[k] = x2; wl.y2[k] = y2;
    wl.hp[k] = wl.maxHp[k] = 1e6; wl.born[k] = w.clock[0];
    wl.els.fill(0, k * N_EL, k * N_EL + N_EL);
    return;
  }
}

/** Beat 8's burning band, laid (and kept burning) across the whole chamber. */
function layFire(w: World): void {
  const d = w.dims, [x0, x1] = P.fireBand;
  for (let y = -d.h / 2 + 0.25; y < d.h / 2; y += 0.5) for (let x = x0 + 0.25; x < x1; x += 0.5) {
    const c = cellAt(w, x, y);
    if (c >= 0 && w.surf.kind[c] !== SURF.fire) touchFloor(w, c, EL.fire);
    if (c >= 0) w.surf.life[c] = Math.max(w.surf.life[c], T(4));
  }
}

/** Beat 13's puddle: water, laid again every so often (whatever froze or burned it). */
function layPuddle(w: World): void {
  const [px, py] = P.puddle, r = P.puddleR;
  for (let y = -r; y <= r; y += 0.5) for (let x = -r; x <= r; x += 0.5) {
    if (x * x + y * y > r * r) continue;
    const c = cellAt(w, px + x, py + y);
    if (c < 0) continue;
    w.surf.kind[c] = SURF.water; w.surf.life[c] = Math.max(w.surf.life[c], T(4));
  }
}

const RAIN_ELS = new Uint8Array(N_EL);
RAIN_ELS[EL.water - 1] = 1;
/** Beat 9's rain over the pen: a long Rain zone from nobody, topped up before it ends. */
function layRain(w: World): void {
  const z = w.zones;
  for (let k = 0; k < z.type.length; k++) if (z.type[k] === ZONE.rain && z.owner[k] === -1) { if (z.life[k] < T(2)) z.life[k] = T(30); return; }
  spawnZone(w, ZONE.rain, -1, stored(RAIN_ELS, 0, 0, 0, EL.water), P.pen[0], P.pen[1], P.penR, T(30), 0);
}

/** Empties the chamber: every body but the wizards, every missile, zone, floor, wall, front and device. */
function clearChamber(w: World): void {
  const b = w.bodies, t = w.tut!;
  for (let i = MAX_SEATS; i < b.kind.length; i++) { b.kind[i] = KIND.none; t.tag[i] = TAG.none; }
  w.missiles.alive.fill(0);
  w.zones.type.fill(0);
  w.surf.kind.fill(0); w.surf.life.fill(0);
  w.walls.type.fill(0);
  w.waves.alive.fill(0);
  w.devices.type.fill(0);
  w.nav.timer[0] = 0; // steer round the new rock at once
}

/** Puts every wizard back at the entry, whole, with the beat's pools full and nothing queued or conjured. */
function resetWizards(w: World, beat: number): void {
  const b = w.bodies, s = w.seats, t = w.tut!;
  wizards(w).forEach((i) => {
    const [ox, oy] = P.seatOff[i];
    b.x[i] = P.entry[0] + ox; b.y[i] = P.entry[1] + oy; b.vx[i] = b.vy[i] = b.kx[i] = b.ky[i] = 0; b.face[i] = 0;
    b.hp[i] = b.maxHp[i];
    b.wet[i] = b.burn[i] = b.frozen[i] = b.stun[i] = b.expose[i] = b.down[i] = b.root[i] = b.blessT[i] = 0; b.bless.fill(0, i * 5, i * 5 + 5); b.chill[i] = 0; b.heldBy[i] = -1;
    s.dashT[i] = s.retreatT[i] = s.guardCd[i] = s.guardT[i] = 0;
    s.queue.fill(0, i * QUEUE_MAX, (i + 1) * QUEUE_MAX); s.queueLen[i] = 0;
    s.phase[i] = PHASE.idle; s.timer[i] = 0; s.chanTicks[i] = 0; s.handT[i] = 0; s.specT[i] = 0; s.bufCast[i] = 0; s.bufTicks[i] = 0;
    s.ward[i] = WARD.none; s.wardBy[i] = -1; s.aura[i] = 0; s.wand[i] = 0; s.weapon[i] = 0; s.weaponUses[i] = 0; s.motes[i] = 0;
    s.double[i] = -1; s.linkTo[i] = -1; s.attune[i] = 0;
    for (let e = 1; e <= N_EL; e++) s.runes[i * N_EL + e - 1] = runeMax(w, i, e);
    // the training buckler, from the Defend beat on (re-given whole at every beat start)
    s.guard[i] = 0; s.guardEls.fill(0, i * N_EL, (i + 1) * N_EL);
    if (beat >= TUT_BEAT.defend) { conjureGuard(w, i, new Uint8Array(N_EL)); s.guardHp[i] *= TUT_BUCKLER_HP; }
    t.faint[i] = 0; t.done[i] = 0;
  });
}

/** Lays out `beat` (design numbering): the chamber's rock, its targets, everyone at the entry. Arrivals wait for the calm to end. */
export function setupBeat(w: World, beat: number): void {
  const t = w.tut!, st = t.state;
  st.fill(0);
  st[TS.beat] = beat;
  clearChamber(w);
  resetWizards(w, beat);
  switch (beat) {
    case TUT_BEAT.strike:
      for (const [x, y] of [[0.5, -2.6], [1.5, 0], [0.5, 2.6]]) spawn(w, ARCH.straw, TAG.straw, x, y);
      break;
    case TUT_BEAT.heavy:
      spawn(w, ARCH.straw, TAG.sack, P.sack[0], P.sack[1], { hp: 999, r: 0.45 });
      break;
    case TUT_BEAT.fire: {
      // a rock line across the chamber, the way out stopped by a hedge of brambles; a thick one off to the side
      const x = P.rockX, g = P.hedgeGap, h = w.dims.h / 2;
      rock(w, x, -h, x, -g); rock(w, x, g, x, h);
      for (let k = 0; k < P.hedgeN; k++) spawn(w, ARCH.bramble, TAG.hedge, P.hedgeX, (k - (P.hedgeN - 1) / 2) * 1.0, { r: 0.6 });
      spawn(w, ARCH.bramble, TAG.bramble, P.thick[0], P.thick[1], { hp: 40, r: 0.7 });
      break;
    }
    case TUT_BEAT.douse:
      layFire(w);
      break;
    case TUT_BEAT.steam:
      for (const [x, y] of [[3.4, -0.9], [4.8, -0.6], [4, 0.9]]) spawn(w, ARCH.straw, TAG.straw, x, y, { hp: 25 });
      layRain(w);
      break;
    case TUT_BEAT.lightning:
      for (const [x, y] of P.cluster) spawn(w, ARCH.straw, TAG.straw, x, y, { hp: 30 });
      break;
    case TUT_BEAT.shatter:
      layPuddle(w);
      for (const [x, y] of P.puddled) spawn(w, ARCH.straw, TAG.straw, x, y, { hp: 40 });
      break;
    case TUT_BEAT.fireball:
      spawn(w, ARCH.bramble, TAG.far, P.pit[0], P.pit[1], { r: 0.6 });
      break;
    case TUT_BEAT.life: {
      // a training dummy on the players' side, badly hurt, and a goblin asleep (at 1 hp) beside it
      const k = spawnBody(w, -1, KIND.dummy, TEAM.players, P.patient[0], P.patient[1], 40, 0.42);
      if (k >= 0) { w.bodies.hp[k] = 10; t.tag[k] = TAG.patient; }
      const z = spawn(w, ARCH.swarmer, TAG.sleeper, P.sleeper[0], P.sleeper[1], { hp: 20, dmg: 0.25, speed: 0.8 });
      if (z >= 0) w.bodies.hp[z] = 1;
      break;
    }
    default:
      break;
  }
}

/** Called first in each step: a new tutorial world lays out its first beat (world.ts can't import this file). */
export function beginTutorialTick(w: World): void {
  const t = w.tut!;
  if (t.state[TS.fade] < 0) setupBeat(w, t.state[TS.beat]);
}

/** The latest `at` (ticks) of the current wave's arrivals. */
const lastAt = (beat: number, wave: number): number => arrivalsOf(beat, wave).reduce((m, a) => Math.max(m, T(a.at)), 0);
/** Have this wave's arrivals all walked in? (False while the calm lasts.) */
export function allArrived(w: World): boolean {
  const st = w.tut!.state;
  return st[TS.go] >= 2 && st[TS.go] - 2 >= lastAt(st[TS.beat], st[TS.wave]);
}

/**
 * The calm, the release and the arrivals: the calm counts up (the ready stone jumps it to a short
 * warning); at its end the wave is released, and its arrivals walk in through their gates on time.
 * The test's next wave starts its own calm once the last one is cleared.
 */
function tickArrivals(w: World): void {
  const st = w.tut!.state, beat = st[TS.beat], b = w.bodies;
  const waves = wavesOf(beat);
  if (!waves || st[TS.lit]) return;
  if (st[TS.go] === 0) {
    const full = T(calmOf(beat, st[TS.wave]));
    st[TS.calm]++;
    if (st[TS.wave] === 0 && wizards(w).some((i) => dist(b.x[i], b.y[i], P.ready[0], P.ready[1]) < P.readyR)) st[TS.calm] = Math.max(st[TS.calm], full - T(TUT_TIMES.warn));
    if (st[TS.calm] < full) return;
    st[TS.go] = 1;
  }
  const k = st[TS.go] - 1;
  for (const a of arrivalsOf(beat, st[TS.wave])) if (T(a.at) === k) arrive(w, a);
  if (k <= lastAt(beat, st[TS.wave])) st[TS.go]++;
  // the test: a cleared wave lets the next one's calm begin
  if (allArrived(w) && !anyHostile(w) && st[TS.wave] < waves - 1) { st[TS.wave]++; st[TS.go] = 0; st[TS.calm] = 0; }
}

/** Is the "I know this" stone there? Always, but in a beat with enemies only until they're let in (it's for skipping a lesson, not a fight). */
export function skipOpen(w: World): boolean {
  const st = w.tut!.state;
  return !st[TS.lit] && (!wavesOf(st[TS.beat]) || (st[TS.go] === 0 && st[TS.wave] === 0));
}

/** Has the current beat been done? May bump its counters (state). Reads this tick's events. */
function check(w: World): boolean {
  const t = w.tut!, st = t.state, b = w.bodies, s = w.seats, ws = wizards(w);
  switch (st[TS.beat]) {
    case TUT_BEAT.walk:
      P.stones.forEach(([x, y], k) => { for (const i of ws) if (dist(b.x[i], b.y[i], x, y) < P.stoneR) st[TS.a] |= 1 << k; });
      return st[TS.a] === (1 << P.stones.length) - 1;
    case TUT_BEAT.strike:
    case TUT_BEAT.steam:
    case TUT_BEAT.lightning:
      return !anyTagged(w, TAG.straw);
    case TUT_BEAT.heavy: {
      // a Heavy is the staff's long shove: a 'strike' move with the Heavy's longer reach
      for (const e of w.events) if (e.kind === 'move' && e.text === 'strike' && e.who < MAX_SEATS && (e.amount ?? 0) > SHAPES.swingRange * (1 + ARMS.heavyReach) / 2) st[TS.b] = 1;
      const k = firstTagged(w, TAG.sack);
      return st[TS.b] === 1 && k >= 0 && dist(b.x[k], b.y[k], P.ring[0], P.ring[1]) < P.ringR;
    }
    case TUT_BEAT.retreat:
      return st[TS.a] >= 2; // noteSlam counts them
    case TUT_BEAT.defend:
      for (const e of w.events) if (e.kind === 'move' && e.text === 'parry' && e.who < MAX_SEATS) st[TS.a]++;
      return st[TS.a] >= 1;
    case TUT_BEAT.hands:
    case TUT_BEAT.arcane:
      return allArrived(w) && !anyHostile(w);
    case TUT_BEAT.fire:
      return !anyTagged(w, TAG.hedge);
    case TUT_BEAT.douse: {
      // anyone who has caught fire, then put themselves out with Water on themselves
      for (const i of ws) if (b.burn[i] > 0) st[TS.b] |= 1 << i;
      for (const e of w.events) {
        const i = e.who;
        if (e.kind !== 'cast' || i < 0 || i >= MAX_SEATS || !(st[TS.b] & (1 << i)) || b.burn[i] > 0 || s.castId[i] !== CAST_ID.self) continue;
        for (let k = 0; k < s.castLen[i]; k++) if (s.castQueue[i * QUEUE_MAX + k] === EL.water) { st[TS.a] = 1; t.done[i] = 1; }
      }
      return st[TS.a] === 1;
    }
    case TUT_BEAT.cold: {
      // every goblin the frost touches counts; done when none walks in unchilled
      for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && t.tag[i] === TAG.goblin && b.chill[i] > 0) { t.tag[i] = TAG.chilled; st[TS.a]++; }
      return allArrived(w) && !anyTagged(w, TAG.goblin);
    }
    case TUT_BEAT.cancel:
      for (const e of w.events) if (e.kind === 'cancel' && e.who >= 0 && e.who < MAX_SEATS) st[TS.a] = 1;
      return st[TS.a] === 1;
    case TUT_BEAT.shatter:
      for (const e of w.events) if (e.kind === 'shatter' && e.who >= MAX_SEATS && t.tag[e.who] === TAG.straw) st[TS.a]++;
      return st[TS.a] >= 2;
    case TUT_BEAT.fireball:
      return !anyTagged(w, TAG.far);
    case TUT_BEAT.life: {
      const k = firstTagged(w, TAG.patient);
      return k >= 0 && b.hp[k] >= b.maxHp[k] - 0.01;
    }
    case TUT_BEAT.shield:
      return st[TS.a] >= 3; // noteBlocked counts them
    case TUT_BEAT.sigil: {
      // something conjured with Sigil: a weapon in hand, or a device of yours standing
      for (const i of ws) if (s.weapon[i]) st[TS.b] = 1;
      for (let k = 0; k < w.devices.type.length; k++) if (w.devices.type[k] && w.devices.owner[k] >= 0 && w.devices.owner[k] < MAX_SEATS) st[TS.b] = 1;
      return st[TS.b] === 1 && allArrived(w) && !anyHostile(w);
    }
    case TUT_BEAT.test:
      return st[TS.wave] === wavesOf(TUT_BEAT.test) - 1 && allArrived(w) && !anyHostile(w);
    default:
      return false;
  }
}

/** The end card: standing a second in one of the three arches picks where to go (the client switches rooms). */
function tickExits(w: World): void {
  const st = w.tut!.state, b = w.bodies;
  if (st[TS.exit]) return;
  let on = -1;
  for (const i of wizards(w)) P.exits.forEach(([x, y], k) => { if (dist(b.x[i], b.y[i], x, y) < P.exitR) on = k; });
  if (on < 0 || on !== st[TS.a] - 1) { st[TS.a] = on + 1; st[TS.b] = 0; return; }
  if (++st[TS.b] >= T(P.exitTime)) st[TS.exit] = on + 1;
}

/** What a beat keeps up while it runs: fire, rain, the puddle, the pit's edge, the sleeper's sleep. */
function keepUp(w: World): void {
  const t = w.tut!, st = t.state, b = w.bodies;
  switch (st[TS.beat]) {
    case TUT_BEAT.douse: if (st[TS.ticks] % 30 === 0) layFire(w); break;
    case TUT_BEAT.steam: layRain(w); break;
    case TUT_BEAT.shatter: if (st[TS.ticks] % 30 === 0) layPuddle(w); break;
    case TUT_BEAT.fireball:
      // nobody steps into the pit: wizards at its lip are held there (shots fly over it)
      for (const i of wizards(w)) {
        const dx = b.x[i] - P.pit[0], dy = b.y[i] - P.pit[1], d = Math.sqrt(dx * dx + dy * dy), min = P.pitR + b.r[i];
        if (d < min) { const k = d > 1e-6 ? min / d : 0; b.x[i] = d > 1e-6 ? P.pit[0] + dx * k : P.pit[0] - min; b.y[i] = d > 1e-6 ? P.pit[1] + dy * k : b.y[i]; }
      }
      break;
    case TUT_BEAT.life:
      // the goblin sleeps (lying still) until something heals it past half; then it's up and coming for you
      for (let i = MAX_SEATS; i < b.kind.length; i++) {
        if (b.kind[i] !== KIND.enemy || t.tag[i] !== TAG.sleeper) continue;
        if (b.hp[i] > b.maxHp[i] / 2) { t.tag[i] = TAG.foe; st[TS.c] = 1; } else b.down[i] = Math.max(b.down[i], 2);
      }
      break;
    default:
      break;
  }
}

/** One tick of the tutorial, last in the step. */
export function tickTutorial(w: World): void {
  const t = w.tut!, st = t.state, b = w.bodies, ws = wizards(w);
  st[TS.ticks]++;

  // Fainting: tickHealth just stood a wizard at 0 hp back up at full (no waves run here); they lie still a moment.
  let fresh = false;
  for (const e of w.events) if (e.kind === 'fizzle' && e.text === 'downed' && e.who >= 0 && e.who < MAX_SEATS) { t.faint[e.who] = T(TUT_TIMES.faint); fresh = true; }
  let fainted = 0;
  for (const i of ws) if (t.faint[i] > 0) { fainted++; t.faint[i]--; b.down[i] = Math.max(b.down[i], t.faint[i]); }
  if (fresh && ws.length && fainted === ws.length && st[TS.beat] !== TUT_END) {
    // everyone is down at once: the beat starts over (the test: its current wave), calm again; they still lie there a moment
    const keep = ws.map((i) => t.faint[i]), wave = st[TS.wave];
    setupBeat(w, st[TS.beat]);
    if (st[TS.beat] === TUT_BEAT.test) st[TS.wave] = wave;
    ws.forEach((i, k) => { t.faint[i] = keep[k]; b.down[i] = keep[k]; });
    return;
  }

  // Between beats: the fade, then the next beat's layout.
  if (st[TS.fade] > 0) { if (--st[TS.fade] === 0) setupBeat(w, nextBeat(st[TS.beat])); return; }
  if (st[TS.beat] === TUT_END) { tickExits(w); return; }

  keepUp(w);
  tickArrivals(w);

  if (!st[TS.lit] && check(w)) st[TS.lit] = 1;

  // "I know this": everyone stands on the stone for a second and the beat counts as done (once a fight is on, it waits for the next calm).
  if (!st[TS.lit] && skipOpen(w)) {
    const all = ws.length > 0 && ws.every((i) => dist(b.x[i], b.y[i], P.skip[0], P.skip[1]) < P.skipR);
    st[TS.skip] = all ? st[TS.skip] + 1 : 0;
    if (st[TS.skip] >= T(P.skipTime)) st[TS.lit] = 2;
  }

  // The lit arch: anyone walking into it takes everyone on.
  if (st[TS.lit] && ws.some((i) => dist(b.x[i], b.y[i], P.arch[0], P.arch[1]) < P.archR)) st[TS.fade] = T(TUT_TIMES.fade);
}
