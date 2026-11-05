/**
 * Conjured guards (docs/explorations/2026-11-05-guards.md, revised by the user's round-2 ratings in
 * 2026-11-05-guards-round-2.md). A guard is Shield + a lead element, conjured once; it lasts until its
 * HP runs out. It owns two gestures and two always-on traits:
 *
 *   Defend   Space (nothing queued): hold = block frontal hits into the guard's HP; a tap timed as a
 *            hit lands = parry, which stops the hit and sets off the guard's parry effect.
 *            Every guard blocks shots; only the Bulwark's block also stops melee (the others' block
 *            effects still answer a melee hit: Ember thorns, Tide shove). Only the Prism stops beams.
 *   Retreat  Shift+LMB (nothing queued): each guard moves you differently (one doesn't move you).
 *            Free, with a fixed 0.5 s recovery in which you can't Retreat or Defend again.
 *   Passive  always on while carried.
 *   Resists  always on while carried, from any direction. Carrying a guard costs a little walking speed.
 *   Mixing   the lead element sets Defend and Retreat; a second element mixes in its passive and its
 *            whole resistance row at half strength (the user's pick: "mix").
 *
 *   Guard (queue)          Defend: block / parry                 Retreat       Passive
 *   Mirror buckler (S)     narrow, glances shots / reflects one   Backstep 3u   Light: full speed blocking, widest parry
 *   Bulwark (S+E)          wide, stops melee / bashes down        Shove step    Anchored: no knockback (and 15 % slower)
 *   Ember targe (S+F)      thorns / a burst of flame              Flame step    Warm: no chill or freeze, dry at once
 *   Rime kite (S+C)        chills melee attackers / freezes them  Ice slide     Sure-footed: no slipping on ice
 *   Spark ring (S+L)       weakest / chain discharge              Blink         Grounded: chain lightning skips you
 *   Tide shield (S+W)      shoves and soaks / a shoving wave      Surge         Quenched: can't burn
 *   Prism pane (S+A)       stops beams and sprays / returns them  Phase         Clear: allies' beams and sprays don't hurt you
 *   Leaf aegis (S+Li)      heals allies around you / burst heal   Seed step     Regrowth: slow healing
 */
import { ARMS, STATUS, T } from './config';
import { EL, N_EL } from './elements';
import { cellAt, floorDisc, hit, hitOpts, spawnZone, touchFloor, zap, type Payload } from './effects';
import { inCone, len } from './geom';
import { addKnock, applyHit, bloom } from './hit';
import { cosTurns, sinTurns } from './trig';
import { payloadDamage, wallAt } from './walls';
import { WALL } from './compile';
import { GUARD, GUARD_NAME, KIND, MAX_SEATS, ZONE, type World } from './world';

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
/**
 * Who leads, as in spells (rules-c.js PRIORITY): the strongest element present (Life, then Earth, then
 * Arcane, then Lightning); without one, the most runes of Water, Fire or Cold (ties in that order).
 */
const STRONG = [EL.life, EL.earth, EL.arcane, EL.lightning];
const SPRAY = [EL.water, EL.fire, EL.cold];
/** A guard's colour element (the view, events). */
export const GUARD_EL: readonly number[] = [0, EL.earth, EL.shield, EL.fire, EL.cold, EL.lightning, EL.water, EL.arcane, EL.life];

/** The lead element of a 9-count block; 0 for none (Shield alone: the Mirror buckler). */
function leadOf(els: Uint8Array, at: number): number {
  for (const id of STRONG) if (els[at * N_EL + id - 1]) return id;
  let best = 0, n = 0;
  for (const id of SPRAY) { const c = els[at * N_EL + id - 1]; if (c > n) { best = id; n = c; } }
  return best;
}

export const guardOf = (w: World, i: number): number => (i >= 0 && i < MAX_SEATS ? w.seats.guard[i] : 0);
/** The guard's lead element (0 for the Mirror buckler). */
export const guardLead = (w: World, i: number): number => leadOf(w.seats.guardEls, i);
/** Runes of element `id` in seat i's guard other than its lead (its mixed-in elements). */
const extra = (w: World, i: number, id: number): number => (id === guardLead(w, i) ? 0 : w.seats.guardEls[i * N_EL + id - 1]);
/** How much of its row a mixed-in element brings: half at 1 rune, all of it at 2. */
const share = (n: number): number => Math.min(1, n * ARMS.mixShare);

