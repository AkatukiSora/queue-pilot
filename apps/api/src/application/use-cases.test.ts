import { describe, expect, it } from 'vitest';
import { createApplicationFakes } from '../../test/fakes/application-fakes.ts';
import type { PrintJob, Ticket } from './ports.ts';
import {
  callTicket,
  cancelTicket,
  claimPrintJob,
  getPublicTicket,
  getQueue,
  issueTicket,
  recallTicket,
  reportPrintResult,
  reprintTicket,
  serveTicket,
} from './use-cases.ts';

const request = { idempotencyKey: 'key-1', requestHash: 'hash-1' };

function success<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok)
    throw new Error(
      `Expected success, received ${JSON.stringify(result.error)}`,
    );
  return result.value;
}

function ticketById(
  fakes: ReturnType<typeof createApplicationFakes>,
  id: string,
): Ticket {
  const ticket = fakes.getState().tickets.find((item) => item.id === id);
  if (ticket === undefined) throw new Error(`Missing ticket ${id}`);
  return ticket;
}

function jobById(
  fakes: ReturnType<typeof createApplicationFakes>,
  id: string,
): PrintJob {
  const job = fakes.getState().printJobs.find((item) => item.id === id);
  if (job === undefined) throw new Error(`Missing print job ${id}`);
  return job;
}

function dependencies(fakes: ReturnType<typeof createApplicationFakes>) {
  return {
    unitOfWork: fakes.unitOfWork,
    clock: fakes.clock,
    tokens: fakes.tokens,
    numberScope: 'daily' as const,
  };
}

describe('IssueTicket', () => {
  it('creates a waiting ticket and queued print job atomically, then replays idempotently', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));

    expect(issued.replayed).toBe(false);
    expect(issued.ticket.number).toBe(1);
    expect(issued.ticket.partySize).toBe(1);
    expect(issued.ticket.counterKey).toBe('2026-11-02');
    expect(issued.ticket.state).toEqual({ status: 'waiting' });
    expect(fakes.getState().printJobs).toHaveLength(1);
    expect(fakes.getState().printJobs[0]).toMatchObject({
      ticketId: issued.ticket.id,
      status: 'queued',
      payload: {
        ticketNumber: 1,
        partySize: 1,
        publicToken: issued.ticket.publicToken,
      },
    });

    const replay = success(await issueTicket(request, dependencies(fakes)));
    expect(replay).toEqual({ ticket: issued.ticket, replayed: true });
    expect(fakes.getState().tickets).toHaveLength(1);
    expect(fakes.getState().printJobs).toHaveLength(1);
    expect(fakes.getState().nextNumbers['2026-11-02']).toBe(1);

    expect(
      await issueTicket(
        { ...request, requestHash: 'different-payload' },
        dependencies(fakes),
      ),
    ).toEqual({ ok: false, error: { kind: 'IdempotencyKeyReuse' } });
    expect(fakes.getState().tickets).toHaveLength(1);
  });

  it('re-reads exactly once after DuplicateIdempotencyKey and returns the winner', async () => {
    const fakes = createApplicationFakes();
    const winner: Ticket = {
      id: 'winner-ticket',
      counterKey: '2026-11-02',
      number: 1,
      partySize: 2,
      publicToken: 'BBBBBBBBBBBBBBBBBBBBBB' as Ticket['publicToken'],
      idempotencyKey: request.idempotencyKey,
      requestHash: request.requestHash,
      state: { status: 'waiting' },
      issuedAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T12:00:00.000Z'),
    };
    const winnerJob: PrintJob = {
      id: 'winner-job',
      ticketId: winner.id,
      status: 'queued',
      createdAt: winner.issuedAt,
      updatedAt: winner.issuedAt,
      attempt: 0,
      leaseToken: null,
      leaseExpiresAt: null,
      reprintOf: null,
      payload: {
        ticketNumber: winner.number,
        partySize: winner.partySize,
        publicToken: winner.publicToken,
        issuedAt: winner.issuedAt,
      },
    };
    fakes.setDuplicateWinner({ ticket: winner, printJob: winnerJob });

    const result = success(await issueTicket(request, dependencies(fakes)));
    expect(result).toEqual({ ticket: winner, replayed: true });
    expect(fakes.diagnostics.idempotencyReads).toBe(2);
    expect(fakes.getState().tickets).toEqual([winner]);
    expect(fakes.getState().printJobs).toEqual([winnerJob]);
    expect(fakes.getState().nextNumbers).toEqual({});
  });
});

