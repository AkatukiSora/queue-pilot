import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.argv.length !== 2) {
  throw new Error('This check does not accept command-line arguments.');
}

const require = createRequire(import.meta.url);
const missingTools = [
  ['docker', ['compose', 'version']],
  ['atlas', ['version']],
]
  .filter(([command, args]) => {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      timeout: 10_000,
    });
    return result.error !== undefined || result.status !== 0;
  })
  .map(([command]) => command);

try {
  require.resolve('embedded-postgres');
} catch {
  missingTools.push('embedded-postgres');
}

if (missingTools.length > 0) {
  console.log(
    `SKIP: Compose migration behavior was not verified; missing ${[...new Set(missingTools)].join(', ')}.`,
  );
  process.exit(0);
}

const { withTemporaryPostgres } = await import('./embedded-postgres.mjs');
const root = process.cwd();
const composeFile = join(root, 'compose.yaml');
const migrationsDirectory = join(root, 'db/migrations');
const profiles = ['local-oidc', 'github'];
const legacyScalarCommand = [
  'atlas',
  'migrate',
  'apply',
  '--dir',
  'file:///migrations',
  '--url',
  '$$MIGRATION_DATABASE_URL',
];
const tempRoot = process.env.TMPDIR ?? tmpdir();
await mkdir(tempRoot, { recursive: true });
const temporaryDirectory = await mkdtemp(
  join(tempRoot, 'queue-pilot-compose-migration-'),
);
const project = `queue-pilot-migration-${randomBytes(6).toString('hex')}`;
const envFile = join(temporaryDirectory, '.env.compose');
const composeVariables = {
  COMPOSE_POSTGRES_OWNER_PASSWORD: randomBytes(32).toString('hex'),
  COMPOSE_RUNTIME_DB_PASSWORD: randomBytes(32).toString('hex'),
  COMPOSE_AUTH_SECRET: randomBytes(32).toString('hex'),
  COMPOSE_OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
  COMPOSE_GITHUB_CLIENT_ID: 'migration-test-client-id',
  COMPOSE_GITHUB_CLIENT_SECRET: randomBytes(32).toString('hex'),
};
const composeEnvironment = { ...process.env, ...composeVariables };

try {
  await writeFile(
    envFile,
    `${Object.entries(composeVariables)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`,
    { mode: 0o600 },
  );

  const rendered = new Map();
  for (const profile of profiles) {
    const config = JSON.parse(
      runDocker(
        [
          '--project-name',
          project,
          '--project-directory',
          root,
          '--env-file',
          envFile,
          '--file',
          composeFile,
          '--profile',
          profile,
          'config',
          '--format',
          'json',
        ],
        composeEnvironment,
      ),
    );
    const migration = config.services?.migrate;
    assert(
      Array.isArray(migration?.entrypoint),
      `${profile}: migrate entrypoint is missing.`,
    );
    assert(
      Array.isArray(migration?.command),
      `${profile}: migrate command is missing.`,
    );
    assert.equal(
      migration.command.length,
      1,
      `${profile}: migrate command must be one shell script.`,
    );
    assert.equal(
      typeof migration.environment?.MIGRATION_DATABASE_URL,
      'string',
    );
    rendered.set(profile, migration);
  }

  console.log(
    'Compose renderer resolved migrate argv for local-oidc and github.',
  );
  await withTemporaryPostgres(async ({ postgres, urlFor }) => {
    for (const profile of profiles) {
      const database = `compose_${profile.replace('-', '_')}`;
      await postgres.createDatabase(database);
      const result = runMigration(rendered.get(profile), urlFor(database));
      assert.equal(result.status, 0, `${profile}: migrate command failed.`);
      const state = await readMigrationState(postgres, database);
      assertMigrationState(state, profile);
      console.log(
        `${profile}: 8/8 migrations applied; current=${state.currentVersion}; expected tables present.`,
      );
    }

    for (const profile of profiles) {
      const database = `legacy_${profile.replace('-', '_')}`;
      await postgres.createDatabase(database);
      const migration = rendered.get(profile);
      const result = runMigration(
        { ...migration, command: legacyScalarCommand },
        urlFor(database),
      );
      assert.equal(
        result.status,
        0,
        `${profile}: legacy scalar control changed behavior.`,
      );
      assert.match(`${result.stdout}\n${result.stderr}`, /Available Commands:/);
      const state = await readMigrationState(postgres, database);
      assert.throws(
        () => assertMigrationState(state, `${profile} legacy scalar control`),
        /Atlas migration revision table is missing/,
      );
      console.log(
        `${profile}: legacy scalar negative control exited 0 with Atlas help; migration assertions rejected it.`,
      );
    }

    const invalid = runMigration(
      {
        ...rendered.get('local-oidc'),
        command: [
          `${rendered.get('local-oidc').command[0]} --review-invalid-flag`,
        ],
      },
      urlFor('postgres'),
    );
    assertNonzero(invalid, 'Invalid Atlas argument');

    const missingDatabase = runMigration(
      rendered.get('local-oidc'),
      urlFor('compose_missing_database'),
    );
    assertNonzero(missingDatabase, 'Unavailable database');
  });
  console.log(
    'Invalid argument and unavailable database both failed non-zero.',
  );
  console.log('Compose migration regression check passed.');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function runDocker(args, env) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'docker compose config failed.');
  return result.stdout;
}

function runMigration(migration, databaseUrl) {
  const command = migration.command.map((part) =>
    part
      .replaceAll('$$', '$')
      .replaceAll(
        'file:///migrations',
        pathToFileURL(migrationsDirectory).href,
      ),
  );
  const result = spawnSync(
    migration.entrypoint[0],
    [...migration.entrypoint.slice(1), ...command],
    {
      cwd: root,
      env: { ...composeEnvironment, MIGRATION_DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    },
  );
  if (result.error) throw result.error;
  return result;
}

async function readMigrationState(postgres, databaseName) {
  const client = postgres.getPgClient(databaseName, '127.0.0.1');
  await client.connect();
  try {
    const tables = await client.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const revisionTable = await client.query(
      "select to_regclass('atlas_schema_revisions.atlas_schema_revisions') is not null as present",
    );
    const revisions = revisionTable.rows[0]?.present
      ? await client.query(
          'select version, applied, total from atlas_schema_revisions.atlas_schema_revisions order by version',
        )
      : { rows: [] };
    return {
      tables: tables.rows.map(({ tablename }) => tablename),
      revisionTable: revisionTable.rows[0]?.present === true,
      revisions: revisions.rows,
      currentVersion: revisions.rows.at(-1)?.version,
    };
  } finally {
    await client.end();
  }
}

function assertMigrationState(state, label) {
  assert(
    state.revisionTable,
    `${label}: Atlas migration revision table is missing.`,
  );
  assert.equal(
    state.revisions.length,
    8,
    `${label}: expected 8 migration revisions.`,
  );
  assert(
    state.revisions.every(({ applied, total }) => applied === total),
    `${label}: a migration revision is only partially applied.`,
  );
  assert.equal(
    state.currentVersion,
    '20261105050307',
    `${label}: current migration version is incorrect.`,
  );
  for (const table of ['tickets', 'print_jobs', 'tenants', 'events']) {
    assert(
      state.tables.includes(table),
      `${label}: expected table ${table} is missing.`,
    );
  }
}

function assertNonzero(result, label) {
  assert.equal(result.error, undefined, `${label}: process could not run.`);
  assert.equal(result.signal, null, `${label}: process did not exit normally.`);
  assert.notEqual(
    result.status,
    0,
    `${label}: command unexpectedly succeeded.`,
  );
}
