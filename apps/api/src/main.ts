import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
import type { TokenGenerator } from './application/ports.ts';
import { loadConfig } from './config.ts';
import type { PublicToken } from './domain/ticket.ts';
import { createDrizzleAgentCredentialAdministration } from './infrastructure/auth/agent-credential-repository.ts';
import { startAuthRateLimitHousekeeping } from './infrastructure/auth/auth-rate-limit-housekeeping.ts';
import { createDrizzleAuthorizationRepository } from './infrastructure/auth/authorization-repository.ts';
import { createBetterAuthAdapter } from './infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from './infrastructure/persistence/drizzle/client.ts';
import { assertSharedRuntimeRole } from './infrastructure/persistence/drizzle/runtime-role-check.ts';
import { createUnitOfWork } from './infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from './infrastructure/request-context.ts';
import { createManagementAuthPlugin } from './presentation/http/management-auth-plugin.ts';

const config = loadConfig();
const database = createDrizzleDatabase(config.databaseUrl);
if (config.sharedAuth !== undefined) {
  await assertSharedRuntimeRole(database.db);
}
const requestContext = createRequestContextStorage();
const authentication =
  config.sharedAuth === undefined
    ? undefined
    : await createBetterAuthAdapter(database.db, config.sharedAuth, [
        createManagementAuthPlugin(),
      ]);
let rateLimitHousekeeping:
  | Awaited<ReturnType<typeof startAuthRateLimitHousekeeping>>
  | undefined;
if (authentication !== undefined) {
  try {
    rateLimitHousekeeping = await startAuthRateLimitHousekeeping({
      intervalMs: authentication.rateLimitWindowMs,
      pruneExpiredRateLimits: authentication.pruneExpiredRateLimits,
    });
  } catch (error) {
    await database.close();
    throw error;
  }
}
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
    if (rateLimitHousekeeping?.isHealthy() === false) return false;
    try {
      await database.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  },
  staticRoot: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});

const server = serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port: 8787,
});

let shutdownPromise: Promise<void> | undefined;
const shutdown = () => {
  shutdownPromise ??= (async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) reject(error);
        else resolve();
      });
    });
    await rateLimitHousekeeping?.stop();
    await database.close();
  })();
  return shutdownPromise;
};

process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
