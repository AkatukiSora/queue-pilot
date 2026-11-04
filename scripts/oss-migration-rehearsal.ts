import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type EmbeddedPostgres from 'embedded-postgres';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

type RehearsalContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

type TicketSnapshot = {
  id: string;
  counter_key: string;
  number: number;
  party_size: number;
  public_token: string;
  idempotency_key: string;
  request_hash: string;
  status: string;
  cancel_reason: string | null;
  issued_at: string;
  updated_at: string;
  slot_starts_at: string | null;
  equipment: string | null;
  slot_changed_at: string | null;
  previous_slot_starts_at: string | null;
  previous_equipment: string | null;
  slot_change_comment: string | null;
  slot_released_at: string | null;
};

const migrationNames = [
  '20261102130319_init.sql',
  '20261103024725_slot_reservations.sql',
  '20261103143146_admin_slot_operations.sql',
  '20261104062623_tenant_event_expand.sql',
  '20261104063810_default_scope_gate.sql',
  '20261104101646_scoped_security_auth_print.sql',
  '20261104103828_better_auth_schema.sql',
];
const fixturePath = fileURLToPath(
  new URL(
    '../apps/api/test/fixtures/default-tenant-manifest.json',
    import.meta.url,
  ),
);
const tenantConfigScript = fileURLToPath(
  new URL('./tenant-config.ts', import.meta.url),
);

