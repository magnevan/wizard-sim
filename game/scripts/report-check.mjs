// The F8 report box in real Chrome: F8 opens it and pauses the sim; typing (digits too) stays in the box and
// doesn't switch rooms; Esc closes it without opening the menu; Enter opens a pre-filled GitHub issue URL
// (title, room, checkpoint, commit) and the frame is on the clipboard; a screenshot of the open box.
// Usage (after npm run build): node scripts/report-check.mjs [--out dir]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  await browser.defaultBrowserContext().overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const p = await browser.newPage();
  p.on('pageerror', (e) => fail('page error: ' + e.message));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await p.goto(`${BASE}?timerloop=1&at=well-failing#battery`);
  await p.waitForFunction(() => !!window.wizardSim?.menu, { timeout: 30000, polling: 100 });
  const st = () => p.evaluate(() => ({ tick: window.wizardSim.world.clock[0], menu: window.wizardSim.menu.open, hash: location.hash }));
  await sleep(1500);

  await p.keyboard.press('F8');
  await sleep(300);
  const a = await st(); await sleep(500); const b = await st();
  if (a.tick !== b.tick) fail(`the sim kept running under the box (${a.tick} -> ${b.tick})`);
  await p.keyboard.type('Maul clips the robe 2 times');
  await sleep(200);
  const c = await st();
  if (c.hash !== '#battery') fail(`typing switched the room to ${c.hash}`);
  await p.screenshot({ path: join(out, 'report-box.png') });

  await p.keyboard.press('Escape');
  await sleep(300);
  const d = await st();
  if (d.menu) fail('Esc in the box opened the menu');
  await sleep(400);
  if ((await st()).tick === d.tick) fail('the sim stayed paused after the box closed');

  await p.keyboard.press('F8');
  await sleep(300);
  await p.keyboard.type('Second note');
  await p.keyboard.down('Shift'); await p.keyboard.press('Enter'); await p.keyboard.up('Shift');
  await p.keyboard.type('More detail here');
  await p.keyboard.press('Enter');
  await sleep(300);
  const opened = await p.evaluate(() => window.__opened);
  if (opened.length !== 1) fail(`expected one issue page, got ${opened.length}`);
  const u = new URL(opened[0] ?? 'about:blank');
  const title = u.searchParams.get('title'), body = u.searchParams.get('body') ?? '', labels = u.searchParams.get('labels');
  console.log('title:', title, '| labels:', labels);
  console.log(body);
  if (!u.href.startsWith('https://github.com/magnevan/wizard-sim/issues/new')) fail('wrong repo URL');
  if (title !== 'Second note') fail('title is not the first line');
  if (!body.includes('More detail here')) fail('the second line is missing from the body');
  if (!/checkpoint `[a-z-]+`/.test(body)) fail('no checkpoint in the body');
  if (!/commit `[0-9a-f]{7,}/.test(body)) fail('no commit in the body');
  const clip = await p.evaluate(async () => { try { const items = await navigator.clipboard.read(); return items.flatMap((i) => i.types); } catch (e) { return ['error: ' + e.message]; } });
  console.log('clipboard:', clip.join(', '));
  if (!clip.includes('image/png')) fail('no screenshot on the clipboard');
  if (!process.exitCode) console.log('report box OK');
} finally {
  await browser.close();
  stop();
}
