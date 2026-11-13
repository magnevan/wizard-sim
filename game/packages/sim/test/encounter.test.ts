// The encounter runner with nothing of its own: markers, a region, a list of groups, as a campaign room would use it.
import { describe, expect, it } from 'vitest';
import { ARCH, EL, KIND, MAX_SEATS, createWorld, createWorldWith, hashWorld, partyOf, runeMax, spawnEnemy, type Mode, type RoomDef, type World } from '../src';
import { openAtMarkers, partyIn, remaining, runScript, type Script } from '../src/encounter';
import { BSTEP, LESSON } from '../src/battery-waves';

const enemies = (w: World) => { let n = 0; for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) n++; return n; };
const clear = (w: World) => { for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) w.bodies.kind[i] = KIND.none; };

/** The Sanctum with two gap markers north and a hall region south (the def is layout, not state, so a test may swap it). */
function room(): World {
  const w = createWorld(1, 1, { dummies: false });
  const def: RoomDef = {
    ...w.def,
    markers: [{ id: 'gap-a', x: -4, y: -6, tag: 'gap' }, { id: 'gap-b', x: 4, y: -6, tag: 'gap' }],
    regions: [{ id: 'hall', x: -3, y: 2, w: 6, h: 3 }],
  };
  w.def = def;
  return w;
}

const SCRIPT: Script = {
  every: 0.5, pause: 1,
  open: openAtMarkers('gap'),
  spawn: (w, k, arch) => { spawnEnemy(w, arch, w.enc.px[k], w.enc.py[k]); },
  steps: [
    { id: 'wait', until: (w) => partyIn(w, 'hall') },
    { id: 'fight', groups: [[[ARCH.swarmer, 2]], [[ARCH.brute, 1]]], cycle: 'list' },
    { id: 'done', end: true },
  ],
};
const run = (w: World, ticks: number) => { for (let t = 0; t < ticks; t++) { runScript(w, SCRIPT); w.clock[0]++; } };

describe('the battery lesson as a script', () => {
  it('keeps its steps in BSTEP order (the client shows each step\'s prompt by number)', () => {
    expect(LESSON.steps.map((s) => s.id)).toEqual(Object.keys(BSTEP));
  });
});

describe('checkpoints', () => {
  it('the battery starts where a checkpoint says, the same world on every peer, and says which it has passed', () => {
    const plain = createWorld(1, 2, { room: 'battery' }), late = createWorld(1, 2, { room: 'battery', checkpoint: 'well-failing' });
    expect(late.mode.checkpoints!.map((c) => c.id)).toEqual(['start', 'well-failing', 'repair']);
    expect(late.enc.state[1]).toBe(BSTEP.free);
    expect(late.battery!.flow[0]).toBe(0.15);
    expect(hashWorld(late)).toBe(hashWorld(createWorld(1, 2, { room: 'battery', checkpoint: 'well-failing' })));
    expect(hashWorld(late)).not.toBe(hashWorld(plain));
    expect(late.mode.reached!(late)).toBe('well-failing');
    expect(plain.mode.reached!(plain)).toBe('start');
    const end = createWorld(1, 1, { room: 'battery', checkpoint: 'repair' });
    expect(end.mode.reached!(end)).toBe('repair');
    expect(hashWorld(createWorld(1, 2, { room: 'battery', checkpoint: 'nowhere' }))).toBe(hashWorld(plain)); // unknown: the beginning
  });
});

describe('the party, carried between campaign areas', () => {
  it('the battery starts with nothing unlocked and ends with Fire, which the next area starts with', () => {
    const start = createWorld(1, 1, { room: 'battery' });
    expect(partyOf(start)).toEqual({ v: 1, pools: {} });
    const end = createWorld(1, 1, { room: 'battery', checkpoint: 'repair' });
    expect(partyOf(end)).toEqual({ v: 1, pools: { fire: 1 } });
    // the next campaign area (a stand-in: a campaign mode with no pools of its own) gives you exactly that
    const next: Mode = { id: 'sandbox', campaign: true, setup: () => {}, director: () => {} };
    const w = createWorldWith(next, 1, 1, { party: partyOf(end) });
    expect([runeMax(w, 0, EL.fire), runeMax(w, 0, EL.water), runeMax(w, 0, EL.arcane)]).toEqual([1, 0, 0]);
    expect(w.seats.runes[EL.fire - 1]).toBe(1); // it joins full
    expect(partyOf(w)).toEqual(partyOf(end));
  });

  it('only campaign areas have one (the other rooms keep their layout)', () => {
    expect(createWorld(1, 1).party).toBeNull();
    expect(createWorld(1, 1, { room: 'survive', party: { v: 1, pools: { fire: 3 } } }).party).toBeNull();
  });
});

describe('the encounter runner', () => {
  it('waits for the party to enter the hall, then sends its groups from the gap markers in turn, then ends', () => {
    const w = room();
    run(w, 120);
    expect(w.enc.state[1]).toBe(0); // still waiting: the wizard starts outside the hall
    expect(enemies(w)).toBe(0);
    w.bodies.x[0] = 0; w.bodies.y[0] = 3.5; // into the hall
    run(w, 2);
    expect(w.enc.state[1]).toBe(1);
    run(w, 90);
    expect(enemies(w)).toBe(4); // two from each gap
    const xs = [] as number[];
    for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) xs.push(w.bodies.x[i]);
    expect(xs.sort((a, b) => a - b)).toEqual([-4, -4, 4, 4]);
    clear(w);
    run(w, 60 + 90); // the pause, then the second group: a brute from each gap
    expect(enemies(w)).toBe(2);
    clear(w);
    run(w, 200);
    expect(remaining(w)).toBe(0);
    expect(w.enc.state[1]).toBe(2); // the list is done: on to the end
  });
});
