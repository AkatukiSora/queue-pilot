import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { createSharedPostgresRateLimiter } from './postgres-rate-limiter.ts';

export function createTenantRegistrationRateLimiter(pool: Pool) {
  const identityLimiter = createSharedPostgresRateLimiter(pool, {
    keyPrefix: 'tenant-signup-identity',
    points: 5,
    duration: 60 * 60,
  });
  const ipLimiter = createSharedPostgresRateLimiter(pool, {
    keyPrefix: 'tenant-signup-ip',
    points: 20,
    duration: 60 * 60,
  });
  const serviceLimiter = createSharedPostgresRateLimiter(pool, {
    keyPrefix: 'tenant-signup-service',
    points: 100,
    duration: 24 * 60 * 60,
  });

  return {
    consume: async (
      identity: { issuer: string; subject: string },
      clientIp: string | null,
    ) => {
      const results = await Promise.allSettled([
        identityLimiter.consume(
          digest(`${identity.issuer}\u0000${identity.subject}`),
        ),
        ipLimiter.consume(digest(clientIp ?? 'unknown')),
        serviceLimiter.consume('all'),
      ]);
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      const operationalFailure = failures.find(
        (error) => !(error instanceof RateLimiterRes),
      );
      if (operationalFailure !== undefined) throw operationalFailure;
      const retryAfterMs = failures.reduce(
        (maximum, error) =>
          error instanceof RateLimiterRes
            ? Math.max(maximum, error.msBeforeNext)
            : maximum,
        0,
      );
      return retryAfterMs > 0
        ? { allowed: false as const, retryAfterMs }
        : { allowed: true as const };
    },
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
