import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, resetCsrfToken } from '../api/client.ts';
import { RequireSession } from './require-session.tsx';
import { SessionProvider, useSession } from './session.tsx';

const START = Date.parse('2026-11-05T00:00:00.000Z');
const FIFTEEN_MINUTES = 15 * 60_000;
const SESSION_REFRESH_MS = 5 * 60_000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let clock = START;
let sessionBody: unknown;
let requests: Request[];

function sessionAt(expiresAt: number) {
  return {
    session: { expiresAt: new Date(expiresAt).toISOString() },
    user: {},
  };
}

function stubServer(
  extra: (request: Request) => Response | undefined = () => undefined,
) {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), window.location.origin), init);
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      const custom = extra(request);
      if (custom !== undefined) return custom;
      if (path === '/api/auth/get-session') return json(200, sessionBody);
      if (path === '/api/v3/csrf') return json(200, { token: 'csrf-1' });
      if (path === '/api/auth/sign-in/social') {
        return json(200, {
          url: 'https://github.example/authorize',
          redirect: true,
        });
      }
      if (path === '/api/auth/sign-out') return json(200, { success: true });
      return json(200, {});
    }),
  );
}

function renderGate(options: { navigate?: (url: string) => void } = {}) {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider now={() => clock} navigate={options.navigate}>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

function Probe() {
  const { state, login, logout } = useSession();
  const [logoutFailed, setLogoutFailed] = useState(false);
  return (
    <div>
      {logoutFailed && <p role="alert">logout failed</p>}
      <p data-testid="status">{state.status}</p>
      <p data-testid="expires-at">
        {state.status === 'authenticated' ? state.expiresAt : ''}
      </p>
      <button type="button" onClick={() => void login()}>
        login
      </button>
      <button
        type="button"
        onClick={() => logout().catch(() => setLogoutFailed(true))}
      >
        logout
      </button>
    </div>
  );
}

beforeEach(() => {
  clock = START;
  sessionBody = sessionAt(START + FIFTEEN_MINUTES);
  resetCsrfToken();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    shouldAdvanceTime: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SessionProvider', () => {
  it('becomes authenticated from the server session and never touches browser storage', async () => {
    stubServer();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(
      requests.map((request) => request.headers.get('Authorization')),
    ).toEqual([null]);
  });

  it('refreshes the session every five minutes and adopts the returned expiry', async () => {
    stubServer();
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    const refreshedExpiry = START + 20 * 60_000;
    sessionBody = sessionAt(refreshedExpiry);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
    });
    await waitFor(() =>
      expect(screen.getByTestId('expires-at').textContent).toBe(
        String(refreshedExpiry),
      ),
    );
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === '/api/auth/get-session',
      ),
    ).toHaveLength(2);
  });

  it('refreshes immediately when a background tab becomes visible', async () => {
    stubServer();
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    const refreshedExpiry = START + 30 * 60_000;
    sessionBody = sessionAt(refreshedExpiry);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === '/api/auth/get-session',
      ),
    ).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() =>
      expect(
        requests.filter(
          (request) =>
            new URL(request.url).pathname === '/api/auth/get-session',
        ),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.getByTestId('expires-at').textContent).toBe(
        String(refreshedExpiry),
      ),
    );
  });

  it('expires when a periodic session refresh receives 401', async () => {
    let sessionRequests = 0;
    stubServer((request) => {
      if (new URL(request.url).pathname !== '/api/auth/get-session') {
        return undefined;
      }
      sessionRequests += 1;
      return sessionRequests === 2 ? json(401, null) : undefined;
    });
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
    });
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('expired'),
    );
  });

  it('keeps the current session after a failed refresh so a later interval can retry', async () => {
    let sessionRequests = 0;
    stubServer((request) => {
      if (new URL(request.url).pathname !== '/api/auth/get-session') {
        return undefined;
      }
      sessionRequests += 1;
      return sessionRequests === 2 ? json(503, {}) : undefined;
    });
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
    });
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(sessionRequests).toBe(2);

    const retriedExpiry = START + 30 * 60_000;
    sessionBody = sessionAt(retriedExpiry);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
    });
    await waitFor(() =>
      expect(screen.getByTestId('expires-at').textContent).toBe(
        String(retriedExpiry),
      ),
    );
    expect(sessionRequests).toBe(3);
  });

  it('is unauthenticated when the server has no session', async () => {
    sessionBody = null;
    stubServer();
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated'),
    );
  });

  it('expires after the refresh confirms the 15-minute deadline and clears cached queries', async () => {
    stubServer();
    const { queryClient } = renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    queryClient.setQueryDefaults(['admin', 'x'], { gcTime: Infinity });
    queryClient.setQueryData(['admin', 'x'], 'cached');

    for (let interval = 1; interval <= 3; interval += 1) {
      clock = START + interval * SESSION_REFRESH_MS;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
      });

      if (interval < 3) {
        expect(screen.getByTestId('status').textContent).toBe('authenticated');
        expect(queryClient.getQueryData(['admin', 'x'])).toBe('cached');
      }
    }

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('expired');
      expect(queryClient.getQueryData(['admin', 'x'])).toBeUndefined();
    });
  });

  it('treats an already-expired server session as unauthenticated', async () => {
    sessionBody = sessionAt(START - 1);
    stubServer();
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated'),
    );
  });

  it('moves to expired when the API rejects the cookie with 401', async () => {
    stubServer((request) =>
      new URL(request.url).pathname.endsWith('/reservations')
        ? json(401, { error: { code: 'unauthorized', message: 'x' } })
        : undefined,
    );
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    await act(async () => {
      await apiClient.GET('/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations', {
        params: { path: { tenantSlug: 'a', eventSlug: 'b' } },
      });
    });
    expect(screen.getByTestId('status').textContent).toBe('expired');
  });

  it('starts login with the current path as the callback and navigates to the provider', async () => {
    stubServer();
    const navigate = vi.fn();
    window.history.replaceState(null, '', '/t/acme/e/fest/admin?x=1');
    sessionBody = null;
    renderGate({ navigate });
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://github.example/authorize'),
    );
    const signIn = requests.find(
      (request) => new URL(request.url).pathname === '/api/auth/sign-in/social',
    );
    expect(signIn?.method).toBe('POST');
    expect(await signIn?.json()).toEqual({
      provider: 'github',
      callbackURL: '/t/acme/e/fest/admin?x=1',
      errorCallbackURL: '/t/acme/e/fest/admin?x=1',
    });
  });

  it('logs out with POST, drops the CSRF token and cached data', async () => {
    stubServer();
    const { queryClient } = renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    queryClient.setQueryData(['admin', 'x'], 'cached');
    await act(async () => {
      await apiClient.POST(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/serve',
        {
          params: { path: { tenantSlug: 'a', eventSlug: 'b', id: 'c' } },
        },
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated'),
    );
    const signOut = requests.find(
      (request) => new URL(request.url).pathname === '/api/auth/sign-out',
    );
    expect(signOut?.method).toBe('POST');
    expect(queryClient.getQueryData(['admin', 'x'])).toBeUndefined();

    // 次のログイン後は CSRF token を取り直す。
    await act(async () => {
      await apiClient.POST(
        '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/serve',
        {
          params: { path: { tenantSlug: 'a', eventSlug: 'b', id: 'c' } },
        },
      );
    });
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === '/api/v3/csrf',
      ),
    ).toHaveLength(2);
  });

  it('stays authenticated and reports a failure when logout is rejected', async () => {
    stubServer((request) =>
      new URL(request.url).pathname === '/api/auth/sign-out'
        ? json(500, {})
        : undefined,
    );
    renderGate();
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
  });
});

