import { expect, test } from './fixtures.ts';

test('credits are public and linked from the shared footer', async ({
  page,
}) => {
  await page.goto('/credits');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '使用ライブラリのクレジット',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Web（本番依存）' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'API（本番依存）' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: '印刷エージェント（Go）' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 3,
      name: 'github.com/AkatukiSora/tm-t88v@v0.0.0-20260307114006-7ec63a16d1ce',
    }),
  ).toBeVisible();

  const licenseSummary = page.getByText('ライセンス全文（MIT）').first();
  await licenseSummary.click();
  await expect(page.locator('details[open] pre').first()).toContainText(
    'MIT License',
  );

  const github = page.getByRole('link', { name: 'GitHub', exact: true });
  await expect(github).toHaveAttribute(
    'href',
    'https://github.com/AkatukiSora/queue-pilot',
  );
  await expect(github).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(
    page.getByRole('link', { name: 'ライセンス / クレジット', exact: true }),
  ).toHaveAttribute('href', '/credits');
});
