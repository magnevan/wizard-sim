/**
 * What a spell does to a body it touches: damage, healing and statuses, element by element
 * (the rules' PAYLOAD table). Friendly fire is on: harm lands on whoever is hit, ally or not
 * (pillar 3). A Life spell only heals, and its other elements only help.
 */
import { possessed } from './possess';
import { ARMS, COMBAT, DAMAGE, PERKS, RUNES, STATUS, STRUCT, T } from './config';
import { EL, N_EL, elementName, formCurve, formOf } from './elements';
import { ARCHETYPES } from './archetypes';
import { angleDiff } from './geom';
import { atan2Turns } from './trig';
import { drainShield } from './walls';
import { RES, anchored, bless, colOf, guardBeam, resist, taken, takenPlus, unburnable, wardPoints, warm } from './guards';
import { nextFloat } from './rng';
import { EV, KIND, MAX_SEATS, PU, WARD, stackOf, type World } from './world';

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
  /** Multiplies the element's own axis only (chill, push): the Frost and Splash rings (effects.ts disc). */
  axis?: number;
  /** A shot, beam or spray arriving along (dirX, dirY): a shieldbearer's guard can block it from the front. */
  frontal?: boolean;
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
  if (b.kind[t] === KIND.none || possessed(w, t)) return 0;
  const ss = o.statusScale ?? 1;
  const tick = w.clock[0];
  const water = c(els, at, EL.water), fire = c(els, at, EL.fire), cold = c(els, at, EL.cold), ice = c(els, at, EL.ice);
  const lightning = c(els, at, EL.lightning), arcane = c(els, at, EL.arcane), earth = c(els, at, EL.earth), life = c(els, at, EL.life);
  const s = w.seats, src = o.source;
  const arch = b.kind[t] === KIND.enemy ? ARCHETYPES[b.arch[t]] : null;
  // The shieldbearer's guard blocks shots, beams and sprays that come from in front of it.
  if (arch?.guard && o.frontal && (o.dirX || o.dirY) && !b.frozen[t] && !b.stun[t]) {
    if (Math.abs(angleDiff(atan2Turns(-o.dirY, -o.dirX), b.face[t])) <= arch.guard.half) {
      if (w.clock[0] % 20 === 0 || (o.statusScale ?? 1) >= 1) w.events.push({ tick, kind: 'fizzle', who: t, x: b.x[t], y: b.y[t], ev: EV.blocked, text: 'Blocked' });
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
    const amount = COMBAT.healPerLife * life * o.scale;
    b.hp[t] = Math.min(b.maxHp[t], b.hp[t] + amount);
    // Water in a heal douses, and its push shoves back only enemies (the Rescue spray clears space); Cold cools the burning
    if (water) { b.burn[t] = 0; if (o.source >= 0 && b.team[t] !== b.team[o.source]) addKnock(w, t, o.dirX, o.dirY, o.push * water * ss); }
    if (cold) b.burn[t] = 0;
    if (fire) { b.wet[t] = 0; b.frozen[t] = 0; b.chill[t] = 0; }
    bless(w, t, els, at, o.scale); // and every other element builds up its resistance (the imbue)
    return -amount;
  }

  // A ward resists the elements it was made with (stone armour: Earth, the physical, plus its coats); Expose ignores wards.
  const ward = tSeat >= 0 && !b.expose[t] && !arcane ? s.ward[tSeat] : WARD.none;
  let dmg = 0, absorbed = 0, fireD = 0, allD = 0; // Fire's share and the whole, for the burn pool
  const form = formOf(els, at);
  for (let id = 1; id <= N_EL; id++) {
    const n = c(els, at, id);
    // The form element grows on its curve (elements.ts formCurve); a beam's counts once. The rest add a rune's worth each.
    // Earth's steep curve is Rock's alone, the hard-to-land single missile; its quake, geyser and burst hit a crowd, so they grow
    // like the other forms (the cross-cut, 2026-11-11: two Earth in an Earthquake did 91 against a Fire ring's 55)
    const curveForm = form === EL.earth && hitKind !== HIT_KIND.missile ? 0 : form;
    let d = DAMAGE[elementName(id)] * (id === form && n > 1 ? formCurve(curveForm, n, COMBAT.sprayExp, COMBAT.rockExp, COMBAT.formScaling) : n);
    if (arch && id === EL.fire && arch.fireMult !== undefined) d *= arch.fireMult;
    if (arch && (id === EL.cold || id === EL.ice) && arch.coldMult !== undefined) d *= arch.coldMult;
    if (arch?.onlyFire && id !== EL.fire) d = 0; // a bramble: only fire hurts it
    // a guard's resistance, a heal's lent one, and a ward's (its points added on the same scale: wardPoints)
    const xw = ward === WARD.ward || ward === WARD.stone ? wardPoints(w, tSeat, id) : 0;
    if (d) {
      const col = physical ? RES.physical : colOf(id), plain = col >= 0 ? d * taken(w, t, col) : d;
      d = xw ? d * takenPlus(w, t, col, xw) : plain;
      absorbed += plain - d;
    }
    allD += d; if (id === EL.fire) fireD = d;
    dmg += d;
  }
  dmg *= o.scale; absorbed *= o.scale;
  if (absorbed > 0 && tSeat >= 0) {
    // an elemental ward is a battery: what it absorbs drains its caster's Shield pool (structures.ts breaks it at the floor);
    // stone armour was paid once, so it wears its own HP down
    if (ward === WARD.stone) s.wardHp[tSeat] -= absorbed;
    else drainShield(w, s.wardBy[tSeat], STRUCT.wardAbsorb * absorbed);
    if (ward === WARD.stone && s.wardHp[tSeat] <= 0) { s.ward[tSeat] = WARD.none; w.events.push({ tick, kind: 'burst', who: t, x: b.x[t], y: b.y[t], amount: 0.7, look: EL.shield }); }
  }
  // Glass cannon (Sigil + Arcane aura): you deal more and take more.
  if (srcSeat >= 0 && s.aura[srcSeat] > 0 && s.auraEls[srcSeat * N_EL + EL.arcane - 1]) dmg *= STRUCT.glassMult;
  if (tSeat >= 0 && s.aura[tSeat] > 0 && s.auraEls[tSeat * N_EL + EL.arcane - 1]) dmg *= STRUCT.glassMult;
  if (tSeat >= 0 && s.attune[tSeat] > 0) dmg *= RUNES.attuneVuln; // Attune: raw magic through you leaves you open
  // Glass heart (survive): your spells and blows hit harder (your health is lower: survive.ts grant).
  const glass = stackOf(w, srcSeat, PU.glass);
  if (glass) dmg *= 1 + PERKS.glassDmg * glass;

  // Statuses, in the order that lets them interact: water first (it douses), then fire (it dries).
  const wasWet = b.wet[t] > 0; // Cold freezes what was wet before this hit: one spell can't soak and freeze
  if (water) {
    if (arch?.soakDamage && !b.wet[t]) { dmg += arch.soakDamage; w.events.push({ tick, kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: arch.soakDamage, ev: EV.doused, text: 'Doused' }); }
    // water on someone burning only puts the fire out (they come out dry), as fire on someone wet only dries them
    // Water in an ice spell (o.freeze) freezes into it: it douses but doesn't soak, so it can't set up its own freeze
    // Steam's water is vapour (o.scald): it neither douses its own fire nor soaks, so steam can't set up Lightning or a freeze.
    if (o.scald) { /* steam */ }
    else if (b.burn[t] > 0) b.burn[t] = 0;
    // otherwise each Water rune soaks it a little more (a channel's ticks add up)
    else if (!o.freeze) addSoak(w, t, water * STATUS.soakPerRune * o.scale);
    if (o.push) addKnock(w, t, o.dirX, o.dirY, o.push * water * ss * (o.axis ?? 1));
    // Water can finish what Cold started, so the order doesn't matter. (Cold in the same spell goes through its own branch; Fire would only thaw it.)
    if (!cold && !ice && !fire && !o.scald) tryFreeze(w, t);
  }
  if (fire) {
    if (b.frozen[t] || b.chill[t] > 0) { b.frozen[t] = 0; b.chill[t] = 0; }
    else if (b.wet[t] && !water) dry(w, t, fire * STATUS.dryPerRune * o.scale); // each Fire rune dries some: a soaked body takes more
    else if ((!water || o.scald) && !arch?.burnImmune && !(guard && unburnable(w, tSeat))) {
      // Any touch lights it (a small base); most of Fire's own damage burns on, so more Fire burns hotter, and a little of what it rode in on.
      ignite(w, t, ((b.burn[t] ? 0 : STATUS.burnBase) + (fireD * STATUS.burnShareFire + (allD - fireD) * STATUS.burnShareRest) * o.scale) * (o.scald ? STATUS.steamBurn : 1), o.source);
    }
  }
  const noChill = guard > 0 && warm(w, tSeat);
  if ((cold || ice) && !noChill) {
    b.burn[t] = 0;
    // By rune, not by damage: each Cold rune fills the frost pool by chillPerRune, an Ice rune by a share of that, scaled
    // like the hit (a channel tick, a shard) and by the body's cold weakness or resistance. Only Water freezes.
    const coldK = (arch?.coldMult ?? 1) * taken(w, t, RES.cold);
    addChill(w, t, (cold + ice * STATUS.iceChill) * STATUS.chillPerRune * o.scale * coldK * (o.axis ?? 1));
    if (wasWet) tryFreeze(w, t);
  }
  if (o.scald) dmg *= STATUS.steamDamage; // steam stays below Fire: its niche is cover, not damage
  if (lightning) {
    const col = physical ? RES.physical : RES.lightning, lr = guard ? resist(w, tSeat, col) : 0;
    if (b.wet[t]) dmg += DAMAGE.lightning * lightning * o.scale * (STATUS.wetShockMult - 1) * soakOf(w, t) * (guard ? taken(w, tSeat, col) : 1); // a damp body conducts a little, a soaked one doubles it
    // Shock is a chance (STATUS.shockRate): more Lightning, a bigger hit and a smaller body all make a stun likelier.
    // x / (1 + x) rather than 1 - e^-x: the same shape with exact ops only (an exponential may round differently across engines).
    // A stunned body can't be shocked again until it recovers: the stun never renews, so the share of time stunned is
    // a / (1 + a) with a linear in Lightning, like resistance (the user, 2026-11-11): each rune stretches the time a body
    // needs to act by the same amount, and nothing locks.
    if (lr < ARMS.resStatus && !b.stun[t]) {
      const x = STATUS.shockRate * lightning * o.scale * Math.sqrt(STATUS.shockRef / Math.max(1, b.maxHp[t])) * (guard ? taken(w, tSeat, col) : 1);
      if (nextFloat(w.rng) < x / (1 + x)) b.stun[t] = Math.max(b.stun[t], T(STATUS.stunTime));
    }
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

/** Soaks a body with `amount` water (by rune, like chill): the pool grows with the square root of max HP. */
export function addSoak(w: World, t: number, amount: number): void {
  const b = w.bodies;
  if (amount <= 0) return;
  if (!b.wet[t]) b.soak[t] = 0;
  b.soak[t] = Math.min(1, b.soak[t] + amount / (STATUS.soakPool * Math.sqrt(Math.max(1, b.maxHp[t]))));
  b.wet[t] = 1;
}

/** Soaks a body through (a puddle, rain). */
export function drench(w: World, t: number): void { w.bodies.soak[t] = 1; w.bodies.wet[t] = 1; }

/** How soaked a body is, 0..1: nothing unless it's wet. */
export const soakOf = (w: World, t: number): number => (w.bodies.wet[t] ? (w.bodies.soak[t] > 0 ? w.bodies.soak[t] : 1) : 0); // wet set directly is soaked through

/** Dries `amount` water off a body (Fire's runes); dry through, it's no longer wet. */
export function dry(w: World, t: number, amount: number): void {
  const b = w.bodies;
  b.soak[t] -= amount / (STATUS.soakPool * Math.sqrt(Math.max(1, b.maxHp[t])));
  if (b.soak[t] <= 0) { b.soak[t] = 0; b.wet[t] = 0; }
}

/** A wet body cold enough freezes. */
export function tryFreeze(w: World, t: number): void {
  const b = w.bodies;
  if (b.wet[t] > 0 && !b.frozen[t] && b.chill[t] >= STATUS.freezeMin) freezeBody(w, t);
}

/** Frozen for longer the colder it was. The freeze uses up the chill and the wet, so another one starts from nothing. */
export function freezeBody(w: World, t: number): void {
  const b = w.bodies, k = Math.min(1, Math.max(0, (b.chill[t] - STATUS.freezeMin) / Math.max(0.01, 1 - STATUS.freezeMin)));
  b.frozen[t] = T((STATUS.freezeShort + (STATUS.freeze - STATUS.freezeShort) * k) * (0.5 + 0.5 * soakOf(w, t))); // and longer the wetter
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
      const wk = i < MAX_SEATS ? w.seats.ward[i] : WARD.none, xw = wk === WARD.ward || wk === WARD.stone ? wardPoints(w, i, EL.fire) : 0;
      const plain = burnt * taken(w, i, RES.fire), got = xw ? burnt * takenPlus(w, i, RES.fire, xw) : plain;
      b.hp[i] -= got;
      if (xw && wk === WARD.ward) drainShield(w, w.seats.wardBy[i], STRUCT.wardAbsorb * (plain - got)); // the battery pays for the burn it holds off
      if (b.hp[i] <= 0) b.lastEl[i] = EL.fire; // burned to death
      b.lastHit[i] = w.clock[0];
      // Credit the fire to whoever lit it, twice a second (meters; the view's damage pops).
      if (b.burn[i] % 30 === 0) w.events.push({ tick: w.clock[0], kind: 'hit', who: i, src: b.burnSrc[i], x: b.x[i], y: b.y[i], amount: burnt * 30, look: EL.fire, dot: 1 });
    } else b.burnSrc[i] = -1;
    // Soak drains; wet is on while any is left. Code that dries a body sets wet to 0, and the soak goes with it.
    // (wet set directly, with no soak, counts as soaked through)
    if (b.wet[i] > 0) { if (b.soak[i] <= 0) b.soak[i] = 1; b.soak[i] -= STATUS.soakDecay / 60; if (b.soak[i] <= 0) { b.soak[i] = 0; b.wet[i] = 0; } }
    else b.soak[i] = 0;
    if (b.frozen[i] > 0) b.frozen[i]--;
    if (b.stun[i] > 0) b.stun[i]--;
    if (b.expose[i] > 0) b.expose[i]--;
    // the imbue decays by a share of itself, so a steady heal settles and it fades soon after (guards.ts bless)
    if (b.blessT[i] > 0) {
      let any = false;
      for (let col = 0; col < 5; col++) { const v = b.bless[i * 5 + col] * (1 - ARMS.blessDecay / 60) - ARMS.blessFade / 60; b.bless[i * 5 + col] = v > 0 ? v : 0; if (v > 0) any = true; } // a share of itself and a little flat, so it ends (a floor that cut it at 0.05 wiped a spray's small per-tick build-up every tick)
      if (!any) b.blessT[i] = 0;
    }
    if (b.down[i] > 0) b.down[i]--;
    if (b.chill[i] > 0) b.chill[i] = Math.max(0, b.chill[i] - STATUS.chillDecay / 60);
  }
}
