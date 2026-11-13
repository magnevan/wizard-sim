/**
 * The sound's pure logic: the variation layer, the synth, the recipes, and above all the director's
 * rollback safety, with a fake sink and real RollbackSessions. Nobody can hear a test, so these check
 * what can be checked without ears; `npm run check:sound` renders the real thing offline in Chrome.
 */
import { describe, expect, test } from 'vitest';
import { ELEMENT_NAMES, ENEMY_KINDS, INTERACTIONS, SHAPE_NAMES, UI_SOUNDS, WEAPON_MOVES, clipsOf, composeCharge, composeAuraLoop, composeDeath, composeDismiss, composeDowned, composeDry, composeElement, composeFlight, composeFootstep, composeHit, composeImpact, composeInteraction, composeMove, composeQueue, composeRain, composeRockBreak, composeShape, composeSpell, composeStop, composeSpring, composeSteamCloud, composeStrike, composeSustain, composeTelegraph, composeUi, composeBurning, composeFloorFire, composeSparkField, composeBlink, composeBlocked, composeHeal, composeStinger, runesOf, shapeOf, type ElementName, type Plan, type SpellSound } from '../src/audio/recipes';
import { BANK } from '../src/audio/bank.gen';
import { FIRE_KIT, useKit, SIGIL_KIT, layersOf } from '../src/audio/kits';
import { SYNTH_IDS, SYNTH_LOOPS, renderSynth } from '../src/audio/synth';
import { ENVS, LOOP_GRACE, Limiter, LoopTable, OPEN_HZ, envOfRoom, impulse, jitter, occlusion, pick, placeOf, runeMod, seeded, wallsBetween, type EnvName, type Listener, type WallSet } from '../src/audio/variation';
import { SoundDirector, type SoundSink } from '../src/audio/director';
import { EV, NO_INPUT, createWorld, step, type SimEvent, type World } from '@wizard-sim/sim';
import { LoopbackHub, RollbackSession } from '@wizard-sim/net';
import { demoInput, parseDemo } from '../src/demo';

const ear: Listener = { cx: 0, cy: 0, halfW: 20, earX: 0, earY: 0 };

class FakeSink implements SoundSink {
  ready = true;
  plays: Plan[] = [];
  live = new Map<string, Plan>();
  started: string[] = [];
  stopped: string[] = [];
  doubled: string[] = [];
  env: EnvName | null = null;
  play(plan: Plan): void { this.plays.push(plan); }
  loop(key: string, plan: Plan): void { if (this.live.has(key)) this.doubled.push(key); this.live.set(key, plan); this.started.push(key); }
  place(): void {}
  stop(key: string): void { this.live.delete(key); this.stopped.push(key); }
  setEnv(e: EnvName): void { this.env = e; }
  count(prefix: string): number { return this.plays.filter((p) => p.name.startsWith(prefix)).length; }
}

describe('runes', () => {
  test('more runes: louder, lower, longer, heavier', () => {
    for (let n = 1; n < 5; n++) {
      const a = runeMod(n), b = runeMod(n + 1);
      expect(b.gain).toBeGreaterThan(a.gain);
      expect(b.rate).toBeLessThan(a.rate);
      expect(b.length).toBeGreaterThan(a.length);
      expect(b.weight).toBeGreaterThan(a.weight);
      expect(b.wet).toBeGreaterThan(a.wet);
    }
    expect(runeMod(1).weight).toBe(0);
    expect(runeMod(9)).toEqual(runeMod(5));
  });
});

describe('rooms', () => {
  test('each profile has an impulse response of its own, and caves ring longest', () => {
    const energy = (e: EnvName) => impulse(e, 8000)[0].reduce((a, v) => a + v * v, 0);
    expect(impulse('cave', 8000)[0].length).toBeGreaterThan(impulse('hall', 8000)[0].length);
    expect(impulse('hall', 8000)[0].length).toBeGreaterThan(impulse('outdoor', 8000)[0].length);
    expect(energy('cave')).toBeGreaterThan(energy('outdoor'));
    expect(ENVS.cave.send).toBeGreaterThan(ENVS.outdoor.send);
    for (const e of ['hall', 'cave', 'outdoor'] as const) for (const c of impulse(e, 8000)) expect(c.every(Number.isFinite)).toBe(true);
  });
  test('rooms map to profiles, and an unknown room is a hall', () => {
    expect(envOfRoom('arena')).toBe('outdoor');
    expect(envOfRoom('tutorial')).toBe('cave');
    expect(envOfRoom('academy')).toBe('hall');
  });
});

