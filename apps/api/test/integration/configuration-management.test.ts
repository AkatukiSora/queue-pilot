import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { GitHubAccountLookup } from '../../src/application/configuration-management.ts';
import type { AuthenticatedRequestContext } from '../../src/application/security-ports.ts';
import { parseManifestEvent } from '../../src/domain/tenant-manifest.ts';
import type { PublicToken } from '../../src/domain/ticket.ts';
import {
  exportConfigurationTenant,
  importConfigurationTenant,
} from '../../src/infrastructure/persistence/drizzle/configuration-admin-store.ts';
import { createUnitOfWork } from '../../src/infrastructure/persistence/drizzle/tx.ts';
import { createRequestContextStorage } from '../../src/infrastructure/request-context.ts';
import { withFreshMigratedPostgres } from './helpers/fresh-postgres.ts';
import {
  type EventConfig,
  eventConfig,
  githubIssuer,
  type ManagementHarness,
  type TestUser,
  withManagementHarness,
} from './helpers/management-harness.ts';

const changed = (patch: Partial<EventConfig>): EventConfig => ({
  ...eventConfig,
  ...patch,
});

it('lists tenants without events and enforces admin, staff, and other-tenant authorization on every endpoint', async () => {
  await withManagementHarness(async (h) => {
    const admin = await h.addUser('alice', '1001');
    const staff = await h.addUser('bob', '1002');
    const outsider = await h.addUser('carol', '1003');
    await h.seedTenant({ slug: 'fair', admins: [admin], staff: [staff] });
    await h.seedTenant({ slug: 'other', admins: [outsider] });

    const empty = await h.request(admin, 'GET', '/tenants');
    expect(empty.status).toBe(200);
    expect(empty.headers.get('cache-control')).toBe('no-store');
    expect(empty.json.tenants).toEqual([
      expect.objectContaining({
        slug: 'fair',
        role: 'admin',
        revision: 1,
        events: [],
      }),
    ]);
    const staffList = await h.request(staff, 'GET', '/tenants');
    expect(staffList.json.tenants.map((t: { role: string }) => t.role)).toEqual(
      ['staff'],
    );
    const outsiderList = await h.request(outsider, 'GET', '/tenants');
    expect(
      outsiderList.json.tenants.map((t: { slug: string }) => t.slug),
    ).toEqual(['other']);

    const event = await h.createEvent(admin, 'fair', 'spring');
    h.github.set('dave', '1004');
    const tenantAfter = await h.owner.query<{ revision: string }>(
      "SELECT revision::text FROM tenants WHERE slug = 'fair'",
    );
    const auditBefore = await h.owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM configuration_audit',
    );

    const calls: Array<[string, string, unknown?]> = [
      ['GET', '/t/fair'],
      ['POST', '/t/fair/update', { expectedRevision: 1, displayName: 'New' }],
      ['POST', '/t/fair/disable', { expectedRevision: 1, confirmSlug: 'fair' }],
      ['GET', '/t/fair/members'],
      ['POST', '/t/fair/members/resolve', { githubLogin: 'dave' }],
      [
        'POST',
        '/t/fair/members/upsert',
        { expectedRevision: 1, subject: '1004', role: 'staff' },
      ],
      [
        'POST',
        '/t/fair/members/disable',
        { expectedRevision: 1, subject: '1002' },
      ],
      ['GET', '/t/fair/events'],
      ['GET', '/t/fair/events/spring'],
      ['POST', '/t/fair/events/create', { slug: 'other', config: eventConfig }],
      [
        'POST',
        '/t/fair/events/spring/update',
        { expectedRevision: event.revision, config: eventConfig },
      ],
      [
        'POST',
        '/t/fair/events/spring/disable',
        { expectedRevision: event.revision, confirmSlug: 'spring' },
      ],
      ['GET', '/t/fair/audit'],
      ['GET', '/t/fair/export'],
    ];
    for (const [method, path, body] of calls) {
      const label = `${method} ${path}`;
      const asStaff = await h.request(
        staff,
        method as 'GET' | 'POST',
        path,
        body,
      );
      expect([label, asStaff.status]).toEqual([label, 403]);
      const asOutsider = await h.request(
        outsider,
        method as 'GET' | 'POST',
        path,
        body,
      );
      expect([label, asOutsider.status]).toEqual([label, 404]);
      const anonymous = await h.request(
        null,
        method as 'GET' | 'POST',
        path,
        body,
      );
      expect([label, anonymous.status]).toEqual([label, 401]);
    }
    const tenantRead = await h.request(admin, 'GET', '/t/fair');
    expect(tenantRead.status).toBe(200);
    expect(tenantRead.json).toMatchObject({
      slug: 'fair',
      revision: 1,
      changeConstraints: { canDisable: true },
    });

    const tenantUnchanged = await h.owner.query<{ revision: string }>(
      "SELECT revision::text FROM tenants WHERE slug = 'fair'",
    );
    const auditAfter = await h.owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM configuration_audit',
    );
    expect(tenantUnchanged.rows).toEqual(tenantAfter.rows);
    expect(auditAfter.rows).toEqual(auditBefore.rows);

    // An event slug of another tenant is not addressable through this one.
    const crossTenant = await h.request(
      outsider,
      'GET',
      '/t/other/events/spring',
    );
    expect(crossTenant.status).toBe(404);
    const reserved = await h.request(admin, 'GET', '/t/Not_A_Slug');
    expect(reserved.status).toBe(404);

    // The body cannot choose the actor, the tenant, or any identifier.
    for (const spoof of [
      { actor: outsider.subject },
      { tenantId: '00000000-0000-4000-8000-000000000009' },
      { id: '00000000-0000-4000-8000-000000000009' },
    ]) {
      const response = await h.request(admin, 'POST', '/t/fair/update', {
        expectedRevision: 1,
        displayName: 'Spoofed',
        ...spoof,
      });
      expect(response.status).toBe(400);
    }
    const spoofedConfig = await h.request(
      admin,
      'POST',
      `/t/fair/events/spring/update`,
      {
        expectedRevision: event.revision,
        config: {
          ...eventConfig,
          id: '00000000-0000-4000-8000-000000000009',
        },
      },
    );
    expect(spoofedConfig.status).toBe(400);
    expect(spoofedConfig.json.error.code).toBe('invalid_config');
  });
}, 60_000);

