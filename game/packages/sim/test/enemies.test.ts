import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  STRUCT,
  AI, ARCH, ARCHETYPES, BTN, KIND, NO_INPUT, PHASE_ENC, TEAM, WALL, createWorld, elementId, hashWorld, quantize, spawnBody, step,
  type PlayerInput, type World,
} from '../src';

class Driver {
  aim = { x: 1, y: 0 };
  constructor(readonly w: World) {}
  tick(over: Partial<PlayerInput> = {}, n = 1): this {
    const b = this.w.bodies;
    for (let k = 0; k < n; k++) step(this.w, [quantize({ ...NO_INPUT, aimX: (this.aim.x - b.x[0]) * 32, aimY: (this.aim.y - b.y[0]) * 32, ...over })]);
    return this;
  }
  aimAt(x: number, y: number): this { this.aim = { x, y }; return this; }
  queue(...els: Element[]): this { for (const e of els) this.tick({ press0: elementId(e) }); return this; }
  cast(btn: number, hold = 1, after = 40): this { this.tick({ buttons: btn }, hold); return this.tick({}, after); }
}

/** A quiet arena (no wave director) with one wizard at the origin and the given enemy. */
function pit(arch: number, x: number, y = 0) {
  const w = createWorld(1, 1, { dummies: false });
  w.bodies.x[0] = 0; w.bodies.y[0] = 0;
  const a = ARCHETYPES[arch];
  const e = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, a.hp, a.radius);
  w.bodies.arch[e] = arch;
  return { w, d: new Driver(w), e };
}

describe('enemies', () => {
  it('a goblin walks up and bites, after a visible wind-up', () => {
    const { w, d, e } = pit(ARCH.swarmer, 5);
    let sawWindup = false;
    for (let t = 0; t < 240; t++) { d.tick(); if (w.bodies.ai[e] === AI.windup) sawWindup = true; }
    expect(sawWindup).toBe(true);
    expect(w.bodies.hp[0]).toBeLessThan(100);
  });

  it('a flamethrower kills goblins', () => {
    const { w, d, e } = pit(ARCH.swarmer, 3);
    d.aimAt(3, 0).queue('fire', 'fire').cast(BTN.force, 200, 60);
    expect(w.bodies.kind[e]).toBe(KIND.none);
  });

  it("the shieldbearer's guard blocks a beam from the front, not a nova", () => {
    const a = pit(ARCH.shieldbearer, 4);
    a.w.bodies.face[a.e] = 0.5; // facing the wizard
    a.d.aimAt(4, 0).queue('arcane').cast(BTN.force, 30, 0);
    expect(a.w.bodies.hp[a.e]).toBe(ARCHETYPES[ARCH.shieldbearer].hp);
    const b = pit(ARCH.shieldbearer, 2);
    b.w.bodies.face[b.e] = 0.5;
    b.d.queue('arcane').cast(BTN.area, 2, 20);
    expect(b.w.bodies.hp[b.e]).toBeLessThan(ARCHETYPES[ARCH.shieldbearer].hp);
  });

  it('fire does nothing to an imp, and getting wet hurts it', () => {
    const a = pit(ARCH.imp, 3);
    a.d.aimAt(3, 0).queue('fire').cast(BTN.force, 30, 0);
    expect(a.w.bodies.hp[a.e]).toBe(ARCHETYPES[ARCH.imp].hp);
    expect(a.w.bodies.burn[a.e]).toBe(0);
    const b = pit(ARCH.imp, 3);
    b.d.aimAt(3, 0).queue('water').cast(BTN.force, 20, 0);
    expect(b.w.bodies.hp[b.e]).toBeLessThanOrEqual(ARCHETYPES[ARCH.imp].hp - 14);
  });

  it('the brute locks a slam on your spot; walking out of the circle dodges it', () => {
    const { w, d, e } = pit(ARCH.brute, 3);
    for (let t = 0; t < 120 && w.bodies.ai[e] !== AI.windup; t++) d.tick();
    expect(w.bodies.ai[e]).toBe(AI.windup);
    d.tick({ moveX: -127 }, 70); // run while it winds up (1.1 s)
    expect(w.bodies.hp[0]).toBe(100);
  });

  it('a grabber holds you; enough damage breaks the hold', () => {
    const { w, d, e } = pit(ARCH.grabber, 4);
    for (let t = 0; t < 200 && w.bodies.heldBy[0] < 0; t++) d.tick();
    expect(w.bodies.heldBy[0]).toBe(e);
    d.aimAt(w.bodies.x[e], w.bodies.y[e]).queue('earth', 'earth').cast(BTN.force, 20, 10);
    expect(w.bodies.heldBy[0]).toBe(-1);
  });

  it('a grabber dragging you to the north or south edge throws you straight at it, not off to the side', () => {
    const { w, d, e } = pit(ARCH.grabber, 0, 5); // nearer the south edge (y = 8) than the east one
    const b = w.bodies, g = ARCHETYPES[ARCH.grabber].grab!;
    b.ai[e] = AI.grab; b.holding[e] = 0; b.heldBy[0] = e; b.grabHp[e] = b.hp[e];
    b.aiT[e] = Math.round(g.hold * 60) - 1; // the throw lands this tick
    d.tick();
    expect(b.heldBy[0]).toBe(-1);
    expect(b.ky[0]).toBeGreaterThan(0);
    expect(b.kx[0]).toBe(0);
  });

  it('enemies walk around a rock wall to reach you', () => {
    const { w, d, e } = pit(ARCH.swarmer, 6);
    d.aimAt(6, 0).queue('shield', 'earth').cast(BTN.area, 20, 20); // a stone arc between us
    expect(Array.from(w.walls.type).filter((t) => t === WALL.rock).length).toBeGreaterThan(0);
    for (let t = 0; t < 600 && w.bodies.hp[0] === 100; t++) d.tick();
    expect(w.bodies.hp[0]).toBeLessThan(100);
    expect(w.bodies.kind[e]).toBe(KIND.enemy);
  });

  it('walled in completely, you are not safe: enemies break through the rock', () => {
    const { w, d, e } = pit(ARCH.swarmer, 6);
    d.aimAt(6, 0).queue('shield', 'earth').cast(BTN.area, 1, 20); // a closed stone ring around you
    const ring = () => Array.from(w.walls.type).filter((t) => t === WALL.rock).length;
    expect(ring()).toBe(STRUCT.ringSegs);
    const x0 = w.bodies.x[e], hp0 = Array.from(w.walls.hp).reduce((a, b) => a + b, 0);
    d.tick({}, 60 * 10);
    expect(w.bodies.x[e]).toBeLessThan(x0 - 1); // it came to the wall instead of standing still
    expect(Array.from(w.walls.hp).reduce((a, b) => a + b, 0)).toBeLessThan(hp0 - 20); // and is breaking it
  });
});

