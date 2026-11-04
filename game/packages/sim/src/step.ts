/**
 * One fixed step: step(world, inputs) advances the world by DT. It is the whole game as far as
 * netcode is concerned: same world + same inputs => same world, on every machine.
 *
 * Order: seats (runes, queue, casts) -> movement -> channels' effects already ran in the seats
 * -> missiles -> zones -> surfaces -> statuses -> collisions -> health.
 */
import { canAct, tickSeat } from './cast';
import { BODY } from './config';
import { collide, onIce, tickDoubles, tickHealth, tickMissiles, tickSurfaces, tickZones } from './effects';
import { tickDeaths, tickEnemies } from './enemies';
import { tickNav } from './nav';
import { hasteOf, tickStructures } from './structures';
import { tickWaves } from './waves';
import { tickStatuses } from './hit';
import { BTN, type PlayerInput } from './input';
import { DT, KIND, MAX_SEATS, PHASE, joinSeat, type World } from './world';

export { elementId, elementName } from './elements';

export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events.length = 0;
  const b = w.bodies, s = w.seats;

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
    let speed = BODY.walkSpeed * Math.max(0.2, 1 - 0.22 * b.chill[i]) * hasteOf(w, i);
    const ph = s.phase[i];
    if (ph === PHASE.channel || ph === PHASE.charge) speed *= BODY.castWalk;
    if (!canAct(w, i) || b.heldBy[i] >= 0) speed = 0; // held by a grabber: you can still cast, not walk
    const grip = onIce(w, i) ? 0.03 : BODY.friction;
    b.vx[i] += (mx * speed - b.vx[i]) * grip;
    b.vy[i] += (my * speed - b.vy[i]) * grip;
  }

  tickWaves(w);
  tickNav(w);
  tickEnemies(w);

  // Everyone moves: own velocity plus knockback (which decays). Frozen bodies are held in place.
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] === KIND.none) continue;
    if (b.frozen[i]) { b.kx[i] = b.ky[i] = 0; continue; }
    const rooted = b.kind[i] === KIND.dummy;
    if (!rooted) { b.x[i] += (b.vx[i] + b.kx[i]) * DT; b.y[i] += (b.vy[i] + b.ky[i]) * DT; }
    const decay = onIce(w, i) ? 0.985 : 0.86;
    b.kx[i] *= decay; b.ky[i] *= decay;
    if (Math.abs(b.kx[i]) < 1e-3) b.kx[i] = 0;
    if (Math.abs(b.ky[i]) < 1e-3) b.ky[i] = 0;
  }

  tickMissiles(w);
  tickZones(w);
  tickStructures(w);
  tickSurfaces(w);
  tickStatuses(w);
  collide(w);
  tickHealth(w);
  tickDeaths(w);
  tickDoubles(w);
  w.clock[0]++;
}
