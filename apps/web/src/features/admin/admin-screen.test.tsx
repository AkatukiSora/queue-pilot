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
  ADMIN_RESERVATIONS_POLL_INTERVAL,
  ADMIN_TOKEN_STORAGE_KEY,
} from './admin-api.ts';
import { AdminScreen, PrintJobControls } from './admin-screen.tsx';

const slotStart = '2026-11-03T01:00:00.000Z';
const laterSlotStart = '2026-11-03T01:30:00.000Z';

function slotTicket(
  id: string,
  number: number,
  startsAt = slotStart,
  equipment = 'Quest 3',
) {
  const start = Date.parse(startsAt);
  return {
    id,
    counterKey: '2026-11-03',
    number,
    cancelReason: null,
    issuedAt: '2026-11-03T00:50:00.000Z',
    updatedAt: '2026-11-03T00:50:00.000Z',
    latestChange: null,
    slotReleasedAt: null,
    status: 'waiting',
    reservation: {
      kind: 'slot',
      slotStartsAt: startsAt,
      equipment,
      experienceEndsAt: new Date(start + 25 * 60_000).toISOString(),
      endsAt: new Date(start + 30 * 60_000).toISOString(),
    },
  };
}

function legacyTicket() {
  return {
    id: 'legacy-id',
    counterKey: '2026-11-02',
    number: 7,
    cancelReason: null,
    issuedAt: '2026-11-02T02:00:00.000Z',
    updatedAt: '2026-11-02T02:00:00.000Z',
    latestChange: null,
    slotReleasedAt: null,
    status: 'waiting',
    reservation: { kind: 'legacy' },
  };
}

function reservationResponse(overrides: Record<string, unknown> = {}) {
  const equipment = ['Quest 3', 'Quest 3S', 'Steam Frame', 'Beyond2'];
  return {
    slots: equipment
      .map((name, index) => ({
        startsAt: slotStart,
        equipment: name,
        experienceEndsAt: '2026-11-03T01:25:00.000Z',
        endsAt: '2026-11-03T01:30:00.000Z',
        bookable: true,
        ticket: index === 0 ? slotTicket('occupied-id', 12) : null,
      }))
      .concat([
        {
          startsAt: laterSlotStart,
          equipment: 'Quest 3',
          experienceEndsAt: '2026-11-03T01:55:00.000Z',
          endsAt: '2026-11-03T02:00:00.000Z',
          bookable: true,
          ticket: null,
        },
      ]),
    legacyTickets: [],
    unconfiguredTickets: [],
    releasedTickets: [],
    printNeedsAttention: [],
    ...overrides,
  };
}

