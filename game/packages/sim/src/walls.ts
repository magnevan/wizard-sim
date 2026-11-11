/**
 * Wall geometry and the low-level structure rules that other systems ask about: does a ray or
 * a missile hit a wall, where do bodies get pushed out of rock, does a shot pass a lens, how is
 * the Shield pool drained. Kept free of effects.ts so both effects and structures can use it.
 *
 * Walls (Shield): rock (Earth) is stuff, paid once, with hit points; barriers (Shield alone)
 * and curtains (Shield + other elements) are energy and drain their owner's Shield pool
 * (Model A). Rock stops everyone's bodies, shots and beams. A barrier is a force field (spell audit,
 * 2026-11-11): it stops the other team's bodies, shots and beams, and lets its own team's through.
 * Curtains let everything through and pulse their elements on whoever is in them.
 */
import { WALL, solidWall } from './compile';
import { DAMAGE, STRUCT } from './config';
import { EL, N_EL, elementName } from './elements';
import { len } from './geom';
import { terrainAlong, terrainNear } from './terrain';
import { DEVICE, KIND, MAX_DEVICES, MAX_SEATS, MAX_WALLS, TERRAIN, WARD, freeDevice, type Bodies, type World } from './world';

/** What clipRay and wallAt return for the room's terrain: never a slot in w.walls. (Which segment it was never matters.) */
export const TERRAIN_HIT = MAX_WALLS;
/** Is what clipRay or wallAt returned rock: the room's, or a cast stone wall? (Not -1, a barrier, or a curtain.) */
export const isRockHit = (w: World, k: number): boolean => k === TERRAIN_HIT || solidWall(w.walls.type[k]); // an ice wall counts: it is solid too

/** Closest point on segment (x1,y1)-(x2,y2) to (px,py): returns [distance, t in 0..1]. */
export function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const t = segT(px, py, x1, y1, x2, y2);
  return [len(px - (x1 + (x2 - x1) * t), py - (y1 + (y2 - y1) * t)), t];
}
/** Where on the segment (x1,y1)-(x2,y2) the closest point to (px,py) is: t in 0..1. */
export function segT(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 1e-12 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  return Math.max(0, Math.min(1, t));
}
/** segDist's distance alone, without the array (the same arithmetic, so the same bits): for hot loops. */
export function segLen(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const t = segT(px, py, x1, y1, x2, y2);
  return len(px - (x1 + (x2 - x1) * t), py - (y1 + (y2 - y1) * t));
}
/**
 * Is (px, py) surely farther than `r` from the segment? A box test: points outside the segment's box grown
 * by r (plus a hair for rounding) can't be within r, so callers skip the exact distance for them.
 */
const far = (x1: number, y1: number, x2: number, y2: number, px: number, py: number, r: number): boolean => {
  const m = r + 1e-6;
  return px < Math.min(x1, x2) - m || px > Math.max(x1, x2) + m || py < Math.min(y1, y2) - m || py > Math.max(y1, y2) + m;
};

/** Distance along a ray (unit d) to a segment, or -1 if it misses (thick by `pad`). */
function raySeg(ox: number, oy: number, dx: number, dy: number, x1: number, y1: number, x2: number, y2: number, pad: number): number {
  const ex = x2 - x1, ey = y2 - y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den; // along the ray
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den; // along the segment
  const el = len(ex, ey) || 1;
  if (t < 0 || u < -pad / el || u > 1 + pad / el) return -1;
  return Math.max(0, t - pad);
}

/**
 * Is wall k a force field: a barrier (Shield alone) or a coated one (Shield + elements, the curtain type), raised by a
 * wizard? It stops the other side's bodies, shots and beams and lets its own team through. A curtain that belongs to
 * the place (the battery's gate fire) is not one: it stops nothing and burns whoever crosses.
 */
export const isField = (w: World, k: number): boolean => k < MAX_WALLS && (w.walls.type[k] === WALL.barrier || w.walls.type[k] === WALL.curtain) && w.walls.owner[k] >= 0;
const blocksShots = (w: World, k: number) => solidWall(w.walls.type[k]) || isField(w, k);
/** Does wall k stop something of `team` (-1: anyone's)? A force field lets its own team through. */
const stops = (w: World, k: number, team: number): boolean => blocksShots(w, k) && !(team >= 0 && isField(w, k) && w.bodies.team[w.walls.owner[k]] === team);

/** Resistance points a coated force field has against element id: STRUCT.wardPerRune a rune of it, as a ward (Cold and Ice one family). */
function fieldPoints(w: World, k: number, id: number): number {
  if (w.walls.type[k] !== WALL.curtain) return 0;
  const e = w.walls.els, at = k * N_EL;
  const n = id === EL.cold || id === EL.ice ? Math.max(e[at + EL.cold - 1], e[at + EL.ice - 1]) : e[at + id - 1];
  return n * STRUCT.wardPerRune;
}

