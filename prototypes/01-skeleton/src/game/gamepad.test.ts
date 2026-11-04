import { describe, expect, it } from 'vitest';
import { spawnWizard } from '../world/spawn';
import { World } from '../world/world';
import { BTN, GamepadController, padStep, type PadState } from './gamepad';

const pad = (down: number[] = [], axes = [0, 0, 0, 0]): PadState => {
  const buttons = Array(17).fill(false);
  for (const b of down) buttons[b] = true;
  return { buttons, axes };
};

describe('gamepad mapping', () => {
  it('face buttons queue elements; LB switches the layer', () => {
    expect(padStep(pad(), pad([BTN.A]), null).actions).toEqual([{ type: 'element', element: 'water' }]);
    expect(padStep(pad(), pad([BTN.Y]), null).actions).toEqual([{ type: 'element', element: 'cold' }]);
    expect(padStep(pad([BTN.LB]), pad([BTN.LB, BTN.B]), null).actions).toEqual([{ type: 'element', element: 'arcane' }]);
    expect(padStep(pad([BTN.LB]), pad([BTN.LB, BTN.Y]), null).actions).toEqual([{ type: 'element', element: 'fire' }]);
  });
  it('only new presses count (held buttons do not repeat)', () => {
    expect(padStep(pad([BTN.A]), pad([BTN.A]), null).actions).toEqual([]);
  });
  it('triggers and bumpers cast; LB turns RT into weapon and LT into point', () => {
    const mode = (prev: number[], cur: number[]) => padStep(pad(prev), pad(cur), null).actions.map((a) => (a.type === 'cast' ? a.mode : a.type));
    expect(mode([], [BTN.RT])).toEqual(['force']);
    expect(mode([], [BTN.LT])).toEqual(['area']);
    expect(mode([], [BTN.RB])).toEqual(['self']);
    expect(mode([BTN.LB], [BTN.LB, BTN.RT])).toEqual(['weapon']);
    expect(mode([BTN.LB], [BTN.LB, BTN.LT])).toEqual(['point']);
    expect(mode([], [BTN.UP])).toEqual(['seal']);
    expect(mode([], [BTN.DOWN])).toEqual(['release']);
    expect(mode([], [BTN.BACK])).toEqual(['clear']);
    expect(padStep(pad(), pad([BTN.RT]), null).castButton).toBe(BTN.RT);
  });
  it('left stick moves with a deadzone; right stick aims at a distance and is kept when centred', () => {
    expect(padStep(pad(), pad([], [0.1, 0.1, 0, 0]), null).move).toEqual({ x: 0, y: 0 });
    const s = padStep(pad(), pad([], [1, 0, 0, -1]), null);
    expect(s.move.x).toBeCloseTo(1);
    expect(s.aim!.y).toBeCloseTo(-9);

    let state = pad([], [0, 0, 1, 0]);
    const ctl = new GamepadController(0, () => state);
    const world = new World(20, 20);
    const wiz = spawnWizard(world, { x: 5, y: 5 }, 1, '#f00');
    state = pad([], [0, 0, 1, 0]);
    const aimed = ctl.poll(null, wiz).aim!;
    expect(aimed.x).toBeCloseTo(14);
    state = pad();
    expect(ctl.poll(null, wiz).aim).toEqual(aimed);
  });
  it('the button that joined the game is not also a press', () => {
    const state = pad([BTN.A]);
    const ctl = new GamepadController(0, () => state);
    const world = new World(20, 20);
    const wiz = spawnWizard(world, { x: 5, y: 5 }, 1, '#f00');
    expect(ctl.poll(null, wiz).actions).toEqual([]);
  });
});
