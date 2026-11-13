import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { PrintOutputKind } from '../../../application/ports.ts';

export const authUsers = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('createdAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updatedAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [unique('user_email_key').on(table.email)],
);

export const authSessions = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('createdAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updatedAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull(),
  },
  (table) => [
    unique('session_token_key').on(table.token),
    index('session_user_id_idx').on(table.userId),
    foreignKey({
      name: 'session_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete('cascade'),
  ],
);

export const authAccounts = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updatedAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    unique('account_provider_account_key').on(
      table.providerId,
      table.accountId,
    ),
    index('account_user_id_idx').on(table.userId),
    foreignKey({
      name: 'account_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete('cascade'),
  ],
);

export const authVerifications = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    createdAt: timestamp('createdAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    updatedAt: timestamp('updatedAt', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const authRateLimits = pgTable(
  'rateLimit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
  },
  (table) => [
    unique('rateLimit_key_key').on(table.key),
    index('rateLimit_lastRequest_idx').on(table.lastRequest),
  ],
);

export const sharedRateLimits = pgTable('rate_limiter', {
  key: varchar('key', { length: 255 }).primaryKey(),
  points: integer('points').notNull().default(0),
  expire: bigint('expire', { mode: 'number' }),
});

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey(),
    slug: varchar('slug', { length: 63 }).notNull(),
    displayName: text('display_name').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [unique('tenants_slug_key').on(table.slug)],
);

export const appUsers = pgTable(
  'app_users',
  {
    id: uuid('id').primaryKey(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('app_users_issuer_subject_key').on(table.issuer, table.subject),
  ],
);

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({
      name: 'tenant_memberships_pkey',
      columns: [table.tenantId, table.userId],
    }),
    foreignKey({
      name: 'tenant_memberships_tenant_id_fkey',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }),
    foreignKey({
      name: 'tenant_memberships_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [appUsers.id],
    }),
    check(
      'tenant_memberships_role_check',
      sql`${table.role} IN ('admin', 'staff')`,
    ),
  ],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    slug: varchar('slug', { length: 63 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    configRevision: text('config_revision').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'events_tenant_id_fkey',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }),
    unique('events_tenant_id_slug_key').on(table.tenantId, table.slug),
    unique('events_tenant_id_id_key').on(table.tenantId, table.id),
  ],
);