/** What a shot or beam does to wall k: payloadDamage, less what a coated force field resists of each element. */
export function wallDamage(w: World, k: number, els: Uint8Array, at: number, scale: number): number {
  if (k < 0 || k >= MAX_WALLS || w.walls.type[k] !== WALL.curtain) return payloadDamage(els, at, scale);
  let d = 0;
  for (let id = 1; id <= N_EL; id++) d += (DAMAGE[elementName(id)] * els[at * N_EL + id - 1]) / (1 + fieldPoints(w, k, id));
  return Math.max(4, d) * scale;
}

/** Your team's coated force field a shot at (x, y), radius r, is passing through, or -1 (it lends the shot its coat). */
export function fieldAt(w: World, x: number, y: number, r: number, team: number): number {
  const wl = w.walls;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k] !== WALL.curtain || !isField(w, k) || w.bodies.team[wl.owner[k]] !== team) continue;
    if (segLen(x, y, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]) <= r + STRUCT.wallThickness) return k;
  }
  return -1;
}

/** The nearest of your team's coated force fields a ray crosses within `reach`: [distance, slot] or [reach, -1]. */
export function fieldAlong(w: World, ox: number, oy: number, dx: number, dy: number, reach: number, team: number): [number, number] {
  const wl = w.walls;
  let best = reach, hit = -1;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k] !== WALL.curtain || !isField(w, k) || w.bodies.team[wl.owner[k]] !== team) continue;
    const t = raySeg(ox, oy, dx, dy, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k], STRUCT.wallThickness);
    if (t >= 0 && t < best) { best = t; hit = k; }
  }
  return [best, hit];
}

/** Damage a shot or beam does to a wall: the plain element damage of its payload. */
export function payloadDamage(els: Uint8Array, at: number, scale: number): number {
  let d = 0;
  for (let id = 1; id <= N_EL; id++) d += DAMAGE[elementName(id)] * els[at * N_EL + id - 1];
  return Math.max(4, d) * scale;
}

/** Damages wall k. `fire`: Fire runes in what hit it; Fire melts an ice wall (STRUCT.iceMelt). */
export function damageWall(w: World, k: number, dmg: number, fire = 0): void {
  const wl = w.walls;
  if (k === TERRAIN_HIT || wl.owner[k] === TERRAIN) return; // the room's own rock doesn't break
  wl.hp[k] -= wl.type[k] === WALL.ice && fire > 0 ? dmg * STRUCT.iceMelt : dmg;
  if (!solidWall(wl.type[k])) drainShield(w, wl.owner[k], STRUCT.absorbPerHp * dmg);
  if (wl.hp[k] <= 0) {
    w.events.push({ tick: w.clock[0], kind: 'burst', who: wl.owner[k], x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, amount: 0.8, look: wl.type[k] === WALL.rock ? EL.earth : wl.type[k] === WALL.ice ? EL.ice : EL.shield });
    wl.type[k] = WALL.none;
  }
}

/** The first wall a ray hits within `reach`: [distance, wall slot or TERRAIN_HIT] or [reach, -1]. */
export function clipRay(w: World, ox: number, oy: number, dx: number, dy: number, reach: number, team = -1): [number, number] {
  const wl = w.walls, tr = w.terrain, pad = STRUCT.wallThickness;
  let best = reach, hit = -1;
  // Terrain first, as the room's segments always came first. A hit is within reach + pad along the ray, and within pad of it.
  const n = terrainAlong(tr, ox, oy, ox + dx * (reach + pad), oy + dy * (reach + pad), pad);
  for (let q = 0; q < n; q++) {
    const k = tr.out[q], t = raySeg(ox, oy, dx, dy, tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k], pad);
    if (t >= 0 && t < best) { best = t; hit = TERRAIN_HIT; }
  }
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!stops(w, k, team)) continue;
    const t = raySeg(ox, oy, dx, dy, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k], STRUCT.wallThickness);
    if (t >= 0 && t < best) { best = t; hit = k; }
  }
  return [best, hit];
}

/** The rock or barrier a missile at (x, y) with radius r touches (a wall slot or TERRAIN_HIT), or -1. Rock stops everyone's shots; a barrier only the other team's (`team`: the shooter's, -1 for anyone). */
export function wallAt(w: World, x: number, y: number, r: number, team = -1): number {
  const wl = w.walls, tr = w.terrain, reach = r + STRUCT.wallThickness;
  for (let q = 0, n = terrainNear(tr, x, y, reach); q < n; q++) {
    const k = tr.out[q];
    if (segLen(x, y, tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k]) <= reach) return TERRAIN_HIT;
  }
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!stops(w, k, team)) continue;
    if (segLen(x, y, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]) <= r + STRUCT.wallThickness) return k;
  }
  return -1;
}

/** Scratch for collideWalls: this step's rock walls, in slot order. */
const rocks = new Int32Array(MAX_WALLS);

