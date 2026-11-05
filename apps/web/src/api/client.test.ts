import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, onSessionRejected, resetCsrfToken } from './client.ts';

const scope = { tenantSlug: 'acme', eventSlug: 'fest' };
const mutationPath = '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/serve';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(
  handler: (request: Request, calls: Request[]) => Response | Promise<Response>,
) {
  const calls: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      calls.push(request.clone());
      return handler(request, calls);
    }),
  );
  return calls;
}

function pathOf(request: Request) {
  return new URL(request.url).pathname;
}

function serve() {
  return apiClient.POST(mutationPath, {
    params: { path: { ...scope, id: 't1' } },
  });
}

beforeEach(() => {
  resetCsrfToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient cookie contract', () => {
  it('sends credentials same-origin and no CSRF header on GET', async () => {
    const calls = stubFetch(() => json(200, { slots: [] }));
    await apiClient.GET('/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations', {
      params: { path: scope },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.credentials).toBe('same-origin');
    expect(calls[0]?.headers.has('X-CSRF-Token')).toBe(false);
    expect(calls[0]?.headers.has('Authorization')).toBe(false);
  });

  it('fetches a CSRF token once and sends it on every cookie mutation', async () => {
    const calls = stubFetch((request) =>
      pathOf(request) === '/api/v3/csrf'
        ? json(200, { token: 'tok-1' })
        : json(200, {}),
    );
    await serve();
    await serve();
    expect(calls.map(pathOf)).toEqual([
      '/api/v3/csrf',
      '/api/v3/t/acme/e/fest/tickets/t1/serve',
      '/api/v3/t/acme/e/fest/tickets/t1/serve',
    ]);
    expect(calls[0]?.credentials).toBe('same-origin');
    expect(calls[1]?.headers.get('X-CSRF-Token')).toBe('tok-1');
    expect(calls[2]?.headers.get('X-CSRF-Token')).toBe('tok-1');
  });

  it('shares one in-flight CSRF request between concurrent mutations', async () => {
    const calls = stubFetch((request) =>
      pathOf(request) === '/api/v3/csrf'
        ? json(200, { token: 'tok-1' })
        : json(200, {}),
    );
    await Promise.all([serve(), serve()]);
    expect(
      calls.filter((request) => pathOf(request) === '/api/v3/csrf'),
    ).toHaveLength(1);
  });

  it('refreshes the CSRF token and retries once when the server rejects it', async () => {
    let tokens = 0;
    let serveCalls = 0;
    const calls = stubFetch((request) => {
      if (pathOf(request) === '/api/v3/csrf') {
        tokens += 1;
        return json(200, { token: `tok-${tokens}` });
      }
      serveCalls += 1;
      return serveCalls === 1
        ? json(403, { error: { code: 'csrf_failed', message: 'rejected' } })
        : json(200, {});
    });
    const result = await serve();
    expect(result.response.status).toBe(200);
    const serves = calls.filter((request) =>
      pathOf(request).endsWith('/serve'),
    );
    expect(
      serves.map((request) => request.headers.get('X-CSRF-Token')),
    ).toEqual(['tok-1', 'tok-2']);
  });

  it('does not retry an ordinary 403 and surfaces it to the caller', async () => {
    const calls = stubFetch((request) =>
      pathOf(request) === '/api/v3/csrf'
        ? json(200, { token: 'tok-1' })
        : json(403, { error: { code: 'forbidden', message: 'no' } }),
    );
    const result = await serve();
    expect(result.response.status).toBe(403);
    expect(
      calls.filter((request) => pathOf(request).endsWith('/serve')),
    ).toHaveLength(1);
  });

  it('keeps agent bearer routes and public reads out of the cookie contract', async () => {
    const calls = stubFetch(() =>
      json(404, { error: { code: 'not_found', message: 'x' } }),
    );
    await apiClient.GET('/api/public/tickets/{token}', {
      params: { path: { token: 'abc' } },
    });
    expect(calls.map(pathOf)).toEqual(['/api/public/tickets/abc']);
  });

  it('notifies listeners on a scoped 401 and when the CSRF lookup is unauthenticated', async () => {
    const rejected = vi.fn();
    const stop = onSessionRejected(rejected);
    stubFetch(() =>
      json(401, { error: { code: 'unauthorized', message: 'x' } }),
    );
    await apiClient.GET('/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations', {
      params: { path: scope },
    });
    expect(rejected).toHaveBeenCalledTimes(1);

    await expect(serve()).rejects.toMatchObject({ status: 401 });
    expect(rejected).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not treat a public route 404 as a session rejection', async () => {
    const rejected = vi.fn();
    const stop = onSessionRejected(rejected);
    stubFetch(() => json(404, { error: { code: 'not_found', message: 'x' } }));
    await apiClient.GET('/api/public/tickets/{token}', {
      params: { path: { token: 'abc' } },
    });
    expect(rejected).not.toHaveBeenCalled();
    stop();
  });
});
