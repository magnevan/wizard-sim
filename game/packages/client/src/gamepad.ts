/**
 * Gamepads -> PlayerInput (standard mapping), ported from the skeleton. The pure part (padStep)
 * turns two pad snapshots into one tick of input, so it is tested without a browser.
 *
 *   Left stick walk, right stick aim (the reticle sits in the stick's direction, further with more
 *   tilt; the last aim is kept when the stick is centred).
 *   A B X Y = Water Life Shield Cold. Hold LB for Lightning Arcane Sigil Fire (the keys' second row).
 *   Earth: LB + RB, or D-pad down.
 *   RT Force (hold to channel or charge). LT Area (tap) or Place (hold). RB Self. LB + RT Weapon.
 *   Back clears the queue. Any button on an unseated pad joins the next free seat.
 */
import { AIM_UNIT, BTN, elementId, quantize, type PlayerInput } from '@wizard-sim/sim';
import type { Element } from '@wizard-sim/rules';

export interface PadState { buttons: boolean[]; axes: number[] }

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13 } as const;

const LAYER_1: Element[] = ['water', 'life', 'shield', 'cold'];
const LAYER_2: Element[] = ['lightning', 'arcane', 'sigil', 'fire'];
const MOVE_DEADZONE = 0.22, AIM_DEADZONE = 0.3;
/** Aim reticle distance: 2.5 u at a light tilt, up to the Place range at full tilt. */
const AIM_MIN = 2.5, AIM_MAX = 9;

function stick(axes: number[], i: number, dead: number): [number, number] {
  const x = axes[i] ?? 0, y = axes[i + 1] ?? 0, l = Math.hypot(x, y);
  if (l < dead) return [0, 0];
  const k = Math.min(1, (l - dead) / (1 - dead)) / l;
  return [x * k, y * k];
}

export interface PadMemory {
  prev: PadState;
  /** Aim offset from the wizard in world units, kept when the right stick is centred. */
  aimX: number; aimY: number;
}

/** Pure: one tick of input from the previous and current pad snapshots. */
export function padStep(mem: PadMemory, cur: PadState): PlayerInput {
  const down = (b: number) => !!cur.buttons[b];
  const pressed = (b: number) => down(b) && !mem.prev.buttons[b];
  const layer = down(PAD.LB);
  const presses: number[] = [];
  [PAD.A, PAD.B, PAD.X, PAD.Y].forEach((b, i) => { if (pressed(b)) presses.push(elementId((layer ? LAYER_2 : LAYER_1)[i])); });
  if ((layer && pressed(PAD.RB)) || pressed(PAD.DOWN)) presses.push(elementId('earth'));

  let buttons = 0;
  if (down(PAD.RT)) buttons |= layer ? BTN.weapon : BTN.force;
  if (down(PAD.LT)) buttons |= BTN.area;
  if (down(PAD.RB) && !layer) buttons |= BTN.self;
  if (down(PAD.BACK)) buttons |= BTN.clear;

  const [rx, ry] = stick(cur.axes, 2, AIM_DEADZONE);
  const tilt = Math.hypot(rx, ry);
  if (tilt > 0) { const d = AIM_MIN + (AIM_MAX - AIM_MIN) * Math.min(1, tilt); mem.aimX = (rx / tilt) * d; mem.aimY = (ry / tilt) * d; }
  const [mx, my] = stick(cur.axes, 0, MOVE_DEADZONE);
  mem.prev = cur;
  return quantize({ buttons, press0: presses[0] ?? 0, press1: presses[1] ?? 0, moveX: mx * 127, moveY: my * 127, aimX: mem.aimX / AIM_UNIT, aimY: mem.aimY / AIM_UNIT });
}

export const anyPressed = (p: PadState | null): boolean => !!p && p.buttons.some(Boolean);

/** Snapshot navigator.getGamepads()[i] (null when unplugged). */
export function readPad(i: number): PadState | null {
  const g = navigator.getGamepads?.()[i];
  if (!g || !g.connected) return null;
  return { buttons: g.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...g.axes] };
}

/**
 * Local co-op seats for gamepads. Keyboard and mouse is seat 0; pads take seats 1-3 in the order
 * they press a button. A pad's first tick in a seat sends BTN.join, which is what makes the sim
 * spawn its wizard (on the same tick for every peer, once this goes online).
 */
export class PadSeats {
  /** seat -> pad index */
  private padOf = new Map<number, number>();
  private mem = new Map<number, PadMemory>();
  private joining = new Set<number>();

  constructor(private readonly read: (i: number) => PadState | null = readPad) {}

  /** Call once per tick: seats a pad that pressed something, if a seat is free. */
  poll(activeSeats: (seat: number) => boolean): void {
    for (let pad = 0; pad < 4; pad++) {
      if ([...this.padOf.values()].includes(pad)) continue;
      const st = this.read(pad);
      if (!anyPressed(st)) continue;
      for (let seat = 1; seat < 4; seat++) {
        if (activeSeats(seat) || this.padOf.has(seat)) continue;
        this.padOf.set(seat, pad);
        this.mem.set(seat, { prev: st!, aimX: 3, aimY: 0 }); // the joining press doesn't also cast
        this.joining.add(seat);
        break;
      }
    }
  }

  has(seat: number): boolean { return this.padOf.has(seat); }

  sample(seat: number): PlayerInput | null {
    const pad = this.padOf.get(seat);
    if (pad === undefined) return null;
    const cur = this.read(pad) ?? { buttons: [], axes: [] };
    const input = padStep(this.mem.get(seat)!, cur);
    if (this.joining.delete(seat)) return { ...input, buttons: input.buttons | BTN.join };
    return input;
  }
}
