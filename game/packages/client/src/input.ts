/**
 * Keyboard and mouse -> PlayerInput, once per sim tick. Element presses are buffered in order
 * (no press is ever lost between ticks); held buttons are sampled. Gamepads come in milestone 1
 * (port the skeleton's padStep).
 *
 * Bindings follow the skeleton and the Atlas: hold LMB to walk toward the cursor; RMB Force (hold to
 * channel or charge); Shift+RMB Area (tap) or Place (hold, drag to draw); Space Self; Shift+LMB Weapon;
 * element keys from the rules (Q W E R / A S D F G); Esc clears the queue.
 */
import { rules, type Element } from '@wizard-sim/rules';
import { AIM_UNIT, BTN, elementId, quantize, type PlayerInput, type World } from '@wizard-sim/sim';
import type { Camera } from './camera';

export class KeyboardMouse {
  private presses: number[] = [];
  private held = 0;
  private walking = false;
  private sx = 0;
  private sy = 0;
  private keyToElement = new Map<string, number>();

  constructor(target: HTMLElement, private camera: Camera) {
    for (const el of rules.BASE) this.keyToElement.set('Key' + rules.ELEMENTS[el as Element].key, elementId(el));
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const id = this.keyToElement.get(e.code);
      if (id) this.presses.push(id);
      if (e.code === 'Escape') this.held |= BTN.clear;
      if (e.code === 'Space') this.held |= BTN.self;
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Escape') this.held &= ~BTN.clear;
      if (e.code === 'Space') this.held &= ~BTN.self;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointermove', (e) => { this.sx = e.clientX; this.sy = e.clientY; });
    target.addEventListener('pointerdown', (e) => {
      this.sx = e.clientX; this.sy = e.clientY;
      if (e.button === 0) { if (e.shiftKey) this.held |= BTN.weapon; else this.walking = true; }
      if (e.button === 2) this.held |= e.shiftKey ? BTN.area : BTN.force;
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 0) { this.walking = false; this.held &= ~BTN.weapon; }
      if (e.button === 2) this.held &= ~(BTN.force | BTN.area);
    });
    addEventListener('blur', () => { this.walking = false; this.held = 0; });
  }

  /** The input for the next tick for the wizard in `seat`. */
  sample(w: World, seat: number): PlayerInput {
    const p = this.camera.screenToWorld(this.sx, this.sy);
    const dx = p.x - w.bodies.x[seat], dy = p.y - w.bodies.y[seat];
    const len = Math.hypot(dx, dy);
    const walk = this.walking && len > 0.3;
    const input = quantize({
      buttons: this.held,
      press0: this.presses.shift() ?? 0,
      press1: this.presses.shift() ?? 0,
      moveX: walk ? (dx / len) * 127 : 0,
      moveY: walk ? (dy / len) * 127 : 0,
      aimX: dx / AIM_UNIT,
      aimY: dy / AIM_UNIT,
    });
    return input;
  }
}
