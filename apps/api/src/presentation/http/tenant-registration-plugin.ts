import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, getIP, sessionMiddleware } from 'better-auth/api';
import type {
  TenantRegistrationIdentity,
  TenantRegistrationService,
} from '../../application/tenant-registration.ts';
import { jsonResponse } from './json-response.ts';
import { tenantRegistrationCreateBodySchema } from './tenant-registration-schemas.ts';

export type TenantRegistrationAuthentication = {
  resolveRegistrationIdentity: (
    headers: Headers,
  ) => Promise<TenantRegistrationIdentity | null>;
  getGitHubAccessToken: (headers: Headers) => Promise<string | null>;
};

const reservedSlugs = new Set([
  'api',
  'auth',
  'admin',
  'login',
  'logout',
  'signup',
  'new',
  'manage',
  'settings',
  'healthz',
  'readyz',
  'ticket',
  't',
  'e',
]);

const publicMessages: Record<string, string> = {
  registration_disabled: 'Self-service registration is disabled.',
  registration_closed: 'Self-service registration is closed.',
  unsupported_identity: 'A verified GitHub identity is required.',
  not_allowlisted: 'This GitHub identity is not allowed to register.',
  identity_disabled: 'This identity is disabled.',
  tenant_limit: 'The per-user tenant limit has been reached.',
  tenant_total_limit: 'The system-wide tenant limit has been reached.',
  reauth_required: 'Reconnect GitHub and grant organization access.',
  organization_unavailable: 'GitHub membership could not be verified.',
  slug_conflict: 'The tenant slug is already in use.',
  invalid_slug: 'The tenant slug is invalid.',
  reserved_slug: 'The tenant slug is reserved.',
  invalid_display_name: 'The tenant display name is invalid.',
  database_authority_required: 'Tenant registration is not available.',
  rate_limited: 'Too many registration attempts.',
};

function errorResponse(
  code: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message: publicMessages[code] ?? 'The request could not be completed.',
      },
    },
    status,
    extraHeaders,
  );
}

export function createTenantRegistrationPlugin(options: {
  service: TenantRegistrationService;
  authentication: TenantRegistrationAuthentication;
}): BetterAuthPlugin {
  return {
    id: 'queue-pilot-tenant-registration',
    endpoints: {
      registrationPolicy: createAuthEndpoint(
        '/queue-pilot/registration-policy',
        { method: 'GET', use: [sessionMiddleware] },
        async (context) => {
          const headers = context.headers ?? new Headers();
          const identity =
            await options.authentication.resolveRegistrationIdentity(headers);
          if (identity === null) return errorResponse('unauthorized', 401);

          const policy = await options.service.getPolicy(identity, () =>
            options.authentication.getGitHubAccessToken(headers),
          );
          if (
            policy.reason === 'reauth_required' ||
            policy.reason === 'organization_unavailable'
          ) {
            return errorResponse(policy.reason, 503);
          }
          return jsonResponse(policy, 200);
        },
      ),
      createTenant: createAuthEndpoint(
        '/queue-pilot/tenants/create',
        {
          method: 'POST',
          body: tenantRegistrationCreateBodySchema,
          use: [sessionMiddleware],
        },
        async (context) => {
          const headers = context.headers ?? new Headers();
          const identity =
            await options.authentication.resolveRegistrationIdentity(headers);
          if (identity === null) return errorResponse('unauthorized', 401);
          const body = context.body;
          if (reservedSlugs.has(body.slug)) {
            return errorResponse('reserved_slug', 400);
          }
          const outcome = await options.service.create(
            identity,
            { slug: body.slug, displayName: body.displayName },
            getIP(headers, context.context.options) ?? null,
            () => options.authentication.getGitHubAccessToken(headers),
          );
          if (!outcome.ok) {
            if (outcome.status === 429) {
              return errorResponse('rate_limited', 429, {
                'Retry-After': String(
                  Math.max(1, Math.ceil(outcome.retryAfterMs / 1000)),
                ),
              });
            }
            return errorResponse(outcome.code, outcome.status);
          }
          return jsonResponse({ tenant: outcome.tenant, role: 'admin' }, 201);
        },
      ),
    },
  };
}
