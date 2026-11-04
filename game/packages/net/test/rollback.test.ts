import { describe, expect, it } from 'vitest';
import { BTN, botInput, createWorld, hashWorld, newBotMemory, quantize, NO_INPUT } from '@wizard-sim/sim';
import { LoopbackHub, RollbackSession } from '../src';

/** N bot-piloted peers on rollback over a slow, lossy, jittery link (latency in ticks). */
function play(peers: number, ticks: number, net: { latency?: number; jitter?: number; loss?: number }) {
  const hub = new LoopbackHub(peers, { ...net, seed: 5 });
  const seats = Array.from({ length: peers }, (_, i) => i);
  const sessions = seats.map((s) => new RollbackSession(createWorld(11, peers, { room: 'arena' }), hub.endpoint(s), seats, 1, false));
  const mems = seats.map(() => newBotMemory());
  let frame = 0;
  // Each frame every peer runs one tick (no waiting); after `ticks`, everyone idles until all inputs are confirmed.
  for (; frame < ticks * 4 && sessions.some((x) => x.tick < ticks + 60); frame++) {
    sessions.forEach((x, p) => {
      x.poll();
      if (x.tick < ticks + 60 && x.nextScheduled <= x.tick + x.delay) x.pushLocal(x.tick < ticks ? botInput(x.world, p, mems[p]) : NO_INPUT);
      if (frame % 2 === 0) x.flush();
      if (x.tick < ticks + 60) x.advance(1);
    });
    hub.tick();
  }
  // Let the last corrections land.
  for (let k = 0; k < 60; k++) { sessions.forEach((x) => { x.poll(); x.flush(); x.advance(0); }); hub.tick(); }
  return sessions;
}

describe('rollback', () => {
  it('two peers 6 ticks apart (100 ms) end in the same world, never waiting', () => {
    const [a, b] = play(2, 600, { latency: 6, jitter: 3 });
    expect(a.tick).toBe(b.tick);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(a.replayed).toBeGreaterThan(0); // predictions were corrected
    expect(a.waitedTicks).toBe(0);
    expect(a.desyncs).toEqual([]);
  });

  it('four peers over a 15%-loss, 200 ms link still agree', () => {
    const s = play(4, 600, { latency: 12, jitter: 6, loss: 0.15 });
    expect(new Set(s.map((x) => x.tick)).size).toBe(1);
    expect(new Set(s.map((x) => hashWorld(x.world))).size).toBe(1);
    expect(s.every((x) => x.desyncs.length === 0)).toBe(true);
  });

  it('your own input takes effect at once, however slow the link', () => {
    const hub = new LoopbackHub(2, { latency: 20 });
    const a = new RollbackSession(createWorld(1, 2), hub.endpoint(0), [0, 1], 1, false);
    const x0 = a.world.bodies.x[0];
    for (let k = 0; k < 10; k++) { a.pushLocal(quantize({ ...NO_INPUT, moveX: 127, aimX: 32 })); a.advance(1); }
    expect(a.world.bodies.x[0]).toBeGreaterThan(x0 + 0.3);
    void BTN;
  });
});
