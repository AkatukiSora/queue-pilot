import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
import type { TokenGenerator } from './application/ports.ts';
import { loadConfig } from './config.ts';
import type { PublicToken } from './domain/ticket.ts';
import { createDrizzleDatabase } from './infrastructure/persistence/drizzle/client.ts';
import { createUnitOfWork } from './infrastructure/persistence/drizzle/tx.ts';

const config = loadConfig();
const database = createDrizzleDatabase(config.databaseUrl);
const app = createApp({
  config,
  unitOfWork: createUnitOfWork(database.db),
  clock: { now: () => new Date() },
  tokens: {
    ticketId: randomUUID,
    printJobId: randomUUID,
    publicToken: () => randomBytes(16).toString('base64url') as PublicToken,
    leaseToken: randomUUID,
  } satisfies TokenGenerator,
  checkReadiness: async () => {
    try {
      await database.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  },
  staticRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});

serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port: 8787,
});
