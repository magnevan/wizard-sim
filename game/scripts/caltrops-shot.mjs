// Three caltrops fields (Ice Place) of radius 2, 3 and 4 u beside the wizard, to judge how the trap reads.
// Usage (after npm run build): node scripts/caltrops-shot.mjs [--out shots/caltrops.png]
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : 'shots/caltrops.png';
mkdirSync(dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await p.setViewport({ width: 1920, height: 1080 });
  await p.goto(`${BASE}?timerloop=1&debug=0#survive`);
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
  await sleep(600);
  await p.evaluate(() => {
    const w = window.wizardSim.world, z = w.zones, b = w.bodies, px = b.x[0], py = b.y[0];
    const put = (k, x, y, r) => { z.type[k] = 8; z.owner[k] = 0; z.x[k] = x; z.y[k] = y; z.r[k] = r; z.life[k] = 6000; z.timer[k] = 0; z.scale[k] = 1; z.look[k] = 10; };
    put(0, px - 7, py - 3, 2); put(1, px, py - 4, 3); put(2, px + 8, py - 3, 4);
  });
  await sleep(1500);
  await p.screenshot({ path: OUT });
  console.log('screenshot:', OUT);
} finally { await browser.close(); stop(); }
