/**
 * Spell shapes in the world: what each Shape does when it fires, and the per-tick updates of
 * channels, missiles, zones and surfaces. The cast state machine (cast.ts) decides when.
 *
 * A Payload is what a hit carries: element counts plus a few flags. Missiles and zones store it
 * in their typed arrays (els, flags, mod, look) and rebuild the view object when they hit.
 */
import { BATTERY, driving, sprayReach } from './battery';
import type { Mod, SpellSpec } from './compile';
import { ARMS, BODY, CELL, COMBAT, PERKS, RUNES, SHAPES, STATUS, STRUCT, SURFACE, T } from './config';
import { EL, N_EL, elementName, queueFromCounts } from './elements';
import { inCone, len, rayCircle } from './geom';
import { HIT_KIND, addChill, addKnock, applyHit, drench, ignite, setHitKind, soakOf, tryFreeze, type HitOpts } from './hit';
import { cosTurns, sinTurns } from './trig';
import { TERRAIN_HIT, clipRay, collideWalls, damageWall, isRockHit, lensAt, payloadDamage, rayThroughLens, wallAt } from './walls';
import { WALL, compile, imbueLine, imbueReach } from './compile';
import { ARCHETYPES } from './archetypes';
import { RES, grounded, guardMissile, phased, taken, warm } from './guards';
import { noteBlocked } from './tutorial-data';
import { DT, KIND, MAX_MISSILES, MAX_SEATS, MAX_ZONES, MOD_ID, PF, PU, SURF, WARD, ZONE, alive, lingerLife, lingerSize, stackOf, type World } from './world';

export interface Payload {
  counts: Uint8Array;
  /** Slot in `counts` (9 per slot). */
  at: number;
  heal: boolean; scald: boolean; freeze: boolean;
  mod: Mod;
  look: number;
  formN: number;
}

const MODS: Mod[] = [null, 'push', 'shatter', 'chain', 'burst'];
const modId = (m: Mod): number => (m ? MOD_ID[m] : 0);
const flagsOf = (p: Payload): number => (p.heal ? PF.heal : 0) | (p.scald ? PF.scald : 0) | (p.freeze ? PF.freeze : 0);

export function payloadOf(spec: SpellSpec): Payload {
  return { counts: spec.counts, at: 0, heal: spec.heal, scald: spec.scald, freeze: spec.freeze, mod: spec.mod, look: spec.look, formN: spec.formN };
}
export function stored(els: Uint8Array, at: number, flags: number, mod: number, look: number): Payload {
  return { counts: els, at, heal: !!(flags & PF.heal), scald: !!(flags & PF.scald), freeze: !!(flags & PF.freeze), mod: MODS[mod], look, formN: 1 };
}

export function hitOpts(p: Payload, source: number, scale: number, dirX = 0, dirY = 0, statusScale = 1, frontal = false): HitOpts {
  return { scale, heal: p.heal, scald: p.scald, freeze: p.freeze, source, dirX, dirY, push: p.mod === 'push' ? SHAPES.push : 0, statusScale, frontal };
}

export function hitEvent(w: World, i: number, dealt: number, look: number, src = -1): void {
  if (!dealt) return;
  w.events.push({ tick: w.clock[0], kind: dealt > 0 ? 'hit' : 'heal', who: i, src, x: w.bodies.x[i], y: w.bodies.y[i], amount: Math.abs(dealt), look });
}

export function hit(w: World, i: number, p: Payload, o: HitOpts, event = true): number {
  const dealt = applyHit(w, i, p.counts, p.at, o);
  if (event) hitEvent(w, i, dealt, p.look, o.source);
  return dealt;
}

// ---- surfaces -----------------------------------------------------------------------------

/** The surface cell under (x, y) in this world's grid, or -1 off the floor. */
export const cellAt = (w: World, x: number, y: number): number => {
  const d = w.dims, cx = Math.floor((x + d.w / 2) / CELL), cy = Math.floor((y + d.h / 2) / CELL);
  return cx < 0 || cy < 0 || cx >= d.gw || cy >= d.gh ? -1 : cy * d.gw + cx;
};

const surfLife = (k: number): number => T(k === SURF.water ? SURFACE.water : k === SURF.ice ? SURFACE.ice : SURFACE.fire);

/** An element reaching the floor. Water floods, cold freezes water (or frosts the ground), fire burns or melts. */
/** `mult` stretches the floor's life (a Place patch with more of its lead element lasts longer). */
export function touchFloor(w: World, cell: number, el: number, mult = 1, heat = 1): void {
  if (cell < 0) return;
  const s = w.surf, k = s.kind[cell];
  let next: number = k;
  if (el === EL.water) next = k === SURF.fire ? SURF.none : k === SURF.ice ? SURF.ice : SURF.water;
  else if (el === EL.cold) next = k === SURF.fire ? SURF.none : SURF.ice;
  else if (el === EL.fire) next = k === SURF.ice ? SURF.water : k === SURF.water ? SURF.none : SURF.fire;
  else return;
  s.kind[cell] = next;
  s.life[cell] = next ? Math.round(surfLife(next) * mult) : 0;
  s.heat[cell] = next === SURF.fire ? Math.max(1, Math.min(255, heat)) : 0;
}

export function floorDisc(w: World, x: number, y: number, r: number, el: number, mult = 1, heat = 1): void {
  for (let gy = -r; gy <= r; gy += CELL) for (let gx = -r; gx <= r; gx += CELL) {
    if (gx * gx + gy * gy <= r * r) touchFloor(w, cellAt(w, x + gx, y + gy), el, mult, heat);
  }
}

const surfAt = (w: World, x: number, y: number): number => { const c = cellAt(w, x, y); return c < 0 ? 0 : w.surf.kind[c]; };

export function tickSurfaces(w: World): void {
  const s = w.surf, b = w.bodies;
  for (let c = 0; c < s.kind.length; c++) if (s.kind[c] && --s.life[c] <= 0) s.kind[c] = SURF.none;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i)) continue;
    const k = surfAt(w, b.x[i], b.y[i]);
    if (k === SURF.water) { drench(w, i); b.burn[i] = 0; } // standing in water soaks you through
    // ice bites at the feet: it chills, and a wet body standing on it freezes (it used to make bodies slide instead)
    if (k === SURF.ice && !(i < MAX_SEATS && warm(w, i))) { b.burn[i] = 0; addChill(w, i, SURFACE.iceChill / 60); if (b.wet[i]) tryFreeze(w, i); }
    // a fire floor: a touch lights you, and standing in it keeps feeding the burn, both by the Fire that made it
    if (k === SURF.fire && !(b.kind[i] === KIND.enemy && ARCHETYPES[b.arch[i]].burnImmune)) {
      const heat = Math.max(1, w.surf.heat[cellAt(w, b.x[i], b.y[i])]);
      ignite(w, i, heat * (b.burn[i] ? STATUS.burnFloorRate / 60 : STATUS.burnFloorTouch), b.burn[i] ? b.burnSrc[i] : -1);
    }
  }
}

