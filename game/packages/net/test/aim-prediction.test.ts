/**
 * Remote aim is guessed in world space (rollback.ts, predictAim): a player walking with the mouse
 * still keeps aiming at the same spot on the floor, so the guess should rarely be wrong, and a
 * steady sweep should carry on. Predictions never reach confirmed state, so peers that guess
 * differently (or not at all) still end in the same world.
 */
import { describe, expect, it } from 'vitest';
import { AIM_UNIT, NO_INPUT, createWorld, hashWorld, quantize, type PlayerInput, type World } from '@wizard-sim/sim';
import { LoopbackHub, RollbackSession, type AimPrediction } from '../src';

type Pilot = (w: World, seat: number, t: number) => PlayerInput;

const DIRS = [[1, 0], [0.7, 0.7], [-1, 0], [0, -1], [-0.7, 0.7], [1, -0.3]];
/** Walks a new way every 1.5 s, cursor resting on one spot of the floor for 4 s at a time (as a mouse player does). */
const walker: Pilot = (w, seat, t) => {
  const [mx, my] = DIRS[(Math.floor(t / 90) + seat) % DIRS.length];
  const spot = Math.floor(t / 240) + seat;
  const tx = [-5, 6, 2, -3][spot % 4], ty = [3, -2, 4, -4][spot % 4];
  const dx = tx - w.bodies.x[seat], dy = ty - w.bodies.y[seat];
  return quantize({ ...NO_INPUT, moveX: mx * 127, moveY: my * 127, aimX: dx / AIM_UNIT, aimY: dy / AIM_UNIT });
};
/** Stands and sweeps the aim round at 0.05 rad a tick for a second, then rests for half a second. */
const sweeper: Pilot = (_w, seat, t) => {
  const a = 0.05 * Math.min(t % 90, 60) + seat;
  return quantize({ ...NO_INPUT, aimX: (Math.cos(a) * 4) / AIM_UNIT, aimY: (Math.sin(a) * 4) / AIM_UNIT });
};

/** N peers on rollback over a slow link, each guessing remote aim its own way; every seat flies `pilot`. */
function play(modes: AimPrediction[], ticks: number, pilot: Pilot, net: { latency?: number; jitter?: number; loss?: number }) {
  const peers = modes.length;
  const hub = new LoopbackHub(peers, { ...net, seed: 9 });
  const seats = Array.from({ length: peers }, (_, i) => i);
  const sessions = seats.map((s) => {
    const x = new RollbackSession(createWorld(3, peers, { room: 'sanctum' }), hub.endpoint(s), seats, 1, false);
    x.aimPrediction = modes[s];
    return x;
  });
  for (let frame = 0; frame < ticks * 4 && sessions.some((x) => x.tick < ticks + 60); frame++) {
    sessions.forEach((x, p) => {
      x.poll();
      if (x.tick < ticks + 60 && x.nextScheduled <= x.tick + x.delay) x.pushLocal(x.tick < ticks ? pilot(x.world, p, x.tick) : NO_INPUT);
      if (frame % 2 === 0) x.flush();
      if (x.tick < ticks + 60) x.advance(1);
    });
    hub.tick();
  }
  for (let k = 0; k < 60; k++) { sessions.forEach((x) => { x.poll(); x.flush(); x.advance(0); }); hub.tick(); }
  return sessions;
}

const sum = (s: RollbackSession[], f: (x: RollbackSession) => number) => s.reduce((a, x) => a + f(x), 0);

describe('aim prediction', () => {
  it('a walker aiming at a still spot: far fewer rewound ticks in world space', () => {
    const link = { latency: 6, jitter: 3 };
    const before = play(['relative', 'relative'], 1200, walker, link);
    const after = play(['world', 'world'], 1200, walker, link);
    const rb = sum(before, (x) => x.replayed), ra = sum(after, (x) => x.replayed);
    const wb = sum(before, (x) => x.guesses.wrong) / sum(before, (x) => x.guesses.checked);
    const wa = sum(after, (x) => x.guesses.wrong) / sum(after, (x) => x.guesses.checked);
    console.log(`walker, 100 ms: replayed ${rb} -> ${ra} ticks; wrong guesses ${(wb * 100).toFixed(0)}% -> ${(wa * 100).toFixed(0)}%`);
    expect(ra).toBeLessThan(rb * 0.4);
    for (const s of [before, after]) {
      expect(s[0].tick).toBe(s[1].tick);
      expect(hashWorld(s[0].world)).toBe(hashWorld(s[1].world));
      expect(s.every((x) => x.desyncs.length === 0)).toBe(true);
    }
    // the same match, whoever guesses how: the confirmed worlds are identical
    expect(hashWorld(before[0].world)).toBe(hashWorld(after[0].world));
  });

  it('a steady sweep carries on: the aim guesses land much closer', () => {
    const link = { latency: 6, jitter: 3 };
    const before = play(['relative', 'relative'], 900, sweeper, link);
    const after = play(['world', 'world'], 900, sweeper, link);
    const eb = sum(before, (x) => x.guesses.aimErr) / sum(before, (x) => x.guesses.checked);
    const ea = sum(after, (x) => x.guesses.aimErr) / sum(after, (x) => x.guesses.checked);
    console.log(`sweeper, 100 ms: mean aim error ${(eb * AIM_UNIT).toFixed(3)} -> ${(ea * AIM_UNIT).toFixed(3)} world units`);
    expect(ea).toBeLessThan(eb * 0.5);
    expect(hashWorld(before[0].world)).toBe(hashWorld(after[1].world));
  });

  it('aim held relative to the wizard (a gamepad stick) is still guessed right while walking', () => {
    const stick: Pilot = (_w, seat, t) => {
      const [mx, my] = DIRS[(Math.floor(t / 90) + seat) % DIRS.length];
      return quantize({ ...NO_INPUT, moveX: mx * 127, moveY: my * 127, aimX: mx * 96, aimY: my * 96 });
    };
    const link = { latency: 6, jitter: 3 };
    const before = play(['relative', 'relative'], 900, stick, link), after = play(['world', 'world'], 900, stick, link);
    const rb = sum(before, (x) => x.replayed), ra = sum(after, (x) => x.replayed);
    console.log(`stick walker, 100 ms: replayed ${rb} -> ${ra} ticks`);
    expect(ra).toBeLessThanOrEqual(rb * 1.1 + 20);
  });

  it('three peers guessing differently over a lossy, jittery 200 ms link still agree', () => {
    const s = play(['world', 'relative', 'world'], 900, walker, { latency: 12, jitter: 8, loss: 0.12 });
    expect(new Set(s.map((x) => x.tick)).size).toBe(1);
    expect(new Set(s.map((x) => hashWorld(x.world))).size).toBe(1);
    expect(s.every((x) => x.desyncs.length === 0)).toBe(true);
    console.log(`walker, 3 peers, 200 ms + 12% loss: replayed ${s.map((x) => x.replayed).join(' / ')} (world / relative / world)`);
  });
});
