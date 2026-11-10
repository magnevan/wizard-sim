// The battery (the opening's first job, an outdoor area) in real Chrome: it loads from its #anchor, every prop arrives,
// the wall stops a wizard, the gate doesn't, and nothing errors. Screenshots from around the area.
// Usage (after npm run build): node scripts/battery-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/battery'));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
// plan coordinates on the Opening Segment page -> the sim's, whose origin is the area's centre
const SPOTS = { start: [42, 63], yard: [34, 46], well: [42, 60], gate: [42, 39], crews: [31, 47], stores: [62, 56], pump: [21, 50], field: [42, 25], north: [64, 8], westEdge: [8, 32], southEdge: [28, 66],
  // standing right against things, for the depth order: both sides of the wall, round the well's steps, a pedestal, a tower
  wallSouth: [35.5, 35.8], wallSouth2: [36.2, 35.8], wallNorth: [35.5, 34.2], wellBackEast: [43.6, 51.6], wellBackWest: [39.6, 55.6], wellEast: [44.9, 53.2], wellNorth: [42, 51], wellSouth: [42, 57], pedestal: [29, 45.2], towerSide: [32.2, 37.5] };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  p.on('requestfailed', (r) => fail('request failed: ' + r.url()));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&debug=0#battery`);
  await p.waitForFunction(() => window.wizardSim?.view.props.count > 0 && window.wizardSim.view.props.ready, { timeout: 60000, polling: 200 });
  await sleep(1500);
  const room = await p.evaluate(() => ({ id: window.wizardSim.world.def.id, props: window.wizardSim.view.props.count, w: window.wizardSim.world.dims.w, h: window.wizardSim.world.dims.h }));
  console.log('loaded', room);
  if (room.id !== 'battery') fail('should open the battery, opened ' + room.id);

  const put = (x, y) => p.evaluate(([px, py]) => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; b.x[0] = px - d.w / 2; b.y[0] = py - d.h / 2; b.vx[0] = 0; b.vy[0] = 0; }, [x, y]);
  const where = () => p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies, d = g.world.dims; return [b.x[0] + d.w / 2, b.y[0] + d.h / 2]; });

  for (const [name, [x, y]] of Object.entries(SPOTS)) {
    await put(x, y);
    await sleep(1400);
    await p.screenshot({ path: join(out, name + '.png') });
  }
  // the wall holds: a wizard put against it is pushed out; the gate lets one stand in the middle of the line
  await put(23, 35.1);
  await sleep(400);
  const [, wy] = await where();
  if (Math.abs(wy - 35) < 0.4) fail(`a wizard stood ${Math.abs(wy - 35)} u from the wall line`);
  await put(42, 35);
  await sleep(1200);
  const burn = await p.evaluate(() => window.wizardSim.world.bodies.burn[0]);
  if (!(burn > 0)) fail('the gate\'s wall of fire should burn a wizard standing in it');
  const [gx, gy] = await where();
  if (Math.hypot(gx - 42, gy - 35) > 0.3) fail(`the gate should be open, the wizard was moved to ${gx}, ${gy}`);
  console.log('wall', wy, 'gate', gx, gy, 'burn', burn);

  // Round footprints are closed: walking at the well's open-ended sides (the old hole) stops at the ring. Well's centre is on screen up and left of a wizard to its east.
  await put(46.5, 54);
  await sleep(500);
  await p.mouse.move(560, 320);
  await p.mouse.down();
  await sleep(1800);
  await p.mouse.up();
  const [ex, ey] = await where();
  const inWell = Math.hypot(ex - 42, ey - 54);
  if (inWell < 2.6) fail(`walking at the well's side got to ${inWell} u from its middle`);
  console.log('well side stops at', inWell);

  // Driving a defence: step up, cast from it, swing the head, step away.
  const drive = () => p.evaluate(() => window.wizardSim.world.battery.drive[0]);
  const shot = (name) => p.screenshot({ path: join(out, name + '.png') });
  await put(30.4, 44);
  await sleep(900);
  await shot('drive-prompt');
  await p.keyboard.press('KeyX');
  await sleep(1400);
  if ((await drive()) !== 1) fail('X at a pedestal should take that defence');
  await p.mouse.move(860, 130);
  await sleep(500);
  await shot('drive-idle');
  // wave 1 comes down this defence's lane and reaches the wall: hidden behind it, they show through as silhouettes
  await sleep(9000);
  await shot('wave-coming');
  // headless frames run the sim slower than real time: wait on the sim, for the first enemy at the wall
  const atWall = () => p.evaluate(() => { const w = window.wizardSim.world, b = w.bodies; let n = 0; for (let i = 4; i < b.kind.length; i++) if (b.kind[i] === 3 && Math.hypot(b.x[i] - b.x[0], b.y[i] - b.y[0]) < 2.5) n++; return n; });
  for (let k = 0; k < 120 && (await atWall()) < 3; k++) await sleep(250);
  await sleep(600);
  await shot('wave-at-wall');
  console.log('enemies at the wall', await atWall());
  await p.keyboard.press('KeyF');
  await p.keyboard.press('KeyF');
  await sleep(200);
  await p.mouse.down({ button: 'right' });
  await sleep(1100);
  await shot('drive-spray');
  await p.mouse.up({ button: 'right' });
  await sleep(1600);
  await p.keyboard.press('KeyF');
  await sleep(150);
  await p.keyboard.down('Shift');
  await p.mouse.down({ button: 'right' });
  await sleep(60);
  await p.mouse.up({ button: 'right' });
  await p.keyboard.up('Shift');
  await sleep(450);
  await shot('drive-ring');
  await sleep(900);
  await p.mouse.move(1240, 420);
  await sleep(400);
  await shot('drive-east');
  await p.mouse.move(380, 60);
  await sleep(400);
  await shot('drive-north');
  // a marker where the cursor is, so the shots show whether the head points at it
  await p.evaluate(() => {
    const m = document.createElement('div');
    m.id = 'cursor-mark';
    m.style.cssText = 'position:fixed;width:9px;height:9px;margin:-5px 0 0 -5px;border:2px solid #0ff;border-radius:50%;pointer-events:none;z-index:99';
    document.body.appendChild(m);
    addEventListener('pointermove', (e) => { m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; });
  });
  // the head sweeps its whole swing, one facing at a time
  for (const [name, x, y] of [['sweep-left', 120, 180], ['sweep-up', 380, 30], ['sweep-out', 800, 120], ['sweep-right', 1200, 330], ['sweep-lower', 1230, 760], ['sweep-near', 560, 300]]) {
    await p.mouse.move(x, y);
    await sleep(900);
    await shot(name);
    // a guide from the barrel's root to the cursor: the drawn barrel should lie along it
    await p.evaluate(([mx, my]) => {
      const ws = window.wizardSim, w = ws.world, cam = ws.view.camera, t = w.def.props.filter((q) => q.asset === 'defence-tower')[w.battery.drive[0]];
      const T = cam.worldToScreen(t.x, t.y), k = cam.scale, rx = T.x, ry = T.y + (-50 - 9.6) * k;
      let g = document.getElementById('aim-guide');
      if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); g.id = 'aim-guide'; g.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:98'; document.body.appendChild(g); }
      g.innerHTML = `<line x1="${rx}" y1="${ry}" x2="${mx}" y2="${my}" stroke="#0ff" stroke-width="1" stroke-dasharray="4 4"/>`;
    }, [x, y]);
    await shot(name + '-guide');
    await p.evaluate(() => document.getElementById('aim-guide')?.remove());
  }
  // the flamethrower at a few aims, one past the gate's pillar; the last held a while to see it move
  for (const [name, x, y, frames] of [['jet-left', 200, 160, 1], ['jet-out', 700, 110, 1], ['jet-gate', 900, 330, 1], ['jet-far', 1100, 140, 4], ['jet-right', 1200, 330, 1], ['jet-lower', 1230, 620, 3], ['jet-wide-left', 120, 330, 1]]) {
    await p.mouse.move(x, y);
    await sleep(500);
    await p.keyboard.press('KeyF');
    await p.keyboard.press('KeyF');
    await sleep(150);
    await p.mouse.down({ button: 'right' });
    await sleep(120);
    await shot(name + '-start');
    await sleep(800);
    for (let f = 0; f < frames; f++) { await shot(frames > 1 ? `${name}-${f}` : name); await sleep(90); }
    await p.mouse.up({ button: 'right' });
    await sleep(1500);
  }
  // Place held far out: the reticle should sit at the defence's own reach (18), not a wizard's
  await p.mouse.move(1000, 60);
  await sleep(300);
  await p.keyboard.press('KeyF');
  await sleep(150);
  await p.keyboard.down('Shift');
  await p.mouse.down({ button: 'right' });
  await sleep(700);
  await shot('place-far');
  await p.mouse.up({ button: 'right' });
  await p.keyboard.up('Shift');
  await sleep(1500);
  // the Weapon cast's burst: the same half-ring as Area
  await p.keyboard.press('KeyF');
  await p.keyboard.press('KeyF');
  await sleep(150);
  await p.keyboard.down('Shift');
  await p.mouse.down({ button: 'left' });
  await sleep(60);
  await p.mouse.up({ button: 'left' });
  await p.keyboard.up('Shift');
  await sleep(450);
  await shot('drive-burst');
  await sleep(1200);
  await p.keyboard.press('KeyX');
  await sleep(900);
  if ((await drive()) !== -1) fail('X while driving should step away');
  const [hx, hy] = await where();
  if (Math.hypot(hx - 30.4, hy - 44) > 0.5) fail(`stepping away should put you back, you are at ${hx}, ${hy}`);
  console.log('driving ok, back at', hx, hy);
} finally {
  await browser.close();
  stop();
}
