/**
 * Per-player casting: the rune economy, the element queue and the cast state machine.
 *
 * Runes: pressing an element reserves one rune of it (you need a whole one). A cast spends what
 * the queue reserved; clearing the queue, or an element cancelling another, gives the runes back.
 * Pools regenerate slowly; Attune (Arcane on yourself) speeds that up for a while.
 *
 * Rhythm: idle -> windup -> (charge | channel) -> recovery -> idle. Wind-up grows with the
 * spell's size, not with how hard its keys are to type. A stun breaks wind-up, charge and
 * channel. Channels are free for their natural duration, then cost upkeep from the form
 * element's pool (regen debt); they end when you let go or that pool runs dry.
 *
 * Buttons: Force (press; hold to charge or channel), Area (tap = Area, hold = Place at the
 * cursor, drag while holding = drawn Place), Self, Weapon.
 */
import { rules, type Cast, type Element } from '@wizard-sim/rules';
import { compile, type SpellSpec } from './compile';
import { RHYTHM, RUNES, SHAPES, STRUCT, T } from './config';
import { EL, KEYED_EL, N_EL, elementName } from './elements';
import { channelTick, fireSpell } from './effects';
import { STRUCTURE_SHAPES, castStructure, dismissAt, dismissShieldAt, doubleRepeat, hasteOf, payDouble, fullMask, poolCap, recallOldest, sigilCap, spendMote, weaponSwing } from './structures';
import { len } from './geom';
import { guardRelease } from './guards';
import { AIM_UNIT, BTN, type PlayerInput } from './input';
import { TAP, channelsSpecial, heavy, heavyCharge, holdTick, retreat, special, specialTick, strike, strikeRecovery } from './hands';
import { atan2Turns } from './trig';
import { chooseElement, echoChannel, echoLater } from './survive';
import { driveButtons, driveFace, driveTarget, driving } from './battery';
import { CAST_ID, KIND, PHASE, QUEUE_MAX, runeMax, runeRate, type World } from './world';

const CASTS: Cast[] = ['force', 'force', 'area', 'place', 'self', 'conjure']; // index = CAST_ID

export function queueOf(w: World, i: number, cast = false): Element[] {
  const s = w.seats, q = cast ? s.castQueue : s.queue, n = cast ? s.castLen[i] : s.queueLen[i];
  const out: Element[] = [];
  for (let k = 0; k < n; k++) out.push(elementName(q[i * QUEUE_MAX + k]));
  return out;
}

function setQueue(w: World, i: number, q: readonly Element[]): void {
  const s = w.seats;
  s.queue.fill(0, i * QUEUE_MAX, (i + 1) * QUEUE_MAX);
  for (let k = 0; k < q.length; k++) s.queue[i * QUEUE_MAX + k] = rules.ALL.indexOf(q[k]) + 1;
  s.queueLen[i] = q.length;
}

const rune = (w: World, i: number, id: number) => i * N_EL + id - 1;

/**
 * Ghost runes (the rune rework, 2026-11-11): pressing an element you have less than a whole rune of queues it unpaid, a
 * ghost. s.owe holds, per queue slot, what it still owes: bit 1 its element (Ice: its Water), bit 2 Ice's Cold. While anything
 * is owed, all your regen goes to it (world.ts runeRate), and a part is paid the moment its pool has a whole rune. A cast
 * with parts still owed pays them as debt: the pool goes below zero, up to RUNES.debtMax in all, and regen pays it back first.
 */
const OWE_A = 1, OWE_B = 2;
/** The rune ids a queue slot is made of, with the owe bit for each: Ice is a Water (bit 1) and a Cold (bit 2). */
const parts = (el: Element): [number, number][] => (el === 'ice' ? [[EL.water, OWE_A], [EL.cold, OWE_B]] : [[EL[el], OWE_A]]);

/** Gives back the paid runes a queue element was made of (Ice: a Water and a Cold), not what it still owed. */
function refund(w: World, i: number, el: Element, owe = 0): void {
  for (const [id, bit] of parts(el)) if (!(owe & bit)) w.seats.runes[rune(w, i, id)] += 1;
}

