import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const manifestPath = fileURLToPath(
  new URL('../test/fixtures/default-tenant-manifest.json', import.meta.url),
);

const validEnvironment = {
  DATABASE_URL: 'postgres://ticket:***@127.0.0.1:5432/ticket',
  ADMIN_TOKEN: 'a'.repeat(32),
  AGENT_TOKEN: 'b'.repeat(32),
  EVENT_END_AT: '2026-11-04T05:00:00.000Z',
  SLOT_SCHEDULE_JSON:
    '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
};

describe('loadConfig', () => {
  it('accepts 32-character tokens and rejects 31-character tokens', () => {
    expect(loadConfig(validEnvironment).adminToken).toHaveLength(32);
    expect(loadConfig(validEnvironment).agentToken).toHaveLength(32);
    expect(() =>
      loadConfig({ ...validEnvironment, ADMIN_TOKEN: 'a'.repeat(31) }),
    ).toThrow('ADMIN_TOKEN');
    expect(() =>
      loadConfig({ ...validEnvironment, AGENT_TOKEN: 'b'.repeat(31) }),
    ).toThrow('AGENT_TOKEN');
  });

  it('validates startup settings once and defaults ticket numbering to daily', () => {
    expect(loadConfig(validEnvironment)).toEqual({
      databaseUrl: validEnvironment.DATABASE_URL,
      adminToken: validEnvironment.ADMIN_TOKEN,
      agentToken: validEnvironment.AGENT_TOKEN,
      eventEndAt: new Date(validEnvironment.EVENT_END_AT),
      numberScope: 'daily',
      slotSchedule: expect.arrayContaining([
        {
          slotStartsAt: '2026-11-03T01:00:00.000Z',
          equipment: 'Quest 3',
        },
        {
          slotStartsAt: '2026-11-04T04:30:00.000Z',
          equipment: 'Beyond2',
        },
      ]),
      legacyEventBaseline: {
        timeZone: 'Asia/Tokyo',
        endsAt: '2026-11-04T05:00:00.000Z',
        numberScope: 'daily',
        equipmentIds: ['beyond2', 'quest-3', 'quest-3s', 'steam-frame'],
      },
    });
    expect(
      loadConfig({ ...validEnvironment, TICKET_NUMBER_SCOPE: 'event' })
        .numberScope,
    ).toBe('event');
  });

  it('fails fast without ADMIN_TOKEN and does not include secret values in errors', () => {
    let message = '';
    try {
      loadConfig({ ...validEnvironment, ADMIN_TOKEN: undefined });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('ADMIN_TOKEN');
    expect(message).not.toContain(validEnvironment.AGENT_TOKEN);
    expect(message).not.toContain('password');
  });

  it('rejects identical tokens, invalid event timestamps, and early event ends', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        AGENT_TOKEN: validEnvironment.ADMIN_TOKEN,
      }),
    ).toThrow('AGENT_TOKEN');
    expect(() =>
      loadConfig({
        ...validEnvironment,
        EVENT_END_AT: '2026-11-04T04:59:59.999Z',
      }),
    ).toThrow('final slot end');
  });

  it('loads the manifest read-only and maps its fixed default event to the legacy API', () => {
    const config = loadConfig({
      ...validEnvironment,
      APP_MANIFEST_PATH: manifestPath,
    });

    expect(config.tenantManifest?.schemaVersion).toBe(1);
    expect(config.eventEndAt.toISOString()).toBe('2026-11-04T05:00:00.000Z');
    expect(config.slotSchedule).toHaveLength(72);
    expect(config.slotSchedule[0]).toEqual({
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Quest 3',
    });
    expect(config.legacyEventBaseline).toBeUndefined();
  });

  it('loads an explicit legacy baseline only from matching legacy environment settings', () => {
    const config = loadConfig({
      ...validEnvironment,
      TICKET_NUMBER_SCOPE: 'daily',
      APP_MANIFEST_PATH: manifestPath,
    });
    expect(config.legacyEventBaseline).toEqual({
      timeZone: 'Asia/Tokyo',
      endsAt: '2026-11-04T05:00:00.000Z',
      numberScope: 'daily',
      equipmentIds: ['beyond2', 'quest-3', 'quest-3s', 'steam-frame'],
    });
  });

  it('rejects mismatched legacy environment values when a manifest is configured', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        APP_MANIFEST_PATH: manifestPath,
        EVENT_END_AT: '2026-11-04T06:00:00.000Z',
      }),
    ).toThrow('EVENT_END_AT differs from the manifest');
  });
});
