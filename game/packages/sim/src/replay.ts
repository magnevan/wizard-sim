/**
 * Replays: a seed plus every player's input for every tick. A replay reproduces a run exactly,
 * so it is the regression test, the bug report and (later) the desync check.
 */
import { INPUT_BYTES, decodeInput, encodeInput, quantize, type PlayerInput } from './input';
import { hashWorld } from './state';
import { step } from './step';
import { createWorld } from './create';
import type { World } from './world';

export interface Replay {
  format: 1;
  seed: number;
  players: number;
  ticks: number;
  /** players * ticks inputs of INPUT_BYTES each, tick-major. */
  inputs: Uint8Array;
}

export class ReplayRecorder {
  private chunks: Uint8Array[] = [];
  private ticks = 0;
  constructor(readonly seed: number, readonly players: number) {}

  record(inputs: readonly PlayerInput[]): void {
    const buf = new Uint8Array(this.players * INPUT_BYTES);
    const view = new DataView(buf.buffer);
    for (let p = 0; p < this.players; p++) encodeInput(quantize(inputs[p]), view, p * INPUT_BYTES);
    this.chunks.push(buf);
    this.ticks++;
  }

  finish(): Replay {
    const inputs = new Uint8Array(this.ticks * this.players * INPUT_BYTES);
    this.chunks.forEach((c, t) => inputs.set(c, t * c.length));
    return { format: 1, seed: this.seed, players: this.players, ticks: this.ticks, inputs };
  }
}

export function inputsAt(r: Replay, tick: number): PlayerInput[] {
  const view = new DataView(r.inputs.buffer, r.inputs.byteOffset, r.inputs.byteLength);
  const out: PlayerInput[] = [];
  for (let p = 0; p < r.players; p++) out.push(decodeInput(view, (tick * r.players + p) * INPUT_BYTES));
  return out;
}

export interface ReplayResult {
  world: World;
  /** Hash after the last tick. */
  hash: number;
  /** Hash every `every` ticks, for finding where two runs diverge. */
  trail: number[];
}

export function runReplay(r: Replay, every = 60): ReplayResult {
  const world = createWorld(r.seed, r.players);
  const trail: number[] = [];
  for (let t = 0; t < r.ticks; t++) {
    step(world, inputsAt(r, t));
    if ((t + 1) % every === 0) trail.push(hashWorld(world));
  }
  return { world, hash: hashWorld(world), trail };
}
