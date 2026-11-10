import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRows, findWorktree, launchRoot, ancestors, ownerOf, parseNetstat, parseWorktrees } from './core.mjs';

const worktrees = parseWorktrees([
  'worktree C:/Code/toy', 'HEAD a', 'branch refs/heads/main', '',
  'worktree C:/Code/toy/.claude/worktrees/fire', 'HEAD b', 'branch refs/heads/worktree-fire', '',
].join('\n'));
const vite = String.raw`"node" "C:\Code\toy\.claude\worktrees\fire\game\node_modules\.bin\\..\vite\bin\vite.js"`;
const P = (pid, ppid, name, cmd, created) => [pid, { pid, ppid, name, cmd, created }];

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
