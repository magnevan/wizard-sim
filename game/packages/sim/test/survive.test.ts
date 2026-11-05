import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  ARCH, ARCHETYPES, BTN, DEVICE, EL, KIND, NO_INPUT, PHASE_ENC, PU, RUNES, STRUCT, SURVIVE_ROCK, SURVIVE_TIMES, TEAM, TERRAIN, WALL, WARD,
  botInput, buffers, createWorld, elementId, grant, hashWorld, newBotMemory, quantize, replaceWorld, restore, runeMax, snapshot, spawnBody, step,
  type PlayerInput, type World,
} from '../src';

/** Drives seat `seat`; the other seats stand still. */
class Driver {
  aim = { x: 1, y: 0 };
  constructor(readonly w: World, readonly seat = 0) {}
  tick(over: Partial<PlayerInput> = {}, n = 1): this {
    const b = this.w.bodies;
    for (let k = 0; k < n; k++) {
      const all = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
      all[this.seat] = quantize({ ...NO_INPUT, aimX: (this.aim.x - b.x[this.seat]) * 32, aimY: (this.aim.y - b.y[this.seat]) * 32, ...over });
      step(this.w, all);
    }
    return this;
  }
  aimAt(x: number, y: number): this { this.aim = { x, y }; return this; }
  queue(...els: Element[]): this { for (const e of els) this.tick({ press0: elementId(e) }); return this; }
  cast(btn: number, hold = 1, after = 40): this { this.tick({ buttons: btn }, hold); return this.tick({}, after); }
}

const rune = (w: World, el: Element, seat = 0) => w.seats.runes[seat * 9 + elementId(el) - 1];
const enemies = (w: World) => Array.from(w.bodies.kind).filter((k) => k === KIND.enemy).length;
const killAll = (w: World) => { for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) w.bodies.hp[i] = 0; };

/** A survive world with the director off and the arena's rock cleared: for testing one power-up. */
function quiet(players = 1) {
  const w = createWorld(1, players, { room: 'survive' });
  w.enc.state[0] = PHASE_ENC.off;
  w.walls.type.fill(0);
  w.bodies.x[0] = 0; w.bodies.y[0] = 0;
  if (players > 1) { w.bodies.x[1] = 1.5; w.bodies.y[1] = 0; }
  return { w, d: new Driver(w) };
}
function foe(w: World, arch: number, x: number, y: number): number {
  const a = ARCHETYPES[arch], i = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, a.hp, a.radius);
  w.bodies.arch[i] = arch;
  return i;
}
function dummy(w: World, x: number, y: number, slot = 8): number {
  const b = w.bodies;
  b.kind[slot] = KIND.dummy; b.team[slot] = TEAM.enemies; b.x[slot] = x; b.y[slot] = y; b.r[slot] = 0.5; b.hp[slot] = b.maxHp[slot] = 400;
  return slot;
}

describe('survive: the arena', () => {
  it('only a survive world carries run state, so the other rooms keep their layout', () => {
    expect(createWorld(1, 1).run).toBeNull();
    expect(createWorld(1, 1, { room: 'arena' }).run).toBeNull();
    expect(buffers(createWorld(1, 1, { room: 'survive' })).length).toBeGreaterThan(buffers(createWorld(1, 1)).length);
  });

  it('has static rock that never times out or breaks, and steers enemies', () => {
    const w = createWorld(1, 1, { room: 'survive' });
    const terrain = () => Array.from(w.walls.owner).filter((o, k) => o === TERRAIN && w.walls.type[k] === WALL.rock).length;
    expect(terrain()).toBe(SURVIVE_ROCK.length);
    w.enc.state[0] = PHASE_ENC.off;
    // a brute slams right on a gate funnel, for a minute
    const e = foe(w, ARCH.brute, -9.2, -2.6);
    w.bodies.x[0] = -8.2; w.bodies.y[0] = -2.6;
    new Driver(w).tick({}, 60 * 40);
    expect(w.bodies.kind[e]).toBe(KIND.enemy);
    expect(terrain()).toBe(SURVIVE_ROCK.length);
    expect(w.walls.hp[0]).toBe(w.walls.maxHp[0]);
    expect(w.nav.blocked.some((c) => c === 1)).toBe(true);
  });
});

