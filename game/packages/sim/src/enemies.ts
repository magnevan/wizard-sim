/**
 * Enemy behaviour, ported from the skeleton (world/ai.ts) to typed arrays. Each enemy chases the
 * nearest wizard (steering around rock), winds up a telegraphed attack (the view draws it from
 * ai, aiT and lockX/Y), strikes, and cools down. Stuns and freezes interrupt a wind-up.
 *
 *   melee (goblin, shieldbearer, imp): a bite in front of it.
 *   slam (brute): locks a circle on its target's spot, then slams it.
 *   bolt (archer): keeps its distance or hides behind a brute or shieldbearer, aims (tracking, then
 *     locked: the dodge window), then looses a slow bolt.
 *   grab (grabber): dashes, holds a wizard and drags them toward the edge, then throws them.
 *     A Yank (arcane hook), enough damage, a stun or a freeze breaks the hold.
 */
import { ARCHETYPES, ATTACK, ARCH } from './archetypes';
import { ARENA, STRUCT, T } from './config';
import { EL, N_EL } from './elements';
import { burstEvent, disc, spawnMissile, stored, type Payload } from './effects';
import { angleDiff, len } from './geom';
import { HIT_KIND, addKnock, applyHit, setHitKind } from './hit';
import { cutOff, steer } from './nav';
import { guardMelee, unburnable } from './guards';
import { WALL } from './compile';
import { damageWall, segDist } from './walls';
import { atan2Turns, cosTurns, sinTurns } from './trig';
import { AI, KIND, MAX_SEATS, PU, STATUS_BIT, TEAM, WARD, stackOf, type World } from './world';

const TRACK_SHARE = 0.55;
const COVER_DIST = 2.2;
const EDGE_MARGIN = 1.7;

/** The bolt an archer looses: one arcane rune's worth (about 16 damage), in its own colour. */
const BOLT_ELS = new Uint8Array(N_EL);
BOLT_ELS[EL.arcane - 1] = 1;
const BOLT: Payload = { counts: BOLT_ELS, at: 0, heal: false, scald: false, freeze: false, mod: null, look: EL.arcane, formN: 1 };

const canAct = (w: World, i: number) => !w.bodies.stun[i] && !w.bodies.frozen[i] && !w.bodies.down[i];

