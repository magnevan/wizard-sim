// The battery's gate: a standing wall of fire you can walk through, and it burns you.
import { describe, expect, it } from 'vitest';
import { BATTERY, BTN, EL, N_EL, NO_INPUT, WALL, createWorld, joinSeat, runeMax, step } from '../src';

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

describe('driving a defence', () => {
  const press = (b: number) => [{ ...NO_INPUT, buttons: b }, NO_INPUT, NO_INPUT, NO_INPUT];
  const atPedestal = () => {
    const w = createWorld(1, 1, { room: 'battery' }), pad = w.def.props.filter((p) => p.asset === 'control-pedestal')[1];
    w.bodies.x[0] = pad.x + 1.2; w.bodies.y[0] = pad.y;
    return { w, pad, tower: w.def.props.filter((p) => p.asset === 'defence-tower')[1] };
  };
  const take = (w: ReturnType<typeof createWorld>) => { step(w, press(BTN.use)); step(w, NO_INPUTS); };

  it('steps up to the nearest pedestal, moves the cast point outside the wall, and gives the defence its Fire', () => {
    const { w, tower } = atPedestal();
    take(w);
    expect(w.battery!.drive[0]).toBe(1);
    expect(w.bodies.x[0]).toBeCloseTo(tower.x, 5);
    expect(w.bodies.y[0]).toBeLessThan(BATTERY.wallY);
    expect(runeMax(w, 0, EL.fire)).toBeGreaterThan(0);
    expect(runeMax(w, 0, EL.cold)).toBe(0);
  });

  it('does nothing away from a pedestal, and you have no runes of your own yet', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    take(w);
    expect(w.battery!.drive[0]).toBe(-1);
    expect(runeMax(w, 0, EL.fire)).toBe(0);
  });

  it('holds you still and unhurt, and stepping away puts you back where you stood', () => {
    const { w } = atPedestal();
    const hx = w.bodies.x[0], hy = w.bodies.y[0];
    take(w);
    const x = w.bodies.x[0], y = w.bodies.y[0];
    for (let i = 0; i < 30; i++) step(w, [{ ...NO_INPUT, moveX: 127 }, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(w.bodies.x[0]).toBe(x);
    expect(w.bodies.y[0]).toBe(y);
    step(w, press(BTN.use));
    expect(w.battery!.drive[0]).toBe(-1);
    expect(w.bodies.x[0]).toBeCloseTo(hx, 0);
    expect(w.bodies.y[0]).toBeCloseTo(hy, 0);
  });

  it('keeps the aim within 45 degrees of straight out', () => {
    const { w } = atPedestal();
    take(w);
    step(w, [{ ...NO_INPUT, aimX: 320, aimY: 320 }, NO_INPUT, NO_INPUT, NO_INPUT]); // down and to the east: behind the wall
    expect(w.seats.aimY[0]).toBeLessThan(0);
    expect(Math.abs(Math.atan2(w.seats.aimX[0], -w.seats.aimY[0])) / (2 * Math.PI)).toBeCloseTo(BATTERY.swing, 3);
  });

  it('two players can\'t share a defence', () => {
    const { w, pad } = atPedestal();
    joinSeat(w, 1);
    w.bodies.x[1] = pad.x - 1.2; w.bodies.y[1] = pad.y;
    take(w);
    step(w, [NO_INPUT, { ...NO_INPUT, buttons: BTN.use }, NO_INPUT, NO_INPUT]);
    expect(w.battery!.drive[0]).toBe(1);
    expect(w.battery!.drive[1]).toBe(-1);
  });
});