describe('where a sound is', () => {
  const walls: WallSet = { type: [1, 0, 2], x1: [5, 9, 12], y1: [-5, -5, -5], x2: [5, 9, 12], y2: [5, 5, 5] };

  test('a wall on the line counts; one that is off the line or gone does not', () => {
    expect(wallsBetween(walls, 0, 0, 8, 0)).toBe(1); // through the rock
    expect(wallsBetween(walls, 0, 0, 3, 0)).toBe(0); // in front of it
    expect(wallsBetween(walls, 0, 8, 8, 8)).toBe(0); // past its end
    expect(wallsBetween(walls, 0, 0, 10, 0)).toBe(1); // the slot with type 0 is an empty one
    expect(wallsBetween(walls, 0, 0, 14, 0)).toBeCloseTo(1.4); // rock, and a barrier that only dulls
    expect(wallsBetween(null, 0, 0, 8, 0)).toBe(0);
  });
  test('behind a wall is quieter and duller, and two walls more so', () => {
    const open = occlusion(0), one = occlusion(1), two = occlusion(2);
    expect(open.lowpass).toBe(OPEN_HZ);
    expect(one.gain).toBeLessThan(open.gain);
    expect(one.lowpass).toBeLessThan(2000);
    expect(two.gain).toBeLessThan(one.gain);
    expect(two.lowpass).toBeLessThan(one.lowpass);
    const behind = placeOf(8, 0, ear, walls), clear = placeOf(8, 0, ear, null);
    expect(behind.gain).toBeLessThan(clear.gain);
    expect(behind.lowpass).toBeLessThan(clear.lowpass);
  });
  test('pan follows the screen, and far away is quieter', () => {
    expect(placeOf(-15, 0, ear, null).pan).toBeLessThan(0);
    expect(placeOf(15, 0, ear, null).pan).toBeGreaterThan(0);
    expect(Math.abs(placeOf(0, 5, ear, null).pan)).toBe(0);
    expect(placeOf(40, 0, ear, null).gain).toBeLessThan(placeOf(12, 0, ear, null).gain);
    expect(placeOf(4, 0, ear, null).gain).toBe(1);
  });
  test('occlusion listens from the wizard, not the camera', () => {
    const l = { ...ear, earX: 7 }; // the wizard is already past the wall
    expect(placeOf(8, 0, l, walls).gain).toBe(1);
  });
});

describe('repeats and crowds', () => {
  test('jitter stays small and moves', () => {
    const r = seeded(4), seen = new Set<number>();
    for (let i = 0; i < 50; i++) { const j = jitter(r); seen.add(j.rate); expect(j.rate).toBeGreaterThan(0.94); expect(j.rate).toBeLessThan(1.06); }
    expect(seen.size).toBeGreaterThan(40);
  });
  test('pick never repeats the last clip', () => {
    const r = seeded(9), list = ['a', 'b', 'c'];
    let last: string | undefined;
    for (let i = 0; i < 200; i++) { const p = pick(list, r, last); expect(p).not.toBe(last); last = p; }
  });
  test('the limiter keeps a gap, a ceiling and a per-frame budget', () => {
    const l = new Limiter(3);
    l.frame();
    expect(l.admit('a', { gap: 0.05, max: 9 }, 1, 0.1)).toBeGreaterThan(0);
    expect(l.admit('a', { gap: 0.05, max: 9 }, 1.01, 0.1)).toBe(0); // too soon
    expect(l.admit('b', { gap: 0, max: 1 }, 1, 5)).toBeGreaterThan(0);
    expect(l.admit('b', { gap: 0, max: 1 }, 1.2, 5)).toBe(0); // still ringing
    expect(l.admit('c', { gap: 0, max: 9 }, 1, 0.1)).toBeGreaterThan(0);
    expect(l.admit('d', { gap: 0, max: 9 }, 1, 0.1)).toBe(0); // the frame's budget is spent
    expect(l.admit('e', { gap: 0, max: 9 }, 1, 0.1, true)).toBeGreaterThan(0); // an urgent sound isn't turned away
    l.frame();
    expect(l.admit('d', { gap: 0, max: 9 }, 1, 0.1)).toBeGreaterThan(0);
  });
  test('a crowd gets quieter, and recovers', () => {
    const l = new Limiter(99), rule = { gap: 0, max: 99 };
    const first = l.admit('h', rule, 0, 0.01);
    let g = first;
    for (let i = 1; i < 12; i++) { l.frame(); g = l.admit('h', rule, i * 0.02, 0.01); }
    expect(g).toBeLessThan(first * 0.5);
    expect(l.admit('h', rule, 10, 0.01)).toBeGreaterThan(g);
  });
});

