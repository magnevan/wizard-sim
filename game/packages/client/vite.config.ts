import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * The game's lockstep fingerprint: a hash over the sim, the rules and the net code, as text with LF line ends (so a
 * Windows checkout and the Linux deploy agree). Two pages may play one match only if theirs match (net/netplay.ts):
 * any change to how the world steps makes builds drift apart at the first input, which looks like a dropped link.
 */
function simBuild(): string {
  const h = createHash('sha1');
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name), r = `${rel}/${name}`;
      if (name === 'node_modules' || name === 'test') continue;
      if (!/\.[a-z]+$/.test(name)) { walk(full, r); continue; }
      if (!/\.(ts|js|json)$/.test(name)) continue;
      h.update(r); h.update(readFileSync(full, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  for (const pkg of ['sim', 'rules', 'net']) walk(join(here, '..', pkg, 'src'), pkg);
  return h.digest('hex').slice(0, 8);
}

// base './' so the built dist/ works from any path (the artifact, itch.io, a file server).
export default defineConfig({
  base: './',
  plugins: [soundLab()],
  define: { __SIM_BUILD__: JSON.stringify(simBuild()) },
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
