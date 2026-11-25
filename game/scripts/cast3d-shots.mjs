// usage: node scripts/cast3d-shots.mjs [out-dir] [--gpu] [--only name,name]   (npm run shot:cast3d)
// The stand-ins' shots (the port to 3D, step 2: every spell readable): the 3D VFX Lab's contact sheets (cast3d.html
// ?sheet=<group>, one tile per form x lead element), a telegraph sheet (scene=attack), and a fight in the court on the
// 3D page (index.html ?shot=fight, at the game's 30 u), as <name>.png in out-dir (default shots/port-3d/cast).
// Serves the dev server on DEV_PORT (default 5294), or uses DEV_URL (e.g. http://localhost:5196) if one is running.
// Software GL (SwiftShader) by default; --gpu asks Chrome for the real GPU (D3D11).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
if (gpu) args.splice(args.indexOf('--gpu'), 1);
const only = takeOpt(args, 'only', '');
const out = resolve(args.shift() ?? 'shots/port-3d/cast');
mkdirSync(out, { recursive: true });

const GROUPS = ['channels', 'missiles', 'areas', 'places', 'walls', 'self', 'sigil', 'weapons', 'previews'];
const SHOTS = [
  ...GROUPS.map((g) => ({ name: `sheet-${g}`, page: 'cast3d', q: `sheet=${g}&cols=4&tile=480x300`, w: 1920, h: 900 })),
  { name: 'sheet-telegraphs', page: 'cast3d', q: 'spells=wait/wait|0.3;wait/wait|0.5;wait/wait|0.7;wait/wait|0.9&scene=attack&cols=4&tile=480x300', w: 1920, h: 300 },
  { name: 'hit-check', page: 'cast3d', q: 'spells=water,water,water/force|0.8;arcane,arcane/force|0.8;earth,fire/force|0.12;fire,fire/area|0.15&hit=1&cols=4&tile=480x300', w: 1920, h: 300 },
  // at the game's distance (30 u): one of each family
  { name: 'sheet-at-30', page: 'cast3d', q: 'spells=water,water,water/force|0.8;arcane,arcane/force|0.8;earth,fire/force|0.12;fire,fire/area|0.15;water,water/place|0.5;shield,fire/drag@1,-2.5|0.5;sigil,fire/force|1.2;earth,earth/weapon|0.1&view=30&cols=4&tile=480x300', w: 1920, h: 600 },
  { name: 'court-fight', page: 'index', q: 'shot=fight&cam=30', w: 1920, h: 1080 },
].filter((s) => !only || only.split(',').includes(s.name));

const ext = process.env.DEV_URL;
const lab = ext ? { url: (qs) => `${ext}/${qs}`, stop: () => {} } : await (async () => {
  const l = await startLab('cast3d', Number(process.env.DEV_PORT) || 5294);
  return { url: (qs) => l.url('').replace(/cast3d\.html.*$/, '') + qs, stop: l.stop };
})();
try {
  const gl = gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: gl });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  for (const s of SHOTS) {
    const t0 = Date.now();
    await page.setViewport({ width: s.w, height: s.h });
    await page.goto(lab.url(`${s.page}.html?${s.q}`), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 900000, polling: 2000 });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error(`${s.name}: ${err}`);
    await new Promise((r) => setTimeout(r, 500));
    const file = `${out}/${s.name}.png`;
    await page.screenshot({ path: file });
    console.log('shot', s.name, '->', file, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
} finally { lab.stop(); }
