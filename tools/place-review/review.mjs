// Claude's side of a place review: read the queue, answer, file tasks, log pieces, keep the board.
//
// The db is copied into <dir>/db/ (committed) with ArtifactData `list` + `out_dir`, one call per collection:
//   tasks, events, answers  ->  out_dir: <abs path to dir>/db
// Writes are staged in <dir>/.outbox/<collection>/<id>.json; `outbox` prints them as ArtifactData `batch` writes,
// and `sent` moves them into db/ once the batch is committed. Every write creates a new doc (tasks once, then
// events), so no write needs a version and none can overwrite the user's. The rules are whose.js, as on the page.
//
//   node tools/place-review/review.mjs <cmd> <dir> ...      (<dir> is e.g. tools/infirmary-review)
//
//   queue                          what's on Claude's move, unread answers, and a summary (start every session here)
//   show <task>                    one task, folded, with its thread
//   note <task> "text" [k=v ...]   a reply on a task (marks it read); k=v also sets fields (status=review ...)
//   set <task> k=v ...             change fields: status, kind, area, zone, piece, outcome, waitingOn, waitingFor, title, body
//   seen [<task|decision> ...]     mark as read (no ids: everything unread)
//   reply <decision> "text"        answer the user's note on a decision (marks it read)
//   new <id> --title T [--body B] [--kind polish] [--area A] [--zone Z] [--piece P] [--decision D]
//       [--status open] [--by claude|critic|codex] [--label "beauty critic"] [--ev img/x.jpg=caption ...]
//   outbox                         print the staged writes as `batch` arrays (50 per batch)
//   sent                           after a committed batch: move the staged docs into db/
//   piece <piece> <kind> [--title T] [--credits N] [--task ID] [--note HTML] [--img img/x.jpg=cap ...]
//       [--file path ...] [--glb path.glb] [--at YYYY-MM-DD]       add a step to a piece in place.json
//       (--glb renders a still with Blender into img/model-<piece>-<n>.jpg and adds it)
//   piece-new <piece> "Name" [--area A] [--status S] [--html H]
//   board <row> <stage> <status> ["text"] [#href]                  set a board cell (status: done started review next later na)
//   rounds                          move inline section HTML in place.json into rounds/<area>-<sub>.html files
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const W = require('./whose.js');