/** Lightning on water surges through everyone standing in water nearby. */
function surge(w: World, x: number, y: number, p: Payload, src: number): void {
  const b = w.bodies;
  if (surfAt(w, x, y) !== SURF.water) return;
  w.events.push({ tick: w.clock[0], kind: 'surge', who: src, x, y });
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i)) continue;
    if (len(b.x[i] - x, b.y[i] - y) < 6 && surfAt(w, b.x[i], b.y[i]) === SURF.water) hit(w, i, p, hitOpts(p, src, 0.6));
  }
}

// ---- instant shapes -------------------------------------------------------------------------

/** Every body within `r` of (x, y), except `skip`, gets the payload, pushed away from the centre. */
/** `axis` multiplies only the element's own axis (chill, push): the Frost and Splash rings' instant strength. */
export function disc(w: World, p: Payload, src: number, x: number, y: number, r: number, scale: number, skip: number, northOf?: number, axis = 1): void {
  const b = w.bodies;
  setHitKind(HIT_KIND.burst);
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === skip || (northOf !== undefined && b.y[i] > northOf)) continue;
    const dx = b.x[i] - x, dy = b.y[i] - y, d = len(dx, dy);
    if (d > r + b.r[i]) continue;
    const o = hitOpts(p, src, scale, d > 1e-6 ? dx / d : 1, d > 1e-6 ? dy / d : 0);
    if (axis !== 1) o.axis = axis;
    hit(w, i, p, o);
  }
}

export const burstEvent = (w: World, src: number, x: number, y: number, r: number, look: number) =>
  w.events.push({ tick: w.clock[0], kind: 'burst', who: src, x, y, amount: r, look });

/** Extra options when a spell is fired by a device or the Double rather than from your staff. */
export interface FireExtra {
  /** Fire from here instead of the caster's body (turrets, glyphs). */
  ox?: number; oy?: number;
  /** Power multiplier (the Double casts at half power). */
  scale?: number;
}

