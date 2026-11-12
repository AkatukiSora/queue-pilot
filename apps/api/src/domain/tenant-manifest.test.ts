import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
  expandManifestSchedule,
  parseTenantManifest,
  type TenantManifest,
} from './tenant-manifest.ts';

const legacyEvent = {
  id: DEFAULT_EVENT_ID,
  slug: 'default',
  title: 'Default event',
  timeZone: 'Asia/Tokyo',
  startsAt: '2026-11-03T00:00:00Z',
  endsAt: '2026-11-04T05:00:00Z',
  numberScope: 'daily',
  equipment: [
    { id: 'quest-3', label: 'Quest 3' },
    { id: 'quest-3s', label: 'Quest 3S' },
    { id: 'steam-frame', label: 'Steam Frame' },
    { id: 'beyond2', label: 'Beyond2' },
  ],
  schedule: [
    {
      date: '2026-11-03',
      firstStart: '10:00',
      lastStart: '14:30',
      intervalMinutes: 30,
      experienceMinutes: 25,
      turnoverMinutes: 5,
    },
    {
      date: '2026-11-04',
      firstStart: '10:00',
      lastStart: '13:30',
      intervalMinutes: 30,
      experienceMinutes: 25,
      turnoverMinutes: 5,
    },
  ],
  copy: { receiptTitle: 'Queue ticket', arrivalGuidance: 'Please arrive.' },
  defaultPrinterId: 'legacy-printer',
  printers: [{ id: 'legacy-printer', label: 'Legacy printer' }],
} as const;

function manifestWith(event: unknown): unknown {
  return {
    schemaVersion: 1,
    tenants: [
      {
        id: DEFAULT_TENANT_ID,
        slug: 'default',
        displayName: 'Default organization',
        members: [
          {
            issuer: 'https://id.example.invalid',
            subject: 'fixture-admin',
            role: 'admin',
            disabled: false,
          },
        ],
        events:
          typeof event === 'object' &&
          event !== null &&
          'id' in event &&
          event.id !== DEFAULT_EVENT_ID
            ? [legacyEvent, event]
            : [event],
      },
    ],
  };
}

