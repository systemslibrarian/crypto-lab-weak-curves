import { configDefaults, defineConfig } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-weak-curves/
export default defineConfig({
  base: '/crypto-lab-weak-curves/',
  test: {
    // Colocated unit tests only; the Playwright specs in e2e/ are not unit tests.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    testTimeout: 60_000,
  },
});
