import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import {
  eventConfig,
  withManagementHarness,
} from './helpers/management-harness.ts';

const allowedStateKeys = new Set([
  'displayName',
  'disabled',
  'subject',
  'role',
  'slug',
  'config',
  'configRevision',
]);

it('records every successful management mutation in the same transaction and nothing for refused ones', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    const tenantId = await h.seedTenant({ slug: 'fair', admins: [alice] });
    h.github.set('dave', '1004');
    await h.addUser('dave', '1004');

    const count = async () =>
      Number(
        (
          await h.owner.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM configuration_audit',
          )
        ).rows[0]?.count,
      );
    expect(await count()).toBe(0);

    const renamed = await h.request(alice, 'POST', '/t/fair/update', {
      expectedRevision: 1,
      displayName: 'Fair Renamed',
    });
    const added = await h.request(alice, 'POST', '/t/fair/members/upsert', {
      expectedRevision: renamed.json.revision,
      subject: '1004',
      role: 'staff',
    });
    const created = await h.createEvent(alice, 'fair', 'spring');
    const updated = await h.request(
      alice,
      'POST',
      '/t/fair/events/spring/update',
      {
        expectedRevision: created.revision,
        config: { ...eventConfig, title: 'Audited Title' },
      },
    );
    const removed = await h.request(alice, 'POST', '/t/fair/members/disable', {
      expectedRevision: added.json.revision,
      subject: '1004',
    });
    const disabled = await h.request(
      alice,
      'POST',
      '/t/fair/events/spring/disable',
      { expectedRevision: updated.json.revision, confirmSlug: 'spring' },
    );
    for (const response of [renamed, added, updated, removed, disabled]) {
      expect(response.status).toBe(200);
    }
    expect(await count()).toBe(6);

    // Refused mutations leave no trace in the audit log.
    const refused = [
      await h.request(alice, 'POST', '/t/fair/update', {
        expectedRevision: 1,
        displayName: 'Stale',
      }),
      await h.request(alice, 'POST', '/t/fair/events/create', {
        slug: 'spring',
        config: eventConfig,
      }),
      await h.request(alice, 'POST', '/t/fair/members/disable', {
        expectedRevision: removed.json.revision,
        subject: '1001',
      }),
    ];
    expect(refused.map((response) => response.status)).toEqual([409, 409, 409]);
    expect(await count()).toBe(6);

    const page = await h.request(alice, 'GET', '/t/fair/audit');
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.json.nextCursor).toBeNull();
    const entries = page.json.entries as Array<{
      action: string;
      resourceType: string;
      occurredAt: string;
      actorUserId: string;
      actorKind: string;
      origin: string;
      revisionBefore: number | null;
      revisionAfter: number | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }>;
    expect(entries.map((entry) => entry.action)).toEqual([
      'event-disable',
      'member-disable',
      'event-update',
      'event-create',
      'member-upsert',
      'tenant-update',
    ]);
    expect(entries.map((entry) => entry.resourceType)).toEqual([
      'event',
      'member',
      'event',
      'event',
      'member',
      'tenant',
    ]);
    for (const entry of entries) {
      expect(entry.actorKind).toBe('user');
      expect(entry.actorUserId).toBe(alice.appUserId);
      expect(entry.origin).toBe('management-api');
      // Timestamps come from the database clock, in UTC, with microseconds.
      expect(entry.occurredAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
      );
      expect(Math.abs(Date.now() - Date.parse(entry.occurredAt))).toBeLessThan(
        5 * 60_000,
      );
    }
    const times = entries.map((entry) => entry.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    const tenantEntry = entries[5];
    expect(tenantEntry).toMatchObject({
      revisionBefore: 1,
      revisionAfter: 2,
      before: { displayName: 'fair' },
      after: { displayName: 'Fair Renamed' },
    });
    expect(entries[4]).toMatchObject({
      before: null,
      after: { subject: '1004', role: 'staff', disabled: false },
    });
    const eventUpdate = entries[2];
    expect(eventUpdate).toMatchObject({
      before: { config: { title: 'Spring Fair' } },
      after: { config: { title: 'Audited Title' } },
    });

    // Only permitted configuration differences are stored, never credentials.
    const stored = await h.owner.query<{ row: Record<string, unknown> }>(
      'SELECT to_jsonb(audit) AS row FROM configuration_audit AS audit WHERE tenant_id = $1',
      [tenantId],
    );
    expect(stored.rows).toHaveLength(6);
    const serialized = JSON.stringify(stored.rows);
    for (const secret of [
      alice.sessionToken,
      alice.cookie,
      'Bearer',
      'secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    for (const { row } of stored.rows) {
      for (const state of [row.before_state, row.after_state]) {
        if (state === null) continue;
        for (const key of Object.keys(state as Record<string, unknown>)) {
          expect(allowedStateKeys.has(key)).toBe(true);
        }
      }
    }
  });
}, 90_000);

