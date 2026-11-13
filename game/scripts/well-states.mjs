// The battery's well in each of its versions (client/src/art/well-anim.ts PREVIEWS, as clicking it steps through them),
// cropped round the well; a change is shot at several moments. --burst n shoots version n as fast as it can instead.
// Usage (after npm run build): node scripts/well-states.mjs [--out dir] [--burst n]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/well-states'));
const burst = arg('burst', null);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// version: the moments to shoot it at, ms after it starts (a change takes 2.6 s, then holds)
const VERSIONS = burst !== null ? [[Number(burst), Array.from({ length: 16 }, (_, i) => i * 120)]]
  : [[0, [400, 1200]], [1, [300, 700, 1100]], [2, [100, 250, 600, 1100, 1800, 2500]], [3, [600]], [4, [100, 900, 1500, 2100, 2700]]];

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#battery`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  // just south of the well, so it sits in the middle of the view
  const well = await p.evaluate(() => { const g = window.wizardSim, w = g.world.def.props.find((q) => q.asset === 'battery-well'); g.world.bodies.x[0] = w.x; g.world.bodies.y[0] = w.y + 5; return w; });
  await sleep(2500);
  for (const [v, moments] of VERSIONS) {
    await p.evaluate((n) => window.wizardSim.view.props.previewWell(n), v);
    const t0 = Date.now();
    for (const ms of moments) {
      await sleep(Math.max(0, ms - (Date.now() - t0)));
      const at = await p.evaluate((x, y) => window.wizardSim.view.camera.worldToScreen(x, y), well.x, well.y);
      const s = await p.evaluate(() => window.wizardSim.view.camera.scale);
      const clip = { x: Math.max(0, at.x - 70 * s), y: Math.max(0, at.y - 130 * s), width: 140 * s, height: 160 * s };
      await p.screenshot({ path: join(out, `v${v}-${String(Date.now() - t0).padStart(5, '0')}.png`), clip });
    }
  }
  console.log('shot the well in', out);
} finally {
  await browser.close();
  stop();
}
