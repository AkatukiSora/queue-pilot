import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../src/app.ts';
import type {
  Clock,
  TokenGenerator,
  UnitOfWork,
} from '../../src/application/ports.ts';
import {
  callTicket,
  cancelTicket,
  claimPrintJob,
  getTicketDetail,
  issueTicket,
  recallTicket,
  reportPrintResult,
  reprintTicket,
  serveTicket,
} from '../../src/application/use-cases.ts';
import type { PublicToken } from '../../src/domain/ticket.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import {
  printJobs,
  ticketCounters,
  tickets,
} from '../../src/infrastructure/persistence/drizzle/schema.ts';
import { createUnitOfWork } from '../../src/infrastructure/persistence/drizzle/tx.ts';

const database = {
  value: undefined as ReturnType<typeof createDrizzleDatabase> | undefined,
};
let unitOfWork: UnitOfWork;
let currentTime = new Date('2026-11-02T03:00:00.000Z');

const clock: Clock = { now: () => new Date(currentTime) };
const tokens: TokenGenerator = {
  ticketId: randomUUID,
  printJobId: randomUUID,
  publicToken: () => randomBytes(16).toString('base64url') as PublicToken,
  leaseToken: randomUUID,
};

function db() {
  if (database.value === undefined)
    throw new Error('Test database is not initialized.');
  return database.value.db;
}

function requireSuccess<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok)
    throw new Error(
      `Expected success, received ${JSON.stringify(result.error)}`,
    );
  return result.value;
}

function issue(
  key: string,
  requestHash = key,
  numberScope: 'daily' | 'event' = 'daily',
) {
  return issueTicket(
    { idempotencyKey: key, requestHash },
    { unitOfWork, clock, tokens, numberScope },
  );
}

function createStartBarrier(participants: number) {
  let arrivals = 0;
  let release: () => void = () => {};
  const start = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === participants) release();
    await start;
  };
}

async function expectClaimToSkipLockedJob(expectedQueuedJobs: number) {
  const queuedJobs = await db()
    .select({ id: printJobs.id })
    .from(printJobs)
    .where(eq(printJobs.status, 'queued'))
    .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
  expect(queuedJobs).toHaveLength(expectedQueuedJobs);

  let signalClaimed!: () => void;
  const claimHeld = new Promise<void>((resolve) => {
    signalClaimed = resolve;
  });
  let releaseClaim!: () => void;
  const holdClaim = new Promise<void>((resolve) => {
    releaseClaim = resolve;
  });
  const holdingClaim = unitOfWork.run(async ({ printJobs: repository }) => {
    const claimed = await repository.claimNextQueuedJob(
      clock.now(),
      new Date(currentTime.getTime() + 60_000),
      tokens.leaseToken(),
    );
    if (claimed === null)
      throw new Error('Expected the first job to be claimed.');
    expect(claimed.id).toBe(queuedJobs[0]?.id);
    signalClaimed();
    await holdClaim;
    return { ok: true as const, value: claimed };
  });
  await Promise.race([
    claimHeld,
    holdingClaim.then(() => {
      throw new Error('The lock-holding transaction finished before release.');
    }),
  ]);

  let competingClaim: ReturnType<typeof claimPrintJob> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    competingClaim = claimPrintJob({ unitOfWork, clock, tokens });
    const outcome = await Promise.race([
      competingClaim.then((result) => ({ kind: 'completed' as const, result })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), 2_000);
      }),
    ]);
    if (outcome.kind === 'timeout') {
      throw new Error(
        'A competing claim waited on the locked job for 2 seconds.',
      );
    }
    const claimed = requireSuccess(outcome.result);
    expect(claimed?.id ?? null).toBe(queuedJobs[1]?.id ?? null);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    releaseClaim();
    await holdingClaim;
    if (competingClaim !== undefined) await competingClaim;
  }
}

async function clearDatabase() {
  await db().execute(
    sql.raw('TRUNCATE TABLE print_jobs, tickets, ticket_counters CASCADE'),
  );
}

async function persistedTicket(id: string) {
  const [ticket] = await db().select().from(tickets).where(eq(tickets.id, id));
  if (ticket === undefined) throw new Error(`Missing ticket ${id}`);
  return ticket;
}

