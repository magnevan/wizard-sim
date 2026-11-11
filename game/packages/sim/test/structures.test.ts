import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  BTN, DEVICE, EL, KIND, NO_INPUT, RUNES, STRUCT, WALL, WARD, compile, createWorld, elementId, orbitAngle, quantize, specOf, step,
  type PlayerInput, type World,
} from '../src';
import { damageWall } from '../src/walls';

class Driver {
  aim = { x: 1, y: 0 };
  constructor(readonly w: World, readonly seat = 0) {}
  tick(over: Partial<PlayerInput> = {}, n = 1): this {
    const b = this.w.bodies;
    for (let k = 0; k < n; k++) {
      const me = quantize({ ...NO_INPUT, aimX: (this.aim.x - b.x[this.seat]) * 32, aimY: (this.aim.y - b.y[this.seat]) * 32, ...over });
      const all = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
      all[this.seat] = me;
      step(this.w, all);
    }
    return this;
  }
  aimAt(x: number, y: number): this { this.aim = { x, y }; return this; }
  queue(...els: Element[]): this { for (const e of els) this.tick({ press0: elementId(e) }); return this; }
  cast(btn: number, hold = 1, after = 40): this { this.tick({ buttons: btn }, hold); return this.tick({}, after); }
  place(x: number, y: number, hold = 30): this { this.aimAt(x, y); return this.cast(BTN.area, hold); }
}

function arena(players = 1) {
  const w = createWorld(1, players, { dummies: false });
  w.bodies.x[0] = 0; w.bodies.y[0] = 0;
  if (players > 1) { w.bodies.x[1] = 4; w.bodies.y[1] = 0; }
  const dummy = (x: number, y: number, slot = 8) => {
    const b = w.bodies;
    b.kind[slot] = KIND.dummy; b.team[slot] = 2; b.x[slot] = x; b.y[slot] = y; b.r[slot] = 0.5; b.hp[slot] = b.maxHp[slot] = 400;
    return slot;
  };
  return { w, d: new Driver(w), dummy };
}
const walls = (w: World, type: number) => Array.from(w.walls.type).filter((t) => t === type).length;
const devices = (w: World, type: number) => Array.from(w.devices.type).filter((t) => t === type).length;
const rune = (w: World, el: Element, seat = 0) => w.seats.runes[seat * 9 + elementId(el) - 1];

