import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type EmbeddedPostgres from 'embedded-postgres';
import { parseTenantManifest } from '../apps/api/src/domain/tenant-manifest.ts';
import { applyTenantManifest } from '../apps/api/src/infrastructure/persistence/drizzle/tenant-config-store.ts';
import { type MockIssuer, startMockIssuer } from './e2e-issuer.ts';
import { withTemporaryPostgres } from './embedded-postgres.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const e2eClockPreload = fileURLToPath(
  new URL('./e2e-clock.mjs', import.meta.url),
);
const migrationsDirectory = new URL('../db/migrations/', import.meta.url);

export const webOrigin = 'http://127.0.0.1:5173';
const apiBaseUrl = 'http://127.0.0.1:8787';

/** API・mock issuer・ブラウザが共有する基準時刻 (2026-11-03 10:05 JST)。 */
export const e2eFixedTime = '2026-11-03T01:05:00.000Z';

/** manifest の member と mock issuer の sub を対応させる。 */
export const people = {
  admin: 'e2e-admin',
  staff: 'e2e-staff',
  outsider: 'e2e-outsider',
} as const;

const printer = (id: string) => ({
  defaultPrinterId: id,
  printers: [{ id, label: id }],
});
const copy = { receiptTitle: 'E2E ticket', arrivalGuidance: 'Please arrive.' };
const legacyEquipment = [
  { id: 'quest-3', label: 'Quest 3' },
  { id: 'quest-3s', label: 'Quest 3S' },
  { id: 'steam-frame', label: 'Steam Frame' },
  { id: 'beyond2', label: 'Beyond2' },
];

function buildManifest(issuer: string) {
  const member = (subject: string, role: 'admin' | 'staff') => ({
    issuer,
    subject,
    role,
    disabled: false,
  });
  return {
    schemaVersion: 1,
    tenants: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        slug: 'default',
        displayName: 'Default tenant',
        members: [member(people.admin, 'admin'), member(people.staff, 'staff')],
        events: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            slug: 'default',
            title: 'Default event',
            timeZone: 'Asia/Tokyo',
            startsAt: '2026-11-03T00:00:00Z',
            endsAt: '2026-11-04T05:00:00Z',
            numberScope: 'daily',
            equipment: legacyEquipment,
            schedule: [
              {
                date: '2026-11-03',
                firstStart: '10:00',
                lastStart: '14:30',
                intervalMinutes: 30,
                experienceMinutes: 25,
                turnoverMinutes: 5,
              },
              {
                date: '2026-11-04',
                firstStart: '10:00',
                lastStart: '13:30',
                intervalMinutes: 30,
                experienceMinutes: 25,
                turnoverMinutes: 5,
              },
            ],
            copy,
            ...printer('legacy-printer'),
          },
          {
            id: randomUUID(),
            slug: 'solo',
            title: 'Solo event',
            timeZone: 'America/New_York',
            startsAt: '2026-11-03T12:00:00Z',
            endsAt: '2026-11-04T05:00:00Z',
            numberScope: 'event',
            equipment: [{ id: 'vision-pro', label: 'Vision Pro' }],
            schedule: [
              {
                date: '2026-11-03',
                firstStart: '09:00',
                lastStart: '09:40',
                intervalMinutes: 20,
                experienceMinutes: 15,
                turnoverMinutes: 5,
              },
            ],
            copy,
            ...printer('solo-printer'),
          },
          {
            id: randomUUID(),
            slug: 'wide',
            title: 'Wide event',
            timeZone: 'Asia/Kolkata',
            startsAt: '2026-11-03T03:00:00Z',
            endsAt: '2026-11-04T05:00:00Z',
            numberScope: 'event',
            equipment: [
              { id: 'quest-3', label: 'Quest 3' },
              { id: 'quest-3s', label: 'Quest 3S' },
              { id: 'steam-frame', label: 'Steam Frame' },
              { id: 'beyond2', label: 'Beyond2' },
              { id: 'vision-pro', label: 'Vision Pro' },
            ],
            schedule: [
              {
                date: '2026-11-03',
                firstStart: '10:00',
                lastStart: '10:30',
                intervalMinutes: 15,
                experienceMinutes: 10,
                turnoverMinutes: 5,
              },
            ],
            copy,
            ...printer('wide-printer'),
          },
        ],
      },
      {
        id: '10000000-0000-4000-8000-000000000001',
        slug: 'sample-tenant',
        displayName: 'Sample tenant',
        members: [member(people.admin, 'staff')],
        events: [
          {
            id: '10000000-0000-4000-8000-000000000002',
            slug: 'summer',
            title: 'Summer event',
            timeZone: 'Asia/Tokyo',
            startsAt: '2026-11-03T00:00:00Z',
            endsAt: '2026-11-04T05:00:00Z',
            numberScope: 'event',
            equipment: [{ id: 'quest-3', label: 'Quest 3' }],
            schedule: [
              {
                date: '2026-11-03',
                firstStart: '11:00',
                lastStart: '11:30',
                intervalMinutes: 30,
                experienceMinutes: 25,
                turnoverMinutes: 5,
              },
            ],
            copy,
            ...printer('sample-printer'),
          },
        ],
      },
      {
        id: '20000000-0000-4000-8000-000000000001',
        slug: 'private-tenant',
        displayName: 'Private tenant',
        members: [member(people.outsider, 'admin')],
        events: [
          {
            id: '20000000-0000-4000-8000-000000000002',
            slug: 'secret',
            title: 'Secret event',
            timeZone: 'Asia/Tokyo',
            startsAt: '2026-11-03T00:00:00Z',
            endsAt: '2026-11-04T05:00:00Z',
            numberScope: 'event',
            equipment: [{ id: 'quest-3', label: 'Quest 3' }],
            schedule: [
              {
                date: '2026-11-03',
                firstStart: '12:00',
                lastStart: '12:30',
                intervalMinutes: 30,
                experienceMinutes: 25,
                turnoverMinutes: 5,
              },
            ],
            copy,
            ...printer('secret-printer'),
          },
        ],
      },
    ],
  };
}