describe('survive: the wave loop', () => {
  it('lull -> wave -> breather -> pick (three different altars) -> lull -> wave 2', () => {
    const w = createWorld(3, 1, { room: 'survive' });
    const d = new Driver(w);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
    d.tick({}, 60 * SURVIVE_TIMES.firstLull + 5);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    d.tick({}, 60 * 4); // the portals spill their enemies
    expect(enemies(w)).toBeGreaterThan(0);
    killAll(w);
    d.tick({}, 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.breather);
    expect(w.enc.state[3]).toBe(1);
    d.tick({}, 60 * SURVIVE_TIMES.breather + 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    const r = w.run!, offer = Array.from(r.offer);
    expect(offer.every((p) => p > 0)).toBe(true);
    expect(new Set(offer).size).toBe(3);
    expect(w.enc.total[0]).toBeGreaterThan(0); // the next wave's portals are already open
    // the pick waits for the player
    d.tick({}, 60 * 5);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    // walk onto the middle altar and stand there
    w.bodies.x[0] = r.ax[1]; w.bodies.y[0] = r.ay[1];
    d.tick({}, 60);
    expect(r.picked[0]).toBe(1);
    expect(r.stacks[offer[1]]).toBe(1);
    expect(r.logN[0]).toBe(1);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
    d.tick({}, 60 * SURVIVE_TIMES.lull + 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    expect(w.enc.state[1]).toBe(2);
  });

  it('walking past an altar does not take it: you must stand on it', () => {
    const w = createWorld(3, 1, { room: 'survive' });
    w.enc.state[0] = PHASE_ENC.breather; w.enc.state[2] = 1; w.enc.state[1] = 2;
    const d = new Driver(w);
    d.tick({}, 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    w.bodies.x[0] = w.run!.ax[0]; w.bodies.y[0] = w.run!.ay[0];
    d.tick({}, 20);
    w.bodies.x[0] = 0; w.bodies.y[0] = 4;
    d.tick({}, 60);
    expect(w.run!.picked[0]).toBe(-1);
  });

  it('two players can each take a power-up; the lull waits for both', () => {
    const w = createWorld(3, 2, { room: 'survive' });
    w.enc.state[0] = PHASE_ENC.breather; w.enc.state[2] = 1; w.enc.state[1] = 2;
    const d = new Driver(w);
    d.tick({}, 2);
    const r = w.run!;
    w.bodies.x[0] = r.ax[0]; w.bodies.y[0] = r.ay[0];
    d.tick({}, 60);
    expect(r.picked[0]).toBe(0);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    w.bodies.x[1] = r.ax[0]; w.bodies.y[1] = r.ay[0]; // the same altar: both get it
    w.bodies.x[0] = 0; w.bodies.y[0] = 4;
    d.tick({}, 60);
    expect(r.picked[1]).toBe(0);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
  });

  it('everyone down ends the run; Space starts a new one, the tick carrying on', () => {
    const w = createWorld(3, 1, { room: 'survive' });
    grant(w, 0, PU.deep);
    w.enc.state[1] = 4; w.enc.state[3] = 3;
    const d = new Driver(w);
    d.tick({}, 60 * SURVIVE_TIMES.firstLull + 5);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    w.bodies.hp[0] = 0;
    d.tick({}, 3);
    expect(w.enc.state[0]).toBe(PHASE_ENC.over);
    expect(w.run!.state[1]).toBe(3); // waves survived
    d.tick({ buttons: BTN.self }, 3).tick({}, 3); // too soon: ignored
    expect(w.enc.state[0]).toBe(PHASE_ENC.over);
    d.tick({}, 60 * SURVIVE_TIMES.restartAfter);
    const tick = w.clock[0];
    d.tick({ buttons: BTN.self }, 1);
    expect(w.clock[0]).toBe(tick + 1);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
    expect(w.enc.state[1]).toBe(1);
    expect(w.run!.stacks[PU.deep]).toBe(0);
    expect(w.run!.state[2]).toBe(1);
    expect(w.bodies.hp[0]).toBe(w.bodies.maxHp[0]);
    expect(rune(w, 'fire')).toBe(RUNES.max.fire);
    expect(enemies(w)).toBe(0);
  });
});

describe('survive: power-ups', () => {
  it('no power-up: rune max and regen are the config values', () => {
    const { w, d } = quiet();
    for (let id = 1; id <= 9; id++) expect(runeMax(w, 0, id)).toBe(runeMax(createWorld(1, 1), 0, id));
    w.seats.runes[EL.fire - 1] = 0;
    d.tick({}, 60);
    expect(rune(w, 'fire')).toBeCloseTo(RUNES.regen, 6);
  });

  it('Deep pools: +1 max of every element, filled at once', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.deep);
    expect(runeMax(w, 0, EL.fire)).toBe(RUNES.max.fire + 1);
    expect(rune(w, 'earth')).toBe(RUNES.max.earth + 1);
    w.seats.runes[EL.cold - 1] = RUNES.max.cold;
    d.tick({}, 60 * 6);
    expect(rune(w, 'cold')).toBeCloseTo(RUNES.max.cold + 1, 6);
  });

  it('Deep (one element): +2 of the altar\'s element only, and they fit in one spell', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.deepEl, EL.earth);
    expect(runeMax(w, 0, EL.earth)).toBe(RUNES.max.earth + 2);
    expect(runeMax(w, 0, EL.fire)).toBe(RUNES.max.fire);
    d.queue('earth', 'earth', 'earth', 'earth', 'earth');
    expect(w.seats.queueLen[0]).toBe(5);
  });

  it('Wellspring: 30% faster regen', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.wellspring);
    w.seats.runes[EL.fire - 1] = 0;
    d.tick({}, 60);
    expect(rune(w, 'fire')).toBeCloseTo(RUNES.regen * 1.3, 6);
  });

  it('Spare Sigil: one more device stands', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.spareSigil);
    for (let k = 0; k < RUNES.max.sigil + 1; k++) d.aimAt(3, -3 + k * 1.5).queue('sigil', 'fire').cast(BTN.area, 30, 30);
    expect(Array.from(w.devices.type).filter((t) => t === DEVICE.glyph).length).toBe(RUNES.max.sigil + 1);
  });

  it('Bedrock: your rock stands twice as long, with more hit points', () => {
    const plain = quiet(), bed = quiet();
    grant(bed.w, 0, PU.bedrock);
    for (const { w, d } of [plain, bed]) d.aimAt(5, 0).queue('shield', 'earth').cast(BTN.area, 20, 20);
    const k = (w: World) => Array.from(w.walls.type).indexOf(WALL.rock);
    expect(bed.w.walls.maxHp[k(bed.w)]).toBeCloseTo(plain.w.walls.maxHp[k(plain.w)] * 1.5, 6);
    for (const { d } of [plain, bed]) d.tick({}, 60 * (STRUCT.rockLife + 2));
    expect(k(plain.w)).toBe(-1);
    expect(k(bed.w)).toBeGreaterThanOrEqual(0);
  });

  it('Pyre: a burning enemy you lit explodes when it dies, hurting what is near', () => {
    const run = (pyre: boolean) => {
      const { w, d } = quiet();
      if (pyre) grant(w, 0, PU.pyre);
      const a = foe(w, ARCH.swarmer, 6, 0), b = foe(w, ARCH.swarmer, 6, 1.2);
      d.tick({}, 1);
      w.bodies.burn[a] = 120; w.bodies.burnSrc[a] = 0; w.bodies.hp[a] = 0.01;
      const hp = w.bodies.hp[b];
      d.tick({}, 2);
      return hp - w.bodies.hp[b];
    };
    expect(run(false)).toBeLessThan(0.5);
    expect(run(true)).toBeGreaterThan(5);
  });

  it('Slipstream: the first spell after a Retreat hop costs nothing', () => {
    const run = (slip: boolean) => {
      const { w, d } = quiet();
      if (slip) grant(w, 0, PU.slipstream);
      d.aimAt(5, 0).cast(BTN.weapon, 1, 20); // the hop
      d.queue('fire', 'fire').cast(BTN.force, 1, 30);
      return rune(w, 'fire');
    };
    expect(run(false)).toBeLessThan(RUNES.max.fire - 1.5);
    expect(run(true)).toBeGreaterThan(RUNES.max.fire - 0.5);
  });

  it('Charm: a mirror ward grows on you, and regrows after it breaks', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.charm);
    d.tick({}, 70);
    expect(w.seats.ward[0]).toBe(WARD.mirror);
    expect(w.seats.wardBy[0]).toBe(-1); // nobody keeps it up: no Shield drain
    w.seats.ward[0] = WARD.none;
    d.tick({}, 60 * 6);
    expect(w.seats.ward[0]).toBe(WARD.none);
    d.tick({}, 60 * (SURVIVE_TIMES.charm - 5));
    expect(w.seats.ward[0]).toBe(WARD.mirror);
  });

  it('Bloom: healing yourself splashes half onto an ally beside you', () => {
    const run = (bloom: boolean) => {
      const { w, d } = quiet(2);
      if (bloom) grant(w, 0, PU.bloom);
      w.bodies.hp[0] = 40; w.bodies.hp[1] = 40;
      d.queue('life', 'life').cast(BTN.self, 1, 30);
      return w.bodies.hp[1];
    };
    expect(run(false)).toBeLessThan(40.5);
    expect(run(true)).toBeGreaterThan(45);
  });

  it('Clockwork: your turrets fire for free', () => {
    const run = (cw: boolean) => {
      const { w, d } = quiet();
      if (cw) grant(w, 0, PU.clockwork);
      const t = dummy(w, 6, 0);
      d.aimAt(6, 0).queue('sigil', 'fire').cast(BTN.force, 1, 20);
      w.seats.runes[EL.fire - 1] = 0;
      d.tick({}, 300);
      return { hp: w.bodies.hp[t], fire: rune(w, 'fire') };
    };
    const paid = run(false), free = run(true);
    expect(free.hp).toBeLessThan(paid.hp); // it never stalls on an empty pool
    expect(free.fire).toBeCloseTo(RUNES.regen * 300 / 60, 1);
  });

  it('caps: a unique power-up is not granted twice', () => {
    const { w } = quiet();
    grant(w, 0, PU.pyre); grant(w, 0, PU.pyre);
    expect(w.run!.stacks[PU.pyre]).toBe(1);
  });
});

