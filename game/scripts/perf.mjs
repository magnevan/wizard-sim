// Performance numbers: the sim in node (perf-sim.mjs), then busy scenes in headless Chrome, in real time.
// Per scene: main-thread ms per frame (sim, help previews, view.draw, Pixi's render), WebGL draw calls
// per frame, and allocated bytes per frame (sampled by the heap profiler, so it counts what GC collects).
// Usage: npm run perf   (builds first)  or  node scripts/perf.mjs [--secs 12] [--only arena] [--no-sim]
//        [--profile dir]  also writes a .cpuprofile per scene (build with `npx vite build --minify false`
//        in packages/client for readable function names)
//        [--shots dir]    a screenshot per scene at the end (for before/after comparisons)
//        [--sound]        press a key first, so the sound runs too (it only starts on input)
//        [--size 1920x1080] the page size (default 1280x800; the pixel scale follows it, so the view's size in art px does)
//        [--query lighting=0] extra URL parameters, to compare with and without something
//        [--gpu]          use this machine's real graphics card with the frame-rate cap off, so fps measures the whole frame
//        [--no-heap]      skip the allocation profiler, which slows the page: use it when fps is what you're after
// Without --gpu, SwiftShader renders on the CPU in another process, so the GPU side isn't measured: the numbers are
// what the page's own JavaScript costs. Compare runs on one machine; absolute values vary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
import { simPerf } from './perf-sim.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const has = (name) => process.argv.includes('--' + name);
const secs = Number(arg('secs', 12));
const only = arg('only', '');
const profileDir = arg('profile', '');
const shotsDir = arg('shots', '');
const [vw, vh] = arg('size', '1280x800').split('x').map(Number);
const query = arg('query', '');
const GL = has('gpu')
  ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each scene: a URL, and what to do once the page is up (before the measured window). */
const SCENES = [
  { name: 'arena', url: '?autoplay=1', setup: async (p) => { await p.evaluate(() => { window.wizardSim.tools.godMode = true; window.wizardSim.startWave(6); }); } },
  {
    name: 'survive-w12', url: '?autoplay=1',
    setup: async (p) => {
      await p.keyboard.press('Digit3'); // Survive, in place (bots keep playing)
      await sleep(300);
      await p.evaluate(() => { const g = window.wizardSim; g.tools.godMode = true; g.tools.infiniteRunes = true; g.startWave(12); });
    },
  },
  { name: 'help-open', url: '?autoplay=1&help=1&helpq=fire,arcane', setup: async (p) => { await p.evaluate(() => { window.wizardSim.tools.godMode = true; window.wizardSim.startWave(4); }); } },
  { name: 'tutorial', url: '?room=tutorial&autoplay=1' },
  { name: 'academy', url: '?room=academy&autoplay=1', setup: async (p) => { await p.evaluate(() => { window.wizardSim.tools.godMode = true; window.wizardSim.startWave(6); }); } },
  { name: 'academy-hd', url: '?room=academy&autoplay=1&wizard=hd', setup: async (p) => { await p.evaluate(() => { window.wizardSim.tools.godMode = true; window.wizardSim.startWave(6); }); } },
];

// Worst case: a late Survive wave, plus 150 extra lights a frame scattered over the view, many of them near walls.
SCENES.push({
  name: 'stress', url: '?autoplay=1',
  setup: async (p) => {
    await p.keyboard.press('Digit3');
    await sleep(300);
    await p.evaluate(() => {
      const g = window.wizardSim; g.tools.godMode = true; g.tools.infiniteRunes = true; g.startWave(40);
      const L = g.view.lit, cam = g.view.camera, begin = L.begin.bind(L);
      L.begin = (...a) => { begin(...a); for (let i = 0; i < 150; i++) L.light(Math.random() * cam.w, Math.random() * cam.h, 30 + Math.random() * 60, '#ff7a2a', 0.5); };
    });
  },
});

const stats = (a) => {
  if (!a.length) return { mean: 0, p50: 0, p95: 0, max: 0 };
  const s = [...a].sort((x, y) => x - y), m = s.reduce((x, y) => x + y, 0) / s.length;
  const r = (v) => +v.toFixed(2);
  return { mean: r(m), p50: r(s[s.length >> 1]), p95: r(s[Math.floor(s.length * 0.95)]), max: r(s[s.length - 1]) };
};