describe('RequireSession', () => {
  function renderRequire() {
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <RequireSession>
          <p>protected content</p>
        </RequireSession>
      </QueryClientProvider>,
    );
  }

  it('shows the login prompt, not the content, without a session', async () => {
    sessionBody = null;
    stubServer();
    renderRequire();
    expect(
      await screen.findByRole('button', { name: 'GitHubでログイン' }),
    ).toBeTruthy();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('shows content while valid, then expires after session refresh confirms the deadline', async () => {
    stubServer();
    renderRequire();
    expect(await screen.findByText('protected content')).toBeTruthy();

    for (let interval = 1; interval <= 3; interval += 1) {
      clock = START + interval * SESSION_REFRESH_MS;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_REFRESH_MS);
      });
    }
    expect(screen.queryByText('protected content')).toBeNull();
    expect(
      await screen.findByText('ログインの有効期限が切れました'),
    ).toBeTruthy();
    expect(
      requests.filter(
        (request) => new URL(request.url).pathname === '/api/auth/get-session',
      ).length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByRole('button', { name: 'GitHubでログイン' }),
    ).toBeTruthy();
  });

  it('offers a retry when the session lookup fails', async () => {
    stubServer((request) =>
      new URL(request.url).pathname === '/api/auth/get-session'
        ? json(500, {})
        : undefined,
    );
    renderRequire();
    expect(await screen.findByRole('button', { name: '再試行' })).toBeTruthy();
    expect(screen.queryByText('protected content')).toBeNull();
  });
});
