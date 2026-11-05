/**
 * Wall geometry and the low-level structure rules that other systems ask about: does a ray or
 * a missile hit a wall, where do bodies get pushed out of rock, does a shot pass a lens, how is
 * the Shield pool drained. Kept free of effects.ts so both effects and structures can use it.
 *
 * Walls (Shield): rock (Earth) is stuff, paid once, with hit points; barriers (Shield alone)
 * and curtains (Shield + other elements) are energy and drain their owner's Shield pool
 * (Model A). Rock and barriers stop shots and beams; only rock stops bodies; curtains let
 * everything through and pulse their elements on whoever is in them.
 */
import { WALL } from './compile';
import { DAMAGE, STRUCT } from './config';
import { EL, N_EL, elementName } from './elements';
import { len } from './geom';
import { DEVICE, KIND, MAX_DEVICES, MAX_SEATS, MAX_WALLS, TERRAIN, WARD, type World } from './world';

/** Closest point on segment (x1,y1)-(x2,y2) to (px,py): returns [distance, t in 0..1]. */
export function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 > 1e-12 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [len(px - (x1 + dx * t), py - (y1 + dy * t)), t];
}

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

const blocksShots = (type: number) => type === WALL.rock || type === WALL.barrier;

/** Damage a shot or beam does to a wall: the plain element damage of its payload. */
export function payloadDamage(els: Uint8Array, at: number, scale: number): number {
  let d = 0;
  for (let id = 1; id <= N_EL; id++) d += DAMAGE[elementName(id)] * els[at * N_EL + id - 1];
  return Math.max(4, d) * scale;
}

export function damageWall(w: World, k: number, dmg: number): void {
  const wl = w.walls;
  if (wl.owner[k] === TERRAIN) return; // the arena's own rock doesn't break
  wl.hp[k] -= dmg;
  if (wl.type[k] !== WALL.rock) drainShield(w, wl.owner[k], STRUCT.absorbPerHp * dmg);
  if (wl.hp[k] <= 0) {
    w.events.push({ tick: w.clock[0], kind: 'burst', who: wl.owner[k], x: (wl.x1[k] + wl.x2[k]) / 2, y: (wl.y1[k] + wl.y2[k]) / 2, amount: 0.8, look: wl.type[k] === WALL.rock ? EL.earth : EL.shield });
    wl.type[k] = WALL.none;
  }
}

/** The first wall a ray hits within `reach`: [distance, wall index] or [reach, -1]. */
export function clipRay(w: World, ox: number, oy: number, dx: number, dy: number, reach: number): [number, number] {
  const wl = w.walls;
  let best = reach, hit = -1;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!blocksShots(wl.type[k])) continue;
    const t = raySeg(ox, oy, dx, dy, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k], STRUCT.wallThickness);
    if (t >= 0 && t < best) { best = t; hit = k; }
  }
  return [best, hit];
}

/** The rock or barrier a missile at (x, y) with radius r touches, or -1. Your own walls stop your shots too. */
export function wallAt(w: World, x: number, y: number, r: number): number {
  const wl = w.walls;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (!blocksShots(wl.type[k])) continue;
    if (segDist(x, y, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0] <= r + STRUCT.wallThickness) return k;
  }
  return -1;
}

/** Rock walls push bodies out. */
export function collideWalls(w: World): void {
  const b = w.bodies, wl = w.walls;
  for (let k = 0; k < MAX_WALLS; k++) {
    if (wl.type[k] !== WALL.rock) continue;
    for (let i = 0; i < b.kind.length; i++) {
      if (b.kind[i] === KIND.none || b.kind[i] === KIND.dummy) continue;
      const [d, t] = segDist(b.x[i], b.y[i], wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]);
      const min = b.r[i] + STRUCT.wallThickness;
      if (d >= min) continue;
      const cx = wl.x1[k] + (wl.x2[k] - wl.x1[k]) * t, cy = wl.y1[k] + (wl.y2[k] - wl.y1[k]) * t;
      let nx = b.x[i] - cx, ny = b.y[i] - cy;
      const nl = len(nx, ny);
      if (nl < 1e-9) { nx = -(wl.y2[k] - wl.y1[k]); ny = wl.x2[k] - wl.x1[k]; } // dead centre: push to one side
      const l = len(nx, ny) || 1;
      b.x[i] += (nx / l) * (min - d); b.y[i] += (ny / l) * (min - d);
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
  for (let k = 0; k < MAX_DEVICES; k++) if (dv.type[k] && dv.owner[k] === seat) n++;
  if (s.aura[seat] > 0) n++;
  if (s.motes[seat] > 0) n++;
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
