// usage: node scripts/foliage-shot.mjs [out.png] [--url http://127.0.0.1:5197] [--q "x=-8&view=12"] [--page foliage.html] [--wait 800] [--size 1920x1080]
// A screenshot of the foliage lab (packages/client/foliage.html) from a dev server that is already running
// (npm run dev -w @wizard-sim/client -- --port 5197 --strictPort), with the software renderer, so it works headless.
// --q is the page's query string (see lab/foliage-lab.ts). Prints the page's console errors, if any.
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const url = opt('url', process.env.FOLIAGE_URL ?? 'http://127.0.0.1:5197'), query = opt('q', ''), page_ = opt('page', 'foliage.html');
const wait = Number(opt('wait', '800')), [w, h] = opt('size', '1920x1080').split('x').map(Number);
const frames = Number(opt('frames', '0')), dt = Number(opt('dt', '0.1'));   // --frames 40 --dt 0.1: a film of the wind
const out = resolve(args[0] ?? 'shots/foliage.png');
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { if (!String(e).includes('sheet only')) errors.push(String(e)); });
  await page.setViewport({ width: w, height: h });
  await page.goto(`${url}/${page_}?wind=0&${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  await new Promise((r) => setTimeout(r, wait));
  if (frames > 0) {
    // film the wind: out-000.png, out-001.png ... one every --dt seconds of wind
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.__foliageTime(t), i * dt);
      await page.screenshot({ path: out.replace(/\.png$/, `-${String(i).padStart(3, '0')}.png`) });
    }
    console.log(`foliage -> ${frames} frames, ${out.replace(/\.png$/, '-NNN.png')}`);
  } else {
    await page.screenshot({ path: out });
    console.log(`foliage -> ${out}`);
  }
  if (errors.length) console.log(`console errors:\n  ${errors.join('\n  ')}`);
} finally {
  await browser.close();
}
