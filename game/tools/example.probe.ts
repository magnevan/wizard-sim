/**
 * An example probe (npm run probe -- tools/example.probe.ts): a sim world stepped through a five-rune Fire patch, the
 * burning floor cells printed every half second. Copy it to shots/tmp/<name>.probe.ts (ignored) for a throwaway.
 */
import { it } from 'vitest';
import { MAX_SEATS, NO_INPUT, SURF, createWorld, devRefillRunes, step } from '../packages/sim/src';
import { demoInput, parseDemo } from '../packages/client/src/demo';

it('probe', () => {
  const w = createWorld(7, 1, { room: 'sanctum', dummies: false });
  w.bodies.x[0] = -4; w.bodies.y[0] = 0;
  devRefillRunes(w, 0);
  const d = parseDemo('fire,fire,fire,fire,fire/place@1.5,0')!;
  for (let k = 0; k < 600; k++) {
    step(w, Array.from({ length: MAX_SEATS }, (_, p) => (p === 0 ? demoInput(w, k, 0, d) : NO_INPUT)));
    if (k % 30 === 0) console.log(`t=${(k / 60).toFixed(1)} s  burning cells: ${w.surf.kind.filter((s) => s === SURF.fire).length}`);
  }
});
