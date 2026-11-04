// Gamepad seat (standard mapping). The pure part (padStep) turns two pad
// snapshots into actions so it can be unit-tested without a browser.
//
//   Left stick move, right stick aim (reticle at a distance in the stick
//   direction; the last aim is kept when the stick is centred).
//   A B X Y = Water Life Shield Cold; hold LB for Lightning Arcane Earth Fire.
//   RT force (hold to channel)  LT area  RB self  LB+RT weapon  LB+LT point.
//   D-pad up Seal, D-pad down Release (hold to keep a released beam), Back clear.

import { add, fromAngle, type Vec2 } from '../core/vec2';
import type { Element } from '../spells/elements';
import type { CastMode } from '../spells/types';
import type { Entity } from '../world/entity';
import type { PlayerAction, PlayerController, PlayerIntent } from './controllers';

export interface PadState {
  buttons: boolean[];
  axes: number[];
}

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13 } as const;

const LAYER_1: Element[] = ['water', 'life', 'shield', 'cold'];
const LAYER_2: Element[] = ['lightning', 'arcane', 'earth', 'fire'];
const MOVE_DEADZONE = 0.22;
const AIM_DEADZONE = 0.3;
/** Aim reticle distance: 2.5 u with a light tilt, up to Point range at full tilt. */
const AIM_MIN = 2.5;
const AIM_MAX = 9;

export const PAD_MODE_LABELS: Record<CastMode, string> = { force: 'RT', area: 'LT', self: 'RB', weapon: 'LB+RT', point: 'LB+LT' };

/** Cast buttons and the mode they start (LB changes RT / LT). */
function castFor(button: number, layer: boolean): CastMode | null {
  if (button === BTN.RT) return layer ? 'weapon' : 'force';
  if (button === BTN.LT) return layer ? 'point' : 'area';
  if (button === BTN.RB) return 'self';
  return null;
}

const stick = (axes: number[], i: number, dead: number): Vec2 => {
  const v = { x: axes[i] ?? 0, y: axes[i + 1] ?? 0 };
  const l = Math.hypot(v.x, v.y);
  if (l < dead) return { x: 0, y: 0 };
  const k = Math.min(1, (l - dead) / (1 - dead)) / l;
  return { x: v.x * k, y: v.y * k };
};

export interface PadStep {
  move: Vec2;
  /** Aim offset from the wizard, or null when the right stick is centred. */
  aim: Vec2 | null;
  actions: PlayerAction[];
  /** Button that holds the current cast (channel), if any. */
  castButton: number | null;
}

/** Pure: actions from the buttons that went down between `prev` and `cur`. */
export function padStep(prev: PadState, cur: PadState, castButton: number | null): PadStep {
  const pressed = (b: number) => !!cur.buttons[b] && !prev.buttons[b];
  const layer = !!cur.buttons[BTN.LB];
  const actions: PlayerAction[] = [];
  [BTN.A, BTN.B, BTN.X, BTN.Y].forEach((b, i) => {
    if (pressed(b)) actions.push({ type: 'element', element: (layer ? LAYER_2 : LAYER_1)[i] });
  });
  if (pressed(BTN.BACK)) actions.push({ type: 'clear' });
  if (pressed(BTN.UP)) actions.push({ type: 'seal' });
  if (pressed(BTN.DOWN)) {
    actions.push({ type: 'release' });
    castButton = BTN.DOWN;
  }
  for (const b of [BTN.RT, BTN.LT, BTN.RB]) {
    const mode = pressed(b) ? castFor(b, layer) : null;
    if (mode) {
      actions.push({ type: 'cast', mode });
      castButton = b;
    }
  }
  const r = stick(cur.axes, 2, AIM_DEADZONE);
  const tilt = Math.hypot(r.x, r.y);
  const aim = tilt > 0 ? fromAngle(Math.atan2(r.y, r.x), AIM_MIN + (AIM_MAX - AIM_MIN) * tilt) : null;
  return { move: stick(cur.axes, 0, MOVE_DEADZONE), aim, actions, castButton };
}

export const anyPressed = (p: PadState | null) => !!p && p.buttons.some(Boolean);

/** Snapshot navigator.getGamepads()[i] (null outside a browser or when unplugged). */
export function readPad(i: number): PadState | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const g = navigator.getGamepads()[i];
  if (!g || !g.connected) return null;
  return { buttons: g.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...g.axes] };
}

export class GamepadController implements PlayerController {
  readonly label: string;
  readonly modeLabels = PAD_MODE_LABELS;
  readonly idleHint = 'A B X Y: Water Life Shield Cold   ·   hold LB: Lightning Arcane Earth Fire';
  readonly reticle = true;
  private prev: PadState;
  private castButton: number | null = null;
  /** Aim offset from the wizard; kept when the right stick is centred. */
  private aimOffset: Vec2 = { x: 3, y: 0 };

  constructor(
    readonly padIndex: number,
    private readonly read: (i: number) => PadState | null = readPad,
  ) {
    this.label = `Gamepad ${padIndex + 1}`;
    // The button that joined doesn't also count as a press.
    this.prev = read(padIndex) ?? { buttons: [], axes: [] };
  }

  poll(_input: unknown, self: Entity): PlayerIntent {
    const cur = this.read(this.padIndex) ?? { buttons: [], axes: [] };
    const s = padStep(this.prev, cur, this.castButton);
    this.prev = cur;
    this.castButton = s.castButton;
    if (s.aim) this.aimOffset = s.aim;
    const castHeld = this.castButton !== null && !!cur.buttons[this.castButton];
    return { move: s.move, aim: add(self.pos, this.aimOffset), actions: s.actions, castHeld };
  }
}
