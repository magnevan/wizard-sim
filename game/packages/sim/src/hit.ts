/**
 * What a spell does to a body it touches: damage, healing and statuses, element by element
 * (the rules' PAYLOAD table). Friendly fire is on: harm lands on whoever is hit, ally or not
 * (pillar 3). A Life spell only heals, and its other elements only help.
 */
import { ARMS, COMBAT, DAMAGE, PERKS, STATUS, STRUCT, T } from './config';
import { EL, N_EL, elementName, formCurve, formOf } from './elements';
import { ARCHETYPES } from './archetypes';
import { angleDiff } from './geom';
import { atan2Turns } from './trig';
import { drainShield } from './walls';
import { RES, anchored, bless, colOf, guardBeam, resist, taken, unburnable, warm } from './guards';
import { KIND, MAX_SEATS, PU, WARD, stackOf, type World } from './world';

export interface HitOpts {
  /** Multiplier on everything (channels pass DT x rate, charge and spread pass their share). */
  scale: number;
  heal: boolean;
  scald: boolean;
  freeze: boolean;
  /** Body index of the caster, or -1. */
  source: number;
  /** Direction of travel, for Push. */
  dirX: number; dirY: number;
  /** Push strength (u/s per water rune), 0 for none. */
  push: number;
  /** Status durations scale with this too (channels apply statuses per tick). */
  statusScale?: number;
  /** A shot, beam or spray arriving along (dirX, dirY): a shieldbearer's guard can block it from the front. */
  frontal?: boolean;
  /** A beam: its form element counts as one rune, for damage and for healing (its extra runes buy time, cast.ts). */
  flatForm?: boolean;
}

const c = (els: Uint8Array, at: number, id: number) => els[at * N_EL + id - 1];

/**
 * How the current hit is delivered (HIT_KIND), set by the effect code just before it hits, so a
 * death can tell a boulder from an earthquake. Not state: it is set and read within one call.
 */
export const HIT_KIND = { other: 0, missile: 1, burst: 2, channel: 3, arc: 4, melee: 5, wave: 6 } as const;
let hitKind = 0;
export function setHitKind(k: number): void { hitKind = k; }
/** The current hit kind, so a client stepping a second world (the help panel's previews) can put it back afterwards. */
export const hitKindNow = (): number => hitKind;

/**
 * Applies the payload in `els` (9 counts at slot `at`) to body `t`.
 * Returns the damage dealt (negative for healing), for events.
 */
