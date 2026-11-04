// Shared by the browser scripts: serve the built client (vite preview) and find Chrome.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CLIENT = join(here, '../packages/client');
// PREVIEW_PORT lets two scripts (or agents) run side by side.
export const PORT = Number(process.env.PREVIEW_PORT) || 4187;
export const BASE = `http://localhost:${PORT}/`;

export function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  return hit;
}

/** Starts vite preview on PORT and resolves once it answers. Returns a stop() that ends only that process tree. */
export async function startPreview() {
  if (!existsSync(join(CLIENT, 'dist/index.html'))) throw new Error('No build: run npm run build first');
  const ours = async () => { try { const r = await fetch(BASE); return r.ok && (await r.text()).includes('<title>Wizard Sim</title>'); } catch { return false; } };
  try { await fetch(BASE); throw new Error(`Port ${PORT} is already in use by another server; stop it or change PORT in scripts/serve.mjs`); } catch (e) { if (String(e.message).startsWith('Port')) throw e; }
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
  const stop = () => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  };
  for (let i = 0; i < 100; i++) {
    if (await ours()) return stop;
    await new Promise((r) => setTimeout(r, 150));
  }
  stop();
  throw new Error('vite preview did not start on ' + BASE);
}

/** Runs headless Chrome with its own throwaway profile. WebGL goes through SwiftShader, so no GPU is needed. */
export function chrome(args) {
  const profile = mkdtempSync(join(tmpdir(), 'wizard-sim-chrome-'));
  const r = spawnSync(findChrome(), [
    '--headless=new', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...args,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.stdout;
}
