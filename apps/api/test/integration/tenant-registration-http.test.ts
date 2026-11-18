import { randomBytes, randomUUID } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { expect, it, vi } from 'vitest';
import { createTenantRegistrationService } from '../../src/application/tenant-registration.ts';
import type { SharedAuthConfig } from '../../src/config.ts';
import {
  type BetterAuthAdapter,
  createBetterAuthAdapter,
} from '../../src/infrastructure/auth/better-auth-adapter.ts';
import { createGitHubActiveMembershipReader } from '../../src/infrastructure/auth/github-active-membership-reader.ts';
import { createTenantRegistrationRateLimiter } from '../../src/infrastructure/auth/tenant-registration-rate-limiter.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { createDrizzleTenantRegistrationStore } from '../../src/infrastructure/persistence/drizzle/tenant-registration-store.ts';
import { createTenantRegistrationPlugin } from '../../src/presentation/http/tenant-registration-plugin.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

const baseURL = 'https://queue-pilot.example.invalid';

it('requires a real session, rejects spoofed actors and origins, then creates the signed-in user tenant', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    const authUserId = randomUUID();
    const sessionToken = randomBytes(24).toString('base64url');
    const sessionId = randomUUID();
    const now = new Date();
    await owner.query(
      'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, $4)',
      [authUserId, 'Test User', `${authUserId}@example.invalid`, now],
    );
    await owner.query(
      'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
      [
        sessionId,
        new Date(now.getTime() + 15 * 60_000),
        sessionToken,
        now,
        authUserId,
      ],
    );
    await owner.query(
      'INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
      [randomUUID(), '1234567', 'github', authUserId, now],
    );

    const database = createDrizzleDatabase(urlFor('postgres'), 4);
    let authentication: BetterAuthAdapter | undefined;
    const service = createTenantRegistrationService(
      {
        enabled: true,
        policy: 'allowlist',
        githubUserIds: ['1234567'],
        githubOrgIds: [],
        maxPerUser: 100,
      },
      createDrizzleTenantRegistrationStore(database.db),
      createGitHubActiveMembershipReader(),
      createTenantRegistrationRateLimiter(database.pool),
    );
    const registrationPlugin = createTenantRegistrationPlugin({
      service,
      authentication: {
        resolveRegistrationIdentity: async (headers) => {
          if (authentication === undefined) {
            throw new Error('Authentication adapter is not initialized.');
          }
          return authentication.resolveRegistrationIdentity(headers);
        },
        getGitHubAccessToken: async (headers) => {
          if (authentication === undefined) {
            throw new Error('Authentication adapter is not initialized.');
          }
          return authentication.getGitHubAccessToken(headers);
        },
      },
    });
    const sessionCookiePlugin: BetterAuthPlugin = {
      id: 'registration-test-session-cookie',
      endpoints: {
        issueTestSessionCookie: createAuthEndpoint(
          '/queue-pilot/test-session-cookie',
          { method: 'GET' },
          async (context) => {
            const session =
              await context.context.internalAdapter.findSession(sessionToken);
            if (session === null) {
              throw new Error('The test session was not found.');
            }
            await setSessionCookie(context, session, false);
            return context.json({ ok: true });
          },
        ),
      },
    };
    const authConfig: SharedAuthConfig = {
      baseURL,
      secret: randomBytes(32).toString('base64url'),
      clientIpTrustedProxies: [],
      session: {
        idleSeconds: 43_200,
        updateAgeSeconds: 300,
        absoluteSeconds: 604_800,
      },
      registration: {
        enabled: true,
        policy: 'allowlist',
        githubUserIds: ['1234567'],
        githubOrgIds: [],
        maxPerUser: 100,
      },
      provider: {
        kind: 'github',
        clientId: 'fixture-client-id',
        clientSecret: 'fixture-client-secret',
      },
    };

    vi.stubEnv('NODE_ENV', 'production');
    try {
      authentication = await createBetterAuthAdapter(database.db, authConfig, [
        sessionCookiePlugin,
        registrationPlugin,
      ]);
      const readyAuthentication = authentication;
      if (readyAuthentication === undefined) {
        throw new Error('Authentication adapter is not initialized.');
      }
      const cookieResponse = await readyAuthentication.handle(
        new Request(`${baseURL}/api/auth/queue-pilot/test-session-cookie`, {
          headers: { Origin: baseURL },
        }),
      );
      expect(cookieResponse.status).toBe(200);
      const setCookie = cookieResponse.headers.get('set-cookie');
      if (setCookie === null) {
        throw new Error('The test session cookie was not set.');
      }
      const cookieHeader = setCookie.split(';', 1)[0];
      if (cookieHeader === undefined) {
        throw new Error('The test session cookie was empty.');
      }

      const signInRequest = (auth: BetterAuthAdapter) =>
        auth.handle(
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
      const userAllowlistSignIn = await signInRequest(readyAuthentication);
      expect(userAllowlistSignIn.status).toBe(200);
      const userAllowlistBody = (await userAllowlistSignIn.json()) as {
        url: string;
      };
      expect(new URL(userAllowlistBody.url).searchParams.get('scope')).toBe(
        'read:user',
      );
      const organizationAuthentication = await createBetterAuthAdapter(
        database.db,
        {
          ...authConfig,
          secret: randomBytes(32).toString('base64url'),
          registration: {
            ...authConfig.registration,
            githubUserIds: [],
            githubOrgIds: ['7654321'],
          },
        },
        [sessionCookiePlugin],
      );
      const organizationSignIn = await signInRequest(
        organizationAuthentication,
      );
      expect(organizationSignIn.status).toBe(200);
      const organizationBody = (await organizationSignIn.json()) as {
        url: string;
      };
      expect(new URL(organizationBody.url).searchParams.get('scope')).toBe(
        'read:user read:org',
      );

      const sendCreate = (origin: string, body: unknown) =>
        readyAuthentication.handle(
          new Request(`${baseURL}/api/auth/queue-pilot/tenants/create`, {
            method: 'POST',
            headers: {
              Origin: origin,
              Cookie: cookieHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
        );
      const spoofedActor = await sendCreate(baseURL, {
        slug: 'spoofed-tenant',
        displayName: 'Spoofed Tenant',
        issuer: 'https://github.com',
        subject: '7654321',
      });
      expect(spoofedActor.status).toBe(400);
      const spoofedUsers = await owner.query(
        "SELECT id FROM app_users WHERE issuer = 'https://github.com' AND subject = '7654321'",
      );
      expect(spoofedUsers.rows).toHaveLength(0);

      const untrustedOrigin = await sendCreate(
        'https://untrusted.example.invalid',
        {
          slug: 'untrusted-origin',
          displayName: 'Untrusted Origin',
        },
      );
      expect(untrustedOrigin.status).toBe(403);

      const createdResponse = await sendCreate(baseURL, {
        slug: 'self-service-space',
        displayName: 'Self Service Space',
      });
      expect(createdResponse.status).toBe(201);
      const createdBody = (await createdResponse.json()) as {
        tenant: {
          id: string;
          slug: string;
          displayName: string;
          revision: number;
        };
        role: string;
      };
      expect(createdBody).toMatchObject({
        tenant: {
          slug: 'self-service-space',
          displayName: 'Self Service Space',
          revision: 1,
        },
        role: 'admin',
      });

      const persisted = await owner.query<{
        role: string;
        origin: string;
        action: string;
      }>(
        `SELECT membership.role, ledger.origin, audit.action
         FROM tenants AS tenant
         JOIN tenant_memberships AS membership ON membership.tenant_id = tenant.id
         JOIN tenant_creation_records AS ledger ON ledger.tenant_id = tenant.id
         JOIN configuration_audit AS audit ON audit.tenant_id = tenant.id
         WHERE tenant.id = $1`,
        [createdBody.tenant.id],
      );
      expect(persisted.rows).toEqual([
        {
          role: 'admin',
          origin: 'self-service',
          action: 'self-service-create',
        },
      ]);
    } finally {
      vi.unstubAllEnvs();
      await database.close();
    }
  });
}, 120_000);

it('blocks new sessions in closed mode until the GitHub identity has active tenant membership', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const authUserId = randomUUID();
    const now = new Date();
    await owner.query(
      'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, $4)',
      [authUserId, 'Existing User', `${authUserId}@example.invalid`, now],
    );
    await owner.query(
      'INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
      [randomUUID(), '1234567', 'github', authUserId, now],
    );

    const database = createDrizzleDatabase(urlFor('postgres'), 2);
    const sessionProbe: BetterAuthPlugin = {
      id: 'closed-registration-session-probe',
      endpoints: {
        createSessionProbe: createAuthEndpoint(
          '/queue-pilot/test-create-session',
          { method: 'POST' },
          async (context) => {
            await context.context.internalAdapter.createSession(
              authUserId,
              true,
            );
            return context.json({ created: true });
          },
        ),
      },
    };
    const authConfig: SharedAuthConfig = {
      baseURL,
      secret: randomBytes(32).toString('base64url'),
      clientIpTrustedProxies: [],
      session: {
        idleSeconds: 43_200,
        updateAgeSeconds: 300,
        absoluteSeconds: 604_800,
      },
      registration: {
        enabled: false,
        policy: 'closed',
        githubUserIds: [],
        githubOrgIds: [],
        maxPerUser: 100,
      },
      provider: {
        kind: 'github',
        clientId: 'fixture-client-id',
        clientSecret: 'fixture-client-secret',
      },
    };
    try {
      const authentication = await createBetterAuthAdapter(
        database.db,
        authConfig,
        [sessionProbe],
      );
      const createSession = () =>
        authentication.handle(
          new Request(`${baseURL}/api/auth/queue-pilot/test-create-session`, {
            method: 'POST',
            headers: { Origin: baseURL },
          }),
        );
      expect((await createSession()).status).toBe(403);
      const deniedSessions = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "session" WHERE "userId" = $1',
        [authUserId],
      );
      expect(deniedSessions.rows[0]?.count).toBe('0');

      const appUserId = randomUUID();
      const tenantId = randomUUID();
      await owner.query(
        'INSERT INTO app_users (id, issuer, subject) VALUES ($1, $2, $3)',
        [appUserId, 'https://github.com', '1234567'],
      );
      await owner.query(
        'INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)',
        [tenantId, 'existing-tenant', 'Existing Tenant'],
      );
      await owner.query(
        "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')",
        [tenantId, appUserId],
      );

      expect((await createSession()).status).toBe(200);
      const allowedSessions = await owner.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM "session" WHERE "userId" = $1',
        [authUserId],
      );
      expect(allowedSessions.rows[0]?.count).toBe('1');
    } finally {
      await database.close();
    }
  });
}, 120_000);
