import { defineConfig } from 'vitest/config';

// Quick probes (npm run probe -- <file>): any *.probe.ts anywhere under game/ (shots/ is gitignored, so a throwaway
// probe can sit in shots/tmp/), run with the packages' imports resolved and console.log printed straight to the
// terminal. Wrap the body in it('probe', () => { ... }) or vitest reports "no test found". See tools/example.probe.ts.
export default defineConfig({
  test: {
    include: ['**/*.probe.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 600_000,
    disableConsoleIntercept: true,
    silent: false,
  },
});