it('rolls the mutation back when its audit row cannot be written', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    await h.seedTenant({ slug: 'fair', admins: [alice] });
    await h.owner.query(`
      CREATE FUNCTION public.qp_test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit refused'; END $$;
      CREATE TRIGGER qp_test_refuse_audit BEFORE INSERT ON public.configuration_audit
      FOR EACH ROW EXECUTE FUNCTION public.qp_test_refuse_audit();
    `);
    const response = await h.request(alice, 'POST', '/t/fair/update', {
      expectedRevision: 1,
      displayName: 'Must not persist',
    });
    expect(response.status).toBe(500);
    const tenant = await h.owner.query<{
      display_name: string;
      revision: string;
    }>("SELECT display_name, revision::text FROM tenants WHERE slug = 'fair'");
    expect(tenant.rows).toEqual([{ display_name: 'fair', revision: '1' }]);
    const eventAttempt = await h.request(
      alice,
      'POST',
      '/t/fair/events/create',
      {
        slug: 'spring',
        config: eventConfig,
      },
    );
    expect(eventAttempt.status).toBe(500);
    const events = await h.owner.query('SELECT 1 FROM events WHERE slug = $1', [
      'spring',
    ]);
    expect(events.rows).toHaveLength(0);
    const rows = await h.owner.query('SELECT 1 FROM printers WHERE slug = $1', [
      'front-desk',
    ]);
    expect(rows.rows).toHaveLength(0);
  });
}, 60_000);

it('pages the audit log with an opaque cursor and a limit of at most 50', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    const staff = await h.addUser('bob', '1002');
    await h.seedTenant({ slug: 'fair', admins: [alice], staff: [staff] });
    let revision = 1;
    for (let index = 0; index < 5; index += 1) {
      const response = await h.request(alice, 'POST', '/t/fair/update', {
        expectedRevision: revision,
        displayName: `Name ${index}`,
      });
      revision = response.json.revision;
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page = await h.request(alice, 'GET', `/t/fair/audit${query}`);
      expect(page.status).toBe(200);
      expect(page.json.entries.length).toBeLessThanOrEqual(2);
      seen.push(
        ...page.json.entries.map(
          (entry: { after: { displayName: string } }) =>
            entry.after.displayName,
        ),
      );
      cursor = page.json.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(3);
    expect(seen).toEqual(['Name 4', 'Name 3', 'Name 2', 'Name 1', 'Name 0']);

    for (const query of ['?limit=51', '?limit=0', '?limit=abc']) {
      const response = await h.request(alice, 'GET', `/t/fair/audit${query}`);
      expect([query, response.status]).toEqual([query, 400]);
    }
    const forged = await h.request(
      alice,
      'GET',
      `/t/fair/audit?cursor=${Buffer.from('{"occurredAt":"x","id":"y"}').toString('base64url')}`,
    );
    expect(forged.status).toBe(400);
    expect(forged.json.error.code).toBe('invalid_cursor');
    const asStaff = await h.request(staff, 'GET', '/t/fair/audit');
    expect(asStaff.status).toBe(403);
  });
}, 90_000);

it('keeps the runtime role limited to the management functions', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    await h.seedTenant({ slug: 'fair', admins: [alice] });
    const denied = async (statement: ReturnType<typeof sql>) => {
      await expect(h.runtime.execute(statement)).rejects.toThrow();
    };
    // No general DML on configuration tables, no access to the audit table.
    await denied(sql`SELECT * FROM configuration_audit`);
    await denied(
      sql`INSERT INTO configuration_audit (id, tenant_id, action, resource_type, resource_id, origin) VALUES (gen_random_uuid(), gen_random_uuid(), 'tenant-update', 'tenant', 'x', 'x')`,
    );
    await denied(sql`UPDATE tenants SET display_name = 'x'`);
    await denied(sql`UPDATE events SET config = '{}'::jsonb`);
    await denied(sql`DELETE FROM tenant_memberships`);
    await denied(
      sql`INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (gen_random_uuid(), gen_random_uuid(), 'admin')`,
    );
    // Internal helpers are not callable and public execute is revoked.
    await denied(
      sql`SELECT * FROM public.qp_authorize_tenant('fair', 'none', true)`,
    );
    await denied(
      sql`SELECT public.qp_write_audit(gen_random_uuid(), NULL, NULL, 'tenant-update', 'tenant', 'x', NULL, NULL, NULL, NULL)`,
    );
    const publicExecute = await h.owner.query<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (p.proname LIKE '%managed%' OR p.proname LIKE 'qp\\_%' OR p.proname = 'lock_event_for_ticket_write')
         AND has_function_privilege('public', p.oid, 'EXECUTE')`,
    );
    expect(publicExecute.rows).toEqual([]);

    // Without a session-derived identity, a management function reveals nothing.
    await expect(
      h.runtime.execute(sql`SELECT public.get_managed_tenant('fair')`),
    ).rejects.toMatchObject({ cause: { message: 'not_found' } });
    await expect(
      h.runtime.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.identity_issuer', 'https://github.com', true),
                 set_config('app.identity_subject', '4242', true)
        `);
        await transaction.execute(
          sql`SELECT public.get_managed_tenant('fair')`,
        );
      }),
    ).rejects.toMatchObject({ cause: { message: 'not_found' } });
  });
}, 60_000);
