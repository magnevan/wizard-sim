/* Spell VFX: enemy attacks (pass 8), ported from the game: game/packages/client/src/art/enemy-attacks.ts
 * (attackK, drawAttackFx, BEATS), the rig poses in art/rigs.ts (now in actors.js: s.atk, s.hold, the
 * brute's lean) and the ground telegraphs in view-structures.ts. Design and audit:
 * docs/explorations/2026-11-06-enemy-attacks.md.
 *
 * Every attack reads in four beats: a telegraph pose held for the whole wind-up, a strike frame with
 * a smear, an impact or release, and a recovery. Each card plays the sim's own timings
 * (archetypes.ts: wind-up, cooldown, reach, dash and hold) against a wizard target, and drives the
 * rig and the effects from a fake per-body sim state { ai, aiT }, exactly as the game does, so the
 * quantized poses (8 wind-up steps, one mid-swing tick, the held strike, the recovery steps) match.
 *
 * The game draws effects into two field canvases: g (the ground, lit) and o (over everything,
 * unlit), and calls light() as it goes. Here a card draws them into two offscreen layers while it
 * builds the frame (so the lights are known before the light map), then the stage puts g under the
 * actors and o over the lit frame.
 * Distances: 16 art px per sim unit, as in the game. The gallery's camera is steeper (FY 0.88 vs
 * the game's 0.6), so ground offsets are taller here; everything else is the game's numbers. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, CU, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit } = PB, X = PB.px, EL = X.EL;
  const add = (d) => PB.VFX.push(Object.assign({ group: 'attacks', fresh: 'new', keepGroup: true, enemy: true, q: [], cast: 'force', ground: 'path' }, d));
  const W = PB.stage.W, H = PB.stage.H, PPU = 16;
  // 1/16 turn away from the camera: the enemy faces right and a little up the screen, so its weapon hand
  // is on the near side and its target stands behind it (the wizard doesn't hide the blow)
  const FACE = -TAU / 16;

  // ---------------------------------------------------------------------------
  // the archetypes' numbers (game/packages/sim/src/archetypes.ts) and the beats (enemy-attacks.ts)
  const ARCH = {
    swarmer: { radius: 0.3, reach: 0.3, windup: 0.6, cooldown: 0.9 },
    brute: { radius: 0.85, reach: 2.6, windup: 1.1, cooldown: 1.8, slamRadius: 2.1, slamSpeed: 14 },
    shieldbearer: { radius: 0.55, reach: 0.4, windup: 0.8, cooldown: 1.2 },
    caster: { radius: 0.4, reach: 11, windup: 1.0, cooldown: 2.4, bolt: { speed: 6 } },
    grabber: { radius: 0.45, reach: 5, windup: 0.8, cooldown: 3, grab: { dashSpeed: 12, dashTime: 0.55, dragSpeed: 2.3, hold: 3.5 } },
    imp: { radius: 0.36, reach: 0.3, windup: 0.6, cooldown: 1.0 },
  };
  const BEATS = {
    swarmer: { hold: 0.1, rec: 0.3 }, brute: { hold: 0.3, rec: 0.6 }, shieldbearer: { hold: 0.12, rec: 0.4 },
    caster: { hold: 0, rec: 0.36 }, grabber: { hold: 0.15, rec: 0.5 }, imp: { hold: 0.15, rec: 0.3 },
  };
  const WIZ_R = 0.4;

  /** The sim's attack state at card time t for an attack whose wind-up starts at w0: { ai, aiT (s) }. */
  function aiAt(arch, t, w0) {
    const A = ARCH[arch];
    if (t < w0) return { ai: 'approach', aiT: 0 };
    if (t < w0 + A.windup) return { ai: 'windup', aiT: t - w0 };
    const c = t - w0 - A.windup;
    return c < A.cooldown ? { ai: 'cooldown', aiT: c } : { ai: 'approach', aiT: 0 };
  }
  /** attackK(), line for line: the quantized attack pose (aiT counted in whole ticks, as the sim does). */
  function attackK(arch, st) {
    const A = ARCH[arch], ticks = Math.floor(st.aiT * 60 + 1e-6);
    if (st.ai === 'windup') return (Math.round(Math.min(1, ticks / Math.max(1, A.windup * 60)) * 8) / 8) * 0.5;
    if (st.ai === 'dash') return 0.6;
    if (st.ai !== 'cooldown') return -1;
    const B = BEATS[arch] || { hold: 0.1, rec: 0.3 }, age = ticks / 60;
    if (age < 1 / 60 && arch !== 'caster') return 0.55;
    if (age < B.hold) return 0.6;
    const q = (age - B.hold) / B.rec;
    return q >= 1 ? -1 : 0.6 + Math.round(q * 8) / 20;
  }
  /** view.ts: goblin-sized bodies crouch into the wind-up and stretch into the blow. */
  const crouch = (k, flash) => (k >= 0 && !flash ? (k < 0.5 ? Math.round(k * 4) / 10 : k <= 0.6 ? -0.2 : 0) : 0);
  /** A body's local frame on screen: forward f, right r, up u (rig units) -> art px. */
  function frameAt(v, face) {
    const a = (Math.round((face / TAU) * 16) / 16) * TAU, cs = Math.cos(a), sn = Math.sin(a);
    return (f, r, u) => [v.x + f * cs - r * sn, v.y + (f * sn + r * cs) * FY - u * CU];
  }
  /** A point d sim units along the ground from p, at facing face. */
  const along = (p, face, d) => [p[0] + Math.cos(face) * d * PPU, p[1] + Math.sin(face) * d * PPU * FY];

  // ---------------------------------------------------------------------------
  // the game's drawing helpers (enemy-attacks.ts), unchanged
  function smearArc(c, at, pv, R, a0, a1, e, hot, cool, thick = 2) {
    const n = 18, from = lerp(0, 0.7, e);
    for (let k = 0; k <= n; k++) {
      const q = k / n;
      if (q < from) continue;
      const an = lerp(a0, a1, q), lead = q > 0.75;
      for (let j = 0; j < thick; j++) {
        const rr = R - j * 1.1, p = at(pv[0] + Math.cos(an) * rr, pv[1], pv[2] + Math.sin(an) * rr);
        if ((1 - e) * (0.4 + q) > X.bay(Math.round(p[0]), Math.round(p[1])) || lead) X.px(c, p[0], p[1], lead || j === 0 ? hot : cool);
      }
    }
  }
  function thrust(c, at, f0, f1, u, e) {
    const a = at(lerp(f0, f1, e * 0.6), 1, u), z = at(f1 + 2, 1, u);
    X.line(c, a[0], a[1], z[0], z[1], '#ffffff');
    if (e < 0.6) for (const du of [-1.6, 1.6]) { const p = at(lerp(f0, f1, 0.3 + e), 1, u + du), q = at(f1, 1, u + du * 0.5); X.line(c, p[0], p[1], q[0], q[1], '#c8ccd8'); }
  }
  function star(c, p, r, col) {
    X.px(c, p[0], p[1], col);
    for (let k = 1; k <= r; k++) { X.px(c, p[0] + k, p[1], col); X.px(c, p[0] - k, p[1], col); if (k < r) { X.px(c, p[0], p[1] + k, col); X.px(c, p[0], p[1] - k, col); } }
  }

  // ---------------------------------------------------------------------------
  // the ground telegraphs (view-structures.ts), in pixels: the red cone (goblin; faint for the
  // shieldbearer), the faint orange slam circle (brute), the dashed aim line (teal: grab). Archers and
  // imps have none: the bolt's flight and the spit's short reach are the warning (the user, 2026-11-06).
  function teleCone(g, v, face, reachU, f, shy = false) {
    const reach = reachU * PPU, pts = [[v.x, v.y]];
    for (let k = -2; k <= 2; k++) { const an = face + k * 0.3; pts.push([v.x + Math.cos(an) * reach, v.y + Math.sin(an) * reach * FY]); }
    X.poly(g, pts, '#ff3a3a', shy ? 0.04 + 0.12 * f : 0.15 + 0.3 * f);
  }
  function teleSlam(g, cx, cy, rU, f) {
    const r = rU * PPU;
    // the game adds a 7 % wash at the end; the gallery's ellipse dithers its alpha into a dot field, so it is left out
    X.ring(g, cx, cy, r, r * FY, '#ff8a3a', 0.12 + 0.3 * f);
  }
  function teleAim(g, x, y, tx, ty, col, f) {
    for (let k = 0; k < 10; k += 2) { const f1 = k / 10, f2 = (k + 1) / 10; X.line(g, x + (tx - x) * f1, y + (ty - y) * f1, x + (tx - x) * f2, y + (ty - y) * f2, col); }
    void f;
  }

  // ---------------------------------------------------------------------------
  // the two field layers (g: ground, lit; o: over, unlit), drawn while the frame is built
  const mkl = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; };
  let LG = null, LO = null;
  function layers() {
    if (!LG) { LG = mkl(); LO = mkl(); }
    for (const x of [LG, LO]) { x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H); x._fs = null; }
    const lights = [];
    return { g: LG, o: LO, lights, light: (x, y, r, col, a) => { if (a > 0.01) lights.push([x, y, r, col, a]); } };
  }
  function scene(F, Lr, actors, extra = {}) {
    return Object.assign({
      actors, lights: Lr.lights,
      under2(c) { c.drawImage(Lr.g.canvas, 0, 0); },
      fx(c) { c.drawImage(Lr.o.canvas, 0, 0); },
    }, F, extra);
  }

  // the target: the red player wizard. hit(t) gives the hit flash and squash of a blow at tHit.
  const wiz = (o) => K.wiz(Object.assign({ id: 'me', team: 'p1', el: 'arcane', seed: 3 }, o));
  // the game's hit flash (view.ts): solid for 0.05 s, then two dithered steps, gone by 0.18 s
  const hitLook = (t, tHit) => { const fa = t - tHit; return { flash: fa < 0 ? 0 : fa < 0.05 ? 1 : fa < 0.1 ? 0.4 : fa < 0.18 ? 0.2 : 0, sq: fa >= 0 && fa < 0.15 ? 0.3 : 0 }; };
  /** Knocked back kb px at tHit, then steps back in over [back0, back1]. */
  const pushBack = (t, tHit, kb, back0, back1) => K.kb(t, tHit, kb, 0.3) * (1 - smooth(seg(t, back0, back1)));
  const stepping = (t, back0, back1) => (t > back0 && t < back1 ? K.walk(t, 0.6) : { spd: 0, ph: 0 });

  // ===========================================================================
  // GOBLIN: club, dagger, spear, one attack each in turn
  {
    const D = 5.4, CY = 1.8, E0 = { x: 84, y: 74 }, gap = ARCH.swarmer.reach + ARCH.swarmer.radius + WIZ_R;
    const T0 = along([E0.x, E0.y], FACE, gap);
    add({ id: 'atk-goblin', title: 'Goblins: club, dagger, spear', dur: D, seed: 401, still: 0.85 + 0.03,
      tags: ['Enemy: Goblin', 'Wind-up 0.6 s', 'Strike held 0.1 s, recovery 0.3 s', 'Three kinds of goblin, one weapon each'],
      line: 'Three kinds of goblin, each with its own weapon for life (in a crowd every third one has a club, a dagger or a spear). The card shows them in turn. Each crouches and leans back for the whole 0.6 s wind-up (club raised over the shoulder, dagger drawn back, spear levelled and pulled back), then stretches and steps into the blow: a white arc for the club, a thrust streak for the dagger and the spear, a small white star at the tip.',
      calls: ['The hit star at the weapon tip (the first thing to cut if a crowd gets noisy: the victim already flashes white).', 'The crouch into the wind-up and the stretch into the blow (it reads from any side, even with the weapon hidden).', 'The off hand counter-swinging.'],
      frame(t) {
        const Lr = layers(), i = Math.min(2, Math.floor(t / CY)), tc = t - i * CY, w0 = 0.25, tHit = i * CY + w0 + ARCH.swarmer.windup;
        const st = aiAt('swarmer', tc, w0), k = attackK('swarmer', st);
        const back0 = tHit + 0.45, back1 = tHit + 1.0;
        const hl = hitLook(t, tHit), kb = t >= i * CY ? pushBack(t, tHit, 5, back0, back1) : 0;
        const me = wiz(Object.assign({ x: T0[0] + Math.cos(FACE) * kb, y: T0[1] + Math.sin(FACE) * kb * FY, face: FACE + Math.PI }, hl, stepping(t, back0, back1)));
        const gob = K.gob({ id: 'g1', x: E0.x, y: E0.y, face: FACE, seed: 1, pal: 0, variant: i, atk: k, sq: crouch(k, 0) });
        // drawAttackFx, ARCH.swarmer
        const at = frameAt(gob, FACE), age = st.ai === 'cooldown' ? st.aiT : -1, wind = st.ai === 'windup' ? Math.min(1, st.aiT / ARCH.swarmer.windup) : -1;
        if (wind >= 0) teleCone(Lr.g, gob, FACE, ARCH.swarmer.reach + ARCH.swarmer.radius + 0.5, wind);
        if (age >= 0 && age <= 0.14) {
          const variant = i, e = age / 0.14;
          if (variant === 0) smearArc(Lr.o, at, [0, 3.2, 8.5], 9, 1.9, -0.35, e, '#ffffff', '#e4e8f0', 3);
          else thrust(Lr.o, at, variant === 1 ? 4 : 1, variant === 1 ? 11 : 17, variant === 1 ? 6.6 : 7, e);
          if (age < 0.07) star(Lr.o, at(variant === 0 ? 9 : variant === 1 ? 11 : 17, 1, variant === 0 ? 3 : 6.5), 3, '#ffffff');
        }
        return scene({}, Lr, [gob, me]);
      } });
  }

  // ===========================================================================
  // BRUTE: fists up over the wind-up, the slam, the crack from fists to impact, the shake
  {
    // the brute and the archer face toward the camera instead: their targets stand well clear of them,
    // and from behind the brute's raised fists hide behind its hump
    const FACE = TAU / 16;
    const D = 4.6, B0 = { x: 52, y: 48 }, w0 = 0.35, A = ARCH.brute, tHit = w0 + A.windup;
    const LK = along([B0.x, B0.y], FACE, A.reach);
    const O = along([B0.x, B0.y], FACE, A.radius * 0.6), dcU = A.reach - A.radius * 0.6, tLand = tHit + dcU / A.slamSpeed;
    add({ id: 'atk-brute', title: 'Brute: the slam, a travelling shockwave', dur: D, seed: 402, still: tHit + 0.08,
      tags: ['Enemy: Brute', 'Wind-up 1.1 s (a faint circle locks on your spot)', 'Shockwave 14 u/s from its fists', 'Hits inside the 2.1 u circle as the front reaches you'],
      line: 'Fists rise over the 1.1 s wind-up while it rears back; a faint orange ring marks where you stood. The fists hit the floor just ahead of it and a shockwave rolls out from them: a pale front of grit crossing the circle, the crack running behind it. You are hit when the front reaches you (the far side of the circle about 0.3 s after the fists), and the white star, chunks of floor, dust and the short shake land at the circle’s centre as the front gets there.',
      calls: ['The front: a pale arc of grit, drawn only inside the circle.', 'The crack following the front from its fists.', 'The much fainter ground warning (outline only, a light wash at the end).'],
      frame(t) {
        const Lr = layers(), st = aiAt('brute', t, w0), k = attackK('brute', st);
        // the target: flung along the blow when the front reaches it, knocked down, back up, walks back in
        const fl = K.kb(t, tLand, 30, 0.45), up = 3.3, ret = smooth(seg(t, up + 0.35, D - 0.15)), d = fl * (1 - ret);
        const me = wiz(Object.assign({ x: LK[0] + Math.cos(FACE) * d, y: LK[1] + Math.sin(FACE) * d * FY, z: K.hop(t, tLand, 6, 0.45), dead: K.down(t, tLand + 0.1, up), face: FACE + Math.PI }, hitLook(t, tLand), t > up + 0.35 && t < D - 0.15 ? K.walk(t, 0.6) : {}));
        const br = K.brute({ id: 'b1', x: B0.x, y: B0.y, face: FACE, seed: 2, smash: k });
        const at = frameAt(br, FACE), age = st.ai === 'cooldown' ? st.aiT : -1, wind = st.ai === 'windup' ? Math.min(1, st.aiT / A.windup) : -1;
        const lx = Math.round(LK[0]), ly = Math.round(LK[1]), ox = O[0], oy = O[1], fwd = at(1, 0, 0), dirX = fwd[0] - br.x, dirY = fwd[1] - br.y, sd = 9 * 7 + 3;
        const { g, o, light } = Lr;
        if (wind >= 0) teleSlam(g, lx, ly, A.slamRadius, wind);
        let shake = 0;
        if (age >= 0) {
          const R = A.slamRadius, front = age * A.slamSpeed, ia = age - dcU / A.slamSpeed;
          // the sim's burst event when the front reaches the centre: the existing 'slam' effect (art/vfx.ts)
          if (ia >= 0 && ia < 1.3) {
            const e = ia, r = R * PPU, fr = Math.max(4, r * easeOut(Math.min(1, e / 0.5)));
            K.cracks(g, lx, ly, r * 0.9, sd, seg(e, 0, 0.4), '#1a120c', 9);
            X.ellipse(g, lx, ly, 12, 6, 'rgba(26,18,12,0.5)');
            if (e < 1) { const a = 1 - seg(e, 0.5, 1); K.gring(g, lx, ly, fr, '#553e2a', a, 3); K.gring(g, lx, ly, fr + 1, '#b8946a', a, 1); }
          }
          // drawAttackFx, ARCH.brute, line for line
          if (age < 0.1) for (const r2 of [-3.6, 3.6]) smearArc(o, at, [1.6, r2, 17], 15, 1.75, -0.2, age / 0.1, '#ffffff', '#b2a4cc', 2);
          if (age < 0.12) { star(o, [Math.round(ox), Math.round(oy) - 1], 3, '#ffffff'); light(ox, oy, 20, '#fff6d0', 0.5 * (1 - age / 0.12)); }
          if (front < dcU + R) {
            // the front: an arc round the fists, only where it crosses the circle, kicking up grit
            for (let kk = -24; kk <= 24; kk++) {
              const t2 = FACE + kk * 0.045, wx = Math.cos(t2) * front, wy = Math.sin(t2) * front;
              if (Math.hypot(wx - Math.cos(FACE) * dcU, wy - Math.sin(FACE) * dcU) > R) continue;
              const px = ox + wx * PPU, py = oy + wy * PPU * FY;
              X.px(g, px, py, kk % 3 ? '#fff6d0' : '#ffffff');
              X.px(g, px - Math.cos(t2) * 2, py - Math.sin(t2) * 2 * FY, '#8a7a68');
              if (rand(kk, sd, Math.floor(front * 4)) < 0.25) X.px(o, px, py - 2 - rand(kk, sd, 3) * 3, '#b8946a');
            }
          }
          // the crack follows the front from the fists to the centre
          if (age < 1.4) {
            const run = Math.min(1, front / Math.max(0.1, dcU)), n = 7;
            let px0 = ox, py0 = oy;
            for (let kk = 1; kk <= n * run; kk++) {
              const q = kk / n, j = kk === n ? 0 : (rand(kk, sd, 9) - 0.5) * 5;
              const nx = lerp(ox, lx, q) - dirY * j, ny = lerp(oy, ly, q) + dirX * j * FY;
              X.line(g, px0, py0, nx, ny, age < 0.9 ? '#1a120c' : '#33241a', kk < 3 ? 2 : 1); px0 = nx; py0 = ny;
            }
          }
          if (ia >= 0) {
            if (ia < 0.15) { const q = ia / 0.15; K.gring(o, lx, ly - 1, 4 + q * 20, q < 0.4 ? '#ffffff' : '#fff6d0', 1, 2); if (q < 0.5) star(o, [lx, ly - 2], 5, '#ffffff'); light(lx, ly, 44, '#fff6d0', 0.8 * (1 - q)); }
            if (ia < 1.2) K.debris(o, lx, ly, ia, sd, 12, 34, ['#977552', '#553e2a', '#b8946a'], 46);
            if (ia < 0.9) K.dust(g, lx, ly - 2, ia, sd + 1, 10, 26, '#8a7a68', 0.9);
            if (ia < 0.25) shake = Math.max(shake, 2.5 * (1 - ia / 0.25));
          }
        }
        return scene({ shake }, Lr, [br, me]);
      } });
  }

  // ===========================================================================
  // SHIELDBEARER: the bash
  {
    const D = 3.3, E0 = { x: 82, y: 74 }, A = ARCH.shieldbearer, w0 = 0.35, tHit = w0 + A.windup;
    const T0 = along([E0.x, E0.y], FACE, A.reach + A.radius + WIZ_R);
    add({ id: 'atk-shieldbearer', title: 'Shieldbearer: the bash', dur: D, seed: 403, still: tHit + 0.05,
      tags: ['Enemy: Shieldbearer', 'Wind-up 0.8 s', 'Strike held 0.12 s, recovery 0.4 s', 'Knockback 8', 'A faint warning cone'],
      line: 'It pulls the shield in and leans back for the 0.8 s wind-up, then shoves it out with a lunge: the rim and boss flash, a white shock crescent comes off the shield’s face, a star on the boss, and dust kicks up from its feet.',
      calls: ['The hit star on the shield boss.', 'The shock crescent off the shield’s face.', 'The crouch into the wind-up and the lunge into the bash.'],
      frame(t) {
        const Lr = layers(), st = aiAt('shieldbearer', t, w0), k = attackK('shieldbearer', st);
        const back0 = tHit + 0.8, back1 = tHit + 1.7, kb = pushBack(t, tHit, 14, back0, back1);
        const me = wiz(Object.assign({ x: T0[0] + Math.cos(FACE) * kb, y: T0[1] + Math.sin(FACE) * kb * FY, face: FACE + Math.PI }, hitLook(t, tHit), stepping(t, back0, back1)));
        const sb = K.gob({ id: 'g1', x: E0.x, y: E0.y, face: FACE, seed: 1, pal: 5, variant: 5, atk: k, sq: crouch(k, 0) });
        const at = frameAt(sb, FACE), age = st.ai === 'cooldown' ? st.aiT : -1, wind = st.ai === 'windup' ? Math.min(1, st.aiT / A.windup) : -1, sd = 9 * 7 + 3;
        const { g, o, light } = Lr;
        if (wind >= 0) teleCone(g, sb, FACE, A.reach + A.radius + 0.5, wind, true);
        if (age >= 0 && age <= 0.3) {
          const e = age / 0.3, c = at(8.5 + e * 5, 0, 6.5);
          if (age < 0.16) {
            for (let kk = -4; kk <= 4; kk++) {
              const p = at(8 + e * 6 - (kk * kk) * 0.18, kk * 1.5, 6.5 + (kk % 2) * 0.5);
              X.px(o, p[0], p[1], Math.abs(kk) < 2 ? '#ffffff' : '#e4e8f0');
            }
            star(o, at(6.5, 0, 7), 3, '#ffffff');
            light(c[0], c[1], 22, '#fff6d0', 0.5 * (1 - e));
          }
          for (const side of [-1, 1]) { const f = at(-1, side * 2.4, 0); K.dust(g, f[0], f[1], age, sd + side, 3, 9, '#7a6a5a', 0.45); }
        }
        return scene({}, Lr, [sb, me]);
      } });
  }

  // ===========================================================================
  // ARCHER: the draw, the release with the string snap; no ground warning, the wizard dodges the bolt
  {
    const FACE = TAU / 16;
    const D = 3.8, E0 = { x: 40, y: 46 }, A = ARCH.caster, w0 = 0.3, tRel = w0 + A.windup, tLock = w0 + A.windup * 0.55;
    const AIM = along([E0.x, E0.y], FACE, 7.2), side = [Math.sin(FACE), -Math.cos(FACE) * FY];   // a sidestep (up the screen)
    add({ id: 'atk-archer', title: 'Archer: draw, release', dur: D, seed: 404, still: tLock + 0.2,
      tags: ['Enemy: Archer', 'Wind-up 1.0 s: tracks 55 %, then the aim locks', 'No warning: the bolt’s flight is the warning', 'Bolt 6 u/s, Arcane', 'Recovery 0.36 s'],
      line: 'It draws over the whole 1.0 s wind-up. There is no aim line and no glint: a 6 u/s bolt gives you time to see it coming and step aside, as the wizard does here. The release: a puff of pink and white sparks at the bow, the string goes white and snaps forward past rest, back, forward, then settles while the bow arm recoils.',
      calls: ['The string snap after the release (white, shuddering 3 frames).', 'The spark puff at the bow.'],
      frame(t) {
        const Lr = layers(), st = aiAt('caster', t, w0), k = attackK('caster', st);
        const dodge = smooth(seg(t, tLock + 0.12, tLock + 0.42)) * (1 - smooth(seg(t, 2.9, 3.6))), sideD = 18 * dodge;
        const mx = AIM[0] + side[0] * sideD, my = AIM[1] + side[1] * sideD;
        const moving = (t > tLock + 0.12 && t < tLock + 0.42) || (t > 2.9 && t < 3.6);
        const me = wiz(Object.assign({ x: mx, y: my, face: FACE + Math.PI }, moving ? K.walk(t, 0.8) : {}));
        const draw = st.ai === 'windup' ? Math.round(Math.min(1, Math.floor(st.aiT * 60 + 1e-6) / (A.windup * 60)) * 4) / 4 : 0;
        const ar = K.archer({ id: 'a1', x: E0.x, y: E0.y, face: FACE, seed: 1, draw, atk: k });
        const at = frameAt(ar, FACE), age = st.ai === 'cooldown' ? st.aiT : -1, wind = st.ai === 'windup' ? Math.min(1, st.aiT / A.windup) : -1, sd = 9 * 7 + 3;
        const { g, o, light } = Lr;
        // drawAttackFx, ARCH.caster
        const tip = at(8, -0.8, 9);
        if (age >= 0 && age < 0.12) {
          const e = age / 0.12;
          for (let kk = 0; kk < 6; kk++) { const a2 = (kk / 6) * TAU + rand(kk, sd) * 0.5, d = 2 + e * 5; X.px(o, tip[0] + Math.cos(a2) * d, tip[1] + Math.sin(a2) * d * 0.7, kk % 2 ? '#ffc0e0' : '#ffffff'); }
          light(tip[0], tip[1], 18, '#ff6ab0', 0.6 * (1 - e));
        }
        // the bolt (art/vfx.ts's plain bolt in Arcane's colours), along the locked aim and on past it
        if (t >= tRel) {
          const ux = Math.cos(FACE), uy = Math.sin(FACE) * FY, d = (t - tRel) * A.bolt.speed * PPU + 8, h = 9 * CU;
          const x = ar.x + ux * d, yg = ar.y + uy * d, y = yg - h, RB = EL.arcane;
          if (x < W + 10) {
            X.ellipse(g, x, yg, 2, 1, 'rgba(8,6,16,0.45)');
            for (let k2 = 6; k2 >= 1; k2--) K.sq(o, x - ux * k2 * 2.5, y - uy * k2 * 2.5, k2 < 3 ? 2 : 1, RB[Math.min(RB.length - 1, 1 + (k2 >> 1))]);
            X.glow(o, x, y, 6, RB[2], 0.7); K.sq(o, x, y, 3, RB[2]); K.sq(o, x, y, 2, RB[1]); X.px(o, x, y - 1, '#ffffff');
            light(x, yg, 30, RB[2], 0.5);
          }
        }
        return scene({}, Lr, [ar, me]);
      } });
  }

  // ===========================================================================
  // FIRE IMP: the spit
  {
    const D = 3.2, E0 = { x: 84, y: 74 }, A = ARCH.imp, w0 = 0.4, tHit = w0 + A.windup;
    const T0 = along([E0.x, E0.y], FACE, A.reach + A.radius + WIZ_R);
    add({ id: 'atk-imp', title: 'Fire imp: the spit', dur: D, seed: 405, still: tHit + 0.06,
      tags: ['Enemy: Fire imp', 'Wind-up 0.6 s', 'Spit 0.3 s, recovery 0.3 s', 'Sets you burning', 'No warning: its reach is short'],
      line: 'Its claws come up to its mouth for the 0.6 s wind-up, with no glow and no ground cone (its reach is short, so the spit is the warning). Then it flings its claws forward and spits a short gout of flame out to the end of its reach, with a flash of light. The wizard catches fire.',
      calls: ['The length and spread of the gout (to the end of its reach, no further).', 'The crouch and stretch.'],
      frame(t) {
        const Lr = layers(), st = aiAt('imp', t, w0), k = attackK('imp', st);
        const back0 = tHit + 0.7, back1 = tHit + 1.3, kb = pushBack(t, tHit, 4, back0, back1);
        const burn = t > tHit + 0.05 ? 1 - seg(t, tHit + 1.6, tHit + 2.1) : 0;
        const me = wiz(Object.assign({ x: T0[0] + Math.cos(FACE) * kb, y: T0[1] + Math.sin(FACE) * kb * FY, face: FACE + Math.PI, burn: burn * 0.8 }, hitLook(t, tHit), stepping(t, back0, back1)));
        const im = K.gob({ id: 'g1', x: E0.x, y: E0.y, face: FACE, seed: 1, pal: 3, variant: 3, atk: k, sq: crouch(k, 0) });
        const at = frameAt(im, FACE), age = st.ai === 'cooldown' ? st.aiT : -1, wind = st.ai === 'windup' ? Math.min(1, st.aiT / A.windup) : -1, sd = 9 * 7 + 3;
        const fwd = at(1, 0, 0), dirX = fwd[0] - im.x, dirY = fwd[1] - im.y;
        const { g, o, light } = Lr;
        // drawAttackFx, ARCH.imp
        const mouth = at(4.2, 0, 9.9);
        if (age >= 0 && age < 0.3) {
          const e = age / 0.3, len = (A.reach + A.radius + 0.5) * 16 * 0.9;
          for (let kk = 0; kk < 26; kk++) {
            const q = rand(kk, sd, 5), d = len * (0.15 + 0.85 * q) * (0.6 + 0.4 * easeOut(Math.min(1, e * 2)));
            const p = at(4 + d, (rand(kk, sd, 6) - 0.5) * (2 + d * 0.45), 9.5 - d * 0.25 + (rand(kk, sd, 7) - 0.5) * 3);
            const life = clamp(e + q * 0.3, 0, 1);
            if (life < 0.95) K.sq(o, p[0], p[1], q < 0.3 && e < 0.5 ? 2 : 1, K.fireCol(life));
          }
          light(mouth[0] + dirX * 8, mouth[1] + dirY * 8, 30, '#ff8a30', 0.7 * (1 - e));
        }
        if (burn > 0.05) light(me.x, me.y - 8, 24, '#ff8a30', 0.35 * burn);
        return scene({}, Lr, [im, me], { fx(c, Aa) { c.drawImage(Lr.o.canvas, 0, 0); if (burn > 0.05) K.burning(c, Aa, me, t, burn); } });
      } });
  }

  // ===========================================================================
  // GRABBER: the coil, the dash, the catch, the hold ring, the throw
  {
    const D = 7.0, E0 = { x: 34, y: 98 }, A = ARCH.grabber, G2 = A.grab, w0 = 0.3, tDash = w0 + A.windup;
    const gapU = A.radius + WIZ_R, distU = 4.4, T0 = along([E0.x, E0.y], FACE, distU);
    const tCatch = tDash + (distU - gapU) / G2.dashSpeed, tThrow = tCatch + G2.hold;
    // the drag is scaled down to fit the card: the game drags at 2.3 u/s (8 u over the hold), here 2.2 u in all
    const DRAG = 2.2, END = along([E0.x, E0.y], FACE, distU - gapU);
    const gPos = (t) => {
      if (t < tDash) return [E0.x, E0.y];
      if (t < tCatch) { const k = (t - tDash) / (tCatch - tDash); return [lerp(E0.x, END[0], k), lerp(E0.y, END[1], k)]; }
      if (t < tThrow) return along(END, FACE, -DRAG * ((t - tCatch) / G2.hold));
      const p = along(END, FACE, -DRAG), k = smooth(seg(t, tThrow + 1.2, D - 0.1));
      return [lerp(p[0], E0.x, k), lerp(p[1], E0.y, k)];
    };
    add({ id: 'atk-grabber', title: 'Grabber: coil, dash, catch, hold', dur: D, seed: 406, still: tCatch + 2.2,
      tags: ['Enemy: Grabber', 'Wind-up 0.8 s (tracks 55 %, then locks)', 'Dash 12 u/s', 'Hold 3.5 s, then the throw'],
      line: 'It crouches for the 0.8 s wind-up, arms flung back and wide, claws splayed. Then the lunge: both arms thrown forward, its body leaning in, speed lines and dust behind it. A white flash where the claws close, and its arms clamp shut and squeeze while it drags you. A ring on the floor round the held wizard closes as the throw nears: teal, gold at half time, then blinking red and gold in the last quarter. Then the throw.',
      calls: ['The hold ring (it adds information: how long you, or your partner, have to break the hold).', 'Its colours: teal, then gold at half time, then red and gold blinking in the last quarter.', 'The catch flash.', 'The coil crouch and the lunge.'],
      frame(t) {
        const Lr = layers();
        let st;
        if (t < w0) st = { ai: 'approach', aiT: 0 };
        else if (t < tDash) st = { ai: 'windup', aiT: t - w0 };
        else if (t < tCatch) st = { ai: 'dash', aiT: t - tDash };
        else if (t < tThrow) st = { ai: 'grab', aiT: t - tCatch };
        else if (t < tThrow + A.cooldown) st = { ai: 'cooldown', aiT: t - tThrow };
        else st = { ai: 'approach', aiT: 0 };
        let k = attackK('grabber', st), hold = 0;
        if (st.ai === 'grab') { k = -1; hold = Math.floor(t * 6) % 2 ? 2 : 1; }
        const gp = gPos(t), walkBack = t > tThrow + 1.2 && t < D - 0.1;
        const gr = K.gob(Object.assign({ id: 'g1', x: gp[0], y: gp[1], face: FACE, seed: 1, pal: 4, variant: 4, atk: k, hold, sq: crouch(k, 0) },
          st.ai === 'dash' ? K.walk(t, 1) : st.ai === 'grab' ? K.walk(t, 0.5) : walkBack ? K.walk(t, 0.6) : {}));
        // the wizard: stands, is caught, held in front of the claws (struggling), thrown, gets up, walks back
        let mx = T0[0], my = T0[1], extra = {};
        if (t >= tCatch && t < tThrow) { const p = along(gp, FACE, gapU); mx = p[0]; my = p[1]; extra = { sq: Math.floor(t * 12) % 2 ? 0.2 : -0.2 }; }
        else if (t >= tThrow) {
          const p0 = along(along(END, FACE, -DRAG), FACE, gapU), fl = K.kb(t, tThrow, 34, 0.5), ret = smooth(seg(t, tThrow + 1.25, D - 0.1));
          const p1 = along(p0, FACE, fl / PPU); mx = lerp(p1[0], T0[0], ret); my = lerp(p1[1], T0[1], ret);
          extra = Object.assign({ z: K.hop(t, tThrow, 8, 0.5), dead: K.down(t, tThrow + 0.15, tThrow + 0.85) }, hitLook(t, tThrow), t > tThrow + 1.25 && t < D - 0.1 ? K.walk(t, 0.6) : {});
        }
        const me = wiz(Object.assign({ x: mx, y: my, face: FACE + Math.PI }, extra));
        const at = frameAt(gr, FACE), wind = st.ai === 'windup' ? Math.min(1, st.aiT / A.windup) : -1, sd = 9 * 7 + 3;
        const { g, o } = Lr;
        if (wind >= 0) teleAim(g, gr.x, gr.y, T0[0], T0[1], '#4fe0d6', wind);
        // drawAttackFx, ARCH.grabber
        if (st.ai === 'dash') {
          for (let kk = 0; kk < 4; kk++) {
            const r = (kk - 1.5) * 2.4, u = 3 + rand(kk, sd) * 8, p0 = at(-3, r, u), p1 = at(-10 - rand(kk, sd, 2) * 6, r, u);
            X.line(o, p0[0], p0[1], p1[0], p1[1], kk % 2 ? '#e4e8f0' : '#b8c0d0');
          }
          const f = at(-2, 0, 0); K.dust(g, f[0], f[1], st.aiT, sd, 4, 10, '#7a6a5a', 0.5);
        }
        if (st.ai === 'grab') {
          const vt = me, held = st.aiT, left = clamp(1 - held / G2.hold, 0, 1);
          if (held < 0.15) star(o, [vt.x, vt.y - 9], 4, '#ffffff');
          const col = left < 0.25 ? (Math.floor(t * 12) % 2 ? '#ff4f4f' : '#ffd36b') : left < 0.5 ? '#ffd36b' : '#4fe0d6';
          X.ring(g, vt.x, vt.y, 6 + 9 * left, (6 + 9 * left) * FY, col, 0.9, 0, TAU * left);
          X.ring(g, vt.x, vt.y, 6 + 9 * left, (6 + 9 * left) * FY, '#1a2a2a', 0.5, TAU * left, TAU);
        }
        return scene({}, Lr, [gr, me]);
      } });
  }
})();
