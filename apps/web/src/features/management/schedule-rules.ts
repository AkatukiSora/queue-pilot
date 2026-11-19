import type { ScheduleDraft } from './event-config.ts';
import { wallToInstant } from './zoned-time.ts';

/** 1 日分の時間帯 (日付を除く)。フォームの値のまま文字列で持つ。 */
export type SlotSpec = Omit<ScheduleDraft, 'date'>;

export type WeekdayRule = {
  mode: 'default' | 'off' | 'custom';
  spec: SlotSpec;
};

export type ExceptionRule = {
  date: string;
  mode: 'off' | 'custom';
  spec: SlotSpec;
};

/**
 * 画面でだけ使う入力。サーバーには保存せず、日付ごとの schedule 配列へ
 * 展開した結果だけが正本になる。
 */
export type ScheduleRules = {
  start: string;
  end: string;
  base: SlotSpec;
  /** 0 = 日曜 … 6 = 土曜 (event の暦の曜日)。 */
  weekdays: WeekdayRule[];
  exceptions: ExceptionRule[];
};

export const WEEKDAY_LABELS = [
  '日',
  '月',
  '火',
  '水',
  '木',
  '金',
  '土',
] as const;

/** API の設定 body の上限 (サーバーの bodyLimit と同じ。緩めない)。 */
export const REQUEST_BODY_LIMIT_BYTES = 16 * 1024;

const DAY_MS = 86_400_000;

export const defaultSlotSpec = (): SlotSpec => ({
  firstStart: '10:00',
  lastStart: '16:00',
  experienceMinutes: '10',
  turnoverMinutes: '5',
});

export function emptyRules(
  start = '',
  end = '',
  base?: SlotSpec,
): ScheduleRules {
  return {
    start,
    end,
    base: base ?? defaultSlotSpec(),
    weekdays: WEEKDAY_LABELS.map(() => ({
      mode: 'default' as const,
      spec: defaultSlotSpec(),
    })),
    exceptions: [],
  };
}

function parseDate(value: string): number | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (matched === null) return null;
  const ms = Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
  );
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/**
 * 日付 (event の暦の YYYY-MM-DD) は壁時計の暦そのものなので、曜日は
 * 暦の演算だけで決まり、UTC offset や夏時間の影響を受けない。
 */
function weekdayOf(dateMs: number): number {
  return new Date(dateMs).getUTCDay();
}

function specIssue(label: string, spec: SlotSpec): string | null {
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!clock.test(spec.firstStart) || !clock.test(spec.lastStart)) {
    return `${label}: 開始時刻を入力してください。`;
  }
  if (
    !/^\d+$/.test(spec.experienceMinutes) ||
    !/^\d+$/.test(spec.turnoverMinutes)
  ) {
    return `${label}: 体験時間と入替時間は 0 以上の整数 (分) で入力してください。`;
  }
  return null;
}

export type Expansion = { days: ScheduleDraft[]; issues: string[] };

/**
 * 優先順位: 日付の例外 > 曜日ごとの設定 > 期間の既定。
 * 休みの日は結果に含めない。
 */
