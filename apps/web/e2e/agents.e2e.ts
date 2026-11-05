import { e2eFixedTime, expect, expectAdminScreen, test } from './fixtures.ts';

const adminPath = '/t/default/e/default/admin';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

test('admin sees agent reissue and revoke controls', async ({
  page,
  stack,
  signIn,
}) => {
  await stack.seedAgent('default');
  await signIn('e2e-admin', adminPath);
  await expectAdminScreen(page);

  await expect(
    page.getByRole('heading', { name: '印刷エージェント' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '再発行' }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '失効' }).first(),
  ).toBeVisible();
});

test('staff does not see agent reissue or revoke and never calls the agents API', async ({
  page,
  signIn,
}) => {
  const agentRequests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/agents')) agentRequests.push(pathname);
  });

  await signIn('e2e-staff', adminPath);
  await expectAdminScreen(page);
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();

  await expect(
    page.getByRole('heading', { name: '印刷エージェント' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '再発行' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '失効' })).toHaveCount(0);
  expect(agentRequests).toEqual([]);
});
