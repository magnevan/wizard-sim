// The battery at two wizard scales (?wizscale=), the wizard stood at the same spots, for judging its size
// against the props (explorations/2026-11-16-warband-art.md).
// Usage (after npm run build): node scripts/wizscale-shots.mjs [--out dir] [--scales 1,1.7]   (default shots/wizscale/)
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/wizscale'));
const scales = arg('scales', '1,1.7').split(',');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// plan coordinates on the Opening Segment page (see battery-check.mjs)
const SPOTS = { stores: [62, 56], crews: [31, 47], yard: [34, 46], start: [42, 63] };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const z of scales) {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 800 });
    await p.goto(`${BASE}?timerloop=1&wizscale=${z}#battery`);
    await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
    await sleep(1500);
    for (const [name, [x, y]] of Object.entries(SPOTS)) {
      await p.evaluate(([px, py]) => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = px - d.w / 2; b.y[0] = py - d.h / 2; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
      await sleep(1400);
      await p.screenshot({ path: join(out, `${name}-${z}.png`) });
    }
    await p.close();
  }
  console.log('wrote', out);
} finally {
  await browser.close();
  stop();
}