export function applyHit(w: World, t: number, els: Uint8Array, at: number, o: HitOpts): number {
  const b = w.bodies;
  if (b.kind[t] === KIND.none) return 0;
  const ss = o.statusScale ?? 1;
  const tick = w.clock[0];
  const water = c(els, at, EL.water), fire = c(els, at, EL.fire), cold = c(els, at, EL.cold);
  const lightning = c(els, at, EL.lightning), arcane = c(els, at, EL.arcane), earth = c(els, at, EL.earth), life = c(els, at, EL.life);
  const s = w.seats, src = o.source;
  const arch = b.kind[t] === KIND.enemy ? ARCHETYPES[b.arch[t]] : null;
  // The shieldbearer's guard blocks shots, beams and sprays that come from in front of it.
  if (arch?.guard && o.frontal && (o.dirX || o.dirY) && !b.frozen[t] && !b.stun[t]) {
    if (Math.abs(angleDiff(atan2Turns(-o.dirY, -o.dirX), b.face[t])) <= arch.guard.half) {
      if (w.clock[0] % 20 === 0 || (o.statusScale ?? 1) >= 1) w.events.push({ tick, kind: 'fizzle', who: t, x: b.x[t], y: b.y[t], text: 'Blocked' });
      return 0;
    }
  }
  const srcSeat = src >= 0 && src < MAX_SEATS ? src : -1, tSeat = t < MAX_SEATS ? t : -1;
  // A guard (guards.ts): Clear lets allies' beams through harmlessly; a raised Prism stops them from the front. Resistances below.
  const guard = tSeat >= 0 ? s.guard[tSeat] : 0;
  if (guard && !o.heal && hitKind === HIT_KIND.channel && o.frontal) {
    const k = guardBeam(w, tSeat, src, els, at, o.scale, o.dirX, o.dirY);
    if (k === 0) return 0;
    if (k !== 1) o = { ...o, scale: o.scale * k };
  }
  // Enemy blows and arrows are physical, whatever they carry.
  const physical = src >= MAX_SEATS && b.kind[src] === KIND.enemy;

  // The sculpting wand: your harm spares allies, your heals spare enemies.
  if (srcSeat >= 0 && s.wand[srcSeat] && t !== src) {
    const same = b.team[t] === b.team[src];
    if (o.heal ? !same : same) return 0;
  }

  if (o.heal) {
    // Support: Life heals; the lending elements only help (Rescue spray, Healing spray).
    const amount = COMBAT.healPerLife * (o.flatForm ? Math.min(1, life) : life) * o.scale;
    b.hp[t] = Math.min(b.maxHp[t], b.hp[t] + amount);
    if (water) { b.burn[t] = 0; addKnock(w, t, o.dirX, o.dirY, o.push * water * 0.4 * ss); }
    if (fire) { b.wet[t] = 0; b.frozen[t] = 0; b.chill[t] = 0; }
    bless(w, t, els, at); // and every other element lends its resistance for a few seconds
    return -amount;
  }

  // A ward resists the elements it was made with (stone armour: Earth, the physical, plus its coats); Expose ignores wards.
  const ward = tSeat >= 0 && !b.expose[t] && !arcane ? s.ward[tSeat] : WARD.none;
  let dmg = 0, absorbed = 0, fireD = 0, coldD = 0, allD = 0; // each element's share, for the burn and frost pools
  const form = formOf(els, at);
  for (let id = 1; id <= N_EL; id++) {
    const n = c(els, at, id);
    // The form element grows on its curve (elements.ts formCurve); a beam's counts once. The rest add a rune's worth each.
    let d = DAMAGE[elementName(id)] * (id === form && n > 1 ? (o.flatForm ? 1 : formCurve(form, n, COMBAT.sprayExp, COMBAT.rockExp, COMBAT.formScaling)) : n);
    if (arch && id === EL.fire && arch.fireMult !== undefined) d *= arch.fireMult;
    if (arch && id === EL.cold && arch.coldMult !== undefined) d *= arch.coldMult;
    if (arch?.onlyFire && id !== EL.fire) d = 0; // a bramble: only fire hurts it
    if (d) { const col = physical ? RES.physical : colOf(id); if (col >= 0) d *= taken(w, t, col); } // a guard's resistance, or a heal's lent one
    allD += d; if (id === EL.fire) fireD = d; else if (id === EL.cold) coldD = d;
    const resisted = (ward === WARD.ward || ward === WARD.stone) && s.wardEls[tSeat * N_EL + id - 1] > 0;
    if (resisted) { dmg += d * (1 - STRUCT.wardResist); absorbed += d * STRUCT.wardResist; } else dmg += d;
  }
  dmg *= o.scale; absorbed *= o.scale;
  if (absorbed > 0 && tSeat >= 0) {
    s.wardHp[tSeat] -= absorbed;
    if (ward !== WARD.stone) drainShield(w, tSeat, STRUCT.absorbPerHp * absorbed);
    if (s.wardHp[tSeat] <= 0) { s.ward[tSeat] = WARD.none; w.events.push({ tick, kind: 'burst', who: t, x: b.x[t], y: b.y[t], amount: 0.7, look: EL.shield }); }
  }
  // Glass cannon (Sigil + Arcane aura): you deal more and take more.
  if (srcSeat >= 0 && s.aura[srcSeat] > 0 && s.auraEls[srcSeat * N_EL + EL.arcane - 1]) dmg *= STRUCT.glassMult;
  if (tSeat >= 0 && s.aura[tSeat] > 0 && s.auraEls[tSeat * N_EL + EL.arcane - 1]) dmg *= STRUCT.glassMult;
  // Glass heart (survive): your spells and blows hit harder (your health is lower: survive.ts grant).
  const glass = stackOf(w, srcSeat, PU.glass);
  if (glass) dmg *= 1 + PERKS.glassDmg * glass;

  // Statuses, in the order that lets them interact: water first (it douses), then fire (it dries).
  const wasWet = b.wet[t] > 0; // Cold freezes what was wet before this hit: one spell can't soak and freeze
  if (water) {
    if (arch?.soakDamage && !b.wet[t]) { dmg += arch.soakDamage; w.events.push({ tick, kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: arch.soakDamage, text: 'Doused' }); }
    // water on someone burning only puts the fire out (they come out dry), as fire on someone wet only dries them
    // Water + Cold is ice: it douses but doesn't soak, so it can't set up its own freeze
    if (b.burn[t] > 0) b.burn[t] = 0;
    else if (!o.freeze) b.wet[t] = Math.max(b.wet[t], Math.round(T(STATUS.wet) * Math.min(1, ss * 4)));
    if (o.push) addKnock(w, t, o.dirX, o.dirY, o.push * water * ss);
  }
  if (fire) {
    if (b.frozen[t] || b.chill[t] > 0) { b.frozen[t] = 0; b.chill[t] = 0; }
    else if (b.wet[t] && !water) b.wet[t] = 0;
    else if (!water && !arch?.burnImmune && !(guard && unburnable(w, tSeat))) {
      // Any touch lights it; all of Fire's own damage burns on, and a quarter of what it rode in on.
      ignite(w, t, (b.burn[t] ? 0 : STATUS.burnBase) + (fireD * STATUS.burnShareFire + (allD - fireD) * STATUS.burnShareRest) * o.scale, o.source);
    }
  }
  const noChill = guard > 0 && warm(w, tSeat);
  if (cold && !noChill) {
    b.burn[t] = 0;
    // Cold's share of the hit fills the frost pool (a guard's cold resistance is already in it). Only Water freezes.
    addChill(w, t, coldD * o.scale * STATUS.chillPerDamage);
    if (wasWet) tryFreeze(w, t);
  }
  if (o.scald) dmg += STATUS.scaldBonus * o.scale;
  if (lightning) {
    const col = physical ? RES.physical : RES.lightning, lr = guard ? resist(w, tSeat, col) : 0;
    if (b.wet[t]) dmg += DAMAGE.lightning * lightning * o.scale * (STATUS.wetShockMult - 1) * (guard ? taken(w, tSeat, col) : 1);
    if (lr < ARMS.resStatus) b.stun[t] = Math.max(b.stun[t], Math.round(T(STATUS.stunPerRune) * lightning * Math.min(1, ss * 4)));
  }
  if (arcane) b.expose[t] = Math.max(b.expose[t], Math.round(T(STATUS.expose) * Math.min(1, ss * 4)));
  if (earth) {
    if (b.frozen[t]) { dmg *= STATUS.shatterMult; b.frozen[t] = 0; b.chill[t] = 0; w.events.push({ tick, kind: 'shatter', who: t, x: b.x[t], y: b.y[t] }); }
    b.down[t] = Math.max(b.down[t], Math.round(T(STATUS.knockdown) * Math.min(1, ss * 4)));
    addKnock(w, t, o.dirX, o.dirY, 3 * earth * ss);
  }
  if (b.expose[t] && !arcane) dmg *= STATUS.exposeMult;
  if (arch?.onlyFire && !fire) dmg = 0; // nor do the mixes' bonuses without fire in them

  b.hp[t] -= dmg;
  if (dmg > 0) { b.lastHit[t] = tick; b.lastEl[t] = form || EL.earth; b.lastDX[t] = o.dirX; b.lastDY[t] = o.dirY; b.lastMix[t] = o.scald ? 1 : o.freeze ? 2 : 0; b.lastKind[t] = hitKind; }
  if (life) b.hp[t] = Math.min(b.maxHp[t], b.hp[t] + COMBAT.healPerLife * life * o.scale); // Life inside a Shield/Sigil spell
  return dmg;
}

