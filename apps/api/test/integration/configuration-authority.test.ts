import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { expect, it } from 'vitest';
import { parseTenantManifest } from '../../src/domain/tenant-manifest.ts';
import { createDrizzleAuthorizationRepository } from '../../src/infrastructure/auth/authorization-repository.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import {
  type ConfigurationExport,
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const properties = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${properties.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined)
    throw new Error('Test configuration contains an unserializable value.');
  return result;
}

function configurationRevision(config: unknown): string {
  return createHash('sha256').update(canonicalJson(config)).digest('hex');
}

async function snapshotDatabaseRows(
  owner: Client,
): Promise<Record<string, unknown>> {
  const tables = await owner.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const snapshot: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    const quotedName = tablename.replaceAll('"', '""');
    const result = await owner.query<{ rows: unknown[] }>(
      `SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY to_jsonb(record)::text), '[]'::jsonb) AS rows FROM public."${quotedName}" AS record`,
    );
    snapshot[tablename] = result.rows[0]?.rows ?? [];
  }
  return snapshot;
}

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

it('rejects invalid event and normalized-resource snapshots without database changes', async () => {
  let sourceSnapshot: ConfigurationExport | undefined;
  await withFreshMigratedPostgres(async ({ urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    await applyTenantManifest(urlFor('postgres'), parsed.value, undefined);
    sourceSnapshot = await exportConfigurationTenant(
      urlFor('postgres'),
      'sample-tenant',
    );
  });
  const snapshot = sourceSnapshot;
  if (snapshot === undefined)
    throw new Error('Configuration export was not produced.');

  const invalidSnapshots: ConfigurationExport[] = [];
  const invalidTimezone = structuredClone(snapshot);
  const timezoneEvent = invalidTimezone.events[0];
  if (timezoneEvent === undefined) throw new Error('The event is missing.');
  timezoneEvent.config.timeZone = 'Not/A_Timezone';
  timezoneEvent.configRevision = configurationRevision(timezoneEvent.config);
  invalidSnapshots.push(invalidTimezone);

  const missingEquipment = structuredClone(snapshot);
  const missingEquipmentEvent = missingEquipment.events[0];
  if (missingEquipmentEvent === undefined)
    throw new Error('The event is missing.');
  missingEquipmentEvent.equipment = [];
  invalidSnapshots.push(missingEquipment);

  const mismatchedEquipment = structuredClone(snapshot);
  const mismatchedEquipmentEvent = mismatchedEquipment.events[0];
  const mismatchedEquipmentRow = mismatchedEquipmentEvent?.equipment[0];
  if (mismatchedEquipmentRow === undefined)
    throw new Error('Normalized equipment is missing.');
  mismatchedEquipmentRow.label = 'Different equipment label';
  invalidSnapshots.push(mismatchedEquipment);

  const duplicateEquipment = structuredClone(snapshot);
  const duplicateEquipmentRows = duplicateEquipment.events[0]?.equipment;
  if (duplicateEquipmentRows?.[0] === undefined)
    throw new Error('Normalized equipment is missing.');
  duplicateEquipmentRows.push({ ...duplicateEquipmentRows[0] });
  invalidSnapshots.push(duplicateEquipment);

  const inactiveEquipment = structuredClone(snapshot);
  const inactiveEquipmentRow = inactiveEquipment.events[0]?.equipment[0];
  if (inactiveEquipmentRow === undefined)
    throw new Error('Normalized equipment is missing.');
  inactiveEquipmentRow.disabled = true;
  invalidSnapshots.push(inactiveEquipment);

  const missingPrinter = structuredClone(snapshot);
  const missingPrinterEvent = missingPrinter.events[0];
  if (missingPrinterEvent === undefined)
    throw new Error('The event is missing.');
  missingPrinterEvent.printers = [];
  invalidSnapshots.push(missingPrinter);

  const mismatchedPrinter = structuredClone(snapshot);
  const mismatchedPrinterRow = mismatchedPrinter.events[0]?.printers[0];
  if (mismatchedPrinterRow === undefined)
    throw new Error('Normalized printer is missing.');
  mismatchedPrinterRow.label = 'Different printer label';
  invalidSnapshots.push(mismatchedPrinter);

  const duplicatePrinter = structuredClone(snapshot);
  const duplicatePrinterRows = duplicatePrinter.events[0]?.printers;
  if (duplicatePrinterRows?.[0] === undefined)
    throw new Error('Normalized printer is missing.');
  duplicatePrinterRows.push({ ...duplicatePrinterRows[0] });
  invalidSnapshots.push(duplicatePrinter);

  const inactivePrinter = structuredClone(snapshot);
  const inactivePrinterRow = inactivePrinter.events[0]?.printers[0];
  if (inactivePrinterRow === undefined)
    throw new Error('Normalized printer is missing.');
  inactivePrinterRow.disabled = true;
  invalidSnapshots.push(inactivePrinter);

  const extraActiveEquipment = structuredClone(snapshot);
  const extraEquipmentRows = extraActiveEquipment.events[0]?.equipment;
  if (extraEquipmentRows === undefined)
    throw new Error('Normalized equipment is missing.');
  extraEquipmentRows.push({
    id: 'unreferenced-unit',
    label: 'Unreferenced unit',
    sortOrder: 99,
    disabled: false,
  });
  invalidSnapshots.push(extraActiveEquipment);

  const extraActivePrinter = structuredClone(snapshot);
  const extraPrinterRows = extraActivePrinter.events[0]?.printers;
  if (extraPrinterRows === undefined)
    throw new Error('Normalized printer is missing.');
  const existingPrinter = extraPrinterRows[0];
  if (existingPrinter === undefined)
    throw new Error('Normalized printer is missing.');
  extraPrinterRows.push({
    ...existingPrinter,
    id: randomUUID(),
    slug: 'unreferenced-printer',
    label: 'Unreferenced printer',
  });
  invalidSnapshots.push(extraActivePrinter);

  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const before = await snapshotDatabaseRows(owner);
    for (const invalidSnapshot of invalidSnapshots) {
      await expect(
        importConfigurationTenant(
          urlFor('postgres'),
          invalidSnapshot,
          { issuer: 'https://github.com', subject: '987654321' },
          true,
        ),
      ).rejects.toThrow('invalid configuration');
      await expect(
        importConfigurationTenant(urlFor('postgres'), invalidSnapshot, {
          issuer: 'https://github.com',
          subject: '987654321',
        }),
      ).rejects.toThrow('invalid configuration');
    }
    expect(await snapshotDatabaseRows(owner)).toEqual(before);
  });
}, 240_000);

