import type { InvalidTransition, Result } from './result.ts';

export const ticketStatuses = [
  'waiting',
  'called',
  'served',
  'cancelled',
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const cancelReasons = ['visitor', 'staff', 'no_show'] as const;
export type CancelReason = (typeof cancelReasons)[number];

export type TicketState =
  | { status: 'waiting' | 'called' | 'served'; cancelReason?: never }
  | { status: 'cancelled'; cancelReason: CancelReason };

export type ScheduledTicketState =
  | { status: 'waiting' | 'served'; cancelReason?: never }
  | { status: 'cancelled'; cancelReason: CancelReason };

export type TicketAction =
  | { type: 'issue' }
  | { type: 'call' }
  | { type: 'serve' }
  | { type: 'recall' }
  | { type: 'cancel'; reason: CancelReason };

export function transition(
  ticket: TicketState | null,
  action: TicketAction,
): Result<TicketState, InvalidTransition> {
  const from = ticket?.status ?? 'new';

  switch (action.type) {
    case 'issue':
      if (ticket === null) return { ok: true, value: { status: 'waiting' } };
      break;
    case 'call':
      if (ticket?.status === 'waiting')
        return { ok: true, value: { status: 'called' } };
      break;
    case 'serve':
      if (ticket?.status === 'waiting' || ticket?.status === 'called')
        return { ok: true, value: { status: 'served' } };
      break;
    case 'recall':
      if (ticket?.status === 'called')
        return { ok: true, value: { status: 'waiting' } };
      break;
    case 'cancel':
      if (ticket?.status === 'waiting' || ticket?.status === 'called') {
        return {
          ok: true,
          value: { status: 'cancelled', cancelReason: action.reason },
        };
      }
      break;
  }

  return {
    ok: false,
    error: { kind: 'InvalidTransition', from, action: action.type },
  };
}

export const equipmentValues = [
  'Quest 3',
  'Quest 3S',
  'Steam Frame',
  'Beyond2',
] as const;
export type Equipment = (typeof equipmentValues)[number];
export type InvalidEquipment = { kind: 'InvalidEquipment' };

export function parseEquipment(
  value: string,
): Result<Equipment, InvalidEquipment> {
  if (!(equipmentValues as readonly string[]).includes(value)) {
    return { ok: false, error: { kind: 'InvalidEquipment' } };
  }
  return { ok: true, value: value as Equipment };
}

export type SlotStart = string & { readonly __brand: 'SlotStart' };
export type InvalidSlotStart = { kind: 'InvalidSlotStart' };

export function parseSlotStart(
  value: string,
): Result<SlotStart, InvalidSlotStart> {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(
      value,
    );
  if (match === null) {
    return { ok: false, error: { kind: 'InvalidSlotStart' } };
  }

  const [, date, , , seconds = '00', fraction = '', offset = ''] = match;
  const calendarDate = new Date(`${date}T00:00:00.000Z`);
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== date ||
    (offsetMatch !== null &&
      (Number(offsetMatch[2]) > 14 ||
        Number(offsetMatch[3]) > 59 ||
        (Number(offsetMatch[2]) === 14 && Number(offsetMatch[3]) !== 0)))
  ) {
    return { ok: false, error: { kind: 'InvalidSlotStart' } };
  }

  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    seconds !== '00' ||
    /[1-9]/.test(fraction) ||
    parsed.getUTCSeconds() !== 0 ||
    parsed.getUTCMilliseconds() !== 0
  ) {
    return { ok: false, error: { kind: 'InvalidSlotStart' } };
  }
  return { ok: true, value: parsed.toISOString() as SlotStart };
}

export type Slot = { slotStartsAt: SlotStart; equipment: Equipment };
export type SlotScheduleWindow = {
  date: string;
  firstStart: string;
  lastStart: string;
};
export type InvalidSlotSchedule = { kind: 'InvalidSlotSchedule' };

export function parseSlotSchedule(
  value: string,
): Result<readonly Slot[], InvalidSlotSchedule> {
  let windows: unknown;
  try {
    windows = JSON.parse(value);
  } catch {
    return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
  }
  if (!Array.isArray(windows) || windows.length === 0) {
    return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
  }

  const dates = new Set<string>();
  const slots: Slot[] = [];
  for (const window of windows) {
    if (
      typeof window !== 'object' ||
      window === null ||
      Array.isArray(window) ||
      Object.keys(window).sort().join(',') !== 'date,firstStart,lastStart'
    ) {
      return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
    }
    const { date, firstStart, lastStart } = window as Record<string, unknown>;
    if (
      typeof date !== 'string' ||
      typeof firstStart !== 'string' ||
      typeof lastStart !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      dates.has(date) ||
      !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(firstStart) ||
      !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(lastStart)
    ) {
      return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
    }

    const dateValue = new Date(`${date}T00:00:00.000Z`);
    if (
      !Number.isFinite(dateValue.getTime()) ||
      dateValue.toISOString().slice(0, 10) !== date
    ) {
      return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
    }
    const firstMinutes =
      Number(firstStart.slice(0, 2)) * 60 + Number(firstStart.slice(3));
    const lastMinutes =
      Number(lastStart.slice(0, 2)) * 60 + Number(lastStart.slice(3));
    if (firstMinutes > lastMinutes) {
      return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
    }

    dates.add(date);
    for (let minute = firstMinutes; minute <= lastMinutes; minute += 30) {
      const localTime = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      const parsedStart = parseSlotStart(`${date}T${localTime}:00+09:00`);
      if (!parsedStart.ok) {
        return { ok: false, error: { kind: 'InvalidSlotSchedule' } };
      }
      for (const equipment of equipmentValues) {
        slots.push({ slotStartsAt: parsedStart.value, equipment });
      }
    }
  }
  return { ok: true, value: slots };
}

export type SlotReservation = {
  kind: 'slot';
  slotStartsAt: SlotStart;
  equipment: Equipment;
};
export type LegacyReservation = { kind: 'legacy' };
export type Reservation = SlotReservation | LegacyReservation;
export type LatestChange = {
  from: Reservation;
  to: SlotReservation;
  changedAt: Date;
  comment: string | null;
};

export type TicketNumberScope = 'daily' | 'event';

export function deriveCounterKey(
  scope: TicketNumberScope,
  issuedAt: Date,
): string {
  if (scope === 'event') return 'event';

  let year = '';
  let month = '';
  let day = '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(issuedAt);

  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }

  return `${year}-${month}-${day}`;
}

export type QueuePosition = { counterKey: string; number: number };

export function compareQueuePosition(
  a: QueuePosition,
  b: QueuePosition,
): -1 | 0 | 1 {
  if (a.counterKey < b.counterKey) return -1;
  if (a.counterKey > b.counterKey) return 1;
  if (a.number < b.number) return -1;
  if (a.number > b.number) return 1;
  return 0;
}

export type PublicToken = string & { readonly __brand: 'PublicToken' };
export type InvalidPublicToken = { kind: 'InvalidPublicToken' };

export function parsePublicToken(
  value: string,
): Result<PublicToken, InvalidPublicToken> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) {
    return { ok: false, error: { kind: 'InvalidPublicToken' } };
  }

  return { ok: true, value: value as PublicToken };
}