/** Shield + `counts` conjured as a guard by seat `src`: the lead element picks it. */
export function conjureGuard(w: World, src: number, counts: Uint8Array): void {
  const s = w.seats;
  s.guardEls.set(counts.subarray(0, N_EL), src * N_EL);
  s.guardEls[src * N_EL + EL.shield - 1] = 0;
  s.guardEls[src * N_EL + EL.sigil - 1] = 0;
  const lead = leadOf(s.guardEls, src);
  s.guard[src] = lead ? GUARD_OF[lead] : GUARD.mirror;
  s.guardHp[src] = (ARMS.hp as Record<string, number>)[GUARD_NAME[s.guard[src]]] * guardSize(w, src);
  s.guardT[src] = 0; s.guardCd[src] = 0; s.retreatT[src] = 0;
}

/**
 * Share of damage in `col` that seat t's guard takes off (1 = immune, negative = takes more). 0 without
 * a guard. Every mixed-in element adds its guard's row by its share. Under a Leaf (Life: preservation)
 * they add only their strengths; under any other lead, their weaknesses come too.
 */
export function resist(w: World, t: number, col: number): number {
  const g = guardOf(w, t);
  if (!g) return 0;
  let r = RES_TABLE[g][col];
  for (let id = 1; id <= N_EL; id++) {
    const n = extra(w, t, id), mg = GUARD_OF[id];
    if (!n || !mg) continue;
    const v = RES_TABLE[mg][col];
    if (g === GUARD.leaf && v < 0) continue;
    r += share(n) * v;
  }
  return Math.min(1, r);
}
/** The resistance column of an element's damage (Earth is physical), or -1. */
export const colOf = (id: number): number => OWN_COL[id] ?? -1;

/**
 * The coat: seat i's mixed-in elements, as a payload's 9 counts (0 when it has none, or under a Leaf,
 * whose extras only preserve). A block, parry or Retreat that touches someone bites them with it:
 * the Bulwark's sturdy barrier burns, chills, soaks...; a Prism's returned beam carries it.
 */
const COAT = new Uint8Array(N_EL);
function coatOf(w: World, i: number): Uint8Array | null {
  const g = guardOf(w, i);
  if (!g || g === GUARD.leaf) return null;
  let any = false;
  for (let id = 1; id <= N_EL; id++) { COAT[id - 1] = extra(w, i, id); if (COAT[id - 1]) any = true; }
  return any ? COAT : null;
}
/** Bites body j with seat i's coat, pushing along (ux, uy). */
function biteBack(w: World, i: number, j: number, ux: number, uy: number): void {
  const c = coatOf(w, i);
  if (!c || j < 0 || !alive(w, j) || j === i) return;
  applyHit(w, j, c, 0, { scale: ARMS.coatScale, heal: false, scald: false, freeze: false, source: i, dirX: ux, dirY: uy, push: 0 });
  w.events.push({ tick: w.clock[0], kind: 'move', who: i, x: w.bodies.x[j], y: w.bodies.y[j], text: 'coat', look: guardCoatLook(w, i) });
}
/** Opposites that cancel rune for rune, as in the queue. */
const OPPOSED: readonly (readonly [number, number])[] = [[EL.fire, EL.cold], [EL.water, EL.lightning], [EL.life, EL.arcane], [EL.earth, EL.lightning]];
const MIX = new Uint8Array(N_EL);
/** A payload (els at `at`) plus seat i's coat, opposites cancelled; null when nothing is left. */
function mixCoat(w: World, i: number, els: Uint8Array, at: number): Uint8Array | null {
  const c = coatOf(w, i);
  for (let k = 0; k < N_EL; k++) MIX[k] = els[at * N_EL + k] + (c ? c[k] : 0);
  for (const [a, o] of OPPOSED) { const m = Math.min(MIX[a - 1], MIX[o - 1]); MIX[a - 1] -= m; MIX[o - 1] -= m; }
  for (let k = 0; k < N_EL; k++) if (MIX[k]) return MIX;
  return null;
}
/** Runes in seat i's guard (Shield aside), at least 1. */
const guardRunes = (w: World, i: number): number => {
  let n = 0;
  for (let k = 0; k < N_EL; k++) n += w.seats.guardEls[i * N_EL + k];
  return Math.max(1, n);
};
/** Every rune past the first makes the guard bigger, as in spells: more guard HP and a longer Retreat. */
export const guardSize = (w: World, i: number): number => 1 + ARMS.runeSize * (guardRunes(w, i) - 1);
/** The colour of seat i's coat: its most numerous mixed-in element (0 for none). */
export function guardCoatLook(w: World, i: number): number {
  let best = 0, n = 0;
  for (let id = 1; id <= N_EL; id++) { const c = extra(w, i, id); if (c > n) { best = id; n = c; } }
  return best;
}

