/* Shared vignette helpers, copied from tools/spell-vfx/vfx-forms.js (2026-11-05): K.life, K.kb, K.down,
 * K.hop, K.flash, K.walk, K.hp, K.blobPts, K.puddle, K.ice. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit } = PB, X = PB.px, EL = X.EL;
  // fade an actor in at the loop start and out at its end, so knocked-down bodies reset cleanly
  K.life = (t, D, a = 0.22, b = 0.3) => Math.min(seg(t, 0, a), 1 - seg(t, D - b, D));
  K.kb = (t, t0, dist, dur = 0.35) => dist * easeOut(seg(t, t0, t0 + dur));
  // knocked down at t0, back up by t1 (0 = standing, 0.85 = flat)
  K.down = (t, t0, t1 = 99) => 0.85 * Math.min(smooth(seg(t, t0, t0 + 0.25)), 1 - smooth(seg(t, t1, t1 + 0.35)));
  K.hop = (t, t0, h = 8, dur = 0.4) => { const e = (t - t0) / dur; return e > 0 && e < 1 ? h * 4 * e * (1 - e) : 0; };
  K.flash = (t, t0) => (t >= t0 && t < t0 + 0.25 ? 1 - (t - t0) / 0.25 : 0);
  K.walk = (t, spd = 1) => ({ spd, ph: t * 9 * spd });
  // a small health bar over a body, v = 0..1
  K.hp = (c, A, s, v) => { const a = A[s.id]; if (!a || !a.head) return; const x = Math.round(a.head[0]) - 7, y = Math.round(a.head[1]) - 10; X.rect(c, x - 1, y - 1, 16, 4, '#120e1a'); X.rect(c, x, y, 14, 2, '#5a1a24'); X.rect(c, x, y, Math.round(14 * v), 2, v > 0.5 ? '#5fe07a' : v > 0.25 ? '#e6c84a' : '#e05a5a'); };
  // a soft blob on the ground: puddles, floods, ice sheets, patches
  K.blobPts = (x, y, rx, ry, seed = 0, n = 28) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 + Math.sin(a * 3 + seed) * 0.1 + Math.sin(a * 5 + seed * 2) * 0.07; p.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]); } return p; };
  K.puddle = (c, x, y, rx, k, t, seed = 1, ripples = true) => {
    if (k <= 0.02) return;
    const ry = rx * FY * 0.62;
    X.poly(c, K.blobPts(x, y, rx * k, ry * k, seed), '#18325a', k > 0.97 ? 1 : k);
    X.poly(c, K.blobPts(x, y - 1, rx * k * 0.86, ry * k * 0.86, seed), '#204a80', k > 0.97 ? 1 : k);
    X.line(c, x - rx * 0.4 * k, y - ry * 0.4 * k, x - rx * 0.1 * k, y - ry * 0.5 * k, '#5aa8e8');
    if (ripples) for (let i = 0; i < 2; i++) { const e = PB.mod(t * 0.7 + i / 2, 1); X.ring(c, x - rx * 0.3 + i * rx * 0.5, y + i * 2 - 1, 2 + e * rx * 0.4, (2 + e * rx * 0.4) * 0.4, '#5aa8e8', (1 - e) * 0.8 * k); }
  };
  K.ice = (c, x, y, rx, k, front, seed = 1) => {
    if (k <= 0.02) return;
    const ry = rx * FY * 0.62;
    c.save(); c.beginPath(); c.rect(0, 0, front, 200); c.clip();
    X.poly(c, K.blobPts(x, y, rx * 1.03, ry * 1.03, seed), '#7ab8d4'); X.poly(c, K.blobPts(x, y - 1, rx * 0.86, ry * 0.86, seed), '#b4e4f4');
    for (let i = 0; i < 7; i++) { const x0 = x + (rand(i, 71, seed) - 0.5) * rx * 1.4, y0 = y + (rand(i, 72, seed) - 0.5) * ry * 1.1; X.line(c, x0, y0, x0 + 4 + rand(i, 73) * 5, y0, '#ffffff'); }
    for (let i = 0; i < 4; i++) { const x0 = x + (rand(i, 81, seed) - 0.5) * rx * 1.2, y0 = y + (rand(i, 82, seed) - 0.5) * ry; X.lines(c, [[x0, y0], [x0 + 3, y0 + 2], [x0 + 7, y0 + 1]], '#5a90b0'); }
    c.restore(); c._fs = null;
  };
  // standard cast rhythm: prep 0.05..c0, cast c0..c1
})();
