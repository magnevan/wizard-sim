// The infirmary (infirmary.ts): outside the main gate on the battery road, for now its two gates.
import { describe, expect, it } from 'vitest';
import { NO_INPUT, createWorld, markerOf, step, type PlayerInput, type World } from '../src';

const NONE: PlayerInput[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) step(w, NONE); };
const put = (w: World, i: number, id: string) => { const m = markerOf(w.def, id)!; w.bodies.x[i] = m.x; w.bodies.y[i] = m.y; w.bodies.vx[i] = w.bodies.vy[i] = 0; };

describe('the infirmary', () => {
  it('starts on the road in, going nowhere, with its well and its tiers', () => {
    const w = createWorld(7, 1, { room: 'infirmary' });
    run(w, 2);
    expect(w.mode.id).toBe('infirmary');
    expect(w.mode.leaveTo?.(w)).toBeUndefined(); // the start is clear of both gates
    expect(markerOf(w.def, 'well')).toBeDefined();
    expect(w.def.height).toBeDefined(); // written from its plan, with tiers
  });

  it('the main gate leads back to the courtyard, the east road on to the battery', () => {
    const w = createWorld(7, 1, { room: 'infirmary' });
    put(w, 0, 'gate-court');
    run(w, 1);
    expect(w.mode.leaveTo?.(w)).toBe('court');
    put(w, 0, 'gate-battery');
    run(w, 1);
    expect(w.mode.leaveTo?.(w)).toBe('battery');
  });
});
