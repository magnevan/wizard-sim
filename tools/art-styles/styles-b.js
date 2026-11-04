/* Styles 4-6: Chunky Pixel, Dark Painterly, Clear Signal (geometric). */
(function () {
  const { W, H, TAU, lerp, clamp, seg, rand, hexA, mix, ease } = AS;
  const { world, colorOf, hash, teardrop, blobPts, jit, iceFrontPath, polyPath, beamPts, strokePts, starPath, arrowShape } = AS.util;

  // =====================================================================
  // 4. CHUNKY PIXEL
  // =====================================================================
  const PX = 4, LW = W / PX, LH = H / PX;
  // Endesga 32 palette.
  const EDG = ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'];
  const PAL = EDG.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const nearCache = new Map();
  function nearest(r, g, b) {
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
    let v = nearCache.get(key);
    if (v !== undefined) return v;
    let best = 0, bd = 1e9;
    for (let i = 0; i < PAL.length; i++) { const p = PAL[i], d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11; if (d < bd) { bd = d; best = i; } }
    nearCache.set(key, best); return best;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 * 255);
  const OUT = PAL[25];
  // Snap a layer to the palette with hard alpha (or ordered-dither alpha), optional 1px outline.
  function quantize(c, mode, outline) {
    const x = c.getContext('2d', { willReadFrequently: true });
    const img = x.getImageData(0, 0, LW, LH), d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const a = d[i + 3];
      const th = mode === 'dither' ? BAYER[(p % LW & 3) + ((p / LW | 0) & 3) * 4] : 100;
      if (a <= th) { d[i + 3] = 0; continue; }
      const q = PAL[nearest(d[i], d[i + 1], d[i + 2])];
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = 255;
    }
    if (outline) {
      const al = new Uint8Array(LW * LH);
      for (let p = 0; p < al.length; p++) al[p] = d[p * 4 + 3];
      for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
        const p = y * LW + xx; if (al[p]) continue;
        if ((xx > 0 && al[p - 1]) || (xx < LW - 1 && al[p + 1]) || (y > 0 && al[p - LW]) || (y < LH - 1 && al[p + LW])) {
          d[p * 4] = OUT[0]; d[p * 4 + 1] = OUT[1]; d[p * 4 + 2] = OUT[2]; d[p * 4 + 3] = 255;
        }
      }
    }
    x.putImageData(img, 0, 0);
  }
  const layers = {};
  function layer(name) {
    if (!layers[name]) { const c = document.createElement('canvas'); c.width = LW; c.height = LH; layers[name] = c; }
    const c = layers[name], x = c.getContext('2d', { willReadFrequently: true });
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, LW, LH); x.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
    x.imageSmoothingEnabled = false; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    return [c, x];
  }
  const XP = {
    el: { fire: '#f77622', water: '#0099db', cold: '#2ce8f5', arcane: '#ff0044', shield: '#fee761' },
    p1: { robe: '#e43b44', trim: '#feae34', sleeve: '#a22633', hat: '#e43b44', band: '#feae34' },
    p2: { robe: '#0099db', trim: '#c0cbdc', sleeve: '#124e89', hat: '#0099db', band: '#c0cbdc' },
    wizard: { skin: '#e8b796', beard: '#ffffff', staff: '#b86f50', hand: '#e8b796' },
    goblin: { body: '#63c74d', belly: '#fee761', dark: '#265c42', club: '#b86f50' },
    archer: { body: '#63c74d', cloth: '#733e39', dark: '#265c42', bow: '#e4a672', string: '#c0cbdc', arrow: '#ead4aa', hand: '#63c74d' },
    brute: { body: '#be4a2f', belly: '#d77643', dark: '#733e39', horn: '#ead4aa', brow: '#181425' },
    imp: { body: '#b55088', wing: '#68386c', horn: '#fee761', tail: '#68386c' },
    common: { eye: '#181425', eyeWhite: '#ffffff', tooth: '#ffffff' },
  };
  const FONT = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
    '!': '010010010000010', W: '101101101111101', E: '111100110100111', T: '111010010010010', F: '111100110100100',
    R: '110101110101101', O: '010101101101010', Z: '111001010100111', N: '110101101101101', B: '110101110101110',
    L: '100100100100111', C: '011100100100011', K: '101101110101101', P: '110101110100100', ' ': '000000000000000',
  };
  function pxText(x, str, px, py, col, outline = '#181425') {
    const w = str.length * 4 - 1;
    const draw = (ox, oy, c) => {
      x.fillStyle = c;
      for (let k = 0; k < str.length; k++) { const g = FONT[str[k]] || FONT[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') x.fillRect(px + k * 4 + (i % 3) + ox, py + ((i / 3) | 0) + oy, 1, 1); }
    };
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) draw(ox, oy, outline);
    draw(0, 0, col);
    return w;
  }
  const ICON = {
    fire: '00100011100111011111' + '01110', water: '00100011101111111111' + '01110', cold: '10101011101111101110' + '10101',
    arcane: '00100011101111101110' + '00100', shield: '11111111111111101110' + '00100',
  };
  function pixelGround() {
    return AS.cached('px-ground', LW, LH, 1, (x) => {
      for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
        const r = rand(xx, y), lx = xx * PX, ly = y * PX;
        const pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        let c;
        if (Math.abs(ly - pathY) < 18 + rand(xx, 3) * 6) c = r < 0.12 ? '#c28569' : r < 0.2 ? '#ead4aa' : '#e4a672';
        else if (Math.abs(ly - pathY) < 24) c = r < 0.5 ? '#3e8948' : '#e4a672';
        else {
          const patch = Math.sin(xx * 0.21 + Math.sin(y * 0.3)) + Math.sin(y * 0.27 + xx * 0.07);
          c = patch > 1.1 ? '#265c42' : '#3e8948';
          if (r < 0.025) c = patch > 1.1 ? '#3e8948' : '#265c42';
        }
        x.fillStyle = c; x.fillRect(xx, y, 1, 1);
      }
      // grass tufts and flowers
      for (let i = 0; i < 40; i++) {
        const gx = Math.floor(rand(i, 11) * LW), gy = Math.floor(rand(i, 12) * LH);
        x.fillStyle = '#63c74d'; x.fillRect(gx, gy, 1, 2); x.fillRect(gx + 2, gy, 1, 2); x.fillRect(gx + 1, gy - 1, 1, 3);
      }
      for (let i = 0; i < 12; i++) { const fx = Math.floor(rand(i, 21) * LW), fy = Math.floor(rand(i, 22) * LH); x.fillStyle = i % 2 ? '#ffffff' : '#f6757a'; x.fillRect(fx, fy, 1, 1); }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        const cx = Math.round(rx / PX), cy = Math.round(ry / PX), r = Math.round(rr / PX);
        x.fillStyle = '#181425'; x.fillRect(cx - r - 1, cy - r + 1, 2 * r + 2, 2 * r - 1); x.fillRect(cx - r, cy - r, 2 * r, 2 * r + 1);
        x.fillStyle = '#5a6988'; x.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 1);
        x.fillStyle = '#8b9bb4'; x.fillRect(cx - r, cy - r + 1, 2 * r - 1, r);
        x.fillStyle = '#c0cbdc'; x.fillRect(cx - r + 1, cy - r + 1, 1, 1);
      }
    });
  }
  function pxActor(x, a) {
    const parts = world(a);
    x.globalAlpha = 1;
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (const { p, w } of parts) {
      const col = colorOf(XP, a, p.role);
      x.beginPath(); AS.partPath(x, p, w);
      if (p.line) { x.strokeStyle = col; x.lineWidth = Math.max(4, p.w * 1.4); x.stroke(); continue; }
      x.fillStyle = col; x.fill();
      if (p.big) { x.save(); x.clip(); x.fillStyle = mix(col, '#181425', 0.35); x.fillRect(a.x + (a.face > 0 ? 4 : -60), a.y - 90, 56, 100); x.restore(); }
    }
    if (a.hit > 0.4) { x.fillStyle = '#ffffff'; for (const { p, w } of parts) if (!p.line) { x.beginPath(); AS.partPath(x, p, w); x.fill(); } }
  }
  function pxEyes(fx, a) {
    // Explicit 1px eyes so faces survive the downscale.
    if (a.hit > 0.4 || a.alpha < 0.5) return;
    const f = AS.xf(a), eyes = { wizard: [[0, -33]], goblin: [[1.5, -25]], archer: [[2.5, -25]], brute: [[2, -54]], imp: [[1.5, -22]] }[a.kind];
    for (const e of eyes) { const [ex, ey] = f(e); fx.fillStyle = a.team === 'enemy' ? '#fee761' : '#181425'; fx.fillRect(Math.round(ex / PX), Math.round(ey / PX), 1, 1); }
  }
  function pixelRender(ctx, S, scale) {
    const t = S.t, E = XP.el;
    const [fin, f] = layer('final'); f.setTransform(1, 0, 0, 1, 0, 0);
    f.drawImage(pixelGround(), 0, 0);
    // decals: scorch, puddle, ice (hard alpha)
    const [dc, d] = layer('decal');
    const F = S.fire;
    d.beginPath(); polyPath(d, blobPts(F.x, F.y, F.rx, F.ry, 5, 20, 0.16)); d.fillStyle = '#3e2731'; d.fill();
    d.beginPath(); polyPath(d, blobPts(F.x, F.y + 2, F.rx * 0.7, F.ry * 0.6, 9, 16, 0.2)); d.fillStyle = '#733e39'; d.fill();
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 26, 0.1);
    d.beginPath(); polyPath(d, pud); d.fillStyle = '#124e89'; d.fill();
    d.beginPath(); polyPath(d, blobPts(P.x - 4, P.y - 3, P.rx - 6, P.ry - 6, 2, 26, 0.1)); d.fillStyle = '#0099db'; d.fill();
    d.save(); d.beginPath(); polyPath(d, pud); d.clip();
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; if (k > 0.7) continue; d.beginPath(); d.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); d.lineWidth = 4; d.strokeStyle = '#2ce8f5'; d.stroke(); }
    if (P.ice > 0.5 && P.front > 0) {
      d.beginPath(); iceFrontPath(d, P, 8); d.fillStyle = '#c0cbdc'; d.fill();
      d.save(); d.clip();
      d.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) d.fillRect(P.x - P.rx + rand(i, 71) * 2 * P.rx, P.y - P.ry + rand(i, 72) * 2 * P.ry, 12, 4);
      d.fillStyle = '#8b9bb4'; d.fillRect(P.x - P.rx, P.y + P.ry - 10, 2 * P.rx, 12);
      if (P.crack > 0) { d.strokeStyle = '#5a6988'; d.lineWidth = 4; d.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; d.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); d.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } d.stroke(); }
      d.restore();
    }
    d.restore();
    // ward floor ring
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    quantize(dc, 'binary', false);
    f.drawImage(dc, 0, 0);
    // fire tongues go behind actors (own layer so they get outlines too)
    const [ac, x] = layer('actors');
    for (const tg of S.tongues) { x.beginPath(); teardrop(x, tg.x, tg.y, tg.w, tg.h, tg.sway); x.fillStyle = '#e43b44'; x.fill(); }
    for (const tg of S.tongues) { x.beginPath(); teardrop(x, tg.x, tg.y - 1, tg.w * 0.6, tg.h * 0.62, tg.sway * 0.6); x.fillStyle = '#f77622'; x.fill(); }
    for (const tg of S.tongues) { x.beginPath(); teardrop(x, tg.x, tg.y - 2, tg.w * 0.3, tg.h * 0.32, tg.sway * 0.3); x.fillStyle = '#fee761'; x.fill(); }
    // shadows under actors on the decal level of the final image
    for (const a of S.actors) { const [r] = AS.SIZE[a.kind]; if (a.alpha < 0.5) continue; f.fillStyle = 'rgba(24,20,37,0.5)'; f.fillRect(Math.round((a.x - r * 0.8) / PX), Math.round(a.y / PX), Math.max(2, Math.round(r * 1.6 / PX)), 1); }
    for (const a of S.actors) {
      if (a.alpha < 0.5) continue;
      pxActor(x, a);
      if (a.frozen > 0.3) {
        // ice block: pale fill with the frozen body showing through as a darker icy silhouette
        const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * a.frozen;
        const bx = Math.round((a.x - r - 4) / PX) * PX, by = Math.round((a.y + 4 - hh) / PX) * PX, bw = Math.round((2 * r + 8) / PX) * PX, bh = Math.round(hh / PX) * PX;
        x.fillStyle = '#2ce8f5'; x.fillRect(bx, by, bw, bh);
        x.save(); x.beginPath(); x.rect(bx, by, bw, bh); x.clip();
        for (const { p, w } of world(a)) if (!p.line) { x.beginPath(); AS.partPath(x, p, w); x.fillStyle = '#0099db'; x.fill(); }
        x.restore();
        x.fillStyle = '#ffffff'; x.fillRect(bx + 4, by + 4, 4, 12); x.fillRect(bx + 12, by + 4, 4, 4); x.fillRect(bx + bw - 8, by + bh - 12, 4, 8);
        if (a.crack > 0.3) { x.fillStyle = '#124e89'; for (let i = 0; i < 3; i++) x.fillRect(bx + 4 + Math.floor(rand(i, 1) * (bw / PX - 2)) * PX, by + Math.floor(rand(i, 2) * (bh / PX - 2)) * PX, 4, 8); }
      }
    }
    quantize(ac, 'binary', true);
    f.drawImage(ac, 0, 0);
    for (const a of S.actors) if (a.alpha >= 0.5 && a.frozen < 0.3) pxEyes(f, a);
    // fx layer: dithered glows and hard particles
    const [fc, g] = layer('fx');
    const glow = (gx, gy, r, col, a) => { const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(gx - r, gy - r, r * 2, r * 2); };
    const sq = (sx, sy, s, col) => { g.fillStyle = col; const k = Math.max(PX, Math.round(s / PX) * PX); g.fillRect(Math.round(sx / PX) * PX - k / 2, Math.round(sy / PX) * PX - k / 2, k, k); };
    glow(F.x, F.y - 10, 70, '#f77622', 0.35);
    for (const fl of [...S.flames, ...S.impFlames]) if (fl.size > 1) sq(fl.x, fl.y, fl.size * 1.3, fl.age < 0.3 ? '#fee761' : fl.age < 0.6 ? '#f77622' : '#e43b44');
    for (const s of S.smoke) if (s.age > 0.15) { g.globalAlpha = 0.55 * (1 - s.age); g.beginPath(); g.arc(s.x, s.y, s.size * 0.5, 0, TAU); g.fillStyle = '#5a6988'; g.fill(); g.globalAlpha = 1; }
    for (const e of S.embers) sq(e.x, e.y, 4, e.r > 0.5 ? '#fee761' : '#f77622');
    for (const m of S.mist) { glow(m.x, m.y, m.size, '#ffffff', 0.45 * Math.sin(m.age * Math.PI)); }
    for (const dr of S.drips) sq(dr.x, dr.y, 4, '#2ce8f5');
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.8, 1);
      if (p.kind === 'water') sq(p.x, p.y, (4 + p.size * 0.6) * k, p.r > 0.5 ? '#0099db' : '#2ce8f5');
      else { glow(p.x, p.y, (6 + p.size * 1.4) * k, '#2ce8f5', 0.5); if (p.r > 0.6) sq(p.x, p.y, 4, '#ffffff'); }
    }
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 16, 2 * o, 0.9, 30);
      g.lineCap = 'butt';
      for (const [lw, col] of [[18 * o, '#68386c'], [12 * o, '#ff0044'], [5 * o, '#f6757a'], [2 * o, '#ffffff']]) { g.lineWidth = lw; g.strokeStyle = col; strokePts(g, pts); }
      glow(B.x2, B.y2, 18 * o, '#ff0044', 0.7);
      sq(B.x2, B.y2, 8 * o + (Math.floor(t * 15) % 2) * 4, '#ffffff');
      sq(B.x1, B.y1, 10 * o, '#f6757a');
      for (const s of S.beamSparks) sq(s.x, s.y, 4, s.r > 0.5 ? '#ffffff' : '#f6757a');
    }
    // ward: dithered bubble + hard rim
    glow(Wd.x, Wd.y, wr, '#fee761', 0.22 + Wd.pulse * 0.4);
    g.beginPath(); g.arc(Wd.x, Wd.y, wr, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#fee761'; g.stroke();
    for (let i = 0; i < 4; i++) { const a = t * 1.2 + i / 4 * TAU; sq(Wd.x + Math.cos(a) * wr, Wd.y + Math.sin(a) * wr, 6, '#ffffff'); }
    for (const s of S.wardSparks) sq(s.x, s.y, 4, s.r > 0.4 ? '#fee761' : '#ffffff');
    for (const ar of S.arrows) {
      g.save(); g.globalAlpha = ar.alpha; g.translate(ar.x, ar.y); g.rotate(ar.ang);
      g.fillStyle = '#ead4aa'; g.fillRect(-14, -2, 24, 4); g.fillStyle = '#c0cbdc'; g.fillRect(8, -4, 6, 8); g.fillStyle = '#ffffff'; g.fillRect(-16, -4, 5, 8);
      g.restore();
    }
    for (const s of S.shards) if (s.age < 0.85) sq(s.x, s.y, s.size, s.r > 0.5 ? '#ffffff' : '#2ce8f5');
    if (S.spray.cold + S.spray.water > 0) glow(S.spray.x, S.spray.y, 16, S.spray.cold > 0 ? '#2ce8f5' : '#0099db', 0.9);
    quantize(fc, 'dither', false);
    f.drawImage(fc, 0, 0);
    // numbers (3x5 pixel font)
    const NC = { arcane: '#f6757a', crit: '#fee761', fire: '#feae34', cold: '#2ce8f5', water: '#0099db', shield: '#fee761' };
    for (const n of S.numbers) {
      if (n.alpha < 0.4) continue;
      const txt = n.text.toUpperCase(), w = txt.length * 4 - 1;
      pxText(f, txt, Math.round(n.x / PX - w / 2), Math.round(n.y / PX - 2), NC[n.kind]);
    }
    // HUD
    for (const h of S.hud) {
      const hx = Math.round(h.x / PX), hy = Math.round(h.y / PX) + 1, hw = Math.round(h.w / PX), hh = 9;
      f.fillStyle = '#181425'; f.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
      f.fillStyle = '#262b44'; f.fillRect(hx, hy, hw, hh);
      f.fillStyle = '#3a4466'; f.fillRect(hx, hy, hw, 1);
      pxText(f, h.name, hx + 2, hy + 2, h.team === 'p1' ? '#e43b44' : '#0099db', '#262b44');
      f.fillStyle = '#3e2731'; f.fillRect(hx + 10, hy + 7, 36, 1); f.fillStyle = '#63c74d'; f.fillRect(hx + 10, hy + 7, Math.round(36 * h.hp), 1);
      for (let i = 0; i < 5; i++) {
        const ix = hx + 10 + i * 7, iy = hy + 1, q = h.queue[i];
        if (!q || q.pop < 0.5) { f.fillStyle = '#3a4466'; f.fillRect(ix + 2, iy + 2, 1, 1); continue; }
        const ic = ICON[q.el]; f.fillStyle = E[q.el];
        for (let k = 0; k < 25; k++) if (ic[k] === '1') f.fillRect(ix + (k % 5), iy + ((k / 5) | 0), 1, 1);
      }
    }
    // upscale with hard pixels
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fin, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
  }
  AS.register({
    id: 'pixel', name: 'Chunky Pixel', pixelWidth: LW,
    refs: ['Wizard of Legend', 'Nuclear Throne', 'Enter the Gungeon'],
    feel: 'A 160 by 100 canvas blown up four times, locked to the 32-colour Endesga palette. Characters get a one-pixel dark outline, glows are ordered-dithered instead of blended, and the numbers use a tiny 3x5 font. Crunchy, punchy and arcade-honest.',
    notes: {
      read: ['Weak at this scale', 'Silhouettes stay crisp, but a goblin is 8 pixels tall and overlapping effects become a noisy dither field. It needs a higher resolution (320x180 or more) or a closer camera to hold up in co-op chaos.'],
      tone: ['Good', 'Arcadey and nostalgic; slapstick reads fine, although it suggests "indie roguelite" more than "cartoon".'],
      cost: ['Low per asset, high at scale', 'Pixel art is quick to start and easy to keep consistent, but every animation frame and every spell combination needs hand-drawn frames, and that grows fast with a compositional spell system.'],
    },
    render: pixelRender,
  });

  // =====================================================================
  // 5. DARK PAINTERLY
  // =====================================================================
  const DP = {
    el: { fire: '#ff8a3a', water: '#3a8cff', cold: '#7fe8ff', arcane: '#ff4fa0', shield: '#ffd36a' },
    p1: { robe: '#8a2f2c', trim: '#c89a4a', sleeve: '#6a2422', hat: '#8a2f2c', band: '#c89a4a' },
    p2: { robe: '#2f4c86', trim: '#8aa6c8', sleeve: '#223a68', hat: '#2f4c86', band: '#8aa6c8' },
    wizard: { skin: '#b89478', beard: '#c8c2b8', staff: '#5a4030', hand: '#b89478' },
    goblin: { body: '#4f6a3a', belly: '#6e7e4a', dark: '#2a3420', club: '#4a3426' },
    archer: { body: '#4f6a3a', cloth: '#3e2e2a', dark: '#2a3420', bow: '#6a4a30', string: '#9a9080', arrow: '#8a7a60', hand: '#4f6a3a' },
    brute: { body: '#5e3e36', belly: '#7a5444', dark: '#2e1e1a', horn: '#a89a80', brow: '#1a1210' },
    imp: { body: '#5a3460', wing: '#3a2240', horn: '#a08a60', tail: '#3a2240' },
    common: { eye: '#120c10', eyeWhite: '#d8d0c0', tooth: '#d8d0c0' },
  };
  function darkGround(scale) {
    return AS.cached('dark-ground', W, H, scale, (x) => {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2c343c'); g.addColorStop(1, '#262a2c'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      // big cracked flagstones
      for (let i = 0; i < 26; i++) {
        const cx = rand(i, 1) * W, cy = rand(i, 2) * H;
        x.beginPath(); polyPath(x, jit(blobPts(cx, cy, 40 + rand(i, 3) * 30, 24 + rand(i, 4) * 16, i, 9, 0.2), i, 8));
        x.fillStyle = ['#323a40', '#2e3434', '#383a36', '#30383a'][i % 4]; x.globalAlpha = 0.7; x.fill();
        x.globalAlpha = 0.5; x.lineWidth = 2; x.strokeStyle = '#1a1e22'; x.stroke();
      }
      x.globalAlpha = 1;
      // moss / dead grass patches
      for (let i = 0; i < 10; i++) { x.beginPath(); AS.path(x, blobPts(rand(i, 5) * W, rand(i, 6) * H, 50 + rand(i, 7) * 60, 24 + rand(i, 8) * 24, i * 2.1, 24, 0.3)); x.fillStyle = '#2c3a2a'; x.globalAlpha = 0.6; x.fill(); }
      // brush strokes
      x.lineCap = 'round';
      const cols = ['#3c4650', '#2a3036', '#454a44', '#34402e', '#4c4a42', '#22282c', '#3a3430'];
      for (let i = 0; i < 2600; i++) {
        const px = rand(i, 11) * W, py = rand(i, 12) * H, a = -0.6 + (rand(i, 13) - 0.5) * 0.9, L = 6 + rand(i, 14) * 16;
        x.globalAlpha = 0.08 + rand(i, 15) * 0.16; x.strokeStyle = cols[i % cols.length]; x.lineWidth = 2 + rand(i, 16) * 5;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * L * 0.5 + 2, py + Math.sin(a) * L * 0.5 - 2, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
      }
      // path of packed earth
      for (let i = 0; i < 500; i++) {
        const px = rand(i, 21) * W, py = 214 + Math.sin(px / 44 * 0.8) * 16 + (px > 360 ? (px - 360) * 0.12 : 0) + (rand(i, 22) - 0.5) * 40;
        x.globalAlpha = 0.12 + rand(i, 23) * 0.12; x.strokeStyle = i % 2 ? '#5a4c3e' : '#4a3e34'; x.lineWidth = 3 + rand(i, 24) * 5;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + 10 + rand(i, 25) * 10, py + (rand(i, 26) - 0.5) * 4); x.stroke();
      }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        x.globalAlpha = 1; x.beginPath(); AS.path(x, blobPts(rx, ry, rr, rr * 0.75, rx, 14, 0.15));
        const rg = x.createLinearGradient(rx - rr, ry - rr, rx + rr, ry + rr); rg.addColorStop(0, '#5a5e60'); rg.addColorStop(1, '#22262a'); x.fillStyle = rg; x.fill();
      }
      x.globalAlpha = 1;
    });
  }
  let lightC = null;
  function lights(S) {
    const L = [], E = DP.el;
    L.push({ x: S.fire.x, y: S.fire.y - 10, r: 190, c: '#ff8a3a', a: 0.95 });
    L.push({ x: S.imp.x, y: S.imp.y - 14, r: 70, c: '#ff9a4a', a: 0.6 });
    L.push({ x: S.ward.x, y: S.ward.y, r: 95, c: E.shield, a: 0.45 + S.ward.pulse * 0.4 });
    const tip1 = AS.staffTip(S.players[0]), tip2 = AS.staffTip(S.players[1]);
    L.push({ x: tip1[0], y: tip1[1], r: 60, c: E.arcane, a: 0.5 });
    L.push({ x: tip2[0], y: tip2[1], r: 60, c: S.players[1].element === 'water' ? E.water : E.cold, a: 0.45 + S.spray.cold * 0.4 });
    if (S.beam) {
      const B = S.beam;
      for (let i = 0; i <= 6; i++) { const p = i / 6; L.push({ x: lerp(B.x1, B.x2, p), y: lerp(B.y1, B.y2, p), r: 70, c: E.arcane, a: 0.4 * B.on }); }
      L.push({ x: B.x2, y: B.y2, r: 120, c: E.arcane, a: 0.8 * B.on });
    }
    if (S.spray.cold > 0) for (let i = 1; i <= 3; i++) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * i * 55, y: S.spray.y + Math.sin(S.spray.ang) * i * 55, r: 80, c: E.cold, a: 0.35 * S.spray.cold });
    if (S.spray.water > 0) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * 90, y: S.spray.y + Math.sin(S.spray.ang) * 90, r: 90, c: E.water, a: 0.3 * S.spray.water });
    if (S.puddle.ice > 0 && S.puddle.front > 0) L.push({ x: S.puddle.x - S.puddle.rx * (1 - S.puddle.front), y: S.puddle.y, r: 90 * S.puddle.front + 30, c: E.cold, a: 0.28 * S.puddle.ice });
    return L;
  }
  function darkActor(ctx, a, S, L) {
    const parts = world(a), [rad, hgt] = AS.SIZE[a.kind];
    const cx = a.x, cy = a.y - hgt * 0.45;
    let best = null, bs = 0;
    for (const l of L) { const dd = Math.hypot(l.x - cx, l.y - cy), sc = l.a * l.r / (dd + 30); if (sc > bs) { bs = sc; best = l; } }
    const ang = best ? Math.atan2(best.y - cy, best.x - cx) : -2.3, rimC = best ? best.c : '#8aa0c0';
    const dx = Math.cos(ang), dy = Math.sin(ang);
    ctx.save(); ctx.globalAlpha = a.alpha;
    const sh = ctx.createRadialGradient(a.x - dx * 8, a.y + 1, 0, a.x - dx * 8, a.y + 1, rad * 1.5);
    sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(a.x - dx * 8, a.y + 1, rad * 1.5, rad * 0.5, 0, 0, TAU); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // rim light: lit silhouette nudged toward the light, body drawn over it
    ctx.save(); ctx.translate(dx * 1.8, dy * 1.8);
    ctx.beginPath(); for (const { p, w } of parts) if (!p.line) AS.partPath(ctx, p, w);
    ctx.fillStyle = mix(rimC, '#ffffff', 0.35); ctx.globalAlpha = a.alpha * clamp(0.5 + bs * 2.5); ctx.fill();
    ctx.restore(); ctx.globalAlpha = a.alpha;
    for (const { p, w } of parts) {
      const col = colorOf(DP, a, p.role);
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      if (p.big) {
        const xs = w.map((q) => q[0]), ys = w.map((q) => q[1]);
        const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2, rr = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        const gr = ctx.createLinearGradient(mx + dx * rr, my + dy * rr, mx - dx * rr, my - dy * rr);
        gr.addColorStop(0, mix(col, rimC, 0.3)); gr.addColorStop(0.45, col); gr.addColorStop(1, mix(col, '#05060a', 0.55));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = col;
      ctx.fill();
      if (a.wet && p.big) { ctx.fillStyle = hexA('#3a6aa8', 0.35 * a.wet); ctx.fill(); }
    }
    if (a.hit > 0) { ctx.globalAlpha = a.alpha * a.hit * 0.6; ctx.fillStyle = mix(rimC, '#ffffff', 0.5); for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); } ctx.globalAlpha = a.alpha; }
    if (a.frozen > 0) {
      const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * a.frozen, x0 = a.x - r - 5, y0 = a.y + 5 - hh, w0 = 2 * r + 10;
      const ice = jit([[x0 + 2, y0 + 3], [x0 + w0 * 0.45, y0], [x0 + w0, y0 + 5], [x0 + w0 + 1, y0 + hh * 0.6], [x0 + w0 - 2, y0 + hh], [x0 + 2, y0 + hh], [x0 - 1, y0 + hh * 0.4]], hash(a.id), 3);
      const ig = ctx.createLinearGradient(x0, y0, x0 + w0, y0 + hh); ig.addColorStop(0, 'rgba(170,230,255,0.75)'); ig.addColorStop(1, 'rgba(40,90,130,0.6)');
      ctx.beginPath(); polyPath(ctx, ice); ctx.fillStyle = ig; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(220,250,255,0.8)'; ctx.stroke();
      if (a.crack > 0) { ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5 * a.crack; i++) { const qx = x0 + w0 * rand(i, 61), qy = y0 + hh * rand(i, 62); ctx.moveTo(qx, qy); ctx.lineTo(qx + (rand(i, 63) - 0.5) * 20, qy + (rand(i, 64) - 0.5) * 20); } ctx.stroke(); }
    }
    ctx.restore();
  }
  function soft(ctx, x, y, r, col, a) {
    if (r <= 0.5 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(col, a)); g.addColorStop(0.4, hexA(col, a * 0.45)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function darkRender(ctx, S, scale) {
    const t = S.t, E = DP.el;
    ctx.drawImage(darkGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = S.fire;
    ctx.beginPath(); AS.path(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 26, 0.18)); ctx.fillStyle = 'rgba(15,10,8,0.7)'; ctx.fill();
    // puddle: dark glossy water with reflections
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 30, 0.1);
    ctx.beginPath(); AS.path(ctx, pud);
    const pg = ctx.createLinearGradient(0, P.y - P.ry, 0, P.y + P.ry); pg.addColorStop(0, '#0e1a26'); pg.addColorStop(1, '#1e3446'); ctx.fillStyle = pg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(140,190,230,0.35)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); iceFrontPath(ctx, P, 6);
      const ig = ctx.createLinearGradient(P.x - P.rx, P.y - P.ry, P.x + P.rx, P.y + P.ry); ig.addColorStop(0, '#9fd8ee'); ig.addColorStop(1, '#3c6a88');
      ctx.fillStyle = ig; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(235,252,255,0.75)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; ctx.moveTo(cx, cy); ctx.lineTo(cx + 16, cy - 7); ctx.lineTo(cx + 26, cy + 2); } ctx.stroke();
      if (P.crack > 0) { ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // charred tongue bases (lit later)
    for (const tg of S.tongues) { ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.9, tg.h * 0.6, tg.sway * 0.5); ctx.fillStyle = '#5a2a14'; ctx.fill(); }
    const L = lights(S);
    for (const a of S.actors) darkActor(ctx, a, S, L);
    // smoke darkens before lighting
    for (const s of S.smoke) { if (s.age < 0.1) continue; soft(ctx, s.x, s.y, s.size * 1.1, '#0a0a0c', 0.4 * (1 - s.age)); }
    // ---- lighting: multiply a light map over the world ----
    const lw = Math.ceil(W * scale / 2), lh = Math.ceil(H * scale / 2);
    if (!lightC) lightC = document.createElement('canvas');
    if (lightC.width !== lw || lightC.height !== lh) { lightC.width = lw; lightC.height = lh; }
    const lx = lightC.getContext('2d');
    lx.setTransform(scale / 2, 0, 0, scale / 2, 0, 0);
    lx.globalCompositeOperation = 'source-over'; lx.fillStyle = '#525a70'; lx.fillRect(0, 0, W, H);
    const moon = lx.createLinearGradient(0, 0, W * 0.6, H); moon.addColorStop(0, 'rgba(90,110,150,0.6)'); moon.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = moon; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'lighter';
    const flick = 0.9 + Math.sin(t * TAU * 3) * 0.05 + Math.sin(t * TAU * 5 + 1) * 0.05;
    for (const l of L) soft(lx, l.x, l.y, l.r, l.c, l.a * (l.c === '#ff8a3a' ? flick : 1));
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(lightC, 0, 0, W, H);
    // ---- additive magic ----
    ctx.globalCompositeOperation = 'lighter';
    // light spill: a little of each light added back so lit areas pick up colour
    for (const l of L) soft(ctx, l.x, l.y, l.r * 0.8, l.c, l.a * 0.2);
    soft(ctx, F.x, F.y - 6, 150, '#ff6a20', 0.32 * flick); soft(ctx, F.x, F.y - 10, 70, '#ffb050', 0.3 * flick);
    // glowing enemy eyes
    for (const a of [...S.goblins, S.brute, S.archer, S.imp]) {
      if (a.alpha < 0.3 || a.frozen > 0.5) continue;
      const f = AS.xf(a);
      const eyes = { goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[-0.8, -22], [4.2, -22]] }[a.kind];
      for (const e of eyes) { const [ex, ey] = f(e); soft(ctx, ex, ey, 4, '#ffd84a', 0.9); }
    }
    for (const tg of S.tongues) {
      const g = ctx.createLinearGradient(tg.x, tg.y, tg.x, tg.y - tg.h * 1.2);
      g.addColorStop(0, 'rgba(255,230,160,0.95)'); g.addColorStop(0.3, 'rgba(255,140,40,0.75)'); g.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.75, tg.h * 1.45, tg.sway * 1.4); ctx.fill();
    }
    for (const fl of [...S.flames, ...S.impFlames]) soft(ctx, fl.x, fl.y - fl.size, fl.size * 2.6, fl.age < 0.4 ? '#ffb050' : '#ff5a20', 0.55);
    for (const e of S.embers) { soft(ctx, e.x, e.y, 5, '#ff9a3a', 0.8 * (1 - e.age)); ctx.fillStyle = '#ffe0a0'; ctx.fillRect(e.x - 0.8, e.y - 0.8, 1.6, 1.6); }
    for (const m of S.mist) soft(ctx, m.x, m.y, m.size, '#5ab8d8', 0.14 * Math.sin(m.age * Math.PI));
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.75, 1);
      if (p.kind === 'water') { soft(ctx, p.x, p.y, (3 + p.size) * k, '#3a8cff', 0.45); continue; }
      soft(ctx, p.x, p.y, (5 + p.size * 1.6) * k, '#4ad0ff', 0.3);
      if (p.r > 0.55) { ctx.fillStyle = hexA('#ffffff', 0.9 * k); ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
    }
    if (S.spray.cold + S.spray.water > 0) soft(ctx, S.spray.x, S.spray.y, 22, S.spray.cold > 0 ? '#7fe8ff' : '#3a8cff', 0.9);
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 22, 2.2 * o, 0.8, 26);
      for (const [lw2, col, al] of [[34 * o, E.arcane, 0.12], [18 * o, E.arcane, 0.3], [9 * o, '#ff7ab8', 0.7], [4 * o, '#ffe0ee', 0.95]]) { ctx.lineWidth = lw2; ctx.strokeStyle = hexA(col, al); strokePts(ctx, pts); }
      soft(ctx, B.x2, B.y2, 46 * o, E.arcane, 0.9); soft(ctx, B.x2, B.y2, 16 * o, '#ffffff', 0.9);
      soft(ctx, B.x1, B.y1, 22 * o, E.arcane, 0.9);
      for (const s of S.beamSparks) { ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(s.r > 0.5 ? '#ffd0e6' : E.arcane, 1 - s.age); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 8, s.y - Math.sin(s.a) * 8); ctx.stroke(); }
    } else soft(ctx, AS.staffTip(S.players[0])[0], AS.staffTip(S.players[0])[1], 10, E.arcane, 0.6);
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    const rg = ctx.createRadialGradient(Wd.x, Wd.y, wr * 0.6, Wd.x, Wd.y, wr + 4);
    rg.addColorStop(0, hexA(E.shield, 0)); rg.addColorStop(0.88, hexA(E.shield, 0.28 + Wd.pulse * 0.35)); rg.addColorStop(1, hexA(E.shield, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr + 4, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = hexA('#fff0c0', 0.6); ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * 1.1 + i / 3 * TAU; ctx.lineWidth = 2.2; ctx.strokeStyle = hexA('#ffe8a0', 0.8); ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, a, a + 0.5); ctx.stroke(); }
    if (Wd.pulse > 0) soft(ctx, Wd.hitX, Wd.hitY, 30, E.shield, Wd.pulse);
    for (const s of S.wardSparks) soft(ctx, s.x, s.y, 4, '#ffe8a0', 1 - s.age);
    for (const s of S.shards) { if (s.age > 0.9) continue; soft(ctx, s.x, s.y, s.size * 1.6, '#7fe8ff', 0.6 * (1 - s.age)); }
    for (const dr of S.drips) soft(ctx, dr.x, dr.y, 2.5, '#6ab0ff', 0.6 * (1 - dr.age));
    ctx.globalCompositeOperation = 'source-over';
    for (const s of S.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]); ctx.fillStyle = s.r > 0.5 ? '#d8f6ff' : '#7ab8d8'; ctx.fill(); ctx.restore(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => { c.strokeStyle = '#a89878'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-14, 0); c.lineTo(11, 0); c.stroke(); c.beginPath(); polyPath(c, [[15, 0], [9, -3], [9, 3]]); c.fillStyle = '#d8d0c0'; c.fill(); c.strokeStyle = '#6a5a48'; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -3); c.moveTo(-14, 0); c.lineTo(-18, 3); c.stroke(); });
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2 - 20, 150, W / 2, H / 2, 420);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // numbers
    const NC = { arcane: ['#ffd0e6', E.arcane], crit: ['#fff2c0', '#ffb030'], fire: ['#ffd8b0', '#ff7a2a'], cold: ['#e0faff', '#4ad0ff'], water: ['#d0e6ff', '#3a8cff'], shield: ['#fff2c0', '#ffc040'] };
    for (const n of S.numbers) {
      const size = (n.big ? 22 : 17) * n.pop, [fg, gl] = NC[n.kind];
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.font = `700 ${size}px Cinzel, "Trajan Pro", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = gl; ctx.shadowBlur = 10 * scale; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,8,0.85)'; ctx.strokeText(n.text, n.x, n.y);
      ctx.shadowBlur = 0; ctx.fillStyle = fg; ctx.fillText(n.text, n.x, n.y); ctx.restore();
    }
    // HUD
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 3); ctx.fillStyle = 'rgba(10,10,14,0.82)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#7a6438'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h.x + 34, h.y + 6); ctx.lineTo(h.x + 34, h.y + h.h - 6); ctx.stroke();
      ctx.font = '700 13px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = h.team === 'p1' ? '#e08070' : '#8ab0e8'; ctx.fillText(h.name, h.x + 17, h.y + 19);
      ctx.fillStyle = '#2a1414'; ctx.fillRect(h.x + 42, h.y + 27, 136, 3); ctx.fillStyle = '#c03a2a'; ctx.fillRect(h.x + 42, h.y + 27, 136 * h.hp, 3);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 51 + i * 26, cy = h.y + 13, q = h.queue[i];
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = '#4a3e28'; ctx.stroke();
        if (!q) continue;
        const r = 7.5 * ease.back(q.pop);
        ctx.globalCompositeOperation = 'lighter'; soft(ctx, cx, cy, r * 2.2, E[q.el], 0.7); ctx.globalCompositeOperation = 'source-over';
        AS.glyph(ctx, q.el, cx, cy, r * 0.75); ctx.fillStyle = mix(E[q.el], '#ffffff', 0.55); ctx.fill();
      }
    }
  }
  AS.register({
    id: 'dark', name: 'Dark Painterly Glow',
    refs: ['Hades', 'Diablo III', 'Children of Morta'],
    feel: 'A dim, desaturated, brush-stroked world where spells are the light sources. Everything is lit through a light map, so the fire washes the brute orange and the beam paints its target pink, and every character gets a rim light from the brightest thing near them. Shapes stay chunky and cartoony; the mood does the work.',
    notes: {
      read: ['Strong for magic, weaker for bodies', 'Spells pop hard against the dark, and lights make the action\'s focus obvious. But characters far from light sink into the murk, and at high chaos the additive glows blow out into white.'],
      tone: ['Shifts it', 'Gorgeous and dramatic, but heavier than Magicka\'s slapstick. Needs bright colours on players and comedic animation to stay playful.'],
      cost: ['High', 'Painted environments, a dynamic lighting pipeline, and VFX that must be tuned per element and per light. Best value in 3D with a stylised shader.'],
    },
    render: darkRender,
  });

  // =====================================================================
  // 6. CLEAR SIGNAL (minimal geometric)
  // =====================================================================
  // Okabe-Ito colours, each element also has its own particle shape.
  const GC = { fire: '#E69F00', water: '#0072B2', cold: '#56B4E9', arcane: '#CC79A7', shield: '#F0E442', bad: '#D55E00' };
  function geoGround(scale) {
    return AS.cached('geo-ground', W, H, scale, (x) => {
      x.fillStyle = '#25292f'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#2f343b'; x.lineWidth = 1;
      x.beginPath(); for (let gx = 0; gx <= W; gx += 32) { x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, H); } for (let gy = 0; gy <= H; gy += 32) { x.moveTo(0, gy + 0.5); x.lineTo(W, gy + 0.5); } x.stroke();
      x.fillStyle = '#3a4048'; for (let gx = 0; gx <= W; gx += 32) for (let gy = 0; gy <= H; gy += 32) x.fillRect(gx - 1, gy - 1, 2, 2);
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) { x.fillStyle = '#353a42'; x.fillRect(rx - rr, ry - rr * 0.8, rr * 2, rr * 1.6); }
    });
  }
  function regPoly(ctx, x, y, n, r, rot = -Math.PI / 2) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  function plus(ctx, x, y, r, rot = 0) { for (let k = 0; k < 2; k++) { const a = rot + k * Math.PI / 2; ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
  // Element glyphs reuse the particle shapes: fire triangle, water dot, frost plus, arcane diamond, shield hexagon.
  function geoGlyph(ctx, el, x, y, r) {
    ctx.beginPath();
    if (el === 'fire') { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.65); ctx.lineTo(x - r * 0.9, y + r * 0.65); ctx.closePath(); ctx.fillStyle = GC.fire; ctx.fill(); }
    else if (el === 'water') { ctx.arc(x, y, r * 0.7, 0, TAU); ctx.fillStyle = GC.water === '#0072B2' ? '#3a9ae0' : GC.water; ctx.fill(); }
    else if (el === 'cold') { plus(ctx, x, y, r, 0); ctx.lineWidth = r * 0.5; ctx.lineCap = 'butt'; ctx.strokeStyle = GC.cold; ctx.stroke(); ctx.lineCap = 'round'; }
    else if (el === 'arcane') { regPoly(ctx, x, y, 4, r, -Math.PI / 2); ctx.fillStyle = GC.arcane; ctx.fill(); }
    else { regPoly(ctx, x, y, 6, r, 0); ctx.lineWidth = r * 0.4; ctx.strokeStyle = GC.shield; ctx.stroke(); }
  }
  function badge(ctx, x, y, el) {
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fillStyle = '#15171b'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = el === 'water' ? '#3a9ae0' : GC[el]; ctx.stroke();
    geoGlyph(ctx, el, x, y, 4.2);
  }
  const GEO = { wizard: 14, goblin: 12, archer: 13, brute: 25, imp: 9 };
  const center = (a) => [a.x, a.y - GEO[a.kind] - 2 + a.bob * 0.5];
  function geoRender(ctx, S, scale) {
    const t = S.t;
    ctx.drawImage(geoGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // hazard zone: burning grass
    const F = S.fire;
    ctx.save(); ctx.beginPath(); ctx.ellipse(F.x, F.y, F.rx, F.ry, 0, 0, TAU); ctx.fillStyle = hexA(GC.fire, 0.12); ctx.fill(); ctx.clip();
    ctx.strokeStyle = hexA(GC.fire, 0.35); ctx.lineWidth = 3; ctx.beginPath(); for (let k = -10; k < 20; k++) { const ox = F.x - F.rx + k * 12 + (t * 12) % 12; ctx.moveTo(ox, F.y + F.ry); ctx.lineTo(ox + 2 * F.ry, F.y - F.ry); } ctx.stroke(); ctx.restore();
    ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = GC.fire; ctx.beginPath(); ctx.ellipse(F.x, F.y, F.rx, F.ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // puddle -> ice (colour AND pattern change)
    const P = S.puddle;
    ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU); ctx.fillStyle = hexA(GC.water, 0.55); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let row = -2; row <= 2; row++) for (let k = -5; k <= 5; k++) { const wx = P.x + k * 18 + (t * 10) % 18, wy = P.y + row * 13; ctx.moveTo(wx - 6, wy); ctx.quadraticCurveTo(wx - 3, wy - 3, wx, wy); ctx.quadraticCurveTo(wx + 3, wy + 3, wx + 6, wy); }
    ctx.stroke();
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      const fx = P.x - P.rx + 2 * P.rx * P.front;
      ctx.beginPath(); ctx.rect(P.x - P.rx - 2, P.y - P.ry - 2, fx - (P.x - P.rx) + 2, 2 * P.ry + 4); ctx.fillStyle = '#9fd3f1'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = -14; k < 14; k++) { const ox = P.x + k * 12; ctx.moveTo(ox, P.y - P.ry); ctx.lineTo(ox + 2 * P.ry, P.y + P.ry); ctx.moveTo(ox, P.y + P.ry); ctx.lineTo(ox + 2 * P.ry, P.y - P.ry); }
      ctx.stroke(); ctx.restore();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(fx, P.y - P.ry); ctx.lineTo(fx, P.y + P.ry); if (P.front < 1) ctx.stroke();
      if (P.crack > 0) { ctx.strokeStyle = '#15171b'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = P.ice > 0 && P.front > 0.98 ? '#ffffff' : GC.water; ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU); ctx.stroke();
    // ward: hexagon
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.06);
    regPoly(ctx, Wd.x, Wd.y, 6, wr + 3, 0); ctx.fillStyle = hexA(GC.shield, 0.1 + Wd.pulse * 0.2); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = GC.shield; ctx.stroke();
    // telegraph: archer aim line (intent shown before the shot)
    const A = S.archer, ac = center(A);
    if (A.draw > 0.02) {
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 30; ctx.lineWidth = 1.5; ctx.strokeStyle = hexA('#ffffff', 0.25 + A.draw * 0.6);
      ctx.beginPath(); ctx.moveTo(ac[0], ac[1]); ctx.lineTo(Wd.hitX, Wd.hitY); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, 5 + (1 - A.draw) * 6, 0, TAU); ctx.lineWidth = 1.5; ctx.stroke();
    }
    // spray cone + particles (offset to come from P2's body)
    const p2 = S.players[1], c2 = center(p2), sp = S.spray;
    const ox = c2[0] + Math.cos(sp.ang) * 17 - sp.x, oy = c2[1] + Math.sin(sp.ang) * 17 - sp.y;
    const sprayOn = Math.max(sp.cold, sp.water);
    if (sprayOn > 0) {
      const col = sp.cold > 0 ? GC.cold : GC.water, L = sp.len * 0.82;
      ctx.beginPath(); ctx.moveTo(sp.x + ox, sp.y + oy); ctx.arc(sp.x + ox, sp.y + oy, L, sp.ang - sp.spread, sp.ang + sp.spread); ctx.closePath();
      ctx.fillStyle = hexA(col, 0.13 * sprayOn); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(col, 0.6 * sprayOn); ctx.stroke();
    }
    for (const p of sp.parts) {
      const k = 1 - seg(p.age, 0.8, 1), x = p.x + ox, y = p.y + oy;
      if (p.kind === 'water') { ctx.beginPath(); ctx.arc(x, y, (1.5 + p.size * 0.35) * k, 0, TAU); ctx.fillStyle = '#3a9ae0'; ctx.fill(); }
      else { ctx.beginPath(); plus(ctx, x, y, (2.5 + p.size * 0.5) * k, p.rot); ctx.lineWidth = 2; ctx.strokeStyle = GC.cold; ctx.stroke(); }
    }
    // fire: rising triangles
    const tri = (x, y, s, col) => { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.8, y + s * 0.5); ctx.lineTo(x - s * 0.8, y + s * 0.5); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    for (const tg of S.tongues) tri(tg.x + tg.sway * 0.4, tg.y - tg.h * 0.35, tg.h * 0.32, GC.fire);
    for (const fl of [...S.flames, ...S.impFlames]) if (fl.size > 1) tri(fl.x, fl.y, fl.size * 0.9, fl.age < 0.5 ? '#f5c242' : GC.fire);
    for (const s of S.smoke) { if (s.age < 0.1) continue; ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 0.45, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = hexA('#9aa0a8', 0.35 * (1 - s.age)); ctx.stroke(); }
    for (const e of S.embers) { ctx.fillStyle = hexA(GC.fire, 1 - e.age); ctx.fillRect(e.x - 1, e.y - 1, 2, 2); }
    // beam from P1's body: a band with travelling chevrons
    const p1 = S.players[0], c1 = center(p1);
    if (S.beam) {
      const B = S.beam, ang = Math.atan2(B.y2 - c1[1], B.x2 - c1[0]), bx = c1[0] + Math.cos(ang) * 17, by = c1[1] + Math.sin(ang) * 17;
      const L = Math.hypot(B.x2 - bx, B.y2 - by), o = B.on;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(ang);
      ctx.fillStyle = GC.arcane; ctx.fillRect(0, -5 * o, L, 10 * o);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let d = (t * 120) % 18; d < L - 6; d += 18) { ctx.moveTo(d, -3.2 * o); ctx.lineTo(d + 4, 0); ctx.lineTo(d, 3.2 * o); }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(B.x2, B.y2, 8 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = GC.arcane; ctx.stroke();
      for (const s of S.beamSparks) { ctx.fillStyle = hexA(GC.arcane, 1 - s.age); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -2, 4, 4); ctx.restore(); }
    }
    // actors
    for (const a of S.actors) {
      const [x, y] = center(a), r = GEO[a.kind];
      ctx.save(); ctx.globalAlpha = a.alpha;
      ctx.beginPath(); ctx.ellipse(a.x, a.y, r * 0.9, r * 0.3, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
      if (a.team !== 'enemy') {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#f4f4f2'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#15171b'; ctx.stroke();
        const aim = a.id === 'p1' && S.beam ? Math.atan2(S.beam.y2 - y, S.beam.x2 - x) : a.id === 'p2' ? sp.ang : 0;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(aim) * (r + 7), y + Math.sin(aim) * (r + 7)); ctx.lineTo(x + Math.cos(aim + 0.45) * (r + 1), y + Math.sin(aim + 0.45) * (r + 1)); ctx.lineTo(x + Math.cos(aim - 0.45) * (r + 1), y + Math.sin(aim - 0.45) * (r + 1)); ctx.closePath(); ctx.fillStyle = '#f4f4f2'; ctx.fill();
        ctx.font = '700 15px "Space Grotesk", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#15171b'; ctx.fillText(a.id === 'p1' ? '1' : '2', x, y + 1);
        if (a.casting > 0) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = GC[a.element === 'water' ? 'water' : a.element]; ctx.stroke(); }
      } else {
        const shape = () => {
          if (a.kind === 'goblin') regPoly(ctx, x, y, 4, r + 1, -Math.PI / 2);
          else if (a.kind === 'archer') regPoly(ctx, x, y, 3, r + 2, Math.atan2(Wd.hitY - y, Wd.hitX - x));
          else if (a.kind === 'brute') regPoly(ctx, x, y, 8, r, Math.PI / 8);
          else regPoly(ctx, x, y, 5, r + 1);
        };
        shape(); ctx.fillStyle = a.hit > 0.3 ? '#ffffff' : '#a9aeb8'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#15171b'; ctx.stroke();
        if (a.kind === 'brute') { ctx.fillStyle = '#15171b'; ctx.fillRect(x - 9, y - 4, 18, 4); ctx.fillRect(x - 3, y + 3, 6, 6); }
        else { ctx.fillStyle = '#15171b'; ctx.fillRect(x - 3.5, y - 2, 7, 3); }
        // hp bar
        const bw = r * 2;
        ctx.fillStyle = '#15171b'; ctx.fillRect(x - bw / 2 - 1, y - r - 9, bw + 2, 5); ctx.fillStyle = '#f4f4f2'; ctx.fillRect(x - bw / 2, y - r - 8, bw * a.hp, 3);
        if (a.frozen > 0) {
          const s = (r + 6) * (0.6 + 0.4 * a.frozen);
          ctx.globalAlpha = a.alpha * a.frozen; ctx.fillStyle = hexA(GC.cold, 0.35); ctx.fillRect(x - s, y - s, s * 2, s * 2);
          ctx.lineWidth = 3; ctx.strokeStyle = GC.cold; ctx.strokeRect(x - s, y - s, s * 2, s * 2);
          if (a.crack > 0) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - s, y - s * (1 - a.crack)); ctx.lineTo(x, y); ctx.lineTo(x + s * a.crack, y + s); ctx.stroke(); }
          ctx.globalAlpha = a.alpha;
        }
        // status badges
        const st = [];
        if (a.frozen > 0.5) st.push('cold'); else if (a.wet > 0.5) st.push('water');
        if (a.burning) st.push('fire');
        st.forEach((el, i) => badge(ctx, x + r + 6, y - r + 4 + i * 14, el));
      }
      ctx.restore();
    }
    // arrows
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => { c.strokeStyle = '#f4f4f2'; c.lineWidth = 2; c.beginPath(); c.moveTo(-12, 0); c.lineTo(9, 0); c.stroke(); c.beginPath(); polyPath(c, [[14, 0], [7, -4], [7, 4]]); c.fillStyle = '#f4f4f2'; c.fill(); });
    if (Wd.pulse > 0) { regPoly(ctx, Wd.hitX, Wd.hitY, 6, 6 + (1 - Wd.pulse) * 12, 0); ctx.lineWidth = 2; ctx.strokeStyle = hexA(GC.shield, Wd.pulse); ctx.stroke(); }
    for (const s of S.wardSparks) { ctx.fillStyle = hexA(GC.shield, 1 - s.age); ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); }
    for (const s of S.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); ctx.strokeStyle = GC.cold; ctx.lineWidth = 2; ctx.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size); ctx.restore(); }
    // numbers: dark pill + element colour
    const NC = { arcane: GC.arcane, crit: '#ffffff', fire: GC.fire, cold: GC.cold, water: '#5aa8e0', shield: GC.shield };
    for (const n of S.numbers) {
      const size = (n.big ? 16 : 13) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(n.text).width + 10;
      ctx.beginPath(); ctx.roundRect(n.x - tw / 2, n.y - size * 0.62, tw, size * 1.24, 4); ctx.fillStyle = n.kind === 'crit' ? GC.arcane : 'rgba(17,19,22,0.88)'; ctx.fill();
      ctx.fillStyle = NC[n.kind]; ctx.fillText(n.text, n.x, n.y + 0.5); ctx.restore();
    }
    // HUD
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 6); ctx.fillStyle = 'rgba(21,23,27,0.92)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#3a3f48'; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 11, 0, TAU); ctx.fillStyle = '#f4f4f2'; ctx.fill();
      ctx.font = '700 13px "Space Grotesk", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#15171b'; ctx.fillText(h.id === 'p1' ? '1' : '2', h.x + 18, h.y + 19);
      ctx.fillStyle = '#3a3f48'; ctx.fillRect(h.x + 38, h.y + 27, 140, 3); ctx.fillStyle = '#f4f4f2'; ctx.fillRect(h.x + 38, h.y + 27, 140 * h.hp, 3);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 13, q = h.queue[i];
        ctx.beginPath(); ctx.roundRect(cx - 10, cy - 8, 20, 16, 3); ctx.lineWidth = 1; ctx.strokeStyle = '#3a3f48'; ctx.stroke();
        if (!q) continue;
        const r = 6.5 * ease.back(q.pop);
        geoGlyph(ctx, q.el, cx, cy, r);
      }
    }
  }
  AS.register({
    id: 'geo', name: 'Clear Signal',
    refs: ['Into the Breach', 'Geometry Wars', 'Mini Metro'],
    feel: 'Readability first, almost a diagram. Shape says who (circles are players, sharp shapes are enemies), colour and particle shape say which element (triangles for fire, plus signs for frost, circles for water, a chevron band for arcane). It uses the colour-blind-safe Okabe-Ito palette, and every status is a badge. Enemy intent is drawn before it happens: the archer\'s aim line appears before the shot.',
    notes: {
      read: ['Best in class', 'Even at 100% chaos you can tell what each thing is and where it is going, and it survives colour-blindness and small screens. The cost is spectacle: hits feel less juicy.'],
      tone: ['Weak on its own', 'Clean and smart rather than cartoony; slapstick needs animation and sound to land. Better as a readability layer or accessibility mode on top of a richer style.'],
      cost: ['Lowest', 'Programmer art that ships. Most of the effort goes into the design of the visual language, not into assets.'],
    },
    render: geoRender,
  });
})();