it('creates, updates, freezes, drains, and disables events with the ticket change constraints', async () => {
  await withManagementHarness(async (h) => {
    const admin = await h.addUser('alice', '1001');
    const tenantId = await h.seedTenant({ slug: 'fair', admins: [admin] });
    const created = await h.createEvent(admin, 'fair', 'spring');
    const eventId = created.id;

    const duplicate = await h.request(admin, 'POST', '/t/fair/events/create', {
      slug: 'spring',
      config: eventConfig,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.error.code).toBe('slug_conflict');
    const invalid = await h.request(admin, 'POST', '/t/fair/events/create', {
      slug: 'broken',
      config: { ...eventConfig, schedule: [] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.code).toBe('invalid_config');

    const detail = await h.request(admin, 'GET', '/t/fair/events/spring');
    expect(detail.json).toMatchObject({
      id: eventId,
      slug: 'spring',
      revision: created.revision,
      changeConstraints: {
        ticketCount: 0,
        structuralFrozen: false,
        canDisable: true,
      },
    });
    const listed = await h.request(admin, 'GET', '/t/fair/events');
    expect(listed.json.events).toHaveLength(1);

    // Without tickets every structural field may change.
    const shortened = changed({
      schedule: [{ ...eventConfig.schedule[0], lastStart: '11:00' }],
    } as Partial<EventConfig>);
    const first = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: created.revision, config: shortened },
    );
    expect(first.status).toBe(200);
    expect(first.json.id).toBe(eventId);
    expect(first.json.revision).not.toBe(created.revision);

    // A stale revision is rejected without changing anything.
    const stale = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: created.revision, config: eventConfig },
    );
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('revision_conflict');

    // A second printer is added; the default printer changes for new jobs only.
    const withSideDesk = changed({
      defaultPrinterId: 'side-desk',
      printers: [
        { id: 'front-desk', label: 'Front desk' },
        { id: 'side-desk', label: 'Side desk' },
      ],
    });
    const second = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: first.json.revision, config: withSideDesk },
    );
    expect(second.status).toBe(200);
    const printerRows = await h.owner.query<{
      slug: string;
      id: string;
      disabled_at: Date | null;
    }>(
      'SELECT slug, id::text, disabled_at FROM printers WHERE event_id = $1 ORDER BY slug',
      [eventId],
    );
    expect(printerRows.rows.map((row) => row.slug)).toEqual([
      'front-desk',
      'side-desk',
    ]);
    const frontDeskId = printerRows.rows[0]?.id;

    const ticketId = await h.insertTicket(tenantId, eventId, 'waiting');
    const jobId = await h.insertPrintJob(
      tenantId,
      eventId,
      'front-desk',
      ticketId,
      'printed',
    );
    const snapshotBefore = await h.owner.query(
      'SELECT payload FROM print_jobs WHERE id = $1',
      [jobId],
    );

    // Each structural field is frozen once a single ticket exists.
    const frozen: Array<[string, EventConfig]> = [
      ['timeZone', { ...withSideDesk, timeZone: 'Europe/Paris' }],
      ['numberScope', { ...withSideDesk, numberScope: 'daily' }],
      ['startsAt', { ...withSideDesk, startsAt: '2027-03-06T08:30:00+01:00' }],
      ['endsAt', { ...withSideDesk, endsAt: '2027-03-06T19:00:00+01:00' }],
      [
        'schedule',
        {
          ...withSideDesk,
          schedule: [{ ...eventConfig.schedule[0], lastStart: '11:00' }],
        } as EventConfig,
      ],
      [
        'equipmentIds',
        {
          ...withSideDesk,
          equipment: [
            { id: 'station-a', label: 'Station A' },
            { id: 'station-c', label: 'Station C' },
          ],
        },
      ],
    ];
    for (const [field, config] of frozen) {
      const response = await h.request(
        admin,
        'POST',
        '/t/fair/events/spring/update',
        { expectedRevision: second.json.revision, config },
      );
      expect([field, response.status, response.json.error.code]).toEqual([
        field,
        409,
        'change_constraint',
      ]);
      expect(response.json.error.constraint).toBe('structural_frozen');
      expect(response.json.error.fields).toEqual([field]);
    }
    const frozenDetail = await h.request(admin, 'GET', '/t/fair/events/spring');
    expect(frozenDetail.json.changeConstraints).toMatchObject({
      ticketCount: 1,
      structuralFrozen: true,
      activeTicketCount: 1,
      canDisable: false,
    });

    // Display text may change and never rewrites the stored snapshots.
    const relabelled = changed({
      title: 'Renamed Fair',
      equipment: [
        { id: 'station-a', label: 'Renamed A' },
        { id: 'station-b', label: 'Station B' },
      ],
      copy: { receiptTitle: 'Renamed', arrivalGuidance: 'New guidance' },
      defaultPrinterId: 'side-desk',
      printers: [
        { id: 'front-desk', label: 'Renamed desk' },
        { id: 'side-desk', label: 'Side desk' },
      ],
    });
    const relabel = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: second.json.revision, config: relabelled },
    );
    expect(relabel.status).toBe(200);
    const snapshotAfter = await h.owner.query(
      'SELECT payload FROM print_jobs WHERE id = $1',
      [jobId],
    );
    expect(snapshotAfter.rows).toEqual(snapshotBefore.rows);
    const frontDeskAfter = await h.owner.query<{ id: string; label: string }>(
      "SELECT id::text, label FROM printers WHERE event_id = $1 AND slug = 'front-desk'",
      [eventId],
    );
    expect(frontDeskAfter.rows).toEqual([
      { id: frontDeskId, label: 'Renamed desk' },
    ]);

    // A printer with queued work must be drained before it can be removed.
    const sideJob = await h.insertPrintJob(
      tenantId,
      eventId,
      'side-desk',
      ticketId,
      'queued',
    );
    const withoutSideDesk = changed({
      title: 'Renamed Fair',
      equipment: relabelled.equipment,
      copy: relabelled.copy,
    });
    const blockedDrain = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: relabel.json.revision, config: withoutSideDesk },
    );
    expect(blockedDrain.status).toBe(409);
    expect(blockedDrain.json.error.constraint).toBe('printer_in_use');
    expect(blockedDrain.json.error.fields).toEqual(['side-desk']);
    const inUse = await h.request(admin, 'GET', '/t/fair/events/spring');
    expect(inUse.json.changeConstraints.printersInUse).toEqual(['side-desk']);
    await h.owner.query(
      "UPDATE print_jobs SET status = 'printed' WHERE id = $1",
      [sideJob],
    );
    const drained = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/update',
      { expectedRevision: relabel.json.revision, config: withoutSideDesk },
    );
    expect(drained.status).toBe(200);
    const sideRow = await h.owner.query<{ disabled: boolean }>(
      "SELECT disabled_at IS NOT NULL AS disabled FROM printers WHERE event_id = $1 AND slug = 'side-desk'",
      [eventId],
    );
    expect(sideRow.rows).toEqual([{ disabled: true }]);

    // Disabling needs confirmation and no active tickets or jobs.
    const disableBody = (confirmSlug: string, expectedRevision: string) => ({
      expectedRevision,
      confirmSlug,
    });
    const activeTicket = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/disable',
      disableBody('spring', drained.json.revision),
    );
    expect(activeTicket.status).toBe(409);
    expect(activeTicket.json.error.constraint).toBe('active_tickets');
    await h.owner.query("UPDATE tickets SET status = 'served' WHERE id = $1", [
      ticketId,
    ]);
    await h.insertPrintJob(
      tenantId,
      eventId,
      'front-desk',
      ticketId,
      'printing',
    );
    const activeJob = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/disable',
      disableBody('spring', drained.json.revision),
    );
    expect(activeJob.json.error.constraint).toBe('active_print_jobs');
    await h.owner.query(
      "UPDATE print_jobs SET status = 'unknown', lease_token = NULL, lease_expires_at = NULL, claimed_by_agent_id = NULL WHERE status = 'printing'",
    );
    const mismatch = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/disable',
      disableBody('summer', drained.json.revision),
    );
    expect(mismatch.status).toBe(400);
    expect(mismatch.json.error.code).toBe('confirmation_mismatch');
    const disabled = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/disable',
      disableBody('spring', drained.json.revision),
    );
    expect(disabled.status).toBe(200);
    expect(
      (await h.request(admin, 'GET', '/t/fair/events/spring')).status,
    ).toBe(404);
    expect(
      (await h.request(admin, 'GET', '/t/fair/events')).json.events,
    ).toEqual([]);
    // History is retained: nothing is physically deleted.
    const retained = await h.owner.query<{
      tickets: string;
      jobs: string;
      disabled: boolean;
    }>(
      `SELECT (SELECT count(*) FROM tickets WHERE event_id = $1)::text AS tickets,
              (SELECT count(*) FROM print_jobs WHERE event_id = $1)::text AS jobs,
              (SELECT disabled_at IS NOT NULL FROM events WHERE id = $1) AS disabled`,
      [eventId],
    );
    expect(retained.rows).toEqual([
      { tickets: '1', jobs: '3', disabled: true },
    ]);
    const reuse = await h.request(admin, 'POST', '/t/fair/events/create', {
      slug: 'spring',
      config: eventConfig,
    });
    expect(reuse.status).toBe(409);
  });
}, 90_000);

