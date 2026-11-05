import { e2eFixedTime, expect, test } from './fixtures.ts';

test('legacy QR remains public until event expiry hides the ticket', async ({
  page,
  stack,
}) => {
  const token = await stack.seedLegacyTicket();
  await page.clock.setFixedTime(e2eFixedTime);
  await page.goto(`/ticket/${token}`);
  await expect(
    page.getByRole('heading', { name: 'あなたの番号' }),
  ).toBeVisible();
  await expect(
    page.getByText('旧整理券・スタッフにご確認ください'),
  ).toBeVisible();
  await expect(page.getByText('予約日時', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'GitHubでログイン' }),
  ).toHaveCount(0);

  // shared API は期限切れも 404 に畳み、token の存在を漏らさない。
  const expired = '2026-12-05T06:00:00.000Z';
  try {
    await stack.setClock(expired);
    await page.clock.setFixedTime(expired);
    const lookup = page.waitForResponse((r) =>
      r.url().includes(`/api/public/tickets/${token}`),
    );
    await page.reload();
    expect((await lookup).status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: '整理券が見つかりません' }),
    ).toBeVisible();
  } finally {
    await stack.setClock(e2eFixedTime);
  }
});
