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
  Repositories,
  TokenGenerator,
  UnitOfWork,
} from '../../src/application/ports.ts';
import type { RequestContextStorage } from '../../src/application/security-ports.ts';
import {
  callTicket,
  cancelTicket,
  claimPrintJob,
  getTicketDetail,
  issueTicket,
  recallTicket,
  releaseTicket,
  reportPrintResult,
  reprintTicket,
  rescheduleTicket,
  restoreTicket,
  serveTicket,
} from '../../src/application/use-cases.ts';
import type { Result } from '../../src/domain/result.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
} from '../../src/domain/tenant-manifest.ts';
import type { PublicToken } from '../../src/domain/ticket.ts';
import { parseSlotSchedule } from '../../src/domain/ticket.ts';
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
const requestContext: RequestContextStorage = {
  current: () => ({
    kind: 'legacy',
    tenantId: DEFAULT_TENANT_ID,
    eventId: DEFAULT_EVENT_ID,
  }),
  async run(_context, operation) {
    return operation();
  },
};
let currentTime = new Date('2026-11-02T03:00:00.000Z');

const parsedSchedule = parseSlotSchedule(
  '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
);
if (!parsedSchedule.ok) throw new Error('Test slot schedule is invalid.');
const slotSchedule = parsedSchedule.value;

function reservationAt(index: number) {
  const slot = slotSchedule[index];
  if (slot === undefined) throw new Error(`Missing test slot ${index}`);
  return { kind: 'slot' as const, ...slot };
}

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
  reservation = reservationAt(0),
) {
  return issueTicket(
    { idempotencyKey: key, requestHash, reservation },
    { unitOfWork, clock, tokens, numberScope, slotSchedule },
  );
}

async function insertLegacyTicket(id: string, number: number, partySize = 4) {
  await db()
    .insert(tickets)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      eventId: DEFAULT_EVENT_ID,
      id,
      counterKey: `legacy-${currentTime.toISOString().slice(0, 10)}`,
      number,
      partySize,
      publicToken: randomBytes(16).toString('base64url'),
      idempotencyKey: `legacy-${id}`,
      requestHash: createHash('sha256').update(id).digest('hex'),
      status: 'waiting',
      cancelReason: null,
      issuedAt: currentTime,
      updatedAt: currentTime,
    });
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

