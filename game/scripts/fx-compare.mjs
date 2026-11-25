// usage: node scripts/fx-compare.mjs [out-dir] [--only fire,arcane] [--gpu]
// The spell-effects study (docs/threads/spell-effects-3d.md): each effect in the pixel game (vfx-lab.html) and in 3D
// (cast3d.html, at the game's 30 u) at the same moments after the cast, and how much of it moves.
//   <name>-pixel.png, <name>-3d.png  film strips at the same times (crowd scene)
//   motion.json                      per effect and renderer: the effect's area (pixels that differ from the frame
//                                    before the cast) and the share of it that changes from one 1/30 s frame to the
//                                    next, averaged over a few moments (empty scene)
// Serves its own dev server on DEV_PORT (default 5296). Software GL by default; --gpu for the real GPU.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab, takeOpt } from './lab-page.mjs';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
if (gpu) args.splice(args.indexOf('--gpu'), 1);
const only = takeOpt(args, 'only', '');
const out = resolve(args.shift() ?? 'shots/port-3d/study');
mkdirSync(out, { recursive: true });

// recipe: runes and form, as both labs take them; times for the strip; moments for the motion measure
const FX = [
  { name: 'fire', runes: 'fire,fire,fire', form: 'force', times: [0.1, 0.3, 0.6, 1.0, 1.6], motion: [0.5, 0.9, 1.3] },
  { name: 'arcane', runes: 'arcane,arcane,arcane', form: 'force', times: [0.1, 0.3, 0.6, 1.0, 1.6], motion: [0.5, 0.9, 1.3] },
  { name: 'cold', runes: 'cold,cold,cold', form: 'area', times: [0.05, 0.15, 0.3, 0.5, 0.9], motion: [0.1, 0.2, 0.35] },
  { name: 'earth', runes: 'earth,earth,earth', form: 'force', times: [0.1, 0.25, 0.4, 0.6, 1.0], motion: [0.15, 0.35, 0.55] },
].filter((f) => !only || only.split(',').includes(f.name));

const W = 960, H = 540, STEP = 1 / 30;
const lab = await startLab('cast3d', Number(process.env.DEV_PORT) || 5296);
const base = lab.url('').replace(/cast3d\.html.*$/, '');
const gl = gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 900000, args: gl });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));

const pixelReady = () => page.waitForFunction('document.documentElement.dataset.ready === "1"', { timeout: 600000, polling: 500 });
const d3Ready = async () => {
  await page.waitForFunction('window.__ready === true || !!window.__error', { timeout: 600000, polling: 500 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
};
const shot = async () => (await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 0, width: W, height: H } }));

/** Pixel lab frames at each t (one load, then setTime). */
async function pixelFrames(f, ts) {
  await page.setViewport({ width: W, height: H });
  await page.goto(`${base}vfx-lab.html?spell=${f.runes}&form=${f.form}&scene=empty&bar=0&scale=2&t=${ts[0]}`, { waitUntil: 'load' });
  await pixelReady();
  await new Promise((r) => setTimeout(r, 300));
  const frames = [];
  for (const t of ts) {
    await page.evaluate((t) => window.vfxLab.setTime(t), t);
    await new Promise((r) => setTimeout(r, 120));
    frames.push(await shot());
  }
  return frames;
}

/** 3D lab frames at each t (clip mode: one load, then __seek forward). */
async function d3Frames(f, ts) {
  await page.setViewport({ width: W, height: H });
  await page.goto(`${base}cast3d.html?spell=${f.runes}/${f.form}&scene=empty&view=30&clip=1&t=${ts[0]}`, { waitUntil: 'load' });
  await d3Ready();
  const frames = [];
  for (const t of ts) {
    await page.evaluate((t) => { window.__ready = false; window.__seek(t); }, t);
    await d3Ready();
    frames.push(await shot());
  }
  return frames;
}

/** In the page: effect area vs the pre-cast frame, and the share of it that changes between each later pair. */
async function measure(frames) {
  return page.evaluate(async (frames) => {
    const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
    const imgs = await Promise.all(frames.map(load));
    const c = document.createElement('canvas'); c.width = imgs[0].width; c.height = imgs[0].height;
    const g = c.getContext('2d', { willReadFrequently: true });
    const px = imgs.map((im) => { g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; });
    const differs = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30;
    const [pre, ...rest] = px; const res = [];
    for (let k = 0; k + 1 < rest.length; k += 2) {
      const a = rest[k], b = rest[k + 1]; let area = 0, moving = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (!differs(a, pre, i) && !differs(b, pre, i)) continue;
        area++; if (differs(a, b, i)) moving++;
      }
      res.push({ area, moving, share: area ? +(moving / area).toFixed(3) : 0 });
    }
    return res;
  }, frames);
}

const motion = {};
try {
  for (const f of FX) {
    const t0 = Date.now();
    // strips (crowd), at matching moments
    await page.setViewport({ width: W * 5, height: H });
    await page.goto(`${base}vfx-lab.html?spell=${f.runes}&form=${f.form}&scene=crowd&bar=0&scale=2&times=${f.times.join(',')}`, { waitUntil: 'load' });
    await pixelReady(); await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${out}/${f.name}-pixel.png`, fullPage: true });
    const spells = f.times.map((t) => `${f.runes}/${f.form}|${t}`).join(';');
    await page.setViewport({ width: 480 * 5, height: 300 });
    await page.goto(`${base}cast3d.html?spells=${spells}&view=30&cols=5&tile=480x300`, { waitUntil: 'load' });
    await d3Ready(); await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${out}/${f.name}-3d.png` });
    // motion (empty scene): a pre-cast frame, then pairs 1/30 s apart
    const ts = [-0.05, ...f.motion.flatMap((t) => [t, t + STEP])];
    motion[f.name] = { pixel: await measure(await pixelFrames(f, ts)), d3: await measure(await d3Frames(f, ts)) };
    console.log(f.name, JSON.stringify(motion[f.name]), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  writeFileSync(`${out}/motion.json`, JSON.stringify(motion, null, 2));
} finally { await browser.close(); lab.stop(); }
