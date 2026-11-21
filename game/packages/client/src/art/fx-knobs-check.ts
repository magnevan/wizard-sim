/**
 * The check for a set of VFX knob values (fx-knobs.ts), shared by the client and the dev server's save endpoint
 * (vite.config.ts), so both refuse the same things. No imports: the Vite config loads it too.
 */

/** A knob id: two or more dot-separated words, lower-case first, e.g. `spray.fire.flameSize`. */
export const KNOB_ID = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

/**
 * Reads `{ id: number }` from anything (a parsed JSON file, a POST body, localStorage). Entries with a bad id or a
 * value that isn't a finite number are dropped and named in `errors`; anything but a plain object is one error.
 */
export function parseKnobValues(raw: unknown): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = {}, errors: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { values, errors: ['not an object of id: number'] };
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOB_ID.test(id)) errors.push(`bad id "${id}"`);
    else if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${id}: not a finite number`);
    else values[id] = v;
  }
  return { values, errors };
}
