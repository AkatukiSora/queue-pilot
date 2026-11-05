import { e2eFixedTime, expect, test } from './fixtures.ts';
import { collapsedSection, issueAt, ticketCard } from './helpers.ts';

const adminPath = '/t/default/e/default/admin';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

test('legacy reservation lifecycle: issue, public ticket, move, release, restore, categories', async ({
  page,
  browser,
  stack,
  signIn,
}) => {
  await signIn('e2e-admin', adminPath);
  await expect(page.getByRole('heading', { name: '予約枠' })).toBeVisible();
  await page.getByRole('button', { name: '2026-11-03', exact: true }).click();

  // 基準時刻は 10:05 JST。10:00 の枠は途中枠なので確認ダイアログが出る。
  // 開始済みの枠の予約は API 仕様上、別枠へ移動できない。
  const first = await issueAt(page, '10:00', 'Quest 3', { midSlot: true });
  const second = await issueAt(page, '10:30', 'Quest 3');
  const third = await issueAt(page, '10:30', 'Quest 3S');
  expect(new Set([first, second, third]).size).toBe(3);

  // 公開整理券はログインなしで開ける。
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.clock.setFixedTime(e2eFixedTime);
  const firstToken = await stack.publicToken('default', first);
  const secondToken = await stack.publicToken('default', second);
  const thirdToken = await stack.publicToken('default', third);
  await visitorPage.goto(`/ticket/${firstToken}`);
  await expect(
    visitorPage.getByRole('heading', { name: 'あなたの番号' }),
  ).toBeVisible();
  await expect(
    visitorPage.getByText('10:00〜10:25', { exact: true }),
  ).toBeVisible();
  await expect(visitorPage.getByText('Quest 3', { exact: true })).toBeVisible();
  await expect(
    visitorPage.getByRole('button', { name: 'GitHubでログイン' }),
  ).toHaveCount(0);

  // 不明な token (QR の読み違い)。
  await visitorPage.goto('/ticket/unknown-token-0000000');
  await expect(
    visitorPage.getByText('QRコードまたはURLをご確認ください。'),
  ).toBeVisible();

  // 時間・機材の変更と、公開整理券の「最新の変更」。
  const secondCard = await ticketCard(page, second);
  await secondCard.getByRole('button', { name: '日時・機材を変更' }).click();
  await secondCard.getByLabel('移動先の枠').selectOption({
    label: '2026-11-03 11:00・Quest 3',
  });
  await secondCard
    .getByLabel('来場者へのコメント（任意・200文字以内）')
    .fill('来場時刻を確認してください');
  await stack.settlePrintJobs();
  await secondCard.getByRole('button', { name: '変更を確定する' }).click();
  await expect(secondCard.getByRole('alert')).toContainText(
    '再印刷が必要です。',
  );

  await visitorPage.goto(`/ticket/${secondToken}`);
  await expect(
    visitorPage.getByText('11:00〜11:25', { exact: true }),
  ).toBeVisible();
  await expect(
    visitorPage.getByText('時間枠または機材が変更されました'),
  ).toBeVisible();
  await expect(
    visitorPage.getByText('来場時刻を確認してください', { exact: true }),
  ).toBeVisible();

  // 取消 → 枠の解放 → 公開整理券は「解放済み」。
  const thirdCard = await ticketCard(page, third);
  await thirdCard.getByLabel(`${third}番の取消理由`).selectOption('visitor');
  await stack.settlePrintJobs();
  await thirdCard.getByRole('button', { name: '取消', exact: true }).click();
  await expect(collapsedSection(page, 'キャンセル済み')).toContainText(
    `${third}番`,
  );
  const cancelledCard = await ticketCard(page, third);
  await expect(collapsedSection(page, 'キャンセル済み')).toContainText(
    '取消済み（来場者都合）',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await stack.settlePrintJobs();
  await cancelledCard.getByRole('button', { name: '予約枠を解放' }).click();
  await expect(cancelledCard).toContainText('枠解放済み');
  await visitorPage.goto(`/ticket/${thirdToken}`);
  await expect(
    visitorPage.getByText('この枠は解放済みです。現在の予約はありません。'),
  ).toBeVisible();

  // 解放された枠が別の来場者に使われると、元の枠への復元は競合する。
  const fourth = await issueAt(page, '10:30', 'Quest 3S');
  const releasedCard = await ticketCard(page, third);
  await releasedCard.getByRole('button', { name: '元の枠に復元' }).click();
  await expect(releasedCard.getByRole('alert')).toContainText(
    '元の枠を利用できません。',
  );

  // 途中枠への別枠復元は確認チェックが必要。
  await releasedCard.getByLabel(`${third}番の復元先`).selectOption({
    label: '2026-11-03 10:00 (JST)・Quest 3S（途中枠・10:25終了）',
  });
  const restore = releasedCard.getByRole('button', { name: '別枠に復元' });
  await expect(restore).toBeDisabled();
  await releasedCard.getByRole('checkbox').check();
  await restore.click();
  await expect(releasedCard.getByRole('alert')).toContainText(
    '再印刷が必要です。',
  );
  await visitorPage.goto(`/ticket/${thirdToken}`);
  await expect(
    visitorPage.getByText('10:00〜10:25', { exact: true }),
  ).toBeVisible();
  await expect(
    visitorPage.getByText('Quest 3S', { exact: true }),
  ).toBeVisible();

  // 案内済みにすると「案内・入店済み」へ分類される。
  const fourthCard = await ticketCard(page, fourth);
  await fourthCard.getByRole('button', { name: '案内済みにする' }).click();
  await ticketCard(page, fourth);
  await expect(collapsedSection(page, '案内・入店済み')).toContainText(
    `${fourth}番`,
  );
  await expect(
    page.getByRole('region', { name: 'これから利用・対応待ち' }),
  ).not.toContainText(`${fourth}番`);
  await visitor.close();
});
