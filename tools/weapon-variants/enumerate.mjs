// usage: node tools/weapon-variants/enumerate.mjs
// Lists every weapon (Sigil + elements, the Weapon cast) and every set of distinct extra elements it
// can carry, by pressing every key sequence through the game's own spell rules (queue cancels and
// combines included). Writes tools/weapon-variants/variants.json for the review page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.join(here, '../../game/packages/rules/src/rules-c.gen.js');
const r = (await import(pathToFileURL(rulesPath).href)).default;

const KEYS = r.BASE.filter((e) => e !== 'shield' && e !== 'sigil');
const weapons = new Map(); // title -> { lead, text, variants: Map(key -> variant) }

function visit(seq) {
  let q = ['sigil'];
  for (const k of seq) q = r.addElement(q, k).queue;
  if (q[0] === 'sigil' && q.length > 1) {
    const d = r.resolve(q, 'conjure');
    if (d.cast === 'conjure' && d.form === 'sigil' && d.sub) {
      const lead = d.sub;
      const extras = [...new Set(q.slice(1))].filter((e) => e !== lead).sort();
      const key = extras.join('+');
      if (!weapons.has(d.title)) weapons.set(d.title, { lead, text: d.text, variants: new Map() });
      const w = weapons.get(d.title);
      if (!w.variants.has(key)) {
        // the shortest queue reaching it is found first (visit is breadth-ordered by length below)
        const adds = Object.fromEntries(d.payload.filter((p) => p.el !== lead).map((p) => [p.el, { trait: p.trait, text: p.text }]));
        w.variants.set(key, { extras, queue: q.slice(1), pressed: ['sigil', ...seq], adds });
      }
    }
  }
}
// breadth first, so each variant keeps its shortest key sequence
let layer = [[]];
for (let len = 1; len <= r.MAX - 1; len++) {
  const next = [];
  for (const s of layer) for (const k of KEYS) { const t = [...s, k]; visit(t); next.push(t); }
  layer = next;
}

const out = [...weapons.entries()].map(([title, w]) => ({
  title, lead: w.lead, text: w.text,
  variants: [...w.variants.values()].sort((a, b) => a.extras.length - b.extras.length || a.extras.join().localeCompare(b.extras.join())),
}));
const colors = Object.fromEntries(Object.entries(r.ELEMENTS).map(([k, v]) => [k, { name: v.name, color: v.color, key: v.key }]));
fs.writeFileSync(path.join(here, 'variants.json'), JSON.stringify({ colors, weapons: out }, null, 1) + '\n');
for (const w of out) console.log(`${w.title} (${w.lead}): ${w.variants.length} — ${w.variants.map((v) => v.extras.join('+') || 'pure').join(', ')}`);
console.log('total', out.reduce((n, w) => n + w.variants.length, 0));
