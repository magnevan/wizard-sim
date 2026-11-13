/**
 * Enemy behaviour, ported from the skeleton (world/ai.ts) to typed arrays. Each enemy chases the
 * nearest wizard (steering around rock), winds up a telegraphed attack (the view draws it from
 * ai, aiT and lockX/Y), strikes, and cools down. Stuns and freezes interrupt a wind-up.
 *
 *   melee (goblin, shieldbearer, imp): a bite in front of it.
 *   slam (brute): locks a circle on its target's spot, then slams the ground: a shockwave rolls out
 *     from its fists and hits whoever is in the circle as it reaches them.
 *   bolt (archer): keeps its distance or hides behind a brute or shieldbearer, aims (tracking, then
 *     locked: the dodge window), then looses a slow bolt.
 *   grab (grabber): dashes, holds a wizard and drags them toward the edge, then throws them.
 *     A hard shove on the held wizard, enough damage, a stun or a freeze breaks the hold.
 */
import { ARCHETYPES, ATTACK, ARCH } from './archetypes';
import { STATUS, STRUCT, T } from './config';
import { EL, N_EL } from './elements';
import { burstEvent, disc, spawnMissile, stored, type Payload } from './effects';
import { angleDiff, len } from './geom';
import { HIT_KIND, addKnock, applyHit, ignite, setHitKind } from './hit';
import { atBarrier, cutOff, enemyWall, steer } from './nav';
import { guardMelee, unburnable } from './guards';
import { solidWall } from './compile';
import { terrainNear } from './terrain';
import { TERRAIN_HIT, damageWall, segDist } from './walls';
import { atan2Turns, cosTurns, sinTurns } from './trig';
import { EV, AI, KIND, MAX_SEATS, PU, STATUS_BIT, TEAM, WARD, stackOf, type World } from './world';
import { possessed } from './possess';

const TRACK_SHARE = 0.55;
const COVER_DIST = 2.2;
const EDGE_MARGIN = 1.7;

/** The bolt an archer looses: one arcane rune's worth (about 16 damage), in its own colour. */
const BOLT_ELS = new Uint8Array(N_EL);
BOLT_ELS[EL.arcane - 1] = 1;
const BOLT: Payload = { counts: BOLT_ELS, at: 0, heal: false, scald: false, freeze: false, mod: null, look: EL.arcane, formN: 1 };

/** How much of its normal pace a chilled body keeps, walking and attacking. */
const chillPace = (chill: number) => 1 - STATUS.chillSlow * chill;

/** This tick, chill holds back a wind-up or a recovery. A brute's rolling shockwave is exempt: its age is aiT. */
function chillHolds(w: World, i: number): boolean {
  const b = w.bodies, ai = b.ai[i], chill = b.chill[i];
  if (!chill || (ai !== AI.windup && ai !== AI.cooldown)) return false;
  if (ai === AI.cooldown && ARCHETYPES[b.arch[i]].attack === ATTACK.slam && b.aiT[i] < T(0.8)) return false;
  const pace = chillPace(chill), c = w.clock[0];
  return Math.floor(c * pace) === Math.floor((c - 1) * pace);
}

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
  if (possessed(w, t)) return; // a blow at a fixture: whoever possesses it can't be hurt (possess.ts)
  let d = dmg;
  // A conjured guard (guards.ts): a parry or a Bulwark block stops the blow; resistance cuts it.
  if (t < MAX_SEATS && s.guard[t]) {
    const land = guardMelee(w, t, src, dmg, dx, dy);
    if (land <= 0) { w.events.push({ tick: w.clock[0], kind: 'fizzle', who: t, x: b.x[t], y: b.y[t], ev: EV.blocked, text: 'Blocked' }); return; }
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
  if (burn && !(t < MAX_SEATS && unburnable(w, t))) ignite(w, t, 18, src, T(3));
  w.events.push({ tick: w.clock[0], kind: 'hit', who: t, x: b.x[t], y: b.y[t], amount: d, look: 0 });
}