function movedReservationResponse() {
  const response = reservationResponse();
  return {
    ...response,
    slots: response.slots.map((slot) => {
      if (slot.startsAt === slotStart && slot.equipment === 'Quest 3') {
        return { ...slot, ticket: null };
      }
      if (slot.startsAt === laterSlotStart && slot.equipment === 'Quest 3') {
        return {
          ...slot,
          ticket: slotTicket('occupied-id', 12, laterSlotStart, 'Quest 3'),
        };
      }
      return slot;
    }),
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
  it('returns to token entry on 401 and stores the replacement token in sessionStorage', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'expired-token');
    const requests: Request[] = [];
    let reservationCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        if (new URL(request.url).pathname === '/api/admin/reservations') {
          reservationCalls += 1;
          return reservationCalls === 1
            ? jsonResponse(401, {
                error: { code: 'unauthorized', message: 'Unauthorized.' },
              })
            : jsonResponse(200, reservationResponse());
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

    expect(await screen.findByRole('heading', { name: '予約枠' })).toBeTruthy();
    expect(window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe(
      'replacement-token',
    );
    expect(requests.at(-1)?.headers.get('Authorization')).toBe(
      'Bearer replacement-token',
    );
  });

  it.each(['network exception', 'HTTP 500'] as const)(
    'blocks new issue slots after an unresolved %s and retries the frozen request',
    async (failure) => {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
      const requests: Request[] = [];
      let issueCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = requestFrom(input, init);
          requests.push(request);
          const url = new URL(request.url);
          if (url.pathname === '/api/admin/reservations')
            return jsonResponse(200, reservationResponse());
          if (
            url.pathname === '/api/admin/tickets' &&
            request.method === 'POST'
          ) {
            issueCalls += 1;
            if (issueCalls === 1) {
              if (failure === 'network exception') {
                throw new TypeError('network unavailable');
              }
              return jsonResponse(500, {
                error: { code: 'server_error', message: 'Server error.' },
              });
            }
            return jsonResponse(201, {
              ticket: slotTicket('new-id', 20, slotStart, 'Quest 3S'),
            });
          }
          return jsonResponse(500, {
            error: { code: 'unexpected', message: 'Unexpected.' },
          });
        }),
      );

      renderAdmin();
      await screen.findByRole('heading', { name: '予約枠' });
      for (const equipment of [
        'Quest 3',
        'Quest 3S',
        'Steam Frame',
        'Beyond2',
      ]) {
        expect(screen.getAllByText(equipment).length).toBeGreaterThan(0);
      }
      expect(ADMIN_RESERVATIONS_POLL_INTERVAL).toBe(3_000);

      const [firstAvailableSlot] = screen.getAllByRole('button', {
        name: '空き・発券',
      });
      if (firstAvailableSlot === undefined) {
        throw new Error('No available slot button rendered.');
      }
      fireEvent.click(firstAvailableSlot);
      await screen.findByRole('button', {
        name: '同じ枠・同じ内容で再試行',
      });
      const availableButtons = screen.getAllByRole('button', {
        name: '空き・発券',
      });
      expect(availableButtons.length).toBeGreaterThan(1);
      expect(
        availableButtons.every(
          (button) => (button as HTMLButtonElement).disabled,
        ),
      ).toBe(true);
      const differentSlotButton = availableButtons.at(-1);
      if (differentSlotButton === undefined) {
        throw new Error('No different available slot button rendered.');
      }
      fireEvent.click(differentSlotButton);
      expect(issueCalls).toBe(1);

      cleanup();
      renderAdmin();
      await screen.findByRole('heading', { name: '予約枠' });
      const restoredRetryButton = await screen.findByRole('button', {
        name: '同じ枠・同じ内容で再試行',
      });
      expect(
        screen
          .getAllByRole('button', { name: '空き・発券' })
          .every((button) => (button as HTMLButtonElement).disabled),
      ).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: '案内済みにする',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: '日時・機材を変更',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.click(restoredRetryButton);
      expect(await screen.findByText('20番を発券しました。')).toBeTruthy();
      expect(screen.getByText('2026-11-03 10:00・Quest 3S')).toBeTruthy();

      const issueRequests = requests.filter(
        (request) =>
          new URL(request.url).pathname === '/api/admin/tickets' &&
          request.method === 'POST',
      );
      expect(issueRequests).toHaveLength(2);
      expect(issueRequests[0]?.headers.get('idempotency-key')).toBeTruthy();
      expect(issueRequests[1]?.headers.get('idempotency-key')).toBe(
        issueRequests[0]?.headers.get('idempotency-key'),
      );
      expect(await issueRequests[0]?.clone().json()).toEqual({
        slotStartsAt: slotStart,
        equipment: 'Quest 3S',
      });
      expect(await issueRequests[1]?.clone().json()).toEqual(
        await issueRequests[0]?.clone().json(),
      );
      expect(
        issueRequests.every(
          (request) =>
            request.headers.get('Authorization') === 'Bearer admin-secret',
        ),
      ).toBe(true);
    },
  );

  it('disables all competing ticket actions while a ticket request is in flight', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    let resolveIssue: (response: Response) => void = () => {
      throw new Error('Issue request did not start.');
    };
    let issueCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          return jsonResponse(200, reservationResponse());
        }
        if (
          url.pathname === '/api/admin/tickets' &&
          request.method === 'POST'
        ) {
          issueCalls += 1;
          return new Promise<Response>((resolve) => {
            resolveIssue = resolve;
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    const availableButtons = screen.getAllByRole('button', {
      name: '空き・発券',
    });
    const firstSlot = availableButtons[0];
    const secondSlot = availableButtons[1];
    if (firstSlot === undefined || secondSlot === undefined) {
      throw new Error('Expected multiple available slot buttons.');
    }
    fireEvent.click(firstSlot);
    await waitFor(() => expect(issueCalls).toBe(1));
    expect(
      screen
        .getAllByRole('button', { name: '空き・発券' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: '案内済みにする',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: '日時・機材を変更',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(secondSlot);
    expect(issueCalls).toBe(1);

    resolveIssue(
      jsonResponse(201, {
        ticket: slotTicket('new-id', 20, slotStart, 'Quest 3S'),
      }),
    );
    expect(await screen.findByText('20番を発券しました。')).toBeTruthy();
  });

  it('blocks issue and move submission while a ticket action is in flight', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    let resolveAction: (response: Response) => void = () => {
      throw new Error('Ticket action did not start.');
    };
    let actionCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          return jsonResponse(200, reservationResponse());
        }
        if (url.pathname === '/api/admin/tickets/occupied-id/serve') {
          actionCalls += 1;
          return new Promise<Response>((resolve) => {
            resolveAction = resolve;
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    const destination = screen.getByLabelText('移動先の枠');
    const option = within(destination).getByRole('option', {
      name: '2026-11-03 10:30・Quest 3',
    });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });

    fireEvent.click(screen.getByRole('button', { name: '案内済みにする' }));
    await waitFor(() => expect(actionCalls).toBe(1));
    expect(
      screen
        .getAllByRole('button', { name: '空き・発券' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: '変更を確定する',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: '日時・機材を変更',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    resolveAction(
      jsonResponse(200, {
        ticket: slotTicket('occupied-id', 12),
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: '案内済みにする',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });

  it('does not retry an occupied slot with the old key after a confirmed 409', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const requests: Request[] = [];
    let issueCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations')
          return jsonResponse(200, reservationResponse());
        if (
          url.pathname === '/api/admin/tickets' &&
          request.method === 'POST'
        ) {
          issueCalls += 1;
          return jsonResponse(409, {
            error: { code: 'slot_unavailable', message: 'Slot unavailable.' },
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    const [firstAvailableSlot] = screen.getAllByRole('button', {
      name: '空き・発券',
    });
    if (firstAvailableSlot === undefined) {
      throw new Error('No available slot button rendered.');
    }
    fireEvent.click(firstAvailableSlot);

    expect(await screen.findByText(/選択した枠は埋まった/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: '同じ枠・同じ内容で再試行' }),
    ).toBeNull();
    expect(issueCalls).toBe(1);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: '空き・発券' })
          .every((button) => !(button as HTMLButtonElement).disabled),
      ).toBe(true),
    );

    const firstIssueRequest = requests.find(
      (request) =>
        new URL(request.url).pathname === '/api/admin/tickets' &&
        request.method === 'POST',
    );
    expect(firstIssueRequest).toBeDefined();
    const firstKey = firstIssueRequest?.headers.get('idempotency-key');
    const firstBody = await firstIssueRequest?.clone().json();
    const availableButtons = screen.getAllByRole('button', {
      name: '空き・発券',
    });
    const differentSlotButton = availableButtons.at(-1);
    if (differentSlotButton === undefined) {
      throw new Error('No different available slot button rendered.');
    }
    fireEvent.click(differentSlotButton);
    await waitFor(() => expect(issueCalls).toBe(2));

    const issueRequests = requests.filter(
      (request) =>
        new URL(request.url).pathname === '/api/admin/tickets' &&
        request.method === 'POST',
    );
    expect(issueRequests).toHaveLength(2);
    expect(issueRequests[1]?.headers.get('idempotency-key')).not.toBe(firstKey);
    expect(await issueRequests[1]?.clone().json()).not.toEqual(firstBody);
  });

  it('requires agreement for legacy assignment, moves the ticket to the slot section, and preserves the reprint warning', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const requests: Request[] = [];
    let assigned = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          const response = reservationResponse({
            legacyTickets: assigned ? [] : [legacyTicket()],
          });
          return jsonResponse(
            200,
            assigned
              ? {
                  ...response,
                  slots: response.slots.map((slot) =>
                    slot.startsAt === slotStart && slot.equipment === 'Quest 3S'
                      ? {
                          ...slot,
                          ticket: slotTicket(
                            'legacy-id',
                            7,
                            slotStart,
                            'Quest 3S',
                          ),
                        }
                      : slot,
                  ),
                }
              : response,
          );
        }
        if (url.pathname === '/api/admin/tickets/legacy-id/reschedule') {
          assigned = true;
          return jsonResponse(200, {
            ticket: slotTicket('legacy-id', 7, slotStart, 'Quest 3S'),
            reprintRequired: true,
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: /時間未割当の旧整理券/ });
    const legacySection = screen.getByRole('region', {
      name: '時間未割当の旧整理券',
    });
    fireEvent.click(
      screen.getByRole('button', { name: '旧券に枠を割り当てる' }),
    );
    expect(
      (
        screen.getByRole('button', {
          name: '変更を確定する',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    const legacyDestination = screen.getByLabelText('移動先の枠');
    const legacyOption = within(legacyDestination).getByRole('option', {
      name: '2026-11-03 10:00・Quest 3S',
    });
    fireEvent.change(legacyDestination, {
      target: { value: (legacyOption as HTMLOptionElement).value },
    });
    expect(screen.getByRole('alert').textContent).toContain('旧用紙は無効');
    fireEvent.change(
      screen.getByLabelText('来場者へのコメント（任意・200文字以内）'),
      {
        target: { value: '時間枠を変更しました' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));

    expect(
      await screen.findByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        within(legacySection).getByText('対象の整理券はありません。'),
      ).toBeTruthy(),
    );
    const slotSection = screen.getByRole('region', {
      name: '予約済み・過去の予約',
    });
    expect(within(slotSection).getByText('7番')).toBeTruthy();
    expect(
      within(slotSection).getByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();
    expect(
      within(slotSection).getByRole('button', { name: '現在の予約で再印刷' }),
    ).toBeTruthy();
    const moveRequest = requests.find(
      (request) =>
        new URL(request.url).pathname ===
        '/api/admin/tickets/legacy-id/reschedule',
    );
    expect(moveRequest?.headers.get('Authorization')).toBe(
      'Bearer admin-secret',
    );
    expect(await moveRequest?.clone().json()).toEqual({
      slotStartsAt: slotStart,
      equipment: 'Quest 3S',
      comment: '時間枠を変更しました',
    });
  });

  it('retries a committed-but-unanswered move with its frozen ticket, source, destination, and comment', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    const requests: Request[] = [];
    let moveCommitted = false;
    let moveCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          return jsonResponse(
            200,
            moveCommitted ? movedReservationResponse() : reservationResponse(),
          );
        }
        if (url.pathname === '/api/admin/tickets/occupied-id/reschedule') {
          moveCalls += 1;
          if (moveCalls === 1) {
            moveCommitted = true;
            throw new TypeError('response lost after commit');
          }
          return jsonResponse(200, {
            ticket: slotTicket('occupied-id', 12, laterSlotStart, 'Quest 3'),
            reprintRequired: false,
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    const destination = screen.getByLabelText('移動先の枠');
    const option = within(destination).getByRole('option', {
      name: '2026-11-03 10:30・Quest 3',
    });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });
    fireEvent.change(
      screen.getByLabelText('来場者へのコメント（任意・200文字以内）'),
      { target: { value: '移動結果を確認します' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));

    const pendingAlert = await screen.findByRole('alert');
    expect(pendingAlert.textContent).toContain(
      '2026-11-03 10:00〜10:25・Quest 3',
    );
    expect(pendingAlert.textContent).toContain('2026-11-03 10:30・Quest 3');
    expect(pendingAlert.textContent).toContain('移動結果を確認します');
    expect(
      await screen.findByText('2026-11-03 10:30〜10:55・Quest 3'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.getByRole('alert').textContent).toContain(
      '移動結果を確認できていません',
    );
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    expect(screen.getByText('移動結果の確認が必要です')).toBeTruthy();
    expect(screen.queryByLabelText('移動先の枠')).toBeNull();

    cleanup();
    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    const restoredAlert = await screen.findByRole('alert');
    expect(restoredAlert.textContent).toContain('2026-11-03 10:30・Quest 3');
    expect(restoredAlert.textContent).toContain('移動結果を確認します');
    expect(screen.getByText('移動結果の確認が必要です')).toBeTruthy();
    const moveForm = screen
      .getByText('移動結果の確認が必要です')
      .closest('div');
    if (moveForm === null) throw new Error('Pending move form not found.');
    fireEvent.click(
      within(moveForm).getByRole('button', {
        name: '同じ移動内容で再試行',
      }),
    );

    await waitFor(() => expect(moveCalls).toBe(2));
    expect(
      await screen.findByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();
    const moveRequests = requests.filter(
      (request) =>
        new URL(request.url).pathname ===
          '/api/admin/tickets/occupied-id/reschedule' &&
        request.method === 'POST',
    );
    expect(moveRequests).toHaveLength(2);
    expect(await moveRequests[0]?.clone().json()).toEqual({
      slotStartsAt: laterSlotStart,
      equipment: 'Quest 3',
      comment: '移動結果を確認します',
    });
    expect(await moveRequests[1]?.clone().json()).toEqual(
      await moveRequests[0]?.clone().json(),
    );
  });

  it('discards malformed restored move data before formatting it', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    window.sessionStorage.setItem(
      'bunkasai-ticket.admin-pending-move',
      JSON.stringify({
        ticketId: 'occupied-id',
        from: {
          kind: 'slot',
          slotStartsAt: 'not-a-date',
          equipment: 'Quest 3',
          experienceEndsAt: 'not-a-date',
          endsAt: 'not-a-date',
        },
        slotStartsAt: laterSlotStart,
        equipment: 'Quest 3',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        if (new URL(request.url).pathname === '/api/admin/reservations') {
          return jsonResponse(200, reservationResponse());
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    expect(screen.queryByText(/移動結果を確認できていません/)).toBeNull();
    expect(
      window.sessionStorage.getItem('bunkasai-ticket.admin-pending-move'),
    ).toBeNull();
  });

  it('keeps the move request fixed and disables conflicting actions while it is in flight', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    let resolveMove: (response: Response) => void = () => {
      throw new Error('Move request did not start.');
    };
    let moveCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          return jsonResponse(200, reservationResponse());
        }
        if (url.pathname === '/api/admin/tickets/occupied-id/reschedule') {
          moveCalls += 1;
          return new Promise<Response>((resolve) => {
            resolveMove = resolve;
          });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    const destination = screen.getByLabelText('移動先の枠');
    const option = within(destination).getByRole('option', {
      name: '2026-11-03 10:00・Quest 3S',
    });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });
    fireEvent.change(
      screen.getByLabelText('来場者へのコメント（任意・200文字以内）'),
      { target: { value: '送信中に固定するコメント' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));
    await waitFor(() => expect(moveCalls).toBe(1));

    expect(
      screen
        .getAllByRole('button', { name: '空き・発券' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: '案内済みにする',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '取消' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen
        .getAllByRole('button', { name: '移動中…' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);

    expect(screen.getByText('移動結果の確認が必要です')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      '送信中に固定するコメント',
    );
    expect(screen.queryByLabelText('移動先の枠')).toBeNull();
    expect(moveCalls).toBe(1);

    resolveMove(
      jsonResponse(200, {
        ticket: slotTicket('occupied-id', 12, slotStart, 'Quest 3S'),
        reprintRequired: true,
      }),
    );
    expect(
      await screen.findByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();
  });

  it.each([
    {
      change: '時刻のみ',
      optionLabel: '2026-11-03 10:30・Quest 3',
      targetStart: laterSlotStart,
      equipment: 'Quest 3',
      reprintRequired: false,
      needsReprint: true,
    },
    {
      change: '機材のみ',
      optionLabel: '2026-11-03 10:00・Quest 3S',
      targetStart: slotStart,
      equipment: 'Quest 3S',
      reprintRequired: false,
      needsReprint: false,
    },
  ])(
    '$change の変更だけに合わせて再印刷を案内する',
    async ({
      optionLabel,
      targetStart,
      equipment,
      reprintRequired,
      needsReprint,
    }) => {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
      const requests: Request[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = requestFrom(input, init);
          requests.push(request);
          const path = new URL(request.url).pathname;
          if (path === '/api/admin/reservations')
            return jsonResponse(200, reservationResponse());
          if (path === '/api/admin/tickets/occupied-id/reschedule') {
            return jsonResponse(200, {
              ticket: slotTicket('occupied-id', 12, targetStart, equipment),
              reprintRequired,
            });
          }
          return jsonResponse(500, {
            error: { code: 'unexpected', message: 'Unexpected.' },
          });
        }),
      );

      renderAdmin();
      await screen.findByRole('heading', { name: '予約枠' });
      fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
      const destination = screen.getByLabelText('移動先の枠');
      const option = within(destination).getByRole('option', {
        name: optionLabel,
      });
      fireEvent.change(destination, {
        target: { value: (option as HTMLOptionElement).value },
      });
      if (needsReprint) {
        expect(screen.getByRole('alert').textContent).toContain('旧用紙は無効');
      } else {
        expect(screen.queryByRole('alert')).toBeNull();
      }
      fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));

      if (needsReprint) {
        expect(
          await screen.findByText(
            /日時変更または旧券への枠割当のため、再印刷が必要/,
          ),
        ).toBeTruthy();
        expect(
          screen.getByRole('button', { name: '現在の予約で再印刷' }),
        ).toBeTruthy();
      } else {
        expect(
          await screen.findByText('機材のみを変更しました。再印刷は不要です。'),
        ).toBeTruthy();
        expect(
          screen.queryByRole('button', { name: '現在の予約で再印刷' }),
        ).toBeNull();
      }

      const moveRequest = requests.find(
        (request) =>
          new URL(request.url).pathname ===
          '/api/admin/tickets/occupied-id/reschedule',
      );
      expect(await moveRequest?.clone().json()).toEqual({
        slotStartsAt: targetStart,
        equipment,
      });
    },
  );

  it('keeps the time-change reprint warning through reload and failed reprint until success', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    let reprintCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/api/admin/reservations') {
          return jsonResponse(200, reservationResponse());
        }
        if (url.pathname === '/api/admin/tickets/occupied-id/reschedule') {
          return jsonResponse(200, {
            ticket: slotTicket('occupied-id', 12, laterSlotStart, 'Quest 3'),
            reprintRequired: true,
          });
        }
        if (url.pathname === '/api/admin/tickets/occupied-id/reprint') {
          reprintCalls += 1;
          if (reprintCalls === 1) {
            return jsonResponse(500, {
              error: { code: 'server_error', message: 'Printer unavailable.' },
            });
          }
          return jsonResponse(201, { job: { id: 'reprint-job' } });
        }
        return jsonResponse(500, {
          error: { code: 'unexpected', message: 'Unexpected.' },
        });
      }),
    );

    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    const destination = screen.getByLabelText('移動先の枠');
    const option = within(destination).getByRole('option', {
      name: '2026-11-03 10:30・Quest 3',
    });
    fireEvent.change(destination, {
      target: { value: (option as HTMLOptionElement).value },
    });
    expect(screen.getByRole('alert').textContent).toContain('旧用紙は無効');
    fireEvent.click(screen.getByRole('button', { name: '変更を確定する' }));
    expect(
      await screen.findByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();
    expect(reprintCalls).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '日時・機材を変更' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(
      screen.getByText(/日時変更または旧券への枠割当のため、再印刷が必要/),
    ).toBeTruthy();

    cleanup();
    renderAdmin();
    expect(
      await screen.findByText(
        /日時変更または旧券への枠割当のため、再印刷が必要/,
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '現在の予約で再印刷' }));
    expect(await screen.findByText(/操作に失敗しました/)).toBeTruthy();
    expect(
      screen.getByText(/日時変更または旧券への枠割当のため、再印刷が必要/),
    ).toBeTruthy();
    expect(reprintCalls).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '現在の予約で再印刷' }));
    await waitFor(() =>
      expect(
        screen.queryByText(/日時変更または旧券への枠割当のため、再印刷が必要/),
      ).toBeNull(),
    );
    expect(reprintCalls).toBe(2);

    cleanup();
    renderAdmin();
    await screen.findByRole('heading', { name: '予約枠' });
    expect(
      screen.queryByText(/日時変更または旧券への枠割当のため、再印刷が必要/),
    ).toBeNull();
  });

  it('keeps all print history and only allows reprinting the latest eligible job', async () => {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'admin-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const path = new URL(request.url).pathname;
        if (path === '/api/admin/reservations')
          return jsonResponse(200, reservationResponse());
        if (path === '/api/admin/tickets/occupied-id') {
          return jsonResponse(200, {
            ticket: slotTicket('occupied-id', 12),
            printJobs: [
              {
                id: 'old-printed-job',
                ticketId: 'occupied-id',
                status: 'printed',
                createdAt: '2026-11-03T00:50:00.000Z',
                updatedAt: '2026-11-03T00:50:00.000Z',
                attempt: 1,
                reprintOf: null,
                detail: null,
              },
              {
                id: 'latest-failed-job',
                ticketId: 'occupied-id',
                status: 'failed',
                createdAt: '2026-11-03T00:51:00.000Z',
                updatedAt: '2026-11-03T00:51:00.000Z',
                attempt: 0,
                reprintOf: 'old-printed-job',
                detail: 'printer unavailable',
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
    const number = await screen.findByText('12番');
    const ticketCard = number.closest('[id="ticket-occupied-id"]');
    expect(ticketCard).not.toBeNull();
    fireEvent.click(
      within(ticketCard as HTMLElement).getByRole('button', {
        name: '印刷履歴・再印刷',
      }),
    );
    expect(await screen.findByText('printer unavailable')).toBeTruthy();
    expect(
      within(ticketCard as HTMLElement).getByText('印刷済み'),
    ).toBeTruthy();
    expect(
      within(ticketCard as HTMLElement).getByText('印刷失敗'),
    ).toBeTruthy();
    expect(
      within(ticketCard as HTMLElement).getByRole('button', { name: '再印刷' }),
    ).toBeTruthy();
  });
});

describe('PrintJobControls', () => {
  it.each(['printed', 'failed', 'unknown'] as const)(
    'offers reprint for a latest %s job',
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

  it('does not allow reprinting a historical job or a queued/printing job', () => {
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

    for (const status of ['queued', 'printing'] as const) {
      render(
        <PrintJobControls
          job={{ status }}
          onReprint={vi.fn()}
          disabled={false}
        />,
      );
      expect(screen.queryByRole('button', { name: '再印刷' })).toBeNull();
      cleanup();
    }
  });
});
