import { readFile } from 'node:fs/promises';
import { parseTenantManifest } from '../apps/api/src/domain/tenant-manifest.ts';
import { applyTenantManifest } from '../apps/api/src/infrastructure/persistence/drizzle/tenant-config-store.ts';

const command = process.argv[2];
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
      'Usage: node scripts/tenant-config.ts validate|apply --file <manifest> [--database-url-env <NAME>]',
    );
  }
  options.set(option, value);
}

const file = options.get('--file');
if (
  (command !== 'validate' && command !== 'apply') ||
  file === undefined ||
  (command === 'validate' && options.size !== 1) ||
  (command === 'apply' &&
    (options.size !== 2 || !options.has('--database-url-env')))
) {
  throw new Error(
    'Usage: node scripts/tenant-config.ts validate --file <manifest> | apply --file <manifest> --database-url-env DATABASE_URL',
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
  if (!environmentName || !/^[A-Z][A-Z0-9_]*$/.test(environmentName)) {
    throw new Error(
      '--database-url-env must name an uppercase environment variable.',
    );
  }
  const connectionString = process.env[environmentName];
  if (!connectionString) {
    throw new Error(`Environment variable ${environmentName} is required.`);
  }
  const protocol = URL.canParse(connectionString)
    ? new URL(connectionString).protocol
    : '';
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`${environmentName} must be a PostgreSQL connection URL.`);
  }

  await applyTenantManifest(connectionString, manifest);
  console.log(
    `Applied schemaVersion=1 manifest: tenants=${manifest.tenants.length}, events=${eventCount}, equipment=${equipmentCount}. Membership declarations were validated but remain Git-only until the scoped API phase.`,
  );
}
