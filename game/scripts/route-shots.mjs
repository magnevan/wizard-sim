// Play-size screens along a place's journey, for the flow critic (docs/campaign/making-a-place.md, stage 2): one page
// load, then seat 0 is set down at each spot in turn and the normal game view is shot. The spots come from
// tools/place-plans/journey_spots.py.
// Usage (after npm run build):
//   python ../tools/place-plans/journey_spots.py court-d > spots.json
//   node scripts/route-shots.mjs --room court --spots spots.json [--size 1920x1080] [--out shots/route] [--settle 1200] [--query vistas=0]
// In rooms with landmark vistas pass --query vistas=0: headless, a vista's pull-back renders very slowly in software.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const room = arg('room', 'court');
const passes = JSON.parse(readFileSync(resolve(arg('spots', 'spots.json')), 'utf8'));
const outDir = resolve(arg('out', `shots/route-${room}`));
const [vw, vh] = arg('size', '1920x1080').split('x').map(Number);
const settle = Number(arg('settle', '1200'));
const query = arg('query', '');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.setViewport({ width: vw, height: vh });
  const load = async () => {
    await p.goto(`${BASE}?timerloop=1${query ? '&' + query : ''}#${room}`);
    await p.waitForFunction(() => window.wizardSim?.view.props.ready, { timeout: 180000, polling: 500 });
    await sleep(2000);
  };
  await load();
  let retried = false;
  for (const { pass, spots } of passes) {
    for (let i = 0; i < spots.length; i++) {
      await p.evaluate(([x, y]) => {
        const g = window.wizardSim, b = g.world.bodies, d = g.world.dims;
        b.x[0] = x - d.w / 2; b.y[0] = y - d.h / 2; b.vx[0] = 0; b.vy[0] = 0;
      }, spots[i]);
      await sleep(settle);
      if (await p.evaluate(() => location.hash) !== `#${room}`) {   // a spot inside a gate's reach left the room: come back
        console.log('left the room at pass', pass, 'step', i + 1, retried ? '- skipped' : '- reloading');
        await load();
        if (!retried) { retried = true; i--; } else retried = false;
        continue;
      }
      retried = false;
      const out = `${outDir}/p${pass}-${String(i + 1).padStart(2, '0')}.png`;
      await p.screenshot({ path: out });
      console.log('pass', pass, 'step', i + 1, 'of', spots.length);
    }
  }
} finally {
  await browser.close();
  stop();
}
