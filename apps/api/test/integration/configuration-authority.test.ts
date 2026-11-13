import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { parseTenantManifest } from '../../src/domain/tenant-manifest.ts';
import { createDrizzleAuthorizationRepository } from '../../src/infrastructure/auth/authorization-repository.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import {
  exportConfigurationTenant,
  importConfigurationTenant,
  initializeWebConfiguration,
} from '../../src/infrastructure/persistence/drizzle/configuration-admin-store.ts';
import { assertConfigurationAuthority } from '../../src/infrastructure/persistence/drizzle/configuration-authority.ts';
import { assertSharedRuntimeRole } from '../../src/infrastructure/persistence/drizzle/runtime-role-check.ts';
import {
  adoptTenantManifest,
  applyTenantManifest,
} from '../../src/infrastructure/persistence/drizzle/tenant-config-store.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

it('does not read a manifest in bootstrap when database authority is active', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database', revision = revision + 1 WHERE id = 1",
    );
    const connectionString = urlFor('postgres');
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../../scripts/configuration-admin.ts',
            import.meta.url,
          ),
        ),
        'bootstrap',
        '--database-url-env',
        'CONFIGURATION_TEST_DATABASE_URL',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          CONFIGURATION_TEST_DATABASE_URL: connectionString,
          APP_MANIFEST_PATH: '/not-mounted/tenant-manifest.json',
        },
      },
    );
    expect(JSON.parse(stdout)).toEqual({
      applied: false,
      reason: 'database-authority',
    });
  });
}, 120_000);

it('applies the manifest through bootstrap only while manifest authority is active', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../../../scripts/configuration-admin.ts',
            import.meta.url,
          ),
        ),
        'bootstrap',
        '--file',
        fileURLToPath(
          new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        ),
        '--database-url-env',
        'CONFIGURATION_TEST_DATABASE_URL',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          CONFIGURATION_TEST_DATABASE_URL: urlFor('postgres'),
        },
      },
    );
    expect(JSON.parse(stdout)).toEqual({
      applied: true,
      tenantCount: 2,
      eventCount: 2,
    });
    const authority = await owner.query<{ mode: string }>(
      'SELECT mode FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows[0]?.mode).toBe('manifest');
  });
}, 120_000);

it('keeps authority manifest by default and exposes read-only mode to runtime', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const roleName = `configuration_runtime_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await owner.query(
      `CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
    const runtimeURL = new URL(urlFor('postgres'));
    runtimeURL.username = roleName;
    runtimeURL.password = password;
    const runtime = createDrizzleDatabase(runtimeURL.toString(), 1);

    try {
      const initial = await owner.query<{
        id: number;
        mode: string;
        revision: string;
      }>('SELECT id, mode, revision::text FROM configuration_authority');
      expect(initial.rows).toEqual([
        { id: 1, mode: 'manifest', revision: '1' },
      ]);
      await expect(
        assertConfigurationAuthority(runtime.db, 'manifest'),
      ).resolves.toBeUndefined();
      await expect(
        assertConfigurationAuthority(runtime.db, 'database'),
      ).rejects.toThrow('does not match database configuration authority');
      await expect(
        assertSharedRuntimeRole(runtime.db),
      ).resolves.toBeUndefined();
      await expect(
        runtime.db.execute(
          sql`UPDATE configuration_authority SET mode = 'database'`,
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });

      await owner.query(
        "UPDATE configuration_authority SET mode = 'database', revision = revision + 1, adopted_at = CURRENT_TIMESTAMP WHERE id = 1",
      );
      await expect(
        assertConfigurationAuthority(runtime.db, 'database'),
      ).resolves.toBeUndefined();
      await expect(
        assertConfigurationAuthority(runtime.db, 'manifest'),
      ).rejects.toThrow('does not match database configuration authority');
    } finally {
      await runtime.close();
    }
  });
}, 120_000);

it('refuses tenant-manifest apply after database authority is enabled', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');

    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    const tenantCountBefore = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants',
    );
    await expect(
      applyTenantManifest(urlFor('postgres'), parsed.value, undefined),
    ).rejects.toThrow('requires manifest configuration authority');

    const tenantCountAfter = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants',
    );
    expect(tenantCountAfter.rows[0]?.count).toBe(
      tenantCountBefore.rows[0]?.count,
    );
  });
}, 120_000);

