/**
 * Rollback (GGPO-style) on the lockstep session's input pipeline and packets.
 *
 * Every tick runs at once: our own input is known, and each other seat's input is predicted (the
 * buttons and walk of the last input we have from them, with no element presses, which would
 * otherwise repeat). Aim is guessed in world space: their cursor is assumed to stay on the same
 * spot of the floor while they walk, or to carry on a steady sweep (see predictAim). Before each
 * tick the world is snapshotted. When a real input arrives
 * for a tick we already ran and it differs from what we predicted, the world rewinds to that tick
 * and replays to now. So nobody waits on the network for their own actions; remote players
 * may snap a little when a prediction was wrong.
 *
 * If someone's inputs fall more than `window` ticks behind, we stop and wait (we can't rewind
 * further than the snapshots we keep). Hashes are exchanged only for confirmed ticks (all inputs
 * real), so a mid-prediction world is never compared.
 *
 * Drop-out and rejoin. A seat can be marked gone from tick T: from then on it plays NO_INPUT
 * (its wizard stands still) without anyone waiting for it. Every peer must pick the same T, so the
 * client agrees on it first (the highest tick anyone holds; netplay.ts) and calls dropSeat().
 * A newcomer takes a gone seat back from a later tick with resumeSeat() on the peers and
 * startMidway() on its own page, from a handover(): a confirmed snapshot and the inputs after it.
 */
import { AIM_UNIT, INPUT_BYTES, NO_INPUT, decodeInput, encodeInput, hashSnapshot, restore, snapshot, snapshotInto, step, type PlayerInput, type Snapshot, type World } from '@wizard-sim/sim';
import { HASH_EVERY, LockstepSession } from './lockstep';
import type { Transport } from './transport';

/**
 * A guessed aim as a whole number in range. `+ 0` turns -0 into 0: `same()` can't tell them apart,
 * but the sim stores the aim in a Float64Array, so a -0 that ran would leave different state bytes
 * than the real 0 without any rewind to correct it.
 */
const clampAim = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v))) + 0;

const same = (a: PlayerInput, b: PlayerInput) =>
  a.buttons === b.buttons && a.press0 === b.press0 && a.press1 === b.press1 && a.moveX === b.moveX && a.moveY === b.moveY && a.aimX === b.aimX && a.aimY === b.aimY;

/** Ticks of wizard positions kept for aim prediction (more than the window plus the history it looks at). */
const POS_RING = 256;
/** How many recent real inputs the world-point estimate may intersect. */
const AIM_HISTORY = 24;
/** Sampling delays (ticks between a peer reading its world and the tick its input is for) that are tried. */
const MAX_SAMPLE_DELAY = 8;
/** A sweep carries on for at most this many ticks, at most this fast (radians per tick). */
const SWEEP_TICKS = 10, SWEEP_MAX = 0.12;

/**
 * How a remote seat's aim is guessed. 'world': the cursor stays on the same world point (or a
 * steady sweep carries on). 'relative': the last relative aim repeats (the old way; for comparing).
 */
export type AimPrediction = 'world' | 'relative';

/** A seat is gone for ticks from..until-1 (until is Infinity while nobody has taken it back). */
export interface Gone { from: number; until: number }

/** What a rejoining peer needs: the world at a confirmed tick, and every input known after it. */
export interface Handover { tick: number; snap: Snapshot; inputs: Uint8Array; gone: (Gone | null)[] }

/**
 * Inputs for consecutive ticks, any number of seats, as bytes:
 * u32 first tick, u16 ticks, u8 seats, then per tick and seat a u8 (1 = present) and the input.
 */
export function encodeInputs(first: number, rows: (PlayerInput | undefined)[][], seats: number): Uint8Array {
  const buf = new Uint8Array(7 + rows.length * seats * (1 + INPUT_BYTES));
  const v = new DataView(buf.buffer);
  v.setUint32(0, first, true); v.setUint16(4, rows.length, true); v.setUint8(6, seats);
  let o = 7;
  for (const row of rows) for (let p = 0; p < seats; p++) {
    const x = row[p];
    v.setUint8(o, x ? 1 : 0);
    if (x) encodeInput(x, v, o + 1);
    o += 1 + INPUT_BYTES;
  }
  return buf;
}

export function decodeInputs(buf: Uint8Array): { first: number; rows: (PlayerInput | undefined)[][] } {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const first = v.getUint32(0, true), n = v.getUint16(4, true), seats = v.getUint8(6);
  const rows: (PlayerInput | undefined)[][] = [];
  let o = 7;
  for (let k = 0; k < n; k++) {
    const row: (PlayerInput | undefined)[] = [];
    for (let p = 0; p < seats; p++) { row.push(v.getUint8(o) ? decodeInput(v, o + 1) : undefined); o += 1 + INPUT_BYTES; }
    rows.push(row);
  }
  return { first, rows };
}

