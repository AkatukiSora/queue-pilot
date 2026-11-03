import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Ticket } from '../../src/application/ports.ts';
import { parseSlotSchedule } from '../../src/domain/ticket.ts';
import { createApplicationFakes } from '../fakes/application-fakes.ts';

const ADMIN_TOKEN = 'a'.repeat(32);
const AGENT_TOKEN = 'b'.repeat(32);
const parsedSchedule = parseSlotSchedule(
  '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
);
if (!parsedSchedule.ok) throw new Error('Test slot schedule is invalid.');
const slotSchedule = parsedSchedule.value;

function makeApp(
  options: { eventEndAt?: Date; checkReadiness?: () => Promise<boolean> } = {},
) {
  const fakes = createApplicationFakes();
  const app = createApp({
    config: {
      databaseUrl: 'postgres://test:test@127.0.0.1:5432/test',
      adminToken: ADMIN_TOKEN,
      agentToken: AGENT_TOKEN,
      eventEndAt: options.eventEndAt ?? new Date('2026-11-04T05:00:00.000Z'),
      numberScope: 'daily',
      slotSchedule,
    },
    unitOfWork: fakes.unitOfWork,
    clock: fakes.clock,
    tokens: {
      ...fakes.tokens,
      ticketId: randomUUID,
      printJobId: randomUUID,
      leaseToken: randomUUID,
    },
    checkReadiness: options.checkReadiness ?? (async () => true),
  });
  return { app, fakes };
}

function issueRequest(
  key: string,
  slotStartsAt = '2026-11-03T01:00:00.000Z',
  equipment = 'Quest 3',
) {
  return new Request('http://localhost/api/admin/tickets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({ slotStartsAt, equipment }),
  });
}

async function issueTicket(
  app: ReturnType<typeof makeApp>['app'],
  key: string,
  slotStartsAt?: string,
  equipment?: string,
) {
  return app.request(issueRequest(key, slotStartsAt, equipment));
}

function adminHeaders() {
  return { Authorization: `Bearer ${ADMIN_TOKEN}` };
}

