/**
 * Shield and Sigil: things that stay in the world or on you.
 *
 * Shield (protects, and turns magic back):
 *   Force  Blink (effects.ts); with elements it leaves their Area spell where you stood.
 *   Area   a closed ring around you.   Place  an arc around you facing the cursor, or a wall you drag.
 *   Self   a ward: resist its elements (Mending with Life), stone armour with Earth, a mirror alone.
 *   Rock is stuff (hit points, paid once); barriers, curtains and wards are energy: they drain the
 *   Shield pool a little while they stand, more for what they absorb, and at the reserve floor the
 *   oldest breaks (Model A).
 *
 * Sigil (makes devices; each binds one Sigil rune while it stands):
 *   Force  a turret that casts the other elements' Force spell at the nearest enemy, drawing each
 *          shot's runes from your pool (it only stalls when you run dry). Alone: Blink (effects.ts).
 *   Area   orbitals, one per rune, that strike the first enemy close by. Alone: rune motes.
 *   Place  a glyph that goes off as the Place spell when an enemy steps on it; drag for a line glyph.
 *          Alone: the lens, which amplifies whatever passes through it.
 *   Weapon a conjured weapon (Stone maul, Arcane hook...). Alone: the sculpting wand.
 *   Self   an aura around you (fire burns, cold chills, life regenerates, lightning hastes...).
 */
import { compile, WALL, solidWall, type SpellSpec } from './compile';
import { BODY, PERKS, RHYTHM, SHAPES, STATUS, STRUCT, T } from './config';
import { EL, KEYED_EL, N_EL, poolCost, queueFromCounts } from './elements';
import { burstEvent, channelTick, fireSpell, heldBlow, hit, hitOpts, nearest, oneShotBlast, payloadOf, stored } from './effects';
import { len } from './geom';
import { HIT_KIND, addChill, addKnock, addSoak, ignite, setHitKind, tryFreeze } from './hit';
import { atan2Turns, cosTurns, sinTurns } from './trig';
import { boundSigil, drainShield, energyLoad, segDist } from './walls';
import { conjureGuard } from './guards';
import { EV, DEVICE, KIND, MAX_BODIES, MAX_DEVICES, MAX_SEATS, MAX_WALLS, MAX_WAVES, PF, PU, QUEUE_MAX, TERRAIN, WARD, alive, freeDevice, lingerLife, lingerSize, regenOf, runeMax, spawnBody, stackOf, type World } from './world';

/** The spell minus its form element: what a Sigil device carries, or what a Shield structure is coated in. */
function restCounts(spec: SpellSpec): Uint8Array {
  const r = spec.counts.slice();
  if (spec.form) r[spec.form - 1] = 0;
  return r;
}

// ---- Shield ------------------------------------------------------------------------------------

/** One Ice rune, as a hit: the Spike aura's stab. */
const SPIKE = payloadOf(compile(['ice'], 'place'));

function raiseWall(w: World, owner: number, type: number, els: Uint8Array, x1: number, y1: number, x2: number, y2: number, hp: number): boolean {
  const wl = w.walls, now = w.clock[0];
  // Too many segments of yours: the oldest from an earlier cast crumbles. A cast never eats its
  // own segments (that left gaps in long walls): with only this cast's left, the wall stops here.
  let mine = 0, oldest = -1;
  for (let k = 0; k < MAX_WALLS; k++) if (wl.type[k] && wl.owner[k] === owner) { mine++; if (wl.born[k] < now && (oldest < 0 || wl.born[k] < wl.born[oldest])) oldest = k; }
  if (mine >= STRUCT.wallsPerOwner) { if (oldest < 0) return false; wl.type[oldest] = WALL.none; }
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k]) continue;
    wl.type[k] = type; wl.owner[k] = owner; wl.x1[k] = x1; wl.y1[k] = y1; wl.x2[k] = x2; wl.y2[k] = y2;
    wl.hp[k] = wl.maxHp[k] = type === WALL.rock && stackOf(w, owner, PU.bedrock) ? hp * 1.5 : hp; wl.born[k] = w.clock[0];
    wl.els.set(els, k * N_EL);
    return true;
  }
  return false;
}

function wallHp(spec: SpellSpec): number {
  const earth = spec.counts[EL.earth - 1], ice = spec.counts[EL.ice - 1];
  if (spec.wall === WALL.rock) return STRUCT.rockHp + STRUCT.rockHpPerRune * (earth - 1);
  if (spec.wall === WALL.ice) return STRUCT.iceHp + STRUCT.iceHpPerRune * (ice - 1); // weaker than rock: a spike barrier
  return STRUCT.energyHp + STRUCT.energyHpPerRune * (spec.power - 1);
}

/** Segments along an arc of `radius` around (cx, cy), centred on `face`, spanning +-half turns. */
function arcWall(w: World, src: number, spec: SpellSpec, cx: number, cy: number, radius: number, face: number, half: number, segs: number): void {
  const els = spec.counts, hp = wallHp(spec);
  for (let k = 0; k < segs; k++) {
    const a1 = face - half + (2 * half * k) / segs, a2 = face - half + (2 * half * (k + 1)) / segs;
    raiseWall(w, src, spec.wall, els, cx + cosTurns(a1) * radius, cy + sinTurns(a1) * radius, cx + cosTurns(a2) * radius, cy + sinTurns(a2) * radius, hp);
  }
}

function drawnWall(w: World, src: number, spec: SpellSpec, x1: number, y1: number, x2: number, y2: number): void {
  const d = len(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / STRUCT.drawnSeg)), hp = wallHp(spec);
  for (let k = 0; k < n; k++) {
    if (!raiseWall(w, src, spec.wall, spec.counts, x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n, x1 + ((x2 - x1) * (k + 1)) / n, y1 + ((y2 - y1) * (k + 1)) / n, hp)) break;
  }
}

