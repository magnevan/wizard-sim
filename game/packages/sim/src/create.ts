/**
 * createWorld: a new world of a room, under that room's mode (modes.ts). Kept apart from world.ts so world.ts never
 * imports the modes (which import it), and the cycle can't bite at load time.
 */
import type { WorldOpts } from './mode';
import { modeOf } from './modes';
import { createWorldWith, type World } from './world';

/** `tutorialBeat` starts a tutorial world at that beat (design numbering; the first if it isn't one the build has). */
export function createWorld(seed: number, players: number, opts: WorldOpts = {}): World {
  return createWorldWith(modeOf(opts.room ?? 'sanctum'), seed, players, opts);
}
