import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from './client.ts';

const protectedTables = [
  'tenants',
  'events',
  'event_equipment',
  'app_users',
  'tenant_memberships',
  'printers',
  'agents',
  'agent_credentials',
  'tickets',
  'ticket_counters',
  'print_jobs',
  'public_ticket_locator',
] as const;

export async function assertSharedRuntimeRole(
  database: DrizzleDatabase,
): Promise<void> {
  const relationList = protectedTables
    .map((table) => `'public.${table}'::regclass`)
    .join(', ');
  const result = await database.execute(sql`
    WITH protected AS (
      SELECT unnest(ARRAY[${sql.raw(relationList)}]) AS oid
    ),
    current_role AS (
      SELECT oid, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
      FROM pg_roles
      WHERE rolname = current_user
    ),
    table_state AS (
      SELECT c.relrowsecurity, c.relforcerowsecurity, c.relowner,
             has_table_privilege(current_user, c.oid, 'TRUNCATE') AS can_truncate
      FROM protected p
      JOIN pg_class c ON c.oid = p.oid
    )
    SELECT
      r.rolsuper AS is_superuser,
      r.rolbypassrls AS bypasses_rls,
      r.rolcreaterole AS can_create_roles,
      r.rolcreatedb AS can_create_databases,
      pg_has_role(current_user, 'queue_pilot_runtime', 'member') AS runtime_member,
      NOT EXISTS (
        SELECT 1
        FROM pg_roles candidate
        WHERE candidate.rolname NOT IN (current_user, 'queue_pilot_runtime')
          AND pg_has_role(current_user, candidate.oid, 'set')
      ) AS role_switch_restricted,
      bool_and(t.relrowsecurity AND t.relforcerowsecurity) AS all_tables_force_rls,
      bool_or(t.relowner = r.oid) AS owns_protected_table,
      bool_or(t.can_truncate) AS can_truncate_protected_table,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public
    FROM current_role r
    CROSS JOIN table_state t
    GROUP BY r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.oid
  `);
  const [state] = result.rows as Array<{
    is_superuser: boolean;
    bypasses_rls: boolean;
    can_create_roles: boolean;
    can_create_databases: boolean;
    runtime_member: boolean;
    role_switch_restricted: boolean;
    all_tables_force_rls: boolean;
    owns_protected_table: boolean;
    can_truncate_protected_table: boolean;
    can_create_in_public: boolean;
  }>;
  if (
    state === undefined ||
    state.is_superuser ||
    state.bypasses_rls ||
    state.can_create_roles ||
    state.can_create_databases ||
    !state.runtime_member ||
    !state.role_switch_restricted ||
    !state.all_tables_force_rls ||
    state.owns_protected_table ||
    state.can_truncate_protected_table ||
    state.can_create_in_public
  ) {
    throw new Error(
      'AUTH_MODE=oidc/shared requires a non-owner queue_pilot_runtime member with FORCE RLS and no privileged role or DDL access.',
    );
  }
}
