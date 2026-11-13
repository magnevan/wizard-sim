// The battery's well painter driven directly, frame by frame, at chosen states (client/src/art/well-anim.ts), its own
// canvas saved as one contact sheet per sequence: steady, overloaded, the power-down, failed, the repair. Exact where
// screenshots of the running game are too slow to catch a flare.
// Usage (after npm run build): node scripts/well-frames.mjs [--out dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/well-frames'));
mkdirSync(out, { recursive: true });

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.goto(`${BASE}?timerloop=1&debug=0#battery`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready && window.wizardSim.view.props.well?.ready, { timeout: 60000, polling: 200 });
  // each sequence: [name, seconds, (s) => [power, unstable, repair], moments to keep (s)]
  const sheets = await p.evaluate(() => {
    const w = window.wizardSim.view.props.well;
    w.preview = -1;
    const run = (secs, state, keep) => {
      const shots = [];
      const step = 1 / 60;
      let next = 0;
      for (let s = 0; s <= secs + 1e-6; s += step) {
        const [pw, un, rp] = state(s);
        w.draw(1000 + s, pw, un, rp);
        if (next < keep.length && s >= keep[next] - 1e-6) { shots.push(w.cv.c.toDataURL()); next++; }
      }
      return shots;
    };
    const fail = (s) => [Math.max(0, 1 - s / 2.1), 1, 0];
    return {
      steady: run(2, () => [1, 0, 0], [0, 0.5, 1, 1.5, 2]),
      overloaded: run(1.2, () => [1, 1, 0], [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]),
      fail: run(2.4, fail, [0.05, 0.12, 0.2, 0.3, 0.45, 0.6, 0.9, 1.2, 1.6, 2.1, 2.4]),
      repair: run(2.4, (s) => [0, 0, Math.min(1, s / 2.2)], [0.2, 0.6, 1.0, 1.4, 1.8, 2.2, 2.4]),
    };
  });
  for (const [name, shots] of Object.entries(sheets)) {
    shots.forEach((d, i) => writeFileSync(join(out, `${name}-${String(i).padStart(2, '0')}.png`), Buffer.from(d.split(',')[1], 'base64')));
  }
  console.log('painted the well in', out, Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.length])));
} finally {
  await browser.close();
  stop();
}