const oweAt = (w: World, i: number, k: number): number => w.seats.owe[i * QUEUE_MAX + k];

function refundQueue(w: World, i: number): void {
  for (let k = 0; k < w.seats.queueLen[i]; k++) refund(w, i, elementName(w.seats.queue[i * QUEUE_MAX + k]), oweAt(w, i, k));
  setQueue(w, i, []);
  w.seats.owe.fill(0, i * QUEUE_MAX, (i + 1) * QUEUE_MAX);
}

/**
 * Can a ghost of `id` be queued? Only while the queue holds fewer of it, ghosts included, than its pool could ever hold (its
 * max; Sigil's less what devices bind), so a ghost and debt never stretch a pool (the user: no cheating rune capacity). A
 * Sigil that would release a held spell is free, so it always can.
 */
function ghostable(w: World, i: number, id: number): boolean {
  const s = w.seats;
  if (id === EL.sigil && s.storeLen[i] > 0) return true;
  let held = 0;
  for (let k = 0; k < s.queueLen[i]; k++) for (const [p] of parts(elementName(s.queue[i * QUEUE_MAX + k]))) if (p === id) held++;
  const room = id === EL.sigil ? sigilCap(w, i) : runeMax(w, i, id); // a locked element (max 0) has none
  return room - held >= 1;
}

function pressElement(w: World, i: number, id: number): void {
  if (id < 1 || id > KEYED_EL) return; // only keyed elements are pressed (Ice is made in the queue)
  const s = w.seats, b = w.bodies, tick = w.clock[0];
  const before = queueOf(w, i), owes = before.map((_, k) => oweAt(w, i, k));
  const { queue, event, kind } = rules.addElement(before, elementName(id));
  const cancels = kind === 'cancel'; // a cancel costs nothing, so it needs no rune
  const ghost = !cancels && s.runes[rune(w, i, id)] < 1;
  // Sigil that can't even be a ghost (every Sigil rune bound): two such presses close together are the double-tap. Over a
  // creation of yours it's dismissed; over nothing, your oldest is recalled (the user, 2026-11-11)
  if (ghost && !ghostable(w, i, id)) {
    if (id === EL.sigil && s.drySigil[i] && tick + 1 - s.drySigil[i] <= T(RHYTHM.dryTap)) {
      s.drySigil[i] = 0;
      if (!dismissAt(w, i, b.x[i] + s.aimX[i], b.y[i] + s.aimY[i])) recallOldest(w, i);
      return;
    }
    if (id === EL.sigil) s.drySigil[i] = tick + 1;
    w.events.push({ tick, kind: 'dry', who: i, x: b.x[i], y: b.y[i], look: id });
    return;
  }
  let next = owes;
  if (cancels) {
    // A cancel: the cancelled element's paid runes come back, and the new one is never spent.
    let k = before.findIndex((e, j) => queue[j] !== e);
    if (k < 0) k = before.length - 1;
    const gone = before[k];
    refund(w, i, gone, owes[k]); // Fire melting Ice gives back its Water and Cold
    next = owes.filter((_, j) => j !== k);
    // Double-tap Sigil over one of your creations, or Shield over one of your walls (or yourself, for a ward): it's dismissed.
    if (gone === 'sigil' && id === EL.sigil) dismissAt(w, i, b.x[i] + s.aimX[i], b.y[i] + s.aimY[i]);
    if (gone === 'shield' && id === EL.shield) dismissShieldAt(w, i, b.x[i] + s.aimX[i], b.y[i] + s.aimY[i]);
    w.events.push({ tick, kind: 'cancel', who: i, x: b.x[i], y: b.y[i], text: event ?? undefined, look: id });
  } else if (kind === 'full') {
    return; // queue full
  } else if (kind === 'combine') {
    // Water + Cold make Ice: the new rune is spent (or owed), and the two share one slot.
    const k = before.findIndex((e, j) => queue[j] !== e), old = owes[k] & OWE_A ? 1 : 0, now = ghost ? 1 : 0;
    if (!ghost) s.runes[rune(w, i, id)] -= 1;
    next = owes.slice();
    next[k] = before[k] === 'water' ? old * OWE_A | now * OWE_B : now * OWE_A | old * OWE_B; // Ice's Water is bit 1, its Cold bit 2
    w.events.push({ tick, kind: 'queue', who: i, x: b.x[i], y: b.y[i], look: EL.ice, text: event ?? undefined });
  } else {
    if (!ghost) s.runes[rune(w, i, id)] -= 1;
    next = owes.concat(ghost ? OWE_A : 0);
    w.events.push({ tick, kind: 'queue', who: i, x: b.x[i], y: b.y[i], look: id, text: ghost ? 'ghost' : undefined });
  }
  setQueue(w, i, queue);
  s.owe.fill(0, i * QUEUE_MAX, (i + 1) * QUEUE_MAX);
  next.forEach((o, k) => { s.owe[i * QUEUE_MAX + k] = o; });
}