export class RollbackSession extends LockstepSession {
  /** Snapshots of the world at the start of each recent tick, in a ring. */
  private snaps: (Snapshot | null)[];
  /** The inputs each recent tick actually ran with (real or predicted), by tick. */
  private used = new Map<number, PlayerInput[]>();
  /** The earliest tick whose inputs turned out different from what ran: rewind to here. */
  private rewindTo = Infinity;
  /** Every tick before this has all its inputs real. */
  private confirmed = 0;
  /** Per seat: the ticks it is gone for, or null. */
  private gone: (Gone | null)[];
  /** Per seat: we stopped listening (it went silent and its drop is being agreed). */
  private muted: boolean[];
  /** Ticks replayed because of corrections (a measure of how often prediction is wrong). */
  replayed = 0;
  /** Set while replaying, so the client can skip effects it already showed. */
  replaying = false;
  /** How remote aim is guessed (only predictions change: confirmed ticks always run the real inputs). */
  aimPrediction: AimPrediction = 'world';
  /** Per tick in a ring: where each seat's wizard stood at the start of that tick (what the aim guess works from). */
  private posTick = new Int32Array(POS_RING).fill(-1);
  private posX: Float64Array;
  private posY: Float64Array;

  constructor(world: World, net: Transport, seats: readonly number[], delay = 1, autoFlush = true, readonly window = 40) {
    super(world, net, seats, delay, autoFlush);
    this.acceptsPast = true;
    this.snaps = Array.from({ length: window + 2 }, () => null);
    this.gone = seats.map(() => null);
    this.muted = seats.map(() => false);
    this.posX = new Float64Array(POS_RING * seats.length);
    this.posY = new Float64Array(POS_RING * seats.length);
  }

  /**
   * How good the guesses were, over real inputs that arrived for ticks already run: how many,
   * how many were wrong (each wrong one rewinds), and the summed aim error in aim units.
   */
  readonly guesses = { checked: 0, wrong: 0, aimErr: 0 };

  protected onInput(t: number, p: number, input: PlayerInput): void {
    const ran = this.used.get(t);
    if (!ran) return;
    const g = this.guesses, x = ran[p];
    g.checked++;
    g.aimErr += Math.hypot(x.aimX - input.aimX, x.aimY - input.aimY);
    if (!same(x, input)) { g.wrong++; this.rewindTo = Math.min(this.rewindTo, t); }
  }

  protected out(p: number): boolean { return this.muted[p] || this.gone[p]?.until === Infinity; }

  isGone(t: number, p: number): boolean { const g = this.gone[p]; return !!g && t >= g.from && t < g.until; }
  /** Seat p isn't playing (gone, or being dropped). */
  isOut(p: number): boolean { return this.out(p); }
  /** How many consecutive inputs we hold from seat p (its next missing tick). */
  heldFrom(p: number): number { return this.weNeed[p]; }
  /** Who is gone, for a handover. */
  goneSeats(): readonly (Gone | null)[] { return this.gone; }

  /** Stop listening to seat p, so what we hold from it stays put while its drop is agreed. */
  mute(p: number): void { this.muted[p] = true; }

  /** Seat p's inputs for ticks from..to-1, as bytes (what a drop shares, so everyone holds the same up to T). */
  inputsOf(p: number, from: number, to: number): Uint8Array {
    const rows: (PlayerInput | undefined)[][] = [];
    for (let t = from; t < to; t++) rows.push([this.inputs.get(t)?.[p]]);
    return encodeInputs(from, rows, 1);
  }

  /**
   * Seat p is gone from tick `end` on (every peer must use the same `end`). `tail` holds its
   * inputs just before `end`, to fill any we missed. Ticks that ran with a different guess rewind.
   */
  dropSeat(p: number, end: number, tail?: Uint8Array): void {
    if (tail) {
      const { first, rows } = decodeInputs(tail);
      rows.forEach((row, k) => {
        const t = first + k, x = row[0];
        if (!x || t >= end) return;
        const s = this.slot(t);
        if (!s[p]) { s[p] = x; this.onInput(t, p, x); }
      });
    }
    for (const [t, s] of this.inputs) if (t >= end) s[p] = undefined;
    this.gone[p] = { from: end, until: Infinity };
    this.muted[p] = false;
    this.weNeed[p] = end;
    this.unconfirm(end);
    this.recheck(end);
  }

  /** Seat p plays again from tick `at` (a newcomer took it, holding everything from tick `since`). */
  resumeSeat(p: number, at: number, since: number): void {
    const g = this.gone[p];
    this.gone[p] = { from: g ? Math.min(g.from, at) : at, until: at };
    this.muted[p] = false;
    this.weNeed[p] = at;
    this.theyNeed[p] = since;
    for (const [t, s] of this.inputs) if (t >= at) s[p] = undefined;
    this.unconfirm(at);
    this.recheck(at);
  }

