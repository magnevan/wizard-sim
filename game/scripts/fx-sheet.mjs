// usage: node scripts/fx-sheet.mjs (npm run fx-sheet --) <job> [<job> ...] [options]
//        node scripts/fx-sheet.mjs --serve          keep a lab server up (Ctrl+C stops it); later runs use it at once
// Fast checks of a 3D spell effect in the effects lab (cast3d.html): frame sheets (the cast frozen at each of N moments,
// tiled into one labelled PNG) and clips, for a whole batch of jobs on ONE dev server and ONE browser.
//
//   a job:  a lab recipe, then its own options after `;`:  "fire,fire,fire,fire,fire/place;t=0.1,1.5,4;view=12"
//   --t 0.1,0.5,1.5,4    the moments (s after the cast went off), or a range a:b:step (default 0.1,0.3,0.6,1,1.5,2.5,4,6)
//   --view 14            ground in view, u            --scene sparse   crowd | sparse | empty | attack
//   --size 640x400       each frame's size            --cols 4         frames across the sheet
//   --off floor.gas,wave.sparks   parts not drawn (?fxoff=, view3d/fx-off.ts)
//   --q "hit=1&aim=2,0"  any other lab options       --name n         the output's name (default from the recipe)
//   --clip 3             also a clip of that many s from --from (default -0.1) at --fps (30): <name>.mp4 and a sheet of
//                        its frames (<name>-clip.png, --clipcols frames across, every --every'th frame, default 8 across)
//   --tiles              also the lab's own tiled sheet of the same moments (?spells=), to check tiles against frames
//   --out shots/fx       where it writes              --gl gpu|soft    the GPU (default) or SwiftShader
//   --url http://localhost:5199   use that dev server (default: the --serve one on 5199 if it answers, else its own)
//   --jobs file.json     jobs from a file: a list of { "spell": "...", "t": "...", "view": 12, ... } (the same keys)
// Each moment is a __seek on the frozen page (no reload), and pages are reloaded only when a job's lab options change.
// The server runs with HMR off, so an edit elsewhere never reloads the page mid-batch (the next page load still gets it).
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CLIENT, findChrome } from './serve.mjs';
import { takeOpt } from './lab-page.mjs';

const T_START = performance.now();
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; };
const G = {
  t: takeOpt(args, 't', '0.1,0.3,0.6,1,1.5,2.5,4,6'), view: takeOpt(args, 'view', '14'), scene: takeOpt(args, 'scene', 'sparse'),
  size: takeOpt(args, 'size', '640x400'), cols: takeOpt(args, 'cols', '4'), off: takeOpt(args, 'off', ''), q: takeOpt(args, 'q', ''),
  clip: takeOpt(args, 'clip', ''), from: takeOpt(args, 'from', '-0.1'), fps: takeOpt(args, 'fps', '30'),
  every: takeOpt(args, 'every', ''), clipcols: takeOpt(args, 'clipcols', '8'), name: takeOpt(args, 'name', ''), tiles: flag('tiles') ? '1' : '',
};
const OUT = resolve(takeOpt(args, 'out', 'shots/fx')), GL = takeOpt(args, 'gl', 'gpu'), URL0 = takeOpt(args, 'url', '');
const JOBS = takeOpt(args, 'jobs', ''), SERVE = flag('serve');
const PORT = 5199, SERVE_URL = `http://localhost:${PORT}`;
const ffmpeg = process.env.FFMPEG ?? 'C:/Users/mvikj/AppData/Roaming/ffmpeg/bin/ffmpeg.exe';
const unknown = args.filter((a) => a.startsWith('--'));
if (unknown.length) { console.error(`fx-sheet: unknown option ${unknown.join(' ')}`); process.exit(1); }

/** Starts the lab's dev server in this process, HMR off; returns its url and stop(). */
async function startServer() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: CLIENT, configFile: join(CLIENT, 'vite.config.ts'), logLevel: 'warn', server: { port: PORT, strictPort: true, hmr: false } });
  await server.listen();
  return { url: SERVE_URL, stop: () => server.close() };
}
const answers = async (u) => { try { return (await fetch(`${u}/cast3d.html`)).ok; } catch { return false; } };

if (SERVE) {
  if (await answers(SERVE_URL)) { console.log(`fx-sheet: a server already answers on ${SERVE_URL}`); process.exit(0); }
  await startServer();
  console.log(`fx-sheet: the lab server is up on ${SERVE_URL} (HMR off); Ctrl+C stops it`);
  await new Promise(() => {});
}

