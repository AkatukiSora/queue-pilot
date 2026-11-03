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
      if (ticket?.status === 'called')
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
