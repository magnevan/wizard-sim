/**
 * Spell shapes in the world: what each Shape does when it fires, and the per-tick updates of
 * channels, missiles, zones and surfaces. The cast state machine (cast.ts) decides when.
 *
 * A Payload is what a hit carries: element counts plus a few flags. Missiles and zones store it
 * in their typed arrays (els, flags, mod, look) and rebuild the view object when they hit.
 */
import type { Mod, SpellSpec } from './compile';
import { ARENA, BODY, CELL, COMBAT, RUNES, SHAPES, STATUS, STRUCT, SURFACE, T } from './config';
import { EL, N_EL } from './elements';
import { inCone, len, rayCircle } from './geom';
import { HIT_KIND, addKnock, applyHit, setHitKind, type HitOpts } from './hit';
import { cosTurns, sinTurns } from './trig';
import { clipRay, collideWalls, damageWall, lensAt, payloadDamage, rayThroughLens, wallAt } from './walls';
import { WALL } from './compile';
import { ARCHETYPES } from './archetypes';
import { DT, GRID_H, GRID_W, GUARD, KIND, MAX_MISSILES, MAX_SEATS, MAX_ZONES, MOD_ID, PF, STRUCT_SCALE, SURF, WARD, ZONE, type World } from './world';

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

const alive = (w: World, i: number) => w.bodies.kind[i] !== KIND.none;

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

export const cellAt = (x: number, y: number): number => {
  const cx = Math.floor((x + ARENA.w / 2) / CELL), cy = Math.floor((y + ARENA.h / 2) / CELL);
  return cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H ? -1 : cy * GRID_W + cx;
};

const surfLife = (k: number): number => T(k === SURF.water ? SURFACE.water : k === SURF.ice ? SURFACE.ice : SURFACE.fire);

/** An element reaching the floor. Water floods, cold freezes water (or frosts the ground), fire burns or melts. */
export function touchFloor(w: World, cell: number, el: number): void {
  if (cell < 0) return;
  const s = w.surf, k = s.kind[cell];
  let next: number = k;
  if (el === EL.water) next = k === SURF.fire ? SURF.none : k === SURF.ice ? SURF.ice : SURF.water;
  else if (el === EL.cold) next = k === SURF.fire ? SURF.none : SURF.ice;
  else if (el === EL.fire) next = k === SURF.ice ? SURF.water : k === SURF.water ? SURF.none : SURF.fire;
  else return;
  s.kind[cell] = next;
  s.life[cell] = next ? surfLife(next) : 0;
}

export function floorDisc(w: World, x: number, y: number, r: number, el: number): void {
  for (let gy = -r; gy <= r; gy += CELL) for (let gx = -r; gx <= r; gx += CELL) {
    if (gx * gx + gy * gy <= r * r) touchFloor(w, cellAt(x + gx, y + gy), el);
  }
}

const surfAt = (w: World, x: number, y: number): number => { const c = cellAt(x, y); return c < 0 ? 0 : w.surf.kind[c]; };

export function tickSurfaces(w: World): void {
  const s = w.surf, b = w.bodies;
  for (let c = 0; c < s.kind.length; c++) if (s.kind[c] && --s.life[c] <= 0) s.kind[c] = SURF.none;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i)) continue;
    const k = surfAt(w, b.x[i], b.y[i]);
    if (k === SURF.water) { b.wet[i] = Math.max(b.wet[i], T(1)); b.burn[i] = 0; }
    if (k === SURF.fire && b.burn[i] < T(1) && !(b.kind[i] === KIND.enemy && ARCHETYPES[b.arch[i]].burnImmune)) { if (!b.burn[i]) b.burnSrc[i] = -1; b.burn[i] = T(STATUS.burn); }
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
export function disc(w: World, p: Payload, src: number, x: number, y: number, r: number, scale: number, skip: number): void {
  const b = w.bodies;
  setHitKind(HIT_KIND.burst);
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === skip) continue;
    const dx = b.x[i] - x, dy = b.y[i] - y, d = len(dx, dy);
    if (d > r + b.r[i]) continue;
    hit(w, i, p, hitOpts(p, src, scale, d > 1e-6 ? dx / d : 1, d > 1e-6 ? dy / d : 0));
  }
}

