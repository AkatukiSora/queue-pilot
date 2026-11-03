import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_QUEUE_POLL_INTERVAL,
  ADMIN_TOKEN_STORAGE_KEY,
} from './admin-api.ts';
import { AdminScreen, PrintJobControls } from './admin-screen.tsx';

const adminTicket = (id: string, number: number, status: string) => ({
  id,
  counterKey: '2026-11-02',
  number,
  partySize: 2,
  status,
  cancelReason: null,
  issuedAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
});

function queueResponse() {
  return {
    waiting: [adminTicket('waiting-id', 12, 'waiting')],
    called: [adminTicket('called-id', 13, 'called')],
    statusCounts: { waiting: 1, called: 1, served: 0, cancelled: 0 },
    printNeedsAttention: [
      {
        ticket: adminTicket('failed-id', 14, 'waiting'),
        job: {
          id: 'failed-job',
          ticketId: 'failed-id',
          status: 'failed',
          createdAt: '2026-11-02T10:00:00.000Z',
          updatedAt: '2026-11-02T10:00:00.000Z',
          attempt: 1,
          reprintOf: null,
          detail: null,
        },
      },
    ],
    latestCalledNumber: 13,
  };
}

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAdmin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminScreen />
    </QueryClientProvider>,
  );
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request ? input : new Request(input, init);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminScreen', () => {
  it('returns to token entry on 401 and stores a newly entered token in sessionStorage', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'expired-token');
    const requests: Request[] = [];
    let queueCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        if (new URL(request.url).pathname === '/api/admin/queue') {
          queueCalls += 1;
          return queueCalls === 1
            ? jsonResponse(401, {
                error: { code: 'unauthorized', message: 'Unauthorized.' },
              })
            : jsonResponse(200, queueResponse());
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();

    const tokenInput = await screen.findByLabelText('管理者トークン');
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
    expect(requests[0]?.headers.get('Authorization')).toBe(
      'Bearer expired-token',
    );
    expect(requests[0]?.url).not.toContain('expired-token');

    fireEvent.change(tokenInput, { target: { value: 'replacement-token' } });
    fireEvent.click(screen.getByRole('button', { name: '管理画面を開く' }));

    expect(await screen.findByText('状態別件数')).toBeTruthy();
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe(
      'replacement-token',
    );
    expect(requests.at(-1)?.headers.get('Authorization')).toBe(
      'Bearer replacement-token',
    );
  });

  it('hides reprint for a printed job when a newer job is queued', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const queue = queueResponse();
    queue.printNeedsAttention = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const path = new URL(request.url).pathname;
        if (path === '/api/admin/queue') return jsonResponse(200, queue);
        if (path === '/api/admin/tickets/waiting-id') {
          return jsonResponse(200, {
            ticket: adminTicket('waiting-id', 12, 'waiting'),
            printJobs: [
              {
                id: 'old-printed-job',
                ticketId: 'waiting-id',
                status: 'printed',
                createdAt: '2026-11-02T10:00:00.000Z',
                updatedAt: '2026-11-02T10:00:00.000Z',
                attempt: 1,
                reprintOf: null,
                detail: null,
              },
              {
                id: 'latest-queued-job',
                ticketId: 'waiting-id',
                status: 'queued',
                createdAt: '2026-11-02T10:01:00.000Z',
                updatedAt: '2026-11-02T10:01:00.000Z',
                attempt: 0,
                reprintOf: 'old-printed-job',
                detail: null,
              },
            ],
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByText('12番');
    fireEvent.click(
      within(screen.getByRole('region', { name: '待機中' })).getByRole(
        'button',
        { name: '印刷状態・再印刷' },
      ),
    );
    expect(await screen.findByText('印刷待ち')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '再印刷' })).toBeNull();
  });

  it('reuses the issue key on retry and creates a new key for the next issue', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const requests: Request[] = [];
    let issueCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/queue')
          return jsonResponse(200, queueResponse());
        if (
          url.pathname === '/api/admin/tickets' &&
          request.method === 'POST'
        ) {
          issueCalls += 1;
          if (issueCalls === 1) throw new TypeError('network unavailable');
          return jsonResponse(201, {
            ticket: adminTicket(
              `issued-${issueCalls}`,
              20 + issueCalls,
              'waiting',
            ),
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByText('状態別件数');
    const issueButton = screen.getByRole('button', { name: '発券する' });
    fireEvent.click(issueButton);
    const retryButton = await screen.findByRole('button', {
      name: '同じ内容で再試行',
    });
    expect((issueButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(issueButton);
    expect(issueCalls).toBe(1);
    fireEvent.click(retryButton);
    await screen.findByText('22番を発券しました。');
    fireEvent.click(screen.getByRole('button', { name: '発券する' }));
    await screen.findByText('23番を発券しました。');

    const issueRequests = requests.filter(
      (request) =>
        new URL(request.url).pathname === '/api/admin/tickets' &&
        request.method === 'POST',
    );
    expect(issueRequests).toHaveLength(3);
    const keys = issueRequests.map((request) =>
      request.headers.get('idempotency-key'),
    );
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(
      issueRequests.map((request) => request.headers.get('Authorization')),
    ).toEqual([
      'Bearer admin-secret',
      'Bearer admin-secret',
      'Bearer admin-secret',
    ]);
    expect(await issueRequests[0]?.clone().json()).toEqual({ partySize: 1 });
    expect(await issueRequests[1]?.clone().json()).toEqual({ partySize: 1 });
  });

  it('calls the typed admin endpoints for queue actions and cancellation reason', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const requests: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === '/api/admin/queue')
          return jsonResponse(200, queueResponse());
        if (path.endsWith('/reprint')) {
          return jsonResponse(201, {
            job: {
              id: 'reprint-job',
              ticketId: 'failed-id',
              status: 'queued',
              createdAt: '2026-11-02T10:00:00.000Z',
              updatedAt: '2026-11-02T10:00:00.000Z',
              attempt: 0,
              reprintOf: 'failed-job',
              detail: null,
            },
          });
        }
        if (request.method === 'POST') {
          return jsonResponse(200, {
            ticket: adminTicket('action-result', 12, 'called'),
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByText('12番');
    fireEvent.click(screen.getByRole('button', { name: '呼出' }));
    await waitFor(() =>
      expect(
        requests.some((request) =>
          new URL(request.url).pathname.endsWith('/call'),
        ),
      ).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('12番のキャンセル理由'), {
      target: { value: 'no_show' },
    });
    fireEvent.click(
      within(screen.getByRole('region', { name: '待機中' })).getByRole(
        'button',
        {
          name: 'キャンセル',
        },
      ),
    );
    await waitFor(() =>
      expect(
        requests.some((request) =>
          new URL(request.url).pathname.endsWith('/cancel'),
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: '入店' }));
    await waitFor(() =>
      expect(
        requests.some((request) =>
          new URL(request.url).pathname.endsWith('/serve'),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: '呼出取消' }));
    await waitFor(() =>
      expect(
        requests.some((request) =>
          new URL(request.url).pathname.endsWith('/recall'),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: '再印刷' }));
    await waitFor(() =>
      expect(
        requests.some((request) =>
          new URL(request.url).pathname.endsWith('/reprint'),
        ),
      ).toBe(true),
    );

    const cancelRequest = requests.find((request) =>
      new URL(request.url).pathname.endsWith('/cancel'),
    );
    expect(await cancelRequest?.clone().json()).toEqual({ reason: 'no_show' });
    expect(
      requests
        .filter((request) => request.method === 'POST')
        .every(
          (request) =>
            request.headers.get('Authorization') === 'Bearer admin-secret',
        ),
    ).toBe(true);
  });
});

describe('PrintJobControls', () => {
  it('polls the queue every three seconds', () => {
    expect(ADMIN_QUEUE_POLL_INTERVAL).toBe(3_000);
  });

  it.each(['printed', 'failed', 'unknown'] as const)(
    'offers reprint for the latest %s job',
    (status) => {
      render(
        <PrintJobControls
          job={{ status }}
          onReprint={vi.fn()}
          disabled={false}
        />,
      );
      expect(screen.getByRole('button', { name: '再印刷' })).toBeTruthy();
      if (status === 'unknown') {
        expect(screen.getByRole('alert').textContent).toContain(
          '用紙を目視確認',
        );
      }
      cleanup();
    },
  );

  it('does not allow reprinting a historical printed job when a newer job exists', () => {
    render(
      <PrintJobControls
        job={{ status: 'printed' }}
        isLatest={false}
        onReprint={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '再印刷' })).toBeNull();
    cleanup();
  });

  it.each(['queued', 'printing'] as const)(
    'does not offer reprint for a %s job',
    (status) => {
      render(
        <PrintJobControls
          job={{ status }}
          onReprint={vi.fn()}
          disabled={false}
        />,
      );
      expect(screen.queryByRole('button', { name: '再印刷' })).toBeNull();
      cleanup();
    },
  );
});
