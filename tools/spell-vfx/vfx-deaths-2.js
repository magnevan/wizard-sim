/* Spell VFX: deaths for the other enemies (pass 7). The goblin set (vfx-deaths.js) is rated and
 * complete; every other archetype plays it on its own rig unless its body or character changes
 * how an element reads. Those deaths are here, registered on PB.deaths.arch (see the runner in
 * vfx-deaths.js), and each gets a card so it can be rated.
 *
 *   brute        heavy: it never flies. base (rocks, kneels, falls like a tree, the ground shakes),
 *                boulder (the rock bursts on its chest, it skids back on its heels and falls),
 *                quake (heaved up a little, lands on broken slabs, then falls), cold (frost-stiff:
 *                no kneel, a felled frozen tree, an icy burst)
 *   archer       its gear: base (the bow flies out of its hands, arrows spill), fire (the string
 *                burns through, the bow burns on the ground, the arrows flare like matches),
 *                boulder (bow and arrows thrown along the throw)
 *   imp          a living ember (fire can't kill it): base (its crown flame gutters and is left
 *                flickering on the ground), cold (goes out like a cooled coal: glow drains, lava
 *                cracks, breaks into cinders), water (doused: a burst of hissing steam, shrinks
 *                to a smoking black lump), frozen shatter (the shards glow inside and steam as
 *                they melt)
 *   grabber      its long arms: base (skids face down, claws gouging two furrows), lightning (the
 *                arc jumps claw to claw), arcane (the calm v3 tear, arms first, from the claws in)
 *   shieldbearer its shield: base (the shield drops and rocks flat with a clang), boulder (the
 *                rock splinters the shield), fire (the shield keeps burning on the ground, leaving
 *                its iron rim and boss)
 * Everything else inherits the goblin's death, played on the archetype's rig. */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, { FY, TAU, seg, smooth, easeOut, lerp, rand, clamp, emit, mod } = PB, X = PB.px, EL = X.EL;
  const DD = PB.deaths, L = DD.lib, OV = DD.overlay, ARCH = DD.arch, sprite = DD.sprite, poof = DD.poof;
  const { keep, star, SNOW, DIRT } = L;
  const add = (d) => PB.VFX.push(d), ME = K.ME, caster = K.caster;
  const ov = (fx, extra) => Object.assign(fx, extra);
  const OL = '#120e1a';
  const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a.toFixed(2)})`;

  // ---------------------------------------------------------------------------
  // Loose props: a thrown or dropped thing on an arc from p0 (lifted z0) to p1, landing at
  // t0 + dur with a small bounce. null before t0.
  function toss(td, t0, p0, p1, h, dur, z0 = 0) {
    const e = td - t0; if (e < 0) return null;
    const k = clamp(e / dur, 0, 1);
    return { x: lerp(p0[0], p1[0], easeOut(k)), y: lerp(p0[1], p1[1], easeOut(k)), z: z0 * (1 - k) + h * 4 * k * (1 - k) + K.hop(e, dur, h * 0.15 + 1, dur * 0.35), k, e };
  }
  // the bow: a short recurve along ang (screen), the belly bowed toward the normal, the string
  // straight (or snapped: two curled ends)
  function bow(c, x, y, ang, col = '#b8844a', string = 1) {
    const ux = Math.cos(ang), uy = Math.sin(ang) * 0.75, nx = -uy, ny = ux, nl = Math.hypot(nx, ny) || 1;
    const a = [x - ux * 5, y - uy * 5], b = [x + ux * 5, y + uy * 5], m = [x - (nx / nl) * 1.8, y - (ny / nl) * 1.8];
    X.lines(c, [a, m, b], OL, 2); X.lines(c, [a, m, b], col);
    if (string === 1) X.line(c, a[0], a[1], b[0], b[1], '#d0d0dc');
    else if (string > 0) { X.line(c, a[0], a[1], lerp(a[0], b[0], 0.25), lerp(a[1], b[1], 0.25) + 1, '#d0d0dc'); X.line(c, b[0], b[1], lerp(b[0], a[0], 0.25), lerp(b[1], a[1], 0.25) + 1, '#d0d0dc'); }
    X.px(c, a[0], a[1], '#d8a868'); X.px(c, b[0], b[1], '#d8a868');
  }
  function arrow(c, x, y, ang, burnt = 0) {
    const ux = Math.cos(ang), uy = Math.sin(ang) * 0.75;
    X.line(c, x - ux * 3, y - uy * 3 + 1, x + ux * 3, y + uy * 3 + 1, OL);
    X.line(c, x - ux * 3, y - uy * 3, x + ux * 2, y + uy * 2, burnt ? '#3a2e2a' : '#e8d8b0');
    X.px(c, x + ux * 3, y + uy * 3, '#c0cbdc'); X.px(c, x - ux * 3, y - uy * 3, burnt ? '#2a2020' : '#c8443a');
  }
  // the shield: a tall wooden board with an iron rim and boss, standing on its edge (tilt 1) or
  // lying flat (tilt 0: 4 px deep under the steep camera). ch = how charred; wood = how much of
  // the board is left (it burns away, the iron stays)
  function shieldProp(c, x, y, tilt, ch = 0, wood = 1) {
    const w = 8, h = Math.max(3, Math.round(lerp(6, 10, clamp(tilt, 0, 1)))), x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
    const W = X.mix('#6a4a2c', '#221818', ch), P = X.mix('#4e3420', '#140e10', ch), HI = X.mix('#8a6a48', '#3a2a26', ch), RIM = X.mix('#8a8e98', '#3e3c44', ch * 0.85), BOSS = ch > 0.6 ? '#6a6a72' : '#c8ccd8';
    if (wood > 0.02) {
      X.rect(c, x0 - 1, y0 - 1, w + 3, h + 2, OL);
      for (let j = 0; j < h; j++) for (let i = 0; i <= w; i++) {
        if (wood < 1 && rand(i, j, 91) > wood) continue;
        X.px(c, x0 + i, y0 + j, j === 0 ? HI : i === 3 || i === 6 ? P : W);
      }
    }
    // the iron rim and boss stay whatever happens to the wood
    X.line(c, x0, y0, x0 + w, y0, RIM); X.line(c, x0, y0 + h - 1, x0 + w, y0 + h - 1, RIM);
    X.line(c, x0, y0, x0, y0 + h - 1, RIM); X.line(c, x0 + w, y0, x0 + w, y0 + h - 1, RIM);
    const by = Math.round(y0 + h / 2 - 1);
    X.rect(c, x0 + 3, by, 2, 2, BOSS); if (ch < 0.6) X.px(c, x0 + 3, by, '#ffffff');
  }
  // where the shield and the bow are at the moment of the kill (in front of the body)
  const shieldAt = (g) => [g.x + Math.cos(g.face) * 4.8, g.y + Math.sin(g.face) * 4.8 * FY];
  const gripAt = (g) => [g.x + Math.cos(g.face) * 5, g.y + Math.sin(g.face) * 5 * FY];

  // ---------------------------------------------------------------------------
  // BRUTE: too heavy to fly. Every brute death ends in the heavy fall (baseDeath 'heavy': it rocks
  // on its heels, sinks to its knees, tips over like a felled tree and slams down), the screen
  // shakes, and dust rolls out along its length.
  const SB = 23 / 12;
  const heavyT = (o) => (o.kneelAt || 0.42) + (o.tipDur || 0.5);
  const lieAt = (m) => [m.pivot[0] + m.side * 11, m.pivot[1]];
  function slam(c, x, y, e, side, seed, col = '#8a7a68', ring = '#d8c0a0') {
    if (e < 0 || e > 1.4) return;
    for (let j = 0; j < 2; j++) K.dust(c, x + side * (j - 0.5) * 14, y + 1, e - j * 0.04, seed + j * 7, 5, 22 + j * 4, col, 0.9);
    if (e < 0.3) K.gring(c, x, y + 1, 6 + e * 80, ring, 1 - e / 0.3, 1);
    for (let k = 0; k < 9; k++) { if (e > 0.6) break; const a = rand(k, seed, 1) * TAU, d = (8 + rand(k, seed, 2) * 16) * easeOut(Math.min(1, e * 2.2)); X.rect(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.45 - K.hop(e, 0, 3 + rand(k, seed, 3) * 5, 0.32), k % 3 ? 1 : 2, 1, k % 2 ? DIRT[1] : DIRT[2]); }
  }
  // the dent the body leaves: a dark trough along it and cracks running out
  function dent(c, m, td, fade, cr = 18) {
    const e = td - heavyT(m.o); if (e < 0) return;
    const [x, y] = lieAt(m);
    X.ellipse(c, x, y + 1, 13, 3.2, rgba(40, 28, 20, 0.45 * fade));
    K.cracks(c, x, y + 1, cr, 9, seg(e, 0, 0.12), rgba(26, 18, 12, 0.7 * fade), 7);
  }
  const slamShake = (td, m, A = 2.5) => { const e = td - heavyT(m.o); return e > 0 && e < 0.3 ? A * (1 - e / 0.3) : 0; };
  const knees = (c, m, td) => { if (td > 0.28) K.dust(c, m.pivot[0], m.pivot[1] + 1, td - (m.o.kneelAt || 0.42) + 0.06, 31, 3, 10, '#8a7a68', 0.4); };
  const OB = {};
  OB.base = ov(function (c, g, td, dir, st, A, m) {
    knees(c, m, td);
    const [x, y] = lieAt(m); slam(c, x, y, td - heavyT(m.o), m.side, 41);
  }, {
    motion: { fall: 'heavy', club: false, exitR: 9, exitAt: 1.75 },
    body: (g, td) => ({ eyesShut: td > 0.3 ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) { dent(c, m, td, fade); },
    shake: (td, m) => slamShake(td, m),
  });
  // BOULDER: the rock bursts on its chest; it skids back on its heels, ploughing two furrows, and
  // goes over backwards.
  OB.earth = ov(function (c, g, td, dir, st, A, m) {
    const ch = [m.g0.x - dir[0] * 2, m.g0.y - 17];
    if (td < 0.06) X.ellipse(c, ch[0], ch[1], 5, 4, '#fff4e0');
    K.debris(c, ch[0], ch[1] + 12, td, 61, 12, 46, ['#b8946a', '#76583c', '#553e2a'], 36);
    K.dust(c, ch[0], ch[1] + 4, td, 63, 6, 12, '#a8987e', 0.7);
    // the heels dig in: dirt sprays off them while it skids
    if (td < 0.35) for (const s of [-1, 1]) K.dust(c, m.g.x - dir[0] * 2, m.g.y + s * 2, td, 65 + s, 3, 6, '#8a7a68', 0.4);
    const [x, y] = lieAt(m); slam(c, x, y, td - heavyT(m.o), m.side, 43);
  }, {
    motion: { fall: 'heavy', kb: 10, kneel: 0.15, rock: 0.07, kneelAt: 0.55, tipDur: 0.45, club: false, exitR: 9, exitAt: 1.8, hitCol: '#fff4e0' },
    body: (g, td) => ({ eyesShut: td > 0.3 ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) {
      // two furrows from where it stood to where its heels stopped
      const a = 0.7 * fade, x0 = m.g0.x, x1 = m.g.x;
      if (Math.abs(x1 - x0) > 1) for (const s of [-2, 2]) { X.line(c, x0, m.g0.y + s, x1, m.g.y + s, rgba(30, 20, 14, a)); X.line(c, x0, m.g0.y + s + 1, x1, m.g.y + s + 1, rgba(154, 122, 84, a * 0.8)); }
      dent(c, m, td, fade);
      for (let i = 0; i < 6; i++) { const x = m.g0.x + (rand(i, 66) - 0.3) * 18, y = m.g0.y + (rand(i, 67) - 0.5) * 8; if (td > 0.4 && keep(x, y, fade)) { X.rect(c, x, y, 2, 1, '#6a5038'); X.px(c, x, y - 1, '#977552'); } }
    },
    shake: (td, m) => Math.max(td < 0.15 ? 2 : 0, slamShake(td, m)),
  });
  // QUAKE: too heavy to bounce: the ground heaves it a little way up and breaks into slabs under
  // it; it comes down on its knees on the broken ground and falls.
  function slabs(c, x, y, td, fade) {
    const up = K.hop(td, 0, 3, 0.32), k = seg(td, 0, 0.12);
    if (k <= 0) return;
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * TAU + rand(i, 141) * 0.5, r = 9 + rand(i, 142) * 5, cx = x + Math.cos(an) * r, cy = y + Math.sin(an) * r * 0.45, w = 4 + rand(i, 143) * 3, tilt = (rand(i, 144) - 0.5) * 2;
      const lift = up * (0.6 + rand(i, 145) * 0.6) + 1 + rand(i, 146);
      const pts = [[cx - w, cy + tilt], [cx + w, cy - tilt], [cx + w - 1, cy - tilt - lift], [cx - w + 1, cy + tilt - lift]];
      if (!keep(cx, cy, fade)) continue;
      X.poly(c, pts.map(([px, py]) => [px, py + 1]), DIRT[3]);
      X.poly(c, pts, DIRT[2]);
      X.line(c, pts[3][0], pts[3][1], pts[2][0], pts[2][1], DIRT[0]);
    }
  }
  OB.quake = ov(function (c, g, td, dir, st, A, m) {
    const x0 = m.g0.x, y0 = m.g0.y;
    K.debris(c, x0, y0 - 1, td, 71, 16, 40, [DIRT[0], DIRT[1], DIRT[2]], 60);
    K.dust(c, x0, y0, td, 72, 12, 20, '#8a7a68', 0.8);
    if (td < 0.3) K.gring(c, x0, y0 + 1, 5 + td * 70, '#d8c0a0', 1 - td / 0.3, 1);
    knees(c, m, td);
    const [x, y] = lieAt(m); slam(c, x, y, td - heavyT(m.o), m.side, 45);
  }, {
    motion: { fall: 'heavy', lift: 6, kb: 1, kneel: 0.6, kneelAt: 0.5, tipDur: 0.45, club: false, exitR: 9, exitAt: 1.8, hitCol: '#fff4e0', exitCols: ['#efe4d0', '#bfae94', '#7a6a58'] },
    body: (g, td) => ({ eyesShut: td > 0.3 ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) {
      const x = m.g0.x, y = m.g0.y + 1, k = seg(td, 0, 0.12);
      if (k > 0) { X.ellipse(c, x, y, 12 * k, 4 * k, rgba(40, 28, 20, 0.55 * fade)); K.cracks(c, x, y, 26, 14, k, rgba(26, 18, 12, 0.85 * fade), 9); }
      slabs(c, x, y, td, fade);
      dent(c, m, td, fade, 10);
    },
    shake: (td, m) => Math.max(slamShake(td, m), td < 0.3 ? 1.5 : 0),
    lights: (g, td, st, m) => [[m.g0.x, m.g0.y, 60, '#e0c8a0', 0.7 * (1 - seg(td, 0, 0.5))]],
  });
  // COLD: frost-stiff, so no kneel: a shiver, then it tips over whole like a frozen tree; the slam
  // cracks the rime along its length and throws up ice and snow.
  OB.cold = ov(function (c, g, td, dir, st, A, m) {
    if (td < 0.6) K.chilled(c, A, g, td + 5, 1);
    const e = td - heavyT(m.o), [x, y] = lieAt(m);
    if (e > 0 && td < m.exitAt + 0.05) {
      const run = seg(e, 0, 0.1), pts = [];
      for (let i = 0; i <= 8; i++) pts.push([x - 10 + i * 2.5, y - 4 + (i % 2 ? 1 : -1)]);
      const n = Math.max(2, Math.ceil(pts.length * run));
      X.lines(c, pts.slice(0, n), '#ffffff'); if (e < 0.12) X.lines(c, pts.slice(0, n).map(([px, py]) => [px, py + 1]), '#1e5a96');
      for (let k = 0; k < 16; k++) { const an = rand(k, 81) * Math.PI + Math.PI, sp = 14 + rand(k, 82) * 26, vz = 24 + rand(k, 83) * 28, z = vz * e - 110 * e * e; if (z < -1 || e > 0.6) continue; X.px(c, x + (rand(k, 84) - 0.5) * 18 + Math.cos(an) * sp * e * 0.8, y + Math.sin(an) * sp * e * 0.3 - Math.max(0, z), k % 3 ? '#e0ffff' : '#ffffff'); }
    }
    slam(c, x, y, e, m.side, 47, '#d8ecf6', '#e0ffff');
  }, {
    motion: { fall: 'heavy', kneel: 0, rock: 0.05, kneelAt: 0.22, tipDur: 0.62, club: false, exitR: 9, exitAt: 1.75, exitCols: SNOW, hitCol: '#e0ffff' },
    body: () => ({ chill: 1 }),
    ground(c, E, g, td, dir, st, m, fade) {
      const k = seg(td, 0, 0.9) * fade, [x, y] = lieAt(m);
      if (k > 0.02) for (let i = 0; i < 110; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.7) * 24 * k, px = x + Math.cos(an) * r, py = y + 1 + Math.sin(an) * r * FY * 0.5; if (keep(px, py, fade)) X.px(c, px, py, i % 4 === 0 ? '#ffffff' : i % 2 ? '#bfe8f6' : '#8ccce4'); }
    },
    shake: (td, m) => slamShake(td, m),
    lights: (g, td, st, m) => [[m.g0.x + 8, m.g0.y, 50, '#9ff4ff', 0.45 * (1 - seg(td, m.exitAt, m.exitAt + 1))]],
  });
  ARCH.brute = { S: SB, overlay: OB, drop() {} };

  // ---------------------------------------------------------------------------
  // ARCHER: the gear is what reads. The base death and the boulder throw the bow and spill the
  // arrows; fire burns the bowstring through. Inherited deaths leave the bow and arrows lying.
  function bowFlight(td, g0, dir, t0, far = 0) {
    const p0 = gripAt(g0), side = Math.sign(Math.cos(g0.face)) || -1;
    return toss(td, t0, p0, [p0[0] + side * 6 + dir[0] * far, p0[1] + 3 + dir[1] * far * FY], 9 + far * 0.15, 0.48 + far * 0.004, 7);
  }
  function drawBow(c, p, ang, fade, col, string) { if (p && keep(p.x, p.y, fade)) bow(c, p.x, p.y - p.z, ang, col, string); }
  const ARROWS = 3;
  function arrowsOut(stand, td, from, dir, fade, t0, far, n = ARROWS) {
    for (let k = 0; k < n; k++) {
      const p1 = [from[0] + dir[0] * (far * (0.5 + rand(k, 151) * 0.6)) + (rand(k, 152) - 0.5) * 10, from[1] + 2 + (rand(k, 153) - 0.5) * 8];
      const p = toss(td, t0 + k * 0.04, [from[0], from[1]], p1, 5 + rand(k, 154) * 5 + far * 0.1, 0.3 + far * 0.005, 8);
      if (!p) continue;
      const ang = rand(k, 155) * TAU + (p.k < 1 ? p.e * 14 : (0.3 + far * 0.005) * 14);
      stand.push([p.y, (c) => { if (keep(p.x, p.y, fade)) arrow(c, p.x, p.y - p.z, ang); }]);
    }
  }
  const OA = {};
  OA.base = ov(function () {}, {
    motion: { fall: 'topple', club: false },
    body: (g, td) => ({ bare: td > 0.05 ? 1 : 0 }),
    stand(stand, g, td, dir, st, m) {
      const p = bowFlight(td, m.g0, dir, 0.04);
      if (p) stand.push([p.y, (c) => drawBow(c, p, Math.PI / 2 + Math.min(p.e, 0.48) * 9, m.fade)]);
      // arrows spill out of the quiver on its back as it lands
      arrowsOut(stand, td, [m.g0.x + dir[0] * 4, m.g0.y], dir, m.fade, 0.34, 10);
    },
  });
  // FIRE: it burns standing (fire v2); the bowstring burns through and snaps, the bow drops and
  // burns on the ground after the archer has crumbled, ending as a charred bow; the arrows on its
  // back flare one by one like matches.
  const SNAP = 0.28;
  OA.fire = ov(function (c, g, td, dir, st, A, m) {
    OV.fire(c, g, td, dir, st, A, m);
    const gp = gripAt(m.g0);
    if (td > SNAP - 0.02 && td < SNAP + 0.12) star(c, [gp[0], gp[1] - 7], td - SNAP + 0.02, '#ffd860', 4);
    // arrow heads flaring on its back
    for (let k = 0; k < 3; k++) { const t0 = 0.42 + k * 0.14, e = td - t0; if (e < 0 || e > 0.16) continue; const x = m.g0.x - Math.cos(m.g0.face) * 3 + (k - 1) * 2, y = m.g0.y - 11 - k; X.px(c, x, y, '#ffffff'); X.px(c, x - 1, y, '#fff4c0'); X.px(c, x + 1, y, '#fff4c0'); K.tongue(c, x, y, 1, 4 * (1 - e / 0.16), Math.sin(td * 9 + k)); }
    // the dropped bow burning on the ground
    const bp = bowOnGround(m), k = Math.min(seg(td, SNAP + 0.25, SNAP + 0.4), 1 - seg(td, 1.9, 2.6));
    if (k > 0.04) for (let j = -2; j <= 2; j++) K.tongue(c, bp.x + j * 2, bp.y - 1, 1, (2 + 1.6 * Math.sin(td * 15 + j * 2.3)) * k * (1 - Math.abs(j) * 0.2), Math.sin(td * 7 + j));
  }, {
    motion: Object.assign({}, OV.fire.motion),
    body: (g, td) => Object.assign(OV.fire.body(g, td), { bare: td > SNAP ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) { OV.fire.ground(c, E, g, td, dir, st, m, fade); const bp = bowOnGround(m); K.scorch(c, bp.x, bp.y + 1, 5 * seg(td, SNAP + 0.3, 1.2), 0.6 * fade); },
    lights(g, td, st, m) { const bp = bowOnGround(m), k = Math.min(seg(td, SNAP + 0.25, SNAP + 0.4), 1 - seg(td, 1.9, 2.6)); return [...OV.fire.lights(g, td, st, m), [bp.x, bp.y - 2, 22, '#ff7020', 0.5 * k]]; },
    stand(stand, g, td, dir, st, m) {
      const p = bowDrop(td, m);
      if (!p) return;
      const ch = smooth(seg(td, SNAP + 0.3, 2.0));
      stand.push([p.y, (c) => drawBow(c, p, lerp(Math.PI / 2, 0.15, p.k), m.fade, X.mix('#b8844a', '#2a2020', ch), td < SNAP + 0.05 ? 1 : 0.5 * (1 - seg(td, SNAP + 0.1, SNAP + 0.3)))]);
    },
  });
  function bowDrop(td, m) { const p0 = gripAt(m.g0); return toss(td, SNAP, p0, [p0[0] + Math.cos(m.g0.face) * 4, p0[1] + 2], 2, 0.26, 7); }
  function bowOnGround(m) { const p = bowDrop(9, m); return { x: p.x, y: p.y }; }
  // BOULDER: flung with the boulder death; the bow spins away along the throw and the arrows spray
  // out of the quiver after it.
  OA.earth = ov(function (c, g, td, dir, st, A, m) { OV.earth(c, g, td, dir, st, A, m); }, {
    motion: Object.assign({}, OV.earth.motion, { club: false }),
    motionFor: (st, o) => Object.assign(OV.earth.motionFor(st, o), { club: false }),
    body: () => ({ bare: 1 }),
    ground: OV.earth.ground,
    stand(stand, g, td, dir, st, m) {
      const p = bowFlight(td, m.g0, dir, 0, 46);
      if (p) stand.push([p.y, (c) => drawBow(c, p, Math.PI / 2 + Math.min(p.e, 0.66) * 13, m.fade)]);
      const at = DD.baseDeath(m.g0, 0.12, dir, m.o).g;
      arrowsOut(stand, td, [at.x, at.y], dir, m.fade, 0.12, 34, 5);
    },
  });
  ARCH.archer = {
    overlay: OA,
    drop(c, x, y, side, ex, m, fade) {
      if (!keep(x, y, fade)) return;
      bow(c, x, y - 1, 0.2 * side);
      for (let k = 0; k < ARROWS; k++) arrow(c, x - side * (5 + k * 3), y + 1 + (k - 1) * 2, (rand(k, 161) - 0.5) * 1.6);
    },
  };

  // ---------------------------------------------------------------------------
  // IMP: a living ember. Fire can't kill it; cold and water put it out.
  const OI = {}, BI = {};
  const EMBER = ['#ffd0a0', '#c86a4a', '#4a3034'];
  // BASE: its crown flame gutters as it falls; it poofs in ember smoke, and the flame is left on
  // the ground, flickering out (the drop below, shared by every imp death that poofs).
  OI.base = ov(function (c, g, td, dir, st, A, m) {
    const a = A[g.id];
    if (a && a.head && td > 0.2 && td < m.exitAt) for (const p of emit(td, 6, 0.9, (i, age) => ({ x: a.head[0] + (rand(i, 171) - 0.5) * 3 + age * 4, y: a.head[1] - 3 - age * 12, age }), 0.25, 99)) K.puff(c, p.x, p.y, 1 + p.age * 2.5, '#4a4250', (1 - p.age) * 0.8);
  }, {
    motion: { fall: 'topple', exitCols: EMBER },
    body: (g, td) => ({ crown: 1 - seg(td, 0.2, 0.55) }),
  });
  // WATER (and the scald mix: its fire half does nothing to an imp): doused. A burst of hissing
  // steam, the crown snuffed at once, the red skin blackening as it shrinks and sinks; the steam
  // clears on a small smoking black lump in a dark wet patch, sizzling, that fades.
  const STEAM = ['#ffffff', '#e8f0f8', '#b8c4d4'];
  OI.water = ov(function (c, g, td, dir, st, A, m) {
    const x = m.g0.x, y = m.g0.y;
    if (td < 0.06) X.ellipse(c, x, y - 7, 8, 7, '#ffffff');
    // the hiss: steam bursting off it, thick at first, rising and spreading
    const k = 1 - seg(td, 0.3, 1.1);
    if (k > 0) for (const p of emit(td, 26, 0.9, (i, age) => ({ x: x + (rand(i, 181) - 0.5) * 10 + (rand(i, 182) - 0.5) * age * 22, y: y - 6 - rand(i, 183) * 6 - age * 20, age }), 0, 99)) K.puff(c, p.x, p.y, 1.5 + p.age * 4, p.age < 0.3 ? STEAM[0] : p.age < 0.6 ? STEAM[1] : STEAM[2], (1 - p.age) * 0.95 * k);
    // sizzle pops on the body
    if (td < 0.9) for (let i = 0; i < 4; i++) if (rand(i, Math.floor(td * 20), 184) < 0.6) X.px(c, m.g.x + (rand(i, Math.floor(td * 20), 185) - 0.5) * 8, m.g.y - 2 - rand(i, Math.floor(td * 20), 186) * 9, '#ffffff');
    // the last cloud as it gives out, and wisps off the lump afterwards
    if (td > m.exitAt - 0.15 && td < m.exitAt + 0.5) poof(c, x, y - 4, (td - m.exitAt + 0.15) / 0.65, STEAM, 6, 13);
    if (td > m.exitAt) for (const p of emit(td, 3, 1.2, (i, age) => ({ x: x + 1 + (rand(i, 187) - 0.5) * 3 + age * 3, y: y - 2 - age * 13, age }), m.exitAt, 99)) K.puff(c, p.x, p.y, 1 + p.age * 2, '#6e6878', (1 - p.age) * 0.75 * m.fade);
  }, {
    motion: { fall: 'slump', slumpAt: 0.25, exitAt: 1.2, exit: 'fizzle', club: false, hitCol: '#e0f6ff' },
    body: (g, td) => ({ crown: 0, wet: 0.8 * (1 - seg(td, 0.4, 0.9)), tint: '#1e181c', tintK: 0.85 * smooth(seg(td, 0.08, 0.8)), sq: 0.45 * smooth(seg(td, 0.2, 1.1)), eyeCol: '#ff7a30', eyesShut: td > 0.85 ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) {
      const x = m.g0.x, y = m.g0.y + 1, k = seg(td, 0.05, 0.4) * fade;
      if (k > 0.02) { X.poly(c, K.blobPts(x + 1, y, 9 * k, 3 * k, 5), rgba(20, 30, 46, 0.8)); X.poly(c, K.blobPts(x + 1, y - 0.5, 6 * k, 2 * k, 5), rgba(32, 52, 80, 0.7)); }
      // the lump
      if (td > m.exitAt - 0.05 && keep(x, y, fade)) { X.ellipse(c, x, y - 1, 3.5, 2, OL); X.ellipse(c, x, y - 1.5, 2.6, 1.4, '#2a2226'); X.px(c, x - 1, y - 2, '#4a4046'); }
      // sizzling bubbles on the wet patch
      if (td > 0.3) for (let i = 0; i < 4; i++) if (rand(i, Math.floor(td * 6), 188) < 0.45 * (1 - seg(td, 1.6, 2.6))) X.px(c, x + (rand(i, 189) - 0.5) * 14, y + (rand(i, 190) - 0.5) * 4, '#e0f0ff');
    },
    lights: (g, td) => [[g.x, g.y - 6, 30, '#ffffff', 0.35 * (1 - seg(td, 0.1, 0.8))]],
  });
  // COLD (bespoke): goes out like a cooled coal. Its fire dies and the red skin cools through dull
  // red to grey-black stone; glowing cracks open across it and fade; it stands rigid, cracks once
  // more, and breaks into chunky cinders that drop into a small heap with the last ember inside.
  const BRK = 1.05;
  function impColdState(g0, td, dir) {
    const cool = smooth(seg(td, 0.08, 0.85));
    return Object.assign({}, g0, { x: g0.x + dir[0] * 2 * easeOut(seg(td, 0, 0.15)), crown: 1 - seg(td, 0.05, 0.3), tint: '#3a3438', tintK: 0.86 * cool, chill: 0.5 * seg(td, 0, 0.4), burn: 0, flash: 0.6 * K.flash(td, 0), flashCol: '#e0ffff', eyeCol: cool > 0.55 ? '#ff7a30' : null, eyesShut: cool > 0.92 ? 1 : 0, spd: 0 });
  }
  const CRACKS = [[[-1, -11], [0, -9], [-1, -7], [1, -5], [0, -3]], [[2, -10], [3, -8], [2, -6]], [[-3, -7], [-2, -5], [-3, -3]], [[1, -13], [-1, -12]]];
  BI.cold = function (ev, t, td, g0, D, key, fade) {
    const dir = ev.dir, g = impColdState(g0, td, dir), gx = g.x, gy = g0.y;
    const glow = Math.min(seg(td, 0.25, 0.45), 1 - seg(td, 0.75, BRK - 0.05));
    const fxPre = (c) => {
      // the frost hit, and smoke curling off the snuffed crown
      if (td < 0.25) K.dust(c, gx, gy - 8, td, 191, 6, 10, '#e0f4ff', 0.3);
      for (const p of emit(td, 5, 1.0, (i, age) => ({ x: gx + (rand(i, 192) - 0.5) * 2 + age * 4, y: gy - 15 - age * 12, age }), 0.1, 99)) if (p.age < 1) K.puff(c, p.x, p.y, 1 + p.age * 2, '#5a5464', (1 - p.age) * 0.8 * (1 - seg(td, 1.2, 1.8)));
    };
    if (td < BRK) {
      return {
        actor: g, stand: [],
        under(c) { const k = seg(td, 0, 0.6) * fade; if (k > 0.02) for (let i = 0; i < 30; i++) { const an = rand(i, 193) * TAU, r = Math.pow(rand(i, 194), 0.7) * 9 * k, x = gx + Math.cos(an) * r, y = gy + 1 + Math.sin(an) * r * 0.4; X.px(c, x, y, i % 3 ? '#bfe8f6' : '#ffffff'); } },
        fx(c) {
          fxPre(c);
          // the lava cracks: hot while it cools, fading to dark; white the instant before it breaks
          const last = td > BRK - 0.08;
          if (glow > 0.05 || last) for (const cr of CRACKS) X.lines(c, cr.map(([x, y]) => [gx + x, gy + y]), last ? '#ffffff' : glow > 0.6 ? '#ffd860' : glow > 0.3 ? '#ff9a30' : '#c8502a');
          star(c, [gx - dir[0] * 2, gy - 7], td, '#e0ffff', 6);
        },
        lights: [[gx, gy - 6, 30, '#ff7020', 0.5 * (1 - seg(td, 0.05, 0.6))], [gx, gy - 6, 26, '#ff9a30', 0.4 * glow], [gx, gy, 30, '#9ff4ff', 0.3 * (1 - seg(td, 0, 0.5))]],
      };
    }
    // the cinders: the cooled body breaks into chunks that drop into a heap
    const cap = impColdState(g0, BRK, dir);
    const px = sprite(key + '#cinder', Object.assign(cap, { flash: 0, alpha: 1 }), t - td + BRK), ch = L.chunksOf(key + '#cinder', px, 9, 5);
    const e = td - BRK, cxs = ch.reduce((s, c) => s + c.cx, 0) / Math.max(1, ch.length);
    const pos = ch.map((c, j) => {
      const z0 = gy - c.cy, fall = Math.sqrt(2 * Math.max(0, z0 - c.hh) / 260), te = e - rand(j, 195) * 0.08;
      const z = te < 0 ? z0 : te < fall ? z0 - 130 * te * te : c.hh + K.hop(te, fall, 1.5, 0.14);
      const sp = easeOut(seg(te, 0, fall + 0.15));
      return [c.cx + (c.cx - cxs) * 0.6 * sp + (rand(j, 196) - 0.5) * 3 * sp, gy + (rand(j, 197) - 0.5) * 3 * sp, Math.max(c.hh, z)];
    });
    const stand = ch.map((c, j) => [pos[j][1], (cc, E) => {
      const [x, y, z] = pos[j], hot = j % 3 === 0 && e < 0.9 && (Math.floor(td * 6) + j) % 4 !== 0;
      for (const p of c.pts) {
        const xx = x + p.x - c.cx, yy = y - z + p.y - c.cy; if (!keep(xx, yy, fade)) continue;
        X.px(cc, xx, yy, p.dark ? '#141016' : X.mix(p.col, '#2a2428', 0.35));
      }
      if (hot) E.em((q) => X.px(q, x, y - z, e < 0.4 ? '#ff9a30' : '#c8502a'));
    }]);
    return {
      actor: Object.assign({}, g0, { alpha: 0 }), stand,
      under(c) { if (keep(gx, gy, fade)) { X.ellipse(c, gx, gy + 1, 6, 2, rgba(30, 26, 30, 0.6 * fade)); for (let i = 0; i < 26; i++) { const an = rand(i, 193) * TAU, r = Math.pow(rand(i, 194), 0.7) * 9, x = gx + Math.cos(an) * r, y = gy + 1 + Math.sin(an) * r * 0.4; if (keep(x, y, fade)) X.px(c, x, y, i % 3 ? '#bfe8f6' : '#ffffff'); } } },
      fx(c) {
        fxPre(c);
        if (e < 0.12) star(c, [gx, gy - 7], e, '#ffd860', 6);
        K.dust(c, gx, gy, e - 0.15, 198, 6, 10, '#5a5458', 0.7);
      },
      lights: [[gx, gy - 2, 22, '#ff7020', 0.35 * (1 - seg(e, 0, 1))]],
    };
  };
  // FROZEN SHATTER: the imp's heat is trapped under the ice: the shards glow orange inside, and
  // they hiss steam and melt fast once they land, leaving wet spots instead of a frost patch.
  BI.shatter = function (ev, t, td, g0, D, key, fade) {
    const px = sprite(key, Object.assign({}, g0, { flash: 0 }), t - td), ch = L.chunksOf(key, px, 12, 9), gy = g0.y, dir = ev.dir;
    const melt = seg(td, 0.85, 1.6);
    const pos = ch.map((c, j) => L.simChunk(c, j, td, dir, gy));
    const landed = (j) => td > 0.4 && pos[j][2] <= ch[j].hh + 0.1;
    const stand = ch.map((c, j) => [pos[j][1], (cc, E) => {
      const [x, y, z] = pos[j], ems = [];
      for (const p of c.pts) {
        if (melt > 0 && rand(p.i, 77) < melt * 1.1) continue;
        const xx = x + p.x - c.cx, yy = y - z + p.y - c.cy, d = Math.abs(p.x - c.cx) + Math.abs(p.y - c.cy);
        if (d < 1.6 && c.pts.length > 6) ems.push([xx, yy, (Math.floor(td * 10) + j) % 3 ? '#ff9a30' : '#ffd860']); else X.px(cc, xx, yy, p.ice);
      }
      if (ems.length) E.em((q) => { for (const [a, b, col] of ems) X.px(q, a, b, col); });
    }]);
    return {
      actor: Object.assign({}, g0, { alpha: 0 }), stand,
      under(c) {
        const k = seg(td, 0, 0.25) * (1 - seg(td, 0.6, 1.4)) * fade;
        if (k > 0.02) for (let i = 0; i < 50; i++) { const an = rand(i, 61) * TAU, r = Math.pow(rand(i, 62), 0.6) * 13 * k, x = g0.x + 3 + Math.cos(an) * r, y = gy + 1 + Math.sin(an) * r * FY * 0.6; if (keep(x, y, k)) X.px(c, x, y, i % 4 === 0 ? '#ffffff' : '#bfe8f6'); }
        for (let j = 0; j < ch.length; j++) if (landed(j)) X.ellipse(c, pos[j][0], pos[j][1] + 1, 1.5 + melt * 2.5, 1 + melt * 0.6, rgba(30, 50, 80, 0.6 * fade));
      },
      fx(c) {
        const p = [g0.x - 1, gy - 9];
        if (td < 0.06) X.ellipse(c, p[0], p[1], 12, 10, '#ffffff');
        star(c, p, td, '#ffd0a0', 10);
        if (td < 0.6) for (let k = 0; k < 18; k++) { const an = rand(k, 41) * TAU, sp = 20 + rand(k, 42) * 40; X.px(c, p[0] + Math.cos(an) * sp * td + dir[0] * 20 * td, p[1] + Math.sin(an) * sp * td * 0.6 + 40 * td * td, k % 3 ? '#e0ffff' : '#ffd0a0'); }
        // the hiss: steam off every landed, melting shard
        for (let j = 0; j < ch.length; j++) if (landed(j) && melt < 1) for (const q of emit(td, 3, 0.8, (i, age) => ({ x: pos[j][0] + (rand(i, j, 199) - 0.5) * 3 + age * 2, y: pos[j][1] - 2 - age * 11, age }), 0.45 + j * 0.02, 99)) K.puff(c, q.x, q.y, 1 + q.age * 2, '#f0f4f8', (1 - q.age) * 0.8 * (1 - melt));
      },
      lights: [[g0.x, gy - 4, 60, '#9ff4ff', 1.0 * (1 - seg(td, 0, 0.5))], [g0.x + dir[0] * 12, gy - 2, 40, '#ff9a30', 0.35 * (1 - melt) * seg(td, 0.1, 0.4)]],
    };
  };
  ARCH.imp = {
    // fire does nothing to an imp, so a "fire" kill is the base; the scald mix is its water half
    pick: (ev, k) => (k === 'fire' ? 'base' : k === 'steam' || (k === 'base' && ev.element === 'water') ? 'water' : k),
    overlay: OI, bespoke: BI,
    drop(c, x, y, side, ex, m, fade, E) {
      // its crown flame, left on the ground, flickering out, then a wisp of smoke
      const h = (3.5 + 1.2 * Math.sin(ex * 19)) * (1 - seg(ex, 0.35, 1.2));
      if (h > 0.4) E.em((q) => { K.tongue(q, x, y - 1, 1.2, h, Math.sin(ex * 8)); X.px(q, x, y, '#ff5a20'); });
      else if (ex < 1.8 && keep(x, y, fade)) for (let j = 0; j < 3; j++) X.px(c, x + Math.sin(ex * 4 + j) * 1, y - 2 - j * 2 - (ex - 1.1) * 6, '#6e6878');
      if (ex < 1.6) E.em((q) => { for (let i = 0; i < 3; i++) if (rand(i, Math.floor(ex * 5), 201) < 0.6) X.px(q, x - 4 + rand(i, 202) * 8, y + (rand(i, 203) - 0.5) * 3, i % 2 ? '#ff9a30' : '#c8502a'); });
    },
  };

  // ---------------------------------------------------------------------------
  // GRABBER: long arms.
  const OG = {}, BG = {};
  // BASE: knocked off its feet it skids face down along the blow, claws dragging two furrows.
  OG.base = ov(function (c, g, td, dir, st, A, m) {
    if (td < 1.0) for (const p of emit(td, 14, 0.5, (i, age) => ({ x: m.g.x + dir[0] * 3 + (rand(i, 211) - 0.5) * 4, y: m.g.y + (rand(i, 212) - 0.5) * 3 - age * 4, age }), 0.1, 99)) K.puff(c, p.x, p.y, 1 + p.age * 2.5, '#8a7a68', (1 - p.age) * 0.85 * (1 - seg(td, 0.6, 1.0)));
  }, {
    motion: { fall: 'slide', slide: 30, spinS: 0.5, exitAt: 1.4, club: false },
    ground(c, E, g, td, dir, st, m, fade) {
      // the furrows: from where it went down to where its claws are now (trailing behind it)
      const k = seg(td, 0.1, 0.2); if (k <= 0) return;
      const back = -Math.sign(Math.cos(m.g0.face)) || 1, a = 0.75 * fade;
      const x0 = m.g0.x + dir[0] * 3, x1 = m.g.x - back * 2;
      for (const s of [-1.5, 1.5]) {
        const y0 = m.g0.y + s, y1 = m.g.y + s;
        X.line(c, x0, y0, x1, y1, rgba(28, 20, 14, a)); X.line(c, x0, y0 + 1, x1, y1 + 1, rgba(154, 122, 84, a * 0.7));
      }
      for (let i = 0; i < 6; i++) { const q = rand(i, 213), x = lerp(x0, x1, q), y = lerp(m.g0.y, m.g.y, q) + (rand(i, 214) - 0.5) * 6; if (keep(x, y, fade) && td > 0.2 + q * 0.6) X.rect(c, x, y, 1 + (i % 2), 1, i % 2 ? DIRT[2] : DIRT[1]); }
    },
  });
  // LIGHTNING: the long arms make a circuit: the arc jumps claw to claw and sparks off the tips
  // as the skeleton flashes, then the usual singed topple.
  OG.lightning = ov(function (c, g, td, dir, st, A, m) {
    OV.lightning(c, g, td, dir, st, A, m);
    const a = A[g.id];
    if (a && a.claws && td < 0.42 && Math.floor(td * 18) % 3 !== 2) clawArc(c, a.claws, Math.floor(td * 18));
  }, {
    motion: Object.assign({}, OV.lightning.motion, { club: false }),
    body: OV.lightning.body, ground: OV.lightning.ground,
    lights: (g, td, st, m) => [...OV.lightning.lights(g, td, st, m), [g.x + Math.cos(g.face) * 7, g.y - 5, 30, '#ffffff', 0.5 * (1 - seg(td, 0, 0.42))]],
  });
  function clawArc(c, claws, s) {
    const [p, q] = claws, mid = [(p[0] + q[0]) / 2 + 2, (p[1] + q[1]) / 2 - 4];
    X.lines(c, K.bolt(p, mid, s * 7 + 1, 0.5, 2).concat(K.bolt(mid, q, s * 7 + 2, 0.5, 2)), s % 2 ? '#ffffff' : EL.lightning[1]);
    for (const h of claws) { X.px(c, h[0], h[1], '#ffffff'); X.px(c, h[0] + 1, h[1] - 1, EL.lightning[1]); X.px(c, h[0] - 1, h[1] + 1, EL.lightning[1]); }
  }
  // ARCANE v3 (the calm tear; the game's version, now in the gallery too): a small nudge, fine pink
  // seams, a dozen small pieces drifting a few pixels apart on short threads that let go quietly,
  // unravelling from their edges inward. o.limbs: the long arms go first, from the claws inward.
  function arcane3(ev, t, td, g0, D, key, fade, o = {}) {
    const R = EL.arcane, dir = ev.dir, S = o.S || 1;
    const px = sprite(key, Object.assign({}, g0, { flash: 0 }), t - td), PC = L.piecesOf(key + '#v3', px, Math.round(12 * Math.sqrt(S)), 13);
    if (!PC.idx) PC.idx = PC.threads.map((th) => [PC.P.findIndex((c) => c.pts.includes(th.pa)), PC.P.findIndex((c) => c.pts.includes(th.pb))]);
    const sh = 2 * easeOut(seg(td, 0, 0.16)), ox = dir[0] * sh, oy = dir[1] * sh * FY;
    const imp = [PC.cx - dir[0] * 3, PC.cy - 2];
    const SEAM = (p) => 0.05 + 0.3 * Math.min(1, Math.hypot(p.x - imp[0], p.y - imp[1]) / (14 * S));
    const STRAIN0 = 0.4, LET = 0.8;
    const goOf = (j) => LET + rand(j, 17) * 0.25;
    // the limbs: pixels well out in front of the body's core (the arms and claws), by reach
    const fs = Math.sign(Math.cos(g0.face)) || 1, reach = (p) => (p.x - PC.cx) * fs - 3.5;
    let maxR = 0; if (o.limbs) for (const P of PC.P) for (const p of P.pts) maxR = Math.max(maxR, reach(p));
    const limb = (p) => o.limbs && reach(p) > 0;
    const vanish = (p, sp) => (limb(p) ? 0.3 + (maxR - reach(p)) * 0.045 + rand(p.i, 23) * 0.05 : sp + 0.15 + p.d * 0.1 + rand(p.i, 23) * 0.3);
    const D2 = PC.P.map((c, j) => {
      const sp = goOf(j), creep = 1.5 * smooth(seg(td, STRAIN0, sp)), drift = td > sp ? 4.5 * (0.7 + 0.4 * rand(j, 19)) * easeOut(seg(td, sp, sp + 0.7)) * Math.sqrt(S) : 0;
      return [ox + c.ux * (creep + drift), oy + c.uy * (creep + drift) * 0.8];
    });
    const strain = seg(td, STRAIN0, LET);
    const stand = [[g0.y, (c, E) => {
      const ems = [];
      PC.P.forEach((pc, j) => {
        const [dx, dy] = D2[j], sp = goOf(j);
        for (const p of pc.pts) {
          const tv = vanish(p, sp); if (td > tv) continue;
          const x = Math.round(p.x + dx), y = Math.round(p.y + dy);
          if (td > tv - 0.06) { ems.push([x, y, td > tv - 0.03 ? R[1] : R[2]]); continue; }
          // a limb glows along its length just before it goes
          if (limb(p) && td > tv - 0.18 && !p.dark) { ems.push([x, y, (p.x + p.y) % 2 ? R[2] : R[3]]); continue; }
          if (p.seam && !p.dark && td > SEAM(p) && (!o.limbs || (p.x + p.y) % 2 === 0)) ems.push([x, y, td - SEAM(p) < 0.04 ? '#ffffff' : (p.x + p.y) % 2 ? R[2] : R[3]]);
          else if (p.em) ems.push([x, y, p.col]);
          else X.px(c, x, y, td > 0.1 && !p.dark ? X.mix(p.col, '#ff9ad0', 0.1 + 0.15 * strain) : p.col);
        }
      });
      if (ems.length) E.em((cc) => { for (const [x, y, col] of ems) X.px(cc, x, y, col); });
    }]];
    return {
      actor: Object.assign({}, g0, { alpha: 0 }), stand,
      under(c) { if (td < LET + 0.3) X.ellipse(c, g0.x + ox, g0.y + 1, 5 * S, 1.6 * S, 'rgba(8,6,16,0.45)', 1 - seg(td, LET - 0.1, LET + 0.3) * 0.6); },
      fx(c) {
        star(c, imp, td, R[1], 4 * S);
        if (td < 0.18) { const q = td / 0.18; X.ring(c, imp[0], imp[1], 2 + q * 5 * S, (2 + q * 5 * S) * 0.8, R[1], 1 - q); }
        if (td > STRAIN0 - 0.05) PC.threads.forEach((th, n) => {
          const [ia, ib] = PC.idx[n]; if (ia < 0 || ib < 0) return;
          const ts = Math.min(goOf(ia), goOf(ib)) + th.r * 0.05;
          const a = [th.pa.x + D2[ia][0], th.pa.y + D2[ia][1]], b = [th.pb.x + D2[ib][0], th.pb.y + D2[ib][1]];
          if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1.5) return;
          if (td < ts) X.line(c, a[0], a[1], b[0], b[1], strain > 0.6 && Math.floor(td * 20 + th.r * 7) % 4 === 0 ? R[1] : R[3]);
          else if (td < ts + 0.1) X.px(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, R[2]);
        });
        PC.P.forEach((pc, j) => {
          const sp = goOf(j);
          for (const p of pc.pts) {
            if (p.i % (limb(p) ? 3 : 9)) continue;
            const e = td - vanish(p, sp); if (e < 0 || e > 0.06) continue;
            X.px(c, p.x + D2[j][0], p.y + D2[j][1], '#ffffff');
          }
        });
      },
      lights: [[PC.cx + ox, g0.y - 4, 30, '#ff4f9b', td < 0.12 ? 0.6 : (0.1 + 0.25 * seg(td, 0.1, LET)) * (1 - seg(td, LET, LET + 0.9))]],
    };
  }
  DD.bespoke.arcane3 = arcane3;
  BG.arcane = (ev, t, td, g0, D, key, fade) => arcane3(ev, t, td, g0, D, key, fade, { limbs: true });
  ARCH.grabber = { overlay: OG, bespoke: BG, drop() {} };

  // ---------------------------------------------------------------------------
  // SHIELDBEARER: the shield.
  const OS = {};
  const CLANG = 0.42;
  // BASE: the blow knocks the shield out of its grip: it tips forward and lands flat with a clang,
  // rocking like a dropped lid, while the body goes over backwards. The shield stays lying.
  function shieldDrop(td, g0, t0 = 0.04, dur = CLANG - 0.04) {
    const p0 = shieldAt(g0), p1 = [p0[0] + Math.cos(g0.face) * 5, p0[1] + Math.sin(g0.face) * 2 + 1];
    const e = td - t0, k = clamp(e / dur, 0, 1);
    const fall = k * k, rockA = e > dur ? 0.28 * Math.abs(Math.sin((e - dur) * 26)) * Math.exp(-(e - dur) * 7) : 0;
    return { x: lerp(p0[0], p1[0], fall), y: lerp(p0[1], p1[1], fall), tilt: Math.max(1 - fall, rockA), landed: e >= dur, e: e - dur };
  }
  const clang = (c, p, e) => {
    if (e < 0 || e > 0.3) return;
    star(c, [p[0], p[1] - 2], e, '#ffffff', 5);
    if (e < 0.2) K.gring(c, p[0], p[1], 4 + e * 40, '#e8e8f0', 1 - e / 0.2, 1);
    for (let k = 0; k < 5; k++) { const an = -Math.PI / 2 + (k - 2) * 0.6, d = 3 + e * 30; X.px(c, p[0] + Math.cos(an) * d, p[1] - 2 + Math.sin(an) * d * 0.6 + 40 * e * e, k % 2 ? '#ffffff' : '#ffe8a0'); }
  };
  OS.base = ov(function (c, g, td, dir, st, A, m) {
    const s = shieldDrop(td, m.g0); clang(c, [s.x, s.y], s.e);
    K.dust(c, s.x, s.y + 1, s.e, 221, 3, 7, '#8a7a68', 0.3);
  }, {
    motion: { fall: 'topple', club: false },
    body: (g, td) => ({ bare: td > 0.04 ? 1 : 0 }),
    stand(stand, g, td, dir, st, m) { const s = shieldDrop(td, m.g0); stand.push([s.y, (c) => { if (keep(s.x, s.y, m.fade)) shieldProp(c, s.x, s.y, s.tilt); }]); },
  });
  // BOULDER: the rock smashes the shield to splinters (planks, the bent rim, the boss pinging away)
  // and the boulder death throws the body, a shorter way (it's armoured).
  function splinters(stand, td, g0, dir, fade) {
    const p0 = shieldAt(g0);
    for (let k = 0; k < 9; k++) {
      const far = 10 + rand(k, 231) * 26, sideA = (rand(k, 232) - 0.5) * 1.4, ang0 = Math.atan2(dir[1], dir[0]) + sideA;
      const kind = k < 6 ? 'wood' : k < 8 ? 'rim' : 'boss', fl = kind === 'boss' ? 2.2 : 1;
      const p = toss(td, 0, p0, [p0[0] + Math.cos(ang0) * far * fl, p0[1] + Math.sin(ang0) * far * fl * FY + (rand(k, 233) - 0.5) * 6], 10 + rand(k, 234) * 10, 0.4 + rand(k, 235) * 0.2, 5);
      if (!p) continue;
      const rot = rand(k, 236) * TAU + Math.min(p.e, 0.5) * (8 + rand(k, 237) * 10);
      stand.push([p.y, (c) => {
        if (!keep(p.x, p.y, fade)) return;
        const x = p.x, y = p.y - p.z, ux = Math.cos(rot), uy = Math.sin(rot) * 0.75;
        if (kind === 'wood') { const l = 2 + (k % 2); X.line(c, x - ux * l, y - uy * l + 1, x + ux * l, y + uy * l + 1, OL); X.line(c, x - ux * l, y - uy * l, x + ux * l, y + uy * l, k % 3 ? '#8a6a48' : '#6a4a2c'); X.px(c, x + ux * l, y + uy * l, '#c8a070'); }
        else if (kind === 'rim') X.lines(c, [[x - ux * 3, y - uy * 3], [x, y - 1], [x + ux * 3, y + uy * 2]], '#8a8e98');
        else { X.rect(c, x - 1, y - 1, 3, 3, OL); X.rect(c, x, y, 2, 2, '#c8ccd8'); X.px(c, x, y, '#ffffff'); }
      }]);
    }
  }
  OS.earth = ov(function (c, g, td, dir, st, A, m) {
    OV.earth(c, g, td, dir, st, A, m);
    const p0 = shieldAt(m.g0);
    if (td < 0.05) X.ellipse(c, p0[0], p0[1] - 6, 7, 6, '#fff4e0');
    star(c, [p0[0], p0[1] - 6], td, '#ffe8c0', 9);
    K.debris(c, p0[0], p0[1] - 1, td, 241, 10, 36, ['#8a6a48', '#6a4a2c', '#c8a070'], 40);
  }, {
    motion: Object.assign({}, OV.earth.motion, { club: false }),
    motionFor: (st, o) => Object.assign(OV.earth.motionFor(st, o), { fling: 22 + 12 * clamp(o.overkill || 0, 0, 1), flatten: false, club: false }),
    body: () => ({ bare: 1 }),
    ground: OV.earth.ground,
    stand(stand, g, td, dir, st, m) { splinters(stand, td, m.g0, dir, m.fade); },
  });
  // FIRE: it burns standing (fire v2), but its wooden shield drops first and burns on as a flat
  // plank fire after the body has crumbled, the wood charring away until only the blackened iron
  // rim and boss are left on a scorch mark.
  const SDROP = 0.22;
  const sbBurn = (td) => Math.min(seg(td, SDROP + 0.12, SDROP + 0.3), 1 - seg(td, 2.1, 2.7));
  OS.fire = ov(function (c, g, td, dir, st, A, m) {
    OV.fire(c, g, td, dir, st, A, m);
    const s = shieldDrop(td, m.g0, SDROP, 0.3), k = sbBurn(td);
    clang(c, [s.x, s.y], s.e);
    if (k > 0.04) for (let j = -3; j <= 3; j++) K.tongue(c, s.x + j * 1.3, s.y - 2 + (j % 2), 1.1, (2.5 + 2 * Math.sin(td * 14 + j * 1.9)) * k * (1 - Math.abs(j) * 0.1), Math.sin(td * 6 + j) * 1.2);
    if (k > 0.2) for (const p of emit(td, 4, 1.2, (i, age) => ({ x: s.x + (rand(i, 251) - 0.5) * 6 + age * 5, y: s.y - 6 - age * 15, age }), SDROP + 0.3, 99)) K.puff(c, p.x, p.y, 1.5 + p.age * 3, '#3a3644', (1 - p.age) * 0.7 * k);
  }, {
    motion: Object.assign({}, OV.fire.motion),
    body: (g, td) => Object.assign(OV.fire.body(g, td), { bare: td > SDROP ? 1 : 0 }),
    ground(c, E, g, td, dir, st, m, fade) { OV.fire.ground(c, E, g, td, dir, st, m, fade); const s = shieldDrop(9, m.g0, SDROP, 0.3); K.scorch(c, s.x, s.y, 7 * seg(td, SDROP + 0.3, 1.4), 0.75 * fade); },
    lights(g, td, st, m) { const s = shieldDrop(9, m.g0, SDROP, 0.3); return [...OV.fire.lights(g, td, st, m), [s.x, s.y - 3, 30, '#ff7020', 0.6 * sbBurn(td)]]; },
    stand(stand, g, td, dir, st, m) {
      const s = shieldDrop(td, m.g0, SDROP, 0.3), ch = smooth(seg(td, SDROP + 0.3, 2.0)), wood = 1 - smooth(seg(td, 1.9, 2.7)) * 0.85;
      stand.push([s.y, (c) => { if (keep(s.x, s.y, m.fade)) shieldProp(c, s.x, s.y, s.tilt, ch, wood); }]);
    },
  });
  ARCH.shieldbearer = { overlay: OS, drop(c, x, y, side, ex, m, fade) { if (keep(x, y, fade)) shieldProp(c, x, y + 1, 0); } };

  // ---------------------------------------------------------------------------
  // The vignettes: one enemy, one wizard casting the killing spell (the goblin cards' rhythms).
  const G = { x: 128, y: 72 }, FACE = Math.PI - 0.65;
  const MK = {
    brute: (o) => K.brute(Object.assign({ id: 'g1', face: FACE, seed: 2 }, o)),
    archer: (o) => K.archer(Object.assign({ id: 'g1', face: FACE, seed: 1 }, o)),
    imp: (o) => K.gob(Object.assign({ id: 'g1', face: FACE, seed: 1, variant: 3, pal: 3 }, o)),
    grabber: (o) => K.gob(Object.assign({ id: 'g1', face: FACE, seed: 1, variant: 4, pal: 4 }, o)),
    shieldbearer: (o) => K.gob(Object.assign({ id: 'g1', face: FACE, seed: 1, variant: 5, pal: 5 }, o)),
  };
  const SPELL = {
    // Shield, Force: the shove wave (no overlay: the base death)
    wave(t, o) {
      const c0 = 0.55, me = caster(t, 'shield', c0, 0.8), front = (tt) => lerp(ME.x + 10, 214, easeOut(seg(tt, c0, c0 + 0.95)));
      let tH = c0; while (front(tH) < o.gx - 6 && tH < c0 + 1) tH += 0.01;
      const f = front(t), on = t > c0 && f < 210;
      return {
        me, tH, lights: on ? [[f, 72, 50, '#ffc83a', 0.5]] : [],
        stand(stand) { if (on) { const arc = []; for (let k = -1; k <= 1.001; k += 0.1) arc.push([f - k * k * 12, 72 + k * 28]); K.sheet(stand, arc, { h: 15 * smooth(seg(t, c0, c0 + 0.12)) * (1 - seg(f, 160, 210)), ramp: EL.shield, alpha: 0.2 }, t); } },
        fx(c, A) { K.prep(c, me, A, t, ['shield'], 0.05, c0); },
      };
    },
    // Rock, Force: a charge at the staff, a fast flight; it drops and rolls (or bursts: o.burst)
    rock(t, o) {
      const c0 = 0.95, tH = 1.2, me = caster(t, 'earth', c0, 1.15, { prep: t < c0 ? smooth(seg(t, 0.05, 0.25)) : 0 }), to = o.to || [o.gx - 1, o.gy - 9], from = [ME.x + 8, ME.y - 22];
      let rp = null;
      if (t >= c0 && t < tH) { const k = seg(t, c0, tH); rp = [lerp(from[0], to[0], k), lerp(from[1], to[1], k) - Math.sin(k * Math.PI) * 4]; }
      else if (!o.burst && t >= tH && t < tH + 0.9) { const e = t - tH; rp = [to[0] - 6 * easeOut(seg(e, 0, 0.5)), to[1] + 8 * Math.min(1, e / 0.25) - K.hop(e, 0.25, 3, 0.25)]; }
      return {
        me, tH, shake: t > tH && t < tH + 0.2 ? 2 : 0, lights: rp && t < tH ? [[rp[0], rp[1] + 10, 26, '#b8946a', 0.4]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, o.q, 0.05, 0.35);
          const ch = A.me.charge, charge = smooth(seg(t, 0.3, c0 - 0.05));
          if (t < c0 && t > 0.3) { K.rock(c, ch[0], ch[1] + 2, 1.5 + charge * 4, 4); for (let i = 0; i < 6; i++) { const a = t * 9 + i, r = 9 - charge * 5; X.px(c, ch[0] + Math.cos(a) * r, ch[1] + 2 + Math.sin(a) * r * 0.7, i % 2 ? '#b8946a' : '#e0c8a0'); } }
          if (rp) K.rock(c, rp[0], rp[1], 5, 4);
        },
      };
    },
    // Earth, Area: the quake ring rolling out from the caster
    quake(t, o) {
      const c0 = 0.6, me = caster(t, 'earth', c0, 0.9), R = (tt) => 4 + 84 * easeOut(clamp((tt - c0) / 0.8, 0, 1)), front = R(t);
      let tH = c0; while (R(tH) < o.gx - ME.x - 4 && tH < c0 + 1) tH += 0.01;
      return {
        me, tH, shake: t > c0 && t < c0 + 0.5 ? 2 * (1 - (t - c0) / 0.5) : 0,
        under(c) {
          if (t > c0) { K.cracks(c, ME.x, ME.y, 30, 5, seg(t, c0, c0 + 0.4), '#1a120c', 9); X.ellipse(c, ME.x, ME.y, 12, 6, 'rgba(26,18,12,0.5)'); }
          if (t > c0 && t < c0 + 1.1) { const a = 1 - seg(t, c0 + 0.6, c0 + 1.1); K.gring(c, ME.x, ME.y, front, '#553e2a', a, 3); K.gring(c, ME.x, ME.y, front + 1, '#b8946a', a, 1); }
        },
        lights: t > c0 && t < c0 + 0.6 ? [[ME.x, ME.y, front + 10, '#d8b88a', 0.5 * (1 - seg(t, c0, c0 + 0.6))]] : [],
        fx(c, A) {
          K.prep(c, me, A, t, ['earth', 'earth'], 0.05, c0);
          if (t > c0 && t < c0 + 1.1) {
            const e = (t - c0) / 1.1, a = 1 - seg(e, 0.5, 1);
            K.gring(c, ME.x, ME.y, front, K.ROCK[1], a, 2); K.gring(c, ME.x, ME.y, front - 2, K.ROCK[3], a, 2);
            for (let i = 0; i < 22; i++) { const an = (i / 22) * TAU + rand(i, 2) * 0.2, x = ME.x + Math.cos(an) * front, y = ME.y + Math.sin(an) * front * FY; K.puff(c, x, y - 2 - e * 4, 2 + e * 3, i % 2 ? '#8a7a68' : '#6a5a4a', 1 - e); }
          }
        },
      };
    },
    // a spray (Force channel): fire, cold, water, scald
    cone(t, o) {
      const c0 = 0.55, me = caster(t, o.el, c0, o.c1);
      return {
        me, tH: o.tH, lights: t > c0 && t < o.c1 ? [[95, 74, 50, o.lc || '#ffffff', 0.5]] : [],
        fx(c, A) { K.prep(c, me, A, t, o.q, 0.05, c0); K.cone(c, A.me.tip, [o.gx, o.gy - (o.aimY || 6)], t, o.kind, c0, o.c1, { spread: 0.24, reach: o.reach || 1.1 }); },
      };
    },
    // Arcane, Force: the beam
    beam(t, o) {
      const c0 = 0.55, tH = o.tH, c1 = tH + 0.2, me = caster(t, 'arcane', c0, c1), on = Math.min(easeOut(seg(t, c0, c0 + 0.12)), 1 - seg(t, c1, c1 + 0.1));
      return { me, tH, lights: on > 0.05 ? [[95, 74, 54, '#d02a78', 0.45 * on]] : [], fx(c, A) { K.prep(c, me, A, t, ['arcane'], 0.05, c0); if (on > 0.02) K.beam(c, A.me.tip, [o.gx, o.gy - 8], t, EL.arcane, { on }); } };
    },
    // Lightning, Force: the arc
    zap(t, o) {
      const c0 = 0.55, tH = o.tH, c1 = tH + 0.12, me = caster(t, 'lightning', c0, c1), on = t > c0 + 0.05 && t < c1, fl = on && Math.floor(t * 18) % 3 !== 2;
      return {
        me, tH, on, lights: fl ? [[o.gx, o.gy - 6, 50, '#b08aff', 0.8], [80, 70, 40, '#b08aff', 0.4]] : [],
        fx(c, A) { K.prep(c, me, A, t, ['lightning'], 0.05, c0); if (fl) { const s = Math.floor(t * 18); K.zap(c, A.me.tip, A.g1.chest, s * 13); K.zapHit(c, A.g1.chest, s); } },
      };
    },
  };
  function scene(t, d, o) {
    const D = d.dur, ev = d.event, gx = o.gx || G.x, gy = G.y;
    const sp = SPELL[o.spell](t, Object.assign({ gx, gy, q: d.q }, o)), tH = sp.tH;
    const pre = o.pre ? o.pre(t, tH, sp) : {};
    const g0 = MK[ev.archetype](Object.assign({ x: gx, y: gy, alpha: K.life(t, D) }, pre));
    const dd = DD.death(ev, t, tH, g0, D, d.id);
    const stand = dd.stand.slice(); if (sp.stand) sp.stand(stand);
    return {
      actors: [sp.me, dd.actor], stand, shake: Math.max(sp.shake || 0, dd.shake || 0),
      under(c, E) { if (sp.under) sp.under(c, E); dd.under(c, E); },
      lights: [...(dd.lights || []), ...(sp.lights || [])],
      fx(c, A) { sp.fx(c, A); if (o.preFx && t < tH) o.preFx(c, A, g0, t, tH); dd.fx(c, A); },
    };
  }
  const V = (d, o) => add(Object.assign({ group: 'deaths2', ground: 'path', fresh: 'new', approach: 'bespoke' }, d, { frame(t) { return scene(t, this, o); } }));
  const ARCH_N = { brute: 'Brute', archer: 'Archer', imp: 'Fire imp', grabber: 'Grabber', shieldbearer: 'Shieldbearer' };
  const T = (a, s) => ARCH_N[a] + ' death: ' + s;
  const burnPre = (c0) => (t, tH) => { const b = seg(t, c0 + 0.25, c0 + 0.5); return { burn: t < tH ? b : 0, flash: t < tH && Math.floor(t * 10) % 3 === 0 ? 0.1 : 0, flashCol: EL.fire[0] }; };
  const burnFx = (c0) => (c, A, g0, t) => K.burning(c, A, g0, t, seg(t, c0 + 0.25, c0 + 0.5));

  // --- Brute
  V({ id: 'death-brute-base', still: 1.25, title: T('brute', 'base'), q: ['shield'], cast: 'force', dur: 3.8, seed: 301,
    event: { archetype: 'brute', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'Too heavy to be knocked flying: it rocks on its heels, sinks to its knees and goes over like a felled tree; the ground shakes, dust rolls out along its length, and it poofs from a dent in the ground. Also water, life, sigil and shield kills.' },
  { spell: 'wave', gx: 132 });
  V({ id: 'death-brute-boulder', still: 1.6, title: T('brute', 'boulder (earth missile)'), q: ['earth', 'earth', 'earth'], cast: 'force', dur: 3.9, seed: 302, ground: 'grass',
    event: { archetype: 'brute', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: {}, overkill: 0.9 },
    line: 'A boulder can’t fling a brute: the rock bursts on its chest, it skids back on its heels ploughing two furrows, and goes over backwards with a ground shake.' },
  { spell: 'rock', gx: 126, burst: true, to: [124, 55] });
  V({ id: 'death-brute-quake', still: 1.75, title: T('brute', 'quake (earth burst)'), q: ['earth', 'earth'], cast: 'area', dur: 4.0, seed: 303, ground: 'grass',
    event: { archetype: 'brute', element: 'earth', delivery: 'burst', dir: [1, 0], statuses: {}, overkill: 0.5 },
    line: 'Too heavy to bounce: the ground heaves it a little way up and breaks into slabs under it; it comes down on its knees on the broken ground, then falls with a shake.' },
  { spell: 'quake', gx: 124 });
  V({ id: 'death-brute-cold', still: 1.45, title: T('brute', 'cold'), q: ['cold', 'cold'], cast: 'force', dur: 4.2, seed: 304,
    event: { archetype: 'brute', element: 'cold', delivery: 'channel', dir: [1, 0], statuses: { chilled: 1 }, overkill: 0.2 },
    line: 'Frost-stiff, so it can’t kneel: a shiver, then it tips over whole like a frozen tree; the slam cracks the rime along its length, throws up ice chips and snow, and shakes the ground.' },
  { spell: 'cone', el: 'cold', kind: 'cold', c1: 1.75, tH: 1.55, gx: 132, aimY: 12, lc: '#9ff4ff',
    pre: (t, tH) => ({ chill: smooth(seg(t, 0.65, tH)) }), preFx: (c, A, g0, t, tH) => K.chilled(c, A, g0, t, smooth(seg(t, 0.65, tH))) });

  // --- Archer
  V({ id: 'death-archer-base', still: 1.5, title: T('archer', 'base'), q: ['shield'], cast: 'force', dur: 3.6, seed: 311,
    event: { archetype: 'archer', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'The goblin’s base, but the gear goes too: the bow flies out of its hands and clatters down, arrows spill out of its quiver as it lands, and they are left lying after the poof.' },
  { spell: 'wave' });
  V({ id: 'death-archer-fire', still: 1.7, title: T('archer', 'fire'), q: ['fire', 'fire'], cast: 'force', dur: 4.2, seed: 312,
    event: { archetype: 'archer', element: 'fire', delivery: 'channel', dir: [1, 0], statuses: { burning: 1 }, overkill: 0.3 },
    line: 'Fire v2 on the archer: the bowstring burns through and snaps, the bow drops and burns on the ground, the arrows on its back flare like matches; the archer chars and crumbles, and a charred bow is left.' },
  { spell: 'cone', el: 'fire', kind: 'fire', c1: 1.55, tH: 1.3, lc: '#ff7a2a', pre: burnPre(0.55), preFx: burnFx(0.55) });
  V({ id: 'death-archer-boulder', still: 1.1, title: T('archer', 'boulder (earth missile)'), q: ['earth', 'earth', 'earth'], cast: 'force', dur: 3.8, seed: 313, ground: 'grass',
    event: { archetype: 'archer', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: {}, overkill: 0.9 },
    line: 'The boulder death, plus its gear: the bow spins away along the throw and the arrows spray out of the quiver after the body, landing scattered down the path.' },
  { spell: 'rock', gx: 114, to: [113, 63] });

  // --- Imp
  V({ id: 'death-imp-base', still: 1.75, title: T('imp', 'base'), q: ['shield'], cast: 'force', dur: 3.8, seed: 321,
    event: { archetype: 'imp', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'Its crown flame gutters as it falls; it poofs in ember smoke, and the flame is left on the ground, flickering out into a wisp of smoke. Every imp death that poofs leaves that flame.' },
  { spell: 'wave' });
  V({ id: 'death-imp-cold', still: 0.75, title: T('imp', 'cold (put out)'), q: ['cold', 'cold'], cast: 'force', dur: 4.2, seed: 322,
    event: { archetype: 'imp', element: 'cold', delivery: 'channel', dir: [1, 0], statuses: { chilled: 1 }, overkill: 0.4 },
    line: 'Goes out like a cooled coal: the crown flame dies in a curl of smoke, the red skin cools to grey-black stone with glowing lava cracks that fade, then it breaks into chunky cinders that drop into a heap, the last ember winking out.' },
  { spell: 'cone', el: 'cold', kind: 'cold', c1: 1.4, tH: 1.15, lc: '#9ff4ff', pre: (t, tH) => ({ chill: 0.5 * seg(t, 0.65, tH) }) });
  V({ id: 'death-imp-water', still: 1.2, title: T('imp', 'water (doused)'), q: ['water'], cast: 'force', dur: 4.0, seed: 323,
    event: { archetype: 'imp', element: 'water', delivery: 'channel', dir: [1, 0], statuses: { wet: 1 }, overkill: 0.4 },
    line: 'Doused: a burst of hissing steam, the crown snuffed at once, its skin blackening as it shrinks and sinks; the steam clears on a small smoking lump in a dark wet patch, still sizzling. Also the scald mix (its fire half does nothing to an imp).' },
  { spell: 'cone', el: 'water', kind: 'water', c1: 1.4, tH: 1.0, lc: '#8ad0ff', pre: (t, tH) => ({ wet: 0.5 * seg(t, 0.7, tH) }) });
  V({ id: 'death-imp-frozen-shatter', still: 1.0, title: T('imp', 'frozen shatter'), q: ['earth', 'earth'], cast: 'force', dur: 3.8, seed: 324,
    event: { archetype: 'imp', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: { frozen: 1 }, overkill: 0.5 },
    line: 'Its heat is trapped under the ice: the shards glow orange inside, and once they land they hiss steam and melt fast, leaving wet spots instead of a frost patch.' },
  { spell: 'rock', burst: true, pre: () => ({ frozen: 1 }), preFx: (c, A, g0, t) => K.frosty(c, A, g0, t) });

  // --- Grabber
  V({ id: 'death-grabber-base', still: 1.0, title: T('grabber', 'base'), q: ['shield'], cast: 'force', dur: 3.8, seed: 331,
    event: { archetype: 'grabber', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'Knocked off its feet, it skids face down along the blow with its long claws dragging two furrows in the ground, then poofs.' },
  { spell: 'wave', gx: 108 });
  V({ id: 'death-grabber-lightning', still: 0.95, title: T('grabber', 'lightning'), q: ['lightning'], cast: 'force', dur: 3.6, seed: 332,
    event: { archetype: 'grabber', element: 'lightning', delivery: 'arc', dir: [1, 0], statuses: { stunned: 1 }, overkill: 0.3 },
    line: 'Its long arms close the circuit: the arc jumps claw to claw and sparks off the tips while its skeleton flashes, then the usual singed, smoking topple.' },
  { spell: 'zap', tH: 1.05, pre: (t, tH, sp) => ({ shock: sp.on && t < tH ? 1 : 0, x: G.x + (sp.on && t < tH ? Math.sin(t * 60) * 0.6 : 0) }),
    preFx: (c, A, g0, t) => { if (t > 0.65 && Math.floor(t * 18) % 3 !== 2 && A.g1 && A.g1.claws) clawArc(c, A.g1.claws, Math.floor(t * 18)); } });
  V({ id: 'death-grabber-arcane', still: 0.85, title: T('grabber', 'arcane'), q: ['arcane'], cast: 'force', dur: 3.8, seed: 333, ground: 'plaza',
    event: { archetype: 'grabber', element: 'arcane', delivery: 'channel', dir: [1, 0], statuses: {}, overkill: 0.3 },
    line: 'The calm arcane tear (v3, as in the game), arms first: its long arms glow and unravel from the claws inward, then fine seams crack across the body and the small pieces drift apart and unravel.' },
  { spell: 'beam', tH: 1.15, pre: (t, tH) => ({ flash: t < tH && t > 0.6 && Math.floor(t * 12) % 3 === 0 ? 0.1 : 0, flashCol: EL.arcane[1] }) });

  // --- Shieldbearer
  V({ id: 'death-shieldbearer-base', still: 1.2, title: T('shieldbearer', 'base'), q: ['shield'], cast: 'force', dur: 3.6, seed: 341,
    event: { archetype: 'shieldbearer', element: 'shield', delivery: 'wave', dir: [1, 0], statuses: {}, overkill: 0.4 },
    line: 'The blow knocks the shield out of its grip: it tips forward and lands flat with a clang, rocking like a dropped lid, while the body goes over backwards and poofs. The shield stays lying.' },
  { spell: 'wave' });
  V({ id: 'death-shieldbearer-boulder', still: 1.45, title: T('shieldbearer', 'boulder (earth missile)'), q: ['earth', 'earth', 'earth'], cast: 'force', dur: 3.8, seed: 342, ground: 'grass',
    event: { archetype: 'shieldbearer', element: 'earth', delivery: 'missile', dir: [1, 0], statuses: {}, overkill: 0.9 },
    line: 'Earth breaks the shield: the rock smashes it to splinters, the bent rim and the boss ping away, and the body is thrown (a shorter way: it’s armoured).' },
  { spell: 'rock', gx: 116, burst: true, to: [118, 64] });
  V({ id: 'death-shieldbearer-fire', still: 2.1, title: T('shieldbearer', 'fire'), q: ['fire', 'fire'], cast: 'force', dur: 4.4, seed: 343,
    event: { archetype: 'shieldbearer', element: 'fire', delivery: 'channel', dir: [1, 0], statuses: { burning: 1 }, overkill: 0.3 },
    line: 'Fire v2 on the body, but the wooden shield drops first and keeps burning on the ground after the body has crumbled, the wood charring away until only the blackened iron rim and boss are left.' },
  { spell: 'cone', el: 'fire', kind: 'fire', c1: 1.55, tH: 1.3, lc: '#ff7a2a', pre: burnPre(0.55), preFx: burnFx(0.55) });
})();
