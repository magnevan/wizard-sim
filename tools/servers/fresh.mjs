#!/usr/bin/env node
// Usage: node tools/servers/fresh.mjs <worktree path> <port>
// A preview server whose build follows the source: `vite build --watch` and `vite preview` in one process, so the
// servers tool tracks and kills it as one. Each save rebuilds dist/, and the page shows it on the next refresh; nothing
// reloads by itself. Uses the worktree's own vite. Started by the servers tool's "preview, rebuilt on save" kind.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [path, portText] = process.argv.slice(2);
const port = Number(portText);
if (!path || !Number.isInteger(port)) { console.error('Usage: node tools/servers/fresh.mjs <worktree path> <port>'); process.exit(2); }
const root = join(path, 'game/packages/client'), entry = join(path, 'game/node_modules/vite/dist/node/index.js');
if (!existsSync(entry)) { console.error(`No vite in ${path}/game: run npm install there.`); process.exit(1); }
const { build, preview } = await import(pathToFileURL(entry).href);

const stamp = () => new Date().toLocaleTimeString('en-GB');
let server = null, started = 0;
const watcher = await build({ root, logLevel: 'warn', build: { watch: {} } });
watcher.on('event', async (e) => {
  if (e.code === 'START') { started = Date.now(); console.log(`${stamp()} building...`); }
  else if (e.code === 'ERROR') console.log(`${stamp()} build failed: ${e.error?.message ?? e.error}`);
  else if (e.code === 'END') {
    console.log(`${stamp()} built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (server) return;
    server = await preview({ root, logLevel: 'warn', preview: { port, strictPort: true } });
    console.log(`${stamp()} serving http://localhost:${port}/`);
  }
  e.result?.close?.();
});