/** A front sweeping forward from `src` (a Shield wave, or a weapon's wave: the trident slash, the fire wave, the fissure). */
export function spawnFront(w: World, src: number, els: Uint8Array, face: number, half: number, scale: number, range: number): void {
  const v = w.waves, b = w.bodies;
  for (let k = 0; k < MAX_WAVES; k++) {
    if (v.alive[k]) continue;
    v.alive[k] = 1; v.owner[k] = src; v.dx[k] = cosTurns(face); v.dy[k] = sinTurns(face);
    v.x[k] = b.x[src] + v.dx[k] * 0.8; v.y[k] = b.y[src] + v.dy[k] * 0.8;
    v.half[k] = half; v.travelled[k] = 0; v.scale[k] = scale; v.range[k] = range;
    v.els.set(els.subarray(0, N_EL), k * N_EL);
    v.hit.fill(0, k * MAX_BODIES, (k + 1) * MAX_BODIES);
    v.hit[k * MAX_BODIES + src] = 1;
    return;
  }
}

/**
 * A ward on `i`, kept up by `by` (yourself, or an ally the cursor was on). Each wizard wears one
 * ward (a new one replaces it); a caster may keep up as many as their Shield pool can drain
 * (every ward drains it), so a support player can ward the whole team and themselves.
 */
function putWard(w: World, i: number, spec: SpellSpec, by = i): void {
  const s = w.seats, c = spec.counts;
  s.wardBy[i] = by;
  const rest = restCounts(spec);
  let any = false;
  for (let k = 0; k < N_EL; k++) if (rest[k]) any = true;
  s.ward[i] = c[EL.earth - 1] ? WARD.stone : any ? WARD.ward : WARD.mirror;
  s.wardEls.set(rest, i * N_EL);
  s.wardHp[i] = s.ward[i] === WARD.mirror ? STRUCT.mirrorShots : STRUCT.wardHp + STRUCT.wardHpPerRune * (spec.power - 1);
}

// ---- Sigil -------------------------------------------------------------------------------------

/**
 * Where orb p of orbital device k sits on its owner's ring, in turns. All of one wizard's orbitals
 * share the ring (and its phase): their orbs are spaced evenly round it, in device order.
 */
export function orbitAngle(w: World, k: number, p: number): number {
  const dv = w.devices, owner = dv.owner[k];
  let before = 0, total = 0;
  for (let j = 0; j < MAX_DEVICES; j++) {
    if (dv.type[j] !== DEVICE.orbital || dv.owner[j] !== owner) continue;
    if (j < k) before += dv.charges[j];
    total += dv.charges[j];
  }
  return dv.phase[k] + (before + p) / Math.max(1, total);
}

function spawnDevice(w: World, src: number, type: number, spec: SpellSpec, x: number, y: number, x2 = x, y2 = y): number {
  const dv = w.devices;
  for (let k = 0; k < MAX_DEVICES; k++) {
    if (dv.type[k]) continue;
    dv.type[k] = type; dv.owner[k] = src; dv.x[k] = x; dv.y[k] = y; dv.x2[k] = x2; dv.y2[k] = y2;
    dv.els.set(restCounts(spec), k * N_EL);
    dv.timer[k] = 0; dv.life[k] = 0; dv.charges[k] = 0; dv.phase[k] = 0; dv.chan[k] = 0;
    dv.heal[k] = spec.sub === EL.life ? 1 : 0;
    dv.born[k] = w.clock[0];
    dv.look[k] = spec.sub || spec.look;
    return k;
  }
  return -1;
}

/** The spell a device casts: its carried elements, as Force (turrets) or Place (glyphs). */
const deviceSpell = (w: World, k: number, cast: 'force' | 'place'): SpellSpec => compile(queueFromCounts(w.devices.els, k), cast);

/** A seat pays a device's shot from its pool: `share` of every rune of the payload, or nothing (it stalls). */
function payShot(w: World, owner: number, els: Uint8Array, at: number, share = 1): boolean {
  const s = w.seats;
  for (let id = 1; id <= KEYED_EL; id++) if (s.runes[owner * N_EL + id - 1] < poolCost(els, at, id) * share) return false;
  for (let id = 1; id <= KEYED_EL; id++) s.runes[owner * N_EL + id - 1] -= poolCost(els, at, id) * share;
  return true;
}

/**
 * Seconds between a turret's shots: slow enough that all your turrets together spend at most
 * STRUCT.turretShare of your regen of any element, so a turret can't empty your pool.
 */
function turretGap(w: World, k: number): number {
  const dv = w.devices, owner = dv.owner[k];
  let turrets = 0;
  for (let j = 0; j < MAX_DEVICES; j++) if (dv.type[j] === DEVICE.turret && dv.owner[j] === owner) turrets++;
  let most = 0;
  for (let id = 1; id <= N_EL; id++) if (id !== EL.sigil) most = Math.max(most, dv.els[k * N_EL + id - 1]);
  return Math.max(STRUCT.turretInterval, (turrets * most * STRUCT.turretShotCost) / (regenOf(w, owner) * STRUCT.turretShare));
}

// ---- casting -----------------------------------------------------------------------------------

export const STRUCTURE_SHAPES: readonly string[] = ['store', 'wave', 'ring', 'arcwall', 'drawnwall', 'ward', 'guard', 'turret', 'orbitals', 'motes', 'glyph', 'lineglyph', 'lens', 'wand', 'weapon', 'aura', 'double'];

