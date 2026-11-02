import {
  type PrintJobStatus,
  transitionPrintJob,
} from '../domain/print-job.ts';
import type { InvalidTransition, Result } from '../domain/result.ts';
import {
  type CancelReason,
  compareQueuePosition,
  deriveCounterKey,
  parsePublicToken,
  type TicketAction,
  type TicketNumberScope,
  type TicketState,
  transition,
} from '../domain/ticket.ts';
import type {
  Clock,
  DuplicateIdempotencyKey,
  PrintJob,
  Ticket,
  TokenGenerator,
  UnitOfWork,
} from './ports.ts';

export type TicketNotFound = { kind: 'TicketNotFound' };
export type PrintJobNotFound = { kind: 'PrintJobNotFound' };
export type IdempotencyKeyReuse = { kind: 'IdempotencyKeyReuse' };
export type PublicTicketExpired = { kind: 'PublicTicketExpired' };
export type LeaseMismatch = { kind: 'LeaseMismatch' };
export type PrintJobNotReprintable = { kind: 'PrintJobNotReprintable' };

export type IssueTicketError = IdempotencyKeyReuse | DuplicateIdempotencyKey;
export type TicketStateError = TicketNotFound | InvalidTransition;
export type ReprintTicketError = TicketNotFound | PrintJobNotReprintable;
export type PublicTicketError = TicketNotFound | PublicTicketExpired;
export type ReportPrintResultError =
  | PrintJobNotFound
  | LeaseMismatch
  | InvalidTransition;

export type IssueTicketInput = {
  idempotencyKey: string;
  requestHash: string;
  partySize?: number;
};

export type IssueTicketOutput = {
  ticket: Ticket;
  replayed: boolean;
};

export async function issueTicket(
  input: IssueTicketInput,
  dependencies: {
    unitOfWork: UnitOfWork;
    clock: Clock;
    tokens: TokenGenerator;
    numberScope: TicketNumberScope;
  },
): Promise<Result<IssueTicketOutput, IssueTicketError>> {
  const partySize = input.partySize ?? 1;
  const created = await dependencies.unitOfWork.run<
    IssueTicketOutput,
    IssueTicketError
  >(async (repositories) => {
    const existing = await repositories.tickets.findTicketByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing !== null) {
      if (existing.requestHash !== input.requestHash) {
        return { ok: false, error: { kind: 'IdempotencyKeyReuse' } };
      }
      return { ok: true, value: { ticket: existing, replayed: true } };
    }

    const issuedAt = dependencies.clock.now();
    const counterKey = deriveCounterKey(dependencies.numberScope, issuedAt);
    const number = await repositories.tickets.allocateNextNumber(counterKey);
    const ticket: Ticket = {
      id: dependencies.tokens.ticketId(),
      counterKey,
      number,
      partySize,
      publicToken: dependencies.tokens.publicToken(),
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      state: { status: 'waiting' },
      issuedAt,
      updatedAt: issuedAt,
    };
    const printJob: PrintJob = {
      id: dependencies.tokens.printJobId(),
      ticketId: ticket.id,
      status: 'queued',
      createdAt: issuedAt,
      updatedAt: issuedAt,
      attempt: 0,
      leaseToken: null,
      leaseExpiresAt: null,
      reprintOf: null,
      payload: {
        ticketNumber: ticket.number,
        partySize: ticket.partySize,
        publicToken: ticket.publicToken,
        issuedAt: ticket.issuedAt,
      },
    };
    const inserted = await repositories.tickets.createIssuedTicket(
      ticket,
      printJob,
    );
    if (!inserted.ok) return inserted;
    return { ok: true, value: { ticket, replayed: false } };
  });

  if (created.ok || created.error.kind !== 'DuplicateIdempotencyKey') {
    return created;
  }

  const reread = await dependencies.unitOfWork.run<Ticket | null, never>(
    async (repositories) => ({
      ok: true,
      value: await repositories.tickets.findTicketByIdempotencyKey(
        input.idempotencyKey,
      ),
    }),
  );
  if (!reread.ok) return reread;
  if (reread.value === null) return created;
  if (reread.value.requestHash !== input.requestHash) {
    return { ok: false, error: { kind: 'IdempotencyKeyReuse' } };
  }
  return { ok: true, value: { ticket: reread.value, replayed: true } };
}

