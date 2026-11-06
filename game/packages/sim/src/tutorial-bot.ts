/**
 * A pilot that plays the tutorial through, beat by beat, as a new player is asked to: it walks the
 * stones, strikes the straw, shoves the sack with a Heavy, steps out of the slam, parries a bolt,
 * burns the hedge, douses itself and steams the wet goblins, then takes an arch on the end card.
 * Tests run it to the end, and headless screenshots use it (?room=tutorial&autoplay=1) to show
 * each beat being played. Pure and deterministic: it reads the world and its own small memory.
 */
import { AI, KIND, MAX_SEATS, PHASE, type World } from './world';
import { EL } from './elements';
import { AIM_UNIT, BTN, NO_INPUT, quantize, type PlayerInput } from './input';
import { TAG, TS, TUT_BEAT, TUT_END, TUT_PLACES as P } from './tutorial-data';

/** The bot's plan between ticks (not world state): presses to make, a button to hold, a pause. */
export interface TutorialBotMemory { presses: number[]; button: number; hold: number; rest: number; exit: number }
/** `exit`: which end-card arch it walks to (0 Sanctum, 1 Survive, 2 Arena). */
export const newTutorialBot = (exit = 1): TutorialBotMemory => ({ presses: [], button: 0, hold: 0, rest: 0, exit });

const d2 = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** The nearest tutorial body tagged `tag` to seat `s`, or -1. */
function nearest(w: World, s: number, tag: number): number {
  const b = w.bodies, t = w.tut!;
  let best = -1, bd = Infinity;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy || t.tag[i] !== tag) continue;
    const d = d2(b.x[i], b.y[i], b.x[s], b.y[s]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function tutorialBotInput(w: World, s: number, m: TutorialBotMemory): PlayerInput {
  const t = w.tut, b = w.bodies;
  if (!t || !w.seats.active[s] || b.kind[s] !== KIND.wizard) return NO_INPUT;
  const st = t.state, beat = st[TS.beat], x = b.x[s], y = b.y[s];
  let mx = 0, my = 0, ax = 1, ay = 0, buttons = 0, press = 0;
  const walk = (tx: number, ty: number, stop = 0.15) => {
    const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > stop) { mx = (dx / d) * 127; my = (dy / d) * 127; }
    return d;
  };
  const aim = (tx: number, ty: number) => { ax = tx - x; ay = ty - y; };
  const idle = w.seats.phase[s] === PHASE.idle;
  /** Starts a plan: press these elements, then hold `button` for `hold` ticks, then rest. */
  const plan = (els: number[], button: number, hold: number, rest = 20) => { m.presses = els.slice(); m.button = button; m.hold = hold; m.rest = rest; };
  const busy = () => m.presses.length > 0 || m.hold > 0 || m.rest > 0;

  if (st[TS.fade] !== 0) { m.presses = []; m.hold = 0; m.rest = 0; }
  else if (beat === TUT_END) { const [ex, ey] = P.exits[m.exit]; walk(ex, ey, 0.2); aim(ex, ey); }
  else if (st[TS.lit]) { walk(P.arch[0], P.arch[1], 0.1); aim(P.arch[0], P.arch[1]); }
  else switch (beat) {
    case TUT_BEAT.walk: {
      const k = P.stones.findIndex((_, i) => !(st[TS.a] & (1 << i)));
      if (k >= 0) { walk(P.stones[k][0], P.stones[k][1], 0.1); aim(P.stones[k][0], P.stones[k][1]); }
      break;
    }
    case TUT_BEAT.strike: {
      const e = nearest(w, s, TAG.straw);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 1.1) <= 1.2 && !busy() && idle) plan([], BTN.force, 1, 30);
      break;
    }
    case TUT_BEAT.heavy: {
      const e = nearest(w, s, TAG.sack);
      if (e < 0) break;
      // stand behind the sack, on the far side from the ring, and shove it in with Heavies
      const dx = P.ring[0] - b.x[e], dy = P.ring[1] - b.y[e], dl = Math.sqrt(dx * dx + dy * dy) || 1;
      const sx = b.x[e] - (dx / dl) * 1.0, sy = b.y[e] - (dy / dl) * 1.0;
      aim(b.x[e], b.y[e]);
      if (m.hold > 0 || walk(sx, sy, 0.12) <= 0.2) { mx = my = 0; if (!busy() && idle) plan([], BTN.force, 50, 50); }
      break;
    }
    case TUT_BEAT.retreat: {
      const e = nearest(w, s, TAG.foe);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (b.ai[e] === AI.windup && d2(x, y, b.lockX[e], b.lockY[e]) < 3.4) {
        // out of the red circle: away from where the slam will land (and hop back on the first tick)
        const dx = x - b.lockX[e], dy = y - b.lockY[e], dl = Math.sqrt(dx * dx + dy * dy) || 1;
        let ux = dx / dl, uy = dy / dl;
        if (Math.abs(x + ux * 3) > 10.5 || Math.abs(y + uy * 3) > 6.5) { const k = ux; ux = -uy; uy = k; if (Math.abs(y + uy * 3) > 6.5) { ux = -ux; uy = -uy; } }
        mx = ux * 127; my = uy * 127;
        if (b.aiT[e] === 2) buttons |= BTN.weapon;
      }
      break;
    }
    case TUT_BEAT.defend: {
      const e = nearest(w, s, TAG.foe);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      // a bolt about to land: raise the buckler now, so it lands while a parry still counts
      const mm = w.missiles;
      for (let j = 0; j < mm.alive.length; j++) if (mm.alive[j] && mm.owner[j] === e && d2(mm.x[j], mm.y[j], x, y) < 1.25) { plan([], BTN.self, 14, 20); break; }
      break;
    }
    case TUT_BEAT.fire: {
      const e = nearest(w, s, TAG.hedge);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 2.6) <= 2.8 && !busy() && idle) plan([EL.fire, EL.fire], BTN.force, 110, 30);
      break;
    }
    case TUT_BEAT.douse: {
      const past = P.fireBand[1] + 1.2;
      if (x < past) { walk(past + 0.5, y, 0.1); aim(past + 2, y); }
      else if (b.burn[s] > 0 && !busy() && idle) plan([EL.water], BTN.self, 1, 40);
      break;
    }
    case TUT_BEAT.steam: {
      const e = nearest(w, s, TAG.straw);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 3.2) <= 3.4 && !busy() && idle) plan([EL.water, EL.fire], BTN.force, 120, 30);
      break;
    }
    default:
      break;
  }

  // the plan: one press a tick, then the held button, then a rest
  if (st[TS.fade] === 0) {
    if (m.presses.length) press = m.presses.shift()!;
    else if (m.hold > 0) { buttons |= m.button; m.hold--; }
    else if (m.rest > 0) m.rest--;
  }
  // a Heavy being charged stands still
  if (m.hold > 0 && m.button === BTN.force && beat === TUT_BEAT.heavy) { mx = 0; my = 0; }
  return quantize({ ...NO_INPUT, buttons, press0: press, moveX: mx, moveY: my, aimX: ax / AIM_UNIT, aimY: ay / AIM_UNIT });
}
