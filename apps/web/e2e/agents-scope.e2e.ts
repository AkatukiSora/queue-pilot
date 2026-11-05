import { e2eFixedTime, expect, expectAdminScreen, test } from './fixtures.ts';

test.use({ trace: 'off' });

test('hides an already issued token after switching admin events', async ({
  page,
  stack,
  signIn,
}) => {
  await page.clock.setFixedTime(e2eFixedTime);
  await stack.seedAgent('default');
  await signIn('e2e-admin', '/t/default/e/default/admin');
  await expectAdminScreen(page);

  await page.getByRole('button', { name: '再発行', exact: true }).click();
  await page.getByRole('button', { name: '再発行を実行', exact: true }).click();
  await expect(page.locator('code.break-all')).toBeVisible();

  await page
    .getByLabel('イベント切替')
    .selectOption({ label: 'Default tenant / Solo event' });
  await page.waitForURL('**/t/default/e/solo/admin');
  await expect(
    page.getByRole('columnheader', { name: 'Vision Pro', exact: true }),
  ).toBeVisible();
  await expect(page.locator('code.break-all')).toHaveCount(0);
});

test('isolates a pending old-event rotation from the next admin event', async ({
  page,
  stack,
  signIn,
}) => {
  await page.clock.setFixedTime(e2eFixedTime);
  await stack.seedAgent('default');
  await stack.seedAgent('solo');
  await signIn('e2e-admin', '/t/default/e/default/admin');
  await expectAdminScreen(page);

  let releaseResponse!: () => void;
  let reportIntercepted!: () => void;
  let reportFulfilled!: () => void;
  const responsePaused = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const requestIntercepted = new Promise<void>((resolve) => {
    reportIntercepted = resolve;
  });
  const responseFulfilled = new Promise<void>((resolve) => {
    reportFulfilled = resolve;
  });
  const rotateRoute = '**/api/v3/t/default/e/default/agents/*/rotate';
  await page.route(rotateRoute, async (route) => {
    reportIntercepted();
    await responsePaused;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        token: 'discarded-test-response',
        expiresAt: '2026-12-02T00:00:00.000Z',
      }),
    });
    reportFulfilled();
  });

  await page
    .getByRole('button', { name: '再発行', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: '再発行を実行', exact: true }).click();
  await requestIntercepted;

  await page
    .getByLabel('イベント切替')
    .selectOption({ label: 'Default tenant / Solo event' });
  await page.waitForURL('**/t/default/e/solo/admin');
  await expect(
    page.getByRole('columnheader', { name: 'Vision Pro', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '再発行', exact: true }).first(),
  ).toBeEnabled();
  await expect(page.locator('code.break-all')).toHaveCount(0);

  releaseResponse();
  await responseFulfilled;
  await expect(page.locator('code.break-all')).toHaveCount(0);
  await page.unroute(rotateRoute);
});
