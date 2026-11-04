import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type EmbeddedPostgres from 'embedded-postgres';
import { createApp } from '../apps/api/src/app.ts';
import type { TokenGenerator } from '../apps/api/src/application/ports.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import type { PublicToken } from '../apps/api/src/domain/ticket.ts';
import { createDrizzleDatabase } from '../apps/api/src/infrastructure/persistence/drizzle/client.ts';
import { createUnitOfWork } from '../apps/api/src/infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from '../apps/api/src/infrastructure/request-context.ts';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

type RehearsalContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

type RehearsalCounts = {
  tickets: number;
  ticketCounters: number;
  printJobs: number;
  legacyWaiting: number;
  legacyCalled: number;
  slotTickets: number;
  expectedSlot: number;
  releasedSlots: number;
  legacyPrintPayloads: number;
};

const scheduleJson =
  '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]';
const scheduledStart = '2026-11-04T01:00:00.000Z';
const eventEndAt = '2026-11-04T14:00:00+09:00';

await withTemporaryPostgres(
  async ({ postgres, urlFor, temporaryDirectory }: RehearsalContext) => {
    const admin = postgres.getPgClient('postgres', '127.0.0.1');
    await admin.connect();
    try {
      await admin.query('CREATE ROLE app');
      await admin.query('CREATE DATABASE restore OWNER app');
    } finally {
      await admin.end();
    }

    const fixtureIds = [randomUUID(), randomUUID()];
    const slotTicketId = randomUUID();
    const issuedAt = new Date('2026-11-03T06:00:00.000Z');
    const originalToken = randomBytes(16).toString('base64url');
    const expandedWriteToken = randomBytes(16).toString('base64url');
    const source = postgres.getPgClient('postgres', '127.0.0.1');
    await source.connect();
    try {
      const oldSchema = await readFile(
        new URL('../db/migrations/20261102130319_init.sql', import.meta.url),
        'utf8',
      );
      await source.query(oldSchema);
      await source.query(
        'INSERT INTO public.ticket_counters (counter_key, last_number) VALUES ($1, 2)',
        ['2026-11-03'],
      );
      const originalRequestHash = createHash('sha256')
        .update('slot migration rehearsal legacy fixture')
        .digest('hex');
      await source.query(
        `INSERT INTO public.tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at
         ) VALUES ($1, '2026-11-03', 1, 2, $2, $3, $4, 'called', NULL, $5, $5)`,
        [
          fixtureIds[0],
          originalToken,
          'slot-migration-rehearsal-original',
          originalRequestHash,
          issuedAt,
        ],
      );
      await source.query(
        `INSERT INTO public.print_jobs (
           id, ticket_id, status, created_at, updated_at, attempt, payload
         ) VALUES ($1, $2, 'queued', $3, $3, 0, $4::jsonb)`,
        [
          randomUUID(),
          fixtureIds[0],
          issuedAt,
          JSON.stringify({
            ticketNumber: 1,
            partySize: 2,
            publicToken: originalToken,
            issuedAt: issuedAt.toISOString(),
          }),
        ],
      );

      const maintenanceStarted = performance.now();
      const migrationStarted = performance.now();
      const expandMigration = await readFile(
        new URL(
          '../db/migrations/20261103024725_slot_reservations.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await source.query(expandMigration);
      const migrationMs = Math.round(performance.now() - migrationStarted);

      const expandedWriteHash = createHash('sha256')
        .update('slot migration rehearsal old writer')
        .digest('hex');
      await source.query(
        `INSERT INTO public.tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at
         ) VALUES ($1, '2026-11-03', 2, 2, $2, $3, $4, 'waiting', NULL, $5, $5)`,
        [
          fixtureIds[1],
          expandedWriteToken,
          'slot-migration-rehearsal-expanded-write',
          expandedWriteHash,
          issuedAt,
        ],
      );
      await source.query(
        `INSERT INTO public.print_jobs (
           id, ticket_id, status, created_at, updated_at, attempt, payload
         ) VALUES ($1, $2, 'queued', $3, $3, 0, $4::jsonb)`,
        [
          randomUUID(),
          fixtureIds[1],
          issuedAt,
          JSON.stringify({
            ticketNumber: 2,
            partySize: 2,
            publicToken: expandedWriteToken,
            issuedAt: issuedAt.toISOString(),
          }),
        ],
      );
      const releaseMigrationStarted = performance.now();
      const releaseMigration = await readFile(
        new URL(
          '../db/migrations/20261103143146_admin_slot_operations.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await source.query(releaseMigration);
      const releaseMigrationMs = Math.round(
        performance.now() - releaseMigrationStarted,
      );
      const tenantEventMigrationStarted = performance.now();
      const tenantEventExpandMigration = await readFile(
        new URL(
          '../db/migrations/20261104062623_tenant_event_expand.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await source.query(tenantEventExpandMigration);
      const defaultScopeMigration = await readFile(
        new URL(
          '../db/migrations/20261104063810_default_scope_gate.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await source.query(defaultScopeMigration);
      for (const migrationName of [
        '20261104101646_scoped_security_auth_print.sql',
        '20261104103828_better_auth_schema.sql',
      ]) {
        const migration = await readFile(
          new URL(`../db/migrations/${migrationName}`, import.meta.url),
          'utf8',
        );
        await source.query(migration);
      }
      const tenantEventMigrationMs = Math.round(
        performance.now() - tenantEventMigrationStarted,
      );

      const adminToken = randomBytes(32).toString('base64url');
      const agentToken = randomBytes(32).toString('base64url');
      const database = createDrizzleDatabase(urlFor('postgres'));
      try {
        const config = loadConfig({
          DATABASE_URL: urlFor('postgres'),
          ADMIN_TOKEN: adminToken,
          AGENT_TOKEN: agentToken,
          EVENT_END_AT: eventEndAt,
          SLOT_SCHEDULE_JSON: scheduleJson,
          TICKET_NUMBER_SCOPE: 'daily',
        });
        const requestContext = createRequestContextStorage();
        const app = createApp({
          config,
          requestContext,
          unitOfWork: createUnitOfWork(database.db, requestContext),
          clock: { now: () => new Date('2026-11-03T06:00:00.000Z') },
          tokens: {
            ticketId: () => slotTicketId,
            printJobId: randomUUID,
            publicToken: () =>
              randomBytes(16).toString('base64url') as PublicToken,
            leaseToken: randomUUID,
          } satisfies TokenGenerator,
          checkReadiness: async () => {
            await source.query('SELECT 1');
            return true;
          },
        });
        const ready = await app.request('/api/readyz');
        if (ready.status !== 200) {
          throw new Error(
            `Expanded-schema API readiness returned ${ready.status}.`,
          );
        }

        const adminHeaders = { Authorization: `Bearer ${adminToken}` };
        const reservationsResponse = await app.request(
          '/api/admin/reservations',
          { headers: adminHeaders },
        );
        if (reservationsResponse.status !== 200) {
          throw new Error(
            `Expanded-schema reservation read returned ${reservationsResponse.status}.`,
          );
        }
        const reservations = (await reservationsResponse.json()) as {
          legacyTickets: Array<{ id: string; status: string }>;
        };
        const legacyById = new Map(
          reservations.legacyTickets.map((ticket) => [
            ticket.id,
            ticket.status,
          ]),
        );
        if (
          legacyById.get(fixtureIds[0]) !== 'called' ||
          legacyById.get(fixtureIds[1]) !== 'waiting'
        ) {
          throw new Error('The new API did not retain both legacy tickets.');
        }

        const issueResponse = await app.request('/api/admin/tickets', {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Content-Type': 'application/json',
            'Idempotency-Key': 'slot-migration-rehearsal-new-ticket',
          },
          body: JSON.stringify({
            slotStartsAt: scheduledStart,
            equipment: 'Quest 3',
          }),
        });
        if (issueResponse.status !== 201) {
          throw new Error(
            `New slot issuance returned ${issueResponse.status}.`,
          );
        }
        const issued = (await issueResponse.json()) as {
          ticket: { id: string; number: number; reservation: { kind: string } };
        };
        if (
          issued.ticket.id !== slotTicketId ||
          issued.ticket.number !== 3 ||
          issued.ticket.reservation.kind !== 'slot'
        ) {
          throw new Error(
            'The expanded-schema API returned an invalid new ticket.',
          );
        }
      } finally {
        await database.close();
      }
      const simulatedUnavailableMs = Math.round(
        performance.now() - maintenanceStarted,
      );

      const connection = new URL(urlFor('postgres'));
      const commandEnvironment = {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGUSER: connection.username,
        PGPASSWORD: connection.password,
      };
      const dumpPath = join(
        temporaryDirectory,
        'slot-migration-rehearsal.dump',
      );
      const restoreStarted = performance.now();
      await runCommand(
        'pg_dump',
        ['-Fc', '-d', 'postgres', '-f', dumpPath],
        commandEnvironment,
      );
      if ((await stat(dumpPath)).size === 0) {
        throw new Error(
          'pg_dump created an empty migration-rehearsal archive.',
        );
      }
      await runCommand(
        'pg_restore',
        ['--no-owner', '--role=app', '-d', 'restore', '--verbose', dumpPath],
        commandEnvironment,
      );
      const restoreMs = Math.round(performance.now() - restoreStarted);

      const sourceCounts = await readCounts(
        postgres,
        'postgres',
        fixtureIds,
        slotTicketId,
        scheduledStart,
      );
      const restoredCounts = await readCounts(
        postgres,
        'restore',
        fixtureIds,
        slotTicketId,
        scheduledStart,
      );
      if (
        sourceCounts.tickets !== 3 ||
        sourceCounts.ticketCounters !== 1 ||
        sourceCounts.printJobs !== 3 ||
        sourceCounts.legacyWaiting !== 1 ||
        sourceCounts.legacyCalled !== 1 ||
        sourceCounts.slotTickets !== 1 ||
        sourceCounts.expectedSlot !== 1 ||
        sourceCounts.releasedSlots !== 0 ||
        sourceCounts.legacyPrintPayloads !== 2
      ) {
        throw new Error(
          `Unexpected upgraded database contents: ${JSON.stringify(sourceCounts)}.`,
        );
      }
      if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) {
        throw new Error(
          `Restored data differs: source=${JSON.stringify(sourceCounts)}, restored=${JSON.stringify(restoredCounts)}.`,
        );
      }
      const versionClient = postgres.getPgClient('postgres', '127.0.0.1');
      await versionClient.connect();
      let serverVersion: string;
      try {
        const result = await versionClient.query<{ server_version: string }>(
          'SHOW server_version',
        );
        serverVersion = result.rows[0]?.server_version ?? 'unknown';
      } finally {
        await versionClient.end();
      }
      console.log(
        `Slot migration rehearsal passed on PostgreSQL ${serverVersion}: legacy tickets retained=2 (waiting=1, called=1), old print payloads retained=${sourceCounts.legacyPrintPayloads}, new slot issuance=201, restored tickets=${restoredCounts.tickets}, counters=${restoredCounts.ticketCounters}, print jobs=${restoredCounts.printJobs}. Isolated timings: slot reservations=${migrationMs}ms, admin slot operations=${releaseMigrationMs}ms, tenant/event expand=${tenantEventMigrationMs}ms, migration-to-first-issue=${simulatedUnavailableMs}ms, dump+restore=${restoreMs}ms; these are not production downtime measurements.`,
      );
    } finally {
      await source.end();
    }
  },
);

async function readCounts(
  postgres: EmbeddedPostgres,
  database: string,
  fixtureIds: string[],
  slotTicketId: string,
  slotStartsAt: string,
): Promise<RehearsalCounts> {
  const client = postgres.getPgClient(database, '127.0.0.1');
  await client.connect();
  try {
    const result = await client.query<RehearsalCounts>(
      `SELECT
         (SELECT count(*)::integer FROM public.tickets) AS tickets,
         (SELECT count(*)::integer FROM public.ticket_counters) AS "ticketCounters",
         (SELECT count(*)::integer FROM public.print_jobs) AS "printJobs",
         (SELECT count(*)::integer FROM public.tickets WHERE id = $1 AND status = 'waiting' AND slot_starts_at IS NULL AND equipment IS NULL) AS "legacyWaiting",
         (SELECT count(*)::integer FROM public.tickets WHERE id = $2 AND status = 'called' AND slot_starts_at IS NULL AND equipment IS NULL) AS "legacyCalled",
         (SELECT count(*)::integer FROM public.tickets WHERE slot_starts_at IS NOT NULL) AS "slotTickets",
         (SELECT count(*)::integer FROM public.tickets WHERE id = $3 AND slot_starts_at = $4::timestamptz AND equipment = 'Quest 3') AS "expectedSlot",
         (SELECT count(*)::integer FROM public.tickets WHERE slot_released_at IS NOT NULL) AS "releasedSlots",
         (SELECT count(*)::integer FROM public.print_jobs WHERE payload ? 'partySize' AND NOT (payload ? 'kind')) AS "legacyPrintPayloads"`,
      [fixtureIds[1], fixtureIds[0], slotTicketId, slotStartsAt],
    );
    const counts = result.rows[0];
    if (counts === undefined) {
      throw new Error('Could not read rehearsal database counts.');
    }
    return counts;
  } finally {
    await client.end();
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
