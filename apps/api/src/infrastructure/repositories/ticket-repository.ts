import { asc, eq, sql } from 'drizzle-orm';
import type {
  DuplicateIdempotencyKey,
  Ticket,
  TicketRepository,
} from '../../application/ports.ts';
import type { Result } from '../../domain/result.ts';
import type {
  CancelReason,
  PublicToken,
  TicketState,
} from '../../domain/ticket.ts';
import type { DrizzleTransaction } from '../persistence/drizzle/client.ts';
import {
  printJobs,
  ticketCounters,
  tickets,
} from '../persistence/drizzle/schema.ts';
import { toPrintJobRow } from './print-job-repository.ts';

function toTicket(row: typeof tickets.$inferSelect): Ticket {
  const state: TicketState =
    row.status === 'cancelled'
      ? { status: 'cancelled', cancelReason: row.cancelReason as CancelReason }
      : { status: row.status as 'waiting' | 'called' | 'served' };
  return {
    id: row.id,
    counterKey: row.counterKey,
    number: row.number,
    partySize: row.partySize,
    publicToken: row.publicToken as PublicToken,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    state,
    issuedAt: row.issuedAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(ticket: Ticket) {
  return {
    id: ticket.id,
    counterKey: ticket.counterKey,
    number: ticket.number,
    partySize: ticket.partySize,
    publicToken: ticket.publicToken,
    idempotencyKey: ticket.idempotencyKey,
    requestHash: ticket.requestHash,
    status: ticket.state.status,
    cancelReason:
      ticket.state.status === 'cancelled' ? ticket.state.cancelReason : null,
    issuedAt: ticket.issuedAt,
    updatedAt: ticket.updatedAt,
  };
}

export function createTicketRepository(
  transaction: DrizzleTransaction,
): TicketRepository {
  return {
    async findTicketByIdForUpdate(id) {
      const [row] = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? null : toTicket(row);
    },
    async findTicketByIdempotencyKey(key) {
      const [row] = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.idempotencyKey, key))
        .limit(1);
      return row === undefined ? null : toTicket(row);
    },
    async findTicketByPublicToken(token) {
      const [row] = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.publicToken, token))
        .limit(1);
      return row === undefined ? null : toTicket(row);
    },
    async listTickets() {
      const rows = await transaction
        .select()
        .from(tickets)
        .orderBy(asc(tickets.counterKey), asc(tickets.number));
      return rows.map(toTicket);
    },
    async allocateNextNumber(counterKey) {
      const [row] = await transaction
        .insert(ticketCounters)
        .values({ counterKey, lastNumber: 1 })
        .onConflictDoUpdate({
          target: ticketCounters.counterKey,
          set: { lastNumber: sql`${ticketCounters.lastNumber} + 1` },
        })
        .returning({ lastNumber: ticketCounters.lastNumber });
      if (row === undefined)
        throw new Error('採番カウンタの更新結果がありません。');
      return row.lastNumber;
    },
    async createIssuedTicket(ticket, printJob) {
      try {
        await transaction.insert(tickets).values(toRow(ticket));
      } catch (error) {
        const databaseError =
          error instanceof Error && 'cause' in error ? error.cause : error;
        if (
          typeof databaseError === 'object' &&
          databaseError !== null &&
          'code' in databaseError &&
          databaseError.code === '23505' &&
          'constraint' in databaseError &&
          databaseError.constraint === 'tickets_idempotency_key_key'
        ) {
          return {
            ok: false,
            error: { kind: 'DuplicateIdempotencyKey' },
          } satisfies Result<void, DuplicateIdempotencyKey>;
        }
        throw error;
      }
      await transaction.insert(printJobs).values(toPrintJobRow(printJob));
      return { ok: true, value: undefined };
    },
    async updateTicket(ticket) {
      await transaction
        .update(tickets)
        .set(toRow(ticket))
        .where(eq(tickets.id, ticket.id));
    },
  };
}
