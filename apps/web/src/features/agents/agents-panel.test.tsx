import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '../../api/client.ts';
import { AgentsPanel } from './agents-panel.tsx';

const scope = { tenantSlug: 'acme', eventSlug: 'fest' };
const agentsPath = '/api/v3/t/acme/e/fest/agents';
const agent = {
  id: '11111111-1111-4111-8111-111111111111',
  printerId: 'front-desk',
  expiresAt: '2026-12-01T00:00:00.000Z',
  revokedAt: null,
  lastSeenAt: null,
};

type Seen = { method: string; path: string; csrf: string | null };
let testQueryClient: QueryClient | undefined;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function member(role: 'admin' | 'staff') {
  return {
    events: [
      {
        tenantId: 't',
        tenantSlug: 'acme',
        tenantName: 'Acme',
        role,
        eventId: 'e',
        eventSlug: 'fest',
        eventTitle: 'Fest',
        timeZone: 'Asia/Tokyo',
      },
    ],
  };
}

function setup(
  role: 'admin' | 'staff',
  mutation: (path: string) => Response | Promise<Response>,
  printers?: { id: string; label: string }[],
) {
  resetCsrfToken();
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      seen.push({
        method: request.method,
        path: url.pathname,
        csrf: request.headers.get('X-CSRF-Token'),
      });
      if (url.pathname === '/api/v3/csrf') return json(200, { token: 'tok' });
      if (url.pathname === '/api/v3/events') return json(200, member(role));
      if (url.pathname === agentsPath && request.method === 'GET') {
        return json(200, { agents: [agent] });
      }
      return mutation(url.pathname);
    },
  );
  testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  render(
    <QueryClientProvider client={testQueryClient}>
      <AgentsPanel scope={scope} printers={printers} />
    </QueryClientProvider>,
  );
  return seen;
}

const posts = (seen: Seen[]) => seen.filter((call) => call.method === 'POST');

afterEach(() => {
  cleanup();
  testQueryClient?.clear();
  testQueryClient = undefined;
  vi.unstubAllGlobals();
});

