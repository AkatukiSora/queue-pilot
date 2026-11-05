import { e2eFixedTime, expect, expectAdminScreen, test } from './fixtures.ts';

const adminPath = '/t/default/e/default/admin';
const loginButton = 'GitHubでログイン';
const sessionMinutes = 15;

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

test('session expires after 15 minutes and can be re-established by logging in again', async ({
  page,
  stack,
  signIn,
}) => {
  await signIn('e2e-admin', adminPath);
  await expectAdminScreen(page);

  // 14分59秒では有効。15分ちょうどで期限切れにする。
  const beforeExpiry = new Date(
    Date.parse(e2eFixedTime) + sessionMinutes * 60_000 - 1_000,
  ).toISOString();
  await page.clock.setFixedTime(beforeExpiry);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expectAdminScreen(page);
  const later = new Date(
    Date.parse(e2eFixedTime) + sessionMinutes * 60_000,
  ).toISOString();
  await stack.setClock(later);
  await page.clock.setFixedTime(later);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );

  await expect(
    page.getByRole('heading', { name: 'ログインの有効期限が切れました' }),
  ).toBeVisible();
  await expect(page.getByText('セッションの有効時間 (15分)')).toBeVisible();

  // サーバー側でも旧セッションは使えない: 本物の API の 401 を確認する。
  // Better Auth の server 比較は expiresAt < now なので 1ms 超過させる。
  await stack.setClock(new Date(Date.parse(later) + 1).toISOString());
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