async function changeTicketState(
  ticketId: string,
  action: TicketAction,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return dependencies.unitOfWork.run<Ticket, TicketStateError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }

      const changed = transition(ticket.state, action);
      if (!changed.ok) return changed;

      const updated: Ticket = {
        ...ticket,
        state: changed.value,
        updatedAt: dependencies.clock.now(),
      };
      await repositories.tickets.updateTicket(updated);
      return { ok: true, value: updated };
    },
  );
}

export function callTicket(
  ticketId: string,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'call' }, dependencies);
}

export function serveTicket(
  ticketId: string,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'serve' }, dependencies);
}

export function recallTicket(
  ticketId: string,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'recall' }, dependencies);
}

export function cancelTicket(
  ticketId: string,
  reason: CancelReason,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'cancel', reason }, dependencies);
}

export type QueueView = {
  waiting: Ticket[];
  called: Ticket[];
  statusCounts: Record<TicketState['status'], number>;
  printNeedsAttention: Array<{ ticket: Ticket; job: PrintJob }>;
  latestCalledNumber: number | null;
};

export async function getQueue(
  unitOfWork: UnitOfWork,
): Promise<Result<QueueView, never>> {
  return unitOfWork.run<QueueView, never>(async (repositories) => {
    const tickets = await repositories.tickets.listTickets();
    const jobs = await repositories.printJobs.listPrintJobs();
    const waiting = tickets
      .filter((ticket) => ticket.state.status === 'waiting')
      .sort((a, b) => compareQueuePosition(a, b));
    const called = tickets
      .filter((ticket) => ticket.state.status === 'called')
      .sort((a, b) => compareQueuePosition(a, b));
    const statusCounts: QueueView['statusCounts'] = {
      waiting: 0,
      called: 0,
      served: 0,
      cancelled: 0,
    };
    for (const ticket of tickets) statusCounts[ticket.state.status] += 1;

    const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    const latestJobByTicket = new Map<string, PrintJob>();
    for (const job of jobs) {
      const latest = latestJobByTicket.get(job.ticketId);
      if (
        latest === undefined ||
        job.createdAt.getTime() > latest.createdAt.getTime() ||
        (job.createdAt.getTime() === latest.createdAt.getTime() &&
          job.id > latest.id)
      ) {
        latestJobByTicket.set(job.ticketId, job);
      }
    }
    const printNeedsAttention: QueueView['printNeedsAttention'] = [];
    for (const [ticketId, job] of latestJobByTicket) {
      const ticket = ticketById.get(ticketId);
      if (
        ticket !== undefined &&
        (job.status === 'failed' || job.status === 'unknown')
      ) {
        printNeedsAttention.push({ ticket, job });
      }
    }
    printNeedsAttention.sort((a, b) =>
      compareQueuePosition(a.ticket, b.ticket),
    );

    return {
      ok: true,
      value: {
        waiting,
        called,
        statusCounts,
        printNeedsAttention,
        latestCalledNumber: called.at(-1)?.number ?? null,
      },
    };
  });
}

export type PublicTicketView = {
  number: number;
  status: TicketState['status'];
  aheadInQueue: number;
  latestCalledNumber: number | null;
};

