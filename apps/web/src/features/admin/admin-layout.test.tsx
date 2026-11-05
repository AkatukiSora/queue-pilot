import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminScreen } from './admin-screen.tsx';

const scope = { tenantSlug: 'acme', eventSlug: 'fest' };
const reservationsPath = '/api/v3/t/acme/e/fest/reservations';

type TestSlot = {
  startsAt: string;
  equipment: string;
  experienceEndsAt: string;
  endsAt: string;
  bookable: boolean;
  ticket: ReturnType<typeof slotTicket> | null;
};

function minutes(startsAt: string, offset: number) {
  return new Date(Date.parse(startsAt) + offset * 60_000).toISOString();
}

function slotTicket(
  id: string,
  number: number,
  startsAt: string,
  equipment: string,
  length = 30,
) {
  return {
    id,
    counterKey: '2026-11-03',
    number,
    cancelReason: null,
    issuedAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
    latestChange: null,
    slotReleasedAt: null,
    status: 'waiting',
    reservation: {
      kind: 'slot',
      slotStartsAt: startsAt,
      equipment,
      experienceEndsAt: minutes(startsAt, length - 5),
      endsAt: minutes(startsAt, length),
    },
  };
}

function slot(
  startsAt: string,
  equipment: string,
  length = 30,
  ticket: TestSlot['ticket'] = null,
): TestSlot {
  return {
    startsAt,
    equipment,
    experienceEndsAt: minutes(startsAt, length - 5),
    endsAt: minutes(startsAt, length),
    bookable: true,
    ticket,
  };
}

function reservations(
  timeZone: string,
  slots: TestSlot[],
  overrides: Record<string, unknown> = {},
) {
  return {
    timeZone,
    slots,
    legacyTickets: [],
    unconfiguredTickets: [],
    releasedTickets: [],
    printNeedsAttention: [],
    ...overrides,
  };
}

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAdmin(
  handler: (request: Request) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === '/api/v3/csrf') return jsonResponse(200, { token: 'csrf' });
      return handler(request);
    }),
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <AdminScreen {...scope} />
    </QueryClientProvider>,
  );
}