export const eventEquipment = pgTable(
  'event_equipment',
  {
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    id: text('id').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({
      name: 'event_equipment_pkey',
      columns: [table.tenantId, table.eventId, table.id],
    }),
    foreignKey({
      name: 'event_equipment_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    check(
      'event_equipment_sort_order_nonnegative',
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
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
    slotReleasedAt: timestamp('slot_released_at', {
      withTimezone: true,
      mode: 'date',
    }),
    equipment: text('equipment'),
    equipmentId: text('equipment_id'),
    slotChangedAt: timestamp('slot_changed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    previousSlotStartsAt: timestamp('previous_slot_starts_at', {
      withTimezone: true,
      mode: 'date',
    }),
    previousEquipment: text('previous_equipment'),
    previousEquipmentId: text('previous_equipment_id'),
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
    unique('tickets_tenant_event_id_key').on(
      table.tenantId,
      table.eventId,
      table.id,
    ),
    unique('tickets_counter_key_number_key').on(
      table.tenantId,
      table.eventId,
      table.counterKey,
      table.number,
    ),
    unique('tickets_idempotency_key_key').on(
      table.tenantId,
      table.eventId,
      table.idempotencyKey,
    ),
    unique('tickets_public_token_key').on(table.publicToken),
    foreignKey({
      name: 'tickets_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    foreignKey({
      name: 'tickets_equipment_fkey',
      columns: [table.tenantId, table.eventId, table.equipmentId],
      foreignColumns: [
        eventEquipment.tenantId,
        eventEquipment.eventId,
        eventEquipment.id,
      ],
    }),
    foreignKey({
      name: 'tickets_previous_equipment_fkey',
      columns: [table.tenantId, table.eventId, table.previousEquipmentId],
      foreignColumns: [
        eventEquipment.tenantId,
        eventEquipment.eventId,
        eventEquipment.id,
      ],
    }),
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
      sql`(${table.slotStartsAt} IS NULL) = (${table.equipmentId} IS NULL)`,
    ),
    check(
      'tickets_slot_status_consistent',
      sql`${table.slotStartsAt} IS NULL OR ${table.status} IN ('waiting', 'served', 'cancelled')`,
    ),
    check(
      'tickets_slot_release_consistent',
      sql`${table.slotReleasedAt} IS NULL OR (${table.slotStartsAt} IS NOT NULL AND ${table.status} IN ('cancelled', 'served'))`,
    ),
    check(
      'tickets_slot_alignment',
      sql`${table.slotStartsAt} IS NULL OR extract(second FROM ${table.slotStartsAt}) = 0`,
    ),
    check(
      'tickets_slot_change_consistent',
      sql`(${table.slotChangedAt} IS NULL AND ${table.previousSlotStartsAt} IS NULL AND ${table.previousEquipmentId} IS NULL AND ${table.slotChangeComment} IS NULL) OR (${table.slotChangedAt} IS NOT NULL AND ${table.slotStartsAt} IS NOT NULL AND ((${table.previousSlotStartsAt} IS NULL AND ${table.previousEquipmentId} IS NULL) OR (${table.previousSlotStartsAt} IS NOT NULL AND ${table.previousEquipmentId} IS NOT NULL)))`,
    ),
    check(
      'tickets_slot_change_comment_length',
      sql`${table.slotChangeComment} IS NULL OR char_length(${table.slotChangeComment}) <= 200`,
    ),
    check(
      'tickets_previous_slot_alignment',
      sql`${table.previousSlotStartsAt} IS NULL OR extract(second FROM ${table.previousSlotStartsAt}) = 0`,
    ),
    uniqueIndex('tickets_slot_equipment_key')
      .on(table.tenantId, table.eventId, table.slotStartsAt, table.equipmentId)
      .where(sql`${table.slotReleasedAt} IS NULL`),
  ],
);

export const publicTicketLocator = pgTable(
  'public_ticket_locator',
  {
    token: varchar('token', { length: 22 }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    ticketId: uuid('ticket_id').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'public_ticket_locator_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    foreignKey({
      name: 'public_ticket_locator_ticket_id_fkey',
      columns: [table.tenantId, table.eventId, table.ticketId],
      foreignColumns: [tickets.tenantId, tickets.eventId, tickets.id],
    }),
    unique('public_ticket_locator_tenant_event_ticket_key').on(
      table.tenantId,
      table.eventId,
      table.ticketId,
    ),
  ],
);

export const ticketCounters = pgTable(
  'ticket_counters',
  {
    counterKey: text('counter_key').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'ticket_counters_pkey',
      columns: [table.tenantId, table.eventId, table.counterKey],
    }),
    foreignKey({
      name: 'ticket_counters_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    check('ticket_counters_last_number_positive', sql`${table.lastNumber} > 0`),
  ],
);

export const printers = pgTable(
  'printers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    slug: varchar('slug', { length: 63 }).notNull(),
    label: text('label').notNull(),
    kind: text('kind').notNull().default('tm-t88v-usb'),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('printers_tenant_event_id_key').on(
      table.tenantId,
      table.eventId,
      table.id,
    ),
    unique('printers_tenant_event_slug_key').on(
      table.tenantId,
      table.eventId,
      table.slug,
    ),
    foreignKey({
      name: 'printers_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
  ],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    printerId: uuid('printer_id').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('agents_tenant_event_id_printer_key').on(
      table.tenantId,
      table.eventId,
      table.id,
      table.printerId,
    ),
    foreignKey({
      name: 'agents_printer_fkey',
      columns: [table.tenantId, table.eventId, table.printerId],
      foreignColumns: [printers.tenantId, printers.eventId, printers.id],
    }),
  ],
);

