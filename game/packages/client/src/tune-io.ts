/**
 * Saving and sharing a tuning: the overrides map as JSON, in localStorage and in the panel's
 * import box. Pure apart from the storage it is handed, so the parsing is testable in node.
 */
import { applyOverrides, overrides, resetTuning } from '@wizard-sim/sim';

export const STORE_KEY = 'magicka.tuning.v1';

export type Parsed = { ok: true; map: Record<string, number> } | { ok: false; error: string };

/** Reads an overrides map: a JSON object of id -> finite number. Empty text means the defaults. */
export function parseOverrides(text: string): Parsed {
  const src = text.trim();
  if (!src) return { ok: true, map: {} };
  let v: unknown;
  try { v = JSON.parse(src); } catch (err) { return { ok: false, error: `not JSON: ${(err as Error).message}` }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'expected an object like {"runes.regen": 0.5}' };
  const map: Record<string, number> = {};
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return { ok: false, error: `"${id}" is not a number` };
    map[id] = x;
  }
  return { ok: true, map };
}

/** Replaces the live tuning with `map` (so a pasted tuning means exactly that). Returns unknown ids. */
export function replaceTuning(map: Record<string, number>): string[] {
  resetTuning();
  return applyOverrides(map);
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The page's localStorage, or null where it is blocked (private windows, sandboxed frames). */
export function storage(): Store | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Applies the saved tuning, if any. Call before createWorld so spawn-time numbers use it. */
export function loadSaved(store: Store | null = storage()): string[] {
  try {
    const raw = store?.getItem(STORE_KEY);
    if (!raw) return [];
    const p = parseOverrides(raw);
    return p.ok ? replaceTuning(p.map) : [];
  } catch { return []; }
}

export function saveTuning(store: Store | null = storage()): void {
  try {
    const o = overrides();
    if (Object.keys(o).length) store?.setItem(STORE_KEY, JSON.stringify(o));
    else store?.removeItem(STORE_KEY);
  } catch { /* the game works without storage */ }
}

/** Pretty JSON for the export box, one id per line and sorted, so two tunings diff cleanly. */
export function exportText(o: Record<string, number> = overrides()): string {
  const ids = Object.keys(o).sort();
  if (!ids.length) return '{}';
  return '{\n' + ids.map((id) => `  ${JSON.stringify(id)}: ${o[id]}`).join(',\n') + '\n}';
}
