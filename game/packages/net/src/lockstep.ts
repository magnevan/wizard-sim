/**
 * Deterministic lockstep (docs/explorations/2026-11-04-engine-options.md): every peer runs the
 * same sim and only inputs cross the network. A local input is scheduled `delay` ticks ahead, so
 * it usually reaches the others before they need it; a tick runs only when every seat's input for
 * it is in. Aim, camera and cast-start effects are predicted locally by the client, so the delay
 * is felt as little as possible.
 *
 * Over an unreliable transport: each packet carries every input the receiver hasn't acknowledged
 * yet (up to 120), plus our acknowledgement of theirs, so lost packets cost nothing but time.
 * Every 30 ticks peers exchange a hash of the world; a mismatch is a desync, reported with the tick.
 *
 * RollbackSession (rollback.ts) runs on the same input pipeline and packets.
 */
import { INPUT_BYTES, NO_INPUT, decodeInput, encodeInput, hashWorld, quantize, step, type PlayerInput, type World } from '@wizard-sim/sim';
import type { Transport } from './transport';

const MSG_INPUTS = 1;
/** One packet for all peers: our inputs plus an ack for each of them (broadcast transports). */
const MSG_ALL = 2;
/** At most this many inputs per packet: enough to fill a rejoining peer's gap of up to 2 s. */
const MAX_RESEND = 120;
export const HASH_EVERY = 30;

export interface Desync { tick: number; mine: number; theirs: number; peer: number }

export class LockstepSession {
  /** inputs[tick][seat] */
  protected inputs = new Map<number, (PlayerInput | undefined)[]>();
  /** The next tick a local input will be scheduled for. */
  protected scheduled: number;
  /** Per peer: the next of our ticks they still need (everything before is acknowledged). */
  protected theyNeed: number[];
  /** Per peer: the next of their ticks we still need. */
  protected weNeed: number[];
  protected hashes = new Map<number, number>();
  protected lastHash: [number, number] = [0, 0];
  readonly desyncs: Desync[] = [];
  /** Ticks this peer spent waiting on someone's input. */
  stalls = 0;
  /** Called around every step (the client's view interpolates and collects events here). */
  hooks: { before?: (w: World) => void; after?: (w: World) => void; preRewind?: (w: World) => void; postRewind?: (w: World) => void } = {};

  /**
   * `autoFlush`: send after every local input (fine for per-peer datagrams). Turn it off on
   * rate-limited transports and call flush() a few times a second instead.
   */
  /**
   * How many ticks ahead this peer schedules its input. Each peer may choose its own and change it
   * at any time (the sim only needs every seat's input for a tick, however early it was sent):
   * raise it on a slow link, lower it when the link is quick. Raising it means the next inputs fill
   * the gap; lowering it means waiting until the sim catches up.
   */
  delay: number;
  /** Ticks this peer could not run because someone's input wasn't in yet (one per stalled advance()). */
  waitedTicks = 0;

  constructor(readonly world: World, readonly net: Transport, readonly seats: readonly number[], delay = 4, readonly autoFlush = true) {
    this.delay = delay;
    this.scheduled = delay;
    this.theyNeed = seats.map(() => delay);
    this.weNeed = seats.map(() => delay);
    // The first `delay` ticks have no inputs from anyone: everyone starts idle.
    for (let t = 0; t < delay; t++) this.inputs.set(t, seats.map(() => NO_INPUT));
  }

  get tick(): number { return this.world.clock[0]; }
  /** The tick the next local input will be scheduled for (a client keeps this about `delay` ahead of `tick`). */
  get nextScheduled(): number { return this.scheduled; }
  protected me(): number { return this.seats.indexOf(this.net.self); }
  /** Rollback keeps inputs for ticks it already ran (they may correct a prediction). */
  protected acceptsPast = false;
  /** A peer's input for tick t arrived (rollback compares it with what it predicted). */
  protected onInput(_t: number, _p: number, _input: PlayerInput): void {}
  /** Seat p has left (rollback's drop-out): ignore its packets and don't send for it. */
  protected out(_p: number): boolean { return false; }

  /** The oldest of our inputs still to send, from `need`, skipping any no longer kept. Returns [first, count]. */
  private range(need: number): [number, number] {
    const me = this.me();
    let first = Math.max(need, this.scheduled - MAX_RESEND);
    while (first < this.scheduled && !this.inputs.get(first)?.[me]) first++;
    return [first, Math.min(this.scheduled - first, MAX_RESEND)];
  }

  protected slot(t: number): (PlayerInput | undefined)[] {
    let s = this.inputs.get(t);
    if (!s) { s = this.seats.map(() => undefined); this.inputs.set(t, s); }
    return s;
  }

  /** Hand over this peer's input for the next scheduled tick, and send what peers still need. */
  pushLocal(input: PlayerInput): void {
    // quantize() can leave a -0 (Math.round(-0.3)), which the wire turns into 0 for everyone else;
    // the sim keeps aim in Float64Arrays, so our own world would hold different bytes. `+ 0` makes it 0.
    const q = quantize(input);
    this.slot(this.scheduled)[this.me()] = { buttons: q.buttons, press0: q.press0, press1: q.press1, moveX: q.moveX + 0, moveY: q.moveY + 0, aimX: q.aimX + 0, aimY: q.aimY + 0 };
    this.scheduled++;
    if (this.autoFlush) this.flush();
  }

