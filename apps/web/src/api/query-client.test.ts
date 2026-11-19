import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error.ts';
import { createAppQueryClient } from './query-client.ts';

describe('application query retries', () => {
  it.each([403, 404] as const)(
    'does not retry a %s API response',
    async (status) => {
      vi.useFakeTimers();
      try {
        const client = createAppQueryClient();
        let attempts = 0;
        const request = client.fetchQuery({
          queryKey: ['scope', status],
          queryFn: async () => {
            attempts += 1;
            throw new ApiError('scope_error', 'failed', status);
          },
        });
        const outcome = request.then(
          () => null,
          (error: unknown) => error,
        );
        await vi.runAllTimersAsync();
        expect(await outcome).toMatchObject({ status });
        expect(attempts).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    ['500', () => new ApiError('server_error', 'failed', 500)],
    ['network', () => new TypeError('Failed to fetch')],
  ])('keeps the default four attempts for %s errors', async (name, error) => {
    vi.useFakeTimers();
    try {
      const client = createAppQueryClient();
      let attempts = 0;
      const request = client.fetchQuery({
        queryKey: ['transient', name],
        queryFn: async () => {
          attempts += 1;
          throw error();
        },
      });
      const outcome = request.then(
        () => null,
        (failure: unknown) => failure,
      );
      await vi.runAllTimersAsync();
      expect(await outcome).toBeTruthy();
      expect(attempts).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not set a mutation retry policy', () => {
    expect(
      createAppQueryClient().getDefaultOptions().mutations?.retry,
    ).toBeUndefined();
  });
});
