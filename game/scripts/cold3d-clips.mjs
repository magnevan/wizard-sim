// usage: node scripts/cold3d-clips.mjs (npm run clip:cold3d --) [out-dir] [--url http://localhost:5196] [--gl gpu|soft] [--only name,name] [--keep]
// The Frost ring's films (docs/explorations/2026-11-25-spell-concepts-tone.md, the crisp build): frames rendered at
// 30 fps from the 3D VFX Lab (cast3d.html ?clip=1, stepped with window.__seek) and the court (play3d.html ?shot=cold,
// stepped with window.__seek), encoded to H.264 MP4 with ffmpeg, as <name>.mp4 in out-dir (default
// shots/port-3d/tone/cold), with a few stills of each as <name>-t<s>.png. --keep keeps every frame (in out-dir/frames).
// Uses a dev server already running at --url (lab pages aren't in the build), else starts its own on 5196 and stops
// only that one. --gl gpu (default) renders on the machine's GPU; soft is SwiftShader. FFMPEG names ffmpeg if it isn't
// on the PATH.
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const GL = takeOpt(args, 'gl', 'gpu'), URL0 = takeOpt(args, 'url', ''), only = takeOpt(args, 'only', '').split(',').filter(Boolean);
const keep = args.includes('--keep');
if (keep) args.splice(args.indexOf('--keep'), 1);
const out = resolve(args.shift() ?? 'shots/port-3d/tone/cold');
mkdirSync(out, { recursive: true });
const FFMPEG = process.env.FFMPEG ?? [join(homedir(), 'AppData/Roaming/ffmpeg/bin/ffmpeg.exe')].find((p) => existsSync(p)) ?? 'ffmpeg';

/** name -> [page, query, from s, to s, stills (s)]; every film at the game camera (30 u) unless it says. */
const FILMS = {
  'lab-n1': ['cast3d', 'spell=cold&form=area&view=30&scene=crowd', -0.15, 3.0, [0.15, 0.3, 0.45, 1.5]],
  'lab-n3': ['cast3d', 'spell=cold,cold,cold&form=area&view=30&scene=crowd', -0.15, 3.4, [0.15, 0.3, 0.5, 1.6]],
  'lab-n5': ['cast3d', 'spell=cold,cold,cold,cold,cold&form=area&view=30&scene=crowd', -0.15, 4.0, [0.2, 0.45, 0.8, 1.2, 2.0]],
  'lab-n3-walk': ['cast3d', 'spell=cold,cold,cold&form=area&view=30&scene=empty&move=1', -0.3, 2.6, [0.2, 0.4, 0.7]],
  'lab-n3-close': ['cast3d', 'spell=cold,cold,cold&form=area&view=12&scene=crowd', -0.1, 1.6, [0.15, 0.3, 0.45, 0.6]],
  'lab-n3-zoom': ['cast3d', 'spell=cold,cold,cold&form=area&view=6&scene=empty', 0.2, 0.9, [0.3, 0.5, 0.7]],
  'court-n3': ['play3d', 'shot=cold&cam=30&local=0', -0.15, 3.4, [0.2, 0.4, 1.4]],
};

const lab = URL0 ? { url: (page, qs) => `${URL0}/${page}.html?${qs}`, stop: () => {} } : await (async () => {
  const l = await startLab('cast3d', 5196);
  return { url: (page, qs) => l.url('').replace(/cast3d\.html.*$/, '') + `${page}.html?${qs}`, stop: l.stop };
})();
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: glArgs });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  page:', m.text().slice(0, 300)); });
  for (const [name, [pg, qs, from, to, stills]] of Object.entries(FILMS)) {
    if (only.length && !only.includes(name)) continue;
    const t = Date.now(), dir = join(out, 'frames', name);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    await page.setViewport({ width: 960, height: 540 });
    await page.goto(lab.url(pg, `${qs}&clip=1&t=${from}`), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 200 });
    const n = Math.round((to - from) * 30);
    for (let i = 0; i <= n; i++) {
      const s = from + i / 30;
      await page.evaluate((x) => window.__seek(x), s);
      await page.waitForFunction('window.__ready === true', { timeout: 60000, polling: 50 });
      await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
      const still = stills.find((x) => Math.abs(x - s) < 1 / 60);
      if (still !== undefined) copyFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), join(out, `${name}-t${still}.png`));
    }
    const mp4 = join(out, `${name}.mp4`);
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error(`ffmpeg failed on ${name}`);
    if (!keep) rmSync(dir, { recursive: true, force: true });
    console.log(`${name}: ${n + 1} frames, ${((Date.now() - t) / 1000).toFixed(1)} s -> ${mp4}`);
  }
  await browser.close();
} finally { lab.stop(); }
