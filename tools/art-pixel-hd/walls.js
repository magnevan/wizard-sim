/* Pixel Battlefield: walls (pass 3). A wall is a row of thick slabs standing on a line on
 * the ground. Each slab is painted once per state into a small cached sprite by a tiny
 * raycaster: for every sprite pixel it walks down the view ray (screen y = ground y - z)
 * and takes the first solid point, so tops, front faces, the visible end face, damage
 * notches and rubble all come out with correct occlusion and stay on the pixel grid.
 *
 * States: damage 0..4 (whole, cracked, chipped, broken, rubble), a rise/sink fraction
 * (quantised to RISE_STEPS) and, for the frost-coated wall, how far the frost has crept
 * (FROST_STEPS). Light is the usual pixel-art cheat: tops brightest, faces turned west
 * (toward the upper-left light) brighter than faces turned east. */
(function () {
  'use strict';
  const PB = window.PB, { FY, rand, clamp } = PB, X = PB.px;
  const SW = 60, SH = 60, OX = 30, OY = 46;          // sprite size; the slab's ground centre sits at (OX, OY)
  const RISE_STEPS = 7, FROST_STEPS = 3, CPU = { willReadFrequently: true };
  const OUTLINE = X.hex('#120e1a');
  const MAT = {
    // raised earth: warm stone with turf torn up on top
    stone: { rock: ['#e4cfac', '#c8ab86', '#a88d6c', '#8a7156', '#6c5744', '#503f33', '#362a23', '#221a16'].map(X.hex),
      turf: ['#7ca85a', '#5e8a48', '#46703a', '#2e4e2a'].map(X.hex) },
    // cold grey-blue stone, coated in rime that creeps up from the ground
    frost: { rock: ['#bcc0c8', '#9da2ae', '#81868f', '#686c76', '#52555f', '#3d3f48', '#2b2c34', '#1c1d23'].map(X.hex),
      rime: ['#ffffff', '#e6f8ff', '#c4ecfa', '#98d8f0', '#68bce2', '#4090c4', '#2a6a9e'].map(X.hex) },
  };

  // ---- geometry ----
  const geoms = new Map();
  function geom(spec) {
    let g = geoms.get(spec.id);
    if (g) return g;
    const A = [spec.a[0], spec.a[1] / FY], B = [spec.b[0], spec.b[1] / FY];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]), du = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
    let nv = [-du[1], du[0]]; if (nv[1] < 0) nv = [-nv[0], -nv[1]];   // the side that faces the camera
    const L = len / spec.n, seed = spec.id.length * 31 + spec.n;
    const slabs = [];
    for (let i = 0; i < spec.n; i++) {
      const cu = (i + 0.5) * L, c = [A[0] + du[0] * cu, A[1] + du[1] * cu];
      slabs.push({ i, cx: c[0], cy: c[1] * FY, U0: i * L,
        H: spec.H + Math.round((rand(i, 1, seed) - 0.5) * 5), tilt: (rand(i, 2, seed) - 0.5) * 5,
        Lh: L / 2 + 1.4, Th: spec.T / 2 + (rand(i, 3, seed) - 0.5) * 1.2, notch: (rand(i, 4, seed) - 0.5) * L * 0.5 });
    }
    g = { du, nv, L, slabs, seed };
    geoms.set(spec.id, g);
    return g;
  }
  // a point on the camera-facing side of slab i, at along-offset u and height z (world-screen coords)
  function facePoint(spec, i, u, z) {
    const g = geom(spec), s = g.slabs[i], v = s.Th;
    return [s.cx + g.du[0] * u + g.nv[0] * v, s.cy + (g.du[1] * u + g.nv[1] * v) * FY - z];
  }
  function footprint(spec, i, grow = 0) {
    const g = geom(spec), s = g.slabs[i], out = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const u = a * (s.Lh + grow), v = b * (s.Th + grow);
      out.push([s.cx + g.du[0] * u + g.nv[0] * v, s.cy + (g.du[1] * u + g.nv[1] * v) * FY]);
    }
    return out;
  }

  // ---- the slab's height field ----
  const jag = (k, i, s) => rand(Math.floor(k), i, s) - 0.5;
  function heightFn(spec, g, s, st, rise) {
    const H = s.H, i = s.i, sd = g.seed;
    // rubble lying around the foot of a damaged slab
    const rub = [];
    if (st >= 2) for (let k = 0; k < st * 3; k++) rub.push([(rand(i, k, sd + 50) - 0.5) * s.Lh * 2.2, s.Th + 0.5 + rand(i, k, sd + 51) * (st >= 4 ? 7 : 4) * (rand(i, k, sd + 54) < 0.25 ? -1.6 : 1), 1.2 + rand(i, k, sd + 52) * 1.6, 1 + rand(i, k, sd + 53) * (st >= 4 ? 3.5 : 2.2)]);
    return (u, v) => {
      let top = -1, cut = 0;
      const ju = Math.sin(v * 1.7 + i * 3) * 0.6, jv = Math.sin(u * 1.3 + i * 5) * 0.5;
      if (Math.abs(u) <= s.Lh + ju && Math.abs(v) <= s.Th + jv) {
        top = H + s.tilt * (u / s.Lh) - (Math.abs(v) > s.Th - 1.1 + jv ? 1 : 0) - (Math.abs(u) > s.Lh - 1.1 + ju ? 1 : 0);
        top -= Math.max(0, jag(u * 0.7 + v * 0.3 + 20, i, sd + 7)) * 1.2;        // a lumpy, hand-cut top
        let lim = top;
        if (st >= 2) {
          // a chunk knocked out of the top, with a jagged fracture
          const w = s.Lh * 0.55, d = Math.abs(u - s.notch) / w;
          if (d < 1) lim = Math.min(lim, top - H * (st >= 3 ? 0.22 : 0.34) * (1 - d * d) - jag(u * 0.9 + v, i, sd + 8) * 2.4);
        }
        if (st === 3) lim = Math.min(lim, H * 0.58 + jag(u * 0.6, i, sd + 9) * 4 + jag(u * 1.7 + v, i, sd + 10) * 1.5);
        if (st >= 4) lim = Math.min(lim, H * 0.24 + jag(u * 0.8, i, sd + 11) * 3.6 + jag(u * 1.9 + v * 1.3, i, sd + 12) * 1.6);
        cut = top - lim; top = lim;
      }
      for (const [ru, rv, rr, rh] of rub) {
        const d = ((u - ru) ** 2 + (v - rv) ** 2) / (rr * rr);
        if (d < 1) { const h = rh * Math.sqrt(1 - d); if (h > top) { top = h; cut = -1; } }
      }
      return [top * rise, cut];
    };
  }

  // Voronoi facets: distance to the nearest site and to the edge, and the cell id
  function facet(x, y, cw, ch, sd) {
    const gx0 = Math.floor(x / cw), gy0 = Math.floor(y / ch);
    let d1 = 1e9, d2 = 1e9, id = 0, ux = 0, uy = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const gx = gx0 + k, gy = gy0 + j, px = (gx + 0.15 + rand(gx, gy, sd) * 0.7) * cw, py = (gy + 0.15 + rand(gx, gy, sd + 1) * 0.7) * ch;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < d1) { d2 = d1; d1 = d; id = gx * 7919 + gy; ux = x - px; uy = y - py; } else if (d < d2) d2 = d;
    }
    return { edge: Math.sqrt(d2) - Math.sqrt(d1), id, ux, uy };
  }
  // cracks: a few zigzag lines running down the face from the top, more with damage
  function crackSet(s, st, sd) {
    const out = [];
    const n = [0, 2, 3, 4, 3][st];
    for (let k = 0; k < n; k++) {
      const u0 = (rand(s.i, k, sd + 60) - 0.5) * s.Lh * 1.6, len = s.H * (0.35 + rand(s.i, k, sd + 61) * 0.45) * (st >= 3 ? 1.2 : 1);
      const path = [];
      let u = u0;
      for (let z = 0; z <= s.H + 2; z++) { if (rand(s.i, k * 97 + z, sd + 62) < 0.42) u += rand(s.i, k * 97 + z, sd + 63) < 0.5 ? -1 : 1; path.push(u); }
      out.push({ path, len });
    }
    return out;
  }

  const cache = new Map();
  function sprite(spec, i, st, rise, frost) {
    const rl = Math.round(clamp(rise, 0, 1) * RISE_STEPS), fl = spec.mat === 'frost' ? Math.round(clamp(frost, 0, 1) * FROST_STEPS) : 0;
    const key = spec.id + '|' + i + '|' + st + '|' + rl + '|' + fl;
    let spr = cache.get(key);
    if (spr !== undefined) return spr;
    spr = rl === 0 ? null : paint(spec, i, st, rl / RISE_STEPS, fl / FROST_STEPS);
    cache.set(key, spr);
    return spr;
  }
  function paint(spec, i, st, rise, fr) {
    const g = geom(spec), s = g.slabs[i], M = MAT[spec.mat], R = M.rock, sd = g.seed + (spec.mat === 'frost' ? 300 : 0);
    const hf = heightFn(spec, g, s, st, rise), cracks = crackSet(s, st, sd);
    const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    const cx = cv.getContext('2d', CPU), img = cx.createImageData(SW, SH), d = img.data;
    const filled = new Uint8Array(SW * SH);
    const zMax = s.H * rise + 3;
    const toUV = (gx, gy) => { const wx = gx, wy = gy / FY; return [wx * g.du[0] + wy * g.du[1], wx * g.nv[0] + wy * g.nv[1]]; };
    const set = (x, y, c) => { const o = (y * SW + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; filled[y * SW + x] = 1; };
    const isFrost = spec.mat === 'frost';
    // only scan the slab's own screen box (its footprint, height and a margin for rubble)
    const ex = Math.ceil(s.Lh * Math.abs(g.du[0]) + (s.Th + 8) * Math.abs(g.nv[0]) + 4), ey = (s.Lh * Math.abs(g.du[1]) + (s.Th + 8) * Math.abs(g.nv[1])) * FY;
    const bx0 = Math.max(0, OX - ex), bx1 = Math.min(SW - 1, OX + ex), by0 = Math.max(0, Math.floor(OY - ey - zMax - 2)), by1 = Math.min(SH - 1, Math.ceil(OY + ey + 2));
    for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
      const sx = px - OX, sy = py - OY;
      let hit = null;
      for (let z = Math.ceil(zMax); z >= 0; z--) {
        const [u, v] = toUV(sx, sy + z);
        const [h, cut] = hf(u, v);
        if (h < 0 || z > h) continue;
        // which surface: the top if the column ends here, otherwise a side face
        let face = cut < 0 ? 'rubble' : 'top';
        if (cut >= 0 && z < h - 1.0) {
          // the ray came in from the south: through the end of the slab, or its front
          const [u2, v2] = toUV(sx, sy + z + 1.2);
          face = Math.abs(u2) > s.Lh + 0.3 && Math.abs(v2) <= s.Th + 0.6 ? 'end' : 'front';
        }
        hit = { z, u, v, h, cut, face };
        break;
      }
      if (!hit) continue;
      const { z, u, v, h, cut, face } = hit, U = s.U0 + u, Hs = Math.max(1, s.H * rise);
      let k, frosted = false, col = null;
      if (face === 'top' || face === 'rubble') {
        const f = facet(U * 1.1, v * 1.3, 6, 5, sd + 20);
        k = face === 'rubble' ? 2.6 + rand(f.id, 3, sd) * 1.6 - (u < 0 ? 0.4 : 0) : (isFrost ? 1.25 : 1.7) + (rand(f.id, 4, sd) - 0.5) * 1.0 + (f.ux + f.uy) * 0.1;
        if (face === 'top' && v > s.Th - 1.6) k = 0.45;                 // lit lip along the front edge
        if (f.edge < 0.9) k += 1.6;
        if (cut > 0.6 && face === 'top') k = f.edge < 0.9 ? 2.2 : 0.9 + rand(f.id, 6, sd) * 0.6;   // fresh fracture: raw, pale stone
        // turf on the raised earth; rime on the frost wall
        if (!isFrost && face === 'top' && cut <= 0.6 && PB.world.vnoise(U * 0.32, v * 0.45 + i * 3, 77) > 0.6) col = M.turf[v > s.Th - 1.6 ? 0 : clamp(Math.round(1 + rand(Math.round(U), Math.round(v), 78) * 1.4), 0, 3)];
        if (isFrost && cut <= 0.6 && face === 'top' && PB.world.vnoise(U * 0.2, v * 0.3, 79) + (v > s.Th - 2 ? -0.3 : 0) < fr * 0.6) frosted = true;
        if (isFrost && face === 'rubble' && rand(Math.round(U), Math.round(v), 80) < fr * 0.5) frosted = true;
      } else {
        const nx = face === 'front' ? g.nv[0] : (u > 0 ? g.du[0] : -g.du[0]);
        const f = facet(U * 1.0, z * 1.25 + i * 3, isFrost ? 7 : 9, isFrost ? 6 : 7, sd + 30);
        k = 2.9 + nx * 1.3 + (1 - z / Hs) * 0.9 + (rand(f.id, 5, sd) - 0.5) * (isFrost ? 0.7 : 1.1) + (f.ux * 0.5 + f.uy) * (isFrost ? 0.05 : 0.1);
        if (face === 'end') k += 0.5;
        if (f.edge < 0.85) k = 5.6;                                       // facet crack
        else if (f.edge < 1.7 && f.uy < 0) k -= 0.7;                       // lit lip above a crack
        if (!isFrost && Math.floor(z / 4 + Math.sin(U * 0.21) * 0.6) % 3 === 0) k += 0.4;   // strata in the raised earth
        if (Math.abs(u) > s.Lh - 0.8) k += 1.4;                            // seam between slabs
        if (z < 1) k += 1.2;                                               // contact with the ground
        // grass hanging over the lip of the raised earth
        if (!isFrost && face === 'front' && h - z < 2.6 && cut <= 0.6 && PB.world.vnoise(U * 0.32, s.Th * 0.45 + i * 3, 77) > 0.5 && rand(Math.round(U), 5, 81) < 0.8) col = M.turf[h - z < 1.3 ? 1 : 3];
        // cracks from the damage
        for (const c of cracks) { const zz = Math.round(s.H - z); if (zz >= 0 && zz < c.path.length && zz < c.len && Math.abs(u - c.path[zz]) < 0.55) { k = 7; col = null; } }
        if (isFrost) {
          // rime creeps up from the foot and down from the lip; fresh breaks stay bare
          const fm = PB.world.vnoise(U * 0.17, z * 0.22 + i * 0.7, 83) * 0.85 + (z / Hs) * 0.4 - (h - z < 1.6 ? 0.6 : 0);
          if (fm < fr * 0.52 && k < 6.5) frosted = true;
          // icicles hanging off the front lip once the coat is thick
          if (face === 'front' && fr > 0.6 && cut <= 0.6 && h - z < 1 + rand(Math.round(U), 7, 84) * 4.5 && rand(Math.round(U), 6, 84) < 0.4) { frosted = true; k = h - z > 2.5 ? 2.2 : 0.8; }
        }
      }
      // rime in few tones, so the coat reads as patches rather than noise
      if (frosted) col = M.rime[face === 'top' || face === 'rubble' ? (k < 0.8 ? 0 : k < 2.4 ? 1 : 2) : (k < 1.6 ? 1 : k < 3.6 ? 2 : k < 5 ? 3 : 4)];
      set(px, py, col || R[clamp(Math.round(k), 0, 7)]);
    }
    // one-pixel outline round the slab, as everything that stands up has. Inner slabs get
    // no side outline, so neighbours read as one wall rather than a row of boxes.
    const lo = (i === 0) === (g.du[0] > 0), endSlab = i === 0 || i === spec.n - 1;
    const sideL = st >= 3 || (endSlab && lo), sideR = st >= 3 || (endSlab && !lo);   // outline only the wall's two ends
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (filled[y * SW + x]) continue;
      if ((sideR && x > 0 && filled[y * SW + x - 1]) || (sideL && x < SW - 1 && filled[y * SW + x + 1]) || (y > 0 && filled[(y - 1) * SW + x]) || (y < SH - 1 && filled[(y + 1) * SW + x])) {
        const o = (y * SW + x) * 4; d[o] = OUTLINE[0]; d[o + 1] = OUTLINE[1]; d[o + 2] = OUTLINE[2]; d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    return { c: cv };
  }
  // Pre-paint every state the loop actually shows (sampled from the scene's wall states),
  // so the first pass through the loop doesn't stutter.
  let warmed = false;
  function warm() {
    if (warmed) return 0;
    warmed = true;
    const t0 = performance.now(), M = PB.MAP;
    for (const spec of M.WALLS) for (let k = 0; k < 1200; k++) {
      const ws = M.wallState(spec, k / 100);
      for (const sg of ws.segs) sprite(spec, sg.i, sg.st, sg.rise, sg.frost);
      if (ws.old) for (const sg of ws.old) sprite(spec, sg.i, sg.st, 1 - sg.sink, sg.frost);
    }
    return performance.now() - t0;
  }
  PB.walls = { geom, sprite, facePoint, footprint, warm, OX, OY, count: () => cache.size };
})();
