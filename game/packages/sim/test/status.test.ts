import { describe, expect, it } from 'vitest';
import { AI, ARCH, ARCHETYPES, BTN, KIND, NO_INPUT, TEAM, createWorld, elementId, quantize, spawnBody, step, type World } from '../src';

const idle = (w: World, n: number) => { for (let k = 0; k < n; k++) step(w, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]); };
const press = (w: World, over: object) => step(w, [quantize({ ...NO_INPUT, aimX: 32, aimY: 0, ...over }), NO_INPUT, NO_INPUT, NO_INPUT]);

function windingGoblin(chill: number): { w: World; e: number } {
  const w = createWorld(1, 1, { dummies: false }), a = ARCHETYPES[ARCH.swarmer], b = w.bodies;
  b.x[0] = 0; b.y[0] = 0;
  const e = spawnBody(w, -1, KIND.enemy, TEAM.enemies, 0.9, 0, a.hp, a.radius);
  b.arch[e] = ARCH.swarmer; b.ai[e] = AI.windup; b.target[e] = 0; b.chill[e] = chill;
  return { w, e };
}

describe('statuses', () => {
  it('chill slows an attack, not only walking', () => {
    const plain = windingGoblin(0), cold = windingGoblin(3);
    idle(plain.w, 30); idle(cold.w, 30);
    expect(plain.w.bodies.aiT[plain.e]).toBe(30);
    expect(cold.w.bodies.aiT[cold.e]).toBeLessThan(20);
  });

  it('a regen aura heals its wearer and nobody around them', () => {
    const w = createWorld(1, 2, { dummies: false }), b = w.bodies;
    b.x[0] = 0; b.y[0] = 0; b.x[1] = 0; b.y[1] = 1.5; // off the aim: a Sigil Self aimed at an ally is theirs
    const a = ARCHETYPES[ARCH.swarmer], e = spawnBody(w, -1, KIND.enemy, TEAM.enemies, -1, 0, a.hp, a.radius);
    b.arch[e] = ARCH.swarmer;
    for (const el of ['sigil', 'life'] as const) press(w, { press0: elementId(el) });
    press(w, { buttons: BTN.self });
    idle(w, 40);
    b.hp[0] = 50; b.hp[1] = 50; b.hp[e] = 5;
    idle(w, 60);
    expect(b.hp[0]).toBeGreaterThan(50);
    expect(b.hp[1]).toBe(50);
    expect(b.hp[e]).toBeLessThanOrEqual(5);
  });

  it('a regen aura announces its heals, so the numbers show', () => {
    const w = createWorld(1, 1, { dummies: false }), b = w.bodies;
    for (const el of ['sigil', 'life'] as const) press(w, { press0: elementId(el) });
    press(w, { buttons: BTN.self });
    idle(w, 40);
    b.hp[0] = 50;
    let healed = 0;
    for (let k = 0; k < 90; k++) { idle(w, 1); for (const e of w.events) if (e.kind === 'heal' && e.who === 0) healed += e.amount ?? 0; }
    expect(healed).toBeGreaterThan(0);
    expect(b.hp[0]).toBeCloseTo(50 + healed, 5);
  });
});
