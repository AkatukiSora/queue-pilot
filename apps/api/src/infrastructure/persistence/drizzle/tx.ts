import type { Repositories, UnitOfWork } from '../../../application/ports.ts';
import type { Result } from '../../../domain/result.ts';
import { createPrintJobRepository } from '../../repositories/print-job-repository.ts';
import { createTicketRepository } from '../../repositories/ticket-repository.ts';
import type { DrizzleDatabase } from './client.ts';

class RollbackResultError<T, E> extends Error {
  constructor(readonly result: Extract<Result<T, E>, { ok: false }>) {
    super('Application result requires transaction rollback.');
  }
}

export function createUnitOfWork(database: DrizzleDatabase): UnitOfWork {
  return {
    async run<T, E>(
      operation: (repositories: Repositories) => Promise<Result<T, E>>,
    ) {
      try {
        return await database.transaction(async (transaction) => {
          const result = await operation({
            tickets: createTicketRepository(transaction),
            printJobs: createPrintJobRepository(transaction),
          });
          if (!result.ok) throw new RollbackResultError(result);
          return result;
        });
      } catch (error) {
        if (error instanceof RollbackResultError) {
          return error.result as Result<T, E>;
        }
        throw error;
      }
    },
  };
}
