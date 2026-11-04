import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { createApp } from '../apps/api/src/app.ts';
import type { UnitOfWork } from '../apps/api/src/application/ports.ts';
import {
  type PublicToken,
  parseSlotSchedule,
} from '../apps/api/src/domain/ticket.ts';

const unitOfWork: UnitOfWork = {
  async run() {
    throw new Error(
      'OpenAPI generation must not execute application requests.',
    );
  },
};
const parsedSchedule = parseSlotSchedule(
  '[{"date":"2026-11-03","firstStart":"10:00","lastStart":"14:30"},{"date":"2026-11-04","firstStart":"10:00","lastStart":"13:30"}]',
);
if (!parsedSchedule.ok) throw new Error('OpenAPI slot schedule is invalid.');
const appDependencies = {
  unitOfWork,
  clock: { now: () => new Date(0) },
  tokens: {
    ticketId: () => '00000000-0000-4000-8000-000000000001',
    printJobId: () => '00000000-0000-4000-8000-000000000002',
    publicToken: () => 'AAAAAAAAAAAAAAAAAAAAAA' as PublicToken,
    leaseToken: () => '00000000-0000-4000-8000-000000000003',
  },
  checkReadiness: async () => true,
  authentication: {
    handle: async () => new Response(null, { status: 404 }),
    resolveSession: async () => null,
    revokeMemberSessions: async () => {},
  },
  authorization: {
    resolveMemberScope: async () => null,
    resolveAgentScope: async () => null,
    findPublicTicket: async () => null,
    listTenantEvents: async () => [],
  },
  agentCredentials: {
    list: async () => [],
    create: async (_scope, _printerId, expiresAt) => ({
      id: 'openapi-agent',
      token: 'openapi-agent-token',
      expiresAt,
    }),
    revoke: async () => false,
    rotate: async () => null,
  },
};
const sharedApp = createApp({
  config: {
    databaseUrl: 'postgres://openapi@127.0.0.1:5432/openapi',
    authMode: 'oidc/shared',
    sharedAuth: {
      baseURL: 'http://localhost/',
      secret: 'openapi-generation-secret-000000000000',
      provider: {
        kind: 'github',
        clientId: 'openapi-generation-client',
        clientSecret: 'openapi-generation-client-secret',
      },
    },
    eventEndAt: new Date('2026-11-04T05:00:00.000Z'),
    numberScope: 'daily',
    slotSchedule: parsedSchedule.value,
  },
  ...appDependencies,
});
const legacyApp = createApp({
  config: {
    databaseUrl: 'postgres://openapi@127.0.0.1:5432/openapi',
    authMode: 'legacy-single',
    adminToken: 'openapi-generation-admin-token-000000000000',
    agentToken: 'openapi-generation-agent-token-000000000000',
    eventEndAt: new Date('2026-11-04T05:00:00.000Z'),
    numberScope: 'daily',
    slotSchedule: parsedSchedule.value,
  },
  ...appDependencies,
});
const documentOptions = {
  openapi: '3.1.0' as const,
  info: { title: 'bunkasai-ticket API', version: '2.1.0' },
};
const sharedDocument = sharedApp.getOpenAPI31Document(documentOptions);
const legacyDocument = legacyApp.getOpenAPI31Document(documentOptions);

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function prefixComponentNames<T>(document: T, prefix: string): T {
  const source = document as {
    components?: Record<string, Record<string, unknown>>;
    paths: unknown;
  };
  const componentNames = new Map<string, string>();
  const securityNames = new Map<string, string>();
  for (const [category, entries] of Object.entries(source.components ?? {})) {
    for (const name of Object.keys(entries)) {
      componentNames.set(
        `#/components/${category}/${name}`,
        `#/components/${category}/${prefix}${name}`,
      );
      if (category === 'securitySchemes') {
        securityNames.set(name, `${prefix}${name}`);
      }
    }
  }
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (key === 'operationId' && typeof nested === 'string') {
          return [key, `${prefix}${nested}`];
        }
        if (
          (key === '$ref' || key === 'operationRef') &&
          typeof nested === 'string'
        ) {
          return [key, componentNames.get(nested) ?? nested];
        }
        if (key === 'security' && Array.isArray(nested)) {
          return [
            key,
            nested.map((requirement) =>
              Object.fromEntries(
                Object.entries(requirement).map(([name, scopes]) => [
                  securityNames.get(name) ?? name,
                  scopes,
                ]),
              ),
            ),
          ];
        }
        return [key, rewrite(nested)];
      }),
    );
  };
  return {
    ...document,
    paths: rewrite(source.paths),
    components: Object.fromEntries(
      Object.entries(source.components ?? {}).map(([category, entries]) => [
        category,
        Object.fromEntries(
          Object.entries(entries).map(([name, value]) => [
            `${prefix}${name}`,
            rewrite(value),
          ]),
        ),
      ]),
    ),
  } as T;
}

