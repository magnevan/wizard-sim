// Sound, checked without ears, in headless Chrome.
// 1. The Sound Gallery: every sound rendered offline through the game's graph (OfflineAudioContext): none silent,
//    none clipping, lengths sane; the variations really differ; a screenshot of the page.
// 2. The game: sound starts on the first input, every clip loads, voices play, none is missing, the volumes persist,
//    ?sound=0 has none, and a page with no Web Audio at all still runs. A screenshot of Settings.
// Usage (after npm run build and npm run sound-gallery): node scripts/sound-check.mjs [--out dir] [--no-game]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf('--out');
const out = resolve(outArg > 0 ? process.argv[outArg + 1] : 'shots');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // ---- the gallery ----
  const g = await browser.newPage();
  g.on('pageerror', (e) => fail('gallery page error: ' + e.message));
  await g.setViewport({ width: 1280, height: 900 });
  await g.goto(pathToFileURL(join(here, '../../tools/sound-gallery/index.html')).href);
  await g.waitForFunction(() => !!window.SoundLab, { timeout: 20000 });
  const items = await g.evaluate(() => window.SoundLab.items);
  const clips = await g.evaluate(() => window.SoundLab.clipCount());
  console.log(`${items.length} sounds, ${clips} clips decoded`);
  if (clips < 60) fail(`only ${clips} clips decoded on the gallery page`);
  const rows = {};
  for (const it of items) rows[it.id] = await g.evaluate((id) => window.SoundLab.measureItem(id), it.id);
  const table = [];
  for (const it of items) {
    const m = rows[it.id];
    table.push(`${it.id.padEnd(18)} peak ${db(m.peak).padStart(6)} dB  rms ${db(m.rms).padStart(6)} dB  rings ${m.ringing.toFixed(2).padStart(5)} s  zc ${String(Math.round(m.zcr)).padStart(6)}/s  low ${(m.low * 100).toFixed(0).padStart(3)}%  ${it.source}`);
    if (m.peak < 0.02 || m.rms < 0.0015) fail(`${it.id} is nearly silent (peak ${m.peak.toFixed(4)}, rms ${m.rms.toFixed(4)})`);
    if (m.clipped > 0) fail(`${it.id} clips (${m.clipped} samples at full scale)`);
    if (m.ringing < 0.015) fail(`${it.id} is too short (${m.ringing.toFixed(3)} s)`);
    if (m.ringing > 7) fail(`${it.id} rings too long (${m.ringing.toFixed(1)} s)`);
  }
  console.log(table.join('\n'));
  writeFileSync(join(out, 'sound-levels.txt'), table.join('\n') + '\n');

  // the variations must really differ
  const r = (id) => rows[id];
  const up = (name, a, b) => { if (!(b > a)) fail(`${name}: expected ${a.toFixed(4)} < ${b.toFixed(4)}`); };
  console.log('\nrunes  rms', ['1', '3', '5'].map((n) => db(r(`var-runes-${n}`).rms)).join(' / '), ' rings', ['1', '3', '5'].map((n) => r(`var-runes-${n}`).ringing.toFixed(2)).join(' / '), ' zc', ['1', '3', '5'].map((n) => Math.round(r(`var-runes-${n}`).zcr)).join(' / '));
  up('3 runes ring longer than 1', r('var-runes-1').ringing, r('var-runes-3').ringing);
  up('5 runes ring longer than 3', r('var-runes-3').ringing, r('var-runes-5').ringing);
  up('5 runes are heavier than 1', r('var-runes-1').low, r('var-runes-5').low);
  console.log('rooms  rings', ['outdoor', 'hall', 'cave'].map((n) => `${n} ${r(`var-env-${n}`).ringing.toFixed(2)}`).join(' / '));
  up('a hall rings longer than outdoors', r('var-env-outdoor').ringing, r('var-env-hall').ringing);
  up('a cave rings longer than a hall', r('var-env-hall').ringing, r('var-env-cave').ringing);
  console.log('walls  rms', ['open', 'one', 'two'].map((n) => db(r(`var-wall-${n}`).rms)).join(' / '), ' zc', ['open', 'one', 'two'].map((n) => Math.round(r(`var-wall-${n}`).zcr)).join(' / '));
  up('a wall is quieter', r('var-wall-one').rms, r('var-wall-open').rms);
  up('two walls are quieter', r('var-wall-two').rms, r('var-wall-one').rms);
  up('a wall is duller', r('var-wall-one').zcr, r('var-wall-open').zcr);

  // a mix is more than its loudest part: the composed spell changes with what's in it
  const fingerprint = async (q, c) => g.evaluate((a, b) => window.SoundLab.measureMix(a, b), q, c);
  const [fire, ice] = [await fingerprint(['fire', 'fire'], 'area'), await fingerprint(['cold', 'cold'], 'area')];
  if (Math.abs(fire.zcr - ice.zcr) < 200) fail('Fire and Cold novas have nearly the same brightness');
  // two rolls of the same sound shouldn't be the same waveform
  const [a, b] = await g.evaluate(async () => [await window.SoundLab.measureItem('hit-light', 1), await window.SoundLab.measureItem('hit-light', 4)]);
  console.log(`repeat variation: rms ${db(a.rms)} vs ${db(b.rms)}`);

  // a hundred hits stay under the ceiling
  console.log(`crowd: peak ${db(r('var-crowd').peak)} dB, rms ${db(r('var-crowd').rms)} dB`);

  // the elements' fingerprints, for a human to read: pairs that sit close may blur by ear
  const els = items.filter((i) => i.group === 'elements').map((i) => ({ id: i.id, zcr: rows[i.id].zcr, low: rows[i.id].low }));
  const near = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const d = Math.abs(Math.log(els[i].zcr / els[j].zcr)) + Math.abs(els[i].low - els[j].low) * 2;
    near.push([d, `${els[i].id} ~ ${els[j].id}`]);
  }
  near.sort((p, q) => p[0] - q[0]);
  console.log('closest element pairs:', near.slice(0, 4).map(([d, n]) => `${n} (${d.toFixed(2)})`).join(', '));

  await g.screenshot({ path: join(out, 'sound-gallery.png') });
  await g.setViewport({ width: 400, height: 800 });
  await sleep(150);
  const wide = await g.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (wide > 0) fail(`the gallery scrolls sideways at phone width by ${wide} px`);
  await g.screenshot({ path: join(out, 'sound-gallery-phone.png') });
  await g.close();

  if (process.argv.includes('--no-game')) process.exit(process.exitCode ?? 0);

  // ---- the game ----
  const stop = await startPreview();
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => fail('game page error: ' + e.message));
    await p.setViewport({ width: 1280, height: 800 });
    await p.goto(`${BASE}?autoplay=1`);
    await p.waitForFunction(() => !!window.wizardSim?.audio, { timeout: 20000 });
    const before = await p.evaluate(() => !!window.wizardSim.audio.engine);
    if (before) fail('a headless run started audio before any input');
    await p.keyboard.press('KeyQ');
    await p.waitForFunction(() => window.wizardSim.audio.loaded > 0 && window.wizardSim.audio.ready, { timeout: 15000 });
    await p.evaluate(() => { const g2 = window.wizardSim; g2.tools.godMode = true; g2.tools.infiniteRunes = true; g2.startWave(5); }); // the lull is quiet: start a real fight
    await sleep(9000);
    const a1 = await p.evaluate(() => { const a = window.wizardSim.audio, e = a.engine; return { state: e.ctx.state, loaded: a.loaded, voices: e.stats.voices, missing: e.stats.missing, stolen: e.stats.stolen, active: e.active, loops: e.looping, dropped: a.director.limiter.dropped, tick: window.wizardSim.world.clock[0] }; });
    console.log('game audio', a1);
    if (a1.state !== 'running') fail('the audio context is not running');
    if (a1.loaded < 60) fail(`only ${a1.loaded} clips loaded`);
    if (a1.voices < 5) fail(`only ${a1.voices} voices played in a bot fight`);
    if (a1.missing > 0) fail(`${a1.missing} clips were asked for and missing`);
    if (a1.active > 28) fail(`${a1.active} voices at once`);
    await p.close();

    // the first input must not freeze the page: an online match notices (it once took 1.3 s, and the link drops at 2.5 s)
    // Headless Chrome doesn't enforce the autoplay rule, even with --autoplay-policy, so a new context runs at once.
    // This page plays the browser's part: every context starts suspended, as on a desktop before any input.
    const f = await browser.newPage();
    await f.evaluateOnNewDocument(() => {
      const Real = window.AudioContext;
      window.AudioContext = class extends Real { constructor(o) { super(o); void this.suspend(); } };
    });
    f.on('pageerror', (e) => fail('first-input page error: ' + e.message));
    await f.setViewport({ width: 1280, height: 800 });
    await f.goto(`${BASE}?timerloop=1&debug=0&lights=0`);
    await f.waitForFunction(() => window.wizardSim?.audio?.loaded > 60, { timeout: 20000, polling: 100 });
    await sleep(1500); // the code-made clips finish rendering
    const pre = await f.evaluate(() => {
      window.__gap = 0; let last = performance.now();
      const tick = () => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last); last = n; setTimeout(tick, 4); };
      tick();
      return window.wizardSim.audio.engine.ctx.state;
    });
    if (pre !== 'suspended') fail(`something resumed the audio before any input (${pre})`);
    await f.keyboard.press('KeyQ');
    await sleep(1500);
    const first = await f.evaluate(() => ({ gap: Math.round(window.__gap), state: window.wizardSim.audio.engine.ctx.state, ready: window.wizardSim.audio.ready }));
    console.log('first input', first, 'context before it:', pre);
    if (first.state !== 'running' || !first.ready) fail('the first input did not start the audio');
    if (first.gap > 400) fail(`the first input froze the page for ${first.gap} ms`);
    await f.close();

    // Settings: the rows are there, a change sticks over a reload
    const s = await browser.newPage();
    s.on('pageerror', (e) => fail('settings page error: ' + e.message));
    await s.setViewport({ width: 1280, height: 800 });
    await s.goto(`${BASE}?menu=Settings&debug=0`);
    await s.waitForFunction(() => !!window.wizardSim?.menu?.open, { timeout: 20000 });
    await sleep(600);
    await s.screenshot({ path: join(out, 'sound-settings.png') });
    const setv = await s.evaluate(() => { const g2 = window.wizardSim, row = g2.menu.host.settings.find((x) => x.label === 'Master volume'); const was = row.value(); row.adjust(-1); return [was, row.value()]; });
    console.log('master volume', setv);
    if (setv[0] === setv[1]) fail('the volume row did nothing');
    await s.goto(`${BASE}?menu=Settings&debug=0`);
    await s.waitForFunction(() => !!window.wizardSim?.menu?.open, { timeout: 20000 });
    const kept = await s.evaluate(() => window.wizardSim.menu.host.settings.find((x) => x.label === 'Master volume').value());
    if (kept !== setv[1]) fail(`the volume did not persist (${kept})`);
    await s.evaluate(() => localStorage.clear());
    await s.close();

    // ?sound=0, and a page with no Web Audio
    const n = await browser.newPage();
    n.on('pageerror', (e) => fail('no-sound page error: ' + e.message));
    await n.goto(`${BASE}?autoplay=1&sound=0`);
    await n.waitForFunction(() => window.wizardSim?.world?.clock[0] > 30, { timeout: 20000 });
    if (await n.evaluate(() => window.wizardSim.audio !== null)) fail('?sound=0 still made the audio');
    await n.close();
    const none = await browser.newPage();
    none.on('pageerror', (e) => fail('no-Web-Audio page error: ' + e.message));
    await none.evaluateOnNewDocument(() => { delete window.AudioContext; delete window.webkitAudioContext; });
    await none.goto(`${BASE}?autoplay=1`);
    await none.waitForFunction(() => window.wizardSim?.world?.clock[0] > 30, { timeout: 20000 });
    await none.keyboard.press('KeyQ');
    await sleep(500);
    if (await none.evaluate(() => window.wizardSim.audio.ready)) fail('audio claims to be ready with no Web Audio');
    await none.close();
  } finally { await stop(); }
} finally { await browser.close(); }
console.log(process.exitCode ? 'SOUND CHECK FAILED' : 'sound check ok');