/** Fires a one-shot spell. `face` is the aim in turns, (tx, ty) the clamped target point, `charge` 0..1. */
export function fireSpell(w: World, src: number, spec: SpellSpec, face: number, tx: number, ty: number, charge: number, ex: FireExtra = {}): void {
  const b = w.bodies, x = ex.ox ?? b.x[src], y = ex.oy ?? b.y[src];
  const dx = cosTurns(face), dy = sinTurns(face);
  const n = spec.formN, p = payloadOf(spec), k = ex.scale ?? 1;
  // Fire's and Cold's one-shot casts: their table damage is a spray's per-second rate on the sqrt curve, so a
  // single blast needs its own multiplier, and it pays +70 % a rune like Arcane's nova rather than sqrt(n).
  // (Steam, Water + Fire, takes Fire's blast whichever of the two leads: its hits are scaled down in hit.ts instead)
  const blastBase = spec.form === EL.fire || spec.scald ? SHAPES.fireBlast : spec.form === EL.cold && !spec.freeze ? SHAPES.coldBlast : spec.form === EL.ice ? SHAPES.iceBlast : 0;
  const blast = blastBase ? (blastBase * (1 + COMBAT.formScaling * (n - 1))) / Math.sqrt(n) : 1;
  // close beats placed (spell audit, 2026-11-11): Earth's and Arcane's close casts (the Earthquake, the Arcane nova, their
  // imbued bursts) hit harder than the Geyser and the Arcane blast
  const close = !spec.heal && (spec.form === EL.earth || spec.form === EL.arcane) ? SHAPES.closePower : 1;
  switch (spec.shape) {
    case 'missile': {
      if (spec.heal) { spawnMissile(w, src, p, dx, dy, 3, (0.7 + 0.3 * charge) * k, tx, ty, ex.ox, ex.oy); break; }
      if (p.freeze) {
        // Earth + Water + Cold: three ice shards launched one after another, fanned a little, much faster than other
        // missiles for their shape (the user, 2026-11-11). Together they hit iceShardShare x 3 of the rock: the third
        // rune pays like any other. They don't split again where they hit.
        const sp = SHAPES.iceShardSpeed * (0.6 + 0.4 * charge);
        for (let q = 0; q < 3; q++) {
          const a = face + (q === 0 ? 0 : q === 1 ? -SHAPES.iceShardFan : SHAPES.iceShardFan), ddx = cosTurns(a), ddy = sinTurns(a);
          const m = spawnMissile(w, src, p, ddx, ddy, 1, (0.5 + 0.5 * charge) * k * SHAPES.iceShardShare, 0, 0, ex.ox, ex.oy);
          if (m < 0) break;
          w.missiles.wait[m] = ex.ox === undefined ? q * SHAPES.iceShardGap : 0; // a device's volley leaves together: a wait holds a shard at its caster
          w.missiles.vx[m] = ddx * sp; w.missiles.vy[m] = ddy * sp;
          w.missiles.r[m] = 0.16 + 0.04 * n;
          w.missiles.pierce[m] = charge >= 1 ? 1 : 0;
          w.missiles.mod[m] = 0;
        }
        break;
      }
      const m = spawnMissile(w, src, p, dx, dy, 1, (0.5 + 0.5 * charge) * k, 0, 0, ex.ox, ex.oy);
      if (m >= 0) {
        const sp = SHAPES.missileSpeed * (0.6 + 0.4 * charge);
        w.missiles.vx[m] = dx * sp; w.missiles.vy[m] = dy * sp;
        w.missiles.r[m] = 0.22 + 0.08 * n;
        w.missiles.pierce[m] = charge >= 1 ? 1 : 0;
      }
      break;
    }
    case 'shards': {
      const count = SHAPES.shardCount + spec.sizeN; // for a Life spell, more Cold lends more shards
      // every shard at the same power; extra shards pack the same fan denser rather than widening it (spell audit,
      // 2026-11-11: a second Ice used to miss more at range), so it's a shotgun: up close every shard lands
      const spread = (SHAPES.shardSpread * SHAPES.shardCount) / count;
      for (let j = 0; j < count; j++) {
        const a = face + (j - (count - 1) / 2) * spread;
        const m = spawnMissile(w, src, p, cosTurns(a), sinTurns(a), 2, (spec.heal ? SHAPES.healShardPower : SHAPES.shardPower) * k, 0, 0, ex.ox, ex.oy);
        // Ice's identity is quick flight: its shards fly faster than other missiles (Life's healing shards don't)
        if (m >= 0 && spec.form === EL.ice) { w.missiles.vx[m] *= SHAPES.iceFlight; w.missiles.vy[m] *= SHAPES.iceFlight; }
      }
      break;
    }
    case 'nova': case 'quake': {
      const r = (driving(w, src) ? BATTERY.ringRadius : spec.shape === 'quake' ? SHAPES.novaRadius + 1 : SHAPES.novaRadius) + SHAPES.novaPerRune * (n - 1);
      // Leaves the floor alone: a floor laid round you soaks or burns you, the caster (Place is for floors).
      // Area is the close, risky cast, so a spray element's ring is its strongest instant hit on its own axis (spell audit,
      // 2026-11-11): the Frost ring chills harder, the Splash ring pushes further. The Fire ring's burst is already that.
      // (chill goes by rune, so the Frost ring's chill leaves out the blast factor that turns Cold's per-second damage into one hit)
      const axis = spec.heal || spec.scald || spec.freeze ? 1 : spec.form === EL.cold ? SHAPES.ringChill / blast : spec.form === EL.water ? SHAPES.ringPush : 1;
      disc(w, p, src, x, y, r, k * blast * close * (spec.heal ? SHAPES.healRingPower : 1), spec.heal ? -1 : src, driving(w, src) ? y : undefined, axis); // the Healing ring heals you too; a defence's covers only the enemy's side
      burstEvent(w, src, x, y, r, spec.look);
      break;
    }
    case 'discharge':
      for (let i = 0; i < b.kind.length; i++) {
        if (alive(w, i) && i !== src && len(b.x[i] - x, b.y[i] - y) <= 4 + n) zap(w, src, i, p, SHAPES.dischargePower * k);
      }
      break;
    case 'patch': {
      // each extra rune of the lead: +0.4 u, and what lingers lasts SHAPES.lingerPerRune longer (steam, the floors it leaves)
      // Lingering (Survive) makes the whole patch wider and what it leaves last longer
      const r = (SHAPES.patchRadius + 0.4 * (n - 1)) * lingerSize(w, src), longer = (1 + SHAPES.lingerPerRune * (n - 1)) * lingerLife(w, src);
      // Cold without Water is a freezing fog, not ice (the user, 2026-11-11: "like opening a deep freezer"): it chills
      // whoever stands in it and leaves the floor alone. Water + Cold is still the ice sheet.
      const fog = !spec.scald && !spec.freeze && spec.counts[EL.cold - 1] > 0;
      // Ice is caltrops: a trap of spikes, with no hit when it lands (the user, 2026-11-11)
      if (spec.form === EL.ice) {
        spawnZone(w, ZONE.caltrops, src, p, tx, ty, r, T(SHAPES.caltropLife * longer), 0);
        burstEvent(w, src, tx, ty, r, spec.look);
        break;
      }
      if (spec.scald) spawnZone(w, ZONE.steam, src, p, tx, ty, r, T(SHAPES.patchLife * longer), 0);
      else if (fog) {
        spawnZone(w, ZONE.frost, src, p, tx, ty, r, T(SHAPES.patchLife * longer), 0);
        // the fog freezes standing water under it into ice; dry floor stays dry
        for (let gy = -r; gy <= r; gy += CELL) for (let gx = -r; gx <= r; gx += CELL) {
          const c = gx * gx + gy * gy <= r * r ? cellAt(w, tx + gx, ty + gy) : -1;
          if (c >= 0 && w.surf.kind[c] === SURF.water) touchFloor(w, c, EL.cold, longer);
        }
      }
      else for (const el of [EL.water, EL.cold, EL.fire]) if (spec.counts[el - 1]) floorDisc(w, tx, ty, r, el, longer, spec.counts[EL.fire - 1]); // a fire floor burns by its Fire
      // Rain: Water Place keeps falling for a while (the user: a rain that lasts 1 s felt far too short).
      if (spec.form === EL.water && !spec.scald && !spec.freeze) spawnZone(w, ZONE.rain, src, p, tx, ty, r, Math.round(T(SHAPES.rainLife + SHAPES.rainPerRune * (n - 1)) * lingerLife(w, src)), 0);
      disc(w, p, src, tx, ty, r, 0.5 * k, -1);
      burstEvent(w, src, tx, ty, r, spec.look);
      break;
    }
    case 'blast': spawnZone(w, ZONE.blast, src, p, tx, ty, 2 + 0.4 * n, T(SHAPES.delayedBlast), T(SHAPES.delayedBlast)); break;
    case 'geyser': spawnZone(w, ZONE.geyser, src, p, tx, ty, 0.9 + 0.4 * n, T(SHAPES.delayedBlast), T(SHAPES.delayedBlast)); break;
    case 'spring': spawnZone(w, ZONE.spring, src, p, tx, ty, (1.8 + 0.4 * n) * lingerSize(w, src), Math.round(T(6 + 2 * n) * lingerLife(w, src)), 0); break; // were 1.4 and 4: bigger, longer (2026-11-11)
    case 'strike':
      w.events.push({ tick: w.clock[0], kind: 'zap', who: src, x: tx, y: ty - 6, x2: tx, y2: ty, look: spec.look });
      disc(w, p, src, tx, ty, 0.9, SHAPES.strikePower * k, -1);
      surge(w, tx, ty, p, src);
      break;
    case 'swing': // an empty Weapon cast: the bare staff's shove (your hands' moves go through heldBlow)
      weaponBlow(w, src, face, { ...blowOf('staff'), scale: k, look: 0, p: null, move: 'strike', ox: ex.ox, oy: ex.oy });
      break;
    case 'imbue': {
      // The imbued burst: every queued element at full power in a short cone in front of you, as Magicka's imbue-and-release. Nothing stays in hand.
      const reach = imbueReach(spec);
      if (spec.form === EL.lightning) fork(w, src, spec, face, reach, k);
      else {
        setHitKind(HIT_KIND.burst);
        const line = imbueLine(spec);
        for (let i = 0; i < b.kind.length; i++) {
          if (!alive(w, i) || i === src) continue;
          if (line) {
            // along the line: how far out, and how far to the side
            const rx = b.x[i] - x, ry = b.y[i] - y, along = rx * dx + ry * dy, side = Math.abs(rx * dy - ry * dx);
            if (along < -b.r[i] || along > reach + b.r[i] || side > SHAPES.imbueLineHalf + b.r[i]) continue;
          } else if (!inCone(x, y, face, SHAPES.imbueHalf, reach, b.x[i], b.y[i], b.r[i])) continue;
          hit(w, i, p, hitOpts(p, src, k * blast * close * SHAPES.imbuePower, dx, dy));
        }
      }
      let mask = 0;
      for (let e = 1; e <= N_EL; e++) if (spec.counts[e - 1]) mask |= 1 << e;
      w.events.push({ tick: w.clock[0], kind: 'move', who: src, x, y, x2: x + dx * reach, y2: y + dy * reach, text: 'imbue', look: spec.look, amount: reach, els: mask });
      break;
    }
    case 'palm':
      for (let i = 0; i < b.kind.length; i++) {
        if (alive(w, i) && i !== src && inCone(x, y, face, 0.08, 3, b.x[i], b.y[i], b.r[i])) hit(w, i, p, hitOpts(p, src, SHAPES.palmPower * k, dx, dy));
      }
      burstEvent(w, src, x + dx * 1.5, y + dy * 1.5, 1.5, EL.life);
      break;
    case 'self': selfHit(w, src, spec); break;
    case 'blink': {
      // To the cursor (tx, ty, already clamped to blinkRange), or the nearest free spot short of it.
      const r = b.r[src];
      let nx = Math.max(-w.dims.w / 2 + r, Math.min(w.dims.w / 2 - r, tx));
      let ny = Math.max(-w.dims.h / 2 + r, Math.min(w.dims.h / 2 - r, ty));
      const bx = x - nx, by = y - ny, bl = len(bx, by);
      for (let k = 0; k < 200 && !freeSpot(w, src, nx, ny); k++) {
        if (bl < 1e-6) break;
        nx += (bx / bl) * 0.25; ny += (by / bl) * 0.25;
        if ((x - nx) * bx + (y - ny) * by < 0) { nx = x; ny = y; break; } // walked back past where we stood
      }
      w.events.push({ tick: w.clock[0], kind: 'blink', who: src, x, y, x2: nx, y2: ny });
      b.x[src] = nx; b.y[src] = ny;
      break;
    }
    case 'todo': w.events.push({ tick: w.clock[0], kind: 'todo', who: src, x, y, text: spec.title }); break;
    default: break;
  }
}