/** Pushes body i out of the segment if it is within `min` of it. True if it moved. */
function pushOut(b: Bodies, i: number, min: number, x1: number, y1: number, x2: number, y2: number): boolean {
  if (far(x1, y1, x2, y2, b.x[i], b.y[i], min)) return false;
  const t = segT(b.x[i], b.y[i], x1, y1, x2, y2);
  const d = len(b.x[i] - (x1 + (x2 - x1) * t), b.y[i] - (y1 + (y2 - y1) * t));
  if (d >= min) return false;
  const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
  let nx = b.x[i] - cx, ny = b.y[i] - cy;
  const nl = len(nx, ny);
  if (nl < 1e-9) { nx = -(y2 - y1); ny = x2 - x1; } // dead centre: push to one side
  const l = len(nx, ny) || 1;
  b.x[i] += (nx / l) * (min - d); b.y[i] += (ny / l) * (min - d);
  return true;
}

/**
 * Rock walls push bodies out. Body by body, each through the rock walls in order (the room's own first,
 * then the cast ones by slot): each push moves the body, so the order matters and is kept. When a body
 * moves, what's nearby is asked again and the walk carries on after the wall that moved it.
 */
export function collideWalls(w: World): void {
  const b = w.bodies, wl = w.walls, tr = w.terrain;
  let nr = 0;
  for (let k = 0; k < MAX_WALLS; k++) if (solidWall(wl.type[k]) || isField(w, k)) rocks[nr++] = k; // ice walls stop bodies too, and force fields the other team's
  if (!nr && !tr.n) return;
  const out = tr.out;
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] === KIND.none || b.kind[i] === KIND.dummy) continue;
    const min = b.r[i] + STRUCT.wallThickness;
    let n = terrainNear(tr, b.x[i], b.y[i], min);
    for (let q = 0; q < n; q++) {
      const k = out[q];
      if (!pushOut(b, i, min, tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k])) continue;
      n = terrainNear(tr, b.x[i], b.y[i], min);
      q = -1;
      while (q + 1 < n && out[q + 1] <= k) q++;
    }
    for (let q = 0; q < nr; q++) {
      const k = rocks[q];
      if (!solidWall(wl.type[k]) && b.team[i] === b.team[wl.owner[k]]) continue; // your team walks through your force field
      pushOut(b, i, min, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]);
    }
  }
}

/** The lens a point is inside, or -1. */
export function lensAt(w: World, x: number, y: number): number {
  const dv = w.devices;
  for (let k = 0; k < MAX_DEVICES; k++) if (dv.type[k] === DEVICE.lens && len(x - dv.x[k], y - dv.y[k]) <= STRUCT.lensRadius) return k;
  return -1;
}

/** Does the segment from (ox, oy) along d for `reach` pass through a lens? */
export function rayThroughLens(w: World, ox: number, oy: number, dx: number, dy: number, reach: number): boolean {
  const dv = w.devices;
  for (let k = 0; k < MAX_DEVICES; k++) {
    if (dv.type[k] !== DEVICE.lens) continue;
    const fx = dv.x[k] - ox, fy = dv.y[k] - oy, t = fx * dx + fy * dy;
    if (t < 0 || t > reach) continue;
    if (len(fx - dx * t, fy - dy * t) <= STRUCT.lensRadius) return true;
  }
  return false;
}

/** Takes runes from a seat's Shield pool (Model A), never below zero. */
export function drainShield(w: World, owner: number, amount: number): void {
  if (owner < 0 || owner >= MAX_SEATS) return;
  const k = owner * N_EL + EL.shield - 1;
  w.seats.runes[k] = Math.max(0, w.seats.runes[k] - amount);
}

/** How many Sigil runes a seat has bound in devices, auras, motes and conjured weapons. */
export function boundSigil(w: World, seat: number): number {
  const dv = w.devices, s = w.seats;
  let n = 0;
  let orbit = 0;
  for (let k = 0; k < MAX_DEVICES; k++) if (dv.type[k] && dv.owner[k] === seat && !freeDevice(w, k)) { if (dv.type[k] === DEVICE.orbital) orbit = 1; else n++; } // Clockwork's turrets are free
  n += orbit; // your whole ring of orbitals is one device: it binds one rune
  if (s.aura[seat] > 0) n++;
  if (s.motes[seat] > 0) n++;
  if (s.storeArm[seat] || s.storeLen[seat]) n++; // the stored spell, armed or held
  if (s.weapon[seat] || s.wand[seat]) n++;
  if (s.double[seat] >= 0 && w.bodies.kind[s.double[seat]] === KIND.double) n++;
  return n;
}

/** Energy structures a seat keeps up (a ward counts double). */
export function energyLoad(w: World, seat: number): number {
  const wl = w.walls;
  let n = 0;
  for (let k = 0; k < MAX_WALLS; k++) if ((wl.type[k] === WALL.barrier || wl.type[k] === WALL.curtain) && wl.owner[k] === seat) n++;
  const s = w.seats;
  for (let j = 0; j < s.ward.length; j++) if (s.ward[j] && s.ward[j] !== WARD.stone && s.wardBy[j] === seat) n += STRUCT.wardDrainMult;
  return n;
}