describe('the wave director', () => {
  it('opens portals in the lull, sends the wave, and moves on when it is cleared', () => {
    const w = createWorld(1, 1, { room: 'arena' });
    const d = new Driver(w);
    expect(w.enc.state[0]).toBe(PHASE_ENC.lull);
    d.tick({}, 2);
    expect(w.enc.total[0]).toBe(6); // wave 1: six goblins
    d.tick({}, 8 * 60);
    expect(w.enc.state[0]).toBe(PHASE_ENC.wave);
    d.tick({}, 60 * 4);
    const enemies = Array.from(w.bodies.kind).filter((k) => k === KIND.enemy).length;
    expect(enemies).toBeGreaterThan(0);
    // Clear them by hand.
    for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) w.bodies.hp[i] = 0;
    d.tick({}, 3);
    expect(w.enc.state[0]).toBe(PHASE_ENC.breather);
    expect(w.enc.state[1]).toBe(2);
  });

  it('a downed wizard is out until the wave ends, then gets back up', () => {
    const w = createWorld(1, 2, { room: 'arena' });
    const d = new Driver(w);
    d.tick({}, 8 * 60 + 5);
    w.bodies.hp[1] = -5;
    d.tick({}, 2);
    expect(w.bodies.downed[1]).toBe(1);
    for (let i = 4; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) w.bodies.hp[i] = 0;
    w.enc.left.fill(0);
    d.tick({}, 5);
    expect(w.bodies.downed[1]).toBe(0);
    expect(w.bodies.hp[1]).toBeGreaterThan(0);
  });

  it('an arena run is deterministic', () => {
    const run = () => { const w = createWorld(9, 2, { room: 'arena' }); const d = new Driver(w).aimAt(5, 3); d.queue('fire'); d.tick({ buttons: BTN.force }, 60 * 20); return hashWorld(w); };
    expect(run()).toBe(run());
  });
});
