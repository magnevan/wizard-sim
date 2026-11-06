import { defineConfig } from 'vite';

// base './' so the built dist/ works from any path (the artifact, itch.io, a file server).
export default defineConfig({
  base: './',
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
