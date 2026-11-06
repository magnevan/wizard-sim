/**
 * The scenarios: every place the Esc menu (and the number keys) can take you. One entry each, in
 * menu order. A scenario names a sim room; until the sim has that room (ROOM_DIMS lists every
 * room), the entry shows greyed as "coming soon", so a new room only needs its line here.
 *
 *   id     the URL's word: ?room=<id> or #<id> (artifact links carry only the #anchor)
 *   key    the number key that switches to it (1 / 2 / 3 ...), matched on KeyboardEvent.code Digit<key>
 *   room   the sim room it builds (createWorld's opts.room)
 *
 * This will be redesigned closer to a beta (a campaign map, not a list); for now it is how you move
 * between the tutorial, the sandbox and the modes.
 */
import { MAX_SEATS, ROOM_DIMS, createWorld, joinSeat, type Room, type World } from '@wizard-sim/sim';

export interface Scenario {
  id: string;
  name: string;
  /** One line for the menu. */
  blurb: string;
  room: string;
  key?: string;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'tutorial', name: 'Tutorial', blurb: 'Learn the runes, the casts and your hands, one step at a time.', room: 'tutorial', key: '4' },
  { id: 'sanctum', name: 'Sanctum', blurb: 'The sandbox: three practice dummies and the tuning panel (F1).', room: 'sanctum', key: '1' },
  { id: 'arena', name: 'Arena', blurb: 'Waves of enemies from portals, with lulls and breathers.', room: 'arena', key: '2' },
  { id: 'survive', name: 'Survive', blurb: 'Endless waves in a walled arena; pick a power-up between them.', room: 'survive', key: '3' },
  { id: 'academy', name: 'Academy (art test)', blurb: 'A mock room for judging art: O swaps the props, I the wizard.', room: 'academy', key: '5' },
];

/** Where you start when the URL names nothing (or something that isn't playable yet). */
export const DEFAULT_SCENARIO = 'sanctum';

/** Does the sim have this scenario's room yet? */
export const isPlayable = (s: Scenario): boolean => Object.prototype.hasOwnProperty.call(ROOM_DIMS, s.room);

export const scenarioById = (id: string | null | undefined): Scenario | undefined => SCENARIOS.find((s) => s.id === id);

/** The playable scenario for a room name from the network or the URL (unknown -> the default). */
export function scenarioOfRoom(room: string | null | undefined): Scenario {
  const s = SCENARIOS.find((x) => x.room === room);
  return s && isPlayable(s) ? s : scenarioById(DEFAULT_SCENARIO)!;
}

/** A room name that is safe to hand createWorld. */
export const roomOf = (room: string | null | undefined): Room => scenarioOfRoom(room).room as Room;

/** The scenario a number key switches to (KeyboardEvent.code, e.g. "Digit2"), if it is playable. */
export function scenarioForKey(code: string): Scenario | undefined {
  const s = SCENARIOS.find((x) => x.key && code === 'Digit' + x.key);
  return s && isPlayable(s) ? s : undefined;
}

/**
 * Reads the scenario and the dev ally from the URL: ?room=<id>, or the #anchor's words joined by
 * dashes (#arena, #survive-ally). The anchor wins, as artifact links carry nothing else.
 */
export function fromLocation(search: string, hash: string): { scenario: Scenario; ally: boolean } {
  const q = new URLSearchParams(search);
  let id = q.get('room'), ally = q.get('ally') === '1';
  for (const tok of hash.replace(/^#/, '').split('-')) {
    if (scenarioById(tok)) id = tok;
    if (tok === 'ally') ally = true;
  }
  const s = scenarioById(id);
  return { scenario: s && isPlayable(s) ? s : scenarioById(DEFAULT_SCENARIO)!, ally };
}

/**
 * A fresh world for an in-place switch to `room`: the first `players` seats (you, and the dev ally),
 * plus every seat that was taken in `old` (a pad that joined), and no others.
 */
export function worldFor(old: World, players: number, room: Room): World {
  const w = createWorld(7, players, { room });
  for (let p = 0; p < MAX_SEATS; p++) if (old.seats.active[p]) joinSeat(w, p);
  return w;
}

/** The #anchor that brings you back here on a reload. */
export const hashFor = (s: Scenario, ally: boolean): string => '#' + [s.id, ...(ally ? ['ally'] : [])].join('-');