it('round-trips disabled events with disabled extra normalized resources', async () => {
  let sourceSnapshot: ConfigurationExport | undefined;
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    await applyTenantManifest(urlFor('postgres'), parsed.value, undefined);
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const eventId = '10000000-0000-4000-8000-000000000002';
    await owner.query(
      "UPDATE tenant_memberships SET role = 'admin' WHERE tenant_id = $1",
      [tenantId],
    );
    await owner.query(
      'UPDATE events SET disabled_at = CURRENT_TIMESTAMP WHERE id = $1',
      [eventId],
    );
    await owner.query(
      'UPDATE event_equipment SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND event_id = $2',
      [tenantId, eventId],
    );
    await owner.query(
      'UPDATE printers SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND event_id = $2',
      [tenantId, eventId],
    );
    await owner.query(
      `INSERT INTO event_equipment (tenant_id, event_id, id, label, sort_order, disabled_at)
       VALUES ($1, $2, 'retired-unit', 'Retired unit', 99, CURRENT_TIMESTAMP)`,
      [tenantId, eventId],
    );
    await owner.query(
      `INSERT INTO printers (id, tenant_id, event_id, slug, label, kind, disabled_at)
       VALUES ($1, $2, $3, 'retired-printer', 'Retired printer', 'tm-t88v-usb', CURRENT_TIMESTAMP)`,
      [randomUUID(), tenantId, eventId],
    );
    sourceSnapshot = await exportConfigurationTenant(
      urlFor('postgres'),
      'sample-tenant',
    );
  });
  const snapshot = sourceSnapshot;
  if (snapshot === undefined)
    throw new Error('Configuration export was not produced.');

  await withFreshMigratedPostgres(async ({ urlFor }) => {
    await importConfigurationTenant(urlFor('postgres'), snapshot, {
      issuer: 'https://id.example.invalid',
      subject: 'fixture-staff',
    });
    await expect(
      exportConfigurationTenant(urlFor('postgres'), 'sample-tenant'),
    ).resolves.toEqual(snapshot);
  });
}, 240_000);

