import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequireSession } from '../../session/require-session.tsx';
import { SignupScreen } from './signup-screen.tsx';
import { apiError, json, mountScreen, PREFIX, posts } from './test-harness.tsx';

const policy = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  policy: 'allowlist',
  eligible: true,
  reason: null,
  maxPerUser: 2,
  remainingForUser: 2,
  ...overrides,
});

function mount(
  policyResponse: () => Response,
  create: () => Response = () => json(500, {}),
) {
  return mountScreen(<SignupScreen />, (call) => {
    if (call.path === `${PREFIX}/registration-policy`) return policyResponse();
    if (call.path === `${PREFIX}/tenants/create`) return create();
    return undefined;
  });
}

describe('SignupScreen', () => {
  it('shows no form while registration is off', async () => {
    const calls = mount(() =>
      json(
        200,
        policy({
          enabled: false,
          eligible: false,
          reason: 'registration_disabled',
        }),
      ),
    );
    expect(
      await screen.findByText('新規登録は受け付けていません'),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(posts(calls, '/tenants/create')).toHaveLength(0);
  });

  it.each([
    ['not_allowlisted', 'この GitHub アカウントは登録を許可されていません'],
    ['tenant_limit', '作成できるテナントの上限に達しています'],
    ['registration_closed', '新規登録は現在受け付けていません'],
  ] as const)('denies with a reason and no form: %s', async (reason, text) => {
    mount(() =>
      json(200, policy({ eligible: false, reason, remainingForUser: 0 })),
    );
    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'テナントを作成' })).toBeNull();
  });

  it('offers a GitHub reconnect when the API answers 503 reauth_required', async () => {
    mount(() => apiError(503, 'reauth_required'));
    expect(
      await screen.findByRole('button', { name: 'GitHubで再接続' }),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows an organization outage as a denial without a form', async () => {
    mount(() => apiError(503, 'organization_unavailable'));
    expect(
      await screen.findByText(/組織への所属を確認できませんでした/),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so when the identity is not a GitHub login (401)', async () => {
    mount(() => apiError(401, 'unauthorized'));
    expect(
      await screen.findByText(/GitHub でログインし直してください/),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('creates a tenant and points to the first event wizard', async () => {
    let created = false;
    const calls = mount(
      () =>
        json(
          200,
          created
            ? policy({
                eligible: false,
                reason: 'tenant_limit',
                remainingForUser: 0,
              })
            : policy(),
        ),
      () => {
        created = true;
        return json(201, {
          tenant: {
            id: '33333333-3333-4333-8333-333333333333',
            slug: 'my-club',
            displayName: '私のクラブ',
            revision: 1,
          },
          role: 'admin',
        });
      },
    );
    fireEvent.change(await screen.findByLabelText(/^slug/), {
      target: { value: 'my-club' },
    });
    fireEvent.change(screen.getByLabelText('表示名'), {
      target: { value: '私のクラブ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'テナントを作成' }));
    expect(await screen.findByText('テナントを作成しました')).toBeTruthy();
    expect(posts(calls, '/tenants/create')[0]?.body).toEqual({
      slug: 'my-club',
      displayName: '私のクラブ',
    });
    // 作成後に policy が再取得されても、成功の案内は消えない。
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path.endsWith('/registration-policy'))
          .length,
      ).toBeGreaterThan(1),
    );
    expect(
      screen
        .getByRole('link', { name: '最初のイベントを作成' })
        .getAttribute('href'),
    ).toBe('/t/my-club/manage/events/new');
  });

  it('does not rewrite an invalid slug and shows the server reason', async () => {
    const calls = mount(
      () => json(200, policy()),
      () => apiError(409, 'slug_conflict'),
    );
    fireEvent.change(await screen.findByLabelText(/^slug/), {
      target: { value: 'My Club' },
    });
    expect(screen.getByText(/使えない形式/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('表示名'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'テナントを作成' }));
    expect(await screen.findByText(/すでに使われています/)).toBeTruthy();
    expect(posts(calls, '/tenants/create')[0]?.body).toEqual({
      slug: 'My Club',
      displayName: 'x',
    });
  });

  it('shows the rate-limit wait from Retry-After', async () => {
    mount(
      () => json(200, policy()),
      () => apiError(429, 'rate_limited', {}, { 'Retry-After': '42' }),
    );
    fireEvent.change(await screen.findByLabelText(/^slug/), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByLabelText('表示名'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'テナントを作成' }));
    expect(await screen.findByText(/42 秒/)).toBeTruthy();
  });

  it('shows 503 as temporary unavailability', async () => {
    mount(
      () => json(200, policy()),
      () => apiError(503, 'organization_unavailable'),
    );
    fireEvent.change(await screen.findByLabelText(/^slug/), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByLabelText('表示名'), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'テナントを作成' }));
    expect(await screen.findByText(/一時的に利用できません/)).toBeTruthy();
  });
});

describe('login callback errors', () => {
  it('shows the standard OAuth error from the return URL on the login prompt', async () => {
    window.history.replaceState(
      null,
      '',
      '/signup?error=unable_to_create_session',
    );
    mountScreen(
      <RequireSession purpose="テナントを登録する">
        <SignupScreen />
      </RequireSession>,
      () => undefined,
    );
    expect(
      await screen.findByText(
        /このアカウントは現在ログインを許可されていません/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/テナントを登録するにはログインしてください/),
    ).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });
});
