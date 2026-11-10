#!/usr/bin/env node
// A terminal view of the local game servers: which worktree, which port, who is connected. See README.md.
import {
  FIRST_PORT, buildRows, formatAge, killServer, openUrl, pruneRegistry, readLogTail, readNetstat,
  readProcesses, readWorktrees, startServer, summarizeClients,
} from './core.mjs';

const POLL_MS = 2000, SLOW_MS = 15000, START_TIMEOUT_MS = 30000;
const MODES = [
  { id: 'dev', label: 'dev', hint: 'hot reload' },
  { id: 'lan', label: 'dev + LAN', hint: 'hot reload, reachable from other machines' },
  { id: 'preview', label: 'preview', hint: 'serves the last build' },
];
const out = process.stdout, input = process.stdin;
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[22m`, bold: (s) => `\x1b[1m${s}\x1b[22m`, green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`, red: (s) => `\x1b[31m${s}\x1b[39m`, cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  invert: (s) => `\x1b[7m${s}\x1b[27m`,
};
const fit = (s, n) => { const t = String(s); return t.length > n ? `${t.slice(0, Math.max(0, n - 1))}~` : t.padEnd(n); };

const state = {
  rows: [], worktrees: [], procs: new Map(), net: { listen: [], established: [] }, registry: [],
  sel: 0, showAll: false, msg: '', msgTone: 'dim', view: 'list', seen: new Map(), pending: [], ready: false,
  pick: 0, pickWorktree: null, pickMode: null, portText: '', confirm: null, procsAt: 0, loading: false,
};
const say = (msg, tone = 'dim') => { state.msg = msg; state.msgTone = tone; };

async function refresh({ fresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  try {
    const now = Date.now();
    state.net = await readNetstat();
    const missing = state.net.listen.some((l) => l.pid > 4 && !state.procs.has(l.pid));
    if (fresh || missing || state.pending.length || now - state.procsAt > SLOW_MS) {
      [state.procs, state.worktrees] = await Promise.all([readProcesses(), readWorktrees()]);
      state.procsAt = Date.now();
      state.registry = pruneRegistry(state.procs);
    }
    const keep = state.rows[state.sel]?.pid;
    state.rows = buildRows({ ...state.net, procs: state.procs, worktrees: state.worktrees, registry: state.registry, showAll: state.showAll });
    if (keep !== undefined) { const i = state.rows.findIndex((r) => r.pid === keep); if (i >= 0) state.sel = i; }
    state.sel = Math.max(0, Math.min(state.sel, state.rows.length - 1));
    for (const r of state.rows) if (r.clients.length) state.seen.set(r.pid, Date.now());
    checkPending();
    state.ready = true;
  } catch (e) {
    say(`Refresh failed: ${e.message}`, 'red');
  } finally {
    state.loading = false;
    draw();
  }
}

function checkPending() {
  state.pending = state.pending.filter((p) => {
    if (state.net.listen.some((l) => l.pid === p.pid && l.port === p.port)) { say(`Running at http://localhost:${p.port}/`, 'green'); return false; }
    if (!state.procs.has(p.pid)) { say(`Server on ${p.port} exited: ${readLogTail(p.log, 1)[0] ?? 'no output'}`, 'red'); return false; }
    if (Date.now() - p.at > START_TIMEOUT_MS) { say(`Server on ${p.port} has not opened its port after 30s. Log: ${p.log}`, 'yellow'); return false; }
    return true;
  });
}

function freePort(mode) {
  const used = new Set(state.net.listen.map((l) => l.port));
  let port = FIRST_PORT[mode];
  while (used.has(port)) port++;
  return port;
}

function clientCell(r) {
  if (r.clients.length) return summarizeClients(r.clients);
  const seen = state.seen.get(r.pid);
  return seen ? `seen ${formatAge(Date.now() - seen)} ago` : '-';
}

function table(width, height) {
  const widths = { port: 7, worktree: Math.max(14, Math.min(28, width - 60)), kind: 9, clients: 18, owner: 9, age: 7 };
  const head = `  ${fit('PORT', widths.port)}${fit('WORKTREE', widths.worktree)}${fit('KIND', widths.kind)}${fit('CLIENTS', widths.clients)}${fit('OWNER', widths.owner)}${fit('AGE', widths.age)}PID`;
  const lines = [c.dim(fit(head, width))];
  if (!state.rows.length) lines.push(c.dim(state.ready ? '  No servers running. Press n to start one.' : '  Looking...'));
  const room = Math.max(1, height), first = Math.max(0, Math.min(state.sel - room + 1, state.rows.length - room));
  state.rows.slice(first, first + room).forEach((r, offset) => {
    const on = first + offset === state.sel;
    const name = `${r.worktree}${r.sub ? `/${r.sub}` : ''}${r.deleted ? ' (deleted)' : ''}`;
    const age = formatAge(Date.now() - Date.parse(r.created));
    const cells = [
      fit(r.ports.join(','), widths.port), fit(name, widths.worktree), fit(r.kind + (r.lan ? '+lan' : ''), widths.kind),
      fit(clientCell(r), widths.clients), fit(r.owner, widths.owner), fit(age, widths.age), String(r.pid),
    ];
    if (on) { lines.push(c.invert(fit(`> ${cells.join('')}`, width))); return; }
    if (r.clients.length) cells[3] = c.green(cells[3]);
    if (r.orphan) cells[4] = c.yellow(cells[4]);
    if (r.deleted) cells[1] = c.yellow(cells[1]);
    if (!r.project) cells[1] = c.dim(cells[1]);
    lines.push(`  ${cells.join('')}`);
  });
  return lines;
}

function details(width) {
  const r = state.rows[state.sel];
  if (!r) return [];
  const lines = [
    `${c.dim('url    ')}${c.cyan(`http://localhost:${r.ports[0]}/`)}   ${c.dim('branch')} ${r.branch}`,
    `${c.dim('kill   ')}pid ${r.rootPid}${r.rootPid === r.pid ? '' : ` (the npm launcher, and the server under it)`}`,
    `${c.dim('command')} ${fit(r.cmd, width - 9)}`,
  ];
  if (r.kind === 'preview' && !r.clients.length) lines.push(c.dim('A preview server holds no open connection, so an open tab shows as no client here.'));
  if (r.log) { lines.push(`${c.dim('log    ')}${fit(r.log, width - 8)}`); for (const l of readLogTail(r.log)) lines.push(c.dim(`  ${fit(l, width - 3)}`)); }
  return lines;
}

function picker(title, items, width) {
  return [c.bold(title), ...items.map((it, i) => {
    const text = fit(`${i === state.pick ? '> ' : '  '}${it.label}${it.hint ? `   ${it.hint}` : ''}`, width);
    if (i === state.pick) return c.invert(text);
    return it.disabled ? c.dim(text) : text;
  })];
}

const worktreeItems = () => state.worktrees.filter((w) => w.isGame).map((w) => {
  const running = state.rows.filter((r) => r.project && r.worktree === w.name).map((r) => r.ports[0]);
  return {
    label: w.name.padEnd(26), worktree: w, disabled: !w.hasVite,
    hint: `${w.branch}${w.hasVite ? '' : '  (needs npm install in game/)'}${running.length ? `  running on ${running.join(', ')}` : ''}`,
  };
});
const modeItems = () => MODES.map((m) => {
  const missing = m.id === 'preview' && !state.pickWorktree.hasBuild;
  return { ...m, label: m.label.padEnd(12), disabled: missing, hint: missing ? 'no build yet: run npm run build in game/' : m.hint };
});

function draw() {
  const width = Math.max(40, (out.columns || 110) - 1), height = out.rows || 30;
  const tone = c[state.msgTone] ?? ((s) => s);
  const count = state.rows.filter((r) => r.project).length;
  const orphans = state.rows.filter((r) => r.orphan && r.project && !r.clients.length).length;
  const top = [`${c.bold('Wizard Sim servers')}  ${c.dim(`${count} running${orphans ? `, ` : ''}`)}${orphans ? c.yellow(`${orphans} idle orphan${orphans > 1 ? 's' : ''}`) : ''}${state.showAll ? c.dim('  (showing every local runtime)') : ''}`, ''];
  let body, keys;
  if (state.view === 'pick-worktree') {
    body = picker('Start a server: which worktree?', worktreeItems(), width);
    keys = 'up/down choose   enter next   esc cancel';
  } else if (state.view === 'pick-mode') {
    body = picker(`Start a server in ${state.pickWorktree.name}: which kind?`, modeItems(), width);
    keys = 'up/down choose   enter next   esc back';
  } else if (state.view === 'port') {
    body = [c.bold(`Start ${state.pickMode} in ${state.pickWorktree.name}: which port?`), '', `  ${state.portText}${c.invert(' ')}`];
    keys = 'type a port   enter start   esc back';
  } else {
    const below = details(width), panel = state.view === 'confirm' ? state.confirm.lines : [];
    body = [...table(width, height - top.length - below.length - panel.length - 5), '', ...below];
    if (panel.length) body.push('', ...panel);
    keys = state.view === 'confirm' ? 'y confirm   any other key cancels' : 'up/down select   n new   x kill   X kill idle orphans   o open   a all runtimes   r refresh   q quit';
  }
  const lines = [...top, ...body];
  while (lines.length < height - 2) lines.push('');
  lines.length = Math.min(lines.length, height - 2);
  lines.push(state.msg ? tone(fit(state.msg, width)) : '', c.dim(fit(keys, width)));
  out.write(`\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J`);
}

function askKill(targets, lines) {
  state.confirm = { targets, lines };
  state.view = 'confirm';
}

function requestKill() {
  const r = state.rows[state.sel];
  if (!r) return;
  const who = r.clients.length ? c.red(`  ${r.clients.length} client connection(s): ${summarizeClients(r.clients)}.`) : '';
  askKill([r], [c.bold(`Kill port ${r.ports.join(',')} on ${r.worktree}?`) + who]);
}

function requestKillOrphans() {
  const targets = state.rows.filter((r) => r.project && r.orphan && !r.clients.length);
  if (!targets.length) { say('No idle orphans.'); return; }
  askKill(targets, [c.bold(`Kill ${targets.length} idle orphan${targets.length > 1 ? 's' : ''}?`), ...targets.map((r) => `  ${r.ports.join(',')}  ${r.worktree}  pid ${r.pid}`)]);
}

async function performKill(targets) {
  const procs = await readProcesses(); // Fresh, so a reused pid is never the one killed.
  const failed = [];
  for (const r of targets) { const res = killServer(r, procs); if (!res.ok) failed.push(`${r.ports[0]}: ${res.error}`); }
  say(failed.length ? `Could not kill ${failed.join('; ')}` : `Killed ${targets.length} server${targets.length > 1 ? 's' : ''}.`, failed.length ? 'red' : 'green');
  await refresh({ fresh: true });
}

function start() {
  const port = Number(state.portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { say('That is not a port number.', 'red'); return; }
  if (state.net.listen.some((l) => l.port === port)) { say(`Port ${port} is already in use.`, 'red'); return; }
  try {
    const { pid, log } = startServer(state.pickWorktree, state.pickMode, port);
    state.pending.push({ pid, port, log, at: Date.now() });
    say(`Starting ${state.pickMode} for ${state.pickWorktree.name} on ${port}...`);
    state.view = 'list';
    refresh({ fresh: true });
  } catch (e) {
    say(`Could not start: ${e.message}`, 'red');
  }
}

function move(delta, length) {
  if (state.view === 'list') state.sel = Math.max(0, Math.min(state.rows.length - 1, state.sel + delta));
  else state.pick = Math.max(0, Math.min(length - 1, state.pick + delta));
}

function onKey(k) {
  if (k === '\x03') quit();
  if (state.view === 'confirm') {
    const { targets } = state.confirm;
    state.view = 'list'; state.confirm = null;
    if (k === 'y' || k === 'Y') { say('Killing...'); performKill(targets); } else say('Cancelled.');
    return;
  }
  if (state.view === 'port') {
    if (k === '\x1b') { state.view = 'pick-mode'; state.pick = 0; }
    else if (k === '\r' || k === '\n') start();
    else if (k === '\x7f' || k === '\b') state.portText = state.portText.slice(0, -1);
    else if (/^\d$/.test(k) && state.portText.length < 5) state.portText += k;
    return;
  }
  if (state.view === 'pick-worktree' || state.view === 'pick-mode') {
    const items = state.view === 'pick-worktree' ? worktreeItems() : modeItems();
    if (k === '\x1b[A' || k === 'k') move(-1, items.length);
    else if (k === '\x1b[B' || k === 'j') move(1, items.length);
    else if (k === '\x1b') { state.view = state.view === 'pick-mode' ? 'pick-worktree' : 'list'; state.pick = 0; }
    else if (k === '\r' || k === '\n') {
      const item = items[state.pick];
      if (!item) return;
      if (item.disabled) { say(item.hint, 'yellow'); return; }
      if (state.view === 'pick-worktree') { state.pickWorktree = item.worktree; state.view = 'pick-mode'; state.pick = 0; }
      else { state.pickMode = item.id; state.portText = String(freePort(item.id)); state.view = 'port'; }
    }
    return;
  }
  const r = state.rows[state.sel];
  if (k === 'q' || k === '\x1b') quit();
  else if (k === '\x1b[A' || k === 'k') move(-1);
  else if (k === '\x1b[B' || k === 'j') move(1);
  else if (k === 'n') { state.view = 'pick-worktree'; state.pick = 0; say(''); }
  else if (k === 'x') requestKill();
  else if (k === 'X') requestKillOrphans();
  else if (k === 'o' && r) { openUrl(`http://localhost:${r.ports[0]}/`); say(`Opened port ${r.ports[0]}.`); }
  else if (k === 'a') { state.showAll = !state.showAll; refresh(); }
  else if (k === 'r') refresh({ fresh: true });
}

function restoreScreen() { out.write('\x1b[?25h\x1b[?1049l'); }
function quit() { restoreScreen(); process.exit(0); }

async function printJson() {
  const [net, procs, worktrees] = await Promise.all([readNetstat(), readProcesses(), readWorktrees()]);
  const rows = buildRows({ ...net, procs, worktrees, registry: pruneRegistry(procs), showAll: process.argv.includes('--all') });
  console.log(JSON.stringify(rows, null, 2));
}

if (process.argv.includes('--json')) await printJson();
else {
  process.on('exit', restoreScreen);
  out.write('\x1b[?1049h\x1b[?25l');
  if (input.isTTY) input.setRawMode(true);
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    for (const k of chunk.match(/\x1b\[[0-9;]*[A-Za-z~]|[\s\S]/g) ?? []) onKey(k);
    draw();
  });
  input.on('end', quit); // With its input gone nothing can press q, and this tool would become an orphan itself.
  input.resume();
  out.on('resize', draw);
  draw();
  await refresh({ fresh: true });
  setInterval(refresh, POLL_MS);
}
