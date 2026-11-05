import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  ARCH, ARCHETYPES, ARENA, BTN, CELL, DEVICE, EL, KIND, N_PU, PERKS, SURF, SURVIVE_ARENA, SURVIVE_GATES, T, scriptedInput, NO_INPUT, PHASE_ENC, PU, RUNES, STRUCT, SURVIVE_ROCK, SURVIVE_TIMES, TEAM, TERRAIN, WALL, WARD,
  botInput, buffers, createWorld, elementId, grant, hashWorld, newBotMemory, quantize, replaceWorld, restore, runeMax, snapshot, spawnBody, step,
  type PlayerInput, type World,
} from '../src';
import { cellAt, floorDisc } from '../src/effects';
import { applyHit } from '../src/hit';

/** One Fire and one Earth rune, as a payload (9 counts). */
const fireEarth = new Uint8Array(9);
fireEarth[EL.fire - 1] = 1; fireEarth[EL.earth - 1] = 1;

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
    // a brute slams right on the keep's wall, for a minute
    const [x1, y1, x2, y2] = SURVIVE_ROCK[0], mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const e = foe(w, ARCH.brute, mx - 1, my);
    w.bodies.x[0] = mx + 1; w.bodies.y[0] = my;
    new Driver(w).tick({}, 60 * 40);
    expect(w.bodies.kind[e]).toBe(KIND.enemy);
    expect(terrain()).toBe(SURVIVE_ROCK.length);
    expect(w.walls.hp[0]).toBe(w.walls.maxHp[0]);
    expect(w.nav.blocked.some((c) => c === 1)).toBe(true);
  });
});

