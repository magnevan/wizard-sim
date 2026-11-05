/* Weapon Moveset Review: the weapons, guards and the shared move grammar.
 *   WEAPONS: one per lead element plus the bare staff (name, recipe, hands, reach, signature).
 *   prop():  draws a held weapon between a grip point and a tip point (2D, art pixels), so the
 *            same drawing serves the rig (in the hand) and the fx pass (thrown, planted).
 *   track(): keyframed poses. A pose is { hR: [f, r, u] right hand in the wizard's local frame,
 *            p pitch, y yaw (of the weapon), fo face offset (spins), st step forward (px),
 *            lm length multiplier, hide (weapon not in hand), hL optional left hand }.
 *   MOVES:   the six moves, each one track shared by every weapon (six tells, not 48), with
 *            per-weapon overrides only where the doc asks for a different shape.
 *   rig():   turns a track into an actor rig (actors.js s.rig), with a motion smear sampled
 *            from earlier poses.
 *   guard(): draws one of the eight guards at a point.
 * Everything is a pure function of time. */
(function () {
  'use strict';
  const PB = window.PB, { FY, CU, TAU, seg, smooth, easeOut, lerp, rand, clamp } = PB, X = PB.px, EL = X.EL;
  const WM = (PB.WM = {});

  const STAFF_R = ['#ffffff', '#ece6f8', '#b8b0cc', '#7a7290', '#4a4458'];
  const RAMP = { fire: EL.fire, cold: EL.cold, lightning: EL.lightning, arcane: EL.arcane, earth: EL.earth, water: EL.water, life: EL.life, staff: STAFF_R, shield: EL.shield };

  // ---------------------------------------------------------------------------
  // The weapon set (from explorations/2026-11-04-weapons-and-movesets.md, section 3)
  const WEAPONS = [
    { id: 'staff', el: 'staff', name: 'Bare staff', q: [], hands: 'one', reach: 1.6, len: 17,
      silhouette: 'Your own staff, no conjure needed.', feel: 'Teaches the grammar from minute one',
      sig: 'Shoves only: no element and almost no damage. Every gesture already does something, so conjuring a weapon makes moves you know stronger.' },
    { id: 'water', el: 'water', name: 'Tide glaive', q: ['sigil', 'water'], hands: 'two', reach: 2.6, len: 18,
      silhouette: 'A polearm with a crescent of water', feel: 'Crowd herding',
      sig: 'Sweep and soak: everything it hits is shoved and wet, which sets up Lightning and Cold partners.' },
    { id: 'life', el: 'life', name: 'Healing hands', q: ['sigil', 'life'], hands: 'two', reach: 1.4, len: 0,
      silhouette: 'Both hands glowing green', feel: 'Close, brave support',
      sig: 'Contact healing: the moves heal allies you touch. Two-handed on purpose, so protecting the healer is the partner’s job.' },
    { id: 'cold', el: 'cold', name: 'Frost spear', q: ['sigil', 'cold'], hands: 'one', reach: 3.5, len: 22,
      silhouette: 'Long and thin, an ice shard at the tip', feel: 'Patient spacing',
      sig: 'Reach, plus setting up shatters: the longest thrust in the game, and frozen targets break on it.' },
    { id: 'lightning', el: 'lightning', name: 'Lightning whip', q: ['sigil', 'lightning'], hands: 'one', reach: 3.6, len: 24,
      silhouette: 'A swaying, crackling lash', feel: 'Flicky and precise',
      sig: 'Sweet spot at the tip, plus chain: only the tip hits hard, and the heavy lash jumps between bodies.' },
    { id: 'arcane', el: 'arcane', name: 'Arcane hook', q: ['sigil', 'arcane'], hands: 'one', reach: 2.0, len: 13,
      silhouette: 'A chain with a barbed hook', feel: 'Control',
      sig: 'Displacement: yank others to you, or grapple yourself to the cursor.' },
    { id: 'fire', el: 'fire', name: 'Flame sword', q: ['sigil', 'fire'], hands: 'one', reach: 1.8, len: 12,
      silhouette: 'Short blade, tongues of flame up the edge', feel: 'Fast and aggressive',
      sig: 'Combo: the third hit of a chain throws flame, and every move sets things alight.' },
    { id: 'earth', el: 'earth', name: 'Stone maul', q: ['sigil', 'earth'], hands: 'two', reach: 2.0, len: 13,
      silhouette: 'A huge stone block on a haft', feel: 'Slow and committed',
      sig: 'Weight: hits knock down and break guards, and you can’t be knocked back while you hold it.' },
  ];
  for (const w of WEAPONS) w.R = RAMP[w.el];

  // ---------------------------------------------------------------------------
  // Drawing a weapon between grip g and tip (screen points). sc = colour canvas (lit),
  // se = emissive canvas (skips the light map). o: { t, glow 0..1, ctrl (whip/hook curve) }
  function prop(sc, se, W, g, tip, o = {}) {
    const t = o.t || 0, glow = o.glow || 0;
    const dx = tip[0] - g[0], dy = tip[1] - g[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const at = (a, b = 0) => [g[0] + ux * a + nx * b, g[1] + uy * a + ny * b];
    const ln = (c, a, b, col, w) => X.line(c, a[0], a[1], b[0], b[1], col, w);
    const fl = Math.floor(t * 16);
    switch (W.id) {
      case 'fire': {
        ln(sc, at(-3), at(0), '#4a2a1e'); X.px(sc, ...at(-3), '#c8901a');
        ln(sc, at(0, -2.5), at(0, 2.5), '#c8901a');
        ln(sc, at(1), tip, '#c8c0d0', 2);
        ln(se, at(2, -1), at(L - 1, -1), EL.fire[2]);
        for (let i = 0; i < 4; i++) {
          const a = 2.5 + i * (L - 3) / 4, h = 1 + ((fl + i) % 3 === 0 ? 2 : 1) + glow * 2, p0 = at(a, -1.5);
          for (let k = 0; k < h; k++) X.px(se, p0[0] + nx * -k * 0.9 + ux * k * 0.4, p0[1] + ny * -k * 0.9 + uy * k * 0.4, EL.fire[k === 0 ? 2 : k === 1 ? 1 : 0]);
        }
        X.px(se, tip[0], tip[1], EL.fire[0]);
        if (glow > 0.1) X.glow(se, tip[0], tip[1], 3 + glow * 4, EL.fire[2], 0.6 * glow);
        break;
      }
      case 'cold': {
        ln(sc, at(-7), at(L - 5), '#7a6450'); X.px(sc, ...at(-7), '#c8c0d0');
        X.px(se, ...at(L - 6.5), '#ee8cff');
        X.poly(sc, [at(L - 6, -1.8), tip, at(L - 6, 1.8), at(L - 7.5)], EL.cold[3]);
        ln(se, at(L - 6), tip, EL.cold[1]);
        X.px(se, tip[0], tip[1], '#ffffff');
        if ((fl % 5) < 2) X.px(se, ...at(L - 3, (fl % 2 ? 2.5 : -2.5)), EL.cold[1]);
        if (glow > 0.1) X.glow(se, tip[0], tip[1], 3 + glow * 4, EL.cold[2], 0.6 * glow);
        break;
      }
      case 'lightning': {
        ln(sc, at(-1), at(3), '#3a2a5a', 2); X.px(se, ...at(-1), EL.lightning[3]);
        const s0 = at(3), c = o.ctrl || [(s0[0] + tip[0]) / 2, (s0[1] + tip[1]) / 2 + 3];
        const n = Math.max(6, Math.ceil(L / 1.6));
        let prev = s0;
        for (let i = 1; i <= n; i++) {
          const k = i / n, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, cc = k * k;
          let x = a * s0[0] + b * c[0] + cc * tip[0], y = a * s0[1] + b * c[1] + cc * tip[1];
          if (i < n && rand(i, fl, 7) < 0.3) y += rand(i, fl, 8) < 0.5 ? -1 : 1;
          X.line(se, prev[0], prev[1], x, y, rand(i, fl, 9) < 0.25 ? EL.lightning[1] : EL.lightning[2 + (i % 2)]);
          prev = [x, y];
        }
        X.rect(se, tip[0] - 1, tip[1] - 1, 2, 2, '#ffffff');
        if (fl % 2) { X.px(se, tip[0] + 2, tip[1] - 1, EL.lightning[1]); X.px(se, tip[0] - 1, tip[1] + 2, EL.lightning[2]); }
        if (glow > 0.1) X.glow(se, tip[0], tip[1], 3 + glow * 4, EL.lightning[2], 0.7 * glow);
        break;
      }
      case 'arcane': {
        X.rect(sc, g[0] - 1, g[1] - 1, 2, 2, '#5a5068');
        const c = o.ctrl || [(g[0] + tip[0]) / 2, (g[1] + tip[1]) / 2 + 2];
        const n = Math.max(4, Math.ceil(L / 1.5));
        for (let i = 1; i <= n; i++) {
          const k = i / n, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, cc = k * k;
          const x = a * g[0] + b * c[0] + cc * tip[0], y = a * g[1] + b * c[1] + cc * tip[1];
          X.px(sc, x, y, i % 2 ? '#a89cb8' : '#5a5068');
          if (i % 4 === (fl % 4)) X.px(se, x, y, EL.arcane[2]);
        }
        // the barbed hook: the shank carries on to the tip, then curls back
        const h = (a, b) => [tip[0] + ux * a + nx * b, tip[1] + uy * a + ny * b];
        X.lines(sc, [h(-1, 0), h(1.5, 0), h(2.5, 1.6), h(1.8, 3.2), h(0, 3.4)], '#d8d0e0');
        X.px(sc, ...h(0.6, 2.4), '#d8d0e0');
        X.px(se, ...h(1.5, 0), EL.arcane[1]); X.px(se, ...h(0, 3.4), EL.arcane[2]);
        if (glow > 0.1) X.glow(se, tip[0], tip[1], 3 + glow * 4, EL.arcane[2], 0.7 * glow);
        break;
      }
      case 'earth': {
        const s = o.size || 1, a0 = 3.5 * s, b0 = 5.5 * s;
        ln(sc, at(-5), at(L - 2), '#5a3a24', 2);
        X.poly(sc, [at(L - a0, -b0), at(L + a0, -b0), at(L + a0, b0), at(L - a0, b0)], '#a08a62');
        X.poly(sc, [at(L - a0, -b0), at(L + a0, -b0), at(L + a0, -b0 * 0.4), at(L - a0, -b0 * 0.4)], '#d2b688');
        X.poly(sc, [at(L - a0, b0 * 0.5), at(L + a0, b0 * 0.5), at(L + a0, b0), at(L - a0, b0)], '#66503a');
        X.px(se, ...at(L, -1), '#ee8cff'); X.px(se, ...at(L, 2), '#d400ff'); X.px(se, ...at(L + 1, 0.5), '#ee8cff');
        if (glow > 0.1) X.glow(se, ...at(L), 4 + glow * 5, EL.earth[1], 0.6 * glow);
        break;
      }
      case 'water': {
        ln(sc, at(-8), at(L - 3), '#2e3c5c'); X.px(se, ...at(L - 3.5), '#ee8cff');
        const c0 = at(L - 4);
        let prev = null;
        for (let i = 0; i <= 8; i++) {
          const a = -1.5 + (i / 8) * 3.0, p = [c0[0] + ux * Math.cos(a) * 3.6 + nx * Math.sin(a) * 4.6, c0[1] + uy * Math.cos(a) * 3.6 + ny * Math.sin(a) * 4.6];
          if (prev) { X.line(sc, prev[0], prev[1], p[0], p[1], EL.water[3], 2); X.line(se, prev[0], prev[1], p[0], p[1], i % 3 === fl % 3 ? EL.water[0] : EL.water[1]); }
          prev = p;
        }
        X.px(se, ...at(L - 4 + 3.6), '#ffffff');
        if (fl % 4 === 0) X.px(se, ...at(L - 6, 6.5), EL.water[1]);
        if (glow > 0.1) X.glow(se, ...at(L), 3 + glow * 5, EL.water[2], 0.6 * glow);
        break;
      }
      case 'staff': {
        ln(sc, at(-7), tip, '#7a5034'); X.px(sc, ...at(-7), '#a8784a');
        X.rect(se, tip[0] - 1, tip[1] - 1, 3, 3, '#9a92b0'); X.px(se, tip[0], tip[1] - 1, '#ffffff');
        if (glow > 0.1) X.glow(se, tip[0], tip[1], 3 + glow * 3, '#d8d0ee', 0.5 * glow);
        break;
      }
      case 'life': break;   // hands: drawn by glowHand()
    }
  }
  // Healing hands: a green glow on a hand, with the violet cuff of the Sigil that made it
  function glowHand(se, h, t, k = 1) {
    X.glow(se, h[0], h[1], 3.5 + Math.sin(t * 6) * 0.6 + k * 1.5, EL.life[3], 0.85);
    X.rect(se, h[0] - 1, h[1] - 1, 2, 2, EL.life[1]); X.px(se, h[0], h[1] - 1, EL.life[0]);
    X.px(se, h[0] - 1, h[1] + 1, '#ee8cff');
  }
  // a weapon flying free (thrown, planted): centre (x, y), angle, length; drawn on one canvas
  function flatProp(c, W, x, y, ang, len, t, o = {}) {
    const ux = Math.cos(ang), uy = Math.sin(ang), g = [x - ux * len * 0.45, y - uy * len * 0.45], tip = [x + ux * len * 0.55, y + uy * len * 0.55];
    if (W.id !== 'lightning' && W.id !== 'arcane') X.line(c, g[0] - ux * 2, g[1] - uy * 2, tip[0] + ux, tip[1] + uy, '#120e1a', 3);
    prop(c, c, W, g, tip, Object.assign({ t }, o));
  }

  // ---------------------------------------------------------------------------
  // Keyframed poses
  const BASE = { hR: [3, 4, 9], p: 0.5, y: 0.3, fo: 0, st: 0, lm: 1, hide: 0, hL: null };
  const l3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  function mixPose(a, b, k) {
    return { hR: l3(a.hR, b.hR, k), p: lerp(a.p, b.p, k), y: lerp(a.y, b.y, k), fo: lerp(a.fo, b.fo, k), st: lerp(a.st, b.st, k), lm: lerp(a.lm, b.lm, k),
      hide: k < 1 ? a.hide : b.hide, hL: a.hL && b.hL ? l3(a.hL, b.hL, k) : k < 0.5 ? a.hL : b.hL };
  }
  function track(list) {
    const out = []; let cur = Object.assign({}, BASE);
    for (const [tk, part, e] of list) { cur = Object.assign({}, cur, part); out.push([tk, cur, e]); }
    return (t) => {
      if (t <= out[0][0]) return out[0][1];
      for (let i = 1; i < out.length; i++) if (t <= out[i][0]) {
        const [t0, a] = out[i - 1], [t1, b, e] = out[i];
        let k = (t - t0) / Math.max(1e-6, t1 - t0);
        k = e === 'lin' ? k : e === 'out' ? easeOut(k) : e === 'in' ? k * k : smooth(k);
        return mixPose(a, b, k);
      }
      return out[out.length - 1][1];
    };
  }
  const IDLE = { hR: [3, 4, 9], p: 0.5, y: 0.3 };

  // The six moves. hits = when a blow lands; sm = motion smear windows.
  const MOVES = {
    strike: { name: 'Strike', gesture: 'Shift+LMB tap ×3', uses: 1, dur: 2.6, hits: [0.42, 0.72, 1.22], sm: [[0.32, 0.46], [0.6, 0.76], [1.12, 1.3]],
      keys: [[0, {}], [0.18, {}], [0.32, { hR: [0.5, 5, 13], p: 1.3, y: 1.5 }], [0.42, { hR: [7.5, 1, 9], p: -0.05, y: -1.15 }, 'lin'], [0.6, { hR: [7, 0.5, 9], p: 0.05, y: -1.25 }],
        [0.72, { hR: [6.5, 5, 9.5], p: 0.2, y: 1.35 }, 'lin'], [0.98, { hR: [0, 3, 16], p: 2.05, y: 0.15 }], [1.12, { hR: [-0.5, 3, 17], p: 2.25 }],
        [1.22, { hR: [8.5, 2, 6], p: -0.6, y: 0.05 }, 'lin'], [1.65, {}], [2.2, IDLE]] },
    thrust: { name: 'Thrust', gesture: 'RMB tap', uses: 1, dur: 2.4, hits: [0.82], sm: [[0.7, 0.86]],
      keys: [[0, {}], [0.2, {}], [0.5, { hR: [-2.5, 4.5, 9.5], p: 0.04, y: 0.08 }], [0.7, { hR: [-3, 4.5, 9.5] }], [0.82, { hR: [11, 2, 9], p: 0, y: 0, st: 7 }, 'out'],
        [1.2, {}], [1.7, IDLE], [2.3, { st: 0 }]] },
    heavy: { name: 'Heavy', gesture: 'RMB hold, release', uses: 2, dur: 2.9, hits: [1.44], charge: [0.35, 1.3], sm: [[1.3, 1.5]],
      keys: [[0, {}], [0.15, {}], [0.45, { hR: [-0.5, 3, 16], p: 2.3, y: 0 }], [1.3, { hR: [-1.2, 3, 17], p: 2.5 }], [1.44, { hR: [9, 1.5, 4.5], p: -0.75, y: 0 }, 'lin'],
        [1.95, {}], [2.55, IDLE]] },
    sweep: { name: 'Sweep', gesture: 'Shift+RMB tap', uses: 2, dur: 2.7, spin: [0.95, 1.4], tell: [0.4, 0.92], sm: [[0.9, 1.46]], smDt: 0.02, smN: 12,
      keys: [[0, {}], [0.15, {}], [0.45, { hR: [-2, 5, 6], p: -0.35, y: 2.3 }], [0.85, {}], [0.95, { hR: [3, 6, 8], p: -0.05, y: 1.45 }, 'lin'], [1.4, { fo: -TAU }, 'lin'],
        [1.7, {}], [2.3, IDLE]] },
    send: { name: 'Send', gesture: 'Shift+RMB hold, release', uses: 2, dur: 3.2, hits: [1.0], throwAt: 0.72, land: 1.0, recall: 1.95, back: 2.25, sm: [[0.62, 0.76]],
      keys: [[0, {}], [0.15, {}], [0.4, { hR: [-2.5, 4, 15], p: 0.35, y: 0 }], [0.62, { hR: [-3, 4, 15.5] }], [0.72, { hR: [8, 2, 11], p: -0.1, y: 0 }, 'lin'], [0.73, { hide: 1 }],
        [1.1, { hR: [4, 4, 9], p: 0.3, y: 0.2 }], [1.85, {}], [1.97, { hR: [6, 3, 13], p: 0.6, y: 0 }], [2.24, {}], [2.25, { hide: 0 }], [2.8, IDLE]] },
    defend: { name: 'Defend', gesture: 'Space', uses: 0, dur: 2.8, hits: [1.05, 1.36], sm: [[1.22, 1.4]],
      keys: [[0, {}], [0.15, {}], [0.4, { hR: [6, 2.5, 10], p: 1.35, y: -0.3 }], [1.0, { hR: [6, 2.5, 10.5] }], [1.08, { hR: [7, 2, 11.5], p: 1.0, y: 0.5 }, 'out'],
        [1.22, { hR: [2, 4, 13], p: 1.6, y: 0.9 }], [1.36, { hR: [9.5, 1.5, 8], p: -0.1, y: -0.4 }, 'lin'], [1.8, {}], [2.4, IDLE]] },
  };
  const MOVE_IDS = ['strike', 'thrust', 'heavy', 'sweep', 'send', 'defend'];

  // Per-weapon pose overrides (where the doc gives the move a different shape)
  const POKES = [[0, {}], [0.18, {}], [0.32, { hR: [0, 4.5, 9.5], p: 0.05, y: 0.05 }], [0.42, { hR: [8.5, 2.5, 9], p: 0, y: 0 }, 'out'], [0.6, { hR: [0, 4.5, 9.5] }],
    [0.72, { hR: [8.5, 2.5, 9] }, 'out'], [1.0, { hR: [-2.5, 4.5, 10] }], [1.12, { hR: [-3, 4.5, 10] }], [1.22, { hR: [11, 2, 9], st: 3 }, 'out'], [1.65, {}], [2.2, Object.assign({ st: 0 }, IDLE)]];
  const OVERRIDE = {
    'lightning-strike': { keys: [[0, {}], [0.18, {}], [0.32, { hR: [-1, 4, 14], p: 1.9, y: 0.2 }], [0.42, { hR: [8, 2, 10], p: 0.02, y: 0 }, 'lin'], [0.6, { hR: [7, 2.5, 10], p: 0.1 }],
      [0.64, { hR: [-1, 4, 14], p: 1.9, y: 0.2 }], [0.72, { hR: [8, 2, 10], p: 0.02, y: 0 }, 'lin'], [1.0, { hR: [-1.5, 4, 15], p: 2.1, y: 0.3 }], [1.12, { hR: [-2, 4, 15.5], p: 2.2 }], [1.22, { hR: [9, 2, 10], p: 0.0, y: 0 }, 'lin'], [1.65, {}], [2.2, IDLE]] },
    'cold-strike': { keys: POKES },
    'cold-heavy': { keys: [[0, {}], [0.15, {}], [0.45, { hR: [-3, 4.5, 10], p: 0.05, y: 0.05 }], [1.3, { hR: [-3.5, 4.5, 10] }], [1.44, { hR: [11, 2, 9], p: 0, y: 0, st: 14 }, 'lin'], [1.62, { st: 34 }, 'out'],
      [2.0, IDLE], [2.75, { st: 0 }]] },
    'cold-sweep': { keys: MOVES.sweep.keys.map(([tk, p, e]) => [tk, Object.assign({}, p, tk >= 0.45 && tk < 2.3 ? { lm: 0.55 } : { lm: 1 }), e]) },
    'cold-defend': { keys: [[0, {}], [0.15, {}], [0.45, { hR: [3, 3.5, 6.5], p: 0.32, y: 0 }], [1.05, {}], [1.12, { hR: [3.5, 3.5, 6.8] }], [1.9, {}], [2.45, IDLE]] },
    'earth-thrust': { keys: [[0, {}], [0.2, {}], [0.5, { hR: [-1, 4, 9], p: 1.2, y: -0.6 }], [0.7, {}], [0.82, { hR: [2.5, 3, 9.5], p: 1.1, y: -0.7, st: 9 }, 'out'], [1.2, {}], [1.7, IDLE], [2.3, { st: 0 }]] },
    'earth-defend': { keys: [[0, {}], [0.15, {}], [0.45, { hR: [6, 2.5, 9], p: -1.25, y: 0 }], [2.0, {}], [2.5, IDLE]] },
    'staff-defend': { keys: [[0, {}], [0.15, {}], [0.4, { hR: [5, 4, 7], p: 0.75, y: -0.9, hL: [6.5, 0.5, 12] }], [1.05, {}], [1.12, { hR: [7, 4, 7.5], hL: [8.5, 0.5, 12.5] }, 'out'], [1.4, { hR: [5, 4, 7], hL: [6.5, 0.5, 12] }], [1.9, {}], [2.45, Object.assign({ hL: [1.5, -4.2, 7.5] }, IDLE)]] },
    'staff-send': { keys: [[0, {}], [0.15, {}], [0.4, { hR: [-1, 4, 12], p: 0.4, y: 0 }], [0.62, {}], [0.74, { hR: [9, 2, 12], p: 0.08, y: 0 }, 'out'], [1.7, {}], [2.3, IDLE]] },
    'lightning-send': { keys: [[0, {}], [0.15, {}], [0.4, { hR: [-2.5, 4, 15], p: 0.35, y: 0 }], [0.62, {}], [0.72, { hR: [9, 2, 11], p: -0.05, y: 0 }, 'lin'], [2.7, { hR: [8.5, 2.2, 11] }], [3.0, IDLE]] },
    'fire-send': { keys: [[0, {}], [0.15, {}], [0.4, { hR: [-2.5, 4, 15], p: 0.35, y: 0 }], [0.62, { hR: [-3, 4, 15.5] }], [0.72, { hR: [8, 2, 11], p: -0.1, y: 0 }, 'lin'], [0.73, { hide: 1 }],
      [1.1, { hR: [6, 3, 12], p: 0.4, y: 0.2 }], [1.54, {}], [1.55, { hide: 0 }], [2.2, IDLE]] },
    'arcane-thrust': { keys: [[0, {}], [0.2, {}], [0.5, { hR: [-2.5, 4.5, 10.5], p: 0.1, y: 0.08 }], [0.7, {}], [0.76, { hR: [10, 2, 10], p: 0, y: 0 }, 'out'], [0.77, { hide: 1 }], [1.0, {}], [1.3, { hR: [2, 4, 10] }], [1.31, { hide: 0 }], [1.8, IDLE]] },
    'arcane-heavy': { keys: [[0, {}], [0.15, {}], [0.45, { hR: [-0.5, 3, 16], p: 2.3, y: 0 }], [1.3, { hR: [-1.2, 3, 17], p: 2.5 }], [1.44, { hR: [10, 2, 10], p: 0, y: 0 }, 'lin'], [1.45, { hide: 1 }], [1.7, {}], [2.35, { hR: [2, 4, 10] }], [2.36, { hide: 0 }], [2.75, IDLE]] },
    'arcane-send': { keys: [[0, {}], [0.15, {}], [0.4, { hR: [-2.5, 4, 15], p: 0.35, y: 0 }], [0.62, {}], [0.72, { hR: [9, 2, 12], p: 0.1, y: 0 }, 'lin'], [0.73, { hide: 1 }], [1.1, {}], [1.5, { st: 52 }, 'in'], [1.55, { hide: 0 }], [2.0, Object.assign({}, IDLE, { st: 52 })]] },
    'life-defend': { keys: [[0, {}], [0.15, {}], [0.45, { hR: [3.5, 1.2, 10.5], hL: [3.5, -1.2, 10.5] }], [2.2, {}], [2.6, Object.assign({ hL: null }, IDLE)]] },
  };
  // the life (hands) weapon mirrors the left hand unless a pose sets it
  function keysFor(W, mv) { const o = OVERRIDE[W.id + '-' + mv]; return (o && o.keys) || MOVES[mv].keys; }

  // ---------------------------------------------------------------------------
  // local frame helpers (match actors.js: face 0 = east, r to the right of facing, u up)
  const dirOf = (p, y) => [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
  const rotU = (v, d) => [v[0] * Math.cos(d) - v[1] * Math.sin(d), v[0] * Math.sin(d) + v[1] * Math.cos(d), v[2]];
  // world (stage) point of a local point on an actor at (x, y) facing `face`, ignoring squash
  function world(s, v) {
    const cs = Math.cos(s.face), sn = Math.sin(s.face), fx = v[0] * cs - v[1] * sn, fy = v[0] * sn + v[1] * cs;
    return [s.x + fx, s.y - (s.z || 0) + fy * FY - v[2] * CU];
  }
  function leftHand(W, p, hR, d, bob, o) {
    if (o.guard) return l3([2, -3.6, 8 + bob], [6.5, 0.2, 10.5 + bob], o.guard.k || 0);
    if (p.hL) return [p.hL[0], p.hL[1], p.hL[2] + bob];
    if (W.id === 'life') return [hR[0] - 0.5, -Math.abs(hR[1]) * 0.6 - 0.8, hR[2]];
    if (W.hands === 'two') return [hR[0] - d[0] * 5, hR[1] - d[1] * 5 - 0.4, hR[2] - d[2] * 5];
    return [1.5, -4.2, 7.5 + bob];
  }
  // Make an actor rig from a pose function. o: { guard: { id, k }, glow(t), size, hidden }
  function rig(W, poseAt, t, o = {}) {
    const mv = o.move ? MOVES[o.move] : null, sm = (o.sm || (mv && mv.sm) || []);
    return (tt, bob) => {
      const p = poseAt(t), d = dirOf(p.p, p.y), len = W.len * p.lm * (o.size || 1);
      const hR = [p.hR[0], p.hR[1], p.hR[2] + bob], hL = leftHand(W, p, hR, d, bob, o);
      const tipOf = (q) => {
        const dd = q.fo - p.fo, h = rotU([q.hR[0] + (q.st - p.st), q.hR[1], q.hR[2] + bob], dd), dq = rotU(dirOf(q.p, q.y), dd);
        return [h[0] + dq[0] * len, h[1] + dq[1] * len, h[2] + dq[2] * len];
      };
      const tipL = [hR[0] + d[0] * len, hR[1] + d[1] * len, hR[2] + d[2] * len];
      return {
        hR, hL, noStaff: true, rFront: W.hands === 'two', lFront: !!(o.guard && o.guard.k > 0.5),
        drawR(sc, se, P, out) {
          const g = P(...hR), tip = P(...tipL);
          out.wgrip = g; out.wtip = tip;
          // motion smear: the tip's path over the last few samples, white to the element colour
          const win = sm.find(([a, b]) => t >= a && t <= b);
          if (win && !p.hide && !(o.hidden && o.hidden(t))) {
            const n = (mv && mv.smN) || 9, dt = (mv && mv.smDt) || 0.012, R = W.R;
            let prev = tip;
            for (let j = 1; j <= n; j++) {
              const tj = t - j * dt; if (tj < win[0] - 0.02) break;
              const q = P(...tipOf(poseAt(tj)));
              X.line(se, prev[0], prev[1], q[0], q[1], j < 3 ? '#ffffff' : j < 6 ? R[1] : R[2], j < 5 ? 2 : 1);
              prev = q;
            }
          }
          if (W.id === 'life') { glowHand(se, g, t, o.glow ? o.glow(t) : 0); return; }
          if (p.hide || (o.hidden && o.hidden(t))) return;
          let ctrl = null;
          if (W.id === 'lightning' || W.id === 'arcane') {
            const q = P(...tipOf(poseAt(t - 0.07)));
            ctrl = [lerp(g[0], q[0], 0.7), lerp(g[1], q[1], 0.7) + 2.5];
          }
          prop(sc, se, W, g, tip, { t, glow: o.glow ? o.glow(t) : 0, ctrl, size: o.size });
        },
        drawL(sc, se, P, out) {
          const h = P(...hL); out.lhand = h;
          if (W.id === 'life') glowHand(se, h, t + 0.3, o.glow ? o.glow(t) : 0);
          if (o.guard) { const gp = o.guard.id === 'prism' ? P(hL[0] + 3, hL[1], hL[2] + 2 + Math.sin(t * 3) * 0.8) : h; out.guard = gp; guard(sc, se, o.guard.id, gp[0], gp[1], o.guard.k || 0, t, o.guard); }
        },
      };
    };
  }

  // ---------------------------------------------------------------------------
  // The eight guards (section 3: the lead element picks the block behaviour)
  const GUARDS = [
    { id: 'mirror', name: 'Mirror buckler', q: ['shield'], el: 'shield', silhouette: 'Small polished disc with a bright glint',
      block: 'A parry (tap Space as the shot lands) sends the shot back. Shield alone is the mirror.', bash: 'Shove', hp: 'Medium' },
    { id: 'bulwark', name: 'Bulwark', q: ['shield', 'earth'], el: 'earth', silhouette: 'Tall stone slab',
      block: 'Wide arc, high HP, blocks melee too; you walk slowly while blocking. Send plants it as free-standing cover.', bash: 'Knockdown bash', hp: 'High' },
    { id: 'ember', name: 'Ember targe', q: ['shield', 'fire'], el: 'fire', silhouette: 'Round, spiked, a burning rim',
      block: 'Thorns: melee attackers who hit it catch fire. Blocked fire shots don’t damage it.', bash: 'Ignites', hp: 'Medium' },
    { id: 'rime', name: 'Rime kite', q: ['shield', 'cold'], el: 'cold', silhouette: 'Angular faceted ice, frost trailing from it',
      block: 'Blocking frosts the floor in front of you, so chargers slip and slow. Melee attackers are chilled.', bash: 'Chills', hp: 'Medium' },
    { id: 'spark', name: 'Spark ring', q: ['shield', 'lightning'], el: 'lightning', silhouette: 'A hollow, crackling ring',
      block: 'Counter-discharge: a parry doesn’t reflect, it sends a chain arc to the nearest enemies and stuns casters. Lowest HP of all.', bash: 'Shock', hp: 'Lowest' },
    { id: 'tide', name: 'Tide shield', q: ['shield', 'water'], el: 'water', silhouette: 'A standing disc of water that ripples on every hit',
      block: 'Absorb and shove: blocked hits push the attacker back and soak them. Barely loses HP to fire.', bash: 'Soak and push', hp: 'Medium' },
    { id: 'prism', name: 'Prism pane', q: ['shield', 'arcane'], el: 'arcane', silhouette: 'A hexagonal pane floating in front of you',
      block: 'Beam bender: the only guard that blocks beams, and a blocked beam bends off to the side.', bash: 'Burst', hp: 'Medium' },
    { id: 'leaf', name: 'Leaf aegis', q: ['shield', 'life'], el: 'life', silhouette: 'A broad, leaf-shaped green shield with a glow behind it',
      block: 'Cover healing: allies directly behind you heal slowly while you block. A support guard.', bash: 'Shove only (never heals through a bash)', hp: 'Medium' },
  ];
  // draw a guard centred at (x, y). k = how far it is raised (0 carried, 1 blocking).
  // o: { hit (0..1 flash), size }
  function guard(sc, se, id, x, y, k, t, o = {}) {
    const hit = o.hit || 0, fl = Math.floor(t * 14), sz = (o.size || 1) * (0.8 + 0.2 * k);
    const ell = (c, rx, ry, col, a) => X.ellipse(c, x, y, rx * sz, ry * sz, col, a);
    switch (id) {
      case 'mirror': {
        ell(sc, 3.6, 4, '#6a4a10'); ell(sc, 3, 3.4, '#c8901a'); ell(sc, 2.2, 2.6, '#ffe68a');
        X.px(se, x - 1, y - 1, '#ffffff'); X.px(se, x, y - 2, '#ffffff');
        if (fl % 6 === 0 || hit > 0.2) { X.px(se, x - 1, y - 3, '#ffffff'); X.px(se, x - 2, y - 1, '#ffffff'); X.px(se, x + 1, y - 1, '#fffbe0'); }
        break;
      }
      case 'bulwark': {
        const w = 4 * sz, h = 8 * sz;
        X.rect(sc, x - w - 1, y - h - 1, w * 2 + 3, h * 2 + 3, '#1a120c');
        X.rect(sc, x - w, y - h, w * 2 + 1, h * 2 + 1, '#7a6450');
        X.rect(sc, x - w, y - h, w * 2 + 1, 2, '#b8946a'); X.rect(sc, x - w, y - h, 2, h * 2 + 1, '#a88a68');
        X.rect(sc, x - w, y + h - 1, w * 2 + 1, 2, '#4e3c2c');
        X.line(sc, x - 1, y - h + 4, x + 2, y + 1, '#4e3c2c'); X.line(sc, x + 2, y + 1, x, y + h - 3, '#4e3c2c');
        X.px(se, x - 2, y - 2, '#ee8cff'); X.px(se, x + 2, y + 3, '#d400ff');
        break;
      }
      case 'ember': {
        ell(sc, 4.6, 4.8, '#3a1a14'); ell(sc, 3.6, 3.8, '#6a3424'); ell(sc, 1.4, 1.5, '#c8c0d0');
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; X.px(sc, x + Math.cos(a) * 5.4 * sz, y + Math.sin(a) * 5.6 * sz, '#c8c0d0'); }
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = 4.2 * sz, px2 = x + Math.cos(a) * r, py2 = y + Math.sin(a) * r * 1.05; X.px(se, px2, py2, EL.fire[(i + fl) % 3 + 1]); if (a > Math.PI * 1.1 && a < Math.PI * 1.9 && (i + fl) % 3 === 0) X.px(se, px2, py2 - 1 - (fl % 2), EL.fire[1]); }
        if (hit > 0.1) X.glow(se, x, y, 7, EL.fire[2], hit);
        break;
      }
      case 'rime': {
        const P = (a, b) => [x + a * sz, y + b * sz];
        X.poly(sc, [P(-4.5, -4), P(4.5, -4), P(3.5, 1), P(0, 7), P(-3.5, 1)].map(([a, b]) => [a, b]), '#163e7a');
        X.poly(sc, [P(-3.6, -3.2), P(3.6, -3.2), P(2.8, 0.8), P(0, 5.8), P(-2.8, 0.8)], EL.cold[3]);
        X.poly(sc, [P(-3.6, -3.2), P(0, -3.2), P(0, 5.8), P(-2.8, 0.8)], EL.cold[2]);
        X.line(se, ...P(-3, -3.2), ...P(3, -3.2), '#ffffff'); X.px(se, ...P(-1, -1), '#ffffff');
        if (fl % 3 === 0) X.px(se, ...P(-5, 2 + (fl % 4)), EL.cold[1]);
        break;
      }
      case 'spark': {
        X.ring(se, x, y, 4.2 * sz, 4.5 * sz, EL.lightning[3]); X.ring(se, x, y, 3.4 * sz, 3.7 * sz, EL.lightning[2]);
        for (let i = 0; i < 5; i++) { const a = rand(i, fl, 3) * TAU; X.px(se, x + Math.cos(a) * 4.8 * sz, y + Math.sin(a) * 5 * sz, i % 2 ? '#ffffff' : EL.lightning[1]); }
        if (hit > 0.1) X.glow(se, x, y, 8, EL.lightning[2], hit);
        break;
      }
      case 'tide': {
        ell(se, 4.8, 5.2, EL.water[3], 0.9); ell(se, 3.8, 4.2, EL.water[2], 0.9);
        const rr = 1.5 + ((t * 3 + hit * 2) % 1) * 3; X.ring(se, x, y, rr * sz, rr * 1.1 * sz, EL.water[0], 0.9);
        X.px(se, x - 2, y - 3, '#ffffff');
        if (hit > 0.1) X.ring(se, x, y, 5.5 + (1 - hit) * 3, 6 + (1 - hit) * 3, EL.water[1], hit);
        break;
      }
      case 'prism': {
        const pts = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; pts.push([x + Math.cos(a) * 5 * sz, y + Math.sin(a) * 5.6 * sz]); }
        X.poly(se, pts, EL.arcane[3], 0.55); X.lines(se, pts.concat([pts[0]]), EL.arcane[1]);
        X.line(se, pts[3][0] + 1, pts[3][1], pts[0][0] - 1, pts[0][1], '#ffffff');
        const hue = ['#ff6a6a', '#ffe070', '#6aff9a', '#6ab0ff'][fl % 4]; X.px(se, x + 2, y - 2, hue);
        break;
      }
      case 'leaf': {
        X.glow(se, x - 1, y, 7, EL.life[3], 0.4);
        const P = (a, b) => [x + a * sz, y + b * sz];
        X.poly(sc, [P(0, -7), P(4, -3), P(4.5, 2), P(0, 7.5), P(-4.5, 2), P(-4, -3)], '#0e3a1e');
        X.poly(sc, [P(0, -6), P(3.2, -2.6), P(3.6, 1.8), P(0, 6.4), P(-3.6, 1.8), P(-3.2, -2.6)], EL.life[3]);
        X.poly(sc, [P(0, -6), P(0, 6.4), P(-3.6, 1.8), P(-3.2, -2.6)], EL.life[2]);
        X.line(sc, ...P(0, -5), ...P(0, 6), '#9af07a');
        X.px(se, ...P(-2, -2), EL.life[0]);
        break;
      }
    }
  }

  Object.assign(WM, { WEAPONS, GUARDS, MOVES, MOVE_IDS, RAMP, prop, flatProp, glowHand, track, keysFor, rig, guard, world, dirOf, IDLE });
})();
