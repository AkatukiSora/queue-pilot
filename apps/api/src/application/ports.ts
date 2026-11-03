import type { PrintJobStatus } from '../domain/print-job.ts';
import type { Result } from '../domain/result.ts';
import type {
  LatestChange,
  LegacyReservation,
  PublicToken,
  ScheduledTicketState,
  Slot,
  SlotReservation,
  TicketState,
} from '../domain/ticket.ts';

export type { Slot, SlotReservation } from '../domain/ticket.ts';
export { equipmentValues, parseSlotStart } from '../domain/ticket.ts';

export type TicketBase = {
  id: string;
  counterKey: string;
  number: number;
  publicToken: PublicToken;
  idempotencyKey: string;
  requestHash: string;
  issuedAt: Date;
  updatedAt: Date;
  latestChange: LatestChange | null;
};

export type Ticket =
  | (TicketBase & {
      reservation: SlotReservation;
      state: ScheduledTicketState;
    })
  | (TicketBase & {
      reservation: LegacyReservation;
      state: TicketState;
      partySize: number;
    });

export type PrintPayload =
  | {
      kind: 'slot';
      ticketNumber: number;
      slotStartsAt: SlotReservation['slotStartsAt'];
      publicToken: PublicToken;
      issuedAt: Date;
    }
  | {
      kind?: never;
      ticketNumber: number;
      partySize: number;
      publicToken: PublicToken;
      issuedAt: Date;
    };

export type PrintJob = {
  id: string;
  ticketId: string;
  status: PrintJobStatus;
  createdAt: Date;
  updatedAt: Date;
  attempt: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  reprintOf: string | null;
  payload: PrintPayload;
  detail?: string;
};

export type DuplicateIdempotencyKey = { kind: 'DuplicateIdempotencyKey' };
export type SlotUnavailable = { kind: 'SlotUnavailable' };
export type CreateIssuedTicketError = DuplicateIdempotencyKey | SlotUnavailable;

export interface TicketRepository {
  findTicketById(id: string): Promise<Ticket | null>;
  findTicketByIdForUpdate(id: string): Promise<Ticket | null>;
  findTicketByIdempotencyKey(key: string): Promise<Ticket | null>;
  findTicketByPublicToken(token: PublicToken): Promise<Ticket | null>;
  listTickets(): Promise<Ticket[]>;
  /** Allocation must participate in the surrounding issue transaction. */
  allocateNextNumber(counterKey: string): Promise<number>;
  /** Persist both rows atomically; slot and key collisions are typed errors. */
  createIssuedTicket(
    ticket: Ticket,
    printJob: PrintJob,
  ): Promise<Result<void, CreateIssuedTicketError>>;
  updateTicket(ticket: Ticket): Promise<Result<void, SlotUnavailable>>;
}

export interface PrintJobRepository {
  findPrintJobByIdForUpdate(id: string): Promise<PrintJob | null>;
  listPrintJobs(): Promise<PrintJob[]>;
  listPrintJobsForTicket(ticketId: string): Promise<PrintJob[]>;
  expireLeasesBefore(now: Date): Promise<void>;
  claimNextQueuedJob(
    now: Date,
    leaseExpiresAt: Date,
    leaseToken: string,
  ): Promise<PrintJob | null>;
  createReprintJob(job: PrintJob): Promise<void>;
  updatePrintJob(job: PrintJob): Promise<void>;
}

export type Repositories = {
  tickets: TicketRepository;
  printJobs: PrintJobRepository;
};

export interface UnitOfWork {
  /** Commit an ok result; discard all changes when the callback returns an error. */
  run<T, E>(
    operation: (repositories: Repositories) => Promise<Result<T, E>>,
  ): Promise<Result<T, E>>;
}

export interface Clock {
  now(): Date;
}

export interface TokenGenerator {
  ticketId(): string;
  printJobId(): string;
  publicToken(): PublicToken;
  leaseToken(): string;
}

export type ReservationSchedule = readonly Slot[];
