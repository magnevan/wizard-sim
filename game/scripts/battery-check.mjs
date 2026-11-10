// The battery (the opening's first job, an outdoor area) in real Chrome: it loads from its #anchor, every prop arrives,
// the wall stops a wizard, the gate doesn't, and nothing errors. Screenshots from around the area.
// Usage (after npm run build): node scripts/battery-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/battery'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
// plan coordinates on the Opening Segment page -> the sim's, whose origin is the area's centre
const SPOTS = { start: [42, 63], yard: [34, 46], well: [42, 60], gate: [42, 39], crews: [29, 44], stores: [62, 56], pump: [21, 50], field: [42, 25], north: [64, 8], westEdge: [8, 32], southEdge: [28, 66] };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  p.on('requestfailed', (r) => fail('request failed: ' + r.url()));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#battery`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  await sleep(1500);
  const room = await p.evaluate(() => ({ id: window.wizardSim.world.def.id, props: window.wizardSim.view.props.count, w: window.wizardSim.world.dims.w, h: window.wizardSim.world.dims.h }));
  console.log('loaded', room);
  if (room.id !== 'battery') fail('should open the battery, opened ' + room.id);

  const put = (x, y) => p.evaluate(([px, py]) => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = px - d.w / 2; b.y[0] = py - d.h / 2; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
  const where = () => p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; return [b.x[0] + d.w / 2, b.y[0] + d.h / 2]; });

  for (const [name, [x, y]] of Object.entries(SPOTS)) {
    await put(x, y);
    await sleep(1400);
    await p.screenshot({ path: join(out, name + '.png') });
  }
  // the wall holds: a wizard put against it is pushed out; the gate lets one stand in the middle of the line
  await put(23, 35.1);
  await sleep(400);
  const [, wy] = await where();
  if (Math.abs(wy - 35) < 0.4) fail(`a wizard stood ${Math.abs(wy - 35)} u from the wall line`);
  await put(42, 35);
  await sleep(1200);
  const burn = await p.evaluate(() => window.wizardSim.world.bodies.burn[0]);
  if (!(burn > 0)) fail('the gate\'s wall of fire should burn a wizard standing in it');
  const [gx, gy] = await where();
  if (Math.hypot(gx - 42, gy - 35) > 0.3) fail(`the gate should be open, the wizard was moved to ${gx}, ${gy}`);
  console.log('wall', wy, 'gate', gx, gy, 'burn', burn);
} finally {
  await browser.close();
  stop();
}
