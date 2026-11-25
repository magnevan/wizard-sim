// usage: node scripts/perf3d.mjs [--gpu] [--out dir] [--query "k=v&k=v"] [--frames 60]   (npm run perf:3d builds first)
// The 3D page's weight on the built client: play3d.html's plaza shot at the default 26 u camera, 1920 x 1080. Prints
// and writes <out>/perf3d[-gpu].json with draw calls and triangles per frame (shadow pass included), the frame's script
// time (view.draw, as play3d-shot.mjs's perf note) and its whole time with the GPU waited on (render + a 1 px readback,
// so it counts the GPU's work), the bytes the first load moved (all responses up to the scene being drawn), the time
// from navigation to a built scene, and dist/'s size. A screenshot goes beside it (plaza-26.png).
// Serves dist/ with vite preview on PREVIEW_PORT (default 4198, not the checks' 4187). --gpu uses the real GPU (D3D11);
// without it, SwiftShader: script times are still meaningful, GPU times aren't.
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

process.env.PREVIEW_PORT ??= '4198';
const { BASE, CLIENT, findChrome, startPreview } = await import('./serve.mjs');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const gpu = process.argv.includes('--gpu');
const out = resolve(arg('out', 'shots/port-3d/weight'));
const query = arg('query', '');
const syncFrames = Number(arg('frames', 60));
mkdirSync(out, { recursive: true });

const dirBytes = (d) => readdirSync(d).reduce((a, n) => { const p = join(d, n), s = statSync(p); return a + (s.isDirectory() ? dirBytes(p) : s.size); }, 0);

const stop = await startPreview();
const r = {};
try {
  const gl = gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: gl });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.setViewport({ width: 1920, height: 1080 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let bytes = 0, files = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; files++; });
  const t0 = Date.now();
  await page.goto(`${BASE}play3d.html?shot=plaza&cam=26&perf=1${query ? '&' + query : ''}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 500 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  const pageMs = Date.now() - t0, loadBytes = bytes, loadFiles = files;
  await page.screenshot({ path: `${out}/plaza-26${gpu ? '-gpu' : ''}.png` });
  const p = await page.evaluate((n) => {
    const f = window.__perf, avg = (a) => +(a.slice(-120).reduce((x, y) => x + y, 0) / Math.min(120, a.length)).toFixed(2);
    // the whole frame with the GPU waited on: render, then read one pixel back (it can't come before the GPU is done)
    const v = window.wizardSim.view, g = v.renderer.getContext(), px = new Uint8Array(4), times = [];
    for (let k = 0; k < n + 10; k++) {
      const s = performance.now();
      v.render(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      if (k >= 10) times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    return { drawMs: avg(f.frame), renderMs: avg(f.render), gpuFrameMs: +times[times.length >> 1].toFixed(2), ...f.info(), sceneLoadMs: Math.round(f.loadMs), occluders: f.occluders };
  }, syncFrames);
  Object.assign(r, { gl: gpu ? 'gpu (d3d11)' : 'swiftshader', ...p, firstLoadMB: +(loadBytes / 1e6).toFixed(1), files: loadFiles, toSceneS: +(pageMs / 1000).toFixed(1), distMB: +(dirBytes(join(CLIENT, 'dist')) / 1e6).toFixed(1) });
  writeFileSync(`${out}/perf3d${gpu ? '-gpu' : ''}.json`, `${JSON.stringify(r, null, 2)}\n`);
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
} finally { stop(); }