  /** The world at the confirmed tick, and every input known from there, for a rejoining peer. */
  handover(): Handover {
    const c = this.confirmed;
    const snap = c === this.tick ? snapshot(this.world) : this.snaps[c % this.snaps.length]!.map((b) => b.slice());
    let last = c;
    for (const t of this.inputs.keys()) if (t >= last) last = t + 1;
    const rows: (PlayerInput | undefined)[][] = [];
    for (let t = c; t < last; t++) rows.push(this.seats.map((_, p) => this.inputs.get(t)?.[p]));
    return { tick: c, snap, inputs: encodeInputs(c, rows, this.seats.length), gone: this.gone.map((g) => g && { ...g }) };
  }

  /** Start this (fresh) session inside a running match from a handover; our own seat plays from tick `at`. */
  startMidway(h: Handover, at: number): void {
    restore(this.world, h.snap);
    this.inputs.clear(); this.used.clear(); this.hashes.clear(); this.snaps.fill(null); this.posTick.fill(-1);
    this.lastHash = [0, 0];
    const { first, rows } = decodeInputs(h.inputs);
    rows.forEach((row, k) => row.forEach((x, p) => { if (x) this.slot(first + k)[p] = x; }));
    const me = this.me();
    this.gone = h.gone.map((g) => g && { ...g });
    this.gone[me] = { from: Math.min(this.gone[me]?.from ?? h.tick, h.tick), until: at };
    this.muted = this.seats.map(() => false);
    this.confirmed = h.tick;
    this.scheduled = at;
    this.seats.forEach((_, p) => {
      let t = h.tick;
      while (this.inputs.get(t)?.[p]) t++;
      this.weNeed[p] = p === me ? at : t;
      this.theyNeed[p] = at;
    });
  }

  /**
   * How many ticks the furthest peer seems ahead of us (from the inputs they've sent; they schedule
   * `delay` ahead, as we do). A page that fell behind, or just rejoined, runs extra ticks to catch up.
   */
  get lag(): number {
    const me = this.me();
    let far = -Infinity;
    this.seats.forEach((_, p) => { if (p !== me && !this.out(p) && !this.isGone(this.tick, p)) far = Math.max(far, this.weNeed[p] - this.delay); });
    return far === -Infinity ? 0 : far - this.tick;
  }

  /** Ticks from t on may have been confirmed with inputs that just changed: they aren't any more. */
  private unconfirm(t: number): void {
    if (this.confirmed <= t) return;
    this.confirmed = t;
    for (const k of [...this.hashes.keys()]) if (k > t) this.hashes.delete(k);
    if (this.lastHash[0] > t) this.lastHash = [0, 0];
  }

  /** After the inputs of some seat changed from tick t on: rewind to the first tick that ran differently. */
  private recheck(t: number): void {
    for (let k = Math.max(t, this.tick - this.window); k < this.tick; k++) {
      const u = this.used.get(k);
      if (u && u.some((x, p) => !same(x, this.inputFor(k, p)))) { this.rewindTo = Math.min(this.rewindTo, k); return; }
    }
  }

  /** What seat p's input for tick t is: the real one, or a guess from the last real one. */
  private inputFor(t: number, p: number): PlayerInput {
    if (this.isGone(t, p)) return NO_INPUT;
    const real = this.inputs.get(t)?.[p];
    if (real) return real;
    for (let k = t - 1; k >= Math.max(0, t - 120); k--) {
      const prev = this.inputs.get(k)?.[p];
      if (!prev) continue;
      const [aimX, aimY] = this.predictAim(t, p, k, prev);
      return { ...prev, press0: 0, press1: 0, aimX, aimY };
    }
    return NO_INPUT;
  }

  /** Index into posX / posY of seat p's wizard at the start of tick t, or -1 if we don't have it. */
  private posAt(t: number, p: number): number {
    if (t < 0) return -1;
    const r = t % POS_RING;
    return this.posTick[r] === t ? r * this.seats.length + p : -1;
  }

