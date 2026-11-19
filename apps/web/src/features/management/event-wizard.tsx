import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { scopeErrorStatus } from '../scope/scope-views.tsx';
import {
  bodySizeIssue,
  draftToConfig,
  type EventDraft,
  emptyEventDraft,
} from './event-config.ts';
import {
  BasicsSection,
  CopySection,
  EquipmentSection,
  PrintersSection,
  ScheduleSection,
} from './event-form.tsx';
import { eventManagePath, tenantManagePath } from './manage-home.tsx';
import { useEventMutation, useTenant } from './management-api.ts';
import {
  ErrorNotice,
  Field,
  Loading,
  ManagementShell,
  ScopeDenied,
  TextInput,
} from './ui.tsx';
import { isValidTimeZone } from './zoned-time.ts';

const STEPS = [
  '基本',
  '機材',
  'プリンター',
  'スケジュール',
  '受付・レシート文言',
  '確認',
] as const;

const filled = (value: string) => value.trim() !== '';

/** 各手順で「次へ」に進める最低限の入力。内容の検証はサーバーが行う。 */
function stepReady(step: number, slug: string, draft: EventDraft) {
  switch (step) {
    case 0:
      return (
        filled(slug) &&
        filled(draft.title) &&
        isValidTimeZone(draft.timeZone) &&
        filled(draft.start.date) &&
        filled(draft.end.date)
      );
    case 1:
      return draft.equipment.every(
        (item) => filled(item.id) && filled(item.label),
      );
    case 2:
      return (
        draft.printers.every((item) => filled(item.id) && filled(item.label)) &&
        (draft.printers.length === 1 || filled(draft.defaultPrinterId))
      );
    case 3:
      return draft.schedule.every((item) => filled(item.date));
    case 4:
      return filled(draft.receiptTitle) && filled(draft.arrivalGuidance);
    default:
      return true;
  }
}

/** イベント作成 wizard。最低 1 機材 / 1 プリンター / 1 スケジュールを揃えて作成する。 */
export function EventWizard({ tenantSlug }: { tenantSlug: string }) {
  const tenant = useTenant({ tenantSlug });
  const terminalError = scopeErrorStatus(tenant.error) !== null;
  return (
    <ManagementShell
      title="イベントを作成"
      crumbs={[{ href: tenantManagePath(tenantSlug), label: tenantSlug }]}
    >
      {tenant.isPending && <Loading />}
      {tenant.isError && <ScopeDenied error={tenant.error} />}
      {!terminalError && tenant.data !== undefined && (
        <Wizard tenantSlug={tenantSlug} />
      )}
    </ManagementShell>
  );
}

function Wizard({ tenantSlug }: { tenantSlug: string }) {
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState('');
  const [draft, setDraft] = useState<EventDraft>(() =>
    emptyEventDraft(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [scheduleRulesPending, setScheduleRulesPending] = useState(false);
  const [conversionIssues, setConversionIssues] = useState<string[]>([]);
  const mutation = useEventMutation({ tenantSlug });
  const update = (patch: Partial<EventDraft>) => {
    mutation.reset();
    setConversionIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  };

  if (mutation.isSuccess && mutation.data !== undefined) {
    const created = mutation.data;
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          <h2 className="text-lg font-bold">イベントを作成しました</h2>
          <p className="text-sm">
            「{draft.title}」({created.slug})
            を作成しました。続けて、エージェントトークンの発行や受付の準備を進められます。
          </p>
          <a
            className="w-fit rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            href={eventManagePath(tenantSlug, created.slug)}
          >
            イベントの設定を開く
          </a>
        </CardContent>
      </Card>
    );
  }

  const create = () => {
    // プリンターが 1 台だけなら、それを既定にする。
    const withDefault =
      draft.printers.length === 1 && draft.defaultPrinterId === ''
        ? { ...draft, defaultPrinterId: draft.printers[0]?.id ?? '' }
        : draft;
    const converted = draftToConfig(withDefault);
    if (!converted.ok) {
      setConversionIssues(converted.issues);
      return;
    }
    const oversize = bodySizeIssue({ slug, config: converted.config });
    if (oversize !== null) {
      setConversionIssues([oversize]);
      return;
    }
    setConversionIssues([]);
    mutation.mutate({ type: 'create', slug, config: converted.config });
  };

  const last = step === STEPS.length - 1;
  return (
    <>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="手順">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={
              index === step ? 'font-bold underline' : 'text-muted-foreground'
            }
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <Card>
        <CardContent className="grid gap-4 p-5">
          <h2 className="text-xl font-bold">
            {step + 1}. {STEPS[step]}
          </h2>
          {step === 0 && (
            <>
              <Field
                label="イベントの slug (URL に使う識別子)"
                hint="小文字の英数字とハイフンのみ、1〜63 文字。作成後は変更できません。"
              >
                <TextInput
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    mutation.reset();
                    setSlug(event.target.value);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <BasicsSection draft={draft} update={update} />
            </>
          )}
          {step === 1 && <EquipmentSection draft={draft} update={update} />}
          {step === 2 && <PrintersSection draft={draft} update={update} />}
          {step === 3 && (
            <ScheduleSection
              draft={draft}
              update={update}
              saveEnvelope={{ kind: 'create', slug }}
              onRulesPendingChange={setScheduleRulesPending}
            />
          )}
          {step === 4 && <CopySection draft={draft} update={update} />}
          {last && <Summary slug={slug} draft={draft} />}
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
          <ErrorNotice error={mutation.error} />
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                戻る
              </Button>
            )}
            {last ? (
              <Button
                disabled={mutation.isPending || scheduleRulesPending}
                onClick={create}
              >
                {mutation.isPending ? '作成しています…' : 'イベントを作成'}
              </Button>
            ) : (
              <Button
                disabled={
                  !stepReady(step, slug, draft) ||
                  (step === 3 && scheduleRulesPending)
                }
                onClick={() => setStep(step + 1)}
              >
                次へ
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Summary({ slug, draft }: { slug: string; draft: EventDraft }) {
  const rows: [string, string][] = [
    ['slug', slug],
    ['イベント名', draft.title],
    ['タイムゾーン', draft.timeZone],
    [
      '期間 (現地時間)',
      `${draft.start.date} ${draft.start.time} 〜 ${draft.end.date} ${draft.end.time}`,
    ],
    ['採番範囲', draft.numberScope === 'daily' ? '日ごと' : 'イベント通し'],
    [
      '機材',
      draft.equipment.map((item) => `${item.label} (${item.id})`).join('、'),
    ],
    [
      'プリンター',
      draft.printers.map((item) => `${item.label} (${item.id})`).join('、'),
    ],
    [
      'スケジュール',
      draft.schedule
        .map(
          (item) =>
            `${item.date} ${item.firstStart}〜${item.lastStart} (${item.experienceMinutes}分 + ${item.turnoverMinutes}分)`,
        )
        .join(' / '),
    ],
  ];
  return (
    <dl className="grid gap-2 text-sm">
      {rows.map(([name, value]) => (
        <div key={name} className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold">{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