async function measure(browser, sc) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: vw, height: vh });
  // count WebGL draw calls and texture upload bytes (canvases re-uploaded to the GPU)
  await p.evaluateOnNewDocument(() => {
    window.__draws = 0; window.__upload = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const orig = C.prototype[fn];
        if (!orig) continue;
        C.prototype[fn] = function (...a) { window.__draws++; return orig.apply(this, a); };
      }
      for (const fn of ['texImage2D', 'texSubImage2D']) {
        const orig = C.prototype[fn];
        C.prototype[fn] = function (...a) {
          const src = a[a.length - 1];
          if (src && typeof src === 'object' && 'width' in src && 'height' in src) window.__upload += src.width * src.height * 4;
          return orig.apply(this, a);
        };
      }
    }
  });
  await p.goto(`${BASE}${sc.url}&perf=1&debug=0${has('gpu') ? '&rafloop=1' : ''}${query ? '&' + query : ''}`);
  if (has('sound')) await p.keyboard.press('KeyQ');
  await p.waitForFunction(() => !!window.wizardSim?.perf, { timeout: 30000, polling: 100 });
  await sc.setup?.(p);
  await sleep(3000); // warm up: JIT, the actor frame cache, the help previews
  const cdp = await p.createCDPSession();
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await p.evaluate(() => { const f = window.wizardSim.perf; for (const k in f) f[k].length = 0; window.__draws = 0; window.__upload = 0; });
  if (!has('no-heap')) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  if (profileDir) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const bodies = [];
  for (let t = 0; t < secs; t++) {
    await sleep(1000);
    bodies.push(await p.evaluate(() => { const k = window.wizardSim.world.bodies.kind; let n = 0; for (let i = 0; i < k.length; i++) if (k[i]) n++; return n; }));
  }
  const heap = has('no-heap') ? { head: { selfSize: 0, children: [], callFrame: { functionName: '', url: '', lineNumber: 0, columnNumber: 0 } } } : (await cdp.send('HeapProfiler.stopSampling')).profile;
  let cpu = null;
  if (profileDir) cpu = (await cdp.send('Profiler.stop')).profile;
  const res = await p.evaluate(() => ({ perf: window.wizardSim.perf, draws: window.__draws, upload: window.__upload }));
  if (shotsDir) await p.screenshot({ path: join(shotsDir, `${sc.name}.png`) });
  await p.close();

  // allocated bytes, and the top allocating functions (self size)
  let bytes = 0;
  const sites = new Map();
  const walk = (n) => {
    bytes += n.selfSize;
    const cf = n.callFrame, key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    if (n.selfSize) sites.set(key, (sites.get(key) || 0) + n.selfSize);
    for (const c of n.children) walk(c);
  };
  walk(heap.head);
  const frames = res.perf.frame.length;
  if (cpu) { mkdirSync(profileDir, { recursive: true }); writeFileSync(join(profileDir, `${sc.name}.cpuprofile`), JSON.stringify(cpu)); }
  const perStep = res.perf.sim.map((v, i) => (res.perf.steps[i] ? v / res.perf.steps[i] : NaN)).filter((v) => !Number.isNaN(v));
  return {
    name: sc.name, frames, fps: +(frames / secs).toFixed(1), bodies: Math.round(bodies.reduce((a, b) => a + b, 0) / bodies.length),
    over16: res.perf.frame.filter((v) => v > 16.7).length, frame: stats(res.perf.frame), simPerStep: stats(perStep), help: stats(res.perf.help), draw: stats(res.perf.draw), render: stats(res.perf.render),
    drawCalls: +(res.draws / Math.max(1, frames)).toFixed(1),
    uploadKBPerFrame: +(res.upload / 1024 / Math.max(1, frames)).toFixed(0),
    allocKBPerFrame: +(bytes / 1024 / Math.max(1, frames)).toFixed(1),
    topAlloc: [...sites].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${(v / 1024 / Math.max(1, frames)).toFixed(1)} KB/f  ${k}`),
    errors,
  };
}

const report = { when: new Date().toISOString(), secs };
if (!has('no-sim') && !only) {
  report.sim = await simPerf({ ticks: 6000 });
  console.log('Sim (node, ms per step()):');
  console.table(report.sim);
}
if (shotsDir) mkdirSync(resolve(shotsDir), { recursive: true });
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: [...GL, ...(has('sound') ? ['--autoplay-policy=no-user-gesture-required'] : [])] });
try {
  report.scenes = [];
  for (const sc of SCENES) {
    if (only && !only.split(',').includes(sc.name)) continue;
    const r = await measure(browser, sc);
    report.scenes.push(r);
    console.log(`\n${r.name}: ${r.fps} fps, ${r.over16} of ${r.frames} frames over 16.7 ms, ${r.bodies} bodies, ${r.drawCalls} draw calls/frame, ${r.uploadKBPerFrame} KB uploaded/frame, ${r.allocKBPerFrame} KB allocated/frame${r.errors.length ? ', ERRORS: ' + r.errors.join(' | ') : ''}`);
    console.table({ frame: r.frame, 'sim per step': r.simPerStep, help: r.help, 'view.draw': r.draw, 'pixi render': r.render });
    console.log('  top allocations:\n   ' + r.topAlloc.join('\n   '));
  }
} finally {
  await browser.close();
  stop();
}
const out = arg('out', '');
if (out) { writeFileSync(resolve(out), JSON.stringify(report, null, 2)); console.log('\nwrote', out); }
