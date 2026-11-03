import { stat, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  type E2EPostgresContext,
  withE2EStack,
} from '../../../scripts/e2e-stack.ts';
import { withTemporaryPostgres } from '../../../scripts/embedded-postgres.mjs';

test('ticket queue survives API restart and print/reprint complete', async ({
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

          await page.getByLabel('人数').fill('2');
          await page.getByRole('button', { name: '発券する' }).click();
          await expect(page.getByRole('status')).toHaveText(
            '1番を発券しました。',
          );
          await page.getByRole('button', { name: '発券する' }).click();
          await expect(page.getByRole('status')).toHaveText(
            '2番を発券しました。',
          );
          await expect
            .poll(() => stack.printJobStatuses(1))
            .toEqual(['queued']);
          await expect
            .poll(() => stack.printJobStatuses(2))
            .toEqual(['queued']);

          await stack.restartApi();
          await page.reload();
          const waiting = page.getByRole('region', { name: '待機中' });
          await expect(waiting.getByText('1番', { exact: true })).toBeVisible();
          await expect(waiting.getByText('2番', { exact: true })).toBeVisible();

          const token = await stack.ticketToken(1);
          await waiting.getByRole('button', { name: '呼出' }).first().click();
          await expect(
            page.getByRole('region', { name: '呼出中' }).getByText('1番', {
              exact: true,
            }),
          ).toBeVisible();
          await page.goto(`/ticket/${token}`);
          await expect(
            page.getByRole('heading', { name: 'あなたの番号' }),
          ).toBeVisible();
          await expect(
            page.getByText('あなたの番号をお呼びしています'),
          ).toBeVisible();

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
          await stack.stopAgent();

          await page.goto('/admin');
          const called = page.getByRole('region', { name: '呼出中' });
          await called
            .getByRole('button', { name: '印刷状態・再印刷' })
            .click();
          await expect(called.getByText('印刷済み').first()).toBeVisible();
          await called.getByRole('button', { name: '再印刷' }).click();
          await expect
            .poll(() => stack.printJobStatuses(1))
            .toEqual(['printed', 'queued']);

          stack.startAgent();
          await expect
            .poll(() => stack.printJobStatuses(1), { timeout: 30_000 })
            .toEqual(['printed', 'printed']);
          expect((await stat(stack.devicePath)).size).toBeGreaterThan(0);
        },
      );
    },
  );
});
