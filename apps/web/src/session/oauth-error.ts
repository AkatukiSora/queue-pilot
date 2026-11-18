/**
 * Better Auth の標準エラーを型付けして扱う。独自形式へ変換しない。
 * - API 応答の本文: `{ code?, message? }`
 * - OAuth callback の失敗: 戻り先 URL の `error` / `error_description`
 */
export type BetterAuthError = { code?: string; message?: string };
export type OAuthCallbackError = { error: string; description?: string };

export function readOAuthCallbackError(
  search: string,
): OAuthCallbackError | null {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error === null || error === '') return null;
  return {
    error,
    description: params.get('error_description') ?? undefined,
  };
}

const OAUTH_ERRORS: Record<string, string> = {
  access_denied:
    'GitHub での許可が取り消されました。もう一度ログインしてください。',
  unable_to_create_session:
    'ログインを完了できませんでした。このアカウントは現在ログインを許可されていません。',
  signup_disabled: '新規登録は現在受け付けていません。',
  'account not linked':
    'このアカウントは別のログイン方法と連携されていません。',
  state_mismatch:
    'ログインの確認に失敗しました。もう一度最初からやり直してください。',
};

export function oauthErrorMessage({ error, description }: OAuthCallbackError) {
  const known = OAUTH_ERRORS[error] ?? OAUTH_ERRORS[error.replaceAll('_', ' ')];
  if (known !== undefined) return known;
  return `ログインに失敗しました (${error}${description === undefined ? '' : `: ${description}`})。`;
}
