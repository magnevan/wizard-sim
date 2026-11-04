/* Round 2, Bold Toon family: Toon Dusk, Toon Coded, Toon Vinyl.
 * Loads after styles-a.js (needs AS.util). Each variant is a full renderer of
 * AS.scene() data, registered with family: 'toon', round: 2.
 *
 * New in round 2: S.beam.payload (['fire']). The arcane beam carries Fire, and
 * S.brute.burning ramps up while it is on. Every variant draws that payload
 * on the beam itself and shows the burn catching where the beam lands. */
(function () {
  if (!window.AS || !AS.util) return;
  const { W, H, TAU, clamp, lerp, seg, rand, hexA, mix, ease, mod } = AS;
  const { world, colorOf, teardrop, blobPts, iceFrontPath, polyPath, beamPts, strokePts, starPath, arrowShape } = AS.util;
  const INK = '#2a1d34';

  // =====================================================================
  // shared helpers (local to this file)
  // =====================================================================
  function soft(ctx, x, y, r, col, a) {
    if (r <= 0.5 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(col, a)); g.addColorStop(0.4, hexA(col, a * 0.45)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function merged(ctx, items, shape, layers) {
    for (const L of layers) {
      ctx.beginPath();
      for (const it of items) shape(ctx, it, L.k);
      if (L.stroke) { ctx.lineWidth = L.stroke; ctx.strokeStyle = L.color; ctx.stroke(); } else { ctx.fillStyle = L.color; ctx.fill(); }
    }
  }
  function frame(B) {
    const dx = B.x2 - B.x1, dy = B.y2 - B.y1, L = Math.hypot(dx, dy) || 1;
    return { dx, dy, L, ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L };
  }
  // Payload riders: motes that flow from caster to target along a two-strand helix
  // wrapped around the beam. Pure function of time; the strands stay put, motes slide.
  function riders(B, t, D, o) {
    const f = frame(B), n = Math.round(clamp(o.n * Math.sqrt(D), o.min || 4, o.max || 20)), out = [];
    for (let k = 0; k < n; k++) {
      const p = mod(t * o.speed + k / n, 1);
      const ph = p * o.turns * TAU + (k % 2 ? Math.PI : 0);
      const env = Math.min(1, p / 0.1) * (1 - seg(p, 0.88, 1) * 0.7);
      const off = Math.sin(ph) * o.amp * (0.35 + 0.65 * Math.sin(p * Math.PI));
      out.push({ x: B.x1 + f.dx * p + f.nx * off, y: B.y1 + f.dy * p + f.ny * off, p, front: Math.cos(ph) > 0, s: env * B.on, k });
    }
    return out;
  }
  // Where fire sits on a burning brute, in local units. The first anchor is where the
  // beam lands (local +x faces the caster), so the burn visibly spreads from the hit.
  const BURN = [[22, -34, 0.85], [11, -50, 0.95], [-1, -64, 1.15], [-15, -45, 1], [-27, -29, 0.8], [5, -20, 0.75]];
  function burnFlames(a, t) {
    const b = a.burning; if (b <= 0.01) return [];
    const f = AS.xf(a), out = [];
    for (let i = 0; i < BURN.length; i++) {
      const grow = clamp(b * BURN.length * 1.15 - i); if (grow <= 0) break;
      const [lx, ly, sz] = BURN[i], [x, y] = f([lx, ly]);
      const fl = 0.8 + 0.2 * Math.sin(t * TAU * 3.3 + i * 1.9) + 0.1 * Math.sin(t * TAU * 7.1 + i);
      out.push({ x, y, w: 5.6 * sz * ease.out(grow), h: 18 * sz * ease.out(grow) * fl, sway: Math.sin(t * TAU * 2 + i) * 2.5, i });
    }
    return out;
  }
  function burnSparks(a, t, D) {
    const b = a.burning; if (b <= 0.05) return [];
    const f = AS.xf(a), m = Math.round(clamp(5 * D * b, 1, 16)), out = [];
    for (let j = 0; j < m; j++) {
      const age = mod(t * 1.3 + rand(91, j), 1), [lx, ly] = BURN[j % Math.max(1, Math.ceil(b * BURN.length))];
      const [x, y] = f([lx, ly]);
      out.push({ x: x + Math.sin(age * 6 + j) * 4, y: y - 10 - age * 34, age, r: rand(92, j) });
    }
    return out;
  }
  // Brute, imp, etc. eye positions in local units (for glows / gloss).
  const EYES = { goblin: [[-1.2, -25], [5.4, -25]], archer: [[-0.2, -25], [5.8, -25]], brute: [[-2.2, -54], [6.8, -54]], imp: [[-0.8, -22], [4.2, -22]], wizard: [[-2.8, -33.5], [3.2, -33.5]] };
  function bbox(w) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of w) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function hexPath(ctx, x, y, r, rot = 0) {
    for (let i = 0; i < 6; i++) { const a = rot + i / 6 * TAU; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function groundPath() {
    const path = [];
    for (let i = 0; i <= 24; i++) { const px = -20 + i * 30; path.push([px, 214 + Math.sin(i * 0.55) * 18 + (px > 360 ? (px - 360) * 0.12 : 0)]); }
    return path;
  }
  const ROCKS = [[40, 40, 14], [610, 60, 18], [400, 30, 10], [30, 330, 12], [610, 388, 12], [395, 345, 9]];
  // The Bold Toon meadow, parameterised so each variant can re-light or re-tone it.
  function paintGround(x, g) {
    x.fillStyle = g.base; x.fillRect(0, 0, W, H);
    x.lineJoin = 'round'; x.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      x.beginPath(); polyPath(x, blobPts(rand(i, 1) * W, rand(i, 2) * H, 60 + rand(i, 3) * 70, 26 + rand(i, 4) * 30, i * 3.1, 28, 0.25));
      x.fillStyle = i % 3 ? g.blobA : g.blobB; x.fill();
    }
    const path = groundPath();
    x.beginPath(); x.moveTo(path[0][0], path[0][1] - 20);
    for (const [px, py] of path) x.lineTo(px, py - 20 + Math.sin(px * 0.07) * 2);
    for (let i = path.length - 1; i >= 0; i--) x.lineTo(path[i][0], path[i][1] + 20 + Math.sin(path[i][0] * 0.05) * 3);
    x.closePath();
    if (g.pathShadow) { x.save(); x.translate(0, 3); x.fillStyle = g.pathShadow; x.fill(); x.restore(); }
    x.fillStyle = g.path; x.fill();
    if (g.pathEdge) { x.lineWidth = g.pathEdgeW || 3; x.strokeStyle = g.pathEdge; x.stroke(); }
    for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(rand(i, 7) * W, 200 + rand(i, 8) * 40, 1.5 + rand(i, 9) * 2, 0, TAU); x.fillStyle = g.pebble; x.fill(); }
    for (let i = 0; i < 70; i++) {
      const gx = rand(i, 11) * W, gy = rand(i, 12) * H;
      if (gy > 188 && gy < 240) continue;
      if (g.softTufts) {
        x.fillStyle = g.tuft;
        for (const [ox, rr] of [[-4, 3.2], [0, 4.2], [4, 3.2]]) { x.beginPath(); x.ellipse(gx + ox, gy - rr * 0.6, rr * 0.7, rr * 1.2, 0, 0, TAU); x.fill(); }
      } else {
        x.strokeStyle = g.tuft; x.lineWidth = 2;
        x.beginPath(); x.moveTo(gx - 5, gy - 6); x.lineTo(gx - 2, gy); x.lineTo(gx, gy - 9); x.lineTo(gx + 2, gy); x.lineTo(gx + 5, gy - 6); x.stroke();
      }
    }
    if (g.flowers) for (let i = 0; i < 14; i++) {
      const fx = rand(i, 21) * W, fy = rand(i, 22) * H;
      if (fy > 188 && fy < 240) continue;
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; x.beginPath(); x.arc(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.4, 0, TAU); x.fillStyle = g.flowers[i % g.flowers.length]; x.fill(); }
      x.beginPath(); x.arc(fx, fy, 1.8, 0, TAU); x.fillStyle = g.flowerMid; x.fill();
    }
    for (const [rx, ry, rr] of ROCKS) {
      if (g.rockShadow) { x.beginPath(); x.ellipse(rx + 2, ry + rr * 0.6, rr * 1.1, rr * 0.38, 0, 0, TAU); x.fillStyle = g.rockShadow; x.fill(); }
      x.beginPath(); polyPath(x, blobPts(rx, ry, rr, rr * 0.75, rx, 14, 0.15)); x.fillStyle = g.rock; x.fill();
      if (g.rockEdge) { x.lineWidth = 3; x.strokeStyle = g.rockEdge; x.stroke(); }
      x.beginPath(); x.ellipse(rx - rr * 0.3, ry - rr * 0.3, rr * 0.35, rr * 0.2, -0.4, 0, TAU); x.fillStyle = g.rockHi; x.fill();
    }
  }
  // Bold Toon puddle + freeze front, with colours and an optional hex-cell ice texture.
  function toonPuddle(ctx, S, c) {
    const t = S.t, P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 34, 0.1);
    ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = c.water; ctx.fill();
    ctx.save(); ctx.beginPath(); polyPath(ctx, pud); ctx.clip();
    ctx.strokeStyle = c.ripple; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); const fx = iceFrontPath(ctx, P, 6); ctx.fillStyle = c.ice; ctx.fill();
      ctx.save(); ctx.clip();
      if (c.hex) {
        ctx.strokeStyle = c.iceHi; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let gx = P.x - P.rx - 10; gx < P.x + P.rx + 10; gx += 15) for (let gy = P.y - P.ry - 10, r = 0; gy < P.y + P.ry + 10; gy += 13, r++) hexPath(ctx, gx + (r % 2) * 7.5, gy, 7.2, 0);
        ctx.stroke();
      } else {
        ctx.fillStyle = c.iceHi;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); const cx = P.x - P.rx + rand(i, 71) * 2 * P.rx, cy = P.y - P.ry + rand(i, 72) * 2 * P.ry; polyPath(ctx, [[cx, cy - 8], [cx + 14, cy - 2], [cx + 4, cy + 7]]); ctx.fill(); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const cx = P.x - P.rx + 20 + i * 38; ctx.beginPath(); ctx.moveTo(cx, P.y + 8); ctx.lineTo(cx + 12, P.y - 6); ctx.stroke(); }
      }
      if (P.crack > 0) { ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore();
      if (P.front < 1) { ctx.beginPath(); ctx.moveTo(fx, P.y - P.ry); for (let i = 0; i <= 9; i++) ctx.lineTo(fx + (i % 2 ? 6 : -6) * (0.6 + rand(i, 3) * 0.6), P.y - P.ry - 4 + (i / 9) * (2 * P.ry + 8)); ctx.lineWidth = 2.5; ctx.strokeStyle = c.ink; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.beginPath(); polyPath(ctx, pud); ctx.lineWidth = 3.5; ctx.strokeStyle = c.ink; ctx.stroke();
  }
  // Ink-outlined toon actor. o.light {dx,dy,rim,rimA} turns the cel shadow toward a light.
  function inkActor(ctx, a, o) {
    const parts = world(a);
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = o.ink;
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.line ? p.w + 5.5 : 6; ctx.stroke(); }
    const Lt = o.light, sx = Lt ? Lt.dx * 3.2 : -2.6 * a.face, sy = Lt ? Lt.dy * 3.2 : -2.6;
    const R = [a.x - 80, a.y - 115, 160, 135];
    for (const { p, w } of parts) {
      const base = colorOf(o.pal, a, p.role), col = o.tone ? o.tone(base) : base;
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w; ctx.stroke(); continue; }
      ctx.fillStyle = col; ctx.fill();
      if (p.big) {
        ctx.save(); ctx.clip();
        // cel shadow: everything outside a copy nudged toward the light
        ctx.beginPath(); ctx.rect(...R); ctx.save(); ctx.translate(sx, sy); AS.partPath(ctx, p, w); ctx.restore();
        ctx.fillStyle = mix(col, o.shadeTo || INK, o.shadeAmt || 0.28); ctx.fill('evenodd');
        if (Lt && Lt.rimA > 0.04) {
          ctx.beginPath(); ctx.rect(...R); ctx.save(); ctx.translate(-Lt.dx * 2.4, -Lt.dy * 2.4); AS.partPath(ctx, p, w); ctx.restore();
          ctx.fillStyle = hexA(Lt.rim, Lt.rimA); ctx.fill('evenodd');
        }
        if (a.wet) { ctx.fillStyle = hexA(o.wetCol || '#2f8cff', 0.3 * a.wet); ctx.fillRect(...R); }
        ctx.restore();
        ctx.beginPath(); AS.partPath(ctx, p, w);
      }
      if (p.role !== 'eye') { ctx.strokeStyle = o.ink; ctx.lineWidth = 1.8; ctx.stroke(); }
      if (p.role === 'orb') { ctx.beginPath(); ctx.arc(w[0][0] - 1.6 * a.face, w[0][1] - 1.6, 1.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
    if (a.hit > 0) {
      ctx.globalAlpha = a.alpha * a.hit * (o.hitA || 0.85); ctx.fillStyle = o.hitCol || '#fff';
      for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); }
      ctx.globalAlpha = a.alpha;
    }
    if (a.frozen > 0 && o.ice) o.ice(ctx, a);
    ctx.restore();
  }
  function crackLines(ctx, x, y, w, hh, crack, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    const n = Math.ceil(crack * 5);
    for (let i = 0; i < n; i++) { const cx = x + w * rand(i, 61), cy = y + hh * rand(i, 62); ctx.moveTo(cx, cy); ctx.lineTo(cx + (rand(i, 63) - 0.5) * 18, cy + (rand(i, 64) - 0.5) * 18); ctx.lineTo(cx + (rand(i, 65) - 0.5) * 26, cy + (rand(i, 66) - 0.5) * 26); }
    ctx.stroke();
  }
  function iceBox(a) { const [r, h] = AS.SIZE[a.kind], hh = (h + 8) * a.frozen; return { x: a.x - r - 4, y: a.y + 5 - hh, w: 2 * r + 8, hh }; }
  // Base Bold Toon palette (round 1), copied so this file stays independent.
  const TOON = {
    p1: { robe: '#ec4338', trim: '#ffd04a', sleeve: '#c92f2a', hat: '#ec4338', band: '#ffd04a' },
    p2: { robe: '#3b7ff2', trim: '#c4e6ff', sleeve: '#2a5fc8', hat: '#3b7ff2', band: '#c4e6ff' },
    wizard: { skin: '#ffd3a8', beard: '#f7f3ea', staff: '#8f5c33', hand: '#ffd3a8' },
    goblin: { body: '#7cc244', belly: '#bfe581', dark: '#3f6a2a', club: '#9a6a3a' },
    archer: { body: '#7cc244', cloth: '#8a5a8e', dark: '#3f6a2a', bow: '#b07a3c', string: '#fff', arrow: '#e8d4ae', hand: '#7cc244' },
    brute: { body: '#c96d4c', belly: '#f2b48c', dark: '#5e3121', horn: '#f6eedc', brow: INK },
    imp: { body: '#a458dc', wing: '#6c2fa0', horn: '#ffe2a2', tail: '#6c2fa0' },
    common: { eye: INK, eyeWhite: '#fffbe6', tooth: '#ffffff' },
  };
  // Always unwind the ctx, even if a frame throws, so no state leaks into other cards.
  const safe = (fn) => (ctx, S, scale) => { ctx.save(); try { fn(ctx, S, scale); } finally { ctx.restore(); } };
  const over = (base, o) => { const r = {}; for (const k of new Set([...Object.keys(base), ...Object.keys(o)])) r[k] = Object.assign({}, base[k], o[k]); return r; };
  function toonText(ctx, n, fill, stroke, lw, font) {
    const size = (n.big ? 25 : 19) * n.pop;
    ctx.save(); ctx.globalAlpha = n.alpha; ctx.translate(n.x, n.y); ctx.rotate((rand(n.x | 0, 3) - 0.5) * 0.25);
    ctx.font = `${size}px ${font || '"Lilita One", "Arial Rounded MT Bold", sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(n.text, 0, 0); ctx.fillStyle = fill; ctx.fillText(n.text, 0, 0);
    ctx.restore();
  }

  // =====================================================================
  // 1. TOON DUSK: Bold Toon characters in a dim world lit by the spells
  // =====================================================================
  const DE = { fire: '#ff7a2a', water: '#3a8cff', cold: '#9eeaff', arcane: '#ff3d8b', shield: '#ffd23f' };
  const DUSK = over(TOON, { el: DE });
  const NIGHT = '#1d1a3a';
  const G_DUSK = { base: '#5aa04a', blobA: '#4f9242', blobB: '#6cb456', path: '#d8b67e', pathEdge: hexA(INK, 0.55), pebble: '#b8955e', tuft: hexA(INK, 0.5), flowers: ['#fff', '#ffd6ef'], flowerMid: '#ffcf3a', rock: '#a7a2b4', rockEdge: INK, rockHi: '#d4d0de' };
  let duskLC = null;
  function duskLights(S) {
    const L = [], [p1, p2] = S.players;
    L.push({ x: S.fire.x, y: S.fire.y - 10, r: 200, c: '#ff8a3a', a: 0.95, fl: 1 });
    L.push({ x: S.imp.x, y: S.imp.y - 14, r: 80, c: '#ff9a4a', a: 0.6, fl: 1 });
    L.push({ x: S.ward.x, y: S.ward.y, r: 100, c: '#ffd36a', a: 0.42 + S.ward.pulse * 0.45 });
    for (const p of [p1, p2]) L.push({ x: p.x, y: p.y - 20, r: 70, c: '#ffe8c8', a: 0.3 });
    const tip1 = AS.staffTip(p1), tip2 = AS.staffTip(p2);
    L.push({ x: tip1[0], y: tip1[1], r: 60, c: DE.arcane, a: 0.3 + 0.3 * p1.casting });
    L.push({ x: tip2[0], y: tip2[1], r: 64, c: p2.element === 'water' ? DE.water : DE.cold, a: 0.28 + 0.45 * p2.casting });
    if (S.beam) {
      const B = S.beam;
      for (let i = 0; i <= 6; i++) { const p = i / 6; L.push({ x: B.x1 + (B.x2 - B.x1) * p, y: B.y1 + (B.y2 - B.y1) * p, r: 64, c: DE.arcane, a: 0.36 * B.on }); }
      for (let i = 0; i < 6; i++) { const p = (i + 0.5) / 6; L.push({ x: B.x1 + (B.x2 - B.x1) * p, y: B.y1 + (B.y2 - B.y1) * p + 8, r: 42, c: DE.fire, a: 0.3 * B.on }); }
      L.push({ x: B.x2, y: B.y2, r: 110, c: DE.arcane, a: 0.55 * B.on });
      L.push({ x: B.x2, y: B.y2 + 6, r: 70, c: '#ff9a3a', a: 0.45 * B.on });
    }
    const br = S.brute;
    if (br.burning > 0) L.push({ x: br.x, y: br.y - 44, r: 140, c: '#ff7a2a', a: 0.85 * br.burning, fl: 1 });
    if (S.spray.cold > 0) for (let i = 1; i <= 3; i++) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * i * 55, y: S.spray.y + Math.sin(S.spray.ang) * i * 55, r: 80, c: DE.cold, a: 0.35 * S.spray.cold });
    if (S.spray.water > 0) L.push({ x: S.spray.x + Math.cos(S.spray.ang) * 90, y: S.spray.y + Math.sin(S.spray.ang) * 90, r: 90, c: DE.water, a: 0.3 * S.spray.water });
    if (S.puddle.ice > 0 && S.puddle.front > 0) L.push({ x: S.puddle.x - S.puddle.rx * (1 - S.puddle.front), y: S.puddle.y, r: 90 * S.puddle.front + 30, c: DE.cold, a: 0.3 * S.puddle.ice });
    return L;
  }
  function lightAt(L, x, y) {
    let sum = 0, best = null, bf = 0;
    for (const l of L) { const d = Math.hypot(l.x - x, l.y - y), q = clamp(1 - d / (l.r * 1.25)), f = l.a * q * q; sum += f; if (f > bf) { bf = f; best = l; } }
    return { sum, best, bf };
  }
  function duskActor(ctx, a, L) {
    const [rad, hgt] = AS.SIZE[a.kind], cx = a.x, cy = a.y - hgt * 0.45;
    const { sum, best, bf } = lightAt(L, cx, cy);
    const lv = clamp(0.42 + sum * 0.8, 0.42, 1);
    let dx = -0.6, dy = -0.8;
    if (best && bf > 0.03) { const d = Math.hypot(best.x - cx, best.y - cy) || 1; dx = (best.x - cx) / d; dy = (best.y - cy) / d; }
    const lc = best ? best.c : '#8aa0d0';
    // long soft shadow cast away from the strongest light
    ctx.save(); ctx.globalAlpha = a.alpha * 0.55;
    ctx.translate(a.x - dx * rad * 0.7, a.y + 1); ctx.scale(1, 0.34);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 1.5); g.addColorStop(0, 'rgba(6,4,14,0.85)'); g.addColorStop(1, 'rgba(6,4,14,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad * 1.5, 0, TAU); ctx.fill(); ctx.restore();
    inkActor(ctx, a, {
      pal: DUSK, ink: '#140d1e', shadeTo: '#120a24', shadeAmt: 0.5,
      tone: (c) => mix(mix(c, NIGHT, (1 - lv) * 0.78), lc, clamp(bf * 0.35, 0, 0.22)),
      light: { dx, dy, rim: mix(lc, '#ffffff', 0.35), rimA: clamp(bf * 1.8, 0, 0.95) },
      wetCol: '#3a8cff', hitCol: '#ff9cc6', hitA: 0.55,
      ice: (c, a2) => {
        const b = iceBox(a2);
        c.beginPath(); c.roundRect(b.x, b.y, b.w, b.hh, 6);
        c.fillStyle = 'rgba(120,220,255,0.5)'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = '#140d1e'; c.stroke();
        c.save(); c.clip();
        c.strokeStyle = 'rgba(225,250,255,0.9)'; c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(b.x + 5, b.y + 16); c.lineTo(b.x + 16, b.y + 5); c.moveTo(b.x + 5, b.y + 26); c.lineTo(b.x + 26, b.y + 5); c.stroke();
        c.fillStyle = 'rgba(40,110,170,0.35)'; c.fillRect(b.x + b.w * 0.62, b.y, b.w, b.hh);
        if (a2.crack > 0) crackLines(c, b.x, b.y, b.w, b.hh, a2.crack, '#140d1e', 2);
        c.restore();
      },
    });
  }
  function duskRender(ctx, S, scale) {
    const t = S.t, E = DE, D = S.D;
    ctx.save();
    ctx.drawImage(AS.cached('toon-dusk-ground', W, H, scale, (x) => paintGround(x, G_DUSK)), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = S.fire;
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 30, 0.14)); ctx.fillStyle = '#4a3428'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    toonPuddle(ctx, S, { water: '#2f86e8', ripple: 'rgba(220,240,255,0.7)', ice: '#c6efff', iceHi: '#ecfcff', ink: INK });
    // ---- light map multiplied over the ground ----
    const L = duskLights(S);
    const lw = Math.ceil(W * scale / 2), lh = Math.ceil(H * scale / 2);
    if (!duskLC) duskLC = document.createElement('canvas');
    if (duskLC.width !== lw || duskLC.height !== lh) { duskLC.width = lw; duskLC.height = lh; }
    const lx = duskLC.getContext('2d');
    lx.setTransform(scale / 2, 0, 0, scale / 2, 0, 0);
    lx.globalCompositeOperation = 'source-over'; lx.fillStyle = '#2a2e56'; lx.fillRect(0, 0, W, H);
    const moon = lx.createLinearGradient(0, 0, W * 0.7, H); moon.addColorStop(0, 'rgba(110,130,200,0.55)'); moon.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = moon; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'lighter';
    const flick = 0.9 + Math.sin(t * TAU * 3) * 0.05 + Math.sin(t * TAU * 5 + 1) * 0.05;
    for (const l of L) soft(lx, l.x, l.y, l.r, l.c, l.a * (l.fl ? flick : 1));
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(duskLC, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // ---- emissive fire tongues (light sources ignore the light map) ----
    merged(ctx, S.tongues, (c, f, k) => teardrop(c, f.x, f.y - (1 - k) * 2, f.w * k, f.h * k, f.sway * k), [
      { k: 1, stroke: 5, color: '#140d1e' }, { k: 1, color: '#ff4a1c' }, { k: 0.66, color: '#ffa024' }, { k: 0.36, color: '#fff1a0' }]);
    // ---- actors, lit by the scene's lights ----
    for (const a of S.actors) duskActor(ctx, a, L);
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2.6, 7); ctx.fillStyle = '#5aa8ff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#140d1e'; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // smoke stays dark: it is not a light
    const sm = S.smoke.filter((s) => s.age > 0.12 && s.age < 0.85);
    ctx.globalAlpha = 0.42;
    merged(ctx, sm, (c, s, k) => { const r = s.size * 0.7 * k * (1 - seg(s.age, 0.5, 0.85) * 0.7); c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }, [
      { k: 1, stroke: 3, color: 'rgba(10,6,18,0.8)' }, { k: 1, color: '#3e3650' }, { k: 0.55, color: '#4e4662' }]);
    ctx.globalAlpha = 1;
    // emissive flame particles, the imp's flames, and the brute's burn
    const fl = [...S.flames, ...S.impFlames].filter((f) => f.size > 0.6);
    const burn = burnFlames(S.brute, t);
    merged(ctx, fl, (c, f, k) => teardrop(c, f.x, f.y, f.size * k, f.size * 2.6 * k), [
      { k: 1, stroke: 4, color: '#140d1e' }, { k: 1, color: '#ff5a24' }, { k: 0.55, color: '#ffe070' }]);
    merged(ctx, burn, (c, f, k) => teardrop(c, f.x, f.y + 4, f.w * k, f.h * k, f.sway * k), [
      { k: 1, stroke: 4.5, color: '#140d1e' }, { k: 1, color: '#ff4a1c' }, { k: 0.62, color: '#ffa024' }, { k: 0.32, color: '#fff1a0' }]);
    for (const e of [...S.embers, ...burnSparks(S.brute, t, D)]) { ctx.beginPath(); ctx.arc(e.x, e.y, 2.2 * (1 - e.age) + 0.8, 0, TAU); ctx.fillStyle = e.r > 0.5 ? '#fff1a0' : '#ff9a3a'; ctx.fill(); }
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.35; ctx.beginPath(); ctx.arc(m.x, m.y, m.size * 0.6, 0, TAU); ctx.fillStyle = '#bff0ff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // sprays
    const sp = S.spray.parts, water = sp.filter((p) => p.kind === 'water'), cold = sp.filter((p) => p.kind === 'cold');
    merged(ctx, water, (c, p, k) => { const r = (1.6 + p.size * 0.55) * k * (1 - seg(p.age, 0.8, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 3.5, color: '#140d1e' }, { k: 1, color: '#3a8cff' }, { k: 0.45, color: '#b0dcff' }]);
    merged(ctx, cold, (c, p, k) => { const r = (1.5 + p.size * 0.85) * k * (1 - seg(p.age, 0.7, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 4, color: '#140d1e' }, { k: 1, color: '#7fe0ff' }, { k: 0.62, color: '#f0fdff' }]);
    for (const [i, p] of cold.entries()) if (i % 4 === 0 && p.age < 0.85) { ctx.beginPath(); starPath(ctx, p.x, p.y, 6, 4.5, 1.6, p.rot); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#140d1e'; ctx.stroke(); }
    if (S.spray.water + S.spray.cold > 0) { ctx.beginPath(); ctx.arc(S.spray.x, S.spray.y, 7 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.fillStyle = S.spray.cold > 0 ? '#f0fdff' : '#b0dcff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#140d1e'; ctx.stroke(); }
    // ---- beam: pink arcane light carrying a helix of fire ----
    let rid = [];
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 22, 3 * o);
      rid = riders(B, t, D, { n: 12, speed: 0.75, turns: 3.2, amp: 13, max: 22 });
      const flame = (list) => merged(ctx, list, (c, r, k) => teardrop(c, r.x, r.y + 4, 4.4 * r.s * k, 14 * r.s * k, Math.sin(t * 20 + r.k) * 1.5 * k), [
        { k: 1, stroke: 3.5, color: '#140d1e' }, { k: 1, color: '#ff6a1c' }, { k: 0.5, color: '#ffe070' }]);
      flame(rid.filter((r) => !r.front));
      for (const [lw2, col] of [[16 * o, '#140d1e'], [12 * o, E.arcane], [6 * o, '#ffb3d1'], [2.4 * o, '#fff']]) { ctx.lineWidth = lw2; ctx.strokeStyle = col; strokePts(ctx, pts); }
      flame(rid.filter((r) => r.front));
      // impact: arcane star with fire licking out of it
      const rot = t * 6, catchF = [];
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55, h = (14 + 6 * Math.sin(t * TAU * 4 + i * 2)) * o; catchF.push({ x: B.x2 + Math.cos(a) * 9, y: B.y2 + Math.sin(a) * 6 + 6, w: 4.5 * o, h }); }
      merged(ctx, catchF, (c, f, k) => teardrop(c, f.x, f.y, f.w * k, f.h * k, 0), [{ k: 1, stroke: 4, color: '#140d1e' }, { k: 1, color: '#ff6a1c' }, { k: 0.5, color: '#ffe070' }]);
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 18 * o + Math.sin(t * 50) * 2, 8 * o, rot); ctx.fillStyle = E.arcane; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#140d1e'; ctx.stroke();
      ctx.beginPath(); starPath(ctx, B.x2, B.y2, 7, 9 * o, 4 * o, -rot); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(B.x1, B.y1, 9 * o, 0, TAU); ctx.fillStyle = '#ffb3d1'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#140d1e'; ctx.stroke();
      for (const s of S.beamSparks) {
        const fire = s.r < 0.4, L2 = 7 * (1 - s.age);
        if (fire) { ctx.beginPath(); ctx.arc(s.x, s.y - s.age * 8, 2.4 * (1 - s.age) + 0.8, 0, TAU); ctx.fillStyle = '#ffb040'; ctx.fill(); continue; }
        ctx.lineWidth = 4; ctx.strokeStyle = '#140d1e'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * L2, s.y - Math.sin(s.a) * L2); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = s.r > 0.7 ? '#fff' : E.arcane; ctx.stroke();
      }
    }
    // ward
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = hexA(E.shield, 0.1 + Wd.pulse * 0.2); ctx.fill();
    ctx.lineWidth = 4.5; ctx.strokeStyle = '#140d1e'; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffe27a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr - 6, Math.PI * 1.1, Math.PI * 1.45); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,250,220,0.8)'; ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = t * 0.8 + i / 6 * TAU; ctx.beginPath(); starPath(ctx, Wd.x + Math.cos(a) * wr, Wd.y + Math.sin(a) * wr, 4, 3.5, 1.3, 0); ctx.fillStyle = '#fff6c4'; ctx.fill(); }
    if (Wd.pulse > 0) { ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 26 + 4, 0, TAU); ctx.lineWidth = 3 * Wd.pulse; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    for (const s of S.wardSparks) { ctx.beginPath(); starPath(ctx, s.x, s.y, 4, 4.5 * (1 - s.age), 1.6 * (1 - s.age), s.a); ctx.fillStyle = s.r > 0.4 ? E.shield : '#fff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#140d1e'; ctx.stroke(); }
    // arrows (lit dimly, they are not light sources)
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.lineWidth = 5; c.strokeStyle = '#140d1e'; c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = '#d8c094'; c.stroke();
      c.beginPath(); c.moveTo(14, 0); c.lineTo(7, -4.5); c.lineTo(7, 4.5); c.closePath(); c.fillStyle = '#d8d4ea'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#140d1e'; c.stroke();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -4); c.lineTo(-10, 0); c.lineTo(-18, 4); c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.5; c.stroke();
    });
    for (const s of S.shards) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1);
      ctx.beginPath(); polyPath(ctx, [[0, -s.size], [s.size * 0.7, s.size * 0.6], [-s.size * 0.6, s.size * 0.4]]);
      ctx.fillStyle = s.r > 0.5 ? '#e6fbff' : '#8fe3ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#140d1e'; ctx.stroke(); ctx.restore();
    }
    // ---- additive bloom on everything that emits light ----
    ctx.globalCompositeOperation = 'lighter';
    soft(ctx, F.x, F.y - 8, 120, '#ff6a20', 0.3 * flick); soft(ctx, F.x, F.y - 12, 50, '#ffb050', 0.3 * flick);
    soft(ctx, S.imp.x, S.imp.y - 16, 30, '#ff8a3a', 0.4);
    for (const f of burn) soft(ctx, f.x, f.y - f.h * 0.4, f.h * 1.3, '#ff7a2a', 0.28);
    for (const a of [...S.goblins, S.brute, S.archer, S.imp]) {
      if (a.alpha < 0.3 || a.frozen > 0.5) continue;
      const f = AS.xf(a);
      for (const e of EYES[a.kind]) { const [ex, ey] = f(e); soft(ctx, ex, ey, 4.5, '#ffd84a', 0.75); }
    }
    if (S.beam) {
      const B = S.beam, o = B.on, pts = beamPts(B, t, 22, 3 * o);
      for (const [lw2, al] of [[40 * o, 0.1], [24 * o, 0.18]]) { ctx.lineWidth = lw2; ctx.strokeStyle = hexA(E.arcane, al); strokePts(ctx, pts); }
      for (const r of rid) soft(ctx, r.x, r.y - 2, 12 * r.s, '#ff8a2a', 0.45);
      soft(ctx, B.x2, B.y2, 40 * o, E.arcane, 0.45); soft(ctx, B.x2, B.y2 - 6, 28 * o, '#ff9a3a', 0.35); soft(ctx, B.x2, B.y2, 9 * o, '#ffffff', 0.6);
      soft(ctx, B.x1, B.y1, 22 * o, E.arcane, 0.8);
    } else { const [x1, y1] = AS.staffTip(S.players[0]); soft(ctx, x1, y1, 12, E.arcane, 0.6); }
    for (const p of S.spray.parts) { const k = 1 - seg(p.age, 0.75, 1); soft(ctx, p.x, p.y, (4 + p.size) * k, p.kind === 'water' ? '#3a8cff' : '#4ad0ff', p.kind === 'water' ? 0.25 : 0.22); }
    if (S.spray.cold + S.spray.water > 0) soft(ctx, S.spray.x, S.spray.y, 26, S.spray.cold > 0 ? '#7fe8ff' : '#3a8cff', 0.8);
    soft(ctx, Wd.x, Wd.y - wr * 0.2, wr * 1.2, '#ffd36a', 0.08 + Wd.pulse * 0.2);
    if (Wd.pulse > 0) soft(ctx, Wd.hitX, Wd.hitY, 30, E.shield, Wd.pulse * 0.8);
    for (const e of S.embers) soft(ctx, e.x, e.y, 5, '#ff9a3a', 0.6 * (1 - e.age));
    for (const s of S.shards) if (s.age < 0.9) soft(ctx, s.x, s.y, s.size * 1.6, '#7fe8ff', 0.4 * (1 - s.age));
    ctx.globalCompositeOperation = 'source-over';
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2 - 10, 170, W / 2, H / 2, 430);
    vg.addColorStop(0, 'rgba(8,4,20,0)'); vg.addColorStop(1, 'rgba(8,4,20,0.72)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // numbers: toon ink lettering, bright fills
    const NC = { arcane: '#ff7ab4', crit: '#ffe14a', fire: '#ffa04a', cold: '#c4f4ff', water: '#8ac8ff', shield: '#ffe14a' };
    for (const n of S.numbers) toonText(ctx, n, NC[n.kind], '#140d1e', 5.5);
    // HUD: dusk-toned cards, element tokens glow
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 12); ctx.fillStyle = '#2b2442'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0c0814'; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 13, 0, TAU); ctx.fillStyle = TOON[h.team].robe; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140, 6, 3); ctx.fillStyle = '#140d1e'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 24, 140 * h.hp, 6, 3); ctx.fillStyle = '#5fdc6a'; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 12, q = h.queue[i];
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, TAU); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke(); ctx.setLineDash([]); continue; }
        const r = 9.5 * ease.back(q.pop);
        ctx.globalCompositeOperation = 'lighter'; soft(ctx, cx, cy, r * 2, E[q.el], 0.5); ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = E[q.el]; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#0c0814'; ctx.stroke();
        AS.glyph(ctx, q.el, cx, cy, r * 0.62); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    ctx.restore();
  }
  AS.register({
    id: 'toon-dusk', name: 'Toon Dusk', family: 'toon', round: 2,
    refs: ['Bold Toon × Dark Glow', 'Don\'t Starve', 'Hades'],
    feel: 'The Bold Toon cast, ink lines and all, in a meadow at dusk where the spells are the only real light. The ground is multiplied by a light map, each character\'s cel shadow turns away from the brightest light near it and picks up a rim in that light\'s colour, and anything magical is drawn as an emissive ink shape with bloom.',
    notes: {
      read: ['Strong', 'Light does the pointing: the fight\'s focus is wherever the spells are. The payload reads twice, as a helix of ink-outlined flames riding the pink beam and as an orange light that grows on the brute while it burns. The ink line keeps bodies legible in the dark, which is what the pure Glow style lacked.'],
      tone: ['Moodier but still funny', 'The cartoon faces and slapstick shapes survive; dusk adds drama without the grim weight of full painterly dark.'],
      cost: ['Medium to high', 'Toon assets plus a 2D light map and per-light rim shading. Cheaper than painterly because the art stays flat; the lighting is a shader, not hand painting.'],
    },
    render: safe(duskRender),
  });

  // =====================================================================
  // 2. TOON CODED: one fixed colour AND one fixed shape per element
  // =====================================================================
  // Fire = flame teardrops, water = round beads + ripples, cold = hexagons,
  // arcane = rings, shield = diamonds, lightning = zigzags. Hues chosen to stay
  // apart under the common colour-vision deficiencies; shape carries the rest.
  const CC = { fire: '#ff8419', water: '#1f6fe8', cold: '#7fe1ff', arcane: '#b13cf0', shield: '#ffd23f', lightning: '#fbf8ff' };
  const CCL = { fire: '#ffe066', water: '#9cc8ff', cold: '#ffffff', arcane: '#ecc4ff', shield: '#fff4b8', lightning: '#c9b8ff' };
  const TEAM = { p1: '#ff4b3e', p2: '#2f7bff' };
  // Enemies and scenery avoid the reserved element hues (no purple imp, no orange brute).
  const CODED = over(TOON, {
    el: { fire: '#ff8419', water: '#1f6fe8', cold: '#7fe1ff', arcane: '#b13cf0', shield: '#ffd23f' },
    brute: { body: '#a07862', belly: '#d8bea4', dark: '#4e3a30', horn: '#f6eedc', brow: INK },
    imp: { body: '#7c5a62', wing: '#4e363e', horn: '#f0e0c0', tail: '#4e363e' },
    archer: { cloth: '#6e6a5a' },
  });
  const G_CODED = { base: '#a3b994', blobA: '#98af89', blobB: '#afc4a1', path: '#ddd2b8', pathEdge: hexA(INK, 0.35), pebble: '#c4b698', tuft: hexA(INK, 0.22), flowers: null, rock: '#aeaab4', rockEdge: hexA(INK, 0.7), rockHi: '#d4d0de' };
  // The shape for each element, ink-outlined, centred at x,y with radius r.
  function cglyph(ctx, el, x, y, r, rot = 0, ink = INK, lw = 2) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    if (el === 'fire') {
      AS.glyph(ctx, 'fire', x, y + r * 0.08, r); ctx.fillStyle = CC.fire; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); AS.glyph(ctx, 'fire', x, y + r * 0.35, r * 0.48); ctx.fillStyle = CCL.fire; ctx.fill();
    } else if (el === 'water') {
      ctx.arc(x, y, r * 0.78, 0, TAU); ctx.fillStyle = CC.water; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.22, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (el === 'cold') {
      hexPath(ctx, x, y, r * 0.92, rot); ctx.fillStyle = CC.cold; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); hexPath(ctx, x, y, r * 0.42, rot); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (el === 'arcane') {
      ctx.arc(x, y, r * 0.85, 0, TAU); ctx.lineWidth = r * 0.42 + lw * 2; ctx.strokeStyle = ink; ctx.stroke();
      ctx.lineWidth = r * 0.42; ctx.strokeStyle = CC.arcane; ctx.stroke();
    } else if (el === 'shield') {
      polyPath(ctx, [[x, y - r], [x + r * 0.8, y], [x, y + r], [x - r * 0.8, y]]); ctx.fillStyle = CC.shield; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
    } else if (el === 'lightning') {
      polyPath(ctx, [[x + r * 0.2, y - r], [x - r * 0.55, y + r * 0.1], [x - r * 0.02, y + r * 0.1], [x - r * 0.25, y + r], [x + r * 0.6, y - r * 0.15], [x + r * 0.05, y - r * 0.15]]);
      ctx.fillStyle = CC.lightning; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke();
    }
    ctx.restore();
  }
  // A status pin: white chip, element shape inside, optional progress ring.
  function pin(ctx, x, y, el, prog) {
    ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fillStyle = '#fffdf4'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    if (prog != null) { ctx.beginPath(); ctx.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(prog)); ctx.lineWidth = 3; ctx.strokeStyle = CC[el]; ctx.stroke(); }
    cglyph(ctx, el, x, y, 5.6, 0, INK, 1.4);
  }
  // Composite spell chip: outer ring = the form element, inner shape = each payload.
  function spellChip(ctx, x, y, r, form, payload) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#fffdf4'; ctx.fill();
    ctx.lineWidth = r * 0.3 + 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = r * 0.3; ctx.strokeStyle = CC[form]; ctx.stroke();
    payload.forEach((el, i) => cglyph(ctx, el, x + (i - (payload.length - 1) / 2) * r * 0.7, y, r * 0.55, 0, INK, 1.4));
  }
  function codedRender(ctx, S, scale) {
    const t = S.t, D = S.D;
    ctx.save();
    ctx.drawImage(AS.cached('toon-coded-ground', W, H, scale, (x) => paintGround(x, G_CODED)), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = S.fire;
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 30, 0.14)); ctx.fillStyle = '#6e5e50'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    toonPuddle(ctx, S, { water: '#3d86ea', ripple: 'rgba(255,255,255,0.75)', ice: '#c4f0ff', iceHi: 'rgba(255,255,255,0.9)', ink: INK, hex: true });
    // fire hazard tongues
    merged(ctx, S.tongues, (c, f, k) => teardrop(c, f.x, f.y - (1 - k) * 2, f.w * k, f.h * k, f.sway * k), [
      { k: 1, stroke: 5, color: INK }, { k: 1, color: CC.fire }, { k: 0.45, color: CCL.fire }]);
    // team rings under the players
    for (const p of S.players) {
      const col = TEAM[p.team];
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 24, 9, 0, 0, TAU); ctx.fillStyle = hexA(col, 0.22); ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = col; ctx.stroke();
      // facing notch
      const nx = p.x + 27 * p.face;
      ctx.beginPath(); polyPath(ctx, [[nx + 7 * p.face, p.y + 1], [nx - 1 * p.face, p.y - 5], [nx - 1 * p.face, p.y + 7]]); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    }
    // actors
    const ice = (c, a) => {
      const b = iceBox(a);
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.hh, 4); c.fillStyle = 'rgba(150,228,255,0.6)'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
      c.save(); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2; c.beginPath();
      for (let gx = b.x; gx < b.x + b.w + 9; gx += 13) for (let gy = b.y, r = 0; gy < b.y + b.hh + 9; gy += 11, r++) hexPath(c, gx + (r % 2) * 6.5, gy, 6.2, 0);
      c.stroke();
      if (a.crack > 0) crackLines(c, b.x, b.y, b.w, b.hh, a.crack, INK, 2);
      c.restore();
    };
    for (const a of S.actors) {
      const [rad] = AS.SIZE[a.kind];
      ctx.save(); ctx.globalAlpha = a.alpha; ctx.beginPath(); ctx.ellipse(a.x, a.y + 1, rad * a.s, rad * 0.36 * a.s, 0, 0, TAU); ctx.fillStyle = 'rgba(30,20,50,0.25)'; ctx.fill(); ctx.restore();
      inkActor(ctx, a, { pal: CODED, ink: INK, wetCol: CC.water, ice, hitA: 0.55 });
    }
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); ctx.arc(d.x, d.y, 2.6, 0, TAU); ctx.fillStyle = CC.water; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // smoke is neutral and quiet: it must not look like an element
    const sm = S.smoke.filter((s) => s.age > 0.12 && s.age < 0.85);
    ctx.globalAlpha = 0.45;
    merged(ctx, sm, (c, s, k) => { const r = s.size * 0.65 * k * (1 - seg(s.age, 0.5, 0.85) * 0.7); c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }, [{ k: 1, color: '#e2e0e6' }]);
    ctx.globalAlpha = 1;
    // fire: every fire particle is a flame teardrop
    const fl = [...S.flames, ...S.impFlames].filter((f) => f.size > 0.6);
    const burn = burnFlames(S.brute, t);
    merged(ctx, fl, (c, f, k) => teardrop(c, f.x, f.y, f.size * k, f.size * 2.6 * k), [{ k: 1, stroke: 4, color: INK }, { k: 1, color: CC.fire }, { k: 0.5, color: CCL.fire }]);
    merged(ctx, burn, (c, f, k) => teardrop(c, f.x, f.y + 4, f.w * k, f.h * k, f.sway * k), [{ k: 1, stroke: 4.5, color: INK }, { k: 1, color: CC.fire }, { k: 0.45, color: CCL.fire }]);
    for (const e of [...S.embers, ...burnSparks(S.brute, t, D)]) { const s = 2.6 * (1 - e.age) + 1.2; ctx.beginPath(); teardrop(ctx, e.x, e.y + s, s * 0.7, s * 2.4); ctx.fillStyle = CC.fire; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke(); }
    // cold mist: faint hexagon outlines
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffffff';
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.6; ctx.beginPath(); hexPath(ctx, m.x, m.y, 3 + m.size * 0.25, m.r * TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // water: round beads; cold: hex crystals
    const sp = S.spray.parts, water = sp.filter((p) => p.kind === 'water'), cold = sp.filter((p) => p.kind === 'cold');
    merged(ctx, water, (c, p, k) => { const r = (1.6 + p.size * 0.55) * k * (1 - seg(p.age, 0.8, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 3.5, color: INK }, { k: 1, color: CC.water }]);
    for (const p of water) { const r = (1.6 + p.size * 0.55) * (1 - seg(p.age, 0.8, 1)); ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.3, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    const hx = (c, p, k) => { const r = (2 + p.size * 0.75) * k * (1 - seg(p.age, 0.7, 1)); if (r > 0.3) hexPath(c, p.x, p.y, r, p.rot); };
    merged(ctx, cold, hx, [{ k: 1, stroke: 3.5, color: INK }, { k: 1, color: CC.cold }, { k: 0.45, color: '#fff' }]);
    if (S.spray.water + S.spray.cold > 0) cglyph(ctx, S.spray.cold > 0 ? 'cold' : 'water', S.spray.x, S.spray.y, 8 + Math.sin(t * 40) * 1.2, t * 3, INK, 2.5);
    // ---- arcane beam: travelling rings; fire payload: teardrops riding inside ----
    if (S.beam) {
      const B = S.beam, o = B.on, f = frame(B), pts = beamPts(B, t, 22, 2 * o);
      const ang = Math.atan2(f.dy, f.dx);
      for (const [lw2, col] of [[13 * o, INK], [9 * o, CC.arcane], [3 * o, CCL.arcane]]) { ctx.lineWidth = lw2; ctx.strokeStyle = col; strokePts(ctx, pts); }
      // rings travel along the beam (arcane's shape)
      const nR = Math.round(clamp(7 * Math.sqrt(D), 5, 12));
      for (let k = 0; k < nR; k++) {
        const p = mod(t * 0.9 + k / nR, 1), x = B.x1 + f.dx * p, y = B.y1 + f.dy * p, rr = (9 + 3 * Math.sin(p * Math.PI)) * o;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, rr * 0.38, rr, 0, 0, TAU);
        ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = CC.arcane; ctx.stroke(); ctx.restore();
      }
      // payload: fire teardrops flow down the beam between the rings
      for (const el of B.payload || []) {
        const rid = riders(B, t, D, { n: 6, speed: 0.9, turns: 0, amp: 0, max: 12 }).map((r) => ({ ...r, k2: r.k }));
        for (const r of rid) cglyph(ctx, el, r.x, r.y - 1, 6.5 * r.s, 0, INK, 1.8);
      }
      // impact: expanding rings, fire jumps to the target
      for (let i = 0; i < 3; i++) { const k = mod(t * 2.2 + i / 3, 1); ctx.globalAlpha = (1 - k) * o; ctx.beginPath(); ctx.arc(B.x2, B.y2, 5 + k * 24, 0, TAU); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = CC.arcane; ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(B.x2, B.y2, 7 * o, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(B.x1, B.y1, 8 * o, 0, TAU); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = CC.arcane; ctx.stroke();
      for (const s of S.beamSparks) {
        if (s.r < 0.4) { const z = 3 * (1 - s.age) + 1; ctx.beginPath(); teardrop(ctx, s.x, s.y + z, z * 0.7, z * 2.4); ctx.fillStyle = CC.fire; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke(); continue; }
        if (s.r > 0.75) continue;
        const z = 2.6 * (1 - s.age) + 0.8; ctx.beginPath(); ctx.arc(s.x, s.y, z, 0, TAU); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = CC.arcane; ctx.stroke();
      }
      // spell tag at the beam's midpoint: ring = arcane form, flame inside = fire payload
      const mx = (B.x1 + B.x2) / 2 - f.nx * 22, my = (B.y1 + B.y2) / 2 - Math.abs(f.ny) * 22 - 6;
      ctx.globalAlpha = o; spellChip(ctx, mx, my, 10, B.el, B.payload || []); ctx.globalAlpha = 1;
    }
    // ward: shield's shape is the diamond
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU); ctx.fillStyle = hexA(CC.shield, 0.14 + Wd.pulse * 0.22); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = CC.shield; ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = t * 0.6 + i / 8 * TAU; cglyph(ctx, 'shield', Wd.x + Math.cos(a) * wr, Wd.y + Math.sin(a) * wr, 4.5, 0, INK, 1.5); }
    if (Wd.pulse > 0) { ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 26 + 4, 0, TAU); ctx.lineWidth = 3 * Wd.pulse; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    for (const s of S.wardSparks) cglyph(ctx, 'shield', s.x, s.y, 5 * (1 - s.age) + 0.5, 0, INK, 1.1);
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.lineWidth = 5; c.strokeStyle = INK; c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
      c.lineWidth = 2.4; c.strokeStyle = '#d8ccb4'; c.stroke();
      c.beginPath(); c.moveTo(14, 0); c.lineTo(7, -4.5); c.lineTo(7, 4.5); c.closePath(); c.fillStyle = '#9a96a8'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -4); c.lineTo(-10, 0); c.lineTo(-18, 4); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
    });
    // shatter: hexagon shards
    for (const s of S.shards) { ctx.globalAlpha = 1 - seg(s.age, 0.6, 1); cglyph(ctx, 'cold', s.x, s.y, s.size * 0.95, s.rot, INK, 1.6); }
    ctx.globalAlpha = 1;
    // status pins (upper right of each afflicted actor)
    for (const a of S.actors) {
      if (a.alpha < 0.5) continue;
      const [rad, hgt] = AS.SIZE[a.kind], st = [];
      if (a.frozen > 0.3) st.push(['cold', null]); else if (a.wet > 0.5) st.push(['water', null]);
      if (a.burning > 0.02) st.push(['fire', a.burning]);
      st.forEach(([el, prog], i) => pin(ctx, a.x + (rad + 4) * (a.kind === 'brute' ? 1.05 : 1), a.y + a.bob - hgt + 8 + i * 20, el, prog));
    }
    // numbers: element colour + the element's shape before the value
    for (const n of S.numbers) {
      const el = n.kind === 'crit' ? 'arcane' : n.kind, col = n.kind === 'crit' ? '#ffe14a' : n.kind === 'arcane' ? '#d88cff' : n.kind === 'water' ? '#6aa8ff' : CC[el] || '#fff';
      toonText(ctx, n, col, INK, 5.5);
      if (/^\d/.test(n.text)) { ctx.save(); ctx.globalAlpha = n.alpha; const size = (n.big ? 25 : 19) * n.pop; ctx.font = `${size}px "Lilita One", sans-serif`; const tw = ctx.measureText(n.text).width; cglyph(ctx, el, n.x - tw / 2 - 8, n.y, size * 0.32, 0, INK, 1.5); ctx.restore(); }
    }
    // HUD
    for (const h of S.hud) {
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 12); ctx.fillStyle = '#fff8e8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 13, 0, TAU); ctx.fillStyle = TEAM[h.team]; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 26, 140, 5, 2.5); ctx.fillStyle = '#3a2a48'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 26, 140 * h.hp, 5, 2.5); ctx.fillStyle = '#5fdc6a'; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 13, q = h.queue[i];
        if (!q && i === 4 && h.id === 'p1' && S.beam) continue;
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, TAU); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(INK, 0.4); ctx.stroke(); ctx.setLineDash([]); continue; }
        cglyph(ctx, q.el, cx, cy, 9 * ease.back(q.pop), 0, INK, 2);
      }
      // the resolved spell, in the same ring + payload grammar as the in-world tag
      if (h.id === 'p1' && S.beam) { ctx.globalAlpha = S.beam.on; spellChip(ctx, h.x + 152, h.y + 13, 10, S.beam.el, S.beam.payload || []); ctx.globalAlpha = 1; }
    }
    // element key, top right
    const keys = ['fire', 'water', 'cold', 'arcane', 'lightning', 'shield'];
    ctx.beginPath(); ctx.roundRect(W - 168, 8, 160, 26, 13); ctx.fillStyle = 'rgba(255,248,232,0.92)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    keys.forEach((el, i) => cglyph(ctx, el, W - 152 + i * 26, 21, 7.5, 0, INK, 1.6));
    ctx.restore();
  }
  AS.register({
    id: 'toon-coded', name: 'Toon Coded', family: 'toon', round: 2,
    refs: ['Bold Toon', 'Splatoon', 'Into the Breach'],
    feel: 'Bold Toon with a strict visual grammar: every element owns one colour and one shape everywhere it appears (fire flames, water beads, cold hexagons, arcane rings, shield diamonds, lightning zigzags), in the world, in damage numbers, on status pins and in the HUD. The meadow is toned down so only magic is saturated, and players stand on team-coloured rings.',
    notes: {
      read: ['Strongest', 'The payload is spelled out three ways in one grammar: flame shapes travel inside the ring-shaped beam, a ring-with-a-flame tag names the spell, and the brute wears a fire pin whose ring fills as the burn ramps. Shapes stay distinct even in greyscale or with red-green colour blindness. The cost is clutter: at high chaos the pins and tags start to feel like UI on top of the game.'],
      tone: ['Slightly clinical', 'Still a cartoon, but the muted ground and the labels pull it toward a tactics game. Fine for teaching the elements; may want to fade the tags once players know the grammar.'],
      cost: ['Low to medium', 'Same cost as Bold Toon plus a small icon set. The real work is the discipline: every new effect must use its element\'s shape.'],
    },
    render: safe(codedRender),
  });

  // =====================================================================
  // 3. TOON VINYL: soft, chunky, glossy designer-toy toon
  // =====================================================================
  const PLUM = '#5c4670';
  const VIN = over(TOON, {
    el: { fire: '#ff9a52', water: '#6cb4ff', cold: '#bff0ff', arcane: '#ff8ccc', shield: '#ffd866' },
    p1: { robe: '#ff7d72', trim: '#ffe08e', sleeve: '#f0645c', hat: '#ff7d72', band: '#ffe08e' },
    p2: { robe: '#74a8ff', trim: '#dcefff', sleeve: '#5c8ef0', hat: '#74a8ff', band: '#dcefff' },
    wizard: { skin: '#ffdcc2', beard: '#fffaf3', staff: '#c99464', hand: '#ffdcc2' },
    goblin: { body: '#93d872', belly: '#d9f4b4', dark: '#6aa850', club: '#d0a070' },
    archer: { body: '#93d872', cloth: '#bc96de', dark: '#6aa850', bow: '#d8a86c', string: '#fff', arrow: '#f2e2c4', hand: '#93d872' },
    brute: { body: '#e8a284', belly: '#ffd6bf', dark: '#b0705c', horn: '#fff6e6', brow: '#7a4a48' },
    imp: { body: '#c8a0f2', wing: '#a07ad8', horn: '#fff0c8', tail: '#a07ad8' },
    common: { eye: '#3e2c4e', eyeWhite: '#ffffff', tooth: '#ffffff' },
  });
  const VE = { fire: '#ff9a52', fireDeep: '#ff7040', fireMid: '#ffc46a', fireHi: '#fff2b0', water: '#6cb4ff', cold: '#bff0ff', arcane: '#ff8ccc', arcaneDeep: '#e0609e', shield: '#ffd866' };
  const G_VIN = { base: '#c4e8c2', blobA: '#b8e0b6', blobB: '#d2f0cc', path: '#f7e6c6', pathShadow: '#e2cca4', pathEdge: null, pebble: '#e8d2ac', tuft: '#a8d8a6', softTufts: true, flowers: ['#ffffff', '#ffd6ec', '#fff0b8'], flowerMid: '#ffc85a', rock: '#cfc6dc', rockEdge: null, rockHi: '#efeaf6', rockShadow: 'rgba(92,70,112,0.16)' };
  function vinylShadow(ctx, x, y, r, a = 0.32) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.36);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, hexA(PLUM, a)); g.addColorStop(0.6, hexA(PLUM, a * 0.6)); g.addColorStop(1, hexA(PLUM, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function vinylActor(ctx, a) {
    const parts = world(a), [rad] = AS.SIZE[a.kind];
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    vinylShadow(ctx, a.x + 2, a.y + 1, rad * 1.35, 0.38);
    // one soft plum silhouette line around the whole toy, nothing inside it
    ctx.strokeStyle = hexA(PLUM, 0.62);
    for (const { p, w } of parts) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.lineWidth = p.line ? p.w + 5 : 6.5; ctx.stroke(); }
    for (const { p, w } of parts) {
      const col = colorOf(VIN, a, p.role);
      ctx.beginPath(); AS.partPath(ctx, p, w);
      if (p.line) { ctx.strokeStyle = col; ctx.lineWidth = p.w + 1.5; ctx.stroke(); continue; }
      const small = p.role === 'eye' || p.role === 'eyeWhite' || p.role === 'tooth';
      // inflate: fill + same-colour stroke makes every part chubbier and rounder
      ctx.fillStyle = col; ctx.fill(); if (!small) { ctx.lineWidth = 2.6; ctx.strokeStyle = col; ctx.stroke(); }
      if (p.big) {
        const b = bbox(w), lx = b.cx - a.face * b.w * 0.18, ly = b.cy - b.h * 0.22;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(b.w, b.h) * 0.85);
        g.addColorStop(0, mix(col, '#ffffff', 0.22)); g.addColorStop(0.55, col); g.addColorStop(1, mix(col, PLUM, 0.3));
        ctx.fillStyle = g; ctx.fill(); ctx.stroke();
        if (a.wet) { ctx.fillStyle = hexA('#5a9cff', 0.28 * a.wet); ctx.fill(); }
        // vinyl gloss
        ctx.save(); ctx.beginPath(); AS.partPath(ctx, p, w); ctx.clip();
        ctx.beginPath(); ctx.ellipse(b.cx - a.face * b.w * 0.2, b.y0 + b.h * 0.24, b.w * 0.2, b.h * 0.1, -0.5 * a.face, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); ctx.restore();
      } else if (!small) { ctx.lineWidth = 1.1; ctx.strokeStyle = hexA(mix(col, PLUM, 0.5), 0.6); ctx.stroke(); }
      if (p.role === 'eye') { const b = bbox(w); ctx.beginPath(); ctx.arc(b.cx - 0.5, b.cy - 0.6, 0.7, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
      if (p.role === 'orb') { ctx.beginPath(); ctx.arc(w[0][0] - 1.6 * a.face, w[0][1] - 1.6, 1.6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
    if (a.hit > 0) {
      ctx.globalAlpha = a.alpha * a.hit * 0.7; ctx.fillStyle = '#fff';
      for (const { p, w } of parts) if (!p.line) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); }
      ctx.globalAlpha = a.alpha;
    }
    // burning: a warm coral blush over the whole toy
    if (a.burning > 0 && a.kind === 'brute') {
      ctx.globalAlpha = a.alpha * a.burning * 0.28; ctx.fillStyle = VE.fireDeep;
      for (const { p, w } of parts) if (!p.line && p.big) { ctx.beginPath(); AS.partPath(ctx, p, w); ctx.fill(); }
      ctx.globalAlpha = a.alpha;
    }
    if (a.frozen > 0) {
      const b = iceBox(a);
      ctx.beginPath(); ctx.roundRect(b.x - 1, b.y - 1, b.w + 2, b.hh + 2, 10);
      const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.hh); g.addColorStop(0, 'rgba(235,250,255,0.62)'); g.addColorStop(1, 'rgba(150,206,236,0.55)');
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(120,170,210,0.8)'; ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(b.x + b.w * 0.3, b.y + 9, b.w * 0.22, 4, -0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(b.x + 4, b.y + 16, 4, Math.max(0, b.hh - 24), 2); ctx.fill();
      if (a.crack > 0) crackLines(ctx, b.x, b.y, b.w, b.hh, a.crack, '#7aa6c8', 2);
      ctx.restore();
    }
    ctx.restore();
  }
  // a puffy candy flame: rim, body, core, highlight
  const puffy = (k) => [{ k: 1, stroke: 3, color: VE.fireDeep }, { k: 1, color: VE.fire }, { k: 0.62, color: VE.fireMid }, { k: 0.3, color: VE.fireHi }];
  function vinylRender(ctx, S, scale) {
    const t = S.t, D = S.D;
    ctx.save();
    ctx.drawImage(AS.cached('toon-vinyl-ground', W, H, scale, (x) => paintGround(x, G_VIN)), 0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const F = S.fire;
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y, F.rx, F.ry, 5, 30, 0.14)); ctx.fillStyle = '#d6b09a'; ctx.fill();
    ctx.beginPath(); polyPath(ctx, blobPts(F.x, F.y + 2, F.rx * 0.72, F.ry * 0.64, 9, 24, 0.2)); ctx.fillStyle = '#ffc49a'; ctx.fill();
    // puddle: glossy jelly pool
    const P = S.puddle, pud = blobPts(P.x, P.y, P.rx, P.ry, 2, 34, 0.1);
    ctx.save(); ctx.translate(0, 3); ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = hexA(PLUM, 0.14); ctx.fill(); ctx.restore();
    ctx.beginPath(); polyPath(ctx, pud); ctx.fillStyle = '#8cc4ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#6aa4ec'; ctx.stroke();
    ctx.save(); ctx.beginPath(); polyPath(ctx, pud); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(P.x + 10 - i * 30, P.y - 4 + i * 8, 10 + k * 26, 4 + k * 10, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(P.x - P.rx * 0.35, P.y - P.ry * 0.45, P.rx * 0.32, 4, -0.08, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    if (P.ice > 0 && P.front > 0) {
      ctx.globalAlpha = P.ice;
      ctx.beginPath(); iceFrontPath(ctx, P, 6); ctx.fillStyle = '#e4f6ff'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < 5; i++) { const cx = P.x - P.rx + 14 + i * 36, cy = P.y - 6 + (i % 2) * 10; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 3.4, -0.4, 0, TAU); ctx.fill(); }
      if (P.crack > 0) { ctx.strokeStyle = '#7aa6c8'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8 * P.crack; i++) { const cx = P.x + (rand(i, 81) - 0.5) * 2 * P.rx; ctx.moveTo(cx, P.y + (rand(i, 82) - 0.5) * P.ry); ctx.lineTo(cx + (rand(i, 83) - 0.5) * 40, P.y + (rand(i, 84) - 0.5) * P.ry * 1.6); } ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // fire tongues
    merged(ctx, S.tongues, (c, f, k) => teardrop(c, f.x, f.y - (1 - k) * 2, (f.w + 1.5) * k, f.h * k, f.sway * k), puffy());
    // tube shadow on the ground under the beam: a toy hanging in space
    if (S.beam) {
      const B = S.beam, br = S.brute, p1 = S.players[0];
      ctx.lineWidth = 12 * B.on; ctx.strokeStyle = hexA(PLUM, 0.13);
      ctx.beginPath(); ctx.moveTo(B.x1 + 6, p1.y - 2); ctx.lineTo(B.x2 + 4, br.y - 6); ctx.stroke();
    }
    for (const a of S.actors) vinylActor(ctx, a);
    for (const d of S.drips) { ctx.globalAlpha = 1 - d.age; ctx.beginPath(); teardrop(ctx, d.x, d.y, 2.8, 7.5); ctx.fillStyle = VE.water; ctx.fill(); ctx.beginPath(); ctx.arc(d.x - 0.8, d.y - 3.5, 0.9, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // smoke: soft lilac puffs
    const sm = S.smoke.filter((s) => s.age > 0.12 && s.age < 0.85);
    ctx.globalAlpha = 0.7;
    merged(ctx, sm, (c, s, k) => { const r = s.size * 0.7 * k * (1 - seg(s.age, 0.5, 0.85) * 0.7); c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }, [
      { k: 1, color: '#e2d8ec' }, { k: 0.62, color: '#f6f2fa' }]);
    ctx.globalAlpha = 1;
    const fl = [...S.flames, ...S.impFlames].filter((f) => f.size > 0.6);
    merged(ctx, fl, (c, f, k) => teardrop(c, f.x, f.y, (f.size + 0.8) * k, f.size * 2.3 * k), [{ k: 1, stroke: 2.5, color: VE.fireDeep }, { k: 1, color: VE.fire }, { k: 0.5, color: VE.fireHi }]);
    const burn = burnFlames(S.brute, t);
    merged(ctx, burn, (c, f, k) => teardrop(c, f.x, f.y + 4, (f.w + 1.6) * k, f.h * 0.95 * k, f.sway * k), puffy());
    for (const f of burn) { ctx.beginPath(); ctx.arc(f.x - f.w * 0.35, f.y - f.w * 0.2, f.w * 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); }
    for (const e of [...S.embers, ...burnSparks(S.brute, t, D)]) { ctx.beginPath(); ctx.arc(e.x, e.y, 2.6 * (1 - e.age) + 1, 0, TAU); ctx.fillStyle = e.r > 0.5 ? VE.fireMid : VE.fire; ctx.fill(); }
    for (const m of S.mist) { ctx.globalAlpha = Math.sin(m.age * Math.PI) * 0.55; ctx.beginPath(); ctx.arc(m.x, m.y, m.size * 0.6, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    // sprays: glossy beads; snow puffs
    const sp = S.spray.parts, water = sp.filter((p) => p.kind === 'water'), cold = sp.filter((p) => p.kind === 'cold');
    merged(ctx, water, (c, p, k) => { const r = (2 + p.size * 0.6) * k * (1 - seg(p.age, 0.8, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 2.5, color: '#4a90e8' }, { k: 1, color: VE.water }]);
    for (const p of water) { const r = (2 + p.size * 0.6) * (1 - seg(p.age, 0.8, 1)); if (r > 1.5) { ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.32, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); } }
    merged(ctx, cold, (c, p, k) => { const r = (2 + p.size * 0.85) * k * (1 - seg(p.age, 0.7, 1)); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); }, [
      { k: 1, stroke: 2.5, color: '#8cd4f0' }, { k: 1, color: '#e8faff' }, { k: 0.5, color: '#ffffff' }]);
    if (S.spray.water + S.spray.cold > 0) { ctx.beginPath(); ctx.arc(S.spray.x, S.spray.y, 8 + Math.sin(t * 40) * 1.5, 0, TAU); ctx.fillStyle = S.spray.cold > 0 ? '#ffffff' : '#bfe0ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = S.spray.cold > 0 ? '#8cd4f0' : '#4a90e8'; ctx.stroke(); }
    // ---- beam: a pink candy tube with orange fire stripes flowing to the target ----
    if (S.beam) {
      const B = S.beam, o = B.on, f = frame(B), pts = beamPts(B, t, 24, 2.2 * o, 0.7, 22), tw = 13 * o;
      ctx.lineWidth = tw + 4; ctx.strokeStyle = VE.arcaneDeep; strokePts(ctx, pts);
      ctx.lineWidth = tw; ctx.strokeStyle = VE.arcane; strokePts(ctx, pts);
      if ((B.payload || []).includes('fire')) {
        // diagonal candy stripes that slide toward the target: fire riding the arcane tube
        const th = 0.65, c0 = Math.cos(th), s0 = Math.sin(th), hl = Math.max(0, (tw / 2 - 2.6) / c0), gap = 15;
        const n = Math.floor(f.L / gap) + 2, off = mod(t * 70, gap);
        ctx.save(); ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const d = i * gap + off - gap; if (d < 10 || d > f.L - 4) continue;
          const p = d / f.L, q = pts[Math.min(pts.length - 1, Math.round(p * (pts.length - 1)))];
          const x = lerp(B.x1 + f.dx * p, q[0], 1), y = lerp(B.y1 + f.dy * p, q[1], 1);
          const vx = f.nx * c0 + f.ux * s0, vy = f.ny * c0 + f.uy * s0;
          ctx.beginPath(); ctx.moveTo(x - vx * hl, y - vy * hl); ctx.lineTo(x + vx * hl, y + vy * hl);
          ctx.lineWidth = 5 * o; ctx.strokeStyle = VE.fireDeep; ctx.stroke();
          ctx.lineWidth = 2 * o; ctx.strokeStyle = VE.fireMid; ctx.stroke();
        }
        ctx.restore();
      }
      // gloss line on the upper side of the tube
      const up = f.ny < 0 ? 1 : -1, gl = pts.map(([x, y]) => [x + f.nx * tw * 0.26 * up, y + f.ny * tw * 0.26 * up]);
      ctx.lineWidth = tw * 0.2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; strokePts(ctx, gl.slice(2, -2));
      // heat wisps lifting off the stripes
      const wisps = riders(B, t, D, { n: 6, speed: 0.75, turns: 0, amp: 0, max: 14 }).map((r) => ({ x: r.x, y: r.y - tw * 0.5 - 2 - (r.k % 3) * 2, w: 3.2 * r.s, h: (9 + (r.k % 3) * 2) * r.s }));
      merged(ctx, wisps, (c, w, k) => teardrop(c, w.x, w.y, (w.w + 0.8) * k, w.h * k, 0), [{ k: 1, stroke: 2.5, color: VE.fireDeep }, { k: 1, color: VE.fire }, { k: 0.45, color: VE.fireHi }]);
      // impact: a soft pink pop ringed with little flames
      const ringF = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 1.5, h = (11 + 4 * Math.sin(t * TAU * 4 + i * 2)) * o; ringF.push({ x: B.x2 + Math.cos(a) * 15 * o, y: B.y2 + Math.sin(a) * 11 * o + 5, w: 4.5 * o, h }); }
      merged(ctx, ringF, (c, w, k) => teardrop(c, w.x, w.y, (w.w + 0.8) * k, w.h * k, 0), puffy());
      const pr = (15 + Math.sin(t * 30) * 1.5) * o;
      ctx.beginPath(); ctx.arc(B.x2, B.y2, pr, 0, TAU); ctx.fillStyle = VE.arcane; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = VE.arcaneDeep; ctx.stroke();
      ctx.beginPath(); ctx.arc(B.x2, B.y2, pr * 0.55, 0, TAU); ctx.fillStyle = '#ffe6f3'; ctx.fill();
      ctx.beginPath(); ctx.arc(B.x2 - pr * 0.35, B.y2 - pr * 0.4, pr * 0.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(B.x1, B.y1, 9 * o, 0, TAU); ctx.fillStyle = '#ffd0e8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = VE.arcaneDeep; ctx.stroke();
      for (const s of S.beamSparks) {
        const z = 3 * (1 - s.age) + 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, z, 0, TAU); ctx.fillStyle = s.r < 0.4 ? VE.fire : s.r > 0.75 ? '#ffffff' : VE.arcane; ctx.fill();
      }
    }
    // ward: a soft jelly bubble
    const Wd = S.ward, wr = Wd.r * (1 + Wd.pulse * 0.07);
    ctx.beginPath(); ctx.arc(Wd.x, Wd.y, wr, 0, TAU);
    const wg = ctx.createRadialGradient(Wd.x - wr * 0.3, Wd.y - wr * 0.4, wr * 0.1, Wd.x, Wd.y, wr);
    wg.addColorStop(0, hexA('#fff8d8', 0.2)); wg.addColorStop(0.75, hexA(VE.shield, 0.16 + Wd.pulse * 0.2)); wg.addColorStop(1, hexA(VE.shield, 0.5 + Wd.pulse * 0.3));
    ctx.fillStyle = wg; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = hexA('#f0b830', 0.85); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(Wd.x - wr * 0.38, Wd.y - wr * 0.5, wr * 0.26, wr * 0.11, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    if (Wd.pulse > 0) { ctx.beginPath(); ctx.arc(Wd.hitX, Wd.hitY, (1 - Wd.pulse) * 24 + 4, 0, TAU); ctx.lineWidth = 4 * Wd.pulse; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    for (const s of S.wardSparks) { ctx.beginPath(); ctx.arc(s.x, s.y, 3.6 * (1 - s.age) + 0.6, 0, TAU); ctx.fillStyle = s.r > 0.4 ? VE.shield : '#fff'; ctx.fill(); }
    for (const ar of S.arrows) arrowShape(ctx, ar, 22, (c) => {
      c.lineWidth = 5; c.strokeStyle = hexA(PLUM, 0.6); c.beginPath(); c.moveTo(-13, 0); c.lineTo(9, 0); c.stroke();
      c.lineWidth = 3; c.strokeStyle = '#f2dcb4'; c.stroke();
      c.beginPath(); c.ellipse(11, 0, 5, 3.6, 0, 0, TAU); c.fillStyle = '#d6d0e4'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = hexA(PLUM, 0.6); c.stroke();
      c.beginPath(); c.ellipse(-15, 0, 4, 3.2, 0, 0, TAU); c.fillStyle = '#ffb6d6'; c.fill();
    });
    for (const s of S.shards) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - seg(s.age, 0.6, 1);
      ctx.beginPath(); ctx.roundRect(-s.size * 0.6, -s.size * 0.6, s.size * 1.2, s.size * 1.2, s.size * 0.35);
      ctx.fillStyle = s.r > 0.5 ? '#f0fbff' : '#c4ecff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#8cc0e0'; ctx.stroke(); ctx.restore();
    }
    // numbers: chunky white-edged candy lettering with a soft drop shadow
    const NC = { arcane: '#f2509c', crit: '#ffb020', fire: '#ff7a3a', cold: '#3ab4e0', water: '#3a86e8', shield: '#e8a810' };
    for (const n of S.numbers) {
      const n2 = Object.assign({}, n, { y: n.y + 2.5 }); ctx.save(); ctx.globalAlpha = 0.25; toonText(ctx, n2, PLUM, PLUM, 6); ctx.restore();
      toonText(ctx, n, NC[n.kind], '#ffffff', 6);
    }
    // HUD: soft pills
    for (const h of S.hud) {
      ctx.save(); ctx.shadowColor = hexA(PLUM, 0.25); ctx.shadowBlur = 8 * scale; ctx.shadowOffsetY = 3 * scale;
      ctx.beginPath(); ctx.roundRect(h.x, h.y, h.w, h.h, 18); ctx.fillStyle = '#fffaf2'; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(h.x + 18, h.y + 18, 13, 0, TAU); ctx.fillStyle = VIN[h.team].robe; ctx.fill();
      ctx.font = '13px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.name, h.x + 18, h.y + 19);
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 25, 140, 6, 3); ctx.fillStyle = '#ece4f0'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(h.x + 38, h.y + 25, 140 * h.hp, 6, 3); ctx.fillStyle = '#7ee08a'; ctx.fill();
      const EC = { arcane: VE.arcane, water: VE.water, cold: '#8cdcf8', fire: VE.fire, shield: VE.shield };
      for (let i = 0; i < 5; i++) {
        const cx = h.x + 48 + i * 26, cy = h.y + 12, q = h.queue[i];
        if (!q) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fillStyle = '#efe8f2'; ctx.fill(); continue; }
        const r = 9.5 * ease.back(q.pop);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = EC[q.el]; ctx.fill();
        AS.glyph(ctx, q.el, cx, cy, r * 0.6); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    ctx.restore();
  }
  AS.register({
    id: 'toon-vinyl', name: 'Toon Vinyl', family: 'toon', round: 2,
    refs: ['Fall Guys', 'Animal Crossing', 'designer vinyl toys'],
    feel: 'The Bold Toon cast as chubby glossy vinyl figures: inflated rounded shapes, one soft plum silhouette line instead of black ink, gradient shading with a highlight, and soft contact shadows on a pastel meadow. Spells are candy: puffy flames, glassy beads, and a beam like a striped tube.',
    notes: {
      read: ['Good, softer', 'Characters separate cleanly thanks to the silhouette line and contact shadows. The payload reads as orange fire stripes flowing along the pink tube with flame wisps rising off it, and the brute grows puffy flames and a coral blush. With no dark outline on effects, high chaos turns into a pile of soft pastel shapes faster than Bold Toon.'],
      tone: ['Friendliest', 'Cute and toy-like; friendly fire becomes harmless slapstick. May be too soft to sell danger, so damage needs to be told by motion and sound.'],
      cost: ['Low to medium', 'Natural fit for simple 3D with a soft toon shader and one rim; the gloss and contact shadows come almost free in 3D.'],
    },
    render: safe(vinylRender),
  });
})();
