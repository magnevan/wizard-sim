/* Copied unchanged from tools/weapon-moves/stage.js (2026-11-05) for the Survive Review.
 * Copied from tools/spell-vfx/stage.js (2026-11-05) for the Weapon Moveset Review. Changes: the
 * stage size is per vignette (V.w, V.h; default 200x124), the ground, scratch buffers and
 * the ambient light scale with it.
 * Spell VFX: the stage. One small pixel-art scene per vignette, rendered the way
 * tools/art-pixel-hd/render.js renders the battlefield, cut down to a vignette:
 *   1. cached ground (grass, path or flagstones, generated once per seed)
 *   2. decals the vignette draws on the ground (patches, puddles, glyphs, scorch)
 *   3. drop shadows
 *   4. the depth-sorted pass: actors (outlined rigs from actors.js) and anything that
 *      stands up (walls, spikes, turrets), sorted by ground y
 *   5. the light map: a dusk ambient plus every spell's coloured light, posterised into
 *      flat bands with dither only at band seams; emissive pixels keep their colour
 *   6. unlit effects on the art-pixel grid (beams, sprays, bolts, particles)
 * A vignette is { id, dur, ground, seed, frame(t, K) }. frame returns
 *   { actors, under(c,E), stand:[[y, fn(c,E)]], lights:[[x,y,r,col,a]], fx(c,A,E), shake, amb }.
 * World coordinates are art pixels on the ground (already foreshortened by FY). */
