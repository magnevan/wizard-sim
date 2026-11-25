#!/usr/bin/env node
// Removes worktrees whose work is finished, so no session has to be woken just to clean up.
//
//   node tools/prune-worktrees.mjs            dry run: every worktree and what would happen to it
//   node tools/prune-worktrees.mjs --apply    remove the ones that are safe to remove
//   node tools/prune-worktrees.mjs --detach   --apply in the background, logged (the SessionStart hook)
//   --min-age <hours>                         leave worktrees touched more recently (default 24)
//
// A worktree is removed only when all of these hold:
//   - it isn't pinned (`git worktree lock --reason "keep: ..."`); Claude Code's own pin counts only while its
//     session's process runs
//   - it has no uncommitted or untracked changes
//   - its branch is merged into another branch (main, court-kit, any local or remote branch but its own)
//   - nothing has it open: no process has its folder as working directory (a live Claude session or a
//     server), and no process's command line names it
//   - no commit or checkout in it for --min-age hours
// Ignored files that aren't build output (screenshots, scene histories, .reference) are copied to
// .claude/worktree-leftovers/<name>/ first. The branch is kept unless it's merged into origin/main.
// Folders under .claude/worktrees that git no longer knows are removed when every file in them is
// already in git. Anything with unmerged work is listed and left alone.

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply') || args.includes('--detach-child');
const minAgeArg = args.indexOf('--min-age');
const MIN_AGE_H = minAgeArg >= 0 ? Number(args[minAgeArg + 1]) : 24;
const BUILD_DIRS = /(^|\/)(node_modules|dist|__pycache__|\.vite|\.turbo|\.cache|coverage)(\/|$)|\.tsbuildinfo$/;

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const tryGit = (cwd, ...a) => { try { return git(cwd, ...a); } catch { return null; } };
const norm = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();

// The main checkout is the first entry of `git worktree list`, whichever worktree we run from.
const here = dirname(fileURLToPath(import.meta.url));
const listing = git(here, 'worktree', 'list', '--porcelain').split(/\n\n+/).filter(Boolean).map((block) => ({
  path: /^worktree (.+)$/m.exec(block)[1],
  head: /^HEAD (\w+)$/m.exec(block)?.[1],
  branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null,
  locked: /^locked(?: (.*))?$/m.exec(block),
}));
const ROOT = listing[0].path;
const WT_DIR = join(ROOT, '.claude', 'worktrees');
const LEFTOVERS = join(ROOT, '.claude', 'worktree-leftovers');
const LOG = join(ROOT, '.claude', 'worktree-prune.log');

if (args.includes('--detach')) {
  // Return at once so a session isn't kept waiting; the child writes its report to the log.
  const out = openSync(LOG, 'w');
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--detach-child', ...args.filter((a) => a !== '--detach')],
    { detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
  process.exit(0);
}

// One prune at a time: two sessions starting together would otherwise race.
const LOCK = join(resolve(ROOT, git(ROOT, 'rev-parse', '--git-common-dir')), 'prune-worktrees.lock');
if (APPLY) {
  try { if (Date.now() - statSync(LOCK).mtimeMs > 30 * 60e3) unlinkSync(LOCK); } catch { /* no lock */ }
  try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); } catch { console.log('another prune is running'); process.exit(0); }
  process.on('exit', () => { try { unlinkSync(LOCK); } catch { /* gone */ } });
}

// Every process's command line, once, to spot servers and tools running from a worktree.
let commandLines = '';
try {
  commandLines = process.platform === 'win32'
    ? execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }'],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 })
    : execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' });
} catch { /* the folder probe still runs */ }
commandLines = commandLines.replace(/\\/g, '/').toLowerCase();

/** Whether a process holds the folder: on Windows a folder can't be renamed while anything has its working directory inside it. */
function inUse(path) {
  if (commandLines.includes(norm(path) + '/') || commandLines.includes(norm(path) + '"')) return 'a running process names it';
  const probe = `${path}.prune-probe`;
  try { renameSync(path, probe); renameSync(probe, path); return null; } catch (e) { return `open in a running process (${e.code})`; }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The branches a commit counts as merged into: every local and remote branch except the worktree's own. */
const allRefs = git(ROOT, 'for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes')
  .split('\n').filter((r) => r && !r.endsWith('/HEAD'));
function mergedInto(head, branch) {
  const own = new Set([branch, `origin/${branch}`]);
  // A worktree with no commits of its own counts as merged into the branch it came from; --min-age protects a fresh one.
  return allRefs.filter((r) => !own.has(r) && tryGit(ROOT, 'merge-base', '--is-ancestor', head, r) !== null)
    .sort((a, b) => rank(a) - rank(b));
}
function rank(ref) { return ['origin/main', 'main', 'origin/court-kit', 'court-kit'].indexOf(ref) + 1 || 9; }
function unmergedCount(head, branch) {
  const own = new Set([branch, `origin/${branch}`]);
  return tryGit(ROOT, 'rev-list', '--count', head, '--not', ...allRefs.filter((r) => !own.has(r))) ?? '?';
}
const isAncestor = (a, b) => tryGit(ROOT, 'merge-base', '--is-ancestor', a, b) !== null;

/** Hours since the worktree last had a commit or checkout, from its HEAD reflog. */
function ageHours(path) {
  const t = Number(tryGit(path, 'log', '-1', '-g', '--format=%ct', 'HEAD') || tryGit(path, 'log', '-1', '--format=%ct', 'HEAD') || 0);
  return (Date.now() / 1000 - t) / 3600;
}

function saveIgnored(path, name) {
  const out = tryGit(path, 'status', '--porcelain', '--ignored', '-z') ?? '';
  const keep = out.split('\0').filter((l) => l.startsWith('!! ')).map((l) => l.slice(3)).filter((p) => !BUILD_DIRS.test(p));
  for (const p of keep) {
    const dest = join(LEFTOVERS, name, p);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(path, p), dest, { recursive: true });
  }
  return keep;
}

