// The isometric camera in real Chrome: each room loads, its painted ground arrives, a wizard stands where
// the camera says it does, and nothing errors. A screenshot of each.
// Usage (after npm run build): node scripts/iso-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/iso'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const room of ['sanctum', 'academy', 'survive']) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => fail(`${room}: page error: ${e.message}`));
    p.on('requestfailed', (r) => fail(`${room}: request failed: ${r.url()}`));
    await p.setViewport({ width: 1920, height: 1080 });
    const t0 = Date.now();
    await p.goto(`${BASE}?timerloop=1&debug=0&camera=iso#${room}`);
    await p.waitForFunction(() => window.wizardSim?.view.groundReady && window.wizardSim.view.props.ready, { timeout: 60000, polling: 100 });
    const ms = Date.now() - t0;
    await sleep(800);
    const r = await p.evaluate(() => {
      const g = window.wizardSim, cam = g.view.camera, b = g.world.bodies;
      const s = cam.worldToScreen(b.x[0], b.y[0]), w = cam.screenToWorld(s.x, s.y);
      return { iso: cam.iso, dx: Math.abs(w.x - b.x[0]), dy: Math.abs(w.y - b.y[0]), sx: s.x, sy: s.y, W: innerWidth, H: innerHeight };
    });
    if (!r.iso) fail(`${room}: the camera isn't isometric`);
    if (r.dx > 1e-6 || r.dy > 1e-6) fail(`${room}: screen and world disagree by ${r.dx}, ${r.dy}`);
    if (r.sx < 0 || r.sy < 0 || r.sx > r.W || r.sy > r.H) fail(`${room}: the wizard is off screen at ${r.sx}, ${r.sy}`);
    await p.screenshot({ path: join(out, room + '.png') });
    console.log(`${room}: ground ready in ${ms} ms`);
    await p.close();
  }
} finally {
  await browser.close();
  stop();
}
