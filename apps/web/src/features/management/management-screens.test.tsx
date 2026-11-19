import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '../../api/query-client.ts';
import { EventManage } from './event-manage.tsx';
import { EventWizard } from './event-wizard.tsx';
import { ManageHome } from './manage-home.tsx';
import { MembersScreen } from './members-screen.tsx';
import { TenantManage } from './tenant-manage.tsx';
import {
  apiError,
  type Call,
  eventResponse,
  json,
  mountScreen,
  PREFIX,
  posts,
  tokyoConfig,
} from './test-harness.tsx';

const T = `${PREFIX}/t/acme`;
const tenant = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  displayName: 'Acme',
  revision: 3,
  changeConstraints: {
    activeTicketCount: 0,
    activeJobCount: 0,
    canDisable: true,
  },
  ...overrides,
});
const gets = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith(path));
const change = (label: string | RegExp | HTMLElement, value: string) =>
  fireEvent.change(
    label instanceof HTMLElement ? label : screen.getByLabelText(label),
    { target: { value } },
  );

describe('ManageHome', () => {
  it('lists a tenant with zero events and offers the first-event wizard to admins only', async () => {
    mountScreen(<ManageHome />, (call) =>
      call.path === `${PREFIX}/tenants`
        ? json(200, {
            tenants: [
              {
                id: 'a',
                slug: 'mine',
                displayName: '自分',
                role: 'admin',
                revision: 1,
                events: [],
              },
              {
                id: 'b',
                slug: 'theirs',
                displayName: '他人',
                role: 'staff',
                revision: 1,
                events: [],
              },
            ],
          })
        : undefined,
    );
    expect(await screen.findByText('自分')).toBeTruthy();
    expect(screen.getAllByText('イベントはまだありません。')).toHaveLength(2);
    const links = screen.getAllByRole('link', { name: '最初のイベントを作成' });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/t/mine/manage/events/new');
    expect(
      screen.getByRole('link', { name: '新しいテナントを登録' }),
    ).toBeTruthy();
  });
});

