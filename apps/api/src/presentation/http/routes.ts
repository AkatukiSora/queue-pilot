import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type {
  AgentCredentialAdministration,
  AuthenticationAdapter,
  AuthorizationRepository,
  AuthenticatedRequestContext,
  Principal,
  RequestContextStorage,
} from '../../application/security-ports.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
} from '../../domain/tenant-manifest.ts';
import type {
  Clock,
  PrintJob,
  Slot,
  SlotReservation,
  Ticket,
  TokenGenerator,
  ScopedUnitOfWork,
} from '../../application/ports.ts';
import { equipmentValues, parseSlotStart } from '../../application/ports.ts';
import {
  cancelTicket,
  claimPrintJob,
  getPublicTicket,
  getReservations,
  getTicketDetail,
  issueTicket,
  type PublicTicketView,
  releaseTicket,
  reportPrintResult,
  reprintTicket,
  rescheduleTicket,
  restoreTicket,
  serveTicket,
  undoGuidanceTicket,
} from '../../application/use-cases.ts';

const ErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const TicketStatusSchema = z.enum(['waiting', 'called', 'served', 'cancelled']);
const CancelReasonSchema = z.enum(['visitor', 'staff', 'no_show']);
const EquipmentSchema = z.string().min(1);
const LegacyEquipmentInputSchema = z.enum(equipmentValues);
const SlotStartInputSchema = z.iso
  .datetime({ offset: true })
  .transform((value, context) => {
    const parsed = parseSlotStart(value);
    if (!parsed.ok) {
      context.addIssue({ code: 'custom', message: 'Invalid slot start time.' });
      return z.NEVER;
    }
    return parsed.value;
  });