const rows = [];
const say = (name, verdict, why) => rows.push({ name, verdict, why });

for (const w of listing.slice(1)) {
  const name = basename(w.path);
  if (!existsSync(w.path)) { say(name, 'prune', 'folder already gone'); if (APPLY) git(ROOT, 'worktree', 'prune'); continue; }
  // Claude Code pins a worktree to its session as "claude session <name> (pid N)"; that pin lapses when the
  // process ends. Any other reason is a pin someone chose (`git worktree lock --reason "keep: ..."`).
  const reason = w.locked?.[1] ?? '';
  const sessionPid = w.locked && /^claude session .*\(pid (\d+)\)$/.exec(reason)?.[1];
  if (w.locked && !sessionPid) { say(name, 'keep', `pinned${reason ? `: ${reason}` : ''}`); continue; }
  if (sessionPid && pidAlive(Number(sessionPid))) { say(name, 'keep', `its Claude session is running (pid ${sessionPid})`); continue; }
  const dirty = (tryGit(w.path, 'status', '--porcelain') ?? '?').split('\n').filter(Boolean).length;
  if (dirty) { say(name, 'keep', `${dirty} uncommitted change${dirty > 1 ? 's' : ''}`); continue; }
  const into = mergedInto(w.head, w.branch);
  if (!into.length) {
    const ahead = unmergedCount(w.head, w.branch);
    const pushed = w.branch && tryGit(ROOT, 'rev-parse', '--verify', '-q', `origin/${w.branch}`) === w.head;
    say(name, 'UNMERGED', `${ahead} commit(s) on ${w.branch ?? 'a detached HEAD'} in no other branch${pushed ? ' (pushed)' : ' (NOT pushed)'}`);
    continue;
  }
  const age = ageHours(w.path);
  if (age < MIN_AGE_H) { say(name, 'keep', `merged into ${into[0]}, but touched ${age.toFixed(1)}h ago`); continue; }
  const busy = inUse(w.path);
  if (busy) { say(name, 'keep', `merged into ${into[0]}, but ${busy}`); continue; }

  const dropBranch = w.branch && isAncestor(w.head, 'origin/main');
  if (!APPLY) { say(name, 'prune', `merged into ${into[0]}${dropBranch ? ', branch too' : ''}`); continue; }
  const saved = saveIgnored(w.path, name);
  try { git(ROOT, 'worktree', 'remove', '--force', '--force', w.path); } catch {
    git(ROOT, 'worktree', 'prune');
    try { rmSync(w.path, { recursive: true, force: true }); } catch { /* reported below */ }
  }
  const left = existsSync(w.path);
  if (dropBranch) tryGit(ROOT, 'branch', '-D', w.branch);
  say(name, 'pruned', [`merged into ${into[0]}`, dropBranch && `branch ${w.branch} deleted`, saved.length && `${saved.length} ignored item(s) saved to leftovers`,
    left && 'folder partly left (locked)'].filter(Boolean).join(', '));
}

// Folders git no longer knows: left by a failed removal or a deleted session.
const known = new Set(listing.map((w) => norm(w.path)));
for (const name of existsSync(WT_DIR) ? readdirSync(WT_DIR) : []) {
  const path = join(WT_DIR, name);
  if (known.has(norm(path)) || !statSync(path).isDirectory() || name.endsWith('.prune-probe')) continue;
  const files = [];
  const walk = (d, rel) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (BUILD_DIRS.test(r) || r === '.git') continue;
    if (e.isDirectory()) walk(join(d, e.name), r); else if (e.isFile()) files.push(r);
  } };
  walk(path, '');
  let unknown = 0;
  if (files.length) {
    const hashes = execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: ROOT, input: files.map((f) => join(path, f)).join('\n'), encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 }).trim().split('\n');
    const checked = execFileSync('git', ['cat-file', '--batch-check'], { cwd: ROOT, input: hashes.join('\n') + '\n', encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 });
    unknown = checked.split('\n').filter((l) => l.endsWith(' missing')).length;
  }
  if (unknown) { say(name, 'UNMERGED', `orphan folder with ${unknown} file(s) not in git`); continue; }
  const busy = inUse(path);
  if (busy) { say(name, 'keep', `orphan folder, ${busy}`); continue; }
  if (!APPLY) { say(name, 'prune', `orphan folder, all ${files.length} file(s) already in git`); continue; }
  try { rmSync(path, { recursive: true, force: true }); } catch { /* reported */ }
  say(name, 'pruned', existsSync(path) ? 'orphan folder, partly left (locked)' : 'orphan folder');
}

const width = Math.max(...rows.map((r) => r.name.length), 4);
console.log(`${new Date().toISOString()} ${APPLY ? 'apply' : 'dry run'} (min age ${MIN_AGE_H}h)`);
for (const r of rows) console.log(`${r.verdict.padEnd(8)} ${r.name.padEnd(width)}  ${r.why}`);
if (!rows.length) console.log('no worktrees besides the main checkout');
if (!APPLY && rows.some((r) => r.verdict === 'prune')) console.log('\nrun with --apply to remove the ones marked prune');
