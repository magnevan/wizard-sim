/* Styles 1-3: Bold Toon, Paper Diorama, Storybook Ink.
 * Each style is { id, name, refs, feel, notes, fps?, render(ctx, S, scale) }.
 * render() draws AS.scene() data into a 640x400 logical canvas. */
(function () {
  const { W, H, TAU, lerp, clamp, seg, rand, hexA, mix, ease } = AS;

  // ---------- shared helpers ----------
  const world = (a) => { const f = AS.xf(a); return AS.parts(a).map((p) => ({ p, w: p.pts.map(f) })); };
  const colorOf = (pal, a, role) => role === 'orb' ? (pal.el[a.element] || '#fff') : (pal[a.team]?.[role] ?? pal[a.kind]?.[role] ?? pal.common[role] ?? '#f0f');
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };
  function teardrop(ctx, x, y, w, h, sway = 0) {
    const cy = y - w * 0.9;
    ctx.moveTo(x + sway, y - h);
    ctx.quadraticCurveTo(x + w * 1.15 + sway * 0.3, y - h * 0.45, x + w, cy);
    ctx.arc(x, cy, w, 0, Math.PI);
    ctx.quadraticCurveTo(x - w * 1.15 + sway * 0.3, y - h * 0.45, x + sway, y - h);
    ctx.closePath();
  }
  function blobPts(cx, cy, rx, ry, seed, n = 30, amt = 0.12) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = 1 + amt * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2.3) * 0.3 + (rand(seed, i) - 0.5) * 0.5);
      pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
    return pts;
  }
  const jit = (pts, seed, amt) => pts.map((p, i) => [p[0] + (rand(seed, i, 1) - 0.5) * amt, p[1] + (rand(seed, i, 2) - 0.5) * amt]);
  // Ice covers the puddle from the left up to the freeze front (zigzag edge).
  function iceFrontPath(ctx, P, jag) {
    const fx = P.x - P.rx - 6 + (2 * P.rx + 12) * P.front;
    ctx.moveTo(P.x - P.rx - 20, P.y - P.ry - 20);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const y = P.y - P.ry - 4 + (i / n) * (2 * P.ry + 8);
      ctx.lineTo(fx + (i % 2 ? jag : -jag) * (0.6 + rand(i, 3) * 0.6), y);
    }
    ctx.lineTo(P.x - P.rx - 20, P.y + P.ry + 20);
    ctx.closePath();
    return fx;
  }
  function polyPath(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function beamPts(B, t, n, amp, freq = 0.9, speed = 30) {
    const dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, out = [];
    for (let i = 0; i <= n; i++) {
      const p = i / n, env = Math.sin(p * Math.PI) * 0.8 + 0.2;
      const o = Math.sin(i * freq - t * speed) * amp * env;
      out.push([B.x1 + dx * p + nx * o, B.y1 + dy * p + ny * o]);
    }
    return out;
  }
  function strokePts(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  function starPath(ctx, x, y, n, ro, ri, rot) {
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? ri : ro; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function arrowShape(ctx, ar, len, draw) {
    ctx.save(); ctx.translate(ar.x, ar.y); ctx.rotate(ar.ang); ctx.globalAlpha *= ar.alpha;
    draw(ctx, len); ctx.restore();
  }
  AS.util = { world, colorOf, hash, teardrop, blobPts, jit, iceFrontPath, polyPath, beamPts, strokePts, starPath, arrowShape };

  // =====================================================================
  // 1. BOLD TOON
  // =====================================================================
  const INK = '#2a1d34';
  const TP = {
    el: { fire: '#ff6a1f', water: '#2f8cff', cold: '#9eeaff', arcane: '#ff3d8b', shield: '#ffd23f' },
    p1: { robe: '#ec4338', trim: '#ffd04a', sleeve: '#c92f2a', hat: '#ec4338', band: '#ffd04a' },
    p2: { robe: '#3b7ff2', trim: '#c4e6ff', sleeve: '#2a5fc8', hat: '#3b7ff2', band: '#c4e6ff' },
    wizard: { skin: '#ffd3a8', beard: '#f7f3ea', staff: '#8f5c33', hand: '#ffd3a8' },
    goblin: { body: '#7cc244', belly: '#bfe581', dark: '#3f6a2a', club: '#9a6a3a' },
    archer: { body: '#7cc244', cloth: '#8a5a8e', dark: '#3f6a2a', bow: '#b07a3c', string: '#fff', arrow: '#e8d4ae', hand: '#7cc244' },
    brute: { body: '#c96d4c', belly: '#f2b48c', dark: '#5e3121', horn: '#f6eedc', brow: INK },
    imp: { body: '#a458dc', wing: '#6c2fa0', horn: '#ffe2a2', tail: '#6c2fa0' },
    common: { eye: INK, eyeWhite: '#fffbe6', tooth: '#ffffff' },
  };
  function toonGround(scale) {
    return AS.cached('toon-ground', W, H, scale, (x) => {
      x.fillStyle = '#7bc65a'; x.fillRect(0, 0, W, H);
      x.lineJoin = 'round';
      for (let i = 0; i < 9; i++) {
        x.beginPath(); polyPath(x, blobPts(rand(i, 1) * W, rand(i, 2) * H, 60 + rand(i, 3) * 70, 26 + rand(i, 4) * 30, i * 3.1, 28, 0.25));
        x.fillStyle = i % 3 ? '#6db44f' : '#8bd36a'; x.fill();
      }
      // dirt path snaking between the casters and the fight
      x.beginPath();
      const path = [];
      for (let i = 0; i <= 24; i++) { const px = -20 + i * 30; path.push([px, 214 + Math.sin(i * 0.55) * 18 + (px > 360 ? (px - 360) * 0.12 : 0)]); }
      x.moveTo(path[0][0], path[0][1] - 20);
      for (const [px, py] of path) x.lineTo(px, py - 20 + Math.sin(px * 0.07) * 2);
      for (let i = path.length - 1; i >= 0; i--) x.lineTo(path[i][0], path[i][1] + 20 + Math.sin(path[i][0] * 0.05) * 3);
      x.closePath(); x.fillStyle = '#e6c88f'; x.fill(); x.lineWidth = 3; x.strokeStyle = hexA(INK, 0.55); x.stroke();
      for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(rand(i, 7) * W, 200 + rand(i, 8) * 40, 1.5 + rand(i, 9) * 2, 0, TAU); x.fillStyle = '#c9a66c'; x.fill(); }
      // grass tufts
      x.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const gx = rand(i, 11) * W, gy = rand(i, 12) * H;
        if (gy > 188 && gy < 240) continue;
        x.strokeStyle = hexA(INK, 0.45); x.lineWidth = 2;
        x.beginPath(); x.moveTo(gx - 5, gy - 6); x.lineTo(gx - 2, gy); x.lineTo(gx, gy - 9); x.lineTo(gx + 2, gy); x.lineTo(gx + 5, gy - 6); x.stroke();
      }
      // flowers and rocks
      for (let i = 0; i < 14; i++) {
        const fx = rand(i, 21) * W, fy = rand(i, 22) * H;
        if (fy > 188 && fy < 240) continue;
        for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; x.beginPath(); x.arc(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.4, 0, TAU); x.fillStyle = i % 2 ? '#fff' : '#ffd6ef'; x.fill(); }
        x.beginPath(); x.arc(fx, fy, 1.8, 0, TAU); x.fillStyle = '#ffcf3a'; x.fill();
      }
      for (const [rx, ry, rr] of [[40, 40, 14], [610, 60, 18], [400, 30, 10], [30, 330, 12], [610, 388, 12], [395, 345, 9]]) {
        x.beginPath(); polyPath(x, blobPts(rx, ry, rr, rr * 0.75, rx, 14, 0.15)); x.fillStyle = '#a7a2b4'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
        x.beginPath(); x.ellipse(rx - rr * 0.3, ry - rr * 0.3, rr * 0.35, rr * 0.2, -0.4, 0, TAU); x.fillStyle = '#d4d0de'; x.fill();
      }
    });
  }
  function toonActor(ctx, a, S) {
    const parts = world(a), [rad] = AS.SIZE[a.kind];
    ctx.save(); ctx.globalAlpha = a.alpha;
    ctx.beginPath(); ctx.ellipse(a.x, a.y + 1, rad * a.s, rad * 0.36 * a.s, 0, 0, TAU); ctx.fillStyle = 'rgba(30,20,50,0.25)'; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.line ? p.w + 5.5 : 6; ctx.stroke(); }
    for (const { p, w } of parts) {
      const col = colorOf(TP, a, p.role);
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      ctx.fillStyle = col; ctx.fill();
      if (p.big) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = mix(col, INK, 0.28); ctx.fillRect(a.x - 60, a.y - 90, 120, 100);
        ctx.translate(-2.6 * a.face, -2.6); ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fillStyle = col; ctx.fill();
        if (a.wet) { ctx.fillStyle = hexA('#2f8cff', 0.3 * a.wet); ctx.fill(); }
        ctx.restore();
        ctx.beginPath(); AS.partPath(ctx, p, w);
      }
      if (p.role !== 'eye') { ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke(); }
      if (p.role === 'orb') {
        const [ox, oy] = [w[0][0] - 4.6, w[0][1]];
        ctx.beginPath(); ctx.arc(ox + 4.6 - 1.6 * a.face, oy - 1.6, 1.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    if (a.hit > 0) {
      ctx.globalAlpha = a.alpha * a.hit * 0.85; ctx.fillStyle = '#fff';
      for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); }
      ctx.globalAlpha = a.alpha;
    }
    if (a.frozen > 0) toonIce(ctx, a);
    ctx.restore();
  }
  function toonIce(ctx, a) {
    const [r, h] = AS.SIZE[a.kind], hh = (h + 8) * a.frozen;
    const x = a.x - r - 4, y = a.y + 5 - hh, w = 2 * r + 8;
    ctx.beginPath(); ctx.roundRect(x, y, w, hh, 6);
    ctx.fillStyle = 'rgba(176,236,255,0.62)'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x + 5, y + 16); ctx.lineTo(x + 16, y + 5); ctx.moveTo(x + 5, y + 26); ctx.lineTo(x + 26, y + 5); ctx.stroke();
    ctx.fillStyle = 'rgba(120,200,240,0.35)'; ctx.fillRect(x + w * 0.62, y, w, hh);
    if (a.crack > 0) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); const n = Math.ceil(a.crack * 5);
      for (let i = 0; i < n; i++) { const cx = x + w * rand(i, 61), cy = y + hh * rand(i, 62); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rand(i, 63) - 0.5) * 18, cy + (rand(i, 64) - 0.5) * 18); ctx.lineTo(cx + (rand(i, 65) - 0.5) * 26, cy + (rand(i, 66) - 0.5) * 26); }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Stroke-all-then-fill-all gives overlapping blobs one merged outline (classic toon look).
  function merged(ctx, items, shape, layers) {
    for (const [i, L] of layers.entries()) {
      ctx.beginPath();
      for (const it of items) shape(ctx, it, L.k);
      if (L.stroke) { ctx.lineWidth = L.stroke; ctx.strokeStyle = L.color; ctx.stroke(); } else { ctx.fillStyle = L.color; ctx.fill(); }
    }
  }
  function toonRender(ctx, S, scale) {
    const t = S.t, E = TP.el;
    ctx.drawImage(toonGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // scorched grass under the fire
    const F = S.fire;
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 30, 0.14)); ctx.fillStyle = '#5b4632'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y + 2, F.rx * 0.7, F.ry * 0.62, 9, 24, 0.2)); ctx.fillStyle = '#ff8a2a'; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
    // puddle + ice
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 34, 0.1);
    ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = '#3b9af2'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ctx.beginPath(); polyPath(ctx, pud); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); const fx = iceFrontPath(ctx, P, 6); ctx.fillStyle = '#cdf4ff'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ecfcff';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; polyPath(ctx, [[cx, cy - 8], [cx + 14, cy - 2], [cx + 4, cy + 7]]); ctx.fill(); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { const cx = P.x - P.rx + 20 + i * 38; ctx.beginPath(); ctx.moveTo(cx, P.y + 8); ctx.lineTo(cx + 12, P.y - 6); ctx.stroke(); }
      if (P.crack > 0) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore();
      if (P.front < 1) { ctx.beginPath(); ctx.moveTo(fx, P.y - P.ry); for (let i = 0; i <= 9; i++) ctx.lineTo(fx + (i % 2 ? 6 : -6) * (0.6 + rand(i, 3) * 0.6), P.y - P.ry - 4 + (i / 9) * (2 * P.ry + 8)); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.beginPath(); polyPath(ctx, pud); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    // fire tongues (behind actors)
    merged(ctx, S.tongues, (c, f, k) => teardrop(c, f.x, f.y - (1 - k) * 2, f.w * k, f.h * k, f.sway * k), [
      { k: 1, stroke: 5, color: INK }, { k: 1, color: '#ff4a26' }, { k: 0.66, color: '#ff9c1f' }, { k: 0.36, color: '#ffe55c' }]);
    // actors
    for (const a of S.actors) toonActor(ctx, a, S);
    // water drips
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2.6, 7); ctx.fillStyle = E.water; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // flame particles, imp flames, smoke, embers
    const fl = [...S.flames, ...S.impFlames].filter((f) => f.size > 0.6);
    merged(ctx, fl, (c, f, k) => teardrop(c, f.x, f.y, f.size * k, f.size * 2.6 * k), [
      { k: 1, stroke: 4, color: INK }, { k: 1, color: '#ff5a24' }, { k: 0.55, color: '#ffd04a' }]);
    const sm = S.smoke.filter((s) => s.age > 0.12 && s.age < 0.85);
    ctx.globalAlpha = 0.7;
    merged(ctx, sm, (c, s, k) => { const r = s.size * 0.7 * k * (1 - seg(s.age, 0.5, 0.85) * 0.7); c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }, [
      { k: 1, stroke: 3, color: hexA(INK, 0.7) }, { k: 1, color: '#d4cfdc' }, { k: 0.55, color: '#efecf3' }]);
    ctx.globalAlpha = 1;
    for (const e of S.embers) { ctx.beginPath(); ctx.arc(e.x, e.y, 2.2 * (1 - e.age) + 0.8, 0, TAU); ctx.fillStyle = e.r > 0.5 ? '#ffe55c' : '#ff8a2a'; ctx.fill(); }
    // frost mist
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.5; ctx.beginPath(); ctx.arc(m.x, m.y, m.size * 0.6, 0, TAU); ctx.fillStyle = '#eafcff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // sprays
    const sp = S.spray.parts, water = sp.filter((p) => p.kind === 'water'), cold = sp.filter((p) => p.kind === 'cold');
    merged(ctx, water, (c, p, k) => { const r = (1.6 + p.size * 0.55) * k * (1 - seg(p.age, 0.8, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 3.5, color: INK }, { k: 1, color: E.water }, { k: 0.45, color: '#a6d8ff' }]);
    merged(ctx, cold, (c, p, k) => { const r = (1.5 + p.size * 0.85) * k * (1 - seg(p.age, 0.7, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 4, color: INK }, { k: 1, color: '#8fe3ff' }, { k: 0.62, color: '#e6fbff' }]);
    for (const [i, p] of cold.entries()) if (i % 4 === 0 && p.age < 0.85) { ctx.beginPath(); starPath(ctx, p.x, p.y, 6, 4.5, 1.6, p.rot); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); }
    if (S.spray.water + S.spray.cold > 0) { const col = S.spray.cold > 0 ? '#e6fbff' : '#a6d8ff'; ctx.beginPath(); ctx.arc(S.spray.x, S.spray.y, 7 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); }
    // beam
    if (S.beam) {
      const B = S.beam, pts = beamPts(B, t, 22, 3.2 * B.on), o = B.on;
      for (const [lw, col] of [[19 * o, INK], [14 * o, E.arcane], [7 * o, '#ffb3d1'], [2.8 * o, '#fff']]) { ctx.lineWidth = lw; ctx.strokeStyle = col; strokePts(ctx, pts); }
      const rot = t * 6;
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 20 * o + Math.sin(t * 50) * 2, 9 * o, rot); ctx.fillStyle = E.arcane; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 10 * o, 4.5 * o, -rot); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(B.x1, B.y1, 9 * o, 0, TAU); ctx.fillStyle = '#ffb3d1'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      for (const s of S.beamSparks) { const L = 7 * (1 - s.age); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * L, s.y - Math.sin(s.a) * L); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = s.r > 0.5 ? '#fff' : E.arcane; ctx.stroke(); }
    }
    // ward bubble
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = hexA(E.shield, 0.16 + Wd.pulse * 0.25); ctx.fill();
    ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = E.shield; ctx.stroke();
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr - 6, Math.PI * 1.1, Math.PI * 1.45); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = t * 0.8 + i / 6 * TAU; ctx.beginPath(); starPath(ctx, Wd.x + Math.cos(a) * wr, Wd.y + Math.sin(a) * wr, 4, 3.5, 1.3, 0); ctx.fillStyle = '#fff6c4'; ctx.fill(); }
    if (Wd.pulse > 0) { ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 26 + 4, 0, TAU); ctx.lineWidth = 3 * Wd.pulse; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    for (const s of S.wardSparks) { ctx.beginPath(); starPath(ctx, s.x, s.y, 4, 4.5 * (1 - s.age), 1.6 * (1 - s.age), s.a); ctx.fillStyle = s.r > 0.4 ? E.shield : '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); }
    // arrows
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.lineWidth = 5; c.strokeStyle = INK; c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = '#e8c48a'; c.stroke();
      c.beginPath(); c.moveTo(14, 0); c.lineTo(7, -4.5); c.lineTo(7, 4.5); c.closePath(); c.fillStyle = '#c9c4d6'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -4); c.lineTo(-10, 0); c.lineTo(-18, 4); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
    });
    // shatter shards
    for (const s of S.shards) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1);
      ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]);
      ctx.fillStyle = s.r > 0.5 ? '#e6fbff' : '#9fe6ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    }
    // numbers
    const NC = { arcane: '#ff6aa6', crit: '#ffe14a', fire: '#ff9a3a', cold: '#c4f4ff', water: '#79c2ff', shield: '#ffe14a' };
    for (const n of S.numbers) {
      const size = (n.big ? 25 : 19) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.translate(n.x, n.y); ctx.rotate((rand(n.x | 0, 3) - 0.5) * 0.25);
      ctx.font = `${size}px "Lilita One", "Arial Rounded MT Bold", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5.5; ctx.strokeStyle = INK; ctx.strokeText(n.text, 0, 0); ctx.fillStyle = NC[n.kind]; ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    // HUD
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 12); ctx.fillStyle = '#fff4d8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 13, 0, TAU); ctx.fillStyle = TP[h.team].robe; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140, 6, 3); ctx.fillStyle = '#3a2a48'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140 * h.hp, 6, 3); ctx.fillStyle = '#5fdc6a'; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 12, q = h.queue[i];
        ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, TAU);
        if (!q) { ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(INK, 0.45); ctx.stroke(); ctx.setLineDash([]); continue; }
        const r = 9.5 * ease.back(q.pop);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = E[q.el]; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        AS.glyph(ctx, q.el, cx, cy, r * 0.62); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
  }
  AS.register({
    id: 'toon', name: 'Bold Toon',
    refs: ['Magicka', 'Castle Crashers', 'Overcooked'],
    feel: 'Thick dark outlines, flat saturated fills, one hard cel shadow. Overlapping flames and puffs merge into a single outlined blob, so effects stay graphic instead of turning into mush. It is the closest to Magicka\'s own cartoon tone, with a Saturday-morning punch.',
    notes: {
      read: ['Strong', 'The ink outline separates everything from everything. At high chaos the outlined effect blobs pile up into one big shape, so effects need a strict size budget.'],
      tone: ['Spot on', 'Playful, loud and slapstick, which suits friendly-fire comedy.'],
      cost: ['Low to medium', 'Easy to keep consistent with a toon shader or vector art; the outline treatment of VFX is the main custom work.'],
    },
    render: toonRender,
  });

  // =====================================================================
  // 2. PAPER DIORAMA
  // =====================================================================
  const PP = {
    el: { fire: '#f0582a', water: '#4f95e0', cold: '#9fdcf5', arcane: '#e8457f', shield: '#f2c14e' },
    p1: { robe: '#d8463a', trim: '#f2c14e', sleeve: '#b63a30', hat: '#d8463a', band: '#f2c14e' },
    p2: { robe: '#3f6fc8', trim: '#a9d4f5', sleeve: '#2f58a6', hat: '#3f6fc8', band: '#a9d4f5' },
    wizard: { skin: '#f3c9a0', beard: '#fffaf0', staff: '#a0703f', hand: '#f3c9a0' },
    goblin: { body: '#8cb84a', belly: '#cde08f', dark: '#4d6b33', club: '#9a6a3a' },
    archer: { body: '#8cb84a', cloth: '#7d5236', dark: '#4d6b33', bow: '#c08040', string: '#fffaf0', arrow: '#e3cfa6', hand: '#8cb84a' },
    brute: { body: '#b8664e', belly: '#e6a98a', dark: '#6b3a2a', horn: '#efe3c8', brow: '#3a2420' },
    imp: { body: '#9a52c9', wing: '#6b3596', horn: '#f3d9a0', tail: '#6b3596' },
    common: { eye: '#2b2230', eyeWhite: '#fffaf0', tooth: '#fffaf0' },
  };
  function paperTex(scale) {
    return AS.cached('paper-tex', 96, 96, 1, (x) => {
      for (let i = 0; i < 900; i++) {
        const l = rand(i, 1);
        x.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.06 + rand(i, 4) * 0.08})` : `rgba(60,40,20,${0.04 + rand(i, 4) * 0.06})`;
        if (i % 3) x.fillRect(rand(i, 2) * 96, rand(i, 3) * 96, 1, 1);
        else { x.save(); x.translate(rand(i, 2) * 96, rand(i, 3) * 96); x.rotate(rand(i, 5) * TAU); x.fillRect(0, 0, 4 + rand(i, 6) * 5, 0.6); x.restore(); }
      }
    });
  }
  function pat(ctx, scale) { if (!ctx._paperPat) ctx._paperPat = ctx.createPattern(paperTex(scale), 'repeat'); return ctx._paperPat; }
  function shadowOn(ctx, scale, blur, ox, oy, a = 0.35) { ctx.shadowColor = `rgba(55,35,15,${a})`; ctx.shadowBlur = blur * scale; ctx.shadowOffsetX = ox * scale; ctx.shadowOffsetY = oy * scale; }
  function shadowOff(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  // A cut-paper piece: straight-edged polygon with jitter, drop shadow, fiber texture.
  function piece(ctx, scale, pts, color, sh = [3, 2, 3], texA = 1) {
    shadowOn(ctx, scale, sh[0], sh[1], sh[2]);
    ctx.beginPath(); polyPath(ctx, pts); ctx.fillStyle = color; ctx.fill(); shadowOff(ctx);
    if (texA) { ctx.globalAlpha *= texA; ctx.fillStyle = pat(ctx, scale); ctx.fill(); ctx.globalAlpha /= texA; }
  }
  function paperGround(scale) {
    return AS.cached('paper-ground', W, H, scale, (x) => {
      x.fillStyle = '#7ea45a'; x.fillRect(0, 0, W, H);
      // felt fibers
      for (let i = 0; i < 9000; i++) {
        const l = rand(i, 1);
        x.strokeStyle = l > 0.55 ? `rgba(200,230,150,${0.1 + rand(i, 5) * 0.12})` : `rgba(40,60,25,${0.08 + rand(i, 5) * 0.1})`;
        x.lineWidth = 0.6; const px = rand(i, 2) * W, py = rand(i, 3) * H, a = rand(i, 4) * TAU, L = 2 + rand(i, 6) * 4;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 1) * L * 0.5, py + Math.sin(a + 1) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
      }
      const tex = x.createPattern(paperTex(1), 'repeat');
      const pc = (pts, col, sh = 3) => { x.shadowColor = 'rgba(40,30,10,0.35)'; x.shadowBlur = sh * scale; x.shadowOffsetX = 1.5 * scale; x.shadowOffsetY = 2 * scale; x.beginPath(); polyPath(x, pts); x.fillStyle = col; x.fill(); x.shadowColor = 'transparent'; x.fillStyle = tex; x.fill(); };
      // construction-paper path
      const top = [], bot = [];
      for (let i = 0; i <= 16; i++) { const px = -20 + i * 44, py = 214 + Math.sin(i * 0.8) * 16 + (px > 360 ? (px - 360) * 0.12 : 0); top.push([px, py - 22 + rand(i, 1) * 4]); bot.push([px, py + 22 - rand(i, 2) * 4]); }
      pc([...top, ...bot.reverse()], '#d9bf8c');
      // grass paper patches
      for (let i = 0; i < 8; i++) {
        const cx = rand(i, 31) * W, cy = rand(i, 32) * H;
        if (cy > 180 && cy < 250) continue;
        pc(jit(blobPts(cx, cy, 34 + rand(i, 33) * 30, 14 + rand(i, 34) * 10, i, 12, 0.3), i, 3), i % 2 ? '#93b968' : '#6f9550', 2);
      }
      // zigzag grass strips
      for (let i = 0; i < 18; i++) {
        const gx = rand(i, 41) * W, gy = rand(i, 42) * H; if (gy > 186 && gy < 246) continue;
        const pts = [[gx - 10, gy]]; for (let k = 0; k <= 6; k++) pts.push([gx - 10 + k * 3.3, gy - (k % 2 ? 9 : 2) - rand(i, k) * 3]); pts.push([gx + 10, gy]);
        pc(pts, '#a6c870', 2);
      }
      // paper flowers + cardboard rocks
      for (let i = 0; i < 10; i++) {
        const fx = rand(i, 51) * W, fy = rand(i, 52) * H; if (fy > 186 && fy < 246) continue;
        const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, r = k % 2 ? 2.5 : 6; pts.push([fx + Math.cos(a) * r, fy + Math.sin(a) * r]); }
        pc(pts, i % 2 ? '#f6efe0' : '#f3a6b8', 2);
        x.beginPath(); x.arc(fx, fy, 2, 0, TAU); x.fillStyle = '#f2c14e'; x.fill();
      }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) pc(jit(AS.ell(rx, ry, rr, rr * 0.75, 9), rx, 3), '#b4a48e');
      // warm vignette
      const g = x.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 420); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,35,10,0.32)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    });
  }
  function paperActor(ctx, a, S, scale) {
    const fr = Math.floor(S.t * 12), h = hash(a.id);
    const parts = world(a).map(({ p, w }, i) => ({ p, w: p.line ? w : jit(w, h + i * 13, 0.9) }));
    const [rad] = AS.SIZE[a.kind];
    ctx.save(); ctx.globalAlpha = a.alpha;
    // hand-moved jitter around the feet
    ctx.translate(a.x, a.y); ctx.rotate((rand(fr, h) - 0.5) * 0.06); ctx.translate(-a.x + (rand(fr, h, 2) - 0.5) * 0.8, -a.y);
    ctx.beginPath(); ctx.ellipse(a.x + 3, a.y + 2, rad * 0.9, rad * 0.3, 0, 0, TAU); ctx.fillStyle = 'rgba(40,25,10,0.22)'; ctx.fill();
    // white cut-out backing with drop shadow
    shadowOn(ctx, scale, 5, 2.5, 4, 0.4);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); for (const { p, w } of parts) if (!p.line) { polyPath(ctx, w); }
    ctx.fillStyle = '#fbf6ea'; ctx.strokeStyle = '#fbf6ea'; ctx.lineWidth = 6; ctx.stroke();
    shadowOff(ctx); ctx.fill();
    for (const { p, w } of parts) if (p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.w + 4; ctx.stroke(); }
    // layered pieces
    for (const { p, w } of parts) {
      const col = colorOf(PP, a, p.role);
      if (p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      const small = p.role === 'eye' || p.role === 'tooth';
      shadowOn(ctx, scale, small ? 0 : 1.5, 0.5, small ? 0.5 : 1.2, 0.4);
      ctx.beginPath(); polyPath(ctx, w); ctx.fillStyle = col; ctx.fill(); shadowOff(ctx);
      if (!small) { ctx.fillStyle = pat(ctx, scale); ctx.fill(); }
      if (a.wet && p.big) { ctx.fillStyle = hexA('#3a78c8', 0.28 * a.wet); ctx.fill(); }
    }
    if (a.hit > 0) { ctx.globalAlpha = a.alpha * a.hit * 0.8; ctx.fillStyle = '#fffaf0'; for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); polyPath(ctx, w); ctx.fill(); } ctx.globalAlpha = a.alpha; }
    if (a.frozen > 0) {
      const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * a.frozen;
      const x0 = a.x - r - 5, y0 = a.y + 5 - hh, w0 = 2 * r + 10;
      const ice = [[x0 + 2, y0 + 4], [x0 + w0 * 0.4, y0], [x0 + w0 - 1, y0 + 6], [x0 + w0, y0 + hh * 0.6], [x0 + w0 - 3, y0 + hh], [x0 + 3, y0 + hh - 1], [x0, y0 + hh * 0.45]];
      ctx.globalAlpha = a.alpha * 0.62; piece(ctx, scale, ice, '#d4eefa', [4, 2, 3], 0.6); ctx.globalAlpha = a.alpha;
      ctx.beginPath(); polyPath(ctx, ice); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); polyPath(ctx, [[x0 + 5, y0 + 10], [x0 + 14, y0 + 6], [x0 + 6, y0 + 22]]); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); polyPath(ctx, [[x0 + w0 - 6, y0 + 12], [x0 + w0 - 3, y0 + hh - 6], [x0 + w0 - 10, y0 + hh * 0.5]]); ctx.fillStyle = '#b6e0f2'; ctx.fill();
      for (let i = 0; i < 6; i++) { ctx.fillStyle = (fr + i) % 3 ? '#ffffff' : '#9fdcf5'; ctx.fillRect(x0 + rand(i, h, 1) * w0, y0 + rand(i, h, 2) * hh, 1.6, 1.6); }
      if (a.crack > 0) { ctx.strokeStyle = '#6a8ea0'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 4 * a.crack; i++) { const cx = x0 + w0 * rand(i, 61), cy = y0 + hh * rand(i, 62); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rand(i, 63) - 0.5) * 20, cy + (rand(i, 64) - 0.5) * 20); } ctx.stroke(); }
    }
    ctx.restore();
  }
  function paperFlame(ctx, scale, x, y, w, h, seed, cols, sh = true) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) { const a = Math.PI * (i / n); pts.push([x + Math.cos(a) * w, y - w * 0.8 + Math.sin(a) * w * 0.9]); }
    pts.push([x - w * 0.9, y - h * 0.45], [x - w * 0.3, y - h * 0.6], [x - w * 0.15 + (rand(seed, 1) - 0.5) * w, y - h], [x + w * 0.35, y - h * 0.55], [x + w * 0.9, y - h * 0.5]);
    const order = [pts[n + 5], ...pts.slice(0, n + 1), ...pts.slice(n + 1, n + 5)];
    for (const [k, col] of cols.entries()) {
      const s = 1 - k * 0.3, cx = x, cy = y - 1;
      const sp = jit(order.map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]), seed + k * 7, 1.6);
      if (sh && k === 0) piece(ctx, scale, sp, col, [3, 1.5, 2.5], 0.5); else { ctx.beginPath(); polyPath(ctx, sp); ctx.fillStyle = col; ctx.fill(); }
    }
  }
  function paperRender(ctx, S, scale) {
    const t = S.t, E = PP.el, fr = Math.floor(t * 12);
    ctx.drawImage(paperGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = S.fire;
    piece(ctx, scale, jit(blobPts(F.x, F.y, F.rx, F.ry, 5, 20, 0.16), 5, 2), '#5a4430', [3, 1, 2]);
    piece(ctx, scale, jit(blobPts(F.x, F.y + 2, F.rx * 0.65, F.ry * 0.55, 9, 14, 0.25), 9, 2), '#8a4a2a', [2, 1, 1]);
    // puddle: blue paper with cut ripple rings
    const P = S.puddle, pud = jit(blobPts(P.x, P.y, P.rx, P.ry, 2, 22, 0.1), 2, 2);
    piece(ctx, scale, pud, '#3f7fd0', [3, 1, 2]);
    ctx.save(); ctx.beginPath(); polyPath(ctx, pud); ctx.clip();
    for (let i = 0; i < 3; i++) {
      const k = (Math.floor(t * 12) / 12 * 0.5 + i / 3) % 1, cx = P.x + 10 - i * 30, cy = P.y - 4 + i * 8;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx, cy, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#7fb4ec'; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); iceFrontPath(ctx, P, 7); ctx.save(); ctx.clip();
      shadowOn(ctx, scale, 3, 1, 2); ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = '#e7f5fb'; ctx.fill(); shadowOff(ctx); ctx.fillStyle = pat(ctx, scale); ctx.fill();
      for (let i = 0; i < 7; i++) { const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; ctx.beginPath(); polyPath(ctx, [[cx, cy - 9], [cx + 16, cy - 1], [cx + 3, cy + 8]]); ctx.fillStyle = i % 2 ? '#cbe9f6' : '#ffffff'; ctx.fill(); }
      for (let i = 0; i < 16; i++) { ctx.fillStyle = (fr + i) % 4 ? '#fff' : '#9fdcf5'; ctx.fillRect(P.x - P.rx + rand(i, 73) * 2 * P.rx, P.y - P.ry + rand(i, 74) * 2 * P.ry, 1.8, 1.8); }
      if (P.crack > 0) { ctx.strokeStyle = '#6a8ea0'; ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // fire tongues: flip-book cut-outs, new shape every frame
    for (const [j, f] of S.tongues.entries()) paperFlame(ctx, scale, f.x, f.y, f.w, f.h * 1.05, fr * 31 + j, ['#e8452a', '#f6922a', '#fbd348']);
    for (const a of S.actors) paperActor(ctx, a, S, scale);
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2.6, 7); ctx.fillStyle = E.water; ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const f of [...S.flames, ...S.impFlames]) if (f.size > 0.8) paperFlame(ctx, scale, f.x, f.y, f.size, f.size * 2.6, fr * 7 + Math.round(f.r * 99), f.r > 0.5 ? ['#e8452a', '#fbd348'] : ['#f6922a', '#fbd348'], false);
    for (const s of S.smoke) {
      if (s.age < 0.1) continue;
      ctx.globalAlpha = 0.6 * (1 - s.age);
      shadowOn(ctx, scale, 3, 1, 2, 0.25); ctx.beginPath(); polyPath(ctx, jit(AS.ell(s.x, s.y, s.size * 0.6, s.size * 0.5, 9), Math.round(s.r * 50), 2)); ctx.fillStyle = '#e9e3d6'; ctx.fill(); shadowOff(ctx);
    }
    ctx.globalAlpha = 1;
    for (const e of S.embers) { ctx.fillStyle = e.r > 0.5 ? '#fbd348' : '#f6922a'; ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.r * 9 + fr); ctx.fillRect(-2, -1.2, 4, 2.4); ctx.restore(); }
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.35; ctx.beginPath(); polyPath(ctx, AS.ell(m.x, m.y, m.size * 0.6, m.size * 0.45, 8)); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // sprays: blue confetti and cut paper snowflakes
    for (const p of S.spray.parts) {
      const k = 1 - seg(p.age, 0.8, 1);
      if (p.kind === 'water') { shadowOn(ctx, scale, 2, 1.5, 2.5, 0.3); ctx.beginPath(); ctx.arc(p.x, p.y, (1.5 + p.size * 0.5) * k, 0, TAU); ctx.fillStyle = p.r > 0.5 ? '#4f95e0' : '#8cc2f2'; ctx.fill(); shadowOff(ctx); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + fr * 0.3);
      shadowOn(ctx, scale, 2, 2, 3, 0.3);
      ctx.beginPath(); starPath(ctx, 0, 0, 6, (2.5 + p.size * 0.9) * k, (1 + p.size * 0.3) * k, 0); ctx.fillStyle = p.r > 0.4 ? '#ffffff' : '#c6ecfa'; ctx.fill(); shadowOff(ctx);
      ctx.restore();
    }
    // beam: a twisting paper ribbon that floats above the ground
    if (S.beam) {
      const B = S.beam, dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, n = Math.ceil(L / 12);
      const wAt = (i) => 8 * B.on * Math.cos(i * 0.55 - fr * 0.9);
      const pt = (i, s) => { const p = i / n; return [B.x1 + dx * p + nx * wAt(i) * s, B.y1 + dy * p + ny * wAt(i) * s + Math.sin(i * 0.4 - fr * 0.5) * 2]; };
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = pt(i, 1); i ? ctx.lineTo(x + 5, y + 9) : ctx.moveTo(x + 5, y + 9); } for (let i = n; i >= 0; i--) { const [x, y] = pt(i, -1); ctx.lineTo(x + 5, y + 9); }
      ctx.fillStyle = 'rgba(55,35,15,0.25)'; ctx.fill();
      for (let i = 0; i < n; i++) {
        const a = pt(i, 1), b = pt(i + 1, 1), c = pt(i + 1, -1), d = pt(i, -1);
        const front = Math.cos((i + 0.5) * 0.55 - fr * 0.9) > 0;
        ctx.beginPath(); polyPath(ctx, [a, b, c, d]); ctx.fillStyle = front ? '#ee5a8e' : '#b8325f'; ctx.fill();
        ctx.lineWidth = 0.8; ctx.strokeStyle = front ? '#ffd0e0' : '#8e2449'; ctx.stroke();
      }
      for (let i = 0; i < 5; i++) { const ang = rand(fr, i) * TAU, r = 8 + rand(fr, i, 2) * 14; ctx.save(); ctx.translate(B.x2 + Math.cos(ang) * r, B.y2 + Math.sin(ang) * r); shadowOn(ctx, scale, 2, 1, 2); ctx.beginPath(); starPath(ctx, 0, 0, 5, 6, 2.6, ang); ctx.fillStyle = i % 2 ? '#fbd348' : '#ffd0e0'; ctx.fill(); shadowOff(ctx); ctx.restore(); }
      piece(ctx, scale, jit(AS.ell(B.x1, B.y1, 8 * B.on, 8 * B.on, 8), fr, 2), '#ffd0e0', [2, 1, 2], 0);
      for (const s of S.beamSparks) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a + fr); ctx.fillStyle = s.r > 0.5 ? '#ee5a8e' : '#fffaf0'; ctx.fillRect(-2.5, -1.5, 5, 3); ctx.restore(); }
    }
    // ward: tracing-paper dome with stitched thread
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = `rgba(255,246,214,${0.16 + Wd.pulse * 0.25})`; shadowOn(ctx, scale, 4, 2, 3, 0.15); ctx.fill(); shadowOff(ctx);
    ctx.setLineDash([6, 5]); ctx.lineDashOffset = -fr * 1.5; ctx.lineWidth = 2.6; ctx.strokeStyle = '#e0a520'; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr - 3, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr - 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    for (const s of S.wardSparks) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.beginPath(); starPath(ctx, 0, 0, 4, 5 * (1 - s.age), 2 * (1 - s.age), 0); ctx.fillStyle = s.r > 0.4 ? '#f2c14e' : '#fffaf0'; ctx.fill(); ctx.restore(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      shadowOn(c, scale, 2, 2, 4, 0.3);
      c.fillStyle = '#d7b98a'; c.fillRect(-14, -1.6, 24, 3.2);
      c.beginPath(); polyPath(c, [[15, 0], [7, -5], [8, 0], [7, 5]]); c.fillStyle = '#9a9aa6'; c.fill();
      c.beginPath(); polyPath(c, [[-14, 0], [-19, -5], [-10, -1], [-10, 1], [-19, 5]]); c.fillStyle = '#e8452a'; c.fill(); shadowOff(c);
    });
    for (const s of S.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); shadowOn(ctx, scale, 2, 1.5, 2.5, 0.3); ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]); ctx.fillStyle = s.r > 0.5 ? '#ffffff' : '#c6ecfa'; ctx.fill(); shadowOff(ctx); ctx.restore(); }
    // numbers: little paper tags
    const NC = { arcane: '#c22a62', crit: '#c22a62', fire: '#d2461e', cold: '#2a78b0', water: '#2f6fc0', shield: '#a87810' };
    for (const n of S.numbers) {
      const size = (n.big ? 21 : 17) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.translate(n.x, n.y); ctx.rotate((rand(n.x | 0, 3) - 0.5) * 0.3);
      ctx.font = `${size}px "Patrick Hand", "Comic Sans MS", cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(n.text).width + 10;
      const tag = jit([[-tw / 2, -size * 0.55], [tw / 2, -size * 0.6], [tw / 2 + 1, size * 0.55], [-tw / 2 - 1, size * 0.6]], Math.round(n.x), 2);
      piece(ctx, scale, tag, n.kind === 'crit' ? '#fbd348' : '#fffaf0', [3, 1.5, 2.5], 0.6);
      ctx.fillStyle = NC[n.kind]; ctx.fillText(n.text, 0, 1);
      ctx.restore();
    }
    // HUD: cardboard strips with paper tokens
    for (const h of S.hud) {
      piece(ctx, scale, jit([[h.x, h.y], [h.x + h.w, h.y + 1], [h.x + h.w - 1, h.y + h.h], [h.x + 1, h.y + h.h - 1]], h.x, 2), '#c9a57a', [4, 2, 3]);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#7a5a36'; ctx.beginPath(); ctx.roundRect(h.x + 3.5, h.y + 3.5, h.w - 7, h.h - 7, 3); ctx.stroke(); ctx.setLineDash([]);
      piece(ctx, scale, jit(AS.ell(h.x + 18, h.y + 18, 12, 12, 10), h.x + 1, 1.5), PP[h.team].robe, [2, 1, 1.5]);
      ctx.font = '14px "Patrick Hand", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fffaf0'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.fillStyle = '#7a5a36'; ctx.fillRect(h.x + 38, h.y + 25, 140, 5); ctx.fillStyle = '#e8452a'; ctx.fillRect(h.x + 38, h.y + 25, 140 * h.hp, 5);
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 13, q = h.queue[i];
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fillStyle = 'rgba(90,60,30,0.25)'; ctx.fill(); continue; }
        const r = 9.5 * ease.back(q.pop);
        piece(ctx, scale, jit(AS.ell(cx, cy, r, r, 10), i + h.x, 1.2), '#fffaf0', [2, 1, 2], 0.5);
        AS.glyph(ctx, q.el, cx, cy, r * 0.7); ctx.fillStyle = q.el === 'cold' ? '#5aaed8' : E[q.el]; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy - r + 2, 1.6, 0, TAU); ctx.fillStyle = '#c0392b'; ctx.fill();
      }
    }
  }
  AS.register({
    id: 'paper', name: 'Paper Diorama', fps: 12,
    refs: ['Paper Mario', 'Tearaway', 'Kirby\'s Epic Yarn'],
    feel: 'A tabletop of cut construction paper, felt and tracing paper. Every piece has a white cut edge and a soft drop shadow, and the scene animates at 12 fps with a slight hand-moved wobble, like stop motion. Spells are crafts too: a twisting paper ribbon beam, paper snowflakes, flip-book flames.',
    notes: {
      read: ['Medium', 'Drop shadows lift characters off the ground nicely, but the warm, textured palette makes small effects blend together, and at high chaos the paper confetti looks like clutter.'],
      tone: ['Charming', 'Cosy and witty rather than wild; it pulls the game toward gentle storybook comedy.'],
      cost: ['Medium', 'Flat 2D pieces are cheap per asset, but the craft look only holds if every effect is redesigned as a paper object, which is real art direction work.'],
    },
    render: paperRender,
  });

  // =====================================================================
  // 3. STORYBOOK INK & WATERCOLOR
  // =====================================================================
  const SEPIA = '#3a2c25';
  const IP = {
    el: { fire: '#ff6a1a', water: '#2f86e0', cold: '#28c6f0', arcane: '#ff2a8a', shield: '#f2b51c' },
    p1: { robe: '#d4644e', trim: '#e8bf6a', sleeve: '#b85444', hat: '#d4644e', band: '#e2b45a' },
    p2: { robe: '#5e8cc6', trim: '#b4d2e8', sleeve: '#4a74aa', hat: '#5e8cc6', band: '#a8c8e0' },
    wizard: { skin: '#eccaa6', beard: '#f4efe4', staff: '#8a6440', hand: '#eccaa6' },
    goblin: { body: '#9db86a', belly: '#d0dca4', dark: '#5a6a3c', club: '#8a6440' },
    archer: { body: '#9db86a', cloth: '#8e6c58', dark: '#5a6a3c', bow: '#8a6440', string: SEPIA, arrow: '#8a6440', hand: '#8fa75e' },
    brute: { body: '#bc8670', belly: '#e4c2a8', dark: '#6a4436', horn: '#eadfc8', brow: SEPIA },
    imp: { body: '#a084c0', wing: '#7a5a98', horn: '#e8d4a8', tail: SEPIA },
    common: { eye: SEPIA, eyeWhite: '#fbf6ea', tooth: '#fbf6ea' },
  };
  const wob = (pts, seed, amt) => jit(pts, seed, amt);
  function inkGround(scale) {
    return AS.cached('ink-ground', W, H, scale, (x) => {
      x.fillStyle = '#f0e6d0'; x.fillRect(0, 0, W, H);
      const wash = (pts, col, a) => { x.globalAlpha = a; x.beginPath(); AS.path(x, pts); x.fillStyle = col; x.fill(); x.globalAlpha = a * 0.8; x.lineWidth = 1.6; x.strokeStyle = col; x.stroke(); x.globalAlpha = 1; };
      x.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 14; i++) wash(blobPts(rand(i, 1) * W, rand(i, 2) * H, 70 + rand(i, 3) * 90, 34 + rand(i, 4) * 40, i * 1.7, 26, 0.3), i % 3 ? '#bccb98' : '#d6d4a0', 0.26);
      for (let i = 0; i < 6; i++) wash(blobPts(rand(i, 5) * W, rand(i, 6) * H, 40 + rand(i, 7) * 50, 20 + rand(i, 8) * 20, i * 2.9, 22, 0.35), '#a4b884', 0.22);
      // ochre path wash
      const top = [], bot = [];
      for (let i = 0; i <= 16; i++) { const px = -20 + i * 44, py = 214 + Math.sin(i * 0.8) * 16 + (px > 360 ? (px - 360) * 0.12 : 0); top.push([px, py - 20 + rand(i, 1) * 6]); bot.push([px, py + 20 - rand(i, 2) * 6]); }
      wash([...top, ...bot.reverse()], '#e2c48e', 0.55);
      x.globalCompositeOperation = 'source-over';
      // ink: grass ticks, stones with hatching
      x.strokeStyle = SEPIA; x.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const gx = rand(i, 11) * W, gy = rand(i, 12) * H; if (gy > 192 && gy < 238) continue;
        x.globalAlpha = 0.55; x.lineWidth = 0.9;
        x.beginPath(); for (let k = -1; k <= 1; k++) { x.moveTo(gx + k * 3, gy); x.quadraticCurveTo(gx + k * 3 + 1, gy - 4, gx + k * 4.5 + 1.5, gy - 7 - rand(i, k) * 3); } x.stroke();
      }
      for (const [rx, ry, rr] of [[40, 40, 15], [610, 60, 18], [400, 30, 11], [30, 330, 12], [610, 388, 13], [395, 345, 9]]) {
        x.globalAlpha = 0.5; x.beginPath(); AS.path(x, blobPts(rx, ry, rr, rr * 0.75, rx, 14, 0.15)); x.fillStyle = '#b0a898'; x.fill();
        x.globalAlpha = 0.85; x.lineWidth = 1.2; x.stroke();
        x.globalAlpha = 0.5; x.lineWidth = 0.7; x.beginPath(); for (let k = 0; k < 5; k++) { x.moveTo(rx + 2 + k * 2.5, ry + rr * 0.6 - k); x.lineTo(rx + rr * 0.7, ry + 2 - k * 2.5); } x.stroke();
      }
      x.globalAlpha = 1;
    });
  }
  function grain(scale) {
    return AS.cached('ink-grain', W, H, scale, (x) => {
      for (let i = 0; i < 16000; i++) { x.fillStyle = rand(i, 1) > 0.5 ? 'rgba(90,70,40,0.07)' : 'rgba(255,255,255,0.08)'; x.fillRect(rand(i, 2) * W, rand(i, 3) * H, 1.2, 1.2); }
      const g = x.createRadialGradient(W / 2, H / 2, 190, W / 2, H / 2, 410); g.addColorStop(0, 'rgba(120,80,40,0)'); g.addColorStop(1, 'rgba(120,80,40,0.28)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    });
  }
  function inkActor(ctx, a, S) {
    const boil = Math.floor(S.t * 6), h = hash(a.id), [rad] = AS.SIZE[a.kind];
    const parts = world(a);
    ctx.save(); ctx.globalAlpha = a.alpha;
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath(); ctx.ellipse(a.x + 2, a.y + 1, rad * 1.05, rad * 0.32, 0, 0, TAU); ctx.fillStyle = 'rgba(120,100,80,0.28)'; ctx.fill();
    // washes, offset from the line work like a hand-coloured print
    for (const [i, { p, w }] of parts.entries()) {
      if (p.line) continue;
      const col = colorOf(IP, a, p.role);
      if (p.role === 'eye' || p.role === 'eyeWhite') continue;
      const ww = wob(w, h + i, 1.2).map(([x, y]) => [x + 1.4, y + 1.1]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); AS.path(ctx, ww, true, !p.sharp); ctx.fillStyle = col; ctx.globalAlpha = a.alpha * 0.9; ctx.fill();
      // pigment pooling at the edge + a lighter bloom inside
      ctx.globalAlpha = a.alpha * 0.45; ctx.lineWidth = 1.6; ctx.strokeStyle = mix(col, '#2a1a10', 0.3); ctx.stroke();
      if (p.big) {
        const xs = ww.map((q) => q[0]), ys = ww.map((q) => q[1]);
        const mx = Math.min(...xs) * 0.6 + Math.max(...xs) * 0.4, my = Math.min(...ys) * 0.65 + Math.max(...ys) * 0.35, rr = (Math.max(...xs) - Math.min(...xs)) * 0.4;
        ctx.save(); ctx.clip(); ctx.globalAlpha = a.alpha * 0.4; bloom(ctx, mx, my, rr, '#fff8ea', 0.9); ctx.restore();
      }
      if (a.wet && p.big) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = a.alpha * 0.4 * a.wet; ctx.fillStyle = '#7ab0e8'; ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a.alpha;
    // ink linework (two sketchy passes)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = SEPIA;
    for (const [i, { p, w }] of parts.entries()) {
      if (p.role === 'eyeWhite') continue;
      if (p.role === 'eye') { ctx.beginPath(); AS.path(ctx, w); ctx.fillStyle = SEPIA; ctx.fill(); continue; }
      if (p.line) { ctx.beginPath(); AS.partPath(ctx, p, wob(w, h + i + boil, 0.8)); ctx.lineWidth = Math.max(1.2, p.w * 0.7); ctx.strokeStyle = p.role === 'string' ? hexA(SEPIA, 0.6) : SEPIA; ctx.stroke(); ctx.strokeStyle = SEPIA; continue; }
      ctx.beginPath(); AS.partPath(ctx, p, wob(w, h + i * 3 + boil, 0.9)); ctx.lineWidth = p.big ? 1.25 : 0.9; ctx.stroke();
      if (p.big) { ctx.globalAlpha = a.alpha * 0.45; ctx.beginPath(); AS.partPath(ctx, p, wob(w, h + i * 7 + boil + 1, 1.6)); ctx.lineWidth = 0.7; ctx.stroke(); ctx.globalAlpha = a.alpha; }
    }
    // a few hatching strokes on the shadow side of the body
    const body = parts.find((q) => q.p.big);
    if (body) {
      ctx.save(); ctx.beginPath(); AS.partPath(ctx, body.p, body.w); ctx.clip();
      ctx.globalAlpha = a.alpha * 0.35; ctx.lineWidth = 0.7;
      const xs = body.w.map((q) => q[0]), ys = body.w.map((q) => q[1]), mx = Math.max(...xs), my = Math.max(...ys), mnY = Math.min(...ys);
      ctx.beginPath(); for (let k = 0; k < 7; k++) { const yy = mnY + (my - mnY) * (k / 7); ctx.moveTo(mx - 7, yy + 6); ctx.lineTo(mx + 2, yy - 3); } ctx.stroke();
      ctx.restore();
    }
    if (a.hit > 0) { ctx.globalAlpha = a.alpha * a.hit * 0.7; ctx.fillStyle = '#fff6f0'; for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.path(ctx, w); ctx.fill(); } ctx.globalAlpha = a.alpha; }
    if (a.frozen > 0) {
      const [r, hh0] = AS.SIZE[a.kind], hh = (hh0 + 8) * a.frozen, x0 = a.x - r - 5, y0 = a.y + 5 - hh, w0 = 2 * r + 10;
      const ice = wob([[x0 + 2, y0 + 3], [x0 + w0 * 0.45, y0], [x0 + w0, y0 + 5], [x0 + w0 + 1, y0 + hh * 0.6], [x0 + w0 - 2, y0 + hh], [x0 + 2, y0 + hh], [x0 - 1, y0 + hh * 0.4]], h + boil, 1.4);
      ctx.globalCompositeOperation = 'multiply'; ctx.beginPath(); polyPath(ctx, ice); ctx.fillStyle = 'rgba(150,215,240,0.6)'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a.alpha * 0.55; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.globalAlpha = a.alpha;
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#1f4a66'; ctx.stroke();
      ctx.save(); ctx.clip(); ctx.lineWidth = 0.7; ctx.globalAlpha = a.alpha * 0.6; ctx.beginPath();
      for (let k = 0; k < 6; k++) { ctx.moveTo(x0 + w0 - 2, y0 + 6 + k * 5); ctx.lineTo(x0 + w0 - 12, y0 + 16 + k * 5); } ctx.stroke(); ctx.restore();
      if (a.crack > 0) { ctx.globalAlpha = a.alpha; ctx.strokeStyle = '#1f4a66'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5 * a.crack; i++) { const cx = x0 + w0 * rand(i, 61), cy = y0 + hh * rand(i, 62); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rand(i, 63) - 0.5) * 20, cy + (rand(i, 64) - 0.5) * 20); } ctx.stroke(); }
    }
    ctx.restore();
  }
  function bloom(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(col, a)); g.addColorStop(0.65, hexA(col, a * 0.55)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function inkRender(ctx, S, scale) {
    const t = S.t, E = IP.el, boil = Math.floor(t * 6);
    ctx.drawImage(inkGround(scale), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // scorched grass: grey-brown wash + ink scribble
    const F = S.fire;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.55; ctx.beginPath(); AS.path(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 26, 0.18)); ctx.fillStyle = '#8a7a66'; ctx.fill();
    ctx.globalAlpha = 0.5; bloom(ctx, F.x, F.y - 4, F.rx * 0.9, '#ff9a3a', 0.6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // puddle: blue wash with pooled edge; ice: pale wash + ink facets
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 30, 0.1);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.6; ctx.beginPath(); AS.path(ctx, pud); ctx.fillStyle = '#7fb0e0'; ctx.fill();
    ctx.globalAlpha = 0.6; ctx.lineWidth = 2.5; ctx.strokeStyle = '#4f86c6'; ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); AS.path(ctx, wob(pud, boil, 1)); ctx.lineWidth = 1.1; ctx.strokeStyle = hexA(SEPIA, 0.75); ctx.stroke();
    ctx.save(); ctx.beginPath(); AS.path(ctx, pud); ctx.clip();
    ctx.strokeStyle = hexA('#2a5a90', 0.55); ctx.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); const fx = iceFrontPath(ctx, P, 6); ctx.fillStyle = 'rgba(232,248,252,0.85)'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = hexA('#1f4a66', 0.7); ctx.lineWidth = 0.8; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; ctx.moveTo(cx, cy); ctx.lineTo(cx + 14, cy - 6); ctx.lineTo(cx + 22, cy + 3); }
      ctx.stroke();
      if (P.crack > 0) { ctx.lineWidth = 1.2; ctx.strokeStyle = '#1f4a66'; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore();
      bloom(ctx, fx, P.y, 26, E.cold, 0.35 * (1 - P.front * 0.6));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // fire tongues: bright washes with ink outlines
    ctx.globalCompositeOperation = 'multiply';
    for (const f of S.tongues) { ctx.globalAlpha = 0.75; ctx.beginPath(); teardrop(ctx, f.x + 1.5, f.y + 1, f.w, f.h, f.sway); ctx.fillStyle = f.r > 0.5 ? '#ff7a2a' : '#ffb03a'; ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    for (const f of S.tongues) { ctx.globalAlpha = 0.9; ctx.beginPath(); teardrop(ctx, f.x, f.y, f.w * 0.5, f.h * 0.55, f.sway * 0.5); ctx.fillStyle = '#ffe27a'; ctx.fill(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = SEPIA; ctx.lineWidth = 1.1;
    for (const [j, f] of S.tongues.entries()) if (j % 2 === 0) { ctx.beginPath(); teardrop(ctx, f.x, f.y, f.w, f.h, f.sway); ctx.stroke(); }
    for (const a of S.actors) inkActor(ctx, a, S);
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2, 6); ctx.fillStyle = hexA(E.water, 0.6); ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = SEPIA; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // flames + smoke curls + embers
    for (const f of [...S.flames, ...S.impFlames]) { if (f.size < 0.6) continue; bloom(ctx, f.x, f.y - f.size, f.size * 2.4, f.r > 0.5 ? '#ff5a1a' : '#ffa21a', 0.55); }
    for (const [i, s] of S.smoke.entries()) {
      ctx.globalAlpha = 0.18 * (1 - s.age); ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 0.6, 0, TAU); ctx.fillStyle = '#6a625a'; ctx.fill();
      if (i % 2 === 0) { ctx.globalAlpha = 0.6 * Math.sin(s.age * Math.PI); ctx.lineWidth = 0.9; ctx.strokeStyle = SEPIA; ctx.beginPath(); for (let k = 0; k <= 14; k++) { const a = k * 0.55 + s.r * 6, r = s.size * 0.5 * (1 - k / 18); const px = s.x + Math.cos(a) * r, py = s.y + Math.sin(a) * r; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (const e of S.embers) { ctx.beginPath(); ctx.arc(e.x, e.y, 1.3, 0, TAU); ctx.fillStyle = e.r > 0.5 ? '#d8401a' : SEPIA; ctx.fill(); }
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.5; bloom(ctx, m.x, m.y, m.size, '#ffffff', 0.6); }
    ctx.globalAlpha = 1;
    // sprays
    for (const [i, p] of S.spray.parts.entries()) {
      const k = 1 - seg(p.age, 0.75, 1);
      if (p.kind === 'water') { bloom(ctx, p.x, p.y, (4 + p.size) * k, E.water, 0.45); if (i % 3 === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * k, 0, TAU); ctx.lineWidth = 0.8; ctx.strokeStyle = SEPIA; ctx.stroke(); } continue; }
      bloom(ctx, p.x, p.y, (5 + p.size * 1.6) * k, E.cold, 0.42);
      if (i % 3 === 0 && p.age < 0.8) { ctx.strokeStyle = '#1f4a66'; ctx.lineWidth = 0.9; ctx.beginPath(); for (let q = 0; q < 3; q++) { const a = p.rot + q * Math.PI / 3, r = 3.2; ctx.moveTo(p.x - Math.cos(a) * r, p.y - Math.sin(a) * r); ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } ctx.stroke(); }
    }
    if (S.spray.cold > 0) bloom(ctx, S.spray.x, S.spray.y, 18, E.cold, 0.6 * S.spray.cold);
    // beam: vivid wash with inked edges
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 22, 2.4 * o, 0.7, 18);
      ctx.globalAlpha = 0.22; ctx.lineWidth = 30 * o; ctx.strokeStyle = E.arcane; strokePts(ctx, pts);
      ctx.globalAlpha = 0.55; ctx.lineWidth = 13 * o; strokePts(ctx, pts);
      ctx.globalAlpha = 1; ctx.lineWidth = 4.5 * o; ctx.strokeStyle = '#fff0f6'; strokePts(ctx, pts);
      const dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      ctx.lineWidth = 1; ctx.strokeStyle = SEPIA; ctx.globalAlpha = 0.8;
      for (const sgn of [-1, 1]) strokePts(ctx, wob(pts.map(([x, y]) => [x + nx * 7.5 * o * sgn, y + ny * 7.5 * o * sgn]), boil + sgn, 1.2));
      ctx.globalAlpha = 1;
      bloom(ctx, B.x2, B.y2, 34 * o, E.arcane, 0.55);
      for (let i = 0; i < 14; i++) { const a = rand(boil, i) * TAU, r = 10 + rand(boil, i, 2) * 26; ctx.beginPath(); ctx.arc(B.x2 + Math.cos(a) * r, B.y2 + Math.sin(a) * r, 0.8 + rand(boil, i, 3) * 2.2, 0, TAU); ctx.fillStyle = hexA(E.arcane, 0.8); ctx.fill(); }
      ctx.strokeStyle = SEPIA; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + boil; ctx.moveTo(B.x2 + Math.cos(a) * 14, B.y2 + Math.sin(a) * 14); ctx.lineTo(B.x2 + Math.cos(a) * 22, B.y2 + Math.sin(a) * 22); } ctx.stroke();
      bloom(ctx, B.x1, B.y1, 16 * o, E.arcane, 0.7);
      for (const s of S.beamSparks) { ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 * (1 - s.age) + 0.6, 0, TAU); ctx.fillStyle = s.r > 0.5 ? E.arcane : SEPIA; ctx.fill(); }
    }
    // ward: golden wash ring + inked runes
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    const rg = ctx.createRadialGradient(Wd.x, Wd.y, wr * 0.55, Wd.x, Wd.y, wr + 2);
    rg.addColorStop(0, hexA(E.shield, 0)); rg.addColorStop(0.85, hexA(E.shield, 0.32 + Wd.pulse * 0.3)); rg.addColorStop(1, hexA(E.shield, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr + 2, 0, TAU); ctx.fill();
    ctx.beginPath(); AS.path(ctx, wob(AS.ell(Wd.x, Wd.y, wr, wr, 28), boil, 1.2)); ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(SEPIA, 0.85); ctx.stroke();
    ctx.font = 'italic 11px "IM Fell English", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#8a5a10';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹ';
    for (let i = 0; i < 8; i++) { const a = t * 0.5 + i / 8 * TAU; ctx.fillText(runes[i], Wd.x + Math.cos(a) * (wr - 7), Wd.y + Math.sin(a) * (wr - 7)); }
    for (const s of S.wardSparks) { ctx.beginPath(); ctx.arc(s.x, s.y, 2 * (1 - s.age) + 0.5, 0, TAU); ctx.fillStyle = s.r > 0.5 ? '#e0a010' : SEPIA; ctx.fill(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.strokeStyle = SEPIA; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
      c.beginPath(); polyPath(c, [[14, 0], [8, -3.5], [8, 3.5]]); c.fillStyle = SEPIA; c.fill();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -4); c.moveTo(-12, 0); c.lineTo(-16, -4); c.moveTo(-14, 0); c.lineTo(-18, 4); c.moveTo(-12, 0); c.lineTo(-16, 4); c.stroke();
    });
    for (const s of S.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]); ctx.fillStyle = 'rgba(170,225,245,0.8)'; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = '#1f4a66'; ctx.stroke(); ctx.restore(); }
    // numbers: inked italic with a colour wash behind
    const NC = { arcane: '#c0145e', crit: '#c0145e', fire: '#c2410c', cold: '#0e6a96', water: '#1d5fa8', shield: '#8a5a10' };
    const NW = { arcane: E.arcane, crit: '#ffcc22', fire: '#ff8a2a', cold: E.cold, water: E.water, shield: E.shield };
    for (const n of S.numbers) {
      const size = (n.big ? 24 : 19) * n.pop;
      ctx.save(); ctx.globalAlpha = n.alpha; ctx.translate(n.x, n.y);
      ctx.font = `italic ${size}px "IM Fell English", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(n.text).width;
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = n.alpha * 0.4; ctx.beginPath(); ctx.ellipse(1, 2, tw * 0.6 + 4, size * 0.45, -0.1, 0, TAU); ctx.fillStyle = NW[n.kind]; ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = n.alpha;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(248,240,224,0.9)'; ctx.strokeText(n.text, 0, 0); ctx.fillStyle = NC[n.kind]; ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    // HUD: parchment cartouches
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 4); ctx.fillStyle = 'rgba(246,236,214,0.92)'; ctx.fill();
      ctx.beginPath(); AS.path(ctx, wob([[h.x, h.y], [h.x + h.w, h.y], [h.x + h.w, h.y + h.h], [h.x, h.y + h.h]], h.x + boil, 1.4), true, false); ctx.lineWidth = 1.3; ctx.strokeStyle = SEPIA; ctx.stroke();
      ctx.beginPath(); ctx.rect(h.x + 3, h.y + 3, h.w - 6, h.h - 6); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.font = 'italic 17px "IM Fell English", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = IP[h.team].robe; ctx.fillText(h.name, h.x + 18, h.y + 18);
      ctx.strokeStyle = SEPIA; ctx.lineWidth = 0.8; ctx.strokeRect(h.x + 38, h.y + 25, 140, 5);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(200,60,50,0.75)'; ctx.fillRect(h.x + 39, h.y + 26, 138 * h.hp, 3); ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 13, q = h.queue[i];
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.setLineDash([2, 2.5]); ctx.lineWidth = 0.8; ctx.strokeStyle = hexA(SEPIA, 0.5); ctx.stroke(); ctx.setLineDash([]); continue; }
        const r = 9 * ease.back(q.pop);
        bloom(ctx, cx, cy, r * 1.3, E[q.el], 0.75);
        AS.glyph(ctx, q.el, cx, cy, r * 0.7); ctx.lineWidth = 1; ctx.strokeStyle = SEPIA; ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(grain(scale), 0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  }
  AS.register({
    id: 'ink', name: 'Storybook Ink & Watercolor',
    refs: ['Ori (concept art)', 'Gris', 'Child of Light'],
    feel: 'Cream paper, loose sepia linework that boils gently, and translucent washes that sit slightly off the lines like a hand-coloured print. The world is muted and earthy so the magic can be the only truly saturated thing on the page: hot pink beams, cyan frost blooms, orange fire.',
    notes: {
      read: ['Medium to weak', 'Magic pops beautifully against muted ground, but a light background swallows bright additive effects, and thin lines get lost at small sizes or when the camera zooms out.'],
      tone: ['Leans whimsical', 'Fairy-tale rather than slapstick. Lovely for a story campaign, softer than Magicka\'s chaos.'],
      cost: ['High', 'Hand-painted textures and inked VFX are slow to make, and keeping linework consistent across animation needs shader work or lots of frames.'],
    },
    render: inkRender,
  });
})();
