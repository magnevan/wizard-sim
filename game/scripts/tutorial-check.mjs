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
} finally {
  await browser.close();
  stop();
}
console.log(process.exitCode ? 'tutorial check FAILED' : 'tutorial check passed');
