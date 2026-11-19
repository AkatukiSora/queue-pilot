import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:5188' });

const PREFIX = '/api/auth/queue-pilot';
const tenantPath = `${PREFIX}/t/acme`;
const eventPath = `${tenantPath}/events/fest`;

type FailureMode = 'conflict' | 'unprocessable' | 'network' | null;
type ManagementState = {
  tenantDisabled: boolean;
  eventDisabled: boolean;
  failureMode: FailureMode;
  disablePosts: number;
};

const jsonResponse = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockAuthenticatedSession(page: Page) {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill(
      jsonResponse(200, {
        session: { expiresAt: '2030-01-01T00:00:00.000Z' },
        user: { id: 'e2e', name: 'E2E' },
      }),
    ),
  );
}

async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill(jsonResponse(401, {})),
  );
}

async function mockV3Api(page: Page) {
  await page.route('**/api/v3/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v3/csrf') {
      return route.fulfill(jsonResponse(200, { token: 'e2e-csrf' }));
    }
    if (pathname === '/api/v3/events') {
      return route.fulfill(jsonResponse(200, { events: [] }));
    }
    if (pathname.endsWith('/agents')) {
      return route.fulfill(jsonResponse(200, { agents: [] }));
    }
    return route.fulfill(jsonResponse(200, {}));
  });
}

function tenantDetail() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'acme',
    displayName: 'Acme',
    revision: 3,
    changeConstraints: {
      activeTicketCount: 0,
      activeJobCount: 0,
      canDisable: true,
    },
  };
}

function eventDetail() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'fest',
    revision: 'a'.repeat(64),
    config: {
      title: 'Fest',
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
      copy: { receiptTitle: 'Ticket', arrivalGuidance: 'Please arrive.' },
      defaultPrinterId: 'front-desk',
      printers: [{ id: 'front-desk', label: 'Front desk' }],
    },
    changeConstraints: {
      ticketCount: 0,
      structuralFrozen: false,
      frozenFields: [],
      activeTicketCount: 0,
      activeJobCount: 0,
      canDisable: true,
      printersInUse: [],
    },
  };
}

async function mockManagementApi(page: Page, state: ManagementState) {
  await mockAuthenticatedSession(page);
  await mockV3Api(page);
  await page.route(`**${PREFIX}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const reply = (status: number, body: unknown) =>
      route.fulfill(jsonResponse(status, body));
    if (request.method() === 'GET' && pathname === `${PREFIX}/tenants`) {
      return reply(200, {
        tenants: state.tenantDisabled
          ? []
          : [
              {
                id: '11111111-1111-4111-8111-111111111111',
                slug: 'acme',
                displayName: 'Acme',
                role: 'admin',
                revision: 3,
                events: state.eventDisabled
                  ? []
                  : [{ id: 'event-id', slug: 'fest', title: 'Fest' }],
              },
            ],
      });
    }
    if (request.method() === 'GET' && pathname === tenantPath) {
      return state.tenantDisabled
        ? reply(404, { error: { code: 'not_found', message: 'missing' } })
        : reply(200, tenantDetail());
    }
    if (request.method() === 'GET' && pathname === `${tenantPath}/events`) {
      if (state.tenantDisabled) {
        return reply(404, { error: { code: 'not_found', message: 'missing' } });
      }
      return reply(200, {
        events: state.eventDisabled ? [] : [eventDetail()],
      });
    }
    if (
      request.method() === 'GET' &&
      pathname.startsWith(`${tenantPath}/audit`)
    ) {
      return state.tenantDisabled
        ? reply(404, { error: { code: 'not_found', message: 'missing' } })
        : reply(200, { entries: [], nextCursor: null });
    }
    if (request.method() === 'GET' && pathname === eventPath) {
      return state.eventDisabled || state.tenantDisabled
        ? reply(404, { error: { code: 'not_found', message: 'missing' } })
        : reply(200, eventDetail());
    }
    if (request.method() === 'POST' && pathname.endsWith('/disable')) {
      state.disablePosts += 1;
      if (state.failureMode === 'network') return route.abort('failed');
      if (state.failureMode === 'conflict') {
        return reply(409, {
          error: {
            code: 'revision_conflict',
            message: 'revision changed',
          },
        });
      }
      if (state.failureMode === 'unprocessable') {
        return reply(422, {
          error: {
            code: 'confirmation_mismatch',
            message: 'confirmation mismatch',
          },
        });
      }
      if (pathname === `${tenantPath}/disable`) state.tenantDisabled = true;
      if (pathname === `${eventPath}/disable`) state.eventDisabled = true;
      return reply(200, { revision: 4 });
    }
    return reply(500, { error: { code: 'unexpected', message: 'unexpected' } });
  });
}

test('direct scope errors finish after one GET and offer recovery links', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'GET') requests.push(pathname);
  });
  await mockAuthenticatedSession(page);
  await mockV3Api(page);
  await page.route(`**${PREFIX}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    const status = pathname.includes('/forbidden') ? 403 : 404;
    return route.fulfill(
      jsonResponse(status, {
        error: {
          code: status === 403 ? 'forbidden' : 'not_found',
          message: 'scope unavailable',
        },
      }),
    );
  });
  await page.route('**/api/v3/t/acme/e/missing/reservations', (route) =>
    route.fulfill(
      jsonResponse(404, {
        error: { code: 'not_found', message: 'missing' },
      }),
    ),
  );

  await page.goto('/t/missing/manage');
  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'テナント一覧へ戻る' }),
  ).toHaveAttribute('href', '/manage');

  await page.goto('/t/acme/e/missing/manage');
  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'テナント一覧へ戻る' }),
  ).toHaveAttribute('href', '/manage');

  await page.goto('/t/forbidden/manage');
  await expect(page.getByText('この画面を開く権限がありません')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'テナント一覧へ戻る' }),
  ).toHaveAttribute('href', '/manage');

  await page.goto('/t/acme/e/missing/admin');
  await expect(page.getByText('イベントが見つかりません')).toBeVisible();
  await expect(page.getByRole('button', { name: '設定を保存' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'テナント一覧へ戻る' }),
  ).toHaveAttribute('href', '/manage');
  await expect(
    page.getByRole('link', { name: 'イベント選択へ戻る' }),
  ).toHaveAttribute('href', '/admin');

  expect(
    requests.filter((path) => path === `${PREFIX}/t/missing`),
  ).toHaveLength(1);
  expect(
    requests.filter((path) => path === `${PREFIX}/t/acme/events/missing`),
  ).toHaveLength(1);
  expect(
    requests.filter((path) => path === `${PREFIX}/t/forbidden`),
  ).toHaveLength(1);
  expect(
    requests.filter((path) => path === '/api/v3/t/acme/e/missing/reservations'),
  ).toHaveLength(1);
});

