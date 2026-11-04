/* Spell VFX vignettes, group 'life' (pass 4): Life leads. A spell with Life in it is a
 * support spell; the other elements lend it their shape, never their harm (rules-c.js
 * LIFE_LEND). Healing must read as help: green and warm gold light, rising sparkles and
 * pluses, and allies' health bars visibly ticking up. Never fire damage, never a stun. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, emit, mod } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster, SV = EL.sigil;
  const LIFE = ['#ffffff', '#f2ffe8', '#c8fab0', '#8ef07e', '#46c450', '#1e7a34'];
  // warm healing light: white, cream, gold, then into green (Life + Fire)
  const WARM = ['#ffffff', '#fff6d0', '#ffe68a', '#d8f07a', '#8ee070', '#3aa048'];
  // a health value that climbs from a to b over dur once healing starts at t0
  const hv = (t, t0, a, b, dur = 0.8) => a + (b - a) * smooth(seg(t, t0, t0 + dur));
  // rising sparkles round a point (help, not harm): small pluses and glints drifting up
  function sparkle(c, x, y, t, k, spread = 10, seed = 0, R = LIFE, rate = 14) {
    if (k < 0.05) return;
    for (const p of emit(t, rate, 0.8, (i, age) => ({ x: x + (rand(i, 71, seed) - 0.5) * spread + Math.sin(age * 6 + i) * 1.2, y: y + (rand(i, 72, seed) - 0.5) * spread * 0.5 - age * 16, age, i }))) {
      if (rand(p.i, 73, seed) > k) continue;
      const col = p.age < 0.35 ? R[0] : p.age < 0.7 ? R[2] : R[3];
      if (p.i % 3 === 0 && p.age < 0.6) { X.px(c, p.x - 1, p.y, col); X.px(c, p.x + 1, p.y, col); X.px(c, p.x, p.y - 1, col); X.px(c, p.x, p.y + 1, col); }
      X.px(c, p.x, p.y, p.age < 0.5 ? '#ffffff' : col);
    }
  }
  // a heal landing on a body: a soft green flash, a ring and a burst of sparkles
  function healHit(c, p, e, R = LIFE) {
    if (e < 0 || e > 0.5) return;
    const q = e / 0.5;
    if (q < 0.25) X.glow(c, p[0], p[1], 9 * (1 - q), R[2], 0.85);
    X.ring(c, p[0], p[1] + 6, 4 + q * 10, (4 + q * 10) * FY * 0.6, R[2], 1 - q);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, d = 3 + q * 9; X.px(c, p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.7 - q * 5, k % 2 ? R[0] : R[2]); }
  }
  const pal = (team, x, y, face, seed, o = {}) => K.wiz(Object.assign({ id: team, team, x, y, face, el: 'water', seed }, o));

  // ---- Chain heal (Life + Lightning, Force): the heal leaps from ally to ally ----
  add({ id: 'life-chain-heal', still: 1.25, group: 'life', q: ['life', 'lightning'], cast: 'force', dur: 3.6, ground: 'plaza', seed: 81,
    frame(t, K) {
      const D = 3.6, c0 = 0.6, c1 = 2.1, me = caster(t, 'life', c0, c1, { face: 0.1 });
      const hops = [c0, c0 + 0.16, c0 + 0.32];
      const al = [pal('p2', 96, 56, Math.PI + 0.4, 7), pal('p3', 126, 84, Math.PI - 0.3, 8), pal('p4', 160, 60, Math.PI + 0.2, 9)];
      const g1 = K.gob({ id: 'g1', x: 170, y: 100, face: Math.PI + 0.4, seed: 2 });
      const on = (i) => t > hops[i] && t < c1;
      return {
        actors: [me, ...al, g1],
        lights: [...al.map((s, i) => [s.x, s.y - 6, 34, '#8ef07e', on(i) ? 0.7 : 0]), [ME.x, ME.y - 8, 30, '#8ef07e', t > c0 && t < c1 ? 0.5 : 0]],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'lightning'], 0.05, c0);
          const seed = Math.floor(t * 16), nodes = [A.me.tip, ...al.map((s) => A[s.id].chest)];
          for (let i = 0; i < 3; i++) if (on(i) && (seed + i) % 4 !== 3) { const pts = K.bolt(nodes[i], nodes[i + 1], seed * 7 + i * 31, 0.3, 4); X.lines(c, pts, LIFE[5], 3); X.lines(c, pts, LIFE[3], 2); X.lines(c, pts, LIFE[0], 1); X.glow(c, nodes[i + 1][0], nodes[i + 1][1], 6, LIFE[2], 0.8); }
          al.forEach((s, i) => { healHit(c, A[s.id].chest, t - hops[i]); K.heals(c, A, s, t, on(i) ? 1 : 0, EL.life); sparkle(c, s.x, s.y - 10, t, on(i) ? 1 : 0, 10, i); K.hp(c, A, s, t > D - 0.25 ? 0.25 + i * 0.05 : hv(t, hops[i], 0.25 + i * 0.05, 1, c1 - hops[i])); });
        },
      };
    } });

  // ---- Healing spray (Life + Fire, Force): a flamethrower-shaped cone of warm light ----
  function warmCone(c, o, z, t, t0, t1, R = WARM) {
    const dx = z[0] - o[0], dy = z[1] - o[1], L0 = Math.hypot(dx, dy) || 1, ux = dx / L0, uy = dy / L0, Lz = L0 * 1.12;
    const on = Math.min(seg(t, t0, t0 + 0.12), 1 - seg(t, t1 - 0.1, t1)), spread = 0.42;
    const live = (ts) => ts >= t0 && ts <= t1 - 0.06;
    if (on > 0.05) for (let w = 0; w < 3; w++) {
      const jl = Lz * 0.45 * on, n = Math.max(4, Math.round(jl / 2)), pts = [];
      for (let i = 0; i <= n; i++) { const d = (i / n) * jl, j = Math.sin(d * 0.5 - t * 26 + w * 2) * (0.4 + d / jl * 1.4); pts.push([o[0] + ux * d - uy * j * (w - 1) * 1.6, o[1] + uy * d + ux * j * (w - 1) * 1.6]); }
      X.lines(c, pts, w === 1 ? R[1] : R[3], w === 1 ? 2 : 1);
    }
    // soft light filling the cone (so it reads as a glow, not as burning particles)
    for (let k = 1; k <= 5; k++) { const d = Lz * k / 5.5; if (on > 0.1) X.glow(c, o[0] + ux * d, o[1] + uy * d, 3 + k * 3.2, k < 3 ? R[2] : R[3], 0.5 * on); }
    for (const p of emit(t, 420, 0.55, (i, age, ts) => {
      if (!live(ts)) return null;
      const ang = (rand(i, 11) - 0.5) * 2 * spread, cs = Math.cos(ang), sn = Math.sin(ang), vx = ux * cs - uy * sn, vy = ux * sn + uy * cs;
      const d = easeOut(age) * Lz * (0.8 + rand(i, 12) * 0.3), sw = Math.sin(age * 8 + i) * 1.4;
      return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw - age * age * 6, age, r: rand(i, 13), i };
    })) {
      const col = R[p.age < 0.15 ? 0 : p.age < 0.35 ? 1 : p.age < 0.55 ? 2 : p.age < 0.78 ? 3 : 4];
      if (p.i % 11 === 0 && p.age > 0.3) { X.px(c, p.x - 1, p.y, col); X.px(c, p.x + 1, p.y, col); X.px(c, p.x, p.y - 1, col); X.px(c, p.x, p.y + 1, col); }
      if (p.r > 0.7 && p.age > 0.1 && p.age < 0.6) X.rect(c, p.x, p.y, 2, 2, col); else X.px(c, p.x, p.y, col);
    }
    X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 7, R[1], 0.85 * on);
  }
  add({ id: 'life-healing-spray', still: 1.6, group: 'life', q: ['life', 'fire'], cast: 'force', dur: 3.6, ground: 'path', seed: 82,
    frame(t, K) {
      const D = 3.6, c0 = 0.6, c1 = 2.6, me = caster(t, 'life', c0, c1, { face: 0.05 });
      const a1 = pal('p2', 104, 66, Math.PI + 0.2, 7, { chill: 0.7 * (1 - seg(t, c0 + 0.2, c0 + 0.9)) }), a2 = pal('p3', 120, 82, Math.PI - 0.3, 8);
      const g1 = K.gob({ id: 'g1', x: 168, y: 70, face: Math.PI, seed: 1 });
      const on = t > c0 + 0.1 && t < c1;
      return {
        actors: [me, a1, a2, g1],
        lights: [[86, 72, 60, '#ffe68a', on ? 0.6 : 0], [112, 74, 44, '#c8f07a', on ? 0.5 : 0]],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'fire'], 0.05, c0);
          warmCone(c, A.me.tip, [112, 66], t, c0, c1);
          if (a1.chill > 0.05) K.chilled(c, A, a1, t, a1.chill);
          // thawing: a little steam lifts off the chilled ally as the warm light reaches them
          if (t > c0 + 0.2 && t < c0 + 1) for (const p of emit(t, 10, 0.8, (i, age) => ({ x: a1.x + (rand(i, 5) - 0.5) * 8, y: a1.y - 10 - age * 12, age }), c0 + 0.2, c0 + 0.9)) K.puff(c, p.x, p.y, 1 + p.age * 2, '#e4e8f0', (1 - p.age) * 0.7);
          for (const [s, base] of [[a1, 0.3], [a2, 0.2]]) { K.heals(c, A, s, t, on ? 1 : 0, EL.life); sparkle(c, s.x, s.y - 10, t, on ? 1 : 0, 10, s.seed, WARM); K.hp(c, A, s, t > D - 0.25 ? base : hv(t, c0 + 0.15, base, 1, 1.8)); }
          K.hp(c, A, g1, 0.6);
        },
      };
    } });

  // ---- Heal-stone (Life + Earth, Force): a stone lobbed over a wall that bursts and heals ----
  add({ id: 'life-heal-stone', still: 1.62, group: 'life', q: ['life', 'earth'], cast: 'force', dur: 4, ground: 'grass', seed: 83,
    frame(t, K) {
      const D = 4, c0 = 1.15, hit = 1.6, me = caster(t, 'life', c0, 1.3, { x: 36, y: 78, prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 });
      const LZ = [128, 78];
      const a1 = pal('p2', 120, 66, Math.PI * 0 + 0.2, 7, { sq: t < hit ? 0.1 : 0 }), a2 = pal('p3', 132, 92, 0.1, 8);
      const g1 = K.gob({ id: 'g1', x: 156, y: 64, face: Math.PI, seed: 1, ...K.walk(t, 0.4) }), g2 = K.gob({ id: 'g2', x: 162, y: 92, face: Math.PI, seed: 2 });
      const stand = [];
      K.wall(stand, [[80, 46], [76, 76], [82, 108]], { h: 14, th: 5, seed: 5 });
      const fly = seg(t, c0, hit), from = [42, 52], P = (k) => [lerp(from[0], LZ[0], k), lerp(from[1], LZ[1] - 4, k) - Math.sin(k * Math.PI) * 38];
      const charge = smooth(seg(t, 0.35, 1.0));
      return {
        actors: [me, a1, a2, g1, g2], stand, shake: t > hit && t < hit + 0.15 ? 1 : 0,
        under(c, E) {
          if (t > c0 && t < hit) { const p = [lerp(from[0], LZ[0], fly), lerp(me.y, LZ[1], fly)]; X.ellipse(c, p[0], p[1], 3, 1.5, 'rgba(8,6,16,0.45)'); }
          if (t > hit) { const k = easeOut(seg(t, hit, hit + 0.3)) * (1 - seg(t, hit + 1.4, hit + 2.0)); if (k > 0.02) E.em((cc) => { K.gring(cc, LZ[0], LZ[1], 22 * k, EL.life[2], 0.8 * k, 1); X.ellipse(cc, LZ[0], LZ[1], 16 * k, 16 * k * FY, '#1e7a34', 0.35 * k); }); }
        },
        lights: [...(t > hit && t < hit + 1.5 ? [[LZ[0], LZ[1], 60, '#8ef07e', 0.9 * (1 - seg(t, hit, hit + 1.5))]] : []), ...(t > c0 && t < hit ? [[P(fly)[0], P(fly)[1] + 20, 30, '#8ef07e', 0.4]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'earth'], 0.05, 0.35);
          const ch = A.me.charge;
          // the charge: a stone grows at the staff with green light seeping from its cracks
          if (t < c0 && t > 0.35) { K.rock(c, ch[0], ch[1] + 2, 1.5 + charge * 3.5, 6); X.px(c, ch[0], ch[1] + 2, LIFE[1]); X.px(c, ch[0] - 1, ch[1] + 3, LIFE[3]); X.glow(c, ch[0], ch[1] + 2, 4 + charge * 3, LIFE[3], 0.5); }
          if (t >= c0 && t < hit) {
            const p = P(fly);
            for (let j = 1; j <= 5; j++) { const q = P(Math.max(0, fly - j * 0.04)); X.px(c, q[0], q[1], j < 3 ? LIFE[2] : LIFE[4]); }
            X.glow(c, p[0], p[1], 7, LIFE[3], 0.7); K.rock(c, p[0], p[1], 4.5, 6);
            X.line(c, p[0] - 2, p[1] - 1, p[0] + 1, p[1] + 1, LIFE[2]); X.px(c, p[0] + 1, p[1] - 2, LIFE[1]);
          }
          // the burst: the stone breaks into lit fragments and a wave of healing rolls out
          const e = t - hit;
          if (e > 0 && e < 0.07) X.ellipse(c, LZ[0], LZ[1] - 4, 12, 9, '#f2ffe8');
          K.nova(c, LZ[0], LZ[1], t, hit, 0.45, 24, EL.life, { n: 26, lift: 8 });
          K.debris(c, LZ[0], LZ[1] - 4, e, 3, 9, 30, ['#c8fab0', '#977552', '#8ef07e'], 40);
          sparkle(c, LZ[0], LZ[1] - 4, t, e > 0 && e < 1.6 ? 1 - seg(e, 1, 1.6) : 0, 28, 5, LIFE, 22);
          for (const [s, base] of [[a1, 0.2], [a2, 0.3]]) { K.heals(c, A, s, t, e > 0.1 && e < 1.6 ? 1 : 0, EL.life); K.hp(c, A, s, t > D - 0.25 || e < 0 ? base : hv(t, hit + 0.1, base, 0.95, 1.0)); }
        },
      };
    } });

  // ---- Healing shards (Life + Cold, Force): bright shards that each seek a hurt ally ----
  add({ id: 'life-healing-shards', still: 1.05, group: 'life', q: ['life', 'cold'], cast: 'force', dur: 3.4, ground: 'plaza', seed: 84,
    frame(t, K) {
      const D = 3.4, c0 = 0.6, me = caster(t, 'life', c0, 0.95, { face: 0 });
      const al = [pal('p2', 112, 48, Math.PI + 0.5, 7), pal('p3', 138, 76, Math.PI, 8), pal('p4', 108, 102, Math.PI - 0.5, 9)];
      // two shards per ally, staggered; each leaves along the aim, then curves in on its ally
      const shards = []; for (let i = 0; i < 6; i++) shards.push({ i, who: i % 3, t0: c0 + 0.02 + i * 0.05, dur: 0.34 + (i % 3) * 0.04 });
      const lands = (w) => shards.filter((s) => s.who === w).map((s) => s.t0 + s.dur);
      return {
        actors: [me, ...al],
        lights: [[ME.x + 20, ME.y - 10, 36, '#c8fab0', t > c0 && t < c0 + 0.6 ? 0.6 : 0], ...al.map((s, i) => [s.x, s.y - 6, 30, '#8ef07e', t > lands(i)[0] && t < lands(i)[0] + 1.2 ? 0.6 : 0])],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'cold'], 0.05, c0);
          const o = A.me.tip;
          for (const s of shards) {
            const e = (t - s.t0) / s.dur; if (e < 0 || e > 1) continue;
            const z = A[al[s.who].id].chest, ctl = [o[0] + 34 + (s.i % 2) * 6, o[1] + (s.who - 1) * 4];
            const B = (k) => [lerp(lerp(o[0], ctl[0], k), lerp(ctl[0], z[0], k), k), lerp(lerp(o[1], ctl[1], k), lerp(ctl[1], z[1], k), k)];
            const p = B(e), q = B(Math.max(0, e - 0.08)), ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
            for (let j = 1; j <= 5; j++) { const r = B(Math.max(0, e - j * 0.035)); X.px(c, r[0], r[1], j < 2 ? LIFE[1] : j < 4 ? LIFE[3] : LIFE[4]); }
            // the shard: a pale crystal sliver with a green heart
            const cs = Math.cos(ang), sn = Math.sin(ang);
            X.line(c, p[0] - cs * 3, p[1] - sn * 3, p[0] + cs * 2, p[1] + sn * 2, '#9ff4ff', 2);
            X.line(c, p[0] - cs * 2, p[1] - sn * 2, p[0] + cs * 3, p[1] + sn * 3, '#ffffff');
            X.px(c, p[0], p[1], LIFE[3]); X.glow(c, p[0], p[1], 4, LIFE[2], 0.6);
          }
          al.forEach((s, i) => { const ch = A[s.id].chest; for (const l of lands(i)) healHit(c, ch, t - l); const h0 = lands(i)[0]; K.heals(c, A, s, t, t > h0 && t < h0 + 1.4 ? 1 : 0, EL.life); sparkle(c, s.x, s.y - 10, t, t > h0 && t < h0 + 1.4 ? 1 : 0, 8, i); K.hp(c, A, s, t > D - 0.25 ? 0.3 : 0.3 + 0.3 * smooth(seg(t, h0, h0 + 0.2)) + 0.3 * smooth(seg(t, lands(i)[1], lands(i)[1] + 0.2))); });
        },
      };
    } });

  // ---- Rescue spray (Life + Water, Force): heals, nudges the ally back out of danger, puts out burning ----
  add({ id: 'life-rescue-spray', still: 1.5, group: 'life', q: ['life', 'water'], cast: 'force', dur: 3.6, ground: 'path', seed: 85,
    frame(t, K) {
      const D = 3.6, c0 = 0.6, c1 = 2.2, me = caster(t, 'life', c0, c1, { face: 0.05 });
      const hitT = c0 + 0.2, nudge = K.kb(t, hitT, 16, 1.1);
      // the ally stands burning in a patch of fire; the spray douses them, heals them and
      // eases them gently back, out of the flames (a nudge, not a blast)
      const al = pal('p2', 108 + nudge, 72, Math.PI, 7, { burn: 1 - seg(t, hitT, hitT + 0.35), wet: seg(t, hitT, hitT + 0.4) * (1 - seg(t, D - 0.6, D)), ...K.walk(t, 0) });
      const g1 = K.gob({ id: 'g1', x: 168, y: 58, face: Math.PI + 0.3, seed: 1 }), g2 = K.gob({ id: 'g2', x: 174, y: 90, face: Math.PI - 0.3, seed: 2 });
      const patch = 1 - seg(t, D - 0.5, D);
      const on = t > hitT && t < c1;
      return {
        actors: [me, al, g1, g2],
        under(c) { X.ellipse(c, 108, 73, 12, 5, 'rgba(26,16,14,0.6)'); },
        lights: [[al.x, al.y - 6, 40, '#ff7020', 0.6 * al.burn], [108, 72, 40, '#ff7020', 0.6 * patch], [92, 72, 50, '#8ad0ff', t > c0 && t < c1 ? 0.4 : 0], [al.x, al.y - 6, 30, '#8ef07e', on ? 0.5 : 0]],
        fx(c, A) {
          K.prep(c, me, A, t, ['life', 'water'], 0.05, c0);
          for (let i = 0; i < 7; i++) { const x = 108 + (rand(i, 31) - 0.5) * 20, y = 73 + (rand(i, 32) - 0.5) * 6; K.tongue(c, x, y, 1.8, (4 + 2 * Math.sin(t * 12 + i * 2)) * patch, Math.sin(t * 6 + i)); }
          K.cone(c, A.me.tip, A.p2.chest, t, 'water', c0, c1, { spread: 0.22, power: 0.7, reach: 1.05 });
          // green motes of healing riding in the water
          if (t > c0 && t < c1) for (const p of emit(t, 40, 0.45, (i, age) => { const o = A.me.tip, z = A.p2.chest, d = age * 1.05, j = (rand(i, 3) - 0.5) * 10 * age; return { x: lerp(o[0], z[0], d), y: lerp(o[1], z[1], d) + j - Math.sin(age * Math.PI) * 4, age }; }, c0, c1 - 0.05)) X.px(c, p.x, p.y, p.age < 0.5 ? LIFE[1] : LIFE[3]);
          K.burning(c, A, al, t, al.burn);
          if (t > hitT && t < hitT + 0.9) for (const p of emit(t, 16, 0.9, (i, age) => ({ x: al.x + (rand(i, 5) - 0.5) * 8 + age * 4, y: al.y - 14 - age * 16, age }), hitT, hitT + 0.6)) K.puff(c, p.x, p.y, 1.5 + p.age * 3, EL.steam[1], 1 - p.age);
          if (al.wet > 0.4) K.dripping(c, A, al, t);
          K.heals(c, A, al, t, on ? 1 : 0, EL.life); sparkle(c, al.x, al.y - 10, t, on ? 1 : 0, 10, 3);
          K.hp(c, A, al, t > D - 0.25 ? 0.2 : t < hitT ? 0.2 : hv(t, hitT, 0.2, 0.9, 1.5));
        },
      };
    } });

  // ---- Healing palm (Life, Weapon): push the open hand forward; a pulse heals the ally ahead ----
  add({ id: 'life-palm', still: 1.0, group: 'life', q: ['life'], cast: 'conjure', dur: 3.2, ground: 'plaza', seed: 86,
    frame(t, K) {
      const D = 3.2, c0 = 0.75, arrive = c0 + 0.32, me = caster(t, 'life', c0, 1.1, { face: 0, prepKind: 'conjure' });
      const al = pal('p2', ME.x + 40, ME.y + 2, Math.PI, 7, { sq: t > arrive && t < arrive + 0.15 ? -0.15 : 0 });
      const g1 = K.gob({ id: 'g1', x: 150, y: 64, face: Math.PI, seed: 1 });
      return {
        actors: [me, al, g1],
        lights: [[ME.x + 8, ME.y - 8, 30, '#8ef07e', t > 0.3 && t < c0 + 0.1 ? 0.5 : 0], ...(t > arrive && t < arrive + 0.8 ? [[al.x, al.y - 6, 50, '#c8fab0', 0.9 * (1 - seg(t, arrive, arrive + 0.8))]] : [])],
        fx(c, A) {
          const h = A.me.hands[0], h2 = A.me.hands[1];
          // the palm gathers light (no rune flight to the staff: the hand is the focus)
          if (t > 0.2 && t < c0 + 0.05) { const k = seg(t, 0.2, c0); X.glow(c, h[0], h[1], 3 + k * 4, LIFE[3], 0.8); X.px(c, h[0], h[1], LIFE[0]); for (let i = 0; i < 5; i++) { const a = t * 7 + i * 1.26, r = 8 - k * 5; X.px(c, h[0] + Math.cos(a) * r, h[1] + Math.sin(a) * r * 0.7, i % 2 ? LIFE[1] : LIFE[3]); } }
          // the push: an open-hand print of light and three soft arcs travelling to the ally
          const e = (t - c0) / (arrive - c0);
          if (e > 0 && e < 1) {
            const x = lerp(h[0] + 2, A.p2.chest[0] - 3, easeOut(e)), y = lerp(h[1], A.p2.chest[1], e);
            for (let k = 0; k < 3; k++) { const xx = x - k * 4; X.ring(c, xx, y, 2 + k, 4 + k * 1.5, k ? LIFE[3] : LIFE[1], 1 - k * 0.3, -1.2, 1.2); }
            X.glow(c, x, y, 5, LIFE[2], 0.7);
            // the palm print: a small hand in white-green (four fingers and a thumb)
            for (let f = 0; f < 4; f++) X.rect(c, x + 1, y - 3 + f * 1.5, 2, 1, LIFE[0]);
            X.rect(c, x - 1, y - 2, 2, 4, LIFE[1]); X.px(c, x - 1, y + 3, LIFE[1]);
          }
          if (t > c0 - 0.05 && t < c0 + 0.12) X.glow(c, h[0] + 2, h[1], 6, LIFE[1], 0.9);
          healHit(c, A.p2.chest, t - arrive);
          K.heals(c, A, al, t, t > arrive && t < arrive + 1.3 ? 1 : 0, EL.life); sparkle(c, al.x, al.y - 10, t, t > arrive && t < arrive + 1.2 ? 1 : 0, 10, 2);
          K.hp(c, A, al, t > D - 0.25 ? 0.3 : hv(t, arrive, 0.3, 0.85, 0.35));
          if (h2) X.px(c, h2[0], h2[1] - 1, LIFE[3]);
        },
      };
    } });

  // ---- Healing hands (Sigil + Life, Weapon): glowing hands; touch an ally to heal while in contact ----
  add({ id: 'sg-healing-hands', still: 2.2, group: 'life', q: ['sigil', 'life'], cast: 'conjure', dur: 4.4, ground: 'path', seed: 87,
    frame(t, K) {
      const D = 4.4, c0 = 0.6, AL = [120, 76], walkK = seg(t, 1.0, 1.7), touch0 = 1.75, touch1 = 3.7;
      const mx = lerp(ME.x, AL[0] - 16, smooth(walkK));
      const contact = t > touch0 && t < touch1;
      const me = K.wiz(Object.assign({ id: 'me', team: 'p1', x: mx, y: lerp(ME.y, AL[1], smooth(walkK)), face: 0.05, el: 'life', seed: 3, prepKind: 'conjure', ...K.walk(t, walkK > 0 && walkK < 1 ? 0.8 : 0) }, t < 1 ? K.pose(t, 0.05, c0, 0.8) : { cast: contact ? 0.85 : 0.25 }));
      // the ally sits hurt (squashed low), and straightens as the health comes back
      const hpA = t > D - 0.25 ? 0.15 : hv(t, touch0, 0.15, 1, touch1 - touch0);
      const al = pal('p2', AL[0], AL[1], Math.PI - 0.1, 7, { sq: 0.25 * (1 - hpA) });
      const g1 = K.gob({ id: 'g1', x: 176, y: 60, face: Math.PI, seed: 1 });
      const hands = seg(t, c0, c0 + 0.3) * (1 - seg(t, D - 0.3, D));
      return {
        actors: [me, al, g1],
        lights: [[me.x + 6, me.y - 8, 28, '#8ef07e', 0.55 * hands], [AL[0], AL[1] - 6, 40, '#c8fab0', contact ? 0.6 : 0]],
        fx(c, A) {
          K.prep(c, me, A, t, ['sigil', 'life'], 0.05, c0);
          // the glowing hands: a green glow on each hand, a violet cuff at the wrist (Sigil made them)
          if (hands > 0.05) for (const h of A.me.hands) {
            X.glow(c, h[0], h[1], 6 + Math.sin(t * 6) * 0.8, LIFE[3], 0.85 * hands);
            X.rect(c, h[0] - 1, h[1] - 1, 3, 3, LIFE[2]); X.px(c, h[0], h[1] - 1, LIFE[0]); X.px(c, h[0] - 1, h[1] + 1, SV[1]); X.px(c, h[0] + 1, h[1] + 1, SV[2]);
            for (const p of emit(t, 6, 0.6, (i, age) => ({ x: h[0] + (rand(i, 3) - 0.5) * 4, y: h[1] - age * 7, age }))) if (rand(p.x | 0, 5) < hands) X.px(c, p.x, p.y, p.age < 0.5 ? LIFE[1] : LIFE[3]);
          }
          if (t > c0 && t < c0 + 0.3) { const e = (t - c0) / 0.3; for (const h of A.me.hands) X.ring(c, h[0], h[1], 2 + e * 8, 2 + e * 6, SV[1], 1 - e); }
          // contact: light flows from the hands into the ally for as long as they touch
          if (contact) {
            const ch = A.p2.chest;
            for (const h of A.me.hands) for (let k = 0; k < 4; k++) { const q = mod(t * 2.2 + k / 4, 1), x = lerp(h[0], ch[0], q), y = lerp(h[1], ch[1], q) - Math.sin(q * Math.PI) * 2; X.px(c, x, y, q < 0.5 ? LIFE[0] : LIFE[2]); }
            X.glow(c, ch[0], ch[1], 6 + Math.sin(t * 8), LIFE[2], 0.6);
          }
          K.heals(c, A, al, t, contact ? 1 : 0, EL.life); sparkle(c, al.x, al.y - 8, t, contact ? 1 : 0, 10, 4);
          K.hp(c, A, al, hpA);
        },
      };
    } });

  // ---- Mending ward (Shield + Life, Self): the shimmering skin, green-tinged, heals you slowly ----
  add({ id: 'sh-mending-ward', still: 2.05, group: 'life', q: ['shield', 'life'], cast: 'self', dur: 4.2, ground: 'path', seed: 88,
    frame(t, K) {
      const D = 4.2, c0 = 0.55, shots = [1.4, 2.5];
      const up = easeOut(seg(t, c0, c0 + 0.25)) * (1 - seg(t, D - 0.35, D - 0.05));
      const flare = shots.reduce((m, h) => Math.max(m, t > h && t < h + 0.25 ? 1 - (t - h) / 0.25 : 0), 0);
      const me = caster(t, 'life', c0, 0.8, { face: 0.15 });
      me.skin = { k: up * 0.85, col: '#4ec45a', col2: '#9af07a', hi: '#e8ffd8', hit: flare };
      // health: hurt to start, chipped by each arrow, and mending steadily in between
      let hpv = 0.3 + 0.62 * smooth(seg(t, c0 + 0.2, D - 0.5)); for (const h of shots) if (t > h) hpv -= 0.08 * (1 - seg(t, h, h + 0.9));
      if (t > D - 0.25) hpv = 0.3;
      const drawA = shots.reduce((m, h) => Math.max(m, t > h - 0.75 && t < h - 0.15 ? seg(t, h - 0.75, h - 0.2) : 0), 0);
      const ar = K.archer({ id: 'a1', x: 160, y: 66, face: Math.PI, seed: 4, draw: drawA });
      return {
        actors: [me, ar],
        lights: [[ME.x, ME.y - 8, 36, '#8ef07e', 0.45 * up + 0.4 * flare]],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'life'], 0.05, c0);
          const ch = A.me.chest, hitP = [ch[0] + 6, ch[1] - 1];
          if (t > c0 && t < c0 + 0.3) { const e = (t - c0) / 0.3; for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = 16 * (1 - e); X.px(c, ch[0] + Math.cos(a) * r, ch[1] - 2 + Math.sin(a) * r * 1.2, i % 2 ? EL.shield[1] : LIFE[2]); } }
          // arrows land on the skin (it takes the hit, the arrow drops), the skin flares gold-green
          for (const h of shots) {
            const e1 = (t - h + 0.22) / 0.22, src = A.a1.bowTip;
            if (src && e1 >= 0 && e1 < 1) K.arrow(c, lerp(src[0], hitP[0], e1), lerp(src[1], hitP[1], e1), Math.atan2(hitP[1] - src[1], hitP[0] - src[0]));
            const e2 = (t - h) / 0.5;
            if (e2 >= 0 && e2 < 1) { K.arrow(c, hitP[0] + 2 + e2 * 3, hitP[1] + e2 * e2 * 12, 0.3 + e2 * 2); if (e2 < 0.4) X.ring(c, hitP[0] - 2, hitP[1], 2 + e2 * 16, 2 + e2 * 22, EL.shield[1], 1 - e2 / 0.4); }
          }
          // the mending: slow green motes drawn into the body from the skin, and rising pluses
          if (up > 0.3) for (const p of emit(t, 8, 0.9, (i, age) => { const a = rand(i, 4) * TAU, r = 10 * (1 - age); return { x: ch[0] + Math.cos(a) * r, y: ch[1] - 2 + Math.sin(a) * r * 1.1, age }; })) X.px(c, p.x, p.y, p.age > 0.7 ? '#ffffff' : LIFE[2]);
          K.heals(c, A, me, t, up * 0.7, EL.life);
          K.hp(c, A, me, hpv);
        },
      };
    } });
})();
