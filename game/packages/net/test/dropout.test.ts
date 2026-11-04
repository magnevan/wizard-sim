import { describe, expect, it } from 'vitest';
import { botInput, createWorld, hashWorld, newBotMemory, NO_INPUT } from '@wizard-sim/sim';
import { LoopbackHub, RollbackSession } from '../src';

const WINDOW = 60;

/**
 * Three bot peers over a slow, lossy link. Seat 2 goes silent at `quitAt`; the others agree on the
 * drop (the highest tick either holds, as netplay.ts does). Optionally a fresh page takes seat 2
 * back at `rejoinAt` from the coordinator's handover.
 */
function run(opts: { quitAt: number; rejoinAt?: number; end: number }) {
  const hub = new LoopbackHub(3, { latency: 6, jitter: 4, loss: 0.1, seed: 9 });
  const seats = [0, 1, 2];
  const make = (s: number) => new RollbackSession(createWorld(21, 3, { room: 'arena' }), hub.endpoint(s), seats, 2, false, WINDOW);
  const peers: (RollbackSession | null)[] = seats.map(make);
  const mems = seats.map(() => newBotMemory());
  let dropped = false;
  let frame = 0;
  const live = () => peers.filter((x): x is RollbackSession => !!x);
  for (; frame < opts.end * 3 && live().some((x) => x.tick < opts.end); frame++) {
    if (frame === opts.quitAt) peers[2] = null; // the tab closed: no more packets from seat 2
    // 2.5 s of silence later (here: 40 frames), the survivors stop listening and agree on T.
    if (!dropped && frame === opts.quitAt + 40) {
      dropped = true;
      const [a, b] = [peers[0]!, peers[1]!];
      a.mute(2); b.mute(2);
      const holder = a.heldFrom(2) >= b.heldFrom(2) ? a : b;
      const end = holder.heldFrom(2);
      const tail = holder.inputsOf(2, end - 64, end);
      a.dropSeat(2, end, tail); b.dropSeat(2, end, tail);
    }
    if (opts.rejoinAt !== undefined && frame === opts.rejoinAt) {
      const coord = peers[0]!;
      const at = coord.tick + 30;
      coord.resumeSeat(2, at, coord.tick); // since: replaced below by the handover's tick
      const h = coord.handover();
      coord.resumeSeat(2, at, h.tick);
      peers[1]!.resumeSeat(2, at, h.tick);
      const fresh = make(2);
      fresh.startMidway(h, at);
      mems[2] = newBotMemory();
      peers[2] = fresh;
    }
    peers.forEach((x, p) => {
      if (!x) return;
      x.poll();
      const runs = 1 + Math.max(0, Math.min(6, x.lag - 2)); // a page behind catches up
      for (let r = 0; r < runs && x.tick < opts.end; r++) {
        while (x.nextScheduled <= x.tick + x.delay) x.pushLocal(x.tick < opts.end - 60 ? botInput(x.world, p, mems[p]) : NO_INPUT);
        x.advance(1);
      }
      if (frame % 2 === 0) x.flush();
    });
    hub.tick();
  }
  for (let k = 0; k < 90; k++) { live().forEach((x) => { x.poll(); x.flush(); x.advance(0); }); hub.tick(); }
  return { peers: live(), frame };
}

describe('drop-out and rejoin', () => {
  it('two peers carry on in the same world after the third leaves', () => {
    const { peers } = run({ quitAt: 200, end: 700 });
    expect(peers.length).toBe(2);
    expect(peers[0].tick).toBe(700);
    expect(peers[1].tick).toBe(700);
    expect(hashWorld(peers[0].world)).toBe(hashWorld(peers[1].world));
    expect(peers.every((x) => x.desyncs.length === 0)).toBe(true);
    expect(peers[0].isOut(2)).toBe(true);
  });

  it('a fresh page takes the seat back mid-match and all three agree', () => {
    const { peers } = run({ quitAt: 200, rejoinAt: 400, end: 900 });
    expect(peers.length).toBe(3);
    expect(new Set(peers.map((x) => x.tick))).toEqual(new Set([900]));
    expect(new Set(peers.map((x) => hashWorld(x.world))).size).toBe(1);
    expect(peers.every((x) => x.desyncs.length === 0)).toBe(true);
    expect(peers[2].isOut(2)).toBe(false);
  });
});
