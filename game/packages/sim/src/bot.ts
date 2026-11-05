/**
 * A simple bot pilot: one tick of input for a seat, from the world alone. It drives headless
 * screenshots of the Arena (?autoplay=1) and survival tests, and stands in as a dev ally.
 * It is pure and deterministic (no randomness of its own), so a bot run is a replay like any other.
 *
 * Its habits: keep 4-6 units from the nearest enemy, heal when hurt, raise a stone arc when a
 * crowd closes in, throw rocks at brutes, spray fire at goblins, and soak-then-shock groups.
 * It only queues what its pools can pay for.
 */
import type { Element } from '@wizard-sim/rules';
import { ARCH } from './archetypes';
import { EL } from './elements';
import { len } from './geom';
import { AIM_UNIT, BTN, NO_INPUT, quantize, type PlayerInput } from './input';
import { KIND, MAX_SEATS, PHASE, PHASE_ENC, type World } from './world';

/** Per-seat plan, kept by the caller between ticks (a few numbers, not world state). */
export interface BotMemory {
  /** Elements still to press, then the button to hold and for how long. */
  plan: number[];
  button: number;
  hold: number;
  /** Ticks to wait before the next plan. */
  rest: number;
}
export const newBotMemory = (): BotMemory => ({ plan: [], button: 0, hold: 0, rest: 30 });

const runes = (w: World, seat: number, el: Element) => w.seats.runes[seat * 9 + EL[el] - 1];

function choose(w: World, seat: number, foe: number, crowd: number, d: number): [Element[], number, number] {
  const b = w.bodies;
  const can = (els: Element[]) => els.every((e) => runes(w, seat, e) >= els.filter((x) => x === e).length);
  if (b.hp[seat] < 45 && can(['life', 'life'])) return [['life', 'life'], BTN.self, 2];
  if (crowd >= 3 && d < 5 && can(['shield', 'earth'])) return [['shield', 'earth'], BTN.area, 22];
  if (b.arch[foe] === ARCH.brute && can(['earth', 'earth'])) return [['earth', 'earth'], BTN.force, 64];
  if (b.arch[foe] === ARCH.imp && can(['water', 'cold'])) return [['water', 'cold'], BTN.force, 2];
  if (crowd >= 2 && b.wet[foe] && can(['lightning'])) return [['lightning'], BTN.force, 50];
  if (crowd >= 2 && can(['water'])) return [['water'], BTN.force, 30];
  if (d < 4.5 && can(['fire'])) return [['fire'], BTN.force, 70];
  if (can(['arcane'])) return [['arcane'], BTN.force, 60];
  if (can(['earth'])) return [['earth'], BTN.force, 40];
  return [[], BTN.weapon, 2];
}

export function botInput(w: World, seat: number, mem: BotMemory): PlayerInput {
  const b = w.bodies, s = w.seats;
  if (b.kind[seat] !== KIND.wizard || b.downed[seat]) return NO_INPUT;
  // The nearest enemy, and how many are within 5 units of us.
  let foe = -1, fd = Infinity, crowd = 0;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy && b.kind[i] !== KIND.dummy) continue;
    const d = len(b.x[i] - b.x[seat], b.y[i] - b.y[seat]);
    if (d < 5) crowd++;
    if (d < fd) { fd = d; foe = i; }
  }
  // Survive's pick: walk onto an altar (each seat its own, so a bot team shows different picks).
  const r = w.run;
  if (foe < 0 && r && w.enc.state[0] === PHASE_ENC.pick && r.picked[seat] < 0) {
    const a = (seat + w.enc.state[1]) % r.offer.length, mx = r.ax[a] - b.x[seat], my = r.ay[a] - b.y[seat], ml = len(mx, my);
    return quantize({ ...NO_INPUT, moveX: ml > 0.2 ? (mx / ml) * 127 : 0, moveY: ml > 0.2 ? (my / ml) * 127 : 0, aimX: 32, aimY: 0 });
  }
  if (foe < 0 || (r && fd > 14)) { // nothing to fight (near, in survive's big arena): drift back toward the middle
    const mx = -b.x[seat], my = -b.y[seat], ml = len(mx, my);
    return quantize({ ...NO_INPUT, moveX: ml > 1 ? (mx / ml) * 80 : 0, moveY: ml > 1 ? (my / ml) * 80 : 0, aimX: 32, aimY: 0 });
  }
  const dx = b.x[foe] - b.x[seat], dy = b.y[foe] - b.y[seat];
  // Kite: back off inside 4, close in beyond 7, strafe in between.
  const ux = dx / (fd || 1), uy = dy / (fd || 1);
  let mx = 0, my = 0;
  if (fd < 4) { mx = -ux; my = -uy; } else if (fd > 7) { mx = ux; my = uy; } else { mx = -uy * 0.6; my = ux * 0.6; }
  // Stay off the arena's edge.
  if (Math.abs(b.x[seat]) > w.dims.w / 2 - 2) mx = -Math.sign(b.x[seat]);
  if (Math.abs(b.y[seat]) > w.dims.h / 2 - 2) my = -Math.sign(b.y[seat]);

  let buttons = 0, press0 = 0;
  if (mem.rest > 0) mem.rest--;
  else if (mem.plan.length) press0 = mem.plan.shift()!;
  else if (mem.hold > 0) { buttons = mem.button; mem.hold--; if (!mem.hold) mem.rest = 12; }
  else if (s.phase[seat] === PHASE.idle) {
    const [els, btn, hold] = choose(w, seat, foe, crowd, fd);
    mem.plan = els.map((e) => EL[e]); mem.button = btn; mem.hold = hold;
  }
  if (buttons & (BTN.force | BTN.area)) { mx *= 0.5; my *= 0.5; }
  return quantize({ buttons, press0, press1: 0, moveX: mx * 127, moveY: my * 127, aimX: dx / AIM_UNIT, aimY: dy / AIM_UNIT });
}
