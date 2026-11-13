/**
 * Pinned hash trails, one per mode: the golden replay covers the Sanctum only, so a refactor that moved Survive, the
 * battery or the tutorial would otherwise pass unnoticed. Each run hashes the world every TRAIL ticks; a mismatch
 * names the mode and the first tick it parted at.
 *
 * A gameplay change in a mode moves its trail on purpose: re-record with `UPDATE_MODE_HASHES=1 npx vitest run
 * packages/sim/test/mode-hashes.test.ts` and say why in the commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BTN, EL, KIND, MAX_SEATS, NO_INPUT, botInput, createWorld, hashWorld, hex, newBotMemory, newTutorialBot, step, tutorialBotInput,
  type PlayerInput, type World,
} from '../src';

const FILE = join(__dirname, 'mode-hashes.json');
const TRAIL = 300;
type Trail = string[];

function trail(w: World, ticks: number, input: (w: World, t: number) => PlayerInput[]): Trail {
  const out: Trail = [];
  for (let t = 1; t <= ticks; t++) {
    step(w, input(w, t));
    if (t % TRAIL === 0) out.push(hex(hashWorld(w)));
  }
  return out;
}

const bots = (n: number) => {
  const mem = Array.from({ length: n }, newBotMemory);
  return (w: World) => Array.from({ length: MAX_SEATS }, (_, s) => (s < n ? botInput(w, s, mem[s]) : NO_INPUT));
};

/** The battery: seat 0 takes the second defence and keeps spraying fire at the nearest enemy. */
function batteryDriver() {
  return (w: World, t: number): PlayerInput[] => {
    const b = w.bodies, ins: PlayerInput[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
    if (t === 30) {
      const pad = w.def.props.filter((p) => p.asset === 'possession-circle')[1];
      b.x[0] = pad.x + 1.2; b.y[0] = pad.y;
      ins[0] = { ...NO_INPUT, buttons: BTN.use };
      return ins;
    }
    let best = -1, bd = Infinity;
    for (let i = MAX_SEATS; i < b.kind.length; i++) {
      if (b.kind[i] !== KIND.enemy) continue;
      const d = (b.x[i] - b.x[0]) * (b.x[i] - b.x[0]) + (b.y[i] - b.y[0]) * (b.y[i] - b.y[0]);
      if (d < bd) { bd = d; best = i; }
    }
    const aimX = best < 0 ? 0 : Math.round((b.x[best] - b.x[0]) * 32), aimY = best < 0 ? -320 : Math.round((b.y[best] - b.y[0]) * 32);
    ins[0] = t % 40 < 2 ? { ...NO_INPUT, press0: EL.fire, aimX, aimY } : { ...NO_INPUT, buttons: BTN.force, aimX, aimY };
    return ins;
  };
}

/**
 * The battery's whole lesson, fast: seat 0 takes a defence, the field is cleared every 90 ticks (so each step's group
 * comes and goes), the well fails and runs dry, the infusion and the HANDS groups come, and at the end seat 0 presses
 * Use at the well. It reaches every step, the repair included.
 */
function batteryLesson() {
  return (w: World, t: number): PlayerInput[] => {
    const b = w.bodies, ins: PlayerInput[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
    if (t === 30) {
      const pad = w.def.props.filter((p) => p.asset === 'possession-circle')[1];
      b.x[0] = pad.x + 1.2; b.y[0] = pad.y;
      ins[0] = { ...NO_INPUT, buttons: BTN.use };
    }
    if (t % 90 === 0) for (let i = MAX_SEATS; i < b.kind.length; i++) if (b.kind[i] === KIND.enemy) b.kind[i] = KIND.none;
    if (w.enc.state[1] === 8 && t % 20 === 0) { // after the fight: at the well, Use
      const well = w.def.props.find((p) => p.asset === 'battery-well')!;
      b.x[0] = well.x + 1; b.y[0] = well.y + 1;
      ins[0] = { ...NO_INPUT, buttons: BTN.use };
    }
    return ins;
  };
}

/**
 * Survive, long: two bots play waves, breathers and altar picks; at 6000 both fall (the run is over), and at 6600
 * seat 0 starts a new run (Self). It passes every phase of the director.
 */
function surviveLong() {
  const play = bots(2);
  return (w: World, t: number): PlayerInput[] => {
    if (t === 6000) for (let s = 0; s < 2; s++) w.bodies.hp[s] = 0;
    const ins = play(w);
    if (t >= 6000 && t < 6600) { ins[0] = NO_INPUT; ins[1] = NO_INPUT; }
    if (t === 6600) ins[0] = { ...NO_INPUT, buttons: BTN.self };
    return ins;
  };
}

const RUNS: Record<string, () => Trail> = {
  'survive-long': () => {
    const w = createWorld(7, 2, { room: 'survive' }), out = trail(w, 7800, surviveLong());
    return out;
  },
  'battery-lesson': () => {
    const w = createWorld(1, 1, { room: 'battery' }), out = trail(w, 9000, batteryLesson());
    expect(w.enc.state[1], 'the run should reach the repair').toBe(9);
    return out;
  },
  arena: () => trail(createWorld(5, 2, { room: 'arena' }), 2400, bots(2)),
  survive: () => trail(createWorld(7, 2, { room: 'survive' }), 2400, bots(2)),
  battery: () => trail(createWorld(1, 1, { room: 'battery' }), 2400, batteryDriver()),
  tutorial: () => {
    const m = newTutorialBot();
    return trail(createWorld(3, 1, { room: 'tutorial' }), 3000, (w) => [tutorialBotInput(w, 0, m), NO_INPUT, NO_INPUT, NO_INPUT]);
  },
};

const pinned = JSON.parse(readFileSync(FILE, 'utf8')) as { note: string; trails: Record<string, Trail> };
const fresh: Record<string, Trail> = {};

describe('mode hash trails', () => {
  for (const [mode, run] of Object.entries(RUNS)) {
    it(mode, () => {
      const got = run();
      fresh[mode] = got;
      if (process.env.UPDATE_MODE_HASHES) return;
      const want = pinned.trails[mode];
      expect(want, `${mode} has no pinned trail: re-record`).toBeDefined();
      const at = got.findIndex((h, k) => h !== want[k]);
      expect(at === -1 ? 'same' : `${mode} parted at tick ${(at + 1) * TRAIL}: ${want[at]} -> ${got[at]}`).toBe('same');
    });
  }
  it('writes the trails when asked', () => {
    if (process.env.UPDATE_MODE_HASHES) writeFileSync(FILE, JSON.stringify({ note: pinned.note, trails: fresh }, null, 2) + '\n');
  });
});
