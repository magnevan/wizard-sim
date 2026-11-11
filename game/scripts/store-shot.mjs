// The stored spell's sigil over the wizard: armed (waiting for a spell) on the left of the frame, holding one on the right.
// Usage (after npm run build): node scripts/store-shot.mjs [--out shots/store.png]
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : 'shots/store.png';
mkdirSync(dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#survive`);
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
  await sleep(600);
  for (const [held, out] of [[0, OUT.replace('.png', '-armed.png')], [1, OUT]]) {
    await p.evaluate((held) => {
      const s = window.wizardSim.world.seats;
      s.storeArm[0] = held ? 0 : 1; s.storeLen[0] = held ? 2 : 0; s.storeQ[0] = 8; s.storeQ[1] = 8; s.storeCast[0] = 2;
    }, held);
    await sleep(900);
    await p.screenshot({ path: out, clip: { x: 440, y: 200, width: 400, height: 300 } });
    console.log('screenshot:', out);
  }
} finally { await browser.close(); stop(); }
