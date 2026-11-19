import { type ReactNode, useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { AgentsPanel } from '../agents/agents-panel.tsx';
import { scopeErrorStatus } from '../scope/scope-views.tsx';
import { AuditList } from './audit-list.tsx';
import {
  bodySizeIssue,
  draftFromConfig,
  draftToConfig,
  type EventDraft,
} from './event-config.ts';
import {
  BasicsSection,
  CopySection,
  EquipmentSection,
  PrintersSection,
  ScheduleSection,
} from './event-form.tsx';
import { eventManagePath, tenantManagePath } from './manage-home.tsx';
import {
  type ManagedEvent,
  useEvent,
  useEventMutation,
} from './management-api.ts';
import {
  ErrorNotice,
  Field,
  Loading,
  ManagementShell,
  ScopeDenied,
  TextInput,
} from './ui.tsx';

const TABS = [
  { id: 'basics', label: '基本' },
  { id: 'equipment', label: '機材' },
  { id: 'schedule', label: 'スケジュール' },
  { id: 'printers', label: 'プリンター' },
  { id: 'copy', label: '受付・レシート文言' },
  { id: 'agents', label: 'エージェントトークン' },
  { id: 'audit', label: '監査' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const FORM_TABS: readonly TabId[] = [
  'basics',
  'equipment',
  'schedule',
  'printers',
  'copy',
];

export function EventManage({
  tenantSlug,
  eventSlug,
}: {
  tenantSlug: string;
  eventSlug: string;
}) {
  const event = useEvent({ tenantSlug, eventSlug });
  const terminalError = scopeErrorStatus(event.error) !== null;
  // 入力中の設定は、利用者が「最新を読み込む」を押したときだけ作り直す。
  const [reloads, setReloads] = useState(0);
  const reload = () =>
    void event.refetch().then(() => setReloads((n) => n + 1));
  return (
    <ManagementShell
      title={
        terminalError
          ? 'イベントの設定'
          : (event.data?.config.title ?? 'イベントの設定')
      }
      crumbs={[
        { href: tenantManagePath(tenantSlug), label: tenantSlug },
        { href: eventManagePath(tenantSlug, eventSlug), label: eventSlug },
      ]}
    >
      {event.isPending && <Loading />}
      {event.isError && <ScopeDenied error={event.error} />}
      {!terminalError && event.data !== undefined && (
        <EventEditor
          key={reloads}
          tenantSlug={tenantSlug}
          event={event.data}
          reload={reload}
        />
      )}
    </ManagementShell>
  );
}

function EventEditor({
  tenantSlug,
  event,
  reload,
}: {
  tenantSlug: string;
  event: ManagedEvent;
  reload: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    draftFromConfig(event.config),
  );
  const [tab, setTab] = useState<TabId>('basics');
  const [scheduleRulesPending, setScheduleRulesPending] = useState(false);
  const [conversionIssues, setConversionIssues] = useState<string[]>([]);
  const mutation = useEventMutation({ tenantSlug });
  const { changeConstraints } = event;
  const frozen = new Set(changeConstraints.frozenFields);
  const lockedPrinterIds = new Set(event.config.printers.map((p) => p.id));
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(draftFromConfig(event.config));

  const update = (patch: Partial<EventDraft>) => {
    mutation.reset();
    setConversionIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const save = () => {
    const converted = draftToConfig(draft, event.config);
    if (!converted.ok) {
      setConversionIssues(converted.issues);
      return;
    }
    const oversize = bodySizeIssue({
      expectedRevision: event.revision,
      config: converted.config,
    });
    if (oversize !== null) {
      setConversionIssues([oversize]);
      return;
    }
    setConversionIssues([]);
    mutation.mutate({
      type: 'update',
      eventSlug: event.slug,
      expectedRevision: event.revision,
      config: converted.config,
    });
  };

  const section = { draft, update, frozen, lockedPrinterIds } as const;
  const panels: Record<TabId, ReactNode> = {
    basics: <BasicsSection {...section} />,
    equipment: <EquipmentSection {...section} />,
    schedule: (
      <ScheduleSection
        {...section}
        saveEnvelope={{ kind: 'update', expectedRevision: event.revision }}
        onRulesPendingChange={setScheduleRulesPending}
      />
    ),
    printers: (
      <PrintersSection
        {...section}
        printersInUse={changeConstraints.printersInUse}
      />
    ),
    copy: <CopySection {...section} />,
    // 発行した token をタブの切替で失わないよう、非表示でも mount を保つ。
    agents: (
      <AgentsPanel
        scope={{ tenantSlug, eventSlug: event.slug }}
        printers={event.config.printers}
      />
    ),
    audit: <AuditList tenantSlug={tenantSlug} eventId={event.id} />,
  };

  return (
    <>
      {changeConstraints.structuralFrozen && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          整理券が {changeConstraints.ticketCount}{' '}
          枚発行されているため、スケジュール・機材の増減・タイムゾーン・開始/終了・採番範囲は変更できません。名称や文言は変更でき、以後の発行から反映されます。
        </p>
      )}
      <div
        role="tablist"
        aria-label="イベント設定"
        className="flex flex-wrap gap-2"
      >
        {TABS.map((item) => (
          <Button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            variant={tab === item.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          {TABS.map((item) => (
            <div
              key={item.id}
              role="tabpanel"
              id={`panel-${item.id}`}
              aria-labelledby={`tab-${item.id}`}
              hidden={tab !== item.id}
            >
              {panels[item.id]}
            </div>
          ))}
        </CardContent>
      </Card>
      {FORM_TABS.includes(tab) && (
        <div className="grid gap-3">
          {conversionIssues.length > 0 && (
            <ul
              role="alert"
              className="list-disc rounded-lg border border-destructive p-3 pl-8 text-sm"
            >
              {conversionIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <ErrorNotice error={mutation.error} onReload={reload} />
          {mutation.isSuccess && <p role="status">設定を保存しました。</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={mutation.isPending || !dirty || scheduleRulesPending}
              onClick={save}
            >
              {mutation.isPending ? '保存しています…' : '設定を保存'}
            </Button>
            {dirty && (
              <span className="text-sm text-muted-foreground">
                未保存の変更があります
              </span>
            )}
          </div>
        </div>
      )}
      <DisableEvent tenantSlug={tenantSlug} event={event} reload={reload} />
    </>
  );
}

function DisableEvent({
  tenantSlug,
  event,
  reload,
}: {
  tenantSlug: string;
  event: ManagedEvent;
  reload: () => void;
}) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const mutation = useEventMutation({ tenantSlug });
  const { activeTicketCount, activeJobCount, canDisable } =
    event.changeConstraints;
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">イベントの無効化</h2>
        <p className="text-sm">
          無効化すると、このイベントの履歴と過去の QR
          コードの閲覧も停止します。データは削除されません。
        </p>
        {!canDisable && (
          <p role="status" className="text-sm font-semibold">
            有効な整理券 {activeTicketCount} 件、印刷待ち・印刷中のジョブ{' '}
            {activeJobCount}{' '}
            件が残っているため、現在は無効化できません。完了または取消してから再度お試しください。
          </p>
        )}
        <Field label={`確認のため「${event.slug}」と入力`}>
          <TextInput
            value={confirmSlug}
            disabled={!canDisable}
            onChange={(change) => setConfirmSlug(change.target.value)}
            autoComplete="off"
          />
        </Field>
        <ErrorNotice error={mutation.error} onReload={reload} />
        {mutation.isSuccess && <p role="status">イベントを無効化しました。</p>}
        <Button
          className="w-fit"
          variant="destructive"
          disabled={!canDisable || mutation.isPending || confirmSlug === ''}
          onClick={() =>
            mutation.mutate(
              {
                type: 'disable',
                eventSlug: event.slug,
                expectedRevision: event.revision,
                confirmSlug,
              },
              {
                onSuccess: () =>
                  window.location.replace(tenantManagePath(tenantSlug)),
              },
            )
          }
        >
          イベントを無効化
        </Button>
      </CardContent>
    </Card>
  );
}