describe('survive: the big arena', () => {
  it('is 48 x 34 with grids to match; the other rooms keep the 24 x 16 arena', () => {
    const w = createWorld(1, 1, { room: 'survive' });
    expect(w.dims).toMatchObject({ w: SURVIVE_ARENA.w, h: SURVIVE_ARENA.h, gw: SURVIVE_ARENA.w / CELL, gh: SURVIVE_ARENA.h / CELL });
    expect(w.surf.kind.length).toBe(w.dims.gw * w.dims.gh);
    expect(w.nav.field.length).toBe(4 * w.dims.gw * w.dims.gh);
    for (const room of ['sanctum', 'arena'] as const) {
      const o = createWorld(1, 1, { room });
      expect(o.dims).toMatchObject({ w: ARENA.w, h: ARENA.h });
      expect(o.surf.kind.length).toBe((ARENA.w / CELL) * (ARENA.h / CELL));
    }
    // every terrain segment, gate and altar is inside the arena (walls may run just past the edge)
    for (const [x1, y1, x2, y2] of SURVIVE_ROCK) for (const [x, y] of [[x1, y1], [x2, y2]]) {
      expect(Math.abs(x)).toBeLessThanOrEqual(w.dims.w / 2 + 0.5);
      expect(Math.abs(y)).toBeLessThanOrEqual(w.dims.h / 2 + 0.5);
    }
    for (const [x, y] of SURVIVE_GATES) { expect(Math.abs(x)).toBeLessThan(w.dims.w / 2); expect(Math.abs(y)).toBeLessThan(w.dims.h / 2); }
  });

  it('bodies are free past the old bounds and clamped to the new ones', () => {
    const { w, d } = quiet();
    w.bodies.x[0] = 19; w.bodies.y[0] = 13;
    d.tick();
    expect(w.bodies.x[0]).toBeCloseTo(19, 1); expect(w.bodies.y[0]).toBeCloseTo(13, 1);
    w.bodies.x[0] = 40; w.bodies.y[0] = -40;
    d.tick();
    expect(w.bodies.x[0]).toBeLessThanOrEqual(w.dims.w / 2 - w.bodies.r[0] + 1e-9);
    expect(w.bodies.y[0]).toBeGreaterThanOrEqual(-w.dims.h / 2 + w.bodies.r[0] - 1e-9);
    // surfaces reach the far corners too
    floorDisc(w, 20, 13.5, 1, EL.water);
    expect(w.surf.kind[cellAt(w, 20, 13.5)]).toBe(SURF.water);
    expect(cellAt(w, 23, 0)).toBeGreaterThanOrEqual(0);
    expect(cellAt(w, 25, 0)).toBe(-1);
  });

  it('nav reaches the whole arena: an enemy from every gate finds its way to the plaza', () => {
    const w = createWorld(1, 1, { room: 'survive' });
    w.enc.state[0] = PHASE_ENC.off;
    w.bodies.x[0] = 0; w.bodies.y[0] = 0.5; w.bodies.hp[0] = w.bodies.maxHp[0] = 1e6;
    const ids = SURVIVE_GATES.map(([x, y]) => foe(w, ARCH.swarmer, x, y));
    const best = ids.map(() => Infinity);
    new Driver(w).tick({}, 2);
    // the field has a finite distance at every gate's cell
    const INF = 0x3fffffff, gw = w.dims.gw;
    for (const [x, y] of SURVIVE_GATES) {
      const c = Math.floor((y + w.dims.h / 2) / CELL) * gw + Math.floor((x + w.dims.w / 2) / CELL);
      expect(w.nav.field[c]).toBeLessThan(INF);
    }
    for (let t = 0; t < 60 * 25; t++) {
      new Driver(w).tick();
      ids.forEach((i, k) => { if (w.bodies.kind[i] === KIND.enemy) best[k] = Math.min(best[k], Math.hypot(w.bodies.x[i], w.bodies.y[i] - 0.5)); });
    }
    for (const d of best) expect(d).toBeLessThan(2);
  });

  it('a scripted survive run hashes the same twice', () => {
    const run = () => {
      const w = createWorld(5, 2, { room: 'survive' });
      const trail: number[] = [];
      let most = 0;
      for (let t = 0; t < 60 * 40; t++) {
        step(w, [scriptedInput(t, 0), scriptedInput(t, 1)]);
        if (t % 300 === 0) trail.push(hashWorld(w));
        most = Math.max(most, enemies(w));
      }
      return { trail, hash: hashWorld(w), most };
    };
    const a = run(), b = run();
    expect(a.trail).toEqual(b.trail);
    expect(a.hash).toBe(b.hash);
    expect(a.most).toBeGreaterThan(0); // the first wave came
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

  it('the pick has no time limit, and nothing leaves the open portals while it lasts', () => {
    const w = createWorld(3, 2, { room: 'survive' });
    w.enc.state[0] = PHASE_ENC.breather; w.enc.state[2] = 1; w.enc.state[1] = 2;
    const d = new Driver(w);
    d.tick({}, 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    const r = w.run!;
    w.bodies.x[0] = r.ax[0]; w.bodies.y[0] = r.ay[0];
    d.tick({}, 60); // P1 picks; P2 dawdles for two minutes
    expect(r.picked[0]).toBe(0);
    const left = Array.from(w.enc.left).reduce((a, n) => a + n, 0);
    expect(left).toBeGreaterThan(0); // the next wave's portals are open...
    d.tick({}, 60 * 120);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick);
    expect(enemies(w)).toBe(0); // ...and release nothing
    expect(Array.from(w.enc.left).reduce((a, n) => a + n, 0)).toBe(left);
    w.bodies.x[1] = r.ax[2]; w.bodies.y[1] = r.ay[2];
    d.tick({}, 60);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
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
    grant(w, 0, PU.wellspring);
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
    expect(w.run!.stacks[PU.wellspring]).toBe(0);
    expect(w.run!.state[2]).toBe(1);
    expect(w.bodies.hp[0]).toBe(w.bodies.maxHp[0]);
    expect(rune(w, 'fire')).toBe(RUNES.surviveStart);
    expect(enemies(w)).toBe(0);
  });
});

describe('survive: power-ups', () => {
  it('no power-up: Survive starts weak (2 per element, Sigil 1), and the shared regen fills an empty pool', () => {
    const { w, d } = quiet();
    for (let id = 1; id <= 9; id++) expect(runeMax(w, 0, id)).toBe(id === EL.sigil ? RUNES.surviveSigil : RUNES.surviveStart);
    expect(rune(w, 'fire')).toBe(RUNES.surviveStart);
    expect(runeMax(createWorld(1, 1), 0, EL.fire)).toBe(RUNES.max.fire); // the Sanctum keeps its pools
    w.seats.runes[EL.fire - 1] = 0;
    d.tick({}, 30);
    // Fire is the only pool refilling: the floor's share plus all of the shared part
    const all = 8 * RUNES.surviveStart + RUNES.surviveSigil, m = RUNES.surviveStart;
    expect(rune(w, 'fire')).toBeCloseTo(0.5 * RUNES.regen * m * (RUNES.floor / all + (1 - RUNES.floor) / m), 6);
  });

  it('+1 to three: the wizard taps three different element keys (not Shield or Sigil), which queue nothing', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.three);
    expect(w.run!.choose[0]).toBe(3);
    d.queue('fire', 'fire', 'shield', 'sigil', 'cold');
    expect(w.run!.choose[0]).toBe(1);
    expect(w.seats.queueLen[0]).toBe(0);
    expect(runeMax(w, 0, EL.fire)).toBe(RUNES.surviveStart + 1);
    expect(rune(w, 'fire')).toBe(RUNES.surviveStart + 1); // filled at once
    expect(runeMax(w, 0, EL.shield)).toBe(RUNES.surviveStart);
    expect(runeMax(w, 0, EL.sigil)).toBe(RUNES.surviveSigil);
    d.queue('earth');
    expect(w.run!.choose[0]).toBe(0);
    expect(Array.from(w.run!.chosen.subarray(0, 3))).toEqual([EL.fire, EL.cold, EL.earth]);
    expect(runeMax(w, 0, EL.earth)).toBe(RUNES.surviveStart + 1);
    d.queue('water'); // done choosing: the keys queue runes again
    expect(w.seats.queueLen[0]).toBe(1);
    expect(runeMax(w, 0, EL.water)).toBe(RUNES.surviveStart);
  });

  it('+1 to three holds the pick until the wizard has chosen, and the choice survives a rollback', () => {
    const w = createWorld(5, 1, { room: 'survive' });
    w.enc.state[0] = PHASE_ENC.breather; w.enc.state[2] = 1; w.enc.state[1] = 2;
    const d = new Driver(w);
    d.tick({}, 2);
    const r = w.run!;
    r.offer[0] = PU.three; r.offerEl[0] = 0;
    w.bodies.x[0] = r.ax[0]; w.bodies.y[0] = r.ay[0];
    d.tick({}, 60);
    expect(r.picked[0]).toBe(0);
    expect(r.choose[0]).toBe(3);
    expect(w.enc.state[0]).toBe(PHASE_ENC.pick); // still waiting for the three taps
    d.queue('life', 'arcane');
    const snap = snapshot(w);
    d.queue('lightning');
    const after = hashWorld(w);
    restore(w, snap);
    expect(r.choose[0]).toBe(1);
    d.queue('lightning');
    expect(hashWorld(w)).toBe(after);
    d.tick({}, 1);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
    expect(runeMax(w, 0, EL.lightning)).toBe(RUNES.surviveStart + 1);
  });

  it('+1 Shield and +1 Sigil', () => {
    const { w } = quiet();
    grant(w, 0, PU.shieldSigil);
    expect(runeMax(w, 0, EL.shield)).toBe(RUNES.surviveStart + 1);
    expect(runeMax(w, 0, EL.sigil)).toBe(RUNES.surviveSigil + 1);
    expect(runeMax(w, 0, EL.fire)).toBe(RUNES.surviveStart);
  });

  it('pools refill to full when a wave is cleared', () => {
    const w = createWorld(3, 1, { room: 'survive' });
    const d = new Driver(w);
    d.tick({}, 60 * SURVIVE_TIMES.firstLull + 5);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    for (let e = 0; e < 9; e++) w.seats.runes[e] = 0;
    d.tick({}, 30);
    w.enc.left.fill(0); killAll(w);
    d.tick({}, 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.breather);
    expect(rune(w, 'fire')).toBe(RUNES.surviveStart);
    expect(rune(w, 'sigil')).toBe(RUNES.surviveSigil);
  });

  it('Deep (one element): +2 of the altar\'s element only, and they fit in one spell', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.deepEl, EL.earth);
    expect(runeMax(w, 0, EL.earth)).toBe(RUNES.surviveStart + 2);
    expect(runeMax(w, 0, EL.fire)).toBe(RUNES.surviveStart);
    d.queue('earth', 'earth', 'earth', 'earth', 'earth');
    expect(w.seats.queueLen[0]).toBe(RUNES.surviveStart + 2);
  });

  it('Wellspring: more total regen R', () => {
    const fill = (well: boolean) => {
      const { w, d } = quiet();
      if (well) grant(w, 0, PU.wellspring);
      w.seats.runes[EL.fire - 1] = 0;
      d.tick({}, 30);
      return rune(w, 'fire');
    };
    expect(fill(true)).toBeCloseTo(fill(false) * (1 + PERKS.wellspring), 6);
  });

  it('Shield and Sigil: one more device stands', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.shieldSigil);
    for (let k = 0; k < RUNES.surviveSigil + 1; k++) d.aimAt(3, -3 + k * 1.5).queue('sigil', 'fire').cast(BTN.area, 30, 120);
    expect(Array.from(w.devices.type).filter((t) => t === DEVICE.glyph).length).toBe(RUNES.surviveSigil + 1);
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

  it('Glass heart: more damage dealt, less max health, per stack (two at most)', () => {
    const run = (k: number) => {
      const { w } = quiet();
      for (let n = 0; n < k; n++) grant(w, 0, PU.glass);
      const t = dummy(w, 4, 0);
      const dealt = applyHit(w, t, fireEarth, 0, { scale: 1, heal: false, scald: false, freeze: false, source: 0, dirX: 1, dirY: 0, push: 0 });
      return { dealt, maxHp: w.bodies.maxHp[0], hp: w.bodies.hp[0], stacks: w.run!.stacks[PU.glass] };
    };
    const plain = run(0), one = run(1), three = run(3);
    expect(plain.dealt).toBeGreaterThan(5);
    expect(one.dealt).toBeCloseTo(plain.dealt * (1 + PERKS.glassDmg), 6);
    expect(one.maxHp).toBeCloseTo(plain.maxHp * (1 - PERKS.glassHp), 6);
    expect(one.hp).toBeCloseTo(one.maxHp, 6); // full health stays full: it shrinks with the max
    expect(three.stacks).toBe(2); // capped
    expect(three.dealt).toBeCloseTo(plain.dealt * (1 + 2 * PERKS.glassDmg), 6);
    expect(three.maxHp).toBeCloseTo(plain.maxHp * (1 - 2 * PERKS.glassHp), 6);
  });

  it('Glass heart: your own spells hurt a partner more too (friendly fire stays)', () => {
    const run = (glass: boolean) => {
      const { w, d } = quiet(2);
      if (glass) grant(w, 0, PU.glass);
      w.bodies.x[1] = 4; w.bodies.y[1] = 0;
      d.aimAt(4, 0).queue('earth').cast(BTN.force, 1, 60); // a rock, thrown at your partner
      return w.bodies.maxHp[1] - w.bodies.hp[1];
    };
    const plain = run(false);
    expect(plain).toBeGreaterThan(1);
    expect(run(true)).toBeCloseTo(plain * (1 + PERKS.glassDmg), 6);
  });

  it('the pool: Slipstream, Bloom and Rally are not power-ups; Glass heart is', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(seed, 1, { room: 'survive' });
      w.enc.state[0] = PHASE_ENC.breather; w.enc.state[2] = 1;
      new Driver(w).tick({}, 2);
      for (const p of w.run!.offer) seen.add(p);
    }
    expect(seen.has(PU.glass)).toBe(true);
    expect(Math.max(...seen)).toBeLessThan(N_PU);
    expect(seen.has(0)).toBe(false);
    expect('slipstream' in PU || 'bloom' in PU || 'rally' in PU).toBe(false);
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
    expect(free.fire).toBeCloseTo(RUNES.surviveStart, 6); // and never draws on it: the pool refills to full
  });

  /** P2 down beside P1 in a lull that never ends (downed wizards stay down until a breather). */
  const fallen = () => {
    const q = quiet(2);
    q.w.enc.state[0] = PHASE_ENC.lull; q.w.enc.state[2] = 1e6;
    q.w.bodies.hp[1] = 0; q.w.bodies.downed[1] = 1;
    return q;
  };

  it('Rally (everyone has it): stand by a downed ally for rallyTime and they get up mid-wave', () => {
    const { w, d } = fallen(), r = w.run!;
    expect(r.stacks.every((n) => n === 0)).toBe(true); // no power-up needed
    d.tick({}, T(PERKS.rallyTime) - 2);
    expect(w.bodies.downed[1]).toBe(1);
    expect(r.rallyBy[1]).toBe(0);
    expect(r.rally[1]).toBe(T(PERKS.rallyTime) - 2);
    d.tick({}, 3);
    expect(w.bodies.downed[1]).toBe(0);
    expect(w.bodies.hp[1]).toBeCloseTo(w.bodies.maxHp[1] * PERKS.rallyHp, 6);
    expect(r.rally[1]).toBe(0);
    expect(r.rallyBy[1]).toBe(-1);
  });

  it('Rally: too far away, nothing; stepping away empties the ring', () => {
    const { w, d } = fallen(), r = w.run!;
    w.bodies.x[0] = -PERKS.rallyRange; // 1.5 + 1.6 from P2
    d.tick({}, 30);
    expect(r.rally[1]).toBe(0);
    w.bodies.x[0] = 0;
    d.tick({}, 60);
    expect(r.rally[1]).toBeGreaterThan(50);
    w.bodies.x[0] = -PERKS.rallyRange;
    d.tick({}, 2);
    expect(r.rally[1]).toBe(0);
  });

  it('Rally: casting starts it over, a hit only drains some, queueing runes does nothing', () => {
    const { w, d } = fallen(), r = w.run!;
    d.tick({}, 60);
    d.queue('fire', 'fire'); // preparing the next spell is fine
    expect(r.rally[1]).toBe(62);
    d.aimAt(5, 0).tick({ buttons: BTN.force });
    expect(r.rally[1]).toBe(0); // the cast broke it
    d.tick({}, 150); // wind-up and recovery, then it fills again
    const before = r.rally[1];
    expect(before).toBeGreaterThan(T(PERKS.rallyDrain) + 10);
    w.bodies.lastHit[0] = w.clock[0]; // a goblin's blow lands
    d.tick({}, 1);
    expect(r.rally[1]).toBe(before - T(PERKS.rallyDrain)); // drained, not emptied
    expect(w.bodies.downed[1]).toBe(1);
  });

  it('Rally: a goblin hitting the rescuer slows the rally well past rallyTime', () => {
    const { w, d } = fallen();
    w.bodies.hp[0] = w.bodies.maxHp[0] = 1e6; // the rescuer outlasts it
    foe(w, ARCH.swarmer, -1, 0);
    d.tick({}, Math.round(T(PERKS.rallyTime) * 1.5));
    expect(w.bodies.hp[0]).toBeLessThan(1e6); // it was hit
    expect(w.bodies.downed[1]).toBe(1); // still down: each blow drained the ring
  });

  it('Echo: a free Double stands with you, binds no Sigil rune, draws enemies, and fades when the wave is cleared', () => {
    const w = createWorld(3, 1, { room: 'survive' });
    const d = new Driver(w), s = w.seats, b = w.bodies;
    grant(w, 0, PU.echo);
    const dbl = s.double[0];
    expect(dbl).toBeGreaterThanOrEqual(4);
    expect(b.kind[dbl]).toBe(KIND.double);
    expect(b.hp[dbl]).toBe(PERKS.echoHp);
    expect(w.run!.echo[0]).toBe(dbl);
    // every Sigil rune is still free: as many devices stand beside it as you have Sigil runes
    grant(w, 0, PU.shieldSigil);
    for (let k = 0; k < RUNES.surviveSigil + 1; k++) d.aimAt(3, -3 + k * 1.5).queue('sigil', 'fire').cast(BTN.area, 30, 120);
    expect(Array.from(w.devices.type).filter((t) => t === DEVICE.glyph).length).toBe(RUNES.surviveSigil + 1);
    expect(b.kind[dbl]).toBe(KIND.double); // and recalling the oldest never took the Double
    // through the lull into the wave; enemies go for the Double
    d.tick({}, 60 * SURVIVE_TIMES.firstLull + 5);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    const g = foe(w, ARCH.swarmer, b.x[dbl] + 3, b.y[dbl]);
    d.tick({}, 30);
    expect(b.target[g]).toBe(dbl);
    expect(b.kind[dbl]).toBe(KIND.double);
    w.enc.left.fill(0);
    killAll(w);
    d.tick({}, 2);
    expect(w.enc.state[0]).toBe(PHASE_ENC.breather);
    expect(b.kind[dbl]).not.toBe(KIND.double);
    expect(s.double[0]).toBe(-1);
    expect(w.run!.echo[0]).toBe(-1);
  });

  it('Echo: a Double you cast replaces it (and binds a rune as usual)', () => {
    const { w, d } = quiet();
    grant(w, 0, PU.echo);
    const echo = w.seats.double[0];
    d.queue('sigil').cast(BTN.self, 1, 30);
    expect(w.seats.double[0]).toBeGreaterThanOrEqual(4);
    expect(w.bodies.kind[w.seats.double[0]]).toBe(KIND.double);
    expect(w.run!.echo[0]).toBe(-1);
    expect(w.bodies.kind[echo] === KIND.double && echo !== w.seats.double[0]).toBe(false);
  });

  it('Echo can be picked again (a one-shot), Mirror charm only once', () => {
    const { w } = quiet();
    grant(w, 0, PU.echo); grant(w, 0, PU.echo);
    grant(w, 0, PU.charm); grant(w, 0, PU.charm);
    expect(w.run!.stacks[PU.echo]).toBe(2);
    expect(w.run!.stacks[PU.charm]).toBe(1);
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
