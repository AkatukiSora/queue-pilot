import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