function createTicketLockRace(ticketId: string) {
  let signalAcquired!: () => void;
  let signalRequested!: () => void;
  let releaseLock!: () => void;
  const acquired = new Promise<void>((resolve) => {
    signalAcquired = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    signalRequested = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const controlled = (role: 'holder' | 'waiter'): UnitOfWork => ({
    run<T, E>(
      operation: (repositories: Repositories) => Promise<Result<T, E>>,
    ): Promise<Result<T, E>> {
      return unitOfWork.run<T, E>(async (repositories) => {
        const tickets = {
          ...repositories.tickets,
          async findTicketByIdForUpdate(id: string) {
            if (role === 'waiter' && id === ticketId) signalRequested();
            const ticket =
              await repositories.tickets.findTicketByIdForUpdate(id);
            if (role === 'holder' && id === ticketId && ticket !== null) {
              signalAcquired();
              await held;
            }
            return ticket;
          },
        };
        const scopedRepositories: Repositories = { ...repositories, tickets };
        return operation(scopedRepositories);
      });
    },
  });
  return {
    acquired,
    requested,
    release: releaseLock,
    holder: controlled('holder'),
    waiter: controlled('waiter'),
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
      [1],
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
  unitOfWork = createUnitOfWork(database.value.db, requestContext);
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
            reservationAt(index),
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

  it('enforces equipment-and-time uniqueness while allowing other equipment or times', async () => {
    const reservations = await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        issue(
          `valid-slot-${index}`,
          `valid-payload-${index}`,
          'daily',
          reservationAt(index),
        ),
      ),
    );
    reservations.forEach((result) => {
      requireSuccess(result);
    });

    expect(
      await issue(
        'duplicate-slot',
        'duplicate-payload',
        'daily',
        reservationAt(0),
      ),
    ).toEqual({ ok: false, error: { kind: 'SlotUnavailable' } });
    expect(await db().select().from(tickets)).toHaveLength(5);
    expect(await db().select().from(printJobs)).toHaveLength(5);
    const [counter] = await db().select().from(ticketCounters);
    expect(counter?.lastNumber).toBe(5);
  });

  it('allows only one concurrent reservation for the same slot and equipment', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        issue(
          `slot-race-${index}`,
          `slot-race-payload-${index}`,
          'daily',
          reservationAt(0),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.error.kind === 'SlotUnavailable',
      ),
    ).toHaveLength(49);
    expect(await db().select().from(tickets)).toHaveLength(1);
    expect(await db().select().from(printJobs)).toHaveLength(1);
    const [counter] = await db().select().from(ticketCounters);
    expect(counter?.lastNumber).toBe(1);
  });

  it('replays the same ticket for identical idempotency keys and rejects changed payloads', async () => {
    const created = requireSuccess(await issue('retry-key', 'payload-a'));
    const replay = requireSuccess(await issue('retry-key', 'payload-a'));
    expect(replay).toEqual({ ticket: created.ticket, replayed: true });
    expect(await issue('retry-key', 'payload-b')).toEqual({
      ok: false,
      error: { kind: 'IdempotencyKeyReuse' },
    });
    const next = requireSuccess(
      await issue('after-retry', 'payload-c', 'daily', reservationAt(1)),
    );
    expect(next.ticket.number).toBe(2);
    expect(await db().select().from(tickets)).toHaveLength(2);
    expect(await db().select().from(printJobs)).toHaveLength(2);
    const [counter] = await db()
      .select()
      .from(ticketCounters)
      .where(eq(ticketCounters.counterKey, '2026-11-02'));
    expect(counter?.lastNumber).toBe(2);
  });

  it('rolls back counter allocation across 50 simultaneous requests with one idempotency key', async () => {
    const waitForStart = createStartBarrier(50);
    const startedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
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
      `PASS idempotency: 50 concurrent identical requests in ${elapsedMs}ms`,
    );
  });
});

describe('PostgreSQL integration: ticket state and reprint', () => {
  it('keeps slot transitions direct and preserves legacy queue transitions', async () => {
    const scheduled = requireSuccess(await issue('state-ticket')).ticket;
    expect((await persistedTicket(scheduled.id)).status).toBe('waiting');
    expect(await callTicket(scheduled.id, { unitOfWork, clock })).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from: 'waiting', action: 'call' },
    });
    requireSuccess(await serveTicket(scheduled.id, { unitOfWork, clock }));
    expect((await persistedTicket(scheduled.id)).status).toBe('served');

    const legacyWaitingId = randomUUID();
    await insertLegacyTicket(legacyWaitingId, 2);
    requireSuccess(await serveTicket(legacyWaitingId, { unitOfWork, clock }));
    expect((await persistedTicket(legacyWaitingId)).status).toBe('served');
    expect(
      await rescheduleTicket(
        legacyWaitingId,
        { reservation: reservationAt(0), comment: null },
        { unitOfWork, clock, slotSchedule },
      ),
    ).toEqual({
      ok: false,
      error: {
        kind: 'InvalidTransition',
        from: 'served',
        action: 'reschedule',
      },
    });

    const legacyCalledId = randomUUID();
    await insertLegacyTicket(legacyCalledId, 3);
    requireSuccess(await callTicket(legacyCalledId, { unitOfWork, clock }));
    expect((await persistedTicket(legacyCalledId)).status).toBe('called');
    requireSuccess(await serveTicket(legacyCalledId, { unitOfWork, clock }));
    expect((await persistedTicket(legacyCalledId)).status).toBe('served');

    const legacyCancelledId = randomUUID();
    await insertLegacyTicket(legacyCancelledId, 4);
    requireSuccess(await callTicket(legacyCancelledId, { unitOfWork, clock }));
    requireSuccess(
      await recallTicket(legacyCancelledId, { unitOfWork, clock }),
    );
    requireSuccess(
      await cancelTicket(legacyCancelledId, 'no_show', { unitOfWork, clock }),
    );
    expect(await persistedTicket(legacyCancelledId)).toMatchObject({
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

  it('rejects a second reprint when a printed UUID sorts after the queued job at the same time', async () => {
    const ticket = requireSuccess(await issue('reprint-timestamp-tie')).ticket;
    const [original] = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, ticket.id));
    if (original === undefined) throw new Error('Missing original print job.');
    const printedId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const queuedId = '00000000-0000-4000-8000-000000000001';
    await db()
      .update(printJobs)
      .set({ id: printedId, status: 'printed' })
      .where(eq(printJobs.id, original.id));

    const firstReprint = requireSuccess(
      await reprintTicket(ticket.id, {
        unitOfWork,
        clock,
        tokens: { ...tokens, printJobId: () => queuedId },
      }),
    );
    expect(firstReprint).toMatchObject({
      id: queuedId,
      reprintOf: printedId,
      status: 'queued',
      createdAt: original.createdAt,
    });

    expect(
      await reprintTicket(ticket.id, {
        unitOfWork,
        clock,
        tokens: {
          ...tokens,
          printJobId: () => '00000000-0000-4000-8000-000000000002',
        },
      }),
    ).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    const jobs = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, ticket.id));
    expect(jobs).toHaveLength(2);
    expect(jobs.filter(({ status }) => status === 'queued')).toHaveLength(1);
  });
});

