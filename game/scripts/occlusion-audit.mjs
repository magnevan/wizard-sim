// Does what's drawn over the actors respect what stands in front of it? Real casts from set spots around walls
// and furniture, one cropped screenshot each. Look at them: this script doesn't judge.
// Usage (after npm run build): node scripts/occlusion-audit.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const i = process.argv.indexOf('--out');
const OUT = (i > 0 ? process.argv[i + 1] : 'shots/occlusion') + '/';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * at: where the wizard stands, relative to the anchor, world units; "behind" a wall is the side away from the camera
 * (north here). aim: the world point aimed at, relative to the anchor. keys: runes, then what the mouse does.
 */
const WALL = 'wall', DESK = 'desk', SHELF = 'bookshelf', CAUL = 'cauldron';
const S = [
  ['01 beam from behind, at the wall', 'survive', WALL, [0, -3], [0, 4], 's', 'hold'],
  ['02 beam from behind, diagonal at the wall', 'survive', WALL, [-2, -3], [2, 4], 's', 'hold'],
  ['03 beam from in front, at the wall', 'survive', WALL, [0, 3], [0, -4], 's', 'hold'],
  ['04 beam from behind, along the wall', 'survive', WALL, [-3, -1.2], [4, -1.2], 's', 'hold'],
  ['05 flame spray from behind, at the wall', 'survive', WALL, [0, -2.2], [0, 4], 'f', 'hold'],
  ['06 flame spray from in front, at the wall', 'survive', WALL, [0, 2.2], [0, -4], 'f', 'hold'],
  ['07 lightning from behind, at the wall', 'survive', WALL, [0, -2.5], [0, 4], 'a', 'hold'],
  ['08 rock thrown from behind, at the wall', 'survive', WALL, [0, -3.5], [0, 4], 'g', 'tap'],
  ['09 beam from behind a desk, toward the camera', 'academy', DESK, [-1, -1.4], [1.5, 2], 's', 'hold'],
  ['10 beam from in front of a desk, past it', 'academy', DESK, [1.5, 2], [-2.5, -2.5], 's', 'hold'],
  ['11 beam from behind a cauldron', 'academy', CAUL, [-1.2, -1.2], [2, 2], 's', 'hold'],
  ['12 flame spray from behind a desk', 'academy', DESK, [-1, -1.4], [1.5, 2], 'f', 'hold'],
  ['13 beam at the tall back wall', 'academy', SHELF, [3, 3], [-1, -3], 's', 'hold'],
  ['14 standing behind a wall, no cast', 'survive', WALL, [0, -1.1], [0, 4], '', ''],
  ['15 standing behind a desk, no cast', 'academy', DESK, [-0.6, -1.2], [1.5, 2], '', ''],
  ['16 water spray at the wall, from in front', 'survive', WALL, [0, 2.2], [0, -4], 'q', 'hold'],
  ['17 frost spray at the wall, from in front', 'survive', WALL, [0, 2.2], [0, -4], 'r', 'hold'],
  ['18 steam spray at the wall, from in front', 'survive', WALL, [0, 2.2], [0, -4], 'qf', 'hold'],
  ['19 flame spray at the corner of a wall, enemy unreachable', 'academy', SHELF, [3, 3], [-1, -3], 'f', 'hold'],
  ['20 runes ready, behind a wall', 'survive', WALL, [0, -1.1], [0, 4], 'ff', 'none'],
  ['21 fire sword, behind a wall', 'survive', WALL, [0, -1.1], [0, 4], 'df', 'shift-left-tap'],
  ['22 shield up, behind a wall', 'survive', WALL, [0, -1.1], [0, 4], 'eg', 'shift-left-tap'],
  ['30 shield up, in front of a wall', 'survive', WALL, [0, 1.1], [0, 4], 'eg', 'shift-left-tap'],
  ['23 turret preview, behind a wall', 'survive', WALL, [0, -3], [0, -1.1], 'df', 'hold'],
  ['24 turret summoned, behind a wall', 'survive', WALL, [0, -3], [0, -1.1], 'df', 'tap'],
  ['25 fire placed behind a wall', 'survive', WALL, [0, -3.5], [0, -1.2], 'ff', 'shift-place'],
  ['26 frost placed behind a wall', 'survive', WALL, [0, -3.5], [0, -1.2], 'rr', 'shift-place'],
  ['27 area burst behind a wall', 'survive', WALL, [0, -1.6], [0, 4], 'ff', 'shift-tap'],
  ['28 fire sword, in front of a wall', 'survive', WALL, [0, 1.1], [0, 4], 'df', 'shift-left-tap'],
  ['29 runes ready, in front of a wall', 'survive', WALL, [0, 1.1], [0, 4], 'ff', 'none'],
];

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const only = process.argv.indexOf('--only');
  for (const [name, room, anchor, at, aim, key, mode] of S) {
    if (only > 0 && !process.argv[only + 1].split(',').includes(name.slice(0, 2))) continue;
    const p = await browser.newPage();
    p.on('pageerror', (e) => console.error('PAGE ERROR', name, e.message));
    await p.setViewport({ width: 1920, height: 1080 });
    await p.goto(`${BASE}?timerloop=1&debug=0#${room}`);
    await p.waitForFunction(() => window.wizardSim?.view.groundReady && window.wizardSim.view.props.ready, { timeout: 60000, polling: 100 });
    await sleep(300);
    const r = await p.evaluate((anchor, at, aim) => {
      const g = window.wizardSim, w = g.world, b = w.bodies;
      let ax = 0, ay = 0;
      if (anchor === 'wall') {
        // the longest straight wall running east-west: north of it is behind it
        let best = 0;
        for (const [x1, y1, x2, y2] of w.def.rock) if (Math.abs(y1 - y2) < 0.01 && Math.abs(x2 - x1) > best) { best = Math.abs(x2 - x1); ax = (x1 + x2) / 2; ay = y1; }
      } else {
        const q = w.def.props.find((c) => c.asset.startsWith(anchor));
        ax = q.x; ay = q.y;
      }
      b.x[0] = ax + at[0]; b.y[0] = ay + at[1];
      g.anchor = [ax, ay];
      return { ax, ay };
    }, anchor, at, aim);
    await sleep(700); // the camera settles
    const tgt = await p.evaluate((x, y) => window.wizardSim.view.camera.worldToScreen(x, y), r.ax + aim[0], r.ay + aim[1]);
    const me = await p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies; return g.view.camera.worldToScreen(b.x[0], b.y[0]); });
    await p.mouse.move(tgt.x, tgt.y);
    await sleep(120);
    if (key) {
      for (const k of key) await p.keyboard.press(k);
      await sleep(150);
      if (mode !== 'none') {
        const button = mode.includes('left') ? 'left' : 'right', shift = mode.startsWith('shift');
        if (shift) await p.keyboard.down('Shift');
        await p.mouse.down({ button });
        await sleep(mode === 'hold' ? 1100 : mode.endsWith('place') ? 900 : 420);
        if (mode !== 'hold') { await p.mouse.up({ button }); await sleep(260); }
        if (shift) await p.keyboard.up('Shift');
      }
    }
    const mx = Math.round((me.x + tgt.x) / 2), my = Math.round((me.y + tgt.y) / 2) - 40;
    console.log(' held:', await p.evaluate(() => { const q = window.wizardSim.world.seats; return `weapon ${q.weapon[0]} guard ${q.guard[0]}`; }));
    await p.screenshot({ path: `${OUT}${name.slice(0, 2)}.png`, clip: { x: Math.max(0, Math.min(1920 - 640, mx - 320)), y: Math.max(0, Math.min(1080 - 420, my - 210)), width: 640, height: 420 } });
    console.log(name);
    await p.close();
  }
} finally { await browser.close(); stop(); }
