import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

const root = process.cwd();
const script = join(root, 'scripts/configuration-admin.ts');
const migrationDirectory = join(root, 'db/migrations');
let temporaryDirectory;

await withTemporaryPostgres(
  async ({ postgres, urlFor, temporaryDirectory: directory }) => {
    temporaryDirectory = directory;
    const databases = [
      'configuration_import_source',
      'configuration_import_target',
      'configuration_adopt',
    ];
    const migrations = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const database of databases) {
      await postgres.createDatabase(database);
      const client = postgres.getPgClient(database, '127.0.0.1');
      await client.connect();
      try {
        for (const migration of migrations) {
          await client.query(
            await readFile(join(migrationDirectory, migration), 'utf8'),
          );
        }
      } finally {
        await client.end();
      }
    }

    const sourceSlug = `rehearsal-${randomBytes(6).toString('hex')}`;
    const sourceAdmin = BigInt(
      `0x${randomBytes(6).toString('hex')}`,
    ).toString();
    const legacyMember = BigInt(
      `0x${randomBytes(6).toString('hex')}`,
    ).toString();
    const designatedAdmin = BigInt(
      `0x${randomBytes(6).toString('hex')}`,
    ).toString();
    const sourceUrl = urlFor(databases[0]);
    const targetUrl = urlFor(databases[1]);
    const sourceInitialized = runCli(
      ['initialize-web', '--database-url-env', 'REHEARSAL_DATABASE_URL'],
      {
        REHEARSAL_DATABASE_URL: sourceUrl,
        BOOTSTRAP_GITHUB_SUBJECT: sourceAdmin,
        BOOTSTRAP_TENANT_SLUG: sourceSlug,
        BOOTSTRAP_TENANT_NAME: 'Configuration import rehearsal',
      },
    );
    assert.equal(sourceInitialized.initialized, true);

    const source = await postgres.getPgClient(databases[0], '127.0.0.1');
    await source.connect();
    try {
      const userId = randomUUID();
      await source.query(
        'INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL)',
        [userId, 'https://github.com', legacyMember],
      );
      await source.query(
        "INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at) VALUES ($1, $2, 'staff', NULL)",
        [sourceInitialized.tenantId, userId],
      );
    } finally {
      await source.end();
    }

    const exportPath = join(directory, 'configuration-export.json');
    const exported = runCli(
      [
        'export',
        '--tenant-slug',
        sourceSlug,
        '--file',
        exportPath,
        '--database-url-env',
        'REHEARSAL_DATABASE_URL',
      ],
      { REHEARSAL_DATABASE_URL: sourceUrl },
    );
    assert.deepEqual(exported, { exported: true, tenantSlug: sourceSlug });
    assert.equal(statSync(exportPath).mode & 0o777, 0o600);
    const snapshot = JSON.parse(await readFile(exportPath, 'utf8'));
    assert.equal(snapshot.members.length, 2);
    assert.equal(
      snapshot.members.filter(({ disabled }) => !disabled).length,
      2,
    );
    assert.equal(snapshot.events.length, 0);

    const dryRun = runCli(
      [
        'import-export',
        '--file',
        exportPath,
        '--dry-run',
        '--admin-subject-env',
        'REHEARSAL_ADMIN_SUBJECT',
        '--database-url-env',
        'REHEARSAL_DATABASE_URL',
      ],
      {
        REHEARSAL_DATABASE_URL: targetUrl,
        REHEARSAL_ADMIN_SUBJECT: designatedAdmin,
      },
    );
    assert.equal(dryRun.imported, false);
    assert.equal(dryRun.membersDisabled, 2);
    assert.equal(dryRun.sourceActiveMembers, 2);
    assert.equal(dryRun.designatedAdminWasMember, false);

    const target = await postgres.getPgClient(databases[1], '127.0.0.1');
    await target.connect();
    try {
      const unchanged = await target.query(
        `SELECT authority.mode, authority.revision::text,
       (SELECT count(*) FROM tenants WHERE slug = $1)::text AS tenant_count,
       (SELECT count(*) FROM configuration_audit WHERE action = 'import-export')::text AS audit_count
       FROM configuration_authority AS authority WHERE authority.id = 1`,
        [sourceSlug],
      );
      assert.deepEqual(unchanged.rows, [
        {
          mode: 'manifest',
          revision: '1',
          tenant_count: '0',
          audit_count: '0',
        },
      ]);
    } finally {
      await target.end();
    }

    const imported = runCli(
      [
        'import-export',
        '--file',
        exportPath,
        '--admin-subject-env',
        'REHEARSAL_ADMIN_SUBJECT',
        '--database-url-env',
        'REHEARSAL_DATABASE_URL',
      ],
      {
        REHEARSAL_DATABASE_URL: targetUrl,
        REHEARSAL_ADMIN_SUBJECT: designatedAdmin,
      },
    );
    assert.equal(imported.imported, true);
    assert.equal(imported.membersDisabled, 2);

    const importedTarget = await postgres.getPgClient(
      databases[1],
      '127.0.0.1',
    );
    await importedTarget.connect();
    try {
      const memberships = await importedTarget.query(
        `SELECT app_user.subject, membership.role, membership.disabled_at IS NULL AS active
       FROM tenant_memberships AS membership
       JOIN app_users AS app_user ON app_user.id = membership.user_id
       WHERE membership.tenant_id = $1 ORDER BY app_user.subject`,
        [snapshot.tenant.id],
      );
      assert.equal(memberships.rows.length, 3);
      assert.deepEqual(
        memberships.rows.filter(({ active }) => active),
        [{ subject: designatedAdmin, role: 'admin', active: true }],
      );
      assert.equal(memberships.rows.filter(({ active }) => !active).length, 2);
      const authority = await importedTarget.query(
        'SELECT mode, revision::text FROM configuration_authority WHERE id = 1',
      );
      assert.deepEqual(authority.rows, [{ mode: 'database', revision: '2' }]);
      const audit = await importedTarget.query(
        "SELECT count(*)::text AS count FROM configuration_audit WHERE action = 'import-export'",
      );
      assert.equal(audit.rows[0]?.count, '1');
    } finally {
      await importedTarget.end();
    }

    const manifestPath = join(
      root,
      'apps/api/test/fixtures/default-tenant-manifest.json',
    );
    const adoptionDatabaseUrl = urlFor(databases[2]);
    const adoptionPreview = runCli(
      [
        'adopt-web',
        '--file',
        manifestPath,
        '--dry-run',
        '--database-url-env',
        'REHEARSAL_DATABASE_URL',
      ],
      { REHEARSAL_DATABASE_URL: adoptionDatabaseUrl },
    );
    assert.equal(adoptionPreview.dryRun, true);
    assert.equal(adoptionPreview.eventsCreated, 1);
    const adoption = runCli(
      [
        'adopt-web',
        '--file',
        manifestPath,
        '--database-url-env',
        'REHEARSAL_DATABASE_URL',
      ],
      { REHEARSAL_DATABASE_URL: adoptionDatabaseUrl },
    );
    assert.equal(adoption.dryRun, false);
    assert.equal(adoption.tenantsCreated, 1);
    const adopted = await postgres.getPgClient(databases[2], '127.0.0.1');
    await adopted.connect();
    try {
      const authority = await adopted.query(
        'SELECT mode FROM configuration_authority WHERE id = 1',
      );
      assert.deepEqual(authority.rows, [{ mode: 'database' }]);
    } finally {
      await adopted.end();
    }
  },
);

assert.equal(
  existsSync(temporaryDirectory),
  false,
  'Temporary PostgreSQL directory was not removed.',
);
console.log(
  'Configuration import/adoption process rehearsal passed; dry-run was non-mutating, only the designated admin is active, and temporary PostgreSQL cleanup was verified.',
);

function runCli(args, env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? '',
      ...(process.env.TMPDIR === undefined
        ? {}
        : { TMPDIR: process.env.TMPDIR }),
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(
    result.error,
    undefined,
    'configuration-admin process could not start.',
  );
  assert.equal(
    result.signal,
    null,
    'configuration-admin process did not exit normally.',
  );
  assert.equal(
    result.status,
    0,
    `configuration-admin exited ${result.status}: ${result.stderr}`,
  );
  return JSON.parse(result.stdout.trim());
}
