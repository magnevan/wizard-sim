import { describe, expect, it } from 'vitest';
import { ARCH, BATTERY, BTN, KIND, MAX_SEATS, NO_INPUT, PHASE_ENC, createWorld, step } from '../src';
import { BWAVES, batteryWave } from '../src/battery-waves';

const NO_INPUTS = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
const idle = (w: ReturnType<typeof createWorld>, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) step(w, NO_INPUTS); };
const enemies = (w: ReturnType<typeof createWorld>) => {
  const out: number[] = [];
  for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) out.push(i);
  return out;
};
/** A battery world with seat 0 at defence 1 (the second tower from the west). */
function driving() {
  const w = createWorld(1, 1, { room: 'battery' }), pad = w.def.props.filter((p) => p.asset === 'control-pedestal')[1];
  w.bodies.x[0] = pad.x + 1.2; w.bodies.y[0] = pad.y;
  step(w, [{ ...NO_INPUT, buttons: BTN.use }, NO_INPUT, NO_INPUT, NO_INPUT]);
  step(w, NO_INPUTS);
  return { w, tower: w.def.props.filter((p) => p.asset === 'defence-tower')[1] };
}

describe('the battery\'s waves', () => {
  it('wait until somebody takes a defence', () => {
    const w = createWorld(1, 1, { room: 'battery' });
    idle(w, 20);
    expect(w.enc.state[0]).toBe(PHASE_ENC.off);
    expect(enemies(w)).toHaveLength(0);
  });

  it('send the first wave down the driven defence\'s lane, from the gap nearest it', () => {
    const { w, tower } = driving();
    idle(w, BWAVES.firstLull + 4);
    const es = enemies(w), [first] = batteryWave(1).groups;
    expect(es).toHaveLength(first[1]);
    for (const i of es) {
      expect(w.battery!.lane[i]).toBe(1);
      expect(w.bodies.arch[i]).toBe(first[0]);
      expect(Math.abs(w.bodies.x[i] - tower.x)).toBeLessThan(12);
    }
  });

  it('go for their defence: they end up at the wall in front of its tower, and can\'t hurt its driver', () => {
    const { w, tower } = driving();
    const hp = w.bodies.hp[0];
    idle(w, BWAVES.firstLull + 22);
    const es = enemies(w);
    expect(es.length).toBeGreaterThan(0);
    for (const i of es) {
      expect(w.bodies.y[i]).toBeLessThan(BATTERY.wallY);
      expect(Math.hypot(w.bodies.x[i] - tower.x, w.bodies.y[i] - w.bodies.y[0])).toBeLessThan(4);
    }
    expect(w.bodies.hp[0]).toBe(hp);
  });

  it('archers stand off past the flamethrower, inside Place\'s reach', () => {
    const { w } = driving();
    for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) w.battery!.lane[i] = -1;
    w.enc.state[1] = 2; // the archers' wave
    idle(w, BWAVES.firstLull + 18);
    const es = enemies(w).filter((i) => w.bodies.arch[i] === ARCH.caster);
    expect(es.length).toBeGreaterThan(0);
    for (const i of es) {
      const d = Math.hypot(w.bodies.x[i] - w.bodies.x[0], w.bodies.y[i] - w.bodies.y[0]);
      expect(d).toBeGreaterThan(BATTERY.sprayMax - 1.5);
      expect(d).toBeLessThan(BATTERY.placeRange);
    }
  });
});
