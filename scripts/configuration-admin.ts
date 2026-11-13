import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDatabaseUrl } from '../apps/api/src/database-config.ts';
import type { LegacyEventBaseline } from '../apps/api/src/domain/tenant-manifest.ts';
import { parseTenantManifest } from '../apps/api/src/domain/tenant-manifest.ts';
import {
  exportConfigurationTenant,
  importConfigurationTenant,
  initializeWebConfiguration,
} from '../apps/api/src/infrastructure/persistence/drizzle/configuration-admin-store.ts';
import { readConfigurationAuthorityMode } from '../apps/api/src/infrastructure/persistence/drizzle/configuration-authority.ts';
import {
  adoptTenantManifest,
  applyTenantManifest,
} from '../apps/api/src/infrastructure/persistence/drizzle/tenant-config-store.ts';

const optionDefinitions: Record<
  string,
  {
    values: readonly string[];
    flags: readonly string[];
    required: readonly string[];
  }
> = {
  bootstrap: {
    values: ['--file', '--legacy-baseline-file', '--database-url-env'],
    flags: [],
    required: [],
  },
  'initialize-web': { values: ['--database-url-env'], flags: [], required: [] },
  'adopt-web': {
    values: ['--file', '--legacy-baseline-file', '--database-url-env'],
    flags: ['--dry-run'],
    required: ['--file'],
  },
  export: {
    values: ['--tenant-slug', '--file', '--database-url-env'],
    flags: [],
    required: ['--tenant-slug', '--file'],
  },
  'import-export': {
    values: ['--file', '--admin-subject-env', '--database-url-env'],
    flags: ['--dry-run'],
    required: ['--file'],
  },
};

export type ParsedConfigurationAdminArguments = {
  command: string;
  options: Map<string, string | true>;
};

export function parseConfigurationAdminArguments(
  args: string[],
): ParsedConfigurationAdminArguments {
  const command = args[0];
  if (command === undefined || command === '--help' || command === 'help') {
    return { command: 'help', options: new Map() };
  }
  const definition = optionDefinitions[command];
  if (definition === undefined) throw new Error(`Unknown command ${command}.`);
  const options = new Map<string, string | true>();
  for (let index = 1; index < args.length; index += 1) {
    const name = args[index];
    if (name === undefined) break;
    if (options.has(name))
      throw new Error(`Option ${name} was provided more than once.`);
    if (definition.flags.includes(name)) {
      options.set(name, true);
    } else if (definition.values.includes(name)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Option ${name} requires a value.`);
      }
      options.set(name, value);
      index += 1;
    } else {
      throw new Error(`Unknown option ${name}.`);
    }
  }
  for (const required of definition.required) {
    const value = options.get(required);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Option ${required} is required.`);
    }
  }
  return { command, options };
}

function parseLegacyBaseline(value: unknown): LegacyEventBaseline {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Legacy baseline must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'endsAt,equipmentIds,numberScope,timeZone') {
    throw new Error(
      'Legacy baseline must contain exactly timeZone, endsAt, numberScope, and equipmentIds.',
    );
  }
  const { timeZone, endsAt, numberScope, equipmentIds } = record;
  if (
    timeZone !== 'Asia/Tokyo' ||
    typeof endsAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      endsAt,
    ) ||
    Number.isNaN(Date.parse(endsAt)) ||
    (numberScope !== 'daily' && numberScope !== 'event') ||
    !Array.isArray(equipmentIds) ||
    equipmentIds.length === 0 ||
    !equipmentIds.every(
      (id): id is string => typeof id === 'string' && id.length > 0,
    ) ||
    new Set(equipmentIds).size !== equipmentIds.length
  ) {
    throw new Error('Legacy baseline fields are invalid.');
  }
  return { timeZone, endsAt, numberScope, equipmentIds };
}

function usage(): string {
  return [
    'Usage: node scripts/configuration-admin.ts <command> [options]',
    '',
    'Commands:',
    '  bootstrap [--file MANIFEST] [--legacy-baseline-file JSON] [--database-url-env NAME]',
    '  initialize-web [--database-url-env NAME]',
    '  adopt-web --file PRIVATE_JSON [--legacy-baseline-file JSON] [--dry-run] [--database-url-env NAME]',
    '  export --tenant-slug SLUG --file NEW_PRIVATE_JSON [--database-url-env NAME]',
    '  import-export --file PRIVATE_JSON [--admin-subject-env NAME] [--dry-run] [--database-url-env NAME]',
    '',
    'initialize-web reads BOOTSTRAP_GITHUB_SUBJECT, BOOTSTRAP_TENANT_SLUG, and BOOTSTRAP_TENANT_NAME.',
    'import-export reads a numeric GitHub subject from CONFIGURATION_IMPORT_ADMIN_SUBJECT by default.',
    'The owner connection is read from DATABASE_URL/DB_* or the named environment variable; it is never accepted as an argument.',
  ].join('\n');
}

function option(
  args: ParsedConfigurationAdminArguments,
  name: string,
): string | undefined {
  const value = args.options.get(name);
  return typeof value === 'string' ? value : undefined;
}

