import { e2eFixedTime, expect, expectAdminScreen, test } from './fixtures.ts';

const adminPath = '/t/default/e/default/admin';
const loginButton = 'GitHubでログイン';
const sessionIdleMs = 12 * 60 * 60_000;
const sessionRefreshMs = 5 * 60_000;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

// 失効テストが API の固定時刻を進めるため、必ず基準時刻へ戻す。
test.afterEach(async ({ stack }) => {
  await stack.setClock(e2eFixedTime);
});

test('logout returns to the login prompt and the session stays closed after reload', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', adminPath);
  await expectAdminScreen(page);

  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(
    page.getByRole('heading', { name: 'ログインが必要です' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'ログインが必要です' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: loginButton })).toBeVisible();
});

test('refreshes the session while active, then expires after the idle window', async ({
  page,
  stack,
  signIn,
}) => {
  await signIn('e2e-admin', adminPath);
  await expectAdminScreen(page);

  const refreshedAt = new Date(
    Date.parse(e2eFixedTime) + sessionRefreshMs,
  ).toISOString();
  await stack.setClock(refreshedAt);
  await page.clock.setFixedTime(refreshedAt);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expectAdminScreen(page);
  const refreshedSessionResponse = await page.request.get(
    '/api/auth/get-session',
  );
  expect(refreshedSessionResponse.status()).toBe(200);
  const refreshedSessionBody = (await refreshedSessionResponse.json()) as {
    session: { expiresAt: string } | null;
  };
  expect(refreshedSessionBody.session?.expiresAt).toBe(
    new Date(Date.parse(refreshedAt) + sessionIdleMs).toISOString(),
  );

  const expiredAt = new Date(
    Date.parse(refreshedSessionBody.session?.expiresAt ?? '') + 1,
  ).toISOString();
  await stack.setClock(expiredAt);
  await page.clock.setFixedTime(expiredAt);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('heading', { name: 'ログインの有効期限が切れました' }),
  ).toBeVisible();
  await expect(
    page.getByText('セッションの有効時間が過ぎました'),
  ).toBeVisible();

  expect(
    (
      await page.request.get('/api/v3/t/default/e/default/reservations')
    ).status(),
  ).toBe(401);
  await page.reload();
  await expect(page.getByRole('button', { name: loginButton })).toBeVisible();

  await page.getByRole('button', { name: loginButton }).click();
  await page.waitForURL((url) => url.pathname === adminPath);
  await expectAdminScreen(page);
});