describe('TenantManage', () => {
  const handler =
    (extra?: (call: Call) => Response | undefined) => (call: Call) =>
      extra?.(call) ??
      (call.path === T
        ? json(200, tenant())
        : call.path === `${T}/events`
          ? json(200, { events: [] })
          : call.path.startsWith(`${T}/audit`)
            ? json(200, {
                entries: [
                  {
                    id: '44444444-4444-4444-8444-444444444444',
                    occurredAt: '2026-11-03T01:05:00.000Z',
                    action: 'tenant.update',
                    resourceType: 'tenant',
                    resourceId: 'x',
                    eventId: null,
                    actorKind: 'user',
                    actorUserId: null,
                    origin: 'web',
                    revisionBefore: 2,
                    revisionAfter: 3,
                    before: { displayName: 'Old' },
                    after: { displayName: 'Acme' },
                  },
                ],
                nextCursor: null,
              })
            : undefined);

  it('shows the empty event list, audit entries (browser-local time) and tenant settings', async () => {
    mountScreen(<TenantManage tenantSlug="acme" />, handler());
    expect(
      await screen.findByText(/イベントはまだありません。「イベントを作成」/),
    ).toBeTruthy();
    expect(await screen.findByText('tenant.update')).toBeTruthy();
    // ブラウザの timezone (テストでは UTC) で 2026-11-03 01:05 として表示する。
    expect(screen.getByText(/2026\/11\/03 01:05:00 UTC/)).toBeTruthy();
    expect(screen.getByDisplayValue('Acme')).toBeTruthy();
  });

  it('does not overwrite on a stale save: shows the reason and reloads only on request', async () => {
    let current = tenant();
    const calls = mountScreen(
      <TenantManage tenantSlug="acme" />,
      handler((call) => {
        if (call.path === T) return json(200, current);
        if (call.path === `${T}/update`)
          return apiError(409, 'revision_conflict');
        return undefined;
      }),
    );
    const input = await screen.findByDisplayValue('Acme');
    fireEvent.change(input, { target: { value: '私の変更' } });
    current = tenant({ displayName: '他の人の変更', revision: 4 });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(
      await screen.findByText(/他の操作で内容が更新されています/),
    ).toBeTruthy();
    expect(posts(calls, '/update')[0]?.body).toEqual({
      expectedRevision: 3,
      displayName: '私の変更',
    });
    // 自動では再取得も再送もしない。入力中の値はそのまま。
    expect(gets(calls, T).filter((call) => call.path === T)).toHaveLength(1);
    expect(screen.getByDisplayValue('私の変更')).toBeTruthy();
    expect(posts(calls, '/update')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '最新を読み込む' }));
    expect(await screen.findByDisplayValue('他の人の変更')).toBeTruthy();
  });

  it('explains why the tenant cannot be disabled while work is active', async () => {
    mountScreen(
      <TenantManage tenantSlug="acme" />,
      handler((call) =>
        call.path === T
          ? json(
              200,
              tenant({
                changeConstraints: {
                  activeTicketCount: 2,
                  activeJobCount: 1,
                  canDisable: false,
                },
              }),
            )
          : undefined,
      ),
    );
    expect(
      await screen.findByText(/有効な整理券 2 件、印刷待ち・印刷中のジョブ 1/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'テナントを無効化',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('downloads the configuration export', async () => {
    const created = vi.fn(() => 'blob:export');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: created,
        revokeObjectURL: vi.fn(),
      }),
    );
    const calls = mountScreen(
      <TenantManage tenantSlug="acme" />,
      handler((call) =>
        call.path === `${T}/export`
          ? json(200, {
              configurationExportVersion: 1,
              tenant: {},
              members: [],
              events: [],
            })
          : undefined,
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '設定をエクスポート (JSON)' }),
    );
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(gets(calls, `${T}/export`)).toHaveLength(1);
  });

  it.each([
    [403, /管理者である必要があります/],
    [404, /存在しないか、アクセスできません/],
  ] as const)(
    'shows a server %s for another tenant without rendering settings',
    async (status, text) => {
      mountScreen(<TenantManage tenantSlug="other" />, () =>
        apiError(status, status === 403 ? 'forbidden' : 'not_found'),
      );
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    },
  );

  it('invalidates both scope lists without refetching the disabled tenant', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(['management', 'tenants'], []);
    queryClient.setQueryData(['member-events'], []);
    const calls = mountScreen(
      <TenantManage tenantSlug="acme" />,
      (call) => {
        if (call.path === T) return json(200, tenant());
        if (call.path === `${T}/events`) return json(200, { events: [] });
        if (call.path.startsWith(`${T}/audit`))
          return json(200, { entries: [], nextCursor: null });
        if (call.path === `${T}/disable`) return json(200, { revision: 4 });
        return undefined;
      },
      queryClient,
    );
    await screen.findByDisplayValue('Acme');
    fireEvent.change(screen.getByLabelText('確認のため「acme」と入力'), {
      target: { value: 'acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'テナントを無効化' }));
    await screen.findByText('テナントを無効化しました。');

    expect(
      queryClient.getQueryState(['management', 'tenants'])?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(['member-events'])?.isInvalidated).toBe(
      true,
    );
    expect(posts(calls, '/disable')).toHaveLength(1);
    expect(gets(calls, T).filter((call) => call.path === T)).toHaveLength(1);
    expect(
      gets(calls, T).filter((call) => call.path === `${T}/events`),
    ).toHaveLength(1);
  });

  it('hides cached event actions and audit entries after a terminal refetch error', async () => {
    const queryClient = createAppQueryClient();
    let eventReads = 0;
    let auditReads = 0;
    mountScreen(
      <TenantManage tenantSlug="acme" />,
      (call) => {
        if (call.path === T) return json(200, tenant());
        if (call.path === `${T}/events`) {
          eventReads += 1;
          return eventReads === 1
            ? json(200, { events: [] })
            : apiError(404, 'not_found');
        }
        if (call.path.startsWith(`${T}/audit`)) {
          auditReads += 1;
          return auditReads === 1
            ? json(200, {
                entries: [
                  {
                    id: 'audit-id',
                    occurredAt: '2026-11-03T01:05:00.000Z',
                    action: 'stale.audit',
                    resourceType: 'tenant',
                    resourceId: 'x',
                    eventId: null,
                    actorKind: 'user',
                    actorUserId: null,
                    origin: 'web',
                    revisionBefore: 1,
                    revisionAfter: 2,
                    before: null,
                    after: null,
                  },
                ],
                nextCursor: null,
              })
            : apiError(404, 'not_found');
        }
        return undefined;
      },
      queryClient,
    );
    await screen.findByRole('link', { name: 'イベントを作成' });
    await screen.findByText('stale.audit');

    await queryClient.refetchQueries({
      queryKey: ['management', 'events', 'acme'],
    });
    await queryClient.refetchQueries({
      queryKey: ['management', 'audit', 'acme'],
    });

    expect(eventReads).toBe(2);
    expect(auditReads).toBe(2);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'イベントを作成' })).toBeNull(),
    );
    expect(screen.queryByText('stale.audit')).toBeNull();
    expect(
      screen.getAllByRole('link', { name: 'テナント一覧へ戻る' }),
    ).toHaveLength(2);
  });

  it.each([403, 404] as const)(
    'hides cached tenant settings after a %s refetch error',
    async (status) => {
      const queryClient = createAppQueryClient();
      let tenantReads = 0;
      const calls = mountScreen(
        <TenantManage tenantSlug="acme" />,
        (call) => {
          if (call.path === T) {
            tenantReads += 1;
            return tenantReads === 1
              ? json(200, tenant())
              : apiError(status, status === 403 ? 'forbidden' : 'not_found');
          }
          if (call.path === `${T}/events`) return json(200, { events: [] });
          if (call.path.startsWith(`${T}/audit`))
            return json(200, { entries: [], nextCursor: null });
          return undefined;
        },
        queryClient,
      );
      await screen.findByDisplayValue('Acme');
      await queryClient.refetchQueries({
        queryKey: ['management', 'tenant', 'acme'],
      });

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByText('基本設定')).toBeNull();
      expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'テナントを無効化' }),
      ).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
      expect(gets(calls, T).filter((call) => call.path === T)).toHaveLength(2);
    },
  );
});

