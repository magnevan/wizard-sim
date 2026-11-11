// A ghost rune in the queue chip and a pool in debt, in the HUD.
// Usage (after npm run build): node scripts/store-shot.mjs [--out shots/ghost.png]
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : 'shots/ghost.png';
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
  await p.evaluate(() => {
    const w = window.wizardSim.world, s = w.seats;
    // Fire (paid) + a ghost Earth, and Water in debt
    s.queue[0] = 8; s.queue[1] = 9; s.queueLen[0] = 2; s.owe[0] = 0; s.owe[1] = 1;
    s.runes[8] = 0.4; s.runes[0] = -0.7;
  });
  await sleep(400);
  await p.screenshot({ path: OUT, clip: { x: 440, y: 640, width: 400, height: 160 } });
  console.log('screenshot:', OUT);
} finally { await browser.close(); stop(); }
