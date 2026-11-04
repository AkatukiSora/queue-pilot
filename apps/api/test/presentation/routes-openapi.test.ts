import { describe, expect, it } from 'vitest';
import type {
  AuthenticatedRequestContext,
  Principal,
} from '../../src/application/security-ports.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
} from '../../src/domain/tenant-manifest.ts';
import { equipmentValues, type PublicToken } from '../../src/domain/ticket.ts';
import { createRequestContextStorage } from '../../src/infrastructure/request-context.ts';
import type { HttpDependencies } from '../../src/presentation/http/routes.ts';
import { createHttpApp } from '../../src/presentation/http/routes.ts';

type OpenApiSchema = {
  anyOf?: OpenApiSchema[];
  enum?: string[];
  format?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  type?: string | string[];
};

type OpenApiOperation = {
  requestBody?: {
    content?: Record<string, { schema: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { schema: OpenApiSchema }>;
    }
  >;
};

type OpenApiDocument = {
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

const dependencies: HttpDependencies = {
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
  adminToken: 'admin-token',
  agentToken: 'agent-token',
  eventEndAt: new Date('2026-11-04T00:00:00.000Z'),
  numberScope: 'daily',
  slotSchedule: [],
  checkReadiness: async () => true,
  requestContext: createRequestContextStorage(),
  authMode: 'legacy-single',
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
  userId: sharedPrincipal.userId,
  role: 'admin',
};

function sharedHttpDependencies(): HttpDependencies {
  return {
    ...dependencies,
    authMode: 'oidc/shared',
    publicBaseURL: 'http://localhost/',
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
    requestContext: createRequestContextStorage(),
  };
}

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

  it('passes negotiated payload versions to the authenticated print agent', async () => {
    const testDependencies = sharedHttpDependencies();
    let resolvedVersions: readonly number[] | undefined;
    testDependencies.authorization = {
      ...testDependencies.authorization!,
      resolveAgentScope: async (_token, versions) => {
        resolvedVersions = versions;
        if (versions === undefined) {
          throw new Error('Claim requests must negotiate payload versions.');
        }
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
      'X-QueuePilot-Accepted-Payload-Versions': '2,1',
    };
    const accepted = await app.request(claimPath, {
      method: 'POST',
      headers,
    });

    expect(resolvedVersions).toEqual([2, 1]);
    expect(accepted.status).toBe(500);

    resolvedVersions = undefined;
    const duplicateVersions = await app.request(claimPath, {
      method: 'POST',
      headers: {
        Authorization: headers.Authorization,
        'X-QueuePilot-Accepted-Payload-Versions': '2,2',
      },
    });
    expect(duplicateVersions.status).toBe(400);
    expect(resolvedVersions).toBeUndefined();
  });
});
