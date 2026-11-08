// Field Atlas renderer: the painted Chart look, and the plain Fields diagram. Everything drawn here is procedural; a seed always paints the same map.
(function (root) {
  const { GW, GH, N, K, TAU, FIELDS, fbm, hash, rng, cl, idx, chaikin } = root.FieldGen;
  const S = 5, W = GW * S, H = GH * S, FRAME = 48, KEYW = 700, KEYH = 316;
  const INK = '#2a2015', PAPER = '#efe4c8';
  const F_GOTH = '"Grenze Gotisch", "Almendra", Georgia, serif', F_TOWN = '"Almendra", Georgia, serif', F_REGION = '"Almendra SC", "Palatino Linotype", Georgia, serif';
  const ROOF = { earth: '#a07c42', cold: '#5b8fb3', fire: '#b43f28', water: '#2f6f9e', lightning: '#7658bd', life: '#4a8a3f', arcane: '#a43a8a' };
  const mix = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const sprite = (w, h, fn) => { const c = mk(w, h), g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g, w, h); return c; };

  // ---------- the coast ----------
  function contour(fn, w, h, scale, minPts) {
    const stride = w + 1, v = new Float32Array(stride * (h + 1));
    for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) v[j * stride + i] = fn(i, j);
    const pos = new Map(), adj = new Map();
    const eT = (i, j) => 2 * (j * stride + i), eL = (i, j) => 2 * (j * stride + i) + 1;
    const pt = (e) => { if (pos.has(e)) return; const n = e >> 1, i = n % stride, j = (n / stride) | 0, a = v[n]; if (e & 1) { const b = v[n + stride], t = a / (a - b); pos.set(e, [i * scale, (j + t) * scale]); } else { const b = v[n + 1], t = a / (a - b); pos.set(e, [(i + t) * scale, j * scale]); } };
    const link = (a, b) => { pt(a); pt(b); if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const a = v[j * stride + i] > 0, b = v[j * stride + i + 1] > 0, c = v[(j + 1) * stride + i + 1] > 0, d = v[(j + 1) * stride + i] > 0;
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0); if (code === 0 || code === 15) continue;
      const T = eT(i, j), B = eT(i, j + 1), Lf = eL(i, j), Rt = eL(i + 1, j);
      switch (code) { case 1: case 14: link(Lf, B); break; case 2: case 13: link(B, Rt); break; case 3: case 12: link(Lf, Rt); break; case 4: case 11: link(T, Rt); break; case 6: case 9: link(T, B); break; case 7: case 8: link(Lf, T); break; case 5: link(Lf, T); link(B, Rt); break; case 10: link(T, Rt); link(Lf, B); break; }
    }
    const seen = new Set(), loops = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = []; let cur = start, prev = -1;
      for (;;) { seen.add(cur); loop.push(pos.get(cur)); const nx = adj.get(cur).find((e) => e !== prev && !seen.has(e)); if (nx === undefined) break; prev = cur; cur = nx; }
      if (loop.length >= minPts) loops.push(loop);
    }
    return loops;
  }
  const toPath = (loops) => { const p = new Path2D(); for (const l of loops) { p.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) p.lineTo(l[i][0], l[i][1]); p.closePath(); } return p; };
  function geometry(w) {
    if (w._geo) return w._geo;
    const sample = (px, py) => { const x = Math.min(GW - 1.001, px), y = Math.min(GH - 1.001, py), i = x | 0, j = y | 0, u = x - i, v = y - j, a = w.h[idx(i, j)], b = w.h[idx(i + 1, j)], c = w.h[idx(i, j + 1)], d = w.h[idx(i + 1, j + 1)]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    const coast = contour((i, j) => (i === 0 || j === 0 || i === GW * 2 || j === GH * 2) ? -1 : sample(i / 2, j / 2) + (fbm(i * .09, j * .09, w.seed + 77, 4) - .5) * .05, GW * 2, GH * 2, S / 2, 14);
    const lakeSm = Float32Array.from(w.lake); for (let p = 0; p < 2; p++) { const t = Float32Array.from(lakeSm); for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = idx(x, y); lakeSm[i] = (t[i] * 2 + t[i - 1] + t[i + 1] + t[i - GW] + t[i + GW]) / 6; } }
    const lakes = contour((i, j) => (i < GW && j < GH ? lakeSm[idx(i, j)] : 0) - .45, GW, GH, S, 8).map((l) => { const c = chaikin([...l, l[0]], 2); c.pop(); return c; });
    return (w._geo = { coast, coastPath: toPath(coast), lakes, lakePath: toPath(lakes) });
  }

  // ---------- shared textures ----------
  let mottleTex = null, grainTex = null;
  function textures() {
    if (mottleTex) return;
    mottleTex = mk(500, 400); { const g = mottleTex.getContext('2d'), im = g.createImageData(500, 400); for (let y = 0; y < 400; y++) for (let x = 0; x < 500; x++) { const v = 128 + (fbm(x / 16, y / 16, 5, 5) - .5) * 200 + (fbm(x / 3, y / 3, 11, 2) - .5) * 40, p = (y * 500 + x) * 4; im.data[p] = im.data[p + 1] = im.data[p + 2] = v; im.data[p + 3] = 255; } g.putImageData(im, 0, 0); }
    grainTex = mk(320, 320); { const g = grainTex.getContext('2d'), im = g.createImageData(320, 320), r = rng(4242); for (let i = 0; i < 320 * 320; i++) { const v = 235 + r() * 20 - (r() < .03 ? 45 : 0), p = i * 4; im.data[p] = v; im.data[p + 1] = v - 3; im.data[p + 2] = v - 9; im.data[p + 3] = 255; } g.putImageData(im, 0, 0); }
  }

  // ---------- ground colour ----------
  const RAMP = [[.1, [228, 224, 210], [242, 239, 231]], [.3, [168, 156, 92], [80, 101, 54]], [.6, [200, 182, 104], [122, 139, 62]], [.86, [229, 208, 144], [152, 158, 76]]];
  function landColour(t, m) {
    let a = RAMP[0], b = RAMP[0];
    for (let i = 0; i < RAMP.length - 1; i++) if (t >= RAMP[i][0]) { a = RAMP[i]; b = RAMP[i + 1]; }
    if (t >= RAMP[RAMP.length - 1][0]) { a = b = RAMP[RAMP.length - 1]; }
    const u = a === b ? 0 : cl((t - a[0]) / (b[0] - a[0])), mm = cl((m - .28) / .42), s = mm * mm * (3 - 2 * mm);
    return mix3(mix3(a[1], b[1], u), mix3(a[2], b[2], u), s);
  }
  const BIOME = {
    earth: [[186, 132, 78], [150, 96, 52]], cold: [[240, 245, 247], [204, 222, 234]], fire: [[122, 72, 54], [68, 44, 42]], water: [[94, 156, 130], [62, 124, 114]],
    lightning: [[124, 118, 162], [84, 80, 126]], life: [[98, 164, 64], [58, 126, 46]], arcane: [[150, 96, 176], [102, 58, 138]],
  };
  function paintBase(w) {
    const c = mk(GW, GH), g = c.getContext('2d'), im = g.createImageData(GW, GH), d = im.data;
    const ocean = mk(GW, GH), og = ocean.getContext('2d'), om = og.createImageData(GW, GH), o = om.data;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = idx(x, y), p = i * 4, t = Math.pow(cl(w.dLand[i] / (26 * K)), .6), col = mix3([111, 160, 165], [58, 104, 122], t), n = (fbm(x / 22, y / 22, w.seed + 60) - .5) * 26;
      o[p] = col[0] + n; o[p + 1] = col[1] + n; o[p + 2] = col[2] + n; o[p + 3] = 255;
      let c3 = landColour(w.temp[i], w.moist[i]);
      if (!w.sea[i]) {
        const pa = BIOME[w.regK[w.region[i]]], pb = BIOME[w.regK[w.region2[i]]], tn = cl((fbm(x / 18, y / 18, w.seed + 66, 4) - .3) / .4);
        const ca = mix3(pa[0], pa[1], tn), cb = mix3(pb[0], pb[1], tn);
        c3 = mix3(mix3(cb, ca, w.w1[i]), c3, .14);
        c3 = mix3(c3, [158, 124, 82], cl((w.h[i] - .3) / .3) * .45);
      }
      const dx = w.h[Math.min(N - 1, i + 1)] - w.h[Math.max(0, i - 1)], dy = w.h[Math.min(N - 1, i + GW)] - w.h[Math.max(0, i - GW)], sh = cl(.5 + (dx - dy) * 2.5) - .5;
      d[p] = c3[0] - sh * 60; d[p + 1] = c3[1] - sh * 60; d[p + 2] = c3[2] - sh * 56; d[p + 3] = 255;
    }
    g.putImageData(im, 0, 0); og.putImageData(om, 0, 0);
    return { land: c, ocean };
  }

  // ---------- glyph sprites ----------
  function makeSprites() {
    const R = rng(77), out = { broad: [], pine: [], snowpine: [], hill: [], dune: [], cactus: [], dead: [], tuft: [], ice: [], mesa: [], lava: [], flower: [], crystal: [], pond: [], rod: [], shard: [] };
    const greens = [[[78, 112, 44], [122, 152, 62], [52, 80, 34]], [[92, 122, 46], [142, 164, 70], [62, 88, 36]], [[66, 102, 46], [108, 142, 60], [44, 72, 32]]];
    for (let v = 0; v < 9; v++) {
      const pal = greens[v % 3];
      out.broad.push(sprite(44, 46, (g) => {
        const cs = []; const n = 5 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) cs.push([22 + (R() - .5) * 18, 18 + (R() - .5) * 13, 7 + R() * 3.5]);
        g.fillStyle = INK; g.fillRect(20, 28, 4, 12);
        g.fillStyle = INK; for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r + 1.7, 0, TAU); g.fill(); }
        g.fillStyle = rgba(pal[2], 1); for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
        g.fillStyle = rgba(pal[0], 1); for (const [x, y, r] of cs) { g.beginPath(); g.arc(x - 1.2, y - 1.6, r * .86, 0, TAU); g.fill(); }
        g.fillStyle = rgba(pal[1], 1); for (const [x, y, r] of cs) { g.beginPath(); g.arc(x - 2.6, y - 3.2, r * .46, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(30,25,12,.45)'; for (let i = 0; i < 10; i++) g.fillRect(14 + R() * 18, 16 + R() * 14, 1, 1);
      }));
      for (const snowy of [false, true]) (snowy ? out.snowpine : out.pine).push(sprite(32, 50, (g) => {
        const tiers = 3 + Math.floor(R() * 2), top = 4 + R() * 3;
        g.fillStyle = INK; g.fillRect(14.5, 41, 3, 7);
        for (let k = tiers - 1; k >= 0; k--) {
          const t0 = top + (k / tiers) * 28, t1 = top + ((k + 1.45) / tiers) * 28, hw = 5.5 + (k + 1) * 3.1;
          const tri = () => { g.beginPath(); g.moveTo(16, t0); g.lineTo(16 + hw, t1); g.lineTo(16 + hw * .45, t1 - 2); g.lineTo(16, t1 + 1); g.lineTo(16 - hw * .45, t1 - 2); g.lineTo(16 - hw, t1); g.closePath(); };
          tri(); g.fillStyle = 'rgb(44,70,42)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
          g.save(); tri(); g.clip(); g.fillStyle = 'rgba(82,116,60,.95)'; g.fillRect(16 - hw - 1, t0, hw + .5, t1 - t0 + 3); if (snowy) { g.fillStyle = '#eef0ec'; g.fillRect(16 - hw, t0, hw * 2, (t1 - t0) * .42); } g.restore();
        }
      }));
      out.hill.push(sprite(60, 28, (g) => {
        g.lineWidth = 1.7; g.strokeStyle = INK;
        const hw = 18 + R() * 7, px = 30 + (R() - .5) * 8;
        g.beginPath(); g.moveTo(px - hw, 25); g.quadraticCurveTo(px, -8 + R() * 8, px + hw, 25); g.fillStyle = 'rgba(160,132,76,.72)'; g.fill(); g.stroke();
        g.beginPath(); g.moveTo(px + 3, 8); g.quadraticCurveTo(px + hw * .45, 15, px + hw * .55, 23); g.lineWidth = 1.1; g.strokeStyle = 'rgba(42,32,21,.7)'; g.stroke();
        for (let i = 0; i < 6; i++) { g.beginPath(); const a = px + 5 + i * 3, b = 13 + i * 1.6; g.moveTo(a, b); g.lineTo(a + 1.5, b + 5); g.stroke(); }
      }));
      out.dune.push(sprite(72, 30, (g) => {
        const hw = 26 + R() * 8, top = 3 + R() * 6, tilt = (R() - .5) * 8;
        g.beginPath(); g.moveTo(36 - hw, 26); g.quadraticCurveTo(30 + tilt, top - 6, 36 + hw, 26); g.quadraticCurveTo(38 + tilt, 14, 36 - hw, 26); g.closePath(); g.fillStyle = 'rgba(183,146,84,.75)'; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(36 - hw, 26); g.quadraticCurveTo(30 + tilt, top - 6, 36 + hw, 26); g.stroke();
        g.fillStyle = 'rgba(42,32,21,.6)'; for (let i = 0; i < 26; i++) { const t = R(); g.fillRect(36 - hw * .2 + t * hw * 1.05, 22 - (1 - t) * 13 + R() * 6, 1.1, 1.1); }
      }));
      out.cactus.push(sprite(22, 34, (g) => { g.strokeStyle = INK; g.lineWidth = 5.4; const arm = () => { g.beginPath(); g.moveTo(11, 32); g.lineTo(11, 5); g.moveTo(11, 20); g.lineTo(4, 20); g.lineTo(4, 12); g.moveTo(11, 16); g.lineTo(18, 16); g.lineTo(18, 9); g.stroke(); }; arm(); g.strokeStyle = 'rgb(106,134,62)'; g.lineWidth = 3; arm(); }));
      out.dead.push(sprite(32, 36, (g) => { g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); g.moveTo(16, 34); g.lineTo(16, 16); g.lineTo(9, 7); g.moveTo(16, 20); g.lineTo(25, 10); g.moveTo(13, 12); g.lineTo(7, 14); g.moveTo(20, 15); g.lineTo(26, 18); g.stroke(); }));
      out.tuft.push(sprite(34, 20, (g) => { g.strokeStyle = 'rgba(58,76,40,.92)'; g.lineWidth = 1.4; for (let i = 0; i < 6; i++) { g.beginPath(); const x = 7 + i * 4 + R() * 2; g.moveTo(x, 15); g.lineTo(x + (R() - .5) * 7, 4 + R() * 5); g.stroke(); } g.strokeStyle = 'rgba(52,96,110,.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(3, 17); g.quadraticCurveTo(10, 15, 17, 17); g.quadraticCurveTo(24, 19, 31, 17); g.stroke(); }));
      out.ice.push(sprite(36, 44, (g) => { const hw = 7 + R() * 5, top = 5 + R() * 8, lean = (R() - .5) * 8; g.beginPath(); g.moveTo(18 + lean, top); g.lineTo(18 + hw, 40); g.lineTo(18 - hw, 40); g.closePath(); g.fillStyle = '#cfe4ec'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#2f3e48'; g.stroke(); g.beginPath(); g.moveTo(18 + lean, top); g.lineTo(18 + hw * .25, 40); g.lineTo(18 + hw, 40); g.closePath(); g.fillStyle = '#8fb7c8'; g.fill(); g.stroke(); }));
      out.mesa.push(sprite(72, 50, (g) => { const w = 22 + R() * 10, h = 24 + R() * 16, x = 36; g.beginPath(); g.moveTo(x - w, 46); g.lineTo(x - w * .68, 46 - h); g.lineTo(x + w * .68, 46 - h); g.lineTo(x + w, 46); g.closePath(); g.fillStyle = '#b86c3e'; g.fill(); g.lineWidth = 1.8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.3; g.strokeStyle = 'rgba(70,34,14,.7)'; for (const f of [.3, .62]) { g.beginPath(); g.moveTo(x - w + f * w * .32, 46 - h * f); g.lineTo(x + w - f * w * .32, 46 - h * f); g.stroke(); } }));
      out.lava.push(sprite(64, 26, (g) => { const rx = 20 + R() * 8; g.beginPath(); g.ellipse(32, 14, rx + 4, 9, 0, 0, TAU); g.fillStyle = '#2a1410'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); g.beginPath(); g.ellipse(32, 14, rx, 6, 0, 0, TAU); g.fillStyle = '#f07a2e'; g.fill(); g.beginPath(); g.ellipse(30, 13, rx * .55, 3, 0, 0, TAU); g.fillStyle = '#ffd36b'; g.fill(); }));
      out.flower.push(sprite(34, 26, (g) => { const cols = ['#e27aa8', '#f2c14a', '#a26be0', '#f0f0d8']; for (let i = 0; i < 4; i++) { const x = 7 + i * 7, y = 8 + R() * 10; g.strokeStyle = 'rgb(62,110,44)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, 25); g.lineTo(x, y); g.stroke(); g.fillStyle = cols[Math.floor(R() * cols.length)]; g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); } }));
      out.crystal.push(sprite(36, 46, (g) => { for (const [x, w, h, l] of [[12, 5, 20 + R() * 10, 2], [24, 7, 30 + R() * 12, -3]]) { g.beginPath(); g.moveTo(x + l, 44 - h); g.lineTo(x + w, 40); g.lineTo(x - w, 40); g.closePath(); g.fillStyle = '#d85cc0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); g.beginPath(); g.moveTo(x + l, 44 - h); g.lineTo(x + w, 40); g.lineTo(x + w * .15, 40); g.closePath(); g.fillStyle = '#8f2d86'; g.fill(); g.stroke(); } }));
      out.pond.push(sprite(64, 24, (g) => { g.beginPath(); g.ellipse(32, 12, 22 + R() * 8, 7 + R() * 3, 0, 0, TAU); g.fillStyle = '#6da3b8'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke(); }));
      out.rod.push(sprite(22, 50, (g) => { g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(11, 48); g.lineTo(11, 8); g.stroke(); g.lineWidth = 1.8; g.beginPath(); g.moveTo(5, 16); g.lineTo(17, 16); g.stroke(); g.fillStyle = '#e8cf52'; g.beginPath(); g.arc(11, 6, 3.6, 0, TAU); g.fill(); g.lineWidth = 1.2; g.stroke(); }));
      out.shard.push(sprite(46, 30, (g) => { g.beginPath(); g.moveTo(5, 28); g.lineTo(13, 8 + R() * 6); g.lineTo(23, 16); g.lineTo(32, 3 + R() * 6); g.lineTo(42, 28); g.closePath(); g.fillStyle = '#6c6880'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.7; g.stroke(); }));
    }
    return out;
  }

  function stamp(g, img, x, y, s = 1) { g.drawImage(img, x - img.width * s / 2, y - img.height * s, img.width * s, img.height * s); }

  function drawPeak(g, x, y, w, ht, tone, snow, r) {
    const peak = [x + (r() - .5) * w * .12, y - ht];
    const side = (dir) => { const pts = [], n = 5; for (let i = 1; i < n; i++) { const t = i / n; pts.push([mix(peak[0], x + dir * w / 2, t) + (r() - .5) * w * .07, mix(peak[1], y, Math.pow(t, .9)) + (r() - .5) * ht * .07]); } pts.push([x + dir * w / 2, y]); return pts; };
    const L = side(-1), Rr = side(1), ridge = [peak]; { const n = 5; let rx = peak[0]; for (let i = 1; i <= n; i++) { rx += (i % 2 ? 1 : -1) * w * (.05 + r() * .05) + w * .018; ridge.push([rx, mix(peak[1], y, i / n)]); } }
    const face = (edge) => { g.beginPath(); g.moveTo(peak[0], peak[1]); for (const p of edge) g.lineTo(p[0], p[1]); for (let i = ridge.length - 1; i > 0; i--) g.lineTo(ridge[i][0], ridge[i][1]); g.closePath(); };
    const grad = (c) => { const G = g.createLinearGradient(0, y - ht, 0, y + 3); G.addColorStop(0, rgba(c, 1)); G.addColorStop(.72, rgba(c, 1)); G.addColorStop(1, rgba(c, 0)); return G; };
    face(L); g.fillStyle = grad(tone.lit); g.fill();
    face(Rr); g.fillStyle = grad(tone.dark); g.fill();
    if (snow) {
      const line = y - ht * (.5 + r() * .12);
      const cap = () => { g.beginPath(); g.moveTo(peak[0], peak[1]); for (const p of L) g.lineTo(p[0], p[1]); for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]); g.closePath(); };
      g.save(); cap(); g.clip();
      g.beginPath(); g.moveTo(x - w, y - ht * 1.3); g.lineTo(x + w, y - ht * 1.3); g.lineTo(x + w, line);
      for (let t = 1; t >= -1; t -= .16) g.lineTo(x + t * w * .7, line + (Math.round(t * 6.25) % 2 ? ht * .1 : -ht * .06));
      g.closePath(); g.fillStyle = '#f2f0e8'; g.fill();
      g.restore();
    }
    // hatching on the shaded face
    g.strokeStyle = 'rgba(38,26,14,.62)'; g.lineWidth = 1;
    const count = Math.round(w / 8);
    for (let i = 0; i < count; i++) { const t = .08 + r() * .78, a = ridge[Math.min(ridge.length - 1, Math.floor(t * (ridge.length - 1)))], b = a[0] + 2 + r() * w * .05, c = a[1] + r() * 5, len = w * (.08 + r() * .16); g.beginPath(); g.moveTo(b, c); g.lineTo(b + len * .75, c + len * 1.05); g.stroke(); }
    // ink
    g.strokeStyle = INK; g.lineWidth = 1.9; g.beginPath(); g.moveTo(L[L.length - 1][0], L[L.length - 1][1]); for (let i = L.length - 2; i >= 0; i--) g.lineTo(L[i][0], L[i][1]); g.lineTo(peak[0], peak[1]); for (const p of Rr) g.lineTo(p[0], p[1]); g.stroke();
    g.lineWidth = 1.3; g.beginPath(); g.moveTo(ridge[0][0], ridge[0][1]); for (let i = 1; i < ridge.length - 1; i++) g.lineTo(ridge[i][0], ridge[i][1]); g.stroke();
    g.fillStyle = 'rgba(38,26,14,.5)'; for (let i = 0; i < w * .35; i++) g.fillRect(x + (r() - .3) * w * .55, y - r() * ht * .22, 1.2, 1.2);
  }
  const TONE = { storm: { lit: [146, 142, 172], dark: [82, 78, 112] }, moss: { lit: [158, 170, 114], dark: [92, 108, 68] }, arc: { lit: [176, 140, 190], dark: [98, 66, 124] }, rock: { lit: [205, 170, 118], dark: [130, 92, 54] }, ash: { lit: [138, 118, 110], dark: [78, 62, 60] }, cold: { lit: [186, 180, 168], dark: [112, 108, 106] } };

  function drawVolcano(g, x, y, w, r) {
    const ht = w * .72, rim = w * .13, top = y - ht;
    const body = () => { g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * .28, y - ht * .35, x - rim, top); g.lineTo(x + rim, top); g.quadraticCurveTo(x + w * .28, y - ht * .35, x + w / 2, y); };
    body(); const G = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); G.addColorStop(0, '#6e5a52'); G.addColorStop(.55, '#54423e'); G.addColorStop(1, '#2f2628'); g.fillStyle = G; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
    g.fillStyle = '#ffb648'; g.beginPath(); g.ellipse(x, top, rim, rim * .34, 0, 0, TAU); g.fill(); g.lineWidth = 1.8; g.stroke();
    g.lineCap = 'round';
    for (const sgn of [-1, .35, 1]) { g.strokeStyle = '#2a1410'; g.lineWidth = 5; const trail = () => { g.beginPath(); g.moveTo(x + sgn * rim * .5, top + 2); g.quadraticCurveTo(x + sgn * w * .12, y - ht * .5, x + sgn * w * .24, y - 8); }; trail(); g.stroke(); g.strokeStyle = sgn === .35 ? '#ffb648' : '#ee6a2a'; g.lineWidth = 2.6; trail(); g.stroke(); }
    const puffs = []; let sy = top - 8, sx = x, rad = w * .06;
    for (let i = 0; i < 7; i++) { puffs.push([sx, sy, rad]); sy -= rad * 1.05; sx += (r() - .25) * w * .09; rad *= 1.12; }
    for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a, b, c + 1.8, 0, TAU); g.fillStyle = INK; g.fill(); }
    for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a, b, c, 0, TAU); g.fillStyle = '#a9a39b'; g.fill(); }
    for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a - c * .22, b - c * .28, c * .55, 0, TAU); g.fillStyle = '#d6d0c6'; g.fill(); }
  }

  // ---------- settlements ----------
  function wallRect(g, x, y, w, h, fill = '#e8e0cc') { g.fillStyle = fill; g.fillRect(x, y - h, w, h); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x, y - h, w, h); }
  function house(g, x, y, w, h, roof) { wallRect(g, x, y, w, h); g.beginPath(); g.moveTo(x - 2, y - h); g.lineTo(x + w / 2, y - h - w * .62); g.lineTo(x + w + 2, y - h); g.closePath(); g.fillStyle = roof; g.fill(); g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.fillRect(x + w / 2 - 1.3, y - h * .55, 2.6, h * .55); }
  function tower(g, x, y, w, h, roof) { wallRect(g, x, y, w, h); g.beginPath(); g.moveTo(x - 2.4, y - h); g.lineTo(x + w / 2, y - h - w * 1.05); g.lineTo(x + w + 2.4, y - h); g.closePath(); g.fillStyle = roof; g.fill(); g.strokeStyle = INK; g.stroke(); g.fillStyle = INK; g.fillRect(x + w / 2 - 1, y - h * .72, 2, 4.5); }
  function crenel(g, x, y, w, h) { wallRect(g, x, y, w, h, '#d9d0b8'); const n = Math.round(w / 7); g.fillStyle = '#d9d0b8'; g.strokeStyle = INK; g.lineWidth = 1.2; for (let i = 0; i < n; i++) { const bx = x + (i + .15) * (w / n); g.fillRect(bx, y - h - 3.5, (w / n) * .55, 4); g.strokeRect(bx, y - h - 3.5, (w / n) * .55, 4); } }
  function settlement(g, tier, x, y, roof, s = 1) {
    g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
    if (tier === 'hamlet') { house(g, -10, 0, 20, 10, roof); }
    else if (tier === 'town') { tower(g, -18, -3, 10, 20, roof); house(g, -9, 0, 18, 12, roof); house(g, 7, -3, 16, 11, roof); }
    else if (tier === 'fort') { tower(g, -22, 0, 11, 26, roof); crenel(g, -12, 0, 26, 15); tower(g, 12, 0, 11, 22, roof); }
    else if (tier === 'city') { crenel(g, -34, 0, 68, 11); tower(g, -36, -1, 13, 34, roof); tower(g, 23, -1, 13, 34, roof); house(g, -21, -9, 19, 13, roof); house(g, 3, -9, 19, 14, roof); tower(g, -6, -9, 12, 32, roof); }
    else if (tier === 'academy') {
      crenel(g, -48, 0, 96, 14); tower(g, -52, -1, 16, 42, roof); tower(g, 36, -1, 16, 42, roof);
      tower(g, -28, -11, 15, 40, roof); tower(g, 13, -11, 15, 40, roof);
      wallRect(g, -13, -9, 26, 58); g.beginPath(); g.moveTo(-15, -67); g.quadraticCurveTo(0, -103, 15, -67); g.closePath(); g.fillStyle = '#c13c96'; g.fill(); g.strokeStyle = INK; g.stroke(); g.beginPath(); g.moveTo(0, -94); g.lineTo(0, -118); g.stroke(); g.beginPath(); g.fillStyle = '#ffd98a'; g.arc(0, -120, 4.5, 0, TAU); g.fill(); g.stroke(); g.fillStyle = INK; g.fillRect(-3.5, -44, 7, 12); g.fillRect(-2, -30, 4, 10);
    }
    else if (tier === 'shrine') { for (const px of [-8, 3]) { g.fillStyle = '#c9c1aa'; g.fillRect(px, -16, 6, 16); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(px, -16, 6, 16); } g.fillStyle = '#d9d0b8'; g.fillRect(-10, -20, 21, 4.5); g.strokeRect(-10, -20, 21, 4.5); g.fillStyle = roof; g.beginPath(); g.arc(.5, -8, 2.8, 0, TAU); g.fill(); }
    g.restore();
  }
  const FOOT = { hamlet: [-13, 14, -18, 3], town: [-25, 26, -32, 3], fort: [-25, 26, -38, 3], city: [-40, 40, -50, 3], academy: [-58, 58, -125, 4] };

  // ---------- lettering ----------
  function arcText(g, text, x, y, opts) {
    const { font, spacing = 0, curve = 0, angle = 0, fill = INK, stroke = null, strokeW = 3 } = opts;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const cs = [...text], ws = cs.map((c) => g.measureText(c).width + spacing), total = ws.reduce((a, b) => a + b, 0) - spacing;
    g.save(); g.translate(x, y); g.rotate(angle);
    let run = -total / 2;
    const place = (paint) => {
      run = -total / 2;
      const Rc = curve ? (total / 2) / Math.sin(Math.abs(curve)) : 0, sgn = Math.sign(curve);
      cs.forEach((c, i) => { const mid = run + (ws[i] - spacing) / 2, an = curve ? Math.asin(Math.max(-1, Math.min(1, mid / Rc))) : 0, oy = curve ? sgn * Rc * (1 - Math.cos(an)) : 0; g.save(); g.translate(mid, oy); g.rotate(sgn * an); paint(c); g.restore(); run += ws[i]; });
    };
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = strokeW; place((c) => g.strokeText(c, 0, 0)); }
    g.fillStyle = fill; place((c) => g.fillText(c, 0, 0));
    g.restore();
  }
  function banner(g, x, y, w, h, text, font) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    const tail = (dir) => { const hw = w / 2; g.beginPath(); g.moveTo(dir * (hw - 4), -h * .18); g.lineTo(dir * (hw + 22), -h * .1); g.lineTo(dir * (hw + 12), h * .35); g.lineTo(dir * (hw + 24), h * .82); g.lineTo(dir * (hw - 4), h * .62); g.closePath(); g.fillStyle = '#c9b184'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); };
    tail(-1); tail(1);
    g.beginPath(); g.moveTo(-w / 2, -h / 2); g.quadraticCurveTo(0, -h * .78, w / 2, -h / 2); g.lineTo(w / 2, h / 2); g.quadraticCurveTo(0, h * .22, -w / 2, h / 2); g.closePath(); g.fillStyle = '#ecdfbd'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
    arcText(g, text, 0, -h * .08, { font, curve: .1, fill: '#2a1a10', spacing: 1 });
    g.restore();
  }

  // ---------- sea life ----------
  function ship(g, x, y, s, flip, sailCol) {
    g.save(); g.translate(x, y); g.scale(flip ? -s : s, s); g.lineJoin = 'round';
    g.strokeStyle = 'rgba(236,240,232,.55)'; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-50 + i * 7, 12 + i * 5); g.quadraticCurveTo(-20, 7 + i * 5, 0, 12 + i * 5); g.quadraticCurveTo(25, 17 + i * 5, 54 - i * 8, 12 + i * 5); g.stroke(); }
    g.beginPath(); g.moveTo(-46, -6); g.lineTo(-40, -14); g.lineTo(-26, -13); g.lineTo(-22, -5); g.lineTo(26, -5); g.lineTo(42, -14); g.quadraticCurveTo(38, 12, 24, 13); g.lineTo(-34, 13); g.quadraticCurveTo(-44, 8, -46, -6); g.closePath(); g.fillStyle = '#6e4326'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#c8a06a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-38, 1); g.lineTo(34, 1); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2.2; for (const [mx, top] of [[-22, -62], [4, -74], [28, -54]]) { g.beginPath(); g.moveTo(mx, -5); g.lineTo(mx, top); g.stroke(); }
    const sail = (mx, t, b, hw) => { g.beginPath(); g.moveTo(mx - hw, t); g.quadraticCurveTo(mx + hw * .6, (t + b) / 2, mx - hw, b); g.lineTo(mx + hw, b); g.quadraticCurveTo(mx + hw * 1.5, (t + b) / 2, mx + hw, t); g.closePath(); g.fillStyle = sailCol; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); };
    sail(-22, -56, -34, 12); sail(-22, -32, -11, 14); sail(4, -68, -44, 13); sail(4, -42, -13, 16); sail(28, -49, -30, 10); sail(28, -28, -10, 12);
    g.beginPath(); g.moveTo(4, -74); g.lineTo(18, -79); g.lineTo(4, -82); g.closePath(); g.fillStyle = '#a43a8a'; g.fill(); g.lineWidth = 1.2; g.stroke();
    g.restore();
  }
  function serpent(g, x, y, s, flip) {
    g.save(); g.translate(x, y); g.scale(flip ? -s : s, s); g.lineJoin = 'round'; g.lineCap = 'round';
    const hump = (cx, r) => { g.beginPath(); g.arc(cx, 8, r, Math.PI, 0); g.lineWidth = r * .62 + 3.6; g.strokeStyle = INK; g.stroke(); g.lineWidth = r * .62; g.strokeStyle = '#4f7a62'; g.stroke(); g.strokeStyle = 'rgba(214,226,190,.75)'; g.lineWidth = 1.4; for (let a = -2.7; a < -.5; a += .34) { g.beginPath(); g.moveTo(cx + Math.cos(a) * r * .8, 8 + Math.sin(a) * r * .8); g.lineTo(cx + Math.cos(a) * r * 1.2, 8 + Math.sin(a) * r * 1.2); g.stroke(); } };
    hump(-50, 13); hump(-10, 18); hump(36, 13);
    g.beginPath(); g.moveTo(58, 10); g.quadraticCurveTo(62, -32, 72, -38); g.lineWidth = 13; g.strokeStyle = INK; g.stroke(); g.lineWidth = 9.4; g.strokeStyle = '#4f7a62'; g.stroke();
    g.beginPath(); g.moveTo(66, -46); g.quadraticCurveTo(84, -50, 96, -40); g.quadraticCurveTo(88, -33, 68, -32); g.closePath(); g.fillStyle = '#5c8a6e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#f3e7b0'; g.beginPath(); g.arc(77, -42, 2.6, 0, TAU); g.fill(); g.strokeStyle = 'rgba(236,240,232,.55)'; g.lineWidth = 1.4;
    for (const cx of [-50, -10, 36]) { g.beginPath(); g.ellipse(cx, 10, 24, 5, 0, 0, TAU); g.stroke(); }
    g.restore();
  }
  function kraken(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s); g.lineCap = 'round';
    for (const [dx, curl, top] of [[-44, -1, -42], [-16, 1, -58], [18, -1, -54], [46, 1, -40]]) {
      const arm = () => { g.beginPath(); g.moveTo(dx, 12); g.bezierCurveTo(dx + curl * 18, -10, dx - curl * 16, top + 10, dx + curl * 8, top); g.quadraticCurveTo(dx + curl * 19, top - 7, dx + curl * 15, top + 8); };
      arm(); g.strokeStyle = INK; g.lineWidth = 11; g.stroke(); arm(); g.strokeStyle = '#7c4a68'; g.lineWidth = 7.6; g.stroke();
    }
    g.strokeStyle = 'rgba(236,240,232,.55)'; g.lineWidth = 1.5; for (const dx of [-44, -16, 18, 46]) { g.beginPath(); g.ellipse(dx, 13, 17, 4, 0, 0, TAU); g.stroke(); }
    g.restore();
  }
  function whale(g, x, y, s, flip) {
    g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
    g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(-6, -8, -2, -26); g.quadraticCurveTo(-26, -34, -40, -24); g.quadraticCurveTo(-24, -18, -10, -8); g.moveTo(0, 12); g.quadraticCurveTo(6, -8, 2, -26); g.quadraticCurveTo(26, -34, 40, -24); g.quadraticCurveTo(24, -18, 10, -8);
    g.fillStyle = '#4a5b6a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.strokeStyle = 'rgba(236,240,232,.6)'; g.lineWidth = 1.5; for (let i = 0; i < 2; i++) { g.beginPath(); g.ellipse(0, 14 + i * 5, 24 + i * 12, 5 + i * 2, 0, 0, TAU); g.stroke(); }
    g.restore();
  }

  function compass(g, x, y, r) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.strokeStyle = INK; g.lineWidth = 2; g.fillStyle = 'rgba(239,228,200,.16)'; g.beginPath(); g.arc(0, 0, r * .62, 0, TAU); g.fill(); g.stroke(); g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, r * .56, 0, TAU); g.stroke();
    const star = (rot, len, width, a, b) => { for (let i = 0; i < 4; i++) { const t = rot + i * Math.PI / 2; g.save(); g.rotate(t); g.beginPath(); g.moveTo(0, -len); g.lineTo(width, -width * .4); g.lineTo(0, 0); g.closePath(); g.fillStyle = a; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.moveTo(0, -len); g.lineTo(-width, -width * .4); g.lineTo(0, 0); g.closePath(); g.fillStyle = b; g.fill(); g.stroke(); g.restore(); } };
    star(Math.PI / 4, r * .66, r * .1, '#7c1f1a', '#e9dcb6'); star(0, r, r * .15, '#2b1f16', '#b73a2b');
    g.beginPath(); g.fillStyle = '#e9dcb6'; g.arc(0, 0, r * .08, 0, TAU); g.fill(); g.lineWidth = 2; g.stroke();
    arcText(g, 'N', 0, -r - 20, { font: `700 ${r * .3}px ${F_REGION}`, fill: INK, stroke: 'rgba(239,228,200,.7)', strokeW: 4 });
    g.restore();
  }

  function frame(g) {
    const band = 34, o = 14;
    g.fillStyle = PAPER; g.fillRect(0, 0, W, o + band); g.fillRect(0, H - o - band, W, o + band); g.fillRect(0, 0, o + band, H); g.fillRect(W - o - band, 0, o + band, H);
    g.fillStyle = INK; const seg = 56;
    const nx = Math.floor((W - 2 * (o + band)) / seg), ny = Math.floor((H - 2 * (o + band)) / seg), sx = (W - 2 * (o + band)) / nx, sy = (H - 2 * (o + band)) / ny;
    for (let i = 0; i < nx; i++) if (i % 2 === 0) { g.fillRect(o + band + i * sx, o + 8, sx, 14); g.fillRect(o + band + i * sx, H - o - 22, sx, 14); }
    for (let i = 0; i < ny; i++) if (i % 2 === 0) { g.fillRect(o + 8, o + band + i * sy, 14, sy); g.fillRect(W - o - 22, o + band + i * sy, 14, sy); }
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(o, o, W - 2 * o, H - 2 * o);
    g.lineWidth = 2; g.strokeRect(o + 6, o + 6, W - 2 * o - 12, H - 2 * o - 12); g.strokeRect(o + band, o + band, W - 2 * (o + band), H - 2 * (o + band));
    g.lineWidth = 1; g.strokeRect(o + band + 5, o + band + 5, W - 2 * (o + band) - 10, H - 2 * (o + band) - 10);
    for (const [cx, cy] of [[o + band / 2, o + band / 2], [W - o - band / 2, o + band / 2], [o + band / 2, H - o - band / 2], [W - o - band / 2, H - o - band / 2]]) {
      g.fillStyle = PAPER; g.fillRect(cx - band / 2, cy - band / 2, band, band); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(cx - band / 2, cy - band / 2, band, band);
      g.fillStyle = '#b73a2b'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = i % 2 ? 4 : 12; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); g.lineWidth = 1.2; g.stroke();
    }
  }

  function mapKey(g, x, y, w, h, w_) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.fillStyle = '#e8dbb8'; g.fillRect(0, 0, w, h); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.lineWidth = 1.2; g.strokeRect(6, 6, w - 12, h - 12);
    g.save(); g.globalAlpha = .28; g.globalCompositeOperation = 'multiply'; g.drawImage(mottleTex, 0, 0, w, h); g.restore();
    banner(g, 112, 4, 150, 40, 'Map Key', `700 28px ${F_GOTH}`);
    const rows = [['academy', 'Academy', .46], ['city', 'City', .68], ['town', 'Town', .85], ['fort', 'Fort', .85], ['hamlet', 'Hamlet', 1], ['shrine', 'Shrine', 1.1]];
    rows.forEach(([tier, name, s], i) => {
      const cx = 58 + i * 78, cy = 96;
      settlement(g, tier, cx, cy, tier === 'academy' ? ROOF.arcane : ROOF.fire, s);
      arcText(g, name, cx, cy + 20, { font: `600 19px ${F_TOWN}`, fill: INK });
    });
    arcText(g, 'Roofs are coloured by the field a place stands on', w / 2, 146, { font: `italic 500 18px ${F_TOWN}`, fill: 'rgba(42,32,21,.8)' });
    FIELDS.forEach(([k, n], i) => {
      const cx = 44 + i * 67, cy = 178;
      g.fillStyle = ROOF[k]; g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 14, cy + 6); g.lineTo(cx, cy - 12); g.lineTo(cx + 14, cy + 6); g.closePath(); g.fill(); g.stroke();
      arcText(g, n, cx, cy + 20, { font: `600 16px ${F_TOWN}`, fill: INK });
    });
    g.restore();
  }

  // ---------- the painted chart ----------
  function drawChart(g, w, opts) {
    textures();
    const geo = geometry(w), base = paintBase(w), r = rng(w.seed * 31 + 5), sp = makeSprites();
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(base.ocean, 0, 0, W, H);
    const oceanClip = new Path2D(); oceanClip.rect(0, 0, W, H); oceanClip.addPath(geo.coastPath);

    // ocean: rhumb lines, wave marks
    const allT = w.academy ? [w.academy, ...w.towns] : w.towns;
    let cB = -1, cX = W / 2, cY = H / 2;
    for (let y = Math.floor(GH * .16); y < GH * .72; y += 2) for (let x = Math.floor(GW * .16); x < GW * .84; x += 2) { const i = idx(x, y); if (w.sea[i] && !(x > GW * .62 && y > GH * .6) && w.dLand[i] > cB) { cB = w.dLand[i]; cX = x * S; cY = y * S; } }
    const cR = Math.max(120, Math.min(175, cB * S * .5));
    g.save(); g.clip(oceanClip, 'evenodd');
    g.strokeStyle = 'rgba(30,48,58,.14)'; g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16; g.beginPath(); g.moveTo(cX, cY); g.lineTo(cX + Math.cos(a) * 2600, cY + Math.sin(a) * 2600); g.stroke(); }
    for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) for (let i = 0; i < 5; i++) { const a = Math.atan2(H / 2 - cy, W / 2 - cx) + (i - 2) * .28; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900); g.stroke(); }
    for (let i = 0; i < 22; i++) { g.strokeStyle = `rgba(14,32,42,${.045})`; g.lineWidth = 3 + i * 3.2; g.stroke(geo.coastPath); }
    g.strokeStyle = 'rgba(214,232,226,.2)'; g.lineWidth = 16; g.stroke(geo.coastPath);
    g.strokeStyle = 'rgba(214,232,226,.26)'; g.lineWidth = 7; g.stroke(geo.coastPath);
    for (let k = 0; k < 2600; k++) {
      const x = 2 + Math.floor(r() * (GW - 4)), y = 2 + Math.floor(r() * (GH - 4)), i = idx(x, y); if (!w.sea[i]) continue;
      const near = w.dLand[i] < 9 * K; if (!near && r() > .32) continue;
      const px = x * S + r() * S, py = y * S + r() * S, len = 7 + r() * 9; g.strokeStyle = near ? 'rgba(232,240,232,.34)' : 'rgba(232,240,232,.2)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px - len, py); g.quadraticCurveTo(px - len / 2, py - 4, px, py); g.quadraticCurveTo(px + len / 2, py + 4, px + len, py); g.stroke();
    }
    g.restore();

    // sea routes
    g.save(); g.setLineDash([.1, 11]); g.lineWidth = 3.6; g.strokeStyle = 'rgba(242,238,224,.66)';
    for (const p of w.routes) { const c = chaikin(p.map(([x, y]) => [x * S + S / 2, y * S + S / 2]), 3); g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (const q of c) g.lineTo(q[0], q[1]); g.stroke(); }
    g.restore();

    // land
    g.save(); g.clip(geo.coastPath);
    g.drawImage(base.land, 0, 0, W, H);
    if (opts.veil) drawVeil(g, w, opts.veil);
    const fm = mk(GW, GH), fg = fm.getContext('2d'), fi = fg.createImageData(GW, GH);
    for (let i = 0; i < N; i++) if (w.forest[i]) { fi.data[i * 4] = 46; fi.data[i * 4 + 1] = 66; fi.data[i * 4 + 2] = 36; fi.data[i * 4 + 3] = 150; }
    fg.putImageData(fi, 0, 0); g.drawImage(fm, 0, 0, W, H);
    for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(58,40,22,.05)'; g.lineWidth = 8 + i * 9; g.stroke(geo.coastPath); }
    g.strokeStyle = 'rgba(248,236,196,.22)'; g.lineWidth = 4; g.stroke(geo.coastPath);
    for (let k = 0; k < 2400; k++) { const x = 1 + Math.floor(r() * (GW - 2)), y = 1 + Math.floor(r() * (GH - 2)), i = idx(x, y); if (w.sea[i] || w.dSea[i] > 7 * K || r() < w.dSea[i] / (9 * K)) continue; g.fillStyle = 'rgba(52,38,24,.42)'; g.fillRect(x * S + r() * S, y * S + r() * S, 1.5, 1.5); }
    g.restore();

    g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(geo.coastPath);

    // lakes and rivers
    g.fillStyle = '#6f9eb0'; g.fill(geo.lakePath); g.strokeStyle = INK; g.lineWidth = 1.8; g.stroke(geo.lakePath);
    for (const path of w.paths) {
      const raw = path.pts.map(([x, y], i) => [x * S + S / 2 + (hash(x, y, w.seed) - .5) * S * .9, y * S + S / 2 + (hash(y, x, w.seed + 1) - .5) * S * .9, path.fl[i]]);
      const ch = chaikin(raw.map(([x, y]) => [x, y]), 2);
      const widthAt = (t) => { const f = raw[Math.min(raw.length - 1, Math.floor(t * raw.length))][2]; return 1.2 + Math.min(6.5, Math.sqrt(f / w.riverT) * 1.15); };
      for (const pass of [0, 1]) { g.strokeStyle = pass ? '#6a9bb0' : '#2a2a28'; for (let i = 1; i < ch.length; i++) { g.lineWidth = widthAt(i / ch.length) + (pass ? 0 : 2.2); g.beginPath(); g.moveTo(ch[i - 1][0], ch[i - 1][1]); g.lineTo(ch[i][0], ch[i][1]); g.stroke(); } }
    }

    // rifts and fissures
    for (const p of w.rifts) {
      const c = chaikin(p.map(([x, y]) => [x * S, y * S]), 1);
      const trace = () => { g.beginPath(); g.moveTo(c[0][0], c[0][1]); c.forEach((q, i) => g.lineTo(q[0] + (i % 2 ? 2.5 : -2.5), q[1])); };
      for (let i = 6; i > 0; i--) { trace(); g.strokeStyle = `rgba(190,70,160,${.06})`; g.lineWidth = i * 10; g.stroke(); }
      trace(); g.strokeStyle = '#1a0e1f'; g.lineWidth = 6; g.stroke(); trace(); g.strokeStyle = '#e66bc8'; g.lineWidth = 1.6; g.stroke();
    }
    for (const [vx, vy] of w.volc) for (let i = 0; i < 6; i++) { const a = r() * TAU, d0 = 8 + r() * 16; let x = vx * S + Math.cos(a) * d0, y = vy * S + Math.sin(a) * d0 * .7; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += Math.cos(a + (r() - .5)) * (8 + r() * 12); y += Math.sin(a + (r() - .5)) * (6 + r() * 10); g.lineTo(x, y); } g.strokeStyle = 'rgba(42,16,12,.85)'; g.lineWidth = 4; g.stroke(); g.strokeStyle = 'rgba(244,122,48,.95)'; g.lineWidth = 1.6; g.stroke(); }

    // roads
    g.save(); g.setLineDash([.1, 11]); g.lineWidth = 4.2; g.strokeStyle = 'rgba(46,32,18,.85)';
    for (const p of w.roads) { const sub = p.filter((_, i) => i % 3 === 0 || i === p.length - 1), c = chaikin(sub.map(([x, y]) => [x * S + S / 2, y * S + S / 2]), 2); g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (const q of c) g.lineTo(q[0], q[1]); g.stroke(); }
    g.restore();

    // keep-outs, then the glyph field
    const block = new Uint8Array(N); const mark = (x, y, rad, v = 1) => { const rr = Math.ceil(rad); for (let cy = Math.max(0, y - rr); cy <= Math.min(GH - 1, y + rr); cy++) for (let cx = Math.max(0, x - rr); cx <= Math.min(GW - 1, x + rr); cx++) if ((cx - x) ** 2 + (cy - y) ** 2 <= rad * rad) block[idx(cx, cy)] = Math.max(block[idx(cx, cy)], v); };
    const showT = opts.towns !== false;
    for (let i = 0; i < N; i++) if (w.onRoad[i]) mark(i % GW, (i / GW) | 0, 1);
    for (let i = 0; i < N; i++) if (w.river[i]) block[i] = Math.max(block[i], 1);
    for (const t of allT) mark(t.x, t.y, { academy: 18, city: 12, town: 8, fort: 8, hamlet: 5 }[t.tier], 2);
    for (const t of w.shrines) mark(t.x, t.y, 5, 2);
    for (const [x, y] of w.volc) mark(x, y, 12, 2);
    for (const p of w.rifts) for (const [x, y] of p) mark(Math.round(x), Math.round(y), 3, 1);

    const LM = (root.FieldLandmarks || []).filter((l) => !opts.cut || !opts.cut.has(l.id)), picked = [], lmUsed = {};
    const regionCells = w.sites.map(() => []), seaCells = [], pairCells = new Map();
    for (let i = 0; i < N; i++) { if (w.sea[i]) { if (i % 7 === 0) seaCells.push(i); continue; } if (w.w1[i] > .62) regionCells[w.region[i]].push(i); else { const key = [w.regK[w.region[i]], w.regK[w.region2[i]]].sort().join('|'); if (!pairCells.has(key)) pairCells.set(key, []); pairCells.get(key).push(i); } }
    const spotOk = (l, i) => {
      const x = i % GW, y = (i / GW) | 0, v = w.h[i]; if (y < GH * .18 || block[i] > 1 || (x > GW * .72 && y > GH * .8)) return false;
      if (l.place === 'coast') { if (w.sea[i] || w.lake[i] || w.dSea[i] > 4 * K || v > .3) return false; }
      else if (l.place === 'river') { if (!w.river[i] || v > .34) return false; }
      else if (l.place === 'high') { if (w.sea[i] || w.lake[i] || v < .38) return false; }
      else if (l.place === 'sea') { if (!w.sea[i] || w.dLand[i] < 14 * K || w.dLand[i] > 46 * K) return false; }
      else if (w.sea[i] || w.lake[i] || w.river[i] || v > .4) return false;
      return picked.every((p) => Math.hypot(p.x - x, p.y - y) > p.l.rad + l.rad + 6) && allT.every((t) => Math.hypot(t.x - x, t.y - y) > l.rad + 8);
    };
    const tryPlace = (l, cells) => { if (!cells || !cells.length) return false; for (let t = 0; t < 300; t++) { const i = cells[Math.floor(r() * cells.length)]; if (spotOk(l, i)) { const p = { l, x: i % GW, y: (i / GW) | 0 }; picked.push(p); mark(p.x, p.y, l.rad * .7, 2); lmUsed[l.id] = (lmUsed[l.id] || 0) + 1; return true; } } return false; };
    w.sites.map((s, j) => [s, j]).filter(([s]) => s.deep && s.y > GH * .12).sort((a, b) => b[0].n - a[0].n).forEach(([s, j]) => {
      let done = 0; const want = s.n > 7000 ? 3 : 2;
      for (const l of LM.filter((m) => m.k === s.k && !m.confluence && !lmUsed[m.id]).sort((a, b) => (lmUsed[a.id] || 0) - (lmUsed[b.id] || 0) + (r() - .5) * .2)) { if (done >= want) break; if (tryPlace(l, l.place === 'sea' ? seaCells : regionCells[j])) done++; }
    });
    for (const l of LM) if (l.confluence) tryPlace(l, pairCells.get([l.k, l.also].sort().join('|')));

    const items = [], add = (y, fn) => items.push([y, fn]);
    const occ = new Uint8Array(N);
    const peaks = []; for (let i = 0; i < N; i++) if (!w.sea[i] && !w.lake[i] && w.h[i] > .36) peaks.push(i);
    peaks.sort((a, b) => w.h[b] - w.h[a]);
    let placed = 0;
    for (const i of peaks) {
      if (occ[i] || block[i] > 1 || w.dSea[i] < 2 * K || placed > 1000) continue;
      const x = i % GW, y = (i / GW) | 0, v = w.h[i], big = v > .46, pw = big ? 92 + (v - .46) * 230 : 50 + (v - .36) * 260, wc = pw / S, rad = wc * (big ? .36 : .62), rr = Math.ceil(rad);
      for (let cy = Math.max(0, y - rr); cy <= Math.min(GH - 1, y + rr); cy++) for (let cx = Math.max(0, x - rr); cx <= Math.min(GW - 1, x + rr); cx++) if ((cx - x) ** 2 + (cy - y) ** 2 <= rad * rad) occ[idx(cx, cy)] = 1;
      if (y * S - pw * 1.1 < FRAME + 12) continue;
      placed++;
      const px = x * S + (r() - .5) * S * 2, py = y * S + S * .5 + (r() - .5) * S, cold = w.temp[i] < .34, ash = w.F.fire[i] > .6, fk = w.regK[w.region[i]], tone = ash || fk === 'fire' ? TONE.ash : cold || fk === 'cold' ? TONE.cold : fk === 'lightning' ? TONE.storm : fk === 'life' ? TONE.moss : fk === 'arcane' ? TONE.arc : TONE.rock, snow = !ash && (w.temp[i] < .26 || v > .93), seed2 = hash(x, y, w.seed + 5) * 1e9 + 1;
      add(py, (c) => drawPeak(c, px, py, pw, pw * (.82 + hash(x, y, 3) * .24), tone, snow, rng(seed2)));
    }
    const jit = () => (r() - .5) * S * 2;
    for (let y = 2; y < GH - 2; y += 3) for (let x = 2 + (y % 2 ? 1 : 0); x < GW - 2; x += 3) { const i = idx(x, y); if (!w.forest[i] || block[i] || occ[i] || y * S < FRAME + 62) continue; if (r() < .07) continue; const px = x * S + jit(), py = y * S + jit(), conifer = w.temp[i] < .44 + (hash(x, y, 9) - .5) * .08, snowy = w.temp[i] < .2, list = conifer ? (snowy ? sp.snowpine : sp.pine) : sp.broad, img = list[Math.floor(r() * list.length)], s = .92 + r() * .3; add(py, (c) => stamp(c, img, px, py, s)); }
    for (let y = 3; y < GH - 3; y += 6) for (let x = 3 + (y % 4 ? 3 : 0); x < GW - 3; x += 6) {
      const i = idx(x, y); if (w.sea[i] || w.lake[i] || block[i] || occ[i] || w.forest[i] || y * S < FRAME + 62) continue;
      const v = w.h[i], k = w.regK[w.region[i]], px = x * S + jit(), py = y * S + jit(), q = r();
      const put = (a, s) => { const img = a[Math.floor(r() * a.length)], sc = s + r() * .4; add(py, (c) => stamp(c, img, px, py, sc)); };
      if (v > .24 && v < .36 && k !== 'cold' && q < .5) { put(sp.hill, .9); continue; }
      if (k === 'cold') { if (w.temp[i] < .24 && q < .2) put(sp.ice, .85); else if (q < .42) put(sp.snowpine, .85); }
      else if (k === 'fire') { if (q < .15) put(sp.lava, .8); else if (q < .4) put(sp.dead, .85); else if (w.moist[i] < .4 && q < .78) put(sp.dune, .9); }
      else if (k === 'earth') { if (q < .14) put(sp.mesa, .7); else if (q < .5 && w.moist[i] < .42) put(sp.dune, .85); else if (q < .6) put(sp.cactus, .8); }
      else if (k === 'water') { if (q < .55) put(sp.tuft, .9); else if (q < .8) put(sp.pond, .9); }
      else if (k === 'lightning') { if (q < .24) put(sp.rod, .9); else if (q < .48) put(sp.shard, .9); else if (q < .62) put(sp.dead, .8); }
      else if (k === 'life') { if (q < .36) put(sp.flower, .9); else if (q < .62) put(sp.broad, .85); }
      else if (k === 'arcane') { if (q < .4) put(sp.crystal, .85); else if (q < .52) put(sp.dead, .75); }
    }
    for (let k = 0; k < 5000; k++) { const x = 3 + Math.floor(r() * (GW - 6)), y = 3 + Math.floor(r() * (GH - 6)), i = idx(x, y); if (w.sea[i] || w.lake[i] || block[i] || occ[i] || w.forest[i] || w.h[i] > .3 || w.temp[i] < .16 || ['cold', 'fire', 'arcane'].includes(w.regK[w.region[i]])) continue; const px = x * S + r() * S, py = y * S + r() * S, dry = w.moist[i] < .36; add(py - 1, (c) => { c.strokeStyle = dry ? 'rgba(112,88,44,.5)' : 'rgba(46,60,26,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px - 3, py); c.lineTo(px - 4, py - 4); c.moveTo(px, py); c.lineTo(px, py - 5.5); c.moveTo(px + 3, py); c.lineTo(px + 4, py - 4); c.stroke(); }); }
    for (const p of w.rifts) for (let k = 0; k < 9; k++) { const q = p[Math.floor(r() * p.length)], a = r() * TAU, d = 2 + r() * 5, px = (q[0] + Math.cos(a) * d) * S, py = (q[1] + Math.sin(a) * d) * S, s = 8 + r() * 12, lean = (r() - .5) * s * .7; add(py, (c) => { c.beginPath(); c.moveTo(px + lean, py - s * 2); c.lineTo(px + s * .55, py); c.lineTo(px - s * .55, py); c.closePath(); c.fillStyle = '#d85cc0'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); c.beginPath(); c.moveTo(px + lean, py - s * 2); c.lineTo(px + s * .55, py); c.lineTo(px + s * .12, py); c.closePath(); c.fillStyle = '#8f2d86'; c.fill(); c.stroke(); }); }
    for (const [x, y] of w.volc) { const px = x * S, py = y * S + 10, seed2 = hash(x, y, w.seed) * 1e9 + 1; add(py, (c) => drawVolcano(c, px, py, 138, rng(seed2))); }

    // settlements join the glyph field so peaks stand behind them
    const rects = [[W - FRAME - KEYW - 30, H - FRAME - KEYH - 30, W - FRAME, H - FRAME], [0, 0, W, H * .1]];
    for (const p of picked) { const px = p.x * S + S / 2, py = p.y * S + S / 2 + 6; rects.push([px - p.l.rad * 4, py - 110, px + p.l.rad * 4, py + 6]); }
    if (showT) for (const t of allT) { const px = t.x * S + S / 2, py = t.y * S + S / 2 + 8, f = FOOT[t.tier], roof = ROOF[t.ks[0]]; rects.push([px + f[0], py + f[2], px + f[1], py + f[3]]); add(py + .1, (c) => settlement(c, t.tier, px, py, roof)); }
    if (showT) for (const t of w.shrines) { const px = t.x * S, py = t.y * S; rects.push([px - 14, py - 20, px + 14, py + 3]); add(py, (c) => settlement(c, 'shrine', px, py, ROOF.arcane)); }
    for (const p of picked) { const px = p.x * S + S / 2, py = p.y * S + S / 2 + 6, seed2 = hash(p.x, p.y, w.seed + 9) * 1e9 + 1; add(py, (c) => { c.save(); c.translate(px, py); c.scale(.82, .82); c.lineJoin = 'round'; c.lineCap = 'round'; p.l.draw(c, rng(seed2)); c.restore(); }); }
    items.sort((a, b) => a[0] - b[0]);

    // storm clouds float above everything on the ground
    for (const [, fn] of items) fn(g);
    for (let y = 6; y < GH - 6; y += 18) for (let x = 6 + (y % 36 ? 9 : 0); x < GW - 6; x += 18) { const i = idx(x, y); if (w.sea[i] || y < GH * .12 || (w.regK[w.region[i]] !== 'lightning' && w.F.lightning[i] < .7) || w.w1[i] < .62 || r() > .62) continue; const px = x * S, py = y * S - 26, s = .8 + r() * .6, seed2 = hash(x, y, 2) * 1e9 + 1; cloud(g, px, py, s, rng(seed2)); }

    // the uncharted north: the land simply stops being known
    { const fade = mk(GW, GH), fc = fade.getContext('2d'), im = fc.createImageData(GW, GH); for (let y = 0; y < GH * .3; y++) for (let x = 0; x < GW; x++) { const a0 = cl(1.15 - (y / GH) / .17 + (fbm(x / 14, y / 14, w.seed + 70) - .5) * .9), a = a0 * a0 * (3 - 2 * a0), p = idx(x, y) * 4; im.data[p] = 240; im.data[p + 1] = 235; im.data[p + 2] = 222; im.data[p + 3] = a * 255; } fc.putImageData(im, 0, 0); g.drawImage(fade, 0, 0, W, H); }

    // the compass
    const layer = opts.layer || 'all', mainCtx = g, L = mk(W, H).getContext('2d'); L.lineCap = 'round'; L.lineJoin = 'round';
    compass(g, cX, cY - 26, cR);
    banner(L, cX, cY + cR + 14, 440, 80, 'Field Atlas', `700 58px ${F_GOTH}`);
    rects.push([cX - 250, cY - cR - 90, cX + 250, cY + cR + 62]);

    // lettering: big names first so towns can dodge them
    g = L;
    const rectHit = (a) => { let n = 0; for (const b of rects) { const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); if (ox > 0 && oy > 0) n += ox * oy; } return n; };
    const box = (text, font, spacing, x, y, ang, tall) => { g.font = font; const hw = (g.measureText(text).width + spacing * text.length) / 2 + 8, hh = tall, cs = Math.abs(Math.cos(ang)), sn = Math.abs(Math.sin(ang)), ex = hw * cs + hh * sn, ey = hw * sn + hh * cs; return [x - ex, y - ey, x + ex, y + ey]; };
    const offMap = (a) => a[0] < FRAME + 14 || a[2] > W - FRAME - 14 || a[1] < FRAME + 14 || a[3] > H - FRAME - 14 || (a[2] > W - FRAME - KEYW - 20 && a[3] > H - FRAME - KEYH - 20);
    const putName = (text, font, spacing, spots, ang, tall, style) => { for (const [x, y] of spots) { const b = box(text, font, spacing, x, y, ang, tall); if (offMap(b) || rectHit(b) > 900) continue; arcText(g, text, x, y, { font, spacing, angle: ang, ...style }); rects.push(b); return true; } return false; };
    arcText(g, 'U N C H A R T E D', W / 2, H * .062, { font: `italic 500 66px ${F_REGION}`, spacing: 18, curve: .1, fill: 'rgba(58,50,40,.6)', stroke: 'rgba(246,240,226,.8)', strokeW: 5 });
    if (w.sea[idx(w.rx * GW | 0, w.ry * GH | 0)]) putName(w.seaName, `500 58px ${F_REGION}`, 12, [[w.rx * W, w.ry * H], [w.rx * W, w.ry * H - 90], [w.rx * W, w.ry * H + 90], [w.rx * W - 130, w.ry * H], [w.rx * W + 130, w.ry * H]], 0, 34, { curve: .18, fill: 'rgba(232,240,232,.66)', stroke: 'rgba(24,44,56,.3)', strokeW: 3 });
    if (showT) {
      const clampAng = (a, m) => Math.max(-m, Math.min(m, a));
      w.chains.map((ch, i) => [ch, i]).sort((a, b) => b[0].length - a[0].length).forEach(([ch, i]) => { if (ch.length < 26) return; const p = ch[Math.floor(ch.length * .2)], q = ch[Math.floor(ch.length * .8)], m = ch[Math.floor(ch.length * .5)]; let a0 = Math.atan2(q[1] - p[1], q[0] - p[0]); if (a0 > Math.PI / 2) a0 -= Math.PI; if (a0 < -Math.PI / 2) a0 += Math.PI; const ang = clampAng(a0, .55), mx = m[0] * S, my = m[1] * S, nx = -Math.sin(ang), ny = Math.cos(ang); putName(w.chainNames[i].toUpperCase(), `600 40px ${F_REGION}`, 10, [40, 84, -54, 128, -100].map((d) => [mx + nx * d, my + ny * d]), ang, 25, { curve: .1, fill: 'rgba(38,24,12,.88)', stroke: 'rgba(246,234,204,.6)', strokeW: 6 }); });
      w.regions.slice().sort((a, b) => b.n - a.n).forEach((rg) => { const x = rg.x * S, y = rg.y * S; const onDark = ['fire', 'arcane', 'lightning'].includes(rg.k); putName(rg.name.toUpperCase(), `500 52px ${F_REGION}`, 15, [[0, 0], [0, -60], [0, 60], [-90, 0], [90, 0], [0, -120], [0, 120]].filter(([dx, dy]) => !w.sea[idx(Math.max(0, Math.min(GW - 1, Math.round((x + dx) / S))), Math.max(0, Math.min(GH - 1, Math.round((y + dy) / S))))]).map(([dx, dy]) => [x + dx, y + dy]), clampAng(rg.ang, .3), 32, { curve: .12, fill: onDark ? 'rgba(246,238,220,.86)' : 'rgba(40,26,14,.82)', stroke: onDark ? 'rgba(24,16,10,.55)' : 'rgba(246,234,204,.55)', strokeW: 6 }); });
      w.woods.slice(0, 8).forEach((wd) => { putName(wd.name, `italic 600 31px ${F_TOWN}`, 2, [[0, 0], [0, -40], [0, 40]].map(([dx, dy]) => [wd.x * S + dx, wd.y * S + dy]), clampAng(wd.ang, .25), 20, { curve: .1, fill: '#f4ecd2', stroke: 'rgba(24,32,14,.85)', strokeW: 5 }); });
    }

    if (showT) {
      const rank = { academy: 0, city: 1, fort: 2, town: 2, hamlet: 3 };
      for (const t of [...allT].sort((a, b) => rank[a.tier] - rank[b.tier])) {
        const px = t.x * S + S / 2, py = t.y * S + S / 2 + 8, f = FOOT[t.tier];
        if (t.tier === 'academy' || t.tier === 'city') {
          const bw = Math.max(170, t.name.length * (t.tier === 'academy' ? 24 : 20)), bh = t.tier === 'academy' ? 56 : 44, tx = Math.max(FRAME + bw / 2 + 30, Math.min(W - FRAME - bw / 2 - 30, px));
          const spots = [[tx, py + bh * .9], [tx, py + f[2] - bh * .7], [tx - 130, py + bh * .9], [tx + 130, py + bh * .9], [tx - 130, py + f[2] - bh * .7], [tx + 130, py + f[2] - bh * .7]].map(([x, y]) => [Math.max(FRAME + bw / 2 + 30, Math.min(W - FRAME - bw / 2 - 30, x)), Math.max(FRAME + bh, Math.min(H - FRAME - bh, y))]);
          let pick = spots[0], low = 1e12; for (const sp2 of spots) { const hit = rectHit([sp2[0] - bw / 2 - 20, sp2[1] - bh / 2 - 6, sp2[0] + bw / 2 + 20, sp2[1] + bh / 2 + 6]); if (hit < low - 300) { low = hit; pick = sp2; } }
          banner(g, pick[0], pick[1], bw, bh, t.name, `700 ${t.tier === 'academy' ? 42 : 32}px ${F_GOTH}`); rects.push([pick[0] - bw / 2 - 20, pick[1] - bh / 2 - 6, pick[0] + bw / 2 + 20, pick[1] + bh / 2 + 6]);
          continue;
        }
        const size = t.tier === 'hamlet' ? 28 : 33, font = `700 ${size}px ${F_TOWN}`; g.font = font; const tw = g.measureText(t.name).width + 6;
        const cands = [[px + f[1] + 6 + tw / 2, py - 12], [px + f[0] - 6 - tw / 2, py - 12], [px, py + 18], [px, py + f[2] - 16], [px + f[1] + tw / 2, py + 12], [px + f[0] - tw / 2, py + 12]];
        let best = cands[0], bs = 1e12;
        for (const c of cands) { const a = [c[0] - tw / 2, c[1] - size * .6, c[0] + tw / 2, c[1] + size * .6]; let s = rectHit(a); if (a[0] < FRAME + 12 || a[2] > W - FRAME - 12 || a[1] < FRAME + 12 || a[3] > H - FRAME - 12) s += 1e7; if (s < bs) { bs = s; best = c; } }
        arcText(g, t.name, best[0], best[1], { font, curve: (hash(t.x, t.y, 6) - .5) * .12, fill: '#f6eeda', stroke: '#23180f', strokeW: 5 });
        rects.push([best[0] - tw / 2, best[1] - size * .6, best[0] + tw / 2, best[1] + size * .6]);
      }
      for (const p of picked) { const px = p.x * S + S / 2, py = p.y * S + S / 2 + 6; putName(p.l.name, `italic 600 26px ${F_TOWN}`, 1, [[px, py + 26], [px, py - 126], [px - 120, py - 44], [px + 120, py - 44]], 0, 16, { curve: .08, fill: '#f4ecd2', stroke: 'rgba(24,18,10,.85)', strokeW: 4.5 }); }
    }

    g = mainCtx;

    // sea life, kept off the names
    const spots = [], free = (x, y, rad) => spots.every(([a, b, rr]) => Math.hypot(a - x, b - y) > rad + rr) && Math.hypot(cX / S - x, cY / S - y) > 60 * K / 1.54 + rad && !(x > GW * .66 && y > GH * .74);
    const seaSpot = (rad, minD) => { for (let t = 0; t < 900; t++) { const x = 26 + Math.floor(r() * (GW - 52)), y = 30 + Math.floor(r() * (GH - 56)), i = idx(x, y); if (w.sea[i] && w.dLand[i] > minD && free(x, y, rad) && rectHit([x * S - 80, y * S - 60, x * S + 80, y * S + 34]) === 0) { spots.push([x, y, rad]); return [x * S, y * S]; } } return null; };
    let at;
    if ((at = seaSpot(18, 10 * K))) ship(g, at[0], at[1], 1.05, at[0] > W / 2, '#efe6cc');
    if ((at = seaSpot(18, 10 * K))) ship(g, at[0], at[1], .9, at[0] < W / 2, '#d9bf99');
    if ((at = seaSpot(16, 8 * K))) serpent(g, at[0], at[1], .85, r() < .5);
    if ((at = seaSpot(14, 9 * K))) kraken(g, at[0], at[1], .78);
    if ((at = seaSpot(12, 9 * K))) whale(g, at[0], at[1], .8, r() < .5);


    if (layer === 'all') g.drawImage(L.canvas, 0, 0);

    // finish: paper, vignette, frame, key
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .55; g.drawImage(mottleTex, 0, 0, W, H); g.restore();
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(grainTex, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
    const V = g.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .95); V.addColorStop(0, 'rgba(30,20,8,0)'); V.addColorStop(1, 'rgba(30,20,8,.42)'); g.fillStyle = V; g.fillRect(0, 0, W, H);
    frame(g);
    const key = (ct) => { ct.save(); ct.translate(W - FRAME - KEYW, H - FRAME - KEYH); ct.scale(1.4, 1.4); mapKey(ct, 0, 0, 500, 226, w); ct.restore(); };
    if (layer === 'letters') { g.clearRect(0, 0, W, H); g.drawImage(L.canvas, 0, 0); key(g); } else if (layer === 'all') key(g);
    g.restore();
    return { peaks: placed, glyphs: items.length, landmarks: picked.map((p) => ({ id: p.l.id, k: p.l.k, looks: p.l.looks, atSea: p.l.place === 'sea', x: p.x / GW, y: p.y / GH })) };
  }
  function cloud(g, x, y, s, r) {
    g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
    const puffs = [[-22, 2, 13], [-6, -6, 17], [14, -3, 15], [28, 3, 10], [4, 6, 15]];
    g.beginPath(); g.moveTo(2, 12); g.lineTo(-7, 30); g.lineTo(2, 28); g.lineTo(-5, 50); g.lineTo(13, 22); g.lineTo(4, 24); g.lineTo(11, 12); g.closePath(); g.fillStyle = '#f3d65c'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.7; g.stroke();
    g.fillStyle = INK; for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a, b, c + 1.9, 0, TAU); g.fill(); }
    g.fillStyle = '#6e7486'; for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a, b, c, 0, TAU); g.fill(); }
    g.fillStyle = '#9aa0b0'; for (const [a, b, c] of puffs) { g.beginPath(); g.arc(a - 2, b - 4, c * .55, 0, TAU); g.fill(); }
    g.restore(); void r;
  }
  function drawVeil(g, w, show) {
    const c = mk(GW, GH), x = c.getContext('2d'), im = x.createImageData(GW, GH), hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)], cols = FIELDS.map(([k, , col]) => [k, hex(col)]);
    for (let i = 0; i < N; i++) { if (w.sea[i]) continue; let r = 0, gg = 0, b = 0, a = 0; for (const [k, col] of cols) { if (!show[k]) continue; const v = cl((w.F[k][i] - .45) / .25); if (v <= 0) continue; r += col[0] * v; gg += col[1] * v; b += col[2] * v; a += v; } if (a > 0) { const p = i * 4; im.data[p] = r / a; im.data[p + 1] = gg / a; im.data[p + 2] = b / a; im.data[p + 3] = Math.min(150, a * 110); } }
    x.putImageData(im, 0, 0); g.drawImage(c, 0, 0, W, H);
  }

  // ---------- the diagram ----------
  function drawFields(g, w, opts) {
    const geo = geometry(w);
    g.save(); g.fillStyle = '#d6dee3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#eceae3'; g.fill(geo.coastPath); g.save(); g.clip(geo.coastPath); drawVeil(g, w, opts.show); g.restore();
    const hex = Object.fromEntries(FIELDS.map(([k, , c]) => [k, c]));
    for (const [k] of FIELDS) { if (!opts.show[k]) continue; g.fillStyle = hex[k]; const f = w.F[k]; for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = idx(x, y); if (f[i] < .5 || (x + y) % 2) continue; if (f[i + 1] < .5 || f[i - 1] < .5 || f[i + GW] < .5 || f[i - GW] < .5) g.fillRect(x * S + S / 2 - 2, y * S + S / 2 - 2, 4, 4); } }
    g.strokeStyle = '#4a4f55'; g.lineWidth = 2.4; g.stroke(geo.coastPath); g.fillStyle = '#b5ccdc'; g.fill(geo.lakePath); g.stroke(geo.lakePath);
    g.strokeStyle = 'rgba(47,116,192,.9)'; g.lineCap = 'round'; for (const p of w.paths) { g.lineWidth = 2.4; g.beginPath(); p.pts.forEach(([x, y], i) => i ? g.lineTo(x * S + S / 2, y * S + S / 2) : g.moveTo(x * S + S / 2, y * S + S / 2)); g.stroke(); }
    if (opts.towns !== false) {
      g.textBaseline = 'middle'; g.textAlign = 'left';
      for (const t of (w.academy ? [w.academy, ...w.towns] : w.towns)) { const px = t.x * S, py = t.y * S; g.fillStyle = '#20262c'; g.beginPath(); g.arc(px, py, 9, 0, TAU); g.fill(); t.ks.forEach((k, j) => { g.fillStyle = hex[k]; g.beginPath(); g.arc(px, py, 6.2, t.ks.length > 1 ? (j ? 0 : Math.PI) : 0, t.ks.length > 1 ? (j ? Math.PI : TAU) : TAU); g.fill(); }); g.font = `600 ${t.tier === 'city' || t.tier === 'academy' ? 25 : 21}px ${F_REGION}`; g.lineWidth = 5; g.strokeStyle = 'rgba(245,245,240,.9)'; g.strokeText(t.kind || t.name, px + 13, py); g.fillStyle = '#20262c'; g.fillText(t.kind || t.name, px + 13, py); }
    }
    g.restore();
  }

  root.FieldChart = { W, H, drawChart, drawFields, ROOF };
})(window);
