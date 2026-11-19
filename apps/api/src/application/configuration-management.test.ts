import { expect, it, vi } from 'vitest';
import { eventConfigurationRevision } from '../domain/event-configuration.ts';
import {
  type ConfigurationManagementStore,
  createConfigurationManagementService,
  type GitHubAccountResolver,
  maximumAuditPageSize,
} from './configuration-management.ts';

const actor = { issuer: 'https://github.com', subject: '1001' };
const config = {
  title: 'Fair',
  timeZone: 'Europe/Berlin',
  startsAt: '2027-03-06T09:00:00+01:00',
  endsAt: '2027-03-06T18:00:00+01:00',
  numberScope: 'event',
  equipment: [{ id: 'station-a', label: 'Station A' }],
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
  copy: { receiptTitle: 'Fair', arrivalGuidance: 'Come to the desk.' },
  defaultPrinterId: 'front-desk',
  printers: [{ id: 'front-desk', label: 'Front desk' }],
};

function fixtures() {
  const store = {
    requireAdmin: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    upsertMember: vi.fn(),
    readAudit: vi.fn(),
  };
  const github = { findByLogin: vi.fn(), findBySubject: vi.fn() };
  const service = createConfigurationManagementService(
    store as unknown as ConfigurationManagementStore,
    github as unknown as GitHubAccountResolver,
  );
  return { store, github, service };
}

it('validates an event configuration before the store sees it and derives a key-order independent revision', async () => {
  const { store, service } = fixtures();
  store.createEvent.mockResolvedValue({ ok: true, value: {} });

  const invalid = await service.createEvent(actor, 'fair', {
    slug: 'spring',
    config: { ...config, schedule: [] },
  });
  expect(invalid).toMatchObject({
    ok: false,
    error: { code: 'invalid_config' },
  });
  const identity = await service.createEvent(actor, 'fair', {
    slug: 'spring',
    config: { ...config, id: '00000000-0000-4000-8000-000000000009' },
  });
  expect(identity).toMatchObject({
    ok: false,
    error: { code: 'invalid_config' },
  });
  expect(store.createEvent).not.toHaveBeenCalled();

  const reordered = Object.fromEntries(Object.entries(config).reverse());
  await service.createEvent(actor, 'fair', {
    slug: 'spring',
    config: reordered,
  });
  expect(store.createEvent).toHaveBeenCalledWith(actor, 'fair', {
    slug: 'spring',
    config,
    configRevision: eventConfigurationRevision(config),
  });
  expect(eventConfigurationRevision(config)).toMatch(/^[a-f0-9]{64}$/);
  expect(eventConfigurationRevision(reordered)).toBe(
    eventConfigurationRevision(config),
  );
  expect(
    eventConfigurationRevision({ ...config, title: 'Another title' }),
  ).not.toBe(eventConfigurationRevision(config));
});

it('authorizes before it calls GitHub and stores the subject GitHub confirmed', async () => {
  const { store, github, service } = fixtures();
  const input = {
    expectedRevision: 3,
    subject: '1004',
    role: 'staff',
  } as const;

  store.requireAdmin.mockResolvedValueOnce({
    ok: false,
    error: { code: 'forbidden' },
  });
  expect(
    await service.upsertMember(actor, 'fair', input, async () => 'token'),
  ).toEqual({ ok: false, error: { code: 'forbidden' } });
  expect(github.findBySubject).not.toHaveBeenCalled();

  store.requireAdmin.mockResolvedValue({ ok: true, value: null });
  github.findBySubject.mockResolvedValueOnce({ kind: 'unavailable' });
  expect(
    await service.upsertMember(actor, 'fair', input, async () => null),
  ).toEqual({ ok: false, error: { code: 'upstream_unavailable' } });
  github.findBySubject.mockResolvedValueOnce({ kind: 'not_found' });
  expect(
    await service.upsertMember(actor, 'fair', input, async () => null),
  ).toEqual({ ok: false, error: { code: 'member_not_found' } });
  expect(store.upsertMember).not.toHaveBeenCalled();

  github.findBySubject.mockResolvedValueOnce({
    kind: 'ok',
    subject: '1004',
    login: 'dave',
    displayName: 'Dave',
  });
  store.upsertMember.mockResolvedValue({ ok: true, value: { revision: 4 } });
  expect(
    await service.upsertMember(actor, 'fair', input, async () => 'token'),
  ).toEqual({ ok: true, value: { revision: 4 } });
  expect(github.findBySubject).toHaveBeenLastCalledWith('1004', 'token');
  expect(store.upsertMember).toHaveBeenCalledWith(actor, 'fair', input);
});