const [cmd, dir, ...rest] = process.argv.slice(2);
if (!cmd || !dir) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(cmd ? 2 : 0); }
const P = (...a) => path.join(dir, ...a);
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
const now = () => new Date().toISOString();
const short = (s, n = 160) => { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// db/ plus whatever is staged, so commands see their own writes before they're sent
function load(withOutbox = true) {
  const coll = (name) => {
    const out = {};
    for (const base of [P('db', name), ...(withOutbox ? [P('.outbox', name)] : [])])
      if (fs.existsSync(base)) for (const f of fs.readdirSync(base)) if (f.endsWith('.json')) out[f.slice(0, -5)] = readJson(path.join(base, f));
    return out;
  };
  const tasksRaw = coll('tasks'), events = Object.values(coll('events')), answersRaw = coll('answers');
  return { tasksRaw, events, tasks: W.fold(tasksRaw, events), answers: W.foldAnswers(answersRaw, events), place: readJson(P('place.json'), {}) };
}
const stage = (collection, id, doc) => { writeJson(P('.outbox', collection, id + '.json'), doc); return id; };
const event = (ev) => { const at = now(); const e = { at, by: 'claude', ...ev }; return stage('events', W.eventId(at, 'claude'), e); };
const kv = (args) => Object.fromEntries(args.filter((a) => /^[\w]+=/.test(a)).map((a) => { const i = a.indexOf('='); const k = a.slice(0, i), v = a.slice(i + 1); try { return [k, JSON.parse(v)]; } catch { return [k, v]; } }));
const flags = (args) => { const o = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { const k = args[i].slice(2); const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; (o[k] ||= []).push(v); } return o; };
const one = (f, k) => (f[k] ? f[k][0] : undefined);
const pics = (list) => (list || []).map((s) => { const i = s.indexOf('='); return i < 0 ? { src: s, cap: '' } : { src: s.slice(0, i), cap: s.slice(i + 1) }; });
const need = (cond, msg) => { if (!cond) { console.error(msg); process.exit(1); } };

const S = load();
switch (cmd) {
  case 'queue': {
    const list = Object.values(S.tasks);
    const pend = fs.existsSync(P('.outbox')) ? fs.readdirSync(P('.outbox'), { recursive: true }).filter((f) => String(f).endsWith('.json')).length : 0;
    if (pend) console.log(`! ${pend} staged writes not sent yet (outbox, then sent)\n`);
    const snap = fs.existsSync(P('db', 'tasks')) ? fs.statSync(P('db', 'tasks')).mtime : null;
    console.log(`db copy from ${snap ? snap.toISOString().slice(0, 16) : 'never: pull tasks, events, answers first'}\n`);
    const mine = list.filter((t) => W.why(t, S.answers)[0] === 'claude');
    console.log(`CLAUDE'S MOVE (${mine.length})`);
    for (const t of mine) {
      console.log(`- ${t.id} [${W.why(t, S.answers)[1]}] ${t.title}  (${t.status}${t.ack ? ', ' + t.ack : ''})`);
      if (t.status === 'triage' && t.body) console.log(`    ${short(t.body, 300)}`);
      for (const n of t.notes.filter((n) => W.noteUnread(t, n))) console.log(`    you, ${n.at.slice(0, 16)}: ${short(n.text, 400)}${n.imgs ? ` [${n.imgs.length} picture(s): ${n.imgs.join(' ')}]` : ''}`);
    }
    const open = (S.place.decisions || []).filter((d) => !d.closed);
    const unreadA = Object.entries(S.answers).filter(([, a]) => W.answerUnread(a));
    console.log(`\nANSWERS NOT READ YET (${unreadA.length})`);
    for (const [id, a] of unreadA) console.log(`- ${id}${open.some((d) => d.id === id) ? '' : ' (closed or unknown decision)'}: choice=${a.choice ?? '-'}${a.note ? `  note: ${short(a.note, 400)}` : ''}`);
    const blank = open.filter((d) => !S.answers[d.id]?.choice && !S.answers[d.id]?.note);
    console.log(`\nDECISIONS OPEN (${open.length}; ${blank.length} unanswered: ${blank.map((d) => d.id).join(', ') || 'none'})`);
    const you = list.filter((t) => W.why(t, S.answers)[0] === 'you');
    const reasons = {}; for (const t of you) reasons[W.why(t, S.answers)[1]] = (reasons[W.why(t, S.answers)[1]] || 0) + 1;
    console.log(`\nTHE USER'S MOVE: ${you.length} tasks (${Object.entries(reasons).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
    const queue = list.filter((t) => W.LIVE.has(t.status) && !W.why(t, S.answers)[0]);
    console.log(`\nQUEUE (${queue.length}, no one's move: Claude's work)`);
    for (const t of queue.sort((a, b) => W.ORDER.indexOf(a.status) - W.ORDER.indexOf(b.status))) console.log(`- ${t.id} (${t.status}${t.ack ? ', ' + t.ack : ''}${t.zone ? ', ' + t.zone : ''}) ${t.title}`);
    break;
  }
  case 'show': {
    const t = S.tasks[rest[0]]; need(t, `no task ${rest[0]}`);
    const { notes, ...f } = t; console.log(JSON.stringify(f, null, 1)); console.log(`whose move: ${W.why(t, S.answers).join(', ') || 'no one'}`);
    for (const n of notes) console.log(`- ${n.by} ${n.at}: ${n.text}${n.imgs ? ' ' + n.imgs.join(' ') : ''}`);
    break;
  }
  case 'note': {
    const [id, text, ...more] = rest; need(S.tasks[id] && text, 'note <task> "text" [k=v ...]');
    const set = { seen: now(), ...kv(more) };
    if (set.status === 'done') console.error('note: Claude sets review, not done; the user confirms');
    console.log('staged', event({ task: id, note: text, set }));
    break;
  }
  case 'set': {
    const [id, ...more] = rest; const set = kv(more); need(S.tasks[id] && Object.keys(set).length, 'set <task> k=v ...');
    if (set.status === 'done') console.error('set: Claude sets review, not done; the user confirms');
    console.log('staged', event({ task: id, set }));
    break;
  }
  case 'seen': {
    let ids = rest;
    if (!ids.length) ids = [...Object.values(S.tasks).filter((t) => t.notes.some((n) => W.noteUnread(t, n)) || t.status === 'triage').map((t) => t.id),
      ...Object.entries(S.answers).filter(([, a]) => W.answerUnread(a)).map(([id]) => id)];
    for (const id of ids) console.log('staged', S.tasks[id] ? event({ task: id, set: { seen: now() } }) : event({ decision: id, seen: true }));
    break;
  }
  case 'reply': {
    const [id, text] = rest; need(id && text, 'reply <decision> "text"');
    console.log('staged', event({ decision: id, reply: text }));
    break;
  }
  case 'new': {
    const [id, ...more] = rest; const f = flags(more);
    need(id && /^[\w-]+$/.test(id) && !S.tasks[id], `new <id>: a new id (letters, digits, -); ${id} exists or is bad`);
    need(one(f, 'title'), '--title is required');
    const kind = one(f, 'kind') || 'polish', ev = pics(f.ev);
    if (['polish', 'fix'].includes(kind) && !ev.length) console.error('new: a polish or fix task needs evidence (--ev img/x.jpg=caption)');
    const doc = { title: one(f, 'title'), body: one(f, 'body') || '', kind, by: one(f, 'by') || 'claude', status: one(f, 'status') || 'open', created: now(), evidence: ev, notes: [] };
    for (const k of ['area', 'zone', 'piece', 'decision']) if (one(f, k)) doc[k] = one(f, k);
    if (one(f, 'label')) doc.byLabel = one(f, 'label');
    console.log('staged task', stage('tasks', id, doc));
    break;
  }
  case 'outbox': {
    const writes = [];
    if (fs.existsSync(P('.outbox'))) for (const c of fs.readdirSync(P('.outbox'))) for (const f of fs.readdirSync(P('.outbox', c)))
      writes.push({ op: 'set', collection: c, doc_id: f.slice(0, -5), file_path: path.resolve(P('.outbox', c, f)).replace(/\\/g, '/') });
    if (!writes.length) { console.error('nothing staged'); break; }
    for (let i = 0; i < writes.length; i += 50) console.log(JSON.stringify(writes.slice(i, i + 50)));
    console.error(`${writes.length} writes in ${Math.ceil(writes.length / 50)} batch(es); after each commits: review.mjs sent ${dir}`);
    break;
  }
  case 'sent': {
    let n = 0;
    if (fs.existsSync(P('.outbox'))) { for (const c of fs.readdirSync(P('.outbox'))) for (const f of fs.readdirSync(P('.outbox', c))) {
      fs.mkdirSync(P('db', c), { recursive: true }); fs.renameSync(P('.outbox', c, f), P('db', c, f)); n++; }
      fs.rmSync(P('.outbox'), { recursive: true, force: true }); }
    console.log(`moved ${n} docs into db/`);
    break;
  }
  case 'piece-new': {
    const [id, name, ...more] = rest; const f = flags(more); need(id && name, 'piece-new <piece> "Name"');
    const p = S.place; p.pieces ||= []; need(!p.pieces.some((x) => x.id === id), `piece ${id} exists`);
    p.pieces.push({ id, name, ...(one(f, 'area') ? { area: one(f, 'area') } : {}), status: one(f, 'status') || 'picture', ...(one(f, 'html') ? { html: one(f, 'html') } : {}), steps: [] });
    writeJson(P('place.json'), p); console.log('added piece', id);
    break;
  }
  case 'piece': {
    const [id, kind, ...more] = rest; const f = flags(more);
    const p = S.place, piece = (p.pieces || []).find((x) => x.id === id); need(piece && kind, 'piece <piece> <kind> ...; piece-new first');
    const step = { kind, at: one(f, 'at') || now().slice(0, 10) };
    if (one(f, 'title')) step.title = one(f, 'title');
    if (one(f, 'credits')) step.credits = Number(one(f, 'credits'));
    if (one(f, 'task')) step.task = one(f, 'task');
    if (one(f, 'note')) step.note = one(f, 'note');
    step.imgs = pics(f.img);
    if (one(f, 'glb')) {
      const n = (piece.steps || []).length + 1, out = `img/model-${id}-${n}.jpg`;
      const blender = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
      execFileSync(blender, ['--background', '--python', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'model-shot.py'), '--', path.resolve(P(out)), path.resolve(one(f, 'glb'))], { stdio: 'ignore' });
      step.imgs.push({ src: out, cap: kind === 'failed' ? 'What came back' : 'What Meshy sent back' });
      (f.file ||= []).push(one(f, 'glb'));
    }
    if (!step.imgs.length) delete step.imgs;
    if (f.file) step.files = f.file;
    if (['meshy', 'failed'].includes(kind) && !step.credits) console.error('piece: a Meshy step without --credits');
    (piece.steps ||= []).push(step);
    const st = { picture: 'picture', pick: 'picked', meshy: 'modelled', fit: 'fitted', split: 'split', placed: 'in the scene', failed: 'failed', code: 'in code' }[kind];
    if (st && !one(f, 'keep-status')) piece.status = st;
    writeJson(P('place.json'), p); console.log(`added ${kind} step to ${id}${step.imgs ? ' with ' + step.imgs.map((i) => i.src).join(', ') : ''}`);
    break;
  }
  case 'board': {
    const [row, st, status, text, href] = rest; const p = S.place;
    need(row && st && status, 'board <row> <stage> <status> ["text"] [#href]');
    need(['done', 'started', 'review', 'next', 'later', 'na'].includes(status), 'status: done started review next later na');
    p.board ||= { rows: [] }; const r = p.board.rows.find((x) => x.id === row); need(r, `no board row ${row} (add it in place.json)`);
    (r.cells ||= {})[st] = [status, ...(text ? [text] : []), ...(href ? [href] : [])];
    writeJson(P('place.json'), p); console.log(`board ${row}/${st} = ${status}`);
    break;
  }
  case 'rounds': {
    const p = S.place; let n = 0;
    for (const a of p.areas || []) for (const s of a.subs || []) {
      const inline = (s.sections || []).filter((x) => x.html && !x.file); if (!inline.length) continue;
      const file = `rounds/${a.id}-${s.id}.html`;
      fs.mkdirSync(P('rounds'), { recursive: true }); fs.writeFileSync(P(file), inline.map((x) => x.html).join('\n\n') + '\n');
      s.sections = [{ title: inline.map((x) => x.title).filter(Boolean).join(' · '), file }]; n++;
    }
    writeJson(P('place.json'), p); console.log(`moved ${n} sub-tabs into rounds/`);
    break;
  }
  default: console.error('unknown command ' + cmd); process.exit(2);
}
