// Real input in real Chrome: a held spell toward a wall, and a screenshot of it, to judge spell light and walls.
// Usage (after npm run build): node scripts/light-shot.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] + '/' : 'shots/light/';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, room, key, mood] of [['arcane-survive', 'survive', 's', ''], ['arcane-night', 'survive', 's', '&mood=night'], ['fire-night', 'survive', 'f', '&mood=night']]) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
    await p.setViewport({ width: 1920, height: 1080 });
    await p.goto(`${BASE}?timerloop=1&debug=0${mood}#${room}`);
    await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
    await sleep(600);
    const at = await p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies, s = g.view.camera.worldToScreen(b.x[0], b.y[0]); return s; });
    await p.mouse.move(at.x + 380, at.y - 130);
    await sleep(200);
    await p.keyboard.press(key);
    await sleep(150);
    await p.mouse.down({ button: 'right' });
    await sleep(1400);
    await p.screenshot({ path: OUT + name + '.png' });
    const st = await p.evaluate(() => { const g = window.wizardSim, s = g.world.seats; return { phase: s.phase[0], aimX: s.aimX[0], aimY: s.aimY[0], endX: s.chanEndX[0], endY: s.chanEndY[0], x: g.world.bodies.x[0], y: g.world.bodies.y[0] }; });
    console.log(name, JSON.stringify(st));
    await p.mouse.up({ button: 'right' });
    await p.close();
  }
} finally { await browser.close(); stop(); }
