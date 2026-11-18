import { describe, expect, it } from 'vitest';
import {
  buildZoneIndex,
  filterZones,
  initialZones,
  listTimeZones,
} from './zone-search.ts';

const all = listTimeZones();
const index = buildZoneIndex(all);

describe('filterZones', () => {
  it('matches IANA names, English names and Japanese aliases', () => {
    expect(filterZones(index, 'tokyo')).toContain('Asia/Tokyo');
    expect(filterZones(index, '東京')).toContain('Asia/Tokyo');
    expect(filterZones(index, 'new york')[0]).toBe('America/New_York');
    expect(filterZones(index, 'ニューヨーク')).toContain('America/New_York');
  });

  it('requires every term and returns nothing for an empty query', () => {
    expect(filterZones(index, '')).toEqual([]);
    expect(filterZones(index, 'tokyo zzzz')).toEqual([]);
  });

  it('prefers prefix matches and caps the result', () => {
    expect(filterZones(index, 'asia/to')[0]).toBe('Asia/Tokyo');
    expect(filterZones(index, 'a', 5)).toHaveLength(5);
  });
});

describe('initialZones', () => {
  it('puts the browser zone first and skips unknown names', () => {
    expect(initialZones('Asia/Kolkata', all)).toEqual([
      'Asia/Kolkata',
      'UTC',
      'Asia/Tokyo',
    ]);
    expect(initialZones('Nowhere/Land', all)).toEqual(['UTC', 'Asia/Tokyo']);
  });
});
