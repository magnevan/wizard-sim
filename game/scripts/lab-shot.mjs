// usage: node scripts/lab-shot.mjs [out-dir] [x,y ...] [--page kit3d] [--query "layout=patch-b&view=50"]
// Screenshots of a lab page (packages/client/<page>.html, default kit3d) at 1920 x 1080, one per spot (world x,y; the
// page's own start when none), as <page>-01.png ... in out-dir (default shots/lab). The page must set
// window.__ready = true once drawn. Runs the Vite dev server on DEV_PORT (default 5291), since lab pages aren't in the
// build, and renders with the software renderer, so it works headless.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const query = takeOpt(args, 'query', ''), pageName = takeOpt(args, 'page', 'kit3d');
const out = resolve(args.shift() ?? 'shots/lab');
const spots = args.length ? args.map((s) => s.split(',').map(Number)) : [null];
mkdirSync(out, { recursive: true });
const lab = await startLab(pageName, Number(process.env.DEV_PORT) || 5291);
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  for (const [n, s] of spots.entries()) {
    const qs = [s ? `x=${s[0]}&y=${s[1]}` : '', query].filter(Boolean).join('&');
    await page.goto(lab.url(qs), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 1500));
    const file = `${out}/${pageName}-${String(n + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: file });
    console.log('shot', n + 1, s ?? 'start', '->', file);
  }
  await browser.close();
} finally { lab.stop(); }
