// usage: node scripts/world3d-fps.mjs [seconds] [--query "ao=0"]
// Measures the stylised-3D spike's frame rate on this machine's real GPU (not the software renderer the shot script
// uses): loads world3d.html at 1920 x 1080 in Chrome with hardware acceleration, waits for the models, walks the wizard
// in a loop so the camera moves, and reports frames per second and frame-time percentiles from requestAnimationFrame.
import { spawn, spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CLIENT, findChrome } from './serve.mjs';

const args = process.argv.slice(2);
const qi = args.indexOf('--query'), query = qi >= 0 ? args.splice(qi, 2)[1] : '';
const seconds = Number(args[0] ?? 10);
const PORT = Number(process.env.DEV_PORT) || 5292;
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); else dev.kill(); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/world3d.html`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: false, args: ['--window-size=1920,1080', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`http://localhost:${PORT}/world3d.html${query ? '?' + query : ''}`, { waitUntil: 'load', timeout: 120000 });
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
  console.log(`gpu: ${gpu}`);
  console.log(`frames: ${times.length} in ${seconds}s, mean ${(1000 / mean).toFixed(1)} fps; frame time median ${pct(0.5).toFixed(1)} ms, p95 ${pct(0.95).toFixed(1)} ms, p99 ${pct(0.99).toFixed(1)} ms`);
  await browser.close();
} finally { stop(); }
