// Which GPU a --gpu perf run really used, and the uncapped frame rate with nothing busy on screen.
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  await p.goto(`${BASE}?perf=1&debug=0`);
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 30000, polling: 100 });
  console.log(await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);
  }));
  const fps = await p.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : done(n / 3); }; requestAnimationFrame(f); }));
  console.log('rAF per second:', fps.toFixed(1));
} finally { await browser.close(); stop(); }