// ---- the jobs ----------------------------------------------------------------------------------------------------------
/** "a,b,c" or "a:b:step" -> numbers. */
const times = (s) => {
  if (s.includes(':')) { const [a, b, st] = s.split(':').map(Number), out = []; for (let k = 0; a + k * st <= b + 1e-9; k++) out.push(+(a + k * st).toFixed(4)); return out; }
  return s.split(',').filter(Boolean).map(Number);
};
const slug = (s) => s.replace(/[^a-z0-9@.]+/gi, '-').replace(/^-|-$/g, '');
let raw = args.map((a) => { const [spell, ...kv] = a.split(';'); return { spell, ...Object.fromEntries(kv.map((p) => { const i = p.indexOf('='); return i < 0 ? [p, '1'] : [p.slice(0, i), p.slice(i + 1)]; })) }; });
if (JOBS) raw = raw.concat(JSON.parse(readFileSync(JOBS, 'utf8')));
if (!raw.length) { console.log('usage: node scripts/fx-sheet.mjs <recipe>[;t=..;view=..] ... [--t ..] [--view ..] [--off ..] [--clip s] [--tiles] (see the file\'s head)'); process.exit(1); }
const jobs = raw.map((j) => {
  const o = { ...G, ...Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)])) };
  const [w, h] = o.size.split('x').map(Number);
  const page = `spell=${o.spell}&view=${o.view}&scene=${o.scene}${o.off ? `&fxoff=${o.off}` : ''}${o.q ? `&${o.q}` : ''}`;
  return { ...o, w, h, ts: times(o.t), cols: Number(o.cols), page, name: o.name || slug(`${o.spell}${o.off ? '-off-' + o.off : ''}`) };
});

// ---- the server and the browser ---------------------------------------------------------------------------------------
const clock = { server: 0, browser: 0, loads: 0, nLoads: 0, frames: 0, nFrames: 0, compose: 0 };
let t = performance.now();
const lab = URL0 ? { url: URL0, stop: () => {} } : (await answers(SERVE_URL)) ? { url: SERVE_URL, stop: () => {} } : await startServer();
clock.server = performance.now() - t;
console.log(`fx-sheet: ${lab.url}${lab.url === SERVE_URL && clock.server < 500 ? ' (already up)' : ''}  ${(clock.server / 1000).toFixed(1)} s`);
t = performance.now();
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: ['--hide-scrollbars', ...glArgs] });
clock.browser = performance.now() - t;
mkdirSync(OUT, { recursive: true });

const page = await browser.newPage();
// the lab's canvas read back (it keeps its drawing buffer): quicker than a screenshot, which can wait minutes for a
// compositor frame on a page that draws nothing more, and free of the page's own captions
await page.evaluateOnNewDocument(() => { window.grab = () => document.querySelector('canvas').toDataURL('image/png').split(',')[1]; });
page.on('pageerror', (e) => console.log('  page error:', e.message));
const composer = await browser.newPage();
let loaded = '';