describe('the loop table', () => {
  const want = (...ids: string[]) => new Map(ids.map((i) => [i, i]));
  test('starts once, updates after, and forgives a wobble', () => {
    const t = new LoopTable<string>();
    expect(t.sync(want('a')).start.map((s) => s.id)).toEqual(['a']);
    expect(t.sync(want('a')).start).toEqual([]);
    for (let i = 0; i < LOOP_GRACE - 1; i++) expect(t.sync(want()).stop).toEqual([]); // a prediction wobbled
    const back = t.sync(want('a'));
    expect(back.start).toEqual([]); // it never stopped, so it doesn't restart
    expect(back.update.map((s) => s.id)).toEqual(['a']);
  });
  test('stops what stays gone, and a changed id crossfades', () => {
    const t = new LoopTable<string>();
    t.sync(want('chan|beam'));
    const c = t.sync(want('chan|spray'));
    expect(c.start.map((s) => s.id)).toEqual(['chan|spray']);
    let stops: string[] = [];
    for (let i = 0; i < LOOP_GRACE; i++) stops = stops.concat(t.sync(want('chan|spray')).stop);
    expect(stops).toEqual(['chan|beam']);
    expect(t.clear()).toEqual(['chan|spray']);
    expect(t.size).toBe(0);
  });
});

describe('synth', () => {
  test.each([...SYNTH_IDS])('%s is sound: finite, in range, not silent, the same every time', (id) => {
    const x = renderSynth(id)!;
    expect(x.length).toBeGreaterThan(400);
    let peak = 0, sq = 0;
    for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); sq += v * v; }
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.3);
    expect(Math.sqrt(sq / x.length)).toBeGreaterThan(0.005);
    expect(renderSynth(id)).toEqual(x);
  });
  test.each([...SYNTH_LOOPS])('%s joins up: its seam is no bigger than its ordinary steps', (id) => {
    const x = renderSynth(id)!;
    let step = 0;
    for (let i = 1; i < x.length; i++) step = Math.max(step, Math.abs(x[i] - x[i - 1]));
    expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(step * 1.5);
  });
});

/** Every plan any recipe can make: to hold them to the clips that exist. */
function everyPlan(): Plan[] {
  const out: Plan[] = [], r = seeded(1);
  for (let round = 0; round < 12; round++) {
    for (const el of ELEMENT_NAMES) {
      out.push(composeElement(el, r), composeCharge(el), composeFlight(el), composeImpact(el, 0.4, r), composeImpact(el, 2, r), composeHit(el, 20, r), composeQueue(el, 2), composeDeath('small', el, r), composeDeath('big', el, r));
      for (const m of WEAPON_MOVES) out.push(composeMove(m, el, r));
      for (const sh of SHAPE_NAMES) for (const n of [1, 3, 5]) { out.push(composeSpell({ els: { [el]: n }, shape: sh }, r), composeSustain({ els: { [el]: n }, shape: sh })); }
    }
    for (const sh of SHAPE_NAMES) out.push(composeShape(sh));
    for (const k of INTERACTIONS) out.push(composeInteraction(k, r));
    for (const k of ENEMY_KINDS) out.push(composeTelegraph(k, r), composeStrike(k, r));
    for (const k of UI_SOUNDS) out.push(composeUi(k));
    out.push(composeHit(null, 3, r), composeHeal(r), composeDowned(), composeDry(), composeFootstep(r), composeFootstep(r, true), composeBlink(), composeBlocked(r), composeRockBreak(r), composeRain(), composeSteamCloud(), composeSpring(), composeSparkField(), composeBurning(), composeFloorFire(), composeStinger('wave'), composeStinger('clear'), composeStinger('lose'));
  }
  return out;
}

