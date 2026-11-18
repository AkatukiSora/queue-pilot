const DAY_MS = 86_400_000;

export type WallTime = { date: string; time: string };

export type WallToInstant =
  | { kind: 'ok'; instant: string }
  | { kind: 'invalid' }
  | { kind: 'nonexistent' }
  | { kind: 'ambiguous' };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** 不正な IANA 名は Intl が RangeError を投げる (呼び出し側が先に検証する)。 */
function zoneFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallParts(epochMs: number, timeZone: string) {
  const parts = zoneFormatter(timeZone).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
    asUtcMs: Date.UTC(
      Number(part('year')),
      Number(part('month')) - 1,
      Number(part('day')),
      Number(part('hour')),
      Number(part('minute')),
      Number(part('second')),
    ),
  };
}

/** その時点の UTC からの offset (ms)。 */
function offsetMs(epochMs: number, timeZone: string) {
  return wallParts(epochMs, timeZone).asUtcMs - epochMs;
}

export function isValidTimeZone(timeZone: string) {
  if (timeZone === '' || /^[+-]\d{2}(?::?\d{2})?$/.test(timeZone)) return false;
  try {
    zoneFormatter(timeZone);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/**
 * タイムゾーンの壁時計時刻を UTC instant に変換する。夏時間の切替で存在しない/
 * 二通りある時刻は推測せず、そのまま理由として返す。
 */
export function wallToInstant(
  { date, time }: WallTime,
  timeZone: string,
): WallToInstant {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (matched === null || clock === null) return { kind: 'invalid' };
  const wallMs = Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  if (new Date(wallMs).toISOString().slice(0, 10) !== date) {
    return { kind: 'invalid' };
  }
  const offsets = new Set([
    offsetMs(wallMs - DAY_MS, timeZone),
    offsetMs(wallMs + DAY_MS, timeZone),
  ]);
  const candidates = new Set<number>();
  for (const offset of offsets) {
    const epoch = wallMs - offset;
    if (offsetMs(epoch, timeZone) === offset) candidates.add(epoch);
  }
  if (candidates.size === 0) return { kind: 'nonexistent' };
  if (candidates.size > 1) return { kind: 'ambiguous' };
  const [epoch] = candidates;
  return { kind: 'ok', instant: new Date(epoch as number).toISOString() };
}

/** UTC instant をタイムゾーンの壁時計時刻へ。表示・編集フォームの初期値用。 */
export function instantToWall(instant: string, timeZone: string): WallTime {
  const { date, time } = wallParts(Date.parse(instant), timeZone);
  return { date, time };
}
