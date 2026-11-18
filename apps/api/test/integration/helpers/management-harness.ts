import { randomBytes, randomUUID } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { vi } from 'vitest';
import { z } from 'zod';
import {
  createConfigurationManagementService,
  type GitHubAccountLookup,
  type GitHubAccountResolver,
} from '../../../src/application/configuration-management.ts';
import type { SharedAuthConfig } from '../../../src/config.ts';
import {
  type BetterAuthAdapter,
  createBetterAuthAdapter,
} from '../../../src/infrastructure/auth/better-auth-adapter.ts';
import {
  createDrizzleDatabase,
  type DrizzleDatabase,
} from '../../../src/infrastructure/persistence/drizzle/client.ts';
import { createDrizzleConfigurationManagementStore } from '../../../src/infrastructure/persistence/drizzle/configuration-management-store.ts';
import { createManagementAuthPlugin } from '../../../src/presentation/http/management-auth-plugin.ts';
import {
  createTenantManagementEndpoints,
  managementRateLimits,
} from '../../../src/presentation/http/tenant-management-plugin.ts';
import { withFreshMigratedPostgres } from './fresh-postgres.ts';

export const baseURL = 'https://queue-pilot.example.invalid';
export const githubIssuer = 'https://github.com';

export const eventConfig = {
  title: 'Spring Fair',
  timeZone: 'Europe/Berlin',
  startsAt: '2027-03-06T09:00:00+01:00',
  endsAt: '2027-03-06T18:00:00+01:00',
  numberScope: 'event',
  equipment: [
    { id: 'station-a', label: 'Station A' },
    { id: 'station-b', label: 'Station B' },
  ],
  schedule: [
    {
      date: '2027-03-06',
      firstStart: '10:00',
      lastStart: '12:00',
      intervalMinutes: 30,
      experienceMinutes: 20,
      turnoverMinutes: 10,
    },
  ],
  copy: { receiptTitle: 'Spring Fair', arrivalGuidance: 'Come to the desk.' },
  defaultPrinterId: 'front-desk',
  printers: [{ id: 'front-desk', label: 'Front desk' }],
};

export type EventConfig = typeof eventConfig;

export type TestUser = {
  name: string;
  authUserId: string;
  subject: string;
  appUserId: string;
  sessionToken: string;
  cookie: string;
};

export type ApiResponse = {
  status: number;
  headers: Headers;
  // biome-ignore lint/suspicious/noExplicitAny: tests inspect response bodies structurally
  json: any;
  text: string;
};

