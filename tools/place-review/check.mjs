// Checks a place review's place.json and lists the files a publish has to send.
//
//   node tools/place-review/check.mjs <review dir>            check, then print the `files` map of what changed
//   node tools/place-review/check.mjs <review dir> --all      the map of every file (a first publish)
//   node tools/place-review/check.mjs <review dir> --mark     after a publish: remember what was sent
//
// <review dir> is e.g. tools/infirmary-review. The map is for the Artifact publish's `files`; the page itself is
// always tools/place-review/index.html. What was sent is kept in <review dir>/.published.json (committed), so
// the next publish sends only new or changed pictures. Hashes are the first 32 hex of sha256, as the Artifact
// tool's file listing prints them, so a manifest can be checked against the live artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [dir, flag] = process.argv.slice(2);
if (!dir) { console.error('usage: check.mjs <review dir> [--all|--mark]'); process.exit(2); }
const P = JSON.parse(fs.readFileSync(path.join(dir, 'place.json'), 'utf8'));
const errors = [], warns = [];
const RESERVED = new Set(['now', 'tasks', 'concept', 'pieces', 'log']);
const STEPS = new Set(['picture', 'pick', 'meshy', 'fit', 'split', 'placed', 'failed', 'code', 'note']);
const used = new Set();
const img = (src, where) => {
  if (!src) return errors.push(`${where}: a picture with no src`);
  if (!src.startsWith('img/')) return src.startsWith('/_blob/') ? null : errors.push(`${where}: ${src} is not under img/`);
  used.add(src);
  const f = path.join(dir, src);
  if (!fs.existsSync(f)) return errors.push(`${where}: ${src} is missing`);
  const kb = fs.statSync(f).size / 1024;
  if (kb > 1500) warns.push(`${where}: ${src} is ${Math.round(kb)} KB; save it as a jpg under 1.5 MB (quality ~85, 1600 px wide)`);
};
const ids = new Set();
const uniq = (id, where) => { if (!id) errors.push(`${where}: no id`); else if (ids.has(where.split(' ')[0] + id)) errors.push(`${where}: duplicate id ${id}`); else ids.add(where.split(' ')[0] + id); };

if (P.version !== 2) errors.push('place.json needs "version": 2 (see tools/place-review/README.md)');
for (const k of ['title', 'stage']) if (!P[k]) errors.push(`place.json has no ${k}`);
if ('tasks' in P) errors.push('tasks live in the db, not place.json: move them to the db collection `tasks`');
if ('note' in P) warns.push('"note" is gone: a thing to do is a task, a thing to say goes in the log');
const areas = P.areas || [];
const rounds = new Set();
for (const a of areas) {
  uniq(a.id, 'area ' + a.id);
  if (RESERVED.has(a.id)) errors.push(`area id "${a.id}" clashes with a built-in tab`);
  for (const s of a.subs || []) for (const x of s.sections || []) {
    let html = x.html || '';
    if (x.file) {
      if (!/^rounds\/[\w.-]+\.html$/.test(x.file)) errors.push(`area ${a.id}/${s.id}: file ${x.file} must be rounds/<name>.html`);
      else if (!fs.existsSync(path.join(dir, x.file))) errors.push(`area ${a.id}/${s.id}: ${x.file} is missing`);
      else { html = fs.readFileSync(path.join(dir, x.file), 'utf8'); rounds.add(x.file); }
    }
    for (const m of html.matchAll(/src="([^"]+)"/g)) img(m[1], `area ${a.id}/${s.id}`);
    if (/class="gaps"/.test(html) && (s.at || '') >= '2026-11-28') warns.push(`area ${a.id}/${s.id}: a list of issues in prose; make each one a task with evidence`);
  }
}
const aIds = new Set(areas.map((a) => a.id)), pIds = new Set((P.pieces || []).map((p) => p.id));
let approved = 0;
for (const c of P.concepts || []) { uniq(c.id, 'concept ' + c.id); img(c.src, 'concept ' + c.id); if (c.status === 'approved') approved++; }
if (!approved) warns.push('no concept is marked approved: the Concept button and compare need one');
for (const d of P.decisions || []) {
  uniq(d.id, 'decision ' + d.id);
  for (const f of d.figures || []) img(f.src, 'decision ' + d.id);
  if (d.area && !aIds.has(d.area)) errors.push(`decision ${d.id}: area ${d.area} doesn't exist`);
  if (d.piece && !pIds.has(d.piece)) errors.push(`decision ${d.id}: piece ${d.piece} doesn't exist`);
  if (!d.closed && !(d.choices || []).length) warns.push(`decision ${d.id}: open with no choices; give it choices (a note-only box is easy to miss)`);
  if (!d.closed && !d.rec) warns.push(`decision ${d.id}: no recommendation`);
}
for (const p of P.pieces || []) {
  uniq(p.id, 'piece ' + p.id);
  if (p.area && !aIds.has(p.area)) errors.push(`piece ${p.id}: area ${p.area} doesn't exist`);
  for (const s of p.steps || []) {
    if (!STEPS.has(s.kind)) errors.push(`piece ${p.id}: unknown step kind ${s.kind}`);
    for (const f of s.imgs || []) img(f.src, 'piece ' + p.id);
    if ((s.kind === 'meshy' || s.kind === 'failed') && !(s.imgs || []).length) warns.push(`piece ${p.id}: a ${s.kind} step with no still of the model (model-shot.py)`);
    if (s.kind === 'meshy' && !s.credits) warns.push(`piece ${p.id}: a Meshy step with no credits`);
  }
}
for (const l of P.log || []) for (const m of (l.html || '').matchAll(/src="([^"]+)"/g)) img(m[1], 'log');