/** Raises a structure. (tx, ty) is the clamped cursor; (hx, hy) where a Place drag started. */
export function castStructure(w: World, src: number, spec: SpellSpec, face: number, tx: number, ty: number, hx: number, hy: number, on = src): void {
  const b = w.bodies, s = w.seats, x = b.x[src], y = b.y[src];
  switch (spec.shape) {
    case 'ring': arcWall(w, src, spec, x, y, STRUCT.ringRadius, 0, 0.5, STRUCT.ringSegs); break;
    case 'arcwall': arcWall(w, src, spec, x, y, STRUCT.arcRadius, face, STRUCT.arcHalf, STRUCT.arcSegs); break;
    case 'drawnwall': drawnWall(w, src, spec, hx, hy, tx, ty); break;
    case 'ward': putWard(w, on, spec, src); break;
    case 'guard': conjureGuard(w, src, spec.counts); break; // held alongside your weapon (no two-handed weapons)
    case 'turret': {
      const k = spawnDevice(w, src, DEVICE.turret, spec, tx, ty);
      if (k >= 0) w.devices.timer[k] = T(0.4);
      break;
    }
    case 'orbitals': {
      // feeding a ring you already have costs only its elements: the ring's one Sigil rune is already bound, so this cast's comes back
      let had = false;
      for (let j = 0; j < MAX_DEVICES; j++) if (w.devices.type[j] === DEVICE.orbital && w.devices.owner[j] === src) had = true;
      const k = spawnDevice(w, src, DEVICE.orbital, spec, x, y);
      if (had && k >= 0) giveRune(w, src);
      if (k >= 0) {
        let n = 0; for (let e = 0; e < N_EL; e++) if (e !== EL.sigil - 1) n += spec.counts[e]; w.devices.charges[k] = Math.max(1, n);
        trimOrbit(w, src, k);
        // stacked orbitals share one ring: the new one takes up the phase of the caster's others
        for (let j = 0; j < MAX_DEVICES; j++) if (j !== k && w.devices.type[j] === DEVICE.orbital && w.devices.owner[j] === src) { w.devices.phase[k] = w.devices.phase[j]; break; }
      }
      break;
    }
    case 'motes': s.motes[src] = STRUCT.motes; break;
    case 'store': if (!s.storeLen[src]) { s.storeArm[src] = s.storeArm[src] ? 0 : 1; s.storeBorn[src] = w.clock[0]; } break; // arm (or disarm): the next spell goes into the staff (cast.ts)
    case 'glyph': { const k = spawnDevice(w, src, DEVICE.glyph, spec, tx, ty); if (k >= 0) w.devices.timer[k] = T(STRUCT.glyphArm); break; }
    case 'lineglyph': { const k = spawnDevice(w, src, DEVICE.lineglyph, spec, hx, hy, tx, ty); if (k >= 0) w.devices.timer[k] = T(STRUCT.glyphArm); break; }
    case 'lens': {
      // One lens each: placing another moves it.
      for (let k = 0; k < MAX_DEVICES; k++) if (w.devices.type[k] === DEVICE.lens && w.devices.owner[k] === src) w.devices.type[k] = DEVICE.none;
      spawnDevice(w, src, DEVICE.lens, spec, tx, ty);
      break;
    }
    case 'wand': s.wand[src] = 1; s.weapon[src] = 0; s.wandBorn[src] = w.clock[0]; break;
    case 'weapon': {
      s.wand[src] = 0; s.weapon[src] = spec.sub; s.wandBorn[src] = w.clock[0]; // Ice conjures the Ice bow (hands.ts)
      s.weaponEls.set(restCounts(spec), src * N_EL); s.weaponUses[src] = STRUCT.weaponUses;
      break;
    }
    case 'aura': s.auraEls.set(restCounts(spec), on * N_EL); s.aura[on] = T(STRUCT.auraTime); break;
    case 'double': spawnDouble(w, src, face); break;
    default: break;
  }
  w.events.push({ tick: w.clock[0], kind: 'cast', who: src, x, y, text: spec.title, look: spec.look });
}

/**
 * Your orbit is one device (spell audit, 2026-11-11, the user: stacked orbitals bound runes "in a weird way"): every orbital
 * cast adds its orbs to your ring, and the whole ring binds one Sigil rune (boundSigil). Past orbitMax orbs, the oldest go.
 */
function trimOrbit(w: World, src: number, keep: number): void {
  const dv = w.devices;
  for (;;) {
    let total = 0, oldest = -1;
    for (let j = 0; j < MAX_DEVICES; j++) if (dv.type[j] === DEVICE.orbital && dv.owner[j] === src) { total += dv.charges[j]; if (j !== keep && (oldest < 0 || dv.born[j] < dv.born[oldest])) oldest = j; }
    if (total <= STRUCT.orbitMax || oldest < 0) return;
    if (--dv.charges[oldest] <= 0) dv.type[oldest] = DEVICE.none;
  }
}

/** Seat `src`'s Double appears at its left hand (one at a time: an older one goes). Returns its body, or -1 if no slot was free. */
function spawnDouble(w: World, src: number, face: number): number {
  const b = w.bodies, s = w.seats;
  if (s.double[src] >= 0 && b.kind[s.double[src]] === KIND.double) b.kind[s.double[src]] = KIND.none;
  const ox = cosTurns(face + 0.25) * 1.2, oy = sinTurns(face + 0.25) * 1.2;
  const i = spawnBody(w, -1, KIND.double, b.team[src], b.x[src] + ox, b.y[src] + oy, STRUCT.doubleHp, b.r[src]);
  s.double[src] = i; s.dblOX[src] = ox; s.dblOY[src] = oy; s.dblBorn[src] = w.clock[0];
  if (i >= 0) b.face[i] = b.face[src];
  return i;
}

/** A Strike with your conjured weapon (effects.ts heldBlow). Returns false without one. */
export function weaponSwing(w: World, src: number, face: number): boolean {
  const s = w.seats;
  if (!s.weapon[src] || s.weaponUses[src] <= 0) return false;
  heldBlow(w, src, face, 'strike');
  if (--s.weaponUses[src] <= 0) s.weapon[src] = 0;
  return true;
}

/** Pays the Double's half of a spell from your pool; false (and nothing paid) if you can't, or have no Double. */
export function payDouble(w: World, src: number, spec: SpellSpec): boolean {
  const s = w.seats, d = s.double[src];
  if (d < 0 || w.bodies.kind[d] !== KIND.double) return false;
  for (let id = 1; id <= KEYED_EL; id++) if (s.runes[src * N_EL + id - 1] < poolCost(spec.counts, 0, id) * STRUCT.doubleShare) return false;
  for (let id = 1; id <= KEYED_EL; id++) s.runes[src * N_EL + id - 1] -= poolCost(spec.counts, 0, id) * STRUCT.doubleShare;
  return true;
}

