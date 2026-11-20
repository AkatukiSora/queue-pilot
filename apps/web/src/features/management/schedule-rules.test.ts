import { describe, expect, it } from 'vitest';
import {
  bodySizeIssue,
  draftFromConfig,
  draftToConfig,
  type EventConfig,
} from './event-config.ts';
import {
  bodyBytes,
  defaultSlotSpec,
  diffSchedule,
  dstWarnings,
  emptyRules,
  expandRules,
  type ScheduleRules,
} from './schedule-rules.ts';

const custom = (firstStart: string, lastStart: string) => ({
  firstStart,
  lastStart,
  experienceMinutes: '20',
  turnoverMinutes: '10',
});

function rules(patch: Partial<ScheduleRules>): ScheduleRules {
  return { ...emptyRules('2026-11-02', '2026-11-08'), ...patch };
}

describe('expandRules', () => {
  it('期間内の全日に既定の時間帯を適用する', () => {
    const { days, issues } = expandRules(rules({}));
    expect(issues).toEqual([]);
    expect(days.map((day) => day.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(days.every((day) => day.firstStart === '10:00')).toBe(true);
  });

  it('日付の例外 > 曜日 > 期間の既定 の順に適用し、休みは生成しない', () => {
    const base = emptyRules('2026-11-02', '2026-11-08');
    const weekdays = base.weekdays.map((rule) => ({ ...rule }));
    weekdays[6] = { mode: 'custom', spec: custom('09:00', '12:00') }; // 土
    weekdays[0] = { mode: 'off', spec: defaultSlotSpec() }; // 日
    weekdays[3] = { mode: 'off', spec: defaultSlotSpec() }; // 水
    const { days, issues } = expandRules({
      ...base,
      weekdays,
      exceptions: [
        { date: '2026-11-04', mode: 'custom', spec: custom('13:00', '15:00') }, // 水の休みを上書き
        { date: '2026-11-07', mode: 'off', spec: defaultSlotSpec() }, // 土の別時間帯より優先して休み
        { date: '2026-11-03', mode: 'custom', spec: custom('11:00', '14:00') },
      ],
    });
    expect(issues).toEqual([]);
    const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
    expect(Object.keys(byDate)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(byDate['2026-11-04']?.firstStart).toBe('13:00');
    expect(byDate['2026-11-03']?.firstStart).toBe('11:00');
    expect(byDate['2026-11-02']?.firstStart).toBe('10:00');
  });

  it('土日だけ別の時間帯にできる', () => {
    const base = emptyRules('2026-11-06', '2026-11-09');
    const weekdays = base.weekdays.map((rule) => ({ ...rule }));
    weekdays[6] = { mode: 'custom', spec: custom('09:00', '12:00') };
    weekdays[0] = { mode: 'custom', spec: custom('09:00', '12:00') };
    const { days } = expandRules({ ...base, weekdays });
    expect(days.map((day) => `${day.date} ${day.firstStart}`)).toEqual([
      '2026-11-06 10:00', // 金
      '2026-11-07 09:00', // 土
      '2026-11-08 09:00', // 日
      '2026-11-09 10:00', // 月
    ]);
  });

  it('夏時間の切替をまたぐ期間でも日付と曜日が連続する (America/New_York)', () => {
    // 2026-03-08 (日) に夏時間開始、2026-11-01 (日) に終了。
    const base = emptyRules('2026-03-06', '2026-03-10');
    const weekdays = base.weekdays.map((rule) => ({ ...rule }));
    weekdays[0] = { mode: 'off', spec: defaultSlotSpec() };
    const spring = expandRules({ ...base, weekdays });
    expect(spring.days.map((day) => day.date)).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-09',
      '2026-03-10',
    ]);
    const fall = expandRules({
      ...base,
      start: '2026-10-30',
      end: '2026-11-02',
      weekdays,
    });
    expect(fall.days.map((day) => day.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-02',
    ]);
  });

  it('一年を超える期間でも少ない開催曜日だけを生成できる', () => {
    const base = emptyRules('2026-01-01', '2027-01-03');
    const weekdays: ScheduleRules['weekdays'] = base.weekdays.map(() => ({
      mode: 'off',
      spec: defaultSlotSpec(),
    }));
    weekdays[6] = { mode: 'custom', spec: custom('09:00', '12:00') };
    const result = expandRules({ ...base, weekdays });
    expect(result.issues).toEqual([]);
    expect(result.days.at(-1)?.date).toBe('2027-01-02');
    expect(result.days.length).toBeGreaterThan(0);
  });

  it('月末・うるう日・年またぎを暦どおりに数える', () => {
    const leap = expandRules(rules({ start: '2028-02-28', end: '2028-03-01' }));
    expect(leap.days.map((day) => day.date)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    const year = expandRules(rules({ start: '2026-12-31', end: '2027-01-01' }));
    expect(year.days.map((day) => day.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
    ]);
  });

  it('不正な入力は理由を返し、日を作らない', () => {
    expect(expandRules(rules({ start: '' })).issues).toHaveLength(1);
    expect(
      expandRules(rules({ start: '2026-11-08', end: '2026-11-02' })).issues,
    ).toEqual(['期間の終了日は開始日以降にしてください。']);
    const oversize = expandRules(
      rules({ start: '2026-01-01', end: '2026-12-31' }),
    );
    expect(oversize.days).toEqual([]);
    expect(oversize.issues[0]).toContain('16 KiB');
    expect(
      expandRules(
        rules({ base: { ...defaultSlotSpec(), experienceMinutes: '' } }),
      ).issues,
    ).toHaveLength(1);
    const outside = expandRules(
      rules({
        exceptions: [
          { date: '2026-12-01', mode: 'off', spec: defaultSlotSpec() },
          { date: '2026-11-03', mode: 'off', spec: defaultSlotSpec() },
          { date: '2026-11-03', mode: 'off', spec: defaultSlotSpec() },
        ],
      }),
    );
    expect(outside.days).toEqual([]);
    expect(outside.issues).toHaveLength(2);
  });
});

describe('diffSchedule', () => {
  const day = (date: string, firstStart = '10:00') => ({
    date,
    firstStart,
    lastStart: '16:00',
    experienceMinutes: '10',
    turnoverMinutes: '5',
  });
  it('追加・変更・削除された日を分けて返す', () => {
    expect(
      diffSchedule(
        [day('2026-11-02'), day('2026-11-03'), day('2026-11-04')],
        [day('2026-11-03', '09:00'), day('2026-11-04'), day('2026-11-05')],
      ),
    ).toEqual({
      added: ['2026-11-05'],
      removed: ['2026-11-02'],
      changed: ['2026-11-03'],
    });
  });
});

describe('dstWarnings', () => {
  const day = (date: string, firstStart: string) => ({
    date,
    firstStart,
    lastStart: '16:00',
    experienceMinutes: '10',
    turnoverMinutes: '5',
  });
  it('存在しない時刻と 2 通りある時刻を示す (America/New_York)', () => {
    const warnings = dstWarnings(
      [day('2026-03-08', '02:30'), day('2026-11-01', '01:30')],
      'America/New_York',
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('存在しない');
    expect(warnings[1]).toContain('2 通り');
  });
  it('夏時間のない UTC+9 では警告しない', () => {
    expect(
      dstWarnings(
        [day('2026-03-08', '02:30'), day('2026-11-01', '01:30')],
        'Asia/Tokyo',
      ),
    ).toEqual([]);
  });
});

describe('展開結果と保存内容', () => {
  const config: EventConfig = {
    title: 'e',
    timeZone: 'America/New_York',
    startsAt: '2026-11-02T14:00:00.000Z',
    endsAt: '2026-11-08T23:00:00.000Z',
    numberScope: 'daily',
    equipment: [{ id: 'a', label: 'A' }],
    schedule: [
      {
        date: '2026-11-02',
        firstStart: '09:00',
        lastStart: '12:00',
        intervalMinutes: 15,
        experienceMinutes: 10,
        turnoverMinutes: 5,
      },
    ],
    copy: { receiptTitle: 't', arrivalGuidance: 'g' },
    defaultPrinterId: 'p',
    printers: [{ id: 'p', label: 'P' }],
  };

  it('プレビューした日付配列がそのまま保存する schedule になる', () => {
    const draft = draftFromConfig(config);
    // 開始日 (event の暦。UTC ではなく現地の 2026-11-02) が期間の既定になる。
    expect(draft.start.date).toBe('2026-11-02');
    const { days } = expandRules(emptyRules(draft.start.date, draft.end.date));
    const converted = draftToConfig({ ...draft, schedule: days });
    if (!converted.ok) throw new Error('expected ok');
    expect(converted.config.schedule.map((item) => item.date)).toEqual(
      days.map((item) => item.date),
    );
    expect(converted.config.schedule[0]).toMatchObject({
      intervalMinutes: 15,
      experienceMinutes: 10,
      turnoverMinutes: 5,
    });
  });

  it('UTC+9 の instant から event の暦日を選んで生成する', () => {
    const tokyoDraft = draftFromConfig({
      ...config,
      timeZone: 'Asia/Tokyo',
      startsAt: '2026-11-02T15:00:00.000Z',
      endsAt: '2026-11-03T14:59:00.000Z',
      schedule: [
        {
          date: '2026-11-03',
          firstStart: '09:00',
          lastStart: '12:00',
          intervalMinutes: 15,
          experienceMinutes: 10,
          turnoverMinutes: 5,
        },
      ],
    });
    expect(tokyoDraft.start.date).toBe('2026-11-03');
    expect(tokyoDraft.end.date).toBe('2026-11-03');
    expect(
      expandRules(
        emptyRules(tokyoDraft.start.date, tokyoDraft.end.date),
      ).days.map((day) => day.date),
    ).toEqual(['2026-11-03']);
  });

  it('16 KiB を超える body は保存前に理由を返す', () => {
    const schedule = Array.from({ length: 200 }, (_, index) => ({
      date: `2026-01-${String((index % 31) + 1).padStart(2, '0')}`,
      firstStart: '09:00',
      lastStart: '12:00',
      intervalMinutes: 15,
      experienceMinutes: 10,
      turnoverMinutes: 5,
    }));
    const body = {
      expectedRevision: 'a'.repeat(64),
      config: { ...config, schedule },
    };
    expect(bodyBytes(body)).toBeGreaterThan(16 * 1024);
    expect(bodySizeIssue(body)).toContain('16 KiB');
    expect(
      bodySizeIssue({ expectedRevision: 'a'.repeat(64), config }),
    ).toBeNull();
  });
});
