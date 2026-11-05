import { describe, expect, it } from 'vitest';
import { ARENA, SURVIVE_ARENA } from '@wizard-sim/sim';
import { Camera, FY, PPU } from '../src/camera';

const S = SURVIVE_ARENA;
/** Runs follow() for a few seconds of frames, so the easing settles. */
function settle(c: Camera, spots: { x: number; y: number }[], local = spots[0] ?? null, aw: number = S.w, ah: number = S.h): Camera {
  for (let k = 0; k < 240; k++) c.follow(aw, ah, spots, local, 1 / 60);
  return c;
}
const viewX = (c: Camera) => [c.cx - c.w / 2 / PPU, c.cx + c.w / 2 / PPU];

describe('camera', () => {
  it('frames an arena that fits as before: still, centred', () => {
    const c = new Camera();
    c.fit(1264, 706);
    settle(c, [{ x: 8, y: 5 }], null, ARENA.w, ARENA.h);
    expect(c.following).toBe(false);
    expect(c.cx).toBe(0);
    expect(c.scale).toBe(2);
  });

  it('follows in the survive arena, and stops a little past its edge', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    settle(c, [{ x: 0, y: 0 }]);
    expect(c.following).toBe(true);
    expect(Math.abs(c.cx)).toBeLessThan(0.01);
    settle(c, [{ x: 21, y: 14 }]);
    const [, right] = viewX(c);
    expect(right).toBeLessThanOrEqual(S.w / 2 + 2 + 1e-6);
    expect(right).toBeGreaterThan(21); // the wizard is in view
    const bottom = c.cy + (c.h / 2) / (PPU * FY);
    expect(bottom).toBeGreaterThan(14);
  });

  it('steps out one integer scale when the team spreads, and back in when it gathers', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    expect(c.scale).toBe(4);
    settle(c, [{ x: -14, y: 0 }, { x: 14, y: 0 }]);
    expect(c.scale).toBe(3);
    expect(c.base).toBe(4); // the HUD keeps its size
    settle(c, [{ x: -2, y: 0 }, { x: 2, y: 0 }]);
    expect(c.scale).toBe(4);
    // at 2x it never steps out (1x would be too small), nor with a forced ?scale
    const small = new Camera(); small.fit(1280, 720);
    settle(small, [{ x: -16, y: 0 }, { x: 16, y: 0 }]);
    expect(small.scale).toBe(2);
    const forced = new Camera(); forced.fit(1920, 1080, 4);
    settle(forced, [{ x: -16, y: 0 }, { x: 16, y: 0 }]);
    expect(forced.scale).toBe(4);
  });

  it('keeps the local player in view when the team is too far apart to frame', () => {
    const c = new Camera();
    c.fit(1280, 720);
    const me = { x: -20, y: 0 };
    settle(c, [me, { x: 20, y: 0 }], me);
    const [left, right] = viewX(c);
    expect(me.x).toBeGreaterThan(left);
    expect(me.x).toBeLessThan(right);
  });

  it('pans in whole screen pixels: the scene offset is under one art pixel', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    for (let k = 0; k < 50; k++) {
      c.follow(S.w, S.h, [{ x: k * 0.137, y: k * 0.05 }], null, 1 / 60);
      expect(Number.isInteger(c.subX()) && Math.abs(c.subX()) <= c.scale / 2).toBe(true);
      expect(Number.isInteger(c.originX())).toBe(true);
    }
  });
});
