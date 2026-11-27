// usage: node scripts/play3d-shot.mjs [out-dir] [--gpu] [--only name,name]   (npm run shot:3d)
// The 3D page's step 0 shots (index.html, docs/explorations/2026-11-25-port-3d-plan.md): the court at several camera
// distances with two wizards and six goblins standing on the plaza, and a wizard behind the great hall with fading on
// and off, at 1920 x 1080, as <name>.png in out-dir (default shots/port-3d/view). Then a perf note: frame and render
// time, draw calls and triangles, load time and MB, written to perf.json there.
// Serves the dev server on DEV_PORT (default 5293), or uses DEV_URL (e.g. http://localhost:5192) if one is running.
// Software GL (SwiftShader) by default, which works anywhere but is slow; --gpu asks Chrome for the real GPU (D3D11).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
if (gpu) args.splice(args.indexOf('--gpu'), 1);
const only = takeOpt(args, 'only', '');
const out = resolve(args.shift() ?? 'shots/port-3d/view');
mkdirSync(out, { recursive: true });

// The pixel game shows ~270 art px of height at 1080p (camera.ts fit: scale 4), at PPU 16 px/u with the ground
// squashed by FY 0.5: 270 / (16 * 0.5) = 33.75 u of ground top to bottom. Its play area, between the 26 px sky strip
// and the 74 px rune HUD, is (270 - 26 - 74) / 8 = 21.25 u.
const SHOTS = [
  { name: 'plaza-20', q: 'shot=plaza&cam=20' },
  { name: 'plaza-26', q: 'shot=plaza&cam=26' },
  { name: 'plaza-34', q: 'shot=plaza&cam=34' },
  { name: 'plaza-pixel-full-33.75', q: 'shot=plaza&cam=33.75' },
  { name: 'plaza-pixel-play-21.25', q: 'shot=plaza&cam=21.25' },
  { name: 'wall-fade', q: 'shot=wall&cam=26&local=0' },
  { name: 'wall-nofade', q: 'shot=wall&cam=26&local=0&fade=0' },
  { name: 'fire-spray', q: 'shot=fire&cam=26&local=0' },
  // the HUD over the 3D view (view3d/hud3d.ts): the rune bar with a queue, a hurt burning wizard, bars, arrows off screen
  { name: 'hud-26', q: 'shot=hud&cam=26&local=0' },
  // the practice ground (out-dir shots/port-3d/practice, --only practice-26,practice-34,practice-fire)
  { name: 'practice-26', q: 'shot=practice&cam=26' },
  { name: 'practice-34', q: 'shot=practice&cam=34' },
  { name: 'practice-fire', q: 'shot=practice-fire&cam=26&local=0' },
  // the infirmary's lawn (--only infirmary-20): the natural ground in the game, not only in kit3d.html
  { name: 'infirmary-20', q: 'shot=infirmary&cam=20' },
  // the perf note: 240 frames at the default distance (times are the last 120)
  { name: 'perf-plaza-26', q: 'shot=plaza&cam=26&perf=1' },
].filter((s) => !only || only.split(',').includes(s.name));

const ext = process.env.DEV_URL;
const lab = ext ? { url: (qs) => `${ext}/index.html?${qs}`, stop: () => {} } : await startLab('index', Number(process.env.DEV_PORT) || 5293);
const perf = {};
try {
  const gl = gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: gl });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.setViewport({ width: 1920, height: 1080 });
  for (const s of SHOTS) {
    const t0 = Date.now();
    await page.goto(lab.url(s.q), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 2000 });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error(`${s.name}: ${err}`);
    await new Promise((r) => setTimeout(r, 500));
    const file = `${out}/${s.name}.png`;
    await page.screenshot({ path: file });
    const p = await page.evaluate(() => {
      const f = window.__perf, avg = (a) => +(a.slice(-120).reduce((x, y) => x + y, 0) / Math.min(120, a.length)).toFixed(1);
      return { frameMs: avg(f.frame), renderMs: avg(f.render), ...f.info(), loadMs: Math.round(f.loadMs), loadMB: +(f.loadBytes / 1e6).toFixed(1), occluders: f.occluders, faded: f.faded() };
    });
    perf[s.name] = { ...p, pageMs: Date.now() - t0 };
    console.log('shot', s.name, '->', file, JSON.stringify(perf[s.name]));
  }
  perf.gl = gpu ? 'gpu (d3d11)' : 'swiftshader';
  writeFileSync(`${out}/perf${gpu ? '-gpu' : ''}.json`, `${JSON.stringify(perf, null, 2)}\n`);
  await browser.close();
} finally { lab.stop(); }