  /** Sends each peer the inputs it hasn't acknowledged, our acks, and our latest hash. */
  flush(): void {
    const me = this.me();
    if (this.net.broadcast) { this.flushAll(me); return; }
    this.seats.forEach((seat, p) => {
      if (p === me || this.out(p)) return;
      const [first, count] = this.range(this.theyNeed[p]);
      const buf = new Uint8Array(1 + 1 + 4 + 4 + 1 + count * INPUT_BYTES + 8);
      const v = new DataView(buf.buffer);
      v.setUint8(0, MSG_INPUTS); v.setUint8(1, this.net.self);
      v.setUint32(2, this.weNeed[p], true);
      v.setUint32(6, first, true); v.setUint8(10, count);
      for (let k = 0; k < count; k++) encodeInput(this.inputs.get(first + k)![me]!, v, 11 + k * INPUT_BYTES);
      v.setUint32(11 + count * INPUT_BYTES, this.lastHash[0], true);
      v.setUint32(15 + count * INPUT_BYTES, this.lastHash[1], true);
      this.net.send(seat, buf);
    });
  }

  private flushAll(me: number): void {
    let need = this.scheduled;
    this.seats.forEach((_, p) => { if (p !== me && !this.out(p)) need = Math.min(need, this.theyNeed[p]); });
    const [first, count] = this.range(need);
    const peers = this.seats.length - 1;
    const head = 3 + peers * 5;
    const buf = new Uint8Array(head + 5 + count * INPUT_BYTES + 8);
    const v = new DataView(buf.buffer);
    v.setUint8(0, MSG_ALL); v.setUint8(1, this.net.self); v.setUint8(2, peers);
    let o = 3;
    this.seats.forEach((seat, p) => { if (p === me) return; v.setUint8(o, seat); v.setUint32(o + 1, this.weNeed[p], true); o += 5; });
    v.setUint32(o, first, true); v.setUint8(o + 4, count); o += 5;
    for (let k = 0; k < count; k++) encodeInput(this.inputs.get(first + k)![me]!, v, o + k * INPUT_BYTES);
    o += count * INPUT_BYTES;
    v.setUint32(o, this.lastHash[0], true); v.setUint32(o + 4, this.lastHash[1], true);
    this.net.broadcast!(buf);
  }

  /** Reads what arrived: peers' inputs, their acks of ours, their hashes. */
  poll(): void {
    for (const { from, data } of this.net.receive()) {
      const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const type = v.getUint8(0);
      if (type !== MSG_INPUTS && type !== MSG_ALL) continue;
      const p = this.seats.indexOf(from);
      if (p < 0 || p === this.me() || this.out(p)) continue;
      let o: number;
      if (type === MSG_INPUTS) { this.theyNeed[p] = Math.max(this.theyNeed[p], v.getUint32(2, true)); o = 6; }
      else {
        const peers = v.getUint8(2);
        for (let k = 0; k < peers; k++) if (v.getUint8(3 + k * 5) === this.net.self) this.theyNeed[p] = Math.max(this.theyNeed[p], v.getUint32(4 + k * 5, true));
        o = 3 + peers * 5;
      }
      const first = v.getUint32(o, true), count = v.getUint8(o + 4);
      o += 5;
      for (let k = 0; k < count; k++) {
        const t = first + k;
        if (t < this.tick && !this.acceptsPast) continue; // already ran
        const s = this.slot(t);
        if (!s[p]) { s[p] = decodeInput(v, o + k * INPUT_BYTES); this.onInput(t, p, s[p]!); }
      }
      while (this.inputs.get(this.weNeed[p])?.[p]) this.weNeed[p]++;
      o += count * INPUT_BYTES;
      const ht = v.getUint32(o, true), hh = v.getUint32(o + 4, true);
      if (ht && this.hashes.has(ht) && this.hashes.get(ht) !== hh && !this.desyncs.some((d) => d.tick === ht && d.peer === from)) {
        this.desyncs.push({ tick: ht, mine: this.hashes.get(ht)!, theirs: hh, peer: from });
      }
    }
  }

  /** Runs every tick whose inputs are all in. Returns how many ran. */
  advance(max = 8): number {
    let ran = 0;
    while (ran < max) {
      const s = this.inputs.get(this.tick);
      if (!s || s.some((x) => !x)) { this.stalls++; if (ran === 0) this.waitedTicks++; break; }
      // Seats are world seats: build the full input array in seat order.
      const all: PlayerInput[] = [];
      this.seats.forEach((seat, p) => { all[seat] = s[p]!; });
      for (let i = 0; i < all.length; i++) if (!all[i]) all[i] = NO_INPUT;
      this.inputs.delete(this.tick - 64);
      this.hooks.before?.(this.world);
      step(this.world, all);
      this.hooks.after?.(this.world);
      ran++;
      if (this.tick % HASH_EVERY === 0) {
        const h = hashWorld(this.world);
        this.hashes.set(this.tick, h);
        this.hashes.delete(this.tick - HASH_EVERY * 64);
        this.lastHash = [this.tick, h];
      }
    }
    return ran;
  }
}
