/* Spell VFX: the effects kit K that every vignette draws with. Helpers ported from
 * tools/art-pixel-hd/render.js (tongue, puff, bolt, sprays, burning, shards) plus new
 * ones for this gallery: prep charge, beams with payload strands, area rings, walls
 * extruded from a drawn line (with cracks), energy sheets that fade, curtains, glyphs,
 * devices, auras. All coordinates are art pixels; ground points are (x, y), heights
 * are screen pixels up. Everything is a pure function of time. */
(function () {
  'use strict';
  const PB = window.PB, { FY, TAU, clamp, lerp, seg, smooth, easeOut, rand, emit, mod } = PB, X = PB.px, EL = X.EL;
  const S = PB.stage;

  const fireCol = (age) => EL.fire[age < 0.18 ? 0 : age < 0.38 ? 1 : age < 0.6 ? 2 : age < 0.8 ? 3 : 4];
  function sq(c, x, y, s, col) { const k = Math.max(1, Math.round(s)); X.rect(c, Math.round(x) - (k >> 1), Math.round(y) - (k >> 1), k, k, col); }
  function tongue(c, x, y, w, h, sway, R = EL.fire) {
    for (let r = 0; r < h; r++) {
      const k = r / h, hw = w * (1 - k) * (k < 0.25 ? 0.7 + k * 1.2 : 1), xx = x + sway * k * k;
      if (hw < 0.3) { X.px(c, xx, y - r, R[3]); continue; }
      X.rect(c, Math.round(xx - hw), Math.round(y - r), Math.max(1, Math.round(hw * 2)), 1, R[4]);
      if (hw > 1) X.rect(c, Math.round(xx - hw * 0.62), Math.round(y - r), Math.max(1, Math.round(hw * 1.24)), 1, k < 0.55 ? R[2] : R[3]);
      if (hw > 1.6 && k < 0.5) X.rect(c, Math.round(xx - hw * 0.28), Math.round(y - r), Math.max(1, Math.round(hw * 0.56)), 1, R[1]);
    }
  }
  function puff(c, x, y, r, col, a) { if (a < 0.28) return; X.ellipse(c, x, y, a < 0.55 ? r * 0.8 : r, (a < 0.55 ? r * 0.8 : r) * 0.85, col, a < 0.55 ? 0.5 : 1); }
  function bolt(a, z, seed, rough = 0.28, depth = 4) {
    let pts = [a, z];
    for (let d = 0; d < depth; d++) {
      const nx = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const off = (rand(seed, d * 64 + i, 7) - 0.5) * L * rough;
        nx.push([(p[0] + q[0]) / 2 - (q[1] - p[1]) / L * off, (p[1] + q[1]) / 2 + (q[0] - p[0]) / L * off], q);
      }
      pts = nx;
    }
    return pts;
  }
  // ground ellipse ring, optionally thick (rings inward), dithered by alpha
  function gring(c, x, y, r, col, a = 1, thick = 1) { for (let k = 0; k < thick; k++) if (r - k > 0.5) X.ring(c, x, y, r - k, (r - k) * FY, col, a); }

  // ---------------------------------------------------------------------------
  // Prep: the queued runes leave the caster one by one, fly to the staff and orbit as
  // a charge in their colours; on the cast (t1) the charge bursts.
  function prep(c, s, A, t, els, t0, t1) {
    const an = A[s.id]; if (!an || !an.charge) return;
    const ch = an.charge, n = els.length, step = Math.min(0.16, (t1 - t0 - 0.22) / Math.max(1, n));
    if (t >= t1) {
      const e = t - t1; if (e > 0.22) return;
      els.forEach((el, i) => X.ring(c, ch[0], ch[1], 2 + e * 40 + i * 2, (2 + e * 40 + i * 2) * 0.8, EL[el][i ? 2 : 1], 1 - e / 0.22));
      if (e < 0.06) X.rect(c, ch[0] - 2, ch[1] - 2, 5, 5, '#ffffff');
      return;
    }
    let arrived = 0, last = null;
    els.forEach((el, i) => {
      const tq = t0 + 0.05 + i * step, e = (t - tq) / 0.2, R = EL[el];
      if (e < 0) return;
      if (e < 1) {
        const a0 = 2.4 + i * 1.3, sx = s.x + Math.cos(a0) * 11, sy = s.y - 9 + Math.sin(a0) * 11 * FY, k = smooth(e);
        const x = lerp(sx, ch[0], k), y = lerp(sy, ch[1], k) - Math.sin(e * Math.PI) * 5;
        X.px(c, lerp(sx, ch[0], smooth(Math.max(0, e - 0.15))), lerp(sy, ch[1], smooth(Math.max(0, e - 0.15))), R[3]);
        X.rect(c, x - 1, y - 1, 2, 2, R[1]); X.px(c, x, y - 1, R[0]);
        return;
      }
      arrived++; last = el;
      const a2 = (i / n) * TAU + t * 8, r = 3.2 + n * 0.6, x = ch[0] + Math.cos(a2) * r, y = ch[1] + Math.sin(a2) * r * 0.75;
      X.px(c, x - Math.cos(a2 - 0.5) * 1.6, y - Math.sin(a2 - 0.5) * 1.2, R[3]); X.rect(c, x - 0.5, y - 0.5, 2, 2, R[0]); X.px(c, x + 1, y + 1, R[2]);
      const pe = (t - tq - 0.2) / 0.2;
      if (pe >= 0 && pe < 1) X.ring(c, ch[0], ch[1], 2 + pe * 6, (2 + pe * 6) * 0.8, R[pe < 0.4 ? 0 : 1], 1 - pe);
    });
    if (arrived) { X.glow(c, ch[0], ch[1], 4 + arrived * 2.2, EL[last][2], 0.75); X.rect(c, ch[0] - 1, ch[1] - 1, 2, 2, EL[last][1]); X.px(c, ch[0], ch[1], arrived === n ? '#ffffff' : EL[last][0]); }
  }

  // ---------------------------------------------------------------------------
  // Beam: a thick core in the form's ramp, an optional payload strand twisting round it
  // and payload blobs riding to the target. on = 0..1 how far it has reached.
  function beam(c, o, z, t, R, opt = {}) {
    const on = opt.on == null ? 1 : opt.on, w = opt.w || 1;
    const dx = z[0] - o[0], dy = z[1] - o[1], Lb = Math.hypot(dx, dy) || 1, ux = dx / Lb, uy = dy / Lb, nx = -uy, ny = ux, len = Lb * on;
    if (len < 1) return;
    const n = Math.max(6, Math.round(len / 2)), core = [], strand = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, d = k * len, en = Math.min(1, k * 6) * Math.min(1, (1 - k) * 8 + 0.3), j = Math.sin(d * 0.45 - t * 38) * 0.7 * en;
      core.push([o[0] + ux * d + nx * j, o[1] + uy * d + ny * j]);
      const th = d * 0.16 - t * 16;
      strand.push({ x: o[0] + ux * d + nx * Math.sin(th) * 3.4 * en * w, y: o[1] + uy * d + ny * Math.sin(th) * 3.4 * en * w, z: Math.cos(th) });
    }
    const P = opt.strand;
    const sp = (front, col, ww) => { for (let i = 1; i < strand.length; i++) { const p = strand[i - 1], q = strand[i]; if ((p.z + q.z > 0) === front) X.line(c, p.x, p.y, q.x, q.y, col, ww); } };
    if (P) sp(false, P[4] || P[3], 2);
    X.lines(c, core, R[4] || R[3], Math.round(5 * w)); X.lines(c, core, R[3], Math.max(1, Math.round(3 * w))); X.lines(c, core, R[1], 1);
    for (let i = 1; i < core.length; i++) if ((i + Math.floor(t * 30)) % 5 === 0) X.px(c, core[i][0], core[i][1], '#ffffff');
    if (P) { sp(true, P[2], 2); sp(true, P[1], 1); }
    if (opt.riders) for (let k = 0; k < 3; k++) {
      const p = mod(t * 1.2 + k / 3, 1); if (p * Lb > len) continue;
      const bx = o[0] + ux * p * Lb, by = o[1] + uy * p * Lb, s = Math.min(1, p * 5) * Math.min(1, (1 - p) * 6), Q = opt.riders;
      for (let j = 1; j <= 3; j++) X.px(c, bx - ux * j * 3, by - uy * j * 3, Q[Math.min(Q.length - 1, j + 1)]);
      sq(c, bx, by, 3 * s + 1, Q[3]); sq(c, bx, by, 2 * s, Q[1]);
    }
    X.glow(c, o[0], o[1], 6 * w + 1, R[2], 0.85); sq(c, o[0], o[1], 3, R[1]);
    if (on > 0.95) splash(c, z, t, R, P || R, Math.atan2(-uy, -ux), 30);
  }
  // sparks thrown back from an impact point, centred on angle ang
  function splash(c, z, t, R, Q, ang, rate = 30, spread = 2.6, seed = 0) {
    X.glow(c, z[0], z[1], 9, R[2], 0.7); if (Q !== R) X.glow(c, z[0], z[1], 6, Q[2], 0.6);
    sq(c, z[0], z[1], 3 + (Math.floor(t * 20) % 2) * 2, '#ffffff');
    for (const p of emit(t, rate, 0.35, (i, age) => { const a2 = ang + (rand(i, 21, seed) - 0.5) * spread, v = 16 + rand(i, 22, seed) * 18; return { x: z[0] + Math.cos(a2) * v * age, y: z[1] + Math.sin(a2) * v * age + age * age * 12, age, r: rand(i, 23, seed) }; }))
      X.px(c, p.x, p.y, p.r < 0.5 ? Q[p.age < 0.4 ? 1 : 2] : p.age < 0.5 ? '#ffffff' : R[2]);
  }

  // ---------------------------------------------------------------------------
  // Cones (Force for the spray elements). kind: water | fire | cold | scald | freeze.
  // o = staff tip, z = where the cone is aimed (it reaches a little past it).
  function cone(c, o, z, t, kind, t0, t1, opt = {}) {
    const dx = z[0] - o[0], dy = z[1] - o[1], Lz = (Math.hypot(dx, dy) || 1) * (opt.reach || 1.1), ux = dx / Lz * (opt.reach || 1.1), uy = dy / Lz * (opt.reach || 1.1);
    const spread = opt.spread || 0.28, on = Math.min(seg(t, t0, t0 + 0.12), 1 - seg(t, t1 - 0.1, t1)), k = opt.power || 1;
    if (on <= 0 && t > t1 + 0.7) return;
    const dir = (i, s1, age, d) => { const ang = (rand(i, s1) - 0.5) * 2 * spread, cs = Math.cos(ang), sn = Math.sin(ang); return [ux * cs - uy * sn, ux * sn + uy * cs]; };
    const live = (ts) => ts >= t0 && ts <= t1 - 0.06;
    // the body of the spray: a solid jet near the nozzle that breaks up with distance
    if (on > 0.05) {
      const Rj = kind === 'fire' ? EL.fire : kind === 'cold' ? EL.cold : kind === 'scald' ? ['#fff4e8', '#ffd8b8', '#8ad0ff', '#3a98ff', '#1a5ec0'] : EL.water;
      const jl = Lz * (kind === 'fire' ? 0.5 : 0.62) * on, n = Math.max(4, Math.round(jl / 2));
      for (let w = 0; w < 3; w++) {
        const pts = [];
        for (let i = 0; i <= n; i++) { const d = (i / n) * jl, j = Math.sin(d * 0.5 - t * 30 + w * 2) * (0.4 + d / jl * 1.6); pts.push([o[0] + ux * d - uy * j * (w - 1) * 1.5, o[1] + uy * d + ux * j * (w - 1) * 1.5]); }
        for (let i = 1; i < pts.length; i++) { const k2 = i / pts.length; if (k2 > 0.55 && (i + Math.floor(t * 24) + w) % 3 === 0) continue; X.line(c, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w === 1 ? (k2 < 0.4 ? Rj[0] : Rj[1]) : Rj[2], w === 1 && k2 < 0.6 ? 2 : 1); }
      }
    }
    if (kind === 'water' || kind === 'scald' || kind === 'freeze') {
      const R = EL.water;
      for (const p of emit(t, 200 * k, 0.42, (i, age, ts) => {
        if (!live(ts)) return null;
        const [vx, vy] = dir(i, 1), d = age * Lz * (0.9 + rand(i, 2) * 0.25);
        return { x: o[0] + vx * d, y: o[1] + vy * d - Math.sin(age * Math.PI) * 5 + age * age * 4, age, r: rand(i, 3) };
      })) {
        let col = p.r > 0.5 ? R[2] : R[1];
        if (kind === 'scald') col = p.r > 0.7 ? '#ffe6c8' : p.r > 0.35 ? R[1] : '#ffb890';
        if (kind === 'freeze' && p.age > 0.55) col = p.r > 0.5 ? EL.cold[1] : '#ffffff';
        sq(c, p.x, p.y, p.age < 0.5 && p.r > 0.6 ? 2 : 1, col);
      }
      if (kind === 'scald') for (const p of emit(t, 26 * k, 1.1, (i, age, ts) => {
        if (!live(ts)) return null;
        const f = 0.25 + rand(i, 41) * 0.8, d = f * Lz;
        return { x: o[0] + ux * d + (rand(i, 42) - 0.5) * 10 * f + age * 4, y: o[1] + uy * d - age * 16, age, r: 1.5 + f * 2 + age * 4 };
      })) puff(c, p.x, p.y, p.r, p.age < 0.25 ? EL.steam[1] : p.age < 0.6 ? EL.steam[2] : '#9aa2b8', (1 - p.age) * 0.85);
      if (kind === 'freeze') for (const p of emit(t, 20 * k, 0.5, (i, age, ts) => { if (!live(ts)) return null; const [vx, vy] = dir(i, 51), d = (0.55 + age * 0.5) * Lz; return { x: o[0] + vx * d, y: o[1] + vy * d, age }; })) { X.px(c, p.x, p.y, '#ffffff'); X.px(c, p.x - 1, p.y, EL.cold[2]); X.px(c, p.x + 1, p.y, EL.cold[2]); X.px(c, p.x, p.y - 1, EL.cold[2]); X.px(c, p.x, p.y + 1, EL.cold[2]); }
      X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 6, kind === 'scald' ? '#ffd8b0' : R[1], 0.7 * on);
    } else if (kind === 'fire') {
      // fine flame particles: mostly single pixels, a few 2 px licks in the hot middle
      for (const p of emit(t, 380 * k, 0.5, (i, age, ts) => {
        if (!live(ts)) return null;
        const [vx, vy] = dir(i, 11), d = easeOut(age) * Lz * (0.8 + rand(i, 12) * 0.3), sw = Math.sin(age * 9 + i) * 1.6;
        return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw - age * age * 7, age, r: rand(i, 13) };
      })) { const col = fireCol(p.age * (0.85 + p.r * 0.3)); if (p.r > 0.78 && p.age > 0.12 && p.age < 0.6) X.rect(c, p.x, p.y - 1, 1, 2, col); else X.px(c, p.x, p.y, col); }
      for (const p of emit(t, 16 * k, 0.9, (i, age, ts) => { if (!live(ts)) return null; const d = Lz * (0.7 + rand(i, 14) * 0.4); return { x: o[0] + ux * d + (rand(i, 15) - 0.5) * 10 + age * 4, y: o[1] + uy * d - 4 - age * 18, age }; })) puff(c, p.x, p.y, 1.5 + p.age * 3, '#3a3448', (1 - p.age) * 0.7);
      X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 7, EL.fire[1], 0.8 * on);
    } else if (kind === 'cold') {
      // organic frost: curling wisps of cold mist, a haze of fine crystal glitter, and a
      // soft billow where the breath spreads out
      for (const p of emit(t, 26 * k, 0.75, (i, age, ts) => {
        if (!live(ts)) return null;
        const [vx, vy] = dir(i, 11), cu = (rand(i, 16) - 0.5) * 2;
        return { vx, vy, cu, age, i };
      })) {
        // a wisp: a short curved trail of mist, thinning and paling with age
        const n = 7;
        for (let j = 0; j < n; j++) {
          const a2 = Math.max(0, p.age - j * 0.035), d = easeOut(a2) * Lz * (0.85 + rand(p.i, 12) * 0.3), sw = Math.sin(a2 * 7 + p.i) * (2 + a2 * 5) * p.cu;
          const x = o[0] + p.vx * d - p.vy * sw, y = o[1] + p.vy * d + p.vx * sw - a2 * 3;
          const fade = (1 - p.age) * (1 - j / n);
          if (fade < 0.15 || fade < X.bay(Math.round(x), Math.round(y)) * 0.8) continue;
          X.px(c, x, y, a2 < 0.3 ? EL.cold[1] : a2 < 0.6 ? EL.cold[2] : '#bfe8f4');
        }
      }
      for (const p of emit(t, 150 * k, 0.65, (i, age, ts) => {
        if (!live(ts)) return null;
        const [vx, vy] = dir(i, 11), d = easeOut(age) * Lz * (0.75 + rand(i, 12) * 0.45), sw = Math.sin(age * 6 + i) * 2.5;
        return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw + age * age * 3, age, r: rand(i, 13) };
      })) {
        const tw = (Math.floor(t * 20) + p.r * 97 | 0) % 4 === 0;
        X.px(c, p.x, p.y, tw || p.r > 0.85 ? '#ffffff' : p.age < 0.5 ? EL.cold[1] : EL.cold[3]);
      }
      for (const p of emit(t, 16 * k, 1.0, (i, age, ts) => { if (!live(ts)) return null; const d = (0.45 + easeOut(age) * 0.65) * Lz; return { x: o[0] + ux * d + (rand(i, 14) - 0.5) * 12 * age, y: o[1] + uy * d + (rand(i, 15) - 0.5) * 9 * age - age * 2, age }; })) X.glow(c, p.x, p.y, 3 + p.age * 7, '#dffaff', 0.38 * (1 - p.age));
      X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 6, EL.cold[1], 0.75 * on);
    }
  }

  // ---------------------------------------------------------------------------
  // Area: a ring band that expands from (x, y) to R between t0 and t0+dur.
  function nova(c, x, y, t, t0, dur, Rmax, Rp, opt = {}) {
    const e = (t - t0) / dur; if (e < 0 || e > 1.25) return -1;
    const k = easeOut(Math.min(1, e)), r = 4 + (Rmax - 4) * k, a = 1 - seg(e, 0.6, 1.2);
    gring(c, x, y, r + 1, Rp[3], a * 0.8, 1);
    gring(c, x, y, r, Rp[1], a, 2);
    gring(c, x, y, r - 2, Rp[2], a * 0.8, 2);
    if (e < 0.08) X.ellipse(c, x, y - 4, 10, 8, '#ffffff', 1 - e / 0.08);
    // particles riding the front
    const n = opt.n || 26;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + rand(i, 3, opt.seed || 0) * 0.2, rr = r + (rand(i, 4) - 0.5) * 4;
      if (rand(i, 5, Math.floor(t * 20)) > a + 0.1) continue;
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * FY - (opt.lift || 0) * rand(i, 6) * Math.sin(e * Math.PI);
      sq(c, px, py, i % 3 ? 1 : 2, i % 2 ? Rp[0] : Rp[2]);
    }
    return r;
  }

  // jagged bolt with branches; R = ramp
  function zap(c, a, z, seed, R = EL.lightning, w = 3, branches = 2) {
    const pts = bolt(a, z, seed, 0.32, 4);
    X.lines(c, pts, R[3], w); X.lines(c, pts, R[1], 1);
    for (let k = 0; k < branches; k++) {
      const j = 2 + Math.floor(rand(seed, k, 1) * (pts.length - 4)), p = pts[j], a2 = rand(seed, k, 2) * TAU;
      X.lines(c, bolt(p, [p[0] + Math.cos(a2) * 9, p[1] + Math.sin(a2) * 7], seed + k * 7, 0.5, 2), R[2], 1);
    }
    return pts;
  }
  function zapHit(c, p, seed, R = EL.lightning) { X.glow(c, p[0], p[1], 9, R[2], 0.8); for (let k = 0; k < 5; k++) { const a2 = rand(seed, k, 3) * TAU; X.line(c, p[0], p[1], p[0] + Math.cos(a2) * 5, p[1] + Math.sin(a2) * 4, '#ffffff'); } }

  // ---------------------------------------------------------------------------
  // Statuses on actors (unlit pass). A = anchors from the stage.
  function burning(c, A, s, t, k = 1) {
    const a = A[s.id]; if (!a || !a.chest || k < 0.05) return;
    const big = s.kind === 'brute', ch = a.chest, hd = a.head || ch;
    const spots = big ? [[-5, -4, 3], [3, -7, 3.2], [7, -1, 2.6], [-1, 0, 2.6]] : [[-1, -2, 2], [2, 1, 1.8], [0, -5, 1.6]];
    spots.forEach(([dx, dy, w], j) => tongue(c, ch[0] + dx, ch[1] + dy, w * (0.6 + 0.4 * k), (6 + 3 * Math.sin(t * 14 + j * 1.9)) * k * (big ? 1.25 : 1), Math.sin(t * 7 + j) * 2));
    for (const p of emit(t, (big ? 30 : 14), 0.55, (i, age) => ({ x: ch[0] + (rand(i, 1, s.seed) - 0.5) * (big ? 16 : 8) + Math.sin(age * 7 + i) * 1.5, y: ch[1] + (rand(i, 2, s.seed) - 0.5) * 8 - age * 20, age }))) if (rand(p.x | 0, 3) < k + 0.2) sq(c, p.x, p.y, p.age < 0.3 ? 2 : 1, fireCol(p.age));
    for (const p of emit(t, 4, 1.4, (i, age) => ({ x: hd[0] + (rand(i, 4, s.seed) - 0.5) * 6 + age * 7, y: hd[1] - 6 - age * 22, age }))) puff(c, p.x, p.y, 1.5 + p.age * 3.5, '#3a3448', (1 - p.age) * 0.55 * k);
  }
  function dripping(c, A, s, t) { const a = A[s.id]; if (!a || !a.chest) return; const ch = a.chest; for (const p of emit(t, 6, 0.5, (i, age) => ({ x: ch[0] + (rand(i, 9, s.seed) - 0.5) * 8, y: ch[1] - 2 + age * age * 14, age }))) X.px(c, p.x, p.y, '#8ad0ff'); }
  function frosty(c, A, s, t) { for (const p of emit(t, 5, 1.2, (i, age) => ({ x: s.x + (rand(i, 3, s.seed) - 0.5) * 14, y: s.y - rand(i, 4, s.seed) * 18 - age * 6, age }))) if (p.age < 0.8) X.px(c, p.x, p.y, p.age < 0.3 ? '#ffffff' : '#9ff4ff'); }
  // chilled: the body itself carries it (s.chill tints it and grows rime, see actors.js);
  // this adds glints twinkling on the body and a breath of cold mist sinking off it
  function chilled(c, A, s, t, k = 1) {
    const a = A[s.id]; if (!a || !a.chest || k < 0.05) return;
    const ch = a.chest, hd = a.head || ch, big = s.kind === 'brute' ? 1.8 : 1;
    for (let i = 0; i < 4; i++) { const ph = PB.mod(t * 1.7 + i * 0.37 + (s.seed || 0) * 0.13, 1); if (ph > 0.3 || rand(i, s.seed, 31) > k) continue; const x = ch[0] + (rand(i, Math.floor(t * 1.7 + i * 0.37), 32) - 0.5) * 8 * big, y = ch[1] + (rand(i, Math.floor(t * 1.7 + i * 0.37), 33) - 0.6) * 10 * big; X.px(c, x, y, '#ffffff'); if (ph < 0.15) { X.px(c, x - 1, y, EL.cold[1]); X.px(c, x + 1, y, EL.cold[1]); X.px(c, x, y - 1, EL.cold[1]); X.px(c, x, y + 1, EL.cold[1]); } }
    for (const p of emit(t, 5, 1.1, (i, age) => ({ x: hd[0] + 2 + (rand(i, 34, s.seed) - 0.3) * 5 * big + age * 3, y: hd[1] + 2 + age * 7, age }))) if (rand(p.x | 0, p.y | 0) < k) X.glow(c, p.x, p.y, 2 + p.age * 2.5, '#e0ffff', 0.45 * (1 - p.age));
  }
  // Status pips over heads are gone (the user wants statuses on the body). Kept as a no-op
  // so older call sites stay harmless.
  function pip() {}
  // green pluses rising off a healed body
  function heals(c, A, s, t, k = 1, R = EL.life) {
    const a = A[s.id]; if (!a || k < 0.05) return;
    for (const p of emit(t, 7, 0.9, (i, age) => ({ x: s.x + (rand(i, 61, s.seed) - 0.5) * 14, y: s.y - 4 - rand(i, 62, s.seed) * 10 - age * 14, age, i }))) {
      if (rand(p.i, 63) > k) continue;
      const col = p.age < 0.5 ? R[0] : R[1];
      if (p.i % 2) { X.rect(c, p.x - 1, p.y, 3, 1, col); X.rect(c, p.x, p.y - 1, 1, 3, col); } else X.px(c, p.x, p.y, R[1]);
    }
  }

  // dust, debris and smoke
  function dust(c, x, y, e, seed, n = 8, spread = 16, col = '#7a6a5a', life = 1) {
    const age = e / life; if (age < 0 || age >= 1) return;
    for (let k = 0; k < n; k++) { const a2 = rand(k, seed, 1) * TAU, d = spread * easeOut(age) * (0.5 + rand(k, seed, 2) * 0.6); puff(c, x + Math.cos(a2) * d, y + Math.sin(a2) * d * 0.5 - age * 6, 1.5 + age * 4, col, (1 - age) * 0.95); }
  }
  function debris(c, x, y, e, seed, n = 10, speed = 40, cols = ['#977552', '#553e2a'], lift = 50) {
    if (e < 0 || e > 1.2) return;
    for (let k = 0; k < n; k++) {
      const a2 = rand(k, seed, 81) * TAU, sp = speed * (0.4 + rand(k, seed, 82) * 0.6), vz = lift * (0.6 + rand(k, seed, 83) * 0.8);
      const z = vz * e - 140 * e * e; if (z < -1) continue;
      X.rect(c, x + Math.cos(a2) * sp * e, y + Math.sin(a2) * sp * e * FY - Math.max(0, z), k % 3 ? 1 : 2, k % 3 ? 1 : 2, cols[k % cols.length]);
    }
  }
  // radial ground cracks, k = 0..1 how far they have run
  function cracks(c, x, y, r, seed, k, col = '#1a120c', n = 6) {
    for (let i = 0; i < n; i++) {
      let a2 = (i / n) * TAU + rand(i, seed) * 0.6, px = x, py = y; const L = r * k * (0.6 + rand(i, seed, 2) * 0.5);
      for (let d = 0; d < L; d += 3) { a2 += (rand(i, d, seed) - 0.5) * 0.9; const nx = px + Math.cos(a2) * 3, ny = py + Math.sin(a2) * 3 * FY; X.line(c, px, py, nx, ny, col); px = nx; py = ny; }
    }
  }
  function scorch(c, x, y, r, a = 0.7) { X.ellipse(c, x, y, r, r * FY * 0.6, `rgba(22,14,16,${a.toFixed(2)})`); }

  // a rock, lit from the upper left, outlined
  function rock(c, x, y, r, seed, hot = 0) {
    const pts = []; for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, rr = r * (0.8 + rand(i, seed) * 0.35); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]); }
    X.poly(c, pts.map(([px2, py2]) => [px2 + (px2 - x) * 0.25 + 0.5, py2 + (py2 - y) * 0.25 + 0.5]), '#1a120c');
    X.poly(c, pts, hot > 0.5 ? '#6a2a1a' : '#76583c');
    X.ellipse(c, x - r * 0.25, y - r * 0.3, r * 0.55, r * 0.4, hot > 0.5 ? '#c8502a' : '#b8946a');
    X.px(c, x - r * 0.4, y - r * 0.45, hot > 0.5 ? '#ffd860' : '#e0c8a0');
    X.line(c, x + r * 0.1, y + r * 0.6, x + r * 0.6, y + r * 0.1, hot > 0.5 ? '#3a1410' : '#553e2a');
    if (hot > 0) { X.px(c, x + 1, y, '#ff9a30'); X.px(c, x - 1, y + 1, '#ff5a20'); }
  }

  // ---------------------------------------------------------------------------
  // Reticle: where the cursor is for a Place cast. The ring tightens as the hold lands.
  function reticle(c, x, y, t, col = '#e8e4f0', k = 1) {
    if (k <= 0) return;
    const r = 6 + (1 - k) * 6;
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + t * 1.5, x0 = x + Math.cos(a) * r, y0 = y + Math.sin(a) * r * FY; X.line(c, x0, y0, x0 + Math.cos(a) * 3, y0 + Math.sin(a) * 3 * FY, col); }
    X.px(c, x, y, col);
  }
  // a drag path being drawn (dotted, in the caster's team colour)
  function dragPath(c, pts, k, col, t) { const n = Math.floor((pts.length - 1) * k); for (let i = 0; i <= n; i++) if ((i + Math.floor(t * 12)) % 3) X.px(c, pts[i][0], pts[i][1], col); }
  // sample a polyline every `step` pixels
  function sample(pts, step = 3, closed = false) {
    const P = closed ? pts.concat([pts[0]]) : pts, out = [];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], (b[1] - a[1]) / FY), n = Math.max(1, Math.round(L / step));
      for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
    }
    if (!closed) out.push(P[P.length - 1]);
    return out;
  }
  const arcPts = (x, y, r, a0, a1, n = 24) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([x + Math.cos(a) * r, y + Math.sin(a) * r * FY]); } return o; };
  const circlePts = (x, y, r, n = 36) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; o.push([x + Math.cos(a) * r, y + Math.sin(a) * r * FY]); } return o; };

  // ---------------------------------------------------------------------------
  // Walls extruded from a line on the ground: a solid slab with a lit top, banded
  // strata on the faces the camera sees, a dark outline and contact shadow. o:
  //   h (px tall), th (half thickness), rise(f) -> 0..1, closed, seed,
  //   mat: 'rock' | 'stone' (dressed blocks), dmg: [{ f, k }] cracks and notches at f.
  const ROCK = ['#e0c8a0', '#b8946a', '#977552', '#76583c', '#553e2a', '#33241a'];
  const STONE = ['#c8c4cc', '#a29ea8', '#827e8a', '#625e6c', '#46424e', '#2a2632'];
  // Wall damage, laid out in wall space: s = segments from the damage centre, z = px up.
  // Fresh broken rock is lighter than the weathered face, so damage reads on dark faces:
  // dark cracks with a lit lip, pale spalls (chips knocked off), a dark hole at heavy
  // damage, and rubble at the foot. k = 0..1; more of the pattern shows as k grows.
  const dmgCache = new Map();
  function damagePattern(d, H, seed) {
    const key = d.f + ':' + H + ':' + seed;
    if (dmgCache.has(key)) return dmgCache.get(key);
    const cr = [], chips = [], rub = [];
    // main crack from the top down, and branches; each point remembers the k it appears at
    const run = (s, z, ds, len, k0, w, sd) => { for (let j = 0; j < len; j++) { s += ds + (rand(j, sd, seed) - 0.5) * 0.28; z -= 1; if (z < 1) break; cr.push({ s, z, k: k0 + (j / len) * 0.3, w }); if (w > 1 && j > len * 0.6) w = 1; } };
    run(0.1, H + 1, 0, Math.round(H * 0.95), 0.02, 2, 1);
    run(0.1, H - 3, 0.22, Math.round(H * 0.45), 0.3, 1, 2);
    run(0.1, H - 6, -0.26, Math.round(H * 0.5), 0.36, 1, 3);
    run(-0.6, H * 0.55, -0.2, Math.round(H * 0.3), 0.62, 1, 4);
    run(0.5, H * 0.45, 0.28, Math.round(H * 0.3), 0.7, 1, 5);
    for (let j = 0; j < 10; j++) chips.push({ s: (rand(j, 11, seed) - 0.5) * 4.6, z: H * (0.2 + rand(j, 12, seed) * 0.75), k: 0.12 + (j / 10) * 0.8, w: rand(j, 13, seed) < 0.4 ? 3 : 2 });
    for (let j = 0; j < 9; j++) rub.push({ s: (rand(j, 21, seed) - 0.5) * 5, dy: 1 + rand(j, 22, seed) * 3.5, k: 0.15 + (j / 9) * 0.8, big: j % 3 === 0 });
    const v = { cr, chips, rub };
    dmgCache.set(key, v);
    return v;
  }
  function wall(D, pts, o) {
    const P = sample(pts, 3, o.closed), segs = o.closed ? P.length : P.length - 1, R = o.mat === 'stone' ? STONE : ROCK, seed = o.seed || 1;
    const dsOf = (f, d) => { let x = (f - d.f) * segs; if (o.closed) { if (x > segs / 2) x -= segs; if (x < -segs / 2) x += segs; } return x; };
    for (let i = 0; i < segs; i++) {
      const p = P[i], q = P[(i + 1) % P.length], f = (i + 0.5) / segs;
      let hgt = o.h * (o.rise ? o.rise(f) : 1) * (0.9 + rand(i, seed, 1) * 0.2);
      let crack = 0, notch = 0;
      const near = [];
      for (const d of o.dmg || []) {
        if (d.k < 0.02) continue;
        const ds = dsOf(f, d), dd = Math.abs(ds);
        if (dd < 4) crack = Math.max(crack, d.k * (1 - dd / 4));
        if (dd < 3.5) near.push({ d, ds });
        // a heavily damaged spot loses a jagged bite out of its top
        if (d.k > 0.3 && dd < 1.8) notch = Math.max(notch, ((d.k - 0.3) / 0.7) * (1 - dd / 2.2) * (0.75 + rand(i, seed, 9) * 0.5));
      }
      hgt *= 1 - 0.5 * clamp(notch, 0, 1);
      if (hgt < 0.5) continue;
      const gx = q[0] - p[0], gy = (q[1] - p[1]) / FY, gl = Math.hypot(gx, gy) || 1, ux = gx / gl, uy = gy / gl, ext = 0.6;
      // the footprint quad, stretched a little along the wall so neighbours overlap
      const off = (pt, a, b) => [pt[0] + (-uy * a + ux * b), pt[1] + (ux * a + uy * b) * FY];
      const Qd = [off(p, o.th, -ext), off(q, o.th, ext), off(q, -o.th, ext), off(p, -o.th, -ext)];
      const y = Math.max(...Qd.map((v) => v[1]));
      // every footprint edge whose outward normal points toward the camera is extruded
      const faces = [];
      for (let k = 0; k < 4; k++) {
        const a = Qd[k], b = Qd[(k + 1) % 4], ex = b[0] - a[0], ey = (b[1] - a[1]) / FY, el = Math.hypot(ex, ey) || 1;
        const nx = -ey / el, ny = ex / el;   // outward for this winding
        if (ny <= 0.05) continue;
        const lit = clamp(0.5 + (-nx * 0.8 - ny * 0.3) * 0.6, 0, 1);
        faces.push({ a, b, col: lit > 0.55 ? R[2] : lit > 0.36 ? R[3] : R[4], long: el > 2, dir: k === 0 ? 1 : k === 2 ? -1 : 0 });
      }
      D.push([y, (c) => {
        const up = (pt, z) => [pt[0], pt[1] - z];
        for (const F of faces) if (F.long) X.poly(c, [[F.a[0], F.a[1] + 1.5], [F.b[0], F.b[1] + 1.5], up(F.b, hgt + 1), up(F.a, hgt + 1)], '#140e0a');
        for (const F of faces) {
          X.poly(c, [F.a, F.b, up(F.b, hgt), up(F.a, hgt)], F.long ? F.col : R[3]);
          if (!F.long) { X.px(c, F.b[0], F.b[1] - hgt * 0.5, R[4]); continue; }   // short caps between pieces: no seams
          // strata (rock) or courses of dressed blocks (stone)
          for (let z = 3; z < hgt - 1; z += 4) {
            const zz = z + (o.mat === 'stone' ? 0 : Math.round(Math.sin(i * 0.7 + z) * 0.6));
            X.line(c, F.a[0], F.a[1] - zz, F.b[0], F.b[1] - zz, R[5]);
            if (o.mat === 'stone' && (i + (z >> 2)) % 3 === 0) X.line(c, F.a[0], F.a[1] - zz, F.a[0], F.a[1] - zz - 3, R[5]);
          }
          X.line(c, F.a[0], F.a[1], F.b[0], F.b[1], R[5]);
        }
        if (o.mat !== 'stone' && rand(i, seed, 5) < 0.25 && faces[0]) X.px(c, faces[0].a[0] + 1, faces[0].a[1] - hgt * 0.5, R[1]);
        // top face, lit, outlined, with a highlight on the edge nearest the camera
        const T = Qd.map((v) => up(v, hgt));
        X.poly(c, T, R[1]);
        X.line(c, Qd[3][0], Qd[3][1] - hgt - 1, Qd[2][0], Qd[2][1] - hgt - 1, '#140e0a');   // back edge outline
        if (rand(i, seed, 8) < 0.3) X.px(c, (T[0][0] + T[2][0]) / 2, (T[0][1] + T[2][1]) / 2, R[2]);   // a pit in the top
        for (const F of faces) if (F.long) X.line(c, F.a[0], F.a[1] - hgt, F.b[0], F.b[1] - hgt, R[0]);
        // damage, drawn by the segment it falls on so depth order stays right
        if (near.length) {
          const F = faces.find((f) => f.long && f.dir);
          if (F) {
            const at = (s, z) => { const u = 0.5 + s * F.dir; return u < -0.05 || u > 1.05 ? null : [lerp(F.a[0], F.b[0], u), lerp(F.a[1], F.b[1], u) - z]; };
            for (const { d, ds } of near) {
              const Pn = damagePattern(d, o.h, seed), k = d.k;
              // the bitten top shows fresh pale rock along its broken edge
              if (notch > 0.05) for (const tf of faces) if (tf.long) { X.line(c, tf.a[0], tf.a[1] - hgt, tf.b[0], tf.b[1] - hgt, R[1]); X.line(c, tf.a[0], tf.a[1] - hgt + 1, tf.b[0], tf.b[1] - hgt + 1, R[0]); }
              for (const ch of Pn.chips) { if (ch.k > k) continue; const p2 = at(ch.s - ds, ch.z); if (!p2 || ch.z > hgt - 1) continue; X.rect(c, p2[0] - 1, p2[1] - 1, ch.w, 2, R[1]); X.px(c, p2[0] - 1, p2[1] - 1, R[0]); X.rect(c, p2[0] - 1, p2[1] + 1, ch.w, 1, '#140e0a'); }
              for (const pt of Pn.cr) { if (pt.k > k) continue; const p2 = at(pt.s - ds, pt.z); if (!p2 || pt.z > hgt) continue; X.px(c, p2[0] + 1, p2[1], R[0]); }
              for (const pt of Pn.cr) { if (pt.k > k) continue; const p2 = at(pt.s - ds, pt.z); if (!p2 || pt.z > hgt) continue; X.px(c, p2[0], p2[1], '#140e0a'); if (pt.w > 1 && k > 0.5) X.px(c, p2[0] - 1, p2[1], '#140e0a'); }
              if (k > 0.6) { const p2 = at(-ds, hgt * 0.5); if (p2) { X.rect(c, p2[0] - 2, p2[1] - 1, 4, 3, '#0c0806'); X.line(c, p2[0] - 2, p2[1] + 2, p2[0] + 1, p2[1] + 2, R[1]); } }
              for (const rb of Pn.rub) { if (rb.k > k) continue; const p2 = at(rb.s - ds, 0); if (!p2) continue; const y = p2[1] + rb.dy; if (rb.big) { X.rect(c, p2[0] - 1, y - 1, 3, 2, R[2]); X.px(c, p2[0] - 1, y - 1, R[0]); X.rect(c, p2[0] - 1, y + 1, 3, 1, '#140e0a'); } else { X.px(c, p2[0], y, R[1]); X.px(c, p2[0], y + 1, '#140e0a'); } }
            }
          }
        }
      }]);
    }
  }

  // An energy sheet along a line: translucent fill, a bright base line and crest, scan
  // bands climbing it, rings where hits land. fade 0..1 thins it out (runes running low).
  function sheet(D, pts, o, t) {
    const P = sample(pts, 1.5, o.closed), R = o.ramp || EL.shield, fade = o.fade || 0, n = P.length;
    const chunk = 6;
    for (let s0 = 0; s0 < n - 1; s0 += chunk) {
      const part = P.slice(s0, Math.min(n, s0 + chunk + 1)), mid = part[part.length >> 1];
      D.push([mid[1], (c, E) => {
        const cols = part.map((p, j) => { const f = (s0 + j) / n; return { f, x: p[0], y: p[1], hh: o.h * (o.rise ? o.rise(f) : 1) + Math.sin(f * 23 + t * 6) * 0.8 }; });
        const live = cols.filter((q) => q.hh > 1);
        if (live.length < 2) return;
        const a = (o.alpha || 0.16) * (1 - fade * 0.6);
        X.poly(c, live.map((q) => [q.x, q.y - q.hh]).concat(live.slice().reverse().map((q) => [q.x, q.y + 0.5])), `rgba(${o.rgb || '255,214,110'},${a.toFixed(2)})`);
        E.em((cc) => {
          for (const q of live) {
            const x = Math.round(q.x), y0 = Math.round(q.y), hh = Math.round(q.hh), gap = fade > 0 && rand(Math.round(q.f * 300), Math.floor(t * 10)) < fade * 0.75;
            X.px(cc, x, y0, R[1]);
            if (!gap) X.px(cc, x, y0 - hh, rand(Math.round(q.f * 200), Math.floor(t * 14)) < 0.8 ? R[0] : R[2]);
            for (let z = 2; z < hh - 1; z++) {
              const zt = z - t * 14, bnd = mod(zt, 5);
              if (bnd < 1 && rand(Math.floor(q.f * 40), Math.floor(zt / 5) & 63, 3) < 0.6 * (1 - fade)) X.px(cc, x, y0 - z, z > hh * 0.6 ? R[1] : R[2]);
              else if (z === 1 || (z === 2 && (x & 1))) X.px(cc, x, y0 - z, R[2]);
            }
            for (const rp of o.hits || []) {
              const dx = (q.f - rp.f) * (o.span || 120), e = rp.e;
              if (e < 0 || e > 0.6 || Math.abs(dx) > 22) continue;
              for (let z = 1; z < hh; z++) { const dd = Math.hypot(dx, z - rp.hz), r = e * 26; if (Math.abs(dd - r) < 0.9) X.px(cc, x, y0 - z, e < 0.25 ? '#ffffff' : R[1]); else if (dd < 3 && e < 0.1) X.px(cc, x, y0 - z, '#ffffff'); }
            }
          }
        });
      }]);
    }
  }

  // A curtain of an element along a line: you can walk through, but crossing burns.
  function fireCurtain(D, pts, h, t, rise = () => 1) {
    const P = sample(pts, 4);
    P.forEach((p, i) => {
      const f = i / (P.length - 1), k = rise(f); if (k < 0.05) return;
      D.push([p[1], (c, E) => E.em((cc) => {
        tongue(cc, p[0] + (rand(i, 5) - 0.5) * 2, p[1], 2.4, (h * 0.7 + Math.sin(t * 12 + i * 1.7) * 3 + rand(i, 6) * 3) * k, Math.sin(t * 6 + i) * 1.6);
        if (i % 2) tongue(cc, p[0] + 2, p[1] + 1, 1.6, (h * 0.45 + Math.sin(t * 15 + i) * 2) * k, Math.sin(t * 8 + i) * 1.2);
      })]);
    });
  }

  // ---------------------------------------------------------------------------
  // Glyph on the ground (emissive). draw 0..1 writes it in; armed pulses; R = ramp.
  function glyph(c, x, y, r, R, t, o = {}) {
    const draw = o.draw == null ? 1 : o.draw, reach = draw * TAU, rot = t * 0.5, pulse = 0.65 + 0.3 * Math.sin(t * 5);
    X.ring(c, x, y, r, r * FY, R[2], o.armed ? Math.min(1, pulse + 0.25) : 1, rot, rot + reach);
    X.ring(c, x, y, r * 0.62, r * 0.62 * FY, R[3], o.armed ? pulse : 0.9, -rot, -rot + reach * 0.999);
    for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; if (a - rot > reach) continue; const px2 = x + Math.cos(a) * r * 0.82, py2 = y + Math.sin(a) * r * 0.82 * FY; X.rect(c, px2 - 0.5, py2 - 0.5, 2, 1, R[1]); }
    if (o.inner && draw > 0.9) X.icon(c, o.inner, x - 3, y - 3, o.innerCol || R[1]);
    else if (draw > 0.9) { X.px(c, x, y - 1, R[1]); X.px(c, x - 1, y, R[2]); X.px(c, x + 1, y, R[2]); X.px(c, x, y + 1, R[2]); }
  }
  // a glyph written along a line: a double rail with rune ticks
  function lineGlyph(c, pts, R, t, draw = 1, armed = false) {
    const P = sample(pts, 2), n = Math.floor((P.length - 1) * draw), pulse = 0.6 + 0.3 * Math.sin(t * 5);
    for (let i = 0; i <= n; i++) {
      const p = P[i], q = P[Math.min(P.length - 1, i + 1)], gx = q[0] - p[0], gy = (q[1] - p[1]) / FY, gl = Math.hypot(gx, gy) || 1, nx = -gy / gl * 2.5, ny = gx / gl * 2.5 * FY;
      const a = armed ? pulse : 1;
      if (a >= 1 || a > X.bay(Math.round(p[0]), Math.round(p[1]))) { X.px(c, p[0] + nx, p[1] + ny, R[2]); X.px(c, p[0] - nx, p[1] - ny, R[2]); }
      if (i % 4 === 0) { X.px(c, p[0], p[1], R[1]); X.px(c, p[0] + nx * 0.5, p[1] + ny * 0.5 - 1, R[3]); }
    }
  }

  // ---------------------------------------------------------------------------
  // ---- The Sigil device (pass 4: the user found the plinth-and-orb "a torch on a cube") ----
  // A low carved dais with a violet groove; above it a hovering crystal in the payload's
  // colours (the look); three runic stone plates orbit the crystal, their runes glowing
  // violet (the form). Charge: the plates pull in and the crystal stretches and whitens.
  // Recoil: the crystal kicks up, the plates flare out. Dry: the crystal sinks to a dull
  // ember, the plates droop and their runes dim. The same function is copied into
  // tools/art-pixel-hd/render.js (sigilDevice); keep the two in step.
  // op(fn) / em(fn) draw fn(c) as opaque (lit) or emissive pixels.
  function sigilDevice(op, em, x, y, t, o) {
    const R = o.R, SV = o.SV, fy = o.FY, rise = o.rise == null ? 1 : o.rise, rec = o.recoil || 0, ch = o.charge || 0, dry = o.dry || 0, feed = o.feed || 0;
    if (rise <= 0.02) return null;
    x = Math.round(x); y = Math.round(y);
    const Z = (o.orbZ || 14) * (0.35 + 0.65 * smooth(rise)), lit = dry > 0.5 ? 0 : 1;
    // the dais: a low round stone with a lit top and a socket
    const drx = 5, dry2 = Math.max(2.5, drx * fy * 0.8), dh = 2;
    op((c) => {
      X.ellipse(c, x, y + 1, drx + 1, dry2 + 1, '#14101c');
      X.ellipse(c, x, y, drx, dry2, '#2e2a3a');
      X.ellipse(c, x, y - dh, drx, dry2, '#5e5a6c');
      X.ellipse(c, x - 1, y - dh - 1, drx - 2.2, dry2 - 1.4, '#77738a');
      X.ellipse(c, x, y - dh, 2.6, dry2 * 0.45, '#1c1826');
    });
    em((c) => {
      X.ring(c, x, y - dh, 4.4, dry2 * 0.72, dry ? SV[4] : SV[3], 1);
      for (let k = 0; k < 4; k++) { const a = -t * 0.8 + k * TAU / 4; if (dry && (k + Math.floor(t * 6)) % 2) continue; X.px(c, x + Math.cos(a) * 4.4, y - dh + Math.sin(a) * dry2 * 0.72, dry ? SV[3] : SV[1]); }
      // a faint violet column of light from the socket up to the crystal (it hovers on it)
      if (!dry) for (let z = dh + 2; z < Z - 4; z += 2) if ((z + Math.floor(t * 10)) % 4 < 2) X.px(c, x, y - z, SV[3]);
    });
    // the orbiting plates
    const plates = [0, 1, 2].map((i) => {
      const a = t * 0.9 + i * TAU / 3, r = (9 + 3 * rec - 2 * ch) * smooth(rise), s = Math.sin(a);
      return { i, s, x: x + Math.cos(a) * r, y: y + s * r * fy, z: (Z - 1 + Math.sin(t * 2.3 + i * 2.1) * 1.2 - 6 * dry) };
    });
    const plate = (p) => {
      const w = 0.6 + 1.6 * Math.abs(p.s), cx = Math.round(p.x), top = Math.round(p.y - p.z - 4);
      // a carved tablet: square shoulders, a chipped point at the bottom
      const pts = (k) => [[cx + 0.5 - w + 0.5, top - 1 - k], [cx + 0.5 + w - 0.5, top - 1 - k], [cx + 0.5 + w + k, top], [cx + 0.5 + w + k, top + 5], [cx + 0.5, top + 7 + k], [cx + 0.5 - w - k, top + 5], [cx + 0.5 - w - k, top]];
      op((c) => {
        X.poly(c, pts(1), '#14101c');
        X.poly(c, pts(0), '#4e4a5c');
        if (w > 1) X.rect(c, cx - Math.floor(w), top, 1, 5, '#7e7a90');
        X.px(c, cx, top - 1, '#8a869c');
      });
      if (p.s > -0.3) em((c) => {
        const col = dry ? SV[4] : ch > 0.5 || rec > 0.5 ? SV[0] : SV[1];
        X.rect(c, cx, top + 1, 1, 3, col); X.px(c, cx, top + 5, dry ? SV[4] : SV[2]);
        if (w > 1.4) { X.px(c, cx - 1, top + 2, dry ? SV[4] : SV[2]); X.px(c, cx + 1, top + 2, dry ? SV[4] : SV[2]); }
      });
    };
    for (const p of plates) if (p.s < 0) plate(p);
    // the hovering crystal (the payload's look)
    const bob = Math.round(Math.sin(t * 3) * 1), cy = Math.round(y - Z + bob + dry * 2 - rec * 2);
    const hw = 3.6 + rec * 1.2 - ch * 0.6, hu = 7 + ch * 1.5 - rec * 1.5, hd = 5;
    em((c) => {
      const C = dry ? { lt: R[4], mid: R[5] || R[4], dk: '#2a0a18', core: rand(Math.floor(t * 12), 5) < 0.5 ? R[3] : R[4], edge: SV[4] }
        : { lt: R[1], mid: R[2], dk: R[3], core: ch > 0.5 || rec > 0.4 || feed > 0.5 ? '#ffffff' : R[0], edge: SV[3] };
      // the halo, back half
      if (!dry) X.ring(c, x, cy + 1, 7, 2, SV[3], 1, Math.PI, TAU);
      X.poly(c, [[x + 0.5, cy - hu - 1], [x + 1.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 2], [x - 0.5 - hw, cy + 0.5]], C.edge);
      X.poly(c, [[x + 0.5, cy - hu], [x + 0.5, cy + 0.5], [x + 0.5 - hw, cy + 0.5]], C.lt);
      X.poly(c, [[x + 0.5, cy - hu], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + 0.5]], C.mid);
      X.poly(c, [[x + 0.5 - hw, cy + 0.5], [x + 0.5, cy + 0.5], [x + 0.5, cy + hd + 1]], C.mid);
      X.poly(c, [[x + 0.5, cy + 0.5], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 1]], C.dk);
      X.rect(c, x, cy - 2, 1, 3, C.core); if (!dry) X.px(c, x - 1, cy - 1, C.lt === R[1] ? R[0] : C.core);
      if (!dry) X.px(c, x - 1, cy - hu + 2, '#ffffff');
      // the halo, front half: a dashed violet ring round the crystal's waist
      if (!dry) for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI, q = (k + Math.floor(t * 8)) % 4; if (q === 3) continue; X.px(c, x + Math.cos(a) * 7, cy + 1 + Math.sin(a) * 2, q === 0 ? SV[1] : SV[2]); }
    });
    for (const p of plates) if (p.s >= 0) plate(p);
    return { orb: [x, cy], top: [x, cy - hu], lit };
  }
  // The rune ring on the ground under a device: a dotted violet circle with six small
  // runes turning slowly round it; dim and blinking while the device waits (dry).
  const RUNES = [[[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, 0], [0, 0], [1, 0], [0, 1]], [[-1, -1], [0, 0], [1, 1], [1, -1]], [[0, -1], [-1, 1], [1, 1], [0, 0]], [[-1, -1], [-1, 0], [0, 1], [1, 1]], [[0, -1], [0, 1], [-1, 0], [1, 1]]];
  function runeRing(c, x, y, r, t, a = 1, o = {}) {
    if (a <= 0.05) return;
    const fy = o.FY || FY, R = o.SV || EL.sigil, dry = o.dry || 0;
    X.ring(c, x, y, r, r * fy, R[3], 0.75 * a);
    X.ring(c, x, y, r - 3, (r - 3) * fy, R[4], 0.6 * a, t * 0.7, t * 0.7 + Math.PI * 1.2);
    for (let i = 0; i < 6; i++) {
      const ang = t * 0.5 + (i / 6) * TAU, px2 = Math.round(x + Math.cos(ang) * (r - 1.5)), py2 = Math.round(y + Math.sin(ang) * (r - 1.5) * fy);
      if (a < 1 && rand(i, 9) > a) continue;
      const col = dry ? ((i + Math.floor(t * 5)) % 3 ? R[4] : R[3]) : (i + Math.floor(t * 3)) % 6 === 0 ? R[0] : R[1];
      for (const [dx, dy] of RUNES[i]) X.px(c, px2 + dx, py2 + dy, col);
    }
  }
  // A Sigil device in a vignette's stand pass (wraps sigilDevice for the gallery).
  function device(D, x, y, el, t, o = {}) {
    const rise = o.rise == null ? 1 : o.rise;
    if (rise <= 0) return;
    D.push([y, (c, E) => {
      X.ellipse(c, x + 2, y + 2, 8, 3, 'rgba(8,6,16,0.5)');
      const r = sigilDevice(E.op, E.em, x, y, t, { R: EL[el] || EL.sigil, SV: EL.sigil, FY, rise, recoil: o.recoil, charge: o.charge, dry: o.empty ? 1 : o.dry, feed: o.feed, orbZ: o.orbZ || 17 });
      if (o.out && r) Object.assign(o.out, r);
    }]);
  }
  // the violet seal ring under a device or an aura (ground, emissive)
  function seal(c, x, y, r, t, a = 1, R = EL.sigil) {
    if (a <= 0.05) return;
    const rot = -t * 0.9;
    X.ring(c, x, y, r, r * FY, R[2], a);
    for (let i = 0; i < 5; i++) { const ang = rot + (i / 5) * TAU; X.px(c, x + Math.cos(ang) * (r + 2), y + Math.sin(ang) * (r + 2) * FY, R[1]); }
  }
  // ammo pips over a device (one per element rune left)
  function ammo(c, x, y, left, max, el) {
    const R = EL[el]; const w = max * 3 + 1; X.rect(c, x - (w >> 1) - 1, y - 1, w + 2, 4, '#120e1a');
    for (let k = 0; k < max; k++) X.rect(c, x - (w >> 1) + k * 3 + 1, y, 2, 2, k < left ? R[1] : '#3a3448');
  }
  // the caster's rune pool for one element, as pips above the head
  function pool(c, x, y, v, max, el, t) {
    const R = EL[el], w = max * 4 + 1; X.rect(c, x - (w >> 1) - 1, y - 1, w + 2, 7, '#120e1a');
    const full = Math.floor(v + 1e-6), fr = v - full;
    for (let k = 0; k < max; k++) {
      const px2 = x - (w >> 1) + k * 4 + 1;
      if (k < full) { X.rect(c, px2, y, 3, 5, R[2]); X.px(c, px2, y, R[0]); }
      else if (k === full && fr > 0.05) { const fh = Math.round(fr * 5); X.rect(c, px2, y + 5 - fh, 3, fh, R[3]); }
      else X.rect(c, px2 + 1, y + 2, 1, 1, '#3a3448');
    }
  }

  // ---------------------------------------------------------------------------
  // An aura: a slow ring on the ground around the wearer plus element motes.
  function aura(c, s, t, R, o = {}) {
    const r = o.r || 15, k = o.k == null ? 1 : o.k; if (k < 0.05) return;
    X.ring(c, s.x, s.y, r, r * FY, R[2], 0.7 * k);
    X.ring(c, s.x, s.y, r - 3, (r - 3) * FY, R[3], 0.35 * k);
    for (let i = 0; i < (o.n || 10); i++) {
      const a = (i / (o.n || 10)) * TAU + t * (o.spin || 1.4), rr = r - 1 + Math.sin(t * 3 + i) * 1.5, h = mod(t * (o.rise || 8) + i * 3.7, 14);
      if (rand(i, Math.floor(t * 8)) > k) continue;
      X.px(c, s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * FY - h, h < 7 ? R[1] : R[2]);
    }
  }
  // teleport: a column of light where the caster leaves or arrives
  function blink(c, x, y, e, R = EL.sigil) {
    if (e < 0 || e > 0.5) return;
    const k = 1 - e / 0.5, w = Math.max(1, Math.round(5 * k));
    X.rect(c, x - w, y - 34 * (1 - e), w * 2 + 1, 34 * (1 - e) + 1, R[2]);
    X.rect(c, x - Math.max(0, w - 2), y - 34 * (1 - e), Math.max(1, w * 2 - 3), 34 * (1 - e), R[0]);
    for (let i = 0; i < 12; i++) { const a = rand(i, 3) * TAU, d = e * 40; X.px(c, x + Math.cos(a) * d, y - 10 + Math.sin(a) * d * 0.6, i % 2 ? R[1] : '#ffffff'); }
    X.ring(c, x, y, 4 + e * 30, (4 + e * 30) * FY, R[1], k);
  }

  // ---------------------------------------------------------------------------
  // Spell VFX pass 3 additions.
  // An ice shard: a long jagged sliver (not a cube) pointing along ang, len px long.
  function shard(c, x, y, ang, len, seed, a = 1) {
    if (a < 0.1) return;
    const cs = Math.cos(ang), sn = Math.sin(ang), w = 1.3 + rand(seed, 1) * 0.9;
    const P = (f, s) => [x + cs * f * len - sn * s * w, y + sn * f * len + cs * s * w];
    const j = (k) => (rand(seed, k) - 0.5) * 0.5;
    const pts = [P(1, 0), P(0.45, 1 + j(2)), P(0.05, 0.75 + j(3)), P(-0.38, 0.35 + j(4)), P(-0.5, -0.1), P(-0.3, -0.6 + j(5)), P(0.15, -1 + j(6)), P(0.6, -0.55)];
    X.poly(c, pts.map(([px2, py2]) => [px2 + (px2 - x) * 0.18 + 0.4, py2 + (py2 - y) * 0.18 + 0.6]), '#163e7a', a);
    X.poly(c, pts, EL.cold[3], a);
    X.poly(c, [P(1, 0), P(0.45, 1 + j(2)) , P(0.05, 0.75 + j(3)), P(-0.38, 0.35 + j(4)), P(-0.2, 0), P(0.5, -0.1)], EL.cold[2], a);
    X.line(c, P(0.95, 0)[0], P(0.95, 0)[1], P(-0.2, 0.3)[0], P(-0.2, 0.3)[1], a > 0.6 ? '#ffffff' : EL.cold[1]);
    X.px(c, P(1, 0)[0], P(1, 0)[1], '#ffffff');
  }
  // A fireball: a heavy missile made of fire. Layered flame body, flickering tongues
  // streaming back against the motion, white-hot core. (vx, vy) = direction of travel.
  function fireball(c, x, y, r, t, vx = 1, vy = 0, seed = 0) {
    const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
    // tongues streaming back
    for (let i = 0; i < 9; i++) {
      const sp = (i / 9 - 0.5) * 1.7, ph = t * 22 + i * 1.7, len = r * (1.3 + 0.9 * (0.5 + 0.5 * Math.sin(ph)) + rand(i, seed, 3) * 0.6);
      const bx = -ux, by = -uy, ex = bx * Math.cos(sp) - by * Math.sin(sp), ey = bx * Math.sin(sp) + by * Math.cos(sp);
      for (let k = 0; k < len; k++) {
        const q = k / len, xx = x + ex * (r * 0.6 + k), yy = y + ey * (r * 0.6 + k) - q * q * 3 + Math.sin(ph + k * 0.6) * 0.6;
        X.px(c, xx, yy, EL.fire[q < 0.25 ? 1 : q < 0.5 ? 2 : q < 0.8 ? 3 : 4]);
      }
    }
    X.ellipse(c, x, y, r + 1, r + 0.6, EL.fire[4]);
    X.ellipse(c, x, y, r, r - 0.3, EL.fire[3]);
    X.ellipse(c, x + ux * 0.8, y + uy * 0.8 - 0.5, r * 0.72, r * 0.68, EL.fire[2]);
    X.ellipse(c, x + ux * 1.2, y + uy * 1.2 - 0.8, r * 0.42, r * 0.4, EL.fire[1]);
    X.rect(c, x + ux * 1.4 - 1, y + uy * 1.4 - 1.5, 2, 2, Math.floor(t * 24) % 2 ? '#ffffff' : EL.fire[0]);
    // flicker on the rim
    for (let i = 0; i < 6; i++) { const a2 = (i / 6) * TAU + t * 9, rr = r + 0.5 + (rand(i, Math.floor(t * 20), seed) - 0.3) * 1.5; X.px(c, x + Math.cos(a2) * rr, y + Math.sin(a2) * rr - 1, EL.fire[2]); }
  }
  // A link of the flame arc: a jagged channel of fire between two points that licks
  // upward along its length (tongues), with embers shed off it. seed changes ~10x a second.
  function flameLink(c, a, z, seed, t, k = 1) {
    const pts = bolt(a, z, seed, 0.26, 3);
    X.lines(c, pts, EL.fire[4], 3); X.lines(c, pts, EL.fire[2], 2); X.lines(c, pts, EL.fire[1], 1);
    const S2 = sample(pts, 2);
    for (let i = 1; i < S2.length - 1; i++) {
      const p = S2[i], h = (2.5 + 3.5 * (0.5 + 0.5 * Math.sin(t * 17 + i * 1.9)) + rand(i, seed, 2) * 2) * k;
      if (rand(i, seed, 4) < 0.35) continue;
      tongue(c, p[0], p[1], 1.3, h, Math.sin(t * 9 + i) * 1.2);
    }
    for (let i = 2; i < S2.length - 1; i += 3) if ((i + Math.floor(t * 24)) % 2) X.px(c, S2[i][0], S2[i][1], '#ffffff');
    return S2;
  }
  // A rune mote flowing from (a) to (b): e = 0..1 along a little arc, in a ramp.
  function mote(c, a, b, e, R, lift = 10) {
    if (e <= 0 || e >= 1) return;
    const P = (k) => [lerp(a[0], b[0], smooth(k)), lerp(a[1], b[1], smooth(k)) - Math.sin(k * Math.PI) * lift];
    for (let j = 1; j <= 3; j++) { const q = P(Math.max(0, e - j * 0.06)); X.px(c, q[0], q[1], R[Math.min(R.length - 1, 1 + j)]); }
    const p = P(e); X.glow(c, p[0], p[1], 4, R[2], 0.7); X.rect(c, p[0] - 1, p[1] - 1, 2, 2, R[1]); X.px(c, p[0], p[1], '#ffffff');
  }

  PB.K = Object.assign({}, S, PB, {
    X, EL, fireCol, sq, tongue, puff, bolt, gring, prep, beam, splash, cone, nova, zap, zapHit,
    burning, dripping, frosty, chilled, pip, heals, dust, debris, cracks, scorch, rock, reticle, dragPath, sample, arcPts, circlePts,
    wall, sheet, fireCurtain, glyph, lineGlyph, device, sigilDevice, runeRing, seal, ammo, pool, aura, blink, ROCK, STONE,
    shard, fireball, flameLink, mote,
  });
})();
