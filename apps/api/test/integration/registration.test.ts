import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { expect, it } from 'vitest';
import type { DrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

type RegistrationIdentity = { issuer: string; subject: string };

it('creates tenant, creator admin, ledger, and audit as one database operation', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    const tenantsBefore = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants',
    );
    const importedBefore = await owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM tenant_creation_records WHERE origin = 'imported' AND creator_user_id IS NULL",
    );
    expect(importedBefore.rows[0]?.count).toBe(tenantsBefore.rows[0]?.count);

    await withRuntime(owner, urlFor, async (database) => {
      const identity = {
        issuer: 'https://github.com',
        subject: '1234567',
      };
      const tenantId = await createTenant(
        database,
        identity,
        'atomic-workspace',
        'Atomic Workspace',
        100,
        null,
      );
      const records = await owner.query<{
        slug: string;
        display_name: string;
        revision: string;
        role: string;
        issuer: string;
        subject: string;
        origin: string;
        action: string;
      }>(
        `SELECT tenant.slug, tenant.display_name, tenant.revision::text,
                membership.role, app_user.issuer, app_user.subject,
                ledger.origin, audit.action
         FROM tenants AS tenant
         JOIN tenant_memberships AS membership ON membership.tenant_id = tenant.id
         JOIN app_users AS app_user ON app_user.id = membership.user_id
         JOIN tenant_creation_records AS ledger ON ledger.tenant_id = tenant.id
         JOIN configuration_audit AS audit ON audit.tenant_id = tenant.id
         WHERE tenant.id = $1`,
        [tenantId],
      );
      expect(records.rows).toEqual([
        {
          slug: 'atomic-workspace',
          display_name: 'Atomic Workspace',
          revision: '1',
          role: 'admin',
          issuer: identity.issuer,
          subject: identity.subject,
          origin: 'self-service',
          action: 'self-service-create',
        },
      ]);

      const counts = await readCounts(database, identity);
      expect(counts).toEqual({ identity_state: 'active', per_user_count: '1' });
    });
  });
});

it('serializes per-user and system-wide quota checks across concurrent requests', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    await withRuntime(owner, urlFor, async (database) => {
      const perUserIdentity = {
        issuer: 'https://github.com',
        subject: '1234567',
      };
      const perUserAttempts = await Promise.allSettled(
        Array.from({ length: 5 }, (_, index) =>
          createTenant(
            database,
            perUserIdentity,
            `per-user-${index}`,
            'Per User',
            1,
            null,
          ),
        ),
      );
      expect(
        perUserAttempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const perUserFailures = perUserAttempts.filter(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === 'rejected',
      );
      expect(perUserFailures).toHaveLength(4);
      for (const failure of perUserFailures) {
        expect(failure.reason).toMatchObject({
          cause: { code: 'P0001', message: 'tenant_limit' },
        });
      }

      const tenantCount = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM tenants',
      );
      const systemLimit = Number(tenantCount.rows[0]?.count) + 1;
      const globalAttempts = await Promise.allSettled(
        Array.from({ length: 4 }, (_, index) =>
          createTenant(
            database,
            {
              issuer: 'https://github.com',
              subject: String(7654321 + index),
            },
            `global-${index}`,
            'Global',
            100,
            systemLimit,
          ),
        ),
      );
      expect(
        globalAttempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const globalFailures = globalAttempts.filter(
        (attempt): attempt is PromiseRejectedResult =>
          attempt.status === 'rejected',
      );
      expect(globalFailures).toHaveLength(3);
      for (const failure of globalFailures) {
        expect(failure.reason).toMatchObject({
          cause: { code: 'P0001', message: 'tenant_total_limit' },
        });
      }
    });
  });
});

