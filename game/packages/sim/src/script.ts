/**
 * A scripted two-player run, used as the golden replay (node and browser must hash it the same)
 * and to drive the client in headless screenshots (?script=1). Pure integer maths on the tick.
 */
import type { Element } from '@wizard-sim/rules';
import { elementId } from './step';
import { BTN, quantize, type PlayerInput } from './input';
import { ReplayRecorder, type Replay } from './replay';

// Each player loops through a few recipes: queue the elements, then Force cast.
const RECIPES: Element[][] = [
  ['fire'], ['arcane', 'fire'], ['earth', 'fire'], ['water', 'cold'], ['lightning'], ['arcane', 'cold', 'cold'], ['earth'],
];
const PERIOD = 50; // ticks per recipe

export function scriptedInput(tick: number, player: number): PlayerInput {
  const t = tick + player * 23;
  const phase = t % PERIOD;
  const recipe = RECIPES[(Math.floor(t / PERIOD) + player * 3) % RECIPES.length];
  // Walk a slow square: 120 ticks per side.
  const side = Math.floor(t / 120) % 4;
  const moveX = side === 0 ? 90 : side === 2 ? -90 : 0;
  const moveY = side === 1 ? 90 : side === 3 ? -90 : 0;
  // Aim sweeps around a lopsided octagon (integers only).
  const a = Math.floor(t / 20) % 8;
  const AX = [160, 113, 0, -113, -160, -113, 0, 113], AY = [0, 113, 160, 113, 0, -113, -160, -113];
  const press0 = phase >= 4 && phase < 4 + recipe.length * 6 && (phase - 4) % 6 === 0 ? elementId(recipe[(phase - 4) / 6]) : 0;
  // Most recipes are Force casts; every third is an Area tap, then a Place (hold), then a Self cast.
  const k = (Math.floor(t / PERIOD) + player) % 6;
  const buttons = k === 2 ? (phase >= 40 && phase < 43 ? BTN.area : 0)
    : k === 4 ? (phase >= 26 && phase < 48 ? BTN.area : 0)
    : k === 5 ? (phase >= 40 && phase < 42 ? BTN.self : 0)
    : phase >= 34 && phase < 46 ? BTN.force : 0;
  return quantize({ buttons, press0, press1: 0, moveX, moveY, aimX: AX[a] * (player === 0 ? 1 : -1), aimY: AY[a] });
}

export function scriptedReplay(ticks: number, players = 2, seed = 7): Replay {
  const rec = new ReplayRecorder(seed, players);
  for (let t = 0; t < ticks; t++) {
    const inputs: PlayerInput[] = [];
    for (let p = 0; p < players; p++) inputs.push(scriptedInput(t, p));
    rec.record(inputs);
  }
  return rec.finish();
}
