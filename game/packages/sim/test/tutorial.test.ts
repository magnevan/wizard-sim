import { describe, expect, it } from 'vitest';
import {
  BTN, EL, KIND, NO_INPUT, N_EL, TUT_BEAT, TUT_END, TUT_ORDER, TUT_PLACES, TUT_STATE as TS, TUT_TAG, T,
  buffers, createWorld, hashWorld, newTutorialBot, quantize, restore, runeMax, scriptedReplay, runReplay, hex, snapshot, spawnBody, step, tutorialBotInput,
  type PlayerInput, type World,
} from '../src';
import golden from './golden.json';

/** Runs the tutorial bot on every active seat for up to `max` ticks, or until `until` holds. Returns the beats seen, in order. */
function play(w: World, max: number, until: (w: World) => boolean = () => false, exit = 1): number[] {
  const mem = [0, 1, 2, 3].map(() => newTutorialBot(exit));
  const seen: number[] = [w.tut!.state[TS.beat]];
  for (let k = 0; k < max && !until(w); k++) {
    const inputs = mem.map((m, s) => tutorialBotInput(w, s, m));
    step(w, inputs);
    if (w.tut!.state[TS.beat] !== seen[seen.length - 1]) seen.push(w.tut!.state[TS.beat]);
  }
  return seen;
}
const idle = (w: World, n: number, over: Partial<PlayerInput> = {}) => { for (let k = 0; k < n; k++) step(w, [quantize({ ...NO_INPUT, ...over }), NO_INPUT, NO_INPUT, NO_INPUT]); };
const tagged = (w: World, tag: number) => { let n = 0; for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && w.tut!.tag[i] === tag) n++; return n; };