it('lists active member tenants even when they have no events', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const slug = `empty-${randomBytes(6).toString('hex')}`;
    const issuer = 'https://id.example.invalid';
    const subject = `subject-${randomBytes(6).toString('hex')}`;
    const roleName = `tenant_list_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await owner.query(
      'INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)',
      [tenantId, slug, 'Eventless tenant'],
    );
    await owner.query(
      'INSERT INTO app_users (id, issuer, subject) VALUES ($1, $2, $3)',
      [userId, issuer, subject],
    );
    await owner.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')",
      [tenantId, userId],
    );
    await owner.query(
      `CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
    const runtimeURL = new URL(urlFor('postgres'));
    runtimeURL.username = roleName;
    runtimeURL.password = password;
    const runtime = createDrizzleDatabase(runtimeURL.toString(), 1);

    try {
      await expect(
        assertSharedRuntimeRole(runtime.db),
      ).resolves.toBeUndefined();
      const tenants = await createDrizzleAuthorizationRepository(
        runtime.db,
      ).listMemberTenants({
        userId,
        issuer,
        subject,
        sessionId: randomUUID(),
      });
      expect(tenants).toContainEqual({
        tenantId,
        tenantSlug: slug,
        tenantName: 'Eventless tenant',
        role: 'admin',
      });
      const eventCount = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM events WHERE tenant_id = $1',
        [tenantId],
      );
      expect(eventCount.rows[0]?.count).toBe('0');
    } finally {
      await runtime.close();
    }
  });
}, 120_000);

it('creates a designated admin and switches authority in one transaction', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const input = {
      tenantSlug: `bootstrap-${randomBytes(6).toString('hex')}`,
      displayName: 'Bootstrap tenant',
      issuer: 'https://github.com',
      subject: BigInt(`0x${randomBytes(6).toString('hex')}`).toString(),
    };
    const first = await initializeWebConfiguration(urlFor('postgres'), input);
    const retry = await initializeWebConfiguration(urlFor('postgres'), input);
    expect(first.initialized).toBe(true);
    expect(retry).toEqual({ tenantId: first.tenantId, initialized: false });

    const tenant = await owner.query<{
      id: string;
      slug: string;
      display_name: string;
    }>('SELECT id::text, slug, display_name FROM tenants WHERE id = $1', [
      first.tenantId,
    ]);
    expect(tenant.rows).toEqual([
      {
        id: first.tenantId,
        slug: input.tenantSlug,
        display_name: input.displayName,
      },
    ]);
    const membership = await owner.query<{
      role: string;
      disabled_at: Date | null;
    }>(
      `SELECT membership.role, membership.disabled_at
       FROM tenant_memberships AS membership
       JOIN app_users AS app_user ON app_user.id = membership.user_id
       WHERE membership.tenant_id = $1 AND app_user.issuer = $2 AND app_user.subject = $3`,
      [first.tenantId, input.issuer, input.subject],
    );
    expect(membership.rows).toEqual([{ role: 'admin', disabled_at: null }]);
    const authority = await owner.query<{
      mode: string;
      revision: string;
    }>('SELECT mode, revision::text FROM configuration_authority WHERE id = 1');
    expect(authority.rows).toEqual([{ mode: 'database', revision: '2' }]);
    const auditCount = await owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM configuration_audit WHERE action = 'initialize-web' AND tenant_id = $1",
      [first.tenantId],
    );
    expect(auditCount.rows[0]?.count).toBe('1');
    const eventCount = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM events WHERE tenant_id = $1',
      [first.tenantId],
    );
    expect(eventCount.rows[0]?.count).toBe('0');
  });
}, 120_000);

