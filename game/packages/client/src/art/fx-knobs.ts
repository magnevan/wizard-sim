/**
 * Live-tunable VFX parameters ("knobs"), so the look of an effect can be tuned with sliders (the VFX Lab's knob
 * panel, lab/vfx-lab/knob-panel.ts) and the result kept.
 *
 * An effect declares its knobs once, at module top, and reads `.v` in its drawing code, so the hot path is a
 * property read:
 *
 *     const K_SIZE = defKnob('spray.fire.flameSize', 1, { min: 0.3, max: 3, help: 'how big each flame is' });
 *     ... r *= K_SIZE.v;
 *
 * Each knob's value is its default in the code unless `fx-knobs.json` (beside this file, committed; only the values
 * that differ from the code) says otherwise. Knobs are cosmetic: client only, never read by the sim, and a frame is
 * still a pure function of (time, seed, knob values). Ids group by their dotted prefix (`spray.fire`).
 */
import { parseKnobValues } from './fx-knobs-check';

export interface KnobOpts { min: number; max: number; step?: number; help?: string }

export interface Knob {
  readonly id: string;
  /** The value in the code. */
  readonly dflt: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly help: string;
  /** The live value: read this in drawing code. */
  v: number;
}

const files = import.meta.glob<unknown>('./fx-knobs.json', { eager: true, import: 'default' });
const loaded = parseKnobValues(files['./fx-knobs.json'] ?? {});
if (loaded.errors.length) console.warn('fx-knobs.json:', loaded.errors.join('; '));
/** The committed values (fx-knobs.json), by id. */
let saved: Record<string, number> = loaded.values;

const reg = new Map<string, Knob>();
const listeners = new Set<(k: Knob | null) => void>();
const changed = (k: Knob | null): void => { for (const f of listeners) f(k); };

/** Declares a knob (once per id; a second call returns the first) at its saved value or else its default. */
export function defKnob(id: string, dflt: number, o: KnobOpts): Knob {
  const old = reg.get(id);
  if (old) return old;
  const k: Knob = { id, dflt, min: o.min, max: o.max, step: o.step ?? 0.01, help: o.help ?? '', v: saved[id] ?? dflt };
  reg.set(id, k);
  return k;
}

/** Every knob, sorted by id (so groups sit together). */
export const allKnobs = (): Knob[] => [...reg.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
export const getKnob = (id: string): Knob | undefined => reg.get(id);
/** What fx-knobs.json holds for a knob, or its default. */
export const savedValue = (k: Knob): number => saved[k.id] ?? k.dflt;

/** Sets a knob's live value; false if there's no such knob or v isn't a finite number. */
export function setKnob(id: string, v: number): boolean {
  const k = reg.get(id);
  if (!k || !Number.isFinite(v)) return false;
  if (k.v !== v) { k.v = v; changed(k); }
  return true;
}
/** Back to the code's default. */
export const resetKnob = (id: string): boolean => { const k = reg.get(id); return !!k && setKnob(id, k.dflt); };

/** The live values that differ from the code: what fx-knobs.json should hold. Saved ids not declared here are kept. */
export function knobOverrides(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(saved)) if (!reg.has(id)) out[id] = v;
  for (const k of allKnobs()) if (k.v !== k.dflt) out[k.id] = k.v;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Live values that differ from fx-knobs.json (not yet saved), by id. */
export function unsavedKnobs(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of allKnobs()) if (k.v !== savedValue(k)) out[k.id] = k.v;
  return out;
}

/**
 * Replaces what counts as saved (after the dev server wrote fx-knobs.json, or the file changed on disk). Knobs whose
 * live value was the old saved one follow the new file; unsaved edits stay.
 */
export function setSavedKnobs(raw: unknown): string[] {
  const { values, errors } = parseKnobValues(raw), before = saved;
  saved = values;
  for (const k of reg.values()) {
    const was = before[k.id] ?? k.dflt, now = values[k.id] ?? k.dflt;
    if (k.v === was && now !== was) k.v = now;
  }
  changed(null);
  return errors;
}

/** Every knob's live value, by id (a variant to compare against: the VFX Lab's A/B). */
export function knobValues(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of allKnobs()) out[k.id] = k.v;
  return out;
}

/**
 * Runs fn with these values in place of the live ones (unknown ids ignored), then puts the live ones back: one draw of
 * a variant. Nothing is told (no change events), so nothing else sees the swap.
 */
export function withKnobs<T>(values: Readonly<Record<string, number>> | null, fn: () => T): T {
  if (!values) return fn();
  const was: [Knob, number][] = [];
  for (const [id, v] of Object.entries(values)) { const k = reg.get(id); if (k && Number.isFinite(v) && k.v !== v) { was.push([k, k.v]); k.v = v; } }
  try { return fn(); } finally { for (const [k, v] of was) k.v = v; }
}

/** Called with the knob that changed, or null when many did. Returns the unsubscribe. */
export function onKnobChange(f: (k: Knob | null) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

// The dev server rewrites fx-knobs.json on Save: take the new file without reloading the page.
if (import.meta.hot) import.meta.hot.accept('./fx-knobs.json', (m) => { if (m) setSavedKnobs((m as { default?: unknown }).default ?? {}); });
