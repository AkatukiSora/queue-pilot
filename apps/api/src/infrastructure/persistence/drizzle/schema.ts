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
      .$type<{
        ticketNumber: number;
        partySize: number;
        publicToken: string;
        issuedAt: string;
      }>()
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
