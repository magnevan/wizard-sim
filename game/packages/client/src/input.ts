/**
 * Keyboard and mouse -> PlayerInput, once per sim tick. Element presses are buffered in order
 * (no press is ever lost between ticks); held buttons are sampled. Gamepads are gamepad.ts.
 *
 * Bindings follow the skeleton and the Atlas: hold LMB to walk toward the cursor; RMB Force (hold to
 * channel or charge); Shift+RMB Area (tap) or Place (hold, drag to draw); Space Self; Shift+LMB Weapon; X Use;
 * element keys from the rules (Q W E R / A S D F G); Esc clears the queue. With an empty queue Esc
 * opens the menu instead: menu.ts catches that press before it gets here (menu-nav.ts escAction).
 */
import { rules, type Element } from '@wizard-sim/rules';
import { AIM_UNIT, BTN, elementId, quantize, type PlayerInput, type World } from '@wizard-sim/sim';
import type { Camera } from './camera';

export class KeyboardMouse {
  private presses: number[] = [];
  private held = 0;
  /** Esc went down since the last sample: a tap shorter than a tick still clears the queue. */
  private tapClear = false;
  private walking = false;
  /** Mouse buttons down that started on the game (PointerEvent.buttons bits: 1 LMB, 2 RMB). */
  private mouse = 0;
  private sx = 0;
  private sy = 0;
  /** Use was tapped since the last tick: a tap between two ticks still counts. */
  private tapUse = false;
  private keyToElement = new Map<string, number>();

  constructor(target: HTMLElement, private camera: Camera) {
    for (const el of rules.BASE) this.keyToElement.set('Key' + rules.ELEMENTS[el as Element].key, elementId(el));
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const id = this.keyToElement.get(e.code);
      if (id) this.presses.push(id);
      if (e.code === 'Escape') { this.held |= BTN.clear; this.tapClear = true; }
      if (e.code === 'Space') this.held |= BTN.self;
      if (e.code === 'KeyX') { this.held |= BTN.use; this.tapUse = true; }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Escape') this.held &= ~BTN.clear;
      if (e.code === 'Space') this.held &= ~BTN.self;
      if (e.code === 'KeyX') this.held &= ~BTN.use;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointermove', (e) => { this.sx = e.clientX; this.sy = e.clientY; });
    // A second button pressed while one is held fires no pointerdown, only a pointermove with new
    // buttons (a chord), so walking and casting at once go through the buttons mask.
    target.addEventListener('pointerdown', (e) => { this.sx = e.clientX; this.sy = e.clientY; this.sync(e); });
    addEventListener('pointermove', (e) => { if (this.mouse) this.sync(e); });
    addEventListener('pointerup', (e) => this.sync(e));
    addEventListener('blur', () => { this.walking = false; this.held = 0; this.mouse = 0; });
  }

  /** Let go of everything (the menu opened over the game): no button stays held, no walk, no queued press. */
  release(): void { this.walking = false; this.held = 0; this.mouse = 0; this.presses.length = 0; this.tapClear = false; this.tapUse = false; }

  /** Mouse buttons that went down or up since the last event. */
  private sync(e: PointerEvent): void {
    const now = e.buttons & 3, down = now & ~this.mouse, up = this.mouse & ~now;
    this.mouse = now;
    if (down & 1) { if (e.shiftKey) this.held |= BTN.weapon; else this.walking = true; }
    if (down & 2) this.held |= e.shiftKey ? BTN.area : BTN.force;
    if (up & 1) { this.walking = false; this.held &= ~BTN.weapon; }
    if (up & 2) this.held &= ~(BTN.force | BTN.area);
  }

  /** The input for the next tick for the wizard in `seat`. */
  sample(w: World, seat: number): PlayerInput {
    const p = this.camera.screenToWorld(this.sx, this.sy);
    const dx = p.x - w.bodies.x[seat], dy = p.y - w.bodies.y[seat];
    const len = Math.hypot(dx, dy);
    const walk = this.walking && len > 0.3;
    const input = quantize({
      buttons: this.held | (this.tapClear ? BTN.clear : 0) | (this.tapUse ? BTN.use : 0),
      press0: this.presses.shift() ?? 0,
      press1: this.presses.shift() ?? 0,
      moveX: walk ? (dx / len) * 127 : 0,
      moveY: walk ? (dy / len) * 127 : 0,
      aimX: dx / AIM_UNIT,
      aimY: dy / AIM_UNIT,
    });
    this.tapClear = false; this.tapUse = false;
    return input;
  }
}