it('rejects stale tenant and member revisions and disables a tenant only after confirmation', async () => {
  await withManagementHarness(async (h) => {
    const admin = await h.addUser('alice', '1001');
    await h.seedTenant({ slug: 'fair', admins: [admin] });

    const renamed = await h.request(admin, 'POST', '/t/fair/update', {
      expectedRevision: 1,
      displayName: 'Renamed Tenant',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.json).toEqual({ revision: 2 });
    const staleRename = await h.request(admin, 'POST', '/t/fair/update', {
      expectedRevision: 1,
      displayName: 'Lost update',
    });
    expect(staleRename.status).toBe(409);
    expect(staleRename.json.error.code).toBe('revision_conflict');
    const blankName = await h.request(admin, 'POST', '/t/fair/update', {
      expectedRevision: 2,
      displayName: '   ',
    });
    expect(blankName.status).toBe(400);
    const read = await h.request(admin, 'GET', '/t/fair');
    expect(read.json).toMatchObject({
      slug: 'fair',
      displayName: 'Renamed Tenant',
      revision: 2,
    });
    const identity = await h.owner.query<{ id: string; slug: string }>(
      "SELECT id::text, slug FROM tenants WHERE slug = 'fair'",
    );
    expect(identity.rows).toHaveLength(1);

    h.github.set('dave', '1004');
    const staleMember = await h.request(
      admin,
      'POST',
      '/t/fair/members/upsert',
      {
        expectedRevision: 1,
        subject: '1004',
        role: 'staff',
      },
    );
    expect(staleMember.status).toBe(409);
    expect(staleMember.json.error.code).toBe('revision_conflict');

    const wrongConfirmation = await h.request(
      admin,
      'POST',
      '/t/fair/disable',
      {
        expectedRevision: 2,
        confirmSlug: 'other',
      },
    );
    expect(wrongConfirmation.status).toBe(400);
    const stillThere = await h.request(admin, 'GET', '/t/fair');
    expect(stillThere.status).toBe(200);

    const tenantId = identity.rows[0]?.id ?? '';
    const created = await h.createEvent(admin, 'fair', 'spring');
    const ticketId = await h.insertTicket(tenantId, created.id, 'called');
    const blocked = await h.request(admin, 'POST', '/t/fair/disable', {
      expectedRevision: 2,
      confirmSlug: 'fair',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.constraint).toBe('active_tickets');
    await h.owner.query(
      "UPDATE tickets SET status = 'cancelled', cancel_reason = 'staff' WHERE id = $1",
      [ticketId],
    );
    const disabled = await h.request(admin, 'POST', '/t/fair/disable', {
      expectedRevision: 2,
      confirmSlug: 'fair',
    });
    expect(disabled.status).toBe(200);
    expect(disabled.json).toEqual({ revision: 3 });
    expect((await h.request(admin, 'GET', '/t/fair')).status).toBe(404);
    expect((await h.request(admin, 'GET', '/tenants')).json.tenants).toEqual(
      [],
    );
    const rows = await h.owner.query<{
      events_disabled: boolean;
      tickets: string;
    }>(
      `SELECT bool_and(event.disabled_at IS NOT NULL) AS events_disabled,
              (SELECT count(*) FROM tickets WHERE tenant_id = $1)::text AS tickets
       FROM events AS event WHERE event.tenant_id = $1`,
      [tenantId],
    );
    expect(rows.rows).toEqual([{ events_disabled: true, tickets: '1' }]);
  });
}, 60_000);

it('manages members, protects the last administrator under concurrent changes, and revokes sessions', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    const bob = await h.addUser('bob', '1002');
    await h.seedTenant({ slug: 'fair', admins: [alice, bob] });
    const dave = await h.addUser('dave', '1004');
    h.github.set('erin', '1005');

    const resolved = await h.request(alice, 'POST', '/t/fair/members/resolve', {
      githubLogin: 'erin',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.json).toEqual({
      subject: '1005',
      login: 'erin',
      displayName: 'erin',
    });
    const unknown = await h.request(alice, 'POST', '/t/fair/members/resolve', {
      githubLogin: 'nobody',
    });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error.code).toBe('member_not_found');

    let revision = (await h.request(alice, 'GET', '/t/fair')).json.revision;
    const added = await h.request(alice, 'POST', '/t/fair/members/upsert', {
      expectedRevision: revision,
      subject: '1004',
      role: 'staff',
    });
    expect(added.status).toBe(200);
    revision = added.json.revision;
    const listed = await h.request(alice, 'GET', '/t/fair/members');
    expect(listed.json.revision).toBe(revision);
    expect(
      listed.json.members.map(
        (m: { subject: string; role: string; self: boolean }) => [
          m.subject,
          m.role,
          m.self,
        ],
      ),
    ).toEqual([
      ['1001', 'admin', true],
      ['1002', 'admin', false],
      ['1004', 'staff', false],
    ]);
    // The provider is fixed and the subject is verified again by the server.
    const unverified = await h.request(
      alice,
      'POST',
      '/t/fair/members/upsert',
      {
        expectedRevision: revision,
        subject: '9999',
        role: 'staff',
      },
    );
    expect(unverified.status).toBe(400);
    expect(unverified.json.error.code).toBe('member_not_found');
    const badRole = await h.request(alice, 'POST', '/t/fair/members/upsert', {
      expectedRevision: revision,
      subject: '1004',
      role: 'owner',
    });
    expect(badRole.status).toBe(400);

    // The staff member is now a signed-in member; demoting and disabling
    // revoke exactly their sessions.
    const sessions = async (user: { authUserId: string }) =>
      Number(
        (
          await h.owner.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM "session" WHERE "userId" = $1',
            [user.authUserId],
          )
        ).rows[0]?.count,
      );
    expect(await sessions(dave)).toBe(1);
    const disabledStaff = await h.request(
      alice,
      'POST',
      '/t/fair/members/disable',
      {
        expectedRevision: revision,
        subject: '1004',
      },
    );
    expect(disabledStaff.status).toBe(200);
    revision = disabledStaff.json.revision;
    expect(await sessions(dave)).toBe(0);
    expect(await sessions(alice)).toBe(1);
    const afterDisable = await h.request(dave, 'GET', '/t/fair');
    expect(afterDisable.status).toBe(401);

    // Two administrators demote each other at the same time: exactly one wins.
    // The loser either conflicts on the revision or has already lost its
    // session to the winner's demotion.
    const results = await Promise.all([
      h.request(alice, 'POST', '/t/fair/members/upsert', {
        expectedRevision: revision,
        subject: '1002',
        role: 'staff',
      }),
      h.request(bob, 'POST', '/t/fair/members/upsert', {
        expectedRevision: revision,
        subject: '1001',
        role: 'staff',
      }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    const admins = await h.owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM tenant_memberships WHERE role = 'admin' AND disabled_at IS NULL",
    );
    expect(admins.rows[0]?.count).toBe('1');
    const remaining = await h.owner.query<{ subject: string }>(
      `SELECT app_user.subject FROM tenant_memberships AS membership
       JOIN app_users AS app_user ON app_user.id = membership.user_id
       WHERE membership.role = 'admin' AND membership.disabled_at IS NULL`,
    );
    const survivor = remaining.rows[0]?.subject === '1001' ? alice : bob;
    const current = (await h.request(survivor, 'GET', '/t/fair/members')).json;
    const other = survivor === alice ? '1002' : '1001';

    // The last administrator can neither be demoted nor disabled.
    const demoteLast = await h.request(
      survivor,
      'POST',
      '/t/fair/members/upsert',
      {
        expectedRevision: current.revision,
        subject: survivor.subject,
        role: 'staff',
      },
    );
    expect([demoteLast.status, demoteLast.json.error.code]).toEqual([
      409,
      'last_admin',
    ]);
    const disableLast = await h.request(
      survivor,
      'POST',
      '/t/fair/members/disable',
      {
        expectedRevision: current.revision,
        subject: survivor.subject,
      },
    );
    expect([disableLast.status, disableLast.json.error.code]).toEqual([
      409,
      'last_admin',
    ]);
    // Promoting the other member first makes the demotion legal again.
    const promoted = await h.request(
      survivor,
      'POST',
      '/t/fair/members/upsert',
      {
        expectedRevision: current.revision,
        subject: other,
        role: 'admin',
      },
    );
    expect(promoted.status).toBe(200);
    const unknownTarget = await h.request(
      survivor,
      'POST',
      '/t/fair/members/disable',
      { expectedRevision: promoted.json.revision, subject: '7777' },
    );
    expect(unknownTarget.status).toBe(404);
    const demoted = await h.request(
      survivor,
      'POST',
      '/t/fair/members/upsert',
      {
        expectedRevision: promoted.json.revision,
        subject: survivor.subject,
        role: 'staff',
      },
    );
    expect(demoted.status).toBe(200);
    expect(await sessions(survivor)).toBe(0);
  });
}, 90_000);

