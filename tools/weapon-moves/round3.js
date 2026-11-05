/* Weapon Moveset Review, round 3: the redesigns built in the game from the round-2 ratings
 * (docs/explorations/2026-11-05-guards-round-2.md). New slugs, so round-2 ratings stay on the old ones:
 *   w-arcane-v3 (card, made in moves.js) and w-arcane-v3-strike / -heavy / -special   the Arcane wand
 *   w-life-mend        Healing hands' Special: hold to heal allies around you
 *   w-cold-send-v3     the javelin, now leaving the spearhead along the thrust
 *   g-mirror-retreat-v2, g-bulwark-retreat-v2, g-leaf-retreat-v2   Backstep 3 u, Shove step, Seed step
 *   g-rime-defend-v2, g-prism-defend-v2, g-leaf-defend-v2           chill biters; Clear + block/return; heal around
 * Distances: about 12 art px to a game unit, as in round 2. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, WM = PB.WM, H = PB.WMH, X = PB.px, EL = X.EL;
  const { FY, TAU, seg, smooth, easeOut, lerp, rand, mod, env } = PB;
  const { add, gob, archer, allyWiz, fade, spark, arrow, chestOf, keycap, status, hitBy, after, wizard, tipW, moveVignette, MOVEFX, hpBar, sparkleHeal,
    rWiz, chaser, whiff, rKey, tag, orbBolt, W_, GW, GH, RX, RY, T0, STAFF, holdTrack } = H;
  const U = 12; // art px per game unit
  const IDLE = WM.IDLE;

  // ---------------------------------------------------------------------------
  // Arcane wand
  const wandTip = (W, poseAt, t, me) => tipW(W, poseAt, t, me).tip;
  MOVEFX['arcane3-strike'] = (t, C, S) => {
    const { M, D, R, W, poseAt } = C, [h1, h2, h3] = M.hits, GX = 96, fly = 0.14;
    const r = hitBy(t, [[h1 + fly, 1], [h2 + fly, 1], [h3 + fly, 3, 1]]);
    const g = gob('g1', GX + r.kb, 50, { flash: r.flash * 0.7, z: r.z, alpha: fade(t, D) });
    S.actors.push(g);
    S.fx.push((c, A, me) => {
      for (const h of M.hits) { orbBolt(c, wandTip(W, poseAt, h, me), chestOf(A, g), seg(t, h, h + fly), 0); spark(c, chestOf(A, g), R, t - h - fly, 0.5); }
      if (t > h1 && t < h3 + 0.6) tag(c, 'RANGED', 50, 18);
    });
  };
  const WAND_CHARGE = [[0, {}], [0.15, {}], [0.45, { hR: [1, 4, 12], p: 0.15, y: 0 }], [1.3, { hR: [0.5, 4, 12.5] }], [1.44, { hR: [9.5, 2, 11], p: 0.05, y: 0 }, 'out'], [1.95, {}], [2.55, IDLE]];
  MOVEFX['arcane3-heavy'] = (t, C, S) => {
    const { M, D, R, W, poseAt } = C, h = M.hits[0], [c0, c1] = M.charge, ch = (tt) => (tt > c0 && tt < h ? seg(tt, c0, c1) : 0), fly = 0.4, x1 = 132;
    let from = null;
    const at = (x) => h + ((x - 40) / (x1 - 40)) * fly;
    const T = [['g1', 70, 50], ['g2', 98, 51]].map(([id, x, y]) => { const hh = at(x), r = hitBy(t, [[hh, 8, 2]]); return [gob(id, x + r.kb, y, { flash: r.flash, z: r.z, alpha: fade(t, D), seed: id === 'g2' ? 2 : 1 }), hh]; });
    for (const [g] of T) S.actors.push(g);
    S.meO.glow = ch;
    S.under.push((c, E, me) => { if (t > c0 && t < h) K.gring(c, me.x, me.y, lerp(16, 7, ch(t)), ch(t) > 0.98 ? '#ffffff' : R[2], 0.8, 1); });
    S.fx.push((c, A, me) => {
      from = from || wandTip(W, poseAt, h, me);
      if (t > h && t < h + fly) {
        const e = seg(t, h, h + fly), x = lerp(from[0], x1, e), y = from[1] + (44 - from[1]) * e;
        for (let j = 1; j <= 8; j++) X.px(c, x - j * 3, y - (44 - from[1]) * (-j * 3) / (x1 - from[0]), j < 3 ? '#ffffff' : EL.arcane[j < 5 ? 1 : 2]);
        X.glow(c, x, y, 6, EL.arcane[2], 0.9); X.rect(c, x - 2, y - 2, 4, 4, EL.arcane[1]); X.rect(c, x - 1, y - 1, 2, 2, '#ffffff');
      }
      for (const [g, hh] of T) spark(c, chestOf(A, g), R, t - hh, 1.1);
      if (t > at(98) && t < at(98) + 0.8) tag(c, 'PIERCES', 76, 18);
    });
    S.label = 'RMB HOLD';
  };
  const SIPHON_KEYS = [[0, {}], [0.15, {}], [0.4, { hR: [5, 2, 13], p: 0.9, y: 0 }], [2.8, {}], [3.1, IDLE]];
  const POOLS = ['fire', 'cold', 'lightning', 'earth'];
  MOVEFX['arcane3-siphon'] = (t, C, S) => {
    const { D, W, poseAt } = C, h0 = 0.45, h1 = 2.8, on = t > h0 && t < h1;
    const g = gob('g1', 116, 40, Object.assign({ alpha: fade(t, D), face: Math.PI + 0.3 }, K.walk(t, 0.6)));
    S.actors.push(g);
    S.meO.x = 40; S.meO.y = 54;
    S.meO.glow = (tt) => (tt > h0 && tt < h1 ? 0.6 + 0.3 * Math.sin(tt * 10) : 0);
    S.meO.siphon = (tt) => tt > h0 && tt < h1;
    S.lights.push([40, 44, 30, '#ff4f9b', on ? 0.6 : 0]);
    S.under.push((c, E, me) => { if (on) { K.gring(c, me.x, me.y + 1, 9, EL.arcane[2], 0.7, 1); for (let i = 0; i < 4; i++) X.px(c, me.x - 9 + i * 6, me.y + 4, '#f4c44a'); } });
    S.fx.push((c, A, me) => {
      const tip = wandTip(W, poseAt, Math.min(t, 2.0), me);
      if (on) for (let j = 0; j < 6; j++) { const ph = mod(t * 1.3 + j / 6, 1), a = rand(j, Math.floor(t * 1.3 + j / 6), 5) * TAU; K.mote(c, [tip[0] + Math.cos(a) * 34, tip[1] + 14 + Math.sin(a) * 18], tip, ph, EL.arcane, 6); }
      // a mini rune HUD: four pools refilling four times as fast while you hold
      const fill = (i) => Math.min(4, (0.6 + i * 0.5) + (on ? (t - h0) * 1.45 : t >= h1 ? (h1 - h0) * 1.45 : 0) * (t > D - 0.3 ? 0 : 1));
      X.rect(c, 3, 3, 38, 27, '#120e1a'); X.rect(c, 4, 4, 36, 25, '#1f1b2e');
      POOLS.forEach((el, i) => {
        const n = fill(i), R = EL[el];
        for (let k = 0; k < 4; k++) { const full = n >= k + 1, part = !full && n > k; X.rect(c, 7 + k * 8, 7 + i * 5.5, 6, 3, full ? R[2] : part ? R[4] : '#2a2539'); if (full) X.px(c, 7 + k * 8, 7 + i * 5.5, R[1]); }
      });
      if (on) { tag(c, 'SIPHON ×4', 46, 6); tag(c, 'ROOTED', me.x - 12, me.y + 8); X.text(c, '1 USE/S', 46, 15, '#a8a3bb'); }
    });
    S.label = 'SHIFT+RMB HOLD';
  };

  // ---------------------------------------------------------------------------
  // Healing hands Special: Mend. Hold Shift+RMB: allies within 3.5 units heal; you walk at half speed.
  const MEND_KEYS = [[0, {}], [0.15, {}], [0.4, { hR: [5, 1.8, 8.5], p: 0.2, y: 0.4, hL: [5, -1.8, 8.5] }], [2.8, {}], [3.1, Object.assign({ hL: null }, IDLE)]];
  MOVEFX['life-mend'] = (t, C, S) => {
    const { D } = C, h0 = 0.45, h1 = 2.8, on = t > h0 && t < h1, R3 = 3.5 * U;
    const mx = lerp(40, 54, seg(t, h0, h1));
    const v = lerp(0.3, 0.8, seg(t, h0, h1)), v2 = lerp(0.35, 0.85, seg(t, h0, h1));
    const a1 = allyWiz('p2', 30, 40, { face: 0, sq: 0.2 * (1 - v) });
    const a2 = allyWiz('p3', 74, 62, { team: 'p3', face: Math.PI, sq: 0.2 * (1 - v2) });
    const far = allyWiz('p4', 114, 44, { team: 'p3', face: Math.PI, sq: 0.15, seed: 9 });
    S.actors.push(a1, a2, far);
    S.meO.x = mx; S.meO.y = 52; S.meO.s = on ? K.walk(t, 0.45) : {};
    S.meO.glow = (tt) => (tt > h0 && tt < h1 ? 1 : 0);
    S.lights.push([mx, 52, 46, '#c8fab0', on ? 0.5 : 0]);
    S.under.push((c, E, me) => {
      if (!on) return;
      const k = seg(t, h0, h0 + 0.2) * (1 - seg(t, h1 - 0.15, h1));
      K.gring(c, me.x, me.y, R3, EL.life[2], 0.7 * k, 1);
      for (let i = 0; i < 2; i++) { const q = mod(t * 0.8 + i / 2, 1); K.gring(c, me.x, me.y, 6 + q * (R3 - 6), EL.life[1], (1 - q) * 0.6 * k, 1); }
    });
    S.fx.push((c, A) => {
      for (const al of [a1, a2]) { K.heals(c, A, al, t, on ? 1 : 0); }
      hpBar(c, A, a1, t > D - 0.25 ? 0.3 : v); hpBar(c, A, a2, t > D - 0.25 ? 0.35 : v2); hpBar(c, A, far, 0.4);
      if (on) { tag(c, 'MEND', 52, 4); X.text(c, 'HALF SPEED', 52, 13, '#a8a3bb'); }
      if (on && t > 1.2) X.text(c, 'OUT OF', far.x - 10, far.y + 5, '#a8a3bb', '#120e1a'); X.text(c, 'REACH', far.x - 9, far.y + 12, '#a8a3bb', '#120e1a');
    });
    S.label = 'SHIFT+RMB HOLD';
  };

  // ---------------------------------------------------------------------------
  // Frost spear Special, v3: ice forms along the shaft as you draw back; the thrust sends it off the spearhead
  const THROW3 = [[0, {}], [0.15, {}], [0.5, { hR: [-3, 4.5, 10], p: 0.04, y: 0.02 }], [0.6, { hR: [-3.5, 4.5, 10] }], [0.7, { hR: [11, 2, 9.5], p: 0, y: 0, st: 4 }, 'out'], [1.1, {}], [1.7, Object.assign({ st: 0 }, IDLE)]];
  MOVEFX['cold-javelin3'] = (t, C, S) => {
    const { D, R, W, poseAt } = C, form0 = 0.22, form1 = 0.6, rel = 0.7, TX = 106, TY = 50, land = 0.92, gone = 2.3;
    const r = hitBy(t, [[land, 3, 1]]), k = after(t, land, D, 0.5);
    const g = status(gob('g1', TX + 2 + r.kb, TY, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D) }, K.walk(t, t > land && t < gone ? 0.9 : 0))), 'cold', k);
    S.actors.push(g);
    S.meO.glow = (tt) => (tt > form0 && tt < rel ? seg(tt, form0, form1) : 0);
    S.under.push((c) => K.ice(c, TX + 2, TY + 2, 13 * k, k, 200, 4));
    S.fx.push((c, A, me) => {
      const now = tipW(W, poseAt, Math.min(t, rel), me), tip = now.tip, grip = now.grip;
      // forming: frost creeps up the shaft from your hand to the head, then a ghost javelin sits on it
      if (t > form0 && t < rel) {
        const f = smooth(seg(t, form0, form1)), n = 12;
        for (let i = 0; i <= n * f; i++) { const q = i / n, x = lerp(grip[0], tip[0], q), y = lerp(grip[1], tip[1], q) - 1.5; X.px(c, x, y, i % 3 ? EL.cold[1] : '#ffffff'); }
        if (f > 0.6) { const a = (f - 0.6) / 0.4, ang = Math.atan2(tip[1] - grip[1], tip[0] - grip[0]); K.shard(c, lerp(grip[0], tip[0], 0.75), lerp(grip[1], tip[1], 0.75) - 1.5, ang, 9, 5, a); }
      }
      // released at the end of the thrust: off the spearhead, straight along the thrust line
      const head = tipW(W, poseAt, rel, me).tip, aim = [TX - 2, TY - 7];
      if (t >= rel && t < land) {
        const e = seg(t, rel, land), x = lerp(head[0], aim[0], e), y = lerp(head[1], aim[1], e), ang = Math.atan2(aim[1] - head[1], aim[0] - head[0]);
        for (let j = 1; j <= 5; j++) X.px(c, x - Math.cos(ang) * j * 4, y - Math.sin(ang) * j * 4, j < 2 ? '#ffffff' : EL.cold[j < 4 ? 1 : 2]);
        K.shard(c, x, y, ang, 11, 5, 1);
        if (e < 0.25) X.glow(c, head[0], head[1], 5, EL.cold[2], 1 - e * 4);
      } else if (t >= land && t < gone) {
        const ang = 0.9; K.shard(c, TX - 3 - Math.cos(ang) * 8, TY + 1 - Math.sin(ang) * 8, ang, 11, 5, 1);
        if (t < land + 0.9) tag(c, 'PINNED', g.x - 12, g.y - 24);
      } else if (t >= gone && t < gone + 0.5) {
        const e = seg(t, gone, gone + 0.5);
        for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.9 + (i / 5) * Math.PI * 0.8, sp = 4 + rand(i, 8) * 8; K.shard(c, TX - 6 + Math.cos(a) * sp * e, TY - 4 + Math.sin(a) * sp * e + 12 * e * e, a + e * 5, 2.5, i + 2, 1 - e); }
      }
      spark(c, [TX - 3, TY - 4], R, t - land, 1);
      K.chilled(c, A, g, t, k);
      if (t > 1.0 && t < 2.2) X.text(c, 'SPEAR STAYS', 4, 6, '#a8a3bb');
    });
    S.label = 'SHIFT+RMB';
  };

  // register the weapon moves
  const MV = (W, base, slot, v) => { moveVignette(W_[W], base, v); PB.WMV[PB.WMV.length - 1].slot = slot; };
  MV('arcane', 'strike', 'strike', { id: 'w-arcane-v3-strike', keys: WM.POKES, fx: 'arcane3-strike', M: { sm: [] } });
  MV('arcane', 'heavy', 'heavy', { id: 'w-arcane-v3-heavy', keys: WAND_CHARGE, fx: 'arcane3-heavy', M: { sm: [] }, still: 1.62 });
  MV('arcane', 'strike', 'special', { id: 'w-arcane-v3-special', keys: SIPHON_KEYS, fx: 'arcane3-siphon', M: { dur: 3.4, hits: [1.6], sm: [] }, still: 1.6 });
  MV('life', 'strike', 'special', { id: 'w-life-mend', keys: MEND_KEYS, fx: 'life-mend', M: { dur: 3.4, hits: [1.8], sm: [] }, still: 1.8 });
  MV('cold', 'strike', 'special', { id: 'w-cold-send-v3', keys: THROW3, fx: 'cold-javelin3', M: { dur: 3.0, hits: [0.92], sm: [[0.6, 0.72]] }, still: 0.66 });

  // ---------------------------------------------------------------------------
  // Guards
  const GME = { x: 42, y: 54 };
  const gv = (id, part, dur, frame, still) => add({ id, kind: 'guard', guard: id.split('-')[1], part, w: GW, h: GH, dur, ground: 'path', seed: 50 + id.length, still: still || 1.2, frame });
  const raised = (t, a, b) => smooth(seg(t, a, a + 0.12)) * (1 - smooth(seg(t, b, b + 0.2)));
  const stars = (c, x, y, t) => { for (let i = 0; i < 3; i++) { const a = t * 7 + (i / 3) * TAU; X.px(c, x + Math.cos(a) * 5, y + Math.sin(a) * 2, i % 2 ? '#ffffff' : '#f4c44a'); } };

  // Mirror buckler: Backstep, now 3 units
  gv('g-mirror-retreat-v2', 'retreat', 2.6, (t) => {
    const D = 2.6, d = 3 * U, e = seg(t, T0, T0 + 0.24), x = lerp(RX, RX - d, easeOut(e)), z = K.hop(t, T0, 6, 0.24);
    const me = rWiz('mirror', t, D, x, RY, { s: { z } });
    const g = chaser(t, D, 140, RX + 16, T0 + 0.05);
    return { actors: [me, g],
      fx(c) {
        K.dust(c, RX, RY, t - T0, 2, 5, 8, '#b8a890', 0.5); K.dust(c, RX - d, RY, t - T0 - 0.24, 3, 5, 8, '#b8a890', 0.5); whiff(c, RX + 6, RY, t, T0 + 0.1);
        if (t > T0 + 0.25 && t < 2.3) { X.rect(c, RX - d, RY + 6, d, 1, '#6f6a85'); X.text(c, '3 UNITS', RX - d + 6, RY + 9, '#a8a3bb'); }
        if (t > T0 + 0.2 && t < T0 + 0.9) tag(c, 'BACKSTEP', RX - 52, RY - 30);
        rKey(c, t);
      } };
  }, 1.2);

  // Bulwark: Shove step, a short step back while the slab slams forward
  gv('g-bulwark-retreat-v2', 'retreat', 3.0, (t) => {
    const D = 3.0, BX = RX - 18, d = 1.5 * U, e = seg(t, T0, T0 + 0.18), x = lerp(BX, BX - d, easeOut(e)), slam = T0 + 0.06, k = env(t, T0 - 0.04, T0 + 0.45, 0.05, 0.2);
    const me = rWiz('bulwark', t, D, x, RY, { k: 0.6 + 0.4 * k, hit: K.flash(t, slam) });
    const foes = [['g1', BX + 15, RY + 1, 1], ['g2', BX + 23, RY - 7, 2]].map(([id, gx2, gy2, sd]) => {
      const r = hitBy(t, [[slam + 0.02, 1.8 * U, 3]]), stun = t > slam && t < slam + 0.48 + 0.3;
      return gob(id, lerp(150, gx2, seg(t, 0.15, T0)) + r.kb, gy2, Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D), seed: sd, sq: stun ? 0.12 : 0 }, t < T0 ? K.walk(t, 1.3) : {}));
    });
    return { actors: [me, ...foes],
      under(c) {
        const q = seg(t, slam, slam + 0.35);
        if (q > 0 && q < 1) for (let j = -5; j <= 5; j++) { const a = j * 0.15, rr = 8 + q * 2.6 * U; X.px(c, BX + Math.cos(a) * rr, RY + Math.sin(a) * rr * FY, j % 2 ? '#e8dcc8' : '#b8946a'); }
      },
      fx(c, A) {
        K.dust(c, BX + 8, RY, t - slam, 4, 8, 14, '#b8a890', 0.7);
        for (const g of foes) { spark(c, chestOf(A, g), EL.earth, t - slam - 0.02, 1); if (t > slam + 0.05 && t < slam + 0.8) stars(c, g.x, g.y - 22, t); }
        if (t > T0 && t < T0 + 0.8) tag(c, 'SHOVE STEP', BX - 44, RY - 32);
        if (t > slam + 0.1 && t < slam + 0.8) tag(c, 'STUN', foes[0].x - 8, foes[0].y - 30);
        rKey(c, t);
      } };
  }, 0.95);

  // Rime kite: the block chills a melee attacker; a parry freezes it
  gv('g-rime-defend-v2', 'defend', 3.4, (t) => {
    const D = 3.4, k = Math.max(raised(t, 0.35, 2.9), 0), hit1 = 1.0, hit2 = 2.2;
    const walkK = seg(t, 0.25, hit1 - 0.03), chill = seg(t, hit1, hit1 + 0.2) * (1 - seg(t, D - 0.45, D - 0.1)), frozen = seg(t, hit2, hit2 + 0.15) * (1 - seg(t, D - 0.4, D - 0.1));
    const r = hitBy(t, [[hit1, 4, 0], [hit2, 2, 0]]);
    const back = t > hit1 && t < hit2 ? -lerp(0, 4, seg(t, hit1 + 0.3, 1.6)) + lerp(0, 4, seg(t, 1.6, hit2 - 0.05)) : 0;
    const g = gob('g1', lerp(130, 62, walkK) + r.kb + back, 55, Object.assign({ flash: r.flash * 0.5, chill, frozen, alpha: fade(t, D), sq: (t > hit1 - 0.08 && t < hit1) || (t > hit2 - 0.2 && t < hit2) ? -0.25 : 0 }, walkK > 0 && walkK < 1 ? K.walk(t, 1.3) : t > hit1 + 0.3 && t < hit2 - 0.05 && !frozen ? K.walk(t, 0.35) : {}));
    const me = wizard(STAFF, holdTrack, t, { x: GME.x, y: GME.y, guard: { id: 'rime', k, hit: Math.max(K.flash(t, hit1), K.flash(t, hit2)) } });
    return { actors: [me, g],
      fx(c, A) {
        const gp = A.me.guard || [me.x + 6, me.y - 10];
        spark(c, [gp[0] + 4, gp[1]], EL.cold, t - hit1, 0.9); spark(c, [gp[0] + 4, gp[1]], EL.cold, t - hit2, 1.4);
        if (t > hit1 && t < hit1 + 0.4) for (let i = 0; i < 8; i++) K.puff(c, g.x + (rand(i, 1) - 0.5) * 12, g.y - 10 - (t - hit1) * 14, 1.5 + (t - hit1) * 5, i % 2 ? '#ffffff' : EL.cold[1], 1 - (t - hit1) / 0.4);
        K.chilled(c, A, g, t, chill * (1 - frozen));
        if (t > hit1 + 0.1 && t < hit2 - 0.1) tag(c, 'CHILLED', g.x - 14, g.y - 26);
        if (t > hit2 + 0.1 && t < D - 0.4) tag(c, 'FROZEN', g.x - 12, g.y - 30);
        if (t > hit1 + 0.1 && t < hit2 - 0.1) X.text(c, 'NO FLOOR ICE', 4, 6, '#a8a3bb');
        keycap(c, GH, t > hit2 - 0.12 && t < hit2 + 0.25 ? 'SPACE TAP' : 'SPACE HOLD', k > 0.5);
      } };
  }, 1.4);

  // Prism pane: Clear (an ally's beam goes through you), then a block stops a beam and a parry returns it
  function beam(c, a, b, R, t, w = 1) {
    X.line(c, a[0], a[1], b[0], b[1], R[3], 2 + w); X.line(c, a[0], a[1], b[0], b[1], Math.floor(t * 20) % 2 ? R[1] : R[0], 1);
    X.glow(c, b[0], b[1], 4, R[2], 0.8);
  }
  gv('g-prism-defend-v2', 'defend', 4.2, (t) => {
    const D = 4.2, a0 = 0.35, a1 = 1.6, b0 = 2.0, par = 3.0, b1 = 3.7, k = raised(t, 1.85, 3.75);
    const al = allyWiz('p2', 14, 54, { face: 0, el: 'cold', alpha: fade(t, D) });
    const burnK = after(t, a0 + 0.15, D) * (1 - seg(t, 1.9, 2.1));
    const g = status(gob('g1', 104, 56, { flash: t > a0 && t < a1 && Math.floor(t * 12) % 2 ? 0.5 : 0, alpha: fade(t, D) * (1 - seg(t, 1.7, 1.9)) }), 'cold', burnK);
    const caster = archer('a1', 124, 40, { draw: 0, alpha: fade(t, D) * seg(t, 1.7, 1.9), tint: '#a04a2a', tintK: 0.25, flash: K.flash(t, par + 0.05), z: K.hop(t, par + 0.05, 3, 0.3) });
    const me = wizard(STAFF, holdTrack, t, { x: GME.x, y: GME.y, guard: { id: 'prism', k } });
    return { actors: [al, me, g, caster], lights: [[96, 50, 40, '#ff9a30', t > b0 && t < b1 ? 0.5 : 0]],
      fx(c, A) {
        const gp = A.me.guard || [me.x + 7, me.y - 10];
        if (t > a0 && t < a1) {
          const tipA = (A.p2 && A.p2.tip) || [al.x + 8, al.y - 14];
          beam(c, tipA, chestOf(A, g), EL.cold, t);
          X.glow(c, me.x, me.y - 10, 9, EL.arcane[1], 0.35);
          if (t > a0 + 0.2) tag(c, 'CLEAR', me.x - 10, me.y - 34);
          X.text(c, 'ALLY BEAM', 4, 6, '#a8a3bb');
        }
        if (t > b0 && t < b1) {
          const src = [caster.x - 5, caster.y - 9], hitP = [gp[0] + 3, gp[1]];
          if (t < par) { beam(c, src, hitP, EL.fire, t, 1.5); X.glow(c, hitP[0], hitP[1], 6, EL.arcane[1], 0.9); if (t > b0 + 0.2) tag(c, 'BLOCKED', gp[0] - 6, gp[1] - 18); }
          else { const e = seg(t, par, par + 0.2); beam(c, hitP, [lerp(hitP[0], src[0], e), lerp(hitP[1], src[1], e)], EL.arcane, t, 2); if (t > par + 0.1) tag(c, 'RETURNED', caster.x - 18, caster.y - 34); }
        }
        if (t > b0) keycap(c, GH, t > par - 0.12 && t < par + 0.25 ? 'SPACE TAP' : 'SPACE HOLD', k > 0.5);
      } };
  }, 1.0);

  // Leaf aegis: the block heals allies all round; a parry burst-heals everyone, you too
  gv('g-leaf-defend-v2', 'defend', 3.4, (t) => {
    const D = 3.4, k = raised(t, 0.35, 2.9), s1 = 1.0, par = 2.2, R3 = 3.5 * U, MX = 62, MY = 52;
    const v = (base) => Math.min(1, lerp(base, base + 0.25, seg(t, 0.5, par)) + (t > par ? 0.3 * seg(t, par, par + 0.3) : 0));
    const a1 = allyWiz('p2', MX - 30, MY - 10, { face: 0, sq: 0.15 }), a2 = allyWiz('p3', MX + 14, MY + 18, { team: 'p3', face: Math.PI, sq: 0.15 });
    const a = archer('a1', 130, 50, { draw: t < par ? mod(t, 1.2) / 1.2 : 0, alpha: fade(t, D) });
    const me = wizard(STAFF, holdTrack, t, { x: MX, y: MY, guard: { id: 'leaf', k, hit: Math.max(K.flash(t, s1), K.flash(t, par)) } });
    return { actors: [me, a1, a2, a], lights: [[MX, MY, 44, '#c8fab0', k * 0.5]],
      under(c) { if (k > 0.3) K.gring(c, MX, MY, R3, EL.life[2], 0.6 * k, 1); if (t > par && t < par + 0.5) K.gring(c, MX, MY, 6 + seg(t, par, par + 0.5) * R3, EL.life[1], 1 - seg(t, par, par + 0.5), 2); },
      fx(c, A) {
        const gp = A.me.guard || [me.x + 7, me.y - 10];
        for (const h of [s1, par]) { if (t > h - 0.35 && t < h) { const e = seg(t, h - 0.35, h); arrow(c, lerp(124, gp[0] + 4, e), lerp(42, gp[1], e), Math.PI); } spark(c, [gp[0] + 3, gp[1]], EL.life, t - h, h === par ? 1.3 : 0.8); }
        for (const s of [a1, a2]) K.heals(c, A, s, t, k);
        for (const s of [me, a1, a2]) sparkleHeal(c, chestOf(A, s), t - par);
        hpBar(c, A, a1, t > D - 0.25 ? 0.3 : v(0.3)); hpBar(c, A, a2, t > D - 0.25 ? 0.35 : v(0.35)); hpBar(c, A, me, t > D - 0.25 ? 0.5 : t > par ? lerp(0.5, 0.8, seg(t, par, par + 0.3)) : 0.5);
        if (k > 0.5 && t < par) X.text(c, 'ANY SIDE', 4, 6, '#a8a3bb');
        if (t > par && t < par + 0.9) tag(c, 'BURST HEAL', MX - 20, 6);
        keycap(c, GH, t > par - 0.12 && t < par + 0.25 ? 'SPACE TAP' : 'SPACE HOLD', k > 0.5);
      } };
  }, 1.6);

  // Leaf aegis: Seed step, a hop back that leaves a healing bloom; no ally needed
  gv('g-leaf-retreat-v2', 'retreat', 3.4, (t) => {
    const D = 3.4, d = 2.5 * U, e = seg(t, T0, T0 + 0.24), x = lerp(RX, RX - d, easeOut(e)), z = K.hop(t, T0, 5, 0.24);
    const bloom = t > T0 ? seg(t, T0, T0 + 0.2) * (1 - seg(t, D - 0.45, D - 0.15)) : 0, br = 1.2 * U;
    const me = rWiz('leaf', t, D, x, RY, { s: { z } });
    const g = chaser(t, D, 140, RX + 24, T0 + 0.05);
    const walk = seg(t, 1.5, 2.1), al = allyWiz('p2', lerp(RX - 4, RX - 2, walk), lerp(22, RY - 4, walk), Object.assign({ face: Math.PI / 2, alpha: fade(t, D) }, walk > 0 && walk < 1 ? K.walk(t, 1) : {}));
    const inBloom = t > 2.1 && bloom > 0.3, v = lerp(0.35, 0.8, seg(t, 2.1, 3.0));
    return { actors: [me, g, al], lights: [[RX, RY, 26, '#c8fab0', bloom * 0.5]],
      under(c) {
        if (bloom <= 0.02) return;
        X.ellipse(c, RX, RY + 1, br, br * FY, '#1e7a34', 0.35 * bloom); K.gring(c, RX, RY + 1, br, EL.life[2], 0.9 * bloom, 1);
        for (let i = 0; i < 2; i++) { const q = mod(t * 0.7 + i / 2, 1); K.gring(c, RX, RY + 1, 3 + q * (br - 3), EL.life[1], (1 - q) * 0.7 * bloom, 1); }
      },
      fx(c, A) {
        for (let i = 0; i < 5; i++) { const q = mod(t * 0.9 + i / 5, 1), a = rand(i, 3) * TAU; if (bloom > 0.3) X.px(c, RX + Math.cos(a) * br * 0.6, RY - q * 12, i % 2 ? EL.life[1] : '#f4e08a'); }
        whiff(c, RX + 6, RY, t, T0 + 0.1);
        K.heals(c, A, al, t, inBloom ? 1 : 0); hpBar(c, A, al, t > D - 0.25 ? 0.35 : t > 2.1 ? v : 0.35);
        if (t > T0 + 0.2 && t < T0 + 0.9) tag(c, 'SEED STEP', RX - 52, RY - 32);
        if (inBloom && t < 3.0) tag(c, 'BLOOM', RX - 10, 8);
        rKey(c, t);
      } };
  }, 2.4);
})();
