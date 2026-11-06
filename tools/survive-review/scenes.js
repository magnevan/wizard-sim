/* Survive Review: the vignettes (PB.SRV). Three stage vignettes in the Pixel Battlefield style
 * (stage.js + actors.js, copied from tools/weapon-moves/) and one top-down map of the arena.
 * Every scene is a pure function of its local time, so ?t= freezes any frame.
 *   pick   the altars rise, P1 and P2 each stand on one, their colours land on the plinths
 *   rally  P1 walks to downed P2, a goblin breaks the ring, P1 clears it, the ring fills, P2 gets up
 *   echo   Echo picked: each of P1's bolts goes off again 0.4 s later along P1's aim then, free; it ends at wave end
 *   arena  the 48 x 34 arena (world.ts SURVIVE_ROCK, SURVIVE_GATES, ALTAR_SPOTS) through one loop
 * Stage scenes: { id, w, h, dur, ground, seed, frame(t) } (see stage.js). The map: { id, w, h, dur, map: true, draw(c, t) }. */
(function () {
  'use strict';
  const PB = window.PB, S = PB.stage, X = PB.px, EL = X.EL, TEAM = X.TEAM;
  const { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp } = PB;
  const SR = PB.SR;
  const LIFE = EL.life, SIG = EL.sigil, FIRE = EL.fire;
  const PPU = 16; // art px per world unit, as in the game (camera.ts PPU)
  const OUT = '#120e1a';

  // ---------- small drawing helpers ----------
  const glyph = (c, g, x, y, col, k = 1) => { X.fs(c, col); for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (g[j][i] === '#') c.fillRect(Math.round(x) + i * k, Math.round(y) + j * k, k, k); };
  const tw = (s) => s.length * 4 - 1;
  const label = (c, s, x, y, col) => X.text(c, s, Math.round(x - tw(s) / 2), Math.round(y), col, OUT);
  // the wave strip across the top of the scene
  function strip(c, W, s, col = '#ecebf2') {
    if (!s) return;
    const w = tw(s) + 10, x = Math.round(W / 2 - w / 2);
    X.rect(c, x, 2, w, 9, 'rgba(10,8,16,0.82)'); X.rect(c, x, 10, w, 1, '#2a2539');
    X.text(c, s, x + 5, 4, col);
  }
  function hpBar(c, x, y, v) {
    x = Math.round(x) - 7; y = Math.round(y);
    X.rect(c, x - 1, y - 1, 16, 4, OUT); X.rect(c, x, y, 14, 2, '#5a1a24');
    X.rect(c, x, y, Math.round(14 * v), 2, v > 0.5 ? '#5fe07a' : v > 0.25 ? '#e6c84a' : '#e05a5a');
  }
  // a fire bolt: a bright head and a short trail; k scales it (the Double's repeat is half power)
  function bolt(c, x0, y0, x1, y1, q, k = 1) {
    if (q <= 0 || q >= 1) return;
    const x = lerp(x0, x1, q), y = lerp(y0, y1, q), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    for (let i = 5; i >= 0; i--) { const b = i * 1.6 * k; X.rect(c, x - (dx / L) * b - k, y - (dy / L) * b - k, 2 * k + (i ? 0 : 1), 2 * k + (i ? 0 : 1), FIRE[Math.min(4, i)]); }
    X.glow(c, x, y, 5 * k, FIRE[1], 0.7);
  }
  function burst(c, x, y, e, R = FIRE) {
    if (e < 0 || e > 1) return;
    const r = 3 + e * 10;
    X.ring(c, x, y, r, r * FY * 0.7, R[1], 1 - e);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.3, d = 2 + e * 12; X.px(c, x + Math.cos(a) * d, y - 6 + Math.sin(a) * d * 0.6, R[i % 3]); }
  }
  // an altar: a rune ring in the power-up's colour, a stone plinth, the glyph floating over it, the name above
  function altar(c, E, x, y, p, rise, t, fill, fillCol, pips) {
    if (rise <= 0.02) return;
    const R = EL[p.ramp] || SIG, h = Math.round(9 * rise);
    X.ring(c, x, y + 1, 13, 13 * FY * 0.62, R[3] || R[2], 0.85 * rise);
    if (fill > 0) {
      X.ring(c, x, y + 1, 15, 15 * FY * 0.62, '#1a1726', 0.8);
      X.ring(c, x, y + 1, 15, 15 * FY * 0.62, fillCol, 1, -Math.PI / 2, -Math.PI / 2 + fill * TAU);
    }
    // plinth: a squat block of old grey stone, lit from the upper left
    X.rect(c, x - 6, y - h, 12, h, '#4a4a52'); X.rect(c, x - 6, y - h, 12, 2, '#7a7a84'); X.rect(c, x + 3, y - h + 2, 3, h - 2, '#36363e');
    X.rect(c, x - 7, y - h - 1, 14, 1, OUT); X.rect(c, x - 7, y - h, 1, h, OUT); X.rect(c, x + 6, y - h, 1, h, OUT);
    (pips || []).forEach((col, i) => X.rect(c, x - 4 + i * 5, y - h + 3, 3, 2, col));
  }
  // the glyph floating over an altar: drawn with the unlit effects, so a wizard standing there doesn't hide it
  function altarGlyph(c, x, y, p, rise, t) {
    if (rise < 0.6) return;
    const R = EL[p.ramp] || SIG, h = Math.round(9 * rise), a = smooth(seg(rise, 0.6, 1)), bob = Math.round(Math.sin(t * 2.4 + x) * 1.2);
    X.glow(c, x, y - h - 20 + bob, 7, R[2], 0.4 * a);
    glyph(c, p.glyph, x - 3, y - h - 23 + bob, R[1]);
  }
  function seal(c, x, y, t, k) {
    if (k <= 0.02) return;
    X.ring(c, x, y, 11 * k, 11 * k * FY * 0.6, SIG[2], 0.9);
    X.ring(c, x, y, 7 * k, 7 * k * FY * 0.6, SIG[3], 0.8);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 1.2; X.px(c, x + Math.cos(a) * 9 * k, y + Math.sin(a) * 9 * k * FY * 0.6, SIG[1]); }
  }
  // fade to dark at the loop seam, so restarts don't pop
  function seam(c, W, H, t, dur) {
    const a = Math.max(1 - seg(t, 0, 0.25), seg(t, dur - 0.3, dur));
    if (a <= 0.02) return;
    c.save(); c.globalAlpha = a; c.fillStyle = '#07060b'; c.fillRect(0, 0, W, H); c.restore(); c._fs = null;
  }
  const walkTo = (t, t0, t1, a, b) => { const k = smooth(seg(t, t0, t1)); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), t > t0 && t < t1 ? 1 : 0]; };
  const P = (name) => SR.PERKS.find((p) => p.name === name);

  // ---------- pick ----------
  const pick = {
    id: 'pick', w: 224, h: 128, dur: 7.5, ground: 'plaza', seed: 3,
    frame(t) {
      const W = 224, rise = Math.min(smooth(seg(t, 0.2, 1.0)), 1 - smooth(seg(t, 5.0, 5.7)));
      const deepFire = Object.assign({}, P('Deep (element)'), { ramp: 'fire', glyph: SR.G.FIRE });
      const alt = [[70, 62, P('Pyre'), 'PYRE'], [112, 82, P('Glass heart'), 'GLASS HEART'], [154, 62, deepFire, 'DEEP FIRE']];
      const p1t = 2.2, p2t = 3.0, ST = 0.75;
      const [x1, y1, w1] = walkTo(t, 0.9, p1t, [36, 104], [70, 63]);
      const [x2, y2, w2] = walkTo(t, 1.3, p2t, [196, 108], [112, 83]);
      const f1 = seg(t, p1t, p1t + ST), f2 = seg(t, p2t, p2t + ST);
      const actors = [
        S.wiz({ id: 'me', x: x1, y: y1, team: 'p1', el: 'fire', face: w1 ? -0.9 : Math.PI / 2, spd: w1, ph: t * 9 }),
        S.wiz({ id: 'p2', x: x2, y: y2, team: 'p2', el: 'life', face: w2 ? Math.PI + 0.6 : Math.PI / 2, spd: w2, ph: t * 9 + 1 }),
      ];
      const stand = alt.map(([x, y, p], i) => [y - 0.5, (c, E) => {
        const fill = i === 0 ? (f1 < 1 ? f1 : 0) : i === 1 ? (f2 < 1 ? f2 : 0) : 0;
        const pips = [];
        if (i === 0 && f1 >= 1) pips.push(TEAM.p1.light);
        if (i === 1 && f2 >= 1) pips.push(TEAM.p2.light);
        altar(c, E, x, y, p, rise, t, fill, i === 0 ? TEAM.p1.light : TEAM.p2.light, pips);
      }]);
      const lights = alt.map(([x, y, p]) => [x, y - 10, 30, (EL[p.ramp] || SIG)[2], 0.5 * rise]);
      return {
        actors, stand, lights,
        fx(c) {
          for (const [x, y, p] of alt) altarGlyph(c, x, y, p, rise, t);
          if (rise > 0.8) for (const [x, y, , n] of alt) label(c, n, x, y - 44, '#ecebf2');
          if (f1 >= 1 && t < p1t + ST + 0.6) burst(c, 70, 63, (t - p1t - ST) / 0.6, SIG);
          if (f2 >= 1 && t < p2t + ST + 0.6) burst(c, 112, 83, (t - p2t - ST) / 0.6, SIG);
          const msg = t < 0.9 ? 'WAVE 1 CLEARED' : f1 < 1 ? 'PICK A POWER-UP' : f2 < 1 ? 'WAITING FOR P2' : t < 5 ? 'BOTH PICKED' : 'WAVE 2 IN ' + Math.max(1, Math.ceil(6 - (t - 5)));
          strip(c, W, msg);
          // badges by the names, top left, as in the game's HUD
          if (f1 >= 1) { X.rect(c, 3, 14, 9, 9, '#0a0810'); X.rect(c, 3, 14, 9, 1, FIRE[3]); glyph(c, SR.G.FIRE, 4, 15, FIRE[1]); X.text(c, 'P1', 14, 16, TEAM.p1.light, OUT); }
          if (f2 >= 1) { X.rect(c, 3, 25, 9, 9, '#0a0810'); X.rect(c, 3, 25, 9, 1, LIFE[3]); glyph(c, SR.G.BLOOM, 4, 26, LIFE[1]); X.text(c, 'P2', 14, 27, TEAM.p2.light, OUT); }
          seam(c, W, 128, t, this.dur);
        },
        dur: 7.5,
      };
    },
  };

  // ---------- rally ----------
  const rally = {
    id: 'rally', w: 224, h: 128, dur: 9.4, ground: 'grass', seed: 5,
    frame(t) {
      const W = 224, D = [132, 80], R0 = 1.6 * PPU;
      const up = smooth(seg(t, 7.0, 7.45)); // P2 gets up
      const [px, py, pw] = walkTo(t, 0.3, 1.4, [34, 86], [108, 82]);
      // the goblin comes in from the upper right, swings at 2.5, is burned down by 3.3
      const gs = [214, 44], gTo = [118, 72];
      const [gx, gy, gw] = walkTo(t, 0.9, 2.4, gs, gTo);
      const gDead = smooth(seg(t, 3.15, 3.5)), gFade = 1 - seg(t, 3.9, 4.3);
      const hitT = 2.5, castT = 2.75, arrive = 3.05;
      const ringA = t >= 1.4 && t < hitT ? (t - 1.4) / 3 : 0;
      const ringB = t >= 3.9 && t < 6.9 ? (t - 3.9) / 3 : 0;
      const fill = Math.min(1, ringA || ringB);
      const pose = S.pose(t, castT - 0.15, castT, castT + 0.12);
      const actors = [
        S.wiz({ id: 'me', x: px, y: py, team: 'p1', el: 'fire', face: t > 2.3 && t < 3.4 ? S.faceTo([px, py], [gx, gy]) : pw ? 0 : 0.05, spd: pw, ph: t * 9, prep: pose.prep, cast: pose.cast, flash: Math.max(0, 1 - (t - hitT) / 0.25) * (t >= hitT ? 1 : 0) }),
        S.wiz({ id: 'p2', x: D[0], y: D[1], team: 'p2', el: 'life', face: Math.PI * 0.95, dead: 0.85 * (1 - up), fallSide: 1 }),
      ];
      if (gFade > 0.02) actors.push(S.gob({ id: 'gob', x: gx, y: gy, face: S.faceTo([gx, gy], [px, py]), spd: gw, ph: t * 11, seed: 1, swing: t > 2.25 && t < 2.7 ? (t - 2.25) / 0.45 : -1, burn: t > arrive ? 1 : 0, dead: gDead, alpha: gFade, flash: t > arrive && t < arrive + 0.2 ? 1 : 0 }));
      const lights = [[D[0], D[1], 40, LIFE[2], 0.25 + 0.5 * fill + 0.8 * Math.max(0, 1 - Math.abs(t - 7.0) / 0.5)]];
      if (t > arrive && gFade > 0) lights.push([gx, gy, 26, FIRE[2], 0.6]);
      return {
        actors, lights,
        under(c) {
          // where to stand: the rally range, a slow dashed ring (only while P2 is down)
          if (up < 0.5) for (let k = 0; k < 16; k++) { const a0 = (k / 16) * TAU + t * 0.4; X.ring(c, D[0], D[1], R0, R0 * FY, LIFE[2], 0.55, a0, a0 + TAU / 32); }
          if (fill > 0) {
            const rr = 15;
            X.ellipse(c, D[0], D[1], rr, rr * FY, LIFE[3], 0.15 + 0.2 * fill);
            for (let k = -1; k <= 1; k++) X.ring(c, D[0], D[1], rr + k, (rr + k) * FY, '#1a1726', 0.7);
            for (let k = -1; k <= 1; k++) X.ring(c, D[0], D[1], rr + k, (rr + k) * FY, TEAM.p1.light, 1, -Math.PI / 2, -Math.PI / 2 + fill * TAU);
          }
        },
        fx(c, A) {
          const head = A.p2 && A.p2.head ? A.p2.head : [D[0], D[1] - 10];
          // motes from the rescuer to the fallen
          if (fill > 0) for (let i = 0; i < 5; i++) { const q = PB.mod(t * 1.3 + i / 5, 1), x = lerp(px + 3, D[0], q), y = lerp(py - 10, D[1] - 4, q) - Math.sin(q * Math.PI) * 6; X.px(c, x, y, LIFE[i % 2 ? 0 : 1]); }
          if (ringB > 0) label(c, 'RALLY', D[0], D[1] - 26 - Math.round(Math.sin(t * 4)), LIFE[1]);
          // the goblin's club: a white slash on P1
          if (t > hitT - 0.08 && t < hitT + 0.16) X.ring(c, px + 3, py - 10, 8, 6, '#ffffff', 1, -0.6, 1.4);
          // the break: the ring snaps into shards
          if (t >= hitT && t < hitT + 0.7) {
            const e = (t - hitT) / 0.7;
            for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = 15 + e * 14; X.px(c, D[0] + Math.cos(a) * r, D[1] + Math.sin(a) * r * FY + e * 6, i % 2 ? TEAM.p1.light : LIFE[2]); }
            label(c, 'RALLY BROKEN', D[0], D[1] - 30 - e * 4, '#e69191');
          }
          // P1's answer: a fire bolt at the goblin
          bolt(c, px + 6, py - 12, gx, gy - 6, seg(t, castT, arrive));
          if (t > arrive) burst(c, gx, gy, (t - arrive) / 0.4);
          // the revive: a column of Life light, then RALLIED and a 40% health bar
          if (t > 6.85 && t < 7.8) {
            const e = seg(t, 6.85, 7.8), a = 1 - e, w = Math.round(10 * (1 - e * 0.6));
            c.save(); c.globalAlpha = a; X.rect(c, D[0] - w / 2, 0, w, D[1], LIFE[1]); X.rect(c, D[0] - w / 4, 0, Math.max(1, w / 2), D[1], LIFE[0]); c.restore(); c._fs = null;
            for (let i = 0; i < 10; i++) { const q = PB.mod(i / 10 + e, 1); X.px(c, D[0] + (rand(i, 3) - 0.5) * 22, D[1] - q * 40, LIFE[i % 2]); }
          }
          if (t > 7.0) { label(c, 'RALLIED', D[0], head[1] - 20 - seg(t, 7, 8) * 6, LIFE[0]); hpBar(c, head[0], head[1] - 8, 0.4); }
          const msg = t < 1.4 ? 'WAVE 5' : t < hitT ? 'P1 RALLYING P2 ' + Math.floor(fill * 100) + '%' : t < 3.9 ? 'RALLY BROKEN' : ringB > 0 ? 'P1 RALLYING P2 ' + Math.floor(fill * 100) + '%' : 'P2 IS BACK';
          strip(c, W, msg, t >= hitT && t < 3.9 ? '#e69191' : '#ecebf2');
          seam(c, W, 128, t, this.dur);
        },
        dur: 9.4,
      };
    },
  };

  // ---------- echo (redesigned 2026-11-06: every spell goes off twice for one wave, free) ----------
  const echo = {
    id: 'echo', w: 224, h: 128, dur: 8.5, ground: 'grass', seed: 8,
    frame(t) {
      const W = 224, me = [62, 82], D = 0.4; // PERKS.echoDelay
      const on = smooth(seg(t, 0.3, 0.9)) * (1 - smooth(seg(t, 5.6, 6.3))); // Echo's violet ring at your feet, while it lasts
      // two goblins: A from the upper right, B from the lower right
      const [ax, ay, aw] = walkTo(t, 1.0, 2.6, [226, 50], [150, 62]);
      const [bx, by, bw] = walkTo(t, 1.2, 3.6, [226, 112], [128, 96]);
      // cast 1 at A; you turn to B, so its echo (0.4 s later, along your aim then) goes to B. Cast 2 at B, and its echo.
      const c1 = 2.2, c2 = 3.4, fly = 0.3;
      const e1 = c1 + D, e2 = c2 + D;
      const aim = t < c1 + 0.2 ? [ax, ay] : [bx, by];
      const aDead = smooth(seg(t, c1 + fly, c1 + fly + 0.35)), aFade = 1 - seg(t, c1 + fly + 0.8, c1 + fly + 1.2);
      const bDead = smooth(seg(t, e2 + fly, e2 + fly + 0.35)), bFade = 1 - seg(t, e2 + fly + 0.8, e2 + fly + 1.2);
      const pose = t < 2.9 ? S.pose(t, c1 - 0.15, c1, c1 + 0.12) : S.pose(t, c2 - 0.15, c2, c2 + 0.12);
      const actors = [S.wiz({ id: 'me', x: me[0], y: me[1], team: 'p1', el: 'fire', face: t > 1.9 && t < 4.6 ? S.faceTo(me, aim) : 0.2, prep: pose.prep, cast: pose.cast })];
      if (aFade > 0.02) actors.push(S.gob({ id: 'ga', x: ax, y: ay, face: S.faceTo([ax, ay], me), spd: aw, ph: t * 11, seed: 0, burn: t > c1 + fly ? 1 : 0, dead: aDead, alpha: aFade }));
      if (bFade > 0.02) actors.push(S.gob({ id: 'gb', x: bx, y: by, face: S.faceTo([bx, by], me), spd: bw, ph: t * 11 + 2, seed: 2, burn: t > e1 + fly ? 1 : 0, dead: bDead, alpha: bFade, flash: (t > c2 + fly && t < c2 + fly + 0.15) || (t > e1 + fly && t < e1 + fly + 0.15) ? 1 : 0 }));
      const lights = [[me[0], me[1] - 6, 30, SIG[2], 0.35 * on]];
      return {
        actors, lights,
        under(c) { seal(c, me[0], me[1], t, 0.9 * on); },
        fx(c) {
          if (t > 0.3 && t < 1.6) label(c, 'ECHO', me[0], me[1] - 34, SIG[1]);
          const from = [me[0] + 6, me[1] - 12];
          // your bolts (fire), and their echoes: the same bolt, rimmed in violet, from where you stand along your aim then
          bolt(c, from[0], from[1], ax, ay - 6, seg(t, c1, c1 + fly));
          bolt(c, from[0], from[1], bx, by - 6, seg(t, c2, c2 + fly));
          for (const [e, tx, ty] of [[e1, bx, by], [e2, bx, by]]) {
            const q = seg(t, e, e + fly);
            if (q > 0 && q < 1) X.glow(c, lerp(from[0], tx, q), lerp(from[1], ty - 6, q), 7, SIG[2], 0.8);
            bolt(c, from[0], from[1], tx, ty - 6, q);
            if (t > e && t < e + 0.45) { const k = (t - e) / 0.45; X.ring(c, me[0], me[1], 4 + k * 12, (4 + k * 12) * FY * 0.6, SIG[1], 1 - k); }
            if (t > e && t < e + 0.9) label(c, 'ECHO  FREE', me[0], me[1] + 8, SIG[1]);
            if (t > e + fly) burst(c, tx, ty, (t - e - fly) / 0.4);
          }
          if (t > c1 + fly) burst(c, ax, ay, (t - c1 - fly) / 0.4);
          if (t > c2 + fly) burst(c, bx, by, (t - c2 - fly) / 0.4);
          // the wave is cleared: Echo ends, its ring fading in violet sparks
          if (t > 5.6 && t < 6.6) for (let i = 0; i < 12; i++) { const q = PB.mod(i / 12 + (t - 5.6) * 0.9, 1); X.px(c, me[0] + (rand(i, 7) - 0.5) * 18, me[1] - 2 - q * 24, SIG[i % 3]); }
          const msg = t < 1.0 ? 'ECHO PICKED (WAVE 5: A KEY WAVE)' : t < 5.5 ? 'WAVE 5  ECHO: YOUR SPELLS GO OFF TWICE' : 'WAVE 5 CLEARED: ECHO ENDS';
          strip(c, W, msg);
          seam(c, W, 128, t, this.dur);
        },
        dur: 8.5,
      };
    },
  };

  // ---------- the arena map: top down, 4 art px per unit ----------
  const K4 = 4, MW = 48 * K4 + 8, MH = 34 * K4 + 8;
  const mx = (x) => MW / 2 + x * K4, my = (y) => MH / 2 + y * K4;
  const mirrored = (segs, fx, fy) => { const o = []; for (const [a, b, c2, d] of segs) { o.push([a, b, c2, d]); if (fx) o.push([-a, b, -c2, d]); if (fy) o.push([a, -b, c2, -d]); if (fx && fy) o.push([-a, -b, -c2, -d]); } return o; };
  // world.ts SURVIVE_ROCK (2026-11-05)
  const ROCK = [
    ...mirrored([[-8.5, -1.8, -8.5, -3.6], [-8.5, -3.6, -6.2, -6], [-6.2, -6, -1.8, -6]], true, true),
    [-5.2, -0.8, -5.2, 0.8], [5.2, -0.8, 5.2, 0.8],
    ...mirrored([[-18.5, -2.2, -11.5, -2.2], [-18.5, 2.2, -11.5, 2.2]], true, false),
    ...mirrored([[-24.4, -5.4, -20.8, -1.5], [-24.4, 5.4, -20.8, 1.5]], true, false),
    ...mirrored([[-15.6, -17.4, -13.4, -13.6], [-8.4, -17.4, -10.6, -13.6]], true, true),
    [-2.2, -10.5, 2.2, -10.5], [-2.2, 10.5, 2.2, 10.5],
    ...mirrored([[-19, -10, -16.5, -10], [-19, -10, -19, -8]], true, true),
  ];
  const GATES = [[-23, 0], [23, 0], [-12, -15.8], [12, -15.8], [-12, 15.8], [12, 15.8]];
  const ALTARS = [[-2.6, -0.4], [0, 2.1], [2.6, -0.4]];
  // one loop, compressed: wave 0-6, breather 6-7.5, pick 7.5-11.5, lull 11.5-15
  const PH = [['wave', 0, 6], ['breather', 6, 7.5], ['pick', 7.5, 11.5], ['lull', 11.5, 15]];
  const phaseAt = (t) => (PH.find(([, a, b]) => t >= a && t < b) || PH[0])[0];
  const OPEN = [0, 3, 5]; // the gates this wave comes from: far from the wizards and from each other
  const DOORS = { 0: [-8.5, 0], 1: [8.5, 0], 2: [-2, -6], 3: [2, -6], 4: [-2, 6], 5: [2, 6] };
  let mapGround = null;
  function mapFloor() {
    if (mapGround) return mapGround;
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    X.rect(c, 0, 0, MW, MH, '#1a2a20');
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const wx = (x - MW / 2) / K4, wy = (y - MH / 2) / K4, r = rand(x, y, 11);
      const inArena = Math.abs(wx) <= 24 && Math.abs(wy) <= 17;
      if (!inArena) continue;
      const keep = Math.abs(wx) < 8.5 && Math.abs(wy) < 6, cause = Math.abs(wy) < 2.2 && Math.abs(wx) < 18.5;
      const paved = keep || cause || rand(Math.floor(wx / 1.5), Math.floor(wy / 1.5), 12) > 0.62;
      let col;
      if (paved) { const edge = (x % 6 === 0) || (y % 5 === 0); col = edge ? '#3a4036' : r < 0.5 ? '#4f5849' : '#5a6252'; }
      else col = r < 0.3 ? '#2c4b36' : r < 0.8 ? '#35573c' : '#3f6443';
      X.px(c, x, y, col);
    }
    mapGround = cv; return cv;
  }
  const arena = {
    id: 'arena', w: MW, h: MH, dur: 15, map: true, phaseAt, PH,
    draw(c, t) {
      c._fs = null;
      c.drawImage(mapFloor(), 0, 0);
      X.rect(c, 3, 3, MW - 6, 1, '#120e1a'); X.rect(c, 3, MH - 4, MW - 6, 1, '#120e1a'); X.rect(c, 3, 3, 1, MH - 6, '#120e1a'); X.rect(c, MW - 4, 3, 1, MH - 6, '#120e1a');
      const ph = phaseAt(t);
      // portals: open in the lull and the wave (and the pick, which shows the next wave)
      const portalsOn = ph !== 'breather' && !(ph === 'wave' && t > 4.2);
      GATES.forEach(([gx, gy], k) => {
        const open = portalsOn && OPEN.includes(k), p = 0.5 + 0.5 * Math.sin(t * 5 + k);
        X.ellipse(c, mx(gx), my(gy), 4, 3, open ? SIG[3] : '#2a2539');
        if (open) { X.ellipse(c, mx(gx), my(gy), 2.5 + p, 1.5 + p * 0.6, SIG[1]); X.glow(c, mx(gx), my(gy), 9, SIG[2], 0.35); }
      });
      // rock: old mossy grey, drawn 3 px thick with a lit top edge
      for (const [x1, y1, x2, y2] of ROCK) {
        X.line(c, mx(x1) + 1, my(y1) + 1, mx(x2) + 1, my(y2) + 1, '#1a1a20', 3);
        X.line(c, mx(x1), my(y1), mx(x2), my(y2), '#5c5c66', 3);
        X.line(c, mx(x1), my(y1) - 1, mx(x2), my(y2) - 1, '#8a8a94', 1);
      }
      // altars rise in the pick
      const rise = ph === 'pick' ? Math.min(smooth(seg(t, 7.5, 8.1)), 1 - smooth(seg(t, 11, 11.5))) : 0;
      const AR = ['fire', 'life', 'shield'];
      if (rise > 0.05) ALTARS.forEach(([x, y], i) => { X.rect(c, mx(x) - 2, my(y) - 2, 5, 5, '#6a6a74'); X.rect(c, mx(x) - 1, my(y) - 1 - Math.round(rise * 2), 3, 3, EL[AR[i]][1]); X.glow(c, mx(x), my(y) - 2, 6, EL[AR[i]][2], 0.4 * rise); });
      // the wizards: holding the keep in the wave, walking to an altar in the pick
      const w1 = ph === 'pick' ? [lerp(-2, -2.6, smooth(seg(t, 8, 9))), lerp(1, -0.4, smooth(seg(t, 8, 9)))] : [-2, 1];
      const w2 = ph === 'pick' ? [lerp(2, 0, smooth(seg(t, 8.3, 9.6))), lerp(1, 2.1, smooth(seg(t, 8.3, 9.6)))] : [2, 1];
      const dot = (p, col, lt) => { X.rect(c, mx(p[0]) - 2, my(p[1]) - 2, 5, 5, OUT); X.rect(c, mx(p[0]) - 1, my(p[1]) - 1, 3, 3, col); X.px(c, mx(p[0]) - 1, my(p[1]) - 1, lt); };
      // enemies: one every 0.45 s from each open portal (portals 1 s apart), walking to the nearest door; they fall there
      if (ph === 'wave') {
        OPEN.forEach((g, pi) => {
          for (let n = 0; n < 5; n++) {
            const t0 = 0.2 + pi * 1 * 0.6 + n * 0.45 * 0.9, travel = 2.6, q = (t - t0) / travel;
            if (q < 0 || q > 1.15) continue;
            const [gx, gy] = GATES[g], [dx, dy] = DOORS[g];
            const k = Math.min(1, q), x = lerp(gx, dx * 1.35, k), y = lerp(gy, dy * 1.5, k);
            if (q > 1 && Math.floor(t * 12) % 2) continue; // falling: a blink
            X.rect(c, mx(x) - 1, my(y) - 1, 3, 3, OUT); X.px(c, mx(x), my(y), q > 1 ? '#e05a5a' : '#8cc04a');
          }
        });
        // casts: short flashes from the wizards toward the doors
        for (let i = 0; i < 4; i++) { const tt = PB.mod(t * 1.6 + i * 0.25, 1); if (tt < 0.3) { const from = i % 2 ? w2 : w1, to = DOORS[OPEN[i % 3]]; X.px(c, mx(lerp(from[0], to[0], tt / 0.3)), my(lerp(from[1], to[1], tt / 0.3)), FIRE[1]); } }
      }
      if (ph === 'breather') { const k = seg(t, 6, 6.6); X.ring(c, mx(w2[0]), my(w2[1]), 3 + k * 6, 3 + k * 6, LIFE[1], 1 - k); }
      dot(w1, TEAM.p1.main, TEAM.p1.light); dot(w2, TEAM.p2.main, TEAM.p2.light);
      if (ph === 'pick') {
        if (t > 9.75) X.rect(c, mx(-2.6) - 1, my(-0.4) + 3, 3, 1, TEAM.p1.light);
        if (t > 10.35) X.rect(c, mx(0) - 1, my(2.1) + 3, 3, 1, TEAM.p2.light);
      }
      // the strip
      const msg = ph === 'wave' ? 'WAVE 4' : ph === 'breather' ? 'CLEARED: BREATHER 3S' : ph === 'pick' ? (t < 9.75 ? 'PICK A POWER-UP' : t < 10.35 ? 'WAITING FOR P2' : 'BOTH PICKED') : 'WAVE 5 IN ' + Math.max(1, Math.ceil(6 * (1 - seg(t, 11.5, 15))));
      strip(c, MW, msg);
      // labels
      const tag = (s, x, y) => X.text(c, s, Math.round(mx(x) - tw(s) / 2), Math.round(my(y)), '#cfcadc', OUT);
      tag('KEEP', 0, -4.6); tag('CAUSEWAY', -15, 3.2); tag('GATE', -21, 6.6); tag('FIELD', 15, -7.5);
    },
  };

  PB.SRV = { pick, rally, echo, arena };
  PB.SRV.list = [pick, rally, echo];
})();
