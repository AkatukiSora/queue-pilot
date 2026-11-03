import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey(),
    counterKey: text('counter_key').notNull(),
    number: integer('number').notNull(),
    partySize: smallint('party_size').notNull().default(1),
    publicToken: varchar('public_token', { length: 22 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: text('status').notNull(),
    cancelReason: text('cancel_reason'),
    slotStartsAt: timestamp('slot_starts_at', {
      withTimezone: true,
      mode: 'date',
    }),
    equipment: text('equipment'),
    slotChangedAt: timestamp('slot_changed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    previousSlotStartsAt: timestamp('previous_slot_starts_at', {
      withTimezone: true,
      mode: 'date',
    }),
    previousEquipment: text('previous_equipment'),
    slotChangeComment: text('slot_change_comment'),
    issuedAt: timestamp('issued_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    unique('tickets_counter_key_number_key').on(table.counterKey, table.number),
    unique('tickets_idempotency_key_key').on(table.idempotencyKey),
    unique('tickets_public_token_key').on(table.publicToken),
    unique('tickets_slot_equipment_key').on(
      table.slotStartsAt,
      table.equipment,
    ),
    check('tickets_number_positive', sql`${table.number} > 0`),
    check('tickets_party_size_range', sql`${table.partySize} BETWEEN 1 AND 20`),
    check(
      'tickets_public_token_format',
      sql`${table.publicToken} ~ '^[A-Za-z0-9_-]{22}$'`,
    ),
    check(
      'tickets_status_allowed',
      sql`${table.status} IN ('waiting', 'called', 'served', 'cancelled')`,
    ),
    check(
      'tickets_cancel_reason_consistent',
      sql`(${table.status} = 'cancelled' AND ${table.cancelReason} IN ('visitor', 'staff', 'no_show')) OR (${table.status} <> 'cancelled' AND ${table.cancelReason} IS NULL)`,
    ),
    check(
      'tickets_slot_pair_consistent',
      sql`(${table.slotStartsAt} IS NULL) = (${table.equipment} IS NULL)`,
    ),
    check(
      'tickets_equipment_valid',
      sql`${table.equipment} IS NULL OR ${table.equipment} IN ('Quest 3', 'Quest 3S', 'Steam Frame', 'Beyond2')`,
    ),
    check(
      'tickets_slot_status_consistent',
      sql`${table.slotStartsAt} IS NULL OR ${table.status} IN ('waiting', 'served', 'cancelled')`,
    ),
    check(
      'tickets_slot_alignment',
      sql`${table.slotStartsAt} IS NULL OR (extract(second FROM ${table.slotStartsAt}) = 0 AND extract(minute FROM ${table.slotStartsAt} AT TIME ZONE 'Asia/Tokyo') IN (0, 30))`,
    ),
    check(
      'tickets_slot_change_consistent',
      sql`(${table.slotChangedAt} IS NULL AND ${table.previousSlotStartsAt} IS NULL AND ${table.previousEquipment} IS NULL AND ${table.slotChangeComment} IS NULL) OR (${table.slotChangedAt} IS NOT NULL AND ${table.slotStartsAt} IS NOT NULL AND ((${table.previousSlotStartsAt} IS NULL AND ${table.previousEquipment} IS NULL) OR (${table.previousSlotStartsAt} IS NOT NULL AND ${table.previousEquipment} IS NOT NULL)))`,
    ),
    check(
      'tickets_previous_equipment_valid',
      sql`${table.previousEquipment} IS NULL OR ${table.previousEquipment} IN ('Quest 3', 'Quest 3S', 'Steam Frame', 'Beyond2')`,
    ),
    check(
      'tickets_slot_change_comment_length',
      sql`${table.slotChangeComment} IS NULL OR char_length(${table.slotChangeComment}) <= 200`,
    ),
    check(
      'tickets_previous_slot_alignment',
      sql`${table.previousSlotStartsAt} IS NULL OR (extract(second FROM ${table.previousSlotStartsAt}) = 0 AND extract(minute FROM ${table.previousSlotStartsAt} AT TIME ZONE 'Asia/Tokyo') IN (0, 30))`,
    ),
  ],
);

export const ticketCounters = pgTable(
  'ticket_counters',
  {
    counterKey: text('counter_key').primaryKey(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [
    check('ticket_counters_last_number_positive', sql`${table.lastNumber} > 0`),
  ],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey(),
    ticketId: uuid('ticket_id').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    attempt: integer('attempt').notNull().default(0),
    reprintOf: uuid('reprint_of'),
    payload: jsonb('payload')
      .$type<
        | {
            ticketNumber: number;
            partySize: number;
            publicToken: string;
            issuedAt: string;
          }
        | {
            kind: 'slot';
            ticketNumber: number;
            slotStartsAt: string;
            publicToken: string;
            issuedAt: string;
          }
      >()
      .notNull(),
    detail: text('detail'),
  },
  (table) => [
    foreignKey({
      name: 'print_jobs_ticket_id_fkey',
      columns: [table.ticketId],
      foreignColumns: [tickets.id],
    }),
    foreignKey({
      name: 'print_jobs_reprint_of_fkey',
      columns: [table.reprintOf],
      foreignColumns: [table.id],
    }),
    check(
      'print_jobs_status_allowed',
      sql`${table.status} IN ('queued', 'printing', 'printed', 'failed', 'unknown')`,
    ),
    check('print_jobs_attempt_nonnegative', sql`${table.attempt} >= 0`),
    check(
      'print_jobs_lease_consistent',
      sql`(${table.status} = 'printing' AND ${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.status} <> 'printing' AND ${table.leaseToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    index('print_jobs_queued_pick_idx')
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'queued'`),
    index('print_jobs_ticket_created_idx').on(
      table.ticketId,
      table.createdAt,
      table.id,
    ),
  ],
);