describe('PostgreSQL integration: slot release restoration races', () => {
  it('rolls back a restore when an issue wins the released slot race', async () => {
    const original = requireSuccess(
      await issue('release-race-original'),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, original.id));
    const released = requireSuccess(
      await releaseTicket(original.id, { unitOfWork, clock }),
    );
    expect(released.slotReleasedAt).toEqual(currentTime);

    let signalRestoreAtUpdate!: () => void;
    const restoreAtUpdate = new Promise<void>((resolve) => {
      signalRestoreAtUpdate = resolve;
    });
    let resumeRestore!: () => void;
    const holdRestore = new Promise<void>((resolve) => {
      resumeRestore = resolve;
    });
    const gatedUnitOfWork: UnitOfWork = {
      run<T, E>(
        operation: (repositories: Repositories) => Promise<Result<T, E>>,
      ): Promise<Result<T, E>> {
        return unitOfWork.run<T, E>(async (repositories) => {
          const ticketsRepository: Repositories['tickets'] = {
            ...repositories.tickets,
            async updateTicket(ticket) {
              if (ticket.id === original.id && ticket.slotReleasedAt === null) {
                signalRestoreAtUpdate();
                await holdRestore;
              }
              return repositories.tickets.updateTicket(ticket);
            },
          };
          return operation({ ...repositories, tickets: ticketsRepository });
        });
      },
    };

    const restoration = restoreTicket(
      original.id,
      {},
      { unitOfWork: gatedUnitOfWork, clock, slotSchedule },
    );
    await restoreAtUpdate;
    const replacementResult = await issue(
      'release-race-replacement',
      'release-race-replacement',
      'daily',
      reservationAt(0),
    );
    resumeRestore();
    const replacement = requireSuccess(replacementResult).ticket;

    expect(await restoration).toEqual({
      ok: false,
      error: { kind: 'SlotUnavailable' },
    });
    expect(await persistedTicket(original.id)).toMatchObject({
      status: 'cancelled',
      slotReleasedAt: currentTime,
      slotStartsAt: new Date(reservationAt(0).slotStartsAt),
      equipment: reservationAt(0).equipment,
    });
    expect(await persistedTicket(replacement.id)).toMatchObject({
      status: 'waiting',
      slotReleasedAt: null,
    });
    expect(await db().select().from(tickets)).toHaveLength(2);
    expect(await db().select().from(printJobs)).toHaveLength(2);
    const [counter] = await db().select().from(ticketCounters);
    expect(counter?.lastNumber).toBe(2);
  });
});

