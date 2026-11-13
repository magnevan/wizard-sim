// The battery's glyph paths in each of their styles (client/src/art/glyph-path.ts PATH_STYLES), shot from one spot so
// they can be compared side by side.
// Usage (after npm run build): node scripts/path-styles.mjs [--out dir] [--styles a,b,c]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/path-styles'));
const styles = arg('styles', 'a,b,c,d,e').split(',');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#battery`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  // by the possession circle west of the gate, where several lines run past the well (plan coordinates, as battery-check.mjs)
  await p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = 29.6 - d.w / 2; b.y[0] = 42 - d.h / 2; });
  await sleep(2500);
  for (const s of styles) {
    await p.evaluate((id) => { globalThis.__pathStyle = id; }, s);
    await sleep(500);
    await p.screenshot({ path: join(out, `style-${s}.png`) });
  }
  console.log('shot', styles.length, 'styles in', out);
} finally {
  await browser.close();
  stop();
}
