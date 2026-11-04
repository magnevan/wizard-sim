/* Round 2, Dark Painterly Glow family: three variants that each push one axis.
 *   glow-arcade  dark lit world, but bright toon characters with rim light (can glow + cartoony coexist?)
 *   glow-neon    few-value dusk world, crisp neon spells with real bloom (max spell pop vs too abstract?)
 *   glow-warm    firelit tavern-dungeon, rich painted detail (can a busy world keep spells readable?)
 * All three must show the beam's Fire PAYLOAD (S.beam.payload): an arcane beam that carries fire,
 * shown the same way in each: a fire braid spiralling round the arcane core, flame "licks" riding the
 * beam toward the target, a fire splash in the impact, the brute catching fire, and a burn status chip.
 * Each style is { id, name, refs, feel, notes, family, round, render(ctx, S, scale) }. */
(function () {
  const { W, H, TAU, lerp, clamp, seg, rand, hexA, mix, ease } = AS;
  const { world, colorOf, hash, teardrop, blobPts, jit, iceFrontPath, polyPath, beamPts, strokePts, starPath, arrowShape } = AS.util;

  // =====================================================================
  // shared helpers (private to this file)
  // =====================================================================
  function soft(ctx, x, y, r, col, a) {
    if (r <= 0.5 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(col, Math.min(1, a))); g.addColorStop(0.4, hexA(col, Math.min(1, a) * 0.45)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const bufs = {};
  function buf(name, w, h) {
    let c = bufs[name];
    if (!c) c = bufs[name] = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  // Glow budget: more particles at high chaos -> each glows less, so the sum stays near the designed level
  // instead of blowing out to white.
  const budget = (S) => clamp(1.15 / Math.sqrt(Math.max(1, S.D)), 0.5, 1);

  function lightMap(ctx, key, scale, ambient, L, pre) {
    const lw = Math.ceil(W * scale / 2), lh = Math.ceil(H * scale / 2), c = buf(key, lw, lh), lx = c.getContext('2d');
    lx.setTransform(scale / 2, 0, 0, scale / 2, 0, 0);
    lx.globalCompositeOperation = 'source-over'; lx.fillStyle = ambient; lx.fillRect(0, 0, W, H);
    if (pre) pre(lx);
    lx.globalCompositeOperation = 'lighter';
    for (const l of L) soft(lx, l.x, l.y, l.r, l.c, l.a);
    lx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(c, 0, 0, W, H); ctx.restore();
  }
  // Cheap, portable bloom: halve the emissive layer a few times (bilinear = box blur) and add the
  // blurry copies back on top.
  function bloom(ctx, src, key, levels) {
    let prev = src, w = src.width, h = src.height;
    const out = [];
    for (let i = 1; i <= 4; i++) {
      w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2));
      const c = buf(key + i, w, h), x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'copy'; x.imageSmoothingEnabled = true;
      x.drawImage(prev, 0, 0, w, h); prev = c; out.push(c);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    for (const [lvl, a] of levels) { if (a <= 0) continue; ctx.globalAlpha = a; ctx.drawImage(out[lvl - 1], 0, 0, src.width, src.height); }
    ctx.restore();
  }
  function rimFrom(a, L) {
    const [, hgt] = AS.SIZE[a.kind], cx = a.x, cy = a.y - hgt * 0.45;
    let best = null, bs = 0;
    for (const l of L) { const d = Math.hypot(l.x - cx, l.y - cy), sc = l.a * l.r / (d + 30); if (sc > bs) { bs = sc; best = l; } }
    const ang = best ? Math.atan2(best.y - cy, best.x - cx) : -2.3;
    return { dx: Math.cos(ang), dy: Math.sin(ang), c: best ? best.c : '#9ab0e0', s: bs };
  }

  // ---------- the payload language (identical structure in all three variants) ----------
  function beamGeo(B) { const dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy) || 1; return { dx, dy, L, nx: -dy / L, ny: dx / L, ang: Math.atan2(dy, dx) }; }
  const hasFire = (B) => !!(B && B.payload && B.payload.includes('fire'));
  // Two fire strands spiralling round the beam, scrolling caster -> target. front = strand is in front of the core.
  function braid(B, t, n, amp, turns, speed) {
    const g = beamGeo(B), out = [[], []];
    for (let s = 0; s < 2; s++) for (let i = 0; i <= n; i++) {
      const p = i / n, env = seg(p, 0, 0.12) * (1 - 0.35 * seg(p, 0.85, 1));
      const ph = p * turns * TAU - t * speed + s * Math.PI, o = Math.sin(ph) * amp * env;
      out[s].push({ x: B.x1 + g.dx * p + g.nx * o, y: B.y1 + g.dy * p + g.ny * o, front: Math.cos(ph) > 0 });
    }
    return out;
  }
  function strokeRuns(ctx, strand, front) {
    ctx.beginPath(); let pen = false;
    for (let i = 0; i < strand.length - 1; i++) {
      const a = strand[i], b = strand[i + 1];
      if (a.front === front) { if (!pen) { ctx.moveTo(a.x, a.y); pen = true; } ctx.lineTo(b.x, b.y); } else pen = false;
    }
    ctx.stroke();
  }
  // Flame "licks" riding the beam toward the target, tails pointing back at the caster.
  function licks(B, t, D) {
    const g = beamGeo(B), n = Math.round(clamp(4 + 2.5 * D, 4, 12)), out = [];
    for (let k = 0; k < n; k++) {
      const p = AS.mod(k / n + t * 0.85 + rand(907, k) * 0.04, 1);
      const side = Math.sin(p * 9 + k * 2.1) * 4.5;
      const sz = seg(p, 0.04, 0.22) * (1 - seg(p, 0.86, 1)) * (0.75 + 0.5 * rand(908, k)) * B.on;
      if (sz > 0.05) out.push({ x: B.x1 + g.dx * p + g.nx * side, y: B.y1 + g.dy * p + g.ny * side, p, ang: g.ang, size: sz, k });
    }
    return out;
  }
  // Teardrop with its tip pointing along `dir` (radians).
  function dropDir(ctx, x, y, w, h, dir) { ctx.save(); ctx.translate(x, y); ctx.rotate(dir + Math.PI / 2); teardrop(ctx, 0, 0, w, h, 0); ctx.restore(); }
  // Flames standing on the burning brute. Density follows brute.burning, so the burn visibly ramps up.
  function burnFlames(S) {
    const b = S.brute; if (b.burning <= 0.01) return [];
    return AS.emit(S.t, { rate: 34 * Math.min(S.D, 2.2), life: 0.55, seed: 905 }, (i, age) => {
      if (rand(905, i, 9) > b.burning) return null;
      const k = rand(905, i, 1), u = rand(905, i, 2) - 0.5;
      const spread = 0.3 + 0.7 * b.burning, lx = 22 * (1 - spread) + u * 62 * spread, top = -40 - 22 * Math.cos(lx / 62 * Math.PI);
      const ly = top + rand(905, i, 3) * 14;
      return { x: b.x + lx * b.s + Math.sin(age * 6 + k * 7) * 2.5, y: b.y + (ly + b.bob) * b.s - age * (18 + 18 * k), age, r: k,
        size: (1 - age) * (5 + 6 * k) * Math.min(1, age * 6) * (0.55 + 0.45 * b.burning) };
    });
  }
  const burnSmoke = (S) => S.brute.burning <= 0.05 ? [] : AS.emit(S.t, { rate: 5 * S.D, life: 1.3, seed: 906 }, (i, age) => {
    if (rand(906, i, 9) > S.brute.burning) return null;
    const b = S.brute, k = rand(906, i, 1);
    return { x: b.x + (k - 0.5) * 30 + age * 18, y: b.y - 62 + b.bob - age * 46, age, size: 6 + age * 14, r: k };
  });
  // HUD: payload elements that the queue doesn't already show, displayed as "+fire" chips after the queue.
  function payloadChips(h, S) {
    if (h.id !== 'p1' || !S.beam || !S.beam.payload) return [];
    const have = new Set(h.queue.map((q) => q.el));
    return S.beam.payload.filter((e) => !have.has(e));
  }
  // Burn status chip position on the brute (behind its back, clear of the damage numbers).
  const burnChipPos = (S) => [S.brute.x + 40, S.brute.y - 66 + S.brute.bob];

  function lightsFor(S, E, o = {}) {
    const L = [];
    const fireA = o.fireA ?? 0.95;
    L.push({ x: S.fire.x, y: S.fire.y - 10, r: o.fireR ?? 190, c: E.fireLight || E.fire, a: fireA });
    L.push({ x: S.imp.x, y: S.imp.y - 14, r: 70, c: E.fireLight || E.fire, a: 0.6 });
    L.push({ x: S.ward.x, y: S.ward.y, r: 95, c: E.shield, a: 0.45 + S.ward.pulse * 0.4 });
    const tip1 = AS.staffTip(S.players[0]), tip2 = AS.staffTip(S.players[1]);
    L.push({ x: tip1[0], y: tip1[1], r: 60, c: E.arcane, a: 0.5 });
    L.push({ x: tip2[0], y: tip2[1], r: 60, c: S.players[1].element === 'water' ? E.water : E.cold, a: 0.45 + S.spray.cold * 0.4 });
    if (S.beam) {
      const B = S.beam, fire = hasFire(B);
      for (let i = 0; i <= 6; i++) { const p = i / 6; L.push({ x: lerp(B.x1, B.x2, p), y: lerp(B.y1, B.y2, p), r: 70, c: fire && i % 2 ? E.fire : E.arcane, a: 0.38 * B.on }); }
      L.push({ x: B.x2, y: B.y2, r: 120, c: E.arcane, a: (o.impactA ?? 0.75) * B.on });
    }
    if (S.brute.burning > 0) L.push({ x: S.brute.x, y: S.brute.y - 40, r: 120, c: E.fire, a: (o.burnA ?? 0.75) * S.brute.burning });
    if (S.spray.cold > 0) for (let i = 1; i <= 3; i++) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * i * 55, y: S.spray.y + Math.sin(S.spray.ang) * i * 55, r: 80, c: E.cold, a: 0.35 * S.spray.cold });
    if (S.spray.water > 0) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * 90, y: S.spray.y + Math.sin(S.spray.ang) * 90, r: 90, c: E.water, a: 0.3 * S.spray.water });
    if (S.puddle.ice > 0 && S.puddle.front > 0) L.push({ x: S.puddle.x - S.puddle.rx * (1 - S.puddle.front), y: S.puddle.y, r: 90 * S.puddle.front + 30, c: E.cold, a: 0.28 * S.puddle.ice });
    return L;
  }
  const flicker = (t) => 0.9 + Math.sin(t * TAU * 3) * 0.05 + Math.sin(t * TAU * 5 + 1) * 0.05;
  const GROUND_PATH = (px) => 214 + Math.sin(px / 44 * 0.8) * 16 + (px > 360 ? (px - 360) * 0.12 : 0);

  // =====================================================================
  // R2-A. GLOW ARCADE: lit dark world, bright toon characters with rim light
  // =====================================================================
  const AINK = '#170f2c', ASHADE = '#3a1f6e';
  const AP = {
    el: { fire: '#ff7a1a', fireHot: '#ffd640', water: '#2f8cff', cold: '#8ff0ff', arcane: '#ff3d9e', shield: '#ffd84a' },
    p1: { robe: '#ff3b3b', trim: '#ffd84a', sleeve: '#d02838', hat: '#ff3b3b', band: '#ffd84a' },
    p2: { robe: '#2f86ff', trim: '#bff0ff', sleeve: '#1f5fd8', hat: '#2f86ff', band: '#bff0ff' },
    wizard: { skin: '#ffcfa0', beard: '#ffffff', staff: '#b8743e', hand: '#ffcfa0' },
    goblin: { body: '#8ce048', belly: '#d2f58a', dark: '#3d7a2a', club: '#c08548' },
    archer: { body: '#8ce048', cloth: '#b05cd8', dark: '#3d7a2a', bow: '#d08a3c', string: '#ffffff', arrow: '#f0dcb0', hand: '#8ce048' },
    brute: { body: '#e8804e', belly: '#ffc89e', dark: '#6a2e1e', horn: '#fff2d6', brow: AINK },
    imp: { body: '#b866ff', wing: '#7a2ad0', horn: '#ffe2a2', tail: '#7a2ad0' },
    common: { eye: AINK, eyeWhite: '#fffbe8', tooth: '#ffffff' },
  };
  function arcadeGround(scale) {
    return AS.cached('glow-arcade-ground', W, H, scale, (x) => {
      x.fillStyle = '#272a58'; x.fillRect(0, 0, W, H);
      x.lineJoin = 'round';
      // chunky cartoon flagstones with ink seams
      const cols = ['#33377a', '#2e3270', '#3a3c82', '#30366e', '#363a7a'];
      for (let gy = -1; gy < 9; gy++) for (let gx = -1; gx < 11; gx++) {
        const i = gy * 13 + gx + 40, cx = gx * 64 + (gy % 2) * 32 + (rand(i, 1) - 0.5) * 10, cy = gy * 48 + 20 + (rand(i, 2) - 0.5) * 8;
        x.beginPath(); AS.path(x, blobPts(cx, cy, 27 + rand(i, 3) * 4, 19 + rand(i, 4) * 3, i, 10, 0.1));
        x.fillStyle = cols[i % cols.length]; x.fill(); x.lineWidth = 3; x.strokeStyle = '#15132e'; x.stroke();
        x.beginPath(); x.ellipse(cx - 8, cy - 6, 9, 4, -0.3, 0, TAU); x.fillStyle = 'rgba(140,150,230,0.12)'; x.fill();
      }
      // moss in the seams
      for (let i = 0; i < 12; i++) { x.beginPath(); AS.path(x, blobPts(rand(i, 5) * W, rand(i, 6) * H, 26 + rand(i, 7) * 30, 12 + rand(i, 8) * 12, i * 2.1, 20, 0.35)); x.fillStyle = 'rgba(40,120,110,0.35)'; x.fill(); }
      // worn path of paler stones
      for (let i = 0; i < 60; i++) {
        const px = rand(i, 21) * W, py = GROUND_PATH(px) + (rand(i, 22) - 0.5) * 34;
        x.beginPath(); AS.path(x, blobPts(px, py, 9 + rand(i, 23) * 8, 6 + rand(i, 24) * 4, i, 10, 0.15));
        x.fillStyle = 'rgba(120,120,190,0.35)'; x.fill();
      }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        x.beginPath(); AS.path(x, blobPts(rx, ry, rr, rr * 0.75, rx, 14, 0.15)); x.fillStyle = '#5a5c98'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#15132e'; x.stroke();
        x.beginPath(); x.ellipse(rx - rr * 0.3, ry - rr * 0.3, rr * 0.35, rr * 0.2, -0.4, 0, TAU); x.fillStyle = '#8a8cc8'; x.fill();
      }
    });
  }
  function merged(ctx, items, shape, layers) {
    for (const L of layers) {
      ctx.beginPath();
      for (const it of items) shape(ctx, it, L.k);
      if (L.stroke) { ctx.lineWidth = L.stroke; ctx.strokeStyle = L.color; ctx.stroke(); } else { ctx.fillStyle = L.color; ctx.fill(); }
    }
  }
  function arcadeActor(ctx, a, S, L) {
    const parts = world(a), [rad] = AS.SIZE[a.kind], R = rimFrom(a, L);
    const rim = mix(R.c, '#ffffff', 0.4), rs = clamp(0.6 + R.s * 2.2);
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(a.x - R.dx * 5, a.y + 1, rad * 1.15 * a.s, rad * 0.4 * a.s, 0, 0, TAU); ctx.fillStyle = 'rgba(6,3,18,0.55)'; ctx.fill();
    // 1) ink silhouette
    ctx.strokeStyle = AINK;
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.line ? p.w + 5 : 6; ctx.stroke(); }
    // 2) rim light: the silhouette nudged toward the light replaces the ink on the lit side
    ctx.save(); ctx.translate(R.dx * 2.7, R.dy * 2.7); ctx.globalAlpha = a.alpha * rs; ctx.fillStyle = rim; ctx.strokeStyle = rim;
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); if (p.line) { ctx.lineWidth = p.w + 1.5; ctx.stroke(); } else ctx.fill(); }
    ctx.restore();
    // 3) flat saturated fills, cel shadow on the side away from the light
    const burnK = a.burning * (a.kind === 'imp' ? 0.1 : 0.3) * (0.8 + 0.2 * Math.sin(S.t * 37));
    for (const { p, w } of parts) {
      const col = colorOf(AP, a, p.role);
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      ctx.fillStyle = col; ctx.fill();
      if (p.big) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = mix(col, ASHADE, 0.42); ctx.fillRect(a.x - 70, a.y - 100, 140, 110);
        ctx.translate(R.dx * 3.2, R.dy * 3.2); ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fillStyle = col; ctx.fill();
        ctx.restore();
        ctx.beginPath(); AS.partPath(ctx, p, w);
        if (a.wet) { ctx.fillStyle = hexA(AP.el.water, 0.32 * a.wet); ctx.fill(); }
        if (burnK > 0) { ctx.fillStyle = hexA('#ff6a10', burnK); ctx.fill(); }
      }
      if (p.role !== 'eye') { ctx.strokeStyle = AINK; ctx.lineWidth = 1.7; ctx.stroke(); }
      if (p.role === 'orb') { ctx.beginPath(); ctx.arc(w[0][0] - 4.6 - 1.6 * a.face + 4.6, w[0][1] - 1.6, 1.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
    if (a.hit > 0) {
      ctx.globalAlpha = a.alpha * a.hit * 0.6; ctx.fillStyle = '#ffffff';
      for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); }
      ctx.globalAlpha = a.alpha;
    }
    if (a.frozen > 0) {
      const [r, h] = AS.SIZE[a.kind], hh = (h + 8) * a.frozen, x = a.x - r - 4, y = a.y + 5 - hh, w = 2 * r + 8;
      ctx.beginPath(); ctx.roundRect(x, y, w, hh, 6); ctx.fillStyle = 'rgba(150,235,255,0.55)'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = AINK; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(x + 5, y + 16); ctx.lineTo(x + 16, y + 5); ctx.moveTo(x + 5, y + 26); ctx.lineTo(x + 26, y + 5); ctx.stroke();
      ctx.fillStyle = 'rgba(60,140,220,0.3)'; ctx.fillRect(x + w * 0.62, y, w, hh);
      if (a.crack > 0) { ctx.strokeStyle = AINK; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < Math.ceil(a.crack * 5); i++) { const cx = x + w * rand(i, 61), cy = y + hh * rand(i, 62); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rand(i, 63) - 0.5) * 18, cy + (rand(i, 64) - 0.5) * 18); ctx.lineTo(cx + (rand(i, 65) - 0.5) * 26, cy + (rand(i, 66) - 0.5) * 26); } ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }
  function arcadeRender(ctx, S, scale) {
    const t = S.t, E = AP.el, bgt = budget(S), F = S.fire, flick = flicker(t);
    ctx.save();
    ctx.drawImage(arcadeGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // scorch + puddle + ice, then the light map darkens the world (but not the characters)
    ctx.beginPath(); AS.path(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 30, 0.14)); ctx.fillStyle = '#3a1a20'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = AINK; ctx.stroke();
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 34, 0.1);
    ctx.beginPath(); AS.path(ctx, pud); ctx.fillStyle = '#2a6ad8'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(200,230,255,0.6)'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); iceFrontPath(ctx, P, 6); ctx.fillStyle = '#bdf2ff'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { const cx = P.x - P.rx + 20 + i * 38; ctx.beginPath(); ctx.moveTo(cx, P.y + 8); ctx.lineTo(cx + 12, P.y - 6); ctx.stroke(); }
      if (P.crack > 0) { ctx.strokeStyle = AINK; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.beginPath(); AS.path(ctx, pud); ctx.lineWidth = 3.5; ctx.strokeStyle = AINK; ctx.stroke();
    const L = lightsFor(S, E);
    lightMap(ctx, 'arcade-light', scale, '#5c5a96', L.map((l) => ({ ...l, a: l.c === E.fire ? l.a * flick : l.a })));
    // coloured light spill on the floor
    ctx.globalCompositeOperation = 'lighter';
    for (const l of L) soft(ctx, l.x, l.y, l.r * 0.75, l.c, l.a * 0.16 * bgt);
    ctx.globalCompositeOperation = 'source-over';
    // fire patch tongues (bright, toon-outlined: effects are not dimmed by the light map)
    merged(ctx, S.tongues, (c, f, k) => teardrop(c, f.x, f.y - (1 - k) * 2, f.w * k, f.h * k, f.sway * k), [
      { k: 1, stroke: 5, color: AINK }, { k: 1, color: '#ff4a26' }, { k: 0.66, color: '#ff9c1f' }, { k: 0.36, color: '#ffe85c' }]);
    // characters: bright and unlit, with a rim from the brightest nearby light
    for (const a of S.actors) arcadeActor(ctx, a, S, L);
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2.6, 7); ctx.fillStyle = E.water; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = AINK; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // smoke (dark purple puffs) under the flames
    const sm = [...S.smoke, ...burnSmoke(S)].filter((s) => s.age > 0.12 && s.age < 0.85);
    ctx.globalAlpha = 0.75;
    merged(ctx, sm, (c, s, k) => { const r = s.size * 0.62 * k * (1 - seg(s.age, 0.5, 0.85) * 0.7); c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }, [
      { k: 1, stroke: 3, color: AINK }, { k: 1, color: '#4a3a6e' }, { k: 0.55, color: '#5e4e86' }]);
    ctx.globalAlpha = 1;
    // flames: patch, imp, and the brute's payload burn
    const bf = burnFlames(S);
    const fl = [...S.flames, ...S.impFlames, ...bf].filter((f) => f.size > 0.6);
    merged(ctx, fl, (c, f, k) => teardrop(c, f.x, f.y, f.size * k, f.size * 2.6 * k), [
      { k: 1, stroke: 4, color: AINK }, { k: 1, color: '#ff5a24' }, { k: 0.55, color: '#ffd84a' }]);
    for (const e of S.embers) { ctx.beginPath(); ctx.arc(e.x, e.y, 2.2 * (1 - e.age) + 0.8, 0, TAU); ctx.fillStyle = e.r > 0.5 ? '#ffe85c' : '#ff8a2a'; ctx.fill(); }
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.45; ctx.beginPath(); ctx.arc(m.x, m.y, m.size * 0.6, 0, TAU); ctx.fillStyle = '#d8f8ff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // sprays
    const sp = S.spray.parts, water = sp.filter((p) => p.kind === 'water'), cold = sp.filter((p) => p.kind === 'cold');
    merged(ctx, water, (c, p, k) => { const r = (1.6 + p.size * 0.55) * k * (1 - seg(p.age, 0.8, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 3.5, color: AINK }, { k: 1, color: E.water }, { k: 0.45, color: '#a6d8ff' }]);
    merged(ctx, cold, (c, p, k) => { const r = (1.5 + p.size * 0.85) * k * (1 - seg(p.age, 0.7, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 4, color: AINK }, { k: 1, color: '#7fe0ff' }, { k: 0.62, color: '#e6fbff' }]);
    for (const [i, p] of cold.entries()) if (i % 4 === 0 && p.age < 0.85) { ctx.beginPath(); starPath(ctx, p.x, p.y, 6, 4.5, 1.6, p.rot); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = AINK; ctx.stroke(); }
    if (S.spray.water + S.spray.cold > 0) { ctx.beginPath(); ctx.arc(S.spray.x, S.spray.y, 7 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.fillStyle = S.spray.cold > 0 ? '#e6fbff' : '#a6d8ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = AINK; ctx.stroke(); }
    // ---- the beam: arcane core + fire payload braid ----
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 24, 1.4 * o, 0.8, 26), fire = hasFire(B);
      const br = fire ? braid(B, t, 48, 10 * o, 3.4, 16) : null;
      const strands = (front) => {
        if (!br) return;
        for (const [s, col] of [[0, E.fire], [1, E.fireHot]]) {
          ctx.lineWidth = 8 * o; ctx.strokeStyle = AINK; strokeRuns(ctx, br[s], front);
          ctx.lineWidth = 4.2 * o; ctx.strokeStyle = front ? col : mix(col, '#7a2a10', 0.35); strokeRuns(ctx, br[s], front);
        }
      };
      strands(false);
      for (const [lw, col] of [[18 * o, AINK], [13 * o, E.arcane], [6.5 * o, '#ffb3d6'], [2.6 * o, '#ffffff']]) { ctx.lineWidth = lw; ctx.strokeStyle = col; strokePts(ctx, pts); }
      strands(true);
      if (fire) {
        const lk = licks(B, t, S.D);
        merged(ctx, lk, (c, f, k) => dropDir(c, f.x, f.y, 4.6 * f.size * k, 15 * f.size * k, f.ang + Math.PI), [
          { k: 1, stroke: 3.5, color: AINK }, { k: 1, color: E.fire }, { k: 0.55, color: E.fireHot }]);
      }
      // impact: arcane star with a fire splash round it
      const rot = t * 6;
      if (fire) for (let i = 0; i < 6; i++) {
        const a = rot * 0.7 + i / 6 * TAU, rr = 15 * o + Math.sin(t * 30 + i) * 3;
        ctx.beginPath(); dropDir(ctx, B.x2 + Math.cos(a) * rr * 0.6, B.y2 + Math.sin(a) * rr * 0.6, 4.5 * o, 17 * o, a);
        ctx.fillStyle = i % 2 ? E.fire : E.fireHot; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = AINK; ctx.stroke();
      }
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 18 * o + Math.sin(t * 50) * 2, 8 * o, rot); ctx.fillStyle = E.arcane; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = AINK; ctx.stroke();
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 9 * o, 4 * o, -rot); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(B.x1, B.y1, 9 * o, 0, TAU); ctx.fillStyle = '#ffb3d6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = AINK; ctx.stroke();
      for (const s of S.beamSparks) { const Ln = 7 * (1 - s.age); ctx.lineWidth = 4; ctx.strokeStyle = AINK; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * Ln, s.y - Math.sin(s.a) * Ln); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = s.r > 0.66 ? '#fff' : s.r > 0.33 || !fire ? E.arcane : E.fire; ctx.stroke(); }
    }
    // ward bubble
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = hexA(E.shield, 0.12 + Wd.pulse * 0.22); ctx.fill();
    ctx.lineWidth = 4.5; ctx.strokeStyle = AINK; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = E.shield; ctx.stroke();
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr - 6, Math.PI * 1.1, Math.PI * 1.45); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    if (Wd.pulse > 0) { ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 26 + 4, 0, TAU); ctx.lineWidth = 3 * Wd.pulse; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    for (const s of S.wardSparks) { ctx.beginPath(); starPath(ctx, s.x, s.y, 4, 4.5 * (1 - s.age), 1.6 * (1 - s.age), s.a); ctx.fillStyle = s.r > 0.4 ? E.shield : '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = AINK; ctx.stroke(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.lineWidth = 5; c.strokeStyle = AINK; c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = '#f0d49a'; c.stroke();
      c.beginPath(); c.moveTo(14, 0); c.lineTo(7, -4.5); c.lineTo(7, 4.5); c.closePath(); c.fillStyle = '#d8d4ea'; c.fill(); c.lineWidth = 2; c.strokeStyle = AINK; c.stroke();
    });
    for (const s of S.shards) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1);
      ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]);
      ctx.fillStyle = s.r > 0.5 ? '#e6fbff' : '#8fe6ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = AINK; ctx.stroke(); ctx.restore();
    }
    // ---- additive glow pass (budgeted by chaos): the "glow" half of the style ----
    ctx.globalCompositeOperation = 'lighter';
    const gk = 0.5 * bgt;
    for (const tg of S.tongues) soft(ctx, tg.x, tg.y - tg.h * 0.5, tg.h * 1.3, '#ff6a20', 0.12 * gk);
    soft(ctx, F.x, F.y - 8, 120, '#ff6a20', 0.35 * gk * flick);
    for (const f of bf) soft(ctx, f.x, f.y - f.size, f.size * 3, '#ff7a20', 0.35 * gk);
    if (S.brute.burning > 0) soft(ctx, S.brute.x, S.brute.y - 42, 62, '#ff7a20', 0.22 * S.brute.burning * gk * flick);
    if (S.beam) {
      const B = S.beam, o = B.on;
      ctx.lineWidth = 34 * o; ctx.strokeStyle = hexA(E.arcane, 0.16 * gk * 2); strokePts(ctx, [[B.x1, B.y1], [B.x2, B.y2]]);
      soft(ctx, B.x2, B.y2, 48 * o, E.arcane, 0.42 * gk * 2); soft(ctx, B.x2, B.y2, 22 * o, hasFire(B) ? E.fire : '#ffffff', 0.3 * gk * 2);
      soft(ctx, B.x1, B.y1, 26 * o, E.arcane, 0.8 * gk * 2);
    }
    if (S.spray.cold + S.spray.water > 0) soft(ctx, S.spray.x, S.spray.y, 30, S.spray.cold > 0 ? E.cold : E.water, 0.7 * gk * 2);
    if (Wd.pulse > 0) soft(ctx, Wd.hitX, Wd.hitY, 34, E.shield, Wd.pulse * gk * 2);
    for (const a of [...S.goblins, S.archer, S.imp, S.brute]) {
      if (a.alpha < 0.3 || a.frozen > 0.5) continue;
      const f = AS.xf(a), eyes = { goblin: [[1.6, -25]], archer: [[2.8, -25]], brute: [[2.3, -54]], imp: [[1.7, -22]] }[a.kind];
      for (const e of eyes) { const [ex, ey] = f(e); soft(ctx, ex, ey, 9, '#fff2a0', 0.18); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // burn status chip on the brute
    if (S.brute.burning > 0.05) {
      const [bx, by] = burnChipPos(S), r = 9 * ease.back(clamp(S.brute.burning * 1.6));
      ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fillStyle = E.fire; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = AINK; ctx.stroke();
      AS.glyph(ctx, 'fire', bx, by + 0.5, r * 0.68); ctx.fillStyle = '#fff6c8'; ctx.fill();
    }
    // numbers
    const NC = { arcane: '#ff6aa6', crit: '#ffe14a', fire: '#ff9a3a', cold: '#c4f4ff', water: '#79c2ff', shield: '#ffe14a' };
    for (const n of S.numbers) {
      const size = (n.big ? 25 : 19) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.translate(n.x, n.y); ctx.rotate((rand(n.x | 0, 3) - 0.5) * 0.25);
      ctx.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5.5; ctx.strokeStyle = AINK; ctx.strokeText(n.text, 0, 0); ctx.fillStyle = NC[n.kind]; ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    // HUD
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 12); ctx.fillStyle = 'rgba(28,22,58,0.92)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = AINK; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(h.x + 1.5, h.y + 1.5, h.w - 3, h.h - 3, 10.5); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(160,150,255,0.35)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 13, 0, TAU); ctx.fillStyle = AP[h.team].robe; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = AINK; ctx.stroke();
      ctx.font = '13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140, 6, 3); ctx.fillStyle = '#0e0a22'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140 * h.hp, 6, 3); ctx.fillStyle = '#5fec6a'; ctx.fill();
      const chips = payloadChips(h, S);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 12, q = h.queue[i], pc = !q && chips[i - h.queue.length];
        if (pc) {
          ctx.font = '13px "Lilita One", sans-serif'; ctx.fillStyle = '#ffd6a0'; ctx.fillText('+', cx - 11, cy + 1);
          ctx.beginPath(); ctx.arc(cx + 1, cy, 7.5, 0, TAU); ctx.fillStyle = E[pc] || E.fire; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = AINK; ctx.stroke();
          AS.glyph(ctx, pc, cx + 1, cy, 4.8); ctx.fillStyle = '#fff'; ctx.fill(); continue;
        }
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, TAU); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(160,150,255,0.4)'; ctx.stroke(); ctx.setLineDash([]); continue; }
        const r = 9.5 * ease.back(q.pop);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = E[q.el]; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = AINK; ctx.stroke();
        AS.glyph(ctx, q.el, cx, cy, r * 0.62); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    ctx.restore();
  }
  AS.register({
    id: 'glow-arcade', name: 'Glow Arcade', family: 'glow', round: 2,
    refs: ['Hades', 'Brawl Stars', 'Rayman Legends (dark levels)'],
    feel: 'The dark, lit world of Dark Painterly Glow, but the characters are not lit by it: they stay bright, saturated, chunky toons with ink outlines, and the nearest light paints a coloured rim on them. Spells are toon-outlined shapes with a budgeted glow on top, so the mood comes from the world and the fun comes from the cast.',
    notes: {
      read: ['Strongest of the three', 'Bodies never sink into the murk, and the fire payload reads clearly as orange-and-yellow strands twisting round the pink beam, with flame licks riding it into a brute that visibly catches fire and gets a burn chip. Outlines keep it from washing out at high chaos; the glow is capped per particle.'],
      tone: ['Moody but fun', 'Darkness frames the action without going grim, because the characters stay toy-bright and outlined. Closest to "cartoony and arcadey" in this family.'],
      cost: ['Medium', 'Characters are plain toon assets that ignore the lighting (cheap); only the world needs a light map. Spells need both an outlined shape and a glow pass.'],
    },
    render: arcadeRender,
  });

  // =====================================================================
  // R2-B. GLOW NEON: few-value dusk world, silhouettes with team rims, neon spells + bloom
  // =====================================================================
  const NP = {
    bg0: '#0e1436', bg1: '#141b47', bg2: '#1c2558', sil: '#070a1e',
    p1: '#ff4a5e', p2: '#38a8ff', enemy: '#9aa0e8', eye: '#ffe94a',
    el: { fire: '#ff9124', fireHot: '#ffe08a', water: '#3a78ff', cold: '#8afcff', arcane: '#e64dff', shield: '#ffe94a' },
  };
  function neonGround(scale) {
    return AS.cached('glow-neon-ground', W, H, scale, (x) => {
      x.fillStyle = NP.bg0; x.fillRect(0, 0, W, H);
      x.lineJoin = 'round';
      // a few large flat slabs in the second value
      for (let i = 0; i < 16; i++) {
        const cx = rand(i, 401) * W, cy = rand(i, 402) * H;
        x.beginPath(); polyPath(x, jit(blobPts(cx, cy, 52 + rand(i, 403) * 34, 30 + rand(i, 404) * 18, i, 7, 0.12), i, 6)); x.fillStyle = NP.bg1; x.fill();
      }
      // the path: one flat band
      x.beginPath();
      for (let px = -10; px <= W + 10; px += 10) x.lineTo(px, GROUND_PATH(px) - 20);
      for (let px = W + 10; px >= -10; px -= 10) x.lineTo(px, GROUND_PATH(px) + 20);
      x.closePath(); x.fillStyle = NP.bg1; x.fill();
      x.lineWidth = 1; x.strokeStyle = NP.bg2; x.stroke();
      // rocks: lit top in the third value, shadow side in silhouette
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        x.beginPath(); polyPath(x, jit(blobPts(rx + 2, ry + 3, rr, rr * 0.75, rx, 7, 0.1), rx, 2)); x.fillStyle = NP.sil; x.fill();
        x.beginPath(); polyPath(x, jit(blobPts(rx, ry, rr * 0.92, rr * 0.68, rx, 7, 0.1), rx, 2)); x.fillStyle = NP.bg2; x.fill();
      }
      // sparse tick marks so the floor doesn't feel empty
      x.strokeStyle = NP.bg2; x.lineWidth = 1.2; x.lineCap = 'round';
      for (let i = 0; i < 40; i++) { const gx = rand(i, 411) * W, gy = rand(i, 412) * H; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + 6, gy - 3); x.stroke(); }
    });
  }
  function neonRim(a) {
    let c = a.team === 'p1' ? NP.p1 : a.team === 'p2' ? NP.p2 : NP.enemy;
    if (a.wet > 0 && a.frozen < 0.5) c = mix(c, NP.el.water, 0.7 * a.wet);
    if (a.burning > 0) c = mix(c, NP.el.fire, Math.min(1, a.burning * 1.3));
    return c;
  }
  function neonActor(ctx, fx, a, S) {
    const parts = world(a), isP = a.team !== 'enemy', rw = isP ? 3.2 : 2.2, col = neonRim(a);
    for (const c of [ctx, fx]) {
      c.save(); c.globalAlpha = a.alpha; c.lineJoin = 'round'; c.lineCap = 'round';
      if (isP) { c.beginPath(); c.ellipse(a.x, a.y + 2, 20, 6.5, 0, 0, TAU); c.lineWidth = 1.6; c.strokeStyle = hexA(col, 0.7); c.stroke(); }
      c.strokeStyle = col;
      for (const { p, w } of parts) { c.beginPath(); AS.partPath(c, p, w); c.lineWidth = p.line ? p.w + rw * 1.6 : rw * 2; c.stroke(); }
      if (c === fx) c.globalCompositeOperation = 'destination-out';
      c.fillStyle = NP.sil; c.strokeStyle = NP.sil;
      for (const { p, w } of parts) { c.beginPath(); AS.partPath(c, p, w); if (p.line) { c.lineWidth = p.w; c.stroke(); } else c.fill(); }
      c.globalCompositeOperation = 'source-over';
      // emissive details: eyes and staff orbs
      const f = AS.xf(a);
      if (a.kind === 'wizard') {
        for (const e of [[-2.8, -33.5], [3.2, -33.5]]) { const [ex, ey] = f(e); c.fillStyle = '#ffffff'; c.fillRect(ex - 1, ey - 1.3, 2, 2.6); }
        const [ox, oy] = f([14, -47]); c.beginPath(); c.arc(ox, oy, 3.6, 0, TAU); c.fillStyle = mix(NP.el[a.element] || '#fff', '#ffffff', 0.4); c.fill();
      } else if (a.frozen < 0.5) {
        const eyes = { goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[-0.8, -22], [4.2, -22]] }[a.kind];
        for (const e of eyes) { const [ex, ey] = f(e); c.beginPath(); c.arc(ex, ey, 1.6 * a.s, 0, TAU); c.fillStyle = NP.eye; c.fill(); }
      }
      if (a.hit > 0) { c.globalAlpha = a.alpha * a.hit; c.strokeStyle = '#ffffff'; for (const { p, w } of parts) if (!p.line) { c.beginPath(); AS.partPath(c, p, w); c.lineWidth = 1.6; c.stroke(); } c.globalAlpha = a.alpha; }
      if (a.frozen > 0) {
        const [r, h] = AS.SIZE[a.kind], hh = (h + 8) * a.frozen, x0 = a.x - r - 5, y0 = a.y + 5 - hh, w0 = 2 * r + 10;
        const ice = jit([[x0 + 2, y0 + 3], [x0 + w0 * 0.45, y0], [x0 + w0, y0 + 5], [x0 + w0 + 1, y0 + hh * 0.6], [x0 + w0 - 2, y0 + hh], [x0 + 2, y0 + hh], [x0 - 1, y0 + hh * 0.4]], hash(a.id), 3);
        c.beginPath(); polyPath(c, ice); c.fillStyle = hexA(NP.el.cold, 0.14); c.fill(); c.lineWidth = 1.6; c.strokeStyle = NP.el.cold; c.stroke();
        c.beginPath(); c.moveTo(x0 + 6, y0 + 14); c.lineTo(x0 + 14, y0 + 6); c.moveTo(x0 + 6, y0 + 24); c.lineTo(x0 + 22, y0 + 8); c.lineWidth = 1; c.strokeStyle = hexA('#ffffff', 0.7); c.stroke();
        if (a.crack > 0) { c.beginPath(); for (let i = 0; i < 5 * a.crack; i++) { const qx = x0 + w0 * rand(i, 61), qy = y0 + hh * rand(i, 62); c.moveTo(qx, qy); c.lineTo(qx + (rand(i, 63) - 0.5) * 20, qy + (rand(i, 64) - 0.5) * 20); } c.lineWidth = 1.2; c.strokeStyle = '#ffffff'; c.stroke(); }
      }
      c.restore();
    }
  }
  function neonRender(ctx, S, scale) {
    const t = S.t, E = NP.el, bgt = budget(S), F = S.fire, flick = flicker(t);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const fxC = buf('neon-fx', cw, ch), fx = fxC.getContext('2d');
    fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.clearRect(0, 0, cw, ch);
    fx.setTransform(scale, 0, 0, scale, 0, 0); fx.lineJoin = 'round'; fx.lineCap = 'round';
    ctx.save();
    ctx.drawImage(neonGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // fire patch floor: a flat ember-dark blob with a hot outline
    const fireBlob = blobPts(F.x, F.y, F.rx, F.ry, 5, 26, 0.16);
    ctx.beginPath(); polyPath(ctx, fireBlob); ctx.fillStyle = '#1e1030'; ctx.fill();
    fx.beginPath(); polyPath(fx, fireBlob); fx.lineWidth = 1.2; fx.strokeStyle = hexA(E.fire, 0.55); fx.stroke();
    // puddle + ice
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 30, 0.1);
    ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = '#0a1a4a'; ctx.fill();
    fx.save(); fx.beginPath(); polyPath(fx, pud); fx.lineWidth = 1.4; fx.strokeStyle = hexA(E.water, 0.8); fx.stroke(); fx.clip();
    fx.strokeStyle = hexA('#6aa0ff', 0.7); fx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; fx.globalAlpha = 1 - k; fx.beginPath(); fx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); fx.stroke(); }
    fx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      fx.globalAlpha = P.ice;
      fx.beginPath(); const fxp = iceFrontPath(fx, P, 6); fx.fillStyle = hexA(E.cold, 0.22); fx.fill();
      fx.strokeStyle = hexA(E.cold, 0.8); fx.lineWidth = 1;
      fx.beginPath(); for (let i = 0; i < 8; i++) { const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; if (cx > fxp) continue; fx.moveTo(cx, cy); fx.lineTo(cx + 14, cy - 6); } fx.stroke();
      if (P.front < 1) { fx.beginPath(); for (let i = 0; i <= 9; i++) fx.lineTo(fxp + (i % 2 ? 6 : -6) * (0.6 + rand(i, 3) * 0.6), P.y - P.ry - 4 + (i / 9) * (2 * P.ry + 8)); fx.lineWidth = 2; fx.strokeStyle = E.cold; fx.stroke(); }
      if (P.crack > 0) { fx.strokeStyle = '#ffffff'; fx.lineWidth = 1.2; fx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; fx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); fx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } fx.stroke(); }
      fx.globalAlpha = 1;
    }
    fx.restore();
    // fire tongues: neon outlines (behind actors)
    for (const tg of S.tongues) {
      fx.beginPath(); teardrop(fx, tg.x, tg.y, tg.w * 0.8, tg.h * 1.25, tg.sway); fx.lineWidth = 1.6; fx.strokeStyle = hexA(E.fire, 0.95 * flick); fx.stroke();
      fx.beginPath(); teardrop(fx, tg.x, tg.y - 1, tg.w * 0.4, tg.h * 0.7, tg.sway * 0.6); fx.lineWidth = 1.1; fx.strokeStyle = hexA(E.fireHot, 0.9); fx.stroke();
    }
    // actors: dark silhouettes with a team rim (rims also go to the emissive layer)
    for (const a of S.actors) neonActor(ctx, fx, a, S);
    // smoke dims the emissive layer a little
    fx.save(); fx.globalCompositeOperation = 'destination-out';
    for (const s of [...S.smoke, ...burnSmoke(S)]) { if (s.age < 0.1) continue; soft(fx, s.x, s.y, s.size, '#000000', 0.35 * (1 - s.age)); }
    fx.restore();
    for (const s of [...S.smoke, ...burnSmoke(S)]) { if (s.age < 0.1) continue; ctx.globalAlpha = 0.35 * (1 - s.age); ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 0.7, 0, TAU); ctx.fillStyle = NP.sil; ctx.fill(); }
    ctx.globalAlpha = 1;
    // flames + embers + payload burn
    const bf = burnFlames(S);
    for (const f of [...S.flames, ...S.impFlames]) { if (f.size < 0.8) continue; fx.beginPath(); teardrop(fx, f.x, f.y, f.size * 0.7, f.size * 2.3, 0); fx.lineWidth = 1.2; fx.strokeStyle = hexA(f.age < 0.35 ? E.fireHot : E.fire, 0.9); fx.stroke(); }
    for (const f of bf) { if (f.size < 0.8) continue; fx.beginPath(); teardrop(fx, f.x, f.y, f.size * 0.75, f.size * 2.6, 0); fx.lineWidth = 1.5; fx.strokeStyle = f.age < 0.35 ? E.fireHot : E.fire; fx.stroke(); }
    for (const e of S.embers) { fx.fillStyle = hexA(e.r > 0.5 ? E.fireHot : E.fire, 1 - e.age * 0.6); fx.fillRect(e.x - 1, e.y - 1, 2, 2); }
    for (const m of S.mist) soft(fx, m.x, m.y, m.size, E.cold, 0.1 * Math.sin(m.age * Math.PI));
    for (const d of S.drips) { fx.fillStyle = hexA(E.water, 1 - d.age); fx.fillRect(d.x - 0.8, d.y - 2.5, 1.6, 5); }
    // sprays: crisp streaks pointing away from the staff
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.75, 1), a = Math.atan2(p.y - S.spray.y, p.x - S.spray.x), Ln = (p.kind === 'cold' ? 4 + p.size * 0.9 : 3 + p.size * 0.6) * k;
      fx.beginPath(); fx.moveTo(p.x, p.y); fx.lineTo(p.x - Math.cos(a) * Ln, p.y - Math.sin(a) * Ln);
      fx.lineWidth = p.kind === 'cold' ? 1.6 : 2; fx.strokeStyle = p.kind === 'cold' ? (p.r > 0.5 ? '#e8ffff' : E.cold) : (p.r > 0.6 ? '#9cc0ff' : E.water); fx.stroke();
      if (p.kind === 'cold' && p.r > 0.75 && k > 0.5) { fx.beginPath(); starPath(fx, p.x, p.y, 3, 3.6, 0.6, p.rot); fx.lineWidth = 0.8; fx.strokeStyle = '#ffffff'; fx.stroke(); }
    }
    if (S.spray.cold + S.spray.water > 0) { fx.beginPath(); fx.arc(S.spray.x, S.spray.y, 5 + Math.sin(t * 40), 0, TAU); fx.lineWidth = 1.8; fx.strokeStyle = S.spray.cold > 0 ? E.cold : E.water; fx.stroke(); }
    // ---- beam: neon tube + fire payload braid + flame licks ----
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 26, 1.2 * o, 0.8, 26), fire = hasFire(B);
      const br = fire ? braid(B, t, 56, 9 * o, 3.4, 16) : null;
      const strands = (front) => {
        if (!br) return;
        fx.globalAlpha = front ? 1 : 0.45;
        for (const [s, col] of [[0, E.fire], [1, E.fireHot]]) { fx.lineWidth = (front ? 2.4 : 1.6) * o; fx.strokeStyle = col; strokeRuns(fx, br[s], front); }
        fx.globalAlpha = 1;
      };
      strands(false);
      fx.lineWidth = 9 * o; fx.strokeStyle = hexA(E.arcane, 0.25); strokePts(fx, pts);
      fx.lineWidth = 3.6 * o; fx.strokeStyle = E.arcane; strokePts(fx, pts);
      fx.lineWidth = 1.3 * o; fx.strokeStyle = '#ffe6ff'; strokePts(fx, pts);
      // a dark gap either side of the front strands keeps them legible against the tube
      if (br) { fx.save(); fx.globalCompositeOperation = 'destination-out'; fx.lineWidth = 4.8 * o; for (const s of [0, 1]) strokeRuns(fx, br[s], true); fx.restore(); }
      strands(true);
      if (fire) for (const f of licks(B, t, S.D)) {
        fx.beginPath(); dropDir(fx, f.x, f.y, 3.2 * f.size, 12 * f.size, f.ang + Math.PI); fx.fillStyle = hexA(E.fire, 0.35); fx.fill(); fx.lineWidth = 1.4; fx.strokeStyle = E.fireHot; fx.stroke();
      }
      // impact: rings + fire petals
      for (let i = 0; i < 3; i++) { const k = AS.mod(t * 3 + i / 3, 1); fx.beginPath(); fx.arc(B.x2, B.y2, (6 + k * 26) * o, 0, TAU); fx.lineWidth = 1.6 * (1 - k); fx.strokeStyle = E.arcane; fx.stroke(); }
      if (fire) for (let i = 0; i < 5; i++) { const a = t * 4 + i / 5 * TAU; fx.beginPath(); dropDir(fx, B.x2 + Math.cos(a) * 8 * o, B.y2 + Math.sin(a) * 8 * o, 3.2 * o, 13 * o, a); fx.lineWidth = 1.5; fx.strokeStyle = i % 2 ? E.fire : E.fireHot; fx.stroke(); }
      fx.beginPath(); fx.arc(B.x2, B.y2, 5 * o, 0, TAU); fx.fillStyle = '#ffffff'; fx.fill();
      fx.beginPath(); fx.arc(B.x1, B.y1, 5.5 * o, 0, TAU); fx.fillStyle = '#ffe6ff'; fx.fill();
      for (const s of S.beamSparks) { fx.lineWidth = 1.3; fx.strokeStyle = hexA(s.r > 0.6 ? '#ffffff' : s.r > 0.3 || !fire ? E.arcane : E.fire, 1 - s.age); fx.beginPath(); fx.moveTo(s.x, s.y); fx.lineTo(s.x - Math.cos(s.a) * 7, s.y - Math.sin(s.a) * 7); fx.stroke(); }
    }
    // ward
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = hexA(E.shield, 0.05 + Wd.pulse * 0.1); ctx.fill();
    fx.beginPath(); fx.arc(Wd.x, Wd.y, wr, 0, TAU); fx.lineWidth = 1.4; fx.strokeStyle = hexA(E.shield, 0.75); fx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * 1.1 + i / 3 * TAU; fx.lineWidth = 2.6; fx.strokeStyle = E.shield; fx.beginPath(); fx.arc(Wd.x, Wd.y, wr + 3, a, a + 0.55); fx.stroke(); }
    if (Wd.pulse > 0) { fx.beginPath(); fx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 26 + 4, 0, TAU); fx.lineWidth = 2.4 * Wd.pulse; fx.strokeStyle = '#ffffff'; fx.stroke(); }
    for (const s of S.wardSparks) { fx.fillStyle = hexA(s.r > 0.4 ? E.shield : '#ffffff', 1 - s.age); fx.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4); }
    for (const s of S.shards) { fx.save(); fx.translate(s.x, s.y); fx.rotate(s.rot); fx.globalAlpha = 1 - seg(s.age, 0.6, 1); fx.beginPath(); polyPath(fx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]); fx.lineWidth = 1.3; fx.strokeStyle = s.r > 0.5 ? '#ffffff' : E.cold; fx.stroke(); fx.restore(); }
    // arrows are physical, not magic: plain light lines on the base layer
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => { c.strokeStyle = '#c8ccf4'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-14, 0); c.lineTo(12, 0); c.moveTo(-14, 0); c.lineTo(-18, -3); c.moveTo(-14, 0); c.lineTo(-18, 3); c.moveTo(14, 0); c.lineTo(9, -3); c.moveTo(14, 0); c.lineTo(9, 3); c.stroke(); });
    // ---- composite: bloom (budgeted) then the crisp emissive layer ----
    bloom(ctx, fxC, 'neon-bloom', [[2, 0.55 * bgt], [3, 0.7 * bgt], [4, 0.65 * bgt]]);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fxC, 0, 0); ctx.restore();
    // burn status chip
    if (S.brute.burning > 0.05) {
      const [bx, by] = burnChipPos(S), r = 8.5 * ease.back(clamp(S.brute.burning * 1.6));
      ctx.save(); ctx.shadowColor = E.fire; ctx.shadowBlur = 8 * scale;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fillStyle = NP.sil; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = E.fire; ctx.stroke();
      AS.glyph(ctx, 'fire', bx, by + 0.5, r * 0.62); ctx.fillStyle = E.fireHot; ctx.fill(); ctx.restore();
    }
    // numbers
    const NC = { arcane: E.arcane, crit: '#fff27a', fire: E.fire, cold: E.cold, water: '#6aa0ff', shield: E.shield };
    for (const n of S.numbers) {
      const size = (n.big ? 22 : 16) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.font = `700 ${size}px "Space Grotesk", "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = NP.sil; ctx.strokeText(n.text, n.x, n.y);
      ctx.shadowColor = NC[n.kind]; ctx.shadowBlur = 8 * scale; ctx.fillStyle = mix(NC[n.kind], '#ffffff', 0.35); ctx.fillText(n.text, n.x, n.y); ctx.restore();
    }
    // HUD: thin neon frames
    for (const h of S.hud) {
      const tc = NP[h.team];
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 4); ctx.fillStyle = 'rgba(7,10,30,0.85)'; ctx.fill();
      ctx.save(); ctx.shadowColor = tc; ctx.shadowBlur = 6 * scale; ctx.lineWidth = 1.2; ctx.strokeStyle = tc; ctx.stroke(); ctx.restore();
      ctx.font = '700 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = tc; ctx.fillText(h.name, h.x + 17, h.y + 18);
      ctx.fillStyle = '#1a2050'; ctx.fillRect(h.x + 38, h.y + 27, 140, 2.5); ctx.fillStyle = tc; ctx.fillRect(h.x + 38, h.y + 27, 140 * h.hp, 2.5);
      const chips = payloadChips(h, S);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 13, q = h.queue[i], pc = !q && chips[i - h.queue.length];
        if (pc) {
          ctx.fillStyle = E.fireHot; ctx.font = '700 12px "Space Grotesk", sans-serif'; ctx.fillText('+', cx - 10, cy + 0.5);
          ctx.save(); ctx.shadowColor = E[pc]; ctx.shadowBlur = 6 * scale; AS.glyph(ctx, pc, cx + 1, cy, 6.5); ctx.lineWidth = 1.4; ctx.strokeStyle = E[pc]; ctx.stroke(); ctx.restore(); continue;
        }
        if (!q) { ctx.fillStyle = '#2a3266'; ctx.fillRect(cx - 1, cy - 1, 2, 2); continue; }
        const r = 8 * ease.back(q.pop);
        ctx.save(); ctx.shadowColor = E[q.el]; ctx.shadowBlur = 7 * scale; AS.glyph(ctx, q.el, cx, cy, r * 0.85); ctx.lineWidth = 1.5; ctx.strokeStyle = E[q.el]; ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }
  AS.register({
    id: 'glow-neon', name: 'Neon Dusk', family: 'glow', round: 2,
    refs: ['Hyper Light Drifter', 'Geometry Wars', 'Tron Legacy'],
    feel: 'The world is a deep dusk blue in three values and characters are dark silhouettes outlined in their team colour, so the only bright things on screen are spells and who owns them. Every spell is a crisp neon line with real bloom. Elements are told apart by colour and by line shape: streaks for water, asterisks for frost, teardrop outlines for fire.',
    notes: {
      read: ['Maximum spell pop, payload very clear', 'The fire payload is two orange strands twisting round a violet tube, with flame outlines riding it, and the brute\'s outline turns from lavender to orange as it burns. Nothing in the world competes, so even at full chaos the bloom is capped and doesn\'t white out. The cost is bodies: goblins, archer and brute are told apart only by outline shape.'],
      tone: ['Arcadey but cool', 'Reads like an arcade cabinet more than a cartoon. The comedy and character of Magicka mostly go, and it may feel too abstract for a co-op romp.'],
      cost: ['Low', 'The world is near-empty and characters are silhouettes; nearly all the effort goes into VFX lines and one bloom pass. Cheapest to make look finished.'],
    },
    render: neonRender,
  });

  // =====================================================================
  // R2-C. GLOW WARM: firelit tavern-dungeon, rich painterly detail, light pools
  // =====================================================================
  const WOUT = '#24120a';
  const WP = {
    el: { fire: '#ffb02e', fireHot: '#fff2a8', fireLight: '#e07a2a', water: '#4a9cff', cold: '#8af0ff', arcane: '#ff4fb4', shield: '#ffe070' },
    p1: { robe: '#d0342c', trim: '#f0c050', sleeve: '#a82822', hat: '#d0342c', band: '#f0c050' },
    p2: { robe: '#2f62c8', trim: '#b0d0f8', sleeve: '#244c9c', hat: '#2f62c8', band: '#b0d0f8' },
    wizard: { skin: '#eab48a', beard: '#f2ece0', staff: '#7a5034', hand: '#eab48a' },
    goblin: { body: '#76a83c', belly: '#b8cc78', dark: '#3e5a22', club: '#6e4a2c' },
    archer: { body: '#76a83c', cloth: '#7a3e66', dark: '#3e5a22', bow: '#8a5a30', string: '#d8ccb0', arrow: '#c8b088', hand: '#76a83c' },
    brute: { body: '#a8603e', belly: '#d89a70', dark: '#4a2414', horn: '#e8dcc0', brow: WOUT },
    imp: { body: '#8a44b0', wing: '#5a2a78', horn: '#e8cc90', tail: '#5a2a78' },
    common: { eye: '#140a08', eyeWhite: '#f2e8d0', tooth: '#f2e8d0' },
  };
  const TORCHES = [[176, 16], [470, 16]], CANDLES = [[418, 376], [430, 370], [424, 381]];
  function warmGround(scale) {
    return AS.cached('glow-warm-ground', W, H, scale, (x) => {
      x.fillStyle = '#5e4330'; x.fillRect(0, 0, W, H);
      x.lineJoin = 'round'; x.lineCap = 'round';
      // warm flagstones in courses, mortar between
      const cols = ['#7a5a40', '#6e4f3a', '#80603f', '#694a36', '#75583e', '#7e6248'];
      for (let gy = 0; gy < 11; gy++) for (let gx = -1; gx < 12; gx++) {
        const i = gy * 17 + gx + 300, w0 = 50 + rand(i, 1) * 16, cx = gx * 58 + (gy % 2) * 29, cy = 44 + gy * 34;
        x.beginPath(); x.roundRect(cx - w0 / 2 + 2, cy - 15, w0 - 4, 30, 6); x.fillStyle = cols[i % cols.length]; x.fill();
        x.globalAlpha = 0.35; x.lineWidth = 2; x.strokeStyle = '#3a2618'; x.stroke(); x.globalAlpha = 1;
      }
      // brush texture
      const bc = ['#8a6a4a', '#5a3e2a', '#9a7450', '#4e3424', '#7a5232', '#a07a52'];
      for (let i = 0; i < 2400; i++) {
        const px = rand(i, 11) * W, py = rand(i, 12) * H, a = -0.4 + (rand(i, 13) - 0.5) * 0.8, Ln = 5 + rand(i, 14) * 14;
        x.globalAlpha = 0.07 + rand(i, 15) * 0.13; x.strokeStyle = bc[i % bc.length]; x.lineWidth = 2 + rand(i, 16) * 4;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * Ln * 0.5 + 2, py + Math.sin(a) * Ln * 0.5 - 2, px + Math.cos(a) * Ln, py + Math.sin(a) * Ln); x.stroke();
      }
      x.globalAlpha = 1;
      // a worn red rug under the casters
      x.save(); x.translate(122, 268); x.rotate(-0.06);
      x.beginPath(); x.roundRect(-92, -64, 184, 128, 6); x.fillStyle = '#7a2a26'; x.fill();
      x.beginPath(); x.roundRect(-84, -56, 168, 112, 4); x.lineWidth = 4; x.strokeStyle = '#c0903c'; x.stroke();
      x.beginPath(); x.roundRect(-74, -46, 148, 92, 3); x.lineWidth = 1.5; x.strokeStyle = '#d8a850'; x.stroke();
      for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(-50 + i * 25, 0); x.lineTo(-38 + i * 25, -10); x.lineTo(-26 + i * 25, 0); x.lineTo(-38 + i * 25, 10); x.closePath(); x.fillStyle = i % 2 ? '#a8443a' : '#5a1e1c'; x.fill(); }
      for (let i = 0; i < 18; i++) { x.beginPath(); x.moveTo(-92 + i * 10.8, 64); x.lineTo(-92 + i * 10.8, 70); x.moveTo(-92 + i * 10.8, -64); x.lineTo(-92 + i * 10.8, -70); x.lineWidth = 1.5; x.strokeStyle = '#c0903c'; x.stroke(); }
      for (let i = 0; i < 300; i++) { x.globalAlpha = 0.12; x.strokeStyle = i % 2 ? '#a8443a' : '#4a1a16'; x.lineWidth = 2; const px = (rand(i, 31) - 0.5) * 180, py = (rand(i, 32) - 0.5) * 124; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py + 1); x.stroke(); }
      x.restore(); x.globalAlpha = 1;
      // back wall with sconces
      const wg = x.createLinearGradient(0, 0, 0, 34); wg.addColorStop(0, '#2a1a12'); wg.addColorStop(1, '#4a3022'); x.fillStyle = wg; x.fillRect(0, 0, W, 32);
      for (let r = 0; r < 3; r++) for (let c = -1; c < 24; c++) { x.beginPath(); x.roundRect(c * 30 + (r % 2) * 15 + 1, r * 10 + 1, 28, 8, 2); x.fillStyle = ['#5a3a28', '#4e3222', '#64422c'][(r + c + 9) % 3]; x.fill(); }
      x.fillStyle = 'rgba(20,10,6,0.55)'; x.fillRect(0, 30, W, 5);
      for (const [tx, ty] of TORCHES) { x.fillStyle = '#2a1a10'; x.fillRect(tx - 3, ty, 6, 12); x.beginPath(); x.moveTo(tx - 7, ty); x.lineTo(tx + 7, ty); x.lineTo(tx + 4, ty + 5); x.lineTo(tx - 4, ty + 5); x.closePath(); x.fillStyle = '#6a4a2a'; x.fill(); }
      // banner
      x.beginPath(); x.moveTo(316, 2); x.lineTo(344, 2); x.lineTo(344, 40); x.lineTo(330, 33); x.lineTo(316, 40); x.closePath(); x.fillStyle = '#6a2a4a'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#c0903c'; x.stroke();
      x.beginPath(); starPath(x, 330, 17, 4, 7, 2.5, -Math.PI / 2); x.fillStyle = '#d8a850'; x.fill();
      // props
      const barrel = (bx, by, r) => {
        x.beginPath(); x.ellipse(bx + 3, by + 4, r + 2, r * 0.8, 0, 0, TAU); x.fillStyle = 'rgba(20,10,6,0.45)'; x.fill();
        x.beginPath(); x.arc(bx, by, r, 0, TAU); const g = x.createRadialGradient(bx - r * 0.3, by - r * 0.3, 1, bx, by, r); g.addColorStop(0, '#a8784a'); g.addColorStop(1, '#5a3a22'); x.fillStyle = g; x.fill();
        x.lineWidth = 2.2; x.strokeStyle = '#3a2a20'; x.stroke(); x.beginPath(); x.arc(bx, by, r * 0.66, 0, TAU); x.lineWidth = 1.6; x.strokeStyle = '#4a4040'; x.stroke();
        for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(bx - r * 0.6, by - r * 0.45 + i * r * 0.3); x.lineTo(bx + r * 0.6, by - r * 0.45 + i * r * 0.3); x.lineWidth = 0.8; x.strokeStyle = 'rgba(60,36,20,0.6)'; x.stroke(); }
      };
      const crate = (cx, cy, s, rot) => {
        x.save(); x.translate(cx, cy); x.rotate(rot);
        x.fillStyle = 'rgba(20,10,6,0.45)'; x.fillRect(-s / 2 + 3, -s / 2 + 4, s, s);
        x.fillStyle = '#8a6038'; x.fillRect(-s / 2, -s / 2, s, s); x.lineWidth = 2; x.strokeStyle = '#3a2416'; x.strokeRect(-s / 2, -s / 2, s, s);
        x.beginPath(); x.moveTo(-s / 2, -s / 2); x.lineTo(s / 2, s / 2); x.moveTo(s / 2, -s / 2); x.lineTo(-s / 2, s / 2); x.lineWidth = 2.5; x.strokeStyle = '#5a3a20'; x.stroke();
        x.restore();
      };
      barrel(30, 56, 16); barrel(58, 46, 12); crate(612, 58, 26, 0.12); barrel(588, 48, 11); crate(620, 372, 24, -0.2); barrel(596, 388, 12);
      // little table with candles (lights added at runtime)
      x.beginPath(); x.ellipse(424, 377, 20, 12, 0, 0, TAU); x.fillStyle = '#6a4428'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#2e1a0e'; x.stroke();
      for (const [cx, cy] of CANDLES) { x.fillStyle = '#efe0c0'; x.fillRect(cx - 2, cy - 7, 4, 7); }
      // scattered straw, bones and coins at the edges
      for (let i = 0; i < 80; i++) {
        const px = rand(i, 51) * W, py = 36 + rand(i, 52) * (H - 36), dc = Math.hypot((px - 330) / 1.5, py - 220);
        if (dc < 170) continue;
        x.globalAlpha = 0.7; x.strokeStyle = '#c8a058'; x.lineWidth = 1.2; const a = rand(i, 53) * TAU;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8); x.stroke();
      }
      x.globalAlpha = 1;
      for (const [bx, by, a] of [[36, 322, 0.4], [372, 30 + 30, -0.3], [640 - 30, 250, 1.2]]) {
        x.save(); x.translate(bx, by); x.rotate(a); x.fillStyle = '#e0d4b8'; x.fillRect(-8, -1.5, 16, 3);
        for (const s of [-1, 1]) { x.beginPath(); x.arc(s * 8, -1.5, 2.4, 0, TAU); x.arc(s * 8, 1.5, 2.4, 0, TAU); x.fill(); }
        x.restore();
      }
      for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(40 + rand(i, 61) * 30, 350 + rand(i, 62) * 20, 2.6, 1.8, 0, 0, TAU); x.fillStyle = '#e8b840'; x.fill(); }
      // cobwebs in the top corners
      x.strokeStyle = 'rgba(220,210,190,0.25)'; x.lineWidth = 0.8;
      for (const [cx, sx] of [[0, 1], [W, -1]]) { for (let i = 0; i < 5; i++) { const a = i / 4 * Math.PI / 2; x.beginPath(); x.moveTo(cx, 32); x.lineTo(cx + sx * Math.cos(a) * 40, 32 + Math.sin(a) * 40); x.stroke(); } for (let r = 10; r <= 40; r += 10) { x.beginPath(); x.arc(cx, 32, r, sx > 0 ? 0 : Math.PI / 2, sx > 0 ? Math.PI / 2 : Math.PI); x.stroke(); } }
      // calm the play area: detail and contrast fall off toward the middle of the fight
      const cg = x.createRadialGradient(340, 215, 40, 340, 215, 250); cg.addColorStop(0, 'rgba(108,80,58,0.5)'); cg.addColorStop(0.6, 'rgba(108,80,58,0.28)'); cg.addColorStop(1, 'rgba(108,80,58,0)');
      x.fillStyle = cg; x.fillRect(0, 0, W, H);
    });
  }
  function warmActor(ctx, a, S, L) {
    const parts = world(a), [rad, hgt] = AS.SIZE[a.kind], R = rimFrom(a, L);
    const cx = a.x, cy = a.y - hgt * 0.45;
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sh = ctx.createRadialGradient(a.x - R.dx * 8, a.y + 1, 0, a.x - R.dx * 8, a.y + 1, rad * 1.5);
    sh.addColorStop(0, 'rgba(24,10,4,0.6)'); sh.addColorStop(1, 'rgba(24,10,4,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(a.x - R.dx * 8, a.y + 1, rad * 1.5, rad * 0.5, 0, 0, TAU); ctx.fill();
    // thin warm-dark outline keeps bodies off the busy floor
    ctx.strokeStyle = WOUT;
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.line ? p.w + 3 : 3.4; ctx.stroke(); }
    ctx.save(); ctx.translate(R.dx * 2, R.dy * 2);
    ctx.beginPath(); for (const { p, w } of parts) if (!p.line) AS.partPath(ctx, p, w);
    ctx.fillStyle = mix(R.c, '#fff4e0', 0.45); ctx.globalAlpha = a.alpha * clamp(0.55 + R.s * 2.5); ctx.fill();
    ctx.restore(); ctx.globalAlpha = a.alpha;
    for (const { p, w } of parts) {
      const col = colorOf(WP, a, p.role);
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      let mx = 0, my = 0, rr = 0;
      if (p.big) {
        const xs = w.map((q) => q[0]), ys = w.map((q) => q[1]);
        mx = (Math.min(...xs) + Math.max(...xs)) / 2; my = (Math.min(...ys) + Math.max(...ys)) / 2; rr = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        const gr = ctx.createLinearGradient(mx + R.dx * rr, my + R.dy * rr, mx - R.dx * rr, my - R.dy * rr);
        gr.addColorStop(0, mix(col, mix(R.c, '#ffffff', 0.3), 0.35)); gr.addColorStop(0.45, col); gr.addColorStop(1, mix(col, '#1a0c08', 0.5));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = col;
      ctx.fill();
      if (p.big) {
        // painterly dabs inside the big shapes
        ctx.save(); ctx.clip(); ctx.globalAlpha = a.alpha * 0.18; ctx.strokeStyle = mix(col, '#fff0d8', 0.35); ctx.lineWidth = 2.2;
        const hs = hash(a.id + p.role);
        ctx.beginPath(); for (let i = 0; i < 4; i++) { const qx = mx + (rand(hs, i, 1) - 0.5) * rr * 1.4, qy = my + (rand(hs, i, 2) - 0.5) * rr * 1.4; ctx.moveTo(qx, qy); ctx.lineTo(qx + 5, qy - 2); } ctx.stroke();
        ctx.restore(); ctx.globalAlpha = a.alpha;
        ctx.beginPath(); AS.partPath(ctx, p, w);
        if (a.wet) { ctx.fillStyle = hexA('#3a6ab8', 0.35 * a.wet); ctx.fill(); }
        if (a.burning > 0 && a.kind === 'brute') { ctx.fillStyle = hexA('#ff7a20', 0.28 * a.burning * (0.8 + 0.2 * Math.sin(S.t * 37))); ctx.fill(); }
      }
    }
    if (a.hit > 0) { ctx.globalAlpha = a.alpha * a.hit * 0.4; ctx.fillStyle = mix(R.c, '#ffffff', 0.55); for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); } ctx.globalAlpha = a.alpha; }
    if (a.frozen > 0) {
      const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * a.frozen, x0 = a.x - r - 5, y0 = a.y + 5 - hh, w0 = 2 * r + 10;
      const ice = jit([[x0 + 2, y0 + 3], [x0 + w0 * 0.45, y0], [x0 + w0, y0 + 5], [x0 + w0 + 1, y0 + hh * 0.6], [x0 + w0 - 2, y0 + hh], [x0 + 2, y0 + hh], [x0 - 1, y0 + hh * 0.4]], hash(a.id), 3);
      const ig = ctx.createLinearGradient(x0, y0, x0 + w0, y0 + hh); ig.addColorStop(0, 'rgba(190,240,255,0.8)'); ig.addColorStop(1, 'rgba(60,120,170,0.6)');
      ctx.beginPath(); polyPath(ctx, ice); ctx.fillStyle = ig; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#1a3a50'; ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(235,252,255,0.9)'; ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + 14); ctx.lineTo(x0 + 14, y0 + 6); ctx.stroke();
      if (a.crack > 0) { ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5 * a.crack; i++) { const qx = x0 + w0 * rand(i, 61), qy = y0 + hh * rand(i, 62); ctx.moveTo(qx, qy); ctx.lineTo(qx + (rand(i, 63) - 0.5) * 20, qy + (rand(i, 64) - 0.5) * 20); } ctx.stroke(); }
    }
    ctx.restore();
  }
  function warmRender(ctx, S, scale) {
    const t = S.t, E = WP.el, bgt = budget(S), F = S.fire, flick = flicker(t);
    ctx.save();
    ctx.drawImage(warmGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); AS.path(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 26, 0.18)); ctx.fillStyle = 'rgba(30,14,6,0.7)'; ctx.fill();
    // puddle
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 30, 0.1);
    ctx.beginPath(); AS.path(ctx, pud);
    const pg = ctx.createLinearGradient(0, P.y - P.ry, 0, P.y + P.ry); pg.addColorStop(0, '#1a2a3a'); pg.addColorStop(1, '#2e4a60'); ctx.fillStyle = pg; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,16,8,0.6)'; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(170,210,240,0.4)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    soft(ctx, P.x + 20, P.y - 6, 30, '#ffb060', 0.15); // torch reflection
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); iceFrontPath(ctx, P, 6);
      const ig = ctx.createLinearGradient(P.x - P.rx, P.y - P.ry, P.x + P.rx, P.y + P.ry); ig.addColorStop(0, '#b0e4f4'); ig.addColorStop(1, '#4a7a98');
      ctx.fillStyle = ig; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(240,252,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; ctx.moveTo(cx, cy); ctx.lineTo(cx + 16, cy - 7); ctx.lineTo(cx + 26, cy + 2); } ctx.stroke();
      if (P.crack > 0) { ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    for (const tg of S.tongues) { ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.9, tg.h * 0.6, tg.sway * 0.5); ctx.fillStyle = '#5a2a14'; ctx.fill(); }
    // lights: environment lights are dull amber, spell fire is hotter and yellower so it stays distinct
    const L = lightsFor(S, E, { fireA: 0.8, fireR: 170, impactA: 0.4, burnA: 0.4 });
    for (const [tx, ty] of TORCHES) L.push({ x: tx, y: ty + 4, r: 170, c: E.fireLight, a: 0.75 });
    L.push({ x: 424, y: 368, r: 80, c: '#e8a050', a: 0.7 });
    for (const pl of S.players) L.push({ x: pl.x, y: pl.y - 26, r: 72, c: '#ffe0b0', a: 0.4 });
    // characters are drawn before lighting but keep a floor of brightness (see the lift pass below)
    for (const a of S.actors) warmActor(ctx, a, S, L);
    for (const s of S.smoke) { if (s.age < 0.1) continue; soft(ctx, s.x, s.y, s.size * 1.1, '#1a0c06', 0.35 * (1 - s.age)); }
    for (const s of burnSmoke(S)) soft(ctx, s.x, s.y, s.size, '#1a0c06', 0.45 * Math.sin(s.age * Math.PI));
    lightMap(ctx, 'warm-light', scale, '#74594c', L.map((l) => ({ ...l, a: l.c === E.fireLight || l.c === E.fire ? l.a * flick : l.a })), (lx) => {
      // candle-flicker breathing in the corners
      const vg = lx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 420); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); lx.fillStyle = vg; lx.fillRect(0, 0, W, H);
    });
    // lift: characters get some of their own colour back so they never sink into shadow
    ctx.globalCompositeOperation = 'screen';
    for (const a of S.actors) {
      const [rad, hgt] = AS.SIZE[a.kind];
      ctx.globalAlpha = (a.team === 'enemy' ? 0.3 : 0.22) * a.alpha;
      soft(ctx, a.x, a.y - hgt * 0.5, hgt * 0.7, a.team === 'p1' ? '#ff8a70' : a.team === 'p2' ? '#80a8ff' : '#c8a880', 0.8);
    }
    ctx.globalAlpha = 1;
    // ---- additive magic ----
    ctx.globalCompositeOperation = 'lighter';
    for (const l of L) soft(ctx, l.x, l.y, l.r * 0.8, l.c, l.a * 0.16 * bgt);
    for (const [tx, ty] of TORCHES) { soft(ctx, tx, ty - 2, 16, '#ffb050', 0.9 * flick); soft(ctx, tx, ty - 4, 5, '#fff0c0', 1); }
    for (const [cx, cy] of CANDLES) { soft(ctx, cx, cy - 9, 7, '#ffc060', 0.9 * flick); ctx.fillStyle = '#fff0c0'; ctx.fillRect(cx - 0.8, cy - 11, 1.6, 3); }
    soft(ctx, F.x, F.y - 6, 140, '#ff6a20', 0.28 * flick * bgt); soft(ctx, F.x, F.y - 10, 60, '#ffb050', 0.28 * flick);
    for (const a of [...S.goblins, S.brute, S.archer, S.imp]) {
      if (a.alpha < 0.3 || a.frozen > 0.5) continue;
      const f = AS.xf(a), eyes = { goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[-0.8, -22], [4.2, -22]] }[a.kind];
      for (const e of eyes) { const [ex, ey] = f(e); soft(ctx, ex, ey, 3.5, '#ffd84a', 0.7); }
    }
    for (const tg of S.tongues) {
      const g = ctx.createLinearGradient(tg.x, tg.y, tg.x, tg.y - tg.h * 1.2);
      g.addColorStop(0, 'rgba(255,220,150,0.9)'); g.addColorStop(0.3, 'rgba(255,130,40,0.7)'); g.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); teardrop(ctx, tg.x, tg.y, tg.w * 0.75, tg.h * 1.45, tg.sway * 1.4); ctx.fill();
    }
    const fk = Math.min(1, 1.3 * bgt);
    for (const fl of [...S.flames, ...S.impFlames]) soft(ctx, fl.x, fl.y - fl.size, fl.size * 2.6, fl.age < 0.4 ? '#ffa040' : '#ff5a20', 0.5 * fk);
    for (const e of S.embers) { soft(ctx, e.x, e.y, 5, '#ff9a3a', 0.8 * (1 - e.age) * fk); ctx.fillStyle = '#ffe0a0'; ctx.fillRect(e.x - 0.8, e.y - 0.8, 1.6, 1.6); }
    for (const m of S.mist) soft(ctx, m.x, m.y, m.size, '#6ac8e8', 0.16 * Math.sin(m.age * Math.PI) * fk);
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.75, 1);
      if (p.kind === 'water') { soft(ctx, p.x, p.y, (3 + p.size) * k, '#3a8cff', 0.5 * fk); continue; }
      soft(ctx, p.x, p.y, (5 + p.size * 1.6) * k, '#4ad0ff', 0.32 * fk);
      if (p.r > 0.55) { ctx.fillStyle = hexA('#ffffff', 0.9 * k); ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
    }
    if (S.spray.cold + S.spray.water > 0) soft(ctx, S.spray.x, S.spray.y, 22, S.spray.cold > 0 ? E.cold : E.water, 0.9);
    // payload burn on the brute: glow under painted flames
    const bf = burnFlames(S);
    if (S.brute.burning > 0) soft(ctx, S.brute.x, S.brute.y - 44, 58, '#ff8a20', 0.22 * S.brute.burning * flick);
    for (const f of bf) soft(ctx, f.x, f.y - f.size, f.size * 2.4, '#ff8a2a', 0.25 * fk);
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 22, 1.8 * o, 0.8, 26);
      for (const [lw2, col, al] of [[32 * o, E.arcane, 0.12], [16 * o, E.arcane, 0.3], [8 * o, '#ff7ab8', 0.7], [3.5 * o, '#ffe0ee', 0.95]]) { ctx.lineWidth = lw2; ctx.strokeStyle = hexA(col, al * (lw2 > 20 ? bgt : 1)); strokePts(ctx, pts); }
      soft(ctx, B.x2, B.y2, 40 * o, E.arcane, 0.6); soft(ctx, B.x2, B.y2, 12 * o, '#ffffff', 0.65);
      if (hasFire(B)) soft(ctx, B.x2, B.y2, 24 * o, E.fire, 0.4);
      soft(ctx, B.x1, B.y1, 22 * o, E.arcane, 0.9);
    } else soft(ctx, AS.staffTip(S.players[0])[0], AS.staffTip(S.players[0])[1], 10, E.arcane, 0.6);
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    const rg = ctx.createRadialGradient(Wd.x, Wd.y, wr * 0.6, Wd.x, Wd.y, wr + 4);
    rg.addColorStop(0, hexA(E.shield, 0)); rg.addColorStop(0.88, hexA(E.shield, 0.26 + Wd.pulse * 0.35)); rg.addColorStop(1, hexA(E.shield, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr + 4, 0, TAU); ctx.fill();
    if (Wd.pulse > 0) soft(ctx, Wd.hitX, Wd.hitY, 30, E.shield, Wd.pulse);
    for (const s of S.wardSparks) soft(ctx, s.x, s.y, 4, '#ffe8a0', 1 - s.age);
    for (const s of S.shards) { if (s.age > 0.9) continue; soft(ctx, s.x, s.y, s.size * 1.6, '#7fe8ff', 0.6 * (1 - s.age)); }
    for (const dr of S.drips) soft(ctx, dr.x, dr.y, 2.5, '#6ab0ff', 0.6 * (1 - dr.age));
    ctx.globalCompositeOperation = 'source-over';
    // painted payload: flames on the brute and the fire braid on the beam are drawn solid, not additive,
    // so they stay orange against a world that is already orange-lit
    for (const f of bf) {
      if (f.size < 0.7) continue;
      const g = ctx.createLinearGradient(f.x, f.y, f.x, f.y - f.size * 2.8);
      g.addColorStop(0, hexA(E.fireHot, 0.95)); g.addColorStop(0.45, hexA('#ff8a20', 0.9)); g.addColorStop(1, hexA('#c02a10', 0.2));
      ctx.beginPath(); teardrop(ctx, f.x, f.y, f.size * 0.85, f.size * 2.8, 0); ctx.fillStyle = g; ctx.fill();
    }
    if (S.beam && hasFire(S.beam)) {
      const B = S.beam, o = B.on, br = braid(B, t, 48, 9 * o, 3.4, 16);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 9 * o;
      for (const s of [0, 1]) { ctx.strokeStyle = hexA('#ff7a10', 0.22 * bgt); strokeRuns(ctx, br[s], true); strokeRuns(ctx, br[s], false); }
      ctx.globalCompositeOperation = 'source-over';
      for (const [s, col] of [[0, '#ff9a20'], [1, E.fireHot]]) {
        ctx.lineWidth = 2.6 * o; ctx.strokeStyle = hexA(col, 0.55); strokeRuns(ctx, br[s], false);
        ctx.lineWidth = 5 * o; ctx.strokeStyle = 'rgba(60,16,4,0.55)'; strokeRuns(ctx, br[s], true);
        ctx.lineWidth = 3.4 * o; ctx.strokeStyle = col; strokeRuns(ctx, br[s], true);
      }
      for (const f of licks(B, t, S.D)) {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14 * f.size);
        g.addColorStop(0, E.fireHot); g.addColorStop(0.5, '#ff9a20'); g.addColorStop(1, 'rgba(200,50,10,0.3)');
        ctx.beginPath(); dropDir(ctx, f.x, f.y, 4 * f.size, 15 * f.size, f.ang + Math.PI); ctx.fillStyle = g; ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const a = t * 4 + i / 6 * TAU;
        ctx.beginPath(); dropDir(ctx, B.x2 + Math.cos(a) * 9 * o, B.y2 + Math.sin(a) * 9 * o, 3.6 * o, 15 * o, a);
        ctx.fillStyle = i % 2 ? '#ff9a20' : E.fireHot; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    if (S.beam) for (const s of S.beamSparks) { ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(s.r > 0.66 ? '#ffe0ee' : s.r > 0.33 || !hasFire(S.beam) ? E.arcane : '#ffb030', 1 - s.age); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 8, s.y - Math.sin(s.a) * 8); ctx.stroke(); }
    ctx.lineWidth = 1.2; ctx.strokeStyle = hexA('#fff0c0', 0.6); ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * 1.1 + i / 3 * TAU; ctx.lineWidth = 2.2; ctx.strokeStyle = hexA('#ffe8a0', 0.85); ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, a, a + 0.5); ctx.stroke(); }
    for (const s of S.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]); ctx.fillStyle = s.r > 0.5 ? '#d8f6ff' : '#7ab8d8'; ctx.fill(); ctx.restore(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => { c.strokeStyle = '#c8a878'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-14, 0); c.lineTo(11, 0); c.stroke(); c.beginPath(); polyPath(c, [[15, 0], [9, -3], [9, 3]]); c.fillStyle = '#e0d8c8'; c.fill(); c.strokeStyle = '#8a5a48'; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -3); c.moveTo(-14, 0); c.lineTo(-18, 3); c.stroke(); });
    // soft vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2 - 20, 170, W / 2, H / 2, 430);
    vg.addColorStop(0, 'rgba(20,8,2,0)'); vg.addColorStop(1, 'rgba(20,8,2,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // burn status chip
    if (S.brute.burning > 0.05) {
      const [bx, by] = burnChipPos(S), r = 9 * ease.back(clamp(S.brute.burning * 1.6));
      ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fillStyle = 'rgba(30,14,8,0.9)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#d8a850'; ctx.stroke();
      AS.glyph(ctx, 'fire', bx, by + 0.5, r * 0.66); const gg = ctx.createLinearGradient(0, by + r, 0, by - r); gg.addColorStop(0, '#ff8a20'); gg.addColorStop(1, E.fireHot); ctx.fillStyle = gg; ctx.fill();
    }
    // numbers
    const NC = { arcane: ['#ffd0e6', E.arcane], crit: ['#fff2c0', '#ffb030'], fire: ['#ffe0b0', '#ff7a2a'], cold: ['#e0faff', '#4ad0ff'], water: ['#d0e6ff', '#3a8cff'], shield: ['#fff2c0', '#ffc040'] };
    for (const n of S.numbers) {
      const size = (n.big ? 22 : 17) * n.pop, [fg, gl] = NC[n.kind];
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.font = `700 ${size}px Cinzel, "Trajan Pro", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = gl; ctx.shadowBlur = 8 * scale; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(24,10,4,0.9)'; ctx.strokeText(n.text, n.x, n.y);
      ctx.shadowBlur = 0; ctx.fillStyle = fg; ctx.fillText(n.text, n.x, n.y); ctx.restore();
    }
    // HUD: dark leather plates with brass
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 5); ctx.fillStyle = 'rgba(34,18,10,0.9)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#b08840'; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 12, 0, TAU); ctx.fillStyle = WP[h.team].robe; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '700 12px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff0d8'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.fillStyle = '#3a1a10'; ctx.fillRect(h.x + 40, h.y + 27, 138, 3.5); ctx.fillStyle = '#d04030'; ctx.fillRect(h.x + 40, h.y + 27, 138 * h.hp, 3.5);
      const chips = payloadChips(h, S);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 50 + i * 26, cy = h.y + 13, q = h.queue[i], pc = !q && chips[i - h.queue.length];
        if (pc) {
          ctx.font = '700 12px Cinzel, Georgia, serif'; ctx.fillStyle = '#f0c070'; ctx.fillText('+', cx - 10, cy + 1);
          ctx.globalCompositeOperation = 'lighter'; soft(ctx, cx + 1, cy, 13, E[pc], 0.55); ctx.globalCompositeOperation = 'source-over';
          AS.glyph(ctx, pc, cx + 1, cy, 6); ctx.fillStyle = mix(E[pc], '#ffffff', 0.4); ctx.fill(); continue;
        }
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = '#6a4a28'; ctx.stroke();
        if (!q) continue;
        const r = 7.5 * ease.back(q.pop);
        ctx.globalCompositeOperation = 'lighter'; soft(ctx, cx, cy, r * 2.2, E[q.el], 0.7); ctx.globalCompositeOperation = 'source-over';
        AS.glyph(ctx, q.el, cx, cy, r * 0.75); ctx.fillStyle = mix(E[q.el], '#ffffff', 0.55); ctx.fill();
      }
    }
    ctx.restore();
  }
  AS.register({
    id: 'glow-warm', name: 'Firelit Tavern', family: 'glow', round: 2,
    refs: ['Darkest Dungeon', 'Hades (House of Hades)', 'Rembrandt chiaroscuro'],
    feel: 'A warm, rich, painted dungeon-tavern: worn rug, barrels, crates, candles, wall torches and brushy flagstones, all lit in soft pools of light. Detail is kept to the edges and calmed toward the middle of the fight, and characters get a thin outline and a lift so the warm murk never swallows them.',
    notes: {
      read: ['Works, with a fight', 'Pink arcane still pops against the warm world, but fire is the hardest element to read when the whole room is firelit. The payload only reads because it is painted solid and hotter (yellow-white cores) than the amber torches; the brute\'s burn is clear up close but less so at a glance.'],
      tone: ['Cosy, not grim', 'Feels like a tavern brawl rather than a crypt, which suits co-op comedy better than the cold dark original. Still heavier than "arcadey".'],
      cost: ['High', 'Painted props, lighting per location and a calm zone around fights all need art direction, and every level needs its own palette check against the element colours.'],
    },
    render: warmRender,
  });
})();
