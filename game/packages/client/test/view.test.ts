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
class Base { [k: string]: any; position = { set() {} }; scale = { set() {} }; anchor = { set() {} }; children: unknown[] = []; addChild(...c: unknown[]) { this.children.push(...c); } }
vi.mock('pixi.js', () => ({
  Container: Base, Sprite: Base, Graphics: class extends Base { constructor() { super(); return any(); } },
  Texture: Object.assign(class extends Base { source = { update() {}, scaleMode: '' }; destroy() {} }, { from: () => ({ source: { update() {}, scaleMode: '' }, destroy() {} }), EMPTY: {} }),
  Rectangle: Base, TextureSource: { defaultOptions: {} },
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
  'fire/force', 'water/force', 'cold/force', 'water,fire/force', 'water,cold/force', 'lightning/force', 'lightning,fire/force', 'earth/force', 'earth,fire/force', 'earth,cold/force', 'earth,water/force',
  'fire/area', 'cold/area', 'water/area', 'arcane/area', 'life/area', 'earth/area', 'lightning/area',
  'fire,fire/place', 'water,water/place', 'cold/place', 'water,cold/place', 'water,fire/place', 'arcane/place', 'earth/place', 'lightning/place', 'life/place',
  'sigil/force', 'life/weapon', 'fire/weapon', 'life/self', 'arcane/self',
];

describe('view', async () => {
  const { WorldView } = await import('../src/view');
  const { createWorld, step } = await import('@wizard-sim/sim');
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
});
