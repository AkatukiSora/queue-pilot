import { readFile } from 'node:fs/promises';
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
    page.getByRole('heading', { name: 'エージェントトークン' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '再発行' }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '失効' }).first(),
  ).toBeVisible();
});

test('admin can rotate an agent and download its token-free config template', async ({
  page,
  stack,
  signIn,
}) => {
  await stack.seedAgent('default');
  await signIn('e2e-admin', adminPath);
  await expectAdminScreen(page);

  const row = page.locator('li[data-testid^="agent-"]').first();
  const printerId = (await row.locator('code').textContent())?.trim() ?? '';
  expect(printerId).not.toBe('');
  await expect(row).toContainText(`printerId: ${printerId}`);
  await row.getByText('設定テンプレート', { exact: true }).click();

  const rotateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/rotate') &&
      response.request().method() === 'POST',
  );
  await row.getByRole('button', { name: '再発行', exact: true }).click();
  await row.getByRole('button', { name: '再発行を実行' }).click();
  const response = await rotateResponse;
  expect(response.ok()).toBe(true);
  const { token } = (await response.json()) as { token: string };

  const issuedPanel = page.getByTestId('issued-agent-token');
  await expect(issuedPanel).toBeVisible();
  await issuedPanel.getByText('設定テンプレート', { exact: true }).click();
  const environment = issuedPanel.getByRole('figure', {
    name: '環境変数ファイルの雛形',
  });
  await expect(environment).toContainText(`AGENT_TOKEN=${token}`);
  await expect(
    issuedPanel.getByRole('figure', { name: 'print-agent.json' }),
  ).not.toContainText(token);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    issuedPanel
      .getByRole('button', { name: '設定テンプレートをダウンロード' })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe('print-agent.json');
  const downloadedPath = await download.path();
  if (downloadedPath === null) throw new Error('Download path is unavailable.');
  const downloadedJSON = await readFile(downloadedPath, 'utf8');
  expect(JSON.parse(downloadedJSON)).toEqual({
    schemaVersion: 1,
    printerId,
    driver: { type: 'tm-t88v-usb', devicePath: '/dev/usb/lp0' },
  });
  expect(downloadedJSON).not.toContain(token);

  await issuedPanel.getByRole('button', { name: 'トークンを閉じる' }).click();
  await expect(issuedPanel).toHaveCount(0);
  await expect(page.getByText(token, { exact: true })).toHaveCount(0);
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
    page.getByRole('heading', { name: 'エージェントトークン' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '再発行' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '失効' })).toHaveCount(0);
  expect(agentRequests).toEqual([]);
});
