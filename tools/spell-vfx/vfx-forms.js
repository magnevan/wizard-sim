/* Spell VFX vignettes, group 1: the seven plain forms × Force / Area / Place.
 * Each vignette: { id, group, q (queue), cast, opts, dur, ground, seed, frame(t, K) }.
 * Titles and descriptions come from rules-c.js at runtime; `line` overrides the caption. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit } = PB, X = PB.px, EL = X.EL;
  PB.VFX = PB.VFX || [];
  const add = (d) => PB.VFX.push(d);

  // ---- shared vignette helpers (also used by the later groups) ----
  // fade an actor in at the loop start and out at its end, so knocked-down bodies reset cleanly
  K.life = (t, D, a = 0.22, b = 0.3) => Math.min(seg(t, 0, a), 1 - seg(t, D - b, D));
  K.kb = (t, t0, dist, dur = 0.35) => dist * easeOut(seg(t, t0, t0 + dur));
  // knocked down at t0, back up by t1 (0 = standing, 0.85 = flat)
  K.down = (t, t0, t1 = 99) => 0.85 * Math.min(smooth(seg(t, t0, t0 + 0.25)), 1 - smooth(seg(t, t1, t1 + 0.35)));
  K.hop = (t, t0, h = 8, dur = 0.4) => { const e = (t - t0) / dur; return e > 0 && e < 1 ? h * 4 * e * (1 - e) : 0; };
  K.flash = (t, t0) => (t >= t0 && t < t0 + 0.25 ? 1 - (t - t0) / 0.25 : 0);
  K.walk = (t, spd = 1) => ({ spd, ph: t * 9 * spd });
  // a small health bar over a body, v = 0..1
  K.hp = (c, A, s, v) => { const a = A[s.id]; if (!a || !a.head) return; const x = Math.round(a.head[0]) - 7, y = Math.round(a.head[1]) - 10; X.rect(c, x - 1, y - 1, 16, 4, '#120e1a'); X.rect(c, x, y, 14, 2, '#5a1a24'); X.rect(c, x, y, Math.round(14 * v), 2, v > 0.5 ? '#5fe07a' : v > 0.25 ? '#e6c84a' : '#e05a5a'); };
  // a soft blob on the ground: puddles, floods, ice sheets, patches
  K.blobPts = (x, y, rx, ry, seed = 0, n = 28) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 1 + Math.sin(a * 3 + seed) * 0.1 + Math.sin(a * 5 + seed * 2) * 0.07; p.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]); } return p; };
  K.puddle = (c, x, y, rx, k, t, seed = 1, ripples = true) => {
    if (k <= 0.02) return;
    const ry = rx * FY * 0.62;
    X.poly(c, K.blobPts(x, y, rx * k, ry * k, seed), '#18325a', k > 0.97 ? 1 : k);
    X.poly(c, K.blobPts(x, y - 1, rx * k * 0.86, ry * k * 0.86, seed), '#204a80', k > 0.97 ? 1 : k);
    X.line(c, x - rx * 0.4 * k, y - ry * 0.4 * k, x - rx * 0.1 * k, y - ry * 0.5 * k, '#5aa8e8');
    if (ripples) for (let i = 0; i < 2; i++) { const e = PB.mod(t * 0.7 + i / 2, 1); X.ring(c, x - rx * 0.3 + i * rx * 0.5, y + i * 2 - 1, 2 + e * rx * 0.4, (2 + e * rx * 0.4) * 0.4, '#5aa8e8', (1 - e) * 0.8 * k); }
  };
  K.ice = (c, x, y, rx, k, front, seed = 1) => {
    if (k <= 0.02) return;
    const ry = rx * FY * 0.62;
    c.save(); c.beginPath(); c.rect(0, 0, front, 200); c.clip();
    X.poly(c, K.blobPts(x, y, rx * 1.03, ry * 1.03, seed), '#7ab8d4'); X.poly(c, K.blobPts(x, y - 1, rx * 0.86, ry * 0.86, seed), '#b4e4f4');
    for (let i = 0; i < 7; i++) { const x0 = x + (rand(i, 71, seed) - 0.5) * rx * 1.4, y0 = y + (rand(i, 72, seed) - 0.5) * ry * 1.1; X.line(c, x0, y0, x0 + 4 + rand(i, 73) * 5, y0, '#ffffff'); }
    for (let i = 0; i < 4; i++) { const x0 = x + (rand(i, 81, seed) - 0.5) * rx * 1.2, y0 = y + (rand(i, 82, seed) - 0.5) * ry; X.lines(c, [[x0, y0], [x0 + 3, y0 + 2], [x0 + 7, y0 + 1]], '#5a90b0'); }
    c.restore(); c._fs = null;
  };
  // standard cast rhythm: prep 0.05..c0, cast c0..c1
  const ME = { x: 46, y: 72 };
  const caster = (t, el, c0, c1, o = {}) => K.wiz(Object.assign({ id: 'me', team: 'p1', x: ME.x, y: ME.y, face: 0, el, seed: 3 }, K.pose(t, 0.05, c0, c1), o));
  const ally = (o = {}) => K.wiz(Object.assign({ id: 'ally', team: 'p2', x: 30, y: 98, face: -0.3, el: 'water', seed: 7 }, o));
  K.caster = caster; K.ally = ally; K.ME = ME;

  // =========================================================================
  // EARTH: Rock, Earthquake, Geyser
  add({ id: 'earth-force', group: 'forms', q: ['earth', 'earth'], cast: 'force', dur: 3, ground: 'path', seed: 2,
    line: 'Hold to charge, let go to throw. A full charge carries the first body with it.',
    frame(t, K) {
      const D = 3, c0 = 0.95, hit = 1.2, me = caster(t, 'earth', c0, 1.15, { prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 }), L = K.life(t, D);
      const carry = K.kb(t, hit, 26, 0.45);
      const g1 = K.gob({ id: 'g1', x: 132 + carry, y: 70, face: Math.PI, seed: 1, flash: K.flash(t, hit), dead: K.down(t, hit + 0.3), z: K.hop(t, hit, 5, 0.45), alpha: L });
      const g2 = K.gob({ id: 'g2', x: 150, y: 90, face: Math.PI, seed: 2, alpha: 1 });
      const g3 = K.gob({ id: 'g3', x: 156, y: 56, face: Math.PI + 0.3, seed: 3, alpha: 1 });
      const fly = seg(t, c0, hit), from = [ME.x + 8, ME.y - 22], to = [131, 61];
      let rp = null; if (t >= c0 && t < hit) rp = [lerp(from[0], to[0], fly), lerp(from[1], to[1], fly) - Math.sin(fly * Math.PI) * 4];
      else if (t >= hit && t < 2.4) { const e = seg(t, hit, hit + 0.45); rp = [131 + carry, 61 + 9 * easeOut(e) - K.hop(t, hit + 0.45, 4, 0.3)]; }
      const charge = smooth(seg(t, 0.3, 0.9));
      return {
        actors: [me, g1, g2, g3], shake: t > hit && t < hit + 0.2 ? 2 : 0,
        under(c) { if (t > hit) K.scorch(c, 131 + carry, 72, 7, 0.4 * (1 - seg(t, 2.4, 3))); if (rp && t < hit) X.ellipse(c, rp[0], 72 - (72 - ME.y) * (1 - fly), 3, 1.5, 'rgba(8,6,16,0.5)'); },
        lights: rp ? [[rp[0], rp[1] + 10, 26, '#b8946a', 0.4]] : [],
        fx(c, A) {
          const ch = A.me.charge;
          if (t < c0 && t > 0.3) {
            // the charge: a rock grows at the staff, pebbles spiral in
            K.rock(c, ch[0], ch[1] + 2, 1.5 + charge * 4, 4);
            for (let i = 0; i < 6; i++) { const a = t * 9 + i, r = 9 - charge * 5; X.px(c, ch[0] + Math.cos(a) * r, ch[1] + 2 + Math.sin(a) * r * 0.7, i % 2 ? '#b8946a' : '#e0c8a0'); }
            if (charge > 0.98 && Math.floor(t * 12) % 2) X.ring(c, ch[0], ch[1] + 2, 7, 6, '#ffffff', 0.9);
          }
          K.prep(c, me, A, t, ['earth', 'earth'], 0.05, 0.35);
          if (rp) {
            if (t < hit) for (let j = 1; j <= 4; j++) X.px(c, rp[0] - j * 4, rp[1] + j * 0.5, j < 2 ? '#e0c8a0' : '#8a6a48');
            K.rock(c, rp[0], rp[1], 5.5, 4);
          }
          K.dust(c, 132, 70, t - hit, 5, 9, 18, '#8a7a68', 0.9);
          K.debris(c, 132, 66, t - hit, 6, 10, 45);
          K.dust(c, 131 + carry, 72, t - hit - 0.45, 9, 6, 12, '#7a6a5a', 0.8);
          if (t > hit && t < hit + 0.06) X.ellipse(c, 132, 62, 9, 8, '#ffffff');
        },
      };
    } });

  add({ id: 'earth-area', group: 'forms', q: ['earth'], cast: 'area', dur: 3, ground: 'plaza', seed: 3,
    frame(t, K) {
      const D = 3, c0 = 0.6, me = caster(t, 'earth', c0, 0.9), L = K.life(t, D);
      const R = (e) => 4 + 76 * easeOut(clamp(e, 0, 1));
      const front = R((t - c0) / 0.75);
      const hitAt = (x, y) => { const d = Math.hypot(x - ME.x, (y - ME.y) / FY); for (let k = 0; k < 40; k++) { const tt = c0 + k * 0.02; if (R((tt - c0) / 0.75) >= d) return tt; } return 99; };
      const mkG = (id, x, y, seed, kind = 'gob') => { const th = hitAt(x, y); return K[kind]({ id, x, y, face: Math.PI, seed, flash: K.flash(t, th) * 0.6, dead: K.down(t, th, th + 1.1), z: K.hop(t, th, 5, 0.3), alpha: L }); };
      const en = [mkG('g1', 104, 60, 1), mkG('g2', 112, 88, 2), mkG('b1', 140, 70, 4, 'brute'), mkG('g3', 92, 100, 3)];
      const ally1 = ally({ x: 22, y: 60, face: 0.2, dead: K.down(t, hitAt(22, 60), hitAt(22, 60) + 1.1), alpha: L });
      return {
        actors: [me, ally1, ...en], shake: t > c0 && t < c0 + 0.5 ? 2 * (1 - (t - c0) / 0.5) : 0,
        under(c) {
          if (t > c0) { K.cracks(c, ME.x, ME.y, 34, 5, seg(t, c0, c0 + 0.4), '#1a120c', 9); X.ellipse(c, ME.x, ME.y, 12, 6, 'rgba(26,18,12,0.5)'); }
          if (t > c0 && t < c0 + 1) { const a = 1 - seg(t, c0 + 0.5, c0 + 1); K.gring(c, ME.x, ME.y, front, '#553e2a', a, 3); K.gring(c, ME.x, ME.y, front + 1, '#b8946a', a, 1); }
        },
        lights: t > c0 && t < c0 + 0.6 ? [[ME.x, ME.y, front + 10, '#d8b88a', 0.5 * (1 - seg(t, c0, c0 + 0.6))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['earth'], 0.05, c0);
          if (t > c0 && t < c0 + 1) {
            const e = (t - c0) / 1, a = 1 - seg(e, 0.5, 1);
            // the heaving front: a lit ridge of turned earth with stones popping up
            K.gring(c, ME.x, ME.y, front, K.ROCK[1], a, 2); K.gring(c, ME.x, ME.y, front - 2, K.ROCK[3], a, 2); K.gring(c, ME.x, ME.y, front + 1, K.ROCK[0], a * 0.7, 1);
            for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU + rand(i, 2) * 0.2, x = ME.x + Math.cos(a) * front, y = ME.y + Math.sin(a) * front * FY; K.puff(c, x, y - 2 - e * 4, 2 + e * 3, i % 2 ? '#8a7a68' : '#6a5a4a', 1 - e); if (i % 3 === 0 && e < 0.5) X.rect(c, x, y - 4 - Math.sin(e * 9) * 4, 2, 2, '#977552'); }
          }
          for (const s of en) if (s.dead > 0.6 && Math.floor(t * 5) % 2) { const a = A[s.id]; if (a && a.head) for (let k = 0; k < 3; k++) { const ang = t * 6 + k * 2.1; X.px(c, a.head[0] + Math.cos(ang) * 4, a.head[1] - 3 + Math.sin(ang) * 2, '#ffe070'); } }
        },
      };
    } });

  add({ id: 'earth-place', group: 'forms', q: ['earth'], cast: 'place', dur: 3.2, ground: 'grass', seed: 4,
    frame(t, K) {
      const D = 3.2, c0 = 0.55, er = 1.15, me = caster(t, 'earth', c0, 0.8), L = K.life(t, D), P = [132, 74];
      const g1 = K.gob({ id: 'g1', x: 134, y: 76, face: Math.PI, seed: 1, z: K.hop(t, er, 34, 0.9), flash: K.flash(t, er), dead: K.down(t, er + 0.85), alpha: L, noShadow: false });
      const g2 = K.gob({ id: 'g2', x: 160, y: 62, face: Math.PI, seed: 2, alpha: 1 });
      const g3 = K.gob({ id: 'g3', x: 104, y: 96, face: Math.PI - 0.3, seed: 3, flash: K.flash(t, er + 0.05) * 0.5, x2: 0, alpha: 1 });
      g3.x -= K.kb(t, er, 8, 0.3);
      const stand = [];
      const e = t - er;
      if (e > 0 && e < 1.5) for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rand(i, 31) * 0.5, r = 3 + rand(i, 32) * 9, x = P[0] + Math.cos(a) * r, y = P[1] + Math.sin(a) * r * FY;
        const h = (8 + rand(i, 33) * 10) * easeOut(seg(e, 0, 0.07 + i * 0.01)) * (1 - seg(e, 1.0, 1.45)); if (h < 1) continue;
        const lean = Math.cos(a) * 3, w = 3 + rand(i, 34) * 1.5;
        stand.push([y, (c, E) => E.op((cc) => { const tip = [x + lean + 0.5, y - h]; X.poly(cc, [[x - w - 1, y + 1], [x + w + 1, y + 1], [tip[0] + 1, tip[1] - 1], [tip[0] - 1, tip[1] - 1]], '#1a120c'); X.poly(cc, [[x - w, y], [x + w, y], tip], K.ROCK[3]); X.poly(cc, [[x - w, y], [x - w * 0.1, y], [tip[0] - 0.5, tip[1] + 1]], K.ROCK[1]); X.rect(cc, x - w, y - 1, w * 2, 2, K.ROCK[5]); })]);
      }
      return {
        actors: [me, g1, g2, g3], stand, shake: e > 0 && e < 0.35 ? 2.5 * (1 - e / 0.35) : (t > c0 + 0.1 && t < er ? 0.6 : 0),
        under(c) {
          if (t > c0 - 0.4 && t < er) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (t > c0 && t < er + 0.1) { const k = seg(t, c0, er); K.cracks(c, P[0], P[1], 16, 7, k, '#1a120c', 7); K.gring(c, P[0], P[1], 16 - k * 4, '#8a6a48', 0.5 + 0.5 * k, 1); }
          if (e > 0) { K.scorch(c, P[0], P[1], 13, 0.6 * (1 - seg(t, D - 0.5, D))); K.cracks(c, P[0], P[1], 18, 7, 1, '#1a120c', 7); }
        },
        lights: e > 0 && e < 0.8 ? [[P[0], P[1], 70, '#e0c8a0', 0.9 * (1 - e / 0.8)]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['earth'], 0.05, c0);
          if (t > c0 && t < er) for (let i = 0; i < 6; i++) { const j = rand(i, Math.floor(t * 20)); X.px(c, P[0] + (rand(i, 3) - 0.5) * 22, P[1] + (rand(i, 4) - 0.5) * 10 - (j > 0.5 ? 1 : 0), '#977552'); }
          if (e > 0 && e < 0.08) X.ellipse(c, P[0], P[1] - 4, 14, 9, '#ffffff');
          if (e > 0 && e < 0.45) K.gring(c, P[0], P[1], 8 + e * 80, '#e0c8a0', 1 - e / 0.45, 1);
          // the column of earth thrown straight up
          if (e > 0) for (let k = 0; k < 26; k++) {
            const vz = 70 + rand(k, 84) * 70, z = vz * e - 120 * e * e; if (z < 0) continue;
            const x = P[0] + (rand(k, 85) - 0.5) * 12 + (rand(k, 86) - 0.5) * 30 * e;
            X.rect(c, x, P[1] - z, k % 3 ? 2 : 3, k % 3 ? 2 : 3, K.ROCK[k % 2 ? 2 : 4]); if (k % 4 === 0) X.px(c, x, P[1] - z, K.ROCK[0]);
          }
          K.dust(c, P[0], P[1], e - 0.05, 11, 12, 28, '#8a7a68', 1.4);
        },
      };
    } });

  // =========================================================================
  // ARCANE: beam, nova, blast
  add({ id: 'arcane-force', group: 'forms', q: ['arcane'], cast: 'force', dur: 3, ground: 'path', seed: 5,
    frame(t, K) {
      const D = 3, c0 = 0.55, c1 = 2.5, me = caster(t, 'arcane', c0, c1), on = Math.min(easeOut(seg(t, c0, c0 + 0.12)), 1 - seg(t, c1, c1 + 0.1));
      const hitting = t > c0 + 0.12 && t < c1;
      const br = K.brute({ id: 'b1', x: 146 + (hitting ? K.kb(t, c0 + 0.12, 8, 1.8) : t >= c1 ? 8 * (1 - seg(t, c1, D)) : 0), y: 74, face: Math.PI, seed: 4, flash: hitting && Math.floor(t * 12) % 3 === 0 ? 0.1 : 0, flashCol: EL.arcane[1], sq: hitting ? 0.1 : 0 });
      const g1 = K.gob({ id: 'g1', x: 128, y: 98, face: Math.PI - 0.4, seed: 2 });
      return {
        actors: [me, br, g1],
        lights: on > 0.05 ? [[95, 80, 60, '#d02a78', 0.45 * on], [146, 74, 50, '#ff4f9b', 0.6 * on]] : [],
        fx(c, A) { K.prep(c, me, A, t, ['arcane'], 0.05, c0); if (on > 0.02) K.beam(c, A.me.tip, A.b1.chest, t, EL.arcane, { on }); },
      };
    } });

  add({ id: 'arcane-area', group: 'forms', q: ['arcane'], cast: 'area', dur: 2.8, ground: 'plaza', seed: 6,
    frame(t, K) {
      const D = 2.8, c0 = 0.6, me = caster(t, 'arcane', c0, 0.85), L = K.life(t, D), RM = 62, dur = 0.5;
      const at = (x, y) => c0 + dur * Math.min(1, Math.hypot(x - ME.x, (y - ME.y) / FY) / RM) * 0.75;
      const mk = (id, x, y, seed) => { const far = Math.hypot(x - ME.x, (y - ME.y) / FY) > RM, th = far ? 99 : at(x, y), ang = Math.atan2((y - ME.y) / FY, x - ME.x); const k = K.kb(t, th, 12, 0.3); return K.gob({ id, x: x + Math.cos(ang) * k, y: y + Math.sin(ang) * k * FY, face: ang + Math.PI, seed, flash: K.flash(t, th), dead: K.down(t, th + 0.1), alpha: L, th }); };
      const en = [mk('g1', 84, 54, 1), mk('g2', 92, 86, 2), mk('g3', 70, 104, 3), mk('g4', 140, 70, 5)];
      return {
        actors: [me, ...en],
        lights: t > c0 && t < c0 + 0.6 ? [[ME.x, ME.y, 90, '#ff4f9b', 0.9 * (1 - seg(t, c0, c0 + 0.6))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['arcane'], 0.05, c0);
          K.nova(c, ME.x, ME.y - 2, t, c0, dur, RM, EL.arcane, { n: 34, lift: 6 });
          for (const s of en) if (t > s.th && t < s.th + 0.3) { const a = A[s.id]; if (a) { const e = (t - s.th) / 0.3; X.ring(c, a.chest[0], a.chest[1], 2 + e * 9, (2 + e * 9) * 0.8, EL.arcane[1], 1 - e); if (e < 0.3) K.sq(c, a.chest[0], a.chest[1], 3, '#ffffff'); } }
        },
      };
    } });

  add({ id: 'arcane-place', group: 'forms', q: ['arcane'], cast: 'place', dur: 3, ground: 'grass', seed: 7,
    frame(t, K) {
      const D = 3, c0 = 0.55, boom = 1.35, me = caster(t, 'arcane', c0, 0.8), L = K.life(t, D), P = [128, 74];
      const mk = (id, x, y, seed) => { const ang = Math.atan2((y - P[1]) / FY, x - P[0]), k = K.kb(t, boom, 16, 0.35); return K.gob({ id, x: x + Math.cos(ang) * k, y: y + Math.sin(ang) * k * FY, face: ang + Math.PI, seed, flash: K.flash(t, boom), dead: K.down(t, boom + 0.15), z: K.hop(t, boom, 6, 0.35), alpha: L }); };
      const en = [mk('g1', 120, 68, 1), mk('g2', 138, 80, 2), mk('g3', 132, 62, 3)];
      const e = t - boom;
      return {
        actors: [me, ...en], shake: e > 0 && e < 0.3 ? 2 : 0,
        under(c, E) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (t > c0 && t < boom) E.em((cc) => { const k = seg(t, c0, boom); K.gring(cc, P[0], P[1], 22, EL.arcane[3], 0.8, 1); K.gring(cc, P[0], P[1], 22 * (1 - k) + 2, EL.arcane[1], 1, 1); if (Math.floor(t * (6 + k * 14)) % 2) X.ellipse(cc, P[0], P[1], 3, 2, EL.arcane[2]); });
          if (e > 0) { K.scorch(c, P[0], P[1], 11, 0.35 * (1 - seg(t, D - 0.6, D))); K.cracks(c, P[0], P[1], 14, 9, 1, 'rgba(30,14,30,0.8)', 7); }
        },
        lights: [...(t > c0 && t < boom ? [[P[0], P[1], 26, '#ff4f9b', 0.4 * seg(t, c0, boom)]] : []), ...(e > 0 && e < 0.7 ? [[P[0], P[1], 100, '#ff6ab0', 1.1 * (1 - e / 0.7)]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['arcane'], 0.05, c0);
          if (e > 0 && e < 0.1) X.ellipse(c, P[0], P[1] - 6, 20, 14, '#ffffff');
          if (e > 0 && e < 0.5) { X.glow(c, P[0], P[1] - 6, 24 * (1 - e * 1.5), EL.arcane[2], 0.9); K.gring(c, P[0], P[1], 6 + e * 100, EL.arcane[1], 1 - e / 0.5, 2); K.gring(c, P[0], P[1], 4 + e * 70, '#ffffff', 0.8 - e / 0.5, 1); }
          if (e > 0 && e < 0.8) for (let k = 0; k < 24; k++) { const a = rand(k, 91) * TAU, sp = 30 + rand(k, 92) * 40, vz = 30 + rand(k, 93) * 50, z = vz * e - 120 * e * e; if (z < 0) continue; K.sq(c, P[0] + Math.cos(a) * sp * e, P[1] + Math.sin(a) * sp * e * FY - z, k % 3 ? 1 : 2, k % 2 ? EL.arcane[1] : '#ffffff'); }
        },
      };
    } });

  // =========================================================================
  // LIFE: beam, healing ring, healing spring
  // a lighter, fresher green for the life beam (the user asked for slightly lighter colours)
  const LIFE_L = ['#ffffff', '#f2ffe8', '#c8fab0', '#8ef07e', '#58d268'];
  add({ id: 'life-force', group: 'forms', q: ['life'], cast: 'force', dur: 3.2, ground: 'plaza', seed: 8,
    frame(t, K) {
      const D = 3.2, c0 = 0.55, c1 = 2.4, me = caster(t, 'life', c0, c1, { face: 0.35 }), on = Math.min(easeOut(seg(t, c0, c0 + 0.12)), 1 - seg(t, c1, c1 + 0.1));
      const hpv = 0.2 + 0.8 * smooth(seg(t, c0 + 0.15, c1)) - 0.8 * seg(t, D - 0.4, D) * 0;
      const al = K.wiz({ id: 'ally', team: 'p2', x: 132, y: 92, face: Math.PI + 0.3, el: 'water', seed: 7, sq: t < c0 ? 0.15 : 0 });
      const g1 = K.gob({ id: 'g1', x: 162, y: 64, face: Math.PI + 0.4, seed: 2 });
      return {
        actors: [me, al, g1],
        lights: on > 0.05 ? [[90, 88, 60, '#7ae070', 0.45 * on], [132, 92, 40, '#c8fab0', 0.6 * on]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['life'], 0.05, c0);
          if (on > 0.02) K.beam(c, A.me.tip, A.ally.chest, t, LIFE_L, { on });
          K.heals(c, A, al, t, on, LIFE_L);
          K.hp(c, A, al, t < D - 0.3 ? hpv : 0.2);
        },
      };
    } });

  add({ id: 'life-area', group: 'forms', q: ['life'], cast: 'area', dur: 3, ground: 'plaza', seed: 9,
    line: 'Heals everyone around you, enemies included.',
    frame(t, K) {
      const D = 3, c0 = 0.6, me = caster(t, 'life', c0, 0.85), RM = 56, dur = 0.55;
      const at = (x, y) => c0 + dur * 0.75 * Math.min(1, Math.hypot(x - ME.x, (y - ME.y) / FY) / RM);
      const al = K.wiz({ id: 'ally', team: 'p2', x: 26, y: 96, face: 0.2, el: 'water', seed: 7 });
      const g1 = K.gob({ id: 'g1', x: 88, y: 70, face: Math.PI, seed: 1 }), g2 = K.gob({ id: 'g2', x: 150, y: 80, face: Math.PI, seed: 2 });
      const hv = (x, y, base) => { const th = at(x, y); return t < th ? base : Math.min(1, base + 0.6 * seg(t, th, th + 0.8)); };
      return {
        actors: [me, al, g1, g2],
        lights: t > c0 && t < c0 + 0.7 ? [[ME.x, ME.y, 80, '#5fe07a', 0.8 * (1 - seg(t, c0, c0 + 0.7))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['life'], 0.05, c0);
          K.nova(c, ME.x, ME.y - 2, t, c0, dur, RM, EL.life, { n: 30, lift: 10 });
          for (const [s, base] of [[al, 0.3], [g1, 0.35]]) { const th = at(s.x, s.y); K.heals(c, A, s, t, t > th ? 1 - seg(t, th + 1, th + 1.6) : 0); K.hp(c, A, s, t > D - 0.25 ? base : hv(s.x, s.y, base)); }
          K.hp(c, A, g2, 0.5);
        },
      };
    } });

  // the spring now lingers: it grows in once, then stays at full size for most of the loop
  // (about 4 s) while the ally stands in it and heals up; it fades out instead of shrinking
  add({ id: 'life-place', still: 3, group: 'forms', q: ['life', 'life'], cast: 'place', dur: 5, ground: 'grass', seed: 10,
    frame(t, K) {
      const D = 5, c0 = 0.55, me = caster(t, 'life', c0, 0.8), P = [112, 84];
      const grow = easeOut(seg(t, c0, c0 + 0.4)), fade = 1 - seg(t, D - 0.45, D - 0.05), k = grow * (fade > 0.05 ? 1 : 0);
      const walkT = seg(t, 0.8, 1.9);
      const al = K.wiz({ id: 'ally', team: 'p2', x: lerp(150, 114, walkT), y: lerp(100, 86, walkT), face: Math.PI + 0.3, el: 'water', seed: 7, ...K.walk(t, walkT > 0 && walkT < 1 ? 0.8 : 0) });
      const inside = walkT > 0.85;
      const g1 = K.gob({ id: 'g1', x: 168, y: 56, face: Math.PI + 0.3, seed: 2 });
      return {
        actors: [me, al, g1],
        under(c, E) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (k > 0.02) E.em((cc) => {
            X.ellipse(cc, P[0], P[1], 20 * k, 20 * k * FY, '#1e7a34', 0.5 * fade);
            K.gring(cc, P[0], P[1], 20 * k, EL.life[2], 0.9 * fade, 1);
            K.gring(cc, P[0], P[1], 14 * k, EL.life[3], 0.6 * fade, 1);
            // a slow pulse of light running outward across the spring, so it reads as alive while it lasts
            const pe = PB.mod(t * 0.7, 1); K.gring(cc, P[0], P[1], 4 + pe * 15 * k, EL.life[1], (1 - pe) * 0.7 * fade, 1);
            for (let i = 0; i < 5; i++) { if (fade < 0.98 && rand(i, Math.floor(t * 10)) > fade) continue; const a = t * 0.6 + i * 1.256, x = P[0] + Math.cos(a) * 17 * k, y = P[1] + Math.sin(a) * 17 * k * FY; X.icon(cc, 'life', x - 3, y - 3, EL.life[1]); }
          });
        },
        lights: k > 0 ? [[P[0], P[1], 46, '#5fe07a', 0.7 * k * fade]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'life'], 0.05, c0);
          if (k > 0) for (const p of emit(t, 18, 1, (i, age) => ({ x: P[0] + (rand(i, 3) - 0.5) * 34 * k, y: P[1] + (rand(i, 4) - 0.5) * 18 * k - age * 18, age, i }))) if (rand(p.i, 5) < fade) X.px(c, p.x, p.y, p.age < 0.5 ? EL.life[0] : EL.life[2]);
          K.heals(c, A, al, t, inside ? k * fade : 0);
          K.hp(c, A, al, 0.25 + (inside ? 0.75 * seg(t, 1.9, 4.2) : 0) * (t < D - 0.3 ? 1 : 0));
        },
      };
    } });

  // =========================================================================
  // LIGHTNING: arc, discharge, strike
  add({ id: 'lightning-force', group: 'forms', q: ['lightning'], cast: 'force', dur: 2.8, ground: 'path', seed: 11,
    frame(t, K) {
      const D = 2.8, c0 = 0.55, c1 = 1.7, me = caster(t, 'lightning', c0, c1), on = t > c0 && t < c1, lit = on && Math.floor(t * 18) % 3 !== 2, L = K.life(t, D);
      const ids = [['g1', 112, 66, 1], ['g2', 136, 84, 2], ['g3', 160, 64, 3]];
      const en = ids.map(([id, x, y, seed], i) => { const hit = on && t > c0 + i * 0.12; return K.gob({ id, x: x + (hit ? Math.sin(t * 60 + i) * 0.6 : 0), y, face: Math.PI, seed, shock: hit ? 1 : 0, dead: K.down(t, c1, 99) * 0.7, alpha: L }); });
      return {
        actors: [me, ...en],
        lights: lit ? en.map((s) => [s.x, s.y - 6, 50, '#b08aff', 0.8]) : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['lightning'], 0.05, c0);
          if (!lit) return;
          const seed = Math.floor(t * 18), nodes = [A.me.tip, ...en.filter((s, i) => t > c0 + i * 0.12).map((s) => A[s.id].chest)];
          for (let i = 1; i < nodes.length; i++) { K.zap(c, nodes[i - 1], nodes[i], seed * 13 + i); K.zapHit(c, nodes[i], seed + i); }
        },
      };
    } });

  add({ id: 'lightning-area', group: 'forms', q: ['lightning'], cast: 'area', dur: 2.8, ground: 'plaza', seed: 12,
    frame(t, K) {
      const D = 2.8, c0 = 0.6, c1 = 1.5, me = caster(t, 'lightning', c0, c1), on = t > c0 && t < c1, lit = on && Math.floor(t * 20) % 3 !== 2, L = K.life(t, D);
      const en = [['g1', 74, 52, 1], ['g2', 82, 92, 2], ['g3', 20, 80, 3], ['g4', 140, 72, 5]].map(([id, x, y, seed]) => { const near = Math.hypot(x - ME.x, (y - ME.y) / FY) < 46; return K.gob({ id, x, y, face: Math.atan2((ME.y - y) / FY, ME.x - x), seed, shock: near && on ? 1 : 0, dead: near ? K.down(t, c1) * 0.7 : 0, alpha: near ? L : 1, near }); });
      return {
        actors: [me, ...en],
        under(c, E) { if (on) E.em((cc) => { K.gring(cc, ME.x, ME.y, 46, EL.lightning[3], 0.35, 1); }); },
        lights: lit ? [[ME.x, ME.y - 10, 70, '#b08aff', 0.9]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['lightning'], 0.05, c0);
          if (!lit) return;
          const seed = Math.floor(t * 20), o = A.me.chest;
          X.glow(c, o[0], o[1] - 2, 10, EL.lightning[2], 0.9);
          for (const s of en) if (s.near) { K.zap(c, [o[0], o[1] - 2], A[s.id].chest, seed * 7 + s.seed, EL.lightning, 2, 1); K.zapHit(c, A[s.id].chest, seed + s.seed); }
          for (let k = 0; k < 4; k++) { const a = rand(seed, k) * TAU; X.lines(c, K.bolt([o[0], o[1] - 2], [o[0] + Math.cos(a) * 16, o[1] + Math.sin(a) * 12], seed + k, 0.5, 2), EL.lightning[2], 1); }
        },
      };
    } });

  add({ id: 'lightning-place', group: 'forms', q: ['lightning'], cast: 'place', dur: 3, ground: 'path', seed: 13,
    frame(t, K) {
      const D = 3, c0 = 0.55, st = 0.95, me = caster(t, 'lightning', c0, 0.8), P = [130, 80], L = K.life(t, D);
      const e = t - st, surge = e > 0 && e < 0.9;
      const en = [['g1', 122, 76, 1], ['g2', 142, 84, 2], ['g3', 132, 70, 3]].map(([id, x, y, seed]) => K.gob({ id, x, y, face: Math.PI, seed, shock: surge ? 1 : 0, wet: 0.6, dead: K.down(t, st + 0.9) * 0.8, alpha: L }));
      const g4 = K.gob({ id: 'g4', x: 168, y: 58, face: Math.PI, seed: 4 });
      return {
        actors: [me, ...en, g4], shake: e > 0 && e < 0.2 ? 2 : 0,
        under(c, E) {
          K.puddle(c, P[0], P[1], 30, 1, t, 3, !surge);
          if (t > c0 - 0.4 && t < st) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (surge && Math.floor(t * 20) % 3 !== 2) E.em((cc) => { const sd = Math.floor(t * 20); for (let k = 0; k < 40; k++) { const a = rand(sd, k, 11) * TAU, r = Math.sqrt(rand(sd, k, 12)); X.px(cc, P[0] + Math.cos(a) * r * 28, P[1] + Math.sin(a) * r * 11, k % 3 ? EL.lightning[1] : '#ffffff'); } for (let k = 0; k < 3; k++) X.lines(cc, K.bolt([P[0] + (rand(sd, k, 2) - 0.5) * 40, P[1] + (rand(sd, k, 3) - 0.5) * 14], [P[0] + (rand(sd, k, 4) - 0.5) * 40, P[1] + (rand(sd, k, 5) - 0.5) * 14], sd + k, 0.4, 3), EL.lightning[2], 1); });
        },
        lights: [...(e > -0.05 && e < 0.3 ? [[P[0], P[1], 120, '#c4a4ff', 1.2 * (1 - Math.max(0, e) / 0.3)]] : []), ...(surge ? [[P[0], P[1], 50, '#b08aff', 0.6]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['lightning'], 0.05, c0);
          if (e > -0.05 && e < 0.25 && Math.floor(t * 30) % 2 === 0) { const pts = K.bolt([P[0] + 14, -6], [P[0], P[1] - 2], 77 + Math.floor(t * 30), 0.25, 5); X.lines(c, pts, EL.lightning[3], 4); X.lines(c, pts, '#ffffff', 2); }
          if (e > 0 && e < 0.06) X.ellipse(c, P[0], P[1] - 4, 16, 10, '#ffffff');
          if (e > 0 && e < 0.4) K.gring(c, P[0], P[1], 4 + e * 60, EL.lightning[1], 1 - e / 0.4, 1);
          if (surge && Math.floor(t * 18) % 3 !== 2) for (const s of en) K.zapHit(c, A[s.id].chest, Math.floor(t * 18) + s.seed);
        },
      };
    } });

  // =========================================================================
  // WATER: spray, splash ring, flood
  add({ id: 'water-force', group: 'forms', q: ['water'], cast: 'force', dur: 3, ground: 'path', seed: 14,
    frame(t, K) {
      const D = 3, c0 = 0.55, c1 = 2.1, me = caster(t, 'water', c0, c1), L = K.life(t, D);
      const push = (i) => K.kb(t, c0 + 0.2 + i * 0.05, 22 + i * 4, 1.6);
      const en = [['g1', 108, 66, 1], ['g2', 118, 82, 2], ['g3', 104, 96, 3]].map(([id, x, y, seed], i) => K.gob({ id, x: x + push(i), y: y + push(i) * (y - ME.y) * 0.006, face: Math.PI, seed, wet: seg(t, c0 + 0.3, c0 + 0.8), sq: t > c0 + 0.2 && t < c1 ? 0.15 : 0, alpha: L }));
      return {
        actors: [me, ...en],
        under(c) { if (t > c0 + 0.3) for (const s of en) X.ellipse(c, s.x - 6, s.y + 1, 7, 2.5, 'rgba(30,70,130,0.45)'); },
        lights: t > c0 && t < c1 ? [[95, 80, 50, '#2a8cff', 0.4]] : [],
        fx(c, A) { K.prep(c, me, A, t, ['water'], 0.05, c0); K.cone(c, A.me.tip, [A.g2.chest[0] + 4, A.g2.chest[1] + 2], t, 'water', c0, c1, { spread: 0.3 }); for (const s of en) if (s.wet > 0.3) K.dripping(c, A, s, t); },
      };
    } });

  add({ id: 'water-area', group: 'forms', q: ['water'], cast: 'area', dur: 2.8, ground: 'plaza', seed: 15,
    frame(t, K) {
      const D = 2.8, c0 = 0.6, me = caster(t, 'water', c0, 0.85), L = K.life(t, D), RM = 58, dur = 0.55;
      const at = (x, y) => c0 + dur * 0.75 * Math.min(1, Math.hypot(x - ME.x, (y - ME.y) / FY) / RM);
      const mk = (id, x, y, seed) => { const th = at(x, y), ang = Math.atan2((y - ME.y) / FY, x - ME.x), k = K.kb(t, th, 22, 0.5); return K.gob({ id, x: x + Math.cos(ang) * k, y: y + Math.sin(ang) * k * FY, face: ang + Math.PI, seed, wet: seg(t, th, th + 0.2), sq: t > th && t < th + 0.3 ? 0.3 : 0, alpha: L }); };
      const en = [mk('g1', 72, 56, 1), mk('g2', 80, 90, 2), mk('g3', 24, 92, 3), mk('g4', 140, 70, 5)];
      return {
        actors: [me, ...en],
        under(c) { if (t > c0 + 0.1) X.poly(c, K.blobPts(ME.x, ME.y + 1, 16, 7, 2), 'rgba(30,74,128,0.5)'); },
        lights: t > c0 && t < c0 + 0.6 ? [[ME.x, ME.y, 80, '#3a98ff', 0.7 * (1 - seg(t, c0, c0 + 0.6))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['water'], 0.05, c0);
          const r = K.nova(c, ME.x, ME.y - 1, t, c0, dur, RM, EL.water, { n: 40, lift: 8 });
          if (r > 0 && t < c0 + dur) for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, e = (t - c0) / dur; X.px(c, ME.x + Math.cos(a) * r * 0.9, ME.y + Math.sin(a) * r * 0.9 * FY - 4 - Math.sin(e * Math.PI) * 8, EL.water[0]); }
          for (const s of en) if (s.wet > 0.5) K.dripping(c, A, s, t);
        },
      };
    } });

  // A localized downpour: a small dark cloud gathers over the cursor, rain streaks down,
  // drops splash on landing and a puddle spreads. Whoever stands in it is soaked.
  add({ id: 'water-place', still: 2.2, group: 'forms', q: ['water', 'water'], cast: 'place', dur: 3.8, ground: 'grass', seed: 16,
    frame(t, K) {
      const D = 3.8, c0 = 0.55, me = caster(t, 'water', c0, 0.8), P = [128, 82], CY = 22, RR = 28;
      const r0 = c0 + 0.25, r1 = D - 0.7, rain = Math.min(seg(t, r0 - 0.1, r0 + 0.2), 1 - seg(t, r1 - 0.2, r1 + 0.1));
      const cloud = Math.min(seg(t, c0 - 0.05, c0 + 0.35), 1 - seg(t, r1, r1 + 0.45));
      const k = easeOut(seg(t, r0 + 0.2, r0 + 1.6)) * (1 - seg(t, D - 0.45, D));
      const en = [['g1', 118, 78, 1], ['g2', 140, 88, 2], ['g3', 170, 58, 3]].map(([id, x, y, seed]) => { const inF = Math.hypot(x - P[0], (y - P[1]) / FY) < RR; return K.gob({ id, x, y, face: Math.PI + (inF && rain > 0.5 ? Math.sin(t * 5 + seed) * 0.4 : 0), seed, sq: inF && rain > 0.5 ? 0.08 : 0, wet: inF ? seg(t, r0 + 0.1, r0 + 0.6) * (1 - seg(t, D - 0.4, D)) : 0, inF }); });
      // one raindrop: falls on a slant from the cloud to a point inside the circle, then splashes
      const drops = (tt) => emit(tt, 110, 0.42, (i, age, ts) => {
        if (ts < r0 || ts > r1) return null;
        const a = rand(i, 81) * TAU, r = Math.sqrt(rand(i, 82)) * RR, gx = P[0] + Math.cos(a) * r, gy = P[1] + Math.sin(a) * r * FY;
        return { gx, gy, age, i, top: CY + 6 + rand(i, 83) * 6 };
      });
      return {
        actors: [me, ...en],
        under(c) {
          if (t > c0 - 0.4 && t < c0 + 0.2) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          // the rain darkens the ground it falls on before the puddle forms
          if (rain > 0.05) X.ellipse(c, P[0], P[1], RR, RR * FY, '#1a2a3a', 0.35 * Math.max(rain, k));
          K.puddle(c, P[0], P[1] + 2, 30, k, t, 5);
          // splash rings on the ground and on the puddle
          for (const p of drops(t)) if (p.age > 0.8) { const e = (p.age - 0.8) / 0.2; X.ring(c, p.gx, p.gy, 1 + e * 2.5, (1 + e * 2.5) * 0.45, '#8ad0ff', 1 - e); }
        },
        lights: [[P[0], P[1], 46, '#2a8cff', 0.3 * Math.max(rain, k)]],
        amb: rain > 0.3 ? '#30324a' : undefined,
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'water'], 0.05, c0);
          // the falling streaks: 3 px long, on a slant, pale at the head
          for (const p of drops(t)) {
            if (p.age <= 0.8) { const q = p.age / 0.8, x = lerp(p.gx + 9, p.gx, q), y = lerp(p.top, p.gy, q * q * 0.35 + q * 0.65); X.line(c, x + 1, y - 3, x, y, '#5aa8e8'); X.px(c, x, y, '#cfefff'); }
            else { const e = (p.age - 0.8) / 0.2; X.px(c, p.gx - 1 - e * 2, p.gy - 1 - Math.sin(e * Math.PI) * 3, '#bfe4ff'); X.px(c, p.gx + 1 + e * 2, p.gy - 1 - Math.sin(e * Math.PI) * 2, '#8ad0ff'); }
          }
          // the cloud: a low dark mass of puffs over the cursor, darker underneath
          if (cloud > 0.05) for (let i = 0; i < 16; i++) {
            const x = P[0] + 6 + (rand(i, 91) - 0.5) * 50 * (0.6 + 0.4 * cloud) + Math.sin(t * 0.8 + i) * 1.5, y = CY + (rand(i, 92) - 0.5) * 10 + Math.sin(t * 1.1 + i * 2) * 0.8, r = (5 + rand(i, 93) * 4) * (0.5 + 0.5 * cloud);
            K.puff(c, x, y + 2, r, '#2e3246', cloud); K.puff(c, x - 1, y, r * 0.85, i % 3 ? '#4a5068' : '#5c6480', cloud);
          }
          for (const s of en) if (s.inF && s.wet > 0.2) K.dripping(c, A, s, t);
        },
      };
    } });

  // =========================================================================
  // FIRE: flamethrower, fire ring, fire patch
  add({ id: 'fire-force', group: 'forms', q: ['fire'], cast: 'force', dur: 3, ground: 'path', seed: 17,
    frame(t, K) {
      const D = 3, c0 = 0.55, c1 = 1.9, me = caster(t, 'fire', c0, c1), L = K.life(t, D);
      const en = [['g1', 106, 68, 1], ['g2', 118, 84, 2]].map(([id, x, y, seed], i) => { const b = seg(t, c0 + 0.25 + i * 0.1, c0 + 0.7) * (1 - seg(t, D - 0.4, D)); return K.gob({ id, x: x + K.kb(t, c0 + 0.6, 26, 1.4), y: y + (i ? 6 : -6) * seg(t, c0 + 0.6, 2), face: Math.PI + (t > c0 + 0.6 ? Math.PI : 0), seed, burn: b, ...K.walk(t, t > c0 + 0.6 ? 1.2 : 0), alpha: L }); });
      const g3 = K.gob({ id: 'g3', x: 160, y: 58, face: Math.PI, seed: 3 });
      return {
        actors: [me, ...en, g3],
        lights: [...(t > c0 && t < c1 ? [[90, 76, 56, '#ff7a2a', 0.7]] : []), ...en.filter((s) => s.burn > 0.05).map((s) => [s.x, s.y - 6, 40, '#ff7020', 0.7 * s.burn])],
        fx(c, A) { K.prep(c, me, A, t, ['fire'], 0.05, c0); K.cone(c, A.me.tip, [116, 68], t, 'fire', c0, c1, { spread: 0.26 }); for (const s of en) K.burning(c, A, s, t, s.burn); },
      };
    } });

  add({ id: 'fire-area', group: 'forms', q: ['fire'], cast: 'area', dur: 3, ground: 'plaza', seed: 18,
    frame(t, K) {
      const D = 3, c0 = 0.6, me = caster(t, 'fire', c0, 0.85), L = K.life(t, D), RM = 54, dur = 0.55;
      const at = (x, y) => c0 + dur * 0.75 * Math.min(1, Math.hypot(x - ME.x, (y - ME.y) / FY) / RM);
      const mk = (id, x, y, seed) => { const th = at(x, y), ang = Math.atan2((y - ME.y) / FY, x - ME.x), k = K.kb(t, th, 6, 0.3); return K.gob({ id, x: x + Math.cos(ang) * k, y: y + Math.sin(ang) * k * FY, face: ang + Math.PI, seed, burn: seg(t, th, th + 0.2) * (1 - seg(t, D - 0.35, D)), flash: K.flash(t, th) * 0.5, alpha: L }); };
      const en = [mk('g1', 76, 56, 1), mk('g2', 82, 92, 2), mk('g3', 22, 90, 3)];
      const far = K.gob({ id: 'g4', x: 150, y: 70, face: Math.PI, seed: 5 });
      return {
        actors: [me, ...en, far],
        lights: [...(t > c0 && t < c0 + 0.7 ? [[ME.x, ME.y, 80, '#ff7a2a', 0.9 * (1 - seg(t, c0, c0 + 0.7))]] : []), ...en.map((s) => [s.x, s.y - 6, 36, '#ff7020', 0.6 * s.burn])],
        fx(c, A) {
          K.prep(c, me, A, t, ['fire'], 0.05, c0);
          const e = (t - c0) / dur;
          if (e > 0 && e < 1.3) { const r = 4 + (RM - 4) * easeOut(Math.min(1, e)), a = 1 - seg(e, 0.7, 1.3); for (let i = 0; i < 26; i++) { const th = (i / 26) * TAU; if (rand(i, Math.floor(t * 15)) > a + 0.15) continue; K.tongue(c, ME.x + Math.cos(th) * r, ME.y + Math.sin(th) * r * FY, 2.2, (6 + 3 * Math.sin(t * 14 + i)) * a, Math.sin(t * 7 + i) * 1.5); } K.gring(c, ME.x, ME.y, r, EL.fire[2], a, 1); }
          for (const s of en) K.burning(c, A, s, t, s.burn);
        },
      };
    } });

  // Burning ground (v3): one continuous sheet of fire, not N separate patches. The fire
  // body is drawn as a height field over the patch, row by row from the back: every ground
  // column carries a flame column whose height rolls with travelling waves, so neighbours
  // merge into one body with a bright, unbroken base, and ragged tips lick off the top.
  // The ground under it glows orange; char shows only as a thin rim at the edge and once
  // the fire dies down.
  add({ id: 'fire-place-v3', group: 'forms', q: ['fire', 'fire'], cast: 'place', dur: 4.2, ground: 'grass', seed: 19, still: 2.3,
    line: 'Sets the ground at the cursor alight. The fire catches, spreads out and keeps burning; whoever walks into it catches fire.',
    frame(t, K) {
      const D = 4.2, c0 = 0.55, me = caster(t, 'fire', c0, 0.8), P = [124, 80], RM = 25, s0 = c0 + 0.05, sd = 0.9;
      const spread = easeOut(seg(t, s0, s0 + sd)), front = RM * spread, die = 1 - seg(t, D - 0.9, D - 0.2), charA = 1 - seg(t, D - 0.4, D);
      const FR = EL.fire;
      const tIn = 1.9, g1x = t < tIn ? 184 - 30 * (t - 0.4) : 139 + K.kb(t, tIn + 0.15, 44, 1.3);
      const burnG = seg(t, tIn, tIn + 0.2) * (1 - seg(t, D - 0.35, D));
      const g1 = K.gob({ id: 'g1', x: g1x, y: 84, face: Math.PI + (t > tIn + 0.15 ? Math.PI : 0), seed: 1, ...K.walk(t, t > tIn + 0.15 ? 1.5 : 1), burn: burnG, flash: K.flash(t, tIn) * 0.4, alpha: K.life(t, D) });
      const g2 = K.gob({ id: 'g2', x: 168, y: 56, face: Math.PI, seed: 2 });
      // the flame body over the patch: a solid low base everywhere, and tongues rising from
      // it where travelling waves peak (sharpened, so tips separate while the base stays whole)
      const tongueH = (x, y, k) => {
        const w = 0.5 + 0.5 * Math.sin(x * 0.5 - t * 5 + y * 1.7 + Math.sin(y * 0.6) * 3), w2 = 0.5 + 0.5 * Math.sin(x * 0.23 + t * 3.1 - y * 0.8);
        return (5 + 10 * Math.sqrt(Math.max(0, 1 - k))) * Math.pow(w, 1.8) * (0.55 + 0.45 * w2) * (0.85 + 0.15 * Math.sin(t * 13 + x));
      };
      const stand = [];
      if (front > 1.5 && die > 0.05) {
        const ry = front * FY;
        for (let y = Math.round(P[1] - ry) + 1; y <= Math.round(P[1] + ry); y += 4) {
          const dy = (y - P[1]) / ry, hw = front * Math.sqrt(Math.max(0, 1 - dy * dy));
          if (hw < 1) continue;
          stand.push([y, (c, E) => E.em((cc) => {
            for (let x = Math.round(P[0] - hw); x <= Math.round(P[0] + hw); x++) {
              const k = Math.hypot((x - P[0]) / RM, (y - P[1]) / (RM * FY)), edge = Math.min(1, (hw - Math.abs(x - P[0])) / 3);
              const base = (2 + 2 * (1 - k)) * die * (0.5 + 0.5 * edge), hh = Math.round(base + tongueH(x, y, k) * die * edge);
              for (let z = 0; z <= hh; z++) {
                const q = z / Math.max(1, hh), sway = Math.sin(t * 9 + x * 0.4 + y) * z * 0.12;
                // white-hot at the roots in the middle, gold, then orange, and a red-orange rim on the tips
                const col = z < base * 0.6 && k < 0.6 ? FR[0] : q < 0.45 ? FR[1] : q < 0.8 ? FR[2] : FR[3];
                X.px(cc, x + sway, y - z, col);
              }
            }
          })]);
        }
      }
      return {
        actors: [me, g1, g2], stand,
        under(c, E) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (front > 1) {
            // only a thin ragged rim of char at the edge while it burns; the whole patch chars as it dies
            const dead = 1 - die;
            X.poly(c, K.blobPts(P[0], P[1], front * 1.1, front * 1.1 * FY, 4, 34), '#2a1a12', 0.5 * charA);
            if (dead > 0.05) X.poly(c, K.blobPts(P[0], P[1], front, front * FY, 9, 34), '#1a1410', Math.min(1, dead * 1.4) * charA);
            // the ground under the fire glows
            E.em((cc) => {
              if (die > 0.05) { X.poly(cc, K.blobPts(P[0], P[1], front * 0.98, front * 0.98 * FY, 9, 34), FR[3], die > 0.9 ? 1 : die); X.poly(cc, K.blobPts(P[0], P[1], front * 0.7, front * 0.7 * FY, 7, 30), FR[2], die > 0.9 ? 1 : die * 0.8); }
              // embers in the char once it dies down
              if (dead > 0.1) for (let i = 0; i < 40; i++) { const a = rand(i, 51) * TAU, r = Math.sqrt(rand(i, 52)) * front, on = rand(i, Math.floor(t * 6 + i * 0.3), 53) < 0.5 * charA; if (on) X.px(cc, P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r * FY, i % 3 ? FR[3] : FR[2]); }
            });
          }
        },
        lights: [[P[0], P[1] - 4, 30 + front * 2.4, '#ff8a30', (0.5 + 0.7 * spread) * die + 0.1 * Math.sin(t * 13)], [P[0], P[1] - 8, 20 + front, '#ffd860', 0.5 * spread * die], [g1.x, g1.y - 6, 36, '#ff7020', 0.6 * g1.burn]],
        fx(c, A) {
          K.prep(c, me, A, t, ['fire', 'fire'], 0.05, c0);
          // the catching front: a bright line of fire running outward while it spreads
          if (spread > 0 && spread < 0.98) for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, r = front + (rand(i, Math.floor(t * 20), 62) - 0.5) * 2; X.px(c, P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r * FY - 1, i % 2 ? FR[1] : FR[0]); }
          // embers and sparks spiralling up out of the fire
          if (front > 2) for (const p of emit(t, 34, 1.2, (i, age) => { const a = rand(i, 3) * TAU, r = Math.sqrt(rand(i, 4)) * front; return { x: P[0] + Math.cos(a) * r + Math.sin(age * 6 + i) * 2.5 + age * 4, y: P[1] + Math.sin(a) * r * FY - 8 - age * 30, age, i }; })) if (rand(p.i, 5) < die + 0.1) X.px(c, p.x, p.y, p.age < 0.35 ? FR[0] : p.age < 0.7 ? FR[1] : FR[3]);
          // a little smoke, mostly once it dies down
          if (front > 3) for (const p of emit(t, 4, 2, (i, age) => { const a = rand(i, 6) * TAU, r = Math.sqrt(rand(i, 7)) * front * 0.7; return { x: P[0] + Math.cos(a) * r + age * 14, y: P[1] + Math.sin(a) * r * FY - 18 - age * 30, age }; })) if (p.age > 0.1) K.puff(c, p.x, p.y, 2.5 + p.age * 5, '#6a6274', (1 - p.age) * (0.25 + 0.4 * (1 - die)) * charA);
          K.burning(c, A, g1, t, g1.burn);
        },
      };
    } });

  // =========================================================================
  // COLD: frost spray, frost ring, frost patch
  // Frost breath: wisps of cold mist and crystal glitter (no ice cubes). Rime grows over the
  // targets as they chill; they slow and, once the cold stacks, stand frozen in rime.
  add({ id: 'cold-force', group: 'forms', q: ['cold', 'cold'], cast: 'force', dur: 3.4, ground: 'path', seed: 20,
    frame(t, K) {
      const D = 3.4, c0 = 0.55, c1 = 2.1, me = caster(t, 'cold', c0, c1), L = K.life(t, D), thaw = 1 - seg(t, D - 0.45, D);
      const en = [['g1', 110, 66, 1], ['g2', 122, 84, 2]].map(([id, x, y, seed], i) => {
        const ch = smooth(seg(t, c0 + 0.2 + i * 0.12, c0 + 1.3 + i * 0.12)) * thaw;
        // they walk in, slowing as the rime builds, and stop dead once it is thick
        let xx = x + 10; for (let s = 0; s < t; s += 0.05) { const cc = smooth(seg(s, c0 + 0.2 + i * 0.12, c0 + 1.3 + i * 0.12)); xx -= 7 * (1 - cc) * 0.05; }
        return K.gob({ id, x: xx, y, face: Math.PI, seed, ...K.walk(t, ch > 0.92 ? 0 : 1 - ch * 0.85), chill: ch, alpha: L, ch });
      });
      const fr = seg(t, c0 + 0.3, c0 + 1.3) * thaw;
      return {
        actors: [me, ...en],
        under(c) {
          // rime on the ground: a pale frosted patch with feathery crystals growing out of it
          if (fr > 0.02) {
            for (let i = 0; i < 90; i++) { const a = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.7) * 26 * fr, x = 116 + Math.cos(a) * r, y = 77 + Math.sin(a) * r * FY * 0.7; X.px(c, x, y, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); if (r < 14 * fr && i % 3 === 0) X.px(c, x + 1, y, '#d8f4fc'); }
            for (let i = 0; i < 16; i++) {
              const a = rand(i, 71) * TAU, r = Math.sqrt(rand(i, 72)) * 24 * fr, x = 116 + Math.cos(a) * r, y = 77 + Math.sin(a) * r * FY * 0.7, L2 = (2 + rand(i, 73) * 3) * fr;
              for (let b = 0; b < 3; b++) { const ang = rand(i, 74 + b) * TAU; X.line(c, x, y, x + Math.cos(ang) * L2, y + Math.sin(ang) * L2 * 0.6, b ? '#a8dcf0' : '#e8fbff'); }
            }
          }
        },
        lights: [...(t > c0 && t < c1 ? [[95, 76, 56, '#7ff0ff', 0.5]] : []), [116, 74, 40, '#bff4ff', 0.25 * fr]],
        fx(c, A) {
          K.prep(c, me, A, t, ['cold', 'cold'], 0.05, c0);
          K.cone(c, A.me.tip, [116, 72], t, 'cold', c0, c1, { spread: 0.28 });
          for (const s of en) { K.chilled(c, A, s, t, s.ch); if (s.ch > 0.9) K.frosty(c, A, s, t); }
        },
      };
    } });

  add({ id: 'cold-area', group: 'forms', q: ['cold'], cast: 'area', dur: 3, ground: 'plaza', seed: 21,
    line: 'A ring of cold around you. Everything it touches is chilled and slowed.',
    frame(t, K) {
      const D = 3, c0 = 0.6, me = caster(t, 'cold', c0, 0.85), L = K.life(t, D), RM = 56, dur = 0.6;
      const at = (x, y) => c0 + dur * 0.75 * Math.min(1, Math.hypot(x - ME.x, (y - ME.y) / FY) / RM);
      const mk = (id, x0, y, seed) => { const th = at(x0, y), sl = seg(t, th, th + 0.1); return K.gob({ id, x: x0 - (t < th ? (t / th) * 10 : 10 + (t - th) * 2), y, face: Math.PI, seed, ...K.walk(t, 1 - sl * 0.75), flash: K.flash(t, th) * 0.4, chill: sl * 0.6 * (1 - seg(t, D - 0.4, D)), alpha: L, sl, th }); };
      const en = [mk('g1', 86, 58, 1), mk('g2', 94, 90, 2), mk('g3', 124, 74, 3)];
      return {
        actors: [me, ...en],
        under(c) { const k = seg(t, c0, c0 + dur) * (1 - seg(t, D - 0.5, D)); if (k > 0) { K.gring(c, ME.x, ME.y, 8 + 48 * k, 'rgba(210,245,255,0.5)', 0.6, 2); for (let i = 0; i < 30; i++) { const a = rand(i, 5) * TAU, r = Math.sqrt(rand(i, 6)) * 52 * k; X.px(c, ME.x + Math.cos(a) * r, ME.y + Math.sin(a) * r * FY, i % 3 ? '#c4eefa' : '#ffffff'); } } },
        lights: t > c0 && t < c0 + 0.8 ? [[ME.x, ME.y, 80, '#9ff4ff', 0.7 * (1 - seg(t, c0, c0 + 0.8))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['cold'], 0.05, c0);
          K.nova(c, ME.x, ME.y - 2, t, c0, dur, RM, EL.cold, { n: 36, lift: 6 });
          for (const s of en) if (s.sl > 0.5 && t < D - 0.3) K.chilled(c, A, s, t);
        },
      };
    } });

  add({ id: 'cold-place', group: 'forms', q: ['cold'], cast: 'place', dur: 3.6, ground: 'path', seed: 22,
    line: 'Freezes the ground at the cursor. Water turns to walkable ice.',
    frame(t, K) {
      const D = 3.6, c0 = 0.55, me = caster(t, 'cold', c0, 0.8), P = [124, 80];
      const ice = seg(t, c0 + 0.05, c0 + 0.55) * (1 - seg(t, D - 0.4, D));
      const wk = seg(t, 1.3, 3.1), g1 = K.gob({ id: 'g1', x: lerp(176, 84, wk), y: 80 + Math.sin(wk * 9) * 0.6, face: Math.PI + Math.sin(t * 8) * (wk > 0.25 && wk < 0.8 ? 0.4 : 0), seed: 1, ...K.walk(t, wk > 0 && wk < 1 ? (wk > 0.3 && wk < 0.75 ? 0.3 : 1) : 0), sq: wk > 0.3 && wk < 0.75 ? -0.1 : 0, alpha: K.life(t, D) });
      return {
        actors: [me, g1],
        under(c) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          K.puddle(c, P[0], P[1], 34, 1, t, 7, ice < 0.05);
          if (ice > 0) K.ice(c, P[0], P[1], 34 * 1.02, 1, P[0] - 40 + ice * 84, 7);
          if (ice > 0.95) for (let i = 0; i < 4; i++) X.px(c, P[0] - 20 + i * 12, P[1] - 4 + (i % 2) * 6, Math.floor(t * 4 + i) % 3 ? '#ffffff' : '#c4eefa');
        },
        lights: [[P[0], P[1], 50, '#9ff4ff', 0.4 * ice]],
        fx(c, A) {
          K.prep(c, me, A, t, ['cold'], 0.05, c0);
          if (t > c0 && t < c0 + 0.6) { const f = P[0] - 40 + ice * 84; for (let i = 0; i < 10; i++) { const y = P[1] - 10 + i * 2.2; X.px(c, f + (rand(i, Math.floor(t * 20)) - 0.5) * 4, y, i % 2 ? '#ffffff' : EL.cold[1]); } }
          if (wk > 0.3 && wk < 0.75) for (let k = 0; k < 2; k++) X.px(c, g1.x + 4 + k * 3, g1.y + 1, '#e0ffff');
        },
      };
    } });
})();
