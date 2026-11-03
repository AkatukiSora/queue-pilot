import { cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrationDirectory, runAtlas, runCommand } from './atlas.mjs';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

await withTemporaryPostgres(
  async ({ postgres, urlFor, temporaryDirectory }) => {
    await postgres.createDatabase('atlasdev');
    await postgres.createDatabase('atlasvalidate');
    const environment = {
      ...process.env,
      ATLAS_DEV_URL: urlFor('atlasdev'),
      DATABASE_URL: urlFor('postgres'),
    };

    await runAtlas(
      [
        'migrate',
        'validate',
        '--env',
        'local',
        '--dev-url',
        urlFor('atlasvalidate'),
      ],
      environment,
    );
    await runCommand(process.execPath, ['scripts/db-migrate.mjs'], environment);
    await runCommand(process.execPath, ['scripts/db-migrate.mjs'], environment);
    await runCommand(process.execPath, ['scripts/db-status.mjs'], environment);

    const client = postgres.getPgClient();
    await client.connect();
    try {
      const requiredConstraints = [
        'tickets_counter_key_number_key',
        'tickets_idempotency_key_key',
        'tickets_public_token_key',
        'tickets_number_positive',
        'tickets_party_size_range',
        'tickets_public_token_format',
        'tickets_status_allowed',
        'tickets_cancel_reason_consistent',
        'ticket_counters_last_number_positive',
        'print_jobs_status_allowed',
        'print_jobs_attempt_nonnegative',
        'print_jobs_lease_consistent',
      ];
      const constraints = await client.query(
        'SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = $1 AND constraint_name = ANY($2::text[])',
        ['public', requiredConstraints],
      );
      const foundConstraints = new Set(
        constraints.rows.map((row) => row.constraint_name),
      );
      const missingConstraints = requiredConstraints.filter(
        (name) => !foundConstraints.has(name),
      );
      if (missingConstraints.length > 0) {
        throw new Error(
          `PostgreSQL に必要な CHECK/UNIQUE 制約がありません: ${missingConstraints.join(', ')}`,
        );
      }

      const partialIndex = await client.query(
        'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 AND indexname = $3',
        ['public', 'print_jobs', 'print_jobs_queued_pick_idx'],
      );
      const indexDefinition = partialIndex.rows[0]?.indexdef?.toLowerCase();
      if (
        !indexDefinition?.includes('where') ||
        !indexDefinition.includes("'queued'") ||
        !indexDefinition.includes('created_at, id')
      ) {
        throw new Error(
          'queued 取得用の部分 index print_jobs_queued_pick_idx が見つからないか定義が不正です。',
        );
      }

      const version = await client.query('SHOW server_version');
      console.log(
        `制約 ${requiredConstraints.length} 件と queued 部分 index を PostgreSQL ${version.rows[0].server_version} で確認しました。`,
      );
    } finally {
      await client.end();
    }

    const verificationDirectory = join(temporaryDirectory, 'verify-migrations');
    await cp(join(process.cwd(), 'db/migrations'), verificationDirectory, {
      recursive: true,
    });
    const before = (await readdir(verificationDirectory)).sort();
    await runAtlas(
      [
        'migrate',
        'diff',
        'verify',
        '--env',
        'local',
        '--dir',
        pathToFileURL(verificationDirectory).href,
      ],
      environment,
    );
    const after = (await readdir(verificationDirectory)).sort();
    if (before.join('\n') !== after.join('\n')) {
      throw new Error(
        `再 diff で追加 migration が生成されました: ${after.filter((name) => !before.includes(name)).join(', ')}`,
      );
    }
    console.log(
      `全 migration を ${migrationDirectory} から一時 PostgreSQL に適用し、再 diff が空であることを確認しました。`,
    );
  },
);
