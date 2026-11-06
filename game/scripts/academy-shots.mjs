// Screenshots of the Academy for the art trial page: the room in each prop set and wizard detail, a close
// view of a wizard in front of and behind a desk, and a fight among the furniture.
// Usage (after npm run build): node scripts/academy-shots.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const i = process.argv.indexOf('--out');
const out = resolve(i > 0 ? process.argv[i + 1] : 'shots/academy');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (query, size = [1280, 800]) => {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.setViewport({ width: size[0], height: size[1] });
  await p.goto(`${BASE}?timerloop=1&debug=0${query}#academy`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 20000, polling: 100 });
  // past the first seconds, or the room's walls still show the dust of rising; then the sim stands still
  await p.waitForFunction(() => window.wizardSim.world.clock[0] > 150, { timeout: 30000, polling: 100 });
  await p.evaluate(() => { window.wizardSim.tune.paused = true; });
  await sleep(300);
  return p;
};
/** Stands seat 0 at x, y facing the camera (a sim that is paused, so it stays there). */
const stand = (p, x, y) => p.evaluate((x, y) => {
  const g = window.wizardSim, b = g.world.bodies;
  b.x[0] = x; b.y[0] = y; b.face[0] = 0.25;
  g.view.beforeStep(g.world);
}, x, y);
try {
  for (const [name, q] of [['room-lean', ''], ['room-simple', '&props=simple'], ['room-code', '&props=code'], ['room-lean-hd', '&wizard=hd'], ['room-code-hd', '&props=code&wizard=hd']]) {
    const p = await open(q);
    await stand(p, 0.5, 1.6);
    await sleep(1500); // the camera settles
    await p.screenshot({ path: join(out, name + '.png') });
    await p.close();
  }
  for (const [name, q] of [['close-today', '&scale=4'], ['close-hd', '&scale=4&wizard=hd'], ['close-today-code', '&scale=4&props=code'], ['close-hd-code', '&scale=4&props=code&wizard=hd']]) {
    const p = await open(q);
    await stand(p, 7.7, 1.15);
    await sleep(1500);
    await p.screenshot({ path: join(out, name + '.png') });
    await stand(p, 6, 0.25); // in front of one desk, behind the next
    await sleep(1500);
    await p.screenshot({ path: join(out, name + '-front.png') });
    await p.close();
  }
} finally {
  await browser.close();
  stop();
}
console.log('shots in', out);