/** One blow of a weapon, or of the bare staff (p null). */
export interface Blow {
  /** Cone half-angle (turns; 0.5 or more is a full circle that pushes outward) and reach (u). */
  half: number; reach: number;
  /** Physical damage and knockback (u/s), before `scale`'s share of the damage. */
  dmg: number; knock: number;
  /** Power multiplier (a Heavy, a Sweep). */
  scale: number;
  /** The weapon's element (0 for the staff): the move's look and a death's element. */
  look: number;
  /** The weapon's elements, landing at ARMS.blowPayload x scale; null for the staff. */
  p: Payload | null;
  /** The move event the view draws ('strike', 'sweep'). */
  move: string;
  ox?: number; oy?: number;
}

/**
 * A weapon blow: everything in the cone takes a physical hit (damage and knockback) plus the
 * weapon's elements, so a weapon whose element deals no damage (the trident's Water) still lands.
 * The hands heal instead: their payload is a heal, with no physical hit. Emits the move event the
 * view draws as the weapon thrusting or spinning (no burst event: it would read as a nova).
 */
export function weaponBlow(w: World, src: number, face: number, o: Blow): void {
  const b = w.bodies, x = o.ox ?? b.x[src], y = o.oy ?? b.y[src], dx = cosTurns(face), dy = sinTurns(face), full = o.half >= 0.5, tick = w.clock[0];
  const heal = !!o.p?.heal, glass = 1 + PERKS.glassDmg * stackOf(w, src, PU.glass);
  setHitKind(HIT_KIND.melee);
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === src || !inCone(x, y, face, o.half, o.reach, b.x[i], b.y[i], b.r[i])) continue;
    // a full-circle sweep pushes outward from you, not along your facing
    const ox = b.x[i] - x, oy = b.y[i] - y, ol = len(ox, oy) || 1, ux = full ? ox / ol : dx, uy = full ? oy / ol : dy;
    let dealt = o.p ? hit(w, i, o.p, hitOpts(o.p, src, o.scale * ARMS.blowPayload, ux, uy), false) : 0;
    if (!heal && o.dmg > 0) {
      const d = o.dmg * o.scale * glass * taken(w, i, RES.physical) * (b.expose[i] ? STATUS.exposeMult : 1);
      b.hp[i] -= d;
      if (dealt <= 0) { b.lastEl[i] = o.look || EL.earth; b.lastMix[i] = 0; }
      b.lastHit[i] = tick; b.lastDX[i] = ux; b.lastDY[i] = uy; b.lastKind[i] = HIT_KIND.melee;
      dealt += d;
    }
    if (!heal) addKnock(w, i, ux, uy, o.knock);
    hitEvent(w, i, dealt, o.look, src);
  }
  w.events.push({ tick, kind: 'move', who: src, x, y, x2: x + dx * o.reach, y2: y + dy * o.reach, text: o.move, look: o.look, amount: o.reach });
}

/**
 * A blow with seat i's conjured weapon (the staff's if it holds none), with that weapon's numbers
 * (ARMS.blow*): a Strike with half undefined, a Sweep with half 0.5. `scale` multiplies the power,
 * `reach` the reach, `knock` the knockback. Spends nothing (hands.ts does).
 */
export function heldBlow(w: World, i: number, face: number, move: string, o: { half?: number; scale?: number; reach?: number; knock?: number } = {}): void {
  const s = w.seats, el = s.weapon[i] && s.weaponUses[i] > 0 ? s.weapon[i] : 0, n = blowOf(el ? elementName(el) : 'staff');
  const p = el ? payloadOf(compile(queueFromCounts(s.weaponEls, i), 'conjure')) : null;
  weaponBlow(w, i, face, {
    half: o.half ?? n.half, reach: n.reach * (o.reach ?? 1), dmg: n.dmg, knock: n.knock * (o.knock ?? 1),
    scale: o.scale ?? 1, look: el, p, move,
  });
}

/** A weapon's blow from ARMS.blow* (key: its lead element's name, or 'staff'): cone, reach, damage, knockback. */
function blowOf(key: string): { half: number; reach: number; dmg: number; knock: number } {
  const num = (t: Record<string, number>, d: number) => t[key] ?? d;
  const base = key === 'staff' ? SHAPES.swingRange : ((STRUCT.reach as Record<string, number>)[key] ?? 1.8);
  return { half: num(ARMS.blowHalf, SHAPES.swingHalfAngle), reach: base * num(ARMS.blowReach, 1), dmg: num(ARMS.blowDmg, 6), knock: num(ARMS.blowKnock, 3) };
}

/** Can body `self` stand at (x, y): not inside rock, not overlapping another body? */
function freeSpot(w: World, self: number, x: number, y: number): boolean {
  const b = w.bodies;
  if (isRockHit(w, wallAt(w, x, y, b.r[self]))) return false;
  for (let i = 0; i < b.kind.length; i++) {
    if (i === self || !alive(w, i)) continue;
    if (len(b.x[i] - x, b.y[i] - y) < b.r[i] + b.r[self]) return false;
  }
  return true;
}

const SELF_TMP = new Uint8Array(N_EL); // scratch, never kept

/** Self casts without Shield or Sigil: the elements hit you, as in Magicka (Heal, Douse, Attune...). */
export function selfHit(w: World, i: number, spec: SpellSpec): void {
  const b = w.bodies, c = spec.counts;
  const life = c[EL.life - 1], arcane = c[EL.arcane - 1];
  if (life) { const h = COMBAT.healPerLife * life * 1.5; b.hp[i] = Math.min(b.maxHp[i], b.hp[i] + h); hitEvent(w, i, -h, EL.life); }
  if (arcane) { // Attune: it stings, and your runes regenerate faster for a while
    if (i < w.seats.active.length) w.seats.attune[i] = T(RUNES.attuneTime);
    b.hp[i] -= 3 * arcane;
  }
  SELF_TMP.set(c); SELF_TMP[EL.life - 1] = 0; SELF_TMP[EL.arcane - 1] = 0;
  let any = false;
  for (let k = 0; k < N_EL; k++) if (SELF_TMP[k]) any = true;
  if (any) hitEvent(w, i, applyHit(w, i, SELF_TMP, 0, { scale: 0.6, heal: false, scald: spec.scald, freeze: spec.freeze, source: i, dirX: 0, dirY: 0, push: 0 }), spec.look);
}

