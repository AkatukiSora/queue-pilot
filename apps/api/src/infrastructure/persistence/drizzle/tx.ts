import { sql } from 'drizzle-orm';
import type { RequestContextStorage } from '../../../application/security-ports.ts';
import type { Repositories, UnitOfWork } from '../../../application/ports.ts';
import type { Result } from '../../../domain/result.ts';
import { createPrintJobRepository } from '../../repositories/print-job-repository.ts';
import { createTicketRepository } from '../../repositories/ticket-repository.ts';
import type { DrizzleDatabase } from './client.ts';

class RollbackResultError<T, E> extends Error {
  readonly result: Extract<Result<T, E>, { ok: false }>;

  constructor(result: Extract<Result<T, E>, { ok: false }>) {
    super('Application result requires transaction rollback.');
    this.result = result;
  }
}

export function createUnitOfWork(
  database: DrizzleDatabase,
  requestContext: RequestContextStorage,
): UnitOfWork {
  return {
    async run<T, E>(
      operation: (repositories: Repositories) => Promise<Result<T, E>>,
    ) {
      const context = requestContext.current();
      if (context === undefined) {
        throw new Error('A tenant/event request context is required.');
      }
      try {
        return await database.transaction(async (transaction) => {
          await transaction.execute(sql`
            SELECT set_config('app.tenant_id', ${context.tenantId}, true),
                   set_config('app.event_id', ${context.eventId}, true),
                   set_config('app.user_id', ${context.userId ?? ''}, true),
                   set_config('app.agent_id', ${context.agentId ?? ''}, true),
                   set_config('app.printer_id', ${context.printerId ?? ''}, true),
                   set_config('app.public_ticket_id', ${context.publicTicketId ?? ''}, true)
          `);
          const result = await operation({
            tickets: createTicketRepository(transaction, context),
            printJobs: createPrintJobRepository(transaction, context),
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
