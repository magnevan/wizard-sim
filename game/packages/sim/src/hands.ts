/**
 * Your hands: with no runes queued, the cast gestures are weapon moves (grammar v2,
 * docs/explorations/2026-11-05-weapons-review-1.md; the round-2 weapons in 2026-11-05-guards.md, revised
 * by the user's ratings in 2026-11-05-guards-round-2.md). Runes queued = magic, none = your hands.
 *
 *   RMB tap     Strike   your weapon's swing, or the staff's shove                     1 use
 *   RMB hold    Heavy    charge, then the weapon's own big move                        2 uses
 *   Shift+RMB   Special  a full-circle Sweep for most (2 uses); the spear's javelin; held: the wand's Siphon, the hands' Mend
 *   Shift+LMB   Retreat  your guard's Retreat (guards.ts), or a quick hop back without one
 *   Space       Defend   hold to block with your guard, tap as a hit lands to parry (cast.ts: guardT)
 *
 *   Weapon            Heavy                                               Special
 *   Bare staff        a big shove                                         Sweep
 *   Tide trident      a wave slash rolling along the floor: shoves, soaks Sweep
 *   Healing hands     Healing link: hold to heal the ally under the cursor, no release      Mend: hold to heal allies around you
 *   Frost spear       an impaling dash 2.5x its reach; frozen targets on the way shatter   Javelin (pins, frosts; 2 uses)
 *   Lightning whip    a chain lash: the first target, then up to 3 more   Sweep
 *   Arcane wand       a charged bolt that pierces                                           Siphon: hold, rooted, runes regenerate fast
 *   Flame sword       a rolling crescent of flame that ignites, no lingering fire           Sweep
 *   Stone maul        a fissure down one lane, knocking down all in it    Sweep
 */
import { compile, type SpellSpec } from './compile';
import { ARMS, RHYTHM, STATUS, STRUCT, T } from './config';
import { EL, N_EL, queueFromCounts } from './elements';
import { heldBlow, hit, hitOpts, nearest, payloadOf, spawnMissile, zap } from './effects';
import { inCone, len } from './geom';
import { addKnock } from './hit';
import { grounded, guardRetreat } from './guards';
import { fullMask, spawnFront } from './structures';
import { cosTurns, sinTurns } from './trig';
import { clipRay } from './walls';
import { KIND, MAX_SEATS, PF, regenRate, runeMax, type World } from './world';

/** Ticks a press may last and still be a tap (Strike rather than Heavy). */
export const TAP = T(0.25);

const weaponSpec = (w: World, i: number): SpellSpec => compile(queueFromCounts(w.seats.weaponEls, i), 'conjure');
const weaponEls = (w: World, i: number): Uint8Array => w.seats.weaponEls.subarray(i * N_EL, i * N_EL + N_EL);
const held = (w: World, i: number): number => (w.seats.weapon[i] && w.seats.weaponUses[i] > 0 ? w.seats.weapon[i] : 0);

function spend(w: World, i: number, uses: number): void {
  const s = w.seats;
  s.weaponUses[i] -= uses;
  if (s.weaponUses[i] <= 0) { s.weapon[i] = 0; s.linkTo[i] = -1; }
}

const move = (w: World, i: number, text: string, look: number, x2?: number, y2?: number, amount?: number) =>
  w.events.push({ tick: w.clock[0], kind: 'move', who: i, x: w.bodies.x[i], y: w.bodies.y[i], x2, y2, text, look, amount });

/**
 * One blow of your conjured weapon, or the staff's shove when you hold none: a physical hit plus the
 * weapon's elements (effects.ts heldBlow, numbers in ARMS.blow*). Spends `uses`.
 */
function blow(w: World, i: number, face: number, move: string, o: { half?: number; scale?: number; reach?: number; knock?: number }, uses: number): void {
  heldBlow(w, i, face, move, o);
  if (held(w, i)) spend(w, i, uses);
}

export function strike(w: World, i: number, face: number): void {
  if (held(w, i) === EL.arcane) { bolt(w, i, face, ARMS.boltScale, false); spend(w, i, 1); return; } // the wand: a light bolt
  blow(w, i, face, 'strike', {}, 1);
}

