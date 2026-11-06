// Builds the Sound Gallery's two generated files in tools/sound-gallery/: engine.js (the game's audio code,
// bundled) and bank.js (the sample bank as base64, so the page needs no fetches). Run after any change to
// packages/client/src/audio or the bank:  npm run sound-gallery
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../tools/sound-gallery');
const bankDir = join(here, '../packages/client/public/audio');
mkdirSync(out, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: out, emptyOutDir: false, minify: true,
    lib: { entry: join(here, '../packages/client/src/audio/gallery.ts'), formats: ['iife'], name: 'SoundLabBundle', fileName: () => 'engine.js' },
  },
});

const bank = {};
for (const f of readdirSync(bankDir)) bank[f.replace(/\.ogg$/, '')] = readFileSync(join(bankDir, f)).toString('base64');
writeFileSync(join(out, 'bank.js'), `window.SOUND_BANK=${JSON.stringify(bank)};\n`);
const kb = (f) => Math.round(statSync(join(out, f)).size / 1024);
console.log(`engine.js ${kb('engine.js')} KB, bank.js ${kb('bank.js')} KB (${Object.keys(bank).length} clips)`);
