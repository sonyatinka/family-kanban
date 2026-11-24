import { defineConfig } from '@playwright/test';

// The tests start their own API and Vite on separate ports, so they never touch a `pnpm dev`
// that is running on 3000 and 5173. Postgres and Redis are the same Docker services as in
// development: the tests create users with a special email domain and global-teardown.ts
// deletes them.
const API_PORT = 3001;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './tests',
  // Fail instead of waiting 30 s (the default) when something is wrong; a test takes 2-6 s
  timeout: 20_000,
  // A `test.only` left in the code by mistake fails the run on CI instead of skipping the rest
  forbidOnly: Boolean(process.env.CI),
  // On GitHub, the `github` reporter also marks failed tests in the run summary
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  globalTeardown: './global-teardown.ts',

  use: {
    // Tests call page.goto('/login'); the host comes from here
    baseURL: `http://localhost:${WEB_PORT}`,
    // Microsoft Edge that is installed with Windows, not a browser downloaded by
    // `playwright install`: Smart App Control on this machine may block unsigned binaries.
    // Use channel: 'chrome' if you prefer Google Chrome.
    // On CI (GitHub Actions) there is no Smart App Control: the workflow installs Playwright's
    // own Chromium, which is used when no channel is set.
    channel: process.env.CI ? undefined : 'msedge',
    // For a failed test, test-results/ gets a trace: `pnpm exec playwright show-trace <zip>`
    trace: 'retain-on-failure',
  },

  // Playwright starts both servers before the tests, waits until `url` answers, and stops
  // them afterwards. reuseExistingServer: false makes the run fail if a port is already
  // taken, instead of silently testing some other server.
  webServer: [
    {
      // `nest start` compiles the API and runs it once, without --watch.
      // It needs packages/shared/dist: the root script `pnpm test:e2e` builds shared first.
      command: 'pnpm --filter @family/api exec nest start',
      env: { PORT: String(API_PORT) },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // --strictPort: fail if the port is taken; Vite would pick the next free one otherwise
      command: `pnpm --filter @family/web exec vite --port ${WEB_PORT} --strictPort`,
      // Read by apps/web/vite.config.ts: send /api to the test API, not to port 3000
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
