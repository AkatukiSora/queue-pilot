import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  type E2EPostgresContext,
  withE2EStack,
} from '../../../scripts/e2e-stack.ts';
import { withTemporaryPostgres } from '../../../scripts/embedded-postgres.mjs';

test('reservation issue, QR update, move, reprint, and ticket lifecycle', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await withTemporaryPostgres(
    async ({ postgres, urlFor, temporaryDirectory }: E2EPostgresContext) => {
      await withE2EStack(
        { postgres, urlFor, temporaryDirectory },
        async (stack) => {
          await page.goto('/admin');
          await page.getByLabel('管理者トークン').fill(stack.adminToken);
          await page.getByRole('button', { name: '管理画面を開く' }).click();
          await expect(
            page.getByRole('heading', { name: '管理画面' }),
          ).toBeVisible();
          await page
            .getByRole('button', { name: '2026-11-04', exact: true })
            .click();

          const firstSlot = page
            .getByRole('row', { name: /10:00/ })
            .getByRole('button', { name: '空き・発券' });
          await firstSlot.first().click();
          await expect(page.getByRole('status')).toContainText(
            '1番を発券しました。',
          );
          const secondSlot = page
            .getByRole('row', { name: /10:00/ })
            .getByRole('button', { name: '空き・発券' });
          await secondSlot.first().click();
          await expect(page.getByRole('status')).toContainText(
            '2番を発券しました。',
          );
          await stack.stopAgent();
          await writeFile(stack.devicePath, '');
          stack.startAgent();
          await expect
            .poll(
              async () =>
                Promise.all([
                  stack.printJobStatuses(1),
                  stack.printJobStatuses(2),
                ]),
              { timeout: 30_000 },
            )
            .toEqual([['printed'], ['printed']]);

          const firstTicketId = await stack.ticketId(1);
          const firstToken = await stack.ticketToken(1);
          const secondTicketId = await stack.ticketId(2);
          await stack.restartApi();
          await page.reload();
          const firstCard = page.locator(`#ticket-${firstTicketId}`);
          const secondCard = page.locator(`#ticket-${secondTicketId}`);
          await expect(firstCard).toContainText(
            '2026-11-04 10:00〜10:25・Quest 3',
          );
          await expect(secondCard).toContainText(
            '2026-11-04 10:00〜10:25・Quest 3S',
          );

          await page.goto(`/ticket/${firstToken}`);
          await expect(
            page.getByRole('heading', { name: 'あなたの番号' }),
          ).toBeVisible();
          await expect(
            page.getByText('10:00〜10:25', { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText('Quest 3', { exact: true }),
          ).toBeVisible();

          await page.goto('/admin');
          const moveCard = page.locator(`#ticket-${firstTicketId}`);
          await moveCard
            .getByRole('button', { name: '日時・機材を変更' })
            .click();
          await moveCard.getByLabel('移動先の枠').selectOption({
            label: '2026-11-04 10:30・Quest 3',
          });
          await moveCard
            .getByLabel('来場者へのコメント（任意・200文字以内）')
            .fill('来場時刻を確認してください');
          await moveCard
            .getByRole('button', { name: '変更を確定する' })
            .click();
          await expect(moveCard.getByRole('alert')).toContainText(
            '再印刷が必要です。',
          );
          await expect(
            moveCard.getByRole('button', { name: '現在の予約で再印刷' }),
          ).toBeVisible();

          await page.goto(`/ticket/${firstToken}`);
          await expect(
            page.getByText('10:30〜10:55', { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText('来場時刻を確認してください', { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText(
              '紙ではなく、現在表示されている予約時刻をご確認ください。',
            ),
          ).toBeVisible();

          await page.goto('/admin');
          const updatedCard = page.locator(`#ticket-${firstTicketId}`);
          await updatedCard
            .getByRole('button', { name: '現在の予約で再印刷' })
            .click();
          await expect
            .poll(() => stack.printJobStatuses(1), { timeout: 30_000 })
            .toEqual(['printed', 'printed']);

          await updatedCard
            .getByRole('button', { name: '日時・機材を変更' })
            .click();
          await updatedCard.getByLabel('移動先の枠').selectOption({
            label: '2026-11-04 10:30・Quest 3S',
          });
          await updatedCard
            .getByRole('button', { name: '変更を確定する' })
            .click();
          await expect(updatedCard.getByRole('status')).toContainText(
            '機材のみを変更しました。再印刷は不要です。',
          );
          await expect(updatedCard).toContainText(
            '2026-11-04 10:30〜10:55・Quest 3S',
          );
          await expect
            .poll(() => stack.printJobStatuses(1))
            .toEqual(['printed', 'printed']);

          await page.goto(`/ticket/${firstToken}`);
          await expect(
            page.getByText('Quest 3S', { exact: true }),
          ).toBeVisible();
          await page.goto('/admin');
          const finalFirstCard = page.locator(`#ticket-${firstTicketId}`);
          await finalFirstCard
            .getByRole('button', { name: '案内済みにする' })
            .click();
          await finalFirstCard
            .locator('xpath=ancestor::details')
            .locator('summary')
            .click();
          await expect(
            finalFirstCard.getByText('案内済み', { exact: true }),
          ).toBeVisible();

          const finalSecondCard = page.locator(`#ticket-${secondTicketId}`);
          const secondToken = await stack.ticketToken(2);
          await finalSecondCard
            .getByLabel('2番の取消理由')
            .selectOption('visitor');
          await finalSecondCard
            .getByRole('button', { name: '取消', exact: true })
            .click();
          await expect(finalSecondCard).toContainText('取消済み（来場者都合）');
          await finalSecondCard
            .locator('xpath=ancestor::details')
            .locator('summary')
            .click();
          await finalSecondCard
            .getByRole('button', { name: 'キャンセルを取り消す' })
            .click();
          await expect(finalSecondCard).toContainText('予約済み');

          await finalSecondCard
            .getByRole('button', { name: '案内済みにする' })
            .click();
          await expect(finalSecondCard).toContainText('案内済み');
          await finalSecondCard
            .locator('xpath=ancestor::details')
            .locator('summary')
            .click();
          page.once('dialog', (dialog) => dialog.accept());
          await finalSecondCard
            .getByRole('button', { name: '案内・入店を取り消す' })
            .click();
          await expect(finalSecondCard).toContainText('予約済み');

          page.once('dialog', (dialog) => dialog.accept());
          await finalSecondCard
            .getByRole('button', { name: '予約枠を解放' })
            .click();
          await expect(finalSecondCard).toContainText('枠解放済み');
          await finalSecondCard
            .locator('xpath=ancestor::details')
            .locator('summary')
            .click();

          await page.goto(`/ticket/${secondToken}`);
          await expect(
            page.getByText('この枠は解放済みです。現在の予約はありません。'),
          ).toBeVisible();

          await page.goto('/admin');
          await page
            .getByRole('button', { name: '2026-11-04', exact: true })
            .click();
          const releasedSlot = page
            .getByRole('row', { name: /10:00/ })
            .getByRole('cell')
            .nth(1)
            .getByRole('button', { name: '空き・発券' });
          await releasedSlot.click();
          await expect(page.getByRole('status')).toContainText(
            '3番を発券しました。',
          );

          const releasedSecondCard = page.locator(`#ticket-${secondTicketId}`);
          await releasedSecondCard
            .locator('xpath=ancestor::details')
            .locator('summary')
            .click();
          await releasedSecondCard
            .getByRole('button', { name: '元の枠に復元' })
            .click();
          await expect(releasedSecondCard.getByRole('alert')).toContainText(
            '元の枠を利用できません。',
          );
          await releasedSecondCard.getByLabel('2番の復元先').selectOption({
            label: '2026-11-04 10:30 (JST)・Quest 3',
          });
          await releasedSecondCard
            .getByRole('button', { name: '別枠に復元' })
            .click();
          await expect(releasedSecondCard.getByRole('alert')).toContainText(
            '再印刷が必要です。',
          );
          await expect
            .poll(() => stack.printJobStatuses(2))
            .toEqual(['printed']);

          await page.goto(`/ticket/${secondToken}`);
          await expect(
            page.getByText('10:30〜10:55', { exact: true }),
          ).toBeVisible();
          await page.goto('/admin');
          await page
            .locator(`#ticket-${secondTicketId}`)
            .getByRole('button', {
              name: '現在の予約で再印刷',
            })
            .click();
          await expect
            .poll(() => stack.printJobStatuses(2), { timeout: 30_000 })
            .toEqual(['printed', 'printed']);
        },
      );
    },
  );
});
