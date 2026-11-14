import {
  type PrintJobStatus,
  transitionPrintJob,
} from '../domain/print-job.ts';
import type { InvalidTransition, Result } from '../domain/result.ts';
import {
  type CancelReason,
  compareQueuePosition,
  deriveCounterKey,
  type LegacyReservation,
  parsePublicToken,
  type ScheduledTicketState,
  type Slot,
  type SlotReservation,
  type TicketAction,
  type TicketNumberScope,
  type TicketState,
  transition,
} from '../domain/ticket.ts';
import type {
  Clock,
  DuplicateIdempotencyKey,
  PrintJob,
  PrintOutputKind,
  PrintPayload,
  ScopedUnitOfWork,
  SlotUnavailable,
  Ticket,
  TokenGenerator,
} from './ports.ts';

export type TicketNotFound = { kind: 'TicketNotFound' };
export type PrintJobNotFound = { kind: 'PrintJobNotFound' };
export type IdempotencyKeyReuse = { kind: 'IdempotencyKeyReuse' };
export type PublicTicketExpired = { kind: 'PublicTicketExpired' };
export type LeaseMismatch = { kind: 'LeaseMismatch' };
export type PrintJobNotReprintable = { kind: 'PrintJobNotReprintable' };
export type SlotNotConfigured = { kind: 'SlotNotConfigured' };
export type SlotNotBookable = { kind: 'SlotNotBookable' };

export type IssueTicketError =
  | IdempotencyKeyReuse
  | DuplicateIdempotencyKey
  | SlotUnavailable
  | SlotNotConfigured
  | SlotNotBookable;
export type TicketStateError =
  | TicketNotFound
  | InvalidTransition
  | SlotUnavailable;
export type RescheduleTicketError =
  | TicketNotFound
  | InvalidTransition
  | SlotUnavailable
  | SlotNotConfigured
  | SlotNotBookable
  | PrintJobNotReprintable;
export type ReprintTicketError =
  | TicketNotFound
  | PrintJobNotReprintable
  | InvalidTransition;
export type PublicTicketError = TicketNotFound | PublicTicketExpired;
export type ReportPrintResultError =
  | PrintJobNotFound
  | LeaseMismatch
  | InvalidTransition;

type SlotCoordinates = Pick<SlotReservation, 'slotStartsAt' | 'equipment'>;

function sameSlot(a: SlotCoordinates, b: SlotCoordinates): boolean {
  return a.slotStartsAt === b.slotStartsAt && a.equipment === b.equipment;
}

function isSlotTimeBookable(slot: Slot, now: Date): boolean {
  return (
    now.getTime() <
    Date.parse(slot.slotStartsAt) + (slot.intervalMinutes ?? 30) * 60_000
  );
}

function isSlotOccupied(
  slot: SlotCoordinates,
  tickets: readonly Ticket[],
  exceptTicketId?: string,
): boolean {
  return tickets.some(
    (ticket) =>
      ticket.id !== exceptTicketId &&
      ticket.reservation.kind === 'slot' &&
      sameSlot(ticket.reservation, slot) &&
      ticket.slotReleasedAt === null,
  );
}

function ticketPrintPayload(
  ticket: Ticket,
  version2?: {
    timeZone: string;
    publicBaseURL: string;
    copy: { receiptTitle: string; arrivalGuidance: string };
  },
): PrintPayload {
  if (version2 === undefined) {
    return 'partySize' in ticket
      ? {
          ticketNumber: ticket.number,
          partySize: ticket.partySize,
          publicToken: ticket.publicToken,
          issuedAt: ticket.issuedAt,
        }
      : {
          kind: 'slot',
          ticketNumber: ticket.number,
          slotStartsAt: ticket.reservation.slotStartsAt,
          publicToken: ticket.publicToken,
          issuedAt: ticket.issuedAt,
        };
  }
  return {
    schemaVersion: 2,
    ticketNumber: ticket.number,
    reservation:
      ticket.reservation.kind === 'slot'
        ? { kind: 'slot', startsAt: ticket.reservation.slotStartsAt }
        : { kind: 'legacy' },
    issuedAt: ticket.issuedAt,
    timeZone: version2.timeZone,
    publicURL: new URL(
      `/ticket/${ticket.publicToken}`,
      version2.publicBaseURL,
    ).toString(),
    copy: version2.copy,
  };
}

type TicketPrintConfig = {
  timeZone: string;
  publicBaseURL: string;
  copy: { receiptTitle: string; arrivalGuidance: string };
};

