import { afterEach, expect, it, vi } from 'vitest';

type Config = {
  databaseUrl: string;
  tenantConfigSource: 'manifest' | 'database';
  authMode: 'oidc/shared' | 'legacy-single';
  sharedAuth?: {
    baseURL: string;
    secret: string;
    clientIpTrustedProxies: readonly string[];
    provider: { kind: 'github'; clientId: string; clientSecret: string };
  };
  adminToken?: string;
  agentToken?: string;
  legacyEventSettings?: {
    eventEndAt: Date;
    numberScope: 'daily';
    slotSchedule: [];
  };
};

type ServerOptions = {
  fetch: (request: Request) => Response | Promise<Response>;
};
type SignalHandler = (signal: 'SIGINT' | 'SIGTERM') => void;

const sharedConfig: Config = {
  databaseUrl: 'postgres://fixture:fixture@127.0.0.1:5432/fixture',
  tenantConfigSource: 'manifest',
  authMode: 'oidc/shared',
  sharedAuth: {
    baseURL: 'https://queue-pilot.example.invalid',
    secret: 'fixture-auth-secret-'.padEnd(32, 'x'),
    clientIpTrustedProxies: [],
    provider: {
      kind: 'github',
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret',
    },
  },
};
const legacyConfig: Config = {
  databaseUrl: 'postgres://fixture:fixture@127.0.0.1:5432/fixture',
  tenantConfigSource: 'manifest',
  authMode: 'legacy-single',
  adminToken: 'fixture-admin-token'.padEnd(32, 'x'),
  agentToken: 'fixture-agent-token'.padEnd(32, 'x'),
  legacyEventSettings: {
    eventEndAt: new Date('2026-11-14T00:00:00.000Z'),
    numberScope: 'daily',
    slotSchedule: [],
  },
};
const mockedModules = [
  '@hono/node-server',
  './config.ts',
  './infrastructure/auth/agent-credential-repository.ts',
  './infrastructure/auth/authorization-repository.ts',
  './infrastructure/auth/better-auth-adapter.ts',
  './infrastructure/persistence/drizzle/client.ts',
  './infrastructure/persistence/drizzle/configuration-authority.ts',
  './infrastructure/persistence/drizzle/runtime-role-check.ts',
  './infrastructure/persistence/drizzle/tx.ts',
];
const registeredSignals: Array<{
  event: 'SIGINT' | 'SIGTERM';
  listener: SignalHandler;
}> = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function captureSignalListeners(
  original: Record<'SIGINT' | 'SIGTERM', Set<unknown>>,
) {
  for (const event of ['SIGINT', 'SIGTERM'] as const) {
    for (const listener of process.listeners(event)) {
      if (!original[event].has(listener)) {
        registeredSignals.push({
          event,
          listener: listener as unknown as SignalHandler,
        });
      }
    }
  }
}

function mockMain(config: Config, prune: () => Promise<void>) {
  const sequence: string[] = [];
  const databaseClosed = deferred();
  let serverOptions: ServerOptions | undefined;
  const database = {
    db: { execute: vi.fn(async () => ({ rows: [] })) },
    close: vi.fn(async () => {
      sequence.push('database.close');
      databaseClosed.resolve();
    }),
  };
  const testServer = {
    close: (callback: (error?: Error) => void) => {
      sequence.push('server.close');
      callback();
    },
  };
  const serve = vi.fn((options: ServerOptions) => {
    sequence.push('listen');
    serverOptions = options;
    return testServer;
  });
  const createBetterAuthAdapter = vi.fn(async () => ({
    handle: async () => new Response(null, { status: 200 }),
    pruneExpiredRateLimits: prune,
    rateLimitWindowMs: 60_000,
    resolveSession: async () => null,
    revokeMemberSessions: async () => {},
  }));
  const assertConfigurationAuthority = vi.fn(async () => {});

  vi.doMock('@hono/node-server', () => ({ serve }));
  vi.doMock('./config.ts', () => ({ loadConfig: () => config }));
  vi.doMock('./infrastructure/auth/agent-credential-repository.ts', () => ({
    createDrizzleAgentCredentialAdministration: () => ({}),
  }));
  vi.doMock('./infrastructure/auth/authorization-repository.ts', () => ({
    createDrizzleAuthorizationRepository: () => ({}),
  }));
  vi.doMock('./infrastructure/auth/better-auth-adapter.ts', () => ({
    createBetterAuthAdapter,
  }));
  vi.doMock('./infrastructure/persistence/drizzle/client.ts', () => ({
    createDrizzleDatabase: () => database,
  }));
  vi.doMock(
    './infrastructure/persistence/drizzle/configuration-authority.ts',
    () => ({
      assertConfigurationAuthority,
    }),
  );
  vi.doMock(
    './infrastructure/persistence/drizzle/runtime-role-check.ts',
    () => ({
      assertSharedRuntimeRole: async () => {},
    }),
  );
  vi.doMock('./infrastructure/persistence/drizzle/tx.ts', () => ({
    createUnitOfWork: () => ({}),
  }));

  return {
    assertConfigurationAuthority,
    createBetterAuthAdapter,
    database,
    databaseClosed,
    sequence,
    serve,
    serverOptions: () => serverOptions,
  };
}

