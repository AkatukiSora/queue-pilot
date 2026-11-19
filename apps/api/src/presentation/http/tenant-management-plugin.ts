import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import type {
  ConfigurationManagementService,
  ManagementActor,
  ManagementFailure,
  ManagementResult,
} from '../../application/configuration-management.ts';
import { jsonResponse } from './json-response.ts';
import {
  auditQuerySchema,
  eventCreateBodySchema,
  eventDisableBodySchema,
  eventUpdateBodySchema,
  memberDisableBodySchema,
  memberResolveBodySchema,
  memberUpsertBodySchema,
  tenantDisableBodySchema,
  tenantUpdateBodySchema,
} from './tenant-management-schemas.ts';

export type TenantManagementAuthentication = {
  resolveIdentity: (headers: Headers) => Promise<ManagementActor | null>;
  getGitHubAccessToken: (headers: Headers) => Promise<string | null>;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const failureStatus: Record<ManagementFailure['code'], number> = {
  not_found: 404,
  forbidden: 403,
  revision_conflict: 409,
  change_constraint: 409,
  last_admin: 409,
  identity_disabled: 409,
  slug_conflict: 409,
  confirmation_mismatch: 400,
  invalid_display_name: 400,
  invalid_role: 400,
  invalid_subject: 400,
  invalid_slug: 400,
  invalid_cursor: 400,
  invalid_config: 400,
  member_not_found: 400,
  github_reauth_required: 409,
  github_rate_limited: 503,
  upstream_unavailable: 503,
  database_authority_required: 503,
};

const failureMessages: Record<ManagementFailure['code'], string> = {
  not_found: 'The resource was not found.',
  forbidden: 'An administrator role is required.',
  revision_conflict:
    'The resource changed since it was loaded. Reload it and retry.',
  change_constraint: 'The change is not allowed in the current state.',
  last_admin: 'The last active administrator cannot be removed.',
  identity_disabled: 'This identity is disabled.',
  slug_conflict: 'The slug is already in use.',
  confirmation_mismatch: 'The confirmation does not match.',
  invalid_display_name: 'The display name is invalid.',
  invalid_role: 'The role is invalid.',
  invalid_subject: 'The subject is invalid.',
  invalid_slug: 'The slug is invalid.',
  invalid_cursor: 'The cursor is invalid.',
  invalid_config: 'The event configuration is invalid.',
  member_not_found: 'The GitHub account was not found.',
  github_reauth_required: 'The GitHub account must be reconnected.',
  github_rate_limited: 'GitHub rate limit exceeded.',
  upstream_unavailable: 'GitHub could not be reached.',
  database_authority_required:
    'Web configuration changes are not available in this deployment.',
};

function failureResponse(failure: ManagementFailure): Response {
  const headers: Record<string, string> =
    failure.code === 'github_rate_limited' &&
    failure.retryAfterSeconds !== undefined
      ? { 'Retry-After': String(failure.retryAfterSeconds) }
      : {};
  return jsonResponse(
    {
      error: {
        code: failure.code,
        message: failureMessages[failure.code],
        ...(failure.code === 'change_constraint'
          ? { constraint: failure.constraint, fields: failure.fields }
          : {}),
        ...(failure.code === 'invalid_config'
          ? { issues: failure.issues }
          : {}),
      },
    },
    failureStatus[failure.code],
    headers,
  );
}

function plainError(code: string, status: number, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

export function createTenantManagementEndpoints(options: {
  service: ConfigurationManagementService;
  authentication: TenantManagementAuthentication;
}): NonNullable<BetterAuthPlugin['endpoints']> {
  const { service, authentication } = options;

  // Resolves the library session into an identity and validates the slugs from
  // the path before the use case runs. Authorization itself is enforced by the
  // database functions on every call.
  async function respond<T>(
    headers: Headers | undefined,
    slugs: Array<string | undefined>,
    run: (actor: ManagementActor) => Promise<ManagementResult<T>>,
    success: { status: number } = { status: 200 },
  ): Promise<Response> {
    const actor = await authentication.resolveIdentity(
      headers ?? new Headers(),
    );
    if (actor === null) {
      return plainError('unauthorized', 401, 'Authentication is required.');
    }
    if (
      slugs.some(
        (slug) =>
          slug === undefined || slug.length > 63 || !slugPattern.test(slug),
      )
    ) {
      return failureResponse({ code: 'not_found' });
    }
    const result = await run(actor);
    return result.ok
      ? jsonResponse(result.value, success.status)
      : failureResponse(result.error);
  }

  return {
    listManagedTenants: createAuthEndpoint(
      '/queue-pilot/tenants',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [], async (actor) => ({
          ok: true,
          value: await service.listTenants(actor),
        })),
    ),
    getManagedTenant: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.getTenant(actor, context.params.tenantSlug),
        ),
    ),
    updateManagedTenant: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/update',
      {
        method: 'POST',
        body: tenantUpdateBodySchema,
        use: [sessionMiddleware],
      },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.updateTenant(actor, context.params.tenantSlug, context.body),
        ),
    ),
    disableManagedTenant: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/disable',
      {
        method: 'POST',
        body: tenantDisableBodySchema,
        use: [sessionMiddleware],
      },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.disableTenant(actor, context.params.tenantSlug, context.body),
        ),
    ),
    listManagedMembers: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/members',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.listMembers(actor, context.params.tenantSlug),
        ),
    ),
    resolveManagedMember: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/members/resolve',
      {
        method: 'POST',
        body: memberResolveBodySchema,
        use: [sessionMiddleware],
      },
      (context) => {
        const headers = context.headers ?? new Headers();
        return respond(headers, [context.params.tenantSlug], (actor) =>
          service.resolveMember(
            actor,
            context.params.tenantSlug,
            context.body.githubLogin,
            () => authentication.getGitHubAccessToken(headers),
          ),
        );
      },
    ),
    upsertManagedMember: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/members/upsert',
      {
        method: 'POST',
        body: memberUpsertBodySchema,
        use: [sessionMiddleware],
      },
      (context) => {
        const headers = context.headers ?? new Headers();
        return respond(headers, [context.params.tenantSlug], (actor) =>
          service.upsertMember(
            actor,
            context.params.tenantSlug,
            context.body,
            () => authentication.getGitHubAccessToken(headers),
          ),
        );
      },
    ),
    disableManagedMember: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/members/disable',
      {
        method: 'POST',
        body: memberDisableBodySchema,
        use: [sessionMiddleware],
      },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.disableMember(actor, context.params.tenantSlug, context.body),
        ),
    ),
    listManagedEvents: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/events',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.listEvents(actor, context.params.tenantSlug),
        ),
    ),
    createManagedEvent: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/events/create',
      { method: 'POST', body: eventCreateBodySchema, use: [sessionMiddleware] },
      (context) =>
        respond(
          context.headers,
          [context.params.tenantSlug],
          (actor) =>
            service.createEvent(actor, context.params.tenantSlug, context.body),
          { status: 201 },
        ),
    ),
    getManagedEvent: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/events/:eventSlug',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(
          context.headers,
          [context.params.tenantSlug, context.params.eventSlug],
          (actor) =>
            service.getEvent(
              actor,
              context.params.tenantSlug,
              context.params.eventSlug,
            ),
        ),
    ),
    updateManagedEvent: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/events/:eventSlug/update',
      { method: 'POST', body: eventUpdateBodySchema, use: [sessionMiddleware] },
      (context) =>
        respond(
          context.headers,
          [context.params.tenantSlug, context.params.eventSlug],
          (actor) =>
            service.updateEvent(
              actor,
              context.params.tenantSlug,
              context.params.eventSlug,
              context.body,
            ),
        ),
    ),
    disableManagedEvent: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/events/:eventSlug/disable',
      {
        method: 'POST',
        body: eventDisableBodySchema,
        use: [sessionMiddleware],
      },
      (context) =>
        respond(
          context.headers,
          [context.params.tenantSlug, context.params.eventSlug],
          (actor) =>
            service.disableEvent(
              actor,
              context.params.tenantSlug,
              context.params.eventSlug,
              context.body,
            ),
        ),
    ),
    readManagedAudit: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/audit',
      { method: 'GET', query: auditQuerySchema, use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.readAudit(actor, context.params.tenantSlug, context.query),
        ),
    ),
    exportManagedTenant: createAuthEndpoint(
      '/queue-pilot/t/:tenantSlug/export',
      { method: 'GET', use: [sessionMiddleware] },
      (context) =>
        respond(context.headers, [context.params.tenantSlug], (actor) =>
          service.exportTenant(actor, context.params.tenantSlug),
        ),
    ),
  };
}

// Member lookups call GitHub on behalf of the signed-in administrator.
export const managementRateLimits: NonNullable<BetterAuthPlugin['rateLimit']> =
  [
    {
      pathMatcher: (path) =>
        path.startsWith('/queue-pilot/t/') && path.endsWith('/members/resolve'),
      window: 60,
      max: 20,
    },
  ];
