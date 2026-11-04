import { defineConfig } from 'vitest/config';

// One test run for every package; tests sit in packages/*/test.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // The long sim runs take ~2 s here and more than twice that on a CI runner.
    testTimeout: 30_000,
  },
});
