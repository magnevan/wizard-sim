/**
 * Conjured guards (docs/explorations/2026-11-05-guards.md, built on its recommendations pending the
 * user's round-2 ratings). A guard is Shield + a lead element, conjured once; it lasts until its HP
 * runs out. It owns two gestures and two always-on traits:
 *
 *   Defend   Space (nothing queued): hold = block frontal hits into the guard's HP; a tap timed as a
 *            hit lands = parry, which stops the hit and sets off the guard's parry effect.
 *            Every guard blocks shots; only the Bulwark's block also stops melee (the others' block
 *            effects still answer a melee hit: Ember thorns, Tide shove). Only the Prism stops beams.
 *   Retreat  Shift+LMB (nothing queued): each guard moves you differently (one doesn't move you).
 *            Free, with a fixed 0.5 s recovery in which you can't Retreat or Defend again.
 *   Passive  always on while carried.
 *   Resists  always on while carried, from any direction (recommendation 1). A second element adds
 *            only its own resistance, at half strength (recommendation 3).
 *
 *   Guard (queue)          Defend: block / parry               Retreat       Passive
 *   Mirror buckler (S)     narrow / reflects a missile          Backstep      Light: full speed blocking, widest parry
 *   Bulwark (S+E)          wide, stops melee / bashes down      Brace         Anchored: no knockback (and 15 % slower)
 *   Ember targe (S+F)      thorns / a burst of flame            Flame step    Warm: no chill or freeze, dry at once
 *   Rime kite (S+C)        frosts the floor / freezes attacker  Ice slide     Sure-footed: no slipping on ice
 *   Spark ring (S+L)       weakest / chain discharge            Blink         Grounded: chain lightning skips you
 *   Tide shield (S+W)      shoves and soaks / a shoving wave    Surge         Doused: always wet, can't burn
 *   Prism pane (S+A)       stops beams / returns the beam       Phase         Hovering ward: halves frontal beams
 *   Leaf aegis (S+Li)      heals allies behind / burst heal     Regroup       Regrowth: slow healing
 */
import { ARMS, STATUS, T } from './config';
import { EL, N_EL } from './elements';
import { cellAt, floorDisc, hit, hitOpts, spawnZone, touchFloor, zap, type Payload } from './effects';
import { inCone, len } from './geom';
import { applyHit, bloom } from './hit';
import { cosTurns, sinTurns } from './trig';
import { payloadDamage, wallAt } from './walls';
import { WALL } from './compile';
import { GUARD, GUARD_NAME, KIND, MAX_SEATS, SURF, ZONE, type World } from './world';

/** Resistance columns. */
export const RES = { physical: 0, fire: 1, cold: 2, lightning: 3, arcane: 4 } as const;
/**
 * Share of damage each guard takes off (negative: extra), by column, while carried. Coarse tiers on
 * purpose (25 / 50 / immune): each guard is strong against its own element and weak against its opposite.
 */
const RES_TABLE: readonly (readonly number[])[] = [
  /* none    */ [0, 0, 0, 0, 0],
  /* bulwark */ [0.5, 0.25, 0.25, 0, 0],
  /* mirror  */ [0.25, 0, 0, 0, 0],
  /* ember   */ [0, 1, 0.5, 0, 0],
  /* rime    */ [0.25, -0.25, 1, 0, 0],
  /* spark   */ [-0.25, 0, 0, 1, 0],
  /* tide    */ [0, 0.5, -0.25, -0.5, 0],
  /* prism   */ [-0.25, 0, 0, 0, 0.5],
  /* leaf    */ [0, -0.25, 0, 0, 0.5],
];
/** The guard an element leads to, and the resistance column that is "its own" (-1: Water and Life deal no damage). */
const GUARD_OF: Record<number, number> = { [EL.earth]: GUARD.bulwark, [EL.fire]: GUARD.ember, [EL.cold]: GUARD.rime, [EL.lightning]: GUARD.spark, [EL.water]: GUARD.tide, [EL.arcane]: GUARD.prism, [EL.life]: GUARD.leaf };
const OWN_COL: Record<number, number> = { [EL.earth]: RES.physical, [EL.fire]: RES.fire, [EL.cold]: RES.cold, [EL.lightning]: RES.lightning, [EL.arcane]: RES.arcane };
/** Ties between equally many runes go in this order. */
const LEAD_ORDER = [EL.earth, EL.fire, EL.cold, EL.lightning, EL.water, EL.arcane, EL.life];
/** A guard's colour element (the view, events). */
export const GUARD_EL: readonly number[] = [0, EL.earth, EL.shield, EL.fire, EL.cold, EL.lightning, EL.water, EL.arcane, EL.life];

