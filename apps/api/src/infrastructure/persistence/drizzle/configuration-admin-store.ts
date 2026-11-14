import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { z } from 'zod';
import { parseManifestEvent } from '../../../domain/tenant-manifest.ts';
import {
  assertConfigurationOwner,
  lockConfigurationAuthority,
} from './configuration-authority.ts';

const configurationTables = [
  'configuration_authority',
  'configuration_audit',
  'tenants',
  'events',
  'event_equipment',
  'app_users',
  'tenant_memberships',
  'printers',
  'tickets',
] as const;
const identitySchema = z
  .object({ issuer: z.string().url(), subject: z.string().min(1) })
  .strict();
const exportSchema = z
  .object({
    configurationExportVersion: z.literal(1),
    tenant: z
      .object({
        id: z.uuid(),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(63),
        displayName: z.string().min(1),
        disabled: z.boolean(),
      })
      .strict(),
    members: z.array(
      z
        .object({
          issuer: z.string().url(),
          subject: z.string().min(1),
          role: z.enum(['admin', 'staff']),
          disabled: z.boolean(),
        })
        .strict(),
    ),
    events: z.array(
      z
        .object({
          id: z.uuid(),
          slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(63),
          config: z.record(z.string(), z.unknown()),
          configRevision: z.string().regex(/^[a-f0-9]{64}$/),
          disabled: z.boolean(),
          equipment: z.array(
            z
              .object({
                id: z.string().min(1),
                label: z.string().min(1),
                sortOrder: z.number().int().nonnegative(),
                disabled: z.boolean(),
              })
              .strict(),
          ),
          printers: z.array(
            z
              .object({
                id: z.uuid(),
                slug: z
                  .string()
                  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
                  .max(63),
                label: z.string().min(1),
                kind: z.string().min(1),
                disabled: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type ConfigurationExport = z.infer<typeof exportSchema>;
export type ConfigurationAdminIdentity = z.infer<typeof identitySchema>;
export type ConfigurationImportResult = {
  tenantId: string;
  imported: boolean;
  membersDisabled: number;
  sourceActiveMembers: number;
  sourceDisabledMembers: number;
  designatedAdminWasMember: boolean;
  eventCount: number;
};

function assertConfigurationSnapshot(
  snapshot: ConfigurationExport,
  operation: 'Export' | 'Import',
): void {
  for (const event of snapshot.events) {
    const parsed = parseManifestEvent({
      id: event.id,
      slug: event.slug,
      ...event.config,
    });
    if (!parsed.ok || sha256(event.config) !== event.configRevision) {
      throw new Error(
        `${operation} event ${event.slug} has invalid configuration or revision.`,
      );
    }

    const equipmentById = new Map<string, (typeof event.equipment)[number]>();
    for (const equipment of event.equipment) {
      if (equipmentById.has(equipment.id)) {
        throw new Error(
          `${operation} event ${event.slug} has invalid configuration: duplicate normalized equipment.`,
        );
      }
      equipmentById.set(equipment.id, equipment);
    }
    const configuredEquipmentIds = new Set<string>();
    for (const equipment of parsed.value.equipment) {
      const normalized = equipmentById.get(equipment.id);
      if (
        normalized === undefined ||
        normalized.label !== equipment.label ||
        (!event.disabled && normalized.disabled)
      ) {
        throw new Error(
          `${operation} event ${event.slug} has invalid configuration: inconsistent normalized equipment.`,
        );
      }
      configuredEquipmentIds.add(equipment.id);
    }
    if (
      event.equipment.some(
        (equipment) =>
          !configuredEquipmentIds.has(equipment.id) && !equipment.disabled,
      )
    ) {
      throw new Error(
        `${operation} event ${event.slug} has invalid configuration: unconfigured active equipment row.`,
      );
    }

    const printersBySlug = new Map<string, (typeof event.printers)[number]>();
    const normalizedPrinterIds = new Set<string>();
    for (const printer of event.printers) {
      if (
        normalizedPrinterIds.has(printer.id) ||
        printersBySlug.has(printer.slug)
      ) {
        throw new Error(
          `${operation} event ${event.slug} has invalid configuration: duplicate normalized printers.`,
        );
      }
      normalizedPrinterIds.add(printer.id);
      printersBySlug.set(printer.slug, printer);
    }
    const configuredPrinterIds = new Set<string>();
    for (const printer of parsed.value.printers) {
      const normalized = printersBySlug.get(printer.id);
      if (
        normalized === undefined ||
        normalized.label !== printer.label ||
        (!event.disabled && normalized.disabled)
      ) {
        throw new Error(
          `${operation} event ${event.slug} has invalid configuration: inconsistent normalized printers.`,
        );
      }
      configuredPrinterIds.add(printer.id);
    }
    if (
      event.printers.some(
        (printer) =>
          !configuredPrinterIds.has(printer.slug) && !printer.disabled,
      )
    ) {
      throw new Error(
        `${operation} event ${event.slug} has invalid configuration: unconfigured active printer row.`,
      );
    }
  }
}

type InitializeWebInput = ConfigurationAdminIdentity & {
  tenantSlug: string;
  displayName: string;
};

export async function initializeWebConfiguration(
  connectionString: string,
  input: InitializeWebInput,
): Promise<{ tenantId: string; initialized: boolean }> {
  const value = z
    .object({
      tenantSlug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(63),
      displayName: z.string().min(1),
      issuer: z.string().url(),
      subject: z.string().min(1),
    })
    .strict()
    .parse(input);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(
      client,
      configurationTables,
      'initialize-web',
    );
    await client.query('BEGIN');
    try {
      const mode = await lockConfigurationAuthority(client);
      if (mode === 'database') {
        const previous = await client.query<{
          tenant_id: string;
          slug: string;
          issuer: string;
          subject: string;
        }>(
          `SELECT tenant.id::text AS tenant_id, tenant.slug, app_user.issuer, app_user.subject
           FROM configuration_audit AS audit
           JOIN tenants AS tenant ON tenant.id = audit.tenant_id
           JOIN tenant_memberships AS membership ON membership.tenant_id = tenant.id
           JOIN app_users AS app_user ON app_user.id = membership.user_id
           WHERE audit.action = 'initialize-web' AND audit.resource_id = tenant.id::text
             AND membership.role = 'admin' AND membership.disabled_at IS NULL
             AND app_user.disabled_at IS NULL
           ORDER BY audit.occurred_at LIMIT 1`,
        );
        const initialized = previous.rows[0];
        if (
          initialized?.slug === value.tenantSlug &&
          initialized.issuer === value.issuer &&
          initialized.subject === value.subject
        ) {
          await client.query('ROLLBACK');
          return { tenantId: initialized.tenant_id, initialized: false };
        }
        throw new Error(
          'initialize-web is complete or authority is database; different input is refused.',
        );
      }
      const priorOperation = await client.query(
        "SELECT id FROM configuration_audit WHERE action IN ('initialize-web', 'adopt-web') LIMIT 1",
      );
      if (priorOperation.rows.length > 0) {
        throw new Error(
          'initialize-web requires an uninitialized manifest authority.',
        );
      }
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM tenant_memberships AS membership
         JOIN app_users AS app_user ON app_user.id = membership.user_id
         WHERE membership.disabled_at IS NULL AND app_user.disabled_at IS NULL`,
      );
      if (active.rows[0]?.count !== '0') {
        throw new Error(
          'initialize-web requires no active membership; use adopt-web for an existing deployment.',
        );
      }
      const slugConflict = await client.query(
        'SELECT id FROM tenants WHERE slug = $1',
        [value.tenantSlug],
      );
      if (slugConflict.rows.length > 0)
        throw new Error('initialize-web requires an unused tenant slug.');
      const existingUser = await client.query<{
        id: string;
        disabled_at: Date | null;
      }>(
        'SELECT id::text, disabled_at FROM app_users WHERE issuer = $1 AND subject = $2 FOR UPDATE',
        [value.issuer, value.subject],
      );
      if (existingUser.rows[0]?.disabled_at != null) {
        throw new Error(
          'initialize-web will not reactivate a disabled identity.',
        );
      }
      const tenantId = randomUUID();
      const userId =
        existingUser.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL) RETURNING id::text`,
            [randomUUID(), value.issuer, value.subject],
          )
        ).rows[0]?.id;
      if (userId === undefined)
        throw new Error(
          'initialize-web could not create the designated identity.',
        );
      const before = await authorityRevision(client);
      await client.query(
        'INSERT INTO tenants (id, slug, display_name, disabled_at) VALUES ($1, $2, $3, NULL)',
        [tenantId, value.tenantSlug, value.displayName],
      );
      await client.query(
        "INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at) VALUES ($1, $2, 'admin', NULL)",
        [tenantId, userId],
      );
      const after = await client.query<{ revision: string }>(
        `UPDATE configuration_authority SET mode = 'database', revision = revision + 1,
         adopted_at = CURRENT_TIMESTAMP WHERE id = 1 RETURNING revision::text`,
      );
      await client.query(
        `INSERT INTO configuration_audit (id, tenant_id, actor_kind, action, resource_type,
         resource_id, revision_before, revision_after, after_state, origin)
         VALUES ($1, $2, 'operator', 'initialize-web', 'tenant', $3, $4, $5, $6::jsonb, $7)`,
        [
          randomUUID(),
          tenantId,
          tenantId,
          before,
          after.rows[0]?.revision,
          JSON.stringify({ slug: value.tenantSlug }),
          'configuration-admin initialize-web',
        ],
      );
      await client.query('COMMIT');
      return { tenantId, initialized: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

export async function exportConfigurationTenant(
  connectionString: string,
  tenantSlug: string,
): Promise<ConfigurationExport> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(
      client,
      configurationTables,
      'configuration export',
    );
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const tenantResult = await client.query<{
        id: string;
        slug: string;
        display_name: string;
        disabled_at: Date | null;
      }>(
        'SELECT id::text, slug, display_name, disabled_at FROM tenants WHERE slug = $1',
        [tenantSlug],
      );
      const tenant = tenantResult.rows[0];
      if (tenant === undefined)
        throw new Error(`No tenant exists with slug ${tenantSlug}.`);
      const [members, events] = await Promise.all([
        client.query<{
          issuer: string;
          subject: string;
          role: 'admin' | 'staff';
          membership_disabled_at: Date | null;
          user_disabled_at: Date | null;
        }>(
          `SELECT app_user.issuer, app_user.subject, membership.role,
           membership.disabled_at AS membership_disabled_at, app_user.disabled_at AS user_disabled_at
           FROM tenant_memberships AS membership JOIN app_users AS app_user ON app_user.id = membership.user_id
           WHERE membership.tenant_id = $1 ORDER BY app_user.issuer, app_user.subject`,
          [tenant.id],
        ),
        client.query<{
          id: string;
          slug: string;
          config: Record<string, unknown>;
          config_revision: string;
          disabled_at: Date | null;
        }>(
          'SELECT id::text, slug, config, config_revision, disabled_at FROM events WHERE tenant_id = $1 ORDER BY slug',
          [tenant.id],
        ),
      ]);
      const exportedEvents: ConfigurationExport['events'] = [];
      for (const event of events.rows) {
        const [equipment, printers] = await Promise.all([
          client.query<{
            id: string;
            label: string;
            sort_order: number;
            disabled_at: Date | null;
          }>(
            `SELECT id, label, sort_order, disabled_at FROM event_equipment
             WHERE tenant_id = $1 AND event_id = $2 ORDER BY sort_order, id`,
            [tenant.id, event.id],
          ),
          client.query<{
            id: string;
            slug: string;
            label: string;
            kind: string;
            disabled_at: Date | null;
          }>(
            `SELECT id::text, slug, label, kind, disabled_at FROM printers
             WHERE tenant_id = $1 AND event_id = $2 ORDER BY slug`,
            [tenant.id, event.id],
          ),
        ]);
        exportedEvents.push({
          id: event.id,
          slug: event.slug,
          config: event.config,
          configRevision: event.config_revision,
          disabled: event.disabled_at !== null,
          equipment: equipment.rows.map((item) => ({
            id: item.id,
            label: item.label,
            sortOrder: item.sort_order,
            disabled: item.disabled_at !== null,
          })),
          printers: printers.rows.map((printer) => ({
            id: printer.id,
            slug: printer.slug,
            label: printer.label,
            kind: printer.kind,
            disabled: printer.disabled_at !== null,
          })),
        });
      }
      const result = exportSchema.parse({
        configurationExportVersion: 1,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          displayName: tenant.display_name,
          disabled: tenant.disabled_at !== null,
        },
        members: members.rows.map((member) => ({
          issuer: member.issuer,
          subject: member.subject,
          role: member.role,
          disabled:
            member.membership_disabled_at !== null ||
            member.user_disabled_at !== null,
        })),
        events: exportedEvents,
      });
      assertConfigurationSnapshot(result, 'Export');
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

export async function importConfigurationTenant(
  connectionString: string,
  input: unknown,
  admin: ConfigurationAdminIdentity,
  dryRun = false,
): Promise<ConfigurationImportResult> {
  const snapshot = exportSchema.parse(input);
  const identity = identitySchema.parse(admin);
  assertConfigurationSnapshot(snapshot, 'Import');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await assertConfigurationOwner(
      client,
      configurationTables,
      'configuration import',
    );
    await client.query('BEGIN');
    try {
      const mode = await lockConfigurationAuthority(client);
      const adminInFile = await checkImportAvailability(
        client,
        snapshot,
        identity,
        mode,
      );
      const result = {
        tenantId: snapshot.tenant.id,
        imported: !dryRun,
        membersDisabled: snapshot.members.length - (adminInFile ? 1 : 0),
        sourceActiveMembers: snapshot.members.filter(
          ({ disabled }) => !disabled,
        ).length,
        sourceDisabledMembers: snapshot.members.filter(
          ({ disabled }) => disabled,
        ).length,
        designatedAdminWasMember: adminInFile,
        eventCount: snapshot.events.length,
      };
      if (dryRun) {
        await client.query('ROLLBACK');
        return result;
      }
      const hash = createHash('sha256')
        .update(canonicalJson(snapshot))
        .digest('hex');
      await client.query(
        `INSERT INTO tenants (id, slug, display_name, disabled_at)
         VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)`,
        [
          snapshot.tenant.id,
          snapshot.tenant.slug,
          snapshot.tenant.displayName,
          snapshot.tenant.disabled,
        ],
      );
      const users = new Map<string, string>();
      for (const member of snapshot.members) {
        const key = `${member.issuer}\u0000${member.subject}`;
        let userId = users.get(key);
        if (userId === undefined) {
          const existing = await client.query<{ id: string }>(
            'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2 FOR UPDATE',
            [member.issuer, member.subject],
          );
          userId =
            existing.rows[0]?.id ??
            (
              await client.query<{ id: string }>(
                `INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL) RETURNING id::text`,
                [randomUUID(), member.issuer, member.subject],
              )
            ).rows[0]?.id;
          if (userId === undefined)
            throw new Error('Import could not resolve a member identity.');
          users.set(key, userId);
        }
        const isAdmin =
          member.issuer === identity.issuer &&
          member.subject === identity.subject;
        await client.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at)
           VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN NULL ELSE CURRENT_TIMESTAMP END)`,
          [
            snapshot.tenant.id,
            userId,
            isAdmin ? 'admin' : member.role,
            isAdmin,
          ],
        );
      }
      const adminKey = `${identity.issuer}\u0000${identity.subject}`;
      if (!users.has(adminKey)) {
        const existing = await client.query<{ id: string }>(
          'SELECT id::text FROM app_users WHERE issuer = $1 AND subject = $2 FOR UPDATE',
          [identity.issuer, identity.subject],
        );
        const userId =
          existing.rows[0]?.id ??
          (
            await client.query<{ id: string }>(
              `INSERT INTO app_users (id, issuer, subject, disabled_at) VALUES ($1, $2, $3, NULL) RETURNING id::text`,
              [randomUUID(), identity.issuer, identity.subject],
            )
          ).rows[0]?.id;
        if (userId === undefined)
          throw new Error(
            'Import could not create the designated admin identity.',
          );
        await client.query(
          "INSERT INTO tenant_memberships (tenant_id, user_id, role, disabled_at) VALUES ($1, $2, 'admin', NULL)",
          [snapshot.tenant.id, userId],
        );
      }
      for (const event of snapshot.events) {
        await client.query(
          `INSERT INTO events (id, tenant_id, slug, config, config_revision, disabled_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          [
            event.id,
            snapshot.tenant.id,
            event.slug,
            canonicalJson(event.config),
            event.configRevision,
            event.disabled,
          ],
        );
        for (const item of event.equipment) {
          await client.query(
            `INSERT INTO event_equipment (tenant_id, event_id, id, label, sort_order, disabled_at)
             VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)`,
            [
              snapshot.tenant.id,
              event.id,
              item.id,
              item.label,
              item.sortOrder,
              item.disabled,
            ],
          );
        }
        for (const printer of event.printers) {
          await client.query(
            `INSERT INTO printers (id, tenant_id, event_id, slug, label, kind, disabled_at)
             VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)`,
            [
              printer.id,
              snapshot.tenant.id,
              event.id,
              printer.slug,
              printer.label,
              printer.kind,
              printer.disabled,
            ],
          );
        }
      }
      const before = await authorityRevision(client);
      const after = await client.query<{ revision: string }>(
        `UPDATE configuration_authority SET mode = 'database', revision = revision + 1,
         adopted_at = CASE WHEN mode = 'manifest' THEN CURRENT_TIMESTAMP ELSE adopted_at END
         WHERE id = 1 RETURNING revision::text`,
      );
      await client.query(
        `INSERT INTO configuration_audit (id, tenant_id, actor_kind, action, resource_type,
         resource_id, revision_before, revision_after, after_state, origin, snapshot_hash)
         VALUES ($1, $2, 'operator', 'import-export', 'tenant', $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          randomUUID(),
          snapshot.tenant.id,
          snapshot.tenant.id,
          before,
          after.rows[0]?.revision,
          JSON.stringify({
            slug: snapshot.tenant.slug,
            eventCount: snapshot.events.length,
          }),
          'configuration-admin import-export',
          hash,
        ],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function checkImportAvailability(
  client: Client,
  snapshot: ConfigurationExport,
  admin: ConfigurationAdminIdentity,
  mode: 'manifest' | 'database' | undefined,
): Promise<boolean> {
  if (mode === 'manifest') {
    const active = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM tenant_memberships AS membership
       JOIN app_users AS app_user ON app_user.id = membership.user_id
       WHERE membership.disabled_at IS NULL AND app_user.disabled_at IS NULL`,
    );
    if (active.rows[0]?.count !== '0') {
      throw new Error(
        'Import into manifest authority requires no active membership; use adopt-web.',
      );
    }
  }
  const tenant = await client.query(
    'SELECT id FROM tenants WHERE id = $1 OR slug = $2',
    [snapshot.tenant.id, snapshot.tenant.slug],
  );
  if (tenant.rows.length > 0)
    throw new Error('Import target tenant ID or slug is already in use.');
  for (const event of snapshot.events) {
    const conflict = await client.query(
      'SELECT id FROM events WHERE id = $1 OR (tenant_id = $2 AND slug = $3)',
      [event.id, snapshot.tenant.id, event.slug],
    );
    if (conflict.rows.length > 0)
      throw new Error(`Import event identity conflicts with ${event.slug}.`);
    for (const printer of event.printers) {
      const printerConflict = await client.query(
        'SELECT id FROM printers WHERE id = $1',
        [printer.id],
      );
      if (printerConflict.rows.length > 0)
        throw new Error(
          `Import printer identity conflicts with ${printer.slug}.`,
        );
    }
  }
  const existingAdmin = await client.query<{ disabled_at: Date | null }>(
    'SELECT disabled_at FROM app_users WHERE issuer = $1 AND subject = $2',
    [admin.issuer, admin.subject],
  );
  if (existingAdmin.rows[0]?.disabled_at != null) {
    throw new Error(
      'Import will not reactivate the designated disabled admin identity.',
    );
  }
  return snapshot.members.some(
    (member) =>
      member.issuer === admin.issuer && member.subject === admin.subject,
  );
}

async function authorityRevision(client: Client): Promise<string> {
  const result = await client.query<{ revision: string }>(
    'SELECT revision::text FROM configuration_authority WHERE id = 1',
  );
  const revision = result.rows[0]?.revision;
  if (revision === undefined)
    throw new Error('Configuration authority revision is unavailable.');
  return revision;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const properties = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${properties.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined)
    throw new Error('Configuration export contains an unserializable value.');
  return result;
}