async function persistedJob(id: string) {
  const [job] = await db().select().from(printJobs).where(eq(printJobs.id, id));
  if (job === undefined) throw new Error(`Missing print job ${id}`);
  return job;
}

beforeAll(() => {
  database.value = createDrizzleDatabase(inject('testDatabaseUrl'), 50);
  unitOfWork = createUnitOfWork(database.value.db);
});

afterAll(async () => {
  await database.value?.close();
});

beforeEach(async () => {
  currentTime = new Date('2026-11-02T03:00:00.000Z');
  await clearDatabase();
});

describe('PostgreSQL integration: ticket issuance and numbering', () => {
  it.each(['daily', 'event'] as const)(
    'allocates consecutive numbers for 50 simultaneous %s-scope requests',
    async (scope) => {
      const waitForStart = createStartBarrier(50);
      const startedAt = performance.now();
      const results = await Promise.all(
        Array.from({ length: 50 }, async (_, index) => {
          await waitForStart();
          const result = await issue(
            `${scope}-${index}`,
            `${scope}-payload-${index}`,
            scope,
          );
          return requireSuccess(result).ticket.number;
        }),
      );
      const elapsedMs = Math.round(performance.now() - startedAt);
      const expected = Array.from({ length: 50 }, (_, index) => index + 1);
      expect(results.sort((a, b) => a - b)).toEqual(expected);
      const key = scope === 'daily' ? '2026-11-02' : 'event';
      const persisted = await db()
        .select({ number: tickets.number })
        .from(tickets)
        .where(eq(tickets.counterKey, key));
      expect(
        persisted.map(({ number }) => number).sort((a, b) => a - b),
      ).toEqual(expected);
      console.log(`PASS ${scope}: 50 concurrent issues in ${elapsedMs}ms`);
    },
  );

  it('replays the same ticket for identical idempotency keys and rejects changed payloads', async () => {
    const created = requireSuccess(await issue('retry-key', 'payload-a'));
    const replay = requireSuccess(await issue('retry-key', 'payload-a'));
    expect(replay).toEqual({ ticket: created.ticket, replayed: true });
    expect(await issue('retry-key', 'payload-b')).toEqual({
      ok: false,
      error: { kind: 'IdempotencyKeyReuse' },
    });
    const next = requireSuccess(await issue('after-retry', 'payload-c'));
    expect(next.ticket.number).toBe(2);
    expect(await db().select().from(tickets)).toHaveLength(2);
    expect(await db().select().from(printJobs)).toHaveLength(2);
    const [counter] = await db()
      .select()
      .from(ticketCounters)
      .where(eq(ticketCounters.counterKey, '2026-11-02'));
    expect(counter?.lastNumber).toBe(2);
  });

  it('rolls back counter allocation across 20 simultaneous requests with one idempotency key', async () => {
    const waitForStart = createStartBarrier(20);
    const startedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await waitForStart();
        return issue('shared-key', 'shared-payload');
      }),
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    const values = results.map(requireSuccess);
    expect(new Set(values.map(({ ticket }) => ticket.id)).size).toBe(1);
    expect(values.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(await db().select().from(tickets)).toHaveLength(1);
    expect(await db().select().from(printJobs)).toHaveLength(1);
    const [counter] = await db().select().from(ticketCounters);
    expect(counter?.lastNumber).toBe(1);
    console.log(
      `PASS idempotency: 20 concurrent identical requests in ${elapsedMs}ms`,
    );
  });
});

