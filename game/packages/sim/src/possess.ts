/**
 * Possession, the core of it: a wizard inside a fixture (mode.ts Possession) can't walk, can't be hurt or moved, and
 * casts from where the fixture puts them, the way the fixture aims. The core asks `possessed`; what a fixture does is
 * the mode's (the battery's defences: battery.ts).
 */
import { MAX_SEATS, type World } from './world';
import type { Possession } from './mode';

/** Is seat i inside a fixture? */
export const possessed = (w: World, i: number): boolean => {
  const p = w.mode.possession;
  return !!p && i >= 0 && i < MAX_SEATS && p.of(w, i) >= 0;
};

/** The world's fixtures' rules (call only when `possessed` said yes). */
export const possession = (w: World): Possession => w.mode.possession!;