await withTemporaryPostgres(
  async ({ postgres, urlFor, temporaryDirectory }: RehearsalContext) => {
    const database = postgres.getPgClient('postgres', '127.0.0.1');
    await database.connect();
    try {
      for (const migrationName of migrationNames.slice(0, 3)) {
        const migration = await readFile(
          new URL(`../db/migrations/${migrationName}`, import.meta.url),
          'utf8',
        );
        await database.query(migration);
      }

      const legacyTicketId = randomUUID();
      const releasedTicketId = randomUUID();
      const issuedAt = new Date('2026-11-03T06:00:00.000Z');
      const legacyToken = randomBytes(16).toString('base64url');
      const releasedToken = randomBytes(16).toString('base64url');
      const legacyHash = 'a'.repeat(64);
      const releasedHash = 'b'.repeat(64);
      const slotStartsAt = new Date('2026-11-03T01:00:00.000Z');
      const slotChangedAt = new Date('2026-11-03T01:10:00.000Z');
      const slotReleasedAt = new Date('2026-11-03T01:20:00.000Z');
      await database.query(
        'INSERT INTO ticket_counters (counter_key, last_number) VALUES ($1, 2)',
        ['2026-11-03'],
      );
      await database.query(
        `INSERT INTO tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at
         ) VALUES ($1, '2026-11-03', 1, 2, $2, $3, $4, 'called', NULL, $5, $5)`,
        [
          legacyTicketId,
          legacyToken,
          'tenant-event-rehearsal-legacy-ticket',
          legacyHash,
          issuedAt,
        ],
      );
      await database.query(
        `INSERT INTO tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at,
           slot_starts_at, equipment, slot_changed_at, previous_slot_starts_at,
           previous_equipment, slot_change_comment, slot_released_at
         ) VALUES (
           $1, '2026-11-03', 2, 1, $2, $3, $4, 'cancelled', 'staff', $5, $6,
           $7, 'Quest 3', $8, $9, 'Quest 3S', 'moved by operator', $10
         )`,
        [
          releasedTicketId,
          releasedToken,
          'tenant-event-rehearsal-released-ticket',
          releasedHash,
          issuedAt,
          slotReleasedAt,
          slotStartsAt,
          slotChangedAt,
          new Date('2026-11-03T01:30:00.000Z'),
          slotReleasedAt,
        ],
      );
      const legacyPayload = {
        ticketNumber: 1,
        partySize: 2,
        publicToken: legacyToken,
        issuedAt: issuedAt.toISOString(),
      };
      const releasedPayload = {
        ticketNumber: 2,
        partySize: 1,
        publicToken: releasedToken,
        issuedAt: issuedAt.toISOString(),
      };
      await database.query(
        `INSERT INTO print_jobs (
           id, ticket_id, status, created_at, updated_at, attempt, payload
         ) VALUES ($1, $2, 'queued', $3, $3, 0, $4::jsonb),
                  ($5, $6, 'queued', $3, $3, 0, $7::jsonb)`,
        [
          randomUUID(),
          legacyTicketId,
          issuedAt,
          JSON.stringify(legacyPayload),
          randomUUID(),
          releasedTicketId,
          JSON.stringify(releasedPayload),
        ],
      );

      const beforeTickets = await readTicketSnapshots(database);
      const beforeJobs = await database.query<{ payload: unknown }>(
        'SELECT payload FROM print_jobs ORDER BY ticket_id',
      );
      const beforeCounter = await database.query<{
        counter_key: string;
        last_number: number;
      }>(
        'SELECT counter_key, last_number FROM ticket_counters ORDER BY counter_key',
      );

      for (const migrationName of migrationNames.slice(3)) {
        const migration = await readFile(
          new URL(`../db/migrations/${migrationName}`, import.meta.url),
          'utf8',
        );
        await database.query(migration);
      }

      assertEqual(
        await readTicketSnapshots(database),
        beforeTickets,
        'Legacy ticket, slot history, and release fields changed during expand migration',
      );
      assertEqual(
        (
          await database.query(
            'SELECT payload FROM print_jobs ORDER BY ticket_id',
          )
        ).rows,
        beforeJobs.rows,
        'Legacy print-job JSON changed during expand migration',
      );
      assertEqual(
        (
          await database.query(
            'SELECT counter_key, last_number FROM ticket_counters ORDER BY counter_key',
          )
        ).rows,
        beforeCounter.rows,
        'Legacy counter values changed during expand migration',
      );

      const locatorRows = await database.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public_ticket_locator AS locator
         JOIN tickets AS ticket ON ticket.id = locator.ticket_id
         WHERE locator.token = ticket.public_token
           AND locator.tenant_id = ticket.tenant_id
           AND locator.event_id = ticket.event_id`,
      );
      assert(
        locatorRows.rows[0]?.count === '2',
        'Public ticket locator did not backfill both legacy tokens.',
      );
      const defaultScope = await database.query<{
        tenant_id: string;
        event_id: string;
      }>('SELECT DISTINCT tenant_id::text, event_id::text FROM tickets');
      assert(
        defaultScope.rows.length === 1 &&
          defaultScope.rows[0]?.tenant_id ===
            '00000000-0000-4000-8000-000000000001' &&
          defaultScope.rows[0]?.event_id ===
            '00000000-0000-4000-8000-000000000002',
        'Legacy tickets did not receive the fixed default tenant/event IDs.',
      );

      const beforeValidation = await database.query<{
        tenants: string;
        events: string;
        equipment: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM tenants) AS tenants,
           (SELECT count(*)::text FROM events) AS events,
           (SELECT count(*)::text FROM event_equipment) AS equipment`,
      );
      await runCommand(
        process.execPath,
        [tenantConfigScript, 'validate', '--file', fixturePath],
        process.env,
      );
      const afterValidation = await database.query<{
        tenants: string;
        events: string;
        equipment: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM tenants) AS tenants,
           (SELECT count(*)::text FROM events) AS events,
           (SELECT count(*)::text FROM event_equipment) AS equipment`,
      );
      assertEqual(
        afterValidation.rows,
        beforeValidation.rows,
        'Manifest validation performed database writes.',
      );
      const applyEnvironment = {
        ...process.env,
        ADMIN_TOKEN: randomBytes(24).toString('base64url'),
        AGENT_TOKEN: randomBytes(24).toString('base64url'),
        DATABASE_URL: urlFor('postgres'),
        EVENT_END_AT: '2026-11-04T05:00:00.000Z',
        SLOT_SCHEDULE_JSON:
          '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
        TICKET_NUMBER_SCOPE: 'daily',
      };
      const authIdentities = {
        admin: { subject: 'fixture-admin', userId: randomUUID() },
        staff: { subject: 'fixture-staff', userId: randomUUID() },
      };
      for (const identity of Object.values(authIdentities)) {
        await database.query(
          `INSERT INTO "user" (
             id, name, email, "emailVerified", "createdAt", "updatedAt"
           ) VALUES ($1, 'Rehearsal member', $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [identity.userId, `${identity.subject}@identity.invalid`],
        );
        await database.query(
          `INSERT INTO "account" (
             id, "accountId", "providerId", "userId", "createdAt", "updatedAt"
           ) VALUES ($1, $2, 'oidc', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [randomUUID(), identity.subject, identity.userId],
        );
        await database.query(
          `INSERT INTO "session" (
             id, "expiresAt", token, "createdAt", "updatedAt", "userId"
           ) VALUES ($1, CURRENT_TIMESTAMP + interval '1 hour', $2,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
          [randomUUID(), randomUUID(), identity.userId],
        );
      }
      const initialFixture = JSON.parse(
        await readFile(fixturePath, 'utf8'),
      ) as {
        tenants: Array<{
          id: string;
          members: Array<{
            issuer: string;
            subject: string;
            role: string;
            disabled: boolean;
          }>;
          events: Array<Record<string, unknown>>;
        }>;
      };
      const firstApplyTenant = initialFixture.tenants.find(
        ({ id }) => id === '00000000-0000-4000-8000-000000000001',
      );
      assert(
        firstApplyTenant !== undefined,
        'Default tenant fixture is missing.',
      );
      const firstApplyEvent = firstApplyTenant.events.find(
        ({ id }) => id === '00000000-0000-4000-8000-000000000002',
      );
      assert(
        firstApplyEvent !== undefined,
        'Default event fixture is missing.',
      );
      firstApplyEvent.startsAt = '2026-11-03T01:00:00Z';
      const firstApplyManifestPath = join(
        temporaryDirectory,
        'first-apply-manifest.json',
      );
      await writeFile(
        firstApplyManifestPath,
        JSON.stringify(initialFixture),
        'utf8',
      );
      const beforeInitialPlan = await readTenantConfigSnapshot(database);
      const initialPlanOutput = runCommandOutput(
        process.execPath,
        [
          tenantConfigScript,
          'plan',
          '--file',
          firstApplyManifestPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      assert(
        !/fixture-admin|fixture-staff|id\.example\.invalid|subject|token|credential|eligib/i.test(
          initialPlanOutput,
        ),
        'Manifest plan disclosed subject, member, credential, or qualification information.',
      );
      const initialPlan = JSON.parse(initialPlanOutput) as {
        summary: {
          create: number;
          update: number;
          retire: number;
          noOp: number;
          revisionChanges: number;
        };
        changes: Array<{
          action: string;
          resource: string;
          path: string;
          revision?: { from: string | null; to: string };
        }>;
      };
      assert(
        initialPlan.summary.create > 0 &&
          initialPlan.summary.update > 0 &&
          initialPlan.summary.revisionChanges > 0,
        'Manifest plan did not report expected create/update/revision changes.',
      );
      assert(
        initialPlan.changes.some(
          ({ revision }) => revision?.from === 'legacy-expand-v1',
        ),
        'Manifest plan did not show the legacy revision transition.',
      );
      assertEqual(
        await readTenantConfigSnapshot(database),
        beforeInitialPlan,
        'Manifest plan changed persisted tenant configuration or revision.',
      );

      const firstApplyMutations: Array<{
        name: string;
        expectedMessage: string;
        update: (event: Record<string, unknown>) => void;
      }> = [
        {
          name: 'first-number-scope',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.numberScope = 'event';
          },
        },
        {
          name: 'first-start-bound',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.startsAt = '2026-11-03T01:15:00Z';
            const schedule = event.schedule as Array<Record<string, unknown>>;
            assert(schedule[0] !== undefined, 'Default schedule is missing.');
            schedule[0].firstStart = '10:30';
          },
        },
        {
          name: 'first-end-bound',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.endsAt = '2026-11-04T06:00:00Z';
          },
        },
        {
          name: 'first-equipment-id',
          expectedMessage: 'Manifest validation failed',
          update: (event) => {
            const equipment = event.equipment;
            assert(
              Array.isArray(equipment),
              'Default event equipment is missing.',
            );
            event.equipment = equipment.slice(1);
          },
        },
        {
          name: 'first-time-zone',
          expectedMessage: 'Manifest validation failed',
          update: (event) => {
            event.timeZone = 'UTC';
          },
        },
      ];
      const beforeFirstApply = await readTenantConfigSnapshot(database);
      for (const mutation of firstApplyMutations) {
        const incompatibleManifest = structuredClone(initialFixture);
        const defaultTenant = incompatibleManifest.tenants.find(
          ({ id }) => id === '00000000-0000-4000-8000-000000000001',
        );
        assert(
          defaultTenant !== undefined,
          'Default tenant fixture is missing.',
        );
        const defaultEvent = defaultTenant.events.find(
          ({ id }) => id === '00000000-0000-4000-8000-000000000002',
        );
        assert(defaultEvent !== undefined, 'Default event fixture is missing.');
        mutation.update(defaultEvent);
        const incompatiblePath = join(
          temporaryDirectory,
          `${mutation.name}.json`,
        );
        await writeFile(
          incompatiblePath,
          JSON.stringify(incompatibleManifest),
          'utf8',
        );
        runExpectedFailure(
          process.execPath,
          [
            tenantConfigScript,
            'apply',
            '--file',
            incompatiblePath,
            '--database-url-env',
            'DATABASE_URL',
          ],
          applyEnvironment,
          mutation.expectedMessage,
        );
        assertEqual(
          await readTenantConfigSnapshot(database),
          beforeFirstApply,
          `Rejected first apply mutation ${mutation.name} changed database state.`,
        );
      }

      const nonOwnerPassword = randomBytes(24).toString('base64url');
      await database.query(
        `CREATE ROLE tenant_config_non_owner LOGIN PASSWORD '${nonOwnerPassword}'`,
      );
      const nonOwnerUrl = new URL(urlFor('postgres'));
      nonOwnerUrl.username = 'tenant_config_non_owner';
      nonOwnerUrl.password = nonOwnerPassword;
      const nonOwnerEnvironment = {
        ...applyEnvironment,
        TENANT_CONFIG_NON_OWNER_URL: nonOwnerUrl.toString(),
      };
      runExpectedFailure(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          fixturePath,
          '--database-url-env',
          'TENANT_CONFIG_NON_OWNER_URL',
        ],
        nonOwnerEnvironment,
        'Apply requires a database connection owned by tenants',
      );
      await runCommand(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          firstApplyManifestPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const initialManifestSessions = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "session"',
      );
      assert(
        initialManifestSessions.rows[0]?.count === '2',
        'Applying active manifest memberships revoked active sessions.',
      );
      const printerIdsAfterFirstApply = await database.query(
        'SELECT tenant_id::text, event_id::text, id::text, slug FROM printers ORDER BY tenant_id, event_id, slug',
      );
      const firstApplyRevision = await database.query<{
        config_revision: string;
      }>('SELECT config_revision FROM events WHERE id = $1', [
        '00000000-0000-4000-8000-000000000002',
      ]);
      await runCommand(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          firstApplyManifestPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const printerIdsAfterSecondApply = await database.query(
        'SELECT tenant_id::text, event_id::text, id::text, slug FROM printers ORDER BY tenant_id, event_id, slug',
      );
      assertEqual(
        printerIdsAfterSecondApply.rows,
        printerIdsAfterFirstApply.rows,
        'Repeated manifest apply changed printer database IDs.',
      );
      const secondApplyRevision = await database.query<{
        config_revision: string;
      }>('SELECT config_revision FROM events WHERE id = $1', [
        '00000000-0000-4000-8000-000000000002',
      ]);
      assert(
        firstApplyRevision.rows[0]?.config_revision ===
          secondApplyRevision.rows[0]?.config_revision,
        'Repeated manifest apply produced a different config revision.',
      );
      const beforeNoOpPlan = await readTenantConfigSnapshot(database);
      const noOpPlanOutput = runCommandOutput(
        process.execPath,
        [
          tenantConfigScript,
          'plan',
          '--file',
          firstApplyManifestPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const noOpPlan = JSON.parse(noOpPlanOutput) as {
        summary: {
          create: number;
          update: number;
          retire: number;
          noOp: number;
          revisionChanges: number;
        };
        changes: Array<{ action: string }>;
      };
      assert(
        noOpPlan.summary.create === 0 &&
          noOpPlan.summary.update === 0 &&
          noOpPlan.summary.retire === 0 &&
          noOpPlan.summary.revisionChanges === 0 &&
          noOpPlan.summary.noOp > 0 &&
          noOpPlan.changes.every(({ action }) => action === 'no-op'),
        'A plan after apply did not report only no-op operations.',
      );
      assert(
        !/fixture-admin|fixture-staff|id\.example\.invalid|subject|token|credential|eligib/i.test(
          noOpPlanOutput,
        ),
        'No-op manifest plan disclosed subject, member, credential, or qualification information.',
      );
      assertEqual(
        await readTenantConfigSnapshot(database),
        beforeNoOpPlan,
        'No-op plan changed persisted tenant configuration or revision.',
      );

      const appliedCounts = await database.query<{
        tenants: string;
        events: string;
        equipment: string;
        printers: string;
        memberships: string;
        default_event_config_revision: string;
        sample_equipment: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM tenants WHERE disabled_at IS NULL) AS tenants,
           (SELECT count(*)::text FROM events WHERE disabled_at IS NULL) AS events,
           (SELECT count(*)::text FROM event_equipment WHERE disabled_at IS NULL) AS equipment,
           (SELECT count(*)::text FROM printers WHERE disabled_at IS NULL) AS printers,
           (SELECT count(*)::text FROM tenant_memberships WHERE disabled_at IS NULL) AS memberships,
           (SELECT config_revision FROM events WHERE id = '00000000-0000-4000-8000-000000000002') AS default_event_config_revision,
           (SELECT count(*)::text FROM event_equipment WHERE tenant_id = '10000000-0000-4000-8000-000000000001' AND event_id = '10000000-0000-4000-8000-000000000002' AND disabled_at IS NULL) AS sample_equipment`,
      );
      const counts = appliedCounts.rows[0];
      assert(
        counts?.tenants === '2',
        'Manifest apply did not create two tenants.',
      );
      assert(
        counts.events === '2',
        'Manifest apply did not create two events.',
      );
      assert(
        counts.equipment === '9',
        'Manifest apply did not create all nine equipment rows.',
      );
      assert(
        counts.printers === '2',
        'Manifest apply did not create both printer rows.',
      );
      assert(
        counts.memberships === '2',
        'Manifest apply did not create both tenant memberships.',
      );
      assert(
        counts.sample_equipment === '5',
        'Manifest apply did not preserve the five-item event equipment list.',
      );
      assert(
        /^[a-f0-9]{64}$/.test(counts.default_event_config_revision),
        'Manifest apply did not store a SHA-256 event revision.',
      );

      const disabledMemberFixture = structuredClone(initialFixture);
      const disabledMemberTenant = disabledMemberFixture.tenants.find(
        ({ id }) => id === '00000000-0000-4000-8000-000000000001',
      );
      assert(
        disabledMemberTenant !== undefined,
        'Default tenant fixture is missing.',
      );
      const disabledAdmin = disabledMemberTenant.members.find(
        ({ subject }) => subject === authIdentities.admin.subject,
      );
      assert(disabledAdmin !== undefined, 'Default admin fixture is missing.');
      disabledAdmin.disabled = true;
      const disabledMemberPath = join(
        temporaryDirectory,
        'disabled-member-manifest.json',
      );
      await writeFile(
        disabledMemberPath,
        JSON.stringify(disabledMemberFixture),
        'utf8',
      );
      await runCommand(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          disabledMemberPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const afterMemberDisable = await database.query<{
        admin_sessions: string;
        staff_sessions: string;
      }>(
        `SELECT
           count(*) FILTER (WHERE "userId" = $1)::text AS admin_sessions,
           count(*) FILTER (WHERE "userId" = $2)::text AS staff_sessions
         FROM "session"`,
        [authIdentities.admin.userId, authIdentities.staff.userId],
      );
      assert(
        afterMemberDisable.rows[0]?.admin_sessions === '0' &&
          afterMemberDisable.rows[0]?.staff_sessions === '1',
        'Disabling one manifest membership did not revoke only that member session.',
      );
      await runCommand(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          firstApplyManifestPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );

      const sampleTenantId = '10000000-0000-4000-8000-000000000001';
      const sampleEventId = '10000000-0000-4000-8000-000000000002';
      const samplePrinter = await database.query<{ id: string }>(
        'SELECT id::text FROM printers WHERE tenant_id = $1 AND event_id = $2 ORDER BY id LIMIT 1',
        [sampleTenantId, sampleEventId],
      );
      const samplePrinterId = samplePrinter.rows[0]?.id;
      assert(
        samplePrinterId !== undefined,
        'Sample tenant printer fixture is missing.',
      );
      const sampleTicketId = randomUUID();
      await database.query(
        `INSERT INTO tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at, tenant_id, event_id
         ) VALUES ($1, 'sample-tenant', 1, 1, $2, $3, $4, 'waiting', NULL, $5, $5, $6, $7)`,
        [
          sampleTicketId,
          randomBytes(16).toString('base64url'),
          randomUUID(),
          'd'.repeat(64),
          issuedAt,
          sampleTenantId,
          sampleEventId,
        ],
      );
      await assertCompositeScopeForeignKeys(
        database,
        legacyTicketId,
        samplePrinterId,
        sampleTenantId,
        sampleEventId,
        issuedAt,
      );
      await assertRuntimeRlsIsolation(
        database,
        legacyTicketId,
        sampleTicketId,
        sampleTenantId,
        sampleEventId,
      );
      await assertScopedIndexesAndConstraints(database);
      await assertNoTicketLegacyApplyIsFlexible(
        database,
        postgres,
        urlFor,
        temporaryDirectory,
        applyEnvironment,
      );

      const fixture = initialFixture;
      const defaultTenant = fixture.tenants.find(
        ({ id }) => id === '00000000-0000-4000-8000-000000000001',
      );
      assert(defaultTenant !== undefined, 'Default tenant fixture is missing.');
      const defaultOnlyPath = join(
        temporaryDirectory,
        'default-only-manifest.json',
      );
      await writeFile(
        defaultOnlyPath,
        JSON.stringify({ ...fixture, tenants: [defaultTenant] }),
        'utf8',
      );
      const beforeRetirePlan = await readTenantConfigSnapshot(database);
      const retirePlanOutput = runCommandOutput(
        process.execPath,
        [
          tenantConfigScript,
          'plan',
          '--file',
          defaultOnlyPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const retirePlan = JSON.parse(retirePlanOutput) as {
        summary: { retire: number };
        changes: Array<{ action: string; path: string }>;
      };
      assert(
        retirePlan.summary.retire >= 7 &&
          retirePlan.changes.some(
            ({ action, path }) =>
              action === 'retire' && path === 'tenant/sample-tenant',
          ) &&
          retirePlan.changes.some(
            ({ action, path }) =>
              action === 'retire' &&
              path === 'tenant/sample-tenant/event/summer',
          ),
        'Manifest plan did not preview omitted tenant/event/equipment retirement.',
      );
      assert(
        !/fixture-admin|fixture-staff|id\.example\.invalid|subject|token|credential|eligib/i.test(
          retirePlanOutput,
        ),
        'Retirement plan disclosed subject, member, credential, or qualification information.',
      );
      assertEqual(
        await readTenantConfigSnapshot(database),
        beforeRetirePlan,
        'Retirement plan changed persisted tenant configuration or revision.',
      );
      await runCommand(
        process.execPath,
        [
          tenantConfigScript,
          'apply',
          '--file',
          defaultOnlyPath,
          '--database-url-env',
          'DATABASE_URL',
        ],
        applyEnvironment,
      );
      const disabledSampleRows = await database.query<{
        equipment: string;
        printers: string;
      }>(
        `SELECT
           (SELECT count(*)::text
            FROM tenants AS tenant
            JOIN events AS event ON event.tenant_id = tenant.id
            JOIN event_equipment AS equipment
              ON equipment.tenant_id = event.tenant_id AND equipment.event_id = event.id
            WHERE tenant.id = '10000000-0000-4000-8000-000000000001'
              AND tenant.disabled_at IS NOT NULL
              AND event.disabled_at IS NOT NULL
              AND equipment.disabled_at IS NOT NULL) AS equipment,
           (SELECT count(*)::text FROM printers
            WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
              AND disabled_at IS NOT NULL) AS printers`,
      );
      assert(
        disabledSampleRows.rows[0]?.equipment === '5' &&
          disabledSampleRows.rows[0]?.printers === '1',
        'Removing a tenant from the manifest did not disable its event equipment and printers.',
      );
      const sessionAfterTenantRetirement = await database.query<{
        count: string;
      }>('SELECT count(*)::text AS count FROM "session" WHERE "userId" = $1', [
        authIdentities.staff.userId,
      ]);
      assert(
        sessionAfterTenantRetirement.rows[0]?.count === '0',
        'Removing a tenant membership did not revoke its member session.',
      );

      const unchangedRevision = counts.default_event_config_revision;
      const immutableMutations: Array<{
        name: string;
        expectedMessage: string;
        update: (event: Record<string, unknown>) => void;
      }> = [
        {
          name: 'number-scope',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.numberScope = 'event';
          },
        },
        {
          name: 'starts-at',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.startsAt = '2026-11-02T23:00:00Z';
          },
        },
        {
          name: 'ends-at',
          expectedMessage: 'Manifest apply cannot change issued-event',
          update: (event) => {
            event.endsAt = '2026-11-04T06:00:00Z';
          },
        },
        {
          name: 'time-zone',
          expectedMessage: 'Manifest validation failed',
          update: (event) => {
            event.timeZone = 'UTC';
          },
        },
        {
          name: 'equipment-id',
          expectedMessage: 'Manifest validation failed',
          update: (event) => {
            const equipment = event.equipment;
            assert(
              Array.isArray(equipment),
              'Default event equipment is missing.',
            );
            event.equipment = equipment.map((item, index) =>
              index === 0 && typeof item === 'object' && item !== null
                ? { ...item, id: 'replacement-unit' }
                : item,
            );
          },
        },
      ];
      for (const mutation of immutableMutations) {
        const incompatibleManifest = structuredClone({
          ...fixture,
          tenants: [defaultTenant],
        });
        const defaultEvent = incompatibleManifest.tenants[0]?.events[0];
        assert(defaultEvent !== undefined, 'Default event fixture is missing.');
        mutation.update(defaultEvent);
        const incompatiblePath = join(
          temporaryDirectory,
          `incompatible-issued-event-${mutation.name}.json`,
        );
        await writeFile(
          incompatiblePath,
          JSON.stringify(incompatibleManifest),
          'utf8',
        );
        runExpectedFailure(
          process.execPath,
          [
            tenantConfigScript,
            'apply',
            '--file',
            incompatiblePath,
            '--database-url-env',
            'DATABASE_URL',
          ],
          applyEnvironment,
          mutation.expectedMessage,
        );
        const afterRejectedApply = await database.query<{
          config_revision: string;
          number_scope: string;
        }>(
          `SELECT config_revision, config->>'numberScope' AS number_scope
           FROM events WHERE id = '00000000-0000-4000-8000-000000000002'`,
        );
        assert(
          afterRejectedApply.rows[0]?.config_revision === unchangedRevision &&
            afterRejectedApply.rows[0]?.number_scope === 'daily',
          `Rejected ${mutation.name} mutation changed persisted configuration.`,
        );
      }

      console.log(
        'Tenant/event migration rehearsal passed: legacy ticket, slot/release history, public tokens, counter values, and print JSON preserved; locator backfill verified; manifest validate/apply is idempotent; tenant/event/equipment/printer/membership apply and retirement verified; tenant/event composite indexes and foreign keys verified; forced runtime RLS and SET LOCAL scope reset verified; issued-event identity configuration is immutable after issuance.',
      );
    } finally {
      await database.end();
    }
  },
);

async function assertNoTicketLegacyApplyIsFlexible(
  adminDatabase: ReturnType<EmbeddedPostgres['getPgClient']>,
  postgres: EmbeddedPostgres,
  urlFor: (database: string) => string,
  temporaryDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const databaseName = `oss_no_ticket_${randomUUID().replaceAll('-', '')}`;
  await adminDatabase.query(`CREATE DATABASE ${databaseName}`);
  const database = postgres.getPgClient(databaseName, '127.0.0.1');
  await database.connect();
  try {
    for (const migrationName of migrationNames) {
      const migration = await readFile(
        new URL(`../db/migrations/${migrationName}`, import.meta.url),
        'utf8',
      );
      await database.query(migration);
    }
  } finally {
    await database.end();
  }

  const manifest = JSON.parse(await readFile(fixturePath, 'utf8')) as {
    tenants: Array<{ id: string; events: Array<Record<string, unknown>> }>;
  };
  const defaultTenant = manifest.tenants.find(
    ({ id }) => id === '00000000-0000-4000-8000-000000000001',
  );
  assert(defaultTenant !== undefined, 'Default tenant fixture is missing.');
  const defaultEvent = defaultTenant.events.find(
    ({ id }) => id === '00000000-0000-4000-8000-000000000002',
  );
  assert(defaultEvent !== undefined, 'Default event fixture is missing.');
  defaultEvent.numberScope = 'event';
  defaultEvent.startsAt = '2026-11-02T23:00:00Z';
  defaultEvent.endsAt = '2026-11-05T06:00:00Z';
  const manifestPath = join(temporaryDirectory, 'zero-ticket-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  await runCommand(
    process.execPath,
    [
      tenantConfigScript,
      'apply',
      '--file',
      manifestPath,
      '--database-url-env',
      'DATABASE_URL',
    ],
    { ...environment, DATABASE_URL: urlFor(databaseName) },
  );

  const verify = postgres.getPgClient(databaseName, '127.0.0.1');
  await verify.connect();
  try {
    const result = await verify.query<{
      config: Record<string, unknown>;
      ticket_count: string;
      config_revision: string;
    }>(
      `SELECT config, config_revision,
              (SELECT count(*)::text FROM tickets WHERE tenant_id = events.tenant_id AND event_id = events.id) AS ticket_count
       FROM events WHERE id = '00000000-0000-4000-8000-000000000002'`,
    );
    const row = result.rows[0];
    assert(
      row?.config.numberScope === 'event' &&
        row.config.startsAt === '2026-11-02T23:00:00Z' &&
        row.config.endsAt === '2026-11-05T06:00:00Z' &&
        row.ticket_count === '0' &&
        /^[a-f0-9]{64}$/.test(row.config_revision),
      'A ticket-free legacy event did not accept its initial manifest configuration.',
    );
  } finally {
    await verify.end();
  }
}

async function readTenantConfigSnapshot(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
): Promise<unknown> {
  const tenants = await database.query(
    'SELECT id::text, slug, display_name, disabled_at FROM tenants ORDER BY id',
  );
  const events = await database.query(
    'SELECT tenant_id::text, id::text, slug, config, config_revision, disabled_at FROM events ORDER BY id',
  );
  const equipment = await database.query(
    'SELECT tenant_id::text, event_id::text, id, label, sort_order, disabled_at FROM event_equipment ORDER BY tenant_id, event_id, id',
  );
  const memberships = await database.query(
    `SELECT membership.tenant_id::text, app_user.issuer, app_user.subject,
            membership.role, membership.disabled_at
     FROM tenant_memberships AS membership
     JOIN app_users AS app_user ON app_user.id = membership.user_id
     ORDER BY membership.tenant_id, app_user.issuer, app_user.subject`,
  );
  const printers = await database.query(
    'SELECT tenant_id::text, event_id::text, id::text, slug, label, disabled_at FROM printers ORDER BY tenant_id, event_id, slug',
  );
  const tickets = await database.query(
    'SELECT count(*)::text AS count FROM tickets',
  );
  const counters = await database.query(
    'SELECT counter_key, last_number FROM ticket_counters ORDER BY counter_key',
  );
  return {
    tenants: tenants.rows,
    events: events.rows,
    equipment: equipment.rows,
    memberships: memberships.rows,
    printers: printers.rows,
    tickets: tickets.rows,
    counters: counters.rows,
  };
}

function runCommandOutput(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): string {
  const result = spawnSync(command, args, { env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with ${result.signal ?? `code ${result.status}`}: ${result.stderr}`,
    );
  }
  return result.stdout;
}

