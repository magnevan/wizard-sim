// usage: node scripts/bench.mjs [--gpu] [--shots <dir> [--shots-only]]
// Starts the dev server, opens the page in headless Chrome over the DevTools protocol and runs each benchmark case
// (live 3D on and off, at several counts), printing frames a second. --gpu uses the machine's GPU (ANGLE D3D11);
// without it Chrome draws with SwiftShader, a software renderer: a floor far below any real laptop. --shots also
// saves a screenshot of each move at a fixed time into <dir>.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const args = process.argv.slice(2), GPU = args.includes('--gpu');
const shotsAt = args.includes('--shots') ? resolve(args[args.indexOf('--shots') + 1]) : null;
const PORT = 5191, DEBUG = 9341, BASE = `http://localhost:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chromePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const kill = (c) => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); else c.kill(); };

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, shell: true, stdio: 'ignore' });
const browser = spawn(chromePath, [
  '--headless=new', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rt3d-chrome-'))}`, `--remote-debugging-port=${DEBUG}`,
  '--no-first-run', '--hide-scrollbars', '--window-size=1300,820',
  ...(GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  'about:blank',
], { stdio: 'ignore' });
const done = () => { kill(browser); kill(vite); };

try {
  for (let i = 0; ; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} if (i > 150) throw new Error('vite did not start'); await sleep(200); }
  let target;
  for (let i = 0; !target; i++) {
    try { target = (await (await fetch(`http://localhost:${DEBUG}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (i > 100) throw new Error('chrome did not start'); if (!target) await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const waiting = new Map();
  const seen = new Set();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    // the page's errors (a shader that won't compile shows up here), each once
    const err = m.method === 'Runtime.exceptionThrown' ? m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text
      : m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error' ? m.params.args.map((a) => a.value ?? a.description).join(' ') : null;
    if (err && !seen.has(err)) { seen.add(err); console.error('page:', String(err).slice(0, 1500)); }
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  const open = async (query) => {
    await cdp('Page.navigate', { url: BASE + '?' + query });
    for (let i = 0; i < 300; i++) { if (await evaluate('window.__ready === true')) return; await sleep(200); }
    throw new Error('page did not load: ' + query + ' ' + (await evaluate('document.body.innerText')));
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');

  if (shotsAt) {
    mkdirSync(shotsAt, { recursive: true });
    for (const [name, query] of [['walk', 'mode=walk&n=12&t=1.3'], ['attack', 'mode=attack&n=16&t=0.55'], ['turn', 'mode=turn&n=12&t=2.0'], ...(process.env.RT3D_DEBUG ? [['debug', 'mode=attack&n=16&t=0.55&debug=rank']] : [])]) {
      await open(query); await sleep(1500);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(shotsAt, name + '.png'), Buffer.from(shot.result.data, 'base64'));
      console.log('shot', join(shotsAt, name + '.png'));
    }
  }
  const rows = [];
  if (args.includes('--shots-only')) { ws.close(); process.exit(0); }
  for (const [n, live] of [[12, 1], [50, 1], [100, 1], [200, 1], [200, 0]]) {
    await open(`bench=1&mode=walk&n=${n}&live=${live}`);
    let r;
    for (let i = 0; i < 100 && !r; i++) { const t = await evaluate('document.title'); if (t?.startsWith('BENCH ')) r = JSON.parse(t.slice(6)); else await sleep(200); }
    if (!r) throw new Error('no bench result for n=' + n);
    rows.push(r);
    console.log(`${String(n).padStart(3)} goblins, live 3D ${live ? 'on ' : 'off'}: ${String(r.fps).padStart(5)} fps, ${r.ms} ms a frame (p95 ${r.p95}), ${r.submit} ms to submit, ${r.tris.toLocaleString()} triangles, ${r.calls} draw calls`);
  }
  console.log('GPU:', rows[0]?.gpu);
  ws.close();
} finally { done(); }