export function tickEnemies(w: World): void {
  const b = w.bodies, rules = w.mode.enemies; // the mode's say in what they do (mode.ts EnemyRules)
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy) continue;
    const a = ARCHETYPES[b.arch[i]];
    b.vx[i] = 0; b.vy[i] = 0;
    if (a.passive) continue; // the tutorial's straw targets and brambles
    if (!canAct(w, i)) {
      if (b.ai[i] === AI.grab) release(w, i);
      if (b.ai[i] !== AI.approach) setAi(w, i, AI.approach);
      continue;
    }
    if (!chillHolds(w, i)) b.aiT[i]++;
    if (b.ai[i] === AI.cooldown && a.attack === ATTACK.slam) slamWave(w, i);
    if (b.ai[i] === AI.dash) { dash(w, i); continue; }
    if (b.ai[i] === AI.grab) { grab(w, i); continue; }

    // the mode may have it hold a spot instead (the battery's lanes: harmless, they batter a wall)
    const hold = rules?.holdAt?.(w, i);
    if (hold) { holdWall(w, i, a, hold); continue; }
    let t = b.ai[i] === AI.windup ? b.target[i] : -1;
    if (t < 0 || !isPrey(w, t)) {
      if (b.ai[i] === AI.windup) setAi(w, i, AI.approach);
      t = rules?.target?.(w, i) ?? -1; // the mode's pick first (the battery: your own lane's defence)
      if (t < 0) t = nearestWizard(w, i);
    }
    b.target[i] = t;
    if (t < 0) continue;
    const dx = b.x[t] - b.x[i], dy = b.y[t] - b.y[i], d = len(dx, dy), gap = d - b.r[i] - b.r[t];
    turnToward(w, i, atan2Turns(dy, dx));
    const speed = a.speed * b.speedMult[i] * chillPace(b.chill[i]);

    if (b.ai[i] === AI.approach) {
      move(w, i, approachSpot(w, i, t), t, speed);
      const ranged = a.attack === ATTACK.bolt || a.attack === ATTACK.grab;
      // Walled off with no way round: a wall it's pressed against is what it attacks.
      const ready = ranged ? d <= (a.attack === ATTACK.bolt ? rules?.shotRange?.(w, i) ?? a.reach : a.reach) && b.aiT[i] > T(0.4) : gap <= a.reach || ((cutOff(w, i, t) || atBarrier(w, i, t)) && wallInReach(w, i, a.reach + 0.45) >= 0); // walled off, or its way is through a barrier
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

/**
 * The battery: an enemy goes to a spot and batters what's south of it, harmlessly, wind-up and blow over and over (the
 * view draws them as it would any attack): the stakes as you arrive, else the wall in front of a defence (holdSpot).
 */
function holdWall(w: World, i: number, a: (typeof ARCHETYPES)[number], [sx, sy]: [number, number]): void {
  const b = w.bodies;
  if (len(sx - b.x[i], sy - b.y[i]) > 0.5) {
    if (b.ai[i] !== AI.approach) setAi(w, i, AI.approach);
    turnToward(w, i, atan2Turns(sy - b.y[i], sx - b.x[i]));
    move(w, i, [sx, sy], -1, a.speed * b.speedMult[i] * chillPace(b.chill[i]));
    return;
  }
  turnToward(w, i, 0.25); // facing south: the wall, or the stakes
  b.target[i] = -1; b.lockX[i] = b.x[i]; b.lockY[i] = b.y[i] + 1.5;
  if (b.ai[i] === AI.approach && b.aiT[i] > T(0.3)) setAi(w, i, AI.windup);
  else if (b.ai[i] === AI.windup && b.aiT[i] >= T(a.windup)) setAi(w, i, AI.cooldown);
  else if (b.ai[i] === AI.cooldown && b.aiT[i] >= T(a.cooldown)) setAi(w, i, AI.approach);
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
  const off = w.mode.enemies?.standoff?.(w, i, t); // the mode's (the battery: past a defence's flamethrower, where Place reaches them)
  if (off) return off;
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

/**
 * The nearest rock wall within `reach` of the body's edge (a wall slot or TERRAIN_HIT), or -1. The
 * room's own rock counts (terrain first, as ever): an enemy cut off beside it winds up as at any wall,
 * and the blow does nothing (damageWall).
 */
function wallInReach(w: World, i: number, reach: number): number {
  const b = w.bodies, wl = w.walls, tr = w.terrain;
  let best = -1, bd = b.r[i] + STRUCT.wallThickness + reach;
  for (let q = 0, n = terrainNear(tr, b.x[i], b.y[i], bd); q < n; q++) {
    const k = tr.out[q], d = segDist(b.x[i], b.y[i], tr.x1[k], tr.y1[k], tr.x2[k], tr.y2[k])[0];
    if (d < bd) { bd = d; best = TERRAIN_HIT; }
  }
  for (let k = 0; k < wl.type.length; k++) {
    if (!enemyWall(w, k)) continue; // a barrier in the way is battered like rock (its blows drain its caster's Shield pool)
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
    else if (cutOff(w, i, t) || atBarrier(w, i, t)) { const k = wallInReach(w, i, a.reach + 0.45); if (k >= 0) damageWall(w, k, dmg); }
  } else if (a.attack === ATTACK.slam) {
    // the fists hit the ground just ahead; the shockwave rolls out from there (slamWave, during the cooldown)
    b.slamX[i] = b.x[i] + cosTurns(b.face[i]) * b.r[i] * 0.6; b.slamY[i] = b.y[i] + sinTurns(b.face[i]) * b.r[i] * 0.6;
    setAi(w, i, AI.cooldown);
    slamWave(w, i);
    return;
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

/**
 * A brute's shockwave: a front rolling out from its fists at slamSpeed. It hits the wizards inside the
 * locked circle as it reaches them (each once), and breaks rock when it reaches the circle's centre.
 * Its age is the cooldown's aiT, so it needs no state of its own beyond the start point.
 */
function slamWave(w: World, i: number): void {
  const b = w.bodies, a = ARCHETYPES[b.arch[i]], r = a.slamRadius!, v = a.slamSpeed! / 60;
  const front = b.aiT[i] * v, prev = front - v, at = w.clock[0] - b.aiT[i];
  const ox = b.slamX[i], oy = b.slamY[i], lx = b.lockX[i], ly = b.lockY[i], dc = len(lx - ox, ly - oy);
  if (prev > dc + r) return;
  const dmg = a.damage * b.dmgMult[i];
  for (let s = 0; s < b.kind.length; s++) {
    if (b.team[s] !== TEAM.players || b.kind[s] === KIND.none || b.downed[s]) continue;
    if (b.slamBy[s] === i && b.slamAt[s] === at) continue;
    const ox2 = b.x[s] - lx, oy2 = b.y[s] - ly, od = len(ox2, oy2);
    if (od - b.r[s] > r || len(b.x[s] - ox, b.y[s] - oy) - b.r[s] > front) continue;
    b.slamBy[s] = i; b.slamAt[s] = at;
    strike(w, i, s, dmg, a.knockback, od > 0.05 ? ox2 / od : cosTurns(b.face[i]), od > 0.05 ? oy2 / od : sinTurns(b.face[i]), false);
  }
  if (prev < dc && front >= dc) {
    // it breaks the rock it rolls into, too (the room's own rock doesn't break, so it isn't asked about)
    const wl = w.walls;
    for (let k = 0; k < wl.type.length; k++) if (solidWall(wl.type[k]) && segDist(lx, ly, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k])[0] <= r) damageWall(w, k, dmg);
    w.events.push({ tick: w.clock[0], kind: 'burst', who: i, x: lx, y: ly, amount: r, look: EL.earth });
  }
  if (front >= dc + r) {
    let hit = 0;
    for (let s = 0; s < b.kind.length; s++) if (b.slamBy[s] === i && b.slamAt[s] === at) hit = 1;
    w.events.push({ tick: w.clock[0], kind: 'note', ev: EV.slamDone, who: i, x: lx, y: ly, amount: hit }); // the tutorial's Retreat beat counts slams that hit nobody
  }
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
    w.events.push({ tick: w.clock[0], kind: 'hit', who: s, x: b.x[s], y: b.y[s], amount: 0, ev: EV.grabbed, text: 'Grabbed!' });
    setAi(w, i, AI.grab);
    return;
  }
  if (b.aiT[i] >= T(g.dashTime) || tl <= 0.05) setAi(w, i, AI.cooldown);
}

function grab(w: World, i: number): void {
  const b = w.bodies, a = ARCHETYPES[b.arch[i]], g = a.grab!, t = b.holding[i];
  if (t < 0 || b.kind[t] !== KIND.wizard || b.downed[t]) { release(w, i); return; }
  // Broken free by damage, or shoved out of its claws (a big knock on the victim).
  if (b.hp[i] <= b.grabHp[i] - g.breakDamage || len(b.kx[t], b.ky[t]) > 6) { release(w, i, 'Broke free!'); return; }
  // Drag toward the nearest edge.
  const hw = w.dims.w / 2, hh = w.dims.h / 2, ex = b.x[i] < 0 ? -hw + EDGE_MARGIN : hw - EDGE_MARGIN, ey = b.y[i] < 0 ? -hh + EDGE_MARGIN : hh - EDGE_MARGIN;
  const toX = Math.abs(ex - b.x[i]) < Math.abs(ey - b.y[i]);
  const dx = toX ? Math.sign(ex - b.x[i]) : 0, dy = toX ? 0 : Math.sign(ey - b.y[i]);
  const atEdge = toX ? Math.abs(ex - b.x[i]) < 0.3 : Math.abs(ey - b.y[i]) < 0.3;
  if (!atEdge) { b.vx[i] = dx * g.dragSpeed; b.vy[i] = dy * g.dragSpeed; }
  b.x[t] = b.x[i] - dx * (b.r[i] + b.r[t] + 0.05); b.y[t] = b.y[i] - dy * (b.r[i] + b.r[t] + 0.05);
  b.vx[t] = b.vy[t] = 0;
  if (b.aiT[i] >= T(g.hold)) {
    strike(w, i, t, a.damage * b.dmgMult[i], a.knockback, dx || dy ? dx : 1, dy, false); // thrown toward the edge (east if exactly on it)
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
    const status = (b.frozen[i] ? STATUS_BIT.frozen : 0) | (b.wet[i] ? STATUS_BIT.wet : 0) | (b.burn[i] ? STATUS_BIT.burning : 0) | (b.stun[i] ? STATUS_BIT.stunned : 0) | (b.chill[i] > 0.17 ? STATUS_BIT.chilled : 0);
    // look = archetype; el, status and the blow's direction (x2, y2) let the view pick a death that fits.
    w.events.push({ tick: w.clock[0], kind: 'fizzle', who: i, x: b.x[i], y: b.y[i], ev: EV.death, text: 'dies', look: b.arch[i], el: b.lastEl[i], mix: b.lastMix[i], shape: b.lastKind[i], status, x2: b.lastDX[i], y2: b.lastDY[i], amount: -b.hp[i] });
    b.kind[i] = KIND.none;
    // Pyre (survive): an enemy you set burning goes up in a fire burst when it dies. It burns allies too.
    const src = b.burnSrc[i];
    if (b.burn[i] > 0 && src >= 0 && src < MAX_SEATS && stackOf(w, src, PU.pyre)) {
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