/**
 * The Double repeats a one-shot spell from its own spot, at half power, aimed at the same point.
 * It costs half the spell's runes from your pool; if you can't pay, it skips that spell.
 */
export function doubleRepeat(w: World, src: number, spec: SpellSpec, tx: number, ty: number, charge: number): void {
  const b = w.bodies, d = w.seats.double[src];
  if (!payDouble(w, src, spec)) return;
  const face = atan2Turns(ty - b.y[d], tx - b.x[d]);
  b.face[d] = face;
  fireSpell(w, d, spec, face, tx, ty, charge, { scale: STRUCT.doubleShare });
}

/**
 * Dismissing creations (the user's design, 2026-11-04). Your Sigil runes are how many creations you
 * can keep; each one holds a rune while it stands.
 *   Double-tap Sigil (Sigil cancels Sigil) while the cursor is on one of yours: that one goes, and
 *   its rune comes back to you. On yourself: your wand or weapon, aura and motes go.
 *   Press Sigil with no free Sigil rune: your oldest creation goes, and its rune comes to your hand,
 *   so a new device simply replaces the oldest.
 */
const HOVER = 1.0;
const Q = { device: 1, double: 2, onYou: 3, store: 4 } as const;

function giveRune(w: World, seat: number): void {
  const k = seat * N_EL + EL.sigil - 1;
  w.seats.runes[k] = Math.min(runeMax(w, seat, EL.sigil), w.seats.runes[k] + 1);
}

function removeOne(w: World, seat: number, what: number, k: number): void {
  const s = w.seats, b = w.bodies;
  if (what === Q.device) w.devices.type[k] = DEVICE.none;
  else if (what === Q.double) { const d = s.double[seat]; if (d >= 0 && b.kind[d] === KIND.double) b.kind[d] = KIND.none; s.double[seat] = -1; }
  else if (what === Q.store) { s.storeArm[seat] = 0; s.storeLen[seat] = 0; }
  else { s.wand[seat] = 0; s.weapon[seat] = 0; s.aura[seat] = 0; s.motes[seat] = 0; s.storeArm[seat] = 0; s.storeLen[seat] = 0; }
  const x = what === Q.device ? w.devices.x[k] : what === Q.double ? b.x[k] : b.x[seat], y = what === Q.device ? w.devices.y[k] : what === Q.double ? b.y[k] : b.y[seat];
  w.events.push({ tick: w.clock[0], kind: 'burst', who: seat, x, y, amount: 1, look: EL.sigil, ev: EV.dismiss, text: 'dismissed' });
}

/** The creation of yours under (x, y), if any: [kind, index]. */
function hovered(w: World, seat: number, x: number, y: number): [number, number] | null {
  const dv = w.devices, b = w.bodies, s = w.seats;
  let best: [number, number] | null = null, bd = HOVER;
  for (let k = 0; k < MAX_DEVICES; k++) {
    if (!dv.type[k] || dv.owner[k] !== seat || dv.type[k] === DEVICE.orbital) continue;
    const d = dv.type[k] === DEVICE.lineglyph ? segDist(x, y, dv.x[k], dv.y[k], dv.x2[k], dv.y2[k])[0] : len(x - dv.x[k], y - dv.y[k]);
    if (d < bd) { bd = d; best = [Q.device, k]; }
  }
  const d = s.double[seat];
  if (d >= 0 && b.kind[d] === KIND.double && len(x - b.x[d], y - b.y[d]) < bd) { bd = len(x - b.x[d], y - b.y[d]); best = [Q.double, d]; }
  const onYou = s.wand[seat] || s.weapon[seat] || s.aura[seat] > 0 || s.motes[seat] || s.storeArm[seat] || s.storeLen[seat] || dv.type.some((t, k) => t === DEVICE.orbital && dv.owner[k] === seat);
  if (onYou && len(x - b.x[seat], y - b.y[seat]) < bd) best = [Q.onYou, seat];
  return best;
}

/** Sigil-Sigil cancel with the cursor at (x, y): dismiss what's there. True if something went. */
export function dismissAt(w: World, seat: number, x: number, y: number): boolean {
  const h = hovered(w, seat, x, y);
  if (!h) return false;
  if (h[0] === Q.onYou) for (let k = 0; k < MAX_DEVICES; k++) if (w.devices.type[k] === DEVICE.orbital && w.devices.owner[k] === seat) w.devices.type[k] = DEVICE.none;
  const free = h[0] === Q.device && freeDevice(w, h[1]); // a Clockwork turret bound no rune
  removeOne(w, seat, h[0], h[1]);
  if (!free) giveRune(w, seat);
  return true;
}

/**
 * Shield-Shield cancel with the cursor at (x, y): your wall there comes down, the whole cast at once
 * (every segment raised on the same tick), or, with the cursor on you, your ward and conjured guard.
 * Energy walls stop draining your pool; rock was paid once and gives nothing back. True if something went.
 */
export function dismissShieldAt(w: World, seat: number, x: number, y: number): boolean {
  const wl = w.walls, b = w.bodies, s = w.seats;
  let best = -1, bd = HOVER;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!wl.type[k] || wl.owner[k] !== seat) continue;
    const d = segDist(x, y, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0];
    if (d < bd) { bd = d; best = k; }
  }
  if ((s.ward[seat] || s.guard[seat]) && len(x - b.x[seat], y - b.y[seat]) < bd) {
    s.ward[seat] = WARD.none; s.guard[seat] = 0;
    w.events.push({ tick: w.clock[0], kind: 'burst', who: seat, x: b.x[seat], y: b.y[seat], amount: 1, look: EL.shield, ev: EV.dismiss, text: 'dismissed' });
    return true;
  }
  if (best < 0) return false;
  const born = wl.born[best], look = wl.type[best] === WALL.rock ? EL.earth : wl.type[best] === WALL.ice ? EL.ice : EL.shield;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!wl.type[k] || wl.owner[k] !== seat || wl.born[k] !== born) continue;
    w.events.push({ tick: w.clock[0], kind: 'burst', who: seat, x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, amount: 0.6, look, ev: EV.dismiss, text: 'dismissed' });
    wl.type[k] = WALL.none;
  }
  return true;
}

