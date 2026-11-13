import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type {
  NodePgDatabase,
  NodePgTransaction,
} from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export type DrizzleDatabase = NodePgDatabase<typeof schema>;
export type DrizzleTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function createDrizzleDatabase(
  connectionString: string,
  maxConnections = 10,
) {
  const pool = new Pool({ connectionString, max: maxConnections });
  pool.on('error', (error) => {
    console.error({ name: error.name, message: error.message });
  });
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  };
}
