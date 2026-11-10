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
  /** The flamethrower's reach from there where a unit is widest on screen, against a wizard's 4.5. */
  sprayRange: 7.5,
  /** Its reach where the screen squashes it most. */
  sprayMax: 12,
  /** A placed spell's reach, from the same point. */
  placeRange: 18,
  /** How far outside the wall's line a placed spell has to land. */
  placeClear: 1,
  /** A defence's ring: a half-ring on the enemy's side. The wall hides about 4 units of ground behind it, so it has to reach past that. */
  ringRadius: 7,
  /** The head swings this far either way of straight out, in turns: 80 degrees, nearly along the wall. */
  swing: 0.222,
  /**
   * How high the barrel is over the tower's spot, as a distance down the screen in world units: about 60 art px at 8 px
   * a unit up the screen (the head sheet's swivel at 50 px and the barrel 9.6 above it, tools/turret-3d, art/props.ts).
   */
  barrelLift: 7.45,
} as const;

/** Straight out from the wall, north, as a facing in turns. */
const STRAIGHT_OUT = 0.75;
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

/**
 * The way a driven defence's head points, as a ground direction from its tower (not normalized).
 *
 * The aim is measured from the body at the muzzle, about 4 units further out, so it's moved back onto the tower. And
 * the barrel runs high over the tower, so for it to point at the cursor on the screen it aims at the ground under the
 * cursor as if the cursor were at the barrel's height: that spot is `barrelLift` further down the screen. Down the
 * screen is world (1, 1) under the camera's 45-degree turn (as in sprayReach). The client turns the drawn head by the
 * art itself (art/props.ts), which this matches to within a few degrees; the drawn jet bends to cover the rest.
 */
export function aimFromTower(w: World, i: number): [number, number] {
  const s = w.seats, b = w.bodies, tower = at(w, TOWER)[w.battery!.drive[i]], d = Math.SQRT1_2 * BATTERY.barrelLift;
  return [b.x[i] + s.aimX[i] - tower.x + d, b.y[i] + s.aimY[i] - tower.y + d];
}

/** The way the head points, in turns: from the tower at the cursor, and no further round than the swing either side of straight out from the wall. */
export function driveFace(w: World, i: number): number {
  const [ax, ay] = aimFromTower(w, i);
  if (len(ax, ay) < 1e-6) return STRAIGHT_OUT;
  let a = atan2Turns(ax, -ay); // 0 is straight out, north; positive turns east
  if (a > 0.5) a -= 1;
  return STRAIGHT_OUT + Math.max(-BATTERY.swing, Math.min(BATTERY.swing, a));
}

/**
 * A driven defence's flamethrower: the way it goes from the muzzle (your body) and how far.
 *
 * It's drawn from the head as a straight jet along the barrel, so it does its work along that line too: it lands at
 * the barrel's line at its reach (measured from the tower, plus the muzzle's distance out along the barrel), and the
 * spray runs from the muzzle to there. The muzzle is outside the wall, so a jet aimed far enough round that its line
 * stays inside the wall runs from the muzzle back into the wall, and the wall stops it: the drawn jet stays inside too.
 */
export function driveSpray(w: World, i: number): { face: number; range: number } {
  const b = w.bodies, tower = at(w, TOWER)[w.battery!.drive[i]], f = driveFace(w, i), dx = cosTurns(f), dy = sinTurns(f);
  const out = (b.x[i] - tower.x) * dx + (b.y[i] - tower.y) * dy, d = out + sprayReach(dx, dy);
  const lx = tower.x + dx * d - b.x[i], ly = tower.y + dy * d - b.y[i];
  return { face: atan2Turns(ly, lx), range: len(lx, ly) };
}

/**
 * How far a defence's flamethrower reaches along (dx, dy). The camera squashes the ground 2:1 and is turned 45 degrees, so a
 * unit up the screen is half the pixels of one across it. Reach is set by how long the flame looks, up to a limit.
 */
export function sprayReach(dx: number, dy: number): number {
  const across = dx - dy, along = dx + dy;
  const onScreen = Math.sqrt(0.5 * across * across + 0.125 * along * along);
  return Math.min(BATTERY.sprayMax, BATTERY.sprayRange / Math.max(0.1, onScreen));
}

/** Where a defence's placed spell lands: the aim point on the enemy's side of the wall, within its own range. */
export function driveTarget(w: World, i: number): [number, number] {
  const s = w.seats, b = w.bodies, d = len(s.aimX[i], s.aimY[i]), k = d > BATTERY.placeRange ? BATTERY.placeRange / d : 1;
  return [b.x[i] + s.aimX[i] * k, Math.min(BATTERY.wallY - BATTERY.placeClear, b.y[i] + s.aimY[i] * k)];
}