it('selects GitHub tokens by local account row ID through Better Auth and completes member add', async () => {
  await withManagementHarness(
    async (h) => {
      const token = 'fixture-github-access-token';
      const admin = await h.addUser('alice', '1001', token);
      const other = await h.addUser('bob', '1002', 'fixture-other-user-token');
      await h.seedTenant({ slug: 'fair', admins: [admin], staff: [other] });
      await h.owner.query(
        'INSERT INTO "account" (id, "accountId", "providerId", "userId", "accessToken", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $6)',
        [
          randomUUID(),
          'oidc-provider-subject',
          'oidc',
          admin.authUserId,
          'fixture-other-provider-token',
          new Date(),
        ],
      );
      h.github.set('dave', '1004');

      const resolved = await h.request(
        admin,
        'POST',
        '/t/fair/members/resolve',
        {
          githubLogin: 'dave',
        },
      );
      expect(resolved.status).toBe(200);
      expect(resolved.json).toEqual({
        subject: '1004',
        login: 'dave',
        displayName: 'dave',
      });

      const added = await h.request(admin, 'POST', '/t/fair/members/upsert', {
        expectedRevision: 1,
        subject: '1004',
        role: 'staff',
      });
      expect(added.status).toBe(200);
      expect(h.githubAccessTokens).toEqual([token, token]);
      expect(
        (await h.request(admin, 'GET', '/t/fair/members')).json.members.map(
          (member: { subject: string; role: string }) => [
            member.subject,
            member.role,
          ],
        ),
      ).toEqual([
        ['1001', 'admin'],
        ['1002', 'staff'],
        ['1004', 'staff'],
      ]);

      const account = await h.owner.query<{ id: string; accountId: string }>(
        'SELECT id, "accountId" FROM "account" WHERE "userId" = $1 AND "providerId" = \'github\'',
        [admin.authUserId],
      );
      expect(account.rows).toHaveLength(1);
      expect(account.rows[0]?.id).not.toBe(account.rows[0]?.accountId);
      expect(
        await h.authentication.resolveRegistrationIdentity(
          new Headers({ cookie: admin.cookie }),
        ),
      ).toMatchObject({
        authUserId: admin.authUserId,
        issuer: githubIssuer,
        subject: '1001',
      });
    },
    { useBetterAuthAccessToken: true },
  );
}, 60_000);