it('rolls back bootstrap tenant and identity when authority handoff fails', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const input = {
      tenantSlug: `rollback-${randomBytes(6).toString('hex')}`,
      displayName: 'Atomic bootstrap test',
      issuer: 'https://github.com',
      subject: BigInt(`0x${randomBytes(6).toString('hex')}`).toString(),
    };
    await owner.query(`
      CREATE FUNCTION reject_authority_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test authority handoff rejected'; END $$
    `);
    await owner.query(`
      CREATE TRIGGER reject_authority_handoff BEFORE UPDATE OF mode ON configuration_authority
      FOR EACH ROW EXECUTE FUNCTION reject_authority_handoff()
    `);
    await expect(
      initializeWebConfiguration(urlFor('postgres'), input),
    ).rejects.toThrow('test authority handoff rejected');
    const state = await owner.query<{
      mode: string;
      revision: string;
      tenant_count: string;
      user_count: string;
      audit_count: string;
    }>(
      `SELECT authority.mode, authority.revision::text,
       (SELECT count(*) FROM tenants WHERE slug = $1)::text AS tenant_count,
       (SELECT count(*) FROM app_users WHERE issuer = $2 AND subject = $3)::text AS user_count,
       (SELECT count(*) FROM configuration_audit WHERE action = 'initialize-web')::text AS audit_count
       FROM configuration_authority AS authority WHERE authority.id = 1`,
      [input.tenantSlug, input.issuer, input.subject],
    );
    expect(state.rows).toEqual([
      {
        mode: 'manifest',
        revision: '1',
        tenant_count: '0',
        user_count: '0',
        audit_count: '0',
      },
    ]);
  });
}, 120_000);

it('exports configuration and imports every old member disabled except the designated admin', async () => {
  let exported:
    | Awaited<ReturnType<typeof exportConfigurationTenant>>
    | undefined;
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    const sampleTenant = parsed.value.tenants.find(
      ({ slug }) => slug === 'sample-tenant',
    );
    if (sampleTenant === undefined)
      throw new Error('The sample tenant is missing.');
    sampleTenant.members.push({
      issuer: 'https://id.example.invalid',
      subject: `former-${randomBytes(6).toString('hex')}`,
      role: 'staff',
      disabled: false,
    });
    await applyTenantManifest(urlFor('postgres'), parsed.value, undefined);
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    exported = await exportConfigurationTenant(
      urlFor('postgres'),
      'sample-tenant',
    );
  });

  const snapshot = exported;
  if (snapshot === undefined)
    throw new Error('Configuration export was not produced.');
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const preexistingUserId = randomUUID();
    const preexistingSubject = `existing-${randomBytes(6).toString('hex')}`;
    await owner.query(
      'INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL)',
      [preexistingUserId, 'https://id.example.invalid', preexistingSubject],
    );
    await owner.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at) VALUES ($1, $2, 'admin', NULL)",
      ['00000000-0000-4000-8000-000000000001', preexistingUserId],
    );
    await expect(
      importConfigurationTenant(
        urlFor('postgres'),
        snapshot,
        { issuer: 'https://id.example.invalid', subject: 'fixture-staff' },
        true,
      ),
    ).rejects.toThrow('requires no active membership');
    const unchangedWithMember = await owner.query<{
      tenant_count: string;
      mode: string;
      audit_count: string;
    }>(
      `SELECT (SELECT count(*) FROM tenants WHERE id = $1)::text AS tenant_count,
       authority.mode,
       (SELECT count(*) FROM configuration_audit WHERE action = 'import-export')::text AS audit_count
       FROM configuration_authority AS authority WHERE authority.id = 1`,
      [snapshot.tenant.id],
    );
    expect(unchangedWithMember.rows).toEqual([
      { tenant_count: '0', mode: 'manifest', audit_count: '0' },
    ]);
    await owner.query('DELETE FROM tenant_memberships WHERE user_id = $1', [
      preexistingUserId,
    ]);
    await owner.query('DELETE FROM app_users WHERE id = $1', [
      preexistingUserId,
    ]);
    const preview = await importConfigurationTenant(
      urlFor('postgres'),
      snapshot,
      { issuer: 'https://id.example.invalid', subject: 'fixture-staff' },
      true,
    );
    expect(preview).toEqual({
      tenantId: snapshot.tenant.id,
      imported: false,
      membersDisabled: 1,
      sourceActiveMembers: 2,
      sourceDisabledMembers: 0,
      designatedAdminWasMember: true,
      eventCount: 1,
    });
    const unchanged = await owner.query<{
      tenant_count: string;
      mode: string;
      audit_count: string;
    }>(
      `SELECT (SELECT count(*) FROM tenants WHERE id = $1)::text AS tenant_count,
       authority.mode,
       (SELECT count(*) FROM configuration_audit WHERE action = 'import-export')::text AS audit_count
       FROM configuration_authority AS authority WHERE authority.id = 1`,
      [snapshot.tenant.id],
    );
    expect(unchanged.rows).toEqual([
      { tenant_count: '0', mode: 'manifest', audit_count: '0' },
    ]);
    const result = await importConfigurationTenant(
      urlFor('postgres'),
      snapshot,
      { issuer: 'https://id.example.invalid', subject: 'fixture-staff' },
    );
    expect(result).toEqual({
      tenantId: snapshot.tenant.id,
      imported: true,
      membersDisabled: 1,
      sourceActiveMembers: 2,
      sourceDisabledMembers: 0,
      designatedAdminWasMember: true,
      eventCount: 1,
    });
    const memberships = await owner.query<{
      subject: string;
      role: string;
      disabled_at: Date | null;
    }>(
      `SELECT app_user.subject, membership.role, membership.disabled_at
       FROM tenant_memberships AS membership
       JOIN app_users AS app_user ON app_user.id = membership.user_id
       WHERE membership.tenant_id = $1 ORDER BY app_user.subject`,
      [snapshot.tenant.id],
    );
    expect(memberships.rows).toHaveLength(2);
    expect(
      memberships.rows.filter(({ disabled_at }) => disabled_at === null),
    ).toEqual([{ subject: 'fixture-staff', role: 'admin', disabled_at: null }]);
    expect(
      memberships.rows.filter(({ disabled_at }) => disabled_at !== null),
    ).toHaveLength(1);
    const preserved = await owner.query<{ count: string }>(
      `SELECT (SELECT count(*) FROM tenants)::text AS count
       WHERE EXISTS (SELECT 1 FROM tenants WHERE id = $1)
         AND EXISTS (SELECT 1 FROM events WHERE tenant_id = $1)
         AND EXISTS (SELECT 1 FROM event_equipment WHERE tenant_id = $1)
         AND EXISTS (SELECT 1 FROM printers WHERE tenant_id = $1)`,
      [snapshot.tenant.id],
    );
    expect(preserved.rows[0]?.count).toBe('2');
    const authority = await owner.query<{ mode: string }>(
      'SELECT mode FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows[0]?.mode).toBe('database');
    const audit = await owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM configuration_audit WHERE action = 'import-export' AND tenant_id = $1",
      [snapshot.tenant.id],
    );
    expect(audit.rows[0]?.count).toBe('1');
  });
}, 180_000);

