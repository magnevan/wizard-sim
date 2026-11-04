/* Copied from tools/art-pixel-hd/pixel.js (2026-11-04) for the Spell VFX gallery, plus a
 * Sigil ramp and icon. Pixel Battlefield: crisp pixel primitives. Everything is drawn into low-res canvases
 * in whole art pixels (fillRect on integers, own scanline fills, no anti-aliasing),
 * so shapes, particles and UI all sit on the same grid. */
(function () {
  'use strict';
  const PB = window.PB;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];
  const R = Math.round, CPU = { willReadFrequently: true };

  // fillStyle parsing is the hot path for thousands of tiny rects: skip repeats.
  // Anything that sets fillStyle directly must go through fs() too.
  function fs(c, col) { if (c._fs !== col) { c.fillStyle = col; c._fs = col; } }
  function rect(c, x, y, w, h, col) { fs(c, col); c.fillRect(R(x), R(y), R(w), R(h)); }
  function px(c, x, y, col) { fs(c, col); c.fillRect(R(x), R(y), 1, 1); }
  // Filled ellipse by rows; with a = alpha (0..1) it is ordered-dithered.
  function ellipse(c, cx, cy, rx, ry, col, a = 1) {
    fs(c, col);
    const x0 = R(cx), y0 = R(cy), iry = Math.max(0, R(ry)), irx = Math.max(0, rx);
    for (let dy = -iry; dy <= iry; dy++) {
      const k = iry ? dy / (ry + 0.5) : 0, hw = irx * Math.sqrt(Math.max(0, 1 - k * k));
      const xa = R(cx - hw), xb = R(cx + hw);
      if (a >= 1) { c.fillRect(xa, y0 + dy, Math.max(1, xb - xa), 1); continue; }
      for (let x = xa; x < Math.max(xa + 1, xb); x++) if (a > bay(x, y0 + dy)) c.fillRect(x, y0 + dy, 1, 1);
    }
  }
  // Ellipse outline ring (1px), optionally dithered.
  function ring(c, cx, cy, rx, ry, col, a = 1, from = 0, to = Math.PI * 2) {
    fs(c, col);
    const n = Math.max(12, Math.ceil((rx + ry) * 3)), seen = new Set();
    for (let i = 0; i <= n; i++) {
      const th = from + (to - from) * (i / n), x = R(cx + Math.cos(th) * rx), y = R(cy + Math.sin(th) * ry), k = x * 4096 + y;
      if (seen.has(k)) continue; seen.add(k);
      if (a >= 1 || a > bay(x, y)) c.fillRect(x, y, 1, 1);
    }
  }
  // Scanline polygon fill (pixel centres), optional dither alpha.
  function poly(c, pts, col, a = 1) {
    fs(c, col);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    y0 = Math.floor(y0); y1 = Math.ceil(y1);
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = R(xs[k]), xb = R(xs[k + 1]);
        if (xb <= xa) continue;
        if (a >= 1) c.fillRect(xa, y, xb - xa, 1);
        else for (let x = xa; x < xb; x++) if (a > bay(x, y)) c.fillRect(x, y, 1, 1);
      }
    }
  }
  // Bresenham line with a square brush of width w.
  function line(c, x0, y0, x1, y1, col, w = 1) {
    fs(c, col);
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = Math.floor((w - 1) / 2);
    let err = dx + dy, guard = 0;
    for (;;) {
      c.fillRect(x0 - o, y0 - o, w, w);
      if ((x0 === x1 && y0 === y1) || ++guard > 4000) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Polyline through points
  function lines(c, pts, col, w = 1) { for (let i = 1; i < pts.length; i++) line(c, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, w); }
  // Dithered radial glow (solid colour, alpha by ordered dither). Ground-flattened with fy.
  function glow(c, cx, cy, r, col, a, fy = 1) {
    if (r < 0.6 || a <= 0.02) return;
    fs(c, col);
    const ry = r * fy, x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d >= 1) continue;
      // two steps instead of a full ordered dither: a solid core, then a checker rim
      const v = a * (1 - Math.sqrt(d)) ** 1.6;
      if (v > 0.5 || (v > 0.22 && ((x + y) & 1))) c.fillRect(x, y, 1, 1);
    }
  }

  // 3x5 font
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
    9: '010101011001110', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
    '/': '001001010100100', '!': '010010010000010', '×': '000101010101000', '?': '110001010000010',
  };
  function text(c, str, x, y, col, shadow, k = 1) {
    const draw = (ox, oy, cc) => {
      fs(c, cc);
      for (let j = 0; j < str.length; j++) {
        const g = FONT[str[j]] || FONT[' '];
        for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(R(x) + (j * 4 + (i % 3)) * k + ox, R(y) + ((i / 3) | 0) * k + oy, k, k);
      }
    };
    if (shadow) { draw(1, 1, shadow); draw(0, 1, shadow); draw(1, 0, shadow); draw(-1, 0, shadow); draw(0, -1, shadow); }
    draw(0, 0, col);
    return (str.length * 4 - 1) * k;
  }
  // 7x7 element icons
  const ICON = {
    water: ['...#...', '..###..', '.#####.', '###.###', '##.####', '.#####.', '..###..'],
    life: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
    shield: ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
    cold: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
    lightning: ['....###', '...###.', '..###..', '.######', '...###.', '..##...', '.#.....'],
    arcane: ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
    earth: ['..###..', '.##.##.', '###.###', '#######', '##.####', '.#####.', '.......'],
    fire: ['...#...', '..##...', '..###.#', '.#####.', '###.###', '##...##', '.#####.'],
    sigil: ['...#...', '..#.#..', '.#####.', '#..#..#', '.#####.', '..#.#..', '...#...'],
  };
  function icon(c, el, x, y, col, k = 1) {
    const g = ICON[el]; if (!g) return;
    fs(c, col);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (g[j][i] === '#') c.fillRect(R(x) + i * k, R(y) + j * k, k, k);
  }

  // Colour helpers
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixCache = new Map();
  function mix(a, b, k) {
    k = Math.max(0, Math.min(1, k));
    const key = a + b + (k * 32 | 0);
    let v = mixCache.get(key);
    if (v) return v;
    const A = hex(a), B = hex(b), q = (k * 32 | 0) / 32;
    v = toHex(A[0] + (B[0] - A[0]) * q, A[1] + (B[1] - A[1]) * q, A[2] + (B[2] - A[2]) * q);
    mixCache.set(key, v);
    return v;
  }

  // Element ramps, brightest first.
  const EL = {
    fire: ['#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#c8302a', '#6a1a20'],
    arcane: ['#ffffff', '#ffc0e0', '#ff6ab0', '#ff2d8a', '#a01e6a', '#4a1450'],
    water: ['#e0f6ff', '#8ad0ff', '#3a98ff', '#1a5ec0', '#163a7a'],
    cold: ['#ffffff', '#e0ffff', '#9ff4ff', '#4ad0f4', '#2080c8', '#163e7a'],
    lightning: ['#ffffff', '#efe4ff', '#c4a4ff', '#8a5af0', '#4a2aa0'],
    shield: ['#fffbe0', '#ffe68a', '#ffc83a', '#c8901a', '#6a4a10'],
    earth: ['#e0c8a0', '#b8946a', '#8a6a48', '#5a4430', '#33261c'],
    life: ['#e8ffd8', '#9af07a', '#46c450', '#1e7a34', '#0e3a1e'],
    steam: ['#ffffff', '#e4e8f0', '#b8c0d0', '#8a90a8'],
    // Spell VFX addition: Sigil, built around rules-c.js's #d400ff
    sigil: ['#fbe6ff', '#ee8cff', '#d400ff', '#9200c4', '#52007a'],
  };
  const TEAM = {
    p1: { main: '#d23440', light: '#f2666a', dark: '#7e1a2a', deep: '#4a1020', trim: '#f4c44a', name: 'Red' },
    p2: { main: '#2f6ad6', light: '#64a0f6', dark: '#1a3a86', deep: '#10204a', trim: '#d8ecfa', name: 'Blue' },
    p3: { main: '#dca22a', light: '#f8d26a', dark: '#8a5c14', deep: '#4a300c', trim: '#fff4cc', name: 'Gold' },
    p4: { main: '#8048d0', light: '#ac80f0', dark: '#46267e', deep: '#28143e', trim: '#e6d8ff', name: 'Violet' },
  };

  // Ordered-dither masks for fading whole sprites: MASK(level 0..16) is a canvas whose
  // opaque pixels are those whose Bayer threshold is below level/16.
  const masks = [];
  function mask(level, size = 96) {
    level = Math.max(0, Math.min(16, Math.round(level)));
    if (masks[level]) return masks[level];
    const m = document.createElement('canvas'); m.width = m.height = size;
    const x = m.getContext('2d', CPU); x.fillStyle = '#000';
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (level / 16 > bay(i, j)) x.fillRect(i, j, 1, 1);
    return (masks[level] = m);
  }

  PB.px = { fs, BAYER, bay, rect, px, ellipse, ring, poly, line, lines, glow, text, icon, hex, toHex, mix, EL, TEAM, mask, FONT };
})();