it('maps GitHub reauthentication, rate limits, not-found, and outages to API contracts', async () => {
  let outcome: GitHubAccountLookup = { kind: 'reauth_required' };
  const resolver = {
    findByLogin: async () => outcome,
    findBySubject: async () => outcome,
  };
  await withManagementHarness(
    async (h) => {
      const admin = await h.addUser('alice', '1001');
      await h.seedTenant({ slug: 'fair', admins: [admin] });

      const reauth = await h.request(admin, 'POST', '/t/fair/members/resolve', {
        githubLogin: 'dave',
      });
      expect([reauth.status, reauth.json.error.code]).toEqual([
        409,
        'github_reauth_required',
      ]);

      outcome = { kind: 'rate_limited', retryAfterSeconds: 75 };
      const resolveLimited = await h.request(
        admin,
        'POST',
        '/t/fair/members/resolve',
        { githubLogin: 'dave' },
      );
      expect([resolveLimited.status, resolveLimited.json.error.code]).toEqual([
        503,
        'github_rate_limited',
      ]);
      expect(resolveLimited.headers.get('retry-after')).toBe('75');

      const upsertLimited = await h.request(
        admin,
        'POST',
        '/t/fair/members/upsert',
        { expectedRevision: 1, subject: '1004', role: 'staff' },
      );
      expect([upsertLimited.status, upsertLimited.json.error.code]).toEqual([
        503,
        'github_rate_limited',
      ]);
      expect(upsertLimited.headers.get('retry-after')).toBe('75');

      outcome = { kind: 'reauth_required' };
      const upsertReauth = await h.request(
        admin,
        'POST',
        '/t/fair/members/upsert',
        { expectedRevision: 1, subject: '1004', role: 'staff' },
      );
      expect([upsertReauth.status, upsertReauth.json.error.code]).toEqual([
        409,
        'github_reauth_required',
      ]);

      outcome = { kind: 'unavailable' };
      const unavailable = await h.request(
        admin,
        'POST',
        '/t/fair/members/resolve',
        { githubLogin: 'dave' },
      );
      expect([unavailable.status, unavailable.json.error.code]).toEqual([
        503,
        'upstream_unavailable',
      ]);

      outcome = { kind: 'not_found' };
      const missing = await h.request(
        admin,
        'POST',
        '/t/fair/members/resolve',
        { githubLogin: 'nobody' },
      );
      expect([missing.status, missing.json.error.code]).toEqual([
        400,
        'member_not_found',
      ]);
    },
    { githubResolver: resolver },
  );
}, 60_000);