export const burstEvent = (w: World, src: number, x: number, y: number, r: number, look: number) =>
  w.events.push({ tick: w.clock[0], kind: 'burst', who: src, x, y, amount: r, look });

/** Extra options when a spell is fired by a device or a conjured weapon rather than from the staff. */
export interface FireExtra {
  /** Fire from here instead of the caster's body (turrets, glyphs). */
  ox?: number; oy?: number;
  /** Swing reach (conjured weapons). */
  reach?: number;
  /** The arcane hook: a hit pulls the body to you. */
  yank?: boolean;
  /** Power multiplier (the Double casts at half power). */
  scale?: number;
}

/** Fires a one-shot spell. `face` is the aim in turns, (tx, ty) the clamped target point, `charge` 0..1. */
export function fireSpell(w: World, src: number, spec: SpellSpec, face: number, tx: number, ty: number, charge: number, ex: FireExtra = {}): void {
  const b = w.bodies, x = ex.ox ?? b.x[src], y = ex.oy ?? b.y[src];
  const dx = cosTurns(face), dy = sinTurns(face);
  const n = spec.formN, p = payloadOf(spec), k = ex.scale ?? 1;
  switch (spec.shape) {
    case 'missile': {
      if (spec.heal) { spawnMissile(w, src, p, dx, dy, 3, (0.7 + 0.3 * charge) * k, tx, ty, ex.ox, ex.oy); break; }
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
      const count = SHAPES.shardCount + n;
      for (let k = 0; k < count; k++) {
        const a = face + (k - (count - 1) / 2) * SHAPES.shardSpread;
        spawnMissile(w, src, p, cosTurns(a), sinTurns(a), 2, 0.3 * k, 0, 0, ex.ox, ex.oy);
      }
      break;
    }
    case 'nova': case 'quake': {
      const r = (spec.shape === 'quake' ? SHAPES.novaRadius + 1 : SHAPES.novaRadius) + SHAPES.novaPerRune * (n - 1);
      disc(w, p, src, x, y, r, k, spec.heal ? -1 : src); // the Healing ring heals you too
      if (!spec.heal) for (const el of [EL.water, EL.fire, EL.cold]) if (spec.counts[el - 1]) floorDisc(w, x, y, r * 0.6, el);
      burstEvent(w, src, x, y, r, spec.look);
      break;
    }
    case 'discharge':
      for (let i = 0; i < b.kind.length; i++) {
        if (alive(w, i) && i !== src && len(b.x[i] - x, b.y[i] - y) <= 4 + n) zap(w, src, i, p, 0.8 * k);
      }
      break;
    case 'patch': {
      const r = SHAPES.patchRadius + 0.4 * (n - 1);
      if (spec.scald) spawnZone(w, ZONE.steam, src, p, tx, ty, r, T(SHAPES.patchLife), 0);
      else for (const el of [EL.water, EL.cold, EL.fire]) if (spec.counts[el - 1]) floorDisc(w, tx, ty, r, el);
      if (spec.freeze) floorDisc(w, tx, ty, r, EL.cold); // Ice sheet: the water becomes walkable ice
      disc(w, p, src, tx, ty, r, 0.5 * k, -1);
      burstEvent(w, src, tx, ty, r, spec.look);
      break;
    }
    case 'blast': spawnZone(w, ZONE.blast, src, p, tx, ty, 2 + 0.4 * n, T(SHAPES.delayedBlast), T(SHAPES.delayedBlast)); break;
    case 'geyser': spawnZone(w, ZONE.geyser, src, p, tx, ty, 1.3 + 0.3 * n, T(SHAPES.delayedBlast), T(SHAPES.delayedBlast)); break;
    case 'spring': spawnZone(w, ZONE.spring, src, p, tx, ty, 1.8 + 0.3 * n, T(4 + 2 * n), 0); break;
    case 'strike':
      w.events.push({ tick: w.clock[0], kind: 'zap', who: src, x: tx, y: ty - 6, x2: tx, y2: ty, look: spec.look });
      disc(w, p, src, tx, ty, 0.9, 1.2 * k, -1);
      surge(w, tx, ty, p, src);
      break;
    case 'swing': {
      const empty = spec.power === 0, reach = ex.reach ?? SHAPES.swingRange;
      setHitKind(HIT_KIND.melee);
      for (let i = 0; i < b.kind.length; i++) {
        if (!alive(w, i) || i === src) continue;
        if (!inCone(x, y, face, SHAPES.swingHalfAngle, reach, b.x[i], b.y[i], b.r[i])) continue;
        if (empty) { b.hp[i] -= 6; b.lastHit[i] = w.clock[0]; addKnock(w, i, dx, dy, 3); hitEvent(w, i, 6, 0, src); }
        else hit(w, i, p, hitOpts(p, src, 0.8 * k, dx, dy));
        if (ex.yank) addKnock(w, i, -dx, -dy, 10); // pulled toward you, ally or enemy
      }
      burstEvent(w, src, x + dx * 0.9, y + dy * 0.9, reach, spec.look);
      break;
    }
    case 'palm':
      for (let i = 0; i < b.kind.length; i++) {
        if (alive(w, i) && i !== src && inCone(x, y, face, 0.08, 3, b.x[i], b.y[i], b.r[i])) hit(w, i, p, hitOpts(p, src, 1.2 * k, dx, dy));
      }
      burstEvent(w, src, x + dx * 1.5, y + dy * 1.5, 1.5, EL.life);
      break;
    case 'self': selfHit(w, src, spec); break;
    case 'blink': {
      // To the cursor (tx, ty, already clamped to blinkRange), or the nearest free spot short of it.
      const r = b.r[src];
      let nx = Math.max(-ARENA.w / 2 + r, Math.min(ARENA.w / 2 - r, tx));
      let ny = Math.max(-ARENA.h / 2 + r, Math.min(ARENA.h / 2 - r, ty));
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

/** Can body `self` stand at (x, y): not inside rock, not overlapping another body? */
function freeSpot(w: World, self: number, x: number, y: number): boolean {
  const b = w.bodies;
  if (wallAt(w, x, y, b.r[self]) >= 0 && w.walls.type[wallAt(w, x, y, b.r[self])] === WALL.rock) return false;
  for (let i = 0; i < b.kind.length; i++) {
    if (i === self || !alive(w, i)) continue;
    if (len(b.x[i] - x, b.y[i] - y) < b.r[i] + b.r[self]) return false;
  }
  return true;
}

const SELF_TMP = new Uint8Array(N_EL); // scratch, never kept

/** Self casts without Shield or Sigil: the elements hit you, as in Magicka (Heal, Douse, Attune...). */
function selfHit(w: World, i: number, spec: SpellSpec): void {
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
export function nearest(w: World, x: number, y: number, r: number, skip: readonly number[], team: number): number {
  const b = w.bodies;
  let best = -1, bd = r;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || skip.includes(i)) continue;
    if (team && (b.team[i] !== team || b.hp[i] >= b.maxHp[i])) continue;
    const d = len(b.x[i] - x, b.y[i] - y) - b.r[i];
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** A chain: the first target in front of the caster, then jumps (more with more lightning, further through wet). */
function chain(w: World, src: number, spec: SpellSpec, face: number, scale: number): void {
  const b = w.bodies, x = b.x[src], y = b.y[src], p = payloadOf(spec);
  const team = spec.heal ? b.team[src] : 0; // Chain heal looks for hurt allies
  let first = -1, bd = SHAPES.arcRange;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i) || i === src) continue;
    if (team && (b.team[i] !== team || b.hp[i] >= b.maxHp[i])) continue;
    if (!inCone(x, y, face, team ? 0.25 : 0.12, SHAPES.arcRange, b.x[i], b.y[i], b.r[i])) continue;
    const d = len(b.x[i] - x, b.y[i] - y);
    if (d < bd) { bd = d; first = i; }
  }
  if (first < 0) { // a short crackle into the air
    w.events.push({ tick: w.clock[0], kind: 'zap', who: src, x, y, x2: x + cosTurns(face) * 2.5, y2: y + sinTurns(face) * 2.5, look: spec.look });
    return;
  }
  const jumps = SHAPES.arcJumps + Math.max(0, spec.counts[EL.lightning - 1] - 1) + (spec.mod === 'chain' ? 1 : 0);
  const visited = [src, first];
  zap(w, src, first, p, scale);
  let cur = first;
  for (let j = 0; j < jumps; j++) {
    const next = nearest(w, b.x[cur], b.y[cur], SHAPES.arcJump * (b.wet[cur] ? 1.5 : 1), visited, team);
    if (next < 0) break;
    zap(w, cur, next, p, scale * 0.8);
    visited.push(next);
    cur = next;
  }
}

// ---- channels (beams, sprays, arcs) -------------------------------------------------------------

/**
 * One tick of a channelled spell from body `src`, aimed at `face`. With `follow`, the channel is a
 * Double's echo of seat `follow.seat`'s: it keeps that seat's timing, draws its end to dblEnd, and
 * deals `follow.scale` of the damage.
 */
export function channelTick(w: World, src: number, spec: SpellSpec, face: number, follow?: { seat: number; scale: number }): void {
  const b = w.bodies, s = w.seats, x = b.x[src], y = b.y[src], p = payloadOf(spec);
  const dx = cosTurns(face), dy = sinTurns(face);
  const rate = COMBAT.channelRate * DT * (follow ? follow.scale : 1);
  const seat = follow ? follow.seat : src;
  const t = s.chanTicks[seat];
  setHitKind(HIT_KIND.channel);
  const setEnd = (ex: number, ey: number) => { if (follow) { s.dblEndX[seat] = ex; s.dblEndY[seat] = ey; } else { s.chanEndX[src] = ex; s.chanEndY[src] = ey; } };
  if (spec.shape === 'beam') {
    let reach = SHAPES.beamRange + spec.formN, target = -1;
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || i === src) continue;
      const d = rayCircle(x, y, dx, dy, b.x[i], b.y[i], b.r[i] + SHAPES.beamWidth / 2);
      if (d >= 0 && d < reach) { reach = d; target = i; }
    }
    // Rock and barriers stop the beam first if they're closer.
    const [wallD, wk] = clipRay(w, x, y, dx, dy, reach);
    if (wk >= 0) { reach = wallD; target = -1; damageWall(w, wk, payloadDamage(spec.counts, 0, rate)); }
    setEnd(x + dx * reach, y + dy * reach);
    const lensed = rayThroughLens(w, x, y, dx, dy, reach) ? STRUCT_SCALE.lens : 1;
    if (target >= 0) {
      const dealt = hit(w, target, p, hitOpts(p, src, rate * lensed, dx, dy, COMBAT.channelStatus * DT, true), false);
      if (t % 12 === 0) hitEvent(w, target, dealt * 12, spec.look, src);
      if (spec.mod === 'burst' && t % 30 === 0) disc(w, p, src, b.x[target], b.y[target], SHAPES.burstRadius, 0.3, src);
    }
    return;
  }
  if (spec.shape === 'spray') {
    const range = SHAPES.sprayRange + 0.5 * (spec.formN - 1);
    setEnd(x + dx * range, y + dy * range);
    // Falloff (combat.sprayFalloff): the nearest body takes it all, each one behind takes a share less.
    const inside: number[] = [];
    for (let i = 0; i < b.kind.length; i++) {
      if (!alive(w, i) || i === src) continue;
      if (inCone(x, y, face, SHAPES.sprayHalfAngle, range, b.x[i], b.y[i], b.r[i])) inside.push(i);
    }
    if (COMBAT.sprayFalloff < 1) inside.sort((a, c) => len(b.x[a] - x, b.y[a] - y) - len(b.x[c] - x, b.y[c] - y) || a - c);
    inside.forEach((i, k) => {
      const share = k === 0 ? 1 : COMBAT.sprayFalloff;
      const dealt = hit(w, i, p, hitOpts(p, src, rate * share, dx, dy, COMBAT.channelStatus * DT, true), false);
      if (t % 12 === 0) hitEvent(w, i, dealt * 12, spec.look, src);
    });
    // The spray wets, freezes or burns the floor near its tip.
    if (!spec.heal && t % 6 === 0) {
      // Every half cell along the cone's far half, so whether a cell under a target catches doesn't hang on where samples fall.
      for (let d = range * 0.45; d <= range; d += 0.5) {
        for (const el of [EL.water, EL.cold, EL.fire]) if (spec.counts[el - 1]) touchFloor(w, cellAt(x + dx * d, y + dy * d), el);
      }
    }
    return;
  }
  if (spec.shape === 'arc') {
    if (follow) { if (s.chanTimer[seat] === T(SHAPES.arcInterval)) chain(w, src, spec, face, 0.5 * follow.scale); return; } // the echo zaps when its owner does
    if (s.chanTimer[src] > 0) { s.chanTimer[src]--; return; }
    s.chanTimer[src] = T(SHAPES.arcInterval);
    chain(w, src, spec, face, 0.5);
  }
}

