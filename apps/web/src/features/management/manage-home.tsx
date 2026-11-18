import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { type ManagedTenantSummary, useTenants } from './management-api.ts';
import { ErrorNotice, Loading, ManagementShell } from './ui.tsx';

const ROLE_LABEL = { admin: '管理者', staff: 'スタッフ' } as const;

export function tenantManagePath(tenantSlug: string) {
  return `/t/${encodeURIComponent(tenantSlug)}/manage`;
}

export function eventManagePath(tenantSlug: string, eventSlug: string) {
  return `/t/${encodeURIComponent(tenantSlug)}/e/${encodeURIComponent(eventSlug)}/manage`;
}

/** 自分が所属するテナントの一覧。イベントが 0 件でも表示する。 */
export function ManageHome() {
  const tenants = useTenants();
  return (
    <ManagementShell title="テナント">
      <div className="flex flex-wrap gap-3">
        <a
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          href="/signup"
        >
          新しいテナントを登録
        </a>
        <a className="px-2 py-2.5 text-sm underline" href="/admin">
          受付の管理画面へ
        </a>
      </div>
      {tenants.isPending && <Loading />}
      {tenants.isError && (
        <div className="grid gap-2">
          <ErrorNotice error={tenants.error} />
          <Button
            className="w-fit"
            variant="outline"
            onClick={() => void tenants.refetch()}
          >
            再読み込み
          </Button>
        </div>
      )}
      {tenants.data?.length === 0 && (
        <p>
          所属しているテナントがありません。登録するか、管理者に招待を依頼してください。
        </p>
      )}
      <ul className="grid gap-4">
        {tenants.data?.map((tenant) => (
          <li key={tenant.id}>
            <TenantCard tenant={tenant} />
          </li>
        ))}
      </ul>
    </ManagementShell>
  );
}

function TenantCard({ tenant }: { tenant: ManagedTenantSummary }) {
  const isAdmin = tenant.role === 'admin';
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{tenant.displayName}</h2>
          <code className="text-sm text-muted-foreground">{tenant.slug}</code>
          <Badge variant="outline">{ROLE_LABEL[tenant.role]}</Badge>
        </div>
        {tenant.events.length === 0 ? (
          <p className="text-sm">
            イベントはまだありません。
            {isAdmin && (
              <>
                {' '}
                <a
                  className="underline"
                  href={`${tenantManagePath(tenant.slug)}/events/new`}
                >
                  最初のイベントを作成
                </a>
              </>
            )}
          </p>
        ) : (
          <ul className="grid gap-2">
            {tenant.events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span>{event.title ?? event.slug}</span>
                <span className="flex gap-3 text-sm">
                  <a
                    className="underline"
                    href={`/t/${encodeURIComponent(tenant.slug)}/e/${encodeURIComponent(event.slug)}/admin`}
                  >
                    受付
                  </a>
                  {isAdmin && (
                    <a
                      className="underline"
                      href={eventManagePath(tenant.slug, event.slug)}
                    >
                      設定
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="flex gap-4 text-sm">
            <a className="underline" href={tenantManagePath(tenant.slug)}>
              テナントの管理
            </a>
            <a
              className="underline"
              href={`${tenantManagePath(tenant.slug)}/members`}
            >
              メンバー
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