// ---- passives ----------------------------------------------------------------------------------

/** Does seat i's guard have guard g's passive: its lead's, or a mixed-in element's? */
export function hasPassive(w: World, i: number, g: number): boolean {
  const lead = guardOf(w, i);
  if (!lead) return false;
  if (lead === g) return true;
  const id = GUARD_EL[g];
  return g !== GUARD.mirror && extra(w, i, id) > 0;
}
/** Anchored (Bulwark): no knockback while carried. */
export const anchored = (w: World, i: number): boolean => hasPassive(w, i, GUARD.bulwark);
/** No chill or freeze: Warm (Ember) and anything immune to cold. */
export const warm = (w: World, i: number): boolean => hasPassive(w, i, GUARD.ember) || resist(w, i, RES.cold) >= 1;
/** Can't burn: immune to fire, or Quenched (Tide). */
export const unburnable = (w: World, i: number): boolean => hasPassive(w, i, GUARD.tide) || resist(w, i, RES.fire) >= 1;
/** Never slips on ice (Rime). */
export const sureFooted = (w: World, i: number): boolean => hasPassive(w, i, GUARD.rime);
/** Grounded (Spark): chain lightning skips this seat. */
export const grounded = (w: World, i: number): boolean => hasPassive(w, i, GUARD.spark);
/** Clear (Prism): an ally's beams and sprays don't hurt this seat. */
export const clear = (w: World, i: number): boolean => i < MAX_SEATS && hasPassive(w, i, GUARD.prism);
/** Phasing back (Prism pane's Retreat): passes through bodies. */
export const phased = (w: World, i: number): boolean => i < MAX_SEATS && ((guardOf(w, i) === GUARD.prism && w.seats.retreatT[i] > 0) || w.seats.dashT[i] > 0);
export const blocking = (w: World, i: number): boolean => guardOf(w, i) !== 0 && w.seats.guardT[i] > 0;

/**
 * Walking speed from what you carry: a guard or a weapon costs a little each; the Bulwark is slow;
 * a raised guard slows you (the Mirror is Light); channelling a weapon Special slows or roots you.
 */
export function walkMult(w: World, i: number): number {
  const s = w.seats;
  let k = s.weapon[i] && s.weaponUses[i] > 0 ? ARMS.carryWalk : 1;
  if (s.specT[i] > 0) k *= s.weapon[i] === EL.arcane ? 0 : ARMS.auraWalk; // Siphon roots you; Mend slows you
  const g = guardOf(w, i);
  if (!g) return k;
  k *= ARMS.carryWalk;
  if (hasPassive(w, i, GUARD.bulwark)) k *= ARMS.bulwarkWalk;
  const up = blocking(w, i);
  if (g === GUARD.bulwark) return k * (up ? ARMS.bulwarkBlockWalk : 1);
  return up && g !== GUARD.mirror ? k * ARMS.blockWalk : k;
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
    case GUARD.leaf: healAround(w, i, ARMS.leafParryHeal, true, true); break;
    default: break; // the Mirror and the Prism send the shot back (guardMissile, applyHit)
  }
}

