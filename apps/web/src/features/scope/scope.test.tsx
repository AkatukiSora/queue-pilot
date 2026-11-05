import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onSessionRejected } from '../../api/client.ts';
import type { MemberEvent } from './scope-api.ts';
import { ScopeGate } from './scope-gate.tsx';
import { EventPicker, ScopeSwitcher } from './scope-views.tsx';

const emptyReservations = {
  slots: [],
  legacyTickets: [],
  unconfiguredTickets: [],
  releasedTickets: [],
};

type Call = { path: string; signal: AbortSignal };
let calls: Call[] = [];

function stubFetch(handler: (call: Call) => Promise<Response>) {
  calls = [];
  vi.stubGlobal('fetch', (input: Request) => {
    const call = {
      path: new URL(input.url).pathname,
      signal: input.signal,
    };
    calls.push(call);
    return handler(call);
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function renderGate(
  queryClient: QueryClient,
  tenantSlug: string,
  eventSlug: string,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <ScopeGate tenantSlug={tenantSlug} eventSlug={eventSlug}>
        <p>
          screen:{tenantSlug}/{eventSlug}
        </p>
      </ScopeGate>
    </QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

const reservationsPath = (t: string, e: string) =>
  `/api/v3/t/${t}/e/${e}/reservations`;

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('scope isolation', () => {
  it('keeps query cache entries for different tenant/event scopes separate', async () => {
    stubFetch(async () => json(200, emptyReservations));
    const client = newClient();
    const view = render(renderGate(client, 'acme', 'fest'));
    await screen.findByText('screen:acme/fest');
    view.unmount();
    render(renderGate(client, 'other', 'fest'));
    await screen.findByText('screen:other/fest');

    expect(calls.map((call) => call.path)).toEqual([
      reservationsPath('acme', 'fest'),
      reservationsPath('other', 'fest'),
    ]);
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toEqual([['admin', 'other', 'fest', 'reservations']]);
  });

  it('aborts the previous scope request on switch and never applies its response', async () => {
    let resolveA: (response: Response) => void = () => {};
    stubFetch((call) => {
      if (call.path === reservationsPath('acme', 'fest')) {
        return new Promise<Response>((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(json(200, emptyReservations));
    });
    const client = newClient();
    const view = render(renderGate(client, 'acme', 'fest'));
    await waitFor(() => expect(calls).toHaveLength(1));
    const first = calls[0];
    expect(first?.signal.aborted).toBe(false);

    view.rerender(renderGate(client, 'acme', 'summer'));
    await waitFor(() => expect(first?.signal.aborted).toBe(true));
    await screen.findByText('screen:acme/summer');

    // 旧 scope の遅延応答が来ても新 scope に適用されない。
    resolveA(json(403, { error: { code: 'forbidden', message: 'no' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('screen:acme/summer')).toBeTruthy();
    expect(screen.queryByText('このイベントを開く権限がありません')).toBeNull();
    expect(
      client.getQueryCache().find({ queryKey: ['admin', 'acme', 'fest'] }),
    ).toBeUndefined();
    // 新 scope の通信だけが新 scope の URL に送られる。
    expect(calls.map((call) => call.path)).toEqual([
      reservationsPath('acme', 'fest'),
      reservationsPath('acme', 'summer'),
    ]);
  });

  it('aborts in-flight requests when leaving the screen', async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    const client = newClient();
    const view = render(renderGate(client, 'acme', 'fest'));
    await waitFor(() => expect(calls).toHaveLength(1));
    view.unmount();
    await waitFor(() => expect(calls[0]?.signal.aborted).toBe(true));
  });
});

describe('scope access errors', () => {
  it('shows the forbidden view on 403 and stops polling', async () => {
    stubFetch(async () =>
      json(403, { error: { code: 'forbidden', message: 'no' } }),
    );
    render(renderGate(newClient(), 'acme', 'fest'));
    expect(
      await screen.findByText('このイベントを開く権限がありません'),
    ).toBeTruthy();
    expect(screen.queryByText('screen:acme/fest')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('shows the not-found view on 404', async () => {
    stubFetch(async () =>
      json(404, { error: { code: 'not_found', message: 'missing' } }),
    );
    render(renderGate(newClient(), 'ghost', 'fest'));
    expect(await screen.findByText('イベントが見つかりません')).toBeTruthy();
    expect(screen.queryByText('screen:ghost/fest')).toBeNull();
  });

  it('notifies the session layer on 401 instead of showing a scope error', async () => {
    const rejected = vi.fn();
    const off = onSessionRejected(rejected);
    stubFetch(async () =>
      json(401, { error: { code: 'unauthorized', message: 'login' } }),
    );
    render(renderGate(newClient(), 'acme', 'fest'));
    await waitFor(() => expect(rejected).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('このイベントを開く権限がありません')).toBeNull();
    expect(screen.queryByText('イベントが見つかりません')).toBeNull();
    off();
  });
});

const events: MemberEvent[] = [
  {
    tenantId: '00000000-0000-4000-8000-000000000001',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    role: 'admin',
    eventId: '00000000-0000-4000-8000-000000000011',
    eventSlug: 'fest',
    eventTitle: '文化祭',
    timeZone: 'Asia/Tokyo',
  },
  {
    tenantId: '00000000-0000-4000-8000-000000000002',
    tenantSlug: 'beta',
    tenantName: 'Beta',
    role: 'staff',
    eventId: '00000000-0000-4000-8000-000000000021',
    eventSlug: 'expo',
    eventTitle: '展示会',
    timeZone: 'Asia/Tokyo',
  },
];

describe('event selection', () => {
  it('lists only the events returned for the user, linked to the admin route', () => {
    render(
      <EventPicker
        events={events}
        isPending={false}
        error={null}
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByRole('link', { name: /文化祭/ }).getAttribute('href'),
    ).toBe('/t/acme/e/fest/admin');
    expect(
      screen.getByRole('link', { name: /展示会/ }).getAttribute('href'),
    ).toBe('/t/beta/e/expo/admin');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('explains when no event is accessible', () => {
    render(
      <EventPicker
        events={[]}
        isPending={false}
        error={null}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(/アクセスできるイベントがありません/)).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('offers only permitted events in the switcher and reports the selection', () => {
    const onSelect = vi.fn();
    render(
      <ScopeSwitcher
        events={events}
        current={{ tenantSlug: 'acme', eventSlug: 'fest' }}
        onSelect={onSelect}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'beta/expo' } });
    expect(onSelect).toHaveBeenCalledWith(events[1]);
  });
});