export type IssueTicketInput = {
  idempotencyKey: string;
  requestHash: string;
  reservation: SlotReservation;
};

export type IssueTicketOutput = {
  ticket: Ticket;
  replayed: boolean;
};

export async function issueTicket(
  input: IssueTicketInput,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    tokens: TokenGenerator;
    numberScope: TicketNumberScope;
    timeZone?: string;
    version2Print?: TicketPrintConfig;
    slotSchedule: readonly Slot[];
  },
): Promise<Result<IssueTicketOutput, IssueTicketError>> {
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

    const configuredSlot = dependencies.slotSchedule.find(
      (slot) =>
        slot.slotStartsAt === input.reservation.slotStartsAt &&
        slot.equipment === input.reservation.equipment,
    );
    if (configuredSlot === undefined) {
      return { ok: false, error: { kind: 'SlotNotConfigured' } };
    }
    const issuedAt = dependencies.clock.now();
    const tickets = await repositories.tickets.listTickets();
    if (!isSlotTimeBookable(configuredSlot, issuedAt)) {
      return { ok: false, error: { kind: 'SlotNotBookable' } };
    }

    const counterKey = deriveCounterKey(
      dependencies.numberScope,
      issuedAt,
      dependencies.timeZone,
    );
    const number = await repositories.tickets.allocateNextNumber(counterKey);
    const ticket: Ticket = {
      id: dependencies.tokens.ticketId(),
      counterKey,
      number,
      publicToken: dependencies.tokens.publicToken(),
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      reservation: input.reservation,
      slotReleasedAt: null,
      state: { status: 'waiting' },
      issuedAt,
      updatedAt: issuedAt,
      latestChange: null,
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
      payload: ticketPrintPayload(ticket, dependencies.version2Print),
      outputKind: null,
    };
    const inserted = await repositories.tickets.createIssuedTicket(
      ticket,
      printJob,
    );
    if (!inserted.ok) return inserted;
    return { ok: true, value: { ticket, replayed: false } };
  });

  if (
    created.ok ||
    (created.error.kind !== 'DuplicateIdempotencyKey' &&
      created.error.kind !== 'SlotUnavailable')
  ) {
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
  if (!reread.ok || reread.value === null) return created;
  if (reread.value.requestHash !== input.requestHash) {
    return { ok: false, error: { kind: 'IdempotencyKeyReuse' } };
  }
  return { ok: true, value: { ticket: reread.value, replayed: true } };
}

async function changeTicketState(
  ticketId: string,
  action: TicketAction,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return dependencies.unitOfWork.run<Ticket, TicketStateError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }

      let updated: Ticket;
      const changedAt = dependencies.clock.now();
      if (!('partySize' in ticket)) {
        const invalidTransition: InvalidTransition = {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: action.type,
        };
        if (
          ticket.slotReleasedAt !== null ||
          ticket.state.status !== 'waiting' ||
          (action.type !== 'serve' && action.type !== 'cancel') ||
          (action.type === 'cancel' &&
            action.reason === 'no_show' &&
            changedAt.getTime() < Date.parse(ticket.reservation.slotStartsAt))
        ) {
          return { ok: false, error: invalidTransition };
        }
        const state: ScheduledTicketState =
          action.type === 'serve'
            ? { status: 'served' }
            : { status: 'cancelled', cancelReason: action.reason };
        updated = { ...ticket, state, updatedAt: changedAt };
      } else {
        const changed = transition(ticket.state, action);
        if (!changed.ok) return changed;
        updated = { ...ticket, state: changed.value, updatedAt: changedAt };
      }
      const persisted = await repositories.tickets.updateTicket(updated);
      if (!persisted.ok) return persisted;
      return { ok: true, value: updated };
    },
  );
}

export function callTicket(
  ticketId: string,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'call' }, dependencies);
}

export function serveTicket(
  ticketId: string,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'serve' }, dependencies);
}

export function recallTicket(
  ticketId: string,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'recall' }, dependencies);
}

