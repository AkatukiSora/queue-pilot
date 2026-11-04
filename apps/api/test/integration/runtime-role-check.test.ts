import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { createDrizzleDatabase } from '../../src/infrastructure/persistence/drizzle/client.ts';
import { assertSharedRuntimeRole } from '../../src/infrastructure/persistence/drizzle/runtime-role-check.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';

it('accepts only a non-owner runtime login without RLS bypass or escalation privileges', async () => {
  await withFreshMigratedPostgres(async ({ owner, urlFor }) => {
    const databases: Array<ReturnType<typeof createDrizzleDatabase>> = [];
    const connectAs = async (roleName: string, password: string) => {
      const url = new URL(urlFor('postgres'));
      url.username = roleName;
      url.password = password;
      const database = createDrizzleDatabase(url.toString(), 1);
      databases.push(database);
      return database;
    };
    const createRuntimeLogin = async (
      attributes:
        | 'NOSUPERUSER NOBYPASSRLS'
        | 'SUPERUSER NOBYPASSRLS'
        | 'NOSUPERUSER BYPASSRLS',
    ) => {
      const roleName = `security_check_${randomBytes(8).toString('hex')}`;
      const password = randomBytes(24).toString('base64url');
      await owner.query(
        `CREATE ROLE ${roleName} LOGIN INHERIT ${attributes} NOCREATEROLE NOCREATEDB PASSWORD '${password}'`,
      );
      await owner.query(`GRANT queue_pilot_runtime TO ${roleName}`);
      return { roleName, database: await connectAs(roleName, password) };
    };
    const expectRejected = async (
      database: ReturnType<typeof createDrizzleDatabase>['db'],
    ) => {
      await expect(assertSharedRuntimeRole(database)).rejects.toThrow(
        'AUTH_MODE=oidc/shared requires a non-owner queue_pilot_runtime member',
      );
    };

    try {
      const runtime = await createRuntimeLogin('NOSUPERUSER NOBYPASSRLS');
      const currentUser =
        await runtime.database.db.execute(sql`SELECT current_user`);
      expect(
        String(currentUser.rows[0]?.current_user) === runtime.roleName,
      ).toBe(true);
      await expect(
        assertSharedRuntimeRole(runtime.database.db),
      ).resolves.toBeUndefined();

      const bypassLogin = await createRuntimeLogin('NOSUPERUSER BYPASSRLS');
      const bypassFlag = await owner.query<{ rolbypassrls: boolean }>(
        'SELECT rolbypassrls FROM pg_roles WHERE rolname = $1',
        [bypassLogin.roleName],
      );
      expect(bypassFlag.rows[0]?.rolbypassrls).toBe(true);
      await expectRejected(bypassLogin.database.db);

      const superuserLogin = await createRuntimeLogin('SUPERUSER NOBYPASSRLS');
      const superuserFlag = await owner.query<{ rolsuper: boolean }>(
        'SELECT rolsuper FROM pg_roles WHERE rolname = $1',
        [superuserLogin.roleName],
      );
      expect(superuserFlag.rows[0]?.rolsuper).toBe(true);
      await expectRejected(superuserLogin.database.db);

      const ddlLogin = await createRuntimeLogin('NOSUPERUSER NOBYPASSRLS');
      await owner.query(
        `GRANT CREATE ON SCHEMA public TO ${ddlLogin.roleName}`,
      );
      const ddlPrivilege = await owner.query<{ can_create: boolean }>(
        "SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create",
        [ddlLogin.roleName],
      );
      expect(ddlPrivilege.rows[0]?.can_create).toBe(true);
      await expectRejected(ddlLogin.database.db);

      const truncateLogin = await createRuntimeLogin('NOSUPERUSER NOBYPASSRLS');
      await owner.query(
        `GRANT TRUNCATE ON TABLE public.tickets TO ${truncateLogin.roleName}`,
      );
      const truncatePrivilege = await owner.query<{ can_truncate: boolean }>(
        "SELECT has_table_privilege($1, 'public.tickets', 'TRUNCATE') AS can_truncate",
        [truncateLogin.roleName],
      );
      expect(truncatePrivilege.rows[0]?.can_truncate).toBe(true);
      await expectRejected(truncateLogin.database.db);

      const escalationRole = `security_escalation_${randomBytes(8).toString('hex')}`;
      await owner.query(
        `CREATE ROLE ${escalationRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`,
      );
      const memberLogin = await createRuntimeLogin('NOSUPERUSER NOBYPASSRLS');
      await owner.query(`GRANT ${escalationRole} TO ${memberLogin.roleName}`);
      const setRoleAllowed = await owner.query<{ can_set_role: boolean }>(
        "SELECT pg_has_role($1, $2, 'set') AS can_set_role",
        [memberLogin.roleName, escalationRole],
      );
      expect(setRoleAllowed.rows[0]?.can_set_role).toBe(true);
      await expectRejected(memberLogin.database.db);

      const tableOwnerLogin = await createRuntimeLogin(
        'NOSUPERUSER NOBYPASSRLS',
      );
      await owner.query(
        `ALTER TABLE public.tickets OWNER TO ${tableOwnerLogin.roleName}`,
      );
      const ownership = await owner.query<{ owns_table: boolean }>(
        "SELECT c.relowner = r.oid AS owns_table FROM pg_class c CROSS JOIN pg_roles r WHERE c.oid = 'public.tickets'::regclass AND r.rolname = $1",
        [tableOwnerLogin.roleName],
      );
      expect(ownership.rows[0]?.owns_table).toBe(true);
      await expectRejected(tableOwnerLogin.database.db);

      const ownerDatabase = createDrizzleDatabase(urlFor('postgres'), 1);
      databases.push(ownerDatabase);
      await expectRejected(ownerDatabase.db);
    } finally {
      await Promise.all(databases.map((database) => database.close()));
    }
  });
}, 120_000);
