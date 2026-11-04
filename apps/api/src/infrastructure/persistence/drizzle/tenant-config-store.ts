import { createHash } from 'node:crypto';
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

const legacyRevision = 'legacy-expand-v1';
const ownerRequiredTables = ['tenants', 'events', 'event_equipment'];

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
    resource: 'tenant' | 'event' | 'equipment';
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

type EventTicketState = {
  count: number;
  firstSlotStartsAt: Date | null;
};

type CurrentState = {
  tenants: CurrentTenant[];
  events: CurrentEvent[];
  equipment: CurrentEquipment[];
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
    const owners = await client.query<{
      table_name: string;
      table_owner: string;
    }>(
      `SELECT class.relname AS table_name, pg_get_userbyid(class.relowner) AS table_owner
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND class.relkind = 'r'
         AND class.relname = ANY($1::text[])`,
      [ownerRequiredTables],
    );
    const currentUser = await client.query<{ current_user: string }>(
      'SELECT current_user',
    );
    const ownerNames = new Map(
      owners.rows.map(({ table_name, table_owner }) => [
        table_name,
        table_owner,
      ]),
    );
    if (
      ownerRequiredTables.some(
        (tableName) =>
          ownerNames.get(tableName) !== currentUser.rows[0]?.current_user,
      )
    ) {
      throw new Error(
        'Apply requires a database connection owned by the tenants, events, and event_equipment table owner.',
      );
    }

    await client.query('BEGIN');
    try {
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
  const includedTenantIds = new Set<string>();
  const includedEventIds = new Set<string>();
  const includedEquipmentKeys = new Set<string>();

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
      await client.query(
        'UPDATE event_equipment SET disabled_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND disabled_at IS NULL',
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
