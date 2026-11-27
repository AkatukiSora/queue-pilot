import { e2eFixedTime, expect, test } from './fixtures.ts';

// API (mock issuer / API の E2E_FIXED_TIME) とブラウザの時計を同じ基準時刻に固定する。
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(e2eFixedTime);
});

const PREFIX = '/api/auth/queue-pilot';

test('manage lists my tenants (real API)', async ({ page, signIn }) => {
  await signIn('e2e-admin', '/manage');
  await expect(page.getByRole('heading', { name: 'テナント' })).toBeVisible();
  await expect(page.getByText('Default tenant')).toBeVisible();
  await expect(page.getByText('Sample tenant')).toBeVisible();
  // 所属していない tenant は一覧に出ない。
  await expect(page.getByText('Private tenant')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: '新しいテナントを登録' }),
  ).toBeVisible();
});

test('signup shows no registration form when registration is off or the identity is denied (mocked policy)', async ({
  page,
  signIn,
}) => {
  // E2E の mock issuer は GitHub ではないため、本物の policy API は常に 401。
  // 表示の分岐は policy 応答を差し替えて確認する。
  await signIn('e2e-admin', '/manage');
  await expect(page.getByText('Default tenant')).toBeVisible();
  let policy: Record<string, unknown> = {
    enabled: false,
    policy: 'closed',
    eligible: false,
    reason: 'registration_disabled',
    maxPerUser: 1,
    remainingForUser: 0,
  };
  await page.route(`**${PREFIX}/registration-policy`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(policy),
    }),
  );

  await page.goto('/signup');
  await expect(page.getByText('新規登録は受け付けていません')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);

  policy = {
    ...policy,
    enabled: true,
    policy: 'allowlist',
    reason: 'not_allowlisted',
  };
  await page.goto('/signup');
  await expect(
    page.getByText('この GitHub アカウントは登録を許可されていません'),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'テナントを作成' }),
  ).toHaveCount(0);
});

test('another tenant and a staff-only tenant are refused by the server', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/manage');
  await expect(page.getByText('Default tenant')).toBeVisible();

  // e2e-admin は private-tenant の member ではない: 存在を明かさない 404。
  const other = page.waitForResponse((response) =>
    response.url().includes(`${PREFIX}/t/private-tenant`),
  );
  await page.goto('/t/private-tenant/manage');
  expect((await other).status()).toBe(404);
  await expect(page.getByText('見つかりません')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
  await expect(page.getByText('Secret event')).toHaveCount(0);

  // sample-tenant では staff: 管理 API は 403。
  const staffOnly = page.waitForResponse((response) =>
    response.url().includes(`${PREFIX}/t/sample-tenant`),
  );
  await page.goto('/t/sample-tenant/manage');
  expect((await staffOnly).status()).toBe(403);
  await expect(page.getByText('この画面を開く権限がありません')).toBeVisible();

  // event 設定も同様 (別 tenant の event slug は 404)。
  const otherEvent = page.waitForResponse((response) =>
    response.url().includes(`${PREFIX}/t/private-tenant/events/secret`),
  );
  await page.goto('/t/private-tenant/e/secret/manage');
  expect((await otherEvent).status()).toBe(404);
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('event settings render in the event zone, and saving is refused when the deployment is not database-managed', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/solo/manage');
  await expect(page.getByLabel('イベント名')).toHaveValue('Solo event');
  await expect(
    page.getByRole('combobox', { name: /^タイムゾーン/ }),
  ).toHaveValue('America/New_York');
  // 2026-11-03T12:00:00Z は夏時間終了後の EST で 07:00 (Tokyo の 21:00 ではない)。
  await expect(page.getByLabel('開始 (日付)')).toHaveValue('2026-11-03');
  await expect(page.getByLabel('開始 (時刻)')).toHaveValue('07:00');
  await expect(page.getByText('UTC: 2026-11-03T12:00:00.000Z')).toBeVisible();

  await page.getByLabel('イベント名').fill('Solo event (renamed)');
  await page.getByRole('button', { name: '設定を保存' }).click();
  // manifest 運用では Web からの設定変更は 503。サーバーの理由をそのまま示す。
  await expect(
    page.getByText('この環境では Web からの設定変更は有効になっていません。'),
  ).toBeVisible();
});

test('receipt copy edits immediately update a readable preview and wrap long Japanese text', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/solo/manage');
  await page.getByRole('tab', { name: '受付・レシート文言' }).click();

  const preview = page.getByRole('region', { name: 'レシートのプレビュー' });
  await page.getByLabel('レシートのタイトル').fill('文化祭の整理券');
  await expect(
    preview.getByRole('heading', { name: '文化祭の整理券' }),
  ).toBeVisible();

  const guidance = `${'長い日本語の案内を確認する文言。'.repeat(8)}\n受付でお声がけください。`;
  await page.getByLabel('来場時の案内文').fill(guidance);
  const guidanceLine = preview.locator('p').nth(3);
  await expect(guidanceLine).toHaveText(guidance);
  await expect(guidanceLine).toHaveCSS('white-space', 'pre-wrap');
  expect(
    await guidanceLine.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByText(/実機の用紙幅やプリンターの機種によって/),
  ).toBeVisible();
});