export const agentCredentials = pgTable(
  'agent_credentials',
  {
    id: uuid('id').primaryKey(),
    secretHash: varchar('secret_hash', { length: 64 }).notNull(),
    agentId: uuid('agent_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    printerId: uuid('printer_id').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('agent_credentials_secret_hash_key').on(table.secretHash),
    foreignKey({
      name: 'agent_credentials_agent_scope_fkey',
      columns: [table.tenantId, table.eventId, table.agentId, table.printerId],
      foreignColumns: [
        agents.tenantId,
        agents.eventId,
        agents.id,
        agents.printerId,
      ],
    }),
    check(
      'agent_credentials_hash_format',
      sql`${table.secretHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'agent_credentials_expiry_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    printerId: uuid('printer_id').notNull(),
    payloadVersion: smallint('payload_version').notNull().default(1),
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
    claimedByAgentId: uuid('claimed_by_agent_id'),
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
        | {
            schemaVersion: 2;
            ticketNumber: number;
            reservation:
              | { kind: 'slot'; startsAt: string }
              | { kind: 'legacy' };
            issuedAt: string;
            timeZone: string;
            publicURL: string;
            copy: { receiptTitle: string; arrivalGuidance: string };
          }
      >()
      .notNull(),
    detail: text('detail'),
    outputKind: text('output_kind').$type<PrintOutputKind>(),
  },
  (table) => [
    unique('print_jobs_tenant_event_id_key').on(
      table.tenantId,
      table.eventId,
      table.id,
    ),
    foreignKey({
      name: 'print_jobs_tenant_event_fkey',
      columns: [table.tenantId, table.eventId],
      foreignColumns: [events.tenantId, events.id],
    }),
    foreignKey({
      name: 'print_jobs_ticket_fkey',
      columns: [table.tenantId, table.eventId, table.ticketId],
      foreignColumns: [tickets.tenantId, tickets.eventId, tickets.id],
    }),
    foreignKey({
      name: 'print_jobs_reprint_of_fkey',
      columns: [table.tenantId, table.eventId, table.reprintOf],
      foreignColumns: [table.tenantId, table.eventId, table.id],
    }),
    foreignKey({
      name: 'print_jobs_printer_fkey',
      columns: [table.tenantId, table.eventId, table.printerId],
      foreignColumns: [printers.tenantId, printers.eventId, printers.id],
    }),
    foreignKey({
      name: 'print_jobs_claimed_agent_fkey',
      columns: [
        table.tenantId,
        table.eventId,
        table.claimedByAgentId,
        table.printerId,
      ],
      foreignColumns: [
        agents.tenantId,
        agents.eventId,
        agents.id,
        agents.printerId,
      ],
    }),
    check(
      'print_jobs_payload_version_check',
      sql`${table.payloadVersion} IN (1, 2) AND ((${table.payloadVersion} = 1 AND ${table.payload}->>'schemaVersion' IS NULL) OR (${table.payloadVersion} = 2 AND ${table.payload}->>'schemaVersion' = '2'))`,
    ),
    check(
      'print_jobs_status_allowed',
      sql`${table.status} IN ('queued', 'printing', 'printed', 'failed', 'unknown')`,
    ),
    check(
      'print_jobs_output_kind_allowed',
      sql`${table.outputKind} IS NULL OR ${table.outputKind} IN ('physical', 'preview')`,
    ),
    check('print_jobs_attempt_nonnegative', sql`${table.attempt} >= 0`),
    check(
      'print_jobs_lease_consistent',
      sql`(${table.status} = 'printing' AND ${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL AND ${table.claimedByAgentId} IS NOT NULL) OR (${table.status} <> 'printing' AND ${table.leaseToken} IS NULL AND ${table.leaseExpiresAt} IS NULL AND ${table.claimedByAgentId} IS NULL)`,
    ),
    index('print_jobs_queued_pick_idx')
      .on(
        table.tenantId,
        table.eventId,
        table.printerId,
        table.payloadVersion,
        table.createdAt,
        table.id,
      )
      .where(sql`${table.status} = 'queued'`),
    index('print_jobs_ticket_created_idx').on(
      table.tenantId,
      table.eventId,
      table.ticketId,
      table.createdAt,
      table.id,
    ),
  ],
);
