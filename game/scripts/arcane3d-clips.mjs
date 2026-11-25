// usage: node scripts/arcane3d-clips.mjs (npm run shot:arcane3d --) [out-dir] [--gl gpu|soft] [--url http://localhost:5192] [--only name,name] [--stills-only]
// The Arcane beam's shots and clips (docs/explorations/2026-11-25-spell-concepts-tone.md, the crisp build): stills from
// the 3D VFX Lab (cast3d.html) at one, three and five runes, close and at the game's 30 u, both impact variants
// (?impact=a|b), a sweep; and clips (30 fps MP4, H.264) drawn frame by frame through the lab's window.__seek(t), and of
// the court (index.html ?shot=arcane, stepped by window.__advance; a still from it). Out: <name>.png and <name>.mp4 in out-dir (default
// shots/port-3d/tone/arcane). Uses a dev server already running at --url, else starts its own on 5193 and stops only it.
// ffmpeg: FFMPEG, else ffmpeg on the PATH, else the user's %APPDATA%\ffmpeg\bin\ffmpeg.exe.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const GL = takeOpt(args, 'gl', 'gpu'), URL0 = takeOpt(args, 'url', ''), only = takeOpt(args, 'only', '').split(',').filter(Boolean);
const stillsOnly = args.includes('--stills-only');
if (stillsOnly) args.splice(args.indexOf('--stills-only'), 1);
const out = resolve(args.shift() ?? 'shots/port-3d/tone/arcane');
mkdirSync(out, { recursive: true });

const spell = (n) => Array(n).fill('arcane').join(',');
/** name -> [page, query, width, height] */
const STILLS = {
  'lab-n1-close': ['cast3d', `undying=1&spell=${spell(1)}&t=0.8&view=12`, 1600, 900],
  'lab-n3-close': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=12`, 1600, 900],
  'lab-n5-close': ['cast3d', `undying=1&spell=${spell(5)}&t=0.8&view=12`, 1600, 900],
  'lab-n3-close-b': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=12&impact=b`, 1600, 900],
  'lab-n5-close-b': ['cast3d', `undying=1&spell=${spell(5)}&t=0.8&view=12&impact=b`, 1600, 900],
  'lab-n3-game': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=30`, 1600, 900],
  'lab-n3-game-b': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=30&impact=b`, 1600, 900],
  'lab-n3-air': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=30&scene=empty`, 1600, 900],
  'lab-n3-sweep': ['cast3d', `undying=1&spell=${spell(3)}&t=0.9&view=16&sweep=1`, 1600, 900],
  'lab-n3-hit': ['cast3d', `undying=1&spell=${spell(3)}&t=0.8&view=16&hit=1`, 1600, 900],
};
/**
 * name -> [page, query, w, h, t0, t1, still?]: frames every 1/30 s from t0 to t1 (lab: s after the cast; court: from the
 * shot's moment); `still`, a frame also kept as <name>.png.
 */
const CLIPS = {
  'clip-lab-n1-a': ['cast3d', `undying=1&spell=${spell(1)}&view=30`, 960, 540, -0.1, 2.0],
  'clip-lab-n5-a': ['cast3d', `undying=1&spell=${spell(5)}&view=30`, 960, 540, -0.1, 2.0],
  'clip-lab-n1-b': ['cast3d', `undying=1&spell=${spell(1)}&view=30&impact=b`, 960, 540, -0.1, 2.0],
  'clip-lab-n5-b': ['cast3d', `undying=1&spell=${spell(5)}&view=30&impact=b`, 960, 540, -0.1, 2.0],
  'clip-lab-n3-close-a': ['cast3d', `undying=1&spell=${spell(3)}&view=12`, 960, 540, -0.1, 2.0],
  'clip-lab-n3-close-b': ['cast3d', `undying=1&spell=${spell(3)}&view=12&impact=b`, 960, 540, -0.1, 2.0],
  'clip-lab-n3-sweep': ['cast3d', `undying=1&spell=${spell(3)}&view=16&sweep=1`, 960, 540, -0.1, 2.0],
  'clip-court-n3-a': ['index', 'shot=arcane&cam=30&local=0', 960, 540, 0, 1.6, 14],
  'clip-court-n3-b': ['index', 'shot=arcane&cam=30&local=0&impact=b', 960, 540, 0, 1.6],
};

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const local = join(process.env.APPDATA ?? '', 'ffmpeg', 'bin', 'ffmpeg.exe');
  return existsSync(local) ? local : 'ffmpeg';
}

const lab = URL0 ? { url: (page, qs) => `${URL0}/${page}.html?${qs}`, stop: () => {} } : await (async () => {
  const l = await startLab('cast3d', 5193);
  return { url: (page, qs) => l.url('').replace(/cast3d\.html.*$/, '') + `${page}.html?${qs}`, stop: l.stop };
})();
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
const want = (name) => !only.length || only.includes(name);
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: glArgs });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  page:', m.text().slice(0, 300)); });
  const open = async (pg, qs, w, h) => {
    await page.setViewport({ width: w, height: h });
    await page.goto(lab.url(pg, qs), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 500 });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error(String(err));
  };
  for (const [name, [pg, qs, w, h]] of Object.entries(STILLS)) {
    if (!want(name)) continue;
    const t = Date.now();
    await open(pg, qs, w, h);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  if (!stillsOnly) for (const [name, [pg, qs, w, h, t0, t1, still]] of Object.entries(CLIPS)) {
    if (!want(name)) continue;
    const t = Date.now(), dir = join(out, `${name}-frames`);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const lab3 = pg === 'cast3d';
    await open(pg, lab3 ? `${qs}&t=${t0}` : qs, w, h);
    // the court's models load after the shot's first frames: give them a moment, then draw again
    if (!lab3) { await new Promise((r) => setTimeout(r, 4000)); await page.evaluate(() => window.__advance(0)); }
    const n = Math.round((t1 - t0) * 30);
    for (let f = 0; f <= n; f++) {
      if (lab3) await page.evaluate((s) => window.__seek(s), t0 + f / 30);
      else if (f > 0) await page.evaluate(() => window.__advance(2));
      await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.png`) });
      if (f === still) copyFileSync(join(dir, `${String(f).padStart(4, '0')}.png`), join(out, `${name}.png`));
    }
    const mp4 = join(out, `${name}.mp4`);
    const r = spawnSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(dir, '%04d.png'), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
    rmSync(dir, { recursive: true, force: true });
    console.log(`${name}: ${n + 1} frames, ${((Date.now() - t) / 1000).toFixed(1)} s -> ${mp4}`);
  }
  await browser.close();
} finally { lab.stop(); }
