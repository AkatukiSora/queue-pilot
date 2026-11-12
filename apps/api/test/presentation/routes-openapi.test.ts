import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Repositories } from '../../src/application/ports.ts';
import type {
  AuthenticatedRequestContext,
  Principal,
} from '../../src/application/security-ports.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
  type ManifestEvent,
} from '../../src/domain/tenant-manifest.ts';
import { equipmentValues, type PublicToken } from '../../src/domain/ticket.ts';
import { createRequestContextStorage } from '../../src/infrastructure/request-context.ts';
import type { HttpDependencies } from '../../src/presentation/http/routes.ts';
import { createHttpApp } from '../../src/presentation/http/routes.ts';

type OpenApiSchema = {
  anyOf?: OpenApiSchema[];
  const?: string | number;
  enum?: Array<string | number>;
  format?: string;
  items?: OpenApiSchema;
  maxItems?: number;
  minItems?: number;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string | string[];
};

type OpenApiOperation = {
  parameters?: Array<{ in: string; name: string }>;
  requestBody?: {
    content?: Record<string, { schema: OpenApiSchema }>;
    required?: boolean;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { schema: OpenApiSchema }>;
    }
  >;
  security?: Array<Record<string, string[]>>;
};

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    securitySchemes?: Record<
      string,
      { in?: string; name?: string; type: string }
    >;
  };
  paths: Record<
    string,
    {
      get?: OpenApiOperation;
      post?: OpenApiOperation;
    }
  >;
};

function legacyTicketVariant(schema: OpenApiSchema) {
  return schema.anyOf?.find((variant) =>
    variant.properties?.reservation?.properties?.kind?.enum?.includes('legacy'),
  );
}

function slotTicketVariant(schema: OpenApiSchema) {
  return schema.anyOf?.find((variant) =>
    variant.properties?.reservation?.properties?.kind?.enum?.includes('slot'),
  );
}

const sharedEvent = {
  id: DEFAULT_EVENT_ID,
  slug: 'default',
  title: 'Default event',
  timeZone: 'Asia/Tokyo',
  startsAt: '2026-11-03T00:00:00Z',
  endsAt: '2026-11-04T05:00:00Z',
  numberScope: 'daily',
  equipment: [
    { id: 'quest-3', label: 'Quest 3' },
    { id: 'quest-3s', label: 'Quest 3S' },
    { id: 'steam-frame', label: 'Steam Frame' },
    { id: 'beyond2', label: 'Beyond2' },
  ],
  schedule: [
    {
      date: '2026-11-03',
      firstStart: '10:00',
      lastStart: '14:30',
      intervalMinutes: 30,
      experienceMinutes: 25,
      turnoverMinutes: 5,
    },
  ],
  copy: { receiptTitle: 'Ticket', arrivalGuidance: 'Please arrive.' },
  defaultPrinterId: 'legacy-printer',
  printers: [{ id: 'legacy-printer', label: 'Legacy printer' }],
} as ManifestEvent;

const dependencyBase = {
  unitOfWork: {
    async run() {
      throw new Error('Contract test does not call application handlers.');
    },
  },
  clock: { now: () => new Date('2026-11-03T00:00:00.000Z') },
  tokens: {
    ticketId: () => '00000000-0000-4000-8000-000000000001',
    printJobId: () => '00000000-0000-4000-8000-000000000002',
    publicToken: () => 'a'.repeat(22) as PublicToken,
    leaseToken: () => 'lease-token',
  },
  checkReadiness: async () => true,
  requestContext: createRequestContextStorage(),
};

const dependencies: HttpDependencies = {
  ...dependencyBase,
  adminToken: 'admin-token',
  agentToken: 'agent-token',
  authMode: 'legacy-single',
  legacyEventSettings: {
    eventEndAt: new Date('2026-11-04T00:00:00.000Z'),
    numberScope: 'daily',
    slotSchedule: [],
  },
};

const sharedPrincipal: Principal = {
  userId: '00000000-0000-4000-8000-000000000101',
  issuer: 'https://idp.example.test',
  subject: 'user-101',
  sessionId: 'session-101',
};
const sharedScope: AuthenticatedRequestContext = {
  kind: 'member',
  tenantId: DEFAULT_TENANT_ID,
  eventId: DEFAULT_EVENT_ID,
  event: sharedEvent,
  userId: sharedPrincipal.userId,
  role: 'admin',
};