export async function getPublicTicket(
  token: string,
  eventEndAt: Date,
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<PublicTicketView, PublicTicketError>> {
  const parsedToken = parsePublicToken(token);
  if (!parsedToken.ok) {
    return { ok: false, error: { kind: 'TicketNotFound' } };
  }

  return dependencies.unitOfWork.run<PublicTicketView, PublicTicketError>(
    async (repositories) => {
      const ticket = await repositories.tickets.findTicketByPublicToken(
        parsedToken.value,
      );
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      if (dependencies.clock.now().getTime() > eventEndAt.getTime()) {
        return { ok: false, error: { kind: 'PublicTicketExpired' } };
      }
      const tickets = await repositories.tickets.listTickets();
      const waitingBefore = tickets.filter(
        (candidate) =>
          candidate.state.status === 'waiting' &&
          compareQueuePosition(candidate, ticket) < 0,
      ).length;
      const latestCalledNumber = tickets
        .filter((candidate) => candidate.state.status === 'called')
        .sort((a, b) => compareQueuePosition(a, b))
        .at(-1)?.number;

      return {
        ok: true,
        value: {
          number: ticket.number,
          status: ticket.state.status,
          aheadInQueue: waitingBefore,
          latestCalledNumber: latestCalledNumber ?? null,
        },
      };
    },
  );
}

export async function reprintTicket(
  ticketId: string,
  dependencies: {
    unitOfWork: UnitOfWork;
    clock: Clock;
    tokens: TokenGenerator;
  },
): Promise<Result<PrintJob, ReprintTicketError>> {
  return dependencies.unitOfWork.run<PrintJob, ReprintTicketError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      const jobs =
        await repositories.printJobs.listPrintJobsForTicket(ticketId);
      const latest = jobs
        .sort((a, b) => {
          const dateOrder = a.createdAt.getTime() - b.createdAt.getTime();
          if (dateOrder !== 0) return dateOrder;
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        })
        .at(-1);
      if (
        latest !== undefined &&
        (latest.status === 'queued' || latest.status === 'printing')
      ) {
        return { ok: false, error: { kind: 'PrintJobNotReprintable' } };
      }

      const now = dependencies.clock.now();
      const job: PrintJob = {
        id: dependencies.tokens.printJobId(),
        ticketId: ticket.id,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        attempt: 0,
        leaseToken: null,
        leaseExpiresAt: null,
        reprintOf: latest?.id ?? null,
        payload: latest?.payload ?? {
          ticketNumber: ticket.number,
          partySize: ticket.partySize,
          publicToken: ticket.publicToken,
          issuedAt: ticket.issuedAt,
        },
      };
      await repositories.printJobs.createReprintJob(job);
      return { ok: true, value: job };
    },
  );
}

export async function claimPrintJob(dependencies: {
  unitOfWork: UnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
}): Promise<Result<PrintJob | null, never>> {
  const now = dependencies.clock.now();
  const leaseExpiresAt = new Date(now.getTime() + 60_000);
  const leaseToken = dependencies.tokens.leaseToken();
  return dependencies.unitOfWork.run<PrintJob | null, never>(
    async (repositories) => {
      await repositories.printJobs.expireLeasesBefore(now);
      const job = await repositories.printJobs.claimNextQueuedJob(
        now,
        leaseExpiresAt,
        leaseToken,
      );
      return { ok: true, value: job };
    },
  );
}

export type PrintResultOutcome = Extract<
  PrintJobStatus,
  'printed' | 'failed' | 'unknown'
>;

export async function reportPrintResult(
  input: {
    printJobId: string;
    leaseToken: string;
    outcome: PrintResultOutcome;
    detail?: string;
  },
  dependencies: { unitOfWork: UnitOfWork; clock: Clock },
): Promise<Result<PrintJob, ReportPrintResultError>> {
  return dependencies.unitOfWork.run<PrintJob, ReportPrintResultError>(
    async (repositories) => {
      const job = await repositories.printJobs.findPrintJobByIdForUpdate(
        input.printJobId,
      );
      if (job === null) {
        return { ok: false, error: { kind: 'PrintJobNotFound' } };
      }
      if (job.status !== 'printing' || job.leaseToken !== input.leaseToken) {
        return { ok: false, error: { kind: 'LeaseMismatch' } };
      }

      const changed = transitionPrintJob(job.status, input.outcome);
      if (!changed.ok) return changed;
      const updated: PrintJob = {
        ...job,
        status: changed.value,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: dependencies.clock.now(),
        ...(input.detail === undefined ? {} : { detail: input.detail }),
      };
      await repositories.printJobs.updatePrintJob(updated);
      return { ok: true, value: updated };
    },
  );
}
