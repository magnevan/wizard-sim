// usage: node scripts/earth3d-shots.mjs (npm run shot:earth3d --) [out-dir] [--gl gpu|soft] [--url http://localhost:5193] [--only name,name] [--clips] [--fps 30]
// The Earth rock's shots (docs/explorations/2026-11-25-spell-concepts-tone.md, the toon rock build): stills of the
// rock in flight and its impact at one, three and five runes in the 3D VFX Lab (cast3d.html) and in the court
// (play3d.html ?shot=earth), as <name>.png in out-dir (default shots/port-3d/tone/earth). With --clips it renders the
// clips instead, a frame a page load at each moment (everything is a pure function of the sim and the clock, so frames
// are exact), and encodes each to <name>.mp4 with ffmpeg (FFMPEG or the user's AppData copy). Uses a dev server
// already running at --url (lab pages aren't in the build), else starts its own on 5196 and stops only that one.
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const GL = takeOpt(args, 'gl', 'gpu'), URL0 = takeOpt(args, 'url', ''), only = takeOpt(args, 'only', '').split(',').filter(Boolean);
const FPS = Number(takeOpt(args, 'fps', '30'));
const CLIPS = args.includes('--clips'); if (CLIPS) args.splice(args.indexOf('--clips'), 1);
const out = resolve(args.shift() ?? 'shots/port-3d/tone/earth');
mkdirSync(out, { recursive: true });

/** name -> [page, query, width, height]. A tap (form=strike) throws a quick rock that breaks on the first goblin; a
 * full charge (form=force) pierces and flies its whole range (effects.ts). */
const STILLS = {
  'lab-n1-flight': ['cast3d', 'spell=earth&n=1&form=strike&scene=empty&t=0.3&view=14', 1600, 900],
  'lab-n3-flight': ['cast3d', 'spell=earth&n=3&form=strike&scene=empty&t=0.3&view=14', 1600, 900],
  'lab-n5-flight': ['cast3d', 'spell=earth&n=5&form=strike&scene=empty&t=0.3&view=14', 1600, 900],
  'lab-n5-charged': ['cast3d', 'spell=earth&n=5&scene=empty&t=0.45&view=14', 1600, 900],
  'lab-n1-impact': ['cast3d', 'spell=earth&n=1&form=strike&t=0.52&view=12', 1600, 900],
  'lab-n3-impact': ['cast3d', 'spell=earth&n=3&form=strike&t=0.52&view=12', 1600, 900],
  'lab-n5-impact': ['cast3d', 'spell=earth&n=5&form=strike&t=0.52&view=12', 1600, 900],
  'lab-n3-after': ['cast3d', 'spell=earth&n=3&form=strike&t=1.6&view=12', 1600, 900],
  'lab-n3-game': ['cast3d', 'spell=earth&n=3&form=strike&t=0.3&view=30', 1600, 900],
  'court-n3-flight': ['play3d', 'shot=earth&cam=30&local=0&shotTicks=50', 1920, 1080],
  'court-n3-impact': ['play3d', 'shot=earth&cam=30&local=0&shotTicks=90', 1920, 1080],
};

/** name -> [page, query without the moment, from s, to s, width, height, moment key ('t' in s; shotTicks in ticks)]. */
const CLIPSPEC = {
  'clip-lab-n1': ['cast3d', 'spell=earth&n=1&form=strike&view=30', -0.1, 2.4, 1280, 720, 't'],
  'clip-lab-n5': ['cast3d', 'spell=earth&n=5&form=strike&view=30', -0.1, 2.4, 1280, 720, 't'],
  'clip-lab-n5-charged': ['cast3d', 'spell=earth&n=5&view=30', -1.2, 1.8, 1280, 720, 't'],
  'clip-lab-n3-close': ['cast3d', 'spell=earth&n=3&form=strike&view=14', -0.1, 2.0, 1280, 720, 't'],
  'clip-court-n1': ['play3d', 'shot=earth1&cam=30&local=0', 0.5, 2.6, 1280, 720, 'shotTicks'],
};

const FFMPEG = process.env.FFMPEG ?? join(homedir(), 'AppData/Roaming/ffmpeg/bin/ffmpeg.exe');
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
  const shoot = async (pg, qs, w, h, file) => {
    await page.setViewport({ width: w, height: h });
    await page.goto(lab.url(pg, qs), { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 100 });
    await page.screenshot({ path: file });
  };
  if (!CLIPS) {
    for (const [name, [pg, qs, w, h]] of Object.entries(STILLS)) {
      if (only.length && !only.includes(name)) continue;
      const t = Date.now();
      await shoot(pg, qs, w, h, `${out}/${name}.png`);
      console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
  } else {
    for (const [name, [pg, qs, t0, t1, w, h, key]] of Object.entries(CLIPSPEC)) {
      if (only.length && !only.includes(name)) continue;
      const dir = join(out, `${name}-frames`);
      rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
      const n = Math.round((t1 - t0) * FPS), start = Date.now();
      for (let f = 0; f <= n; f++) {
        const t = t0 + f / FPS, at = key === 't' ? `t=${t.toFixed(4)}` : `${key}=${Math.round(t * 60)}`;
        await shoot(pg, `${qs}&${at}`, w, h, join(dir, `f${String(f).padStart(4, '0')}.png`));
      }
      const mp4 = `${out}/${name}.mp4`;
      if (existsSync(FFMPEG)) {
        const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
        console.log(`${name}: ${n + 1} frames in ${((Date.now() - start) / 1000).toFixed(0)} s -> ${r.status === 0 ? mp4 : 'ffmpeg failed'}`);
      } else console.log(`${name}: frames in ${dir} (no ffmpeg at ${FFMPEG})`);
    }
  }
  await browser.close();
} finally { lab.stop(); }
