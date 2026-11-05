/* Weapon Moveset Review, round 4: the Arcane guard redesign (docs/explorations/2026-11-05-guards-round-2.md,
 * "The Arcane guard redesigned (built)"). New slugs, so the round-3 Prism ratings stay on the old ones:
 *   g-prism-v4          the Capacitor: hits on the raised pane store a violet charge; lowering it fires the Lance
 *   g-prism-lance       the Lance itself: 7 u straight ahead, hits allies too, stops at rock; under 10 charge nothing fires
 *   g-prism-lance-fire  Prism + Fire: the same Lance in the coat's colour, and the targets burn
 * Distances: about 12 art px to a game unit, as in rounds 2 and 3. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, H = PB.WMH, X = PB.px, EL = X.EL;
  const { TAU, seg, smooth, lerp, rand, mod } = PB;
  const { add, gob, archer, allyWiz, fade, spark, arrow, chestOf, keycap, status, hitBy, after, wizard, tag, GW, GH, GME, STAFF, holdTrack } = H;
  const U = 12, LANCE = 7 * U;
  // the stored charge glows violet on the pane, whatever the coat
  const VIO = ['#ffffff', '#e6d4ff', '#b48cff', '#8058e0', '#3a2470'];
  const raised = (t, a, b) => smooth(seg(t, a, a + 0.12)) * (1 - smooth(seg(t, b, b + 0.2)));
  const paneOf = (A, me) => (A.me && A.me.guard) || [me.x + 7, me.y - 10];

  // the charge on the pane: a swelling violet glow, motes drawn in, and a small meter over it
  function charge(c, gp, q, t, label = true) {
    if (q <= 0.5) return;
    const f = Math.min(1, q / 60), pulse = 0.85 + 0.15 * Math.sin(t * 9);
    X.glow(c, gp[0], gp[1], 4 + f * 9, VIO[3], (0.45 + 0.4 * f) * pulse);
    X.glow(c, gp[0], gp[1], 2 + f * 5, VIO[2], 0.8 * pulse);
    if (f > 0.5) X.glow(c, gp[0], gp[1], 2 + f * 2, VIO[1], 0.7);
    for (let i = 0; i < 4; i++) { const ph = mod(t * 1.6 + i / 4, 1), a = rand(i, Math.floor(t * 1.6 + i / 4), 7) * TAU, r = (1 - ph) * (8 + f * 6); X.px(c, gp[0] + Math.cos(a) * r, gp[1] + Math.sin(a) * r * 0.8, ph > 0.7 ? VIO[0] : VIO[2]); }
    if (!label) return;
    const bx = gp[0] - 10, by = gp[1] - 22;
    X.rect(c, bx - 1, by - 1, 22, 4, '#120e1a'); X.rect(c, bx, by, 20, 2, '#2a2539'); X.rect(c, bx, by, Math.round(20 * f), 2, VIO[2]);
    X.rect(c, bx + 20 * (10 / 60), by - 1, 1, 4, '#a8a3bb');
    X.text(c, String(Math.round(q)), bx + 24, by - 2, VIO[1], '#120e1a');
  }
  // the Lance: an instant line from the pane, white-hot core, edges in the coat's colour (R)
  function lance(c, a, x1, e, R) {
    if (e < 0 || e >= 1) return;
    const k = 1 - e, y = a[1];
    X.line(c, a[0], y, x1, y, R[3], Math.max(1, Math.round(7 * k)));
    X.line(c, a[0], y, x1, y, R[2], Math.max(1, Math.round(4 * k)));
    X.line(c, a[0], y, x1, y, e < 0.45 ? '#ffffff' : R[1], e < 0.7 ? 2 : 1);
    X.glow(c, a[0], y, 9 * k + 3, R[2], k);
    X.glow(c, x1, y, 6 * k + 2, R[1], k * 0.8);
    for (let i = 0; i < 8; i++) { const x = lerp(a[0], x1, rand(i, 41)), d = (rand(i, 42) - 0.5) * 8 * e; X.px(c, x, y + d, i % 2 ? '#ffffff' : R[1]); }
  }
  const lanceLights = (gp, x1, on, col) => (on ? [[gp[0] + 10, gp[1] + 10, 30, col, on], [(gp[0] + x1) / 2, gp[1] + 10, 40, col, on], [x1 - 6, gp[1] + 10, 30, col, on * 0.8]] : []);
  const vig = (id, part, dur, frame, still) => add({ id, kind: 'guard', guard: 'prism', part, w: GW, h: GH, dur, ground: 'path', seed: 70 + id.length, still, frame });

  // ---------------------------------------------------------------------------
  // g-prism-v4: the Capacitor. Arrows and club blows on the raised pane fill the charge;
  // lowering it fires the Lance through the goblin line.
  vig('g-prism-v4', 'card', 5.0, (t) => {
    const D = 5.0, up = 0.3, low = 2.75, L = low + 0.08, k = raised(t, up, low);
    const shots = [[0.7, 1.0], [1.55, 1.85]], blows = [1.25, 2.25];
    const gains = [...shots.map((s) => s[1]), ...blows].sort((a, b) => a - b);
    const q = t < L ? gains.reduce((s, h) => s + (t > h ? 12 : 0), 0) : 0;
    const walk = seg(t, 0.2, 1.05);
    const lineY = GME.y;
    const foes = [['g1', 64, 1.05, 1], ['g2', 86, 1.4, 2], ['g3', 108, 1.7, 3]].map(([id, gx, arr, sd]) => {
      const w = seg(t, 0.2, arr), r = hitBy(t, [[L, 6, 2]]), tell = id === 'g1' && blows.some((h) => t > h - 0.18 && t < h);
      return gob(id, lerp(150, gx, w) + r.kb, lineY + (sd === 2 ? 1 : 0), Object.assign({ flash: r.flash, z: r.z, dead: K.down(t, L + 0.05, D + 1), alpha: fade(t, D), seed: sd, sq: tell ? -0.25 : 0 }, w > 0 && w < 1 ? K.walk(t, 1.3) : {}));
    });
    const a = archer('a1', 126, 34, { draw: Math.max(0, ...shots.map(([s]) => (t < s ? smooth(seg(t, s - 0.45, s - 0.05)) : 0))), alpha: fade(t, D) });
    const hitT = [...shots.map((s) => s[1]), ...blows];
    const me = wizard(STAFF, holdTrack, t, { x: GME.x, y: GME.y, guard: { id: 'prism', k, hit: Math.max(...hitT.map((h) => K.flash(t, h))) } });
    let gp0 = null;
    return { actors: [me, ...foes, a], lights: lanceLights([GME.x + 7, GME.y - 10], GME.x + 7 + LANCE, t > L && t < L + 0.35 ? 1 - seg(t, L, L + 0.35) : 0, '#e6d4ff').concat([[GME.x + 8, GME.y, 24, '#b48cff', Math.min(1, q / 60) * 0.6]]),
      fx(c, A) {
        const gp = paneOf(A, me); if (t < L) gp0 = gp; const g0 = gp0 || gp;
        for (const [s, h] of shots) if (t > s && t < h) { const e = seg(t, s, h); arrow(c, lerp(120, gp[0] + 4, e), lerp(28, gp[1], e), Math.PI + 0.35); }
        for (const h of hitT) spark(c, [gp[0] + 3, gp[1]], VIO, t - h, 0.9);
        charge(c, gp, q, t);
        if (t > 1.0 && t < low) tag(c, 'STORED', 4, 6);
        if (t > L - 0.02) { lance(c, [g0[0] + 3, g0[1]], g0[0] + 3 + LANCE, seg(t, L, L + 0.45), VIO); for (const g of foes) spark(c, chestOf(A, g), VIO, t - L - 0.02, 1.2); }
        if (t > L && t < L + 1.1) { tag(c, 'LANCE', g0[0] + 22, g0[1] - 22); X.text(c, '8 + 48 CHARGE', 4, 6, '#a8a3bb'); }
        keycap(c, GH, t > low - 0.1 && t < L + 0.35 ? 'SPACE RELEASE' : k > 0.05 ? 'SPACE HOLD' : '', k > 0.5 || (t > low - 0.1 && t < L + 0.35));
      } };
  }, 2.9);

  // ---------------------------------------------------------------------------
  // g-prism-lance: the rules of the Lance. 7 u, hits everything on the line (your partner too), stops at rock.
  // Then a second, small charge (under 10) lowers and nothing fires.
  vig('g-prism-lance', 'lance', 4.6, (t) => {
    const D = 4.6, L = 1.05, k = Math.max(raised(t, 0, 0.95), raised(t, 2.1, 3.25)), q0 = 40;
    const s2 = 2.35, h2 = 2.65, L2 = 3.35;
    const q = t < L ? q0 : t > h2 && t < L2 + 0.05 ? 6 : 0;
    const RKX = 116, y = GME.y;
    const r1 = hitBy(t, [[L, 6, 2]]), r2 = hitBy(t, [[L + 0.01, 3, 1]]);
    const g1 = gob('g1', 68 + r1.kb, y, { flash: r1.flash, z: r1.z, dead: K.down(t, L + 0.05, D + 1), alpha: fade(t, D) });
    const al = allyWiz('p2', 92 + r2.kb, y + 1, { flash: r2.flash, z: r2.z, alpha: fade(t, D), sq: t > L && t < L + 0.4 ? 0.2 : 0 });
    const g2 = gob('g2', 132, y, { alpha: fade(t, D), seed: 2 });
    const a = archer('a1', 124, 32, { draw: t > 1.9 && t < s2 ? smooth(seg(t, 1.9, s2 - 0.05)) : 0, alpha: fade(t, D) });
    const me = wizard(STAFF, holdTrack, t, { x: GME.x, y: GME.y, guard: { id: 'prism', k, hit: K.flash(t, h2) } });
    let gp0 = null;
    return { actors: [me, g1, al, g2, a], lights: lanceLights([GME.x + 7, GME.y - 10], RKX - 6, t > L && t < L + 0.35 ? 1 - seg(t, L, L + 0.35) : 0, '#e6d4ff'),
      fx(c, A) {
        const gp = paneOf(A, me); if (t < L) gp0 = gp; const g0 = gp0 || gp;
        K.rock(c, RKX, y - 3, 7, 4);
        charge(c, gp, q, t);
        if (t > L - 0.02 && t < L + 0.6) { lance(c, [g0[0] + 3, g0[1]], RKX - 6, seg(t, L, L + 0.45), VIO); spark(c, chestOf(A, g1), VIO, t - L, 1.2); spark(c, chestOf(A, al), VIO, t - L, 1); spark(c, [RKX - 6, g0[1]], EL.earth, t - L, 1); }
        if (t > L + 0.05 && t < L + 1.0) { tag(c, 'ALLY HIT TOO', al.x - 22, al.y - 30); tag(c, 'STOPS AT ROCK', RKX - 26, y + 8); }
        if (t < L) X.text(c, '7 UNITS, ALL ON THE LINE', 4, 6, '#a8a3bb');
        // the second try: one arrow (6 charge), lowered, nothing happens
        if (t > s2 && t < h2) { const e = seg(t, s2, h2); arrow(c, lerp(118, gp[0] + 4, e), lerp(26, gp[1], e), Math.PI + 0.4); }
        spark(c, [gp[0] + 3, gp[1]], VIO, t - h2, 0.7);
        if (t > L2 && t < L2 + 0.4) for (let i = 0; i < 5; i++) { const e = seg(t, L2, L2 + 0.4), aa = (i / 5) * TAU; X.px(c, g0[0] + 3 + Math.cos(aa) * 4 * e, g0[1] + Math.sin(aa) * 3 * e, VIO[2]); }
        if (t > L2 && t < L2 + 1.0) tag(c, 'UNDER 10: NOTHING', 4, 6);
        const rel = (t > 0.9 && t < L + 0.3) || (t > L2 - 0.12 && t < L2 + 0.3);
        keycap(c, GH, rel ? 'SPACE RELEASE' : k > 0.5 ? 'SPACE HOLD' : '', rel || k > 0.5);
      } };
  }, 1.12);

  // ---------------------------------------------------------------------------
  // g-prism-lance-fire: Shield + Arcane + Fire. The pane wears a dotted fire rim (the coat); the charge
  // is violet as always, but the Lance comes out orange and sets the line burning.
  vig('g-prism-lance-fire', 'lance', 4.8, (t) => {
    const D = 4.8, up = 0.3, low = 2.45, L = low + 0.08, k = raised(t, up, low);
    const shots = [[0.6, 0.9], [1.25, 1.55]], blow = 1.95, gains = [0.9, 1.55, blow];
    const q = t < L ? gains.reduce((s, h) => s + (t > h ? 14 : 0), 0) : 0;
    const R = EL.fire, y = GME.y;
    const foes = [['g1', 64, 0.95, 1], ['g2', 88, 1.3, 2], ['g3', 112, 1.6, 3]].map(([id, gx, arr, sd]) => {
      const w = seg(t, 0.15, arr), r = hitBy(t, [[L, 7, 2]]), tell = id === 'g1' && t > blow - 0.18 && t < blow;
      const burn = after(t, L + 0.05, D);
      return status(gob(id, lerp(150, gx, w) + r.kb, y + (sd === 2 ? 1 : 0), Object.assign({ flash: r.flash, z: r.z, alpha: fade(t, D), seed: sd, sq: tell ? -0.25 : 0 }, w > 0 && w < 1 ? K.walk(t, 1.3) : t > L + 0.4 ? K.walk(t, 0.3) : {})), 'fire', burn);
    });
    const a = archer('a1', 126, 32, { draw: Math.max(0, ...shots.map(([s]) => (t < s ? smooth(seg(t, s - 0.45, s - 0.05)) : 0))), alpha: fade(t, D) });
    const me = wizard(STAFF, holdTrack, t, { x: GME.x, y: GME.y, guard: { id: 'prism', k, hit: Math.max(...gains.map((h) => K.flash(t, h))) } });
    let gp0 = null;
    return { actors: [me, ...foes, a], lights: lanceLights([GME.x + 7, GME.y - 10], GME.x + 7 + LANCE, t > L && t < L + 0.35 ? 1 - seg(t, L, L + 0.35) : 0, '#ff9a30').concat([[90, 50, 50, '#ff9a30', t > L ? 0.35 * after(t, L + 0.05, D) : 0]]),
      fx(c, A) {
        const gp = paneOf(A, me); if (t < L) gp0 = gp; const g0 = gp0 || gp;
        // the coat rim: dotted fire ring round the pane
        for (let i = 0; i < 12; i++) { const aa = (i / 12) * TAU + t * 0.8, r = 7.5; if (i % 2 === 0) X.px(c, gp[0] + Math.cos(aa) * r, gp[1] + Math.sin(aa) * r * 1.1, R[(i / 2 + Math.floor(t * 8)) % 3 + 1]); }
        for (const [s, h] of shots) if (t > s && t < h) { const e = seg(t, s, h); arrow(c, lerp(120, gp[0] + 4, e), lerp(26, gp[1], e), Math.PI + 0.4); }
        for (const h of gains) spark(c, [gp[0] + 3, gp[1]], VIO, t - h, 0.9);
        charge(c, gp, q, t);
        if (t > L - 0.02) { lance(c, [g0[0] + 3, g0[1]], g0[0] + 3 + LANCE, seg(t, L, L + 0.45), R); for (const g of foes) spark(c, chestOf(A, g), R, t - L - 0.02, 1.2); }
        for (const g of foes) K.burning(c, A, g, t, after(t, L + 0.05, D));
        if (t < L) X.text(c, 'SHIELD + ARCANE + FIRE', 4, 6, '#a8a3bb');
        if (t > L && t < L + 1.0) tag(c, 'LANCE', g0[0] + 22, g0[1] - 22);
        if (t > L + 0.3 && t < D - 0.5) tag(c, 'BURNING', 4, 6);
        keycap(c, GH, t > low - 0.1 && t < L + 0.35 ? 'SPACE RELEASE' : k > 0.05 ? 'SPACE HOLD' : '', k > 0.5 || (t > low - 0.1 && t < L + 0.35));
      } };
  }, 2.6);
})();
