import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const validEnvironment = {
  DATABASE_URL: 'postgres://ticket:password@127.0.0.1:5432/ticket',
  ADMIN_TOKEN: 'a'.repeat(32),
  AGENT_TOKEN: 'b'.repeat(32),
  EVENT_END_AT: '2026-11-04T00:00:00.000Z',
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

  it('rejects identical tokens and invalid event timestamps', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        AGENT_TOKEN: validEnvironment.ADMIN_TOKEN,
      }),
    ).toThrow('AGENT_TOKEN');
    expect(() =>
      loadConfig({
        ...validEnvironment,
        EVENT_END_AT: 'not-a-date',
      }),
    ).toThrow('EVENT_END_AT');
  });
});