/** The element with the most runes in a 9-count block (skipping `skip`), ties in LEAD_ORDER; 0 for none. */
function leadOf(els: Uint8Array, at: number, skip = 0): number {
  let best = 0, n = 0;
  for (const id of LEAD_ORDER) { const c = els[at * N_EL + id - 1]; if (id !== skip && c > n) { best = id; n = c; } }
  return best;
}

export const guardOf = (w: World, i: number): number => (i >= 0 && i < MAX_SEATS ? w.seats.guard[i] : 0);
/** The guard's lead element (0 for the Mirror buckler) and its second element (0 for none). */
export const guardLead = (w: World, i: number): number => leadOf(w.seats.guardEls, i);
export const guardSecond = (w: World, i: number): number => leadOf(w.seats.guardEls, i, guardLead(w, i));

/** Shield + `counts` conjured as a guard by seat `src`: the lead element picks it. */
export function conjureGuard(w: World, src: number, counts: Uint8Array): void {
  const s = w.seats;
  s.guardEls.set(counts.subarray(0, N_EL), src * N_EL);
  s.guardEls[src * N_EL + EL.shield - 1] = 0;
  s.guardEls[src * N_EL + EL.sigil - 1] = 0;
  const lead = leadOf(s.guardEls, src);
  s.guard[src] = lead ? GUARD_OF[lead] : GUARD.mirror;
  s.guardHp[src] = (ARMS.hp as Record<string, number>)[GUARD_NAME[s.guard[src]]];
  s.guardT[src] = 0; s.guardCd[src] = 0; s.retreatT[src] = 0;
}

/** Share of damage in `col` that seat t's guard takes off (1 = immune, negative = takes more). 0 without a guard. */
export function resist(w: World, t: number, col: number): number {
  const g = guardOf(w, t);
  if (!g) return 0;
  let r = RES_TABLE[g][col];
  const e2 = guardSecond(w, t);
  if (e2 && OWN_COL[e2] === col) r += ARMS.secondRes * RES_TABLE[GUARD_OF[e2]][col];
  return Math.min(1, r);
}
/** The resistance column of an element's damage (Earth is physical), or -1. */
export const colOf = (id: number): number => OWN_COL[id] ?? -1;

// ---- passives ----------------------------------------------------------------------------------

/** Anchored (Bulwark): no knockback while carried. */
export const anchored = (w: World, i: number): boolean => guardOf(w, i) === GUARD.bulwark;
/** No chill or freeze: the Ember targe (Warm) and anything immune to cold. */
export const warm = (w: World, i: number): boolean => guardOf(w, i) === GUARD.ember || resist(w, i, RES.cold) >= 1;
/** Can't burn: immune to fire, or the Tide shield (always wet). */
export const unburnable = (w: World, i: number): boolean => guardOf(w, i) === GUARD.tide || resist(w, i, RES.fire) >= 1;
/** Never slips on ice (Rime kite). */
export const sureFooted = (w: World, i: number): boolean => guardOf(w, i) === GUARD.rime;
/** Grounded (Spark ring): chain lightning skips this seat. */
export const grounded = (w: World, i: number): boolean => guardOf(w, i) === GUARD.spark;
/** Phasing back (Prism pane's Retreat): passes through bodies. */
export const phased = (w: World, i: number): boolean => i < MAX_SEATS && ((guardOf(w, i) === GUARD.prism && w.seats.retreatT[i] > 0) || w.seats.dashT[i] > 0);
/** Braced (Bulwark's Retreat): doesn't move. */
export const braced = (w: World, i: number): boolean => guardOf(w, i) === GUARD.bulwark && w.seats.retreatT[i] > 0;
export const blocking = (w: World, i: number): boolean => guardOf(w, i) !== 0 && w.seats.guardT[i] > 0;

/** Walking speed from the guard: the Bulwark is slow, a raised guard slows you (the Mirror is Light), Brace stops you. */
export function walkMult(w: World, i: number): number {
  const g = guardOf(w, i);
  if (!g) return 1;
  if (braced(w, i)) return 0;
  const up = blocking(w, i);
  if (g === GUARD.bulwark) return ARMS.bulwarkWalk * (up ? ARMS.bulwarkBlockWalk : 1);
  return up && g !== GUARD.mirror ? ARMS.blockWalk : 1;
}

