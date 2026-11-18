import {
  instantToWall,
  isValidTimeZone,
  type WallTime,
  wallToInstant,
} from './zoned-time.ts';

/** API の event config (id/slug を含まない業務設定)。サーバーの検証が正本。 */
export type EventConfig = {
  title: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  numberScope: 'daily' | 'event';
  equipment: { id: string; label: string }[];
  schedule: {
    date: string;
    firstStart: string;
    lastStart: string;
    intervalMinutes: number;
    experienceMinutes: number;
    turnoverMinutes: number;
  }[];
  copy: { receiptTitle: string; arrivalGuidance: string };
  defaultPrinterId: string;
  printers: { id: string; label: string }[];
};

export type ScheduleDraft = {
  date: string;
  firstStart: string;
  lastStart: string;
  experienceMinutes: string;
  turnoverMinutes: string;
};

/** フォーム編集用。日時は event の timezone の壁時計時刻で持つ。 */
export type EventDraft = {
  title: string;
  timeZone: string;
  start: WallTime;
  end: WallTime;
  numberScope: 'daily' | 'event';
  equipment: { id: string; label: string }[];
  schedule: ScheduleDraft[];
  receiptTitle: string;
  arrivalGuidance: string;
  defaultPrinterId: string;
  printers: { id: string; label: string }[];
};

export const emptySchedule = (): ScheduleDraft => ({
  date: '',
  firstStart: '10:00',
  lastStart: '16:00',
  experienceMinutes: '10',
  turnoverMinutes: '5',
});

/** 新規 event wizard の初期値。1 機材 / 1 printer / 1 schedule を最初から持つ。 */
export function emptyEventDraft(timeZone: string): EventDraft {
  return {
    title: '',
    timeZone,
    start: { date: '', time: '09:00' },
    end: { date: '', time: '18:00' },
    numberScope: 'daily',
    equipment: [{ id: '', label: '' }],
    schedule: [emptySchedule()],
    receiptTitle: '',
    arrivalGuidance: '',
    defaultPrinterId: '',
    printers: [{ id: '', label: '' }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`設定の ${name} が不正です。`);
  return value;
}

function count(value: unknown, name: string): number {
  if (typeof value !== 'number') throw new Error(`設定の ${name} が不正です。`);
  return value;
}

function idLabels(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`設定の ${name} が不正です。`);
  return value.map((item) => {
    if (!isRecord(item)) throw new Error(`設定の ${name} が不正です。`);
    return { id: text(item.id, name), label: text(item.label, name) };
  });
}

/** サーバーが返した不透明な config を、境界で一度だけ型付けする。 */
export function parseEventConfig(value: unknown): EventConfig {
  if (!isRecord(value) || !isRecord(value.copy)) {
    throw new Error('イベント設定を読み取れませんでした。');
  }
  const numberScope = value.numberScope;
  if (numberScope !== 'daily' && numberScope !== 'event') {
    throw new Error('設定の numberScope が不正です。');
  }
  if (!Array.isArray(value.schedule)) {
    throw new Error('設定の schedule が不正です。');
  }
  return {
    title: text(value.title, 'title'),
    timeZone: text(value.timeZone, 'timeZone'),
    startsAt: text(value.startsAt, 'startsAt'),
    endsAt: text(value.endsAt, 'endsAt'),
    numberScope,
    equipment: idLabels(value.equipment, 'equipment'),
    schedule: value.schedule.map((item) => {
      if (!isRecord(item)) throw new Error('設定の schedule が不正です。');
      return {
        date: text(item.date, 'schedule.date'),
        firstStart: text(item.firstStart, 'schedule.firstStart'),
        lastStart: text(item.lastStart, 'schedule.lastStart'),
        intervalMinutes: count(item.intervalMinutes, 'schedule.interval'),
        experienceMinutes: count(item.experienceMinutes, 'schedule.experience'),
        turnoverMinutes: count(item.turnoverMinutes, 'schedule.turnover'),
      };
    }),
    copy: {
      receiptTitle: text(value.copy.receiptTitle, 'copy.receiptTitle'),
      arrivalGuidance: text(value.copy.arrivalGuidance, 'copy.arrivalGuidance'),
    },
    defaultPrinterId: text(value.defaultPrinterId, 'defaultPrinterId'),
    printers: idLabels(value.printers, 'printers'),
  };
}

