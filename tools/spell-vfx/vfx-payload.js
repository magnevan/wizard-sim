/* Spell VFX vignettes, group 2: payload traits riding on a form, and the water mixes
 * (Scald: water + fire, Freeze: water + cold). Readability tricks from the art rounds:
 * a second-colour strand on beams, payload-coloured riders, the status spreading from
 * the impact point, and a small status pip over the target. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster;
  // arrows: a shaft, a white head and red fletching
  K.arrow = (c, x, y, ang) => { const cs = Math.cos(ang), sn = Math.sin(ang); X.line(c, x - cs * 4, y - sn * 4, x + cs * 2, y + sn * 2, '#e8d8b0'); X.px(c, x + cs * 3, y + sn * 3, '#ffffff'); X.px(c, x - cs * 5, y - sn * 5, '#c87a6a'); };

  // The Magicka way: the strongest element sets the FORM (shape and motion), the attached
  // element sets the LOOK. Rock + Fire is a fireball, Arcane + Cold a frost beam, Lightning
  // + Fire a flame arc. With several attached elements the most numerous one sets the look
  // and the others show as secondary sparks or tint.

  // ---- Rock + Fire: a Fireball. Rock gives the heavy lobbed missile, Fire is what it is made of ----
  add({ id: 'pay-fireball', still: 1.12, title: 'Fireball', group: 'payload', q: ['earth', 'fire'], cast: 'force', dur: 3.4, ground: 'path', seed: 31,
    line: 'Rock sets the form, a heavy missile thrown fast and nearly straight; Fire sets the look. It bursts into flame where it lands and sets alight whatever it hits.',
    frame(t, K) {
      const D = 3.4, c0 = 0.95, hit = 1.24, me = caster(t, 'fire', c0, 1.15, { prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 }), L = K.life(t, D);
      const burn = seg(t, hit, hit + 0.2) * (1 - seg(t, D - 0.35, D)), burn2 = seg(t, hit + 0.18, hit + 0.4) * (1 - seg(t, D - 0.35, D));
      const I = [134, 71];
      const g1 = K.gob({ id: 'g1', x: 134 + K.kb(t, hit, 16, 0.4), y: 70, face: Math.PI, seed: 1, flash: K.flash(t, hit), flashCol: EL.fire[0], burn, dead: K.down(t, hit + 0.15) * 0.8, z: K.hop(t, hit, 5, 0.4), alpha: L });
      const g2 = K.gob({ id: 'g2', x: 148 + K.kb(t, hit + 0.3, 30, 1.1), y: 86, face: t > hit + 0.3 ? 0 : Math.PI, seed: 2, burn: burn2, ...K.walk(t, t > hit + 0.3 ? 1.4 : 0), alpha: L });
      const fly = seg(t, c0, hit), from = [ME.x + 9, ME.y - 26], to = [I[0] - 1, I[1] - 8];
      // (pass 4: the user wanted a straighter flight) thrown hard: a fast, nearly flat line with only a slight arc
      const P = (k) => [lerp(from[0], to[0], k), lerp(from[1], to[1], k) - Math.sin(k * Math.PI) * 3];
      const rp = t >= c0 && t < hit ? P(fly) : null, vel = rp ? [to[0] - from[0], (to[1] - from[1]) - Math.cos(fly * Math.PI) * Math.PI * 3] : [1, 0];
      const e = t - hit, ground = e > 0 ? (1 - seg(t, D - 0.6, D)) : 0;
      return {
        actors: [me, g1, g2], shake: e > 0 && e < 0.25 ? 2.5 : 0,
        under(c, E) {
          if (rp) X.ellipse(c, rp[0], lerp(ME.y + 1, I[1], fly), 3 + fly * 2, 1.5 + fly, 'rgba(8,6,16,0.45)');
          if (e > 0) {
            K.scorch(c, I[0], I[1], 14, 0.75 * ground); K.cracks(c, I[0], I[1], 12, 3, 1, `rgba(20,10,8,${(0.8 * ground).toFixed(2)})`, 7);
            E.em((cc) => { for (let i = 0; i < 18; i++) { const a = rand(i, 51) * TAU, r = Math.sqrt(rand(i, 52)) * 11; if (rand(i, Math.floor(t * 6), 53) < 0.6 * ground) X.px(cc, I[0] + Math.cos(a) * r, I[1] + Math.sin(a) * r * FY * 0.7, i % 3 ? EL.fire[3] : EL.fire[2]); } });
          }
        },
        lights: [...(rp ? [[rp[0], rp[1] + 12, 50, '#ff7a2a', 0.95]] : []), ...(t > 0.3 && t < c0 ? [[ME.x + 4, ME.y - 22, 36, '#ff7a2a', 0.6 * smooth(seg(t, 0.3, 0.8))]] : []), [g1.x, g1.y - 6, 44, '#ff7020', 0.7 * burn], [g2.x, g2.y - 6, 40, '#ff7020', 0.6 * burn2], ...(e > 0 && e < 0.5 ? [[I[0], I[1] - 4, 110, '#ffb060', 1.2 * (1 - e / 0.5)]] : []), ...(e > 0 ? [[I[0], I[1], 34, '#ff7020', 0.5 * ground]] : [])],
        fx(c, A) {
          const ch = A.me.charge, chg = smooth(seg(t, 0.3, 0.85));
          K.prep(c, me, A, t, ['earth', 'fire'], 0.05, 0.4);
          // the charge: a ball of fire swelling at the staff, sparks spiralling into it
          if (t > 0.3 && t < c0) {
            for (let i = 0; i < 7; i++) { const a = t * 8 + i * 0.9, r = 10 - chg * 6; X.px(c, ch[0] + Math.cos(a) * r, ch[1] + Math.sin(a) * r * 0.7, i % 2 ? EL.fire[1] : EL.fire[2]); }
            K.fireball(c, ch[0], ch[1], 1.2 + chg * 3.2, t, 0.2, -1, 4);
          }
          if (rp) {
            // the trail: burning flecks and dark smoke peeling off behind
            for (const p of emit(t, 70, 0.4, (i, age, ts) => { const q = P(Math.max(0, seg(ts, c0, hit))); return { x: q[0] + (rand(i, 2) - 0.5) * 3, y: q[1] + (rand(i, 3) - 0.5) * 3 - age * 8, age }; }, c0, hit)) X.px(c, p.x, p.y, K.fireCol(p.age));
            for (const p of emit(t, 18, 0.7, (i, age, ts) => { const q = P(Math.max(0, seg(ts, c0, hit) - 0.05)); return { x: q[0], y: q[1] - age * 10, age }; }, c0, hit)) if (p.age > 0.2) K.puff(c, p.x, p.y, 1.5 + p.age * 3, '#4a4250', (1 - p.age) * 0.7);
            K.fireball(c, rp[0], rp[1], 5, t, vel[0], vel[1], 7);
          }
          // the burst: a white flash, a ball of flame, a ring of tongues thrown out, embers flung
          if (e > 0 && e < 0.07) X.ellipse(c, I[0], I[1] - 6, 14, 11, '#fff4c0');
          if (e > 0 && e < 0.45) { const q = e / 0.45; X.glow(c, I[0], I[1] - 6, 18 * (1 - q * 0.6), EL.fire[2], 0.95 * (1 - q)); X.glow(c, I[0], I[1] - 6, 10 * (1 - q), EL.fire[1], 0.9 * (1 - q)); }
          if (e > 0 && e < 0.6) { const q = e / 0.6, r = 4 + easeOut(q) * 24; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; K.tongue(c, I[0] + Math.cos(a) * r, I[1] + Math.sin(a) * r * FY, 1.8, (7 + 3 * Math.sin(i * 2.7)) * (1 - q), Math.cos(a) * 2); } K.gring(c, I[0], I[1], r + 2, EL.fire[1], 1 - q, 1); }
          if (e > 0 && e < 1) for (let k = 0; k < 20; k++) { const a = rand(k, 5) * TAU, sp = 18 + rand(k, 6) * 28, vz = 30 + rand(k, 7) * 40, z = vz * e - 90 * e * e; if (z < -1) continue; X.px(c, I[0] + Math.cos(a) * sp * e, I[1] + Math.sin(a) * sp * e * FY - Math.max(0, z), K.fireCol(e * 0.9 + rand(k, 8) * 0.2)); }
          // little flames keep licking where it landed
          if (e > 0.2 && ground > 0.02) for (let i = 0; i < 6; i++) { const a = rand(i, 61) * TAU, r = Math.sqrt(rand(i, 62)) * 8; K.tongue(c, I[0] + Math.cos(a) * r, I[1] + Math.sin(a) * r * FY * 0.7, 1.4, (3 + 2 * Math.sin(t * 12 + i * 2)) * ground * seg(e, 0.2, 0.5), Math.sin(t * 6 + i)); }
          K.dust(c, I[0], I[1], e, 9, 7, 16, '#5a4a48', 0.9);
          K.burning(c, A, g1, t, burn); K.burning(c, A, g2, t, burn2);
        },
      };
    } });

  // ---- Arcane + Cold: a Frost beam. Arcane gives the beam, Cold is what it looks like ----
  const FROST = ['#ffffff', '#e8ffff', '#a8f2ff', '#5ad4f4', '#2a8ccc'];
  add({ id: 'pay-frost-beam', still: 2.3, title: 'Frost beam', group: 'payload', q: ['arcane', 'cold'], cast: 'force', dur: 3.6, ground: 'plaza', seed: 32,
    line: 'Arcane sets the form, a beam; Cold sets the look. The target chills and slows, and once the cold stacks it stands frozen in rime.',
    frame(t, K) {
      const D = 3.6, c0 = 0.55, c1 = 2.5, me = caster(t, 'cold', c0, c1), on = Math.min(easeOut(seg(t, c0, c0 + 0.12)), 1 - seg(t, c1, c1 + 0.1));
      const thaw = 1 - seg(t, D - 0.45, D), ch = smooth(seg(t, c0 + 0.12, c0 + 1.4)) * thaw;
      let bx = 158; for (let s = 0; s < t; s += 0.05) bx -= 9 * (1 - smooth(seg(s, c0 + 0.12, c0 + 1.4))) * 0.05;
      const br = K.brute({ id: 'b1', x: bx, y: 74, face: Math.PI, seed: 4, ...K.walk(t, ch > 0.93 ? 0 : 0.55 * (1 - ch)), chill: ch, flash: on > 0.5 && ch < 0.9 && Math.floor(t * 12) % 3 === 0 ? 0.1 : 0, flashCol: FROST[1] });
      const g1 = K.gob({ id: 'g1', x: 124, y: 98, face: Math.PI - 0.4, seed: 2 });
      return {
        actors: [me, br, g1],
        under(c) {
          // frost creeping out over the flagstones round the target's feet
          const fr = seg(t, c0 + 0.4, c0 + 1.6) * thaw;
          if (fr > 0.02) for (let i = 0; i < 70; i++) { const a = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.7) * 20 * fr, x = br.x + Math.cos(a) * r, y = 75 + Math.sin(a) * r * FY * 0.75; X.px(c, x, y, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
        },
        lights: on > 0.05 ? [[95, 80, 60, '#5ad4f4', 0.45 * on], [br.x, 74, 54, '#bff6ff', 0.6 * on]] : [[br.x, 74, 40, '#9ff4ff', 0.3 * ch]],
        fx(c, A) {
          K.prep(c, me, A, t, ['arcane', 'cold'], 0.05, c0);
          if (on > 0.02) {
            const o = A.me.tip, z = A.b1.chest;
            K.beam(c, o, z, t, FROST, { on });
            // frost shed by the beam: glitter drifting off and down, little wisps of mist
            const dx = z[0] - o[0], dy = z[1] - o[1];
            for (const p of emit(t, 60, 0.6, (i, age) => { const k = rand(i, 71) * on; return { x: o[0] + dx * k + (rand(i, 72) - 0.5) * 4, y: o[1] + dy * k + age * 9 + Math.sin(age * 8 + i) * 1.2, age, i }; })) X.px(c, p.x, p.y, (p.i + Math.floor(t * 16)) % 5 === 0 ? '#ffffff' : p.age < 0.5 ? FROST[2] : FROST[4]);
            for (const p of emit(t, 10, 0.9, (i, age) => { const k = 0.15 + rand(i, 73) * 0.8 * on; return { x: o[0] + dx * k, y: o[1] + dy * k + 2 + age * 5, age }; })) X.glow(c, p.x, p.y, 2 + p.age * 4, '#e0ffff', 0.4 * (1 - p.age));
          }
          K.chilled(c, A, br, t, ch);
          if (ch > 0.9) K.frosty(c, A, br, t);
        },
      };
    } });

  // ---- Lightning chains further through soaked enemies (an ally soaks them first) ----
  add({ id: 'pay-chain-wet', title: 'Lightning arc through soaked enemies', group: 'payload', q: ['lightning', 'lightning'], cast: 'force', dur: 3.6, ground: 'path', seed: 33,
    line: 'Wet targets carry lightning further. The ally soaks the crowd with a water spray, then your arc jumps through all of them.',
    frame(t, K) {
      const D = 3.6, s0 = 0.2, s1 = 1.3, c0 = 1.45, c1 = 2.6, L = K.life(t, D);
      const me = caster(t, 'lightning', c0, c1, K.pose(t, 1.0, c0, c1));
      const al = K.wiz({ id: 'ally', team: 'p2', x: 60, y: 100, face: -0.35, el: 'water', seed: 7, ...K.pose(t, -0.3, s0, s1) });
      const pos = [['g1', 106, 64, 1], ['g2', 122, 80, 2], ['g3', 140, 66, 3], ['g4', 156, 84, 5], ['g5', 176, 70, 6]];
      const on = t > c0 && t < c1, lit = on && Math.floor(t * 18) % 3 !== 2;
      const en = pos.map(([id, x, y, seed], i) => { const wet = seg(t, s0 + 0.2 + i * 0.1, s0 + 0.5 + i * 0.1) * (1 - seg(t, D - 0.3, D)); const hit = on && t > c0 + i * 0.09; return K.gob({ id, x: x + (hit ? Math.sin(t * 60 + i) * 0.6 : 0), y, face: Math.PI, seed, wet, shock: hit ? 1 : 0, dead: K.down(t, c1) * 0.7, alpha: L }); });
      return {
        actors: [me, al, ...en],
        under(c) { for (const s of en) if (s.wet > 0.2) X.poly(c, K.blobPts(s.x, s.y + 1, 7 * s.wet, 3 * s.wet, s.seed), 'rgba(30,74,140,0.55)'); },
        lights: [...(lit ? en.map((s) => [s.x, s.y - 6, 46, '#b08aff', 0.7]) : []), ...(t > s0 && t < s1 ? [[100, 86, 50, '#2a8cff', 0.35]] : [])],
        fx(c, A) {
          K.prep(c, al, A, t, ['water'], -0.3, s0);
          K.cone(c, A.ally.tip, [132, 74], t, 'water', s0, s1, { spread: 0.34, reach: 1.25 });
          K.prep(c, me, A, t, ['lightning', 'lightning'], 1.0, c0);
          for (const s of en) if (s.wet > 0.3 && !s.shock) K.dripping(c, A, s, t);
          if (lit) {
            const seed = Math.floor(t * 18), nodes = [A.me.tip, ...en.filter((s, i) => t > c0 + i * 0.09).map((s) => A[s.id].chest)];
            for (let i = 1; i < nodes.length; i++) { K.zap(c, nodes[i - 1], nodes[i], seed * 13 + i); K.zapHit(c, nodes[i], seed + i); }
            // the current spreads through the water on each body
            for (const s of en) if (s.shock) for (let k = 0; k < 5; k++) X.px(c, s.x + (rand(seed, k, s.seed) - 0.5) * 12, s.y + (rand(seed, k, 9) - 0.5) * 5, k % 2 ? '#ffffff' : EL.lightning[1]);
          }
        },
      };
    } });

  // ---- Lightning + Fire: a Flame arc (v2). Lightning gives the jumping arc, Fire is what it is made of ----
  // The user: "more of a plasma-ish thing than a rope burning", sparks and molten steel.
  // A white-hot arc of plasma with an orange sheath snaps from body to body (no upward
  // flame tongues), and every link and every contact point sprays molten sparks in all
  // directions: ballistic streaks that fall with gravity, white to gold to orange, cooling
  // to red droplets that skitter and wink out on the ground.
  const PLASMA = ['#ffffff', '#fff4c0', '#ffd860', '#ff9a30', '#ff5a20', '#a82818'];
  function moltenSparks(c, gx, gy, z0, t, rate, seed, from, to, k = 1) {
    for (const p of emit(t, rate, 0.75, (i, age) => {
      const a = rand(i, 1, seed) * TAU, sp = 14 + rand(i, 2, seed) * 30, vz = 6 + rand(i, 3, seed) * 34, g = 120;
      return { i, age, a, sp, vz, g, life: 0.75 };
    }, from, to)) {
      if (rand(p.i, 9, seed) > k) continue;
      const T = p.age * p.life, tl = (p.vz + Math.sqrt(p.vz * p.vz + 2 * p.g * z0)) / p.g;   // time to land
      const at = (tt) => { const ttc = Math.min(tt, tl); return [gx + Math.cos(p.a) * p.sp * ttc, gy + Math.sin(p.a) * p.sp * ttc * FY - Math.max(0, z0 + p.vz * ttc - 0.5 * p.g * ttc * ttc)]; };
      const q = at(T), col = PLASMA[Math.min(5, Math.floor(p.age * 5.5))];
      if (T < tl) { const r = at(Math.max(0, T - 0.04)); X.line(c, r[0], r[1], q[0], q[1], p.age < 0.25 ? '#ffffff' : col); }
      else if ((p.i + Math.floor(t * 20)) % 4) X.px(c, q[0] + Math.min(3, (T - tl) * 10) * Math.cos(p.a), q[1], p.age < 0.6 ? PLASMA[3] : PLASMA[5]);   // a droplet on the ground, cooling
    }
  }
  add({ id: 'pay-flame-arc-v2', still: 1.3, title: 'Flame arc', group: 'payload', q: ['lightning', 'fire'], cast: 'force', dur: 3.4, ground: 'grass', seed: 34,
    line: 'Lightning sets the form, an arc that jumps from target to target; Fire sets the look. A white-hot arc of plasma snaps through the crowd, spraying molten sparks, and ignites everyone in it.',
    frame(t, K) {
      const D = 3.4, c0 = 0.55, c1 = 1.85, me = caster(t, 'fire', c0, c1), L = K.life(t, D), J = 0.12;
      const ids = [['g1', 106, 70, 1], ['g2', 130, 88, 2], ['g3', 154, 64, 3], ['g4', 174, 84, 5]];
      const reach = (i) => c0 + i * J + 0.03;
      const en = ids.map(([id, x, y, seed], i) => { const th = reach(i), burn = 0.7 * seg(t, th, th + 0.3) * (1 - seg(t, D - 0.35, D)); return K.gob({ id, x: x + K.kb(t, c1 + 0.1, 8, 0.6), y, face: Math.PI + (t > c1 + 0.1 ? Math.PI : 0), seed, burn, flash: K.flash(t, th) * 0.7, flashCol: PLASMA[1], ...K.walk(t, t > c1 + 0.1 ? 1.3 : 0), alpha: L }); });
      const lit = (i) => t > reach(i) - 0.03 && t < c1;
      return {
        actors: [me, ...en],
        lights: [...en.map((s, i) => [s.x, s.y - 6, 46, '#ffb050', 0.3 * s.burn + (lit(i) ? 0.6 : 0)]), ...(t > c0 && t < c1 ? [[ME.x + 34, ME.y - 6, 60, '#ffc070', 0.6]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['lightning', 'fire'], 0.05, c0);
          const nodes = [A.me.tip, ...en.map((s) => A[s.id].chest)], gnd = [[ME.x + 8, ME.y], ...en.map((s) => [s.x, s.y])], seed = Math.floor(t * 20);
          for (let i = 1; i < nodes.length; i++) {
            if (!lit(i - 1)) continue;
            const a = nodes[i - 1], z = nodes[i];
            // the arc: a jagged plasma channel, re-struck many times a second; an orange sheath, a gold body, a white core
            if ((seed + i) % 5 !== 4) {
              const pts = K.bolt(a, z, seed * 17 + i * 5, 0.3, 4);
              X.lines(c, pts, PLASMA[4], 4); X.lines(c, pts, PLASMA[2], 2); X.lines(c, pts, '#ffffff', 1);
              for (let k = 0; k < 2; k++) { const j = 2 + Math.floor(rand(seed, i, k) * (pts.length - 4)), p = pts[j], an = rand(seed, i, k + 9) * TAU; X.lines(c, K.bolt(p, [p[0] + Math.cos(an) * 7, p[1] + Math.sin(an) * 5], seed + k, 0.5, 2), PLASMA[2], 1); }
            }
            // glowing contact points
            X.glow(c, z[0], z[1], 7 + (seed % 2), PLASMA[2], 0.9); X.rect(c, z[0] - 1, z[1] - 1, 3, 3, '#ffffff');
            // molten sparks: from the contact point, and a few torn off the middle of the link
            moltenSparks(c, gnd[i][0], gnd[i][1], 9, t, 80, i * 7, reach(i - 1), c1);
            const m = [(gnd[i - 1][0] + gnd[i][0]) / 2, (gnd[i - 1][1] + gnd[i][1]) / 2];
            moltenSparks(c, m[0], m[1], 12, t, 34, i * 7 + 3, reach(i - 1), c1);
          }
          // the arc goes out: a last shower of sparks from every contact, falling and cooling
          for (let i = 1; i < nodes.length; i++) moltenSparks(c, gnd[i][0], gnd[i][1], 9, t, 30, i * 11, c1 - 0.05, c1 + 0.1);
          X.glow(c, nodes[0][0], nodes[0][1], 6, PLASMA[2], t > c0 && t < c1 ? 0.9 : 0);
          for (const s of en) K.burning(c, A, s, t, s.burn);
        },
      };
    } });

  // ---- Water + Fire, Force: Scalding spray ----
  add({ id: 'mix-scald-force', group: 'payload', q: ['water', 'fire'], cast: 'force', dur: 3.2, ground: 'path', seed: 35,
    frame(t, K) {
      const D = 3.2, c0 = 0.55, c1 = 2.0, me = caster(t, 'water', c0, c1), L = K.life(t, D);
      const en = [['g1', 108, 66, 1], ['g2', 120, 84, 2]].map(([id, x, y, seed], i) => K.gob({ id, x: x + K.kb(t, c0 + 0.25, 14, 1.4), y, face: Math.PI, seed, wet: seg(t, c0 + 0.3, c0 + 0.8) * (1 - seg(t, D - 0.4, D)), flash: on(t) && Math.floor(t * 10 + i) % 3 === 0 ? 0.1 : 0, flashCol: '#ffe6c8', sq: on(t) ? 0.12 : 0, tint: '#ff8a6a', tintK: 0.3 * seg(t, c0 + 0.3, c0 + 0.6) * (1 - seg(t, D - 0.4, D)), alpha: L }));
      function on(tt) { return tt > c0 + 0.25 && tt < c1; }
      // the mist it leaves: lingers over the spot after the spray stops
      const mist = seg(t, c0 + 0.5, c1) * (1 - seg(t, D - 0.6, D));
      return {
        actors: [me, ...en],
        lights: t > c0 && t < c1 ? [[95, 80, 50, '#ffd0b0', 0.4]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'fire'], 0.05, c0);
          K.cone(c, A.me.tip, [120, 72], t, 'scald', c0, c1, { spread: 0.28 });
          for (const s of en) if (on(t)) { const a = A[s.id]; for (const p of emit(t, 10, 0.8, (i, age) => ({ x: a.chest[0] + (rand(i, s.seed) - 0.5) * 6 + age * 3, y: a.chest[1] - 4 - age * 14, age }))) K.puff(c, p.x, p.y, 1.5 + p.age * 3, EL.steam[1], (1 - p.age) * 0.8); }
          if (mist > 0.05) for (let i = 0; i < 14; i++) { const x = 104 + rand(i, 1) * 44 + Math.sin(t * 0.8 + i) * 3, y = 62 + rand(i, 2) * 26 - 6 - Math.sin(t * 0.6 + i * 2) * 2; K.puff(c, x, y, 4 + rand(i, 3) * 3, i % 3 ? EL.steam[1] : EL.steam[2], mist * 0.75); }
        },
      };
    } });

  // ---- Water + Fire, Place: Steam cloud that blocks sight ----
  add({ id: 'mix-steam-place', group: 'payload', q: ['water', 'fire'], cast: 'place', dur: 3.8, ground: 'grass', seed: 36,
    line: 'A scalding mist at the cursor that blocks sight. The archer loses its target behind it.',
    frame(t, K) {
      const D = 3.8, c0 = 0.55, me = caster(t, 'fire', c0, 0.8), P = [110, 72];
      const cl = easeOut(seg(t, c0, c0 + 0.6)) * (1 - seg(t, D - 0.5, D));
      // the archer draws on the caster, then the cloud forms and it lowers the bow, confused
      const dr = seg(t, 0.1, 0.8) * (1 - seg(t, c0 + 0.5, c0 + 0.8)) + seg(t, D - 0.3, D) * 0;
      const ar = K.archer({ id: 'a1', x: 170, y: 70, face: Math.PI + (cl > 0.6 && t < D - 0.4 ? Math.sin(t * 3.2) * 0.7 : 0), seed: 4, draw: dr });
      const g1 = K.gob({ id: 'g1', x: 112, y: 76, face: Math.PI, seed: 1, wet: cl > 0.5 ? 0.6 : 0, flash: cl > 0.3 && cl < 0.9 && Math.floor(t * 10) % 3 === 0 ? 0.1 : 0, flashCol: '#ffe6c8' });
      return {
        actors: [me, ar, g1],
        under(c) { if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0)); },
        lights: cl > 0 ? [[P[0], P[1] - 6, 60, '#d8e0f0', 0.35 * cl]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'fire'], 0.05, c0);
          // the archer's sight line: it reaches the caster until the cloud forms, then it sweeps about, lost in the cloud
          const eye = A.a1.head;
          const seen = cl < 0.3;
          if ((dr > 0.3 && seen) || (!seen && t < D - 0.4)) for (let k = 0; k < 40; k += seen ? 3 : 2) { const x = lerp(eye[0], ME.x + 4, k / 40), y = lerp(eye[1] + 3, ME.y - 10, k / 40) + (seen ? 0 : Math.sin(t * 3.2) * 10 * (k / 40)); X.px(c, x, y, seen ? '#ff6a6a' : (k + Math.floor(t * 12)) % 2 ? '#ff6a6a' : '#7a2a3a'); }
          // the cloud: big soft billows, drawn over the bodies inside it
          if (cl > 0.02) {
            for (let i = 0; i < 26; i++) {
              const a = rand(i, 11) * TAU, r = Math.sqrt(rand(i, 12)) * 26 * cl, x = P[0] + Math.cos(a) * r + Math.sin(t * 0.9 + i) * 2, y = P[1] + Math.sin(a) * r * 0.55 - 8 - rand(i, 13) * 10 * cl + Math.sin(t * 1.3 + i) * 1.5;
              K.puff(c, x, y + 2, (5 + rand(i, 14) * 4) * (0.5 + cl * 0.5), '#6a7088', cl);
              K.puff(c, x - 1, y, (4.5 + rand(i, 14) * 4) * (0.5 + cl * 0.5), i % 4 === 0 ? EL.steam[1] : i % 2 ? '#a8b0c4' : EL.steam[2], cl);
            }
            for (const p of emit(t, 8, 1.5, (i, age) => ({ x: P[0] + (rand(i, 21) - 0.5) * 50, y: P[1] - 14 - age * 16, age }))) K.puff(c, p.x, p.y, 3 + p.age * 4, EL.steam[2], (1 - p.age) * 0.7 * cl);
          }
        },
      };
    } });

  // ---- Water + Cold, Force: Ice shards. A volley of jagged shards that pierce and chill ----
  // (The freezing spray was too strong: this replaces it.) Each shard flies straight through
  // the first body and on; a few stick in the ground beyond and splinter. Every shard that
  // passes through a goblin chills it a little more, so rime builds up hit by hit.
  add({ id: 'mix-ice-shards', still: 1.1, title: 'Ice shards', group: 'payload', q: ['water', 'cold'], cast: 'force', dur: 3.4, ground: 'plaza', seed: 37,
    line: 'Water and cold as Force: a volley of jagged ice shards. They pierce through bodies and chill everything they pass through.',
    frame(t, K) {
      const D = 3.4, c0 = 0.55, N = 10, GAP = 0.085, SPD = 230, c1 = c0 + N * GAP, me = caster(t, 'cold', c0, c1), L = K.life(t, D);
      const O = [ME.x + 13, ME.y - 12], thaw = 1 - seg(t, D - 0.45, D);
      const gobs = [['g1', 112, 68, 1], ['g2', 128, 84, 2], ['g3', 150, 72, 3]];
      // each shard: launch time, heading, where it stops (in the ground) or flies off screen
      const shards = [];
      for (let j = 0; j < N; j++) {
        const aim = Math.atan2(76 - 14 - O[1], 130 - O[0]) + (rand(j, 1) - 0.5) * 0.28 + Math.sin(j * 2.1) * 0.05;
        const stick = j % 3 === 1 ? 105 + rand(j, 2) * 50 : 999;
        shards.push({ j, ts: c0 + j * GAP, ang: aim, stick, len: 5.5 + rand(j, 3) * 2.5 });
      }
      const posOf = (sh, d) => [O[0] + Math.cos(sh.ang) * d, O[1] + Math.sin(sh.ang) * d + (d / 140) * (d / 140) * 10];
      // when does a shard pass through a body (its chest, about 8 px above the feet)?
      const hits = gobs.map(([, gx, gy]) => { const out = []; for (const sh of shards) { const d = (gx - O[0]) / Math.cos(sh.ang); if (d > sh.stick) continue; const p = posOf(sh, d); if (Math.abs(p[1] - (gy - 8)) < 5) out.push({ th: sh.ts + d / SPD, j: sh.j }); } return out; });
      const en = gobs.map(([id, x, y, seed], i) => {
        const H = hits[i], ch = Math.min(1, H.reduce((m, h) => m + 0.3 * seg(t, h.th, h.th + 0.08), 0)) * thaw;
        const fl = H.reduce((m, h) => Math.max(m, K.flash(t, h.th)), 0), kb = H.reduce((m, h) => m + K.kb(t, h.th, 2.2, 0.15), 0);
        let xx = x + 12; for (let s = 0; s < t; s += 0.05) xx -= 9 * (1 - Math.min(1, H.reduce((m, h) => m + 0.3 * seg(s, h.th, h.th + 0.08), 0))) * 0.05 * (s < c0 + 1.5 ? 1 : 0);
        return K.gob({ id, x: xx + kb, y, face: Math.PI, seed, ...K.walk(t, ch > 0.85 ? 0 : 1 - ch * 0.8), chill: ch, flash: fl * 0.6, flashCol: '#e0ffff', alpha: L, H, ch });
      });
      return {
        actors: [me, ...en],
        lights: [...(t > c0 && t < c1 + 0.3 ? [[ME.x + 14, ME.y - 14, 40, '#9ff4ff', 0.5]] : []), ...en.map((s) => [s.x, s.y - 6, 30, '#bff4ff', 0.3 * s.ch])],
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'cold'], 0.05, c0);
          for (const sh of shards) {
            const e = t - sh.ts; if (e < 0) continue;
            // a puff of frost at the staff as each one leaves
            if (e < 0.12) { X.glow(c, O[0] + 3, O[1], 5, '#e0ffff', 0.8 * (1 - e / 0.12)); X.px(c, O[0] + 4, O[1] - 2 + (sh.j % 3), '#ffffff'); }
            let d = e * SPD; const stuck = d >= sh.stick; if (stuck) d = sh.stick;
            const p = posOf(sh, d);
            if (p[0] > 210 || p[1] > 130) continue;
            if (!stuck) {
              // a thin trail of frost glitter behind it
              for (let k = 1; k <= 4; k++) { const q = posOf(sh, Math.max(0, d - k * 4)); X.px(c, q[0], q[1], k === 1 ? EL.cold[1] : k < 3 ? EL.cold[2] : EL.cold[4]); }
              K.shard(c, p[0], p[1], sh.ang + (d / 140) * 0.14, sh.len, sh.j + 11);
            } else {
              // stuck in the ground, tilted, then it splinters into glitter and melts away
              const te = e - sh.stick / SPD, gy = p[1] + 7, fade = 1 - seg(te, 0.9, 1.3);
              if (fade > 0.05) { X.ellipse(c, p[0] - 2, gy + 1, 3, 1, 'rgba(8,6,16,0.45)'); K.shard(c, p[0] - 2, gy - 2, sh.ang + 0.9, sh.len * 0.8, sh.j + 11, fade); }
              if (te < 0.12) for (let k = 0; k < 6; k++) { const a = rand(k, sh.j, 5) * TAU; X.px(c, p[0] - 2 + Math.cos(a) * te * 40, gy - 2 + Math.sin(a) * te * 20, '#ffffff'); }
              if (te > 0.9 && te < 1.35) for (let k = 0; k < 7; k++) { const q = (te - 0.9) / 0.45, a = rand(k, sh.j, 6) * TAU; X.px(c, p[0] - 2 + Math.cos(a) * q * 7, gy - 2 + Math.sin(a) * q * 4 + q * q * 3, q < 0.5 ? '#ffffff' : EL.cold[2]); }
            }
          }
          // where a shard punches through a body: a spray of ice glitter out the far side
          for (const s of en) for (const h of s.H) { const e = t - h.th; if (e < 0 || e > 0.2) continue; const a = A[s.id]; if (!a) continue; for (let k = 0; k < 6; k++) { const ang = (rand(k, h.j, 9) - 0.5) * 1.4; X.px(c, a.chest[0] + 3 + Math.cos(ang) * e * 60, a.chest[1] + Math.sin(ang) * e * 40, k % 2 ? '#ffffff' : EL.cold[1]); } }
          for (const s of en) K.chilled(c, A, s, t, s.ch);
        },
      };
    } });

  // ---- Water + Cold, Place: Ice sheet; goblins slip and fall ----
  add({ id: 'mix-ice-place', group: 'payload', q: ['water', 'cold'], cast: 'place', dur: 3.8, ground: 'grass', seed: 38,
    line: 'Water and cold at the cursor: a sheet of ice. Enemies running onto it slip and fall.',
    frame(t, K) {
      const D = 3.8, c0 = 0.55, me = caster(t, 'water', c0, 0.8), P = [120, 78], L = K.life(t, D);
      const k = easeOut(seg(t, c0, c0 + 0.5)) * (1 - seg(t, D - 0.4, D));
      const run = (x0, y, i, seed) => {
        const tt = seg(t, 0.4 + i * 0.25, 2.6 + i * 0.25), x = lerp(x0, x0 - 70, tt), onIce = Math.abs(x - P[0]) < 30 && k > 0.8;
        const slip = onIce ? 1 : 0;
        return K.gob({ id: 'g' + i, x: x - (onIce ? Math.sin(t * 6 + i) * 1.5 : 0), y, face: Math.PI + (onIce ? Math.sin(t * 9 + i) * 0.7 : 0), seed, ...K.walk(t, onIce ? 1.6 : 1.1), dead: onIce && tt > 0.55 ? 0.8 : 0, alpha: L, slip });
      };
      const en = [run(172, 74, 0, 1), run(184, 84, 1, 2), run(166, 92, 2, 3)];
      return {
        actors: [me, ...en],
        under(c) {
          if (t > c0 - 0.4 && t < c0 + 0.1) K.reticle(c, P[0], P[1], t, '#f2666a', seg(t, c0 - 0.4, c0));
          if (k > 0.02) { X.poly(c, K.blobPts(P[0], P[1], 36 * k, 15 * k, 2), '#7ab8d4'); X.poly(c, K.blobPts(P[0], P[1] - 1, 30 * k, 12 * k, 2), '#b4e4f4'); for (let i = 0; i < 8; i++) { const x0 = P[0] + (rand(i, 71) - 0.5) * 50 * k, y0 = P[1] + (rand(i, 72) - 0.5) * 18 * k; X.line(c, x0, y0, x0 + 5, y0, '#ffffff'); } }
        },
        lights: [[P[0], P[1], 56, '#9ff4ff', 0.45 * k]],
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'cold'], 0.05, c0);
          if (t > c0 && t < c0 + 0.5) for (const p of emit(t, 60, 0.4, (i, age) => { const a = rand(i, 3) * TAU, r = (0.3 + age) * 30; return { x: P[0] + Math.cos(a) * r, y: P[1] + Math.sin(a) * r * 0.42, age }; }, c0, c0 + 0.5)) X.px(c, p.x, p.y, p.age < 0.5 ? '#ffffff' : EL.cold[2]);
          for (const s of en) if (s.slip) { X.px(c, s.x + 5, s.y, '#ffffff'); X.px(c, s.x + 8, s.y + 1, '#e0ffff'); if (s.dead > 0.5) { const a = A[s.id]; if (a && a.head) for (let j = 0; j < 3; j++) { const ang = t * 6 + j * 2.1; X.px(c, a.head[0] + Math.cos(ang) * 4, a.head[1] - 3 + Math.sin(ang) * 2, '#ffe070'); } } }
          if (k > 0.9) for (let i = 0; i < 3; i++) if (Math.floor(t * 3 + i) % 3 === 0) X.px(c, P[0] - 20 + i * 18, P[1] - 3 + (i % 2) * 5, '#ffffff');
        },
      };
    } });
})();
