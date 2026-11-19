import { createRoute, type z } from '@hono/zod-openapi';
import {
  auditPageResponseSchema,
  auditQuerySchema,
  configurationExportResponseSchema,
  eventCreateBodySchema,
  eventDisableBodySchema,
  eventListSchema,
  eventUpdateBodySchema,
  eventWriteResponseSchema,
  managedEventResponseSchema,
  managedTenantResponseSchema,
  managementErrorSchema,
  managementEventParamsSchema,
  managementTenantParamsSchema,
  memberDisableBodySchema,
  memberListSchema,
  memberResolveBodySchema,
  memberResolveResponseSchema,
  memberUpsertBodySchema,
  revisionResponseSchema,
  tenantDisableBodySchema,
  tenantListSchema,
  tenantUpdateBodySchema,
} from './tenant-management-schemas.ts';

type Definition = {
  method: 'get' | 'post';
  path: string;
  operationId: string;
  summary: string;
  params?:
    | typeof managementTenantParamsSchema
    | typeof managementEventParamsSchema;
  query?: typeof auditQuerySchema;
  body?: z.ZodType;
  success: { status: 200 | 201; schema: z.ZodType; description: string };
  failures: readonly (400 | 403 | 404 | 409 | 429 | 503)[];
};

const failureDescriptions = {
  400: 'Invalid request',
  403: 'The member is not an administrator of the tenant',
  404: 'Resource not found or not visible to the signed-in identity',
  409: 'Revision conflict, change constraint, or GitHub reconnection required',
  429: 'Rate limit exceeded',
  503: 'GitHub is unavailable or rate-limited, or web configuration changes are not enabled',
} as const;

const prefix = '/api/auth/queue-pilot';
const tenantPath = `${prefix}/t/{tenantSlug}`;
const eventPath = `${tenantPath}/events/{eventSlug}`;

