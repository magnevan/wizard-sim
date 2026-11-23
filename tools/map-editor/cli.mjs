#!/usr/bin/env node
/**
 * cli.mjs - Claude's command line for the map editor (see tools/map-editor/README.md).
 *
 * Usage: node tools/map-editor/cli.mjs <command> [args] [--json]
 *   help
 *   scenes
 *   new <name> [w h] [--from <scene>]     a blank scene of w x h cells (default 24 x 16), or a copy
 *   get <name> [--compiled]
 *   findings <name>
 *   query <name> <x> <y> [r]        |  query <name> --rect x0 y0 x1 y1
 *   apply <name> <ops|@file.json|-> [--base N] [--dry] [--label "..."] [--author user|claude]
 *   undo <name> [--author claude]   |  redo <name>   |  history <name> [n]
 *   pins <name> [--status open|new|resolved|all]
 *   pin <name> add <x> <y> <note>   |  reply <id> <text>  |  resolve <id> <scene|rule|piece> [text]
 *       seen <id...>  |  delete <id>
 *   view <name> [--cam top|game|current] [--x X --y Y --r R] [--out path.png]
 * Base URL: $MAP_EDITOR_URL (default http://127.0.0.1:5187). Exit 2 if the server is down, 1 on errors.
 * Coordinates are corner coordinates: corner (x, y) is corners[y][x].
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.env.MAP_EDITOR_URL || 'http://127.0.0.1:5187').replace(/\/$/, '');
const VALUE_FLAGS = new Set(['base', 'label', 'author', 'status', 'cam', 'x', 'y', 'r', 'out', 'from']);

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rect') { flags.rect = argv.slice(i + 1, i + 5).map(Number); i += 4; }
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (VALUE_FLAGS.has(k)) flags[k] = argv[++i]; else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function die(msg, code = 1) { console.error(msg); process.exit(code); }

async function call(method, route, { query, body, raw } = {}) {
  let url = BASE + '/__map/' + route;
  if (query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== false) q.set(k, String(v));
    url += '?' + q;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    die('map editor not running: start it with `npm run dev` in game/ and open http://localhost:5187/editor.html', 2);
  }
  if (raw && res.ok) return Buffer.from(await res.arrayBuffer());
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (res.status === 409 && route === 'apply') return { conflict: true, data };
  if (!res.ok) die(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

const out = (flags, data, pretty) => console.log(flags.json ? JSON.stringify(data, null, 2) : pretty(data));
const at = (a) => (a ? `(${a.x ?? a[0]},${a.y ?? a[1]})` : '');
const finding = (f) => `  [${f.severity}] ${f.code} ${f.at ? at(f.at) : ''} ${f.msg}`.replace(/ +/g, ' ');

function ruler(width, pad) {
  const tens = [], units = [];
  for (let i = 0; i < width; i++) { tens.push(i % 10 === 0 ? String(Math.floor(i / 10) % 10) : ' '); units.push(i % 10); }
  return `${' '.repeat(pad)}${tens.join('')}\n${' '.repeat(pad)}${units.join('')}`;
}

function showScene(d) {
  const s = d.scene || {};
  const L = [`${d.name}  rev ${d.rev}`];
  if (s.terraces?.length) {
    L.push('terraces:');
    for (const t of s.terraces) L.push(`  ${t.glyph ?? ' '} ${t.id}  ${t.name ?? ''}  h=${t.h}  edge=${t.edge}${t.mat ? '  mat=' + t.mat : ''}${t.walk === false ? '  nowalk' : ''}`);
  }
  if (s.corners?.length) {
    const w = Math.max(...s.corners.map((r) => r.length));
    L.push('corners (x across, y down):', ruler(w, 4));
    s.corners.forEach((row, y) => L.push(String(y).padStart(3) + ' ' + row));
  }
  const objs = s.objects || [];
  if (objs.length) {
    L.push('objects:');
    for (const o of objs) L.push('  ' + JSON.stringify(o));
  }
  if (d.summary) L.push(`summary: ${JSON.stringify(d.summary)}`);
  if (d.compiled) L.push('compiled: ' + JSON.stringify(d.compiled).slice(0, 2000));
  return L.join('\n');
}

function showQuery(d) {
  const L = [`rev ${d.rev}`];
  L.push(`corners (${d.corners?.length ?? 0}): ` + (d.corners || []).map((c) => `${c.glyph}@${c.x},${c.y}${c.terrace ? '=' + c.terrace : ''}`).join(' '));
  for (const o of d.objects || []) L.push('object ' + JSON.stringify(o));
  for (const i of d.instances || []) L.push(`inst ${i.p} e=${i.e} o=${i.o} v=${i.v} @${i.x},${i.y} h=${i.h} src=${i.src}`);
  for (const f of d.findings || []) L.push(finding(f));
  return L.join('\n');
}

function showApply(d) {
  const L = [`rev ${d.rev}${d.dry ? ' (dry run)' : ''}`];
  if (d.minted?.length) L.push('minted: ' + d.minted.join(', '));
  if (d.changed) L.push(`changed: ${d.changed.corners ?? 0} corners, ids: ${(d.changed.ids || []).join(', ') || '-'}`);
  const df = d.diff || {};
  L.push(`added findings (${df.added?.length ?? 0}):`, ...(df.added || []).map(finding));
  L.push(`resolved findings (${df.resolved?.length ?? 0}):`, ...(df.resolved || []).map(finding));
  const pieces = Object.entries(df.pieces || {}).map(([p, n]) => `${p} ${n > 0 ? '+' : ''}${n}`);
  L.push('pieces: ' + (pieces.join(', ') || 'no change'));
  if (d.summary) L.push(`summary: ${JSON.stringify(d.summary)}`);
  return L.join('\n');
}

function showPin(p) {
  const a = p.anchor || {};
  const where = [`(${a.x},${a.y})`, a.obj && `obj ${a.obj}`, a.inst && `inst p ${a.inst.p ?? a.inst}`].filter(Boolean).join(', ');
  const L = [`pin ${p.id} [${p.status}${p.outcome ? ':' + p.outcome : ''}] by ${p.author}: ${p.note}`, `  anchor ${where}`];
  for (const t of p.thread || []) L.push(`  - ${t.author}: ${t.text}`);
  return L.join('\n');
}

function readOps(arg) {
  if (!arg) die('apply needs <ops>: JSON, @file.json or - for stdin');
  let text = arg === '-' ? fs.readFileSync(0, 'utf8') : arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg;
  let ops;
  try { ops = JSON.parse(text); } catch (e) { die('ops are not valid JSON: ' + e.message); }
  return Array.isArray(ops) ? ops : [ops];
}

function help() {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  return src.slice(src.indexOf('/**') + 4, src.indexOf('*/')).replace(/^ \* ?/gm, '').trim();
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, name, ...rest] = pos;
  if (!cmd || cmd === 'help') return console.log(help());
  if (cmd !== 'scenes' && !name) die(`${cmd} needs a scene name (see: scenes)`);

  switch (cmd) {
    case 'scenes': {
      const d = await call('GET', 'scenes');
      return out(flags, d, (d) => d.scenes.map((s) => `${s.name}  rev ${s.rev}  errors ${s.errors}  warnings ${s.warnings}`).join('\n'));
    }
    case 'new': {
      const d = await call('POST', 'new', { body: { name, w: rest[0] ? Number(rest[0]) : undefined, h: rest[1] ? Number(rest[1]) : undefined, from: flags.from } });
      return out(flags, d, (d) => `created ${d.name}  rev ${d.rev}  errors ${d.summary.errors}  warnings ${d.summary.warnings}; open http://localhost:5187/editor.html?scene=${d.name}`);
    }
    case 'get': {
      const d = await call('GET', 'scene', { query: { name, compiled: flags.compiled ? 1 : undefined } });
      return out(flags, d, showScene);
    }
    case 'findings': {
      const d = await call('GET', 'findings', { query: { name } });
      return out(flags, d, (d) => `rev ${d.rev}, ${d.findings.length} findings\n` + d.findings.map(finding).join('\n'));
    }
    case 'query': {
      let q = { name };
      if (flags.rect) { if (flags.rect.length < 4 || flags.rect.some(isNaN)) die('--rect needs x0 y0 x1 y1'); [q.x0, q.y0, q.x1, q.y1] = flags.rect; }
      else { if (rest.length < 2) die('query <name> <x> <y> [r]'); [q.x, q.y, q.r] = rest; }
      return out(flags, await call('GET', 'query', { query: q }), showQuery);
    }
    case 'apply': {
      const body = { name, ops: readOps(rest[0]), author: flags.author || 'claude' };
      if (flags.base !== undefined) body.base = Number(flags.base);
      if (flags.dry) body.dry = true;
      if (flags.label) body.label = flags.label;
      const d = await call('POST', 'apply', { body });
      if (d.conflict) {
        if (flags.json) console.log(JSON.stringify(d.data, null, 2));
        else console.error('409 conflict: ' + (d.data.error || '') + '\n' + JSON.stringify(d.data.conflicts, null, 2));
        process.exit(1);
      }
      return out(flags, d, showApply);
    }
    case 'undo': {
      const d = await call('POST', 'undo', { body: { name, author: flags.author || 'claude' } });
      return out(flags, d, (d) => `rev ${d.rev}, undone: ${d.undone?.label ?? ''} (${d.undone?.author ?? ''})`);
    }
    case 'redo': {
      const d = await call('POST', 'redo', { body: { name } });
      return out(flags, d, (d) => `rev ${d.rev}${d.redone ? ', redone: ' + (d.redone.label ?? '') : ''}`);
    }
    case 'history': {
      const d = await call('GET', 'history', { query: { name, n: rest[0] } });
      return out(flags, d, (d) => d.groups.map((g) => `${g.group}  rev ${g.rev}  ${g.author}  ${g.label ?? ''}  ${g.time ?? ''}`).join('\n'));
    }
    case 'pins': {
      const d = await call('GET', 'pins', { query: { name, status: flags.status } });
      return out(flags, d, (d) => (d.pins.length ? d.pins.map(showPin).join('\n') : 'no pins'));
    }
    case 'pin': return pinCmd(name, rest, flags);
    case 'view': {
      const buf = await call('GET', 'view', { query: { name, cam: flags.cam, x: flags.x, y: flags.y, r: flags.r }, raw: true });
      const dir = process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp') : os.tmpdir();
      const file = flags.out || path.join(dir, 'map-view.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return console.log(file);
    }
    default: die(`unknown command "${cmd}" (try: help)`);
  }
}

