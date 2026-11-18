import { type FormEvent, useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { AuditList } from './audit-list.tsx';
import { eventManagePath, tenantManagePath } from './manage-home.tsx';
import {
  fetchTenantExport,
  type ManagedEvent,
  type ManagedTenantDetail,
  useEvents,
  useTenant,
  useTenantMutation,
} from './management-api.ts';
import {
  ErrorNotice,
  Field,
  Loading,
  ManagementShell,
  ScopeDenied,
  TextInput,
} from './ui.tsx';

export function TenantManage({ tenantSlug }: { tenantSlug: string }) {
  const tenant = useTenant({ tenantSlug });
  // 入力中の内容は、利用者が「最新を読み込む」を押したときだけ作り直す。
  const [reloads, setReloads] = useState(0);
  const reload = () =>
    void tenant.refetch().then(() => setReloads((n) => n + 1));
  return (
    <ManagementShell
      title={tenant.data?.displayName ?? 'テナントの管理'}
      crumbs={[{ href: tenantManagePath(tenantSlug), label: tenantSlug }]}
    >
      {tenant.isPending && <Loading />}
      {tenant.isError && <ScopeDenied error={tenant.error} />}
      {tenant.data !== undefined && (
        <>
          <nav className="flex gap-4 text-sm" aria-label="テナントの管理">
            <a
              className="underline"
              href={`${tenantManagePath(tenantSlug)}/members`}
            >
              メンバー管理
            </a>
          </nav>
          <TenantSettings
            key={`settings-${reloads}`}
            tenant={tenant.data}
            reload={reload}
          />
          <EventsSection tenantSlug={tenantSlug} />
          <ExportSection tenantSlug={tenantSlug} />
          <AuditList tenantSlug={tenantSlug} />
          <DisableTenant
            key={`disable-${reloads}`}
            tenant={tenant.data}
            reload={reload}
          />
        </>
      )}
    </ManagementShell>
  );
}

function TenantSettings({
  tenant,
  reload,
}: {
  tenant: ManagedTenantDetail;
  reload: () => void;
}) {
  const [displayName, setDisplayName] = useState(tenant.displayName);
  const mutation = useTenantMutation({ tenantSlug: tenant.slug });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      type: 'update',
      expectedRevision: tenant.revision,
      displayName,
    });
  };
  return (
    <Card>
      <CardContent className="p-5">
        <form className="grid gap-3" onSubmit={submit}>
          <h2 className="text-xl font-bold">基本設定</h2>
          <Field
            label="表示名"
            hint={`slug「${tenant.slug}」は変更できません。`}
          >
            <TextInput
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </Field>
          <ErrorNotice error={mutation.error} onReload={reload} />
          {mutation.isSuccess && <p role="status">保存しました。</p>}
          <Button
            type="submit"
            className="w-fit"
            disabled={mutation.isPending || displayName === tenant.displayName}
          >
            保存
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function eventSummary(event: ManagedEvent) {
  const { ticketCount, structuralFrozen } = event.changeConstraints;
  return structuralFrozen
    ? `整理券 ${ticketCount} 枚発行済み (構造は凍結中)`
    : '整理券の発行なし';
}

function EventsSection({ tenantSlug }: { tenantSlug: string }) {
  const events = useEvents({ tenantSlug });
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">イベント</h2>
          <a
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            href={`${tenantManagePath(tenantSlug)}/events/new`}
          >
            イベントを作成
          </a>
        </div>
        {events.isPending && <Loading />}
        <ErrorNotice error={events.error} />
        {events.data?.length === 0 && (
          <p className="text-sm">
            イベントはまだありません。「イベントを作成」から、機材・プリンター・スケジュールを設定してください。
          </p>
        )}
        <ul className="grid gap-2">
          {events.data?.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <span>
                <strong>{event.config.title}</strong>{' '}
                <code className="text-sm">{event.slug}</code>
                <span className="block text-sm text-muted-foreground">
                  {eventSummary(event)}
                </span>
              </span>
              <a
                className="underline"
                href={eventManagePath(tenantSlug, event.slug)}
              >
                設定を開く
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ExportSection({ tenantSlug }: { tenantSlug: string }) {
  const [state, setState] = useState<
    | { status: 'idle' | 'working' | 'done' }
    | { status: 'failed'; error: unknown }
  >({ status: 'idle' });
  const download = async () => {
    setState({ status: 'working' });
    try {
      const data = await fetchTenantExport(tenantSlug);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tenantSlug}-configuration-export.json`;
      link.click();
      URL.revokeObjectURL(url);
      setState({ status: 'done' });
    } catch (error) {
      setState({ status: 'failed', error });
    }
  };
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">エクスポート</h2>
        <p className="text-sm text-muted-foreground">
          設定 (メンバー・イベント・機材・プリンター) を JSON
          で保存します。認証情報・整理券・印刷ジョブは含まれません。
        </p>
        {state.status === 'failed' && <ErrorNotice error={state.error} />}
        {state.status === 'done' && <p role="status">保存しました。</p>}
        <Button
          className="w-fit"
          variant="outline"
          disabled={state.status === 'working'}
          onClick={() => void download()}
        >
          設定をエクスポート (JSON)
        </Button>
      </CardContent>
    </Card>
  );
}

function DisableTenant({
  tenant,
  reload,
}: {
  tenant: ManagedTenantDetail;
  reload: () => void;
}) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const mutation = useTenantMutation({ tenantSlug: tenant.slug });
  const { activeTicketCount, activeJobCount, canDisable } =
    tenant.changeConstraints;
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">テナントの無効化</h2>
        <p className="text-sm">
          無効化すると、このテナントの履歴と過去の QR
          コードの閲覧も停止します。データは削除されません。
        </p>
        {!canDisable && (
          <p role="status" className="text-sm font-semibold">
            有効な整理券 {activeTicketCount} 件、印刷待ち・印刷中のジョブ{' '}
            {activeJobCount}{' '}
            件が残っているため、現在は無効化できません。完了または取消してから再度お試しください。
          </p>
        )}
        <Field label={`確認のため「${tenant.slug}」と入力`}>
          <TextInput
            value={confirmSlug}
            onChange={(event) => setConfirmSlug(event.target.value)}
            autoComplete="off"
            disabled={!canDisable}
          />
        </Field>
        <ErrorNotice error={mutation.error} onReload={reload} />
        {mutation.isSuccess && <p role="status">テナントを無効化しました。</p>}
        <Button
          className="w-fit"
          variant="destructive"
          disabled={!canDisable || mutation.isPending || confirmSlug === ''}
          onClick={() =>
            mutation.mutate({
              type: 'disable',
              expectedRevision: tenant.revision,
              confirmSlug,
            })
          }
        >
          テナントを無効化
        </Button>
      </CardContent>
    </Card>
  );
}
