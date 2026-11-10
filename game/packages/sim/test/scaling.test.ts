// What extra runes do, after the rune-scaling audit (docs/explorations/2026-11-07-rune-scaling.md).
import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import { BTN, KIND, NO_INPUT, SHAPES, compile, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../src';

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

  it('an Arcane nova hits harder with more Arcane; an Arcane beam hits √n harder and lasts √n longer', () => {
    const dealt = (q: Element[], btn: number, hold: number) => {
      const { w, go, queue } = scene(1.6, true);
      queue(q); go({ buttons: btn }, hold); go({}, 40);
      return 1e5 - w.bodies.hp[4];
    };
    expect(dealt(['arcane', 'arcane'], BTN.area, 2) / dealt(['arcane'], BTN.area, 2)).toBeCloseTo(1.7, 1);
    // over the same 2 s, two Arcane runes deal √2 times one's (less the second rune's 0.04 s of wind-up)
    expect(dealt(['arcane', 'arcane'], BTN.force, 120) / dealt(['arcane'], BTN.force, 120)).toBeCloseTo(Math.SQRT2, 1);
  });

  it("a Life beam heals √n as fast with n Life: its Life buys power and time", () => {
    const healed = (q: Element[]) => {
      const { w, go, queue } = scene(3);
      w.bodies.hp[1] = 1; w.bodies.maxHp[1] = 1e5;
      queue(q); go({ buttons: BTN.force }, 120);
      return w.bodies.hp[1] - 1;
    };
    expect(healed(['life'])).toBeGreaterThan(10);
    // √3, less the two extra runes' 0.08 s of wind-up out of the 2 s
    expect(healed(['life', 'life', 'life']) / healed(['life'])).toBeCloseTo(Math.sqrt(3) * (1 - 0.08 / 2), 1);
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
});
