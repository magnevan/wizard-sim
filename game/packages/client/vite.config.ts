import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The Sound Lab's two helpers (audio/lab.ts). They exist on the dev server only, so nothing here can reach
 * a build: /__ref/ serves the local, never-published .reference folder, and /__lab/notes keeps the lab's
 * notes in content/audio/lab-notes.json.
 */
function soundLab(): Plugin {
  const ref = join(here, '../../../.reference/audio'), notes = join(here, '../../content/audio/lab-notes.json');
  const read = () => (existsSync(notes) ? JSON.parse(readFileSync(notes, 'utf8')) : {});
  return {
    name: 'sound-lab', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ref/', (req, res) => {
        const file = join(ref, normalize(decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!file.startsWith(ref) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.end(readFileSync(file));
      });
      server.middlewares.use('/__lab/notes', (req, res) => {
        if (req.method !== 'POST') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(read())); return; }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const { id, ...note } = JSON.parse(body), all = read();
          all[id] = { ...note, at: new Date().toISOString() };
          writeFileSync(notes, `${JSON.stringify(all, null, 2)}\n`);
          res.end('ok');
        });
      });
    },
  };
}

// base './' so the built dist/ works from any path (the artifact, itch.io, a file server).
export default defineConfig({
  base: './',
  plugins: [soundLab()],
  server: { port: 5187 },
  preview: { port: 4187 },
  build: {
    // PixiJS goes in a chunk of its own: it changes far less often than the game, so a returning
    // player's browser keeps it cached across deploys, and its renderer pieces come in one file instead
    // of a waterfall of small lazy chunks (the perf pass, 2026-11-06). PeerJS loads only when a room is
    // made or joined (net/webrtc.ts). The two boot chunks are each about 510 kB (150-190 kB gzipped),
    // just over Vite's default 500 kB warning, hence the limit.
    chunkSizeWarningLimit: 600,
    // The registry's images stay files, fetched when a room needs them (art/assets.ts), however small.
    assetsInlineLimit: (file) => (file.replace(/\\/g, '/').includes('/content/assets/') ? false : undefined),
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'pixi', test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/ }] } } },
  },
});
