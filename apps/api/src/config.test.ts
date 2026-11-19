import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const manifestPath = fileURLToPath(
  new URL('../test/fixtures/default-tenant-manifest.json', import.meta.url),
);
const sharedManifestPath = fileURLToPath(
  new URL('../test/fixtures/shared-tenant-manifest.json', import.meta.url),
);
const legacyIdentitySharedSettingsManifestPath = fileURLToPath(
  new URL(
    '../test/fixtures/legacy-identity-shared-settings-manifest.json',
    import.meta.url,
  ),
);

const validEnvironment = {
  DATABASE_URL: 'postgres://ticket:***@127.0.0.1:5432/ticket',
  ADMIN_TOKEN: 'a'.repeat(32),
  AGENT_TOKEN: 'b'.repeat(32),
  EVENT_END_AT: '2026-11-04T05:00:00.000Z',
  SLOT_SCHEDULE_JSON:
    '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
};
const sharedEnvironment = {
  DATABASE_URL: validEnvironment.DATABASE_URL,
  AUTH_MODE: 'oidc/shared',
  AUTH_PROVIDER: 'github',
  AUTH_SECRET: 'c'.repeat(32),
  PUBLIC_BASE_URL: 'http://localhost/',
  GITHUB_CLIENT_ID: 'fixture-client-id',
  GITHUB_CLIENT_SECRET: 'fixture-client-secret',
  APP_MANIFEST_PATH: sharedManifestPath,
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

  it('loads public build metadata at the process boundary', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    expect(
      loadConfig({
        ...validEnvironment,
        APP_VERSION: '1.2.3-rc.1+build.7',
        APP_COMMIT: commit,
      }).buildInfo,
    ).toEqual({ version: '1.2.3-rc.1+build.7', commit });
    expect(() =>
      loadConfig({ ...validEnvironment, APP_COMMIT: 'not-a-git-sha' }),
    ).toThrow('APP_COMMIT');
  });

  it('loads DB component settings at the application boundary', () => {
    const config = loadConfig({
      ...validEnvironment,
      DATABASE_URL: undefined,
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_NAME: 'queue_pilot',
      DB_USER: 'queue_pilot_runtime_login',
      DB_PASSWORD: 'fictional-password',
      DB_SSLMODE: 'disable',
    });

    expect(config.databaseUrl).toBe(
      'postgresql://queue_pilot_runtime_login:fictional-password@127.0.0.1:5432/queue_pilot?sslmode=disable',
    );
  });

  it('validates startup settings once and defaults ticket numbering to daily', () => {
    const config = loadConfig(validEnvironment);
    if (config.authMode !== 'legacy-single') {
      throw new Error('Expected legacy-single configuration.');
    }
    expect(config).toEqual({
      databaseUrl: validEnvironment.DATABASE_URL,
      tenantConfigSource: 'manifest',
      buildInfo: { version: 'unknown', commit: 'unknown' },
      adminToken: validEnvironment.ADMIN_TOKEN,
      agentToken: validEnvironment.AGENT_TOKEN,
      authMode: 'legacy-single',
      legacyEventSettings: {
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
      },
    });
    expect(config.legacyEventBaseline).toBeUndefined();
    const eventNumberingConfig = loadConfig({
      ...validEnvironment,
      TICKET_NUMBER_SCOPE: 'event',
    });
    if (eventNumberingConfig.authMode !== 'legacy-single') {
      throw new Error('Expected legacy-single configuration.');
    }
    expect(eventNumberingConfig.legacyEventSettings.numberScope).toBe('event');
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
    if (config.authMode !== 'legacy-single') {
      throw new Error('Expected legacy-single configuration.');
    }

    expect(config.tenantManifest?.schemaVersion).toBe(1);
    expect(config.legacyEventSettings.eventEndAt.toISOString()).toBe(
      '2026-11-04T05:00:00.000Z',
    );
    expect(config.legacyEventSettings.slotSchedule).toHaveLength(72);
    expect(config.legacyEventSettings.slotSchedule[0]).toEqual({
      slotStartsAt: '2026-11-03T01:00:00.000Z',
      equipment: 'Quest 3',
    });
    expect(config.legacyEventBaseline).toBeUndefined();
  });

  it('defaults shared configuration authority to manifest', () => {
    expect(loadConfig(sharedEnvironment)).toMatchObject({
      authMode: 'oidc/shared',
      tenantConfigSource: 'manifest',
    });
  });

  it('defaults shared session idle, update, and absolute lifetimes', () => {
    const config = loadConfig(sharedEnvironment);
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.session).toEqual({
      idleSeconds: 43_200,
      updateAgeSeconds: 300,
      absoluteSeconds: 604_800,
    });
  });

  it('accepts the maximum shared session lifetime boundary', () => {
    const config = loadConfig({
      ...sharedEnvironment,
      AUTH_SESSION_IDLE_SECONDS: '604800',
      AUTH_SESSION_UPDATE_AGE_SECONDS: '302400',
      AUTH_SESSION_ABSOLUTE_SECONDS: '2592000',
    });
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.session).toEqual({
      idleSeconds: 604_800,
      updateAgeSeconds: 302_400,
      absoluteSeconds: 2_592_000,
    });
  });

  it('accepts the minimum shared session lifetime boundary', () => {
    const config = loadConfig({
      ...sharedEnvironment,
      AUTH_SESSION_IDLE_SECONDS: '900',
      AUTH_SESSION_UPDATE_AGE_SECONDS: '60',
      AUTH_SESSION_ABSOLUTE_SECONDS: '900',
    });
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.session).toEqual({
      idleSeconds: 900,
      updateAgeSeconds: 60,
      absoluteSeconds: 900,
    });
  });

  it.each([
    ['AUTH_SESSION_IDLE_SECONDS', '899'],
    ['AUTH_SESSION_IDLE_SECONDS', '604801'],
    ['AUTH_SESSION_IDLE_SECONDS', ' 43200'],
    ['AUTH_SESSION_IDLE_SECONDS', '43200 '],
    ['AUTH_SESSION_IDLE_SECONDS', '4.32e4'],
    ['AUTH_SESSION_IDLE_SECONDS', '43200.0'],
    ['AUTH_SESSION_UPDATE_AGE_SECONDS', '59'],
    ['AUTH_SESSION_UPDATE_AGE_SECONDS', '21601'],
    ['AUTH_SESSION_ABSOLUTE_SECONDS', '43199'],
    ['AUTH_SESSION_ABSOLUTE_SECONDS', '2592001'],
  ])('rejects invalid shared session setting %s=%s', (name, value) => {
    expect(() => loadConfig({ ...sharedEnvironment, [name]: value })).toThrow(
      name,
    );
  });

  it.each([' 43200', '43200 ', '4.32e4', '43200.0', ''])(
    'rejects non-integer idle setting %s',
    (value) => {
      expect(() =>
        loadConfig({ ...sharedEnvironment, AUTH_SESSION_IDLE_SECONDS: value }),
      ).toThrow('AUTH_SESSION_IDLE_SECONDS');
    },
  );

  it('rejects shared session settings in legacy mode', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        AUTH_SESSION_IDLE_SECONDS: '43200',
      }),
    ).toThrow('AUTH_SESSION_IDLE_SECONDS');
  });

  it('loads shared database configuration without a manifest', () => {
    const { APP_MANIFEST_PATH: _manifestPath, ...environment } =
      sharedEnvironment;
    const config = loadConfig({
      ...environment,
      TENANT_CONFIG_SOURCE: 'database',
    });

    expect(config).toMatchObject({
      authMode: 'oidc/shared',
      tenantConfigSource: 'database',
    });
    expect(config.tenantManifest).toBeUndefined();
  });

  it('rejects database configuration authority for legacy-single mode', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, TENANT_CONFIG_SOURCE: 'database' }),
    ).toThrow('TENANT_CONFIG_SOURCE=database requires AUTH_MODE=oidc/shared');
  });

  it('loads a fixed-default-free manifest in shared mode without legacy settings', () => {
    const config = loadConfig(sharedEnvironment);

    expect(config.authMode).toBe('oidc/shared');
    expect(config.tenantManifest?.tenants[0]).toMatchObject({
      id: '20000000-0000-4000-8000-000000000001',
      slug: 'campus',
      events: [
        expect.objectContaining({
          id: '20000000-0000-4000-8000-000000000002',
          slug: 'bunkasai',
        }),
      ],
    });
    expect(config).not.toHaveProperty('legacyEventSettings');
    expect(config).not.toHaveProperty('eventEndAt');
    expect(config.legacyEventBaseline).toBeUndefined();
  });

  it('requires the fixed legacy event only in legacy-single mode', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        APP_MANIFEST_PATH: sharedManifestPath,
      }),
    ).toThrow('fixed default event is missing');
    expect(loadConfig(sharedEnvironment).tenantManifest?.tenants).toHaveLength(
      1,
    );
  });

  it('applies fixed-event compatibility only in legacy-single mode', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        APP_MANIFEST_PATH: legacyIdentitySharedSettingsManifestPath,
      }),
    ).toThrow('fixed default event is not compatible with the legacy API');

    expect(
      loadConfig({
        ...sharedEnvironment,
        APP_MANIFEST_PATH: legacyIdentitySharedSettingsManifestPath,
      }).authMode,
    ).toBe('oidc/shared');
  });

  it('rejects a partial old baseline instead of inferring its missing fields', () => {
    expect(() =>
      loadConfig({
        ...sharedEnvironment,
        EVENT_END_AT: validEnvironment.EVENT_END_AT,
      }),
    ).toThrow(
      'legacy baseline requires EVENT_END_AT, SLOT_SCHEDULE_JSON, and TICKET_NUMBER_SCOPE',
    );
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

  it('defaults self-service signup to OFF with the allowlist policy and quotas 100/unset', () => {
    const config = loadConfig({
      ...sharedEnvironment,
      TENANT_CONFIG_SOURCE: 'database',
    });
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.registration).toEqual({
      enabled: false,
      policy: 'allowlist',
      githubUserIds: [],
      githubOrgIds: [],
      maxPerUser: 100,
    });
  });

  it('rejects enabled allowlist signup without at least one numeric GitHub ID', () => {
    expect(() =>
      loadConfig({
        ...sharedEnvironment,
        TENANT_CONFIG_SOURCE: 'database',
        TENANT_SIGNUP_ENABLED: 'true',
        TENANT_SIGNUP_POLICY: 'allowlist',
      }),
    ).toThrow('TENANT_SIGNUP_GITHUB_IDS');
  });

  it('loads numeric account and organization allowlists and configurable caps', () => {
    const config = loadConfig({
      ...sharedEnvironment,
      TENANT_CONFIG_SOURCE: 'database',
      TENANT_SIGNUP_ENABLED: 'true',
      TENANT_SIGNUP_POLICY: 'allowlist',
      TENANT_SIGNUP_GITHUB_IDS: '["1234567"]',
      TENANT_SIGNUP_GITHUB_ORG_IDS: '["7654321"]',
      TENANT_SIGNUP_MAX_PER_USER: '250',
      TENANT_SIGNUP_MAX_TOTAL: '4000',
    });
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.registration).toEqual({
      enabled: true,
      policy: 'allowlist',
      githubUserIds: ['1234567'],
      githubOrgIds: ['7654321'],
      maxPerUser: 250,
      maxTotal: 4000,
    });
  });

  it('rejects enabled signup when the manifest remains authoritative', () => {
    expect(() =>
      loadConfig({
        ...sharedEnvironment,
        TENANT_CONFIG_SOURCE: 'manifest',
        TENANT_SIGNUP_ENABLED: 'true',
        TENANT_SIGNUP_POLICY: 'public',
      }),
    ).toThrow('TENANT_SIGNUP_ENABLED');
  });

  it('rejects enabled signup for OIDC providers', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        AUTH_MODE: 'oidc/shared',
        AUTH_PROVIDER: 'oidc',
        AUTH_SECRET: 'c'.repeat(32),
        PUBLIC_BASE_URL: 'http://localhost/',
        OIDC_ISSUER: 'https://identity.example.invalid',
        OIDC_DISCOVERY_URL:
          'https://identity.example.invalid/.well-known/openid-configuration',
        OIDC_CLIENT_ID: 'fixture-oidc-client-id',
        OIDC_CLIENT_SECRET: 'fixture-oidc-client-secret',
        TENANT_CONFIG_SOURCE: 'database',
        TENANT_SIGNUP_ENABLED: 'true',
        TENANT_SIGNUP_POLICY: 'public',
      }),
    ).toThrow('TENANT_SIGNUP_ENABLED');
  });

  it('validates and freezes explicit trusted proxy IP and CIDR entries', () => {
    const config = loadConfig({
      ...sharedEnvironment,
      AUTH_TRUSTED_PROXIES:
        ' ["192.0.2.10", "192.0.2.0/24", "2001:db8::1", "2001:db8:abcd::/48"] ',
    });
    if (config.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }

    expect(config.sharedAuth.clientIpTrustedProxies).toEqual([
      '192.0.2.10',
      '192.0.2.0/24',
      '2001:db8::1',
      '2001:db8:abcd::/48',
    ]);
    expect(Object.isFrozen(config.sharedAuth.clientIpTrustedProxies)).toBe(
      true,
    );
    const defaultConfig = loadConfig(sharedEnvironment);
    if (defaultConfig.authMode !== 'oidc/shared') {
      throw new Error('Expected shared authentication configuration.');
    }
    expect(defaultConfig.sharedAuth.clientIpTrustedProxies).toEqual([]);
  });

  it.each([
    '',
    '{',
    '{}',
    '[1]',
    '[""]',
    '[" 192.0.2.1"]',
    '["proxy.example.invalid"]',
    '["192.0.2.1:443"]',
    '["*"]',
    '["10.0.0.0/33"]',
    '["2001:db8::/129"]',
  ])('rejects malformed trusted proxy configuration %s', (value) => {
    expect(() =>
      loadConfig({ ...sharedEnvironment, AUTH_TRUSTED_PROXIES: value }),
    ).toThrow('AUTH_TRUSTED_PROXIES');
  });

  it('rejects trusted proxies in legacy mode', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, AUTH_TRUSTED_PROXIES: '[]' }),
    ).toThrow('AUTH_TRUSTED_PROXIES');
  });
});
