// How much of proposal C is reachable when each element's rune pool holds at most `d` runes.
// Each queued element spends one rune of that element (nothing combines, so there is no shared cost).
// Run: node tools/spell-atlas/depth-c.js
const C = require('./rules-c.js');

const seen = new Map();
let frontier = [[]];
while (frontier.length) {
  const next = [];
  for (const q of frontier) for (const el of C.BASE) {
    const r = C.addElement(q, el).queue;
    const k = r.slice().sort().join('+');
    if (r.length && !seen.has(k)) { seen.set(k, r); next.push(r); }
  }
  frontier = next;
}
const need = (q) => {
  const n = {};
  for (const e of q) n[e] = (n[e] || 0) + 1;
  return Math.max(...Object.values(n));
};
const key = (s) => `${s.id}|${s.payload.map((p) => p.el).sort().join(',')}`;

for (let d = 1; d <= C.MAX; d++) {
  const cells = new Set(), spells = new Set();
  for (const q of seen.values()) {
    if (need(q) > d) continue;
    for (const [cast] of C.CASTS) { const s = C.resolve(q, cast); cells.add(s.id); spells.add(cast + key(s)); }
  }
  console.log(`depth ${d}: cells ${cells.size}, distinct spells ${spells.size}`);
}
