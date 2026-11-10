// What the server manager knows about the machine. The parsing and classifying here are pure, so
// core.test.mjs can run them on captured text; the functions at the bottom touch the real system.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
export const HOME = join(homedir(), '.wizard-sim-servers');
const REGISTRY = join(HOME, 'registry.json');

// Port 4187 is left free: the browser check scripts refuse to run if something else holds it.
export const FIRST_PORT = { dev: 5187, lan: 5187, preview: 4188 };

const norm = (s) => String(s ?? '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
const endpoint = (s) => { const i = s.lastIndexOf(':'); return { addr: s.slice(0, i).replace(/[[\]]/g, ''), port: Number(s.slice(i + 1)) }; };
const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1';

export function parseNetstat(text) {
  const listen = [], established = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f[0] !== 'TCP' || f.length < 5) continue;
    const local = endpoint(f[1]), remote = endpoint(f[2]), pid = Number(f[4]);
    if (f[3] === 'LISTENING') listen.push({ ...local, pid });
    else if (f[3] === 'ESTABLISHED') established.push({ local, remote, pid });
  }
  return { listen, established };
}

export function parseWorktrees(porcelain) {
  const list = [];
  for (const block of porcelain.split(/\r?\n\r?\n/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) continue;
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? 'detached';
    list.push({ path, branch, name: list.length === 0 ? 'main' : basename(path), key: norm(path) });
  }
  return list;
}