/** The Arcane wand's bolt: a light one (Strike) or a charged one that pierces (Heavy). */
function bolt(w: World, i: number, face: number, scale: number, pierce: boolean): void {
  const dx = cosTurns(face), dy = sinTurns(face);
  const m = spawnMissile(w, i, payloadOf(weaponSpec(w, i)), dx, dy, 0, scale, 0, 0);
  if (m < 0) return;
  const mm = w.missiles;
  mm.vx[m] = dx * ARMS.boltSpeed; mm.vy[m] = dy * ARMS.boltSpeed; mm.r[m] = pierce ? 0.3 : 0.2; mm.pierce[m] = pierce ? 1 : 0;
}

/** Released after a hold: `charge` 0..1 is how long past a tap it was held, against RHYTHM.chargeMax. */
export function heavy(w: World, i: number, face: number, charge: number): void {
  const el = held(w, i), k = ARMS.heavyScale * (0.6 + 0.4 * charge);
  switch (el) {
    case 0: blow(w, i, face, 'strike', { scale: k, reach: ARMS.heavyReach, knock: (8 / 3) * k }, 2); return; // the staff's big shove
    case EL.life: return; // the Healing link was the hold itself (holdTick): nothing on release
    case EL.water: case EL.fire: case EL.earth: {
      // a wave from the weapon: the trident's slash, the flame sword's rolling crescent, the maul's fissure down one lane
      const half = el === EL.water ? ARMS.tideHalf : el === EL.fire ? ARMS.fireHalf : ARMS.quakeHalf;
      const range = el === EL.water ? ARMS.tideRange : el === EL.fire ? ARMS.fireRange : ARMS.quakeRange;
      spawnFront(w, i, weaponEls(w, i), face, half, ARMS.waveScale * (0.6 + 0.4 * charge), range);
      move(w, i, el === EL.water ? 'tideslash' : el === EL.fire ? 'firewave' : 'fissure', el, w.bodies.x[i] + cosTurns(face) * range, w.bodies.y[i] + sinTurns(face) * range);
      spend(w, i, 2);
      return;
    }
    case EL.cold: dash(w, i, face, k); spend(w, i, 2); return;
    case EL.lightning: lash(w, i, face, k); spend(w, i, 2); return;
    case EL.arcane: bolt(w, i, face, ARMS.chargedBolt * (0.5 + 0.5 * charge), charge >= 0.5); move(w, i, 'chargedbolt', EL.arcane); spend(w, i, 2); return;
    default: blow(w, i, face, 'strike', { scale: k, reach: ARMS.heavyReach }, 2); return;
  }
}

/** The spear's impaling dash: far forward, through frozen bodies (they shatter), stopping at the first one that isn't. */
function dash(w: World, i: number, face: number, k: number): void {
  const b = w.bodies, x = b.x[i], y = b.y[i], dx = cosTurns(face), dy = sinTurns(face);
  let reach = (STRUCT.reach.cold ?? 2.8) * ARMS.dashMult;
  const [wd, wk] = clipRay(w, x, y, dx, dy, reach);
  if (wk >= 0) reach = Math.max(0, wd - b.r[i]);
  const p = payloadOf(weaponSpec(w, i));
  // bodies along the lane, nearest first
  const lane: number[] = [];
  for (let j = 0; j < b.kind.length; j++) {
    if (j === i || b.kind[j] === KIND.none) continue;
    const rx = b.x[j] - x, ry = b.y[j] - y, along = rx * dx + ry * dy, side = Math.abs(-rx * dy + ry * dx);
    if (along > 0 && along < reach + b.r[j] && side < b.r[j] + 0.5) lane.push(j);
  }
  lane.sort((a, c) => (b.x[a] - x) * dx + (b.y[a] - y) * dy - ((b.x[c] - x) * dx + (b.y[c] - y) * dy) || a - c);
  let stop = reach;
  for (const j of lane) {
    if (b.frozen[j]) { // straight through: it shatters
      hit(w, j, p, hitOpts(p, i, k * STATUS.shatterMult, dx, dy));
      b.frozen[j] = 0; b.chill[j] = 0;
      w.events.push({ tick: w.clock[0], kind: 'shatter', who: j, x: b.x[j], y: b.y[j] });
      continue;
    }
    hit(w, j, p, hitOpts(p, i, k, dx, dy)); // impaled: the dash ends on it
    addKnock(w, j, dx, dy, 6);
    stop = Math.max(0, (b.x[j] - x) * dx + (b.y[j] - y) * dy - b.r[j] - b.r[i] - 0.05);
    break;
  }
  b.kx[i] += dx * stop * 0.14 * 60; b.ky[i] += dy * stop * 0.14 * 60; // your own lunge: not stopped by Anchored
  w.seats.dashT[i] = T(0.3); // through the bodies it shattered (guards.ts phased)
  move(w, i, 'dash', EL.cold, x + dx * stop, y + dy * stop);
}

