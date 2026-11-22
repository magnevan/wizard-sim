// Usage: node tools/weapon-variants/ingame.mjs [weapon-slug ...]
// Round 2 of Elemental Arms: every version in variants.json as the game draws it, through the VFX Lab (live 3D on the
// GPU: vfx-sheet's default --gl gpu). One sheet per weapon in img/ingame-<weapon>.png: a row per version, the weapon
// held (t = 1.2 s) and mid-Strike (t = 0.5 s; then=strike swings at 1/3 s). Run from the repo root; takes a few minutes.
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), game = resolve(here, '../../game');
const data = JSON.parse(readFileSync(join(here, 'variants.json'), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const only = process.argv.slice(2);
mkdirSync(join(here, 'img'), { recursive: true });
let port = 5195;
for (const w of data.weapons) {
  const s = slug(w.title);
  if (only.length && !only.includes(s)) continue;
  const rows = w.variants.map((v) => v.pressed.join(',') + '/weapon').join(';');
  const out = join(game, 'shots/vfx/ingame-' + s);
  execFileSync(process.execPath, ['scripts/vfx-sheet.mjs', '--page', 'vfx-lab.html', '--query', `spells=${rows}&scene=weapon&focus=56&then=strike&bar=0&size=112x112`,
    '--from', '0.5', '--to', '1.2', '--frames', '2', '--cols', '2', '--scale', '2', '--out', out, '--port', String(port++)], { cwd: game, stdio: ['ignore', 'ignore', 'inherit'] });
  copyFileSync(join(out, 'sheet.png'), join(here, 'img', `ingame-${s}.png`));
  console.log('wrote img/ingame-' + s + '.png', w.variants.length, 'versions');
}
