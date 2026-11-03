import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type EmbeddedPostgres from 'embedded-postgres';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

type RehearsalContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

type Counts = {
  tickets: number;
  ticket_counters: number;
  print_jobs: number;
};

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

    const source = postgres.getPgClient('postgres', '127.0.0.1');
    await source.connect();
    try {
      const migrationPath = new URL(
        '../db/migrations/20261102130319_init.sql',
        import.meta.url,
      );
      const migration = await readFile(migrationPath, 'utf8');
      await source.query(migration);

      const ticketId = randomUUID();
      const printJobId = randomUUID();
      const publicToken = randomBytes(16).toString('base64url');
      const idempotencyKey = `backup-rehearsal-${randomUUID()}`;
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ partySize: 2 }))
        .digest('hex');
      const now = new Date();
      await source.query(
        `INSERT INTO public.ticket_counters (counter_key, last_number)
         VALUES ('rehearsal', 1)`,
      );
      await source.query(
        `INSERT INTO public.tickets (
           id, counter_key, number, party_size, public_token, idempotency_key,
           request_hash, status, cancel_reason, issued_at, updated_at
         ) VALUES ($1, 'rehearsal', 1, 2, $2, $3, $4, 'waiting', NULL, $5, $5)`,
        [ticketId, publicToken, idempotencyKey, requestHash, now],
      );
      await source.query(
        `INSERT INTO public.print_jobs (
           id, ticket_id, status, created_at, updated_at, attempt, payload
         ) VALUES ($1, $2, 'queued', $3, $3, 0, $4::jsonb)`,
        [
          printJobId,
          ticketId,
          now,
          JSON.stringify({
            ticketNumber: 1,
            partySize: 2,
            publicToken,
            issuedAt: now.toISOString(),
          }),
        ],
      );
    } finally {
      await source.end();
    }

    const connection = new URL(urlFor('postgres'));
    const commandEnvironment = {
      ...process.env,
      PGHOST: connection.hostname,
      PGPORT: connection.port,
      PGUSER: connection.username,
      PGPASSWORD: connection.password,
    };
    const dumpPath = join(temporaryDirectory, 'backup.dump');
    await runCommand(
      'pg_dump',
      ['-Fc', '-d', 'postgres', '-f', dumpPath],
      commandEnvironment,
    );
    const dump = await stat(dumpPath);
    if (dump.size === 0) throw new Error('pg_dump created an empty file.');

    await runCommand(
      'pg_restore',
      ['--no-owner', '--role=app', '-d', 'restore', '--verbose', dumpPath],
      commandEnvironment,
    );

    const sourceCounts = await readCounts(postgres, 'postgres');
    const restoredCounts = await readCounts(postgres, 'restore');
    if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) {
      throw new Error(
        `Backup rehearsal row counts differ: source=${JSON.stringify(sourceCounts)}, restored=${JSON.stringify(restoredCounts)}.`,
      );
    }
    console.log(
      `Backup rehearsal passed: tickets=${sourceCounts.tickets}, ticket_counters=${sourceCounts.ticket_counters}, print_jobs=${sourceCounts.print_jobs}`,
    );
  },
);

async function readCounts(
  postgres: EmbeddedPostgres,
  database: string,
): Promise<Counts> {
  const client = postgres.getPgClient(database, '127.0.0.1');
  await client.connect();
  try {
    const result = await client.query<Counts>(
      `SELECT
         (SELECT count(*)::integer FROM public.tickets) AS tickets,
         (SELECT count(*)::integer FROM public.ticket_counters) AS ticket_counters,
         (SELECT count(*)::integer FROM public.print_jobs) AS print_jobs`,
    );
    const counts = result.rows[0];
    if (counts === undefined)
      throw new Error('Could not read restored row counts.');
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