test('invalid timezone edits do not crash the mounted schedule panel and DST warnings return after recovery', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/schedule-rules/manage');
  await expect(page.getByLabel('イベント名')).toHaveValue(
    'Schedule rules event',
  );

  await page.getByRole('tab', { name: 'スケジュール' }).click();
  await page.getByLabel('日 1 の日付').fill('2026-11-01');
  await page.getByLabel('最初の枠の開始', { exact: true }).fill('01:30');
  await page.getByRole('tab', { name: '基本' }).click();

  const zone = page.getByRole('combobox', { name: /^タイムゾーン/ });
  await zone.fill('');
  await expect(page.getByLabel('イベント名')).toHaveValue(
    'Schedule rules event',
  );
  await zone.fill('America/');
  await expect(page.getByText(/IANA 名で指定してください/)).toBeVisible();
  await zone.fill('Mars/Olympus');
  await expect(page.getByText(/IANA 名で指定してください/)).toBeVisible();

  await zone.fill('America/New_York');
  await zone.press('Enter');
  await expect(zone).toHaveValue('America/New_York');
  await page.getByRole('tab', { name: 'スケジュール' }).click();
  await expect(
    page.getByText(
      '2026-11-01 の最初の枠 (01:30): 夏時間の切替で2 通りある時刻です。',
    ),
  ).toBeVisible();
});