// ---- missiles and zones --------------------------------------------------------------------------

export function spawnMissile(w: World, src: number, p: Payload, dx: number, dy: number, type: number, scale: number, tx: number, ty: number, ox?: number, oy?: number): number {
  const m = w.missiles, b = w.bodies;
  for (let j = 0; j < MAX_MISSILES; j++) {
    if (m.alive[j]) continue;
    m.alive[j] = 1; m.type[j] = type; m.owner[j] = src; m.scale[j] = scale; m.pierce[j] = 0; m.lastHit[j] = -1;
    m.x[j] = (ox ?? b.x[src]) + dx * (b.r[src] + 0.25); m.y[j] = (oy ?? b.y[src]) + dy * (b.r[src] + 0.25);
    m.vx[j] = dx * SHAPES.missileSpeed; m.vy[j] = dy * SHAPES.missileSpeed;
    m.r[j] = type === 2 ? 0.15 : SHAPES.missileRadius;
    m.life[j] = T(type === 2 ? 0.6 : SHAPES.missileLife);
    m.look[j] = p.look; m.flags[j] = flagsOf(p); m.mod[j] = modId(p.mod);
    m.els.set(p.counts.subarray(p.at * N_EL, p.at * N_EL + N_EL), j * N_EL);
    m.tx[j] = tx; m.ty[j] = ty;
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
    m.x[j] += m.vx[j] * DT; m.y[j] += m.vy[j] * DT;
    const out = Math.abs(m.x[j]) > ARENA.w / 2 || Math.abs(m.y[j]) > ARENA.h / 2;
    const p = stored(m.els, j, m.flags[j], m.mod[j], m.look[j]);
    if (m.type[j] === 3) { // heal-stone: lands, bursts
      if (--m.life[j] <= 0 || out) { m.alive[j] = 0; disc(w, p, m.owner[j], m.x[j], m.y[j], 2, m.scale[j], -1); burstEvent(w, m.owner[j], m.x[j], m.y[j], 2, m.look[j]); }
      continue;
    }
    let dead = out || --m.life[j] <= 0;
    // A lens amplifies whatever passes through it, once.
    if (!(m.flags[j] & PF.lensed) && lensAt(w, m.x[j], m.y[j]) >= 0) { m.flags[j] |= PF.lensed; m.scale[j] *= STRUCT_SCALE.lens; m.r[j] *= 1.3; }
    // Rock and barriers stop shots (a barrier of Shield alone turns them back).
    const wk = dead ? -1 : wallAt(w, m.x[j], m.y[j], m.r[j]);
    if (wk >= 0) {
      const mirror = w.walls.type[wk] === WALL.barrier && m.owner[j] !== w.walls.owner[wk];
      damageWall(w, wk, payloadDamage(m.els, j, m.scale[j]) * (mirror ? 0.5 : 1));
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
        // A conjured shield held up blocks shots from the front; a Buckler raised just in time sends them back.
        if (i < MAX_SEATS && w.seats.guardT[i] > 0) {
          const s = w.seats, inFront = (-ux * cosTurns(b.face[i]) - uy * sinTurns(b.face[i])) > 0.81; // within about 36 degrees
          if (inFront) {
            const parry = s.guard[i] === GUARD.buckler && s.guardT[i] <= T(STRUCT.parry);
            if (parry) { m.vx[j] = -m.vx[j]; m.vy[j] = -m.vy[j]; m.owner[j] = i; m.lastHit[j] = i; w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: b.x[i], y: b.y[i], amount: 0.6, look: EL.shield }); break; }
            s.guardHp[i] -= payloadDamage(m.els, j, m.scale[j]);
            if (s.guardHp[i] <= 0) { s.guard[i] = GUARD.none; s.guardT[i] = 0; }
            dead = true;
            break;
          }
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
        if (p.mod === 'burst') disc(w, p, m.owner[j], m.x[j], m.y[j], SHAPES.burstRadius, 0.4 * m.scale[j], i);
        if (p.mod === 'chain') { const n2 = nearest(w, b.x[i], b.y[i], SHAPES.arcJump, [i, m.owner[j]], 0); if (n2 >= 0) zap(w, i, n2, p, 0.4 * m.scale[j]); }
        if (p.mod === 'shatter' && m.type[j] !== 2) {
          // Shatter: three shards fly on, about 20 degrees apart (cos 0.94, sin 0.34).
          for (let k = -1; k <= 1; k++) {
            const sx = ux * (k ? 0.94 : 1) - uy * k * 0.34, sy = uy * (k ? 0.94 : 1) + ux * k * 0.34;
            const s2 = spawnMissile(w, m.owner[j], p, sx, sy, 2, 0.25 * m.scale[j], 0, 0);
            if (s2 >= 0) { m.x[s2] = m.x[j] + sx * (b.r[i] + 0.3); m.y[s2] = m.y[j] + sy * (b.r[i] + 0.3); m.lastHit[s2] = i; m.mod[s2] = 0; }
          }
        }
        if (!m.pierce[j]) dead = true;
      }
    }
    if (dead) { m.alive[j] = 0; w.events.push({ tick: w.clock[0], kind: 'fizzle', who: m.owner[j], x: m.x[j], y: m.y[j], look: m.look[j] }); }
  }
}

