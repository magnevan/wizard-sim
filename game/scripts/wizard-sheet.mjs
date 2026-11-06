// Today's wizard beside the detailed one: every seat colour, eight facings, and the poses, painted by the
// real rigs and written as one PNG at 4x. Usage (after npm run build): node scripts/wizard-sheet.mjs [--out file]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const i = process.argv.indexOf('--out');
const out = resolve(i > 0 ? process.argv[i + 1] : 'shots/academy/wizard-sheet.png');
mkdirSync(dirname(out), { recursive: true });
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  await p.goto(`${BASE}?timerloop=1&debug=0`);
  await p.waitForFunction(() => !!window.wizardSim?.art, { timeout: 20000, polling: 100 });
  const url = await p.evaluate(() => {
    const { newRigState, paint } = window.wizardSim.art;
    const W = 34, H = 50, Z = 4;
    const poses = [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ face: Math.PI / 2 + (k * Math.PI) / 4 })),
      { face: Math.PI / 2, prep: 1 }, { face: 0.4, cast: 1 }, { face: Math.PI / 2, spd: 1, ph: 1 }, { face: Math.PI / 2, dead: 1 },
    ];
    const c = document.createElement('canvas');
    c.width = poses.length * W * Z; c.height = 6 * H * Z;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#3e483c'; x.fillRect(0, 0, c.width, c.height);
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const tx = t.getContext('2d', { willReadFrequently: true });
    const rows = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 1], [3, 1]]; // [seat, hd]
    rows.forEach(([seat, hd], r) => poses.forEach((po, col) => {
      tx.clearRect(0, 0, W, H);
      paint({ ...newRigState(), kind: 'wizard', pal: seat, hd, ...po }, tx, W / 2, H - 6);
      x.drawImage(t, col * W * Z, r * H * Z, W * Z, H * Z);
    }));
    return c.toDataURL('image/png');
  });
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', out);
} finally {
  await browser.close();
  stop();
}