describe('ticket state use cases', () => {
  it('calls, serves, recalls, and cancels using the domain transition rules', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    expect(success(await callTicket(first.id, fakes))).toMatchObject({
      state: { status: 'called' },
    });
    expect(success(await serveTicket(first.id, fakes))).toMatchObject({
      state: { status: 'served' },
    });
    expect(await recallTicket(first.id, fakes)).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from: 'served', action: 'recall' },
    });

    const second = success(
      await issueTicket(
        { idempotencyKey: 'key-2', requestHash: 'hash-2' },
        dependencies(fakes),
      ),
    ).ticket;
    success(await callTicket(second.id, fakes));
    expect(success(await recallTicket(second.id, fakes))).toMatchObject({
      state: { status: 'waiting' },
    });
    expect(
      success(await cancelTicket(second.id, 'staff', fakes)),
    ).toMatchObject({
      state: { status: 'cancelled', cancelReason: 'staff' },
    });
    expect(await callTicket(second.id, fakes)).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from: 'cancelled', action: 'call' },
    });
    expect(await callTicket('missing-ticket', fakes)).toEqual({
      ok: false,
      error: { kind: 'TicketNotFound' },
    });
    expect(ticketById(fakes, first.id).state).toEqual({ status: 'served' });
  });
});

describe('ReprintTicket', () => {
  it('creates a new job referencing the failed original without changing it or the ticket', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const original = fakes.getState().printJobs[0];
    if (original === undefined) throw new Error('Missing original print job');
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'failed',
        },
        fakes,
      ),
    );

    const ticketBefore = ticketById(fakes, issued.ticket.id);
    const failedOriginal = jobById(fakes, original.id);
    const reprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(reprint).toMatchObject({
      status: 'queued',
      ticketId: issued.ticket.id,
      reprintOf: original.id,
      payload: failedOriginal.payload,
    });
    expect(jobById(fakes, original.id)).toEqual(failedOriginal);
    expect(ticketById(fakes, issued.ticket.id)).toEqual(ticketBefore);
    expect(fakes.getState().printJobs).toHaveLength(2);
  });

  it('allows reprinting a ticket that has no print-job history', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    fakes.clearPrintJobs(issued.ticket.id);

    const reprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(reprint).toMatchObject({
      status: 'queued',
      ticketId: issued.ticket.id,
      reprintOf: null,
      payload: {
        ticketNumber: issued.ticket.number,
        partySize: issued.ticket.partySize,
        publicToken: issued.ticket.publicToken,
        issuedAt: issued.ticket.issuedAt,
      },
    });
    expect(ticketById(fakes, issued.ticket.id)).toEqual(issued.ticket);
    expect(fakes.getState().printJobs).toEqual([reprint]);
  });

  it('allows reprinting a printed job without changing its history or ticket', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    const printed = success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        fakes,
      ),
    );
    const ticketBefore = ticketById(fakes, issued.ticket.id);

    const reprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(reprint).toMatchObject({ status: 'queued', reprintOf: printed.id });
    expect(jobById(fakes, printed.id)).toEqual(printed);
    expect(ticketById(fakes, issued.ticket.id)).toEqual(ticketBefore);
  });

  it('allows reprinting an unknown job and preserves report detail', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    const unknown = success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'unknown',
          detail: '確認後に再印刷',
        },
        fakes,
      ),
    );
    const ticketBefore = ticketById(fakes, issued.ticket.id);

    const reprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(unknown.detail).toBe('確認後に再印刷');
    expect(reprint).toMatchObject({ status: 'queued', reprintOf: unknown.id });
    expect(jobById(fakes, unknown.id)).toEqual(unknown);
    expect(ticketById(fakes, issued.ticket.id)).toEqual(ticketBefore);
  });

  it('rejects reprinting while the latest job is queued or printing', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const original = fakes.getState().printJobs[0];
    if (original === undefined) throw new Error('Missing original print job');
    const ticketBefore = ticketById(fakes, issued.ticket.id);

    expect(await reprintTicket(issued.ticket.id, fakes)).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    expect(jobById(fakes, original.id)).toEqual(original);

    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    expect(await reprintTicket(issued.ticket.id, fakes)).toEqual({
      ok: false,
      error: { kind: 'PrintJobNotReprintable' },
    });
    expect(jobById(fakes, original.id)).toEqual(claimed);
    expect(ticketById(fakes, issued.ticket.id)).toEqual(ticketBefore);
    expect(fakes.getState().printJobs).toHaveLength(1);
  });

  it('uses createdAt then id to choose the latest job on a timestamp tie', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const original = success(await claimPrintJob(fakes));
    if (original === null) throw new Error('Expected a claimed print job');
    success(
      await reportPrintResult(
        {
          printJobId: original.id,
          leaseToken: original.leaseToken ?? '',
          outcome: 'failed',
        },
        fakes,
      ),
    );
    const firstReprint = success(await reprintTicket(issued.ticket.id, fakes));
    const firstReprintClaim = success(await claimPrintJob(fakes));
    if (firstReprintClaim === null)
      throw new Error('Expected the reprint job to be claimed');
    success(
      await reportPrintResult(
        {
          printJobId: firstReprintClaim.id,
          leaseToken: firstReprintClaim.leaseToken ?? '',
          outcome: 'failed',
        },
        fakes,
      ),
    );

    const secondReprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(secondReprint.reprintOf).toBe(firstReprint.id);
  });
});

