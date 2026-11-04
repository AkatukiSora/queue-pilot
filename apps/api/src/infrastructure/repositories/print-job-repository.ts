import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { PrintJob, PrintJobRepository } from '../../application/ports.ts';
import type { AuthenticatedRequestContext } from '../../application/security-ports.ts';
import { LEGACY_COMPAT_AGENT_ID } from '../../domain/tenant-manifest.ts';
import { parsePublicToken, parseSlotStart } from '../../domain/ticket.ts';
import type { DrizzleTransaction } from '../persistence/drizzle/client.ts';
import { printJobs, printers } from '../persistence/drizzle/schema.ts';

function toPrintJob(row: typeof printJobs.$inferSelect): PrintJob {
  let payload: PrintJob['payload'];
  if (row.payloadVersion === 2) {
    if (!('schemaVersion' in row.payload) || row.payload.schemaVersion !== 2) {
      throw new Error('Stored print job payload version does not match.');
    }
    const reservation = row.payload.reservation;
    if (reservation.kind === 'slot') {
      const startsAt = parseSlotStart(reservation.startsAt);
      if (!startsAt.ok) {
        throw new Error('Stored v2 print job has an invalid slot start.');
      }
      payload = {
        ...row.payload,
        reservation: { kind: 'slot', startsAt: startsAt.value },
        issuedAt: new Date(row.payload.issuedAt),
      };
    } else {
      payload = {
        ...row.payload,
        issuedAt: new Date(row.payload.issuedAt),
      };
    }
  } else {
    if (!('publicToken' in row.payload)) {
      throw new Error('Stored v1 print job has no public token.');
    }
    const publicToken = parsePublicToken(row.payload.publicToken);
    if (!publicToken.ok) {
      throw new Error('Stored print job has an invalid public token.');
    }
    if ('kind' in row.payload) {
      if (row.payload.kind !== 'slot') {
        throw new Error('Stored print job has an unknown payload kind.');
      }
      const slotStartsAt = parseSlotStart(row.payload.slotStartsAt);
      if (!slotStartsAt.ok) {
        throw new Error('Stored slot print job has an invalid start time.');
      }
      payload = {
        kind: 'slot',
        ticketNumber: row.payload.ticketNumber,
        slotStartsAt: slotStartsAt.value,
        publicToken: publicToken.value,
        issuedAt: new Date(row.payload.issuedAt),
      };
    } else {
      payload = {
        ticketNumber: row.payload.ticketNumber,
        partySize: row.payload.partySize,
        publicToken: publicToken.value,
        issuedAt: new Date(row.payload.issuedAt),
      };
    }
  }

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
    payload,
    ...(row.detail === null ? {} : { detail: row.detail }),
  };
}

