import { readdir, readFile } from 'node:fs/promises';
import type EmbeddedPostgres from 'embedded-postgres';
import type { Client } from 'pg';
import { withTemporaryPostgres } from '../../../../../scripts/embedded-postgres.mjs';

const migrationDirectory = new URL(
  '../../../../../db/migrations/',
  import.meta.url,
);

type FreshPostgresContext = {
  owner: Client;
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
};

export async function withFreshMigratedPostgres(
  operation: (context: FreshPostgresContext) => Promise<void>,
): Promise<void> {
  await withTemporaryPostgres(async ({ postgres, urlFor }) => {
    const owner = postgres.getPgClient('postgres', '127.0.0.1');
    await owner.connect();
    try {
      const migrations = (await readdir(migrationDirectory))
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const name of migrations) {
        await owner.query(
          await readFile(new URL(name, migrationDirectory), 'utf8'),
        );
      }
      await operation({ owner, postgres, urlFor });
    } finally {
      await owner.end();
    }
  });
}