describe('print-job claim and result use cases', () => {
  it('claims queued jobs in createdAt then id order', async () => {
    const fakes = createApplicationFakes();
    for (let index = 0; index < 12; index += 1) {
      await issueTicket(
        { idempotencyKey: `fifo-${index}`, requestHash: `hash-${index}` },
        dependencies(fakes),
      );
    }
    const expected = fakes
      .getState()
      .printJobs.sort((a, b) => {
        const dateOrder = a.createdAt.getTime() - b.createdAt.getTime();
        if (dateOrder !== 0) return dateOrder;
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      })
      .map((job) => job.id);
    const claimedIds: string[] = [];

    for (let index = 0; index < expected.length; index += 1) {
      const claimed = success(await claimPrintJob(fakes));
      if (claimed === null) throw new Error('Expected a queued print job');
      claimedIds.push(claimed.id);
    }

    expect(claimedIds).toEqual(expected);
  });

  it('turns an expired printing lease into unknown without re-queueing it', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    expect(claimed.status).toBe('printing');
    expect(claimed.leaseExpiresAt?.getTime()).toBe(
      claimed.updatedAt.getTime() + 60_000,
    );

    const leaseExpiresAt = claimed.leaseExpiresAt;
    if (leaseExpiresAt === null) throw new Error('Expected a lease expiry');
    fakes.setNow(new Date(leaseExpiresAt.getTime() + 1));
    expect(success(await claimPrintJob(fakes))).toBeNull();
    expect(jobById(fakes, claimed.id)).toMatchObject({
      status: 'unknown',
      leaseToken: null,
      leaseExpiresAt: null,
    });
    expect(
      fakes.getState().printJobs.filter((job) => job.status === 'queued'),
    ).toHaveLength(0);
    expect(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        fakes,
      ),
    ).toEqual({ ok: false, error: { kind: 'LeaseMismatch' } });
    expect(ticketById(fakes, issued.ticket.id).state.status).toBe('waiting');
  });

  it('rejects a mismatched lease token without mutating the job', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');

    expect(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: 'wrong-lease',
          outcome: 'printed',
        },
        fakes,
      ),
    ).toEqual({ ok: false, error: { kind: 'LeaseMismatch' } });
    expect(jobById(fakes, claimed.id)).toEqual(claimed);

    expect(
      success(
        await reportPrintResult(
          {
            printJobId: claimed.id,
            leaseToken: claimed.leaseToken ?? '',
            outcome: 'printed',
          },
          fakes,
        ),
      ).status,
    ).toBe('printed');
    expect(ticketById(fakes, issued.ticket.id).state.status).toBe('waiting');
  });
});

