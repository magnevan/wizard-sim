/**
 * A remote spell that rollback inserts in the past is shown from its first frame (art/vfx.ts,
 * "late remote spells"): its missile is first drawn where it started, near the caster, and
 * catches up with where it really is within ~0.15 s of real time. Pixi and the canvas are
 * stubbed as in view.test.ts.
 */
import { describe, expect, test, vi } from 'vitest';

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
function ctx(): any {
  const c: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => undefined), set: (t: any, k, v) => { t[k] = v; return true; } });
  c.getImageData = (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) });
  c.createImageData = (ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) });
  return c;
}
(globalThis as any).document = { createElement: () => { const cv: any = { width: 1, height: 1 }; cv.getContext = () => ctx(); return cv; } };

describe('late remote spells', async () => {
  const { WorldView } = await import('../src/view');
  const { MAX_MISSILES, NO_INPUT, createWorld } = await import('@wizard-sim/sim');
  const { LoopbackHub, RollbackSession } = await import('@wizard-sim/net');
  const { demoInput, parseDemo } = await import('../src/demo');

  /** Seat 1 casts `spell` over a 12-tick link; page A (seat 0) draws. Returns where A first drew seat 1's missile, and where it really was. */
  function firstSight(spell: string, catchUp: boolean) {
    const hub = new LoopbackHub(2, { latency: 12 });
    const [a, b] = [0, 1].map((s) => new RollbackSession(createWorld(7, 2), hub.endpoint(s), [0, 1], 1, false));
    const view = new WorldView();
    view.resize(1280, 800, 3);
    view.setLocalSeat(0);
    view.catchUp = catchUp;
    a.hooks = {
      before: (w) => view.beforeStep(w), after: (w) => { if (a.replaying) view.replayStep(w); else view.afterStep(w); },
      preRewind: (w) => view.notePreRewind(w), postRewind: (w) => view.notePostRewind(w, 0),
    };
    const d = parseDemo(spell)!;
    const w = a.world, m = w.missiles;
    for (let f = 0; f < 400; f++) {
      const ct = f / 60;
      for (const [x, p] of [[a, 0], [b, 1]] as const) {
        x.poll();
        if (x.nextScheduled <= x.tick + x.delay) x.pushLocal(p === 1 ? demoInput(x.world, x.tick, 1, d) : NO_INPUT);
        x.flush();
        x.advance(1);
      }
      hub.tick();
      for (let j = 0; j < MAX_MISSILES; j++) {
        if (!m.alive[j] || m.owner[j] !== 1) continue;
        const first = view.missileDrawnAt(w, j, ct);
        const truth: [number, number] = [m.x[j], m.y[j]];
        const caster: [number, number] = [w.bodies.x[1], w.bodies.y[1]];
        view.draw(w, 0, ct * 1000);
        const later = view.missileDrawnAt(w, j, ct + 0.2);
        return { first, truth, caster, later, now: [m.x[j], m.y[j]] as [number, number], caught: view.caught.missiles };
      }
      view.draw(w, 0, ct * 1000);
    }
    throw new Error(`seat 1 never fired a missile with ${spell}`);
  }
  const dist = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  test('a late missile starts near its caster, then catches up', () => {
    const r = firstSight('earth,fire/force', true);
    console.log(`late fireball: really ${dist(r.truth, r.caster).toFixed(2)} units from its caster, first drawn ${dist(r.first, r.caster).toFixed(2)} from it`);
    // it arrived 12+ ticks late, so it really is well out of the caster's hand by now...
    expect(dist(r.truth, r.caster)).toBeGreaterThan(1.5);
    // ...but is first drawn where it left the staff
    expect(dist(r.first, r.caster)).toBeLessThan(1);
    expect(r.caught).toBeGreaterThan(0);
    // and 0.2 s later it is drawn where it is
    expect(dist(r.later, r.now)).toBeLessThan(1e-9);
  });

  test('with catch-up off it pops in mid-flight (the old way)', () => {
    const r = firstSight('earth,fire/force', false);
    expect(dist(r.first, r.truth)).toBeLessThan(1e-9);
    expect(dist(r.first, r.caster)).toBeGreaterThan(1.5);
  });
});