it('preserves ticket, QR locator, print-job, and ticket-change rows during adoption', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(
        new URL('../fixtures/default-tenant-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseTenantManifest(rawManifest);
    if (!parsed.ok) throw new Error('The tenant manifest fixture is invalid.');
    await applyTenantManifest(urlFor('postgres'), parsed.value, undefined);

    const tenantId = '10000000-0000-4000-8000-000000000001';
    const eventId = '10000000-0000-4000-8000-000000000002';
    const ticketId = randomUUID();
    const publicToken = randomBytes(16).toString('base64url');
    const idempotencyKey = randomUUID();
    const requestHash = randomBytes(32).toString('hex');
    const issuedAt = new Date('2026-05-01T00:00:00.000Z');
    const previousSlot = new Date('2026-06-01T16:00:00.000Z');
    const currentSlot = new Date('2026-06-01T16:20:00.000Z');
    await owner.query(
      `INSERT INTO tickets (
         id, tenant_id, event_id, counter_key, number, party_size, public_token,
         idempotency_key, request_hash, status, slot_starts_at, equipment,
         equipment_id, slot_changed_at, previous_slot_starts_at,
         previous_equipment, previous_equipment_id, slot_change_comment,
         issued_at, updated_at
       ) VALUES ($1, $2, $3, 'event', 1, 1, $4, $5, $6, 'waiting', $7,
         'Quest 3', 'quest-3', $8, $9, 'Quest 3S', 'quest-3s',
         'Reassigned at the desk', $10, $10)`,
      [
        ticketId,
        tenantId,
        eventId,
        publicToken,
        idempotencyKey,
        requestHash,
        currentSlot,
        issuedAt,
        previousSlot,
        issuedAt,
      ],
    );
    await owner.query(
      `INSERT INTO public_ticket_locator (token, tenant_id, event_id, ticket_id)
       VALUES ($1, $2, $3, $4)`,
      [publicToken, tenantId, eventId, ticketId],
    );
    await owner.query(
      `INSERT INTO ticket_counters (counter_key, tenant_id, event_id, last_number)
       VALUES ('event', $1, $2, 1)`,
      [tenantId, eventId],
    );
    const printer = await owner.query<{ id: string }>(
      "SELECT id::text FROM printers WHERE tenant_id = $1 AND event_id = $2 AND slug = 'sample-printer'",
      [tenantId, eventId],
    );
    const printerId = printer.rows[0]?.id;
    if (printerId === undefined)
      throw new Error('The sample printer is missing.');
    await owner.query(
      `INSERT INTO print_jobs (
         id, tenant_id, event_id, printer_id, ticket_id, status,
         created_at, updated_at, payload
       ) VALUES ($1, $2, $3, $4, $5, 'printed', $6, $6, $7::jsonb)`,
      [
        randomUUID(),
        tenantId,
        eventId,
        printerId,
        ticketId,
        issuedAt,
        JSON.stringify({
          ticketNumber: 1,
          partySize: 1,
          publicToken,
          issuedAt: issuedAt.toISOString(),
        }),
      ],
    );

    const before = await snapshotDatabaseRows(owner);
    const adoption = await adoptTenantManifest(
      urlFor('postgres'),
      parsed.value,
      undefined,
    );
    expect(adoption.preservedTickets).toBe(1);
    const after = await snapshotDatabaseRows(owner);
    for (const [table, rows] of Object.entries(before)) {
      if (
        table === 'configuration_authority' ||
        table === 'configuration_audit'
      )
        continue;
      expect(after[table]).toEqual(rows);
    }
    const authority = await owner.query<{ mode: string; revision: string }>(
      'SELECT mode, revision::text FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows).toEqual([{ mode: 'database', revision: '2' }]);
    const priorAuditRows = before.configuration_audit as unknown[];
    const afterAuditRows = after.configuration_audit as unknown[];
    for (const row of priorAuditRows)
      expect(afterAuditRows).toContainEqual(row);
  });
}, 180_000);

it('serializes a waiting adopt behind apply and adopts after the apply commits', async () => {
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
      CREATE FUNCTION pause_configuration_apply() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(2); RETURN NEW; END $$
    `);
    await owner.query(`
      CREATE TRIGGER pause_configuration_apply BEFORE INSERT ON events
      FOR EACH ROW WHEN (NEW.id = '10000000-0000-4000-8000-000000000002'::uuid)
      EXECUTE FUNCTION pause_configuration_apply()
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
        ) {
          return;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
      throw new Error(
        `Timed out waiting for ${applicationName} to reach ${expectedWaitType}.`,
      );
    };
    const applyURL = new URL(urlFor('postgres'));
    applyURL.searchParams.set(
      'application_name',
      'configuration-apply-first-test',
    );
    const adoptURL = new URL(urlFor('postgres'));
    adoptURL.searchParams.set(
      'application_name',
      'configuration-adopt-after-apply-test',
    );
    const apply = applyTenantManifest(
      applyURL.toString(),
      parsed.value,
      undefined,
    );
    await waitForActivity(
      'configuration-apply-first-test',
      'Timeout',
      'PgSleep',
    );
    const adoption = adoptTenantManifest(
      adoptURL.toString(),
      parsed.value,
      undefined,
    );
    const adoptionResult = expect(adoption).resolves.toMatchObject({
      dryRun: false,
      eventCount: 2,
    });
    await waitForActivity(
      'configuration-adopt-after-apply-test',
      'Lock',
      undefined,
    );
    await apply;
    await adoptionResult;
    const authority = await owner.query<{ mode: string }>(
      'SELECT mode FROM configuration_authority WHERE id = 1',
    );
    expect(authority.rows[0]?.mode).toBe('database');
  });
}, 120_000);

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