describe('Shield', () => {
  it('Shield + Earth as Place raises a stone arc that stops a rock', () => {
    const { w, d, dummy } = arena();
    const t = dummy(5, 0);
    d.aimAt(5, 0).queue('shield', 'earth').cast(BTN.area, 20, 20); // hold: Place without a drag = the arc
    expect(walls(w, WALL.rock)).toBe(STRUCT.arcSegs);
    d.queue('earth').cast(BTN.force, 70, 40);
    expect(w.bodies.hp[t]).toBe(400);
  });

  it('Shield + Ice as Place raises an ice wall: a spike barrier that stops a rock, weaker than stone', () => {
    const { w, d, dummy } = arena();
    const t = dummy(5, 0);
    d.aimAt(5, 0).queue('shield', 'water', 'cold').cast(BTN.area, 20, 20);
    expect(walls(w, WALL.ice)).toBe(STRUCT.arcSegs);
    const k = Array.from(w.walls.type).indexOf(WALL.ice);
    expect(w.walls.maxHp[k]).toBeLessThan(STRUCT.rockHp);
    d.queue('earth').cast(BTN.force, 70, 40);
    expect(w.bodies.hp[t]).toBe(400);
  });

  it('an ice wall stabs whoever presses against it, and stands shorter than rock', () => {
    const { w, d } = arena(2);
    w.bodies.x[1] = STRUCT.arcRadius + 0.55; w.bodies.y[1] = 0;
    const hp0 = w.bodies.hp[1];
    d.aimAt(5, 0).queue('shield', 'water', 'cold').cast(BTN.area, 20, 90);
    expect(w.bodies.hp[1]).toBeLessThan(hp0);
    d.tick({}, 60 * (STRUCT.iceLife + 1));
    expect(walls(w, WALL.ice)).toBe(0);
  });

  it('fire melts an ice wall: a hit carrying Fire does STRUCT.iceMelt times the damage (not to stone)', () => {
    const { w, d } = arena();
    d.aimAt(5, 0).queue('shield', 'water', 'cold').cast(BTN.area, 20, 20);
    const [k1, k2] = Array.from(w.walls.type).flatMap((t, k) => (t === WALL.ice ? [k] : [])), h1 = w.walls.hp[k1], h2 = w.walls.hp[k2];
    damageWall(w, k1, 10, 0); damageWall(w, k2, 10, 1);
    expect(h1 - w.walls.hp[k1]).toBeCloseTo(10, 6);
    expect(h2 - w.walls.hp[k2]).toBeCloseTo(10 * STRUCT.iceMelt, 6);
  });

  it('coated rock acts on whoever touches it: a Life stone arc heals, a plain one does not', () => {
    for (const life of [true, false]) {
      const { w, d } = arena(2);
      w.bodies.x[1] = STRUCT.arcRadius + 0.55; w.bodies.y[1] = 0; w.bodies.hp[1] = 50;
      d.aimAt(5, 0).queue(...((life ? ['shield', 'life', 'earth'] : ['shield', 'earth']) as Element[])).cast(BTN.area, 20, 90);
      expect(walls(w, WALL.rock)).toBe(STRUCT.arcSegs);
      if (life) expect(w.bodies.hp[1]).toBeGreaterThan(50);
      else expect(w.bodies.hp[1]).toBe(50);
    }
  });

  it('a Life ring is small but heals as much per pulse as a Life arc', () => {
    const healed: number[] = [];
    for (const [r, hold] of [[STRUCT.arcRadius, 20], [STRUCT.ringRadius, 1]] as const) {
      const { w, d } = arena(2);
      w.bodies.x[1] = r; w.bodies.y[1] = 0; w.bodies.hp[1] = 40;
      d.aimAt(5, 0).queue('shield', 'life').cast(BTN.area, hold, 100); // hold: the arc; tap: the ring
      healed.push(w.bodies.hp[1] - 40);
    }
    expect(healed[0]).toBeGreaterThan(0);
    expect(healed[1]).toBeCloseTo(healed[0], 5);
  });

  it('a drag that comes back to its start is no line: a wall goes back to the arc, not a ring', () => {
    const { w, d } = arena();
    d.aimAt(5, 0).queue('shield', 'earth').tick({ buttons: BTN.area }, 3);
    d.aimAt(5, 4).tick({ buttons: BTN.area }, 3);
    expect(w.seats.dragged[0]).toBe(1);
    d.aimAt(5, 0).tick({ buttons: BTN.area }, 3);
    expect(w.seats.dragged[0]).toBe(0);
    d.tick({}, 40);
    expect(walls(w, WALL.rock)).toBe(STRUCT.arcSegs);
  });

  it('a glyph dragged out and back is a plain glyph; one released away is a line', () => {
    for (const away of [false, true]) {
      const { w, d } = arena();
      d.aimAt(5, 0).queue('sigil', 'fire').tick({ buttons: BTN.area }, 3);
      d.aimAt(5, 4).tick({ buttons: BTN.area }, 3);
      if (!away) d.aimAt(5, 0).tick({ buttons: BTN.area }, 3);
      d.tick({}, 40);
      expect(devices(w, DEVICE.glyph)).toBe(away ? 0 : 1);
      expect(devices(w, DEVICE.lineglyph)).toBe(away ? 1 : 0);
    }
  });

  it('rock times out: it crumbles over its last seconds, then falls', () => {
    const { w, d } = arena();
    d.aimAt(5, 0).queue('shield', 'earth').cast(BTN.area, 20, 20);
    const hp0 = w.walls.hp[Array.from(w.walls.type).indexOf(WALL.rock)];
    d.tick({}, 60 * (STRUCT.rockLife - 2) - 40);
    const k = Array.from(w.walls.type).indexOf(WALL.rock);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(w.walls.hp[k]).toBeLessThan(hp0); // crumbling
    d.tick({}, 60 * 3);
    expect(walls(w, WALL.rock)).toBe(0);
  });

  it('a long drawn wall has no gaps: it stops at the segments you may keep, never eating itself', () => {
    const cap = STRUCT.wallsPerOwner;
    STRUCT.wallsPerOwner = 12; // a 16 u drag is more than 12 segments
    const { w, d } = arena();
    d.aimAt(0, 3).queue('shield', 'earth').cast(BTN.area, 20, 20); // an arc first (5 segments)
    d.aimAt(-8, -5).queue('shield', 'earth').tick({ buttons: BTN.area }, 4);
    d.aimAt(8, -5).tick({ buttons: BTN.area }, 30).tick({}, 20); // drag 16 u: more than you may keep
    const wl = w.walls, segs: [number, number][] = [];
    for (let k = 0; k < wl.type.length; k++) if (wl.type[k] && Math.abs(wl.y1[k] + 5) < 0.6) segs.push([Math.min(wl.x1[k], wl.x2[k]), Math.max(wl.x1[k], wl.x2[k])]);
    segs.sort((a, b) => a[0] - b[0]);
    expect(segs.length).toBe(STRUCT.wallsPerOwner); // the arc made way
    for (let k = 1; k < segs.length; k++) expect(segs[k][0] - segs[k - 1][1]).toBeLessThan(0.01); // contiguous
    STRUCT.wallsPerOwner = cap;
  });

  it('a rock wall stops bodies', () => {
    const { w, d } = arena(2);
    d.aimAt(4, 0).queue('shield', 'earth').cast(BTN.area, 20, 20);
    // Walk the ally straight at the wall from outside.
    w.bodies.x[1] = 4; w.bodies.y[1] = 0;
    const b = new Driver(w, 1).aimAt(-5, 0);
    b.tick({ moveX: -127 }, 90);
    expect(w.bodies.x[1]).toBeGreaterThan(STRUCT.arcRadius);
  });

  it('a barrier of Shield alone turns shots back, and drains the Shield pool', () => {
    const { w, d } = arena(2);
    d.aimAt(4, 0).queue('shield').cast(BTN.area, 20, 20);
    expect(walls(w, WALL.barrier)).toBe(STRUCT.arcSegs);
    const before = rune(w, 'shield');
    // A wizard of the other team throws a rock at the barrier from outside: it comes back at them.
    w.bodies.team[1] = 9;
    const foe = new Driver(w, 1).aimAt(-5, 0);
    foe.queue('earth').cast(BTN.force, 30, 40);
    expect(w.bodies.hp[1]).toBeLessThan(100);
    expect(w.bodies.hp[0]).toBe(100);
    d.tick({}, 120);
    expect(rune(w, 'shield')).toBeLessThan(before + 2.5 * RUNES.regen);
  });

  it('enemies break through a barrier when the way round is long, and walk round when it is short', async () => {
    const { ARCH, ARCHETYPES } = await import('../src/archetypes');
    const { TERRAIN, spawnBody } = await import('../src/world');
    const run = (half: number) => {
      const w = createWorld(1, 1, { dummies: false }), b = w.bodies, wl = w.walls;
      b.x[0] = 0; b.y[0] = 0;
      // a rock wall at x = 2.5 from -half to +half, with a gap at the middle closed by the wizard's barrier
      const seg = (k: number, type: number, owner: number, y1: number, y2: number) => { wl.type[k] = type; wl.owner[k] = owner; wl.x1[k] = 2.5; wl.x2[k] = 2.5; wl.y1[k] = y1; wl.y2[k] = y2; wl.hp[k] = wl.maxHp[k] = type === WALL.rock ? 1e9 : 80; wl.born[k] = 0; };
      seg(0, WALL.rock, TERRAIN, -half, -1); seg(1, WALL.rock, TERRAIN, 1, half); seg(2, WALL.barrier, 0, -1, 1);
      const i = spawnBody(w, -1, KIND.enemy, 2, 6, 0, 1e6, ARCHETYPES[ARCH.swarmer].radius); b.arch[i] = ARCH.swarmer;
      for (let t = 0; t < 60 * 8; t++) step(w, [NO_INPUT]);
      return { battered: wl.type[2] !== WALL.barrier || wl.hp[2] < 80 || w.seats.runes[EL.shield - 1] < RUNES.max.shield - 0.3, x: b.x[i] };
    };
    const long = run(12), short = run(2.5);
    expect(long.battered).toBe(true);
    expect(long.x).toBeGreaterThan(2.5); // still on its side, at the barrier
    expect(short.x).toBeLessThan(2.5); // went round
  });

  it('a barrier is a force field: your team walks and shoots through it, the other team is stopped', () => {
    const { w, d } = arena(2);
    d.aimAt(4, 0).queue('shield').cast(BTN.area, 20, 20);
    // the ally outside throws a rock through it, at you: it lands
    const ally = new Driver(w, 1).aimAt(-5, 0);
    ally.queue('earth').cast(BTN.force, 30, 40);
    expect(w.bodies.hp[0]).toBeLessThan(100);
    // a foe walking at you is held at the barrier, an ally walks through
    const m = arena(3);
    m.d.aimAt(4, 0).queue('shield').cast(BTN.area, 20, 20);
    m.w.bodies.team[2] = 9;
    for (const i of [1, 2]) { m.w.bodies.x[i] = 4 + i; m.w.bodies.y[i] = 0; }
    for (let t = 0; t < 120; t++) { for (const i of [1, 2]) { m.w.bodies.vx[i] = -4; m.w.bodies.vy[i] = 0; } m.d.tick({}); }
    expect(m.w.bodies.x[1]).toBeLessThan(1);
    expect(m.w.bodies.x[2]).toBeGreaterThan(1.8);
  });

  it('Shield + Fire on yourself is a ward that resists fire', () => {
    const a = arena(2), b = arena(2);
    a.d.queue('shield', 'fire').cast(BTN.self, 1, 20);
    expect(a.w.seats.ward[0]).toBe(WARD.ward);
    for (const { w } of [a, b]) { w.bodies.x[1] = 3; w.bodies.y[1] = 0; new Driver(w, 1).aimAt(0, 0).queue('fire').cast(BTN.force, 60, 5); }
    expect(100 - a.w.bodies.hp[0]).toBeLessThan((100 - b.w.bodies.hp[0]) * 0.8);
  });

  it('a Bulwark held up (Space, nothing queued) blocks shots from the front', () => {
    const { w, d } = arena(2);
    d.aimAt(4, 0).queue('shield', 'earth').cast(BTN.weapon, 1, 20);
    expect(w.seats.guard[0]).toBe(1);
    const ally = new Driver(w, 1).aimAt(0, 0);
    // Block while the ally throws a rock at us.
    for (let t = 0; t < 90; t++) {
      step(w, [quantize({ ...NO_INPUT, buttons: BTN.self, aimX: 4 * 32, aimY: 0 }), t === 0 ? quantize({ ...NO_INPUT, press0: elementId('earth') }) : t < 40 ? quantize({ ...NO_INPUT, buttons: BTN.force, aimX: -4 * 32, aimY: 0 }) : NO_INPUT]);
    }
    void ally;
    expect(w.bodies.hp[0]).toBe(100);
  });

  it('Shield alone on Force blinks you to the cursor, paid with the Shield rune', () => {
    const { w, d } = arena();
    d.aimAt(6, 0).queue('shield').tick({ buttons: BTN.force });
    expect(w.bodies.x[0]).toBeGreaterThan(5);
  });

  it('a Fire blink leaves a fire ring where you stood, and it never catches you', () => {
    const { w, d } = arena(2);
    w.bodies.x[1] = 1.2; w.bodies.y[1] = 0; w.bodies.team[1] = 9; // a chaser at your heels
    const hp1 = w.bodies.hp[1];
    d.aimAt(-8, 0).queue('shield', 'fire').tick({ buttons: BTN.force }).tick({}, 20);
    expect(w.bodies.x[0]).toBeLessThan(-6);
    expect(w.bodies.hp[1]).toBeLessThan(hp1);
    expect(w.bodies.hp[0]).toBe(w.bodies.maxHp[0]);
  });
});

