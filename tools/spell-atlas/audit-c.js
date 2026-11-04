// Audits proposal C the same way audit-a1.js audits A and A.1.
// Run: node tools/spell-atlas/audit-c.js
const C = require('./rules-c.js');

const seen = new Map();
let frontier = [[]];
while (frontier.length) {
  const next = [];
  for (const q of frontier) {
    for (const el of C.BASE) {
      const r = C.addElement(q, el).queue;
      const k = r.slice().sort().join('+');
      if (r.length && !seen.has(k)) { seen.set(k, r); next.push(r); }
    }
  }
  frontier = next;
}
const queues = [...seen.values()];
// A spell's identity: its cell plus its payload set. Power (repeats) is a magnitude, not a new spell.
const key = (s) => `${s.id}|${s.payload.map((p) => p.el).sort().join(',')}`;

let pairs = 0, inert = 0;
const cells = new Set(), spells = new Set();
for (const [cast] of C.CASTS) {
  for (const q of queues) {
    const base = C.resolve(q, cast);
    cells.add(base.id); spells.add(cast + key(base));
    for (const el of C.BASE) {
      if (q.includes(el)) continue;
      const add = C.addElement(q, el);
      if (add.queue.length !== q.length + 1) continue;
      pairs++;
      if (key(C.resolve(add.queue, cast)) === key(base)) { inert++; console.log('inert', cast, q.join('+'), '+', el); }
    }
  }
}
console.log('queues', queues.length, 'cells', cells.size, 'distinct spells', spells.size);
console.log(`inert additions ${inert}/${pairs}`);

// How many payload combinations each cell has: shows which cells are rich and which are thin.
const perCell = {};
for (const [cast] of C.CASTS) for (const q of queues) { const s = C.resolve(q, cast); (perCell[s.id] ||= new Set()).add(key(s)); }
console.log(Object.entries(perCell).map(([k, v]) => `${k}:${v.size}`).join('  '));
