import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { expect, it, vi } from 'vitest';
import { loadConfig, type SharedAuthConfig } from '../../src/config.ts';
import { parseTenantManifest } from '../../src/domain/tenant-manifest.ts';
import { createBetterAuthAdapter } from '../../src/infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { applyTenantManifest } from '../../src/infrastructure/persistence/drizzle/tenant-config-store.ts';
import {
  createManagementAuthPlugin,
  managementAdminRole,
  managementStaffRole,
} from '../../src/presentation/http/management-auth-plugin.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';
import {
  type ManagementHarness,
  type TestUser,
  withManagementHarness,
} from './helpers/management-harness.ts';

const baseURL = 'https://queue-pilot.example.invalid';
const sharedManifestPath = fileURLToPath(
  new URL('../fixtures/shared-tenant-manifest.json', import.meta.url),
);
const sessionIdleSeconds = 43_200;
const sessionUpdateAgeSeconds = 300;
const sessionAbsoluteSeconds = 604_800;

function sharedAuthWithTrustedProxies(
  secret: string,
  trustedProxies: readonly string[],
): SharedAuthConfig {
  const config = loadConfig({
    DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:5432/fixture',
    AUTH_MODE: 'oidc/shared',
    AUTH_PROVIDER: 'github',
    AUTH_SECRET: secret,
    AUTH_TRUSTED_PROXIES: JSON.stringify(trustedProxies),
    PUBLIC_BASE_URL: baseURL,
    GITHUB_CLIENT_ID: 'fixture-client-id',
    GITHUB_CLIENT_SECRET: 'fixture-client-secret',
    APP_MANIFEST_PATH: sharedManifestPath,
  });
  if (config.authMode !== 'oidc/shared') {
    throw new Error('Expected shared authentication configuration.');
  }
  return config.sharedAuth;
}

