/**
 * What a spell does to a body it touches: damage, healing and statuses, element by element
 * (the rules' PAYLOAD table). Friendly fire is on: harm lands on whoever is hit, ally or not
 * (pillar 3). A Life spell only heals, and its other elements only help.
 */
import { COMBAT, DAMAGE, STATUS, STRUCT, T } from './config';
import { EL, N_EL, elementName, formCurve, formOf } from './elements';
import { ARCHETYPES } from './archetypes';
import { angleDiff, len } from './geom';
import { atan2Turns } from './trig';
import { drainShield } from './walls';
import { RES, anchored, colOf, guardBeam, resist, unburnable, warm } from './guards';
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
}

const c = (els: Uint8Array, at: number, id: number) => els[at * N_EL + id - 1];

/**
 * How the current hit is delivered (HIT_KIND), set by the effect code just before it hits, so a
 * death can tell a boulder from an earthquake. Not state: it is set and read within one call.
 */
export const HIT_KIND = { other: 0, missile: 1, burst: 2, channel: 3, arc: 4, melee: 5, wave: 6 } as const;
let hitKind = 0;
export function setHitKind(k: number): void { hitKind = k; }

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
  // A guard (guards.ts): Clear lets allies' beams through harmlessly; a raised Prism pane stops them from the front. Resistances below.
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
    bloom(w, srcSeat, t, amount);
    if (water) { b.burn[t] = 0; addKnock(w, t, o.dirX, o.dirY, o.push * water * 0.4 * ss); }
    if (fire) { b.wet[t] = 0; b.frozen[t] = 0; b.chill[t] = 0; }
    return -amount;
  }

  // A ward resists the elements it was made with (stone armour: Earth, the physical, plus its coats); Expose ignores wards.
  const ward = tSeat >= 0 && !b.expose[t] && !arcane ? s.ward[tSeat] : WARD.none;
  let dmg = 0, absorbed = 0;
  const form = formOf(els, at);
  for (let id = 1; id <= N_EL; id++) {
    const n = c(els, at, id);
    // Each extra rune of the form element adds formScaling of the first rune's damage.
    let d = DAMAGE[elementName(id)] * (id === form && n > 1 ? formCurve(form, n, COMBAT.sprayExp, COMBAT.rockExp, COMBAT.formScaling) : n);
    if (arch && id === EL.fire && arch.fireMult !== undefined) d *= arch.fireMult;
    if (arch && id === EL.cold && arch.coldMult !== undefined) d *= arch.coldMult;
    if (guard && d) { const col = physical ? RES.physical : colOf(id); if (col >= 0) d *= 1 - resist(w, tSeat, col); }
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

  // Statuses, in the order that lets them interact: water first (it douses), then fire (it dries).
  if (water) {
    if (arch?.soakDamage && !b.wet[t]) { dmg += arch.soakDamage; w.events.push({ tick, kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: arch.soakDamage, text: 'Doused' }); }
    b.burn[t] = 0;
    b.wet[t] = Math.max(b.wet[t], Math.round(T(STATUS.wet) * Math.min(1, ss * 4)));
    if (o.push) addKnock(w, t, o.dirX, o.dirY, o.push * water * ss);
  }
  if (fire) {
    if (b.frozen[t] || b.chill[t] > 0) { b.frozen[t] = 0; b.chill[t] = 0; }
    else if (b.wet[t] && !water) b.wet[t] = 0;
    else if (!water && !arch?.burnImmune && !(guard && unburnable(w, tSeat))) { b.burn[t] = Math.max(b.burn[t], Math.round(T(STATUS.burn) * Math.min(1, ss * 4))); b.burnSrc[t] = o.source; }
  }
  const noChill = guard > 0 && warm(w, tSeat);
  if (cold && !noChill) {
    b.burn[t] = 0;
    // a guard weak to cold (the Tide shield) chills faster, a resistant one slower
    b.chill[t] = Math.min(STATUS.chillMax, b.chill[t] + STATUS.chillPerRune * cold * ss * (guard ? 1 - resist(w, tSeat, RES.cold) : 1));
    if (b.chill[t] >= STATUS.chillMax && !b.frozen[t]) freezeBody(w, t);
  }
  if (o.freeze && b.wet[t] && !b.frozen[t] && !noChill) freezeBody(w, t);
  if (o.scald) dmg += STATUS.scaldBonus * o.scale;
  if (lightning) {
    const lr = guard ? resist(w, tSeat, physical ? RES.physical : RES.lightning) : 0;
    if (b.wet[t]) dmg += DAMAGE.lightning * lightning * o.scale * (STATUS.wetShockMult - 1) * (1 - lr);
    if (lr < 1) b.stun[t] = Math.max(b.stun[t], Math.round(T(STATUS.stunPerRune) * lightning * Math.min(1, ss * 4)));
  }
  if (arcane) b.expose[t] = Math.max(b.expose[t], Math.round(T(STATUS.expose) * Math.min(1, ss * 4)));
  if (earth) {
    if (b.frozen[t]) { dmg *= STATUS.shatterMult; b.frozen[t] = 0; b.chill[t] = 0; w.events.push({ tick, kind: 'shatter', who: t, x: b.x[t], y: b.y[t] }); }
    b.down[t] = Math.max(b.down[t], Math.round(T(STATUS.knockdown) * Math.min(1, ss * 4)));
    addKnock(w, t, o.dirX, o.dirY, 3 * earth * ss);
  }
  if (b.expose[t] && !arcane) dmg *= STATUS.exposeMult;

  b.hp[t] -= dmg;
  if (dmg > 0) { b.lastHit[t] = tick; b.lastEl[t] = form || EL.earth; b.lastDX[t] = o.dirX; b.lastDY[t] = o.dirY; b.lastMix[t] = o.scald ? 1 : o.freeze ? 2 : 0; b.lastKind[t] = hitKind; }
  if (life) b.hp[t] = Math.min(b.maxHp[t], b.hp[t] + COMBAT.healPerLife * life * o.scale); // Life inside a Shield/Sigil spell
  return dmg;
}

