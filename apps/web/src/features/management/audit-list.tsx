import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { type AuditEntry, useAudit } from './management-api.ts';
import { ErrorNotice, formatInstant, Loading } from './ui.tsx';

const RESOURCE_LABEL = {
  tenant: 'テナント',
  member: 'メンバー',
  event: 'イベント',
} as const;

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="grid gap-1 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3">
        <time dateTime={entry.occurredAt}>
          {formatInstant(entry.occurredAt)}
        </time>
        <strong>{entry.action}</strong>
        <span>{RESOURCE_LABEL[entry.resourceType]}</span>
        <span className="text-muted-foreground">
          {entry.actorKind === 'operator' ? '運用者' : '利用者'}
          {entry.revisionAfter !== null && ` / revision ${entry.revisionAfter}`}
        </span>
      </div>
      {(entry.before !== null || entry.after !== null) && (
        <details>
          <summary className="cursor-pointer">変更内容</summary>
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(
              { before: entry.before, after: entry.after },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </li>
  );
}

/** 監査ログ。eventSlug 側の絞り込みは eventId で行い、取得はテナント単位。 */
export function AuditList({
  tenantSlug,
  eventId,
}: {
  tenantSlug: string;
  eventId?: string;
}) {
  const audit = useAudit({ tenantSlug });
  const entries = audit.data?.pages
    .flatMap((page) => page.entries)
    .filter((entry) => eventId === undefined || entry.eventId === eventId);
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">監査ログ</h2>
        <p className="text-sm text-muted-foreground">
          時刻はこのブラウザのタイムゾーンで表示しています。認証情報は記録されません。
        </p>
        {audit.isPending && <Loading />}
        <ErrorNotice error={audit.error} />
        {entries?.length === 0 && (
          <p className="text-sm">記録はまだありません。</p>
        )}
        <ul className="grid gap-2">
          {entries?.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
        {audit.hasNextPage && (
          <Button
            className="w-fit"
            variant="outline"
            disabled={audit.isFetchingNextPage}
            onClick={() => void audit.fetchNextPage()}
          >
            さらに読み込む
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