export function cancelTicket(
  ticketId: string,
  reason: CancelReason,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, TicketStateError>> {
  return changeTicketState(ticketId, { type: 'cancel', reason }, dependencies);
}

export type RescheduleTicketInput = {
  reservation: SlotReservation;
  comment: string | null;
};
export type RescheduleTicketOutput = {
  ticket: Ticket;
  reprintRequired: boolean;
};

export type RestoreTicketInput = {
  reservation?: SlotReservation;
  comment?: string | null;
};
export type RestoreTicketError =
  | TicketNotFound
  | InvalidTransition
  | SlotUnavailable
  | SlotNotConfigured
  | PrintJobNotReprintable;
export type RestoreTicketOutput = RescheduleTicketOutput;
export type ReleaseTicketError =
  | TicketNotFound
  | InvalidTransition
  | SlotUnavailable
  | PrintJobNotReprintable;

export async function releaseTicket(
  ticketId: string,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<Ticket, ReleaseTicketError>> {
  return dependencies.unitOfWork.run<Ticket, ReleaseTicketError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      if (ticket.slotReleasedAt !== null) {
        return { ok: true, value: ticket };
      }
      if ('partySize' in ticket) {
        return {
          ok: false,
          error: {
            kind: 'InvalidTransition',
            from: ticket.state.status,
            action: 'release',
          },
        };
      }
      const jobs =
        await repositories.printJobs.listPrintJobsForTicket(ticketId);
      if (
        jobs.some((job) => job.status === 'queued' || job.status === 'printing')
      ) {
        return { ok: false, error: { kind: 'PrintJobNotReprintable' } };
      }
      const now = dependencies.clock.now();
      let updated: Ticket;
      switch (ticket.state.status) {
        case 'waiting':
          updated = {
            ...ticket,
            state: { status: 'cancelled', cancelReason: 'staff' },
            slotReleasedAt: now,
            updatedAt: now,
          };
          break;
        case 'served':
          updated = {
            ...ticket,
            state: { status: 'served' },
            slotReleasedAt: now,
            updatedAt: now,
          };
          break;
        case 'cancelled':
          updated = {
            ...ticket,
            state: {
              status: 'cancelled',
              cancelReason: ticket.state.cancelReason,
            },
            slotReleasedAt: now,
            updatedAt: now,
          };
          break;
      }
      const persisted = await repositories.tickets.updateTicket(updated);
      if (!persisted.ok) return persisted;
      return { ok: true, value: updated };
    },
  );
}

async function applyTicketRestoration(
  ticketId: string,
  mode: 'restore' | 'undo-guidance',
  input: RestoreTicketInput,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    slotSchedule: readonly Slot[];
  },
): Promise<Result<RestoreTicketOutput, RestoreTicketError>> {
  return dependencies.unitOfWork.run<RestoreTicketOutput, RestoreTicketError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      const invalid = (): Result<RestoreTicketOutput, RestoreTicketError> => ({
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: mode,
        },
      });
      if (ticket.state.status === 'waiting') {
        if (
          input.reservation === undefined ||
          (ticket.reservation.kind === 'slot' &&
            sameSlot(ticket.reservation, input.reservation))
        ) {
          return {
            ok: true,
            value: { ticket, reprintRequired: false },
          };
        }
        return invalid();
      }
      const eligible =
        mode === 'restore'
          ? ticket.state.status === 'cancelled'
          : ticket.reservation.kind === 'legacy'
            ? ticket.state.status === 'called' ||
              ticket.state.status === 'served'
            : ticket.state.status === 'served';
      if (!eligible) return invalid();

      let releasedTarget: SlotReservation | undefined;
      if (ticket.reservation.kind === 'legacy') {
        if (input.reservation !== undefined) return invalid();
      } else if (ticket.slotReleasedAt === null) {
        if (
          input.reservation !== undefined &&
          !sameSlot(ticket.reservation, input.reservation)
        ) {
          return invalid();
        }
      } else {
        const target = input.reservation ?? ticket.reservation;
        releasedTarget = target;
        const configured = dependencies.slotSchedule.some((slot) =>
          sameSlot(slot, target),
        );
        if (!configured) {
          return {
            ok: false,
            error: {
              kind:
                input.reservation === undefined
                  ? 'SlotUnavailable'
                  : 'SlotNotConfigured',
            },
          };
        }
        const now = dependencies.clock.now();
        const tickets = await repositories.tickets.listTickets();
        if (
          !isSlotTimeBookable(releasedTarget, now) ||
          isSlotOccupied(releasedTarget, tickets, ticket.id)
        ) {
          return { ok: false, error: { kind: 'SlotUnavailable' } };
        }
      }

      const jobs =
        await repositories.printJobs.listPrintJobsForTicket(ticketId);
      if (
        jobs.some((job) => job.status === 'queued' || job.status === 'printing')
      ) {
        return { ok: false, error: { kind: 'PrintJobNotReprintable' } };
      }
      const now = dependencies.clock.now();
      let updated: Ticket;
      let reprintRequired = false;
      if (ticket.reservation.kind === 'legacy') {
        updated = {
          ...ticket,
          state: { status: 'waiting' },
          slotReleasedAt: null,
          updatedAt: now,
        };
      } else if (ticket.slotReleasedAt === null) {
        updated = {
          ...ticket,
          state: { status: 'waiting' },
          slotReleasedAt: null,
          updatedAt: now,
        };
      } else {
        const reservation = releasedTarget;
        if (reservation === undefined) {
          throw new Error('Released slot restoration has no target.');
        }
        const changed = !sameSlot(ticket.reservation, reservation);
        updated = {
          ...ticket,
          reservation,
          state: { status: 'waiting' },
          slotReleasedAt: null,
          updatedAt: now,
          ...(changed
            ? {
                latestChange: {
                  from: ticket.reservation,
                  to: reservation,
                  changedAt: now,
                  comment: input.comment ?? null,
                },
              }
            : {}),
        };
        reprintRequired =
          ticket.reservation.slotStartsAt !== reservation.slotStartsAt;
      }
      const persisted = await repositories.tickets.updateTicket(updated);
      if (!persisted.ok) return persisted;
      return { ok: true, value: { ticket: updated, reprintRequired } };
    },
  );
}