const blockHalf = (g: number): number => (g === GUARD.mirror ? ARMS.blockMirror : g === GUARD.bulwark ? ARMS.blockBulwark : ARMS.block);
const parryTicks = (g: number): number => T(g === GUARD.mirror ? ARMS.parryMirror : ARMS.parry);

/** Is an attack travelling along (dx, dy) coming at seat i's front, within its guard's arc? */
export function fromFront(w: World, i: number, dx: number, dy: number): boolean {
  const d = len(dx, dy);
  if (d < 1e-9) return false;
  return (-dx * cosTurns(w.bodies.face[i]) - dy * sinTurns(w.bodies.face[i])) / d >= cosTurns(blockHalf(guardOf(w, i)));
}
/** Blocking, and the press was recent enough to be a parry. */
export const parrying = (w: World, i: number): boolean => blocking(w, i) && w.seats.guardT[i] <= parryTicks(guardOf(w, i));

const move = (w: World, i: number, text: string, x2?: number, y2?: number, look = GUARD_EL[guardOf(w, i)]) =>
  w.events.push({ tick: w.clock[0], kind: 'move', who: i, x: w.bodies.x[i], y: w.bodies.y[i], x2, y2, text, look });

/** The guard soaks `amount`; at 0 it breaks. */
export function damageGuard(w: World, i: number, amount: number): void {
  const s = w.seats, g = s.guard[i];
  if (!g) return;
  s.guardHp[i] -= amount * (g === GUARD.spark ? ARMS.sparkBlock : 1);
  if (s.guardHp[i] <= 0) {
    move(w, i, 'guardbreak');
    s.guard[i] = GUARD.none; s.guardT[i] = 0; s.guardEls.fill(0, i * N_EL, (i + 1) * N_EL);
  }
}

// Scratch payloads (one rune of an element), never kept.
const ONE: Payload[] = [];
function one(id: number): Payload {
  if (!ONE[id]) { const c = new Uint8Array(N_EL); c[id - 1] = 1; ONE[id] = { counts: c, at: 0, heal: id === EL.life, scald: false, freeze: false, mod: id === EL.water ? 'push' : null, look: id, formN: 1 }; }
  return ONE[id];
}

const alive = (w: World, i: number) => w.bodies.kind[i] !== KIND.none;

/** Every body in a cone in front of seat i (not i): `fn(body, ux, uy)` with the push direction. */
function cone(w: World, i: number, range: number, half: number, fn: (j: number, ux: number, uy: number) => void): void {
  const b = w.bodies, f = b.face[i];
  for (let j = 0; j < b.kind.length; j++) {
    if (j === i || !alive(w, j) || !inCone(b.x[i], b.y[i], f, half, range, b.x[j], b.y[j], b.r[j])) continue;
    const dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], d = len(dx, dy) || 1;
    fn(j, dx / d, dy / d);
  }
}

/** A parry by seat i against `src` (the attacker, -1 unknown): each guard's own effect, a big flash and a one-word pop. */
function parryEffect(w: World, i: number, src: number, melee: boolean): void {
  const b = w.bodies, g = guardOf(w, i);
  move(w, i, 'parry');
  w.events.push({ tick: w.clock[0], kind: 'hit', who: i, x: b.x[i], y: b.y[i], amount: 0, text: 'Parry!' });
  const foe = src >= 0 && alive(w, src) && src !== i;
  const away = (j: number): [number, number] => { const dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], d = len(dx, dy) || 1; return [dx / d, dy / d]; };
  switch (g) {
    case GUARD.bulwark: // bashes the attacker down
      if (foe && len(b.x[src] - b.x[i], b.y[src] - b.y[i]) < 3) { const [ux, uy] = away(src); b.down[src] = Math.max(b.down[src], T(STATUS.knockdown * 2)); b.kx[src] += ux * 9; b.ky[src] += uy * 9; }
      break;
    case GUARD.ember: // a short burst of flame forward
      cone(w, i, 2.5, 0.16, (j, ux, uy) => { hit(w, j, one(EL.fire), hitOpts(one(EL.fire), i, 1, ux, uy)); });
      move(w, i, 'flameburst');
      break;
    case GUARD.rime: // freezes a melee attacker for a moment
      if (foe && melee) { b.frozen[src] = Math.max(b.frozen[src], T(1.5)); w.events.push({ tick: w.clock[0], kind: 'freeze', who: src, x: b.x[src], y: b.y[src] }); }
      break;
    case GUARD.spark: { // discharges a chain arc to the nearest enemies, stunning them
      const done: number[] = [i];
      for (let k = 0; k < 3; k++) {
        let best = -1, bd = 4;
        for (let j = 0; j < b.kind.length; j++) {
          if (!alive(w, j) || done.includes(j) || b.team[j] === b.team[i]) continue;
          const d = len(b.x[j] - b.x[i], b.y[j] - b.y[i]) - b.r[j];
          if (d < bd) { bd = d; best = j; }
        }
        if (best < 0) break;
        zap(w, i, best, one(EL.lightning), 0.8);
        done.push(best);
      }
      break;
    }
    case GUARD.tide: // a wave that shoves everything in front
      cone(w, i, 3.2, 0.2, (j, ux, uy) => { hit(w, j, one(EL.water), hitOpts(one(EL.water), i, 1, ux, uy)); b.kx[j] += ux * 10; b.ky[j] += uy * 10; });
      move(w, i, 'tidewave');
      break;
    case GUARD.leaf: healBehind(w, i, ARMS.leafParryHeal, true); break;
    default: break; // the Mirror and the Prism send the shot back (guardMissile, applyHit)
  }
}

