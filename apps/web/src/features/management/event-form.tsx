import { Button } from '../../components/ui/button.tsx';
import type { EventDraft, ScheduleDraft } from './event-config.ts';
import { emptySchedule } from './event-config.ts';
import { fieldLabel } from './messages.ts';
import { ReceiptPreview } from './receipt-preview.tsx';
import {
  ScheduleRulesPanel,
  type ScheduleSaveEnvelope,
} from './schedule-rules-panel.tsx';
import { TimeZoneCombobox } from './timezone-combobox.tsx';
import { Field, inputClass, TextInput } from './ui.tsx';
import { isValidTimeZone, wallToInstant } from './zoned-time.ts';

/** ticket 発行後に凍結される項目 (サーバーの changeConstraints.frozenFields)。 */
export type FrozenFields = ReadonlySet<string>;
export const NOT_FROZEN: FrozenFields = new Set();

export type SectionProps = {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  frozen?: FrozenFields;
  /** 編集時、すでに保存済みの printer ID (identity は変更不可)。 */
  lockedPrinterIds?: ReadonlySet<string>;
  /** 使用中 (印刷待ち・印刷中) の printer ID。 */
  printersInUse?: readonly string[];
};

function FrozenNote({
  frozen,
  fields,
}: {
  frozen: FrozenFields;
  fields: string[];
}) {
  const hit = fields.filter((field) => frozen.has(field));
  if (hit.length === 0) return null;
  return (
    <p role="status" className="text-sm font-semibold">
      整理券が発行済みのため、{hit.map(fieldLabel).join('・')}は変更できません。
    </p>
  );
}

function WallInput({
  label,
  value,
  onChange,
  disabled,
  timeZone,
}: {
  label: string;
  value: { date: string; time: string };
  onChange: (value: { date: string; time: string }) => void;
  disabled: boolean;
  timeZone: string;
}) {
  const instant = isValidTimeZone(timeZone)
    ? wallToInstant(value, timeZone)
    : null;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={`${label} (日付)`}>
          <TextInput
            type="date"
            value={value.date}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, date: event.target.value })
            }
          />
        </Field>
        <Field label={`${label} (時刻)`}>
          <TextInput
            type="time"
            value={value.time}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, time: event.target.value })
            }
          />
        </Field>
      </div>
      {instant?.kind === 'ok' && (
        <span className="text-xs text-muted-foreground">
          UTC: {instant.instant}
        </span>
      )}
      {instant !== null && instant.kind !== 'ok' && value.date !== '' && (
        <span className="text-xs text-destructive">
          {instant.kind === 'nonexistent'
            ? '夏時間の切替などで存在しない時刻です。'
            : instant.kind === 'ambiguous'
              ? '夏時間の切替などで 2 通りある時刻です。'
              : '日付と時刻を確認してください。'}
        </span>
      )}
    </div>
  );
}

export function BasicsSection({
  draft,
  update,
  frozen = NOT_FROZEN,
}: SectionProps) {
  return (
    <div className="grid gap-4">
      <Field label="イベント名">
        <TextInput
          name="title"
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
        />
      </Field>
      <TimeZoneCombobox
        label="タイムゾーン (IANA 名)"
        hint="入力して絞り込めます (例: Asia/Tokyo、東京、Tokyo)。会場の現地時間で入力し、内部では UTC の時刻として保存されます。"
        name="timeZone"
        value={draft.timeZone}
        disabled={frozen.has('timeZone')}
        onChange={(timeZone) => update({ timeZone })}
      />
      {draft.timeZone !== '' && !isValidTimeZone(draft.timeZone) && (
        <p role="alert" className="text-sm text-destructive">
          Asia/Tokyo のような IANA 名で指定してください (+09:00 などの offset
          は使えません)。
        </p>
      )}
      <WallInput
        label="開始"
        value={draft.start}
        timeZone={draft.timeZone}
        disabled={frozen.has('startsAt')}
        onChange={(start) => update({ start })}
      />
      <WallInput
        label="終了"
        value={draft.end}
        timeZone={draft.timeZone}
        disabled={frozen.has('endsAt')}
        onChange={(end) => update({ end })}
      />
      <Field
        label="整理券番号の採番範囲"
        hint="「日ごと」は毎日 1 番から、「イベント通し」は期間を通して連番です。"
      >
        <select
          name="numberScope"
          className={inputClass}
          value={draft.numberScope}
          disabled={frozen.has('numberScope')}
          onChange={(event) =>
            update({
              numberScope: event.target.value === 'event' ? 'event' : 'daily',
            })
          }
        >
          <option value="daily">日ごと</option>
          <option value="event">イベント通し</option>
        </select>
      </Field>
      <FrozenNote
        frozen={frozen}
        fields={['timeZone', 'startsAt', 'endsAt', 'numberScope']}
      />
    </div>
  );
}

