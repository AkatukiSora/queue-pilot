import { createHash } from 'node:crypto';
import { Client } from 'pg';
import type {
  ManifestEvent,
  ManifestTenant,
  TenantManifest,
} from '../../../domain/tenant-manifest.ts';

const legacyRevision = 'legacy-expand-v1';
const ownerRequiredTables = ['tenants', 'events', 'event_equipment'];

export async function applyTenantManifest(
  connectionString: string,
  manifest: TenantManifest,
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

    for (const tenant of manifest.tenants) {
      await applyTenant(client, tenant);
    }
    await disableOmittedTenants(
      client,
      manifest.tenants.map(({ id }) => id),
    );
  } finally {
    await client.end();
  }
}

async function applyTenant(
  client: Client,
  tenant: ManifestTenant,
): Promise<void> {
  await client.query('BEGIN');
  try {
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
      await applyEvent(client, tenant, event);
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
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
    await client.query('BEGIN');
    try {
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
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function applyEvent(
  client: Client,
  tenant: ManifestTenant,
  event: ManifestEvent,
): Promise<void> {
  const previous = await client.query<{
    tenant_id: string;
    slug: string;
    config: Record<string, unknown>;
    config_revision: string;
  }>(
    'SELECT tenant_id, slug, config, config_revision FROM events WHERE id = $1 FOR UPDATE',
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

  const { id, slug, ...config } = event;
  const serializedConfig = canonicalJson(config);
  const configRevision = createHash('sha256')
    .update(serializedConfig)
    .digest('hex');
  if (
    previousEvent !== undefined &&
    previousEvent.config_revision !== legacyRevision &&
    createHash('sha256')
      .update(canonicalJson(previousEvent.config))
      .digest('hex') !== previousEvent.config_revision
  ) {
    throw new Error(
      'Stored event configuration revision hash is inconsistent.',
    );
  }
  if (
    previousEvent !== undefined &&
    previousEvent.config_revision !== legacyRevision
  ) {
    const ticketCount = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tickets WHERE tenant_id = $1 AND event_id = $2',
      [tenant.id, event.id],
    );
    if (Number(ticketCount.rows[0]?.count ?? '0') > 0) {
      const previousConfig = previousEvent.config;
      const previousEquipmentIds = Array.isArray(previousConfig.equipment)
        ? previousConfig.equipment
            .map((equipment) =>
              typeof equipment === 'object' &&
              equipment !== null &&
              'id' in equipment
                ? equipment.id
                : null,
            )
            .sort()
        : [];
      const nextEquipmentIds = event.equipment
        .map(({ id: equipmentId }) => equipmentId)
        .sort();
      if (
        previousConfig.timeZone !== event.timeZone ||
        previousConfig.numberScope !== event.numberScope ||
        previousConfig.startsAt !== event.startsAt ||
        previousConfig.endsAt !== event.endsAt ||
        JSON.stringify(previousEquipmentIds) !==
          JSON.stringify(nextEquipmentIds)
      ) {
        throw new Error(
          'Manifest apply cannot change issued-event time zone, number scope, bounds, or equipment IDs.',
        );
      }
    }
  }

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
