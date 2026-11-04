import { describe, expect, it } from 'vitest';
import type { PublicToken } from '../../src/domain/ticket.ts';
import type { HttpDependencies } from '../../src/presentation/http/routes.ts';
import { createHttpApp } from '../../src/presentation/http/routes.ts';

type OpenApiSchema = {
  anyOf?: OpenApiSchema[];
  enum?: string[];
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  type?: string | string[];
};

type OpenApiDocument = {
  paths: Record<
    string,
    {
      get?: {
        responses?: Record<
          string,
          {
            content?: Record<string, { schema: OpenApiSchema }>;
          }
        >;
      };
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
};

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
});
