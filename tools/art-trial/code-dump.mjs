// Writes the code-drawn props (code-props.html) to tools/art-trial/out/code/<id>.png with headless Chrome.
//   node tools/art-trial/code-dump.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../game/package.json'));
const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer-core')).href);
const { findChrome } = await import(pathToFileURL(join(here, '../../game/scripts/serve.mjs')).href);

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.goto(pathToFileURL(join(here, 'code-props.html')).href);
  await p.waitForFunction(() => document.getElementById('all').textContent.length > 0, { timeout: 10000 });
  const all = JSON.parse(await p.$eval('#all', (e) => e.textContent));
  const out = join(here, 'out/code');
  mkdirSync(out, { recursive: true });
  for (const [id, url] of Object.entries(all)) writeFileSync(join(out, id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', Object.keys(all).length, 'props to', out);
} finally {
  await browser.close();
}
