import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { draftToConfig, type EventDraft } from './event-config.ts';
import {
  bodyBytes,
  diffSchedule,
  dstWarnings,
  type ExceptionRule,
  emptyRules,
  expandRules,
  REQUEST_BODY_LIMIT_BYTES,
  type ScheduleRules,
  type SlotSpec,
  WEEKDAY_LABELS,
  type WeekdayRule,
} from './schedule-rules.ts';
import { Field, inputClass, TextInput } from './ui.tsx';

export type ScheduleSaveEnvelope =
  | { kind: 'create'; slug: string }
  | { kind: 'update'; expectedRevision: string };

function SlotFields({
  prefix,
  spec,
  onChange,
}: {
  prefix: string;
  spec: SlotSpec;
  onChange: (spec: SlotSpec) => void;
}) {
  const interval =
    /^\d+$/.test(spec.experienceMinutes) && /^\d+$/.test(spec.turnoverMinutes)
      ? Number(spec.experienceMinutes) + Number(spec.turnoverMinutes)
      : null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={`${prefix}最初の枠の開始`}>
        <TextInput
          type="time"
          value={spec.firstStart}
          onChange={(event) =>
            onChange({ ...spec, firstStart: event.target.value })
          }
        />
      </Field>
      <Field label={`${prefix}最後の枠の開始`}>
        <TextInput
          type="time"
          value={spec.lastStart}
          onChange={(event) =>
            onChange({ ...spec, lastStart: event.target.value })
          }
        />
      </Field>
      <Field label={`${prefix}体験時間 (分)`}>
        <TextInput
          inputMode="numeric"
          value={spec.experienceMinutes}
          onChange={(event) =>
            onChange({ ...spec, experienceMinutes: event.target.value })
          }
        />
      </Field>
      <Field label={`${prefix}入替時間 (分)`}>
        <TextInput
          inputMode="numeric"
          value={spec.turnoverMinutes}
          onChange={(event) =>
            onChange({ ...spec, turnoverMinutes: event.target.value })
          }
        />
      </Field>
      <p className="pb-2 text-sm text-muted-foreground">
        {prefix}枠の間隔:{' '}
        {interval !== null && Number.isFinite(interval) ? interval : '—'} 分
        (体験時間 + 入替時間)
      </p>
    </div>
  );
}

/**
 * 期間・曜日・日付の例外から日付ごとの schedule を作る入力。ルールは保存せず、
 * 「日付の一覧に反映」で draft.schedule を置き換えた結果だけが保存対象になる。
 */
