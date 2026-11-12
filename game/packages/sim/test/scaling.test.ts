// What extra runes do, after the rune-scaling audit (docs/explorations/2026-11-07-rune-scaling.md).
import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import { BTN, KIND, NO_INPUT, RHYTHM, RUNES, SHAPES, compile, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../src';

/** Seat 0 at the origin aiming along +x; seat 1 (another wizard, idle) at (dx, 0); a dummy behind it when asked. */
function scene(dx: number, dummy = false) {
  const w = createWorld(1, 2, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0; b.x[1] = dx; b.y[1] = 0;
  if (dummy) { b.x[1] = -20; b.kind[4] = KIND.dummy; b.team[4] = 2; b.x[4] = dx; b.y[4] = 0; b.r[4] = 0.5; b.hp[4] = b.maxHp[4] = 1e5; }
  const go = (o: Partial<PlayerInput> = {}, n = 1) => { for (let k = 0; k < n; k++) step(w, [quantize({ ...NO_INPUT, aimX: dx * 32, ...o }), NO_INPUT]); };
  const queue = (els: Element[]) => { for (const e of els) go({ press0: elementId(e) }); };
  return { w, go, queue };
}

describe('rune scaling', () => {
  it("Water's own spray and splash push, harder with more Water; Rain and steam don't", () => {
    const pushed = (q: Element[], btn: number, hold: number) => {
      const { w, go, queue } = scene(2.2);
      queue(q); go({ buttons: btn }, hold); go({}, 30);
      return w.bodies.x[1] - 2.2;
    };
    expect(pushed(['water'], BTN.force, 60)).toBeGreaterThan(0.3);
    expect(pushed(['water', 'water'], BTN.force, 60)).toBeGreaterThan(pushed(['water'], BTN.force, 60));
    expect(pushed(['water'], BTN.area, 2)).toBeGreaterThan(0.3);
    expect(compile(['water'], 'place').mod).toBeNull();
    expect(compile(['water', 'fire'], 'force').mod).toBeNull();
  });

  it('an Arcane nova and an Arcane beam both hit +70 % harder a rune', () => {
    const dealt = (q: Element[], btn: number, hold: number) => {
      const { w, go, queue } = scene(1.6, true);
      queue(q); go({ buttons: btn }, hold); go({}, 40);
      return 1e5 - w.bodies.hp[4];
    };
    expect(dealt(['arcane', 'arcane'], BTN.area, 2) / dealt(['arcane'], BTN.area, 2)).toBeCloseTo(1.7, 1);
    // over the same 2 s (less the second rune's 0.04 s of wind-up): a channel's runes buy power, its upkeep pays for time
    expect(dealt(['arcane', 'arcane'], BTN.force, 120) / dealt(['arcane'], BTN.force, 120)).toBeCloseTo(1.7 * (1 - 0.04 / 2), 1);
  });

  it("a Life beam heals as fast as it has Life runes", () => {
    const healed = (q: Element[]) => {
      const { w, go, queue } = scene(3);
      w.bodies.hp[1] = 1; w.bodies.maxHp[1] = 1e5;
      queue(q); go({ buttons: BTN.force }, 120);
      return w.bodies.hp[1] - 1;
    };
    expect(healed(['life'])).toBeGreaterThan(10);
    // 3x, less the two extra runes' 0.08 s of wind-up out of the 2 s
    expect(healed(['life', 'life', 'life']) / healed(['life'])).toBeCloseTo(3 * (1 - 0.08 / 2), 1);
  });

  it('past its free time a channel costs upkeep for every rune in it, each from its own element', () => {
    // with regen off, so the drain over one second is the upkeep alone
    const drain = (q: Element[], el: Element) => {
      const { w, go, queue } = scene(3);
      const k = elementId(el) - 1; // seat 0's pool of el
      queue(q); go({ buttons: BTN.force }, 175);
      const before = w.seats.runes[k], regen = RUNES.regen;
      RUNES.regen = 0;
      try { go({ buttons: BTN.force }, 60); } finally { RUNES.regen = regen; }
      return before - w.seats.runes[k];
    };
    expect(drain(['arcane'], 'arcane')).toBeCloseTo(RHYTHM.upkeep, 1);
    expect(drain(['arcane', 'arcane'], 'arcane')).toBeCloseTo(2 * RHYTHM.upkeep, 1);
    // a Fire rune in the beam is paid from Fire
    expect(drain(['arcane', 'fire'], 'fire')).toBeCloseTo(RHYTHM.upkeep, 1);
    // an Ice rune (Water + Cold in one slot) has no pool of its own: it is paid from Water and from Cold, and the beam goes on
    expect(compile(['arcane', 'ice'], 'force').channel).toBe(true);
    expect(drain(['arcane', 'water', 'cold'], 'water')).toBeCloseTo(RHYTHM.upkeep, 1);
    expect(drain(['arcane', 'water', 'cold'], 'cold')).toBeCloseTo(RHYTHM.upkeep, 1);
  });

  it('every ice shard flies at the same power', () => {
    const { w, go, queue } = scene(6);
    queue(['water', 'cold']);
    go({ buttons: BTN.force }, 1);
    let shards: number[] = [];
    for (let t = 0; t < 30 && !shards.length; t++) {
      go();
      shards = [...w.missiles.alive.keys()].filter((j) => w.missiles.alive[j] && w.missiles.type[j] === 2).map((j) => w.missiles.scale[j]);
    }
    expect(shards.length).toBe(SHAPES.shardCount + 1); // 5, plus one a rune of the lead
    expect(new Set(shards).size).toBe(1);
    expect(shards[0]).toBeCloseTo(SHAPES.shardPower, 5);
  });

  it('Earth + Water + Cold flies as three fast ice shards, each a third of the rock', () => {
    const { w, go, queue } = scene(8);
    queue(['earth', 'water', 'cold']);
    let ice: number[] = [];
    for (let t = 0; t < 200 && !ice.length; t++) {
      go({ buttons: t < 100 ? BTN.force : 0 });
      ice = [...w.missiles.alive.keys()].filter((j) => w.missiles.alive[j] && w.missiles.type[j] === 1);
    }
    expect(ice.length).toBe(3);
    for (const j of ice) expect(Math.hypot(w.missiles.vx[j], w.missiles.vy[j])).toBeGreaterThan(SHAPES.missileSpeed);
    // launched one after another, and together worth 1.7 rocks
    expect(ice.map((j) => w.missiles.wait[j]).sort((a, c) => a - c)).toEqual([0, SHAPES.iceShardGap, 2 * SHAPES.iceShardGap].map((v) => Math.max(0, v - 1)));
    expect(new Set(ice.map((j) => w.missiles.scale[j])).size).toBe(1);
    expect(3 * SHAPES.iceShardShare).toBeCloseTo(1.7, 1);
  });

  it('an Earth + Cold rock ends in a frost puff that chills what stands near, and throws no shards', () => {
    const { w, go, queue } = scene(3);
    const b = w.bodies;
    // a dummy on the rock's line takes it; the other wizard stands beside the dummy, off the line: only the puff reaches them
    b.kind[4] = KIND.dummy; b.team[4] = 2; b.x[4] = 3; b.y[4] = 0; b.r[4] = 0.5; b.hp[4] = b.maxHp[4] = 1e5;
    b.x[1] = 3.4; b.y[1] = 1.1;
    queue(['earth', 'cold']);
    let shards = 0, chill = 0;
    for (let t = 0; t < 200; t++) {
      go({ buttons: t < 30 ? BTN.force : 0 }); // a quick throw: a full charge would pierce and fly on past
      shards += [...w.missiles.alive.keys()].filter((j) => w.missiles.alive[j] && w.missiles.type[j] === 2).length;
      chill = Math.max(chill, b.chill[1]);
    }
    expect(shards).toBe(0);
    expect(chill).toBeGreaterThan(0);
  });
});
