import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draftToConfig, emptyEventDraft } from './event-config.ts';
import { EventManage } from './event-manage.tsx';
import { EventWizard } from './event-wizard.tsx';
import { bodyBytes } from './schedule-rules.ts';
import { ScheduleRulesPanel } from './schedule-rules-panel.tsx';
import {
  type Call,
  eventResponse,
  json,
  mountScreen,
  PREFIX,
  posts,
  tokyoConfig,
} from './test-harness.tsx';

const E = `${PREFIX}/t/acme/events/fest`;
const handler = (get: () => unknown) => (call: Call) => {
  if (call.path === E) return json(200, get());
  if (call.path === `${E}/update`)
    return json(200, { id: 'x', slug: 'fest', revision: 'b'.repeat(64) });
  if (call.path.startsWith(`${PREFIX}/t/acme/audit`))
    return json(200, { entries: [], nextCursor: null });
  if (call.path === '/api/v3/csrf') return json(200, { token: 't' });
  return undefined;
};
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openSchedule = async () => {
  await screen.findByLabelText('イベント名');
  fireEvent.click(screen.getByRole('tab', { name: 'スケジュール' }));
};
const nextButton = () =>
  screen.getByRole('button', { name: '次へ' }) as HTMLButtonElement;

describe('ScheduleRulesPanel', () => {
  it('measures a create preview against the actual slug-bearing request body', () => {
    const draft = {
      ...emptyEventDraft('Asia/Tokyo'),
      title: 'Expo',
      start: { date: '2026-11-03', time: '09:00' },
      end: { date: '2026-11-03', time: '17:00' },
      schedule: [
        {
          date: '2026-11-03',
          firstStart: '09:00',
          lastStart: '12:00',
          experienceMinutes: '10',
          turnoverMinutes: '5',
        },
      ],
    };
    const converted = draftToConfig(draft);
    if (!converted.ok) throw new Error('expected a valid draft');
    const bytes = bodyBytes({ slug: 'expo', config: converted.config });

    render(
      <ScheduleRulesPanel
        draft={draft}
        update={() => {}}
        saveEnvelope={{ kind: 'create', slug: 'expo' }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(`${bytes} バイト`);
  });

  it('opens a saved event with its day list intact', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() => eventResponse()),
    );
    await openSchedule();
    expect(
      (screen.getByLabelText('日 1 の日付') as HTMLInputElement).value,
    ).toBe('2026-11-03');
    expect(
      (screen.getByLabelText('最初の枠の開始') as HTMLInputElement).value,
    ).toBe('10:00');
    // 期間と既定は保存済みの event から初期化される。
    expect(
      (screen.getByLabelText('期間の開始日') as HTMLInputElement).value,
    ).toBe('2026-11-03');
    expect(
      (screen.getByLabelText('既定の最後の枠の開始') as HTMLInputElement).value,
    ).toBe('14:00');
    expect(
      screen.getByRole('heading', { name: '保存対象のプレビュー' }),
    ).toBeTruthy();
    expect(
      screen.getByText('既定の枠の間隔: 15 分 (体験時間 + 入替時間)'),
    ).toBeTruthy();
    expect(screen.getByLabelText('作成結果のプレビュー').textContent).toContain(
      '2026-11-03 (火) 10:00〜14:00',
    );
  });

  it('previews the generated days, shows the diff, then saves exactly the previewed days', async () => {
    const calls = mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() => eventResponse()),
    );
    await openSchedule();
    change('イベント名', '文化祭のテスト');
    change('期間の終了日', '2026-11-09');
    fireEvent.change(screen.getByLabelText('日曜日'), {
      target: { value: 'off' },
    });
    fireEvent.change(screen.getByLabelText('土曜日'), {
      target: { value: 'custom' },
    });
    change('土曜日の最初の枠の開始', '09:00');
    fireEvent.click(screen.getByRole('button', { name: '例外を追加' }));
    change('例外 1 の日付', '2026-11-05');
    // 11-03 (火) から 11-09 (月)。日曜 11-08 は休み、11-05 は休みの例外。
    expect(await screen.findByText(/^5 日分/)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'ルールから生成する候補' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/候補はまだ日付一覧に反映されていません/),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '設定を保存' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText(/追加 4 日 \/ 変更 0 日 \/ 削除 0 日/),
    ).toBeTruthy();
    const preview = screen.getByLabelText('作成結果のプレビュー');
    expect(preview.textContent).not.toContain('2026-11-08');
    expect(preview.textContent).not.toContain('2026-11-05');
    expect(preview.textContent).toContain('2026-11-07 (土) 09:00〜16:00');

    fireEvent.click(screen.getByRole('button', { name: '日付の一覧に反映' }));
    expect(
      screen.getByRole('heading', { name: '保存対象のプレビュー' }),
    ).toBeTruthy();
    expect(
      screen.queryByText(/候補はまだ日付一覧に反映されていません/),
    ).toBeNull();
    expect(
      (screen.getByRole('button', { name: '設定を保存' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.getByLabelText('日 5 の日付')).toBeTruthy();
    // 個別に 1 日だけ微調整できる。
    fireEvent.change(
      screen.getAllByLabelText('最初の枠の開始')[1] as HTMLElement,
      { target: { value: '09:30' } },
    );
    expect(preview.textContent).toContain('2026-11-04 (水) 09:30〜14:00');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    await waitFor(() => expect(posts(calls, '/update')).toHaveLength(1));
    const body = posts(calls, '/update')[0]?.body as {
      config: { schedule: { date: string; firstStart: string }[] };
    };
    expect(
      body.config.schedule.map((day) => `${day.date} ${day.firstStart}`),
    ).toEqual([
      '2026-11-03 10:00',
      '2026-11-04 09:30',
      '2026-11-06 10:00',
      '2026-11-07 09:00',
      '2026-11-09 10:00',
    ]);
  });

  it('refuses to apply a range whose body would exceed 16 KiB', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() => eventResponse()),
    );
    await openSchedule();
    change('期間の開始日', '2026-01-01');
    change('期間の終了日', '2026-12-31');
    expect(await screen.findByText(/16 KiB/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: '日付の一覧に反映',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('hides the generator while the schedule is frozen by issued tickets', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() =>
        eventResponse(
          { config: tokyoConfig },
          {
            ticketCount: 2,
            structuralFrozen: true,
            frozenFields: ['schedule'],
          },
        ),
      ),
    );
    await openSchedule();
    expect(screen.queryByLabelText('期間の開始日')).toBeNull();
    expect(
      (screen.getByLabelText('日 1 の日付') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('survives an empty, partial or invalid time zone while editing and recovers on a valid one', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() => eventResponse()),
    );
    await screen.findByLabelText('イベント名');
    const zone = screen.getByRole('combobox', { name: /^タイムゾーン/ });
    for (const typed of ['', 'Asia/', 'Mars/Olympus']) {
      fireEvent.change(zone, { target: { value: typed } });
      expect(screen.getByLabelText('イベント名')).toBeTruthy();
    }
    expect(screen.getByText(/IANA 名で指定してください/)).toBeTruthy();
    fireEvent.change(zone, { target: { value: 'America/New_York' } });
    expect(screen.queryByText(/IANA 名で指定してください/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'スケジュール' }));
    fireEvent.change(screen.getByLabelText('日 1 の日付'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('最初の枠の開始'), {
      target: { value: '01:30' },
    });
    expect(screen.getByText(/夏時間の切替で2 通りある時刻です/)).toBeTruthy();
  });

  it('keeps an unapplied wizard rule edit, its candidate and the pending state across back and next, then creates only that candidate', async () => {
    const calls = mountScreen(<EventWizard tenantSlug="acme" />, (call) => {
      if (call.path === `${PREFIX}/t/acme`)
        return json(200, {
          id: 'tenant',
          slug: 'acme',
          displayName: 'Acme',
          revision: 1,
          changeConstraints: {
            activeTicketCount: 0,
            activeJobCount: 0,
            canDisable: true,
          },
        });
      if (call.path === `${PREFIX}/t/acme/events/create`)
        return json(201, { id: 'e', slug: 'expo', revision: 'd'.repeat(64) });
      return undefined;
    });
    await screen.findByLabelText(/^イベントの slug/);
    change(/^イベントの slug/, 'expo');
    change('イベント名', 'Expo');
    change('開始 (日付)', '2026-11-01');
    change('終了 (日付)', '2026-11-01');
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^機材 1 の ID/), {
      target: { value: 'device' },
    });
    change('機材 1 の表示名', 'Device');
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^プリンター 1 の ID/), {
      target: { value: 'printer' },
    });
    change('プリンター 1 の表示名', 'Printer');
    fireEvent.click(nextButton());

    change('期間の終了日', '2026-11-02');
    expect(nextButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    fireEvent.click(nextButton());

    expect(
      (screen.getByLabelText('期間の終了日') as HTMLInputElement).value,
    ).toBe('2026-11-02');
    expect(
      screen.getByRole('heading', { name: 'ルールから生成する候補' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('作成結果のプレビュー').textContent).toContain(
      '2026-11-02',
    );
    expect(nextButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '日付の一覧に反映' }));
    expect(nextButton().disabled).toBe(false);
    fireEvent.click(nextButton());
    change('レシートのタイトル', '整理券');
    change('来場時の案内文', 'お越しください');
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole('button', { name: 'イベントを作成' }));
    await waitFor(() => expect(posts(calls, '/events/create')).toHaveLength(1));
    const body = posts(calls, '/events/create')[0]?.body as {
      config: { schedule: { date: string }[] };
    };
    expect(body.config.schedule.map((day) => day.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});