afterEach(() => {
  for (const { event, listener } of registeredSignals.splice(0)) {
    process.removeListener(event, listener);
  }
  for (const path of mockedModules) vi.doUnmock(path);
  vi.resetModules();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('awaits initial cleanup before listen, recovers readiness, and drains cleanup on shutdown', async () => {
  vi.useFakeTimers();
  const initialSweep = deferred();
  const startupStarted = deferred();
  const shutdownSweep = deferred();
  const prune = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(() => {
      startupStarted.resolve();
      return initialSweep.promise;
    })
    .mockRejectedValueOnce(new Error('fixture database failure'))
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(() => shutdownSweep.promise);
  const mocks = mockMain(sharedConfig, prune);
  const originalListeners = {
    SIGINT: new Set<unknown>(process.listeners('SIGINT')),
    SIGTERM: new Set<unknown>(process.listeners('SIGTERM')),
  };

  const importing = import('./main.ts');
  await startupStarted.promise;
  expect(mocks.serve).not.toHaveBeenCalled();
  initialSweep.resolve();
  await importing;
  captureSignalListeners(originalListeners);
  const readyServer = mocks.serverOptions();
  if (readyServer === undefined)
    throw new Error('The API server was not started.');
  const ready = () =>
    readyServer.fetch(new Request('http://127.0.0.1:8787/api/readyz'));
  expect((await ready()).status).toBe(200);

  const housekeepingLog = vi
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(prune).toHaveBeenCalledTimes(2);
  expect((await ready()).status).toBe(503);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(prune).toHaveBeenCalledTimes(3);
  expect((await ready()).status).toBe(200);
  expect(housekeepingLog).toHaveBeenCalledWith({
    event: 'auth_rate_limit_housekeeping_failed',
  });

  await vi.advanceTimersByTimeAsync(60_000);
  expect(prune).toHaveBeenCalledTimes(4);
  const sigterm = registeredSignals.find(({ event }) => event === 'SIGTERM');
  if (sigterm === undefined)
    throw new Error('SIGTERM handler was not registered.');
  process.removeListener('SIGTERM', sigterm.listener);
  sigterm.listener('SIGTERM');
  expect(mocks.sequence).toContain('server.close');
  expect(mocks.database.close).not.toHaveBeenCalled();
  shutdownSweep.resolve();
  await mocks.databaseClosed.promise;
  expect(mocks.sequence.slice(-2)).toEqual(['server.close', 'database.close']);
});

it('does not start auth cleanup in legacy mode', async () => {
  vi.useFakeTimers();
  const prune = vi.fn(async () => {});
  const mocks = mockMain(legacyConfig, prune);
  const originalListeners = {
    SIGINT: new Set<unknown>(process.listeners('SIGINT')),
    SIGTERM: new Set<unknown>(process.listeners('SIGTERM')),
  };

  await import('./main.ts');
  captureSignalListeners(originalListeners);
  expect(mocks.createBetterAuthAdapter).not.toHaveBeenCalled();
  expect(prune).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  const readyServer = mocks.serverOptions();
  if (readyServer === undefined)
    throw new Error('The API server was not started.');
  expect(
    (await readyServer.fetch(new Request('http://127.0.0.1:8787/api/readyz')))
      .status,
  ).toBe(200);

  const sigterm = registeredSignals.find(({ event }) => event === 'SIGTERM');
  if (sigterm === undefined)
    throw new Error('SIGTERM handler was not registered.');
  process.removeListener('SIGTERM', sigterm.listener);
  sigterm.listener('SIGTERM');
  await mocks.databaseClosed.promise;
  expect(mocks.sequence.slice(-2)).toEqual(['server.close', 'database.close']);
});
