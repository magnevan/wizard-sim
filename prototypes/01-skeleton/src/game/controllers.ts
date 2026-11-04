// Controllers turn a device (or a script) into a PlayerIntent. The sim only
// ever sees intents, so adding a gamepad player is a new controller class.

import { PLAYER } from '../config';
import type { InputSnapshot } from '../core/input';
import { dist, normalize, sub, type Vec2 } from '../core/vec2';
import { ELEMENTS, TYPEABLE_ELEMENTS, type Element } from '../spells/elements';
import type { CastMode } from '../spells/types';
import type { Camera } from '../render/camera';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';

/** Discrete actions, in the order the player performed them. */
export type PlayerAction =
  | { type: 'element'; element: Element }
  | { type: 'clear' }
  | { type: 'cast'; mode: CastMode }
  /** Toggle Seal: the next cast goes into a vessel. */
  | { type: 'seal' }
  /** Set off every sealed spell (and shatter own walls). */
  | { type: 'release' };

export interface PlayerIntent {
  /** Walk direction, length 0..1. */
  move: Vec2;
  /** World-space aim point, or null to keep the previous one. */
  aim: Vec2 | null;
  actions: PlayerAction[];
  /** The button that started the current cast is still held (channels beams/sprays). */
  castHeld: boolean;
}

export interface PlayerController {
  readonly label: string;
  /** HUD: button names per cast mode, the empty-queue hint, a drawn aim reticle. */
  readonly modeLabels?: Record<CastMode, string>;
  readonly idleHint?: string;
  readonly reticle?: boolean;
  poll(input: InputSnapshot, self: Entity, world: World): PlayerIntent;
}

export const IDLE_INTENT: PlayerIntent = { move: { x: 0, y: 0 }, aim: null, actions: [], castHeld: false };

export interface KeyboardMouseBindings {
  /** KeyboardEvent.code -> element. */
  elements: Record<string, Element>;
  clearQueue: string[];
  selfCast: string[];
  pointCast: string[];
  /** Provisional Seal / Release keys (Proposal A open question 2). */
  seal: string[];
  release: string[];
}

export function defaultKeyboardBindings(): KeyboardMouseBindings {
  const elements: Record<string, Element> = {};
  for (const e of TYPEABLE_ELEMENTS) elements[ELEMENTS[e].key!] = e;
  return { elements, clearQueue: ['Escape'], selfCast: ['Space'], pointCast: ['KeyG'], seal: ['KeyC'], release: ['KeyV'] };
}

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;
/** Mouse button 4 ("back"). */
const SIDE = 3;

/**
 * Magicka-style mouse + keyboard:
 * hold LMB walk to cursor, RMB force (hold to channel), Shift+RMB area,
 * MMB/Space self, Shift+LMB weapon; elements on QWER/ASDF.
 * Proposal A: Ctrl+RMB / mouse 4 / G point cast at the cursor; C arms Seal, V releases.
 */
export const KEYBOARD_MODE_LABELS: Record<CastMode, string> = { force: 'RMB', area: 'Shift+RMB', self: 'Space', weapon: 'Shift+LMB', point: 'Ctrl+RMB/G' };

export class KeyboardMouseController implements PlayerController {
  readonly label = 'Keyboard + mouse';
  readonly modeLabels = KEYBOARD_MODE_LABELS;
  /** What is holding the current cast: a mouse button number or a key code. */
  private castSource: number | string | null = null;
  private weaponHeld = false;

  constructor(
    private readonly camera: Camera,
    private readonly bindings: KeyboardMouseBindings = defaultKeyboardBindings(),
  ) {}

  poll(input: InputSnapshot, self: Entity): PlayerIntent {
    const aim = this.camera.screenToWorld(input.mouseScreen);
    const actions: PlayerAction[] = [];

    for (const p of input.presses) {
      if (p.kind === 'key') {
        const el = this.bindings.elements[p.code];
        if (el) actions.push({ type: 'element', element: el });
        else if (this.bindings.clearQueue.includes(p.code)) actions.push({ type: 'clear' });
        else if (this.bindings.selfCast.includes(p.code)) this.cast(actions, 'self', p.code);
        else if (this.bindings.pointCast.includes(p.code)) this.cast(actions, 'point', p.code);
        else if (this.bindings.seal.includes(p.code)) actions.push({ type: 'seal' });
        else if (this.bindings.release.includes(p.code)) {
          // Holding Release keeps a released beam / spray going.
          actions.push({ type: 'release' });
          this.castSource = p.code;
        }
      } else if (p.button === RIGHT) {
        this.cast(actions, p.ctrl ? 'point' : p.shift ? 'area' : 'force', RIGHT);
      } else if (p.button === SIDE) {
        this.cast(actions, 'point', SIDE);
      } else if (p.button === MIDDLE) {
        this.cast(actions, 'self', MIDDLE);
      } else if (p.button === LEFT && p.shift) {
        this.cast(actions, 'weapon', LEFT);
        this.weaponHeld = true;
      }
    }

    const src = this.castSource;
    const castHeld = typeof src === 'number' ? input.buttonsDown.has(src) : src !== null && input.keysDown.has(src);
    if (!input.buttonsDown.has(LEFT)) this.weaponHeld = false;

    // LMB walks toward the cursor, unless that press was a weapon swing.
    let move: Vec2 = { x: 0, y: 0 };
    if (input.buttonsDown.has(LEFT) && !this.weaponHeld && dist(aim, self.pos) > PLAYER.moveDeadzone) {
      move = normalize(sub(aim, self.pos));
    }
    return { move, aim, actions, castHeld };
  }

  private cast(actions: PlayerAction[], mode: CastMode, source: number | string): void {
    actions.push({ type: 'cast', mode });
    this.castSource = source;
  }
}

export { GamepadController } from './gamepad';
