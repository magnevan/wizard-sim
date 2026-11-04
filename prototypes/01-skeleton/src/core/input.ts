import type { Vec2 } from './vec2';

/** A discrete press, recorded in the exact order it happened. */
export type Press =
  | { kind: 'key'; code: string; shift: boolean; ctrl?: boolean } // KeyboardEvent.code
  | { kind: 'mouse'; button: number; shift: boolean; ctrl?: boolean }; // 0 left, 1 middle, 2 right, 3 back (mouse 4)

/**
 * What the simulation sees for one tick. Presses are buffered between ticks
 * and handed out exactly once, in order, so no press is ever dropped or
 * reordered, even when a frame runs zero or several sim ticks.
 */
export interface InputSnapshot {
  presses: readonly Press[];
  keysDown: ReadonlySet<string>;
  buttonsDown: ReadonlySet<number>;
  shift: boolean;
  mouseScreen: Vec2; // CSS pixels relative to the canvas
  wheel: number; // accumulated wheel delta since last snapshot
}

export const keyPresses = (s: InputSnapshot): string[] =>
  s.presses.flatMap((p) => (p.kind === 'key' ? [p.code] : []));

/** Keys whose browser default we always suppress (scrolling, help, find...). */
const SUPPRESS = new Set(['Space', 'F1', 'F2', 'Tab', 'Backquote', 'ArrowUp', 'ArrowDown']);

/** Raw keyboard + mouse state. No game semantics live here. */
export class Input {
  private presses: Press[] = [];
  private keysDown = new Set<string>();
  private buttonsDown = new Set<number>();
  private shift = false;
  private mouse: Vec2 = { x: 0, y: 0 };
  private wheel = 0;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (SUPPRESS.has(e.code)) e.preventDefault();
      this.shift = e.shiftKey;
      if (!e.repeat) this.presses.push({ kind: 'key', code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey });
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      this.keysDown.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.buttonsDown.clear();
      this.shift = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // also stops middle-click autoscroll
      this.trackMouse(e);
      this.shift = e.shiftKey;
      this.buttonsDown.add(e.button);
      this.presses.push({ kind: 'mouse', button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey });
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 3 || e.button === 4) e.preventDefault(); // side buttons: no browser back/forward
      this.buttonsDown.delete(e.button);
    });
    el.addEventListener('auxclick', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.trackMouse(e);
      this.shift = e.shiftKey;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY;
      },
      { passive: false },
    );
  }

  private trackMouse(e: MouseEvent): void {
    const r = this.el.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Hand out buffered presses (once) plus current held state. */
  consume(): InputSnapshot {
    const snap: InputSnapshot = {
      presses: this.presses,
      keysDown: new Set(this.keysDown),
      buttonsDown: new Set(this.buttonsDown),
      shift: this.shift,
      mouseScreen: { ...this.mouse },
      wheel: this.wheel,
    };
    this.presses = [];
    this.wheel = 0;
    return snap;
  }
}
