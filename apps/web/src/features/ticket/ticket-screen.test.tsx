import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_TICKET_POLL_INTERVAL } from './public-ticket.ts';
import { TicketScreen } from './ticket-screen.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTicketResponse(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <TicketScreen token="test-ticket-token" />
    </QueryClientProvider>,
  );
  return fetchMock;
}

const publicTicket = {
  timeZone: 'Asia/Tokyo',
  number: 24,
  status: 'waiting',
  slotReleasedAt: null,
  reservation: {
    kind: 'slot',
    slotStartsAt: '2026-11-03T02:00:00.000Z',
    equipment: 'Quest 3S',
    experienceEndsAt: '2026-11-03T02:25:00.000Z',
    endsAt: '2026-11-03T02:30:00.000Z',
  },
  latestChange: {
    from: {
      kind: 'slot',
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Quest 3',
      experienceEndsAt: '2026-11-03T01:25:00.000Z',
      endsAt: '2026-11-03T01:30:00.000Z',
    },
    to: {
      kind: 'slot',
      slotStartsAt: '2026-11-03T02:00:00.000Z',
      equipment: 'Quest 3S',
      experienceEndsAt: '2026-11-03T02:25:00.000Z',
      endsAt: '2026-11-03T02:30:00.000Z',
    },
    changedAt: '2026-11-03T01:15:00.000Z',
    comment: '<img src=x onerror=alert(1)>',
  },
};

describe('TicketScreen', () => {
  it('shows the current slot, latest change, safe text comment, and polls every five seconds', async () => {
    const fetchMock = renderTicketResponse(200, publicTicket);

    expect(await screen.findByText('あなたの番号')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('順番をお待ちください')).toBeTruthy();
    expect(screen.getByText('2026-11-03')).toBeTruthy();
    expect(screen.getByText('11:00〜11:25')).toBeTruthy();
    expect(screen.getByText('Quest 3S')).toBeTruthy();
    expect(screen.getByText('交代終了 11:30')).toBeTruthy();
    expect(screen.getByText('時間枠または機材が変更されました')).toBeTruthy();
    expect(screen.getByText('2026-11-03 10:00〜10:25・Quest 3')).toBeTruthy();
    expect(screen.getByText('2026-11-03 11:00〜11:25・Quest 3S')).toBeTruthy();
    expect(screen.getByText('2026-11-03 10:15 (JST)')).toBeTruthy();
    expect(
      screen.getByText(
        '紙ではなく、現在表示されている予約時刻をご確認ください。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('a')).toBeNull();
    expect(screen.queryByText('前の待機人数')).toBeNull();
    expect(screen.queryByText('最新の呼出番号')).toBeNull();
    expect(PUBLIC_TICKET_POLL_INTERVAL).toBe(5_000);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[0];
    expect(
      request instanceof Request ? request.url : String(request),
    ).toContain('/api/public/tickets/test-ticket-token');
    expect(
      request instanceof Request
        ? request.method
        : fetchMock.mock.calls[0]?.[1]?.method,
    ).toBe('GET');
  });

  it('keeps the current status copy and hides the change notice when unchanged', async () => {
    renderTicketResponse(200, {
      ...publicTicket,
      latestChange: null,
    });

    expect(await screen.findByText('順番をお待ちください')).toBeTruthy();
    expect(screen.queryByText('時間枠または機材が変更されました')).toBeNull();
  });

  it('shows an unassigned legacy ticket without inventing a slot', async () => {
    renderTicketResponse(200, {
      timeZone: 'Asia/Tokyo',
      number: 25,
      status: 'called',
      reservation: { kind: 'legacy' },
      slotReleasedAt: null,
      latestChange: null,
    });

    expect(
      await screen.findByText('あなたの番号をお呼びしています'),
    ).toBeTruthy();
    expect(screen.getByText('旧整理券・スタッフにご確認ください')).toBeTruthy();
    expect(screen.queryByText('予約日時')).toBeNull();
  });

  it('distinguishes a released slot from a current reservation on the public ticket', async () => {
    renderTicketResponse(200, {
      ...publicTicket,
      status: 'cancelled',
      slotReleasedAt: '2026-11-03T01:00:00.000Z',
      latestChange: null,
    });

    expect(await screen.findByText('枠解放済み')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'この枠は解放済みです。現在の予約はありません。',
    );
    expect(screen.getByText('解放前の予約')).toBeTruthy();
    expect(screen.queryByText('予約日時')).toBeNull();
    expect(screen.queryByText('順番をお待ちください')).toBeNull();
  });

  it('formats the public ticket in the event time zone instead of JST', async () => {
    renderTicketResponse(200, { ...publicTicket, timeZone: 'Asia/Kolkata' });

    expect(await screen.findByText('あなたの番号')).toBeTruthy();
    // 02:00Z は Asia/Kolkata (UTC+5:30) で 07:30。日付も時刻も JST 固定では出ない。
    expect(screen.getByText('07:30〜07:55')).toBeTruthy();
    expect(screen.getByText('交代終了 08:00')).toBeTruthy();
    expect(screen.getByText('2026-11-03 06:30〜06:55・Quest 3')).toBeTruthy();
    expect(screen.queryByText(/JST/)).toBeNull();
    expect(screen.queryByText('11:00〜11:25')).toBeNull();
  });

  it('moves the displayed date across midnight for a western time zone', async () => {
    renderTicketResponse(200, {
      ...publicTicket,
      timeZone: 'America/New_York',
    });

    expect(await screen.findByText('あなたの番号')).toBeTruthy();
    // 2026-11-03T02:00Z は米東部標準時で前日 21:00。
    expect(screen.getByText('2026-11-02')).toBeTruthy();
    expect(screen.getByText('21:00〜21:25')).toBeTruthy();
  });

  it('explains when the ticket token is unknown', async () => {
    renderTicketResponse(404, {
      error: { code: 'ticket_not_found', message: 'Ticket was not found.' },
    });

    expect(await screen.findByText('整理券が見つかりません')).toBeTruthy();
    expect(
      screen.getByText('QRコードまたはURLをご確認ください。'),
    ).toBeTruthy();
  });

  it('explains when the ticket has expired', async () => {
    renderTicketResponse(410, {
      error: { code: 'ticket_expired', message: 'This ticket has expired.' },
    });

    expect(
      await screen.findByText('整理券の有効期限が終了しました'),
    ).toBeTruthy();
  });

  it('shows terminal served and cancelled states', async () => {
    renderTicketResponse(200, {
      ...publicTicket,
      status: 'served',
      latestChange: null,
    });
    expect(await screen.findByText('ご案内は完了しました')).toBeTruthy();
    cleanup();

    renderTicketResponse(200, {
      ...publicTicket,
      status: 'cancelled',
      latestChange: null,
    });
    expect(
      await screen.findByText('この整理券はキャンセルされています'),
    ).toBeTruthy();
  });
});
