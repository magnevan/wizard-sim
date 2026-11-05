/**
 * Spell demos for screenshots (client only, like ?script=1 but for chosen spells): seat 0 and
 * seat 1 stand still and cast one spell each, over and over, at the dummies (seat 1 lags 37 ticks).
 *
 *   ?spell=arcane,fire/force          seat 0's spell: elements joined by , or + (an unescaped + arrives as a space)
 *   &spell2=water+cold/force          seat 1's (optional)
 *
 * Casts: force (held about 1.5 s, so channels and charges show), area, place, self, weapon,
 * drag (a Place drawn left to right across the target), hold (the Area button held and never let go: the
 * placement preview), holddrag (held while dragging, never let go), guard (Weapon cast, then the button held to block).
 * wait does nothing for a cycle (?spell=shield+earth/place;wait;wait keeps one wall up to watch it break).
 * A target after @ overrides where the seat aims: ?spell=shield+earth/drag@0,-2
 * Your hands, with nothing queued: strike, heavy, special, channel (Special held), retreat, block (?spell=sigil+cold/weapon;heavy).
 * Pure integer maths on the tick, so a given --ms shows the same moment.
 */
import { rules, type Element } from '@wizard-sim/rules';
import { AIM_UNIT, BTN, elementId, quantize, type PlayerInput, type World } from '@wizard-sim/sim';

export interface Demo { els: number[]; cast: string; at?: [number, number]; seq?: Demo[] }

/** Several spells joined by ; take turns, one per cycle: ?spell=sigil/self;arcane/force */
export function parseDemo(s: string | null): Demo | null {
  if (!s) return null;
  if (s.includes(';')) {
    const seq = s.split(';').map(parseOne).filter((d): d is Demo => !!d);
    return seq.length ? { ...seq[0], seq } : null;
  }
  return parseOne(s);
}
function parseOne(s: string): Demo | null {
  const [q, c0 = s === 'wait' ? 'wait' : 'force'] = s.split('/');
  const [cast, at] = c0.split('@');
  const xy = at ? at.split(',').map(Number) : null;
  const els = q.split(/[+ ,]/).filter((e) => (rules.BASE as readonly string[]).includes(e)).map((e) => elementId(e as Element));
  return els.length || HANDS.includes(cast) ? { els, cast, at: xy && xy.length === 2 && xy.every(Number.isFinite) ? [xy[0], xy[1]] : undefined } : null;
}

/** Casts that work with nothing queued: your hands (weapon moves and the guard's gestures). */
const HANDS = ['weapon', 'wait', 'strike', 'heavy', 'special', 'channel', 'block', 'retreat'];
const PERIOD = 170;
/** Where seat i aims: the middle dummy for seat 0, the left one for seat 1. */
const TARGET = [[0, -5], [-6, -4]] as const;

export function demoInput(w: World, tick: number, seat: number, d: Demo): PlayerInput {
  // seat 1 runs the same cycle 37 ticks behind, so one shot shows two moments of a spell
  const lag = tick - seat * 37;
  if (lag < 0) return quantize({ buttons: 0, press0: 0, press1: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  if (d.seq) d = d.seq[Math.floor(lag / PERIOD) % d.seq.length];
  const ph = lag % PERIOD;
  const press0 = d.cast !== 'wait' && ph >= 6 && ph < 6 + d.els.length * 6 && (ph - 6) % 6 === 0 ? d.els[(ph - 6) / 6] : 0;
  const go = 10 + d.els.length * 6;
  let buttons = 0;
  if (d.cast === 'force') buttons = ph >= go && ph < go + 90 ? BTN.force : 0;
  else if (d.cast === 'area') buttons = ph >= go && ph < go + 3 ? BTN.area : 0;
  else if (d.cast === 'place') buttons = ph >= go && ph < go + 24 ? BTN.area : 0;
  else if (d.cast === 'self') buttons = ph >= go && ph < go + 2 ? BTN.self : 0;
  else if (d.cast === 'weapon') buttons = ph >= go && ph < go + 2 ? BTN.weapon : 0;
  else if (d.cast === 'drag') buttons = ph >= go && ph < go + 40 ? BTN.area : 0;
  else if (d.cast === 'hold' || d.cast === 'holddrag') buttons = ph >= go ? BTN.area : 0;
  // nothing queued: your hands. strike (RMB tap), heavy (RMB held 1 s), special (Shift+RMB), retreat (Shift+LMB), block (Space held)
  else if (d.cast === 'strike') buttons = ph >= go && ph < go + 2 ? BTN.force : 0;
  else if (d.cast === 'heavy') buttons = ph >= go && ph < go + 60 ? BTN.force : 0;
  else if (d.cast === 'special') buttons = ph >= go && ph < go + 2 ? BTN.area : 0;
  else if (d.cast === 'channel') buttons = ph >= go && ph < go + 140 ? BTN.area : 0; // a held Special (Siphon, Mend)
  else if (d.cast === 'retreat') buttons = ph >= go && ph < go + 2 ? BTN.weapon : 0;
  else if (d.cast === 'block') buttons = ph >= go && ph < go + 140 ? BTN.self : 0;
  else if (d.cast === 'guard') buttons = (ph >= go && ph < go + 2) || ph >= go + 30 ? BTN.weapon : 0;
  let [tx, ty] = d.at ?? TARGET[seat % 2];
  if (d.cast === 'drag' || d.cast === 'holddrag') tx += -2 + 4 * Math.min(1, Math.max(0, (ph - go) / 36));
  const dx = tx - w.bodies.x[seat], dy = ty - w.bodies.y[seat];
  return quantize({ buttons, press0, press1: 0, moveX: 0, moveY: 0, aimX: dx / AIM_UNIT, aimY: dy / AIM_UNIT });
}
