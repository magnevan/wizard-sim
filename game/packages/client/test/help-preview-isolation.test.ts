import { describe, expect, it } from 'vitest';
import { EL, MAX_SEATS, NO_INPUT, createWorld, hashWorld, hitKindNow, scriptedInput, setHitKind, step, type PlayerInput } from '@wizard-sim/sim';
import { demoInput } from '../src/demo';

/**
 * The help panel steps preview worlds between the game's ticks (help-preview.ts). The game's world
 * must come out bit-identical: previews have their own World, and the one piece of sim module
 * state a hit leaves behind (the hit kind) is put back after each preview step.
 */
describe('help previews leave the game world alone', () => {
  it('the scripted run hashes the same with preview worlds stepped in between', () => {
    const run = (withPreviews: boolean): number => {
      const w = createWorld(7, 2);
      const previews = withPreviews ? [createWorld(11, 1), createWorld(11, 1)] : [];
      const demos = [{ els: [EL.earth, EL.fire], cast: 'force' }, { els: [EL.water, EL.cold], cast: 'area' }];
      for (let t = 0; t < 900; t++) {
        const inputs: PlayerInput[] = [];
        for (let p = 0; p < MAX_SEATS; p++) inputs.push(p < 2 ? scriptedInput(t, p) : NO_INPUT);
        step(w, inputs);
        previews.forEach((pw, k) => {
          const kind = hitKindNow();
          const pin: PlayerInput[] = new Array(MAX_SEATS).fill(NO_INPUT);
          pin[0] = demoInput(pw, t % 340, 0, demos[k]);
          step(pw, pin);
          setHitKind(kind);
        });
      }
      return hashWorld(w);
    };
    expect(run(true)).toBe(run(false));
  });
});