async function readTicketSnapshots(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
): Promise<TicketSnapshot[]> {
  const result = await database.query<TicketSnapshot>(
    `SELECT id::text, counter_key, number, party_size, public_token, idempotency_key,
            request_hash, status, cancel_reason,
            issued_at::text, updated_at::text, slot_starts_at::text, equipment,
            slot_changed_at::text, previous_slot_starts_at::text, previous_equipment,
            slot_change_comment, slot_released_at::text
     FROM tickets ORDER BY id::text`,
  );
  return result.rows;
}

async function assertCompositeScopeForeignKeys(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
  legacyTicketId: string,
  samplePrinterId: string,
  sampleTenantId: string,
  sampleEventId: string,
  issuedAt: Date,
): Promise<void> {
  await database.query('BEGIN');
  try {
    await expectCheckFailure(
      database,
      `INSERT INTO tickets (
         id, counter_key, number, party_size, public_token, idempotency_key,
         request_hash, status, cancel_reason, issued_at, updated_at, tenant_id, event_id
       ) VALUES ($1, 'cross-event', 1, 1, $2, $3, $4, 'waiting', NULL, $5, $5, $6, $7)`,
      [
        randomUUID(),
        randomBytes(16).toString('base64url'),
        randomUUID(),
        'e'.repeat(64),
        issuedAt,
        sampleTenantId,
        '00000000-0000-4000-8000-000000000002',
      ],
      '23503',
    );
    await expectCheckFailure(
      database,
      `INSERT INTO print_jobs (
         id, ticket_id, status, created_at, updated_at, attempt, payload,
         tenant_id, event_id, printer_id, payload_version
       ) VALUES ($1, $2, 'queued', $3, $3, 0, '{}'::jsonb, $4, $5, $6, 1)`,
      [
        randomUUID(),
        legacyTicketId,
        issuedAt,
        sampleTenantId,
        sampleEventId,
        samplePrinterId,
      ],
      '23503',
    );
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

async function assertRuntimeRlsIsolation(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
  legacyTicketId: string,
  sampleTicketId: string,
  sampleTenantId: string,
  sampleEventId: string,
): Promise<void> {
  const runtimeRole = await database.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(
    'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
    ['queue_pilot_runtime'],
  );
  assert(
    runtimeRole.rows[0]?.rolsuper === false &&
      runtimeRole.rows[0]?.rolbypassrls === false &&
      runtimeRole.rows[0]?.rolcanlogin === false,
    'Runtime role must remain NOLOGIN, NOSUPERUSER, and NOBYPASSRLS.',
  );
  const protectedTables = [
    'tenants',
    'events',
    'event_equipment',
    'app_users',
    'tenant_memberships',
    'printers',
    'agents',
    'agent_credentials',
    'tickets',
    'ticket_counters',
    'print_jobs',
    'public_ticket_locator',
  ];
  const rlsTables = await database.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    `SELECT relation.relname, relation.relrowsecurity, relation.relforcerowsecurity
     FROM pg_class AS relation
     JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])`,
    [protectedTables],
  );
  assert(
    rlsTables.rows.length === protectedTables.length &&
      rlsTables.rows.every(
        ({ relrowsecurity, relforcerowsecurity }) =>
          relrowsecurity && relforcerowsecurity,
      ),
    'Every scoped table must enable and force row-level security.',
  );

  await database.query('BEGIN');
  try {
    await database.query('SET LOCAL ROLE queue_pilot_runtime');
    await database.query(
      "SELECT set_config('app.tenant_id', $1, true), set_config('app.event_id', $2, true)",
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ],
    );
    const visible = await database.query<{ id: string }>(
      'SELECT id::text FROM tickets ORDER BY id',
    );
    assert(
      visible.rows.some(({ id }) => id === legacyTicketId) &&
        !visible.rows.some(({ id }) => id === sampleTicketId),
      'Runtime ticket query crossed tenant scope or hid the default ticket.',
    );
    const visibleTenants = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants',
    );
    const visibleEvents = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM events',
    );
    assert(
      visibleTenants.rows[0]?.count === '1' &&
        visibleEvents.rows[0]?.count === '1',
      'Runtime tenant/event reads were not restricted to the active scope.',
    );
    await expectCheckFailure(
      database,
      'INSERT INTO ticket_counters (counter_key, last_number, tenant_id, event_id) VALUES ($1, 1, $2, $3)',
      [randomUUID(), sampleTenantId, sampleEventId],
      '42501',
    );
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }

  await database.query('BEGIN');
  try {
    await database.query('SET LOCAL ROLE queue_pilot_runtime');
    const unscopedTickets = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tickets',
    );
    assert(
      unscopedTickets.rows[0]?.count === '0',
      'SET LOCAL tenant scope leaked into the next transaction on a reused connection.',
    );
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

