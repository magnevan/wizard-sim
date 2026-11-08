// Field Atlas generator: land first, then water, climate, the seven fields, and the places that grow on them.
// Deterministic per seed. Heights: sea is negative, the shoreline is 0, land runs 0..1 (mountains from about .46).
(function (root) {
  const GW = 400, GH = 320, N = GW * GH, K = GW / 260, TAU = Math.PI * 2;

  const FIELDS = [
    ['earth', 'Earth', '#8a6a3e', 'Hills and mountain chains.'],
    ['cold', 'Cold', '#5fb3d6', 'The north, and anywhere high.'],
    ['fire', 'Fire', '#d9532c', 'Around a few volcanoes, and in the hot country behind the mountains. Kept well away from Cold.'],
    ['water', 'Water', '#2f74c0', 'Along rivers, lakes and coasts.'],
    ['lightning', 'Lightning', '#9a6fe0', 'Storm coasts, high peaks and volcano ash-storms: it shares ground with Water and Fire.'],
    ['life', 'Life', '#3f9e4f', 'Warm, wet lowlands.'],
    ['arcane', 'Arcane', '#c13c96', 'Narrow rifts where the crust of the other fields is torn: rare.'],
  ];
  const PAIRS = {
    'earth+fire': 'Forge city', 'fire+water': 'Steam town', 'fire+lightning': 'Arc foundry', 'cold+lightning': 'Spark peak',
    'cold+water': 'Ice-road town', 'life+water': 'Farm town', 'lightning+water': 'Storm port', 'cold+earth': 'Mine hold',
    'earth+life': 'Orchard town', 'earth+water': 'Mill town', 'earth+lightning': 'Rod town', 'cold+life': 'Hardy steading',
    'fire+life': 'Spice town', 'cold+fire': 'Fog hollow', 'arcane+earth': 'Rift hold', 'arcane+water': 'Rift harbour', 'arcane+fire': 'Rift forge',
    'arcane+cold': 'Rift watch', 'arcane+lightning': 'Rift spire', 'arcane+life': 'Blighted rift', 'life+lightning': 'Storm meadow',
  };
  const WELL_NAME = { earth: 'Well of Stone', cold: 'Well of Frost', fire: 'Well of Embers', water: 'Well of Tides', lightning: 'Well of Storms', life: 'Well of Roots' };
  const SINGLE = { earth: 'Quarry', cold: 'Outpost', fire: 'Kiln village', water: 'Fishing village', lightning: 'Rod village', life: 'Hamlet', arcane: 'Rift camp' };

  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct = 5) { let t = 0, amp = .5, f = 1, n = 0; for (let o = 0; o < oct; o++) { t += amp * vnoise(x * f, y * f, s + o * 17); n += amp; amp *= .5; f *= 2; } return t / n; }
  const cl = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const idx = (x, y) => y * GW + x;
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  function bfs(sources) {
    const d = new Float32Array(N).fill(1e9), q = new Int32Array(N); let h = 0, t = 0;
    for (const i of sources) { d[i] = 0; q[t++] = i; }
    while (h < t) {
      const i = q[h++], x = i % GW, y = (i / GW) | 0;
      for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const j = idx(nx, ny); if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q[t++] = j; } }
    }
    return d;
  }
  function blur(a, passes) {
    let src = a, tmp = new Float32Array(N);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) tmp[idx(x, y)] = (src[idx(Math.max(0, x - 1), y)] + src[idx(x, y)] + src[idx(Math.min(GW - 1, x + 1), y)]) / 3;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) src[idx(x, y)] = (tmp[idx(x, Math.max(0, y - 1))] + tmp[idx(x, y)] + tmp[idx(x, Math.min(GH - 1, y + 1))]) / 3;
    }
    return src;
  }
  class Heap { // min-heap of [priority, value]
    constructor() { this.p = []; this.v = []; }
    get size() { return this.p.length; }
    push(pr, val) { const p = this.p, v = this.v; let i = p.length; p.push(pr); v.push(val); while (i > 0) { const u = (i - 1) >> 1; if (p[u] <= pr) break; p[i] = p[u]; v[i] = v[u]; i = u; } p[i] = pr; v[i] = val; }
    pop() { const p = this.p, v = this.v, top = v[0], lp = p.pop(), lv = v.pop(), n = p.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && p[c + 1] < p[c]) c++; if (p[c] >= lp) break; p[i] = p[c]; v[i] = v[c]; i = c; } p[i] = lp; v[i] = lv; } return top; }
  }
  function chaikin(pts, n) {
    let p = pts;
    for (let k = 0; k < n; k++) { const o = [p[0]]; for (let i = 0; i + 1 < p.length; i++) { const [a, b] = p[i], [c, d] = p[i + 1]; o.push([a * .75 + c * .25, b * .75 + d * .25], [a * .25 + c * .75, b * .25 + d * .75]); } o.push(p[p.length - 1]); p = o; }
    return p;
  }

  function shapeLand(seed, R) {
    const v = new Float32Array(N);
    const rx = .5 + (R() - .5) * .08, ry = .5 + (R() - .5) * .08, lobes = [], nL = 4 + Math.floor(R() * 2), gap = R() * TAU;
    for (let k = 0; k < nL; k++) {
      const a = gap + TAU * .09 + ((k + .5 + (R() - .5) * .35) / nL) * TAU * .82, r = .27 + R() * .07;
      lobes.push({ x: rx + Math.cos(a) * r, y: ry + Math.sin(a) * r, ax: .19 + R() * .09, ay: .17 + R() * .08, rot: R() * Math.PI, w: .85 + R() * .25 });
    }
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const nx = x / GW, ny = y / GH;
      const wx = nx + (fbm(nx * 3, ny * 3, seed + 3) - .5) * .22, wy = ny + (fbm(nx * 3, ny * 3, seed + 5) - .5) * .22;
      let L = -1;
      for (const l of lobes) { const dx = wx - l.x, dy = wy - l.y, c = Math.cos(l.rot), s = Math.sin(l.rot), u = (dx * c + dy * s) / l.ax, w = (-dx * s + dy * c) / l.ay; L = Math.max(L, l.w * (1 - Math.hypot(u, w))); }
      let t = L * .8 + (fbm(nx * 4.5, ny * 3.6, seed) - .5) * .75 + (fbm(nx * 13, ny * 10.4, seed + 9) - .5) * .24;
      t -= .55 * Math.exp(-((wx - rx) ** 2 + (wy - ry) ** 2) / (.13 * .13));
      const e = Math.min(nx, 1 - nx, ny, 1 - ny);
      t -= .9 * cl((.1 - e) / .08);
      t -= .7 * cl(Math.min((nx - .7) / .05, (ny - .76) / .05)); // the corner the map key sits in
      v[idx(x, y)] = t;
    }
    // island chains out in the water
    for (let a = 0; a < 4; a++) {
      let cx = .1 + R() * .8, cy = .1 + R() * .78; const dir = R() * TAU, n = 6 + Math.floor(R() * 9);
      for (let i = 0; i < n; i++) {
        cx += Math.cos(dir + (R() - .5) * 1.4) * (.018 + R() * .03); cy += Math.sin(dir + (R() - .5) * 1.4) * (.018 + R() * .03);
        const r = (.008 + R() * .018) * GW, px = cx * GW, py = cy * GH, rr = Math.ceil(r * 2.4);
        if (Math.min(cx, 1 - cx, cy, 1 - cy) < .07 || (cx > .7 && cy > .76)) continue;
        for (let y = Math.max(0, Math.floor(py - rr)); y < Math.min(GH, py + rr); y++) for (let x = Math.max(0, Math.floor(px - rr)); x < Math.min(GW, px + rr); x++) v[idx(x, y)] += .55 * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (r * r));
      }
    }
    const sorted = Float32Array.from(v).sort(), sea = sorted[Math.floor(N * .57)], hi = sorted[N - 1], lo = sorted[0];
    const e = new Float32Array(N);
    for (let i = 0; i < N; i++) e[i] = v[i] >= sea ? (v[i] - sea) / (hi - sea) : (v[i] - sea) / (sea - lo);
    return { e, rx, ry };
  }

  function raiseRanges(seed, R, e, rx, ry) {
    const ridge = new Float32Array(N), chains = [], nC = 3 + Math.floor(R() * 2);
    for (let tries = 0; tries < 400 && chains.length < nC; tries++) {
      let x = 8 + R() * (GW - 16), y = 8 + R() * (GH - 16);
      if (e[idx(x | 0, y | 0)] < .12 || chains.some((c) => c.some(([a, b]) => Math.hypot(a - x, b - y) < 42 * K))) continue;
      let ang = Math.atan2(y / GH - ry, x / GW - rx) + Math.PI / 2 + (R() - .5) * 1.1; if (R() < .5) ang += Math.PI;
      const pts = [[x, y]], max = (34 + R() * 42) * K / 1.6;
      for (let s = 0; s < max; s++) { ang += (R() - .5) * .55; x += Math.cos(ang) * 1.6 * K; y += Math.sin(ang) * 1.6 * K; if (x < 6 || y < 6 || x >= GW - 6 || y >= GH - 6 || e[idx(x | 0, y | 0)] <= .01) break; pts.push([x, y]); }
      if (pts.length < 20) continue;
      chains.push(pts);
      const w = (5.5 + R() * 3) * K;
      pts.forEach(([px, py], s) => {
        const t = s / (pts.length - 1), amp = Math.pow(Math.sin(Math.PI * t), .5), rr = Math.ceil(w * 2.2);
        for (let cy = Math.max(0, Math.floor(py - rr)); cy < Math.min(GH, py + rr); cy++) for (let cx = Math.max(0, Math.floor(px - rr)); cx < Math.min(GW, px + rr); cx++) { const i = idx(cx, cy); ridge[i] = Math.max(ridge[i], amp * Math.exp(-((cx - px) ** 2 + (cy - py) ** 2) / (w * w))); }
      });
    }
    const h = new Float32Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = idx(x, y); if (e[i] <= 0) { h[i] = e[i]; continue; } const rn = 1 - Math.abs(fbm(x / 22, y / 22, seed + 11) * 2 - 1); h[i] = Math.min(1, e[i] * .4 + ridge[i] * (.55 + .55 * rn)); }
    return { h, chains };
  }

  function hydrology(seed, h, sea) {
    // windward rain: a dry shadow forms behind each range
    const westerly = hash(seed, 3, 91) < .6, wet = new Float32Array(N), rain = new Float32Array(N);
    for (let y = 0; y < GH; y++) {
      let m = 1, hp = 0;
      for (let k = 0; k < GW; k++) {
        const x = westerly ? k : GW - 1 - k, i = idx(x, y);
        if (sea[i]) { m = Math.min(1, m + .02 / K); wet[i] = m; rain[i] = 0; hp = 0; continue; }
        const up = Math.max(0, h[i] - hp), r = Math.min(1.5, m * (.35 + up * 9 * K));
        rain[i] = r + .1; wet[i] = m; m = Math.max(.08, m - .0028 / K - Math.max(0, r - .35) * .12 / K); hp = h[i];
      }
    }
    blur(wet, 3);
    // priority flood: every land cell gets a downhill receiver, pits fill to lakes
    const filled = Float32Array.from(h), recv = new Int32Array(N).fill(-1), seen = new Uint8Array(N), order = [], heap = new Heap();
    for (let i = 0; i < N; i++) if (sea[i]) { seen[i] = 1; filled[i] = 0; const x = i % GW, y = (i / GW) | 0; if (D8.some(([dx, dy]) => { const a = x + dx, b = y + dy; return a >= 0 && b >= 0 && a < GW && b < GH && !sea[idx(a, b)]; })) heap.push(0, i); }
    while (heap.size) {
      const c = heap.pop(), x = c % GW, y = (c / GW) | 0;
      if (!sea[c]) order.push(c);
      for (const [dx, dy] of D8) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= GW || b >= GH) continue; const n = idx(a, b); if (seen[n]) continue; seen[n] = 1; filled[n] = Math.max(h[n], filled[c] + 1e-5); recv[n] = c; heap.push(filled[n], n); }
    }
    const flow = Float32Array.from(rain);
    for (let k = order.length - 1; k >= 0; k--) { const c = order[k], r = recv[c]; if (r >= 0 && !sea[r]) flow[r] += flow[c]; }
    // lakes: the larger filled pits only
    const pit = new Uint8Array(N), comp = new Int32Array(N).fill(-1), sizes = [];
    for (let i = 0; i < N; i++) if (!sea[i] && filled[i] - h[i] > .006) pit[i] = 1;
    for (let i = 0; i < N; i++) { if (!pit[i] || comp[i] >= 0) continue; const id = sizes.length, st = [i]; comp[i] = id; let s = 0; while (st.length) { const c = st.pop(); s++; const x = c % GW, y = (c / GW) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= GW || b >= GH) continue; const n = idx(a, b); if (pit[n] && comp[n] < 0) { comp[n] = id; st.push(n); } } } sizes.push(s); }
    const keep = new Set(sizes.map((s, i) => [s, i]).filter(([s]) => s >= 20 * K * K).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, i]) => i));
    const lake = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (pit[i] && keep.has(comp[i])) lake[i] = 1;
    // rivers: follow receivers from each headwater above the flow threshold
    const lf = []; for (let i = 0; i < N; i++) if (!sea[i]) lf.push(flow[i]);
    lf.sort((a, b) => a - b);
    const T = lf[Math.floor(lf.length * .982)] || 1, river = new Uint8Array(N), hasDonor = new Uint8Array(N), paths = [];
    for (const c of order) if (flow[c] >= T && recv[c] >= 0) hasDonor[recv[c]] = 1;
    const heads = order.filter((c) => flow[c] >= T && !hasDonor[c]).sort((a, b) => flow[b] - flow[a]);
    for (const head of heads) {
      const pts = [], fl = []; let c = head, joined = false;
      for (let s = 0; s < 800 && c >= 0; s++) { pts.push([c % GW, (c / GW) | 0]); fl.push(flow[c]); if (sea[c]) break; if (river[c] && s > 0) { joined = true; break; } river[c] = 1; c = recv[c]; }
      if (pts.length >= 9 * K || joined && pts.length >= 6 * K) paths.push({ pts, fl }); else if (!joined) for (const [x, y] of pts) { if (!sea[idx(x, y)]) river[idx(x, y)] = 0; }
    }
    return { wet, flow, lake, river, paths, T, westerly };
  }

  function components(mask) {
    const comp = new Int32Array(N).fill(-1), list = [];
    for (let i = 0; i < N; i++) {
      if (!mask[i] || comp[i] >= 0) continue;
      const id = list.length, cells = [], st = [i]; comp[i] = id;
      while (st.length) { const c = st.pop(); cells.push(c); const x = c % GW, y = (c / GW) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= GW || b >= GH) continue; const n = idx(a, b); if (mask[n] && comp[n] < 0) { comp[n] = id; st.push(n); } } }
      list.push(cells);
    }
    return { comp, list };
  }
  // A blob's centre and long axis: where and at what tilt a big label fits.
  function axis(cells) {
    let mx = 0, my = 0; for (const c of cells) { mx += c % GW; my += (c / GW) | 0; } mx /= cells.length; my /= cells.length;
    let xx = 0, xy = 0, yy = 0; for (const c of cells) { const dx = c % GW - mx, dy = ((c / GW) | 0) - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
    let ang = .5 * Math.atan2(2 * xy, xx - yy); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const major = Math.sqrt(Math.max(1, ((xx + yy) + Math.hypot(xx - yy, 2 * xy)) / 2 / cells.length)) * 2;
    return { x: mx, y: my, ang, len: major };
  }

  function roads(world, towns, seed) {
    const { h, sea, lake, river } = world;
    const land = components(Uint8Array.from(sea, (s) => s ? 0 : 1)), onRoad = new Uint8Array(N), out = [];
    function path(a, b) {
      const si = idx(a.x, a.y), ti = idx(b.x, b.y), dist = new Map([[si, 0]]), came = new Map(), heap = new Heap();
      heap.push(0, si); let steps = 0;
      while (heap.size && steps++ < 60000) {
        const c = heap.pop(); if (c === ti) break;
        const x = c % GW, y = (c / GW) | 0, d = dist.get(c);
        for (const [dx, dy] of D8) {
          const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx >= GW - 1 || ny >= GH - 1) continue;
          const n = idx(nx, ny); if (sea[n] || lake[n]) continue;
          const step = (dx && dy ? 1.41 : 1) * (onRoad[n] ? .55 : 1 + Math.max(0, h[n] - .24) * 24 + (river[n] ? 5 : 0));
          const nd = d + step; if (nd < (dist.get(n) ?? 1e12)) { dist.set(n, nd); came.set(n, c); heap.push(nd + Math.hypot(nx - b.x, ny - b.y) * .9, n); }
        }
      }
      if (!came.has(ti)) return null;
      const pts = []; let c = ti; while (c !== undefined) { pts.push([c % GW, (c / GW) | 0]); onRoad[c] = 1; c = came.get(c); }
      return pts.reverse();
    }
    const edges = [];
    for (let i = 0; i < towns.length; i++) for (let j = i + 1; j < towns.length; j++) { const a = towns[i], b = towns[j]; if (land.comp[idx(a.x, a.y)] === land.comp[idx(b.x, b.y)]) edges.push([Math.hypot(a.x - b.x, a.y - b.y), i, j]); }
    edges.sort((a, b) => a[0] - b[0]);
    const parent = towns.map((_, i) => i), find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i])), chosen = [];
    for (const e of edges) { const a = find(e[1]), b = find(e[2]); if (a !== b) { parent[a] = b; chosen.push(e); } }
    const degree = towns.map(() => 0); chosen.forEach((e) => { degree[e[1]]++; degree[e[2]]++; });
    for (const e of edges) if (e[0] < 60 * K && hash(e[1], e[2], seed + 8) < .3 && degree[e[1]] < 3 && degree[e[2]] < 3 && !chosen.includes(e)) { chosen.push(e); degree[e[1]]++; degree[e[2]]++; }
    for (const e of chosen) { const p = path(towns[e[1]], towns[e[2]]); if (p) out.push(p); }
    return { roads: out, onRoad };
  }

  function seaRoutes(world, towns, seed) {
    const { sea, dSea } = world, ports = towns.filter((t) => dSea[idx(t.x, t.y)] <= 5 * K && t.tier !== 'hamlet'), dLand = world.dLand, out = [];
    const nearestSea = (t) => { let best = -1, bd = 1e9; for (let y = Math.max(1, t.y - 10); y < Math.min(GH - 1, t.y + 11); y++) for (let x = Math.max(1, t.x - 10); x < Math.min(GW - 1, t.x + 11); x++) { const i = idx(x, y); if (sea[i]) { const d = Math.hypot(x - t.x, y - t.y); if (d < bd) { bd = d; best = i; } } } return best; };
    function route(si, ti) {
      const dist = new Map([[si, 0]]), came = new Map(), heap = new Heap(), tx = ti % GW, ty = (ti / GW) | 0; heap.push(0, si); let steps = 0;
      while (heap.size && steps++ < 50000) {
        const c = heap.pop(); if (c === ti) break; const x = c % GW, y = (c / GW) | 0, d = dist.get(c);
        for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (nx < 8 * K || ny < 8 * K || nx >= GW - 8 * K || ny >= GH - 8 * K) continue; const n = idx(nx, ny); if (!sea[n]) continue; const nd = d + (dx && dy ? 1.41 : 1) * (dLand[n] < 6 * K ? 3 : 1); if (nd < (dist.get(n) ?? 1e12)) { dist.set(n, nd); came.set(n, c); heap.push(nd + Math.hypot(nx - tx, ny - ty), n); } }
      }
      if (!came.has(ti)) return null; const pts = []; let c = ti; while (c !== undefined) { pts.push([c % GW, (c / GW) | 0]); c = came.get(c); } return pts.reverse();
    }
    const pairs = [];
    for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) { const d = Math.hypot(ports[i].x - ports[j].x, ports[i].y - ports[j].y); if (d > 40 * K && d < 190 * K) pairs.push([d + hash(i, j, seed) * 40, i, j]); }
    pairs.sort((a, b) => a[0] - b[0]);
    const used = {};
    for (const [, i, j] of pairs) { if (out.length >= 6 || (used[i] || 0) >= 2 || (used[j] || 0) >= 2) continue; const a = nearestSea(ports[i]), b = nearestSea(ports[j]); if (a < 0 || b < 0) continue; const p = route(a, b); if (!p) continue; out.push(p.filter((_, k) => k % 3 === 0)); used[i] = (used[i] || 0) + 1; used[j] = (used[j] || 0) + 1; }
    return out;
  }

  function generate(seed) {
    const R = rng(seed * 9973 + 7), T0 = performance.now();
    const { e, rx, ry } = shapeLand(seed, R), { h, chains } = raiseRanges(seed, R, e, rx, ry);
    const sea = new Uint8Array(N); for (let i = 0; i < N; i++) sea[i] = h[i] <= 0 ? 1 : 0;
    const { wet, flow, lake, river, paths, T, westerly } = hydrology(seed, h, sea);
    const seaSrc = [], landSrc = [], waterSrc = [];
    for (let i = 0; i < N; i++) { if (sea[i]) seaSrc.push(i); else landSrc.push(i); if (sea[i] || lake[i] || river[i]) waterSrc.push(i); }
    const dSea = bfs(seaSrc), dLand = bfs(landSrc), dW = bfs(waterSrc);
    const temp = new Float32Array(N), moist = new Float32Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = idx(x, y);
      temp[i] = cl(.06 + (y / GH) * .92 - Math.max(0, h[i] - .4) * .9 + (fbm(x / 60, y / 60, seed + 21) - .5) * .22);
      moist[i] = cl(wet[i] * .82 + Math.exp(-dW[i] / (10 * K)) * .25 + (fbm(x / 45, y / 45, seed + 23) - .5) * .38);
    }
    // volcanoes (never in the cold), rifts
    const volc = [];
    for (let t = 0; t < 5000 && volc.length < 3; t++) { const x = Math.floor(R() * GW), y = Math.floor(R() * GH), i = idx(x, y); if (!sea[i] && h[i] > .42 && temp[i] > .42 && volc.every(([a, b]) => Math.hypot(a - x, b - y) > 60 * K)) volc.push([x, y]); }
    const rifts = [], riftCells = [];
    for (let r = 0, t = 0; r < 2 && t < 5000; t++) {
      let x = 10 + R() * (GW - 20), y = 10 + R() * (GH - 20); if (sea[idx(x | 0, y | 0)] || h[idx(x | 0, y | 0)] < .08 || temp[idx(x | 0, y | 0)] < .2 || rifts.some((p) => Math.hypot(p[0][0] - x, p[0][1] - y) < 80 * K)) continue;
      r++; let ang = R() * TAU; const pts = [];
      for (let s = 0; s < 34 * K; s++) { const cx = Math.max(0, Math.min(GW - 1, Math.round(x))), cy = Math.max(0, Math.min(GH - 1, Math.round(y))); if (sea[idx(cx, cy)]) break; pts.push([x, y]); riftCells.push(idx(cx, cy)); ang += (R() - .5) * .7; x += Math.cos(ang) * 1.2; y += Math.sin(ang) * 1.2; }
      rifts.push(pts);
    }
    const dRift = bfs(riftCells);
    const F = {}; for (const [k] of FIELDS) F[k] = new Float32Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = idx(x, y); if (sea[i]) continue;
      F.earth[i] = cl((h[i] - .3) / .2 + (fbm(x / 38, y / 38, seed + 31) - .5) * .5);
      F.cold[i] = cl((.36 - temp[i]) / .18);
      let fv = 0; for (const [a, b] of volc) fv = Math.max(fv, Math.exp(-Math.hypot(a - x, b - y) / (15 * K)));
      F.fire[i] = cl(Math.max(fv, cl((temp[i] - .62) / .18) * cl((.42 - moist[i]) / .2)));
      F.water[i] = cl(Math.exp(-dW[i] / (5 * K)));
      const band = fbm(x / 34, y / 34, seed + 41);
      F.lightning[i] = cl(Math.max(Math.exp(-dSea[i] / (7 * K)) * cl((band - .58) / .1), cl((h[i] - .55) / .12) * cl((band - .42) / .1), fv * .85 * cl((band - .3) / .2)));
      F.life[i] = cl((moist[i] * 1.3 - .35) * cl((temp[i] - .38) / .2) * (h[i] < .42 ? 1 : .3) * 1.4);
      F.arcane[i] = cl(Math.exp(-dRift[i] / (2.2 * K)));
    }
    const world = { seed, h, sea, lake, river, flow, riverT: T, paths, F, temp, moist, dSea, dLand, dW, dRift, chains, volc, rifts, rx, ry, westerly };

    // forests: masses, not scatter
    const fs = new Float32Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = idx(x, y); fs[i] = sea[i] || lake[i] || h[i] > .44 || temp[i] < .12 ? -1 : moist[i] * .9 + (fbm(x / 26, y / 26, seed + 51) - .5) * 1.1; }
    const lv = []; for (let i = 0; i < N; i++) if (fs[i] > -1) lv.push(fs[i]); lv.sort((a, b) => a - b);
    const ft = lv[Math.floor(lv.length * .72)] ?? 1, fm = Uint8Array.from(fs, (v) => v >= ft ? 1 : 0), fc = components(fm), forest = new Uint8Array(N), woods = [];
    for (const cells of fc.list) { if (cells.length < 60 * K * K) continue; for (const c of cells) forest[c] = 1; woods.push({ ...axis(cells), n: cells.length, conifer: cells.reduce((a, c) => a + temp[c], 0) / cells.length < .44 }); }
    woods.sort((a, b) => b.n - a.n); world.forest = forest; world.woods = woods;

    // the settlements: the academy on its rift, a city at each field's well, then towns where fields meet
    const taken = [], dist = (a, x, y) => Math.hypot(a.x - x, a.y - y), towns = [];
    const inKey = (i) => (i % GW) / GW > .69 && ((i / GW) | 0) / GH > .78; // nothing settles under the map key
    const dryLand = (i) => !sea[i] && !lake[i] && !river[i] && h[i] <= .42 && !inKey(i);
    let academy = null, ab = -1;
    for (let y = 8; y < GH - 8; y++) for (let x = 8; x < GW - 8; x++) { const i = idx(x, y); if (!dryLand(i) || h[i] > .3) continue; const d = dRift[i]; if (d < 2.5 * K || d > 8 * K) continue; const sc = (dW[i] <= 3 * K ? .4 : 0) + (1 - d / (8 * K)) + hash(x, y, seed) * .1; if (sc > ab) { ab = sc; academy = { x, y, tier: 'academy', name: 'The academy', ks: ['arcane'] }; } }
    if (academy) taken.push(academy);
    const wells = [];
    for (const [k] of FIELDS) {
      if (k === 'arcane') continue;
      const sm = blur(Float32Array.from(F[k]), 3); let bx = -1, by = -1, bs = .25;
      for (let y = 8; y < GH - 8; y++) for (let x = 8; x < GW - 8; x++) { const i = idx(x, y); if (sea[i] || lake[i] || inKey(i) || sm[i] <= bs || taken.some((t) => dist(t, x, y) < 34 * K) || wells.some((w) => dist(w, x, y) < 40 * K)) continue; bs = sm[i]; bx = x; by = y; }
      if (bx < 0) continue;
      wells.push({ k, x: bx, y: by });
    }
    const nameOf = (ks) => ks.length > 1 ? (PAIRS[[...ks].sort().join('+')] || 'Crossroads') : SINGLE[ks[0]];
    const strongAt = (i) => FIELDS.map(([k]) => [k, F[k][i]]).filter(([, v]) => v > .5).sort((a, b) => b[1] - a[1]);
    const used = {};
    for (const w of wells) {
      let best = null, bs = -1e9;
      for (let y = Math.max(6, w.y - Math.round(18 * K)); y < Math.min(GH - 6, w.y + 18 * K); y++) for (let x = Math.max(6, w.x - Math.round(18 * K)); x < Math.min(GW - 6, w.x + 18 * K); x++) { const i = idx(x, y); if (!dryLand(i) || taken.some((t) => dist(t, x, y) < 26 * K)) continue; const sc = F[w.k][i] + (dW[i] <= 3 * K ? .5 : 0) + (dSea[i] <= 4 * K ? .3 : 0) - dist(w, x, y) * .01; if (sc > bs) { bs = sc; best = [x, y]; } }
      if (!best) continue;
      const i = idx(best[0], best[1]), s = strongAt(i).map((v) => v[0]).filter((k) => k !== w.k), ks = [w.k, ...s.slice(0, 1)], t = { x: best[0], y: best[1], ks, tier: 'city', name: WELL_NAME[w.k], well: w.k };
      towns.push(t); taken.push(t);
    }
    const cand = [];
    for (let y = 5; y < GH - 5; y++) for (let x = 5; x < GW - 5; x++) {
      const i = idx(x, y); if (!dryLand(i)) continue; const st = strongAt(i); if (!st.length) continue;
      const near = dW[i] <= 2 * K ? .35 : 0, coast = dSea[i] <= 2.5 * K ? .22 : 0;
      cand.push([(st.length >= 2 ? st[0][1] + st[1][1] : st[0][1] * .6) + near + coast + hash(x, y, seed) * .05, x, y, st.slice(0, 2).map((s) => s[0])]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const pool = cand.slice(0, 7000);
    while (towns.length < 27) {
      let bi = -1, bs = -1e9;
      for (let k = 0; k < pool.length; k++) { const c = pool[k]; if (!c) continue; const uses = used[nameOf(c[3])] || 0, sc = c[0] - .7 * uses; if (uses < 3 && sc > bs && taken.every((t) => dist(t, c[1], c[2]) > 24 * K)) { bs = sc; bi = k; } }
      if (bi < 0) break;
      const c = pool[bi]; pool[bi] = null; const nm = nameOf(c[3]); used[nm] = (used[nm] || 0) + 1;
      const t = { x: c[1], y: c[2], ks: c[3], name: nm, tier: 'town' }; towns.push(t); taken.push(t);
    }
    let order = 0;
    for (const t of towns) { if (t.tier !== 'town') continue; const i = idx(t.x, t.y); order++; if (h[i] > .26 && (t.ks.includes('earth') || t.ks.includes('cold'))) t.tier = 'fort'; else if (order > 11) t.tier = 'hamlet'; }
    const allTowns = academy ? [academy, ...towns] : towns;
    const { roads: rs, onRoad } = roads(world, allTowns, seed);
    world.roads = rs; world.onRoad = onRoad; world.towns = towns; world.academy = academy; world.wells = wells;
    world.routes = seaRoutes(world, allTowns, seed);
    // shrines: small, off the road
    const shrines = [];
    for (let t = 0; t < 4000 && shrines.length < 8; t++) { const x = 8 + Math.floor(R() * (GW - 16)), y = 8 + Math.floor(R() * (GH - 16)), i = idx(x, y); if (!dryLand(i) || h[i] > .36 || onRoad[i] || allTowns.some((a) => dist(a, x, y) < 16 * K) || shrines.some((a) => dist(a, x, y) < 30 * K)) continue; shrines.push({ x, y }); }
    world.shrines = shrines;
    // the big field regions, for their names on the map
    const regions = [];
    for (const [k] of FIELDS) { if (k === 'arcane' || k === 'water') continue; const m = new Uint8Array(N); for (let i = 0; i < N; i++) { if (sea[i] || F[k][i] < .55) continue; let top = true; for (const [o] of FIELDS) if (o !== k && o !== 'water' && F[o][i] > F[k][i] + .001) top = false; if (top) m[i] = 1; } const c = components(m); c.list.sort((a, b) => b.length - a.length); if (c.list[0] && c.list[0].length >= 120 * K * K) regions.push({ k, ...axis(c.list[0]), n: c.list[0].length }); }
    world.regions = regions;
    world.ms = Math.round(performance.now() - T0);
    return world;
  }

  root.FieldGen = { GW, GH, N, K, TAU, FIELDS, generate, fbm, vnoise, hash, rng, cl, idx, chaikin };
})(window);
