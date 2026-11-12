import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import type { Principal } from '../../src/application/security-ports.ts';
import { parseTenantManifest } from '../../src/domain/tenant-manifest.ts';
import type { PublicToken } from '../../src/domain/ticket.ts';
import { createDrizzleAgentCredentialAdministration } from '../../src/infrastructure/auth/agent-credential-repository.ts';
import { createDrizzleAuthorizationRepository } from '../../src/infrastructure/auth/authorization-repository.ts';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { applyTenantManifest } from '../../src/infrastructure/persistence/drizzle/tenant-config-store.ts';
import { createUnitOfWork } from '../../src/infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from '../../src/infrastructure/request-context.ts';
import { createHttpApp } from '../../src/presentation/http/routes.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

const manifestFixturePath = new URL(
  '../fixtures/default-tenant-manifest.json',
  import.meta.url,
);
const issuer = 'https://id.example.invalid';

type RawManifest = {
  schemaVersion: number;
  tenants: Array<{
    id: string;
    slug: string;
    members: Array<{
      issuer: string;
      subject: string;
      role: 'admin' | 'staff';
      disabled: boolean;
    }>;
    events: Array<Record<string, unknown>>;
  }>;
};

it('routes scoped event settings, public locators, member roles, and agent operations through non-owner PostgreSQL', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const rawManifest = JSON.parse(
      await readFile(manifestFixturePath, 'utf8'),
    ) as RawManifest;
    const scheduleDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const eventStartsAt = `${scheduleDate}T00:00:00.000Z`;
    const eventEndsAt = new Date(
      Date.parse(eventStartsAt) + 24 * 60 * 60 * 1000,
    ).toISOString();
    const testClockNow = new Date();
    const primaryTenant = rawManifest.tenants[0];
    const primaryEvent = primaryTenant?.events[0];
    if (primaryTenant === undefined || primaryEvent === undefined) {
      throw new Error(
        'The primary tenant event is missing from the test fixture.',
      );
    }
    primaryTenant.id = '20000000-0000-4000-8000-000000000001';
    primaryTenant.slug = 'campus';
    Object.assign(primaryEvent, {
      id: '20000000-0000-4000-8000-000000000002',
      slug: 'festival',
    });
    const primaryTenantId = primaryTenant.id;
    primaryTenant.members.push({
      issuer,
      subject: 'fixture-default-staff',
      role: 'staff',
      disabled: false,
    });
    primaryTenant.events.push(
      {
        id: randomUUID(),
        slug: 'autumn-preview',
        title: 'Autumn preview',
        timeZone: 'America/Los_Angeles',
        startsAt: eventStartsAt,
        endsAt: eventEndsAt,
        numberScope: 'event',
        equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
        schedule: [
          {
            date: scheduleDate,
            firstStart: '09:00',
            lastStart: '09:40',
            intervalMinutes: 20,
            experienceMinutes: 15,
            turnoverMinutes: 5,
          },
        ],
        copy: {
          receiptTitle: 'Preview ticket',
          arrivalGuidance: 'Please arrive before your slot.',
        },
        defaultPrinterId: 'preview-printer',
        printers: [{ id: 'preview-printer', label: 'Preview printer' }],
      },
      {
        id: randomUUID(),
        slug: 'winter-preview',
        title: 'Winter preview',
        timeZone: 'America/Chicago',
        startsAt: eventStartsAt,
        endsAt: eventEndsAt,
        numberScope: 'event',
        equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
        schedule: [
          {
            date: scheduleDate,
            firstStart: '10:00',
            lastStart: '10:30',
            intervalMinutes: 30,
            experienceMinutes: 25,
            turnoverMinutes: 5,
          },
        ],
        copy: {
          receiptTitle: 'Winter ticket',
          arrivalGuidance: 'Please check in at the winter desk.',
        },
        defaultPrinterId: 'winter-printer',
        printers: [{ id: 'winter-printer', label: 'Winter printer' }],
      },
    );
    const sampleTenant = rawManifest.tenants.find(
      ({ slug }) => slug === 'sample-tenant',
    );
    const sampleEvent = sampleTenant?.events.find(
      ({ slug }) => slug === 'summer',
    );
    if (sampleTenant === undefined || sampleEvent === undefined) {
      throw new Error('The sample tenant fixture is missing its summer event.');
    }
    sampleTenant.members.push({
      issuer,
      subject: 'fixture-sample-admin',
      role: 'admin',
      disabled: false,
    });
    Object.assign(sampleEvent, {
      startsAt: eventStartsAt,
      endsAt: eventEndsAt,
      equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
      schedule: [
        {
          date: scheduleDate,
          firstStart: '11:00',
          lastStart: '11:00',
          intervalMinutes: 40,
          experienceMinutes: 35,
          turnoverMinutes: 5,
        },
      ],
    });
    const parsedManifest = parseTenantManifest(rawManifest);
    if (!parsedManifest.ok) {
      throw new Error(JSON.stringify(parsedManifest.error.issues));
    }
    const manifest = parsedManifest.value;
    await applyTenantManifest(urlFor('postgres'), manifest, undefined);

    const adminUser = await owner.query<{ id: string }>(
      'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2',
      [issuer, 'fixture-admin'],
    );
    const staffUser = await owner.query<{ id: string }>(
      'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2',
      [issuer, 'fixture-default-staff'],
    );
    const sampleAdminUser = await owner.query<{ id: string }>(
      'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2',
      [issuer, 'fixture-sample-admin'],
    );
    if (
      adminUser.rows[0] === undefined ||
      staffUser.rows[0] === undefined ||
      sampleAdminUser.rows[0] === undefined
    ) {
      throw new Error('Manifest synchronization did not create test members.');
    }
    const adminSession = randomUUID();
    const staffSession = randomUUID();
    const sampleAdminSession = randomUUID();
    const sessions = new Map<string, Principal>([
      [
        adminSession,
        {
          userId: adminUser.rows[0].id,
          issuer,
          subject: 'fixture-admin',
          sessionId: randomUUID(),
        },
      ],
      [
        staffSession,
        {
          userId: staffUser.rows[0].id,
          issuer,
          subject: 'fixture-default-staff',
          sessionId: randomUUID(),
        },
      ],
      [
        sampleAdminSession,
        {
          userId: sampleAdminUser.rows[0].id,
          issuer,
          subject: 'fixture-sample-admin',
          sessionId: randomUUID(),
        },
      ],
    ]);

    const roleName = `shared_http_runtime_${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    await owner.query(
      `CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
    );
    await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
    const runtimeUrl = new URL(urlFor('postgres'));
    runtimeUrl.username = roleName;
    runtimeUrl.password = password;
    const runtime = createDrizzleDatabase(runtimeUrl.toString(), 1);

    try {
      const requestContext = createRequestContextStorage();
      const authorization = createDrizzleAuthorizationRepository(runtime.db);
      const agentCredentials = createDrizzleAgentCredentialAdministration(
        runtime.db,
        requestContext,
      );
      let now = testClockNow;
      const app = createHttpApp({
        unitOfWork: createUnitOfWork(runtime.db, requestContext),
        clock: { now: () => new Date(now) },
        tokens: {
          ticketId: randomUUID,
          printJobId: randomUUID,
          publicToken: () =>
            randomBytes(16).toString('base64url') as PublicToken,
          leaseToken: randomUUID,
        },
        authMode: 'oidc/shared',
        requestContext,
        publicBaseURL: 'http://localhost/',
        authentication: {
          handle: async () => new Response(null, { status: 404 }),
          resolveSession: async (headers) => {
            const cookie = headers.get('Cookie') ?? '';
            const session = /(?:^|;\s*)better-auth\.session_token=([^;]+)/.exec(
              cookie,
            )?.[1];
            return sessions.get(session ?? '') ?? null;
          },
          revokeMemberSessions: async () => {},
        },
        authorization,
        agentCredentials,
        checkReadiness: async () => true,
      });
      const cookie = (sessionId: string) =>
        `better-auth.session_token=${sessionId}`;
      const mutationHeaders = async (sessionId: string) => {
        const response = await app.request('/api/v3/csrf', {
          headers: { Cookie: cookie(sessionId) },
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { token: string };
        const csrfCookie = response.headers.get('Set-Cookie')?.split(';', 1)[0];
        if (csrfCookie === undefined) {
          throw new Error('The CSRF response did not set its cookie.');
        }
        return {
          Cookie: `${cookie(sessionId)}; ${csrfCookie}`,
          Origin: 'http://localhost',
          'X-CSRF-Token': body.token,
          'Content-Type': 'application/json',
        };
      };
      const adminHeaders = await mutationHeaders(adminSession);
      const staffHeaders = await mutationHeaders(staffSession);
      const sampleAdminHeaders = await mutationHeaders(sampleAdminSession);
      const eventPath = (slug: string) => `/api/v3/t/campus/e/${slug}`;

      const memberEvents = await app.request('/api/v3/events', {
        headers: { Cookie: cookie(adminSession) },
      });
      expect(memberEvents.status).toBe(200);
      const listed = (await memberEvents.json()) as {
        events: Array<{
          tenantSlug: string;
          eventSlug: string;
          timeZone: string;
        }>;
      };
      expect(
        listed.events
          .map(({ tenantSlug, eventSlug }) => `${tenantSlug}/${eventSlug}`)
          .sort(),
      ).toEqual([
        'campus/autumn-preview',
        'campus/festival',
        'campus/winter-preview',
      ]);
      expect(
        Object.fromEntries(
          listed.events.map(({ eventSlug, timeZone }) => [eventSlug, timeZone]),
        ),
      ).toMatchObject({
        'autumn-preview': 'America/Los_Angeles',
        'winter-preview': 'America/Chicago',
      });
      const sampleMemberEvents = await app.request('/api/v3/events', {
        headers: { Cookie: cookie(sampleAdminSession) },
      });
      expect(sampleMemberEvents.status).toBe(200);
      expect(await sampleMemberEvents.json()).toEqual({
        events: [
          expect.objectContaining({
            tenantSlug: 'sample-tenant',
            eventSlug: 'summer',
          }),
        ],
      });

      const wrongTenant = await app.request(
        '/api/v3/t/sample-tenant/e/summer/reservations',
        { headers: { Cookie: cookie(adminSession) } },
      );
      const wrongEvent = await app.request(
        '/api/v3/t/campus/e/summer/reservations',
        { headers: { Cookie: cookie(adminSession) } },
      );
      const unconfiguredEvent = await app.request(
        '/api/v3/t/campus/e/not-configured/reservations',
        { headers: { Cookie: cookie(adminSession) } },
      );
      expect(wrongTenant.status).toBe(404);
      expect(wrongEvent.status).toBe(404);
      expect(unconfiguredEvent.status).toBe(404);

      const staffAgentList = await app.request(
        `${eventPath('autumn-preview')}/agents`,
        { headers: { Cookie: cookie(staffSession) } },
      );
      expect(staffAgentList.status).toBe(403);

      const noCsrf = await app.request(
        `${eventPath('autumn-preview')}/tickets`,
        {
          method: 'POST',
          headers: {
            Cookie: cookie(adminSession),
            Origin: 'http://localhost',
            'Content-Type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            slotStartsAt: '2026-06-01T16:00:00.000Z',
            equipment: 'Vision Pro',
          }),
        },
      );
      expect(noCsrf.status).toBe(403);

      const autumnReservations = await app.request(
        `${eventPath('autumn-preview')}/reservations`,
        { headers: { Cookie: cookie(adminSession) } },
      );
      const autumnView = (await autumnReservations.json()) as {
        timeZone: string;
        slots: Array<{
          startsAt: string;
          experienceEndsAt: string;
          endsAt: string;
        }>;
      };
      expect(autumnReservations.status).toBe(200);
      expect(autumnView.timeZone).toBe('America/Los_Angeles');
      expect(autumnView.slots).toHaveLength(3);
      const autumnSlot = autumnView.slots[0];
      if (autumnSlot === undefined) {
        throw new Error('Autumn event is missing its first slot.');
      }
      expect(autumnSlot).toMatchObject({
        equipment: 'Vision Pro',
        bookable: true,
        ticket: null,
      });
      expect(autumnSlot.startsAt.endsWith('.000Z')).toBe(true);
      expect(
        Date.parse(autumnSlot.experienceEndsAt) -
          Date.parse(autumnSlot.startsAt),
      ).toBe(15 * 60_000);
      expect(
        Date.parse(autumnSlot.endsAt) - Date.parse(autumnSlot.startsAt),
      ).toBe(20 * 60_000);
      const winterReservations = await app.request(
        `${eventPath('winter-preview')}/reservations`,
        { headers: { Cookie: cookie(adminSession) } },
      );
      const winterView = (await winterReservations.json()) as {
        timeZone: string;
        slots: Array<{
          startsAt: string;
          experienceEndsAt: string;
          endsAt: string;
        }>;
      };
      expect(winterReservations.status).toBe(200);
      expect(winterView.timeZone).toBe('America/Chicago');
      const winterSlot = winterView.slots[0];
      if (winterSlot === undefined) {
        throw new Error('Winter event is missing its first slot.');
      }
      expect(winterSlot).toMatchObject({
        equipment: 'Vision Pro',
        bookable: true,
        ticket: null,
      });
      expect(winterSlot.startsAt.endsWith('.000Z')).toBe(true);
      expect(
        Date.parse(winterSlot.experienceEndsAt) -
          Date.parse(winterSlot.startsAt),
      ).toBe(25 * 60_000);
      expect(
        Date.parse(winterSlot.endsAt) - Date.parse(winterSlot.startsAt),
      ).toBe(30 * 60_000);

      const sampleReservations = await app.request(
        '/api/v3/t/sample-tenant/e/summer/reservations',
        { headers: { Cookie: cookie(sampleAdminSession) } },
      );
      const sampleView = (await sampleReservations.json()) as {
        slots: Array<{
          startsAt: string;
          experienceEndsAt: string;
          endsAt: string;
        }>;
      };
      expect(sampleReservations.status).toBe(200);
      expect(sampleView.slots).toHaveLength(1);
      const sampleSlot = sampleView.slots[0];
      if (sampleSlot === undefined) {
        throw new Error('Sample event is missing its first slot.');
      }
      expect(sampleSlot.startsAt.endsWith('.000Z')).toBe(true);
      expect(
        Date.parse(sampleSlot.experienceEndsAt) -
          Date.parse(sampleSlot.startsAt),
      ).toBe(35 * 60_000);
      expect(
        Date.parse(sampleSlot.endsAt) - Date.parse(sampleSlot.startsAt),
      ).toBe(40 * 60_000);

      const issue = async (
        slug: string,
        startsAt: string,
        headers: Record<string, string>,
      ) =>
        app.request(`${eventPath(slug)}/tickets`, {
          method: 'POST',
          headers: { ...headers, 'idempotency-key': randomUUID() },
          body: JSON.stringify({
            slotStartsAt: startsAt,
            equipment: 'Vision Pro',
          }),
        });
      const sampleIssue = await app.request(
        '/api/v3/t/sample-tenant/e/summer/tickets',
        {
          method: 'POST',
          headers: { ...sampleAdminHeaders, 'idempotency-key': randomUUID() },
          body: JSON.stringify({
            slotStartsAt: sampleSlot.startsAt,
            equipment: 'Vision Pro',
          }),
        },
      );
      expect(sampleIssue.status, await sampleIssue.clone().text()).toBe(201);
      const sampleTicket = (await sampleIssue.json()) as {
        ticket: { id: string; number: number };
      };
      expect(sampleTicket.ticket.number).toBe(1);
      const sampleAgentResponse = await app.request(
        '/api/v3/t/sample-tenant/e/summer/agents',
        {
          method: 'POST',
          headers: sampleAdminHeaders,
          body: JSON.stringify({ printerId: 'sample-printer' }),
        },
      );
      expect(sampleAgentResponse.status).toBe(201);
      const sampleAgent = (await sampleAgentResponse.json()) as {
        id: string;
        token: string;
      };
      const autumnIssue = await issue(
        'autumn-preview',
        autumnSlot.startsAt,
        adminHeaders,
      );
      const winterIssue = await issue(
        'winter-preview',
        winterSlot.startsAt,
        staffHeaders,
      );
      expect(autumnIssue.status, await autumnIssue.clone().text()).toBe(201);
      expect(winterIssue.status, await winterIssue.clone().text()).toBe(201);
      const autumnTicket = (await autumnIssue.json()) as {
        ticket: { id: string; number: number };
      };
      const winterTicket = (await winterIssue.json()) as {
        ticket: { id: string; number: number };
      };
      expect(autumnTicket.ticket.number).toBe(1);
      expect(winterTicket.ticket.number).toBe(1);
      const counters = await owner.query<{ counter_key: string }>(
        'SELECT counter_key FROM tickets WHERE id = $1',
        [autumnTicket.ticket.id],
      );
      expect(counters.rows[0]?.counter_key).toBe('event');

      const winterCrossRead = await app.request(
        `${eventPath('winter-preview')}/tickets/${autumnTicket.ticket.id}`,
        { headers: { Cookie: cookie(adminSession) } },
      );
      const tenantCrossRead = await app.request(
        `${eventPath('autumn-preview')}/tickets/${sampleTicket.ticket.id}`,
        { headers: { Cookie: cookie(adminSession) } },
      );
      const reverseTenantCrossRead = await app.request(
        `/api/v3/t/sample-tenant/e/summer/tickets/${autumnTicket.ticket.id}`,
        { headers: { Cookie: cookie(sampleAdminSession) } },
      );
      expect(winterCrossRead.status).toBe(404);
      expect(tenantCrossRead.status).toBe(404);
      expect(reverseTenantCrossRead.status).toBe(404);
      const winterSlotView = await app.request(
        `${eventPath('winter-preview')}/reservations`,
        { headers: { Cookie: cookie(adminSession) } },
      );
      const winterSlotBody = (await winterSlotView.json()) as {
        slots: Array<{ ticket: { id: string } | null }>;
      };
      expect(
        winterSlotBody.slots.some(
          (slot) => slot.ticket?.id === autumnTicket.ticket.id,
        ),
      ).toBe(false);

      const publicTokenQuery = await owner.query<{ public_token: string }>(
        'SELECT public_token FROM tickets WHERE id = $1',
        [autumnTicket.ticket.id],
      );
      const publicToken = publicTokenQuery.rows[0]?.public_token;
      if (publicToken === undefined) {
        throw new Error('The issued ticket has no public locator token.');
      }
      const publicResponse = await app.request(
        `/api/public/tickets/${publicToken}`,
      );
      expect(publicResponse.status).toBe(200);
      const publicBody = (await publicResponse.json()) as Record<
        string,
        unknown
      >;
      expect(Object.keys(publicBody).sort()).toEqual([
        'latestChange',
        'number',
        'reservation',
        'slotReleasedAt',
        'status',
        'timeZone',
      ]);
      expect(publicBody.timeZone).toBe('America/Los_Angeles');
      expect(publicBody).not.toHaveProperty('id');
      expect(publicBody).not.toHaveProperty('publicToken');

      const unavailablePrinter = await app.request(
        `${eventPath('autumn-preview')}/agents`,
        {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ printerId: 'missing-printer' }),
        },
      );
      expect(unavailablePrinter.status).toBe(404);
      const autumnAgentResponse = await app.request(
        `${eventPath('autumn-preview')}/agents`,
        {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ printerId: 'preview-printer' }),
        },
      );
      const winterAgentResponse = await app.request(
        `${eventPath('winter-preview')}/agents`,
        {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ printerId: 'winter-printer' }),
        },
      );
      expect(autumnAgentResponse.status).toBe(201);
      expect(winterAgentResponse.status).toBe(201);
      const autumnAgent = (await autumnAgentResponse.json()) as {
        id: string;
        token: string;
      };
      const winterAgent = (await winterAgentResponse.json()) as {
        id: string;
        token: string;
      };
      const agentList = await app.request(
        `${eventPath('autumn-preview')}/agents`,
        {
          headers: { Cookie: cookie(adminSession) },
        },
      );
      expect(agentList.status).toBe(200);
      expect(
        ((await agentList.json()) as { agents: Array<{ id: string }> }).agents,
      ).toEqual([expect.objectContaining({ id: autumnAgent.id })]);

      const claim = async (token: string) =>
        app.request('/api/v3/agent/print-jobs/claim', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ acceptedPayloadVersions: [2] }),
        });
      const autumnClaim = await claim(autumnAgent.token);
      expect(autumnClaim.status).toBe(200);
      const autumnClaimBody = (await autumnClaim.json()) as {
        job: {
          id: string;
          ticketId: string;
          leaseToken: string;
          payload: {
            schemaVersion: number;
            timeZone: string;
            publicURL: string;
            copy: { receiptTitle: string };
          };
        };
      };
      expect(autumnClaimBody.job.ticketId).toBe(autumnTicket.ticket.id);
      expect(autumnClaimBody.job.payload).toMatchObject({
        schemaVersion: 2,
        timeZone: 'America/Los_Angeles',
        publicURL: `http://localhost/ticket/${publicToken}`,
        copy: { receiptTitle: 'Preview ticket' },
      });
      const printerAssignment = await owner.query<{ slug: string }>(
        `SELECT printer.slug
         FROM print_jobs AS job
         JOIN printers AS printer
           ON printer.tenant_id = job.tenant_id
          AND printer.event_id = job.event_id
          AND printer.id = job.printer_id
         WHERE job.id = $1`,
        [autumnClaimBody.job.id],
      );
      expect(printerAssignment.rows[0]?.slug).toBe('preview-printer');

      const emptyAutumnClaim = await claim(autumnAgent.token);
      expect(emptyAutumnClaim.status).toBe(204);
      const winterClaim = await claim(winterAgent.token);
      expect(winterClaim.status).toBe(200);
      const winterClaimBody = (await winterClaim.json()) as {
        job: {
          id: string;
          ticketId: string;
          leaseToken: string;
          payload: { copy: { receiptTitle: string } };
        };
      };
      expect(winterClaimBody.job.ticketId).toBe(winterTicket.ticket.id);
      expect(winterClaimBody.job.payload.copy.receiptTitle).toBe(
        'Winter ticket',
      );
      const sampleClaim = await claim(sampleAgent.token);
      expect(sampleClaim.status).toBe(200);
      const sampleClaimBody = (await sampleClaim.json()) as {
        job: { id: string; ticketId: string; leaseToken: string };
      };
      expect(sampleClaimBody.job.ticketId).toBe(sampleTicket.ticket.id);
      const report = (
        token: string,
        id: string,
        leaseToken: string,
        outputKind?: 'physical' | 'preview',
      ) =>
        app.request(`/api/v3/agent/print-jobs/${id}/result`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            leaseToken,
            outcome: 'printed',
            ...(outputKind === undefined ? {} : { outputKind }),
          }),
        });
      const crossEventResult = await report(
        autumnAgent.token,
        winterClaimBody.job.id,
        winterClaimBody.job.leaseToken,
        'preview',
      );
      const crossTenantResult = await report(
        autumnAgent.token,
        sampleClaimBody.job.id,
        sampleClaimBody.job.leaseToken,
        'physical',
      );
      expect(crossEventResult.status).toBe(404);
      expect(crossTenantResult.status).toBe(404);

      const resultResponse = await report(
        autumnAgent.token,
        autumnClaimBody.job.id,
        autumnClaimBody.job.leaseToken,
        'preview',
      );
      expect(resultResponse.status).toBe(200);
      const resultBody = (await resultResponse.json()) as {
        job: { outputKind: string | null };
      };
      expect(resultBody.job.outputKind).toBe('preview');
      const winterResult = await report(
        winterAgent.token,
        winterClaimBody.job.id,
        winterClaimBody.job.leaseToken,
        'physical',
      );
      const sampleResult = await report(
        sampleAgent.token,
        sampleClaimBody.job.id,
        sampleClaimBody.job.leaseToken,
      );
      expect(winterResult.status).toBe(200);
      expect(sampleResult.status).toBe(200);
      const winterResultBody = (await winterResult.json()) as {
        job: { outputKind: string | null };
      };
      const sampleResultBody = (await sampleResult.json()) as {
        job: { outputKind: string | null };
      };
      expect(winterResultBody.job.outputKind).toBe('physical');
      expect(sampleResultBody.job.outputKind).toBeNull();
      const outputKinds = await owner.query<{
        id: string;
        outputKind: string | null;
      }>(
        `SELECT id::text, output_kind AS "outputKind"
         FROM print_jobs
         WHERE id = ANY($1::uuid[])`,
        [
          [
            autumnClaimBody.job.id,
            winterClaimBody.job.id,
            sampleClaimBody.job.id,
          ],
        ],
      );
      expect(outputKinds.rows).toEqual(
        expect.arrayContaining([
          { id: autumnClaimBody.job.id, outputKind: 'preview' },
          { id: winterClaimBody.job.id, outputKind: 'physical' },
          { id: sampleClaimBody.job.id, outputKind: null },
        ]),
      );
      const rotateResponse = await app.request(
        `${eventPath('autumn-preview')}/agents/${autumnAgent.id}/rotate`,
        { method: 'POST', headers: adminHeaders, body: '{}' },
      );
      expect(rotateResponse.status).toBe(201);
      const rotatedAgent = (await rotateResponse.json()) as { token: string };
      expect(
        await authorization.resolveAgentScope(autumnAgent.token),
      ).not.toBeNull();
      expect(
        await authorization.resolveAgentScope(rotatedAgent.token),
      ).not.toBeNull();
      const revokeResponse = await app.request(
        `${eventPath('autumn-preview')}/agents/${autumnAgent.id}/revoke`,
        { method: 'POST', headers: adminHeaders, body: '{}' },
      );
      expect(revokeResponse.status).toBe(200);
      expect(
        await authorization.resolveAgentScope(autumnAgent.token),
      ).toBeNull();
      expect(
        await authorization.resolveAgentScope(rotatedAgent.token),
      ).toBeNull();

      const missingPublic = await app.request(
        `/api/public/tickets/${'z'.repeat(22)}`,
      );
      expect(missingPublic.status).toBe(404);
      const missingPublicBody = await missingPublic.json();
      now = new Date(Date.parse(eventEndsAt) + 60_000);
      const expiredPublic = await app.request(
        `/api/public/tickets/${publicToken}`,
      );
      expect(expiredPublic.status).toBe(404);
      expect(await expiredPublic.json()).toEqual(missingPublicBody);

      now = new Date(Date.parse(eventEndsAt) - 60_000);
      const autumnEvent = manifest.tenants
        .find(({ id }) => id === primaryTenantId)
        ?.events.find(({ slug }) => slug === 'autumn-preview');
      if (autumnEvent === undefined) {
        throw new Error(
          'The autumn event is missing from the parsed manifest.',
        );
      }
      await owner.query(
        'UPDATE events SET disabled_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2',
        [primaryTenantId, autumnEvent.id],
      );
      const disabledPublic = await app.request(
        `/api/public/tickets/${publicToken}`,
      );
      expect(disabledPublic.status).toBe(404);
      expect(await disabledPublic.json()).toEqual(missingPublicBody);
    } finally {
      await runtime.close();
    }
  });
}, 120_000);
