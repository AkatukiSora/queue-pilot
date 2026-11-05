import { createContext, type ReactNode, useContext } from 'react';

/** イベント設定のタイムゾーンで日時を表示するための整形関数群。 */
export type EventTime = {
  timeZone: string;
  date: (value: string) => string;
  time: (value: string) => string;
  dateTime: (value: string) => string;
};

/**
 * 予約一覧の取得前など、イベントのタイムゾーンをまだ知らない間だけ使う表示用の既定値。
 * UTC であることを `dateTime` の表記に明示し、特定地域の時刻に見せない。
 */
export const UNKNOWN_EVENT_TIME_ZONE = 'UTC';

export function createEventTime(timeZone: string): EventTime {
  // 不正な IANA 名は Intl が RangeError を投げる。握りつぶさずに表面化させる。
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
  const parts = (value: string) => {
    const result = formatter.formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      result.find((item) => item.type === type)?.value ?? '';
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      time: `${part('hour')}:${part('minute')}`,
      zone: part('timeZoneName'),
    };
  };
  return {
    timeZone,
    date: (value) => parts(value).date,
    time: (value) => parts(value).time,
    dateTime: (value) => {
      const { date, time, zone } = parts(value);
      return `${date} ${time} (${zone})`;
    },
  };
}

const EventTimeContext = createContext<EventTime | null>(null);

export function EventTimeProvider({
  value,
  children,
}: {
  value: EventTime;
  children: ReactNode;
}) {
  return (
    <EventTimeContext.Provider value={value}>
      {children}
    </EventTimeContext.Provider>
  );
}

export function useEventTime(): EventTime {
  const value = useContext(EventTimeContext);
  if (value === null) {
    throw new Error('EventTimeProvider の内側で使用してください。');
  }
  return value;
}