export function restoreTicket(
  ticketId: string,
  input: RestoreTicketInput,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    slotSchedule: readonly Slot[];
  },
): Promise<Result<RestoreTicketOutput, RestoreTicketError>> {
  return applyTicketRestoration(ticketId, 'restore', input, dependencies);
}

export function undoGuidanceTicket(
  ticketId: string,
  input: RestoreTicketInput,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    slotSchedule: readonly Slot[];
  },
): Promise<Result<RestoreTicketOutput, RestoreTicketError>> {
  return applyTicketRestoration(ticketId, 'undo-guidance', input, dependencies);
}

export async function rescheduleTicket(
  ticketId: string,
  input: RescheduleTicketInput,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    slotSchedule: readonly Slot[];
  },
): Promise<Result<RescheduleTicketOutput, RescheduleTicketError>> {
  return dependencies.unitOfWork.run<
    RescheduleTicketOutput,
    RescheduleTicketError
  >(async (repositories) => {
    const ticket = await repositories.tickets.findTicketByIdForUpdate(ticketId);
    if (ticket === null) {
      return { ok: false, error: { kind: 'TicketNotFound' } };
    }
    const now = dependencies.clock.now();
    if (ticket.reservation.kind === 'slot' && ticket.slotReleasedAt !== null) {
      return {
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: 'reschedule',
        },
      };
    }
    if (
      ticket.reservation.kind === 'slot' &&
      sameSlot(ticket.reservation, input.reservation)
    ) {
      return {
        ok: true,
        value: { ticket, reprintRequired: false },
      };
    }

    if (
      ticket.state.status === 'served' ||
      ticket.state.status === 'cancelled'
    ) {
      return {
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: 'reschedule',
        },
      };
    }
    if (
      ticket.reservation.kind === 'legacy' &&
      ticket.state.status !== 'waiting' &&
      ticket.state.status !== 'called'
    ) {
      return {
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: 'reschedule',
        },
      };
    }
    if (
      ticket.reservation.kind === 'slot' &&
      now.getTime() >= Date.parse(ticket.reservation.slotStartsAt)
    ) {
      return {
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: ticket.state.status,
          action: 'reschedule',
        },
      };
    }
    const configuredSlot = dependencies.slotSchedule.find(
      (slot) =>
        slot.slotStartsAt === input.reservation.slotStartsAt &&
        slot.equipment === input.reservation.equipment,
    );
    if (configuredSlot === undefined) {
      return { ok: false, error: { kind: 'SlotNotConfigured' } };
    }
    const tickets = await repositories.tickets.listTickets();
    if (!isSlotTimeBookable(configuredSlot, now)) {
      return { ok: false, error: { kind: 'SlotNotBookable' } };
    }
    if (isSlotOccupied(input.reservation, tickets, ticket.id)) {
      return { ok: false, error: { kind: 'SlotUnavailable' } };
    }
    const jobs = await repositories.printJobs.listPrintJobsForTicket(ticketId);
    if (
      jobs.some((job) => job.status === 'queued' || job.status === 'printing')
    ) {
      return { ok: false, error: { kind: 'PrintJobNotReprintable' } };
    }

    const from = ticket.reservation;
    const updated: Ticket =
      ticket.reservation.kind === 'legacy'
        ? {
            id: ticket.id,
            counterKey: ticket.counterKey,
            number: ticket.number,
            publicToken: ticket.publicToken,
            idempotencyKey: ticket.idempotencyKey,
            requestHash: ticket.requestHash,
            issuedAt: ticket.issuedAt,
            reservation: input.reservation,
            slotReleasedAt: null,
            state: { status: 'waiting' },
            updatedAt: now,
            latestChange: ticket.latestChange,
          }
        : {
            ...ticket,
            reservation: input.reservation,
            slotReleasedAt: null,
            state: { status: 'waiting' },
            updatedAt: now,
            latestChange: {
              from,
              to: input.reservation,
              changedAt: now,
              comment: input.comment,
            },
          };
    const persisted = await repositories.tickets.updateTicket(updated);
    if (!persisted.ok) return persisted;
    return {
      ok: true,
      value: {
        ticket: updated,
        reprintRequired:
          from.kind === 'legacy' ||
          from.slotStartsAt !== input.reservation.slotStartsAt,
      },
    };
  });
}