/** Allies directly behind seat i (within 3 u, behind its back) are healed `amount`. */
function healBehind(w: World, i: number, amount: number, event: boolean): void {
  const b = w.bodies, fx = cosTurns(b.face[i]), fy = sinTurns(b.face[i]);
  for (let j = 0; j < MAX_SEATS; j++) {
    if (j === i || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
    const dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], d = len(dx, dy);
    if (d > 3 || (dx * fx + dy * fy) / (d || 1) > -0.4) continue;
    const before = b.hp[j];
    b.hp[j] = Math.min(b.maxHp[j], b.hp[j] + amount);
    bloom(w, i, j, b.hp[j] - before);
    if (event) w.events.push({ tick: w.clock[0], kind: 'heal', who: j, src: i, x: b.x[j], y: b.y[j], amount, look: EL.life });
  }
}

/**
 * A shot reaching seat i, travelling along (ux, uy). 0: not blocked (it hits as usual); 1: the guard
 * took it (the shot is spent); 2: sent back (the caller has turned it round).
 */
export function guardMissile(w: World, i: number, j: number, ux: number, uy: number): 0 | 1 | 2 {
  if (!blocking(w, i) || !fromFront(w, i, ux, uy)) return 0;
  const m = w.missiles, g = guardOf(w, i), src = m.owner[j];
  if (parrying(w, i)) {
    if (g === GUARD.mirror || g === GUARD.prism) {
      m.vx[j] = -m.vx[j]; m.vy[j] = -m.vy[j]; m.owner[j] = i; m.lastHit[j] = i;
      parryEffect(w, i, src, false);
      return 2;
    }
    parryEffect(w, i, src, false);
    return 1;
  }
  let dmg = payloadDamage(m.els, j, m.scale[j]);
  if (g === GUARD.ember && m.els[j * N_EL + EL.water - 1]) dmg = Math.max(dmg, 10) * ARMS.emberWater; // Water douses it
  damageGuard(w, i, dmg);
  move(w, i, 'block');
  return 1;
}

/**
 * An enemy's melee blow of `dmg` from `src` landing on seat t, travelling along (dx, dy). Returns
 * the share of it that lands: a parry stops it, a Bulwark block stops it; the rest are cut by the
 * guard's physical resistance. Block effects answer the attacker (Ember thorns, Tide shove).
 */
export function guardMelee(w: World, t: number, src: number, dmg: number, dx: number, dy: number): number {
  const g = guardOf(w, t);
  if (!g) return 1;
  const b = w.bodies, land = 1 - resist(w, t, RES.physical);
  if (!blocking(w, t) || !fromFront(w, t, dx, dy)) return land;
  if (parrying(w, t)) { parryEffect(w, t, src, true); return 0; }
  const foe = src >= 0 && alive(w, src);
  if (foe && g === GUARD.ember) { b.burn[src] = Math.max(b.burn[src], T(STATUS.burn)); b.burnSrc[src] = t; } // thorns
  if (foe && g === GUARD.tide) { applyHit(w, src, one(EL.water).counts, 0, { scale: 1, heal: false, scald: false, freeze: false, source: t, dirX: -dx, dirY: -dy, push: 0 }); b.kx[src] -= dx * 8; b.ky[src] -= dy * 8; }
  if (g === GUARD.bulwark) { damageGuard(w, t, dmg); move(w, t, 'block'); return 0; }
  return land;
}

