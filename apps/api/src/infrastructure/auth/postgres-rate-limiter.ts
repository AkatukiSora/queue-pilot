import type { Pool } from 'pg';
import { RateLimiterPostgres } from 'rate-limiter-flexible';

export type SharedRateLimitPolicy = {
  keyPrefix: string;
  points: number;
  duration: number;
};

export function createSharedPostgresRateLimiter(
  pool: Pool,
  policy: SharedRateLimitPolicy,
): RateLimiterPostgres {
  return new RateLimiterPostgres({
    ...policy,
    storeClient: pool,
    storeType: 'pool',
    schemaName: 'public',
    tableName: 'rate_limiter',
    tableCreated: true,
    clearExpiredByTimeout: true,
  });
}
