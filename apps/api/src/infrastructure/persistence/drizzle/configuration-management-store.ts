import { type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type ConfigurationManagementStore,
  changeConstraintCodes,
  databaseFailureCodes,
  type ManagementFailure,
  type ManagementResult,
  managedAuditPageSchema,
  managedEventSchema,
  managedEventsSchema,
  managedEventWriteSchema,
  managedMembersSchema,
  managedRevisionSchema,
  managedTenantSchema,
  managedTenantSummariesSchema,
} from '../../../application/configuration-management.ts';
import { configurationExportSchema } from '../../../domain/event-configuration.ts';
import type { DrizzleDatabase } from './client.ts';

function includes<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

// Maps the stable error codes raised by the management SQL functions. Errors
// that are not part of that contract are not handled here and propagate.
function managementFailure(error: unknown): ManagementFailure | undefined {
  if (!(error instanceof Error) || error.cause === undefined) return undefined;
  const cause = error.cause;
  if (cause === null || typeof cause !== 'object' || !('code' in cause)) {
    return undefined;
  }
  if (
    cause.code === '23505' &&
    'constraint' in cause &&
    cause.constraint === 'events_tenant_id_slug_key'
  ) {
    return { code: 'slug_conflict' };
  }
  if (cause.code !== 'P0001' || !('message' in cause)) return undefined;
  const message = String(cause.message);
  if (message === 'invalid_config') {
    return { code: 'invalid_config', issues: [] };
  }
  if (message === 'change_constraint' && 'detail' in cause) {
    const [constraint = '', fieldList = ''] = String(cause.detail).split(':');
    return includes(changeConstraintCodes, constraint)
      ? {
          code: 'change_constraint',
          constraint,
          fields: fieldList === '' ? [] : fieldList.split(','),
        }
      : undefined;
  }
  return includes(databaseFailureCodes, message)
    ? { code: message }
    : undefined;
}

export function createDrizzleConfigurationManagementStore(
  database: DrizzleDatabase,
): ConfigurationManagementStore {
  async function call<S extends z.ZodType>(
    actor: { issuer: string; subject: string },
    schema: S,
    statement: SQL,
  ): Promise<ManagementResult<z.infer<S>>> {
    try {
      const value = await database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.identity_issuer', ${actor.issuer}, true),
                 set_config('app.identity_subject', ${actor.subject}, true)
        `);
        const result = await transaction.execute<{ result: unknown }>(
          sql`SELECT ${statement} AS result`,
        );
        return schema.parse(result.rows[0]?.result);
      });
      return { ok: true, value };
    } catch (error) {
      const failure = managementFailure(error);
      if (failure === undefined) throw error;
      return { ok: false, error: failure };
    }
  }

  return {
    listTenants: async (actor) => {
      const result = await call(
        actor,
        managedTenantSummariesSchema,
        sql`public.list_managed_tenants()`,
      );
      if (!result.ok) throw new Error('Tenant listing cannot be rejected.');
      return result.value;
    },
    requireAdmin: async (actor, tenantSlug) => {
      const result = await call(
        actor,
        z.unknown(),
        sql`public.require_managed_tenant_admin(${tenantSlug})`,
      );
      return result.ok ? { ok: true, value: null } : result;
    },
    getTenant: (actor, tenantSlug) =>
      call(
        actor,
        managedTenantSchema,
        sql`public.get_managed_tenant(${tenantSlug})`,
      ),
    updateTenant: (actor, tenantSlug, input) =>
      call(
        actor,
        managedRevisionSchema,
        sql`public.update_managed_tenant(${tenantSlug}, ${input.expectedRevision}::bigint, ${input.displayName})`,
      ),
    disableTenant: (actor, tenantSlug, input) =>
      call(
        actor,
        managedRevisionSchema,
        sql`public.disable_managed_tenant(${tenantSlug}, ${input.expectedRevision}::bigint, ${input.confirmSlug})`,
      ),
    listMembers: (actor, tenantSlug) =>
      call(
        actor,
        managedMembersSchema,
        sql`public.list_managed_members(${tenantSlug})`,
      ),
    upsertMember: (actor, tenantSlug, input) =>
      call(
        actor,
        managedRevisionSchema,
        sql`public.upsert_managed_member(${tenantSlug}, ${input.expectedRevision}::bigint, ${input.subject}, ${input.role})`,
      ),
    disableMember: (actor, tenantSlug, input) =>
      call(
        actor,
        managedRevisionSchema,
        sql`public.disable_managed_member(${tenantSlug}, ${input.expectedRevision}::bigint, ${input.subject})`,
      ),
    listEvents: (actor, tenantSlug) =>
      call(
        actor,
        managedEventsSchema,
        sql`public.list_managed_events(${tenantSlug})`,
      ),
    getEvent: (actor, tenantSlug, eventSlug) =>
      call(
        actor,
        managedEventSchema,
        sql`public.get_managed_event(${tenantSlug}, ${eventSlug})`,
      ),
    createEvent: (actor, tenantSlug, input) =>
      call(
        actor,
        managedEventWriteSchema,
        sql`public.create_managed_event(${tenantSlug}, ${input.slug}, ${JSON.stringify(input.config)}::jsonb, ${input.configRevision})`,
      ),
    updateEvent: (actor, tenantSlug, eventSlug, input) =>
      call(
        actor,
        managedEventWriteSchema,
        sql`public.update_managed_event(${tenantSlug}, ${eventSlug}, ${input.expectedRevision}, ${JSON.stringify(input.config)}::jsonb, ${input.configRevision})`,
      ),
    disableEvent: (actor, tenantSlug, eventSlug, input) =>
      call(
        actor,
        managedEventWriteSchema,
        sql`public.disable_managed_event(${tenantSlug}, ${eventSlug}, ${input.expectedRevision}, ${input.confirmSlug})`,
      ),
    readAudit: (actor, tenantSlug, input) =>
      call(
        actor,
        managedAuditPageSchema,
        sql`public.read_managed_audit(${tenantSlug}, ${input.limit}::integer, ${input.before?.occurredAt ?? null}::text, ${input.before?.id ?? null}::uuid)`,
      ),
    exportTenant: (actor, tenantSlug) =>
      call(
        actor,
        configurationExportSchema,
        sql`public.export_managed_tenant(${tenantSlug})`,
      ),
  };
}