describe('PostgreSQL integration: reservation rescheduling', () => {
  it('keeps slot changes atomic, enforces conflicts, and only reprints for time changes', async () => {
    const first = requireSuccess(await issue('reschedule-first')).ticket;
    const occupied = requireSuccess(
      await issue(
        'reschedule-occupied',
        'reschedule-occupied',
        'daily',
        reservationAt(1),
      ),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, first.id));

    expect(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(1), comment: 'conflicting target' },
        { unitOfWork, clock, slotSchedule },
      ),
    ).toEqual({ ok: false, error: { kind: 'SlotUnavailable' } });
    expect(await persistedTicket(first.id)).toMatchObject({
      slotStartsAt: new Date(reservationAt(0).slotStartsAt),
      equipment: reservationAt(0).equipment,
      slotChangedAt: null,
      previousSlotStartsAt: null,
    });

    const moved = requireSuccess(
      await rescheduleTicket(
        first.id,
        {
          reservation: reservationAt(6),
          comment: 'Guest requested a later time.',
        },
        { unitOfWork, clock, slotSchedule },
      ),
    );
    expect(moved.reprintRequired).toBe(true);
    expect(moved.ticket.latestChange).toEqual({
      from: reservationAt(0),
      to: reservationAt(6),
      changedAt: currentTime,
      comment: 'Guest requested a later time.',
    });
    expect(await persistedTicket(first.id)).toMatchObject({
      slotStartsAt: new Date(reservationAt(6).slotStartsAt),
      equipment: reservationAt(6).equipment,
      slotChangedAt: currentTime,
      previousSlotStartsAt: new Date(reservationAt(0).slotStartsAt),
      previousEquipment: reservationAt(0).equipment,
      slotChangeComment: 'Guest requested a later time.',
      partySize: 1,
    });

    const equipmentOnlyChange = requireSuccess(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(7), comment: null },
        { unitOfWork, clock, slotSchedule },
      ),
    );
    expect(equipmentOnlyChange.reprintRequired).toBe(false);
    expect(await persistedTicket(first.id)).toMatchObject({
      slotStartsAt: new Date(reservationAt(7).slotStartsAt),
      equipment: reservationAt(7).equipment,
      slotChangedAt: currentTime,
      previousSlotStartsAt: new Date(reservationAt(6).slotStartsAt),
      previousEquipment: reservationAt(6).equipment,
      slotChangeComment: null,
    });
    expect(await db().select().from(tickets)).toHaveLength(2);
    expect(await db().select().from(printJobs)).toHaveLength(2);
    expect((await persistedTicket(occupied.id)).slotStartsAt).toEqual(
      new Date(reservationAt(1).slotStartsAt),
    );
  });

  it('assigns legacy tickets to slots without recording a reschedule history', async () => {
    const id = randomUUID();
    await insertLegacyTicket(id, 1, 4);

    const assignment = requireSuccess(
      await rescheduleTicket(
        id,
        { reservation: reservationAt(0), comment: 'Initial slot assignment.' },
        { unitOfWork, clock, slotSchedule },
      ),
    );
    expect(assignment.reprintRequired).toBe(true);
    expect(assignment.ticket.reservation).toEqual(reservationAt(0));
    expect(assignment.ticket.latestChange).toBeNull();
    expect(await persistedTicket(id)).toMatchObject({
      partySize: 4,
      slotStartsAt: new Date(reservationAt(0).slotStartsAt),
      equipment: reservationAt(0).equipment,
      slotChangedAt: null,
      previousSlotStartsAt: null,
      slotChangeComment: null,
    });
    expect(await db().select().from(printJobs)).toHaveLength(0);

    const reprint = requireSuccess(
      await reprintTicket(id, { unitOfWork, clock, tokens }),
    );
    expect(reprint.payload).toMatchObject({
      kind: 'slot',
      slotStartsAt: reservationAt(0).slotStartsAt,
    });
    expect(reprint.payload).not.toHaveProperty('partySize');
  });

  it('assigns legacy called tickets without history or automatic printing', async () => {
    const id = randomUUID();
    await insertLegacyTicket(id, 1, 4);
    await db()
      .update(tickets)
      .set({ status: 'called' })
      .where(eq(tickets.id, id));
    const before = await persistedTicket(id);

    const assignment = requireSuccess(
      await rescheduleTicket(
        id,
        {
          reservation: reservationAt(1),
          comment: 'ignored on initial assignment',
        },
        { unitOfWork, clock, slotSchedule },
      ),
    );

    expect(assignment).toMatchObject({
      reprintRequired: true,
      ticket: {
        id,
        counterKey: before.counterKey,
        number: before.number,
        idempotencyKey: before.idempotencyKey,
        requestHash: before.requestHash,
        reservation: reservationAt(1),
        state: { status: 'waiting' },
        latestChange: null,
      },
    });
    expect(await persistedTicket(id)).toMatchObject({
      id,
      number: before.number,
      publicToken: before.publicToken,
      requestHash: before.requestHash,
      status: 'waiting',
      slotStartsAt: new Date(reservationAt(1).slotStartsAt),
      equipment: reservationAt(1).equipment,
      slotChangedAt: null,
      previousSlotStartsAt: null,
      slotChangeComment: null,
    });
    expect(await db().select().from(printJobs)).toHaveLength(0);
  });

  it('serializes reschedule against issue for the same empty slot', async () => {
    const source = requireSuccess(
      await issue(
        'race-issue-source',
        'race-issue-source',
        'daily',
        reservationAt(0),
      ),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, source.id));
    const sourceBefore = await persistedTicket(source.id);
    const sourceJobsBefore = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, source.id));
    const target = reservationAt(6);
    const waitForStart = createStartBarrier(2);

    const [move, issued] = await Promise.all([
      (async () => {
        await waitForStart();
        return rescheduleTicket(
          source.id,
          { reservation: target, comment: 'move versus issue' },
          { unitOfWork, clock, slotSchedule },
        );
      })(),
      (async () => {
        await waitForStart();
        return issue('race-issue-target', 'race-issue-target', 'daily', target);
      })(),
    ]);

    expect([move.ok, issued.ok].filter(Boolean)).toHaveLength(1);
    const occupiedTarget = await db()
      .select()
      .from(tickets)
      .where(eq(tickets.slotStartsAt, new Date(target.slotStartsAt)));
    expect(
      occupiedTarget.filter(({ equipment }) => equipment === target.equipment),
    ).toHaveLength(1);
    expect((await persistedTicket(source.id)).number).toBe(sourceBefore.number);
    expect((await persistedTicket(source.id)).requestHash).toBe(
      sourceBefore.requestHash,
    );
    expect(sourceJobsBefore).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(printJobs)
        .where(eq(printJobs.ticketId, source.id)),
    ).toEqual(sourceJobsBefore);

    if (move.ok) {
      expect(issued).toMatchObject({
        ok: false,
        error: { kind: 'SlotUnavailable' },
      });
      expect(move.value).toMatchObject({
        reprintRequired: true,
        ticket: {
          id: source.id,
          reservation: target,
          latestChange: { from: reservationAt(0), to: target },
        },
      });
      expect((await persistedTicket(source.id)).slotStartsAt).toEqual(
        new Date(target.slotStartsAt),
      );
    } else {
      expect(move.error).toEqual({ kind: 'SlotUnavailable' });
      expect(issued.ok).toBe(true);
      expect(await persistedTicket(source.id)).toEqual(sourceBefore);
    }
    expect(await db().select().from(tickets)).toHaveLength(move.ok ? 1 : 2);
    expect(await db().select().from(printJobs)).toHaveLength(move.ok ? 1 : 2);
  });

  it('serializes two tickets rescheduling into the same empty slot', async () => {
    const first = requireSuccess(
      await issue(
        'race-move-first',
        'race-move-first',
        'daily',
        reservationAt(0),
      ),
    ).ticket;
    const second = requireSuccess(
      await issue(
        'race-move-second',
        'race-move-second',
        'daily',
        reservationAt(1),
      ),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, first.id));
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, second.id));
    const firstBefore = await persistedTicket(first.id);
    const secondBefore = await persistedTicket(second.id);
    const firstJobs = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, first.id));
    const secondJobs = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, second.id));
    const target = reservationAt(6);
    const waitForStart = createStartBarrier(2);

    const [firstMove, secondMove] = await Promise.all(
      [first, second].map(async ({ id }) => {
        await waitForStart();
        return rescheduleTicket(
          id,
          { reservation: target, comment: 'same target race' },
          { unitOfWork, clock, slotSchedule },
        );
      }),
    );

    expect([firstMove.ok, secondMove.ok].filter(Boolean)).toHaveLength(1);
    expect([firstMove, secondMove].filter((result) => !result.ok)).toEqual([
      { ok: false, error: { kind: 'SlotUnavailable' } },
    ]);
    const targetTickets = await db()
      .select()
      .from(tickets)
      .where(eq(tickets.slotStartsAt, new Date(target.slotStartsAt)));
    expect(
      targetTickets.filter(({ equipment }) => equipment === target.equipment),
    ).toHaveLength(1);
    expect(await db().select().from(printJobs)).toHaveLength(2);

    for (const [index, ticket] of [first, second].entries()) {
      const move = index === 0 ? firstMove : secondMove;
      const before = index === 0 ? firstBefore : secondBefore;
      const jobsBefore = index === 0 ? firstJobs : secondJobs;
      const after = await persistedTicket(ticket.id);
      expect(after.number).toBe(before.number);
      expect(after.requestHash).toBe(before.requestHash);
      expect(
        await db()
          .select()
          .from(printJobs)
          .where(eq(printJobs.ticketId, ticket.id)),
      ).toEqual(jobsBefore);
      if (move.ok) {
        expect(after.slotStartsAt).toEqual(new Date(target.slotStartsAt));
        expect(after.slotChangedAt).toEqual(currentTime);
      } else {
        expect(after).toEqual(before);
      }
    }
  });

  it('keeps a cancellation ahead of a waiting reschedule on the same ticket', async () => {
    const source = requireSuccess(
      await issue('race-cancel', 'race-cancel', 'daily', reservationAt(0)),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, source.id));
    const before = await persistedTicket(source.id);
    const jobsBefore = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, source.id));
    const gate = createTicketLockRace(source.id);
    const cancellation = cancelTicket(source.id, 'staff', {
      unitOfWork: gate.holder,
      clock,
    });
    await gate.acquired;
    const move = rescheduleTicket(
      source.id,
      { reservation: reservationAt(6), comment: 'cancel race' },
      { unitOfWork: gate.waiter, clock, slotSchedule },
    );
    await gate.requested;
    gate.release();
    const [cancelled, moved] = await Promise.all([cancellation, move]);

    expect(cancelled.ok).toBe(true);
    expect(moved).toEqual({
      ok: false,
      error: {
        kind: 'InvalidTransition',
        from: 'cancelled',
        action: 'reschedule',
      },
    });
    expect(await persistedTicket(source.id)).toMatchObject({
      id: source.id,
      number: before.number,
      requestHash: before.requestHash,
      status: 'cancelled',
      cancelReason: 'staff',
      slotStartsAt: before.slotStartsAt,
      equipment: before.equipment,
      slotChangedAt: null,
      previousSlotStartsAt: null,
      previousEquipment: null,
      slotChangeComment: null,
    });
    expect(
      await db()
        .select()
        .from(printJobs)
        .where(eq(printJobs.ticketId, source.id)),
    ).toEqual(jobsBefore);
  });

  it('keeps serving ahead of a waiting reschedule on the same ticket', async () => {
    const source = requireSuccess(
      await issue('race-serve', 'race-serve', 'daily', reservationAt(0)),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, source.id));
    const before = await persistedTicket(source.id);
    const jobsBefore = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, source.id));
    const gate = createTicketLockRace(source.id);
    const serving = serveTicket(source.id, { unitOfWork: gate.holder, clock });
    await gate.acquired;
    const move = rescheduleTicket(
      source.id,
      { reservation: reservationAt(6), comment: 'serve race' },
      { unitOfWork: gate.waiter, clock, slotSchedule },
    );
    await gate.requested;
    gate.release();
    const [served, moved] = await Promise.all([serving, move]);

    expect(served.ok).toBe(true);
    expect(moved).toEqual({
      ok: false,
      error: {
        kind: 'InvalidTransition',
        from: 'served',
        action: 'reschedule',
      },
    });
    expect(await persistedTicket(source.id)).toMatchObject({
      id: source.id,
      number: before.number,
      requestHash: before.requestHash,
      status: 'served',
      slotStartsAt: before.slotStartsAt,
      equipment: before.equipment,
      slotChangedAt: null,
      previousSlotStartsAt: null,
      previousEquipment: null,
      slotChangeComment: null,
    });
    expect(
      await db()
        .select()
        .from(printJobs)
        .where(eq(printJobs.ticketId, source.id)),
    ).toEqual(jobsBefore);
  });

  it('lets reprint commit before a racing reschedule checks queued jobs', async () => {
    const source = requireSuccess(
      await issue('race-reprint', 'race-reprint', 'daily', reservationAt(0)),
    ).ticket;
    await db()
      .update(printJobs)
      .set({ status: 'failed', updatedAt: currentTime })
      .where(eq(printJobs.ticketId, source.id));
    const before = await persistedTicket(source.id);
    const [originalJob] = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, source.id));
    if (originalJob === undefined)
      throw new Error('Missing original print job.');
    const gate = createTicketLockRace(source.id);
    const reprint = reprintTicket(source.id, {
      unitOfWork: gate.holder,
      clock,
      tokens,
    });
    await gate.acquired;
    const move = rescheduleTicket(
      source.id,
      { reservation: reservationAt(6), comment: 'reprint race' },
      { unitOfWork: gate.waiter, clock, slotSchedule },
    );
    await gate.requested;
    gate.release();
    const [printed, moved] = await Promise.all([reprint, move]);

    expect(printed.ok).toBe(true);
    expect(moved).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    expect(await persistedTicket(source.id)).toEqual(before);
    const jobs = await db()
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, source.id));
    expect(jobs).toHaveLength(2);
    expect(jobs.find(({ id }) => id === originalJob.id)).toEqual(originalJob);
    expect(jobs.filter(({ status }) => status === 'queued')).toHaveLength(1);
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
      requireSuccess(
        await issue(
          `claim-${index}`,
          `claim-${index}`,
          'daily',
          reservationAt(index),
        ),
      );
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
    requireSuccess(
      await issue(
        'skip-locked-first',
        'skip-locked-first',
        'daily',
        reservationAt(0),
      ),
    );
    requireSuccess(
      await issue(
        'skip-locked-second',
        'skip-locked-second',
        'daily',
        reservationAt(1),
      ),
    );
    await expectClaimToSkipLockedJob(2);
  });

  it('returns null without waiting when the only queued job is locked', async () => {
    requireSuccess(await issue('skip-locked-only'));
    await expectClaimToSkipLockedJob(1);
  });

  it('claims queued jobs in created_at, id order', async () => {
    for (let index = 0; index < 8; index += 1)
      requireSuccess(
        await issue(
          `fifo-${index}`,
          `fifo-${index}`,
          'daily',
          reservationAt(index),
        ),
      );
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
    const reservation = {
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Beyond2',
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(reservation))
      .digest('hex');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await db().execute(
        sql.raw(
          "ALTER TABLE tickets ADD CONSTRAINT r45_sensitive_log_test CHECK (equipment IS DISTINCT FROM 'Beyond2')",
        ),
      );
      const app = createApp({
        config: {
          databaseUrl: 'postgres://test/test',
          adminToken: 'a'.repeat(32),
          agentToken: 'b'.repeat(32),
          authMode: 'legacy-single',
          eventEndAt: new Date('2026-11-04T05:00:00.000Z'),
          numberScope: 'daily',
          slotSchedule,
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
        body: JSON.stringify(reservation),
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