/** Pressing Sigil with no free rune: the oldest creation goes and its rune comes to your hand. */
export function recallOldest(w: World, seat: number): boolean {
  const dv = w.devices, s = w.seats, b = w.bodies;
  let what = 0, idx = -1, born = Infinity;
  // a Clockwork turret binds no rune, so recalling it would free none
  for (let k = 0; k < MAX_DEVICES; k++) if (dv.type[k] && dv.owner[k] === seat && !freeDevice(w, k) && dv.born[k] < born) { born = dv.born[k]; what = Q.device; idx = k; }
  const d = s.double[seat];
  if (d >= 0 && b.kind[d] === KIND.double && s.dblBorn[seat] < born) { born = s.dblBorn[seat]; what = Q.double; idx = d; }
  if ((s.wand[seat] || s.weapon[seat]) && s.wandBorn[seat] < born) { born = s.wandBorn[seat]; what = Q.onYou; idx = seat; }
  if ((s.storeArm[seat] || s.storeLen[seat]) && s.storeBorn[seat] < born) { born = s.storeBorn[seat]; what = Q.store; idx = seat; }
  if (!what) return false;
  if (what === Q.onYou) { s.wand[seat] = 0; s.weapon[seat] = 0; w.events.push({ tick: w.clock[0], kind: 'burst', who: seat, x: b.x[seat], y: b.y[seat], amount: 1, look: EL.sigil, ev: EV.dismiss, text: 'dismissed' }); }
  else if (what === Q.device && w.devices.type[idx] === DEVICE.orbital) { for (let k = 0; k < MAX_DEVICES; k++) if (w.devices.type[k] === DEVICE.orbital && w.devices.owner[k] === seat) removeOne(w, seat, Q.device, k); } // the ring is one device
  else removeOne(w, seat, what, idx);
  giveRune(w, seat);
  return true;
}

/** Doubles keep to their spot beside their owner, walking there like a wizard would. */
function tickDoubleMoves(w: World): void {
  const b = w.bodies, s = w.seats;
  for (let i = 0; i < MAX_SEATS; i++) {
    const d = s.double[i];
    if (d < 0 || b.kind[d] !== KIND.double) continue;
    const tx = b.x[i] + s.dblOX[i] - b.x[d], ty = b.y[i] + s.dblOY[i] - b.y[d], tl = len(tx, ty);
    const speed = tl > 0.15 ? Math.min(BODY.walkSpeed * 1.1, tl * 6) : 0;
    b.vx[d] = tl > 1e-6 ? (tx / tl) * speed : 0; b.vy[d] = tl > 1e-6 ? (ty / tl) * speed : 0;
    b.face[d] = b.face[i];
  }
}

/** Rune motes: each cast spends one and gives back part of a rune of that spell's form element. */
export function spendMote(w: World, seat: number, form: number): void {
  const s = w.seats;
  if (!s.motes[seat] || !form) return;
  s.motes[seat]--;
  if (form === EL.ice) form = EL.cold; // an Ice spell's mote gives back toward Cold (Ice has no pool)
  const k = seat * N_EL + form - 1;
  s.runes[k] = Math.min(runeMax(w, seat, form), s.runes[k] + STRUCT.moteRefund);
}

// ---- per tick ----------------------------------------------------------------------------------

