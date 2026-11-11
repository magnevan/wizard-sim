// The Shield art pass (2026-11-11): coated force fields side by side, the imbue's skin on a body, the stored spell armed
// and held. Usage (after npm run build): node scripts/coat-shot.mjs [--out shots/coat.png] [--mood night]
// Writes <out> (the fields), <out>-imbue.png, <out>-armed.png and <out>-held.png.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : 'shots/coat.png';
const argMood = process.argv.indexOf('--mood'), MOOD = argMood > 0 ? `&mood=${process.argv[argMood + 1]}` : '';
mkdirSync(dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0${MOOD}#arena`);
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
  await sleep(600);
  // ids: water 1, life 2, shield 3, cold 4, lightning 5, arcane 6, sigil 7, fire 8, earth 9, ice 10
  await p.evaluate(() => {
    const w = window.wizardSim.world, wl = w.walls, b = w.bodies, s = w.seats, px = b.x[0], py = b.y[0], N = 10;
    const coats = [[3], [3, 8, 8], [3, 1], [3, 4], [3, 5], [3, 6], [3, 2], [3, 8, 5]];
    coats.forEach((els, k) => {
      const col = k % 4, row = Math.floor(k / 4), x = px - 9 + col * 5, y = py - 6 + row * 4;
      wl.type[k] = els.length === 1 ? 2 : 3; wl.owner[k] = 0; wl.x1[k] = x; wl.y1[k] = y; wl.x2[k] = x + 3.5; wl.y2[k] = y;
      wl.hp[k] = wl.maxHp[k] = 100; wl.born[k] = w.clock[0];
      for (let e = 0; e < N; e++) wl.els[k * N + e] = 0;
      for (const id of els) wl.els[k * N + id - 1]++;
    });
    window.__keep = setInterval(() => { s.runes[0 * N + 2] = 6; for (let k = 0; k < 8; k++) wl.hp[k] = 100; }, 50);
  });
  await sleep(1400);
  await p.screenshot({ path: OUT, clip: { x: 240, y: 120, width: 800, height: 500 } });
  console.log('screenshot:', OUT);
  // clear the fields; an imbue on the wizard (fire, then cold, strong) and the nearest enemy (lightning, weak)
  for (const [col, r, tag] of [[1, 1.6, 'imbue'], [2, 0.6, 'imbue-weak']]) {
    await p.evaluate((col, r) => {
      const w = window.wizardSim.world, b = w.bodies;
      for (let k = 0; k < 8; k++) w.walls.type[k] = 0;
      clearInterval(window.__imb);
      window.__imb = setInterval(() => { for (let c = 0; c < 5; c++) b.bless[c] = c === col ? r : 0; b.blessT[0] = 1; }, 30);
    }, col, r);
    await sleep(900);
    const out = OUT.replace('.png', `-${tag}.png`);
    await p.screenshot({ path: out, clip: { x: 540, y: 300, width: 200, height: 160 } });
    console.log('screenshot:', out);
  }
  await p.evaluate(() => clearInterval(window.__imb));
  for (const [held, tag] of [[0, 'armed'], [1, 'held']]) {
    await p.evaluate((held) => {
      const s = window.wizardSim.world.seats;
      s.storeArm[0] = held ? 0 : 1; s.storeLen[0] = held ? 3 : 0; s.storeQ[0] = 8; s.storeQ[1] = 5; s.storeQ[2] = 6; s.storeCast[0] = 2; s.storeBorn[0] = window.wizardSim.world.clock[0];
    }, held);
    await sleep(900);
    const out = OUT.replace('.png', `-${tag}.png`);
    await p.screenshot({ path: out, clip: { x: 540, y: 300, width: 200, height: 160 } });
    await p.screenshot({ path: out.replace('.png', '-hud.png'), clip: { x: 340, y: 600, width: 600, height: 200 } });
    console.log('screenshot:', out);
  }
} finally { await browser.close(); stop(); }
