// The battery's gate: a standing wall of fire you can walk through, and it burns you.
import { describe, expect, it } from 'vitest';
import { EL, N_EL, NO_INPUT, WALL, createWorld, step } from '../src';

const NO_INPUTS = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];

describe('the battery gate', () => {
  it('starts with a curtain of Shield + Fire + Fire across the opening, and no other room does', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    expect(w.walls.type[0]).toBe(WALL.curtain);
    expect(w.walls.els[EL.fire - 1]).toBe(2);
    expect(w.walls.els[EL.shield - 1]).toBe(1);
    expect(N_EL).toBeGreaterThan(0);
    expect(createWorld(1, 1, { room: 'sanctum' }).walls.type[0]).toBe(WALL.none);
  });

  it('burns a wizard in it, lets them stay there, and never goes out or costs Shield', () => {
    const w = createWorld(1, 1, { room: 'battery' }), b = w.bodies;
    const pool = w.seats.runes[EL.shield - 1];
    b.x[0] = 0; b.y[0] = -1;
    for (let i = 0; i < 90; i++) step(w, NO_INPUTS);
    expect(b.burn[0]).toBeGreaterThan(0);
    expect(Math.abs(b.y[0] + 1)).toBeLessThan(0.3);
    expect(w.walls.type[0]).toBe(WALL.curtain);
    expect(w.seats.runes[EL.shield - 1]).toBe(pool);
  });
});