it('does not turn a token getter exception into a GitHub transport failure', async () => {
  const { store, github, service } = fixtures();
  store.requireAdmin.mockResolvedValue({ ok: true, value: null });
  const tokenError = new Error('token selection failed');

  await expect(
    service.resolveMember(actor, 'fair', 'octo', async () => {
      throw tokenError;
    }),
  ).rejects.toBe(tokenError);
  expect(github.findByLogin).not.toHaveBeenCalled();
});

it('preserves GitHub reauthentication and rate-limit outcomes for member operations', async () => {
  const { store, github, service } = fixtures();
  store.requireAdmin.mockResolvedValue({ ok: true, value: null });

  github.findByLogin
    .mockResolvedValueOnce({ kind: 'reauth_required' })
    .mockResolvedValueOnce({ kind: 'rate_limited', retryAfterSeconds: 45 });
  expect(
    await service.resolveMember(actor, 'fair', 'octo', async () => 'token'),
  ).toEqual({ ok: false, error: { code: 'github_reauth_required' } });
  expect(
    await service.resolveMember(actor, 'fair', 'octo', async () => 'token'),
  ).toEqual({
    ok: false,
    error: { code: 'github_rate_limited', retryAfterSeconds: 45 },
  });

  github.findBySubject
    .mockResolvedValueOnce({ kind: 'reauth_required' })
    .mockResolvedValueOnce({ kind: 'rate_limited', retryAfterSeconds: 45 });
  const input = {
    expectedRevision: 7,
    subject: '1004',
    role: 'staff',
  } as const;
  expect(
    await service.upsertMember(actor, 'fair', input, async () => 'token'),
  ).toEqual({ ok: false, error: { code: 'github_reauth_required' } });
  expect(
    await service.upsertMember(actor, 'fair', input, async () => 'token'),
  ).toEqual({
    ok: false,
    error: { code: 'github_rate_limited', retryAfterSeconds: 45 },
  });
  expect(store.upsertMember).not.toHaveBeenCalled();
});

it('round-trips opaque audit cursors, rejects forged ones, and caps the page size', async () => {
  const { store, service } = fixtures();
  const next = {
    occurredAt: '2027-03-06T09:00:00.123456Z',
    id: '00000000-0000-4000-8000-000000000009',
  };
  store.readAudit.mockResolvedValue({
    ok: true,
    value: { entries: [], nextCursor: next },
  });

  const first = await service.readAudit(actor, 'fair', {
    limit: 500,
    cursor: undefined,
  });
  expect(store.readAudit).toHaveBeenLastCalledWith(actor, 'fair', {
    limit: maximumAuditPageSize,
    before: null,
  });
  if (!first.ok || first.value.nextCursor === null) {
    throw new Error('The first audit page did not return a cursor.');
  }
  expect(first.value.nextCursor).not.toContain(next.id);

  await service.readAudit(actor, 'fair', {
    limit: 10,
    cursor: first.value.nextCursor,
  });
  expect(store.readAudit).toHaveBeenLastCalledWith(actor, 'fair', {
    limit: 10,
    before: next,
  });

  store.readAudit.mockClear();
  for (const forged of [
    'not-base64-json',
    Buffer.from('{"occurredAt":"nope","id":"x"}').toString('base64url'),
    Buffer.from('{"occurredAt":"2027-03-06T09:00:00Z"}').toString('base64url'),
  ]) {
    expect(
      await service.readAudit(actor, 'fair', { limit: 10, cursor: forged }),
    ).toEqual({ ok: false, error: { code: 'invalid_cursor' } });
  }
  expect(store.readAudit).not.toHaveBeenCalled();
});