describe('queue and public ticket queries', () => {
  it('returns queue ordering, latest failed print job, counts, and public positions', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    const second = success(
      await issueTicket(
        { idempotencyKey: 'key-2', requestHash: 'hash-2' },
        dependencies(fakes),
      ),
    ).ticket;
    const third = success(
      await issueTicket(
        { idempotencyKey: 'key-3', requestHash: 'hash-3' },
        dependencies(fakes),
      ),
    ).ticket;
    success(await callTicket(first.id, fakes));
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'failed',
        },
        fakes,
      ),
    );

    const queue = success(await getQueue(fakes.unitOfWork));
    expect(queue.waiting.map((ticket) => ticket.id)).toEqual([
      second.id,
      third.id,
    ]);
    expect(queue.called.map((ticket) => ticket.id)).toEqual([first.id]);
    expect(queue.statusCounts).toEqual({
      waiting: 2,
      called: 1,
      served: 0,
      cancelled: 0,
    });
    expect(queue.latestCalledNumber).toBe(first.number);
    expect(queue.printNeedsAttention.map(({ ticket }) => ticket.id)).toEqual([
      first.id,
    ]);

    const publicView = success(
      await getPublicTicket(
        third.publicToken,
        new Date('2026-11-03T00:00:00.000Z'),
        fakes,
      ),
    );
    expect(publicView).toEqual({
      number: third.number,
      status: 'waiting',
      aheadInQueue: 1,
      latestCalledNumber: first.number,
    });
    expect(
      await getPublicTicket(
        'not-a-valid-token',
        new Date('2026-11-01T00:00:00.000Z'),
        fakes,
      ),
    ).toEqual({ ok: false, error: { kind: 'TicketNotFound' } });
    expect(
      await getPublicTicket(
        'BBBBBBBBBBBBBBBBBBBBBB',
        new Date('2026-11-01T00:00:00.000Z'),
        fakes,
      ),
    ).toEqual({ ok: false, error: { kind: 'TicketNotFound' } });
    expect(
      await getPublicTicket(
        first.publicToken,
        new Date('2026-11-02T11:59:59.000Z'),
        fakes,
      ),
    ).toEqual({ ok: false, error: { kind: 'PublicTicketExpired' } });
  });

  it('uses the event counter key when numbering scope is event', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, {
        ...dependencies(fakes),
        numberScope: 'event',
      }),
    ).ticket;
    const second = success(
      await issueTicket(
        { idempotencyKey: 'event-key-2', requestHash: 'event-hash-2' },
        { ...dependencies(fakes), numberScope: 'event' },
      ),
    ).ticket;

    expect(first).toMatchObject({ counterKey: 'event', number: 1 });
    expect(second).toMatchObject({ counterKey: 'event', number: 2 });
    expect(fakes.getState().nextNumbers).toEqual({ event: 2 });
  });

  it('shows cancelled tickets through the public lookup', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    success(await cancelTicket(issued.ticket.id, 'staff', fakes));

    expect(
      success(
        await getPublicTicket(
          issued.ticket.publicToken,
          new Date('2026-11-03T00:00:00.000Z'),
          fakes,
        ),
      ).status,
    ).toBe('cancelled');
  });
});