/** Pays queued ghosts whose pools now hold a whole rune (each tick, after regen). */
function payGhosts(w: World, i: number): void {
  const s = w.seats;
  for (let k = 0; k < s.queueLen[i]; k++) {
    const o = oweAt(w, i, k);
    if (!o) continue;
    for (const [id, bit] of parts(elementName(s.queue[i * QUEUE_MAX + k]))) {
      if (s.owe[i * QUEUE_MAX + k] & bit && s.runes[rune(w, i, id)] >= 1) { s.runes[rune(w, i, id)] -= 1; s.owe[i * QUEUE_MAX + k] &= ~bit; }
    }
  }
}

/** Would casting the queue now stay within the debt allowed? Owed Sigil is never debt (a held spell's release makes it free). */
function affordable(w: World, i: number, release: boolean): boolean {
  const s = w.seats, need = new Float64Array(N_EL + 1);
  for (let k = 0; k < s.queueLen[i]; k++) for (const [id, bit] of parts(elementName(s.queue[i * QUEUE_MAX + k]))) if (oweAt(w, i, k) & bit) need[id]++;
  if (need[EL.sigil] && !release) return false;
  let debt = 0;
  for (let id = 1; id <= KEYED_EL; id++) if (id !== EL.sigil) debt += Math.max(0, -(s.runes[rune(w, i, id)] - need[id]));
  return debt <= RUNES.debtMax + 1e-9;
}

function startCast(w: World, i: number, castId: number): void {
  const s = w.seats;
  // what's still owed is paid now, as debt (the pool goes below zero); a held spell's release owes nothing for its Sigil
  const release = s.storeLen[i] > 0 && compile(queueOf(w, i), CASTS[castId]).shape === 'store';
  let sigilPaid = true;
  for (let k = 0; k < s.queueLen[i]; k++) for (const [id, bit] of parts(elementName(s.queue[i * QUEUE_MAX + k]))) {
    if (!(oweAt(w, i, k) & bit)) continue;
    if (id === EL.sigil) sigilPaid = false; else s.runes[rune(w, i, id)] -= 1;
  }
  s.owe.fill(0, i * QUEUE_MAX, (i + 1) * QUEUE_MAX);
  s.castId[i] = castId;
  s.castQueue.set(s.queue.subarray(i * QUEUE_MAX, (i + 1) * QUEUE_MAX), i * QUEUE_MAX);
  s.castLen[i] = s.queueLen[i];
  setQueue(w, i, []); // the reserved runes are now spent
  // Sigil + Force with a spell held in the staff releases it, at once and free (a paid Sigil rune comes back; a ghost one
  // was never paid); the user, 2026-11-11: the release is a Sigil and Force, not an empty Force (that's the Strike)
  if (release) {
    if (sigilPaid) s.runes[rune(w, i, EL.sigil)] += 1;
    s.castQueue.set(s.storeQ.subarray(i * QUEUE_MAX, (i + 1) * QUEUE_MAX), i * QUEUE_MAX);
    s.castLen[i] = s.storeLen[i]; s.castId[i] = s.storeCast[i]; s.storeLen[i] = 0; s.dragged[i] = 0;
    s.phase[i] = PHASE.windup; s.timer[i] = 0; s.chanTicks[i] = 0; s.chanTimer[i] = 0;
    return;
  }
  const spec = specOf(w, i);
  spendMote(w, i, spec.form);
  s.phase[i] = PHASE.windup;
  // Blink is instant: it must feel snappy (the user's note on the VFX gallery). Haste speeds every wind-up.
  s.timer[i] = spec.shape === 'blink' ? 0 : Math.round(T(RHYTHM.windup + RHYTHM.windupPerRune * s.castLen[i]) / hasteOf(w, i));
  s.chanTicks[i] = 0; s.chanTimer[i] = 0;
}

