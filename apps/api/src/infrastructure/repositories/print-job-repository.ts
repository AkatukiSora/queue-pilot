import { and, asc, eq, lt } from 'drizzle-orm';
import type { PrintJob, PrintJobRepository } from '../../application/ports.ts';
import type { PublicToken } from '../../domain/ticket.ts';
import type { DrizzleTransaction } from '../persistence/drizzle/client.ts';
import { printJobs } from '../persistence/drizzle/schema.ts';

function toPrintJob(row: typeof printJobs.$inferSelect): PrintJob {
  return {
    id: row.id,
    ticketId: row.ticketId,
    status: row.status as PrintJob['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attempt: row.attempt,
    leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseExpiresAt,
    reprintOf: row.reprintOf,
    payload: {
      ticketNumber: row.payload.ticketNumber,
      partySize: row.payload.partySize,
      publicToken: row.payload.publicToken as PublicToken,
      issuedAt: new Date(row.payload.issuedAt),
    },
    ...(row.detail === null ? {} : { detail: row.detail }),
  };
}

export function toPrintJobRow(job: PrintJob) {
  return {
    id: job.id,
    ticketId: job.ticketId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    leaseToken: job.leaseToken,
    leaseExpiresAt: job.leaseExpiresAt,
    attempt: job.attempt,
    reprintOf: job.reprintOf,
    payload: {
      ticketNumber: job.payload.ticketNumber,
      partySize: job.payload.partySize,
      publicToken: job.payload.publicToken,
      issuedAt: job.payload.issuedAt.toISOString(),
    },
    detail: job.detail ?? null,
  };
}

export function createPrintJobRepository(
  transaction: DrizzleTransaction,
): PrintJobRepository {
  return {
    async findPrintJobByIdForUpdate(id) {
      const [row] = await transaction
        .select()
        .from(printJobs)
        .where(eq(printJobs.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? null : toPrintJob(row);
    },
    async listPrintJobs() {
      const rows = await transaction
        .select()
        .from(printJobs)
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
      return rows.map(toPrintJob);
    },
    async listPrintJobsForTicket(ticketId) {
      const rows = await transaction
        .select()
        .from(printJobs)
        .where(eq(printJobs.ticketId, ticketId))
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
      return rows.map(toPrintJob);
    },
    async expireLeasesBefore(now) {
      await transaction
        .update(printJobs)
        .set({
          status: 'unknown',
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(printJobs.status, 'printing'),
            lt(printJobs.leaseExpiresAt, now),
          ),
        );
    },
    async claimNextQueuedJob(now, leaseExpiresAt, leaseToken) {
      const [queued] = await transaction
        .select()
        .from(printJobs)
        .where(eq(printJobs.status, 'queued'))
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id))
        .limit(1)
        .for('update', { skipLocked: true });
      if (queued === undefined) return null;
      const [claimed] = await transaction
        .update(printJobs)
        .set({
          status: 'printing',
          leaseExpiresAt,
          leaseToken,
          attempt: queued.attempt + 1,
          updatedAt: now,
        })
        .where(eq(printJobs.id, queued.id))
        .returning();
      return claimed === undefined ? null : toPrintJob(claimed);
    },
    async createReprintJob(job) {
      await transaction.insert(printJobs).values(toPrintJobRow(job));
    },
    async updatePrintJob(job) {
      await transaction
        .update(printJobs)
        .set(toPrintJobRow(job))
        .where(eq(printJobs.id, job.id));
    },
  };
}
