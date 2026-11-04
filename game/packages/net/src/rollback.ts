/**
 * Rollback (GGPO-style) on the lockstep session's input pipeline and packets.
 *
 * Every tick runs at once: our own input is known, and each other seat's input is predicted (the
 * buttons, walk and aim of the last input we have from them, with no element presses, which
 * would otherwise repeat). Before each tick the world is snapshotted. When a real input arrives
 * for a tick we already ran and it differs from what we predicted, the world rewinds to that tick
 * and replays to now. So nobody waits on the network for their own actions; remote players
 * may snap a little when a prediction was wrong.
 *
 * If someone's inputs fall more than `window` ticks behind, we stop and wait (we can't rewind
 * further than the snapshots we keep). Hashes are exchanged only for confirmed ticks (all inputs
 * real), so a mid-prediction world is never compared.
 */
import { NO_INPUT, hashSnapshot, restore, snapshotInto, step, type PlayerInput, type Snapshot, type World } from '@wizard-sim/sim';
import { HASH_EVERY, LockstepSession } from './lockstep';
import type { Transport } from './transport';

const same = (a: PlayerInput, b: PlayerInput) =>
  a.buttons === b.buttons && a.press0 === b.press0 && a.press1 === b.press1 && a.moveX === b.moveX && a.moveY === b.moveY && a.aimX === b.aimX && a.aimY === b.aimY;

export class RollbackSession extends LockstepSession {
  /** Snapshots of the world at the start of each recent tick, in a ring. */
  private snaps: (Snapshot | null)[];
  /** The inputs each recent tick actually ran with (real or predicted), by tick. */
  private used = new Map<number, PlayerInput[]>();
  /** The earliest tick whose inputs turned out different from what ran: rewind to here. */
  private rewindTo = Infinity;
  /** Every tick before this has all its inputs real. */
  private confirmed = 0;
  /** Ticks replayed because of corrections (a measure of how often prediction is wrong). */
  replayed = 0;
  /** Set while replaying, so the client can skip effects it already showed. */
  replaying = false;

  constructor(world: World, net: Transport, seats: readonly number[], delay = 1, autoFlush = true, readonly window = 40) {
    super(world, net, seats, delay, autoFlush);
    this.acceptsPast = true;
    this.snaps = Array.from({ length: window + 2 }, () => null);
  }

  protected onInput(t: number, p: number, input: PlayerInput): void {
    const ran = this.used.get(t);
    if (ran && !same(ran[p], input)) this.rewindTo = Math.min(this.rewindTo, t);
  }

  /** What seat p's input for tick t is: the real one, or a guess from the last real one. */
  private inputFor(t: number, p: number): PlayerInput {
    const real = this.inputs.get(t)?.[p];
    if (real) return real;
    for (let k = t - 1; k >= Math.max(0, t - 120); k--) {
      const prev = this.inputs.get(k)?.[p];
      if (prev) return { ...prev, press0: 0, press1: 0 };
    }
    return NO_INPUT;
  }

  private runTick(): void {
    const t = this.tick;
    this.snaps[t % this.snaps.length] = snapshotInto(this.world, this.snaps[t % this.snaps.length]);
    const ins = this.seats.map((_, p) => this.inputFor(t, p));
    this.used.set(t, ins);
    const all: PlayerInput[] = [];
    this.seats.forEach((seat, p) => { all[seat] = ins[p]; });
    for (let i = 0; i < all.length; i++) if (!all[i]) all[i] = NO_INPUT;
    this.hooks.before?.(this.world);
    step(this.world, all);
    this.hooks.after?.(this.world);
  }

  advance(max = 8): number {
    const me = this.me();
    // 1. A correction arrived: rewind to it and replay up to where we were.
    if (this.rewindTo < this.tick) {
      const now = this.tick, from = this.rewindTo;
      this.rewindTo = Infinity;
      const snap = this.snaps[from % this.snaps.length];
      if (snap && now - from <= this.window) {
        this.hooks.preRewind?.(this.world); // the client notes where things were drawn, to ease the correction
        restore(this.world, snap);
        this.replaying = true;
        while (this.tick < now) { this.runTick(); this.replayed++; }
        this.replaying = false;
        this.hooks.postRewind?.(this.world);
      }
    }
    // 2. Move the confirmed frontier, and hash confirmed ticks.
    while (this.inputs.get(this.confirmed)?.every((x) => !!x) && this.confirmed < this.tick) {
      this.confirmed++;
      const c = this.confirmed;
      if (c % HASH_EVERY === 0 && c < this.tick) {
        const s = this.snaps[c % this.snaps.length];
        // The snapshot at the start of tick c is the world after tick c-1: confirmed, so comparable.
        if (s && this.used.has(c)) { const h = hashSnapshot(s); this.hashes.set(c, h); this.lastHash = [c, h]; }
      }
      this.used.delete(c - this.window - 4);
      this.inputs.delete(c - this.window - 70);
    }
    // 3. New ticks: as far as our own input is in, but no further than the window past the confirmed.
    let ran = 0;
    while (ran < max) {
      if (!this.inputs.get(this.tick)?.[me]) break; // our own input for this tick isn't scheduled yet
      if (this.tick - this.confirmed >= this.window) { this.stalls++; if (ran === 0) this.waitedTicks++; break; }
      this.runTick();
      ran++;
    }
    return ran;
  }
}
