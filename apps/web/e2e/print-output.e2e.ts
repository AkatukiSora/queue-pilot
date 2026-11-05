import { e2eFixedTime, expect, test } from './fixtures.ts';
import { issueAt, ticketCard } from './helpers.ts';

const adminPath = '/t/default/e/default/admin';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

// 実 API の管理用応答 (outputKind) を画面が区別して表示するかを確認する。
// 印刷エージェントは起動せず、print job の結果は DB へ直接投入する。
test('print history shows the preview notice only for outputKind=preview', async ({
  page,
  stack,
  signIn,
}) => {
  await signIn('e2e-admin', adminPath);
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  await page.getByRole('button', { name: '2026-11-03', exact: true }).click();

  const cases = [
    { time: '14:00', equipment: 'Beyond2', kind: 'preview', notice: true },
    { time: '14:30', equipment: 'Beyond2', kind: 'physical', notice: false },
    { time: '14:00', equipment: 'Quest 3S', kind: null, notice: false },
  ] as const;

  for (const { time, equipment, kind, notice } of cases) {
    const number = await issueAt(page, time, equipment);
    await stack.settlePrintJobs(kind);
    await page.reload();
    await page.getByRole('button', { name: '2026-11-03', exact: true }).click();
    const card = await ticketCard(page, number);
    await card.getByRole('button', { name: /印刷履歴/ }).click();
    await expect(card.getByText('印刷済み').first()).toBeVisible();
    await expect(card.getByTestId('print-preview-notice')).toHaveCount(
      notice ? 1 : 0,
    );
  }
});
