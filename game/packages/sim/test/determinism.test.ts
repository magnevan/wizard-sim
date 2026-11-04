import { describe, expect, it } from 'vitest';
import golden from './golden.json';
import {
  BTN, INPUT_BYTES, NO_INPUT, createWorld, decodeInput, encodeInput, hashWorld, hex, inputsAt, quantize,
  restore, runReplay, scriptedReplay, snapshot, step, tickOf,
} from '../src';

describe('replays', () => {
  it('the golden replay hashes to the recorded value (the browser check compares against the same file)', () => {
    const r = runReplay(scriptedReplay(golden.ticks));
    expect(hex(r.hash)).toBe(golden.hash);
  });

  it('running the same replay twice gives the same hash trail', () => {
    const rep = scriptedReplay(900);
    expect(runReplay(rep).trail).toEqual(runReplay(rep).trail);
  });

  it('the scripted run actually casts spells (the test is not hashing an idle world)', () => {
    const rep = scriptedReplay(600);
    const w = createWorld(rep.seed, rep.players);
    const casts: string[] = [];
    for (let t = 0; t < rep.ticks; t++) {
      step(w, inputsAt(rep, t));
      for (const e of w.events) if (e.kind === 'cast' && e.text) casts.push(e.text);
    }
    expect(casts.length).toBeGreaterThan(10);
    expect(new Set(casts).size).toBeGreaterThan(3);
  });

  it('a different seed or input changes the hash', () => {
    const a = runReplay(scriptedReplay(300, 2, 7)).hash;
    const b = runReplay(scriptedReplay(300, 2, 8)).hash;
    expect(a).not.toBe(b);
  });
});

describe('snapshot / restore (rollback-ready)', () => {
  it('restoring a snapshot and re-simulating reproduces the same world', () => {
    const rep = scriptedReplay(600);
    const w = createWorld(rep.seed, rep.players);
    for (let t = 0; t < 300; t++) step(w, inputsAt(rep, t));
    const snap = snapshot(w);
    for (let t = 300; t < 600; t++) step(w, inputsAt(rep, t));
    const straight = hashWorld(w);

    restore(w, snap);
    expect(tickOf(w)).toBe(300);
    for (let t = 300; t < 600; t++) step(w, inputsAt(rep, t));
    expect(hashWorld(w)).toBe(straight);
  });

  it('a rollback of 8 ticks with corrected input lands on the same world as never having guessed wrong', () => {
    const rep = scriptedReplay(400);
    const truth = createWorld(rep.seed, rep.players);
    const guess = createWorld(rep.seed, rep.players);
    for (let t = 0; t < 392; t++) { step(truth, inputsAt(rep, t)); step(guess, inputsAt(rep, t)); }
    const snap = snapshot(guess);
    for (let t = 392; t < 400; t++) step(guess, [inputsAt(rep, t)[0], NO_INPUT]); // player 2's input "late"
    restore(guess, snap);
    for (let t = 392; t < 400; t++) { step(guess, inputsAt(rep, t)); step(truth, inputsAt(rep, t)); }
    expect(hashWorld(guess)).toBe(hashWorld(truth));
  });
});

describe('state stays sane', () => {
  it('no NaN or Infinity after a long fuzzed run', () => {
    const w = createWorld(3, 4);
    let s = 12345;
    const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296; // test-side input fuzz only
    for (let t = 0; t < 10_000; t++) {
      const inputs = [0, 1, 2, 3].map(() => quantize({
        buttons: rnd() < 0.05 ? BTN.force : rnd() < 0.01 ? BTN.clear : 0,
        press0: rnd() < 0.1 ? 1 + Math.floor(rnd() * 9) : 0, press1: rnd() < 0.02 ? 1 + Math.floor(rnd() * 9) : 0,
        moveX: rnd() * 254 - 127, moveY: rnd() * 254 - 127, aimX: rnd() * 2000 - 1000, aimY: rnd() * 2000 - 1000,
      }));
      step(w, inputs);
    }
    for (const arr of [w.bodies.x, w.bodies.y, w.bodies.vx, w.bodies.vy, w.bodies.hp, w.missiles.x, w.missiles.y, w.seats.runes]) {
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('input encoding', () => {
  it('round-trips through the 9-byte record', () => {
    const i = quantize({ buttons: BTN.force | BTN.self, press0: 3, press1: 9, moveX: -127, moveY: 64, aimX: -32768, aimY: 1234 });
    const view = new DataView(new ArrayBuffer(INPUT_BYTES));
    encodeInput(i, view, 0);
    expect(decodeInput(view, 0)).toEqual(i);
  });
});
