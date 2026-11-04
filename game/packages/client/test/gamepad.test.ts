import { describe, expect, it } from 'vitest';
import { BTN, elementId } from '@wizard-sim/sim';
import { PAD, PadSeats, padStep, type PadState } from '../src/gamepad';

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadState => {
  const buttons: boolean[] = [];
  for (const b of pressed) buttons[b] = true;
  return { buttons, axes };
};

describe('padStep', () => {
  it('maps face buttons to the first element row, and LB to the second', () => {
    const mem = { prev: pad(), aimX: 3, aimY: 0 };
    expect(padStep(mem, pad([PAD.A])).press0).toBe(elementId('water'));
    padStep(mem, pad());
    expect(padStep(mem, pad([PAD.LB, PAD.X])).press0).toBe(elementId('sigil'));
    padStep(mem, pad());
    expect(padStep(mem, pad([PAD.LB, PAD.RB])).press0).toBe(elementId('earth'));
  });

  it('holds RT as Force, LB + RT as Weapon, LT as Area', () => {
    const mem = { prev: pad(), aimX: 3, aimY: 0 };
    expect(padStep(mem, pad([PAD.RT])).buttons & BTN.force).toBeTruthy();
    expect(padStep(mem, pad([PAD.LB, PAD.RT])).buttons & BTN.weapon).toBeTruthy();
    expect(padStep(mem, pad([PAD.LT])).buttons & BTN.area).toBeTruthy();
  });

  it('keeps the last aim when the right stick is centred', () => {
    const mem = { prev: pad(), aimX: 3, aimY: 0 };
    const a = padStep(mem, pad([], [0, 0, 0, 1]));
    const b = padStep(mem, pad([], [0, 0, 0, 0]));
    expect(a.aimY).toBeGreaterThan(0);
    expect(b.aimY).toBe(a.aimY);
  });
});

describe('PadSeats', () => {
  it('a pad that presses a button takes the next free seat and sends join once', () => {
    let state: PadState | null = pad([PAD.A]);
    const seats = new PadSeats((i) => (i === 0 ? state : null));
    seats.poll((s) => s === 0);
    expect(seats.has(1)).toBe(true);
    const first = seats.sample(1)!;
    expect(first.buttons & BTN.join).toBeTruthy();
    expect(first.press0).toBe(0); // the joining press doesn't also queue Water
    state = pad();
    expect(seats.sample(1)!.buttons & BTN.join).toBe(0);
  });
});
