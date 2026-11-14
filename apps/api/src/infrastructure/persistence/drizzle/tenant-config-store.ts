import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type {
  LegacyEventBaseline,
  ManifestEvent,
  ManifestTenant,
  TenantManifest,
} from '../../../domain/tenant-manifest.ts';
import {
  DEFAULT_EVENT_ID,
  DEFAULT_TENANT_ID,
} from '../../../domain/tenant-manifest.ts';
import {
  assertConfigurationOwner,
  lockConfigurationAuthority,
} from './configuration-authority.ts';

const legacyRevision = 'legacy-expand-v1';
const ownerRequiredTables = [
  'configuration_authority',
  'configuration_audit',
  'tenants',
  'events',
  'event_equipment',
  'app_users',
  'tenant_memberships',
  'printers',
  'tickets',
];

export type TenantManifestPlan = {
  summary: {
    create: number;
    update: number;
    retire: number;
    noOp: number;
    revisionChanges: number;
  };
  changes: Array<{
    action: 'create' | 'update' | 'retire' | 'no-op';
    resource: 'tenant' | 'event' | 'equipment' | 'printer' | 'membership';
    path: string;
    revision?: { from: string | null; to: string };
  }>;
};

type CurrentTenant = {
  id: string;
  slug: string;
  display_name: string;
  disabled_at: Date | null;
};

type CurrentEvent = {
  tenant_id: string;
  id: string;
  slug: string;
  config: Record<string, unknown>;
  config_revision: string;
  disabled_at: Date | null;
};

type CurrentEquipment = {
  tenant_id: string;
  event_id: string;
  id: string;
  label: string;
  sort_order: number;
  disabled_at: Date | null;
};

type CurrentMembership = {
  tenant_id: string;
  user_id: string;
  issuer: string;
  subject: string;
  role: string;
  disabled_at: Date | null;
};

type CurrentPrinter = {
  tenant_id: string;
  event_id: string;
  id: string;
  slug: string;
  label: string;
  disabled_at: Date | null;
};

type EventTicketState = {
  count: number;
  firstSlotStartsAt: Date | null;
};

type CurrentState = {
  tenants: CurrentTenant[];
  events: CurrentEvent[];
  equipment: CurrentEquipment[];
  members: CurrentMembership[];
  printers: CurrentPrinter[];
  ticketsByEvent: Map<string, EventTicketState>;
};

