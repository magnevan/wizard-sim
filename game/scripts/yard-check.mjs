// The drill yard (the opening's beats 2 and 3) in real Chrome: it loads from its #anchor, every prop arrives, the
// stations are there, Use at the rack gives a charged focus, the gate takes the party on to the battery, and nothing
// errors. Screenshots from around the area, the stations and the academy round it.
// Usage (after npm run build): node scripts/yard-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/yard'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
// plan coordinates (tools/segments/01-opening/yard-level.py) -> the sim's, whose origin is the area's centre
const SPOTS = { start: [24.3, 53], strike: [21, 43], heavy: [15, 33], retreat: [28, 25], parry: [41, 33], lane: [52, 34], hands: [66, 19], focus: [54, 12],
  gate: [46, 9], garden: [62, 54], barracks: [72, 44], shed: [58, 51], farm: [9, 32], casting: [42, 45], north: [30, 8] };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  p.on('requestfailed', (r) => fail('request failed: ' + r.url()));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1#yard`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  await sleep(1500);
  const room = await p.evaluate(() => ({ id: window.wizardSim.world.def.id, props: window.wizardSim.view.props.count, w: window.wizardSim.world.dims.w, h: window.wizardSim.world.dims.h }));
  console.log('loaded', room);
  if (room.id !== 'yard') fail('should open the yard, opened ' + room.id);
  const bodies = await p.evaluate(() => { const w = window.wizardSim.world, t = []; for (let i = 0; i < w.bodies.kind.length; i++) if (w.yard.tag[i]) t.push(w.yard.tag[i]); return t; });
  console.log('yard bodies (tags)', bodies.join(','));
  if (bodies.length < 7) fail(`expected 4 straw goblins, the sack and 2 soldiers, got ${bodies.length}`);

  const put = (x, y) => p.evaluate(([px, py]) => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = px - d.w / 2; b.y[0] = py - d.h / 2; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
  for (const [name, [x, y]] of Object.entries(SPOTS)) {
    await put(x, y);
    await sleep(name === 'retreat' || name === 'parry' || name === 'hands' ? 2600 : 1300);
    await p.screenshot({ path: join(out, name + '.png') });
  }
  // the rack: Use gives a charged focus (one Fire, one Sigil)
  await put(54, 11);
  await sleep(500);
  await p.keyboard.down('KeyX'); await sleep(120); await p.keyboard.up('KeyX');
  await sleep(500);
  const focus = await p.evaluate(() => { const w = window.wizardSim.world; return { focus: w.yard.focus[0], fire: w.seats.runes[7], sigil: w.seats.runes[6] }; });
  console.log('focus', focus);
  if (!focus.focus) fail('Use at the rack should give a charged focus');
  await p.screenshot({ path: join(out, 'focus-taken.png') });
  // the gate: with a focus, walking up to it goes on to the battery
  await put(46, 8.2);
  await p.waitForFunction(() => window.wizardSim.world.def.id === 'battery', { timeout: 8000, polling: 100 }).catch(() => fail('the gate should take the party on to the battery'));
  console.log('left for', await p.evaluate(() => window.wizardSim.world.def.id));
  console.log(process.exitCode ? 'yard check FAILED' : 'yard check ok', '->', out);
} finally {
  await browser.close();
  stop();
}