/** Adds to a body's burn: `amount` more damage to burn, over at least `ticks` from now. A body not burning starts from nothing. */
export function ignite(w: World, t: number, amount: number, src: number, ticks = T(STATUS.burn)): void {
  const b = w.bodies;
  if (!b.burn[t]) b.burnPool[t] = 0; // a douse leaves the old pool behind
  b.burnPool[t] = Math.min(STATUS.burnCap, b.burnPool[t] + amount);
  b.burn[t] = Math.max(b.burn[t], ticks);
  b.burnSrc[t] = src;
}

/** Fills a body's frost pool with `amount` frost damage. The pool grows with the square root of max HP: see STATUS.chillPool. */
export function addChill(w: World, t: number, amount: number): void {
  const b = w.bodies;
  b.chill[t] = Math.min(1, b.chill[t] + amount / (STATUS.chillPool * Math.sqrt(Math.max(1, b.maxHp[t]))));
}

/** A wet body cold enough freezes. */
export function tryFreeze(w: World, t: number): void {
  const b = w.bodies;
  if (b.wet[t] > 0 && !b.frozen[t] && b.chill[t] >= STATUS.freezeMin) freezeBody(w, t);
}

/** Frozen for longer the colder it was. The freeze uses up the chill and the wet, so another one starts from nothing. */
export function freezeBody(w: World, t: number): void {
  const b = w.bodies, k = Math.min(1, Math.max(0, (b.chill[t] - STATUS.freezeMin) / Math.max(0.01, 1 - STATUS.freezeMin)));
  b.frozen[t] = T(STATUS.freezeShort + (STATUS.freeze - STATUS.freezeShort) * k);
  b.chill[t] = 0;
  b.wet[t] = 0;
  w.events.push({ tick: w.clock[0], kind: 'freeze', who: t, x: b.x[t], y: b.y[t] });
}

