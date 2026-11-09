import { describe, expect, it } from 'vitest';
import { createWorld, SURF } from '@wizard-sim/sim';
import { Camera } from '../src/camera';
import { toU, toV, toX, toY, turnedSize, turnedWorld } from '../src/iso-world';

describe('the turned world', () => {
  it('maps world axes the way an isometric game does', () => {
    expect(toU(1, 0)).toBeGreaterThan(0); expect(toV(1, 0)).toBeGreaterThan(0); // +x: lower right
    expect(toU(0, 1)).toBeLessThan(0); expect(toV(0, 1)).toBeGreaterThan(0); // +y: lower left
    expect(toX(toU(3, -2), toV(3, -2))).toBeCloseTo(3);
    expect(toY(toU(3, -2), toV(3, -2))).toBeCloseTo(-2);
  });

  it('turns positions and facings and leaves everything else alone', () => {
    const w = createWorld({ room: 'sanctum' });
    w.bodies.x[0] = 5; w.bodies.y[0] = -1; w.bodies.face[0] = 0.25; w.bodies.hp[0] = 42;
    const v = turnedWorld(w);
    expect(v.bodies.x[0]).toBeCloseTo(toU(5, -1));
    expect(v.bodies.y[0]).toBeCloseTo(toV(5, -1));
    expect(v.bodies.face[0]).toBeCloseTo(0.375);
    expect(v.bodies.hp[0]).toBe(42);
    expect(v.clock).toBe(w.clock);
  });

  it('never writes to the real world, and keeps up with it', () => {
    const w = createWorld({ room: 'sanctum' });
    w.bodies.x[1] = 2; w.bodies.y[1] = 2;
    const before = [...w.bodies.x], v = turnedWorld(w);
    expect([...w.bodies.x]).toEqual(before);
    w.bodies.x[1] = 4;
    expect(turnedWorld(w)).toBe(v);
    expect(v.bodies.x[1]).toBeCloseTo(toU(4, 2));
  });

  it('holds the whole room in a square, in whole units', () => {
    const w = createWorld({ room: 'sanctum' }), v = turnedWorld(w);
    expect(v.dims.w).toBe(turnedSize(w.dims.w, w.dims.h));
    expect(Number.isInteger(v.dims.w)).toBe(true);
    for (const [x, y] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) {
      expect(Math.abs(toU(x, y))).toBeLessThanOrEqual(v.dims.w / 2);
      expect(Math.abs(toV(x, y))).toBeLessThanOrEqual(v.dims.h / 2);
    }
  });

  it('resamples the floor so a burning cell shows under its own spot', () => {
    const w = createWorld({ room: 'sanctum' }), d = w.dims;
    const rx = 10, ry = 7;
    w.surf.kind[ry * d.gw + rx] = SURF.fire;
    const v = turnedWorld(w), vd = v.dims;
    const x = -d.w / 2 + (rx + 0.5) * 0.5, y = -d.h / 2 + (ry + 0.5) * 0.5;
    const cu = Math.floor((toU(x, y) + vd.w / 2) / 0.5), cv = Math.floor((toV(x, y) + vd.h / 2) / 0.5);
    expect(v.surf.kind[cv * vd.gw + cu]).toBe(SURF.fire);
  });

  it('gives each event one turned copy, so a claimed event stays claimed', () => {
    const w = createWorld({ room: 'sanctum' });
    w.events.push({ tick: 0, kind: 'hit', who: 0, x: 1, y: 2, x2: 3, y2: 4 });
    const v = turnedWorld(w), a = v.events[0], b = v.events[0];
    expect(a).toBe(b);
    expect(a.x).toBeCloseTo(toU(1, 2));
    expect(a.y2).toBeCloseTo(toV(3, 4));
  });

  it('turns the room layout once', () => {
    const w = createWorld({ room: 'sanctum' }), v = turnedWorld(w);
    expect(v.def).toBe(turnedWorld(w).def);
    const [x, y] = w.def.dummies[0], [u, t] = v.def.dummies[0];
    expect(u).toBeCloseTo(toU(x, y));
    expect(t).toBeCloseTo(toV(x, y));
    expect(w.def.id).toBe(v.def.id);
  });
});

describe('the isometric camera', () => {
  const cam = new Camera();
  cam.fit(1920, 1080);
  it('round-trips the screen and the real world', () => {
    const s = cam.worldToScreen(5, -3), p = cam.screenToWorld(s.x, s.y);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(-3);
  });
  it('puts world +x to the lower right of the centre', () => {
    const c = cam.worldToScreen(0, 0), s = cam.worldToScreen(4, 0);
    expect(s.x).toBeGreaterThan(c.x);
    expect(s.y).toBeGreaterThan(c.y);
  });
});