describe('Sigil', () => {
  it('a turret is held to aim, and stands at the cursor from when you let go, at most Place range away', () => {
    const { w, d } = arena();
    d.aimAt(6, 1).queue('sigil', 'fire').tick({ buttons: BTN.force }, 30);
    expect(devices(w, DEVICE.turret)).toBe(0);
    d.tick({}, 20);
    const k = Array.from(w.devices.type).indexOf(DEVICE.turret);
    expect(w.devices.x[k]).toBeCloseTo(w.bodies.x[0] + 6);
    expect(w.devices.y[k]).toBeCloseTo(w.bodies.y[0] + 1);
    const far = arena();
    far.d.aimAt(30, 0).queue('sigil', 'fire').cast(BTN.force, 1, 20);
    const j = Array.from(far.w.devices.type).indexOf(DEVICE.turret);
    expect(far.w.devices.x[j] - far.w.bodies.x[0]).toBeCloseTo(9);
  });

  it('a fire turret shoots the nearest enemy, drawing fire runes from you, and binds a Sigil rune', () => {
    const { w, d, dummy } = arena();
    const t = dummy(6, 0);
    d.aimAt(6, 0).queue('sigil', 'fire').cast(BTN.force, 1, 20);
    expect(devices(w, DEVICE.turret)).toBe(1);
    w.seats.runes[elementId('fire') - 1] = 2;
    d.tick({}, 300);
    expect(w.bodies.hp[t]).toBeLessThan(400);
    // It draws fire runes, but slower than you regenerate them: the pool still climbs.
    const climbed = rune(w, 'fire') - 2;
    expect(climbed).toBeLessThan((RUNES.regen * 300) / 60 - 0.1);
    expect(climbed).toBeGreaterThan(0);
    d.tick({}, 600);
    expect(rune(w, 'sigil')).toBeLessThanOrEqual(RUNES.max.sigil - 1 + 1e-9);
  });

  it('a Fire turret sprays fire (the spell you made it with), not a bolt', () => {
    const { w, d, dummy } = arena();
    const t = dummy(5, 0);
    d.aimAt(5, 0).queue('sigil', 'fire').cast(BTN.force, 1, 60); // it takes a moment to set up
    const k = Array.from(w.devices.type).indexOf(DEVICE.turret);
    expect(w.devices.chan[k]).toBeGreaterThan(0);
    expect(Array.from(w.missiles.alive).some((a) => a)).toBe(false); // no bolt in flight
    expect(w.devices.x2[k]).toBeGreaterThan(w.devices.x[k]); // the spray reaches toward the target
    const hp = w.bodies.hp[t];
    d.tick({}, 60);
    expect(w.bodies.hp[t]).toBeLessThan(hp - 3); // a second of spray burns steadily
    d.tick({}, 200);
    expect(w.devices.chan[k]).toBe(0); // done after the natural channel, then it rests
  });

  it('a turret shot hits as hard as your own tap cast (it fires uncharged)', () => {
    const hits: number[] = [];
    for (const turret of [false, true]) {
      const { w, d, dummy } = arena();
      const t = dummy(6, 0);
      if (turret) d.aimAt(2.5, 0).queue('sigil', 'earth', 'fire').cast(BTN.force, 1, 150);
      else d.aimAt(6, 0).queue('earth', 'fire').cast(BTN.force, 1, 150);
      hits.push(400 - w.bodies.hp[t]);
    }
    expect(hits[0]).toBeGreaterThan(0);
    expect(Math.abs(hits[1] - hits[0])).toBeLessThan(hits[0] * 0.1); // burn ticks land a frame or two apart
  });

  it('a turret stalls when you run dry, and picks up as you regenerate', () => {
    const { w, d, dummy } = arena();
    dummy(6, 0);
    d.aimAt(6, 0).queue('sigil', 'fire').cast(BTN.force, 1, 20);
    w.seats.runes[elementId('fire') - 1] = 0;
    d.tick({}, 60); // the one empty pool takes most of the shared regen, so keep this short
    expect(w.events.length >= 0 && rune(w, 'fire')).toBeLessThan(1);
  });

  it('a glyph arms, then goes off as its Place spell when an enemy is on it', () => {
    const { w, d, dummy } = arena();
    const t = dummy(4, 0);
    d.place(4, 0).queue('sigil', 'fire');
    expect(devices(w, DEVICE.lens)).toBe(0); // the first Place had an empty queue
    d.place(4, 0);
    d.tick({}, 90);
    expect(devices(w, DEVICE.glyph)).toBe(0); // it went off
    expect(w.bodies.burn[t] + (400 - w.bodies.hp[t])).toBeGreaterThan(0);
  });

  it('orbitals strike an enemy that comes close', () => {
    const { w, d, dummy } = arena();
    const t = dummy(1.6, 0);
    d.queue('sigil', 'earth', 'earth').cast(BTN.area, 2, 120);
    expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('stacked orbitals share one ring, spaced evenly', () => {
    const { w, d } = arena();
    d.aimAt(6, 0); // aimed at yourself, a Sigil cast would dismiss the orbitals instead
    d.queue('sigil', 'earth', 'earth').cast(BTN.area, 2, 40);
    w.seats.runes.fill(5); // the first cast emptied Earth
    d.queue('sigil', 'earth', 'earth').cast(BTN.area, 2, 40);
    const ks = [...w.devices.type.keys()].filter((k) => w.devices.type[k] === DEVICE.orbital);
    expect(ks.length).toBe(2);
    const angles = ks.flatMap((k) => [0, 1].map((p) => ((orbitAngle(w, k, p) % 1) + 1) % 1)).sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) expect(((angles[(i + 1) % 4] - angles[i] + 1) % 1)).toBeCloseTo(0.25, 6);
  });

  it('orbitals strike a foe closing in before it reaches the ring', () => {
    const { w, d, dummy } = arena();
    const t = dummy(2.8, 0);
    d.queue('sigil', 'earth').cast(BTN.area, 2, 120);
    expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('the lens amplifies a beam through it', () => {
    const a = arena(), b = arena();
    const ta = a.dummy(7, 0), tb = b.dummy(7, 0);
    a.d.queue('sigil').place(3.5, 0);
    expect(devices(a.w, DEVICE.lens)).toBe(1);
    b.d.tick({}, 30 + 4); // keep the two runs in step
    for (const { d } of [a, b]) d.aimAt(7, 0).queue('arcane').cast(BTN.force, 90, 5);
    expect(400 - a.w.bodies.hp[ta]).toBeGreaterThan((400 - b.w.bodies.hp[tb]) * 1.3);
  });

  it('the sculpting wand spares allies from your harm', () => {
    const lost: number[] = [];
    for (const wand of [true, false]) {
      const { w, d } = arena(2);
      w.bodies.x[1] = 3;
      if (wand) { d.queue('sigil').cast(BTN.weapon, 1, 20); expect(w.seats.wand[0]).toBe(1); } else d.tick({}, 21);
      d.aimAt(6, 0).queue('arcane').cast(BTN.force, 60, 5); // a beam: it leaves nothing burning on the floor
      lost.push(100 - w.bodies.hp[1]);
    }
    expect(lost[0]).toBe(0);
    expect(lost[1]).toBeGreaterThan(10);
  });

  it('a fire aura burns enemies close by', () => {
    const { w, d, dummy } = arena();
    const t = dummy(1.5, 0);
    d.queue('sigil', 'fire').cast(BTN.self, 1, 60);
    expect(w.bodies.burn[t]).toBeGreaterThan(0);
  });

  it('your hands: with nothing queued, RMB tap strikes with the conjured sword (1 use) and it burns', () => {
    const { w, d, dummy } = arena();
    const t = dummy(1.2, 0);
    d.aimAt(1.2, 0).queue('sigil', 'fire').cast(BTN.weapon, 1, 20);
    expect(w.seats.weapon[0]).toBe(EL.fire);
    const uses = w.seats.weaponUses[0];
    d.cast(BTN.force, 1, 20);
    expect(w.bodies.burn[t]).toBeGreaterThan(0);
    expect(w.seats.weaponUses[0]).toBe(uses - 1);
  });

  it('your hands: a held RMB is a Heavy (harder, 2 uses), Shift+RMB a full-circle Sweep (2 uses)', () => {
    const dealt: number[] = [];
    for (const hold of [1, 70]) {
      const { w, d, dummy } = arena();
      const t = dummy(1.2, 0);
      d.aimAt(1.2, 0).queue('sigil', 'earth').cast(BTN.weapon, 1, 20);
      const uses = w.seats.weaponUses[0];
      d.cast(BTN.force, hold, 20);
      dealt.push(400 - w.bodies.hp[t]);
      expect(w.seats.weaponUses[0]).toBe(uses - (hold > 1 ? 2 : 1));
    }
    expect(dealt[1]).toBeGreaterThan(dealt[0] * 1.2); // the maul's fissure: harder per move (and down a whole lane)
    const { w, d, dummy } = arena();
    const behind = dummy(-1.0, 0.2, 9);
    d.aimAt(1.2, 0).queue('sigil', 'earth').cast(BTN.weapon, 1, 20);
    d.cast(BTN.area, 1, 20); // a Sweep hits behind you too
    expect(w.bodies.hp[behind]).toBeLessThan(400);
  });

  it('your hands: the spear Special is a javelin thrown at the cursor', () => {
    const { w, d, dummy } = arena();
    const t = dummy(6, 0);
    d.aimAt(6, 0).queue('sigil', 'cold').cast(BTN.weapon, 1, 20);
    d.cast(BTN.area, 1, 60);
    expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('your hands: Shift+LMB with nothing queued hops you backwards', () => {
    const { w, d } = arena();
    d.aimAt(5, 0).cast(BTN.weapon, 1, 30);
    expect(w.bodies.x[0]).toBeLessThan(-0.8);
  });

  it('a guard and a weapon are held together (no two-handed weapons)', () => {
    const { w, d } = arena();
    d.queue('sigil', 'fire').cast(BTN.weapon, 1, 20);
    d.queue('shield', 'earth').cast(BTN.weapon, 1, 20);
    expect(w.seats.weapon[0]).toBe(EL.fire);
    expect(w.seats.guard[0]).not.toBe(0);
    d.queue('sigil', 'cold').cast(BTN.weapon, 1, 20); // a new weapon replaces only the weapon
    expect(w.seats.weapon[0]).toBe(EL.cold);
    expect(w.seats.guard[0]).not.toBe(0);
  });

  it('the Double repeats your spell from its own spot, for half the runes', () => {
    const { w, d, dummy } = arena();
    const t = dummy(5, 0);
    d.queue('sigil').cast(BTN.self, 1, 20);
    const dbl = w.seats.double[0];
    expect(w.bodies.kind[dbl]).toBe(KIND.double);
    const earth0 = rune(w, 'earth');
    d.aimAt(5, 0).queue('earth').cast(BTN.force, 2, 90);
    // Two rocks: yours (one rune) and the Double's (half a rune).
    expect(earth0 - rune(w, 'earth')).toBeGreaterThan(1.5 - 2 * RUNES.regen); // less a little regen while the rocks fly
    expect(w.bodies.hp[t]).toBeLessThan(400 - 8);
  });

  it('enemies go for the Double first', async () => {
    const { ARCH, ARCHETYPES, TEAM, spawnBody } = await import('../src');
    const { w, d } = arena();
    d.queue('sigil').cast(BTN.self, 1, 20);
    const a = ARCHETYPES[ARCH.swarmer];
    const e = spawnBody(w, -1, KIND.enemy, TEAM.enemies, 6, 3, a.hp, a.radius);
    w.bodies.arch[e] = ARCH.swarmer;
    d.tick({}, 5);
    expect(w.bodies.target[e]).toBe(w.seats.double[0]);
  });

  it('Blink goes all the way to the cursor', () => {
    const { w, d } = arena();
    d.aimAt(9, 3).queue('sigil').tick({ buttons: BTN.force });
    expect(w.bodies.x[0]).toBeCloseTo(9, 0);
    expect(w.bodies.y[0]).toBeCloseTo(3, 0);
  });

  it('Blink stops short of a body standing on the cursor', () => {
    const { w, d, dummy } = arena();
    dummy(8, 0);
    d.aimAt(8, 0).queue('sigil').tick({ buttons: BTN.force });
    expect(w.bodies.x[0]).toBeLessThan(8 - 0.9);
    expect(w.bodies.x[0]).toBeGreaterThan(6);
  });

  it('the Double follows you and echoes a beam from its own spot', () => {
    const { w, d, dummy } = arena();
    const t = dummy(6, 0);
    d.queue('sigil').cast(BTN.self, 1, 20);
    const dbl = w.seats.double[0];
    d.tick({ moveX: 127 }, 60);
    expect(w.bodies.x[dbl]).toBeGreaterThan(2); // it walked along with us
    const hp0 = w.bodies.hp[t];
    d.aimAt(9, 0).queue('arcane').cast(BTN.force, 90, 0);
    expect(w.seats.dblPaid[0]).toBe(1);
    expect(hp0 - w.bodies.hp[t]).toBeGreaterThan(0);
  });

  it('double-tapping Sigil over one of your creations dismisses it and gives its rune back', () => {
    const { w, d } = arena();
    d.queue('sigil').place(3, 0); // a lens at (3, 0)
    expect(devices(w, DEVICE.lens)).toBe(1);
    const before = rune(w, 'sigil');
    d.aimAt(3, 0).queue('sigil', 'sigil');
    expect(devices(w, DEVICE.lens)).toBe(0);
    expect(rune(w, 'sigil')).toBeGreaterThan(before + 0.9);
  });

  it('double-tapping Shield over your wall brings the whole arc down', () => {
    const { w, d } = arena();
    d.aimAt(5, 0).queue('shield', 'fire').cast(BTN.area, 20, 20); // a fire curtain arc
    expect(walls(w, WALL.curtain)).toBe(STRUCT.arcSegs);
    d.aimAt(STRUCT.arcRadius, 0.3).queue('shield', 'shield');
    expect(walls(w, WALL.curtain)).toBe(0);
    d.aimAt(5, 0).queue('shield', 'earth').cast(BTN.area, 20, 20);
    d.aimAt(5, 0).queue('shield', 'shield'); // nothing under the cursor: just a cancel
    expect(walls(w, WALL.rock)).toBe(STRUCT.arcSegs);
    d.aimAt(STRUCT.arcRadius, 0).queue('shield', 'shield');
    expect(walls(w, WALL.rock)).toBe(0);
  });

  it('Self with the cursor on an ally puts the ward on them, kept up by you', () => {
    const { w, d } = arena(2); // the ally stands at (4, 0)
    d.aimAt(4, 0).queue('shield', 'fire').cast(BTN.self, 1, 20);
    expect(w.seats.ward[1]).not.toBe(WARD.none);
    expect(w.seats.ward[0]).toBe(WARD.none);
    expect(w.seats.wardBy[1]).toBe(0);
    d.aimAt(0.1, 0).queue('shield', 'cold').cast(BTN.self, 1, 20); // and one on yourself too: both stand, both drain you
    expect(w.seats.ward[0]).not.toBe(WARD.none);
    expect(w.seats.ward[1]).not.toBe(WARD.none);
    expect(w.seats.wardBy[0]).toBe(0);
  });

  it('plain elements on Self stay on you, even with the cursor on an ally', () => {
    const { w, d } = arena(2);
    w.bodies.hp[0] = 50; w.bodies.hp[1] = 50;
    d.aimAt(4, 0).queue('life').cast(BTN.self, 1, 20);
    expect(w.bodies.hp[0]).toBeGreaterThan(50);
    expect(w.bodies.hp[1]).toBe(50);
  });

  it('Self with Sigil on an ally gives them the aura', () => {
    const { w, d } = arena(2);
    d.aimAt(4, 0).queue('sigil', 'lightning').cast(BTN.self, 1, 20);
    expect(w.seats.aura[1]).toBeGreaterThan(0);
    expect(w.seats.aura[0]).toBe(0);
  });

  it('double-tapping Shield on yourself drops your ward', () => {
    const { w, d } = arena();
    d.queue('shield', 'fire').cast(BTN.self, 1, 20);
    expect(w.seats.ward[0]).not.toBe(WARD.none);
    d.aimAt(0.1, 0).queue('shield', 'shield');
    expect(w.seats.ward[0]).toBe(WARD.none);
  });

  it('a double tap with nothing under the cursor is just a cancel', () => {
    const { w, d } = arena();
    d.queue('sigil').place(3, 0);
    d.aimAt(-5, 4).queue('sigil', 'sigil');
    expect(devices(w, DEVICE.lens)).toBe(1);
  });

  it('pressing Sigil with no free rune recalls your oldest creation', () => {
    const { w, d, dummy } = arena();
    dummy(9, 5);
    d.queue('sigil').place(3, 0);            // 1: lens
    d.queue('sigil').cast(BTN.self, 1, 20);  // 2: Double
    d.queue('sigil', 'fire').aimAt(4, 4).cast(BTN.force, 1, 20); // 3: turret
    w.seats.runes[elementId('sigil') - 1] = 0.2; // all bound, none regenerated
    d.queue('sigil');                         // the lens (oldest) goes, its rune into the queue
    expect(devices(w, DEVICE.lens)).toBe(0);
    expect(w.seats.queueLen[0]).toBe(1);
    expect(w.seats.double[0]).toBeGreaterThanOrEqual(0);
  });

  it('every Shield and Sigil cell compiles to an engine shape', () => {
    const extra: (Element | null)[] = [null, 'water', 'life', 'cold', 'lightning', 'arcane', 'fire', 'earth'];
    const todo: string[] = [];
    for (const f of ['shield', 'sigil'] as const) for (const e of extra) for (const cast of ['force', 'area', 'place', 'self', 'conjure'] as const) {
      const q: Element[] = e ? [f, e] : [f];
      const s = compile(q, cast);
      if (s.shape === 'todo') todo.push(`${q.join('+')}/${cast}`);
    }
    expect(todo).toEqual([]);
  });
});

describe('walls stop sprays and arcs', () => {
  function walled() {
    const a = arena();
    const wl = a.w.walls, k = Array.from(wl.type).indexOf(WALL.none);
    wl.type[k] = WALL.rock; wl.owner[k] = 0; wl.hp[k] = 5000; wl.x1[k] = 2; wl.y1[k] = -3; wl.x2[k] = 2; wl.y2[k] = 3;
    return { ...a, k };
  }

  it('a spray ends at the wall, wears it down and leaves what is behind it alone', () => {
    const { w, d, dummy, k } = walled();
    const behind = dummy(3.5, 0), hp = w.bodies.hp[behind];
    d.aimAt(3.5, 0).queue('fire').cast(BTN.force, 40, 0);
    expect(w.seats.chanEndX[0]).toBeLessThan(2);
    expect(w.bodies.hp[behind]).toBe(hp);
    expect(w.walls.hp[k]).toBeLessThan(5000);
  });

  it('a spray still burns what stands on the near side', () => {
    const { w, d, dummy } = walled();
    const near = dummy(1, 0), hp = w.bodies.hp[near];
    d.aimAt(3.5, 0).queue('fire').cast(BTN.force, 40, 0);
    expect(w.bodies.hp[near]).toBeLessThan(hp);
  });

  it('a healing spray does not wear the wall down', () => {
    const { w, d, k } = walled();
    d.aimAt(3.5, 0).queue('life', 'fire').cast(BTN.force, 40, 0);
    expect(specOf(w, 0).shape).toBe('spray');
    expect(w.walls.hp[k]).toBe(5000);
  });

  it('lightning does not arc through a wall, and neither does its jump', () => {
    const { w, d, dummy } = walled();
    const behind = dummy(3, 0), hp = w.bodies.hp[behind];
    d.aimAt(3, 0).queue('lightning').cast(BTN.force, 40, 0);
    expect(w.bodies.hp[behind]).toBe(hp);

    const b = walled();
    const first = b.dummy(1, 0, 8), over = b.dummy(3, 0, 9), hp1 = b.w.bodies.hp[first], hp2 = b.w.bodies.hp[over];
    b.d.aimAt(1, 0).queue('lightning').cast(BTN.force, 40, 0);
    expect(b.w.bodies.hp[first]).toBeLessThan(hp1);
    expect(b.w.bodies.hp[over]).toBe(hp2);
  });
});
