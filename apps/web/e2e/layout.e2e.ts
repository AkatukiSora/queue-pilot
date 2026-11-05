import { e2eFixedTime, expect, test } from './fixtures.ts';
import { issueAt, ticketCard } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

test('single-column equipment layout uses the event time zone and interval', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/solo/admin');
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  await page.getByRole('button', { name: '2026-11-03', exact: true }).click();

  const headers = (await page.getByRole('columnheader').allTextContents()).map(
    (name) => name.trim(),
  );
  expect(headers).toContain('Vision Pro');
  expect(headers).not.toContain('Quest 3');
  expect(
    headers.filter((name) => name !== '' && name !== 'Vision Pro'),
  ).toHaveLength(1);

  // America/New_York の 09:00 開始・20 分間隔 (EST なので UTC-5)。
  const rows = (await page.getByRole('rowheader').allTextContents()).map(
    (text) => text.trim(),
  );
  expect(rows.map((text) => text.slice(0, 5))).toEqual([
    '09:00',
    '09:20',
    '09:40',
  ]);
  const number = await issueAt(page, '09:00', 'Vision Pro');
  const card = await ticketCard(page, number);
  await expect(card).toContainText('09:00〜09:15');
  await expect(card).toContainText(/GMT-5|EST/);
});

test('five-column equipment layout follows the event time zone with 15 minute slots', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/wide/admin');
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  await page.getByRole('button', { name: '2026-11-03', exact: true }).click();

  const headers = (await page.getByRole('columnheader').allTextContents())
    .map((name) => name.trim())
    .filter((name) => name !== '');
  for (const equipment of [
    'Quest 3',
    'Quest 3S',
    'Steam Frame',
    'Beyond2',
    'Vision Pro',
  ]) {
    expect(headers).toContain(equipment);
  }

  // Asia/Kolkata (UTC+5:30) の 10:00 開始・15 分間隔。
  const rows = (await page.getByRole('rowheader').allTextContents()).map(
    (text) => text.trim(),
  );
  expect(rows.map((text) => text.slice(0, 5))).toEqual([
    '10:00',
    '10:15',
    '10:30',
  ]);
  expect(headers).toHaveLength(6); // 時刻 + 機材5列
  const number = await issueAt(page, '10:00', 'Vision Pro');
  const card = await ticketCard(page, number);
  await expect(card).toContainText('10:00〜10:10');
  await expect(card).toContainText(/GMT\+5:30|IST/);
});