/** The wizard (or Double: enemies want it more) to go after. */
function nearestWizard(w: World, i: number): number {
  const b = w.bodies;
  let best = -1, bd = Infinity;
  for (let s = 0; s < b.kind.length; s++) {
    const k = b.kind[s];
    if (!(k === KIND.wizard && !b.downed[s]) && k !== KIND.double) continue;
    const d = len(b.x[s] - b.x[i], b.y[s] - b.y[i]) - (k === KIND.double ? STRUCT.doubleTaunt : 0);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
const isPrey = (w: World, t: number) => (w.bodies.kind[t] === KIND.wizard && !w.bodies.downed[t]) || w.bodies.kind[t] === KIND.double;

function setAi(w: World, i: number, state: number): void { w.bodies.ai[i] = state; w.bodies.aiT[i] = 0; }

/** Plain damage from an enemy to a body, plus knockback. Stone armour's coat bites back. */
function strike(w: World, src: number, t: number, dmg: number, knock: number, dx: number, dy: number, burn: boolean): void {
  const b = w.bodies, s = w.seats;
  let d = dmg;
  // A conjured guard (guards.ts): a parry or a Bulwark block stops the blow; resistance cuts it.
  if (t < MAX_SEATS && s.guard[t]) {
    const land = guardMelee(w, t, src, dmg, dx, dy);
    if (land <= 0) { w.events.push({ tick: w.clock[0], kind: 'fizzle', who: t, x: b.x[t], y: b.y[t], text: 'Blocked' }); return; }
    d *= land;
  }
  if (t < MAX_SEATS && s.ward[t] === WARD.stone) {
    d *= 0.6;
    // Melee attackers get the armour's coat (Shield + Earth + Fire burns them, and so on).
    const coat = s.wardEls.slice(t * N_EL, t * N_EL + N_EL);
    coat[EL.earth - 1] = 0;
    let any = false;
    for (let k = 0; k < N_EL; k++) if (coat[k]) any = true;
    if (any) applyHit(w, src, coat, 0, { scale: 0.5, heal: false, scald: false, freeze: false, source: t, dirX: -dx, dirY: -dy, push: 0 });
  }
  b.hp[t] -= d;
  b.lastHit[t] = w.clock[0];
  addKnock(w, t, dx, dy, knock);
  if (burn && !(t < MAX_SEATS && unburnable(w, t))) b.burn[t] = Math.max(b.burn[t], T(3));
  w.events.push({ tick: w.clock[0], kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: d, look: 0 });
}

export function tickEnemies(w: World): void {
  const b = w.bodies;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy) continue;
    const a = ARCHETYPES[b.arch[i]];
    b.vx[i] = 0; b.vy[i] = 0;
    if (!canAct(w, i)) {
      if (b.ai[i] === AI.grab) release(w, i);
      if (b.ai[i] !== AI.approach) setAi(w, i, AI.approach);
      continue;
    }
    b.aiT[i]++;
    if (b.ai[i] === AI.dash) { dash(w, i); continue; }
    if (b.ai[i] === AI.grab) { grab(w, i); continue; }

    let t = b.ai[i] === AI.windup ? b.target[i] : -1;
    if (t < 0 || !isPrey(w, t)) {
      if (b.ai[i] === AI.windup) setAi(w, i, AI.approach);
      t = nearestWizard(w, i);
    }
    b.target[i] = t;
    if (t < 0) continue;
    const dx = b.x[t] - b.x[i], dy = b.y[t] - b.y[i], d = len(dx, dy), gap = d - b.r[i] - b.r[t];
    turnToward(w, i, atan2Turns(dy, dx));
    const speed = a.speed * b.speedMult[i] * Math.max(0.2, 1 - 0.22 * b.chill[i]);

    if (b.ai[i] === AI.approach) {
      move(w, i, approachSpot(w, i, t), t, speed);
      const ranged = a.attack === ATTACK.bolt || a.attack === ATTACK.grab;
      // Walled off with no way round: a wall it's pressed against is what it attacks.
      const ready = ranged ? d <= a.reach && b.aiT[i] > T(0.4) : gap <= a.reach || (cutOff(w, i, t) && wallInReach(w, i, a.reach + 0.45) >= 0);
      if (ready) { setAi(w, i, AI.windup); b.lockX[i] = b.x[t]; b.lockY[i] = b.y[t]; }
    } else if (b.ai[i] === AI.windup) {
      if ((a.attack === ATTACK.bolt || a.attack === ATTACK.grab) && b.aiT[i] < T(a.windup * TRACK_SHARE)) { b.lockX[i] = b.x[t]; b.lockY[i] = b.y[t]; }
      if (b.aiT[i] >= T(a.windup)) attack(w, i, t, gap);
    } else if (b.ai[i] === AI.cooldown) {
      if (a.attack === ATTACK.bolt) move(w, i, approachSpot(w, i, t), t, speed);
      else move(w, i, [b.x[t], b.y[t]], t, speed * 0.3);
      if (b.aiT[i] >= T(a.cooldown)) setAi(w, i, AI.approach);
    }
  }
}

/** Shieldbearers turn slowly (flank them); everything else faces its target at once. */
function turnToward(w: World, i: number, face: number): void {
  const b = w.bodies, g = ARCHETYPES[b.arch[i]].guard;
  if (!g) { b.face[i] = face; return; }
  const step = g.turnRate / 60, d = angleDiff(face, b.face[i]);
  b.face[i] += Math.max(-step, Math.min(step, d));
}

function move(w: World, i: number, [tx, ty]: [number, number], seat: number, speed: number): void {
  const b = w.bodies;
  const [ux, uy, detour] = steer(w, i, tx, ty, seat < MAX_SEATS ? seat : -1);
  const v = speed * (detour ? 0.8 : 1);
  if (len(tx - b.x[i], ty - b.y[i]) < 0.3) return;
  b.vx[i] = ux * v; b.vy[i] = uy * v;
}

/** Where to walk. Archers hide behind the nearest brute or shieldbearer, else keep their distance. */
function approachSpot(w: World, i: number, t: number): [number, number] {
  const b = w.bodies, a = ARCHETYPES[b.arch[i]];
  if (a.attack !== ATTACK.bolt) return [b.x[t], b.y[t]];
  let front = -1, fd = Infinity;
  for (let j = MAX_SEATS; j < b.kind.length; j++) {
    if (b.kind[j] !== KIND.enemy || (b.arch[j] !== ARCH.brute && b.arch[j] !== ARCH.shieldbearer)) continue;
    const d = len(b.x[j] - b.x[i], b.y[j] - b.y[i]);
    if (d < fd) { fd = d; front = j; }
  }
  if (front >= 0) {
    const fx = b.x[front] - b.x[t], fy = b.y[front] - b.y[t], fl = len(fx, fy) || 1;
    return [b.x[front] + (fx / fl) * (COVER_DIST + b.r[front]), b.y[front] + (fy / fl) * (COVER_DIST + b.r[front])];
  }
  const ax = b.x[i] - b.x[t], ay = b.y[i] - b.y[t], al = len(ax, ay) || 1;
  return [b.x[t] + (ax / al) * a.bolt!.keepAway, b.y[t] + (ay / al) * a.bolt!.keepAway];
}

