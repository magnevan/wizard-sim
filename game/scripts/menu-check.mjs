// The Esc menu in real Chrome: Esc opens it on an empty queue (and pauses the sim), clears a queue
// that holds runes, closes it again; the keyboard hosts a match and switches the scenario in place;
// screenshots of the menu at the default size and on a small screen.
// Usage (after npm run build): node scripts/menu-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const outArg = process.argv.indexOf('--out');
const out = resolve(outArg > 0 ? process.argv[outArg + 1] : 'shots');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const stop = await startPreview();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?net=bc&timerloop=1#arena`);
  await p.waitForFunction(() => !!window.wizardSim?.menu, { timeout: 20000, polling: 100 });
  const st = () => p.evaluate(() => { const g = window.wizardSim; return { open: g.menu.open, tick: g.world.clock[0], queue: g.world.seats.queueLen[0], run: !!g.world.run, net: g.net?.state, room: g.net?.roomName, hash: location.hash }; });
  await sleep(800);

  // Esc on an empty queue: the menu opens, and the sim stands still
  await p.keyboard.press('Escape');
  const a = await st(); await sleep(600); const b = await st();
  console.log('after Esc', a, b);
  if (!a.open) fail('Esc on an empty queue did not open the menu');
  if (b.tick !== a.tick) fail(`the sim ran while the menu was open offline (${a.tick} -> ${b.tick})`);
  await p.keyboard.press('Escape');
  await sleep(400);
  const c = await st();
  if (c.open) fail('Esc did not close the menu');
  if (!(c.tick > b.tick)) fail('the sim did not resume');

  // Esc with runes queued: cleared, no menu
  await p.keyboard.press('KeyF'); await p.keyboard.press('KeyF'); // (not F then R: opposites cancel)
  await sleep(500);
  const q = await st();
  await p.keyboard.press('Escape');
  await sleep(500);
  const d = await st();
  console.log('queue', q.queue, '-> Esc ->', d.queue, 'menu open', d.open);
  if (q.queue < 1) fail('the runes did not queue');
  if (d.queue !== 0 || d.open) fail('Esc with runes queued should clear them and leave the menu shut');

  // Keyboard: Multiplayer -> Host a match (BroadcastChannel), then a screenshot
  await p.keyboard.press('Escape');
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter']) { await p.keyboard.press(k); await sleep(60); }
  await sleep(700);
  const h = await st();
  console.log('after Host', h);
  if (h.net !== 'hosting') fail(`Host a match did not host (net ${h.net})`);
  await p.screenshot({ path: `${out}/menu-multiplayer-1280.png` });

  // Scenarios -> Survive, in place: the lobby stays open and now announces Survive
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('ArrowRight');
  for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowDown');
  await p.screenshot({ path: `${out}/menu-scenarios-focus-1280.png` });
  await p.keyboard.press('Enter');
  await sleep(500);
  const s = await st();
  console.log('after Survive', s);
  if (!s.run || s.open) fail('picking Survive did not switch the world in place and close the menu');
  if (s.net !== 'hosting' || s.room !== 'survive') fail(`the lobby should stay open and announce Survive (${s.net}, ${s.room})`);
  if (!/survive/.test(s.hash)) fail('the URL anchor did not follow');
  // the number keys go through the same registry
  await p.keyboard.press('Digit1');
  await sleep(300);
  const n = await st();
  if (n.run || n.room !== 'sanctum') fail(`key 1 did not switch to the Sanctum (${n.room})`);

  // Settings and Controls screenshots, then a small screen
  await p.keyboard.press('Escape');
  for (const k of ['ArrowUp', 'ArrowRight']) { await p.keyboard.press(k); await sleep(60); }
  await sleep(300);
  await p.screenshot({ path: `${out}/menu-settings-1280.png` });
  await p.keyboard.press('Backspace'); await p.keyboard.press('ArrowUp'); // back to the tabs, then Controls
  await sleep(300);
  await p.screenshot({ path: `${out}/menu-controls-1280.png` });
  await p.setViewport({ width: 640, height: 400 });
  await sleep(600);
  await p.screenshot({ path: `${out}/menu-controls-640.png` });
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
  await sleep(300);
  await p.screenshot({ path: `${out}/menu-scenarios-640.png` });
  if (!process.exitCode) console.log('OK: Esc opens, pauses, clears and closes; the keyboard hosts and switches scenarios in place. Shots in', out);
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await browser.close();
  stop();
}
