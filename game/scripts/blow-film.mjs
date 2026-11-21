// A weapon move filmed in the game itself (the Model Viewer leaves out the game's state: the cast pose, the 2D effects).
// Usage (after npm run build): node scripts/blow-film.mjs [--out shots/blow] [--weapon trident] [--move strike|heavy|sweep|block]
//   [--hold 1.2] [--frames 24] [--every 60] [--fresh] [--uses n] [--aim dx,dy] [--guard ember]   (needs a real GPU: d3d11)
// Casts a Water Force first (as real play does: a Strike leaves the last cast's id in place), unless --fresh; then
// films the move, aimed east, as <out>/<weapon>-<move>-NN.png crops round seat 0 (scale 4), and prints the seat's
// phase every frame. --hold is how long a Heavy is held (s); --uses gives the weapon n uses once (not topped up), to
// see it run out; --aim is where the mouse aims from the wizard (screen px, default 280,0: east);
// --guard gives it a guard (block holds Space).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/blow')), weapon = arg('weapon', 'trident'), mv = arg('move', 'strike');
const hold = Number(arg('hold', '1.2')), frames = Number(arg('frames', '24')), every = Number(arg('every', '60'));
// element ids (sim world.ts EL): the conjured weapon each element makes
// guards (sim world.ts GUARD)
const GID = { bulwark: 1, mirror: 2, ember: 3, rime: 4, spark: 5, tide: 6, prism: 7, leaf: 8, spike: 9 };
const WID = { trident: 1, frostspear: 4, whip: 5, focus: 6, sword: 8, earthmaul: 9, icebow: 10, staff: 0 };
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MID = [640, 390];
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?timerloop=1&stage=1&scale=4`);   // the Sanctum: no waves, the camera holds still
  await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
  await sleep(1500);
  const [ax, ay] = arg('aim', '280,0').split(',').map(Number);
  await p.mouse.move(MID[0] + ax, MID[1] + ay);
  if (!process.argv.includes('--fresh')) { await p.keyboard.press('q'); await sleep(100); await p.mouse.down({ button: 'right' }); await sleep(60); await p.mouse.up({ button: 'right' }); await sleep(1200); }
  await p.evaluate((wid, gid) => { const s = window.wizardSim.world.seats; clearInterval(window.__hold); window.__hold = setInterval(() => { s.weapon[0] = wid; s.weaponUses[0] = 9; s.wand[0] = 0; if (gid) { s.guard[0] = gid; s.guardHp[0] = 999; } }, 10); }, WID[weapon] ?? 1, GID[arg('guard', '')] ?? 0);
  await sleep(1200);
  const uses = arg('uses');
  if (uses) await p.evaluate((n) => { clearInterval(window.__hold); window.wizardSim.world.seats.weaponUses[0] = n; }, Number(uses));
  const shoot = async (k) => {
    await p.screenshot({ path: join(out, `${weapon}-${mv}-${String(k).padStart(2, '0')}.png`), clip: { x: MID[0] - 110, y: MID[1] - 170, width: 300, height: 200 } });
    console.log(k, 'phase', await p.evaluate(() => window.wizardSim.world.seats.phase[0]));
  };
  let k = 0;
  if (mv === 'block') {
    await p.keyboard.down('Space');
    while (k < frames) { await shoot(k++); await sleep(every); }
    await p.keyboard.up('Space');
  }
  if (mv === 'sweep') await p.keyboard.down('Shift');
  if (mv !== 'block') await p.mouse.down({ button: 'right' });
  if (mv === 'heavy') { const end = Date.now() + hold * 1000; while (Date.now() < end && k < frames) { await shoot(k++); await sleep(every); } }
  else await sleep(60);
  if (mv !== 'block') await p.mouse.up({ button: 'right' });
  if (mv === 'sweep') await p.keyboard.up('Shift');
  while (k < frames) { await shoot(k++); await sleep(every); }
} finally { await browser.close(); stop(); }
