import { describe, expect, it } from 'vitest';
import { EV, KIND, PHASE_ENC, botInput, createWorld, hashWorld, newBotMemory, step } from '../src';

function run(ticks: number, seed = 5) {
  const w = createWorld(seed, 2, { room: 'arena' });
  const mem = [newBotMemory(), newBotMemory()];
  let kills = 0;
  for (let t = 0; t < ticks; t++) {
    step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1])]);
    for (const e of w.events) if (e.ev === EV.death) kills++;
  }
  return { w, kills };
}

describe('bot pilots in the Arena', () => {
  it('two bots clear the first wave', () => {
    const { w, kills } = run(60 * 45);
    expect(kills).toBeGreaterThanOrEqual(6);
    expect(w.enc.state[1]).toBeGreaterThanOrEqual(2);
    void PHASE_ENC; void KIND;
  });

  it('a bot run replays to the same hash', () => {
    expect(hashWorld(run(60 * 20).w)).toBe(hashWorld(run(60 * 20).w));
  });
});