// ---- lightning ---------------------------------------------------------------------------------

/** One arc from body `from` to body `to`, carrying the payload. Life arcs heal. */
export function zap(w: World, from: number, to: number, p: Payload, scale: number): void {
  const b = w.bodies;
  setHitKind(HIT_KIND.arc);
  w.events.push({ tick: w.clock[0], kind: 'zap', who: from, x: b.x[from], y: b.y[from], x2: b.x[to], y2: b.y[to], look: p.look });
  const dx = b.x[to] - b.x[from], dy = b.y[to] - b.y[from], d = len(dx, dy) || 1;
  hit(w, to, p, hitOpts(p, from, scale, dx / d, dy / d));
  surge(w, b.x[to], b.y[to], p, from);
}

/** Nearest body to (x, y) within r that isn't in `skip`; with `team`, only hurt bodies of that team. */
export function nearest(w: World, x: number, y: number, r: number, skip: readonly number[], team: number, sight = false): number {
  const b = w.bodies;
  let best = -1, bd = r;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || skip.includes(i)) continue;
    if (team && (b.team[i] !== team || b.hp[i] >= b.maxHp[i])) continue;
    const d = len(b.x[i] - x, b.y[i] - y) - b.r[i];
    if (d < bd && (!sight || clearLine(w, x, y, b.x[i], b.y[i]))) { bd = d; best = i; }
  }
  return best;
}

/** No rock or barrier on the straight line between two points. */
function clearLine(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const d = len(bx - ax, by - ay);
  return d < 1e-6 || clipRay(w, ax, ay, (bx - ax) / d, (by - ay) / d, d)[1] < 0;
}

/** A chain: the first target in front of the caster, then jumps (more with more lightning, further through wet). */
export function chain(w: World, src: number, spec: SpellSpec, face: number, scale: number): void {
  const b = w.bodies, x = b.x[src], y = b.y[src], p = payloadOf(spec);
  const team = spec.heal ? b.team[src] : 0; // Chain heal looks for hurt allies
  let first = -1, bd = SHAPES.arcRange;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === src || grounded(w, i)) continue; // Grounded (Spark ring): chain lightning skips you
    if (team && (b.team[i] !== team || b.hp[i] >= b.maxHp[i])) continue;
    if (!inCone(x, y, face, team ? 0.25 : 0.12, SHAPES.arcRange, b.x[i], b.y[i], b.r[i])) continue;
    const d = len(b.x[i] - x, b.y[i] - y);
    if (d < bd && clearLine(w, x, y, b.x[i], b.y[i])) { bd = d; first = i; }
  }
  if (first < 0) { // a short crackle into the air, or against the wall in the way
    const air = clipRay(w, x, y, cosTurns(face), sinTurns(face), 2.5)[0];
    w.events.push({ tick: w.clock[0], kind: 'zap', who: src, x, y, x2: x + cosTurns(face) * air, y2: y + sinTurns(face) * air, look: spec.look });
    return;
  }
  const jumps = SHAPES.arcJumps + Math.max(0, spec.counts[EL.lightning - 1] - 1) + (spec.mod === 'chain' ? 1 : 0);
  const visited = [src, first];
  for (let g = 0; g < MAX_SEATS; g++) if (grounded(w, g)) visited.push(g);
  zap(w, src, first, p, scale);
  let cur = first;
  for (let j = 0; j < jumps; j++) {
    const next = nearest(w, b.x[cur], b.y[cur], SHAPES.arcJump * (1 + 0.5 * soakOf(w, cur)), visited, team, true); // further through the soaked
    if (next < 0) break;
    zap(w, cur, next, p, scale * 0.8);
    visited.push(next);
    cur = next;
  }
}

/**
 * The Lightning-led burst: bolts from the staff to the nearest targets in the cone at once (one more per extra Lightning),
 * each jumping on to one more body near it. With nothing in reach, a few bolts fork into the air.
 */
function fork(w: World, src: number, spec: SpellSpec, face: number, reach: number, k: number): void {
  const b = w.bodies, x = b.x[src], y = b.y[src], p = payloadOf(spec);
  const n = SHAPES.forkTargets + Math.max(0, spec.counts[EL.lightning - 1] - 1);
  const hitList = [src];
  for (let g = 0; g < MAX_SEATS; g++) if (grounded(w, g)) hitList.push(g);
  const firsts: number[] = [];
  for (let m = 0; m < n; m++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || hitList.includes(i) || !inCone(x, y, face, SHAPES.imbueHalf, reach, b.x[i], b.y[i], b.r[i])) continue;
      const d = len(b.x[i] - x, b.y[i] - y);
      if (d < bd && clearLine(w, x, y, b.x[i], b.y[i])) { bd = d; best = i; }
    }
    if (best < 0) break;
    hitList.push(best); firsts.push(best);
  }
  for (const t of firsts) zap(w, src, t, p, k * SHAPES.forkPower);
  for (const t of firsts) {
    const next = nearest(w, b.x[t], b.y[t], SHAPES.arcJump * (1 + 0.5 * soakOf(w, t)), hitList, 0, true);
    if (next < 0) continue;
    zap(w, t, next, p, k * SHAPES.forkJump);
    hitList.push(next);
  }
  // bolts into the air where there was no one to take them
  for (let m = firsts.length; m < Math.min(n, 3); m++) {
    const a = face + (m - 1) * SHAPES.imbueHalf * 0.6, d = clipRay(w, x, y, cosTurns(a), sinTurns(a), reach * 0.7)[0];
    w.events.push({ tick: w.clock[0], kind: 'zap', who: src, x, y, x2: x + cosTurns(a) * d, y2: y + sinTurns(a) * d, look: spec.look });
  }
}

// ---- channels (beams, sprays, arcs) -------------------------------------------------------------

/**
 * One tick of a channelled spell from body `src`, aimed at `face`. With `follow`, the channel is a
 * Double's echo of seat `follow.seat`'s: it keeps that seat's timing, draws its end to dblEnd, and
 * deals `follow.scale` of the damage.
 */
/**
 * One tick of a channel (beam, spray, arc) from `src`, or, with `from`, from a turret's spot: the
 * hits are still `src`'s, but the channel runs from there, keeps its own clock and its own far end.
 */
