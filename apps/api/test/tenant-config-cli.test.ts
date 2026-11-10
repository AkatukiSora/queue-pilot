import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, inject, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = fileURLToPath(
  new URL('./fixtures/default-tenant-manifest.json', import.meta.url),
);
const databaseKeys = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSLMODE',
  'DB_SSLROOTCERT',
];

function environmentWithoutDatabase(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of databaseKeys) delete environment[key];
  return environment;
}

function runTenantConfig(
  argumentsList: string[],
  environment: NodeJS.ProcessEnv,
) {
  const result = spawnSync(
    process.execPath,
    ['scripts/tenant-config.ts', ...argumentsList],
    { cwd: repositoryRoot, encoding: 'utf8', env: environment },
  );
  if (result.error) throw result.error;
  return result;
}

function withManifestEnvironment(): NodeJS.ProcessEnv {
  return {
    ...environmentWithoutDatabase(),
    AUTH_MODE: 'legacy-single',
    ADMIN_TOKEN: 'a'.repeat(32),
    AGENT_TOKEN: 'b'.repeat(32),
    APP_MANIFEST_PATH: manifestPath,
  };
}

function componentEnvironment(): NodeJS.ProcessEnv {
  const databaseUrl = new URL(inject('testDatabaseUrl'));
  return {
    ...withManifestEnvironment(),
    DB_HOST: databaseUrl.hostname,
    DB_PORT: databaseUrl.port,
    DB_NAME: databaseUrl.pathname.slice(1),
    DB_USER: decodeURIComponent(databaseUrl.username),
    DB_PASSWORD: decodeURIComponent(databaseUrl.password),
    DB_SSLMODE: 'disable',
  };
}

describe('tenant-config CLI process', () => {
  it('validates a manifest without requiring database or authentication settings', () => {
    const result = runTenantConfig(
      ['validate', '--file', manifestPath],
      environmentWithoutDatabase(),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Valid schemaVersion=1 manifest');
    expect(result.stdout).toContain('No database writes performed');
  });

  it('plans with component environment settings and with the legacy URL flag', () => {
    const componentResult = runTenantConfig(
      ['plan', '--file', manifestPath],
      componentEnvironment(),
    );
    expect(componentResult.status).toBe(0);
    expect(JSON.parse(componentResult.stdout)).toHaveProperty('summary');

    const legacyEnvironment = withManifestEnvironment();
    legacyEnvironment.DATABASE_URL = inject('testDatabaseUrl');
    const legacyUrlResult = runTenantConfig(
      ['plan', '--file', manifestPath],
      legacyEnvironment,
    );
    expect(legacyUrlResult.status).toBe(0);
    expect(JSON.parse(legacyUrlResult.stdout)).toHaveProperty('summary');

    const flaggedLegacyEnvironment = withManifestEnvironment();
    flaggedLegacyEnvironment.MIGRATION_DATABASE_URL = inject('testDatabaseUrl');
    const legacyResult = runTenantConfig(
      [
        'plan',
        '--file',
        manifestPath,
        '--database-url-env',
        'MIGRATION_DATABASE_URL',
      ],
      flaggedLegacyEnvironment,
    );
    expect(legacyResult.status).toBe(0);
    expect(JSON.parse(legacyResult.stdout)).toHaveProperty('summary');
  });

  it('rejects a partial component set without exposing its password', () => {
    const environment = withManifestEnvironment();
    environment.DB_HOST = '127.0.0.1';
    environment.DB_PASSWORD = 'fictional-component-password';
    const result = runTenantConfig(
      ['plan', '--file', manifestPath],
      environment,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('required keys are missing');
    expect(result.stderr).not.toContain(environment.DB_PASSWORD);
  });

  it('rejects the legacy URL flag when component settings are also present', () => {
    const environment = componentEnvironment();
    environment.DATABASE_URL = inject('testDatabaseUrl');
    const result = runTenantConfig(
      ['plan', '--file', manifestPath, '--database-url-env', 'DATABASE_URL'],
      environment,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DB_* settings');
    expect(result.stderr).not.toContain(environment.DB_PASSWORD);
  });
});
