import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/api/src/infrastructure/persistence/drizzle/schema.ts',
  out: './db/migrations',
});
