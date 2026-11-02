import { createHash, timingSafeEqual } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type {
  Clock,
  PrintJob,
  Ticket,
  TokenGenerator,
  UnitOfWork,
} from '../../application/ports.ts';
import {
  callTicket,
  cancelTicket,
  claimPrintJob,
  getPublicTicket,
  getQueue,
  getTicketDetail,
  issueTicket,
  recallTicket,
  reportPrintResult,
  reprintTicket,
  serveTicket,
} from '../../application/use-cases.ts';

const ErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const TicketStatusSchema = z.enum(['waiting', 'called', 'served', 'cancelled']);
const CancelReasonSchema = z.enum(['visitor', 'staff', 'no_show']);
const TicketSchema = z.object({
  id: z.uuid(),
  counterKey: z.string(),
  number: z.number().int().positive(),
  partySize: z.number().int().min(1).max(20),
  status: TicketStatusSchema,
  cancelReason: CancelReasonSchema.nullable(),
  issuedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const PrintJobSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  status: z.enum(['queued', 'printing', 'printed', 'failed', 'unknown']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  attempt: z.number().int().nonnegative(),
  reprintOf: z.uuid().nullable(),
  detail: z.string().nullable(),
});
const TicketResponseSchema = z.object({ ticket: TicketSchema });
const TicketDetailResponseSchema = z.object({
  ticket: TicketSchema,
  printJobs: z.array(PrintJobSchema),
});
const QueueResponseSchema = z.object({
  waiting: z.array(TicketSchema),
  called: z.array(TicketSchema),
  statusCounts: z.object({
    waiting: z.number().int().nonnegative(),
    called: z.number().int().nonnegative(),
    served: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
  printNeedsAttention: z.array(
    z.object({ ticket: TicketSchema, job: PrintJobSchema }),
  ),
  latestCalledNumber: z.number().int().positive().nullable(),
});
const PublicTicketSchema = z.object({
  number: z.number().int().positive(),
  status: TicketStatusSchema,
  aheadInQueue: z.number().int().nonnegative(),
  latestCalledNumber: z.number().int().positive().nullable(),
});
const AgentJobSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  status: z.literal('printing'),
  attempt: z.number().int().positive(),
  leaseToken: z.string(),
  payload: z.object({
    ticketNumber: z.number().int().positive(),
    partySize: z.number().int().min(1).max(20),
    publicToken: z.string().length(22),
    issuedAt: z.iso.datetime(),
  }),
});
const AgentJobResponseSchema = z.object({ job: AgentJobSchema });
const ReportResultSchema = z
  .object({
    leaseToken: z.string().min(1),
    outcome: z.enum(['printed', 'failed', 'unknown']),
    detail: z.string().optional(),
  })
  .strict();
const IssueBodySchema = z
  .object({
    partySize: z.number().int().min(1).max(20).default(1),
  })
  .strict()
  .default({ partySize: 1 });
const CancelBodySchema = z.object({ reason: CancelReasonSchema }).strict();
const IdempotencyHeadersSchema = z.object({
  'idempotency-key': z.string().min(1).max(128),
});
const IdParamsSchema = z.object({ id: z.uuid() });
const PublicTokenParamsSchema = z.object({ token: z.string() });

const failure400 = {
  description: 'Invalid request',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure401 = {
  description: 'Bearer authentication failed',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure404 = {
  description: 'Resource not found',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure409 = {
  description: 'Conflict',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure410 = {
  description: 'Public ticket has expired',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure422 = {
  description: 'Idempotency key was reused with a different request',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure503 = {
  description: 'Service is not ready',
  content: { 'application/json': { schema: ErrorSchema } },
};
const failure500 = {
  description: 'Unexpected server error',
  content: { 'application/json': { schema: ErrorSchema } },
};
const successJson = <S extends z.ZodType>(schema: S, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const adminSecurity = [{ BearerAuth: [] }];
const agentSecurity = [{ BearerAuth: [] }];
const openApiInfo = { title: 'bunkasai-ticket API', version: '1.0.0' };

export type HttpDependencies = {
  unitOfWork: UnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
  adminToken: string;
  agentToken: string;
  eventEndAt: Date;
  numberScope: 'daily' | 'event';
  checkReadiness: () => Promise<boolean>;
  staticRoot?: string;
};

function ticketResponse(ticket: Ticket) {
  return {
    id: ticket.id,
    counterKey: ticket.counterKey,
    number: ticket.number,
    partySize: ticket.partySize,
    status: ticket.state.status,
    cancelReason:
      ticket.state.status === 'cancelled' ? ticket.state.cancelReason : null,
    issuedAt: ticket.issuedAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function printJobResponse(job: PrintJob) {
  return {
    id: job.id,
    ticketId: job.ticketId,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    attempt: job.attempt,
    reprintOf: job.reprintOf,
    detail: job.detail ?? null,
  };
}

function sameSecret(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function bearerAuth(expected: string): MiddlewareHandler {
  return async (context, next) => {
    const authorization = context.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (match === null || !sameSecret(match[1] ?? '', expected)) {
      return context.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Bearer authentication is required.',
          },
        },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      );
    }
    await next();
  };
}

export function createHttpApp(dependencies: HttpDependencies) {
  const app = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (!result.success) {
        return context.json(
          {
            error: {
              code: 'invalid_request',
              message: 'Request validation failed.',
            },
          },
          400,
        );
      }
    },
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
  });

  if (dependencies.staticRoot !== undefined) {
    app.use('*', async (context, next) => {
      if (context.req.path === '/api' || context.req.path.startsWith('/api/')) {
        return next();
      }
      return serveStatic({ root: dependencies.staticRoot })(context, next);
    });
  }

  app.use('/api/admin/*', bearerAuth(dependencies.adminToken));
  app.use('/api/agent/*', bearerAuth(dependencies.agentToken));

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/healthz',
      operationId: 'getHealth',
      tags: ['system'],
      responses: {
        200: successJson(
          z.object({ status: z.literal('ok') }),
          'Process is running',
        ),
      },
    }),
    (context) => context.json({ status: 'ok' as const }, 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/readyz',
      operationId: 'getReadiness',
      tags: ['system'],
      responses: {
        200: successJson(
          z.object({ status: z.literal('ready') }),
          'Database is ready',
        ),
        503: failure503,
      },
    }),
    async (context) => {
      if (!(await dependencies.checkReadiness())) {
        return context.json(
          { error: { code: 'not_ready', message: 'Database is not ready.' } },
          503,
        );
      }
      return context.json({ status: 'ready' as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/openapi.json',
      operationId: 'getOpenApiDocument',
      tags: ['system'],
      responses: {
        200: successJson(
          z.record(z.string(), z.unknown()),
          'OpenAPI 3.1 document',
        ),
      },
    }),
    (context) =>
      context.json(
        app.getOpenAPI31Document({ openapi: '3.1.0', info: openApiInfo }),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/public/tickets/{token}',
      operationId: 'getPublicTicket',
      tags: ['public tickets'],
      request: { params: PublicTokenParamsSchema },
      responses: {
        200: successJson(PublicTicketSchema, 'Public ticket status'),
        404: failure404,
        410: failure410,
      },
    }),
    async (context) => {
      const { token } = context.req.valid('param');
      const result = await getPublicTicket(
        token,
        dependencies.eventEndAt,
        dependencies,
      );
      if (!result.ok) {
        if (result.error.kind === 'TicketNotFound') {
          return context.json(
            {
              error: {
                code: 'ticket_not_found',
                message: 'Ticket was not found.',
              },
            },
            404,
          );
        }
        return context.json(
          {
            error: {
              code: 'ticket_expired',
              message: 'This ticket has expired.',
            },
          },
          410,
        );
      }
      return context.json(result.value, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/admin/tickets',
      operationId: 'issueTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: {
        headers: IdempotencyHeadersSchema,
        body: {
          required: false,
          content: { 'application/json': { schema: IssueBodySchema } },
        },
      },
      responses: {
        200: successJson(TicketResponseSchema, 'Idempotent replay'),
        201: successJson(TicketResponseSchema, 'Ticket issued'),
        400: failure400,
        401: failure401,
        422: failure422,
        500: failure500,
      },
    }),
    async (context) => {
      const { 'idempotency-key': idempotencyKey } = context.req.valid('header');
      const { partySize } = context.req.valid('json');
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ partySize }))
        .digest('hex');
      const result = await issueTicket(
        { idempotencyKey, requestHash, partySize },
        { ...dependencies, numberScope: dependencies.numberScope },
      );
      if (!result.ok) {
        if (result.error.kind === 'IdempotencyKeyReuse') {
          return context.json(
            {
              error: {
                code: 'idempotency_key_reuse',
                message: 'The key was used for a different request.',
              },
            },
            422,
          );
        }
        return context.json(
          {
            error: {
              code: 'internal_error',
              message: 'The request could not be completed.',
            },
          },
          500,
        );
      }
      const response = { ticket: ticketResponse(result.value.ticket) };
      return result.value.replayed
        ? context.json(response, 200, { 'Idempotent-Replayed': 'true' })
        : context.json(response, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/admin/queue',
      operationId: 'getAdminQueue',
      tags: ['admin tickets'],
      security: adminSecurity,
      responses: {
        200: successJson(QueueResponseSchema, 'Waiting and called tickets'),
        401: failure401,
        500: failure500,
      },
    }),
    async (context) => {
      const result = await getQueue(dependencies.unitOfWork);
      if (!result.ok) {
        return context.json(
          {
            error: {
              code: 'internal_error',
              message: 'The request could not be completed.',
            },
          },
          500,
        );
      }
      return context.json(
        {
          waiting: result.value.waiting.map(ticketResponse),
          called: result.value.called.map(ticketResponse),
          statusCounts: result.value.statusCounts,
          printNeedsAttention: result.value.printNeedsAttention.map(
            ({ ticket, job }) => ({
              ticket: ticketResponse(ticket),
              job: printJobResponse(job),
            }),
          ),
          latestCalledNumber: result.value.latestCalledNumber,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/admin/tickets/{id}',
      operationId: 'getAdminTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: { params: IdParamsSchema },
      responses: {
        200: successJson(
          TicketDetailResponseSchema,
          'Ticket and print history',
        ),
        400: failure400,
        401: failure401,
        404: failure404,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const result = await getTicketDetail(id, dependencies.unitOfWork);
      if (!result.ok) {
        return context.json(
          {
            error: {
              code: 'ticket_not_found',
              message: 'Ticket was not found.',
            },
          },
          404,
        );
      }
      return context.json(
        {
          ticket: ticketResponse(result.value.ticket),
          printJobs: result.value.printJobs.map(printJobResponse),
        },
        200,
      );
    },
  );

  const stateRoutes = [
    {
      path: '/api/admin/tickets/{id}/call',
      operationId: 'callTicket',
      action: callTicket,
    },
    {
      path: '/api/admin/tickets/{id}/serve',
      operationId: 'serveTicket',
      action: serveTicket,
    },
    {
      path: '/api/admin/tickets/{id}/recall',
      operationId: 'recallTicket',
      action: recallTicket,
    },
  ] as const;
  for (const route of stateRoutes) {
    app.openapi(
      createRoute({
        method: 'post',
        path: route.path,
        operationId: route.operationId,
        tags: ['admin tickets'],
        security: adminSecurity,
        request: { params: IdParamsSchema },
        responses: {
          200: successJson(TicketResponseSchema, 'Ticket state changed'),
          400: failure400,
          401: failure401,
          404: failure404,
          409: failure409,
        },
      }),
      async (context) => {
        const { id } = context.req.valid('param');
        const result = await route.action(id, dependencies);
        if (!result.ok) {
          if (result.error.kind === 'TicketNotFound') {
            return context.json(
              {
                error: {
                  code: 'ticket_not_found',
                  message: 'Ticket was not found.',
                },
              },
              404,
            );
          }
          return context.json(
            {
              error: {
                code: 'invalid_transition',
                message: 'The ticket cannot make that transition.',
              },
            },
            409,
          );
        }
        return context.json({ ticket: ticketResponse(result.value) }, 200);
      },
    );
  }

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/admin/tickets/{id}/cancel',
      operationId: 'cancelTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: {
        params: IdParamsSchema,
        body: { content: { 'application/json': { schema: CancelBodySchema } } },
      },
      responses: {
        200: successJson(TicketResponseSchema, 'Ticket cancelled'),
        400: failure400,
        401: failure401,
        404: failure404,
        409: failure409,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const { reason } = context.req.valid('json');
      const result = await cancelTicket(id, reason, dependencies);
      if (!result.ok) {
        if (result.error.kind === 'TicketNotFound') {
          return context.json(
            {
              error: {
                code: 'ticket_not_found',
                message: 'Ticket was not found.',
              },
            },
            404,
          );
        }
        return context.json(
          {
            error: {
              code: 'invalid_transition',
              message: 'The ticket cannot make that transition.',
            },
          },
          409,
        );
      }
      return context.json({ ticket: ticketResponse(result.value) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/admin/tickets/{id}/reprint',
      operationId: 'reprintTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: { params: IdParamsSchema },
      responses: {
        201: successJson(
          z.object({ job: PrintJobSchema }),
          'Reprint job created',
        ),
        400: failure400,
        401: failure401,
        404: failure404,
        409: failure409,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const result = await reprintTicket(id, dependencies);
      if (!result.ok) {
        if (result.error.kind === 'TicketNotFound') {
          return context.json(
            {
              error: {
                code: 'ticket_not_found',
                message: 'Ticket was not found.',
              },
            },
            404,
          );
        }
        return context.json(
          {
            error: {
              code: 'print_job_not_reprintable',
              message: 'The latest print job is still queued or printing.',
            },
          },
          409,
        );
      }
      return context.json({ job: printJobResponse(result.value) }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/agent/print-jobs/claim',
      operationId: 'claimPrintJob',
      tags: ['print agent'],
      security: agentSecurity,
      responses: {
        200: successJson(AgentJobResponseSchema, 'A print job was claimed'),
        204: { description: 'No queued print jobs' },
        401: failure401,
        500: failure500,
      },
    }),
    async (context) => {
      const result = await claimPrintJob(dependencies);
      if (!result.ok) {
        return context.json(
          {
            error: {
              code: 'internal_error',
              message: 'The request could not be completed.',
            },
          },
          500,
        );
      }
      if (result.value === null) return context.body(null, 204);
      const { id, ticketId, status, attempt, leaseToken, payload } =
        result.value;
      return context.json(
        {
          job: {
            id,
            ticketId,
            status,
            attempt,
            leaseToken,
            payload: {
              ticketNumber: payload.ticketNumber,
              partySize: payload.partySize,
              publicToken: payload.publicToken,
              issuedAt: payload.issuedAt.toISOString(),
            },
          },
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/agent/print-jobs/{id}/result',
      operationId: 'reportPrintResult',
      tags: ['print agent'],
      security: agentSecurity,
      request: {
        params: IdParamsSchema,
        body: {
          content: { 'application/json': { schema: ReportResultSchema } },
        },
      },
      responses: {
        200: successJson(
          z.object({ job: PrintJobSchema }),
          'Print result recorded',
        ),
        400: failure400,
        401: failure401,
        404: failure404,
        409: failure409,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const body = context.req.valid('json');
      const result = await reportPrintResult(
        { printJobId: id, ...body },
        dependencies,
      );
      if (!result.ok) {
        if (result.error.kind === 'PrintJobNotFound') {
          return context.json(
            {
              error: {
                code: 'print_job_not_found',
                message: 'Print job was not found.',
              },
            },
            404,
          );
        }
        return context.json(
          {
            error: {
              code: 'lease_mismatch',
              message: 'The print lease is no longer valid.',
            },
          },
          409,
        );
      }
      return context.json({ job: printJobResponse(result.value) }, 200);
    },
  );

  app.get('*', async (context, next) => {
    if (context.req.path === '/api' || context.req.path.startsWith('/api/')) {
      return next();
    }
    if (dependencies.staticRoot !== undefined) {
      return serveStatic({ root: dependencies.staticRoot, path: 'index.html' })(
        context,
        next,
      );
    }
    return next();
  });

  app.onError((_error, context) =>
    context.json(
      {
        error: {
          code: 'internal_error',
          message: 'The request could not be completed.',
        },
      },
      500,
    ),
  );
  app.notFound((context) =>
    context.json(
      { error: { code: 'not_found', message: 'Resource was not found.' } },
      404,
    ),
  );
  return app;
}
