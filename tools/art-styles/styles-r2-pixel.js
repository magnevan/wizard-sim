/* Round 2: the Chunky Pixel family. Three variants, each pushing one axis of the
 * round-1 Chunky Pixel style (which read as "weak at this scale" and costly because
 * every spell combination needs hand-animated frames):
 *   pixel-hibit   hi-bit (320x200) world, mid-dark, lit by the spells themselves
 *   pixel-hybrid  pixel characters and ground, smooth particle/vector spell VFX on top
 *   pixel-bold    very low-res (128x80) poster style: PICO-8's 16 colours, big sprites
 * All three must make the beam's Fire payload readable: an arcane beam that carries
 * fire, and a brute that burns because of it. Depends on scene.js and styles-a.js (AS.util). */
(function () {
  const { W, H, TAU, lerp, clamp, seg, rand, hexA, mix, ease, mod } = AS;
  const { teardrop, blobPts, iceFrontPath, polyPath, beamPts, strokePts } = AS.util;

  // =====================================================================
  // shared pixel machinery (private to this file; each style gets its own buffers)
  // =====================================================================
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  function pixBuf(PX, palette) {
    const LW = Math.round(W / PX), LH = Math.round(H / PX);
    const PAL = palette.map(rgb), near = new Map(), layers = {};
    function nearest(r, g, b) {
      const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
      let v = near.get(key);
      if (v !== undefined) return v;
      let best = 0, bd = 1e9;
      for (let i = 0; i < PAL.length; i++) { const p = PAL[i], d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11; if (d < bd) { bd = d; best = i; } }
      near.set(key, best); return best;
    }
    // A cleared low-res canvas. raw=false draws in logical 640x400 units.
    function layer(name, raw) {
      let c = layers[name];
      if (!c) { c = layers[name] = document.createElement('canvas'); c.width = LW; c.height = LH; }
      const x = c.getContext('2d', { willReadFrequently: true });
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, LW, LH);
      if (!raw) x.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
      x.imageSmoothingEnabled = false; x.lineJoin = 'round'; x.lineCap = 'round';
      return [c, x];
    }
    // Snap a layer to the palette with hard alpha ('hard') or ordered-dither alpha ('dither'),
    // plus an optional 1px outline colour around everything opaque.
    function quantize(c, mode, outline) {
      const x = c.getContext('2d', { willReadFrequently: true });
      const img = x.getImageData(0, 0, LW, LH), d = img.data;
      for (let p = 0, i = 0; p < LW * LH; p++, i += 4) {
        const a = d[i + 3]; if (!a) continue;
        const th = mode === 'dither' ? BAYER[((p % LW) & 3) + ((((p / LW) | 0)) & 3) * 4] * 255 : 110;
        if (a <= th) { d[i + 3] = 0; continue; }
        const q = PAL[nearest(d[i], d[i + 1], d[i + 2])];
        d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = 255;
      }
      if (outline) {
        const O = rgb(outline), al = new Uint8Array(LW * LH);
        for (let p = 0; p < al.length; p++) al[p] = d[p * 4 + 3];
        for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
          const p = y * LW + xx; if (al[p]) continue;
          if ((xx > 0 && al[p - 1]) || (xx < LW - 1 && al[p + 1]) || (y > 0 && al[p - LW]) || (y < LH - 1 && al[p + LW])) {
            d[p * 4] = O[0]; d[p * 4 + 1] = O[1]; d[p * 4 + 2] = O[2]; d[p * 4 + 3] = 255;
          }
        }
      }
      x.putImageData(img, 0, 0);
    }
    // Hard-pixel upscale onto the card canvas.
    function blit(ctx, c) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    }
    return { PX, LW, LH, layer, quantize, blit };
  }

  // 3x5 pixel font and 5x5 element icons (raw pixel coordinates).
  const FONT = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
    '!': '010010010000010', W: '101101101111101', E: '111100110100111', T: '111010010010010', F: '111100110100100',
    R: '110101110101101', O: '010101101101010', Z: '111001010100111', N: '110101101101101', B: '110101110101110',
    L: '100100100100111', C: '011100100100011', K: '101101110101101', P: '110101110100100', U: '101101101101111',
    '+': '000010111010000', ' ': '000000000000000',
  };
  function pxText(x, str, px, py, col, outline, k = 1) {
    const draw = (ox, oy, c) => {
      x.fillStyle = c;
      for (let j = 0; j < str.length; j++) { const g = FONT[str[j]] || FONT[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') x.fillRect(px + (j * 4 + (i % 3)) * k + ox, py + ((i / 3) | 0) * k + oy, k, k); }
    };
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) draw(ox, oy, outline);
    draw(0, 0, col);
    return (str.length * 4 - 1) * k;
  }
  const ICON = {
    fire: '0010001110011101111101110', water: '0010001110111111111101110', cold: '1010101110111110111010101',
    arcane: '0010001110111110111000100', shield: '1111111111111110111000100',
  };
  function pxIcon(x, el, ix, iy, col, outline, k = 1) {
    const ic = ICON[el];
    const draw = (ox, oy, c) => { x.fillStyle = c; for (let i = 0; i < 25; i++) if (ic[i] === '1') x.fillRect(ix + (i % 5) * k + ox, iy + ((i / 5) | 0) * k + oy, k, k); };
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) draw(ox, oy, outline);
    draw(0, 0, col);
  }

  // Actor drawing from the shared part lists. o: { sc, shade(col), burn(col, k), minLine }
  function colOf(pal, a, role) { return role === 'orb' ? (pal.el[a.element] || '#ffffff') : (pal[a.team]?.[role] ?? pal[a.kind]?.[role] ?? pal.common[role] ?? '#ff00ff'); }
  function drawActor(x, a, pal, o) {
    const sc = o.sc || 1, f = AS.xf(a, sc), parts = AS.parts(a);
    for (const p of parts) {
      const w = p.pts.map(f);
      let col = colOf(pal, a, p.role);
      if (a.burning > 0 && a.kind === 'brute' && o.burn) col = o.burn(col, a.burning);
      x.beginPath(); AS.partPath(x, p, w);
      if (p.line) { x.strokeStyle = col; x.lineWidth = Math.max(o.minLine || 3, p.w * 1.4 * sc); x.stroke(); continue; }
      x.fillStyle = col; x.fill();
      if (p.big && o.shade) { x.save(); x.clip(); x.fillStyle = o.shade(col); x.fillRect(a.x + 3 * sc, a.y - 110 * sc, 70 * sc, 120 * sc); x.restore(); }
    }
  }
  function flashActor(x, a, col, sc = 1) {
    const f = AS.xf(a, sc); x.fillStyle = col;
    for (const p of AS.parts(a)) if (!p.line) { x.beginPath(); AS.partPath(x, p, p.pts.map(f)); x.fill(); }
  }
  // Ice block over a frozen actor: pale fill, body silhouette, glints, cracks.
  function iceBlock(x, a, PX, sc, c) {
    const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * sc * a.frozen, rr = r * sc;
    const sn = (v) => Math.round(v / PX) * PX;
    const bx = sn(a.x - rr - 4), by = sn(a.y + 4 - hh), bw = sn(2 * rr + 8), bh = sn(hh);
    x.fillStyle = c.fill; x.fillRect(bx, by, bw, bh);
    x.save(); x.beginPath(); x.rect(bx, by, bw, bh); x.clip();
    flashActor(x, a, c.body, sc);
    x.fillStyle = c.edge; x.fillRect(bx, by + bh - PX * 2, bw, PX * 2);
    x.restore();
    x.fillStyle = c.glint; x.fillRect(bx + PX, by + PX, PX, PX * 3); x.fillRect(bx + PX * 3, by + PX, PX, PX); x.fillRect(bx + bw - PX * 2, by + bh - PX * 4, PX, PX * 2);
    if (a.crack > 0.3) { x.fillStyle = c.crack; for (let i = 0; i < 3; i++) x.fillRect(bx + PX + Math.floor(rand(i, 1) * Math.max(1, bw / PX - 2)) * PX, by + Math.floor(rand(i, 2) * Math.max(1, bh / PX - 2)) * PX, PX, PX * 2); }
  }

  // ---- the payload: things every variant uses to show "arcane beam carrying fire" ----
  // Mirrors scene.js: brute.burning at time t (needed for particles spawned earlier).
  const burnAt = (t) => seg(t, 1.6, 2.0) * (1 - seg(t, 5.0, 5.8));
  // Flames licking off the burning brute (pure function of t, loops cleanly).
  function bruteFlames(S, rate, sc = 1) {
    const b = S.brute;
    return AS.emit(S.t, { rate: rate * S.D, life: 0.6 }, (i, age, ts) => {
      if (rand(91, i, 0) > burnAt(mod(ts, AS.LOOP))) return null;
      const r1 = rand(91, i, 1), r2 = Math.sqrt(rand(91, i, 2)), r3 = rand(91, i, 3), head = r3 < 0.22;
      const lx = head ? (r1 - 0.5) * 22 : Math.cos(r1 * TAU) * 22 * r2, ly = head ? -60 : -30 + Math.sin(r1 * TAU) * 18 * r2;
      return { x: b.x + (lx * b.face + Math.sin(age * 6 + r1 * 9) * 2) * sc, y: b.y + (ly + b.bob) * sc - age * (22 + 22 * r3), age, size: (1 - age * 0.7) * (4 + 5 * r3) * Math.min(1, age * 6) * sc, r: r3 };
    });
  }
  // Fixed flame tongues on the brute's shoulders and head; height scales with the burn.
  const BURN_SPOTS = [[-16, -44, 6], [4, -50, 7], [20, -38, 6], [-24, -24, 5], [0, -64, 5], [26, -18, 5], [-6, -30, 6]];
  const BOLD_SPOTS = [[-20, -46, 6], [8, -56, 6], [24, -40, 6], [-4, -66, 5]];   // edges only, so the face stays clear
  function bruteTongues(S, sc = 1, spots = BURN_SPOTS) {
    const b = S.brute, k = b.burning, f = AS.xf(b, sc), out = [];
    if (k <= 0.02) return out;
    spots.forEach(([lx, ly, w], j) => {
      const [x, y] = f([lx, ly]);
      out.push({ x, y, w: w * sc * (0.6 + 0.4 * k), h: (12 + 7 * Math.sin(S.t * TAU * 3 + j * 1.9)) * sc * k, sway: Math.sin(S.t * TAU * 2 + j) * 3 * sc });
    });
    return out;
  }
  function beamGeom(B) { const dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy) || 1; return { dx, dy, L, nx: -dy / L, ny: dx / L }; }
  const envAt = (p) => Math.min(1, p * 7) * Math.min(1, (1 - p) * 9);
  // Fire strand coiled around the beam. The wave travels caster -> target. z>0 = in front.
  function helix(B, t, n, amp, turns, speed, phase) {
    const g = beamGeom(B), out = [];
    for (let i = 0; i <= n; i++) {
      const p = i / n, th = TAU * (p * turns - t * speed) + phase, e = envAt(p) * amp;
      out.push({ x: B.x1 + g.dx * p + g.nx * Math.sin(th) * e, y: B.y1 + g.dy * p + g.ny * Math.sin(th) * e, z: Math.cos(th), p });
    }
    return out;
  }
  // Fireballs riding the beam toward the target.
  function beads(B, t, n, amp, speed) {
    const g = beamGeom(B), out = [];
    for (let k = 0; k < n; k++) {
      const p = mod(t * speed + k / n, 1), th = TAU * (p * 2.2) - t * 9 + k * 2.1, e = envAt(p) * amp;
      out.push({ x: B.x1 + g.dx * p + g.nx * Math.sin(th) * e, y: B.y1 + g.dy * p + g.ny * Math.sin(th) * e, z: Math.cos(th), p, k, ux: g.dx / g.L, uy: g.dy / g.L });
    }
    return out;
  }
  function strokeHelix(x, pts, front) {
    x.beginPath();
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if ((a.z + b.z > 0) === front) { x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); } }
    x.stroke();
  }
  // Payload tag over P1's HUD: [arcane] + [fire] while the beam is on.
  function payloadTag(x, S, PX, cols, k) {
    if (!S.beam) return;
    const h = S.hud[0], tx = Math.round(h.x / PX) + 1, ty = Math.round(h.y / PX) - 7 * k - 2;
    x.fillStyle = cols.bg; x.fillRect(tx - 1, ty - 1, 19 * k + 3, 5 * k + 3);
    pxIcon(x, 'arcane', tx + 1, ty + 1, cols.arcane, null, k);
    pxText(x, '+', tx + 7 * k, ty + 1, cols.plus, null, k);
    pxIcon(x, 'fire', tx + 13 * k, ty + 1, cols.fire, null, k);
  }
  // Burning status icon floating over the brute.
  function burnIcon(x, S, PX, col, outline, k, sc = 1) {
    const b = S.brute; if (b.burning < 0.25) return;
    // beside the right shoulder, under the rising damage numbers
    const ix = Math.round((b.x + 34 * sc) / PX), iy = Math.round((b.y - (60 + 3 * Math.sin(S.t * TAU * 1.5)) * sc) / PX) - 5 * k;
    pxIcon(x, 'fire', ix, iy, col, outline, k);
  }

  // =====================================================================
  // 1. HI-BIT LIT PIXEL  (320x200, light map, mid-dark world)
  // =====================================================================
  const HB_PX = 2, HB_DARK = '#16121e';
  const HB = {
    el: { fire: '#ff8a2a', water: '#2a8cff', cold: '#7ff0ff', arcane: '#ff3d9a', shield: '#ffd35a' },
    p1: { robe: '#d8383f', trim: '#f2b440', sleeve: '#9a2232', hat: '#d8383f', band: '#f2b440' },
    p2: { robe: '#2f78d8', trim: '#bcd8f0', sleeve: '#1e4c96', hat: '#2f78d8', band: '#bcd8f0' },
    wizard: { skin: '#e8b796', beard: '#f4f0e8', staff: '#9a6a48', hand: '#e8b796' },
    goblin: { body: '#6cbf4a', belly: '#d8d070', dark: '#2c5a3a', club: '#8a5a3a' },
    archer: { body: '#6cbf4a', cloth: '#7a4e3a', dark: '#2c5a3a', bow: '#c8945a', string: '#c0cbdc', arrow: '#e8d8b0', hand: '#6cbf4a' },
    brute: { body: '#b8503c', belly: '#d88a5a', dark: '#5a2e2c', horn: '#e8dcc0', brow: '#1a1420' },
    imp: { body: '#b05090', wing: '#5e3466', horn: '#f2d860', tail: '#5e3466' },
    common: { eye: '#16121e', eyeWhite: '#ffffff', tooth: '#ffffff' },
  };
  const hbShade = (c) => mix(c, '#2a1e3a', 0.4);
  const hbBurn = (c, k) => mix(c, '#4a1a12', 0.3 * k);
  const HB_ICE = { fill: '#8adcf0', body: '#3a8ac8', edge: '#5aa8d8', glint: '#ffffff', crack: '#1e4c8a' };
  const HB_DECAL = ['#2a1e24', '#4a2a2a', '#1e4c8a', '#2a7ac8', '#7ff0ff', '#bfe8f4', '#ffffff', '#8ab0c8', '#5a7890'];
  const hbPal = (() => {
    const s = new Set([HB_DARK, ...HB_DECAL, ...Object.values(HB_ICE), '#e8d8b0', '#c0cbdc', '#ffffff']);
    for (const g of Object.values(HB)) for (const c of Object.values(g)) { s.add(c); s.add(hbShade(c)); s.add(hbBurn(c, 1)); s.add(hbBurn(hbShade(c), 1)); }
    return [...s];
  })();
  const HB_FX = ['#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#c8302a', '#7a1e2a',
    '#ffffff', '#ffc0e0', '#ff6ab0', '#ff2d8a', '#a01e6a', '#4a1450',
    '#e8ffff', '#7ff0ff', '#2ac0f0', '#1a70c0', '#8ad0ff', '#2a8cff', '#1a50b0',
    '#fff0b0', '#ffd35a', '#c08a2a', '#3a3448', '#544a60', '#7a7090'];
  const hbA = pixBuf(HB_PX, hbPal), hbF = pixBuf(HB_PX, HB_FX);

  function hbGround() {
    return AS.cached('r2-hibit-ground', hbA.LW, hbA.LH, 1, (x, LW, LH) => {
      const G = ['#253f33', '#2e4c3a', '#385a40', '#456a48', '#557c50'];
      const D = ['#5a4434', '#6e5440', '#82664c', '#967a5a'];
      for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
        const lx = xx * HB_PX, ly = y * HB_PX, r = rand(xx, y, 7);
        const pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        const dist = Math.abs(ly - pathY), edge = 18 + rand(xx >> 2, 3) * 8;
        const n = Math.sin(xx * 0.09 + Math.sin(y * 0.12) * 1.5) + Math.sin(y * 0.11 + xx * 0.035) * 0.8 + (r - 0.5) * 0.7;
        let c;
        if (dist < edge) c = D[clamp(Math.floor(1.6 + n * 0.7 + (rand(xx, y, 9) - 0.5) * 1.2 - (dist > edge - 4 ? 1 : 0)), 0, 3)];
        else if (dist < edge + 4 && r < 0.55) c = G[0];
        else c = G[clamp(Math.floor(2 + n * 1.0), 0, 4)];
        x.fillStyle = c; x.fillRect(xx, y, 1, 1);
      }
      // grass tufts, pebbles, flowers
      for (let i = 0; i < 120; i++) {
        const gx = Math.floor(rand(i, 11) * LW), gy = Math.floor(rand(i, 12) * LH);
        const lx = gx * HB_PX, ly = gy * HB_PX, pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        if (Math.abs(ly - pathY) < 26) { x.fillStyle = '#a89070'; x.fillRect(gx, gy, 2, 1); x.fillStyle = '#4a382c'; x.fillRect(gx, gy + 1, 2, 1); continue; }
        x.fillStyle = '#1e3428'; x.fillRect(gx - 1, gy + 2, 5, 1);
        x.fillStyle = '#6a9a58'; x.fillRect(gx, gy, 1, 2); x.fillRect(gx + 2, gy, 1, 2); x.fillStyle = '#7eae64'; x.fillRect(gx + 1, gy - 1, 1, 3);
      }
      for (let i = 0; i < 26; i++) { const fx = Math.floor(rand(i, 21) * LW), fy = Math.floor(rand(i, 22) * LH); x.fillStyle = i % 3 ? '#e8e0f0' : '#f08a9a'; x.fillRect(fx, fy, 1, 1); x.fillStyle = '#2a4a30'; x.fillRect(fx, fy + 1, 1, 1); }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        const cx = Math.round(rx / HB_PX), cy = Math.round(ry / HB_PX), r = Math.round(rr / HB_PX);
        for (let y = -r - 1; y <= r + 1; y++) for (let xx = -r - 1; xx <= r + 1; xx++) {
          const d = (xx * xx) / (r * r) + (y * y) / (r * r * 0.7);
          if (d > 1.15) continue;
          let c = d > 0.85 ? '#16121e' : (xx + y < -r * 0.6 ? '#a8b2c4' : xx + y < 0 ? '#7e88a0' : xx + y < r * 0.7 ? '#5a6278' : '#3a3e52');
          if (d <= 0.85 && rand(xx, y, rr) < 0.08) c = '#3a3e52';
          x.fillStyle = c; x.fillRect(cx + xx, cy + y, 1, 1);
        }
        x.fillStyle = 'rgba(10,8,16,0.45)'; x.fillRect(cx - r, cy + Math.round(r * 0.85) + 1, 2 * r + 2, 2);
      }
    });
  }
  // Coloured lights: [x, y, radius, colour, intensity]. Spells are the light sources.
  function hbLights(S) {
    const t = S.t, L = [], E = HB.el, flick = 0.9 + Math.sin(t * TAU * 3) * 0.05 + Math.sin(t * TAU * 7 + 1) * 0.05;
    const F = S.fire; L.push([F.x, F.y - 10, 140, '#ff7a20', 0.62 * flick], [F.x, F.y - 6, 60, '#ffb060', 0.3 * flick]);
    L.push([S.imp.x, S.imp.y - 14, 50, '#ff8a30', 0.45]);
    const b = S.brute;
    if (b.burning > 0) L.push([b.x, b.y - 30, 110, '#ff7020', 0.62 * b.burning * flick]);
    const tip1 = AS.staffTip(S.players[0]), tip2 = AS.staffTip(S.players[1]);
    for (const pl of S.players) L.push([pl.x, pl.y - 26, 52, '#c8c0e8', 0.16]);   // a small personal light keeps players readable
    L.push([tip1[0], tip1[1], 34, E.arcane, 0.3]);
    L.push([tip2[0], tip2[1], 34, S.players[1].element === 'water' ? E.water : E.cold, 0.3]);
    if (S.beam) {
      const B = S.beam, o = B.on;
      for (let i = 0; i <= 8; i++) { const p = i / 8; L.push([lerp(B.x1, B.x2, p), lerp(B.y1, B.y2, p), 46, '#ff2d8a', 0.28 * o]); }
      L.push([B.x2, B.y2, 80, '#ff5ab0', 0.55 * o], [B.x1, B.y1, 50, '#ff3d9a', 0.4 * o]);
      for (const bd of beads(B, t, 6, 7, 0.8)) L.push([bd.x, bd.y, 26, '#ff9a30', 0.42 * o * envAt(bd.p)]);
    }
    const Wd = S.ward; L.push([Wd.x, Wd.y, Wd.r + 34, E.shield, 0.2 + 0.45 * Wd.pulse]);
    if (Wd.pulse > 0) L.push([Wd.hitX, Wd.hitY, 40, '#fff0b0', 0.6 * Wd.pulse]);
    const sp = S.spray;
    for (let i = 1; i <= 4; i++) {
      const x = sp.x + Math.cos(sp.ang) * i * 50, y = sp.y + Math.sin(sp.ang) * i * 50;
      if (sp.water > 0) L.push([x, y, 44, E.water, 0.22 * sp.water]);
      if (sp.cold > 0) L.push([x, y, 52, E.cold, 0.3 * sp.cold]);
    }
    const P = S.puddle; if (P.ice > 0 && P.front > 0) L.push([P.x - P.rx * (1 - P.front), P.y, 50 + 50 * P.front, E.cold, 0.22 * P.ice]);
    const sg = AS.since(t, 5.4, 0.6); if (sg >= 0) for (const [gx, gy] of AS.POS.gob) L.push([gx, gy - 14, 60, '#bff8ff', 0.6 * (1 - sg)]);
    return L;
  }
  function hibitRender(ctx, S) {
    const t = S.t, E = HB.el, { LW, LH } = hbA;
    // ---- lit world: ground, decals, actors ----
    const [base, bx] = hbA.layer('base', true);
    bx.drawImage(hbGround(), 0, 0);
    const [dc, d] = hbA.layer('decal');
    const F = S.fire;
    d.beginPath(); polyPath(d, blobPts(F.x, F.y, F.rx, F.ry, 5, 24, 0.16)); d.fillStyle = '#2a1e24'; d.fill();
    d.beginPath(); polyPath(d, blobPts(F.x, F.y + 2, F.rx * 0.7, F.ry * 0.6, 9, 18, 0.2)); d.fillStyle = '#4a2a2a'; d.fill();
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 30, 0.1);
    d.beginPath(); polyPath(d, pud); d.fillStyle = '#1e4c8a'; d.fill();
    d.beginPath(); polyPath(d, blobPts(P.x - 3, P.y - 2, P.rx - 5, P.ry - 5, 2, 30, 0.1)); d.fillStyle = '#2a7ac8'; d.fill();
    d.save(); d.beginPath(); polyPath(d, pud); d.clip();
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; if (k > 0.7) continue; d.beginPath(); d.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); d.lineWidth = 2; d.strokeStyle = '#7ff0ff'; d.stroke(); }
    if (P.ice > 0.5 && P.front > 0) {
      d.beginPath(); iceFrontPath(d, P, 7); d.fillStyle = '#bfe8f4'; d.fill();
      d.save(); d.clip();
      d.fillStyle = '#8ab0c8'; d.fillRect(P.x - P.rx, P.y + P.ry - 10, 2 * P.rx, 12);
      d.fillStyle = '#ffffff'; for (let i = 0; i < 7; i++) d.fillRect(P.x - P.rx + rand(i, 71) * 2 * P.rx, P.y - P.ry + rand(i, 72) * 2 * P.ry, 8 + rand(i, 73) * 6, 2);
      if (P.crack > 0) { d.strokeStyle = '#5a7890'; d.lineWidth = 2; d.beginPath(); for (let i = 0; i < 9 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; d.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); d.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } d.stroke(); }
      d.restore();
    }
    d.restore();
    hbA.quantize(dc, 'hard', null);
    bx.drawImage(dc, 0, 0);
    // contact shadows
    bx.fillStyle = 'rgba(12,8,20,0.5)';
    for (const a of S.actors) { if (a.alpha < 0.5) continue; const [r] = AS.SIZE[a.kind]; bx.beginPath(); bx.ellipse(Math.round(a.x / HB_PX), Math.round(a.y / HB_PX), Math.round(r * 0.9 / HB_PX), 2, 0, 0, TAU); bx.fill(); }
    const [ac, x] = hbA.layer('actors');
    for (const a of S.actors) {
      if (a.alpha < 0.5) continue;
      drawActor(x, a, HB, { shade: hbShade, burn: hbBurn, minLine: 2.5 });
      if (a.frozen > 0.3) iceBlock(x, a, HB_PX, 1, HB_ICE);
    }
    for (const ar of S.arrows) {
      if (ar.alpha < 0.4) continue;
      x.save(); x.translate(ar.x, ar.y); x.rotate(ar.ang);
      x.fillStyle = '#e8d8b0'; x.fillRect(-13, -1, 22, 2); x.fillStyle = '#c0cbdc'; x.fillRect(8, -3, 5, 6); x.fillStyle = '#ffffff'; x.fillRect(-15, -3, 4, 6);
      x.restore();
    }
    hbA.quantize(ac, 'hard', HB_DARK);
    bx.drawImage(ac, 0, 0);
    // ---- light map: ambient dusk + coloured spell lights, banded and dithered ----
    const [lc, lx] = hbA.layer('light');
    lx.fillStyle = '#3a3c5e'; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'lighter';
    for (const [px, py, r, c, a] of hbLights(S)) {
      if (a <= 0.005) continue;
      const g = lx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, hexA(c, a)); g.addColorStop(0.5, hexA(c, a * 0.45)); g.addColorStop(1, hexA(c, 0));
      lx.fillStyle = g; lx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    const bimg = bx.getImageData(0, 0, LW, LH), bd = bimg.data, ld = lx.getImageData(0, 0, LW, LH).data;
    const LEV = 7, GAIN = 2.15;
    for (let p = 0, i = 0; p < LW * LH; p++, i += 4) {
      const th = bay(p % LW, (p / LW) | 0);
      for (let c = 0; c < 3; c++) { const q = Math.floor(ld[i + c] * LEV / 255 + th) / LEV; bd[i + c] = Math.min(255, bd[i + c] * q * GAIN); }
    }
    const [fin, f] = hbA.layer('final', true);
    f.putImageData(bimg, 0, 0);
    // ---- emissive layer (unlit, dithered glows) ----
    const [fc, g] = hbF.layer('fx');
    const glow = (gx, gy, r, col, a) => { if (r <= 0.5 || a <= 0) return; const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(gx - r, gy - r, r * 2, r * 2); };
    const dot = (sx, sy, s, col) => { g.fillStyle = col; const k = Math.max(HB_PX, Math.round(s / HB_PX) * HB_PX); g.fillRect(Math.round(sx / HB_PX) * HB_PX - k / 2, Math.round(sy / HB_PX) * HB_PX - k / 2, k, k); };
    const fireCol = (age) => age < 0.25 ? '#fff4c0' : age < 0.5 ? '#ffd860' : age < 0.75 ? '#ff9a30' : '#ff5a20';
    for (const a of S.actors) if (a.hit > 0.5 && a.alpha >= 0.5) { g.globalAlpha = 0.55; flashActor(g, a, '#ffc0e0'); g.globalAlpha = 1; }   // dithered tint, so the body still reads
    // burning grass
    for (const tg of S.tongues) { g.beginPath(); teardrop(g, tg.x, tg.y, tg.w, tg.h, tg.sway); g.fillStyle = '#c8302a'; g.fill(); }
    for (const tg of S.tongues) { g.beginPath(); teardrop(g, tg.x, tg.y - 1, tg.w * 0.65, tg.h * 0.66, tg.sway * 0.6); g.fillStyle = '#ff9a30'; g.fill(); }
    for (const tg of S.tongues) { g.beginPath(); teardrop(g, tg.x, tg.y - 2, tg.w * 0.32, tg.h * 0.34, tg.sway * 0.3); g.fillStyle = '#fff4c0'; g.fill(); }
    for (const fl of [...S.flames, ...S.impFlames]) if (fl.size > 0.8) dot(fl.x, fl.y, fl.size * 1.1, fireCol(fl.age));
    for (const s of S.smoke) if (s.age > 0.15) { g.globalAlpha = 0.6 * (1 - s.age); g.beginPath(); g.arc(s.x, s.y, s.size * 0.55, 0, TAU); g.fillStyle = '#3a3448'; g.fill(); g.globalAlpha = 1; }
    for (const e of S.embers) dot(e.x, e.y, 2, e.r > 0.5 ? '#ffd860' : '#ff9a30');
    // the brute burns (payload)
    const bt = bruteTongues(S);
    for (const tg of bt) { g.beginPath(); teardrop(g, tg.x, tg.y, tg.w, tg.h, tg.sway); g.fillStyle = '#c8302a'; g.fill(); }
    for (const tg of bt) { g.beginPath(); teardrop(g, tg.x, tg.y - 1, tg.w * 0.6, tg.h * 0.62, tg.sway * 0.6); g.fillStyle = '#ff9a30'; g.fill(); }
    for (const tg of bt) { g.beginPath(); teardrop(g, tg.x, tg.y - 2, tg.w * 0.3, tg.h * 0.3, tg.sway * 0.3); g.fillStyle = '#fff4c0'; g.fill(); }
    for (const fl of bruteFlames(S, 26)) dot(fl.x, fl.y, fl.size, fireCol(fl.age));
    // water and frost
    for (const m of S.mist) glow(m.x, m.y, m.size, '#e8ffff', 0.4 / Math.sqrt(Math.max(1, S.D)) * Math.sin(m.age * Math.PI));
    for (const dr of S.drips) dot(dr.x, dr.y, 2, '#8ad0ff');
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.8, 1);
      if (p.kind === 'water') { dot(p.x, p.y, (3 + p.size * 0.5) * k, p.r > 0.5 ? '#2a8cff' : '#8ad0ff'); continue; }
      glow(p.x, p.y, (5 + p.size * 1.3) * k, '#7ff0ff', 0.5); if (p.r > 0.6) dot(p.x, p.y, 2, '#ffffff');
    }
    if (S.spray.cold + S.spray.water > 0) glow(S.spray.x, S.spray.y, 13, S.spray.cold > 0 ? '#7ff0ff' : '#2a8cff', 0.95);
    // the beam: arcane core wrapped in a fire strand that flows to the target
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 30, 2 * o, 0.9, 30);
      const hx = helix(B, t, 60, 8 * o, 3.2, 1.4, 0);
      g.lineCap = 'round';
      g.lineWidth = 3; g.strokeStyle = '#c8302a'; strokeHelix(g, hx, false);
      g.lineCap = 'butt';
      for (const [lw, col] of [[13 * o, '#4a1450'], [9 * o, '#a01e6a'], [5.5 * o, '#ff2d8a'], [3 * o, '#ffc0e0'], [1.2 * o, '#ffffff']]) { g.lineWidth = lw; g.strokeStyle = col; strokePts(g, pts); }
      g.lineCap = 'round';
      g.lineWidth = 3.2; g.strokeStyle = '#ff9a30'; strokeHelix(g, hx, true);
      g.lineWidth = 1.2; g.strokeStyle = '#ffd860'; strokeHelix(g, hx, true);
      for (const bd of beads(B, t, 6, 7, 0.8)) {
        const s = envAt(bd.p) * o; if (s < 0.2) continue;
        for (let j = 1; j <= 3; j++) dot(bd.x - bd.ux * j * 6, bd.y - bd.uy * j * 6, 3.5 - j * 0.6, j === 1 ? '#ff9a30' : '#c8302a');
        dot(bd.x, bd.y, 7 * s, '#ff5a20'); dot(bd.x, bd.y, 4.5 * s, '#ffd860'); dot(bd.x - 1, bd.y - 1, 2, '#fff4c0');
      }
      glow(B.x2, B.y2, 22 * o, '#ff6ab0', 0.75); glow(B.x2, B.y2, 14 * o, '#ff9a30', 0.6);
      dot(B.x2, B.y2, 7 * o + (Math.floor(t * 15) % 2) * 3, '#ffffff');
      glow(B.x1, B.y1, 12 * o, '#ff6ab0', 0.8); dot(B.x1, B.y1, 7 * o, '#ffc0e0');
      for (const s of S.beamSparks) dot(s.x, s.y, 3, s.r < 0.45 ? (s.age < 0.5 ? '#ffd860' : '#ff9a30') : (s.r > 0.75 ? '#ffffff' : '#ff6ab0'));
    } else { const tp = AS.staffTip(S.players[0]); dot(tp[0], tp[1], 5, '#ff6ab0'); }
    // ward
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    const wg = g.createRadialGradient(Wd.x, Wd.y, wr * 0.55, Wd.x, Wd.y, wr);
    wg.addColorStop(0, hexA('#ffd35a', 0)); wg.addColorStop(1, hexA('#ffd35a', 0.32 + Wd.pulse * 0.4));
    g.fillStyle = wg; g.beginPath(); g.arc(Wd.x, Wd.y, wr, 0, TAU); g.fill();
    g.beginPath(); g.arc(Wd.x, Wd.y, wr, 0, TAU); g.lineWidth = 2.4; g.strokeStyle = '#ffd35a'; g.stroke();
    for (let i = 0; i < 4; i++) { const a = t * 1.2 + i / 4 * TAU; dot(Wd.x + Math.cos(a) * wr, Wd.y + Math.sin(a) * wr, 4, '#fff0b0'); }
    for (const s of S.wardSparks) dot(s.x, s.y, 3, s.r > 0.4 ? '#ffd35a' : '#ffffff');
    for (const s of S.shards) if (s.age < 0.85) { dot(s.x, s.y, s.size * 0.8, s.r > 0.5 ? '#ffffff' : '#7ff0ff'); }
    hbF.quantize(fc, 'dither', null);
    f.drawImage(fc, 0, 0);
    // ---- unlit UI: numbers, status, HUD ----
    const NC = { arcane: '#ffc0e0', crit: '#ffd860', fire: '#ff9a30', cold: '#7ff0ff', water: '#8ad0ff', shield: '#ffd35a' };
    for (const n of S.numbers) {
      if (n.alpha < 0.4) continue;
      const txt = n.text.toUpperCase(), k = n.big ? 2 : 1, w = (txt.length * 4 - 1) * k;
      pxText(f, txt, Math.round(n.x / HB_PX - w / 2), Math.round(n.y / HB_PX - 2.5 * k), NC[n.kind], HB_DARK, k);
    }
    burnIcon(f, S, HB_PX, '#ff9a30', HB_DARK, 2);
    for (const h of S.hud) {
      const hx = Math.round(h.x / HB_PX), hy = Math.round(h.y / HB_PX), hw = Math.round(h.w / HB_PX), hh = 18;
      f.fillStyle = HB_DARK; f.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
      f.fillStyle = '#262b44'; f.fillRect(hx, hy, hw, hh); f.fillStyle = '#3a4466'; f.fillRect(hx, hy, hw, 1);
      pxText(f, h.name, hx + 3, hy + 4, h.team === 'p1' ? '#ff5a5a' : '#4aa8ff', null, 2);
      f.fillStyle = '#3e2731'; f.fillRect(hx + 22, hy + 14, 66, 2); f.fillStyle = '#6cbf4a'; f.fillRect(hx + 22, hy + 14, Math.round(66 * h.hp), 2);
      for (let i = 0; i < 5; i++) {
        const ix = hx + 22 + i * 13, iy = hy + 2, q = h.queue[i];
        if (!q || q.pop < 0.5) { f.fillStyle = '#3a4466'; f.fillRect(ix + 4, iy + 4, 2, 2); continue; }
        pxIcon(f, q.el, ix, iy, E[q.el], null, 2);
      }
    }
    payloadTag(f, S, HB_PX, { bg: HB_DARK, arcane: E.arcane, fire: E.fire, plus: '#ffffff' }, 1);
    hbA.blit(ctx, fin);
  }
  AS.register({
    id: 'pixel-hibit', name: 'Hi-Bit Lit Pixel', pixelWidth: hbA.LW, family: 'pixel', round: 2,
    refs: ['Hyper Light Drifter', 'Eastward', 'Children of Morta'],
    feel: 'Pixel art at 320 by 200, twice the round-1 resolution, in a mid-dark dusk world that the spells light up. A banded, dithered light map makes the fire wash the ground orange, the beam paint its path pink and the ward pool gold, so the light itself shows where the action is.',
    notes: {
      read: ['Good, and the payload reads', 'Twice the pixels gives goblins real faces and the light map pulls the eye to every spell. The arcane beam is wrapped in an orange fire strand with fireballs riding it to the target; the brute then lights up orange from its own flames, with a fire status icon. It reads as "pink beam that carries fire", though the strand is thin next to the bright core at full chaos.'],
      tone: ['Good, a bit moody', 'Modern indie action rather than retro arcade. The dusk keeps it from being cartoon-bright, so the slapstick would have to come from animation.'],
      cost: ['Medium', 'Sprites cost about four times the round-1 pixels to draw, but the lighting is generic: a new element combination only needs a light colour and a palette ramp, not new hand-drawn lit frames.'],
    },
    render: hibitRender,
  });

  // =====================================================================
  // 2. PIXEL + SMOOTH VFX HYBRID  (256x160 pixel world, full-res particles on top)
  // =====================================================================
  const HY_PX = 2.5;
  const EDG = ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'];
  const HY = {
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
  const hy = pixBuf(HY_PX, EDG);
  function hyGround() {
    return AS.cached('r2-hybrid-ground', hy.LW, hy.LH, 1, (x, LW, LH) => {
      for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
        const r = rand(xx, y, 3), lx = xx * HY_PX, ly = y * HY_PX;
        const pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        let c;
        if (Math.abs(ly - pathY) < 19 + rand(xx >> 1, 3) * 6) c = r < 0.1 ? '#b86f50' : r < 0.18 ? '#e4a672' : '#c28569';
        else if (Math.abs(ly - pathY) < 25) c = r < 0.5 ? '#265c42' : '#b86f50';
        else {
          const patch = Math.sin(xx * 0.17 + Math.sin(y * 0.24)) + Math.sin(y * 0.22 + xx * 0.06);
          c = patch > 1.0 ? '#193c3e' : patch < -1.1 ? '#3e8948' : '#265c42';
          if (r < 0.03) c = '#3e8948';
        }
        x.fillStyle = c; x.fillRect(xx, y, 1, 1);
      }
      for (let i = 0; i < 70; i++) {
        const gx = Math.floor(rand(i, 11) * LW), gy = Math.floor(rand(i, 12) * LH);
        x.fillStyle = '#3e8948'; x.fillRect(gx, gy, 1, 2); x.fillRect(gx + 2, gy, 1, 2); x.fillStyle = '#63c74d'; x.fillRect(gx + 1, gy - 1, 1, 3);
      }
      for (let i = 0; i < 16; i++) { const fx = Math.floor(rand(i, 21) * LW), fy = Math.floor(rand(i, 22) * LH); x.fillStyle = i % 2 ? '#ffffff' : '#f6757a'; x.fillRect(fx, fy, 1, 1); }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        const cx = Math.round(rx / HY_PX), cy = Math.round(ry / HY_PX), r = Math.round(rr / HY_PX);
        x.fillStyle = '#181425'; x.fillRect(cx - r - 1, cy - r + 1, 2 * r + 2, 2 * r - 1); x.fillRect(cx - r, cy - r, 2 * r, 2 * r + 1);
        x.fillStyle = '#5a6988'; x.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 1);
        x.fillStyle = '#8b9bb4'; x.fillRect(cx - r, cy - r + 1, 2 * r - 1, r);
        x.fillStyle = '#c0cbdc'; x.fillRect(cx - r + 1, cy - r + 1, 2, 1);
      }
    });
  }
  // Soft glow sprites, cached per colour (much cheaper than a gradient per particle).
  function glowSpr(col) {
    return AS.cached('r2-hy-glow-' + col, 64, 64, 1, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, hexA(col, 1)); g.addColorStop(0.25, hexA(col, 0.6)); g.addColorStop(0.6, hexA(col, 0.18)); g.addColorStop(1, hexA(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  }
  function soft(ctx, x, y, r, col, a) {
    if (r <= 0.3 || a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2);
  }
  function hybridRender(ctx, S) {
    const t = S.t, E = HY.el, D = S.D, dk = 1 / Math.max(1, D);   // dk tames additive blowout at high chaos
    // ---- pixel layer: ground, decals, characters, ice, arrows ----
    const [fin, f] = hy.layer('final', true);
    f.drawImage(hyGround(), 0, 0);
    const [dc, d] = hy.layer('decal');
    const F = S.fire;
    d.beginPath(); polyPath(d, blobPts(F.x, F.y, F.rx, F.ry, 5, 20, 0.16)); d.fillStyle = '#3e2731'; d.fill();
    d.beginPath(); polyPath(d, blobPts(F.x, F.y + 2, F.rx * 0.7, F.ry * 0.6, 9, 16, 0.2)); d.fillStyle = '#733e39'; d.fill();
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 26, 0.1);
    d.beginPath(); polyPath(d, pud); d.fillStyle = '#124e89'; d.fill();
    d.beginPath(); polyPath(d, blobPts(P.x - 4, P.y - 3, P.rx - 6, P.ry - 6, 2, 26, 0.1)); d.fillStyle = '#0099db'; d.fill();
    d.save(); d.beginPath(); polyPath(d, pud); d.clip();
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; if (k > 0.7) continue; d.beginPath(); d.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); d.lineWidth = 3; d.strokeStyle = '#2ce8f5'; d.stroke(); }
    if (P.ice > 0.5 && P.front > 0) {
      d.beginPath(); iceFrontPath(d, P, 8); d.fillStyle = '#c0cbdc'; d.fill();
      d.save(); d.clip();
      d.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) d.fillRect(P.x - P.rx + rand(i, 71) * 2 * P.rx, P.y - P.ry + rand(i, 72) * 2 * P.ry, 10, 3);
      d.fillStyle = '#8b9bb4'; d.fillRect(P.x - P.rx, P.y + P.ry - 10, 2 * P.rx, 12);
      if (P.crack > 0) { d.strokeStyle = '#5a6988'; d.lineWidth = 3; d.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; d.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); d.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } d.stroke(); }
      d.restore();
    }
    d.restore();
    hy.quantize(dc, 'hard', null);
    f.drawImage(dc, 0, 0);
    f.fillStyle = 'rgba(24,20,37,0.5)';
    for (const a of S.actors) { if (a.alpha < 0.5) continue; const [r] = AS.SIZE[a.kind]; f.fillRect(Math.round((a.x - r * 0.8) / HY_PX), Math.round(a.y / HY_PX), Math.max(2, Math.round(r * 1.6 / HY_PX)), 1); }
    const [ac, x] = hy.layer('actors');
    for (const a of S.actors) {
      if (a.alpha < 0.5) continue;
      drawActor(x, a, HY, { shade: (c) => mix(c, '#181425', 0.35), burn: (c, k) => mix(c, '#3e2731', 0.35 * k), minLine: 3 });
      if (a.hit > 0.85) flashActor(x, a, '#ffffff');
      if (a.frozen > 0.3) iceBlock(x, a, HY_PX, 1, { fill: '#2ce8f5', body: '#0099db', edge: '#124e89', glint: '#ffffff', crack: '#124e89' });
    }
    for (const ar of S.arrows) {
      if (ar.alpha < 0.4) continue;
      x.save(); x.translate(ar.x, ar.y); x.rotate(ar.ang);
      x.fillStyle = '#ead4aa'; x.fillRect(-14, -1.5, 24, 3); x.fillStyle = '#c0cbdc'; x.fillRect(8, -3.5, 6, 7); x.fillStyle = '#ffffff'; x.fillRect(-16, -3.5, 5, 7);
      x.restore();
    }
    hy.quantize(ac, 'hard', '#181425');
    x.setTransform(1, 0, 0, 1, 0, 0);
    for (const a of S.actors) {   // 1px eyes so faces survive the downscale
      if (a.hit > 0.85 || a.alpha < 0.5 || a.frozen > 0.3) continue;
      const fx = AS.xf(a), eyes = { wizard: [[-2.5, -33], [3, -33]], goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[1.5, -22]] }[a.kind];
      for (const e of eyes) { const [ex, ey] = fx(e); x.fillStyle = a.team === 'enemy' ? '#fee761' : '#181425'; x.fillRect(Math.round(ex / HY_PX), Math.round(ey / HY_PX), 1, 1); }
    }
    // Draw order: pixel ground -> ground-level VFX (fire field, light pools) -> pixel bodies -> airborne VFX.
    hy.blit(ctx, fin);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const flick = 0.9 + Math.sin(t * TAU * 3) * 0.05 + Math.sin(t * TAU * 7 + 1) * 0.05;
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    for (const tg of S.tongues) {
      const lg = ctx.createLinearGradient(tg.x, tg.y, tg.x, tg.y - tg.h * 1.3);
      lg.addColorStop(0, 'rgba(255,214,110,0.95)'); lg.addColorStop(0.35, 'rgba(255,120,30,0.85)'); lg.addColorStop(1, 'rgba(210,40,20,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.8, tg.h * 1.35, tg.sway * 1.3); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    soft(ctx, F.x, F.y - 6, 120, '#ff6a1a', 0.42 * flick);
    soft(ctx, Wd.x, Wd.y + 6, wr + 24, '#ffd040', 0.18 + 0.3 * Wd.pulse);
    if (S.brute.burning > 0) soft(ctx, S.brute.x, S.brute.y - 26, 90, '#ff6a1a', 0.32 * S.brute.burning * flick);
    if (P.ice > 0 && P.front > 0) soft(ctx, P.x - P.rx * (1 - P.front), P.y, 50 + 40 * P.front, '#2ce8f5', 0.22 * P.ice);
    for (const fl of [...S.flames, ...S.impFlames]) soft(ctx, fl.x, fl.y - fl.size * 0.5, fl.size * 2.4, fl.age < 0.3 ? '#ffa03a' : '#ff4a1a', 0.6 * dk + 0.12);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    hy.blit(ctx, ac);
    // ---- airborne VFX in full resolution ----
    // smoke (normal blend)
    for (const s of S.smoke) if (s.age > 0.1) soft(ctx, s.x, s.y, s.size * 1.3, '#1a1420', 0.5 * (1 - s.age));
    for (const m of S.mist) soft(ctx, m.x, m.y, m.size * 1.2, '#e8fbff', 0.35 * Math.sin(m.age * Math.PI));
    // water drops: solid, glossy
    for (const p of S.spray.parts) {
      if (p.kind !== 'water') continue;
      const k = 1 - seg(p.age, 0.8, 1), r = (1.6 + p.size * 0.42) * k;
      ctx.globalAlpha = 0.9; ctx.fillStyle = p.r > 0.5 ? '#2f8cff' : '#5ab4ff'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e0f4ff'; ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.35, 0, TAU); ctx.fill();
    }
    for (const dr of S.drips) { ctx.globalAlpha = 0.85 * (1 - dr.age); ctx.fillStyle = '#6ab8ff'; ctx.beginPath(); ctx.arc(dr.x, dr.y, 1.6, 0, TAU); ctx.fill(); }
    // ward bubble body
    ctx.globalAlpha = 1;
    const wg = ctx.createRadialGradient(Wd.x, Wd.y, wr * 0.5, Wd.x, Wd.y, wr);
    wg.addColorStop(0, hexA('#ffe27a', 0)); wg.addColorStop(0.85, hexA('#ffe27a', 0.16 + Wd.pulse * 0.25)); wg.addColorStop(1, hexA('#fff4c0', 0.45 + Wd.pulse * 0.3));
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fill();
    // ice shards: crisp vector slivers
    for (const s of S.shards) {
      if (s.age > 0.9) continue;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 0.9);
      ctx.beginPath(); polyPath(ctx, [[0, -s.size * 1.1], [s.size * 0.5, s.size * 0.6], [-s.size * 0.5, s.size * 0.4]]);
      ctx.fillStyle = s.r > 0.5 ? '#e8fbff' : '#8ae6ff'; ctx.fill(); ctx.restore();
    }
    // --- additive light ---
    ctx.globalCompositeOperation = 'lighter';
    soft(ctx, S.imp.x, S.imp.y - 10, 30, '#ff7a2a', 0.3);
    for (const e of S.embers) { soft(ctx, e.x, e.y, 5, '#ff8a2a', 0.8 * (1 - e.age)); ctx.globalAlpha = 1 - e.age; ctx.fillStyle = '#fff0c0'; ctx.fillRect(e.x - 0.8, e.y - 0.8, 1.6, 1.6); }
    // frost spray
    for (const p of S.spray.parts) {
      if (p.kind !== 'cold') continue;
      const k = 1 - seg(p.age, 0.75, 1);
      soft(ctx, p.x, p.y, (5 + p.size * 1.7) * k, '#3ad8ff', 0.4 * dk + 0.1);
      if (p.r > 0.55) { ctx.globalAlpha = k; ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
    }
    if (S.spray.cold + S.spray.water > 0) soft(ctx, S.spray.x, S.spray.y, 20, S.spray.cold > 0 ? '#7ff0ff' : '#3a9cff', 0.9);
    for (const s of S.shards) if (s.age < 0.7) soft(ctx, s.x, s.y, s.size * 2, '#7fe8ff', 0.5 * (1 - s.age) * dk);
    // the beam: smooth arcane ribbon, two fire strands coiled round it, fire peeling off
    const tip1 = AS.staffTip(S.players[0]);
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 44, 2.4 * o, 0.8, 26);
      const h1 = helix(B, t, 80, 9 * o, 3, 1.3, 0), h2 = helix(B, t, 80, 9 * o, 3, 1.3, Math.PI);
      const strand = (front) => {
        for (const [lw, col, al] of [[7, '#ff5a1a', 0.35], [3.4, '#ff9a2a', 0.85], [1.4, '#fff0b0', 0.9]]) { ctx.globalAlpha = al * o; ctx.lineWidth = lw; ctx.strokeStyle = col; strokeHelix(ctx, h1, front); strokeHelix(ctx, h2, front); }
      };
      strand(false);
      for (const [lw, col, al] of [[30, '#ff0a6a', 0.14], [16, '#ff2d8a', 0.32], [8, '#ff7ab8', 0.75], [3.2, '#ffe6f2', 1]]) { ctx.globalAlpha = al * o; ctx.lineWidth = lw * o; ctx.strokeStyle = col; strokePts(ctx, pts); }
      strand(true);
      // flame wisps shed along the beam: it visibly burns as it travels
      const g = beamGeom(B);
      for (const w of AS.emit(t, { rate: 30 * D, life: 0.55, from: 0.75, to: 4.6 }, (i, age) => ({ p: 0.08 + rand(96, i, 1) * 0.86, age, k: rand(96, i, 2) }))) {
        const x0 = B.x1 + g.dx * w.p, y0 = B.y1 + g.dy * w.p, rr = (1 - w.age) * (3 + 3 * w.k);
        soft(ctx, x0 + Math.sin(w.age * 8 + w.k * 6) * 3, y0 - w.age * (16 + 16 * w.k), rr * 2.2, w.age < 0.35 ? '#ffb24a' : '#ff4a1a', (0.75 * dk + 0.2) * o);
      }
      for (const bd of beads(B, t, 5, 9, 0.75)) {
        const s = envAt(bd.p) * o; if (s < 0.1) continue;
        soft(ctx, bd.x - bd.ux * 8, bd.y - bd.uy * 8, 9 * s, '#ff5a1a', 0.5);
        soft(ctx, bd.x, bd.y, 11 * s, '#ff9a2a', 0.9); soft(ctx, bd.x, bd.y, 4.5 * s, '#fff4c8', 1);
      }
      soft(ctx, B.x2, B.y2, 34 * o, '#ff2d8a', 0.65); soft(ctx, B.x2, B.y2, 18 * o, '#ff8a2a', 0.6); soft(ctx, B.x2, B.y2, 9 * o, '#ffffff', 0.9);
      soft(ctx, B.x1, B.y1, 22 * o, '#ff2d8a', 0.85); soft(ctx, B.x1, B.y1, 8 * o, '#ffffff', 0.9);
      for (const s of S.beamSparks) {
        const fire = s.r < 0.45; ctx.globalAlpha = 1 - s.age; ctx.lineWidth = 1.6; ctx.strokeStyle = fire ? '#ffb24a' : '#ff9ac8';
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 9, s.y - Math.sin(s.a) * 9); ctx.stroke();
      }
    } else soft(ctx, tip1[0], tip1[1], 10, '#ff2d8a', 0.7);
    // the brute burns
    ctx.globalCompositeOperation = 'source-over';
    for (const tg of bruteTongues(S, 1, BOLD_SPOTS)) {
      const lg = ctx.createLinearGradient(tg.x, tg.y, tg.x, tg.y - tg.h * 1.4);
      lg.addColorStop(0, 'rgba(255,220,120,0.95)'); lg.addColorStop(0.35, 'rgba(255,120,30,0.85)'); lg.addColorStop(1, 'rgba(210,40,20,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.8, tg.h * 1.4, tg.sway); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const fl of bruteFlames(S, 28)) soft(ctx, fl.x, fl.y, fl.size * 2, fl.age < 0.3 ? '#ffa03a' : '#ff4a1a', 0.5 * dk + 0.12);
    // ward rim and sparks
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * 1.1 + i / 3 * TAU; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.6; ctx.strokeStyle = '#ffd040'; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, a, a + 0.55); ctx.stroke(); }
    if (Wd.pulse > 0) soft(ctx, Wd.hitX, Wd.hitY, 30, '#ffd040', Wd.pulse);
    for (const s of S.wardSparks) { ctx.globalAlpha = 1 - s.age; ctx.lineWidth = 1.4; ctx.strokeStyle = '#fff0b0'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 6, s.y - Math.sin(s.a) * 6); ctx.stroke(); }
    ctx.restore();
    // ---- pixel UI on top ----
    const [uc, u] = hy.layer('ui', true);
    const NC = { arcane: '#f6757a', crit: '#fee761', fire: '#feae34', cold: '#2ce8f5', water: '#0099db', shield: '#fee761' };
    for (const n of S.numbers) {
      if (n.alpha < 0.4) continue;
      const txt = n.text.toUpperCase(), w = txt.length * 4 - 1;
      pxText(u, txt, Math.round(n.x / HY_PX - w / 2), Math.round(n.y / HY_PX - 2), NC[n.kind], '#181425');
    }
    burnIcon(u, S, HY_PX, '#f77622', '#181425', 1);
    for (const h of S.hud) {
      const hx = Math.round(h.x / HY_PX), hy2 = Math.round(h.y / HY_PX), hw = Math.round(h.w / HY_PX), hh = 13;
      u.fillStyle = '#181425'; u.fillRect(hx - 1, hy2 - 1, hw + 2, hh + 2);
      u.fillStyle = '#262b44'; u.fillRect(hx, hy2, hw, hh); u.fillStyle = '#3a4466'; u.fillRect(hx, hy2, hw, 1);
      pxText(u, h.name, hx + 2, hy2 + 4, h.team === 'p1' ? '#e43b44' : '#0099db', null);
      u.fillStyle = '#3e2731'; u.fillRect(hx + 12, hy2 + 10, 58, 1); u.fillStyle = '#63c74d'; u.fillRect(hx + 12, hy2 + 10, Math.round(58 * h.hp), 1);
      for (let i = 0; i < 5; i++) {
        const ix = hx + 13 + i * 9, iy = hy2 + 2, q = h.queue[i];
        if (!q || q.pop < 0.5) { u.fillStyle = '#3a4466'; u.fillRect(ix + 2, iy + 2, 1, 1); continue; }
        pxIcon(u, q.el, ix, iy, E[q.el]);
      }
    }
    payloadTag(u, S, HY_PX, { bg: '#181425', arcane: '#ff0044', fire: '#f77622', plus: '#ffffff' }, 1);
    hy.blit(ctx, uc);
  }
  AS.register({
    id: 'pixel-hybrid', name: 'Pixel + Smooth VFX', pixelWidth: hy.LW, family: 'pixel', round: 2,
    refs: ['Octopath Traveler (HD-2D)', 'Dead Cells', 'Hyper Light Drifter'],
    feel: 'Characters, ground and ice are hand-placed pixels at 256 by 160, but every spell is a smooth full-resolution particle and light effect laid over them. The pixel world keeps the charm; the magic glows, blends and bends like it would in a modern engine.',
    notes: {
      read: ['Best of the three for the payload', 'Two fire strands coil round the pink beam and flame wisps peel off it as it travels, so "an arcane beam that is on fire" reads at a glance, and the same flames then crawl over the brute. Bodies stay crisp because they are never blurred. At full chaos the additive glows are damped, but the spray and fire field still get busy.'],
      tone: ['Good', 'Playful pixel cast with flashy magic. The two layers can look pasted together if the VFX are not held to the pixel palette, which this sketch mostly does.'],
      cost: ['Lowest of the pixel options', 'Only characters and tiles are hand-drawn. Spells are particle systems with parameters (colour, shape, emitter), so a new element combination is a new set of parameters rather than new frames. This is the direct answer to the "combinations multiply pixel work" worry.'],
    },
    render: hybridRender,
  });

  // =====================================================================
  // 3. BOLD POSTER PIXEL  (128x80, PICO-8's 16 colours, sprites 1.5x)
  // =====================================================================
  const BD_PX = 5, SC = 1.5;
  const P8 = { black: '#000000', navy: '#1d2b53', plum: '#7e2553', green: '#008751', brown: '#ab5236', dgrey: '#5f574f', lgrey: '#c2c3c7', white: '#fff1e8', red: '#ff004d', orange: '#ffa300', yellow: '#ffec27', lime: '#00e436', blue: '#29adff', lav: '#83769c', pink: '#ff77a8', peach: '#ffccaa' };
  // PICO-8 style "one step darker" table, used for the shaded half of each sprite.
  const DARKER = { [P8.red]: P8.plum, [P8.orange]: P8.brown, [P8.yellow]: P8.orange, [P8.lime]: P8.green, [P8.blue]: P8.lav, [P8.lav]: P8.dgrey, [P8.pink]: P8.red, [P8.peach]: P8.brown, [P8.white]: P8.lgrey, [P8.lgrey]: P8.dgrey, [P8.brown]: P8.plum, [P8.green]: P8.navy, [P8.dgrey]: P8.navy, [P8.plum]: P8.navy, [P8.navy]: P8.black, [P8.black]: P8.black };
  const BD = {
    el: { fire: P8.orange, water: P8.blue, cold: P8.white, arcane: P8.pink, shield: P8.yellow },
    p1: { robe: P8.red, trim: P8.yellow, sleeve: P8.plum, hat: P8.red, band: P8.yellow },
    p2: { robe: P8.blue, trim: P8.white, sleeve: P8.navy, hat: P8.blue, band: P8.white },
    wizard: { skin: P8.peach, beard: P8.white, staff: P8.brown, hand: P8.peach },
    goblin: { body: P8.lime, belly: P8.yellow, dark: P8.green, club: P8.brown },
    archer: { body: P8.lime, cloth: P8.brown, dark: P8.green, bow: P8.orange, string: P8.lgrey, arrow: P8.white, hand: P8.lime },
    brute: { body: P8.brown, belly: P8.peach, dark: P8.plum, horn: P8.white, brow: P8.black },
    imp: { body: P8.lav, wing: P8.plum, horn: P8.yellow, tail: P8.plum },
    common: { eye: P8.black, eyeWhite: P8.white, tooth: P8.white },
  };
  const bd = pixBuf(BD_PX, Object.values(P8));
  function bdGround() {
    return AS.cached('r2-bold-ground', bd.LW, bd.LH, 1, (x, LW, LH) => {
      for (let y = 0; y < LH; y++) for (let xx = 0; xx < LW; xx++) {
        const lx = (xx + 0.5) * BD_PX, ly = (y + 0.5) * BD_PX, th = bay(xx, y);
        const pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        const dist = Math.abs(ly - pathY);
        // vignette: dithered fade from green to navy toward the corners
        const vx = (lx - W / 2) / (W / 2), vy = (ly - H / 2 + 20) / (H / 2), v = Math.sqrt(vx * vx * 0.8 + vy * vy);
        let c = P8.green;
        if (dist < 16) c = P8.dgrey;
        else if (dist < 23) c = th < (23 - dist) / 8 ? P8.dgrey : P8.green;
        if (v > 0.78 && th < (v - 0.78) * 3.2) c = P8.navy;
        x.fillStyle = c; x.fillRect(xx, y, 1, 1);
      }
      // a few chunky grass marks and rocks: poster-simple
      for (let i = 0; i < 18; i++) {
        const gx = Math.floor(rand(i, 11) * LW), gy = Math.floor(rand(i, 12) * LH);
        const ly = gy * BD_PX, lx = gx * BD_PX, pathY = 214 + Math.sin(lx / 44 * 0.8) * 16 + (lx > 360 ? (lx - 360) * 0.12 : 0);
        if (Math.abs(ly - pathY) < 26) continue;
        x.fillStyle = P8.lime; x.fillRect(gx, gy, 1, 1); x.fillRect(gx + 2, gy, 1, 1); x.fillStyle = P8.navy; x.fillRect(gx, gy + 1, 3, 1);
      }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        const cx = Math.round(rx / BD_PX), cy = Math.round(ry / BD_PX), r = Math.max(2, Math.round(rr / BD_PX));
        x.fillStyle = P8.black; x.fillRect(cx - r - 1, cy - r + 1, 2 * r + 2, 2 * r - 1); x.fillRect(cx - r, cy - r, 2 * r, 2 * r + 1);
        x.fillStyle = P8.dgrey; x.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 1);
        x.fillStyle = P8.lgrey; x.fillRect(cx - r, cy - r + 1, 2 * r - 1, r - 1);
        x.fillStyle = P8.white; x.fillRect(cx - r + 1, cy - r + 1, 1, 1);
      }
    });
  }
  // Scaled-up actors need scaled-up anchors: staff tips, beam ends and spray origins move.
  const scOf = (a) => (a.kind === 'goblin' ? 1.3 : SC);   // goblins share a small puddle, so they grow a little less
  const big = (a) => Object.assign({}, a, { s: a.s * scOf(a) });
  function boldRender(ctx, S) {
    const t = S.t, D = S.D, E = BD.el;
    // Chaos is thinned: above the designed density only part of each particle stream is drawn,
    // in bigger chunks, so the poster never turns into dither noise.
    const cap = Math.min(1, 1.5 / Math.max(1, D));
    const keep = (p) => (p.r ?? 0) < cap;
    const sn = (v) => Math.round(v / BD_PX) * BD_PX;
    const [fin, f] = bd.layer('final', true);
    f.drawImage(bdGround(), 0, 0);
    // decals
    const [dc, d] = bd.layer('decal');
    const F = S.fire;
    d.beginPath(); polyPath(d, blobPts(F.x, F.y, F.rx * 1.05, F.ry * 1.1, 5, 16, 0.16)); d.fillStyle = P8.black; d.fill();
    d.beginPath(); polyPath(d, blobPts(F.x, F.y + 2, F.rx * 0.75, F.ry * 0.65, 9, 14, 0.2)); d.fillStyle = P8.navy; d.fill();
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 22, 0.1);
    d.beginPath(); polyPath(d, pud); d.fillStyle = P8.navy; d.fill();
    d.beginPath(); polyPath(d, blobPts(P.x - 3, P.y - 4, P.rx - 8, P.ry - 8, 2, 22, 0.1)); d.fillStyle = P8.blue; d.fill();
    d.save(); d.beginPath(); polyPath(d, pud); d.clip();
    if (!(P.ice > 0.5 && P.front > 0)) { const k = (t * 0.6) % 1; d.beginPath(); d.ellipse(P.x - 6, P.y - 2, 8 + k * 30, 3 + k * 11, 0, 0, TAU); d.lineWidth = 5; d.strokeStyle = P8.white; d.stroke(); }
    if (P.ice > 0.5 && P.front > 0) {
      d.beginPath(); iceFrontPath(d, P, 8); d.fillStyle = P8.lgrey; d.fill();
      d.save(); d.clip();
      d.fillStyle = P8.white; d.fillRect(P.x - P.rx + 14, P.y - P.ry + 8, 20, 5); d.fillRect(P.x + 10, P.y - 4, 15, 5);
      d.fillStyle = P8.lav; d.fillRect(P.x - P.rx, P.y + P.ry - 9, 2 * P.rx, 10);
      if (P.crack > 0) { d.strokeStyle = P8.navy; d.lineWidth = 5; d.beginPath(); for (let i = 0; i < 6 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; d.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); d.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } d.stroke(); }
      d.restore();
    }
    d.restore();
    bd.quantize(dc, 'hard', null);
    f.drawImage(dc, 0, 0);
    // big actors
    const [ac, x] = bd.layer('actors');
    const Wd = S.ward, wr = Wd.r * 1.32 * (1 + Wd.pulse * 0.07);
    // fire patch tongues are solid poster shapes, outlined with the actors
    for (const tg of S.tongues) { if (tg.r > Math.max(0.55, cap)) continue; x.beginPath(); teardrop(x, tg.x, tg.y, tg.w * 1.1, tg.h * 1.15, tg.sway); x.fillStyle = P8.red; x.fill(); }
    for (const tg of S.tongues) { if (tg.r > Math.max(0.55, cap)) continue; x.beginPath(); teardrop(x, tg.x, tg.y - 1, tg.w * 0.7, tg.h * 0.72, tg.sway * 0.6); x.fillStyle = P8.orange; x.fill(); }
    for (const tg of S.tongues) { if (tg.r > Math.max(0.55, cap)) continue; x.beginPath(); teardrop(x, tg.x, tg.y - 2, tg.w * 0.4, tg.h * 0.4, tg.sway * 0.3); x.fillStyle = P8.yellow; x.fill(); }
    for (const a0 of S.actors) {
      if (a0.alpha < 0.5) continue;
      const a = big(a0);
      drawActor(x, a, BD, { sc: 1, shade: a.kind === 'goblin' ? null : (c) => DARKER[c] || c, minLine: 5 });   // goblins flat: too few pixels for two tones
      if (a.hit > 0.85) flashActor(x, a, P8.white);
      if (a.frozen > 0.3) iceBlock(x, a0, BD_PX, scOf(a0), { fill: P8.lgrey, body: P8.blue, edge: P8.lav, glint: P8.white, crack: P8.navy });
      // the brute burns: chunky tongues on its body
      if (a0.kind === 'brute') {
        const bt = bruteTongues(S, SC, BOLD_SPOTS);
        for (const tg of bt) { x.beginPath(); teardrop(x, tg.x, tg.y, tg.w * 1.1, tg.h, tg.sway); x.fillStyle = P8.red; x.fill(); }
        for (const tg of bt) { x.beginPath(); teardrop(x, tg.x, tg.y - 1, tg.w * 0.7, tg.h * 0.62, tg.sway * 0.6); x.fillStyle = P8.orange; x.fill(); }
        for (const tg of bt) { x.beginPath(); teardrop(x, tg.x, tg.y - 2, tg.w * 0.35, tg.h * 0.3, tg.sway * 0.3); x.fillStyle = P8.yellow; x.fill(); }
      }
    }
    for (const ar of S.arrows) {
      if (ar.alpha < 0.4 || Math.hypot(ar.x - Wd.x, ar.y - Wd.y) < wr) continue;
      x.save(); x.translate(ar.x, ar.y); x.rotate(ar.ang);
      x.fillStyle = P8.white; x.fillRect(-15, -2.5, 26, 5); x.fillStyle = P8.lgrey; x.fillRect(8, -5, 7, 10);
      x.restore();
    }
    // fx: dithered glows, chunky particles (composited UNDER the bodies: poster rule, bodies first)
    const [fc, g] = bd.layer('fx');
    const glow = (gx, gy, r, col, a) => { if (r <= 0.5 || a <= 0) return; const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(0.5, hexA(col, a * 0.6)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(gx - r, gy - r, r * 2, r * 2); };
    const blk = (sx, sy, n, col) => { g.fillStyle = col; const k = Math.max(1, Math.round(n)) * BD_PX; g.fillRect(sn(sx) - (k > BD_PX ? BD_PX : 0), sn(sy) - (k > BD_PX ? BD_PX : 0), k, k); };
    const fireCol = (age) => age < 0.3 ? P8.yellow : age < 0.65 ? P8.orange : P8.red;
    glow(F.x, F.y - 10, 55, P8.orange, 0.18);
    for (const fl of [...S.flames, ...S.impFlames]) if (keep(fl) && fl.size > 2) blk(fl.x, fl.y, fl.size > 7 ? 2 : 1, fireCol(fl.age));
    for (const s of S.smoke) if (s.age > 0.2 && keep(s)) { g.globalAlpha = 0.65 * (1 - s.age); g.beginPath(); g.arc(s.x, s.y, s.size * 0.6, 0, TAU); g.fillStyle = P8.dgrey; g.fill(); g.globalAlpha = 1; }
    for (const e of S.embers) if (keep(e)) blk(e.x, e.y, 1, e.r > 0.5 ? P8.yellow : P8.orange);
    for (const fl of bruteFlames(S, 18, SC)) if (keep(fl) && fl.size > 3) blk(fl.x, fl.y, fl.size > 9 ? 2 : 1, fireCol(fl.age));
    for (const m of S.mist) if (keep(m)) glow(m.x, m.y, m.size, P8.white, 0.4 * Math.sin(m.age * Math.PI));
    for (const dr of S.drips) blk(dr.x, dr.y, 1, P8.blue);
    // spray, moved to the bigger staff tip
    const tip2 = AS.staffTip(big(S.players[1])), sdx = tip2[0] - S.spray.x, sdy = tip2[1] - S.spray.y;
    for (const p of S.spray.parts) {
      if (!keep(p)) continue;
      const k = 1 - seg(p.age, 0.8, 1), px = p.x + sdx * (1 - p.age), py = p.y + sdy * (1 - p.age);
      if (p.kind === 'water') { blk(px, py, p.size * k > 5 ? 2 : 1, p.r > 0.5 ? P8.blue : P8.white); continue; }
      blk(px, py, p.size * k > 6 ? 2 : 1, p.r > 0.5 ? P8.white : P8.lgrey);
    }
    // solid layer: beam band, fire blocks and ward ring stay crisp (no dither on their edges)
    const [scv, s2] = bd.layer('solid');
    if (S.spray.cold + S.spray.water > 0) glow(tip2[0], tip2[1], 14, S.spray.cold > 0 ? P8.white : P8.blue, 1);
    // the beam: a fat pink band studded with orange fire blocks that march to the target
    if (S.beam) {
      const B0 = S.beam, o = B0.on, tip1 = AS.staffTip(big(S.players[0])), b = S.brute;
      const B = { x1: tip1[0], y1: tip1[1], x2: b.x - 22 * SC, y2: b.y + (-34 + b.bob) * SC, on: o };
      const tdx = B.x2 - B0.x2, tdy = B.y2 - B0.y2, gm = beamGeom(B), ux = gm.dx / gm.L, uy = gm.dy / gm.L;
      s2.lineCap = 'butt';
      for (const [lw, col] of [[24 * o, P8.plum], [15 * o, P8.pink], [5 * o, P8.white]]) { s2.lineWidth = lw; s2.strokeStyle = col; s2.beginPath(); s2.moveTo(B.x1, B.y1); s2.lineTo(B.x2, B.y2); s2.stroke(); }
      const gap = 30;
      for (let s = mod(t * 120, gap) + 8; s < gm.L - 8; s += gap) {
        const cx = B.x1 + ux * s, cy = B.y1 + uy * s, e = Math.min(1, s / 30) * o;
        s2.fillStyle = P8.red; s2.beginPath(); s2.moveTo(cx + ux * 13 * e, cy + uy * 13 * e); s2.lineTo(cx - uy * 10 * e, cy + ux * 10 * e); s2.lineTo(cx - ux * 9 * e, cy - uy * 9 * e); s2.lineTo(cx + uy * 10 * e, cy - ux * 10 * e); s2.closePath(); s2.fill();
        s2.fillStyle = P8.orange; s2.beginPath(); s2.moveTo(cx + ux * 9 * e, cy + uy * 9 * e); s2.lineTo(cx - uy * 6 * e, cy + ux * 6 * e); s2.lineTo(cx - ux * 5 * e, cy - uy * 5 * e); s2.lineTo(cx + uy * 6 * e, cy - ux * 6 * e); s2.closePath(); s2.fill();
        s2.fillStyle = P8.yellow; s2.fillRect(sn(cx), sn(cy), BD_PX, BD_PX);
      }
      glow(B.x2, B.y2, 30 * o, P8.orange, 0.7);
      blk(B.x2, B.y2, 2 + (Math.floor(t * 12) % 2), P8.white);
      blk(B.x1, B.y1, 2, P8.pink);
      for (const s of S.beamSparks) if (keep(s)) blk(s.x + tdx, s.y + tdy, 1, s.r < 0.45 ? (s.age < 0.5 ? P8.yellow : P8.orange) : P8.pink);
    } else { const tp = AS.staffTip(big(S.players[0])); blk(tp[0], tp[1], 1, P8.pink); }
    // ward
    const wg = g.createRadialGradient(Wd.x, Wd.y, wr * 0.5, Wd.x, Wd.y, wr);
    wg.addColorStop(0, hexA(P8.yellow, 0)); wg.addColorStop(1, hexA(P8.yellow, 0.35 + Wd.pulse * 0.45));
    g.fillStyle = wg; g.beginPath(); g.arc(Wd.x, Wd.y, wr, 0, TAU); g.fill();
    s2.beginPath(); s2.arc(Wd.x, Wd.y, wr, 0, TAU); s2.lineWidth = 9; s2.strokeStyle = P8.yellow; s2.stroke();
    const hx0 = Wd.x + Math.cos(Wd.hitAng) * wr - Wd.hitX, hy0 = Wd.y + Math.sin(Wd.hitAng) * wr - Wd.hitY;
    for (const s of S.wardSparks) if (keep(s)) blk(s.x + hx0, s.y + hy0, 1, s.r > 0.4 ? P8.yellow : P8.white);
    for (const s of S.shards) if (s.age < 0.85 && keep(s)) blk(s.x, s.y, s.size > 5 ? 2 : 1, s.r > 0.5 ? P8.white : P8.blue);
    bd.quantize(fc, 'dither', null);
    f.drawImage(fc, 0, 0);
    bd.quantize(ac, 'hard', P8.black);
    f.drawImage(ac, 0, 0);
    for (const a0 of S.actors) {   // eye pixels
      if (a0.hit > 0.85 || a0.alpha < 0.5 || a0.frozen > 0.3) continue;
      const fx = AS.xf(a0, scOf(a0)), eyes = { wizard: [[-2.5, -33], [3.5, -33]], goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[-0.8, -22], [4.2, -22]] }[a0.kind];
      for (const e of eyes) { const [ex, ey] = fx(e); f.fillStyle = a0.team === 'enemy' ? P8.yellow : P8.black; f.fillRect(Math.floor(ex / BD_PX), Math.floor(ey / BD_PX), 1, 1); }
    }
    bd.quantize(scv, 'hard', null);
    f.drawImage(scv, 0, 0);
    // numbers: big 3x5 type, nudged up over the bigger sprites
    const NC = { arcane: P8.pink, crit: P8.yellow, fire: P8.orange, cold: P8.white, water: P8.blue, shield: P8.yellow };
    for (const n of S.numbers) {
      if (n.alpha < 0.4) continue;
      const txt = n.text.toUpperCase(), w = txt.length * 4 - 1;
      pxText(f, txt, Math.round(n.x / BD_PX - w / 2), Math.max(1, Math.round((n.y - 26) / BD_PX - 2)), NC[n.kind], P8.black);
    }
    burnIcon(f, S, BD_PX, P8.orange, P8.black, 1, SC * 1.12);
    // HUD: team-coloured frame, element blocks, 1px health
    for (const h of S.hud) {
      const hx = Math.round(h.x / BD_PX), hy = Math.round(h.y / BD_PX), tc = h.team === 'p1' ? P8.red : P8.blue;
      f.fillStyle = P8.black; f.fillRect(hx - 1, hy - 1, 34, 10);
      f.fillStyle = tc; f.fillRect(hx, hy, 32, 8); f.fillStyle = P8.navy; f.fillRect(hx + 1, hy + 1, 30, 6);
      for (let i = 0; i < 5; i++) {
        const ix = hx + 1 + i * 6, q = h.queue[i];
        if (!q || q.pop < 0.5) { f.fillStyle = P8.dgrey; f.fillRect(ix + 2, hy + 3, 1, 1); continue; }
        pxIcon(f, q.el, ix, hy + 1, E[q.el]);
      }
      f.fillStyle = P8.plum; f.fillRect(hx, hy + 8, 32, 1); f.fillStyle = P8.lime; f.fillRect(hx, hy + 8, Math.round(32 * h.hp), 1);
    }
    payloadTag(f, S, BD_PX, { bg: P8.black, arcane: P8.pink, fire: P8.orange, plus: P8.white }, 1);
    bd.blit(ctx, fin);
  }
  AS.register({
    id: 'pixel-bold', name: 'Bold Poster Pixel', pixelWidth: bd.LW, family: 'pixel', round: 2,
    refs: ['PICO-8 / Celeste Classic', 'Downwell', 'Screen-printed gig posters'],
    feel: 'Deliberately crude: a 128 by 80 canvas, the 16 PICO-8 colours, and sprites drawn half again as big as the scene asks for. Flat fills, one darker shade, black outlines, dither instead of gradients, and particle streams thinned at high chaos so the poster never turns into noise.',
    notes: {
      read: ['Legible bodies, payload by colour code', 'Big outlined sprites drawn over the particles hold up better than round 1 at full chaos, though the three goblins in their small puddle still mush together. The payload is a colour code: a pink band studded with orange fire blocks that march to the brute, then chunky flames and a fire icon on it. Clear, but it reads more like a diagram than like magic.'],
      tone: ['Fun, but toylike', 'Loud and comic, close to slapstick, but the tiny canvas leaves little room for expression, so faces are a single pixel and the wizards lose their personality.'],
      cost: ['Low', 'Sixteen colours and very few pixels per sprite make assets quick to draw and to recolour for new elements. Combinations become colour-coded patterns, not new animation, but the style limits how far the art can grow later.'],
    },
    render: boldRender,
  });
})();
