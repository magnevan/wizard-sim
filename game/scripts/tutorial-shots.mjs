// Headless screenshots of the tutorial: each beat, with the tutorial bot playing it (?autoplay=1).
// Usage: npm run build && node scripts/tutorial-shots.mjs [--out shots/tutorial] [--ms 2500] [--beats 1,2,3]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASE, chrome, startPreview } from './serve.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', 'shots/tutorial'));
const ms = arg('ms', '2500');
const beats = arg('beats', Array.from({ length: 20 }, (_, k) => k + 1).join(',')).split(',');
const extra = arg('query', '');
mkdirSync(out, { recursive: true });

const stop = await startPreview();
try {
  for (const beat of beats) {
    const file = join(out, `beat-${beat}.png`);
    chrome(['--window-size=1280,800', `--virtual-time-budget=${ms}`, `--screenshot=${file}`, `${BASE}?room=tutorial&autoplay=1&beat=${beat}&debug=0${extra ? '&' + extra : ''}`]);
    console.log('screenshot:', file);
  }
} finally {
  stop();
}