export function channelTick(w: World, src: number, spec: SpellSpec, face: number, follow?: { seat: number; scale: number }, from?: { x: number; y: number; t: number; end: (ex: number, ey: number) => void }): void {
  const b = w.bodies, s = w.seats, x = from ? from.x : b.x[src], y = from ? from.y : b.y[src], p = payloadOf(spec);
  const dx = cosTurns(face), dy = sinTurns(face);
  const rate = COMBAT.channelRate * DT * (follow ? follow.scale : 1);
  const seat = follow ? follow.seat : src;
  const t = from ? from.t : s.chanTicks[seat];
  setHitKind(HIT_KIND.channel);
  const setEnd = (ex: number, ey: number) => { if (from) from.end(ex, ey); else if (follow) { s.dblEndX[seat] = ex; s.dblEndY[seat] = ey; } else { s.chanEndX[src] = ex; s.chanEndY[src] = ey; } };
  if (spec.shape === 'beam') {
    let reach = SHAPES.beamRange, target = -1;
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || i === src) continue;
      const d = rayCircle(x, y, dx, dy, b.x[i], b.y[i], b.r[i] + SHAPES.beamWidth / 2);
      if (d >= 0 && d < reach) { reach = d; target = i; }
    }
    // Rock and barriers stop the beam first if they're closer.
    const [wallD, wk] = clipRay(w, x, y, dx, dy, reach);
    if (wk >= 0) { reach = wallD; target = -1; damageWall(w, wk, payloadDamage(spec.counts, 0, rate), spec.counts[EL.fire - 1]); }
    setEnd(x + dx * reach, y + dy * reach);
    const lensed = rayThroughLens(w, x, y, dx, dy, reach) ? STRUCT.lensMult : 1;
    if (target >= 0) {
      const dealt = hit(w, target, p, hitOpts(p, src, rate * lensed * (spec.heal ? SHAPES.lifeBeamPower : 1), dx, dy, COMBAT.channelStatus * DT, true), false);
      if (t % 12 === 0) hitEvent(w, target, dealt * 12, spec.look, src);
      if (spec.mod === 'burst' && t % 30 === 0) disc(w, p, src, b.x[target], b.y[target], SHAPES.burstRadius, 0.3, src);
    }
    return;
  }
  if (spec.shape === 'spray') {
    const range = (driving(w, src) ? sprayReach(dx, dy) : SHAPES.sprayRange) + 0.5 * (spec.sizeN - 1), half = SHAPES.sprayHalfAngle * (1 + 0.25 * (spec.sizeN - 1));
    // Rock and barriers stop a spray like a beam: it ends at the wall and wears it down (healing doesn't).
    const [wallD, wk] = clipRay(w, x, y, dx, dy, range);
    if (wk >= 0 && !spec.heal) damageWall(w, wk, payloadDamage(spec.counts, 0, rate), spec.counts[EL.fire - 1]);
    setEnd(x + dx * wallD, y + dy * wallD);
    // Falloff (combat.sprayFalloff): the nearest body takes it all, each one behind takes a share less.
    const inside: number[] = [];
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || i === src) continue;
      if (inCone(x, y, face, half, range, b.x[i], b.y[i], b.r[i]) && clearLine(w, x, y, b.x[i], b.y[i])) inside.push(i);
    }
    if (COMBAT.sprayFalloff < 1) inside.sort((a, c) => len(b.x[a] - x, b.y[a] - y) - len(b.x[c] - x, b.y[c] - y) || a - c);
    inside.forEach((i, k) => {
      const share = k === 0 ? 1 : COMBAT.sprayFalloff;
      const dealt = hit(w, i, p, hitOpts(p, src, rate * share, dx, dy, COMBAT.channelStatus * DT, true), false);
      if (t % 12 === 0) hitEvent(w, i, dealt * 12, spec.look, src);
    });
    // Sprays leave the floor alone (the user: walking forward into your own spray's puddle or fire
    // was awkward). Floors come from Place patches.
    return;
  }
  if (spec.shape === 'arc') {
    if (follow) { if (s.chanTimer[seat] === T(SHAPES.arcInterval)) chain(w, src, spec, face, (spec.heal ? SHAPES.chainHealPower : SHAPES.arcPower) * follow.scale); return; } // the echo zaps when its owner does
    if (s.chanTimer[src] > 0) { s.chanTimer[src]--; return; }
    s.chanTimer[src] = T(SHAPES.arcInterval);
    chain(w, src, spec, face, spec.heal ? SHAPES.chainHealPower : SHAPES.arcPower); // the arc aims itself and chains, so each zap is weaker than an aimed beam's tick
  }
}

// ---- missiles and zones --------------------------------------------------------------------------

export function spawnMissile(w: World, src: number, p: Payload, dx: number, dy: number, type: number, scale: number, tx: number, ty: number, ox?: number, oy?: number): number {
  const m = w.missiles, b = w.bodies;
  for (let j = 0; j < MAX_MISSILES; j++) {
    if (m.alive[j]) continue;
    m.alive[j] = 1; m.type[j] = type; m.owner[j] = src; m.scale[j] = scale; m.pierce[j] = 0; m.lastHit[j] = -1; m.wait[j] = 0;
    m.x[j] = (ox ?? b.x[src]) + dx * (b.r[src] + 0.25); m.y[j] = (oy ?? b.y[src]) + dy * (b.r[src] + 0.25);
    m.vx[j] = dx * SHAPES.missileSpeed; m.vy[j] = dy * SHAPES.missileSpeed;
    m.r[j] = type === 2 ? 0.15 : SHAPES.missileRadius;
    m.life[j] = T(type === 2 ? (p.heal ? SHAPES.healShardRange : SHAPES.shardRange) / SHAPES.missileSpeed : SHAPES.missileLife);
    m.look[j] = p.look; m.flags[j] = flagsOf(p); m.mod[j] = modId(p.mod);
    m.els.set(p.counts.subarray(p.at * N_EL, p.at * N_EL + N_EL), j * N_EL);
    if (type === 3) { // a lobbed heal-stone: flies to its target point over everything
      const ddx = tx - m.x[j], ddy = ty - m.y[j], d = len(ddx, ddy);
      const flight = Math.max(T(0.35), Math.round((d / 9) * 60));
      m.vx[j] = (ddx / flight) * 60; m.vy[j] = (ddy / flight) * 60; m.life[j] = flight;
    }
    return j;
  }
  return -1;
}

