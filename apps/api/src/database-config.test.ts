import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { loadDatabaseUrl } from './database-config.ts';

const validComponents = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_NAME: 'queue_pilot',
  DB_USER: 'queue_pilot_runtime_login',
  DB_PASSWORD: 'fictional-password',
};

function createPgClient(environment: NodeJS.ProcessEnv) {
  const connectionString = loadDatabaseUrl(environment);
  return new Client({ connectionString });
}

describe('loadDatabaseUrl', () => {
  it('preserves legacy PostgreSQL URLs byte-for-byte', () => {
    const legacyUrl =
      'postgresql://legacy%40user:legacy%2Fpass@db.example:5544/queue_pilot?sslmode=disable&application_name=compat';

    expect(loadDatabaseUrl({ DATABASE_URL: legacyUrl })).toBe(legacyUrl);
  });

  it('round-trips special password and username characters through the pg Client parser', () => {
    const passwords = [
      '@',
      ':',
      '/',
      '?',
      '#',
      '%',
      ' ',
      '%40',
      '%2F',
      '%zz',
      ' before and after ',
      '日本語🙂',
      '@: /?#% 日本語🙂',
    ];

    for (const password of passwords) {
      const parsed = createPgClient({
        ...validComponents,
        DB_USER: 'user@: /?#%日本語🙂',
        DB_PASSWORD: password,
        PGUSER: 'ignored-user',
        PGPASSWORD: 'ignored-password',
      });

      expect(parsed.user).toBe('user@: /?#%日本語🙂');
      expect(parsed.password).toBe(password);
      expect(parsed.host).toBe('127.0.0.1');
      expect(parsed.port).toBe(5432);
      expect(parsed.database).toBe('queue_pilot');
    }
  });

  it('uses bracketed IPv6 hosts and default verify-full TLS settings', () => {
    const parsed = createPgClient({
      ...validComponents,
      DB_HOST: '[::1]',
    });

    expect(parsed.host).toBe('::1');
    expect(parsed.port).toBe(5432);
    expect(parsed.ssl).toEqual({});
    expect(parsed.ssl).not.toBe(false);
  });

  it('accepts only a complete component set and rejects mixed URI mode', () => {
    expect(() => loadDatabaseUrl({})).toThrow('DATABASE_URL');
    expect(() => loadDatabaseUrl({ DB_HOST: validComponents.DB_HOST })).toThrow(
      'DB_PORT',
    );
    expect(() =>
      loadDatabaseUrl({
        ...validComponents,
        DB_PASSWORD: undefined,
      }),
    ).toThrow('DB_PASSWORD');
    expect(() =>
      loadDatabaseUrl({
        DATABASE_URL: 'postgres://user:password@localhost/database',
        DB_HOST: validComponents.DB_HOST,
      }),
    ).toThrow('DATABASE_URL');
    expect(() => loadDatabaseUrl({ DATABASE_URL: '' })).toThrow('DATABASE_URL');
  });

  it('rejects invalid component values without exposing them', () => {
    const invalidCases: Array<[string, string, string]> = [
      ['DB_HOST', 'db.example:5432', 'DB_HOST'],
      ['DB_HOST', '2001:db8::1', 'DB_HOST'],
      ['DB_PORT', '0', 'DB_PORT'],
      ['DB_PORT', '5432x', 'DB_PORT'],
      ['DB_NAME', 'not/a/database', 'DB_NAME'],
      ['DB_USER', '', 'DB_USER'],
      ['DB_PASSWORD', '', 'DB_PASSWORD'],
      ['DB_PASSWORD', 'private-sentinel\u0000suffix', 'DB_PASSWORD'],
      ['DB_PASSWORD', '\uD800', 'DB_PASSWORD'],
      ['DB_SSLMODE', 'prefer', 'DB_SSLMODE'],
      ['DB_SSLROOTCERT', 'relative/ca.crt', 'DB_SSLROOTCERT'],
    ];

    for (const [key, value, expectedKey] of invalidCases) {
      let message = '';
      try {
        loadDatabaseUrl({
          ...validComponents,
          [key]: value,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain(expectedKey);
      if (value.length > 0)
        expect(message).not.toContain(value.replace('\u0000', ''));
    }

    expect(() =>
      loadDatabaseUrl({
        ...validComponents,
        DB_SSLMODE: 'disable',
        DB_SSLROOTCERT: '/etc/queue-pilot/ca.crt',
      }),
    ).toThrow('DB_SSLROOTCERT');
  });

  it('does not accept PGUSER or PGPASSWORD as fallback credentials', () => {
    expect(() =>
      loadDatabaseUrl({
        PGUSER: 'fallback-user',
        PGPASSWORD: 'fallback-password',
      }),
    ).toThrow('DATABASE_URL');
  });
});
