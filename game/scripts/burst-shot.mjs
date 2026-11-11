// The imbued bursts (an element queued, then Shift+LMB) by real input in real Chrome, frame by frame, as one contact
// sheet: a row per element and aim, a column per moment.
// Usage (after npm run build): node scripts/burst-shot.mjs [--out shots/bursts.png] [--keys qrfsga] [--aims down,up]
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('out', 'shots/bursts.png');
// rows of rune keys, comma-separated; a row of several keys queues them all (gf: Earth then Fire)
const KEYS = arg('keys', 'q,r,f,s,g,a').split(',');
const AIMS = { down: [60, 140], up: [-40, -150], right: [170, 30] };
const aims = arg('aims', 'down,up').split(',');
// --foes: enemies set out in front, for the bursts that pick targets (Lightning's fork)
const FOES = process.argv.includes('--foes');
const TIMES = (arg('times', '80,200,350,600,1000')).split(',').map(Number);
const NAME = { q: 'water', w: 'life', r: 'cold', a: 'lightning', s: 'arcane', f: 'fire', g: 'earth' };
const CW = 420, CH = 300;
mkdirSync(dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
try {
  for (const key of KEYS) for (const aim of aims) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
    await p.setViewport({ width: 1280, height: 800 });
    await p.goto(`${BASE}?timerloop=1&debug=0#survive`);
    await p.waitForFunction(() => window.wizardSim?.view.groundReady, { timeout: 60000, polling: 100 });
    await sleep(500);
    const at = await p.evaluate(() => { const g = window.wizardSim, b = g.world.bodies; return g.view.camera.worldToScreen(b.x[0], b.y[0]); });
    const [ax, ay] = AIMS[aim];
    await p.mouse.move(at.x + ax, at.y + ay);
    await sleep(100);
    // Screenshots are slow here, so the sim is paused from the start and stepped through the cast and on to each moment
    // (the effects run on sim time); every input lands on a stepped tick, and the burst's tick is watched for.
    await p.evaluate(() => { window.wizardSim.tune.paused = true; });
    const step = (n) => p.evaluate(async (n) => {
      const g = window.wizardSim, c0 = g.world.clock[0];
      g.tune.steps = n;
      while (g.world.clock[0] < c0 + n) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 60));
      return g.world.events.some((e) => e.kind === 'move' && e.text === 'imbue');
    }, n);
    if (FOES) {
      // a wave's enemies, set out in front of the caster along the aim: three in the cone, one further on to jump to
      await p.evaluate(() => window.wizardSim.startWave(1));
      const foes = () => p.evaluate(() => { const b = window.wizardSim.world.bodies; let n = 0; for (let i = 1; i < b.hp.length; i++) if (b.hp[i] > 0 && b.team[i] !== b.team[0]) n++; return n; });
      for (let k = 0; k < 40 && (await foes()) < 4; k++) await step(15);
      console.log('foes', await foes());
      await p.evaluate(() => {
        const w = window.wizardSim.world, b = w.bodies, s = w.seats, L = Math.hypot(s.aimX[0], s.aimY[0]) || 1, ux = s.aimX[0] / L, uy = s.aimY[0] / L;
        const spots = [[2, 0], [2.7, 0.9], [3.2, -0.9], [5.6, -0.6]];
        let k = 0;
        for (let i = 1; i < b.hp.length && k < spots.length; i++) {
          if (!(b.hp[i] > 0) || b.team[i] === b.team[0]) continue;
          const [a, sd] = spots[k++];
          b.x[i] = b.x[0] + ux * a - uy * sd; b.y[i] = b.y[0] + uy * a + ux * sd;
        }
      });
      await step(1);
    }
    let fired = false;
    for (const k1 of key) { await p.keyboard.down(k1); await step(2); await p.keyboard.up(k1); await step(2); }
    await p.keyboard.down('Shift'); await p.mouse.down({ button: 'left' });
    for (let k = 0; k < 3 && !fired; k++) fired = await step(1);
    await p.mouse.up({ button: 'left' }); await p.keyboard.up('Shift');
    for (let k = 0; k < 40 && !fired; k++) fired = await step(1);
    if (!fired) console.warn('no burst for', key, aim);
    const frames = [];
    let tick = 0;
    for (const ms of TIMES) {
      const want = Math.round((ms * 60) / 1000);
      if (want > tick) { await step(want - tick); tick = want; }
      frames.push((await p.screenshot({ clip: { x: at.x - CW / 2, y: at.y - CH / 2 - 20, width: CW, height: CH }, encoding: 'base64' })));
    }
    rows.push({ label: `${[...key].map((k1) => NAME[k1] ?? k1).join('+')} ${aim}`, frames });
    await p.close();
  }
  // the contact sheet
  const p = await browser.newPage();
  const W = CW * TIMES.length, H = (CH + 18) * rows.length;
  await p.setViewport({ width: W, height: H });
  await p.setContent('<body style="margin:0;background:#111"><canvas id=c></canvas></body>');
  await p.evaluate(async (rows, CW, CH, TIMES) => {
    const c = document.getElementById('c'); c.width = CW * TIMES.length; c.height = (CH + 18) * rows.length;
    const x = c.getContext('2d'); x.font = '14px monospace'; x.fillStyle = '#fff';
    for (let r = 0; r < rows.length; r++) {
      x.fillText(rows[r].label + '   ' + TIMES.map((t) => t + 'ms').join(' / '), 6, r * (CH + 18) + 14);
      for (let k = 0; k < rows[r].frames.length; k++) {
        const im = new Image(); im.src = 'data:image/png;base64,' + rows[r].frames[k]; await im.decode();
        x.drawImage(im, k * CW, r * (CH + 18) + 18);
      }
    }
  }, rows, CW, CH, TIMES);
  await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
  console.log('contact sheet:', OUT);
} finally { await browser.close(); stop(); }
