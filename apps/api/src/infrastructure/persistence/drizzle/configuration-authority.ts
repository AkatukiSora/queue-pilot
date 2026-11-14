import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import type { DrizzleDatabase } from './client.ts';
import { configurationAuthority } from './schema.ts';

export async function assertConfigurationOwner(
  client: Client,
  requiredTables: readonly string[],
  operation = 'Configuration administration',
): Promise<void> {
  const [owners, currentUser] = await Promise.all([
    client.query<{ table_name: string; table_owner: string }>(
      `SELECT class.relname AS table_name, pg_get_userbyid(class.relowner) AS table_owner
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND class.relkind = 'r'
         AND class.relname = ANY($1::text[])`,
      [requiredTables],
    ),
    client.query<{ current_user: string }>('SELECT current_user'),
  ]);
  const ownerNames = new Map(
    owners.rows.map(({ table_name, table_owner }) => [table_name, table_owner]),
  );
  if (
    requiredTables.some(
      (tableName) =>
        ownerNames.get(tableName) !== currentUser.rows[0]?.current_user,
    )
  ) {
    throw new Error(
      `${operation} requires a database connection that owns every configuration table.`,
    );
  }
}

export type ConfigurationAuthorityMode = 'manifest' | 'database';

export async function readConfigurationAuthorityMode(
  connectionString: string,
): Promise<ConfigurationAuthorityMode> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(
      client,
      ['configuration_authority'],
      'Bootstrap',
    );
    const result = await client.query<{ mode: string }>(
      'SELECT mode FROM configuration_authority WHERE id = 1',
    );
    const mode = result.rows[0]?.mode;
    if (mode !== 'manifest' && mode !== 'database') {
      throw new Error(
        'Database configuration authority singleton is missing or invalid.',
      );
    }
    return mode;
  } finally {
    await client.end();
  }
}

export async function lockConfigurationAuthority(
  client: Client,
): Promise<ConfigurationAuthorityMode> {
  const result = await client.query<{ mode: string }>(
    'SELECT mode FROM configuration_authority WHERE id = 1 FOR UPDATE',
  );
  const mode = result.rows[0]?.mode;
  if (mode !== 'manifest' && mode !== 'database') {
    throw new Error(
      'Database configuration authority singleton is missing or invalid.',
    );
  }
  return mode;
}

export async function assertConfigurationAuthority(
  database: DrizzleDatabase,
  expectedMode: ConfigurationAuthorityMode,
): Promise<void> {
  const [authority] = await database
    .select({ mode: configurationAuthority.mode })
    .from(configurationAuthority)
    .where(eq(configurationAuthority.id, 1))
    .limit(1);
  if (authority === undefined) {
    throw new Error('Database configuration authority singleton is missing.');
  }
  if (authority.mode !== 'manifest' && authority.mode !== 'database') {
    throw new Error('Database configuration authority mode is invalid.');
  }
  if (authority.mode !== expectedMode) {
    throw new Error(
      `TENANT_CONFIG_SOURCE=${expectedMode} does not match database configuration authority mode=${authority.mode}.`,
    );
  }
}
