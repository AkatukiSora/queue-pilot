import type { ComponentProps, ReactNode } from 'react';
import { ApiError } from '../../api/api-error.ts';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { cn } from '../../components/ui/utils.ts';
import { useSession } from '../../session/session.tsx';
import { ManagementApiError } from './management-error.ts';
import { isRevisionConflict, managementErrorMessage } from './messages.ts';

export const inputClass =
  'min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60';

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: 入力要素は children として label の内側に渡される
    <label className="grid gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint !== undefined && (
        <span className="text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

/**
 * 失敗を理由つきで表示する。revision_conflict のときは「再読み込み」を出し、
 * 利用者が明示的に最新を読み込むまで入力や画面を差し替えない。
 */
export function ErrorNotice({
  error,
  onReload,
}: {
  error: unknown;
  onReload?: () => void;
}) {
  if (error === null || error === undefined) return null;
  const issues =
    error instanceof ManagementApiError ? error.detail.issues : undefined;
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-lg border border-destructive p-3 text-sm"
    >
      <p>{managementErrorMessage(error)}</p>
      {issues !== undefined && issues.length > 0 && (
        <ul className="list-disc pl-5">
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>
              <code>{issue.path === '' ? '(全体)' : issue.path}</code>:{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {isRevisionConflict(error) && onReload !== undefined && (
        <Button className="w-fit" variant="outline" onClick={onReload}>
          最新を読み込む
        </Button>
      )}
    </div>
  );
}

/** URL の tenant/event に対するサーバーの 403/404 をそのまま理由として示す。 */
export function ScopeDenied({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const forbidden = status === 403;
  return (
    <Card>
      <CardContent className="grid gap-2 p-6" role="alert">
        <h2 className="text-lg font-bold">
          {forbidden
            ? 'この画面を開く権限がありません'
            : status === 404
              ? '見つかりません'
              : '読み込めませんでした'}
        </h2>
        <p className="text-sm">
          {forbidden
            ? 'この設定を管理するには、テナントの管理者である必要があります。'
            : status === 404
              ? '指定されたテナント/イベントが存在しないか、アクセスできません。'
              : managementErrorMessage(error)}
        </p>
        <a className="underline" href="/manage">
          テナント一覧へ戻る
        </a>
      </CardContent>
    </Card>
  );
}

export function ManagementShell({
  title,
  children,
  crumbs = [],
}: {
  title: string;
  children: ReactNode;
  crumbs?: { href: string; label: string }[];
}) {
  const { logout } = useSession();
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="パンくず" className="flex flex-wrap gap-2 text-sm">
          <a className="underline" href="/manage">
            テナント一覧
          </a>
          {crumbs.map((crumb) => (
            <span key={crumb.href}>
              /{' '}
              <a className="underline" href={crumb.href}>
                {crumb.label}
              </a>
            </span>
          ))}
        </nav>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          ログアウト
        </Button>
      </header>
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function Loading() {
  return <p aria-busy="true">読み込んでいます…</p>;
}

/** 閲覧者のブラウザのタイムゾーンで audit などの instant を表示する。 */
export function formatInstant(instant: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(instant));
}
