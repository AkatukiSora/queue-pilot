import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const isNotfoundSuite = process.argv.some((arg) =>
  arg.endsWith('apps/web/e2e/notfound.e2e.ts'),
);
const webPort = isNotfoundSuite ? 5188 : 5173;

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
    baseURL: `http://127.0.0.1:${webPort}`,
    browserName: 'chromium',
    timezoneId: 'UTC',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: isNotfoundSuite
      ? `pnpm --filter web build && pnpm --filter web exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`
      : `pnpm --filter web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: `http://127.0.0.1:${webPort}`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
