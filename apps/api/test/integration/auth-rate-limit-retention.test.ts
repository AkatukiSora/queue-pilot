import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import type { SharedAuthConfig } from '../../src/config.ts';
import { createBetterAuthAdapter } from '../../src/infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { createManagementAuthPlugin } from '../../src/presentation/http/management-auth-plugin.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

it('prunes only rate-limit keys older than the maximum configured window', async () => {
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
    const runtime = createDrizzleDatabase(runtimeUrl.toString(), 1);

    try {
      const adapter = await createBetterAuthAdapter(
        runtime.db,
        {
          baseURL: 'https://queue-pilot.example.invalid',
          secret: randomBytes(32).toString('base64url'),
          clientIpTrustedProxies: [],
          provider: {
            kind: 'github',
            clientId: 'fixture-client-id',
            clientSecret: 'fixture-client-secret',
          },
        } satisfies SharedAuthConfig,
        [
          createManagementAuthPlugin({
            rateLimit: [{ pathMatcher: () => true, window: 120, max: 10 }],
          }),
        ],
      );
      expect(adapter.rateLimitWindowMs).toBe(120_000);

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const expiredKey = 'expired-once';
      const boundaryKey = 'exact-cutoff';
      const recentKey = 'recent';
      const futureKey = 'future';
      await owner.query(
        'INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES ($1, $2, 1, $5), ($3, $4, 1, $6), ($7, $8, 1, $9), ($10, $11, 1, $12)',
        [
          randomBytes(16).toString('hex'),
          expiredKey,
          randomBytes(16).toString('hex'),
          boundaryKey,
          now - 120_001,
          now - 120_000,
          randomBytes(16).toString('hex'),
          recentKey,
          now - 1,
          randomBytes(16).toString('hex'),
          futureKey,
          now + 1,
        ],
      );

      const runtimePrivileges = await runtime.db.execute(
        sql`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
      );
      expect(runtimePrivileges.rows[0]?.can_create).toBe(false);
      await adapter.pruneExpiredRateLimits();

      const remaining = await owner.query<{ key: string }>(
        'SELECT key FROM "rateLimit" ORDER BY key',
      );
      expect(remaining.rows.map(({ key }) => key)).toEqual([
        boundaryKey,
        futureKey,
        recentKey,
      ]);
      const index = await owner.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'rateLimit' AND indexname = 'rateLimit_lastRequest_idx'",
      );
      expect(index.rows).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      await runtime.close();
    }
  });
}, 120_000);
