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
const SPOTS = { start: [36, 57], yard: [31, 41], well: [36, 49], gate: [36, 36], crews: [25, 41], stores: [54, 53], cistern: [20, 46], field: [36, 22], north: [58, 8], westEdge: [7, 30], southEdge: [24, 58] };

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
  await put(20, 33.1);
  await sleep(400);
  const [, wy] = await where();
  if (Math.abs(wy - 33) < 0.4) fail(`a wizard stood ${Math.abs(wy - 33)} u from the wall line`);
  await put(36, 33);
  await sleep(400);
  const [gx, gy] = await where();
  if (Math.hypot(gx - 36, gy - 33) > 0.3) fail(`the gate should be open, the wizard was moved to ${gx}, ${gy}`);
  console.log('wall', wy, 'gate', gx, gy);
} finally {
  await browser.close();
  stop();
}
