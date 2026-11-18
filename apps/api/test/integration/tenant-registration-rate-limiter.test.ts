import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { createTenantRegistrationRateLimiter } from '../../src/infrastructure/auth/tenant-registration-rate-limiter.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

it('shares the per-identity signup limit across independent API instances', async () => {
  await withFreshMigratedPostgres(async ({ urlFor }) => {
    const firstPool = new Pool({ connectionString: urlFor('postgres') });
    const secondPool = new Pool({ connectionString: urlFor('postgres') });
    // Idle pooled clients can be terminated when the temporary server stops; the
    // production pool handles this event too, so an unhandled one must not fail the run.
    firstPool.on('error', () => undefined);
    secondPool.on('error', () => undefined);
    try {
      const firstInstance = createTenantRegistrationRateLimiter(firstPool);
      const secondInstance = createTenantRegistrationRateLimiter(secondPool);
      const identity = {
        issuer: 'https://github.com',
        subject: '1234567',
      };

      for (let request = 0; request < 5; request += 1) {
        const limiter = request % 2 === 0 ? firstInstance : secondInstance;
        await expect(limiter.consume(identity, '192.0.2.10')).resolves.toEqual({
          allowed: true,
        });
      }
      await expect(
        secondInstance.consume(identity, '192.0.2.10'),
      ).resolves.toMatchObject({
        allowed: false,
        retryAfterMs: expect.any(Number),
      });
      await expect(
        secondInstance.consume(
          { ...identity, subject: '7654321' },
          '192.0.2.10',
        ),
      ).resolves.toEqual({ allowed: true });
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
    }
  });
});
