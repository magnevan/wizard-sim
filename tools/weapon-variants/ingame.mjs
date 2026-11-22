// Usage: node tools/weapon-variants/ingame.mjs [--each] [weapon-slug ...]
// Round 2 of Elemental Arms: every version in variants.json as the game draws it, through the VFX Lab (live 3D on the
// GPU: vfx-sheet's default --gl gpu). One sheet per weapon in img/ingame-<weapon>.png: a row per version, the weapon
// held (t = 1.2 s) and mid-Strike (t = 0.5 s; then=strike swings at 1/3 s). --each also writes one picture per version,
// img/game-<weapon>--<extras>.png (the concept card's id), for the cards. Run from the repo root; takes a few minutes.
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), game = resolve(here, '../../game');
const data = JSON.parse(readFileSync(join(here, 'variants.json'), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const each = process.argv.includes('--each'), only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sheet = (query, out) => execFileSync(process.execPath, ['scripts/vfx-sheet.mjs', '--page', 'vfx-lab.html', '--query', query,
  '--from', '0.5', '--to', '1.2', '--frames', '2', '--cols', '2', '--scale', '2', '--out', out, '--port', String(port++)], { cwd: game, stdio: ['ignore', 'ignore', 'inherit'] });
mkdirSync(join(here, 'img'), { recursive: true });
let port = 5195;
for (const w of data.weapons) {
  const s = slug(w.title);
  if (only.length && !only.includes(s)) continue;
  const rows = w.variants.map((v) => v.pressed.join(',') + '/weapon').join(';');
  const out = join(game, 'shots/vfx/ingame-' + s);
  sheet(`spells=${rows}&scene=weapon&focus=56&then=strike&bar=0&size=112x112`, out);
  copyFileSync(join(out, 'sheet.png'), join(here, 'img', `ingame-${s}.png`));
  console.log('wrote img/ingame-' + s + '.png', w.variants.length, 'versions');
  if (each) for (const v of w.variants) {
    const id = s + '--' + (v.extras.length ? v.extras.join('-') : 'pure'), o = out + '/' + id;
    sheet(`spell=${v.pressed.join(',')}&form=weapon&scene=weapon&focus=56&then=strike&bar=0&size=112x112`, o);
    copyFileSync(join(o, 'sheet.png'), join(here, 'img', `game-${id}.png`));
  }
}
