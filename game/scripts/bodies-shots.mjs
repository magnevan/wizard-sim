// usage: node scripts/bodies-shots.mjs [out-dir] [--scenes idle,walk,attack,wizard] [--views 26,10]
// The port to 3D's step 0 shots of the characters (lab/bodies3d.ts on bodies3d.html): the wizard and the warband drawn
// by view3d/bodies.ts, unpixelated, lit by the kit's stage at the game camera, today's pixel version of each in a row
// under them. One 1920 x 1080 shot per scene and view (u of ground in view: 26 is the game's distance, 10 a close-up),
// as bodies-<scene>-<view>.png in out-dir (default shots/port-3d/bodies). Runs the Vite dev server on DEV_PORT
// (default 5193), since lab pages aren't in the build, and renders with the software renderer, so it works headless.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const scenes = takeOpt(args, 'scenes', 'idle,walk,attack,wizard').split(',');
const views = takeOpt(args, 'views', '26,10').split(',');
const out = resolve(args.shift() ?? 'shots/port-3d/bodies');
mkdirSync(out, { recursive: true });
const lab = await startLab('bodies3d', Number(process.env.DEV_PORT) || 5193);
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.setViewport({ width: 1920, height: 1080 });
  for (const scene of scenes) for (const view of views) {
    await page.goto(lab.url(`scene=${scene}&view=${view}&live3d=1`), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 300000 });
    const file = `${out}/bodies-${scene}-${view}.png`;
    await page.screenshot({ path: file });
    console.log('shot', scene, view, '->', file);
  }
  await browser.close();
} finally { lab.stop(); }