describe('recipes', () => {
  test('every clip a recipe names exists, and every bank clip is used', () => {
    const kitClips = [...Object.values(FIRE_KIT).flat(), ...layersOf(SIGIL_KIT)].flatMap((l) => l.clips);
    const known = new Set([...BANK.map((c) => c.id), ...SYNTH_IDS]), used = new Set([...everyPlan().flatMap(clipsOf), ...kitClips]);
    expect([...used].filter((c) => !known.has(c))).toEqual([]);
    expect(BANK.map((c) => c.id).filter((c) => !used.has(c))).toEqual([]);
  });
  test('a kit takes over only while it is in use, and only the spells its element leads', () => {
    const flame: SpellSound = { els: { fire: 3 }, shape: 'spray', lead: 'fire' }, wet: SpellSound = { els: { water: 3 }, shape: 'spray', lead: 'water' };
    const before = composeSustain(flame).name;
    expect(composeStop(flame)).toBeNull();
    useKit('fire', FIRE_KIT);
    try {
      expect(composeSustain(flame).layers.map((l) => l.clip)).toEqual(['fire-jet', 'fire-jet-sub']);
      expect(composeSpell(flame).name).toBe('kit:spray');
      expect(composeStop(flame)?.layers[0].clip).toMatch(/^fire-die/);
      expect(composeSpell({ ...flame, shape: 'nova' }).name).toBe('kit:nova');
      expect(composeSpell({ ...flame, shape: 'self' }).layers[0].clip).toMatch(/^fire-puff/);
      expect(composeSpell({ ...flame, shape: 'wall' }).name).not.toMatch(/^kit/);
      for (const p of [composeCharge('fire'), composeFlight('fire'), composeFloorFire(), composeBurning()]) expect(p.name).toMatch(/^kit:/);
      expect(composeHit('fire', 5, seeded(1), false).layers.every((l) => l.clip.startsWith('fire-puff'))).toBe(true);
      expect(composeImpact('fire', 1).name).toBe('kit:land');
      expect(composeStop(wet)).toBeNull();
      expect(composeSustain(wet).name).not.toMatch(/^kit/);
    } finally { useKit('fire', null); }
    expect(composeSustain(flame).name).toBe(before);
  });
  test('what a kit leaves out falls through to our own sounds', () => {
    const rock: SpellSound = { els: { earth: 2 }, shape: 'nova', lead: 'earth' }, ours = composeSpell(rock, seeded(1)).name;
    useKit('earth', { force: [{ clips: ['fire-catch'], gain: 0.5 }], flight: [] });
    try {
      expect(composeSpell(rock, seeded(1)).name).toBe(ours);
      expect(composeSpell({ ...rock, shape: 'force' }).name).toBe('kit:force');
      expect(composeImpact('earth', 1).name).not.toMatch(/^kit/);
      expect(composeFlight('earth').layers).toEqual([]);
      expect(composeStop(rock)).toBeNull();
    } finally { useKit('earth', null); }
  });
  test('a spell can have its own sound, and its own with one element in it', () => {
    const one = { clips: ['fire-catch'], gain: 0.5 }, two = { clips: ['fire-thud'], gain: 0.5 }, three = { clips: ['fire-lick'], gain: 0.5 };
    useKit('sigil', { place: [three], spells: { lens: [one], aura: [one], 'aura+lightning': [two], turret: [] } });
    try {
      const clip = (s: SpellSound) => composeSpell(s, seeded(1)).layers[0].clip;
      expect(clip({ els: { sigil: 1 }, shape: 'place', lead: 'sigil', form: 'lens' })).toBe('fire-catch');
      expect(clip({ els: { sigil: 1, cold: 1 }, shape: 'place', lead: 'sigil', form: 'glyph' })).toBe('fire-lick');
      expect(clip({ els: { sigil: 1, lightning: 1 }, shape: 'self', lead: 'sigil', form: 'aura' })).toBe('fire-thud');
      expect(composeSpell({ els: { sigil: 1, cold: 1 }, shape: 'place', lead: 'sigil', form: 'turret' }).layers).toEqual([]);
      expect(clip({ els: { sigil: 1, water: 1 }, shape: 'self', lead: 'water', form: 'aura' })).toBe('fire-catch');
    } finally { useKit('sigil', null); }
  });
  test('an aura loops only if its element has a loop', () => {
    useKit('sigil', { spells: { 'hold:aura+fire': [{ clips: ['fire-lick'], gain: 0.5, loop: true }] } });
    try {
      expect(composeAuraLoop('fire')?.layers[0].loop).toBe(true);
      expect(composeAuraLoop('cold')).toBeNull();
    } finally { useKit('sigil', null); }
  });
  test("a kit's rune tick is pitched by the element", () => {
    useKit('sigil', { spells: { queue: [{ clips: ['fire-catch'], gain: 0.3 }] } });
    try {
      const fire = composeQueue('fire', 1).layers[0], water = composeQueue('water', 1).layers[0];
      expect(fire.clip).toBe('fire-catch');
      expect(fire.rate).not.toBe(water.rate);
    } finally { useKit('sigil', null); }
  });
  test('dismissing is silent to a kit that has no sound for it', () => {
    expect(composeDismiss('sigil')).toBeNull();
    useKit('sigil', { dismiss: [{ clips: ['fire-catch'], gain: 0.5 }] });
    try { expect(composeDismiss('sigil')?.name).toBe('kit:dismiss'); } finally { useKit('sigil', null); }
  });
  test("a kit's held layers loop, and nothing else does", () => {
    const loops = new Set(BANK.filter((c) => c.loop).map((c) => c.id));
    for (const l of [...FIRE_KIT.hold, ...FIRE_KIT.beam, ...FIRE_KIT.status]) { expect(l.loop).toBe(true); for (const c of l.clips) expect(loops.has(c), c).toBe(true); }
    for (const l of [...FIRE_KIT.start, ...FIRE_KIT.stop, ...FIRE_KIT.launch, ...FIRE_KIT.burst, ...FIRE_KIT.land]) expect(l.loop).toBeFalsy();
  });
  test('sustained layers have looping clips', () => {
    const loops = new Set([...BANK.filter((c) => c.loop).map((c) => c.id), ...SYNTH_LOOPS]);
    for (const p of everyPlan()) for (const l of p.layers) if (l.loop) expect(loops.has(l.clip), `${p.name}: ${l.clip}`).toBe(true);
  });
  test('every gain is sane and every layer fades', () => {
    for (const p of everyPlan()) for (const l of p.layers) {
      expect(l.gain, p.name).toBeGreaterThan(0);
      expect(l.gain, p.name).toBeLessThanOrEqual(1.1);
      expect(l.rate, p.name).toBeGreaterThan(0.2);
      expect(l.attack, p.name).toBeGreaterThan(0);
      expect(l.release, p.name).toBeGreaterThan(0.02);
    }
  });
  test('every shape of the sim falls into one the ear knows, and the casts of the brief are all there', () => {
    const sim = ['beam', 'spray', 'arc', 'missile', 'shards', 'nova', 'quake', 'discharge', 'patch', 'blast', 'geyser', 'strike', 'spring', 'swing', 'palm', 'imbue', 'self', 'blink', 'wave', 'ring', 'arcwall', 'drawnwall', 'ward', 'guard', 'turret', 'orbitals', 'motes', 'glyph', 'lineglyph', 'lens', 'wand', 'weapon', 'aura', 'double'];
    for (const s of sim) expect(SHAPE_NAMES).toContain(shapeOf(s));
    expect(new Set(sim.map(shapeOf)).size).toBe(SHAPE_NAMES.length);
    expect(shapeOf('nova')).toBe('nova');
    expect(shapeOf('todo')).toBe('force');
  });
  test('the same elements in different shapes are different structures, and elements differ in one shape', () => {
    const sig = (p: Plan) => p.layers.map((l) => `${l.clip}@${l.at}/${l.attack}/${l.hold}`).sort().join();
    const r = () => 0;
    const shapes = SHAPE_NAMES.map((shape) => sig(composeSpell({ els: { fire: 2 }, shape }, r)));
    expect(new Set(shapes).size).toBe(SHAPE_NAMES.length);
    const els = ELEMENT_NAMES.map((e) => sig(composeSpell({ els: { [e]: 2 }, shape: 'force' }, r)));
    expect(new Set(els).size).toBe(ELEMENT_NAMES.length);
  });
  test('a mix keeps its lead on top, and runes change the plan', () => {
    const p = composeSpell({ els: { earth: 2, fire: 1 }, shape: 'missile', lead: 'fire' }, () => 0);
    const fire = p.layers.find((l) => l.clip.startsWith('fire-burst'))!, earth = p.layers.find((l) => l.clip.startsWith('earth-hit'))!;
    expect(fire.gain).toBeGreaterThan(earth.gain);
    const one = composeSpell({ els: { fire: 1 }, shape: 'nova' }, () => 0), five = composeSpell({ els: { fire: 5 }, shape: 'nova' }, () => 0);
    expect(five.layers.some((l) => l.clip === 'y-sub')).toBe(true);
    expect(one.layers.some((l) => l.clip === 'y-sub')).toBe(false);
    expect(five.wet).toBeGreaterThan(one.wet);
  });
  test('at most three elements sound at once', () => {
    const els = Object.fromEntries(ELEMENT_NAMES.slice(0, 5).map((e) => [e, 1])) as Record<ElementName, number>;
    expect(runesOf(els)).toBe(5);
    const hits = composeSpell({ els, shape: 'force' }, () => 0).layers.filter((l) => !l.loop && !l.clip.startsWith('y-whoosh') && l.clip !== 'y-sub');
    expect(hits.length).toBe(3);
  });
});

