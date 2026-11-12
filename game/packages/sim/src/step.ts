/**
 * One fixed step: step(world, inputs) advances the world by DT. It is the whole game as far as
 * netcode is concerned: same world + same inputs => same world, on every machine.
 *
 * Order: mode presses (tutorial, Survive, battery) -> seats (runes, queue, casts and channels; walking
 * intent) -> the wave director -> nav -> enemies -> movement -> missiles -> zones -> structures ->
 * surfaces -> guards -> statuses -> collisions -> health -> deaths -> Doubles -> the tutorial's checks.
 */
import { canAct, tickSeat } from './cast';
import { BODY, STATUS } from './config';
import { TAP } from './hands';
import { collide, fixedBody, onIce, tickDoubles, tickHealth, tickMissiles, tickSurfaces, tickZones } from './effects';
import { beginTutorialTick, tickTutorial } from './tutorial';
import { tickDeaths, tickEnemies } from './enemies';
import { tickNav } from './nav';
import { hasteOf, tickStructures } from './structures';
import { tickWaves } from './waves';
import { tickBatteryWaves } from './battery-waves';
import { survivePress, tickSurvive } from './survive';
import { HIT_KIND, setHitKind, tickStatuses } from './hit';
import { sureFooted, tickGuards, walkMult } from './guards';
import { BTN, type PlayerInput } from './input';
import { batteryPress, driving } from './battery';
import { DT, KIND, MAX_SEATS, PHASE, joinSeat, type World } from './world';

export { elementId, elementName } from './elements';

export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events.length = 0;
  setHitKind(HIT_KIND.other); // module state isn't in the snapshot: a hit that names no kind must not see last tick's
  const b = w.bodies, s = w.seats;
  if (w.tut) beginTutorialTick(w);
  if (w.run) survivePress(w, inputs);
  if (w.battery) batteryPress(w, inputs);

  for (let i = 0; i < MAX_SEATS; i++) {
    const inp = inputs[i];
    if (!inp) continue;
    if (!s.active[i] && inp.buttons & BTN.join) joinSeat(w, i);
    if (!s.active[i] || b.kind[i] !== KIND.wizard) continue;
    tickSeat(w, i, inp);

    // Walking: toward the stick, slowed by chill, by casting, and not at all while stunned, frozen or down.
    let mx = inp.moveX / 127, my = inp.moveY / 127;
    const m = Math.sqrt(mx * mx + my * my);
    if (m > 1) { mx /= m; my /= m; }
    let speed = BODY.walkSpeed * (1 - STATUS.chillSlow * b.chill[i]) * hasteOf(w, i) * walkMult(w, i); // carrying a guard or weapon, blocking, the Bulwark, a held Special
    const ph = s.phase[i];
    if (ph === PHASE.channel || ph === PHASE.charge || s.handT[i] > TAP) speed *= BODY.castWalk; // a Heavy charges like a spell
    if (!canAct(w, i) || b.heldBy[i] >= 0 || b.root[i] > 0 || driving(w, i)) speed = 0; // held by a grabber or pinned: you can still cast, not walk
    const grip = BODY.friction; // nobody slips on ice any more (the user, 2026-11-11: sliding wasn't a helpful mechanic)
    b.vx[i] += (mx * speed - b.vx[i]) * grip;
    b.vy[i] += (my * speed - b.vy[i]) * grip;
  }

  if (w.run) tickSurvive(w); else if (w.battery) tickBatteryWaves(w); else tickWaves(w);
  tickNav(w);
  tickEnemies(w);

  // Everyone moves: own velocity plus knockback (which decays). Frozen bodies are held in place.
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] === KIND.none) continue;
    if (b.frozen[i]) { b.kx[i] = b.ky[i] = 0; continue; }
    const rooted = fixedBody(w, i); // dummies, and the tutorial's brambles
    const pinned = b.root[i] > 0; // pinned by the spear's javelin: no walking, but blows still move it
    if (!rooted) { b.x[i] += ((pinned ? 0 : b.vx[i]) + b.kx[i]) * DT; b.y[i] += ((pinned ? 0 : b.vy[i]) + b.ky[i]) * DT; }
    const decay = onIce(w, i) && sureFooted(w, i) ? 0.985 : 0.86; // only the Rime kite skates on ice (its Ice slide)
    b.kx[i] *= decay; b.ky[i] *= decay;
    if (Math.abs(b.kx[i]) < 1e-3) b.kx[i] = 0;
    if (Math.abs(b.ky[i]) < 1e-3) b.ky[i] = 0;
  }

  tickMissiles(w);
  tickZones(w);
  tickStructures(w);
  tickSurfaces(w);
  tickGuards(w);
  tickStatuses(w);
  collide(w);
  tickHealth(w);
  tickDeaths(w);
  tickDoubles(w);
  // The tutorial goes last, so its checks see every event of the tick (casts, parries, faints, deaths).
  if (w.tut) tickTutorial(w);
  w.clock[0]++;
}
