/**
 * The battery: stepping up to a defence and casting from it (docs/campaign/01-opening, beats 4 to 6).
 *
 * While you drive a defence your body is moved to the muzzle, a point just outside the wall in front of the tower, so
 * every spell, the camera and whatever comes for you work from there unchanged. The client draws your wizard at the
 * pedestal you stepped up to (homeX, homeY). You can't be hurt or moved there, you can only turn the head so far, and
 * the pool on your bar is the defence's: Fire only. Your hands are put away.
 */
import { len } from './geom';
import { BTN, type PlayerInput } from './input';
import { RUNES } from './config';
import { EL, N_EL } from './elements';
import { atan2Turns, cosTurns, sinTurns } from './trig';
import { MAX_SEATS, PHASE, alive, type World } from './world';

export const BATTERY = {
  /** How near a pedestal you have to stand. */
  reach: 2.4,
  /** The wall's line, world y (tools/segments/01-opening/battery-level.py: WALL_Y). */
  wallY: -1,
  /** How far outside the wall's line the muzzle is: a body's radius and the wall's half-thickness, and a little. */
  muzzleGap: 0.9,
  /** The flamethrower's reach from there, against a wizard's 4.5. */
  sprayRange: 7.5,
  /** A defence's ring: a half-ring on the enemy's side. The wall hides about 4 units of ground behind it, so it has to reach past that. */
  ringRadius: 7,
  /** The head swings this far either way of straight out, in turns: 45 degrees. */
  swing: 0.125,
} as const;

const TOWER = 'defence-tower', PEDESTAL = 'control-pedestal';
const at = (w: World, asset: string) => w.def.props.filter((p) => p.asset === asset);

export const driving = (w: World, i: number): boolean => !!w.battery && i >= 0 && i < MAX_SEATS && w.battery.drive[i] >= 0;

/** The pedestal within reach of this seat that nobody is using, or -1. */
export function pedestalNear(w: World, i: number): number {
  if (!w.battery) return -1;
  const b = w.bodies, pads = at(w, PEDESTAL);
  let best = -1, bd: number = BATTERY.reach;
  for (let k = 0; k < pads.length; k++) {
    if (w.battery.drive.includes(k)) continue;
    const d = len(pads[k].x - b.x[i], pads[k].y - b.y[i]);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function clearHands(w: World, i: number): void {
  const s = w.seats;
  s.queueLen[i] = 0; s.phase[i] = PHASE.idle; s.timer[i] = 0; s.chanTicks[i] = 0; s.chanTimer[i] = 0; s.handT[i] = 0;
}

function takeDefence(w: World, i: number, k: number): void {
  const b = w.bodies, d = w.battery!, tower = at(w, TOWER)[k];
  d.drive[i] = k; d.homeX[i] = b.x[i]; d.homeY[i] = b.y[i];
  b.x[i] = tower.x; b.y[i] = BATTERY.wallY - BATTERY.muzzleGap; b.vx[i] = b.vy[i] = 0;
  clearHands(w, i);
  w.seats.runes.fill(0, i * N_EL, i * N_EL + N_EL);
  w.seats.runes[i * N_EL + EL.fire - 1] = RUNES.max.fire; // the defence's pool, full
}

function stepAway(w: World, i: number): void {
  const b = w.bodies, d = w.battery!;
  b.x[i] = d.homeX[i]; b.y[i] = d.homeY[i]; b.vx[i] = b.vy[i] = 0;
  d.drive[i] = -1;
  clearHands(w, i);
  w.seats.runes.fill(0, i * N_EL, i * N_EL + N_EL);
}

/** The Use button, on the press edge: step up to the nearest free defence, or step away from yours. Runs before the seats. */
export function batteryPress(w: World, inputs: readonly PlayerInput[]): void {
  const s = w.seats, d = w.battery!;
  for (let i = 0; i < MAX_SEATS; i++) {
    const inp = inputs[i];
    if (!inp || !s.active[i] || !alive(w, i) || !(inp.buttons & ~s.prevButtons[i] & BTN.use)) continue;
    if (d.drive[i] >= 0) { stepAway(w, i); continue; }
    const k = pedestalNear(w, i);
    if (k >= 0) takeDefence(w, i, k);
  }
}

/** What a seat's buttons do while driving: spells only. With nothing queued and nothing going, your hands stay put away. */
export function driveButtons(w: World, i: number, buttons: number): number {
  const s = w.seats;
  return s.queueLen[i] > 0 || s.phase[i] !== PHASE.idle ? buttons & (BTN.force | BTN.area | BTN.clear | BTN.use) : buttons & (BTN.clear | BTN.use);
}

/** The head turns on its collar and no further: the aim is kept within the swing either side of straight out from the wall. */
export function clampDriveAim(w: World, i: number): void {
  const s = w.seats, d = len(s.aimX[i], s.aimY[i]);
  if (d < 1e-6) { s.aimX[i] = 0; s.aimY[i] = -1; return; }
  let a = atan2Turns(s.aimX[i], -s.aimY[i]); // 0 is straight out, north; positive turns east
  if (a > 0.5) a -= 1;
  if (Math.abs(a) <= BATTERY.swing) return;
  const c = a < 0 ? -BATTERY.swing : BATTERY.swing;
  s.aimX[i] = sinTurns(c) * d; s.aimY[i] = -cosTurns(c) * d;
}
