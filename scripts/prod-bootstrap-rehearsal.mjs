import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from '../apps/api/node_modules/pg/lib/index.js';
import { loadConfig } from '../apps/api/src/config.ts';
import { loadDatabaseUrl } from '../apps/api/src/database-config.ts';
import { parseTenantManifest } from '../apps/api/src/domain/tenant-manifest.ts';
import { createDrizzleDatabase } from '../apps/api/src/infrastructure/persistence/drizzle/client.ts';
import { assertSharedRuntimeRole } from '../apps/api/src/infrastructure/persistence/drizzle/runtime-role-check.ts';
import { applyTenantManifest } from '../apps/api/src/infrastructure/persistence/drizzle/tenant-config-store.ts';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

const { Client } = pg;
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixturePath = resolve(
  repositoryRoot,
  'apps/api/test/fixtures/default-tenant-manifest.json',
);
const sensitiveValues = [];

function redact(value) {
  return sensitiveValues
    .filter((secret) => secret.length > 0)
    .sort((left, right) => right.length - left.length)
    .reduce((text, secret) => text.split(secret).join('[redacted]'), value);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 120_000,
    ...options,
  });
  if (result.error)
    throw new Error(`${command} could not start: ${result.error.message}`);
  const output = redact(`${result.stdout ?? ''}${result.stderr ?? ''}`).trim();
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? result.signal}): ${output}`,
    );
  }
  return output;
}

async function createCertificate(directory, name) {
  const certificatePath = resolve(directory, `${name}.crt`);
  const keyPath = resolve(directory, `${name}.key`);
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certificatePath,
    '-days',
    '2',
    '-subj',
    '/CN=queue-pilot-rehearsal',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
  ]);
  await chmod(keyPath, 0o600);
  return { certificatePath, keyPath };
}

async function expectTlsFailure(connectionString, expectedCode, label) {
  const client = new Client({ connectionString });
  try {
    await assert.rejects(
      client.connect(),
      (error) => error?.code === expectedCode,
      `${label} must fail with ${expectedCode}`,
    );
  } finally {
    await client.end();
  }
}

async function main() {
  await withTemporaryPostgres(
    async ({ postgres, urlFor, temporaryDirectory }) => {
      const port = new URL(urlFor('postgres')).port;
      const ownerPassword = randomBytes(32).toString('base64url');
      const runtimePassword = '@:/?#% white space %40 %2F %zz 日本語🙂';
      sensitiveValues.push(ownerPassword, runtimePassword);

      const ownerUrl = new URL(urlFor('postgres'));
      ownerUrl.pathname = '/app';
      ownerUrl.username = encodeURIComponent('app');
      ownerUrl.password = encodeURIComponent(ownerPassword);
      ownerUrl.search = '';
      ownerUrl.searchParams.set('sslmode', 'disable');
      sensitiveValues.push(ownerUrl.href);

      const runtimeEnvironment = {
        DB_HOST: '127.0.0.1',
        DB_PORT: port,
        DB_NAME: 'app',
        DB_USER: 'queue_pilot_runtime_login',
        DB_PASSWORD: runtimePassword,
        DB_SSLMODE: 'disable',
        AUTH_MODE: 'legacy-single',
        ADMIN_TOKEN: 'a'.repeat(32),
        AGENT_TOKEN: 'b'.repeat(32),
        APP_MANIFEST_PATH: fixturePath,
      };
      const runtimeUrl = loadDatabaseUrl(runtimeEnvironment);
      sensitiveValues.push(runtimeUrl, encodeURIComponent(runtimePassword));
      assert.equal(
        loadDatabaseUrl({ DATABASE_URL: ownerUrl.href }),
        ownerUrl.href,
        'DATABASE_URL compatibility must preserve the URI byte-for-byte.',
      );
      const runtimeConfig = loadConfig(runtimeEnvironment);
      assert.equal(runtimeConfig.databaseUrl, runtimeUrl);

      const manifestResult = parseTenantManifest(
        JSON.parse(await readFile(fixturePath, 'utf8')),
      );
      assert(
        manifestResult.ok,
        'The fictional rehearsal manifest must validate.',
      );
      const manifest = manifestResult.value;
      const migrationsDirectory = resolve(repositoryRoot, 'db/migrations');
      const migrationVersions = (await readdir(migrationsDirectory))
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .map((name) => name.slice(0, name.indexOf('_')));
      const atlasConfigPath = resolve(
        temporaryDirectory,
        'atlas-rehearsal.hcl',
      );
      await writeFile(
        atlasConfigPath,
        `env "rehearsal" {\n  url = getenv("DATABASE_URL")\n  migration {\n    dir = "${pathToFileURL(migrationsDirectory).href}"\n  }\n}\n`,
      );

      const administrator = postgres.getPgClient('postgres', '127.0.0.1');
      await administrator.connect();
      try {
        await administrator.query(
          'CREATE ROLE queue_pilot_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',
        );
        await administrator.query(
          `CREATE ROLE app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${sqlLiteral(ownerPassword)}`,
        );
        await administrator.query('CREATE DATABASE app OWNER app');
        await administrator.query(
          `CREATE ROLE queue_pilot_runtime_login LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${sqlLiteral(runtimePassword)}`,
        );
        await administrator.query(
          'GRANT queue_pilot_runtime TO queue_pilot_runtime_login',
        );

        const atlasArguments = [
          'migrate',
          'apply',
          '--env',
          'rehearsal',
          '--config',
          pathToFileURL(atlasConfigPath).href,
        ];
        assert(!atlasArguments.includes(ownerUrl.href));
        run('atlas', atlasArguments, {
          env: { ...process.env, DATABASE_URL: ownerUrl.href },
        });

        const owner = new Client({ connectionString: ownerUrl.href });
        await owner.connect();
        try {
          const role = await owner.query(
            'SELECT current_user, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
          );
          assert.deepEqual(role.rows[0], {
            current_user: 'app',
            rolsuper: false,
            rolcreaterole: false,
            rolcreatedb: false,
          });
          const appliedMigrations = await owner.query(
            'SELECT version FROM atlas_schema_revisions.atlas_schema_revisions ORDER BY version',
          );
          assert.deepEqual(
            appliedMigrations.rows.map(({ version }) => version),
            migrationVersions,
            'Atlas must apply every checked-in migration as the non-superuser owner.',
          );

          await applyTenantManifest(ownerUrl.href, manifest, undefined);
          await applyTenantManifest(ownerUrl.href, manifest, undefined);

          const constraints = await owner.query(
            `SELECT conname, convalidated
           FROM pg_constraint
           WHERE contype = 'c' AND connamespace = 'public'::regnamespace
           ORDER BY conname`,
          );
          const expectedChecks = [
            'agent_credentials_expiry_after_creation',
            'agent_credentials_hash_format',
            'event_equipment_sort_order_nonnegative',
            'print_jobs_attempt_nonnegative',
            'print_jobs_lease_consistent',
            'print_jobs_output_kind_allowed',
            'print_jobs_payload_version_check',
            'print_jobs_status_allowed',
            'tenant_memberships_role_check',
            'ticket_counters_last_number_positive',
            'tickets_cancel_reason_consistent',
            'tickets_number_positive',
            'tickets_party_size_range',
            'tickets_previous_slot_alignment',
            'tickets_public_token_format',
            'tickets_slot_alignment',
            'tickets_slot_change_comment_length',
            'tickets_slot_change_consistent',
            'tickets_slot_pair_consistent',
            'tickets_slot_release_consistent',
            'tickets_slot_status_consistent',
            'tickets_status_allowed',
          ];
          assert.deepEqual(
            constraints.rows.map(({ conname }) => conname),
            expectedChecks.toSorted(),
            'The migration rehearsal must retain the complete checked-in CHECK-constraint set.',
          );
          assert(
            constraints.rows.every(({ convalidated }) => convalidated),
            'Every CHECK constraint must remain validated.',
          );
        } finally {
          await owner.end();
        }
      } finally {
        await administrator.end();
      }

      const ownerDatabase = createDrizzleDatabase(ownerUrl.href, 1);
      try {
        await assert.rejects(
          assertSharedRuntimeRole(ownerDatabase.db),
          /AUTH_MODE=oidc\/shared requires/,
        );
      } finally {
        await ownerDatabase.close();
      }

      const runtimeDatabase = createDrizzleDatabase(runtimeUrl, 1);
      try {
        await assertSharedRuntimeRole(runtimeDatabase.db);
      } finally {
        await runtimeDatabase.close();
      }

      const runtimeClient = new Client({ connectionString: runtimeUrl });
      await runtimeClient.connect();
      try {
        const unscoped = await runtimeClient.query(
          'SELECT (SELECT count(*)::text FROM tenants) AS tenants, (SELECT count(*)::text FROM events) AS events',
        );
        assert.deepEqual(unscoped.rows[0], { tenants: '0', events: '0' });
        await assert.rejects(
          runtimeClient.query(
            'CREATE TABLE public.rehearsal_forbidden_ddl (id integer)',
          ),
          (error) => error?.code === '42501',
          'The runtime role must not create public tables.',
        );

        await runtimeClient.query('BEGIN');
        try {
          await runtimeClient.query('SET LOCAL ROLE queue_pilot_runtime');
          for (const tenant of manifest.tenants) {
            const event = tenant.events[0];
            assert(event !== undefined);
            await runtimeClient.query(
              "SELECT set_config('app.tenant_id', $1, true), set_config('app.event_id', $2, true)",
              [tenant.id, event.id],
            );
            const visibleTenants = await runtimeClient.query(
              'SELECT id::text FROM tenants ORDER BY id',
            );
            const visibleEvents = await runtimeClient.query(
              'SELECT id::text FROM events ORDER BY id',
            );
            assert.deepEqual(
              visibleTenants.rows.map(({ id }) => id),
              [tenant.id],
            );
            assert.deepEqual(
              visibleEvents.rows.map(({ id }) => id),
              [event.id],
            );
          }
          await runtimeClient.query('COMMIT');
        } catch (error) {
          await runtimeClient.query('ROLLBACK');
          throw error;
        }
      } finally {
        await runtimeClient.end();
      }

      const serverCertificate = await createCertificate(
        temporaryDirectory,
        'server',
      );
      const wrongCertificate = await createCertificate(
        temporaryDirectory,
        'wrong-ca',
      );
      const sslAdministrator = postgres.getPgClient('postgres', '127.0.0.1');
      await sslAdministrator.connect();
      try {
        await sslAdministrator.query("ALTER SYSTEM SET ssl = 'on'");
        await sslAdministrator.query(
          `ALTER SYSTEM SET ssl_cert_file = ${sqlLiteral(serverCertificate.certificatePath)}`,
        );
        await sslAdministrator.query(
          `ALTER SYSTEM SET ssl_key_file = ${sqlLiteral(serverCertificate.keyPath)}`,
        );
      } finally {
        await sslAdministrator.end();
      }
      await postgres.stop();
      await postgres.start();

      const trustedTlsEnvironment = {
        ...runtimeEnvironment,
        DB_SSLMODE: 'verify-full',
        DB_SSLROOTCERT: serverCertificate.certificatePath,
      };
      const trustedTlsClient = new Client({
        connectionString: loadDatabaseUrl(trustedTlsEnvironment),
      });
      sensitiveValues.push(
        trustedTlsClient.connectionParameters?.password ?? '',
      );
      await trustedTlsClient.connect();
      try {
        const identity = await trustedTlsClient.query(
          'SELECT current_user AS user_name',
        );
        assert.equal(identity.rows[0]?.user_name, 'queue_pilot_runtime_login');
      } finally {
        await trustedTlsClient.end();
      }

      await expectTlsFailure(
        loadDatabaseUrl({
          ...trustedTlsEnvironment,
          DB_SSLROOTCERT: wrongCertificate.certificatePath,
        }),
        'DEPTH_ZERO_SELF_SIGNED_CERT',
        'An untrusted CA',
      );
      await expectTlsFailure(
        loadDatabaseUrl({ ...trustedTlsEnvironment, DB_HOST: 'localhost' }),
        'ERR_TLS_CERT_ALTNAME_INVALID',
        'A hostname absent from the certificate SAN',
      );
    },
  );

  console.log(
    'Database bootstrap rehearsal passed: component-password login, owner migrations, idempotent tenant apply, role/RLS/DDL/CHECK guards, trusted TLS, and CA/hostname rejection.',
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(redact(message));
  process.exitCode = 1;
});
