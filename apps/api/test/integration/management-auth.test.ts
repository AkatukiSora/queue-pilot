import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { expect, it, vi } from 'vitest';
import { loadConfig, type SharedAuthConfig } from '../../src/config.ts';
import { createBetterAuthAdapter } from '../../src/infrastructure/auth/better-auth-adapter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import {
  createManagementAuthPlugin,
  managementAdminRole,
  managementStaffRole,
} from '../../src/presentation/http/management-auth-plugin.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

const baseURL = 'https://queue-pilot.example.invalid';
const sharedManifestPath = fileURLToPath(
  new URL('../fixtures/shared-tenant-manifest.json', import.meta.url),
);

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

it('protects management plugin requests with session, trusted-origin, and database rate limits', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const userId = randomUUID();
    const sessionToken = randomBytes(24).toString('base64url');
    const currentTime = new Date();
    await owner.query(
      'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, $4)',
      [userId, 'Test User', `${userId}@example.invalid`, currentTime],
    );
    await owner.query(
      'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
      [
        randomUUID(),
        new Date(currentTime.getTime() + 15 * 60_000),
        sessionToken,
        currentTime,
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

    try {
      const plugin = createManagementAuthPlugin({
        endpoints: {
          sessionCookie: createAuthEndpoint(
            '/queue-pilot/session-cookie',
            { method: 'GET' },
            async (context) => {
              expect(context.context.options.session?.expiresIn).toBe(900);
              expect(
                context.context.options.session?.disableSessionRefresh,
              ).toBe(true);
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
        },
        rateLimit: [
          {
            pathMatcher: (path) =>
              path === '/queue-pilot/rate-probe' ||
              path === '/queue-pilot/unknown-rate-probe',
            window: 60,
            max: 1,
          },
        ],
      });
      const sharedAuth: SharedAuthConfig = {
        baseURL,
        secret: randomBytes(32).toString('base64url'),
        clientIpTrustedProxies: [],
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
      expect(setCookie).toMatch(/; Max-Age=900(?:;|$)/i);
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
      vi.unstubAllEnvs();
      await runtime.close();
    }
  });
}, 120_000);
