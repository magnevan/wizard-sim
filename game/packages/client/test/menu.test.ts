import { describe, expect, it } from 'vitest';
import { KIND, ROOM_DIMS, createWorld, joinSeat } from '@wizard-sim/sim';
import { SCENARIOS, fromLocation, hashFor, isPlayable, roomOf, scenarioById, scenarioForKey, scenarioOfRoom, worldFor } from '../src/scenarios';
import { escAction, helpPadPresses, keyToNav, menuScenarioKey, navigate, padMenuKeys, type NavItem, type NavState } from '../src/menu-nav';
import { PAD, type PadState } from '../src/gamepad';

describe('the scenario registry', () => {
  it('has one entry per id and key, and every playable one names a sim room', () => {
    const ids = SCENARIOS.map((s) => s.id), keys = SCENARIOS.flatMap((s) => (s.key ? [s.key] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SCENARIOS) expect(isPlayable(s)).toBe(s.room in ROOM_DIMS);
    expect(SCENARIOS.filter(isPlayable).map((s) => s.id)).toEqual(expect.arrayContaining(['sanctum', 'arena', 'survive']));
  });

  it('keeps a slot for the tutorial, greyed until the sim has its room', () => {
    const t = scenarioById('tutorial')!;
    expect(t).toBeDefined();
    expect(isPlayable(t)).toBe('tutorial' in ROOM_DIMS);
    if (!isPlayable(t)) {
      expect(scenarioForKey('Digit' + t.key)).toBeUndefined();
      expect(fromLocation('', '#tutorial').scenario.id).toBe('sanctum');
    }
  });

  it('maps 1 / 2 / 3 to the Sanctum, the Arena and Survive', () => {
    expect(['Digit1', 'Digit2', 'Digit3'].map((c) => scenarioForKey(c)?.id)).toEqual(['sanctum', 'arena', 'survive']);
    expect(scenarioForKey('Digit9')).toBeUndefined();
    expect(scenarioForKey('KeyQ')).toBeUndefined();
  });

  it('reads the URL: ?room=, the #anchor (which wins), and the ally', () => {
    expect(fromLocation('', '')).toMatchObject({ scenario: { id: 'sanctum' }, ally: false });
    expect(fromLocation('?room=arena', '').scenario.id).toBe('arena');
    expect(fromLocation('?room=arena', '#survive').scenario.id).toBe('survive');
    expect(fromLocation('', '#arena-ally')).toMatchObject({ scenario: { id: 'arena' }, ally: true });
    expect(fromLocation('?ally=1', '#survive').ally).toBe(true);
    expect(fromLocation('?room=nowhere', '').scenario.id).toBe('sanctum');
    // and back: the anchor a switch writes reads as the same place
    for (const s of SCENARIOS.filter(isPlayable)) for (const ally of [false, true]) expect(fromLocation('', hashFor(s, ally))).toMatchObject({ scenario: { id: s.id }, ally });
  });

  it('turns a room name from the network into a safe room', () => {
    expect(roomOf('survive')).toBe('survive');
    expect(roomOf('arena')).toBe('arena');
    expect(roomOf('garbage')).toBe('sanctum');
    expect(roomOf(undefined)).toBe('sanctum');
    expect(scenarioOfRoom('arena').name).toBe('Arena (legacy)');
  });

  it('a switch keeps exactly the seats that were taken: a pad on seat 2 does not conjure a wizard on seat 1', () => {
    const old = createWorld(7, 1);
    joinSeat(old, 2);
    const w = worldFor(old, 1, 'arena');
    expect([...w.seats.active]).toEqual([1, 0, 1, 0]);
    expect(w.bodies.kind[1]).toBe(KIND.none);
    expect(w.bodies.kind[2]).toBe(KIND.wizard);
    // the dev ally's seat stays, even before its bot has stepped
    expect([...worldFor(createWorld(7, 1), 2, 'sanctum').seats.active]).toEqual([1, 1, 0, 0]);
  });
});

describe('Esc', () => {
  it('clears a queue that holds runes, opens the menu on an empty one, and closes an open menu', () => {
    expect(escAction(false, 2)).toBe('clear');
    expect(escAction(false, 0)).toBe('open');
    expect(escAction(true, 0)).toBe('close');
    expect(escAction(true, 3)).toBe('close');
  });

  it('maps arrows, WASD, Enter, Space and Backspace', () => {
    expect(['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Backspace', 'KeyQ'].map(keyToNav))
      .toEqual(['up', 'up', 'down', 'down', 'left', 'right', 'select', 'select', 'back', null]);
  });
});

describe('menu navigation', () => {
  const items = (...en: boolean[]): NavItem[] => en.map((enabled) => ({ enabled }));
  const at = (): NavState => ({ section: 0, focus: 'tabs', item: 0 });

  it('moves between tabs with wrap-around; select on an itemless tab is the tab itself (Resume)', () => {
    const st = at();
    expect(navigate(st, 'up', 5, [])).toEqual({ kind: 'none' });
    expect(st.section).toBe(4);
    navigate(st, 'down', 5, []);
    expect(st.section).toBe(0);
    expect(navigate(st, 'select', 5, [])).toEqual({ kind: 'tab' });
    expect(navigate(st, 'back', 5, [])).toEqual({ kind: 'close' });
  });

  it('enters a section on its first enabled item, skips greyed ones, and activates', () => {
    const st = at(), list = items(false, true, false, true);
    navigate(st, 'right', 5, list);
    expect(st).toMatchObject({ focus: 'items', item: 1 });
    navigate(st, 'down', 5, list);
    expect(st.item).toBe(3);
    navigate(st, 'down', 5, list);
    expect(st.item).toBe(3); // the end: stays
    navigate(st, 'up', 5, list);
    expect(st.item).toBe(1);
    expect(navigate(st, 'select', 5, list)).toEqual({ kind: 'activate', item: 1 });
    navigate(st, 'back', 5, list);
    expect(st.focus).toBe('tabs');
  });

  it('left and right adjust a setting instead of leaving it', () => {
    const st: NavState = { section: 4, focus: 'items', item: 0 }, list: NavItem[] = [{ enabled: true, adjustable: true }];
    expect(navigate(st, 'left', 5, list)).toEqual({ kind: 'adjust', item: 0, by: -1 });
    expect(navigate(st, 'right', 5, list)).toEqual({ kind: 'adjust', item: 0, by: 1 });
    expect(st.focus).toBe('items');
  });

  it('a section with nothing enabled stays on the tabs', () => {
    const st = at();
    navigate(st, 'right', 5, items(false, false));
    expect(st.focus).toBe('tabs');
  });
});

describe('the menu on a gamepad', () => {
  const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadState => {
    const buttons: boolean[] = [];
    for (const b of pressed) buttons[b] = true;
    return { buttons, axes };
  };

  it('Start toggles the menu once per press; A selects, B goes back', () => {
    expect(padMenuKeys(pad(), pad([PAD.START]))).toEqual(['menu']);
    expect(padMenuKeys(pad([PAD.START]), pad([PAD.START]))).toEqual([]); // held: nothing more
    expect(padMenuKeys(null, pad([PAD.A]))).toEqual(['select']);
    expect(padMenuKeys(pad(), pad([PAD.B]))).toEqual(['back']);
  });

  it('the D-pad and the left stick move, once per push', () => {
    expect(padMenuKeys(pad(), pad([PAD.DOWN]))).toEqual(['down']);
    expect(padMenuKeys(pad(), pad([], [0, -0.9, 0, 0]))).toEqual(['up']);
    expect(padMenuKeys(pad([], [0, -0.9, 0, 0]), pad([], [0, -0.95, 0, 0]))).toEqual([]);
    expect(padMenuKeys(pad(), pad([], [0.9, 0, 0, 0]))).toEqual(['right']);
    expect(padMenuKeys(pad(), pad([], [0.3, 0.3, 0, 0]))).toEqual([]); // a light tilt isn't a push
  });
});

describe('keys shared between the menu and the game', () => {
  it('D-pad up opens the help panel, but not while the Esc menu is open (it moves the menu there)', () => {
    expect(helpPadPresses([false, false], [true, false], false)).toEqual([0]);
    expect(helpPadPresses([true, false], [true, true], false)).toEqual([1]); // held: once per press
    expect(helpPadPresses([false, false], [true, true], true)).toEqual([]);
  });

  it('the number keys switch scenarios from the menu too, offline and when not typing a room code', () => {
    expect(menuScenarioKey('Digit3', false, false)?.id).toBe('survive');
    expect(menuScenarioKey('Digit4', false, false)?.id).toBe('tutorial');
    expect(menuScenarioKey('Digit3', true, false)).toBeUndefined(); // typing the code
    expect(menuScenarioKey('Digit3', false, true)).toBeUndefined(); // online: the host picks from the list
    expect(menuScenarioKey('KeyQ', false, false)).toBeUndefined();
  });
});
