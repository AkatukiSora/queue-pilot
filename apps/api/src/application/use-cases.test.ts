import { describe, expect, it } from 'vitest';
import { createApplicationFakes } from '../../test/fakes/application-fakes.ts';
import { parseSlotSchedule } from '../domain/ticket.ts';
import type { PrintJob, Ticket } from './ports.ts';
import {
  callTicket,
  cancelTicket,
  claimPrintJob,
  getPublicTicket,
  getReservations,
  issueTicket,
  recallTicket,
  releaseTicket,
  reportPrintResult,
  reprintTicket,
  rescheduleTicket,
  restoreTicket,
  serveTicket,
  undoGuidanceTicket,
} from './use-cases.ts';

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

const request = {
  idempotencyKey: 'key-1',
  requestHash: 'hash-1',
  reservation: reservationAt(0),
};

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
    slotSchedule,
  };
}

describe('IssueTicket', () => {
  it('creates a waiting ticket and queued print job atomically, then replays idempotently', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));

    expect(issued.replayed).toBe(false);
    expect(issued.ticket.number).toBe(1);
    expect('partySize' in issued.ticket).toBe(false);
    expect(issued.ticket.reservation).toEqual(request.reservation);
    expect(issued.ticket.counterKey).toBe('2026-11-02');
    expect(issued.ticket.state).toEqual({ status: 'waiting' });
    expect(fakes.getState().printJobs).toHaveLength(1);
    expect(fakes.getState().printJobs[0]).toMatchObject({
      ticketId: issued.ticket.id,
      status: 'queued',
      payload: {
        kind: 'slot',
        ticketNumber: 1,
        slotStartsAt: request.reservation.slotStartsAt,
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
      reservation: { kind: 'legacy' },
      slotReleasedAt: null,
      state: { status: 'waiting' },
      issuedAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T12:00:00.000Z'),
      latestChange: null,
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
      outputKind: null,
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
  it('keeps slot tickets out of call/recall while preserving legacy transitions', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    expect(await callTicket(first.id, fakes)).toEqual({
      ok: false,
      error: { kind: 'InvalidTransition', from: 'waiting', action: 'call' },
    });
    expect(success(await serveTicket(first.id, fakes))).toMatchObject({
      state: { status: 'served' },
    });

    const second = success(
      await issueTicket(
        {
          idempotencyKey: 'key-2',
          requestHash: 'hash-2',
          reservation: reservationAt(1),
        },
        dependencies(fakes),
      ),
    ).ticket;
    expect(await callTicket(second.id, fakes)).toMatchObject({
      ok: false,
      error: { kind: 'InvalidTransition', action: 'call' },
    });
    expect(
      success(await cancelTicket(second.id, 'staff', fakes)),
    ).toMatchObject({
      state: { status: 'cancelled', cancelReason: 'staff' },
    });

    const legacy: Ticket = {
      id: 'legacy-ticket',
      counterKey: '2026-11-02',
      number: 3,
      partySize: 2,
      publicToken: 'CCCCCCCCCCCCCCCCCCCCCC' as Ticket['publicToken'],
      idempotencyKey: 'legacy-key',
      requestHash: 'legacy-hash',
      reservation: { kind: 'legacy' },
      slotReleasedAt: null,
      state: { status: 'waiting' },
      issuedAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T12:00:00.000Z'),
      latestChange: null,
    };
    fakes.seedTicket(legacy);
    const legacyWaiting = {
      ...legacy,
      id: 'legacy-waiting-direct-serve',
      number: 4,
    } satisfies Ticket;
    fakes.seedTicket(legacyWaiting);
    expect(success(await serveTicket(legacyWaiting.id, fakes)).state).toEqual({
      status: 'served',
    });
    expect(success(await callTicket(legacy.id, fakes)).state).toEqual({
      status: 'called',
    });
    expect(success(await recallTicket(legacy.id, fakes)).state).toEqual({
      status: 'waiting',
    });
    expect(success(await callTicket(legacy.id, fakes)).state).toEqual({
      status: 'called',
    });
    expect(success(await serveTicket(legacy.id, fakes)).state).toEqual({
      status: 'served',
    });
    expect(await callTicket('missing-ticket', fakes)).toEqual({
      ok: false,
      error: { kind: 'TicketNotFound' },
    });
    expect(ticketById(fakes, first.id).state).toEqual({ status: 'served' });
  });
});

describe('ReprintTicket', () => {
  it('records the reported output kind and leaves unreported jobs unset', async () => {
    const fakes = createApplicationFakes();
    const issued = success(await issueTicket(request, dependencies(fakes)));
    const queued = fakes.getState().printJobs[0];
    if (queued === undefined) throw new Error('Missing queued print job');
    expect(queued.outputKind).toBeNull();

    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job');
    const reported = success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
          outputKind: 'preview',
        },
        fakes,
      ),
    );

    expect(reported.outputKind).toBe('preview');
    expect(jobById(fakes, claimed.id).outputKind).toBe('preview');
    expect(ticketById(fakes, issued.ticket.id)).toEqual(issued.ticket);
  });

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
    if (issued.ticket.reservation.kind !== 'slot') {
      throw new Error('Expected a slot reservation.');
    }
    fakes.clearPrintJobs(issued.ticket.id);

    const reprint = success(await reprintTicket(issued.ticket.id, fakes));

    expect(reprint).toMatchObject({
      status: 'queued',
      ticketId: issued.ticket.id,
      reprintOf: null,
      payload: {
        kind: 'slot',
        ticketNumber: issued.ticket.number,
        slotStartsAt: issued.ticket.reservation.slotStartsAt,
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
        {
          idempotencyKey: `fifo-${index}`,
          requestHash: `hash-${index}`,
          reservation: reservationAt(index),
        },
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

describe('RescheduleTicket', () => {
  it('assigns an unconfigured legacy ticket without recording a change or auto-printing', async () => {
    const fakes = createApplicationFakes();
    const legacy: Ticket = {
      id: 'legacy-to-assign',
      counterKey: '2026-11-02',
      number: 7,
      partySize: 3,
      publicToken: 'DDDDDDDDDDDDDDDDDDDDDD' as Ticket['publicToken'],
      idempotencyKey: 'legacy-assign-key',
      requestHash: 'legacy-assign-hash',
      reservation: { kind: 'legacy' },
      slotReleasedAt: null,
      state: { status: 'waiting' },
      issuedAt: new Date('2026-11-02T12:00:00.000Z'),
      updatedAt: new Date('2026-11-02T12:00:00.000Z'),
      latestChange: null,
    };
    fakes.seedTicket(legacy);
    const target = reservationAt(5);

    const assigned = success(
      await rescheduleTicket(
        legacy.id,
        { reservation: target, comment: 'Initial allocation' },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );

    expect(assigned.reprintRequired).toBe(true);
    expect(assigned.ticket).toMatchObject({
      id: legacy.id,
      number: legacy.number,
      publicToken: legacy.publicToken,
      reservation: target,
      state: { status: 'waiting' },
      latestChange: null,
    });
    expect('partySize' in assigned.ticket).toBe(false);
    expect(fakes.getState().printJobs).toHaveLength(0);
  });

  it('updates only the latest change, reports reprint rules, and rolls back conflicts', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    const second = success(
      await issueTicket(
        {
          idempotencyKey: 'reschedule-second',
          requestHash: 'reschedule-second-hash',
          reservation: reservationAt(1),
        },
        dependencies(fakes),
      ),
    ).ticket;
    fakes.clearPrintJobs(first.id);
    fakes.clearPrintJobs(second.id);

    expect(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(1), comment: 'occupied' },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    ).toEqual({ ok: false, error: { kind: 'SlotUnavailable' } });
    expect(ticketById(fakes, first.id)).toEqual(first);

    const moved = success(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(6), comment: 'Move time' },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );
    expect(moved.reprintRequired).toBe(true);
    expect(moved.ticket.latestChange).toMatchObject({
      from: request.reservation,
      to: reservationAt(6),
      comment: 'Move time',
    });

    const equipmentOnly = success(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(7), comment: null },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );
    expect(equipmentOnly.reprintRequired).toBe(false);
    expect(equipmentOnly.ticket.latestChange).toMatchObject({
      from: reservationAt(6),
      to: reservationAt(7),
      comment: null,
    });
    expect(fakes.getState().printJobs).toHaveLength(0);

    const noOp = success(
      await rescheduleTicket(
        first.id,
        { reservation: reservationAt(7), comment: 'ignored' },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );
    expect(noOp.reprintRequired).toBe(false);
    expect(noOp.ticket).toEqual(equipmentOnly.ticket);
  });
});

describe('slot release and restoration', () => {
  it('releases a slot, reuses it during the recovery window, and restores onto an explicit free slot', async () => {
    const fakes = createApplicationFakes();
    const original = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    if (original.reservation.kind !== 'slot') {
      throw new Error('Expected a slot reservation.');
    }
    const originalReservation = original.reservation;
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job.');
    success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        fakes,
      ),
    );

    const released = success(
      await releaseTicket(original.id, {
        unitOfWork: fakes.unitOfWork,
        clock: fakes.clock,
      }),
    );
    expect(released).toMatchObject({
      state: { status: 'cancelled', cancelReason: 'staff' },
      reservation: originalReservation,
      slotReleasedAt: new Date('2026-11-02T12:00:00.000Z'),
    });
    expect(fakes.getState().printJobs).toEqual([
      expect.objectContaining({ id: claimed.id, status: 'printed' }),
    ]);
    expect(
      success(
        await releaseTicket(original.id, {
          unitOfWork: fakes.unitOfWork,
          clock: fakes.clock,
        }),
      ),
    ).toEqual(released);

    fakes.setNow(new Date(originalReservation.slotStartsAt));
    const releasedView = success(await getReservations(slotSchedule, fakes));
    const releasedSlot = releasedView.slots.find(
      (slot) =>
        slot.slotStartsAt === originalReservation.slotStartsAt &&
        slot.equipment === originalReservation.equipment,
    );
    expect(releasedView.releasedTickets.map((ticket) => ticket.id)).toEqual([
      original.id,
    ]);
    expect(releasedSlot).toMatchObject({ bookable: true, ticket: null });

    const replacement = success(
      await issueTicket(
        {
          idempotencyKey: 'replacement-key',
          requestHash: 'replacement-hash',
          reservation: originalReservation,
        },
        dependencies(fakes),
      ),
    );
    expect(replacement.ticket.slotReleasedAt).toBeNull();
    expect(
      await restoreTicket(
        original.id,
        {},
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    ).toEqual({ ok: false, error: { kind: 'SlotUnavailable' } });

    const target = reservationAt(4);
    const restored = success(
      await restoreTicket(
        original.id,
        { reservation: target, comment: 'Restore on another slot' },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );
    expect(restored).toMatchObject({
      reprintRequired: true,
      ticket: {
        state: { status: 'waiting' },
        reservation: target,
        slotReleasedAt: null,
        latestChange: {
          from: originalReservation,
          to: target,
          comment: 'Restore on another slot',
        },
      },
    });
    expect(
      success(await getReservations(slotSchedule, fakes)).releasedTickets,
    ).toEqual([]);
    const repeatedRestore = success(
      await restoreTicket(
        original.id,
        { reservation: target },
        { unitOfWork: fakes.unitOfWork, clock: fakes.clock, slotSchedule },
      ),
    );
    expect(repeatedRestore.ticket).toEqual(restored.ticket);
    expect(repeatedRestore.reprintRequired).toBe(true);
  });

  it('accepts a slot until 30 minutes after its start but not at the exact boundary', async () => {
    const fakes = createApplicationFakes();
    const slot = reservationAt(8);
    const issued = success(
      await issueTicket(
        {
          idempotencyKey: 'window-key',
          requestHash: 'window-hash',
          reservation: slot,
        },
        dependencies(fakes),
      ),
    ).ticket;
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job.');
    success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        fakes,
      ),
    );
    success(await releaseTicket(issued.id, fakes));

    const start = Date.parse(slot.slotStartsAt);
    fakes.setNow(new Date(start + 30 * 60_000 - 1));
    const justBeforeEnd = success(await getReservations(slotSchedule, fakes));
    expect(
      justBeforeEnd.slots.find(
        (candidate) =>
          candidate.slotStartsAt === slot.slotStartsAt &&
          candidate.equipment === slot.equipment,
      )?.bookable,
    ).toBe(true);

    fakes.setNow(new Date(start + 30 * 60_000));
    const atEnd = success(await getReservations(slotSchedule, fakes));
    expect(
      atEnd.slots.find(
        (candidate) =>
          candidate.slotStartsAt === slot.slotStartsAt &&
          candidate.equipment === slot.equipment,
      )?.bookable,
    ).toBe(false);
    expect(
      await issueTicket(
        {
          idempotencyKey: 'window-expired',
          requestHash: 'window-expired',
          reservation: slot,
        },
        dependencies(fakes),
      ),
    ).toEqual({ ok: false, error: { kind: 'SlotNotBookable' } });
  });

  it('restores served slot tickets and legacy called tickets through undo-guidance only', async () => {
    const fakes = createApplicationFakes();
    const served = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    const claimed = success(await claimPrintJob(fakes));
    if (claimed === null) throw new Error('Expected a claimed print job.');
    success(
      await reportPrintResult(
        {
          printJobId: claimed.id,
          leaseToken: claimed.leaseToken ?? '',
          outcome: 'printed',
        },
        fakes,
      ),
    );
    success(await serveTicket(served.id, fakes));
    success(await releaseTicket(served.id, fakes));
    expect(
      await restoreTicket(
        served.id,
        {},
        {
          unitOfWork: fakes.unitOfWork,
          clock: fakes.clock,
          slotSchedule,
        },
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidTransition' } });
    const restoredSlot = success(
      await undoGuidanceTicket(
        served.id,
        {},
        {
          unitOfWork: fakes.unitOfWork,
          clock: fakes.clock,
          slotSchedule,
        },
      ),
    );
    expect(restoredSlot.ticket).toMatchObject({
      state: { status: 'waiting' },
      slotReleasedAt: null,
      reservation: served.reservation,
    });

    const legacy: Ticket = {
      ...served,
      id: 'legacy-called',
      number: 77,
      reservation: { kind: 'legacy' },
      slotReleasedAt: null,
      state: { status: 'called' },
      partySize: 2,
      latestChange: null,
    };
    fakes.seedTicket(legacy);
    const restoredLegacy = success(
      await undoGuidanceTicket(
        legacy.id,
        {},
        {
          unitOfWork: fakes.unitOfWork,
          clock: fakes.clock,
          slotSchedule,
        },
      ),
    );
    expect(restoredLegacy.ticket).toMatchObject({
      state: { status: 'waiting' },
      reservation: { kind: 'legacy' },
      partySize: 2,
    });
  });
});

describe('reservation and public ticket queries', () => {
  it('lists configured slots, surfaces print issues, and returns the public reservation', async () => {
    const fakes = createApplicationFakes();
    const first = success(
      await issueTicket(request, dependencies(fakes)),
    ).ticket;
    const second = success(
      await issueTicket(
        {
          idempotencyKey: 'key-2',
          requestHash: 'hash-2',
          reservation: reservationAt(1),
        },
        dependencies(fakes),
      ),
    ).ticket;
    const third = success(
      await issueTicket(
        {
          idempotencyKey: 'key-3',
          requestHash: 'hash-3',
          reservation: reservationAt(2),
        },
        dependencies(fakes),
      ),
    ).ticket;
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

    const reservations = success(await getReservations(slotSchedule, fakes));
    expect(reservations.slots).toHaveLength(72);
    expect(
      reservations.slots
        .filter((slot) => slot.ticket !== null)
        .map((slot) => slot.ticket?.id),
    ).toEqual([first.id, second.id, third.id]);
    expect(
      reservations.printNeedsAttention.map(({ ticket }) => ticket.id),
    ).toEqual([first.id]);

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
      reservation: third.reservation,
      slotReleasedAt: null,
      latestChange: null,
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
        {
          idempotencyKey: 'event-key-2',
          requestHash: 'event-hash-2',
          reservation: reservationAt(1),
        },
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
