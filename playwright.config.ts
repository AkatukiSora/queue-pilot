import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const isNotfoundSuite = process.argv.some((arg) =>
  arg.endsWith('apps/web/e2e/notfound.e2e.ts'),
);
const isFullSuite = !process.argv.some((arg) => arg.endsWith('.e2e.ts'));
const webPort = isNotfoundSuite ? 5188 : 5173;
const notfoundPreviewServer = {
  command:
    'pnpm --filter web build && pnpm --filter web exec vite preview --host 127.0.0.1 --port 5188 --strictPort',
  url: 'http://127.0.0.1:5188',
  timeout: 60_000,
  reuseExistingServer: false,
};
const webServers = isNotfoundSuite
  ? [notfoundPreviewServer]
  : [
      {
        command:
          'pnpm --filter web exec vite --host 127.0.0.1 --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        timeout: 60_000,
        reuseExistingServer: false,
      },
      ...(isFullSuite ? [notfoundPreviewServer] : []),
    ];

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
  webServer: webServers,
});