export async function applyTenantManifest(
  connectionString: string,
  manifest: TenantManifest,
  legacyBaseline: LegacyEventBaseline | undefined,
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(client, ownerRequiredTables, 'Apply');

    await client.query('BEGIN');
    try {
      const authority = await lockConfigurationAuthority(client);
      if (authority !== 'manifest') {
        throw new Error(
          'Tenant manifest apply requires manifest configuration authority.',
        );
      }
      const state = await loadCurrentState(client, true);
      buildTenantManifestPlan(state, manifest, legacyBaseline);
      for (const tenant of manifest.tenants) {
        await applyTenant(client, tenant, legacyBaseline, state.ticketsByEvent);
      }
      await disableOmittedTenants(
        client,
        manifest.tenants.map(({ id }) => id),
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

export type TenantManifestAdoptionResult = {
  tenantCount: number;
  eventCount: number;
  dryRun: boolean;
  tenantsCreated: number;
  membershipsCreated: number;
  eventsCreated: number;
  legacyEventsAdopted: number;
  equipmentCreated: number;
  printersCreated: number;
  retainedTenants: number;
  retainedEvents: number;
  preservedTickets: number;
};

export async function adoptTenantManifest(
  connectionString: string,
  manifest: TenantManifest,
  legacyBaseline: LegacyEventBaseline | undefined,
  dryRun = false,
): Promise<TenantManifestAdoptionResult> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(client, ownerRequiredTables, 'adopt-web');
    await client.query('BEGIN');
    try {
      const authority = await lockConfigurationAuthority(client);
      if (authority !== 'manifest') {
        throw new Error('adopt-web requires manifest configuration authority.');
      }
      const state = await loadCurrentState(client, true);
      const manifestTenantIds = new Set<string>(
        manifest.tenants.map(({ id }) => id),
      );
      const manifestEventIds = new Set<string>(
        manifest.tenants.flatMap(({ events }) => events.map(({ id }) => id)),
      );
      const adoptionResult: TenantManifestAdoptionResult = {
        tenantCount: manifest.tenants.length,
        eventCount: manifest.tenants.reduce(
          (count, tenant) => count + tenant.events.length,
          0,
        ),
        dryRun,
        tenantsCreated: 0,
        membershipsCreated: 0,
        eventsCreated: 0,
        legacyEventsAdopted: 0,
        equipmentCreated: 0,
        printersCreated: 0,
        retainedTenants: state.tenants.filter(
          ({ id }) => !manifestTenantIds.has(id),
        ).length,
        retainedEvents: state.events.filter(
          ({ id }) => !manifestEventIds.has(id),
        ).length,
        preservedTickets: [...state.ticketsByEvent.values()].reduce(
          (count, tickets) => count + tickets.count,
          0,
        ),
      };
      const tenantSlugs = new Map(
        state.tenants.map(({ slug, id }) => [slug, id]),
      );
      const eventIds = new Map(state.events.map((event) => [event.id, event]));
      const eventSlugs = new Map(
        state.events.map((event) => [
          `${event.tenant_id}/${event.slug}`,
          event,
        ]),
      );
      const equipmentByKey = new Map(
        state.equipment.map((item) => [
          `${item.tenant_id}/${item.event_id}/${item.id}`,
          item,
        ]),
      );
      const printersByKey = new Map(
        state.printers.map((printer) => [
          `${printer.tenant_id}/${printer.event_id}/${printer.slug}`,
          printer,
        ]),
      );
      const memberByKey = new Map(
        state.members.map((member) => [
          `${member.tenant_id}/${member.issuer}\u0000${member.subject}`,
          member,
        ]),
      );
      const revision = await client.query<{ revision: string }>(
        'SELECT revision::text FROM configuration_authority WHERE id = 1',
      );
      const revisionBefore = revision.rows[0]?.revision;
      if (revisionBefore === undefined) {
        throw new Error('Configuration authority revision is unavailable.');
      }
      const snapshotHash = createHash('sha256')
        .update(canonicalJson(manifest))
        .digest('hex');

      for (const tenant of manifest.tenants) {
        const tenantById = state.tenants.find(({ id }) => id === tenant.id);
        const tenantIdForSlug = tenantSlugs.get(tenant.slug);
        if (
          (tenantById !== undefined && tenantById.slug !== tenant.slug) ||
          (tenantIdForSlug !== undefined && tenantIdForSlug !== tenant.id)
        ) {
          throw new Error(
            `adopt-web found an existing tenant identity conflict for slug ${tenant.slug}.`,
          );
        }
        if (tenantById === undefined) {
          await client.query(
            'INSERT INTO tenants (id, slug, display_name, disabled_at) VALUES ($1, $2, $3, NULL)',
            [tenant.id, tenant.slug, tenant.displayName],
          );
          tenantSlugs.set(tenant.slug, tenant.id);
          adoptionResult.tenantsCreated += 1;
        } else if (
          tenantById.display_name !== tenant.displayName ||
          tenantById.disabled_at !== null
        ) {
          throw new Error(
            `adopt-web found a tenant configuration conflict for slug ${tenant.slug}.`,
          );
        }

        for (const member of tenant.members) {
          const memberKey = `${tenant.id}/${member.issuer}\u0000${member.subject}`;
          const existing = memberByKey.get(memberKey);
          if (existing !== undefined) {
            if (
              existing.role !== member.role ||
              (existing.disabled_at !== null) !== member.disabled
            ) {
              throw new Error(
                `adopt-web found a membership conflict for tenant ${tenant.slug}.`,
              );
            }
            continue;
          }
          const appUser = await client.query<{
            id: string;
            disabled_at: Date | null;
          }>(
            'SELECT id::text, disabled_at FROM app_users WHERE issuer = $1 AND subject = $2 FOR UPDATE',
            [member.issuer, member.subject],
          );
          let user = appUser.rows[0];
          if (user === undefined) {
            const inserted = await client.query<{ id: string }>(
              'INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL) RETURNING id::text',
              [randomUUID(), member.issuer, member.subject],
            );
            const insertedUser = inserted.rows[0];
            if (insertedUser === undefined) {
              throw new Error('adopt-web could not create a member identity.');
            }
            user = { ...insertedUser, disabled_at: null };
          }
          if (user.disabled_at !== null && !member.disabled) {
            throw new Error(
              `adopt-web will not reactivate a disabled identity for tenant ${tenant.slug}.`,
            );
          }
          await client.query(
            `INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at)
             VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)`,
            [tenant.id, user.id, member.role, member.disabled],
          );
          memberByKey.set(memberKey, {
            tenant_id: tenant.id,
            user_id: user.id,
            issuer: member.issuer,
            subject: member.subject,
            role: member.role,
            disabled_at: member.disabled ? new Date() : null,
          });
          adoptionResult.membershipsCreated += 1;
        }

        for (const event of tenant.events) {
          const existingById = eventIds.get(event.id);
          const existingBySlug = eventSlugs.get(`${tenant.id}/${event.slug}`);
          if (
            (existingById !== undefined &&
              (existingById.tenant_id !== tenant.id ||
                existingById.slug !== event.slug)) ||
            (existingBySlug !== undefined && existingBySlug.id !== event.id)
          ) {
            throw new Error(
              `adopt-web found an event identity conflict for tenant ${tenant.slug}.`,
            );
          }
          if (existingById === undefined) {
            await applyEvent(
              client,
              tenant,
              event,
              legacyBaseline,
              state.ticketsByEvent.get(`${tenant.id}/${event.id}`) ?? {
                count: 0,
                firstSlotStartsAt: null,
              },
            );
            eventIds.set(event.id, {
              tenant_id: tenant.id,
              id: event.id,
              slug: event.slug,
              config: eventConfig(event),
              config_revision: createHash('sha256')
                .update(canonicalJson(eventConfig(event)))
                .digest('hex'),
              disabled_at: null,
            });
            eventSlugs.set(
              `${tenant.id}/${event.slug}`,
              eventIds.get(event.id)!,
            );
            adoptionResult.eventsCreated += 1;
          } else {
            if (existingById.disabled_at !== null) {
              throw new Error(
                `adopt-web will not reactivate a disabled event for tenant ${tenant.slug}.`,
              );
            }
            assertEventCanChange(
              existingById,
              event,
              state.ticketsByEvent.get(`${tenant.id}/${event.id}`) ?? {
                count: 0,
                firstSlotStartsAt: null,
              },
              legacyBaseline,
            );
            const desiredConfig = eventConfig(event);
            if (existingById.config_revision === legacyRevision) {
              await applyEvent(
                client,
                tenant,
                event,
                legacyBaseline,
                state.ticketsByEvent.get(`${tenant.id}/${event.id}`) ?? {
                  count: 0,
                  firstSlotStartsAt: null,
                },
              );
              existingById.config = desiredConfig;
              existingById.config_revision = createHash('sha256')
                .update(canonicalJson(desiredConfig))
                .digest('hex');
              adoptionResult.legacyEventsAdopted += 1;
            } else if (
              canonicalJson(existingById.config) !==
              canonicalJson(desiredConfig)
            ) {
              throw new Error(
                `adopt-web found an event configuration conflict for tenant ${tenant.slug}.`,
              );
            }
          }

          for (const [sortOrder, item] of event.equipment.entries()) {
            const key = `${tenant.id}/${event.id}/${item.id}`;
            const existing = equipmentByKey.get(key);
            if (existing !== undefined) {
              if (
                existing.label !== item.label ||
                existing.sort_order !== sortOrder ||
                existing.disabled_at !== null
              ) {
                throw new Error(
                  `adopt-web found an equipment conflict for tenant ${tenant.slug}.`,
                );
              }
              continue;
            }
            await client.query(
              `INSERT INTO event_equipment (tenant_id, event_id, id, label, sort_order, disabled_at)
               VALUES ($1, $2, $3, $4, $5, NULL)`,
              [tenant.id, event.id, item.id, item.label, sortOrder],
            );
            equipmentByKey.set(key, {
              tenant_id: tenant.id,
              event_id: event.id,
              id: item.id,
              label: item.label,
              sort_order: sortOrder,
              disabled_at: null,
            });
            adoptionResult.equipmentCreated += 1;
          }
          for (const printer of event.printers) {
            const key = `${tenant.id}/${event.id}/${printer.id}`;
            const existing = printersByKey.get(key);
            if (existing !== undefined) {
              if (
                existing.label !== printer.label ||
                existing.disabled_at !== null
              ) {
                throw new Error(
                  `adopt-web found a printer conflict for tenant ${tenant.slug}.`,
                );
              }
              continue;
            }
            const printerId = randomUUID();
            await client.query(
              `INSERT INTO printers (id, tenant_id, event_id, slug, label, disabled_at)
               VALUES ($1, $2, $3, $4, $5, NULL)`,
              [printerId, tenant.id, event.id, printer.id, printer.label],
            );
            printersByKey.set(key, {
              tenant_id: tenant.id,
              event_id: event.id,
              id: printerId,
              slug: printer.id,
              label: printer.label,
              disabled_at: null,
            });
            adoptionResult.printersCreated += 1;
          }
        }
      }

      if (dryRun) {
        await client.query('ROLLBACK');
        return adoptionResult;
      }
      const updatedAuthority = await client.query<{ revision: string }>(
        `UPDATE configuration_authority
         SET mode = 'database', revision = revision + 1, adopted_at = CURRENT_TIMESTAMP
         WHERE id = 1 RETURNING revision::text`,
      );
      const revisionAfter = updatedAuthority.rows[0]?.revision;
      if (revisionAfter === undefined) {
        throw new Error(
          'Configuration authority update did not return a revision.',
        );
      }
      for (const tenant of manifest.tenants) {
        await client.query(
          `INSERT INTO configuration_audit (
             id, tenant_id, actor_kind, action, resource_type, resource_id,
             revision_before, revision_after, after_state, origin, snapshot_hash
           ) VALUES ($1, $2, 'operator', 'adopt-web', 'tenant', $3, $4, $5, $6::jsonb, $7, $8)`,
          [
            randomUUID(),
            tenant.id,
            tenant.id,
            revisionBefore,
            revisionAfter,
            JSON.stringify({
              slug: tenant.slug,
              eventCount: tenant.events.length,
            }),
            'configuration-admin adopt-web',
            snapshotHash,
          ],
        );
      }
      await client.query('COMMIT');
      return adoptionResult;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

export async function planTenantManifest(
  connectionString: string,
  manifest: TenantManifest,
  legacyBaseline: LegacyEventBaseline | undefined,
): Promise<TenantManifestPlan> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const state = await loadCurrentState(client, false);
      const plan = buildTenantManifestPlan(state, manifest, legacyBaseline);
      await client.query('COMMIT');
      return plan;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function loadCurrentState(
  client: Client,
  lockRows: boolean,
): Promise<CurrentState> {
  const lockClause = lockRows ? ' FOR UPDATE' : '';
  const tenants = await client.query<CurrentTenant>(
    `SELECT id::text, slug, display_name, disabled_at
     FROM tenants ORDER BY id${lockClause}`,
  );
  const events = await client.query<CurrentEvent>(
    `SELECT tenant_id::text, id::text, slug, config, config_revision, disabled_at
     FROM events ORDER BY id${lockClause}`,
  );
  const equipment = await client.query<CurrentEquipment>(
    `SELECT tenant_id::text, event_id::text, id, label, sort_order, disabled_at
     FROM event_equipment ORDER BY tenant_id, event_id, id${lockClause}`,
  );
  const members = await client.query<CurrentMembership>(
    `SELECT membership.tenant_id::text, membership.user_id::text,
            app_user.issuer, app_user.subject, membership.role,
            membership.disabled_at
     FROM tenant_memberships AS membership
     JOIN app_users AS app_user ON app_user.id = membership.user_id
     ORDER BY membership.tenant_id, app_user.issuer, app_user.subject${lockClause}`,
  );
  const printers = await client.query<CurrentPrinter>(
    `SELECT tenant_id::text, event_id::text, id::text, slug, label, disabled_at
     FROM printers ORDER BY tenant_id, event_id, slug${lockClause}`,
  );
  const ticketCounts = await client.query<{
    tenant_id: string;
    event_id: string;
    count: string;
    first_slot_starts_at: Date | null;
  }>(
    `SELECT tenant_id::text, event_id::text, count(*)::text AS count,
            min(slot_starts_at) AS first_slot_starts_at
     FROM tickets GROUP BY tenant_id, event_id`,
  );
  return {
    tenants: tenants.rows,
    events: events.rows,
    equipment: equipment.rows,
    members: members.rows,
    printers: printers.rows,
    ticketsByEvent: new Map(
      ticketCounts.rows.map(
        ({ tenant_id, event_id, count, first_slot_starts_at }) => [
          `${tenant_id}/${event_id}`,
          { count: Number(count), firstSlotStartsAt: first_slot_starts_at },
        ],
      ),
    ),
  };
}

function buildTenantManifestPlan(
  state: CurrentState,
  manifest: TenantManifest,
  legacyBaseline: LegacyEventBaseline | undefined,
): TenantManifestPlan {
  const changes: TenantManifestPlan['changes'] = [];
  const currentTenants = new Map(
    state.tenants.map((tenant) => [tenant.id, tenant]),
  );
  const currentEvents = new Map(state.events.map((event) => [event.id, event]));
  const currentEquipment = new Map(
    state.equipment.map((equipment) => [
      `${equipment.tenant_id}/${equipment.event_id}/${equipment.id}`,
      equipment,
    ]),
  );
  const currentPrinters = new Map(
    state.printers.map((printer) => [
      `${printer.tenant_id}/${printer.event_id}/${printer.slug}`,
      printer,
    ]),
  );
  const includedTenantIds = new Set<string>();
  const includedEventIds = new Set<string>();
  const includedEquipmentKeys = new Set<string>();
  const includedPrinterKeys = new Set<string>();

  for (const tenant of manifest.tenants) {
    includedTenantIds.add(tenant.id);
    const currentTenant = currentTenants.get(tenant.id);
    if (currentTenant !== undefined && currentTenant.slug !== tenant.slug) {
      throw new Error('Manifest apply cannot change an existing tenant slug.');
    }
    changes.push({
      action:
        currentTenant === undefined
          ? 'create'
          : currentTenant.display_name !== tenant.displayName ||
              currentTenant.disabled_at !== null
            ? 'update'
            : 'no-op',
      resource: 'tenant',
      path: `tenant/${tenant.slug}`,
    });
    const currentTenantMembers = state.members
      .filter(({ tenant_id }) => tenant_id === tenant.id)
      .map(({ issuer, subject, role, disabled_at }) => ({
        issuer,
        subject,
        role,
        disabled: disabled_at !== null,
      }))
      .sort((left, right) => {
        const leftKey = `${left.issuer}\u0000${left.subject}`;
        const rightKey = `${right.issuer}\u0000${right.subject}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const desiredTenantMembers = tenant.members
      .map(({ issuer, subject, role, disabled }) => ({
        issuer,
        subject,
        role,
        disabled,
      }))
      .sort((left, right) => {
        const leftKey = `${left.issuer}\u0000${left.subject}`;
        const rightKey = `${right.issuer}\u0000${right.subject}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const membersUnchanged =
      canonicalJson(currentTenantMembers) ===
      canonicalJson(desiredTenantMembers);
    changes.push({
      action: membersUnchanged
        ? 'no-op'
        : currentTenantMembers.length === 0
          ? 'create'
          : desiredTenantMembers.length === 0
            ? 'retire'
            : 'update',
      resource: 'membership',
      path: `tenant/${tenant.slug}/members`,
    });

    for (const event of tenant.events) {
      includedEventIds.add(event.id);
      const currentEvent = currentEvents.get(event.id);
      if (
        currentEvent !== undefined &&
        (currentEvent.tenant_id !== tenant.id ||
          currentEvent.slug !== event.slug)
      ) {
        throw new Error(
          'Manifest apply cannot change an existing event identity or slug.',
        );
      }
      const revision = createHash('sha256')
        .update(canonicalJson(eventConfig(event)))
        .digest('hex');
      const eventTicketState = state.ticketsByEvent.get(
        `${tenant.id}/${event.id}`,
      ) ?? { count: 0, firstSlotStartsAt: null };
      if (currentEvent !== undefined) {
        assertEventCanChange(
          currentEvent,
          event,
          eventTicketState,
          legacyBaseline,
        );
      }
      const eventNeedsUpdate =
        currentEvent === undefined ||
        currentEvent.disabled_at !== null ||
        canonicalJson(currentEvent.config) !==
          canonicalJson(eventConfig(event));
      const eventChange: TenantManifestPlan['changes'][number] = {
        action:
          currentEvent === undefined
            ? 'create'
            : eventNeedsUpdate
              ? 'update'
              : 'no-op',
        resource: 'event',
        path: `tenant/${tenant.slug}/event/${event.slug}`,
        ...(currentEvent?.config_revision !== revision
          ? {
              revision: {
                from: currentEvent?.config_revision ?? null,
                to: revision,
              },
            }
          : {}),
      };
      changes.push(eventChange);

      for (const [sortOrder, item] of event.equipment.entries()) {
        const key = `${tenant.id}/${event.id}/${item.id}`;
        includedEquipmentKeys.add(key);
        const currentItem = currentEquipment.get(key);
        changes.push({
          action:
            currentItem === undefined
              ? 'create'
              : currentItem.label !== item.label ||
                  currentItem.sort_order !== sortOrder ||
                  currentItem.disabled_at !== null
                ? 'update'
                : 'no-op',
          resource: 'equipment',
          path: `tenant/${tenant.slug}/event/${event.slug}/equipment/${item.id}`,
        });
      }
      for (const printer of event.printers) {
        const key = `${tenant.id}/${event.id}/${printer.id}`;
        includedPrinterKeys.add(key);
        const currentPrinter = currentPrinters.get(key);
        changes.push({
          action:
            currentPrinter === undefined
              ? 'create'
              : currentPrinter.label !== printer.label ||
                  currentPrinter.disabled_at !== null
                ? 'update'
                : 'no-op',
          resource: 'printer',
          path: `tenant/${tenant.slug}/event/${event.slug}/printer/${printer.id}`,
        });
      }
    }
  }

  for (const tenant of state.tenants) {
    if (includedTenantIds.has(tenant.id)) continue;
    const retireTenant = tenant.disabled_at === null;
    changes.push({
      action: retireTenant ? 'retire' : 'no-op',
      resource: 'tenant',
      path: `tenant/${tenant.slug}`,
    });
    if (
      retireTenant &&
      state.members.some(({ tenant_id }) => tenant_id === tenant.id)
    ) {
      changes.push({
        action: 'retire',
        resource: 'membership',
        path: `tenant/${tenant.slug}/members`,
      });
    }
    if (!retireTenant) continue;
    for (const event of state.events.filter(
      (candidate) => candidate.tenant_id === tenant.id,
    )) {
      includedEventIds.add(event.id);
      if (event.disabled_at === null) {
        changes.push({
          action: 'retire',
          resource: 'event',
          path: `tenant/${tenant.slug}/event/${event.slug}`,
        });
      }
      for (const equipment of state.equipment.filter(
        (candidate) =>
          candidate.tenant_id === tenant.id && candidate.event_id === event.id,
      )) {
        includedEquipmentKeys.add(
          `${equipment.tenant_id}/${equipment.event_id}/${equipment.id}`,
        );
        if (equipment.disabled_at === null) {
          changes.push({
            action: 'retire',
            resource: 'equipment',
            path: `tenant/${tenant.slug}/event/${event.slug}/equipment/${equipment.id}`,
          });
        }
      }
    }
  }

  for (const event of state.events) {
    if (includedEventIds.has(event.id)) continue;
    const tenant = currentTenants.get(event.tenant_id);
    const tenantIsActive = tenant?.disabled_at === null;
    if (tenantIsActive && event.disabled_at === null) {
      changes.push({
        action: 'retire',
        resource: 'event',
        path: `tenant/${tenant.slug}/event/${event.slug}`,
      });
    }
    if (!tenantIsActive) continue;
    for (const equipment of state.equipment.filter(
      (candidate) => candidate.event_id === event.id,
    )) {
      const key = `${equipment.tenant_id}/${equipment.event_id}/${equipment.id}`;
      includedEquipmentKeys.add(key);
      if (equipment.disabled_at === null) {
        changes.push({
          action: 'retire',
          resource: 'equipment',
          path: `tenant/${tenant?.slug}/event/${event.slug}/equipment/${equipment.id}`,
        });
      }
    }
  }

  for (const equipment of state.equipment) {
    const key = `${equipment.tenant_id}/${equipment.event_id}/${equipment.id}`;
    if (includedEquipmentKeys.has(key)) continue;
    const event = currentEvents.get(equipment.event_id);
    const tenant = currentTenants.get(equipment.tenant_id);
    if (
      tenant?.disabled_at === null &&
      event?.disabled_at === null &&
      equipment.disabled_at === null
    ) {
      changes.push({
        action: 'retire',
        resource: 'equipment',
        path: `tenant/${tenant.slug}/event/${event.slug}/equipment/${equipment.id}`,
      });
    }
  }

  for (const printer of state.printers) {
    const key = `${printer.tenant_id}/${printer.event_id}/${printer.slug}`;
    if (includedPrinterKeys.has(key)) continue;
    const event = currentEvents.get(printer.event_id);
    const tenant = currentTenants.get(printer.tenant_id);
    if (
      tenant?.disabled_at === null &&
      event?.disabled_at === null &&
      printer.disabled_at === null
    ) {
      changes.push({
        action: 'retire',
        resource: 'printer',
        path: `tenant/${tenant.slug}/event/${event.slug}/printer/${printer.slug}`,
      });
    }
  }

  changes.sort((left, right) =>
    left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : left.resource < right.resource
          ? -1
          : left.resource > right.resource
            ? 1
            : 0,
  );
  const summary = {
    create: changes.filter(({ action }) => action === 'create').length,
    update: changes.filter(({ action }) => action === 'update').length,
    retire: changes.filter(({ action }) => action === 'retire').length,
    noOp: changes.filter(({ action }) => action === 'no-op').length,
    revisionChanges: changes.filter(({ revision }) => revision !== undefined)
      .length,
  };
  return { summary, changes };
}

function eventConfig(event: ManifestEvent): Omit<ManifestEvent, 'id' | 'slug'> {
  const { id: _id, slug: _slug, ...config } = event;
  return config;
}

function memberKey(issuer: string, subject: string): string {
  return `${issuer}\u0000${subject}`;
}

function providerIdForIssuer(issuer: string): 'github' | 'oidc' {
  return issuer === 'https://github.com' ? 'github' : 'oidc';
}

async function revokeManifestMemberSessions(
  client: Client,
  issuer: string,
  subject: string,
): Promise<void> {
  await client.query(
    `DELETE FROM "session" AS session
     USING "account" AS account
     WHERE session."userId" = account."userId"
       AND account."providerId" = $1
       AND account."accountId" = $2`,
    [providerIdForIssuer(issuer), subject],
  );
}

async function syncTenantMembers(
  client: Client,
  tenantId: string,
  members: ManifestTenant['members'],
): Promise<void> {
  const current = await client.query<{
    user_id: string;
    issuer: string;
    subject: string;
    disabled_at: Date | null;
  }>(
    `SELECT membership.user_id::text, app_user.issuer, app_user.subject,
            membership.disabled_at
     FROM tenant_memberships AS membership
     JOIN app_users AS app_user ON app_user.id = membership.user_id
     WHERE membership.tenant_id = $1
     ORDER BY app_user.issuer, app_user.subject
     FOR UPDATE OF membership`,
    [tenantId],
  );
  const currentByIdentity = new Map(
    current.rows.map((row) => [memberKey(row.issuer, row.subject), row]),
  );
  const desiredIdentities = new Set(
    members.map(({ issuer, subject }) => memberKey(issuer, subject)),
  );

  for (const member of members) {
    const identity = memberKey(member.issuer, member.subject);
    const existing = currentByIdentity.get(identity);
    const insertedUser = await client.query<{ id: string }>(
      `INSERT INTO app_users (id, issuer, subject, disabled_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (issuer, subject) DO NOTHING
       RETURNING id::text`,
      [randomUUID(), member.issuer, member.subject],
    );
    const userId =
      insertedUser.rows[0]?.id ??
      (
        await client.query<{ id: string }>(
          'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2',
          [member.issuer, member.subject],
        )
      ).rows[0]?.id;
    if (userId === undefined) {
      throw new Error('Manifest member identity could not be synchronized.');
    }

    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at)
       VALUES (
         $1, $2, $3,
         CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
       )
       ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET role = EXCLUDED.role,
           disabled_at = CASE
             WHEN EXCLUDED.disabled_at IS NULL THEN NULL
             ELSE COALESCE(tenant_memberships.disabled_at, EXCLUDED.disabled_at)
           END`,
      [tenantId, userId, member.role, member.disabled],
    );

    if (
      member.disabled &&
      (existing === undefined || existing.disabled_at === null)
    ) {
      await revokeManifestMemberSessions(client, member.issuer, member.subject);
    }
  }

  for (const member of current.rows) {
    if (desiredIdentities.has(memberKey(member.issuer, member.subject)))
      continue;
    await client.query(
      'DELETE FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, member.user_id],
    );
    await revokeManifestMemberSessions(client, member.issuer, member.subject);
  }
}

async function syncEventPrinters(
  client: Client,
  tenantId: string,
  eventId: string,
  desiredPrinters: ManifestEvent['printers'],
): Promise<void> {
  for (const printer of desiredPrinters) {
    await client.query(
      `INSERT INTO printers (id, tenant_id, event_id, slug, label, disabled_at)
       VALUES ($1, $2, $3, $4, $5, NULL)
       ON CONFLICT (tenant_id, event_id, slug) DO UPDATE
       SET label = EXCLUDED.label, disabled_at = NULL`,
      [randomUUID(), tenantId, eventId, printer.id, printer.label],
    );
  }
  await client.query(
    `UPDATE printers SET disabled_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND event_id = $2
       AND NOT (slug = ANY($3::text[])) AND disabled_at IS NULL`,
    [tenantId, eventId, desiredPrinters.map(({ id }) => id)],
  );
}

async function applyTenant(
  client: Client,
  tenant: ManifestTenant,
  legacyBaseline: LegacyEventBaseline | undefined,
  ticketsByEvent: Map<string, EventTicketState>,
): Promise<void> {
  const existingTenant = await client.query<{ slug: string }>(
    'SELECT slug FROM tenants WHERE id = $1 FOR UPDATE',
    [tenant.id],
  );
  if (
    existingTenant.rows[0] !== undefined &&
    existingTenant.rows[0].slug !== tenant.slug
  ) {
    throw new Error('Manifest apply cannot change an existing tenant slug.');
  }
  await client.query(
    `INSERT INTO tenants (id, slug, display_name, disabled_at)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, disabled_at = NULL`,
    [tenant.id, tenant.slug, tenant.displayName],
  );
  await syncTenantMembers(client, tenant.id, tenant.members);

  const eventIds: string[] = [];
  for (const event of tenant.events) {
    eventIds.push(event.id);
    await applyEvent(
      client,
      tenant,
      event,
      legacyBaseline,
      ticketsByEvent.get(`${tenant.id}/${event.id}`) ?? {
        count: 0,
        firstSlotStartsAt: null,
      },
    );
    await syncEventPrinters(client, tenant.id, event.id, event.printers);
    const equipmentIds = event.equipment.map(({ id }) => id);
    for (const [sortOrder, equipment] of event.equipment.entries()) {
      await client.query(
        `INSERT INTO event_equipment (tenant_id, event_id, id, label, sort_order, disabled_at)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT (tenant_id, event_id, id) DO UPDATE
         SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, disabled_at = NULL`,
        [tenant.id, event.id, equipment.id, equipment.label, sortOrder],
      );
    }
    await client.query(
      `UPDATE event_equipment SET disabled_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND event_id = $2 AND NOT (id = ANY($3::text[]))
         AND disabled_at IS NULL`,
      [tenant.id, event.id, equipmentIds],
    );
  }
  await client.query(
    `UPDATE event_equipment AS equipment SET disabled_at = CURRENT_TIMESTAMP
     FROM events AS event
     WHERE event.tenant_id = $1 AND equipment.tenant_id = event.tenant_id
       AND equipment.event_id = event.id AND NOT (event.id = ANY($2::uuid[]))
       AND equipment.disabled_at IS NULL`,
    [tenant.id, eventIds],
  );
  await client.query(
    `UPDATE printers SET disabled_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND NOT (event_id = ANY($2::uuid[]))
       AND disabled_at IS NULL`,
    [tenant.id, eventIds],
  );
  await client.query(
    `UPDATE events SET disabled_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND NOT (id = ANY($2::uuid[])) AND disabled_at IS NULL`,
    [tenant.id, eventIds],
  );
}

async function disableOmittedTenants(
  client: Client,
  configuredTenantIds: string[],
): Promise<void> {
  const omitted = await client.query<{ id: string }>(
    'SELECT id FROM tenants WHERE NOT (id = ANY($1::uuid[])) AND disabled_at IS NULL',
    [configuredTenantIds],
  );
  for (const { id } of omitted.rows) {
    const locked = await client.query<{ id: string }>(
      'SELECT id FROM tenants WHERE id = $1 AND disabled_at IS NULL FOR UPDATE',
      [id],
    );
    if (locked.rows.length > 0) {
      await syncTenantMembers(client, id, []);
      await client.query(
        'UPDATE event_equipment SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND disabled_at IS NULL',
        [id],
      );
      await client.query(
        'UPDATE printers SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND disabled_at IS NULL',
        [id],
      );
      await client.query(
        'UPDATE events SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND disabled_at IS NULL',
        [id],
      );
      await client.query(
        'UPDATE tenants SET disabled_at = CURRENT_TIMESTAMP WHERE id = $1 AND disabled_at IS NULL',
        [id],
      );
    }
  }
}

function assertEventCanChange(
  previousEvent: CurrentEvent,
  event: ManifestEvent,
  ticketState: EventTicketState,
  legacyBaseline: LegacyEventBaseline | undefined,
): void {
  const previousConfig = previousEvent.config;
  if (
    previousEvent.config_revision !== legacyRevision &&
    createHash('sha256').update(canonicalJson(previousConfig)).digest('hex') !==
      previousEvent.config_revision
  ) {
    throw new Error(
      'Stored event configuration revision hash is inconsistent.',
    );
  }
  if (ticketState.count === 0) return;

  const nextEquipmentIds = event.equipment.map(({ id }) => id).sort();
  if (previousEvent.config_revision === legacyRevision) {
    if (
      previousEvent.tenant_id !== DEFAULT_TENANT_ID ||
      previousEvent.id !== DEFAULT_EVENT_ID ||
      legacyBaseline === undefined
    ) {
      throw new Error(
        'Cannot verify the authoritative legacy baseline for an issued event; manifest apply was not written.',
      );
    }
    const baselineEquipmentIds = [...legacyBaseline.equipmentIds].sort();
    if (
      legacyBaseline.timeZone !== event.timeZone ||
      legacyBaseline.numberScope !== event.numberScope ||
      Date.parse(legacyBaseline.endsAt) !== Date.parse(event.endsAt) ||
      JSON.stringify(baselineEquipmentIds) !==
        JSON.stringify(nextEquipmentIds) ||
      (ticketState.firstSlotStartsAt !== null &&
        Date.parse(event.startsAt) > ticketState.firstSlotStartsAt.getTime())
    ) {
      throw new Error(
        'Manifest apply cannot change issued-event time zone, number scope, bounds, or equipment IDs.',
      );
    }
    return;
  }

  const expectedEquipmentIds = Array.isArray(previousConfig.equipment)
    ? previousConfig.equipment.flatMap((equipment) =>
        typeof equipment === 'object' &&
        equipment !== null &&
        'id' in equipment &&
        typeof equipment.id === 'string'
          ? [equipment.id]
          : [],
      )
    : [];
  expectedEquipmentIds.sort();
  if (
    previousConfig.timeZone !== event.timeZone ||
    previousConfig.numberScope !== event.numberScope ||
    Date.parse(String(previousConfig.startsAt)) !==
      Date.parse(event.startsAt) ||
    Date.parse(String(previousConfig.endsAt)) !== Date.parse(event.endsAt) ||
    JSON.stringify(expectedEquipmentIds) !== JSON.stringify(nextEquipmentIds)
  ) {
    throw new Error(
      'Manifest apply cannot change issued-event time zone, number scope, bounds, or equipment IDs.',
    );
  }
}

async function applyEvent(
  client: Client,
  tenant: ManifestTenant,
  event: ManifestEvent,
  legacyBaseline: LegacyEventBaseline | undefined,
  ticketState: EventTicketState,
): Promise<void> {
  const previous = await client.query<CurrentEvent>(
    'SELECT tenant_id::text, id::text, slug, config, config_revision, disabled_at FROM events WHERE id = $1 FOR UPDATE',
    [event.id],
  );
  const previousEvent = previous.rows[0];
  if (
    previousEvent !== undefined &&
    (previousEvent.tenant_id !== tenant.id || previousEvent.slug !== event.slug)
  ) {
    throw new Error(
      'Manifest apply cannot change an existing event identity or slug.',
    );
  }

  if (previousEvent !== undefined) {
    assertEventCanChange(previousEvent, event, ticketState, legacyBaseline);
  }
  const { id, slug, ...config } = event;
  const serializedConfig = canonicalJson(config);
  const configRevision = createHash('sha256')
    .update(serializedConfig)
    .digest('hex');

  await client.query(
    `INSERT INTO events (id, tenant_id, slug, config, config_revision, disabled_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NULL)
     ON CONFLICT (id) DO UPDATE
     SET config = EXCLUDED.config, config_revision = EXCLUDED.config_revision, disabled_at = NULL`,
    [event.id, tenant.id, event.slug, serializedConfig, configRevision],
  );
  const readBack = await client.query<{
    config: Record<string, unknown>;
    config_revision: string;
  }>(
    'SELECT config, config_revision FROM events WHERE id = $1 AND tenant_id = $2',
    [event.id, tenant.id],
  );
  if (
    readBack.rows[0]?.config_revision !== configRevision ||
    canonicalJson(readBack.rows[0].config) !== serializedConfig
  ) {
    throw new Error(
      'Manifest apply configuration revision read-back did not match.',
    );
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const properties = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${properties
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Manifest configuration contains an unserializable value.');
  }
  return serialized;
}
