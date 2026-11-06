/**
 * The Esc menu's rules, without any DOM: what Esc does, how focus moves, and which gamepad presses
 * mean what. menu.ts draws and wires them; test/menu.test.ts checks them.
 */
import { PAD, type PadState } from './gamepad';
import { scenarioForKey, type Scenario } from './scenarios';

export type EscAction = 'clear' | 'open' | 'close';

/**
 * Esc: an open menu closes; runes in the queue are cleared (refunded), as Esc always did; with an
 * empty queue it opens the menu. So a player mid-spell never loses the spell to a menu, and two
 * presses from anywhere reach the menu.
 */
export function escAction(menuOpen: boolean, queued: number): EscAction {
  if (menuOpen) return 'close';
  return queued > 0 ? 'clear' : 'open';
}

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

/** Where the cursor is: on the section tabs (left column) or on an item of the open section. */
export interface NavState { section: number; focus: 'tabs' | 'items'; item: number }

export interface NavItem {
  enabled: boolean;
  /** Left / right change its value (settings) instead of going back to the tabs. */
  adjustable?: boolean;
}

export type NavResult =
  | { kind: 'none' }
  | { kind: 'close' }
  /** Select on a tab without items (Resume). */
  | { kind: 'tab' }
  | { kind: 'activate'; item: number }
  | { kind: 'adjust'; item: number; by: -1 | 1 };

const firstEnabled = (items: readonly NavItem[], from = 0, dir = 1): number => {
  for (let i = from; i >= 0 && i < items.length; i += dir) if (items[i].enabled) return i;
  return -1;
};

/** One key's worth of movement. `items` are the open section's items. Mutates `st`. */
export function navigate(st: NavState, key: NavKey, sections: number, items: readonly NavItem[]): NavResult {
  if (st.focus === 'tabs') {
    if (key === 'up') st.section = (st.section + sections - 1) % sections;
    else if (key === 'down') st.section = (st.section + 1) % sections;
    else if (key === 'back') return { kind: 'close' };
    else if (key === 'right' || key === 'select') {
      const i = firstEnabled(items);
      if (i >= 0) { st.focus = 'items'; st.item = i; return { kind: 'none' }; }
      if (key === 'select') return { kind: 'tab' };
    }
    return { kind: 'none' };
  }
  // on the items
  if (!items[st.item]?.enabled) { const i = firstEnabled(items); if (i < 0) { st.focus = 'tabs'; return { kind: 'none' }; } st.item = i; }
  if (key === 'up' || key === 'down') {
    const dir = key === 'up' ? -1 : 1, i = firstEnabled(items, st.item + dir, dir);
    if (i >= 0) st.item = i;
    return { kind: 'none' };
  }
  if ((key === 'left' || key === 'right') && items[st.item].adjustable) return { kind: 'adjust', item: st.item, by: key === 'left' ? -1 : 1 };
  if (key === 'left' || key === 'back') { st.focus = 'tabs'; return { kind: 'none' }; }
  if (key === 'select') return { kind: 'activate', item: st.item };
  return { kind: 'none' };
}

/** Keyboard codes the menu moves on (WASD too: you're already holding them). */
export function keyToNav(code: string): NavKey | null {
  switch (code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Enter': case 'NumpadEnter': case 'Space': return 'select';
    case 'Backspace': return 'back';
    default: return null;
  }
}

/**
 * The number keys while the menu is open: the scenario they name (as they do in the game), unless
 * a room code is being typed or the match is online (there only the host switches, from the list).
 */
export function menuScenarioKey(code: string, typing: boolean, online: boolean): Scenario | undefined {
  return typing || online ? undefined : scenarioForKey(code);
}

/**
 * D-pad up toggles the help panel for that pad's seat (help-panel.ts): the pads whose D-pad up went
 * down since the last poll. While the Esc menu is open the D-pad moves the menu instead, so none.
 */
export function helpPadPresses(prev: readonly boolean[], down: readonly boolean[], menuOpen: boolean): number[] {
  if (menuOpen) return [];
  const out: number[] = [];
  for (let p = 0; p < down.length; p++) if (down[p] && !prev[p]) out.push(p);
  return out;
}

const D_LEFT = 14, D_RIGHT = 15;
const STICK = 0.6;

/**
 * Pure: the menu presses between two snapshots of one pad. 'menu' is Start (Options on a
 * DualShock / DualSense, Menu on an Xbox pad), which opens and closes the menu. A and B are select
 * and back; the D-pad and the left stick move.
 */
export function padMenuKeys(prev: PadState | null, cur: PadState): (NavKey | 'menu')[] {
  const was = (b: number) => !!prev?.buttons[b], is = (b: number) => !!cur.buttons[b];
  const edge = (b: number) => is(b) && !was(b);
  const out: (NavKey | 'menu')[] = [];
  if (edge(PAD.START)) out.push('menu');
  if (edge(PAD.A)) out.push('select');
  if (edge(PAD.B)) out.push('back');
  const ax = (s: PadState | null, i: number) => s?.axes[i] ?? 0;
  const dir = (s: PadState | null): [boolean, boolean, boolean, boolean] => [
    !!s?.buttons[PAD.UP] || ax(s, 1) < -STICK, !!s?.buttons[PAD.DOWN] || ax(s, 1) > STICK,
    !!s?.buttons[D_LEFT] || ax(s, 0) < -STICK, !!s?.buttons[D_RIGHT] || ax(s, 0) > STICK,
  ];
  const [u0, d0, l0, r0] = dir(prev), [u1, d1, l1, r1] = dir(cur);
  if (u1 && !u0) out.push('up');
  if (d1 && !d0) out.push('down');
  if (l1 && !l0) out.push('left');
  if (r1 && !r0) out.push('right');
  return out;
}
