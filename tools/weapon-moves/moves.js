/* Weapon Moveset Review: every vignette on the page.
 *   w-<weapon>            the weapon card: conjure, hold, one show-off swing
 *   w-<weapon>-<move>     the six moves for each weapon, against goblins (allies for the hands)
 *   g-<guard>             the eight guards, each showing its block behaviour
 *   d-<combo>             weapon hand + guard hand
 * A vignette is { id, kind, w, h, dur, ground, seed, frame(t, K) } (see stage.js).
 * Shared tells: every weapon uses the same pose track per move (weapons.js MOVES), so a
 * partner learns six silhouettes; the weapon only changes the colour and the effect. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, WM = PB.WM, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit, mod, env } = PB, X = PB.px, EL = X.EL;
  const VS = (PB.WMV = []);
  const add = (d) => VS.push(d);
  const W_ = Object.fromEntries(WM.WEAPONS.map((w) => [w.id, w]));
  const G_ = Object.fromEntries(WM.GUARDS.map((g) => [g.id, g]));
  const MW = 128, MH = 80;

  // ---------------------------------------------------------------------------
  // small helpers
  const gob = (id, x, y, o = {}) => K.gob(Object.assign({ id, x, y, face: Math.PI, seed: id.charCodeAt(id.length - 1) % 3 + 1 }, o));
  const archer = (id, x, y, o = {}) => K.archer(Object.assign({ id, x, y, face: Math.PI, seed: 2 }, o));
  const allyWiz = (id, x, y, o = {}) => K.wiz(Object.assign({ id, team: 'p2', x, y, face: Math.PI, el: 'water', seed: 7 }, o));
  const fade = (t, D, a = 0.2, b = 0.3) => K.life(t, D, a, b);
  function spark(c, p, R, e, big = 1) {
    if (!p || e < 0 || e > 0.3) return;
    const k = e / 0.3;
    X.glow(c, p[0], p[1], (5 + 4 * big) * (1 - k * 0.4), R[2], 0.85 * (1 - k));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.4, r0 = 2 + k * 6 * big, r1 = r0 + 2 + 3 * (1 - k) * big; X.line(c, p[0] + Math.cos(a) * r0, p[1] + Math.sin(a) * r0 * 0.8, p[0] + Math.cos(a) * r1, p[1] + Math.sin(a) * r1 * 0.8, i % 2 ? R[0] : R[1]); }
    if (k < 0.35) X.rect(c, p[0] - 1, p[1] - 1, 3, 3, '#ffffff');
  }
  function arrow(c, x, y, ang, fire) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    X.line(c, x - ux * 6, y - uy * 6, x, y, '#e8d8b0'); X.px(c, x + ux, y + uy, '#c0cbdc');
    X.px(c, x - ux * 6, y - uy * 6 - 1, '#f0f0f0'); X.px(c, x - ux * 6, y - uy * 6 + 1, '#f0f0f0');
    if (fire) { X.glow(c, x, y, 4, EL.fire[2], 0.9); X.px(c, x, y - 1, EL.fire[1]); X.px(c, x - ux * 2, y - 2, EL.fire[2]); }
  }
  const chestOf = (A, s) => (A[s.id] && A[s.id].chest) || [s.x, s.y - 9];
  // a key-cap label in the corner: which gesture is being pressed right now
  function keycap(c, H, label, on) {
    if (!label) return;
    const w = label.length * 4 + 3;
    X.rect(c, 2, H - 10, w + 2, 9, '#120e1a');
    X.rect(c, 3, H - 9, w, 7, on ? '#f4c44a' : '#3c3552');
    X.text(c, label, 5, H - 8, on ? '#15111c' : '#a8a3bb');
  }
  // statuses carried by each element: what a hit leaves on the body
  function status(s, el, k) {
    if (k <= 0) return s;
    if (el === 'fire') s.burn = k;
    else if (el === 'cold') s.chill = k * 0.6;
    else if (el === 'water') s.wet = k;
    else if (el === 'lightning') s.shock = k > 0.5 && k < 0.99 ? 1 : 0;
    return s;
  }
  function statusFx(c, A, s, el, t, k) {
    if (k <= 0.05) return;
    if (el === 'fire') K.burning(c, A, s, t, k);
    else if (el === 'cold') K.chilled(c, A, s, t, k);
    else if (el === 'water') K.dripping(c, A, s, t);
  }
  // how hit a body is: list of [time, knockback px, hop px]
  function hitBy(t, hs) {
    let kb = 0, fl = 0, z = 0;
    for (const [h, d, hop] of hs) { kb += K.kb(t, h, d, 0.3); fl = Math.max(fl, K.flash(t, h)); if (hop) z += K.hop(t, h, hop, 0.35); }
    return { kb, flash: fl, z };
  }
  // a status that starts at h and holds until the loop fades
  const after = (t, h, D, rise = 0.12) => seg(t, h, h + rise) * (1 - seg(t, D - 0.45, D - 0.1));
  const sweepHitT = (mv, a) => { const [s0, s1] = mv.spin; let fo = a - 1.45; while (fo > 0) fo -= TAU; while (fo < -TAU) fo += TAU; return s0 + (s1 - s0) * (-fo / TAU); };

  // wizard with a rig for weapon W. o: { x, y, face, guard, glow, size, hidden, track, s }
  function wizard(W, poseAt, t, o = {}) {
    const p = poseAt(t), face0 = o.face || 0;
    const x = (o.x != null ? o.x : 30) + p.st * Math.cos(face0), y = (o.y != null ? o.y : 50) + p.st * Math.sin(face0) * FY;
    return K.wiz(Object.assign({ id: 'me', team: 'p1', x, y, face: face0 + p.fo, el: EL[W.el] ? W.el : 'arcane', seed: 3, rig: WM.rig(W, poseAt, t, o) }, o.s || {}));
  }
  // world position of the weapon tip and grip (from the pose, same maths as the rig)
  function tipW(W, poseAt, t, me, lm) {
    const p = poseAt(t), d = WM.dirOf(p.p, p.y), L = W.len * (lm != null ? lm : p.lm);
    return { tip: WM.world(me, [p.hR[0] + d[0] * L, p.hR[1] + d[1] * L, p.hR[2] + d[2] * L]), grip: WM.world(me, p.hR) };
  }

  // ---------------------------------------------------------------------------
  // Effect pieces
  function flameCrescent(c, x, y, e, dir = 1) {
    if (e <= 0 || e >= 1) return;
    const a = 1 - e, r = 5 + e * 4;
    for (let i = 0; i <= 10; i++) {
      const th = -1.3 + (i / 10) * 2.6, px2 = x + Math.cos(th) * r * 0.6 * dir, py2 = y + Math.sin(th) * r;
      K.tongue(c, px2, py2 + 2, 1.4 * a + 0.4, 3 + 3 * a * (1 - Math.abs(th) / 1.4), -2 * dir);
    }
    X.glow(c, x, y, 7, EL.fire[2], 0.6 * a);
  }
  function fireRow(c, pts, t, k, h = 6) {
    if (k <= 0.02) return;
    pts.forEach(([x, y], i) => { if (rand(i, 5) > k + 0.1) return; K.tongue(c, x, y, 1.6 * k + 0.4, (h * 0.6 + h * 0.6 * Math.sin(t * 13 + i * 2.1)) * k, Math.sin(t * 6 + i) * 1.5); });
  }
  function scorchRow(c, pts, k) { if (k > 0.02) for (const [x, y] of pts) X.ellipse(c, x, y, 3, 1.4, '#22140e', Math.min(1, k)); }
  function wave(c, x, y, e, w = 10) {
    if (e <= 0 || e >= 1) return;
    const a = 1 - seg(e, 0.75, 1);
    for (let i = -w; i <= w; i++) {
      const yy = y + i * FY * 0.9, h = (7 + 2 * Math.sin(i * 0.7 + e * 10)) * a * (1 - Math.abs(i) / (w + 3));
      X.rect(c, x - 3, yy - h, 4, h, EL.water[3]); X.rect(c, x - 1, yy - h, 2, h, EL.water[2]);
      X.px(c, x + 1, yy - h, '#ffffff'); if ((i + Math.floor(e * 20)) % 3 === 0) X.px(c, x + 2, yy - h - 1, EL.water[0]);
    }
  }
  function splash(c, x, y, e, n = 8, R = EL.water) {
    if (e < 0 || e > 0.6) return;
    const k = e / 0.6;
    for (let i = 0; i < n; i++) { const a = -Math.PI * (0.1 + 0.8 * rand(i, 11)), sp = 8 + rand(i, 12) * 10; X.px(c, x + Math.cos(a) * sp * k, y + Math.sin(a) * sp * k + 30 * k * k, i % 2 ? R[1] : R[0]); }
  }
  function chain(c, a, b, t, sag = 3) {
    const n = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
    for (let i = 0; i <= n; i++) { const k = i / n, x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k) + Math.sin(k * Math.PI) * sag; X.px(c, x, y, i % 2 ? '#a89cb8' : '#5a5068'); if (i % 5 === Math.floor(t * 20) % 5) X.px(c, x, y, EL.arcane[2]); }
  }
  function hookHead(c, x, y, dir = 1) {
    X.lines(c, [[x - 2 * dir, y], [x + 1 * dir, y], [x + 2 * dir, y + 1.5], [x + 1 * dir, y + 3], [x - 1 * dir, y + 3]], '#d8d0e0');
    X.glow(c, x, y + 1, 4, EL.arcane[2], 0.7); X.px(c, x + 1 * dir, y, EL.arcane[1]);
  }
  function ping(c, x, y, e) { if (e < 0 || e > 1) return; for (let k = 0; k < 2; k++) { const q = mod(e * 1.6 + k * 0.5, 1); X.ring(c, x, y, 2 + q * 10, (2 + q * 10) * FY, '#ffffff', 1 - q); } X.rect(c, x, y - 12, 1, 4, '#f4c44a'); X.px(c, x, y - 6, '#f4c44a'); }
  function dashedRing(c, x, y, r, col, t, a = 1) { const n = Math.ceil(r * 1.4); for (let i = 0; i < n; i++) if ((i + Math.floor(t * 10)) % 3) { const th = (i / n) * TAU; if (a >= 1 || rand(i, 3) < a) X.px(c, x + Math.cos(th) * r, y + Math.sin(th) * r * FY, col); } }
  function woodShield(c, x, y) { X.ellipse(c, x, y, 2.6, 4, '#3a2416'); X.ellipse(c, x, y, 2, 3.3, '#8a5a34'); X.line(c, x, y - 3, x, y + 3, '#5a3a24'); X.px(c, x - 1, y - 2, '#b8844a'); }

  // ---------------------------------------------------------------------------
  // Move vignettes. Each builder returns the scene for one weapon × move.
  const MOVEFX = {};
  function moveScene(W, mv, t, poseAt) {
    const M = WM.MOVES[mv], D = M.dur, el = W.el, R = W.R;
    const gx = Math.round(30 + 10 + W.len * 0.95 + 3);
    const C = { W, M, D, el, R, gx, poseAt, t };
    const S = { actors: [], under: [], fx: [], lights: [], shake: 0, meO: {}, label: M.gesture.replace(' ×3', '').replace(', release', '').toUpperCase() };
    const key = W.id + '-' + mv;
    (MOVEFX[key] || MOVEFX['*-' + mv])(t, C, S);
    return S;
  }
  function moveVignette(W, mv) {
    const M = WM.MOVES[mv], poseAt = WM.track(WM.keysFor(W, mv)), wide = mv === 'sweep';
    add({ id: `w-${W.id}-${mv}`, kind: 'move', weapon: W.id, move: mv, w: MW, h: MH, dur: M.dur, ground: W.id === 'life' ? 'plaza' : 'grass', seed: 3 + W.len + mv.length, still: M.hits ? M.hits[M.hits.length - 1] + 0.2 : M.spin ? M.spin[0] + 0.3 : 1.2,
      frame(t) {
        const S = moveScene(W, mv, t, poseAt);
        const me = S.me || wizard(W, poseAt, t, Object.assign({ x: wide ? 64 : 30, y: wide ? 54 : 50, move: mv }, S.meO));
        const actors = [me, ...S.actors];
        const tw = tipW(W, poseAt, t, me);
        const active = t > 0.12 && t < (M.dur - 0.5);
        return {
          actors,
          under(c, E) { for (const f of S.under) f(c, E, me); },
          lights: [[tw.tip[0], tw.tip[1] + 6, 18, W.R[2], W.id === 'staff' ? 0.15 : 0.35], ...S.lights],
          shake: S.shake,
          stand: S.stand,
          fx(c, A) { for (const f of S.fx) f(c, A, me, tw); keycap(c, MH, S.label, active); },
        };
      } });
  }

  // ---- defaults, one per move ----------------------------------------------------
  MOVEFX['*-strike'] = (t, C, S) => {
    const { M, D, el, R, gx } = C, [h1, h2, h3] = M.hits;
    const r = hitBy(t, [[h1, 2], [h2, 2], [h3, 6, 3]]), k = after(t, h1, D);
    const down = el === 'earth' ? K.down(t, h3 + 0.1, h3 + 0.9) : 0;
    const g = status(gob('g1', gx + r.kb, 50, { flash: r.flash, z: r.z, dead: down, alpha: fade(t, D) }), el, el === 'lightning' ? seg(t, h1, h1 + 0.5) : k);
    S.actors.push(g);
    S.fx.push((c, A) => { for (const h of M.hits) spark(c, chestOf(A, g), R, t - h, h === h3 ? 1.3 : 0.8); statusFx(c, A, g, el, t, k); });
    C.g = g;
  };
  MOVEFX['*-thrust'] = (t, C, S) => {
    const { M, D, el, R, gx } = C, h = M.hits[0], r = hitBy(t, [[h, el === 'water' ? 12 : 9, 2]]), k = after(t, h, D);
    const g = status(gob('g1', gx + 7 + r.kb, 50, { flash: r.flash, z: r.z, alpha: fade(t, D), dead: el === 'earth' ? K.down(t, h + 0.1, h + 1.0) : 0 }), el, el === 'lightning' ? seg(t, h, h + 0.6) : k);
    S.actors.push(g);
    S.fx.push((c, A) => { spark(c, chestOf(A, g), R, t - h, 1.1); statusFx(c, A, g, el, t, k); });
    C.g = g;
  };
  MOVEFX['*-heavy'] = (t, C, S) => {
    const { M, D, el, R, gx } = C, h = M.hits[0], [c0, c1] = M.charge, ch = seg(t, c0, c1);
    const r = hitBy(t, [[h, 14, 5]]), k = after(t, h, D);
    const g = status(gob('g1', gx + 2 + r.kb, 50, { flash: r.flash, z: r.z, dead: K.down(t, h + 0.2, h + 1.0), alpha: fade(t, D) }), el, el === 'lightning' ? seg(t, h, h + 0.7) : k);
    S.actors.push(g);
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.shake = t > h && t < h + 0.25 ? 2 : 0;
    S.under.push((c, E, me) => {
      if (t > c0 && t < h) { const rr = lerp(16, 7, ch); K.gring(c, me.x, me.y, rr, ch > 0.98 ? '#ffffff' : R[2], 0.5 + 0.5 * ch, 1); if (ch > 0.98) K.gring(c, me.x, me.y, rr + 3, R[1], 0.7, 1); }
    });
    S.fx.push((c, A) => { spark(c, chestOf(A, g), R, t - h, 1.6); statusFx(c, A, g, el, t, k); });
    C.g = g; C.h = h;
  };
  MOVEFX['*-sweep'] = (t, C, S) => {
    const { M, D, el, R, W } = C, rr = 8 + W.len * 0.95 * (W.id === 'cold' ? 0.55 : 1), mx = 64, my = 54;
    const spots = [['g1', 0, rr + 3], ['g2', Math.PI, rr + 3], ['p2', -2.4, rr + 1]];
    C.r = rr;
    for (const [id, a, d] of spots) {
      const h = sweepHitT(M, a), kb = el === 'earth' ? 16 : el === 'arcane' ? 12 : el === 'lightning' ? 3 : 6, r = hitBy(t, [[h, kb, el === 'earth' ? 4 : 2]]);
      const x = mx + Math.cos(a) * (d + r.kb), y = my + Math.sin(a) * (d + r.kb) * FY, k = after(t, h, D);
      let s;
      if (id === 'p2') s = allyWiz(id, x, y, { face: a + Math.PI, flash: el === 'life' ? 0 : r.flash, z: r.z * 0.5, alpha: 1 });
      else s = gob(id, x, y, { face: a + Math.PI, flash: r.flash, z: r.z, dead: el === 'earth' ? K.down(t, h + 0.1, h + 1.0) : 0, alpha: fade(t, D) });
      if (id !== 'p2' || el === 'water') status(s, el, el === 'lightning' ? seg(t, h, h + 0.4) : id === 'p2' ? k * 0.7 : k);
      S.actors.push(s);
      S.fx.push((c, A) => { spark(c, chestOf(A, s), R, t - h, el === 'lightning' ? 0.6 : 1); if (id !== 'p2' || el === 'water') statusFx(c, A, s, el, t, id === 'p2' ? k * 0.5 : k); });
      C[id] = s; C[id + 'h'] = h;
    }
    // the tell: the weapon drawn back low and a ring flashing on the floor
    S.under.push((c, E, me) => {
      const [a, b] = M.tell;
      if (t > a && t < b) dashedRing(c, mx, my, rr, Math.floor(t * 8) % 2 ? '#ffffff' : R[1], t);
      if (t > M.spin[0] && t < M.spin[1] + 0.25) { const e = seg(t, M.spin[0], M.spin[1]), fadeK = 1 - seg(t, M.spin[1], M.spin[1] + 0.25); X.ring(c, mx, my, rr, rr * FY, R[2], 0.9 * fadeK, -0.2 - e * TAU + 1.45 + 0.2, 1.45 + 0.2); }
    });
  };
  MOVEFX['*-send'] = (t, C, S) => {
    const { M, D, el, R, W } = C, TX = 104, TY = 50, h = M.land;
    const r = hitBy(t, [[h, 4, 1]]), k = after(t, h, D);
    const g = status(gob('g1', TX + 2 + r.kb, TY, { flash: r.flash, z: r.z, alpha: fade(t, D), dead: el === 'earth' ? K.down(t, h + 0.05, h + 0.9) : 0 }), el, el === 'lightning' ? seg(t, h, h + 0.6) : k);
    S.actors.push(g); C.g = g;
    S.fx.push((c, A, me) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < h + 0.1 ? smooth(seg(t, 0.15, 0.7)) : 0);
      const hand = [me.x + 8, me.y - 12], chest = [g.x - 3, g.y - 8];
      let pos = null, ang = 0;
      if (t > M.throwAt && t < h) { const e = seg(t, M.throwAt, h); pos = [lerp(hand[0], chest[0], e), lerp(hand[1], chest[1], e) - Math.sin(e * Math.PI) * 8]; ang = W.id === 'cold' ? -0.2 + e * 0.4 : t * 30; }
      else if (t >= h && t < M.recall) { pos = [chest[0] - 2, chest[1] + 1]; ang = 0.25; }
      else if (t >= M.recall && t < M.back) { const e = seg(t, M.recall, M.back); pos = [lerp(chest[0], hand[0], e), lerp(chest[1], hand[1], e) - Math.sin(e * Math.PI) * 6]; ang = Math.PI + t * 30; }
      if (pos) WM.flatProp(c, W, pos[0], pos[1], ang, W.len, t);
      spark(c, chest, R, t - h, 1); statusFx(c, A, g, el, t, k);
      if (t > M.recall - 0.05 && t < M.recall + 0.25) S.label2 = true;
    });
    // recall is Shift+LMB
    S.label = t > M.recall - 0.1 && t < M.back ? 'SHIFT+LMB' : 'SHIFT+RMB HOLD';
  };
  MOVEFX['*-defend'] = (t, C, S) => {
    const { M, D, el, R, gx } = C, [hp, hr] = M.hits, arrive = hp - 0.05;
    const walkK = seg(t, 0.2, arrive), x0 = 118, x1 = gx + 1;
    const r = hitBy(t, [[hp, 5], [hr, 8, 2]]), k = after(t, hr, D);
    const g = status(gob('g1', lerp(x0, x1, walkK) + r.kb, 51, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D), sq: t > arrive - 0.1 && t < hp ? -0.25 : 0, dead: el === 'earth' ? K.down(t, hr + 0.1, hr + 0.9) : 0 }, walkK > 0 && walkK < 1 ? K.walk(t, 1.2) : {})), el, el === 'lightning' ? seg(t, hr, hr + 0.5) : k);
    S.actors.push(g); C.g = g;
    S.fx.push((c, A, me, tw) => { spark(c, tw.tip, ['#ffffff', '#fffbe0', '#ffe68a'], t - hp, 0.9); spark(c, chestOf(A, g), R, t - hr, 1.1); statusFx(c, A, g, el, t, k); });
  };

  // ---- weapon-specific shapes ----------------------------------------------------
  const wrap = (key, base, extra) => { MOVEFX[key] = (t, C, S) => { MOVEFX[base](t, C, S); extra(t, C, S); }; };

  // Bare staff: shoves only (strike / thrust / heavy / sweep are the defaults in grey)
  MOVEFX['staff-send'] = (t, C, S) => {
    const TX = 100, TY = 50;
    const al = allyWiz('p2', 104, 34, { face: Math.PI * 0.8 });
    S.actors.push(al);
    S.fx.push((c) => { K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < 0.8 ? smooth(seg(t, 0.15, 0.7)) : 0); ping(c, TX, TY, seg(t, 0.74, 2.2)); });
  };
  MOVEFX['staff-defend'] = (t, C, S) => {
    MOVEFX['*-defend'](t, C, S);
  };

  // Flame sword
  wrap('fire-strike', '*-strike', (t, C, S) => { const h3 = C.M.hits[2]; S.fx.push((c, A) => flameCrescent(c, C.g.x + 6 + seg(t, h3, h3 + 0.45) * 26, 41, seg(t, h3, h3 + 0.45))); });
  wrap('fire-thrust', '*-thrust', (t, C, S) => {
    const h = C.M.hits[0], pts = []; for (let x = 40; x < 66; x += 4) pts.push([x, 52]);
    const k = seg(t, h - 0.05, h + 0.1) * (1 - seg(t, h + 0.6, h + 1.2));
    S.under.push((c) => scorchRow(c, pts, k * 0.6)); S.fx.push((c) => fireRow(c, pts.filter(([x]) => x < 40 + 26 * seg(t, h - 0.1, h)), t, k, 5));
  });
  wrap('fire-heavy', '*-heavy', (t, C, S) => {
    const h = C.h, pts = []; for (let x = 52; x < 112; x += 4) pts.push([x, 52 + Math.sin(x * 0.3) * 0.6]);
    const run = seg(t, h, h + 0.35), k = (1 - seg(t, C.D - 0.6, C.D - 0.1));
    const live = pts.filter(([x]) => x < 52 + 60 * run);
    S.under.push((c) => scorchRow(c, live, k * 0.8)); S.fx.push((c) => fireRow(c, live, t, k, 7));
  });
  wrap('fire-sweep', '*-sweep', (t, C, S) => {
    const s0 = C.M.spin[0], k = seg(t, s0, s0 + 0.1) * (1 - seg(t, 2.1, 2.5)), e = seg(t, s0, C.M.spin[1]), pts = [];
    for (let i = 0; i < 22; i++) { const a = 1.45 - (i / 22) * TAU; if (i / 22 <= e) pts.push([64 + Math.cos(a) * C.r, 54 + Math.sin(a) * C.r * FY]); }
    S.fx.push((c) => fireRow(c, pts, t, k, 6));
  });
  MOVEFX['fire-send'] = (t, C, S) => {
    const { D, R, W } = C, t0 = 0.72, t1 = 1.54, x0 = 40, x1 = 112, y0 = 38;
    const path = (e) => [lerp(x0, x1, (1 - Math.cos(e * TAU)) / 2), y0 + Math.sin(e * TAU) * 12];
    let hT = 0.95; for (let i = 0; i <= 60; i++) { const e = i / 60, p = path(e); if (p[0] > 80 && p[1] > 42) { hT = t0 + (t1 - t0) * e; break; } }
    const r = hitBy(t, [[hT, 4, 1]]), k = after(t, hT, D);
    const g = status(gob('g1', 84 + r.kb, 54, { flash: r.flash, z: r.z, alpha: fade(t, D) }), 'fire', k);
    S.actors.push(g);
    const trail = []; for (let i = 0; i <= 18; i++) { const e = i / 18, p = path(e); trail.push([p[0], p[1] + 12, t0 + (t1 - t0) * e]); }
    S.fx.push((c, A) => {
      const live = trail.filter((p) => t > p[2] && t < p[2] + 1.0).map(([x, y]) => [x, y]);
      fireRow(c, live, t, 0.8, 5);
      if (t > t0 && t < t1) { const p = path(seg(t, t0, t1)); WM.flatProp(c, W, p[0], p[1], t * 28, W.len, t); }
      spark(c, chestOf(A, g), R, t - hT, 1); statusFx(c, A, g, 'fire', t, k);
    });
    S.label = 'SHIFT+RMB HOLD';
  };
  wrap('fire-defend', '*-defend', () => {});

  // Frost spear
  MOVEFX['cold-strike'] = (t, C, S) => {
    const { M, D, R } = C, [h1, h2, h3] = M.hits;
    const r1 = hitBy(t, [[h1, 1], [h2, 1], [h3, 4, 2]]), r2 = hitBy(t, [[h3 + 0.03, 4, 2]]);
    const g1 = status(gob('g1', 60 + r1.kb, 50, { flash: r1.flash, z: r1.z, alpha: fade(t, D) }), 'cold', after(t, h1, D));
    const g2 = status(gob('g2', 71 + r2.kb, 50, { flash: r2.flash, z: r2.z, alpha: fade(t, D), seed: 2 }), 'cold', after(t, h3, D));
    S.actors.push(g1, g2);
    S.fx.push((c, A) => {
      for (const h of M.hits) spark(c, chestOf(A, g1), R, t - h, 0.8);
      spark(c, chestOf(A, g2), R, t - h3 - 0.03, 1.1);
      if (t > h3 && t < h3 + 0.5) { const e = seg(t, h3, h3 + 0.5), p = chestOf(A, g2); for (let i = 0; i < 4; i++) K.shard(c, p[0] + 4 + e * (12 + i * 3), p[1] - 2 + (i - 1.5) * 3 * (1 + e), (i - 1.5) * 0.2, 4, i + 3, 1 - e); }
      K.chilled(c, A, g1, t, after(t, h1, D)); K.chilled(c, A, g2, t, after(t, h3, D));
    });
  };
  wrap('cold-thrust', '*-thrust', (t, C, S) => {
    const h = C.M.hits[0], k = seg(t, h - 0.05, h) * (1 - seg(t, h + 0.6, h + 1.0));
    S.under.push((c) => { if (k > 0.02) { for (let x = 32; x < 32 + 38 * k; x += 2) X.px(c, x, 53, x % 4 ? EL.cold[2] : '#ffffff'); X.text(c, '3.5', 62, 56, EL.cold[1]); } });
  });
  MOVEFX['cold-heavy'] = (t, C, S) => {
    const { M, D, R } = C, h = M.hits[0], [c0, c1] = M.charge;
    const g = gob('g1', 60, 50, { frozen: t < h ? 1 : 0, alpha: t < h ? fade(t, D) : 0 });
    S.actors.push(g);
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.meO.s = t > 2.0 && t < 2.75 ? K.walk(t, 0.7) : {};
    S.shake = t > h && t < h + 0.2 ? 1.5 : 0;
    S.under.push((c, E, me) => { if (t > c0 && t < h) K.gring(c, me.x, me.y, lerp(16, 7, seg(t, c0, c1)), R[2], 0.8, 1); });
    S.fx.push((c, A) => {
      if (t > h && t < h + 0.7) { const e = seg(t, h, h + 0.7); for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + rand(i, 4) * 0.3, sp = 10 + rand(i, 5) * 16; K.shard(c, 60 + Math.cos(a) * sp * e, 44 + Math.sin(a) * sp * e * 0.6 + 26 * e * e, a + e * 4, 3 + rand(i, 6) * 3, i + 1, 1 - e); } X.glow(c, 60, 44, 10, EL.cold[2], 1 - e); }
      spark(c, [60, 42], R, t - h, 1.4);
    });
    S.label = 'RMB HOLD';
  };
  wrap('cold-sweep', '*-sweep', (t, C, S) => {
    const s0 = C.M.spin[0], k = seg(t, s0, s0 + 0.3) * (1 - seg(t, 2.1, 2.5));
    S.under.push((c) => { if (k > 0.02) for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU, rr = C.r + (rand(i, 2) - 0.5) * 6; if (rand(i, 3) < k) X.px(c, 64 + Math.cos(a) * rr, 54 + Math.sin(a) * rr * FY, i % 3 ? EL.cold[1] : '#ffffff'); } });
  });
  MOVEFX['cold-send'] = (t, C, S) => {
    MOVEFX['*-send'](t, C, S);
    const g = C.g, h = C.M.land, k = after(t, h, C.D, 0.5);
    Object.assign(g, K.walk(t, t > h && t < C.M.recall ? 0.9 : 0));   // tries to walk, can't: pinned
    S.under.push((c) => K.ice(c, 106, 52, 13 * k, k, 200, 4));
  };
  MOVEFX['cold-defend'] = (t, C, S) => {
    const { D, R } = C, hp = 1.05, walkK = seg(t, 0.4, hp), r = hitBy(t, [[hp, 2]]), k = after(t, hp, D);
    const g = status(gob('g1', lerp(120, 59, easeOut(walkK) * 0.3 + walkK * 0.7) + r.kb, 51, Object.assign({ flash: r.flash, alpha: fade(t, D), dead: K.down(t, hp + 0.25, hp + 1.2) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.8) : {})), 'cold', k);
    S.actors.push(g);
    S.fx.push((c, A, me, tw) => {
      if (walkK > 0 && walkK < 1) for (let i = 0; i < 3; i++) X.line(c, g.x + 6 + i * 2, g.y - 3 - i * 3, g.x + 10 + i * 2, g.y - 3 - i * 3, '#d8d4e0');
      spark(c, chestOf(A, g), R, t - hp, 1.3); K.chilled(c, A, g, t, k);
    });
    S.label = 'SPACE HOLD';
  };

  // Lightning whip
  MOVEFX['lightning-strike'] = (t, C, S) => {
    const { M, D, R } = C, [h1, h2, h3] = M.hits;
    const rF = hitBy(t, [[h1, 3], [h2, 3], [h3, 7, 2]]), rN = hitBy(t, [[h1, 0], [h2, 0], [h3, 0]]);
    const near = gob('g2', 47, 54, { flash: rN.flash * 0.12, alpha: fade(t, D), seed: 2 });
    const far = gob('g1', 66 + rF.kb, 50, { flash: rF.flash, z: rF.z, alpha: fade(t, D), shock: [h1, h2, h3].some((h) => t > h && t < h + 0.3) ? 1 : 0 });
    S.actors.push(near, far);
    S.fx.push((c, A, me, tw) => {
      for (const h of M.hits) {
        const e = t - h; if (e < 0 || e > 0.25) continue;
        const p = tipW(C.W, C.poseAt, h, me).tip, k = 1 - e / 0.25, r = 3 + 5 * (1 - k);
        X.line(c, p[0] - r, p[1], p[0] + r, p[1], '#ffffff'); X.line(c, p[0], p[1] - r, p[0], p[1] + r, '#ffffff');
        X.px(c, p[0] - r * 0.6, p[1] - r * 0.6, R[1]); X.px(c, p[0] + r * 0.6, p[1] + r * 0.6, R[1]); X.px(c, p[0] + r * 0.6, p[1] - r * 0.6, R[1]); X.px(c, p[0] - r * 0.6, p[1] + r * 0.6, R[1]);
        spark(c, chestOf(A, far), R, e, h === h3 ? 1.3 : 0.9);
      }
    });
  };
  MOVEFX['lightning-thrust'] = (t, C, S) => {
    const { M, D, R } = C, h = M.hits[0], stun = t > h && t < h + 1.0, r = hitBy(t, [[h, 3]]);
    const a = archer('g1', 75 + r.kb, 48, { draw: t < h ? smooth(seg(t, 0.2, 0.7)) : 0, flash: r.flash, alpha: fade(t, D), shock: stun && Math.floor(t * 12) % 3 ? 1 : 0, sq: stun ? 0.15 : 0 });
    S.actors.push(a);
    S.fx.push((c, A) => {
      spark(c, chestOf(A, a), R, t - h, 1.2);
      if (stun) { const hd = A.g1 && A.g1.head; if (hd) for (let i = 0; i < 3; i++) { const an = t * 6 + i * 2.1; X.px(c, hd[0] + Math.cos(an) * 4, hd[1] - 4 + Math.sin(an) * 1.5, i % 2 ? '#ffffff' : R[1]); } }
      if (t > h && t < h + 0.5) arrow(c, a.x - 6, a.y - 9 + seg(t, h, h + 0.3) * 8, 0.6);
    });
  };
  MOVEFX['lightning-heavy'] = (t, C, S) => {
    MOVEFX['*-heavy'](t, C, S);
    const h = C.h, D = C.D, R = C.R, T = [[h + 0.07, 84, 40, 'g2'], [h + 0.14, 100, 60, 'g3']];
    const bodies = T.map(([hh, x, y, id]) => { const r = hitBy(t, [[hh, 3, 1]]); return gob(id, x + r.kb, y, { flash: r.flash, z: r.z, alpha: fade(t, D), shock: t > hh && t < hh + 0.6 && Math.floor(t * 20) % 2 ? 1 : 0, seed: id === 'g2' ? 2 : 3 }); });
    C.g.shock = t > h && t < h + 0.6 && Math.floor(t * 20) % 2 ? 1 : 0;
    S.actors.push(...bodies);
    S.fx.push((c, A) => {
      const chain3 = [C.g, ...bodies];
      for (let i = 0; i < 2; i++) { const hh = T[i][0]; if (t > hh - 0.03 && t < hh + 0.22) K.zap(c, chestOf(A, chain3[i]), chestOf(A, chain3[i + 1]), Math.floor(t * 24) + i * 9, R, 2, 1); }
      for (let i = 0; i < 2; i++) spark(c, chestOf(A, bodies[i]), R, t - T[i][0], 0.9);
    });
  };
  wrap('lightning-sweep', '*-sweep', () => {});
  MOVEFX['lightning-send'] = (t, C, S) => {
    const { D, R } = C, TX = 102, TY = 50, on = t > 0.74 && t < 2.74, cross = 1.55;
    const walkK = seg(t, 0.6, 2.4), gy = lerp(74, 26, walkK), stunned = t > cross && t < cross + 0.8;
    const g = gob('g1', 82, stunned ? lerp(74, 26, seg(cross, 0.6, 2.4)) : gy, Object.assign({ face: -Math.PI / 2 + 0.4, alpha: fade(t, D), flash: K.flash(t, cross), shock: stunned && Math.floor(t * 18) % 2 ? 1 : 0 }, !stunned && walkK > 0 && walkK < 1 ? K.walk(t, 0.9) : {}));
    S.actors.push(g);
    S.fx.push((c, A, me, tw) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < 0.8 ? smooth(seg(t, 0.15, 0.7)) : 0);
      if (on) {
        const a = [me.x + 6, me.y + 1], b = [TX, TY], fl = 1 - seg(t, 2.5, 2.74);
        for (let x = a[0]; x <= b[0]; x += 2) if (rand(x, Math.floor(t * 20)) < 0.75 * fl) X.px(c, x, lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])) + (rand(x, Math.floor(t * 30), 2) < 0.3 ? -1 : 0), rand(x, 1) < 0.3 ? '#ffffff' : R[2]);
        X.glow(c, b[0], b[1], 4, R[2], 0.8 * fl); K.gring(c, b[0], b[1], 4, R[1], fl, 1);
        if (Math.floor(t * 10) % 3 === 0) K.zap(c, [lerp(a[0], b[0], 0.3), lerp(a[1], b[1], 0.3)], [lerp(a[0], b[0], 0.55), lerp(a[1], b[1], 0.55) - 2], Math.floor(t * 30), R, 1, 0);
      }
      if (t > cross && t < cross + 0.25) K.zap(c, [82, 50], chestOf(A, g), Math.floor(t * 30), R, 2, 1);
      // the 2 s timer
      if (on) { const k = 1 - seg(t, 0.74, 2.74); X.rect(c, TX - 7, TY + 6, 14, 2, '#120e1a'); X.rect(c, TX - 7, TY + 6, Math.round(14 * k), 2, R[2]); }
    });
    S.label = 'SHIFT+RMB HOLD';
  };
  wrap('lightning-defend', '*-defend', (t, C, S) => {
    const hp = C.M.hits[0];
    C.g.shock = t > hp && t < hp + 0.5 && Math.floor(t * 18) % 2 ? 1 : 0;
    S.fx.push((c, A, me) => {
      if (t > 0.4 && t < 2.3) for (let i = 0; i < 6; i++) { const ph = mod(t * 2 + i / 6, 1), a = i * 1.7 + Math.floor(t * 8); X.px(c, me.x + Math.cos(a) * (6 + ph * 3), me.y - 4 - ph * 20, ph < 0.5 ? '#ffffff' : C.R[2]); }
      if (t > hp - 0.02 && t < hp + 0.2) K.zap(c, [me.x + 3, me.y - 10], chestOf(A, C.g), Math.floor(t * 30), C.R, 2, 1);
    });
  });

  // Arcane hook
  wrap('arcane-strike', '*-strike', () => {});
  MOVEFX['arcane-thrust'] = (t, C, S) => {
    const { D, R } = C, t0 = 0.76, arrive = 0.92, p0 = 1.0, p1 = 1.3, gx0 = 88, gx1 = 50;
    const gxNow = t < p0 ? gx0 : lerp(gx0, gx1, smooth(seg(t, p0, p1)));
    const g = gob('g1', gxNow, 50, { flash: K.flash(t, arrive), z: K.hop(t, p0, 4, p1 - p0), alpha: fade(t, D), dead: K.down(t, p1 + 0.05, p1 + 0.8) * 0.6 });
    S.actors.push(g);
    S.fx.push((c, A, me) => {
      const hand = [me.x + 10, me.y - 8], ch = chestOf(A, g);
      let hk = null;
      if (t > t0 && t < arrive) { const e = seg(t, t0, arrive); hk = [lerp(hand[0], ch[0] - 2, e), lerp(hand[1], ch[1], e)]; }
      else if (t >= arrive && t < p1) hk = [ch[0] - 2, ch[1]];
      if (hk) { chain(c, hand, hk, t, 1); hookHead(c, hk[0], hk[1]); }
      spark(c, ch, R, t - arrive, 0.9);
      if (t > p0 && t < p1) for (let i = 0; i < 3; i++) X.line(c, g.x + 6 + i * 2, g.y - 3 - i * 3, g.x + 11 + i * 2, g.y - 3 - i * 3, '#d8d4e0');
    });
  };
  MOVEFX['arcane-heavy'] = (t, C, S) => {
    const { M, D, R } = C, [c0, c1] = M.charge, t0 = 1.45, arrive = 1.7, p0 = 1.75, p1 = 2.35, gx0 = 112, gx1 = 50;
    const g = gob('g1', t < p0 ? gx0 : lerp(gx0, gx1, smooth(seg(t, p0, p1))), 50, { flash: K.flash(t, arrive), alpha: fade(t, D), dead: t > p0 ? 0.6 * Math.min(1, seg(t, p0, p0 + 0.15)) * (1 - seg(t, p1, p1 + 0.3)) : 0 });
    S.actors.push(g);
    S.meO.glow = (tt) => (tt > c0 && tt < t0 ? seg(tt, c0, c1) : 0);
    S.under.push((c, E, me) => { if (t > c0 && t < t0) K.gring(c, me.x, me.y, lerp(16, 7, seg(t, c0, c1)), R[2], 0.8, 1); if (t > p0 && t < p1 + 0.3) for (let x = g.x + 4; x < gx0; x += 3) X.px(c, x, 51 + (x % 2), '#3a2a2a'); });
    S.fx.push((c, A, me) => {
      const hand = [me.x + 10, me.y - 8], ch = chestOf(A, g);
      let hk = null;
      if (t > t0 && t < arrive) { const e = seg(t, t0, arrive); hk = [lerp(hand[0], ch[0] - 2, e), lerp(hand[1], ch[1], e) - Math.sin(e * Math.PI) * 6]; }
      else if (t >= arrive && t < p1) hk = [ch[0] - 2, ch[1]];
      if (hk) { chain(c, hand, hk, t, 1.5); hookHead(c, hk[0], hk[1]); }
      spark(c, ch, R, t - arrive, 1.1);
      if (t > p0 && t < p1) for (let i = 0; i < 3; i++) X.line(c, g.x + 6 + i * 2, g.y - 3 - i * 3, g.x + 11 + i * 2, g.y - 3 - i * 3, '#d8d4e0');
      if (t > arrive && t < p1) { X.text(c, '6', 80, 56, R[1]); }
    });
    S.label = 'RMB HOLD';
  };
  wrap('arcane-sweep', '*-sweep', () => {});
  MOVEFX['arcane-send'] = (t, C, S) => {
    const { D, R } = C, PX = 98, PY = 48, t0 = 0.72, arrive = 0.95;
    S.meO.s = { alpha: fade(t, D, 0.25, 0.5), z: t > 1.1 && t < 1.5 ? Math.sin(seg(t, 1.1, 1.5) * Math.PI) * 4 : 0 };
    S.under.push((c, E) => {});
    S.actors.push(gob('g1', 112, 62, { alpha: 1, seed: 2 }));
    const post = [PY, (c) => { X.rect(c, PX - 2, PY - 14, 4, 15, '#5a4a3a'); X.rect(c, PX - 2, PY - 14, 1, 15, '#8a7456'); X.rect(c, PX - 3, PY - 15, 6, 2, '#6a5a48'); }];
    S.stand = [post];
    S.fx.push((c, A, me) => {
      K.reticle(c, PX, PY - 8, t, '#e8e4f0', t > 0.15 && t < arrive ? smooth(seg(t, 0.15, 0.7)) : 0);
      const hand = [me.x + 10, me.y - me.z - 10], tgt = [PX - 2, PY - 9];
      let hk = null;
      if (t > t0 && t < arrive) { const e = seg(t, t0, arrive); hk = [lerp(hand[0], tgt[0], e), lerp(hand[1], tgt[1], e)]; }
      else if (t >= arrive && t < 1.52) hk = tgt;
      if (hk) { chain(c, hand, hk, t, t > 1.1 ? 0 : 1.5); hookHead(c, hk[0], hk[1]); }
      spark(c, tgt, R, t - arrive, 0.8);
      if (t > 1.1 && t < 1.55) for (let i = 0; i < 3; i++) X.line(c, me.x - 6 - i * 4, me.y - 8 - i * 3, me.x - 12 - i * 4, me.y - 8 - i * 3, i ? R[3] : R[1]);
    });
    S.label = 'SHIFT+RMB HOLD';
  };
  wrap('arcane-defend', '*-defend', () => {});
  MOVEFX['arcane-defend'] = (t, C, S) => {
    const { D, R } = C, shoot = 0.7, hitT = 1.05, ax = 112;
    S.meO.hidden = (tt) => tt > 0.42 && tt < 1.45;
    const a = archer('g1', ax, 48, { draw: t < shoot ? smooth(seg(t, 0.15, shoot - 0.05)) : 0, alpha: fade(t, D) });
    S.actors.push(a);
    S.fx.push((c, A, me) => {
      const ctr = [me.x + 10, me.y - 12];
      if (t > 0.42 && t < 1.45) { const k = seg(t, 0.42, 0.6) * (1 - seg(t, 1.3, 1.45)); for (let i = 0; i < 10; i++) { const an = t * 26 + (i / 10) * TAU; X.px(c, ctr[0] + Math.cos(an) * 5 * k, ctr[1] + Math.sin(an) * 6 * k, i % 3 ? '#a89cb8' : R[2]); } const an = t * 26; hookHead(c, ctr[0] + Math.cos(an) * 5 * k, ctr[1] + Math.sin(an) * 6 * k - 1); chain(c, [me.x + 7, me.y - 9], ctr, t, 0); }
      if (t > shoot && t < hitT) { const e = seg(t, shoot, hitT); arrow(c, lerp(ax - 6, ctr[0] + 4, e), lerp(39, ctr[1], e), Math.PI); }
      if (t >= hitT && t < hitT + 0.5) { const e = seg(t, hitT, hitT + 0.5); arrow(c, ctr[0] + 4 + e * 16, ctr[1] - e * 22 + e * e * 10, -1.2 + e * 8); }
      spark(c, [ctr[0] + 4, ctr[1]], R, t - hitT, 0.9);
    });
  };

  // Stone maul
  MOVEFX['earth-strike'] = (t, C, S) => {
    const { M, D, R, gx } = C, [h1, h2, h3] = M.hits;
    const r = hitBy(t, [[h1, 3], [h2, 3], [h3, 8, 4]]);
    const g = gob('g1', gx + 1 + r.kb, 50, { flash: r.flash, z: r.z, alpha: fade(t, D), dead: K.down(t, h3 + 0.05, h3 + 0.9), sq: [h1, h2].some((h) => t > h && t < h + 0.15) ? 0.2 : 0, variant: 1 });
    S.actors.push(g);
    S.fx.push((c, A) => {
      const ch = chestOf(A, g);
      if (t < h3) woodShield(c, ch[0] - 4, ch[1]);
      for (const h of [h1, h2]) { spark(c, [ch[0] - 5, ch[1]], ['#ffffff', '#e0c8a0', '#b8946a'], t - h, 0.8); K.debris(c, ch[0] - 5, ch[1], (t - h) * 2, h * 10, 4, 14, ['#8a5a34', '#5a3a24'], 30); }
      K.debris(c, ch[0] - 4, ch[1], (t - h3) * 1.2, 7, 12, 30, ['#8a5a34', '#b8844a', '#5a3a24'], 50);
      spark(c, ch, R, t - h3, 1.4);
      if (t > h3 + 0.1 && t < h3 + 0.9) X.text(c, 'EXPOSED', g.x - 13, g.y - 24, '#f4c44a', '#120e1a');
    });
    S.shake = t > h3 && t < h3 + 0.2 ? 1.5 : 0;
  };
  wrap('earth-thrust', '*-thrust', (t, C, S) => { const h = C.M.hits[0]; S.fx.push((c) => K.dust(c, 50, 52, t - h, 4, 5, 12, '#b8a890', 0.7)); });
  wrap('earth-heavy', '*-heavy', (t, C, S) => {
    const h = C.h, D = C.D, x = 60, y = 52, r2 = hitBy(t, [[h + 0.12, 4, 6]]);
    const g2 = gob('g2', 84 + r2.kb, 38, { flash: r2.flash, z: r2.z, dead: K.down(t, h + 0.3, h + 1.1), alpha: fade(t, D), seed: 2 });
    S.actors.push(g2);
    S.shake = t > h && t < h + 0.35 ? 2.5 : 0;
    S.under.push((c) => { const k = seg(t, h, h + 0.3) * (1 - seg(t, D - 0.5, D - 0.1)); K.cracks(c, x, y, 18, 3, k); });
    S.fx.push((c) => { const e = t - h; if (e > 0 && e < 0.6) { const rr = 4 + easeOut(e / 0.6) * 30; K.gring(c, x, y, rr, EL.earth[1], 1 - e / 0.6, 2); } K.dust(c, x, y, e, 5, 8, 24, '#b8a890', 0.8); K.debris(c, x, y, e, 4, 10, 30); });
  });
  wrap('earth-sweep', '*-sweep', (t, C, S) => { S.shake = t > C.M.spin[0] && t < C.M.spin[1] ? 1 : 0; });
  MOVEFX['earth-send'] = (t, C, S) => {
    const { M, D, R, W } = C, TX = 100, TY = 52, h = 1.05;
    const r = hitBy(t, [[h, 8, 5]]);
    const g = gob('g1', 110 + r.kb, 46, { flash: r.flash, z: r.z, dead: K.down(t, h + 0.15, h + 1.0), alpha: fade(t, D) });
    S.actors.push(g);
    S.shake = t > h && t < h + 0.25 ? 2 : 0;
    S.under.push((c) => { const k = seg(t, h, h + 0.2) * (1 - seg(t, M.recall, M.recall + 0.3)); K.cracks(c, TX, TY, 12, 5, k); });
    S.fx.push((c, A, me) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < h ? smooth(seg(t, 0.15, 0.7)) : 0);
      const hand = [me.x + 8, me.y - 14];
      if (t > M.throwAt && t < h) { const e = seg(t, M.throwAt, h); WM.flatProp(c, W, lerp(hand[0], TX, e), lerp(hand[1], TY - 3, e) - Math.sin(e * Math.PI) * 22, -0.8 + e * 3.5, W.len, t); }
      else if (t >= h && t < M.recall) WM.flatProp(c, W, TX - 2, TY - 4, 2.4, W.len, t);
      else if (t >= M.recall && t < M.back) { const e = seg(t, M.recall, M.back); WM.flatProp(c, W, lerp(TX, hand[0], e), lerp(TY - 4, hand[1], e) - Math.sin(e * Math.PI) * 10, 2.4 + e * 6, W.len, t); }
      K.dust(c, TX, TY, t - h, 6, 7, 18, '#b8a890', 0.8); K.debris(c, TX, TY, t - h, 8, 8, 24);
    });
    S.label = t > M.recall - 0.1 && t < M.back ? 'SHIFT+LMB' : 'SHIFT+RMB HOLD';
  };
  MOVEFX['earth-defend'] = (t, C, S) => {
    const { D, R } = C, hitT = 1.05, punch = seg(t, 0.75, 1.42);
    const b = K.brute({ id: 'b1', x: 60, y: 52, face: Math.PI - 0.45, seed: 1, punch: t > 0.75 && t < 1.42 ? punch : -1, alpha: fade(t, D), x2: 0 });
    b.x += K.kb(t, hitT, 3, 0.2);
    S.actors.push(b);
    S.meO.s = { flash: K.flash(t, hitT) * 0.5 };
    S.under.push((c, E, me) => { if (t > 0.5 && t < 2.2) { const k = seg(t, 0.5, 0.7) * (1 - seg(t, 2.0, 2.2)); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.rock(c, me.x + Math.cos(a) * 8, me.y + 1 + Math.sin(a) * 8 * FY, 1.4 * k, i); } } });
    S.fx.push((c, A, me) => { spark(c, [me.x + 4, me.y - 12], ['#ffffff', '#fffbe0', '#e0c8a0'], t - hitT, 1.0); K.dust(c, me.x, me.y, t - hitT, 2, 5, 9, '#b8a890', 0.6); if (t > hitT && t < hitT + 0.9) X.text(c, 'NO KNOCKBACK', me.x - 22, me.y - 34, '#f4c44a', '#120e1a'); });
    S.label = 'SPACE HOLD';
  };

  // Tide glaive
  wrap('water-strike', '*-strike', (t, C, S) => { S.fx.push((c, A) => { for (const h of C.M.hits) splash(c, chestOf(A, C.g)[0], chestOf(A, C.g)[1], t - h, 6); }); });
  wrap('water-thrust', '*-thrust', (t, C, S) => { const h = C.M.hits[0]; S.fx.push((c, A) => splash(c, chestOf(A, C.g)[0], chestOf(A, C.g)[1], t - h, 10)); });
  MOVEFX['water-heavy'] = (t, C, S) => {
    MOVEFX['*-heavy'](t, C, S);
    const h = C.h, D = C.D, front = (tt) => 58 + seg(tt, h, h + 1.2) * 70;
    const hitAt = (x) => h + ((x - 58) / 70) * 1.2;
    const g2h = hitAt(86), r = hitBy(t, [[g2h, 10, 2]]);
    const g2 = status(gob('g2', 86 + r.kb, 48, { flash: r.flash, z: r.z, alpha: fade(t, D), seed: 2 }), 'water', after(t, g2h, D));
    S.actors.push(g2);
    S.under.push((c) => { const k = seg(t, h, h + 1.2); if (k > 0) for (let x = 58; x < front(t) - 4; x += 3) X.px(c, x, 52 + (x % 2), '#3a78c8'); });
    S.fx.push((c, A) => { wave(c, front(t), 52, seg(t, h, h + 1.2), 9); K.dripping(c, A, g2, t); });
  };
  wrap('water-sweep', '*-sweep', (t, C, S) => {
    const s0 = C.M.spin[0], k = seg(t, s0, s0 + 0.4) * (1 - seg(t, 2.2, 2.6));
    S.under.push((c) => K.puddle(c, 64, 55, C.r * 0.8, k * 0.9, t, 3));
    S.fx.push((c) => { if (t > s0 && t < s0 + 0.7) for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, e = seg(t, s0, s0 + 0.7), rr = C.r + e * 10; X.px(c, 64 + Math.cos(a) * rr, 54 + Math.sin(a) * rr * FY - Math.sin(e * Math.PI) * 6, i % 2 ? EL.water[1] : EL.water[0]); } });
  });
  MOVEFX['water-send'] = (t, C, S) => {
    const { M, D, R, W } = C, TX = 100, TY = 50, h = M.land;
    const k = seg(t, h, h + 0.9) * (1 - seg(t, M.recall + 0.2, M.recall + 0.6));
    const g = status(gob('g1', 112, 56, { alpha: fade(t, D) }), 'water', seg(t, h + 0.5, h + 0.8) * (1 - seg(t, D - 0.45, D - 0.1)));
    S.actors.push(g);
    S.under.push((c) => K.puddle(c, TX, TY + 2, 20, k, t, 6));
    S.fx.push((c, A, me) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < h ? smooth(seg(t, 0.15, 0.7)) : 0);
      const hand = [me.x + 8, me.y - 14];
      if (t > M.throwAt && t < h) { const e = seg(t, M.throwAt, h); WM.flatProp(c, W, lerp(hand[0], TX, e), lerp(hand[1], TY - 9, e) - Math.sin(e * Math.PI) * 10, lerp(-0.3, -1.45, e), W.len, t); }
      else if (t >= h && t < M.recall) { WM.flatProp(c, W, TX, TY - 9, -Math.PI / 2, W.len, t); for (const p of emit(t, 10, 0.5, (i, age) => ({ x: TX + (rand(i, 1) - 0.5) * 6, y: TY - age * 10 + age * age * 14, age }))) X.px(c, p.x + (p.x - TX) * p.age * 2, p.y, EL.water[1]); }
      else if (t >= M.recall && t < M.back) { const e = seg(t, M.recall, M.back); WM.flatProp(c, W, lerp(TX, hand[0], e), lerp(TY - 9, hand[1], e), Math.PI + e * 6, W.len, t); }
      splash(c, TX, TY, t - h, 10); K.dripping(c, A, g, t);
    });
    S.label = t > M.recall - 0.1 && t < M.back ? 'SHIFT+LMB' : 'SHIFT+RMB HOLD';
  };
  MOVEFX['water-defend'] = (t, C, S) => {
    const { D, R } = C, shoot = 0.75, hitT = 1.05, ax = 112;
    const a = archer('g1', ax, 48, { draw: t < shoot ? smooth(seg(t, 0.15, shoot - 0.05)) : 0, alpha: fade(t, D), wet: after(t, hitT + 0.1, D) });
    S.actors.push(a);
    const burn = t < hitT ? 1 : 0;
    S.meO.s = { burn: burn * 0.8 };
    S.fx.push((c, A, me, tw) => {
      if (burn) K.burning(c, A, me, t, 0.8);
      if (t > shoot && t < hitT) { const e = seg(t, shoot, hitT); arrow(c, lerp(ax - 6, tw.tip[0], e), lerp(39, tw.tip[1], e), Math.PI, true); }
      splash(c, tw.tip[0], tw.tip[1], t - hitT, 14);
      if (t > hitT && t < hitT + 0.9) { const e = seg(t, hitT, hitT + 0.9); for (const p of emit(t, 30, 0.6, (i, age) => ({ x: me.x + (rand(i, 21) - 0.5) * 10 + age * 3, y: me.y - 8 - rand(i, 22) * 10 - age * 14, age }), hitT, hitT + 0.5)) X.px(c, p.x, p.y, p.age < 0.5 ? '#ffffff' : '#b8c0d0'); }
      if (t > hitT + 0.05 && t < hitT + 0.35) { const e = seg(t, hitT + 0.05, hitT + 0.35); for (let i = 0; i < 6; i++) X.px(c, lerp(tw.tip[0], ax - 2, e) + i, lerp(tw.tip[1], 40, e) + (i % 2), EL.water[1]); }
      if (t > hitT && t < hitT + 0.9) X.text(c, 'PUT OUT', me.x - 12, me.y - 34, '#f4c44a', '#120e1a');
      K.dripping(c, A, a, t);
    });
    S.label = 'SPACE';
  };

  // Healing hands: the targets are allies
  const hpBar = (c, A, s, v) => K.hp(c, A, s, v);
  const sparkleHeal = (c, p, e) => { if (e < 0 || e > 0.5) return; const k = e / 0.5; X.glow(c, p[0], p[1], 8 * (1 - k * 0.5), EL.life[2], 0.8 * (1 - k)); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, r = 3 + k * 8; X.px(c, p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r * 0.8, i % 2 ? EL.life[0] : '#f4e08a'); } };
  MOVEFX['life-strike'] = (t, C, S) => {
    const { M, D } = C, [h1, h2, h3] = M.hits;
    const v = t < h1 ? 0.3 : t < h2 ? 0.5 : t < h3 ? 0.68 : 0.9;
    const al = allyWiz('p2', 46, 51, { sq: 0.25 * (1 - v), flash: 0 });
    S.actors.push(al);
    S.fx.push((c, A) => { for (const h of M.hits) sparkleHeal(c, chestOf(A, al), t - h); K.heals(c, A, al, t, t > h1 && t < h3 + 0.8 ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.3 : v); });
    S.label = 'SHIFT+LMB';
  };
  MOVEFX['life-thrust'] = (t, C, S) => {
    const { M, D } = C, h = M.hits[0], arrive = h + 0.18;
    const v = t < arrive ? 0.3 : lerp(0.3, 0.75, seg(t, arrive, arrive + 0.5));
    const al = allyWiz('p2', 74, 50, { sq: 0.25 * (1 - v) });
    S.actors.push(al, gob('g1', 104, 46, { alpha: 1 }));
    S.fx.push((c, A, me) => {
      const e = seg(t, h, arrive), from = [me.x + 12, me.y - 10], to = chestOf(A, al);
      if (t > h && t < arrive) { const x = lerp(from[0], to[0] - 3, e), y = lerp(from[1], to[1], e); for (let k = 0; k < 3; k++) X.ring(c, x - k * 4, y, 3 + k * 1.5, 5 + k * 2, k ? EL.life[2] : EL.life[0], 1 - k * 0.25, -1.2, 1.2); X.glow(c, x, y, 7, EL.life[2], 0.8); for (let f = 0; f < 4; f++) X.rect(c, x + 1, y - 3 + f * 1.5, 2, 1, EL.life[0]); }
      sparkleHeal(c, to, t - arrive); K.heals(c, A, al, t, t > arrive && t < arrive + 1 ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.3 : v);
    });
  };
  MOVEFX['life-heavy'] = (t, C, S) => {
    const { M, D } = C, h = M.hits[0], [c0, c1] = M.charge;
    const v = t < c0 ? 0.15 : t < h ? lerp(0.15, 0.45, seg(t, c0, h)) : lerp(0.45, 1, seg(t, h, h + 0.3));
    const al = allyWiz('p2', 47, 51, { sq: 0.3 * (1 - v) });
    S.actors.push(al);
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.lights.push([47, 44, 30, '#c8fab0', t > c0 && t < h + 0.4 ? 0.6 : 0]);
    S.under.push((c, E, me) => { if (t > c0 && t < h) K.gring(c, me.x, me.y, lerp(16, 7, seg(t, c0, c1)), EL.life[2], 0.8, 1); });
    S.fx.push((c, A, me) => {
      const ch = chestOf(A, al);
      if (t > c0 && t < h) for (const hh of (A.me.hands || [])) for (let k = 0; k < 3; k++) { const q = mod(t * 2.4 + k / 3, 1); X.px(c, lerp(hh[0], ch[0], q), lerp(hh[1], ch[1], q) - Math.sin(q * Math.PI) * 3, q < 0.5 ? EL.life[0] : EL.life[2]); }
      if (t > h && t < h + 0.6) { const e = seg(t, h, h + 0.6); X.ring(c, ch[0], ch[1] + 6, 3 + e * 16, (3 + e * 16) * FY, '#f4e08a', 1 - e); }
      sparkleHeal(c, ch, t - h); K.heals(c, A, al, t, t > c0 && t < h + 1 ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.15 : v);
    });
  };
  MOVEFX['life-sweep'] = (t, C, S) => {
    const { M, D } = C, mx = 64, my = 54, h = sweepHitT(M, 0);
    const v = t < h ? 0.3 : lerp(0.3, 0.75, seg(t, h, h + 0.4));
    const near = allyWiz('p2', mx + 15, my + 2, { face: Math.PI, sq: 0.25 * (1 - v) });
    const far = allyWiz('p3', mx - 34, my - 2, { team: 'p3', face: 0, sq: 0.15 });
    const g = gob('g1', mx - 13, my + 9, { face: -0.4, alpha: 1 });
    S.actors.push(near, far, g);
    S.under.push((c) => { if (t > M.tell[0] && t < M.spin[1] + 0.2) dashedRing(c, mx, my, 14, EL.life[1], t, 0.8); });
    S.fx.push((c, A) => {
      sparkleHeal(c, chestOf(A, near), t - h); K.heals(c, A, near, t, t > h && t < h + 1 ? 1 : 0); hpBar(c, A, near, t > D - 0.25 ? 0.3 : v); hpBar(c, A, far, 0.4);
      if (t > M.spin[1] && t < M.spin[1] + 1.0) { X.text(c, 'NO RING', far.x - 13, far.y - 36, '#a8a3bb', '#120e1a'); }
    });
  };
  MOVEFX['life-send'] = (t, C, S) => {
    const { M, D } = C, TX = 102, TY = 50, h = M.land;
    const v = t < h ? 0.3 : lerp(0.3, 0.7, seg(t, h, h + 0.5));
    const al = allyWiz('p2', TX, TY, { sq: 0.25 * (1 - v) });
    S.actors.push(al);
    S.meO.hidden = () => false;
    S.fx.push((c, A, me) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < h ? smooth(seg(t, 0.15, 0.7)) : 0);
      const from = [me.x + 8, me.y - 14], to = chestOf(A, al);
      if (t > M.throwAt && t < h) K.mote(c, from, to, seg(t, M.throwAt, h), EL.life, 14);
      sparkleHeal(c, to, t - h); K.heals(c, A, al, t, t > h && t < h + 1 ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.3 : v);
    });
    S.label = 'SHIFT+RMB HOLD';
  };
  MOVEFX['life-defend'] = (t, C, S) => {
    const { D } = C, v = lerp(0.25, 0.7, seg(t, 0.5, 2.3));
    S.lights.push([30, 44, 26, '#c8fab0', t > 0.45 && t < 2.3 ? 0.5 : 0]);
    S.fx.push((c, A, me) => { K.heals(c, A, me, t, t > 0.5 && t < 2.3 ? 0.6 : 0); hpBar(c, A, me, t > D - 0.25 ? 0.25 : v); });
    S.label = 'SPACE HOLD';
  };

  // hands don't hide when "thrown" (the life Send tosses a mote)
  for (const W of WM.WEAPONS) for (const mv of WM.MOVE_IDS) moveVignette(W, mv);

  // ---------------------------------------------------------------------------
  // Weapon cards: conjure it, hold it, one show-off swing
  for (const W of WM.WEAPONS) {
    const D = 3.6, c1 = 0.62;
    const show = WM.track([[0, {}], [1.5, {}], [1.75, { hR: [0.5, 5, 13], p: 1.3, y: 1.5 }], [1.88, { hR: [7.5, 1, 9], p: -0.05, y: -1.15 }, 'lin'], [2.2, {}], [2.8, WM.IDLE]]);
    add({ id: `w-${W.id}`, kind: 'weapon', weapon: W.id, w: 88, h: 80, dur: D, ground: 'plaza', seed: 11 + W.len, still: 2.4,
      frame(t) {
        const grow = W.id === 'staff' ? 1 : seg(t, c1, c1 + 0.2);
        const me = wizard(W, show, t, { x: 40, y: 56, face: 0.35, sm: [[1.75, 1.92]], hidden: () => grow < 0.05, size: 0.3 + 0.7 * grow, s: W.id === 'staff' || t > c1 ? {} : { prep: smooth(seg(t, 0.05, 0.2)), prepKind: 'conjure' } });
        return {
          actors: [me],
          lights: [[me.x + 8, me.y - 10, 26, W.R[2], W.id === 'staff' ? 0.15 : 0.45]],
          under(c) { if (W.id !== 'staff' && t > c1 - 0.05 && t < c1 + 0.5) K.seal(c, me.x, me.y, 10, t, 1 - seg(t, c1 + 0.2, c1 + 0.5)); },
          fx(c, A) {
            if (W.id !== 'staff') {
              K.prep(c, me, A, t, W.q, 0.05, c1);
              if (t > c1 && t < c1 + 0.3) { const e = seg(t, c1, c1 + 0.3), p = A.me.hands[1]; X.ring(c, p[0], p[1], 2 + e * 10, 2 + e * 8, EL.sigil[1], 1 - e); }
            }
          },
        };
      } });
  }

  // ---------------------------------------------------------------------------
  // Guards
  const GW = 144, GH = 84, GME = { x: 42, y: 54 };
  const STAFF = W_.staff;
  const holdTrack = WM.track([[0, {}], [3, {}]]);
  const block = (t, a = 0.35, b = 2.5) => smooth(seg(t, a, a + 0.12)) * (1 - smooth(seg(t, b, b + 0.2)));
  function guardWiz(id, t, k, o = {}) { return wizard(STAFF, o.track || holdTrack, t, Object.assign({ x: GME.x, y: GME.y, guard: { id, k, hit: o.hit || 0 } }, o)); }
  const guardPt = (me, k) => WM.world(me, [6.5, 0.2, 10.5 * k + 8 * (1 - k)]);
  function guardVig(id, dur, frame, still) { add({ id: `g-${id}`, kind: 'guard', guard: id, w: GW, h: GH, dur, ground: 'path', seed: 30 + id.length, still: still || 1.25, frame }); }

  guardVig('mirror', 2.8, (t) => {
    const D = 2.8, shoot = 0.85, land = 1.2, back = 1.5, k = env(t, 1.08, 1.45, 0.06, 0.12);
    const r = hitBy(t, [[back, 6, 2]]);
    const a = archer('a1', 124 + r.kb, 52, { draw: t < shoot ? smooth(seg(t, 0.25, shoot - 0.05)) : 0, flash: r.flash, z: r.z, dead: K.down(t, back + 0.1, back + 1.0), alpha: fade(t, D) });
    const me = guardWiz('mirror', t, k, { hit: K.flash(t, land) });
    const gp = guardPt(me, 1);
    return { actors: [me, a], lights: [[gp[0], gp[1] + 8, 20, '#ffe68a', t > land && t < land + 0.3 ? 0.8 : 0.1]],
      fx(c, A) {
        if (t > shoot && t < land) { const e = seg(t, shoot, land); arrow(c, lerp(118, gp[0] + 4, e), lerp(43, gp[1], e), Math.PI); }
        if (t >= land && t < back) { const e = seg(t, land, back); arrow(c, lerp(gp[0] + 4, 120, e), lerp(gp[1], 43, e), 0); X.px(c, lerp(gp[0] + 4, 120, e) - 8, lerp(gp[1], 43, e), '#fffbe0'); }
        spark(c, [gp[0] + 2, gp[1]], EL.shield, t - land, 1.1); spark(c, chestOf(A, a), EL.shield, t - back, 0.9);
        if (t > land && t < land + 0.6) X.text(c, 'PARRY', gp[0] - 6, gp[1] - 16, '#f4c44a', '#120e1a');
        keycap(c, GH, 'SPACE TAP', t > 1.05 && t < 1.4);
      } };
  });
  guardVig('bulwark', 3.2, (t) => {
    const D = 3.2, k = block(t, 0.35, 2.6), hit = 1.0, thunk = 1.7, step = 6 * smooth(seg(t, 0.5, 2.4));
    const trk = WM.track([[0, {}], [3.2, {}]]);
    const me = wizard(STAFF, trk, t, Object.assign({ x: GME.x + step, y: GME.y, guard: { id: 'bulwark', k, hit: K.flash(t, hit) }, s: t > 0.5 && t < 2.4 ? K.walk(t, 0.3) : {} }));
    const walkK = seg(t, 0.25, hit - 0.03), r = hitBy(t, [[hit, 10, 3]]);
    const g = gob('g1', lerp(130, me.x + 18, walkK) + r.kb, 55, Object.assign({ flash: r.flash, z: r.z, sq: t > hit && t < hit + 0.3 ? 0.25 : 0, alpha: fade(t, D) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : {}));
    const a = archer('a1', 128, 40, { draw: t < 1.4 ? smooth(seg(t, 0.8, 1.35)) : 0, alpha: fade(t, D) });
    const gp = guardPt(me, 1);
    return { actors: [me, g, a],
      fx(c, A) {
        spark(c, [gp[0] + 4, gp[1]], EL.earth, t - hit, 1.1);
        if (t > 1.4 && t < thunk) { const e = seg(t, 1.4, thunk); arrow(c, lerp(122, gp[0] + 5, e), lerp(31, gp[1] - 3, e), Math.PI + 0.1); }
        if (t >= thunk && t < 2.7) arrow(c, gp[0] + 6, gp[1] - 3, Math.PI + 0.1);
        spark(c, [gp[0] + 5, gp[1] - 3], EL.earth, t - thunk, 0.7);
        if (t > 0.5 && t < 2.4) X.text(c, 'SLOW', me.x - 8, me.y + 4, '#a8a3bb');
        keycap(c, GH, 'SPACE HOLD', k > 0.5);
      } };
  }, 1.05);
  guardVig('ember', 3.0, (t) => {
    const D = 3.0, k = block(t, 0.35, 2.4), hit = 1.0, shot = 1.75;
    const walkK = seg(t, 0.25, hit - 0.03), r = hitBy(t, [[hit, 9, 2]]), burn = after(t, hit, D);
    const g = status(gob('g1', lerp(130, 62, walkK) + r.kb, 55, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : {})), 'fire', burn);
    const a = archer('a1', 128, 40, { draw: t < 1.45 ? smooth(seg(t, 0.9, 1.4)) : 0, alpha: fade(t, D) });
    const me = guardWiz('ember', t, k, { hit: Math.max(K.flash(t, hit), K.flash(t, shot)) });
    const gp = guardPt(me, 1);
    return { actors: [me, g, a], lights: [[gp[0], gp[1] + 8, 22, '#ff9a30', 0.4 + (t > shot && t < shot + 0.3 ? 0.5 : 0)]],
      fx(c, A) {
        spark(c, [gp[0] + 4, gp[1]], EL.fire, t - hit, 1.2); K.burning(c, A, g, t, burn);
        if (t > 1.45 && t < shot) { const e = seg(t, 1.45, shot); arrow(c, lerp(122, gp[0] + 4, e), lerp(31, gp[1], e), Math.PI + 0.1, true); }
        if (t > shot && t < shot + 0.6) X.text(c, 'NO DAMAGE', gp[0] - 14, gp[1] - 16, '#f4c44a', '#120e1a');
        if (t > hit + 0.1 && t < hit + 0.7) X.text(c, 'THORNS', g.x - 10, g.y - 24, '#f4c44a', '#120e1a');
        keycap(c, GH, 'SPACE HOLD', k > 0.5);
      } };
  });
  guardVig('rime', 3.2, (t) => {
    const D = 3.2, k = block(t, 0.35, 2.6), ice = seg(t, 0.45, 1.1) * (1 - seg(t, D - 0.4, D - 0.1));
    // a charger: fast until it reaches the ice at x ~ 84, then slips and crawls
    const x = t < 1.0 ? lerp(132, 84, seg(t, 0.3, 1.0)) : lerp(84, 60, easeOut(seg(t, 1.0, 2.2)));
    const slip = t > 1.0 && t < 1.6, hit = 2.2, chill = seg(t, 1.0, 1.6) * (1 - seg(t, D - 0.45, D - 0.1));
    const g = gob('g1', x + K.kb(t, hit, 3, 0.2), 55, Object.assign({ face: Math.PI + (slip ? Math.sin(t * 20) * 0.9 : 0), chill, z: slip ? Math.abs(Math.sin(t * 10)) * 1.5 : 0, alpha: fade(t, D), flash: K.flash(t, hit) * 0.5 }, K.walk(t, t < 1.0 ? 1.6 : t < 2.2 ? 0.4 : 0)));
    const me = guardWiz('rime', t, k, { hit: K.flash(t, hit) });
    return { actors: [me, g],
      under(c) { K.ice(c, GME.x + 32, GME.y + 1, 16 * Math.max(0.3, ice), ice, 300, 7); },
      fx(c, A) {
        K.chilled(c, A, g, t, chill);
        if (slip) X.text(c, 'SLIP', g.x - 6, g.y - 22, '#f4c44a', '#120e1a');
        if (t < 1.0 && t > 0.3) for (let i = 0; i < 3; i++) X.line(c, g.x + 6 + i * 2, g.y - 3 - i * 3, g.x + 10 + i * 2, g.y - 3 - i * 3, '#d8d4e0');
        keycap(c, GH, 'SPACE HOLD', k > 0.5);
      } };
  }, 1.3);
  guardVig('spark', 3.0, (t) => {
    const D = 3.0, shoot = 0.85, land = 1.2, k = Math.max(block(t, 0.35, 2.4) * 0.85, env(t, 1.1, 1.4, 0.05, 0.1));
    const sh = (h) => t > h && t < h + 0.9 && Math.floor(t * 18) % 2 ? 1 : 0;
    const a = archer('a1', 124, 54, { draw: t < shoot ? smooth(seg(t, 0.25, shoot - 0.05)) : 0, shock: sh(land + 0.02), flash: K.flash(t, land + 0.02), alpha: fade(t, D) });
    const g = gob('g1', 104, 34, { shock: sh(land + 0.08), flash: K.flash(t, land + 0.08), alpha: fade(t, D), seed: 2 });
    const me = guardWiz('spark', t, k, { hit: K.flash(t, land) });
    const gp = guardPt(me, 1);
    return { actors: [me, a, g], lights: [[gp[0], gp[1] + 6, 22, '#c4a4ff', t > land && t < land + 0.4 ? 0.8 : 0.2]],
      fx(c, A) {
        if (t > shoot && t < land) { const e = seg(t, shoot, land); arrow(c, lerp(118, gp[0] + 4, e), lerp(45, gp[1], e), Math.PI); }
        if (t > land - 0.02 && t < land + 0.3) { K.zap(c, gp, chestOf(A, a), Math.floor(t * 30), EL.lightning, 2, 1); K.zap(c, chestOf(A, a), chestOf(A, g), Math.floor(t * 30) + 5, EL.lightning, 1, 0); }
        spark(c, gp, EL.lightning, t - land, 1);
        if (t > land + 0.1 && t < land + 0.9) X.text(c, 'STUN', a.x - 8, a.y - 26, '#f4c44a', '#120e1a');
        keycap(c, GH, t > 1.05 && t < 1.4 ? 'SPACE TAP' : 'SPACE HOLD', k > 0.5);
      } };
  });
  guardVig('tide', 2.8, (t) => {
    const D = 2.8, k = block(t, 0.35, 2.3), hit = 1.0;
    const walkK = seg(t, 0.25, hit - 0.03), r = hitBy(t, [[hit, 22, 2]]);
    const g = status(gob('g1', lerp(130, 60, walkK) + r.kb, 55, Object.assign({ flash: r.flash * 0.6, z: r.z, alpha: fade(t, D) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : {})), 'water', after(t, hit, D));
    const me = guardWiz('tide', t, k, { hit: env(t, hit, hit + 0.5, 0.02, 0.4) });
    const gp = guardPt(me, 1);
    return { actors: [me, g],
      under(c) { K.puddle(c, g.x, g.y + 1, 7, after(t, hit, D) * 0.8, t, 2, false); },
      fx(c, A) { splash(c, gp[0] + 4, gp[1], t - hit, 14); K.dripping(c, A, g, t); if (t > hit + 0.1 && t < hit + 0.8) X.text(c, 'SHOVE', g.x - 8, g.y - 24, '#f4c44a', '#120e1a'); keycap(c, GH, 'SPACE HOLD', k > 0.5); } };
  }, 1.15);
  guardVig('prism', 3.0, (t) => {
    const D = 3.0, k = block(t, 0.35, 2.5), b0 = 0.75, b1 = 2.25;
    const caster = archer('a1', 122, 52, { draw: 0, alpha: fade(t, D), tint: '#a04a2a', tintK: 0.25 });
    const me = guardWiz('prism', t, k, {});
    return { actors: [me, caster], lights: [[96, 50, 40, '#ff9a30', t > b0 && t < b1 ? 0.5 : 0]],
      fx(c, A) {
        const gp = A.me.guard || guardPt(me, 1);
        if (t > b0 && t < b1) {
          const on = seg(t, b0, b0 + 0.15) * (1 - seg(t, b1 - 0.1, b1)), src = [caster.x - 5, caster.y - 9], hitP = [gp[0] + 3, gp[1]];
          const fl = Math.floor(t * 20) % 2;
          X.line(c, src[0], src[1], hitP[0], hitP[1], EL.fire[3], 3); X.line(c, src[0], src[1], hitP[0], hitP[1], fl ? EL.fire[1] : EL.fire[0], 1);
          // the bend: off to the side, split into colours
          const out = [hitP[0] + 30, hitP[1] - 34];
          const cols = ['#ff6a6a', '#ffe070', '#6aff9a', '#6ab0ff'];
          cols.forEach((col, i) => X.line(c, hitP[0], hitP[1], out[0] + i * 3, out[1] + i * 2, col, 1));
          X.glow(c, hitP[0], hitP[1], 6, EL.arcane[1], 0.9 * on);
          X.glow(c, src[0], src[1], 4, EL.fire[2], 0.8);
          if (t > b0 + 0.3) X.text(c, 'BENT', out[0] + 4, out[1] + 6, '#f4c44a', '#120e1a');
        }
        keycap(c, GH, 'SPACE HOLD', k > 0.5);
      } };
  }, 1.4);
  guardVig('leaf', 3.2, (t) => {
    const D = 3.2, k = block(t, 0.35, 2.7), shots = [0.95, 1.8];
    const v = lerp(0.25, 0.8, seg(t, 0.5, 2.6));
    const al = allyWiz('p2', 22, 50, { face: 0, sq: 0.2 * (1 - v) });
    const a = archer('a1', 126, 52, { draw: mod(t, 0.85) / 0.85, alpha: fade(t, D) });
    const me = guardWiz('leaf', t, k, { hit: shots.reduce((m, h) => Math.max(m, K.flash(t, h)), 0) });
    const gp = guardPt(me, 1);
    return { actors: [me, al, a], lights: [[30, 50, 30, '#c8fab0', k * 0.6]],
      under(c) { if (k > 0.3) for (let i = 0; i < 18; i++) { const x = 18 + i * 1.5, w = 4 + i * 0.3; X.ellipse(c, x, 52, 1, w * 0.4, EL.life[3], 0.25 * k); } },
      fx(c, A) {
        for (const h of shots) { if (t > h - 0.35 && t < h) { const e = seg(t, h - 0.35, h); arrow(c, lerp(120, gp[0] + 4, e), lerp(43, gp[1], e), Math.PI); } spark(c, [gp[0] + 3, gp[1]], EL.life, t - h, 0.8); }
        K.heals(c, A, al, t, k); hpBar(c, A, al, t > D - 0.25 ? 0.25 : v);
        if (k > 0.5) X.text(c, 'COVER', al.x - 10, al.y + 3, '#c8fab0');
        keycap(c, GH, 'SPACE HOLD', k > 0.5);
      } };
  }, 1.6);

  // ---------------------------------------------------------------------------
  // Both hands
  function dualVig(id, dur, frame, still) { add({ id, kind: 'dual', w: GW, h: GH, dur, ground: 'grass', seed: 50 + id.length, still: still || 1.3, frame }); }
  // spear + Bulwark: Space blocks, RMB thrusts over it; the guard drops for the attack
  dualVig('d-spear-bulwark', 3.4, (t) => {
    const D = 3.4, W = W_.cold, off = 0.75, th = WM.track(WM.keysFor(W, 'thrust')), pose = (tt) => th(clamp(tt - off, 0, 2.39));
    const attacking = t > off + 0.3 && t < off + 1.6;
    const k = block(t, 0.25, off + 0.3) + (t > off + 1.6 ? smooth(seg(t, off + 1.6, off + 1.75)) * (1 - smooth(seg(t, D - 0.4, D - 0.2))) : 0);
    const hitT = off + 0.82, arrowT = 0.65;
    const me = wizard(W, pose, t, { x: 34, y: 54, guard: { id: 'bulwark', k, hit: K.flash(t, arrowT) }, move: 'thrust', sm: [[off + 0.7, off + 0.86]] });
    const r = hitBy(t, [[hitT, 9, 2]]);
    const g = status(gob('g1', 84 + r.kb, 54, { flash: r.flash, z: r.z, alpha: fade(t, D) }), 'cold', after(t, hitT, D));
    const a = archer('a1', 130, 40, { draw: t < 0.4 ? smooth(seg(t, 0.05, 0.38)) : 0, alpha: fade(t, D) });
    const gp = guardPt(me, 1);
    return { actors: [me, g, a],
      fx(c, A) {
        if (t > 0.4 && t < arrowT) { const e = seg(t, 0.4, arrowT); arrow(c, lerp(124, gp[0] + 5, e), lerp(31, gp[1] - 2, e), Math.PI + 0.1); }
        if (t >= arrowT && t < off + 0.4) arrow(c, gp[0] + 6, gp[1] - 2, Math.PI + 0.1);
        spark(c, [gp[0] + 5, gp[1] - 2], EL.earth, t - arrowT, 0.8); spark(c, chestOf(A, g), EL.cold, t - hitT, 1.1); K.chilled(c, A, g, t, after(t, hitT, D));
        if (attacking && k < 0.3) X.text(c, 'GUARD DOWN', me.x - 18, me.y + 4, '#e69191', '#120e1a');
        keycap(c, GH, attacking ? 'RMB' : 'SPACE HOLD', true);
      } };
  }, 1.58);
  // Flame sword + Ember targe: block a club (it catches fire), then a Strike combo
  dualVig('d-sword-ember', 3.6, (t) => {
    const D = 3.6, W = W_.fire, off = 1.0, st = WM.track(WM.keysFor(W, 'strike')), pose = (tt) => st(clamp(tt - off, 0, 2.59));
    const hits = WM.MOVES.strike.hits.map((h) => h + off), hit = 0.8, attacking = t > off + 0.15 && t < off + 1.7;
    const k = block(t, 0.25, off + 0.1) + (t > off + 1.7 ? smooth(seg(t, off + 1.7, off + 1.85)) * (1 - smooth(seg(t, D - 0.4, D - 0.2))) : 0);
    const me = wizard(W, pose, t, { x: 36, y: 54, guard: { id: 'ember', k, hit: K.flash(t, hit) }, move: 'strike', sm: WM.MOVES.strike.sm.map(([a, b]) => [a + off, b + off]) });
    const walkK = seg(t, 0.1, hit - 0.03), r = hitBy(t, [[hit, 3], ...hits.map((h, i) => [h, i === 2 ? 7 : 2, i === 2 ? 3 : 0])]);
    const burn = after(t, hit, D);
    const g = status(gob('g1', lerp(110, 58, walkK) + r.kb, 54, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : {})), 'fire', burn);
    const gp = guardPt(me, 1);
    return { actors: [me, g],
      fx(c, A) {
        spark(c, [gp[0] + 4, gp[1]], EL.fire, t - hit, 1); for (const h of hits) spark(c, chestOf(A, g), EL.fire, t - h, 0.9);
        flameCrescent(c, g.x + 6 + seg(t, hits[2], hits[2] + 0.45) * 26, 45, seg(t, hits[2], hits[2] + 0.45));
        K.burning(c, A, g, t, burn);
        if (attacking && k < 0.3) X.text(c, 'GUARD DOWN', me.x - 18, me.y + 4, '#e69191', '#120e1a');
        keycap(c, GH, attacking ? 'SHIFT+LMB' : 'SPACE HOLD', true);
      } };
  }, 2.24);
  // a Stone maul conjured while holding a Mirror buckler: two-handed, so the buckler goes
  dualVig('d-maul-over-buckler', 3.4, (t) => {
    const D = 3.4, c1 = 1.05, W = W_.earth, after1 = t >= c1;
    const prep = { prep: !after1 && t > 0.3 ? smooth(seg(t, 0.3, 0.45)) : 0, prepKind: 'conjure' };
    const me = after1
      ? wizard(W, holdTrack, t, { x: 46, y: 54, size: 0.4 + 0.6 * seg(t, c1, c1 + 0.2), s: {} })
      : wizard(STAFF, holdTrack, t, { x: 46, y: 54, guard: { id: 'mirror', k: 0.6 }, s: prep });
    return { actors: [me, gob('g1', 112, 50, { alpha: 1 })],
      under(c) { if (t > c1 - 0.05 && t < c1 + 0.5) K.seal(c, me.x, me.y, 10, t, 1 - seg(t, c1 + 0.2, c1 + 0.5)); },
      fx(c, A) {
        if (!after1) K.prep(c, me, A, t, ['sigil', 'earth'], 0.3, c1);
        if (t > c1 && t < c1 + 0.7) {
          const e = seg(t, c1, c1 + 0.7), p = WM.world(me, [2, -3.6, 8]);
          for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; X.px(c, p[0] + Math.cos(a) * e * 9, p[1] + Math.sin(a) * e * 6 + e * e * 10, i % 2 ? '#ffe68a' : '#ffffff'); }
          X.ring(c, p[0], p[1], 2 + e * 6, 2 + e * 5, '#ffe68a', 1 - e);
        }
        if (t > c1 + 0.2 && t < D - 0.3) { X.text(c, 'TWO-HANDED', 72, 18, '#f4c44a', '#120e1a'); X.text(c, 'BUCKLER REPLACED', 60, 26, '#e69191', '#120e1a'); }
        keycap(c, GH, t > 0.3 && t < c1 + 0.1 ? 'SIGIL+EARTH SHIFT+LMB' : '', true);
      } };
  }, 1.6);
})();