async function pinCmd(name, rest, flags) {
  const [op, ...a] = rest;
  let body;
  switch (op) {
    case 'add':
      if (a.length < 3) die('pin <name> add <x> <y> <note>');
      body = { op, note: a.slice(2).join(' '), anchor: { x: Number(a[0]), y: Number(a[1]) } }; break;
    case 'reply':
      if (a.length < 2) die('pin <name> reply <id> <text>');
      body = { op, id: a[0], text: a.slice(1).join(' '), author: flags.author || 'claude' }; break;
    case 'resolve':
      if (!['scene', 'rule', 'piece'].includes(a[1])) die('pin <name> resolve <id> <scene|rule|piece> [text]');
      body = { op, id: a[0], outcome: a[1], text: a.slice(2).join(' ') || undefined }; break;
    case 'seen':
      if (!a.length) die('pin <name> seen <id...>');
      body = { op, ids: a }; break;
    case 'delete':
      if (!a[0]) die('pin <name> delete <id>');
      body = { op, id: a[0] }; break;
    default: die('pin <name> add|reply|resolve|seen|delete ...');
  }
  const d = await call('POST', 'pins', { body: { name, ...body } });
  out(flags, d, (d) => (d.pin ? showPin(d.pin) : 'ok'));
}

main().catch((e) => die(String(e?.stack || e)));