describe('survive: determinism', () => {
  const runBots = (ticks: number, seed = 11) => {
    const w = createWorld(seed, 2, { room: 'survive' });
    const mem = [newBotMemory(), newBotMemory()];
    const trail: number[] = [];
    for (let t = 0; t < ticks; t++) {
      step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1])]);
      if (t % 600 === 0) trail.push(hashWorld(w));
    }
    return { w, trail };
  };

  it('a bot survive run (through a pick) hashes the same twice', () => {
    const a = runBots(60 * 90), b = runBots(60 * 90);
    expect(a.trail).toEqual(b.trail);
    expect(hashWorld(a.w)).toBe(hashWorld(b.w));
    expect(a.w.enc.state[3]).toBeGreaterThanOrEqual(1); // it cleared a wave
    expect(a.w.run!.logN[0] + a.w.run!.logN[1]).toBeGreaterThanOrEqual(1); // and the bots took power-ups
  });

  it('a joining peer turns its world into a survive world in place (the netcode keeps the object)', () => {
    const w = createWorld(1, 1), host = createWorld(9, 2, { room: 'survive' });
    for (let t = 0; t < 120; t++) step(host, [NO_INPUT, NO_INPUT]);
    replaceWorld(w, createWorld(0, 2, { room: 'survive' }));
    restore(w, snapshot(host));
    expect(hashWorld(w)).toBe(hashWorld(host));
    replaceWorld(w, createWorld(3, 1)); // and back to the Sanctum
    expect(w.run).toBeNull();
    expect(buffers(w).length).toBe(buffers(createWorld(1, 1)).length);
  });

  it('snapshot / restore mid-run re-simulates to the same world', () => {
    const w = createWorld(4, 2, { room: 'survive' });
    const mem = [newBotMemory(), newBotMemory()];
    for (let t = 0; t < 60 * 30; t++) step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1])]);
    const snap = snapshot(w), m0 = structuredClone(mem);
    for (let t = 0; t < 60 * 30; t++) step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1])]);
    const straight = hashWorld(w);
    restore(w, snap);
    for (let t = 0; t < 60 * 30; t++) step(w, [botInput(w, 0, m0[0]), botInput(w, 1, m0[1])]);
    expect(hashWorld(w)).toBe(straight);
  });
});
