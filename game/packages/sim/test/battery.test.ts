// The battery's gate: a standing wall of fire you can walk through, and it burns you.
import { describe, expect, it } from 'vitest';
import { BATTERY, BTN, EL, MODES, N_EL, NO_INPUT, WALL, createWorld, createWorldWith, joinSeat, runeMax, step } from '../src';
import { driveFace, driveTarget, sprayReach } from '../src/battery';
import { replaceWorld, sameLayout } from '../src/state';

describe('replaceWorld and the battery', () => {
  it('swaps pools when only one world has a battery, even at the same grid size', () => {
    // a world of the battery's size under another mode, without its pool, as a campaign room of the same size would be
    const w = createWorldWith(MODES.sandbox, 1, 1, { room: 'battery' });
    expect(w.dims).toEqual(createWorld(1, 1, { room: 'battery' }).dims);
    const fresh = createWorld(1, 1, { room: 'battery' });
    expect(sameLayout(w, fresh)).toBe(false);
    expect(() => replaceWorld(w, fresh)).not.toThrow();
    expect(w.battery).not.toBeNull();
  });
});

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
    const w = createWorld(1, 1, { room: 'battery' }), pad = w.def.props.filter((p) => p.asset === 'possession-circle')[1];
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

  it('turns the head no further than the swing, and never back over the wall', () => {
    const { w } = atPedestal();
    take(w);
    for (const aimX of [320, -320]) {
      step(w, [{ ...NO_INPUT, aimX, aimY: 320 }, NO_INPUT, NO_INPUT, NO_INPUT]); // down the map: behind the wall
      const off = driveFace(w, 0) - 0.75; // the head; the body faces the spray's way from the muzzle (driveSpray)
      expect(Math.abs(off)).toBeCloseTo(BATTERY.swing, 3);
      expect(Math.sign(off)).toBe(Math.sign(aimX));
    }
  });

  it('reaches further where the screen squashes the distance, up to a limit', () => {
    const right = sprayReach(Math.SQRT1_2, -Math.SQRT1_2), out = sprayReach(0, -1), up = sprayReach(-Math.SQRT1_2, -Math.SQRT1_2);
    expect(right).toBeCloseTo(BATTERY.sprayRange, 3);
    expect(out).toBeGreaterThan(right);
    expect(up).toBeGreaterThan(out);
    expect(up).toBeLessThanOrEqual(BATTERY.sprayMax);
  });

  it('places a spell well beyond the head\'s reach, but not behind the wall', () => {
    const { w } = atPedestal();
    take(w);
    step(w, [{ ...NO_INPUT, aimX: 0, aimY: -32 * 14 }, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(driveTarget(w, 0)[1]).toBeCloseTo(w.bodies.y[0] - 14, 3);
    step(w, [{ ...NO_INPUT, aimX: 320, aimY: 32 * 6 }, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(driveTarget(w, 0)[1]).toBeLessThan(BATTERY.wallY);
  });

  it('makes the same half-ring with the Weapon cast as with Area', () => {
    const ringWith = (cast: number) => {
      const { w } = atPedestal();
      take(w);
      step(w, [{ ...NO_INPUT, press0: EL.fire, press1: EL.fire }, NO_INPUT, NO_INPUT, NO_INPUT]);
      step(w, press(cast));
      let ring = null;
      for (let i = 0; i < 40 && !ring; i++) { ring = w.events.find((e) => e.kind === 'burst' && e.who === 0) ?? null; step(w, NO_INPUTS); }
      return ring;
    };
    const area = ringWith(BTN.area), weapon = ringWith(BTN.weapon);
    expect(area).not.toBeNull();
    expect(weapon).not.toBeNull();
    expect(weapon!.amount).toBeCloseTo(area!.amount!, 5);
    expect(weapon!.amount).toBeGreaterThanOrEqual(BATTERY.ringRadius);
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