describe('PostgreSQL integration: ticket state and reprint', () => {
  it('persists valid state transitions and rolls back invalid transitions', async () => {
    const issued = requireSuccess(await issue('state-ticket')).ticket;
    expect((await persistedTicket(issued.id)).status).toBe('waiting');
    requireSuccess(await callTicket(issued.id, { unitOfWork, clock }));
    expect((await persistedTicket(issued.id)).status).toBe('called');
    requireSuccess(await serveTicket(issued.id, { unitOfWork, clock }));
    expect((await persistedTicket(issued.id)).status).toBe('served');
    expect(await recallTicket(issued.id, { unitOfWork, clock })).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from: 'served', action: 'recall' },
    });
    expect((await persistedTicket(issued.id)).status).toBe('served');

    const cancelled = requireSuccess(await issue('cancel-ticket')).ticket;
    requireSuccess(await callTicket(cancelled.id, { unitOfWork, clock }));
    requireSuccess(await recallTicket(cancelled.id, { unitOfWork, clock }));
    requireSuccess(
      await cancelTicket(cancelled.id, 'no_show', { unitOfWork, clock }),
    );
    expect(await persistedTicket(cancelled.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'no_show',
    });
  });

  it('creates a new reprint job while preserving the original job and ticket', async () => {
    const ticket = requireSuccess(await issue('reprint-ticket')).ticket;
    const original = requireSuccess(
      await claimPrintJob({ unitOfWork, clock, tokens }),
    );
    if (original === null)
      throw new Error('Expected the original job to be claimed.');
    requireSuccess(
      await reportPrintResult(
        {
          printJobId: original.id,
          leaseToken: original.leaseToken ?? '',
          outcome: 'failed',
          detail: 'printer unavailable',
        },
        { unitOfWork, clock },
      ),
    );
    const originalBefore = await persistedJob(original.id);
    const ticketBefore = await persistedTicket(ticket.id);
    const reprint = requireSuccess(
      await reprintTicket(ticket.id, { unitOfWork, clock, tokens }),
    );
    expect(reprint).toMatchObject({ status: 'queued', reprintOf: original.id });
    expect(await persistedJob(original.id)).toEqual(originalBefore);
    expect(await persistedTicket(ticket.id)).toEqual(ticketBefore);
    expect(await db().select().from(printJobs)).toHaveLength(2);
  });

  it('rejects reprinting while the newest job is queued or printing', async () => {
    const ticket = requireSuccess(await issue('not-reprintable')).ticket;
    expect(
      await reprintTicket(ticket.id, { unitOfWork, clock, tokens }),
    ).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    const claimed = requireSuccess(
      await claimPrintJob({ unitOfWork, clock, tokens }),
    );
    if (claimed === null)
      throw new Error('Expected the queued job to be claimed.');
    expect(
      await reprintTicket(ticket.id, { unitOfWork, clock, tokens }),
    ).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    expect(await db().select().from(printJobs)).toHaveLength(1);
  });
});

describe('PostgreSQL integration: ticket detail query', () => {
  it('returns the ticket and its print-job history without locking the ticket row', async () => {
    const ticket = requireSuccess(await issue('ticket-detail')).ticket;
    const detail = requireSuccess(await getTicketDetail(ticket.id, unitOfWork));
    expect(detail.ticket.id).toBe(ticket.id);
    expect(detail.printJobs).toHaveLength(1);
    expect(detail.printJobs[0]?.status).toBe('queued');
    expect(await getTicketDetail(randomUUID(), unitOfWork)).toEqual({
      ok: false,
      error: { kind: 'TicketNotFound' },
    });
  });
});

