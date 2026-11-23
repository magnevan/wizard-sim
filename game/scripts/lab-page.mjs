// Shared by lab-shot.mjs and lab-fps.mjs (not run on its own): takes `--page <name>` and `--query "..."` off the
// arguments and serves the client's <name>.html lab page (default kit3d) from the Vite dev server, since lab pages
// aren't in the build. Starts its own server on the given port and stops only that process.
import { spawn, spawnSync } from 'node:child_process';
import { CLIENT } from './serve.mjs';

/** Removes `--name value` from args and returns the value (or the fallback). */
export function takeOpt(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
}

/** Starts `vite` on port and waits until <page>.html answers; returns its url maker and stop(). */
export async function startLab(page, port) {
  const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: CLIENT, shell: true, stdio: 'ignore' });
  const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }); else dev.kill(); };
  const url = (qs = '') => `http://localhost:${port}/${page}.html${qs ? '?' + qs : ''}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(url())).ok; } catch {} if (!up) await new Promise((r) => setTimeout(r, 500)); }
    if (!up) throw new Error(`${url()} didn't answer (is there a packages/client/${page}.html?)`);
  } catch (e) { stop(); throw e; }
  return { url, stop };
}