export function tickMissiles(w: World): void {
  const m = w.missiles, b = w.bodies;
  for (let j = 0; j < MAX_MISSILES; j++) {
    if (!m.alive[j]) continue;
    if (m.wait[j] > 0) {
      // not launched yet: held at the staff, following its caster
      m.wait[j]--;
      const o = m.owner[j], sp = len(m.vx[j], m.vy[j]) || 1;
      m.x[j] = b.x[o] + (m.vx[j] / sp) * (b.r[o] + 0.25); m.y[j] = b.y[o] + (m.vy[j] / sp) * (b.r[o] + 0.25);
      continue;
    }
    if (m.type[j] === 2 && m.flags[j] & PF.heal) seekHurt(w, j);
    m.x[j] += m.vx[j] * DT; m.y[j] += m.vy[j] * DT;
    const out = Math.abs(m.x[j]) > w.dims.w / 2 || Math.abs(m.y[j]) > w.dims.h / 2;
    const p = stored(m.els, j, m.flags[j], m.mod[j], m.look[j]);
    if (m.type[j] === 3) { // heal-stone: lands, bursts
      // more Earth lent to the heal, a bigger splash
      const r = 2 + 0.6 * Math.max(0, m.els[j * N_EL + EL.earth - 1] - 1);
      if (--m.life[j] <= 0 || out) { m.alive[j] = 0; disc(w, p, m.owner[j], m.x[j], m.y[j], r, m.scale[j], -1); burstEvent(w, m.owner[j], m.x[j], m.y[j], r, m.look[j]); }
      continue;
    }
    let dead = out || --m.life[j] <= 0;
    // A lens amplifies whatever passes through it, once.
    if (!(m.flags[j] & PF.lensed) && lensAt(w, m.x[j], m.y[j]) >= 0) { m.flags[j] |= PF.lensed; m.scale[j] *= STRUCT.lensMult; m.r[j] *= STRUCT.lensGrow; }
    // Rock and barriers stop shots (a barrier of Shield alone turns them back).
    const wk = dead ? -1 : wallAt(w, m.x[j], m.y[j], m.r[j]);
    if (wk >= 0) {
      const mirror = wk !== TERRAIN_HIT && w.walls.type[wk] === WALL.barrier && m.owner[j] !== w.walls.owner[wk];
      if (w.tut && wk !== TERRAIN_HIT && w.walls.owner[wk] >= 0 && w.walls.owner[wk] < MAX_SEATS && b.kind[m.owner[j]] === KIND.enemy) noteBlocked(w.tut); // the tutorial's Shield beat
      damageWall(w, wk, payloadDamage(m.els, j, m.scale[j]) * (mirror ? 0.5 : 1), m.els[j * N_EL + EL.fire - 1]);
      if (mirror) { m.vx[j] = -m.vx[j]; m.vy[j] = -m.vy[j]; m.owner[j] = w.walls.owner[wk]; m.lastHit[j] = -1; continue; }
      dead = true;
    }
    if (!dead) {
      const sp = len(m.vx[j], m.vy[j]) || 1, ux = m.vx[j] / sp, uy = m.vy[j] / sp;
      for (let i = 0; i < b.kind.length && !dead; i++) {
        if (!alive(w, i) || i === m.owner[j] || i === m.lastHit[j]) continue;
        // Enemy bolts pass through other enemies.
        if (b.kind[m.owner[j]] === KIND.enemy && b.team[i] === b.team[m.owner[j]]) continue;
        if (len(b.x[i] - m.x[j], b.y[i] - m.y[j]) > b.r[i] + m.r[j]) continue;
        // A conjured guard held up blocks shots from the front; a parry sets off its own effect (guards.ts).
        if (i < MAX_SEATS) {
          const g = guardMissile(w, i, j, ux, uy);
          if (g === 2) break;
          if (g === 1) { dead = true; break; }
        }
        // A mirror ward (Shield alone on yourself) turns the next few shots back.
        if (i < MAX_SEATS && w.seats.ward[i] === WARD.mirror) {
          m.vx[j] = -m.vx[j]; m.vy[j] = -m.vy[j]; m.owner[j] = i; m.lastHit[j] = i;
          if (--w.seats.wardHp[i] <= 0) w.seats.ward[i] = WARD.none;
          break;
        }
        setHitKind(HIT_KIND.missile);
        hit(w, i, p, hitOpts(p, m.owner[j], m.scale[j], ux, uy, 1, true));
        m.lastHit[j] = i;
        // The spear's javelin pins what it hits and frosts the ground there.
        if (m.flags[j] & PF.pin) { b.root[i] = Math.max(b.root[i], T(ARMS.pin)); floorDisc(w, m.x[j], m.y[j], ARMS.frostRadius, EL.cold); }
        if (p.mod === 'burst') disc(w, p, m.owner[j], m.x[j], m.y[j], SHAPES.burstRadius, 0.4 * m.scale[j], i);
        if (p.mod === 'chain') { const n2 = nearest(w, b.x[i], b.y[i], SHAPES.arcJump, [i, m.owner[j]], 0); if (n2 >= 0) zap(w, i, n2, p, 0.4 * m.scale[j]); }
        if (!m.pierce[j]) dead = true;
      }
    }
    if (dead) {
      m.alive[j] = 0;
      // Cold's shape change: a puff of frost wherever it ends, chilling what's near (ice shards need Water: fireSpell)
      if (p.mod === 'shatter' && m.type[j] !== 2) frostPuff(w, j);
      w.events.push({ tick: w.clock[0], kind: 'fizzle', who: m.owner[j], x: m.x[j], y: m.y[j], look: m.look[j] });
    }
  }
}

const SEEK_COS = cosTurns(SHAPES.healSeekCone), TURN_COS = cosTurns(SHAPES.healTurn / 60), TURN_SIN = sinTurns(SHAPES.healTurn / 60);

/** A healing shard turns toward the hurt ally (not its caster) nearest its heading, a limited angle a tick. */
function seekHurt(w: World, j: number): void {
  const m = w.missiles, b = w.bodies, o = m.owner[j];
  const sp = len(m.vx[j], m.vy[j]) || 1, ux = m.vx[j] / sp, uy = m.vy[j] / sp;
  let best = -1, bc = SEEK_COS, bx = 0, by = 0;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === o || b.team[i] !== b.team[o] || b.hp[i] >= b.maxHp[i]) continue;
    const dx = b.x[i] - m.x[j], dy = b.y[i] - m.y[j], d = len(dx, dy);
    if (d > SHAPES.healSeekRange || d < 1e-6) continue;
    const c = (dx * ux + dy * uy) / d;
    if (c > bc) { bc = c; best = i; bx = dx / d; by = dy / d; }
  }
  if (best < 0) return;
  let nx = bx, ny = by;
  if (bc < TURN_COS) { // too far round to reach this tick: turn the most it can, toward the ally
    const s = ux * by - uy * bx >= 0 ? TURN_SIN : -TURN_SIN;
    nx = ux * TURN_COS - uy * s; ny = ux * s + uy * TURN_COS;
  }
  m.vx[j] = nx * sp; m.vy[j] = ny * sp;
}

/** A missile's frost puff: its Cold alone, over a small disc, at a third of its strength (more Cold, a wider puff). */
function frostPuff(w: World, j: number): void {
  const m = w.missiles, cold = m.els[j * N_EL + EL.cold - 1];
  if (!cold) return;
  const counts = new Uint8Array(N_EL);
  counts[EL.cold - 1] = cold;
  const p: Payload = { counts, at: 0, heal: false, scald: false, freeze: false, mod: null, look: EL.cold, formN: 1 };
  // it carries on the way the missile was going (the user: a cloud sitting on the impact broke its momentum)
  const sp = len(m.vx[j], m.vy[j]) || 1, R = SHAPES.frostPuff + 0.3 * (cold - 1), ahead = R * 0.5;
  disc(w, p, m.owner[j], m.x[j] + (m.vx[j] / sp) * ahead, m.y[j] + (m.vy[j] / sp) * ahead, R, m.scale[j] / 3, -1);
}

