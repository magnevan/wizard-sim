import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRows, findWorktree, formatBehind, launchRoot, ancestors, ownerOf, parseNetstat, parseStatusPaths, parseWorktrees } from './core.mjs';

const worktrees = parseWorktrees([
  'worktree C:/Code/toy', 'HEAD a', 'branch refs/heads/main', '',
  'worktree C:/Code/toy/.claude/worktrees/fire', 'HEAD b', 'branch refs/heads/worktree-fire', '',
].join('\n'));
const vite = String.raw`"node" "C:\Code\toy\.claude\worktrees\fire\game\node_modules\.bin\\..\vite\bin\vite.js"`;
const P = (pid, ppid, name, cmd, created) => [pid, { pid, ppid, name, cmd, created }];

test('a fresh server is its own kind and keeps its worktree path', () => {
  const procs = new Map([P(30, 99, 'node.exe', String.raw`"node" C:\Code\toy\tools\servers\fresh.mjs C:\Code\toy\.claude\worktrees\fire 4188`, 'e')]);
  const [row] = buildRows({ listen: [{ addr: '::1', port: 4188, pid: 30 }], established: [], procs, worktrees, registry: [{ pid: 30, path: 'C:/Code/toy/.claude/worktrees/fire', mode: 'fresh' }] });
  assert.equal(row.kind, 'fresh');
  assert.equal(row.worktree, 'fire');
  assert.equal(row.worktreePath, 'C:/Code/toy/.claude/worktrees/fire');
  // Started by the tool in the fire worktree, serving main: the argument wins over the script's own path.
  const other = new Map([P(31, 99, 'node.exe', String.raw`"node" C:\Code\toy\.claude\worktrees\fire\tools\servers\fresh.mjs C:\Code\toy 4189`, 'e')]);
  const [main] = buildRows({ listen: [{ addr: '::1', port: 4189, pid: 31 }], established: [], procs: other, worktrees });
  assert.equal(main.kind, 'fresh');
  assert.equal(main.worktree, 'main');
  assert.equal(main.deleted, false);
});

test('status paths: plain, renamed, quoted, untracked', () => {
  assert.deepEqual(parseStatusPaths(' M game/a.ts\nR  game/old.ts -> game/new.ts\n?? "game/with space.ts"\n?? game/dir/\n'),
    ['game/a.ts', 'game/new.ts', 'game/with space.ts', 'game/dir/']);
});

test('how far behind a build is, in one cell', () => {
  assert.equal(formatBehind(null), 'no build');
  assert.equal(formatBehind({ commits: 0, edits: 0 }), 'current');
  assert.equal(formatBehind({ commits: 1, edits: 0 }), '1 commit');
  assert.equal(formatBehind({ commits: 13, edits: 0 }), '13 commits');
  assert.equal(formatBehind({ commits: 0, edits: 2 }), '2 edits');
  assert.equal(formatBehind({ commits: 3, edits: 4 }), '3c+4e');
  assert.equal(formatBehind({ commits: null, edits: 0 }), '?');
});

test('netstat: IPv4 and bracketed IPv6, listening and established', () => {
  const { listen, established } = parseNetstat([
    '  Proto  Local Address  Foreign Address  State  PID',
    '  TCP    127.0.0.1:5187  0.0.0.0:0  LISTENING  10',
    '  TCP    [::1]:5188  [::]:0  LISTENING  11',
    '  TCP    [::1]:5188  [::1]:6000  ESTABLISHED  11',
  ].join('\r\n'));
  assert.deepEqual(listen, [{ addr: '127.0.0.1', port: 5187, pid: 10 }, { addr: '::1', port: 5188, pid: 11 }]);
  assert.deepEqual(established[0].remote, { addr: '::1', port: 6000 });
});

test('worktree: the nested worktree wins over the main checkout that contains it', () => {
  assert.equal(findWorktree(vite, worktrees).name, 'fire');
  assert.equal(findWorktree(String.raw`node C:\Code\toy\game\node_modules\vite\bin\vite.js`, worktrees).name, 'main');
});

test('worktree: a server whose worktree was deleted still names it', () => {
  const hit = findWorktree(String.raw`node C:\Code\toy\.claude\worktrees\old\game\vite.js`, worktrees);
  assert.deepEqual([hit.name, hit.deleted], ['old', true]);
});

test('kill target: walks through npm and cmd but stops at the interactive shell', () => {
  const procs = new Map([
    P(1, 0, 'explorer.exe', '', 'a'),
    P(2, 1, 'powershell.exe', 'powershell', 'b'),
    P(3, 2, 'node.exe', 'node npm-cli.js run dev', 'c'),
    P(4, 3, 'cmd.exe', 'cmd.exe /d /s /c vite', 'd'),
    P(5, 4, 'node.exe', vite, 'e'),
  ]);
  const chain = ancestors(procs.get(5), procs);
  assert.equal(launchRoot(procs.get(5), chain).pid, 3);
  assert.equal(ownerOf(chain), 'desktop');
});

test('orphan: a reused parent pid does not count as a live parent', () => {
  const procs = new Map([P(1, 0, 'Code.exe', '', 'z-later'), P(5, 1, 'node.exe', vite, 'e')]);
  assert.equal(ownerOf(ancestors(procs.get(5), procs)), 'orphan');
});

test('clients: a browser on loopback counts, the server talking to itself does not', () => {
  const procs = new Map([P(5, 99, 'node.exe', vite, 'e'), P(7, 99, 'chrome.exe', 'chrome', 'e')]);
  const rows = buildRows({
    listen: [{ addr: '::1', port: 5187, pid: 5 }], procs, worktrees,
    established: [
      { local: { addr: '::1', port: 5187 }, remote: { addr: '::1', port: 6000 }, pid: 5 },
      { local: { addr: '::1', port: 6000 }, remote: { addr: '::1', port: 5187 }, pid: 7 },
      { local: { addr: '::1', port: 5187 }, remote: { addr: '::1', port: 6001 }, pid: 5 },
      { local: { addr: '::1', port: 6001 }, remote: { addr: '::1', port: 5187 }, pid: 5 },
    ],
  });
  assert.deepEqual(rows[0].clients, ['chrome']);
  assert.equal(rows[0].worktree, 'fire');
});

test('filter: an unrelated node listener only appears with showAll', () => {
  const procs = new Map([P(8, 99, 'node.exe', 'node C:/other/app.js', 'e')]);
  const args = { listen: [{ addr: '127.0.0.1', port: 9000, pid: 8 }], established: [], procs, worktrees };
  assert.equal(buildRows(args).length, 0);
  assert.equal(buildRows({ ...args, showAll: true }).length, 1);
});