export function toPrintJobRow(
  job: PrintJob,
  context: AuthenticatedRequestContext,
  printerId: string,
) {
  return {
    tenantId: context.tenantId,
    eventId: context.eventId,
    printerId,
    payloadVersion: 'schemaVersion' in job.payload ? 2 : 1,
    id: job.id,
    ticketId: job.ticketId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    leaseToken: job.leaseToken,
    leaseExpiresAt: job.leaseExpiresAt,
    claimedByAgentId: null,
    attempt: job.attempt,
    reprintOf: job.reprintOf,
    payload:
      'schemaVersion' in job.payload
        ? { ...job.payload, issuedAt: job.payload.issuedAt.toISOString() }
        : job.payload.kind === 'slot'
          ? {
              kind: 'slot' as const,
              ticketNumber: job.payload.ticketNumber,
              slotStartsAt: job.payload.slotStartsAt,
              publicToken: job.payload.publicToken,
              issuedAt: job.payload.issuedAt.toISOString(),
            }
          : {
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
  context: AuthenticatedRequestContext,
): PrintJobRepository {
  async function findPrinterId(): Promise<string> {
    const printerSlug =
      context.printerId ??
      context.event?.defaultPrinterId ??
      (context.kind === 'legacy' ? 'legacy-printer' : undefined);
    if (printerSlug === undefined) {
      throw new Error('No printer is selected for the request event.');
    }
    const [printer] = await transaction
      .select({ id: printers.id })
      .from(printers)
      .where(
        and(
          eq(printers.tenantId, context.tenantId),
          eq(printers.eventId, context.eventId),
          eq(printers.slug, printerSlug),
          isNull(printers.disabledAt),
        ),
      )
      .limit(1);
    if (printer === undefined) {
      throw new Error('The selected event printer is not configured.');
    }
    return printer.id;
  }

  function scopedCondition(...conditions: Parameters<typeof and>) {
    return and(
      eq(printJobs.tenantId, context.tenantId),
      eq(printJobs.eventId, context.eventId),
      ...conditions,
    );
  }

  function claimingAgentId(): string {
    if (context.agentId !== undefined) return context.agentId;
    if (context.kind === 'legacy') return LEGACY_COMPAT_AGENT_ID;
    throw new Error('An authenticated agent is required to claim print jobs.');
  }

  return {
    async findPrintJobByIdForUpdate(id) {
      const [row] = await transaction
        .select()
        .from(printJobs)
        .where(
          scopedCondition(
            eq(printJobs.id, id),
            context.kind === 'agent'
              ? eq(printJobs.claimedByAgentId, claimingAgentId())
              : undefined,
          ),
        )
        .limit(1)
        .for('update');
      return row === undefined ? null : toPrintJob(row);
    },
    async listPrintJobs() {
      const rows = await transaction
        .select()
        .from(printJobs)
        .where(scopedCondition())
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
      return rows.map(toPrintJob);
    },
    async listPrintJobsForTicket(ticketId) {
      const rows = await transaction
        .select()
        .from(printJobs)
        .where(scopedCondition(eq(printJobs.ticketId, ticketId)))
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id));
      return rows.map(toPrintJob);
    },
    async queuedPayloadVersionAvailability(acceptedVersions) {
      const printerId = await findPrinterId();
      const rows = await transaction
        .select({ payloadVersion: printJobs.payloadVersion })
        .from(printJobs)
        .where(
          scopedCondition(
            eq(printJobs.printerId, printerId),
            eq(printJobs.status, 'queued'),
          ),
        );
      return {
        accepted: rows.some(({ payloadVersion }) => acceptedVersions.includes(payloadVersion)),
        unsupported: rows.some(({ payloadVersion }) => !acceptedVersions.includes(payloadVersion)),
      };
    },
    async expireLeasesBefore(now) {
      const printerId = await findPrinterId();
      await transaction
        .update(printJobs)
        .set({
          status: 'unknown',
          leaseToken: null,
          leaseExpiresAt: null,
          claimedByAgentId: null,
          updatedAt: now,
        })
        .where(
          scopedCondition(
            eq(printJobs.printerId, printerId),
            eq(printJobs.status, 'printing'),
            lt(printJobs.leaseExpiresAt, now),
            eq(printJobs.claimedByAgentId, claimingAgentId()),
          ),
        );
    },
    async claimNextQueuedJob(now, leaseExpiresAt, leaseToken, acceptedVersions) {
      const printerId = await findPrinterId();
      const [queued] = await transaction
        .select()
        .from(printJobs)
        .where(
          scopedCondition(
            eq(printJobs.printerId, printerId),
            eq(printJobs.status, 'queued'),
            inArray(printJobs.payloadVersion, [...acceptedVersions]),
          ),
        )
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
          claimedByAgentId: claimingAgentId(),
          attempt: queued.attempt + 1,
          updatedAt: now,
        })
        .where(
          scopedCondition(
            eq(printJobs.id, queued.id),
            eq(printJobs.status, 'queued'),
          ),
        )
        .returning();
      return claimed === undefined ? null : toPrintJob(claimed);
    },
    async createReprintJob(job) {
      const printerId = await findPrinterId();
      await transaction
        .insert(printJobs)
        .values(toPrintJobRow(job, context, printerId));
    },
    async updatePrintJob(job) {
      const printerId = await findPrinterId();
      await transaction
        .update(printJobs)
        .set(toPrintJobRow(job, context, printerId))
        .where(
          scopedCondition(
            eq(printJobs.id, job.id),
            context.kind === 'agent'
              ? eq(printJobs.claimedByAgentId, claimingAgentId())
              : undefined,
          ),
        );
    },
  };
}
