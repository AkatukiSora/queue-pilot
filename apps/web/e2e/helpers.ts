import { expect, type Page } from '@playwright/test';

/** 時刻行 × 機材列のセル。ヘッダーの機材名から列位置を求める。 */
export async function slotCell(page: Page, time: string, equipment: string) {
  const headers = await page
    .getByRole('columnheader')
    .allTextContents()
    .then((names) => names.map((name) => name.trim()));
  const column = headers.indexOf(equipment) - 1;
  if (column < 0) {
    throw new Error(`Equipment column ${equipment} not found in ${headers}.`);
  }
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: time, exact: true }) })
    .getByRole('cell')
    .nth(column);
}

/** 空き枠から発券し、発券された番号を返す。途中枠なら確認ダイアログを accept する。 */
export async function issueAt(
  page: Page,
  time: string,
  equipment: string,
  { midSlot = false }: { midSlot?: boolean } = {},
): Promise<number> {
  const dialog = midSlot
    ? page.waitForEvent('dialog').then(async (d) => {
        expect(d.message()).toContain('延長されません');
        await d.accept();
      })
    : undefined;
  const status = page
    .getByRole('status')
    .filter({ hasText: '番を発券しました。' });
  const previous = (await status.allTextContents())[0];
  const cell = await slotCell(page, time, equipment);
  await cell.getByRole('button', { name: '空き・発券' }).click();
  await dialog;
  await expect(status).toBeVisible();
  if (previous !== undefined) await expect(status).not.toHaveText(previous);
  const text = (await status.textContent()) ?? '';
  const number = /(\d+)番を発券しました。/.exec(text)?.[1];
  if (number === undefined) throw new Error(`Unexpected status: ${text}`);
  return Number(number);
}

/** 折りたたみ表示 (<details>) の整理券セクション。 */
export function collapsedSection(page: Page, title: string) {
  return page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: title }) });
}

/** 番号から整理券カードを得る。<details> に畳まれていれば開く。 */
export async function ticketCard(page: Page, number: number) {
  const card = page
    .locator('[id^="ticket-"]')
    .filter({ has: page.getByText(`${number}番`, { exact: true }) })
    .first();
  await expect(card).toBeAttached();
  const details = card.locator('xpath=ancestor::details');
  if (
    (await details.count()) > 0 &&
    !(await details.evaluate((el) => (el as HTMLDetailsElement).open))
  ) {
    await details.locator('summary').first().click();
  }
  return card;
}