/**
 * A beam (or spray) tick on seat t from `src`. Returns the scale left of it: the Prism pane stops it
 * while blocking (a parry turns it on its caster), and halves it from the front even when not.
 */
export function guardBeam(w: World, t: number, src: number, els: Uint8Array, at: number, scale: number, dx: number, dy: number): number {
  if (guardOf(w, t) !== GUARD.prism || !fromFront(w, t, dx, dy)) return 1;
  if (!blocking(w, t)) return 0.5;
  if (parrying(w, t) && src >= 0 && src !== t && alive(w, src)) {
    applyHit(w, src, els, at, { scale, heal: false, scald: false, freeze: false, source: t, dirX: -dx, dirY: -dy, push: 0 });
    if (w.clock[0] % 6 === 0) move(w, t, 'parry');
  } else {
    damageGuard(w, t, payloadDamage(els, at, scale));
    if (w.clock[0] % 12 === 0) move(w, t, 'block');
  }
  return 0;
}

// ---- Retreat -----------------------------------------------------------------------------------

/** Knockback speed that carries a body `d` units on plain floor (it decays by 0.86 a tick). */
const glide = (d: number): number => d * 0.14 * 60;

/** Lays an element on the floor along a line, every half cell, optionally with its own lifetime. */
function floorLine(w: World, x1: number, y1: number, x2: number, y2: number, el: number, life = 0): void {
  const d = len(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / 0.25));
  for (let k = 0; k <= n; k++) {
    const c = cellAt(w, x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n);
    if (c < 0) continue;
    touchFloor(w, c, el);
    if (life && w.surf.kind[c]) w.surf.life[c] = life;
  }
}

/** Can body i stand at (x, y): in the arena, not in rock, not on another body? */
function free(w: World, i: number, x: number, y: number): boolean {
  const b = w.bodies, r = b.r[i];
  if (Math.abs(x) > w.dims.w / 2 - r || Math.abs(y) > w.dims.h / 2 - r) return false;
  const k = wallAt(w, x, y, r);
  if (k >= 0 && w.walls.type[k] === WALL.rock) return false;
  for (let j = 0; j < b.kind.length; j++) if (j !== i && alive(w, j) && len(b.x[j] - x, b.y[j] - y) < b.r[j] + r) return false;
  return true;
}