/** The whip's chain lash: the first body in front within the whip's reach, then up to ARMS.lashJumps more. */
function lash(w: World, i: number, face: number, k: number): void {
  const b = w.bodies, x = b.x[i], y = b.y[i], range = (STRUCT.reach.lightning ?? 3.4) * ARMS.heavyReach, p = payloadOf(weaponSpec(w, i));
  let first = -1, bd = range + 1;
  for (let j = 0; j < b.kind.length; j++) {
    if (j === i || b.kind[j] === KIND.none || grounded(w, j) || !inCone(x, y, face, 0.12, range, b.x[j], b.y[j], b.r[j])) continue;
    const d = len(b.x[j] - x, b.y[j] - y);
    if (d < bd) { bd = d; first = j; }
  }
  move(w, i, 'lash', EL.lightning, first >= 0 ? b.x[first] : x + cosTurns(face) * range, first >= 0 ? b.y[first] : y + sinTurns(face) * range);
  if (first < 0) { w.events.push({ tick: w.clock[0], kind: 'zap', who: i, x, y, x2: x + cosTurns(face) * range, y2: y + sinTurns(face) * range, look: EL.lightning }); return; }
  zap(w, i, first, p, k * 0.8);
  const visited = [i, first];
  for (let g = 0; g < MAX_SEATS; g++) if (grounded(w, g)) visited.push(g);
  let cur = first;
  for (let n = 0; n < ARMS.lashJumps; n++) {
    const next = nearest(w, b.x[cur], b.y[cur], ARMS.lashJump * (b.wet[cur] ? 1.5 : 1), visited, 0);
    if (next < 0) break;
    zap(w, cur, next, p, k * 0.6);
    visited.push(next);
    cur = next;
  }
}