export function ScheduleRulesPanel({
  draft,
  update,
  saveEnvelope,
  onRulesPendingChange,
}: {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  saveEnvelope: ScheduleSaveEnvelope;
  onRulesPendingChange?: (pending: boolean) => void;
}) {
  const [rules, setRules] = useState<ScheduleRules>(() => {
    const first = draft.schedule[0];
    return emptyRules(
      draft.start.date,
      draft.end.date,
      first === undefined
        ? undefined
        : {
            firstStart: first.firstStart,
            lastStart: first.lastStart,
            experienceMinutes: first.experienceMinutes,
            turnoverMinutes: first.turnoverMinutes,
          },
    );
  });
  const [applied, setApplied] = useState(false);
  const [pending, setPending] = useState(false);
  const change = (patch: Partial<ScheduleRules>) => {
    setApplied(false);
    setPending(true);
    onRulesPendingChange?.(true);
    setRules((current) => ({ ...current, ...patch }));
  };
  const setWeekday = (index: number, patch: Partial<WeekdayRule>) =>
    change({
      weekdays: rules.weekdays.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  const setException = (index: number, patch: Partial<ExceptionRule>) =>
    change({
      exceptions: rules.exceptions.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });

  const expansion = expandRules(rules);
  const diff = diffSchedule(draft.schedule, expansion.days);
  const previewDays = pending ? expansion.days : draft.schedule;
  const bodyBytesFor = (schedule: EventDraft['schedule']) => {
    const converted = draftToConfig({ ...draft, schedule });
    if (!converted.ok) return null;
    const body =
      saveEnvelope.kind === 'create'
        ? { slug: saveEnvelope.slug, config: converted.config }
        : {
            expectedRevision: saveEnvelope.expectedRevision,
            config: converted.config,
          };
    return bodyBytes(body);
  };
  const bytes = bodyBytesFor(previewDays);
  const generatedBytes = bodyBytesFor(expansion.days);
  const tooLarge = bytes !== null && bytes > REQUEST_BODY_LIMIT_BYTES;
  const generatedTooLarge =
    generatedBytes !== null && generatedBytes > REQUEST_BODY_LIMIT_BYTES;
  const warnings = dstWarnings(previewDays, draft.timeZone);
  const canApply =
    expansion.issues.length === 0 &&
    expansion.days.length > 0 &&
    !generatedTooLarge;
  const hasExisting = draft.schedule.some((day) => day.date !== '');
  const destructive = diff.removed.length + diff.changed.length > 0;

  return (
    <section
      aria-label="期間・曜日・例外から作成"
      className="grid gap-4 rounded-lg border p-4"
    >
      <h3 className="text-base font-bold">期間・曜日・例外から作成</h3>
      <p className="text-sm text-muted-foreground">
        期間と既定の時間帯を入れ、曜日ごとや日付ごとの違いを足すと、日付ごとの一覧を作ります。優先順位は
        日付の例外 &gt; 曜日 &gt;
        期間の既定です。休みの日は作られません。作成後は下の一覧で 1
        日ずつ調整できます。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="期間の開始日">
          <TextInput
            type="date"
            value={rules.start}
            onChange={(event) => change({ start: event.target.value })}
          />
        </Field>
        <Field label="期間の終了日">
          <TextInput
            type="date"
            value={rules.end}
            onChange={(event) => change({ end: event.target.value })}
          />
        </Field>
      </div>
      <SlotFields
        prefix="既定の"
        spec={rules.base}
        onChange={(base) => change({ base })}
      />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">曜日ごとの設定</legend>
        <ul className="grid gap-3">
          {rules.weekdays.map((rule, index) => {
            const label = WEEKDAY_LABELS[index];
            return (
              <li key={label} className="grid gap-2">
                <Field label={`${label}曜日`}>
                  <select
                    className={inputClass}
                    value={rule.mode}
                    onChange={(event) =>
                      setWeekday(index, {
                        mode:
                          event.target.value === 'off'
                            ? 'off'
                            : event.target.value === 'custom'
                              ? 'custom'
                              : 'default',
                      })
                    }
                  >
                    <option value="default">期間の既定</option>
                    <option value="custom">別の時間帯</option>
                    <option value="off">休み</option>
                  </select>
                </Field>
                {rule.mode === 'custom' && (
                  <SlotFields
                    prefix={`${label}曜日の`}
                    spec={rule.spec}
                    onChange={(spec) => setWeekday(index, { spec })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">日付ごとの例外</legend>
        <ul className="grid gap-3">
          {rules.exceptions.map((rule, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は並びで識別し、日付自体が編集対象のため
            <li key={index} className="grid gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={`例外 ${index + 1} の日付`}>
                  <TextInput
                    type="date"
                    value={rule.date}
                    onChange={(event) =>
                      setException(index, { date: event.target.value })
                    }
                  />
                </Field>
                <Field label={`例外 ${index + 1} の扱い`}>
                  <select
                    className={inputClass}
                    value={rule.mode}
                    onChange={(event) =>
                      setException(index, {
                        mode: event.target.value === 'off' ? 'off' : 'custom',
                      })
                    }
                  >
                    <option value="off">休み</option>
                    <option value="custom">別の時間帯</option>
                  </select>
                </Field>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    change({
                      exceptions: rules.exceptions.filter(
                        (_, at) => at !== index,
                      ),
                    })
                  }
                >
                  例外を削除
                </Button>
              </div>
              {rule.mode === 'custom' && (
                <SlotFields
                  prefix={`例外 ${index + 1} の`}
                  spec={rule.spec}
                  onChange={(spec) => setException(index, { spec })}
                />
              )}
            </li>
          ))}
        </ul>
        <Button
          className="w-fit"
          variant="outline"
          onClick={() =>
            change({
              exceptions: [
                ...rules.exceptions,
                { date: '', mode: 'off', spec: rules.base },
              ],
            })
          }
        >
          例外を追加
        </Button>
      </fieldset>

      <section className="grid gap-2" aria-label="作成結果のプレビュー">
        <h4 className="text-sm font-semibold">
          {pending ? 'ルールから生成する候補' : '保存対象のプレビュー'}
        </h4>
        {pending && (
          <p role="status" className="text-sm">
            候補はまだ日付一覧に反映されていません。反映してから保存してください。
          </p>
        )}
        {expansion.issues.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
            {expansion.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {expansion.issues.length === 0 && (
          <>
            <p role="status" className="text-sm font-semibold">
              {previewDays.length} 日分
              {bytes !== null &&
                ` / ${pending ? '反映後の保存データ' : '保存データ'}の大きさ ${bytes} バイト (上限 ${REQUEST_BODY_LIMIT_BYTES} バイト)`}
            </p>
            {tooLarge && (
              <p role="alert" className="text-sm text-destructive">
                {pending ? '反映後の保存データ' : '保存データ'}が 1
                回の保存の上限 (16 KiB ={` ${REQUEST_BODY_LIMIT_BYTES} バイト`})
                を超えるため反映できません。期間を短くするか、休みの日を増やしてください。
              </p>
            )}
            {warnings.length > 0 && (
              <ul className="list-disc pl-5 text-sm">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {hasExisting && (
              <p className="text-sm">
                いまの一覧との差分: 追加 {diff.added.length} 日 / 変更{' '}
                {diff.changed.length} 日 / 削除 {diff.removed.length} 日
                {diff.removed.length > 0 &&
                  ` (削除: ${diff.removed.join('、')})`}
                {diff.changed.length > 0 &&
                  ` (変更: ${diff.changed.join('、')})`}
              </p>
            )}
            {destructive && (
              <p role="status" className="text-sm font-semibold">
                反映すると、いまの一覧の日が置き換わります。整理券が発行済みの日は、保存時にサーバーが拒否します。
              </p>
            )}
            <ol className="max-h-64 overflow-auto rounded-md border p-2 text-sm">
              {previewDays.map((day) => (
                <li key={day.date}>
                  {day.date} (
                  {
                    WEEKDAY_LABELS[
                      new Date(`${day.date}T00:00:00Z`).getUTCDay()
                    ]
                  }
                  ) {day.firstStart}〜{day.lastStart} / 体験
                  {day.experienceMinutes}分 + 入替{day.turnoverMinutes}分
                </li>
              ))}
            </ol>
          </>
        )}
        <Button
          className="w-fit"
          disabled={!canApply}
          onClick={() => {
            update({ schedule: expansion.days });
            setApplied(true);
            setPending(false);
            onRulesPendingChange?.(false);
          }}
        >
          日付の一覧に反映
        </Button>
        {applied && (
          <p role="status" className="text-sm">
            {draft.schedule.length}{' '}
            日分を一覧に反映しました。保存するまで確定しません。
          </p>
        )}
      </section>
    </section>
  );
}
