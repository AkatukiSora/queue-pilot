export type TenantRegistrationSettings = {
  enabled: boolean;
  policy: 'closed' | 'allowlist' | 'public';
  githubUserIds: readonly string[];
  githubOrgIds: readonly string[];
  maxPerUser: number;
  maxTotal?: number;
};

export type TenantRegistrationIdentity = {
  authUserId: string;
  sessionId: string;
  issuer: string;
  subject: string;
};

export type RegistrationCounts = {
  identityState: 'active' | 'disabled' | 'missing';
  perUserCount: number;
  totalCount: number;
};

export type RegisteredTenant = {
  id: string;
  slug: string;
  displayName: string;
  revision: number;
};

export type TenantRegistrationStoreFailure =
  | 'slug_conflict'
  | 'tenant_limit'
  | 'tenant_total_limit'
  | 'identity_disabled'
  | 'invalid_slug'
  | 'reserved_slug'
  | 'invalid_display_name'
  | 'database_authority_required';

export type TenantRegistrationStore = {
  getCounts: (
    identity: TenantRegistrationIdentity,
  ) => Promise<RegistrationCounts>;
  create: (
    identity: TenantRegistrationIdentity,
    input: { slug: string; displayName: string },
    limits: { maxPerUser: number; maxTotal: number | null },
  ) => Promise<
    | { ok: true; tenant: RegisteredTenant }
    | { ok: false; reason: TenantRegistrationStoreFailure }
  >;
};

export type ActiveOrganizationMembershipReader = {
  listActiveMemberships: (accessToken: string) => Promise<
    | {
        kind: 'ok';
        memberships: readonly { userId: string; organizationId: string }[];
      }
    | { kind: 'reauth_required' }
    | { kind: 'unavailable' }
  >;
};

export type TenantRegistrationRateLimiter = {
  consume: (
    identity: Pick<TenantRegistrationIdentity, 'issuer' | 'subject'>,
    clientIp: string | null,
  ) => Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }>;
};

export type TenantRegistrationBlockReason =
  | 'registration_disabled'
  | 'registration_closed'
  | 'unsupported_identity'
  | 'not_allowlisted'
  | 'identity_disabled'
  | 'tenant_limit'
  | 'tenant_total_limit'
  | 'reauth_required'
  | 'organization_unavailable';

export type TenantRegistrationPolicyView = {
  enabled: boolean;
  policy: TenantRegistrationSettings['policy'];
  eligible: boolean;
  reason: TenantRegistrationBlockReason | null;
  maxPerUser: number;
  remainingForUser: number;
};

export type TenantRegistrationOutcome =
  | { ok: true; tenant: RegisteredTenant }
  | {
      ok: false;
      status: 400 | 403 | 409 | 503;
      code: TenantRegistrationBlockReason | TenantRegistrationStoreFailure;
    }
  | { ok: false; status: 429; code: 'rate_limited'; retryAfterMs: number };

export type TenantRegistrationService = ReturnType<
  typeof createTenantRegistrationService
>;

export function createTenantRegistrationService(
  settings: TenantRegistrationSettings,
  store: TenantRegistrationStore,
  memberships: ActiveOrganizationMembershipReader,
  rateLimiter: TenantRegistrationRateLimiter,
) {
  async function evaluate(
    identity: TenantRegistrationIdentity,
    getAccessToken: () => Promise<string | null>,
  ): Promise<
    | { eligible: true; counts: RegistrationCounts }
    | { eligible: false; reason: TenantRegistrationBlockReason }
  > {
    if (!settings.enabled) {
      return { eligible: false, reason: 'registration_disabled' };
    }
    if (settings.policy === 'closed') {
      return { eligible: false, reason: 'registration_closed' };
    }
    if (
      identity.issuer !== 'https://github.com' ||
      !/^[1-9][0-9]*$/.test(identity.subject)
    ) {
      return { eligible: false, reason: 'unsupported_identity' };
    }

    const userAllowed = settings.githubUserIds.includes(identity.subject);
    if (settings.policy === 'allowlist' && !userAllowed) {
      if (settings.githubOrgIds.length === 0) {
        return { eligible: false, reason: 'not_allowlisted' };
      }
      const accessToken = await getAccessToken();
      if (accessToken === null) {
        return { eligible: false, reason: 'reauth_required' };
      }
      const result = await memberships.listActiveMemberships(accessToken);
      if (result.kind === 'reauth_required') {
        return { eligible: false, reason: 'reauth_required' };
      }
      if (result.kind === 'unavailable') {
        return { eligible: false, reason: 'organization_unavailable' };
      }
      const allowedOrganizations = new Set(settings.githubOrgIds);
      if (
        !result.memberships.some(
          ({ userId, organizationId }) =>
            userId === identity.subject &&
            allowedOrganizations.has(organizationId),
        )
      ) {
        return { eligible: false, reason: 'not_allowlisted' };
      }
    }

    const counts = await store.getCounts(identity);
    if (counts.identityState === 'disabled') {
      return { eligible: false, reason: 'identity_disabled' };
    }
    if (counts.perUserCount >= settings.maxPerUser) {
      return { eligible: false, reason: 'tenant_limit' };
    }
    if (
      settings.maxTotal !== undefined &&
      counts.totalCount >= settings.maxTotal
    ) {
      return { eligible: false, reason: 'tenant_total_limit' };
    }
    return { eligible: true, counts };
  }

  function deniedOutcome(
    reason: TenantRegistrationBlockReason | TenantRegistrationStoreFailure,
  ): TenantRegistrationOutcome {
    return {
      ok: false,
      status:
        reason === 'invalid_slug' ||
        reason === 'reserved_slug' ||
        reason === 'invalid_display_name'
          ? 400
          : reason === 'tenant_limit' ||
              reason === 'tenant_total_limit' ||
              reason === 'slug_conflict'
            ? 409
            : reason === 'organization_unavailable' ||
                reason === 'reauth_required' ||
                reason === 'database_authority_required'
              ? 503
              : 403,
      code: reason,
    };
  }

  return {
    getPolicy: async (
      identity: TenantRegistrationIdentity,
      getAccessToken: () => Promise<string | null>,
    ): Promise<TenantRegistrationPolicyView> => {
      const result = await evaluate(identity, getAccessToken);
      if (!result.eligible) {
        return {
          enabled: settings.enabled,
          policy: settings.policy,
          eligible: false,
          reason: result.reason,
          maxPerUser: settings.maxPerUser,
          remainingForUser: 0,
        };
      }
      return {
        enabled: settings.enabled,
        policy: settings.policy,
        eligible: true,
        reason: null,
        maxPerUser: settings.maxPerUser,
        remainingForUser: settings.maxPerUser - result.counts.perUserCount,
      };
    },
    create: async (
      identity: TenantRegistrationIdentity,
      input: { slug: string; displayName: string },
      clientIp: string | null,
      getAccessToken: () => Promise<string | null>,
    ): Promise<TenantRegistrationOutcome> => {
      const rateLimit = await rateLimiter.consume(identity, clientIp);
      if (!rateLimit.allowed) {
        return {
          ok: false,
          status: 429,
          code: 'rate_limited',
          retryAfterMs: rateLimit.retryAfterMs,
        };
      }
      const eligibility = await evaluate(identity, getAccessToken);
      if (!eligibility.eligible) {
        return deniedOutcome(eligibility.reason);
      }
      const result = await store.create(identity, input, {
        maxPerUser: settings.maxPerUser,
        maxTotal: settings.maxTotal ?? null,
      });
      if (!result.ok) {
        return deniedOutcome(result.reason);
      }
      return result;
    },
  };
}
