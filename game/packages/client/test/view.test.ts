/**
 * The view draws every spell shape without throwing or running away. Pixi and the canvas are
 * stubbed (node has neither), so this checks the drawing code's control flow, not its pixels:
 * the screenshots do that. A frame that takes far too long fails the test (a runaway loop in
 * effect code would otherwise only show up as a hung headless Chrome).
 */
import { describe, expect, test, vi } from 'vitest';

// A chainable no-op that stands in for any Pixi object or canvas context.
const any = (): any => new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any()),
  apply: () => any(),
  construct: () => any(),
  set: () => true,
});
class Base { [k: string]: any; position = { set() {} }; scale = { set() {} }; anchor = { set() {} }; pivot = { set() {} }; skew = { x: 0 }; children: unknown[] = []; addChild(...c: unknown[]) { this.children.push(...c); } }
vi.mock('pixi.js', () => ({
  Container: Base, Sprite: Base, Graphics: class extends Base { constructor() { super(); return any(); } },
  Texture: Object.assign(class extends Base { source = { update() {}, scaleMode: '' }; destroy() {} }, { from: () => ({ source: { update() {}, scaleMode: '' }, destroy() {} }), EMPTY: {} }),
  Rectangle: Base, TextureSource: { defaultOptions: {} },
  ColorMatrixFilter: class { reset() {} saturate() {} }, TilingSprite: class { constructor() { return any(); } }, RenderTexture: { create: () => any() }, Mesh: class { constructor() { return any(); } }, MeshGeometry: class { constructor() { return any(); } },
}));
function ctx(w: number, h: number): any {
  const c: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => undefined), set: (t: any, k, v) => { t[k] = v; return true; } });
  c.getImageData = (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) });
  c.createImageData = (ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) });
  void w; void h;
  return c;
}
(globalThis as any).document = { createElement: () => { const cv: any = { width: 1, height: 1 }; cv.getContext = () => ctx(cv.width, cv.height); return cv; } };

const SPELLS = [
  'arcane,fire/force', 'arcane,cold/force', 'arcane/force', 'life/force', 'life,fire/force', 'life,water/force', 'life,cold/force', 'life,lightning/force', 'life,earth/force',
  'fire/force', 'water/force', 'cold/force', 'water,fire/force', 'ice/force', 'ice,lightning/force', 'earth,ice/force', 'arcane,ice/force', 'lightning/force', 'lightning,fire/force', 'earth/force', 'earth,fire/force', 'earth,cold/force', 'earth,water/force',
  'fire/area', 'cold/area', 'water/area', 'arcane/area', 'life/area', 'earth/area', 'lightning/area',
  'fire,fire/place', 'water,water/place', 'cold/place', 'ice/place', 'shield,ice/place', 'ice/area', 'shield,ice/force', 'water,fire/place', 'arcane/place', 'earth/place', 'lightning/place', 'life/place',
  'sigil/force', 'life/weapon', 'fire/weapon', 'life/self', 'arcane/self',
];

