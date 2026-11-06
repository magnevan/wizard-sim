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
import { AI, AIM_UNIT, ARCH, ARCHETYPES, BTN, KIND, MAX_SEATS, EL, PHASE_ENC, PU, chooseElement, devSpawnEnemy, elementId, grant, quantize, raiseAltars, type PlayerInput, type World } from '@wizard-sim/sim';

/**
 * ?room=survive&scene=rally (with the headless loop, e.g. the screenshot script): mid-wave, P2 is
 * down and P1 (everyone can rally), holding Echo (the strip says so), stands beside them; a goblin
 * and a brute close in. Nobody presses anything, so the ring fills and P2 gets up after
 * PERKS.rallyTime unless a hit lands first.
 */
export function rallyScene(w: World): void {
  if (!w.run) return;
  const b = w.bodies, e = w.enc;
  b.x[0] = -0.5; b.y[0] = 0.4; b.face[0] = 0;
  b.x[1] = 0.7; b.y[1] = 0.9; b.hp[1] = 0; b.downed[1] = 1;
  grant(w, 0, PU.echo);
  e.state[0] = PHASE_ENC.wave; e.state[1] = 6; e.state[2] = 0; e.left.fill(0); e.total.fill(0);
  devSpawnEnemy(w, ARCH.swarmer, 8, -3);
  devSpawnEnemy(w, ARCH.brute, -9, 5);
}

/**
 * ?room=survive&scene=three (headless): the pick, with P1 on "+1 to three" having tapped Fire, and
 * a few pools drained so the HUD's regen flow shows (the emptiest pools glow brightest).
 */
export function threeScene(w: World): void {
  if (!w.run) return;
  const e = w.enc;
  e.state[0] = PHASE_ENC.pick; e.state[1] = 2; e.state[2] = 0;
  raiseAltars(w);
  w.run.picked[0] = 0; grant(w, 0, PU.three); chooseElement(w, 0, EL.fire);
  w.seats.runes[EL.cold - 1] = 0.3; w.seats.runes[EL.earth - 1] = 1.4; w.seats.runes[EL.life - 1] = 0.8;
}

/**
 * ?scene=enemyattacks (with a headless loop, e.g. the screenshot script): every enemy in a row,
 * frozen at one beat of its attack, the sim not stepping. &phase= picks the beat:
 *   wind (default: 75% through the wind-up, the telegraph pose), strike (the blow just landed: smears,
 *   flames, sparks), impact (a few ticks later), recover (halfway back to rest), loop (each one
 *   cycles wind-up, strike, recovery on real time, out of step with the others).
 * &face= the facing in turns (0 = east, 0.25 = toward the camera; default 0.06).
 * Seat 0 is the grabber's victim (held, from strike on); seat 1 stands in the middle.
 * The view reads ai / aiT / lockX / lockY / holding exactly as in play (art/enemy-attacks.ts).
 */
const SCENE_ROW: [number, number, number][] = [
  [ARCH.swarmer, -4.6, -3.4], [ARCH.brute, -0.6, -3.6], [ARCH.shieldbearer, 4.4, -3.4],
  [ARCH.caster, -5, 0], [ARCH.imp, -1, 0], [ARCH.grabber, 2.4, 0],
];
let sceneBuilt = false;
export function enemyAttackScene(w: World, phase: string, face: number, now: number): void {
  const b = w.bodies;
  if (!sceneBuilt) {
    sceneBuilt = true;
    for (let i = MAX_SEATS; i < b.kind.length; i++) b.kind[i] = KIND.none;
    for (const [arch, x, y] of SCENE_ROW) {
      // three goblins (club, dagger, spear: the variant is the slot's index mod 3)
      if (arch === ARCH.swarmer) { devSpawnEnemy(w, arch, x - 1.4, y + 0.4); devSpawnEnemy(w, arch, x + 0.6, y - 1.2); devSpawnEnemy(w, arch, x + 0.8, y + 1.3); }
      else devSpawnEnemy(w, arch, x, y);
    }
    b.x[1] = -8; b.y[1] = -1.6; b.face[1] = 0.25;
  }
  for (let i = MAX_SEATS; i < b.kind.length; i++) {
    if (b.kind[i] !== KIND.enemy) continue;
    const a = ARCHETYPES[b.arch[i]], W = Math.round(a.windup * 60);
    b.face[i] = face; b.target[i] = 1;
    const reach = a.slamRadius ? 2.6 : a.bolt ? 8 : a.grab ? 2.5 : 1;
    b.lockX[i] = b.x[i] + Math.cos(face * 6.283185307179586) * reach; b.lockY[i] = b.y[i] + Math.sin(face * 6.283185307179586) * reach;
    // which beat: a tick count into the cycle (the wind-up, then the cooldown from the strike, then a rest)
    const cyc = W + 90 + 40;
    const tk = phase === 'loop' ? Math.floor((now * 60) / 1000 + i * 23) % cyc : phase === 'strike' ? W : phase === 'impact' ? W + 5 : phase === 'recover' ? W + 24 : Math.round(W * 0.75);
    const grabber = b.arch[i] === ARCH.grabber;
    if (grabber && b.holding[i] >= 0) { b.heldBy[b.holding[i]] = -1; b.holding[i] = -1; }
    if (tk < W) { b.ai[i] = AI.windup; b.aiT[i] = tk; }
    else if (grabber && tk < W + 70) {
      // the grabber: the dash, then the hold (seat 0 in its claws, the timer ring closing)
      if (phase === 'strike' || (phase === 'loop' && tk < W + 12)) { b.ai[i] = AI.dash; b.aiT[i] = tk - W; }
      else { b.ai[i] = AI.grab; b.aiT[i] = phase === 'loop' ? (tk - W - 12) * 3 : 80; b.holding[i] = 0; b.heldBy[0] = i; }
    } else if (tk < W + 90) { b.ai[i] = AI.cooldown; b.aiT[i] = tk - W; }
    else { b.ai[i] = AI.approach; b.aiT[i] = 0; }
    if (grabber) {
      const held = b.holding[i] >= 0;
      b.x[0] = held ? b.x[i] + 0.95 : b.x[i] + 2.6; b.y[0] = b.y[i]; b.face[0] = 0.5;
    }
  }
}

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
/** Ticks per demo cycle (the help panel's previews loop on it too). */
export const PERIOD = 170;
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
