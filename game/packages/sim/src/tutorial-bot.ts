/**
 * A pilot that plays the tutorial through, beat by beat, as a new player is asked to: it walks the
 * stones, strikes the straw, shoves the sack with a Heavy, steps out of the slam, parries a bolt,
 * sweeps the goblins round it, burns the hedge, douses itself, steams the wet goblins, rings the
 * goblins in frost, cancels Fire with Cold, rains on the cluster and shocks it, freezes and shatters,
 * throws a fireball over the pit, heals the dummy, walls off the archers' arrows, beams them down,
 * conjures a flame sword, fights the test's two waves (with the Arena bot's habits), then takes an
 * arch on the end card. Before a beat's enemies come it steps on the ready stone.
 * Tests run it to the end, and headless screenshots use it (?room=tutorial&autoplay=1) to show
 * each beat being played. Pure and deterministic: it reads the world and its own small memory.
 */
import { AI, KIND, MAX_SEATS, PHASE, type World } from './world';
import { EL, N_EL } from './elements';
import { AIM_UNIT, BTN, NO_INPUT, quantize, type PlayerInput } from './input';
import { botInput, newBotMemory, type BotMemory } from './bot';
import { TAG, TS, TUT_BEAT, TUT_END, TUT_PLACES as P, wavesOf } from './tutorial-data';

/** The bot's plan between ticks (not world state): presses to make, a button to hold, a pause; the test's fighter. */
export interface TutorialBotMemory { presses: number[]; button: number; hold: number; rest: number; exit: number; fight: BotMemory }
/** `exit`: which end-card arch it walks to (0 Sanctum, 1 Survive, 2 Arena). */
export const newTutorialBot = (exit = 1): TutorialBotMemory => ({ presses: [], button: 0, hold: 0, rest: 0, exit, fight: newBotMemory() });

