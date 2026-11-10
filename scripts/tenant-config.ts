import { readFile } from 'node:fs/promises';
import { loadConfig } from '../apps/api/src/config.ts';
import { parseTenantManifest } from '../apps/api/src/domain/tenant-manifest.ts';
import {
  applyTenantManifest,
  planTenantManifest,
} from '../apps/api/src/infrastructure/persistence/drizzle/tenant-config-store.ts';

const command = process.argv[2];
const databaseComponentKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SSLMODE',
  'DB_SSLROOTCERT',
] as const;
const applyPrecondition =
  'Operational precondition: During apply, stop every API instance that uses the legacy AppConfig (or block all ticket writes through it: issue, move, restore, reprint). This requirement ends when ticket writes use database-scoped event configuration.';
if (
  ['validate', 'plan', 'apply'].includes(command ?? '') &&
  process.argv.length === 4 &&
  process.argv[3] === '--help'
) {
  console.log(
    [
      'Usage:',
      '  node scripts/tenant-config.ts validate --file <manifest>',
      '  node scripts/tenant-config.ts plan|apply --file <manifest>',
      '  node scripts/tenant-config.ts plan|apply --file <manifest> --database-url-env <NAME>',
      'Without --database-url-env, plan/apply use DATABASE_URL or the complete DB_* component set. The legacy URL flag cannot be combined with DB_* settings.',
      ...(command === 'validate' ? [] : [applyPrecondition]),
    ].join('\n'),
  );
  process.exit(0);
}
const options = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (
    !option?.startsWith('--') ||
    value === undefined ||
    value.startsWith('--') ||
    options.has(option)
  ) {
    throw new Error(
      'Usage: node scripts/tenant-config.ts validate|plan|apply --file <manifest> [--database-url-env <NAME>]',
    );
  }
  options.set(option, value);
}

const file = options.get('--file');
if (
  (command !== 'validate' && command !== 'plan' && command !== 'apply') ||
  file === undefined ||
  (command === 'validate' && options.size !== 1) ||
  ((command === 'plan' || command === 'apply') &&
    (options.has('--database-url-env')
      ? options.size !== 2
      : options.size !== 1))
) {
  throw new Error(
    'Usage: node scripts/tenant-config.ts validate --file <manifest> | plan|apply --file <manifest> [--database-url-env <NAME>]',
  );
}

const manifestText = await readFile(file, 'utf8');
let manifestInput: unknown;
try {
  manifestInput = JSON.parse(manifestText);
} catch (error) {
  if (!(error instanceof SyntaxError)) throw error;
  throw new Error('Manifest JSON is malformed.');
}
const parsedManifest = parseTenantManifest(manifestInput);
if (!parsedManifest.ok) {
  throw new Error(
    `Manifest validation failed: ${parsedManifest.error.issues.map(({ path, message }) => `${path}: ${message}`).join('; ')}`,
  );
}
const manifest = parsedManifest.value;
const eventCount = manifest.tenants.reduce(
  (count, tenant) => count + tenant.events.length,
  0,
);
const equipmentCount = manifest.tenants.reduce(
  (count, tenant) =>
    count +
    tenant.events.reduce(
      (eventCountForTenant, event) =>
        eventCountForTenant + event.equipment.length,
      0,
    ),
  0,
);
const printerCount = manifest.tenants.reduce(
  (count, tenant) =>
    count +
    tenant.events.reduce(
      (eventCountForTenant, event) =>
        eventCountForTenant + event.printers.length,
      0,
    ),
  0,
);
const memberCount = manifest.tenants.reduce(
  (count, tenant) => count + tenant.members.length,
  0,
);

if (command === 'validate') {
  console.log(
    `Valid schemaVersion=1 manifest: tenants=${manifest.tenants.length}, events=${eventCount}, equipment=${equipmentCount}, printers=${printerCount}, members=${memberCount}. No database writes performed.`,
  );
} else {
  const environmentName = options.get('--database-url-env');
  let environment: NodeJS.ProcessEnv = process.env;
  if (environmentName !== undefined) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(environmentName)) {
      throw new Error(
        '--database-url-env must name an uppercase environment variable.',
      );
    }
    const legacyUrl = process.env[environmentName];
    if (legacyUrl === undefined || legacyUrl.length === 0) {
      throw new Error(`Environment variable ${environmentName} is required.`);
    }
    const mixedSettings = databaseComponentKeys.filter(
      (key) => process.env[key] !== undefined,
    );
    if (mixedSettings.length > 0) {
      throw new Error(
        '--database-url-env cannot be combined with DB_* settings.',
      );
    }
    environment = { ...process.env, DATABASE_URL: legacyUrl };
  }

  const config = loadConfig(environment);
  const connectionString = config.databaseUrl;
  console.error(applyPrecondition);
  if (command === 'plan') {
    const plan = await planTenantManifest(
      connectionString,
      manifest,
      config.legacyEventBaseline,
    );
    console.log(JSON.stringify(plan, null, 2));
  } else {
    await applyTenantManifest(
      connectionString,
      manifest,
      config.legacyEventBaseline,
    );
    console.log(
      `Applied schemaVersion=1 manifest: tenants=${manifest.tenants.length}, events=${eventCount}, equipment=${equipmentCount}, printers=${printerCount}, members=${memberCount}. Memberships and printer scopes were synchronized transactionally.`,
    );
  }
}