test('tenant disable replaces the URL and a revisit never restores its form', async ({
  page,
}) => {
  const state: ManagementState = {
    tenantDisabled: false,
    eventDisabled: false,
    failureMode: null,
    disablePosts: 0,
  };
  await mockManagementApi(page, state);
  await page.goto('/manage');
  await page.getByRole('link', { name: 'テナントの管理' }).click();
  await expect(page.getByLabel('表示名')).toHaveValue('Acme');
  await page.getByLabel('確認のため「acme」と入力').fill('acme');
  await page.getByRole('button', { name: 'テナントを無効化' }).click();

  await page.waitForURL('**/manage');
  await expect(
    page.getByText(/所属しているテナントがありません/),
  ).toBeVisible();
  expect(state.disablePosts).toBe(1);
  await expect(
    page.getByRole('button', { name: 'テナントを無効化' }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/manage$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/manage$/);

  await page.goto('/t/acme/manage');
  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByText('基本設定')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'テナントを無効化' }),
  ).toHaveCount(0);
});

test('a cached tenant form disappears when its explicit refetch returns 404', async ({
  page,
}) => {
  let tenantReads = 0;
  let tenantMissing = false;
  await mockAuthenticatedSession(page);
  await page.route(`**${PREFIX}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'GET' && pathname === tenantPath) {
      tenantReads += 1;
      return route.fulfill(
        tenantMissing
          ? jsonResponse(404, {
              error: { code: 'not_found', message: 'missing' },
            })
          : jsonResponse(200, tenantDetail()),
      );
    }
    if (request.method() === 'GET' && pathname === `${tenantPath}/events`) {
      return route.fulfill(jsonResponse(200, { events: [] }));
    }
    if (
      request.method() === 'GET' &&
      pathname.startsWith(`${tenantPath}/audit`)
    ) {
      return route.fulfill(
        jsonResponse(200, { entries: [], nextCursor: null }),
      );
    }
    if (request.method() === 'POST' && pathname === `${tenantPath}/update`) {
      tenantMissing = true;
      return route.fulfill(
        jsonResponse(409, {
          error: { code: 'revision_conflict', message: 'revision changed' },
        }),
      );
    }
    return route.fulfill(
      jsonResponse(500, {
        error: { code: 'unexpected', message: 'unexpected' },
      }),
    );
  });

  await page.goto('/t/acme/manage');
  await expect(page.getByLabel('表示名')).toHaveValue('Acme');
  await page.getByLabel('表示名').fill('Changed');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('alert')).toContainText(
    '他の操作で内容が更新されています',
  );
  await page.getByRole('button', { name: '最新を読み込む' }).click();

  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByText('基本設定')).toHaveCount(0);
  await expect(page.getByLabel('表示名')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'テナントを無効化' }),
  ).toHaveCount(0);
  expect(tenantReads).toBe(2);
});

test('event disable replaces the URL and leaves no disabled event in the tenant list', async ({
  page,
}) => {
  const state: ManagementState = {
    tenantDisabled: false,
    eventDisabled: false,
    failureMode: null,
    disablePosts: 0,
  };
  await mockManagementApi(page, state);
  await page.goto('/manage');
  await page.getByRole('link', { name: 'テナントの管理' }).click();
  await page.getByRole('link', { name: '設定を開く' }).click();
  await expect(page.getByLabel('イベント名')).toHaveValue('Fest');
  await page.getByLabel('確認のため「fest」と入力').fill('fest');
  await page.getByRole('button', { name: 'イベントを無効化' }).click();

  await page.waitForURL('**/t/acme/manage');
  await expect(page.getByText(/イベントはまだありません/)).toBeVisible();
  expect(state.disablePosts).toBe(1);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/acme\/manage$/);
  await expect(
    page.getByRole('button', { name: 'イベントを無効化' }),
  ).toHaveCount(0);

  await page.goto('/t/acme/e/fest/manage');
  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '設定を保存' })).toHaveCount(0);
});

test('disable conflicts and network failures stay on the screen without duplicate POSTs', async ({
  page,
}) => {
  const state: ManagementState = {
    tenantDisabled: false,
    eventDisabled: false,
    failureMode: 'conflict',
    disablePosts: 0,
  };
  await mockManagementApi(page, state);
  await page.goto('/t/acme/manage');
  const failures: [FailureMode, RegExp][] = [
    ['conflict', /他の操作で内容が更新されています/],
    ['unprocessable', /確認用に入力した slug が一致しません/],
    ['network', /通信に失敗しました/],
  ];
  for (const [failureMode, message] of failures) {
    state.failureMode = failureMode;
    state.disablePosts = 0;
    if (page.url().endsWith('/manage') === false)
      await page.goto('/t/acme/manage');
    await page.getByLabel('確認のため「acme」と入力').fill('acme');
    await page.getByRole('button', { name: 'テナントを無効化' }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page).toHaveURL(/\/t\/acme\/manage$/);
    expect(state.disablePosts).toBe(1);
  }

  await page.goto('/t/acme/e/fest/manage');
  for (const [failureMode, message] of failures) {
    state.failureMode = failureMode;
    state.disablePosts = 0;
    await page.getByLabel('確認のため「fest」と入力').fill('fest');
    await page.getByRole('button', { name: 'イベントを無効化' }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page).toHaveURL(/\/t\/acme\/e\/fest\/manage$/);
    expect(state.disablePosts).toBe(1);
  }
});

test('unauthenticated, transient, and empty states remain distinct', async ({
  page,
}) => {
  let scopeCalls = 0;
  await mockUnauthenticatedSession(page);
  await page.route(`**${PREFIX}/**`, (route) => {
    scopeCalls += 1;
    return route.fulfill(
      jsonResponse(404, { error: { code: 'not_found', message: 'missing' } }),
    );
  });
  await page.goto('/t/missing/manage');
  await expect(
    page.getByRole('button', { name: 'GitHubでログイン' }),
  ).toBeVisible();
  expect(scopeCalls).toBe(0);

  const requests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'GET' && pathname === `${PREFIX}/t/acme`) {
      requests.push(pathname);
    }
  });
  await page.unroute('**/api/auth/get-session');
  await mockAuthenticatedSession(page);
  await page.route(`**${PREFIX}/t/acme`, (route) =>
    route.fulfill(
      jsonResponse(500, {
        error: { code: 'server_error', message: 'temporarily unavailable' },
      }),
    ),
  );
  await page.goto('/t/acme/manage');
  await expect(page.getByText('読み込めませんでした')).toBeVisible();
  await expect(page.getByText('見つかりません')).toHaveCount(0);
  expect(requests).toHaveLength(4);

  await page.unrouteAll({ behavior: 'wait' });
  await mockAuthenticatedSession(page);
  await mockV3Api(page);
  await page.route(`**${PREFIX}/tenants`, (route) =>
    route.fulfill(jsonResponse(200, { tenants: [] })),
  );
  await page.goto('/manage');
  await expect(
    page.getByText(/所属しているテナントがありません/),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '新しいテナントを登録' }),
  ).toBeVisible();
});