function requiredOption(
  args: ParsedConfigurationAdminArguments,
  name: string,
): string {
  const value = option(args, name);
  if (value === undefined || value.length === 0)
    throw new Error(`Option ${name} is required.`);
  return value;
}

function databaseUrl(args: ParsedConfigurationAdminArguments): string {
  const environmentName = option(args, '--database-url-env');
  if (environmentName === undefined) return loadDatabaseUrl();
  if (!/^[A-Z][A-Z0-9_]*$/.test(environmentName)) {
    throw new Error(
      '--database-url-env must be an uppercase environment variable name.',
    );
  }
  const value = process.env[environmentName];
  if (value === undefined)
    throw new Error(
      `Database URL environment variable ${environmentName} is not set.`,
    );
  return loadDatabaseUrl({ DATABASE_URL: value });
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function numericGithubSubject(
  value: string | undefined,
  variable: string,
): string {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${variable} must contain a numeric GitHub account ID.`);
  }
  return value;
}

async function run(args: ParsedConfigurationAdminArguments): Promise<void> {
  if (args.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const connectionString = databaseUrl(args);
  if (args.command === 'bootstrap') {
    const mode = await readConfigurationAuthorityMode(connectionString);
    if (mode === 'database') {
      process.stdout.write(
        `${JSON.stringify({ applied: false, reason: 'database-authority' })}\n`,
      );
      return;
    }
    const manifestPath =
      option(args, '--file') ?? process.env.APP_MANIFEST_PATH;
    if (manifestPath === undefined || manifestPath.length === 0) {
      throw new Error(
        'APP_MANIFEST_PATH or --file is required when authority is manifest.',
      );
    }
    const manifest = parseTenantManifest(await readJson(manifestPath));
    if (!manifest.ok) {
      throw new Error(
        `Invalid tenant manifest: ${JSON.stringify(manifest.error.issues)}`,
      );
    }
    const baselineFile = option(args, '--legacy-baseline-file');
    const legacyBaseline =
      baselineFile === undefined
        ? undefined
        : parseLegacyBaseline(await readJson(baselineFile));
    await applyTenantManifest(connectionString, manifest.value, legacyBaseline);
    process.stdout.write(
      `${JSON.stringify({
        applied: true,
        tenantCount: manifest.value.tenants.length,
        eventCount: manifest.value.tenants.reduce(
          (count, tenant) => count + tenant.events.length,
          0,
        ),
      })}\n`,
    );
    return;
  }
  if (args.command === 'initialize-web') {
    const subject = numericGithubSubject(
      process.env.BOOTSTRAP_GITHUB_SUBJECT,
      'BOOTSTRAP_GITHUB_SUBJECT',
    );
    const tenantSlug = process.env.BOOTSTRAP_TENANT_SLUG;
    const displayName = process.env.BOOTSTRAP_TENANT_NAME;
    if (tenantSlug === undefined || displayName === undefined) {
      throw new Error(
        'BOOTSTRAP_TENANT_SLUG and BOOTSTRAP_TENANT_NAME are required.',
      );
    }
    const result = await initializeWebConfiguration(connectionString, {
      issuer: 'https://github.com',
      subject,
      tenantSlug,
      displayName,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (args.command === 'adopt-web') {
    const input = await readJson(requiredOption(args, '--file'));
    const manifest = parseTenantManifest(input);
    if (!manifest.ok)
      throw new Error(
        `Invalid tenant manifest: ${JSON.stringify(manifest.error.issues)}`,
      );
    const baselineFile = option(args, '--legacy-baseline-file');
    const legacyBaseline =
      baselineFile === undefined
        ? undefined
        : parseLegacyBaseline(await readJson(baselineFile));
    const result = await adoptTenantManifest(
      connectionString,
      manifest.value,
      legacyBaseline,
      args.options.has('--dry-run'),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (args.command === 'export') {
    const result = await exportConfigurationTenant(
      connectionString,
      requiredOption(args, '--tenant-slug'),
    );
    await writeFile(
      requiredOption(args, '--file'),
      `${JSON.stringify(result, null, 2)}\n`,
      {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      },
    );
    process.stdout.write(
      `${JSON.stringify({ exported: true, tenantSlug: result.tenant.slug })}\n`,
    );
    return;
  }
  if (args.command === 'import-export') {
    const environmentName =
      option(args, '--admin-subject-env') ??
      'CONFIGURATION_IMPORT_ADMIN_SUBJECT';
    if (!/^[A-Z][A-Z0-9_]*$/.test(environmentName)) {
      throw new Error(
        '--admin-subject-env must be an uppercase environment variable name.',
      );
    }
    const subject = numericGithubSubject(
      process.env[environmentName],
      environmentName,
    );
    const result = await importConfigurationTenant(
      connectionString,
      await readJson(requiredOption(args, '--file')),
      { issuer: 'https://github.com', subject },
      args.options.has('--dry-run'),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(`Unknown command ${args.command}.`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run(parseConfigurationAdminArguments(process.argv.slice(2))).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'configuration-admin failed.'}\n${usage()}\n`,
      );
      process.exitCode = 1;
    },
  );
}
