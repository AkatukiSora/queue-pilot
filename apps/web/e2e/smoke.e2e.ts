import { e2eFixedTime, expectAdminScreen, test } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

test('admin signs in through the mock issuer and sees the admin screen', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/default/admin');
  await expectAdminScreen(page);
});
