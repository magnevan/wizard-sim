// Checks every relative link and #anchor in the repo's .md files.
// Usage (from the repo root): node tools/docs-check/check-links.mjs [root]
// Exits 1 if any link is broken, so it can gate a commit.
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.argv[2] || '.');
const SKIP = new Set(['node_modules', '.git', '.claude', 'dist', '.reference']);

const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) files.push(p);
  }
}
walk(root);

// GitHub's heading slug: lower case, punctuation dropped, spaces to dashes.
const slug = (t) => t.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');

const anchorCache = new Map();
function anchors(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const set = new Set();
  const counts = {};
  let inCode = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (m) {
      const base = slug(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, ''));
      let key = base;
      if (counts[base] !== undefined) key = `${base}-${++counts[base]}`;
      else counts[base] = 0;
      set.add(key);
    }
    for (const x of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) set.add(x[1]);
  }
  anchorCache.set(file, set);
  return set;
}

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

let bad = 0;
for (const file of files) {
  let inCode = false;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return; }
    if (inCode) return;
    const text = line.replace(/`[^`]*`/g, '');
    for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const url = m[1];
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      const [p, hash] = url.split('#');
      const target = p ? path.resolve(path.dirname(file), decode(p)) : file;
      const where = `${path.relative(root, file)}:${i + 1} -> ${url}`;
      if (!fs.existsSync(target)) { console.log(`MISSING ${where}`); bad++; continue; }
      if (hash && target.endsWith('.md') && !anchors(target).has(decode(hash))) { console.log(`ANCHOR  ${where}`); bad++; }
    }
  });
}
console.log(`${files.length} files, ${bad} broken links`);
process.exit(bad ? 1 : 0);
