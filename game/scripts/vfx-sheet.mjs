// Motion you can read as stills: freeze a deterministic lab page at N times and write
//   sheet.png    the frames in a grid, labelled with their time
//   diff.png     per consecutive pair: unchanged = dim grey, changed = new colour (bright), vanished = magenta
//   metrics.json the same numbers as the printed table (plus window.vfxLab.metrics() if the page has it)
// The page is any lab honouring the `?t=<sec>` contract (clock frozen, then <html data-ready="1">); if it
// exposes window.vfxLab.setTime(t) the page loads once and steps through time instead.
// Labs are dev-server pages (not in the production build), so this starts `vite` itself and stops it after.
// Usage: npm run vfx-sheet -- --page spray-lab.html --query "kinds=fire&rows=5" --from 0.2 --to 1.6 --frames 12
//   [--crop x,y,w,h]  CSS px of the page (default: the first <canvas>)   [--scale 2] [--cols 6]
//   [--bg #rrggbb]    background colour (default: the most common colour over all frames)
//   [--out shots/vfx/<name>] [--port 5189] [--viewport 1280x800] [--thresh 8]
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CLIENT, findChrome } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const page = arg('page', 'spray-lab.html'), query = arg('query', '');
const t0 = Number(arg('from', 0)), t1 = Number(arg('to', 2)), N = Math.max(2, Number(arg('frames', 12)));
const scale = Number(arg('scale', 2)), cols = Number(arg('cols', 6)), thresh = Number(arg('thresh', 8));
const crop = arg('crop', '')?.split(',').map(Number), bg = arg('bg', '');
const [vw, vh] = arg('viewport', '1280x800').split('x').map(Number);
const PORT = Number(arg('port', process.env.VFX_PORT || 5189));
const out = resolve(arg('out', `shots/vfx/${page.replace(/\.html$/, '')}`));
const times = Array.from({ length: N }, (_, i) => +(t0 + ((t1 - t0) * i) / (N - 1)).toFixed(4));
mkdirSync(out, { recursive: true });

/** Starts the vite dev server (labs are not in the build) and resolves once the lab page answers. */
async function startDev() {
  const base = `http://localhost:${PORT}/`;
  try { await fetch(base); throw new Error(`Port ${PORT} is busy; pass --port`); } catch (e) { if (String(e.message).startsWith('Port')) throw e; }
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
  const stop = () => { if (child.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill(); } };
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(base + page)).ok) return { base, stop }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  stop();
  throw new Error('vite dev did not start on ' + base);
}