const definitions: readonly Definition[] = [
  {
    method: 'get',
    path: `${prefix}/tenants`,
    operationId: 'listManagedTenants',
    summary:
      'List the tenants of the signed-in identity, including tenants without events',
    success: {
      status: 200,
      schema: tenantListSchema,
      description: 'Tenants with an active membership',
    },
    failures: [],
  },
  {
    method: 'get',
    path: tenantPath,
    operationId: 'getManagedTenant',
    summary: 'Read the tenant settings',
    params: managementTenantParamsSchema,
    success: {
      status: 200,
      schema: managedTenantResponseSchema,
      description: 'Tenant settings and change constraints',
    },
    failures: [403, 404],
  },
  {
    method: 'post',
    path: `${tenantPath}/update`,
    operationId: 'updateManagedTenant',
    summary: 'Rename the tenant',
    params: managementTenantParamsSchema,
    body: tenantUpdateBodySchema,
    success: {
      status: 200,
      schema: revisionResponseSchema,
      description: 'Updated tenant revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'post',
    path: `${tenantPath}/disable`,
    operationId: 'disableManagedTenant',
    summary: 'Disable the tenant after explicit slug confirmation',
    params: managementTenantParamsSchema,
    body: tenantDisableBodySchema,
    success: {
      status: 200,
      schema: revisionResponseSchema,
      description: 'Updated tenant revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'get',
    path: `${tenantPath}/members`,
    operationId: 'listManagedMembers',
    summary: 'List the members of the tenant',
    params: managementTenantParamsSchema,
    success: {
      status: 200,
      schema: memberListSchema,
      description: 'Members and the tenant revision',
    },
    failures: [403, 404],
  },
  {
    method: 'post',
    path: `${tenantPath}/members/resolve`,
    operationId: 'resolveManagedMember',
    summary: 'Resolve a GitHub login to its numeric account ID',
    params: managementTenantParamsSchema,
    body: memberResolveBodySchema,
    success: {
      status: 200,
      schema: memberResolveResponseSchema,
      description: 'Resolved GitHub account',
    },
    failures: [400, 403, 404, 409, 429, 503],
  },
  {
    method: 'post',
    path: `${tenantPath}/members/upsert`,
    operationId: 'upsertManagedMember',
    summary: 'Add a member or change the role of a member',
    params: managementTenantParamsSchema,
    body: memberUpsertBodySchema,
    success: {
      status: 200,
      schema: revisionResponseSchema,
      description: 'Updated tenant revision',
    },
    failures: [400, 403, 404, 409, 503],
  },
  {
    method: 'post',
    path: `${tenantPath}/members/disable`,
    operationId: 'disableManagedMember',
    summary: 'Disable a member while keeping at least one active administrator',
    params: managementTenantParamsSchema,
    body: memberDisableBodySchema,
    success: {
      status: 200,
      schema: revisionResponseSchema,
      description: 'Updated tenant revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'get',
    path: `${tenantPath}/events`,
    operationId: 'listManagedEvents',
    summary:
      'List the active events with their configuration and change constraints',
    params: managementTenantParamsSchema,
    success: {
      status: 200,
      schema: eventListSchema,
      description: 'Events of the tenant',
    },
    failures: [403, 404],
  },
  {
    method: 'post',
    path: `${tenantPath}/events/create`,
    operationId: 'createManagedEvent',
    summary: 'Create an event; the server issues its UUID',
    params: managementTenantParamsSchema,
    body: eventCreateBodySchema,
    success: {
      status: 201,
      schema: eventWriteResponseSchema,
      description: 'Created event identity and revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'get',
    path: eventPath,
    operationId: 'getManagedEvent',
    summary: 'Read an event configuration and its change constraints',
    params: managementEventParamsSchema,
    success: {
      status: 200,
      schema: managedEventResponseSchema,
      description: 'Event configuration, revision, and change constraints',
    },
    failures: [403, 404],
  },
  {
    method: 'post',
    path: `${eventPath}/update`,
    operationId: 'updateManagedEvent',
    summary: 'Update an event configuration under the change constraints',
    params: managementEventParamsSchema,
    body: eventUpdateBodySchema,
    success: {
      status: 200,
      schema: eventWriteResponseSchema,
      description: 'Updated event revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'post',
    path: `${eventPath}/disable`,
    operationId: 'disableManagedEvent',
    summary: 'Disable an event after explicit slug confirmation',
    params: managementEventParamsSchema,
    body: eventDisableBodySchema,
    success: {
      status: 200,
      schema: eventWriteResponseSchema,
      description: 'Event revision',
    },
    failures: [400, 403, 404, 409],
  },
  {
    method: 'get',
    path: `${tenantPath}/audit`,
    operationId: 'readManagedAudit',
    summary: 'Read the configuration audit log, newest first',
    params: managementTenantParamsSchema,
    query: auditQuerySchema,
    success: {
      status: 200,
      schema: auditPageResponseSchema,
      description: 'A page of audit entries',
    },
    failures: [400, 403, 404],
  },
  {
    method: 'get',
    path: `${tenantPath}/export`,
    operationId: 'exportManagedTenant',
    summary: 'Export the tenant configuration as version 1 JSON',
    params: managementTenantParamsSchema,
    success: {
      status: 200,
      schema: configurationExportResponseSchema,
      description: 'Configuration export without credentials, tickets, or jobs',
    },
    failures: [403, 404],
  },
];

export function registerManagementOpenApi(
  register: (route: ReturnType<typeof createRoute>) => void,
): void {
  for (const definition of definitions) {
    register(
      createRoute({
        method: definition.method,
        path: definition.path,
        operationId: definition.operationId,
        summary: definition.summary,
        tags: ['tenant-management'],
        security: [{ SessionCookie: [] }],
        request: {
          ...(definition.params === undefined
            ? {}
            : { params: definition.params }),
          ...(definition.query === undefined
            ? {}
            : { query: definition.query }),
          ...(definition.body === undefined
            ? {}
            : {
                body: {
                  required: true,
                  content: { 'application/json': { schema: definition.body } },
                },
              }),
        },
        responses: {
          [definition.success.status]: {
            description: definition.success.description,
            content: {
              'application/json': { schema: definition.success.schema },
            },
          },
          401: {
            description: 'Authentication failed',
            content: { 'application/json': { schema: managementErrorSchema } },
          },
          ...Object.fromEntries(
            // Every mutation can be refused when the deployment still uses
            // manifest authority, so 503 is part of every POST contract.
            (definition.method === 'post'
              ? [...new Set([...definition.failures, 503 as const])]
              : definition.failures
            ).map((status) => [
              status,
              {
                description: failureDescriptions[status],
                ...(status === 503 || status === 429
                  ? {
                      headers: {
                        ...(status === 503
                          ? {
                              'Retry-After': {
                                description:
                                  'Seconds to wait before retrying a GitHub rate-limited request',
                                schema: { type: 'integer', minimum: 1 },
                              },
                            }
                          : {}),
                        ...(status === 429
                          ? {
                              'X-Retry-After': {
                                description:
                                  'Seconds to wait before retrying a management API rate-limited request',
                                schema: { type: 'integer', minimum: 1 },
                              },
                            }
                          : {}),
                      },
                    }
                  : {}),
                content: {
                  'application/json': { schema: managementErrorSchema },
                },
              },
            ]),
          ),
        },
      }),
    );
  }
}
