import { type ReactNode, useState } from 'react';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { oauthErrorMessage, readOAuthCallbackError } from './oauth-error.ts';
import { SessionProvider, useSession } from './session.tsx';

function LoginPrompt({
  expired,
  purpose,
}: {
  expired: boolean;
  purpose: string;
}) {
  const { login } = useSession();
  const [failed, setFailed] = useState(false);
  // ログイン拒否などの OAuth 標準エラーは、戻り先 URL の ?error= で届く。
  const callbackError = readOAuthCallbackError(window.location.search);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {expired ? 'ログインの有効期限が切れました' : 'ログインが必要です'}
          </CardTitle>
          <CardDescription>
            {expired
              ? 'セッションの有効時間が過ぎました。もう一度ログインしてください。'
              : `${purpose}にはログインしてください。`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {callbackError !== null && (
            <p role="alert" className="text-sm text-destructive">
              {oauthErrorMessage(callbackError)}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              ログインを開始できませんでした。時間をおいて再試行してください。
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setFailed(false);
              login().catch(() => setFailed(true));
            }}
          >
            GitHubでログイン
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function SessionGate({
  children,
  purpose,
}: {
  children: ReactNode;
  purpose: string;
}) {
  const { state, reload } = useSession();
  switch (state.status) {
    case 'loading':
      return (
        <main className="mx-auto grid min-h-screen max-w-lg place-items-center">
          <p role="status">ログイン状態を確認しています…</p>
        </main>
      );
    case 'unavailable':
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4">
          <div className="grid gap-3" role="alert">
            <p>ログイン状態を確認できませんでした。</p>
            <Button onClick={reload}>再試行</Button>
          </div>
        </main>
      );
    case 'unauthenticated':
      return <LoginPrompt expired={false} purpose={purpose} />;
    case 'expired':
      return <LoginPrompt expired purpose={purpose} />;
    case 'authenticated':
      return children;
  }
}

/** セッションが有効なときだけ children を描画し、それ以外は login / 再 login を促す。 */
export function RequireSession({
  children,
  purpose = '管理画面を開く',
}: {
  children: ReactNode;
  /** ログイン案内に出す「〜には」の目的 (例: 「テナントを登録する」)。 */
  purpose?: string;
}) {
  return (
    <SessionProvider>
      <SessionGate purpose={purpose}>{children}</SessionGate>
    </SessionProvider>
  );
}
