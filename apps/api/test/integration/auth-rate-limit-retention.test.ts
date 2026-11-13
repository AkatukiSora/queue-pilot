import { randomBytes } from 'node:crypto';
import { createAuthEndpoint } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import type { SharedAuthConfig } from '../../src/config.ts';
import { createBetterAuthAdapter } from '../../src/infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { createManagementAuthPlugin } from '../../src/presentation/http/management-auth-plugin.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

const baseURL = 'https://queue-pilot.example.invalid';
const rateProbePath = '/queue-pilot/retention-rate-probe';

it('prunes only expired counters across adapters without resetting active HTTP quotas', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const roleName = `auth_rate_runtime_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await owner.query(
      `CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
    const runtimeUrl = new URL(urlFor('postgres'));
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const runtimeA = createDrizzleDatabase(runtimeUrl.toString(), 1);
    const runtimeB = createDrizzleDatabase(runtimeUrl.toString(), 1);

    try {
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      const authConfig = {
        baseURL,
        secret: randomBytes(32).toString('base64url'),
        clientIpTrustedProxies: [],
        provider: {
          kind: 'github',
          clientId: 'fixture-client-id',
          clientSecret: 'fixture-client-secret',
        },
      } satisfies SharedAuthConfig;
      const plugin = createManagementAuthPlugin({
        endpoints: {
          retentionProbe: createAuthEndpoint(
            rateProbePath,
            { method: 'POST' },
            async (context) => context.json({ ok: true }),
          ),
        },
        rateLimit: [
          {
            pathMatcher: (path) => path === rateProbePath,
            window: 120,
            max: 1,
          },
        ],
      });
      const adapterA = await createBetterAuthAdapter(runtimeA.db, authConfig, [
        plugin,
      ]);
      const adapterB = await createBetterAuthAdapter(runtimeB.db, authConfig, [
        plugin,
      ]);
      expect(adapterA.rateLimitWindowMs).toBe(120_000);

      const expiredKey = 'retention-cutoff-minus-one';
      const cutoffKey = 'retention-cutoff-equal';
      const newerKey = 'retention-cutoff-plus-one';
      const recentKey = 'retention-recent';
      const futureKey = 'retention-future';
      await owner.query(
        'INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES ($1, $2, 7, $7), ($3, $4, 7, $8), ($5, $6, 7, $9), ($10, $11, 7, $12), ($13, $14, 7, $15)',
        [
          randomBytes(16).toString('hex'),
          expiredKey,
          randomBytes(16).toString('hex'),
          cutoffKey,
          randomBytes(16).toString('hex'),
          newerKey,
          now - 120_001,
          now - 120_000,
          now - 119_999,
          randomBytes(16).toString('hex'),
          recentKey,
          now - 1,
          randomBytes(16).toString('hex'),
          futureKey,
          now + 1,
        ],
      );

      const runtimePrivileges = await runtimeA.db.execute(
        sql`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
      );
      expect(runtimePrivileges.rows[0]?.can_create).toBe(false);
      await Promise.all([
        adapterA.pruneExpiredRateLimits(),
        adapterB.pruneExpiredRateLimits(),
      ]);

      const retainedFixtures = await owner.query<{
        key: string;
        count: number;
        lastRequest: string;
      }>(
        'SELECT key, count, "lastRequest"::text AS "lastRequest" FROM "rateLimit" WHERE key LIKE $1 ORDER BY key',
        ['retention-%'],
      );
      expect(retainedFixtures.rows).toEqual([
        { key: cutoffKey, count: 7, lastRequest: String(now - 120_000) },
        { key: newerKey, count: 7, lastRequest: String(now - 119_999) },
        { key: futureKey, count: 7, lastRequest: String(now + 1) },
        { key: recentKey, count: 7, lastRequest: String(now - 1) },
      ]);
      const index = await owner.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'rateLimit' AND indexname = 'rateLimit_lastRequest_idx'",
      );
      expect(index.rows).toHaveLength(1);

      const send = (handle: (request: Request) => Promise<Response>) =>
        handle(
          new Request(`${baseURL}/api/auth${rateProbePath}`, {
            method: 'POST',
            headers: {
              Origin: baseURL,
              'Content-Type': 'application/json',
            },
            body: '{}',
          }),
        );
      expect((await send(adapterA.handle)).status).toBe(200);
      expect((await send(adapterB.handle)).status).toBe(429);
      const activeLimit = await owner.query<{
        key: string;
        count: number;
        lastRequest: string;
      }>(
        'SELECT key, count, "lastRequest"::text AS "lastRequest" FROM "rateLimit" WHERE "lastRequest" = $1',
        [now],
      );
      expect(activeLimit.rows).toHaveLength(1);
      const activeKey = activeLimit.rows[0]?.key;
      if (activeKey === undefined) {
        throw new Error('The active HTTP rate-limit counter was not stored.');
      }

      const resetTime = now + 120_001;
      clock.mockReturnValue(resetTime);
      expect((await send(adapterB.handle)).status).toBe(200);
      const resetLimit = await owner.query<{
        count: number;
        lastRequest: string;
      }>(
        'SELECT count, "lastRequest"::text AS "lastRequest" FROM "rateLimit" WHERE key = $1',
        [activeKey],
      );
      expect(resetLimit.rows).toEqual([
        { count: 1, lastRequest: String(resetTime) },
      ]);

      await Promise.all([
        adapterA.pruneExpiredRateLimits(),
        adapterB.pruneExpiredRateLimits(),
      ]);
      const activeAfterPrune = await owner.query<{ count: number }>(
        'SELECT count FROM "rateLimit" WHERE key = $1',
        [activeKey],
      );
      expect(activeAfterPrune.rows).toEqual([{ count: 1 }]);
      expect((await send(adapterA.handle)).status).toBe(429);
    } finally {
      vi.restoreAllMocks();
      await Promise.all([runtimeA.close(), runtimeB.close()]);
    }
  });
}, 120_000);
