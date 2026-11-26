/**
 * An effect's life in phases (docs/explorations/2026-11-26-spell-effects-lessons.md, section 1): it starts, runs, ends,
 * and leaves an aftermath that outlives the gameplay. Each piece reads three levels from its start, end and clock:
 *
 * - `grow`: 0 to 1 as it starts (eased out over `grow` s);
 * - `on`: the live part, 1 while it runs, falling to 0 over `fall` s once it ends (quick and clear, so nothing left
 *   reads as still live);
 * - `after`: the aftermath, 0 while it runs, rising 0 to 1 over `linger` s once it ends; residue layers fade by it
 *   (duller, cooler, slower than the live effect).
 *
 * `end` is Infinity while the effect still runs. Pure: a function of the times, so frozen frames and rollback agree.
 */
export interface Phase {
  grow: number;
  on: number;
  after: number;
}

export interface PhaseTimes {
  /** Seconds to grow in (0: at once). */
  grow?: number;
  /** Seconds the live part takes to go out. */
  fall: number;
  /** Seconds the aftermath lasts. */
  linger: number;
}

export function phaseOf(t: number, t0: number, end: number, o: PhaseTimes): Phase {
  const g = o.grow ? Math.min(1, Math.max(0, (t - t0) / o.grow)) : 1;
  const past = t - end;
  return {
    grow: 1 - (1 - g) * (1 - g),
    on: past <= 0 ? 1 : o.fall > 0 ? Math.max(0, 1 - past / o.fall) : 0,
    after: past <= 0 ? 0 : o.linger > 0 ? Math.min(1, past / o.linger) : 1,
  };
}

/** Whether anything of it is still drawn at t (the live part or its aftermath). */
export const phaseDone = (t: number, end: number, o: PhaseTimes): boolean => t > end + Math.max(o.fall, o.linger);
