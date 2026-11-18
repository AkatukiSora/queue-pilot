import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, vi } from 'vitest';
import { SessionProvider } from '../../session/session.tsx';

export type Call = { method: string; path: string; body: unknown };

export const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const apiError = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  json(
    status,
    { error: { code, message: `${code} (server)`, ...extra } },
    headers,
  );

export const PREFIX = '/api/auth/queue-pilot';

export const tokyoConfig = {
  title: '文化祭 2026',
  timeZone: 'Asia/Tokyo',
  startsAt: '2026-11-03T00:00:00.000Z',
  endsAt: '2026-11-03T09:00:00.000Z',
  numberScope: 'daily',
  equipment: [{ id: 'quest-3', label: 'Quest 3' }],
  schedule: [
    {
      date: '2026-11-03',
      firstStart: '10:00',
      lastStart: '14:00',
      intervalMinutes: 15,
      experienceMinutes: 10,
      turnoverMinutes: 5,
    },
  ],
  copy: {
    receiptTitle: '整理券',
    arrivalGuidance: '時間までにお越しください。',
  },
  defaultPrinterId: 'front-desk',
  printers: [{ id: 'front-desk', label: '受付' }],
};

export function eventResponse(
  overrides: Record<string, unknown> = {},
  constraints: Record<string, unknown> = {},
) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'fest',
    config: tokyoConfig,
    revision: 'a'.repeat(64),
    changeConstraints: {
      ticketCount: 0,
      structuralFrozen: false,
      frozenFields: [],
      activeTicketCount: 0,
      activeJobCount: 0,
      canDisable: true,
      printersInUse: [],
      ...constraints,
    },
    ...overrides,
  };
}

/**
 * fetch を差し替えて画面を描画する。handler が undefined を返した要求は 500。
 * 呼び出しは順に記録され、POST の本文は JSON として読める。
 */
export function mountScreen(
  ui: ReactNode,
  handler: (call: Call) => Response | undefined | Promise<Response | undefined>,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), window.location.origin), init);
      const url = new URL(request.url);
      const text = request.method === 'GET' ? '' : await request.text();
      const call: Call = {
        method: request.method,
        path: url.pathname + url.search,
        body: text === '' ? undefined : JSON.parse(text),
      };
      calls.push(call);
      if (url.pathname === '/api/auth/get-session') return json(401, {});
      return (await handler(call)) ?? json(500, { error: 'unhandled' });
    },
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{ui}</SessionProvider>
    </QueryClientProvider>,
  );
  return calls;
}

export const posts = (calls: Call[], suffix: string) =>
  calls.filter((call) => call.method === 'POST' && call.path.endsWith(suffix));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