export function tickStructures(w: World): void {
  tickDoubleMoves(w);
  const b = w.bodies, s = w.seats, wl = w.walls, v = w.waves, dv = w.devices, tick = w.clock[0];

  // Rock times out: it stands rockLife seconds (more with Earth) and crumbles over the last few. Ice
  // walls likewise, shorter (iceLife, more with Ice), melting over the last iceMeltAway s.
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!solidWall(wl.type[k]) || wl.owner[k] === TERRAIN) continue; // the arena's own rock stays
    const ice = wl.type[k] === WALL.ice;
    const base = ice
      ? T(STRUCT.iceLife + STRUCT.iceLifePerRune * Math.max(0, wl.els[k * N_EL + EL.ice - 1] - 1))
      : T(STRUCT.rockLife + STRUCT.rockLifePerEarth * Math.max(0, wl.els[k * N_EL + EL.earth - 1] - 1));
    const life = Math.round((!ice && stackOf(w, wl.owner[k], PU.bedrock) ? base * 2 : base) * lingerLife(w, wl.owner[k]));
    const left = life - (tick - wl.born[k]);
    if (left <= 0) { w.events.push({ tick, kind: 'burst', who: wl.owner[k], x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, amount: 0.5, look: ice ? EL.ice : EL.earth }); wl.type[k] = WALL.none; continue; }
    const crumble = T(ice ? STRUCT.iceMeltAway : STRUCT.rockCrumble);
    if (left < crumble) wl.hp[k] = Math.min(wl.hp[k], (wl.maxHp[k] * left) / crumble);
  }

  // Model A: energy drains the Shield pool; at the reserve floor the oldest energy structure breaks.
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i]) continue;
    const load = energyLoad(w, i);
    if (!load) continue;
    drainShield(w, i, (STRUCT.idleDrain * load) / 60);
    if (s.runes[i * N_EL + EL.shield - 1] <= STRUCT.reserve) {
      let oldest = -1;
      for (let k = 0; k < MAX_WALLS; k++) if ((wl.type[k] === WALL.barrier || wl.type[k] === WALL.curtain) && wl.owner[k] === i && (oldest < 0 || wl.born[k] < wl.born[oldest])) oldest = k;
      if (oldest >= 0) wl.type[oldest] = WALL.none;
      else for (let j = 0; j < s.ward.length; j++) if (s.wardBy[j] === i && s.ward[j] !== WARD.stone) s.ward[j] = WARD.none;
    }
    // Mending ward: heals you slowly while it holds.
    if (s.ward[i] && s.wardEls[i * N_EL + EL.life - 1]) b.hp[i] = Math.min(b.maxHp[i], b.hp[i] + STRUCT.mendPerSec / 60);
  }

  // Curtains pulse their elements on whoever stands in them (a Life curtain is a healing zone);
  // coated rock pulses its coat on whoever touches it (a Life wall heals those sheltering against
  // it, and the enemies bashing it too; a Fire wall burns them). The Earth is the wall itself.
  // An ice wall is all spikes: whoever presses against it is stabbed by its Ice (and the rest), harder (spikeScale).
  for (let k = 0; k < MAX_WALLS; k++) {
    const ty = wl.type[k];
    if ((ty !== WALL.curtain && !solidWall(ty)) || (tick - wl.born[k]) % 30 !== 0) continue;
    const els = wl.els.slice(k * N_EL, k * N_EL + N_EL);
    els[EL.shield - 1] = 0;
    if (ty === WALL.rock) { els[EL.earth - 1] = 0; if (!els.some((n) => n > 0)) continue; }
    const heal = els[EL.life - 1] > 0;
    // A wizard's coated force field (spell audit, 2026-11-11): its harm bites only the other side pressing on it or battering
    // it, and its Life heals only its own team, as they pass through or stand against it. (A curtain of the place, the
    // battery's gate fire, still burns whoever crosses it.)
    const field = ty === WALL.curtain && wl.owner[k] >= 0;
    const harm = els.slice(); harm[EL.life - 1] = 0;
    const harmful = harm.some((n) => n > 0);
    // A body touching several segments of the same wall is pulsed once.
    const scale = ty === WALL.ice ? STRUCT.spikeScale : 0.4;
    const touches = (i: number, j: number) => segDist(b.x[i], b.y[i], wl.x1[j], wl.y1[j], wl.x2[j], wl.y2[j])[0] <= b.r[i] + 0.35;
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || !touches(i, k)) continue;
      let first = true;
      for (let j = 0; j < k && first; j++) if (wl.type[j] === ty && wl.owner[j] === wl.owner[k] && wl.born[j] === wl.born[k] && touches(i, j)) first = false;
      if (!first) continue;
      if (field) {
        const ally = b.team[i] === b.team[wl.owner[k]];
        if (ally) { if (heal) hit(w, i, stored(els, 0, PF.heal, 0, EL.life), hitOpts(payloadOf(compile(queueFromCounts(els), 'place')), wl.owner[k], scale)); }
        else if (harmful) hit(w, i, stored(harm, 0, 0, 0, 0), hitOpts(payloadOf(compile(queueFromCounts(harm), 'place')), wl.owner[k], STRUCT.fieldBite));
        continue;
      }
      hit(w, i, stored(els, 0, heal ? PF.heal : 0, 0, heal ? EL.life : 0), hitOpts(payloadOf(compile(queueFromCounts(els), 'place')), wl.owner[k], scale));
    }
  }

  // Waves sweep forward and hit each body once.
  for (let k = 0; k < MAX_WAVES; k++) {
    if (!v.alive[k]) continue;
    const step = STRUCT.waveSpeed / 60;
    v.x[k] += v.dx[k] * step; v.y[k] += v.dy[k] * step; v.travelled[k] += step;
    const els = v.els.subarray(k * N_EL, k * N_EL + N_EL);
    const earth = els[EL.earth - 1], water = els[EL.water - 1], life = els[EL.life - 1];
    let onlyShield = true;
    for (let e = 0; e < N_EL; e++) if (e !== EL.shield - 1 && els[e]) onlyShield = false;
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || v.hit[k * MAX_BODIES + i]) continue;
      const rx = b.x[i] - v.x[k], ry = b.y[i] - v.y[k];
      const along = rx * v.dx[k] + ry * v.dy[k], side = -rx * v.dy[k] + ry * v.dx[k];
      if (Math.abs(along) > 0.5 + b.r[i] || Math.abs(side) > v.half[k] + b.r[i]) continue;
      v.hit[k * MAX_BODIES + i] = 1;
      const p = stored(v.els, k, life ? PF.heal : 0, water ? 1 : 0, earth ? EL.earth : water ? EL.water : EL.shield);
      setHitKind(HIT_KIND.wave);
      hit(w, i, p, hitOpts(p, v.owner[k], v.scale[k], v.dx[k], v.dy[k]));
      if (onlyShield || water) addKnock(w, i, v.dx[k], v.dy[k], onlyShield ? STRUCT.shove : 4);
    }
    // The Shove wave sweeps shots away.
    if (onlyShield) {
      const m = w.missiles;
      for (let j = 0; j < m.alive.length; j++) {
        if (!m.alive[j] || m.owner[j] === v.owner[k]) continue;
        const rx = m.x[j] - v.x[k], ry = m.y[j] - v.y[k];
        if (Math.abs(rx * v.dx[k] + ry * v.dy[k]) < 0.6 && Math.abs(-rx * v.dy[k] + ry * v.dx[k]) < v.half[k]) m.alive[j] = 0;
      }
    }
    if (v.travelled[k] >= v.range[k]) v.alive[k] = 0;
  }

  // Devices.
  for (let k = 0; k < MAX_DEVICES; k++) {
    const type = dv.type[k];
    if (!type) continue;
    const owner = dv.owner[k];
    if (type === DEVICE.turret) {
      const target = dv.heal[k] ? nearest(w, dv.x[k], dv.y[k], STRUCT.turretRange, [owner], b.team[owner]) : nearestFoe(w, dv.x[k], dv.y[k], STRUCT.turretRange, owner);
      // Channelling its spell (a spray, beam or arc, as you would): it follows the nearest target
      // for the channel's natural length, then rests as long as a shot would.
      if (dv.chan[k] > 0) {
        const spec = deviceSpell(w, k, 'force'), run = T(RHYTHM.naturalChannel) - dv.chan[k];
        if (target >= 0) dv.phase[k] = atan2Of(b.x[target] - dv.x[k], b.y[target] - dv.y[k]);
        if (spec.shape === 'arc') { if (run % T(SHAPES.arcInterval) === 0 && target >= 0) fireArc(w, owner, spec, dv.x[k], dv.y[k], target); }
        else channelTick(w, owner, spec, dv.phase[k], undefined, { x: dv.x[k], y: dv.y[k], t: run, end: (ex, ey) => { dv.x2[k] = ex; dv.y2[k] = ey; } });
        if (--dv.chan[k] === 0) dv.timer[k] = T(turretGap(w, k));
        continue;
      }
      if (dv.timer[k] > 0) { dv.timer[k]--; continue; }
      if (target < 0) { dv.timer[k] = T(0.2); continue; }
      if (!payShot(w, owner, dv.els, k, STRUCT.turretShotCost)) { // dry: it waits for your regen
        if (tick % 30 === 0) w.events.push({ tick, kind: 'dry', who: owner, x: dv.x[k], y: dv.y[k], look: dv.look[k] });
        dv.timer[k] = T(0.25);
        continue;
      }
      // The turret casts the spell it was made with: a channel channels (above), the rest fire once.
      const spec = deviceSpell(w, k, 'force');
      const face = atan2Of(b.x[target] - dv.x[k], b.y[target] - dv.y[k]);
      if (spec.channel) { dv.chan[k] = T(RHYTHM.naturalChannel); dv.phase[k] = face; dv.x2[k] = dv.x[k]; dv.y2[k] = dv.y[k]; }
      else fireSpell(w, owner, spec.charge ? { ...spec, charge: false } : spec, face, b.x[target], b.y[target], 0, { ox: dv.x[k], oy: dv.y[k] });
      w.events.push({ tick, kind: 'zap', who: owner, x: dv.x[k], y: dv.y[k] - 0.5, x2: dv.x[k], y2: dv.y[k], look: dv.look[k] });
      dv.timer[k] = T(turretGap(w, k));
    } else if (type === DEVICE.glyph || type === DEVICE.lineglyph) {
      if (dv.timer[k] > 0) { dv.timer[k]--; continue; }
      const allies = dv.heal[k] === 1; // the Life glyph is for allies only; the rest wait for enemies
      for (let i = 0; i < b.kind.length; i++) {
        if (!alive(w, i)) continue;
        if (allies ? b.team[i] !== b.team[owner] : b.team[i] === b.team[owner]) continue;
        const d = type === DEVICE.glyph ? len(b.x[i] - dv.x[k], b.y[i] - dv.y[k]) : segDist(b.x[i], b.y[i], dv.x[k], dv.y[k], dv.x2[k], dv.y2[k])[0];
        if (d > glyphRadiusOf(w, owner) + b.r[i]) continue;
        const spec = deviceSpell(w, k, 'place');
        // a glyph is the Place spell at glyphPower: the trap earns a little for its delay and its bound rune (spell audit, 2026-11-11)
        if (type === DEVICE.glyph) fireSpell(w, owner, spec, 0, dv.x[k], dv.y[k], 0, { ox: dv.x[k], oy: dv.y[k], scale: STRUCT.glyphPower });
        else for (let f = 0; f <= 2; f++) { const px = dv.x[k] + (dv.x2[k] - dv.x[k]) * f / 2, py = dv.y[k] + (dv.y2[k] - dv.y[k]) * f / 2; fireSpell(w, owner, spec, 0, px, py, 0, { ox: px, oy: py, scale: STRUCT.glyphPower }); }
        burstEvent(w, owner, dv.x[k], dv.y[k], glyphRadiusOf(w, owner) * 1.5, dv.look[k]);
        dv.type[k] = DEVICE.none;
        break;
      }
    } else if (type === DEVICE.orbital) {
      dv.phase[k] += STRUCT.orbitSpeed / 60;
      dv.x[k] = b.x[owner]; dv.y[k] = b.y[owner];
      const n = dv.charges[k];
      for (let o = 0; o < n; o++) {
        const a = orbitAngle(w, k, o), ox = b.x[owner] + cosTurns(a) * STRUCT.orbitRadius, oy = b.y[owner] + sinTurns(a) * STRUCT.orbitRadius;
        const target = dv.heal[k] ? nearest(w, ox, oy, STRUCT.orbitStrike, [owner], b.team[owner]) : nearestFoe(w, ox, oy, STRUCT.orbitStrike, owner);
        if (target < 0) continue;
        const spec = deviceSpell(w, k, 'force');
        const p = payloadOf(spec);
        const dx = b.x[target] - ox, dy = b.y[target] - oy, d = len(dx, dy) || 1;
        // all the orbs one cast made strike orbitPower x its spell between them, a spray element's with its one-shot blast (spell
        // audit, 2026-11-11: each orb used to carry the whole spell at up to 1.2, so extra runes counted twice)
        let made = 0; for (let e = 0; e < N_EL; e++) if (e !== EL.sigil - 1) made += dv.els[k * N_EL + e];
        hit(w, target, p, hitOpts(p, owner, (STRUCT.orbitPower * oneShotBlast(spec)) / Math.max(1, made), dx / d, dy / d));
        // text: tells the sound an orb's strike from a turret's arc (events aren't in the state hash)
        w.events.push({ tick, kind: 'zap', who: owner, x: ox, y: oy, x2: b.x[target], y2: b.y[target], look: dv.look[k], ev: EV.orbital, text: 'orbital' });
        dv.charges[k]--;
        break; // one strike per tick
      }
      if (!dv.charges[k]) dv.type[k] = DEVICE.none;
    }
  }

  // Auras: every half second, those around you get the aura's elements.
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i] || s.aura[i] <= 0) continue;
    s.aura[i]--;
    if (s.aura[i] % 30 !== 0) continue;
    const els = s.auraEls;
    const fire = els[i * N_EL + EL.fire - 1], water = els[i * N_EL + EL.water - 1];
    const cold = els[i * N_EL + EL.cold - 1], ice = els[i * N_EL + EL.ice - 1];
    const life = els[i * N_EL + EL.life - 1], earth = els[i * N_EL + EL.earth - 1];
    for (let t = 0; t < b.kind.length; t++) {
      if (!alive(w, t)) continue;
      const d = len(b.x[t] - b.x[i], b.y[t] - b.y[i]);
      if (d > STRUCT.auraRadius + b.r[t]) continue;
      const foe = b.team[t] !== b.team[i];
      if (life && t === i) { // regeneration is the wearer's alone
        const h = Math.min(STRUCT.regenAura * life, b.maxHp[t] - b.hp[t]); // each half second
        if (h > 0) { b.hp[t] += h; w.events.push({ tick: w.clock[0], kind: 'heal', who: t, src: i, x: b.x[t], y: b.y[t], amount: h, look: EL.life }); }
      }
      if (t === i) continue;
      if (foe) {
        if (fire) ignite(w, t, STATUS.burnAura * fire, i, T(1.5)); // each half second: burning at 6 a second a Fire rune while you stay close
        if (cold) {
          addChill(w, t, 2.5 * cold);
          if (!water) tryFreeze(w, t); // Cold on the wet, as in hit.ts; a Mist + Frost aura can't do both
        }
        if (ice) {
          // The Spike aura: ice spikes stab enemies close by, an Ice hit (its damage, a little chill, and a freeze if
          // they were already wet). With a Mist aura too, the wet it leaves is hidden from the stab: one aura can't do both.
          const wet = b.wet[t], soak = b.soak[t];
          if (water) b.wet[t] = 0;
          hit(w, t, SPIKE, hitOpts(SPIKE, i, STRUCT.spikeAura * ice));
          if (water && b.wet[t] === 0) { b.wet[t] = wet; b.soak[t] = soak; }
        }
        if (water) addSoak(w, t, STATUS.soakPerRune * 0.5 * water); // the mist soaks by its Water, each half second
        if (earth && d < b.r[t] + b.r[i] + 0.3) { const ux = (b.x[t] - b.x[i]) / (d || 1), uy = (b.y[t] - b.y[i]) / (d || 1); addKnock(w, t, ux, uy, 6 * earth); }
      } else if (water) b.burn[t] = 0; // the mist douses burning allies
    }
  }
}

