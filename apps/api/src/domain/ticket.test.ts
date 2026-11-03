import { describe, expect, it } from 'vitest';
import {
  cancelReasons,
  compareQueuePosition,
  deriveCounterKey,
  parsePublicToken,
  type TicketAction,
  type TicketState,
  transition,
} from './ticket.ts';

const states: Array<TicketState | null> = [
  null,
  { status: 'waiting' },
  { status: 'called' },
  { status: 'served' },
  { status: 'cancelled', cancelReason: 'staff' },
];

const actions: TicketAction[] = [
  { type: 'issue' },
  { type: 'call' },
  { type: 'serve' },
  { type: 'recall' },
  { type: 'cancel', reason: 'visitor' },
];

const validTransitions = new Map<string, TicketState['status']>([
  ['new:issue', 'waiting'],
  ['waiting:call', 'called'],
  ['waiting:serve', 'served'],
  ['waiting:cancel', 'cancelled'],
  ['called:serve', 'served'],
  ['called:recall', 'waiting'],
  ['called:cancel', 'cancelled'],
]);

const transitionCases = states.flatMap((state) =>
  actions.map((action) => ({ state, action })),
);

describe('transition', () => {
  it.each(transitionCases)('$state + $action.type', ({ state, action }) => {
    const result = transition(state, action);
    const expected = validTransitions.get(
      `${state?.status ?? 'new'}:${action.type}`,
    );

    if (expected === undefined) {
      expect(result).toEqual({
        ok: false,
        error: {
          kind: 'InvalidTransition',
          from: state?.status ?? 'new',
          action: action.type,
        },
      });
      return;
    }

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe(expected);
  });

  it.each(cancelReasons)('preserves cancel reason %s', (reason) => {
    for (const state of [
      { status: 'waiting' },
      { status: 'called' },
    ] as const) {
      expect(transition(state, { type: 'cancel', reason })).toEqual({
        ok: true,
        value: { status: 'cancelled', cancelReason: reason },
      });
    }
  });
});

describe('deriveCounterKey', () => {
  it('uses the Tokyo business date on both sides of midnight', () => {
    expect(
      deriveCounterKey('daily', new Date('2026-11-02T14:59:59.999Z')),
    ).toBe('2026-11-02');
    expect(
      deriveCounterKey('daily', new Date('2026-11-02T15:00:00.000Z')),
    ).toBe('2026-11-03');
  });

  it('uses one constant key for event scope', () => {
    expect(
      deriveCounterKey('event', new Date('2026-11-02T14:59:59.999Z')),
    ).toBe('event');
    expect(
      deriveCounterKey('event', new Date('2026-11-02T15:00:00.000Z')),
    ).toBe('event');
  });
});

describe('compareQueuePosition', () => {
  it('compares the full (counter_key, number) order across daily keys', () => {
    expect(
      compareQueuePosition(
        { counterKey: '2026-11-02', number: 99 },
        { counterKey: '2026-11-03', number: 1 },
      ),
    ).toBe(-1);
    expect(
      compareQueuePosition(
        { counterKey: '2026-11-03', number: 2 },
        { counterKey: '2026-11-03', number: 1 },
      ),
    ).toBe(1);
    expect(
      compareQueuePosition(
        { counterKey: 'event', number: 1 },
        { counterKey: 'event', number: 1 },
      ),
    ).toBe(0);
  });
});

describe('parsePublicToken', () => {
  it('brands a 22-character base64url token', () => {
    expect(parsePublicToken('AAAAAAAAAAAAAAAAAAAAAA')).toEqual({
      ok: true,
      value: 'AAAAAAAAAAAAAAAAAAAAAA',
    });
  });

  it.each(['too-short', 'AAAAAAAAAAAAAAAAAAAAA!'])(
    'rejects malformed token %s',
    (value) => {
      expect(parsePublicToken(value)).toEqual({
        ok: false,
        error: { kind: 'InvalidPublicToken' },
      });
    },
  );
});
