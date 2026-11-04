// Headless screenshot of the scripted run. The view is deterministic too, so a given --ms
// always shows the same frame (give or take the interpolation fraction).
// Usage: npm run build && npm run shot -- [--ms 4000] [--size 1280x800] [--out shots/run.png] [--query "scale=3"]
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BASE, chrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const ms = arg('ms', '4000');
const [w, h] = arg('size', '1280x800').split('x');
const out = resolve(arg('out', 'shots/run.png'));
const query = arg('query', '');
mkdirSync(dirname(out), { recursive: true });

const stop = await startPreview();
try {
  chrome([`--window-size=${w},${h}`, `--virtual-time-budget=${ms}`, `--screenshot=${out}`, `${BASE}?script=1${query ? '&' + query : ''}`]);
  console.log('screenshot:', out);
} finally {
  stop();
}
