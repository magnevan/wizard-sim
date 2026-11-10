import { describe, expect, it } from 'vitest';
import { castMask } from '../src/art/cast-shadow';

/** A picture from rows of '#' and '.'. */
function picture(rows: string[]) {
  const h = rows.length, w = rows[0].length, rgba = new Uint8Array(w * h * 4);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') rgba[(y * w + x) * 4 + 3] = 255; }));
  return { rgba, w, h };
}
const on = (m: ReturnType<typeof castMask>, x: number, y: number) => m.alpha[y * m.w + x] > 0;

describe('castMask', () => {
  it('each column leaves from its own bottom edge, not from one line across the picture', () => {
    // a V: the outer columns end higher up than the middle one
    const { rgba, w, h } = picture([
      '#...#',
      '##.##',
      '.###.',
      '..#..',
    ]);
    const m = castMask(rgba, w, h, 0, 0);
    expect(on(m, 0, 1)).toBe(true); // column 0's bottom edge is row 1
    expect(on(m, 0, 3)).toBe(false); // and nothing is laid along the picture's lowest row out there
    expect(on(m, 2, 3)).toBe(true);
  });

  it('height is laid along the sun', () => {
    const { rgba, w, h } = picture(['#', '#', '#', '#', '#']);
    const m = castMask(rgba, w, h, 1, 0.5);
    expect(on(m, 0, 4)).toBe(true); // the foot stays where it stands
    expect(on(m, 4, 6)).toBe(true); // the top, 4 px up, lands 4 right and 2 down
  });

  it('what overhangs its stand casts from where the stand would reach', () => {
    const { rgba, w, h } = picture([
      '#######',
      '#######',
      '...#...',
      '...#...',
      '..###..',
    ]);
    const m = castMask(rgba, w, h, 1, 0);
    // column 1 ends at row 1 but the outline bridges down toward the stand: its base is row 3, so its top lands 3 to the right
    expect(on(m, 4, 3)).toBe(true);
  });

  it('a shadow stretched by a long sun, off a sloping base, has no holes', () => {
    // a solid diamond-bottomed block, like a chest seen from the corner
    const rows = Array.from({ length: 40 }, (_, y) => [...Array(40).keys()].map((x) => (y <= 39 - Math.abs(x - 20) / 2 ? '#' : '.')).join(''));
    const { rgba, w, h } = picture(rows);
    for (const [sx, sy] of [[0.55, 0.28], [0.95, 0.42], [0.3, 0.15]]) {
      const m = castMask(rgba, w, h, sx, sy);
      let holes = 0;
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
        if (!on(m, x, y) && on(m, x - 1, y) && on(m, x + 1, y) && on(m, x, y - 1) && on(m, x, y + 1)) holes++;
      }
      expect(holes).toBe(0);
    }
  });

  it('see-through columns cast nothing', () => {
    const { rgba, w, h } = picture(['#.#', '#.#']);
    const m = castMask(rgba, w, h, 0, 0);
    expect(on(m, 1, 1)).toBe(false);
  });
});
