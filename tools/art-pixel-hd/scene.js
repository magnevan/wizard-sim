/* Pixel Battlefield: the fight as a pure function of time.
 *
 * Camera (pass 4): one steep 3/4 view, shared by everything. World units are art pixels
 * on the ground, already foreshortened: x runs right, y runs down the screen, and a
 * ground circle of radius r is an ellipse r by r*FY (FY = 0.6, so a floor slab is a bit
 * over half as tall as it is wide, and a column's top is an ellipse 0.55-0.6 of its
 * width). Height z is drawn straight up in screen pixels, a little shorter than before
 * so standing things show their tops rather than reading side-on. Pass 3 used FY = 0.88,
 * which made the ground read as seen from straight above while pillars stood side-on.
 * The map layout and the actors' walking times were authored under 0.88, so they keep
 * using LFY = 0.88 (positions on screen don't move); only the shapes use FY.
 * Facing angles are measured on the un-squashed ground (atan2(dy / FY, dx)), so
 * 0 = east, PI/2 = toward the camera, -PI/2 = away from it.
 *
 * Pass 3 follows the rules of 2026-11-04: no Ice element (Blue's wall is Shield + Earth +
 * Cold, a stone arc coated in frost), Sigil is an element on D (Earth moved to G), and
 * the turret is a Sigil device whose cast Fire runes are its ammo. Walls carry health
 * (wallState), and the shield's strength follows Gold's shield pool (shieldPool).
 *
 * PB.scene(t, chaos) returns everything the renderer needs. Nothing is stateful, so
 * ?t=<seconds> freezes any frame. The loop is LOOP seconds and every actor lives
 * inside one loop: it walks out of the fog at the end of its lane at local time 0
 * and is gone again before local time LOOP. */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});
  const LOOP = 12, TAU = Math.PI * 2, FY = 0.6, LFY = 0.88, HZ = 0.38, CU = 0.8;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const smooth = (k) => k * k * (3 - 2 * k);
  const easeOut = (k) => 1 - (1 - k) * (1 - k);
  function rand(a, b = 0, c = 0) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 40503, 668265263) ^ Math.imul((c | 0) + 32587, 1442695041);
    h = Math.imul(h ^ (h >>> 15), -2048144777); h = Math.imul(h ^ (h >>> 13), -1028477379); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // Seconds since an event at te, if it happened inside the current life (local age u).
  const since = (t, te, u = LOOP) => { const s = mod(t - te, LOOP); return s <= u ? s : -1; };
  // Deterministic particles: a steady emitter whose spawn indices wrap with the loop.
  function emit(t, rate, life, fn, from, to) {
    const n = Math.max(1, Math.round(LOOP * rate)), dt = LOOP / n, out = [];
    const k0 = Math.ceil((t - life) / dt), k1 = Math.floor(t / dt);
    for (let k = k0; k <= k1; k++) {
      const ts = k * dt;
      if (from != null && (mod(ts - from, LOOP) > mod(to - from, LOOP))) continue;
      const age = (t - ts) / life;
      if (age < 0 || age >= 1) continue;
      const p = fn(mod(k, n), age, ts);
      if (p) out.push(p);
    }
    return out;
  }
  Object.assign(PB, { LOOP, TAU, FY, LFY, HZ, CU, clamp, lerp, mod, seg, smooth, easeOut, rand, since, emit });

  // =====================================================================
  // Map: the wizards hold a ruined plaza in a clearing. Three lanes lead in:
  // a road from the west, a gully from the north between two cliff masses, and a
  // road from the east. Low rock outcrops close the south-west and south-east, and
  // nothing comes from the south (the camera side).
  // =====================================================================
  const GY = 352;                                   // the gully mouth
  const Lx = (y) => 568 + (GY - y) * 0.35;          // west edge of the gully at ground y
  const Rx = (y) => 668 + (GY - y) * 0.35;          // east edge
  const Cx = (y) => 618 + (GY - y) * 0.35;          // centre line
  function jagged(pts, step, amp, seed) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step));
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let k = 0; k < n; k++) {
        const f = k / n, j = k === 0 ? 0 : (rand(seed, i * 977 + k, 5) - 0.5) * 2 * amp + Math.sin(k * 0.7 + i) * amp * 0.4;
        out.push([a[0] + (b[0] - a[0]) * f + nx * j, a[1] + (b[1] - a[1]) * f + ny * j]);
      }
    }
    return out;
  }
  const CH = 19;   // cliff face height in px (50 units at HZ)
  const CLIFFS = [
    { id: 'nw', h: CH, seed: 11, poly: jagged([[-500, -500], [Lx(-500), -500], [Lx(GY), GY], [540, 360], [500, 357], [462, 367], [424, 381], [380, 386], [300, 381], [200, 388], [-500, 386]], 9, 3, 11) },
    { id: 'ne', h: CH, seed: 23, poly: jagged([[Rx(-500), -500], [2200, -500], [2200, 392], [1000, 394], [884, 386], [806, 374], [760, 364], [720, 361], [690, 357], [Rx(GY), GY]], 9, 3, 23) },
    { id: 'sw', h: 15, seed: 31, poly: jagged([[-500, 508], [240, 505], [326, 512], [374, 532], [388, 562], [368, 606], [300, 640], [-500, 652]], 9, 3, 31) },
    { id: 'se', h: 15, seed: 37, poly: jagged([[848, 528], [930, 508], [1100, 503], [2200, 506], [2200, 900], [900, 900], [858, 700], [840, 606], [836, 556]], 9, 3, 37) },
  ];
  function inPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const cliffAt = (x, y) => CLIFFS.find((c) => inPoly(c.poly, x, y)) || null;
  const inGully = (x, y) => y < GY + 6 && x > Lx(y) - 4 && x < Rx(y) + 4;
  // Worn dirt lanes (polylines) that the enemies walk in on.
  const LANES = [
    [[-200, 452], [180, 446], [400, 444], [520, 446], [600, 452]],
    [[Cx(-260), -260], [Cx(GY), GY], [622, 400], [612, 452]],
    [[1400, 452], [1000, 448], [820, 452], [700, 456], [612, 452]],
  ];
  const PLAZA = { x: 622, y: 452, r: 118 };

  // Structures. The shield is an arc bulging east around the defenders; the rock wall
  // shields the west flank; the frost-coated stone arc (Shield + Earth + Cold: earth is
  // the material, cold coats it) plugs the gully mouth with the glyph behind it.
  // Walls are rows of slabs: n segments, H px tall, T ground units thick (walls.js paints them).
  // Pass 4: walls are a little lower and much thicker in ground units, so under the
  // flatter ground (FY 0.6) they still show a deep top face.
  const ROCK = { id: 'rock', a: [518, 408], b: [452, 484], n: 7, H: 14, T: 15, mat: 'stone', owner: 'p4' };
  const SH_C = [628, 446], SH_R = 88, SH_A0 = -0.92, SH_A1 = 0.78;
  const shAt = (f) => { const a = lerp(SH_A0, SH_A1, f); return [SH_C[0] + Math.cos(a) * SH_R, SH_C[1] + Math.sin(a) * SH_R * LFY]; };
  const SHIELD = { at: shAt, h: 15, owner: 'p3' };
  const FROST = { id: 'frost', a: [557, 369], b: [685, 372], n: 6, H: 14, T: 16, mat: 'frost', owner: 'p2' };
  const TURRET = { x: 598, y: 482, h: 7, orbZ: 14, owner: 'p1' };   // orbZ: the hovering crystal's centre (pass 4.1)
  const GLYPH = { x: 618, y: 394, r: 12, owner: 'p3' };
  const PUD = { x: 621, y: 333, rx: 42, ry: 15 };
  const W_SP = [-40, 450], N_SP = [Cx(40), 40], E_SP = [1290, 452];
  const CAMERA = { x: 622, y: 430 };
  PB.MAP = { GY, Lx, Rx, Cx, CLIFFS, cliffAt, inPoly, inGully, LANES, PLAZA, ROCK, SHIELD, FROST, TURRET, GLYPH, PUD, CAMERA };

  // =====================================================================
  // Actors
  // =====================================================================
  // route(speed, pts): keys [u, x, y] travelling between points at a constant speed.
  // A point may carry a hold (seconds to wait there), an absolute arrival time via
  // { arrive } (used to sync with scripted events), an { until }, or its own speed.
  function route(u0, speed, pts) {
    const keys = [[u0, pts[0][0], pts[0][1]]];
    let u = u0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      const d = Math.hypot(p[0] - q[0], (p[1] - q[1]) / LFY);
      if (p.arrive != null) u = Math.max(u + 0.05, p.arrive); else u += d / (p.spd || speed);
      keys.push([u, p[0], p[1]]);
      if (p.hold) { u += p.hold; keys.push([u, p[0], p[1]]); }
      if (p.until != null) { u = Math.max(u, p.until); keys.push([u, p[0], p[1]]); }
    }
    return keys;
  }
  const P = (x, y, o) => Object.assign([x, y], o || {});
  function prepPath(keys) {
    const cum = [0];
    for (let i = 1; i < keys.length; i++) cum.push(cum[i - 1] + Math.hypot(keys[i][1] - keys[i - 1][1], (keys[i][2] - keys[i - 1][2]) / LFY));
    return { keys, cum };
  }
  function pathAt(pp, u) {
    const k = pp.keys;
    if (u <= k[0][0]) return { x: k[0][1], y: k[0][2], d: 0 };
    for (let i = 1; i < k.length; i++) {
      if (u <= k[i][0]) {
        const a = k[i - 1], b = k[i], f = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 1;
        return { x: lerp(a[1], b[1], f), y: lerp(a[2], b[2], f), d: lerp(pp.cum[i - 1], pp.cum[i], f) };
      }
    }
    const l = k[k.length - 1];
    return { x: l[1], y: l[2], d: pp.cum[pp.cum.length - 1] };
  }

  const ACTORS = [];
  function actor(o) {
    const a = Object.assign({ z: 0, hits: [], squash: [], life: LOOP + 1, t0: 0, fog: false, seed: ACTORS.length * 7 + 3 }, o);
    a.pp = prepPath(a.keys);
    ACTORS.push(a);
    return a;
  }
  const byId = (id) => ACTORS.find((a) => a.id === id);
  // Base (un-knocked) ground position of an actor at absolute time t.
  function basePos(a, t) { return pathAt(a.pp, mod(t - a.t0, LOOP)); }

  // ---- wizards (P1 is the local player) ----
  // casts: [prepStart, castStart, castEnd, kind, queued elements]. Prep is the visible
  // queueing: each element leaves the wizard's swirl and joins the charge, one by one.
  const BRUTE_A_CHEST = (t) => { const p = basePos(byId('bruteA'), t); return [p.x, p.y]; };
  const SLIP_AT = [706, 488];
  // Rules of 2026-11-04: Blue raises the frost-coated stone arc (Shield + Earth + Cold)
  // again after the brute breaks it; Gold's glyph is Sigil + Earth; Violet re-raises the
  // rock wall. Pass 4: Red's turret (Sigil + Fire + Fire, planted before the loop) never
  // runs out on its own: every shot draws a Fire rune from Red's pool, so Red is never
  // re-planting it; when Red runs dry the turret waits.
  const ROCK_MID = [485, 446], FROST_MID = [621, 370];
  actor({ id: 'p1', kind: 'wizard', team: 'p1', el: 'arcane',
    keys: [[0, 560, 448], [6.0, 560, 448], [6.9, 548, 478], [10.7, 548, 478], [11.6, 560, 448], [12, 560, 448]],
    look: (t) => (t < 5.3 ? BRUTE_A_CHEST(t) : t < 7.0 ? [620, 352] : t < 9.4 ? [TURRET.x, TURRET.y] : t < 10.65 ? SLIP_AT : [430, 446]),
    casts: [[0.45, 1.0, 5.05, 'beam', ['arcane', 'fire']]], squash: [[1.05, -0.9], [5.05, 0.5]] });
  actor({ id: 'p2', kind: 'wizard', team: 'p2', el: 'cold',
    keys: [[0, 622, 412], [12, 622, 412]],
    look: (t) => (t < 9.5 && t > 7.9 ? SLIP_AT : [621, 336]),
    casts: [[0.15, 0.72, 2.45, 'spray', ['water', 'water']], [3.35, 3.92, 5.25, 'spray', ['cold', 'cold']], [9.65, 10.3, 10.6, 'wall', ['shield', 'earth', 'cold']]],
    squash: [[0.75, -0.7], [3.95, -0.7], [10.33, -0.8]] });
  actor({ id: 'p3', kind: 'wizard', team: 'p3', el: 'lightning',
    keys: [[0, 664, 444], [8.3, 664, 444], [9.0, 650, 418], [11.3, 650, 418], [12, 664, 444]],
    look: (t) => (t > 2.0 && t < 3.7 ? [621, 334] : t > 9.2 && t < 11.3 ? [GLYPH.x, GLYPH.y] : t > 8.2 && t < 9.2 ? [GLYPH.x, GLYPH.y] : [760, 420]),
    casts: [[2.15, 2.7, 3.6, 'chain', ['lightning', 'lightning']], [9.3, 9.9, 11.25, 'glyph', ['sigil', 'earth']]],
    squash: [[2.75, -1], [9.95, -0.5]] });
  actor({ id: 'p4', kind: 'wizard', team: 'p4', el: 'earth',
    keys: [[0, 676, 472], [8.55, 676, 472], [9.0, 688, 481], [10.45, 688, 481], [10.95, 676, 472], [12, 676, 472]],
    look: (t) => (t > 7.6 && t < 10.3 ? SLIP_AT : t > 10.85 || t < 0.5 ? ROCK_MID : t < 3.4 ? [610, 560] : [780, 470]),
    casts: [[7.85, 8.45, 8.45, 'conjure', ['earth', 'arcane', 'earth']], [10.95, 11.5, 11.75, 'wall', ['shield', 'earth']]],
    swings: [9.2, 9.8], weapon: [8.45, 10.55], squash: [[9.2, -0.8], [9.8, -1], [11.53, -0.7]] });

  // ---- enemies ----
  // Group W (north): come down the gully, held by the frost-coated wall; wetted, zapped,
  // frozen, then shattered by a turret bolt's steam blast (which also cracks the frost).
  const W_POS = [[597, 336], [622, 342], [647, 337], [620, 320]];
  const W_SHATTER = 6.86;
  W_POS.forEach((p, i) => {
    const t0 = 7.55 + i * 0.12;
    actor({ id: 'w' + i, kind: 'goblin', team: 'enemy', fog: true, t0,
      keys: route(0, 92, [N_SP, P(Cx(200), 200), P(p[0] + 6, p[1] - 24), P(p[0], p[1], { spd: 40 }), P(p[0] + 3, p[1] - 3, { arrive: mod(4.3 - t0, LOOP) })]),
      look: () => [p[0] + (p[0] - 621) * 0.3, p[1] + 60],
      life: mod(W_SHATTER + i * 0.07 - t0, LOOP),
      wet: (t) => (t < W_SHATTER ? seg(t, 1.0 + i * 0.12, 1.35 + i * 0.12) : 0),
      shock: (t) => (t > 2.85 + i * 0.07 && t < 3.55 ? 1 : 0),
      frozen: (t) => (t < W_SHATTER + 0.3 ? seg(t, 4.25 + i * 0.15, 4.95 + i * 0.15) : 0),
      shatter: W_SHATTER + i * 0.07,
      hits: [{ t: 1.1 + i * 0.12, dir: [0.1, -1], push: 4, keep: true }, { t: 2.9 + i * 0.07, dir: [-0.3, -1], push: 2, flash: 1 }],
      squash: [[2.9 + i * 0.07, 0.8], [4.3 + i * 0.15, 0.5]] });
  });
  // Brute A (west): walks in on the road, takes the fire-carrying arcane beam, catches
  // fire, pounds the rock wall, falls.
  const BA = [462, 448];
  const ROCK_PUNCH = [2.4, 3.1, 3.75, 4.45], FROST_SMASH = [7.45, 8.2];
  actor({ id: 'bruteA', kind: 'brute', team: 'enemy', fog: true, t0: 6.8,
    keys: route(0, 84, [W_SP, P(300, 446), P(440, 447), P(BA[0], BA[1], { arrive: 6.3, spd: 30 }), P(BA[0], BA[1], { until: 11 })]),
    look: () => [560, 448],
    burn: (t) => (t < 7 ? seg(t, 1.55, 2.3) : 0),
    death: { t: 5.35, kind: 'fall' }, life: mod(6.75 - 6.8, LOOP),
    punches: ROCK_PUNCH,
    hits: [{ t: 1.25, dir: [-1, -0.1], push: 6, flash: 1 }, { t: 5.35, dir: [-1, 0.2], push: 6, keep: true }],
    squash: [[1.25, 0.9], ...ROCK_PUNCH.map((p) => [p, -0.6])] });
  // Brute B (north): waits up the gully until the frozen group has shattered, then
  // smashes the frost-coated wall twice (the first blow cracks it, the second breaks
  // through), walks onto the glyph and is thrown back by it.
  const ERUPT = 8.62;
  actor({ id: 'bruteB', kind: 'brute', team: 'enemy', fog: true, t0: 0.55,
    keys: route(0, 70, [N_SP, P(Cx(170), 170), P(640, 246), P(640, 246, { until: 6.7 - 0.55 }), P(621, 352, { arrive: 7.15 - 0.55 }), P(621, 352, { until: 8.24 - 0.55 }), P(619, 376, { arrive: 8.44 - 0.55 }), P(GLYPH.x, GLYPH.y, { arrive: 8.6 - 0.55 })]),
    look: () => [618, 440],
    smashes: FROST_SMASH, death: { t: 9.05, kind: 'fall' }, life: mod(10.5 - 0.55, LOOP),
    hits: [{ t: ERUPT, dir: [0.05, -1], push: 24, keep: true, hop: 12, flash: 1 }],
    squash: [[7.15, 0.7], ...FROST_SMASH.map((s) => [s, -1]), [ERUPT, 1]] });
  // Two goblins that follow brute B through the breach and are caught by the glyph.
  [[1.6, [600, 268], [608, 348], [606, 389], [-0.7, -0.7]], [1.95, [652, 280], [636, 350], [632, 391], [0.7, -0.7]]].forEach(([t0, wait, hold, end, dir], i) => {
    actor({ id: 'l' + i, kind: 'goblin', team: 'enemy', fog: true, t0,
      keys: route(0, 88, [N_SP, P(Cx(200), 200), P(wait[0], wait[1]), P(wait[0], wait[1], { until: 7.25 - t0 }), P(hold[0], hold[1], { arrive: 7.85 - t0 }), P(hold[0], hold[1], { until: 8.25 - t0 }), P(end[0], end[1], { arrive: 8.6 - t0 })]),
      look: () => [620, 440], death: { t: ERUPT + 0.12, kind: 'fly' }, life: mod(10.2 - t0, LOOP),
      hits: [{ t: ERUPT, dir, push: 24, keep: true, hop: 10, flash: 1 }], squash: [[ERUPT, 1]] });
  });
  // The slipper (east): skirts the south end of the shield and meets P4's conjured hammer.
  actor({ id: 'slip', kind: 'goblin', team: 'enemy', fog: true, t0: 2.4, variant: 1,
    keys: route(0, 90, [E_SP, P(900, 470), P(800, 490), P(800, 490, { until: 8.0 - 2.4 }), P(742, 503, { arrive: 8.5 - 2.4 }), P(712, 494, { arrive: 8.85 - 2.4 }), P(SLIP_AT[0], SLIP_AT[1], { arrive: 9.1 - 2.4 })]),
    look: () => [622, 412], death: { t: 9.8, kind: 'fly' }, life: mod(11.25 - 2.4, LOOP),
    hits: [{ t: 9.22, dir: [0.9, 0.2], push: 7, flash: 1 }, { t: 9.82, dir: [0.85, -0.5], push: 38, keep: true, hop: 14, flash: 1 }],
    squash: [[9.22, 1], [9.82, 1]] });
  // ---- the turret draws on Red's Fire pool ----
  // Every shot costs one Fire rune from Red, drawn MOTE seconds before the shot (a mote
  // flies from Red to the turret). The turret fires as soon as it has a target, its
  // cooldown is over and Red has a whole rune; if Red is dry it waits for Red's regen.
  // Red's Fire regen pays back exactly what the loop spends (eight shots and the beam's
  // payload), so the pool loops without clamping. It hovers low, and when the east crowd
  // arrives (7.1 s) the turret drains Red to nothing and then can only fire as fast as
  // Red regenerates: the third goblin waits more than a second for its bolt.
  const TURRET_TOP = [TURRET.x, TURRET.y - TURRET.orbZ];
  const BOLT_SPEED = 430, MOTE = 0.3, TURRET_CD = 0.4;
  const BEAM_FIRE_Q = 0.45 + (1.0 - 0.45) * 1.6 / 2.4;           // when Red queues the beam's Fire (see QUEUE)
  // the steam shot is timed so its impact is what shatters the frozen group
  const steamFire = (() => { const te = W_SHATTER - 0.06, p = basePos(byId('w0'), te); return te - Math.hypot(p.x - TURRET_TOP[0], p.y - 10 - TURRET_TOP[1]) / BOLT_SPEED; })();
  // what the turret wants to shoot, and when: [time, target, steam?, crowd?]
  const WANT = [[0.4, 'r0'], [1.6, 'r1'], [2.8, 'bruteA'], [4.0, 'r2'], [steamFire, 'w0', true], [7.1, 'r3', false, 1], [7.5, 'r4', false, 1], [7.9, 'r5', false, 1]];
  const FIRE_R = (WANT.length + 1) / LOOP;                           // Red's Fire regen per second
  const FIRE_COSTS = [];                                              // times a Fire rune leaves Red's pool
  let FIRE_V0 = 0;
  const firePool = (t) => FIRE_V0 + FIRE_R * t - FIRE_COSTS.filter((c) => c <= t).length;
  const TSHOTS = (() => {
    // the pool at the seam: just enough that nothing before the crowd has to wait
    const early = WANT.filter((w) => !w[3]).map((w) => w[0] - MOTE).concat([BEAM_FIRE_Q]).sort((a, b) => a - b);
    FIRE_V0 = Math.max(...early.map((c, i) => 1 + i - FIRE_R * c)) + 0.04;
    FIRE_COSTS.push(BEAM_FIRE_Q);
    const out = [];
    let last = -9;
    for (const [want, id, steam, crowd] of WANT) {
      let c = Math.max(want, last + TURRET_CD) - MOTE;
      const v = firePool(c - 1e-6);
      if (v < 1) c += (1 - v) / FIRE_R + 0.01;                       // Red is dry: wait for the rune
      if (steam && Math.abs(c + MOTE - want) > 0.02) console.warn('turret: the steam shot had to wait');
      FIRE_COSTS.push(c); FIRE_COSTS.sort((a, b) => a - b);
      out.push({ fire: c + MOTE, want, id, steam: !!steam });
      last = c + MOTE;
    }
    return out;
  })();
  const shotAt = (id) => TSHOTS.find((s) => s.id === id);
  // Group R (east): wait on the road beyond the shield and get picked off by the turret.
  // r3-r5 come as a crowd; they are the shots that outrun Red's regen.
  const R_DEF = [['r0', [814, 432]], ['r1', [852, 460]], ['r2', [900, 432]], ['r3', [790, 452]], ['r4', [826, 470]], ['r5', [808, 436]]].map(([id, pos]) => [id, shotAt(id).fire, pos]);
  R_DEF.forEach(([id, fire, pos], i) => {
    const te = fire + Math.hypot(pos[0] - TURRET_TOP[0], pos[1] - TURRET_TOP[1]) / BOLT_SPEED;
    // the crowd walks in together and arrives about 6.9 s; the others arrive well before their shot
    const t0 = i >= 3 ? 0.95 + (i - 3) * 0.14 : te - 7.6;
    actor({ id, kind: 'goblin', variant: i === 2 || i === 4 ? 2 : 0, team: 'enemy', fog: true, t0, wait: true,
      keys: route(0, 82, [E_SP, P(pos[0] + 60, pos[1] + 4), P(pos[0], pos[1])]),
      look: () => [640, 450], death: { t: te, kind: 'fall' }, life: mod(te + 1.4 - t0, LOOP),
      hits: [{ t: te, dir: [0.9, -0.4], push: 9, keep: true, flash: 1, burn: true }], squash: [[te, 1]] });
  });
  // Archers on the north-east cliff top, shooting volleys at the energy shield: nine
  // arrows between 0.5 s and 7.3 s, then a lull while they restock. Every arrow the
  // shield absorbs costs Gold shield runes, so the arc thins out through the volley and
  // recovers in the lull.
  const ARCHERS = [[744, 341], [786, 349], [830, 357]];
  const ARROW_FLIGHT = 0.42, DRAW = 0.75;
  const ARCHER_SHOTS = [[0.5, 2.9, 5.3], [1.3, 3.7, 6.1], [2.1, 4.5, 6.9]];
  ARCHERS.forEach((p, i) => {
    actor({ id: 'a' + i, kind: 'archer', team: 'enemy', z: CH, keys: [[0, p[0], p[1]], [12, p[0], p[1]]],
      shots: ARCHER_SHOTS[i], look: () => [690, 420] });
  });
  const ARROWS = ARCHER_SHOTS.flatMap((s, i) => s.map((r, k) => ({ hit: r + ARROW_FLIGHT, cyc: i * 3 + k }))).sort((a, b) => a.hit - b.hit);
  const SHIELD_HITS = ARROWS.map((a) => a.hit), ARROW_ORDER = ARROWS.map((a) => a.cyc);
  // where arrow number cyc lands on the shield: along the arc (f) and how high (hz)
  const arrowAim = (cyc) => ({ f: 0.08 + rand(cyc, 7, 3) * 0.42, hz: 4 + rand(cyc, 7, 4) * 8 });
  // Chaos extras: more enemies in all three lanes, each killed by a meteor or a sky strike.
  const EXTRA = [];
  for (let i = 0; i < 12; i++) {
    const lane = i % 3, q = rand(i, 61), kill = 0.6 + rand(i, 63) * 10.8;
    let pos, sp, via;
    if (lane === 0) { pos = [150 + q * 250, 420 + rand(i, 62) * 60]; sp = W_SP; via = [pos[0] - 60, 448]; }
    else if (lane === 1) { const yy = 150 + q * 140; pos = [Cx(yy) + (rand(i, 62) - 0.5) * 70, yy]; sp = N_SP; via = [Cx(yy - 40), yy - 40]; }
    else { pos = [840 + q * 260, 420 + rand(i, 62) * 60]; sp = E_SP; via = [pos[0] + 60, 450]; }
    const t0 = kill - 7.2;
    const a = actor({ id: 'x' + i, kind: i % 4 === 3 ? 'brute' : 'goblin', team: 'enemy', fog: true, t0, chaosRank: rand(i, 64),
      keys: route(0, 80, [sp, P(via[0], via[1]), P(pos[0], pos[1])]),
      look: () => [620, 450], death: { t: kill, kind: i % 2 ? 'fly' : 'fall' }, life: mod(kill + 1.4 - t0, LOOP),
      burn: i % 2 ? null : (t) => (since(t, kill, 2) >= 0 ? 1 : 0),
      hits: [{ t: kill, dir: [lane === 0 ? -0.8 : lane === 2 ? 0.8 : 0.2, -0.6], push: i % 2 ? 22 : 8, keep: true, hop: i % 2 ? 9 : 0, flash: 1 }], squash: [[kill, 1]] });
    EXTRA.push({ a, kill, pos, kind: i % 2 ? 'strike' : 'meteor' });
  }

  // Turret shots (from TSHOTS above). Impact time follows from flight.
  const SHOTS = TSHOTS.map((s) => [s.fire, s.id, s.steam]);
  const BOLTS = SHOTS.map(([fire, id, steam]) => {
    const a = byId(id);
    let te = fire + 0.5, p;
    for (let k = 0; k < 3; k++) { p = basePos(a, te); te = fire + Math.hypot(p.x - TURRET_TOP[0], p.y - a.z - 10 - TURRET_TOP[1]) / BOLT_SPEED; }
    // the steam shot is timed so its impact is what shatters the frozen group
    if (steam) { fire += (W_SHATTER - 0.06) - te; te = W_SHATTER - 0.06; }
    p = basePos(a, te);
    const hasFatal = a.hits.some((h) => Math.abs(h.t - te) < 0.08);
    if (!hasFatal && !steam) { const dx = p.x - TURRET.x, dy = (p.y - TURRET.y) / FY, L = Math.hypot(dx, dy) || 1; a.hits.push({ t: te, dir: [dx / L, dy / L], push: 6, flash: 1 }); a.squash.push([te, 0.8]); }
    return { fire, te, target: id, steam: !!steam, x: p.x, y: p.y, z: a.kind === 'brute' ? 11 : 7 };
  });
  PB.SHOTS = BOLTS;

  // Chaos: burning grass patches, far up the lanes and away from brute A.
  const FIRES = [];
  for (let i = 0; i < 6; i++) {
    const r = rand(i, 81);
    const p = i % 2 ? [Cx(120 + r * 120) + (rand(i, 82) - 0.5) * 60, 120 + r * 120] : [900 + r * 220, 425 + rand(i, 82) * 55];
    FIRES.push({ x: p[0], y: p[1], rank: rand(i, 83), r: 8 + rand(i, 84) * 8 });
  }

  // ---- walls: health as a function of time ----
  // Each wall is raised at W.raise (its caster's cast, plus the runes' flight to it) and
  // takes the hits in W.events until it is raised again. A hit of power p at position f
  // (0..1 along the wall) takes p off the segment it lands on, about half off each
  // neighbour and a little off the next. Health maps to five damage states:
  // 0 whole, 1 cracked, 2 chipped (a chunk out of the top), 3 broken (half height), 4 rubble.
  const LINK_T = 0.12;
  const WALLS = [
    Object.assign({}, ROCK, { raise: 11.5 + LINK_T, events: ROCK_PUNCH.map((t, k) => ({ t, f: 0.5, p: [0.18, 0.2, 0.22, 0.24][k], z: 13 })) }),
    Object.assign({}, FROST, { raise: 10.3 + LINK_T, events: [{ t: W_SHATTER - 0.06, f: 0.34, p: 0.2, z: 7 }, { t: FROST_SMASH[0], f: 0.5, p: 0.42, z: 6 }, { t: FROST_SMASH[1], f: 0.5, p: 0.8, z: 6 }] }),
  ];
  const wallPoint = (W, f) => [lerp(W.a[0], W.b[0], f), lerp(W.a[1], W.b[1], f)];
  function wallHp(W, i, t) {
    const age = mod(t - W.raise, LOOP), fi = (i + 0.5) / W.n;
    let hp = 1;
    for (const ev of W.events) if (mod(ev.t - W.raise, LOOP) <= age) { const d = Math.abs(fi - ev.f) * W.n; hp -= ev.p * (d < 0.6 ? 1 : d < 1.6 ? 0.55 : d < 2.6 ? 0.2 : 0); }
    return clamp(hp, 0, 1);
  }
  const dmgState = (hp) => (hp > 0.82 ? 0 : hp > 0.6 ? 1 : hp > 0.38 ? 2 : hp > 0.12 ? 3 : 4);
  function wallState(W, t) {
    const age = mod(t - W.raise, LOOP), c = (W.n - 1) / 2, segs = [];
    for (let i = 0; i < W.n; i++) {
      const dl = Math.abs(i - c) * 0.06, hp = wallHp(W, i, t);
      // a hit jolts the segments near it for a moment
      let jolt = 0;
      for (const ev of W.events) { const e = since(t, ev.t, 0.25), d = Math.abs((i + 0.5) / W.n - ev.f) * W.n; if (e >= 0 && d < 1.6) jolt = Math.round(Math.sin(e * 90 + i) * (1 - e / 0.25) * (ev.p > 0.3 ? 2 : 1.2)); }
      segs.push({ i, hp, st: dmgState(hp), rise: easeOut(seg(age, dl, dl + 0.3)), frost: W.mat === 'frost' ? seg(age, 0.4 + dl * 1.5, 0.9 + dl * 1.5) : 0, jolt });
    }
    // the old wall crumbles into the ground while the new one rises through it
    const old = age < 0.4 ? segs.map((s, i) => { const hp = wallHp(W, i, W.raise - 0.001); return { i, hp, st: dmgState(hp), sink: seg(age, 0, 0.3), frost: W.mat === 'frost' ? 1 : 0, jolt: 0 }; }) : null;
    return { spec: W, segs, old, age };
  }
  // wall and device casts send their runes from the staff to where the spell manifests
  const LINKS = [];
  for (const a of ACTORS) if (a.casts) for (const [, c0, , kind, els] of a.casts) if (kind === 'wall' || kind === 'device') LINKS.push([a.id, c0, kind === 'device' ? [TURRET.x, TURRET.y - 8] : a.id === 'p2' ? FROST_MID : ROCK_MID, els]);
  PB.MAP.WALLS = WALLS; PB.MAP.wallPoint = wallPoint; PB.MAP.wallState = wallState; PB.MAP.LINK_T = LINK_T;

  // ---- runes: P1's pools (pips in the HUD, a faint swirl in the world) ----
  // Key order follows the rules of 2026-11-03: opposites stack, QWER over ASDF, and Earth
  // moved to G when Sigil took D (under Shield). There is no Ice or Steam element.
  const ELEMENTS = ['water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth'];
  const KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'G'];
  const START = { water: 3.6, life: 2.3, shield: 4, cold: 1.45, lightning: 2.75, arcane: 3.7, sigil: 3, fire: 3.3, earth: 4 };
  const MAX = { water: 4, life: 4, shield: 4, cold: 4, lightning: 4, arcane: 4, sigil: 3, fire: 5, earth: 4 };
  const BEAM_ON = 1.2, BEAM_OFF = 5.05;
  // Arcane: regen, a whole rune paid when queued, then the sustained beam runs regen debt.
  const ARC_PRE = 0.22, ARC_DRAIN = -0.17;
  const ARC_POST = -(ARC_PRE * BEAM_ON - 1 + ARC_DRAIN * (BEAM_OFF - BEAM_ON)) / (LOOP - BEAM_OFF);
  // P1's queue times come from the casts (filled in below, once QUEUE exists).
  let Q1 = null;
  const q1 = () => Q1 || (Q1 = QUEUE.filter((q) => q[0] === 'p1'));
  // The turret is a Sigil device: it binds one Sigil rune for as long as it stands (all
  // loop), and every shot draws a Fire rune from Red's pool (firePool, above).
  function runes(t) {
    const v = {}, Q = q1();
    for (const e of ELEMENTS) v[e] = START[e];
    const qd = (el) => Q.filter((q) => q[1] === el && q[2] <= t).length;
    const qAt = (el) => (el === 'fire' ? FIRE_COSTS : Q.filter((q) => q[1] === el).map((q) => q[2]));
    v.arcane = START.arcane + (t < BEAM_ON ? ARC_PRE * t : ARC_PRE * BEAM_ON + (t < BEAM_OFF ? ARC_DRAIN * (t - BEAM_ON) : ARC_DRAIN * (BEAM_OFF - BEAM_ON) + ARC_POST * (t - BEAM_OFF))) - qd('arcane');
    // Fire: the beam's payload and one rune per turret shot; regen pays the loop back.
    v.fire = firePool(t);
    const bound = 1;
    v.sigil = START.sigil - bound;
    // Others drift gently and loop (refilled, nothing spent): a visible regen tick.
    v.cold = START.cold + 0.35 * Math.sin((t / LOOP) * TAU) * 0.5 + 0.18;
    v.lightning = START.lightning + 0.2 * Math.sin((t / LOOP) * TAU + 1);
    const spent = (el) => qAt(el).reduce((m, tq) => Math.max(m, clamp(1 - Math.abs(t - tq) / 0.4, 0, 1)), 0);
    return ELEMENTS.map((e, i) => ({
      el: e, key: KEYS[i], v: clamp(v[e], 0, MAX[e]), max: MAX[e], bound: e === 'sigil' ? bound : 0,
      drain: e === 'arcane' ? (t >= BEAM_ON && t < BEAM_OFF ? 1 : 0) : 0,
      spent: spent(e), dry: 0,   // set in scene(): Fire flashes while the turret waits on it
    }));
  }

  // ---- allies' pools: what each has READY, shown as a swirl of motes ----
  // Each queued element costs one rune at its queue time; regen is linear and pays the
  // loop's spending back exactly, so the loop is seamless. Blue is a cold specialist
  // with deep pools; Gold has spent nearly everything (depleted); Violet is middling.
  const POOLS = {
    p2: { cold: 6.2, water: 4.3, earth: 1.5, shield: 1.4, life: 1.2 },
    p3: { lightning: 2.25, shield: 1, earth: 1.05, sigil: 1 },
    p4: { earth: 4.4, arcane: 2.2, fire: 1.3, shield: 1.1 },
  };
  // queue times for every prepped element: [team, element, time]
  const QUEUE = [];
  for (const a of ACTORS) if (a.casts) for (const [p0, c0, , , els] of a.casts) els.forEach((el, i) => QUEUE.push([a.team, el, p0 + (c0 - p0) * (i + 0.6) / (els.length + 0.4), i, c0]));
  // Gold's shield runes pay the arc's upkeep: each arrow it absorbs costs SH_COST, and
  // regen pays exactly that back over the loop. It starts full at the loop seam, is
  // nearly empty at the end of the archers' volley, and refills in the lull.
  const SH_POOL0 = 1, SH_COST = 0.25, SH_REGEN = (SHIELD_HITS.length * SH_COST) / LOOP;
  const shieldPool = (t) => SH_POOL0 + SH_REGEN * t - SH_COST * SHIELD_HITS.filter((h) => h <= t).length;
  // a Sigil device binds one rune from queue time until it goes off (Gold's glyph)
  const glyphBound = (t) => t < ERUPT || t >= QUEUE.find((q) => q[0] === 'p3' && q[1] === 'sigil')[2];
  function pool(team, t) {
    if (team === 'p1') { const r = runes(t); const o = {}; for (const x of r) o[x.el] = x.v; return o; }
    const P0 = POOLS[team], o = {};
    for (const el of Object.keys(P0)) {
      let spent = 0, total = 0;
      for (const q of QUEUE) if (q[0] === team && q[1] === el) { total++; if (q[2] <= t) spent++; }
      o[el] = Math.max(0, P0[el] + (total / LOOP) * t - spent);
    }
    if (team === 'p3') { o.shield = shieldPool(t); o.sigil = P0.sigil - (glyphBound(t) ? 1 : 0); }
    return o;
  }

  // =====================================================================
  // State of one actor at time t.
  // =====================================================================
  const STRIDE = { wizard: 10, goblin: 7, archer: 7, brute: 13 };
  function state(a, t, c) {
    if (a.chaosRank != null && a.chaosRank >= c) return null;
    const u = mod(t - a.t0, LOOP);
    if (u > a.life) return null;
    const p = pathAt(a.pp, u), pa = pathAt(a.pp, Math.max(0, u - 0.04)), pb = pathAt(a.pp, u + 0.04);
    const dtp = (u + 0.04) - Math.max(0, u - 0.04);
    const vx = (pb.x - pa.x) / dtp, vy = (pb.y - pa.y) / dtp;
    const speed = Math.hypot(vx, vy / LFY);
    const s = { id: a.id, kind: a.kind, team: a.team, el: a.el, seed: a.seed, variant: a.variant || 0,
      x: p.x, y: p.y, z: a.z, z0: a.z, vx, vy, spd: clamp(speed / 70, 0, 1.2), ph: (p.d / STRIDE[a.kind]) * Math.PI,
      alpha: 1, dead: 0, flash: 0, sq: 0, wet: 0, burn: 0, frozen: 0, shock: 0, cast: 0, castKind: null, prep: 0,
      swing: -1, weapon: 0, aim: 0, face: 0, draw: 0, smash: -1, punch: -1, deathKind: null, flyT: 0 };
    // facing: where it moves, else where it looks
    const lk = a.look ? a.look(t) : [p.x, p.y + 10];
    s.aim = Math.atan2((lk[1] - p.y) / FY, lk[0] - p.x);
    s.face = speed > 9 ? Math.atan2(vy / FY, vx) : s.aim;
    if (a.fog) s.alpha = seg(u, 0, 0.6);
    // hits: flash, knockback, hop
    for (const h of a.hits) {
      const e = since(t, h.t, u); if (e < 0) continue;
      if (h.flash && e < 0.16) s.flash = Math.max(s.flash, 1 - e / 0.16);
      const k = h.keep ? easeOut(seg(e, 0, 0.32)) : (e < 0.08 ? e / 0.08 : Math.max(0, 1 - (e - 0.08) / 0.45));
      s.x += h.dir[0] * h.push * k; s.y += h.dir[1] * h.push * k * FY;
      if (h.hop) { const q = seg(e, 0, 0.42); s.z += h.hop * 4 * q * (1 - q); }
      if (h.burn && e < 1.2) s.burn = Math.max(s.burn, 1 - e / 1.2);
    }
    for (const [te, amt] of a.squash) { const e = since(t, te, u); if (e >= 0 && e < 0.6) s.sq += amt * Math.exp(-e * 7) * Math.cos(e * 24); }
    if (a.wet) s.wet = a.wet(t);
    if (a.burn) s.burn = Math.max(s.burn, a.burn(t));
    if (a.frozen) { s.frozen = a.frozen(t); s.wet *= 1 - s.frozen; }
    if (a.shock) s.shock = a.shock(t);
    if (a.shatter != null) s.shatterIn = a.shatter - t;
    if (a.casts) for (const [p0, c0, c1, kind, els] of a.casts) {
      if (t >= c0 && t < c1) { s.cast = Math.min(seg(t, c0, c0 + 0.18), 1 - seg(t, c1 - 0.15, c1)); s.castKind = kind; s.castT = t - c0; }
      // prep: gathering pose, and which queued elements have reached the charge
      if (t >= p0 && t < c0 + 0.2) {
        const qs = els.map((el, i) => ({ el, tq: p0 + (c0 - p0) * (i + 0.6) / (els.length + 0.4) }));
        s.prep = Math.min(seg(t, p0, p0 + 0.2), 1 - seg(t, c0, c0 + 0.12));
        s.prepInfo = { p0, c0, kind, qs, release: t >= c0 ? t - c0 : -1 };
        s.prepKind = kind;
      }
    }
    if (a.weapon) s.weapon = Math.min(seg(t, a.weapon[0], a.weapon[0] + 0.3), 1 - seg(t, a.weapon[1] - 0.3, a.weapon[1]));
    if (a.swings) for (const sw of a.swings) { const e = t - (sw - 0.28); if (e >= 0 && e < 0.55) s.swing = e / 0.55; }
    if (a.smashes) for (const sm of a.smashes) { const e = t - (sm - 0.45); if (e >= 0 && e < 0.8) s.smash = e / 0.8; }
    if (a.punches) for (const pt of a.punches) { const e = t - (pt - 0.25); if (e >= 0 && e < 0.55) s.punch = e / 0.55; }
    if (a.shots) for (const r of a.shots) { const q = mod(t - (r - DRAW), LOOP); if (q < DRAW) s.draw = smooth(q / DRAW); else if (q < DRAW + 0.15) s.draw = -1; }
    if (a.death) {
      const e = since(t, a.death.t, u);
      if (e >= 0) { s.dead = seg(e, 0, a.death.kind === 'fly' ? 0.5 : 0.45); s.deathKind = a.death.kind; s.deadFor = e; s.alpha = Math.min(s.alpha, 1 - seg(e, 0.95, 1.4)); }
    }
    if (a.kind === 'wizard') s.pool = pool(a.team, t);
    // idle life for those waiting: weight shifts and glances
    if (a.wait && speed < 5 && !s.dead) { s.face = s.aim + Math.sin(t * 1.3 + a.seed) * 0.5; s.ph = t * 2 + a.seed; s.spd = 0.12; }
    return s;
  }

  // =====================================================================
  // The scene
  // =====================================================================
  PB.scene = function scene(t, c) {
    t = mod(t, LOOP);
    const S = { t, c, actors: [], byId: {}, runes: runes(t) };
    for (const a of ACTORS) { const s = state(a, t, c); if (s && s.alpha > 0.01) { S.actors.push(s); S.byId[s.id] = s; } }
    // ---- structures ----
    S.walls = WALLS.map((W) => wallState(W, t));
    S.frost = S.walls[1]; S.rock = S.walls[0];
    S.shield = Object.assign({}, SHIELD, { ripples: [], pool: shieldPool(t), strength: 0.3 + 0.7 * clamp(shieldPool(t) / 0.9, 0, 1), drains: [] });
    // each absorbed arrow draws a shield rune out of Gold toward the impact
    for (const h of SHIELD_HITS) { const e = since(t, h, 0.45); if (e >= 0) S.shield.drains.push({ e, cyc: SHIELD_HITS.indexOf(h) }); }
    // the turret: a Sigil device fed from Red's Fire pool. It waits (dry) while it has a
    // target but Red has no whole rune; each shot's rune flies from Red as a mote.
    S.turret = Object.assign({}, TURRET, { recoil: 0, charge: 0, dry: 0, orb: 1, sigil: 1, gutter: 0, motes: [], pool: firePool(t) });
    for (const [k, s] of TSHOTS.entries()) {
      const c = s.fire - MOTE, wantC = Math.max(s.want - MOTE, k ? TSHOTS[k - 1].fire : 0);
      if (c - wantC > 0.1 && t >= wantC && t < c) S.turret.dry = Math.max(S.turret.dry, Math.min(1, (t - wantC) / 0.25));
      const e = t - c; if (e >= 0 && e < MOTE) S.turret.motes.push({ k: e / MOTE, seed: Math.round(s.fire * 10) });
    }
    // the orb sinks to an ember while the turret waits on Red, and flares as a rune lands
    S.turret.orb = 1 - 0.6 * S.turret.dry;
    if (S.turret.dry > 0) S.runes.find((r) => r.el === 'fire').dry = 1;
    for (const b of BOLTS) {
      const e = since(t, b.fire, 0.5); if (e >= 0) S.turret.recoil = Math.max(S.turret.recoil, Math.exp(-e * 9));
      const w = mod(b.fire - t, LOOP); if (w < 0.35) S.turret.charge = Math.max(S.turret.charge, 1 - w / 0.35);
    }
    // a wall or device cast sends its runes from the staff to where it manifests
    S.links = [];
    for (const [id, c0, to, els] of LINKS) { const e = since(t, c0, 0.4); if (e >= 0) S.links.push({ from: id, e, to, els }); }
    // glyph: armed, triggered by brute B, redrawn by P3
    const gTrig = since(t, ERUPT, 3.0);
    S.glyph = Object.assign({}, GLYPH, { armed: t < ERUPT || t > 11.25 ? 1 : 0, draw: t < ERUPT ? 1 : seg(t, 9.95, 11.2), erupt: gTrig >= 0 ? gTrig : -1, step: seg(t, 8.35, 8.6) * (t < ERUPT ? 1 : 0) });
    // ---- spells ----
    if (t >= BEAM_ON && t < BEAM_OFF) S.beam = { from: 'p1', to: 'bruteA', on: Math.min(seg(t, BEAM_ON, BEAM_ON + 0.12), 1 - seg(t, BEAM_OFF - 0.12, BEAM_OFF)), age: t - BEAM_ON };
    S.sprays = [];
    if (t >= 0.8 && t < 2.45) S.sprays.push({ from: 'p2', kind: 'water', to: [PUD.x, PUD.y + 2], from0: 0.8, to0: 2.45 });
    if (t >= 4.0 && t < 5.25) S.sprays.push({ from: 'p2', kind: 'cold', to: [PUD.x, PUD.y + 2], from0: 4.0, to0: 5.25 });
    if (t >= 2.85 && t < 3.55) S.chain = { from: 'p3', through: ['w2', 'w1', 'w3', 'w0'], age: t - 2.85, seed: Math.floor(t * 18) };
    S.bolts = []; S.impacts = [];
    for (const b of BOLTS) {
      if (t >= b.fire && t < b.te) S.bolts.push({ k: (t - b.fire) / (b.te - b.fire), x0: TURRET_TOP[0], y0: TURRET_TOP[1], x1: b.x, y1: b.y - b.z, gy: b.y, fire: b.fire });
      const e = since(t, b.te, 2.5); if (e >= 0) S.impacts.push({ e, x: b.x, y: b.y, z: b.z, steam: b.steam, seed: Math.round(b.fire * 10) });
    }
    S.shatters = [];
    W_POS.forEach((p, i) => { const e = since(t, W_SHATTER + i * 0.07, 2.2); if (e >= 0) { const bs = state(byId('w' + i), W_SHATTER + i * 0.07 - 0.01, 1); if (bs) S.shatters.push({ e, x: bs.x, y: bs.y, seed: i }); } });
    // Arrows from the archers to the north half of the shield, and shield ripples
    S.arrows = [];
    ARCHERS.forEach((p, i) => ARCHER_SHOTS[i].forEach((r, k) => {
      const rel = mod(t - r, LOOP);   // seconds since release
      if (rel > ARROW_FLIGHT + 0.9) return;
      const cyc = i * 3 + k, { f, hz } = arrowAim(cyc);
      const [tx, ty] = shAt(f);
      const x0 = p[0] - 4, y0 = p[1] - CH - 8;
      const at = (q) => [lerp(x0, tx, q), lerp(y0, ty - hz, q) - Math.sin(q * Math.PI) * 8];
      if (rel < ARROW_FLIGHT) { const q = rel / ARROW_FLIGHT, A = at(q), B = at(q + 0.03); S.arrows.push({ x: A[0], y: A[1], ang: Math.atan2(B[1] - A[1], B[0] - A[0]), q, gy: lerp(p[1], ty, q) }); }
      else S.shield.ripples.push({ f, hz, e: rel - ARROW_FLIGHT, cyc });
    }));
    for (const d of S.shield.drains) Object.assign(d, arrowAim(ARROW_ORDER[d.cyc]));
    // hits on the walls (dust, chips, shake)
    S.wallHits = [];
    for (const W of WALLS) for (const ev of W.events) { const e = since(t, ev.t, 1.4); if (e >= 0) { const [x, y] = wallPoint(W, ev.f); S.wallHits.push({ e, x, y, big: ev.p > 0.3, mat: W.mat, p: ev.p, z: ev.z || 10 }); } }
    S.hammerHits = [];
    for (const sw of [9.22, 9.82]) { const e = since(t, sw, 1.0); if (e >= 0) { const sl = basePos(byId('slip'), sw); S.hammerHits.push({ e, x: sl.x, y: sl.y, big: sw > 9.5 }); } }
    S.deaths = [];
    for (const a of ACTORS) if (a.death && (a.chaosRank == null || a.chaosRank < c)) { const e = since(t, a.death.t + 0.4, 1.4); if (e >= 0) { const s = state(a, a.death.t + 0.4, 1); if (s) S.deaths.push({ e, x: s.x, y: s.y, seed: a.seed, big: a.kind === 'brute' }); } }
    // ---- chaos ----
    S.meteors = []; S.strikes = []; S.fires = [];
    for (const ex of EXTRA) {
      if (ex.a.chaosRank >= c) continue;
      const bp = basePos(ex.a, ex.kill), e = t - (ex.kill - 0.6);
      const ee = mod(e, LOOP); if (ee > 3) continue;
      (ex.kind === 'meteor' ? S.meteors : S.strikes).push({ e: ee - 0.6, x: bp.x, y: bp.y, seed: ex.a.seed });
    }
    for (const f of FIRES) if (f.rank < c) S.fires.push(f);
    S.glyphEruptAt = ERUPT; S.beamWindow = [BEAM_ON, BEAM_OFF];
    return S;
  };
  PB.ELEMENTS = ELEMENTS; PB._dbg = { ACTORS, pathAt, basePos, QUEUE, pool, TSHOTS, FIRE_COSTS, firePool, FIRE_R, FIRE_V0: () => FIRE_V0 };
})();
