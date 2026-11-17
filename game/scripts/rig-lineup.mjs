// The game's own rigs at true art-pixel size (1x), facing the camera, written as one transparent PNG
// per kind, so bought sprites can be laid beside them at the size they'd have in play.
// Usage (after npm run build): node scripts/rig-lineup.mjs [--out dir] [--query "wizscale=1.7"]   (default shots/rigs/)
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
  const qi = process.argv.indexOf('--query');
  await p.goto(`${BASE}?timerloop=1${qi > 0 ? '&' + process.argv[qi + 1] : ''}`);
  await p.waitForFunction(() => !!window.wizardSim?.art, { timeout: 20000, polling: 100 });
  const urls = await p.evaluate(() => {
    const { newRigState, paint } = window.wizardSim.art;
    const W = 96, H = 96, res = {};
    // the wizard's eight facings, then gathering (prep), casting, mid-stride and knocked down, in one strip
    const poses = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ face: Math.PI / 2 + (k * Math.PI) / 4 })),
      { face: Math.PI / 2, prep: 1 }, { face: 0.4, cast: 1 }, { face: Math.PI / 2, spd: 1, ph: 1 }, { face: Math.PI / 2, dead: 1 }];
    const strip = document.createElement('canvas'); strip.width = poses.length * W; strip.height = H;
    poses.forEach((po, k) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      paint({ ...newRigState(), kind: 'wizard', pal: 0, ...po }, c.getContext('2d'), W / 2, H - 12);
      strip.getContext('2d').drawImage(c, k * W, 0);
    });
    res['wizard-poses'] = strip.toDataURL('image/png');
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
