import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error.ts';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          error instanceof ApiError &&
          (error.status === 403 || error.status === 404)
            ? false
            : failureCount < 3,
      },
    },
  });
}