it('serializes a waiting manifest apply behind adopt and rejects it after handoff', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    await owner.query(`
      CREATE FUNCTION pause_authority_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$
    `);
    await owner.query(`
      CREATE TRIGGER pause_authority_handoff BEFORE UPDATE OF mode ON configuration_authority
      FOR EACH ROW WHEN (OLD.mode = 'manifest' AND NEW.mode = 'database')
      EXECUTE FUNCTION pause_authority_handoff()
    `);
    const waitForActivity = async (
      applicationName: string,
      expectedWaitType: string,
      expectedWaitEvent: string | undefined,
    ) => {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const activity = await owner.query<{
          wait_event_type: string | null;
          wait_event: string | null;
        }>(
          "SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE application_name = $1 AND state = 'active'",
          [applicationName],
        );
        if (
          activity.rows.some(
            (row) =>
              row.wait_event_type === expectedWaitType &&
              (expectedWaitEvent === undefined ||
                row.wait_event === expectedWaitEvent),
          )
        )
          return;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
      throw new Error(
        `Timed out waiting for ${applicationName} to reach ${expectedWaitType}.`,
      );
    };
    const adoptURL = new URL(urlFor('postgres'));
    adoptURL.searchParams.set('application_name', 'configuration-adopt-test');
    const applyURL = new URL(urlFor('postgres'));
    applyURL.searchParams.set('application_name', 'configuration-apply-test');
    const adoption = adoptTenantManifest(
      adoptURL.toString(),
      parsed.value,
      undefined,
    );
    await waitForActivity('configuration-adopt-test', 'Timeout', 'PgSleep');
    const apply = applyTenantManifest(
      applyURL.toString(),
      parsed.value,
      undefined,
    );
    const applyRejection = expect(apply).rejects.toThrow(
      'requires manifest configuration authority',
    );
    await waitForActivity('configuration-apply-test', 'Lock', undefined);
    await adoption;
    await applyRejection;
    const authority = await owner.query<{ mode: string }>(
      'SELECT mode FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows[0]?.mode).toBe('database');
  });
}, 120_000);