export function specOf(w: World, i: number): SpellSpec {
  return compile(queueOf(w, i, true), CASTS[w.seats.castId[i]], { drag: w.seats.dragged[i] === 1 });
}

const aimFace = (w: World, i: number) => (driving(w, i) ? driveFace(w, i) : atan2Turns(w.seats.aimY[i], w.seats.aimX[i]));

/** Would Force make a turret? Those are placed: held to aim, they go at the cursor on release. */
const forcePlaces = (w: World, i: number) => w.seats.queueLen[i] > 0 && compile(queueOf(w, i), 'force').shape === 'turret';

/** The target point for Place (and Blink): the aim point, at most `range` away. */
function target(w: World, i: number, range = SHAPES.placeRange): [number, number] {
  if (driving(w, i)) return driveTarget(w, i);
  const s = w.seats, b = w.bodies, d = len(s.aimX[i], s.aimY[i]);
  const k = d > range ? range / d : 1;
  return [b.x[i] + s.aimX[i] * k, b.y[i] + s.aimY[i] * k];
}

/**
 * Who a Self cast lands on: the ally wizard the cursor is on (near enough to their body), else you.
 * A miss lands on you, which is harmless (explorations/2026-11-03-full-tree.md).
 */
export function selfTarget(w: World, i: number): number {
  const b = w.bodies, s = w.seats, cx = b.x[i] + s.aimX[i], cy = b.y[i] + s.aimY[i];
  let best = i, bd = Infinity;
  for (let j = 0; j < s.active.length; j++) {
    if (j === i || !s.active[j] || b.kind[j] !== KIND.wizard || b.downed[j] || b.team[j] !== b.team[i]) continue;
    const d = len(b.x[j] - cx, b.y[j] - cy);
    if (d < b.r[j] + 0.9 && d < bd) { bd = d; best = j; } // as generous as the inspect card
  }
  return best;
}

function release(w: World, i: number, spec: SpellSpec, charge: number): void {
  const [tx, ty] = target(w, i, spec.shape === 'blink' ? STRUCT.blinkRange : SHAPES.placeRange);
  // Self on an ally gives them your Shield ward or Sigil aura. Plain elements and the Double stay on you.
  const on = spec.shape === 'ward' || spec.shape === 'aura' ? selfTarget(w, i) : i;
  if (STRUCTURE_SHAPES.includes(spec.shape)) { castStructure(w, i, spec, aimFace(w, i), tx, ty, w.seats.holdX[i], w.seats.holdY[i], on); return; }
  // An empty Weapon cast swings your conjured weapon, if you hold one.
  if (spec.cast === 'conjure' && spec.power === 0 && weaponSwing(w, i, aimFace(w, i))) return;
  fireSpell(w, i, spec, aimFace(w, i), tx, ty, charge);
  if (spec.shape !== 'blink' && spec.shape !== 'self') { doubleRepeat(w, i, spec, tx, ty, charge); echoLater(w, i, charge); }
  w.events.push({ tick: w.clock[0], kind: 'cast', who: i, x: w.bodies.x[i], y: w.bodies.y[i], text: spec.title, look: spec.look });
}

