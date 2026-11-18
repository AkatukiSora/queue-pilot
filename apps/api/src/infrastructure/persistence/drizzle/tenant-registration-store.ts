import { and, eq, isNull, sql } from 'drizzle-orm';
import type {
  RegisteredTenant,
  RegistrationCounts,
  TenantRegistrationStore,
  TenantRegistrationStoreFailure,
} from '../../../application/tenant-registration.ts';
import type { DrizzleDatabase } from './client.ts';
import { tenants } from './schema.ts';

export function createDrizzleTenantRegistrationStore(
  database: DrizzleDatabase,
): TenantRegistrationStore {
  return {
    getCounts: async (identity) => {
      const row = await database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.identity_issuer', ${identity.issuer}, true),
                 set_config('app.identity_subject', ${identity.subject}, true)
        `);
        const result = await transaction.execute<{
          identity_state: string;
          per_user_count: string;
          total_count: string;
        }>(sql`
          SELECT identity_state, per_user_count::text, total_count::text
          FROM public.get_self_service_registration_counts()
        `);
        return result.rows[0];
      });
      if (row === undefined) {
        throw new Error('Registration count function returned no row.');
      }
      const identityState = row.identity_state;
      if (
        identityState !== 'active' &&
        identityState !== 'disabled' &&
        identityState !== 'missing'
      ) {
        throw new Error(
          'Registration count function returned an invalid state.',
        );
      }
      return {
        identityState,
        perUserCount: parseCount(row.per_user_count),
        totalCount: parseCount(row.total_count),
      } satisfies RegistrationCounts;
    },
    create: async (identity, input, limits) => {
      try {
        const tenant = await database.transaction(async (transaction) => {
          await transaction.execute(sql`
            SELECT set_config('app.identity_issuer', ${identity.issuer}, true),
                   set_config('app.identity_subject', ${identity.subject}, true)
          `);
          const result = await transaction.execute<{ id: string }>(sql`
            SELECT public.create_self_service_tenant(
              ${input.slug}, ${input.displayName}, ${limits.maxPerUser}, ${limits.maxTotal}
            )::text AS id
          `);
          const id = result.rows[0]?.id;
          if (id === undefined) {
            throw new Error('Tenant creation function returned no identifier.');
          }
          await transaction.execute(sql`
            SELECT set_config('app.tenant_id', ${id}, true)
          `);
          const [createdTenant] = await transaction
            .select({
              id: tenants.id,
              slug: tenants.slug,
              displayName: tenants.displayName,
              revision: tenants.revision,
            })
            .from(tenants)
            .where(and(eq(tenants.id, id), isNull(tenants.disabledAt)))
            .limit(1);
          if (createdTenant === undefined) {
            throw new Error(
              'Created tenant was not visible in its transaction.',
            );
          }
          return createdTenant satisfies RegisteredTenant;
        });
        return { ok: true, tenant };
      } catch (error) {
        const reason = registrationFailure(error);
        if (reason === undefined) throw error;
        return { ok: false, reason };
      }
    },
  };
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Registration count exceeded the safe integer range.');
  }
  return count;
}

function registrationFailure(
  error: unknown,
): TenantRegistrationStoreFailure | undefined {
  if (!(error instanceof Error) || error.cause === undefined) return undefined;
  const cause = error.cause;
  if (cause === null || typeof cause !== 'object' || !('code' in cause)) {
    return undefined;
  }
  const code = cause.code;
  if (
    code === '23505' &&
    'constraint' in cause &&
    cause.constraint === 'tenants_slug_key'
  ) {
    return 'slug_conflict';
  }
  if (code !== 'P0001' || !('message' in cause)) return undefined;
  const message = cause.message;
  switch (message) {
    case 'tenant_limit':
    case 'tenant_total_limit':
    case 'identity_disabled':
    case 'invalid_slug':
    case 'reserved_slug':
    case 'invalid_display_name':
    case 'database_authority_required':
      return message;
    default:
      return undefined;
  }
}