  /**
   * Seat p's aim for tick t, guessed from its last real input (tick k). Players aim with a cursor on
   * the floor, so while they walk with the mouse still, the relative aim changes every tick and the
   * point on the floor doesn't. Each real input pins that point to within half an aim unit (it was
   * rounded), measured from where their wizard stood when they sampled it, `d` ticks before the
   * tick it is for (their input delay, which we don't know: the d that explains the longest run of
   * recent inputs wins). The intersection of those intervals is the guess, aimed at from where the
   * wizard stands at tick t. When recent inputs don't fit a still point but turn steadily, the
   * sweep carries on for a few ticks instead. These are only guesses: they never reach a confirmed
   * tick, so they need not match between peers (Math.atan2 is fine here).
   */
  private predictAim(t: number, p: number, k: number, last: PlayerInput): [number, number] {
    if (this.aimPrediction === 'relative') return [last.aimX, last.aimY];
    const U = AIM_UNIT;
    // 1. A still cursor.
    let bestD = -1, bestN = 0, mx = 0, my = 0;
    for (let d = 0; d <= MAX_SAMPLE_DELAY; d++) {
      if (this.posAt(t - d, p) < 0) continue;
      let x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity, n = 0;
      for (let j = k; j > k - AIM_HISTORY; j--) {
        const x = this.inputs.get(j)?.[p], q = this.posAt(j - d, p);
        if (!x || q < 0) break;
        const nx0 = Math.max(x0, this.posX[q] + (x.aimX - 0.5) * U), nx1 = Math.min(x1, this.posX[q] + (x.aimX + 0.5) * U);
        const ny0 = Math.max(y0, this.posY[q] + (x.aimY - 0.5) * U), ny1 = Math.min(y1, this.posY[q] + (x.aimY + 0.5) * U);
        if (nx0 > nx1 || ny0 > ny1) break; // the cursor moved before this input
        x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1; n++;
      }
      if (n > bestN || (n > 0 && n === bestN && d === this.delay)) { bestD = d; bestN = n; mx = (x0 + x1) / 2; my = (y0 + y1) / 2; }
    }
    // 2. Aim that holds still relative to the wizard (a gamepad stick, or a cursor that follows):
    // when that explains more recent inputs than a still point on the floor, repeat it (and on a tie,
    // unless a sweep is under way: the aim just changed, and repeating it is the old, cautious guess).
    let rel = 0;
    for (let j = k; j > k - AIM_HISTORY; j--) {
      const x = this.inputs.get(j)?.[p];
      if (!x || x.aimX !== last.aimX || x.aimY !== last.aimY) break;
      rel++;
    }
    if (rel > bestN) return [last.aimX, last.aimY];
    // 3. A steady sweep (only when the aim is neither resting on the floor nor on the wizard).
    if (bestN < 3 && rel < 3) {
      const ang: number[] = [];
      for (let j = k; j > k - 5; j--) {
        const x = this.inputs.get(j)?.[p];
        if (!x || (x.aimX === 0 && x.aimY === 0)) break;
        ang.push(Math.atan2(x.aimY, x.aimX));
      }
      if (ang.length === 5) {
        const dl: number[] = [];
        for (let i = 0; i < 4; i++) { let v = ang[i] - ang[i + 1]; if (v > Math.PI) v -= 2 * Math.PI; if (v < -Math.PI) v += 2 * Math.PI; dl.push(v); }
        const mean = (dl[0] + dl[1] + dl[2] + dl[3]) / 4;
        if (Math.abs(mean) >= 0.01 && dl.every((v) => Math.abs(v - mean) <= 0.5 * Math.abs(mean))) {
          const w = Math.max(-SWEEP_MAX, Math.min(SWEEP_MAX, mean)), a = ang[0] + w * Math.min(t - k, SWEEP_TICKS), r = Math.hypot(last.aimX, last.aimY);
          return [clampAim(r * Math.cos(a)), clampAim(r * Math.sin(a))];
        }
      }
    }
    if (bestD < 0 || rel >= bestN) return [last.aimX, last.aimY];
    const q = this.posAt(t - bestD, p);
    return [clampAim((mx - this.posX[q]) / U), clampAim((my - this.posY[q]) / U)];
  }

  /** Every seat's input for tick t is real (or the seat is gone then). */
  private known(t: number): boolean {
    const s = this.inputs.get(t);
    return this.seats.every((_, p) => this.isGone(t, p) || !!s?.[p]);
  }

  private runTick(): void {
    const t = this.tick;
    this.snaps[t % this.snaps.length] = snapshotInto(this.world, this.snaps[t % this.snaps.length]);
    // Where every wizard stands now (the aim guess works from it); a wizard's body slot is its seat.
    const r = t % POS_RING, b = this.world.bodies;
    this.posTick[r] = t;
    this.seats.forEach((seat, p) => { this.posX[r * this.seats.length + p] = b.x[seat]; this.posY[r * this.seats.length + p] = b.y[seat]; });
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
    while (this.confirmed < this.tick && this.known(this.confirmed)) {
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
      if (!this.isGone(this.tick, me) && !this.inputs.get(this.tick)?.[me]) break; // our own input for this tick isn't scheduled yet
      if (this.tick - this.confirmed >= this.window) { this.stalls++; if (ran === 0) this.waitedTicks++; break; }
      this.runTick();
      ran++;
    }
    return ran;
  }
}