/** Runs seat 1's `spell` over a laggy link, with page A (seat 0) hearing it. */
function online(spell: string, ticks: number, latency = 12, a0?: (w: World) => void) {
  const hub = new LoopbackHub(2, { latency });
  const [a, b] = [0, 1].map((s) => new RollbackSession(createWorld(7, 2), hub.endpoint(s), [0, 1], 1, false));
  a0?.(a.world);
  const sink = new FakeSink(), dir = new SoundDirector(sink, seeded(5));
  let truth = 0;
  a.hooks = {
    after: (w) => { if (a.replaying) dir.replayStep(w, 0); else dir.afterStep(w, () => false); },
    postRewind: (w) => dir.postRewind(w),
  };
  b.hooks = { after: (w) => { if (!b.replaying) truth += w.events.filter((e) => e.kind === 'cast' && e.who === 1).length; } };
  const d = parseDemo(spell)!;
  for (let f = 0; f < ticks; f++) {
    for (const [x, p] of [[a, 0], [b, 1]] as const) {
      x.poll();
      if (x.nextScheduled <= x.tick + x.delay) x.pushLocal(p === 1 ? demoInput(x.world, x.tick, 1, d) : NO_INPUT);
      x.flush();
      x.advance(1);
    }
    hub.tick();
    dir.frame(a.world, ear, f / 60);
  }
  return { sink, dir, truth, a };
}

