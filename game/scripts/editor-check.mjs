// usage: node scripts/editor-check.mjs [--url http://127.0.0.1:5187] [--out shots/editor-check]
// A smoke test of the map editor (editor.html) against a running dev server (npm run dev): on a throwaway copy of
// patch B (tools/kit/scenes/zz-check.scene.json, removed afterwards) it sets a wall section to a door, paints a bed
// with the brush, drops a pin, undoes, and asks for Claude's pictures (/__map/view), checking the server after each
// step. Screenshots go to --out. Exits 1 if a step fails or the page logs an error.
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './serve.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const URL = opt('url', process.env.MAP_EDITOR_URL ?? 'http://127.0.0.1:5187'), OUT = resolve(opt('out', 'shots/editor-check'));
const SC = `${ROOT}/tools/kit/scenes/zz-check`;
mkdirSync(OUT, { recursive: true });
copyFileSync(`${ROOT}/tools/kit/scenes/patch-b.scene.json`, `${SC}.scene.json`);
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const map = (route, params) => `${URL}/__map/${route}?${new URLSearchParams({ name: 'zz-check', ...params })}`;
const api = (route, params = {}) => fetch(map(route, params)).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${URL}/editor.html?scene=zz-check`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  const scr = (x, y, h) => page.evaluate((x, y, h) => window.__editor.screen(x, y, h), x, y, h);
  const state = () => page.evaluate(() => window.__editor.state());
  const rev0 = (await state()).rev;
  const waitRev = async (n) => { for (let i = 0; i < 60 && (await state()).rev < rev0 + n; i++) await sleep(100); };
  await page.screenshot({ path: `${OUT}/0-open.png` });

  // 1. a hall wall section, set to a door in the inspector
  let [sx, sy] = await scr(5.5, 2.5, 5);
  await page.mouse.click(sx, sy); await sleep(300);
  const sel = (await state()).sel;
  check(sel?.type === 'edge' && sel.e[0] === 5.5 && sel.e[1] === 2.5, `clicking the hall wall selects its section (${JSON.stringify(sel)})`);
  const btn = await page.$('#inspect [data-v="door"]');
  check(!!btn, 'the inspector offers plain / window / door');
  if (btn) { await btn.click(); await waitRev(1); }
  let s = await api('scene');
  check(s.scene.objects.some((o) => o.kind === 'edge' && o.at[0] === 5.5 && o.at[1] === 2.5 && o.v === 'door'), 'the door is an edge object in the scene');
  await page.screenshot({ path: `${OUT}/1-door.png` });

  // 2. paint a planted bed with the brush (key 4)
  await page.keyboard.press('b'); await page.keyboard.press('4');
  [sx, sy] = await scr(6.5, 18.5); const [ex, ey] = await scr(9.5, 18.5);
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(sx + ((ex - sx) * k) / 10, sy + ((ey - sy) * k) / 10);
  await page.mouse.up(); await waitRev(2);
  s = await api('scene');
  check(s.scene.corners[18].slice(6, 11) === 'LLLLL' && s.scene.corners[19].slice(6, 11) === 'LLLLL', `a brush stroke paints a two-corner-wide band (rows 18-19: ${s.scene.corners[18].slice(4, 12)} / ${s.scene.corners[19].slice(4, 12)})`);
  await page.screenshot({ path: `${OUT}/2-paint.png` });

  // 3. a pin on a lamp
  await page.keyboard.press('n');
  [sx, sy] = await scr(10, 13.5, 1.5);
  await page.mouse.click(sx, sy); await sleep(800);
  await page.keyboard.type('make the lamp a bench'); await page.keyboard.press('Enter'); await sleep(600);
  await page.screenshot({ path: `${OUT}/3-pin.png` });
  const pins = (await api('pins', { status: 'new' })).pins;
  check(pins.length === 1 && pins[0].note === 'make the lamp a bench', `a pin is saved with its note (${JSON.stringify(pins.map((p) => [p.anchor.obj, p.anchor.inst?.p]))})`);

  // 4. undo (Ctrl+Z) takes the paint back
  await page.keyboard.press('v');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await waitRev(3);
  s = await api('scene');
  check(s.scene.corners[18].slice(6, 10) === 'PPPP', `Ctrl+Z undoes the stroke (row 18: ${s.scene.corners[18].slice(4, 12)})`);

  // 5. Claude's pictures
  let r = await fetch(map('view', { cam: 'top' }));
  check(r.ok && r.headers.get('content-type') === 'image/png', `the top-view picture is a PNG (${r.status}${r.ok ? '' : ` ${await r.clone().text()}`})`);
  if (r.ok) writeFileSync(`${OUT}/5-view-top.png`, Buffer.from(await r.arrayBuffer()));
  r = await fetch(map('view', { x: 20, y: 11, r: 6 }));
  check(r.ok, `/__map/view near a spot (${r.status}${r.ok ? '' : ` ${await r.clone().text()}`})`);
  if (r.ok) writeFileSync(`${OUT}/5-view-near.png`, Buffer.from(await r.arrayBuffer()));
  await page.keyboard.press('t'); await sleep(500);
  await page.screenshot({ path: `${OUT}/6-top.png` });
  check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  for (const ext of ['scene.json', 'pins.json', 'history.jsonl']) if (existsSync(`${SC}.${ext}`)) rmSync(`${SC}.${ext}`);
}
console.log(fails.length ? `${fails.length} failed` : 'all passed');
process.exit(fails.length ? 1 : 0);