it('refuses web changes while the deployment still uses manifest authority', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    await h.seedTenant({ slug: 'fair', admins: [alice] });
    h.github.set('dave', '1004');
    await h.owner.query(
      "UPDATE configuration_authority SET mode = 'manifest' WHERE id = 1",
    );
    expect((await h.request(alice, 'GET', '/t/fair')).status).toBe(200);
    const attempts = [
      h.request(alice, 'POST', '/t/fair/update', {
        expectedRevision: 1,
        displayName: 'Renamed',
      }),
      h.request(alice, 'POST', '/t/fair/events/create', {
        slug: 'spring',
        config: eventConfig,
      }),
      h.request(alice, 'POST', '/t/fair/members/upsert', {
        expectedRevision: 1,
        subject: '1004',
        role: 'staff',
      }),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(503);
      expect(response.json.error.code).toBe('database_authority_required');
    }
    const untouched = await h.owner.query<{ revision: string; events: string }>(
      `SELECT revision::text, (SELECT count(*) FROM events WHERE tenant_id = tenants.id)::text AS events
       FROM tenants WHERE slug = 'fair'`,
    );
    expect(untouched.rows).toEqual([{ revision: '1', events: '0' }]);
    await h.owner.query(
      "UPDATE configuration_authority SET mode = 'database' WHERE id = 1",
    );
    expect(
      (
        await h.request(alice, 'POST', '/t/fair/update', {
          expectedRevision: 1,
          displayName: 'Renamed',
        })
      ).status,
    ).toBe(200);
  });
}, 60_000);

it('rate-limits GitHub account lookups per path', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    await h.seedTenant({ slug: 'fair', admins: [alice] });
    h.github.set('erin', '1005');
    const statuses: number[] = [];
    let limited: Headers | undefined;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const response = await h.request(
        alice,
        'POST',
        '/t/fair/members/resolve',
        {
          githubLogin: 'erin',
        },
      );
      statuses.push(response.status);
      if (response.status === 429) limited ??= response.headers;
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses).toContain(429);
    expect(limited?.get('x-retry-after')).not.toBeNull();
    // Other endpoints are not throttled by the lookup rule.
    expect((await h.request(alice, 'GET', '/t/fair/members')).status).toBe(200);
  });
}, 60_000);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function stillPending(promise: Promise<unknown>): Promise<boolean> {
  const outcome = await Promise.race([
    promise.then(() => 'finished'),
    new Promise<string>((done) => setTimeout(() => done('pending'), 750)),
  ]);
  return outcome === 'pending';
}

