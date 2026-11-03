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
  number: 24,
  status: 'waiting',
  aheadInQueue: 6,
  latestCalledNumber: 19,
};

describe('TicketScreen', () => {
  it('shows the ticket number, queue position, latest call, and polls every five seconds', async () => {
    const fetchMock = renderTicketResponse(200, publicTicket);

    expect(await screen.findByText('あなたの番号')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('順番をお待ちください')).toBeTruthy();
    expect(screen.getByText('前の待機人数')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('最新の呼出番号')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
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

  it('shows the called state', async () => {
    renderTicketResponse(200, { ...publicTicket, status: 'called' });

    expect(
      await screen.findByText('あなたの番号をお呼びしています'),
    ).toBeTruthy();
  });

  it('shows the served and cancelled terminal states', async () => {
    renderTicketResponse(200, {
      ...publicTicket,
      status: 'served',
    });
    expect(await screen.findByText('ご案内は完了しました')).toBeTruthy();
    cleanup();

    renderTicketResponse(200, {
      ...publicTicket,
      status: 'cancelled',
    });
    expect(
      await screen.findByText('この整理券はキャンセルされています'),
    ).toBeTruthy();
  });
});