async function expectCheckFailure(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
  query: string,
  values: unknown[],
  expectedCode = '23514',
): Promise<void> {
  await database.query('SAVEPOINT expected_scope_check');
  let failure: unknown;
  try {
    await database.query(query, values);
  } catch (error) {
    failure = error;
  }
  await database.query('ROLLBACK TO SAVEPOINT expected_scope_check');
  await database.query('RELEASE SAVEPOINT expected_scope_check');
  if (typeof failure !== 'object' || failure === null || !('code' in failure)) {
    throw new Error(
      'The deliberately invalid scoped write did not fail with the expected SQLSTATE.',
    );
  }
  if (failure.code !== expectedCode) {
    throw failure;
  }
}

async function assertScopedIndexesAndConstraints(
  database: ReturnType<EmbeddedPostgres['getPgClient']>,
): Promise<void> {
  const expectedIndexes: Record<string, string[]> = {
    tickets_idempotency_key_key: ['tenant_id', 'event_id', 'idempotency_key'],
    tickets_counter_key_number_key: [
      'tenant_id',
      'event_id',
      'counter_key',
      'number',
    ],
    tickets_slot_equipment_key: [
      'tenant_id',
      'event_id',
      'slot_starts_at',
      'equipment_id',
    ],
  };
  const indexNames = Object.keys(expectedIndexes);
  const indexes = await database.query<{ indexname: string; indexdef: string }>(
    'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2::text[])',
    ['public', indexNames],
  );
  const definitions = new Map(
    indexes.rows.map(({ indexname, indexdef }) => [indexname, indexdef]),
  );
  for (const [indexName, columns] of Object.entries(expectedIndexes)) {
    const definition = definitions.get(indexName);
    assert(
      definition !== undefined,
      `Scoped unique index ${indexName} is missing.`,
    );
    assert(
      columns.every((column) => definition.includes(column)),
      `Scoped index ${indexName} is missing one or more tenant/event key columns.`,
    );
  }

  const expectedConstraints = [
    'tickets_tenant_event_fkey',
    'tickets_equipment_fkey',
    'tickets_previous_equipment_fkey',
    'ticket_counters_tenant_event_fkey',
    'print_jobs_reprint_of_fkey',
    'print_jobs_claimed_agent_fkey',
    'print_jobs_printer_fkey',
    'print_jobs_tenant_event_fkey',
    'print_jobs_ticket_fkey',
    'public_ticket_locator_ticket_id_fkey',
  ];
  const constraints = await database.query<{ conname: string }>(
    'SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])',
    [expectedConstraints],
  );
  assert(
    constraints.rows.length === expectedConstraints.length,
    'One or more tenant/event composite foreign-key constraints are missing.',
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} exited with ${signal ?? `code ${code}`}.`),
        );
    });
  });
}

function runExpectedFailure(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  expectedMessage: string,
): void {
  const result = spawnSync(command, args, { env, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert(
    result.status !== 0,
    'An issued-event configuration change was unexpectedly applied.',
  );
  assert(
    result.stderr.includes(expectedMessage),
    'Issued-event configuration was rejected for an unexpected reason.',
  );
}
