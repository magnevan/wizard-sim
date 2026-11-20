// Screenshots of the Model Viewer (/models.html, dev server only) at given #hash states.
// Usage: node scripts/viewer-shots.mjs [--out shots/viewer] [--port 5199] [--wait 1500] name=hash [name=hash ...]
// A hash is the viewer's own state as key-value pairs joined by an ampersand: the keys are lab/models.ts DEFAULTS
// (m model, c clip, t time, f facing, view, wp weapon, gd guard, gu raised, play 0 to freeze, zoom, cam).
// Starts its own `vite` dev server on --port and stops only that process; needs a real GPU (d3d11) for the live 3D.
// Writes <out>/<name>.png, the whole page.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CLIENT, findChrome } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/viewer')), port = Number(arg('port', '5199')), wait = Number(arg('wait', '1500'));
const shots = process.argv.slice(2).filter((a, i, all) => a.includes('=') && !(i > 0 && all[i - 1].startsWith('--'))).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]);
if (!shots.length) { console.error('usage: node scripts/viewer-shots.mjs [--out dir] name=hash ...'); process.exit(1); }
mkdirSync(out, { recursive: true });
const base = `http://localhost:${port}/models.html`;
const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not yet */ } await sleep(200); }
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
    await p.setViewport({ width: 1400, height: 900 });
    for (const [name, hash] of shots) {
      await p.goto(base + '#' + hash, { waitUntil: 'load' });
      await p.reload({ waitUntil: 'load' });   // a hash-only goto doesn't reload the page
      await sleep(wait);
      await p.screenshot({ path: join(out, name + '.png') });
      console.log('shot', name);
    }
  } finally { await browser.close(); }
} finally { stop(); }
