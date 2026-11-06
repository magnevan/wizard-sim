// The tutorial in real Chrome: key 4 switches into it in place and key 1 back out; the end card's
// arches switch rooms (standing in the Survive arch lands you in Survive). No page errors.
// Usage (after npm run build): node scripts/tutorial-check.mjs
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  await p.setViewport({ width: 1280, height: 800 });
  const st = () => p.evaluate(() => { const g = window.wizardSim, t = g.world.tut; return { tut: !!t, beat: t ? t.state[0] : -1, run: !!g.world.run, hash: location.hash, tick: g.world.clock[0], bodies: Array.from(g.world.bodies.kind).filter((k) => k).length }; });

  await p.goto(`${BASE}?timerloop=1#sanctum`);
  await p.waitForFunction(() => !!window.wizardSim?.world, { timeout: 20000, polling: 100 });
  await sleep(500);
  await p.keyboard.press('Digit4');
  await sleep(800);
  const a = await st();
  console.log('after 4', a);
  if (!a.tut || a.beat !== 1) fail('key 4 did not open the tutorial at its first beat');
  await p.keyboard.press('Digit1');
  await sleep(800);
  const b = await st();
  console.log('after 1', b);
  if (b.tut) fail('key 1 did not leave the tutorial');

  // the end card: stand in the Survive arch (a dev poke of the position; the sim does the rest)
  await p.goto(`${BASE}?timerloop=1&debug=0#tutorial-20`); // a new query: a real load, not a hash change
  await p.waitForFunction(() => !!window.wizardSim?.world?.tut, { timeout: 20000, polling: 100 });
  await sleep(600);
  const c = await st();
  console.log('end card', c);
  if (c.beat !== 20) fail('#tutorial-20 did not start at the end card');
  for (let k = 0; k < 40; k++) {
    await p.evaluate(() => { const w = window.wizardSim.world; if (w.tut) { w.bodies.x[0] = 4; w.bodies.y[0] = -1.5; } });
    await sleep(50);
  }
  await sleep(800);
  const d = await st();
  console.log('after the arch', d);
  if (d.tut || !d.run) fail('the Survive arch did not switch to Survive');

  // every beat draws and plays in the page: each one starts at its own beat, the bot plays a moment, no errors
  for (let beat = 1; beat <= 20; beat++) {
    await p.goto(`${BASE}?timerloop=1&debug=0&room=tutorial&autoplay=1&beat=${beat}&n=${beat}`);
    await p.waitForFunction(() => !!window.wizardSim?.world?.tut, { timeout: 20000, polling: 100 });
    await sleep(1200);
    const e = await st();
    if (e.beat !== beat) fail(`beat ${beat}: the page shows beat ${e.beat}`);
  }
  console.log('every beat loaded and played');

  // the bot plays a short beat through to the next in the page (the calm, the ready stone, the arrivals, the arch)
  await p.goto(`${BASE}?timerloop=1&debug=0&room=tutorial&autoplay=1&beat=6`);
  await p.waitForFunction(() => !!window.wizardSim?.world?.tut, { timeout: 20000, polling: 100 });
  const t0 = Date.now();
  let f = await st();
  while (f.beat === 6 && Date.now() - t0 < 40000) { await sleep(500); f = await st(); }
  console.log('after the hands test', f, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (f.beat !== 7) fail('the bot did not play the hands test through to the Fire beat in the page');
} finally {
  await browser.close();
  stop();
}
console.log(process.exitCode ? 'tutorial check FAILED' : 'tutorial check passed');