/** Allies around seat i (within ARMS.leafRange, any side; `self`: i too) are healed `amount`. */
function healAround(w: World, i: number, amount: number, event: boolean, self = false): void {
  const b = w.bodies;
  for (let j = 0; j < MAX_SEATS; j++) {
    if ((j === i && !self) || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
    if (len(b.x[j] - b.x[i], b.y[j] - b.y[i]) > ARMS.leafRange) continue;
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
  if (g === GUARD.mirror) { // a glancing block: the shot skips off to the side, and the buckler isn't worn down
    const side = m.vx[j] * cosTurns(w.bodies.face[i] + 0.25) + m.vy[j] * sinTurns(w.bodies.face[i] + 0.25) >= 0 ? 0.25 : -0.25;
    const sp = len(m.vx[j], m.vy[j]), a = w.bodies.face[i] + side;
    m.vx[j] = cosTurns(a) * sp; m.vy[j] = sinTurns(a) * sp; m.lastHit[j] = i;
    move(w, i, 'glance');
    return 2;
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
  if (parrying(w, t)) { parryEffect(w, t, src, true); biteBack(w, t, src, -dx, -dy); return 0; }
  const foe = src >= 0 && alive(w, src);
  if (foe) biteBack(w, t, src, -dx, -dy); // the coat bites back
  if (foe && g === GUARD.ember) { b.burn[src] = Math.max(b.burn[src], T(STATUS.burn)); b.burnSrc[src] = t; } // thorns
  if (foe && g === GUARD.rime) { b.chill[src] = Math.min(STATUS.chillMax, b.chill[src] + ARMS.rimeChill); w.events.push({ tick: w.clock[0], kind: 'move', who: t, x: b.x[src], y: b.y[src], text: 'chill', look: EL.cold }); } // frost bites back
  if (foe && g === GUARD.tide) { applyHit(w, src, one(EL.water).counts, 0, { scale: 1, heal: false, scald: false, freeze: false, source: t, dirX: -dx, dirY: -dy, push: 0 }); b.kx[src] -= dx * 8; b.ky[src] -= dy * 8; }
  if (g === GUARD.bulwark) { damageGuard(w, t, dmg); move(w, t, 'block'); return 0; }
  return land;
}

/**
 * A beam (or spray) tick on seat t from `src`. Returns the scale left of it: an ally's does nothing
 * to a Clear seat (the Prism's passive, or mixed in); the Prism pane stops it from the front while
 * blocking, and a parry turns it on its caster.
 */
export function guardBeam(w: World, t: number, src: number, els: Uint8Array, at: number, scale: number, dx: number, dy: number): number {
  const b = w.bodies;
  if (src >= 0 && src !== t && clear(w, t) && b.team[src] === b.team[t]) return 0;
  if (guardOf(w, t) !== GUARD.prism || !blocking(w, t) || !fromFront(w, t, dx, dy)) return 1;
  if (parrying(w, t) && src >= 0 && src !== t && alive(w, src)) {
    // The returned beam carries the coat, mixed as in the queue: opposites cancel rune for rune, so a
    // Cold Prism sends a Fire beam back weaker, and swallows it whole when the coat matches its runes.
    const r = mixCoat(w, t, els, at);
    if (r) applyHit(w, src, r, 0, { scale, heal: false, scald: false, freeze: false, source: t, dirX: -dx, dirY: -dy, push: 0 });
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
  const k = guardSize(w, i); // more runes, a longer Retreat
  s.guardCd[i] = T(ARMS.retreatRecovery);
  s.guardT[i] = 0;
  const push = (d: number, ux = bx, uy = by) => { b.kx[i] += ux * glide(d); b.ky[i] += uy * glide(d); }; // your own move: never blocked by Anchored
  switch (g) {
    case GUARD.bulwark: { // Shove step: a short step back, and the slab knocks back whatever was in front
      push((ARMS.shoveStep * k));
      cone(w, i, ARMS.shoveRange, 0.2, (j, ux, uy) => { if (b.team[j] !== b.team[i]) { addKnock(w, j, ux, uy, ARMS.shoveKnock); b.stun[j] = Math.max(b.stun[j], T(ARMS.shoveStun)); biteBack(w, i, j, ux, uy); } });
      move(w, i, 'shovestep', x + bx * (ARMS.shoveStep * k), y + by * (ARMS.shoveStep * k));
      return;
    }
    case GUARD.ember: {
      push((ARMS.flameStep * k));
      floorLine(w, x, y, x + bx * (ARMS.flameStep * k), y + by * (ARMS.flameStep * k), EL.fire, T(ARMS.flameLine));
      move(w, i, 'flamestep', x + bx * (ARMS.flameStep * k), y + by * (ARMS.flameStep * k));
      return;
    }
    case GUARD.rime: {
      const d = (ARMS.iceSlide * k);
      floorLine(w, x, y, x + bx * (d + 0.5), y + by * (d + 0.5), EL.cold);
      // on ice, knockback decays by 0.985 a tick, so the slide needs far less push
      b.kx[i] += bx * d * 1.8; b.ky[i] += by * d * 1.8; // most of it in the first 0.7 s; the strip's end stops you
      move(w, i, 'iceslide', x + bx * d, y + by * d);
      return;
    }
    case GUARD.spark: {
      let nx = x + bx * (ARMS.blink * k), ny = y + by * (ARMS.blink * k);
      for (let n = 0; n < 16 && !free(w, i, nx, ny); n++) { nx -= bx * ((ARMS.blink * k) / 16); ny -= by * ((ARMS.blink * k) / 16); }
      if (!free(w, i, nx, ny)) { nx = x; ny = y; }
      spawnZone(w, ZONE.spark, i, one(EL.lightning), x, y, 0.75, T(ARMS.spark), 0);
      w.events.push({ tick: w.clock[0], kind: 'blink', who: i, x, y, x2: nx, y2: ny });
      move(w, i, 'spark', nx, ny);
      b.x[i] = nx; b.y[i] = ny;
      if (b.heldBy[i] >= 0) b.kx[i] += bx * 8; // a big pull breaks a grabber's hold
      return;
    }
    case GUARD.tide: {
      push((ARMS.surge * k));
      cone(w, i, 3, 0.18, (j, ux, uy) => { hit(w, j, one(EL.water), hitOpts(one(EL.water), i, 1, ux, uy)); b.kx[j] += ux * 9; b.ky[j] += uy * 9; });
      floorDisc(w, x, y, 0.8, EL.water);
      move(w, i, 'surge', x + bx * (ARMS.surge * k), y + by * (ARMS.surge * k));
      return;
    }
    case GUARD.prism: push((ARMS.phase * k)); s.retreatT[i] = T(ARMS.phaseTime); move(w, i, 'phase', x + bx * (ARMS.phase * k), y + by * (ARMS.phase * k)); return;
    case GUARD.leaf: // Seed step: a hop back that leaves a healing bloom where you stood, for whoever steps in
      push((ARMS.seedStep * k));
      spawnZone(w, ZONE.spring, i, one(EL.life), x, y, ARMS.seedRadius, T(ARMS.seedLife), 0);
      move(w, i, 'seedstep', x + bx * (ARMS.seedStep * k), y + by * (ARMS.seedStep * k));
      return;
    default: break;
  }
  push((ARMS.backstep * k)); // the Mirror's crisp hop
  move(w, i, 'backstep', x + bx * (ARMS.backstep * k), y + by * (ARMS.backstep * k));
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
    // Passives, the lead's or mixed in from a second element.
    if (hasPassive(w, i, GUARD.ember)) { b.wet[i] = 0; b.chill[i] = 0; b.frozen[i] = 0; b.burn[i] = 0; } // Warm: dry at once; fire can't hurt it
    if (hasPassive(w, i, GUARD.tide)) b.burn[i] = 0; // Quenched
    if (hasPassive(w, i, GUARD.leaf) && b.hp[i] > 0) b.hp[i] = Math.min(b.maxHp[i], b.hp[i] + ARMS.regrowth / 60); // Regrowth
    if (s.guardT[i] && g === GUARD.leaf) healAround(w, i, ARMS.leafBlockHeal / 60, false);
  }
}
