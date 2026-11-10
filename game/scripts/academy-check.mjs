// The Academy (the art test room) in real Chrome: it loads from its #anchor, every prop set's images
// arrive, the O and I keys and the URL params switch the art without touching the sim, a wizard can't
// walk through a blocking prop, and nothing errors. Screenshots of each set and wizard detail.
// Usage (after npm run build): node scripts/academy-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/academy'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  p.on('requestfailed', (r) => fail('request failed: ' + r.url()));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#academy`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 20000, polling: 100 });
  await sleep(500);
  const st = () => p.evaluate(() => { const g = window.wizardSim; return { set: g.view.props.set, hd: g.view.wizardHd, ready: g.view.props.ready, count: g.view.props.count, room: g.world.def.id, url: location.search, x: g.world.bodies.x[0], y: g.world.bodies.y[0] }; });
  const shot = (name) => p.screenshot({ path: join(out, name + '.png') });
  const first = await st();
  console.log('loaded', first);
  if (first.room !== 'academy' || first.set !== 'lean' || first.hd) fail('the room should open on the lean set and today\'s wizard');
  await shot('lean');

  for (const want of ['simple', 'code', 'lean']) {
    await p.keyboard.press('KeyO');
    await p.waitForFunction(() => window.wizardSim.view.props.ready, { timeout: 8000, polling: 50 });
    await sleep(200);
    const s = await st();
    if (s.set !== want) fail(`O should move to ${want}, is on ${s.set}`);
    if (want !== 'lean') await shot(want);
  }
  await p.keyboard.press('KeyI');
  await sleep(300);
  if (!(await st()).hd) fail('I should turn the detailed wizard on');
  await shot('lean-hd');
  await p.keyboard.press('KeyI');

  // Walking: from start 0, due north into the armillary's row would pass; aim at the throne from the east and hold.
  const walk = await p.evaluate(async () => {
    const g = window.wizardSim, w = g.world, b = w.bodies;
    // a body put next to a blocking prop's wall and pushed by the sim's own collision stays out of it
    const k = w.def.rock.length, x = (w.terrain.x1[k] + w.terrain.x2[k]) / 2, y = w.terrain.y1[k];
    b.x[0] = x; b.y[0] = y + 0.2;
    await new Promise((r) => setTimeout(r, 300));
    return { x, y, by: b.y[0], need: b.r[0] + 0.25 };
  });
  if (Math.abs(walk.by - walk.y) < walk.need - 0.02) fail(`a wizard stood ${Math.abs(walk.by - walk.y)} u from a prop's wall (needs ${walk.need})`);
  console.log('collision', walk);

  // Enemies round the furniture, for the depth sort.
  await p.evaluate(() => { window.wizardSim.tune.godMode = true; window.wizardSim.startWave(3); });
  await sleep(4500);
  await shot('wave');

  // Elsewhere: no label, no O or I
  await p.keyboard.press('Digit1');
  await sleep(500);
  await p.keyboard.press('KeyO');
  await sleep(100);
  const away = await st();
  if (away.room !== 'sanctum' || away.count !== 0 || away.set !== 'lean') fail('leaving the Academy should clear its props, and O should do nothing elsewhere ' + JSON.stringify(away));
  await p.close();

  const q = await browser.newPage();
  q.on('pageerror', (e) => fail('page error: ' + e.message));
  await q.setViewport({ width: 1280, height: 800 });
  await q.goto(`${BASE}?timerloop=1&debug=0&props=code&wizard=hd#academy`);
  await q.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 20000, polling: 100 });
  const s = await q.evaluate(() => ({ set: window.wizardSim.view.props.set, hd: window.wizardSim.view.wizardHd }));
  if (s.set !== 'code' || !s.hd) fail('the URL should pick the set and wizard: ' + JSON.stringify(s));
  await q.close();
} finally {
  await browser.close();
  stop();
}
console.log(process.exitCode ? 'academy check FAILED' : 'academy check ok');
