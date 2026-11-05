import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: join(process.env.TMPDIR ?? tmpdir(), 'bunkasai-ticket-playwright'),
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    timezoneId: 'UTC',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm --filter web exec vite --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