/** Recovery after a cast or a hand move; Haste (and Quickstep) shorten it as they do the wind-up. */
function toRecovery(w: World, i: number, seconds = RHYTHM.recovery): void {
  w.seats.phase[i] = PHASE.recover;
  w.seats.timer[i] = Math.round(T(seconds) / hasteOf(w, i));
}

function windupTick(w: World, i: number, held: number, act: boolean): void {
  const s = w.seats, b = w.bodies;
  if (!act) { toRecovery(w, i); return; } // a stun breaks the cast; its runes are spent
  if (s.timer[i] > 0) { s.timer[i]--; return; }
  const spec = specOf(w, i);
  // An armed staff (Sigil alone on Force) takes this spell instead of casting it: held, paid, until an empty-queue Force
  if (s.storeArm[i] && spec.shape !== 'store') {
    s.storeArm[i] = 0;
    s.storeQ.set(s.castQueue.subarray(i * QUEUE_MAX, (i + 1) * QUEUE_MAX), i * QUEUE_MAX);
    s.storeLen[i] = s.castLen[i]; s.storeCast[i] = s.castId[i];
    w.events.push({ tick: w.clock[0], kind: 'cast', who: i, x: b.x[i], y: b.y[i], text: `Stored: ${spec.title}`, look: EL.sigil });
    toRecovery(w, i); return;
  }
  if (spec.charge && held & BTN.force) { s.phase[i] = PHASE.charge; s.chanTicks[i] = 0; return; }
  if (spec.channel) {
    s.phase[i] = PHASE.channel; s.chanTicks[i] = 0;
    s.dblPaid[i] = payDouble(w, i, spec) ? 1 : 0; // the Double echoes the channel if you can pay its half
    w.events.push({ tick: w.clock[0], kind: 'cast', who: i, x: b.x[i], y: b.y[i], text: spec.title, look: spec.look });
  } else { release(w, i, spec, 0); toRecovery(w, i); }
}

/** Can this body act at all this tick? */
export const canAct = (w: World, i: number): boolean => !w.bodies.stun[i] && !w.bodies.frozen[i] && !w.bodies.down[i] && !w.bodies.downed[i];

