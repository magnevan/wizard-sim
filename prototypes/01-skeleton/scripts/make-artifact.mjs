// Builds artifact/ from dist/: a page body for the claude.ai artifact plus the bundle under a stable name.
// Usage: npm run build && node scripts/make-artifact.mjs
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const js = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
if (!js) throw new Error('No bundle in dist/assets; run npm run build first');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/game.js', readFileSync(`dist/assets/${js}`));
writeFileSync('artifact/index.html', `<title>Wizard Sim Skeleton</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: #14121a; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
</style>
<canvas id="game"></canvas>
<script type="module" src="game.js"></script>
`);
console.log('artifact/ ready (game.js from', js + ')');
