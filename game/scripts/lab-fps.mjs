// usage: node scripts/lab-fps.mjs [seconds] [--page kit3d] [--query "ao=0"]
// Measures a lab page's frame rate (packages/client/<page>.html, default kit3d) on this machine's real GPU, not the
// software renderer lab-shot.mjs uses: loads it at 1920 x 1080 in a headed Chrome with hardware acceleration, waits
// for window.__ready, holds W, D, S, A in turn so the camera moves, and reports frames per second and frame-time
// percentiles from requestAnimationFrame. The page must draw every frame and move on WASD for the numbers to mean
// anything (kit3d.html, as of 2026-11-23, draws only on change and has no keys). Needs a real GPU and a desktop. Dev server on DEV_PORT (default 5292).
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const query = takeOpt(args, 'query', ''), pageName = takeOpt(args, 'page', 'kit3d');
const seconds = Number(args[0] ?? 10);
const lab = await startLab(pageName, Number(process.env.DEV_PORT) || 5292);
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: false, args: ['--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(lab.url(query), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await new Promise((r) => setTimeout(r, 2000)); // warm up
  const walk = (async () => { const keys = ['w', 'd', 's', 'a']; for (let t = 0; t < seconds; t++) { const k = keys[t % 4]; await page.keyboard.down(k); await new Promise((r) => setTimeout(r, 1000)); await page.keyboard.up(k); } })();
  const times = await page.evaluate((ms) => new Promise((done) => {
    const out = []; let last = performance.now(); const end = last + ms;
    const f = (t) => { out.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else done(out); };
    requestAnimationFrame(f);
  }), seconds * 1000);
  await walk;
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`page: ${pageName}.html${query ? '?' + query : ''}`);
  console.log(`gpu: ${gpu}`);
  console.log(`frames: ${times.length} in ${seconds}s, mean ${(1000 / mean).toFixed(1)} fps; frame time median ${pct(0.5).toFixed(1)} ms, p95 ${pct(0.95).toFixed(1)} ms, p99 ${pct(0.99).toFixed(1)} ms`);
  await browser.close();
} finally { lab.stop(); }
