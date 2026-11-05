import { type ReactNode, useState } from 'react';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { SessionProvider, useSession } from './session.tsx';

function LoginPrompt({ expired }: { expired: boolean }) {
  const { login } = useSession();
  const [failed, setFailed] = useState(false);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {expired ? 'ログインの有効期限が切れました' : 'ログインが必要です'}
          </CardTitle>
          <CardDescription>
            {expired
              ? 'セッションの有効時間 (15分) が過ぎました。もう一度ログインしてください。'
              : '管理画面を開くにはログインしてください。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
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

function SessionGate({ children }: { children: ReactNode }) {
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
      return <LoginPrompt expired={false} />;
    case 'expired':
      return <LoginPrompt expired />;
    case 'authenticated':
      return children;
  }
}

/** セッションが有効なときだけ children を描画し、それ以外は login / 再 login を促す。 */
export function RequireSession({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}
