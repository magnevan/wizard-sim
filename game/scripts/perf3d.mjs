// usage: node scripts/perf3d.mjs [--gpu] [--out dir] [--query "kitbatch=0"] [--name plaza] [--cam 30]   (npm run perf:3d builds first)
// The 3D page's weight on the built client: play3d.html's plaza shot with the camera at 30 u (camera3d.ts VIEW_H), 1920 x 1080. Prints and
// writes <out>/perf3d[-gpu].json:
//   calls, triangles   per frame, shadow pass included
//   drawMs             the frame loop's time in view.draw (play3d-shot.mjs's perf note); when the GPU is the bottleneck
//                      this waits on it, so it is a GPU number too
//   gpuFrameMs         frames back to back with the GPU waited on at the end: the time a frame takes with the GPU
//                      included (the best of three runs of 100, so a slow GPU clock in one run doesn't count)
//   firstLoadMB        bytes over the network until the scene is drawn (cache off)
//   toSceneS           from navigation to the scene built (KitScene.loadedAt)
//   distMB             dist/ on disk
// and a screenshot beside it, <name>[-gpu].png. Serves dist/ with vite preview on PREVIEW_PORT (default 4198, not the
// checks' 4187). --gpu uses the real GPU (D3D11); without it, SwiftShader (script times mean something, GPU times don't).
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

process.env.PREVIEW_PORT ??= '4198';
const { BASE, CLIENT, findChrome, startPreview } = await import('./serve.mjs');

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const gpu = process.argv.includes('--gpu');
const out = resolve(arg('out', 'shots/port-3d/weight'));
const query = arg('query', '');
const name = arg('name', 'plaza');
const cam = arg('cam', '30');
mkdirSync(out, { recursive: true });

const dirBytes = (d) => readdirSync(d).reduce((a, n) => { const p = join(d, n), s = statSync(p); return a + (s.isDirectory() ? dirBytes(p) : s.size); }, 0);

const stop = await startPreview();
const r = {};
try {
  const gl = gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: gl });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.setViewport({ width: 1920, height: 1080 });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let bytes = 0, files = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; files++; });
  await page.goto(`${BASE}play3d.html?shot=${name}&cam=${cam}&perf=1${query ? '&' + query : ''}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 500 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  const loadBytes = bytes, loadFiles = files;
  await page.screenshot({ path: `${out}/${name}${gpu ? '-gpu' : ''}.png` });
  const p = await page.evaluate(() => {
    const f = window.__perf, avg = (a) => +(a.slice(-120).reduce((x, y) => x + y, 0) / Math.min(120, a.length)).toFixed(2);
    const v = window.wizardSim.view, g = v.renderer.getContext(), px = new Uint8Array(4), N = 100;
    const sync = () => g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);   // can't return before the GPU is done
    for (let i = 0; i < 5; i++) v.render();
    sync();
    const runs = [];
    for (let rep = 0; rep < 3; rep++) { const s = performance.now(); for (let i = 0; i < N; i++) v.render(); sync(); runs.push((performance.now() - s) / N); }
    return { drawMs: avg(f.frame), renderMs: avg(f.render), gpuFrameMs: +Math.min(...runs).toFixed(2), ...f.info(), sceneLoadMs: Math.round(f.loadMs), loadParts: v.kit.timings, toSceneS: +((v.kit.loadedAt || 0) / 1000).toFixed(1), occluders: f.occluders };
  });
  Object.assign(r, { gl: gpu ? 'gpu (d3d11)' : 'swiftshader', cam: +cam, query, ...p, firstLoadMB: +(loadBytes / 1e6).toFixed(1), files: loadFiles, distMB: +(dirBytes(join(CLIENT, 'dist')) / 1e6).toFixed(1) });
  writeFileSync(`${out}/perf3d${gpu ? '-gpu' : ''}.json`, `${JSON.stringify(r, null, 2)}\n`);
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
} finally { stop(); }