describe('PostgreSQL integration: print-job claiming and leases', () => {
  it('claims jobs concurrently without returning any job twice', async () => {
    for (let index = 0; index < 20; index += 1) {
      requireSuccess(await issue(`claim-${index}`));
    }
    const waitForStart = createStartBarrier(20);
    const startedAt = performance.now();
    const claimed = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await waitForStart();
        return requireSuccess(
          await claimPrintJob({ unitOfWork, clock, tokens }),
        );
      }),
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    const jobs = claimed.filter((job) => job !== null);
    expect(jobs).toHaveLength(20);
    expect(new Set(jobs.map(({ id }) => id)).size).toBe(20);
    expect(new Set(jobs.map(({ leaseToken }) => leaseToken)).size).toBe(20);
    expect(
      await db().select().from(printJobs).where(eq(printJobs.status, 'queued')),
    ).toHaveLength(0);
    console.log(`PASS claims: 20 concurrent claims in ${elapsedMs}ms`);
  });

  it('returns the next queued job without waiting for a locked claim', async () => {
    requireSuccess(await issue('skip-locked-first'));
    requireSuccess(await issue('skip-locked-second'));
    await expectClaimToSkipLockedJob(2);
  });

  it('returns null without waiting when the only queued job is locked', async () => {
    requireSuccess(await issue('skip-locked-only'));
    await expectClaimToSkipLockedJob(1);
  });

  it('claims queued jobs in created_at, id order', async () => {
    for (let index = 0; index < 8; index += 1)
      requireSuccess(await issue(`fifo-${index}`));
    const expected = await db()
      .select({ id: printJobs.id })
      .from(printJobs)
      .where(eq(printJobs.status, 'queued'))
      .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
    const actual: string[] = [];
    for (let index = 0; index < expected.length; index += 1) {
      const job = requireSuccess(
        await claimPrintJob({ unitOfWork, clock, tokens }),
      );
      if (job === null)
        throw new Error('Expected the next queued job to be claimed.');
      actual.push(job.id);
    }
    expect(actual).toEqual(expected.map(({ id }) => id));
  });

  it('marks expired leases unknown without requeueing and rejects the stale lease token', async () => {
    requireSuccess(await issue('lease-expiry'));
    const claimed = requireSuccess(
      await claimPrintJob({ unitOfWork, clock, tokens }),
    );
    if (claimed === null || claimed.leaseExpiresAt === null) {
      throw new Error('Expected a claimed job with a lease expiry.');
    }
    currentTime = new Date(claimed.leaseExpiresAt.getTime() + 1);
    expect(
      requireSuccess(await claimPrintJob({ unitOfWork, clock, tokens })),
    ).toBeNull();
    expect(await persistedJob(claimed.id)).toMatchObject({
      status: 'unknown',
      leaseToken: null,
      leaseExpiresAt: null,
    });
    expect(
      await db().select().from(printJobs).where(eq(printJobs.status, 'queued')),
    ).toHaveLength(0);
    expect(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        { unitOfWork, clock },
      ),
    ).toEqual({ ok: false, error: { kind: 'LeaseMismatch' } });
  });

  it('rejects mismatched lease tokens without changing the printing job', async () => {
    requireSuccess(await issue('lease-mismatch'));
    const claimed = requireSuccess(
      await claimPrintJob({ unitOfWork, clock, tokens }),
    );
    if (claimed === null) throw new Error('Expected a job to be claimed.');
    const before = await persistedJob(claimed.id);
    expect(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: randomUUID(),
          outcome: 'printed',
        },
        { unitOfWork, clock },
      ),
    ).toEqual({ ok: false, error: { kind: 'LeaseMismatch' } });
    expect(await persistedJob(claimed.id)).toEqual(before);
  });

  it('does not log sensitive parameters when PostgreSQL rejects ticket issuance', async () => {
    const idempotencyKey = 'r45-idempotency-secret-marker';
    const publicToken = 'p'.repeat(22) as PublicToken;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ partySize: 7 }))
      .digest('hex');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await db().execute(
        sql.raw(
          'ALTER TABLE tickets ADD CONSTRAINT r45_sensitive_log_test CHECK (party_size <> 7)',
        ),
      );
      const app = createApp({
        config: {
          databaseUrl: 'postgres://test/test',
          adminToken: 'a'.repeat(32),
          agentToken: 'b'.repeat(32),
          eventEndAt: new Date('2026-11-04T00:00:00.000Z'),
          numberScope: 'daily',
        },
        unitOfWork,
        clock,
        tokens: { ...tokens, publicToken: () => publicToken },
        checkReadiness: async () => true,
      });
      const response = await app.request('/api/admin/tickets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${'a'.repeat(32)}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ partySize: 7 }),
      });

      expect(response.status).toBe(500);
      expect(log).toHaveBeenCalledTimes(1);
      const serializedLogs = JSON.stringify(log.mock.calls);
      expect(serializedLogs).not.toContain(publicToken);
      expect(serializedLogs).not.toContain(idempotencyKey);
      expect(serializedLogs).not.toContain(requestHash);
      expect(log.mock.calls[0]?.[0]).toMatchObject({
        name: expect.any(String),
        code: '23514',
        message: expect.any(String),
      });
    } finally {
      try {
        await db().execute(
          sql.raw(
            'ALTER TABLE tickets DROP CONSTRAINT IF EXISTS r45_sensitive_log_test',
          ),
        );
      } finally {
        log.mockRestore();
      }
    }
  });
});
