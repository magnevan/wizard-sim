// A whole room in one picture, for reviewing a blockout away from the game: pixel scale 1 in a big window, so the
// camera sees several screens at once, with seat 0 parked at a plan spot (the room's middle by default).
// Usage (after npm run build): node scripts/overview-shot.mjs --room yard [--at 65,50] [--size 3600x2200] [--out file.png] [--query massing=off]
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const room = arg('room', 'yard');
const out = resolve(arg('out', `shots/overview-${room}.png`));
const [vw, vh] = arg('size', '3600x2200').split('x').map(Number);
const at = arg('at', '');
const query = arg('query', '');
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.setViewport({ width: vw, height: vh });
  await p.goto(`${BASE}?timerloop=1&scale=1${query ? '&' + query : ''}#${room}`);
  await p.waitForFunction(() => window.wizardSim?.view.props.ready, { timeout: 90000, polling: 200 });
  await sleep(1500);
  await p.evaluate((spot) => {
    const g = window.wizardSim, b = g.world.bodies, d = g.world.dims;
    const [x, y] = spot ? spot.split(',').map(Number) : [d.w / 2, d.h / 2];
    b.x[0] = x - d.w / 2; b.y[0] = y - d.h / 2; b.vx[0] = 0; b.vy[0] = 0;
  }, at);
  await sleep(2500);
  await p.screenshot({ path: out });
  console.log(process.exitCode ? 'overview FAILED' : 'overview ok', '->', out);
} finally {
  await browser.close();
  stop();
}