function parse(input: unknown): TenantManifest {
  const result = parseTenantManifest(input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('parseTenantManifest', () => {
  it('accepts arbitrary tenant and event identities without a fixed default', () => {
    const event = {
      ...legacyEvent,
      id: '20000000-0000-4000-8000-000000000002',
      slug: 'bunkasai',
      timeZone: 'America/Los_Angeles',
      startsAt: '2026-06-01T15:00:00Z',
      endsAt: '2026-06-01T18:00:00Z',
      equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
      schedule: [
        {
          date: '2026-06-01',
          firstStart: '09:00',
          lastStart: '09:40',
          intervalMinutes: 20,
          experienceMinutes: 15,
          turnoverMinutes: 5,
        },
      ],
    };
    const result = parseTenantManifest({
      schemaVersion: 1,
      tenants: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          slug: 'campus',
          displayName: 'Campus organization',
          members: [],
          events: [event],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('expands the legacy default event to the same 72 equipment slots', () => {
    const manifest = parse(manifestWith(legacyEvent));
    const event = manifest.tenants[0]?.events[0];
    if (!event) throw new Error('Missing default event fixture.');

    const slots = expandManifestSchedule(event);
    expect(slots).toHaveLength(72);
    expect(slots[0]).toEqual({
      startsAt: '2026-11-03T01:00:00.000Z',
      endsAt: '2026-11-03T01:25:00Z',
      equipmentId: 'quest-3',
      experienceMinutes: 25,
      intervalMinutes: 30,
    });
    expect(slots.at(-1)).toEqual({
      startsAt: '2026-11-04T04:30:00.000Z',
      endsAt: '2026-11-04T04:55:00Z',
      equipmentId: 'beyond2',
      experienceMinutes: 25,
      intervalMinutes: 30,
    });
  });

  it('accepts a configurable 20-minute interval and one equipment item', () => {
    const event = {
      ...legacyEvent,
      id: '20000000-0000-4000-8000-000000000002',
      slug: 'summer',
      timeZone: 'America/Los_Angeles',
      startsAt: '2026-06-01T15:00:00Z',
      endsAt: '2026-06-01T18:00:00Z',
      numberScope: 'event',
      equipment: [{ id: 'demo-unit', label: 'Demo unit' }],
      schedule: [
        {
          date: '2026-06-01',
          firstStart: '09:00',
          lastStart: '09:40',
          intervalMinutes: 20,
          experienceMinutes: 15,
          turnoverMinutes: 5,
        },
      ],
    };

    const parsed = parse(manifestWith(event));
    const parsedEvent = parsed.tenants[0]?.events.find(
      (candidate) => candidate.slug === 'summer',
    );
    if (!parsedEvent) throw new Error('Missing configurable event fixture.');
    expect(expandManifestSchedule(parsedEvent)).toEqual([
      {
        startsAt: '2026-06-01T16:00:00.000Z',
        endsAt: '2026-06-01T16:15:00Z',
        equipmentId: 'demo-unit',
        experienceMinutes: 15,
        intervalMinutes: 20,
      },
      {
        startsAt: '2026-06-01T16:20:00.000Z',
        endsAt: '2026-06-01T16:35:00Z',
        equipmentId: 'demo-unit',
        experienceMinutes: 15,
        intervalMinutes: 20,
      },
      {
        startsAt: '2026-06-01T16:40:00.000Z',
        endsAt: '2026-06-01T16:55:00Z',
        equipmentId: 'demo-unit',
        experienceMinutes: 15,
        intervalMinutes: 20,
      },
    ]);
  });

  it('supports five equipment items without duplicating their IDs', () => {
    const event = {
      ...legacyEvent,
      id: '20000000-0000-4000-8000-000000000002',
      slug: 'five-units',
      equipment: Array.from({ length: 5 }, (_, index) => ({
        id: `unit-${index + 1}`,
        label: `Unit ${index + 1}`,
      })),
      schedule: [
        {
          date: '2026-11-03',
          firstStart: '10:00',
          lastStart: '10:00',
          intervalMinutes: 45,
          experienceMinutes: 40,
          turnoverMinutes: 5,
        },
      ],
    };
    const parsed = parse(manifestWith(event));
    const parsedEvent = parsed.tenants[0]?.events.find(
      (candidate) => candidate.slug === 'five-units',
    );
    if (!parsedEvent) throw new Error('Missing five-unit event fixture.');

    expect(expandManifestSchedule(parsedEvent)).toHaveLength(5);
    expect(
      new Set(
        expandManifestSchedule(parsedEvent).map((slot) => slot.equipmentId),
      ).size,
    ).toBe(5);
  });

  it.each([
    ['nonexistent local time', '2026-03-08', '02:30', '02:30'],
    ['ambiguous local time', '2026-11-01', '01:30', '01:30'],
  ])('rejects a DST %s', (_description, date, firstStart, lastStart) => {
    const event = {
      ...legacyEvent,
      id: '20000000-0000-4000-8000-000000000002',
      slug: 'dst-event',
      timeZone: 'America/Los_Angeles',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      schedule: [
        {
          date,
          firstStart,
          lastStart,
          intervalMinutes: 30,
          experienceMinutes: 25,
          turnoverMinutes: 5,
        },
      ],
    };

    expect(parseTenantManifest(manifestWith(event)).ok).toBe(false);
  });

  it('rejects duration mismatches, duplicate slugs, and slots outside event bounds', () => {
    const badDuration = {
      ...legacyEvent,
      schedule: [
        {
          ...legacyEvent.schedule[0],
          intervalMinutes: 45,
          experienceMinutes: 25,
          turnoverMinutes: 5,
        },
      ],
    };
    expect(parseTenantManifest(manifestWith(badDuration)).ok).toBe(false);

    const outsideBounds = {
      ...legacyEvent,
      startsAt: '2026-11-03T01:01:00Z',
    };
    expect(parseTenantManifest(manifestWith(outsideBounds)).ok).toBe(false);

    const duplicateSlug = {
      ...legacyEvent,
      id: '20000000-0000-4000-8000-000000000002',
    };
    const duplicateManifest = {
      schemaVersion: 1,
      tenants: [
        {
          id: DEFAULT_TENANT_ID,
          slug: 'default',
          displayName: 'Default organization',
          members: [],
          events: [legacyEvent, duplicateSlug],
        },
      ],
    };
    expect(parseTenantManifest(duplicateManifest).ok).toBe(false);
  });

  it('does not apply legacy event constraints based on its fixed identity', () => {
    const configurableDefaultIdentity = {
      ...legacyEvent,
      timeZone: 'UTC',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
      schedule: [
        {
          date: '2026-06-01',
          firstStart: '09:00',
          lastStart: '09:40',
          intervalMinutes: 20,
          experienceMinutes: 15,
          turnoverMinutes: 5,
        },
      ],
    };

    expect(
      parseTenantManifest(manifestWith(configurableDefaultIdentity)).ok,
    ).toBe(true);
  });

  it('rejects unknown fields and missing required event identity fields', () => {
    expect(
      parseTenantManifest(manifestWith({ ...legacyEvent, sharedMode: true }))
        .ok,
    ).toBe(false);
    expect(
      parseTenantManifest(manifestWith({ ...legacyEvent, id: 'not-a-uuid' }))
        .ok,
    ).toBe(false);
  });
});