/** The nearest rock wall within `reach` of the body's edge, or -1. */
function wallInReach(w: World, i: number, reach: number): number {
  const b = w.bodies, wl = w.walls;
  let best = -1, bd = b.r[i] + STRUCT.wallThickness + reach;
  for (let k = 0; k < wl.type.length; k++) {
    if (wl.type[k] !== WALL.rock) continue;
    const d = segDist(b.x[i], b.y[i], wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0];
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function attack(w: World, i: number, t: number, gap: number): void {
  const b = w.bodies, a = ARCHETYPES[b.arch[i]];
  const dmg = a.damage * b.dmgMult[i];
  if (a.attack === ATTACK.melee) {
    const dx = b.x[t] - b.x[i], dy = b.y[t] - b.y[i], d = len(dx, dy) || 1;
    const inFront = Math.abs(angleDiff(atan2Turns(dy, dx), b.face[i])) < 0.19;
    if (gap <= a.reach + 0.45 && inFront) strike(w, i, t, dmg, a.knockback, dx / d, dy / d, !!a.hitBurn);
    else if (cutOff(w, i, t)) { const k = wallInReach(w, i, a.reach + 0.45); if (k >= 0) damageWall(w, k, dmg); }
  } else if (a.attack === ATTACK.slam) {
    const r = a.slamRadius!;
    for (let s = 0; s < b.kind.length; s++) {
      if (b.team[s] !== TEAM.players || b.kind[s] === KIND.none || b.downed[s]) continue;
      const ox = b.x[s] - b.lockX[i], oy = b.y[s] - b.lockY[i], od = len(ox, oy);
      if (od - b.r[s] > r) continue;
      strike(w, i, s, dmg, a.knockback, od > 0.05 ? ox / od : cosTurns(b.face[i]), od > 0.05 ? oy / od : sinTurns(b.face[i]), false);
    }
    // a slam breaks the rock it lands on, too
    const wl = w.walls;
    for (let k = 0; k < wl.type.length; k++) if (wl.type[k] === WALL.rock && segDist(b.lockX[i], b.lockY[i], wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0] <= r) damageWall(w, k, dmg);
    w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: b.lockX[i], y: b.lockY[i], amount: r, look: EL.earth });
  } else if (a.attack === ATTACK.bolt) {
    const dx = b.lockX[i] - b.x[i], dy = b.lockY[i] - b.y[i], d = len(dx, dy) || 1;
    b.face[i] = atan2Turns(dy, dx);
    const m = spawnMissile(w, i, BOLT, dx / d, dy / d, 0, dmg / 14, 0, 0);
    if (m >= 0) { w.missiles.vx[m] = (dx / d) * a.bolt!.speed; w.missiles.vy[m] = (dy / d) * a.bolt!.speed; w.missiles.life[m] = T(15 / a.bolt!.speed); w.missiles.r[m] = 0.28; }
  } else if (a.attack === ATTACK.grab) {
    const dx = b.lockX[i] - b.x[i], dy = b.lockY[i] - b.y[i], d = len(dx, dy) || 1, g = a.grab!;
    b.lockX[i] = b.x[i] + (dx / d) * g.dashSpeed * g.dashTime;
    b.lockY[i] = b.y[i] + (dy / d) * g.dashSpeed * g.dashTime;
    b.face[i] = atan2Turns(dy, dx);
    setAi(w, i, AI.dash);
    return;
  }
  setAi(w, i, AI.cooldown);
}

function dash(w: World, i: number): void {
  const b = w.bodies, g = ARCHETYPES[b.arch[i]].grab!;
  const tx = b.lockX[i] - b.x[i], ty = b.lockY[i] - b.y[i], tl = len(tx, ty);
  const step = g.dashSpeed / 60;
  if (tl > 0.05) { const k = Math.min(1, step / tl); b.x[i] += tx * k; b.y[i] += ty * k; }
  for (let s = 0; s < MAX_SEATS; s++) {
    if (b.kind[s] !== KIND.wizard || b.downed[s] || b.heldBy[s] >= 0) continue;
    if (len(b.x[s] - b.x[i], b.y[s] - b.y[i]) > b.r[s] + b.r[i] + 0.2) continue;
    b.holding[i] = s; b.heldBy[s] = i; b.grabHp[i] = b.hp[i];
    w.events.push({ tick: w.clock[0], kind: 'hit', who: s, x: b.x[s], y: b.y[s], amount: 0, text: 'Grabbed!' });
    setAi(w, i, AI.grab);
    return;
  }
  if (b.aiT[i] >= T(g.dashTime) || tl <= 0.05) setAi(w, i, AI.cooldown);
}

