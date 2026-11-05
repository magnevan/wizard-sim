/* Weapon Moveset Review: every vignette on the page.
 *   w-<weapon>            the weapon card: conjure, hold, one show-off swing
 *   w-<weapon>-<move>     Strike / Heavy / Special per weapon (round 2 slugs in weapons.js R2)
 *   g-<guard>-defend / -retreat   the eight guards: Space (block, parry) and Shift+LMB (retreat)
 * A vignette is { id, kind, w, h, dur, ground, seed, frame(t, K) } (see stage.js).
 * Shared tells: every weapon uses the same pose track per move (weapons.js MOVES), so a
 * partner learns a few silhouettes; the weapon only changes the colour and the effect.
 * Round-1 cut moves (Thrust, Send, weapon Defend), the hook and the both-hands scenes are gone. */
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
  function moveScene(W, mv, t, poseAt, M = WM.MOVES[mv], fxKey = null) {
    const D = M.dur, el = W.el, R = W.R;
    const gx = Math.round(30 + 10 + W.len * 0.95 + 3);
    const C = { W, M, D, el, R, gx, poseAt, t };
    const S = { actors: [], under: [], fx: [], lights: [], shake: 0, meO: {}, label: M.gesture.replace(' ×3', '').replace(', release', '').toUpperCase() };
    const key = fxKey || W.id + '-' + mv;
    (MOVEFX[key] || MOVEFX['*-' + mv])(t, C, S);
    return S;
  }
  // v: { id, M (move timing override), keys (pose track), fx (MOVEFX key), still }
  function moveVignette(W, mv, v = {}) {
    const M = v.M ? Object.assign({}, WM.MOVES[mv], v.M) : WM.MOVES[mv], poseAt = WM.track(v.keys || WM.keysFor(W, mv)), wide = mv === 'sweep' && !v.narrow;
    add({ id: v.id || `w-${W.id}-${mv}`, kind: 'move', weapon: W.id, move: mv, slot: mv === 'sweep' ? 'special' : mv, w: MW, h: MH, dur: M.dur, ground: W.id === 'life' ? 'plaza' : 'grass', seed: 3 + W.len + mv.length, still: v.still || (M.hits ? M.hits[M.hits.length - 1] + 0.2 : M.spin ? M.spin[0] + 0.3 : 1.2),
      frame(t) {
        const S = moveScene(W, mv, t, poseAt, M, v.fx);
        const me = S.me || wizard(W, poseAt, t, Object.assign({ x: wide ? 64 : 30, y: wide ? 54 : 50, move: mv, sm: M.sm }, S.meO));
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

  // ---- weapon-specific shapes ----------------------------------------------------
  const wrap = (key, base, extra) => { MOVEFX[key] = (t, C, S) => { MOVEFX[base](t, C, S); extra(t, C, S); }; };

  // Bare staff: shoves only (strike / thrust / heavy / sweep are the defaults in grey)

  // Flame sword
  wrap('fire-strike', '*-strike', (t, C, S) => { const h3 = C.M.hits[2]; S.fx.push((c, A) => flameCrescent(c, C.g.x + 6 + seg(t, h3, h3 + 0.45) * 26, 41, seg(t, h3, h3 + 0.45))); });
  wrap('fire-sweep', '*-sweep', (t, C, S) => {
    const s0 = C.M.spin[0], k = seg(t, s0, s0 + 0.1) * (1 - seg(t, 2.1, 2.5)), e = seg(t, s0, C.M.spin[1]), pts = [];
    for (let i = 0; i < 22; i++) { const a = 1.45 - (i / 22) * TAU; if (i / 22 <= e) pts.push([64 + Math.cos(a) * C.r, 54 + Math.sin(a) * C.r * FY]); }
    S.fx.push((c) => fireRow(c, pts, t, k, 6));
  });

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
  wrap('cold-sweep', '*-sweep', (t, C, S) => {
    const s0 = C.M.spin[0], k = seg(t, s0, s0 + 0.3) * (1 - seg(t, 2.1, 2.5));
    S.under.push((c) => { if (k > 0.02) for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU, rr = C.r + (rand(i, 2) - 0.5) * 6; if (rand(i, 3) < k) X.px(c, 64 + Math.cos(a) * rr, 54 + Math.sin(a) * rr * FY, i % 3 ? EL.cold[1] : '#ffffff'); } });
  });

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
  wrap('earth-sweep', '*-sweep', (t, C, S) => { S.shake = t > C.M.spin[0] && t < C.M.spin[1] ? 1 : 0; });

  // Tide glaive
  wrap('water-strike', '*-strike', (t, C, S) => { S.fx.push((c, A) => { for (const h of C.M.hits) splash(c, chestOf(A, C.g)[0], chestOf(A, C.g)[1], t - h, 6); }); });
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

  // Healing hands: the targets are allies
  const hpBar = (c, A, s, v) => K.hp(c, A, s, v);
  const sparkleHeal = (c, p, e) => { if (e < 0 || e > 0.5) return; const k = e / 0.5; X.glow(c, p[0], p[1], 8 * (1 - k * 0.5), EL.life[2], 0.8 * (1 - k)); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, r = 3 + k * 8; X.px(c, p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r * 0.8, i % 2 ? EL.life[0] : '#f4e08a'); } };
  MOVEFX['life-strike'] = (t, C, S) => {
    const { M, D } = C, [h1, h2, h3] = M.hits;
    const v = t < h1 ? 0.3 : t < h2 ? 0.5 : t < h3 ? 0.68 : 0.9;
    const al = allyWiz('p2', 46, 51, { sq: 0.25 * (1 - v), flash: 0 });
    S.actors.push(al);
    S.fx.push((c, A) => { for (const h of M.hits) sparkleHeal(c, chestOf(A, al), t - h); K.heals(c, A, al, t, t > h1 && t < h3 + 0.8 ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.3 : v); });
    S.label = 'RMB TAP';
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



  // ---------------------------------------------------------------------------
  // Round 2 (grammar v2): the redesigned moves. Timings reuse the shared Heavy / Strike rhythm.
  const HV = WM.MOVES.heavy, IDLE = WM.IDLE;

  // Frost spear Heavy, v2: the impaling dash goes much further (about 2.5x round 1)
  const COLD_DASH = [[0, {}], [0.15, {}], [0.45, { hR: [-3, 4.5, 10], p: 0.05, y: 0.05 }], [1.3, { hR: [-3.5, 4.5, 10] }], [1.44, { hR: [11, 2, 9], p: 0, y: 0, st: 16 }, 'lin'],
    [1.78, { st: 92 }, 'out'], [2.15, IDLE], [2.4, {}], [3.05, { st: 0 }]];
  MOVEFX['cold-heavy2'] = (t, C, S) => {
    const { M, D, R } = C, h = M.hits[0], [c0, c1] = M.charge, GX = 52, X0 = 14, pass = 1.49;
    const g = gob('g1', GX, 50, { frozen: t < pass ? 1 : 0, alpha: t < pass ? fade(t, D) : 0 });
    S.actors.push(g);
    S.meO.x = X0;
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.meO.s = t > 2.4 && t < 3.05 ? K.walk(t, 0.8) : {};
    S.shake = t > pass && t < pass + 0.2 ? 1.5 : 0;
    S.under.push((c, E, me) => {
      if (t > c0 && t < h) K.gring(c, me.x, me.y, lerp(16, 7, seg(t, c0, c1)), R[2], 0.8, 1);
      // a frost streak along the dash, fading
      const k = seg(t, h, h + 0.05) * (1 - seg(t, 2.2, 2.7));
      if (k > 0.02) for (let x = X0 + 14; x < Math.min(me.x, X0 + 92); x += 2) if (rand(x, 7) < k) X.px(c, x, 51 + (x % 3 === 0 ? 1 : 0), x % 4 ? EL.cold[2] : '#ffffff');
      // where the round-1 dash stopped, for comparison
      if (t > 1.6 && t < 2.6) { X.rect(c, X0 + 34, 55, 1, 4, '#6f6a85'); X.text(c, 'R1', X0 + 31, 60, '#6f6a85'); }
    });
    S.fx.push((c, A, me) => {
      if (t > h && t < 1.78) for (let i = 0; i < 4; i++) X.line(c, me.x - 8 - i * 5, me.y - 4 - i * 3, me.x - 16 - i * 7, me.y - 4 - i * 3, i ? R[2] : '#ffffff');
      if (t > pass && t < pass + 0.7) { const e = seg(t, pass, pass + 0.7); for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + rand(i, 4) * 0.3, sp = 10 + rand(i, 5) * 16; K.shard(c, GX + Math.cos(a) * sp * e, 44 + Math.sin(a) * sp * e * 0.6 + 26 * e * e, a + e * 4, 3 + rand(i, 6) * 3, i + 1, 1 - e); } X.glow(c, GX, 44, 10, EL.cold[2], 1 - e); }
      spark(c, [GX, 42], R, t - pass, 1.4);
      if (t > pass + 0.1 && t < pass + 0.9) X.text(c, 'SHATTER', GX - 14, 26, '#f4c44a', '#120e1a');
    });
    S.label = 'RMB HOLD';
  };

  // Frost spear Special, v2: the javelin. An ice javelin splits off the spear; the spear stays in hand.
  const COLD_THROW = [[0, {}], [0.15, {}], [0.4, { hR: [-2.5, 4, 15], p: 0.35, y: 0 }], [0.62, { hR: [-3, 4, 15.5] }], [0.72, { hR: [8, 2, 11], p: -0.1, y: 0 }, 'lin'], [1.2, {}], [1.8, IDLE]];
  MOVEFX['cold-javelin'] = (t, C, S) => {
    const { D, R } = C, TX = 104, TY = 50, t0 = 0.72, land = 1.0, gone = 2.3;
    const r = hitBy(t, [[land, 3, 1]]), k = after(t, land, D, 0.5);
    const g = status(gob('g1', TX + 2 + r.kb, TY, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D) }, K.walk(t, t > land && t < gone ? 0.9 : 0))), 'cold', k);
    S.actors.push(g);
    S.meO.glow = (tt) => (tt > 0.35 && tt < t0 ? seg(tt, 0.35, 0.65) : 0);
    S.under.push((c) => K.ice(c, TX + 2, TY + 2, 13 * k, k, 200, 4));
    S.fx.push((c, A, me) => {
      K.reticle(c, TX, TY, t, '#e8e4f0', t > 0.15 && t < land + 0.1 ? smooth(seg(t, 0.15, 0.6)) : 0);
      const hand = [me.x + 9, me.y - 14], gnd = [TX - 3, TY + 1];
      if (t > t0 && t < land) {
        const e = seg(t, t0, land), x = lerp(hand[0], gnd[0], e), y = lerp(hand[1], gnd[1] - 6, e) - Math.sin(e * Math.PI) * 8 + e * e * 6;
        const vx = gnd[0] - hand[0], vy = (gnd[1] - hand[1]) + Math.cos(e * Math.PI) * -8 * Math.PI * 0.4;
        K.shard(c, x, y, Math.atan2(vy / 2 + e * 6, vx / 3), 9, 5, 1);
      } else if (t >= land && t < gone) {
        const ang = 0.95; K.shard(c, gnd[0] - Math.cos(ang) * 8, gnd[1] - Math.sin(ang) * 8, ang, 9, 5, 1);
        if (t < land + 0.9) X.text(c, 'PINNED', g.x - 12, g.y - 24, '#f4c44a', '#120e1a');
      } else if (t >= gone && t < gone + 0.5) {
        const e = seg(t, gone, gone + 0.5);
        for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.9 + (i / 5) * Math.PI * 0.8, sp = 4 + rand(i, 8) * 8; K.shard(c, gnd[0] - 3 + Math.cos(a) * sp * e, gnd[1] - 5 + Math.sin(a) * sp * e + 12 * e * e, a + e * 5, 2.5, i + 2, 1 - e); }
      }
      spark(c, [gnd[0], gnd[1] - 4], R, t - land, 1);
      K.chilled(c, A, g, t, k);
    });
    S.label = 'SHIFT+RMB';
  };

  // Flame sword Heavy, v2: a fire wave that rolls forward and ignites what it passes
  function fireWave(c, x, y, e, t) {
    if (e <= 0 || e >= 1) return;
    const a = 1 - seg(e, 0.72, 1), grow = 0.55 + 0.45 * seg(e, 0, 0.3);
    for (let j = -9; j <= 9; j++) {
      const q = j / 9, yy = y + j * 1.25, xx = x - q * q * 9;
      const hh = (8 + 3 * Math.sin(t * 15 + j * 1.3)) * a * grow * (1 - Math.abs(q) * 0.45);
      K.tongue(c, xx, yy, 1.8 * a + 0.5, hh, -1.6);
      if (j % 2 === 0) K.tongue(c, xx - 4, yy + 0.5, 1.2 * a + 0.3, hh * 0.55, -1.2);
      if (j % 3 === 0 && a > 0.3) X.px(c, xx + 1, yy - hh * 0.4, '#ffffff');
    }
    X.glow(c, x - 2, y - 4, 12, EL.fire[2], 0.5 * a);
  }
  MOVEFX['fire-heavy2'] = (t, C, S) => {
    const { M, D, R } = C, h = M.hits[0], [c0, c1] = M.charge, ch = seg(t, c0, c1), x0 = 46, run = 82, dur = 1.05;
    const front = (tt) => x0 + seg(tt, h, h + dur) * run, at = (x) => h + ((x - x0) / run) * dur;
    const T = [['g1', 72, 46], ['g2', 98, 56]].map(([id, x, y]) => { const hh = at(x), r = hitBy(t, [[hh, 6, 3]]); return [status(gob(id, x + r.kb, y, { flash: r.flash, z: r.z, alpha: fade(t, D), seed: id === 'g2' ? 2 : 1 }), 'fire', after(t, hh, D)), hh]; });
    for (const [g] of T) S.actors.push(g);
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.shake = t > h && t < h + 0.2 ? 1.5 : 0;
    S.lights.push([front(t), 50, 28, '#ff9a30', t > h && t < h + dur ? 0.7 : 0]);
    S.under.push((c, E, me) => {
      if (t > c0 && t < h) { const rr = lerp(16, 7, ch); K.gring(c, me.x, me.y, rr, ch > 0.98 ? '#ffffff' : R[2], 0.5 + 0.5 * ch, 1); }
      const k = 1 - seg(t, D - 0.6, D - 0.1);
      if (t > h) for (let x = x0; x < front(t) - 3; x += 3) for (let j = -7; j <= 7; j += 2) if (rand(x, j, 9) < 0.45) X.px(c, x + (j & 1), 52 + j * 1.25 - ((j / 7) ** 2) * 0, rand(x, j, 8) < 0.3 ? '#3a1a10' : '#22140e');
    });
    S.fx.push((c, A) => { fireWave(c, front(t), 52, seg(t, h, h + dur), t); for (const [g, hh] of T) { spark(c, chestOf(A, g), R, t - hh, 1); K.burning(c, A, g, t, after(t, hh, D)); } });
    S.label = 'RMB HOLD';
  };

  // Stone maul Heavy, v2: a directed quake. A fissure runs down one lane, rocks burst up in sequence.
  MOVEFX['earth-heavy2'] = (t, C, S) => {
    const { M, D, R } = C, h = M.hits[0], [c0, c1] = M.charge, ch = seg(t, c0, c1), x0 = 48, run = 78, dur = 0.85, LY = 52;
    const at = (x) => h + ((x - x0) / run) * dur, front = (tt) => x0 + seg(tt, h, h + dur) * run;
    const T = [['g1', 74, LY], ['g2', 102, LY + 1]].map(([id, x, y]) => { const hh = at(x), r = hitBy(t, [[hh, 3, 9]]); return gob(id, x + r.kb, y, { flash: r.flash, z: r.z, dead: K.down(t, hh + 0.3, hh + 1.2), alpha: fade(t, D), seed: id === 'g2' ? 2 : 1 }); });
    const side = gob('g3', 96, 30, { alpha: fade(t, D), seed: 3, face: Math.PI + 0.5 });   // beside the lane: untouched
    S.actors.push(...T, side);
    S.meO.glow = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.shake = t > h && t < h + dur ? 2.2 : 0;
    const rocks = []; for (let x = x0 + 4; x < x0 + run; x += 7) rocks.push(x);
    S.under.push((c, E, me) => {
      if (t > c0 && t < h) { const rr = lerp(16, 7, ch); K.gring(c, me.x, me.y, rr, ch > 0.98 ? '#ffffff' : R[2], 0.5 + 0.5 * ch, 1); }
      // the fissure: a jagged crack down the lane, open behind the front
      const k = 1 - seg(t, D - 0.6, D - 0.1);
      if (t > h && k > 0.02) { let py = LY; for (let x = x0; x < front(t); x += 3) { const ny = LY + (rand(x, 3) - 0.5) * 3; X.line(c, x, py, x + 3, ny, '#1a120c'); if (rand(x, 4) < 0.4) X.px(c, x + 1, ny + 1, '#33241a'); py = ny; } }
    });
    S.fx.push((c, A) => {
      for (const x of rocks) {
        const e = t - at(x); if (e < 0 || e > 0.75) continue;
        const up = e < 0.1 ? e / 0.1 : 1 - seg(e, 0.35, 0.75), y = LY - up * 5;
        K.rock(c, x, y, 2.2 + up * 2, x, 0); if (up > 0.6) K.rock(c, x + 3, y + 2, 1.6 + up, x + 1, 0);
        K.dust(c, x, LY, e, x, 4, 9, '#b8a890', 0.6);
      }
      for (const g of T) K.debris(c, g.x, LY, t - at(g.x), 3, 6, 18);
    });
    S.label = 'RMB HOLD';
  };

  // Healing hands Heavy, v2: a continuous healing link. No release; it holds as the ally walks off.
  const LINK_KEYS = [[0, {}], [0.2, {}], [0.45, { hR: [6, 1.6, 10.5], p: 0.1, y: 0, hL: [6, -1.6, 10.5] }], [2.75, {}], [3.05, Object.assign({ hL: null }, IDLE)]];
  MOVEFX['life-heavy2'] = (t, C, S) => {
    const { D } = C, on0 = 0.5, on1 = 2.75, w0 = 0.95, w1 = 2.2;
    const walkK = smooth(seg(t, w0, w1)), v = lerp(0.2, 0.95, seg(t, on0 + 0.1, on1));
    const al = allyWiz('p2', lerp(48, 104, walkK), lerp(51, 44, walkK), Object.assign({ face: walkK > 0 && walkK < 1 ? -0.15 : Math.PI, sq: 0.2 * (1 - v), alpha: fade(t, D, 0.2, 0.3) }, walkK > 0 && walkK < 1 ? K.walk(t, 0.9) : {}));
    S.actors.push(al);
    const on = t > on0 && t < on1;
    S.lights.push([al.x, al.y - 6, 22, '#c8fab0', on ? 0.6 : 0]);
    S.fx.push((c, A, me) => {
      const hs = (A.me && A.me.hands) || [[me.x + 8, me.y - 10]], from = [(hs[0][0] + (hs[1] || hs[0])[0]) / 2 + 1, (hs[0][1] + (hs[1] || hs[0])[1]) / 2], to = chestOf(A, al);
      if (on) {
        const k = seg(t, on0, on0 + 0.15) * (1 - seg(t, on1 - 0.1, on1)), L = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.max(6, Math.ceil(L / 1.5));
        let prev = from;
        for (let i = 1; i <= n; i++) {
          const q = i / n, wob = Math.sin(q * Math.PI) * Math.sin(t * 9 + q * 10) * 1.6, p = [lerp(from[0], to[0], q), lerp(from[1], to[1], q) + wob];
          X.line(c, prev[0], prev[1], p[0], p[1], i % 3 === Math.floor(t * 12) % 3 ? EL.life[0] : EL.life[2]);
          prev = p;
        }
        if (k > 0.3) for (let j = 0; j < 3; j++) { const q = mod(t * 1.4 + j / 3, 1); X.rect(c, lerp(from[0], to[0], q) - 1, lerp(from[1], to[1], q) - 1, 2, 2, '#f4e08a'); }
        X.glow(c, to[0], to[1], 5, EL.life[2], 0.6 * k);
        if (walkK > 0.55) X.text(c, 'LINK HOLDS', 48, 16, '#c8fab0', '#120e1a');
      }
      K.heals(c, A, al, t, on ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.2 : v);
    });
    S.label = 'RMB HOLD';
  };

  // Echo focus (arcane, v2): Strike = weak orb bolts; Heavy = Echo; Special = Copy
  const FIREBALL = ['fire', 'fire'];
  function orbBolt(c, a, b, e, big) {
    if (e <= 0 || e >= 1) return;
    const x = lerp(a[0], b[0], e), y = lerp(a[1], b[1], e);
    for (let j = 1; j <= 4; j++) { const q = Math.max(0, e - j * 0.08); X.px(c, lerp(a[0], b[0], q), lerp(a[1], b[1], q), EL.arcane[j < 2 ? 1 : 2]); }
    X.glow(c, x, y, 3 + big, EL.arcane[2], 0.8); X.rect(c, x - 1, y - 1, 2, 2, '#ffffff');
  }
  const orbAt = (W, poseAt, t, me) => { const p = tipW(W, poseAt, t, me).tip; return [p[0], p[1] - 2]; };
  MOVEFX['arcane2-strike'] = (t, C, S) => {
    const { M, D, R, W, poseAt } = C, [h1, h2, h3] = M.hits, GX = 74, fly = 0.12;
    const r = hitBy(t, [[h1 + fly, 1], [h2 + fly, 1], [h3 + fly, 4, 2]]);
    const g = gob('g1', GX + r.kb, 50, { flash: r.flash * 0.7, z: r.z, alpha: fade(t, D) });
    S.actors.push(g);
    S.meO.runes = () => FIREBALL;
    S.fx.push((c, A, me) => {
      for (const h of M.hits) { const big = h === h3 ? 1.5 : 0; orbBolt(c, orbAt(W, poseAt, h, me), chestOf(A, g), seg(t, h, h + fly), big); spark(c, chestOf(A, g), R, t - h - fly, h === h3 ? 0.9 : 0.5); }
    });
  };
  const ECHO_KEYS = [[0, {}], [0.15, {}], [0.45, { hR: [1, 4, 13], p: 0.6, y: 0 }], [1.3, { hR: [0.5, 4, 13.5] }], [1.44, { hR: [9.5, 2, 11], p: 0.05, y: 0 }, 'out'], [1.95, {}], [2.55, IDLE]];
  MOVEFX['arcane2-heavy'] = (t, C, S) => {
    const { M, D, R, W, poseAt } = C, h = M.hits[0], [c0, c1] = M.charge, land = h + 0.38, TX = 104, TY = 48;
    const r = hitBy(t, [[land, 9, 3]]), k = after(t, land, D);
    const g = status(gob('g1', TX + r.kb, TY, { flash: r.flash, z: r.z, dead: K.down(t, land + 0.15, land + 1.0), alpha: fade(t, D) }), 'fire', k);
    S.actors.push(g);
    const ch = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0);
    S.meO.runes = () => FIREBALL; S.meO.glow = ch;
    S.meO.spin = (tt) => 2.2 + ch(tt) * 9; S.meO.tight = (tt) => 1 - ch(tt) * 0.35;
    S.lights.push([TX, TY, 26, '#ff9a30', t > land && t < land + 0.5 ? 0.8 : 0]);
    S.under.push((c, E, me) => { if (t > c0 && t < h) K.gring(c, me.x, me.y, lerp(16, 7, ch(t)), R[2], 0.8, 1); });
    S.fx.push((c, A, me) => {
      const o = orbAt(W, poseAt, h, me), to = chestOf(A, g);
      if (t > h && t < land) { const e = seg(t, h, land); K.fireball(c, lerp(o[0] + 3, to[0], e), lerp(o[1], to[1], e) - Math.sin(e * Math.PI) * 3, 2.2, t, 1, 0, 3); }
      if (t > land && t < land + 0.5) { const e = seg(t, land, land + 0.5); X.ring(c, to[0], to[1], 2 + e * 12, (2 + e * 12) * 0.8, EL.fire[1], 1 - e); X.glow(c, to[0], to[1], 9, EL.fire[2], 1 - e); }
      K.burning(c, A, g, t, k);
      if (t > h && t < h + 0.8) X.text(c, 'ECHO 1/2', o[0] - 14, o[1] - 14, '#f4c44a', '#120e1a');
    });
    S.label = 'RMB HOLD';
  };
  const COPY_KEYS = [[0, {}], [0.15, {}], [0.85, {}], [1.02, { hR: [3, 3, 15.5], p: 1.25, y: 0 }, 'out'], [1.9, {}], [2.45, IDLE]];
  MOVEFX['arcane2-copy'] = (t, C, S) => {
    const { M, D, R, W, poseAt } = C, cast0 = 0.3, z0 = 0.55, z1 = 0.85, press = 0.95, m0 = 1.05, m1 = 1.45;
    const al = Object.assign(allyWiz('p2', 30, 26, { face: 0, el: 'lightning', alpha: fade(t, D) }), K.pose(t, cast0, z0, z1));
    const g = gob('g1', 106, 30, { flash: K.flash(t, z0), shock: t > z0 && t < z0 + 0.6 && Math.floor(t * 18) % 2 ? 1 : 0, alpha: fade(t, D) });
    S.actors.push(al, g);
    S.meO.x = 34; S.meO.y = 58;
    S.meO.runes = (tt) => (tt < m0 ? FIREBALL : tt < m1 ? [] : ['lightning', 'lightning']);
    S.meO.glow = (tt) => env(tt, press, m1 + 0.2, 0.08, 0.3);
    S.fx.push((c, A, me) => {
      const tipA = (A.p2 && A.p2.tip) || [al.x + 6, al.y - 20];
      if (t > z0 && t < z1) K.zap(c, tipA, chestOf(A, g), Math.floor(t * 24), EL.lightning, 2, 1);
      const o = orbAt(W, poseAt, Math.min(t, 1.9), me);
      if (t > press && t < press + 0.35) { const e = seg(t, press, press + 0.35); X.ring(c, o[0], o[1], 3 + e * 26, (3 + e * 26) * 0.7, EL.arcane[1], 1 - e); }
      if (t > m0 && t < m0 + 0.3) for (let i = 0; i < 2; i++) { const e = seg(t, m0, m0 + 0.3); X.px(c, o[0] - 4 - e * 6 + i * 8, o[1] - e * 6, EL.fire[1 + i]); }
      for (let i = 0; i < 2; i++) K.mote(c, chestOf(A, al), o, seg(t, m0 + i * 0.08, m1 + i * 0.08 - 0.08), EL.lightning, 8);
      if (t > m1 && t < m1 + 0.9) X.text(c, 'COPIED', o[0] - 12, o[1] - 16, '#f4c44a', '#120e1a');
    });
    S.label = 'SHIFT+RMB';
  };

  // ---------------------------------------------------------------------------
  // Register round 2: per weapon, Strike / Heavy / Special (slugs in weapons.js R2)
  const V2 = {
    'cold-heavy':   { keys: COLD_DASH, fx: 'cold-heavy2', M: { dur: 3.3, sm: [[1.3, 1.8]] }, still: 1.62 },
    'fire-heavy':   { fx: 'fire-heavy2', M: { dur: 3.0 }, still: 1.85 },
    'earth-heavy':  { fx: 'earth-heavy2', M: { dur: 3.0 }, still: 1.75 },
    'life-heavy':   { keys: LINK_KEYS, fx: 'life-heavy2', M: { dur: 3.4, sm: [] }, still: 1.9 },
    'arcane-strike': { keys: WM.POKES, fx: 'arcane2-strike', M: { sm: [] } },
    'arcane-heavy': { keys: ECHO_KEYS, fx: 'arcane2-heavy', M: { sm: [] }, still: 1.62 },
  };
  const SPECIAL = {
    cold: ['strike', { keys: COLD_THROW, fx: 'cold-javelin', M: { dur: 3.0, hits: [1.0], sm: [[0.62, 0.76]] }, still: 1.4 }],
    arcane: ['strike', { keys: COPY_KEYS, fx: 'arcane2-copy', M: { dur: 3.0, hits: [1.0], sm: [] }, still: 1.6 }],
  };
  for (const W of WM.WEAPONS) {
    const ids = WM.R2[W.id];
    for (const mv of ['strike', 'heavy']) moveVignette(W, mv, Object.assign({ id: ids[mv] }, V2[W.id + '-' + mv] || {}));
    if (SPECIAL[W.id]) { const [base, v] = SPECIAL[W.id]; moveVignette(W, base, Object.assign({ id: ids.special }, v)); VS[VS.length - 1].slot = 'special'; }
    else moveVignette(W, 'sweep', { id: ids.special });
  }

  // Weapon cards: conjure it, hold it, one show-off swing
  for (const W of WM.WEAPONS) for (const cardId of new Set([WM.R2[W.id].card, WM.CUR[W.id].card])) {
    const D = 3.6, c1 = 0.62;
    const show = WM.track([[0, {}], [1.5, {}], [1.75, { hR: [0.5, 5, 13], p: 1.3, y: 1.5 }], [1.88, { hR: [7.5, 1, 9], p: -0.05, y: -1.15 }, 'lin'], [2.2, {}], [2.8, WM.IDLE]]);
    add({ id: cardId, kind: 'weapon', weapon: W.id, w: 88, h: 80, dur: D, ground: 'plaza', seed: 11 + W.len, still: 2.4,
      frame(t) {
        const grow = W.id === 'staff' ? 1 : seg(t, c1, c1 + 0.2);
        const me = wizard(W, show, t, { x: 40, y: 56, face: 0.35, sm: W.id === 'arcane' ? [] : [[1.75, 1.92]], hidden: () => grow < 0.05, size: 0.3 + 0.7 * grow, s: W.id === 'staff' || t > c1 ? {} : { prep: smooth(seg(t, 0.05, 0.2)), prepKind: 'conjure' } });
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
  function guardVig(id, dur, frame, still) { add({ id: `g-${id}-defend`, kind: 'guard', part: 'defend', guard: id, w: GW, h: GH, dur, ground: 'path', seed: 30 + id.length, still: still || 1.25, frame }); }

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
    const g = gob('g1', lerp(130, me.x + 18, walkK) + r.kb, 55, Object.assign({ flash: r.flash, z: r.z, dead: K.down(t, hit + 0.08, hit + 1.2), alpha: fade(t, D) }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : {}));
    const a = archer('a1', 128, 40, { draw: t < 1.4 ? smooth(seg(t, 0.8, 1.35)) : 0, alpha: fade(t, D) });
    const gp = guardPt(me, 1);
    return { actors: [me, g, a],
      fx(c, A) {
        spark(c, [gp[0] + 4, gp[1]], EL.earth, t - hit, 1.1);
        if (t > 1.4 && t < thunk) { const e = seg(t, 1.4, thunk); arrow(c, lerp(122, gp[0] + 5, e), lerp(31, gp[1] - 3, e), Math.PI + 0.1); }
        if (t >= thunk && t < 2.7) arrow(c, gp[0] + 6, gp[1] - 3, Math.PI + 0.1);
        spark(c, [gp[0] + 5, gp[1] - 3], EL.earth, t - thunk, 0.7);
        if (t > 0.5 && t < 2.4) X.text(c, 'SLOW', me.x - 8, me.y + 4, '#a8a3bb');
        if (t > hit && t < hit + 0.6) X.text(c, 'BASH', g.x - 6, g.y - 22, '#f4c44a', '#120e1a');
        keycap(c, GH, t > hit - 0.12 && t < hit + 0.25 ? 'SPACE TAP' : 'SPACE HOLD', k > 0.5);
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
  // Guard Retreats (Shift+LMB): each guard moves you back differently. You start at RX facing
  // the goblin coming in from the right; the guard is carried (k low) unless the move raises it.
  const RX = 92, RY = 54, T0 = 0.85;
  function retreatVig(id, dur, frame, still) { add({ id: `g-${id}-retreat`, kind: 'guard', guard: id, part: 'retreat', w: GW, h: GH, dur, ground: 'path', seed: 40 + id.length, still: still || 1.1, frame }); }
  const rWiz = (id, t, D, x, y, o = {}) => wizard(STAFF, holdTrack, t, { x, y, face: 0, guard: { id, k: o.k == null ? 0.6 : o.k, hit: o.hit || 0 }, s: Object.assign({ alpha: fade(t, D, 0.2, 0.3) }, o.s || {}) });
  // a goblin that walks in from the right and swings at where you were
  function chaser(t, D, x0, x1, t1, o = {}) {
    const k = seg(t, 0.15, t1), swing = o.swing != null ? o.swing : t1 + 0.05;
    return gob(o.id || 'g1', lerp(x0, x1, k) + (o.dx || 0), o.y || RY + 1, Object.assign({ alpha: fade(t, D), sq: t > swing && t < swing + 0.15 ? -0.25 : 0 }, k > 0 && k < 1 ? K.walk(t, 1.4) : {}, o.s || {}));
  }
  function whiff(c, x, y, t, t0) { if (t < t0 || t > t0 + 0.25) return; const e = seg(t, t0, t0 + 0.25); X.ring(c, x, y - 8, 5 + e * 3, 6 + e * 3, '#ffffff', 1 - e, Math.PI * 0.6, Math.PI * 1.4); }
  const rKey = (c, t) => keycap(c, GH, 'SHIFT+LMB', t > T0 - 0.08 && t < T0 + 0.45);
  const tag = (c, s, x, y) => X.text(c, s, x, y, '#f4c44a', '#120e1a');

  // Mirror buckler: Backstep, a crisp hop back
  retreatVig('mirror', 2.6, (t) => {
    const D = 2.6, e = seg(t, T0, T0 + 0.22), x = lerp(RX, RX - 24, easeOut(e)), z = K.hop(t, T0, 5, 0.22);
    const me = rWiz('mirror', t, D, x, RY, { s: { z } });
    const g = chaser(t, D, 140, RX + 16, T0 + 0.05);
    return { actors: [me, g],
      fx(c) { K.dust(c, RX, RY, t - T0, 2, 5, 8, '#b8a890', 0.5); K.dust(c, RX - 24, RY, t - T0 - 0.22, 3, 5, 8, '#b8a890', 0.5); whiff(c, RX + 6, RY, t, T0 + 0.1); if (t > T0 + 0.2 && t < T0 + 0.9) tag(c, 'BACKSTEP', RX - 40, RY - 30); rKey(c, t); } };
  }, 1.1);

  // Bulwark: Brace, you don't move; nothing moves you
  retreatVig('bulwark', 3.0, (t) => {
    const D = 3.0, k = smooth(seg(t, T0, T0 + 0.12)) * (1 - smooth(seg(t, 2.4, 2.6))), hitT = 1.3, punch = seg(t, 0.95, 1.6);
    const me = rWiz('bulwark', t, D, RX - 6, RY, { k: 0.6 + 0.4 * k, hit: K.flash(t, hitT), s: { sq: k * 0.08 } });
    const walkK = seg(t, 0.1, 0.95);
    const b = K.brute({ id: 'b1', x: lerp(150, RX + 20, walkK) + K.kb(t, hitT, 5, 0.25), y: RY + 2, face: Math.PI, seed: 1, punch: t > 0.95 && t < 1.6 ? punch : -1, alpha: fade(t, D) });
    if (walkK > 0 && walkK < 1) Object.assign(b, K.walk(t, 0.9));
    return { actors: [me, b],
      under(c) { K.cracks(c, me.x + 6, RY + 1, 10, 4, seg(t, T0, T0 + 0.15) * (1 - seg(t, 2.4, 2.7))); if (k > 0.05) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.rock(c, me.x + Math.cos(a) * 9, me.y + 1 + Math.sin(a) * 9 * FY, 1.5 * k, i); } },
      fx(c, A) { const gp = guardPt(me, 1); spark(c, [gp[0] + 4, gp[1]], EL.earth, t - hitT, 1.2); K.dust(c, me.x + 6, RY, t - T0, 4, 6, 10, '#b8a890', 0.6); if (t > T0 + 0.1 && t < 2.3) tag(c, t > hitT ? 'NOTHING MOVES YOU' : 'BRACE', me.x - (t > hitT ? 34 : 10), RY - 34); rKey(c, t); } };
  }, 1.4);

  // Ember targe: Flame step, a dash back that leaves a line of fire
  retreatVig('ember', 2.8, (t) => {
    const D = 2.8, e = seg(t, T0, T0 + 0.2), x = lerp(RX, RX - 36, easeOut(e)), fireT = (px) => T0 + (1 - Math.sqrt(1 - clamp((RX - px) / 36, 0, 1))) * 0.2;
    const me = rWiz('ember', t, D, x, RY);
    const stop = 1.25, burn = after(t, stop + 0.05, D);
    const g = status(chaser(t, D, 140, RX + 2, stop, { swing: 99, s: t > stop ? { sq: 0.15 } : {}, dx: -K.kb(t, stop + 0.05, -6, 0.3) }), 'fire', burn);
    const pts = []; for (let px = RX - 34; px <= RX + 2; px += 4) pts.push([px, RY + 1]);
    return { actors: [me, g], lights: [[RX - 16, RY, 30, '#ff9a30', t > T0 && t < T0 + 1.3 ? 0.6 : 0]],
      under(c) { scorchRow(c, pts.filter(([px]) => t > fireT(px)), 0.6 * (1 - seg(t, D - 0.5, D - 0.1))); },
      fx(c, A) {
        const live = pts.filter(([px]) => t > fireT(px) && t < fireT(px) + 1.0);
        fireRow(c, live, t, 1 - seg(t, T0 + 0.9, T0 + 1.15), 7);
        if (t > T0 && t < T0 + 0.2) for (let i = 0; i < 3; i++) X.line(c, me.x + 8 + i * 5, me.y - 5 - i * 3, me.x + 15 + i * 6, me.y - 5 - i * 3, EL.fire[1 + i]);
        K.burning(c, A, g, t, burn); rKey(c, t);
      } };
  }, 1.3);

  // Rime kite: Ice slide, a long slide back on a strip of ice that stays
  function iceStrip(c, x0, x1, y, k) {
    if (k <= 0.02 || x1 - x0 < 2) return;
    const box = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
    X.poly(c, box(x0, y - 3, x1, y + 3), '#7ab8d4', k); X.poly(c, box(x0 + 1, y - 2, x1 - 1, y + 2), '#b4e4f4', k);
    for (let x = x0 + 3; x < x1 - 3; x += 7) X.line(c, x, y - 1 + (x % 3 === 0 ? 1 : 0), x + 3, y - 1 + (x % 3 === 0 ? 1 : 0), '#ffffff');
  }
  retreatVig('rime', 3.0, (t) => {
    const D = 3.0, e = seg(t, T0, T0 + 0.6), x = lerp(RX, RX - 56, easeOut(e)), ice = 1 - seg(t, 2.3, 2.7);
    const me = rWiz('rime', t, D, x, RY, { s: { sq: e > 0 && e < 1 ? -0.1 : 0 } });
    const reach = 1.25, slipK = seg(t, reach, 2.3), slip = t > reach && t < 2.3;
    const gx = t < reach ? lerp(140, RX + 4, seg(t, 0.15, reach)) : lerp(RX + 4, RX - 20, easeOut(slipK));
    const g = gob('g1', gx, RY + 1, Object.assign({ face: Math.PI + (slip ? Math.sin(t * 18) * 0.9 : 0), z: slip ? Math.abs(Math.sin(t * 10)) * 1.5 : 0, chill: slip ? 0.4 : 0, alpha: fade(t, D) }, K.walk(t, t < reach ? 1.4 : slip ? 0.4 : 0)));
    return { actors: [me, g],
      under(c) { iceStrip(c, me.x - 2, RX + 6, RY + 1, (t > T0 ? 1 : 0) * ice); },
      fx(c, A) { if (e > 0 && e < 1) for (let i = 0; i < 4; i++) X.px(c, me.x + 6 + i * 3, RY - 1 - (i % 2), '#ffffff'); if (slip) tag(c, 'SLIP', g.x - 6, g.y - 22); K.chilled(c, A, g, t, slip ? 0.5 : 0); rKey(c, t); } };
  }, 1.5);

  // Spark ring: Blink, a teleport back; a spark stays on your old spot
  retreatVig('spark', 2.8, (t) => {
    const D = 2.8, gone = t > T0 && t < T0 + 0.07, x = t < T0 + 0.07 ? RX : RX - 34;
    const me = rWiz('spark', t, D, x, RY, { s: gone ? { alpha: 0 } : {} });
    const step = 1.3, shocked = t > step && t < step + 0.8;
    const g = chaser(t, D, 140, RX + 3, step, { swing: 99, s: { shock: shocked && Math.floor(t * 18) % 2 ? 1 : 0, flash: K.flash(t, step), sq: shocked ? 0.15 : 0 } });
    const sparkOn = t > T0 && t < step + 0.1;
    return { actors: [me, g], lights: [[RX, RY, 18, '#c4a4ff', sparkOn ? 0.5 : 0]],
      under(c) { if (t > T0) X.ellipse(c, RX, RY + 1, 4, 2, '#1a1426', 0.8 * (1 - seg(t, 2.2, 2.6))); },
      fx(c, A) {
        K.blink(c, RX, RY, t - T0, EL.lightning); K.blink(c, RX - 34, RY, t - T0 - 0.05, EL.lightning);
        if (sparkOn) for (let i = 0; i < 6; i++) { const a = rand(i, Math.floor(t * 16)) * TAU, r = 1 + rand(i, Math.floor(t * 16), 2) * 4; X.px(c, RX + Math.cos(a) * r, RY - 1 + Math.sin(a) * r * 0.6, i % 2 ? '#ffffff' : EL.lightning[1]); }
        if (t > step && t < step + 0.25) K.zap(c, [RX, RY], chestOf(A, g), Math.floor(t * 30), EL.lightning, 2, 1);
        if (shocked) tag(c, 'SHOCK', g.x - 8, g.y - 24);
        rKey(c, t);
      } };
  }, 1.0);

  // Tide shield: Surge, you ride back on a wave that shoves whatever is in front away
  retreatVig('tide', 2.8, (t) => {
    const D = 2.8, e = seg(t, T0, T0 + 0.45), x = lerp(RX, RX - 30, easeOut(e)), wv = seg(t, T0, T0 + 0.8);
    const me = rWiz('tide', t, D, x, RY, { s: { wet: 1 } });
    const hit = T0 + 0.12, r = hitBy(t, [[hit, 26, 3]]);
    const g = status(chaser(t, D, 140, RX + 14, T0, { swing: 99, dx: r.kb, s: { flash: r.flash * 0.5, z: r.z } }), 'water', after(t, hit, D));
    return { actors: [me, g],
      under(c) { K.puddle(c, (x + RX) / 2, RY + 2, Math.max(2, (RX - x) / 2 + 4), (t > T0 ? 1 : 0) * (1 - seg(t, 2.2, 2.6)), t, 5, false); },
      fx(c, A) { wave(c, RX + 8 + wv * 36, RY + 1, wv, 7); K.dripping(c, A, me, t); K.dripping(c, A, g, t); if (t > hit + 0.05 && t < hit + 0.8) tag(c, 'SHOVE', g.x - 8, g.y - 24); rKey(c, t); } };
  }, 1.05);

  // Prism pane: Phase, you drift back half there, through a body
  retreatVig('prism', 3.0, (t) => {
    const D = 3.0, e = seg(t, T0, T0 + 0.6), x = lerp(RX, RX - 54, smooth(e)), ph = e > 0 && e < 1;
    const me = rWiz('prism', t, D, x, RY, { s: ph ? { alpha: 0.45, tint: '#b04cff', tintK: 0.45 } : {} });
    const g = chaser(t, D, 140, RX + 16, T0 + 0.05);
    const behind = gob('g2', RX - 28, RY + 1, { face: 0, alpha: fade(t, D), seed: 2, sq: t > T0 + 0.25 && t < T0 + 0.4 ? -0.25 : 0 });
    return { actors: [me, g, behind],
      fx(c, A) {
        for (let i = 0; i < 4; i++) { const tt = T0 + i * 0.15; if (t < tt || t > tt + 0.6) continue; const k = 1 - seg(t, tt, tt + 0.6), px = lerp(RX, RX - 54, smooth(seg(tt, T0, T0 + 0.6))), pts = []; for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU + Math.PI / 6; pts.push([px + Math.cos(a) * 5, RY - 10 + Math.sin(a) * 7]); } if (k > 0.3) X.lines(c, pts.concat([pts[0]]), k > 0.65 ? EL.arcane[1] : EL.arcane[3]); }
        whiff(c, RX + 6, RY, t, T0 + 0.1);
        if (t > T0 + 0.2 && t < T0 + 1.0) tag(c, 'PHASE', behind.x - 10, behind.y - 26);
        rKey(c, t);
      } };
  }, 1.15);

  // Leaf aegis: Regroup, the step back curves to the nearest ally; you both get a small heal
  retreatVig('leaf', 3.0, (t) => {
    const D = 3.0, e = smooth(seg(t, T0, T0 + 0.5)), P0 = [RX, RY], P1 = [64, RY + 2], P2 = [52, 40];
    const bz = (k) => [lerp(lerp(P0[0], P1[0], k), lerp(P1[0], P2[0], k), k), lerp(lerp(P0[1], P1[1], k), lerp(P1[1], P2[1], k), k)];
    const p = bz(e), arrive = T0 + 0.5;
    const me = rWiz('leaf', t, D, p[0], p[1]);
    const al = allyWiz('p2', 38, 36, { face: 0, alpha: fade(t, D) });
    const g = chaser(t, D, 140, RX + 16, T0 + 0.05);
    const v = lerp(0.45, 0.75, seg(t, arrive, arrive + 0.6));
    return { actors: [me, al, g], lights: [[46, 40, 26, '#c8fab0', t > arrive && t < arrive + 1 ? 0.5 : 0]],
      fx(c, A) {
        for (let i = 0; i < 10; i++) { const k = i / 10, tt = T0 + k * 0.5; if (t < tt || t > tt + 0.8) continue; const q = bz(smooth(k)); X.px(c, q[0] + 1, q[1] - 1, EL.life[1]); X.px(c, q[0] + 2, q[1] - 2, EL.life[2]); }
        whiff(c, RX + 6, RY, t, T0 + 0.1);
        sparkleHeal(c, chestOf(A, me), t - arrive); sparkleHeal(c, chestOf(A, al), t - arrive - 0.05);
        K.heals(c, A, me, t, t > arrive && t < arrive + 0.9 ? 1 : 0); K.heals(c, A, al, t, t > arrive && t < arrive + 0.9 ? 1 : 0);
        hpBar(c, A, me, t > D - 0.25 ? 0.45 : v); hpBar(c, A, al, t > D - 0.25 ? 0.4 : v - 0.05);
        if (t > arrive && t < arrive + 0.9) tag(c, 'REGROUP', 34, 14);
        rKey(c, t);
      } };
  }, 1.5);
  // helpers for round3.js
  PB.WMH = { add, gob, archer, allyWiz, fade, spark, arrow, chestOf, keycap, status, statusFx, hitBy, after, wizard, tipW, moveVignette, MOVEFX, hpBar, sparkleHeal,
    guardWiz, guardPt, block, rWiz, chaser, whiff, rKey, tag, orbBolt, splash, W_, G_, MW, MH, GW, GH, GME, RX, RY, T0, STAFF, holdTrack, COLD_THROW };
})();