/** Bloom (survive): a heal by seat `src` splashes half onto the other wizards near the one healed. It only ever heals. */
export function bloom(w: World, src: number, t: number, healed: number): void {
  if (!w.run || healed <= 0 || src < 0 || !stackOf(w, src, PU.bloom)) return;
  const b = w.bodies, amount = healed * 0.5;
  for (let j = 0; j < MAX_SEATS; j++) {
    if (j === t || b.kind[j] !== KIND.wizard || b.downed[j] || len(b.x[j] - b.x[t], b.y[j] - b.y[t]) > 2.5) continue;
    b.hp[j] = Math.min(b.maxHp[j], b.hp[j] + amount);
    if (w.clock[0] % 20 === 0) w.events.push({ tick: w.clock[0], kind: 'heal', who: j, src: t, x: b.x[j], y: b.y[j], amount, look: EL.life });
  }
}

function freezeBody(w: World, t: number): void {
  const b = w.bodies;
  b.frozen[t] = T(STATUS.freeze);
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
      b.burn[i]--;
      // A ward made with Fire (or stone armour coated in it) resists the burning too.
      const fireWard = i < MAX_SEATS && (w.seats.ward[i] === WARD.ward || w.seats.ward[i] === WARD.stone) && w.seats.wardEls[i * N_EL + EL.fire - 1] > 0;
      b.hp[i] -= (STATUS.burnDps / 60) * (fireWard ? 1 - STRUCT.wardResist : 1) * (i < MAX_SEATS ? 1 - resist(w, i, RES.fire) : 1);
      if (b.hp[i] <= 0) b.lastEl[i] = EL.fire; // burned to death
      b.lastHit[i] = w.clock[0];
      // Credit the fire to whoever lit it, twice a second (meters; the view's damage pops).
      if (b.burn[i] % 30 === 0) w.events.push({ tick: w.clock[0], kind: 'hit', who: i, src: b.burnSrc[i], x: b.x[i], y: b.y[i], amount: STATUS.burnDps / 2, look: EL.fire });
    } else b.burnSrc[i] = -1;
    if (b.wet[i] > 0) b.wet[i]--;
    if (b.frozen[i] > 0) b.frozen[i]--;
    if (b.stun[i] > 0) b.stun[i]--;
    if (b.expose[i] > 0) b.expose[i]--;
    if (b.down[i] > 0) b.down[i]--;
    if (b.chill[i] > 0) b.chill[i] = Math.max(0, b.chill[i] - STATUS.chillDecay / 60);
  }
}
