/* Spell VFX vignettes, group 3: Shield barriers. Walls are drawn tall and solid (taller
 * than a goblin, up to a wizard's shoulder) and show damage; energy barriers fade as the
 * caster's Shield runes run low (the upkeep rule: stuff costs once, energy costs upkeep). */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit, mod } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster;
  const bez = (a, b, c, n = 24) => { const o = []; for (let i = 0; i <= n; i++) { const k = i / n, u = 1 - k; o.push([u * u * a[0] + 2 * u * k * b[0] + k * k * c[0], u * u * a[1] + 2 * u * k * b[1] + k * k * c[1]]); } return o; };
  // punch timeline for a brute: returns s.punch (0..1 or -1) for a list of hit times (hit lands at phase 0.5)
  const punchAt = (t, hits) => { for (const h of hits) { const p = (t - (h - 0.27)) / 0.55; if (p >= 0 && p < 1) return p; } return -1; };

  // ---- Drawn rock wall: drag a line, the wall rises along it, the brute cracks it ----
  add({ id: 'sh-drawn-rock', still: 3.9, group: 'shield', q: ['shield', 'earth'], cast: 'place', opts: { drag: true }, dur: 4.6, ground: 'grass', seed: 41,
    line: 'Hold, drag, let go: a rock wall rises along the line you drew. It blocks bodies and shots, and lasts until it breaks.',
    frame(t, K) {
      const D = 4.6, d0 = 0.35, d1 = 1.0, me = caster(t, 'earth', d1, 1.25, K.pose(t, 0.05, d1, 1.25)), L = K.life(t, D, 0.25, 0.4);
      const path = bez([86, 46], [130, 70], [90, 108]);
      const rise = (f) => easeOut(seg(t, d1 + f * 0.3, d1 + 0.18 + f * 0.3)) * (1 - seg(t, D - 0.4, D));
      const wallX = (y) => { let best = path[0]; for (const p of path) if (Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p; return best[0]; };
      // goblins walk in and are stopped by the wall
      const walker = (id, y, x0, start, seed) => { const free = x0 - (t - start) * 34, stop = wallX(y) + 9, x = Math.max(free, t > d1 + 0.3 ? stop : -99); const blocked = x === stop && t > d1 + 0.3; return K.gob({ id, x, y, face: Math.PI + (blocked ? Math.sin(t * 3 + seed) * 0.5 : 0), seed, ...K.walk(t, blocked ? 0.25 : 1), sq: blocked && mod(t + seed, 1.2) < 0.1 ? 0.25 : 0, alpha: L }); };
      // the brute punches the upper half from behind; the damage spalls out of the face we see
      const hits = [2.5, 3.1, 3.7], pu = punchAt(t, hits), BY = 62;
      const dmgK = hits.filter((h) => t > h).length / 3;
      const bx = Math.max(176 - (t - 0.6) * 30, wallX(BY) + 16);
      const br = K.brute({ id: 'b1', x: bx, y: BY, face: Math.PI, seed: 4, ...K.walk(t, bx > wallX(BY) + 16.5 ? 0.8 : 0), punch: pu, alpha: L });
      const en = [walker('g1', 46, 180, 0.2, 1), walker('g2', 96, 170, 0.7, 2), br];
      // where along the wall the brute's fist lands (fraction of its ground length)
      let tot = 0, at = 0; const cum = [0];
      for (let i = 1; i < path.length; i++) { tot += Math.hypot(path[i][0] - path[i - 1][0], (path[i][1] - path[i - 1][1]) / FY); cum.push(tot); }
      for (let i = 0; i < path.length; i++) if (Math.abs(path[i][1] - BY) < Math.abs(path[at][1] - BY) && path[i][1] < 72) at = i;
      const stand = [];
      K.wall(stand, path, { h: 22, th: 4.5, rise, seed: 3, dmg: [{ f: cum[at] / tot, k: dmgK }] });
      const hitE = hits.map((h) => t - h).find((e) => e > 0 && e < 0.8);
      return {
        actors: [me, ...en], stand, shake: hitE != null && hitE < 0.15 ? 1.5 : 0,
        under(c, E) {
          if (t > d0 - 0.1 && t < d1 + 0.05) { const k = seg(t, d0, d1); K.dragPath(c, path, k, X.TEAM.p1.light, t); const n = Math.floor((path.length - 1) * k); K.reticle(c, path[n][0], path[n][1], t, X.TEAM.p1.light, 1); }
          if (t > d1) for (let i = 0; i < path.length; i += 2) X.px(c, path[i][0] - 5, path[i][1] + 2, 'rgba(40,28,18,0.7)');
        },
        lights: [...(t > d1 && t < d1 + 0.6 ? [[100, 76, 70, '#e0c8a0', 0.5 * (1 - seg(t, d1, d1 + 0.6))]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'earth'], 0.05, d0);
          // dust boils up as each piece of wall tears out of the ground
          for (let i = 0; i < path.length; i += 3) { const f = i / (path.length - 1); K.dust(c, path[i][0], path[i][1], t - (d1 + f * 0.3), i, 3, 8, '#8a7a68', 0.7); }
          if (hitE != null) { const p = [wallX(BY) - 3, BY - 12]; K.dust(c, p[0], p[1] + 10, hitE, 9, 7, 14, '#8a7a68', 0.9); K.debris(c, p[0], p[1], hitE, 7 + hits.filter((h) => t > h).length, 10, 34, [K.ROCK[0], K.ROCK[2], K.ROCK[4]], 40); if (hitE < 0.08) X.ellipse(c, p[0], p[1], 5, 5, '#ffffff'); }
        },
      };
    } });

  // ---- Barrier arc: the quick energy wall; arrows stop on it; it fades as Shield runs low ----
  add({ id: 'sh-arc-barrier', group: 'shield', q: ['shield'], cast: 'place', dur: 4.6, ground: 'plaza', seed: 42,
    line: 'Let go without dragging: an arc of light rises around you, facing the cursor. Shots cannot pass. It fades as your Shield runes run low.',
    frame(t, K) {
      const D = 4.6, c0 = 0.55, me = caster(t, 'shield', c0, 0.8), al = K.ally({ x: 34, y: 88, face: 0.1 });
      const v = Math.max(0, 3 - 0.2 * seg(t, c0, D) * 4 - 0.55 * [1.1, 1.7, 2.3, 2.9, 3.4].filter((h) => t > h + 0.28).length);   // upkeep trickle + each absorbed hit
      const fade = clamp((1.3 - v) / 1.3, 0, 1), up = easeOut(seg(t, c0, c0 + 0.25)) * (v > 0.15 ? 1 : 1 - seg(t, 3.95, 4.15));
      const arc = K.arcPts(ME.x, ME.y + 2, 24, -1.15, 1.15, 26);
      const at = (f) => arc[Math.round(f * (arc.length - 1))];
      const shots = [[1.1, 'a1', 0.35], [1.7, 'a2', 0.68], [2.3, 'a1', 0.42], [2.9, 'a2', 0.6], [3.4, 'a1', 0.5]];
      const drawOf = (id) => { for (const [h, who] of shots) if (who === id && t > h - 0.6 && t < h) return seg(t, h - 0.6, h - 0.1); return 0; };
      const a1 = K.archer({ id: 'a1', x: 156, y: 62, face: Math.PI, seed: 4, draw: drawOf('a1') }), a2 = K.archer({ id: 'a2', x: 166, y: 90, face: Math.PI, seed: 5, draw: drawOf('a2') });
      const hits = shots.map(([h, , f]) => ({ f, e: t - h - 0.28, hz: 9 })).filter((r) => r.e > -0.01);
      const stand = [];
      if (up > 0.02) K.sheet(stand, arc, { h: 17, rise: () => up, fade: Math.max(fade, 1 - up), hits, span: 110, alpha: 0.26 }, t);
      return {
        actors: [me, al, a1, a2], stand,
        lights: up > 0.05 ? [0, 0.25, 0.5, 0.75, 1].map((f) => [at(f)[0], at(f)[1], 26, '#ffc83a', 0.32 * up * (1 - fade * 0.6)]) : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield'], 0.05, c0);
          for (const [h, who, f] of shots) {
            const e = (t - h) / 0.28, src = A[who] && A[who].bowTip;
            if (!src) continue;
            const dst = at(f), dz = [dst[0], dst[1] - 9];
            if (e >= 0 && e < 1) K.arrow(c, lerp(src[0], dz[0], e), lerp(src[1], dz[1], e) - Math.sin(e * Math.PI) * 3, Math.atan2(dz[1] - src[1], dz[0] - src[0]));
            if (e >= 1 && e < 2.5) { const k = (e - 1) / 1.5; K.arrow(c, dz[0] + 3 + k * 4, dz[1] + k * k * 9, 0.9 + k * 2); }
          }
          // the caster's Shield runes: upkeep drains them; at the end the arc gutters out
          if (t > c0) K.pool(c, Math.round(A.me.head[0]), Math.round(A.me.head[1]) - 16, v, 4, 'shield', t);
        },
      };
    } });

  // ---- Ring of stone: a closed rock ring rises round you, the goblins are shut out ----
  // (pass 3: a larger radius, and at the end it crumbles: each piece breaks off in turn,
  // rubble and dust tumble out and the stones lie on the ground, instead of sinking)
  add({ id: 'sh-ring-stone', still: 3.0, group: 'shield', q: ['shield', 'earth'], cast: 'area', dur: 4.4, ground: 'grass', seed: 43,
    frame(t, K) {
      const D = 4.4, c0 = 0.6, me = caster(t, 'earth', c0, 0.9), L = K.life(t, D, 0.25, 0.4);
      const R = 34, CX = ME.x + 4, CY = ME.y + 4, ring = K.circlePts(CX, CY, R, 48);
      const cr0 = D - 1.15, brkAt = (f) => cr0 + rand(Math.round(f * 997), 7, 43) * 0.5 + Math.sin(f * TAU * 2) * 0.06;
      const rise = (f) => easeOut(seg(t, c0 + f * 0.25, c0 + 0.15 + f * 0.25)) * (t < brkAt(f) ? 1 : 0);
      const al = K.ally({ x: 40, y: 82, face: 0.5 });
      // two goblins club the ring where the camera sees its outer face; it chips and cracks
      const HIT = { g2: [1.75, 2.25, 2.75], g4: [1.95, 2.5, 3.05] };
      const walker = (id, ang, seed, start) => {
        const dist = Math.max(78 - (t - start) * 28, R + 8), stop = dist === R + 8, hs = HIT[id] || [];
        const lunge = hs.reduce((m, h) => Math.max(m, K.hop(t, h - 0.12, 3, 0.24)), 0);
        const x = ME.x + 4 + Math.cos(ang) * (dist - lunge), y = ME.y + 4 + Math.sin(ang) * (dist - lunge) * FY;
        return K.gob({ id, x, y, face: ang + Math.PI + (stop && !hs.length ? Math.sin(t * 3 + seed) * 0.6 : 0), seed, ...K.walk(t, stop ? 0.2 : 1), sq: lunge > 1 ? 0.25 : 0, alpha: L, ang, hs });
      };
      const en = [walker('g1', -0.4, 1, 0.2), walker('g2', 0.35, 2, 0.1), walker('g3', -2.5, 3, 0.8), walker('g4', 2.6, 5, 0.1)];
      const fOf = (a) => PB.mod(a / TAU, 1), dmg = en.filter((s) => s.hs.length).map((s) => ({ f: fOf(s.ang), k: s.hs.filter((h) => t > h).length / s.hs.length }));
      const stand = []; K.wall(stand, ring, { h: 19, th: 3.5, rise, closed: true, seed: 5, dmg });
      const blows = []; for (const s of en) for (const h of s.hs) if (t > h && t < h + 0.8) blows.push([s, t - h]);
      // the crumble: per wall piece, the moment it breaks and where it stood
      const SP = K.sample(ring, 3, true), pieces = SP.map((p, i) => { const f = (i + 0.5) / SP.length; return { p, f, tb: brkAt(f), i }; });
      const fallen = pieces.filter((q) => t > q.tb);
      const rubA = 1 - seg(t, D - 0.3, D - 0.02);
      for (const q of fallen) for (let k = 0; k < 2; k++) {
        // stones it leaves lying at its foot, scattered a little outward
        const out = 1 + rand(q.i, k, 3) * 4, a = Math.atan2((q.p[1] - CY) / FY, q.p[0] - CX), x = q.p[0] + Math.cos(a) * out * (k ? 1 : -0.5) + (rand(q.i, k, 4) - 0.5) * 3, y = q.p[1] + Math.sin(a) * out * FY * (k ? 1 : -0.5) + 1;
        if (rand(q.i, k, 5) > rubA) continue;
        stand.push([y, (c) => K.rock(c, x, y - 1, 1.6 + rand(q.i, k, 6) * 1.4, q.i * 3 + k)]);
      }
      return {
        actors: [me, al, ...en], stand, shake: t > c0 && t < c0 + 0.3 ? 1 : blows.some(([, e]) => e < 0.1) ? 0.8 : t > cr0 && t < cr0 + 0.55 ? 0.6 : 0,
        lights: t > c0 && t < c0 + 0.7 ? [[ME.x, ME.y, 70, '#e0c8a0', 0.5 * (1 - seg(t, c0, c0 + 0.7))]] : [],
        under(c) { if (fallen.length) for (const q of fallen) X.px(c, q.p[0], q.p[1] + 1, 'rgba(40,28,18,0.6)'); },
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'earth'], 0.05, c0);
          // each piece bursts into tumbling chunks and a puff of dust as it breaks
          for (const q of pieces) { const e = t - q.tb; if (e < 0 || e > 1) continue; K.debris(c, q.p[0], q.p[1] - 10, e, q.i * 7 + 1, 4, 18, [K.ROCK[1], K.ROCK[2], K.ROCK[4]], 26); if (q.i % 2 === 0) K.dust(c, q.p[0], q.p[1] - 3, e, q.i, 3, 9, '#8a7a68', 0.8); if (e < 0.05) X.rect(c, q.p[0] - 1, q.p[1] - 12, 3, 3, K.ROCK[0]); }
          for (let i = 0; i < ring.length; i += 2) K.dust(c, ring[i][0], ring[i][1], t - (c0 + (i / ring.length) * 0.25), i, 3, 8, '#8a7a68', 0.7);
          for (const [s, e] of blows) { const wx = ME.x + 4 + Math.cos(s.ang) * (R + 2), wy = ME.y + 4 + Math.sin(s.ang) * (R + 2) * FY; K.dust(c, wx, wy - 2, e, s.seed + Math.round((t - e) * 10), 5, 10, '#8a7a68', 0.7); K.debris(c, wx, wy - 9, e, s.seed * 3 + Math.round((t - e) * 10), 7, 26, [K.ROCK[0], K.ROCK[2], K.ROCK[4]], 36); if (e < 0.06) X.rect(c, wx - 2, wy - 11, 4, 4, '#ffffff'); }
        },
      };
    } });

  // ---- Tidal wave: a wall of water sweeps forward, soaks and shoves, then breaks ----
  add({ id: 'sh-tidal', group: 'shield', q: ['shield', 'water', 'water'], cast: 'force', dur: 3.6, ground: 'path', seed: 44,
    frame(t, K) {
      const D = 3.6, c0 = 0.6, me = caster(t, 'water', c0, 0.9), L = K.life(t, D);
      const prog = seg(t, c0, c0 + 1.5), front = lerp(62, 200, easeOut(prog) * 0.4 + prog * 0.6);
      const hW = (y) => { const k = 1 - Math.pow((y - 74) / 34, 2); return k <= 0 ? 0 : 18 * Math.sqrt(k) * smooth(seg(t, c0, c0 + 0.2)) * (1 - seg(front, 160, 200)); };
      const fx0 = (y) => front - Math.pow((y - 74) / 34, 2) * 12;
      const carry = (x0, y) => { const f = fx0(y); return t > c0 && f + 3 > x0 ? Math.min(f + 3, x0 + 40) : x0; };
      const en = [['g1', 104, 60, 1], ['g2', 118, 80, 2], ['g3', 140, 94, 3], ['g4', 132, 68, 5]].map(([id, x, y, seed]) => { const x2 = carry(x, y), moved = x2 > x + 0.5; return K.gob({ id, x: x2, y, face: Math.PI + (moved ? 0.8 : 0), seed, wet: moved ? 1 : 0, dead: moved ? K.down(t, c0 + 0.3, 2.9) * 0.6 : 0, z: moved && hW(y) > 6 ? 3 : 0, alpha: L }); });
      const stand = [];
      if (t > c0 && front < 200) for (let y = 40; y <= 108; y += 2) {
        const h = hW(y); if (h < 1) continue;
        const x = fx0(y);
        stand.push([y, (c, E) => {
          X.poly(c, [[x - 18, y], [x - 2, y - h], [x + 2, y - h + 2], [x + 1, y]], EL.water[3]);
          X.poly(c, [[x - 9, y - h * 0.5], [x - 2, y - h], [x + 2, y - h + 2], [x, y - h * 0.4]], EL.water[2]);
          E.em((cc) => { X.line(cc, x - 3, y - h, x + 2, y - h + 2, '#ffffff'); X.px(cc, x - 5, y - h + 1, EL.water[0]); if (y % 4 === 0) X.px(cc, x + 1, y - 1, EL.water[1]); });
        }]);
      }
      return {
        actors: [me, ...en], stand,
        under(c) {
          // the soaked ground left behind: wet streaks along the wave's path, drying out
          if (t > c0) { const tail = Math.min(front, 200), a = 0.4 * (1 - seg(t, D - 0.8, D)); for (let i = 0; i < 16; i++) { const x = 66 + rand(i, 61) * 130, y = 50 + rand(i, 62) * 50; if (x > tail - 8) continue; X.poly(c, K.blobPts(x, y, 6 + rand(i, 63) * 9, 2 + rand(i, 64) * 2, i), `rgba(30,74,140,${a.toFixed(2)})`); } }
        },
        lights: t > c0 && front < 200 ? [[front, 74, 60, '#3a98ff', 0.5]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'water', 'water'], 0.05, c0);
          if (t > c0 && front < 210) for (const p of emit(t, 90, 0.5, (i, age, ts) => { const y = 42 + rand(i, 3) * 64, h = hW(y); if (h < 3) return null; const x = fx0(y); return { x: x + age * 10 + rand(i, 4) * 3, y: y - h - age * 6 + age * age * 14, age }; })) X.px(c, p.x, p.y, p.age < 0.4 ? '#ffffff' : EL.water[1]);
          if (front > 160 && front < 205) for (let k = 0; k < 20; k++) { const y = 44 + rand(k, 9) * 60, e = seg(front, 160, 205); K.puff(c, 168 + rand(k, 10) * 24, y - 6 - e * 8, 2 + e * 3, k % 2 ? '#ffffff' : EL.water[0], 1 - e); }
          for (const s of en) if (s.wet) K.dripping(c, A, s, t);
        },
      };
    } });

  // ---- Fault line: a heave of broken ground sweeps forward, knocking everyone down ----
  add({ id: 'sh-fault', group: 'shield', q: ['shield', 'earth'], cast: 'force', dur: 3.4, ground: 'grass', seed: 45,
    frame(t, K) {
      const D = 3.4, c0 = 0.6, me = caster(t, 'earth', c0, 0.9), L = K.life(t, D);
      const front = lerp(60, 205, seg(t, c0, c0 + 1.2));
      const fx0 = (y) => front - Math.pow((y - 74) / 30, 2) * 8;
      const passed = (x, y) => { for (let k = 0; k < 60; k++) { const tt = c0 + k * 0.02, f = lerp(60, 205, seg(tt, c0, c0 + 1.2)) - Math.pow((y - 74) / 30, 2) * 8; if (f >= x) return tt; } return 99; };
      const en = [['g1', 100, 62, 1], ['g2', 120, 84, 2], ['b1', 152, 72, 4], ['g3', 140, 98, 3]].map(([id, x, y, seed]) => { const th = passed(x, y), k = id[0] === 'b' ? 'brute' : 'gob'; return K[k]({ id, x: x + K.kb(t, th, 4, 0.3), y, face: Math.PI, seed, z: K.hop(t, th, 7, 0.35), dead: K.down(t, th + 0.1, th + 1.4), flash: K.flash(t, th) * 0.4, alpha: L }); });
      const stand = [];
      if (t > c0 && t < c0 + 1.3) for (let y = 46; y <= 102; y += 6) for (let j = 0; j < 3; j++) {
        const x = fx0(y) - j * 6 + (rand(y, j) - 0.5) * 4, h = (13 - j * 4) * (0.7 + rand(y, j, 2) * 0.6) * (1 - Math.pow((y - 74) / 32, 2));
        if (h < 1.5) continue;
        const w = 3 + rand(y, j, 3) * 2, yy = y + (rand(y, j, 4) - 0.5) * 2;
        stand.push([yy, (c, E) => E.op((cc) => { X.poly(cc, [[x - w - 1, yy + 1], [x + w + 1, yy + 1], [x + 1, yy - h - 1], [x - 1, yy - h - 1]], '#1a120c'); X.poly(cc, [[x - w, yy], [x + w, yy], [x + 0.5, yy - h]], K.ROCK[2]); X.poly(cc, [[x - w, yy], [x - w * 0.1, yy], [x, yy - h + 1]], K.ROCK[0]); X.rect(cc, x - w, yy - 1, w * 2, 1, K.ROCK[4]); })]);
      }
      return {
        actors: [me, ...en], stand, shake: t > c0 && t < c0 + 1.2 ? 1 : 0,
        under(c) {
          // the fault it leaves: one jagged main crack with short branches, and turned soil
          if (t > c0) {
            const tail = Math.min(front, 205), col = `rgba(26,18,12,${(0.9 * (1 - seg(t, D - 0.5, D))).toFixed(2)})`;
            let px = 62, py = 74;
            for (let x = 66; x < tail - 6; x += 3) { const ny = 74 + Math.sin(x * 0.3) * 1.5 + (rand(x, 3) - 0.5) * 2; X.line(c, px, py, x, ny, col); if (rand(x, 4) < 0.18) { const s = rand(x, 5) < 0.5 ? -1 : 1; X.lines(c, [[x, ny], [x + 3, ny + s * 3], [x + 5, ny + s * 6]], col); } px = x; py = ny; }
            for (let i = 0; i < 18; i++) { const x = 66 + rand(i, 71) * 130, y = 66 + rand(i, 72) * 16; if (x < tail - 6) X.rect(c, x, y, 2, 1, i % 2 ? '#553e2a' : '#76583c'); }
          }
        },
        lights: t > c0 && t < c0 + 1.2 ? [[front, 74, 50, '#d8b88a', 0.4]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'earth'], 0.05, c0);
          if (t > c0 && t < c0 + 1.3) for (const p of emit(t, 60, 0.6, (i, age, ts) => { const y = 44 + rand(i, 5) * 60, f = lerp(60, 205, seg(ts, c0, c0 + 1.2)) - Math.pow((y - 74) / 30, 2) * 8; return { x: f - age * 6, y: y - 3 - age * 8, age, i }; })) K.puff(c, p.x, p.y, 1.5 + p.age * 3, p.i % 2 ? '#8a7a68' : '#6a5a4a', (1 - p.age) * 0.9);
        },
      };
    } });

  // ---- Fire curtain arc: walk through it and you burn ----
  add({ id: 'sh-curtain', group: 'shield', q: ['shield', 'fire'], cast: 'place', dur: 4, ground: 'plaza', seed: 46,
    line: 'An arc of fire rises around you. Enemies can walk through it, but crossing it sets them alight.',
    frame(t, K) {
      const D = 4, c0 = 0.55, me = caster(t, 'fire', c0, 0.8), L = K.life(t, D);
      const up = easeOut(seg(t, c0, c0 + 0.3)) * (1 - seg(t, D - 0.4, D));
      const arc = K.arcPts(ME.x, ME.y + 2, 26, -1.1, 1.1, 22);
      const tx = 78;   // where the curtain is on the goblin's line
      const gx = 176 - (t - 0.3) * 50, crossed = gx < tx + 2, back = crossed ? Math.min(1, (tx + 2 - gx) / 10) : 0;
      const g1x = crossed ? tx - 6 + K.kb(t, 0.3 + (176 - tx - 2) / 50 + 0.2, 26, 0.9) : gx;
      const tc = 0.3 + (176 - tx - 2) / 50;
      const g1 = K.gob({ id: 'g1', x: g1x, y: 70, face: t > tc + 0.2 ? 0 : Math.PI, seed: 1, ...K.walk(t, 1.2), burn: seg(t, tc, tc + 0.2) * (1 - seg(t, D - 0.4, D)), alpha: L });
      const g2 = K.gob({ id: 'g2', x: Math.max(150 - (t - 0.3) * 30, 102), y: 92, face: Math.PI + Math.sin(t * 2) * 0.3, seed: 2, ...K.walk(t, t > 2 ? 0.2 : 1) });
      const stand = []; K.fireCurtain(stand, arc, 18, t, () => up);
      return {
        actors: [me, g1, g2], stand,
        under(c) { if (up > 0.05) for (let i = 0; i < arc.length; i++) X.ellipse(c, arc[i][0], arc[i][1], 3, 1.2, 'rgba(26,16,14,0.6)'); },
        lights: [...[0, 0.33, 0.66, 1].map((f) => { const p = arc[Math.round(f * (arc.length - 1))]; return [p[0], p[1], 40, '#ff7020', 0.6 * up]; }), [g1.x, g1.y - 6, 36, '#ff7020', 0.6 * g1.burn]],
        fx(c, A) { K.prep(c, me, A, t, ['shield', 'fire'], 0.05, c0); K.burning(c, A, g1, t, g1.burn); if (g1.burn > 0.5) K.pip(c, A, g1, 'fire', t); for (const p of emit(t, 20, 1, (i, age) => { const q = arc[i % arc.length]; return { x: q[0] + Math.sin(age * 5 + i) * 2, y: q[1] - 12 - age * 18, age }; })) if (up > 0.5) X.px(c, p.x, p.y, p.age < 0.5 ? EL.fire[1] : EL.fire[3]); },
      };
    } });

  // ---- Ward: a reflecting bubble; arrows bounce back at the archer ----
  // (pass 3: no bubble. The ward is a shimmering golden skin hugging the caster's own
  // silhouette; arrows glance off it and fly back, the skin flares where each one lands,
  // and it thins with every shot it turns until it flakes away.)
  add({ id: 'sh-ward', still: 2.05, group: 'shield', q: ['shield'], cast: 'self', dur: 4, ground: 'path', seed: 47,
    frame(t, K) {
      const D = 4, c0 = 0.55, shots = [1.15, 1.85, 2.55];
      const left = 3 - shots.filter((h) => t > h + 0.3).length;
      const up = easeOut(seg(t, c0, c0 + 0.25)) * (left > 0 ? 1 : 1 - seg(t, 2.95, 3.2));
      const flare = shots.reduce((m, h) => Math.max(m, t > h + 0.28 && t < h + 0.5 ? 1 - (t - h - 0.28) / 0.22 : 0), 0);
      const me = caster(t, 'shield', c0, 0.8, { face: 0.15 });
      me.skin = { k: up * (0.55 + 0.45 * left / 3), col: EL.shield[2], col2: EL.shield[1], hi: '#fffbe0', hit: flare };
      const drawA = shots.reduce((m, h) => Math.max(m, t > h - 0.6 && t < h ? seg(t, h - 0.6, h - 0.1) : 0), 0);
      const hitBack = shots.map((h) => t - h - 0.55).filter((e) => e > 0 && e < 0.4)[0];
      const ar = K.archer({ id: 'a1', x: 158, y: 70, face: Math.PI, seed: 4, draw: drawA, flash: hitBack != null ? 1 - hitBack / 0.4 : 0, x2: 0 });
      ar.x += 3 * shots.filter((h) => t > h + 0.55).length * (1 - seg(t, D - 0.4, D));
      const g1 = K.gob({ id: 'g1', x: 140, y: 94, face: Math.PI - 0.4, seed: 2 });
      return {
        actors: [me, ar, g1],
        lights: up > 0.05 ? [[ME.x, ME.y - 8, 30, '#ffc83a', 0.4 * up + 0.4 * flare]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield'], 0.05, c0);
          const ch = A.me.chest, hitP = [ch[0] + 6, ch[1] - 1];
          // the skin forms: gold sparks gather onto the body from all round
          if (t > c0 && t < c0 + 0.3) { const e = (t - c0) / 0.3; for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = 16 * (1 - e); X.px(c, ch[0] + Math.cos(a) * r, ch[1] - 2 + Math.sin(a) * r * 1.2, i % 2 ? EL.shield[0] : EL.shield[1]); } }
          for (const h of shots) {
            const e1 = (t - h) / 0.28, src = A.a1.bowTip;
            if (!src) continue;
            if (e1 >= 0 && e1 < 1) K.arrow(c, lerp(src[0], hitP[0], e1), lerp(src[1], hitP[1], e1), Math.atan2(hitP[1] - src[1], hitP[0] - src[0]));
            const e2 = (t - h - 0.28) / 0.25;
            if (e2 >= 0 && e2 < 1) { const dst = A.a1.chest; K.arrow(c, lerp(hitP[0], dst[0], e2), lerp(hitP[1], dst[1], e2), Math.atan2(dst[1] - hitP[1], dst[0] - hitP[0])); }
            // the flare where it glances off: a bright star and a ripple running over the skin
            if (e2 >= 0 && e2 < 0.4) { const q = e2 / 0.4; X.rect(c, hitP[0] - 1, hitP[1] - 1, 3, 3, '#ffffff'); if (q < 0.5) { X.px(c, hitP[0] - 3, hitP[1], '#ffffff'); X.px(c, hitP[0] + 3, hitP[1], '#ffffff'); X.px(c, hitP[0], hitP[1] - 3, '#ffffff'); X.px(c, hitP[0], hitP[1] + 3, '#ffffff'); } X.ring(c, hitP[0] - 2, hitP[1], 2 + q * 8, 2 + q * 11, EL.shield[1], 1 - q); }
          }
          // spent: the skin flakes off in gold scraps that drift down
          if (left === 0) { const e = (t - 2.95) / 0.6; if (e > 0 && e < 1) for (let i = 0; i < 16; i++) { const x = ch[0] + (rand(i, 1) - 0.5) * 12 + Math.sin(e * 6 + i) * 2, y = ch[1] - 10 + rand(i, 2) * 22 + e * e * 10; if (rand(i, 3) < e) continue; X.px(c, x, y, i % 2 ? EL.shield[1] : EL.shield[0]); } }
        },
      };
    } });

  // ---- Stone armour coated in fire (v3): fewer, larger plates sit flush on the body ----
  // (pass 4: v2 "reads a little weird". Now four big plates follow the silhouette (two
  // pauldrons, a breastplate, a skirt plate) and the robe under them greys to stone as they
  // lock on, so the armour reads as one stone shell with a clear dark outline. The fire coat
  // is subtler: glowing seams in the stone and small licks off the shoulders.)
  // Stone plates fly up off the ground and lock onto the caster's shoulders, chest, belt
  // and forearms, so the silhouette turns visibly bulkier. Then fire coats them: cracks
  // glow orange and flames lick off the plate edges. The brute's punch lands on the
  // armour; the flames jump onto its fist and it reels away burning.
  add({ id: 'sh-armour-fire-v3', still: 2.2, group: 'shield', q: ['shield', 'earth', 'fire'], cast: 'self', dur: 4.4, ground: 'plaza', seed: 48,
    line: 'Stone armour, coated in fire. It resists physical hits and fire, and whoever hits you in melee catches fire.',
    frame(t, K) {
      const D = 4.4, c0 = 0.55, L = K.life(t, D), me = caster(t, 'fire', c0, 0.8, { x: 72, face: 0.85 });
      const off = 1 - seg(t, D - 0.4, D - 0.05);
      const coat = seg(t, c0 + 0.75, c0 + 1.0) * off;
      const hit = 2.45, pu = punchAt(t, [hit]);
      const burn = seg(t, hit, hit + 0.2) * (1 - seg(t, D - 0.35, D));
      const bx = t < hit ? Math.max(176 - (t - 0.3) * 40, 94) : 94 + K.kb(t, hit + 0.05, 26, 0.7);
      const br = K.brute({ id: 'b1', x: bx, y: 74, face: Math.PI + (t > hit + 0.5 ? 0.5 : 0), seed: 4, ...K.walk(t, t < hit - 0.45 && bx > 94.5 ? 0.9 : t > hit + 0.5 ? 0.7 : 0), punch: pu, burn, flash: K.flash(t, hit) * 0.6, flashCol: EL.fire[0], alpha: L });
      // the caster's local frame (same projection as the rig): f forward, r right, u up
      const cs = Math.cos(me.face), sn = Math.sin(me.face);
      const P = (f, r, u) => [me.x + f * cs - r * sn, me.y + (f * sn + r * cs) * FY - u * CU];
      const CU = PB.CU;
      // plates: [f, r, u, half-width, half-height, kind]; drawn back to front
      const plates = [
        [0.4, -4.6, 11.4, 4.4, 3.0, 'pauldron'], [2.6, 0, 8.4, 4.6, 4.2, 'chest'], [2.0, 0, 4.0, 5.4, 2.6, 'belt'], [0.4, 4.6, 11.4, 4.4, 3.0, 'pauldron'],
      ].map((p, i) => ({ f: p[0], r: p[1], u: p[2], hw: p[3], hh: p[4], kind: p[5], i, at: c0 + 0.08 + i * 0.12, depth: p[0] * sn + p[1] * cs }))
        .sort((a, b) => a.depth - b.depth);
      // the robe under the plates turns to stone as they lock on, so plates and body read as one shell
      const shell = seg(t, c0 + 0.2, c0 + 0.7) * off; if (shell > 0.02) { me.tint = '#5a544e'; me.tintK = 0.4 * shell; }
      const STN = ['#b8ae9e', '#7e7468', '#5a524a', '#3e3833', '#1e1a16'];
      const plateShape = (q, x, y) => { const pts = []; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, j = 0.92 + rand(q.i, k, 48) * 0.14; pts.push([x + Math.cos(a) * q.hw * j, y + Math.sin(a) * q.hh * j]); } return pts; };
      const where = (q) => {
        // each plate flies up from a stone lying at the caster's feet and snaps into place
        const k = easeOut(seg(t, q.at, q.at + 0.3)), dest = P(q.f, q.r, q.u), src = [me.x + q.r * 2.4 + (q.f - 1) * 3, me.y + 6 + q.r * 0.4];
        return { k, x: lerp(src[0], dest[0], k), y: lerp(src[1], dest[1], k) - Math.sin(k * Math.PI) * 10, dest };
      };
      const stand = [];
      if (off > 0.02) stand.push([me.y + 0.3, (c, E) => {
        for (const q of plates) {
          const w = where(q); if (t < q.at - 0.25) continue;
          if (t < q.at) { K.rock(c, w.x, w.y, q.hw * 0.7, q.i + 60); continue; }   // lying on the ground, about to lift
          const pts = plateShape(q, w.x, w.y);
          E.op((cc) => {
            X.poly(cc, pts.map(([x, y]) => [x + (x - w.x) * 0.3 + 0.4, y + (y - w.y) * 0.3 + 0.6]), '#140e0a');
            X.poly(cc, pts, STN[2]);
            X.poly(cc, plateShape(q, w.x - q.hw * 0.25, w.y - q.hh * 0.3).map(([x, y]) => [lerp(w.x - q.hw * 0.25, x, 0.62), lerp(w.y - q.hh * 0.3, y, 0.62)]), STN[1]);
            X.px(cc, w.x - q.hw * 0.5, w.y - q.hh * 0.55, STN[0]);
            X.line(cc, w.x - q.hw * 0.6, w.y + q.hh * 0.7, w.x + q.hw * 0.7, w.y + q.hh * 0.6, STN[3]);
            if (q.kind === 'pauldron') X.line(cc, w.x - q.hw * 0.8, w.y + q.hh * 0.1, w.x + q.hw * 0.8, w.y + q.hh * 0.1, STN[3]);
          });
          // the fire coat: glowing cracks across each plate (emissive)
          if (coat > 0.05) E.em((cc) => {
            const glow = coat * (0.75 + 0.25 * Math.sin(t * 9 + q.i * 2));
            const c1 = glow > 0.6 ? EL.fire[2] : EL.fire[3], c2 = glow > 0.6 ? EL.fire[3] : EL.fire[4];
            // one thin glowing seam per plate, with a single hot point in it
            X.lines(cc, [[w.x - q.hw * 0.45, w.y + q.hh * 0.05], [w.x, w.y + q.hh * 0.3], [w.x + q.hw * 0.4, w.y + q.hh * 0.05]], c2);
            X.px(cc, w.x, w.y + q.hh * 0.3, c1);
          });
        }
      }]);
      return {
        actors: [me, br], stand, shake: t > hit && t < hit + 0.15 ? 1.6 : 0,
        lights: [[me.x, me.y - 14, 30, '#ff7020', 0.3 * coat], [br.x, br.y - 10, 50, '#ff7020', 0.6 * burn], ...(t > hit && t < hit + 0.3 ? [[me.x + 12, me.y - 12, 70, '#ffb060', 0.9]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['shield', 'earth', 'fire'], 0.05, c0);
          // each plate lands with a tiny puff of grit
          for (const q of plates) { const e = t - (q.at + 0.3); if (e > 0 && e < 0.25) { const d = P(q.f, q.r, q.u); for (let k = 0; k < 4; k++) X.px(c, d[0] + (rand(k, q.i) - 0.5) * 8 * (1 + e * 4), d[1] + e * 10, '#9a8e80'); } }
          // the fire takes: a flash running over the plates, then flames licking off their top edges
          if (t > c0 + 0.75 && t < c0 + 0.95) { const e = (t - c0 - 0.75) / 0.2; X.glow(c, me.x + 1, me.y - 10 - e * 6, 10, EL.fire[1], 0.8 * (1 - e)); }
          if (coat > 0.05) for (const q of plates) {
            if (q.kind !== 'pauldron') continue;   // small licks off the shoulders only
            const d = P(q.f, q.r, q.u);
            K.tongue(c, d[0], d[1] - q.hh * 0.7, 1.1, (1.5 + 1.5 * (0.5 + 0.5 * Math.sin(t * 13 + q.i * 2))) * coat, Math.sin(t * 7 + q.i) * 1);
          }
          if (coat > 0.05) for (const p of emit(t, 3, 0.8, (i, age) => ({ x: me.x + (rand(i, 7) - 0.5) * 14 + Math.sin(age * 6 + i) * 2, y: me.y - 8 - rand(i, 8) * 8 - age * 18, age }))) X.px(c, p.x, p.y, p.age < 0.4 ? EL.fire[1] : EL.fire[3]);
          // the punch lands on the armour: sparks and a gout of flame onto the brute's fist
          if (t > hit && t < hit + 0.45) { const e = (t - hit) / 0.45, p = [me.x + 8, me.y - 11]; if (e < 0.15) X.ellipse(c, p[0], p[1], 5, 5, '#fff4c0'); for (let k = 0; k < 16; k++) { const a = -0.9 + rand(k, 3) * 1.8, d = e * (16 + rand(k, 4) * 14); X.px(c, p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.7 - e * 4, K.fireCol(e * 0.8 + rand(k, 5) * 0.2)); } if (e < 0.5) K.tongue(c, p[0] + 4, p[1] + 2, 2.4, 9 * (1 - e * 2), 3); }
          K.burning(c, A, br, t, burn);
        },
      };
    } });
})();