describe('tutorial', () => {
  it('only a tutorial world carries tutorial state; the golden replay is untouched', () => {
    expect(createWorld(1, 1).tut).toBeNull();
    expect(createWorld(1, 1, { room: 'arena' }).tut).toBeNull();
    expect(createWorld(1, 1, { room: 'survive' }).tut).toBeNull();
    expect(createWorld(1, 1, { room: 'tutorial' }).tut).not.toBeNull();
    expect(buffers(createWorld(1, 1)).length).toBe(buffers(createWorld(1, 1, { room: 'arena' })).length);
    expect(hex(runReplay(scriptedReplay(golden.ticks)).hash)).toBe(golden.hash);
  });

  it('a bot plays every beat of the prototype through to the end card, and takes an arch', () => {
    const w = createWorld(3, 1, { room: 'tutorial' });
    const seen = play(w, T(600), (w) => w.tut!.state[TS.exit] !== 0);
    expect(seen).toEqual(TUT_ORDER);
    expect(w.tut!.state[TS.exit]).toBe(2); // the Survive arch
  });

  it('two players play it through together (personal beats complete when either does them)', () => {
    const w = createWorld(5, 2, { room: 'tutorial' });
    const seen = play(w, T(600), (w) => w.tut!.state[TS.beat] === TUT_END);
    expect(seen).toEqual(TUT_ORDER);
  });

  it('is deterministic, and a snapshot taken mid-beat replays to the same hash', () => {
    const run = () => { const w = createWorld(9, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.heavy }); play(w, T(20)); return w; };
    expect(hashWorld(run())).toBe(hashWorld(run()));
    for (const beat of TUT_ORDER) {
      const w = createWorld(4, 1, { room: 'tutorial', tutorialBeat: beat });
      const mem = [newTutorialBot()];
      const tickBot = () => step(w, [tutorialBotInput(w, 0, mem[0]), NO_INPUT, NO_INPUT, NO_INPUT]);
      for (let k = 0; k < 90; k++) tickBot();
      const snap = snapshot(w), keep = { ...mem[0], presses: mem[0].presses.slice() };
      for (let k = 0; k < 60; k++) tickBot();
      const h = hashWorld(w);
      restore(w, snap); mem[0] = keep;
      for (let k = 0; k < 60; k++) tickBot();
      expect(hashWorld(w), `beat ${beat}`).toBe(h);
    }
  });

  it('gates the runes: locked elements have max 0, queue nothing and show dry', () => {
    const w = createWorld(1, 1, { room: 'tutorial' });
    idle(w, 1);
    for (let e = 1; e <= N_EL; e++) expect(runeMax(w, 0, e)).toBe(0);
    idle(w, 1, { press0: EL.fire });
    expect(w.seats.queueLen[0]).toBe(0);
    const fire = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.fire });
    idle(fire, 1);
    expect(runeMax(fire, 0, EL.fire)).toBe(2);
    expect(runeMax(fire, 0, EL.water)).toBe(0);
    expect(fire.seats.runes[EL.fire - 1]).toBe(2);
    idle(fire, 1, { press0: EL.water });
    expect(fire.seats.queueLen[0]).toBe(0);
    idle(fire, 1, { press0: EL.fire });
    expect(fire.seats.queueLen[0]).toBe(1);
    // the Douse beat adds one Water; the end card has everything
    const douse = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.douse });
    idle(douse, 1);
    expect(runeMax(douse, 0, EL.water)).toBe(1);
    const end = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_END });
    idle(end, 1);
    expect(runeMax(end, 0, EL.earth)).toBe(2);
    expect(runeMax(end, 0, EL.sigil)).toBe(1);
  });

  it('skips a beat when everyone stands on the "I know this" stone for a second', () => {
    const w = createWorld(1, 2, { room: 'tutorial', tutorialBeat: TUT_BEAT.strike });
    idle(w, 1);
    const b = w.bodies, [sx, sy] = TUT_PLACES.skip;
    b.x[0] = sx; b.y[0] = sy;
    idle(w, T(1.5));
    expect(w.tut!.state[TS.lit]).toBe(0); // the second player isn't on it
    b.x[1] = sx + 0.3; b.y[1] = sy;
    idle(w, T(1.1));
    expect(w.tut!.state[TS.lit]).toBe(2);
    expect(tagged(w, TUT_TAG.straw)).toBe(3); // skipped, not done
    // walk into the arch: the next beat, everyone at the entry
    b.x[0] = TUT_PLACES.arch[0]; b.y[0] = TUT_PLACES.arch[1];
    idle(w, T(1));
    expect(w.tut!.state[TS.beat]).toBe(TUT_BEAT.heavy);
    expect(b.x[0]).toBeCloseTo(TUT_PLACES.entry[0], 0);
    expect(tagged(w, TUT_TAG.straw)).toBe(0);
    expect(tagged(w, TUT_TAG.sack)).toBe(1);
  });

  it('brambles only burn: the staff bounces off, fire clears them', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.fire });
    idle(w, 1);
    const b = w.bodies;
    let e = -1;
    for (let i = 4; i < b.kind.length; i++) if (w.tut!.tag[i] === TUT_TAG.hedge) { e = i; break; }
    b.x[0] = b.x[e] - 1.2; b.y[0] = b.y[e];
    const aim = { aimX: 32, aimY: 0 };
    for (let k = 0; k < 5; k++) { idle(w, 1, { ...aim, buttons: BTN.force }); idle(w, 40, aim); }
    expect(b.hp[e]).toBe(b.maxHp[e]);
    expect(b.x[e]).toBe(TUT_PLACES.hedgeX); // rooted: the blows didn't move it either
    idle(w, 1, { ...aim, press0: EL.fire });
    idle(w, 60, { ...aim, buttons: BTN.force });
    idle(w, 120, aim);
    expect(b.kind[e]).toBe(KIND.none);
  });

  it('a new beat starts everyone fresh: no blessing, dash, Phase or Retreat cooldown carried over', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.defend });
    idle(w, 1);
    const b = w.bodies, s = w.seats;
    b.blessT[0] = 900; b.bless[0] = 0.5; s.dashT[0] = 900; s.retreatT[0] = 900; s.guardCd[0] = 900; // longer than the walk to the arch
    w.tut!.state[TS.lit] = 1;
    b.x[0] = TUT_PLACES.arch[0]; b.y[0] = TUT_PLACES.arch[1];
    idle(w, T(1));
    expect(w.tut!.state[TS.beat]).toBe(TUT_BEAT.hands);
    expect([b.blessT[0], b.bless[0], s.dashT[0], s.retreatT[0], s.guardCd[0]]).toEqual([0, 0, 0, 0, 0]);
  });

  it('a body spawned into a reused slot carries no tutorial tag', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.strike });
    idle(w, 1);
    let k = -1;
    for (let i = 4; i < w.bodies.kind.length; i++) if (w.tut!.tag[i] === TUT_TAG.straw) { k = i; break; }
    w.bodies.kind[k] = KIND.none; // gone, but its tag stays behind
    const j = spawnBody(w, -1, KIND.double, 0, 0, 0, 10, 0.4);
    expect(j).toBe(k);
    expect(w.tut!.tag[j]).toBe(TUT_TAG.none);
  });

  it('the hedge stops the gap in the rock: no walking round it', () => {
    for (const y of [-1.4, -0.7, 0, 0.7, 1.4]) {
      const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.fire });
      idle(w, 1);
      w.bodies.x[0] = 3; w.bodies.y[0] = y;
      idle(w, T(3), { moveX: 127, aimX: 32 });
      expect(w.bodies.x[0], `from y ${y}`).toBeLessThan(TUT_PLACES.rockX);
    }
  });

  it('you faint instead of dying, and the beat starts over when everyone has fainted', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.strike });
    idle(w, 1);
    const b = w.bodies;
    for (let i = 4; i < b.kind.length; i++) if (w.tut!.tag[i] === TUT_TAG.straw) { b.hp[i] = 0; break; }
    idle(w, 2);
    expect(tagged(w, TUT_TAG.straw)).toBe(2);
    b.hp[0] = -5;
    idle(w, 1);
    expect(b.hp[0]).toBe(b.maxHp[0]);
    expect(w.tut!.faint[0]).toBeGreaterThan(0);
    expect(tagged(w, TUT_TAG.straw)).toBe(3); // reset
    idle(w, 10, { moveX: 127 });
    expect(b.x[0]).toBeCloseTo(TUT_PLACES.entry[0], 5); // lying still
    idle(w, T(1.5), { moveX: 127 });
    expect(b.x[0]).toBeGreaterThan(TUT_PLACES.entry[0] + 0.5);
  });
});
