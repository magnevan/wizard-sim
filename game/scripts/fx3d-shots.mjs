// usage: node scripts/fx3d-shots.mjs (npm run shot:fx3d --) [--out shots/port-3d/fx] [--gl gpu|soft] [--port 5194] [--only name,name] [--url http://localhost:5194]
// The 3D effects spike's step-0 shots (docs/explorations/2026-11-25-fx3d-spike.md): the effects lab (fx3d.html) frozen
// at set times, for both looks: film strips of the Fire spray at one and five runes, a sweep, and the fire floor, plus
// single frames at the game camera's distance. Starts its own vite dev server on --port (lab pages aren't in the build)
// and stops only that one, unless --url points at a server already running. --gl gpu (default) renders on the
// machine's GPU; soft is SwiftShader (as CI would).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';
import { startLab } from './lab-page.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/port-3d/fx')), GL = arg('gl', 'gpu'), PORT = Number(arg('port', 5194));
const only = arg('only', '')?.split(',').filter(Boolean) ?? [];
const STRIP = 'times=0.1,0.3,0.6,1,2&tile=560x420&view=13';

/** name -> query; strips size themselves (tile × times), singles are 1600 × 900. */
const SHOTS = {};
for (const look of ['a', 'b']) {
  SHOTS[`${look}-spray-n1-strip`] = `look=${look}&n=1&${STRIP}`;
  SHOTS[`${look}-spray-n5-strip`] = `look=${look}&n=5&${STRIP}`;
  SHOTS[`${look}-sweep-n3-strip`] = `look=${look}&n=3&sweep=1&times=0.4,0.6,0.8,1,1.2&tile=560x420&view=13`;
  SHOTS[`${look}-floor-n3-strip`] = `look=${look}&n=3&cast=floor&times=0.2,1,8,16,16.6&tile=560x420&view=11`;
  SHOTS[`${look}-both-n5-game`] = `look=${look}&n=5&cast=both&t=1`;
  SHOTS[`${look}-spray-n3-hit`] = `look=${look}&n=3&t=0.8&hit=1&view=13`;
}

const lab = arg('url', '') ? { url: (qs) => `${arg('url')}/fx3d.html?${qs}`, stop: () => {} } : await startLab('fx3d', PORT);
mkdirSync(out, { recursive: true });
const glArgs = GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
try {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: glArgs });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  page:', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  for (const [name, qs] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    const p = new URLSearchParams(qs), n = (p.get('times') ?? '').split(',').filter(Boolean).length;
    const [tw, th] = (p.get('tile') ?? '640x480').split('x').map(Number);
    await page.setViewport(n ? { width: tw * n, height: th } : { width: 1600, height: 900 });
    const t = Date.now();
    await page.goto(lab.url(qs), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 240000 });
    const fx = await page.evaluate(() => window.__fx);
    const file = `${out}/${name}.png`;
    await page.screenshot({ path: file });
    console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(1)} s, ${JSON.stringify(fx)} -> ${file}`);
  }
  await browser.close();
} finally { lab.stop(); }
