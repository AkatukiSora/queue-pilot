import { e2eFixedTime, expect, expectAdminScreen, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

test('event picker lists only accessible events and switching scope never calls the previous scope', async ({
  page,
  signIn,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/v3/t/')) requested.push(pathname);
  });

  await signIn('e2e-admin', '/admin');
  await expect(
    page.getByRole('heading', { name: 'イベントを選択' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Default event/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Summer event/ })).toBeVisible();
  // 所属していない tenant のイベントは選択肢に出ない。
  await expect(page.getByText('Secret event')).toHaveCount(0);
  await expect(page.getByText('Private tenant')).toHaveCount(0);

  await page.getByRole('link', { name: /Default event/ }).click();
  await page.waitForURL('**/t/default/e/default/admin');
  await expectAdminScreen(page);
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();

  const beforeSwitch = requested.length;
  await page
    .getByLabel('イベント切替')
    .selectOption({ label: 'Sample tenant / Summer event' });
  await page.waitForURL('**/t/sample-tenant/e/summer/admin');
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  // 切替後の描画が落ち着くまで、ポーリング間隔 (3 秒) を超えて観測する。
  await page.waitForTimeout(3_500);

  const afterSwitch = requested.slice(beforeSwitch);
  expect(afterSwitch.length).toBeGreaterThan(0);
  for (const pathname of afterSwitch) {
    expect(pathname).toMatch(/^\/api\/v3\/t\/sample-tenant\/e\/summer\//);
  }
  expect(requested.some((p) => p.includes('/private-tenant/'))).toBe(false);

  // 切替先の内容だけが見え、旧 scope の機材は残らない。
  await expect(
    page.getByRole('columnheader', { name: 'Quest 3' }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Steam Frame' }),
  ).toHaveCount(0);
});

test('unauthenticated, forbidden and unknown scopes are handled by the server answer', async ({
  page,
  signIn,
}) => {
  // 401: 未ログインはログイン導線。
  await page.goto('/t/default/e/default/admin');
  await expect(
    page.getByRole('heading', { name: 'ログインが必要です' }),
  ).toBeVisible();

  // 他 tenant / 存在しない slug は 403 または 404 の専用画面になり、データは出ない。
  await signIn('e2e-staff', '/t/default/e/default/admin');
  await expectAdminScreen(page);

  const scoped = page.waitForResponse((response) =>
    response.url().includes('/api/v3/t/private-tenant/e/secret/'),
  );
  await page.goto('/t/private-tenant/e/secret/admin');
  const privateStatus = (await scoped).status();
  expect([403, 404]).toContain(privateStatus);
  await expect(
    page.getByRole('heading', {
      name:
        privateStatus === 403
          ? 'このイベントを開く権限がありません'
          : 'イベントが見つかりません',
    }),
  ).toBeVisible();
  await expect(page.getByText('Secret event')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'イベント選択へ戻る' }),
  ).toBeVisible();

  const missing = page.waitForResponse((response) =>
    response.url().includes('/api/v3/t/no-such/e/event/'),
  );
  await page.goto('/t/no-such/e/event/admin');
  expect((await missing).status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'イベントが見つかりません' }),
  ).toBeVisible();
});
