// usage: node scripts/edit-replace.mjs (npm run edit-replace --) <edits.json> [--dry]
// Exact old -> new text replacements from a JSON file, for agents whose shell can't take inline edits (quotes in a
// python -c or sed one-liner, compound commands a worktree guard refuses). The file is a list of
//   { "file": "packages/client/src/x.ts", "old": "exact text", "new": "its replacement" }
// (paths relative to the current directory, or absolute). Every edit must find its `old` exactly once in the file as
// the earlier edits left it; if any one doesn't (missing, or found more than once), nothing is written and each failure
// is named. --dry checks them all without writing. Write the JSON with an editor tool, not through the shell.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), dry = args.includes('--dry'), src = args.find((a) => !a.startsWith('--'));
if (!src) { console.log('usage: node scripts/edit-replace.mjs <edits.json> [--dry]'); process.exit(1); }
const edits = JSON.parse(readFileSync(src, 'utf8'));
if (!Array.isArray(edits)) { console.error('edit-replace: the file must hold a list of { file, old, new }'); process.exit(1); }

const texts = new Map(), errors = [];
edits.forEach((e, i) => {
  const where = `edit ${i + 1} (${e.file})`;
  if (typeof e.file !== 'string' || typeof e.old !== 'string' || typeof e.new !== 'string') { errors.push(`${where}: needs string file, old and new`); return; }
  const path = resolve(e.file);
  if (!texts.has(path)) { try { texts.set(path, readFileSync(path, 'utf8')); } catch { errors.push(`${where}: can't read ${path}`); return; } }
  let text = texts.get(path);
  // the file's own line endings: a JSON edit written with \n still matches a CRLF file
  const crlf = text.includes('\r\n') && !e.old.includes('\r\n');
  const old = crlf ? e.old.replace(/\n/g, '\r\n') : e.old, nu = crlf ? e.new.replace(/\n/g, '\r\n') : e.new;
  const n = old ? text.split(old).length - 1 : 0;
  if (n !== 1) { errors.push(`${where}: old text found ${n} times (needs exactly 1): ${JSON.stringify(e.old.slice(0, 80))}${e.old.length > 80 ? '…' : ''}`); return; }
  const at = text.indexOf(old);
  texts.set(path, text.slice(0, at) + nu + text.slice(at + old.length));
});
if (errors.length) { for (const e of errors) console.error('edit-replace: ' + e); console.error(`edit-replace: nothing written (${errors.length} of ${edits.length} failed)`); process.exit(1); }
if (!dry) for (const [p, t] of texts) writeFileSync(p, t);
console.log(`edit-replace: ${edits.length} edit(s) ${dry ? 'would apply' : 'applied'} to ${texts.size} file(s)`);