async function seedEventContext(
  h: ManagementHarness,
  admin: TestUser,
): Promise<{
  tenantId: string;
  eventId: string;
  revision: string;
  context: AuthenticatedRequestContext;
}> {
  const tenantId = await h.seedTenant({ slug: 'fair', admins: [admin] });
  const created = await h.createEvent(admin, 'fair', 'spring');
  const parsed = parseManifestEvent({
    id: created.id,
    slug: 'spring',
    ...eventConfig,
  });
  if (!parsed.ok) throw new Error('The fixture event is invalid.');
  return {
    tenantId,
    eventId: created.id,
    revision: created.revision,
    context: {
      kind: 'member',
      tenantId: tenantId as AuthenticatedRequestContext['tenantId'],
      eventId: created.id as AuthenticatedRequestContext['eventId'],
      userId: admin.appUserId,
      role: 'admin',
      event: parsed.value,
    },
  };
}

it('makes ticket writes and configuration updates exclude each other on the tenant and event rows', async () => {
  await withManagementHarness(async (h) => {
    const admin = await h.addUser('alice', '1001');
    const { tenantId, eventId, revision, context } = await seedEventContext(
      h,
      admin,
    );
    const requestContext = createRequestContextStorage();
    const unitOfWork = createUnitOfWork(h.runtime, requestContext);
    // A complete ticket write: lock, number allocation, ticket, print job.
    const writeTicket = (gate?: Promise<void>, entered?: () => void) =>
      requestContext.run(context, () =>
        unitOfWork.run(async (repositories) => {
          entered?.();
          await gate;
          const number = await repositories.tickets.allocateNextNumber('event');
          const ticketId = randomUUID();
          const issuedAt = new Date('2027-03-06T09:30:00.000Z');
          const publicToken = randomBytes(16).toString(
            'base64url',
          ) as PublicToken;
          return repositories.tickets.createIssuedTicket(
            {
              id: ticketId,
              counterKey: 'event',
              number,
              publicToken,
              idempotencyKey: randomUUID(),
              requestHash: randomBytes(32).toString('hex'),
              reservation: { kind: 'legacy' },
              slotReleasedAt: null,
              state: { status: 'waiting' },
              issuedAt,
              updatedAt: issuedAt,
              latestChange: null,
              partySize: 1,
            },
            {
              id: randomUUID(),
              ticketId,
              status: 'queued',
              createdAt: issuedAt,
              updatedAt: issuedAt,
              attempt: 0,
              leaseToken: null,
              leaseExpiresAt: null,
              reprintOf: null,
              payload: {
                ticketNumber: number,
                partySize: 1,
                publicToken,
                issuedAt,
              },
              outputKind: null,
            },
          );
        }),
      );

    // 1. An in-flight ticket write makes a structural update wait, and the
    // update then sees the ticket and is rejected instead of racing it.
    const entered = deferred();
    const release = deferred();
    const inFlight = writeTicket(release.promise, entered.resolve);
    await entered.promise;
    const structural: EventConfig = { ...eventConfig, numberScope: 'daily' };
    const update = h.request(admin, 'POST', '/t/fair/events/spring/update', {
      expectedRevision: revision,
      config: structural,
    });
    expect(await stillPending(update)).toBe(true);
    release.resolve();
    expect((await inFlight).ok).toBe(true);
    const rejected = await update;
    expect(rejected.status).toBe(409);
    expect(rejected.json.error.constraint).toBe('structural_frozen');
    expect(rejected.json.error.fields).toEqual(['numberScope']);
    const stored = await h.owner.query<{ number_scope: string }>(
      "SELECT config ->> 'numberScope' AS number_scope FROM events WHERE id = $1",
      [eventId],
    );
    expect(stored.rows).toEqual([{ number_scope: 'event' }]);

    // 2. A configuration writer that already holds the rows makes a ticket
    // write wait until it commits (tenant first, then event).
    const writer = h.owner;
    await writer.query('BEGIN');
    await writer.query('SELECT 1 FROM tenants WHERE id = $1 FOR SHARE', [
      tenantId,
    ]);
    await writer.query('SELECT 1 FROM events WHERE id = $1 FOR UPDATE', [
      eventId,
    ]);
    const waiting = writeTicket();
    expect(await stillPending(waiting)).toBe(true);
    await writer.query('COMMIT');
    expect((await waiting).ok).toBe(true);

    // 3. A tenant-level writer also excludes ticket writes.
    await writer.query('BEGIN');
    await writer.query('SELECT 1 FROM tenants WHERE id = $1 FOR UPDATE', [
      tenantId,
    ]);
    const waitingForTenant = writeTicket();
    expect(await stillPending(waitingForTenant)).toBe(true);
    await writer.query('COMMIT');
    expect((await waitingForTenant).ok).toBe(true);

    // 4. Concurrent ticket writes and display-text updates neither deadlock
    // nor lose a write.
    let current = (await h.request(admin, 'GET', '/t/fair/events/spring')).json
      .revision as string;
    const updates = (async () => {
      const statuses: number[] = [];
      for (let index = 0; index < 8; index += 1) {
        const response = await h.request(
          admin,
          'POST',
          '/t/fair/events/spring/update',
          {
            expectedRevision: current,
            config: { ...eventConfig, title: `Round ${index}` },
          },
        );
        statuses.push(response.status);
        if (response.status === 200) current = response.json.revision;
      }
      return statuses;
    })();
    const writes = await Promise.all(
      Array.from({ length: 8 }, () => writeTicket()),
    );
    expect(writes.every((result) => result.ok)).toBe(true);
    expect(await updates).toEqual(Array(8).fill(200));
    const count = await h.owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tickets WHERE event_id = $1',
      [eventId],
    );
    expect(count.rows[0]?.count).toBe('11');

    // 5. Once the event is disabled, stale ticket writers are refused.
    await h.owner.query(
      "UPDATE tickets SET status = 'served' WHERE event_id = $1",
      [eventId],
    );
    await h.owner.query(
      "UPDATE print_jobs SET status = 'printed' WHERE event_id = $1",
      [eventId],
    );
    const disabled = await h.request(
      admin,
      'POST',
      '/t/fair/events/spring/disable',
      { expectedRevision: current, confirmSlug: 'spring' },
    );
    expect(disabled.status).toBe(200);
    await expect(writeTicket()).rejects.toThrow();
  });
}, 120_000);