const d2 = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** The nearest tutorial body tagged with one of `tags` to seat `s`, or -1. */
function nearest(w: World, s: number, ...tags: number[]): number {
  const b = w.bodies, t = w.tut!;
  let best = -1, bd = Infinity;
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if ((b.kind[i] !== KIND.enemy && b.kind[i] !== KIND.dummy) || !tags.includes(t.tag[i])) continue;
    const d = d2(b.x[i], b.y[i], b.x[s], b.y[s]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function tutorialBotInput(w: World, s: number, m: TutorialBotMemory): PlayerInput {
  const t = w.tut, b = w.bodies, seats = w.seats;
  if (!t || !seats.active[s] || b.kind[s] !== KIND.wizard) return NO_INPUT;
  const st = t.state, beat = st[TS.beat], x = b.x[s], y = b.y[s];
  // the test is a real fight: the Arena bot's habits, once its enemies are in
  if (beat === TUT_BEAT.test && !st[TS.lit] && st[TS.fade] === 0 && st[TS.go] > 0) return botInput(w, s, m.fight);
  let mx = 0, my = 0, ax = 1, ay = 0, buttons = 0, press = 0;
  const walk = (tx: number, ty: number, stop = 0.15) => {
    const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > stop) { mx = (dx / d) * 127; my = (dy / d) * 127; }
    return d;
  };
  const aim = (tx: number, ty: number) => { ax = tx - x; ay = ty - y; };
  const idle = seats.phase[s] === PHASE.idle;
  /** Starts a plan: press these elements, then hold `button` for `hold` ticks, then rest. */
  const plan = (els: number[], button: number, hold: number, rest = 20) => { m.presses = els.slice(); m.button = button; m.hold = hold; m.rest = rest; };
  const busy = () => m.presses.length > 0 || m.hold > 0 || m.rest > 0;
  const ready = () => !busy() && idle;
  const runes = (el: number) => seats.runes[s * N_EL + el - 1];
  /** Before the enemies come: step on the ready stone. */
  const calm = wavesOf(beat) > 0 && st[TS.go] === 0 && st[TS.wave] === 0;

  if (st[TS.fade] !== 0) { m.presses = []; m.hold = 0; m.rest = 0; }
  else if (beat === TUT_END) { const [ex, ey] = P.exits[m.exit]; walk(ex, ey, 0.2); aim(ex, ey); }
  else if (st[TS.lit]) { walk(P.arch[0], P.arch[1], 0.1); aim(P.arch[0], P.arch[1]); }
  else if (calm) { walk(P.ready[0], P.ready[1], 0.1); aim(P.ready[0] + 3, P.ready[1]); }
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
      if (walk(b.x[e], b.y[e], 1.1) <= 1.2 && ready()) plan([], BTN.force, 1, 30);
      break;
    }
    case TUT_BEAT.heavy: {
      const e = nearest(w, s, TAG.sack);
      if (e < 0) break;
      // stand behind the sack, on the far side from the ring, and shove it in with Heavies
      const dx = P.ring[0] - b.x[e], dy = P.ring[1] - b.y[e], dl = Math.sqrt(dx * dx + dy * dy) || 1;
      const sx = b.x[e] - (dx / dl) * 1.0, sy = b.y[e] - (dy / dl) * 1.0;
      aim(b.x[e], b.y[e]);
      if (m.hold > 0 || walk(sx, sy, 0.12) <= 0.2) { mx = my = 0; if (ready()) plan([], BTN.force, 50, 50); }
      break;
    }
    case TUT_BEAT.retreat: {
      const e = nearest(w, s, TAG.foe);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (b.ai[e] === AI.windup && d2(x, y, b.lockX[e], b.lockY[e]) < 3.4) {
        // out of the circle: away from where the slam will land (and hop back on the first tick)
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
    case TUT_BEAT.hands: {
      // let them close in, then Sweep (Shift+RMB: a tap of Area with nothing queued)
      const e = nearest(w, s, TAG.goblin);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 1.0) <= 1.3 && ready()) plan([], BTN.area, 1, 30);
      break;
    }
    case TUT_BEAT.fire: {
      const e = nearest(w, s, TAG.hedge);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 2.6) <= 2.8 && ready()) plan([EL.fire, EL.fire], BTN.force, 110, 30);
      break;
    }
    case TUT_BEAT.douse: {
      const past = P.fireBand[1] + 1.2;
      if (x < past) { walk(past + 0.5, y, 0.1); aim(past + 2, y); }
      else if (b.burn[s] > 0 && ready()) plan([EL.water], BTN.self, 1, 40);
      break;
    }
    case TUT_BEAT.steam: {
      const e = nearest(w, s, TAG.straw);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 3.2) <= 3.4 && ready()) plan([EL.water, EL.fire], BTN.force, 120, 30);
      break;
    }
    case TUT_BEAT.cold: {
      // stand still and let them come; a frost ring once the nearest is close
      const e = nearest(w, s, TAG.goblin, TAG.chilled);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (d2(x, y, b.x[e], b.y[e]) < 2.2 && ready() && runes(EL.cold) >= 1) plan([EL.cold], BTN.area, 1, 25);
      break;
    }
    case TUT_BEAT.cancel:
      if (ready()) plan([EL.fire, EL.cold], 0, 0, 40);
      break;
    case TUT_BEAT.lightning: {
      // rain over the cluster first, then the arc
      const e = nearest(w, s, TAG.straw);
      if (e < 0) break;
      const [cx, cy] = [3.3, 0];
      walk(0.6, 0, 0.2);
      const dry = (() => { for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && t.tag[i] === TAG.straw && !b.wet[i]) return true; return false; })();
      if (m.button === BTN.area && m.hold > 0) aim(cx, cy); else aim(b.x[e], b.y[e]);
      if (ready()) {
        if (dry && runes(EL.water) >= 1) { aim(cx, cy); plan([EL.water], BTN.area, 30, 10); }
        else if (runes(EL.lightning) >= 1) plan([EL.lightning], BTN.force, 70, 15);
      }
      break;
    }
    case TUT_BEAT.shatter: {
      // from the puddle's edge: a freezing splash round you, then an earthquake to shatter them
      const e = nearest(w, s, TAG.straw);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(P.puddle[0] - 1.9, P.puddle[1], 0.15) > 0.3) break;
      let frozen = false;
      for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy && t.tag[i] === TAG.straw && b.frozen[i]) frozen = true;
      if (ready()) {
        if (frozen && runes(EL.earth) >= 1) plan([EL.earth], BTN.area, 1, 20);
        else if (!frozen && runes(EL.water) >= 1 && runes(EL.cold) >= 1) plan([EL.water, EL.cold], BTN.area, 1, 20);
      }
      break;
    }
    case TUT_BEAT.fireball: {
      const e = nearest(w, s, TAG.far);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(P.pit[0] - P.pitR - 0.7, P.pit[1], 0.15) <= 0.3 && ready()) plan([EL.earth, EL.fire], BTN.force, 40, 30);
      break;
    }
    case TUT_BEAT.life: {
      // a Life beam at the dummy, from the side away from the sleeper
      const e = nearest(w, s, TAG.patient);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e] - 3.5, b.y[e] - 1.5, 0.15) <= 0.3 && ready()) plan([EL.life], BTN.force, 150, 20);
      break;
    }
    case TUT_BEAT.shield: {
      // a wall between you and the archers, raised again whenever it's gone
      const e = nearest(w, s, TAG.foe);
      if (e < 0) break;
      // aim a short way toward them, so the cursor hardly moves while Shift+RMB is held (moving it far draws the wall)
      { const dx = b.x[e] - x, dy = b.y[e] - y, dl = Math.sqrt(dx * dx + dy * dy) || 1; ax = (dx / dl) * 2; ay = (dy / dl) * 2; }
      let mine = false;
      for (let k = 0; k < w.walls.type.length; k++) if (w.walls.type[k] && w.walls.owner[k] === s) mine = true;
      if (!mine && ready() && runes(EL.shield) >= 1 && d2(x, y, b.x[e], b.y[e]) < 13) plan([EL.shield], BTN.area, 30, 30);
      break;
    }
    case TUT_BEAT.arcane: {
      const e = nearest(w, s, TAG.foe);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (m.hold > 0 && m.button === BTN.force) { mx = my = 0; break; }
      if (walk(b.x[e], b.y[e], 8.5) <= 10 && ready() && runes(EL.arcane) >= 1) plan([EL.arcane], BTN.force, 150, 20);
      break;
    }
    case TUT_BEAT.sigil: {
      // a flame sword first, then strikes
      if (!seats.weapon[s]) { if (ready() && runes(EL.sigil) >= 1 && runes(EL.fire) >= 1) plan([EL.sigil, EL.fire], BTN.weapon, 1, 30); break; }
      const e = nearest(w, s, TAG.goblin);
      if (e < 0) break;
      aim(b.x[e], b.y[e]);
      if (walk(b.x[e], b.y[e], 1.0) <= 1.3 && ready()) plan([], BTN.force, 1, 20);
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
  // a Heavy being charged, or a beam, stands still
  if (m.hold > 0 && m.button === BTN.force && (beat === TUT_BEAT.heavy || beat === TUT_BEAT.life)) { mx = 0; my = 0; }
  return quantize({ ...NO_INPUT, buttons, press0: press, moveX: mx, moveY: my, aimX: ax / AIM_UNIT, aimY: ay / AIM_UNIT });
}