/**
 * Haste: how many times as fast seat `i` walks, winds up and recovers. The Haste aura (Sigil +
 * Lightning on yourself) gives STRUCT.hasteMult; Survive's Quickstep is a permanent, weaker one
 * (PERKS.quickstep a stack), and the two multiply.
 */
export const hasteOf = (w: World, i: number): number => {
  if (i < 0 || i >= MAX_SEATS) return 1;
  const aura = w.seats.aura[i] > 0 && w.seats.auraEls[i * N_EL + EL.lightning - 1] ? STRUCT.hasteMult : 1;
  const q = stackOf(w, i, PU.quickstep);
  return q ? aura * (1 + PERKS.quickstep * q) : aura;
};

/** A glyph's trigger radius: STRUCT.glyphRadius, wider with Lingering. */
export const glyphRadiusOf = (w: World, owner: number): number => STRUCT.glyphRadius * lingerSize(w, owner);

/** Sigil regen cap: bound runes don't come back while their device stands. */
export const sigilCap = (w: World, seat: number): number => runeMax(w, seat, EL.sigil) - boundSigil(w, seat);

/** The level element `id`'s pool refills to: its max (Sigil: less the runes bound in devices). Never below 0. */
export const poolCap = (w: World, seat: number, id: number): number => Math.max(0, (id === EL.sigil ? sigilCap(w, seat) : runeMax(w, seat, id)) - queuedOf(w, seat, id));