export function addKnock(w: World, t: number, dx: number, dy: number, speed: number): void {
  if (!speed || w.bodies.frozen[t] || anchored(w, t)) return; // Anchored (the Bulwark): no knockback
  w.bodies.kx[t] += dx * speed;
  w.bodies.ky[t] += dy * speed;
}

/** Ticks statuses down and applies burning. Called once per step for every body. */
export function tickStatuses(w: World): void {
  const b = w.bodies;
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] === KIND.none) continue;
    if (b.burn[i] > 0) {
      const burnt = b.burnPool[i] / b.burn[i]; // spent evenly over what's left, so a bigger pool burns hotter
      b.burnPool[i] -= burnt;
      b.burn[i]--;
      // A ward made with Fire (or stone armour coated in it) resists the burning too.
      const fireWard = i < MAX_SEATS && (w.seats.ward[i] === WARD.ward || w.seats.ward[i] === WARD.stone) && w.seats.wardEls[i * N_EL + EL.fire - 1] > 0;
      b.hp[i] -= burnt * (fireWard ? 1 - STRUCT.wardResist : 1) * taken(w, i, RES.fire);
      if (b.hp[i] <= 0) b.lastEl[i] = EL.fire; // burned to death
      b.lastHit[i] = w.clock[0];
      // Credit the fire to whoever lit it, twice a second (meters; the view's damage pops).
      if (b.burn[i] % 30 === 0) w.events.push({ tick: w.clock[0], kind: 'hit', who: i, src: b.burnSrc[i], x: b.x[i], y: b.y[i], amount: burnt * 30, look: EL.fire });
    } else b.burnSrc[i] = -1;
    if (b.wet[i] > 0) b.wet[i]--;
    if (b.frozen[i] > 0) b.frozen[i]--;
    if (b.stun[i] > 0) b.stun[i]--;
    if (b.expose[i] > 0) b.expose[i]--;
    if (b.blessT[i] > 0) b.blessT[i]--;
    if (b.down[i] > 0) b.down[i]--;
    if (b.chill[i] > 0) b.chill[i] = Math.max(0, b.chill[i] - STATUS.chillDecay / 60);
  }
}