describe('the director', () => {
  const world = () => createWorld(7, 2);
  const ev = (o: Partial<SimEvent>): SimEvent => ({ tick: 1, kind: 'hit', who: 5, x: 1, y: 1, ...o });
  const fire = (d: SoundDirector, w: World, events: SimEvent[], now = 1) => { w.events = events; d.afterStep(w, (s) => s === 0); d.frame(w, ear, now); };

  test('does nothing before audio can play', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    s.ready = false;
    fire(d, w, [ev({ amount: 9 })]);
    expect(s.plays).toEqual([]);
    s.ready = true;
    d.frame(w, ear, 2);
    expect(s.plays).toEqual([]); // and what happened before doesn't all come out at once
  });
  test('sets the room\'s reverb', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = createWorld(7, 1, { room: 'arena' });
    d.frame(w, ear, 1);
    expect(s.env).toBe('outdoor');
  });
  test('a hundred hits in one frame stay within the budget', () => {
    const s = new FakeSink(), d = new SoundDirector(s, seeded(2)), w = world();
    fire(d, w, Array.from({ length: 100 }, (_, i) => ev({ who: 4 + (i % 60), amount: 5, look: 8 })));
    expect(s.plays.length).toBeGreaterThan(0);
    expect(s.plays.length).toBeLessThanOrEqual(8);
    expect(d.limiter.dropped).toBeGreaterThan(90);
  });
  test('a cast beats a crowd of hits to the budget', () => {
    const s = new FakeSink(), d = new SoundDirector(s, seeded(2)), w = world();
    w.seats.castId[0] = 1; w.seats.castQueue[0] = 8; w.seats.castLen[0] = 1;
    fire(d, w, [...Array.from({ length: 40 }, (_, i) => ev({ who: 4 + i, amount: 5 })), ev({ kind: 'cast', who: 0, x: 0, y: 0, look: 8 })]);
    expect(s.plays[0].name.split(':')[0]).not.toBe('hit');
  });
  test('only your own queue blips; a banner is a stinger', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    fire(d, w, [ev({ kind: 'queue', who: 0, look: 8 }), ev({ kind: 'queue', who: 1, look: 8 }), ev({ kind: 'cast', who: -1, x: 0, y: 0, ev: EV.waveStart, text: 'Wave 3' })]);
    expect(s.count('queue:fire')).toBe(1);
    expect(s.count('stinger:wave')).toBe(1);
  });
  test('interactions: a douse hisses, a shatter shatters, a death is a death', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    fire(d, w, [ev({ ev: EV.doused, text: 'Doused', amount: 3 }), ev({ kind: 'shatter' }), ev({ kind: 'fizzle', ev: EV.death, text: 'dies', look: 2, el: 8 }), ev({ kind: 'cancel', who: 0, text: 'Fire cancels Water', look: 8 })], 1);
    expect(s.count('shatter')).toBe(1);
    expect(s.count('death:')).toBe(1);
    expect(s.count('douse')).toBe(1);
    expect(s.count('cancel')).toBe(1);
  });
  test('a sound too far behind too much wall is not worth a voice', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    w.events = [ev({ x: 900, y: 0, amount: 5 })];
    d.afterStep(w, () => false);
    d.frame(w, { ...ear }, 1);
    expect(s.plays).toEqual([]);
  });

  test('a room switch fades what was sounding and forgets the old world', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    w.zones.type[0] = 6; w.zones.x[0] = 1; w.zones.life[0] = 300;
    for (let i = 1; i < 4; i++) { w.clock[0] = i * 10; w.events = []; d.afterStep(w, () => false); d.frame(w, ear, i / 60); }
    expect(s.live.size).toBe(1);
    w.clock[0] = 0; w.zones.type[0] = 0; w.events = [];
    d.afterStep(w, () => false);
    d.frame(w, ear, 1);
    expect(s.live.size).toBe(0);
  });
  test('a paused sim fades its loops, and they come back', () => {
    const s = new FakeSink(), d = new SoundDirector(s), w = world();
    w.zones.type[0] = 6; w.zones.life[0] = 9999;
    d.frame(w, ear, 0);
    expect(s.live.size).toBe(1);
    for (let i = 1; i <= 30; i++) d.frame(w, ear, i / 60); // the clock isn't moving
    expect(s.live.size).toBe(0);
    w.clock[0]++;
    d.frame(w, ear, 1);
    expect(s.live.size).toBe(1);
    expect(s.doubled).toEqual([]);
  });

  describe('rollback', () => {
    test('every remote cast is heard once: none lost, none doubled', () => {
      const r = online('earth,fire/force', 600);
      expect(r.truth).toBeGreaterThan(1);
      expect(r.sink.count('missile:')).toBe(r.truth);
      expect(r.a.world.clock[0]).toBeGreaterThan(500);
    });
    test('the same, with no lag at all: the replay path is not what makes it work', () => {
      const r = online('earth,fire/force', 600, 0);
      expect(r.sink.count('missile:')).toBe(r.truth);
    });
    test('a late channel starts sounding, and fades when it ends, with no stuck or doubled loop', () => {
      const r = online('arcane/force', 900);
      const chans = r.sink.started.filter((k) => k.startsWith('chan:1'));
      expect(chans.length).toBeGreaterThan(0);
      expect(r.sink.doubled).toEqual([]);
      // each one started was stopped, unless it's sounding right now
      for (const k of new Set(chans)) {
        const starts = r.sink.started.filter((x) => x === k).length, stops = r.sink.stopped.filter((x) => x === k).length;
        expect(starts - stops).toBe(r.sink.live.has(k) ? 1 : 0);
      }
    });
    test("a kit's held spell ends in its dying breath, once per time it stops", () => {
      useKit('fire', FIRE_KIT);
      try {
        const r = online('fire,fire,fire/force', 900);
        const stops = r.sink.stopped.filter((k) => k.startsWith('chan:1')).length;
        expect(stops).toBeGreaterThan(0);
        expect(r.sink.count('kit:stop')).toBe(stops);
        expect(r.sink.doubled).toEqual([]);
      } finally { useKit('fire', null); }
    });
    test('a replayed event that was already heard is not heard again', () => {
      const s = new FakeSink(), d = new SoundDirector(s), w = world();
      const hit = ev({ tick: 20, amount: 8, look: 8 });
      fire(d, w, [hit]);
      const before = s.plays.length;
      expect(before).toBe(1);
      w.events = [ev({ tick: 21, amount: 8, look: 8 })]; // the correction moved it a tick
      d.replayStep(w, 0);
      d.postRewind(w);
      d.frame(w, ear, 3);
      expect(s.plays.length).toBe(before);
    });
    test('a late event that never sounded is heard after the replay', () => {
      const s = new FakeSink(), d = new SoundDirector(s), w = world();
      w.clock[0] = 40;
      w.events = [ev({ tick: 30, kind: 'shatter' })];
      d.replayStep(w, 0);
      d.postRewind(w);
      d.frame(w, ear, 1);
      expect(s.count('shatter')).toBe(1);
    });
    test('your own events are never "late", and one older than the window is dropped', () => {
      const s = new FakeSink(), d = new SoundDirector(s), w = world();
      w.clock[0] = 400;
      w.events = [ev({ tick: 395, kind: 'shatter', who: 0 }), ev({ tick: 200, kind: 'shatter', who: 7 })];
      d.replayStep(w, 0);
      d.postRewind(w);
      d.frame(w, ear, 1);
      expect(s.plays).toEqual([]);
    });
  });

  test('a real fight plays through the director without throwing, within its limits', () => {
    const s = new FakeSink(), d = new SoundDirector(s, seeded(1)), w = createWorld(7, 2, { room: 'arena' }), demo = parseDemo('fire,fire/force')!;
    for (let t = 0; t < 900; t++) {
      step(w, [demoInput(w, t, 0, demo), demoInput(w, t, 1, demo), NO_INPUT, NO_INPUT]);
      d.afterStep(w, (x) => x === 0);
      d.frame(w, ear, t / 60);
      expect(s.live.size).toBeLessThanOrEqual(10);
    }
    expect(s.plays.length).toBeGreaterThan(0);
  });
});