export function spawnZone(w: World, type: number, src: number, p: Payload, x: number, y: number, r: number, life: number, timer: number): void {
  const z = w.zones;
  for (let k = 0; k < MAX_ZONES; k++) {
    if (z.type[k]) continue;
    z.type[k] = type; z.owner[k] = src; z.x[k] = x; z.y[k] = y; z.r[k] = r; z.life[k] = life; z.timer[k] = timer; z.scale[k] = 1;
    z.flags[k] = flagsOf(p); z.mod[k] = modId(p.mod); z.look[k] = p.look;
    z.els.set(p.counts.subarray(p.at * N_EL, p.at * N_EL + N_EL), k * N_EL);
    return;
  }
}

/** What rain carries after it lands: one Water, nothing else. Never written. */

export function tickZones(w: World): void {
  const z = w.zones, b = w.bodies;
  for (let k = 0; k < MAX_ZONES; k++) {
    if (!z.type[k]) continue;
    const p = stored(z.els, k, z.flags[k], z.mod[k], z.look[k]);
    if (z.type[k] === ZONE.blast || z.type[k] === ZONE.geyser) {
      if (--z.timer[k] <= 0) {
        disc(w, p, z.owner[k], z.x[k], z.y[k], z.r[k], z.type[k] === ZONE.geyser ? SHAPES.geyserPower : 1, -1);
        burstEvent(w, z.owner[k], z.x[k], z.y[k], z.r[k], p.look);
        z.type[k] = ZONE.none;
      }
      continue;
    }
    if (z.type[k] === ZONE.rain) {
      // Rain soaks through and douses whoever is under it every tick, without damage (the spell's other elements and
      // Water's own hit land once, when it falls), finishes a freeze on the chilled, and keeps the puddle topped up.
      for (let i = 0; i < b.kind.length; i++) {
        if (!alive(w, i) || len(b.x[i] - z.x[k], b.y[i] - z.y[k]) > z.r[k] + b.r[i]) continue;
        b.burn[i] = 0; drench(w, i); tryFreeze(w, i);
      }
      if (z.life[k] % 30 === 0) floorDisc(w, z.x[k], z.y[k], z.r[k], EL.water);
      if (--z.life[k] <= 0) z.type[k] = ZONE.none;
      continue;
    }
    // Caltrops stab whoever walks through them, by how far they walked (every 0.1 s, from their walking speed).
    if (z.type[k] === ZONE.caltrops) {
      if (z.life[k] % 6 === 0) for (let i = 0; i < b.kind.length; i++) {
        if (!alive(w, i) || len(b.x[i] - z.x[k], b.y[i] - z.y[k]) > z.r[k] + b.r[i]) continue;
        const walked = len(b.vx[i], b.vy[i]) * 0.1;
        if (walked > 0.02) hit(w, i, p, hitOpts(p, z.owner[k], SHAPES.caltropPerU * walked));
      }
      if (--z.life[k] <= 0) z.type[k] = ZONE.none;
      continue;
    }
    // Lingering zones (springs, steam, frost fog) work every half second.
    if (z.life[k] % 30 === 0) {
      for (let i = 0; i < b.kind.length; i++) {
        if (!alive(w, i) || len(b.x[i] - z.x[k], b.y[i] - z.y[k]) > z.r[k] + b.r[i]) continue;
        hit(w, i, p, hitOpts(p, z.owner[k], z.type[k] === ZONE.spring ? 0.35 : 0.25));
      }
    }
    if (--z.life[k] <= 0) z.type[k] = ZONE.none;
  }
}

// ---- bodies ------------------------------------------------------------------------------------

/** Ice under foot: it chills you (tickSurfaces); the Rime kite skates on it. */
export const onIce = (w: World, i: number): boolean => surfAt(w, w.bodies.x[i], w.bodies.y[i]) === SURF.ice;

/** Bodies nothing moves: the Sanctum's dummies, and rooted archetypes (the tutorial's brambles). */
export const fixedBody = (w: World, i: number): boolean => driving(w, i) || w.bodies.kind[i] === KIND.dummy || (w.bodies.kind[i] === KIND.enemy && !!ARCHETYPES[w.bodies.arch[i]].rooted);

/** Bodies push apart, and everyone stays in the arena. Dummies are rooted. */
export function collide(w: World): void {
  const b = w.bodies;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i)) continue;
    for (let j = i + 1; j < b.kind.length; j++) {
      if (!alive(w, j) || phased(w, i) || phased(w, j)) continue; // the Prism's Phase drifts through bodies
      const dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], d = len(dx, dy), min = b.r[i] + b.r[j];
      if (d >= min || d < 1e-9) continue;
      const wi = fixedBody(w, i) ? 0 : 1, wj = fixedBody(w, j) ? 0 : 1;
      const tot = wi + wj || 1, push = min - d, ux = dx / d, uy = dy / d;
      b.x[i] -= (ux * push * wi) / tot; b.y[i] -= (uy * push * wi) / tot;
      b.x[j] += (ux * push * wj) / tot; b.y[j] += (uy * push * wj) / tot;
    }
  }
  collideWalls(w);
  for (let i = 0; i < b.kind.length; i++) {
    b.x[i] = Math.max(-w.dims.w / 2 + b.r[i], Math.min(w.dims.w / 2 - b.r[i], b.x[i]));
    b.y[i] = Math.max(-w.dims.h / 2 + b.r[i], Math.min(w.dims.h / 2 - b.r[i], b.y[i]));
  }
}

/** Doubles that are destroyed vanish. */
export function tickDoubles(w: World): void {
  const b = w.bodies;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.double || b.hp[i] > 0) continue;
    b.kind[i] = KIND.none;
    w.events.push({ tick: w.clock[0], kind: 'blink', who: i, x: b.x[i], y: b.y[i], x2: b.x[i], y2: b.y[i] });
  }
}

/** Dummies heal back to full after a quiet spell; downed wizards get straight back up (placeholder for revival). */
export function tickHealth(w: World): void {
  const b = w.bodies;
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] === KIND.dummy) {
      // (the tutorial's wounded dummy stays wounded until someone heals it)
      if (b.hp[i] < b.maxHp[i] && w.clock[0] - b.lastHit[i] > T(BODY.dummyResetAfter) && !w.tut?.tag[i]) b.hp[i] = b.maxHp[i];
      if (b.hp[i] < 1) b.hp[i] = 1;
    } else if (b.kind[i] === KIND.wizard && b.hp[i] <= 0 && w.enc.state[0] && !b.downed[i]) {
      // In the Arena a downed wizard is out until the wave ends.
      b.downed[i] = 1; b.hp[i] = 0; b.burn[i] = 0;
      if (b.heldBy[i] >= 0) b.heldBy[i] = -1;
      w.events.push({ tick: w.clock[0], kind: 'fizzle', who: i, x: b.x[i], y: b.y[i], text: 'downed' });
    } else if (b.kind[i] === KIND.wizard && b.hp[i] <= 0 && !w.enc.state[0]) {
      b.hp[i] = b.maxHp[i];
      b.burn[i] = b.frozen[i] = b.stun[i] = 0; b.chill[i] = 0;
      w.events.push({ tick: w.clock[0], kind: 'fizzle', who: i, x: b.x[i], y: b.y[i], text: 'downed' });
    }
  }
}