function spawnZone(w: World, type: number, src: number, p: Payload, x: number, y: number, r: number, life: number, timer: number): void {
  const z = w.zones;
  for (let k = 0; k < MAX_ZONES; k++) {
    if (z.type[k]) continue;
    z.type[k] = type; z.owner[k] = src; z.x[k] = x; z.y[k] = y; z.r[k] = r; z.life[k] = life; z.timer[k] = timer; z.scale[k] = 1;
    z.flags[k] = flagsOf(p); z.mod[k] = modId(p.mod); z.look[k] = p.look;
    z.els.set(p.counts.subarray(p.at * N_EL, p.at * N_EL + N_EL), k * N_EL);
    return;
  }
}

export function tickZones(w: World): void {
  const z = w.zones, b = w.bodies;
  for (let k = 0; k < MAX_ZONES; k++) {
    if (!z.type[k]) continue;
    const p = stored(z.els, k, z.flags[k], z.mod[k], z.look[k]);
    if (z.type[k] === ZONE.blast || z.type[k] === ZONE.geyser) {
      if (--z.timer[k] <= 0) {
        disc(w, p, z.owner[k], z.x[k], z.y[k], z.r[k], z.type[k] === ZONE.geyser ? 1.3 : 1, -1);
        burstEvent(w, z.owner[k], z.x[k], z.y[k], z.r[k], p.look);
        z.type[k] = ZONE.none;
      }
      continue;
    }
    // Lingering zones (springs, steam) work every half second.
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

/** Ice under foot: you slide (much lower grip). */
export const onIce = (w: World, i: number): boolean => surfAt(w, w.bodies.x[i], w.bodies.y[i]) === SURF.ice;

/** Bodies push apart, and everyone stays in the arena. Dummies are rooted. */
export function collide(w: World): void {
  const b = w.bodies;
  for (let i = 0; i < b.kind.length; i++) {
    if (!alive(w, i)) continue;
    for (let j = i + 1; j < b.kind.length; j++) {
      if (!alive(w, j)) continue;
      const dx = b.x[j] - b.x[i], dy = b.y[j] - b.y[i], d = len(dx, dy), min = b.r[i] + b.r[j];
      if (d >= min || d < 1e-9) continue;
      const wi = b.kind[i] === KIND.dummy ? 0 : 1, wj = b.kind[j] === KIND.dummy ? 0 : 1;
      const tot = wi + wj || 1, push = min - d, ux = dx / d, uy = dy / d;
      b.x[i] -= (ux * push * wi) / tot; b.y[i] -= (uy * push * wi) / tot;
      b.x[j] += (ux * push * wj) / tot; b.y[j] += (uy * push * wj) / tot;
    }
  }
  collideWalls(w);
  for (let i = 0; i < b.kind.length; i++) {
    b.x[i] = Math.max(-ARENA.w / 2 + b.r[i], Math.min(ARENA.w / 2 - b.r[i], b.x[i]));
    b.y[i] = Math.max(-ARENA.h / 2 + b.r[i], Math.min(ARENA.h / 2 - b.r[i], b.y[i]));
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
      if (b.hp[i] < b.maxHp[i] && w.clock[0] - b.lastHit[i] > T(BODY.dummyResetAfter)) b.hp[i] = b.maxHp[i];
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
