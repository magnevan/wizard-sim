// The drill yard (yard.ts): its stations along the path, the charged focus at the rack, and the gate on to the battery.
import { describe, expect, it } from 'vitest';
import { BTN, EL, EV, KIND, MAX_SEATS, N_EL, NO_INPUT, T, YARD, YST, YTAG, createWorld, hashWorld, markerOf, runeMax, step, yardDone, type PlayerInput, type World } from '../src';
import { sparTarget } from '../src/yard';

const NONE: PlayerInput[] = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
const run = (w: World, ticks: number, ins: PlayerInput[] = NONE) => { for (let i = 0; i < ticks; i++) step(w, ins); };
const tagged = (w: World, tag: number) => { const out: number[] = []; for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy && w.yard!.tag[i] === tag) out.push(i); return out; };
const put = (w: World, i: number, id: string, dx = 0, dy = 0) => { const m = markerOf(w.def, id)!; w.bodies.x[i] = m.x + dx; w.bodies.y[i] = m.y + dy; w.bodies.vx[i] = w.bodies.vy[i] = 0; };

describe('the drill yard', () => {
  it('lays out its straw goblins, the sack and the two sparring soldiers, and you start with no runes', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    expect(tagged(w, YTAG.straw)).toHaveLength(4);
    expect(tagged(w, YTAG.sack)).toHaveLength(1);
    expect(tagged(w, YTAG.mallet)).toHaveLength(1);
    expect(tagged(w, YTAG.bow)).toHaveLength(1);
    for (let e = 1; e <= N_EL; e++) expect(runeMax(w, 0, e)).toBe(0);
  });

  it('counts walking, and the strike lanes once every straw goblin is down; they stand again later', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    w.bodies.x[0] += YARD.walked + 1;
    run(w, 2);
    expect(yardDone(w, YST.walk)).toBe(true);
    expect(yardDone(w, YST.strike)).toBe(false);
    for (const i of tagged(w, YTAG.straw)) w.bodies.hp[i] = 0;
    run(w, 3);
    expect(yardDone(w, YST.strike)).toBe(true);
    expect(tagged(w, YTAG.straw)).toHaveLength(0);
    run(w, T(YARD.strikeBack) + 2);
    expect(tagged(w, YTAG.straw)).toHaveLength(4);
  });

  it('keeps its sparring soldiers at their spots while nobody is there, and they can\'t be beaten', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    const [mallet] = tagged(w, YTAG.mallet), home = markerOf(w.def, 'retreat')!;
    w.bodies.x[mallet] += 3;
    run(w, 240);
    expect(Math.hypot(w.bodies.x[mallet] - home.x, w.bodies.y[mallet] - home.y)).toBeLessThan(0.6);
    expect(w.bodies.hp[mallet]).toBeGreaterThan(9999);
  });

  it('the slam lesson: a soldier at the ring slams the wizard who steps in, and dodged slams count', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    put(w, 0, 'retreat', 2.5, 0);
    // stand still: the first slams land; then the counter is reset by each one that hits
    let landed = 0;
    for (let k = 0; k < 600 && !landed; k++) { step(w, NONE); for (const e of w.events) if (e.kind === 'note' && e.ev === EV.slamDone) landed++; }
    expect(landed).toBeGreaterThan(0);
    expect(w.bodies.kind[0]).toBe(KIND.wizard); // fainting, never dying
  });

  it('Use at the rack gives a charged focus: one Fire and one Sigil, no regen; then the gate leads on to the battery', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    put(w, 0, 'gate');
    run(w, 2);
    expect(w.mode.leaveTo?.(w)).toBeUndefined(); // no focus yet: the gate waits
    put(w, 0, 'focus');
    step(w, [{ ...NO_INPUT, buttons: BTN.use }, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(w.yard!.focus[0]).toBe(1);
    expect(w.seats.runes[EL.fire - 1]).toBe(YARD.focusFire);
    expect(w.seats.runes[EL.sigil - 1]).toBe(YARD.focusSigil);
    expect(yardDone(w, YST.focus)).toBe(true);
    w.seats.runes[EL.fire - 1] = 0;
    run(w, 120);
    expect(w.seats.runes[EL.fire - 1]).toBe(0); // a focus holds a charge: it doesn't refill
    put(w, 0, 'gate');
    run(w, 2);
    expect(w.mode.leaveTo?.(w)).toBe('court');
  });

  it('the hands test sends four straw goblins at whoever stands in its ring a moment, once', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    put(w, 0, 'hands');
    run(w, 2);
    expect(tagged(w, YTAG.goblin)).toHaveLength(0); // nothing happens to you just for stepping in
    run(w, T(YARD.ready));
    expect(tagged(w, YTAG.goblin)).toHaveLength(4);
    for (const i of tagged(w, YTAG.goblin)) w.bodies.hp[i] = 0;
    run(w, 3);
    expect(yardDone(w, YST.hands)).toBe(true);
    run(w, 30);
    expect(tagged(w, YTAG.goblin)).toHaveLength(0); // not again until nobody is near
  });

  it('the sparring soldiers wait until you have stood at their station a moment', () => {
    const w = createWorld(7, 1, { room: 'yard' });
    run(w, 2);
    const mallet = tagged(w, YTAG.mallet)[0], bow = tagged(w, YTAG.bow)[0];
    put(w, 0, 'retreat');
    run(w, 2);
    expect(sparTarget(w, mallet)).toBe(-1);
    run(w, T(YARD.ready));
    expect(sparTarget(w, mallet)).toBe(0);
    put(w, 0, 'parry');
    run(w, 2);
    expect(sparTarget(w, bow)).toBe(-1);
    run(w, T(YARD.ready));
    expect(sparTarget(w, bow)).toBe(0);
  });

  it('runs the same twice', () => {
    const go = () => { const w = createWorld(7, 2, { room: 'yard' }); put(w, 0, 'retreat', 2, 0); put(w, 1, 'parry'); run(w, 900); return hashWorld(w); };
    expect(go()).toBe(go());
  });
});