/** One tick of seat i: runes, queue, buttons, the cast phases. Movement happens in step.ts. */
export function tickSeat(w: World, i: number, inp: PlayerInput): void {
  const s = w.seats, b = w.bodies;
  const held = driving(w, i) ? driveButtons(w, i, inp.buttons) : inp.buttons, released = s.prevButtons[i] & ~held;
  let pressed = held & ~s.prevButtons[i];
  s.prevButtons[i] = held;
  s.aimX[i] = inp.aimX * AIM_UNIT;
  s.aimY[i] = inp.aimY * AIM_UNIT;
  if (s.aimX[i] !== 0 || s.aimY[i] !== 0) b.face[i] = aimFace(w, i);

  // Regen: one shared budget R among the pools that aren't full (world.ts regenRate). Attune multiplies R.
  const mult = s.attune[i] > 0 ? RUNES.attuneMult : 1;
  if (s.attune[i] > 0) s.attune[i]--;
  const full = fullMask(w, i);
  for (let e = 1; e <= N_EL; e++) {
    const k = rune(w, i, e);
    // Sigil runes bound in devices don't come back while those devices stand.
    s.runes[k] = Math.min(poolCap(w, i, e), s.runes[k] + (runeRate(w, i, e, full) * mult) / 60);
  }
  payGhosts(w, i);

  // A conjured guard blocks while Space is held with an empty queue (Defend, grammar v2; guards.ts).
  // Any weapon move or spell drops the block, and so does the fixed recovery after a Retreat.
  const defend = s.guard[i] && held & BTN.self && s.queueLen[i] === 0;
  const wasUp = s.guardT[i] > 0;
  s.guardT[i] = defend && !s.guardCd[i] && s.phase[i] === PHASE.idle && !s.handT[i] && canAct(w, i) ? s.guardT[i] + 1 : 0;
  if (wasUp && !s.guardT[i]) guardRelease(w, i); // the Prism's Lance
  if (defend) pressed &= ~BTN.self; // holding it to block is not a Self cast

  if (pressed & BTN.clear) refundQueue(w, i);
  // Survive's +1 to three: while choosing, the element keys pick elements instead of queueing runes.
  if (!chooseElement(w, i, inp.press0)) pressElement(w, i, inp.press0);
  if (!chooseElement(w, i, inp.press1)) pressElement(w, i, inp.press1);

  // The Area button: tap for Area, hold for Place, drag while holding for a drawn Place.
  if (pressed & BTN.area) { s.areaHeld[i] = 0; s.dragged[i] = 0; s.holdX[i] = b.x[i] + s.aimX[i]; s.holdY[i] = b.y[i] + s.aimY[i]; }
  let areaCast = 0;
  if (held & BTN.area) {
    s.areaHeld[i]++;
    if (len(b.x[i] + s.aimX[i] - s.holdX[i], b.y[i] + s.aimY[i] - s.holdY[i]) > RHYTHM.dragMin) s.dragged[i] = 1;
    // Back at the start: no line after all. It's still a Place (the plain arc or glyph), never a tap's Area.
    else if (s.dragged[i]) { s.dragged[i] = 0; s.areaHeld[i] = Math.max(s.areaHeld[i], T(RHYTHM.placeHold)); }
  } else if (released & BTN.area) {
    areaCast = s.areaHeld[i] < T(RHYTHM.placeHold) && !s.dragged[i] ? CAST_ID.area : CAST_ID.place;
  }

  // A cast pressed while busy is buffered briefly, so no press is lost to recovery.
  const forceCast = (pressed | released) & BTN.force && forcePlaces(w, i) ? released & BTN.force : pressed & BTN.force;
  const want = forceCast ? CAST_ID.force : areaCast || (pressed & BTN.self ? CAST_ID.self : pressed & BTN.weapon ? CAST_ID.conjure : 0);
  if (want) { s.bufCast[i] = want; s.bufTicks[i] = T(RHYTHM.castBuffer); }
  else if (s.bufTicks[i] > 0 && --s.bufTicks[i] === 0) s.bufCast[i] = 0;

  const act = canAct(w, i);
  // Your hands (hands.ts): with no runes queued, the gestures are weapon moves.
  if (s.phase[i] === PHASE.idle && act && (s.queueLen[i] === 0 || s.handT[i] > 0)) {
    // Gestures pressed during the last recovery wait in the cast buffer, as spells do.
    const face = aimFace(w, i), c = s.handT[i] === 0 && s.queueLen[i] === 0 ? s.bufCast[i] : 0;
    if (c) { s.bufCast[i] = 0; s.bufTicks[i] = 0; }
    if (c === CAST_ID.force) {
      if (held & BTN.force) s.handT[i] = 1;
      else { const r = strikeRecovery(w, i); strike(w, i, face); toRecovery(w, i, r); return; } // tapped while busy: a Strike
    } else if (s.handT[i] > 0 && held & BTN.force) { if (++s.handT[i] > TAP) holdTick(w, i); }
    else if (s.handT[i] > 0) {
      const t = s.handT[i];
      s.handT[i] = 0; s.linkTo[i] = -1;
      // a Strike's recovery is its weapon's follow-through (read before the blow: the last use takes the weapon)
      if (t <= TAP) { const r = strikeRecovery(w, i); strike(w, i, face); toRecovery(w, i, r); } else { heavy(w, i, face, heavyCharge(t)); toRecovery(w, i); }
      return;
    }
    if (c === CAST_ID.area || c === CAST_ID.place) {
      const ch = s.specT[i] > 0; s.specT[i] = 0;
      // a held Special (Siphon, Mend) ended on release; a Sweep recovers as a Strike does
      const sweeps = !ch && !channelsSpecial(w, i) && w.seats.weapon[i] !== EL.cold, r = sweeps ? strikeRecovery(w, i) : RHYTHM.recovery;
      if (!ch) { const [tx, ty] = target(w, i); special(w, i, face, tx, ty); }
      toRecovery(w, i, r); return;
    }
    // Shift+RMB held: the wand's Siphon and the hands' Mend channel while it's down.
    if (held & BTN.area && s.areaHeld[i] > TAP && channelsSpecial(w, i)) { specialTick(w, i); return; }
    if (c === CAST_ID.conjure) { retreat(w, i, face); toRecovery(w, i); return; }
    if (c === CAST_ID.self) return; // Space with nothing queued: Defend, when you hold a guard (guardT above)
    if (s.handT[i] > 0) return;
  }
  if (!act) s.handT[i] = 0;
  if (!act || !(held & BTN.area)) s.specT[i] = 0;
  if (!s.handT[i]) s.linkTo[i] = -1;
  switch (s.phase[i]) {
    case PHASE.idle: {
      const c = s.bufCast[i];
      if (!act || !c || (s.queueLen[i] === 0 && c !== CAST_ID.conjure)) break;
      s.bufCast[i] = 0; s.bufTicks[i] = 0;
      // ghosts past the debt allowed: the cast doesn't go (the pool flashes dry); they keep filling
      if (!affordable(w, i, s.storeLen[i] > 0 && compile(queueOf(w, i), CASTS[c]).shape === 'store')) { w.events.push({ tick: w.clock[0], kind: 'dry', who: i, x: b.x[i], y: b.y[i], look: 0 }); break; }
      startCast(w, i, c);
      // Instant spells (Blink) go off this very tick.
      if ((s.phase[i] as number) === PHASE.windup && s.timer[i] === 0) windupTick(w, i, held, act);
      break;
    }
    case PHASE.windup:
      windupTick(w, i, held, act);
      break;
    case PHASE.charge: {
      if (!act) { toRecovery(w, i); break; }
      if (held & BTN.force && s.chanTicks[i] < T(RHYTHM.chargeMax)) { s.chanTicks[i]++; break; }
      if (held & BTN.force) break; // fully charged: hold as long as you like
      release(w, i, specOf(w, i), s.chanTicks[i] / T(RHYTHM.chargeMax));
      toRecovery(w, i);
      break;
    }
    case PHASE.channel: {
      const spec = specOf(w, i);
      if (!act || !(held & BTN.force)) { toRecovery(w, i); break; }
      // Past the natural duration every rune in the spell costs upkeep from its own element (the user, 2026-11-10: in
      // proportion to the runes used); it ends when any of them runs dry.
      if (s.chanTicks[i] >= T(RHYTHM.naturalChannel) && spec.form) {
        let dry = false;
        for (let e = 1; e <= N_EL; e++) {
          const c = spec.counts[e - 1];
          if (!c) continue;
          const k = rune(w, i, e);
          s.runes[k] -= (RHYTHM.upkeep * c) / 60;
          if (s.runes[k] <= 0) { s.runes[k] = 0; dry = true; }
        }
        if (dry) { toRecovery(w, i); break; }
      }
      channelTick(w, i, spec, aimFace(w, i));
      echoChannel(w, i, spec, aimFace(w, i)); // Survive's Echo: a free copy trailing your aim
      const d = s.double[i];
      if (s.dblPaid[i] && d >= 0 && w.bodies.kind[d] === KIND.double) {
        const [tx, ty] = target(w, i, 30);
        channelTick(w, d, spec, atan2Turns(ty - w.bodies.y[d], tx - w.bodies.x[d]), { seat: i, scale: STRUCT.doubleShare });
      }
      s.chanTicks[i]++;
      break;
    }
    case PHASE.recover:
      if (s.timer[i] > 0) s.timer[i]--;
      else s.phase[i] = PHASE.idle;
      break;
  }
}