/** Each tick RMB is held past a tap: the Healing link (Life) finds and holds an ally. */
export function holdTick(w: World, i: number): void {
  const s = w.seats, b = w.bodies;
  if (held(w, i) !== EL.life) { s.linkTo[i] = -1; return; }
  const x = b.x[i], y = b.y[i];
  if (s.linkTo[i] < 0) {
    // the ally under (or near) the cursor, within the link's range
    const cx = x + s.aimX[i], cy = y + s.aimY[i];
    let best = -1, bd = ARMS.linkPick;
    for (let j = 0; j < MAX_SEATS; j++) {
      if (j === i || !s.active[j] || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
      const d = len(b.x[j] - cx, b.y[j] - cy);
      if (d < bd && len(b.x[j] - x, b.y[j] - y) <= ARMS.linkRange) { bd = d; best = j; }
    }
    if (best < 0) return;
    s.linkTo[i] = best; s.linkT[i] = 0;
    move(w, i, 'link', EL.life, b.x[best], b.y[best]);
  }
  const j = s.linkTo[i], dx = b.x[j] - x, dy = b.y[j] - y, d = len(dx, dy);
  // It holds while they move, up to the link's range or until a wall comes between you.
  const walled = d > 1e-6 && clipRay(w, x, y, dx / d, dy / d, d)[1] >= 0;
  if (b.kind[j] !== KIND.wizard || b.downed[j] || d > ARMS.linkRange || walled) { s.linkTo[i] = -1; move(w, i, 'linkbreak', EL.life, b.x[j], b.y[j]); return; }
  b.hp[j] = Math.min(b.maxHp[j], b.hp[j] + ARMS.linkHeal / 60);
  if (s.linkT[i] % 30 === 0) w.events.push({ tick: w.clock[0], kind: 'heal', who: j, src: i, x: b.x[j], y: b.y[j], amount: ARMS.linkHeal / 2, look: EL.life });
  if (++s.linkT[i] % 60 === 0) spend(w, i, ARMS.linkUses);
}

export function special(w: World, i: number, face: number, tx: number, ty: number): void {
  const b = w.bodies, el = held(w, i);
  if (el === EL.cold) { // the spear's javelin: an ice copy splits off and flies; the spear stays in your hand
    const dx = tx - b.x[i], dy = ty - b.y[i], d = len(dx, dy);
    const ux = d > 1e-6 ? dx / d : cosTurns(face), uy = d > 1e-6 ? dy / d : sinTurns(face);
    const m = spawnMissile(w, i, payloadOf(weaponSpec(w, i)), ux, uy, 2, 1, 0, 0);
    if (m >= 0) {
      const mm = w.missiles;
      mm.vx[m] = ux * ARMS.javelinSpeed; mm.vy[m] = uy * ARMS.javelinSpeed; mm.life[m] = T(1.1); mm.r[m] = 0.22; mm.flags[m] |= PF.pin;
    }
    move(w, i, 'javelin', EL.cold, tx, ty);
    spend(w, i, ARMS.javelinUses);
    return;
  }
  if (el === EL.arcane || el === EL.life) return; // Siphon and Mend are held (specialTick); a tap does nothing
  blow(w, i, face, 'sweep', { half: 0.5, scale: ARMS.sweepScale }, 2); // a full circle round you, your partner too
}

/** Does seat i's weapon have a held Special (the wand's Siphon, the hands' Mend)? */
export const channelsSpecial = (w: World, i: number): boolean => held(w, i) === EL.arcane || held(w, i) === EL.life;

/**
 * Each tick Shift+RMB is held past a tap with a channelling weapon. Siphon: you stand still and your
 * runes regenerate ARMS.siphonMult times as fast. Mend: allies around you (not you) heal while you
 * walk slowly. Either costs uses each second.
 */
export function specialTick(w: World, i: number): void {
  const s = w.seats, b = w.bodies, el = held(w, i);
  const t = s.specT[i]++;
  if (el === EL.arcane) {
    // Siphon multiplies the shared budget R (the regen in cast.ts already paid one share of it)
    const full = fullMask(w, i);
    for (let e = 1; e <= N_EL; e++) {
      const k = i * N_EL + e - 1;
      // every rune of an element in the wand multiplies that element's share again
      const focus = 1 + ARMS.siphonFocus * s.weaponEls[k];
      if (e !== EL.sigil) s.runes[k] = Math.min(runeMax(w, i, e), s.runes[k] + (regenRate(w, i, e, full) * (ARMS.siphonMult - 1) * focus) / 60);
    }
    if (t % 30 === 0) move(w, i, 'siphon', EL.arcane);
    if (t > 0 && t % 60 === 0) spend(w, i, ARMS.siphonUses);
    return;
  }
  // Every rune past the first heals more; Water or Cold in the hands also puts out burning, Fire dries and thaws.
  const els = weaponEls(w, i);
  let runes = 0;
  for (let e = 0; e < N_EL; e++) runes += els[e];
  const heal = (ARMS.auraHeal / 60) * (1 + ARMS.specialRune * Math.max(0, runes - 1));
  const douse = els[EL.water - 1] > 0 || els[EL.cold - 1] > 0, warmth = els[EL.fire - 1] > 0;
  for (let j = 0; j < MAX_SEATS; j++) {
    if (j === i || !s.active[j] || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
    if (len(b.x[j] - b.x[i], b.y[j] - b.y[i]) > ARMS.auraRange) continue;
    if (douse) b.burn[j] = 0;
    if (warmth) { b.wet[j] = 0; b.chill[j] = 0; b.frozen[j] = 0; }
    b.hp[j] = Math.min(b.maxHp[j], b.hp[j] + heal);
    if (t % 30 === 0) w.events.push({ tick: w.clock[0], kind: 'heal', who: j, src: i, x: b.x[j], y: b.y[j], amount: ARMS.auraHeal / 2, look: EL.life });
  }
  if (t % 30 === 0) move(w, i, 'mend', EL.life, b.x[i], b.y[i], ARMS.auraRange);
  if (t > 0 && t % 60 === 0) spend(w, i, ARMS.auraUses);
}

/** Shift+LMB with nothing queued: your guard's Retreat, or a quick hop backwards without one. */
export function retreat(w: World, i: number, face: number): void {
  const s = w.seats;
  if (s.guard[i]) { if (s.guardCd[i] > 0) return; guardRetreat(w, i, face); }
  else addKnock(w, i, -cosTurns(face), -sinTurns(face), ARMS.retreatPush);
}

/** How far a held RMB has charged a Heavy (0 at the end of the tap window, 1 when full). */
export const heavyCharge = (held: number): number => Math.max(0, Math.min(1, (held - TAP) / T(RHYTHM.chargeMax)));
