import { describe, expect, it } from 'vitest';
import { groundAt, isoCamera, paintGround, todayCamera, type GroundMap, type Material } from '../src/art/ground';
import { FY, PPU } from '../src/camera';

const flat = (r: number, g: number, b: number): Material => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { w: 4, h: 4, data, flip: true };
};
const mats = { g: flat(0, 200, 0), d: flat(200, 0, 0) };
// 24 x 16 u: the west half grass, the east half dirt
const map: GroundMap = { w: 24, h: 16, rows: Array.from({ length: 32 }, () => 'g'.repeat(24) + 'd'.repeat(24)) };
const greenish = (o: Uint8ClampedArray, W: number, x: number, y: number) => o[(y * W + x) * 4 + 1] > o[(y * W + x) * 4];

describe('painted ground', () => {
  it('reads a cell, and the nearest cell off the map', () => {
    expect(groundAt(map, -5, 0)).toBe('g');
    expect(groundAt(map, 5, 0)).toBe('d');
    expect(groundAt(map, -999, -999)).toBe('g');
    expect(groundAt(map, 999, 999)).toBe('d');
  });

  const W = 24 * PPU, H = Math.ceil(16 * PPU * FY), OX = W / 2, OY = H / 2;
  it('paints each side its material under today\'s camera', () => {
    const o = new Uint8ClampedArray(W * H * 4);
    paintGround(o, W, H, OX, OY, map, mats, 'g', todayCamera);
    expect(greenish(o, W, OX - 6 * PPU, OY)).toBe(true);
    expect(greenish(o, W, OX + 6 * PPU, OY)).toBe(false);
    expect(o[3]).toBe(255);
  });

  it('breaks up the edge between materials', () => {
    const o = new Uint8ClampedArray(W * H * 4);
    paintGround(o, W, H, OX, OY, map, mats, 'g', todayCamera);
    const column = new Set<number>();
    for (let y = 0; y < H; y++) { let x = OX - 2 * PPU; while (x < OX + 2 * PPU && greenish(o, W, x, y)) x++; column.add(x); }
    expect(column.size).toBeGreaterThan(8);
  });

  it('puts the same world in the same place under an isometric camera', () => {
    const cam = isoCamera(12);
    const wide = 800, tall = 500, o = new Uint8ClampedArray(wide * tall * 4);
    paintGround(o, wide, tall, 400, 250, map, mats, 'g', cam);
    // world (-6, 0) and (6, 0) land at screen (∓72, ∓36) under this camera
    expect(greenish(o, wide, 400 - 72, 250 - 36)).toBe(true);
    expect(greenish(o, wide, 400 + 72, 250 + 36)).toBe(false);
    expect(cam.x(12, 6)).toBeCloseTo(1);
    expect(cam.y(12, 6)).toBeCloseTo(0);
  });

  it('is the same every time', () => {
    const a = new Uint8ClampedArray(W * H * 4), b = new Uint8ClampedArray(W * H * 4);
    paintGround(a, W, H, OX, OY, map, mats, 'g', todayCamera);
    paintGround(b, W, H, OX, OY, map, mats, 'g', todayCamera);
    expect(a).toEqual(b);
  });
});