/** The worktree a command line runs from, by the path in it. A server can outlive its deleted worktree. */
export function findWorktree(cmd, worktrees) {
  const c = norm(cmd);
  const hit = [...worktrees].sort((a, b) => b.key.length - a.key.length).find((w) => c.includes(`${w.key}/`));
  // The main checkout contains .claude/worktrees, so a deleted worktree's path would otherwise match it.
  const gone = /\.claude\/worktrees\/([^/"\s]+)/.exec(c);
  if (gone && !hit?.key.includes(`/.claude/worktrees/${gone[1]}`)) return { name: gone[1], branch: '?', deleted: true };
  return hit ?? null;
}

/** Parents, nearest first. A parent younger than its child means Windows reused a dead parent's pid. */
export function ancestors(proc, procs) {
  const chain = [];
  for (let at = proc; chain.length < 32;) {
    const up = procs.get(at.ppid);
    if (!up || up.pid === at.pid || (up.created && at.created && up.created > at.created)) break;
    chain.push(up);
    at = up;
  }
  return chain;
}

const isWrapper = (p) => (/^node(\.exe)?$/i.test(p.name) && /np[mx]-cli/i.test(p.cmd ?? ''))
  || (/^cmd\.exe$/i.test(p.name) && /\/c\b.*\b(vite|npm|npx)\b/i.test(p.cmd ?? ''));

const owners = [
  [(p) => /^claude(\.exe)?$/i.test(p.name) || /claude-code|@anthropic-ai/i.test(p.cmd ?? ''), 'claude'],
  [(p) => /codex/i.test(p.name) || /codex/i.test(p.cmd ?? ''), 'codex'],
  [(p) => /^code(\.exe)?$/i.test(p.name), 'vscode'],
  [(p) => /^cursor(\.exe)?$/i.test(p.name), 'cursor'],
  [(p) => /^windowsterminal(\.exe)?$/i.test(p.name), 'terminal'],
  [(p) => /^explorer\.exe$/i.test(p.name), 'desktop'],
];

/** Who keeps this server alive. No live owner anywhere up the chain makes it an orphan. */
export function ownerOf(chain) {
  for (const p of chain) for (const [test, label] of owners) if (test(p)) return label;
  return 'orphan';
}

/** The outermost npm/npx/cmd wrapper that exists only to run this server; killing it takes the lot. */
export function launchRoot(proc, chain) {
  let root = proc;
  for (const p of chain) { if (!isWrapper(p)) break; root = p; }
  return root;
}

const kindOf = (cmd) => {
  if (/vite(\.js)?["']?\s+preview\b/i.test(cmd)) return 'preview';
  if (/vite/i.test(cmd)) return 'dev';
  if (/http[.-]server/i.test(cmd)) return 'static';
  return 'other';
};
const RUNTIME = /^(node|bun|deno|python\d*|py)(\.exe)?$/i;

export function buildRows({ listen, established, procs, worktrees, registry = [], showAll = false }) {
  const byPid = new Map();
  for (const l of listen) {
    if (l.pid <= 4) continue;
    if (!byPid.has(l.pid)) byPid.set(l.pid, { ports: new Set(), addrs: new Set() });
    byPid.get(l.pid).ports.add(l.port);
    byPid.get(l.pid).addrs.add(l.addr);
  }
  const rows = [];
  for (const [pid, { ports, addrs }] of byPid) {
    const proc = procs.get(pid), reg = registry.find((r) => r.pid === pid);
    if (!proc || !RUNTIME.test(proc.name)) continue;
    const cmd = proc.cmd ?? '', chain = ancestors(proc, procs);
    let worktree = findWorktree(cmd, worktrees);
    for (const p of chain) worktree ??= findWorktree(p.cmd, worktrees);
    if (reg) worktree ??= findWorktree(`${reg.path}/`, worktrees) ?? { name: basename(reg.path), branch: '?', deleted: true };
    const looksLikeServer = /vite|http[.-]server|\bserve\b/i.test(cmd);
    const project = !!reg || (looksLikeServer && (!!worktree || /vite/i.test(cmd)));
    if (!project && !showAll) continue;

    const clients = [];
    for (const c of established) {
      if (c.pid !== pid || !ports.has(c.local.port)) continue;
      if (!isLoopback(c.remote.addr)) { clients.push(c.remote.addr); continue; }
      const peer = established.find((o) => o.local.port === c.remote.port && o.remote.port === c.local.port && o.pid !== pid);
      // No peer line means the other end is this same process, which is not a client.
      if (peer) clients.push((procs.get(peer.pid)?.name ?? '?').replace(/\.exe$/i, ''));
    }
    const root = launchRoot(proc, chain);
    const owner = reg ? 'servers' : ownerOf(chain);
    const sub = /\/prototypes\/([^/"\s]+)/.exec(norm(cmd))?.[1];
    rows.push({
      pid, rootPid: root.pid, created: proc.created, cmd, project, owner,
      orphan: owner === 'orphan', ports: [...ports].sort((a, b) => a - b),
      lan: [...addrs].some((a) => !isLoopback(a)), kind: reg?.mode === 'preview' ? 'preview' : kindOf(cmd),
      worktree: worktree?.name ?? '?', branch: worktree?.branch ?? '?', deleted: !!worktree?.deleted, sub,
      clients, log: reg?.log,
    });
  }
  return rows.sort((a, b) => Number(b.project) - Number(a.project) || a.ports[0] - b.ports[0]);
}

export function summarizeClients(clients) {
  const counts = new Map();
  for (const c of clients) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([who, n]) => (n > 1 ? `${who} x${n}` : who)).join(', ');
}

export function formatAge(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.floor(h / 24)}d${h % 24}h`;
}

// ---- the real machine ----

export async function readNetstat() {
  const { stdout } = await run('netstat', ['-ano', '-p', 'TCP'], { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  const v4 = parseNetstat(stdout);
  const { stdout: six } = await run('netstat', ['-ano', '-p', 'TCPv6'], { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  const v6 = parseNetstat(six);
  return { listen: [...v4.listen, ...v6.listen], established: [...v4.established, ...v6.established] };
}

const PROCESS_QUERY = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { $d=''; if ($_.CreationDate) { $d=$_.CreationDate.ToUniversalTime().ToString('o') }; [pscustomobject]@{pid=$_.ProcessId;ppid=$_.ParentProcessId;name=$_.Name;cmd=$_.CommandLine;created=$d} } | ConvertTo-Json -Compress";

export async function readProcesses() {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PROCESS_QUERY], { maxBuffer: 128 * 1024 * 1024, windowsHide: true });
  return new Map(JSON.parse(stdout).map((p) => [p.pid, p]));
}

export async function readWorktrees() {
  const { stdout } = await run('git', ['worktree', 'list', '--porcelain'], { cwd: here, windowsHide: true });
  return parseWorktrees(stdout).filter((w) => existsSync(w.path)).map((w) => ({
    ...w,
    hasVite: existsSync(join(w.path, 'game/node_modules/vite/bin/vite.js')),
    hasBuild: existsSync(join(w.path, 'game/packages/client/dist/index.html')),
    isGame: existsSync(join(w.path, 'game/package.json')),
  }));
}

export function readRegistry() {
  try { return JSON.parse(readFileSync(REGISTRY, 'utf8')); } catch { return []; }
}
function writeRegistry(entries) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(REGISTRY, JSON.stringify(entries, null, 1));
}
/** Drops entries whose process is gone, or whose pid now belongs to a process started later. */
export function pruneRegistry(procs) {
  const all = readRegistry();
  const kept = all.filter((r) => { const p = procs.get(r.pid); return p && Math.abs(Date.parse(p.created) - r.startedAt) < 60000; });
  if (kept.length !== all.length) writeRegistry(kept);
  return kept;
}

/** Starts vite in its own background process, logging to a file. It keeps running after this tool quits. */
export function startServer(worktree, mode, port) {
  const args = [join(worktree.path, 'game/node_modules/vite/bin/vite.js')];
  if (mode === 'preview') args.push('preview');
  args.push('--port', String(port), '--strictPort');
  if (mode === 'lan') args.push('--host');
  mkdirSync(join(HOME, 'logs'), { recursive: true });
  const log = join(HOME, 'logs', `${worktree.name}-${port}-${Date.now()}.log`);
  const fd = openSync(log, 'a');
  const child = spawn(process.execPath, args, {
    cwd: join(worktree.path, 'game/packages/client'), detached: true, stdio: ['ignore', fd, fd], windowsHide: true,
  });
  child.unref();
  writeRegistry([...readRegistry(), { pid: child.pid, path: worktree.path, mode, port, log, startedAt: Date.now() }]);
  return { pid: child.pid, log };
}

/** Ends a server and its launcher tree, after checking the pid still names the same process. */
export function killServer(row, procs) {
  const now = procs.get(row.pid);
  if (!now || now.created !== row.created) return { ok: true, gone: true };
  try {
    execFileSync('taskkill', ['/PID', String(procs.has(row.rootPid) ? row.rootPid : row.pid), '/T', '/F'], { stdio: 'pipe', windowsHide: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.stderr ?? e.message).trim() };
  }
}

export function readLogTail(path, lines = 3) {
  try {
    return readFileSync(path, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((l) => l.trim()).slice(-lines);
  } catch { return []; }
}

export function openUrl(url) {
  spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