describe('view', async () => {
  const { WorldView } = await import('../src/view');
  const { createWorld, step, NO_INPUT } = await import('@wizard-sim/sim');
  const { demoInput, parseDemo } = await import('../src/demo');
  test.each(SPELLS)('%s draws', (spell) => {
    const view = new WorldView();
    view.resize(1280, 800, 3);
    const w = createWorld(7, 2), d = parseDemo(spell)!;
    expect(d).not.toBeNull();
    let worst = 0;
    for (let t = 0; t < 240; t++) {
      view.beforeStep(w);
      step(w, [demoInput(w, t, 0, d), demoInput(w, t, 1, d)]);
      view.afterStep(w);
      const t0 = performance.now();
      view.draw(w, 0.5);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(400);
  }, 60000);

  // every death (element x delivery x status) on every archetype plays to its end; past 32 at once the oldest give way
  test('deaths draw', async () => {
    const { ARCH, devSpawnEnemy } = await import('@wizard-sim/sim');
    const kills = [[3, 6, 0, 0], [1, 3, 0, 2], [8, 3, 0, 4], [4, 3, 0, 16], [4, 3, 0, 0], [5, 4, 0, 2], [9, 1, 0, 0], [9, 2, 0, 0], [9, 6, 0, 0], [1, 3, 1, 2], [1, 3, 2, 0], [9, 1, 0, 1], [6, 3, 0, 0], [2, 0, 0, 0]];
    for (const batch of [[ARCH.swarmer, ARCH.brute], [ARCH.caster, ARCH.imp], [ARCH.grabber, ARCH.shieldbearer]]) {
      const view = new WorldView();
      view.resize(1280, 800, 3);
      const w = createWorld(7, 1), b = w.bodies;
      let now = 0, k = 0;
      for (const arch of batch) for (const [el, kind, mix, status] of kills) {
        const i = devSpawnEnemy(w, arch, -8 + (k % 8) * 2, -4 + Math.floor(k / 8) * 1.5); k++;
        if (status & 1) b.frozen[i] = 100;
        b.hp[i] = -5; b.lastEl[i] = el; b.lastKind[i] = kind; b.lastMix[i] = mix; b.lastDX[i] = 1;
      }
      view.beforeStep(w); step(w, [0, 1, 2, 3].map(() => ({ ...NO_INPUT }))); view.afterStep(w);
      for (let f = 0; f < 220; f++) { now += 16; view.draw(w, 0, now); if (f === 10) expect(view.debug()).toContain(`deaths ${Math.min(k, 32)}`); }
      expect(view.debug()).toContain('deaths 0');
    }
  }, 60000);

  // the big survive arena: the view repaints its floor and effect canvases for it, follows the bots, and back to the Sanctum
  test('survive draws, following the wizards', async () => {
    const { botInput, newBotMemory, replaceWorld } = await import('@wizard-sim/sim');
    const view = new WorldView();
    view.resize(1920, 1080);
    const w = createWorld(7, 2, { room: 'survive' }), mem = [newBotMemory(), newBotMemory()];
    let now = 0;
    for (let t = 0; t < 60 * 14; t++) {
      view.beforeStep(w); step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1]), NO_INPUT, NO_INPUT]); view.afterStep(w);
      if (t % 4 === 0) { now += 66; view.draw(w, 0.5, now); }
    }
    expect(view.debug()).toContain('follow');
    expect(view.camera.following).toBe(true);
    // the Sanctum: one player is followed too; two seats sharing the screen get the still framing
    replaceWorld(w, createWorld(7, 1));
    view.draw(w, 0, now + 16);
    expect(view.camera.following).toBe(true);
    replaceWorld(w, createWorld(7, 2));
    view.draw(w, 0, now + 32);
    expect(view.camera.following).toBe(false);
  }, 60000);

  // water, ice and fire floors fade out over their last second instead of popping out
  test('floors fade over their last second', async () => {
    const { floorFade, FLOOR_FADE } = await import('../src/art/vfx');
    const { SURF } = await import('@wizard-sim/sim');
    expect(FLOOR_FADE).toBe(60);
    expect(floorFade(FLOOR_FADE * 10)).toBe(1);
    expect(floorFade(FLOOR_FADE)).toBe(1);
    expect(floorFade(FLOOR_FADE - 1)).toBeLessThan(1);
    expect(floorFade(FLOOR_FADE / 2)).toBeCloseTo(0.5);
    expect(floorFade(1)).toBeGreaterThan(0); // still drawn on its last tick
    for (let l = 1; l < FLOOR_FADE; l++) expect(floorFade(l)).toBeLessThanOrEqual(floorFade(l + 1)); // only ever thins
    // and a world whose floors run out draws every step of the way
    const view = new WorldView();
    view.resize(1280, 800, 3);
    const w = createWorld(7, 1);
    const gw = w.dims.gw, row = Math.floor(w.dims.gh / 2) * gw; // water, ice and fire patches side by side mid-floor
    for (let c = 4; c < 40; c++) for (const dy of [0, 1, 2]) { const k = row + dy * gw + c; w.surf.kind[k] = c < 16 ? SURF.water : c < 28 ? SURF.ice : SURF.fire; w.surf.life[k] = FLOOR_FADE + 5; }
    for (let t = 0; t < FLOOR_FADE + 10; t++) { view.beforeStep(w); step(w, [0, 1, 2, 3].map(() => ({ ...NO_INPUT }))); view.afterStep(w); view.draw(w, 0.5); }
    expect(Array.from(w.surf.kind).some((k) => k !== SURF.none)).toBe(false);
  }, 60000);

  // An in-place room switch (the Esc menu, the number keys, a new online match) starts the world's clock
  // at 0 again: the old room's scorch marks and effects must not linger on the new floor.
  test('a world switched in place leaves nothing of the old room behind', async () => {
    const { replaceWorld } = await import('@wizard-sim/sim');
    const view = new WorldView();
    view.resize(1280, 800, 3);
    const { SURF } = await import('@wizard-sim/sim');
    const w = createWorld(7, 1), d = parseDemo('fire,fire/force')!;
    const scorch = () => (view as any).structs.scorch.marks.length as number;
    const row = Math.floor(w.dims.gh / 2) * w.dims.gw;
    for (let c = 4; c < 30; c++) { w.surf.kind[row + c] = SURF.fire; w.surf.life[row + c] = 20; }
    let now = 0;
    for (let t = 0; t < 600; t++) {
      view.beforeStep(w); step(w, [demoInput(w, t, 0, d), NO_INPUT, NO_INPUT, NO_INPUT]); view.afterStep(w);
      if (t % 10 === 0) view.draw(w, 0, (now += 160));
    }
    expect(scorch()).toBeGreaterThan(0); // the burnt-out floor left its marks
    replaceWorld(w, createWorld(7, 1, { room: 'arena' }));
    for (let t = 0; t < 30; t++) { view.beforeStep(w); step(w, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]); view.afterStep(w); view.draw(w, 0, (now += 16)); }
    expect(scorch()).toBe(0);
    // and every effect still running is younger than the new world (none from the old room's clock)
    const fx = (view as any).vfx.fx as { t0: number }[], simT = (view as any).simTime(w) as number;
    for (const f of fx) expect(simT - f.t0).toBeLessThan(1);
  }, 60000);

  test('the tutorial greets a beat again after you leave and come back', async () => {
    const { replaceWorld } = await import('@wizard-sim/sim');
    const view = new WorldView();
    view.resize(1280, 800, 3);
    const w = createWorld(7, 1, { room: 'tutorial' });
    const tick = (n: number, now: number) => { for (let k = 0; k < n; k++) { view.beforeStep(w); step(w, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]); view.afterStep(w); view.draw(w, 0, now + k * 16); } };
    tick(10, 1000);
    expect(view.tut.banner.visible).toBe(true);
    tick(10, 9000); // long after: the beat's title has gone
    expect(view.tut.banner.visible).toBe(false);
    replaceWorld(w, createWorld(7, 1));
    tick(10, 10000);
    replaceWorld(w, createWorld(7, 1, { room: 'tutorial' }));
    tick(10, 11000);
    expect(view.tut.banner.visible).toBe(true); // the same first beat, shown again
  }, 60000);

  test('online, each screen follows its own wizard: the partner gets an edge arrow, not the frame', async () => {
    const view = new WorldView();
    view.resize(1920, 1080);
    view.setLocalSeat(1);
    const w = createWorld(7, 2, { room: 'survive' });
    w.enc.state[0] = 0; // the director off
    w.bodies.x[0] = -20; w.bodies.y[0] = 0; w.bodies.x[1] = 18; w.bodies.y[1] = 4;
    view.beforeStep(w); // where they are drawn from
    for (let k = 1; k < 120; k++) view.draw(w, 0, k * 16);
    expect(view.camera.cx).toBeGreaterThan(9); // toward P2 (as far as the arena's edge allows), not the pair's middle
    const p = view.camera.worldToScreen(-20, 0);
    expect(p.x).toBeLessThan(0); // P1 is off screen
  }, 60000);
});
