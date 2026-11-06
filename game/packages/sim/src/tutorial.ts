/**
 * The tutorial (docs/explorations/2026-11-06-tutorial.md), the first prototype cut: eight beats in one
 * chamber, each a small problem the new skill solves, then an end card with three arches.
 *
 *   1 Walk     step on three glowing floor stones
 *   2 Strike   knock down three straw goblins with the staff
 *   3 Heavy    shove a straw sack into the painted ring with a Heavy
 *   4 Retreat  a soft Brute slams twice and hits nobody
 *   5 Defend   parry an archer's bolt with the training buckler
 *   7 Fire     burn the bramble hedge across the way out (only fire hurts brambles)
 *   8 Douse    cross the burning floor, then put yourself out (Water on yourself)
 *   9 Steam    three straw goblins in the rain: Water + Fire scalds through the wet
 *   20 End     three arches: the Sanctum, Survive, the Arena
 *
 * Shared rules: when a beat's check passes (or everyone stands on its "I know this" stone for a
 * second) the exit arch on the east lights; walking into it fades the chamber out and lays out the
 * next beat, with everyone back at the entry and the new beat's pools full (runeMax reads them, so
 * locked elements are max 0). You can't die: at 0 hp you faint for a moment and get up at full; if
 * every wizard has fainted, the beat starts over.
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
import {
  CAST_ID, KIND, MAX_SEATS, PHASE, QUEUE_MAX, SURF, TEAM, TERRAIN, WARD, ZONE, runeMax, spawnBody, type World,
} from './world';
import { TAG, TS, TUT_BEAT, TUT_BUCKLER_HP, TUT_END, TUT_PLACES as P, TUT_TIMES, nextBeat } from './tutorial-data';

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Active wizards (seat order). */
function wizards(w: World): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && w.bodies.kind[s] === KIND.wizard) out.push(s);
  return out;
}
/** Is any body tagged `tag` still standing? */
function anyTagged(w: World, tag: number): boolean {
  const b = w.bodies, t = w.tut!;
  for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && t.tag[i] === tag) return true;
  return false;
}
/** The first body tagged `tag`, or -1. */
function firstTagged(w: World, tag: number): number {
  const b = w.bodies, t = w.tut!;
  for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && t.tag[i] === tag) return i;
  return -1;
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
    b.wet[i] = b.burn[i] = b.frozen[i] = b.stun[i] = b.expose[i] = b.down[i] = b.root[i] = 0; b.chill[i] = 0; b.heldBy[i] = -1;
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

/** Lays out `beat` (design numbering): the chamber's rock, its targets, everyone at the entry. */
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
    case TUT_BEAT.retreat:
      spawn(w, ARCH.brute, TAG.foe, 4, 0, { dmg: 0.25, speed: 0.6 });
      break;
    case TUT_BEAT.defend:
      // a soft archer that stays put; low rock on either side of it, so it reads as a firing post
      spawn(w, ARCH.caster, TAG.foe, 0.5, 0, { hp: 20, dmg: 0.25, speed: 0 });
      rock(w, 1.6, -2.4, 1.6, -1.2); rock(w, 1.6, 1.2, 1.6, 2.4);
      break;
    case TUT_BEAT.fire: {
      // a rock line across the chamber, the way out stopped by a hedge of brambles; a thick one off to the side
      const x = P.hedgeX, g = P.hedgeGap, h = w.dims.h / 2;
      rock(w, x, -h, x, -g); rock(w, x, g, x, h);
      for (let k = 0; k < P.hedgeN; k++) spawn(w, ARCH.bramble, TAG.hedge, x, -1 + k, { r: 0.55 });
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
    default:
      break;
  }
}

/** Called first in each step: a new tutorial world lays out its first beat (world.ts can't import this file). */
export function beginTutorialTick(w: World): void {
  const t = w.tut!;
  if (t.state[TS.fade] < 0) setupBeat(w, t.state[TS.beat]);
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
    // everyone is down at once: the beat starts over (they still lie there a moment)
    const keep = ws.map((i) => t.faint[i]);
    setupBeat(w, st[TS.beat]);
    ws.forEach((i, k) => { t.faint[i] = keep[k]; b.down[i] = keep[k]; });
    return;
  }

  // Between beats: the fade, then the next beat's layout.
  if (st[TS.fade] > 0) { if (--st[TS.fade] === 0) setupBeat(w, nextBeat(st[TS.beat])); return; }
  if (st[TS.beat] === TUT_END) { tickExits(w); return; }

  // What a beat keeps up while it runs.
  if (st[TS.beat] === TUT_BEAT.douse && st[TS.ticks] % 30 === 0) layFire(w);
  if (st[TS.beat] === TUT_BEAT.steam) layRain(w);

  if (!st[TS.lit] && check(w)) st[TS.lit] = 1;

  // "I know this": everyone stands on the stone for a second and the beat counts as done.
  if (!st[TS.lit]) {
    const all = ws.length > 0 && ws.every((i) => dist(b.x[i], b.y[i], P.skip[0], P.skip[1]) < P.skipR);
    st[TS.skip] = all ? st[TS.skip] + 1 : 0;
    if (st[TS.skip] >= T(P.skipTime)) st[TS.lit] = 2;
  }

  // The lit arch: anyone walking into it takes everyone on.
  if (st[TS.lit] && ws.some((i) => dist(b.x[i], b.y[i], P.arch[0], P.arch[1]) < P.archR)) st[TS.fade] = T(TUT_TIMES.fade);
}