it('exports a tenant configuration without credentials and imports it back with the owner command', async () => {
  await withManagementHarness(async (h) => {
    const alice = await h.addUser('alice', '1001');
    const bob = await h.addUser('bob', '1002');
    const tenantId = await h.seedTenant({
      slug: 'fair',
      admins: [alice],
      staff: [bob],
    });
    const spring = await h.createEvent(alice, 'fair', 'spring');
    await h.createEvent(alice, 'fair', 'summer', {
      ...eventConfig,
      title: 'Summer Fair',
      printers: [
        { id: 'front-desk', label: 'Front desk' },
        { id: 'side-desk', label: 'Side desk' },
      ],
    });
    const ticketId = await h.insertTicket(tenantId, spring.id, 'waiting');
    await h.insertPrintJob(
      tenantId,
      spring.id,
      'front-desk',
      ticketId,
      'printed',
    );
    const secretHash = randomBytes(32).toString('hex');
    const agentId = randomUUID();
    await h.owner.query(
      `INSERT INTO agents (id, tenant_id, event_id, printer_id)
       VALUES ($1, $2, $3, (SELECT id FROM printers WHERE event_id = $3 AND slug = 'front-desk'))`,
      [agentId, tenantId, spring.id],
    );
    await h.owner.query(
      `INSERT INTO agent_credentials (id, secret_hash, agent_id, tenant_id, event_id, printer_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, (SELECT printer_id FROM agents WHERE id = $3), now(), now() + interval '1 day')`,
      [randomUUID(), secretHash, agentId, tenantId, spring.id],
    );

    const response = await h.request(alice, 'GET', '/t/fair/export');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json.configurationExportVersion).toBe(1);
    expect(
      response.json.events.map((event: { slug: string }) => event.slug),
    ).toEqual(['spring', 'summer']);
    expect(response.json.members).toEqual([
      { issuer: githubIssuer, subject: '1001', role: 'admin', disabled: false },
      { issuer: githubIssuer, subject: '1002', role: 'staff', disabled: false },
    ]);
    expect(response.text).not.toContain(secretHash);
    expect(response.text).not.toContain(alice.sessionToken);
    expect(response.text).not.toMatch(/token|secret|cookie|password/i);
    expect(response.text).not.toContain(ticketId);

    // The owner command can dry-run and apply the API export on another database.
    await withFreshMigratedPostgres(async ({ owner: target, urlFor }) => {
      const targetUrl = urlFor('postgres');
      const dryRun = await importConfigurationTenant(
        targetUrl,
        response.json,
        { issuer: githubIssuer, subject: '1001' },
        true,
      );
      expect(dryRun).toMatchObject({
        imported: false,
        eventCount: 2,
        sourceActiveMembers: 2,
        designatedAdminWasMember: true,
        membersDisabled: 1,
      });
      const before = await target.query(
        "SELECT 1 FROM tenants WHERE slug = 'fair'",
      );
      expect(before.rows).toHaveLength(0);

      const applied = await importConfigurationTenant(
        targetUrl,
        response.json,
        { issuer: githubIssuer, subject: '1001' },
      );
      expect(applied).toMatchObject({ imported: true, tenantId });
      const reexported = await exportConfigurationTenant(targetUrl, 'fair');
      // Identity, configuration, equipment, and printers survive the round trip;
      // only the staff membership is disabled by the documented transfer rule.
      expect(reexported.tenant).toEqual(response.json.tenant);
      expect(reexported.events).toEqual(response.json.events);
      expect(reexported.members).toEqual([
        {
          issuer: githubIssuer,
          subject: '1001',
          role: 'admin',
          disabled: false,
        },
        {
          issuer: githubIssuer,
          subject: '1002',
          role: 'staff',
          disabled: true,
        },
      ]);
      const carried = await target.query<{
        tickets: string;
        credentials: string;
      }>(
        `SELECT (SELECT count(*) FROM tickets)::text AS tickets,
                (SELECT count(*) FROM agent_credentials)::text AS credentials`,
      );
      expect(carried.rows).toEqual([{ tickets: '0', credentials: '0' }]);
      await expect(
        importConfigurationTenant(targetUrl, response.json, {
          issuer: githubIssuer,
          subject: '1001',
        }),
      ).rejects.toThrow(/already in use/);
    });
  });
}, 120_000);
