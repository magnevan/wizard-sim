// The courtyard (court.ts): the opening's hub, for now its two gates out. Its room is made from the kit scene.
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

  it('is the kit scene\'s room: its gates and starts stand on walkable cells, its height edges are cliffs', () => {
    const w = createWorld(7, 1, { room: 'court' }), d = w.def;
    expect([d.w, d.h]).toEqual([204, 162]);    // tools/kit/scenes/court.scene.json, 1 sim u = 1 kit u
    const cell = (x: number, y: number) => d.terrain[Math.floor((y + d.h / 2) / 0.5)][Math.floor((x + d.w / 2) / 0.5)];
    for (const id of ['gate-yard', 'gate-battery', 'gate-north', 'gate-sea']) { const m = markerOf(d, id)!; expect(cell(m.x, m.y), id).toBe('.'); }
    for (const [x, y] of d.starts) expect(cell(x, y)).toBe('.');
    expect(d.height!.cliffs.length).toBeGreaterThan(0);
    expect(d.height!.rows.join('')).toContain('/');
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