export function draftFromConfig(config: EventConfig): EventDraft {
  const zone = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  return {
    title: config.title,
    timeZone: config.timeZone,
    start: instantToWall(config.startsAt, zone),
    end: instantToWall(config.endsAt, zone),
    numberScope: config.numberScope,
    equipment: config.equipment.map((item) => ({ ...item })),
    schedule: config.schedule.map((item) => ({
      date: item.date,
      firstStart: item.firstStart,
      lastStart: item.lastStart,
      experienceMinutes: String(item.experienceMinutes),
      turnoverMinutes: String(item.turnoverMinutes),
    })),
    receiptTitle: config.copy.receiptTitle,
    arrivalGuidance: config.copy.arrivalGuidance,
    defaultPrinterId: config.defaultPrinterId,
    printers: config.printers.map((item) => ({ ...item })),
  };
}

export type DraftConversion =
  | { ok: true; config: EventConfig }
  | { ok: false; issues: string[] };

const WALL_ERROR = {
  invalid: '日付と時刻の形式が正しくありません。',
  nonexistent: '夏時間の切替などで、その時刻は存在しません。',
  ambiguous: '夏時間の切替などで、その時刻は 2 通りあり決められません。',
} as const;

function minutes(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * フォームの値を API の config へ変換する。ここで見るのは変換に必要な形式
 * (timezone、壁時計→UTC instant、分の整数) だけ。業務ルールの検証と
 * 受理はサーバーが行い、その結果をそのまま表示する。
 */
export function draftToConfig(
  draft: EventDraft,
  original?: EventConfig,
): DraftConversion {
  const issues: string[] = [];
  if (!isValidTimeZone(draft.timeZone)) {
    return {
      ok: false,
      issues: [
        'タイムゾーンは Asia/Tokyo のような IANA 名で指定してください。',
      ],
    };
  }
  // 編集していない境界は元の文字列をそのまま返す (表記だけの差分を作らない)。
  const instant = (label: string, wall: WallTime, previous?: string) => {
    if (
      previous !== undefined &&
      original?.timeZone === draft.timeZone &&
      JSON.stringify(instantToWall(previous, draft.timeZone)) ===
        JSON.stringify(wall)
    ) {
      return previous;
    }
    const result = wallToInstant(wall, draft.timeZone);
    if (result.kind !== 'ok') {
      issues.push(`${label}: ${WALL_ERROR[result.kind]}`);
      return '';
    }
    return result.instant;
  };
  const startsAt = instant('開始', draft.start, original?.startsAt);
  const endsAt = instant('終了', draft.end, original?.endsAt);
  const schedule = draft.schedule.map((item, index) => {
    const experience = minutes(item.experienceMinutes);
    const turnover = minutes(item.turnoverMinutes);
    if (experience === null || turnover === null) {
      issues.push(
        `スケジュール ${index + 1}: 体験時間と入替時間は 0 以上の整数 (分) で入力してください。`,
      );
    }
    return {
      date: item.date,
      firstStart: item.firstStart,
      lastStart: item.lastStart,
      intervalMinutes: (experience ?? 0) + (turnover ?? 0),
      experienceMinutes: experience ?? 0,
      turnoverMinutes: turnover ?? 0,
    };
  });
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    config: {
      title: draft.title,
      timeZone: draft.timeZone,
      startsAt,
      endsAt,
      numberScope: draft.numberScope,
      equipment: draft.equipment,
      schedule,
      copy: {
        receiptTitle: draft.receiptTitle,
        arrivalGuidance: draft.arrivalGuidance,
      },
      defaultPrinterId: draft.defaultPrinterId,
      printers: draft.printers,
    },
  };
}