it('adopts missing manifest rows without retiring or deleting existing scope', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    const before = await owner.query<{
      tenants: string;
      events: string;
      equipment: string;
    }>(
      `SELECT (SELECT count(*) FROM tenants)::text AS tenants,
              (SELECT count(*) FROM events)::text AS events,
              (SELECT count(*) FROM event_equipment)::text AS equipment`,
    );
    const preview = await adoptTenantManifest(
      urlFor('postgres'),
      parsed.value,
      undefined,
      true,
    );
    expect(preview).toMatchObject({
      tenantCount: parsed.value.tenants.length,
      eventCount: parsed.value.tenants.reduce(
        (count, tenant) => count + tenant.events.length,
        0,
      ),
      dryRun: true,
      tenantsCreated: 1,
      eventsCreated: 1,
      legacyEventsAdopted: 1,
      retainedTenants: 0,
      retainedEvents: 0,
      preservedTickets: 0,
    });
    const unchanged = await owner.query<{
      mode: string;
      revision: string;
      tenants: string;
    }>(
      `SELECT authority.mode, authority.revision::text,
       (SELECT count(*) FROM tenants)::text AS tenants
       FROM configuration_authority AS authority WHERE authority.id = 1`,
    );
    expect(unchanged.rows).toEqual([
      { mode: 'manifest', revision: '1', tenants: '1' },
    ]);
    await adoptTenantManifest(urlFor('postgres'), parsed.value, undefined);
    const after = await owner.query<{
      tenants: string;
      events: string;
      equipment: string;
    }>(
      `SELECT (SELECT count(*) FROM tenants)::text AS tenants,
              (SELECT count(*) FROM events)::text AS events,
              (SELECT count(*) FROM event_equipment)::text AS equipment`,
    );
    expect(after.rows[0]?.tenants).toBe('2');
    expect(Number(after.rows[0]?.events)).toBeGreaterThanOrEqual(
      Number(before.rows[0]?.events),
    );
    expect(Number(after.rows[0]?.equipment)).toBeGreaterThanOrEqual(
      Number(before.rows[0]?.equipment),
    );
    const authority = await owner.query<{ mode: string; revision: string }>(
      'SELECT mode, revision::text FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows).toEqual([{ mode: 'database', revision: '2' }]);
    const previousRows = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenant_memberships WHERE tenant_id = $1',
      ['00000000-0000-4000-8000-000000000001'],
    );
    expect(previousRows.rows[0]?.count).toBe('1');
    await expect(
      applyTenantManifest(urlFor('postgres'), parsed.value, undefined),
    ).rejects.toThrow('requires manifest configuration authority');
    const auditCount = await owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM configuration_audit WHERE action = 'adopt-web'",
    );
    expect(auditCount.rows[0]?.count).toBe('2');
  });
}, 120_000);

it('rolls back every adopt row when a later slug conflict is found', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    const [sample, defaultTenant] = parsed.value.tenants;
    if (sample === undefined || defaultTenant === undefined) {
      throw new Error('The tenant manifest fixture is incomplete.');
    }
    const conflictManifest = parseTenantManifest({
      schemaVersion: 1,
      tenants: [
        { ...sample, slug: `new-${randomBytes(6).toString('hex')}` },
        { ...defaultTenant, id: randomUUID() },
      ],
    });
    if (!conflictManifest.ok)
      throw new Error('The conflict manifest is invalid.');
    const newSlug = conflictManifest.value.tenants[0]?.slug;
    await expect(
      adoptTenantManifest(
        urlFor('postgres'),
        conflictManifest.value,
        undefined,
      ),
    ).rejects.toThrow('tenant identity conflict');
    const state = await owner.query<{
      mode: string;
      revision: string;
      tenant_count: string;
      audit_count: string;
    }>(
      `SELECT authority.mode, authority.revision::text,
       (SELECT count(*) FROM tenants WHERE slug = $1)::text AS tenant_count,
       (SELECT count(*) FROM configuration_audit WHERE action = 'adopt-web')::text AS audit_count
       FROM configuration_authority AS authority WHERE authority.id = 1`,
      [newSlug],
    );
    expect(state.rows).toEqual([
      { mode: 'manifest', revision: '1', tenant_count: '0', audit_count: '0' },
    ]);
  });
}, 120_000);