const SlotReservationSchema = z.object({
  kind: z.literal('slot'),
  slotStartsAt: z.iso.datetime(),
  equipment: EquipmentSchema,
  experienceEndsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
const LegacyReservationSchema = z.object({ kind: z.literal('legacy') });
const ReservationSchema = z.union([
  SlotReservationSchema,
  LegacyReservationSchema,
]);
const V3EventListSchema = z.object({
  events: z.array(
    z.object({
      tenantId: z.uuid(),
      tenantSlug: z.string(),
      tenantName: z.string(),
      role: z.enum(['admin', 'staff']),
      eventId: z.uuid(),
      eventSlug: z.string(),
      eventTitle: z.string(),
    }),
  ),
});
const AgentCredentialSchema = z.object({
  id: z.uuid(),
  printerId: z.string(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
});
const AgentCredentialListSchema = z.object({ agents: z.array(AgentCredentialSchema) });
const AgentCredentialCreatedSchema = z.object({
  id: z.uuid(),
  token: z.string(),
  expiresAt: z.iso.datetime(),
});
const AgentCreateBodySchema = z.object({
  printerId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  expiresAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
}).strict();
const AgentActionBodySchema = z.object({}).strict();
const LatestChangeSchema = z.object({
  from: ReservationSchema,
  to: SlotReservationSchema,
  changedAt: z.iso.datetime(),
  comment: z.string().nullable(),
});
const TicketFieldsSchema = z.object({
  id: z.uuid(),
  counterKey: z.string(),
  number: z.number().int().positive(),
  cancelReason: CancelReasonSchema.nullable(),
  issuedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  latestChange: LatestChangeSchema.nullable(),
  slotReleasedAt: z.iso.datetime().nullable(),
});
const TicketSchema = z.union([
  TicketFieldsSchema.extend({
    status: z.enum(['waiting', 'served', 'cancelled']),
    reservation: SlotReservationSchema,
  }),
  TicketFieldsSchema.extend({
    slotReleasedAt: z.null(),
    status: TicketStatusSchema,
    reservation: LegacyReservationSchema,
  }),
]);
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
const RescheduleResponseSchema = z.object({
  ticket: TicketSchema,
  reprintRequired: z.boolean(),
});
const SlotViewSchema = z.object({
  startsAt: z.iso.datetime(),
  equipment: EquipmentSchema,
  experienceEndsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  bookable: z.boolean(),
  ticket: TicketSchema.nullable(),
});
const ReservationsResponseSchema = z.object({
  slots: z.array(SlotViewSchema),
  legacyTickets: z.array(TicketSchema),
  unconfiguredTickets: z.array(TicketSchema),
  releasedTickets: z.array(TicketSchema),
  printNeedsAttention: z.array(
    z.object({ ticket: TicketSchema, job: PrintJobSchema }),
  ),
});
const PublicTicketFieldsSchema = z.object({
  number: z.number().int().positive(),
  latestChange: LatestChangeSchema.nullable(),
  slotReleasedAt: z.iso.datetime().nullable(),
});
const PublicTicketSchema = z.union([
  PublicTicketFieldsSchema.extend({
    status: z.enum(['waiting', 'served', 'cancelled']),
    reservation: SlotReservationSchema,
  }),
  PublicTicketFieldsSchema.extend({
    slotReleasedAt: z.null(),
    status: TicketStatusSchema,
    reservation: LegacyReservationSchema,
  }),
]);
const LegacyAgentPayloadSchema = z
  .object({
    ticketNumber: z.number().int().positive(),
    partySize: z.number().int().min(1).max(20),
    publicToken: z.string().length(22),
    issuedAt: z.iso.datetime(),
  })
  .strict();
const SlotAgentPayloadSchema = z
  .object({
    kind: z.literal('slot'),
    ticketNumber: z.number().int().positive(),
    slotStartsAt: z.iso.datetime(),
    publicToken: z.string().length(22),
    issuedAt: z.iso.datetime(),
  })
  .strict();
const Version2AgentPayloadSchema = z
  .object({
    schemaVersion: z.literal(2),
    ticketNumber: z.number().int().positive(),
    reservation: z.union([
      z.object({ kind: z.literal('slot'), startsAt: z.iso.datetime() }).strict(),
      z.object({ kind: z.literal('legacy') }).strict(),
    ]),
    issuedAt: z.iso.datetime(),
    timeZone: z.string().min(1),
    publicURL: z.url(),
    copy: z
      .object({
        receiptTitle: z.string().min(1),
        arrivalGuidance: z.string().min(1),
      })
      .strict(),
  })
  .strict();
const AgentJobSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  status: z.literal('printing'),
  attempt: z.number().int().positive(),
  leaseToken: z.string(),
  payload: z.union([
    LegacyAgentPayloadSchema,
    SlotAgentPayloadSchema,
    Version2AgentPayloadSchema,
  ]),
});
const AgentJobResponseSchema = z.object({ job: AgentJobSchema });
const ReportResultSchema = z
  .object({
    leaseToken: z.string().min(1),
    outcome: z.enum(['printed', 'failed', 'unknown']),
    detail: z.string().max(500).optional(),
  })
  .strict();
const IssueBodySchema = z
  .object({
    slotStartsAt: SlotStartInputSchema,
    equipment: LegacyEquipmentInputSchema,
  })
  .strict();
const RescheduleBodySchema = z
  .object({
    slotStartsAt: SlotStartInputSchema,
    equipment: LegacyEquipmentInputSchema,
    comment: z
      .string()
      .describe(
        'Optional public message, trimmed and limited to 200 Unicode code points.',
      )
      .optional()
      .transform((value, context) => {
        const inputComment = value ?? '';
        const hasControlCharacter = [...inputComment].some((character) => {
          const codePoint = character.codePointAt(0);
          return (
            codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
          );
        });
        const comment = inputComment.trim();
        if (hasControlCharacter) {
          context.addIssue({
            code: 'custom',
            message:
              'Comment must be a single line without control characters.',
          });
        }
        if ([...comment].length > 200) {
          context.addIssue({
            code: 'custom',
            message: 'Comment must be at most 200 Unicode code points.',
          });
        }
        return comment === '' ? null : comment;
      }),
  })
  .strict();
const RestoreBodySchema = z.union([
  z.object({}).strict(),
  RescheduleBodySchema,
]);
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
const openApiInfo = { title: 'bunkasai-ticket API', version: '2.1.0' };

export type HttpDependencies = {
  unitOfWork: ScopedUnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
  adminToken?: string;
  agentToken?: string;
  eventEndAt: Date;
  numberScope: 'daily' | 'event';
  slotSchedule: readonly Slot[];
  checkReadiness: () => Promise<boolean>;
  requestContext: RequestContextStorage;
  authMode: 'legacy-single' | 'oidc/shared';
  authentication?: AuthenticationAdapter;
  authorization?: AuthorizationRepository;
  agentCredentials?: AgentCredentialAdministration;
  publicBaseURL?: string;
  staticRoot?: string;
};

function slotReservationResponse(reservation: SlotReservation) {
  const startsAt = new Date(reservation.slotStartsAt);
  return {
    kind: 'slot' as const,
    slotStartsAt: reservation.slotStartsAt,
    equipment: reservation.equipment,
    experienceEndsAt: new Date(startsAt.getTime() + 25 * 60_000).toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
  };
}

function reservationResponse(reservation: Ticket['reservation']) {
  return reservation.kind === 'legacy'
    ? reservation
    : slotReservationResponse(reservation);
}

function latestChangeResponse(latestChange: Ticket['latestChange']) {
  return latestChange === null
    ? null
    : {
        from: reservationResponse(latestChange.from),
        to: slotReservationResponse(latestChange.to),
        changedAt: latestChange.changedAt.toISOString(),
        comment: latestChange.comment,
      };
}

function ticketResponse(ticket: Ticket) {
  const fields = {
    id: ticket.id,
    counterKey: ticket.counterKey,
    number: ticket.number,
    cancelReason:
      ticket.state.status === 'cancelled' ? ticket.state.cancelReason : null,
    issuedAt: ticket.issuedAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    latestChange: latestChangeResponse(ticket.latestChange),
  };
  return 'partySize' in ticket
    ? {
        ...fields,
        status: ticket.state.status,
        reservation: ticket.reservation,
        slotReleasedAt: null,
      }
    : {
        ...fields,
        status: ticket.state.status,
        reservation: slotReservationResponse(ticket.reservation),
        slotReleasedAt: ticket.slotReleasedAt?.toISOString() ?? null,
      };
}

function isLegacyPublicTicket(
  ticket: PublicTicketView,
): ticket is Extract<PublicTicketView, { reservation: { kind: 'legacy' } }> {
  return ticket.reservation.kind === 'legacy';
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

function cookieValue(headers: Headers, name: string): string | undefined {
  const cookie = headers.get('Cookie') ?? '';
  for (const item of cookie.split(';')) {
    const separator = item.indexOf('=');
    if (separator === -1 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return undefined;
}

function equalToken(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  return match?.[1];
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

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (context) =>
        context.json(
          {
            error: {
              code: 'payload_too_large',
              message: 'Request body exceeds 16 KiB.',
            },
          },
          413,
        ),
    }),
  );

  if (dependencies.authMode === 'oidc/shared') {
    if (
      dependencies.authentication === undefined ||
      dependencies.authorization === undefined ||
      dependencies.publicBaseURL === undefined
    ) {
      throw new Error('Shared authentication dependencies are required.');
    }
    app.on(['GET', 'POST'], '/api/auth/*', (context) =>
      dependencies.authentication!.handle(context.req.raw),
    );
    app.get('/api/v3/csrf', async (context) => {
      const principal = await dependencies.authentication!.resolveSession(
        context.req.raw.headers,
      );
      if (principal === null) {
        return context.json(
          { error: { code: 'unauthorized', message: 'Authentication is required.' } },
          401,
        );
      }
      const token = randomBytes(32).toString('base64url');
      return context.json(
        { token },
        200,
        {
          'Cache-Control': 'no-store',
          'Set-Cookie': `__Host-queuepilot-csrf=${token}; Path=/; Max-Age=900; Secure; SameSite=Lax`,
        },
      );
    });
    app.use('/api/v3/t/:tenantSlug/e/:eventSlug/*', async (context, next) => {
      const principal = await dependencies.authentication!.resolveSession(
        context.req.raw.headers,
      );
      if (principal === null) {
        return context.json(
          { error: { code: 'unauthorized', message: 'Authentication is required.' } },
          401,
        );
      }
      const scope = await dependencies.authorization!.resolveMemberScope(
        principal,
        context.req.param('tenantSlug'),
        context.req.param('eventSlug'),
      );
      if (scope === null) {
        return context.json(
          { error: { code: 'not_found', message: 'The requested resource was not found.' } },
          404,
        );
      }
      return dependencies.requestContext.run(scope, next);
    });
    app.use('/api/v3/t/:tenantSlug/e/:eventSlug/*', async (context, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) return next();
      const csrfCookie = cookieValue(context.req.raw.headers, '__Host-queuepilot-csrf');
      if (
        context.req.header('Origin') !== dependencies.publicBaseURL ||
        !equalToken(csrfCookie, context.req.header('X-CSRF-Token'))
      ) {
        return context.json(
          { error: { code: 'csrf_failed', message: 'Origin or CSRF validation failed.' } },
          403,
        );
      }
      return next();
    });
    app.use('/api/v3/agent/*', async (context, next) => {
      const token = bearerToken(context.req.header('Authorization'));
      const scope =
        token === undefined
          ? null
          : await dependencies.authorization!.resolveAgentScope(token);
      if (scope === null) {
        return context.json(
          { error: { code: 'unauthorized', message: 'Agent authentication is required.' } },
          401,
          { 'WWW-Authenticate': 'Bearer' },
        );
      }
      return dependencies.requestContext.run(scope, next);
    });
  }

  app.use(
    '/api/*',
    async (_context, next) => {
      if (dependencies.authMode !== 'legacy-single') return next();
      const legacyContext: AuthenticatedRequestContext = {
        kind: 'legacy',
        tenantId: DEFAULT_TENANT_ID,
        eventId: DEFAULT_EVENT_ID,
      };
      return dependencies.requestContext.run(legacyContext, next);
    },
  );

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

  if (dependencies.authMode === 'legacy-single') {
    if (
      dependencies.adminToken === undefined ||
      dependencies.agentToken === undefined
    ) {
      throw new Error('Legacy-single authentication requires both tokens.');
    }
    app.use('/api/admin/*', bearerAuth(dependencies.adminToken));
    app.use('/api/agent/*', bearerAuth(dependencies.agentToken));
  } else {
    const legacyRoutesDisabled: MiddlewareHandler = async (context) =>
      context.json(
        {
          error: {
            code: 'not_found',
            message: 'The requested resource was not found.',
          },
        },
        404,
      );
    app.use('/api/admin/*', legacyRoutesDisabled);
    app.use('/api/agent/*', legacyRoutesDisabled);
  }

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
      const value = result.value;
      return context.json(
        isLegacyPublicTicket(value)
          ? {
              number: value.number,
              status: value.status,
              reservation: value.reservation,
              slotReleasedAt: null,
              latestChange: latestChangeResponse(value.latestChange),
            }
          : {
              number: value.number,
              status: value.status,
              reservation: slotReservationResponse(value.reservation),
              slotReleasedAt: value.slotReleasedAt?.toISOString() ?? null,
              latestChange: latestChangeResponse(value.latestChange),
            },
        200,
      );
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
          required: true,
          content: { 'application/json': { schema: IssueBodySchema } },
        },
      },
      responses: {
        200: successJson(TicketResponseSchema, 'Idempotent replay'),
        201: successJson(TicketResponseSchema, 'Ticket issued'),
        400: failure400,
        401: failure401,
        409: failure409,
        422: failure422,
        500: failure500,
      },
    }),
    async (context) => {
      const { 'idempotency-key': idempotencyKey } = context.req.valid('header');
      const { slotStartsAt, equipment } = context.req.valid('json');
      const reservation: SlotReservation = {
        kind: 'slot',
        slotStartsAt,
        equipment,
      };
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ slotStartsAt, equipment }))
        .digest('hex');
      const result = await issueTicket(
        { idempotencyKey, requestHash, reservation },
        dependencies,
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
        if (result.error.kind === 'SlotNotConfigured') {
          return context.json(
            {
              error: {
                code: 'slot_not_configured',
                message: 'The requested slot is not configured.',
              },
            },
            400,
          );
        }
        if (
          result.error.kind === 'SlotUnavailable' ||
          result.error.kind === 'SlotNotBookable'
        ) {
          return context.json(
            {
              error: {
                code: 'slot_unavailable',
                message: 'The requested slot is no longer available.',
              },
            },
            409,
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
      path: '/api/admin/reservations',
      operationId: 'getAdminReservations',
      tags: ['admin tickets'],
      security: adminSecurity,
      responses: {
        200: successJson(
          ReservationsResponseSchema,
          'Configured reservation slots',
        ),
        401: failure401,
        500: failure500,
      },
    }),
    async (context) => {
      const result = await getReservations(
        dependencies.slotSchedule,
        dependencies,
      );
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
          slots: result.value.slots.map((slot) => ({
            startsAt: slot.slotStartsAt,
            equipment: slot.equipment,
            experienceEndsAt: slot.experienceEndsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            bookable: slot.bookable,
            ticket: slot.ticket === null ? null : ticketResponse(slot.ticket),
          })),
          legacyTickets: result.value.legacyTickets.map(ticketResponse),
          unconfiguredTickets:
            result.value.unconfiguredTickets.map(ticketResponse),
          releasedTickets: result.value.releasedTickets.map(ticketResponse),
          printNeedsAttention: result.value.printNeedsAttention.map(
            ({ ticket, job }) => ({
              ticket: ticketResponse(ticket),
              job: printJobResponse(job),
            }),
          ),
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

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/admin/tickets/{id}/release',
      operationId: 'releaseTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: {
        params: IdParamsSchema,
        body: {
          required: true,
          content: { 'application/json': { schema: z.object({}).strict() } },
        },
      },
      responses: {
        200: successJson(TicketResponseSchema, 'Reservation slot released'),
        400: failure400,
        401: failure401,
        404: failure404,
        409: failure409,
        500: failure500,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const result = await releaseTicket(id, dependencies);
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
        const printing = result.error.kind === 'PrintJobNotReprintable';
        const unavailable = result.error.kind === 'SlotUnavailable';
        return context.json(
          {
            error: {
              code: printing
                ? 'print_job_not_reprintable'
                : unavailable
                  ? 'slot_unavailable'
                  : 'invalid_transition',
              message: printing
                ? 'The ticket has a queued or printing job.'
                : unavailable
                  ? 'The requested slot is no longer available.'
                  : 'The ticket cannot be released.',
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
      path: '/api/admin/tickets/{id}/reschedule',
      operationId: 'rescheduleTicket',
      tags: ['admin tickets'],
      security: adminSecurity,
      request: {
        params: IdParamsSchema,
        body: {
          content: { 'application/json': { schema: RescheduleBodySchema } },
        },
      },
      responses: {
        200: successJson(RescheduleResponseSchema, 'Reservation changed'),
        400: failure400,
        401: failure401,
        404: failure404,
        409: failure409,
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const { slotStartsAt, equipment, comment } = context.req.valid('json');
      const result = await rescheduleTicket(
        id,
        {
          reservation: { kind: 'slot', slotStartsAt, equipment },
          comment,
        },
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
        if (result.error.kind === 'SlotNotConfigured') {
          return context.json(
            {
              error: {
                code: 'slot_not_configured',
                message: 'The requested slot is not configured.',
              },
            },
            400,
          );
        }
        const unavailable =
          result.error.kind === 'SlotUnavailable' ||
          result.error.kind === 'SlotNotBookable';
        const printing = result.error.kind === 'PrintJobNotReprintable';
        return context.json(
          {
            error: {
              code: unavailable
                ? 'slot_unavailable'
                : printing
                  ? 'print_job_not_reprintable'
                  : 'invalid_transition',
              message: unavailable
                ? 'The requested slot is no longer available.'
                : printing
                  ? 'The ticket has a queued or printing job.'
                  : 'The ticket cannot be moved.',
            },
          },
          409,
        );
      }
      return context.json(
        {
          ticket: ticketResponse(result.value.ticket),
          reprintRequired: result.value.reprintRequired,
        },
        200,
      );
    },
  );

  const restorationRoutes = [
    {
      path: '/api/admin/tickets/{id}/restore',
      operationId: 'restoreTicket',
      action: restoreTicket,
    },
    {
      path: '/api/admin/tickets/{id}/undo-guidance',
      operationId: 'undoGuidanceTicket',
      action: undoGuidanceTicket,
    },
  ] as const;
  for (const route of restorationRoutes) {
    app.openapi(
      createRoute({
        method: 'post',
        path: route.path,
        operationId: route.operationId,
        tags: ['admin tickets'],
        security: adminSecurity,
        request: {
          params: IdParamsSchema,
          body: {
            required: true,
            content: { 'application/json': { schema: RestoreBodySchema } },
          },
        },
        responses: {
          200: successJson(RescheduleResponseSchema, 'Ticket restored'),
          400: failure400,
          401: failure401,
          404: failure404,
          409: failure409,
          500: failure500,
        },
      }),
      async (context) => {
        const { id } = context.req.valid('param');
        const body = context.req.valid('json');
        const input =
          'slotStartsAt' in body
            ? {
                reservation: {
                  kind: 'slot' as const,
                  slotStartsAt: body.slotStartsAt,
                  equipment: body.equipment,
                },
                comment: body.comment,
              }
            : {};
        const result = await route.action(id, input, dependencies);
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
          if (result.error.kind === 'SlotNotConfigured') {
            return context.json(
              {
                error: {
                  code: 'slot_not_configured',
                  message: 'The requested slot is not configured.',
                },
              },
              400,
            );
          }
          const unavailable = result.error.kind === 'SlotUnavailable';
          const printing = result.error.kind === 'PrintJobNotReprintable';
          return context.json(
            {
              error: {
                code: unavailable
                  ? 'slot_unavailable'
                  : printing
                    ? 'print_job_not_reprintable'
                    : 'invalid_transition',
                message: unavailable
                  ? 'The requested slot is no longer available.'
                  : printing
                    ? 'The ticket has a queued or printing job.'
                    : 'The ticket cannot be restored.',
              },
            },
            409,
          );
        }
        return context.json(
          {
            ticket: ticketResponse(result.value.ticket),
            reprintRequired: result.value.reprintRequired,
          },
          200,
        );
      },
    );
  }

  const stateRoutes = [
    {
      path: '/api/admin/tickets/{id}/serve',
      operationId: 'serveTicket',
      action: serveTicket,
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
        const invalidTransition = result.error.kind === 'InvalidTransition';
        return context.json(
          {
            error: {
              code: invalidTransition
                ? 'invalid_transition'
                : 'print_job_not_reprintable',
              message: invalidTransition
                ? 'The released ticket must be restored before printing.'
                : 'The latest print job is still queued or printing.',
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
            payload:
              'schemaVersion' in payload
                ? {
                    ...payload,
                    issuedAt: payload.issuedAt.toISOString(),
                  }
                : 'kind' in payload && payload.kind === 'slot'
                  ? {
                      kind: 'slot',
                      ticketNumber: payload.ticketNumber,
                      slotStartsAt: payload.slotStartsAt,
                      publicToken: payload.publicToken,
                      issuedAt: payload.issuedAt.toISOString(),
                    }
                  : {
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

  app.onError((error, context) => {
    const cause = error.cause;
    if (cause instanceof Error) {
      const code = 'code' in cause ? cause.code : undefined;
      console.error({
        name: cause.name,
        ...(typeof code === 'string' ? { code } : {}),
        message: cause.message,
      });
    } else {
      console.error({ name: error.name, message: error.message });
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
  });
  app.notFound((context) =>
    context.json(
      { error: { code: 'not_found', message: 'Resource was not found.' } },
      404,
    ),
  );
  return app;
}
