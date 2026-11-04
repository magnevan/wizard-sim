/* Spell VFX vignettes, groups 4 and 5: Sigil devices and auras. Sigil is violet
 * (#d400ff): every device sits on a violet seal and binds one Sigil rune, which flies back
 * to the caster when the device is spent. Its elements are its ammo (pips over it). */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit, mod } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster, SV = EL.sigil;
  // the bound Sigil rune returning to the caster once a device is spent (e = 0..1)
  const unbind = (c, from, to, e) => { if (e <= 0 || e >= 1) return; const k = smooth(e), x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k) - Math.sin(e * Math.PI) * 14; for (let j = 1; j <= 3; j++) X.px(c, lerp(from[0], to[0], smooth(Math.max(0, e - j * 0.05))), lerp(from[1], to[1], smooth(Math.max(0, e - j * 0.05))) - Math.sin(Math.max(0, e - j * 0.05) * Math.PI) * 14, SV[2 + (j > 1)]); X.rect(c, x - 1, y - 1, 3, 3, SV[1]); X.px(c, x, y, '#ffffff'); };

  // ---- Flamethrower turret (v2): it never runs out on its own ----
  // Each burst draws one Fire rune from its OWNER's pool: a fire mote flows from the caster to
  // the turret just before every shot, and the caster's Fire pips drop. The turret keeps
  // going for as long as the owner can pay; here the owner runs dry after three bursts, the
  // last mote fizzles out halfway and the turret idles, smoking, still planted and ready.
  add({ id: 'sg-turret-fire-v2', still: 1.95, group: 'sigil', q: ['sigil', 'fire', 'fire'], cast: 'force', dur: 4.8, ground: 'path', seed: 51,
    title: 'Flamethrower turret',
    line: 'A device planted ahead that casts the flamethrower by itself at the nearest enemy. It never runs dry on its own: every burst draws a Fire rune from your pool, and it only stops when you run out.',
    frame(t, K) {
      const D = 4.8, c0 = 0.55, me = caster(t, 'sigil', c0, 0.8), T = [96, 78], L = K.life(t, D);
      const rise = easeOut(seg(t, c0, c0 + 0.3)) * (1 - seg(t, D - 0.35, D - 0.05));
      const bursts = [[1.2, 1.65], [1.95, 2.4], [2.7, 3.15]], fizz = 3.45;
      const firing = bursts.find(([a, b]) => t > a && t < b);
      // the owner's Fire pool: 3 runes, one paid as each mote leaves (0.3 s before its burst)
      const v = 3 - bursts.filter(([a]) => t > a - 0.3).length;
      const dry = t > fizz - 0.3;
      const g1 = K.gob({ id: 'g1', x: Math.max(150 - t * 8, 134) + K.kb(t, 1.35, 26, 1.2), y: 70, face: Math.PI + (t > 1.5 ? Math.PI : 0), seed: 1, ...K.walk(t, 1.1), burn: seg(t, 1.3, 1.5) * (1 - seg(t, D - 0.4, D)), alpha: L });
      const g2 = K.gob({ id: 'g2', x: 166 - Math.max(0, t - 1.0) * 14 + K.kb(t, 2.1, 22, 1.1), y: 92, face: Math.PI + (t > 2.25 ? Math.PI : 0), seed: 2, ...K.walk(t, 1.1), burn: seg(t, 2.05, 2.25) * (1 - seg(t, D - 0.4, D)), alpha: L });
      const g3 = K.gob({ id: 'g3', x: Math.max(190 - Math.max(0, t - 1.4) * 22, 140) + K.kb(t, 2.85, 24, 1.2), y: 58, face: Math.PI + (t > 3.0 ? Math.PI : 0), seed: 3, ...K.walk(t, 1.1), burn: seg(t, 2.8, 3.0) * (1 - seg(t, D - 0.4, D)), alpha: L });
      // charge: the owner's mote lands just before each burst; recoil: the crystal kicks while it fires
      const charge = bursts.reduce((m, [a]) => Math.max(m, seg(t, a - 0.12, a) * (t < a + 0.05 ? 1 : 0)), 0);
      const recoil = firing ? 0.35 + 0.35 * Math.sin(t * 40) : bursts.reduce((m, [, b]) => Math.max(m, t > b && t < b + 0.3 ? 1 - (t - b) / 0.3 : 0), 0) * 0.4;
      const stand = []; K.device(stand, T[0], T[1], 'fire', t, { rise, empty: dry && !firing, recoil, charge });
      return {
        actors: [me, g1, g2, g3], stand,
        under(c, E) { E.em((cc) => K.runeRing(cc, T[0], T[1], 12, t, rise, { dry: dry && !firing ? 1 : 0 })); },
        lights: [[T[0], T[1] - 10, 40, '#ff7a2a', (firing ? 0.8 : 0.35) * rise * (dry && !firing ? 0.3 : 1)], ...[g1, g2, g3].map((s) => [s.x, s.y - 6, 40, '#ff7020', 0.6 * s.burn])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil', 'fire', 'fire'], 0.05, c0);
          const orb = [T[0], T[1] - 17], hd = A.me.head, poolP = [Math.round(hd[0]), Math.round(hd[1]) - 16];
          // one fire mote per shot, from the owner's pool to the turret's orb
          bursts.forEach(([a], i) => { const e = (t - (a - 0.3)) / 0.3; K.mote(c, [poolP[0], poolP[1] + 2], orb, e, EL.fire, 12); if (e > 0.9 && e < 1.25) X.ring(c, orb[0], orb[1], 3 + (e - 0.9) * 20, 3 + (e - 0.9) * 16, EL.fire[1], 1 - (e - 0.9) / 0.35); });
          const tg = [A.g1.chest, A.g2.chest, A.g3.chest];
          bursts.forEach(([a, b], i) => K.cone(c, orb, tg[i], t, 'fire', a, b, { spread: 0.2, power: 0.7, reach: 1.05 }));
          for (const s of [g1, g2, g3]) K.burning(c, A, s, t, s.burn);
          // the owner is dry: the pool flashes empty, a last spark sputters out halfway, the turret idles and smokes
          if (dry) {
            const e = (t - (fizz - 0.3)) / 0.3;
            if (e > 0 && e < 1) { const p = [lerp(poolP[0], orb[0], e * 0.5), lerp(poolP[1], orb[1], e * 0.5) - Math.sin(e * 0.5 * Math.PI) * 12]; if (Math.floor(t * 20) % 2) X.px(c, p[0], p[1], e < 0.6 ? EL.fire[2] : '#6a6070'); }
            if (rise > 0.3) for (const p of emit(t, 4, 1.2, (i, age) => ({ x: orb[0] + age * 4, y: orb[1] - 2 - age * 14, age }), fizz, D)) K.puff(c, p.x, p.y, 1.5 + p.age * 2, '#4a4458', 1 - p.age);
          }
          if (t > c0 + 0.2) K.pool(c, poolP[0], poolP[1], v, 3, 'fire', t);
          if (dry && t < fizz + 0.4 && Math.floor(t * 8) % 2) X.ring(c, poolP[0], poolP[1] + 2, 8, 5, '#ff6a6a', 0.9);
        },
      };
    } });

  // ---- Stone orbitals: orbs circle you and strike whatever comes close ----
  add({ id: 'sg-orbitals-stone', group: 'sigil', q: ['sigil', 'earth', 'earth'], cast: 'area', dur: 4.2, ground: 'plaza', seed: 52,
    frame(t, K) {
      const D = 4.2, c0 = 0.55, me = caster(t, 'earth', c0, 0.8, { x: 70 }), L = K.life(t, D);
      const strikes = [1.6, 2.5], R = 19;
      const g1 = K.gob({ id: 'g1', x: Math.max(170 - t * 40, 92) + K.kb(t, strikes[0] + 0.15, 18, 0.4), y: 70, face: Math.PI, seed: 1, ...K.walk(t, t < strikes[0] ? 1 : 0), flash: K.flash(t, strikes[0] + 0.15), dead: K.down(t, strikes[0] + 0.2), alpha: L });
      const g2 = K.gob({ id: 'g2', x: 70 + Math.max(0, 50 - Math.max(0, t - 0.8) * 30) * 0.6 + K.kb(t, strikes[1] + 0.15, 10, 0.4), y: Math.min(110, 74 + Math.max(0, 50 - Math.max(0, t - 0.8) * 30)) + K.kb(t, strikes[1] + 0.15, 10, 0.4), face: -Math.PI / 2 - 0.4, seed: 2, ...K.walk(t, t < strikes[1] ? 1 : 0), flash: K.flash(t, strikes[1] + 0.15), dead: K.down(t, strikes[1] + 0.2), alpha: L });
      const born = easeOut(seg(t, c0, c0 + 0.3)) * (1 - seg(t, D - 0.3, D));
      const SP = 2.4, Z0 = 12, orbAt = (a, i) => ({ x: me.x + Math.cos(a) * R * born, y: me.y + Math.sin(a) * R * born * FY, z: Z0 + Math.sin(t * 4 + i) * 1.5 });
      const orbs = [0, 1].map((i) => { const a = t * SP + i * Math.PI; return Object.assign({ i, a }, orbAt(a, i)); });
      const stand = [];
      // the orbit itself: a faint dotted violet ellipse at orb height, split so its back
      // half passes behind the caster and its front half in front
      const live = strikes.filter((s) => t < s + 0.15).length;
      if (born > 0.3 && live) for (const back of [true, false]) stand.push([me.y + (back ? -0.5 : 0.5), (c, E) => E.em((cc) => {
        for (let k = 0; k < 64; k++) { const a = (k / 64) * TAU, sy = Math.sin(a); if ((sy < 0) !== back || (k + Math.floor(t * 10)) % 3) continue; X.px(cc, me.x + Math.cos(a) * R * born, me.y + sy * R * born * FY - Z0, SV[3]); }
      })]);
      orbs.forEach((o, i) => {
        const st = strikes[i], target = i ? g2 : g1, e = (t - st) / 0.15;
        if (t > st + 0.15) return;   // spent
        let x = o.x, y = o.y, z = o.z;
        if (e >= 0) { x = lerp(o.x, target.x, e); y = lerp(o.y, target.y, e); z = lerp(o.z, 8, e); }
        // (pass 3: smaller orbitals, as the user asked)
        stand.push([y, (c, E) => {
          X.ellipse(c, x, y, 3, 1.2, 'rgba(8,6,16,0.55)');
          E.em((cc) => {
            // a comet trail of violet behind the orb along its orbit (or its strike line)
            for (let j = 1; j <= 5; j++) { const p = e >= 0 ? { x: lerp(x, o.x, j * 0.12), y: lerp(y, o.y, j * 0.12), z: lerp(z, o.z, j * 0.12) } : orbAt(o.a - j * 0.13, i); K.sq(cc, p.x, p.y - p.z, j < 2 ? 2 : 1, j < 2 ? SV[1] : j < 4 ? SV[2] : SV[3]); }
            X.glow(cc, x, y - z, 5.5, SV[3], 0.75);
          });
          K.rock(c, x, y - z, 2.8, 30 + i);
          E.em((cc) => { X.px(cc, x, y - z, SV[1]); X.px(cc, x - 1, y - z - 1, '#ffffff'); X.ring(cc, x, y - z, 4.5, 3.8, SV[2], 0.5); });
        }]);
      });
      return {
        actors: [me, g1, g2], stand,
        under(c, E) { E.em((cc) => K.seal(cc, me.x, me.y, R + 2, t, 0.6 * born)); },
        lights: [[me.x, me.y, 30, '#d400ff', 0.3 * born]],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil', 'earth', 'earth'], 0.05, c0);
          for (const [i, st] of strikes.entries()) { const s = i ? g2 : g1, e = t - st - 0.15; K.dust(c, s.x, s.y - 2, e, 4 + i, 6, 12, '#8a7a68', 0.8); K.debris(c, s.x, s.y - 6, e, 8 + i, 8, 30); if (e > 0 && e < 0.06) X.ellipse(c, s.x, s.y - 8, 6, 6, '#ffffff'); }
          if (born > 0.5) K.ammo(c, me.x, me.y - 36, 2 - strikes.filter((s) => t > s + 0.15).length, 2, 'earth');
          unbind(c, [me.x, me.y - 14], A.me.head, seg(t, strikes[1] + 0.4, strikes[1] + 0.8));
        },
      };
    } });

  // ---- Fire glyph: write a trap on the ground; it arms, an enemy steps on it, it goes off ----
  add({ id: 'sg-glyph-fire', group: 'sigil', q: ['sigil', 'fire', 'fire'], cast: 'place', dur: 4.4, ground: 'path', seed: 53,
    frame(t, K) {
      const D = 4.4, c0 = 0.55, me = caster(t, 'sigil', c0, 0.8), P = [128, 76], L = K.life(t, D);
      const draw = seg(t, c0, c0 + 0.5), armed = t > c0 + 0.9, trig = 2.4, e = t - trig;
      const gx = 186 - Math.max(0, t - 0.8) * 37;
      const g1 = K.gob({ id: 'g1', x: Math.max(gx, P[0] + 1) + (e > 0 ? K.kb(t, trig, 18, 0.6) : 0), y: P[1] + 1, face: Math.PI + (e > 0.3 ? Math.PI : 0), seed: 1, ...K.walk(t, 1.2), z: K.hop(t, trig, 9, 0.4), burn: seg(t, trig, trig + 0.15) * (1 - seg(t, D - 0.4, D)), flash: K.flash(t, trig), alpha: L });
      const patch = e > 0 ? easeOut(seg(e, 0, 0.3)) * (1 - seg(t, D - 0.5, D)) : 0;
      return {
        actors: [me, g1], shake: e > 0 && e < 0.25 ? 2 : 0,
        under(c, E) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, X.TEAM.p1.light, seg(t, c0 - 0.4, c0));
          if (draw > 0 && e < 0) E.em((cc) => K.glyph(cc, P[0], P[1], 13, SV, t, { draw, armed, inner: 'fire', innerCol: EL.fire[1] }));
          if (patch > 0) { X.poly(c, K.blobPts(P[0], P[1], 20 * patch, 9 * patch, 3), 'rgba(26,16,14,0.75)'); X.poly(c, K.blobPts(P[0], P[1], 14 * patch, 6 * patch, 3), 'rgba(90,30,16,0.6)'); }
        },
        // the burning patch lights only itself and its victim (tight, not the whole scene)
        lights: [[P[0], P[1], 26, '#d400ff', armed && e < 0 ? 0.35 + 0.15 * Math.sin(t * 5) : 0], [P[0], P[1] - 2, 30, '#ff7020', 0.75 * patch], ...(e > 0 && e < 0.35 ? [[P[0], P[1], 54, '#ffd8a0', 1 * (1 - e / 0.35)]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil', 'fire', 'fire'], 0.05, c0);
          if (e > 0 && e < 0.08) X.ellipse(c, P[0], P[1] - 4, 16, 10, '#fff4c0');
          if (e > 0 && e < 0.4) { K.gring(c, P[0], P[1], 6 + e * 80, EL.fire[1], 1 - e / 0.4, 2); K.gring(c, P[0], P[1], 4 + e * 50, SV[1], 0.8 - e / 0.4, 1); }
          if (patch > 0.02) for (let i = 0; i < 14; i++) { const a = rand(i, 41) * TAU, r = Math.sqrt(rand(i, 42)) * 16 * patch; K.tongue(c, P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r * 0.45, 2.2, (5 + 3 * Math.sin(t * 13 + i * 2) + rand(i, 43) * 3) * patch, Math.sin(t * 6 + i) * 1.5); }
          K.burning(c, A, g1, t, g1.burn);
          unbind(c, [P[0], P[1] - 4], A.me.head, seg(t, trig + 0.2, trig + 0.6));
        },
      };
    } });

  // ---- Line glyph (Lightning): drag a line; whoever crosses it calls lightning down its length ----
  add({ id: 'sg-line-glyph', group: 'sigil', q: ['sigil', 'lightning', 'lightning'], cast: 'place', opts: { drag: true }, dur: 4.4, ground: 'grass', seed: 54,
    frame(t, K) {
      const D = 4.4, d0 = 0.35, d1 = 0.95, me = caster(t, 'sigil', d1, 1.2, K.pose(t, 0.05, d1, 1.2)), L = K.life(t, D);
      const path = [[118, 40], [114, 74], [120, 110]], P = K.sample(path, 2);
      const draw = seg(t, d0, d1), armed = t > d1 + 0.4;
      const lx = (y) => { let b = P[0]; for (const p of P) if (Math.abs(p[1] - y) < Math.abs(b[1] - y)) b = p; return b[0]; };
      const trig = 2.3, e = t - trig, on = e > 0 && e < 0.6;
      const mk = (id, y, x0, seed) => K.gob({ id, x: Math.max(x0 - Math.max(0, t - 0.6) * 30, lx(y) - 4) - (e > 0 ? K.kb(t, trig + 0.5, -10, 0.4) : 0), y, face: Math.PI, seed, ...K.walk(t, e > 0 ? 0 : 1), shock: on ? 1 : 0, dead: K.down(t, trig + 0.55) * 0.8, alpha: L });
      const en = [mk('g1', 58, 160, 1), mk('g2', 80, 166, 2), mk('g3', 98, 172, 3)];
      return {
        actors: [me, ...en], shake: on && e < 0.3 ? 1.5 : 0,
        under(c, E) {
          if (t > d0 - 0.1 && t < d1 + 0.05) { K.dragPath(c, P, draw, X.TEAM.p1.light, t); const n = Math.floor((P.length - 1) * draw); K.reticle(c, P[n][0], P[n][1], t, X.TEAM.p1.light, 1); }
          if (t > d0 && e < 0) E.em((cc) => K.lineGlyph(cc, path, SV, t, draw, armed));
          if (e > 0) for (let i = 0; i < P.length; i += 2) X.px(c, P[i][0], P[i][1], 'rgba(26,18,30,0.8)');
        },
        lights: [...(armed && e < 0 ? [[116, 74, 40, '#d400ff', 0.3]] : []), ...(on ? [[116, 74, 110, '#c4a4ff', 1.1 * (1 - e / 0.6)]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil', 'lightning', 'lightning'], 0.05, d0);
          if (on && Math.floor(t * 30) % 2 === 0) for (let k = 0; k < 4; k++) { const p = P[Math.floor((k + 0.5) / 4 * P.length)], pts = K.bolt([p[0] + 10, -6], [p[0], p[1] - 1], 300 + k * 7 + Math.floor(t * 30), 0.25, 4); X.lines(c, pts, EL.lightning[3], 3); X.lines(c, pts, '#ffffff', 1); }
          if (on) { for (let i = 0; i < P.length; i++) if (rand(i, Math.floor(t * 20)) < 0.5) X.px(c, P[i][0] + (rand(i, 3) - 0.5) * 3, P[i][1] - rand(i, 4) * 4, i % 3 ? EL.lightning[1] : '#ffffff'); for (const s of en) K.zapHit(c, A[s.id].chest, Math.floor(t * 18) + s.seed); }
          unbind(c, [116, 70], A.me.head, seg(t, trig + 0.4, trig + 0.8));
        },
      };
    } });

  // ---- Lens (pass 3): near instant, and a proper lens ----
  // A ringed violet lens stands on its seal: a bright rim with a white highlight, an inner
  // ring, slow rune ticks round it and a refraction shimmer sliding across the glass. A pebble
  // flicks in and a boulder bursts straight out, wider, brighter and haloed in violet.
  add({ id: 'sg-lens', still: 1.66, group: 'sigil', q: ['sigil'], cast: 'place', dur: 3.4, ground: 'path', seed: 55,
    line: 'A floating lens placed at the cursor. Any spell cast through it, yours or an ally’s, comes out bigger and stronger. Here: a small rock goes in, a boulder comes out.',
    frame(t, K) {
      const D = 3.4, c0 = 0.55, rel = 1.45, Lx = [92, 74], L = K.life(t, D);
      const me = caster(t, t < 1.0 ? 'sigil' : 'earth', c0, 0.8);
      if (t > 1.0) Object.assign(me, K.pose(t, 1.05, rel, rel + 0.2));
      const up = easeOut(seg(t, c0, c0 + 0.3)) * (1 - seg(t, D - 0.35, D));
      const tIn = rel + 0.09, tOut = tIn + 0.04, hit = tOut + 0.15;
      const pass = Math.max(0, 1 - Math.abs(t - (tIn + 0.02)) / 0.14);
      const g1 = K.gob({ id: 'g1', x: 152 + K.kb(t, hit, 32, 0.5), y: 72, face: Math.PI, seed: 1, flash: K.flash(t, hit), dead: K.down(t, hit + 0.15), z: K.hop(t, hit, 9, 0.4), alpha: L });
      const g2 = K.gob({ id: 'g2', x: 170, y: 92, face: Math.PI, seed: 2 });
      const zL = 18, lensR = () => ({ rx: (5 + pass * 1.5) * up, ry: (12 + pass * 1.5) * up, cy: Lx[1] - zL - Math.sin(t * 3) * 1 });
      const stand = up > 0.02 ? [[Lx[1], (c, E) => E.em((cc) => {
        const { rx, ry, cy } = lensR(), x0 = Lx[0];
        X.ellipse(cc, x0, cy, rx - 1, ry - 1, '#e8c0ff', 0.16 + 0.5 * pass);
        // refraction shimmer: two bright slants sliding across the glass
        for (let s = 0; s < 2; s++) {
          const off = PB.mod(t * 0.8 + s * 0.5, 1) * 2.4 - 1.2;
          for (let y = -ry + 1; y < ry; y++) { const x = x0 + off * rx - (y / ry) * 2; if (((x - x0) / (rx - 0.5)) ** 2 + (y / (ry - 0.5)) ** 2 < 0.85) X.px(cc, x, cy + y, s ? SV[0] : '#ffffff'); }
        }
        X.ring(cc, x0, cy, rx + 2, ry + 2, SV[3], 0.7);
        X.ring(cc, x0, cy, rx + 1, ry + 1, SV[2], 1);
        X.ring(cc, x0, cy, rx, ry, pass > 0.3 ? '#ffffff' : SV[1], 1);
        X.ring(cc, x0, cy, rx * 0.55, ry * 0.72, SV[2], 0.55);
        X.ring(cc, x0, cy, rx, ry, '#ffffff', 1, 3.5, 4.5);   // the highlight on the upper left of the rim
        for (let k = 0; k < 4; k++) { const a = t * 1.6 + k * Math.PI / 2; X.px(cc, x0 + Math.cos(a) * (rx + 3.5), cy + Math.sin(a) * (ry + 3.5), k % 2 ? SV[1] : SV[0]); }
      })]] : [];
      return {
        actors: [me, g1, g2], stand, shake: t > hit && t < hit + 0.25 ? 2.5 : pass > 0.5 ? 0.8 : 0,
        under(c, E) { if (t > c0 - 0.45 && t < c0 + 0.08) K.reticle(c, Lx[0], Lx[1], t, X.TEAM.p1.light, seg(t, c0 - 0.45, c0)); E.em((cc) => K.seal(cc, Lx[0], Lx[1], 7, t, up)); if (t > tOut && t < hit) X.ellipse(c, lerp(Lx[0], g1.x, seg(t, tOut, hit)), 74, 7, 2.5, 'rgba(8,6,16,0.5)'); },
        lights: [[Lx[0], Lx[1] - 8, 30, '#d400ff', 0.45 * up], ...(pass > 0.02 ? [[Lx[0], Lx[1] - 10, 70, '#f0c0ff', 1.1 * pass]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil'], 0.05, c0);
          // placed, not thrown: the bound rune hops from the staff to the cursor and the lens opens there
          if (t > c0 && t < c0 + 0.2) K.mote(c, A.me.tip, [Lx[0], Lx[1] - 18], (t - c0) / 0.2, SV, 8);
          K.prep(c, me, A, t, ['earth'], 1.05, rel);
          const tip = A.me.tip, { rx, ry, cy } = lensR(), lc = [Lx[0], cy], tgt = [g1.x - 2, 62];
          // in: a pebble flicked into the glass
          if (t > rel && t <= tIn) { const e = seg(t, rel, tIn), p = [lerp(tip[0], lc[0], e), lerp(tip[1], lc[1], e)]; for (let j = 1; j <= 3; j++) X.px(c, p[0] - j * 3, p[1], K.ROCK[1 + j]); K.rock(c, p[0], p[1], 1.8, 7); }
          // through: a flash on the rim and rings thrown off it
          if (t > tIn && t < tIn + 0.35) { const e = (t - tIn) / 0.35; for (let k = 0; k < 3; k++) { const q = Math.min(1, e * (1 + k * 0.4)); X.ring(c, lc[0], lc[1], rx + 1 + q * 14, ry + 1 + q * 9, k ? SV[k] : '#ffffff', 1 - q); } if (e < 0.2) X.ellipse(c, lc[0], lc[1], rx, ry, '#ffffff', 0.7); }
          // out: a boulder three times the size, haloed, its wake widening from the lens
          if (t >= tOut && t < hit) {
            const k = seg(t, tOut, hit), p = [lerp(lc[0] + 4, tgt[0], k), lerp(lc[1], tgt[1], k)];
            for (let j = 0; j <= 10; j++) { const q = j / 10, x = lerp(lc[0] + 2, p[0] - 6, q); X.px(c, x, lerp(lc[1] - ry * 0.7, p[1] - 8, q), SV[2]); X.px(c, x, lerp(lc[1] + ry * 0.7, p[1] + 8, q), SV[2]); }
            for (let j = 1; j <= 7; j++) K.sq(c, p[0] - j * 4, p[1] + (j % 2) - 0.5, j < 3 ? 4 : 3, j < 3 ? '#ffffff' : j < 5 ? SV[1] : SV[2]);
            X.glow(c, p[0], p[1], 14, SV[2], 0.85);
            K.rock(c, p[0], p[1], 7.5, 7); X.ring(c, p[0], p[1], 9.5, 8.5, SV[1], 1); X.px(c, p[0] - 4, p[1] - 5, '#ffffff'); X.px(c, p[0] - 3, p[1] - 5, SV[0]);
          }
          if (t > hit && t < hit + 0.08) X.ellipse(c, tgt[0], tgt[1], 14, 12, '#ffffff');
          if (t > hit && t < hit + 0.45) K.gring(c, g1.x - 4, 72, 6 + (t - hit) * 60, K.ROCK[0], 1 - (t - hit) / 0.45, 1);
          K.dust(c, g1.x, 72, t - hit, 5, 12, 26, '#8a7a68', 1.1); K.debris(c, tgt[0], tgt[1] + 4, t - hit, 9, 16, 55);
        },
      };
    } });

  // ---- Rune motes: three motes; each cast spends one and refunds part of a rune ----
  // (pass 3: a spent mote no longer jumps onto your head: it spirals into you along its orbit)
  add({ id: 'sg-motes', group: 'sigil', q: ['sigil'], cast: 'area', dur: 4.4, ground: 'plaza', seed: 56,
    line: 'Three motes circle you. Each cast spends one and gives back part of one rune of that spell. Watch the Fire pool refill a little after each spray.',
    frame(t, K) {
      const D = 4.4, c0 = 0.55, casts = [[1.55, 1.95], [2.6, 3.0], [3.45, 3.85]], SPIN = 0.5;
      const busy = casts.find(([a, b]) => t > a - 0.45 && t < b + 0.2);
      const me = caster(t, 'fire', c0, 0.8, busy ? K.pose(t, busy[0] - 0.45, busy[0], busy[1]) : K.pose(t, 0.05, c0, 0.8));
      if (t > 1) me.el = 'fire';
      const spent = casts.filter(([a]) => t > a + 0.3).length;
      // fire pool: each spray costs 1 rune, each mote refunds 0.4 once it has spun in
      let v = 3; for (const [a] of casts) { if (t > a) v -= 1; if (t > a + 0.3 + SPIN) v += 0.4; }
      v = Math.max(0, v);
      const born = easeOut(seg(t, c0, c0 + 0.3)) * (1 - seg(t, D - 0.3, D) * (spent < 3 ? 1 : 0));
      const g1 = K.gob({ id: 'g1', x: 140, y: 66, face: Math.PI, seed: 1, burn: seg(t, 1.8, 2.0) * (1 - seg(t, D - 0.35, D)) });
      return {
        actors: [me, g1],
        under(c, E) { if (spent < 3) E.em((cc) => K.seal(cc, ME.x, ME.y, 15, t, 0.5 * born)); },
        lights: [[ME.x, ME.y - 6, 30, '#d400ff', 0.3 * born], ...casts.filter(([a, b]) => t > a && t < b).map(() => [100, 70, 50, '#ff7a2a', 0.6])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil'], 0.05, c0);
          if (busy) K.prep(c, me, A, t, ['fire'], busy[0] - 0.45, busy[0]);
          for (const [a, b] of casts) K.cone(c, A.me.tip, [130, 64], t, 'fire', a, b, { spread: 0.24, power: 0.7 });
          K.burning(c, A, g1, t, g1.burn);
          const MR = 16, CY0 = ME.y - 12, mo = (ang, r = MR * born, cy = CY0) => [ME.x + Math.cos(ang) * r, cy + Math.sin(ang) * r * FY];
          const left = casts.filter(([a]) => t < a + 0.3).length;
          if (born > 0.3 && left) for (let k = 0; k < 56; k++) if ((k + Math.floor(t * 10)) % 3 === 0) { const p = mo((k / 56) * TAU); X.px(c, p[0], p[1], SV[3]); }
          const ch = A.me.chest;
          for (let i = 0; i < 3; i++) {
            const [a] = casts[i], e = (t - a - 0.3) / SPIN;
            const ang = t * 2.2 + i * TAU / 3, [x, y] = mo(ang);
            if (e < 0) {
              if (born > 0.05) {
                for (let j = 1; j <= 5; j++) { const p = mo(ang - j * 0.14); K.sq(c, p[0], p[1], j < 3 ? 2 : 1, j < 2 ? SV[1] : j < 4 ? SV[2] : SV[3]); }
                X.glow(c, x, y, 6, SV[2], 0.8); X.rect(c, x - 2, y - 1, 5, 3, SV[1]); X.rect(c, x - 1, y - 2, 3, 5, SV[1]); X.rect(c, x - 1, y - 1, 3, 3, SV[0]); X.px(c, x, y, '#ffffff');
              }
              continue;
            }
            // spent: it keeps its orbit but the orbit tightens, spinning faster, until it sinks into the caster
            const at = (q) => { const k = smooth(Math.min(1, q)), a2 = t * 2.2 + i * TAU / 3 + q * q * 5.5; return mo(a2, MR * born * (1 - k), lerp(CY0, ch[1], k)); };
            if (e < 1) {
              const col = e < 0.55 ? SV : EL.fire;
              for (let j = 1; j <= 6; j++) { const q = Math.max(0, e - j * 0.05), p = at(q); K.sq(c, p[0], p[1], j < 3 ? 2 : 1, j < 2 ? col[1] : j < 4 ? col[2] : SV[3]); }
              const p = at(e); X.glow(c, p[0], p[1], 5, col[2], 0.75); X.rect(c, p[0] - 1, p[1] - 1, 3, 3, col[1]); X.px(c, p[0], p[1], '#ffffff');
            }
            // absorbed: a warm flash in the chest and a ring on the Fire pool as it refills
            if (e >= 1 && e < 1.7) { const q = (e - 1) / 0.7, hd = A.me.head; if (q < 0.3) X.glow(c, ch[0], ch[1], 7 * (1 - q), EL.fire[1], 0.9); X.ring(c, hd[0], hd[1] - 13, 6 + q * 8, 3 + q * 4, EL.fire[1], 1 - q); }
          }
          K.pool(c, Math.round(A.me.head[0]), Math.round(A.me.head[1]) - 16, v, 4, 'fire', t);
        },
      };
    } });

  // ---- Blink (pass 4, replaces the waypoint glyph): Sigil alone, Force ----
  // A brute closes in and winds up an overhead smash. The caster aims away (a short dotted
  // aim line), and on the cast dissolves into pixels that streak a short way along the aim
  // and reassemble there, in about a fifth of a second. No glyph, no column of light. The
  // smash lands on the empty spot. The Sigil rune stays bound for a moment (a violet mote
  // circling the caster's head) before it comes back, so blinks can't be chained.
  add({ id: 'sg-blink', still: 1.98, group: 'sigil', q: ['sigil'], cast: 'force', dur: 3.8, ground: 'path', seed: 57,
    frame(t, K) {
      const D = 3.8, c0 = 1.82, rel = 1.9, O = [84, 64], W = [50, 98], L = K.life(t, D);
      const gone = t > rel, at = gone ? W : O, aim = K.faceTo(O, W);
      const alpha = t < rel ? 1 - seg(t, rel - 0.07, rel - 0.01) : seg(t, rel + 0.09, rel + 0.17);
      const face = t < 1.0 ? 0 : t < rel ? aim : t < rel + 0.5 ? aim : K.faceTo(W, [110, 64]);
      const me = K.wiz(Object.assign({ id: 'me', team: 'p1', x: at[0], y: at[1], face, el: 'sigil', seed: 3, alpha, flash: t > rel + 0.09 && t < rel + 0.2 ? 0.5 : 0, flashCol: SV[0] }, K.pose(t, 1.25, c0, c0 + 0.12)));
      // the brute: walks in, raises both fists (smash 0..1, the slam lands at 0.55)
      const bx = Math.max(176 - t * 60, 106), sm = (t - 1.45) / 1.1;
      const br = K.brute({ id: 'b1', x: bx, y: 64, face: Math.PI + (t > 2.6 ? Math.sin((t - 2.6) * 3) * 0.6 : 0), seed: 4, ...K.walk(t, bx > 106.5 ? 0.9 : 0), smash: sm >= 0 && sm < 1 ? sm : -1, alpha: L });
      const slam = 1.45 + 0.55 * 1.1, e = t - slam;
      const TEAM = X.TEAM.p1, cols = [TEAM.main, TEAM.light, SV[1], SV[0], '#ffffff', TEAM.dark];
      const bound = gone && t < 3.1;
      return {
        actors: [me, br], shake: e > 0 && e < 0.25 ? 2.2 : 0,
        under(c) { if (e > 0) { K.cracks(c, 92, 66, 16, 5, seg(e, 0, 0.2), '#1a120c', 6); K.scorch(c, 92, 66, 8, 0.35 * (1 - seg(t, D - 0.5, D))); } },
        lights: [...(t > rel - 0.08 && t < rel + 0.3 ? [[W[0], W[1], 46, '#ee8cff', 0.7], [O[0], O[1], 36, '#ee8cff', 0.5]] : []), [at[0], at[1] - 8, 24, '#d400ff', bound ? 0.35 : 0]],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil'], 1.25, c0);
          // the aim: a short dotted line from the caster along where the blink will go
          if (t > 1.3 && t < rel - 0.05) { const k = seg(t, 1.3, 1.6); for (let i = 3; i <= 24; i++) if (i / 24 <= k && (i + Math.floor(t * 16)) % 3 === 0) X.px(c, lerp(O[0], W[0], i / 26), lerp(O[1], W[1], i / 26), TEAM.light); }
          // the blink: 48 pixels of the body, each leaving from its own spot and landing on the same spot of the body
          for (let i = 0; i < 48; i++) {
            const bxp = (rand(i, 1) - 0.5) * 9, bz = 1 + rand(i, 2) * 22, t0 = rel - 0.07 + rand(i, 3) * 0.05 + (bz / 23) * 0.02, q0 = (t - t0) / 0.11;
            if (q0 < 0 || q0 > 1.15) continue;
            const q = Math.min(1, q0), k = q * q * (3 - 2 * q), x = lerp(O[0] + bxp, W[0] + bxp, k), y = lerp(O[1] - bz, W[1] - bz, k);
            X.px(c, x, y, q0 > 1 ? '#ffffff' : cols[i % cols.length]);
            if (q0 < 1) { const k2 = Math.max(0, q - 0.18), k3 = k2 * k2 * (3 - 2 * k2); X.px(c, lerp(O[0] + bxp, W[0] + bxp, k3), lerp(O[1] - bz, W[1] - bz, k3), SV[2]); }
          }
          if (t > rel - 0.07 && t < rel + 0.05) { const q = (t - rel + 0.07) / 0.12; X.ring(c, O[0], O[1] - 10, 10 * (1 - q) + 1, 12 * (1 - q) + 1, SV[1], 1 - q * 0.5); }
          if (t > rel + 0.08 && t < rel + 0.4) { const q = (t - rel - 0.08) / 0.32; K.gring(c, W[0], W[1], 4 + q * 12, SV[1], 1 - q, 1); }
          // the smash lands where the caster was
          if (e > 0 && e < 0.08) X.ellipse(c, 92, 62, 9, 7, '#ffffff');
          K.dust(c, 92, 66, e, 6, 10, 20, '#8a7a68', 0.9); K.debris(c, 92, 62, e, 7, 10, 40);
          // the bound Sigil rune circles the caster's head, then sinks back in (no chaining)
          if (gone && A.me && A.me.head && t < 3.25) {
            const h = A.me.head, sink = seg(t, 2.95, 3.25), a = t * 5, r = 6 * (1 - sink);
            const x = h[0] + Math.cos(a) * r, y = h[1] - 4 + Math.sin(a) * r * 0.45 + sink * 6;
            if (t > rel + 0.2) { X.glow(c, x, y, 3, SV[2], 0.7); X.rect(c, x - 1, y - 1, 2, 2, SV[1]); X.px(c, x, y, '#ffffff'); }
          }
        },
      };
    } });

  // ---- Double: a copy that enemies target, repeating your spells at half power ----
  // (pass 3: it visibly materialises from motes drawn out of the caster; it is a translucent
  // violet-edged copy; and its repeat is the same lightning arc, half as strong, cast from its
  // own spot, paid for by motes that flow from the caster to it)
  add({ id: 'sg-double', still: 2.62, group: 'sigil', q: ['sigil'], cast: 'self', dur: 4.8, ground: 'path', seed: 58,
    line: 'A copy of you that enemies target. It repeats each spell you cast at half power from its own spot, paying half that spell’s runes.',
    frame(t, K) {
      const D = 4.8, c0 = 0.55, m0 = c0 + 0.05, m1 = m0 + 0.7, a0 = 2.25, a1 = 3.0, d0 = a0 + 0.28, d1 = a1 + 0.28, L = K.life(t, D);
      const me = caster(t, 'lightning', c0, 0.8, { x: 40, y: 88 });
      if (t > 1.4) Object.assign(me, K.pose(t, 1.75, a0, a1));
      const born = smooth(seg(t, m0 + 0.25, m1)) * (1 - seg(t, D - 0.3, D)), DB = [60, 54];
      const db = K.wiz({ id: 'dbl', team: 'p1', x: DB[0], y: DB[1], face: 0.1, el: 'lightning', seed: 9, alpha: 0.78 * born, tint: '#8a6aff', tintK: 0.3, outline: SV[1], ...(t > 1.4 ? K.pose(t, 1.95, d0, d1) : {}) });
      const ar = K.archer({ id: 'a1', x: 162, y: 48, face: Math.PI, seed: 4, draw: mod(t * 0.9, 1) > 0.3 && born > 0.5 ? seg(mod(t * 0.9, 1), 0.3, 0.9) : 0 });
      const en = [['g1', 122, 64, 1], ['g2', 138, 84, 2]].map(([id, x, y, seed], i) => { const hit = (t > a0 && t < a1) || (i === 0 && t > d0 && t < d1); return K.gob({ id, x, y, face: born > 0.5 ? K.faceTo([x, y], DB) : Math.PI, seed, shock: hit ? 1 : 0, dead: K.down(t, d1) * 0.6, alpha: L }); });
      const lit = (t > a0 && t < a1) && Math.floor(t * 18) % 3 !== 2, lit2 = (t > d0 && t < d1) && Math.floor(t * 18 + 1) % 3 !== 2;
      return {
        actors: [me, db, ar, ...en],
        under(c, E) { E.em((cc) => K.seal(cc, DB[0], DB[1], 9, t, Math.max(born, seg(t, m0, m0 + 0.2) * (1 - seg(t, D - 0.3, D))))); },
        lights: [[DB[0], DB[1] - 8, 34, '#d400ff', 0.45 * born + (t > m0 && t < m1 ? 0.4 : 0)], ...(lit || lit2 ? en.map((s) => [s.x, s.y - 6, 40, '#b08aff', 0.6]) : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil'], 0.05, c0);
          if (t > 1.7) K.prep(c, me, A, t, ['lightning'], 1.75, a0);
          // materialising: violet motes stream out of the caster to the spot, and a ring of light
          // climbs the copy as it fills in from the feet up
          if (t > m0 && t < m1) {
            for (let i = 0; i < 10; i++) { const e = (t - m0 - i * 0.04) / 0.32; if (e > 0 && e < 1) K.mote(c, A.me.chest, [DB[0], DB[1] - 10], e, SV, 10); }
            const e = seg(t, m0 + 0.25, m1), y = DB[1] - e * 24;
            if (e > 0 && e < 1) { X.ring(c, DB[0], y, 7, 2.5, SV[0], 1); X.ring(c, DB[0], y + 1, 6, 2, SV[2], 0.8); for (let k = 0; k < 6; k++) X.px(c, DB[0] + (rand(k, Math.floor(t * 20)) - 0.5) * 14, y - rand(k, 9) * 4, k % 2 ? '#ffffff' : SV[1]); }
          }
          if (born > 0.05 && A.dbl) for (let k = 0; k < 4; k++) { const ang = t * 3 + k * 1.57; X.px(c, DB[0] + Math.cos(ang) * 9, DB[1] - 10 + Math.sin(ang) * 4, SV[k % 2 ? 1 : 2]); }
          // enemies aim at the double: red dotted sight lines, and the archer's arrows go to it
          if (born > 0.6 && t < a0 + 0.2) for (const s of en) { const a = A[s.id], d = A.dbl; if (a && a.head && d && d.chest) for (let i = 2; i < 18; i++) if ((i + Math.floor(t * 14)) % 3 === 0) X.px(c, lerp(a.head[0], d.chest[0], i / 20), lerp(a.head[1], d.chest[1], i / 20), '#ff6a6a'); }
          if (born > 0.5) { const e = mod(t * 0.9, 1); if (e < 0.25) { const k = e / 0.25, src = A.a1.bowTip, dst = A.dbl.chest; K.arrow(c, lerp(src[0], dst[0], k), lerp(src[1], dst[1], k), Math.atan2(dst[1] - src[1], dst[0] - src[0])); } }
          // the caster's arc: full power, through both goblins
          const seed = Math.floor(t * 18);
          if (lit) { const nodes = [A.me.tip, A.g2.chest, A.g1.chest]; for (let i = 1; i < nodes.length; i++) { K.zap(c, nodes[i - 1], nodes[i], seed * 13 + i); K.zapHit(c, nodes[i], seed + i); } }
          // paying for the repeat: two lightning motes flow from the caster to the double
          for (let i = 0; i < 2; i++) { const e = (t - (a0 - 0.05 + i * 0.12)) / 0.3; if (A.dbl) K.mote(c, A.me.chest, A.dbl.chest, e, EL.lightning, 12); }
          // the double's repeat: the same arc, half strength (thin, no branches, one jump), from its own spot
          if (lit2 && A.dbl) { const pts = K.bolt(A.dbl.tip, A.g1.chest, seed * 5 + 3, 0.3, 3); X.lines(c, pts, EL.lightning[3], 2); X.lines(c, pts, EL.lightning[1], 1); const z = A.g1.chest; X.glow(c, z[0], z[1], 5, EL.lightning[2], 0.7); X.px(c, z[0], z[1], '#ffffff'); }
        },
      };
    } });

  // ---- Sculpting wand: while you hold it, your spells spare allies ----
  add({ id: 'sg-wand', still: 2.1, group: 'sigil', q: ['sigil'], cast: 'conjure', dur: 4, ground: 'plaza', seed: 59,
    line: 'A conjured wand. While you hold it, your spells spare allies: the arcane nova blasts the goblins and parts around your friend.',
    frame(t, K) {
      // a slower nova than the plain one, so the moment it parts around the ally can be seen
      const D = 4, c0 = 0.55, n0 = 1.7, RM = 66, dur = 0.95, L = K.life(t, D), CY = ME.y - 2;
      const me = caster(t, 'arcane', c0, 0.8); if (t > 1) Object.assign(me, K.pose(t, 1.25, n0, n0 + 0.25));
      const front = (tt) => { const e = (tt - n0) / dur; return e < 0 ? -1 : 4 + (RM - 4) * easeOut(Math.min(1, e)); };
      const dist = (x, y) => Math.hypot(x - ME.x, (y - CY) / FY);
      const at = (x, y) => { const d = dist(x, y); for (let k = 0; k < 80; k++) { const tt = n0 + k * 0.015; if (front(tt) >= d) return tt; } return 99; };
      const al = K.wiz({ id: 'ally', team: 'p2', x: 86, y: 68, face: 0.2, el: 'water', seed: 7 });
      const mk = (id, x, y, seed) => { const th = at(x, y), ang = Math.atan2((y - ME.y) / FY, x - ME.x), k = K.kb(t, th, 16, 0.3); return K.gob({ id, x: x + Math.cos(ang) * k, y: y + Math.sin(ang) * k * FY, face: ang + Math.PI, seed, flash: K.flash(t, th), dead: K.down(t, th + 0.1), z: K.hop(t, th, 5, 0.3), alpha: L }); };
      const en = [mk('g1', 98, 44, 1), mk('g2', 96, 92, 2), mk('g3', 72, 104, 3)];
      const wand = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D)), spared = at(al.x, al.y);
      // the ally's bubble: up as the front arrives, held while it streams round, then gone
      const bub = Math.min(seg(t, spared - 0.22, spared - 0.08), 1 - seg(t, spared + 0.75, spared + 1.0));
      const AG = [al.x - ME.x, (al.y - CY) / FY], AD = Math.hypot(AG[0], AG[1]), AA = Math.atan2(AG[1], AG[0]), RB = 11;
      // one point of the blast front, bent round the ally's bubble (ground space -> screen)
      const bent = (th, r) => {
        let gx = Math.cos(th) * r, gy = Math.sin(th) * r;
        if (bub > 0.05) { const dx = gx - AG[0], dy = gy - AG[1], dd = Math.hypot(dx, dy); if (dd < RB) { const s = dd > 0.01 ? RB / dd : 1; gx = AG[0] + dx * s; gy = AG[1] + dy * s; } }
        return [ME.x + gx, CY + gy * FY];
      };
      // behind the ally the front stays open for a while (the wake), then closes
      const wake = (th, r) => { const da = Math.abs(PB.mod(th - AA + Math.PI, TAU) - Math.PI), half = Math.asin(Math.min(1, RB / AD)); return da < half && r > AD && r - AD < 34 * (1 - da / half); };
      return {
        actors: [me, al, ...en],
        lights: [...(t > n0 && t < n0 + 0.8 ? [[ME.x, ME.y, 90, '#ff4f9b', 0.85 * (1 - seg(t, n0, n0 + 0.8))]] : []), [ME.x + 6, ME.y - 14, 24, '#d400ff', 0.6 * wand], [al.x, al.y - 6, 30, '#d400ff', 0.6 * bub]],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil'], 0.05, c0);
          if (t > 1.2) K.prep(c, me, A, t, ['arcane'], 1.25, n0);
          // the wand in the off hand: a 10 px violet rod, outlined, with a white star tip.
          // It is raised while the nova gathers and flicks forward on the cast, leaving a trail.
          if (wand > 0.05) {
            const h = A.me.hands[0], sw = smooth(seg(t, n0 - 0.12, n0 + 0.08)) * (1 - smooth(seg(t, n0 + 0.5, n0 + 0.9)));
            const angAt = (k) => lerp(-1.3, -0.15, k), L2 = 10 * Math.min(1, wand * 1.5), tipAt = (k) => [h[0] + Math.cos(angAt(k)) * L2, h[1] + Math.sin(angAt(k)) * L2];
            const tp = tipAt(sw);
            if (t > n0 - 0.12 && t < n0 + 0.35) for (let j = 0; j < 7; j++) { const k = Math.max(0, sw - j * 0.09), p = tipAt(k); K.sq(c, p[0], p[1], j < 3 ? 2 : 1, j < 2 ? '#ffffff' : j < 4 ? SV[1] : SV[2]); }
            X.line(c, h[0], h[1], tp[0], tp[1], '#1a0e24', 3); X.line(c, h[0], h[1], tp[0], tp[1], SV[2], 1);
            X.line(c, h[0], h[1], lerp(h[0], tp[0], 0.5), lerp(h[1], tp[1], 0.5), SV[3], 1);
            X.glow(c, tp[0], tp[1], 6, SV[2], 0.8);
            X.rect(c, tp[0] - 1, tp[1] - 1, 3, 3, SV[0]); X.px(c, tp[0], tp[1] - 2, '#ffffff'); X.px(c, tp[0], tp[1] + 2, '#ffffff'); X.px(c, tp[0] - 2, tp[1], '#ffffff'); X.px(c, tp[0] + 2, tp[1], '#ffffff');
            for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; X.px(c, tp[0] + Math.cos(a) * 5, tp[1] + Math.sin(a) * 4, SV[1]); }
            if (t > c0 && t < c0 + 0.3) { const e = (t - c0) / 0.3; X.ring(c, tp[0], tp[1], 2 + e * 10, 2 + e * 8, SV[1], 1 - e); }
          }
          // the nova, drawn point by point so it can bend round the ally
          const e = (t - n0) / dur;
          if (e > 0 && e < 1.25) {
            const r = front(t), a = 1 - seg(e, 0.6, 1.2), N = 150, R = EL.arcane;
            if (e < 0.06) X.ellipse(c, ME.x, CY - 4, 10, 8, '#ffffff', 1 - e / 0.06);
            for (let i = 0; i < N; i++) {
              const th = (i / N) * TAU; if (wake(th, r)) continue;
              for (const [dr, col, aa] of [[1, R[3], 0.8], [0, R[1], 1], [-1, R[1], 1], [-2, R[2], 0.8], [-3, R[2], 0.6]]) {
                if (aa * a < 1 && aa * a <= X.bay(i, dr + 4)) continue;
                const p = bent(th, r + dr); X.px(c, p[0], p[1], col);
              }
              if (i % 5 === 0 && rand(i, 5, Math.floor(t * 20)) < a) { const p = bent(th + 0.01, r + (rand(i, 4) - 0.5) * 4); K.sq(c, p[0], p[1] - rand(i, 6) * 4, i % 3 ? 1 : 2, i % 2 ? R[0] : R[2]); }
            }
          }
          // the ally's bubble: a violet shell the blast streams round
          if (bub > 0.02) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 14), cx = al.x, cy = al.y - 9;
            X.ring(c, al.x, al.y, RB, RB * FY, SV[1], bub);
            X.ring(c, cx, cy, 10, 13, SV[1], bub * (0.75 + 0.25 * pulse));
            X.ring(c, cx, cy, 11, 14, SV[3], bub * 0.6);
            X.line(c, cx - 6, cy - 9, cx - 3, cy - 11, '#ffffff');
            for (let k = 0; k < 8; k++) { const a = k * 0.785 + t * 2.5; if (rand(k, Math.floor(t * 12)) < bub) X.px(c, cx + Math.cos(a) * 10.5, cy + Math.sin(a) * 13.5, k % 2 ? '#ffffff' : SV[0]); }
          }
        },
      };
    } });

  // =========================================================================
  // AURAS: Sigil + Self. They affect whoever is around you, never your own spells.
  const auraVignette = (id, el, q, frameFn, extra = {}) => add(Object.assign({ id, group: 'aura', q, cast: 'self', dur: 3.8, ground: 'plaza', seed: 60 + id.length, frame: frameFn }, extra));

  auraVignette('au-fire', 'fire', ['sigil', 'fire'], (t, K) => {
    // (pass 4: "you're exuding fire, less you're standing in a ring of it". No ring of flame on
    // the ground: the fire comes off the caster. A glowing outline, flames peeling off the
    // shoulders, hat and robe and leaning outward, embers streaming out radially, a shimmer of
    // heat haze round the body and a warm glow on the ground that fades with distance.)
    const D = 3.8, c0 = 0.55, me = caster(t, 'fire', c0, 0.8, { x: 80 }), L = K.life(t, D), k = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D));
    if (k > 0.3) me.outline = Math.floor(t * 10) % 3 ? EL.fire[3] : EL.fire[2];
    const comer = (id, x0, y, seed, delay) => { const reach = 100 + (seed - 1) * 2, x = Math.max(x0 - Math.max(0, t - delay) * 34, reach), touched = x === reach && k > 0.5, tt = delay + (x0 - reach) / 34; return K.gob({ id, x: touched ? reach + K.kb(t, tt + 0.25, 30, 1) : x, y, face: Math.PI + (t > tt + 0.3 ? Math.PI : 0), seed, ...K.walk(t, 1.1), burn: seg(t, tt, tt + 0.2) * (1 - seg(t, D - 0.4, D)), alpha: L }); };
    const en = [comer('g1', 180, 66, 1, 0.3), comer('g2', 186, 86, 2, 0.9)];
    return {
      actors: [me, ...en],
      under(c, E) {
        E.em((cc) => K.seal(cc, me.x, me.y, 12, t, 0.35 * k));
      },
      // the warm glow on the ground, strongest at the feet and fading with distance, is all light
      lights: [[me.x, me.y - 6, 64, '#ff7020', 0.75 * k + 0.06 * Math.sin(t * 9)], [me.x, me.y, 30, '#ffc070', 0.6 * k], ...en.map((s) => [s.x, s.y - 6, 36, '#ff7020', 0.6 * s.burn])],
      fx(c, A) {
        K.prep(c, me, A, t, ['sigil', 'fire'], 0.05, c0);
        if (k > 0.05) {
          const a = A.me, ch = a.chest, hd = a.head;
          // heat haze: a loose shell of faint shimmering pixels that wobbles round the body
          for (let i = 0; i < 26; i++) { const ang = (i / 26) * TAU, r = 11 + Math.sin(t * 7 + i * 1.7) * 1.5, x = ch[0] + Math.cos(ang) * r * 0.8, y = ch[1] - 2 + Math.sin(ang) * r; if ((i + Math.floor(t * 12)) % 3 || rand(i, 3) > k) continue; X.px(c, x, y, '#ffcf90'); }
          // flames peeling off the silhouette (hat, shoulders, robe hem), leaning away from the body
          const spots = [[hd[0] - 3, hd[1] - 2], [hd[0] + 3, hd[1] - 1], [ch[0] - 5, ch[1] - 2], [ch[0] + 5, ch[1] - 1], [ch[0] - 5, ch[1] + 6], [ch[0] + 6, ch[1] + 6], [hd[0], hd[1] - 7]];
          spots.forEach(([x, y], j) => { const out = x < ch[0] ? -1 : x > ch[0] ? 1 : 0; K.tongue(c, x, y, 1.7, (4.5 + 3 * (0.5 + 0.5 * Math.sin(t * 12 + j * 2.3))) * k, out * 4 + Math.sin(t * 8 + j) * 1); });
          // embers streaming outward in every direction across the ground, rising a little, fading
          for (const p of emit(t, 46, 0.9, (i, age) => { const ang = rand(i, 3) * TAU, d = 4 + easeOut(age) * (22 + rand(i, 4) * 14), z = 4 + rand(i, 5) * 14 + age * 6; return { x: me.x + Math.cos(ang) * d, y: me.y + Math.sin(ang) * d * FY - z, age, i }; })) if (rand(p.i, 6) < k) X.px(c, p.x, p.y, p.age < 0.3 ? EL.fire[1] : p.age < 0.65 ? EL.fire[2] : EL.fire[4]);
          // the odd lick of flame thrown off outward, a short way
          for (const p of emit(t, 6, 0.5, (i, age) => { const ang = rand(i, 13) * TAU, d = 6 + age * 12; return { x: me.x + Math.cos(ang) * d, y: me.y + Math.sin(ang) * d * FY - 4, age, ang }; })) K.tongue(c, p.x, p.y, 1.3, 4 * (1 - p.age) * k, Math.cos(p.ang) * 2);
        }
        for (const s of en) K.burning(c, A, s, t, s.burn);
      },
    };
  });

  // (pass 3: the frost ground is a clean ellipse in the 3/4 camera's perspective, with an even
  // rime of crystals; the orbiting snow stays. Chilled goblins show it on their bodies.)
  auraVignette('au-frost', 'cold', ['sigil', 'cold'], (t, K) => {
    const D = 3.8, c0 = 0.55, me = caster(t, 'cold', c0, 0.8, { x: 80 }), L = K.life(t, D), k = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D)), R = 28;
    // goblins slow right down once they enter the cold
    const comer = (id, y, seed, x0) => { let x = x0; const RR = me.x + R - 4; for (let s = 0; s < t; s += 0.02) { x -= (x > RR || k < 0.5 ? 40 : 8) * 0.02; } const inC = x <= RR && k > 0.3; return K.gob({ id, x: Math.max(x, 92), y, face: Math.PI, seed, ...K.walk(t, inC ? 0.25 : 1.1), chill: inC ? 0.55 * k : 0, cold: inC, alpha: L }); };
    const en = [comer('g1', 66, 1, 176), comer('g2', 86, 2, 196)];
    return {
      actors: [me, ...en],
      under(c, E) {
        E.em((cc) => K.seal(cc, me.x, me.y, 17, t, 0.6 * k));
        if (k > 0.02) {
          const rr = R * k;
          X.ring(c, me.x, me.y, rr, rr * FY, '#bfeaf8', 0.8);
          X.ring(c, me.x, me.y, rr - 1, (rr - 1) * FY, '#ffffff', 0.35);
          // an even rime of crystals: rings of points, jittered a little, twinkling slowly
          for (let ring = 1; ring <= 4; ring++) { const r = rr * ring / 4.4, n = 6 + ring * 6; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + ring * 0.7 + (rand(i, ring, 5) - 0.5) * 0.25, x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r * FY; X.px(c, x, y, (i + ring + Math.floor(t * 2)) % 7 === 0 ? '#ffffff' : '#c4eefa'); } }
        }
      },
      lights: [[me.x, me.y - 4, 56, '#9ff4ff', 0.55 * k]],
      fx(c, A) {
        K.prep(c, me, A, t, ['sigil', 'cold'], 0.05, c0);
        K.aura(c, me, t, EL.cold, { r: R, k, n: 16, spin: 0.6, rise: 5 });
        for (const s of en) if (s.cold) K.chilled(c, A, s, t, 0.8);
      },
    };
  });

  auraVignette('au-mist', 'water', ['sigil', 'water'], (t, K) => {
    const D = 4, c0 = 0.55, me = caster(t, 'water', c0, 0.8, { x: 76 }), L = K.life(t, D), k = seg(t, c0, c0 + 0.4) * (1 - seg(t, D - 0.3, D));
    // a burning ally runs into the mist and is doused; nearby goblins get soaked
    const rk = seg(t, 0.4, 1.6), ax = lerp(20, 64, rk), ay = lerp(110, 90, rk), doused = rk >= 1 && k > 0.5;
    const al = K.wiz({ id: 'ally', team: 'p2', x: ax, y: ay, face: -0.4, el: 'water', seed: 7, ...K.walk(t, rk < 1 ? 1.3 : 0), burn: doused ? 1 - seg(t, 1.6, 1.9) : 1, wet: doused ? seg(t, 1.6, 1.9) : 0 });
    const g1 = K.gob({ id: 'g1', x: 104, y: 64, face: Math.PI, seed: 1, wet: k }), g2 = K.gob({ id: 'g2', x: 150, y: 82, face: Math.PI, seed: 2 });
    return {
      actors: [me, al, g1, g2],
      under(c, E) { E.em((cc) => K.seal(cc, me.x, me.y, 15, t, 0.6 * k)); },
      lights: [[me.x, me.y - 4, 50, '#3a98ff', 0.4 * k], [al.x, al.y - 6, 36, '#ff7020', 0.6 * al.burn]],
      fx(c, A) {
        K.prep(c, me, A, t, ['sigil', 'water'], 0.05, c0);
        K.burning(c, A, al, t, al.burn);
        if (doused && t < 2.3) for (const p of emit(t, 14, 0.8, (i, age) => ({ x: al.x + (rand(i, 5) - 0.5) * 8 + age * 4, y: al.y - 14 - age * 16, age }), 1.6, 2.2)) K.puff(c, p.x, p.y, 1.5 + p.age * 3, EL.steam[1], 1 - p.age);
        if (k > 0.05) for (let i = 0; i < 18; i++) { const a = rand(i, 11) * TAU + t * 0.25, r = 12 + rand(i, 12) * 22, x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r * FY * 0.6 - 4 - rand(i, 13) * 8; X.ellipse(c, x, y, 6 + rand(i, 14) * 4, 3.5 + rand(i, 14) * 2, `rgba(${i % 2 ? '150,200,240' : '190,215,235'},${(0.22 * k).toFixed(2)})`); }
        if (g1.wet > 0.4) { K.dripping(c, A, g1, t); K.pip(c, A, g1, 'water', t); }
      },
    };
  });

  auraVignette('au-haste', 'lightning', ['sigil', 'lightning'], (t, K) => {
    const D = 3.6, c0 = 0.55, k = seg(t, c0, c0 + 0.2) * (1 - seg(t, D - 0.25, D));
    // the hasted caster runs a lap past the ally, who walks at normal speed
    const run = seg(t, 0.85, 3.2), px = lerp(40, 176, smooth(run)), py = 72 + Math.sin(run * Math.PI) * -6;
    const me = K.wiz(Object.assign({ id: 'me', team: 'p1', x: t < 0.85 ? 40 : px, y: py, face: 0, el: 'lightning', seed: 3, ...K.walk(t * 2.2, run > 0 && run < 1 ? 1.6 : 0), vx: run > 0 && run < 1 ? 60 : 0 }, t < 0.85 ? K.pose(t, 0.05, c0, 0.8) : {}));
    const al = K.wiz({ id: 'ally', team: 'p2', x: lerp(36, 86, seg(t, 0.85, 3.2)), y: 98, face: 0, el: 'water', seed: 7, ...K.walk(t, 0.8) });
    return {
      actors: [me, al],
      lights: [[me.x, me.y - 6, 40, '#c4a4ff', 0.5 * k]],
      fx(c, A) {
        K.prep(c, { x: 40, y: 72, id: 'me' }, A, t, ['sigil', 'lightning'], 0.05, c0);
        if (k < 0.05) return;
        // afterimages and speed lines behind, sparks at the feet
        if (run > 0 && run < 1) for (const p of emit(t, 40, 0.4, (i, age) => ({ x: me.x - 3 - age * 26, y: me.y - 2 - rand(i, 7) * 20, age }))) X.px(c, p.x, p.y, p.age < 0.4 ? EL.lightning[0] : EL.lightning[2]);
        if (run > 0 && run < 1) for (let i = 0; i < 6; i++) { const y = me.y - 4 - i * 3.5, x = me.x - 8 - rand(i, Math.floor(t * 12)) * 16; X.line(c, x, y, x + 6 + rand(i, 3) * 6, y, i % 2 ? EL.lightning[1] : EL.lightning[2]); }
        if (Math.floor(t * 20) % 2) { const pts = K.bolt([me.x - 4, me.y], [me.x + 5, me.y - 2], Math.floor(t * 20), 0.6, 2); X.lines(c, pts, EL.lightning[1], 1); }
        K.aura(c, me, t, EL.lightning, { r: 9, k, n: 6, spin: 4, rise: 14 });
      },
    };
  });

  auraVignette('au-regen', 'life', ['sigil', 'life'], (t, K) => {
    const D = 3.8, c0 = 0.55, me = caster(t, 'life', c0, 0.8, { x: 90 }), k = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D));
    const hit = 0.25, hpv = t < hit ? 0.9 : Math.min(1, 0.3 + 0.7 * seg(t, c0 + 0.3, D - 0.4));
    me.flash = K.flash(t, hit) * 0.6;
    const ar = K.archer({ id: 'a1', x: 172, y: 66, face: Math.PI, seed: 4, draw: 1 - seg(t, 0, 0.1) });
    return {
      actors: [me, ar],
      under(c, E) { E.em((cc) => K.seal(cc, me.x, me.y, 15, t, 0.6 * k)); },
      lights: [[me.x, me.y - 4, 50, '#5fe07a', 0.55 * k]],
      fx(c, A) {
        K.prep(c, me, A, t, ['sigil', 'life'], 0.05, c0);
        if (t < hit) { const e = t / hit, src = A.a1.bowTip, dst = A.me.chest; K.arrow(c, lerp(src[0], dst[0], e), lerp(src[1], dst[1], e), Math.atan2(dst[1] - src[1], dst[0] - src[0])); }
        K.aura(c, me, t, EL.life, { r: 15, k, n: 10, spin: 1, rise: 9 });
        K.heals(c, A, me, t, k);
        K.hp(c, A, me, t > D - 0.2 ? 0.9 : hpv);
      },
    };
  });

  auraVignette('au-bulldoze', 'earth', ['sigil', 'earth'], (t, K) => {
    const D = 3.8, c0 = 0.55, k = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D)), L = K.life(t, D);
    const wk = seg(t, 0.9, 3.3), mx = lerp(40, 172, wk);
    const me = K.wiz(Object.assign({ id: 'me', team: 'p1', x: t < 0.9 ? 40 : mx, y: 74, face: 0, el: 'earth', seed: 3, ...K.walk(t, wk > 0 && wk < 1 ? 0.9 : 0) }, t < 0.9 ? K.pose(t, 0.05, c0, 0.8) : {}));
    const shoved = (id, x, y, seed, small) => { const tt = 0.9 + (x - 46) / 132 * 2.4, side = y < 74 ? -1 : 1; const k2 = K.kb(t, tt, 16, 0.4); return K[small ? 'gob' : 'brute']({ id, x: x + k2 * 0.4, y: y + side * k2 * FY, face: Math.PI, seed, flash: K.flash(t, tt) * 0.5, dead: small ? K.down(t, tt + 0.05) : 0, sq: !small && t > tt && t < tt + 0.3 ? 0.2 : 0, alpha: L, tt }); };
    const en = [shoved('g1', 84, 70, 1, true), shoved('g2', 112, 78, 2, true), shoved('b1', 146, 70, 4, false)];
    return {
      actors: [me, ...en],
      under(c, E) { E.em((cc) => K.seal(cc, me.x, me.y, 13, t, 0.5 * k)); },
      lights: [[me.x, me.y - 4, 40, '#d8b88a', 0.4 * k]],
      fx(c, A) {
        K.prep(c, { x: 40, y: 74, id: 'me' }, A, t, ['sigil', 'earth'], 0.05, c0);
        if (k > 0.05) { // a plough of rock riding ahead of the caster
          for (let i = -2; i <= 2; i++) { const x = me.x + 8 - Math.abs(i) * 2, y = me.y + i * 3; K.rock(c, x, y - 3 - Math.abs(Math.sin(t * 9 + i)) * 1, 2.2, 40 + i); }
          if (wk > 0 && wk < 1) K.dust(c, me.x - 4, me.y, mod(t, 0.5), Math.floor(t * 2), 4, 8, '#8a7a68', 0.5);
        }
        for (const s of en) { const e = t - s.tt; K.dust(c, s.x, s.y, e, s.seed, 6, 12, '#8a7a68', 0.7); if (e > 0 && e < 0.06) X.ellipse(c, s.x - 4, s.y - 8, 5, 6, '#ffffff'); }
      },
    };
  });

  auraVignette('au-glass', 'arcane', ['sigil', 'arcane'], (t, K) => {
    const D = 4, c0 = 0.55, b0 = 1.1, b1 = 2.2, poke = 2.75, k = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D));
    const me = caster(t, 'arcane', c0, 0.8, { x: 50 });
    if (t > 0.9) Object.assign(me, K.pose(t, 0.85, b0, b1));
    me.dead = K.down(t, poke + 0.05, poke + 0.8); me.flash = K.flash(t, poke);
    const on = Math.min(easeOut(seg(t, b0, b0 + 0.1)), 1 - seg(t, b1, b1 + 0.1));
    // the hit is doubled: a fat beam, a big impact that shoves the brute right back (no flashing body)
    const shove = K.kb(t, b0 + 0.1, 34, 1), L = K.life(t, D);
    const br = K.brute({ id: 'b1', x: 146 + shove, y: 72, face: Math.PI, seed: 4, flash: on > 0.5 && Math.floor(t * 12) % 3 === 0 ? 0.1 : 0, flashCol: EL.arcane[1], sq: on > 0.5 ? 0.2 : 0, alpha: L });
    const g1 = K.gob({ id: 'g1', x: Math.max(110 - Math.max(0, t - 1.6) * 40, 60), y: 82, face: Math.PI, seed: 1, ...K.walk(t, t < poke ? 1.2 : 0) });
    return {
      shake: on > 0.9 ? 0.8 : 0,
      actors: [me, br, g1],
      lights: [[me.x, me.y - 6, 36, '#ff4f9b', 0.5 * k], ...(on > 0.05 ? [[100, 74, 60, '#ff4f9b', 0.5 * on], [br.x, 70, 60, '#ffffff', 0.4 * on]] : [])],
      fx(c, A) {
        K.prep(c, me, A, t, ['sigil', 'arcane'], 0.05, c0);
        // glassy sheen: pink cracks flicker over the caster
        if (k > 0.05 && me.dead < 0.3) { const ch = A.me.chest; for (let i = 0; i < 3; i++) if (Math.floor(t * 6 + i) % 3) X.lines(c, [[ch[0] - 4 + i * 4, ch[1] - 8], [ch[0] - 3 + i * 4, ch[1] - 4], [ch[0] - 5 + i * 4, ch[1]]], EL.arcane[1], 1); K.aura(c, me, t, EL.arcane, { r: 11, k, n: 8, spin: 1.6, rise: 10 }); }
        if (on > 0.02) { K.beam(c, A.me.tip, A.b1.chest, t, EL.arcane, { on, w: 2.2 }); if (on > 0.9) { const z = A.b1.chest; X.glow(c, z[0], z[1], 18, EL.arcane[2], 0.9); X.glow(c, z[0], z[1], 10, EL.arcane[1], 0.9); for (let j = 0; j < 3; j++) { const q = PB.mod(t * 3 + j / 3, 1); X.ring(c, z[0], z[1], 6 + q * 18, 5 + q * 15, j ? EL.arcane[1] : '#ffffff', 1 - q); } } }
        // the brute's heels plough the ground as it is shoved back
        if (on > 0.5) for (const p of emit(t, 20, 0.6, (i, age) => ({ x: br.x + 4 + age * 4 + (rand(i, 7) - 0.5) * 6, y: br.y - age * 6, age }), b0, b1)) K.puff(c, p.x, p.y, 1.5 + p.age * 3, '#8a7a68', (1 - p.age) * 0.8);
        // a goblin's little poke shatters the glass cannon: shards burst and fall
        if (t > poke && t < poke + 0.7) { const e = (t - poke) / 0.7, p = [me.x + 4, me.y - 10]; if (e < 0.1) X.ellipse(c, p[0], p[1], 5, 5, '#ffffff'); for (let i = 0; i < 14; i++) { const a = rand(i, 3) * TAU, sp = 10 + rand(i, 4) * 16, z = Math.max(0, 10 + 30 * e - 70 * e * e), x = p[0] + Math.cos(a) * sp * e, y = p[1] + 10 + Math.sin(a) * sp * e * FY - z; if (e > 0.75 && rand(i, 5) < (e - 0.75) * 4) continue; X.px(c, x, y, i % 3 ? EL.arcane[1] : '#ffffff'); X.px(c, x + 1, y + (i % 2 ? 1 : -1), i % 2 ? '#ffffff' : EL.arcane[0]); } }
        if (me.dead > 0.6) { const a = A.me; if (a && a.head) for (let j = 0; j < 3; j++) { const ang = t * 6 + j * 2.1; X.px(c, a.head[0] + Math.cos(ang) * 5, a.head[1] - 3 + Math.sin(ang) * 2, '#ffe070'); } }
      },
    };
  }, { still: 1.6 });
})();