function sharedHttpDependencies(
  publicBaseURL = 'http://localhost/',
): HttpDependencies {
  return {
    ...dependencyBase,
    authMode: 'oidc/shared',
    publicBaseURL,
    authentication: {
      handle: async () => new Response(null, { status: 404 }),
      resolveSession: async (headers) =>
        headers.get('Cookie')?.includes('session=valid')
          ? sharedPrincipal
          : null,
      revokeMemberSessions: async () => {},
    },
    authorization: {
      resolveMemberScope: async () => sharedScope,
      resolveAgentScope: async () => null,
      findPublicTicket: async () => null,
      listTenantEvents: async () => [],
    },
    agentCredentials: {
      list: async () => [],
      create: async (_scope, _printerId, expiresAt) => ({
        id: 'agent-101',
        token: 'agent-token',
        expiresAt,
      }),
      revoke: async () => false,
      rotate: async () => null,
    },
    requestContext: createRequestContextStorage(),
  };
}

describe('generated shared/legacy OpenAPI contract', () => {
  it('retains security schemes and overlapping public-ticket responses', async () => {
    const document = JSON.parse(
      await readFile(
        new URL('../../../web/src/api/openapi.json', import.meta.url),
        'utf8',
      ),
    ) as OpenApiDocument;
    const securitySchemes = document.components?.securitySchemes ?? {};
    const csrfSchema =
      document.paths['/api/v3/csrf']?.get?.responses?.['200']?.content?.[
        'application/json'
      ]?.schema;
    const eventItemSchema =
      document.paths['/api/v3/events']?.get?.responses?.['200']?.content?.[
        'application/json'
      ]?.schema.properties?.events?.items;
    const publicTicketSchema =
      document.paths['/api/public/tickets/{token}']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema;
    const legacyReservationsSchema =
      document.paths['/api/admin/reservations']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema;
    const reservationsSchema =
      document.paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations']?.get
        ?.responses?.['200']?.content?.['application/json']?.schema;

    expect(Object.keys(document.paths)).toHaveLength(33);
    expect(
      Object.keys(document.paths).filter((path) => path.startsWith('/api/v3/')),
    ).toHaveLength(17);
    expect(document.paths['/api/healthz']?.get).toBeDefined();
    expect(document.paths['/api/admin/tickets']?.post).toBeDefined();
    expect(csrfSchema?.properties?.token?.type).toBe('string');
    expect(csrfSchema?.required).toContain('token');
    expect(eventItemSchema?.properties?.timeZone?.type).toBe('string');
    expect(eventItemSchema?.required).toContain('timeZone');
    expect(legacyReservationsSchema?.properties?.timeZone).toBeUndefined();
    expect(reservationsSchema?.properties?.timeZone?.type).toBe('string');
    expect(reservationsSchema?.required).toContain('timeZone');
    expect(
      publicTicketSchema?.anyOf?.every(
        (variant) =>
          variant.properties?.timeZone?.type === 'string' &&
          variant.required?.includes('timeZone'),
      ),
    ).toBe(true);
    expect(securitySchemes.LegacyBearerAuth?.type).toBe('http');
    expect(securitySchemes.SessionCookie?.type).toBe('apiKey');
    expect(securitySchemes.SessionCookie?.name).toBe(
      '__Secure-better-auth.session_token',
    );
    expect(document.paths['/api/v3/events']?.get?.security).toEqual([
      { SessionCookie: [] },
    ]);
    expect(document.paths['/api/v3/csrf']?.get?.security).toEqual([
      { SessionCookie: [] },
    ]);
    const eventPath = '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents';
    expect(document.paths[eventPath]?.get?.security).toEqual([
      { SessionCookie: [] },
    ]);
    expect(document.paths[eventPath]?.post?.security).toEqual([
      { SessionCookie: [] },
    ]);
    expect(document.paths[`${eventPath}/{id}/rotate`]?.post).toBeDefined();
    expect(document.paths[`${eventPath}/{id}/revoke`]?.post).toBeDefined();
    const claim = document.paths['/api/v3/agent/print-jobs/claim']?.post;
    const claimBody = claim?.requestBody?.content?.['application/json']?.schema;
    const acceptedVersions = claimBody?.properties?.acceptedPayloadVersions;
    expect(claimBody?.required).toContain('acceptedPayloadVersions');
    expect(
      acceptedVersions?.items?.anyOf?.flatMap(
        ({ enum: values }) => values ?? [],
      ),
    ).toEqual([1, 2]);
    expect(claim?.responses?.['200']).toBeDefined();
    const reportResult =
      document.paths['/api/v3/agent/print-jobs/{id}/result']?.post;
    expect(reportResult).toBeDefined();
    const reportBody =
      reportResult?.requestBody?.content?.['application/json']?.schema;
    expect(reportBody?.properties?.outputKind?.enum).toEqual([
      'physical',
      'preview',
    ]);
    const reportJob =
      reportResult?.responses?.['200']?.content?.['application/json']?.schema
        .properties?.job;
    expect(reportJob?.required).toContain('outputKind');
    expect(reportJob?.properties?.outputKind).toEqual({
      type: ['string', 'null'],
      enum: ['physical', 'preview', null],
    });
    expect(
      document.paths['/api/public/tickets/{token}']?.get?.responses?.['410'],
    ).toBeDefined();

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of [
        ['get', pathItem.get],
        ['post', pathItem.post],
      ] as const) {
        for (const requirement of operation?.security ?? []) {
          for (const name of Object.keys(requirement)) {
            expect(
              securitySchemes[name],
              `${method.toUpperCase()} ${path} references ${name}`,
            ).toBeDefined();
          }
        }
      }
    }
  });
});

