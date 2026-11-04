// Counts how often adding one element to a queue leaves the A / A.1 spell unchanged.
// Run: node tools/spell-atlas/audit-a1.js
const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '../spell-tree/resolver.js'), 'utf8'));
const T = window.SpellTreeA;

// Every queue reachable by typing, deduplicated as sorted multisets.
const seen = new Map();
let frontier = [[]];
while (frontier.length) {
  const next = [];
  for (const q of frontier) {
    for (const el of T.BASE) {
      const r = T.addElement(q, el).queue;
      const k = r.slice().sort().join('+');
      if (!seen.has(k) && r.length) { seen.set(k, r); next.push(r); }
    }
  }
  frontier = next;
}
const queues = [...seen.values()];
console.log('distinct queues', queues.length);

const variants = [
  ['force', {}], ['area', {}], ['self', {}], ['weapon', {}],
  ['point', { target: 'ground' }], ['point', { target: 'ally' }], ['point', { target: 'enemy' }],
];
for (const variant of [undefined, 'a1']) {
  let pairs = 0, inert = 0;
  const examples = {};
  for (const [mode, o] of variants) {
    const label = mode + (o.target ? ':' + o.target : '');
    const titles = new Set();
    for (const q of queues) {
      const base = T.resolve(q, mode, { ...o, variant });
      titles.add(base.title);
      for (const el of T.BASE) {
        const add = T.addElement(q, el);
        if (add.queue.length !== q.length + 1) continue; // cancel / combine / full
        if (q.includes(el)) continue; // more of the same element = more power, which is intended
        pairs++;
        const r = T.resolve(add.queue, mode, { ...o, variant });
        // Same title and same text apart from power = the new element did nothing visible.
        if (r.title === base.title && r.text === base.text) {
          inert++;
          (examples[label] ||= []).length < 4 && examples[label].push(`${q.join('+')} +${el} = ${r.title}`);
        }
      }
    }
    console.log(variant || 'A', label, 'distinct spells', titles.size);
  }
  console.log(variant || 'A', `inert additions ${inert}/${pairs} (${Math.round(100 * inert / pairs)}%)`);
  console.log(JSON.stringify(examples, null, 1));
}
