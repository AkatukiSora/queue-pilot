import { describe, expect, it } from 'vitest';
import type { AdminReservations, AdminTicket } from './admin-api.ts';
import { categorizeAdminTickets } from './admin-categories.ts';

const now = Date.parse('2026-11-03T01:30:00.000Z');

function slotTicket({
  id,
  number,
  startsAt = '2026-11-03T01:00:00.000Z',
  endsAt = '2026-11-03T02:00:00.000Z',
  equipment = 'Quest 3',
  status = 'waiting',
  slotReleasedAt = null,
}: {
  id: string;
  number: number;
  startsAt?: string;
  endsAt?: string;
  equipment?: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
  status?: 'waiting' | 'served' | 'cancelled';
  slotReleasedAt?: string | null;
}): AdminTicket {
  const start = Date.parse(startsAt);
  return {
    id,
    counterKey: '2026-11-03',
    number,
    cancelReason: status === 'cancelled' ? 'no_show' : null,
    issuedAt: '2026-11-03T00:30:00.000Z',
    updatedAt: '2026-11-03T00:30:00.000Z',
    latestChange: null,
    slotReleasedAt,
    status,
    reservation: {
      kind: 'slot',
      slotStartsAt: startsAt,
      equipment,
      experienceEndsAt: new Date(start + 25 * 60_000).toISOString(),
      endsAt,
    },
  };
}

function legacyTicket(
  id: string,
  number: number,
  status: 'waiting' | 'called',
) {
  return {
    id,
    counterKey: '2026-11-02',
    number,
    cancelReason: null,
    issuedAt: '2026-11-02T00:30:00.000Z',
    updatedAt: '2026-11-02T00:30:00.000Z',
    latestChange: null,
    slotReleasedAt: null,
    status,
    reservation: { kind: 'legacy' },
  } satisfies AdminTicket;
}

function reservations(
  overrides: Partial<
    Pick<
      AdminReservations,
      'slots' | 'legacyTickets' | 'unconfiguredTickets' | 'releasedTickets'
    >
  > = {},
) {
  return {
    slots: [],
    legacyTickets: [],
    unconfiguredTickets: [],
    releasedTickets: [],
    ...overrides,
  } as Pick<
    AdminReservations,
    'slots' | 'legacyTickets' | 'unconfiguredTickets' | 'releasedTickets'
  >;
}

describe('categorizeAdminTickets', () => {
  it('uses exclusive states and the slot end instant, including its exact boundary', () => {
    const categories = categorizeAdminTickets(
      reservations({
        slots: [
          {
            startsAt: '2026-11-03T01:00:00.000Z',
            equipment: 'Quest 3',
            experienceEndsAt: '2026-11-03T01:25:00.000Z',
            endsAt: '2026-11-03T01:30:00.000Z',
            bookable: false,
            ticket: slotTicket({
              id: 'past-at-boundary',
              number: 1,
              endsAt: '2026-11-03T01:30:00.000Z',
            }),
          },
        ],
        legacyTickets: [legacyTicket('legacy-waiting', 2, 'waiting')],
        unconfiguredTickets: [
          slotTicket({ id: 'unconfigured-active', number: 3 }),
        ],
        releasedTickets: [
          slotTicket({
            id: 'cancelled-no-show',
            number: 4,
            status: 'cancelled',
            slotReleasedAt: '2026-11-03T01:10:00.000Z',
          }),
          slotTicket({ id: 'served', number: 5, status: 'served' }),
        ],
      }),
      now,
    );

    expect({
      active: categories.active.map((ticket) => ticket.id),
      cancelled: categories.cancelled.map((ticket) => ticket.id),
      served: categories.served.map((ticket) => ticket.id),
      past: categories.past.map((ticket) => ticket.id),
    }).toEqual({
      active: ['unconfigured-active', 'legacy-waiting'],
      cancelled: ['cancelled-no-show'],
      served: ['served'],
      past: ['past-at-boundary'],
    });
    expect(
      categories.active.length +
        categories.cancelled.length +
        categories.served.length +
        categories.past.length,
    ).toBe(5);
  });

  it('sorts slot tickets by instant and equipment before legacy tickets', () => {
    const categories = categorizeAdminTickets(
      reservations({
        slots: [
          {
            startsAt: '2026-11-03T02:00:00.000Z',
            equipment: 'Quest 3',
            experienceEndsAt: '2026-11-03T02:25:00.000Z',
            endsAt: '2026-11-03T02:30:00.000Z',
            bookable: true,
            ticket: slotTicket({
              id: 'later',
              number: 1,
              startsAt: '2026-11-03T02:00:00.000Z',
              endsAt: '2026-11-03T02:30:00.000Z',
            }),
          },
          {
            startsAt: '2026-11-03T01:00:00.000Z',
            equipment: 'Quest 3S',
            experienceEndsAt: '2026-11-03T01:25:00.000Z',
            endsAt: '2026-11-03T01:30:00.000Z',
            bookable: true,
            ticket: slotTicket({
              id: 'same-time-later-equipment',
              number: 2,
              equipment: 'Quest 3S',
            }),
          },
          {
            startsAt: '2026-11-03T01:00:00.000Z',
            equipment: 'Quest 3',
            experienceEndsAt: '2026-11-03T01:25:00.000Z',
            endsAt: '2026-11-03T01:30:00.000Z',
            bookable: true,
            ticket: slotTicket({
              id: 'same-time-first-equipment',
              number: 3,
            }),
          },
        ],
        legacyTickets: [legacyTicket('legacy-called', 4, 'called')],
      }),
      now - 1,
    );

    expect(categories.active.map((ticket) => ticket.id)).toEqual([
      'same-time-first-equipment',
      'same-time-later-equipment',
      'later',
      'legacy-called',
    ]);
  });

  it('keeps a current occupant over a released-history duplicate ticket ID', () => {
    const occupied = slotTicket({ id: 'same-id', number: 6 });
    const released = slotTicket({
      id: 'same-id',
      number: 6,
      status: 'cancelled',
      slotReleasedAt: '2026-11-03T01:10:00.000Z',
    });
    const categories = categorizeAdminTickets(
      reservations({
        slots: [
          {
            startsAt: '2026-11-03T01:00:00.000Z',
            equipment: 'Quest 3',
            experienceEndsAt: '2026-11-03T01:25:00.000Z',
            endsAt: '2026-11-03T01:30:00.000Z',
            bookable: false,
            ticket: occupied,
          },
        ],
        releasedTickets: [released],
      }),
      now,
    );

    expect(categories.active).toHaveLength(1);
    expect(categories.active[0]?.id).toBe('same-id');
    expect(categories.cancelled).toHaveLength(0);
  });
});
