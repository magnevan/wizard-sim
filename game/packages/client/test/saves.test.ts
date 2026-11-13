// The campaign save: forward only, only for campaign chapters, and a checkpoint (never a snapshot).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '@wizard-sim/sim';
import { SaveWatch, loadSave, progressOf, writeSave } from '../src/saves';
import { scenarioById } from '../src/scenarios';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('the campaign save', () => {
  const battery = scenarioById('battery')!, survive = scenarioById('survive')!;

  it('records the furthest checkpoint passed, and replaying from the start never loses it', () => {
    expect(loadSave()).toBeNull();
    expect(writeSave(battery, 'start')).toBe(true);
    expect(writeSave(battery, 'well-failing')).toBe(true);
    expect(writeSave(battery, 'start')).toBe(false);
    expect(loadSave()?.checkpoint).toBe('well-failing');
    expect(progressOf('battery', 'repair')).toBeGreaterThan(progressOf('battery', 'well-failing'));
  });

  it('saves campaign chapters only', () => {
    expect(writeSave(survive, 'start')).toBe(false);
    expect(loadSave()).toBeNull();
  });

  it('a watch writes what the world says it has passed, once per change', () => {
    const watch = new SaveWatch(() => battery);
    const w = createWorld(1, 1, { room: 'battery', checkpoint: 'repair' });
    watch.update(w.mode.reached?.(w));
    expect(loadSave()?.checkpoint).toBe('repair');
    store.clear();
    watch.update(w.mode.reached?.(w)); // no change: no write
    expect(loadSave()).toBeNull();
  });

  it('no storage (a private window) means no save, not an error', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(() => writeSave(battery, 'repair')).not.toThrow();
    expect(loadSave()).toBeNull();
  });
});
