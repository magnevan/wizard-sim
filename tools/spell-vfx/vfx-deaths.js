/* Spell VFX: goblin deaths, a trial of "one base death per enemy + an element overlay".
 *
 * What the game hands the view at a death (the death event):
 *   { archetype, element, delivery, dir, statuses: { frozen, wet, burning, stunned, chilled }, overkill, mix? }
 *   element = the form of the killing payload; delivery = how the killing hit arrived
 *   (missile | burst (nova, quake, geyser) | channel | arc | melee | wave); dir = the blow's
 *   direction on the ground; overkill 0..1+; mix = 'scald' when water and fire mixed.
 *
 * Structure:
 *   baseDeath(goblin, t, dir, motion) -> the base: impact (flash, recoil), a fall (a motion
 *     profile), a beat lying there, an exit (a cartoon poof), a mark (the dropped club).
 *   overlay[element](ctx, goblin, t, dir, statuses, A, m) draws the element's effects on top.
 *     An overlay function can also carry:
 *       .motion  parameters for the base (fall profile, fling distance, exit time and kind)
 *       .body    a patch for the rig's state (tint, char, chill, wet, outline, eyes)
 *       .ground  the lingering mark (scorch, frost, puddle, soot)
 *       .lights  coloured light
 *   bespoke[kind](...) replaces the body outright (shatter, arcane): the rig is drawn once to
 *     a pixel list (sprite()) and those pixels are animated instead.
 *   Dispatch (pick()), first match wins: frozen -> shatter; mix scald -> steam; earth + burst ->
 *     quake; earth + missile -> boulder (the 'earth' overlay); fire, cold, lightning, arcane ->
 *     their own; anything else (water, shield, life, sigil, earth by other deliveries) -> base.
 * t passed to the death functions is the time since the killing blow. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit, mod } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster;
  const W = PB.stage.W, H = PB.stage.H;

  // ---------------------------------------------------------------------------
  // sprite(): draw an actor once into an offscreen frame and keep its pixels, so a death can
  // animate the body itself (shatter into chunks, crumble to ash, peel into motes). Cached.
  let CB = null, CM = null;
  const SPR = new Map();
  const mkc = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return x; };
  function sprite(key, g, t) {
    if (SPR.has(key)) return SPR.get(key);
    if (!CB) { CB = mkc(); CM = mkc(); }
    CB.globalCompositeOperation = 'source-over'; CM.globalCompositeOperation = 'source-over';
    CB.clearRect(0, 0, W, H); CM.clearRect(0, 0, W, H); CB._fs = null; CM._fs = null;
    PB.actors.draw(CB, CM, Object.assign({}, g, { alpha: 1 }), t, 0, 0, null, null);
    const fx = Math.round(g.x), fy = Math.round(g.y - (g.z || 0));
    const x0 = clamp(fx - 28, 0, W), x1 = clamp(fx + 28, 0, W), y0 = clamp(fy - 50, 0, H), y1 = clamp(fy + 8, 0, H), w = x1 - x0, h = y1 - y0;
    const d = CB.getImageData(x0, y0, w, h).data, m = CM.getImageData(x0, y0, w, h).data, out = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4; if (d[k + 3] < 128) continue;
      out.push({ x: x0 + i, y: y0 + j, col: X.toHex(d[k], d[k + 1], d[k + 2]), em: m[k + 3] > 128, dark: d[k] + d[k + 1] + d[k + 2] < 90, i: out.length });
    }
    SPR.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Shared pieces: the cartoon poof, the dropped club, an impact star.
  const POOF = ['#f6f2fc', '#cfc8e0', '#8f88a8'];
  const SNOW = ['#ffffff', '#cdeffc', '#7ab4d8'];
  const SMOKE = ['#a8a2b4', '#6e6878', '#3e3846'];
  const SOOT = ['#6a6470', '#423c48', '#1e1a24'];
  const SPLASH = ['#e0f6ff', '#8ad0ff', '#2a78d0'];
  function poof(c, x, y, e, P = POOF, R = 11, seed = 0) {
    if (e < 0 || e > 1) return;
    if (e < 0.08) X.ellipse(c, x, y, 6 + e * 40, (6 + e * 40) * 0.8, P[0]);
    const n = 9, r = 3 + R * easeOut(e), pr = 4.4 * (1 - e * 0.65), a = 1 - seg(e, 0.5, 1);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU + rand(i, seed) * 0.4, rr = r * (0.7 + rand(i, seed, 2) * 0.45), px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.7 - e * 5;
      K.puff(c, px + 0.8, py + 1, pr, P[2], a); K.puff(c, px, py, pr * 0.85, P[1], a); if (pr > 2.2) K.puff(c, px - 0.8, py - 0.9, pr * 0.45, P[0], a);
    }
    K.puff(c, x, y - e * 4, 6.5 * (1 - e * 0.8), P[1], 1 - seg(e, 0.25, 0.65));
    K.puff(c, x - 1, y - 1 - e * 4, 4 * (1 - e * 0.8), P[0], 1 - seg(e, 0.2, 0.55));
    // cartoon sparkles thrown up and out
    if (e < 0.75) for (let i = 0; i < 4; i++) {
      const an = -Math.PI / 2 + (i - 1.5) * 0.75, d = 7 + easeOut(e) * 15, sx = x + Math.cos(an) * d, sy = y + Math.sin(an) * d * 0.8 - 2;
      X.px(c, sx, sy, '#ffffff'); if (e < 0.45) { X.px(c, sx - 1, sy, P[1]); X.px(c, sx + 1, sy, P[1]); X.px(c, sx, sy - 1, P[1]); X.px(c, sx, sy + 1, P[1]); }
    }
  }
  function club(c, x, y, side, col = '#a8743e', hi = '#e0aa6a') {
    // outlined, a shade lighter than the rig's club so it still reads lying on a dirt path
    X.line(c, x - side * 5, y + 1, x + side * 2, y + 1, '#120e1a', 2); X.line(c, x - side * 5, y, x + side * 2, y, col);
    X.rect(c, x + side * 2 - 2, y - 3, 5, 5, '#120e1a'); X.rect(c, x + side * 2 - 1, y - 2, 3, 3, col); X.px(c, x + side * 2 - 1, y - 2, hi); X.px(c, x - side * 4, y, hi);
  }
  function star(c, p, e, col = '#ffffff', R = 7) {
    if (e < 0 || e > 0.16) return;
    const k = 1 - e / 0.16, r = 3 + R * (1 - k);
    for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + 0.3; X.line(c, p[0] + Math.cos(an) * 2, p[1] + Math.sin(an) * 2, p[0] + Math.cos(an) * r, p[1] + Math.sin(an) * r, i % 2 ? col : '#ffffff'); }
    if (k > 0.5) X.rect(c, p[0] - 1, p[1] - 1, 3, 3, '#ffffff');
  }
  // a dithered fade test for marks and particles
  const keep = (x, y, a) => a >= 1 || a > X.bay(Math.round(x), Math.round(y));

  // ---------------------------------------------------------------------------
  // The base death. Motion profiles: topple (default), plank (stiff), none (stays upright),
  // fling (thrown along the blow, bounces, can flatten), slide (swept off its feet).
  function baseDeath(g, td, dir, o = {}) {
    const ov = o.overkill || 0, fall = o.fall || 'topple';
    const side = Math.abs(dir[0]) > 0.2 ? Math.sign(dir[0]) : (g.seed & 1 ? 1 : -1);
    let kb = 0, z = 0, dead = 0, sq = 0, face = g.face, exitAt = o.exitAt, rot = null;
    if (fall === 'topple') {
      kb = (5 + 8 * ov) * easeOut(seg(td, 0, 0.35));
      z = K.hop(td, 0, 3 + 4 * ov, 0.32) + K.hop(td, 0.42, 1.5, 0.16);
      dead = 0.9 * smooth(seg(td, 0.05, 0.38));
      sq = td > 0.38 && td < 0.52 ? 0.6 * (1 - seg(td, 0.38, 0.52)) : 0;
      if (exitAt == null) exitAt = 1.1;
    } else if (fall === 'plank') {
      // stiff: a wobble on the spot, a slow tilt that speeds up, a hard slam with no give
      // the rig's topple is a shear and squash (a slump), so a stiff fall rotates the body's
      // captured pixels about the feet instead (see rigid() below): rot is that angle
      const k = seg(td, 0.16, 0.62);
      rot = td < 0.16 ? 0.12 * Math.sin(td * 45) * (1 - td / 0.16) : (Math.PI / 2) * k * k * k;
      kb = 1.5 * easeOut(seg(td, 0, 0.12));
      z = K.hop(td, 0.62, 2, 0.14);
      if (exitAt == null) exitAt = 1.25;
    } else if (fall === 'none') {
      kb = 3 * easeOut(seg(td, 0, 0.2)); z = K.hop(td, 0, 2, 0.22);
      if (exitAt == null) exitAt = 0.9;
    } else if (fall === 'fling') {
      const F = o.fling || 40, T1 = o.t1 || 0.46, T2 = 0.24, T3 = T1 + T2;
      const p = td < T1 ? 0.7 * (td / T1) : td < T3 ? 0.7 + 0.24 * ((td - T1) / T2) : 0.94 + 0.06 * easeOut(seg(td, T3, T3 + 0.25));
      kb = F * p;
      z = K.hop(td, 0, o.h1 || 15, T1) + K.hop(td, T1, (o.h1 || 15) * 0.3, T2);
      dead = 0.9 * smooth(seg(td, 0.04, 0.25));
      face = g.face + Math.min(td, T3) * 13;
      if (o.flatten) { const f = seg(td, T3, T3 + 0.05); sq = 2.7 * f + (f > 0 && f < 1 ? 0.5 : 0); }
      else sq = td > T1 && td < T1 + 0.1 ? 0.6 : 0;
      if (exitAt == null) exitAt = 1.35;
    } else if (fall === 'slide') {
      const S = o.slide || 40;
      dead = 0.9 * smooth(seg(td, 0, 0.18));
      kb = S * easeOut(seg(td, 0, 1.15));
      z = K.hop(td, 0, 5, 0.3);
      face = g.face + 5 * easeOut(seg(td, 0, 1.15));
      if (exitAt == null) exitAt = 1.4;
    } else if (fall === 'bounce') {
      // bounced straight up off its feet by the ground (quake, geyser): it tumbles in the air
      // (a rigid spin of the captured pixels about the middle of the body), lands, and lies crumpled
      const T0 = 0.05, T1 = T0 + (o.air || 0.56), Hh = o.h1 || 18;
      kb = (o.drift || 2) * seg(td, 0, T1);
      if (td < T1) {
        z = K.hop(td, T0, Hh, T1 - T0);
        if (td > T0) rot = (o.spin || TAU + Math.PI / 2) * smooth(seg(td, T0, T1));
      } else {
        // the landing: a small bounce, then the rig's slump (a crumple, not a plank)
        z = K.hop(td, T1, 2.5, 0.16);
        dead = 0.9; sq = td < T1 + 0.08 ? 0.9 : td < T1 + 0.24 ? 0.35 * (1 - seg(td, T1 + 0.16, T1 + 0.24)) : 0;
      }
      if (exitAt == null) exitAt = 1.5;
    } else if (fall === 'slump') {
      // sinks where it stands in one smooth movement, no hop, no bounce, no shake
      dead = 0.9 * smooth(seg(td, o.slumpAt || 0.5, (o.slumpAt || 0.5) + 0.35));
      if (exitAt == null) exitAt = 1.2;
    }
    const x = g.x + dir[0] * kb, y = g.y + dir[1] * kb * FY;
    const gone = seg(td, exitAt + 0.04, exitAt + 0.12);
    const out = Object.assign({}, g, { x, y, z, dead, sq, face, fallSide: side, flash: K.flash(td, 0), flashCol: o.hitCol || '#ffffff', spd: 0, alpha: g.alpha * (1 - gone) });
    // where the body is (lying bodies sit off to the fall side, low), for poofs and marks
    let lie = dead / 0.9; if (rot != null) lie = fall === 'bounce' ? 0.5 : clamp(rot / (Math.PI / 2), 0, 1);
    const mid = [x + side * (rot != null ? 6 : 4) * lie, y - z - lerp(7, 3, lie) + (sq > 1 ? 1.5 : 0)];
    return { g: out, side, exitAt, gone, mid, td, fall, rot };
  }

  // ---------------------------------------------------------------------------
  // Overlays
  const ov = (fx, extra) => Object.assign(fx, extra);
  const OVERLAY = {};

  // Flames that follow the body's silhouette (fire v2): tongues rise off every sky-facing edge
  // pixel (head, ears, shoulders, arms) and short licks curl off its sides, so the fire is the
  // body burning, not a flame shape stamped over it. ed = edgesOf(the captured body).
  function edgesOf(key, px) {
    const ck = key + '#edges'; if (SPR.has(ck)) return SPR.get(ck);
    const S = new Set(px.map((p) => p.x + ',' + p.y)), has = (x, y) => S.has(x + ',' + y);
    const tops = [], sides = [];
    let top = 1e9, bot = -1e9, sx = 0;
    for (const p of px) { top = Math.min(top, p.y); bot = Math.max(bot, p.y); sx += p.x; }
    for (const p of px) {
      if (!has(p.x, p.y - 1)) tops.push({ x: p.x, y: p.y });
      else if (p.y < bot - 3 && (!has(p.x - 1, p.y) || !has(p.x + 1, p.y)) && (p.x + p.y) % 2 === 0) sides.push({ x: p.x, y: p.y, s: has(p.x - 1, p.y) ? 1 : -1 });
    }
    const out = { tops, sides, top, bot, cx: sx / px.length };
    SPR.set(ck, out);
    return out;
  }
  function silFlames(c, ed, dx, dy, k, t) {
    if (k < 0.04) return;
    const F = EL.fire, span = Math.max(1, ed.bot - ed.top);
    for (const p of ed.tops) {
      const u = (ed.bot - p.y) / span, fl = 0.72 + 0.28 * Math.sin(t * 17 + p.x * 1.9) + 0.16 * Math.sin(t * 29 + p.x * 3.3);
      const h = Math.max(1, k * (1.5 + 5.5 * u * u) * fl * (0.75 + 0.5 * rand(p.x, p.y, 5)));
      const lean = Math.sin(t * 6 + p.x * 0.7) * 1.1 + (p.x - ed.cx) * 0.12;
      for (let r = 0; r <= h; r++) {
        const q = r / h, x = p.x + dx + lean * q * q, y = p.y + dy - r;
        X.px(c, x, y, q < 0.2 ? F[1] : q < 0.5 ? F[2] : q < 0.8 ? F[3] : F[4]);
      }
      // a tongue breaking off the tip now and then
      if (k > 0.5 && u > 0.5 && (p.x + Math.floor(t * 14)) % 4 === 0) X.px(c, p.x + dx + lean, p.y + dy - h - 2 - ((Math.floor(t * 20) + p.x) & 1), F[3]);
    }
    for (const p of ed.sides) {
      const n = Math.round(k * (1 + 2 * (0.5 + 0.5 * Math.sin(t * 13 + p.y * 1.7 + p.x))));
      for (let j = 0; j <= n; j++) X.px(c, p.x + dx + p.s * (1 + j * 0.6), p.y + dy - j, j === 0 ? F[2] : F[3]);
    }
  }

  // FIRE v2: stays on its feet and burns: flames hug its silhouette (no combustion burst), it
  // chars to a black silhouette with an ember outline and blinking eyes, then crumbles from the
  // top into ash and embers.
  OVERLAY.fire = ov(function (c, g, td, dir, st, A, m) {
    const a = A[g.id], x = m.g0.x + dir[0] * 3, y = m.g0.y;
    const k = Math.min(seg(td, 0, 0.1), 1 - smooth(seg(td, 0.35, 0.95)));
    if (td < m.exitAt && k > 0.04) {
      const cap = baseDeath(m.g0, 0.3, dir, m.o).g; Object.assign(cap, OVERLAY.fire.body(cap, 0.3), { alpha: 1, flash: 0 });
      const ed = edgesOf(m.key + '#burn', sprite(m.key + '#burn', cap, m.tH + 0.3));
      silFlames(c, ed, g.x - cap.x, -(g.z || 0), k, td + 0.3);
    }
    // the last licks on the charred head and shoulders
    if (a && a.head && td > 0.6 && td < m.exitAt) { const kk = 1 - seg(td, 0.75, m.exitAt); for (let j = 0; j < 3; j++) K.tongue(c, a.head[0] - 3 + j * 3, a.head[1] - 1 + (j === 1 ? -2 : 1), 1.1, (2 + 2 * Math.sin(td * 15 + j * 2)) * kk, Math.sin(td * 7 + j)); }
    // smoke curling off the char
    for (const p of emit(td, 7, 1.3, (i, age) => ({ x: x + (rand(i, 4) - 0.5) * 6 + age * 5, y: y - 19 - age * 16, age }), 0.5, 99)) K.puff(c, p.x, p.y, 1.5 + p.age * 3.5, '#3a3644', (1 - p.age) * 0.8 * (1 - seg(td, m.exitAt + 0.6, m.exitAt + 1.2)));
  }, {
    motion: { fall: 'none', exitAt: 1.2, exit: 'crumble', club: false, hitCol: EL.fire[0] },
    body(g, td) {
      const ch = smooth(seg(td, 0.1, 0.7)), blink = ch > 0.7 && (mod(td, 0.55) < 0.07);
      return { burn: 0.7 * (1 - ch), tint: '#140e10', tintK: 0.9 * ch, outline: ch > 0.35 ? (Math.floor(td * 9) % 3 ? '#ff5a20' : '#c8302a') : null, eyeCol: ch > 0.5 ? '#ffffff' : null, eyesShut: blink, sq: 0.12 * ch };
    },
    ground(c, E, g, td, dir, st, m, fade) {
      K.scorch(c, m.g0.x + 2, m.g0.y + 1, 5 + 5 * seg(td, 0, 0.7), 0.7 * fade);
      E.em((cc) => { for (let i = 0; i < 8; i++) { const an = rand(i, 41) * TAU, r = Math.sqrt(rand(i, 42)) * 7; if (rand(i, Math.floor(td * 5), 43) < 0.5 * fade * (1 - seg(td, 1.6, 2.4))) X.px(cc, m.g0.x + 2 + Math.cos(an) * r, m.g0.y + 1 + Math.sin(an) * r * 0.45, i % 3 ? EL.fire[4] : EL.fire[3]); } });
    },
    lights: (g, td, st, m) => [[m.g0.x, m.g0.y - 8, 38, '#ff7020', 0.8 * Math.min(seg(td, 0, 0.1), 1 - seg(td, 0.35, 0.95))], [m.g0.x, m.g0.y - 4, 26, '#ff5a20', 0.35 * (1 - seg(td, m.exitAt + 0.5, m.exitAt + 1.5))]],
  });

  // COLD (chilled, not frozen): frost-stiff, it tips over like a plank, cracks on landing.
  OVERLAY.cold = ov(function (c, g, td, dir, st, A, m) {
    if (td < 0.55) K.chilled(c, A, g, td + 5, 1);
    // the slam: a crack runs across the body, ice chips jump off it
    const e = td - 0.62;
    if (e > 0 && td < m.exitAt + 0.05) {
      const p = m.mid, run = seg(e, 0, 0.08);
      const pts = [[p[0] - 6, p[1] - 1], [p[0] - 3, p[1] + 1], [p[0] - 1, p[1] - 1], [p[0] + 2, p[1] + 1], [p[0] + 5, p[1] - 1]];
      const n = Math.max(2, Math.ceil(pts.length * run));
      X.lines(c, pts.slice(0, n), '#ffffff'); if (e < 0.1) X.lines(c, pts.slice(0, n).map(([x, y]) => [x, y + 1]), '#1e5a96');
      for (let k = 0; k < 9; k++) { const an = rand(k, 51) * Math.PI + Math.PI, sp = 14 + rand(k, 52) * 22, vz = 22 + rand(k, 53) * 26, z = vz * e - 110 * e * e; if (z < -1 || e > 0.6) continue; X.px(c, p[0] + Math.cos(an) * sp * e * 0.8, p[1] + Math.sin(an) * sp * e * 0.3 - Math.max(0, z), k % 3 ? '#e0ffff' : '#ffffff'); }
      if (e < 0.35) K.gring(c, p[0], p[1] + 3, 4 + e * 30, '#e0ffff', 1 - e / 0.35, 1);
    }
  }, {
    motion: { fall: 'plank', exitAt: 1.3, exitCols: SNOW, hitCol: '#e0ffff' },
    body: () => ({ chill: 1 }),
    ground(c, E, g, td, dir, st, m, fade) {
      const k = seg(td, 0, 0.9) * fade, x = m.g0.x + m.side * 5, y = m.g0.y + 1;
      if (k > 0.02) for (let i = 0; i < 60; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.7) * 15 * k, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * FY * 0.6; if (keep(px, py, fade)) X.px(c, px, py, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
    },
    lights: (g, td, st, m) => [[m.g0.x + 4, m.g0.y, 40, '#9ff4ff', 0.45 * (1 - seg(td, m.exitAt, m.exitAt + 1))]],
  });

  // LIGHTNING: the skeleton flash (the rig's shock x-ray), then a sooty, smoking body with a few
  // sparks crawling over it. Wet at death changes nothing here (pass 6): a soaked target gets
  // this death plus the world's own wet-lightning surge through the puddle.
  OVERLAY.lightning = ov(function (c, g, td, dir, st, A, m) {
    const a = A[g.id], seedF = Math.floor(td * 18);
    const sparks = 1 - seg(td, 0.3, m.exitAt);
    if (a && a.chest && td > 0.15 && td < m.exitAt) {
      // sparks: tiny bolts crawling over the body on random frames
      for (let k = 0; k < 2; k++) if (rand(seedF, k, 3) < 0.55 * sparks + 0.1) { const p = [m.mid[0] + (rand(seedF, k, 4) - 0.5) * 9, m.mid[1] + (rand(seedF, k, 5) - 0.5) * 5], an = rand(seedF, k, 6) * TAU; X.lines(c, K.bolt(p, [p[0] + Math.cos(an) * 5, p[1] + Math.sin(an) * 3], seedF + k, 0.6, 2), k % 2 ? '#ffffff' : EL.lightning[1]); }
      // smoke curling off the singed body
      for (const p of emit(td, 8, 1.2, (i, age) => ({ x: m.mid[0] + (rand(i, 7) - 0.5) * 7 + age * 4, y: m.mid[1] - 3 - age * 15, age }), 0.1, 99)) K.puff(c, p.x, p.y, 1.3 + p.age * 3, '#4a4454', (1 - p.age) * 0.85);
    }
  }, {
    motion: { fall: 'topple', exitAt: 1.15, exitCols: SMOKE, hitCol: '#efe4ff' },
    body: (g, td) => ({ shock: td < 0.22 ? 1 : 0, tint: '#241e24', tintK: 0.55 * seg(td, 0.18, 0.45), flash: td < 0.05 ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) {
      K.scorch(c, m.mid[0], m.g.y + 1, 5, 0.5 * fade * seg(td, 0, 0.3));
    },
    lights: (g, td, st, m) => [[m.g0.x, m.g0.y - 4, 50, '#b08aff', 0.8 * (1 - seg(td, 0, 0.45))]],
  });

  // EARTH, BOULDER (earth + missile): flung along the blow, a bounce, dust and pebbles; a heavy
  // hit lands it flat.
  OVERLAY.earth = ov(function (c, g, td, dir, st, A, m) {
    const T1 = 0.46, T3 = 0.7, p0 = [m.g0.x, m.g0.y];
    K.dust(c, p0[0], p0[1], td, 5, 7, 14, '#8a7a68', 0.8);
    K.debris(c, p0[0], p0[1] - 6, td, 6, 10, 46, ['#b8946a', '#76583c', '#553e2a'], 40);
    const at = (tt) => baseDeath(m.g0, tt, dir, m.o).g;
    const l1 = at(T1), l2 = at(T3);
    K.dust(c, l1.x, l1.y, td - T1, 7, 6, 10, '#8a7a68', 0.6);
    K.dust(c, l2.x, l2.y, td - T3, 8, 10, 18, '#8a7a68', 0.9);
    if (td > T3 && td < T3 + 0.3) K.gring(c, l2.x + m.side * 3, l2.y, 4 + (td - T3) * 50, '#d8c0a0', 1 - (td - T3) / 0.3, 1);
    // pebbles skittering after the body
    for (let k = 0; k < 6; k++) { const e = td - T3; if (e < 0 || e > 1.2) continue; const d = 6 + rand(k, 71) * 14, x = l2.x + m.side * (4 + d * easeOut(Math.min(1, e * 2))), y = l2.y + (rand(k, 72) - 0.5) * 6 - K.hop(e, 0, 3, 0.25); X.rect(c, x, y, k % 3 ? 1 : 2, k % 3 ? 1 : 2, k % 2 ? '#977552' : '#6a5038'); }
  }, {
    motion: { fall: 'fling', fling: 44, h1: 14, flatten: true, exitAt: 1.4, hitCol: '#fff4e0' },
    motionFor: (st, o) => Object.assign({}, o, { fling: 30 + 26 * clamp(o.overkill || 0, 0, 1), flatten: (o.overkill || 0) > 0.6 }),
    ground(c, E, g, td, dir, st, m, fade) {
      const T1 = 0.46, T3 = 0.7, at = (tt) => baseDeath(m.g0, tt, dir, m.o).g, l1 = at(T1), l2 = at(T3);
      if (td > T1) { const a = 0.55 * fade; X.line(c, l1.x - 2, l1.y + 1, l1.x + 4, l1.y + 1, `rgba(40,28,20,${a.toFixed(2)})`); K.cracks(c, l1.x, l1.y + 1, 5, 3, 1, `rgba(26,18,12,${a.toFixed(2)})`, 4); }
      if (td > T3) { const a = 0.6 * fade, x0 = l2.x + m.side * 3; X.ellipse(c, x0, l2.y + 1, 9, 3, `rgba(40,28,20,${(a * 0.8).toFixed(2)})`); K.cracks(c, x0, l2.y + 1, 9, 4, seg(td, T3, T3 + 0.1), `rgba(26,18,12,${a.toFixed(2)})`, 6); for (let i = 0; i < 5; i++) { const x = l2.x + m.side * (8 + rand(i, 74) * 16), y = l2.y + (rand(i, 75) - 0.5) * 6; if (keep(x, y, fade)) { X.rect(c, x, y, 2, 1, '#6a6157'); X.px(c, x, y - 1, '#8a8174'); } } }
    },
  });

  // QUAKE (earth + burst: quake, geyser, nova of stone): the ground heaves under its feet and
  // bounces it straight up; it tumbles in the air, lands crumpled where it stood (not flung
  // sideways), and lies in cracked ground, debris and dust.
  const DIRT = ['#c8a878', '#9a7a54', '#6a5038', '#3a2a1c'];
  OVERLAY.quake = ov(function (c, g, td, dir, st, A, m) {
    const T1 = 0.61, x0 = m.g0.x, y0 = m.g0.y, lx = m.g.x, ly = m.g.y;
    // the ground bursts up under it: clods and stones thrown up, dust rolling out
    K.debris(c, x0, y0 - 1, td, 11, 14, 34, [DIRT[0], DIRT[1], DIRT[2]], 70);
    K.dust(c, x0, y0, td, 12, 7, 14, '#8a7a68', 0.7);
    if (td < 0.3) K.gring(c, x0, y0 + 1, 3 + td * 60, '#d8c0a0', 1 - td / 0.3, 1);
    // the landing: a thump of dust and a few pebbles hopping out
    if (td > T1) {
      const e = td - T1;
      K.dust(c, lx + m.side * 3, ly, e, 13, 9, 14, '#8a7a68', 0.8);
      if (e < 0.25) K.gring(c, lx + m.side * 3, ly + 1, 4 + e * 40, '#d8c0a0', 1 - e / 0.25, 1);
      for (let k = 0; k < 5; k++) { if (e > 0.6) break; const a = (rand(k, 121) - 0.5) * 2.6 + (k % 2 ? 0 : Math.PI), d = 4 + rand(k, 122) * 8 * easeOut(Math.min(1, e * 2.5)), x = lx + m.side * 3 + Math.cos(a) * d, y = ly + Math.sin(a) * d * 0.4 - K.hop(e, 0, 3 + rand(k, 123) * 3, 0.3); X.rect(c, x, y, k % 3 ? 1 : 2, 1, k % 2 ? DIRT[1] : DIRT[2]); }
    }
  }, {
    motion: { fall: 'bounce', h1: 18, air: 0.56, exitAt: 1.55, hitCol: '#fff4e0', exitCols: ['#efe4d0', '#bfae94', '#7a6a58'] },
    ground(c, E, g, td, dir, st, m, fade) {
      const x = m.g0.x, y = m.g0.y + 1, up = K.hop(td, 0, 3, 0.3);
      // the shadow left on the ground while it is in the air
      if (td < 0.62 && m.g.z > 1) X.ellipse(c, m.g.x, m.g.y + 1, Math.max(2, 5 - m.g.z * 0.12), 1.6, 'rgba(8,6,16,0.45)');
      // the heaved, broken ground: a dark rim, a lit mound that rises and settles, cracks
      const a = fade, k = seg(td, 0, 0.12);
      if (k > 0) {
        X.ellipse(c, x, y, 5 + 3 * k, 1.8 + 0.8 * k, `rgba(40,28,20,${(0.55 * a).toFixed(2)})`);
        // the bulge while the ground heaves, gone once it settles
        if (up > 0.4) { X.ellipse(c, x, y - up, 4, 1.4, DIRT[2]); X.ellipse(c, x - 1, y - up - 0.5, 2.5, 0.8, DIRT[1]); }
        K.cracks(c, x, y, 15, 14, k, `rgba(26,18,12,${(0.85 * a).toFixed(2)})`, 7);
        for (let i = 0; i < 7; i++) { const an = rand(i, 131) * TAU, r = 6 + rand(i, 132) * 10, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.45; if (keep(px, py, a * seg(td, 0.3, 0.6))) { X.rect(c, px, py, i % 3 ? 1 : 2, 1, DIRT[2]); X.px(c, px, py - 1, DIRT[1]); } }
      }
    },
    lights: (g, td, st, m) => [[m.g0.x, m.g0.y, 50, '#e0c8a0', 0.7 * (1 - seg(td, 0, 0.5))]],
  });

  // WATER: no overlay (pass 6). Water kills use the base death; any puddle is the spell's own.

  // STEAM v2 (mix scald): no shaking at all. A steady red flush with steam rising off it and
  // whistling from its ears; it sinks where it stands in one smooth movement, a puff of steam
  // bursts off it, then a soot cloud; the sooty remains lie still.
  OVERLAY.steam = ov(function (c, g, td, dir, st, A, m) {
    const a = A[g.id], ex = td - m.exitAt;
    if (a && a.head && td < m.exitAt) {
      const h = a.head, ch = a.chest;
      for (const p of emit(td, 8, 0.9, (i, age) => ({ x: ch[0] + (rand(i, 91) - 0.5) * 10 + age * 3, y: ch[1] - 4 - age * 15, age }))) K.puff(c, p.x, p.y, 1 + p.age * 2.5, p.age < 0.4 ? EL.steam[1] : EL.steam[2], (1 - p.age) * 0.85);
      // the kettle: thin jets out of both ears, steady (they stop once it sinks)
      const k = Math.min(seg(td, 0.15, 0.35), 1 - seg(td, 0.55, 0.75));
      if (k > 0) for (const s of [-1, 1]) for (let j = 0; j < 6; j++) { const q = mod(td * 3 + j / 6, 1), x = h[0] + s * (4 + q * 7), y = h[1] - 2 - q * 9; if (q < k) X.px(c, x, y, q < 0.4 ? '#ffffff' : EL.steam[1]); }
    }
    // the steam puff as it gives out: white, rising, over the body
    if (td > 0.82 && td < 1.4) poof(c, m.mid[0], m.mid[1] - 3, (td - 0.82) / 0.55, ['#ffffff', EL.steam[1], EL.steam[2]], 7, 11);
  }, {
    motion: { fall: 'slump', slumpAt: 0.45, exitAt: 1.35, exitCols: SOOT, exitR: 12, hitCol: '#ffe6c8', clubCol: ['#3a3236', '#6a6268'], clubStill: true },
    body: (g, td) => ({ wet: 0.6 * (1 - seg(td, 0.6, 1.0)), tint: X.mix('#d0304a', '#2a2226', seg(td, 0.6, 1.1)), tintK: 0.25 + 0.35 * seg(td, 0, 0.5) + 0.2 * seg(td, 0.6, 1.1) }),
    ground(c, E, g, td, dir, st, m, fade) {
      if (td < m.exitAt) return;
      const k = seg(td, m.exitAt, m.exitAt + 0.3) * fade;
      K.scorch(c, m.mid[0], m.g0.y + 1, 10, 0.75 * k);
      for (let i = 0; i < 14; i++) { const an = rand(i, 95) * TAU, r = 6 + rand(i, 96) * 9, x = m.mid[0] + Math.cos(an) * r, y = m.g0.y + 1 + Math.sin(an) * r * 0.45; if (keep(x, y, k)) X.px(c, x, y, '#1e1a22'); }
    },
    lights: (g, td, st, m) => [[m.g0.x, m.g0.y - 6, 34, '#ffd0c0', 0.25 * (1 - seg(td, 0.8, 1.2))]],
  });

  // Shield, Life, Sigil: no overlay, so they get the base death as it is.

  // ---------------------------------------------------------------------------
  // Bespoke deaths: the body is replaced by its own pixels.
  const BESPOKE = {};

  // SHATTER v2 (frozen at death, any blow): the body-shaped ice (rime and clear ice hugging the
  // silhouette, a few crystal spikes) and the body inside it break into shards along the ice,
  // which fly along the blow, bounce and skitter over the ground, then melt.
  function chunksOf(key, px, n, seed) {
    const ck = key + '#chunks';
    if (SPR.has(ck)) return SPR.get(ck);
    const seeds = []; for (let i = 0; i < n; i++) { const p = px[Math.floor(rand(i, seed, 1) * px.length)]; seeds.push([p.x + (rand(i, seed, 2) - 0.5), p.y + (rand(i, seed, 3) - 0.5)]); }
    const ch = seeds.map(() => ({ pts: [], cx: 0, cy: 0 }));
    for (const p of px) { let b = 0, bd = 1e9; seeds.forEach((s, i) => { const d = (p.x - s[0]) ** 2 + ((p.y - s[1]) * 1.2) ** 2; if (d < bd) { bd = d; b = i; } }); ch[b].pts.push(p); }
    const out = ch.filter((c) => c.pts.length);
    for (const c of out) {
      c.cx = c.pts.reduce((s, p) => s + p.x, 0) / c.pts.length; c.cy = c.pts.reduce((s, p) => s + p.y, 0) / c.pts.length;
      c.hh = Math.max(1, (Math.max(...c.pts.map((p) => p.y)) - Math.min(...c.pts.map((p) => p.y))) / 2);
      // the captured body is already iced (frozenBody() in actors.js), so a shard keeps its
      // colours: a white lip on top, a deep-blue edge where it broke, and the dark outline
      // turned to deep ice blue
      const has = new Set(c.pts.map((p) => p.x + ',' + p.y)), hh = (x, y) => has.has(x + ',' + y);
      for (const p of c.pts) {
        p.top = !hh(p.x, p.y - 1);
        const edge = !hh(p.x - 1, p.y) || !hh(p.x + 1, p.y) || !hh(p.x, p.y + 1);
        p.ice = p.dark ? '#1e5a96' : p.top ? '#ffffff' : edge ? X.mix(p.col, '#2a6aa8', 0.5) : p.col;
      }
    }
    SPR.set(ck, out);
    return out;
  }
  function simChunk(c, j, td, dir, gy) {
    const sp = 25 + rand(j, 1) * 55, side = (rand(j, 2) - 0.5) * 60;
    let x = c.cx, y = gy + (rand(j, 3) - 0.5) * 2, z = gy - c.cy, vx = dir[0] * sp - dir[1] * side, vy = (dir[1] * sp + dir[0] * side) * FY * 0.7, vz = 10 + rand(j, 4) * 40 + (gy - c.cy) * 1.2;
    const dt = 1 / 90, n = Math.min(400, Math.round(td / dt)), floor = c.hh;
    for (let i = 0; i < n; i++) {
      x += vx * dt; y += vy * dt; z += vz * dt; vz -= 220 * dt;
      if (z <= floor) { z = floor; if (vz < -14) { vz = -vz * 0.38; vx *= 0.72; vy *= 0.72; } else { vz = 0; vx *= 1 - 2.6 * dt; vy *= 1 - 2.6 * dt; } }
    }
    return [x, y, z];
  }
  BESPOKE.shatter = function (ev, t, td, g0, D, key, fade) {
    const px = sprite(key, Object.assign({}, g0, { flash: 0 }), t - td), ch = chunksOf(key, px, 14, 7), gy = g0.y, dir = ev.dir;
    const melt = seg(td, 1.3, 2.2);
    const pos = ch.map((c, j) => simChunk(c, j, td, dir, gy));
    const stand = ch.map((c, j) => [pos[j][1], (cc) => {
      const [x, y, z] = pos[j];
      for (const p of c.pts) {
        if (melt > 0 && rand(p.i, 77) < melt * 1.1) continue;
        X.px(cc, x + p.x - c.cx, y - z + p.y - c.cy, p.ice);
      }
    }]);
    return {
      actor: Object.assign({}, g0, { alpha: 0 }), stand,
      under(c) {
        // the frost patch where it stood, and a thin wet sheen under each melting chunk
        const k = seg(td, 0, 0.25) * fade;
        if (k > 0.02) for (let i = 0; i < 80; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.6) * 17 * k, x = g0.x + 3 + Math.cos(an) * r, y = gy + 1 + Math.sin(an) * r * FY * 0.6; if (keep(x, y, fade)) X.px(c, x, y, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
        for (let j = 0; j < ch.length; j++) if (td > 0.5 && pos[j][2] <= ch[j].hh + 0.1) X.ellipse(c, pos[j][0], pos[j][1] + 1, 2 + melt * 2, 1, `rgba(120,190,230,${(0.5 * fade).toFixed(2)})`);
      },
      fx(c) {
        const p = [g0.x - 1, gy - 9];
        if (td < 0.06) X.ellipse(c, p[0], p[1], 12, 10, '#ffffff');
        star(c, p, td, '#bfeeff', 10);
        // glitter thrown off the burst
        for (let k = 0; k < 22; k++) { const e = td; if (e > 0.6) break; const an = rand(k, 41) * TAU, sp = 20 + rand(k, 42) * 40; X.px(c, p[0] + Math.cos(an) * sp * e + dir[0] * 20 * e, p[1] + Math.sin(an) * sp * e * 0.6 + 40 * e * e, k % 3 ? '#e0ffff' : '#ffffff'); }
        // twinkles on the resting shards
        for (let j = 0; j < ch.length; j++) if (td > 0.6 && melt < 0.9 && (Math.floor(td * 8) + j) % 7 === 0) X.px(c, pos[j][0], pos[j][1] - pos[j][2] - 1, '#ffffff');
        K.dust(c, p[0], gy, td, 3, 6, 12, '#d8ecf6', 0.6);
      },
      lights: [[g0.x, gy - 4, 60, '#9ff4ff', 1.0 * (1 - seg(td, 0, 0.5)) + 0.3 * fade]],
    };
  };

  // ARCANE v2: the magic that binds the body tears apart. The hit's burst nudges it back; glowing
  // pink fault lines crack across it from the impact; the pieces are wrenched outward along
  // the seams, held by threads of magic that strain, then snap one after another; the pieces
  // fly apart in the camera plane (no lift, no spiral) and unravel from their edges inward,
  // each pixel popping into nothing. No dust, no ash: that is fire's.
  function piecesOf(key, px, n, seed) {
    const ck = key + '#pieces'; if (SPR.has(ck)) return SPR.get(ck);
    let cx = 0, cy = 0; for (const p of px) { cx += p.x; cy += p.y; } cx /= px.length; cy /= px.length;
    // seeds by farthest-point sampling, so the pieces come out about the same size
    const S = [[cx + 0.3, cy - 6]];
    while (S.length < n) {
      let best = null, bd = -1;
      for (const p of px) { const d = Math.min(...S.map((q) => (p.x - q[0]) ** 2 + ((p.y - q[1]) * 0.8) ** 2)) * (0.75 + 0.5 * rand(p.i, seed)); if (d > bd) { bd = d; best = [p.x, p.y]; } }
      S.push(best);
    }
    const own = new Map(), P = S.map(() => ({ pts: [], cx: 0, cy: 0, ux: 0, uy: 0, nb: new Map() }));
    for (const p of px) {
      let b = 0, bd = 1e9;
      S.forEach((q, i) => { const d = (p.x - q[0]) ** 2 + ((p.y - q[1]) * 0.8) ** 2 + rand(p.i, seed, 2) * 3; if (d < bd) { bd = d; b = i; } });
      own.set(p.x + ',' + p.y, b); P[b].pts.push(p);
    }
    const at = (x, y) => own.get(x + ',' + y);
    P.forEach((c, j) => {
      if (!c.pts.length) return;
      c.cx = c.pts.reduce((s, p) => s + p.x, 0) / c.pts.length; c.cy = c.pts.reduce((s, p) => s + p.y, 0) / c.pts.length;
      let ux = c.cx - cx, uy = c.cy - cy; const L = Math.hypot(ux, uy);
      if (L < 1.5) { const an = rand(j, seed, 3) * TAU; ux = Math.cos(an); uy = Math.sin(an); } else { ux /= L; uy /= L; }
      c.ux = ux; c.uy = uy;
      for (const p of c.pts) {
        p.seam = false; p.edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = at(p.x + dx, p.y + dy);
          if (o == null) p.edge = true;
          else if (o !== j) { if (o > j) p.seam = true; p.rim = true; if (!c.nb.has(o)) c.nb.set(o, []); c.nb.get(o).push(p); }
        }
      }
      // depth: how far in from the piece's edge (it unravels from the edges inward)
      const rim = c.pts.filter((p) => p.edge || p.rim);
      for (const p of c.pts) { let d = 9; for (const q of rim) { const e = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (e < d) d = e; } p.d = d; }
    });
    // threads: one or two per shared seam, anchored on each side of it
    const threads = [];
    P.forEach((c, j) => c.nb.forEach((pts, o) => {
      if (o < j) return;
      const back = P[o].nb.get(j) || pts, k = pts.length > 10 ? 2 : 1;
      for (let q = 0; q < k; q++) threads.push({ a: j, b: o, pa: pts[Math.floor(((q + 0.5) / k) * pts.length)], pb: back[Math.floor(((q + 0.5) / k) * back.length)], r: rand(j, o, q, seed) });
    }));
    const out = { P: P.filter((c) => c.pts.length), threads, cx, cy };
    SPR.set(ck, out);
    return out;
  }
  BESPOKE.arcane = function (ev, t, td, g0, D, key, fade) {
    const R = EL.arcane, dir = ev.dir;
    const px = sprite(key, Object.assign({}, g0, { flash: 0 }), t - td), PC = piecesOf(key, px, 5, 13);
    // the nudge: the burst shoves the body back along the blow
    const sh = 4 * easeOut(seg(td, 0, 0.16)), ox = dir[0] * sh, oy = dir[1] * sh * FY;
    const imp = [PC.cx - dir[0] * 4, PC.cy - 2];
    const SEAM = (p) => 0.05 + 0.25 * Math.min(1, Math.hypot(p.x - imp[0], p.y - imp[1]) / 16);   // when a seam pixel cracks
    const STRAIN0 = 0.4, SNAP = 0.85;
    const snapOf = (j) => SNAP + rand(j, 17) * 0.16;
    const vanish = (p, sp) => sp + 0.2 + p.d * 0.12 + rand(p.i, 23) * 0.3;
    // a piece's offset: a slow, straining creep (held back by the threads), then the snap
    const D2 = PC.P.map((c, j) => {
      const sp = snapOf(j), creep = 5 * Math.pow(seg(td, STRAIN0, sp), 1.4), fly = td > sp ? 13 * (0.75 + 0.5 * rand(j, 19)) * easeOut(seg(td, sp, sp + 0.5)) : 0;
      return [ox + c.ux * (creep + fly), oy + c.uy * (creep + fly)];
    });
    const strain = seg(td, STRAIN0, SNAP);
    const stand = [[g0.y, (c, E) => {
      const ems = [];
      PC.P.forEach((pc, j) => {
        const [dx, dy] = D2[j], sp = snapOf(j);
        for (const p of pc.pts) {
          const tv = vanish(p, sp);
          if (td > tv) continue;
          const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
          // the last instant before a pixel goes: it flares
          if (td > tv - 0.07) { ems.push([x, y, td > tv - 0.035 ? '#ffffff' : R[0]]); continue; }
          const lit = p.seam && !p.dark && td > SEAM(p);
          if (lit) ems.push([x, y, (strain > 0.6 && (Math.floor(td * 24) + p.i) % 5 === 0) || td - SEAM(p) < 0.04 ? '#ffffff' : (p.x + p.y) % 2 ? R[2] : R[3]]);
          else if (p.em) ems.push([x, y, p.col]);
          else X.px(c, x, y, td > 0.1 && !p.dark ? X.mix(p.col, '#ff9ad0', 0.1 + 0.2 * strain) : p.col);
        }
      });
      if (ems.length) E.em((cc) => { for (const [x, y, col] of ems) X.px(cc, x, y, col); });
    }]];
    return {
      actor: Object.assign({}, g0, { alpha: 0 }), stand,
      under(c) {
        // the shadow, until the pieces come apart
        if (td < SNAP + 0.1) X.ellipse(c, g0.x + ox, g0.y + 1, 5, 1.6, 'rgba(8,6,16,0.45)');
      },
      fx(c) {
        // the burst that nudges it
        star(c, imp, td, R[1], 8);
        if (td < 0.22) {
          const q = td / 0.22; X.ring(c, imp[0], imp[1], 3 + q * 9, (3 + q * 9) * 0.8, R[1], 1 - q);
          for (let k = 0; k < 6; k++) { const an = (rand(k, 31) - 0.5) * 1.8 + Math.atan2(dir[1], dir[0]), d = 3 + easeOut(q) * 12; X.px(c, imp[0] + Math.cos(an) * d, imp[1] + Math.sin(an) * d * 0.7, k % 2 ? '#ffffff' : R[1]); }
        }
        // the threads across the opening gaps: taut, brightening as they strain, then snapping
        if (td > STRAIN0 - 0.05) for (const th of PC.threads) {
          const ia = PC.P.findIndex((c) => c.pts.includes(th.pa)), ib = PC.P.findIndex((c) => c.pts.includes(th.pb));
          if (ia < 0 || ib < 0) continue;
          const ts = Math.min(snapOf(ia), snapOf(ib)) + th.r * 0.05;
          const a = [th.pa.x + D2[ia][0], th.pa.y + D2[ia][1]], b = [th.pb.x + D2[ib][0], th.pb.y + D2[ib][1]];
          if (td < ts) {
            const col = strain > 0.75 && Math.floor(td * 30 + th.r * 7) % 3 === 0 ? '#ffffff' : strain > 0.4 ? R[2] : R[3];
            // a thread bows a little while slack and straightens as it pulls taut
            const mx = (a[0] + b[0]) / 2 + (th.r - 0.5) * 3 * (1 - strain), my = (a[1] + b[1]) / 2 + 1.5 * (1 - strain);
            X.lines(c, [a, [mx, my], b], col);
          } else if (td < ts + 0.16) {
            // snapped: each half whips back to its piece and fades
            const e = (td - ts) / 0.16, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            for (const p of [a, b]) X.line(c, p[0], p[1], lerp(p[0], mid[0], 1 - e), lerp(p[1], mid[1], 1 - e) + e * 2, e < 0.5 ? R[0] : R[2]);
            if (e < 0.35) { X.px(c, mid[0], mid[1], '#ffffff'); X.px(c, mid[0] - 1, mid[1], R[1]); X.px(c, mid[0] + 1, mid[1], R[1]); X.px(c, mid[0], mid[1] - 1, R[1]); X.px(c, mid[0], mid[1] + 1, R[1]); }
          }
        }
        // pops where pixels wink out: a tiny plus that flashes and is gone
        PC.P.forEach((pc, j) => {
          const sp = snapOf(j); if (td < sp + 0.1) return;
          for (const p of pc.pts) {
            if (p.i % 7) continue;
            const e = td - vanish(p, sp); if (e < 0 || e > 0.08) continue;
            const x = p.x + D2[j][0], y = p.y + D2[j][1];
            X.px(c, x, y, '#ffffff'); if (e < 0.05) { X.px(c, x - 1, y, R[1]); X.px(c, x + 1, y, R[1]); X.px(c, x, y - 1, R[1]); X.px(c, x, y + 1, R[1]); }
          }
        });
      },
      lights: [[PC.cx + ox, g0.y - 4, 34, '#ff4f9b', td < 0.16 ? 0.9 : (0.1 + 0.4 * seg(td, 0.1, SNAP)) * (1 - seg(td, SNAP, SNAP + 0.8))]],
    };
  };

  // rigid(): draw captured pixels rotated by ang about a pivot (the feet), sampling back from
  // each destination pixel so the rotated body has no holes. Generic: any rig can tip stiffly.
  // off moves the pivot on screen (the captured pivot is pv); full samples below the pivot too,
  // for a spin about the middle of the body rather than a tip about the feet.
  function rigid(c, E, px, pv, ang, flash, alpha, off = [0, 0], full = false) {
    const M = new Map(); let r = 0;
    for (const p of px) { M.set((p.x - pv[0]) * 256 + (p.y - pv[1]), p); r = Math.max(r, Math.hypot(p.x - pv[0], p.y - pv[1])); }
    const cs = Math.cos(ang), sn = Math.sin(ang), R = Math.ceil(r) + 1, ems = [];
    for (let dy = -R; dy <= (full ? R : 1); dy++) for (let dx = -R; dx <= R; dx++) {
      const sx = Math.round(dx * cs + dy * sn), sy = Math.round(-dx * sn + dy * cs), p = M.get(sx * 256 + sy);
      if (!p) continue;
      const x = Math.round(pv[0] + off[0]) + dx, y = Math.round(pv[1] + off[1]) + dy; if (!keep(x, y, alpha)) continue;
      if (p.em) ems.push([x, y, p.col]); else X.px(c, x, y, flash > 0.3 ? '#ffffff' : p.col);
    }
    if (ems.length) E.em((cc) => { for (const [x, y, col] of ems) X.px(cc, x, y, col); });
  }

  // ---------------------------------------------------------------------------
  // The runner: takes the death event and the goblin's live state at the blow, returns what the
  // vignette draws. Before the blow it changes nothing.
  function pick(ev) {
    const st = ev.statuses || {}, el = ev.element;
    if (st.frozen > 0.5) return 'shatter';
    if (ev.mix === 'scald') return 'steam';
    if (el === 'earth') return ev.delivery === 'burst' ? 'quake' : ev.delivery === 'missile' ? 'earth' : 'base';
    if (el === 'fire' || el === 'cold' || el === 'lightning' || el === 'arcane') return el;
    return 'base';
  }
  function death(ev, t, tH, g0, D, key) {
    const td = t - tH, fade = 1 - seg(t, D - 0.45, D), st = ev.statuses || {};
    if (td < 0) return { actor: g0, stand: [], under() {}, fx() {}, lights: [], td, alive: true };
    const kind = pick(ev);
    if (BESPOKE[kind]) return Object.assign({ td, kind }, BESPOKE[kind](ev, t, td, g0, D, key, fade));
    const O = OVERLAY[kind] || null;
    let mo = Object.assign({ overkill: ev.overkill || 0 }, O && O.motion);
    if (O && O.motionFor) mo = O.motionFor(st, mo);
    const m = baseDeath(g0, td, ev.dir, mo);
    m.g0 = g0; m.o = mo; m.key = key; m.tH = tH;
    if (O && O.body) { const keepA = m.g.alpha; Object.assign(m.g, O.body(m.g, td, ev.dir, st, m)); m.g.alpha = keepA; }
    const exit = mo.exit || 'poof', ex = td - m.exitAt, stand = [];
    if (m.rot != null && m.fall === 'bounce') {
      // the tumble: the captured body spun about its middle, carried up by z
      const px = sprite(key + '#tumble', Object.assign({}, g0, { flash: 0, dead: 0, z: 0 }), tH), pv = [Math.round(g0.x), Math.round(g0.y) - 7], a = m.g.alpha;
      m.g.alpha = 0;
      if (a > 0.05) stand.push([m.g.y, (c, E) => rigid(c, E, px, pv, m.rot * m.side, m.g.flash, a, [m.g.x - g0.x, m.g.y - g0.y - m.g.z], true)]);
    } else if (m.rot != null) {
      const cx = Math.round(g0.x + ev.dir[0] * 1.5), cy = Math.round(g0.y + ev.dir[1] * 1.5 * FY), px = sprite(key + '#rigid', Object.assign({}, m.g, { x: cx, y: cy, z: 0, flash: 0, dead: 0 }), tH), pv = [Math.round(cx), Math.round(cy - m.g.z)], a = m.alpha = m.g.alpha;
      m.g.alpha = 0;
      if (a > 0.05) stand.push([m.g.y, (c, E) => rigid(c, E, px, pv, m.rot * m.side, m.g.flash, a)]);
    }
    // the dropped club pops out of the poof and lands beside it
    if (exit === 'poof' && mo.club !== false && ex > 0) {
      // (clubStill: it is simply there when the cloud clears, lying still)
      const cl = mo.clubCol || ['#a8743e', '#e0aa6a'], gx = m.g.x + m.side * 6, z = mo.clubStill ? 0 : K.hop(ex, 0, 6, 0.35), x = mo.clubStill ? gx : lerp(m.mid[0], gx, seg(ex, 0, 0.35));
      if (mo.clubStill && ex < 0.25) { /* hidden inside the cloud */ } else
      stand.push([m.g.y + 1, (c) => { if (keep(x, m.g.y, fade)) club(c, x, m.g.y + 1 - z, m.side, cl[0], cl[1]); }]);
    }
    // crumble: the captured body falls apart from the top into ash, embers rising off it
    if (exit === 'crumble' && ex >= 0) {
      m.g.alpha = 0;   // a hard cut to the captured pixels (a dithered fade of a glowing outline checkers)
      const cap = baseDeath(g0, m.exitAt, ev.dir, mo).g; Object.assign(cap, O.body(cap, m.exitAt, ev.dir, st, m), { alpha: 1, flash: 0, eyesShut: false });
      const px = sprite(key, cap, tH + m.exitAt), gx = cap.x, gy = cap.y;
      stand.push([gy, (c, E) => {
        const pk = seg(ex, 0.1, 0.6);
        if (pk > 0 && keep(gx, gy, fade)) { X.ellipse(c, gx, gy, 2 + 4.5 * pk, 1 + 1.4 * pk, '#2a2428'); X.ellipse(c, gx - 1, gy - 1, 1 + 3 * pk, 0.5 + pk * 0.8, '#4e484c'); X.px(c, gx - 2, gy - 2, '#6a6468'); }
        const ems = [];
        for (const p of px) {
          const u = clamp((gy - p.y) / 16, 0, 1), r = (1 - u) * 0.38 + rand(p.i, 7) * 0.12, te = ex - r;
          if (te < 0) { if (p.em) ems.push([p.x, p.y, p.col]); else X.px(c, p.x, p.y, p.col); continue; }
          if (rand(p.i, 8) < 0.2) { if (te < 0.8 && (Math.floor(td * 12) + p.i) % 5) ems.push([p.x + Math.sin(te * 6 + p.i) * 1.5 + m.side * te * 3, p.y - te * 16, te < 0.3 ? EL.fire[2] : EL.fire[3]]); continue; }
          const dist = gy - 1 - p.y, ft = Math.sqrt(2 * Math.max(0, dist) / 150);
          if (te < ft) X.px(c, p.x + (rand(p.i, 9) - 0.5) * te * 10, p.y + 75 * te * te, te < ft * 0.4 ? p.col : '#5a5458');
        }
        if (ems.length) E.em((cc) => { for (const [x, y, col] of ems) X.px(cc, x, y, col); });
        // embers glowing in the ash pile
        if (pk > 0.5) E.em((cc) => { for (let i = 0; i < 5; i++) if (rand(i, Math.floor(td * 4), 3) < 0.6 * fade * (1 - seg(ex, 1.2, 2))) X.px(cc, gx - 3 + rand(i, 4) * 6, gy - 1 + rand(i, 5) * 2, i % 2 ? EL.fire[3] : EL.fire[2]); });
      }]);
    }
    const lights = O && O.lights ? O.lights(m.g, td, st, m) : [];
    return {
      td, kind, m, actor: m.g, stand, lights,
      under(c, E) { if (O && O.ground) O.ground(c, E, m.g, td, ev.dir, st, m, fade); },
      fx(c, A) {
        const a = A[m.g.id];
        if (a && a.chest) star(c, [a.chest[0] - ev.dir[0] * 2, a.chest[1]], td, mo.hitCol || '#ffffff');
        if (O) O(c, m.g, td, ev.dir, st, A, m);
        if (exit === 'poof') poof(c, m.mid[0], m.mid[1], ex / 0.7, mo.exitCols || POOF, mo.exitR || 11, 3);
      },
    };
  }
  PB.deaths = { baseDeath, overlay: OVERLAY, bespoke: BESPOKE, death, sprite, poof, pick };

  // ---------------------------------------------------------------------------
  // The vignettes. One goblin, one wizard casting the killing spell, the same stage as the rest.
  const G = { x: 128, y: 72 };
  const dirTo = (a, b) => { const dx = b.x - a.x, dy = (b.y - a.y) / FY, L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const gob = (t, D, o = {}) => K.gob(Object.assign({ id: 'g1', x: G.x, y: G.y, face: Math.PI - 0.65, seed: 1, alpha: K.life(t, D) }, o));
  const evText = (ev) => { const s = Object.entries(ev.statuses || {}).filter(([, v]) => v).map(([k]) => k); return `${ev.element}${ev.mix ? ' (' + ev.mix + ')' : ''} · ${s.length ? s.join(', ') : 'no status'} · overkill ${ev.overkill}`; };
  const lightsOf = (dd) => (dd.lights || []);
  // the thrown rock (Rock, Force): a charge at the staff, a fast flight, then it drops and rolls
  function rockThrow(t, c0, hit, to) {
    const from = [ME.x + 8, ME.y - 22], fly = seg(t, c0, hit);
    if (t >= c0 && t < hit) return [lerp(from[0], to[0], fly), lerp(from[1], to[1], fly) - Math.sin(fly * Math.PI) * 4];
    if (t >= hit && t < hit + 0.9) { const e = t - hit; return [to[0] - 6 * easeOut(seg(e, 0, 0.5)), to[1] + 8 * Math.min(1, e / 0.25) - K.hop(e, 0.25, 3, 0.25)]; }
    return null;
  }
  function rockFx(c, A, t, c0, rp) {
    const ch = A.me.charge, charge = smooth(seg(t, 0.3, c0 - 0.05));
    if (t < c0 && t > 0.3) { K.rock(c, ch[0], ch[1] + 2, 1.5 + charge * 4, 4); for (let i = 0; i < 6; i++) { const a = t * 9 + i, r = 9 - charge * 5; X.px(c, ch[0] + Math.cos(a) * r, ch[1] + 2 + Math.sin(a) * r * 0.7, i % 2 ? '#b8946a' : '#e0c8a0'); } }
    if (rp) K.rock(c, rp[0], rp[1], 5, 4);
  }

  // Pass 6: retired cards, out of the gallery. Their slugs stay reserved (the user's ratings
  // are on them), so never reuse these ids:
  //   death-goblin-fire, death-goblin-frozen-shatter, death-goblin-arcane, death-goblin-steam
  //   (replaced by their -v2), death-goblin-water (water uses the base), death-goblin-wet-lightning
  //   (the lightning death plus the world's own wet-lightning surge).
  const V = (d) => add(Object.assign({ group: 'deaths', ground: 'path' }, d));

  // Base: Shield's shove wave has no overlay, so this is the plain base death.
  V({ id: 'death-goblin-base', approach: 'base (no overlay)', still: 2.05, title: 'Goblin death: base', q: ['shield'], cast: 'force', dur: 3.6, seed: 81,
    event: { archetype: 'goblin', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'The base every overlay builds on, and what water, shield, life and sigil kills use: knocked back along the blow, it topples, bounces, lies there a beat, then vanishes in a cartoon poof and drops its club.',
    frame(t, K) {
      const D = 3.6, c0 = 0.55, me = caster(t, 'shield', c0, 0.8), front = (tt) => lerp(ME.x + 10, 214, easeOut(seg(tt, c0, c0 + 0.95)));
      let tH = c0; while (front(tH) < G.x - 5 && tH < c0 + 1) tH += 0.01;
      const g0 = gob(t, D), ev = this.event, dd = death(ev, t, tH, g0, D, 'base');
      const stand = dd.stand.slice(), f = front(t);
      if (t > c0 && f < 210) { const arc = []; for (let k = -1; k <= 1.001; k += 0.1) arc.push([f - k * k * 12, 72 + k * 28]); K.sheet(stand, arc, { h: 15 * smooth(seg(t, c0, c0 + 0.12)) * (1 - seg(f, 160, 210)), ramp: EL.shield, alpha: 0.2 }, t); }
      return { actors: [me, dd.actor], stand, under: dd.under, lights: [...lightsOf(dd), ...(t > c0 && f < 210 ? [[f, 72, 50, '#ffc83a', 0.5]] : [])], fx(c, A) { K.prep(c, me, A, t, ['shield'], 0.05, c0); dd.fx(c, A); } };
    } });

  // Fire v2: base + overlay (stands, burns along its own outline, chars, crumbles).
  V({ id: 'death-goblin-fire-v2', fresh: 'new', approach: 'base + overlay', still: 1.55, title: 'Goblin death: fire', q: ['fire', 'fire'], cast: 'force', dur: 4.2, seed: 82,
    event: { archetype: 'goblin', element: 'fire', delivery: 'channel', dir: [1, 0], statuses: { burning: 1 }, overkill: 0.3 },
    line: 'Burning when the flamethrower finishes it: flames run along its own outline (no combustion burst), it chars to a black silhouette with ember edges and blinking eyes, then crumbles into ash and embers, leaving a scorch mark.',
    frame(t, K) {
      const D = 4.2, c0 = 0.55, tH = 1.3, c1 = 1.55, me = caster(t, 'fire', c0, c1), burn = seg(t, c0 + 0.25, c0 + 0.5);
      const g0 = gob(t, D, { burn: t < tH ? burn : 0, flash: t < tH && Math.floor(t * 10) % 3 === 0 ? 0.1 : 0, flashCol: EL.fire[0] }), dd = death(this.event, t, tH, g0, D, 'fire2');
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under,
        lights: [...lightsOf(dd), ...(t > c0 && t < c1 ? [[95, 74, 54, '#ff7a2a', 0.6]] : []), [G.x, G.y - 6, 40, '#ff7020', t < tH ? 0.6 * burn : 0]],
        fx(c, A) { K.prep(c, me, A, t, ['fire', 'fire'], 0.05, c0); K.cone(c, A.me.tip, [G.x, G.y - 6], t, 'fire', c0, c1, { spread: 0.22, reach: 1.05 }); if (t < tH) K.burning(c, A, g0, t, burn); dd.fx(c, A); },
      };
    } });

  // Frozen shatter v2: bespoke. Frozen at death, so any blow shatters it (here a rock).
  V({ id: 'death-goblin-frozen-shatter-v2', fresh: 'new', approach: 'bespoke', still: 1.0, title: 'Goblin death: frozen shatter', q: ['earth', 'earth'], cast: 'force', dur: 3.8, seed: 83,
    event: { archetype: 'goblin', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: { frozen: 1 }, overkill: 0.5 },
    line: 'Frozen solid (rime and clear ice hugging its body, a few crystal spikes, no cube) when a rock hits it: the ice and the goblin inside break into shards that skitter across the ground and melt, leaving a frost patch.',
    frame(t, K) {
      const D = 3.8, c0 = 0.95, tH = 1.2, me = caster(t, 'earth', c0, 1.15, { prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 });
      const g0 = gob(t, D, { frozen: 1 }), dd = death(this.event, t, tH, g0, D, 'shatter2'), rp = rockThrow(t, c0, tH, [G.x - 1, G.y - 9]);
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under, shake: t > tH && t < tH + 0.18 ? 2 : 0,
        lights: [...lightsOf(dd), [G.x, G.y - 6, 36, '#9ff4ff', t < tH ? 0.4 : 0]],
        fx(c, A) { K.prep(c, me, A, t, ['earth', 'earth'], 0.05, 0.35); rockFx(c, A, t, c0, rp); if (t < tH) K.frosty(c, A, g0, t); dd.fx(c, A); },
      };
    } });

  // Cold: base + overlay (plank fall, chill on the body, a crack on landing, a snowy poof).
  V({ id: 'death-goblin-cold', approach: 'base + overlay', still: 2.15, title: 'Goblin death: cold', q: ['cold', 'cold'], cast: 'force', dur: 4.2, seed: 84,
    event: { archetype: 'goblin', element: 'cold', delivery: 'channel', dir: [1, 0], statuses: { chilled: 1 }, overkill: 0.2 },
    line: 'Chilled but not frozen when the frost spray finishes it: stiff with rime, it wobbles, tips over like a plank, cracks on landing, and puffs away in snow, leaving a frost patch.',
    frame(t, K) {
      const D = 4.2, c0 = 0.55, tH = 1.55, c1 = 1.75, me = caster(t, 'cold', c0, c1), ch = smooth(seg(t, c0 + 0.1, tH));
      let x = G.x + 10; for (let s = 0; s < Math.min(t, tH); s += 0.05) x -= 8 * (1 - smooth(seg(s, c0 + 0.1, tH))) * 0.05;
      const g0 = gob(t, D, { x, chill: ch, ...K.walk(t, t < tH ? 0.7 * (1 - ch) : 0) }), dd = death(this.event, t, tH, g0, D, 'cold');
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under,
        lights: [...lightsOf(dd), ...(t > c0 && t < c1 ? [[95, 74, 50, '#9ff4ff', 0.5]] : [])],
        fx(c, A) { K.prep(c, me, A, t, ['cold', 'cold'], 0.05, c0); K.cone(c, A.me.tip, [G.x, G.y - 6], t, 'cold', c0, c1, { spread: 0.24 }); if (t < tH) K.chilled(c, A, g0, t, ch); dd.fx(c, A); },
      };
    } });

  // Lightning: base + overlay.
  V({ id: 'death-goblin-lightning', approach: 'base + overlay', still: 1.2, title: 'Goblin death: lightning', q: ['lightning'], cast: 'force', dur: 3.6, seed: 85,
    event: { archetype: 'goblin', element: 'lightning', delivery: 'arc', dir: [1, 0], statuses: { stunned: 1 }, overkill: 0.3 },
    line: 'The arc lights up its skeleton, it flashes white, then topples singed and smoking with a few sparks crawling over it, and poofs away in smoke.',
    frame(t, K) {
      const D = 3.6, c0 = 0.55, tH = 1.05, c1 = tH + 0.12, me = caster(t, 'lightning', c0, c1), on = t > c0 + 0.05 && t < c1;
      const g0 = gob(t, D, { shock: on ? 1 : 0, x: G.x + (on ? Math.sin(t * 60) * 0.6 : 0) }), dd = death(this.event, t, tH, g0, D, 'lightning');
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under,
        lights: [...lightsOf(dd), ...(on && Math.floor(t * 18) % 3 !== 2 ? [[G.x, G.y - 6, 50, '#b08aff', 0.8], [80, 70, 40, '#b08aff', 0.4]] : [])],
        fx(c, A) { K.prep(c, me, A, t, ['lightning'], 0.05, c0); if (on && Math.floor(t * 18) % 3 !== 2) { const s = Math.floor(t * 18); K.zap(c, A.me.tip, A.g1.chest, s * 13); K.zapHit(c, A.g1.chest, s); } dd.fx(c, A); },
      };
    } });

  // Arcane v2: bespoke (the body's own pixels tear apart along seams).
  V({ id: 'death-goblin-arcane-v2', fresh: 'new', approach: 'bespoke', still: 1.95, title: 'Goblin death: arcane', q: ['arcane'], cast: 'force', dur: 3.8, seed: 87, ground: 'plaza',
    event: { archetype: 'goblin', element: 'arcane', delivery: 'channel', dir: [1, 0], statuses: {}, overkill: 0.3 },
    line: 'The magic that holds it together tears: the beam’s burst shoves it back, pink fault lines crack across its body, the pieces strain apart on threads of magic that snap, and the pieces unravel and pop into nothing.',
    frame(t, K) {
      const D = 3.8, c0 = 0.55, tH = 1.15, c1 = tH + 0.2, me = caster(t, 'arcane', c0, c1), on = Math.min(easeOut(seg(t, c0, c0 + 0.12)), 1 - seg(t, c1, c1 + 0.1));
      const g0 = gob(t, D, { flash: t < tH && on > 0.5 && Math.floor(t * 12) % 3 === 0 ? 0.1 : 0, flashCol: EL.arcane[1] }), dd = death(this.event, t, tH, g0, D, 'arcane2');
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under,
        lights: [...lightsOf(dd), ...(on > 0.05 ? [[95, 74, 54, '#d02a78', 0.45 * on]] : [])],
        fx(c, A) { K.prep(c, me, A, t, ['arcane'], 0.05, c0); if (on > 0.02) K.beam(c, A.me.tip, [G.x, G.y - 10], t, EL.arcane, { on }); dd.fx(c, A); },
      };
    } });

  // Boulder (earth + missile): base + overlay (fling profile; overkill sets distance and flattening).
  V({ id: 'death-goblin-earth', approach: 'base + overlay', still: 1.95, title: 'Goblin death: boulder (earth missile)', q: ['earth', 'earth', 'earth'], cast: 'force', dur: 3.8, seed: 88, ground: 'grass',
    event: { archetype: 'goblin', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: {}, overkill: 0.9 },
    line: 'The boulder death, for earth missiles only: a full-charge rock flings it along the throw, spinning; it bounces once in dust and pebbles and lands flat as a pancake, then poofs. Overkill sets how far it flies and whether it flattens.',
    frame(t, K) {
      const D = 3.8, c0 = 0.95, tH = 1.2, me = caster(t, 'earth', c0, 1.15, { prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 });
      const g0 = gob(t, D, { x: G.x - 14 }), dd = death(this.event, t, tH, g0, D, 'earth'), rp = rockThrow(t, c0, tH, [G.x - 15, G.y - 9]);
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under, shake: t > tH && t < tH + 0.2 ? 2 : (dd.td > 0.7 && dd.td < 0.8 ? 1 : 0),
        lights: [...lightsOf(dd), ...(rp && t < tH ? [[rp[0], rp[1] + 10, 26, '#b8946a', 0.4]] : [])],
        fx(c, A) { K.prep(c, me, A, t, ['earth', 'earth', 'earth'], 0.05, 0.35); rockFx(c, A, t, c0, rp); dd.fx(c, A); },
      };
    } });

  // Quake (earth + burst): base + overlay (bounce profile: up, tumble, crumpled landing in place).
  V({ id: 'death-goblin-quake', fresh: 'new', approach: 'base + overlay', still: 1.35, title: 'Goblin death: quake (earth burst)', q: ['earth', 'earth'], cast: 'area', dur: 3.8, seed: 91, ground: 'grass',
    event: { archetype: 'goblin', element: 'earth', delivery: 'burst', dir: [1, 0], statuses: {}, overkill: 0.5 },
    line: 'For earthquake and geyser kills: the ground heaves under its feet and bounces it straight up; it tumbles, lands crumpled where it stood (not flung sideways) in cracked ground, debris and dust, then poofs.',
    frame(t, K) {
      const D = 3.8, c0 = 0.6, me = caster(t, 'earth', c0, 0.9), GX = G.x - 10;
      const R = (tt) => 4 + 84 * easeOut(clamp((tt - c0) / 0.8, 0, 1)), front = R(t);
      let tH = c0; while (R(tH) < GX - ME.x && tH < c0 + 1) tH += 0.01;
      const g0 = gob(t, D, { x: GX }), dd = death(this.event, t, tH, g0, D, 'quake');
      return {
        actors: [me, dd.actor], stand: dd.stand, shake: t > c0 && t < c0 + 0.5 ? 2 * (1 - (t - c0) / 0.5) : (dd.td > 0 && dd.td < 0.15 ? 1.5 : 0),
        under(c, E) {
          if (t > c0) { K.cracks(c, ME.x, ME.y, 30, 5, seg(t, c0, c0 + 0.4), '#1a120c', 9); X.ellipse(c, ME.x, ME.y, 12, 6, 'rgba(26,18,12,0.5)'); }
          if (t > c0 && t < c0 + 1.1) { const a = 1 - seg(t, c0 + 0.6, c0 + 1.1); K.gring(c, ME.x, ME.y, front, '#553e2a', a, 3); K.gring(c, ME.x, ME.y, front + 1, '#b8946a', a, 1); }
          dd.under(c, E);
        },
        lights: [...lightsOf(dd), ...(t > c0 && t < c0 + 0.6 ? [[ME.x, ME.y, front + 10, '#d8b88a', 0.5 * (1 - seg(t, c0, c0 + 0.6))]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['earth', 'earth'], 0.05, c0);
          if (t > c0 && t < c0 + 1.1) {
            const e = (t - c0) / 1.1, a = 1 - seg(e, 0.5, 1);
            K.gring(c, ME.x, ME.y, front, K.ROCK[1], a, 2); K.gring(c, ME.x, ME.y, front - 2, K.ROCK[3], a, 2);
            for (let i = 0; i < 22; i++) { const an = (i / 22) * TAU + rand(i, 2) * 0.2, x = ME.x + Math.cos(an) * front, y = ME.y + Math.sin(an) * front * FY; K.puff(c, x, y - 2 - e * 4, 2 + e * 3, i % 2 ? '#8a7a68' : '#6a5a4a', 1 - e); }
          }
          dd.fx(c, A);
        },
      };
    } });

  // Steam v2 (mix scald): base + overlay (steady flush, slump, steam puff, soot cloud; no shaking).
  V({ id: 'death-goblin-steam-v2', fresh: 'new', approach: 'base + overlay', still: 1.85, title: 'Goblin death: steam (scald)', q: ['water', 'fire'], cast: 'force', dur: 3.8, seed: 90,
    event: { archetype: 'goblin', element: 'water', mix: 'scald', delivery: 'channel', dir: [1, 0], statuses: { wet: 1 }, overkill: 0.3 },
    line: 'Scalded: it flushes a steady red with steam rising off it and whistling from its ears, sinks where it stands, gives off a puff of steam and goes up in a soot cloud; the sooty smudge and blackened club lie still.',
    frame(t, K) {
      const D = 3.8, c0 = 0.55, tH = 1.15, c1 = 1.5, me = caster(t, 'water', c0, c1), sc = seg(t, c0 + 0.2, tH);
      const g0 = gob(t, D, { wet: 0.6 * sc, tint: '#ff8a6a', tintK: 0.3 * sc }), dd = death(this.event, t, tH, g0, D, 'steam2');
      return {
        actors: [me, dd.actor], stand: dd.stand, under: dd.under,
        lights: [...lightsOf(dd), ...(t > c0 && t < c1 ? [[95, 74, 50, '#ffd0b0', 0.4]] : [])],
        fx(c, A) {
          K.prep(c, me, A, t, ['water', 'fire'], 0.05, c0); K.cone(c, A.me.tip, [G.x, G.y - 6], t, 'scald', c0, c1, { spread: 0.24 });
          if (t < tH && sc > 0.2) { const a = A.g1; for (const p of emit(t, 10, 0.8, (i, age) => ({ x: a.chest[0] + (rand(i, 3) - 0.5) * 6 + age * 3, y: a.chest[1] - 4 - age * 14, age }))) K.puff(c, p.x, p.y, 1 + p.age * 2.5, EL.steam[1], (1 - p.age) * 0.75 * sc); }
          dd.fx(c, A);
        },
      };
    } });
})();