export type ReservationSlotView = Slot & {
  experienceEndsAt: Date;
  endsAt: Date;
  bookable: boolean;
  ticket: Ticket | null;
};
export type ReservationsView = {
  slots: ReservationSlotView[];
  legacyTickets: Ticket[];
  unconfiguredTickets: Ticket[];
  releasedTickets: Ticket[];
  printNeedsAttention: Array<{ ticket: Ticket; job: PrintJob }>;
};

export async function getReservations(
  slotSchedule: readonly Slot[],
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
): Promise<Result<ReservationsView, never>> {
  return dependencies.unitOfWork.run<ReservationsView, never>(
    async (repositories) => {
      const tickets = await repositories.tickets.listTickets();
      const jobs = await repositories.printJobs.listPrintJobs();
      const ticketBySlot = new Map<string, Ticket>();
      const legacyTickets: Ticket[] = [];
      const unconfiguredTickets: Ticket[] = [];
      const releasedTickets: Ticket[] = [];
      const configuredSlots = new Set(
        slotSchedule.map(
          ({ slotStartsAt, equipment }) => `${slotStartsAt}\u0000${equipment}`,
        ),
      );
      for (const ticket of tickets) {
        if (ticket.reservation.kind === 'legacy') {
          legacyTickets.push(ticket);
        } else {
          if (ticket.slotReleasedAt !== null) {
            releasedTickets.push(ticket);
            continue;
          }
          const key = `${ticket.reservation.slotStartsAt}\u0000${ticket.reservation.equipment}`;
          if (configuredSlots.has(key)) ticketBySlot.set(key, ticket);
          else unconfiguredTickets.push(ticket);
        }
      }

      const now = dependencies.clock.now();
      const slots = slotSchedule.map((slot) => {
        const startsAt = new Date(slot.slotStartsAt);
        const key = `${slot.slotStartsAt}\u0000${slot.equipment}`;
        const ticket = ticketBySlot.get(key) ?? null;
        const experienceMinutes = slot.experienceMinutes ?? 25;
        const intervalMinutes = slot.intervalMinutes ?? 30;
        return {
          ...slot,
          experienceEndsAt: new Date(
            startsAt.getTime() + experienceMinutes * 60_000,
          ),
          endsAt: new Date(startsAt.getTime() + intervalMinutes * 60_000),
          bookable: ticket === null && isSlotTimeBookable(slot, now),
          ticket,
        };
      });

      const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
      const latestJobByTicket = new Map<string, PrintJob>();
      for (const job of jobs) latestJobByTicket.set(job.ticketId, job);
      const printNeedsAttention: ReservationsView['printNeedsAttention'] = [];
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
          slots,
          legacyTickets,
          unconfiguredTickets,
          releasedTickets,
          printNeedsAttention,
        },
      };
    },
  );
}

export type TicketDetailView = { ticket: Ticket; printJobs: PrintJob[] };