describe('ticket OpenAPI contract', () => {
  it('limits released timestamps to slot tickets and null for legacy tickets', async () => {
    const app = createHttpApp(dependencies);
    const response = await app.request('/api/openapi.json');
    expect(response.status).toBe(200);
    const document = (await response.json()) as OpenApiDocument;
    const publicTicketSchema =
      document.paths['/api/public/tickets/{token}']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema;
    const adminDetailSchema =
      document.paths['/api/admin/tickets/{id}']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema;
    const adminPrintJob = adminDetailSchema?.properties?.printJobs?.items;
    expect(adminPrintJob?.properties?.outputKind).toEqual({
      type: ['string', 'null'],
      enum: ['physical', 'preview', null],
    });
    const schemas = [publicTicketSchema, adminDetailSchema?.properties?.ticket];

    for (const schema of schemas) {
      if (schema === undefined) {
        throw new Error('Expected public and admin ticket schemas in OpenAPI.');
      }
      const legacy = legacyTicketVariant(schema);
      const slot = slotTicketVariant(schema);
      expect(legacy?.properties?.slotReleasedAt).toEqual({ type: 'null' });
      expect(slot?.properties?.slotReleasedAt).toEqual({
        type: ['string', 'null'],
        format: 'date-time',
      });
    }
  });

  it('keeps legacy equipment enums and exposes configured strings in shared mode', async () => {
    const legacyResponse =
      await createHttpApp(dependencies).request('/api/openapi.json');
    const legacyDocument = (await legacyResponse.json()) as OpenApiDocument;
    const legacyIssueEquipment =
      legacyDocument.paths['/api/admin/tickets']?.post?.requestBody?.content?.[
        'application/json'
      ]?.schema.properties?.equipment;
    const legacySlotEquipment =
      legacyDocument.paths['/api/admin/reservations']?.get?.responses?.['200']
        ?.content?.['application/json']?.schema.properties?.slots?.items
        ?.properties?.equipment;

    expect(legacyIssueEquipment?.enum).toEqual([...equipmentValues]);
    expect(legacySlotEquipment?.enum).toEqual([...equipmentValues]);

    const sharedResponse = await createHttpApp(
      sharedHttpDependencies(),
    ).request('/api/openapi.json');
    const sharedDocument = (await sharedResponse.json()) as OpenApiDocument;
    const sharedIssueEquipment =
      sharedDocument.paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets']?.post
        ?.requestBody?.content?.['application/json']?.schema.properties
        ?.equipment;
    const sharedSlotEquipment =
      sharedDocument.paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations']
        ?.get?.responses?.['200']?.content?.['application/json']?.schema
        .properties?.slots?.items?.properties?.equipment;

    expect(sharedIssueEquipment?.type).toBe('string');
    expect(sharedIssueEquipment?.enum).toBeUndefined();
    expect(sharedSlotEquipment?.type).toBe('string');
    expect(sharedSlotEquipment?.enum).toBeUndefined();
  });
});