/** The job's page, frozen, loaded unless it's the one already shown; a reload only when its lab options differ. */
async function open(j, t0) {
  const key = `${j.page}|${j.w}x${j.h}`;
  if (loaded === key) return;
  const t1 = performance.now();
  await page.setViewport({ width: j.w, height: j.h });
  await page.goto(`${lab.url}/cast3d.html?${j.page}&t=${t0}`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction('window.__ready === true', { timeout: 600000, polling: 100 });
  loaded = key; clock.loads += performance.now() - t1; clock.nLoads++;
}
/** The frozen page at t, as PNG (base64). */
async function at(t) {
  const t1 = performance.now();
  const png = await page.evaluate((x) => { window.__seek(x); return window.grab(); }, t);
  clock.frames += performance.now() - t1; clock.nFrames++;
  return png;
}

/** Tiles PNGs (base64) into one labelled sheet in the browser and writes it. */
async function compose(file, title, tiles, cols, w, h) {
  const t1 = performance.now();
  const url = await composer.evaluate(async (title, tiles, cols, w, h) => {
    const rows = Math.ceil(tiles.length / cols), head = 26, c = document.createElement('canvas');
    c.width = w * Math.min(cols, tiles.length); c.height = head + h * rows;
    const g = c.getContext('2d');
    g.fillStyle = '#101216'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8eaf0'; g.font = '600 15px system-ui, sans-serif'; g.fillText(title, 8, 18);
    for (let i = 0; i < tiles.length; i++) {
      const im = new Image(); im.src = `data:image/png;base64,${tiles[i].png}`; await im.decode();
      const x = (i % cols) * w, y = head + Math.floor(i / cols) * h;
      if (tiles[i].src) g.drawImage(im, tiles[i].src[0], tiles[i].src[1], w, h, x, y, w, h); else g.drawImage(im, x, y, w, h);
      g.strokeStyle = '#000'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.font = '700 16px system-ui, sans-serif'; g.lineWidth = 3; g.strokeStyle = '#000'; g.fillStyle = '#ffd860';
      g.strokeText(tiles[i].label, x + 8, y + h - 10); g.fillText(tiles[i].label, x + 8, y + h - 10);
      g.lineWidth = 1;
    }
    return c.toDataURL('image/png');
  }, title, tiles, cols, w, h);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  clock.compose += performance.now() - t1;
  console.log(`  -> ${file}`);
}

try {
  for (const j of jobs) {
    const tj = performance.now();
    const title = `${j.spell}  ·  view ${j.view}  ·  scene ${j.scene}${j.off ? `  ·  off: ${j.off}` : ''}${j.q ? `  ·  ${j.q}` : ''}`;
    console.log(`${j.name}: ${j.ts.length} moments`);
    // the frame sheet: one page, a seek a moment (the earliest first, so each seek only steps on)
    const ts = [...j.ts].sort((a, b) => a - b);
    await open(j, ts[0]);
    const frames = [];
    for (const x of ts) frames.push({ label: `t = ${x} s`, png: await at(x) });
    await compose(join(OUT, `${j.name}.png`), title, frames, j.cols, j.w, j.h);
    // the lab's own tiled sheet of the same moments (one page load: every tile its own world)
    if (j.tiles) {
      const tq = `spells=${ts.map((x) => `${j.spell}|${x}`).join(';')}&cols=${j.cols}&tile=${j.w}x${j.h}&view=${j.view}&scene=${j.scene}${j.off ? `&fxoff=${j.off}` : ''}${j.q ? `&${j.q}` : ''}`;
      const rows = Math.ceil(ts.length / j.cols);
      await page.setViewport({ width: j.w * Math.min(j.cols, ts.length), height: j.h * rows });
      const t1 = performance.now();
      await page.goto(`${lab.url}/cast3d.html?${tq}`, { waitUntil: 'load', timeout: 300000 });
      await page.waitForFunction('window.__ready === true', { timeout: 600000, polling: 100 });
      clock.loads += performance.now() - t1; clock.nLoads++; loaded = '';
      // cut back into its tiles, labelled as the frames are
      const sheet = await page.evaluate(() => window.grab());
      await compose(join(OUT, `${j.name}-tiles.png`), `${title}  ·  the lab's tiles (?spells=, each its own world)`, ts.map((x, i) => ({ label: `t = ${x} s`, png: sheet, src: [(i % j.cols) * j.w, Math.floor(i / j.cols) * j.h] })), j.cols, j.w, j.h);
    }
    // the clip: a seek a frame from --from, each frame kept; an mp4 and a sheet of every n'th frame
    if (Number(j.clip) > 0) {
      const fps = Number(j.fps), n = Math.round(Number(j.clip) * fps), from = Number(j.from), dir = join(OUT, `${j.name}-frames`);
      if (existsSync(dir)) rmSync(dir, { recursive: true });
      mkdirSync(dir, { recursive: true });
      await open(j, from);
      const every = Number(j.every) || Math.max(1, Math.round(n / (Number(j.clipcols) * 2))), picks = [];
      for (let i = 0; i < n; i++) {
        const x = +(from + i / fps).toFixed(4), png = await at(x);
        writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
        if (i % every === 0) picks.push({ label: `t = ${x.toFixed(2)} s`, png });
        if (process.stdout.isTTY) process.stdout.write(`\r  clip frame ${i + 1}/${n}`);
      }
      console.log(`${process.stdout.isTTY ? '\n' : ''}  ${n} clip frames in ${dir}`);
      await compose(join(OUT, `${j.name}-clip.png`), `${title}  ·  clip, every ${every} of ${fps} fps`, picks, Number(j.clipcols), Math.round(j.w / 2), Math.round(j.h / 2));
      if (existsSync(ffmpeg)) {
        const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-vf', `scale=${j.w}:-2`, '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, `${j.name}.mp4`)], { stdio: 'inherit' });
        if (r.status === 0) console.log(`  -> ${join(OUT, `${j.name}.mp4`)}`);
      } else console.log(`  (no ffmpeg at ${ffmpeg}: set FFMPEG; the frames are in ${dir})`);
    }
    console.log(`  ${((performance.now() - tj) / 1000).toFixed(1)} s`);
  }
} finally {
  await browser.close();
  await lab.stop();
}
const s = (ms) => (ms / 1000).toFixed(1);
console.log(`fx-sheet: ${s(performance.now() - T_START)} s in all: server ${s(clock.server)}, browser ${s(clock.browser)}, ${clock.nLoads} page load(s) ${s(clock.loads)}, ${clock.nFrames} frame(s) ${s(clock.frames)} (${clock.nFrames ? Math.round(clock.frames / clock.nFrames) : 0} ms each), sheets ${s(clock.compose)}`);
process.exit(0);