describe('MembersScreen', () => {
  const member = (subject: string, role: 'admin' | 'staff', extra = {}) => ({
    issuer: 'https://github.com',
    subject,
    role,
    disabled: false,
    self: false,
    ...extra,
  });
  const base = (call: Call) =>
    call.path === `${T}/members`
      ? json(200, {
          revision: 7,
          members: [
            member('1001', 'admin', { self: true }),
            member('1002', 'staff'),
          ],
        })
      : undefined;

  it.each([403, 404] as const)(
    'hides member controls on an initial %s scope error',
    async (status) => {
      mountScreen(<MembersScreen tenantSlug="acme" />, () =>
        apiError(status, status === 403 ? 'forbidden' : 'not_found'),
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByLabelText('GitHub のユーザー名')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'ユーザーを確認' }),
      ).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
    },
  );

  it('shows the server reason when the last admin is changed', async () => {
    const calls = mountScreen(<MembersScreen tenantSlug="acme" />, (call) =>
      call.path.endsWith('/members/disable')
        ? apiError(409, 'last_admin')
        : base(call),
    );
    const row = await screen.findByTestId('member-1001');
    fireEvent.click(within(row).getByRole('button', { name: '無効化' }));
    expect(
      await screen.findByText(/最後の有効な管理者は、降格も無効化もできません/),
    ).toBeTruthy();
    expect(posts(calls, '/members/disable')[0]?.body).toEqual({
      expectedRevision: 7,
      subject: '1001',
    });
  });

  it('confirms the resolved GitHub account before adding it', async () => {
    const calls = mountScreen(<MembersScreen tenantSlug="acme" />, (call) => {
      if (call.path.endsWith('/members/resolve')) {
        return json(200, {
          subject: '2002',
          login: 'octo',
          displayName: 'Octo Cat',
        });
      }
      if (call.path.endsWith('/members/upsert'))
        return json(200, { revision: 8 });
      return base(call);
    });
    await screen.findByTestId('member-1001');
    change('GitHub のユーザー名', ' octo ');
    fireEvent.click(
      await screen.findByRole('button', { name: 'ユーザーを確認' }),
    );
    expect(await screen.findByText('Octo Cat')).toBeTruthy();
    expect(posts(calls, '/members/resolve')[0]?.body).toEqual({
      githubLogin: 'octo',
    });
    // 確認するまで追加は送られない。
    expect(posts(calls, '/members/upsert')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'スタッフとして追加' }));
    await waitFor(() =>
      expect(posts(calls, '/members/upsert')).toHaveLength(1),
    );
    expect(posts(calls, '/members/upsert')[0]?.body).toEqual({
      expectedRevision: 7,
      subject: '2002',
      role: 'staff',
    });
  });

  it('shows an unknown GitHub user and an upstream outage', async () => {
    let outcome = apiError(400, 'member_not_found');
    mountScreen(<MembersScreen tenantSlug="acme" />, (call) =>
      call.path.endsWith('/members/resolve') ? outcome : base(call),
    );
    await screen.findByTestId('member-1001');
    change('GitHub のユーザー名', 'nobody');
    fireEvent.click(
      await screen.findByRole('button', { name: 'ユーザーを確認' }),
    );
    expect(await screen.findByText(/見つかりません/)).toBeTruthy();
    outcome = apiError(503, 'upstream_unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'ユーザーを確認' }));
    expect(
      await screen.findByText(/GitHub に接続できませんでした/),
    ).toBeTruthy();
  });

  it.each([
    [
      'flat Better Auth token error',
      400,
      '{"message":"Account not found","code":"ACCOUNT_NOT_FOUND"}',
      'application/json',
      {},
      /GitHub の連携情報を確認できませんでした/,
    ],
    [
      'application rate limit',
      429,
      '{"message":"Too many requests"}',
      'application/json',
      { 'X-Retry-After': '60' },
      /操作が多すぎます。60 秒ほど待ってから再試行してください/,
    ],
    [
      'GitHub rate limit',
      503,
      '{"error":{"code":"github_rate_limited","message":"raw"}}',
      'application/json',
      { 'Retry-After': '75' },
      /GitHub の利用制限に達しました。75 秒ほど待ってから再試行してください/,
    ],
    [
      'HTML gateway error',
      502,
      '<html>Bad Gateway</html>',
      'text/html',
      {},
      /サービスを一時的に利用できません/,
    ],
    [
      'invalid JSON gateway error',
      502,
      '{broken',
      'application/json',
      {},
      /サービスを一時的に利用できません/,
    ],
  ] as const)(
    'shows %s without claiming that a member was confirmed',
    async (_label, status, body, contentType, extraHeaders, expected) => {
      const calls = mountScreen(<MembersScreen tenantSlug="acme" />, (call) =>
        call.path.endsWith('/members/resolve')
          ? new Response(body, {
              status,
              headers: { 'Content-Type': contentType, ...extraHeaders },
            })
          : base(call),
      );
      await screen.findByTestId('member-1001');
      change('GitHub のユーザー名', 'octo');
      fireEvent.click(screen.getByRole('button', { name: 'ユーザーを確認' }));
      expect(await screen.findByText(expected)).toBeTruthy();
      expect(posts(calls, '/members/upsert')).toHaveLength(0);
      expect(screen.queryByText('Octo Cat')).toBeNull();
    },
  );

  it('labels an actual fetch rejection as a network failure on the member screen', async () => {
    const calls = mountScreen(<MembersScreen tenantSlug="acme" />, (call) => {
      if (call.path.endsWith('/members/resolve')) {
        throw new TypeError('fetch failed');
      }
      return base(call);
    });
    await screen.findByTestId('member-1001');
    change('GitHub のユーザー名', 'octo');
    fireEvent.click(screen.getByRole('button', { name: 'ユーザーを確認' }));
    expect(
      await screen.findByText(
        /通信に失敗しました。ネットワークを確認して再試行してください/,
      ),
    ).toBeTruthy();
    expect(posts(calls, '/members/upsert')).toHaveLength(0);
  });

  it.each([403, 404] as const)(
    'hides cached member controls after a %s refetch error',
    async (status) => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(['management', 'members', 'acme'], {
        revision: 7,
        members: [member('1001', 'admin', { self: true })],
      });
      const calls = mountScreen(
        <MembersScreen tenantSlug="acme" />,
        (call) =>
          call.path === `${T}/members`
            ? apiError(status, status === 403 ? 'forbidden' : 'not_found')
            : undefined,
        queryClient,
      );
      await screen.findByTestId('member-1001');

      await queryClient.refetchQueries({
        queryKey: ['management', 'members', 'acme'],
      });

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByTestId('member-1001')).toBeNull();
      expect(screen.queryByLabelText('GitHub のユーザー名')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'ユーザーを確認' }),
      ).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
      expect(gets(calls, `${T}/members`)).toHaveLength(1);
    },
  );
});

