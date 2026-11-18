import { z } from '@hono/zod-openapi';

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(63);
const revisionNumberSchema = z.number().int().positive();
const eventRevisionSchema = z.string().min(1).max(64);
const roleSchema = z.enum(['admin', 'staff']);
const githubSubjectSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .meta({ description: 'Numeric GitHub account ID.' });

export const managementTenantParamsSchema = z.object({
  tenantSlug: slugSchema,
});
export const managementEventParamsSchema = z.object({
  tenantSlug: slugSchema,
  eventSlug: slugSchema,
});

export const tenantUpdateBodySchema = z
  .object({
    expectedRevision: revisionNumberSchema,
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value.trim().length > 0),
  })
  .strict();
export const tenantDisableBodySchema = z
  .object({ expectedRevision: revisionNumberSchema, confirmSlug: slugSchema })
  .strict();
export const memberResolveBodySchema = z
  .object({
    githubLogin: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/),
  })
  .strict();
export const memberUpsertBodySchema = z
  .object({
    expectedRevision: revisionNumberSchema,
    subject: githubSubjectSchema,
    role: roleSchema,
  })
  .strict();
export const memberDisableBodySchema = z
  .object({
    expectedRevision: revisionNumberSchema,
    subject: githubSubjectSchema,
  })
  .strict();
export const eventCreateBodySchema = z
  .object({
    slug: slugSchema,
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
export const eventUpdateBodySchema = z
  .object({
    expectedRevision: eventRevisionSchema,
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
export const eventDisableBodySchema = z
  .object({ expectedRevision: eventRevisionSchema, confirmSlug: slugSchema })
  .strict();
export const auditQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(50),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const tenantListSchema = z
  .object({
    tenants: z.array(
      z
        .object({
          id: z.uuid(),
          slug: z.string(),
          displayName: z.string(),
          role: roleSchema,
          revision: revisionNumberSchema,
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
export const managedTenantResponseSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    displayName: z.string(),
    revision: revisionNumberSchema,
    changeConstraints: z
      .object({
        activeTicketCount: z.number().int().nonnegative(),
        activeJobCount: z.number().int().nonnegative(),
        canDisable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const revisionResponseSchema = z
  .object({ revision: revisionNumberSchema })
  .strict();
export const memberListSchema = z
  .object({
    revision: revisionNumberSchema,
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
export const memberResolveResponseSchema = z
  .object({
    subject: githubSubjectSchema,
    login: z.string(),
    displayName: z.string(),
  })
  .strict();
const eventResponseSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    config: z.record(z.string(), z.unknown()),
    revision: z.string(),
    changeConstraints: z
      .object({
        ticketCount: z.number().int().nonnegative(),
        structuralFrozen: z.boolean(),
        frozenFields: z.array(z.string()),
        activeTicketCount: z.number().int().nonnegative(),
        activeJobCount: z.number().int().nonnegative(),
        canDisable: z.boolean(),
        printersInUse: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export const managedEventResponseSchema = eventResponseSchema;
export const eventListSchema = z
  .object({ events: z.array(eventResponseSchema) })
  .strict();
export const eventWriteResponseSchema = z
  .object({ id: z.uuid(), slug: z.string(), revision: z.string() })
  .strict();
export const auditPageResponseSchema = z
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
    nextCursor: z.string().nullable(),
  })
  .strict();
export const configurationExportResponseSchema = z
  .object({
    configurationExportVersion: z.literal(1),
    tenant: z
      .object({
        id: z.uuid(),
        slug: z.string(),
        displayName: z.string(),
        disabled: z.boolean(),
      })
      .strict(),
    members: z.array(
      z
        .object({
          issuer: z.string(),
          subject: z.string(),
          role: roleSchema,
          disabled: z.boolean(),
        })
        .strict(),
    ),
    events: z.array(
      z
        .object({
          id: z.uuid(),
          slug: z.string(),
          config: z.record(z.string(), z.unknown()),
          configRevision: z.string(),
          disabled: z.boolean(),
          equipment: z.array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                sortOrder: z.number().int().nonnegative(),
                disabled: z.boolean(),
              })
              .strict(),
          ),
          printers: z.array(
            z
              .object({
                id: z.uuid(),
                slug: z.string(),
                label: z.string(),
                kind: z.string(),
                disabled: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export const managementErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        constraint: z.string().optional(),
        fields: z.array(z.string()).optional(),
        issues: z
          .array(z.object({ path: z.string(), message: z.string() }).strict())
          .optional(),
      })
      .strict(),
  })
  .strict();
