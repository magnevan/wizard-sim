// Usage (after npm run build): node scripts/dither-check.mjs
// art/px.ts fills wide dithered shapes (ellipse, poly, glow) a row at a time with a Bayer pattern, and small ones pixel by
// pixel. This checks, in headless Chrome, that both give exactly the pixels of the plain per-pixel loops (below, as they
// were) on random shapes, sizes, alphas and canvas offsets. Exits 1 on any difference.
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  await p.goto(`${BASE}?debug=0`);
  await p.waitForFunction(() => !!window.wizardSim?.art?.px, { timeout: 60000, polling: 100 });
  const res = await p.evaluate(() => {
    const X = window.wizardSim.art.px, R = Math.round, bay = X.bay;
    // the reference: plain per-pixel loops
    const oldEllipse = (c, cx, cy, rx, ry, col, a = 1) => {
      c.fillStyle = col;
      const y0 = R(cy), iry = Math.max(0, R(ry)), irx = Math.max(0, rx);
      for (let dy = -iry; dy <= iry; dy++) {
        const k = iry ? dy / (ry + 0.5) : 0, hw = irx * Math.sqrt(Math.max(0, 1 - k * k));
        const xa = R(cx - hw), xb = R(cx + hw);
        if (a >= 1) { c.fillRect(xa, y0 + dy, Math.max(1, xb - xa), 1); continue; }
        for (let x = xa; x < Math.max(xa + 1, xb); x++) if (a > bay(x, y0 + dy)) c.fillRect(x, y0 + dy, 1, 1);
      }
    };
    const xs = [];
    const oldPoly = (c, pts, col, a = 1) => {
      if (pts.length < 3 || a <= 0) return;
      c.fillStyle = col;
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      y0 = Math.floor(y0); y1 = Math.ceil(y1);
      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5; let n = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
          if ((yi > yc) !== (yj > yc)) { const v = xi + ((yc - yi) * (xj - xi)) / (yj - yi); let k = n++; while (k > 0 && xs[k - 1] > v) { xs[k] = xs[k - 1]; k--; } xs[k] = v; }
        }
        for (let k = 0; k + 1 < n; k += 2) {
          const xa = R(xs[k]), xb = R(xs[k + 1]);
          if (xb <= xa) continue;
          if (a >= 1) c.fillRect(xa, y, xb - xa, 1);
          else for (let x = xa; x < xb; x++) if (a > bay(x, y)) c.fillRect(x, y, 1, 1);
        }
      }
    };
    const oldGlow = (c, cx, cy, r, col, a, fy = 1) => {
      if (r < 0.6 || a <= 0.02 || r > 300) return;
      c.fillStyle = col;
      const ry = r * fy, x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
      const dCore = a > 0.5 ? Math.pow(1 - Math.pow(0.5 / a, 1 / 1.6), 2) : -1, dRim = a > 0.22 ? Math.pow(1 - Math.pow(0.22 / a, 1 / 1.6), 2) : -1;
      for (let y = y0; y <= y1; y++) {
        const dy = (y + 0.5 - cy) / ry, dy2 = dy * dy;
        if (dy2 >= dRim) continue;
        const hr = Math.sqrt(dRim - dy2) * r, hc = dCore > dy2 ? Math.sqrt(dCore - dy2) * r : -1;
        const ra = Math.max(x0, Math.ceil(cx - hr - 0.5)), rb = Math.min(x1, Math.floor(cx + hr - 0.5));
        if (hc >= 0) {
          const ca = Math.ceil(cx - hc - 0.5), cb = Math.floor(cx + hc - 0.5);
          if (cb >= ca) c.fillRect(ca, y, cb - ca + 1, 1);
          for (let x = ra; x < ca; x++) if ((x + y) & 1) c.fillRect(x, y, 1, 1);
          for (let x = Math.max(cb + 1, ra); x <= rb; x++) if ((x + y) & 1) c.fillRect(x, y, 1, 1);
        } else for (let x = ra; x <= rb; x++) if ((x + y) & 1) c.fillRect(x, y, 1, 1);
      }
    };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const mk = () => { const a = X.canvas(160, 120), b = X.canvas(160, 120); return [a, b]; };
    const diff = (a, b) => { const da = a.x.getImageData(0, 0, 160, 120).data, db = b.x.getImageData(0, 0, 160, 120).data; let n = 0; for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) n++; return n; };
    const out = { ellipse: 0, poly: 0, glow: 0, cases: 0, bad: [] };
    for (let k = 0; k < 600; k++) {
      const [A, B] = mk(), ox = -Math.floor(rnd() * 40), oy = -Math.floor(rnd() * 40); // the effect canvases are translated
      for (const C of [A, B]) C.x.setTransform(1, 0, 0, 1, ox, oy);
      const cx = 20 + rnd() * 120 - ox, cy = 15 + rnd() * 90 - oy, rx = rnd() * 40, ry = rnd() * 25, col = ['#ff9a30', '#a8d4e6', '#5aa8e8'][k % 3];
      const a = k % 5 === 0 ? 1 : rnd() * 1.1 - 0.05;
      const kind = k % 3;
      if (kind === 0) { X.ellipse(A.x, cx, cy, rx, ry, col, a); oldEllipse(B.x, cx, cy, rx, ry, col, a); }
      else if (kind === 1) { const pts = Array.from({ length: 3 + (k % 5) }, () => [cx + (rnd() - 0.5) * 80, cy + (rnd() - 0.5) * 60]); X.poly(A.x, pts, col, a); oldPoly(B.x, pts, col, a); }
      else { const r = 1 + rnd() * 30, ga = rnd() * 1.2, fy = 0.4 + rnd() * 0.6; X.glow(A.x, cx, cy, r, col, ga, fy); oldGlow(B.x, cx, cy, r, col, ga, fy); }
      const n = diff(A, B);
      out.cases++;
      if (n) { out[['ellipse', 'poly', 'glow'][kind]]++; if (out.bad.length < 5) out.bad.push({ kind, n, cx, cy, rx, ry, a }); }
    }
    return out;
  });
  console.log(JSON.stringify(res));
  if (res.ellipse + res.poly + res.glow) process.exitCode = 1;
} finally { await browser.close(); stop(); }
