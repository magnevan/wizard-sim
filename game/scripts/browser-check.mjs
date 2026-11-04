// Cross-engine determinism check: runs the golden replay inside headless Chrome (?selftest=1)
// and compares its hash with the one node computed (packages/sim/test/golden.json).
// Usage: npm run check:browser   (builds first)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, chrome, startPreview } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, '../packages/sim/test/golden.json'), 'utf8'));

const stop = await startPreview();
try {
  const dom = chrome(['--virtual-time-budget=20000', '--dump-dom', `${BASE}?selftest=1&ticks=${golden.ticks}`]);
  const hash = /data-hash="([0-9a-f]{8})"/.exec(dom)?.[1];
  if (!hash) { console.error('The page did not report a hash. DOM head:\n' + dom.slice(0, 600)); process.exit(1); }
  if (hash !== golden.hash) { console.error(`DESYNC: Chrome ${hash}, node ${golden.hash}`); process.exit(1); }
  console.log(`Chrome and node agree: ${hash} after ${golden.ticks} ticks`);
} finally {
  stop();
}
