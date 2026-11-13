/**
 * The campaign save: which chapter (a campaign scenario) and the last checkpoint passed in it, written as you pass
 * one and read by the Esc menu's Continue. One slot for now, in this browser (localStorage; Steam's cloud saves later).
 *
 * A save names a checkpoint, never a snapshot: snapshots are tied to one build's layout and are large, while a
 * checkpoint id rebuilds the same place in any build that still has it (an unknown one starts the chapter over).
 * `party` is what carries between areas (the elements unlocked: the battery gives Fire), so Continue starts with it.
 */
import type { PartyState } from '@wizard-sim/sim';
import { SCENARIOS, checkpointsOf, scenarioById, type Scenario } from './scenarios';

export interface Save {
  v: 1;
  scenario: string;
  checkpoint: string;
  /** When it was written (ISO). */
  at: string;
  /** What the party had there (sim PartyState); null for none. */
  party: PartyState | null;
}

const KEY = 'wizard-sim-save-v1';

/** The save, if there is one and it still names a campaign chapter. Storage can be missing (private windows): then none. */
export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    const sc = scenarioById(s?.scenario);
    return s?.v === 1 && sc?.kind === 'campaign' && typeof s.checkpoint === 'string' ? s : null;
  } catch { return null; }
}

/** How far along the campaign (chapter, then checkpoint) a place is, for comparing: -1 if it isn't one. */
export function progressOf(scenario: string, checkpoint: string): number {
  const chapters = SCENARIOS.filter((s) => s.kind === 'campaign'), c = chapters.findIndex((s) => s.id === scenario);
  if (c < 0) return -1;
  const k = checkpointsOf(chapters[c]).findIndex((p) => p.id === checkpoint);
  return c * 1000 + Math.max(0, k);
}

/**
 * Records that `checkpoint` of chapter `s` was reached, if it is further along than the save (replaying an earlier
 * chapter, or a chapter from its start, never loses your place). Only campaign chapters are saved; storage errors are ignored.
 */
export function writeSave(s: Scenario, checkpoint: string, party?: PartyState): boolean {
  if (s.kind !== 'campaign') return false;
  const old = loadSave();
  if (old && progressOf(old.scenario, old.checkpoint) >= progressOf(s.id, checkpoint)) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, scenario: s.id, checkpoint, at: new Date().toISOString(), party: party ?? null } satisfies Save)); return true; } catch { return false; }
}

/**
 * Watches the world for a newly passed checkpoint and saves it. `update` is called after each shown step with the
 * checkpoint the world says it has passed (Mode.reached); only a change is written.
 */
export class SaveWatch {
  private last: string | undefined;
  constructor(private scenario: () => Scenario) {}
  /** A new chapter (or the same one again) began: the next shown step writes where it stands (if that's further along). */
  reset(): void { this.last = undefined; }
  update(reached: string | undefined, party?: PartyState): void {
    if (!reached || reached === this.last) return;
    this.last = reached;
    writeSave(this.scenario(), reached, party);
  }
}
