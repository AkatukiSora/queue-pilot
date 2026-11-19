import { afterEach, expect, it, vi } from 'vitest';
import { createGitHubAccountResolver } from './github-account-resolver.ts';

const account = {
  id: 2002,
  login: 'octo',
  name: 'Octo Cat',
  type: 'User',
};

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify(status === 200 ? account : { message: 'fixture failure' }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    },
  );
}

async function lookup(
  method: 'login' | 'subject',
  fetchImplementation: typeof fetch,
) {
  const resolver = createGitHubAccountResolver(fetchImplementation);
  return method === 'login'
    ? resolver.findByLogin('octo', 'fixture-token')
    : resolver.findBySubject('2002', 'fixture-token');
}

afterEach(() => vi.useRealTimers());

for (const method of ['login', 'subject'] as const) {
  it.each([
    ['401 requires relinking', 401, {}, { kind: 'reauth_required' }],
    [
      '429 preserves retry-after',
      429,
      { 'retry-after': '45' },
      { kind: 'rate_limited', retryAfterSeconds: 45 },
    ],
    [
      '403 with retry-after is rate-limited',
      403,
      { 'retry-after': '30' },
      { kind: 'rate_limited', retryAfterSeconds: 30 },
    ],
    [
      '403 without rate-limit headers is unavailable',
      403,
      {},
      { kind: 'unavailable' },
    ],
    ['404 is not found', 404, {}, { kind: 'not_found' }],
    ['5xx is unavailable', 502, {}, { kind: 'unavailable' }],
  ] as const)(`${method}: %s`, async (_label, status, headers, expected) => {
    const fetchImplementation = vi.fn(async () => response(status, headers));
    expect(await lookup(method, fetchImplementation)).toEqual(expected);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it(`${method}: identifies 403 rate limits and derives reset delay`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T00:00:00.000Z'));
    const resetAt = Math.ceil(Date.now() / 1000) + 75;
    const fetchImplementation = vi.fn(async () =>
      response(403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetAt),
      }),
    );

    expect(await lookup(method, fetchImplementation)).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: Math.ceil(resetAt - Date.now() / 1000),
    });
  });

  it(`${method}: parses an HTTP-date retry-after`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T00:00:00.000Z'));
    const fetchImplementation = vi.fn(async () =>
      response(429, {
        'retry-after': new Date(Date.now() + 75_000).toUTCString(),
      }),
    );

    expect(await lookup(method, fetchImplementation)).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 75,
    });
  });

  it(`${method}: treats a rejected fetch as unavailable`, async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError('fixture network failure');
    });
    expect(await lookup(method, fetchImplementation)).toEqual({
      kind: 'unavailable',
    });
  });

  it(`${method}: uses the public lookup path for null and empty tokens`, async () => {
    const requests: Request[] = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      requests.push(
        input instanceof Request ? input : new Request(input, init),
      );
      return response(200);
    };
    const resolver = createGitHubAccountResolver(fetchImplementation);

    for (const token of [null, '']) {
      const result =
        method === 'login'
          ? await resolver.findByLogin('octo', token)
          : await resolver.findBySubject('2002', token);
      expect(result.kind).toBe('ok');
    }
    expect(requests).toHaveLength(2);
    expect(
      requests.every((request) => !request.headers.has('authorization')),
    ).toBe(true);
  });
}
