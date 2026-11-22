// A concept's grey box (art/massing.ts) seen in the real camera: the drill yard with ?massing=academy, a wizard at
// spots along the academy's ranges and out in the yard, at 1920 x 1080 (480 x 270 art px, the view players get).
// Usage (after npm run build): node scripts/massing-shots.mjs [--plan academy] [--out dir] [--size 1920x1080]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const plan = arg('plan', 'academy');
const out = resolve(arg('out', `shots/massing-${plan}`));
const [vw, vh] = arg('size', '1920x1080').split('x').map(Number);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// plan coordinates (tools/segments/01-opening/yard-level.py)
const SPOTS = { 'hall-door': [5, 38], corner: [6, 6], 'hall-mid': [6, 24], workshops: [40, 5], armoury: [100, 9], 'yard-mid': [60, 36],
  strike: [13, 63], start: [120, 67], garden: [100, 86], far: [110, 60] };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.setViewport({ width: vw, height: vh });
  await p.goto(`${BASE}?timerloop=1&massing=${plan}#yard`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  await sleep(1500);
  const put = (x, y) => p.evaluate(([px, py]) => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = px - d.w / 2; b.y[0] = py - d.h / 2; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
  for (const [name, [x, y]] of Object.entries(SPOTS)) {
    await put(x, y);
    await sleep(1300);
    await p.screenshot({ path: join(out, name + '.png') });
  }
  console.log(process.exitCode ? 'massing shots FAILED' : 'massing shots ok', '->', out);
} finally {
  await browser.close();
  stop();
}