it('rejects conflicts, reserved slugs, disabled identities, and direct ledger access', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    await withRuntime(owner, urlFor, async (database) => {
      const firstIdentity = {
        issuer: 'https://github.com',
        subject: '1234567',
      };
      await createTenant(
        database,
        firstIdentity,
        'occupied-slug',
        'First Tenant',
        100,
        null,
      );

      const otherIdentity = {
        issuer: 'https://github.com',
        subject: '7654321',
      };
      await expect(
        createTenant(
          database,
          otherIdentity,
          'occupied-slug',
          'Second Tenant',
          100,
          null,
        ),
      ).rejects.toMatchObject({ cause: { code: '23505' } });
      await expect(
        createTenant(
          database,
          otherIdentity,
          'admin',
          'Reserved Tenant',
          100,
          null,
        ),
      ).rejects.toMatchObject({
        cause: { code: 'P0001', message: 'reserved_slug' },
      });
      const failedIdentity = await owner.query(
        'SELECT id FROM app_users WHERE issuer = $1 AND subject = $2',
        [otherIdentity.issuer, otherIdentity.subject],
      );
      expect(failedIdentity.rows).toHaveLength(0);

      await owner.query(
        'UPDATE app_users SET disabled_at = now() WHERE issuer = $1 AND subject = $2',
        [firstIdentity.issuer, firstIdentity.subject],
      );
      await expect(
        createTenant(
          database,
          firstIdentity,
          'disabled-again',
          'Disabled Identity',
          100,
          null,
        ),
      ).rejects.toMatchObject({
        cause: { code: 'P0001', message: 'identity_disabled' },
      });
      const counts = await readCounts(database, firstIdentity);
      expect(counts.identity_state).toBe('disabled');
      expect(counts.per_user_count).toBe('1');

      const privileges = await owner.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_execute_create: boolean;
        can_execute_counts: boolean;
      }>(
        `SELECT
           has_table_privilege('queue_pilot_runtime', 'public.tenant_creation_records', 'SELECT') AS can_select,
           has_table_privilege('queue_pilot_runtime', 'public.tenant_creation_records', 'INSERT') AS can_insert,
           has_table_privilege('queue_pilot_runtime', 'public.tenant_creation_records', 'UPDATE') AS can_update,
           has_table_privilege('queue_pilot_runtime', 'public.tenant_creation_records', 'DELETE') AS can_delete,
           has_function_privilege('queue_pilot_runtime', 'public.create_self_service_tenant(text,text,bigint,bigint)', 'EXECUTE') AS can_execute_create,
           has_function_privilege('queue_pilot_runtime', 'public.get_self_service_registration_counts()', 'EXECUTE') AS can_execute_counts`,
      );
      expect(privileges.rows[0]).toEqual({
        can_select: false,
        can_insert: false,
        can_update: false,
        can_delete: false,
        can_execute_create: true,
        can_execute_counts: true,
      });
    });
  });
});

it('requires database configuration authority before creating an identity', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await withRuntime(owner, urlFor, async (database) => {
      const identity = {
        issuer: 'https://github.com',
        subject: '1234567',
      };
      await expect(
        createTenant(
          database,
          identity,
          'manifest-mode',
          'Manifest Mode',
          100,
          null,
        ),
      ).rejects.toMatchObject({
        cause: { code: 'P0001', message: 'database_authority_required' },
      });
      const appUsers = await owner.query(
        'SELECT id FROM app_users WHERE issuer = $1 AND subject = $2',
        [identity.issuer, identity.subject],
      );
      expect(appUsers.rows).toHaveLength(0);
    });
  });
});

async function withRuntime<T>(
  owner: Client,
  urlFor: (database: string) => string,
  operation: (database: DrizzleDatabase) => Promise<T>,
): Promise<T> {
  const role = `registration_runtime_${randomBytes(8).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  await owner.query(
    `CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
  );
  await owner.query(`GRANT queue_pilot_runtime TO ${role}`);
  const runtimeUrl = new URL(urlFor('postgres'));
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const runtime = createDrizzleDatabase(runtimeUrl.toString(), 8);
  try {
    return await operation(runtime.db);
  } finally {
    await runtime.close();
  }
}

async function createTenant(
  database: DrizzleDatabase,
  identity: RegistrationIdentity,
  slug: string,
  displayName: string,
  maxPerUser: number,
  maxTotal: number | null,
): Promise<string> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
      SELECT set_config('app.identity_issuer', ${identity.issuer}, true),
             set_config('app.identity_subject', ${identity.subject}, true)
    `);
    const result = await transaction.execute<{ id: string }>(sql`
      SELECT public.create_self_service_tenant(
        ${slug}, ${displayName}, ${maxPerUser}, ${maxTotal}
      )::text AS id
    `);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Self-service tenant function returned no identifier.');
    }
    return row.id;
  });
}

async function readCounts(
  database: DrizzleDatabase,
  identity: RegistrationIdentity,
): Promise<{ identity_state: string; per_user_count: string }> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
      SELECT set_config('app.identity_issuer', ${identity.issuer}, true),
             set_config('app.identity_subject', ${identity.subject}, true)
    `);
    const result = await transaction.execute<{
      identity_state: string;
      per_user_count: string;
    }>(sql`
      SELECT identity_state, per_user_count::text
      FROM public.get_self_service_registration_counts()
    `);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Registration count function returned no row.');
    }
    return row;
  });
}
