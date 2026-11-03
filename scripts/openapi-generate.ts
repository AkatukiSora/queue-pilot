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
const app = createApp({
  config: {
    databaseUrl: 'postgres://openapi:openapi@127.0.0.1:5432/openapi',
    adminToken: 'openapi-generation-admin',
    agentToken: 'openapi-generation-agent',
    eventEndAt: new Date('2026-11-04T05:00:00.000Z'),
    numberScope: 'daily',
    slotSchedule: parsedSchedule.value,
  },
  unitOfWork,
  clock: { now: () => new Date(0) },
  tokens: {
    ticketId: () => '00000000-0000-4000-8000-000000000001',
    printJobId: () => '00000000-0000-4000-8000-000000000002',
    publicToken: () => 'AAAAAAAAAAAAAAAAAAAAAA' as PublicToken,
    leaseToken: () => '00000000-0000-4000-8000-000000000003',
  },
  checkReadiness: async () => true,
});
const document = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: 'bunkasai-ticket API', version: '2.0.0' },
});
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
