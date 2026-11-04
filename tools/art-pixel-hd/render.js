/* Pixel Battlefield renderer. One frame, in art pixels:
 *   1. ground (cached) + dynamic decals (puddle, ice sheet, scorch, glyph, team rings)
 *   2. shadows and swaying grass tufts
 *   3. everything that stands up, depth-sorted by ground y: cliff strips, props,
 *      structures, actors (each actor outlined, with emissive pixels marked in a mask)
 *   4. light map: dusk ambient + coloured light from every spell, banded and dithered;
 *      emissive pixels keep their colour
 *   5. unlit effects on the pixel grid: beam, sprays, lightning, bolts, particles
 *   6. HUD: the player's rune pools
 * Everything is a function of the scene state S, so a frame is reproducible. */
(function () {
  'use strict';
  const PB = window.PB, { FY, TAU, LOOP, clamp, lerp, seg, smooth, easeOut, rand, mod, emit, MAP } = PB, X = PB.px, EL = X.EL;
  // Light is posterised into LEV bands. Pass 2: the ordered dither only runs in a narrow
  // seam (DW of a band) where two bands meet, so most of the ground is flat colour and
  // the screen-door grain is gone; the bands themselves keep the lit pixel-art look.
  const LEV = 9, GAIN = 2.25, DW = 0.22;
  const bufs = {};
  let LUTC = null;
  function lightLUT() {
    if (LUTC) return LUTC;
    LUTC = new Uint16Array(16 * 256);
    for (let k = 0; k < 16; k++) for (let v = 0; v < 256; v++) LUTC[(k << 8) + v] = Math.round((Math.floor(v * LEV / 255 + 0.5 + (X.BAYER[k] - 0.5) * DW) / LEV) * GAIN * 256);
    return LUTC;
  }
  function buf(name, w, h) {
    let b = bufs[name];
    if (!b || b.c.width !== w || b.c.height !== h) {
      const c = b && b.c || document.createElement('canvas'); c.width = w; c.height = h;
      b = bufs[name] = { c, x: c.getContext('2d', { willReadFrequently: true }) };
      b.x.imageSmoothingEnabled = false; b.x._fs = null;
    }
    return b;
  }

  PB.render = function render(S, LW, LH) {
    const W = PB.world.build(), t = S.t, c = S.c;
    if (PB.warmMs == null) PB.warmMs = PB.walls.warm();   // wall sprites for every state the loop shows
    const dens = 1 + c * 1.6;
    // ---- camera with procedural screen shake from heavy impacts ----
    let shake = 0;
    for (const h of S.wallHits) if (h.e < 0.3) shake = Math.max(shake, (h.big ? 2 : 1) * (1 - h.e / 0.3) + 0.4);
    if (S.glyph.erupt >= 0 && S.glyph.erupt < 0.35) shake = Math.max(shake, 2.5 * (1 - S.glyph.erupt / 0.35));
    for (const m of S.meteors) if (m.e >= 0 && m.e < 0.25) shake = Math.max(shake, 1.5);
    const shx = shake ? Math.round((rand(Math.floor(t * 40), 1) - 0.5) * 2 * shake) : 0, shy = shake ? Math.round((rand(Math.floor(t * 40), 2) - 0.5) * 2 * shake) : 0;
    // tighter zooms frame the defenders above the HUD; wider zooms show more of the approach
    const camY = MAP.CAMERA.y + (MAP.CAMERA.fixed ? 0 : (360 - LH) * 0.3);
    const ox = Math.round(MAP.CAMERA.x - LW / 2) + shx, oy = Math.round(camY - LH / 2) + shy;
    const V = (x, y) => [x - ox, y - oy];
    const inView = (x, y, m = 40) => x - ox > -m && x - ox < LW + m && y - oy > -m && y - oy < LH + m;

    const B = buf('base', LW, LH), M = buf('mask', LW, LH), LW2 = (LW + 1) >> 1, LH2 = (LH + 1) >> 1, L = buf('light', LW2, LH2);   // light map at half resolution
    const LA = buf('lightHigh', LW2, LH2), E = buf('elev', LW, LH);   // light for the cliff tops, and where they show
    const b = B.x, m = M.x;
    E.x.globalCompositeOperation = 'copy'; E.x.drawImage(W.elev, W.WX0 - ox, W.WY0 - oy); E.x.globalCompositeOperation = 'source-over';
    b.globalCompositeOperation = 'source-over'; X.fs(b, '#0c0a12'); b.fillRect(0, 0, LW, LH);
    m.clearRect(0, 0, LW, LH);
    b.drawImage(W.ground, W.WX0 - ox, W.WY0 - oy);
    const emissive = (fn) => { fn(b); fn(m); };
    const opaque = (fn) => { fn(b); m.globalCompositeOperation = 'destination-out'; fn(m); m.globalCompositeOperation = 'source-over'; };

    const PR = PB.prof, pm = (k) => { if (PR) { bufs.base.x.getImageData(0, 0, 1, 1); bufs.mask.x.getImageData(0, 0, 1, 1); const n = performance.now(); PR[k] = (PR[k] || 0) + n - PR._t; PR._t = n; } }; if (PR) PR._t = performance.now();
    // ================= ground decals =================
    // Puddle under group W: wet -> an ice sheet on the water -> melted -> dried.
    const PUD = MAP.PUD;
    const wetA = seg(t, 1.0, 1.9) * (1 - seg(t, 9.6, 11.6)), iceA = seg(t, 4.3, 5.1) * (1 - seg(t, 8.6, 9.4));
    if (wetA > 0.02) {
      const sv = V(PUD.x, PUD.y), sc = 0.4 + 0.6 * wetA;
      const blob = (k, j) => { const pts = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, r = 1 + Math.sin(a * 3 + 1) * 0.1 + Math.sin(a * 5 + 2) * 0.07; pts.push([sv[0] + Math.cos(a) * PUD.rx * r * sc * k, sv[1] + j + Math.sin(a) * PUD.ry * r * sc * k]); } return pts; };
      X.poly(b, blob(1, 0), '#18325a', wetA > 0.97 ? 1 : wetA);
      X.poly(b, blob(0.86, -1), '#204a80', wetA > 0.97 ? 1 : wetA);
      for (let i = 0; i < 3; i++) { const k = mod(t * 0.55 + i / 3, 1); X.ring(b, sv[0] - 14 + i * 13, sv[1] - 2 + i * 3, 4 + k * 14, (4 + k * 14) * 0.38, '#5aa8e8', (1 - k) * 0.8 * wetA * (1 - iceA)); }
      if (iceA > 0.02) {
        // Ice sheet (water + cold): it freezes from Blue's side (the south) across the
        // water. Clear ice shows the dark water under it; a frosted rim, a crack network
        // and glints sell it as a hard surface rather than a white blob.
        const front = sv[1] + PUD.ry + 2 - iceA * (PUD.ry * 2 + 4);
        b.save(); b.beginPath(); b.rect(0, front, LW, LH); b.clip();
        X.poly(b, blob(1.02, 0), '#bfe8f6');                                   // frosted rim
        X.poly(b, blob(0.9, -0.5), '#5c9ec6');                                 // the sheet
        for (let i = 0; i < 6; i++) { const ex = sv[0] + (rand(i, 74) - 0.5) * PUD.rx * 1.3, ey = sv[1] + (rand(i, 75) - 0.5) * PUD.ry * 1.0; X.ellipse(b, ex, ey, 4 + rand(i, 76) * 7, 1.5 + rand(i, 77) * 2.5, '#3f7aa8'); }   // clear ice over deep water
        X.poly(b, blob(0.62, -2), '#6cb0d4', 1);
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + rand(i, 78) * 0.3, r0 = 0.97, r1 = 0.82 - rand(i, 79) * 0.08; X.line(b, sv[0] + Math.cos(a) * PUD.rx * r0 * sc, sv[1] + Math.sin(a) * PUD.ry * r0 * sc, sv[0] + Math.cos(a) * PUD.rx * r1 * sc, sv[1] + Math.sin(a) * PUD.ry * r1 * sc, '#e8f8ff'); }   // frost feathers at the edge
        // cracks: a few branching lines, dark with a pale lip below
        const nCr = t > 6.7 ? 7 : 4;
        for (let i = 0; i < nCr; i++) {
          let x0 = sv[0] + (rand(i, 81) - 0.5) * PUD.rx * 1.2, y0 = sv[1] + (rand(i, 82) - 0.5) * PUD.ry * 0.9;
          const pts = [[x0, y0]];
          for (let k = 0; k < 3; k++) { x0 += (rand(i, k, 83) - 0.3) * 9; y0 += (rand(i, k, 84) - 0.5) * 4; pts.push([x0, y0]); }
          X.lines(b, pts.map((p) => [p[0], p[1] + 1]), '#a8dcf2'); X.lines(b, pts, '#2c5a86');
        }
        // glints: short diagonal streaks catching the light
        for (let i = 0; i < 7; i++) { const x0 = sv[0] + (rand(i, 71) - 0.5) * PUD.rx * 1.4, y0 = sv[1] + (rand(i, 72) - 0.5) * PUD.ry * 1.1, l = 2 + Math.round(rand(i, 73) * 3); X.line(b, x0, y0, x0 + l, y0 - Math.ceil(l / 2), i % 3 ? '#e8f8ff' : '#ffffff'); }
        b.restore(); b._fs = null;
      }
    }
    // scorch marks: turret impacts, brute A's last stand, meteors, grass fires
    for (const im of S.impacts) if (im.e < 2.4 && !im.steam) { const v = V(im.x, im.y); X.ellipse(b, v[0], v[1], 6, 6 * FY * 0.8, `rgba(22,14,16,${(0.7 * (1 - seg(im.e, 1.2, 2.4))).toFixed(2)})`); }
    { const e = PB.since(t, 1.8, 7); if (e >= 0) { const v = V(460, 449); X.ellipse(b, v[0], v[1], 11, 11 * FY * 0.8, `rgba(22,14,16,${(0.6 * seg(e, 0, 1.5) * (1 - seg(e, 5.5, 7))).toFixed(2)})`); } }
    for (const mt of S.meteors) if (mt.e >= 0) { const v = V(mt.x, mt.y); const ka = (0.8 * (1 - seg(mt.e, 1.6, 2.4))).toFixed(2); X.ellipse(b, v[0], v[1], 15, 15 * FY * 0.8, `rgba(20,14,16,${ka})`); X.ellipse(b, v[0], v[1], 8, 8 * FY * 0.8, `rgba(42,22,16,${ka})`); }
    for (const f of S.fires) { const v = V(f.x, f.y); X.ellipse(b, v[0], v[1], f.r, f.r * FY * 0.8, 'rgba(30,22,18,0.8)'); }
    // walls cast a shadow down and to the right (light from the upper left), along the
    // same direction and at the same length per px of height as every other shadow
    for (const ws of S.walls) for (const sg of ws.segs) {
      const k = Math.max(sg.rise, ws.old ? 1 - ws.old[sg.i].sink : 0) * (sg.st >= 4 ? 0.35 : sg.st >= 3 ? 0.65 : 1);
      if (k < 0.2) continue;
      const fp = PB.walls.footprint(ws.spec, sg.i, 0.5), hh = ws.spec.H * k, dx = X.SHADOW_DIR[0] * hh, dy = X.SHADOW_DIR[1] * hh;
      X.poly(b, [fp[0], fp[1], [fp[1][0] + dx, fp[1][1] + dy], [fp[2][0] + dx, fp[2][1] + dy], [fp[3][0] + dx, fp[3][1] + dy], fp[3]].map((p) => V(p[0], p[1])), 'rgba(8,6,16,0.42)');
    }
    // the glyph trap (emissive lines on the ground): Sigil gives it the form (a trap on
    // the ground), Earth, the attached element, its look, so the outer ring and the
    // marks glow in earth tones; the inner ring is in Gold's colour (its owner)
    const G = S.glyph;
    {
      const v = V(G.x, G.y), gold = EL.shield, sg = ['#fff0d0', '#e8c890', '#c89a5a', '#8a6a48'], pulse = 0.55 + 0.25 * Math.sin(t * 4) + G.step * 0.45;
      const reach = G.draw * TAU, rot = t * 0.4;
      if (G.armed || G.draw < 1) {
        emissive((x) => {
          X.ring(x, v[0], v[1], G.r, G.r * FY, sg[2], G.armed ? Math.min(1, pulse + 0.25) : 1, rot, rot + reach);
          X.ring(x, v[0], v[1], G.r * 0.62, G.r * 0.62 * FY, gold[3], G.armed ? pulse : 0.9, -rot, -rot + reach * 0.999);
          for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; if (a - rot > reach) continue; const px = v[0] + Math.cos(a) * G.r * 0.82, py = v[1] + Math.sin(a) * G.r * 0.82 * FY; X.rect(x, px - 0.5, py - 0.5, 2, 1, i % 2 ? gold[1] : sg[1]); }
          if (G.armed) { X.px(x, v[0], v[1] - 1, gold[1]); X.px(x, v[0] - 1, v[1], EARTH[1]); X.px(x, v[0] + 1, v[1], EARTH[1]); X.px(x, v[0], v[1] + 1, EARTH[2]); }
        });
        if (G.step > 0) X.ellipse(b, v[0], v[1], G.r * 0.9, G.r * 0.9 * FY, '#fffbe0', G.step * 0.6);
      }
    }
    // under the turret: its turning ring of violet runes (Sigil is the form) and, outside
    // it, the owner's ring (P1, red): no ammo of its own, it is fed from Red's Fire pool
    // (the ring is dashed and the runes blink while it waits on Red)
    {
      const T = S.turret, v = V(T.x, T.y + 1);
      emissive((x) => {
        runeRing(x, v[0], v[1], 11, t, 1, { FY, SV: EL.sigil, dry: T.dry > 0.3 ? 1 : 0 });
        if (!T.dry) X.ring(x, v[0], v[1], 14, 14 * FY, X.TEAM.p1.light, 0.6);
        else X.ring(x, v[0], v[1], 14, 14 * FY, X.TEAM.p1.dark, 0.6, t * 2, t * 2 + TAU);
      });
    }
    // team rings under the wizards (who is who, from far away)
    for (const s of S.actors) if (s.kind === 'wizard') {
      const v = V(s.x, s.y), col = X.TEAM[s.team].light, me = s.team === 'p1';
      emissive((x) => { X.ring(x, v[0], v[1] + 1, 8, 8 * FY, col, me ? 1 : 0.55); if (me) { X.px(x, v[0], v[1] + 7, col); X.px(x, v[0] - 1, v[1] + 8, col); X.px(x, v[0] + 1, v[1] + 8, col); } });
    }
    // drop shadows (shrink as they hop), thrown a little to the lower right like the rest
    for (const s of S.actors) {
      const hop = Math.max(0, s.z - (s.z0 || 0)), v = V(s.x, s.y - (s.z0 || 0)), w = PB.actors.WIDTH[s.kind] * 1.15 * (1 - Math.min(0.5, hop / 30));
      X.shadow(b, v[0] + 0.5, v[1] + 0.5, w, Math.max(1.5, w * FY), PB.actors.HEIGHT[s.kind] * 0.25 * (1 - Math.min(0.6, hop / 20)), 'rgba(8,6,16,0.5)');
    }
    // grass tufts: wind gusts roll across the field, blades bend away from feet
    pm("decals");
    const feet = S.actors.filter((s) => !s.z0);
    for (const tf of W.tufts) {
      if (!inView(tf.x, tf.y, 6)) continue;
      let bend = 0, flat = 0;
      for (const s of feet) { const dx = tf.x - s.x, dy = (tf.y - s.y) / FY; const d = Math.hypot(dx, dy); if (d < 11) { bend += Math.sign(dx || 1) * (1 - d / 11) * 2.2; flat = Math.max(flat, 1 - d / 11); } }
      const gust = Math.sin(t * 1.6 - tf.x * 0.025 + tf.y * 0.01) * 0.5 + 0.5;
      const sway = Math.sin(t * 3.1 + tf.seed) * 0.5 + gust * 1.3;
      const v = V(tf.x, tf.y);
      for (let k = 0; k < tf.n; k++) {
        // blades fan out from the clump (seen from above they splay, they don't stand in a row)
        const bx = v[0] + k - (tf.n >> 1), h = tf.h * 0.85 * (1 - 0.55 * flat) * (k === 1 ? 1.25 : 1), fan = (k - (tf.n - 1) / 2) * 1.1;
        X.line(b, bx, v[1], bx + fan + (sway + bend) * (h / 3), v[1] - h, k % 2 ? '#4e8044' : tf.col);
      }
    }

    pm("tufts");
    // ================= depth-sorted pass =================
    const D = [];
    for (const st of W.strips) if (st.wx + 4 - ox > -2 && st.wx - ox < LW + 2 && st.wy - oy < LH && st.wy + st.h - oy > 0) D.push([st.key, () => b.drawImage(st.cv, st.sx, st.sy, st.w, st.h, st.wx - ox, st.wy - oy, st.w, st.h), "strip"]);
    for (const p of W.props) if (inView(p.x, p.y - p.z, 50)) D.push([p.y, () => PB.world.drawProp(b, p, ox, oy, t), "prop"]);
    structures(D, S, b, m, V, emissive, (fn) => fn(b), t);   // opaque structures never cover emissive pixels
    const anchors = {};
    for (const s of S.actors) if (inView(s.x, s.y - s.z, 60)) {
      D.push([s.y, () => { anchors[s.id] = PB.actors.draw(b, m, s, t, ox, oy, S, s.z0 ? null : E.x); }, "actor"]);
      // the readiness swirl: motes behind the wizard draw before it, the near ones after
      if (s.kind === 'wizard') { D.push([s.y - 0.05, () => emissive((x) => swirl(x, s, t, V, false))]); D.push([s.y + 0.05, () => emissive((x) => swirl(x, s, t, V, true))]); }
    }
    D.sort((p, q) => p[0] - q[0]);
    pm("collect");
    const SK = PB.skip || {};
    for (const d of D) if (!SK[d[2] || "struct"]) d[1]();
    pm("sorted");
    // anchors for actors that are off-screen but still needed by effects
    for (const s of S.actors) if (!anchors[s.id]) anchors[s.id] = { chest: [s.x, s.y - s.z - 10], tip: [s.x, s.y - s.z - 22], head: [s.x, s.y - s.z - 14] };

    // ================= light map =================
    const lights = gatherLights(S, anchors, t);
    const lx = L.x;
    lx.globalCompositeOperation = 'source-over'; lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.fillStyle = '#26283e'; lx.fillRect(0, 0, LW2, LH2);
    lx.globalCompositeOperation = 'lighter';
    const fyL = FY;
    let lx2 = lx;
    const addLight = (x, y, r, col, a) => {
      const lx = lx2;
      const sx = x - ox, sy = y - oy;
      if (a <= 0.01 || sx < -r || sx > LW + r || sy < -r * fyL || sy > LH + r * fyL) return;
      lx.setTransform(0.5, 0, 0, 0.5 * fyL, 0, 0.5 * sy * (1 - fyL));
      const gr = lx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, X.mix('#000000', col, Math.min(1, a))); gr.addColorStop(0.45, X.mix('#000000', col, Math.min(1, a * 0.5))); gr.addColorStop(1, '#000000');
      lx.fillStyle = gr; lx.fillRect(sx - r, sy - r, r * 2, r * 2);
    };
    // broad dusk fill around the defenders; the ends of the lanes stay dark
    const dusk = () => { addLight(622, 470, 540, '#3c3e56', 1); addLight(622, 250, 300, '#1e2034', 1); };
    dusk();
    for (const l of lights) addLight(...l);
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over';
    // cliff tops sit above the low-ground lights: they get the dusk, moonlight, and only
    // the biggest flashes (sky strikes, meteors), weakened
    const hx = LA.x; lx2 = hx;
    hx.globalCompositeOperation = 'source-over'; hx.setTransform(1, 0, 0, 1, 0, 0);
    hx.fillStyle = '#2c3048'; hx.fillRect(0, 0, LW2, LH2);
    hx.globalCompositeOperation = 'lighter';
    dusk();
    for (const l of lights) if (l[2] >= 90) addLight(l[0], l[1], l[2], l[3], l[4] * 0.45);
    hx.setTransform(1, 0, 0, 1, 0, 0); hx.globalCompositeOperation = 'source-over';
    pm("lightmap");
    const img = b.getImageData(0, 0, LW, LH), bd = img.data, ldLow = lx.getImageData(0, 0, LW2, LH2).data, md = m.getImageData(0, 0, LW, LH).data;
    const ldHigh = hx.getImageData(0, 0, LW2, LH2).data, ed = E.x.getImageData(0, 0, LW, LH).data;
    // banded, ordered-dithered light: LUT[bayer cell][light value] = multiplier * 256
    const LUT = lightLUT();
    for (let y = 0, i = 0; y < LH; y++) {
      const by4 = (y & 3) << 2, ly = (y >> 1) * LW2;
      for (let x = 0; x < LW; x++, i += 4) {
        if (md[i + 3] !== 0) continue;
        const o = ((x & 3) + by4) << 8, li = (ly + (x >> 1)) << 2, ld = ed[i + 3] ? ldHigh : ldLow;
        bd[i] = (bd[i] * LUT[o + ld[li]]) >> 8;          // Uint8ClampedArray clamps at 255
        bd[i + 1] = (bd[i + 1] * LUT[o + ld[li + 1]]) >> 8;
        bd[i + 2] = (bd[i + 2] * LUT[o + ld[li + 2]]) >> 8;
      }
    }
    b.putImageData(img, 0, 0);

    // ================= effects (unlit, on the art-pixel grid) =================
    pm("lightloop");
    effects(b, S, anchors, V, t, c, dens);
    pm("fx");
    // ================= HUD =================
    hud(b, S, LW, LH, t);
    pm("hud");
    return { canvas: B.c, ox, oy, anchors };
  };

  // =====================================================================
  // Structures (sorted pass)
  // =====================================================================
  const EARTH = ['#d8b88a', '#b8946a', '#977552', '#76583c', '#553e2a', '#33241a'];
  function structures(D, S, b, m, V, emissive, opaque, t) {
    // ---- walls (stuff: paid once, last until broken) ----
    // Rows of thick slabs painted by walls.js: Violet's rock wall (raised earth with turf
    // on top) and Blue's stone arc coated in frost. Damage shows as cracks, a chunk out of
    // the top, half height and finally rubble; a re-raised wall pushes up through the old.
    const WL = PB.walls;
    for (const ws of S.walls) {
      const spec = ws.spec, g = WL.geom(spec);
      const put = (segs, sink) => { for (const sg of segs) {
        const sl = g.slabs[sg.i], spr = WL.sprite(spec, sg.i, sg.st, sink ? 1 - sg.sink : sg.rise, sg.frost);
        if (spr) D.push([sl.cy - (sink ? 0.02 : 0), () => opaque((c) => { const v = V(sl.cx + sg.jolt, sl.cy); c.drawImage(spr.c, Math.round(v[0]) - WL.OX, Math.round(v[1]) - WL.OY); })]);
      } };
      if (ws.old) put(ws.old, true);
      put(ws.segs, false);
      // the caster's mark on the middle slab, and rime glints on the frost wall
      const mid = Math.floor(spec.n / 2), ms = ws.segs[mid], pc = X.TEAM[spec.owner].light;
      D.push([g.slabs[mid].cy + 0.1, () => emissive((c) => {
        if (ms.rise > 0.9 && ms.st < 3) {
          const p = V(...WL.facePoint(spec, mid, spec.mat === 'frost' ? 3 : -2, Math.round(spec.H * 0.52)));
          X.px(c, p[0], p[1] - 1, pc); X.px(c, p[0] - 1, p[1], pc); X.px(c, p[0] + 1, p[1], pc); X.px(c, p[0], p[1] + 1, pc); X.px(c, p[0], p[1], '#ffffff');
        }
        if (spec.mat === 'frost') for (const sg of ws.segs) {
          if (sg.frost < 0.7 || sg.st >= 4 || sg.rise < 1) continue;
          for (let k = 0; k < 3; k++) {
            const tw = Math.sin(t * W1 * (5 + k * 2) + sg.i * 2.3 + k * 1.7);
            if (tw < 0.93) continue;
            const p = V(...WL.facePoint(spec, sg.i, (rand(sg.i, k, 41) - 0.5) * g.L * 0.8, 2 + rand(sg.i, k, 42) * spec.H * (sg.st >= 3 ? 0.4 : 0.85)));
            X.px(c, p[0], p[1], '#ffffff'); if (tw > 0.975) { X.px(c, p[0] - 1, p[1], EL.cold[2]); X.px(c, p[0] + 1, p[1], EL.cold[2]); X.px(c, p[0], p[1] - 1, EL.cold[2]); X.px(c, p[0], p[1] + 1, EL.cold[2]); }
          }
        }
      })]);
    }
    // ---- energy shield wall (energy: upkeep while it absorbs) ----
    // An arc of light, not a mesh: a translucent sheet with a bright base and a
    // flickering crest, scan bands that climb it, and rings where arrows land.
    // Pass 3: it is only as strong as Gold's shield runes (Sh.strength). As they run low
    // the sheet thins and dims, columns drop out, the crest stutters and whole stretches
    // blink; it firms up again as the runes regenerate.
    const Sh = S.shield, NS = 8, NC = 26, kS = Sh.strength, weak = 1 - kS;
    const pylon = (f) => { const [px2, py2] = Sh.at(f); D.push([py2, () => {
      opaque((c) => { const v = V(px2, py2); X.ellipse(c, v[0] + 1, v[1] + 1, 4, 2, 'rgba(8,6,16,0.5)'); X.rect(c, v[0] - 2, v[1] - 7, 4, 7, '#5a5868'); X.rect(c, v[0] - 2, v[1] - 7, 1, 7, '#8a88a0'); X.rect(c, v[0] - 3, v[1] - 2, 6, 2, '#3a3848'); });
      emissive((c) => { const v = V(px2, py2), bob = Math.round(Math.sin(t * 3 + px2) * 1), on = kS > 0.3 || Math.floor(t * 9) % 3; if (!on) return; X.rect(c, v[0] - 1, v[1] - 11 + bob, 3, 3, kS > 0.45 ? EL.shield[2] : EL.shield[3]); X.px(c, v[0], v[1] - 12 + bob, kS > 0.45 ? EL.shield[0] : EL.shield[2]); X.px(c, v[0], v[1] - 10 + bob, X.TEAM.p3.light); });
    }]); };
    pylon(0); pylon(1);
    const fl = Math.floor(t * 14);
    for (let sgi = 0; sgi < NS; sgi++) {
      const f0 = sgi / NS, f1 = (sgi + 1) / NS, mid = Sh.at((f0 + f1) / 2);
      // low on runes, whole stretches blink out for a frame or two
      if (weak > 0.45 && rand(sgi, fl, 17) < (weak - 0.45) * 1.1) continue;
      D.push([mid[1], () => {
        // columns along this segment
        const cols = [];
        for (let k = 0; k <= NC; k++) {
          const f = lerp(f0, f1, k / NC), [gx, gy] = Sh.at(f), v = V(gx, gy);
          cols.push({ f, x: v[0], y: v[1], hh: Sh.h * (0.62 + 0.38 * kS) + Math.sin(f * 23 + t * W1 * 8) * 0.9 + Math.sin(f * 61 - t * W1 * 13) * (0.5 + weak * 1.5) });
        }
        // the sheet: translucent, lit like the world (so it reads as a surface)
        const sheet = cols.map((q) => [q.x, q.y - q.hh]).concat(cols.slice().reverse().map((q) => [q.x, q.y + 0.5]));
        X.poly(b, sheet, `rgba(255,214,110,${(0.06 + 0.16 * kS).toFixed(2)})`);
        X.poly(b, cols.map((q) => [q.x, q.y - q.hh * 0.45]).concat(cols.slice().reverse().map((q) => [q.x, q.y + 0.5])), `rgba(255,226,140,${(0.05 + 0.15 * kS).toFixed(2)})`);
        emissive((c) => {
          for (const q of cols) {
            const x = Math.round(q.x), y0 = Math.round(q.y), hh = Math.round(q.hh), qi = Math.round(q.f * 200);
            const gone = weak > 0.1 && rand(qi, fl, 19) < weak * 0.5;          // a column dropping out
            if (!(weak > 0.55 && (x & 1))) X.px(c, x, y0, EL.shield[1]);       // base line (dashed when weak)
            if (gone) continue;
            const crest = rand(qi, fl) < 0.8 - weak * 0.35;
            X.px(c, x, y0 - hh, crest ? (kS > 0.5 ? EL.shield[0] : EL.shield[1]) : EL.shield[2]);   // crest
            if (kS > 0.55) X.px(c, x, y0 - hh + 1, EL.shield[kS > 0.8 ? 1 : 2]);              // a thicker crest at full strength
            // scan bands climbing the sheet, broken into dashes; fewer as it weakens
            for (let z = 2; z < hh - 1; z++) {
              // bands climb 110 px per loop (a multiple of their spacing), so the loop is seamless
              const zt = z - t * (110 / LOOP), bnd = mod(zt, 5);
              if (bnd < 1 && rand(Math.floor(q.f * 34), mod(Math.floor(zt / 5), 22), 3) < 0.65 * (0.35 + 0.65 * kS)) X.px(c, x, y0 - z, z > hh * 0.6 ? EL.shield[1] : EL.shield[2]);
              else if (z === 1 || (z === 2 && (x & 1))) X.px(c, x, y0 - z, EL.shield[2]);
            }
            // a lit rib every few columns gives the full-strength sheet a body
            if (kS > 0.6 && qi % 9 === 0) for (let z = 2; z < hh - 1; z += 2) X.px(c, x, y0 - z, EL.shield[2]);
            for (const rp of Sh.ripples) {
              const dx = (q.f - rp.f) * 150, e = rp.e;
              if (e > 0.8 || Math.abs(dx) > 30) continue;
              for (let z = 1; z < hh; z++) {
                const dd = Math.hypot(dx, z - rp.hz), r = e * 26;
                if (Math.abs(dd - r) < 0.9) X.px(c, x, y0 - z, e < 0.3 ? '#ffffff' : EL.shield[1]);
                else if (dd < 3 && e < 0.12) X.px(c, x, y0 - z, '#ffffff');
              }
            }
          }
        });
      }]);
    }
    // ---- fire turret: a Sigil device (Sigil + Fire + Fire) ----
    // Pass 4.1: no more plinth and orb ("a torch on a cube"). A carved dais, a hovering
    // crystal in fire colours (Fire, the attached element, is its look) and three runic
    // plates orbiting it in Sigil violet (the form). It has no ammo of its own: each shot
    // draws a Fire rune from Red (a mote flies over, render effects); the crystal swells
    // as the rune lands and kicks on the shot. While Red is dry it waits: the crystal
    // sinks to a dull ember and the plates droop.
    const T = S.turret;
    D.push([T.y, () => {
      const v = V(T.x, T.y);
      opaque((c) => X.shadow(c, v[0], v[1] - 1, 6, 3.5, T.orbZ * 0.6, 'rgba(8,6,16,0.45)'));
      const feed = T.motes.reduce((m, q) => Math.max(m, q.k > 0.7 ? (q.k - 0.7) / 0.3 : 0), 0);
      sigilDevice(opaque, emissive, v[0], v[1], t, { R: EL.fire, SV: EL.sigil, FY, recoil: T.recoil, charge: Math.max(T.charge, feed), dry: T.dry, feed, orbZ: T.orbZ });
    }]);
    // ---- glyph eruption: earth spikes burst up around the trap ----
    const G = S.glyph;
    if (G.erupt >= 0 && G.erupt < 1.6) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rand(i, 31) * 0.5, r = 6 + rand(i, 32) * 7, x = G.x + Math.cos(a) * r, y = G.y + Math.sin(a) * r * FY;
        const h = (7 + rand(i, 33) * 6) * easeOut(seg(G.erupt, 0, 0.08 + i * 0.008)) * (1 - seg(G.erupt, 1.0, 1.55));
        if (h < 1) continue;
        const lean = Math.cos(a) * 3, w = 3.5 + rand(i, 34) * 1.5;
        D.push([y, () => opaque((c) => {
          const v = V(x, y), tip = [v[0] + lean + 0.5, v[1] - h];
          X.poly(c, [[v[0] - w - 1, v[1] + 1], [v[0] + w + 1, v[1] + 1], [tip[0] + 1, tip[1] - 1], [tip[0] - 1, tip[1] - 1]], '#1a120c');
          X.poly(c, [[v[0] - w, v[1]], [v[0] + w, v[1]], tip], EARTH[3]);
          X.poly(c, [[v[0] - w, v[1]], [v[0] - w * 0.1, v[1]], [tip[0] - 0.5, tip[1] + 1]], EARTH[1]);
          X.rect(c, v[0] - w, v[1] - 1, w * 2, 2, EARTH[5]);
        })]);
      }
    }
  }

  // =====================================================================
  // Lights: [x, y, radius, colour, intensity] in world-screen coordinates
  // =====================================================================
  function gatherLights(S, A, t) {
    const L = [], flick = 0.9 + Math.sin(t * TAU * 3) * 0.06 + Math.sin(t * TAU * 7.3 + 1) * 0.04;
    for (const s of S.actors) if (s.kind === 'wizard') {
      L.push([s.x, s.y - 8, 46, '#a8a0d0', 0.42]);
      const tip = A[s.id] && A[s.id].tip; if (tip) L.push([tip[0], tip[1] + 6, 26, EL[s.el][2], 0.4]);
    }
    // a spell being prepared lights its caster in the queued colours
    for (const s of S.actors) if (s.prepInfo && s.prepInfo.release < 0) {
      const ch = A[s.id] && A[s.id].charge, got = s.prepInfo.qs.filter((q) => t >= q.tq + 0.24);
      if (ch && got.length) L.push([ch[0], ch[1] + 10, 30 + got.length * 6, EL[got[got.length - 1].el][2], 0.3 + 0.12 * got.length]);
    }
    for (const s of S.actors) if (s.burn > 0.05) L.push([s.x, s.y - 6, s.kind === 'brute' ? 92 : 50, '#ff7020', 0.75 * s.burn * flick]);
    const T = S.turret; L.push([T.x, T.y + 4, 50 + T.recoil * 30, '#e86a24', (0.45 + T.recoil * 0.45 + T.charge * 0.25) * flick * T.orb]);
    for (const mo of T.motes) { const p = A.p1 && A.p1.chest; if (p) L.push([lerp(p[0], T.x, mo.k), lerp(p[1], T.y - T.orbZ, mo.k) + 8, 26, '#ff8a30', 0.45]); }
    // beam: arcane gives it the beam form, fire (the attached element) its look and light
    if (S.beam) {
      const a = A.p1.tip, z = A.bruteA && A.bruteA.chest, o = S.beam.on;
      if (a && z) {
        for (let i = 1; i <= 4; i++) { const k = i / 5; L.push([lerp(a[0], z[0], k), lerp(a[1], z[1], k) + 14, 38, '#ff6a20', 0.42 * o * flick]); }
        L.push([z[0], z[1] + 12, 70, '#ff7a30', 0.7 * o]);
      }
    }
    // shield glow (as strong as Gold's shield runes) and the frost wall's cold
    const Sh = S.shield;
    for (let k = 0; k <= 4; k++) { const p = Sh.at(k / 4); L.push([p[0], p[1], 30, '#ffc83a', 0.1 + 0.25 * Sh.strength]); }
    for (const rp of Sh.ripples) if (rp.e < 0.3) { const p = Sh.at(rp.f); L.push([p[0], p[1], 36, '#fff0a0', 0.6 * (1 - rp.e / 0.3)]); }
    const FW = S.frost, fw = FW.segs.reduce((m, s) => m + s.frost * (s.st < 4 ? 1 : 0.3), 0) / FW.segs.length;
    for (let k = 0; k <= 3; k++) { const p = MAP.wallPoint(FW.spec, k / 3); L.push([p[0], p[1] + 2, 26, '#4ad0f4', 0.24 * fw]); }
    for (const h of S.wallHits) if (h.e < 0.35 && h.mat === 'frost') L.push([h.x, h.y, h.big ? 80 : 50, '#9ff4ff', (h.big ? 0.8 : 0.5) * (1 - h.e / 0.35)]);
    for (const lk of S.links) if (lk.e < 0.5) { const p = A[lk.from] && A[lk.from].tip; const k = clamp(lk.e / PB.MAP.LINK_T, 0, 1); if (p) L.push([lerp(p[0], lk.to[0], k), lerp(p[1], lk.to[1], k) + 8, 40, EL[lk.els[lk.els.length - 1]][2], 0.6 * (1 - lk.e / 0.5)]); }
    // glyph
    const G = S.glyph;
    if (G.armed) L.push([G.x, G.y, 22, '#ffc83a', 0.25 + G.step * 0.8]);
    if (G.erupt >= 0 && G.erupt < 0.8) L.push([G.x, G.y, 110, '#fff0b0', 1.2 * (1 - G.erupt / 0.8)]);
    // sprays
    for (const sp of S.sprays) {
      const a = A[sp.from] && A[sp.from].tip; if (!a) continue;
      const k = Math.min(seg(t, sp.from0, sp.from0 + 0.25), 1 - seg(t, sp.to0 - 0.2, sp.to0));
      for (let i = 1; i <= 3; i++) L.push([lerp(a[0], sp.to[0], i / 3), lerp(a[1], sp.to[1] - 8, i / 3) + 8, 34, sp.kind === 'water' ? '#2a8cff' : '#7ff0ff', (sp.kind === 'water' ? 0.35 : 0.5) * k]);
    }
    // lightning flashes (big, short)
    if (S.chain && Math.floor(t * 18) % 3 !== 2) for (const id of S.chain.through) { const p = A[id] && A[id].chest; if (p) L.push([p[0], p[1] + 10, 64, '#b08aff', 0.8]); }
    for (const st of S.strikes) if (st.e > -0.1 && st.e < 0.3) L.push([st.x, st.y, 120, '#c4a4ff', 1.1 * (1 - Math.max(0, st.e) / 0.3)]);
    // bolts and impacts
    for (const bo of S.bolts) { const p = boltPos(bo, bo.k); L.push([p[0], p[1] + 12, 40, '#ff8a30', 0.7]); }
    for (const im of S.impacts) if (im.e < 0.5) L.push([im.x, im.y - 4, im.steam ? 90 : 60, im.steam ? '#d8f0ff' : '#ff9a40', (im.steam ? 0.9 : 0.85) * (1 - im.e / 0.5)]);
    for (const sh of S.shatters) if (sh.e < 0.6) L.push([sh.x, sh.y, 50, '#9ff4ff', 0.6 * (1 - sh.e / 0.6)]);
    // P4's conjured hammer
    const p4 = A.p4 && A.p4.hammer; if (p4) L.push([p4[0], p4[1] + 10, 34, '#ff4a9a', 0.5]);
    for (const hh of S.hammerHits) if (hh.e < 0.3) L.push([hh.x, hh.y, 50, '#ff5aa8', 0.45 * (1 - hh.e / 0.3)]);
    // chaos
    for (const mt of S.meteors) { if (mt.e < 0) { const k = 1 + mt.e / 0.6; L.push([mt.x + 70 * (1 - k), mt.y - 170 * (1 - k) + 30, 60, '#ff8a30', 0.7]); } else if (mt.e < 1.6) L.push([mt.x, mt.y, 110, '#ff7a2a', 1.2 * (1 - mt.e / 1.6) * flick]); }
    for (const f of S.fires) L.push([f.x, f.y, f.r * 2.6, '#ff7020', 0.42 * flick]);
    return L;
  }
  function boltPos(bo, k) { return [lerp(bo.x0, bo.x1, k), lerp(bo.y0, bo.y1, k) - Math.sin(k * Math.PI) * 16]; }

  // =====================================================================
  // Effects
  // =====================================================================
  // ---- Pass 4.1: the Sigil turret, redesigned (copied from tools/spell-vfx/fx.js) ----
  function sigilDevice(op, em, x, y, t, o) {
    const R = o.R, SV = o.SV, fy = o.FY, rise = o.rise == null ? 1 : o.rise, rec = o.recoil || 0, ch = o.charge || 0, dry = o.dry || 0, feed = o.feed || 0;
    if (rise <= 0.02) return null;
    x = Math.round(x); y = Math.round(y);
    const Z = (o.orbZ || 14) * (0.35 + 0.65 * smooth(rise)), lit = dry > 0.5 ? 0 : 1;
    // the dais: a low round stone with a lit top and a socket
    const drx = 5, dry2 = Math.max(2.5, drx * fy * 0.8), dh = 2;
    op((c) => {
      X.ellipse(c, x, y + 1, drx + 1, dry2 + 1, '#14101c');
      X.ellipse(c, x, y, drx, dry2, '#2e2a3a');
      X.ellipse(c, x, y - dh, drx, dry2, '#5e5a6c');
      X.ellipse(c, x - 1, y - dh - 1, drx - 2.2, dry2 - 1.4, '#77738a');
      X.ellipse(c, x, y - dh, 2.6, dry2 * 0.45, '#1c1826');
    });
    em((c) => {
      X.ring(c, x, y - dh, 4.4, dry2 * 0.72, dry ? SV[4] : SV[3], 1);
      for (let k = 0; k < 4; k++) { const a = -t * 0.8 + k * TAU / 4; if (dry && (k + Math.floor(t * 6)) % 2) continue; X.px(c, x + Math.cos(a) * 4.4, y - dh + Math.sin(a) * dry2 * 0.72, dry ? SV[3] : SV[1]); }
      // a faint violet column of light from the socket up to the crystal (it hovers on it)
      if (!dry) for (let z = dh + 2; z < Z - 4; z += 2) if ((z + Math.floor(t * 10)) % 4 < 2) X.px(c, x, y - z, SV[3]);
    });
    // the orbiting plates
    const plates = [0, 1, 2].map((i) => {
      const a = t * 0.9 + i * TAU / 3, r = (9 + 3 * rec - 2 * ch) * smooth(rise), s = Math.sin(a);
      return { i, s, x: x + Math.cos(a) * r, y: y + s * r * fy, z: (Z - 1 + Math.sin(t * 2.3 + i * 2.1) * 1.2 - 6 * dry) };
    });
    const plate = (p) => {
      const w = 0.6 + 1.6 * Math.abs(p.s), cx = Math.round(p.x), top = Math.round(p.y - p.z - 4);
      // a carved tablet: square shoulders, a chipped point at the bottom
      const pts = (k) => [[cx + 0.5 - w + 0.5, top - 1 - k], [cx + 0.5 + w - 0.5, top - 1 - k], [cx + 0.5 + w + k, top], [cx + 0.5 + w + k, top + 5], [cx + 0.5, top + 7 + k], [cx + 0.5 - w - k, top + 5], [cx + 0.5 - w - k, top]];
      op((c) => {
        X.poly(c, pts(1), '#14101c');
        X.poly(c, pts(0), '#4e4a5c');
        if (w > 1) X.rect(c, cx - Math.floor(w), top, 1, 5, '#7e7a90');
        X.px(c, cx, top - 1, '#8a869c');
      });
      if (p.s > -0.3) em((c) => {
        const col = dry ? SV[4] : ch > 0.5 || rec > 0.5 ? SV[0] : SV[1];
        X.rect(c, cx, top + 1, 1, 3, col); X.px(c, cx, top + 5, dry ? SV[4] : SV[2]);
        if (w > 1.4) { X.px(c, cx - 1, top + 2, dry ? SV[4] : SV[2]); X.px(c, cx + 1, top + 2, dry ? SV[4] : SV[2]); }
      });
    };
    for (const p of plates) if (p.s < 0) plate(p);
    // the hovering crystal (the payload's look)
    const bob = Math.round(Math.sin(t * 3) * 1), cy = Math.round(y - Z + bob + dry * 2 - rec * 2);
    const hw = 3.6 + rec * 1.2 - ch * 0.6, hu = 7 + ch * 1.5 - rec * 1.5, hd = 5;
    em((c) => {
      const C = dry ? { lt: R[4], mid: R[5] || R[4], dk: '#2a0a18', core: rand(Math.floor(t * 12), 5) < 0.5 ? R[3] : R[4], edge: SV[4] }
        : { lt: R[1], mid: R[2], dk: R[3], core: ch > 0.5 || rec > 0.4 || feed > 0.5 ? '#ffffff' : R[0], edge: SV[3] };
      // the halo, back half
      if (!dry) X.ring(c, x, cy + 1, 7, 2, SV[3], 1, Math.PI, TAU);
      X.poly(c, [[x + 0.5, cy - hu - 1], [x + 1.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 2], [x - 0.5 - hw, cy + 0.5]], C.edge);
      X.poly(c, [[x + 0.5, cy - hu], [x + 0.5, cy + 0.5], [x + 0.5 - hw, cy + 0.5]], C.lt);
      X.poly(c, [[x + 0.5, cy - hu], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + 0.5]], C.mid);
      X.poly(c, [[x + 0.5 - hw, cy + 0.5], [x + 0.5, cy + 0.5], [x + 0.5, cy + hd + 1]], C.mid);
      X.poly(c, [[x + 0.5, cy + 0.5], [x + 0.5 + hw, cy + 0.5], [x + 0.5, cy + hd + 1]], C.dk);
      X.rect(c, x, cy - 2, 1, 3, C.core); if (!dry) X.px(c, x - 1, cy - 1, C.lt === R[1] ? R[0] : C.core);
      if (!dry) X.px(c, x - 1, cy - hu + 2, '#ffffff');
      // the halo, front half: a dashed violet ring round the crystal's waist
      if (!dry) for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI, q = (k + Math.floor(t * 8)) % 4; if (q === 3) continue; X.px(c, x + Math.cos(a) * 7, cy + 1 + Math.sin(a) * 2, q === 0 ? SV[1] : SV[2]); }
    });
    for (const p of plates) if (p.s >= 0) plate(p);
    return { orb: [x, cy], top: [x, cy - hu], lit };
  }
  // The rune ring on the ground under a device: a dotted violet circle with six small
  // runes turning slowly round it; dim and blinking while the device waits (dry).
  const RUNES = [[[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, 0], [0, 0], [1, 0], [0, 1]], [[-1, -1], [0, 0], [1, 1], [1, -1]], [[0, -1], [-1, 1], [1, 1], [0, 0]], [[-1, -1], [-1, 0], [0, 1], [1, 1]], [[0, -1], [0, 1], [-1, 0], [1, 1]]];
  function runeRing(c, x, y, r, t, a = 1, o = {}) {
    if (a <= 0.05) return;
    const fy = o.FY || FY, R = o.SV || EL.sigil, dry = o.dry || 0;
    X.ring(c, x, y, r, r * fy, R[3], 0.75 * a);
    X.ring(c, x, y, r - 3, (r - 3) * fy, R[4], 0.6 * a, t * 0.7, t * 0.7 + Math.PI * 1.2);
    for (let i = 0; i < 6; i++) {
      const ang = t * 0.5 + (i / 6) * TAU, px2 = Math.round(x + Math.cos(ang) * (r - 1.5)), py2 = Math.round(y + Math.sin(ang) * (r - 1.5) * fy);
      if (a < 1 && rand(i, 9) > a) continue;
      const col = dry ? ((i + Math.floor(t * 5)) % 3 ? R[4] : R[3]) : (i + Math.floor(t * 3)) % 6 === 0 ? R[0] : R[1];
      for (const [dx, dy] of RUNES[i]) X.px(c, px2 + dx, py2 + dy, col);
    }
  }
  const fireCol = (age) => EL.fire[age < 0.18 ? 0 : age < 0.38 ? 1 : age < 0.6 ? 2 : age < 0.8 ? 3 : 4];
  function sq(c, x, y, s, col) { const k = Math.max(1, Math.round(s)); X.rect(c, Math.round(x) - (k >> 1), Math.round(y) - (k >> 1), k, k, col); }
  // a pixel flame tongue: stacked rows, outer red -> core yellow
  function tongue(c, x, y, w, h, sway) {
    for (let r = 0; r < h; r++) {
      const k = r / h, hw = w * (1 - k) * (k < 0.25 ? 0.7 + k * 1.2 : 1), xx = x + sway * k * k;
      if (hw < 0.3) { X.px(c, xx, y - r, EL.fire[3]); continue; }
      X.rect(c, Math.round(xx - hw), Math.round(y - r), Math.max(1, Math.round(hw * 2)), 1, EL.fire[4]);
      if (hw > 1) X.rect(c, Math.round(xx - hw * 0.62), Math.round(y - r), Math.max(1, Math.round(hw * 1.24)), 1, k < 0.55 ? EL.fire[2] : EL.fire[3]);
      if (hw > 1.6 && k < 0.5) X.rect(c, Math.round(xx - hw * 0.28), Math.round(y - r), Math.max(1, Math.round(hw * 0.56)), 1, EL.fire[1]);
    }
  }
  // Smoke/dust/steam puff with stepped dither: solid, then 50% checker, then gone
  // (smooth alpha dithering turns small puffs into confetti).
  function puff(c, x, y, r, col, a) { if (a < 0.28) return; X.ellipse(c, x, y, a < 0.55 ? r * 0.8 : r, (a < 0.55 ? r * 0.8 : r) * 0.85, col, a < 0.55 ? 0.5 : 1); }
  // jagged lightning between two points (midpoint displacement, seeded)
  function bolt(a, z, seed, rough = 0.28, depth = 4) {
    let pts = [a, z];
    for (let d = 0; d < depth; d++) {
      const nx = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const off = (rand(seed, d * 64 + i, 7) - 0.5) * L * rough;
        nx.push([(p[0] + q[0]) / 2 - (q[1] - p[1]) / L * off, (p[1] + q[1]) / 2 + (q[0] - p[0]) / L * off], q);
      }
      pts = nx;
    }
    return pts;
  }

  // =====================================================================
  // Readiness swirl: one mote per rune a wizard has READY, in element colours,
  // drifting slowly round them. A deep pool is a big swirl; a depleted wizard has a
  // few dim motes. Motes behind the wizard are dimmer and drawn before it.
  // =====================================================================
  const TEAMI = { p1: 1, p2: 2, p3: 3, p4: 4 };
  const ELI = { water: 0, life: 1, shield: 2, cold: 3, lightning: 4, arcane: 5, sigil: 6, fire: 7, earth: 8 };
  const W1 = TAU / LOOP;   // all motion uses whole cycles per loop, so the loop is seamless
  // The swirl is a chain of motes on a tilted ring round the wizard's waist. Each rune
  // ready is one mote; the elements sit in runs, so the chain's length and colours
  // say how much of what the wizard has. A specialist trails a long ribbon in one
  // colour; a depleted wizard has a short stub.
  const SLOT = 0.5;
  function slotAt(s, k, t) {
    const p1 = s.team === 'p1', r = p1 ? 11.5 : 14, ph = TEAMI[s.team] * 1.7;
    // P1's motes sit close together: a short ribbon rather than a ring of scattered dots
    const a = ph + W1 * 2 * t - k * SLOT * (p1 ? 0.62 : 0.8);
    const z = 10 + (p1 ? 2.5 : 4) * Math.sin(a + ph) + Math.sin(W1 * 7 * t + k) * 0.7;
    return { a, x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r * FY - z, front: Math.sin(a) > -0.1 };
  }
  // P1's HUD already shows the detail: their swirl is a third as dense and dimmer
  const poolScale = (s) => (s.team === 'p1' ? 0.34 : 1);
  function chainOf(s, pool) {
    const out = [], sc = poolScale(s);
    let k = 0;
    for (const el of Object.keys(pool)) {
      const v = pool[el] * sc, n = Math.floor(v + 1e-6), fr = v - n;
      for (let j = 0; j < n; j++) out.push({ el, j, k: k + j, part: 0 });
      if (fr > 0.3) out.push({ el, j: n, k: k + n, part: fr });
      k += v;
    }
    return out;
  }
  // where mote j of element el sat at time t (the prep flight starts there)
  function moteSlot(s, pool, el, j) {
    const sc = poolScale(s); let k = 0;
    for (const e of Object.keys(pool)) { if (e === el) return k + j; k += pool[e] * sc; }
    return k;
  }
  function swirl(c, s, t, V, front) {
    const busy = Math.max(s.cast || 0, s.prep || 0, s.weapon || 0), p1 = s.team === 'p1', big = (PB.viewScale || 3) <= 2;
    for (const m of chainOf(s, s.pool || {})) {
      const q = slotAt(s, m.k, t);
      if (q.front !== front) continue;
      const ramp = EL[m.el];
      if (m.part && Math.floor(t * 4 + m.j) % 2) continue;      // regenerating rune: blinks in
      if (busy > 0.5 && (m.j & 1)) continue;                     // casting: the swirl steps back
      const dim = m.part || busy > 0.5 || p1;
      const v = V(q.x, q.y), b = slotAt(s, m.k + 0.22, t), w = V(b.x, b.y);
      if (big && front && !p1) {
        // at 2x one art pixel is tiny on screen: draw each ready rune as a fatter glyph
        X.rect(c, w[0] - 0.5, w[1] - 0.5, 2, 2, ramp[3]);
        X.rect(c, v[0] - 1, v[1] - 1, 3, 3, dim ? ramp[2] : ramp[1]); X.px(c, v[0], v[1], dim ? ramp[1] : ramp[0]);
        X.px(c, v[0], v[1] - 2, ramp[2]); X.px(c, v[0] - 2, v[1], ramp[2]); X.px(c, v[0] + 2, v[1], ramp[2]); X.px(c, v[0], v[1] + 2, ramp[3]);
      } else if (front && !dim) {
        // a tiny glyph: bright centre, arms in the element colour, a trail behind
        X.px(c, w[0], w[1], ramp[3]);
        X.px(c, v[0] - 1, v[1], ramp[2]); X.px(c, v[0] + 1, v[1], ramp[2]); X.px(c, v[0], v[1] - 1, ramp[2]); X.px(c, v[0], v[1] + 1, ramp[3]);
        X.px(c, v[0], v[1], ramp[0]);
      } else if (front) { X.px(c, v[0], v[1], ramp[p1 ? 2 : 1]); if (!p1) X.px(c, w[0], w[1], ramp[3]); }
      else { X.px(c, v[0], v[1], ramp[dim ? 3 : 2]); X.px(c, w[0], w[1], ramp[4] || ramp[3]); }
    }
  }
  // Prep: queued elements leave the swirl one by one and gather at the staff (or the
  // hands, for a conjured weapon) as a charge in their colours; on cast it releases.
  function prepFx(c, S, A, V, t) {
    for (const s of S.actors) {
      const pi = s.prepInfo, an = A[s.id];
      if (!pi || !an || !an.charge) continue;
      const ch = V(an.charge[0], an.charge[1]), n = pi.qs.length, conj = s.prepKind === 'conjure';
      if (pi.release >= 0) {
        // release: a ring bursts out in the spell's colours, the charge is spent
        const e = pi.release; if (e > 0.2) continue;
        pi.qs.forEach((q, i) => X.ring(c, ch[0], ch[1], 2 + e * 34 + i * 2, (2 + e * 34 + i * 2) * 0.8, EL[q.el][i ? 2 : 1], 1 - e / 0.2));
        if (e < 0.06) { X.rect(c, ch[0] - 2, ch[1] - 2, 5, 5, '#ffffff'); }
        continue;
      }
      let arrived = 0, lastEl = null;
      pi.qs.forEach((q, i) => {
        const e = (t - q.tq) / 0.24;
        if (e < 0) return;
        const ramp = EL[q.el];
        if (e < 1) {
          // in flight from the swirl to the charge point, on a little arc
          const pv = PB._dbg.pool(s.team, q.tq), j = Math.floor(pv[q.el] * poolScale(s) + 1e-6);
          const m0 = slotAt(s, moteSlot(s, pv, q.el, j), q.tq), a = V(m0.x, m0.y), k = smooth(e);
          const x = lerp(a[0], ch[0], k), y = lerp(a[1], ch[1], k) - Math.sin(e * Math.PI) * 5;
          for (let tr = 1; tr <= 3; tr++) { const k2 = smooth(Math.max(0, e - tr * 0.09)); X.px(c, lerp(a[0], ch[0], k2), lerp(a[1], ch[1], k2) - Math.sin(Math.max(0, e - tr * 0.09) * Math.PI) * 5, ramp[tr < 2 ? 2 : 3]); }
          X.rect(c, x - 1, y - 1, 2, 2, ramp[1]); X.px(c, x, y - 1, ramp[0]);
          return;
        }
        arrived++; lastEl = q.el;
        // in the charge: orbiting tight round the gathering point
        const a2 = (i / n) * TAU + t * 7, r = (3.4 + n * 0.6) * (conj ? 1.7 : 1);
        const x = ch[0] + Math.cos(a2) * r, y = ch[1] + Math.sin(a2) * r * 0.75;
        X.px(c, x - Math.cos(a2 - 0.5) * 1.6, y - Math.sin(a2 - 0.5) * 1.2, ramp[3]);
        X.rect(c, x - 0.5, y - 0.5, 2, 2, ramp[0]); X.px(c, x + 1, y + 1, ramp[2]);
        // arrival pulse
        const pe = (t - q.tq - 0.24) / 0.22;
        if (pe >= 0 && pe < 1) { X.ring(c, ch[0], ch[1], 2 + pe * 7, (2 + pe * 7) * 0.8, ramp[pe < 0.4 ? 0 : 1], 1 - pe); if (pe < 0.25) X.rect(c, ch[0] - 1, ch[1] - 1, 3, 3, '#ffffff'); }
      });
      if (arrived) {
        X.glow(c, ch[0], ch[1], (5 + arrived * 2.4) * (conj ? 1.5 : 1), conj ? EL.arcane[2] : EL[lastEl][2], 0.75 + 0.15 * Math.sin(t * 30));
        X.ring(c, ch[0], ch[1], (3.4 + n * 0.6) * (conj ? 1.7 : 1), (3.4 + n * 0.6) * 0.75 * (conj ? 1.7 : 1), EL[lastEl][3], 0.5);
        if (conj) {
          // the weapon taking shape: a hammer head sketched in conjuring light, growing per rune
          const hw = 2 + arrived * 1.6, hh = 1 + arrived, hy = ch[1] - 3 - arrived;
          for (let x = -hw; x <= hw; x++) for (const y of [-hh, hh]) if ((x + y + Math.floor(t * 20)) % 3) X.px(c, ch[0] + x, hy + y, x & 1 ? '#ffc0e0' : EL.arcane[2]);
          for (let y = -hh; y <= hh; y++) { X.px(c, ch[0] - hw, hy + y, '#ffc0e0'); X.px(c, ch[0] + hw, hy + y, '#ffc0e0'); }
          X.line(c, ch[0], hy + hh + 1, ch[0], ch[1] + 2, '#ff2d8a');
        }
        X.rect(c, ch[0] - 1, ch[1] - 1, 2, 2, EL[lastEl][1]); X.px(c, ch[0], ch[1], arrived === n ? '#ffffff' : EL[lastEl][0]);
      }
    }
  }

  function effects(c, S, A, V, t, chaos, dens) {
    const VA = (p) => V(p[0], p[1]);
    // ---- staff orb halos ----
    for (const s of S.actors) if (s.kind === 'wizard' && A[s.id] && A[s.id].tip) { const p = VA(A[s.id].tip); X.glow(c, p[0], p[1], 5 + (s.cast ? 2 : 0), EL[s.el][2], 0.55); }
    // ---- fire turret: flames licking off the orb ----
    {
      const T = S.turret, v = V(T.x, T.y - T.orbZ);
      if (!T.dry) {
        X.glow(c, v[0], v[1] - 7, 4 + T.charge * 3, EL.fire[2], 0.4 + T.charge * 0.3);   // a small glow at the tip, so the crystal's facets stay visible
        for (const p of emit(t, 16 * dens, 0.5, (i, age) => ({ x: v[0] + (rand(i, 5) - 0.5) * 5 + Math.sin(age * 8 + i) * 1, y: v[1] - 7 - age * 9, age }))) X.px(c, p.x, p.y, fireCol(p.age));   // off the crystal's tip
      } else {
        // waiting on Red: the ember sputters thin grey smoke and the odd spark
        X.glow(c, v[0], v[1] + 1, 5, EL.fire[4], 0.45);
        for (const p of emit(t, 6, 1.1, (i, age) => ({ x: v[0] + (rand(i, 6) - 0.5) * 3 + age * 4 + Math.sin(age * 5 + i), y: v[1] - 1 - age * 13, age }))) puff(c, p.x, p.y, 0.8 + p.age * 2, '#4a4458', (1 - p.age) * 0.8 * T.dry);
        if (Math.floor(t * 9) % 4 === 0) X.px(c, v[0] + (rand(Math.floor(t * 9), 7) - 0.5) * 4, v[1] - 3, EL.fire[2]);
      }
      // each shot's Fire rune flies from Red to the turret (Red pays for every bolt)
      const red = A.p1 && A.p1.chest;
      if (red) for (const mo of T.motes) {
        const o = VA(red), k = smooth(mo.k), AR = 14, at = (q) => { const s2 = smooth(q); return [lerp(o[0], v[0], s2), lerp(o[1], v[1], s2) - Math.sin(q * Math.PI) * AR]; };
        // a faint thread along the arc, so the pull from Red reads even in a still frame
        for (let q = 0; q <= 1; q += 0.06) if (Math.floor(q / 0.06 + t * 20) % 2) { const p = at(q); X.px(c, p[0], p[1], EL.fire[4]); }
        const [x, y] = at(mo.k);
        for (let tr = 1; tr <= 5; tr++) { const p = at(Math.max(0, mo.k - tr * 0.06)); X.px(c, p[0], p[1], EL.fire[tr < 2 ? 1 : tr < 4 ? 2 : 3]); }
        X.glow(c, x, y, 5, EL.fire[2], 0.7);
        X.rect(c, x - 1, y - 1, 3, 3, EL.fire[2]); X.px(c, x, y - 2, EL.fire[1]); X.px(c, x, y - 1, EL.fire[0]); X.px(c, x, y, '#ffffff');
        if (mo.k < 0.3) X.ring(c, o[0], o[1], 2 + mo.k * 18, (2 + mo.k * 18) * 0.8, EL.fire[1], 1 - mo.k / 0.3);
      }
    }
    // ---- grass fires (chaos) ----
    for (const f of S.fires) {
      const v = V(f.x, f.y);
      for (let k = 0; k < 5; k++) { const kx = (rand(k, f.rank * 99) - 0.5) * f.r * 1.4, ky = (rand(k, 7, f.rank * 99) - 0.5) * f.r * 0.5; tongue(c, v[0] + kx, v[1] + ky, 2.2, 5 + Math.sin(t * 13 + k * 2) * 2 + rand(k, 8) * 3, Math.sin(t * 6 + k) * 1.5); }
      for (const p of emit(t, 10 * dens, 1.1, (i, age) => ({ x: v[0] + (rand(i, 3, f.rank * 99) - 0.5) * f.r + Math.sin(age * 5 + i) * 3, y: v[1] - 4 - age * 26, age }))) X.px(c, p.x, p.y, p.age < 0.5 ? EL.fire[1] : EL.fire[3]);
    }
    // ---- burning actors (pass 4: on the body, no symbol over the head) ----
    // The body itself flickers in fire colours (actors.js, burning). Here only short
    // licks hugging the body's outline and embers peeling off it, none rising far.
    for (const s of S.actors) if (s.burn > 0.05) {
      const a = A[s.id]; if (!a || !a.chest) continue;
      const big = s.kind === 'brute', k = s.burn, ch = VA(a.chest);
      const spots = big ? [[-5, -2, 2.2], [4, -5, 2.4], [6, 1, 2], [-2, 2, 2]] : [[-1, 0, 1.4], [2, 2, 1.2]];
      spots.forEach(([dx, dy, w], j) => tongue(c, ch[0] + dx, ch[1] + dy, w * (0.6 + 0.4 * k), (3 + 2 * Math.sin(t * 14 + j * 1.9)) * k * (big ? 1.2 : 0.8), Math.sin(t * 7 + j)));
      for (const p of emit(t, (big ? 22 : 9) * dens, 0.4, (i, age) => ({ x: ch[0] + (rand(i, 1, s.seed) - 0.5) * (big ? 16 : 7) + Math.sin(age * 7 + i) * 1.2, y: ch[1] + (rand(i, 2, s.seed) - 0.3) * (big ? 14 : 8) - age * 9, age }))) if (rand(p.x | 0, 3) < k + 0.2) X.px(c, p.x, p.y, fireCol(0.2 + p.age * 0.8));
    }
    // ---- wet: drips running off the body to the ground ----
    for (const s of S.actors) if (s.wet > 0.3 && s.frozen < 0.3) { const a = A[s.id]; if (!a || !a.chest) continue; const ch = VA(a.chest), g = V(s.x, s.y - s.z); for (const p of emit(t, 6, 0.45, (i, age) => ({ x: ch[0] + (rand(i, 9, s.seed) - 0.5) * 7, y: lerp(ch[1] + 1, g[1], age * age), age }))) X.px(c, p.x, p.y, '#8ad0ff'); }
    // ---- frozen actors: glints on the ice that holds them (inside the block) ----
    for (const s of S.actors) if (s.frozen > 0.4) { const v = V(s.x, s.y - s.z), hgt = (PB.actors.HEIGHT[s.kind] + 3) * s.frozen, w = PB.actors.WIDTH[s.kind] + 1; for (let k = 0; k < 2; k++) { const ph = mod(t * 0.7 + k * 0.5 + s.seed * 0.13, 1); if (ph > 0.18) continue; const x = v[0] + (rand(k, Math.floor(t * 0.7 + k * 0.5), s.seed) - 0.5) * 2 * w, y = v[1] - 2 - rand(k, 5, s.seed) * hgt * 0.8; X.px(c, x, y, '#ffffff'); if (ph < 0.09) { X.px(c, x - 1, y, '#bfeefc'); X.px(c, x + 1, y, '#bfeefc'); } } }
    // ---- sprays ----
    for (const sp of S.sprays) {
      const a = A[sp.from] && A[sp.from].tip; if (!a) continue;
      const o = VA(a), z = V(sp.to[0], sp.to[1] - (sp.wide ? 4 : 8)), dx = z[0] - o[0], dy = z[1] - o[1], Lz = Math.hypot(dx, dy), ux = dx / Lz, uy = dy / Lz;
      const spread = sp.wide ? 0.5 : 0.24, on = Math.min(seg(t, sp.from0, sp.from0 + 0.15), 1 - seg(t, sp.to0 - 0.12, sp.to0));
      if (sp.kind === 'water') {
        for (const p of emit(t, 110 * dens, 0.42, (i, age, ts) => {
          if (ts < sp.from0 || ts > sp.to0 - 0.1) return null;
          const ang = (rand(i, 1) - 0.5) * 2 * spread, d = age * Lz * (0.92 + rand(i, 2) * 0.25), cs = Math.cos(ang), sn = Math.sin(ang);
          const vx = ux * cs - uy * sn, vy = ux * sn + uy * cs;
          return { x: o[0] + vx * d, y: o[1] + vy * d - Math.sin(age * Math.PI) * 6 + age * age * 4, age, r: rand(i, 3) };
        })) sq(c, p.x, p.y, p.age < 0.5 && p.r > 0.6 ? 2 : 1, p.r > 0.5 ? EL.water[2] : EL.water[1]);
        for (const p of emit(t, 30 * dens, 0.3, (i, age, ts) => { if (ts < sp.from0 + 0.3 || ts > sp.to0) return null; const a2 = rand(i, 4) * TAU; return { x: z[0] + (rand(i, 5) - 0.5) * 40 + Math.cos(a2) * age * 6, y: z[1] + 8 + (rand(i, 6) - 0.5) * 14 - Math.sin(age * Math.PI) * 5, age }; })) X.px(c, p.x, p.y, '#bfe4ff');
        X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 6, EL.water[1], 0.7 * on);
      } else {
        for (const p of emit(t, 70 * dens, 0.6, (i, age, ts) => {
          if (ts < sp.from0 || ts > sp.to0 - 0.1) return null;
          const ang = (rand(i, 11) - 0.5) * 2 * spread, d = easeOut(age) * Lz * (0.85 + rand(i, 12) * 0.3), cs = Math.cos(ang), sn = Math.sin(ang);
          const vx = ux * cs - uy * sn, vy = ux * sn + uy * cs, sw = Math.sin(age * 9 + i) * 2;
          return { x: o[0] + vx * d - vy * sw, y: o[1] + vy * d + vx * sw, age, r: rand(i, 13) };
        })) {
          if (p.r > 0.82 && p.age < 0.7) { X.px(c, p.x, p.y, '#ffffff'); X.px(c, p.x - 1, p.y, EL.cold[2]); X.px(c, p.x + 1, p.y, EL.cold[2]); X.px(c, p.x, p.y - 1, EL.cold[2]); X.px(c, p.x, p.y + 1, EL.cold[2]); }
          else X.px(c, p.x, p.y, p.age < 0.4 ? EL.cold[1] : p.age < 0.75 ? EL.cold[2] : EL.cold[3]);
        }
        for (const p of emit(t, 14 * dens, 0.9, (i, age, ts) => { if (ts < sp.from0 || ts > sp.to0) return null; const d = easeOut(age) * Lz; return { x: o[0] + ux * d + (rand(i, 14) - 0.5) * 10 * age, y: o[1] + uy * d + (rand(i, 15) - 0.5) * 8 * age, age }; })) X.glow(c, p.x, p.y, 3 + p.age * 7, '#e0ffff', 0.35 * (1 - p.age));
        X.glow(c, o[0] + ux * 3, o[1] + uy * 3, 7, EL.cold[1], 0.8 * on);
      }
    }
    // ---- the beam: arcane carrying fire reads as a FIRE beam ----
    // Payload look rule: the strongest element sets the form (arcane: a beam) and the
    // attached element sets the look (fire). So it is a straight, sustained beam drawn
    // entirely in fire: a white-hot core, orange body, a ragged red rim, flame licks
    // peeling up off its top edge and travelling toward the target, embers falling off.
    if (S.beam && A.p1 && A.bruteA) {
      const o = VA(A.p1.tip), z = VA(A.bruteA.chest), on = S.beam.on;
      const dx = z[0] - o[0], dy = z[1] - o[1], Lb = Math.hypot(dx, dy), ux = dx / Lb, uy = dy / Lb, nx = -uy, ny = ux;
      const len = Lb * on;
      const n = Math.max(8, Math.round(len / 2));
      const core = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, d = k * len, env = Math.min(1, k * 6) * Math.min(1, (1 - k) * 8 + 0.3);
        const j = (Math.sin(d * 0.35 - t * 30) * 0.6 + Math.sin(d * 0.9 + t * 21) * 0.3) * env;
        core.push([o[0] + ux * d + nx * j, o[1] + uy * d + ny * j, d, env]);
      }
      // ragged outer rim: the body swells and thins in pulses that run down the beam
      for (let i = 1; i < core.length; i++) {
        const p = core[i - 1], q = core[i], sw = 0.5 + 0.5 * Math.sin(q[2] * 0.28 - t * 26), w = Math.round(5 + sw * 2 * q[3]);
        X.line(c, p[0], p[1], q[0], q[1], EL.fire[5], w + 2);
      }
      for (let i = 1; i < core.length; i++) {
        const p = core[i - 1], q = core[i], sw = 0.5 + 0.5 * Math.sin(q[2] * 0.28 - t * 26), w = Math.round(5 + sw * 2 * q[3]);
        X.line(c, p[0], p[1], q[0], q[1], EL.fire[4], w);
      }
      X.lines(c, core, EL.fire[3], 4); X.lines(c, core, EL.fire[2], 2); X.lines(c, core, EL.fire[1], 1);
      for (let i = 1; i < core.length; i++) if ((i + Math.floor(t * 30)) % 4 === 0) X.px(c, core[i][0], core[i][1], (i + Math.floor(t * 30)) % 8 ? EL.fire[0] : '#ffffff');
      // flame licks rising off the top edge, carried along the beam
      const NL = Math.max(4, Math.round(len / 9));
      for (let k = 0; k < NL; k++) {
        const p = mod(t * 0.9 + k / NL + rand(k, 31) * 0.05, 1), d = p * Lb; if (d > len - 3 || d < 4) continue;
        const env = Math.min(1, p * 6) * Math.min(1, (1 - p) * 5);
        const bx = o[0] + ux * d, by = o[1] + uy * d - 2;
        const life = mod(t * 3.1 + rand(k, 32), 1), h = (3 + rand(k, 33) * 4) * Math.sin(life * Math.PI) * env;
        if (h > 1) tongue(c, bx, by, 1.3 + rand(k, 34) * 0.8, h, -ux * 2 + Math.sin(t * 9 + k) * 1.2);
        if (rand(k, Math.floor(t * 10), 35) < 0.3) X.px(c, bx + (rand(k, 36) - 0.5) * 3, by + 5, EL.fire[3]);   // a drip off the underside
      }
      // embers shed by the beam drift down and fade
      for (const p of emit(t, 26 * dens, 0.6, (i, age) => { const d = rand(i, 37) * len; return { x: o[0] + ux * d + (rand(i, 38) - 0.5) * 4, y: o[1] + uy * d + 2 + age * 8, age }; })) X.px(c, p.x, p.y, fireCol(0.3 + p.age * 0.7));
      if (on > 0.9) {
        // where it lands: a roaring splash of fire
        X.glow(c, z[0], z[1], 12, EL.fire[3], 0.8); X.glow(c, z[0], z[1], 8, EL.fire[1], 0.7);
        sq(c, z[0], z[1], 3 + (Math.floor(t * 20) % 2) * 2, '#fff4c0');
        for (const p of emit(t, 40 * dens, 0.35, (i, age) => { const a2 = Math.atan2(-uy, -ux) + (rand(i, 21) - 0.5) * 2.6, sp = 18 + rand(i, 22) * 20; return { x: z[0] + Math.cos(a2) * sp * age, y: z[1] + Math.sin(a2) * sp * age - age * 10, age, r: rand(i, 23) }; })) sq(c, p.x, p.y, p.r < 0.3 && p.age < 0.4 ? 2 : 1, fireCol(p.age));
        for (let k = 0; k < 3; k++) tongue(c, z[0] + (k - 1) * 3, z[1] + 2, 2, (6 + 3 * Math.sin(t * 15 + k * 2)), Math.sin(t * 8 + k) * 2);
      }
      // the staff end: a flare of fire
      X.glow(c, o[0], o[1], 7, EL.fire[2], 0.85); sq(c, o[0], o[1], 3, EL.fire[1]); X.px(c, o[0], o[1], '#ffffff');
    }
    // ---- chain lightning through the wet group ----
    if (S.chain) {
      const ch = S.chain, nodes = [A.p3 && A.p3.tip, ...ch.through.map((id) => A[id] && A[id].chest)].filter(Boolean).map(VA);
      const lit = Math.floor(t * 18) % 3 !== 2;
      if (lit) {
        for (let i = 1; i < nodes.length; i++) {
          const pts = bolt(nodes[i - 1], nodes[i], ch.seed * 13 + i, 0.32, 4);
          X.lines(c, pts, EL.lightning[3], 3); X.lines(c, pts, EL.lightning[1], 1);
          for (let k = 0; k < 2; k++) { const j = 3 + Math.floor(rand(ch.seed, i, k) * (pts.length - 6)), p = pts[j], a2 = rand(ch.seed, i, k + 5) * TAU; const br = bolt(p, [p[0] + Math.cos(a2) * 9, p[1] + Math.sin(a2) * 7], ch.seed + i * 7 + k, 0.5, 2); X.lines(c, br, EL.lightning[2], 1); }
        }
        for (const p of nodes.slice(1)) { X.glow(c, p[0], p[1], 9, EL.lightning[2], 0.8); for (let k = 0; k < 5; k++) { const a2 = rand(ch.seed, k, 3) * TAU; X.line(c, p[0], p[1], p[0] + Math.cos(a2) * 5, p[1] + Math.sin(a2) * 4, '#ffffff'); } }
        // the current runs through the puddle too
        const pv = V(MAP.PUD.x, MAP.PUD.y);
        for (let k = 0; k < 26; k++) { const a2 = rand(ch.seed, k, 11) * TAU, r = Math.sqrt(rand(ch.seed, k, 12)); X.px(c, pv[0] + Math.cos(a2) * r * 40, pv[1] + Math.sin(a2) * r * 14, k % 3 ? EL.lightning[1] : '#ffffff'); }
      }
    }
    // ---- chaos: sky strikes ----
    for (const st of S.strikes) {
      if (st.e < -0.1 || st.e > 0.5) continue;
      const v = V(st.x, st.y);
      if (st.e < 0.25 && Math.floor(t * 30) % 2 === 0) { const pts = bolt([v[0] + 20, -10], v, st.seed + Math.floor(t * 30), 0.25, 5); X.lines(c, pts, EL.lightning[3], 3); X.lines(c, pts, '#ffffff', 1); }
      if (st.e > 0) { X.ring(c, v[0], v[1], 4 + st.e * 40, (4 + st.e * 40) * FY, EL.lightning[1], 1 - st.e * 2); for (let k = 0; k < 8; k++) { const a2 = rand(st.seed, k) * TAU, d = st.e * 30; X.px(c, v[0] + Math.cos(a2) * d, v[1] + Math.sin(a2) * d * FY - Math.sin(st.e * 6) * 6, '#ffffff'); } }
    }
    // ---- arrows ----
    for (const ar of S.arrows) {
      const v = V(ar.x, ar.y), cs = Math.cos(ar.ang), sn = Math.sin(ar.ang);
      X.line(c, v[0] - cs * 4, v[1] - sn * 4, v[0] + cs * 2, v[1] + sn * 2, '#e8d8b0');
      X.px(c, v[0] + cs * 3, v[1] + sn * 3, '#ffffff'); X.px(c, v[0] - cs * 5, v[1] - sn * 5, '#c87a6a');
    }
    for (const rp of S.shield.ripples) if (rp.e < 0.25) {
      const Sh = S.shield, sp = Sh.at(rp.f), v = V(sp[0], sp[1] - rp.hz);
      for (let k = 0; k < 6; k++) { const a2 = rand(rp.cyc, k, 5) * TAU, d = rp.e * 40; X.px(c, v[0] + Math.cos(a2) * d, v[1] + Math.sin(a2) * d * 0.7 + rp.e * rp.e * 30, k % 2 ? '#ffffff' : EL.shield[1]); }
    }
    // upkeep: every arrow the shield absorbs pulls a shield rune out of Gold, which
    // streaks from Gold's swirl to where the arrow struck
    if (A.p3 && A.p3.chest) for (const dr of S.shield.drains) {
      if (dr.e > 0.32) continue;
      const o = VA(A.p3.chest), sp = S.shield.at(dr.f), z = V(sp[0], sp[1] - dr.hz), k = smooth(dr.e / 0.32);
      const x = lerp(o[0], z[0], k), y = lerp(o[1], z[1], k) - Math.sin(k * Math.PI) * 6;
      for (let tr = 1; tr <= 4; tr++) { const k2 = smooth(Math.max(0, dr.e / 0.32 - tr * 0.1)); X.px(c, lerp(o[0], z[0], k2), lerp(o[1], z[1], k2) - Math.sin(k2 * Math.PI) * 6, EL.shield[tr < 3 ? 2 : 3]); }
      X.rect(c, x - 1, y - 1, 2, 2, EL.shield[1]); X.px(c, x, y - 1, '#ffffff');
    }
    // ---- turret bolts ----
    for (const bo of S.bolts) {
      const p = VA(boltPos(bo, bo.k));
      for (let j = 8; j >= 1; j--) { const q = VA(boltPos(bo, Math.max(0, bo.k - j * 0.035))); sq(c, q[0], q[1], j < 3 ? 2 : 1, EL.fire[Math.min(5, 1 + (j >> 1))]); }
      X.glow(c, p[0], p[1], 6, EL.fire[2], 0.7);
      sq(c, p[0], p[1], 4, EL.fire[3]); sq(c, p[0], p[1], 2, EL.fire[1]); X.px(c, p[0], p[1] - 1, '#ffffff');
    }
    for (const im of S.impacts) {
      const v = V(im.x, im.y - im.z);
      if (im.e < 0.3) { X.ring(c, v[0], v[1] + im.z * 0.6, 3 + im.e * 45, (3 + im.e * 45) * FY, EL.fire[1], 1 - im.e / 0.3); if (im.e < 0.06) sq(c, v[0], v[1], 7, '#ffffff'); }
      if (im.e < 0.6) for (let k = 0; k < 12; k++) { const a2 = rand(im.seed, k, 1) * TAU, sp = 25 + rand(im.seed, k, 2) * 35, d = sp * easeOut(Math.min(1, im.e / 0.6)) * 0.6; X.px(c, v[0] + Math.cos(a2) * d, v[1] + Math.sin(a2) * d * 0.7 + im.e * im.e * 40, fireCol(im.e / 0.6)); }
      if (im.steam) {
        // fire meets ice: a burst of steam that rolls up and out
        for (let k = 0; k < 16; k++) {
          const a2 = rand(im.seed, k, 3) * TAU, sp = 10 + rand(im.seed, k, 4) * 26, life = 1.2 + rand(im.seed, k, 5) * 0.9, age = im.e / life;
          if (age >= 1) continue;
          const d = sp * easeOut(age);
          puff(c, v[0] + Math.cos(a2) * d * 1.3, v[1] + 4 + Math.sin(a2) * d * 0.5 - age * 22, 2 + age * 6, age < 0.3 ? '#ffffff' : k % 2 ? EL.steam[1] : EL.steam[2], (1 - age) * 0.8);
        }
      }
    }
    // ---- frozen goblins shatter ----
    for (const sh of S.shatters) {
      const v = V(sh.x, sh.y);
      if (sh.e < 0.12) X.ellipse(c, v[0], v[1] - 8, 8, 9, '#ffffff', 1 - sh.e / 0.12);
      for (let k = 0; k < 16; k++) {
        const a2 = rand(sh.seed, k, 41) * TAU, sp = 18 + rand(sh.seed, k, 42) * 34, vz = 30 + rand(sh.seed, k, 43) * 50, e = sh.e;
        let z = 8 + vz * e - 110 * e * e; const land = z < 0; if (land) z = 0;
        const d = sp * Math.min(e, 0.55 + e * 0.15);
        if (e > 1.4 && rand(sh.seed, k, 44) < (e - 1.4) / 0.8) continue;
        const col = [EL.cold[0], EL.cold[2], EL.cold[3], EL.cold[4]][k % 4], s = k % 3 === 0 ? 2 : 1;
        sq(c, v[0] + Math.cos(a2) * d, v[1] + Math.sin(a2) * d * FY - z, s, col);
      }
    }
    // ---- hits on the walls: a flash, chips of stone (and rime) thrown out, dust ----
    for (const h of S.wallHits) {
      const v = V(h.x, h.y - h.z), frost = h.mat === 'frost', e = h.e, nChip = h.big ? 22 : 9;
      if (e < 0.07) { X.glow(c, v[0], v[1], h.big ? 10 : 6, frost ? '#e8ffff' : '#f0d8b0', 1); sq(c, v[0], v[1], h.big ? 4 : 2, '#ffffff'); }
      for (let k = 0; k < nChip; k++) {
        const a2 = rand(k, h.x | 0, 51) * TAU, sp = (h.big ? 22 : 12) + rand(k, 52, h.p * 99) * (h.big ? 40 : 22), vz = 24 + rand(k, 53) * 50;
        let z = vz * e - 130 * e * e; const land = z < -h.z * 0.6; if (land) z = -h.z * 0.6;
        const dd = sp * Math.min(e, 0.45 + e * 0.1);
        if (e > 0.9 && rand(k, 55) < (e - 0.9) / 0.5) continue;
        const col = frost && k % 3 === 0 ? [EL.cold[0], EL.cold[2]][k % 2] : (frost ? ['#a6aec0', '#6c748c', '#c6ccd8'] : [EARTH[1], EARTH[3], EARTH[4]])[k % 3];
        sq(c, v[0] + Math.cos(a2) * dd, v[1] + Math.sin(a2) * dd * 0.6 - z, k % 4 === 0 && h.big ? 2 : 1, col);
      }
      const nP = h.big ? 12 : 6;
      for (let k = 0; k < nP; k++) { const age = e / (h.big ? 1.4 : 1.0); if (age >= 1) continue; const a2 = rand(k, h.x | 0, 57) * TAU, d = 4 + age * (h.big ? 26 : 15); puff(c, v[0] + Math.cos(a2) * d, v[1] + h.z * 0.7 + Math.sin(a2) * d * 0.45 - age * 8, 1.5 + age * (h.big ? 6 : 4), frost ? (k % 2 ? '#d8f4ff' : '#8a90a8') : '#7a6a5a', (1 - age) * 0.8); }
    }
    // ---- runes flying from a caster to the wall or device they are raising ----
    for (const lk of S.links) {
      const a = A[lk.from] && A[lk.from].tip; if (!a) continue;
      const o = VA(a), z = V(lk.to[0], lk.to[1]), T0 = PB.MAP.LINK_T;
      lk.els.forEach((el, j) => {
        const k = clamp((lk.e - j * 0.03) / T0, 0, 1); if (k <= 0 || lk.e > T0 + 0.25) return;
        const x = lerp(o[0], z[0], smooth(k)), y = lerp(o[1], z[1], smooth(k)) - Math.sin(k * Math.PI) * 10;
        for (let tr = 1; tr <= 4; tr++) { const k2 = smooth(Math.max(0, k - tr * 0.12)); X.px(c, lerp(o[0], z[0], k2), lerp(o[1], z[1], k2) - Math.sin(Math.max(0, k - tr * 0.12) * Math.PI) * 10, EL[el][tr < 2 ? 1 : 3]); }
        if (k < 1) { X.rect(c, x - 1, y - 1, 3, 3, EL[el][1]); X.px(c, x, y, '#ffffff'); }
      });
      // where it lands: a ring in the spell's colours
      const re = lk.e - T0;
      if (re >= 0 && re < 0.3) lk.els.forEach((el, j) => X.ring(c, z[0], z[1], 3 + re * 60 + j * 3, (3 + re * 60 + j * 3) * FY * 0.6, EL[el][1 + (j & 1)], 1 - re / 0.3));
    }
    // ---- glyph eruption ----
    const G = S.glyph;
    if (G.erupt >= 0 && G.erupt < 1.4) {
      const v = V(G.x, G.y), e = G.erupt;
      if (e < 0.08) X.ellipse(c, v[0], v[1], 16, 10, '#ffffff');
      if (e < 0.45) { X.ring(c, v[0], v[1], 8 + e * 110, (8 + e * 110) * FY, EL.shield[1], 1 - e / 0.45); X.ring(c, v[0], v[1], 6 + e * 80, (6 + e * 80) * FY, '#ffffff', 0.8 - e / 0.45); }
      for (let k = 0; k < 22; k++) {
        const a2 = rand(k, 85) * TAU, life = 0.8 + rand(k, 86) * 0.7, age = e / life; if (age >= 1) continue;
        const d = (8 + rand(k, 87) * 10) + easeOut(age) * (14 + rand(k, 88) * 22), r = 1.2 + rand(k, 89) * 2 + age * 2.5;
        const px2 = v[0] + Math.cos(a2) * d, py2 = v[1] + Math.sin(a2) * d * FY - age * (4 + rand(k, 90) * 8);
        puff(c, px2 + 0.5, py2 + 1, r, '#4a4038', (1 - age) * 0.95); puff(c, px2, py2, r * 0.8, '#8a7a68', (1 - age) * 0.95);
      }
      for (let k = 0; k < 18; k++) { const a2 = rand(k, 81) * TAU, sp = 20 + rand(k, 82) * 40, vz = 40 + rand(k, 83) * 60; let z = vz * e - 140 * e * e; if (z < 0 && e > 0.3) continue; X.rect(c, v[0] + Math.cos(a2) * sp * e, v[1] + Math.sin(a2) * sp * e * FY - Math.max(0, z), k % 3 ? 1 : 2, k % 3 ? 1 : 2, EARTH[k % 2 ? 2 : 4]); }
    }
    // ---- hammer impacts ----
    for (const hh of S.hammerHits) {
      if (hh.e > 0.5) continue;
      const v = V(hh.x, hh.y - 8), k = 1 - hh.e / 0.5, r = (hh.big ? 9 : 6) * (0.6 + hh.e);
      if (hh.e < 0.07) { for (let i = 0; i < 8; i++) { const a2 = (i / 8) * TAU; X.line(c, v[0], v[1], v[0] + Math.cos(a2) * r * (i % 2 ? 0.5 : 1), v[1] + Math.sin(a2) * r * (i % 2 ? 0.5 : 1), '#ffffff'); } }
      else for (let i = 0; i < 8; i++) { const a2 = (i / 8) * TAU + 0.3; X.px(c, v[0] + Math.cos(a2) * r * 1.4, v[1] + Math.sin(a2) * r, k > 0.5 ? '#ffc0e0' : '#ff2d8a'); }
      if (hh.big) X.ring(c, v[0], v[1] + 8, 4 + hh.e * 50, (4 + hh.e * 50) * FY, '#ff6ab0', k);
    }
    // ---- death puffs ----
    for (const dp of S.deaths) {
      const v = V(dp.x, dp.y);
      for (let k = 0; k < (dp.big ? 9 : 5); k++) { const age = dp.e / 1.4, a2 = rand(dp.seed, k, 91) * TAU, d = (dp.big ? 12 : 7) * easeOut(age); puff(c, v[0] + Math.cos(a2) * d, v[1] - 3 + Math.sin(a2) * d * 0.5 - age * 8, (dp.big ? 3 : 2) + age * 3, '#6a6478', (1 - age) * 0.7); }
    }
    // ---- chaos: meteors ----
    for (const mt of S.meteors) {
      if (mt.e < 0) {
        const k = 1 + mt.e / 0.6, x = mt.x + 70 * (1 - k), y = mt.y - 170 * (1 - k), v = V(x, y);
        for (let j = 1; j <= 10; j++) { const q = V(x + 70 * j * 0.025, y - 170 * j * 0.025); sq(c, q[0], q[1], j < 4 ? 3 : j < 7 ? 2 : 1, EL.fire[Math.min(5, 1 + (j >> 1))]); }
        X.glow(c, v[0], v[1], 9, EL.fire[2], 0.8); sq(c, v[0], v[1], 5, EL.fire[3]); sq(c, v[0], v[1], 3, EL.fire[1]);
        const sh = V(mt.x, mt.y); X.ellipse(c, sh[0], sh[1], 3 + k * 8, (3 + k * 8) * 0.4, '#140e10', 0.5);
      } else if (mt.e < 1.8) {
        const v = V(mt.x, mt.y), e = mt.e;
        if (e < 0.1) X.ellipse(c, v[0], v[1] - 6, 18, 12, '#fff4c0', 1 - e / 0.1);
        if (e < 0.4) X.ring(c, v[0], v[1], 6 + e * 100, (6 + e * 100) * FY, EL.fire[1], 1 - e / 0.4);
        for (let k = 0; k < 16; k++) { const a2 = rand(mt.seed, k, 1) * TAU, sp = 20 + rand(mt.seed, k, 2) * 40, vz = 40 + rand(mt.seed, k, 3) * 60; let z = vz * e - 130 * e * e; if (z < 0) continue; X.px(c, v[0] + Math.cos(a2) * sp * e, v[1] + Math.sin(a2) * sp * e * FY - z, fireCol(e / 1.2)); }
        for (let k = 0; k < 8; k++) { const age = e / 1.8, a2 = rand(mt.seed, k, 4) * TAU, d = 6 + age * 20; puff(c, v[0] + Math.cos(a2) * d, v[1] - 6 + Math.sin(a2) * d * 0.4 - age * 20, 3 + age * 5, '#3a3448', (1 - age) * 0.7); }
        if (e < 1.2) for (let k = 0; k < 4; k++) tongue(c, v[0] + (rand(mt.seed, k, 5) - 0.5) * 20, v[1] + (rand(mt.seed, k, 6) - 0.5) * 6, 2.4, (5 + Math.sin(t * 12 + k) * 2) * (1 - e / 1.2), Math.sin(t * 6 + k));
      }
    }
    // ---- fireflies over the clearing, embers drifting through the dusk ----
    for (let i = 0; i < 14; i++) {
      const fx = 400 + rand(i, 101) * 460 + Math.sin(t * 0.52 * TAU / 6 + i) * 12, fy = 470 + rand(i, 102) * 150 + Math.sin(t * 0.8 + i * 2) * 6 - Math.cos(t * 0.3 + i) * 4;
      const blink = Math.sin(t * (1.2 + rand(i, 103)) * TAU / 2 + i * 3);
      if (blink < 0.2) continue;
      const v = V(fx, fy - 8);
      X.px(c, v[0], v[1], blink > 0.7 ? '#f4ffb0' : '#a8d860'); if (blink > 0.8) X.glow(c, v[0], v[1], 3, '#c8f080', 0.4);
    }
    prepFx(c, S, A, V, t);
    for (const p of emit(t, 3 + chaos * 6, 4, (i, age) => ({ x: 560 + rand(i, 111) * 200 + age * 40 + Math.sin(age * 6 + i) * 8, y: 140 + rand(i, 112) * 180 - age * 60, age }))) { const v = V(p.x, p.y); X.px(c, v[0], v[1], p.age < 0.6 ? EL.fire[1] : EL.fire[3]); }
  }

  // =====================================================================
  // HUD: the player's rune pools
  // =====================================================================
  function hud(c, S, LW, LH, t) {
    // Pass 4: two rows laid out like the keys under the left hand, staggered like a
    // keyboard: Q W E R on top, A S D F G below and shifted right by a third of a key.
    const R = S.runes, slot = 24, rh = 21, stag = Math.round(slot / 3), top = R.slice(0, 4), bot = R.slice(4);
    const w = Math.max(top.length * slot, stag + bot.length * slot) + 6, h = rh * 2 + 7, tab = LW >= w + 34;
    const x0 = Math.round(LW / 2 - w / 2 + (tab ? 7 : 0)), y0 = LH - h - 4;
    // the backing plate follows the stagger: the top row is narrower than the bottom
    X.rect(c, x0 - 1, y0 - 1, top.length * slot + 8, rh + 5, '#0a0810'); X.rect(c, x0 - 1, y0 + rh + 2, w + 2, rh + 6, '#0a0810');
    X.rect(c, x0, y0, top.length * slot + 6, rh + 5, '#141220'); X.rect(c, x0, y0 + rh + 3, w, rh + 4, '#141220');
    X.rect(c, x0, y0, top.length * slot + 6, 1, '#3a3450');
    // the player's colour tab
    if (tab) { X.rect(c, x0 - 14, y0 + rh - 4, 13, 15, '#0a0810'); X.rect(c, x0 - 13, y0 + rh - 3, 12, 13, X.TEAM.p1.dark); X.text(c, 'P1', x0 - 11, y0 + rh + 1, X.TEAM.p1.light); }
    R.forEach((r, i) => {
      const row = i < 4 ? 0 : 1, col = row ? i - 4 : i;
      const sx = x0 + 3 + col * slot + (row ? stag : 0), sy = y0 + 3 + row * (rh + 3), ramp = EL[r.el];
      const dry = r.dry && Math.floor(t * 4) % 2;
      // the key cap
      X.rect(c, sx, sy, slot - 2, rh - 1, dry ? '#3a1418' : '#1f1c2e'); X.rect(c, sx, sy, slot - 2, 1, dry ? '#a03040' : '#3e3854'); X.rect(c, sx, sy + rh - 2, slot - 2, 1, '#0c0a14');
      X.rect(c, sx, sy, 1, rh - 1, '#2c2840'); X.rect(c, sx + slot - 3, sy, 1, rh - 1, '#110e1a');
      // element icon and key
      const pulse = r.spent > 0 ? Math.round(r.spent * 2) : 0;
      X.icon(c, r.el, sx + 2, sy + 2 - pulse, ramp[r.drain > 0 ? 1 : 2]);
      X.text(c, r.key, sx + 13, sy + 3, r.dry ? '#ff6a6a' : '#6a6484');
      if (r.drain > 0.05) {
        // sustained upkeep: a "-" marker and a drop of the element falling from the pool
        if (r.el === 'arcane' || r.drain > 0.3) X.rect(c, sx + 13, sy + 9, 3, 1, '#ff6a6a');
        const dy = mod(t * 2.2, 1) * 4; X.px(c, sx + 18, sy + 9 + dy, ramp[2]);
      }
      // pips: whole runes, the one regenerating is filled from the bottom; a rune bound
      // by a Sigil device is a hollow frame with a slow pulse until the device ends
      const full = Math.floor(r.v + 1e-6), frac = r.v - full;
      for (let k = 0; k < r.max; k++) {
        const px = sx + 2 + k * 4 - (r.max > 4 ? 1 : 0), py = sy + 11;
        X.rect(c, px, py, 3, 6, '#0e0c16');
        if (k >= r.max - (r.bound || 0)) { X.rect(c, px, py, 3, 1, ramp[3]); X.rect(c, px, py + 5, 3, 1, ramp[3]); X.rect(c, px, py, 1, 6, ramp[3]); X.rect(c, px + 2, py, 1, 6, ramp[3]); X.px(c, px + 1, py + 2 + (Math.floor(t * 3) % 2), ramp[1]); continue; }
        if (k < full) { X.rect(c, px, py, 3, 6, ramp[2]); X.rect(c, px, py, 1, 6, ramp[1]); X.px(c, px + 1, py, ramp[0]); }
        else if (k === full && frac > 0.01) {
          const fh = Math.round(frac * 6); X.rect(c, px, py + 6 - fh, 3, fh, ramp[3]);
          if (fh > 0) X.rect(c, px, py + 6 - fh, 3, 1, Math.floor(t * 6) % 2 ? ramp[1] : ramp[2]);
          X.rect(c, px, py - 1, 3, 1, '#2a2638');
        } else X.rect(c, px + 1, py + 2, 1, 2, '#2a2638');
      }
    });
    // queue chip while P1 prepares: each element appears as it is queued
    const p1 = S.byId.p1;
    if (p1 && p1.prepInfo && !S.beam) {
      const n = p1.prepInfo.qs.length, cw = 26 + n * 14, cx = Math.round(LW / 2) - (cw >> 1), cy = y0 - 13, qd = p1.prepInfo.qs.filter((q) => t >= q.tq + 0.24);
      X.rect(c, cx - 1, cy - 1, cw + 2, 12, '#0a0810'); X.rect(c, cx, cy, cw, 10, '#1a1726');
      qd.forEach((q, i) => { if (i) X.text(c, '+', cx + 2 + i * 14 - 5, cy + 3, '#ffffff'); X.icon(c, q.el, cx + 2 + i * 14, cy + 2, EL[q.el][2]); });
      if (Math.floor(t * 6) % 2 && qd.length < n) X.rect(c, cx + 4 + qd.length * 14, cy + 7, 3, 1, '#e8e4f0');
      X.text(c, 'QUEUE', cx + cw - 21, cy + 3, '#8a8498');
    }
    // current cast chip: form + payload
    if (S.beam) {
      const cx = Math.round(LW / 2) - 30, cy = y0 - 13;
      X.rect(c, cx - 1, cy - 1, 62, 12, '#0a0810'); X.rect(c, cx, cy, 60, 10, '#1a1726');
      X.icon(c, 'arcane', cx + 2, cy + 2, EL.arcane[2]); X.text(c, '+', cx + 11, cy + 3, '#ffffff'); X.icon(c, 'fire', cx + 16, cy + 2, EL.fire[2]);
      X.text(c, 'BEAM', cx + 26, cy + 3, '#e8e4f0');
      // the beam's natural duration runs down; past it, upkeep would come out of regen
      const left = Math.max(0, 1 - S.beam.age / 5);
      X.rect(c, cx + 44, cy + 4, 13, 3, '#0e0c16'); X.rect(c, cx + 44, cy + 4, Math.round(13 * left), 3, EL.fire[2]);
    }
  }
})();
