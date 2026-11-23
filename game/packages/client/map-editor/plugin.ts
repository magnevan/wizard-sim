/**
 * The map editor's scene server, as a dev-only Vite plugin (tools/map-editor/README.md has the API): /__map/* over
 * HTTP for the page and for Claude's CLI, and Vite's own WebSocket to push every change to the open editor pages
 * (map:update, map:pins) and to ask a page for a picture (map:view-request -> map:view). The scenes live in
 * tools/kit/scenes/; a change to a scene file from outside (an Edit, a git checkout) is picked up by a watcher.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Browser, Page } from 'puppeteer-core';
import type { Plugin, ViteDevServer, WebSocketClient } from 'vite';
import { CompileWorker } from './compile-worker';
import { dumpScene, type Scene } from './ops';
import { HttpError, imageType, SceneStore } from './store';

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function mapEditor(repoRoot: string): Plugin {
  const kitDir = join(repoRoot, 'tools/kit'), dir = join(kitDir, 'scenes');
  const worker = new CompileWorker(kitDir);
  const stores = new Map<string, Promise<SceneStore>>();
  const views = new Map<number, { ok: (png: Buffer) => void; fail: (e: Error) => void }>();
  let nextView = 1;
  let server: ViteDevServer;

  const broadcast = (event: string, data: unknown) => server.ws.send(event, data);
  const names = () => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.scene.json')).map((f) => f.replace('.scene.json', '')).sort() : []);
  function store(name: string): Promise<SceneStore> {
    if (!NAME.test(name) || !names().includes(name)) return Promise.reject(new HttpError(404, `no scene ${JSON.stringify(name)} in tools/kit/scenes (have: ${names().join(', ')})`));
    let s = stores.get(name);
    if (!s) {
      const st = new SceneStore(name, dir, worker, broadcast);
      s = st.load().then(() => st);
      s.catch(() => stores.delete(name));
      stores.set(name, s);
    }
    return s;
  }

  const body = (req: IncomingMessage) => new Promise<Record<string, unknown>>((ok, fail) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 40e6) req.destroy(); });   // a concept image comes as base64
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { fail(new HttpError(400, 'the body is not JSON')); } });
  });
  const json = (res: ServerResponse, status: number, v: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };

  // which scene each open editor page shows (map:hello), so a picture is asked of a page showing the right one
  const pages = new Map<WebSocketClient, string>();
  // with no such page open, a hidden one (headless Chrome, software rendering), closed after a few idle minutes
  let headless: { browser: Browser; page: Page; name: string; idle?: NodeJS.Timeout } | null = null;
  async function ensureHeadless(name: string) {
    if (!headless) {
      const { default: puppeteer } = await import('puppeteer-core');
      const { findChrome } = (await import(/* @vite-ignore */ pathToFileURL(join(repoRoot, 'game/scripts/serve.mjs')).href)) as { findChrome: () => string };
      const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 900 });
      headless = { browser, page, name: '' };
    }
    const h = headless;
    clearTimeout(h.idle);
    h.idle = setTimeout(() => { h.browser.close().catch(() => undefined); if (headless === h) headless = null; }, 180000);
    if (h.name !== name) {
      const base = (server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`).replace(/\/$/, '');
      await h.page.goto(`${base}/editor.html?scene=${name}&viewer=1`, { waitUntil: 'load', timeout: 120000 });
      await h.page.waitForFunction('window.__ready === true', { timeout: 120000 });
      h.name = name;
    }
  }
  async function view(name: string, opts: Record<string, string>): Promise<Buffer> {
    const live = () => [...pages].filter(([c, n]) => n === name && server.ws.clients.has(c)).map(([c]) => c);
    let targets = live(), hidden = false;
    if (!targets.length) { await ensureHeadless(name); targets = live(); hidden = true; }
    if (!targets.length) throw new HttpError(503, `no editor page shows ${name}, and the hidden one didn't start`);
    const id = nextView++;
    // the hidden page renders in software: a big scene (the courtyard, ~2,000 pieces) takes tens of seconds
    const wait = hidden ? 90000 : 30000;
    return new Promise((ok, fail) => {
      const t = setTimeout(() => { views.delete(id); fail(new HttpError(503, `no editor page answered in ${wait / 1000} s${hidden ? ' (the hidden page renders in software: open the editor on this scene in Chrome for fast pictures)' : ''}`)); }, wait);
      views.set(id, { ok: (b) => { clearTimeout(t); ok(b); }, fail: (e) => { clearTimeout(t); fail(e); } });
      targets[0].send('map:view-request', { id, name, opts });
    });
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x'), q = Object.fromEntries(url.searchParams), path = url.pathname.replace(/^\/+/, '');
    const post = req.method === 'POST', b = post ? await body(req) : {};
    const name = String(b.name ?? q.name ?? '');
    switch (`${req.method} ${path}`) {
      case 'GET scenes': {
        const list = [];
        for (const n of names()) {
          const s = await store(n).catch(() => null);
          list.push(s ? { name: n, rev: s.rev, ...s.summary() } : { name: n, error: 'failed to load' });
        }
        return json(res, 200, { scenes: list });
      }
      case 'GET scene': {
        const s = await store(name);
        return json(res, 200, { name, rev: s.rev, scene: s.scene, summary: s.summary(), ...(q.compiled ? { compiled: s.compiled } : {}) });
      }
      case 'POST new': {
        // a blank scene (w x h cells of one ground terrace), or a copy of another scene with `from`
        if (!NAME.test(name)) throw new HttpError(400, 'name: lower-case letters, digits and dashes');
        if (names().includes(name)) throw new HttpError(409, `${name} exists`);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${name}.scene.json`);
        if (b.from) { await store(String(b.from)); copyFileSync(join(dir, `${b.from}.scene.json`), file); }
        else {
          const w = Math.max(2, Math.min(200, Math.round(Number(b.w ?? 24)))), h = Math.max(2, Math.min(200, Math.round(Number(b.h ?? 16))));
          const sc: Scene = {
            schema: 1, name, G: 2, notes: String(b.notes ?? ''),
            terraces: [{ id: 't-ground', glyph: 'P', name: 'the ground', h: 0, mat: 'plaza', edge: 'parapet' }, { id: 't-below', glyph: 'C', name: 'below', h: -4, mat: 'rock', edge: 'open', walk: false }],
            corners: Array.from({ length: h + 1 }, (_, y) => Array.from({ length: w + 1 }, (_, x) => (x === 0 || y === 0 || x === w || y === h ? 'C' : 'P')).join('')),
            objects: [],
          };
          writeFileSync(file, dumpScene(sc));
        }
        const s = await store(name);
        return json(res, 200, { name, rev: s.rev, summary: s.summary() });
      }
      case 'GET findings': { const s = await store(name); return json(res, 200, { rev: s.rev, findings: s.compiled?.findings ?? [] }); }
      case 'GET query': {
        const s = await store(name), n = (k: string) => (q[k] != null ? Number(q[k]) : undefined);
        if (q.x0 == null && (q.x == null || q.y == null)) throw new HttpError(400, 'give x and y (and r), or x0, y0, x1, y1');
        return json(res, 200, s.query({ x: n('x'), y: n('y'), r: n('r'), x0: n('x0'), y0: n('y0'), x1: n('x1'), y1: n('y1') }));
      }
      case 'POST apply': {
        const s = await store(name);
        return json(res, 200, await s.apply({ ops: b.ops as never, author: b.author as string, label: b.label as string, base: b.base as number, dry: !!b.dry }));
      }
      case 'POST undo': { const s = await store(name); return json(res, 200, await s.undo(b.author as string | undefined)); }
      case 'POST redo': { const s = await store(name); return json(res, 200, await s.redo()); }
      case 'GET history': { const s = await store(name); return json(res, 200, { rev: s.rev, groups: s.historyList(Number(q.n ?? 20)) }); }
      case 'GET pins': { const s = await store(name); return json(res, 200, { rev: s.rev, pins: s.pinList(q.status ?? 'open') }); }
      case 'POST pins': { const s = await store(name); return json(res, 200, s.pinOp(b)); }
      case 'GET refs': { const s = await store(name); return json(res, 200, { refs: s.refs.map((r) => ({ ...r, path: join(s.refsDir, r.file) })) }); }
      case 'POST refs': { const s = await store(name); return json(res, 200, s.refOp(b)); }
      case 'GET ref-image': {
        const { ref, path: file } = (await store(name)).refPath(String(q.id));
        if (!existsSync(file)) throw new HttpError(404, `${ref.id}'s file is missing`);
        res.setHeader('content-type', imageType(ref.file) ?? 'application/octet-stream'); res.setHeader('cache-control', 'no-cache');
        res.end(readFileSync(file)); return;
      }
      case 'GET view': {
        await store(name);
        const png = await view(name, q);
        res.setHeader('content-type', 'image/png'); res.end(png); return;
      }
      default: throw new HttpError(404, `no route ${req.method} /__map/${path}`);
    }
  }

  return {
    name: 'map-editor', apply: 'serve',
    configureServer(s) {
      server = s;
      s.middlewares.use('/__map', (req, res) => {
        route(req, res).catch((e: Error) => {
          const he = e instanceof HttpError ? e : null;
          json(res, he?.status ?? 500, { error: e.message, ...(he?.extra ?? {}) });
        });
      });
      s.ws.on('map:view', (data: { id: number; png?: string; error?: string }) => {
        const v = views.get(data.id); if (!v) return;
        views.delete(data.id);
        if (data.png) v.ok(Buffer.from(data.png.replace(/^data:image\/png;base64,/, ''), 'base64')); else v.fail(new HttpError(500, data.error ?? 'the page failed to render'));
      });
      // a page asks for the current state when it opens or switches scene
      s.ws.on('map:hello', async (data: { name: string }, client: WebSocketClient) => {
        pages.set(client, data.name);
        try { const st = await store(data.name); broadcast('map:update', { name: st.name, rev: st.rev, scene: st.scene, compiled: st.compiled, change: null }); }
        catch (e) { broadcast('map:error', { name: data.name, error: (e as Error).message }); }
      });
      if (existsSync(dir)) {
        const timers = new Map<string, NodeJS.Timeout>();
        watch(dir, (_ev, file) => {
          if (!file || !String(file).endsWith('.scene.json')) return;
          const n = String(file).replace('.scene.json', '');
          clearTimeout(timers.get(n));
          timers.set(n, setTimeout(() => {
            const st = stores.get(n);
            if (!st) return;
            if (!existsSync(join(dir, String(file)))) { stores.delete(n); return; }   // deleted: a new file of that name starts afresh
            st.then((x) => x.external(readFileSync(join(dir, String(file)), 'utf8'))).catch(() => undefined);
          }, 150));
        });
      }
      s.httpServer?.on('close', () => { worker.stop(); headless?.browser.close().catch(() => undefined); headless = null; });
    },
  };
}