/** Seat i's guard's Retreat, away from where it faces. Starts the fixed recovery. */
export function guardRetreat(w: World, i: number, face: number): void {
  const b = w.bodies, s = w.seats, g = guardOf(w, i);
  const bx = -cosTurns(face), by = -sinTurns(face), x = b.x[i], y = b.y[i];
  s.guardCd[i] = T(ARMS.retreatRecovery);
  s.guardT[i] = 0;
  const push = (d: number, ux = bx, uy = by) => { b.kx[i] += ux * glide(d); b.ky[i] += uy * glide(d); }; // your own move: never blocked by Anchored
  switch (g) {
    case GUARD.bulwark: s.retreatT[i] = T(ARMS.brace); move(w, i, 'brace'); return;
    case GUARD.ember: {
      push(ARMS.flameStep);
      floorLine(w, x, y, x + bx * ARMS.flameStep, y + by * ARMS.flameStep, EL.fire, T(ARMS.flameLine));
      move(w, i, 'flamestep', x + bx * ARMS.flameStep, y + by * ARMS.flameStep);
      return;
    }
    case GUARD.rime: {
      const d = ARMS.iceSlide;
      floorLine(w, x, y, x + bx * (d + 0.5), y + by * (d + 0.5), EL.cold);
      // on ice, knockback decays by 0.985 a tick, so the slide needs far less push
      b.kx[i] += bx * d * 1.8; b.ky[i] += by * d * 1.8; // most of it in the first 0.7 s; the strip's end stops you
      move(w, i, 'iceslide', x + bx * d, y + by * d);
      return;
    }
    case GUARD.spark: {
      let nx = x + bx * ARMS.blink, ny = y + by * ARMS.blink;
      for (let k = 0; k < 16 && !free(w, i, nx, ny); k++) { nx -= bx * (ARMS.blink / 16); ny -= by * (ARMS.blink / 16); }
      if (!free(w, i, nx, ny)) { nx = x; ny = y; }
      spawnZone(w, ZONE.spark, i, one(EL.lightning), x, y, 0.75, T(ARMS.spark), 0);
      w.events.push({ tick: w.clock[0], kind: 'blink', who: i, x, y, x2: nx, y2: ny });
      move(w, i, 'spark', nx, ny);
      b.x[i] = nx; b.y[i] = ny;
      if (b.heldBy[i] >= 0) b.kx[i] += bx * 8; // a big pull breaks a grabber's hold
      return;
    }
    case GUARD.tide: {
      push(ARMS.surge);
      cone(w, i, 3, 0.18, (j, ux, uy) => { hit(w, j, one(EL.water), hitOpts(one(EL.water), i, 1, ux, uy)); b.kx[j] += ux * 9; b.ky[j] += uy * 9; });
      floorDisc(w, x, y, 0.8, EL.water);
      move(w, i, 'surge', x + bx * ARMS.surge, y + by * ARMS.surge);
      return;
    }
    case GUARD.prism: push(ARMS.phase); s.retreatT[i] = T(ARMS.phaseTime); move(w, i, 'phase', x + bx * ARMS.phase, y + by * ARMS.phase); return;
    case GUARD.leaf: {
      let ally = -1, ad = ARMS.regroup;
      for (let j = 0; j < MAX_SEATS; j++) {
        if (j === i || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
        const d = len(b.x[j] - x, b.y[j] - y);
        if (d < ad) { ad = d; ally = j; }
      }
      if (ally < 0) break; // nobody near: a plain step back
      // the step back curves toward the ally: half back, mostly toward them, stopping beside them
      const tx = (b.x[ally] - x) / (ad || 1), ty = (b.y[ally] - y) / (ad || 1);
      const ux = bx * 0.35 + tx, uy = by * 0.35 + ty, ul = len(ux, uy) || 1;
      push(Math.max(0.5, ad - 1), ux / ul, uy / ul);
      for (const j of [i, ally]) { const before = b.hp[j]; b.hp[j] = Math.min(b.maxHp[j], b.hp[j] + ARMS.regroupHeal); w.events.push({ tick: w.clock[0], kind: 'heal', who: j, src: i, x: b.x[j], y: b.y[j], amount: b.hp[j] - before, look: EL.life }); }
      move(w, i, 'regroup', b.x[ally], b.y[ally]);
      return;
    }
    default: break;
  }
  push(ARMS.backstep); // the Mirror's crisp hop (and the Leaf's, with no ally near)
  move(w, i, 'backstep', x + bx * ARMS.backstep, y + by * ARMS.backstep);
}

// ---- per tick ----------------------------------------------------------------------------------

/** Guards' timers, passives and held-block effects; pins wearing off. After the surfaces, before statuses. */
export function tickGuards(w: World): void {
  const b = w.bodies, s = w.seats;
  for (let i = 0; i < b.kind.length; i++) if (b.root[i] > 0) b.root[i]--;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (s.guardCd[i] > 0) s.guardCd[i]--;
    if (s.retreatT[i] > 0) s.retreatT[i]--;
    if (s.dashT[i] > 0) s.dashT[i]--;
    const g = s.guard[i];
    if (!g || !s.active[i] || b.kind[i] !== KIND.wizard || b.downed[i]) continue;
    if (g === GUARD.ember) { b.wet[i] = 0; b.chill[i] = 0; b.frozen[i] = 0; b.burn[i] = 0; } // Warm: dry at once; fire can't hurt it
    else if (g === GUARD.tide) { b.wet[i] = Math.max(b.wet[i], T(1)); b.burn[i] = 0; } // Doused
    else if (g === GUARD.leaf && b.hp[i] > 0) b.hp[i] = Math.min(b.maxHp[i], b.hp[i] + ARMS.regrowth / 60); // Regrowth
    if (!s.guardT[i]) continue;
    if (g === GUARD.leaf) healBehind(w, i, ARMS.leafBlockHeal / 60, false);
    if (g === GUARD.rime && s.guardT[i] % 12 === 1) { // the block frosts the floor in front, so chargers slip
      const fx = cosTurns(b.face[i]), fy = sinTurns(b.face[i]);
      for (const f of [1.2, 1.8]) for (const sd of [-0.5, 0, 0.5]) { const c = cellAt(w, b.x[i] + fx * f - fy * sd, b.y[i] + fy * f + fx * sd); if (c >= 0 && w.surf.kind[c] !== SURF.fire) touchFloor(w, c, EL.cold); }
    }
  }
}