function grab(w: World, i: number): void {
  const b = w.bodies, a = ARCHETYPES[b.arch[i]], g = a.grab!, t = b.holding[i];
  if (t < 0 || b.kind[t] !== KIND.wizard || b.downed[t]) { release(w, i); return; }
  // Broken free by damage, or yanked away (a big pull on the victim).
  if (b.hp[i] <= b.grabHp[i] - g.breakDamage || len(b.kx[t], b.ky[t]) > 6) { release(w, i, 'Broke free!'); return; }
  // Drag toward the nearest edge.
  const ex = b.x[i] < 0 ? -ARENA.w / 2 + EDGE_MARGIN : ARENA.w / 2 - EDGE_MARGIN, ey = b.y[i] < 0 ? -ARENA.h / 2 + EDGE_MARGIN : ARENA.h / 2 - EDGE_MARGIN;
  const toX = Math.abs(ex - b.x[i]) < Math.abs(ey - b.y[i]);
  const dx = toX ? Math.sign(ex - b.x[i]) : 0, dy = toX ? 0 : Math.sign(ey - b.y[i]);
  const atEdge = toX ? Math.abs(ex - b.x[i]) < 0.3 : Math.abs(ey - b.y[i]) < 0.3;
  if (!atEdge) { b.vx[i] = dx * g.dragSpeed; b.vy[i] = dy * g.dragSpeed; }
  b.x[t] = b.x[i] - dx * (b.r[i] + b.r[t] + 0.05); b.y[t] = b.y[i] - dy * (b.r[i] + b.r[t] + 0.05);
  b.vx[t] = b.vy[t] = 0;
  if (b.aiT[i] >= T(g.hold)) {
    strike(w, i, t, a.damage * b.dmgMult[i], a.knockback, dx || 1, dy, false);
    release(w, i);
  }
}

function release(w: World, i: number, why?: string): void {
  const b = w.bodies, t = b.holding[i];
  if (t >= 0) {
    b.heldBy[t] = -1;
    if (why) w.events.push({ tick: w.clock[0], kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: 0, text: why });
  }
  b.holding[i] = -1;
  setAi(w, i, AI.cooldown);
}

/** Removes dead enemies. */
export function tickDeaths(w: World): void {
  const b = w.bodies;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy || b.hp[i] > 0) continue;
    if (b.holding[i] >= 0) release(w, i);
    const status = (b.frozen[i] ? STATUS_BIT.frozen : 0) | (b.wet[i] ? STATUS_BIT.wet : 0) | (b.burn[i] ? STATUS_BIT.burning : 0) | (b.stun[i] ? STATUS_BIT.stunned : 0) | (b.chill[i] > 0.5 ? STATUS_BIT.chilled : 0);
    // look = archetype; el, status and the blow's direction (x2, y2) let the view pick a death that fits.
    w.events.push({ tick: w.clock[0], kind: 'fizzle', who: i, x: b.x[i], y: b.y[i], text: 'dies', look: b.arch[i], el: b.lastEl[i], mix: b.lastMix[i], shape: b.lastKind[i], status, x2: b.lastDX[i], y2: b.lastDY[i], amount: -b.hp[i] });
    b.kind[i] = KIND.none;
    // Pyre (survive): an enemy you set burning goes up in a fire burst when it dies. It burns allies too.
    const src = b.burnSrc[i];
    if (w.run && b.burn[i] > 0 && src >= 0 && src < MAX_SEATS && stackOf(w, src, PU.pyre)) {
      setHitKind(HIT_KIND.burst);
      disc(w, stored(PYRE_ELS, 0, 0, 0, EL.fire), src, b.x[i], b.y[i], PYRE_RADIUS, 1, i);
      burstEvent(w, src, b.x[i], b.y[i], PYRE_RADIUS, EL.fire);
    }
  }
}

/** Pyre's burst: two Fire runes' worth, on everyone within reach. */
const PYRE_ELS = new Uint8Array(N_EL);
PYRE_ELS[EL.fire - 1] = 2;
const PYRE_RADIUS = 1.8;
