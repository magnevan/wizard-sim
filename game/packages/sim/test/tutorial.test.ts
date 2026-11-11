import { describe, expect, it } from 'vitest';
import {
  BTN, EL, KIND, NO_INPUT, N_EL, KEYED_EL, TUT_ARRIVALS, TUT_BEAT, TUT_END, TUT_ORDER, TUT_PLACES, TUT_STATE as TS, TUT_TAG, TUT_TIMES, T, calmOf,
  buffers, createWorld, skipOpen, hashWorld, newTutorialBot, quantize, restore, runeMax, scriptedReplay, runReplay, hex, snapshot, spawnBody, step, tutorialBotInput,
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

  it('a bot plays every beat through to the end card, and takes an arch', () => {
    const w = createWorld(3, 1, { room: 'tutorial' });
    const seen = play(w, T(900), (w) => w.tut!.state[TS.exit] !== 0);
    expect(seen).toEqual(TUT_ORDER);
    expect(w.tut!.state[TS.exit]).toBe(2); // the Survive arch
  });

  it('two players play it through together (personal beats complete when either does them)', () => {
    const w = createWorld(5, 2, { room: 'tutorial' });
    const seen = play(w, T(900), (w) => w.tut!.state[TS.beat] === TUT_END);
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
      const snap = snapshot(w), keep = structuredClone(mem[0]);
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
  it('covers all nine elements, each unlocked for good once given', () => {
    const seen = new Set<number>();
    for (const beat of TUT_ORDER) for (let e = 1; e <= KEYED_EL; e++) {
      const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: beat });
      if (runeMax(w, 0, e) > 0) seen.add(e);
      else expect(seen.has(e), `element ${e} locked again in beat ${beat}`).toBe(false);
    }
    expect(seen.size).toBe(KEYED_EL); // Ice (combined) never has a pool
  });

  it('a calm start: nothing hostile in the chamber until the calm ends, then they walk in from the far gates', () => {
    const hostile = (w: World) => { let n = 0; for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && [TUT_TAG.foe, TUT_TAG.goblin].includes(w.tut!.tag[i] as 5 | 6)) n++; return n; };
    for (const beat of Object.keys(TUT_ARRIVALS).map(Number)) {
      const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: beat });
      idle(w, T(calmOf(beat, 0)) - 2);
      expect(hostile(w), `beat ${beat} during the calm`).toBe(0);
      idle(w, 4);
      expect(hostile(w), `beat ${beat} after the calm`).toBeGreaterThan(0);
      // and none arrives near the entry
      for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && w.tut!.tag[i] !== TUT_TAG.straw) {
        expect(Math.hypot(w.bodies.x[i] - TUT_PLACES.entry[0], w.bodies.y[i] - TUT_PLACES.entry[1]), `beat ${beat}`).toBeGreaterThan(6);
      }
    }
  });

  it('the ready stone lets them in after a short warning, and the skip stone closes once they are in', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.hands });
    idle(w, 1);
    expect(skipOpen(w)).toBe(true);
    w.bodies.x[0] = TUT_PLACES.ready[0]; w.bodies.y[0] = TUT_PLACES.ready[1];
    idle(w, T(TUT_TIMES.warn) - 3);
    expect(w.tut!.state[TS.go]).toBe(0);
    idle(w, 4);
    expect(w.tut!.state[TS.go]).toBeGreaterThan(0);
    expect(skipOpen(w)).toBe(false);
    w.bodies.x[0] = TUT_PLACES.skip[0]; w.bodies.y[0] = TUT_PLACES.skip[1];
    idle(w, T(1.5));
    expect(w.tut!.state[TS.lit]).toBe(0);
  });

  it('the test: a faint retries the current wave, calm again', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.test });
    idle(w, 1);
    w.tut!.state[TS.wave] = 1;
    w.bodies.hp[0] = -5;
    idle(w, 1);
    expect(w.tut!.state[TS.wave]).toBe(1);
    expect(w.tut!.state[TS.go]).toBe(0);
  });

  it('the pit: you can not step in, and a flamethrower from its lip falls short; a fireball does not', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.fireball });
    idle(w, 1);
    const b = w.bodies, [px, py] = TUT_PLACES.pit;
    b.x[0] = px - TUT_PLACES.pitR - 1; b.y[0] = py;
    idle(w, T(1), { moveX: 127, aimX: 32 });
    expect(Math.hypot(b.x[0] - px, b.y[0] - py)).toBeGreaterThanOrEqual(TUT_PLACES.pitR + b.r[0] - 1e-9);
    const k = (() => { for (let i = 4; i < b.kind.length; i++) if (w.tut!.tag[i] === TUT_TAG.far) return i; return -1; })();
    const aim = { aimX: (px - b.x[0]) * 32, aimY: (py - b.y[0]) * 32 };
    idle(w, 1, { ...aim, press0: EL.fire }); idle(w, 1, { ...aim, press0: EL.fire });
    idle(w, 120, { ...aim, buttons: BTN.force });
    idle(w, 60, aim);
    expect(b.hp[k]).toBe(b.maxHp[k]);
    idle(w, 1, { ...aim, press0: EL.earth }); idle(w, 1, { ...aim, press0: EL.fire });
    idle(w, 30, { ...aim, buttons: BTN.force });
    idle(w, 180, aim);
    expect(b.kind[k]).toBe(KIND.none);
  });

  it('the Life beat: the dummy stays hurt until healed, and a healing ring wakes the goblin asleep beside it', () => {
    const w = createWorld(1, 1, { room: 'tutorial', tutorialBeat: TUT_BEAT.life });
    idle(w, T(5));
    const b = w.bodies, t = w.tut!;
    let d = -1, z = -1;
    for (let i = 4; i < b.kind.length; i++) { if (t.tag[i] === TUT_TAG.patient) d = i; if (t.tag[i] === TUT_TAG.sleeper) z = i; }
    expect(b.hp[d]).toBeLessThan(b.maxHp[d]); // no dummy reset
    expect(b.down[z]).toBeGreaterThan(0); // asleep
    b.x[0] = (b.x[d] + b.x[z]) / 2 - 0.8; b.y[0] = (b.y[d] + b.y[z]) / 2;
    for (let k = 0; k < 3; k++) { idle(w, 1, { press0: EL.life }); idle(w, 1, { press0: EL.life }); idle(w, 1, { buttons: BTN.area }); idle(w, 60); idle(w, T(2)); }
    expect(t.tag[z]).toBe(TUT_TAG.foe); // awake
  });
});
