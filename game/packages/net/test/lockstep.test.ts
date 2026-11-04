import { describe, expect, it } from 'vitest';
import { botInput, createWorld, hashWorld, newBotMemory, step } from '@wizard-sim/sim';
import { LockstepSession, LoopbackHub } from '../src';

/**
 * N peers, each running its own world, piloted by bots (each peer only computes its own seat's
 * input). After the run every world must hash the same, and match a single local run fed the
 * same inputs.
 */
function play(peers: number, ticks: number, net: { latency?: number; jitter?: number; loss?: number }, broadcast = false) {
  const hub = new LoopbackHub(peers, { ...net, seed: 3 });
  const seats = Array.from({ length: peers }, (_, i) => i);
  const ends = seats.map((s) => { const e = hub.endpoint(s); if (!broadcast) delete (e as { broadcast?: unknown }).broadcast; return e; });
  const sessions = seats.map((s) => new LockstepSession(createWorld(11, peers, { room: 'arena' }), ends[s], seats, broadcast ? 8 : 4, !broadcast));
  const mems = seats.map(() => newBotMemory());
  for (let frame = 0; frame < ticks * 8 && sessions.some((x) => x.tick < ticks); frame++) {
    sessions.forEach((x, p) => {
      x.poll();
      // Like a real client: produce a local input when the schedule is near the sim (no runaway).
      if (x.tick < ticks && x.nextScheduled < x.tick + 4 + 1) x.pushLocal(botInput(x.world, p, mems[p]));
      else if (!broadcast) x.flush();
      if (broadcast && frame % 3 === 0) x.flush(); // a few packets a second, as the room's budget wants
      if (x.tick < ticks) x.advance(1);
    });
    hub.tick();
  }
  return sessions;
}

describe('lockstep', () => {
  it('two peers over a clean link end in the same world', () => {
    const [a, b] = play(2, 600, { latency: 2 });
    expect(a.tick).toBeGreaterThanOrEqual(600);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(a.desyncs).toEqual([]);
  });

  it('four peers over a lossy, jittery link still agree', () => {
    const s = play(4, 600, { latency: 3, jitter: 4, loss: 0.2 });
    expect(s.map((x) => x.tick)).toEqual([600, 600, 600, 600]);
    const hashes = s.map((x) => hashWorld(x.world));
    expect(new Set(hashes).size).toBe(1);
    expect(s.every((x) => x.desyncs.length === 0)).toBe(true);
  });

  it('broadcast mode (one packet for everyone, 20 a second) keeps four lossy peers in step', () => {
    const s = play(4, 600, { latency: 4, jitter: 6, loss: 0.15 }, true);
    expect(s.map((x) => x.tick)).toEqual([600, 600, 600, 600]);
    expect(new Set(s.map((x) => hashWorld(x.world))).size).toBe(1);
  });

  it('a tampered world is caught as a desync', () => {
    const hub = new LoopbackHub(2, { latency: 1 });
    const seats = [0, 1];
    const s = seats.map((x) => { const e = hub.endpoint(x); delete (e as { broadcast?: unknown }).broadcast; return new LockstepSession(createWorld(2, 2), e, seats, 2); });
    for (let f = 0; f < 400; f++) {
      s.forEach((x) => { x.poll(); if (x.nextScheduled < x.tick + 3) x.pushLocal({ buttons: 0, press0: 0, press1: 0, moveX: 50, moveY: 0, aimX: 32, aimY: 0 }); else x.flush(); x.advance(1); });
      if (f === 100) s[1].world.bodies.x[0] += 0.5; // one peer's world drifts
      hub.tick();
    }
    expect(s[0].desyncs.length + s[1].desyncs.length).toBeGreaterThan(0);
  });

  it('the same inputs replayed locally give the same world', () => {
    const w1 = createWorld(4, 1), w2 = createWorld(4, 1);
    const mem1 = newBotMemory(), mem2 = newBotMemory();
    for (let t = 0; t < 300; t++) { step(w1, [botInput(w1, 0, mem1)]); step(w2, [botInput(w2, 0, mem2)]); }
    expect(hashWorld(w1)).toBe(hashWorld(w2));
  });
});