export async function getTicketDetail(
  ticketId: string,
  unitOfWork: ScopedUnitOfWork,
): Promise<Result<TicketDetailView, TicketNotFound>> {
  return unitOfWork.run<TicketDetailView, TicketNotFound>(
    async (repositories) => {
      const ticket = await repositories.tickets.findTicketById(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      return {
        ok: true,
        value: {
          ticket,
          printJobs:
            await repositories.printJobs.listPrintJobsForTicket(ticketId),
        },
      };
    },
  );
}

export type QueueView = {
  waiting: Ticket[];
  called: Ticket[];
  statusCounts: Record<TicketState['status'], number>;
  printNeedsAttention: Array<{ ticket: Ticket; job: PrintJob }>;
  latestCalledNumber: number | null;
};

export async function getQueue(
  unitOfWork: ScopedUnitOfWork,
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
  latestChange: Ticket['latestChange'];
} & (
  | {
      status: ScheduledTicketState['status'];
      reservation: SlotReservation;
      slotReleasedAt: Date | null;
    }
  | {
      status: TicketState['status'];
      reservation: LegacyReservation;
      slotReleasedAt: null;
    }
);

export async function getPublicTicket(
  token: string,
  eventEndAt: Date,
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
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
      const value: PublicTicketView =
        'partySize' in ticket
          ? {
              number: ticket.number,
              status: ticket.state.status,
              reservation: ticket.reservation,
              slotReleasedAt: null,
              latestChange: ticket.latestChange,
            }
          : {
              number: ticket.number,
              status: ticket.state.status,
              reservation: ticket.reservation,
              slotReleasedAt: ticket.slotReleasedAt,
              latestChange: ticket.latestChange,
            };
      return { ok: true, value };
    },
  );
}

export async function reprintTicket(
  ticketId: string,
  dependencies: {
    unitOfWork: ScopedUnitOfWork;
    clock: Clock;
    tokens: TokenGenerator;
    version2Print?: TicketPrintConfig;
  },
): Promise<Result<PrintJob, ReprintTicketError>> {
  return dependencies.unitOfWork.run<PrintJob, ReprintTicketError>(
    async (repositories) => {
      const ticket =
        await repositories.tickets.findTicketByIdForUpdate(ticketId);
      if (ticket === null) {
        return { ok: false, error: { kind: 'TicketNotFound' } };
      }
      if (
        ticket.reservation.kind === 'slot' &&
        ticket.slotReleasedAt !== null
      ) {
        return {
          ok: false,
          error: {
            kind: 'InvalidTransition',
            from: ticket.state.status,
            action: 'reprint',
          },
        };
      }
      const jobs =
        await repositories.printJobs.listPrintJobsForTicket(ticketId);
      if (
        jobs.some((job) => job.status === 'queued' || job.status === 'printing')
      ) {
        return { ok: false, error: { kind: 'PrintJobNotReprintable' } };
      }
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
        payload: ticketPrintPayload(ticket, dependencies.version2Print),
        outputKind: null,
      };
      await repositories.printJobs.createReprintJob(job);
      return { ok: true, value: job };
    },
  );
}

export type IncompatibleAgent = { kind: 'IncompatibleAgent' };

export async function claimPrintJob(dependencies: {
  unitOfWork: ScopedUnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
  acceptedPayloadVersions?: readonly number[];
}): Promise<Result<PrintJob | null, IncompatibleAgent>> {
  const now = dependencies.clock.now();
  const leaseExpiresAt = new Date(now.getTime() + 60_000);
  const leaseToken = dependencies.tokens.leaseToken();
  return dependencies.unitOfWork.run<PrintJob | null, IncompatibleAgent>(
    async (repositories) => {
      const acceptedPayloadVersions = dependencies.acceptedPayloadVersions ?? [
        1,
      ];
      const availability =
        await repositories.printJobs.queuedPayloadVersionAvailability(
          acceptedPayloadVersions,
        );
      if (!availability.accepted && availability.unsupported) {
        return { ok: false, error: { kind: 'IncompatibleAgent' } };
      }
      await repositories.printJobs.expireLeasesBefore(now);
      const job = await repositories.printJobs.claimNextQueuedJob(
        now,
        leaseExpiresAt,
        leaseToken,
        acceptedPayloadVersions,
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
    outputKind?: PrintOutputKind;
    detail?: string;
  },
  dependencies: { unitOfWork: ScopedUnitOfWork; clock: Clock },
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
        outputKind: input.outputKind ?? job.outputKind,
        ...(input.detail === undefined ? {} : { detail: input.detail }),
      };
      await repositories.printJobs.updatePrintJob(updated);
      return { ok: true, value: updated };
    },
  );
}
