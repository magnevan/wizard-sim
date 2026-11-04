import { defineConfig } from 'vitest/config';

// One test run for every package; tests sit in packages/*/test.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