// the board: rows are the whole place and its parts (zones), cells per stage
const STAGE_IDS = new Set((P.stages || [['read'], ['structure'], ['flow'], ['sense'], ['trace'], ['paint'], ['pieces'], ['surfaces'], ['dressing'], ['beauty']]).map((x) => x[0]));
const CELLS = new Set(['done', 'started', 'review', 'next', 'later', 'na']);
const zoneIds = new Set();
if (P.stage && !STAGE_IDS.has(P.stage)) errors.push(`stage ${P.stage} isn't a stage`);
if (!P.board) warns.push('no board: add one (rows: the whole place and its parts; see the README)');
for (const r of P.board?.rows || []) {
  if (!r.id) errors.push(`board row ${r.name}: no id`); else if (zoneIds.has(r.id)) errors.push(`board row ${r.id} twice`); else zoneIds.add(r.id);
  for (const [st, cell] of Object.entries(r.cells || {})) {
    if (!STAGE_IDS.has(st)) errors.push(`board ${r.id}: unknown stage ${st}`);
    if (!Array.isArray(cell) || !CELLS.has(cell[0])) errors.push(`board ${r.id}/${st}: a cell is [status, text?, #href?] with status ${[...CELLS].join('/')}`);
    else if (cell[2] && !/^#[\w-]+$/.test(cell[2])) errors.push(`board ${r.id}/${st}: href ${cell[2]} must be #something`);
  }
}
for (const g of P.board?.groups || []) if (!STAGE_IDS.has(g[1]) || !STAGE_IDS.has(g[2])) errors.push(`board group ${g[0]}: unknown stage`);

// the db copy (db/ plus anything staged in .outbox/), folded with its events as the page shows it
const W = createRequire(import.meta.url)('./whose.js');
const readDir = (d) => fs.existsSync(d) ? Object.fromEntries(fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))])) : {};
const folded = W.fold({ ...readDir(path.join(dir, 'db', 'tasks')), ...readDir(path.join(dir, '.outbox', 'tasks')) },
  [...Object.values(readDir(path.join(dir, 'db', 'events'))), ...Object.values(readDir(path.join(dir, '.outbox', 'events')))]);
{
  for (const [id, t] of Object.entries(folded)) {
    for (const k of ['title', 'by', 'status']) if (!t[k]) errors.push(`task ${id}: no ${k}`);
    for (const f of t.evidence || []) img(f.src, 'task ' + id);
    if (t.kind === 'polish' && !(t.evidence || []).length) warns.push(`task ${id}: a polish task with no evidence picture`);
    if (t.area && !aIds.has(t.area)) errors.push(`task ${id}: area ${t.area} doesn't exist`);
    if (t.piece && !pIds.has(t.piece)) errors.push(`task ${id}: piece ${t.piece} doesn't exist`);
    if (t.zone && !zoneIds.has(t.zone)) errors.push(`task ${id}: zone ${t.zone} isn't a board row`);
  }
}

// unused pictures in img/ (kept, but not sent)
const all = fs.existsSync(path.join(dir, 'img')) ? fs.readdirSync(path.join(dir, 'img')).map((f) => 'img/' + f) : [];
const unused = all.filter((f) => !used.has(f));

for (const w of warns) console.error('warn  ' + w);
for (const e of errors) console.error('ERROR ' + e);
console.error(`${errors.length} errors, ${warns.length} warnings; ${used.size} pictures used, ${unused.length} in img/ unused`);
if (errors.length) process.exit(1);

const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 32);
const mfF = path.join(dir, '.published.json');
const mf = fs.existsSync(mfF) ? JSON.parse(fs.readFileSync(mfF, 'utf8')) : {};
// whose.js is the template's, shared by every place, published beside the page
const SRC = { 'whose.js': path.relative(dir, fileURLToPath(new URL('./whose.js', import.meta.url))) };
const send = ['place.json', 'whose.js', ...[...rounds].sort(), ...[...used].sort()];
const now = Object.fromEntries(send.map((f) => [f, hash(SRC[f] || f)]));
if (flag === '--mark') { fs.writeFileSync(mfF, JSON.stringify(now, null, 1) + '\n'); console.error(`marked ${send.length} files as published`); process.exit(0); }
const changed = flag === '--all' ? send : send.filter((f) => mf[f] !== now[f]);
const map = Object.fromEntries(changed.map((f) => [f, path.join(dir, SRC[f] || f).replace(/\\/g, '/')]));
const mb = changed.reduce((s, f) => s + fs.statSync(path.join(dir, SRC[f] || f)).size, 0) / 1048576;
console.error(`${changed.length} files to send (${mb.toFixed(1)} MB)${changed.length > 255 || mb > 60 ? ': too many for one publish, split it' : ''}`);
console.log(JSON.stringify(map));
