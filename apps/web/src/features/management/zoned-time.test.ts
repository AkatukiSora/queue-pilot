import { describe, expect, it } from 'vitest';
import { instantToWall, isValidTimeZone, wallToInstant } from './zoned-time.ts';

describe('wallToInstant', () => {
  it('converts Tokyo and a non-whole-hour zone without assuming JST', () => {
    expect(
      wallToInstant({ date: '2026-11-03', time: '10:05' }, 'Asia/Tokyo'),
    ).toEqual({ kind: 'ok', instant: '2026-11-03T01:05:00.000Z' });
    expect(
      wallToInstant({ date: '2026-11-03', time: '10:05' }, 'Asia/Kolkata'),
    ).toEqual({ kind: 'ok', instant: '2026-11-03T04:35:00.000Z' });
  });

  it('follows daylight saving time on both sides of a transition', () => {
    expect(
      wallToInstant({ date: '2026-03-07', time: '12:00' }, 'America/New_York'),
    ).toEqual({ kind: 'ok', instant: '2026-03-07T17:00:00.000Z' });
    expect(
      wallToInstant({ date: '2026-03-09', time: '12:00' }, 'America/New_York'),
    ).toEqual({ kind: 'ok', instant: '2026-03-09T16:00:00.000Z' });
  });

  it('reports nonexistent and ambiguous local times instead of guessing', () => {
    expect(
      wallToInstant({ date: '2026-03-08', time: '02:30' }, 'America/New_York'),
    ).toEqual({ kind: 'nonexistent' });
    expect(
      wallToInstant({ date: '2026-11-01', time: '01:30' }, 'America/New_York'),
    ).toEqual({ kind: 'ambiguous' });
  });

  it('rejects malformed or overflowing input', () => {
    expect(wallToInstant({ date: '2026-02-30', time: '10:00' }, 'UTC')).toEqual(
      { kind: 'invalid' },
    );
    expect(wallToInstant({ date: '2026-02-03', time: '24:00' }, 'UTC')).toEqual(
      { kind: 'invalid' },
    );
  });
});

describe('instantToWall', () => {
  it('renders the same instant in the event time zone', () => {
    expect(instantToWall('2026-11-03T01:05:00.000Z', 'Asia/Tokyo')).toEqual({
      date: '2026-11-03',
      time: '10:05',
    });
    expect(
      instantToWall('2026-11-03T01:05:00.000Z', 'Pacific/Auckland'),
    ).toEqual({ date: '2026-11-03', time: '14:05' });
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names only', () => {
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('+09:00')).toBe(false);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
