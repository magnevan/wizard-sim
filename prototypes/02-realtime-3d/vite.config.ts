import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The raider's Meshy rig (tools/sprites-3d/output, gitignored) and its baked sheet (game/content) live outside this
// folder; let the dev server read the repo.
export default defineConfig({
  server: { port: 5191, strictPort: true, fs: { allow: [resolve(__dirname, '../..')] } },
  preview: { port: 5192, strictPort: true },
  assetsInclude: ['**/*.glb'],
});