(function () {
  'use strict';
  const PB = window.PB, { FY, TAU, clamp, lerp, rand } = PB, X = PB.px;
  let W = 200, H = 124;
  const CPU = { willReadFrequently: true };
  const LEV = 9, GAIN = 2.25, DW = 0.22;
  let LUT = null;
  function lightLUT() {
    if (LUT) return LUT;
    LUT = new Uint16Array(16 * 256);
    for (let k = 0; k < 16; k++) for (let v = 0; v < 256; v++) LUT[(k << 8) + v] = Math.round((Math.floor(v * LEV / 255 + 0.5 + (X.BAYER[k] - 0.5) * DW) / LEV) * GAIN * 256);
    return LUT;
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', CPU); x.imageSmoothingEnabled = false; return { c, x }; };
  // Shared scratch buffers: vignettes render one at a time.
  const bufs = new Map();
  let MASK = null, LIGHT = null;
  function useSize(w, h) {
    W = w; H = h;
    const k = w + 'x' + h;
    if (!bufs.has(k)) bufs.set(k, [mk(w, h), mk(w, h)]);
    [MASK, LIGHT] = bufs.get(k);
  }
  useSize(200, 124);

  // ---------------------------------------------------------------------------
  // Ground: value noise grass, a worn path, old flagstones; light from the upper left.
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(rand(xi, yi, s), rand(xi + 1, yi, s), u), lerp(rand(xi, yi + 1, s), rand(xi + 1, yi + 1, s), u), v);
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15;
  const G = ['#24402f', '#2c4b36', '#35573c', '#3f6443', '#4b724a', '#5a8352'].map(X.hex);
  const DIRT = ['#463628', '#554232', '#66503c', '#7a6248', '#8e7656'].map(X.hex);
  const FLAG = ['#3c463a', '#454e41', '#4f5849', '#5a6252'].map(X.hex);
  const grounds = new Map();
  function ground(kind, seed) {
    const key = kind + seed + ':' + W + 'x' + H, SX = W / 200, SY = H / 124;
    if (grounds.has(key)) return grounds.get(key);
    const g = mk(W, H), img = g.x.createImageData(W, H), d = img.data;
    // a path band that wanders across the scene (kind 'path'), or a plaza oval ('plaza')
    const pathY = (x) => 70 * SY + Math.sin(x * 0.02 + seed) * 10 * SY + (x - W / 2) * 0.08;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, n = fbm(x * 0.05 + seed * 7, y * 0.075, 3 + seed), r = rand(x, y, 9 + seed);
      let col;
      let k = Math.floor(2.2 + (n - 0.5) * 4.5 + (r - 0.5) * 0.8);
      const st = rand(x, Math.floor((y + (x % 3)) / 3), 4 + seed);
      if (st < 0.1) k += 1; else if (st > 0.93) k -= 1;
      col = G[clamp(k, 0, 5)];
      if (kind === 'path') {
        const pd = Math.abs(y - pathY(x)) + (vnoise(x * 0.15, y * 0.2, 7) - 0.5) * 6, pw = (13 + vnoise(x * 0.03, 0, 8 + seed) * 6) * Math.max(0.6, SY);
        if (pd < pw) col = DIRT[clamp(Math.floor(2 + (n - 0.5) * 3.5 + (r - 0.5) * 1.3 - (pd > pw - 3 ? 1 : 0)), 0, 4)];
        else if (pd < pw + 2 && r < 0.6) col = G[0];
      }
      if (kind === 'plaza') {
        const dx = (x - W / 2) / (92 * SX), dy = (y - 66 * SY) / (50 * SY), pz = dx * dx + dy * dy;
        if (pz < 1) {
          const row = Math.floor(y / 6), off = (row & 1) * 5, cx = Math.floor((x + off) / 10), lx = (x + off) - cx * 10, ly = y - row * 6;
          if (rand(cx, row, 21 + seed) > pz * 1.1 + 0.25) {
            if (lx === 0 || ly === 0) col = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
            else { const sh = clamp(Math.floor(rand(cx, row, 22) * 3 + (ly === 1 ? 1 : 0) - (ly === 5 ? 1 : 0)), 0, 3); col = FLAG[sh]; if (rand(x, y, 23) < 0.04) col = G[2]; }
          }
        }
      }
      // a soft vignette at the scene edges so the eye stays on the action
      const ex = Math.min(x, W - 1 - x) / 26, ey = Math.min(y, H - 1 - y) / 20, m = 0.72 + 0.28 * clamp(Math.min(ex, ey), 0, 1);
      d[i] = col[0] * m; d[i + 1] = col[1] * m; d[i + 2] = col[2] * m; d[i + 3] = 255;
    }
    g.x.putImageData(img, 0, 0);
    // stamps: flowers, pebbles, dark grass tufts (static; a vignette is short)
    const FLOW = ['#f0e8f8', '#f6a0b4', '#ffe070', '#9ac4ff'];
    for (let i = 0; i < Math.round(70 * SX * SY); i++) {
      const x = Math.floor(rand(i, 31, seed) * W), y = Math.floor(rand(i, 32, seed) * H), kd = rand(i, 33, seed);
      if (kind === 'plaza') { const dx = (x - W / 2) / (92 * SX), dy = (y - 66 * SY) / (50 * SY); if (dx * dx + dy * dy < 0.7) continue; }
      if (kind === 'path' && Math.abs(y - pathY(x)) < 16 * SY) continue;
      if (kd < 0.3) { X.px(g.x, x, y, FLOW[i % 4]); X.px(g.x, x, y + 1, '#2c4b36'); }
      else if (kd < 0.55) { X.rect(g.x, x, y, 2, 1, '#6a6157'); X.px(g.x, x, y - 1, '#8a8174'); X.px(g.x, x + 1, y + 1, '#2a2622'); }
      else { for (let k = 0; k < 3; k++) X.line(g.x, x + k, y, x + k + (k - 1) * 0.6, y - 2 - (k === 1 ? 1 : 0), k % 2 ? '#4e8044' : '#5e9452'); }
    }
    grounds.set(key, g.c);
    return g.c;
  }

  // ---------------------------------------------------------------------------
  // Actor builders. Facing is measured on the un-squashed ground: 0 = east,
  // PI/2 = toward the camera.
  const BASE = { z: 0, face: 0, spd: 0, ph: 0, seed: 1, sq: 0, dead: 0, cast: 0, prep: 0, el: 'arcane', burn: 0, wet: 0, frozen: 0, shock: 0, flash: 0, alpha: 1, vx: 0, vy: 0, weapon: 0, swing: -1, punch: -1, smash: -1, draw: 0, variant: 0 };
  let uid = 0;
  const actor = (kind, o) => Object.assign({ id: kind + (uid++) }, BASE, { kind }, o);
  const B = {
    wiz: (o) => actor('wizard', Object.assign({ team: 'p1', id: 'me' }, o)),
    gob: (o) => actor('goblin', o),
    archer: (o) => actor('archer', o),
    brute: (o) => actor('brute', o),
    faceTo: (a, b) => Math.atan2((b[1] - a[1]) / FY, b[0] - a[0]),
    // the standard cast rhythm: prep (staff raised, runes gather) from p0 to c0, cast from c0 to c1
    pose(t, p0, c0, c1) {
      const prep = PB.smooth(PB.seg(t, p0, p0 + 0.18)) * (t < c1 + 0.2 ? 1 : 0);
      const cast = Math.min(PB.seg(t, c0, c0 + 0.07), 1 - PB.seg(t, c1, c1 + 0.22));
      return { prep: t < c0 ? prep : 0, cast };
    },
  };

  // ---------------------------------------------------------------------------
  function render(ctx, V, t, K) {
    PB.LOOP = V.dur;
    useSize(V.w || 200, V.h || 124);
    uid = 0;
    const F = V.frame(t, K) || {};
    const b = ctx, m = MASK.x;
    b.globalCompositeOperation = 'source-over'; b._fs = null; m._fs = null;
    b.drawImage(ground(V.ground || 'grass', V.seed || 1), 0, 0);
    m.clearRect(0, 0, W, H);
    const E = {
      em(fn) { fn(b); fn(m); },                                       // emissive: skips the light map
      op(fn) { fn(b); m.globalCompositeOperation = 'destination-out'; fn(m); m.globalCompositeOperation = 'source-over'; m._fs = null; },
      b, m,
    };
    const actors = F.actors || [];
    if (F.under) F.under(b, E);
    // drop shadows (shrink as they hop)
    for (const s of actors) {
      if (s.alpha < 0.2 || s.noShadow) continue;
      const w = PB.actors.WIDTH[s.kind] * 1.25 * (1 - Math.min(0.5, s.z / 30));
      X.ellipse(b, s.x + 1, s.y + 1, w, Math.max(1.5, w * FY * 0.55), 'rgba(8,6,16,0.5)');
    }
    if (F.under2) F.under2(b, E);
    // depth-sorted pass
    const D = (F.stand || []).slice(), A = {};
    for (const s of actors) D.push([s.y + (s.dy || 0), () => { if (s.alpha > 0.02) A[s.id] = PB.actors.draw(b, m, s, t, 0, 0, null, null); }]);
    D.sort((p, q) => p[0] - q[0]);
    for (const d of D) d[1](b, E);
    for (const s of actors) if (!A[s.id]) A[s.id] = { chest: [s.x, s.y - s.z - 9], tip: [s.x + 4, s.y - s.z - 20], head: [s.x, s.y - s.z - 14], charge: [s.x + 4, s.y - s.z - 26] };
    for (const s of actors) A[s.id].s = s;
    // light map
    const L = LIGHT.x;
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over';
    L.fillStyle = F.amb || '#34364e'; L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'lighter';
    const add = (x, y, r, col, a) => {
      if (a <= 0.01 || r < 1) return;
      L.setTransform(1, 0, 0, FY, 0, y * (1 - FY));
      const gr = L.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, X.mix('#000000', col, Math.min(1, a))); gr.addColorStop(0.45, X.mix('#000000', col, Math.min(1, a * 0.5))); gr.addColorStop(1, '#000000');
      L.fillStyle = gr; L.fillRect(x - r, y - r, r * 2, r * 2);
    };
    add(W / 2, H * 0.56, Math.max(W, H) * 0.75, '#22243a', 1);
    for (const s of actors) if (s.kind === 'wizard' && s.alpha > 0.3) {
      add(s.x, s.y - 8, 42, '#9890c0', 0.38);
      const tip = A[s.id].tip; if (tip && X.EL[s.el]) add(tip[0], tip[1] + 6, 22, X.EL[s.el][2], 0.35 + 0.3 * (s.cast || 0));
    }
    for (const l of F.lights || []) add(...l);
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over';
    const img = b.getImageData(0, 0, W, H), bd = img.data, ld = L.getImageData(0, 0, W, H).data, md = m.getImageData(0, 0, W, H).data, LU = lightLUT();
    for (let y = 0, i = 0; y < H; y++) {
      const by4 = (y & 3) << 2;
      for (let x = 0; x < W; x++, i += 4) {
        if (md[i + 3] !== 0) continue;
        const o = ((x & 3) + by4) << 8;
        bd[i] = (bd[i] * LU[o + ld[i]]) >> 8; bd[i + 1] = (bd[i + 1] * LU[o + ld[i + 1]]) >> 8; bd[i + 2] = (bd[i + 2] * LU[o + ld[i + 2]]) >> 8;
      }
    }
    b.putImageData(img, 0, 0);
    // unlit effects
    if (F.fx) F.fx(b, A, E);
    // screen shake: shift the finished frame by whole pixels
    if (F.shake > 0.3) {
      const sx = Math.round((rand(Math.floor(t * 40), 1) - 0.5) * 2 * F.shake), sy = Math.round((rand(Math.floor(t * 40), 2) - 0.5) * 2 * F.shake);
      if (sx || sy) { b.drawImage(b.canvas, sx, sy); }
    }
    return A;
  }

  PB.stage = Object.assign({ W: 200, H: 124, render, ground }, B);
})();
