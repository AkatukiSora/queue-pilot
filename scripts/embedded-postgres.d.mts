import type EmbeddedPostgres from 'embedded-postgres';

export type TemporaryPostgresContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

export function withTemporaryPostgres(
  operation: (context: TemporaryPostgresContext) => Promise<void>,
): Promise<void>;