export type E2EStack = {
  issuer: MockIssuer;
  /** ticket 番号から公開 token を引く (event slug 指定)。 */
  publicToken: (eventSlug: string, number: number) => Promise<string>;
  /** 移行前の枠なし旧券をテスト用に作り、公開 token を返す。 */
  seedLegacyTicket: () => Promise<string>;
  /** 指定イベントの printer に紐づく印刷エージェントと有効な credential を 1 件作る。 */
  seedAgent: (eventSlug: string) => Promise<void>;
  /** 未処理の印刷 job を印刷済みにして、移動・解放を可能にする。 */
  settlePrintJobs: (
    outputKind?: 'physical' | 'preview' | null,
  ) => Promise<void>;
  /** API と mock issuer の固定時刻を進める/戻す。API は再起動する。 */
  setClock: (iso: string) => Promise<void>;
};

type PostgresContext = {
  postgres: EmbeddedPostgres;
  urlFor: (database: string) => string;
  temporaryDirectory: string;
};

/** 使い捨ての PostgreSQL・mock issuer・API を起動して operation を実行し、必ず破棄する。 */
export async function withE2EStack(
  operation: (stack: E2EStack) => Promise<void>,
): Promise<void> {
  await withTemporaryPostgres(
    async ({ postgres, urlFor, temporaryDirectory }: PostgresContext) => {
      const owner = postgres.getPgClient('postgres', '127.0.0.1');
      await owner.connect();
      const issuer = await startMockIssuer(new Date(e2eFixedTime));
      let api: ChildProcess | undefined;
      const stopApi = async () => {
        const child = api;
        api = undefined;
        if (child === undefined || child.exitCode !== null) return;
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
        await exited;
        clearTimeout(timer);
      };
      try {
        const migrations = (await readdir(migrationsDirectory))
          .filter((name) => name.endsWith('.sql'))
          .sort();
        for (const name of migrations) {
          await owner.query(
            await readFile(new URL(name, migrationsDirectory), 'utf8'),
          );
        }

        const manifest = buildManifest(issuer.issuer);
        const parsed = parseTenantManifest(manifest);
        if (!parsed.ok) throw new Error(JSON.stringify(parsed.error.issues));
        await applyTenantManifest(urlFor('postgres'), parsed.value, undefined);
        const manifestPath = `${temporaryDirectory}/manifest.json`;
        await writeFile(manifestPath, JSON.stringify(manifest));

        // 本番と同じく、RLS を迂回できない非 owner role で API を動かす。
        const roleName = 'e2e_runtime';
        const rolePassword = randomBytes(24).toString('base64url');
        await owner.query(
          `CREATE ROLE ${roleName} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${rolePassword}'`,
        );
        await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
        const runtimeUrl = new URL(urlFor('postgres'));
        runtimeUrl.username = roleName;
        runtimeUrl.password = rolePassword;

        const authSecret = randomBytes(32).toString('base64url');
        const environment: NodeJS.ProcessEnv = { ...process.env };
        delete environment.ADMIN_TOKEN;
        delete environment.AGENT_TOKEN;
        const startApi = async (fixedTime: string) => {
          const child = spawn(
            process.execPath,
            [
              '--import',
              e2eClockPreload,
              `${projectRoot}/apps/api/src/main.ts`,
            ],
            {
              cwd: projectRoot,
              stdio: 'inherit',
              env: {
                ...environment,
                NODE_ENV: 'test',
                DATABASE_URL: runtimeUrl.toString(),
                APP_MANIFEST_PATH: manifestPath,
                AUTH_MODE: 'oidc/shared',
                AUTH_PROVIDER: 'oidc',
                AUTH_SECRET: authSecret,
                // E2E の Vite proxy だけを信頼し、production には適用しない。
                AUTH_TRUSTED_PROXIES: '["127.0.0.1/32","::1/128"]',
                PUBLIC_BASE_URL: webOrigin,
                OIDC_ISSUER: issuer.issuer,
                OIDC_DISCOVERY_URL: `${issuer.issuer}/.well-known/openid-configuration`,
                OIDC_CLIENT_ID: issuer.clientId,
                OIDC_CLIENT_SECRET: issuer.clientSecret,
                E2E_FIXED_TIME: fixedTime,
              },
            },
          );
          api = child;
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            if (child.exitCode !== null) {
              throw new Error('API exited before readiness.');
            }
            const response = await fetch(`${apiBaseUrl}/api/readyz`, {
              signal: AbortSignal.timeout(1_000),
            }).catch(() => null);
            await response?.body?.cancel();
            if (response?.status === 200) return;
            await delay(100);
          }
          throw new Error('API did not become ready within 30 seconds.');
        };
        await startApi(e2eFixedTime);

        await operation({
          issuer,
          publicToken: async (eventSlug, number) => {
            const result = await owner.query<{ public_token: string }>(
              `SELECT t.public_token FROM public.tickets t
               JOIN public.events e ON e.id = t.event_id
               WHERE e.slug = $1 AND t.number = $2
               ORDER BY t.issued_at LIMIT 1`,
              [eventSlug, number],
            );
            const token = result.rows[0]?.public_token;
            if (token === undefined) {
              throw new Error(`Ticket ${eventSlug}#${number} was not found.`);
            }
            return token;
          },
          seedLegacyTicket: async () => {
            const id = randomUUID();
            const token = randomBytes(16).toString('base64url');
            await owner.query(
              `INSERT INTO public.tickets
                (id, tenant_id, event_id, counter_key, number, public_token,
                 idempotency_key, request_hash, status, issued_at, updated_at)
               VALUES ($1, $2, $3, 'legacy', 900, $4, $5, $6, 'waiting', $7, $7)`,
              [
                id,
                manifest.tenants[0].id,
                manifest.tenants[0].events[0].id,
                token,
                randomUUID(),
                randomBytes(32).toString('hex'),
                e2eFixedTime,
              ],
            );
            await owner.query(
              `INSERT INTO public.public_ticket_locator (token, tenant_id, event_id, ticket_id)
               VALUES ($1, $2, $3, $4)`,
              [
                token,
                manifest.tenants[0].id,
                manifest.tenants[0].events[0].id,
                id,
              ],
            );
            return token;
          },
          seedAgent: async (eventSlug) => {
            const printer = await owner.query<{
              tenant_id: string;
              event_id: string;
              id: string;
            }>(
              `SELECT p.tenant_id, p.event_id, p.id FROM public.printers p
               JOIN public.events e ON e.id = p.event_id
               WHERE e.slug = $1 ORDER BY p.id LIMIT 1`,
              [eventSlug],
            );
            const row = printer.rows[0];
            if (row === undefined) {
              throw new Error(`No printer for event ${eventSlug}.`);
            }
            const agentId = randomUUID();
            await owner.query(
              `INSERT INTO public.agents (id, tenant_id, event_id, printer_id)
               VALUES ($1, $2, $3, $4)`,
              [agentId, row.tenant_id, row.event_id, row.id],
            );
            await owner.query(
              `INSERT INTO public.agent_credentials
                 (id, secret_hash, agent_id, tenant_id, event_id, printer_id, created_at, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                randomUUID(),
                randomBytes(32).toString('hex'),
                agentId,
                row.tenant_id,
                row.event_id,
                row.id,
                new Date(e2eFixedTime),
                new Date(Date.parse(e2eFixedTime) + 7 * 24 * 3_600_000),
              ],
            );
          },
          settlePrintJobs: async (outputKind = null) => {
            // print agent を起動しないため、queued の印刷 job を印刷済みにする。
            await owner.query(
              `UPDATE public.print_jobs SET status = 'printed', output_kind = $1 WHERE status IN ('queued', 'printing')`,
              [outputKind],
            );
          },
          setClock: async (iso) => {
            issuer.setNow(new Date(iso));
            await stopApi();
            await startApi(iso);
          },
        });
      } finally {
        await stopApi();
        await issuer.stop();
        await owner.end();
      }
    },
  );
}
