import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import {
  claimPrintJob,
  issueTicket,
  reportPrintResult,
} from '../../src/application/use-cases.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
  parseTenantManifest,
} from '../../src/domain/tenant-manifest.ts';
import {
  type PublicToken,
  parseSlotSchedule,
} from '../../src/domain/ticket.ts';
import { createDrizzleAgentCredentialAdministration } from '../../src/infrastructure/auth/agent-credential-repository.ts';
import { createDrizzleAuthorizationRepository } from '../../src/infrastructure/auth/authorization-repository.ts';
import { createSharedPostgresRateLimiter } from '../../src/infrastructure/auth/postgres-rate-limiter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { createUnitOfWork } from '../../src/infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from '../../src/infrastructure/request-context.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

const defaultManifestPath = new URL(
  '../fixtures/default-tenant-manifest.json',
  import.meta.url,
);
const dayMilliseconds = 24 * 60 * 60 * 1000;

it('authenticates created and rotated agent tokens through claim/result and rejects expired or revoked credentials', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const manifestResult = parseTenantManifest(
      JSON.parse(await readFile(defaultManifestPath, 'utf8')) as unknown,
    );
    if (!manifestResult.ok)
      throw new Error('The default test manifest is invalid.');
    const tenant = manifestResult.value.tenants.find(
      ({ id }) => id === DEFAULT_TENANT_ID,
    );
    const event = tenant?.events.find(({ id }) => id === DEFAULT_EVENT_ID);
    const member = tenant?.members[0];
    const printer = event?.printers.find(
      ({ id }) => id === event.defaultPrinterId,
    );
    if (
      tenant === undefined ||
      event === undefined ||
      member === undefined ||
      printer === undefined
    ) {
      throw new Error(
        'The default manifest is missing the security test fixture.',
      );
    }

    const userId = randomUUID();
    await owner.query(
      'UPDATE events SET config = $1::jsonb, config_revision = $2 WHERE tenant_id = $3 AND id = $4',
      [
        JSON.stringify(event),
        'security-regression-fixture',
        tenant.id,
        event.id,
      ],
    );
    const seededPrinters = await owner.query<{ id: string }>(
      'SELECT id FROM printers WHERE tenant_id = $1 AND event_id = $2 AND slug = $3',
      [tenant.id, event.id, printer.id],
    );
    const printerId = seededPrinters.rows[0]?.id;
    if (printerId === undefined)
      throw new Error('The migrated default printer was not found.');
    await owner.query(
      'INSERT INTO app_users (id, issuer, subject) VALUES ($1, $2, $3)',
      [userId, member.issuer, member.subject],
    );
    await owner.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')",
      [tenant.id, userId],
    );

    const roleName = `security_runtime_${randomBytes(8).toString('hex')}`;
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
      const connectedUser = await runtime.db.execute(sql`SELECT current_user`);
      expect(String(connectedUser.rows[0]?.current_user) === roleName).toBe(
        true,
      );

      const requestContext = createRequestContextStorage();
      const authorization = createDrizzleAuthorizationRepository(runtime.db);
      const principal = {
        userId,
        issuer: member.issuer,
        subject: member.subject,
        sessionId: randomUUID(),
      };
      const memberScope = await authorization.resolveMemberScope(
        principal,
        tenant.slug,
        event.slug,
      );
      if (memberScope === null)
        throw new Error('The seeded admin membership was not resolved.');
      const administration = createDrizzleAgentCredentialAdministration(
        runtime.db,
        requestContext,
      );

      const created = await requestContext.run(memberScope, () =>
        administration.create(
          memberScope,
          printer.id,
          new Date(Date.now() + 7 * dayMilliseconds),
        ),
      );
      if (created === null)
        throw new Error('The configured printer was not available.');
      const storedCredential = await owner.query<{ secret_hash: string }>(
        'SELECT secret_hash FROM agent_credentials WHERE agent_id = $1',
        [created.id],
      );
      const createdHashMatchesIssuedToken =
        storedCredential.rows.length === 1 &&
        storedCredential.rows[0]?.secret_hash ===
          createHash('sha256').update(created.token).digest('hex');
      expect(createdHashMatchesIssuedToken).toBe(true);

      const createdScope = await authorization.resolveAgentScope(
        created.token,
        [2],
      );
      expect(
        createdScope?.kind === 'agent' &&
          createdScope.agentId === created.id &&
          createdScope.printerId === printer.id,
      ).toBe(true);
      if (createdScope === null)
        throw new Error('The created agent token was rejected.');

      const parsedSchedule = parseSlotSchedule(
        JSON.stringify(
          event.schedule.map(({ date, firstStart, lastStart }) => ({
            date,
            firstStart,
            lastStart,
          })),
        ),
      );
      if (!parsedSchedule.ok || parsedSchedule.value[0] === undefined) {
        throw new Error(
          'The default event schedule could not be used in the regression test.',
        );
      }
      const currentTime = new Date('2026-11-02T03:00:00.000Z');
      const clock = { now: () => new Date(currentTime) };
      const tokens = {
        ticketId: randomUUID,
        printJobId: randomUUID,
        publicToken: () => randomBytes(16).toString('base64url') as PublicToken,
        leaseToken: randomUUID,
      };
      const unitOfWork = createUnitOfWork(runtime.db, requestContext);
      const reservation = { kind: 'slot' as const, ...parsedSchedule.value[0] };
      const issued = await requestContext.run(memberScope, () =>
        issueTicket(
          {
            idempotencyKey: randomUUID(),
            requestHash: createHash('sha256')
              .update(randomUUID())
              .digest('hex'),
            reservation,
          },
          {
            unitOfWork,
            clock,
            tokens,
            numberScope: event.numberScope,
            timeZone: event.timeZone,
            slotSchedule: parsedSchedule.value,
            version2Print: {
              timeZone: event.timeZone,
              publicBaseURL: 'https://tickets.example.invalid/',
              copy: event.copy,
            },
          },
        ),
      );
      if (!issued.ok)
        throw new Error('The integration fixture ticket was not issued.');

      const claimed = await requestContext.run(createdScope, () =>
        claimPrintJob({
          unitOfWork,
          clock,
          tokens,
          acceptedPayloadVersions: [2],
        }),
      );
      if (
        !claimed.ok ||
        claimed.value === null ||
        claimed.value.leaseToken === null
      ) {
        throw new Error(
          'The created agent token could not claim the v2 print job.',
        );
      }
      const printJobId = claimed.value.id;
      const leaseToken = claimed.value.leaseToken;
      const reported = await requestContext.run(createdScope, () =>
        reportPrintResult(
          {
            printJobId,
            leaseToken,
            outcome: 'printed',
          },
          { unitOfWork, clock },
        ),
      );
      if (!reported.ok)
        throw new Error(
          'The created agent token could not report the print result.',
        );
      const printedStatus = await owner.query<{ status: string }>(
        'SELECT status FROM print_jobs WHERE id = $1',
        [printJobId],
      );
      expect(printedStatus.rows[0]?.status === 'printed').toBe(true);

      const rotated = await requestContext.run(memberScope, () =>
        administration.rotate(
          memberScope,
          created.id,
          new Date(Date.now() + 8 * dayMilliseconds),
        ),
      );
      if (rotated === null)
        throw new Error(
          'The agent credential rotation did not create a token.',
        );
      const oldTokenDuringOverlap = await authorization.resolveAgentScope(
        created.token,
        [2],
      );
      const newTokenDuringOverlap = await authorization.resolveAgentScope(
        rotated.token,
        [2],
      );
      expect(
        oldTokenDuringOverlap !== null && newTokenDuringOverlap !== null,
      ).toBe(true);

      const expiring = await requestContext.run(memberScope, () =>
        administration.create(
          memberScope,
          printer.id,
          new Date(Date.now() + 7 * dayMilliseconds),
        ),
      );
      if (expiring === null)
        throw new Error('The configured printer was not available.');
      const expiringHash = createHash('sha256')
        .update(expiring.token)
        .digest('hex');
      await owner.query(
        "UPDATE agent_credentials SET created_at = clock_timestamp() - interval '2 seconds', expires_at = clock_timestamp() - interval '1 second' WHERE secret_hash = $1",
        [expiringHash],
      );
      const expiredScope = await authorization.resolveAgentScope(
        expiring.token,
        [2],
      );
      expect(expiredScope === null).toBe(true);

      const revoked = await requestContext.run(memberScope, () =>
        administration.revoke(memberScope, created.id),
      );
      expect(revoked).toBe(true);
      const revokedOldToken = await authorization.resolveAgentScope(
        created.token,
        [2],
      );
      const revokedNewToken = await authorization.resolveAgentScope(
        rotated.token,
        [2],
      );
      expect(revokedOldToken === null && revokedNewToken === null).toBe(true);
    } finally {
      await runtime.close();
    }
  });
}, 120_000);

it('shares rate-limit counters across runtime database pools without DDL access', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const migratedTable = await owner.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.rate_limiter')::text AS table_name",
    );
    expect(migratedTable.rows[0]?.table_name).toBe('rate_limiter');

    const roleName = `rate_limit_runtime_${randomBytes(8).toString('hex')}`;
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
      const roleState = await runtimeA.db.execute(
        sql`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
      );
      expect(roleState.rows[0]?.can_create).toBe(false);

      const policy = { keyPrefix: 'integration-test', points: 1, duration: 60 };
      const limiterA = createSharedPostgresRateLimiter(runtimeA.pool, policy);
      const limiterB = createSharedPostgresRateLimiter(runtimeB.pool, policy);
      await limiterA.consume('same-identity');
      await expect(limiterB.consume('same-identity')).rejects.toMatchObject({
        remainingPoints: 0,
      });

      const storedCounters = await owner.query<{ points: number }>(
        'SELECT points FROM public.rate_limiter',
      );
      expect(storedCounters.rows).toHaveLength(1);
      expect(storedCounters.rows[0]?.points).toBe(2);
    } finally {
      await runtimeA.close();
      await runtimeB.close();
    }
  });
}, 120_000);