describe('EventManage', () => {
  const E = `${T}/events/fest`;
  const agentsPath = '/api/v3/t/acme/e/fest/agents';
  const handler =
    (get: () => unknown, extra?: (call: Call) => Response | undefined) =>
    (call: Call) => {
      const own = extra?.(call);
      if (own !== undefined) return own;
      if (call.path === E) return json(200, get());
      if (call.path.startsWith(`${T}/audit`))
        return json(200, { entries: [], nextCursor: null });
      if (call.path === '/api/v3/csrf') return json(200, { token: 't' });
      if (call.path === '/api/v3/events') {
        return json(200, {
          events: [
            {
              tenantId: 't',
              tenantSlug: 'acme',
              tenantName: 'Acme',
              role: 'admin',
              eventId: 'e',
              eventSlug: 'fest',
              eventTitle: 'Fest',
              timeZone: 'Asia/Tokyo',
            },
          ],
        });
      }
      if (call.path === agentsPath && call.method === 'GET')
        return json(200, { agents: [] });
      return undefined;
    };
  const openTab = (name: string) =>
    fireEvent.click(screen.getByRole('tab', { name }));

  it('saves one validated config and keeps an untouched boundary string as loaded', async () => {
    const original = { ...tokyoConfig, startsAt: '2026-11-03T09:00:00+09:00' };
    const calls = mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(
        () => eventResponse({ config: original }),
        (call) =>
          call.path === `${E}/update`
            ? json(200, { id: 'x', slug: 'fest', revision: 'b'.repeat(64) })
            : undefined,
      ),
    );
    change(await screen.findByLabelText('イベント名'), '新しい名前');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    await waitFor(() => expect(posts(calls, '/update')).toHaveLength(1));
    expect(posts(calls, '/update')[0]?.body).toEqual({
      expectedRevision: 'a'.repeat(64),
      config: { ...original, title: '新しい名前' },
    });
    expect(await screen.findByText('設定を保存しました。')).toBeTruthy();
  });

  it('edits a non-Tokyo event in its own zone and sends UTC instants', async () => {
    const newYork = {
      ...tokyoConfig,
      timeZone: 'America/New_York',
      startsAt: '2026-11-01T13:00:00.000Z',
      endsAt: '2026-11-01T22:00:00.000Z',
    };
    const calls = mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() => eventResponse({ config: newYork })),
    );
    // 夏時間が終わる日: 13:00Z は EST の 08:00。
    expect(
      ((await screen.findByLabelText('開始 (時刻)')) as HTMLInputElement).value,
    ).toBe('08:00');
    expect(screen.getByText('UTC: 2026-11-01T13:00:00.000Z')).toBeTruthy();
    change('開始 (時刻)', '09:00');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    await waitFor(() => expect(posts(calls, '/update')).toHaveLength(1));
    const body = posts(calls, '/update')[0]?.body as {
      config: { startsAt: string; endsAt: string };
    };
    expect(body.config.startsAt).toBe('2026-11-01T14:00:00.000Z');
    expect(body.config.endsAt).toBe('2026-11-01T22:00:00.000Z');
  });

  it('refuses a nonexistent local time instead of guessing', async () => {
    const calls = mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() =>
        eventResponse({
          config: {
            ...tokyoConfig,
            timeZone: 'America/New_York',
            startsAt: '2026-03-08T12:00:00.000Z',
            endsAt: '2026-03-08T22:00:00.000Z',
          },
        }),
      ),
    );
    change(await screen.findByLabelText('開始 (時刻)'), '02:30');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(await screen.findByText(/その時刻は存在しません/)).toBeTruthy();
    expect(posts(calls, '/update')).toHaveLength(0);
  });

  it('shows frozen fields and why once tickets exist, while labels stay editable', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() =>
        eventResponse(
          {},
          {
            ticketCount: 3,
            structuralFrozen: true,
            frozenFields: [
              'timeZone',
              'numberScope',
              'startsAt',
              'endsAt',
              'schedule',
              'equipmentIds',
            ],
          },
        ),
      ),
    );
    expect(
      await screen.findByText(/整理券が 3 枚発行されているため/),
    ).toBeTruthy();
    await screen.findByLabelText('イベント名');
    expect(
      (
        screen.getByRole('combobox', {
          name: /^タイムゾーン/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('開始 (日付)') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('イベント名') as HTMLInputElement).disabled,
    ).toBe(false);
    openTab('機材');
    expect(
      (screen.getByLabelText(/^機材 1 の ID/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('機材 1 の表示名') as HTMLInputElement).disabled,
    ).toBe(false);
    expect(screen.queryByRole('button', { name: '機材を追加' })).toBeNull();
    openTab('スケジュール');
    expect(
      (screen.getByLabelText('日 1 の日付') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('shows the server constraint reason and invalid-config issues', async () => {
    let failure = apiError(409, 'change_constraint', {
      constraint: 'structural_frozen',
      fields: ['schedule'],
    });
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(
        () => eventResponse(),
        (call) => (call.path === `${E}/update` ? failure : undefined),
      ),
    );
    change(await screen.findByLabelText('イベント名'), 'x');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(
      await screen.findByText(
        /整理券が 1 枚でも発行されたイベントは.*対象: スケジュール/,
      ),
    ).toBeTruthy();
    failure = apiError(400, 'invalid_config', {
      issues: [
        {
          path: 'defaultPrinterId',
          message: 'default printer must exist in printers',
        },
      ],
    });
    change('イベント名', 'y');
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(
      await screen.findByText(/default printer must exist in printers/),
    ).toBeTruthy();
    expect(screen.getByText('defaultPrinterId')).toBeTruthy();
  });

  it('keeps edits on a stale save and replaces them only after "reload"', async () => {
    let served = eventResponse();
    const calls = mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(
        () => served,
        (call) =>
          call.path === `${E}/update`
            ? apiError(409, 'revision_conflict')
            : undefined,
      ),
    );
    change(await screen.findByLabelText('イベント名'), '私の名前');
    served = eventResponse({
      config: { ...tokyoConfig, title: '他の人の名前' },
      revision: 'c'.repeat(64),
    });
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(
      await screen.findByText(/他の操作で内容が更新されています/),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('イベント名') as HTMLInputElement).value,
    ).toBe('私の名前');
    expect(gets(calls, E)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '最新を読み込む' }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText('イベント名') as HTMLInputElement).value,
      ).toBe('他の人の名前'),
    );
  });

  it('explains why an event with active work cannot be disabled', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(() =>
        eventResponse(
          {},
          { activeTicketCount: 4, activeJobCount: 0, canDisable: false },
        ),
      ),
    );
    expect(await screen.findByText(/有効な整理券 4 件/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'イベントを無効化',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('shows an agent token once, after issuing it from the agents tab', async () => {
    mountScreen(
      <EventManage tenantSlug="acme" eventSlug="fest" />,
      handler(
        () => eventResponse(),
        (call) =>
          call.path === agentsPath && call.method === 'POST'
            ? json(201, {
                id: '55555555-5555-4555-8555-555555555555',
                token: 'qp_secret_token',
                expiresAt: '2026-12-01T00:00:00.000Z',
              })
            : undefined,
      ),
    );
    await screen.findByLabelText('イベント名');
    openTab('エージェントトークン');
    fireEvent.click(
      await screen.findByRole('button', { name: 'トークンを発行' }),
    );
    expect(await screen.findByText('qp_secret_token')).toBeTruthy();
    expect(screen.getByText(/この画面でのみ表示されます/)).toBeTruthy();
    // 他のタブへ移って戻っても保持され、閉じると二度と表示されない。
    openTab('基本');
    openTab('エージェントトークン');
    expect(screen.getByText('qp_secret_token')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'トークンを閉じる' }));
    expect(screen.queryByText('qp_secret_token')).toBeNull();
  });

  it.each([403, 404] as const)(
    'hides event controls on an initial %s scope error',
    async (status) => {
      mountScreen(<EventManage tenantSlug="other" eventSlug="fest" />, () =>
        apiError(status, status === 403 ? 'forbidden' : 'not_found'),
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('tab')).toBeNull();
      expect(screen.queryByRole('button', { name: '設定を保存' })).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
    },
  );

  it.each([403, 404] as const)(
    'hides cached event controls after a %s refetch error',
    async (status) => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(
        ['management', 'event', 'acme', 'fest'],
        eventResponse(),
      );
      const calls = mountScreen(
        <EventManage tenantSlug="acme" eventSlug="fest" />,
        handler(
          () => eventResponse(),
          (call) =>
            call.path === E
              ? apiError(status, status === 403 ? 'forbidden' : 'not_found')
              : undefined,
        ),
        queryClient,
      );
      await screen.findByLabelText('イベント名');

      await queryClient.refetchQueries({
        queryKey: ['management', 'event', 'acme', 'fest'],
      });

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('tab')).toBeNull();
      expect(screen.queryByLabelText('イベント名')).toBeNull();
      expect(screen.queryByRole('button', { name: '設定を保存' })).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
      expect(gets(calls, E)).toHaveLength(1);
    },
  );
});