export function EquipmentSection({
  draft,
  update,
  frozen = NOT_FROZEN,
}: SectionProps) {
  const idsFrozen = frozen.has('equipmentIds');
  const set = (index: number, patch: Partial<{ id: string; label: string }>) =>
    update({
      equipment: draft.equipment.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="grid gap-3">
      <FrozenNote frozen={frozen} fields={['equipmentIds']} />
      <ul className="grid gap-3">
        {draft.equipment.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 行は並びで識別し、ID 自体が編集対象のため
          <li key={index} className="flex flex-wrap items-end gap-3">
            <Field
              label={`機材 ${index + 1} の ID`}
              hint="英小文字・数字・ハイフン"
            >
              <TextInput
                value={item.id}
                disabled={idsFrozen}
                onChange={(event) => set(index, { id: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label={`機材 ${index + 1} の表示名`}>
              <TextInput
                value={item.label}
                onChange={(event) => set(index, { label: event.target.value })}
              />
            </Field>
            {!idsFrozen && draft.equipment.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update({
                    equipment: draft.equipment.filter((_, at) => at !== index),
                  })
                }
              >
                削除
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!idsFrozen && (
        <Button
          className="w-fit"
          variant="outline"
          onClick={() =>
            update({ equipment: [...draft.equipment, { id: '', label: '' }] })
          }
        >
          機材を追加
        </Button>
      )}
    </div>
  );
}

export function ScheduleSection({
  draft,
  update,
  frozen = NOT_FROZEN,
  saveEnvelope,
  onRulesPendingChange,
}: SectionProps & {
  saveEnvelope: ScheduleSaveEnvelope;
  onRulesPendingChange?: (pending: boolean) => void;
}) {
  const locked = frozen.has('schedule');
  const set = (index: number, patch: Partial<ScheduleDraft>) =>
    update({
      schedule: draft.schedule.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="grid gap-3">
      <FrozenNote frozen={frozen} fields={['schedule']} />
      <p className="text-sm text-muted-foreground">
        日付と時刻は、イベントのタイムゾーン ({draft.timeZone || '未設定'})
        の現地時間です。枠の間隔は「体験時間 + 入替時間」です。
      </p>
      {!locked && (
        <ScheduleRulesPanel
          draft={draft}
          update={update}
          saveEnvelope={saveEnvelope}
          onRulesPendingChange={onRulesPendingChange}
        />
      )}
      <ul className="grid gap-4">
        {draft.schedule.map((item, index) => {
          const interval =
            Number(item.experienceMinutes) + Number(item.turnoverMinutes);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は並びで識別する
            <li key={index} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={`日 ${index + 1} の日付`}>
                  <TextInput
                    type="date"
                    value={item.date}
                    disabled={locked}
                    onChange={(event) =>
                      set(index, { date: event.target.value })
                    }
                  />
                </Field>
                <Field label="最初の枠の開始">
                  <TextInput
                    type="time"
                    value={item.firstStart}
                    disabled={locked}
                    onChange={(event) =>
                      set(index, { firstStart: event.target.value })
                    }
                  />
                </Field>
                <Field label="最後の枠の開始">
                  <TextInput
                    type="time"
                    value={item.lastStart}
                    disabled={locked}
                    onChange={(event) =>
                      set(index, { lastStart: event.target.value })
                    }
                  />
                </Field>
                <Field label="体験時間 (分)">
                  <TextInput
                    inputMode="numeric"
                    value={item.experienceMinutes}
                    disabled={locked}
                    onChange={(event) =>
                      set(index, { experienceMinutes: event.target.value })
                    }
                  />
                </Field>
                <Field label="入替時間 (分)">
                  <TextInput
                    inputMode="numeric"
                    value={item.turnoverMinutes}
                    disabled={locked}
                    onChange={(event) =>
                      set(index, { turnoverMinutes: event.target.value })
                    }
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                枠の間隔: {Number.isFinite(interval) ? interval : '-'} 分
              </p>
              {!locked && draft.schedule.length > 1 && (
                <Button
                  className="w-fit"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update({
                      schedule: draft.schedule.filter((_, at) => at !== index),
                    })
                  }
                >
                  この日を削除
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!locked && (
        <Button
          className="w-fit"
          variant="outline"
          onClick={() =>
            update({ schedule: [...draft.schedule, emptySchedule()] })
          }
        >
          日を追加
        </Button>
      )}
    </div>
  );
}

export function PrintersSection({
  draft,
  update,
  lockedPrinterIds,
  printersInUse = [],
}: SectionProps) {
  const set = (index: number, patch: Partial<{ id: string; label: string }>) =>
    update({
      printers: draft.printers.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="grid gap-3">
      {printersInUse.length > 0 && (
        <p role="status" className="text-sm font-semibold">
          印刷待ち・印刷中のジョブがあるプリンター: {printersInUse.join('、')}
          。これらは印刷が完了するまで無効化できません。
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        保存済みプリンターの ID
        は変更できません。既定のプリンターを変えても、これから作る印刷だけに適用されます。
      </p>
      <ul className="grid gap-3">
        {draft.printers.map((item, index) => {
          const locked = lockedPrinterIds?.has(item.id) ?? false;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は並びで識別し、ID 自体が編集対象のため
            <li key={index} className="flex flex-wrap items-end gap-3">
              <Field
                label={`プリンター ${index + 1} の ID`}
                hint="英小文字・数字・ハイフン"
              >
                <TextInput
                  value={item.id}
                  disabled={locked}
                  onChange={(event) => set(index, { id: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label={`プリンター ${index + 1} の表示名`}>
                <TextInput
                  value={item.label}
                  onChange={(event) =>
                    set(index, { label: event.target.value })
                  }
                />
              </Field>
              {draft.printers.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update({
                      printers: draft.printers.filter((_, at) => at !== index),
                    })
                  }
                >
                  削除
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        className="w-fit"
        variant="outline"
        onClick={() =>
          update({ printers: [...draft.printers, { id: '', label: '' }] })
        }
      >
        プリンターを追加
      </Button>
      <Field label="既定のプリンター">
        <select
          name="defaultPrinterId"
          className={inputClass}
          value={draft.defaultPrinterId}
          onChange={(event) => update({ defaultPrinterId: event.target.value })}
        >
          <option value="">選択してください</option>
          {draft.printers
            .filter((printer) => printer.id !== '')
            .map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.label || printer.id} ({printer.id})
              </option>
            ))}
        </select>
      </Field>
    </div>
  );
}

export function CopySection({ draft, update }: SectionProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-4">
        <p className="text-sm text-muted-foreground">
          すでに発行された整理券と印刷データは書き換わらず、以後の発行から反映されます。
        </p>
        <Field label="レシートのタイトル">
          <TextInput
            name="receiptTitle"
            value={draft.receiptTitle}
            onChange={(event) => update({ receiptTitle: event.target.value })}
          />
        </Field>
        <Field label="来場時の案内文">
          <textarea
            name="arrivalGuidance"
            className={`${inputClass} min-h-24 py-2`}
            value={draft.arrivalGuidance}
            onChange={(event) =>
              update({ arrivalGuidance: event.target.value })
            }
          />
        </Field>
      </div>
      <ReceiptPreview
        title={draft.receiptTitle}
        arrivalGuidance={draft.arrivalGuidance}
      />
    </div>
  );
}
