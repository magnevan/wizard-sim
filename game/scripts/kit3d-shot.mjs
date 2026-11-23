// usage: node scripts/kit3d-shot.mjs <out-dir> [x,y ...] [--query "pitch=52&view=18"]
// Screenshots of the stylised-3D spike page (packages/client/kit3d.html) at 1920 x 1080, one per spot (world x,y; the
// page's own start when none). Runs the Vite dev server on DEV_PORT (default 5291), since the page isn't in the build.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CLIENT, findChrome } from './serve.mjs';

const args = process.argv.slice(2);
const qi = args.indexOf('--query'), query = qi >= 0 ? args.splice(qi, 2)[1] : '';
const out = resolve(args.shift() ?? 'shots/world3d');
const spots = args.length ? args.map((s) => s.split(',').map(Number)) : [null];
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.DEV_PORT) || 5291;
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); else dev.kill(); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/kit3d.html`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  for (const [n, s] of spots.entries()) {
    const qs = [s ? `x=${s[0]}&y=${s[1]}` : '', query].filter(Boolean).join('&');
    await page.goto(`http://localhost:${PORT}/kit3d.html${qs ? '?' + qs : ''}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${out}/kit-${String(n + 1).padStart(2, '0')}.png` });
    console.log('shot', n + 1, s ?? 'start');
  }
  await browser.close();
} finally { stop(); }
