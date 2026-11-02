import type { PrintJobStatus } from '../domain/print-job.ts';
import type { Result } from '../domain/result.ts';
import type { PublicToken, TicketState } from '../domain/ticket.ts';

export type Ticket = {
  id: string;
  counterKey: string;
  number: number;
  partySize: number;
  publicToken: PublicToken;
  idempotencyKey: string;
  requestHash: string;
  state: TicketState;
  issuedAt: Date;
  updatedAt: Date;
};

export type PrintPayload = {
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

export interface TicketRepository {
  findTicketByIdForUpdate(id: string): Promise<Ticket | null>;
  findTicketByIdempotencyKey(key: string): Promise<Ticket | null>;
  findTicketByPublicToken(token: PublicToken): Promise<Ticket | null>;
  listTickets(): Promise<Ticket[]>;
  /** Allocation must participate in the surrounding issue transaction. */
  allocateNextNumber(counterKey: string): Promise<number>;
  /** Persist both rows atomically; a duplicate key must return a typed error. */
  createIssuedTicket(
    ticket: Ticket,
    printJob: PrintJob,
  ): Promise<Result<void, DuplicateIdempotencyKey>>;
  updateTicket(ticket: Ticket): Promise<void>;
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
