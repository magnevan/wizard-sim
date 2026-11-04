import { defineConfig } from 'vite';

// base './' so the built dist/ works from any path (the artifact, itch.io, a file server).
export default defineConfig({
  base: './',
  server: { port: 5187 },
  preview: { port: 4187 },
});