function boardHeaders() {
  const [board] = screen.getAllByRole('table');
  if (board === undefined) throw new Error('Expected the reservation board.');
  return {
    columns: within(board)
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
    rows: within(board)
      .getAllByRole('rowheader')
      .map((header) => header.textContent),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T00:30:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminScreen event-driven layout', () => {
  it('renders a single equipment column', async () => {
    renderAdmin(() =>
      jsonResponse(
        200,
        reservations('Asia/Tokyo', [
          slot('2026-11-03T01:00:00.000Z', 'Station A'),
          slot('2026-11-03T01:30:00.000Z', 'Station A'),
        ]),
      ),
    );

    await screen.findByRole('heading', { name: '予約枠' });
    expect(boardHeaders().columns).toEqual(['開始時刻', 'Station A']);
    expect(boardHeaders().rows).toEqual(['10:00', '10:30']);
    expect(screen.queryByText('Quest 3')).toBeNull();
  });

  it('renders five equipment columns in the API order and marks missing cells', async () => {
    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
    renderAdmin(() =>
      jsonResponse(
        200,
        reservations('Asia/Tokyo', [
          ...names.map((name) => slot('2026-11-03T01:00:00.000Z', name)),
          // 2 つ目の時刻には Echo だけ枠が無い。
          ...names
            .slice(0, 4)
            .map((name) => slot('2026-11-03T01:30:00.000Z', name)),
        ]),
      ),
    );

    await screen.findByRole('heading', { name: '予約枠' });
    expect(boardHeaders().columns).toEqual(['開始時刻', ...names]);
    expect(screen.getAllByText('未設定')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '空き・発券' })).toHaveLength(
      9,
    );
  });

  it('derives dates, rows, and slot interval from a non-default time zone', async () => {
    renderAdmin(() =>
      jsonResponse(
        200,
        reservations('Asia/Kolkata', [
          // 15 分刻み。Asia/Kolkata (UTC+5:30) では 06:30 / 06:45。
          slot('2026-11-03T01:00:00.000Z', 'Pod', 15),
          slot('2026-11-03T01:15:00.000Z', 'Pod', 15),
          // UTC では 11/03 だが、現地では翌日 01:30。
          slot('2026-11-03T20:00:00.000Z', 'Pod', 15),
        ]),
      ),
    );

    await screen.findByRole('heading', { name: '予約枠' });
    const dates = within(
      screen.getByRole('navigation', { name: '日付' }),
    ).getAllByRole('button');
    expect(dates.map((button) => button.textContent)).toEqual([
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(boardHeaders().rows).toEqual(['06:30', '06:45']);

    fireEvent.click(dates[1] as HTMLElement);
    expect(boardHeaders().rows).toEqual(['01:30']);
  });

  it('shows the event time zone name on dated labels instead of JST', async () => {
    const start = '2026-11-03T01:00:00.000Z';
    renderAdmin(() =>
      jsonResponse(
        200,
        reservations('America/New_York', [slot(start, 'Pod', 30)], {
          unconfiguredTickets: [],
          releasedTickets: [
            {
              ...slotTicket('released-id', 9, start, 'Pod'),
              status: 'cancelled',
              cancelReason: 'staff',
              slotReleasedAt: '2026-11-03T00:10:00.000Z',
            },
          ],
        }),
      ),
    );

    await screen.findByRole('heading', { name: '予約枠' });
    // 2026-11-03T01:00Z は米東部標準時 (UTC-5) で前日 20:00。
    expect(boardHeaders().rows).toEqual(['20:00']);
    expect(screen.getByText('2026-11-02')).toBeTruthy();
    expect(screen.getByText(/2026-11-02 19:00 \(/)).toBeTruthy();
    expect(screen.queryByText(/JST/)).toBeNull();
  });
});

describe('AdminScreen different-slot conflict (issue #31)', () => {
  const start = '2026-11-03T01:00:00.000Z';
  const otherStart = '2026-11-03T01:30:00.000Z';

  it('shows the neutral fixed message when restoring to a different slot returns 409', async () => {
    const released = {
      ...slotTicket('released-id', 16, start, 'Pod A'),
      status: 'cancelled',
      cancelReason: 'staff',
      slotReleasedAt: '2026-11-03T00:20:00.000Z',
    };
    const restoreBodies: unknown[] = [];
    renderAdmin(async (request) => {
      const path = new URL(request.url).pathname;
      if (path === reservationsPath) {
        return jsonResponse(
          200,
          reservations(
            'Asia/Tokyo',
            [slot(start, 'Pod A'), slot(otherStart, 'Pod B')],
            { releasedTickets: [released] },
          ),
        );
      }
      if (path === '/api/v3/t/acme/e/fest/tickets/released-id/restore') {
        restoreBodies.push(await request.clone().json());
        return jsonResponse(409, {
          error: { code: 'slot_unavailable', message: 'Slot unavailable.' },
        });
      }
      return jsonResponse(500, {
        error: { code: 'unexpected', message: 'Unexpected.' },
      });
    });

    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByText(/キャンセル済み/));
    fireEvent.click(screen.getByRole('button', { name: '元の枠に復元' }));
    await screen.findByText(/元の枠を利用できません。最新の空き枠/);

    const destination = screen.getByLabelText('16番の復元先');
    const option = within(destination).getByRole('option', { name: /Pod B/ });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });
    fireEvent.click(screen.getByRole('button', { name: '別枠に復元' }));

    expect(await screen.findByText('選んだ枠は利用できません')).toBeTruthy();
    expect(restoreBodies).toHaveLength(2);
    expect(restoreBodies[1]).toEqual({
      slotStartsAt: otherStart,
      equipment: 'Pod B',
    });
    // 別枠の失敗に、元の枠の競合メッセージや枠の埋まり具合の推測を混ぜない。
    expect(screen.queryByText(/元の枠を利用できません/)).toBeNull();
    expect(screen.queryByText(/埋まった/)).toBeNull();
  });

  it('shows the same fixed message when moving a ticket to a different slot returns 409', async () => {
    renderAdmin(async (request) => {
      const path = new URL(request.url).pathname;
      if (path === reservationsPath) {
        return jsonResponse(
          200,
          reservations('Asia/Tokyo', [
            slot(
              start,
              'Pod A',
              30,
              slotTicket('active-id', 12, start, 'Pod A'),
            ),
            slot(otherStart, 'Pod B'),
          ]),
        );
      }
      if (path === '/api/v3/t/acme/e/fest/tickets/active-id/reschedule') {
        return jsonResponse(409, {
          error: { code: 'slot_unavailable', message: 'Slot unavailable.' },
        });
      }
      return jsonResponse(500, {
        error: { code: 'unexpected', message: 'Unexpected.' },
      });
    });

    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    const destination = screen.getByLabelText('移動先の枠');
    const option = within(destination).getByRole('option', { name: /Pod B/ });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });
    fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));

    expect(await screen.findByText('選んだ枠は利用できません')).toBeTruthy();
    expect(screen.queryByText(/埋まった/)).toBeNull();
  });
});
