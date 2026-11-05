/* Copied from tools/art-pixel-hd/actors.js (2026-11-04) for the Spell VFX gallery. Spell VFX
 * additions: s.chill (icy tint + rime on top edges, crystal spikes when heavy), s.tint/tintK,
 * s.outline (a glowing outline colour), s.skin (a shimmering energy skin round the
 * silhouette), a white outline on alternate frames while shocked, the faint hit flicker, and
 * (pass 6) body-shaped ice for s.frozen (frozenBody(), exported) instead of the cube.
 * Pixel Battlefield: procedural character rigs. No sprite sheets: each character is a
 * handful of parts placed in its own local 3D frame (f = forward, r = right, u = up),
 * rotated by its facing angle and projected with the camera's foreshortening. That
 * gives every direction for free, including back views, and lets walk cycles, robe
 * sway, hat lag, squash and stretch, knockback and status effects all be functions
 * of the actor's state instead of drawn frames.
 *
 * Each actor is drawn into two small scratch canvases (colour and emissive), then
 * outlined and blitted into the frame. Emissive pixels (eyes, staff orbs, conjured
 * glow) skip the light map. */
(function () {
  'use strict';
  const PB = window.PB, { FY, CU, TAU, clamp, lerp, seg, smooth, rand } = PB, X = PB.px;
  const SW = 88, SH = 88, AX = 44, AY = 70, CPU = { willReadFrequently: true };
  const mk = () => { const c = document.createElement('canvas'); c.width = SW; c.height = SH; return c; };
  const SC = mk(), SE = mk(), SIL = mk(), SK = mk();
  const sc = SC.getContext('2d', CPU), se = SE.getContext('2d', CPU), sil = SIL.getContext('2d', CPU), skc = SK.getContext('2d', CPU);
  const OUTLINE = '#120e1a';
  const SKIN = { main: '#e8b796', dark: '#b8806a' };
  const HAIR = { main: '#dcd8e6', dark: '#a6a2b8' };
  const GOB = [
    { main: '#7aa83a', light: '#a4cc5a', dark: '#4e7228', deep: '#2e4a1c' },
    { main: '#86a034', light: '#b0c452', dark: '#566a22', deep: '#34421a' },
    { main: '#6a9e48', light: '#94c266', dark: '#466a30', deep: '#28421e' },
    // (pass 7, from the game's rigs.ts) 3: the fire imp (red skin, hot), 4: the grabber (grey-green,
    // long arms), 5: the shieldbearer (dark, armoured). Pick them with s.pal.
    { main: '#c8442a', light: '#f07a3a', dark: '#7e2218', deep: '#4a1210' },
    { main: '#6a8a6e', light: '#94b498', dark: '#425a46', deep: '#263a2a' },
    { main: '#5a7a3a', light: '#80a058', dark: '#3a5226', deep: '#22341a' },
  ];
  const BRUTE = { main: '#8a7aa6', light: '#b2a4cc', dark: '#584a74', deep: '#342a4a', belly: '#c4b4d0' };

  // tint every colour of a status-affected actor
  // (Spell VFX: s.chill tints the body icy blue; s.tint / s.tintK tints it any colour)
  function tinter(s) {
    return (col) => {
      if (s.burn > 0) col = X.mix(col, '#3a1410', 0.4 * s.burn);
      if (s.wet > 0) col = X.mix(col, '#1a3266', 0.32 * s.wet);
      if (s.chill > 0) col = X.mix(col, '#9cdcff', 0.42 * s.chill);
      if (s.tint) col = X.mix(col, s.tint, s.tintK == null ? 0.35 : s.tintK);
      return col;
    };
  }
  function frame(s) {
    const cs = Math.cos(s.face), sn = Math.sin(s.face);
    const fall = s.dead || 0;
    const kx = (1 + 0.24 * s.sq) * (1 + 0.35 * fall), ku = (1 - 0.24 * s.sq) * (1 - 0.6 * fall);
    // falling over topples the body sideways on screen (top rows shift most)
    const side = s.fallSide || (s.seed & 1 ? 1 : -1), tip = fall * fall * 0.85 * side;   // (deaths: s.fallSide topples along the blow)
    const P = (f, r, u) => {
      // height is drawn at CU px per unit: a little squat under the steep camera, but
      // taller than a true projection so characters still read
      const fx = f * cs - r * sn, fy = f * sn + r * cs, uu = u * CU;
      return [AX + fx * kx + uu * tip, AY + fy * FY - uu * ku, fy];
    };
    return { cs, sn, kx, ku, P };
  }
  const visible = (sn, cs, f, r) => f * sn + r * cs > -0.25;

  // A filled body built from rows: prof(u) -> half width; shaded light/main/dark across.
  function bodyRows(c, P, u0, u1, prof, off, cols, T, extra) {
    for (let u = u0; u <= u1; u++) {
      const [cx, cy] = P(off ? off(u) : 0, 0, u), hw = prof(u);
      if (hw <= 0) continue;
      const xa = Math.round(cx - hw), xb = Math.round(cx + hw), yy = Math.round(cy);
      // merge same-colour pixels into one span per run
      let run = xa, runCol = null;
      for (let x = xa; x <= xb + 1; x++) {
        let col = null;
        if (x <= xb) {
          const k = (x - xa) / Math.max(1, xb - xa);
          col = k < 0.26 ? cols.light : k > 0.74 ? cols.dark : cols.main;
          if (extra) col = extra(u, x, k, col) || col;
          col = T(col);
        }
        if (col !== runCol) { if (runCol) X.rect(c, run, yy, x - run, 1, runCol); run = x; runCol = col; }
      }
    }
  }

  // ======================================================================
  // Wizard
  // ======================================================================
  function hammerAngle(sw) {
    // windup (raise behind) -> strike (fast arc down in front) -> recover
    if (sw < 0) return 1.9;
    if (sw < 0.4) return lerp(1.9, 2.6, smooth(sw / 0.4));
    if (sw < 0.52) return lerp(2.6, -0.7, (sw - 0.4) / 0.12);
    return lerp(-0.7, 1.9, smooth(seg(sw, 0.62, 1)));
  }
  function drawWizard(s, t, out, S) {
    const pal = X.TEAM[s.team], T = tinter(s), { cs, sn, kx, P } = frame(s);
    const walk = Math.min(1, s.spd), cast = s.cast || 0, prep = s.prep || 0;
    const bob = Math.abs(Math.sin(s.ph)) * 1.3 * walk + Math.sin(t * 2.6 + s.seed) * 0.35 * (1 - walk);
    const st = Math.sin(s.ph) * 3.4 * walk;
    const lift = (k) => Math.max(0, Math.cos(s.ph + k)) * 1.8 * walk;
    // feet
    const fl = P(st, -2, lift(0)), fr = P(-st, 2, lift(Math.PI));
    for (const f of fl[2] < fr[2] ? [fl, fr] : [fr, fl]) { X.rect(sc, f[0] - 1, f[1] - 1, 3, 2, '#2a2030'); X.px(sc, f[0] - 1, f[1] - 1, '#4a3a4a'); }
    // arms: shoulder -> hand. Poses: idle, prep (gathering: staff held up in front, the
    // off hand cupped under the orb), cast (staff thrust forward).
    const weapon = s.weapon || 0, sw = s.swing;
    const idleL = [0.8 - st * 0.5, -4.3, 6.6 + bob], idleR = [0.8 + st * 0.5, 4.3, 6.6 + bob];
    const prepL = [3.6, -2.6, 9.6 + bob], prepR = [2.8, 3.4, 15.6 + bob];
    const castL = [5.2, -1.6, 9.6 + bob], castR = [7.4, 1.7, 9.8 + bob];
    const pose = (a, b, c) => a.map((v, i) => lerp(lerp(v, b[i], prep * (1 - cast)), c[i], cast));
    let hL = pose(idleL, prepL, castL), hR = pose(idleR, prepR, castR);
    let ha = null;
    if (weapon > 0) {
      ha = hammerAngle(sw);
      const grip = [Math.cos(ha) * 4 + 1.5, 0.8, 10 + Math.sin(ha) * 4 + bob];
      hL = hL.map((v, i) => lerp(v, [grip[0] - 0.6, -0.6, grip[2] - 0.5][i], weapon));
      hR = hR.map((v, i) => lerp(v, grip[i], weapon));
    }
    const arm = (side, h) => {
      const sh = P(0, side * 3.4, 11.4 + bob), hp = P(...h);
      X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark), 2);
      X.px(sc, hp[0], hp[1] - 1, T(pal.trim));
      X.rect(sc, hp[0] - 0.5, hp[1] - 0.5, 2, 2, T(SKIN.main));
      return hp;
    };
    const armDepth = (h) => P(...h)[2];
    // staff (or the conjured hammer). In prep the staff is held upright in front of the chest.
    const g = prep * (1 - cast);
    // in prep the staff is raised high so the gathering charge sits above the hat
    // (pass 4: the cast holds the staff out in front along the aim, nearly level, not raised)
    const staffBot = [lerp(lerp(hR[0], 2.6, g), 1.0, cast), lerp(4.6, 3.0, g) - 0.8 * cast, lerp(lerp(-0.5, 7, g), 7, cast)];
    const staffTop = [lerp(lerp(hR[0] + 0.2, 3.4, g), 12.5, cast), lerp(lerp(4.7, 3.4, g), 1.8, cast), lerp(lerp(21.5 + bob * 0.6, 30 + bob, g), 12.5 + bob, cast)];
    const drawStaff = () => {
      if (weapon > 0.5) return;
      const b = P(...staffBot), a = P(...staffTop);
      X.line(sc, b[0], b[1], a[0], a[1], '#7a5034'); X.px(sc, a[0], a[1] + 1, '#a8784a');
      const orb = X.EL[s.el] || X.EL.arcane;
      X.rect(se, a[0] - 1, a[1] - 2, 3, 3, orb[2]); X.px(se, a[0], a[1] - 2, orb[0]); X.px(se, a[0] - 1, a[1] - 1, orb[1]);
      out.tip = [a[0], a[1] - 1];
    };
    const drawHammer = () => {
      if (weapon <= 0) return;
      const gp = P(...hR), L = 12 * weapon;
      const headAt = (a2) => P(hR[0] + Math.cos(a2) * L, hR[1] - 0.6, hR[2] + Math.sin(a2) * L);
      // motion smear through the strike: a solid arc, white at the head fading to violet
      if (sw > 0.36 && sw < 0.68) {
        let prev = headAt(ha);
        for (let k = 1; k <= 12; k++) {
          const hp = headAt(hammerAngle(Math.max(0.36, sw - k * 0.012)));
          X.line(se, prev[0], prev[1], hp[0], hp[1], k < 4 ? '#ffffff' : k < 8 ? '#e0c8ff' : '#8a5af0', k < 6 ? 3 : 2);
          prev = hp;
        }
      }
      const head = headAt(ha);
      X.line(sc, gp[0], gp[1], head[0], head[1], '#3a2e48', 2);
      // conjured stone head: chunky, outlined, with glowing violet runes
      const hw = 4, hh = 3;
      X.rect(sc, head[0] - hw - 1, head[1] - hh - 1, hw * 2 + 3, hh * 2 + 3, OUTLINE);
      X.rect(sc, head[0] - hw, head[1] - hh, hw * 2 + 1, hh * 2 + 1, '#6a5a74');
      X.rect(sc, head[0] - hw, head[1] - hh, hw * 2 + 1, 2, '#9a8aa6');
      X.rect(sc, head[0] - hw, head[1] + hh - 1, hw * 2 + 1, 2, '#463a54');
      X.px(se, head[0] - 2, head[1], '#e0c8ff'); X.px(se, head[0] + 2, head[1], '#e0c8ff'); X.px(se, head[0], head[1] - 1, '#ffffff'); X.px(se, head[0], head[1] + 1, '#c4a4ff');
      for (let i = 0; i < 7; i++) { const a = t * 7 + i * 0.9; if (rand(i, Math.floor(t * 12)) < 0.7) X.px(se, head[0] + Math.cos(a) * 7, head[1] + Math.sin(a) * 5, i % 2 ? '#c4a4ff' : '#8a5af0'); }
      out.hammer = [head[0], head[1]];
    };
    const back = [], front = [];
    (armDepth(hL) < -0.2 ? back : front).push(() => arm(-1, hL));
    (armDepth(hR) < -0.2 ? back : front).push(() => { arm(1, hR); drawStaff(); drawHammer(); });
    back.forEach((f) => f());
    // robe: a bell, with a cape panel down the back and a trim seam down the front
    const sway = (u) => (-(s.vx || 0) * 0.03 + Math.sin(s.ph) * 0.8 * walk) * Math.pow(clamp((12 - u) / 11, 0, 1), 1.5);
    const prof = (u) => (u > 10 ? 3.1 - (u - 10) * 0.45 : 3.3 + (10 - u) * 0.3) * kx;
    const frontVis = sn > -0.3, seamX = cs;
    bodyRows(sc, (f, r, u) => { const p = P(f, r, u + bob); return [p[0] + sway(u), p[1]]; }, 1, 12, prof, null,
      { light: pal.light, main: pal.main, dark: pal.dark }, T,
      (u, x, k, col) => {
        if (u <= 1) return pal.deep;
        if (u <= 2.5) return k < 0.3 ? pal.trim : X.mix(pal.trim, pal.dark, 0.35);
        if (u === 7) return k > 0.42 && k < 0.6 && frontVis ? pal.trim : pal.deep;    // belt
        if (frontVis && u > 2 && u < 12 && Math.abs(k - (0.5 + seamX * 0.36)) < 0.08) return pal.trim;
        // the cape covers the back: from behind it is a deep panel with a lit edge
        const backK = 0.5 - seamX * 0.42;
        if (sn < 0.35 && u >= 3 && Math.abs(k - backK) < 0.26 * clamp(0.35 - sn, 0, 1) * 2.2) return Math.abs(k - backK) > 0.2 ? pal.dark : pal.deep;
        return null;
      });
    // shoulders seen from above: a mantle in trim colour
    const sh = P(0.3, 0, 11.4 + bob);
    X.ellipse(sc, sh[0], sh[1], 3.6 * kx, 2.2, T(pal.dark));
    X.ellipse(sc, sh[0] - 0.5, sh[1] - 0.5, 2.6 * kx, 1.4, T(X.mix(pal.trim, pal.main, 0.4)));
    // head: hood from behind; face and beard from the front and side
    const hc = P(0.2, 0, 14.4 + bob);
    X.ellipse(sc, hc[0], hc[1], 3 * kx, 2.6, T(pal.dark));
    if (sn > -0.5) {
      const fc = P(2.3, 0, 13.6 + bob);
      X.ellipse(sc, fc[0], fc[1], 2.5 * kx, 2.0, T(SKIN.main));
      X.px(sc, fc[0] + 1, fc[1] + 1, T(SKIN.dark));
      for (const r of [-1.2, 1.2]) if (visible(sn, cs, 2.7, r)) { const e = P(3.2, r, 14.2 + bob); X.px(sc, e[0], e[1], '#1a1420'); }
      const nose = P(4.0, 0, 13.6 + bob); if (Math.abs(cs) > 0.5) X.px(sc, nose[0], nose[1], T(SKIN.dark));
    }
    if (sn > -0.55) {
      // beard: a white wedge on the chest from the front; from the side it juts forward
      const sway2 = Math.sin(t * 3 + s.seed) * 0.4 + sway(6) * 0.6;
      const a = P(2.8, -2.4, 12.6 + bob), b = P(2.8, 2.4, 12.6 + bob), tip = P(4.4, 0, 6.6 + bob);
      X.poly(sc, [a, b, [tip[0] + sway2, tip[1]]], T('#f2f0f6'));
      X.line(sc, (a[0] + b[0]) / 2 + 1, a[1] + 1, tip[0] + sway2 + 0.5, tip[1] - 1, T('#b8b4c8'));
    }
    front.forEach((f) => f());
    // hat, one value darker than the robe so the two read apart from above. The brim
    // is a disc (steep camera) with a light band; the cone stands up and its floppy tip
    // falls back, away from where the wizard faces, and lags behind motion.
    const brim = P(0.2, 0, 19.2 + bob), bry = 3.7;
    X.ellipse(sc, brim[0], brim[1] + 1, 6.8 * kx, bry, T(pal.deep));
    X.ellipse(sc, brim[0], brim[1], 6.5 * kx, bry - 0.5, T(pal.dark));
    X.ellipse(sc, brim[0] - 1.2, brim[1] - 0.7, 4.4 * kx, bry - 1.8, T(pal.main));
    const lagX = -(s.vx || 0) * 0.04 + Math.sin(t * 2.2 + s.seed) * 0.35;
    const lagY = -(s.vy || 0) * 0.02;
    const u0 = 19.6, tipU = 31 - Math.min(2, Math.abs(s.vx || 0) * 0.02) - Math.max(0, s.sq) * 2;
    for (let u = u0; u <= tipU; u += 0.6) {
      const k = (u - u0) / (tipU - u0), e = Math.pow(k, 1.6), fall = k > 0.62 ? (k - 0.62) / 0.38 : 0;
      const c = P(-0.3 - e * 1.6 - fall * fall * 5.5, 0, u + bob - fall * fall * 3);
      const cx = c[0] + lagX * e, cy = c[1] + lagY * e;
      const hw = 3.7 * (1 - k) * kx + 0.45;
      const xa = Math.round(cx - hw), xb = Math.round(cx + hw);
      for (let x = xa; x <= xb; x++) {
        const q = (x - xa) / Math.max(1, xb - xa);
        let col = q < 0.3 ? pal.main : q > 0.72 ? pal.deep : pal.dark;
        if (u < u0 + 1.3) col = q < 0.3 ? pal.trim : X.mix(pal.trim, pal.dark, 0.45);   // hat band
        X.px(sc, x, cy, T(col));
      }
      if (u + 0.6 > tipU) { X.px(sc, Math.round(cx), Math.round(cy), T(pal.light)); out.hatTip = [cx, cy - 1]; }
    }
    // a star on the hat band, on the side that faces the camera
    if (sn > 0.1) { const em = P(3.0, 0, 20.2 + bob); X.px(se, em[0], em[1], pal.trim); }
    out.chest = P(2, 0, 11 + bob); out.head = P(0, 0, 16 + bob); out.hands = [P(...hL), P(...hR)];
    if (!out.tip) { const a = P(...staffTop); out.tip = [a[0], a[1] - 1]; }
    // where a spell gathers while it is being prepared
    out.charge = s.prepKind === 'conjure' ? [(out.hands[0][0] + out.hands[1][0]) / 2 + cs * 2, (out.hands[0][1] + out.hands[1][1]) / 2 - 2] : [out.tip[0], out.tip[1]];
  }

  // ======================================================================
  // Goblin (and archer)
  // ======================================================================
  function drawGoblin(s, t, out, archer) {
    const pal = GOB[s.pal != null ? s.pal % GOB.length : s.seed % 3], T = tinter(s), { cs, sn, kx, P } = frame(s);
    const walk = Math.min(1.2, s.spd), dead = s.dead || 0;
    const bob = Math.abs(Math.sin(s.ph)) * 1.4 * walk + Math.sin(t * 3.4 + s.seed) * 0.3 * (1 - walk);
    const st = Math.sin(s.ph) * 2.6 * walk, lift = (k) => Math.max(0, Math.cos(s.ph + k)) * 1.8 * walk;
    // legs and feet
    for (const side of [-1, 1]) {
      const k = side < 0 ? 0 : Math.PI, f = P(side * st * -1, side * 1.7, lift(k)), hip = P(0, side * 1.6, 4 + bob);
      X.line(sc, hip[0], hip[1], f[0], f[1], T(pal.deep));
      X.rect(sc, f[0] - 1, f[1], 2, 1, '#2a2018');
    }
    const draw = s.draw || 0;
    // arms / weapon / bow
    const arm = (side, h) => { const sh = P(0, side * 3.1, 8.4 + bob), hp = P(...h); X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark)); X.px(sc, hp[0], hp[1], T(pal.main)); return hp; };
    // (pass 7, from the game) the grabber reaches forward with both long arms; the shieldbearer
    // holds its shield out front. s.bare (deaths): the weapon has left its hands, so it isn't drawn.
    const reach = s.variant === 4 ? 1 : 0, guard = s.variant === 5 ? 1 : 0;
    const hL = archer ? [4.6, -0.8, 9 + bob] : reach ? [6.5 + draw * 2, -3, 6 + bob] : guard ? [4.2, -2.2, 6 + bob] : [1 + st * 0.5, -4.2, 5 + bob];
    const hR = archer ? [4.2 - draw * 3.6, 0.6, 9.4 + bob] : reach ? [6.5 + draw * 2, 3, 6 + bob] : [1 - st * 0.5, 4.2, 5 + bob];
    const weapon = () => {
      const hp = P(...hR);
      if (s.bare) return;
      if (archer) {
        const top = P(4.4, -0.8, 14.2 + bob), mid = P(6.0, -0.8, 9 + bob), bot = P(4.4, -0.8, 3.8 + bob), pull = P(4.4 - draw * 3.4, -0.8, 9 + bob);
        X.lines(sc, [top, mid, bot], '#b8844a');
        X.px(sc, top[0], top[1], '#d8a868'); X.px(sc, bot[0], bot[1], '#d8a868');
        X.line(sc, top[0], top[1], pull[0], pull[1], '#d0d0dc'); X.line(sc, pull[0], pull[1], bot[0], bot[1], '#d0d0dc');
        if (draw > 0.05) { const tipA = P(8.6 - draw * 1.2, -0.8, 9 + bob); X.line(sc, pull[0], pull[1], tipA[0], tipA[1], '#e8d8b0'); X.px(sc, tipA[0], tipA[1], '#c0cbdc'); }
        return;
      }
      if (s.variant === 4) { for (const h of [hL, hR]) { const p = P(...h); X.px(sc, p[0] + 1, p[1], '#e8e0c8'); X.px(sc, p[0] + 1, p[1] + 1, '#e8e0c8'); } return; }
      if (s.variant === 3) return;   // the imp fights with its claws
      if (s.variant === 5) {
        // a tall wooden shield with an iron rim and boss, held out in front
        const c0 = P(4.6, -3.6, 1.5 + bob), c1 = P(4.6, 3.6, 1.5 + bob), c2 = P(4.6, 3.6, 12 + bob), c3 = P(4.6, -3.6, 12 + bob);
        if (P(5, 0, 6)[2] > -0.5) {
          X.poly(sc, [c0, c1, c2, c3], T('#6a4a2c'));
          X.lines(sc, [c0, c1, c2, c3, c0], T('#8a8e98'));
          const m = P(4.8, 0, 6.5 + bob); X.rect(sc, m[0] - 1, m[1] - 1, 2, 2, '#c8ccd8'); X.px(sc, m[0] - 1, m[1] - 1, '#ffffff');
        }
        return;
      }
      if (s.variant === 1) { const tp = P(hR[0] + 3.5, hR[1], hR[2] + 1.5); X.line(sc, hp[0], hp[1], tp[0], tp[1], '#c8ccd8'); X.px(sc, tp[0], tp[1], '#ffffff'); return; }
      if (s.variant === 2) { const a = P(hR[0] - 3, hR[1] + 0.5, hR[2] - 4), b = P(hR[0] + 2, hR[1] + 0.5, hR[2] + 12); X.line(sc, a[0], a[1], b[0], b[1], '#8a6a48'); X.rect(sc, b[0] - 0.5, b[1] - 2, 2, 3, '#c8ccd8'); return; }
      const top = P(hR[0] + 1.2, hR[1] + 0.8, hR[2] + 7);
      X.line(sc, hp[0], hp[1], top[0], top[1], '#7a5234', 2); X.rect(sc, top[0] - 1, top[1] - 1, 3, 3, '#5a3a24'); X.px(sc, top[0] - 1, top[1] - 1, '#9a6a44');
    };
    const dL = P(...hL)[2], dR = P(...hR)[2];
    if (dL < -0.3) arm(-1, hL);
    if (dR < -0.3) { arm(1, hR); weapon(); }
    // body
    const prof = (u) => [0, 0, 0, 2.7, 3.3, 3.7, 3.8, 3.7, 3.3, 2.6][Math.round(u)] * kx;
    bodyRows(sc, (f, r, u) => P(f, r, u + bob), 3, 9, prof, null, pal, T, (u, x, k) => {
      if (u <= 4) return k < 0.25 ? '#8a6040' : '#6a4630';
      if (sn > -0.2 && u >= 5 && u <= 7 && Math.abs(k - (0.5 + cs * 0.3)) < 0.22) return pal.light;  // belly
      return null;
    });
    if (archer) bodyRows(sc, (f, r, u) => P(f, r, u + bob), 7, 9, (u) => prof(u) + 0.3, null, { light: '#7a4a5a', main: '#5a3448', dark: '#3e2234' }, T);
    // ears (sorted around the head)
    const head = P(0.6, 0, 11.6 + bob);
    const ear = (side) => {
      const a = P(0, side * 3.2, 12.4 + bob), b = P(-1.6, side * 7.6, 14.2 + bob), c2 = P(0.4, side * 3.2, 10.6 + bob);
      X.poly(sc, [a, b, c2], T(pal.main)); X.px(sc, (a[0] * 2 + b[0]) / 3, (a[1] * 2 + b[1]) / 3 + 0.5, T('#c87a6a'));
    };
    const earBack = P(0, -6, 13)[2] < P(0, 6, 13)[2] ? -1 : 1;
    ear(earBack);
    X.ellipse(sc, head[0], head[1], 3.9 * kx, 3.1, T(pal.main));
    X.rect(sc, head[0] - 2, head[1] - 3, 3, 1, T(pal.light));
    X.rect(sc, head[0] - 3, head[1] + 2, 7, 1, T(pal.dark));
    if (archer) { X.ellipse(sc, head[0] - cs * 0.6, head[1] - 1.5, 4.2 * kx, 2.2, T('#5a3448')); X.px(sc, head[0] - 2, head[1] - 3, T('#7a4a5a')); }
    if (sn > -0.45) {
      const nose = P(4.1, 0, 11.3 + bob); X.px(sc, nose[0], nose[1], T(pal.dark));
      const m = P(3.4, 0, 9.9 + bob); X.px(sc, m[0], m[1], '#2a1a1a'); if (sn > 0.3) X.px(sc, m[0] + 1, m[1], '#f0f0e0');
      for (const r of [-1.4, 1.4]) if (visible(sn, cs, 3, r)) { const e = P(3.1, r, 12.2 + bob), shut = dead > 0.3 || s.eyesShut; X.px(shut ? sc : se, e[0], e[1], shut ? '#1a1420' : s.eyeCol || '#ffe040'); }   // (deaths: s.eyeCol, s.eyesShut)
    }
    ear(-earBack);
    if (s.variant === 3) {
      // the imp: two small horns and a flicker of flame on its crown (emissive: it glows). s.crown
      // (deaths) scales the flame: 0 = out
      for (const r of [-1.6, 1.6]) { const a = P(0.4, r, 14 + bob), b = P(-0.2, r * 1.3, 16.5 + bob); X.line(sc, a[0], a[1], b[0], b[1], '#2a1410'); }
      const cr = P(0, 0, 15.5 + bob), ck = s.crown == null ? 1 : s.crown;
      if (ck > 0.66) { X.px(se, cr[0], cr[1] - 1, '#ffd860'); X.px(se, cr[0] - 1, cr[1], '#ff9a30'); X.px(se, cr[0] + 1, cr[1], '#ff5a20'); }
      else if (ck > 0.25) X.px(se, cr[0], cr[1], '#ff5a20');
    }
    if (dL >= -0.3) arm(-1, hL);
    if (dR >= -0.3) { arm(1, hR); weapon(); }
    out.chest = P(1, 0, 7 + bob); out.head = P(0.6, 0, 12 + bob); out.bowTip = P(8, -0.8, 9 + bob);
    if (reach) out.claws = [P(hL[0] + 1, hL[1], hL[2]), P(hR[0] + 1, hR[1], hR[2])];
    if (guard) out.shield = P(4.8, 0, 6.5 + bob);
  }

  // ======================================================================
  // Brute
  // ======================================================================
  function drawBrute(s, t, out) {
    const pal = BRUTE, T = tinter(s), { cs, sn, kx, P } = frame(s);
    const walk = Math.min(1, s.spd);
    const bob = Math.abs(Math.sin(s.ph)) * 1.8 * walk + Math.sin(t * 2 + s.seed) * 0.5 * (1 - walk);
    const st = Math.sin(s.ph) * 3.6 * walk, lift = (k) => Math.max(0, Math.cos(s.ph + k)) * 2.4 * walk;
    for (const side of [-1, 1]) {
      const k = side < 0 ? 0 : Math.PI, f = P(-side * st, side * 3.6, lift(k)), hip = P(0, side * 3.2, 8 + bob);
      X.line(sc, hip[0], hip[1], f[0], f[1] - 1, T(pal.dark), 3);
      X.rect(sc, f[0] - 2, f[1] - 1, 5, 2, T(pal.deep));
    }
    // arm poses: idle swing, punch, overhead smash
    let hL = [2.5 + st * 0.6, -8.8, 6.5 + bob], hR = [2.5 - st * 0.6, 8.8, 6.5 + bob];
    if (s.punch >= 0) { const p = s.punch < 0.45 ? -smooth(s.punch / 0.45) * 0.6 : s.punch < 0.6 ? lerp(-0.6, 1, (s.punch - 0.45) / 0.15) : lerp(1, 0, smooth(seg(s.punch, 0.6, 1))); hR = [2.5 + p * 8, 6 - p * 2, 8 + p * 6 + bob]; }
    if (s.smash >= 0) {
      const k = s.smash;
      const up = k < 0.5 ? smooth(k / 0.5) : k < 0.6 ? 1 - (k - 0.5) / 0.1 : 0;
      const fwd = k < 0.5 ? -1 * smooth(k / 0.5) : k < 0.6 ? lerp(-1, 7, (k - 0.5) / 0.1) : lerp(7, 2.5, smooth(seg(k, 0.7, 1)));
      const hz = k < 0.6 ? lerp(6.5, 31, up) : lerp(1.5, 6.5, smooth(seg(k, 0.75, 1)));
      hL = [fwd, -2.8 - (1 - up) * 1.5, hz + bob]; hR = [fwd, 2.8 + (1 - up) * 1.5, hz + bob];
    }
    const arm = (side, h) => {
      const sh = P(1.6, side * 6.8, 17.4 + bob), hp = P(...h);
      X.line(sc, sh[0], sh[1], hp[0], hp[1], T(pal.dark), 3); X.line(sc, sh[0] - 1, sh[1], hp[0] - 1, hp[1], T(pal.main), 1);
      X.ellipse(sc, hp[0], hp[1], 2.4, 2, T(pal.main)); X.px(sc, hp[0] - 1, hp[1] - 1, T(pal.light));
    };
    const handsUp = s.smash >= 0 && s.smash < 0.55;
    const dL = P(...hL)[2], dR = P(...hR)[2];
    if (dL < -0.5 && !handsUp) arm(-1, hL);
    if (dR < -0.5 && !handsUp) arm(1, hR);
    // torso, hunched forward
    const PR = [6.2, 7, 7.6, 8, 8.2, 8.2, 8, 7.6, 7.1, 6.4, 5.6, 4.6, 3.4];
    bodyRows(sc, (f, r, u) => P(f, r, u + bob), 7, 20, (u) => (PR[u - 8] || 5.8) * kx, (u) => (u - 8) * 0.18, pal, T, (u, x, k) => {
      if (u <= 9) return k < 0.25 ? '#8a6040' : '#5a3a28';
      if (sn > -0.3 && u >= 10 && u <= 15 && Math.abs(k - (0.5 + cs * 0.28)) < 0.2) return pal.belly;
      return null;
    });
    // head, horns, tusks
    const hc = P(3.4, 0, 21 + bob);
    const horn = (side) => {
      const a = P(2.6, side * 2.8, 22.6 + bob), b = P(1.8, side * 5.4, 25.4 + bob), c2 = P(0.6, side * 5.8, 28 + bob);
      X.lines(sc, [a, b], '#d8ccb0', 2); X.line(sc, b[0], b[1], c2[0], c2[1], '#f0e8d4'); X.px(sc, c2[0], c2[1], '#fffaf0');
    };
    const hb = P(0, -5, 0)[2] < P(0, 5, 0)[2] ? -1 : 1;
    horn(hb);
    X.ellipse(sc, hc[0], hc[1], 3.5 * kx, 2.9, T(pal.main));
    X.rect(sc, hc[0] - 2, hc[1] - 2, 3, 1, T(pal.light));
    if (sn > -0.4) {
      const dead = s.dead > 0.4;
      for (const r of [-1.3, 1.3]) if (visible(sn, cs, 5, r)) {
        const e = P(5.6, r, 21.6 + bob);
        if (dead) { X.px(sc, e[0] - 1, e[1] - 1, '#1a1420'); X.px(sc, e[0] + 1, e[1] + 1, '#1a1420'); X.px(sc, e[0] + 1, e[1] - 1, '#1a1420'); X.px(sc, e[0] - 1, e[1] + 1, '#1a1420'); X.px(sc, e[0], e[1], '#1a1420'); }
        else { X.px(s.eyesShut ? sc : se, e[0], e[1], s.eyesShut ? '#1a1420' : s.eyeCol || '#ffe8a0'); X.px(sc, e[0], e[1] - 1, '#2a1a30'); }   // (deaths: s.eyeCol, s.eyesShut)
      }
      for (const r of [-1.5, 1.5]) if (visible(sn, cs, 5, r)) { const k = P(6, r, 19.2 + bob); X.px(sc, k[0], k[1], '#fffaf0'); X.px(sc, k[0], k[1] - 1, '#fffaf0'); }
    }
    horn(-hb);
    if (dL >= -0.5 || handsUp) arm(-1, hL);
    if (dR >= -0.5 || handsUp) arm(1, hR);
    out.chest = P(3, 0, 14 + bob); out.head = P(3.4, 0, 22 + bob); out.fists = [P(...hL), P(...hR)];
  }

  // ======================================================================
  // Status overlays, flash, fade, outline and blit
  // ======================================================================
  const HEIGHT = { wizard: 23, goblin: 12, archer: 12, brute: 23 };
  const WIDTH = { wizard: 6, goblin: 5, archer: 5, brute: 9 };
  // Frozen (pass 6): ice that follows the body's shape instead of a cube. frozenBody() is a pure
  // function of an alpha mask, so it ports to any renderer: give it the silhouette (solid(x, y)),
  // a colour reader (col(x, y) -> '#rrggbb'), the box size, how far the ice has grown (0..1, from
  // the feet up) and a seed; it returns the pixels to paint, [x, y, colour]:
  //   - the body under the ice: tinted pale blue, rime (white) on every sky-facing pixel
  //   - a shell of clear ice hugging the silhouette: 1 px all round, 2 px below the waist
  //     (ice pools thicker at the base), lit pale on the left, deep blue at the foot, a white
  //     lip on top and a diagonal glint
  //   - a few jagged crystal spikes growing out of the shell, leaning up and outward
  // Deterministic per seed, so the spikes don't crawl from frame to frame.
  function frozenBody(solid, col, w, h, grow, seed) {
    const out = [], B = new Uint8Array(w * h);
    let top = h, bot = -1, sx = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) { B[y * w + x] = 1; top = Math.min(top, y); bot = Math.max(bot, y); sx += x; n++; }
    if (!n) return out;
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && B[y * w + x] === 1;
    const cx = sx / n, mid = (top + bot) / 2, yk = bot + 2 - (bot - top + 5) * clamp(grow, 0, 1);
    // the shell: every empty pixel within reach of the body
    const S = new Uint8Array(w * h), sh = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (S[y * w + x] === 1 || B[y * w + x] === 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (B[y * w + x] || y < yk) continue;
      const r = y > bot - 3 ? 2 : 1;
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && at(x + dx, y + dy)) hit = true;
      if (hit && y <= bot + 1) S[y * w + x] = 1;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (y < yk) continue;
      const up = !sh(x, y - 1), r = rand(x, y, seed);
      if (B[y * w + x]) {
        // the body seen through the ice
        let c = X.mix(col(x, y), '#7cc8f0', 0.38);
        if (!at(x, y - 1) && r < 0.7) c = r < 0.3 ? '#ffffff' : '#d8f6ff';
        else if (r < 0.03) c = '#ffffff';
        out.push([x, y, c]);
      } else if (S[y * w + x]) {
        let c = x < cx - 1 ? '#a2e2fa' : '#6cc0ea';
        if (y >= bot) c = '#3e9ad4';
        else if (y > mid + 3 && x >= cx - 1) c = '#64b8e6';
        if (up) c = '#ffffff';
        if ((x - y + seed) % 11 === 0 && x < cx + 2 && !up) c = '#ffffff';
        out.push([x, y, c]);
      }
    }
    // crystal spikes: from sky- or side-facing shell pixels, spaced apart
    const cand = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!S[y * w + x] || y > bot - 2) continue;
      const face = !sh(x, y - 1) || !sh(x - 1, y) || !sh(x + 1, y);
      if (face) cand.push([x, y, rand(x, y, seed + 3)]);
    }
    cand.sort((a, b) => a[2] - b[2]);
    const picked = [];
    for (const p of cand) { if (picked.length >= 4) break; if (picked.every((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 5)) picked.push(p); }
    for (const [x0, y0, r] of picked) {
      let dx = x0 - cx, dy = (y0 - mid) - 4;
      const L0 = Math.hypot(dx, dy) || 1; dx /= L0; dy /= L0;
      const L = 3 + Math.floor(r * 5 * 4) % 4, px2 = -dy, py2 = dx;
      for (let j = 1; j <= L; j++) {
        const x = Math.round(x0 + dx * j), y = Math.round(y0 + dy * j);
        out.push([x, y, j === L ? '#ffffff' : '#dcfaff']);
        if (j < L * 0.55) out.push([Math.round(x + px2), Math.round(y + py2), '#5ab0e0']);
      }
    }
    return out;
  }
  // the rig's frozen status: run frozenBody() over the scratch canvas
  function iceShell(s) {
    const img = sc.getImageData(BX, BY, BW, BH), d = img.data;
    const px = frozenBody((x, y) => d[(y * BW + x) * 4 + 3] > 100, (x, y) => { const k = (y * BW + x) * 4; return X.toHex(d[k], d[k + 1], d[k + 2]); }, BW, BH, s.frozen, (s.seed | 0) + 29);
    for (const [x, y, col] of px) X.px(sc, BX + x, BY + y, col);
  }
  // The old cube (kept for s.iceShape === 'block'; the user didn't like it, pass 6).
  function iceBlock(s) {
    const H = Math.round((HEIGHT[s.kind] + 3) * s.frozen), w = WIDTH[s.kind] + 2, x0 = AX - w, x1 = AX + w, y1 = AY + 2, y0 = y1 - H;
    if (H < 2) return;
    // tint the body pixels inside the block
    sc.save(); sc.beginPath(); sc.rect(x0, y0, x1 - x0 + 1, H + 1); sc.clip();
    sc.globalCompositeOperation = 'source-atop'; sc.globalAlpha = 0.4; X.fs(sc, '#9fe8ff'); sc.fillRect(x0, y0, x1 - x0 + 1, H + 1);
    sc.globalAlpha = 1;
    // the block itself, behind the body
    sc.globalCompositeOperation = 'destination-over';
    X.rect(sc, x0, y0, x1 - x0 + 1, H + 1, '#3a96cc');
    X.rect(sc, x0, y0, Math.round((x1 - x0) * 0.4), H + 1, '#7ad0f0');
    sc.restore(); sc._fs = null;
    sc.globalCompositeOperation = 'source-over';
    X.rect(sc, x0 - 1, y0, 1, H + 2, '#2a78b8'); X.rect(sc, x1 + 1, y0, 1, H + 2, '#2a78b8'); X.rect(sc, x0 - 1, y1 + 1, x1 - x0 + 3, 1, '#1e5a96');
    X.rect(sc, x0, y0 - 2, x1 - x0 + 1, 2, '#e8ffff'); X.rect(sc, x0 + 1, y0 - 3, x1 - x0 - 1, 1, '#ffffff');
    X.line(sc, x0 + 1, y0 + 2, x0 + 4, y0 + 5, '#ffffff'); X.px(sc, x1 - 2, y1 - 3, '#ffffff');
    // cracks spread just before it shatters
    if (s.shatterIn != null && s.shatterIn < 0.6 && s.shatterIn > 0) {
      const k = 1 - s.shatterIn / 0.6;
      X.line(sc, x0 + 2, y0 + 2, x0 + 2 + (x1 - x0 - 4) * k, y0 + 2 + (H - 4) * k, '#1a5ea0');
      if (k > 0.5) X.line(sc, x1 - 2, y0 + 3, x1 - 2 - (x1 - x0) * (k - 0.5), y1 - 3, '#1a5ea0');
    }
  }
  function skeleton(s, out) {
    // lightning x-ray: dark silhouette with bright bones, on alternate frames
    sc.globalCompositeOperation = 'source-atop'; X.fs(sc, '#2a1460'); sc.fillRect(0, 0, SW, SH); sc.globalCompositeOperation = 'source-over';
    se.clearRect(0, 0, SW, SH);
    const h = out.head, c = out.chest;
    if (!h || !c) return;
    const B = '#f4ecff';
    X.ellipse(se, h[0], h[1], 2.4, 1.8, B); X.px(se, h[0] - 1, h[1], '#2a1460'); X.px(se, h[0] + 1, h[1], '#2a1460');
    X.line(se, h[0], h[1] + 2, c[0], c[1] + 3, B);
    for (let k = 0; k < 3; k++) X.rect(se, c[0] - 2, c[1] - 1 + k * 2, 5, 1, B);
    X.px(se, c[0] - 1, AY - 1, B); X.px(se, c[0] + 1, AY - 1, B); X.px(se, c[0] - 1, AY - 3, B); X.px(se, c[0] + 1, AY - 3, B);
  }
  // Only the actor's bounding box of the scratch canvases is ever cleared or copied.
  const BX = AX - 23, BY = AY - 46, BW = 46, BH = 54;
  const cp = (dst, src, dx, dy) => dst.drawImage(src, BX, BY, BW, BH, dx + BX, dy + BY, BW, BH);
  // Spell VFX: rime. Frost forms on the body's top edges (the surfaces facing the sky),
  // speckles its faces and, when it is heavy, grows little crystal spikes upward.
  function rime(s) {
    const k = s.chill; if (!(k > 0.05)) return;
    const img = sc.getImageData(BX, BY, BW, BH), d = img.data, sd = (s.seed | 0) + 17;
    const at = (x, y) => (x < 0 || y < 0 || x >= BW || y >= BH ? 0 : d[(y * BW + x) * 4 + 3]);
    const out = [];
    for (let y = 1; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (!at(x, y)) continue;
      const top = !at(x, y - 1), r = rand(x, y, sd);
      if (top && r < 0.25 + k * 0.75) out.push([x, y, r < 0.35 ? '#ffffff' : '#d8f8ff']);
      else if (!top && r < k * 0.09) out.push([x, y, r < k * 0.04 ? '#ffffff' : '#bfeeff']);
      if (top && k > 0.55 && rand(x, y, sd + 5) < (k - 0.55) * 0.55) {
        const h = 1 + Math.floor(rand(x, y, sd + 6) * (1 + k * 2.2));
        for (let j = 1; j <= h; j++) out.push([x + (j === h && rand(x, y, sd + 7) < 0.5 ? (rand(x, y, sd + 8) < 0.5 ? -1 : 1) : 0), y - j, j === h ? '#ffffff' : '#a8e8ff']);
      }
    }
    for (const [x, y, col] of out) X.px(sc, BX + x, BY + y, col);
  }
  function compose(base, mask, s, ox, oy, elev, t) {
    const bx = Math.round(s.x - ox - AX), by = Math.round(s.y - s.z - oy - AY);
    // build silhouette (colour + emissive) in outline colour
    // (Spell VFX: s.outline recolours the outline and makes it glow; a shocked body gets a
    // white outline on alternate frames; s.skin wraps the body in a shimmering energy skin)
    const shockLine = s.shock > 0 && Math.floor(t * 26) % 2 === 1, oc = shockLine ? '#ffffff' : s.outline || OUTLINE;
    sil.globalCompositeOperation = 'copy'; cp(sil, SC, 0, 0);
    sil.globalCompositeOperation = 'source-over'; cp(sil, SE, 0, 0);
    if (s.skin && s.skin.k > 0.05) {
      // the skin: the silhouette, dilated two pixels, in the skin colour, with a bright band climbing it
      const sk = s.skin, kk = sk.k;
      skc.globalCompositeOperation = 'copy'; skc.drawImage(SIL, 0, 0);
      skc.globalCompositeOperation = 'source-in'; X.fs(skc, sk.hit > 0.3 ? '#ffffff' : sk.col); skc.fillRect(BX, BY, BW, BH);
      skc.globalCompositeOperation = 'source-atop';
      const band = BY + BH - ((t * 46) % (BH + 12));
      X.fs(skc, sk.hi || '#fffbe0'); skc.fillRect(BX, Math.round(band), BW, 3);
      X.fs(skc, sk.col2 || sk.col); skc.fillRect(BX, Math.round(band) + 3, BW, 2);
      // shimmer: a dither pattern that crawls, thinner as the skin weakens
      skc.globalCompositeOperation = 'destination-in';
      const lvl = Math.round(6 + 10 * kk), ox2 = Math.floor(t * 9) % 4, oy2 = Math.floor(t * 7) % 4;
      skc.drawImage(X.mask(lvl), BX - ox2, BY - oy2, BW + 4, BH + 4, BX, BY, BW + 4, BH + 4);
      skc.globalCompositeOperation = 'source-over'; skc._fs = null;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -1], [2, -1]]) { cp(base, SK, bx + dx, by + dy); cp(mask, SK, bx + dx, by + dy); }
    }
    sil.globalCompositeOperation = 'source-in'; X.fs(sil, oc); sil.fillRect(BX, BY, BW, BH);
    sil.globalCompositeOperation = 'source-over';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { cp(base, SIL, bx + dx, by + dy); if (oc !== OUTLINE) cp(mask, SIL, bx + dx, by + dy); }
    if (oc !== OUTLINE) { sil.globalCompositeOperation = 'source-in'; X.fs(sil, OUTLINE); sil.fillRect(BX, BY, BW, BH); sil.globalCompositeOperation = 'source-over'; }
    cp(base, SC, bx, by); cp(base, SE, bx, by);
    mask.globalCompositeOperation = 'destination-out'; cp(mask, SIL, bx, by);
    mask.globalCompositeOperation = 'source-over'; cp(mask, SE, bx, by);
    // a low-ground actor in front of a cliff top hides it, so it takes low-ground light
    if (elev) { elev.globalCompositeOperation = 'destination-out'; cp(elev, SIL, bx, by); elev.globalCompositeOperation = 'source-over'; }
  }

  // Draw one actor into the frame. Returns anchor points in world-screen coordinates.
  function draw(base, mask, s, t, ox, oy, S, elev) {
    sc.globalCompositeOperation = 'source-over'; se.globalCompositeOperation = 'source-over';
    sc.clearRect(BX - 1, BY - 1, BW + 2, BH + 2); se.clearRect(BX - 1, BY - 1, BW + 2, BH + 2);
    const out = {};
    if (s.kind === 'wizard') drawWizard(s, t, out, S);
    else if (s.kind === 'brute') drawBrute(s, t, out);
    else drawGoblin(s, t, out, s.kind === 'archer');
    if (s.chill > 0.05) rime(s);
    if (s.frozen > 0.05) { if (s.iceShape === 'block') iceBlock(s); else iceShell(s); }
    if (s.wet > 0.3 && s.frozen < 0.2 && out.head) { X.px(se, out.head[0] - 2, out.head[1] - 2, '#bfe4ff'); if (out.chest) X.px(se, out.chest[0] - 2, out.chest[1] - 1, '#8ad0ff'); }
    if (s.shock > 0 && Math.floor(t * 26) % 2 === 0) skeleton(s, out);
    if (s.flash > 0.02) {
      // hit flash: the whole silhouette pops white (dithered as it fades)
      // (Spell VFX: below 0.15 it is a faint flicker, optionally tinted with s.flashCol)
      const lvl = s.flash > 0.55 ? 16 : s.flash > 0.25 ? 9 : s.flash > 0.15 ? 4 : 2;
      sil.globalCompositeOperation = 'copy'; cp(sil, SC, 0, 0); sil.globalCompositeOperation = 'source-in'; X.fs(sil, s.flashCol || '#ffffff'); sil.fillRect(BX, BY, BW, BH);
      sil.globalCompositeOperation = 'destination-in'; cp(sil, X.mask(lvl), 0, 0); sil.globalCompositeOperation = 'source-over';
      cp(se, SIL, 0, 0);
    }
    if (s.alpha < 0.98) {
      const m = X.mask(s.alpha * 16);
      sc.globalCompositeOperation = 'destination-in'; cp(sc, m, 0, 0); sc.globalCompositeOperation = 'source-over';
      se.globalCompositeOperation = 'destination-in'; cp(se, m, 0, 0); se.globalCompositeOperation = 'source-over';
    }
    compose(base, mask, s, ox, oy, elev, t);
    // convert anchors to world-screen coordinates
    const W = (p) => (p ? [p[0] - AX + s.x, p[1] - AY + s.y - s.z] : null);
    const res = {};
    for (const k of Object.keys(out)) res[k] = Array.isArray(out[k][0]) ? out[k].map(W) : W(out[k]);
    return res;
  }
  PB.actors = { draw, HEIGHT, WIDTH, frozenBody };
})();