describe('AgentsPanel', () => {
  it('shows reissue/revoke controls to an admin', async () => {
    setup('admin', () => json(500, {}));
    expect(await screen.findByRole('button', { name: '再発行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '失効' })).toBeTruthy();
  });

  it('shows each agent printerId and its copyable config template', async () => {
    setup('admin', () => json(500, {}));
    const row = await screen.findByTestId(`agent-${agent.id}`);
    expect(row.textContent).toContain(`printerId: ${agent.printerId}`);
    expect(
      screen.getByRole('button', { name: 'printerIdをコピー' }),
    ).toBeTruthy();
    expect(screen.getByText('設定テンプレート')).toBeTruthy();
  });

  it('shows a newly issued token with its printer template until closed', async () => {
    const token = 'new-agent-token';
    const seen = setup(
      'admin',
      () =>
        json(201, {
          id: '22222222-2222-4222-8222-222222222222',
          token,
          expiresAt: '2026-12-02T00:00:00.000Z',
        }),
      [{ id: 'back-office', label: '事務所' }],
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'トークンを発行' }),
    );

    const issuedPanel = await screen.findByTestId('issued-agent-token');
    expect(issuedPanel.textContent).toContain('printerId: back-office');
    fireEvent.click(within(issuedPanel).getByText('設定テンプレート'));
    expect(
      within(issuedPanel).getByRole('figure', {
        name: '環境変数ファイルの雛形',
      }).textContent,
    ).toContain(`AGENT_TOKEN=${token}`);
    expect(
      within(issuedPanel).getByRole('figure', { name: 'print-agent.json' })
        .textContent,
    ).not.toContain(token);
    expect(posts(seen)).toEqual([
      { method: 'POST', path: agentsPath, csrf: 'tok' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'トークンを閉じる' }));
    expect(screen.queryByText(token)).toBeNull();
    await waitFor(() => {
      const cachedData = testQueryClient
        ?.getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data);
      expect(JSON.stringify(cachedData)).not.toContain(token);
    });
  });

  it('hides the panel from staff and never queries agents', async () => {
    const seen = setup('staff', () => json(500, {}));
    await waitFor(() =>
      expect(seen.some((call) => call.path === '/api/v3/events')).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: '再発行' })).toBeNull();
    expect(screen.queryByText('エージェントトークン')).toBeNull();
    expect(seen.some((call) => call.path === agentsPath)).toBe(false);
  });

  it('rotates with the CSRF token and shows the new token once', async () => {
    const seen = setup('admin', () =>
      json(201, {
        id: agent.id,
        token: 'new-secret-token',
        expiresAt: '2026-12-02T00:00:00.000Z',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '再発行' }));
    fireEvent.click(screen.getByRole('button', { name: '再発行を実行' }));
    expect(await screen.findByText('new-secret-token')).toBeTruthy();
    const issuedPanel = screen.getByTestId('issued-agent-token');
    expect(issuedPanel.textContent).toContain(`printerId: ${agent.printerId}`);
    const templateSummary = screen.getAllByText('設定テンプレート')[0];
    if (templateSummary === undefined)
      throw new Error('Issued token template control was not rendered.');
    fireEvent.click(templateSummary);
    expect(
      within(issuedPanel).getByRole('figure', {
        name: '環境変数ファイルの雛形',
      }).textContent,
    ).toContain('AGENT_TOKEN=new-secret-token');
    expect(
      within(issuedPanel).getByRole('figure', { name: 'print-agent.json' })
        .textContent,
    ).not.toContain('new-secret-token');
    expect(posts(seen)).toEqual([
      {
        method: 'POST',
        path: `${agentsPath}/${agent.id}/rotate`,
        csrf: 'tok',
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'トークンを閉じる' }));
    expect(screen.queryByText('new-secret-token')).toBeNull();
    expect(screen.queryByTestId('issued-agent-token')).toBeNull();
    await waitFor(() => {
      const tokenIsCached = testQueryClient
        ?.getMutationCache()
        .getAll()
        .some((mutation) =>
          JSON.stringify(mutation.state.data).includes('new-secret-token'),
        );
      expect(tokenIsCached).toBe(false);
    });
  });

  it('shows the permission error and refreshes the role on server 403', async () => {
    const seen = setup('admin', () =>
      json(403, { error: { code: 'forbidden', message: 'No.' } }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '失効' }));
    fireEvent.click(screen.getByRole('button', { name: '失効を実行' }));
    expect(
      await screen.findByText('この操作を行う権限がありません。'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        seen.filter((call) => call.path === '/api/v3/events').length,
      ).toBeGreaterThan(1),
    );
    expect(posts(seen)).toHaveLength(1);
  });

  it.each([
    [401, 'ログインの有効期限が切れました。再ログインしてください。'],
    [404, '対象のエージェントまたはイベントが見つかりません。'],
  ])('maps server %i to a clear message', async (status, message) => {
    setup('admin', () => json(status, { error: { code: 'x', message: 'x' } }));
    fireEvent.click(await screen.findByRole('button', { name: '失効' }));
    fireEvent.click(screen.getByRole('button', { name: '失効を実行' }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('enters an explicit unknown state on network failure and never retries', async () => {
    const seen = setup('admin', () => {
      throw new TypeError('network down');
    });
    fireEvent.click(await screen.findByRole('button', { name: '再発行' }));
    fireEvent.click(screen.getByRole('button', { name: '再発行を実行' }));
    expect(await screen.findByText(/操作の結果が不明です/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(posts(seen)).toHaveLength(1);
    // 不明なエージェントの操作は、状態確認を押すまで再実行できない。
    expect(
      (screen.getByRole('button', { name: '再発行' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: '一覧を再読み込みして状態を確認' }),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '再発行' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(posts(seen)).toHaveLength(1);
  });

  it('treats a 2xx response with an unreadable body as unknown', async () => {
    const seen = setup(
      'admin',
      () => new Response('not json', { status: 200 }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '失効' }));
    fireEvent.click(screen.getByRole('button', { name: '失効を実行' }));
    expect(await screen.findByText(/操作の結果が不明です/)).toBeTruthy();
    expect(posts(seen)).toHaveLength(1);
  });
});