export type ManagementHarness = {
  owner: import('pg').Client;
  urlFor: (database: string) => string;
  runtime: DrizzleDatabase;
  authentication: BetterAuthAdapter;
  github: Map<string, string>;
  addUser: (name: string, subject: string) => Promise<TestUser>;
  seedTenant: (input: {
    slug: string;
    displayName?: string;
    admins: TestUser[];
    staff?: TestUser[];
  }) => Promise<string>;
  request: (
    user: TestUser | null,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => Promise<ApiResponse>;
  createEvent: (
    user: TestUser,
    tenantSlug: string,
    eventSlug: string,
    config?: EventConfig,
  ) => Promise<{ id: string; slug: string; revision: string }>;
  insertTicket: (
    tenantId: string,
    eventId: string,
    status: 'waiting' | 'called' | 'served' | 'cancelled',
  ) => Promise<string>;
  insertPrintJob: (
    tenantId: string,
    eventId: string,
    printerSlug: string,
    ticketId: string,
    status: 'queued' | 'printing' | 'printed',
  ) => Promise<string>;
};

export async function withManagementHarness(
  operation: (harness: ManagementHarness) => Promise<void>,
): Promise<void> {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    await owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    const role = `management_runtime_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await owner.query(
      `CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${role}`);
    const runtimeUrl = new URL(urlFor('postgres'));
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    const database = createDrizzleDatabase(runtimeUrl.toString(), 8);

    const github = new Map<string, string>();
    const lookup = (login: string, subject: string): GitHubAccountLookup => ({
      kind: 'ok',
      subject,
      login,
      displayName: login,
    });
    const resolver: GitHubAccountResolver = {
      findByLogin: async (login) => {
        const subject = github.get(login);
        return subject === undefined
          ? { kind: 'not_found' }
          : lookup(login, subject);
      },
      findBySubject: async (subject) => {
        const entry = [...github.entries()].find(
          ([, value]) => value === subject,
        );
        return entry === undefined
          ? { kind: 'not_found' }
          : lookup(entry[0], subject);
      },
    };
    let authentication: BetterAuthAdapter | undefined;
    const requireAuthentication = () => {
      if (authentication === undefined) {
        throw new Error('Authentication adapter is not initialized.');
      }
      return authentication;
    };
    const managementPlugin = createManagementAuthPlugin({
      endpoints: createTenantManagementEndpoints({
        service: createConfigurationManagementService(
          createDrizzleConfigurationManagementStore(database.db),
          resolver,
        ),
        authentication: {
          resolveIdentity: (headers) =>
            requireAuthentication().resolveIdentity(headers),
          getGitHubAccessToken: async () => null,
        },
      }),
      rateLimit: managementRateLimits,
    });
    const sessionCookiePlugin: BetterAuthPlugin = {
      id: 'management-test-session-cookie',
      endpoints: {
        issueTestSessionCookie: createAuthEndpoint(
          '/queue-pilot/test-session-cookie',
          {
            method: 'GET',
            query: z.object({ token: z.string() }),
          },
          async (context) => {
            const session = await context.context.internalAdapter.findSession(
              context.query.token,
            );
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
    vi.stubEnv('NODE_ENV', 'production');
    try {
      authentication = await createBetterAuthAdapter(database.db, authConfig, [
        sessionCookiePlugin,
        managementPlugin,
      ]);
      const auth = authentication;

      const addUser = async (
        name: string,
        subject: string,
      ): Promise<TestUser> => {
        const authUserId = randomUUID();
        const sessionToken = randomBytes(24).toString('base64url');
        const now = new Date();
        await owner.query(
          'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, $4)',
          [authUserId, name, `${authUserId}@example.invalid`, now],
        );
        await owner.query(
          'INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, $2, $3, $4, $4, $5)',
          [
            randomUUID(),
            new Date(now.getTime() + 15 * 60_000),
            sessionToken,
            now,
            authUserId,
          ],
        );
        await owner.query(
          'INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
          [randomUUID(), subject, 'github', authUserId, now],
        );
        const appUser = await owner.query<{ id: string }>(
          'INSERT INTO app_users (id, issuer, subject) VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id::text',
          [randomUUID(), githubIssuer, subject],
        );
        const cookieResponse = await auth.handle(
          new Request(
            `${baseURL}/api/auth/queue-pilot/test-session-cookie?token=${sessionToken}`,
            { headers: { Origin: baseURL } },
          ),
        );
        const setCookie = cookieResponse.headers.get('set-cookie');
        const cookie = setCookie?.split(';', 1)[0];
        if (cookieResponse.status !== 200 || cookie === undefined) {
          throw new Error('The test session cookie was not issued.');
        }
        github.set(name, subject);
        return {
          name,
          authUserId,
          subject,
          appUserId: appUser.rows[0]?.id ?? '',
          sessionToken,
          cookie,
        };
      };

      const harness: ManagementHarness = {
        owner,
        urlFor,
        runtime: database.db,
        authentication: auth,
        github,
        addUser,
        seedTenant: async ({ slug, displayName, admins, staff = [] }) => {
          const tenantId = randomUUID();
          await owner.query(
            'INSERT INTO tenants (id, slug, display_name) VALUES ($1, $2, $3)',
            [tenantId, slug, displayName ?? slug],
          );
          for (const [users, role] of [
            [admins, 'admin'],
            [staff, 'staff'],
          ] as const) {
            for (const user of users) {
              await owner.query(
                'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
                [tenantId, user.appUserId, role],
              );
            }
          }
          return tenantId;
        },
        request: async (user, method, path, body, headers = {}) => {
          const response = await auth.handle(
            new Request(`${baseURL}/api/auth/queue-pilot${path}`, {
              method,
              headers: {
                Origin: baseURL,
                ...(user === null ? {} : { Cookie: user.cookie }),
                ...(body === undefined
                  ? {}
                  : { 'Content-Type': 'application/json' }),
                ...headers,
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
          );
          const text = await response.text();
          return {
            status: response.status,
            headers: response.headers,
            text,
            json: text === '' ? null : JSON.parse(text),
          };
        },
        createEvent: async (
          user,
          tenantSlug,
          eventSlug,
          config = eventConfig,
        ) => {
          const response = await harness.request(
            user,
            'POST',
            `/t/${tenantSlug}/events/create`,
            { slug: eventSlug, config },
          );
          if (response.status !== 201) {
            throw new Error(`Event creation failed: ${response.text}`);
          }
          return response.json;
        },
        insertTicket: async (tenantId, eventId, status) => {
          const id = randomUUID();
          await owner.query(
            `INSERT INTO tickets (id, tenant_id, event_id, counter_key, number, public_token,
               idempotency_key, request_hash, status, cancel_reason, issued_at, updated_at)
             VALUES ($1, $2, $3, 'event',
               (SELECT COALESCE(max(number), 0) + 1 FROM tickets WHERE tenant_id = $2 AND event_id = $3),
               $4, $5, $6, $7, CASE WHEN $7 = 'cancelled' THEN 'staff' ELSE NULL END, now(), now())`,
            [
              id,
              tenantId,
              eventId,
              randomBytes(16).toString('base64url'),
              randomUUID(),
              randomBytes(32).toString('hex'),
              status,
            ],
          );
          return id;
        },
        insertPrintJob: async (
          tenantId,
          eventId,
          printerSlug,
          ticketId,
          status,
        ) => {
          const id = randomUUID();
          const printing = status === 'printing';
          const agentId = randomUUID();
          if (printing) {
            await owner.query(
              `INSERT INTO agents (id, tenant_id, event_id, printer_id)
               VALUES ($1, $2, $3, (SELECT id FROM printers WHERE tenant_id = $2 AND event_id = $3 AND slug = $4))`,
              [agentId, tenantId, eventId, printerSlug],
            );
          }
          await owner.query(
            `INSERT INTO print_jobs (id, tenant_id, event_id, printer_id, payload_version, ticket_id,
               status, created_at, updated_at, payload, lease_token, lease_expires_at, claimed_by_agent_id)
             VALUES ($1, $2, $3,
               (SELECT id FROM printers WHERE tenant_id = $2 AND event_id = $3 AND slug = $4),
               1, $5, $6, now(), now(),
               '{"ticketNumber":1,"partySize":1,"publicToken":"AAAAAAAAAAAAAAAAAAAAAA","issuedAt":"2027-03-06T09:00:00.000Z"}'::jsonb,
               $7, $8, $9)`,
            [
              id,
              tenantId,
              eventId,
              printerSlug,
              ticketId,
              status,
              printing ? randomUUID() : null,
              printing ? new Date(Date.now() + 60_000) : null,
              printing ? agentId : null,
            ],
          );
          return id;
        },
      };
      await operation(harness);
    } finally {
      vi.unstubAllEnvs();
      await database.close();
    }
  });
}
