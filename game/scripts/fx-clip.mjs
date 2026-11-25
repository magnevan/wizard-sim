// usage: node scripts/fx-clip.mjs (npm run clip:fx --) <out.mp4> --url "<page url>" [--from -0.1] [--secs 3] [--fps 30]
//          [--size 960x540] [--gl gpu|soft] [--ticks a:b:step]
// A video of a lab page's effect for a review page (docs/vfx-workflow.md), rendered frame by frame, so it plays at the
// real speed however slow the renderer is.
//
// - Live lab pages (cast3d.html or fx3d.html without ?t=): the page's clock is replaced by a virtual one
//   (performance.now, requestAnimationFrame), advanced 1/fps a frame. Recording starts once the page's caption reads
//   t = --from s or later (its cast event is t = 0) and runs --secs.
// - --ticks a:b:step: instead, one page load a frame with &ticks=k added (index.html?shot=fire: the shot's casts run k
//   ticks), k from a to b. Floor fire found after a jump is drawn already grown, so this shows the spray, not the floor's flare.
// Frames go to <out>-frames/ (kept until the next run), encoded with ffmpeg to H.264 (yuv420p, faststart).
// Needs a dev server for the page (lab pages aren't in the build): `npx vite --port <p>` in packages/client.
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const URL0 = takeOpt(args, 'url', ''), FROM = Number(takeOpt(args, 'from', '-0.1')), SECS = Number(takeOpt(args, 'secs', '3'));
const FPS = Number(takeOpt(args, 'fps', '30')), GL = takeOpt(args, 'gl', 'gpu'), TICKS = takeOpt(args, 'ticks', '');
const [W, H] = takeOpt(args, 'size', '960x540').split('x').map(Number);
const out = args.shift();
if (!out || !URL0) { console.log('usage: node scripts/fx-clip.mjs <out.mp4> --url "<page url>" [--from s] [--secs s] [--fps n] [--size WxH] [--ticks a:b:step]'); process.exit(1); }
const dir = resolve(out.replace(/\.mp4$/, '') + '-frames');
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });

/** The page's clock, replaced before any of its scripts run: time moves only when the script calls __vt.advance(dt). */
const VIRTUAL = () => {
  let now = 0; let q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
  window.__vt = {
    advance(dt) { now += dt * 1000; const run = q; q = []; for (const f of run) f(now); },
    get waiting() { return q.length; },
  };
};

const ffmpeg = process.env.FFMPEG ?? 'C:/Users/mvikj/AppData/Roaming/ffmpeg/bin/ffmpeg.exe';
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: glArgs });
let n = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.setViewport({ width: W, height: H });
  const frame = async () => { await page.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.png` }); };
  if (TICKS) {
    const [a, b, st] = TICKS.split(':').map(Number);
    for (let k = a; k <= b; k += st || 1) {
      await page.goto(`${URL0}&ticks=${k}`, { waitUntil: 'load', timeout: 180000 });
      await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 200 });
      await frame();
      process.stdout.write(`\r  ticks ${k}/${b}`);
    }
  } else {
    await page.evaluateOnNewDocument(VIRTUAL);
    await page.goto(URL0, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__vt && window.__vt.waiting > 0', { timeout: 600000, polling: 200 });
    const tOf = () => page.evaluate(() => { const m = /t = (-?[\d.]+) s/.exec(document.getElementById('info')?.textContent ?? ''); return m ? Number(m[1]) : NaN; });
    // run up to the moment, then record
    for (let i = 0; i < 60 * 20; i++) { const t = await tOf(); if (t >= FROM) break; await page.evaluate(() => window.__vt.advance(1 / 30)); }
    const total = Math.round(SECS * FPS);
    for (let i = 0; i < total; i++) {
      await frame();
      await page.evaluate((dt) => window.__vt.advance(dt), 1 / FPS);
      process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
  }
} finally { await browser.close(); }
console.log(`\n  ${n} frames in ${dir}`);
const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.png`, '-vf', `scale=${W}:-2`, '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(out)], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`  -> ${resolve(out)}`);
