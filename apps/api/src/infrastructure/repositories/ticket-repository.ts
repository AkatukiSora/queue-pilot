import { asc, eq, sql } from 'drizzle-orm';
import type {
  CreateIssuedTicketError,
  Ticket,
  TicketRepository,
} from '../../application/ports.ts';
import type { Result } from '../../domain/result.ts';
import {
  type CancelReason,
  type LatestChange,
  parseEquipment,
  parsePublicToken,
  parseSlotStart,
  type Reservation,
  type ScheduledTicketState,
  type TicketState,
} from '../../domain/ticket.ts';
import type { DrizzleTransaction } from '../persistence/drizzle/client.ts';
import {
  printJobs,
  ticketCounters,
  tickets,
} from '../persistence/drizzle/schema.ts';
import { toPrintJobRow } from './print-job-repository.ts';

function toTicket(row: typeof tickets.$inferSelect): Ticket {
  const token = parsePublicToken(row.publicToken);
  if (!token.ok) throw new Error('Stored ticket has an invalid public token.');

  const state: TicketState =
    row.status === 'cancelled'
      ? { status: 'cancelled', cancelReason: row.cancelReason as CancelReason }
      : { status: row.status as 'waiting' | 'called' | 'served' };
  const reservation: Reservation =
    row.slotStartsAt === null
      ? { kind: 'legacy' }
      : (() => {
          if (row.equipment === null) {
            throw new Error('Stored slot reservation has no equipment.');
          }
          const slotStart = parseSlotStart(row.slotStartsAt.toISOString());
          const equipment = parseEquipment(row.equipment);
          if (!slotStart.ok || !equipment.ok) {
            throw new Error('Stored slot reservation is invalid.');
          }
          return {
            kind: 'slot' as const,
            slotStartsAt: slotStart.value,
            equipment: equipment.value,
          };
        })();
  const latestChange: LatestChange | null =
    row.slotChangedAt === null
      ? (() => {
          if (
            row.previousSlotStartsAt !== null ||
            row.previousEquipment !== null ||
            row.slotChangeComment !== null
          ) {
            throw new Error('Stored latest slot change is incomplete.');
          }
          return null;
        })()
      : (() => {
          if (reservation.kind !== 'slot') {
            throw new Error('Stored latest slot change has no current slot.');
          }
          let from: Reservation;
          if (
            row.previousSlotStartsAt === null &&
            row.previousEquipment === null
          ) {
            from = { kind: 'legacy' };
          } else {
            if (
              row.previousSlotStartsAt === null ||
              row.previousEquipment === null
            ) {
              throw new Error('Stored previous slot is incomplete.');
            }
            const slotStart = parseSlotStart(
              row.previousSlotStartsAt.toISOString(),
            );
            const equipment = parseEquipment(row.previousEquipment);
            if (!slotStart.ok || !equipment.ok) {
              throw new Error('Stored previous slot is invalid.');
            }
            from = {
              kind: 'slot',
              slotStartsAt: slotStart.value,
              equipment: equipment.value,
            };
          }
          return {
            from,
            to: reservation,
            changedAt: row.slotChangedAt,
            comment: row.slotChangeComment,
          };
        })();
  const base = {
    id: row.id,
    counterKey: row.counterKey,
    number: row.number,
    publicToken: token.value,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    issuedAt: row.issuedAt,
    updatedAt: row.updatedAt,
    latestChange,
  };

  if (reservation.kind === 'legacy') {
    if (row.slotReleasedAt !== null) {
      throw new Error('Stored legacy ticket has a released slot.');
    }
    return {
      ...base,
      reservation,
      slotReleasedAt: null,
      state,
      partySize: row.partySize,
    };
  }
  if (state.status === 'called') {
    throw new Error('Stored slot reservation has legacy called status.');
  }
  if (row.slotReleasedAt !== null) {
    if (state.status !== 'served' && state.status !== 'cancelled') {
      throw new Error('Stored released slot has an active status.');
    }
    const releasedState =
      state.status === 'cancelled'
        ? { status: 'cancelled' as const, cancelReason: state.cancelReason }
        : { status: 'served' as const };
    return {
      ...base,
      reservation,
      slotReleasedAt: row.slotReleasedAt,
      state: releasedState,
    };
  }
  return {
    ...base,
    reservation,
    slotReleasedAt: null,
    state: state as ScheduledTicketState,
  };
}

function toRow(ticket: Ticket) {
  const reservation = ticket.reservation;
  const latestChange = ticket.latestChange;
  return {
    id: ticket.id,
    counterKey: ticket.counterKey,
    number: ticket.number,
    ...('partySize' in ticket ? { partySize: ticket.partySize } : {}),
    publicToken: ticket.publicToken,
    idempotencyKey: ticket.idempotencyKey,
    requestHash: ticket.requestHash,
    status: ticket.state.status,
    cancelReason:
      ticket.state.status === 'cancelled' ? ticket.state.cancelReason : null,
    slotStartsAt:
      reservation.kind === 'slot' ? new Date(reservation.slotStartsAt) : null,
    slotReleasedAt: ticket.slotReleasedAt,
    equipment: reservation.kind === 'slot' ? reservation.equipment : null,
    slotChangedAt: latestChange?.changedAt ?? null,
    previousSlotStartsAt:
      latestChange?.from.kind === 'slot'
        ? new Date(latestChange.from.slotStartsAt)
        : null,
    previousEquipment:
      latestChange?.from.kind === 'slot' ? latestChange.from.equipment : null,
    slotChangeComment: latestChange?.comment ?? null,
    issuedAt: ticket.issuedAt,
    updatedAt: ticket.updatedAt,
  };
}

export function createTicketRepository(
  transaction: DrizzleTransaction,
): TicketRepository {
  return {
    async findTicketById(id) {
      const [row] = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      return row === undefined ? null : toTicket(row);
    },
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
          'constraint' in databaseError
        ) {
          if (databaseError.constraint === 'tickets_idempotency_key_key') {
            return {
              ok: false,
              error: { kind: 'DuplicateIdempotencyKey' },
            } satisfies Result<void, CreateIssuedTicketError>;
          }
          if (databaseError.constraint === 'tickets_slot_equipment_key') {
            return {
              ok: false,
              error: { kind: 'SlotUnavailable' },
            } satisfies Result<void, CreateIssuedTicketError>;
          }
        }
        throw error;
      }
      await transaction.insert(printJobs).values(toPrintJobRow(printJob));
      return { ok: true, value: undefined };
    },
    async updateTicket(ticket) {
      try {
        await transaction
          .update(tickets)
          .set(toRow(ticket))
          .where(eq(tickets.id, ticket.id));
      } catch (error) {
        const databaseError =
          error instanceof Error && 'cause' in error ? error.cause : error;
        if (
          typeof databaseError === 'object' &&
          databaseError !== null &&
          'code' in databaseError &&
          databaseError.code === '23505' &&
          'constraint' in databaseError &&
          databaseError.constraint === 'tickets_slot_equipment_key'
        ) {
          return { ok: false, error: { kind: 'SlotUnavailable' } };
        }
        throw error;
      }
      return { ok: true, value: undefined };
    },
  };
}
