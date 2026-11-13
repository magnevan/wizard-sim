/**
 * Encounters as data: a room's fight as a list of steps the runner walks, instead of a hand-written director. A step
 * sends groups of enemies, waits for them to be cleared and for a quiet pause, then moves on; or it waits on a
 * condition. What only one room does (where its groups come out, the battery's well) stays code, as hooks the script
 * names. The first script is the battery's lesson (battery-waves.ts); docs/explorations/2026-11-13-encounters-as-data.md
 * has the plan for the rest (the map's Markers and Regions, doors, lines said).
 *
 * The runner's state is the encounter pool's (w.enc): state[0] started, [1] the step, [2] the pause's ticks left,
 * [3] which group of a list or loop; the slots (px, py, arch, left, next, total) are the groups coming out, one per slot.
 */
import { T } from './config';
import { inRegion, markersTagged, regionOf } from './room';
import { KIND, MAX_PORTALS, MAX_SEATS, type World } from './world';

/** A group: [archetype, count] pairs, coming out in that order. */
export type Group = readonly (readonly [number, number])[];

export interface Step {
  readonly id: string;
  /** The groups it sends. A 'once' step sends the first; 'list' and 'loop' steps send them in turn (state[3]). */
  readonly groups?: readonly Group[];
  /** once (default): its group, then the next step. list: each group in turn, then the next step. loop: round and round, each lap harder; it leaves only when a hook moves it on. */
  readonly cycle?: 'once' | 'list' | 'loop';
  /** s of quiet once its enemies are gone, before what comes next (default: the script's). */
  readonly pause?: number;
  /** While this is true the step doesn't move on, even with its enemies gone (the battery: nobody at a defence). */
  readonly hold?: (w: World) => boolean;
  /** When this is true the step moves on at once: no clearing, no pause (the battery: someone takes a defence). */
  readonly until?: (w: World) => boolean;
  /** Runs as the step begins, before its first group opens. */
  readonly enter?: (w: World) => void;
  /** Never moves on by itself (the end of a fight, or a step a hook leaves). */
  readonly end?: boolean;
}

export interface Script {
  readonly steps: readonly Step[];
  /** s between two enemies out of one slot. */
  readonly every: number;
  /** The default pause, s. */
  readonly pause: number;
  /** The first tick: lay out what's there as the party arrives. */
  readonly start?: (w: World) => void;
  /** Each tick, before the runner: the room's own clockwork. True: the runner sits this tick out. */
  readonly before?: (w: World) => boolean;
  /** Opens a group: sets the slots it comes out of (px, py, left, next, total). */
  readonly open: (w: World, g: Group) => void;
  /** The j-th enemy of slot k's group, on lap `lap` of a loop (0 otherwise). */
  readonly spawn: (w: World, k: number, arch: number, j: number, lap: number) => void;
}

/** The group a step sends now, or undefined (state[3] is the list's or loop's place). */
export function groupNow(step: Step, n: number): Group | undefined {
  const g = step.groups;
  if (!g || !g.length) return undefined;
  if (step.cycle === 'loop') return g[n % g.length];
  if (step.cycle === 'list') return g[n];
  return g[0];
}

/** Archetype of the j-th enemy of a group. */
export function archAt(g: Group, j: number): number {
  for (const [a, c] of g) { if (j < c) return a; j -= c; }
  return g[g.length - 1][0];
}

/** Enemies standing, and still to come out of the slots. */
export function remaining(w: World): number {
  let n = 0;
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) n++;
  for (let k = 0; k < MAX_PORTALS; k++) n += w.enc.left[k];
  return n;
}

/**
 * Move to step `s` (by index): its list starts at the top, its enter hook runs, and its first group opens (unless
 * `open` is false: the hook will open it itself, or wants a pause first). Hooks use this to leave a step early.
 */
export function goStep(w: World, script: Script, s: number, open = true): void {
  const st = w.enc.state, step = script.steps[s];
  st[1] = s; st[2] = 0;
  if (step?.groups?.length) st[3] = 0; // (a step without groups has no list, and leaves the place alone)
  step?.enter?.(w);
  const g = step && open ? groupNow(step, 0) : undefined;
  if (g) script.open(w, g);
}

/** One tick of the script. */
export function runScript(w: World, script: Script): void {
  const e = w.enc, st = e.state;
  if (script.before?.(w)) return;
  if (!st[0]) { script.start?.(w); st[0] = 1; st[1] = 0; st[2] = 0; st[3] = 0; return; }
  const step = script.steps[st[1]];
  if (!step) return;
  if (step.until) { if (step.until(w)) goStep(w, script, st[1] + 1); return; }
  // the group still coming out
  const g = groupNow(step, st[3]);
  if (g) {
    const lap = step.cycle === 'loop' ? Math.floor(st[3] / step.groups!.length) : 0;
    for (let k = 0; k < MAX_PORTALS; k++) {
      if (!e.left[k] || --e.next[k] > 0) continue;
      script.spawn(w, k, archAt(g, e.total[k] - e.left[k]), e.total[k] - e.left[k], lap);
      e.left[k]--; e.next[k] = T(script.every);
    }
  }
  if (step.end || remaining(w) || step.hold?.(w)) return;
  // its enemies are all gone: a quiet pause, then what comes next
  if (st[2] === 0) { st[2] = T(step.pause ?? script.pause); return; }
  if (--st[2] > 0) return;
  if (step.cycle === 'once' || !step.cycle) { goStep(w, script, st[1] + 1); return; }
  const next = groupNow(step, ++st[3]);
  if (next) script.open(w, next);
  else goStep(w, script, st[1] + 1); // a list that's done
}

// ---- the common vocabulary, for scripts that need no code of their own

/** Is any active wizard inside region `id` (an LDtk Region)? */
export function partyIn(w: World, id: string): boolean {
  const g = regionOf(w.def, id);
  if (!g) return false;
  for (let i = 0; i < MAX_SEATS; i++) if (w.seats.active[i] && w.bodies.kind[i] === KIND.wizard && inRegion(g, w.bodies.x[i], w.bodies.y[i])) return true;
  return false;
}

/** An `open` that sends the whole group out of every marker tagged `tag`, one slot each (up to MAX_PORTALS). */
export const openAtMarkers = (tag: string) => (w: World, g: Group): void => {
  const e = w.enc, ms = markersTagged(w.def, tag), n = g.reduce((s, [, c]) => s + c, 0);
  for (let k = 0; k < MAX_PORTALS; k++) {
    e.left[k] = e.total[k] = 0;
    if (k >= ms.length) continue;
    e.px[k] = ms[k].x; e.py[k] = ms[k].y; e.left[k] = e.total[k] = n; e.next[k] = 1;
  }
};
