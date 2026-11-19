import { afterEach, expect, it, vi } from 'vitest';
import { assertManagementOk, ManagementApiError } from './management-error.ts';
import { managementErrorMessage } from './messages.ts';

function capture(response: Response, error: unknown): unknown {
  try {
    assertManagementOk(response, error);
    return undefined;
  } catch (caught) {
    return caught;
  }
}

function response(status: number, headers: Record<string, string> = {}) {
  return new Response('', { status, headers });
}

afterEach(() => vi.useRealTimers());

it.each([
  ['nested envelope', { error: { code: 'member_not_found', message: 'raw' } }],
  ['flat envelope', { code: 'member_not_found', message: 'raw' }],
])('validates %s errors without exposing server messages', (_label, body) => {
  const error = capture(response(400), body);
  expect(error).toBeInstanceOf(ManagementApiError);
  expect(managementErrorMessage(error)).toBe(
    '指定された GitHub ユーザーが見つかりません。',
  );
});

it.each([
  ['message only', { message: 'Too many requests.' }],
  ['null', null],
  ['undefined', undefined],
  ['array', []],
  ['html', '<html>Bad Gateway</html>'],
  ['empty body', ''],
  ['invalid JSON text', '{broken'],
])('uses HTTP status for malformed 502 %s responses', (_label, body) => {
  const error = capture(response(502), body);
  expect(managementErrorMessage(error)).toBe(
    'サービスを一時的に利用できません。時間をおいて再試行してください。',
  );
});

it('prioritizes authentication and authorization HTTP statuses', () => {
  expect(
    managementErrorMessage(
      capture(response(401), { code: 'ACCOUNT_NOT_FOUND', message: 'raw' }),
    ),
  ).toBe('ログインの有効期限が切れました。再ログインしてください。');
  expect(
    managementErrorMessage(
      capture(response(403), { error: { code: 'not_found', message: 'raw' } }),
    ),
  ).toBe('この操作を行う権限がありません。');
  expect(
    managementErrorMessage(capture(response(404), '<html>Not found</html>')),
  ).toBe(
    '対象が見つかりません。存在しないか、アクセスできない可能性があります。',
  );
});

it.each([
  [
    'ACCOUNT_NOT_FOUND',
    'GitHub の連携情報を確認できませんでした。GitHub で再ログインしてください。',
  ],
  [
    'FAILED_TO_GET_ACCESS_TOKEN',
    'GitHub の連携情報を確認できませんでした。GitHub で再ログインしてください。',
  ],
])('maps Better Auth %s to GitHub reconnection', (code, expected) => {
  expect(
    managementErrorMessage(
      capture(response(400), { code, message: 'raw Better Auth message' }),
    ),
  ).toBe(expected);
});

it('uses Retry-After before X-Retry-After and accepts HTTP dates', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T01:00:00.000Z'));

  const appLimit = capture(
    response(429, { 'Retry-After': '45', 'X-Retry-After': '60' }),
    { message: 'raw' },
  );
  expect(managementErrorMessage(appLimit)).toBe(
    '操作が多すぎます。45 秒ほど待ってから再試行してください。',
  );

  const fallbackLimit = capture(
    response(429, { 'Retry-After': 'invalid', 'X-Retry-After': '60' }),
    null,
  );
  expect(managementErrorMessage(fallbackLimit)).toBe(
    '操作が多すぎます。60 秒ほど待ってから再試行してください。',
  );

  const date = new Date(Date.now() + 75_000).toUTCString();
  const githubLimit = capture(response(503, { 'Retry-After': date }), {
    error: { code: 'github_rate_limited', message: 'raw' },
  });
  expect(managementErrorMessage(githubLimit)).toBe(
    'GitHub の利用制限に達しました。75 秒ほど待ってから再試行してください。',
  );
});

it('throws on every non-2xx response and on unexpected 2xx error values', () => {
  expect(capture(response(401), undefined)).toBeInstanceOf(Error);
  expect(capture(response(503), undefined)).toBeInstanceOf(Error);
  expect(capture(response(200), { unexpected: true })).toBeInstanceOf(Error);
  expect(() => assertManagementOk(response(200), undefined)).not.toThrow();
});

it('does not label unknown application exceptions as network failures', () => {
  expect(managementErrorMessage(new TypeError('programming error'))).toBe(
    '操作中にエラーが発生しました。画面を再読み込みしてから再試行してください。',
  );
});