describe('HTTP API', () => {
  it('enforces separate admin and agent bearer credentials', async () => {
    const { app } = makeApp();
    const reservations = '/api/admin/reservations';
    const claim = '/api/agent/print-jobs/claim';

    expect((await app.request(reservations)).status).toBe(401);
    expect(
      (
        await app.request(reservations, {
          headers: { Authorization: 'Bearer unknown' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(reservations, {
          headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        })
      ).status,
    ).toBe(401);
    expect(
      (await app.request(claim, { method: 'POST', headers: adminHeaders() }))
        .status,
    ).toBe(401);
    expect(
      (
        await app.request(claim, {
          method: 'POST',
          headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
        })
      ).status,
    ).toBe(204);
    expect(
      (await app.request(reservations, { headers: adminHeaders() })).status,
    ).toBe(200);
  });

  it('issues and replays reservations, rejects changed payloads, and requires Idempotency-Key', async () => {
    const { app } = makeApp();
    const created = await issueTicket(app, 'issue-key');
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.ticket.reservation).toMatchObject({
      kind: 'slot',
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Quest 3',
    });
    expect(createdBody.ticket).not.toHaveProperty('partySize');
    expect(createdBody.ticket).not.toHaveProperty('publicToken');

    const replay = await issueTicket(app, 'issue-key');
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.json()).toEqual(createdBody);

    expect(
      (await issueTicket(app, 'issue-key', '2026-11-03T01:30:00.000Z')).status,
    ).toBe(422);
    expect(
      (await issueTicket(app, 'occupied-slot', '2026-11-03T01:00:00.000Z'))
        .status,
    ).toBe(409);
    expect(
      (
        await issueTicket(
          app,
          'invalid-equipment',
          '2026-11-03T01:00:00.000Z',
          'Unknown device',
        )
      ).status,
    ).toBe(400);
    const missingKey = await app.request('/api/admin/tickets', {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotStartsAt: '2026-11-03T01:00:00.000Z',
        equipment: 'Quest 3',
      }),
    });
    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toEqual({
      error: { code: 'invalid_request', message: 'Request validation failed.' },
    });
  });

  it('assigns a legacy ticket through the reschedule route and prints the slot payload', async () => {
    const { app, fakes } = makeApp();
    const id = randomUUID();
    const now = new Date('2026-11-02T12:00:00.000Z');
    const legacyTicket: Ticket = {
      id,
      counterKey: '2026-11-02',
      number: 99,
      publicToken: fakes.tokens.publicToken(),
      idempotencyKey: 'legacy-api-ticket',
      requestHash: 'a'.repeat(64),
      reservation: { kind: 'legacy' },
      state: { status: 'waiting' },
      partySize: 3,
      issuedAt: now,
      updatedAt: now,
      latestChange: null,
    };
    fakes.seedTicket(legacyTicket);

    const before = await app.request('/api/admin/reservations', {
      headers: adminHeaders(),
    });
    expect((await before.json()).legacyTickets).toHaveLength(1);

    const assigned = await app.request(`/api/admin/tickets/${id}/reschedule`, {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotStartsAt: '2026-11-03T01:00:00.000Z',
        equipment: 'Quest 3',
        comment: 'Initial assignment.',
      }),
    });
    expect(assigned.status).toBe(200);
    expect(await assigned.json()).toMatchObject({
      reprintRequired: true,
      ticket: {
        id,
        status: 'waiting',
        reservation: { kind: 'slot', equipment: 'Quest 3' },
        latestChange: null,
      },
    });

    const after = await app.request('/api/admin/reservations', {
      headers: adminHeaders(),
    });
    const reservations = await after.json();
    expect(reservations.legacyTickets).toHaveLength(0);
    expect(
      reservations.slots.find(
        (slot: { ticket: { id: string } | null }) => slot.ticket?.id === id,
      ),
    ).toBeDefined();

    const reprint = await app.request(`/api/admin/tickets/${id}/reprint`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    expect(reprint.status).toBe(201);
    const claimed = await app.request('/api/agent/print-jobs/claim', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    });
    expect(claimed.status).toBe(200);
    const { job } = await claimed.json();
    expect(job.payload).toMatchObject({
      kind: 'slot',
      slotStartsAt: '2026-11-03T01:00:00.000Z',
    });
    expect(job.payload).not.toHaveProperty('partySize');
  });

  it('serves legacy waiting tickets and assigns legacy called tickets without restoring call routes', async () => {
    const { app, fakes } = makeApp();
    const issuedAt = new Date('2026-11-02T12:00:00.000Z');
    const waiting: Ticket = {
      id: randomUUID(),
      counterKey: '2026-11-02',
      number: 91,
      publicToken: fakes.tokens.publicToken(),
      idempotencyKey: 'legacy-waiting-key',
      requestHash: 'c'.repeat(64),
      reservation: { kind: 'legacy' },
      state: { status: 'waiting' },
      partySize: 2,
      issuedAt,
      updatedAt: issuedAt,
      latestChange: null,
    };
    const called: Ticket = {
      ...waiting,
      id: randomUUID(),
      number: 92,
      publicToken: fakes.tokens.publicToken(),
      idempotencyKey: 'legacy-called-key',
      requestHash: 'd'.repeat(64),
      state: { status: 'called' },
    };
    fakes.seedTicket(waiting);
    fakes.seedTicket(called);

    const served = await app.request(`/api/admin/tickets/${waiting.id}/serve`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    expect(served.status).toBe(200);
    expect((await served.json()).ticket.status).toBe('served');

    const assigned = await app.request(
      `/api/admin/tickets/${called.id}/reschedule`,
      {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStartsAt: '2026-11-03T01:00:00.000Z',
          equipment: 'Quest 3',
          comment: 'ignored on initial assignment',
        }),
      },
    );
    expect(assigned.status).toBe(200);
    expect(await assigned.json()).toMatchObject({
      reprintRequired: true,
      ticket: {
        id: called.id,
        number: called.number,
        status: 'waiting',
        reservation: { kind: 'slot', equipment: 'Quest 3' },
        latestChange: null,
      },
    });
    expect(
      fakes.getState().tickets.find(({ id }) => id === called.id),
    ).toMatchObject({
      id: called.id,
      number: called.number,
      publicToken: called.publicToken,
      requestHash: called.requestHash,
      reservation: { kind: 'slot' },
      latestChange: null,
    });
    expect(fakes.getState().printJobs).toHaveLength(0);

    const servedReschedule = await app.request(
      `/api/admin/tickets/${waiting.id}/reschedule`,
      {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStartsAt: '2026-11-03T01:30:00.000Z',
          equipment: 'Quest 3',
        }),
      },
    );
    expect(servedReschedule.status).toBe(409);

    const cancelled = await app.request(
      `/api/admin/tickets/${called.id}/cancel`,
      {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'staff' }),
      },
    );
    expect(cancelled.status).toBe(200);
    const cancelledReschedule = await app.request(
      `/api/admin/tickets/${called.id}/reschedule`,
      {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStartsAt: '2026-11-03T01:30:00.000Z',
          equipment: 'Quest 3',
        }),
      },
    );
    expect(cancelledReschedule.status).toBe(409);
  });

  it('validates reschedule comments by Unicode code point and rejects control characters', async () => {
    const { app, fakes } = makeApp();
    const created = await issueTicket(app, 'comment-limit');
    const { ticket } = await created.json();
    fakes.clearPrintJobs(ticket.id);
    const path = `/api/admin/tickets/${ticket.id}/reschedule`;
    const reschedule = (slotStartsAt: string, comment: string) =>
      app.request(path, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotStartsAt, equipment: 'Quest 3', comment }),
      });

    const comment = '😀'.repeat(200);
    const accepted = await reschedule('2026-11-03T01:30:00.000Z', comment);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).ticket.latestChange.comment).toBe(comment);

    expect(
      (await reschedule('2026-11-03T02:00:00.000Z', '😀'.repeat(201))).status,
    ).toBe(400);
    expect(
      (await reschedule('2026-11-03T02:30:00.000Z', 'first line\nsecond line'))
        .status,
    ).toBe(400);
    expect(
      (await reschedule('2026-11-03T03:00:00.000Z', '\nleading newline'))
        .status,
    ).toBe(400);
    const detail = await app.request(`/api/admin/tickets/${ticket.id}`, {
      headers: adminHeaders(),
    });
    expect((await detail.json()).ticket.reservation.slotStartsAt).toBe(
      '2026-11-03T01:30:00.000Z',
    );
  });

  it('retires call routes and allows direct serving of a slot reservation', async () => {
    const { app } = makeApp();
    const created = await issueTicket(app, 'transition-key');
    const { ticket } = await created.json();
    const headers = adminHeaders();

    const retired = await app.request(`/api/admin/tickets/${ticket.id}/call`, {
      method: 'POST',
      headers,
    });
    expect(retired.status).toBe(404);

    const served = await app.request(`/api/admin/tickets/${ticket.id}/serve`, {
      method: 'POST',
      headers,
    });
    expect(served.status).toBe(200);
    expect((await served.json()).ticket.status).toBe('served');

    const missing = await app.request(
      '/api/admin/tickets/00000000-0000-4000-8000-000000000000/serve',
      { method: 'POST', headers },
    );
    expect(missing.status).toBe(404);
  });

  it('returns only the caller ticket fields from the public endpoint', async () => {
    const { app, fakes } = makeApp();
    const firstResponse = await issueTicket(
      app,
      'public-first',
      '2026-11-03T01:00:00.000Z',
    );
    const secondResponse = await issueTicket(
      app,
      'public-second',
      '2026-11-03T01:30:00.000Z',
    );
    const first = (await firstResponse.json()).ticket;
    const second = (await secondResponse.json()).ticket;
    const storedTickets = fakes.getState().tickets;
    const firstPublicToken = storedTickets.find(
      (ticket) => ticket.id === first.id,
    )?.publicToken;
    const secondPublicToken = storedTickets.find(
      (ticket) => ticket.id === second.id,
    )?.publicToken;
    if (firstPublicToken === undefined || secondPublicToken === undefined) {
      throw new Error('Expected issued tickets in the fake repository.');
    }

    const publicResponse = await app.request(
      `/api/public/tickets/${firstPublicToken}`,
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json();
    expect(Object.keys(publicBody).sort()).toEqual([
      'latestChange',
      'number',
      'reservation',
      'status',
    ]);
    expect(publicBody.reservation).toMatchObject({
      kind: 'slot',
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Quest 3',
    });
    expect(publicBody.latestChange).toBeNull();
    expect(JSON.stringify(publicBody)).not.toContain(firstPublicToken);
    expect(JSON.stringify(publicBody)).not.toContain(secondPublicToken);
    expect(JSON.stringify(publicBody)).not.toContain(first.id);
    expect(JSON.stringify(publicBody)).not.toContain(second.id);
    expect(
      (await app.request('/api/public/tickets/not-a-valid-token')).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/public/tickets/${'Z'.repeat(22)}`)).status,
    ).toBe(404);
  });

  it('returns 410 after EVENT_END_AT', async () => {
    const { app, fakes } = makeApp({
      eventEndAt: new Date('2026-11-02T11:00:00.000Z'),
    });
    const created = await issueTicket(app, 'expired-ticket');
    const { ticket } = await created.json();
    const storedTicket = fakes
      .getState()
      .tickets.find((candidate) => candidate.id === ticket.id);
    if (storedTicket === undefined)
      throw new Error('Expected issued ticket in the fake repository.');
    const response = await app.request(
      `/api/public/tickets/${storedTicket.publicToken}`,
    );
    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe('ticket_expired');
  });

  it('returns queue and ticket print history without internal tokens or idempotency data', async () => {
    const { app, fakes } = makeApp();
    const created = await issueTicket(app, 'private-history');
    const { ticket } = await created.json();
    const storedTicket = fakes
      .getState()
      .tickets.find((candidate) => candidate.id === ticket.id);
    if (storedTicket === undefined) {
      throw new Error('Expected issued ticket in the fake repository.');
    }
    const publicToken = storedTicket.publicToken;

    const details = await app.request(`/api/admin/tickets/${ticket.id}`, {
      headers: adminHeaders(),
    });
    expect(details.status).toBe(200);
    const detailsBody = await details.json();
    expect(detailsBody.printJobs).toHaveLength(1);
    const detailsText = JSON.stringify(detailsBody);
    expect(detailsText).not.toContain(publicToken);
    expect(detailsText).not.toContain('idempotencyKey');
    expect(detailsText).not.toContain('requestHash');
    expect(detailsText).not.toContain('leaseToken');

    const reservations = await app.request('/api/admin/reservations', {
      headers: adminHeaders(),
    });
    expect(reservations.status).toBe(200);
    const reservationsBody = await reservations.json();
    expect(reservationsBody.slots).toHaveLength(72);
    expect(
      reservationsBody.slots.filter(
        (slot: { ticket: unknown }) => slot.ticket !== null,
      ),
    ).toHaveLength(1);
    expect(reservationsBody.legacyTickets).toHaveLength(0);
    expect(reservationsBody.unconfiguredTickets).toHaveLength(0);
    expect(JSON.stringify(reservationsBody)).not.toContain(publicToken);
    expect(
      (await app.request('/api/admin/queue', { headers: adminHeaders() }))
        .status,
    ).toBe(404);
  });

  it('claims, reports, and reprints jobs with lease checks', async () => {
    const { app, fakes } = makeApp();
    const created = await issueTicket(app, 'print-flow');
    const { ticket } = await created.json();
    const storedTicket = fakes
      .getState()
      .tickets.find((candidate) => candidate.id === ticket.id);
    if (storedTicket === undefined)
      throw new Error('Expected issued ticket in the fake repository.');
    const admin = adminHeaders();
    const agent = { Authorization: `Bearer ${AGENT_TOKEN}` };

    const blockedReprint = await app.request(
      `/api/admin/tickets/${ticket.id}/reprint`,
      {
        method: 'POST',
        headers: admin,
      },
    );
    expect(blockedReprint.status).toBe(409);

    const claim = await app.request('/api/agent/print-jobs/claim', {
      method: 'POST',
      headers: agent,
    });
    expect(claim.status).toBe(200);
    const { job } = await claim.json();
    expect(job.payload.publicToken).toBe(storedTicket.publicToken);

    const mismatch = await app.request(
      `/api/agent/print-jobs/${job.id}/result`,
      {
        method: 'POST',
        headers: { ...agent, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseToken: 'wrong-lease', outcome: 'failed' }),
      },
    );
    expect(mismatch.status).toBe(409);

    const reported = await app.request(
      `/api/agent/print-jobs/${job.id}/result`,
      {
        method: 'POST',
        headers: { ...agent, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseToken: job.leaseToken, outcome: 'failed' }),
      },
    );
    expect(reported.status).toBe(200);
    expect((await reported.json()).job.status).toBe('failed');
    fakes.setNow(new Date('2026-11-02T12:00:01.000Z'));

    const reprint = await app.request(
      `/api/admin/tickets/${ticket.id}/reprint`,
      {
        method: 'POST',
        headers: admin,
      },
    );
    expect(reprint.status).toBe(201);
    const reprintBody = await reprint.json();
    expect(reprintBody.job.reprintOf).toBe(job.id);
    expect(JSON.stringify(reprintBody)).not.toContain(storedTicket.publicToken);
    expect(
      (
        await app.request(`/api/admin/tickets/${ticket.id}/reprint`, {
          method: 'POST',
          headers: admin,
        })
      ).status,
    ).toBe(409);
  });

  it('generates the documented OpenAPI 3.1 routes', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/openapi.json');
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.version).toBe('2.0.0');
    expect(Object.keys(document.paths).sort()).toEqual(
      [
        '/api/admin/reservations',
        '/api/admin/tickets',
        '/api/admin/tickets/{id}',
        '/api/admin/tickets/{id}/cancel',
        '/api/admin/tickets/{id}/reprint',
        '/api/admin/tickets/{id}/reschedule',
        '/api/admin/tickets/{id}/serve',
        '/api/agent/print-jobs/claim',
        '/api/agent/print-jobs/{id}/result',
        '/api/healthz',
        '/api/openapi.json',
        '/api/public/tickets/{token}',
        '/api/readyz',
      ].sort(),
    );
    expect(document.paths['/api/admin/reservations'].get.security).toEqual([
      { BearerAuth: [] },
    ]);
  });

  it('logs only the error name and message when a request fails unexpectedly', async () => {
    const error = new Error('readiness check failed');
    const { app } = makeApp({
      checkReadiness: async () => {
        throw error;
      },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await app.request('/api/readyz', {
        headers: adminHeaders(),
      });
      expect(response.status).toBe(500);
      expect(log).toHaveBeenCalledExactlyOnceWith({
        name: error.name,
        message: error.message,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(ADMIN_TOKEN);
    } finally {
      log.mockRestore();
    }
  });

  it('rejects oversized request bodies and result details over 500 characters', async () => {
    const { app } = makeApp();
    const oversized = await app.request('/api/agent/print-jobs/claim', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ detail: 'x'.repeat(16 * 1024) }),
    });
    expect(oversized.status).toBe(413);

    const longDetail = await app.request(
      '/api/agent/print-jobs/00000000-0000-4000-8000-000000000000/result',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AGENT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: 'lease-test',
          outcome: 'failed',
          detail: 'x'.repeat(501),
        }),
      },
    );
    expect(longDetail.status).toBe(400);
  });

  it('uses the JSON error envelope for unknown API paths and serves SPA fallback elsewhere', async () => {
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), 'ticket-spa-'),
    );
    try {
      await writeFile(
        join(root, 'index.html'),
        '<!doctype html><title>spa</title>',
      );
      await writeFile(join(root, 'asset.txt'), 'asset');
      const { fakes } = makeApp();
      const app = createApp({
        config: {
          databaseUrl: 'postgres://test:test@127.0.0.1:5432/test',
          adminToken: ADMIN_TOKEN,
          agentToken: AGENT_TOKEN,
          eventEndAt: new Date('2026-11-04T05:00:00.000Z'),
          numberScope: 'daily',
          slotSchedule,
        },
        unitOfWork: fakes.unitOfWork,
        clock: fakes.clock,
        tokens: fakes.tokens,
        checkReadiness: async () => true,
        staticRoot: root,
      });
      const page = await app.request('/admin');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>spa</title>');
      expect(await (await app.request('/asset.txt')).text()).toBe('asset');

      const apiMiss = await app.request('/api/does-not-exist');
      expect(apiMiss.status).toBe(404);
      expect(await apiMiss.json()).toEqual({
        error: { code: 'not_found', message: 'Resource was not found.' },
      });

      expect((await app.request('/api/admin/queue')).status).toBe(401);
      expect(
        (await app.request('/api/agent/print-jobs/claim', { method: 'POST' }))
          .status,
      ).toBe(401);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports readiness failure without leaking database diagnostics', async () => {
    const { app } = makeApp({ checkReadiness: async () => false });
    const response = await app.request('/api/readyz');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'not_ready', message: 'Database is not ready.' },
    });
  });
});