describe('shared authentication routing', () => {
  it('publishes and protects only tenant/event-scoped administration routes', async () => {
    const app = createHttpApp(sharedHttpDependencies());
    const openApi = await app.request('/api/openapi.json');
    const document = (await openApi.json()) as OpenApiDocument;

    expect(
      document.paths['/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets'],
    ).toBeDefined();
    expect(document.paths['/api/admin/tickets']).toBeUndefined();

    const unauthenticated = await app.request(
      '/api/v3/t/acme/e/autumn-festival/tickets',
      { headers: { Cookie: '' } },
    );
    expect(unauthenticated.status).toBe(401);
  });

  it('matches SessionCookie name to the configured public URL scheme', async () => {
    for (const [publicBaseURL, cookieName] of [
      ['http://localhost/', 'better-auth.session_token'],
      [
        'https://queue-pilot.example.test/',
        '__Secure-better-auth.session_token',
      ],
    ] as const) {
      const response = await createHttpApp(
        sharedHttpDependencies(publicBaseURL),
      ).request('/api/openapi.json');
      const document = (await response.json()) as OpenApiDocument;

      expect(response.status).toBe(200);
      expect(document.components?.securitySchemes?.SessionCookie).toEqual({
        type: 'apiKey',
        in: 'cookie',
        name: cookieName,
      });
    }
  });

  it('publishes the complete shared authentication and print-agent contract', async () => {
    const app = createHttpApp(sharedHttpDependencies());
    const response = await app.request('/api/openapi.json');
    const document = (await response.json()) as OpenApiDocument;
    const paths = document.paths;
    const eventPath = '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents';
    const claim = paths['/api/v3/agent/print-jobs/claim']?.post;
    const claimBody = claim?.requestBody?.content?.['application/json']?.schema;
    const acceptedVersions = claimBody?.properties?.acceptedPayloadVersions;
    const payload =
      claim?.responses?.['200']?.content?.['application/json']?.schema
        .properties?.job?.properties?.payload;
    const version2Payload = payload?.anyOf?.find((variant) =>
      variant.properties?.schemaVersion?.enum?.includes(2),
    );

    expect(response.status).toBe(200);
    expect(paths['/api/v3/events']?.get?.security).toEqual([
      { SessionCookie: [] },
    ]);
    expect(paths['/api/v3/csrf']?.get?.security).toEqual([
      { SessionCookie: [] },
    ]);
    expect(paths[eventPath]?.get?.security).toEqual([{ SessionCookie: [] }]);
    expect(paths[eventPath]?.post?.security).toEqual([{ SessionCookie: [] }]);
    expect(paths[`${eventPath}/{id}/rotate`]?.post).toBeDefined();
    expect(paths[`${eventPath}/{id}/revoke`]?.post).toBeDefined();
    expect(paths['/api/v3/agent/print-jobs/{id}/result']?.post).toBeDefined();
    expect(paths['/api/admin/agents']).toBeUndefined();
    expect(claimBody?.required).toContain('acceptedPayloadVersions');
    expect(acceptedVersions?.type).toBe('array');
    expect(
      acceptedVersions?.items?.anyOf?.flatMap(
        ({ enum: values }) => values ?? [],
      ),
    ).toEqual([1, 2]);
    expect(
      claim?.parameters?.some(({ name }) => name.includes('Payload-Versions')),
    ).toBeFalsy();
    expect(version2Payload?.properties?.schemaVersion?.enum).toEqual([2]);
    expect(version2Payload?.properties?.timeZone?.type).toBe('string');
    expect(version2Payload?.properties?.publicURL?.format).toBe('uri');
    expect(document.components?.securitySchemes?.SessionCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'better-auth.session_token',
    });
  });

  it('reads negotiated payload versions from the claim JSON body', async () => {
    const testDependencies = sharedHttpDependencies();
    let middlewareVersions: readonly number[] | undefined;
    let claimedVersions: readonly number[] | undefined;
    testDependencies.unitOfWork = {
      async run(operation) {
        const repositories = {
          tickets: {},
          printJobs: {
            queuedPayloadVersionAvailability: async (
              versions: readonly number[],
            ) => {
              claimedVersions = versions;
              return { accepted: true, unsupported: false };
            },
            expireLeasesBefore: async () => {},
            claimNextQueuedJob: async (
              _now: Date,
              _leaseExpiresAt: Date,
              _leaseToken: string,
              versions: readonly number[],
            ) => {
              claimedVersions = versions;
              return null;
            },
          },
        } as unknown as Repositories;
        return operation(repositories);
      },
    };
    const authorization = testDependencies.authorization;
    if (authorization === undefined) {
      throw new Error('Shared authorization test dependency is missing.');
    }
    testDependencies.authorization = {
      ...authorization,
      resolveAgentScope: async (_token, versions) => {
        middlewareVersions = versions;
        return {
          kind: 'agent',
          tenantId: DEFAULT_TENANT_ID,
          eventId: DEFAULT_EVENT_ID,
          agentId: 'agent-101',
          acceptedPayloadVersions: versions,
        };
      },
    };
    const app = createHttpApp(testDependencies);
    const claimPath = '/api/v3/agent/print-jobs/claim';
    const headers = {
      Authorization: `Bearer ${'a'.repeat(43)}`,
    };
    const accepted = await app.request(claimPath, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedPayloadVersions: [2, 1] }),
    });

    expect(middlewareVersions).toBeUndefined();
    expect(claimedVersions).toEqual([2, 1]);
    expect(accepted.status).toBe(204);

    claimedVersions = undefined;
    const duplicateVersions = await app.request(claimPath, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedPayloadVersions: [2, 2] }),
    });
    expect(duplicateVersions.status).toBe(400);
    expect(claimedVersions).toBeUndefined();
  });
});
