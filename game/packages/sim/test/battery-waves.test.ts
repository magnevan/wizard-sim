import { describe, expect, it } from 'vitest';
import { ARCH, BATTERY, BSTEP, BTN, KIND, MAX_SEATS, NO_INPUT, createWorld, step } from '../src';
import { BWAVES, muzzleOf } from '../src/battery-waves';
import { driveSpray } from '../src/battery';

const NO_INPUTS = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
type W = ReturnType<typeof createWorld>;
const idle = (w: W, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) step(w, NO_INPUTS); };
const enemies = (w: W) => {
  const out: number[] = [];
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) out.push(i);
  return out;
};
const clear = (w: W) => { for (const i of enemies(w)) w.bodies.kind[i] = KIND.none; };
const towers = (w: W) => w.def.props.filter((p) => p.asset === 'defence-tower');
/** Seat 0 takes defence 1 (the second tower from the west). */
function take(w: W) {
  const pad = w.def.props.filter((p) => p.asset === 'control-pedestal')[1];
  w.bodies.x[0] = pad.x + 1.2; w.bodies.y[0] = pad.y;
  step(w, [{ ...NO_INPUT, buttons: BTN.use }, NO_INPUT, NO_INPUT, NO_INPUT]);
  step(w, NO_INPUTS);
}

describe('the battery\'s lesson', () => {
  it('has goblins battering every defence\'s wall as you arrive, harmlessly, and they stay there', () => {
    const w = createWorld(1, 1, { room: 'battery' }), hp = w.bodies.hp[0];
    idle(w, 12);
    const es = enemies(w);
    expect(es).toHaveLength(towers(w).length * BWAVES.arrivals);
    for (const i of es) {
      const [mx, my] = muzzleOf(w, w.battery!.lane[i]);
      expect(Math.hypot(w.bodies.x[i] - mx, w.bodies.y[i] - my)).toBeLessThan(2.5);
    }
    expect(w.bodies.hp[0]).toBe(hp);
    expect(w.enc.state[1]).toBe(BSTEP.arrive);
  });

  it('once a defence is taken, teaches the ring: the other walls\' goblins come along to it', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 1);
    take(w);
    expect(w.enc.state[1]).toBe(BSTEP.ring);
    idle(w, 14);
    for (const i of enemies(w)) expect(Math.hypot(w.bodies.x[i] - w.bodies.x[0], w.bodies.y[i] - w.bodies.y[0])).toBeLessThan(4);
  });

  it('then the flamethrower, Place and the brute, each once the last is cleared, from the gap nearest the defence', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 1);
    take(w);
    const want = [[BSTEP.spray, ARCH.swarmer], [BSTEP.place, ARCH.caster], [BSTEP.brute, ARCH.brute]];
    for (const [s, arch] of want) {
      clear(w);
      idle(w, BWAVES.pause + 4);
      expect(w.enc.state[1]).toBe(s);
      const es = enemies(w);
      expect(es.length).toBeGreaterThan(0);
      for (const i of es) { expect(w.bodies.arch[i]).toBe(arch); expect(w.battery!.lane[i]).toBe(1); expect(Math.abs(w.bodies.x[i] - towers(w)[1].x)).toBeLessThan(12); }
    }
    clear(w);
    idle(w, BWAVES.pause + 4);
    expect(w.enc.state[1]).toBe(BSTEP.free);
  });

  it('archers stand off past the flamethrower, inside Place\'s reach', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 1);
    take(w);
    clear(w);
    w.enc.state[1] = BSTEP.spray; // the next group is the archers'
    idle(w, BWAVES.pause + 18);
    const es = enemies(w).filter((i) => w.bodies.arch[i] === ARCH.caster);
    expect(es.length).toBeGreaterThan(0);
    for (const i of es) {
      const d = Math.hypot(w.bodies.x[i] - w.bodies.x[0], w.bodies.y[i] - w.bodies.y[0]);
      expect(d).toBeGreaterThan(BATTERY.sprayMax - 1.5);
      expect(d).toBeLessThan(BATTERY.placeRange);
    }
  });
});

describe('the defence\'s stream', () => {
  it('lands where you aim, but never short of the wall\'s foot and never past its reach', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    take(w);
    const reach = (aimY: number) => { step(w, [{ ...NO_INPUT, aimX: 0, aimY: 32 * aimY }, NO_INPUT, NO_INPUT, NO_INPUT]); return driveSpray(w, 0).range; };
    const near = reach(0.5), mid = reach(-5), far = reach(-40);
    expect(w.bodies.y[0] - near).toBeCloseTo(BATTERY.wallY - BATTERY.landClear, 5); // aimed inside the wall: at its foot
    expect(w.bodies.y[0] - mid).toBeCloseTo(w.bodies.y[0] - 5, 5); // aimed out there: there
    expect(mid).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(mid);
    expect(far).toBeLessThanOrEqual(BATTERY.sprayMax + 5);
  });
});