const { base, stop } = await startDev();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: vw, height: vh }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const url = (t) => `${base}${page}?${query ? query + '&' : ''}t=${t}`;
  const ready = () => p.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 30000, polling: 50 });

  // Capture: one PNG per time, clipped to the crop (or the first canvas).
  await p.goto(url(times[0]));
  await ready();
  const useApi = await p.evaluate(() => typeof window.vfxLab?.setTime === 'function');
  const clip = crop?.length === 4 ? { x: crop[0], y: crop[1], width: crop[2], height: crop[3] }
    : await p.evaluate(() => { const r = (document.querySelector('canvas') ?? document.body).getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.ceil(r.width), height: Math.ceil(r.height) }; });
  const shots = [], labMetrics = [];
  for (let i = 0; i < N; i++) {
    if (i > 0 || !useApi) {
      if (useApi) { await p.evaluate((t) => window.vfxLab.setTime(t), times[i]); }
      else if (i > 0) { await p.goto(url(times[i])); await ready(); }
    }
    labMetrics.push(useApi ? await p.evaluate(() => window.vfxLab.metrics?.() ?? null) : null);
    shots.push((await p.screenshot({ clip, encoding: 'base64' })));
  }
  if (errors.length) console.warn('page errors:', errors.slice(0, 3).join(' | '));

  // Analysis in a blank page: decode, compare and composite on canvases, so no image library is needed.
  const q = await browser.newPage();
  const res = await q.evaluate(async (shots, times, o) => {
    const { scale, cols, thresh, bg } = o;
    const imgs = await Promise.all(shots.map(async (b) => createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob())));
    const W = imgs[0].width, H = imgs[0].height;
    const c0 = new OffscreenCanvas(W, H), x0 = c0.getContext('2d', { willReadFrequently: true });
    const data = imgs.map((im) => { x0.clearRect(0, 0, W, H); x0.drawImage(im, 0, 0); return x0.getImageData(0, 0, W, H).data; });
    // background = given colour, else the most common colour pooled over all frames
    let bgc;
    if (bg) bgc = [1, 3, 5].map((k) => parseInt(bg.replace('#', '').slice(k - 1, k + 1), 16));
    else {
      const hist = new Map();
      for (const d of data) for (let i = 0; i < d.length; i += 4) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; hist.set(k, (hist.get(k) ?? 0) + 1); }
      const [best] = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
      bgc = [best >> 16, (best >> 8) & 255, best & 255];
    }
    const isBg = (d, i) => Math.abs(d[i] - bgc[0]) <= thresh && Math.abs(d[i + 1] - bgc[1]) <= thresh && Math.abs(d[i + 2] - bgc[2]) <= thresh;
    const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const LAB = 16, GAP = 4, rows = Math.ceil(times.length / cols);
    const mk = () => { const c = document.createElement('canvas'); c.width = cols * (W * scale + GAP) + GAP; c.height = rows * (H * scale + LAB + GAP) + GAP; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#16181c'; g.fillRect(0, 0, c.width, c.height); g.font = '11px monospace'; g.textBaseline = 'top'; return [c, g]; };
    const [sc, sg] = mk(), [dc, dg] = mk();
    const place = (i) => [GAP + (i % cols) * (W * scale + GAP), GAP + Math.floor(i / cols) * (H * scale + LAB + GAP)];
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tg = tmp.getContext('2d');
    const metrics = [];
    data.forEach((d, f) => {
      const prev = f ? data[f - 1] : null;
      let on = 0, chg = 0, born = 0, gone = 0, lsum = 0, minx = W, miny = H, maxx = -1, maxy = -1;
      const diff = tg.createImageData(W, H), o2 = diff.data;
      for (let i = 0; i < d.length; i += 4) {
        const bgNow = isBg(d, i), px = (i / 4) % W, py = Math.floor(i / 4 / W);
        if (!bgNow) { on++; if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py; }
        const changed = prev && (Math.abs(d[i] - prev[i]) > thresh || Math.abs(d[i + 1] - prev[i + 1]) > thresh || Math.abs(d[i + 2] - prev[i + 2]) > thresh);
        let r, g, b;
        if (changed && !bgNow) { chg++; born++; lsum += luma(d, i); r = Math.min(255, d[i] * 1.2 + 40); g = Math.min(255, d[i + 1] * 1.2 + 40); b = Math.min(255, d[i + 2] * 1.2 + 40); }
        else if (changed) { chg++; gone++; [r, g, b] = [255, 0, 220]; }
        else { const l = luma(d, i) * 0.3; [r, g, b] = [l, l, l]; }
        o2[i] = r; o2[i + 1] = g; o2[i + 2] = b; o2[i + 3] = 255;
      }
      metrics.push({ t: times[f], nonBg: on, changed: prev ? chg : null, appeared: prev ? born : null, vanished: prev ? gone : null, meanLumaChanged: prev && born ? +(lsum / born).toFixed(1) : null, bbox: on ? [minx, miny, maxx - minx + 1, maxy - miny + 1] : null });
      const [px, py] = place(f);
      sg.drawImage(imgs[f], px, py + LAB, W * scale, H * scale);
      sg.fillStyle = '#9fd'; sg.fillText(`t=${times[f].toFixed(3)}s`, px + 2, py + 2);
      tg.putImageData(diff, 0, 0);
      dg.drawImage(tmp, px, py + LAB, W * scale, H * scale);
      dg.fillStyle = '#9fd'; dg.fillText(f ? `${times[f - 1].toFixed(2)} > ${times[f].toFixed(2)}  d=${chg}` : `t=${times[0].toFixed(3)}s (base)`, px + 2, py + 2);
    });
    return { sheet: sc.toDataURL('image/png'), diff: dc.toDataURL('image/png'), metrics, bg: bgc, size: [W, H] };
  }, shots, times, { scale, cols, thresh, bg });

  const rows = res.metrics.map((m, i) => ({ ...m, lab: labMetrics[i] }));
  writeFileSync(resolve(out, 'sheet.png'), Buffer.from(res.sheet.split(',')[1], 'base64'));
  writeFileSync(resolve(out, 'diff.png'), Buffer.from(res.diff.split(',')[1], 'base64'));
  writeFileSync(resolve(out, 'metrics.json'), JSON.stringify({ page, query, clip, bg: res.bg, frameSize: res.size, useApi, frames: rows }, null, 1));
  console.log(`${page}?${query}  frame ${res.size.join('x')}  bg rgb(${res.bg})  api=${useApi}`);
  console.log('t      nonBg  changed  +new   -gone  lumaNew  bbox(x,y,w,h)');
  for (const m of rows) console.log([m.t.toFixed(3).padEnd(6), String(m.nonBg).padStart(5), String(m.changed ?? '-').padStart(8), String(m.appeared ?? '-').padStart(6), String(m.vanished ?? '-').padStart(6), String(m.meanLumaChanged ?? '-').padStart(8), ' ', m.bbox?.join(',') ?? '-', m.lab ? JSON.stringify(m.lab) : ''].join(' '));
  console.log('wrote', out);
} finally {
  await browser.close();
  stop();
}
