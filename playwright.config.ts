import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships. Two projects:
 *   - a11y   — e2e/a11y.spec.ts, the axe WCAG gate plus the arithmetic oracles.
 *   - claims — e2e/claims.spec.ts, what the page SAYS, with the §4.1d negative claim.
 *
 * Port 4236 was taken from the catalog's port registry (node tools/port-sync.js
 * reported it as the next free port on 2026-11-15); never the Vite default 4173.
 *
 * globalSetup clears the runtime observation sink and globalTeardown reads it
 * back: a mutation record whose killing test passed without executing the
 * shared marker helper on its marker fails the run. Deleting either line turns
 * that rule off, which is why the teardown treats a MISSING sink as a failure.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4236/crypto-lab-weak-curves/',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'a11y', testMatch: /a11y\.spec\.ts/, use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'claims', testMatch: /claims\.spec\.ts/, use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
  ],
  webServer: {
    // Build before serving: `vite preview` only serves whatever is already in
    // dist/, so without this a failing build leaves the previous good bundle in
    // place and the suite passes green against code that no longer compiles.
    command: 'npm run build && npm run preview -- --port 4236 --strictPort',
    url: 'http://localhost:4236/crypto-lab-weak-curves/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
