import { describe, expect, it, vi } from 'vitest';
import {
  type ActiveOrganizationMembershipReader,
  createTenantRegistrationService,
  type RegisteredTenant,
  type RegistrationCounts,
  type TenantRegistrationIdentity,
  type TenantRegistrationRateLimiter,
  type TenantRegistrationSettings,
  type TenantRegistrationStore,
} from './tenant-registration.ts';

const identity: TenantRegistrationIdentity = {
  authUserId: 'auth-user-1',
  sessionId: 'session-1',
  issuer: 'https://github.com',
  subject: '1234567',
};
const counts: RegistrationCounts = {
  identityState: 'missing',
  perUserCount: 0,
  totalCount: 0,
};
const tenant: RegisteredTenant = {
  id: '20000000-0000-4000-8000-000000000003',
  slug: 'new-tenant',
  displayName: 'New Tenant',
  revision: 1,
};
const settings: TenantRegistrationSettings = {
  enabled: true,
  policy: 'allowlist',
  githubUserIds: ['1234567'],
  githubOrgIds: [],
  maxPerUser: 100,
};

function fixture(
  overrides: {
    settings?: Partial<TenantRegistrationSettings>;
    counts?: RegistrationCounts;
    membershipResult?: Awaited<
      ReturnType<ActiveOrganizationMembershipReader['listActiveMemberships']>
    >;
    rateLimitResult?: Awaited<
      ReturnType<TenantRegistrationRateLimiter['consume']>
    >;
    createResult?: Awaited<ReturnType<TenantRegistrationStore['create']>>;
  } = {},
) {
  const store: TenantRegistrationStore = {
    getCounts: vi.fn<TenantRegistrationStore['getCounts']>(
      async () => overrides.counts ?? counts,
    ),
    create: vi.fn<TenantRegistrationStore['create']>(
      async () => overrides.createResult ?? { ok: true, tenant },
    ),
  };
  const memberships: ActiveOrganizationMembershipReader = {
    listActiveMemberships: vi.fn<
      ActiveOrganizationMembershipReader['listActiveMemberships']
    >(
      async () => overrides.membershipResult ?? { kind: 'ok', memberships: [] },
    ),
  };
  const rateLimiter: TenantRegistrationRateLimiter = {
    consume: vi.fn<TenantRegistrationRateLimiter['consume']>(
      async () => overrides.rateLimitResult ?? { allowed: true },
    ),
  };
  const service = createTenantRegistrationService(
    { ...settings, ...overrides.settings },
    store,
    memberships,
    rateLimiter,
  );
  return { service, store, memberships, rateLimiter };
}

describe('createTenantRegistrationService', () => {
  it('does not query the database or GitHub when signup is disabled', async () => {
    const { service, store, memberships } = fixture({
      settings: { enabled: false },
    });
    const getAccessToken = vi.fn(async () => 'access-token');

    await expect(
      service.getPolicy(identity, getAccessToken),
    ).resolves.toMatchObject({
      enabled: false,
      eligible: false,
      reason: 'registration_disabled',
    });
    expect(store.getCounts).not.toHaveBeenCalled();
    expect(memberships.listActiveMemberships).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('requires a matching active GitHub organization membership', async () => {
    const { service, memberships } = fixture({
      settings: { githubUserIds: [], githubOrgIds: ['7654321'] },
      membershipResult: {
        kind: 'ok',
        memberships: [
          { userId: '9999999', organizationId: '7654321' },
          { userId: '1234567', organizationId: '8888888' },
          { userId: '1234567', organizationId: '7654321' },
        ],
      },
    });
    const getAccessToken = vi.fn(async () => 'access-token');

    await expect(
      service.getPolicy(identity, getAccessToken),
    ).resolves.toMatchObject({
      eligible: true,
      remainingForUser: 100,
    });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(memberships.listActiveMemberships).toHaveBeenCalledWith(
      'access-token',
    );
  });

  it.each([
    [
      'revoked organization consent',
      { kind: 'reauth_required' as const },
      'reauth_required',
    ],
    [
      'GitHub API outage',
      { kind: 'unavailable' as const },
      'organization_unavailable',
    ],
  ])('fails closed on %s', async (_label, membershipResult, reason) => {
    const { service, store } = fixture({
      settings: { githubUserIds: [], githubOrgIds: ['7654321'] },
      membershipResult,
    });

    await expect(
      service.getPolicy(identity, async () => 'access-token'),
    ).resolves.toMatchObject({ eligible: false, reason });
    expect(store.getCounts).not.toHaveBeenCalled();
  });

  it.each([
    [
      { identityState: 'disabled' as const, perUserCount: 0, totalCount: 0 },
      'identity_disabled',
    ],
    [
      { identityState: 'active' as const, perUserCount: 100, totalCount: 100 },
      'tenant_limit',
    ],
    [
      { identityState: 'active' as const, perUserCount: 1, totalCount: 4 },
      'tenant_total_limit',
    ],
  ])(
    'blocks identities and quotas at the configured boundary',
    async (resultCounts, reason) => {
      const { service } = fixture({
        counts: resultCounts,
        settings: { maxTotal: 4 },
      });

      await expect(
        service.getPolicy(identity, async () => null),
      ).resolves.toMatchObject({ eligible: false, reason });
    },
  );

  it('passes configured quotas to the atomic store operation', async () => {
    const { service, store, rateLimiter } = fixture({
      settings: { maxPerUser: 250, maxTotal: 4000 },
    });

    await expect(
      service.create(
        identity,
        { slug: 'new-tenant', displayName: 'New Tenant' },
        '192.0.2.10',
        async () => null,
      ),
    ).resolves.toEqual({ ok: true, tenant });
    expect(rateLimiter.consume).toHaveBeenCalledWith(identity, '192.0.2.10');
    expect(store.create).toHaveBeenCalledWith(
      identity,
      { slug: 'new-tenant', displayName: 'New Tenant' },
      { maxPerUser: 250, maxTotal: 4000 },
    );
  });

  it('rejects a rate-limited request before querying registration state', async () => {
    const { service, store } = fixture({
      rateLimitResult: { allowed: false, retryAfterMs: 30_000 },
    });

    await expect(
      service.create(
        identity,
        { slug: 'new-tenant', displayName: 'New Tenant' },
        null,
        async () => null,
      ),
    ).resolves.toEqual({
      ok: false,
      status: 429,
      code: 'rate_limited',
      retryAfterMs: 30_000,
    });
    expect(store.getCounts).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });
});