export function expandRules(rules: ScheduleRules): Expansion {
  const issues: string[] = [];
  const first = parseDate(rules.start);
  const last = parseDate(rules.end);
  if (first === null || last === null) {
    return { days: [], issues: ['期間の開始日と終了日を入力してください。'] };
  }
  if (last < first) {
    return {
      days: [],
      issues: ['期間の終了日は開始日以降にしてください。'],
    };
  }
  const exceptions = new Map<string, ExceptionRule>();
  for (const rule of rules.exceptions) {
    const ms = parseDate(rule.date);
    if (ms === null) {
      issues.push('日付の例外: 日付を入力してください。');
    } else if (ms < first || ms > last) {
      issues.push(`日付の例外 ${rule.date}: 期間の外の日付です。`);
    } else if (exceptions.has(rule.date)) {
      issues.push(`日付の例外 ${rule.date}: 同じ日付が重複しています。`);
    } else {
      exceptions.set(rule.date, rule);
    }
  }
  const baseIssue = specIssue('期間の既定', rules.base);
  if (baseIssue !== null) issues.push(baseIssue);
  if (issues.length > 0) return { days: [], issues };

  const days: ScheduleDraft[] = [];
  let scheduleBytes = 2;
  const reported = new Set<string>();
  const check = (label: string, spec: SlotSpec) => {
    const issue = reported.has(label) ? null : specIssue(label, spec);
    reported.add(label);
    if (issue !== null) issues.push(issue);
  };
  for (let ms = first; ms <= last; ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const weekday = weekdayOf(ms);
    const exception = exceptions.get(date);
    const weekdayRule = rules.weekdays[weekday];
    let spec: SlotSpec | null;
    if (exception !== undefined) {
      if (exception.mode === 'custom') {
        check(`日付の例外 ${date}`, exception.spec);
      }
      spec = exception.mode === 'off' ? null : exception.spec;
    } else if (weekdayRule?.mode === 'off') {
      spec = null;
    } else if (weekdayRule?.mode === 'custom') {
      check(`${WEEKDAY_LABELS[weekday]}曜日`, weekdayRule.spec);
      spec = weekdayRule.spec;
    } else {
      spec = rules.base;
    }
    if (spec !== null) {
      const day = { date, ...spec };
      const nextBytes =
        scheduleBytes + bodyBytes([day]) - 2 + (days.length > 0 ? 1 : 0);
      if (nextBytes > REQUEST_BODY_LIMIT_BYTES) {
        return {
          days: [],
          issues: [
            '生成した日付一覧だけで設定 body の上限 16 KiB を超えます。期間を短くするか、休みの日を増やしてください。',
          ],
        };
      }
      scheduleBytes = nextBytes;
      days.push(day);
    }
  }
  if (issues.length > 0) return { days: [], issues };
  return { days, issues: [] };
}

export type ScheduleDiff = {
  added: string[];
  removed: string[];
  changed: string[];
};

const sameDay = (a: ScheduleDraft, b: ScheduleDraft) =>
  a.firstStart === b.firstStart &&
  a.lastStart === b.lastStart &&
  Number(a.experienceMinutes) === Number(b.experienceMinutes) &&
  Number(a.turnoverMinutes) === Number(b.turnoverMinutes);

/** 反映前後の日付配列の差分。既存の日が消える/変わることを利用者に示す。 */
export function diffSchedule(
  current: readonly ScheduleDraft[],
  next: readonly ScheduleDraft[],
): ScheduleDiff {
  const before = new Map(current.map((day) => [day.date, day]));
  const after = new Map(next.map((day) => [day.date, day]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const [date, day] of after) {
    const previous = before.get(date);
    if (previous === undefined) added.push(date);
    else if (!sameDay(previous, day)) changed.push(date);
  }
  const removed = [...before.keys()].filter((date) => !after.has(date));
  return { added, removed, changed };
}

/**
 * 夏時間の切替で存在しない/2 通りになる開始時刻のある日。
 * サーバーの判断を先取りせず、注意として示すだけ。
 */
export function dstWarnings(
  days: readonly ScheduleDraft[],
  timeZone: string,
): string[] {
  const warnings: string[] = [];
  for (const day of days) {
    for (const [label, time] of [
      ['最初', day.firstStart],
      ['最後', day.lastStart],
    ] as const) {
      const result = wallToInstant({ date: day.date, time }, timeZone);
      if (result.kind === 'nonexistent' || result.kind === 'ambiguous') {
        warnings.push(
          `${day.date} の${label}の枠 (${time}): 夏時間の切替で${
            result.kind === 'nonexistent' ? '存在しない' : '2 通りある'
          }時刻です。`,
        );
      }
    }
  }
  return warnings;
}

const encoder = new TextEncoder();

/** 送信する JSON body の UTF-8 バイト数。 */
export function bodyBytes(body: unknown): number {
  return encoder.encode(JSON.stringify(body)).length;
}
