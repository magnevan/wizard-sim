import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { parseKnobValues } from './src/art/fx-knobs-check';
import { mapEditor } from './map-editor/plugin';

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
 * The VFX knob panel's Save (lab/vfx-lab/knob-panel.ts), dev server only: POST /__fx/knobs with `{ id: number }`
 * writes src/art/fx-knobs.json (sorted, pretty); GET returns it. Anything but an object of finite numbers under
 * knob-shaped ids is refused whole, so a bad post can't half-write the file.
 */
function fxKnobs(): Plugin {
  const file = join(here, 'src/art/fx-knobs.json');
  return {
    name: 'fx-knobs', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fx/knobs', (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method !== 'POST') { res.end(existsSync(file) ? readFileSync(file, 'utf8') : '{}'); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          const fail = (errors: string[]): void => { res.statusCode = 400; res.end(JSON.stringify({ ok: false, errors })); };
          let raw: unknown;
          try { raw = JSON.parse(body); } catch { fail(['not JSON']); return; }
          const { values, errors } = parseKnobValues(raw);
          if (errors.length) { fail(errors); return; }
          const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
          writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
          res.end(JSON.stringify({ ok: true, count: Object.keys(sorted).length }));
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

/** The commit being built, short, for bug reports (report.ts); "+changes" when the tree has uncommitted edits. */
function gitCommit(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: here, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: here, encoding: 'utf8' }).trim() !== '';
    return dirty ? `${sha}+changes` : sha;
  } catch { return 'unknown'; }
}

/**
 * dist/build-info.json: the commit a build was made from, read by the servers tool (tools/servers/) to say how
 * far a preview server's build is behind. Worked out on every build, so a watch rebuild stamps its own commit.
 */
function buildInfo(): Plugin {
  return {
    name: 'build-info', apply: 'build',
    generateBundle() {
      let commit = 'unknown', dirty = false;
      try {
        commit = execSync('git rev-parse HEAD', { cwd: here, encoding: 'utf8' }).trim();
        dirty = execSync('git status --porcelain --untracked-files=no', { cwd: here, encoding: 'utf8' }).trim() !== '';
      } catch { /* not a checkout */ }
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: `${JSON.stringify({ commit, dirty, builtAt: Date.now() })}\n` });
    },
  };
}

// base './' so the built dist/ works from any path (the artifact, itch.io, a file server).
export default defineConfig({
  base: './',
  plugins: [soundLab(), fxKnobs(), mapEditor(join(here, '../../..')), buildInfo()],
  define: { __SIM_BUILD__: JSON.stringify(simBuild()), __BUILD_COMMIT__: JSON.stringify(gitCommit()) },
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