test('time zone is searched by typing, and the token tab explains agents and setup', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/manage/events/new');
  const zone = page.getByRole('combobox', { name: /^タイムゾーン/ });
  await zone.fill('a');
  expect(await page.getByRole('option').count()).toBeGreaterThan(20);
  const expectActiveOptionVisible = async () => {
    const state = await zone.evaluate((input: HTMLInputElement) => {
      const listbox = document.getElementById(
        input.getAttribute('aria-controls') ?? '',
      );
      const active = document.getElementById(
        input.getAttribute('aria-activedescendant') ?? '',
      );
      if (listbox === null || active === null) return null;
      const listBounds = listbox.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      const visibleTop = listBounds.top + listbox.clientTop;
      const visibleBottom = visibleTop + listbox.clientHeight;
      return {
        focused: document.activeElement === input,
        activeDescendant:
          active.id === input.getAttribute('aria-activedescendant'),
        selected: active.getAttribute('aria-selected') === 'true',
        visible:
          activeBounds.top >= visibleTop &&
          activeBounds.bottom <= visibleBottom,
        scrollTop: listbox.scrollTop,
      };
    });
    expect(state).toMatchObject({
      focused: true,
      activeDescendant: true,
      selected: true,
      visible: true,
    });
    return state;
  };
  await zone.press('ArrowUp');
  expect((await expectActiveOptionVisible())?.scrollTop).toBeGreaterThan(0);
  await zone.press('ArrowDown');
  await expectActiveOptionVisible();
  for (let step = 0; step < 20; step += 1) await zone.press('ArrowDown');
  expect((await expectActiveOptionVisible())?.scrollTop).toBeGreaterThan(0);
  await zone.press('Escape');
  await expect(zone).toHaveAttribute('aria-expanded', 'false');
  await zone.press('ArrowDown');
  await expectActiveOptionVisible();

  await zone.fill('東京');
  await expect(page.getByRole('option', { name: 'Asia/Tokyo' })).toBeVisible();
  const compositionKeyAllowed = await zone.evaluate((input) => {
    input.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    );
    return input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
        keyCode: 229,
      }),
    );
  });
  expect(compositionKeyAllowed).toBe(true);
  await expect(zone).toBeFocused();
  await expect(zone).toHaveValue('東京');
  await expect(page.getByRole('option', { name: 'Asia/Tokyo' })).toBeVisible();
  await zone.evaluate((input) => {
    input.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '東京' }),
    );
  });
  await zone.press('Enter');
  await expect(zone).toHaveValue('Asia/Tokyo');
  await page.goto('/t/default/e/solo/manage');
  await page.getByRole('tab', { name: 'エージェントトークン' }).click();
  await page
    .getByRole('button', { name: 'エージェントトークンの説明' })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('受付 PC');
  await page.getByText('エージェントの入手とセットアップ手順').click();
  await expect(
    page.getByRole('link', { name: 'GitHub Releases' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/AkatukiSora/queue-pilot/releases/latest',
  );
  await expect(
    page.getByRole('link', { name: 'README の「Build and test」節' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/AkatukiSora/queue-pilot/blob/main/apps/print-agent/README.md#build-and-test',
  );
  await expect(
    page.getByText(/プリンター一覧で printerId を確認/),
  ).toBeVisible();
  await expect(
    page.getByText(/発行直後だけ実トークンが入ります/),
  ).toBeVisible();
  await expect(page.getByText('API_BASE_URL')).toBeVisible();
  await expect(page.getByText('AGENT_TOKEN')).toBeVisible();
});

test('signup success then the first-event wizard create a non-Tokyo event (mocked management API)', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/manage');
  await expect(page.getByText('Default tenant')).toBeVisible();

  const created: unknown[] = [];
  await page.route(`**${PREFIX}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const reply = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (pathname === `${PREFIX}/registration-policy`) {
      return reply(200, {
        enabled: true,
        policy: 'allowlist',
        eligible: true,
        reason: null,
        maxPerUser: 1,
        remainingForUser: 1,
      });
    }
    if (pathname === `${PREFIX}/tenants/create`) {
      return reply(201, {
        tenant: {
          id: '30000000-0000-4000-8000-000000000001',
          slug: 'new-club',
          displayName: '新しいクラブ',
          revision: 1,
        },
        role: 'admin',
      });
    }
    if (pathname === `${PREFIX}/t/new-club`) {
      return reply(200, {
        id: '30000000-0000-4000-8000-000000000001',
        slug: 'new-club',
        displayName: '新しいクラブ',
        revision: 1,
        changeConstraints: {
          activeTicketCount: 0,
          activeJobCount: 0,
          canDisable: true,
        },
      });
    }
    if (pathname === `${PREFIX}/t/new-club/events/create`) {
      created.push(request.postDataJSON());
      return reply(201, {
        id: '30000000-0000-4000-8000-000000000002',
        slug: 'expo',
        revision: 'e'.repeat(64),
      });
    }
    return route.fallback();
  });

  await page.goto('/signup');
  await page.getByLabel(/^slug/).fill('new-club');
  await page.getByLabel('表示名').fill('新しいクラブ');
  await page.getByRole('button', { name: 'テナントを作成' }).click();
  await expect(page.getByText('テナントを作成しました')).toBeVisible();
  await page.getByRole('link', { name: '最初のイベントを作成' }).click();
  await page.waitForURL('**/t/new-club/manage/events/new');

  await page.getByLabel(/^イベントの slug/).fill('expo');
  await page.getByLabel('イベント名').fill('Expo');
  await page
    .getByRole('combobox', { name: /^タイムゾーン/ })
    .fill('Pacific/Auckland');
  await page.getByLabel('開始 (日付)').fill('2026-11-03');
  await page.getByLabel('開始 (時刻)').fill('09:00');
  await page.getByLabel('終了 (日付)').fill('2026-11-03');
  await page.getByLabel('終了 (時刻)').fill('17:00');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByLabel(/^機材 1 の ID/).fill('quest-3');
  await page.getByLabel('機材 1 の表示名').fill('Quest 3');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByLabel(/^プリンター 1 の ID/).fill('front-desk');
  await page.getByLabel('プリンター 1 の表示名').fill('受付');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByLabel('既定の最初の枠の開始').fill('09:00');
  await page.getByLabel('既定の最後の枠の開始').fill('16:00');
  await page.getByLabel('期間の終了日').fill('2026-11-05');
  await expect(
    page.getByText(/候補はまだ日付一覧に反映されていません/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '次へ' })).toBeDisabled();
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page.getByLabel('プリンター 1 の表示名')).toHaveValue('受付');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.getByLabel('期間の終了日')).toHaveValue('2026-11-05');
  const preview = page.getByLabel('作成結果のプレビュー');
  await expect(preview).toContainText('2026-11-03 (火) 09:00〜16:00');
  await expect(preview).toContainText('2026-11-04 (水) 09:00〜16:00');
  await expect(preview).toContainText('2026-11-05 (木) 09:00〜16:00');
  await expect(
    page.getByText(/候補はまだ日付一覧に反映されていません/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '次へ' })).toBeDisabled();
  expect(created).toHaveLength(0);
  await page.getByRole('button', { name: '日付の一覧に反映' }).click();
  await expect(
    page.getByRole('heading', { name: '保存対象のプレビュー' }),
  ).toBeVisible();
  await expect(page.getByLabel('日 3 の日付')).toHaveValue('2026-11-05');
  await expect(page.getByRole('button', { name: '次へ' })).toBeEnabled();
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByLabel('レシートのタイトル').fill('整理券');
  await page.getByLabel('来場時の案内文').fill('お越しください');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: 'イベントを作成' }).click();
  await expect(page.getByText('イベントを作成しました')).toBeVisible();

  // Auckland は 2026-11-03 に NZDT (UTC+13)。
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    slug: 'expo',
    config: {
      timeZone: 'Pacific/Auckland',
      startsAt: '2026-11-02T20:00:00.000Z',
      endsAt: '2026-11-03T04:00:00.000Z',
      equipment: [{ id: 'quest-3', label: 'Quest 3' }],
      printers: [{ id: 'front-desk', label: '受付' }],
      defaultPrinterId: 'front-desk',
      schedule: [
        {
          date: '2026-11-03',
          firstStart: '09:00',
          lastStart: '16:00',
          intervalMinutes: 15,
          experienceMinutes: 10,
          turnoverMinutes: 5,
        },
        {
          date: '2026-11-04',
          firstStart: '09:00',
          lastStart: '16:00',
          intervalMinutes: 15,
          experienceMinutes: 10,
          turnoverMinutes: 5,
        },
        {
          date: '2026-11-05',
          firstStart: '09:00',
          lastStart: '16:00',
          intervalMinutes: 15,
          experienceMinutes: 10,
          turnoverMinutes: 5,
        },
      ],
    },
  });
});

test('schedule rules expand across a DST change, preview before saving, and block a body over 16 KiB (real API, mocked save)', async ({
  page,
  signIn,
}) => {
  await signIn('e2e-admin', '/t/default/e/schedule-rules/manage');
  await expect(page.getByLabel('イベント名')).toHaveValue(
    'Schedule rules event',
  );
  const saved: unknown[] = [];
  await page.route(
    `**${PREFIX}/t/default/events/schedule-rules/update`,
    (route) => {
      saved.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '30000000-0000-4000-8000-000000000003',
          slug: 'schedule-rules',
          revision: 'f'.repeat(64),
        }),
      });
    },
  );

  await page.getByRole('tab', { name: 'スケジュール' }).click();
  // 保存済みの日と時間帯が既定の入力に引き継がれている。
  await expect(page.getByLabel('日 1 の日付')).toHaveValue('2026-11-03');
  await expect(page.getByLabel('既定の最初の枠の開始')).toHaveValue('09:00');

  // 2026-11-01 (日) に America/New_York の夏時間が終わる。日曜は休み。
  await page.getByLabel('期間の開始日').fill('2026-10-30');
  await page.getByLabel('期間の終了日').fill('2026-11-03');
  await page.getByLabel('日曜日').selectOption('off');
  const preview = page.getByLabel('作成結果のプレビュー');
  await expect(preview.getByText(/^4 日分/)).toBeVisible();
  await expect(preview).toContainText('2026-10-30 (金)');
  await expect(preview).toContainText('2026-11-02 (月)');
  await expect(preview).not.toContainText('2026-11-01');
  await expect(preview).toContainText('追加 3 日 / 変更 0 日 / 削除 0 日');

  await page.getByRole('button', { name: '日付の一覧に反映' }).click();
  await expect(page.getByLabel('日 4 の日付')).toHaveValue('2026-11-03');
  await page
    .getByLabel('最初の枠の開始', { exact: true })
    .first()
    .fill('08:30');
  await page.getByRole('button', { name: '設定を保存' }).click();
  await expect(page.getByText('設定を保存しました。')).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(
    (
      saved[0] as {
        config: { schedule: { date: string; firstStart: string }[] };
      }
    ).config.schedule.map((day) => `${day.date} ${day.firstStart}`),
  ).toEqual([
    '2026-10-30 08:30',
    '2026-10-31 09:00',
    '2026-11-02 09:00',
    '2026-11-03 09:00',
  ]);

  // 1 年分は設定 body の上限 (16 KiB) を超えるため、保存前に理由が出て反映できない。
  await page.getByLabel('期間の開始日').fill('2026-01-01');
  await page.getByLabel('期間の終了日').fill('2026-12-31');
  await expect(preview.getByText(/16 KiB/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '日付の一覧に反映' }),
  ).toBeDisabled();
});
