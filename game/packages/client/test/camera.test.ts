import { describe, expect, it } from 'vitest';
import { ARENA, SURVIVE_ARENA } from '@wizard-sim/sim';
import { Camera, FY, PPU } from '../src/camera';

const S = SURVIVE_ARENA;
/** Runs follow() for a few seconds of frames, so the easing settles. `shared`: several local seats on one screen. */
function settle(c: Camera, spots: { x: number; y: number }[], shared = spots.length > 1, aw: number = S.w, ah: number = S.h): Camera {
  for (let k = 0; k < 240; k++) c.follow(aw, ah, spots, shared, 1 / 60);
  return c;
}
const viewX = (c: Camera) => [c.cx - c.w / 2 / PPU, c.cx + c.w / 2 / PPU];

describe('camera', () => {
  it('couch co-op in an arena that fits is framed as before: still, centred', () => {
    const c = new Camera();
    c.fit(1264, 706);
    settle(c, [{ x: 8, y: 5 }, { x: -3, y: 0 }], true, ARENA.w, ARENA.h);
    expect(c.following).toBe(false);
    expect(c.cx).toBe(0);
    expect(c.scale).toBe(2);
  });

  it('one player in an arena that fits is followed, and the view never leaves the arena', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    settle(c, [{ x: 0, y: 0 }], false, ARENA.w, ARENA.h);
    expect(c.following).toBe(true);
    const mid = c.cy;
    settle(c, [{ x: 11, y: 7 }], false, ARENA.w, ARENA.h);
    expect(c.cy).toBeGreaterThan(mid); // it moved toward the wizard
    const [left, right] = viewX(c);
    expect(right).toBeGreaterThan(11);
    expect(left).toBeLessThanOrEqual(-ARENA.w / 2 + 1e-6); // the arena fits across: it stays whole
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

  it('the survive arena overflows the play view both ways at the scale picked for common windows', () => {
    for (const [sw, sh] of [[1280, 800], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
      const c = new Camera();
      c.fit(sw, sh);
      settle(c, [{ x: 0, y: 0 }]);
      const r = c.playRect();
      expect(c.following).toBe(true);
      expect(c.w / PPU).toBeLessThan(S.w);
      expect((r.y1 - r.y0) / c.scale / (PPU * FY)).toBeLessThan(S.h);
    }
  });

  it('never zooms out: local seats far apart are framed at their middle, at the screen\'s scale', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    expect(c.scale).toBe(4);
    settle(c, [{ x: -14, y: 0 }, { x: 14, y: 0 }]);
    expect(c.scale).toBe(4);
    expect(c.base).toBe(4);
    expect(Math.abs(c.cx)).toBeLessThan(0.01);
  });

  it('pans in whole screen pixels: the scene offset is under one art pixel', () => {
    const c = new Camera();
    c.fit(1920, 1080);
    for (let k = 0; k < 50; k++) {
      c.follow(S.w, S.h, [{ x: k * 0.137, y: k * 0.05 }], false, 1 / 60);
      expect(Number.isInteger(c.subX()) && Math.abs(c.subX()) <= c.scale / 2).toBe(true);
      expect(Number.isInteger(c.originX())).toBe(true);
    }
  });
});