/**
 * Runes of element `id` held in seat's queue: they don't regenerate until cast (the user, 2026-11-11: a queue can't be used
 * to hold more runes than the pool). Ice holds a Water and a Cold.
 */
export function queuedOf(w: World, seat: number, id: number): number {
  const s = w.seats;
  let n = 0;
  for (let k = 0; k < s.queueLen[seat]; k++) {
    const q = s.queue[seat * QUEUE_MAX + k], o = s.owe[seat * QUEUE_MAX + k]; // a ghost's unpaid part isn't held
    if (q === id && q !== EL.ice && !(o & 1)) n++;
    if (q === EL.ice && ((id === EL.water && !(o & 1)) || (id === EL.cold && !(o & 2)))) n++;
  }
  return n;
}

/** Which of seat's pools are full, as a bitmask (1 << element id), for the shared regen budget (world.ts regenRate). */
export function fullMask(w: World, seat: number): number {
  let m = 0;
  for (let e = 1; e <= N_EL; e++) if (w.seats.runes[seat * N_EL + e - 1] >= poolCap(w, seat, e)) m |= 1 << e;
  return m;
}

function nearestFoe(w: World, x: number, y: number, r: number, owner: number): number {
  const b = w.bodies;
  let best = -1, bd = r;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === owner || b.team[i] === b.team[owner]) continue;
    const d = len(b.x[i] - x, b.y[i] - y) - b.r[i];
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const atan2Of = (dx: number, dy: number): number => atan2Turns(dy, dx);

/** A turret's lightning: one arc from the device to its target, carrying the payload. */
function fireArc(w: World, owner: number, spec: SpellSpec, ox: number, oy: number, target: number): void {
  const b = w.bodies, p = payloadOf(spec);
  const dx = b.x[target] - ox, dy = b.y[target] - oy, d = len(dx, dy) || 1;
  w.events.push({ tick: w.clock[0], kind: 'zap', who: owner, x: ox, y: oy, x2: b.x[target], y2: b.y[target], look: spec.look });
  hit(w, target, p, hitOpts(p, owner, spec.heal ? SHAPES.chainHealPower : SHAPES.arcPower, dx / d, dy / d)); // your own arc's power (spell audit, 2026-11-11: it was 0.7, 3.6x yours a rune)
}

