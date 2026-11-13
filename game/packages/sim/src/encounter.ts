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
  /** It sends what its hooks put in the slots (Survive's wave: one archetype per gate, enc.arch), not `groups`. */
  readonly sends?: boolean;
  /** s of quiet once its enemies are gone, before what comes next (default: the script's). 0: move on the same tick. */
  readonly pause?: number;
  /** While this is true the step doesn't move on, even with its enemies gone (the battery: nobody at a defence). */
  readonly hold?: (w: World) => boolean;
  /** When this is true the step moves on at once: no clearing, no pause (the battery: someone takes a defence). */
  readonly until?: (w: World) => boolean;
  /** Each tick in the step, first (after `until`). */
  readonly tick?: (w: World) => void;
  /** A timed step: it lasts this many s (a preset timer, state[2] > 0, counts down instead), then moves on. */
  readonly wait?: (w: World) => number;
  /** After the tick's enemies have come out: true ends the tick here (Survive: everyone is down, the run is over). */
  readonly after?: (w: World) => boolean;
  /** Runs as the step begins, before its first group opens. */
  readonly enter?: (w: World) => void;
  /** The step after this one, by id (default: the next in the list). Lets a script go round (Survive: pick, then lull). */
  readonly next?: string;
  /** Never moves on by itself (the end of a fight, or a step a hook leaves). */
  readonly end?: boolean;
}

export interface Script {
  readonly steps: readonly Step[];
  /** s between two enemies out of one slot. */
  readonly every: number;
  /** The default pause, s. */
  readonly pause: number;
  /**
   * Where in enc.state the runner keeps the step, and the "started" flag (-1: none; the mode's setup starts it).
   * Default: started in [0], the step in [1]. Survive keeps its phase in [0] (the HUD, bots and dev tools read it).
   */
  readonly slots?: { readonly started: number; readonly step: number };
  /** The first tick: lay out what's there as the party arrives. */
  readonly start?: (w: World) => void;
  /** Each tick, before the runner: the room's own clockwork. True: the runner sits this tick out. */
  readonly before?: (w: World) => boolean;
  /** Opens a group: sets the slots it comes out of (px, py, left, next, total). */
  readonly open: (w: World, g: Group) => void;
  /** The j-th enemy out of slot k, archetype `arch`, on lap `lap` of a loop (0 otherwise). */
  readonly spawn: (w: World, k: number, arch: number, j: number, lap: number) => void;
}

const DEFAULT_SLOTS = { started: 0, step: 1 } as const;

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

/** The index of the step after step `s`. */
function nextOf(script: Script, s: number): number {
  const id = script.steps[s]?.next;
  if (id === undefined) return s + 1;
  const k = script.steps.findIndex((t) => t.id === id);
  if (k < 0) throw new Error(`encounter: no step "${id}"`);
  return k;
}

/** The step the script is on (its index). */
export const stepOf = (w: World, script: Script): number => w.enc.state[(script.slots ?? DEFAULT_SLOTS).step];

/**
 * Move to step `s` (by index): its list starts at the top, its enter hook runs, and its first group opens (unless
 * `open` is false: the hook will open it itself, or wants a pause first). Hooks use this to leave a step early.
 */
export function goStep(w: World, script: Script, s: number, open = true): void {
  const st = w.enc.state, step = script.steps[s];
  st[(script.slots ?? DEFAULT_SLOTS).step] = s; st[2] = 0;
  if (step?.groups?.length) st[3] = 0; // (a step without groups has no list, and leaves the place alone)
  step?.enter?.(w);
  const g = step && open ? groupNow(step, 0) : undefined;
  if (g) script.open(w, g);
}

/** One tick of the script. */
export function runScript(w: World, script: Script): void {
  const e = w.enc, st = e.state, slots = script.slots ?? DEFAULT_SLOTS;
  if (script.before?.(w)) return;
  if (slots.started >= 0 && !st[slots.started]) { script.start?.(w); st[slots.started] = 1; st[slots.step] = 0; st[2] = 0; st[3] = 0; return; }
  const s = st[slots.step], step = script.steps[s];
  if (!step) return;
  if (step.until) { if (step.until(w)) goStep(w, script, nextOf(script, s)); return; }
  step.tick?.(w);
  if (step.wait) {
    if (st[2] <= 0) st[2] = T(step.wait(w));
    if (--st[2] > 0) return;
    goStep(w, script, nextOf(script, s));
    return;
  }
  // what is still coming out of the slots
  const g = groupNow(step, st[3]);
  if (g || step.sends) {
    const lap = g && step.cycle === 'loop' ? Math.floor(st[3] / step.groups!.length) : 0;
    for (let k = 0; k < MAX_PORTALS; k++) {
      if (!e.left[k] || --e.next[k] > 0) continue;
      const j = e.total[k] - e.left[k];
      script.spawn(w, k, g ? archAt(g, j) : e.arch[k], j, lap);
      e.left[k]--; e.next[k] = T(script.every);
    }
  }
  if (step.after?.(w)) return;
  if (step.end || remaining(w) || step.hold?.(w)) return;
  // its enemies are all gone: a quiet pause, then what comes next
  const pause = step.pause ?? script.pause;
  if (pause > 0) {
    if (st[2] === 0) { st[2] = T(pause); return; }
    if (--st[2] > 0) return;
  }
  if (step.cycle === 'once' || !step.cycle) { goStep(w, script, nextOf(script, s)); return; }
  const next = groupNow(step, ++st[3]);
  if (next) script.open(w, next);
  else goStep(w, script, nextOf(script, s)); // a list that's done
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
