import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { createApplicationFakes } from '../fakes/application-fakes.ts';

const ADMIN_TOKEN = 'test-admin-token-not-a-secret';
const AGENT_TOKEN = 'test-agent-token-not-a-secret';

function makeApp(
  options: { eventEndAt?: Date; checkReadiness?: () => Promise<boolean> } = {},
) {
  const fakes = createApplicationFakes();
  const app = createApp({
    config: {
      databaseUrl: 'postgres://test:test@127.0.0.1:5432/test',
      adminToken: ADMIN_TOKEN,
      agentToken: AGENT_TOKEN,
      eventEndAt: options.eventEndAt ?? new Date('2026-11-04T00:00:00.000Z'),
      numberScope: 'daily',
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

function issueRequest(key: string, partySize?: number) {
  return new Request('http://localhost/api/admin/tickets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(partySize === undefined ? {} : { partySize }),
  });
}

async function issueTicket(
  app: ReturnType<typeof makeApp>['app'],
  key: string,
  partySize?: number,
) {
  return app.request(issueRequest(key, partySize));
}

function adminHeaders() {
  return { Authorization: `Bearer ${ADMIN_TOKEN}` };
}

describe('HTTP API', () => {
  it('enforces separate admin and agent bearer credentials', async () => {
    const { app } = makeApp();
    const queue = '/api/admin/queue';
    const claim = '/api/agent/print-jobs/claim';

    expect((await app.request(queue)).status).toBe(401);
    expect(
      (
        await app.request(queue, {
          headers: { Authorization: 'Bearer unknown' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(queue, {
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
    expect((await app.request(queue, { headers: adminHeaders() })).status).toBe(
      200,
    );
  });

  it('issues, replays, rejects changed payloads, and requires Idempotency-Key', async () => {
    const { app } = makeApp();
    const created = await issueTicket(app, 'issue-key');
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.ticket.partySize).toBe(1);
    expect(createdBody.ticket).not.toHaveProperty('publicToken');

    const replay = await issueTicket(app, 'issue-key');
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.json()).toEqual(createdBody);

    expect((await issueTicket(app, 'issue-key', 2)).status).toBe(422);
    expect((await issueTicket(app, 'invalid-party-size', 21)).status).toBe(400);
    const missingKey = await app.request('/api/admin/tickets', {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toEqual({
      error: { code: 'invalid_request', message: 'Request validation failed.' },
    });
  });

  it('maps invalid ticket transitions to 409 and unknown tickets to 404', async () => {
    const { app } = makeApp();
    const created = await issueTicket(app, 'transition-key');
    const { ticket } = await created.json();
    const headers = adminHeaders();

    const called = await app.request(`/api/admin/tickets/${ticket.id}/call`, {
      method: 'POST',
      headers,
    });
    expect(called.status).toBe(200);
    expect((await called.json()).ticket.status).toBe('called');

    const invalid = await app.request(`/api/admin/tickets/${ticket.id}/call`, {
      method: 'POST',
      headers,
    });
    expect(invalid.status).toBe(409);
    expect((await invalid.json()).error.code).toBe('invalid_transition');

    const missing = await app.request(
      `/api/admin/tickets/00000000-0000-4000-8000-000000000000/call`,
      {
        method: 'POST',
        headers,
      },
    );
    expect(missing.status).toBe(404);
  });

  it('returns only the caller ticket fields from the public endpoint', async () => {
    const { app, fakes } = makeApp();
    const firstResponse = await issueTicket(app, 'public-first', 2);
    const secondResponse = await issueTicket(app, 'public-second', 3);
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
      'aheadInQueue',
      'latestCalledNumber',
      'number',
      'status',
    ]);
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
    const { app } = makeApp();
    const created = await issueTicket(app, 'private-history');
    const { ticket } = await created.json();

    const details = await app.request(`/api/admin/tickets/${ticket.id}`, {
      headers: adminHeaders(),
    });
    expect(details.status).toBe(200);
    const detailsBody = await details.json();
    expect(detailsBody.printJobs).toHaveLength(1);
    const detailsText = JSON.stringify(detailsBody);
    expect(detailsText).not.toContain(ticket.publicToken);
    expect(detailsText).not.toContain('idempotencyKey');
    expect(detailsText).not.toContain('requestHash');
    expect(detailsText).not.toContain('leaseToken');

    const queue = await app.request('/api/admin/queue', {
      headers: adminHeaders(),
    });
    expect(queue.status).toBe(200);
    expect((await queue.json()).waiting).toHaveLength(1);
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
    expect((await reprint.json()).job.reprintOf).toBe(job.id);
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
    expect(Object.keys(document.paths).sort()).toEqual(
      [
        '/api/admin/queue',
        '/api/admin/tickets',
        '/api/admin/tickets/{id}',
        '/api/admin/tickets/{id}/call',
        '/api/admin/tickets/{id}/cancel',
        '/api/admin/tickets/{id}/recall',
        '/api/admin/tickets/{id}/reprint',
        '/api/admin/tickets/{id}/serve',
        '/api/agent/print-jobs/claim',
        '/api/agent/print-jobs/{id}/result',
        '/api/healthz',
        '/api/openapi.json',
        '/api/public/tickets/{token}',
        '/api/readyz',
      ].sort(),
    );
    expect(document.paths['/api/admin/queue'].get.security).toEqual([
      { BearerAuth: [] },
    ]);
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
          eventEndAt: new Date('2026-11-04T00:00:00.000Z'),
          numberScope: 'daily',
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
