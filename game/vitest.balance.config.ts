import { defineConfig } from 'vitest/config';

// The balance harness (npm run balance): slow, so it isn't part of npm test.
export default defineConfig({
  test: { include: ['tools/**/*.balance.ts'], environment: 'node', testTimeout: 600_000 },
});
