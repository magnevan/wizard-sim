// The drill yard (the opening's beats 2 and 3) in real Chrome: it loads from its #anchor, every prop arrives, the
// stations are there, Use at the rack gives a charged focus, the gate takes the party back into the courtyard, and nothing
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
// Where to look: the level's own Markers (written from plan D's MARKERS by tools/place-plans/to_ldtk.py), in the sim's
// coordinates (origin at the area's centre), so the check follows the plan when it moves
const SPOTS = ['strike', 'heavy', 'retreat', 'parry', 'parry-home', 'hands', 'focus'];

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  p.on('requestfailed', (r) => fail('request failed: ' + r.url()));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1#yard`);
  // the grey-box from plan D has no props yet (they come with the beauty stage): wait for the ground and whatever props there are
  await p.waitForFunction(() => window.wizardSim?.view.groundReady && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  await sleep(1500);
  const room = await p.evaluate(() => ({ id: window.wizardSim.world.def.id, props: window.wizardSim.view.props.count, w: window.wizardSim.world.dims.w, h: window.wizardSim.world.dims.h }));
  console.log('loaded', room);
  if (room.id !== 'yard') fail('should open the yard, opened ' + room.id);
  const bodies = await p.evaluate(() => { const w = window.wizardSim.world, t = []; for (let i = 0; i < w.bodies.kind.length; i++) if (w.yard.tag[i]) t.push(w.yard.tag[i]); return t; });
  console.log('yard bodies (tags)', bodies.join(','));
  if (bodies.length < 7) fail(`expected 4 straw goblins, the sack and 2 soldiers, got ${bodies.length}`);

  const markers = await p.evaluate(() => Object.fromEntries(window.wizardSim.world.def.markers.map((m) => [m.id, [m.x, m.y]])));
  for (const id of [...SPOTS, 'gate']) if (!markers[id]) fail(`the level has no marker ${id}`);
  const put = (x, y) => p.evaluate(([px, py]) => { const b = window.wizardSim.world.bodies; b.x[0] = px; b.y[0] = py; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
  await p.screenshot({ path: join(out, 'start.png') });
  for (const name of SPOTS) {
    if (!markers[name]) continue;
    await put(...markers[name]);
    await sleep(name === 'retreat' || name === 'parry' || name === 'hands' ? 2600 : 1300);
    await p.screenshot({ path: join(out, name + '.png') });
  }
  // the rack: Use gives a charged focus (one Fire, one Sigil)
  await put(...markers.focus);
  await sleep(500);
  await p.keyboard.down('KeyX'); await sleep(120); await p.keyboard.up('KeyX');
  await sleep(500);
  const focus = await p.evaluate(() => { const w = window.wizardSim.world; return { focus: w.yard.focus[0], fire: w.seats.runes[7], sigil: w.seats.runes[6] }; });
  console.log('focus', focus);
  if (!focus.focus) fail('Use at the rack should give a charged focus');
  await p.screenshot({ path: join(out, 'focus-taken.png') });
  // the gate: with a focus, walking up to it goes back into the courtyard
  await put(...markers.gate);
  await p.waitForFunction(() => window.wizardSim.world.def.id === 'court', { timeout: 8000, polling: 100 }).catch(() => fail('the gate should take the party back into the courtyard'));
  console.log('left for', await p.evaluate(() => window.wizardSim.world.def.id));
  console.log(process.exitCode ? 'yard check FAILED' : 'yard check ok', '->', out);
} finally {
  await browser.close();
  stop();
}
