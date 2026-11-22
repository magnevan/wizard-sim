// The courtyard (court.ts): the opening's hub, for now its two gates out.
import { describe, expect, it } from 'vitest';
import { NO_INPUT, createWorld, markerOf, step, type PlayerInput, type World } from '../src';

const NONE: PlayerInput[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) step(w, NONE); };
const put = (w: World, i: number, id: string) => { const m = markerOf(w.def, id)!; w.bodies.x[i] = m.x; w.bodies.y[i] = m.y; w.bodies.vx[i] = w.bodies.vy[i] = 0; };

describe('the courtyard', () => {
  it('starts by the armillary, going nowhere, with no runes', () => {
    const w = createWorld(7, 1, { room: 'court' });
    run(w, 2);
    expect(w.mode.id).toBe('court');
    expect(w.mode.leaveTo?.(w)).toBeUndefined();
    expect(markerOf(w.def, 'armillary')).toBeDefined();
  });

  it('the west archway leads to the drill yard, the east gate to the battery', () => {
    const w = createWorld(7, 1, { room: 'court' });
    put(w, 0, 'gate-yard');
    run(w, 1);
    expect(w.mode.leaveTo?.(w)).toBe('yard');
    put(w, 0, 'gate-battery');
    run(w, 1);
    expect(w.mode.leaveTo?.(w)).toBe('battery');
  });
});
