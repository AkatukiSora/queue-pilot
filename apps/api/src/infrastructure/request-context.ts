import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  AuthenticatedRequestContext,
  RequestContextStorage,
} from '../application/security-ports.ts';

export function createRequestContextStorage(): RequestContextStorage {
  const storage = new AsyncLocalStorage<AuthenticatedRequestContext>();
  return {
    current: () => storage.getStore(),
    run: (context, operation) => storage.run(context, operation),
  };
}
