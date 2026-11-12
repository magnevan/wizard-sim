import { describe, expect, it } from 'vitest';
import { ARCH, BATTERY, BSTEP, BTN, EL, KIND, MAX_SEATS, NO_INPUT, WALL, WELL, createWorld, infused, pedestalNear, runeMax, step, wellDry } from '../src';
import { BWAVES } from '../src/battery-waves';
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
  it('has goblins hacking at the stakes in front of every defence as you arrive, harmlessly, and they stay there', () => {
    const w = createWorld(1, 1, { room: 'battery' }), hp = w.bodies.hp[0], stakes = w.def.props.filter((p) => p.asset === 'stakes');
    idle(w, 12);
    const es = enemies(w);
    expect(es).toHaveLength(towers(w).length * BWAVES.arrivals);
    for (const i of es) {
      const near = Math.min(...stakes.map((p) => Math.hypot(w.bodies.x[i] - p.x, w.bodies.y[i] - p.y)));
      expect(near).toBeLessThan(3);
      expect(w.bodies.y[i]).toBeLessThan(BATTERY.wallY - 8); // out in the open, where you see them over the wall
    }
    expect(w.bodies.hp[0]).toBe(hp);
    expect(w.enc.state[1]).toBe(BSTEP.arrive);
  });

  it('stops them a little way off the wall, not pressed against it', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 1);
    take(w);
    idle(w, 16);
    for (const i of enemies(w)) expect(BATTERY.wallY - w.bodies.y[i]).toBeGreaterThan(BWAVES.wallStand - 0.8);
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

describe('the well failing (beats 5 to 7)', () => {
  /** Seat 0 at defence 1, with the lesson done and the free fights begun. */
  function failing(): W {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 1);
    take(w);
    clear(w);
    w.enc.state[1] = BSTEP.free; w.enc.state[2] = 0;
    return w;
  }
  const fire = (w: W) => w.seats.runes[EL.fire - 1];
  const gateFire = (w: W) => w.walls.type[0] === WALL.curtain;

  it('drains the well while the free fights go on, and the defence\'s pool refills slower and slower', () => {
    const w = failing();
    const refill = (): number => { w.seats.runes[EL.fire - 1] = 0; const a = fire(w); idle(w, 1); return fire(w) - a; };
    const early = refill();
    idle(w, WELL.fail / 2);
    const late = refill();
    expect(w.battery!.flow[0]).toBeLessThan(0.55);
    expect(w.battery!.flow[0]).toBeGreaterThan(0.4);
    expect(late).toBeLessThan(early * 0.6);
    expect(wellDry(w)).toBe(false);
  });

  it('runs dry once the flow is out and the pool is spent: you\'re put back, no stepping up again, the gate\'s fire gutters out', () => {
    const w = failing(), home = [w.battery!.homeX[0], w.battery!.homeY[0]];
    expect(gateFire(w)).toBe(true);
    w.battery!.flow[0] = 1e-9; // the next tick's drain takes the last of it
    w.seats.runes[EL.fire - 1] = 0.5;
    idle(w, 0.1);
    expect(wellDry(w)).toBe(true);
    expect(w.enc.state[1]).toBe(BSTEP.dry);
    expect(w.battery!.drive[0]).toBe(-1);
    expect([w.bodies.x[0], w.bodies.y[0]]).toEqual(home);
    expect(runeMax(w, 0, EL.fire)).toBe(0); // dark, until the infusion
    expect(pedestalNear(w, 0)).toBe(-1);
    expect(gateFire(w)).toBe(true); // guttering, for the view
    idle(w, WELL.gutter);
    expect(gateFire(w)).toBe(false);
  });

  it('doesn\'t stall on a rune held back: dry WELL.grace after the flow is out', () => {
    const w = failing();
    w.battery!.flow[0] = 1e-9;
    w.seats.runes[EL.fire - 1] = 3;
    idle(w, WELL.grace - 0.5);
    expect(wellDry(w)).toBe(false);
    idle(w, 1);
    expect(wellDry(w)).toBe(true);
  });

  it('then the infusion: a Fire pool of your own, one rune, and they come through the gate for you', () => {
    const w = failing();
    w.battery!.flow[0] = 1e-9; w.seats.runes[EL.fire - 1] = 0;
    idle(w, 0.1);
    clear(w);
    idle(w, WELL.surge + 0.1);
    expect(infused(w)).toBe(true);
    expect(w.enc.state[1]).toBe(BSTEP.hands);
    expect(runeMax(w, 0, EL.fire)).toBe(WELL.own);
    expect(fire(w)).toBe(WELL.own);
    idle(w, WELL.through + 3);
    const es = enemies(w);
    expect(es.length).toBeGreaterThan(0);
    for (const i of es) expect(w.battery!.lane[i]).toBe(-1); // nobody's lane: they hunt wizards
    // the groups in turn, then it's over
    for (let g = 0; g < 2; g++) { clear(w); idle(w, BWAVES.pause + 4); }
    clear(w);
    idle(w, BWAVES.pause + 1);
    expect(w.enc.state[1]).toBe(BSTEP.after);
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
