// The wizard's conjured weapons and guards as the game draws them live in 3D (art/live3d.ts, the props from
// tools/sprites-3d/wizprops.py) with their 2D effects, each pair in five facings, standing.
// Usage (after npm run build): node scripts/arms-shots.mjs [--out shots/arms] [--full] [--motion] [--guards] [--block]   (needs a real GPU: d3d11)
// Writes <out>/<weapon>-<guard>-<facing>.png crops round seat 0 (--full: whole frames instead); --motion adds a Strike
// frame by frame (-strike0..7) and a held block (-block) for four of them; --guards each guard alone in motion,
// 12 frames idle and 12 blocking (guard-<guard>-idleNN / -blockNN).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/arms')), full = process.argv.includes('--full');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// element ids: water 1, life 2, shield 3, cold 4, lightning 5, arcane 6, sigil 7, fire 8, earth 9, ice 10;
// guards (sim world.ts GUARD): bulwark 1, mirror 2, ember 3, rime 4, spark 5, tide 6, prism 7, leaf 8, spike 9
const PAIRS = [['sword', 8, 'mirror', 2], ['earthmaul', 9, 'bulwark', 1], ['focus', 6, 'ember', 3], ['icebow', 10, 'rime', 4],
  ['frostspear', 4, 'spark', 5], ['whip', 5, 'tide', 6], ['trident', 1, 'prism', 7], ['life', 2, 'leaf', 8], ['icebow', 10, 'spike', 9], ['staff', 0, 'none', 0]];
// facings: where the mouse aims from the wizard (the camera keeps seat 0 near the middle of the frame), screen px
const FACES = [['s', 0, 300], ['se', 260, 200], ['e', 280, 0], ['ne', 260, -200], ['sw', -260, 200], ['w', -280, 0]];
const MID = [640, 390];

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&stage=1&scale=${arg('scale', '4')}`);   // the Sanctum: no waves, so the camera holds still
  console.log(await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
  await sleep(1500);
  for (const [wn, wid, gn, gid] of PAIRS) {
    for (const [fn, ax, ay] of FACES) {
      await p.mouse.move(MID[0] + ax, MID[1] + ay);
      await p.evaluate((wid, gid) => {
        const g = window.wizardSim, s = g.world.seats;
        clearInterval(window.__hold);
        // held every tick: the weapon and the guard
        window.__hold = setInterval(() => { s.weapon[0] = wid; s.weaponUses[0] = 9; s.wand[0] = 0; s.guard[0] = gid; s.guardHp[0] = 999; }, 10);
      }, wid, gid);
      await sleep(700);
      if (process.argv.includes('--block')) { await p.keyboard.down('Space'); await sleep(600); }   // every facing blocking
      const file = join(out, `${wn}-${gn}-${fn}.png`);
      if (full) await p.screenshot({ path: file });
      else await p.screenshot({ path: file, clip: { x: MID[0] - 100, y: MID[1] - 170, width: 200, height: 190 } });
      if (process.argv.includes('--block')) { await p.keyboard.up('Space'); await sleep(300); }
    }
    console.log('shot', wn, gn);
  }
  // a Strike (RMB tap) frame by frame, and a held block (Space), aimed south-east
  if (process.argv.includes('--motion')) {
    for (const [wn, wid, gn, gid] of PAIRS.filter((q) => ['sword', 'earthmaul', 'trident', 'whip'].includes(q[0]))) {
      await p.mouse.move(MID[0] + 260, MID[1] + 200);
      await p.evaluate((wid, gid) => {
        const s = window.wizardSim.world.seats;
        clearInterval(window.__hold);
        window.__hold = setInterval(() => { s.weapon[0] = wid; s.weaponUses[0] = 9; s.wand[0] = 0; s.guard[0] = gid; s.guardHp[0] = 999; }, 10);
      }, wid, gid);
      await sleep(1600);   // past the last blow's recovery
      await p.mouse.down({ button: 'right' }); await sleep(60); await p.mouse.up({ button: 'right' });
      for (let k = 0; k < 8; k++) {
        await p.screenshot({ path: join(out, `${wn}-${gn}-strike${k}.png`), clip: { x: MID[0] - 100, y: MID[1] - 170, width: 200, height: 190 } });
        await sleep(70);
      }
      await sleep(1600);
      await p.keyboard.down('Space'); await sleep(500);
      await p.screenshot({ path: join(out, `${wn}-${gn}-block.png`), clip: { x: MID[0] - 100, y: MID[1] - 170, width: 200, height: 190 } });
      await p.keyboard.up('Space');
      console.log('motion', wn, gn);
    }
  }
  // each guard in motion (its particles and shell are animated): 12 frames idle, then 12 blocking, aimed south-east
  if (process.argv.includes('--guards')) {
    for (const [, , gn, gid] of PAIRS.filter((q) => q[3])) {
      await p.mouse.move(MID[0] + 260, MID[1] + 200);
      await p.evaluate((gid) => {
        const s = window.wizardSim.world.seats;
        clearInterval(window.__hold);
        window.__hold = setInterval(() => { s.weapon[0] = 0; s.wand[0] = 0; s.guard[0] = gid; s.guardHp[0] = 999; }, 10);
      }, gid);
      await sleep(900);
      const clip = { x: MID[0] - 100, y: MID[1] - 170, width: 200, height: 190 };
      for (let k = 0; k < 12; k++) { await p.screenshot({ path: join(out, `guard-${gn}-idle${String(k).padStart(2, '0')}.png`), clip }); await sleep(60); }
      await p.keyboard.down('Space'); await sleep(120);
      for (let k = 0; k < 12; k++) { await p.screenshot({ path: join(out, `guard-${gn}-block${String(k).padStart(2, '0')}.png`), clip }); await sleep(60); }
      await p.keyboard.up('Space');
      // the Rime walking off: what fell from it should stay where it fell (guard-<g>-walkNN, a wider crop)
      if (gn === 'rime') {
        await sleep(400);
        await p.mouse.move(MID[0] + 400, MID[1]); await p.mouse.down();   // hold left: walk toward the cursor
        for (let k = 0; k < 10; k++) { await p.screenshot({ path: join(out, `guard-${gn}-walk${String(k).padStart(2, '0')}.png`), clip: { x: MID[0] - 200, y: MID[1] - 170, width: 400, height: 190 } }); await sleep(70); }
        await p.mouse.up();
        await p.mouse.move(MID[0] - 400, MID[1]); await p.mouse.down(); await sleep(700); await p.mouse.up();   // and back
      }
      console.log('guard', gn);
    }
  }
  console.log('wrote', out);
} finally { await browser.close(); stop(); }
