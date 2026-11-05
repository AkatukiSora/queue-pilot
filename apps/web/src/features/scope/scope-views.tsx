import { ApiError } from '../../api/api-error.ts';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import { adminScopePath, type MemberEvent } from './scope-api.ts';

/** 403 / 404 の表示。401 はセッション層が再ログイン導線へ切り替える。 */
export function ScopeErrorView({ status }: { status: 403 | 404 }) {
  const forbidden = status === 403;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {forbidden
              ? 'このイベントを開く権限がありません'
              : 'イベントが見つかりません'}
          </CardTitle>
          <CardDescription>
            {forbidden
              ? 'このテナント/イベントへのアクセス権がありません。管理者に権限を確認してください。'
              : '指定されたテナントまたはイベントが存在しないか、アクセスできません。'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a className="underline" href="/admin">
            イベント選択へ戻る
          </a>
        </CardContent>
      </Card>
    </main>
  );
}

export function scopeErrorStatus(error: unknown): 403 | 404 | null {
  if (
    error instanceof ApiError &&
    (error.status === 403 || error.status === 404)
  ) {
    return error.status;
  }
  return null;
}

const ROLE_LABEL: Record<MemberEvent['role'], string> = {
  admin: '管理者',
  staff: 'スタッフ',
};

function groupByTenant(events: readonly MemberEvent[]) {
  const groups = new Map<string, { name: string; events: MemberEvent[] }>();
  for (const event of events) {
    const group = groups.get(event.tenantSlug) ?? {
      name: event.tenantName,
      events: [],
    };
    group.events.push(event);
    groups.set(event.tenantSlug, group);
  }
  return [...groups.entries()];
}

/** アクセス可能な tenant/event の選択肢。メンバーシップ編集は扱わない。 */
export function EventPicker({
  events,
  isPending,
  error,
  onRetry,
}: {
  events: readonly MemberEvent[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold">イベントを選択</h1>
      {isPending && <p aria-busy="true">イベントを読み込んでいます…</p>}
      {error !== null && error !== undefined && (
        <div className="grid gap-3" role="alert">
          <p>イベント一覧を取得できませんでした。</p>
          <Button onClick={onRetry}>再読み込み</Button>
        </div>
      )}
      {events?.length === 0 && (
        <p>
          アクセスできるイベントがありません。管理者に権限を確認してください。
        </p>
      )}
      {events !== undefined &&
        groupByTenant(events).map(([tenantSlug, group]) => (
          <Card key={tenantSlug}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {group.events.map((event) => (
                  <li key={event.eventId}>
                    <a
                      className="flex items-center justify-between rounded-md border p-3"
                      href={adminScopePath(event)}
                    >
                      <span>{event.eventTitle}</span>
                      <span className="text-sm text-muted-foreground">
                        {ROLE_LABEL[event.role]}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
    </main>
  );
}

/** 管理画面上部の切替。選択肢はサーバーが返した範囲のみ。 */
export function ScopeSwitcher({
  events,
  current,
  onSelect,
}: {
  events: readonly MemberEvent[];
  current: { tenantSlug: string; eventSlug: string };
  onSelect: (scope: { tenantSlug: string; eventSlug: string }) => void;
}) {
  const currentValue = `${current.tenantSlug}/${current.eventSlug}`;
  return (
    <label className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pt-3 text-sm">
      <span>イベント切替</span>
      <select
        className="rounded-md border bg-background p-1"
        value={currentValue}
        onChange={(change) => {
          const next = events.find(
            (event) =>
              `${event.tenantSlug}/${event.eventSlug}` === change.target.value,
          );
          if (next !== undefined) onSelect(next);
        }}
      >
        {!events.some(
          (event) => `${event.tenantSlug}/${event.eventSlug}` === currentValue,
        ) && <option value={currentValue}>{currentValue}</option>}
        {events.map((event) => (
          <option
            key={event.eventId}
            value={`${event.tenantSlug}/${event.eventSlug}`}
          >
            {event.tenantName} / {event.eventTitle}
          </option>
        ))}
      </select>
    </label>
  );
}