describe('EventWizard', () => {
  it('creates an event with one equipment, one printer and one schedule in a non-Tokyo zone', async () => {
    const calls = mountScreen(<EventWizard tenantSlug="acme" />, (call) => {
      if (call.path === T) return json(200, tenant());
      if (call.path === `${T}/events/create`) {
        return json(201, {
          id: '66666666-6666-4666-8666-666666666666',
          slug: 'expo',
          revision: 'd'.repeat(64),
        });
      }
      return undefined;
    });
    await screen.findByLabelText(/^イベントの slug/);
    const next = () =>
      fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(
      (screen.getByRole('button', { name: '次へ' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    change(/^イベントの slug/, 'expo');
    change('イベント名', 'Expo');
    change(
      screen.getByRole('combobox', { name: /^タイムゾーン/ }),
      'America/New_York',
    );
    change('開始 (日付)', '2026-11-01');
    change('開始 (時刻)', '09:00');
    change('終了 (日付)', '2026-11-01');
    change('終了 (時刻)', '17:00');
    next();
    change(/^機材 1 の ID/, 'quest-3');
    change('機材 1 の表示名', 'Quest 3');
    next();
    change(/^プリンター 1 の ID/, 'front-desk');
    change('プリンター 1 の表示名', '受付');
    next();
    change('日 1 の日付', '2026-11-01');
    change('最初の枠の開始', '09:00');
    change('最後の枠の開始', '16:00');
    change('体験時間 (分)', '10');
    change('入替時間 (分)', '5');
    next();
    change('レシートのタイトル', '整理券');
    change('来場時の案内文', 'お越しください');
    next();
    expect(screen.getByText('America/New_York')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'イベントを作成' }));
    expect(await screen.findByText('イベントを作成しました')).toBeTruthy();
    expect(posts(calls, '/events/create')[0]?.body).toEqual({
      slug: 'expo',
      config: {
        title: 'Expo',
        timeZone: 'America/New_York',
        // 2026-11-01 09:00 EST / 17:00 EST
        startsAt: '2026-11-01T14:00:00.000Z',
        endsAt: '2026-11-01T22:00:00.000Z',
        numberScope: 'daily',
        equipment: [{ id: 'quest-3', label: 'Quest 3' }],
        schedule: [
          {
            date: '2026-11-01',
            firstStart: '09:00',
            lastStart: '16:00',
            intervalMinutes: 15,
            experienceMinutes: 10,
            turnoverMinutes: 5,
          },
        ],
        copy: { receiptTitle: '整理券', arrivalGuidance: 'お越しください' },
        defaultPrinterId: 'front-desk',
        printers: [{ id: 'front-desk', label: '受付' }],
      },
    });
    expect(
      screen
        .getByRole('link', { name: 'イベントの設定を開く' })
        .getAttribute('href'),
    ).toBe('/t/acme/e/expo/manage');
  });

  it.each([403, 404] as const)(
    'hides the wizard on an initial %s scope error',
    async (status) => {
      mountScreen(<EventWizard tenantSlug="acme" />, () =>
        apiError(status, status === 403 ? 'forbidden' : 'not_found'),
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('button', { name: '次へ' })).toBeNull();
      expect(screen.queryByLabelText(/^イベントの slug/)).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
    },
  );

  it.each([403, 404] as const)(
    'hides the cached wizard after a %s refetch error',
    async (status) => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(['management', 'tenant', 'acme'], tenant());
      const calls = mountScreen(
        <EventWizard tenantSlug="acme" />,
        (call) =>
          call.path === T
            ? apiError(status, status === 403 ? 'forbidden' : 'not_found')
            : undefined,
        queryClient,
      );
      await screen.findByLabelText(/^イベントの slug/);

      await queryClient.refetchQueries({
        queryKey: ['management', 'tenant', 'acme'],
      });

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByLabelText(/^イベントの slug/)).toBeNull();
      expect(screen.queryByRole('button', { name: '次へ' })).toBeNull();
      expect(
        screen
          .getByRole('link', { name: 'テナント一覧へ戻る' })
          .getAttribute('href'),
      ).toBe('/manage');
      expect(gets(calls, T).filter((call) => call.path === T)).toHaveLength(1);
    },
  );
});
