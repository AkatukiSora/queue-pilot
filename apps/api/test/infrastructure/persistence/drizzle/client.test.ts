import { describe, expect, it, vi } from 'vitest';
import { createDrizzleDatabase } from '../../../../src/infrastructure/persistence/drizzle/client.ts';

describe('Drizzle PostgreSQL pool', () => {
  it('handles idle client errors and logs only their name and message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDrizzleDatabase(
      'postgres://test:test@127.0.0.1:5432/test',
    );

    try {
      const pool = database.db.$client;
      expect(pool.listenerCount('error')).toBeGreaterThan(0);
      const error = new Error('idle client connection failed');
      expect(() => pool.emit('error', error)).not.toThrow();
      expect(log).toHaveBeenCalledExactlyOnceWith({
        name: error.name,
        message: error.message,
      });
    } finally {
      await database.close();
      log.mockRestore();
    }
  });
});
