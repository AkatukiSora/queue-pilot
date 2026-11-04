import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
import type { TokenGenerator } from './application/ports.ts';
import { loadConfig } from './config.ts';
import type { PublicToken } from './domain/ticket.ts';
import { createDrizzleAgentCredentialAdministration } from './infrastructure/auth/agent-credential-repository.ts';
import { createDrizzleAuthorizationRepository } from './infrastructure/auth/authorization-repository.ts';
import { createBetterAuthAdapter } from './infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from './infrastructure/persistence/drizzle/client.ts';
import { assertSharedRuntimeRole } from './infrastructure/persistence/drizzle/runtime-role-check.ts';
import { createUnitOfWork } from './infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from './infrastructure/request-context.ts';

const config = loadConfig();
const database = createDrizzleDatabase(config.databaseUrl);
if (config.sharedAuth !== undefined) {
  await assertSharedRuntimeRole(database.db);
}
const requestContext = createRequestContextStorage();
const authentication =
  config.sharedAuth === undefined
    ? undefined
    : await createBetterAuthAdapter(database.db, config.sharedAuth);
const authorization =
  authentication === undefined
    ? undefined
    : createDrizzleAuthorizationRepository(database.db);
const agentCredentials =
  authorization === undefined
    ? undefined
    : createDrizzleAgentCredentialAdministration(database.db, requestContext);
const app = createApp({
  config,
  requestContext,
  unitOfWork: createUnitOfWork(database.db, requestContext),
  clock: { now: () => new Date() },
  ...(authentication === undefined ? {} : { authentication }),
  ...(authorization === undefined ? {} : { authorization }),
  ...(agentCredentials === undefined ? {} : { agentCredentials }),
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
