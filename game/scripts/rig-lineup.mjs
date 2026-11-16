// The game's own rigs at true art-pixel size (1x), facing the camera, written as one transparent PNG
// per kind, so bought sprites can be laid beside them at the size they'd have in play.
// Usage (after npm run build): node scripts/rig-lineup.mjs [--out dir]   (default shots/rigs/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const i = process.argv.indexOf('--out');
const out = resolve(i > 0 ? process.argv[i + 1] : 'shots/rigs');
mkdirSync(out, { recursive: true });
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  await p.goto(`${BASE}?timerloop=1&debug=0`);
  await p.waitForFunction(() => !!window.wizardSim?.art, { timeout: 20000, polling: 100 });
  const urls = await p.evaluate(() => {
    const { newRigState, paint } = window.wizardSim.art;
    const W = 64, H = 64, res = {};
    const kinds = [['wizard', { kind: 'wizard', pal: 0 }], ['wizard-hd', { kind: 'wizard', pal: 0, hd: 1 }], ['goblin', { kind: 'goblin' }], ['archer', { kind: 'archer' }], ['brute', { kind: 'brute' }], ['dummy', { kind: 'dummy' }]];
    for (const [name, s] of kinds) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      paint({ ...newRigState(), ...s, face: Math.PI / 2 }, c.getContext('2d'), W / 2, H - 8);
      res[name] = c.toDataURL('image/png');
    }
    return res;
  });
  for (const [k, u] of Object.entries(urls)) writeFileSync(resolve(out, k + '.png'), Buffer.from(u.split(',')[1], 'base64'));
  console.log('wrote', Object.keys(urls).join(', '), 'to', out);
} finally {
  await browser.close();
  stop();
}
