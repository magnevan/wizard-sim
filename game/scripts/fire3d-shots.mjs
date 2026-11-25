// usage: node scripts/fire3d-shots.mjs (npm run shot:fire3d --) [out-dir] [--gl gpu|soft] [--url http://localhost:5191] [--only name,name]
// Fire's shots (docs/explorations/2026-11-25-spell-concepts-fire.md, the toon-volume build): the court at the game's 30 u
// with a three-rune spray on goblins (play3d.html ?shot=fire), and the 3D effects lab (fx3d.html) at one, three and five
// runes, a sweep, the hit shapes and the floor over its life, plus the VFX Lab (cast3d.html), as <name>.png in out-dir
// (default shots/port-3d/fire). Uses a dev server already running at --url (lab pages aren't in the build), else starts
// its own on 5195 and stops only that one. --gl gpu (default) renders on the machine's GPU; soft is SwiftShader.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const GL = takeOpt(args, 'gl', 'gpu'), URL0 = takeOpt(args, 'url', ''), only = takeOpt(args, 'only', '').split(',').filter(Boolean);
const out = resolve(args.shift() ?? 'shots/port-3d/fire');
mkdirSync(out, { recursive: true });

const STRIP = (times, view = 13) => `times=${times}&tile=560x420&view=${view}`;
/** name -> [page, query, width, height]; strips size themselves (tile × times). */
const SHOTS = {
  'court-n3': ['play3d', 'shot=fire&cam=30&local=0', 1920, 1080],
  'court-n3-close': ['play3d', 'shot=fire&cam=16&local=0', 1920, 1080],
  'lab-n3-game': ['fx3d', 'n=3&t=1&view=30', 1600, 900],
  'lab-n1-strip': ['fx3d', `n=1&${STRIP('0.1,0.3,0.6,1,2')}`],
  'lab-n3-strip': ['fx3d', `n=3&${STRIP('0.1,0.3,0.6,1,2')}`],
  'lab-n5-strip': ['fx3d', `n=5&${STRIP('0.1,0.3,0.6,1,2')}`],
  'lab-runes': ['fx3d', '', 0, 0],
  'lab-sweep-n3': ['fx3d', `n=3&sweep=1&${STRIP('0.4,0.6,0.8,1,1.2')}`],
  'lab-hit-n3': ['fx3d', 'n=3&t=0.8&hit=1&view=13', 1600, 900],
  'lab-floor-n3': ['fx3d', `n=3&cast=floor&${STRIP('-0.05,0.05,0.15,0.3,0.6,8,15.6,16.4,16.9,18.5', 11)}`],
  'lab-floor-close': ['fx3d', 'n=3&cast=floor&t=3&view=7&x=0.5&y=0', 1600, 900],
  'lab-floor-game': ['fx3d', 'n=3&cast=floor&t=3&view=30', 1600, 900],
  'lab-both-n5-game': ['fx3d', 'n=5&cast=both&t=1&view=30', 1600, 900],
  'cast3d-crowd-n3': ['cast3d', 'spell=fire,fire,fire&form=force&t=0.8&view=30', 1600, 900],
  'cast3d-crowd-n5': ['cast3d', 'spell=fire,fire,fire,fire,fire&form=force&t=0.8&view=30', 1600, 900],
};
// one, three and five runes side by side: three frames into one row
const RUNES = [1, 3, 5].map((n) => [`lab-n${n}-t1`, ['fx3d', `n=${n}&t=1&view=16`, 800, 600]]);

const lab = URL0 ? { url: (page, qs) => `${URL0}/${page}.html?${qs}`, stop: () => {} } : await (async () => {
  const l = await startLab('fx3d', 5195);
  return { url: (page, qs) => l.url('').replace(/fx3d\.html.*$/, '') + `${page}.html?${qs}`, stop: l.stop };
})();
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: glArgs });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  page:', m.text().slice(0, 300)); });
  const shoot = async (name, [pg, qs, w, h]) => {
    const p = new URLSearchParams(qs), n = (p.get('times') ?? '').split(',').filter(Boolean).length;
    const [tw, th] = (p.get('tile') ?? '640x480').split('x').map(Number);
    await page.setViewport(n ? { width: tw * n, height: th } : { width: w, height: h });
    const t = Date.now();
    await page.goto(lab.url(pg, qs), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 500 });
    await new Promise((r) => setTimeout(r, 400));
    const file = `${out}/${name}.png`;
    await page.screenshot({ path: file });
    console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(1)} s -> ${file}`);
    return file;
  };
  for (const [name, s] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    if (name === 'lab-runes') { for (const [n2, s2] of RUNES) await shoot(n2, s2); continue; }
    await shoot(name, s);
  }
  await browser.close();
} finally { lab.stop(); }
