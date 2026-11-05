import { e2eFixedTime, expect, test } from './fixtures.ts';
import { issueAt, ticketCard } from './helpers.ts';

const adminPath = '/t/default/e/default/admin';

test('concurrent booking returns real 409 and the neutral #31 message', async ({
  page,
  stack,
  signIn,
  openSecondSession,
}) => {
  await page.clock.setFixedTime(e2eFixedTime);
  await signIn('e2e-admin', adminPath);
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  const number = await issueAt(page, '12:30', 'Beyond2');
  await stack.settlePrintJobs();
  const card = await ticketCard(page, number);
  await card.getByRole('button', { name: '日時・機材を変更' }).click();
  await card.getByLabel('移動先の枠').selectOption({
    label: '2026-11-03 13:00・Beyond2',
  });

  const other = await openSecondSession('e2e-admin', adminPath);
  await expect(other.getByRole('heading', { name: '予約枠' })).toBeVisible();

  // Submit の直後に通信を止め、別セッションで移動先を先取りする。
  // 応答は偽造せず、本物の API / DB の競合判定を通す。
  await page.route('**/tickets/*/reschedule', async (route) => {
    await issueAt(other, '13:00', 'Beyond2');
    await route.continue();
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/reschedule') && r.request().method() === 'POST',
  );
  await card.getByRole('button', { name: '変更を確定する' }).click();
  expect((await response).status()).toBe(409);
  await expect(
    page.getByRole('alert').filter({ hasText: '選んだ枠は利用できません' }),
  ).toHaveText('選んだ枠は利用できません');
  await expect(page.getByText('元の枠を利用できません。')).toHaveCount(0);
  await expect(card).toContainText('12:30〜12:55');
});
