import { z } from 'zod';
import {
  type ConfigurationExport,
  type EventConfiguration,
  eventConfigurationRevision,
  parseEventConfiguration,
} from '../domain/event-configuration.ts';
import type { Result } from '../domain/result.ts';

export type { ConfigurationExport, EventConfiguration };

export type ManagementActor = { issuer: string; subject: string };
export type MemberRole = 'admin' | 'staff';

const roleSchema = z.enum(['admin', 'staff']);
const eventChangeConstraintsSchema = z
  .object({
    ticketCount: z.number().int().nonnegative(),
    structuralFrozen: z.boolean(),
    frozenFields: z.array(z.string()),
    activeTicketCount: z.number().int().nonnegative(),
    activeJobCount: z.number().int().nonnegative(),
    canDisable: z.boolean(),
    printersInUse: z.array(z.string()),
  })
  .strict();

export const managedTenantSummariesSchema = z
  .object({
    tenants: z.array(
      z
        .object({
          id: z.uuid(),
          slug: z.string(),
          displayName: z.string(),
          role: roleSchema,
          revision: z.number().int().positive(),
          events: z.array(
            z
              .object({
                id: z.uuid(),
                slug: z.string(),
                title: z.string().nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export const managedTenantSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    displayName: z.string(),
    revision: z.number().int().positive(),
    changeConstraints: z
      .object({
        activeTicketCount: z.number().int().nonnegative(),
        activeJobCount: z.number().int().nonnegative(),
        canDisable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const managedMembersSchema = z
  .object({
    revision: z.number().int().positive(),
    members: z.array(
      z
        .object({
          issuer: z.string(),
          subject: z.string(),
          role: roleSchema,
          disabled: z.boolean(),
          self: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export const managedEventSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    config: z.record(z.string(), z.unknown()),
    revision: z.string(),
    changeConstraints: eventChangeConstraintsSchema,
  })
  .strict();
export const managedEventsSchema = z
  .object({ events: z.array(managedEventSchema) })
  .strict();
export const managedRevisionSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const managedEventWriteSchema = z
  .object({ id: z.uuid(), slug: z.string(), revision: z.string() })
  .strict();
export const managedAuditPageSchema = z
  .object({
    entries: z.array(
      z
        .object({
          id: z.uuid(),
          occurredAt: z.string(),
          action: z.string(),
          resourceType: z.enum(['tenant', 'member', 'event']),
          resourceId: z.string(),
          eventId: z.uuid().nullable(),
          actorKind: z.enum(['operator', 'user']),
          actorUserId: z.uuid().nullable(),
          origin: z.string(),
          revisionBefore: z.number().int().nullable(),
          revisionAfter: z.number().int().nullable(),
          before: z.record(z.string(), z.unknown()).nullable(),
          after: z.record(z.string(), z.unknown()).nullable(),
        })
        .strict(),
    ),
    nextCursor: z
      .object({ occurredAt: z.string(), id: z.uuid() })
      .strict()
      .nullable(),
  })
  .strict();

export type ManagedTenantSummaries = z.infer<
  typeof managedTenantSummariesSchema
>;
export type ManagedTenant = z.infer<typeof managedTenantSchema>;
export type ManagedMembers = z.infer<typeof managedMembersSchema>;
export type ManagedEvent = z.infer<typeof managedEventSchema>;
export type ManagedEvents = z.infer<typeof managedEventsSchema>;
export type ManagedRevision = z.infer<typeof managedRevisionSchema>;
export type ManagedEventWrite = z.infer<typeof managedEventWriteSchema>;
export type ManagedAuditPage = z.infer<typeof managedAuditPageSchema>;

// Failure codes raised by the management database functions (SQLSTATE P0001).
export const databaseFailureCodes = [
  'not_found',
  'forbidden',
  'revision_conflict',
  'confirmation_mismatch',
  'last_admin',
  'identity_disabled',
  'invalid_display_name',
  'invalid_role',
  'invalid_subject',
  'invalid_slug',
  'database_authority_required',
] as const;
export const changeConstraintCodes = [
  'structural_frozen',
  'printer_in_use',
  'active_tickets',
  'active_print_jobs',
] as const;

export type ManagementFailure =
  | {
      code:
        | (typeof databaseFailureCodes)[number]
        | 'slug_conflict'
        | 'invalid_cursor'
        | 'member_not_found'
        | 'upstream_unavailable';
    }
  | {
      code: 'invalid_config';
      issues: Array<{ path: string; message: string }>;
    }
  | {
      code: 'change_constraint';
      constraint: (typeof changeConstraintCodes)[number];
      fields: string[];
    };

export type ManagementResult<T> = Result<T, ManagementFailure>;

// Every operation authorizes against the actor's current membership inside the
// database transaction that performs it.
export type ConfigurationManagementStore = {
  listTenants: (actor: ManagementActor) => Promise<ManagedTenantSummaries>;
  requireAdmin: (
    actor: ManagementActor,
    tenantSlug: string,
  ) => Promise<ManagementResult<null>>;
  getTenant: (
    actor: ManagementActor,
    tenantSlug: string,
  ) => Promise<ManagementResult<ManagedTenant>>;
  updateTenant: (
    actor: ManagementActor,
    tenantSlug: string,
    input: { expectedRevision: number; displayName: string },
  ) => Promise<ManagementResult<ManagedRevision>>;
  disableTenant: (
    actor: ManagementActor,
    tenantSlug: string,
    input: { expectedRevision: number; confirmSlug: string },
  ) => Promise<ManagementResult<ManagedRevision>>;
  listMembers: (
    actor: ManagementActor,
    tenantSlug: string,
  ) => Promise<ManagementResult<ManagedMembers>>;
  upsertMember: (
    actor: ManagementActor,
    tenantSlug: string,
    input: { expectedRevision: number; subject: string; role: MemberRole },
  ) => Promise<ManagementResult<ManagedRevision>>;
  disableMember: (
    actor: ManagementActor,
    tenantSlug: string,
    input: { expectedRevision: number; subject: string },
  ) => Promise<ManagementResult<ManagedRevision>>;
  listEvents: (
    actor: ManagementActor,
    tenantSlug: string,
  ) => Promise<ManagementResult<ManagedEvents>>;
  getEvent: (
    actor: ManagementActor,
    tenantSlug: string,
    eventSlug: string,
  ) => Promise<ManagementResult<ManagedEvent>>;
  createEvent: (
    actor: ManagementActor,
    tenantSlug: string,
    input: {
      slug: string;
      config: EventConfiguration;
      configRevision: string;
    },
  ) => Promise<ManagementResult<ManagedEventWrite>>;
  updateEvent: (
    actor: ManagementActor,
    tenantSlug: string,
    eventSlug: string,
    input: {
      expectedRevision: string;
      config: EventConfiguration;
      configRevision: string;
    },
  ) => Promise<ManagementResult<ManagedEventWrite>>;
  disableEvent: (
    actor: ManagementActor,
    tenantSlug: string,
    eventSlug: string,
    input: { expectedRevision: string; confirmSlug: string },
  ) => Promise<ManagementResult<ManagedEventWrite>>;
  readAudit: (
    actor: ManagementActor,
    tenantSlug: string,
    input: {
      limit: number;
      before: { occurredAt: string; id: string } | null;
    },
  ) => Promise<ManagementResult<ManagedAuditPage>>;
  exportTenant: (
    actor: ManagementActor,
    tenantSlug: string,
  ) => Promise<ManagementResult<ConfigurationExport>>;
};

export type GitHubAccountLookup =
  | { kind: 'ok'; subject: string; login: string; displayName: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

export type GitHubAccountResolver = {
  findByLogin: (
    login: string,
    accessToken: string | null,
  ) => Promise<GitHubAccountLookup>;
  findBySubject: (
    subject: string,
    accessToken: string | null,
  ) => Promise<GitHubAccountLookup>;
};

export const maximumAuditPageSize = 50;
const auditCursorSchema = z
  .object({ occurredAt: z.string(), id: z.uuid() })
  .strict();

function encodeCursor(cursor: { occurredAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(
  value: string,
): { occurredAt: string; id: string } | null {
  try {
    const parsed = auditCursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    if (!parsed.success || Number.isNaN(Date.parse(parsed.data.occurredAt))) {
      return null;
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function failure<T>(failure: ManagementFailure): ManagementResult<T> {
  return { ok: false, error: failure };
}

export function createConfigurationManagementService(
  store: ConfigurationManagementStore,
  github: GitHubAccountResolver,
) {
  return {
    listTenants: (actor: ManagementActor) => store.listTenants(actor),
    getTenant: store.getTenant,
    updateTenant: store.updateTenant,
    disableTenant: store.disableTenant,
    listMembers: store.listMembers,
    disableMember: store.disableMember,
    listEvents: store.listEvents,
    getEvent: store.getEvent,
    disableEvent: store.disableEvent,
    exportTenant: store.exportTenant,
    resolveMember: async (
      actor: ManagementActor,
      tenantSlug: string,
      login: string,
      getAccessToken: () => Promise<string | null>,
    ): Promise<
      ManagementResult<{ subject: string; login: string; displayName: string }>
    > => {
      const authorized = await store.requireAdmin(actor, tenantSlug);
      if (!authorized.ok) return authorized;
      const account = await github.findByLogin(login, await getAccessToken());
      if (account.kind === 'unavailable') {
        return failure({ code: 'upstream_unavailable' });
      }
      if (account.kind === 'not_found') {
        return failure({ code: 'member_not_found' });
      }
      return {
        ok: true,
        value: {
          subject: account.subject,
          login: account.login,
          displayName: account.displayName,
        },
      };
    },
    upsertMember: async (
      actor: ManagementActor,
      tenantSlug: string,
      input: { expectedRevision: number; subject: string; role: MemberRole },
      getAccessToken: () => Promise<string | null>,
    ): Promise<ManagementResult<ManagedRevision>> => {
      const authorized = await store.requireAdmin(actor, tenantSlug);
      if (!authorized.ok) return authorized;
      const account = await github.findBySubject(
        input.subject,
        await getAccessToken(),
      );
      if (account.kind === 'unavailable') {
        return failure({ code: 'upstream_unavailable' });
      }
      if (account.kind === 'not_found') {
        return failure({ code: 'member_not_found' });
      }
      return store.upsertMember(actor, tenantSlug, {
        ...input,
        subject: account.subject,
      });
    },
    createEvent: async (
      actor: ManagementActor,
      tenantSlug: string,
      input: { slug: string; config: Record<string, unknown> },
    ): Promise<ManagementResult<ManagedEventWrite>> => {
      const config = parseEventConfiguration(input.config);
      if (!config.ok) {
        return failure({
          code: 'invalid_config',
          issues: config.error.issues,
        });
      }
      return store.createEvent(actor, tenantSlug, {
        slug: input.slug,
        config: config.value,
        configRevision: eventConfigurationRevision(config.value),
      });
    },
    updateEvent: async (
      actor: ManagementActor,
      tenantSlug: string,
      eventSlug: string,
      input: { expectedRevision: string; config: Record<string, unknown> },
    ): Promise<ManagementResult<ManagedEventWrite>> => {
      const config = parseEventConfiguration(input.config);
      if (!config.ok) {
        return failure({
          code: 'invalid_config',
          issues: config.error.issues,
        });
      }
      return store.updateEvent(actor, tenantSlug, eventSlug, {
        expectedRevision: input.expectedRevision,
        config: config.value,
        configRevision: eventConfigurationRevision(config.value),
      });
    },
    readAudit: async (
      actor: ManagementActor,
      tenantSlug: string,
      input: { limit: number; cursor?: string | undefined },
    ): Promise<
      ManagementResult<{
        entries: ManagedAuditPage['entries'];
        nextCursor: string | null;
      }>
    > => {
      const before =
        input.cursor === undefined ? null : decodeCursor(input.cursor);
      if (input.cursor !== undefined && before === null) {
        return failure({ code: 'invalid_cursor' });
      }
      const page = await store.readAudit(actor, tenantSlug, {
        limit: Math.min(input.limit, maximumAuditPageSize),
        before,
      });
      if (!page.ok) return page;
      return {
        ok: true,
        value: {
          entries: page.value.entries,
          nextCursor:
            page.value.nextCursor === null
              ? null
              : encodeCursor(page.value.nextCursor),
        },
      };
    },
  };
}

export type ConfigurationManagementService = ReturnType<
  typeof createConfigurationManagementService
>;