const prefixedLegacyDocument = prefixComponentNames(legacyDocument, 'Legacy');
const legacyComponents = record(prefixedLegacyDocument.components);
const sharedComponents = record(sharedDocument.components);
const components: Record<string, unknown> = {};
for (const category of new Set([
  ...Object.keys(legacyComponents),
  ...Object.keys(sharedComponents),
])) {
  components[category] = {
    ...record(legacyComponents[category]),
    ...record(sharedComponents[category]),
  };
}

const legacyPaths = record(prefixedLegacyDocument.paths);
const sharedPaths = record(sharedDocument.paths);
const paths: Record<string, unknown> = {
  ...legacyPaths,
  ...sharedPaths,
};
const httpMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
for (const path of new Set([
  ...Object.keys(legacyPaths),
  ...Object.keys(sharedPaths),
])) {
  const legacyPath = record(legacyPaths[path]);
  const sharedPath = record(sharedPaths[path]);
  if (
    Object.keys(legacyPath).length === 0 ||
    Object.keys(sharedPath).length === 0
  )
    continue;
  const mergedPath: Record<string, unknown> = {
    ...legacyPath,
    ...sharedPath,
  };
  for (const method of httpMethods) {
    if (legacyPath[method] === undefined || sharedPath[method] === undefined)
      continue;
    const legacyOperation = record(legacyPath[method]);
    const sharedOperation = record(sharedPath[method]);
    mergedPath[method] = {
      ...legacyOperation,
      ...sharedOperation,
      responses: {
        ...record(legacyOperation.responses),
        ...record(sharedOperation.responses),
      },
    };
  }
  paths[path] = mergedPath;
}

const document = {
  ...sharedDocument,
  paths,
  components,
};
const securitySchemes = record(components.securitySchemes);
for (const [path, pathItem] of Object.entries(paths)) {
  for (const method of httpMethods) {
    const operation = record(record(pathItem)[method]);
    if (!Array.isArray(operation.security)) continue;
    for (const requirement of operation.security) {
      for (const name of Object.keys(record(requirement))) {
        if (securitySchemes[name] === undefined) {
          throw new Error(
            `OpenAPI operation ${method.toUpperCase()} ${path} references undefined security scheme ${name}.`,
          );
        }
      }
    }
  }
}
const publicTicketResponses = record(
  record(record(paths['/api/public/tickets/{token}']).get).responses,
);
if (publicTicketResponses['410'] === undefined) {
  throw new Error(
    'The combined OpenAPI public-ticket contract is missing 410.',
  );
}
const outputDirectory = fileURLToPath(
  new URL('../apps/web/src/api/', import.meta.url),
);
const documentPath = resolve(outputDirectory, 'openapi.json');
const typesPath = resolve(outputDirectory, 'schema.d.ts');
const types = astToString(await openapiTS(document));

await mkdir(dirname(documentPath), { recursive: true });
await Promise.all([
  writeFile(documentPath, `${JSON.stringify(document, null, 2)}\n`),
  writeFile(typesPath, types),
]);
