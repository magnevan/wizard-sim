// usage: node scripts/editor-shot.mjs [out.png] [--url http://127.0.0.1:5187] [--scene patch-b] [--keys "t"] [--wait 1500]
// A screenshot of the map editor (packages/client/editor.html) as a running dev server shows it, at 1920 x 1080 with
// the software renderer, so it works headless. It uses a dev server that is already running (npm run dev), since the
// editor talks to that server's scene server; --keys are pressed before the shot (e.g. "t" for the top view, "c" for
// corners). Prints the page's console errors, if any.
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const url = opt('url', process.env.MAP_EDITOR_URL ?? 'http://127.0.0.1:5187'), scene = opt('scene', 'patch-b');
const keys = opt('keys', ''), wait = Number(opt('wait', '1200'));
const out = resolve(args[0] ?? 'shots/editor.png');
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${url}/editor.html?scene=${scene}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  for (const k of keys) await page.keyboard.press(k);
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: out });
  console.log(`editor -> ${out}`);
  if (errors.length) console.log(`console errors:\n  ${errors.join('\n  ')}`);
} finally {
  await browser.close();
}
