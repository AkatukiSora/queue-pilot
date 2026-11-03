import type {
  Clock,
  DuplicateIdempotencyKey,
  PrintJob,
  Repositories,
  Ticket,
  TokenGenerator,
  UnitOfWork,
} from '../../src/application/ports.ts';
import type { Result } from '../../src/domain/result.ts';
import type { PublicToken } from '../../src/domain/ticket.ts';

type MemoryState = {
  tickets: Ticket[];
  printJobs: PrintJob[];
  nextNumbers: Record<string, number>;
};

type DuplicateWinner = { ticket: Ticket; printJob: PrintJob };

export function createApplicationFakes(
  initialTime = new Date('2026-11-02T12:00:00.000Z'),
) {
  const database: { value: MemoryState } = {
    value: { tickets: [], printJobs: [], nextNumbers: {} },
  };
  const diagnostics = { idempotencyReads: 0 };
  let now = initialTime.getTime();
  let sequence = 0;
  let duplicateWinner: DuplicateWinner | undefined;

  const clock: Clock = { now: () => new Date(now) };
  const tokens: TokenGenerator = {
    ticketId: () => `ticket-${++sequence}`,
    printJobId: () => `job-${++sequence}`,
    publicToken: () => {
      sequence += 1;
      return `${sequence.toString(36).toUpperCase().padStart(22, 'A')}` as PublicToken;
    },
    leaseToken: () => `lease-${++sequence}`,
  };

  const unitOfWork: UnitOfWork = {
    async run<T, E>(
      operation: (repositories: Repositories) => Promise<Result<T, E>>,
    ): Promise<Result<T, E>> {
      const working = structuredClone(database.value);
      const repositories: Repositories = {
        tickets: {
          async findTicketById(id) {
            return structuredClone(
              working.tickets.find((ticket) => ticket.id === id) ?? null,
            );
          },
          async findTicketByIdForUpdate(id) {
            return structuredClone(
              working.tickets.find((ticket) => ticket.id === id) ?? null,
            );
          },
          async findTicketByIdempotencyKey(key) {
            diagnostics.idempotencyReads += 1;
            return structuredClone(
              working.tickets.find((ticket) => ticket.idempotencyKey === key) ??
                null,
            );
          },
          async findTicketByPublicToken(token) {
            return structuredClone(
              working.tickets.find((ticket) => ticket.publicToken === token) ??
                null,
            );
          },
          async listTickets() {
            return structuredClone(working.tickets);
          },
          async allocateNextNumber(counterKey) {
            const number = (working.nextNumbers[counterKey] ?? 0) + 1;
            working.nextNumbers[counterKey] = number;
            return number;
          },
          async createIssuedTicket(ticket, printJob) {
            if (duplicateWinner !== undefined) {
              const winner = duplicateWinner;
              duplicateWinner = undefined;
              database.value.tickets.push(structuredClone(winner.ticket));
              database.value.printJobs.push(structuredClone(winner.printJob));
              return {
                ok: false,
                error: { kind: 'DuplicateIdempotencyKey' },
              } satisfies Result<void, DuplicateIdempotencyKey>;
            }
            if (
              working.tickets.some(
                (existing) => existing.idempotencyKey === ticket.idempotencyKey,
              )
            ) {
              return {
                ok: false,
                error: { kind: 'DuplicateIdempotencyKey' },
              } satisfies Result<void, DuplicateIdempotencyKey>;
            }
            working.tickets.push(structuredClone(ticket));
            working.printJobs.push(structuredClone(printJob));
            return { ok: true, value: undefined };
          },
          async updateTicket(ticket) {
            const index = working.tickets.findIndex(
              (item) => item.id === ticket.id,
            );
            if (index !== -1) working.tickets[index] = structuredClone(ticket);
          },
        },
        printJobs: {
          async findPrintJobByIdForUpdate(id) {
            return structuredClone(
              working.printJobs.find((job) => job.id === id) ?? null,
            );
          },
          async listPrintJobs() {
            return structuredClone(working.printJobs);
          },
          async listPrintJobsForTicket(ticketId) {
            return structuredClone(
              working.printJobs.filter((job) => job.ticketId === ticketId),
            );
          },
          async expireLeasesBefore(expirationTime) {
            for (const job of working.printJobs) {
              if (
                job.status === 'printing' &&
                job.leaseExpiresAt !== null &&
                job.leaseExpiresAt.getTime() < expirationTime.getTime()
              ) {
                job.status = 'unknown';
                job.leaseToken = null;
                job.leaseExpiresAt = null;
                job.updatedAt = expirationTime;
              }
            }
          },
          async claimNextQueuedJob(currentTime, leaseExpiresAt, leaseToken) {
            const job = working.printJobs
              .filter((candidate) => candidate.status === 'queued')
              .sort((a, b) => {
                const dateOrder = a.createdAt.getTime() - b.createdAt.getTime();
                if (dateOrder !== 0) return dateOrder;
                if (a.id < b.id) return -1;
                if (a.id > b.id) return 1;
                return 0;
              })[0];
            if (job === undefined) return null;
            job.status = 'printing';
            job.attempt += 1;
            job.leaseToken = leaseToken;
            job.leaseExpiresAt = leaseExpiresAt;
            job.updatedAt = currentTime;
            return structuredClone(job);
          },
          async createReprintJob(job) {
            working.printJobs.push(structuredClone(job));
          },
          async updatePrintJob(job) {
            const index = working.printJobs.findIndex(
              (item) => item.id === job.id,
            );
            if (index !== -1) working.printJobs[index] = structuredClone(job);
          },
        },
      };

      const result = await operation(repositories);
      if (result.ok) database.value = working;
      return result;
    },
  };

  return {
    unitOfWork,
    clock,
    tokens,
    diagnostics,
    clearPrintJobs(ticketId: string) {
      database.value.printJobs = database.value.printJobs.filter(
        (job) => job.ticketId !== ticketId,
      );
    },
    setNow(value: Date) {
      now = value.getTime();
    },
    setDuplicateWinner(value: DuplicateWinner) {
      duplicateWinner = structuredClone(value);
    },
    getState(): MemoryState {
      return structuredClone(database.value);
    },
  };
}
