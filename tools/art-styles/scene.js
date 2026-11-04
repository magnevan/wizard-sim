/* Art Style Explorer: the canonical scene.
 *
 * One combat moment, described as data and computed as a PURE FUNCTION OF TIME:
 *   AS.scene(t, chaos) -> everything that is on screen at time t (0..6 s loop).
 * Styles only decide how to draw that data, so the composition is identical in
 * every card and the styles stay comparable.
 *
 * Canvas is 640 x 400 logical units, origin top-left, +y down, angles in radians.
 *
 * The moment:
 *   P1 (red) holds an arcane beam on a brute while sheltering in a shield ward.
 *   P2 (blue) wets three goblins standing in a puddle, then frost-sprays them;
 *   puddle and goblins freeze, then shatter, and fresh goblins walk in.
 *   An archer keeps shooting arrows that bounce off the ward.
 *   An imp runs laps through a patch of burning grass.
 */
(function () {
  const W = 640, H = 400, LOOP = 6, TAU = Math.PI * 2;

  // ---------- math ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const mod = (v, m) => ((v % m) + m) % m;
  const ease = {
    in: (p) => p * p,
    out: (p) => 1 - (1 - p) * (1 - p),
    inOut: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    back: (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  };
  function rand(...s) {
    let h = 2166136261;
    for (const v of s) { h ^= Math.floor(v * 1000) | 0; h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  function mix(h1, h2, p) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = (s) => Math.round(lerp(a >> s & 255, b >> s & 255, clamp(p)));
    return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
  }
  // Chaos 0..1 -> particle density multiplier (0.5 is the "designed" density).
  const density = (chaos) => (chaos <= 0.5 ? lerp(0.3, 1, chaos * 2) : lerp(1, 3.4, (chaos - 0.5) * 2));

  // Continuous emitter: particles alive at t, spawned at an even rate. Seeds repeat
  // every loop, so periodic emitters loop seamlessly. fn(seedIndex, age01, spawnTime).
  function emit(t, o, fn) {
    const n = Math.max(1, Math.round(LOOP * o.rate)), dt = LOOP / n, out = [];
    const k0 = Math.ceil((t - o.life) / dt), k1 = Math.floor(t / dt);
    for (let k = k0; k <= k1; k++) {
      const ts = k * dt;
      if (o.from != null && (ts < o.from || ts > o.to)) continue;
      const age = (t - ts) / o.life;
      if (age < 0 || age >= 1) continue;
      const p = fn(mod(k, n), age, ts);
      if (p) out.push(p);
    }
    return out;
  }
  // Age (0..1) of a one-off event at t0 lasting `life`, wrapping around the loop; -1 if not alive.
  function since(t, t0, life) { const d = mod(t - t0, LOOP); return d < life ? d / life : -1; }

  // ---------- layout ----------
  const POS = {
    p1: [118, 272], p2: [106, 126],
    gob: [[262, 132], [308, 160], [352, 128]],
    brute: [458, 296],
    archer: [580, 182],
    fire: [548, 314, 76, 30],
    puddle: [306, 146, 86, 36],
    ward: [120, 252, 42],
  };
  const SHOTS = [0.9, 2.9, 4.9], FLIGHT = 0.7;
  const BEAM_ON = [0.6, 4.6];
  const SHATTER = 5.4;

  function actor(id, kind, team, x, y, face, s = 1) {
    return { id, kind, team, x, y, face, s, bob: 0, wet: 0, frozen: 0, burning: 0, hit: 0, alpha: 1, crack: 0, hp: 1, draw: 0, element: null, casting: 0 };
  }
  // Where a wizard's staff orb is (spells come out of it).
  function staffTip(a) { return [a.x + 14 * a.face * a.s, a.y + (-47 + a.bob) * a.s]; }
  function impPos(t) {
    const th = TAU * t / 3;
    return [POS.fire[0] + 54 * Math.cos(th), POS.fire[1] + 2 + 14 * Math.sin(th), -Math.sin(th) >= 0 ? 1 : -1];
  }
  function brutePos(t) {
    if (t < 0.8) return lerp(458, 442, ease.inOut(t / 0.8));
    if (t < 4.6) return lerp(442, 468, ease.out(seg(t, 0.8, 4.6)));
    return lerp(468, 458, ease.inOut(seg(t, 4.6, 6)));
  }
  function beamTicks(D) {
    const iv = 0.48 / Math.sqrt(D), out = [];
    for (let k = 0, tt = 1.0; tt < BEAM_ON[1]; k++, tt += iv) out.push([tt, k]);
    return out;
  }

  function scene(t, chaos = 0.5) {
    t = mod(t, LOOP);
    const D = density(chaos);
    const S = { t, D, chaos, W, H, LOOP };

    // ---- players ----
    const p1 = actor('p1', 'wizard', 'p1', POS.p1[0], POS.p1[1], 1);
    p1.bob = Math.sin(t * TAU * 1.5) * 1.2;
    const beamOn = seg(t, BEAM_ON[0], BEAM_ON[0] + 0.2) * (1 - seg(t, BEAM_ON[1], BEAM_ON[1] + 0.2));
    p1.casting = beamOn; p1.element = 'arcane'; p1.hp = 0.82;
    const p2 = actor('p2', 'wizard', 'p2', POS.p2[0], POS.p2[1], 1);
    p2.bob = Math.sin(t * TAU * 1.5 + 1.7) * 1.2;
    const water = seg(t, 0.25, 0.4) * (1 - seg(t, 1.0, 1.15));
    const cold = seg(t, 1.7, 1.85) * (1 - seg(t, 3.8, 3.95));
    p2.casting = Math.max(water, cold); p2.element = t < 1.4 ? 'water' : 'cold'; p2.hp = 0.64;

    // ---- goblins in the puddle ----
    const goblins = POS.gob.map(([gx, gy], i) => {
      const a = actor('g' + i, 'goblin', 'enemy', gx, gy, -1);
      const fStart = 2.05 + i * 0.38;
      a.frozen = t < SHATTER ? ease.out(seg(t, fStart, fStart + 0.45)) : 0;
      a.wet = t < SHATTER ? seg(t, 0.45 + i * 0.12, 0.8 + i * 0.12) : 0;
      const ta = t > fStart + 0.15 && t < SHATTER ? fStart + 0.15 : t;
      a.bob = -Math.abs(Math.sin(ta * TAU * 2 + i * 1.3)) * 2.5;
      a.x += Math.sin(ta * TAU / 3 + i * 2) * 4;
      a.crack = t < SHATTER ? seg(t, 4.95, SHATTER) : 0;
      a.hit = since(t, fStart + 0.4, 0.25) >= 0 ? 1 - since(t, fStart + 0.4, 0.25) : 0;
      a.hp = t < SHATTER ? 1 : 1;
      if (t >= SHATTER) { const p = seg(t, 5.55, 6); a.alpha = p; a.x += (1 - ease.out(p)) * 50; }
      a.fStart = fStart;
      return a;
    });

    // ---- brute ----
    const brute = actor('brute', 'brute', 'enemy', brutePos(t), POS.brute[1], -1);
    brute.bob = -Math.abs(Math.sin(t * TAU)) * 3;
    const ticks = beamTicks(D);
    let flash = 0;
    for (const [tt] of ticks) { const g = since(t, tt, 0.12); if (g >= 0) flash = Math.max(flash, 1 - g); }
    brute.hit = flash;
    brute.hp = t < 4.6 ? lerp(0.92, 0.46, seg(t, 0.8, 4.6)) : lerp(0.46, 0.92, seg(t, 4.6, 6));
    brute.x += beamOn * Math.sin(t * 60) * 0.8;
    // Burn from the beam's Fire payload: catches after a second of beam, fades after it stops.
    brute.burning = seg(t, 1.6, 2.0) * (1 - seg(t, 5.0, 5.8));

    // ---- archer ----
    const archer = actor('archer', 'archer', 'enemy', POS.archer[0], POS.archer[1], -1);
    archer.bob = Math.sin(t * TAU) * 0.8;
    for (const ts of SHOTS) { const d = mod(t - ts, LOOP); if (d > LOOP - 0.55) archer.draw = ease.inOut(1 - (LOOP - d) / 0.55); }

    // ---- imp ----
    const [ix, iy, iface] = impPos(t);
    const imp = actor('imp', 'imp', 'enemy', ix, iy, iface);
    imp.bob = -Math.abs(Math.sin(t * TAU * 4)) * 3; imp.burning = 1; imp.hp = 0.55;

    S.players = [p1, p2];
    S.goblins = goblins; S.brute = brute; S.archer = archer; S.imp = imp;
    S.actors = [p1, p2, ...goblins, brute, archer, imp].sort((a, b) => a.y - b.y);

    // ---- ground features ----
    const [px, py, prx, pry] = POS.puddle;
    S.puddle = {
      x: px, y: py, rx: prx, ry: pry,
      front: t < SHATTER ? ease.inOut(seg(t, 1.9, 3.5)) : 1,
      ice: t < SHATTER ? (t >= 1.9 ? 1 : 0) : 1 - seg(t, SHATTER, 5.9),
      crack: t < SHATTER ? seg(t, 4.95, SHATTER) : 0,
      ripple: t,
    };
    const [fx, fy, frx, fry] = POS.fire;
    S.fire = { x: fx, y: fy, rx: frx, ry: fry };
    S.ward = { x: POS.ward[0], y: POS.ward[1], r: POS.ward[2], pulse: 0, hitAng: 0 };

    // ---- beam ----
    S.beam = null; S.beamSparks = [];
    const tip1 = staffTip(p1);
    if (beamOn > 0) {
      const to = [brute.x - 22, brute.y - 34 + brute.bob];
      // Proposal C payload test: the arcane beam carries Fire, so the brute catches fire.
      S.beam = { x1: tip1[0], y1: tip1[1], x2: to[0], y2: to[1], on: beamOn, el: 'arcane', payload: ['fire'] };
      const ba = Math.atan2(to[1] - tip1[1], to[0] - tip1[0]);
      S.beamSparks = emit(t, { rate: 34 * D, life: 0.38, from: BEAM_ON[0] + 0.1, to: BEAM_ON[1], seed: 11 }, (i, age) => {
        const a = ba + Math.PI + (rand(11, i, 1) - 0.5) * 2.6, sp = 30 + rand(11, i, 2) * 60;
        return { x: to[0] + Math.cos(a) * sp * age, y: to[1] + Math.sin(a) * sp * age + age * age * 18, age, a, r: rand(11, i, 3) };
      });
    }

    // ---- sprays from P2 ----
    const tip2 = staffTip(p2);
    const sang = Math.atan2(py + 2 - tip2[1], px - 10 - tip2[0]);
    const spray = (kind, rate, from, to, seed, len) => emit(t, { rate: rate * D, life: 0.55, from, to, seed }, (i, age) => {
      const r1 = rand(seed, i, 1), r2 = rand(seed, i, 2), r3 = rand(seed, i, 3);
      const a = sang + (r1 - 0.5) * 0.62 * (0.5 + 0.5 * age);
      const d = ease.out(age) * len * (0.72 + 0.4 * r2);
      return { x: tip2[0] + Math.cos(a) * d, y: tip2[1] + Math.sin(a) * d + age * 6, age, size: lerp(2, 7, age) * (0.7 + 0.6 * r3), r: r1, rot: r3 * TAU + age * 4, kind };
    });
    S.spray = { x: tip2[0], y: tip2[1], ang: sang, spread: 0.31, len: 230, water, cold,
      parts: [...spray('water', 55, 0.25, 1.02, 21, 220), ...spray('cold', 75, 1.7, 3.82, 22, 240)] };

    // ---- fire patch ----
    S.tongues = [];
    const nT = Math.round(9 + 5 * Math.min(D, 2));
    for (let j = 0; j < nT; j++) {
      const r = Math.sqrt(rand(31, j, 1)) * 0.85, th = rand(31, j, 2) * TAU;
      S.tongues.push({ x: fx + Math.cos(th) * frx * r, y: fy + Math.sin(th) * fry * r,
        h: 16 + 9 * rand(31, j, 3) + 6 * Math.sin(t * TAU * 2 + j * 1.7), w: 7 + 4 * rand(31, j, 4), sway: Math.sin(t * TAU + j) * 3, r: rand(31, j, 5) });
    }
    S.tongues.sort((a, b) => a.y - b.y);
    S.flames = emit(t, { rate: 36 * D, life: 0.7, seed: 32 }, (i, age) => {
      const r = Math.sqrt(rand(32, i, 1)) * 0.9, th = rand(32, i, 2) * TAU, k = rand(32, i, 3);
      return { x: fx + Math.cos(th) * frx * r + Math.sin(age * 5 + k * 6) * 3, y: fy + Math.sin(th) * fry * r - age * (24 + 22 * k),
        age, size: (1 - age) * (5 + 6 * k) * Math.min(1, age * 6), r: k };
    });
    S.embers = emit(t, { rate: 12 * D, life: 1.4, seed: 33 }, (i, age) => {
      const r = Math.sqrt(rand(33, i, 1)), th = rand(33, i, 2) * TAU, k = rand(33, i, 3);
      return { x: fx + Math.cos(th) * frx * r * 0.8 + Math.sin(age * 7 + k * 9) * 8 + age * 14, y: fy + Math.sin(th) * fry * r - age * (50 + 40 * k), age, r: k };
    });
    S.smoke = emit(t, { rate: 4.5 * D, life: 2.2, seed: 34 }, (i, age) => {
      const r = Math.sqrt(rand(34, i, 1)) * 0.7, th = rand(34, i, 2) * TAU, k = rand(34, i, 3);
      return { x: fx + Math.cos(th) * frx * r + age * 26, y: fy - 18 + Math.sin(th) * fry * r - age * (60 + 20 * k), age, size: 8 + age * 18 + k * 4, r: k };
    });
    S.impFlames = emit(t, { rate: 16 * D, life: 0.45, seed: 35 }, (i, age, ts) => {
      const [x, y] = impPos(ts), k = rand(35, i, 1);
      return { x: x + (k - 0.5) * 12, y: y - 12 - age * 22, age, size: (1 - age) * (4 + 4 * rand(35, i, 2)) * Math.min(1, age * 5), r: k };
    });

    // ---- arrows and the ward ----
    const W0 = S.ward;
    const bow = [POS.archer[0] - 12, POS.archer[1] - 20];
    const toBow = Math.atan2(bow[1] - W0.y, bow[0] - W0.x);
    const hit = [W0.x + Math.cos(toBow) * W0.r, W0.y + Math.sin(toBow) * W0.r];
    W0.hitAng = toBow; W0.hitX = hit[0]; W0.hitY = hit[1];
    S.arrows = []; S.wardSparks = [];
    for (const [k, ts] of SHOTS.entries()) {
      const d = mod(t - ts, LOOP);
      const at = (p) => [lerp(bow[0], hit[0], p), lerp(bow[1], hit[1], p) - Math.sin(p * Math.PI) * 22];
      if (d < FLIGHT) {
        const p = d / FLIGHT, a = at(p), b = at(Math.min(1, p + 0.02));
        S.arrows.push({ x: a[0], y: a[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]), alpha: 1 });
      } else if (d < FLIGHT + 0.5) {
        const q = (d - FLIGHT) / 0.5;
        S.arrows.push({ x: hit[0] + q * 34, y: hit[1] - Math.sin(q * Math.PI) * 26 + q * 26, ang: Math.PI + 0.4 + q * 7, alpha: 1 - q * q });
      }
      const g = since(t, ts + FLIGHT, 0.55);
      if (g >= 0) {
        W0.pulse = Math.max(W0.pulse, 1 - g);
        const n = Math.round(12 * D);
        for (let i = 0; i < n; i++) {
          const a = toBow + (rand(41, k, i) - 0.5) * 2.4, sp = 26 + rand(42, k, i) * 40;
          S.wardSparks.push({ x: hit[0] + Math.cos(a) * sp * ease.out(g), y: hit[1] + Math.sin(a) * sp * ease.out(g), age: g, a, r: rand(43, k, i) });
        }
      }
    }

    // ---- shatter shards + frost mist ----
    S.shards = [];
    const sg = since(t, SHATTER, 0.75);
    if (sg >= 0) {
      for (const [gi, a] of goblins.entries()) {
        const n = Math.round(9 * D);
        for (let i = 0; i < n; i++) {
          const ang = -Math.PI / 2 + (rand(51, gi, i) - 0.5) * 3.6, sp = 30 + rand(52, gi, i) * 60;
          S.shards.push({ x: POS.gob[gi][0] + Math.cos(ang) * sp * ease.out(sg), y: POS.gob[gi][1] - 14 + Math.sin(ang) * sp * ease.out(sg) + sg * sg * 50,
            age: sg, rot: rand(53, gi, i) * TAU + sg * 9 * (rand(54, gi, i) - 0.5), size: 3 + rand(55, gi, i) * 5, r: rand(56, gi, i) });
        }
      }
    }
    S.mist = emit(t, { rate: 7 * D, life: 1.5, from: 2.6, to: 5.2, seed: 61 }, (i, age) => {
      const th = rand(61, i, 1) * TAU, r = Math.sqrt(rand(61, i, 2));
      return { x: px + Math.cos(th) * prx * r * 0.9 + age * 10, y: py + Math.sin(th) * pry * r * 0.9 - age * 14, age, size: 8 + 14 * age, r: rand(61, i, 3) };
    });
    // Water drips off wet goblins.
    S.drips = [];
    for (const g of goblins) {
      if (g.wet < 0.5 || g.frozen > 0.5) continue;
      for (let i = 0; i < 2; i++) {
        const age = mod(t * 1.5 + i * 0.5 + rand(71, g.id.length, i), 1);
        S.drips.push({ x: g.x + (i ? 7 : -8), y: g.y - 20 + g.bob + age * 16, age });
      }
    }

    // ---- floating numbers ----
    const nums = [];
    const add = (te, x, y, text, kind, big) => {
      const g = since(t, te, 1.0);
      if (g < 0) return;
      nums.push({ x, y: y - ease.out(g) * 24, text, kind, age: g, big: !!big, pop: g < 0.12 ? lerp(1.5, 1, g / 0.12) : 1, alpha: 1 - seg(g, 0.72, 1) });
    };
    for (const [tt, k] of ticks) {
      const crit = k % 5 === 3, v = 13 + Math.floor(rand(81, k) * 9);
      add(tt, brutePos(tt) - 8 + (rand(82, k) - 0.5) * 30, POS.brute[1] - 78, crit ? (v * 2) + '!' : '' + v, crit ? 'crit' : 'arcane', crit);
    }
    const biv = 1 / Math.sqrt(D), nb = Math.max(1, Math.round(LOOP / biv));
    for (let k = 0; k < nb; k++) { const tt = k * LOOP / nb + 0.3; const [x, y] = impPos(tt); add(tt, x, y - 32, '' + (4 + Math.floor(rand(83, k) * 3)), 'fire'); }
    add(0.95, POS.gob[1][0], POS.gob[1][1] - 44, 'WET', 'water');
    add(3.3, POS.gob[1][0], POS.gob[1][1] - 46, 'FROZEN!', 'cold', true);
    for (let i = 0; i < 3; i++) add(SHATTER + 0.02 + i * 0.05, POS.gob[i][0], POS.gob[i][1] - 34, '' + (58 + i * 7), 'cold', true);
    for (const ts of SHOTS) add(ts + FLIGHT, hit[0] + 6, hit[1] - 18, 'BLOCK', 'shield');
    S.numbers = nums;

    // ---- HUD ----
    const typed = (times, el, clearAt) => times.filter((tt) => t >= tt && t < clearAt).map((tt) => ({ el, pop: seg(t, tt, tt + 0.16) }));
    S.hud = [
      { id: 'p1', name: 'P1', team: 'p1', hp: p1.hp, x: 10, y: 356, w: 186, h: 36, casting: beamOn > 0,
        queue: [...typed([0.05, 0.2, 0.35], 'arcane', 4.65), ...typed([0.48], 'fire', 4.65)] },
      { id: 'p2', name: 'P2', team: 'p2', hp: p2.hp, x: 204, y: 356, w: 186, h: 36, casting: water + cold > 0,
        queue: [...typed([0.02, 0.12], 'water', 1.08), ...typed([1.25, 1.4, 1.55], 'cold', 3.9)] },
    ];
    return S;
  }

  // ---------- actor parts ----------
  // Each actor is a list of parts in local units (feet at 0,0, facing right, up is -y).
  // part: { role, pts, sharp?, line? (open polyline, width w), big? (worth shading) }
  function ell(cx, cy, rx, ry, n = 18) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return pts;
  }
  const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
  const P = (role, pts, o = {}) => Object.assign({ role, pts }, o);

  function parts(a) {
    switch (a.kind) {
      case 'wizard': return [
        P('staff', [[17, 1], [14, -43]], { line: true, w: 3 }),
        P('robe', [[-15, 0], [-13, -10], [-10, -20], [-7, -27], [7, -27], [10, -20], [13, -10], [15, 0], [10, 3], [0, 4], [-10, 3]], { big: true }),
        P('trim', [[-14.5, -1], [14.5, -1], [10, 3], [0, 4], [-10, 3]]),
        P('sleeve', [[5, -25], [13, -21], [17, -15], [11, -12], [6, -17]]),
        P('hand', ell(15, -16, 3.2, 3, 10)),
        P('skin', ell(0, -32, 8, 8), { big: true }),
        P('beard', [[-7.5, -31], [7.5, -31], [6, -24], [2.5, -17], [0, -13], [-2.5, -17], [-6, -24]]),
        P('eye', ell(-2.8, -33.5, 1.5, 1.9, 8)), P('eye', ell(3.2, -33.5, 1.5, 1.9, 8)),
        P('hat', ell(0, -38, 13.5, 4.5), { big: true }),
        P('hat', [[-9, -39], [9, -39], [5.5, -47], [3, -55], [9, -61], [-1, -59.5], [-4, -51]], { sharp: true, big: true }),
        P('band', [[-8.6, -40], [8.6, -40], [7.6, -43.5], [-7.6, -43.5]], { sharp: true }),
        P('orb', ell(14, -47, 4.6, 4.6, 12)),
      ];
      case 'goblin': return [
        P('club', [[8, -10], [17, -27]], { line: true, w: 5 }),
        P('dark', ell(-5, -1.5, 4.5, 2.6, 10)), P('dark', ell(5, -1.5, 4.5, 2.6, 10)),
        P('body', ell(0, -10, 10, 10), { big: true }),
        P('belly', ell(1.5, -8, 6, 6, 12)),
        P('body', [[-7, -28], [-20, -32], [-9, -21]], { sharp: true }),
        P('body', mirror([[-7, -28], [-20, -32], [-9, -21]]), { sharp: true }),
        P('body', ell(0, -24, 9, 8), { big: true }),
        P('eyeWhite', ell(-2, -25, 2.6, 2.8, 10)), P('eyeWhite', ell(4.5, -25, 2.6, 2.8, 10)),
        P('eye', ell(-1.2, -25, 1.3, 1.6, 8)), P('eye', ell(5.4, -25, 1.3, 1.6, 8)),
        P('tooth', [[1, -20], [5, -20], [3, -17.5]], { sharp: true }),
      ];
      case 'archer': {
        const dr = a.draw;
        return [
          P('dark', ell(-5, -1.5, 4.5, 2.6, 10)), P('dark', ell(5, -1.5, 4.5, 2.6, 10)),
          P('cloth', [[-10, 0], [-9, -14], [-6, -20], [6, -20], [9, -14], [10, 0], [0, 2]], { big: true }),
          P('body', ell(0, -25, 8.5, 7.5), { big: true }),
          P('cloth', [[-10, -23], [-9, -30], [-3, -35], [2, -38], [8, -32], [10, -23], [6, -28], [-6, -28]], { sharp: true, big: true }),
          P('eyeWhite', ell(-1, -25, 2.4, 2.6, 10)), P('eyeWhite', ell(5, -25, 2.4, 2.6, 10)),
          P('eye', ell(-0.2, -25, 1.2, 1.5, 8)), P('eye', ell(5.8, -25, 1.2, 1.5, 8)),
          P('bow', [[10, -34], [15, -28], [17, -20], [15, -12], [10, -6]], { line: true, w: 2.6 }),
          P('string', [[10, -34], [10 - dr * 8, -20], [10, -6]], { line: true, w: 1 }),
          ...(dr > 0.05 ? [P('arrow', [[10 - dr * 8, -20], [26 - dr * 8, -20]], { line: true, w: 1.6 })] : []),
          P('hand', ell(16, -20, 3, 3, 8)),
        ];
      }
      case 'brute': return [
        P('dark', ell(-12, -4, 8.5, 6, 12)), P('dark', ell(12, -4, 8.5, 6, 12)),
        P('body', ell(-27, -27, 9, 15, 14)),
        P('body', ell(0, -29, 26, 24, 22), { big: true }),
        P('belly', ell(2, -23, 15, 13, 16)),
        P('body', ell(28, -27, 9, 15, 14)),
        P('body', ell(-29, -12, 8, 7, 12)), P('body', ell(30, -12, 8, 7, 12)),
        P('horn', [[-8, -58], [-21, -70], [-15, -55]], { sharp: true }),
        P('horn', mirror([[-8, -58], [-21, -70], [-15, -55]]), { sharp: true }),
        P('body', ell(1, -53, 12.5, 10.5, 16), { big: true }),
        P('eyeWhite', ell(-3, -54, 2.6, 2.4, 10)), P('eyeWhite', ell(6, -54, 2.6, 2.4, 10)),
        P('eye', ell(-2.2, -54, 1.3, 1.3, 8)), P('eye', ell(6.8, -54, 1.3, 1.3, 8)),
        P('brow', [[-7, -58.5], [0, -56.5], [2, -56.5], [10, -58.5]], { line: true, w: 2.4 }),
        P('tooth', [[-4, -47], [-2, -42], [0, -47]], { sharp: true }),
        P('tooth', [[3, -47], [5, -42], [7, -47]], { sharp: true }),
      ];
      case 'imp': return [
        P('wing', [[-3, -17], [-17, -27], [-15, -17], [-20, -12], [-6, -11]], { sharp: true }),
        P('wing', mirror([[-3, -17], [-17, -27], [-15, -17], [-20, -12], [-6, -11]]), { sharp: true }),
        P('tail', [[-2, -6], [-9, -2], [-13, -7], [-12, -11]], { line: true, w: 2 }),
        P('body', ell(0, -11, 7, 8.5, 14), { big: true }),
        P('horn', [[-5, -25], [-8, -31], [-2, -27]], { sharp: true }),
        P('horn', mirror([[-5, -25], [-8, -31], [-2, -27]]), { sharp: true }),
        P('body', ell(0, -21.5, 7, 6, 14), { big: true }),
        P('eyeWhite', ell(-1.5, -22, 2, 2.2, 8)), P('eyeWhite', ell(3.5, -22, 2, 2.2, 8)),
        P('eye', ell(-0.8, -22, 1, 1.3, 6)), P('eye', ell(4.2, -22, 1, 1.3, 6)),
      ];
    }
    return [];
  }
  // Actor body radius & height (for shadows, ice blocks, badges).
  const SIZE = { wizard: [16, 62], goblin: [13, 34], archer: [12, 38], brute: [32, 72], imp: [12, 32] };
  // Local -> world transform for an actor.
  function xf(a, extraScale = 1) {
    const s = a.s * extraScale;
    return ([x, y]) => [a.x + x * a.face * s, a.y + (y + a.bob) * s];
  }
  // Trace a part's path (world points). smooth: quadratic through midpoints.
  function path(ctx, pts, closed = true, smooth = true) {
    const n = pts.length;
    if (!closed || !smooth || n < 3) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (closed) ctx.closePath();
      return;
    }
    const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let s = m(pts[n - 1], pts[0]);
    ctx.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], e = m(p, q); ctx.quadraticCurveTo(p[0], p[1], e[0], e[1]); }
    ctx.closePath();
  }
  function partPath(ctx, part, wpts) { path(ctx, wpts, !part.line, !part.sharp); }

  // Element glyph paths (centered at x,y radius r) for HUD tokens and badges.
  function glyph(ctx, el, x, y, r) {
    ctx.beginPath();
    const star = (n, ro, ri, rot = -Math.PI / 2) => {
      for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? ri : ro; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath();
    };
    switch (el) {
      case 'fire':
        ctx.moveTo(x, y - r); ctx.bezierCurveTo(x + r * 0.2, y - r * 0.4, x + r * 0.85, y - r * 0.1, x + r * 0.7, y + r * 0.45);
        ctx.bezierCurveTo(x + r * 0.55, y + r * 0.95, x - r * 0.55, y + r * 0.95, x - r * 0.7, y + r * 0.45);
        ctx.bezierCurveTo(x - r * 0.8, y, x - r * 0.3, y - r * 0.2, x, y - r); ctx.closePath(); break;
      case 'water':
        ctx.moveTo(x, y - r); ctx.bezierCurveTo(x + r * 0.3, y - r * 0.4, x + r * 0.75, y, x + r * 0.7, y + r * 0.35);
        ctx.arc(x, y + r * 0.3, r * 0.7, 0, Math.PI); ctx.bezierCurveTo(x - r * 0.75, y, x - r * 0.3, y - r * 0.4, x, y - r); ctx.closePath(); break;
      case 'cold': star(6, r, r * 0.38); break;
      case 'arcane': star(4, r, r * 0.32); break;
      case 'shield':
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y - r * 0.6); ctx.lineTo(x + r * 0.7, y + r * 0.2);
        ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.8, x, y + r); ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.8, x - r * 0.7, y + r * 0.2);
        ctx.lineTo(x - r * 0.8, y - r * 0.6); ctx.closePath(); break;
      default: ctx.arc(x, y, r, 0, TAU);
    }
  }

  // Small cached-canvas helper shared by styles (static backgrounds, textures).
  function cached(key, w, h, scale, draw) {
    const store = cached.store || (cached.store = {});
    const k = key + '@' + w + 'x' + h + '@' + scale;
    if (store[k]) return store[k];
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const x = c.getContext('2d'); x.scale(scale, scale);
    draw(x, w, h);
    return (store[k] = c);
  }

  window.AS = {
    W, H, LOOP, TAU, POS, clamp, lerp, seg, mod, ease, rand, hexA, mix, density, emit, since,
    scene, parts, xf, path, partPath, ell, glyph, staffTip, SIZE, cached,
    styles: [],
    register(s) { this.styles.push(s); },
  };
})();
