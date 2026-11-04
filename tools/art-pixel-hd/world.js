/* Pixel Battlefield: the static world, generated once, procedurally.
 *  - ground: grass, a dirt path, the rocky pass floor, flowers, stones, ambient occlusion
 *  - cliffs: footprint polygons extruded to a height; each one is cut into 4px-wide
 *    column strips so actors can be depth-sorted against it (an actor behind a cliff
 *    column draws first and is hidden by its top face, as in a real 3/4 view)
 *  - props: trees, boulders, ruined pillars (drawn each frame so trees can sway) */
(function () {
  'use strict';
  const PB = window.PB, { rand, clamp, lerp, FY, TAU, MAP } = PB, X = PB.px;
  const CPU = { willReadFrequently: true };   // keep every canvas on the CPU: no GPU readbacks when compositing
  const WX0 = -70, WY0 = -90, WW = 1330, WH = 870;

  // Value noise
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = rand(xi, yi, s), b = rand(xi + 1, yi, s), c = rand(xi, yi + 1, s), d = rand(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15;

  // Footprint masks (one byte per world pixel per cliff)
  function footprint(cl) {
    const c = document.createElement('canvas'); c.width = WW; c.height = WH;
    const x = c.getContext('2d', CPU);
    x.beginPath(); cl.poly.forEach(([px, py], i) => (i ? x.lineTo(px - WX0, py - WY0) : x.moveTo(px - WX0, py - WY0))); x.closePath();
    x.fillStyle = '#fff'; x.fill();
    const d = x.getImageData(0, 0, WW, WH).data, m = new Uint8Array(WW * WH);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }

  // Path that the enemies wear into the ground: down the pass, through the mouth, into the clearing.
  // Lanes the enemies wear into the ground: west road, north gully, east road.
  const SEGS = [];
  for (const L of MAP.LANES) for (let i = 1; i < L.length; i++) SEGS.push([L[i - 1], L[i]]);
  function pathDist(x, y) {
    let best = 1e9;
    for (const [[ax, ay], [bx, by]] of SEGS) {
      const dx = bx - ax, dy = (by - ay) / FY, px = x - ax, py = (y - ay) / FY;
      const k = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
      const d = Math.hypot(px - dx * k, py - dy * k);
      if (d < best) best = d;
    }
    return best;
  }

  let built = null;
  function build() {
    if (built) return built;
    const masks = MAP.CLIFFS.map(footprint);
    const solid = new Uint8Array(WW * WH);
    for (const m of masks) for (let i = 0; i < m.length; i++) solid[i] |= m[i];
    const isSolid = (x, y) => { const i = (y | 0) - WY0, j = (x | 0) - WX0; return i >= 0 && j >= 0 && i < WH && j < WW ? solid[i * WW + j] : 0; };

    // ---------- ground ----------
    const g = document.createElement('canvas'); g.width = WW; g.height = WH;
    const gx = g.getContext('2d', CPU);
    const img = gx.createImageData(WW, WH), d = img.data;
    const G = ['#24402f', '#2c4b36', '#35573c', '#3f6443', '#4b724a', '#5a8352'].map(X.hex);
    const D = ['#463628', '#554232', '#66503c', '#7a6248', '#8e7656'].map(X.hex);
    const C = ['#3c3634', '#4a433e', '#59514a', '#6a6157', '#7c7264'].map(X.hex);
    const F = ['#353e34', '#3e483c', '#4a5446', '#58614f', '#67705c'].map(X.hex);   // old flagstones, mossy (top faces)
    const FE = ['#1e231f', '#2a302a'].map(X.hex);                                   // their front edges
    const PZ = MAP.PLAZA;
    // Flagstones: 2 x 2 blocks of 14 x 8 px cells (a ground square under FY = 0.6), each
    // block split one of five ways; alternate block rows are shifted half a block.
    const CW = 14, CHT = 8;
    const flagstone = (wx, wy) => {
      const by = Math.floor(wy / (CHT * 2)), sx = wx + (by & 1) * CW, bx = Math.floor(sx / (CW * 2));
      const cx = Math.floor(sx / CW) - bx * 2, cy = Math.floor(wy / CHT) - by * 2;
      const p = Math.floor(rand(bx, by, 25) * 5), X0 = bx * CW * 2 - (by & 1) * CW, Y0 = by * CHT * 2;
      // cells covered: [x0, y0, w, h] in cells
      const R = p === 0 ? [0, 0, 2, 2] : p === 1 ? [0, cy, 2, 1] : p === 2 ? [cx, 0, 1, 2] : p === 3 ? (cy === 0 ? [0, 0, 2, 1] : [cx, 1, 1, 1]) : [cx, cy, 1, 1];
      const x0 = Math.round(X0 + R[0] * CW), y0 = Math.round(Y0 + R[1] * CHT), x1 = Math.round(X0 + (R[0] + R[2]) * CW), y1 = Math.round(Y0 + (R[1] + R[3]) * CHT);
      const id = bx * 131 + by * 977 + R[0] * 7 + R[1] * 3 + p;
      return { id, x0, y0, w: x1 - x0, h: y1 - y0, crack: rand(id, 8) < 0.22 ? (rand(id, 10) - 0.5) * 1.6 : 0 };
    };
    const plaza = (x, y) => { const dx = (x - PZ.x) / PZ.r, dy = (y - PZ.y) / (PZ.r * PB.LFY * 0.8); return dx * dx + dy * dy; };
    for (let y = 0; y < WH; y++) {
      const wy = y + WY0;
      for (let x = 0; x < WW; x++) {
        const wx = x + WX0, i = (y * WW + x) * 4;
        if (solid[y * WW + x]) { d[i] = 20; d[i + 1] = 18; d[i + 2] = 28; d[i + 3] = 255; continue; }
        const n = fbm(wx * 0.045, wy * 0.07, 3), r = rand(wx, wy, 9);
        const inPass = MAP.inGully(wx, wy);
        const pd = pathDist(wx, wy) + (vnoise(wx * 0.15, wy * 0.2, 7) - 0.5) * 8;
        const pw = inPass ? 999 : 15 + vnoise(wx * 0.02, wy * 0.02, 8) * 8;
        let col;
        if (inPass) {
          const k = clamp(Math.floor(1.5 + (n - 0.5) * 4 + (r - 0.5) * 1.4), 0, 4);
          col = C[k];
          if (r < 0.025) col = C[4];
        } else if (pd < pw) {
          const edge = pd > pw - 4;
          const k = clamp(Math.floor(2 + (n - 0.5) * 3.5 + (r - 0.5) * 1.3 - (edge ? 1 : 0)), 0, 4);
          col = D[k];
        } else if (pd < pw + 3 && r < 0.6) col = G[0];
        else {
          // grass with short vertical blade streaks
          let k = Math.floor(2.2 + (n - 0.5) * 4.5 + (r - 0.5) * 0.8);
          const st = rand(wx, Math.floor((wy + (wx % 3)) / 3), 4);
          if (st < 0.1) k += 1; else if (st > 0.93) k -= 1;
          col = G[clamp(k, 0, 5)];
        }
        // ancient flagstones under the defenders, broken and overgrown at the edges.
        // Pass 4: slabs seen at the 3/4 camera. A ground square is FY = 0.6 as tall as it
        // is wide (14 x 8 px). Each slab is a thick stone: a light top face, then two rows
        // of darker front edge (its thickness, facing the camera), then the dark joint to
        // the next slab. The east side is a shade darker. Mixed sizes, not a running bond.
        const pz = plaza(wx, wy);
        if (pz < 1 && !inPass) {
          const st = flagstone(wx, wy), lx = wx - st.x0, ly = wy - st.y0;
          const keep = rand(st.id, 7, 21) > pz * 1.1 + 0.3;
          if (keep) {
            const sunk = rand(st.id, 11, 26) < 0.18;          // a few slabs sit lower: thinner edge
            const edge = sunk ? 1 : 2;
            if (lx === 0 || ly === 0) col = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.6];   // joint
            else if (ly >= st.h - edge) col = FE[ly === st.h - 1 ? 0 : 1];                  // front edge
            else {
              let sh = Math.floor(rand(st.id, 3, 22) * 2) + 2.2 - (sunk ? 0.6 : 0);
              if (ly === 1) sh += 1;                                                          // lit far lip
              else if (lx === st.w - 1) sh -= 1;                                              // east side
              else if (lx === 1) sh += 0.5;
              sh += (vnoise(wx * 0.3, wy * 0.5, 24) - 0.5) * 0.8;
              col = F[clamp(Math.round(sh), 0, 4)];
              // a crack across some slabs; moss creeping in from the joints
              if (st.crack && Math.abs((lx - st.w * 0.5) * st.crack * 0.6 - (ly - st.h * 0.5)) < 0.5 && rand(st.id, 9) < 0.95) col = F[0];
              if ((lx <= 2 || ly <= 1) && rand(wx, wy, 23) < 0.18 * (0.3 + pz)) col = G[2];
              else if (rand(wx, wy, 23) < 0.03) col = G[2];
            }
          }
        }
        // ambient occlusion and cast shadow from cliffs (light from upper left)
        let ao = 0;
        for (let k = 1; k <= 9; k++) if (isSolid(wx, wy - k)) { ao = Math.max(ao, (1 - k / 10) * 0.5); break; }
        for (let k = 1; k <= 9; k++) if (isSolid(wx - k, wy - k * 0.4)) { ao = Math.max(ao, (1 - k / 10) * 0.42); break; }
        // darker toward the far end of the pass and the map edges
        const m = 1 - ao;
        d[i] = col[0] * m; d[i + 1] = col[1] * m; d[i + 2] = col[2] * m; d[i + 3] = 255;
      }
    }
    gx.putImageData(img, 0, 0);
    // stamps: flowers, pebbles, bones, tufts of dark grass
    const put = (wx, wy, col) => { gx.fillStyle = col; gx.fillRect(Math.round(wx - WX0), Math.round(wy - WY0), 1, 1); };
    const FLOW = ['#f0e8f8', '#f6a0b4', '#ffe070', '#9ac4ff', '#ffffff'];
    for (let i = 0; i < 1500; i++) {
      const wx = WX0 + rand(i, 31) * WW, wy = WY0 + rand(i, 32) * WH;
      if (isSolid(wx, wy) || isSolid(wx, wy + 3)) continue;
      const inPass = MAP.inGully(wx, wy), pd = pathDist(wx, wy);
      const kind = rand(i, 33);
      if (inPass || pd < 20) {
        if (kind < 0.5) { put(wx, wy, '#8a8070'); put(wx + 1, wy, '#a29884'); put(wx, wy + 1, '#2e2826'); put(wx + 1, wy + 1, '#2e2826'); }
        else if (kind < 0.56) { put(wx, wy, '#d8d0c0'); put(wx + 1, wy + 1, '#d8d0c0'); put(wx + 2, wy, '#d8d0c0'); put(wx + 1, wy, '#b8b0a0'); }
        continue;
      }
      if (kind < 0.3) {
        // flower clusters
        const col = FLOW[Math.floor(rand(i, 34) * FLOW.length)];
        for (let k = 0; k < 3; k++) { const fx = wx + (rand(i, k, 35) - 0.5) * 6, fy = wy + (rand(i, k, 36) - 0.5) * 3; put(fx, fy + 1, '#1e3a26'); put(fx, fy, col); }
      } else if (kind < 0.55) {
        put(wx, wy, '#20362a'); put(wx + 1, wy, '#20362a'); put(wx + 2, wy, '#20362a');
      } else if (kind < 0.62) {
        put(wx, wy, '#6c6e72'); put(wx + 1, wy, '#868890'); put(wx, wy + 1, '#24222a');
      }
    }

    // ---------- cliffs ----------
    const ROCK = ['#bcaa94', '#a2907c', '#887866', '#706254', '#5a4e44', '#463c34', '#322a25', '#201a17'];
    const TOP = ['#4a6a3c', '#557646', '#61824e', '#6e9058', '#7c9e62'];
    const TOPROCK = ['#8a8890', '#a6a4ac', '#5e5c66'];
    const strips = [];
    // elevation mask: opaque where a cliff top is drawn (lights on the low ground skip it)
    const ev = document.createElement('canvas'); ev.width = WW; ev.height = WH;
    const evx = ev.getContext('2d', CPU), evImg = evx.createImageData(WW, WH), evd = evImg.data;
    MAP.CLIFFS.forEach((cl, ci) => {
      const m = masks[ci], h = cl.h;
      const cv = document.createElement('canvas'); cv.width = WW; cv.height = WH;
      const cx = cv.getContext('2d', CPU), ci2 = cx.createImageData(WW, WH), cd = ci2.data;
      const set = (x, y, c) => { if (x < 0 || y < 0 || x >= WW || y >= WH) return; const i = (y * WW + x) * 4; cd[i] = c[0]; cd[i + 1] = c[1]; cd[i + 2] = c[2]; cd[i + 3] = 255; };
      const R = ROCK.map(X.hex), T = TOP.map(X.hex), TR = TOPROCK.map(X.hex), OUT = X.hex('#14121e'), RIM = X.hex('#86a466'), LIP = X.hex('#2a4228');
      const colInfo = [];
      for (let x = 0; x < WW; x++) {
        const iv = [];
        let y = 0;
        while (y < WH) {
          while (y < WH && !m[y * WW + x]) y++;
          if (y >= WH) break;
          const y0 = y;
          while (y < WH && m[y * WW + x]) y++;
          iv.push([y0, y - 1]);
        }
        colInfo.push(iv);
      }
      const southAt = (x) => { const iv = colInfo[x]; return iv && iv.length ? iv[iv.length - 1][1] : null; };
      // Rock columns of varying width across the face; each column is split into
      // blocks of varying height. Columns are lit on their left edge (light from the
      // upper left) and shadowed on the right; blocks get a lit top ledge.
      const colOf = new Int32Array(WW), colPos = new Float32Array(WW), colW = new Float32Array(WW);
      for (let x = 0, id = 0; x < WW; id++) {
        const w = 3 + Math.floor(rand(id, 3, ci) * 7);
        for (let k = 0; k < w && x < WW; k++, x++) { colOf[x] = id; colPos[x] = k / Math.max(1, w - 1); colW[x] = w; }
      }
      const MOSS = ['#2e4a2a', '#3e6234', '#4e7640'].map(X.hex);
      for (let x = 0; x < WW; x++) {
        const wx = x + WX0, id = colOf[x];
        for (const [y0, y1] of colInfo[x]) {
          // slope of the south edge: faces turned toward the upper-left light are brighter
          const sl = (southAt(Math.min(WW - 1, x + 3)) ?? y1) - (southAt(Math.max(0, x - 3)) ?? y1);
          const lit = clamp(sl / 6, -1, 1);
          // top face: lighter, warmer grass than the lowland (it is higher and catches the light)
          for (let gy = y0; gy <= y1; gy++) {
            const wy = gy + WY0, sy = gy - h;
            const n = fbm(wx * 0.05, wy * 0.08, 40 + ci), r = rand(wx, wy, 41);
            let k = Math.floor(2 + (n - 0.5) * 4 + (r - 0.5) * 1.0);
            const st = rand(wx, Math.floor((wy + (wx % 3)) / 3), 44 + ci);
            if (st < 0.1) k += 1; else if (st > 0.93) k -= 1;
            let col = T[clamp(k, 0, 4)];
            // a little brighter toward the lit rim
            if (gy >= y1 - 4 && gy < y1 - 1) col = T[clamp(k + 1, 0, 4)];
            if (gy >= y1 - 1) col = RIM;
            const westOpen = x > 0 && !m[gy * WW + x - 1], eastOpen = x < WW - 1 && !m[gy * WW + x + 1];
            // a bevel along the top's edges: lit where the edge faces the upper-left light,
            // shaded where it faces away, so a plateau rim reads as raised even with no face
            if (x > 1 && !m[gy * WW + x - 2] && !westOpen) col = RIM;
            else if (x < WW - 2 && !m[gy * WW + x + 2] && !eastOpen) col = T[0];
            if (gy === y0 + 1 && y0 > 2) col = RIM;
            if (gy === y0 && y0 > 2) col = OUT;
            if (westOpen || eastOpen) col = OUT;
            set(x, sy, col);
            if (sy >= 0 && sy < WH && gy < y1 - 1) evd[(sy * WW + x) * 4 + 3] = 255;
          }
          // front face (the south end of the interval faces the camera): irregular rock
          // facets from a jittered Voronoi grid; each facet is lit on its upper-left side,
          // facet borders are dark cracks.
          for (let r = 0; r < h; r++) {
            const sy = y1 - h + 1 + r, fr = r / h;
            const fx = wx * 1.0, fy = r * 1.25 + (y1 % 7);
            const gx0 = Math.floor(fx / 9), gy0 = Math.floor(fy / 8);
            let d1 = 1e9, d2 = 1e9, cxB = 0, cyB = 0, idB = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
              const gx = gx0 + i, gy = gy0 + j, px = (gx + 0.15 + rand(gx, gy, 90 + ci) * 0.7) * 9, py = (gy + 0.15 + rand(gx, gy, 91 + ci) * 0.7) * 8;
              const d = (fx - px) ** 2 + ((fy - py) * 1.15) ** 2;
              if (d < d1) { d2 = d1; d1 = d; cxB = px; cyB = py; idB = gx * 7919 + gy; } else if (d < d2) d2 = d;
            }
            const edge = Math.sqrt(d2) - Math.sqrt(d1);
            const cr = rand(idB, 3, 92 + ci);
            let k = 1.3 + fr * 3.4 + (cr - 0.5) * 1.5 - lit * 0.9;
            const ux = fx - cxB, uy = fy - cyB;
            k += (ux + uy * 1.3) * 0.12;                 // facet shading: lit toward the upper left
            if (edge < 1.1) k = 6.2;                     // crack
            else if (edge < 2.0 && uy < 0) k -= 0.8;     // lit lip above a crack
            let col = R[clamp(Math.round(k), 0, 7)];
            if (r === 0) col = RIM;
            // grass lip and moss hanging over the edge
            const lip = Math.floor(rand(wx, 70, ci) * 4) + (rand(wx >> 2, 72, ci) < 0.25 ? Math.floor(rand(wx, 73, ci) * 9) : 0);
            if (r > 0 && r <= lip) col = MOSS[r === lip ? 0 : clamp(2 - (r >> 1), 0, 2)];
            if (r >= h - 3) col = R[7 - (h - 1 - r) * 0];
            if (r === h - 1) col = OUT;
            set(x, sy, col);
          }
          // a few loose stones on the plateau
        }
      }
      for (let i = 0; i < 260; i++) {
        const x = Math.floor(rand(i, 301, ci) * WW), gy = Math.floor(rand(i, 302, ci) * WH);
        if (!m[gy * WW + x] || !m[Math.min(WH - 1, gy + 4) * WW + x] || !m[Math.max(0, gy - 3) * WW + x]) continue;
        const sy = gy - h;
        set(x, sy, TR[1]); set(x + 1, sy, TR[0]); set(x, sy + 1, TR[2]); set(x + 1, sy + 1, TR[2]);
      }
      cx.putImageData(ci2, 0, 0);
      // strips for depth sorting
      for (let x0 = 0; x0 < WW; x0 += 4) {
        let key = Infinity, top = Infinity, bot = -Infinity;
        for (let x = x0; x < Math.min(WW, x0 + 4); x++) for (const [y0, y1] of colInfo[x]) { key = Math.min(key, y0 + WY0); top = Math.min(top, y0 - h); bot = Math.max(bot, y1); }
        if (key === Infinity) continue;
        strips.push({ cv, sx: x0, sy: Math.max(0, top), w: 4, h: bot - Math.max(0, top) + 1, key, wx: x0 + WX0, wy: Math.max(0, top) + WY0 });
      }
    });

    evx.putImageData(evImg, 0, 0);

    // ---------- props ----------
    const props = [];
    const onCliff = (x, y) => { const c = MAP.cliffAt(x, y); return c ? c.h : 0; };
    const addTree = (x, y, s) => props.push({ kind: 'tree', x, y, z: onCliff(x, y), s, seed: props.length });
    // woods on the plateaus (kept back from the cliff edges and the pass)
    for (let i = 0, n = 0; i < 1600 && n < 110; i++) {
      const x = WX0 + rand(i, 201) * WW, y = WY0 + rand(i, 202) * WH, cl = MAP.cliffAt(x, y);
      if (!cl || MAP.cliffAt(x, y + 22) !== cl || MAP.cliffAt(x + 14, y + 10) !== cl || MAP.cliffAt(x - 14, y + 10) !== cl) continue;
      if (cl.id === 'ne' && x < 880 && y > 290) continue;       // leave the archers' ledge clear
      if (fbm(x * 0.012, y * 0.02, 205) < 0.3) continue;       // clumps, not an even scatter
      addTree(x, y, 0.95 + rand(i, 203) * 0.6); n++;
    }
    // trees close the south side of the clearing (nothing attacks from there)
    [[420, 604, 1.2], [500, 646, 1.3], [760, 612, 1.1], [690, 652, 1.3], [580, 664, 1.0], [812, 566, 1.0], [440, 690, 1.2], [880, 700, 1.3]].forEach(([x, y, s]) => addTree(x, y, s));
    [[300, 330], [460, 300], [780, 300], [900, 330], [200, 560], [1000, 560], [540, 600], [650, 590], [395, 545]].forEach(([x, y], i) => props.push({ kind: 'bush', x, y, z: onCliff(x, y), seed: i }));
    // ruins and rocks: partial cover around the plaza
    [[468, 398, 'pillar', 15], [744, 404, 'pillar', 11], [560, 528, 'drum', 0], [724, 526, 'pillar', 17], [452, 512, 'boulder', 0], [772, 408, 'boulder', 0], [546, 382, 'boulder', 0], [360, 498, 'boulder', 0], [962, 488, 'boulder', 0], [640, 540, 'pillar', 9]]
      .forEach(([x, y, kind, h], i) => props.push({ kind, x, y, z: onCliff(x, y), h, seed: i + 50 }));
    // grass tufts that sway and bend around feet (drawn every frame)
    const tufts = [];
    for (let i = 0; i < 900 && tufts.length < 420; i++) {
      const x = WX0 + 120 + rand(i, 91) * (WW - 240), y = WY0 + 120 + rand(i, 92) * (WH - 240);
      if (isSolid(x, y) || isSolid(x, y + 2)) continue;
      if (MAP.inGully(x, y) || pathDist(x, y) < 22 || plaza(x, y) < 0.9) continue;
      tufts.push({ x: Math.round(x), y: Math.round(y), n: 2 + Math.floor(rand(i, 93) * 3), h: 2 + rand(i, 94) * 2.5, seed: i, col: rand(i, 95) < 0.5 ? '#6a9a58' : '#7cae62' });
    }
    built = { ground: g, elev: ev, strips, props, tufts, WX0, WY0, WW, WH, isSolid, pathDist };
    // paint every prop sprite now (tree crowns are shaded per pixel), not mid-loop
    for (const p of props) for (const sw of p.kind === 'tree' ? [-1, 0, 1] : [0]) propSprite(p, sw);
    return built;
  }

  // ---- prop drawing (sorted pass) ----
  // Props are painted once per variant into a cached sprite; trees sway in whole-pixel
  // steps (three variants), which is also what hand-made pixel art would do.
  const propCache = new Map();
  function drawProp(c, p, ox, oy, t) {
    const sway = p.kind === 'tree' ? Math.round(Math.sin(t * 1.4 + p.seed * 1.7) * 0.9 + Math.sin(t * 3.1 + p.seed) * 0.3) : 0;
    c.drawImage(propSprite(p, sway), Math.round(p.x - ox) - 32, Math.round(p.y - oy - p.z) - 56);
  }
  function propSprite(p, sway) {
    const s = p.kind === 'tree' ? Math.round(p.s * 10) / 10 : 1;
    const vari = p.kind === 'pillar' ? p.seed : p.seed % 4;
    const key = p.kind + "|" + s + "|" + (p.h || 0) + "|" + vari + "|" + sway;
    let spr = propCache.get(key);
    if (!spr) {
      spr = document.createElement("canvas"); spr.width = 64; spr.height = 64;
      const sx = spr.getContext("2d", CPU);
      paintProp(sx, Object.assign({}, p, { s, x: 32, y: 56, z: 0, vari }), sway);
      propCache.set(key, spr);
    }
    return spr;
  }
  // Shade a lumpy dome made of blobs [x, y, r, lift] (screen space) with light from the
  // upper left and above, posterised into the ramp; tex adds leafy/rocky clumping and
  // facets > 0 snaps the normal's direction into that many facets.
  const LIGHT = (() => { const v = [-0.5, -0.62, 0.6], l = Math.hypot(...v); return v.map((a) => a / l); })();
  function dome(c, blobs, ramp, o = {}) {
    const sy = o.sy || 1;   // vertical squash: a dome on the ground seen at the 3/4 camera
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [bx, by, r] of blobs) { x0 = Math.min(x0, bx - r); x1 = Math.max(x1, bx + r); y0 = Math.min(y0, by - r * sy); y1 = Math.max(y1, by + r * sy); }
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
    const W = x1 - x0 + 1, Hh = y1 - y0 + 1, got = new Int8Array(W * Hh).fill(-1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let best = -1, n = null;
      for (const [bx, by, r, lift = 0] of blobs) {
        const dx = (x + 0.5 - bx) / r, dy = (y + 0.5 - by) / (r * sy), d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const hz = Math.sqrt(1 - d2), hh = hz * r + lift;
        if (hh > best) { best = hh; n = [dx, dy, hz]; }
      }
      if (!n) continue;
      if (o.facets) { const az = Math.atan2(n[1], n[0]), q = (Math.PI * 2) / o.facets, a2 = Math.round(az / q) * q, rr = Math.hypot(n[0], n[1]); n = [Math.cos(a2) * rr, Math.sin(a2) * rr, n[2]]; }
      let v = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) * 0.5 + 0.5;
      if (o.tex) v += (rand(Math.floor((x + (o.seed || 0)) / 2), Math.floor(y / 2), 61 + (o.seed || 0)) - 0.5) * o.tex;
      got[(y - y0) * W + (x - x0)] = clamp(Math.floor(v * (ramp.length - 1) + 0.35), 0, ramp.length - 1);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = got[(y - y0) * W + (x - x0)];
      if (g >= 0) { X.px(c, x, y, ramp[g]); continue; }
      // dark outline round the dome
      const nb = (dx, dy) => { const xx = x + dx - x0, yy = y + dy - y0; return xx >= 0 && yy >= 0 && xx < W && yy < Hh && got[yy * W + xx] >= 0; };
      if (nb(1, 0) || nb(-1, 0) || nb(0, 1) || nb(0, -1)) X.px(c, x, y, o.outline || '#0c1410');
    }
  }
  const LEAF = ['#122419', '#1a3324', '#22442c', '#2e5836', '#3e6e40', '#56884c', '#74a25c'];
  const PINE = ['#0e1e1a', '#142a22', '#1c382c', '#264834', '#335a3e', '#46704a'];
  const STONE = ['#262636', '#33344a', '#43445c', '#55566e', '#6a6a82', '#82829a', '#9c9cb2'];
  // Pass 4: one 3/4 camera for every prop. Things that stand up show a big top face (a
  // column's cap is an ellipse 0.58 of its width, a plinth's top is a ground square
  // FY tall) and a shorter front; domes (crowns, bushes, rocks) are squashed into the
  // ground plane; every cast shadow goes the same way (X.shadow, to the lower right,
  // longer for taller things).
  const SH = 'rgba(8,6,16,0.5)';
  function paintProp(c, p, sway) {
    const x = p.x, y = p.y, v = p.vari || 0;
    if (p.kind === "tree") {
      const s = p.s, R = 10.5 * s, pine = v === 0;
      // trunk: a few px of it show below the crown, so the crown reads as held up off
      // the ground, not as a disc lying on it
      const trunk = Math.round(5 * s + 1), cxT = x;
      if (pine) {
        // a conifer at 3/4: three stacked cones, each with an elliptical skirt (its
        // ground circle squashed by FY) whose front arc hangs toward the camera, lit on
        // the upper left and dark on the right; a darker rim under each skirt
        const base = y - trunk, Ht = R * 2.1;
        X.shadow(c, x + 1, y, R * 0.75, R * 0.75 * FY, Ht * 0.8, SH);
        X.rect(c, x - 1, base - 2, 3, trunk + 3, '#3e2c20'); X.rect(c, x - 1, base - 2, 1, trunk + 3, '#5a4030'); X.rect(c, x - 2, y, 5, 1, '#2a1e18');
        for (let k = 0; k < 3; k++) {
          const r = R * (1.0 - k * 0.24), by = base - k * R * 0.55, apx = cxT + sway * (k + 1) * 0.4, apy = by - R * (1.05 - k * 0.1), ry = r * FY;
          const pts = [[apx, apy]];
          const n = 14;
          for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI, rr = r * (i % 2 ? 0.9 : 1.04); pts.push([cxT + Math.cos(a) * rr, by + Math.sin(a) * ry * (i % 2 ? 0.8 : 1.05)]); }
          pts.push([apx, apy]);
          X.poly(c, pts.map(([a, b]) => [a + (a - cxT) * 0.06, b + 0.8]), PINE[0]);           // outline/underside
          X.poly(c, pts, PINE[2 + (k > 1 ? 1 : 0)]);
          // lit flank (upper left) and the shaded right flank
          X.poly(c, [[apx, apy + 0.5], [cxT - r * 0.95, by + ry * 0.1], [cxT - r * 0.55, by + ry * 0.7], [cxT - r * 0.05, by + ry * 0.55]], PINE[3 + (k > 0 ? 1 : 0)]);
          X.poly(c, [[apx + 0.5, apy + 1], [cxT + r * 0.25, by + ry * 0.8], [cxT + r * 0.95, by + ry * 0.2]], PINE[1]);
          X.line(c, apx - 1, apy + 2, cxT - r * 0.6, by, PINE[5]);
        }
        X.px(c, cxT + sway * 1.2, base - R * 0.55 * 2 - R * 0.85 - 1, PINE[5]);
      } else {
        // a broadleaf crown: a dome of leafy lumps, a little squashed into the ground
        // plane, held up on its trunk; the shadow is the crown's, thrown down-right
        const cy = y - trunk - R * 0.62, cx = x + sway;
        X.shadow(c, x + 2, y, R * 0.85, R * 0.85 * FY, R * 1.2, SH);
        X.rect(c, x - 1, cy + R * 0.3, 3, y - (cy + R * 0.3) + 1, '#3e2c20'); X.rect(c, x - 1, cy + R * 0.3, 1, y - (cy + R * 0.3) + 1, '#5a4030'); X.rect(c, x - 2, y, 5, 1, '#2a1e18');
        X.px(c, x + 1, y - 2, '#2a1e18');
        const blobs = [[cx, cy, R * 0.74, R * 0.18]];
        const n = 7;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rand(v, i, 3) * 0.6, d = R * (0.42 + rand(v, i, 4) * 0.14); blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.72, R * (0.4 + rand(v, i, 5) * 0.16), 0]); }
        blobs.push([cx - R * 0.2, cy - R * 0.24, R * 0.42, R * 0.32]);
        dome(c, blobs, LEAF, { tex: 0.34, seed: v * 17, sy: 0.8 });
      }
    } else if (p.kind === 'bush') {
      X.shadow(c, x + 1, y, 5.5, 5.5 * FY, 5, SH);
      dome(c, [[x, y - 3, 4.6, 0.6], [x - 3, y - 2, 3.4, 0], [x + 3, y - 2.2, 3.2, 0], [x - 0.5, y - 4.5, 3, 1]], LEAF, { tex: 0.3, seed: v * 7 + 3, sy: 0.72 });
      X.px(c, x + 2, y - 4, '#d84a5a'); X.px(c, x - 3, y - 2, '#d84a5a'); X.px(c, x + 1, y - 1, '#b83848');
    } else if (p.kind === 'pillar') {
      // A standing column on a square plinth. The plinth's top is a ground square (15 x 9)
      // with a 3 px front face; the column is a short, fat drum whose top cap is an
      // ellipse 0.58 of its width, and whose foot and lit/shaded flanks follow the arcs.
      const h = Math.round(p.h * 0.72), r = 5.6, ry = r * 0.58, PL = 7, pt = y - 12, pf = y - 3;
      X.shadow(c, x, y - 4, 8.5, 5, h + 3, SH);
      // plinth: top face, front face, outline
      X.rect(c, x - PL - 1, pt - 1, PL * 2 + 3, y - pt + 2, '#1a1820');
      X.rect(c, x - PL, pt, PL * 2 + 1, pf - pt, '#8a867c'); X.rect(c, x - PL, pt, PL * 2 + 1, 1, '#aaa69c'); X.rect(c, x - PL, pt, 1, pf - pt, '#9c988e'); X.rect(c, x + PL, pt, 1, pf - pt, '#76726a');
      X.rect(c, x - PL, pf, PL * 2 + 1, y - pf, '#56524c'); X.rect(c, x - PL, pf, PL * 2 + 1, 1, '#66625a'); X.rect(c, x + PL - 2, pf, 3, y - pf, '#46423e');
      if (rand(p.seed, 5) < 0.6) { X.px(c, x + PL - 1, pt, '#1a1820'); X.px(c, x + PL, pt + 1, '#56524c'); }   // a chipped corner
      // the column
      const bc = (pt + pf) / 2 - 0.5;   // its foot sits in the middle of the plinth top
      for (let k = -Math.floor(r); k <= Math.floor(r); k++) {
        const arc = ry * Math.sqrt(Math.max(0, 1 - (k / (r + 0.4)) ** 2)), broken = Math.floor(rand(p.seed, k + 9) * 2.4);
        const top = Math.round(bc - h + arc + broken), bot = Math.round(bc + arc);
        const q = (k + r) / (2 * r);
        const col = q < 0.22 ? '#b4b0a6' : q < 0.4 ? '#9a968c' : q < 0.62 ? '#86827a' : q < 0.82 ? '#6a665f' : '#54504a';
        X.rect(c, x + k, top, 1, bot - top + 1, col);
        if ((k + 10) % 3 === 0) X.rect(c, x + k, top + 2, 1, bot - top - 2, q < 0.4 ? '#a29e94' : '#5e5a54');   // fluting
        X.px(c, x + k, bot, '#2a2622');
      }
      // the broken top: a big pale cap (seen from above at this camera) with a chipped rim
      const ty = bc - h;
      X.ellipse(c, x, ty + 0.5, r + 0.4, ry + 0.4, '#5a564e');
      X.ellipse(c, x, ty, r, ry, '#c2beb2'); X.ellipse(c, x - 1, ty - 0.5, r - 1.6, ry - 1, '#d4d0c4'); X.ellipse(c, x + 1.5, ty + 0.5, 1.6, 0.8, '#aaa69a');
      for (let k = -5; k <= 5; k += 2) if (rand(p.seed, k, 3) < 0.4) X.px(c, x + k, ty - ry * Math.sqrt(Math.max(0, 1 - (k / r) ** 2)), '#5a564e');
      if (p.h > 14) { X.px(c, x + 1, ty, '#3e6a3a'); X.px(c, x + 2, ty, '#4e7a44'); X.px(c, x + 2, ty + 1, '#3e6a3a'); X.px(c, x - 3, bc - 2, '#3e6a3a'); }
    } else if (p.kind === 'drum') {
      // A fallen column drum lying on its side, its axis pointing at the camera: the
      // curved top runs up the screen (foreshortened) and the near end is a round face.
      const r = 5, L = 9, nearY = y - r - 0.5, farY = nearY - L, ery = r * 0.86;
      X.shadow(c, x, y - 4, 6, 5, 6, SH);
      for (let k = -r; k <= r; k++) {
        const e = ery * Math.sqrt(Math.max(0, 1 - (k / (r + 0.3)) ** 2));
        const q = (k + r) / (2 * r), col = q < 0.25 ? '#b8b4aa' : q < 0.55 ? '#9a968c' : q < 0.8 ? '#7a766e' : '#5a5650';
        X.rect(c, x + k, Math.round(farY - e) - 1, 1, Math.round(nearY - e) - Math.round(farY - e) + 2, '#1a1820');
        X.rect(c, x + k, Math.round(farY - e), 1, Math.round(nearY + e) - Math.round(farY - e), col);
      }
      X.line(c, x - 2, farY - ery + 1, x - 2, nearY - ery, '#cac6ba');
      X.ellipse(c, x, nearY, r + 0.6, ery + 0.6, '#1a1820');
      X.ellipse(c, x, nearY, r, ery, '#8e8a80'); X.ellipse(c, x - 0.5, nearY - 0.5, r - 1.2, ery - 1.2, '#a6a296');
      X.ring(c, x, nearY, r - 2.2, ery - 2.2, '#7a766c'); X.px(c, x, nearY, '#6a665e');
      X.rect(c, x - r, y - 1, r * 2 + 1, 1, '#14121c');
    } else if (p.kind === 'boulder') {
      // a faceted rock sitting in the ground plane: squashed dome, its top facets lit
      X.shadow(c, x + 1, y - 1, 7.5, 7.5 * FY, 7, SH);
      const j = (k) => (rand(v, k, 9) - 0.5) * 2;
      dome(c, [[x + j(1), y - 3.5, 7.2, 0], [x - 3.6 + j(2), y - 2.5, 4.8, 0], [x + 3.8, y - 2.2 + j(3), 5, 0], [x - 0.8 + j(4), y - 5, 4.4, 1.4]], STONE, { facets: 7, tex: 0.12, seed: v * 5, outline: '#14121c', sy: 0.72 });
      X.rect(c, x - 6, y, 13, 1, '#14121c');
    }
  }
  PB.world = { build, drawProp, vnoise, fbm, WX0, WY0 };
})();