async function refreshSession(h: ManagementHarness, user: TestUser) {
  const now = new Date();
  const staleUpdatedAt = new Date(
    now.getTime() - (sessionUpdateAgeSeconds * 1_000 + 1_000),
  );
  const staleExpiry = new Date(
    staleUpdatedAt.getTime() + sessionIdleSeconds * 1_000,
  );
  await h.owner.query(
    'UPDATE "session" SET "expiresAt" = $1, "updatedAt" = $2 WHERE token = $3',
    [staleExpiry, staleUpdatedAt, user.sessionToken],
  );

  const response = await h.authentication.handle(
    new Request(`${baseURL}/api/auth/get-session`, {
      headers: { Origin: baseURL, Cookie: user.cookie },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    session: { expiresAt: string } | null;
  };
  expect(body.session).not.toBeNull();
  const setCookie = response.headers.get('set-cookie');
  if (setCookie === null) {
    throw new Error('The refreshed session did not renew its cookie.');
  }
  expect(setCookie).toMatch(/; Max-Age=43200(?:;|$)/i);
  const refreshedCookie = setCookie.split(';', 1)[0];
  if (refreshedCookie === undefined || refreshedCookie === '') {
    throw new Error('The refreshed session cookie header is empty.');
  }

  const persisted = await h.owner.query<{
    expires_at: Date;
    updated_at: Date;
  }>(
    'SELECT "expiresAt" AS expires_at, "updatedAt" AS updated_at FROM "session" WHERE token = $1',
    [user.sessionToken],
  );
  const session = persisted.rows[0];
  expect(session).toBeDefined();
  expect(session?.expires_at.getTime()).toBeGreaterThan(staleExpiry.getTime());
  expect(session?.updated_at.getTime()).toBeGreaterThan(
    staleUpdatedAt.getTime(),
  );
  expect(body.session?.expiresAt).toBe(session?.expires_at.toISOString());
  return refreshedCookie;
}

async function manifestDisablingMember(tenantId: string, subject: string) {
  const template = parseTenantManifest(
    JSON.parse(await readFile(sharedManifestPath, 'utf8')) as unknown,
  );
  if (!template.ok) throw new Error('The fake manifest fixture is invalid.');
  const tenantTemplate = template.value.tenants[0];
  if (tenantTemplate === undefined) {
    throw new Error('The fake manifest fixture has no tenant.');
  }
  const result = parseTenantManifest({
    schemaVersion: 1,
    tenants: [
      {
        ...tenantTemplate,
        id: tenantId,
        slug: 'fair',
        displayName: 'Fake membership revocation tenant',
        members: [
          {
            issuer: 'https://github.com',
            subject,
            role: 'admin',
            disabled: true,
          },
        ],
      },
    ],
  });
  if (!result.ok) throw new Error('The generated fake manifest is invalid.');
  return result.value;
}

it('protects management plugin requests with session, trusted-origin, and database rate limits', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const userId = randomUUID();
    const appUserId = randomUUID();
    const sessionToken = randomBytes(24).toString('base64url');
    const currentTime = new Date();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(currentTime);
    const sessionCreatedAt = new Date(
      currentTime.getTime() - (sessionUpdateAgeSeconds * 1000 + 1_000),
    );
    await owner.query(
      'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, $4)',
      [userId, 'Test User', `${userId}@example.invalid`, currentTime],
    );
    await owner.query(
      'INSERT INTO app_users (id, issuer, subject) VALUES ($1, $2, $3)',
      [appUserId, 'https://github.com', '1234567'],
    );
    await owner.query(
      'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $5, $6)',
      [
        randomUUID(),
        new Date(sessionCreatedAt.getTime() + sessionIdleSeconds * 1_000),
        sessionToken,
        sessionCreatedAt,
        sessionCreatedAt,
        userId,
      ],
    );
    await owner.query(
      'INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
      [randomUUID(), '1234567', 'github', userId, currentTime],
    );

    const runtimeRole = `management_runtime_${randomBytes(8).toString('hex')}`;
    const runtimePassword = randomBytes(24).toString('base64url');
    await owner.query(
      `CREATE ROLE ${runtimeRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${runtimePassword}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${runtimeRole}`);
    const runtimeURL = new URL(urlFor('postgres'));
    runtimeURL.username = runtimeRole;
    runtimeURL.password = runtimePassword;
    const runtime = createDrizzleDatabase(runtimeURL.toString(), 1);
    const runtimePeer = createDrizzleDatabase(runtimeURL.toString(), 1);

    try {
      const plugin = createManagementAuthPlugin({
        endpoints: {
          sessionCookie: createAuthEndpoint(
            '/queue-pilot/session-cookie',
            { method: 'GET' },
            async (context) => {
              expect(context.context.options.session?.expiresIn).toBe(
                sessionIdleSeconds,
              );
              expect(context.context.options.session?.updateAge).toBe(
                sessionUpdateAgeSeconds,
              );
              expect(
                context.context.options.session?.disableSessionRefresh,
              ).not.toBe(true);
              expect(
                context.context.options.account?.accountLinking?.enabled,
              ).toBe(false);
              const session =
                await context.context.internalAdapter.findSession(sessionToken);
              if (session === null) {
                throw new Error('The test fixture session was not found.');
              }
              await setSessionCookie(context, session, false);
              return context.json({ ok: true });
            },
          ),
          sessionProbe: createAuthEndpoint(
            '/queue-pilot/session-probe',
            { method: 'GET', use: [sessionMiddleware] },
            async (context) => context.json({ ok: true }),
          ),
          sessionUpdateWithoutContext: createAuthEndpoint(
            '/queue-pilot/session-update-without-context',
            { method: 'POST' },
            async (context) => {
              const updated =
                await context.context.internalAdapter.updateSession(
                  sessionToken,
                  {
                    expiresAt: new Date(
                      currentTime.getTime() + sessionIdleSeconds * 1_000,
                    ),
                  },
                );
              return context.json({ updated: updated !== null });
            },
          ),
          originProbe: createAuthEndpoint(
            '/queue-pilot/origin-probe',
            { method: 'POST', use: [sessionMiddleware] },
            async (context) => context.json({ ok: true }),
          ),
          rateProbe: createAuthEndpoint(
            '/queue-pilot/rate-probe',
            { method: 'POST', use: [sessionMiddleware] },
            async (context) => context.json({ ok: true }),
          ),
          unknownRateProbe: createAuthEndpoint(
            '/queue-pilot/unknown-rate-probe',
            { method: 'POST', use: [sessionMiddleware] },
            async (context) => context.json({ ok: true }),
          ),
          sharedPoolRateProbe: createAuthEndpoint(
            '/queue-pilot/shared-pool-rate-probe',
            { method: 'POST' },
            async (context) => context.json({ ok: true }),
          ),
        },
        rateLimit: [
          {
            pathMatcher: (path) =>
              path === '/queue-pilot/rate-probe' ||
              path === '/queue-pilot/unknown-rate-probe' ||
              path === '/queue-pilot/shared-pool-rate-probe',
            window: 60,
            max: 1,
          },
        ],
      });
      const sharedAuth: SharedAuthConfig = {
        baseURL,
        secret: randomBytes(32).toString('base64url'),
        clientIpTrustedProxies: [],
        registration: {
          enabled: false,
          policy: 'allowlist',
          githubUserIds: [],
          githubOrgIds: [],
          maxPerUser: 100,
        },
        session: {
          idleSeconds: sessionIdleSeconds,
          updateAgeSeconds: sessionUpdateAgeSeconds,
          absoluteSeconds: sessionAbsoluteSeconds,
        },
        provider: {
          kind: 'github',
          clientId: 'fixture-client-id',
          clientSecret: 'fixture-client-secret',
        },
      };
      vi.stubEnv('NODE_ENV', 'production');
      const authentication = await createBetterAuthAdapter(
        runtime.db,
        sharedAuth,
        [plugin],
      );
      const cookieResponse = await authentication.handle(
        new Request(`${baseURL}/api/auth/queue-pilot/session-cookie`, {
          headers: { Origin: baseURL },
        }),
      );
      expect(cookieResponse.status).toBe(200);
      const setCookie = cookieResponse.headers.get('set-cookie');
      if (setCookie === null) {
        throw new Error('The test session endpoint did not set a cookie.');
      }
      expect(setCookie).toMatch(/; Secure(?:;|$)/i);
      expect(setCookie).toMatch(/; HttpOnly(?:;|$)/i);
      expect(setCookie).toMatch(/; SameSite=Lax(?:;|$)/i);
      expect(setCookie).toMatch(/; Max-Age=[0-9]+(?:;|$)/i);
      const cookieHeader = setCookie.split(';', 1)[0];
      if (cookieHeader === undefined) {
        throw new Error('The test session cookie header is empty.');
      }
      const githubSignIn = await authentication.handle(
        new Request(`${baseURL}/api/auth/sign-in/social`, {
          method: 'POST',
          headers: {
            Origin: baseURL,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'github',
            callbackURL: `${baseURL}/after-login`,
            disableRedirect: true,
          }),
        }),
      );
      expect(githubSignIn.status).toBe(200);
      const githubSignInBody = (await githubSignIn.json()) as { url: string };
      expect(
        new URL(githubSignInBody.url).searchParams.get('redirect_uri'),
      ).toBe(`${baseURL}/api/auth/callback/github`);
      const issuer = 'https://identity.example.invalid';
      const discoveryURL = `${issuer}/.well-known/openid-configuration`;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                issuer,
                authorization_endpoint: `${issuer}/authorize`,
                token_endpoint: `${issuer}/token`,
                userinfo_endpoint: `${issuer}/userinfo`,
                jwks_uri: `${issuer}/jwks`,
                id_token_signing_alg_values_supported: ['RS256'],
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
        ),
      );
      try {
        const oidcAuthentication = await createBetterAuthAdapter(runtime.db, {
          baseURL,
          secret: randomBytes(32).toString('base64url'),
          clientIpTrustedProxies: [],
          session: {
            idleSeconds: sessionIdleSeconds,
            updateAgeSeconds: sessionUpdateAgeSeconds,
            absoluteSeconds: sessionAbsoluteSeconds,
          },
          registration: {
            enabled: false,
            policy: 'allowlist',
            githubUserIds: [],
            githubOrgIds: [],
            maxPerUser: 100,
          },
          provider: {
            kind: 'oidc',
            issuer,
            discoveryURL,
            clientId: 'fixture-oidc-client-id',
            clientSecret: 'fixture-oidc-client-secret',
          },
        });
        expect(oidcAuthentication.rateLimitWindowMs).toBe(60_000);
        const oidcSignIn = await oidcAuthentication.handle(
          new Request(`${baseURL}/api/auth/sign-in/social`, {
            method: 'POST',
            headers: {
              Origin: baseURL,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              provider: 'oidc',
              callbackURL: `${baseURL}/after-login`,
              disableRedirect: true,
            }),
          }),
        );
        expect(oidcSignIn.status).toBe(200);
        const oidcSignInBody = (await oidcSignIn.json()) as { url: string };
        expect(
          new URL(oidcSignInBody.url).searchParams.get('redirect_uri'),
        ).toBe(`${baseURL}/api/auth/callback/oidc`);
      } finally {
        vi.unstubAllGlobals();
      }
      const send = (
        path: string,
        method: 'GET' | 'POST',
        origin = baseURL,
        authenticated = true,
        extraHeaders: Record<string, string> = {},
        handle = authentication.handle,
      ) =>
        handle(
          new Request(`${baseURL}/api/auth${path}`, {
            method,
            headers: {
              Origin: origin,
              ...(authenticated ? { Cookie: cookieHeader } : {}),
              ...extraHeaders,
              ...(method === 'POST'
                ? { 'Content-Type': 'application/json' }
                : {}),
            },
            ...(method === 'POST' ? { body: '{}' } : {}),
          }),
        );

      const unauthenticated = await send(
        '/queue-pilot/session-probe',
        'GET',
        baseURL,
        false,
      );
      expect(unauthenticated.status).toBe(401);
      expect((await send('/queue-pilot/session-probe', 'GET')).status).toBe(
        200,
      );
      expect(
        (
          await send(
            '/queue-pilot/origin-probe',
            'POST',
            'https://untrusted.example.invalid',
          )
        ).status,
      ).toBe(403);
      expect((await send('/queue-pilot/origin-probe', 'POST')).status).toBe(
        200,
      );
      expect((await send('/queue-pilot/rate-probe', 'POST')).status).toBe(200);
      expect(
        (
          await send('/queue-pilot/rate-probe', 'POST', baseURL, true, {
            'x-forwarded-for': '198.51.100.10',
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await send('/queue-pilot/rate-probe', 'POST', baseURL, true, {
            'x-forwarded-for': '198.51.100.10, 203.0.113.10',
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await send('/queue-pilot/rate-probe', 'POST', baseURL, true, {
            'cf-connecting-ip': '203.0.113.10',
          })
        ).status,
      ).toBe(429);

      const trustedAuthentication = await createBetterAuthAdapter(
        runtime.db,
        sharedAuthWithTrustedProxies(sharedAuth.secret, [
          '192.0.2.0/24',
          '2001:db8:ffff::/48',
        ]),
        [plugin],
      );
      const peerAuthentication = await createBetterAuthAdapter(
        runtimePeer.db,
        sharedAuthWithTrustedProxies(sharedAuth.secret, [
          '192.0.2.0/24',
          '2001:db8:ffff::/48',
        ]),
        [plugin],
      );
      const trustedChain = '203.0.113.10, 192.0.2.3, 2001:db8:ffff::1';
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': trustedChain,
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': `198.51.100.77, ${trustedChain}`,
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(429);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '203.0.113.11, 192.0.2.3, 2001:db8:ffff::1',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '203.0.113.12',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '2001:db8:abcd:1::10, 192.0.2.3',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '2001:db8:abcd:1::20, 192.0.2.3',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(429);
      expect(
        (
          await send(
            '/queue-pilot/rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '2001:db8:abcd:2::20, 192.0.2.3',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/unknown-rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': '192.0.2.3, 2001:db8:ffff::1',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/unknown-rate-probe',
            'POST',
            baseURL,
            true,
            {},
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(429);
      expect(
        (
          await send(
            '/queue-pilot/unknown-rate-probe',
            'POST',
            baseURL,
            true,
            {
              'x-forwarded-for': 'not-an-ip, 192.0.2.3',
            },
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(429);

      const sharedClientHeaders = {
        'x-forwarded-for': '203.0.113.40, 192.0.2.3',
      };
      expect(
        (
          await send(
            '/queue-pilot/shared-pool-rate-probe',
            'POST',
            baseURL,
            true,
            sharedClientHeaders,
            trustedAuthentication.handle,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await send(
            '/queue-pilot/shared-pool-rate-probe',
            'POST',
            baseURL,
            true,
            sharedClientHeaders,
            peerAuthentication.handle,
          )
        ).status,
      ).toBe(429);
      expect(
        (
          await send(
            '/queue-pilot/shared-pool-rate-probe',
            'POST',
            baseURL,
            true,
            { 'x-forwarded-for': '203.0.113.41, 192.0.2.3' },
            peerAuthentication.handle,
          )
        ).status,
      ).toBe(200);

      const storedRateLimits = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "rateLimit"',
      );
      expect(Number(storedRateLimits.rows[0]?.count)).toBeGreaterThan(0);
      expect(managementAdminRole.authorize({ config: ['write'] }).success).toBe(
        true,
      );
      expect(managementStaffRole.authorize({ ticket: ['read'] }).success).toBe(
        true,
      );
      expect(managementStaffRole.authorize({ config: ['write'] }).success).toBe(
        false,
      );
      const recentSessionExpiry = new Date(
        currentTime.getTime() + sessionIdleSeconds * 1_000,
      );
      await owner.query(
        'UPDATE "session" SET "expiresAt" = $1, "updatedAt" = $2 WHERE token = $3',
        [recentSessionExpiry, currentTime, sessionToken],
      );
      const beforeUpdateAge = await send('/get-session', 'GET');
      expect(beforeUpdateAge.status).toBe(200);
      expect(beforeUpdateAge.headers.get('set-cookie')).toBeNull();
      const unchangedSession = await owner.query<{
        expires_at: Date;
        updated_at: Date;
      }>(
        'SELECT "expiresAt" AS expires_at, "updatedAt" AS updated_at FROM "session" WHERE token = $1',
        [sessionToken],
      );
      expect(unchangedSession.rows[0]?.expires_at.getTime()).toBe(
        recentSessionExpiry.getTime(),
      );
      expect(unchangedSession.rows[0]?.updated_at.getTime()).toBe(
        currentTime.getTime(),
      );

      const staleUpdatedAt = new Date(
        currentTime.getTime() - (sessionUpdateAgeSeconds * 1_000 + 1_000),
      );
      const staleSessionExpiry = new Date(
        staleUpdatedAt.getTime() + sessionIdleSeconds * 1_000,
      );
      await owner.query(
        'UPDATE "session" SET "expiresAt" = $1, "updatedAt" = $2 WHERE token = $3',
        [staleSessionExpiry, staleUpdatedAt, sessionToken],
      );
      const resolvedWithoutRefresh = await authentication.resolveSession(
        new Headers({ Cookie: cookieHeader }),
      );
      expect(resolvedWithoutRefresh).toMatchObject({ userId: appUserId });
      const unchangedByResolve = await owner.query<{
        expires_at: Date;
        updated_at: Date;
      }>(
        'SELECT "expiresAt" AS expires_at, "updatedAt" AS updated_at FROM "session" WHERE token = $1',
        [sessionToken],
      );
      expect(unchangedByResolve.rows[0]?.expires_at.getTime()).toBe(
        staleSessionExpiry.getTime(),
      );
      expect(unchangedByResolve.rows[0]?.updated_at.getTime()).toBe(
        staleUpdatedAt.getTime(),
      );

      const refreshedSessionResponse = await send('/get-session', 'GET');
      expect(refreshedSessionResponse.status).toBe(200);
      const refreshedSessionBody = (await refreshedSessionResponse.json()) as {
        session: { expiresAt: string } | null;
      };
      expect(refreshedSessionBody.session?.expiresAt).toBe(
        recentSessionExpiry.toISOString(),
      );
      const refreshedCookie =
        refreshedSessionResponse.headers.get('set-cookie');
      if (refreshedCookie === null) {
        throw new Error('The refreshed session did not renew its cookie.');
      }
      expect(refreshedCookie).toMatch(/; Max-Age=43200(?:;|$)/i);
      expect(refreshedCookie).toMatch(/; Secure(?:;|$)/i);
      expect(refreshedCookie).toMatch(/; HttpOnly(?:;|$)/i);
      expect(refreshedCookie).toMatch(/; SameSite=Lax(?:;|$)/i);
      expect(refreshedCookie).toMatch(/; Path=\/(?:;|$)/i);
      const persistedRefresh = await owner.query<{ updated_at: Date }>(
        'SELECT "updatedAt" AS updated_at FROM "session" WHERE token = $1',
        [sessionToken],
      );
      expect(persistedRefresh.rows[0]?.updated_at.getTime()).toBe(
        currentTime.getTime(),
      );

      await owner.query('UPDATE app_users SET disabled_at = $1 WHERE id = $2', [
        currentTime,
        appUserId,
      ]);
      expect(
        await authentication.resolveSession(
          new Headers({ Cookie: cookieHeader }),
        ),
      ).toBeNull();
      await owner.query(
        'UPDATE app_users SET disabled_at = NULL WHERE id = $1',
        [appUserId],
      );

      const idleExpiredAt = new Date(currentTime.getTime() - 1);
      await owner.query(
        'UPDATE "session" SET "expiresAt" = $1 WHERE token = $2',
        [idleExpiredAt, sessionToken],
      );
      expect(
        await authentication.resolveSession(
          new Headers({ Cookie: cookieHeader }),
        ),
      ).toBeNull();
      const expiredSessionResponse = await send('/get-session', 'GET');
      expect(expiredSessionResponse.status).toBe(200);
      expect(await expiredSessionResponse.json()).toBeNull();
      const expiredSessionRows = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "session" WHERE token = $1',
        [sessionToken],
      );
      expect(Number(expiredSessionRows.rows[0]?.count)).toBe(0);

      await owner.query(
        'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
        [randomUUID(), recentSessionExpiry, sessionToken, currentTime, userId],
      );
      const contextlessUpdate = await send(
        '/queue-pilot/session-update-without-context',
        'POST',
      );
      expect(contextlessUpdate.status).toBe(200);
      expect(await contextlessUpdate.json()).toEqual({ updated: true });
      const contextlessExpiry = await owner.query<{ expires_at: Date }>(
        'SELECT "expiresAt" AS expires_at FROM "session" WHERE token = $1',
        [sessionToken],
      );
      expect(contextlessExpiry.rows[0]?.expires_at.getTime()).toBe(
        currentTime.getTime(),
      );
      vi.setSystemTime(new Date(currentTime.getTime() + 1));
      expect(
        await authentication.resolveSession(
          new Headers({ Cookie: cookieHeader }),
        ),
      ).toBeNull();
      vi.setSystemTime(currentTime);

      const absoluteCreatedAt = new Date(
        currentTime.getTime() - (sessionAbsoluteSeconds - 3_600) * 1_000,
      );
      const absoluteCap = new Date(
        absoluteCreatedAt.getTime() + sessionAbsoluteSeconds * 1_000,
      );
      await owner.query(
        'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $5, $6)',
        [
          randomUUID(),
          staleSessionExpiry,
          sessionToken,
          absoluteCreatedAt,
          staleUpdatedAt,
          userId,
        ],
      );
      const absoluteRefresh = await send('/get-session', 'GET');
      expect(absoluteRefresh.status).toBe(200);
      const absoluteRefreshBody = (await absoluteRefresh.json()) as {
        session: { expiresAt: string } | null;
      };
      expect(absoluteRefreshBody.session?.expiresAt).toBe(
        absoluteCap.toISOString(),
      );
      vi.setSystemTime(new Date(absoluteCap.getTime() + 1));
      expect((await send('/queue-pilot/session-probe', 'GET')).status).toBe(
        401,
      );

      vi.setSystemTime(currentTime);
      await owner.query(
        'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
        [randomUUID(), recentSessionExpiry, sessionToken, currentTime, userId],
      );
      const signedOut = await send('/sign-out', 'POST');
      expect(signedOut.status).toBe(200);
      expect((await send('/queue-pilot/session-probe', 'GET')).status).toBe(
        401,
      );

      await owner.query(
        'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
        [randomUUID(), recentSessionExpiry, sessionToken, currentTime, userId],
      );
      await authentication.revokeMemberSessions(
        'https://github.com',
        '1234567',
      );
      const revokedSessions = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "session" WHERE "userId" = $1',
        [userId],
      );
      expect(Number(revokedSessions.rows[0]?.count)).toBe(0);
      expect((await send('/queue-pilot/session-probe', 'GET')).status).toBe(
        401,
      );
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      await Promise.all([runtime.close(), runtimePeer.close()]);
    }
  });
}, 120_000);

it('rejects refreshed sessions after manifest membership disable, sign-out, and tenant disable', async () => {
  await withManagementHarness(async (h) => {
    const manifestMember = await h.addUser('manifest-member', '91001');
    const manifestTenantId = await h.seedTenant({
      slug: 'fair',
      admins: [manifestMember],
    });
    const manifestCookie = await refreshSession(h, manifestMember);
    await h.owner.query(
      "UPDATE configuration_authority SET mode = 'manifest', revision = revision + 1 WHERE id = 1",
    );
    await applyTenantManifest(
      h.urlFor('postgres'),
      await manifestDisablingMember(manifestTenantId, manifestMember.subject),
      undefined,
    );
    await h.owner.query(
      "UPDATE configuration_authority SET mode = 'database', revision = revision + 1 WHERE id = 1",
    );
    const revoked = await h.owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "session" WHERE token = $1',
      [manifestMember.sessionToken],
    );
    expect(revoked.rows[0]?.count).toBe('0');
    expect(
      (
        await h.request(manifestMember, 'GET', '/t/fair', undefined, {
          Cookie: manifestCookie,
        })
      ).status,
    ).toBe(401);

    const signedOutUser = await h.addUser('signed-out-member', '91002');
    await h.seedTenant({ slug: 'signout', admins: [signedOutUser] });
    const signedOutCookie = await refreshSession(h, signedOutUser);
    const signedOut = await h.authentication.handle(
      new Request(`${baseURL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Origin: baseURL,
          Cookie: signedOutCookie,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
    );
    expect(signedOut.status).toBe(200);
    expect(
      (
        await h.request(signedOutUser, 'GET', '/t/signout', undefined, {
          Cookie: signedOutCookie,
        })
      ).status,
    ).toBe(401);

    const tenantAdmin = await h.addUser('disabled-tenant-admin', '91003');
    await h.seedTenant({ slug: 'disabled', admins: [tenantAdmin] });
    const tenantCookie = await refreshSession(h, tenantAdmin);
    const disabled = await h.request(
      tenantAdmin,
      'POST',
      '/t/disabled/disable',
      { expectedRevision: 1, confirmSlug: 'disabled' },
      { Cookie: tenantCookie },
    );
    expect(disabled.status).toBe(200);
    expect(
      (
        await h.request(tenantAdmin, 'GET', '/t/disabled', undefined, {
          Cookie: tenantCookie,
        })
      ).status,
    ).toBe(404);
  });
}, 180_000);
