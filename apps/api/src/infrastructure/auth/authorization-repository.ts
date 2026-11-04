import { createHash } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AuthenticatedRequestContext,
  AuthorizationRepository,
  Principal,
} from '../../application/security-ports.ts';
import {
  type EventId,
  type PrinterId,
  parseManifestEvent,
  type TenantId,
} from '../../domain/tenant-manifest.ts';
import { parsePublicToken } from '../../domain/ticket.ts';
import type {
  DrizzleDatabase,
  DrizzleTransaction,
} from '../persistence/drizzle/client.ts';
import {
  agentCredentials,
  agents,
  appUsers,
  events,
  printers,
  publicTicketLocator,
  tenantMemberships,
  tenants,
} from '../persistence/drizzle/schema.ts';

function readManifestEvent(
  eventId: string,
  eventSlug: string,
  config: Record<string, unknown>,
) {
  const parsed = parseManifestEvent({
    ...config,
    id: eventId,
    slug: eventSlug,
  });
  if (!parsed.ok) throw new Error('Stored event configuration is invalid.');
  return parsed.value;
}

async function setIdentitySettings(
  transaction: DrizzleTransaction,
  principal: Principal,
  tenantSlug: string,
  eventSlug: string,
): Promise<void> {
  await transaction.execute(sql`
    SELECT set_config('app.user_id', ${principal.userId}, true),
           set_config('app.identity_issuer', ${principal.issuer}, true),
           set_config('app.identity_subject', ${principal.subject}, true),
           set_config('app.tenant_slug', ${tenantSlug}, true),
           set_config('app.event_slug', ${eventSlug}, true)
  `);
}

export function createDrizzleAuthorizationRepository(
  database: DrizzleDatabase,
): AuthorizationRepository {
  return {
    resolveMemberScope: async (principal, tenantSlug, eventSlug) =>
      database.transaction(async (transaction) => {
        await setIdentitySettings(
          transaction,
          principal,
          tenantSlug,
          eventSlug,
        );
        const [row] = await transaction
          .select({
            tenantId: tenants.id,
            userId: appUsers.id,
            role: tenantMemberships.role,
            eventId: events.id,
            eventSlug: events.slug,
            eventConfig: events.config,
          })
          .from(tenants)
          .innerJoin(events, eq(events.tenantId, tenants.id))
          .innerJoin(
            tenantMemberships,
            eq(tenantMemberships.tenantId, tenants.id),
          )
          .innerJoin(appUsers, eq(appUsers.id, tenantMemberships.userId))
          .where(
            and(
              eq(tenants.slug, tenantSlug),
              eq(events.slug, eventSlug),
              eq(appUsers.id, principal.userId),
              eq(tenantMemberships.userId, principal.userId),
              isNull(tenants.disabledAt),
              isNull(events.disabledAt),
              isNull(tenantMemberships.disabledAt),
              isNull(appUsers.disabledAt),
            ),
          )
          .limit(1);
        if (row === undefined) return null;
        if (row.role !== 'admin' && row.role !== 'staff') {
          throw new Error('Stored tenant membership role is invalid.');
        }
        return {
          kind: 'member',
          tenantId: row.tenantId as TenantId,
          eventId: row.eventId as EventId,
          userId: row.userId,
          role: row.role,
          event: readManifestEvent(row.eventId, row.eventSlug, row.eventConfig),
        } satisfies AuthenticatedRequestContext;
      }),

    resolveAgentScope: async (token, acceptedPayloadVersions = []) => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const tokenBytes = Buffer.from(token, 'base64url');
      if (
        tokenBytes.byteLength !== 32 ||
        tokenBytes.toString('base64url') !== token
      ) {
        return null;
      }
      const secretHash = createHash('sha256').update(token).digest('hex');
      const now = new Date();
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.agent_secret_hash', ${secretHash}, true)
        `);
        const [credential] = await transaction
          .select({
            tenantId: agentCredentials.tenantId,
            eventId: agentCredentials.eventId,
            agentId: agentCredentials.agentId,
            printerId: agentCredentials.printerId,
          })
          .from(agentCredentials)
          .where(
            and(
              eq(agentCredentials.secretHash, secretHash),
              gt(agentCredentials.expiresAt, now),
              isNull(agentCredentials.revokedAt),
            ),
          )
          .limit(1);
        if (credential === undefined) return null;

        await transaction.execute(sql`
          SELECT set_config('app.tenant_id', ${credential.tenantId}, true),
                 set_config('app.event_id', ${credential.eventId}, true),
                 set_config('app.agent_id', ${credential.agentId}, true)
        `);
        const [activeAgent] = await transaction
          .select({
            tenantId: agents.tenantId,
            eventId: agents.eventId,
            agentId: agents.id,
            printerId: printers.slug,
          })
          .from(agents)
          .innerJoin(
            printers,
            and(
              eq(printers.tenantId, agents.tenantId),
              eq(printers.eventId, agents.eventId),
              eq(printers.id, agents.printerId),
            ),
          )
          .innerJoin(
            events,
            and(
              eq(events.tenantId, agents.tenantId),
              eq(events.id, agents.eventId),
            ),
          )
          .innerJoin(tenants, eq(tenants.id, agents.tenantId))
          .innerJoin(
            agentCredentials,
            and(
              eq(agentCredentials.agentId, agents.id),
              eq(agentCredentials.secretHash, secretHash),
              gt(agentCredentials.expiresAt, now),
              isNull(agentCredentials.revokedAt),
            ),
          )
          .where(
            and(
              eq(agents.id, credential.agentId),
              eq(agents.tenantId, credential.tenantId),
              eq(agents.eventId, credential.eventId),
              eq(agents.printerId, credential.printerId),
              isNull(agents.disabledAt),
              isNull(printers.disabledAt),
              isNull(events.disabledAt),
              isNull(tenants.disabledAt),
            ),
          )
          .limit(1);
        if (activeAgent === undefined) return null;
        const touchResult = await transaction.execute(sql`
          SELECT public.touch_agent_last_seen() AS touched
        `);
        const [touch] = touchResult.rows as Array<{ touched: boolean }>;
        if (!touch?.touched) return null;
        return {
          kind: 'agent',
          tenantId: activeAgent.tenantId as TenantId,
          eventId: activeAgent.eventId as EventId,
          agentId: activeAgent.agentId,
          printerId: activeAgent.printerId as PrinterId,
          acceptedPayloadVersions,
        } satisfies AuthenticatedRequestContext;
      });
    },

    findPublicTicket: async (token) => {
      const parsedToken = parsePublicToken(token);
      if (!parsedToken.ok) return null;
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.public_token', ${parsedToken.value}, true)
        `);
        const [location] = await transaction
          .select({
            tenantId: publicTicketLocator.tenantId,
            eventId: publicTicketLocator.eventId,
            ticketId: publicTicketLocator.ticketId,
          })
          .from(publicTicketLocator)
          .where(eq(publicTicketLocator.token, parsedToken.value))
          .limit(1);
        if (location === undefined) return null;

        await transaction.execute(sql`
          SELECT set_config('app.tenant_id', ${location.tenantId}, true),
                 set_config('app.event_id', ${location.eventId}, true)
        `);
        const [eventRow] = await transaction
          .select({
            tenantId: tenants.id,
            eventId: events.id,
            eventSlug: events.slug,
            eventConfig: events.config,
          })
          .from(events)
          .innerJoin(tenants, eq(tenants.id, events.tenantId))
          .where(
            and(
              eq(tenants.id, location.tenantId),
              eq(events.tenantId, location.tenantId),
              eq(events.id, location.eventId),
              isNull(tenants.disabledAt),
              isNull(events.disabledAt),
            ),
          )
          .limit(1);
        if (eventRow === undefined) return null;
        return {
          tenantId: eventRow.tenantId as TenantId,
          eventId: eventRow.eventId as EventId,
          ticketId: location.ticketId,
          event: readManifestEvent(
            eventRow.eventId,
            eventRow.eventSlug,
            eventRow.eventConfig,
          ),
        };
      });
    },

    listTenantEvents: async (principal) =>
      database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.user_id', ${principal.userId}, true),
                 set_config('app.membership_list_user_id', ${principal.userId}, true)
        `);
        const memberships = await transaction
          .select({ tenantId: tenantMemberships.tenantId })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.userId, principal.userId),
              isNull(tenantMemberships.disabledAt),
            ),
          );
        const tenantIds = [
          ...new Set(memberships.map(({ tenantId }) => tenantId)),
        ];
        if (tenantIds.length === 0) return [];
        await transaction.execute(sql`
          SELECT set_config('app.tenant_ids', ${tenantIds.join(',')}, true)
        `);
        const rows = await transaction
          .select({
            tenantId: tenants.id,
            tenantSlug: tenants.slug,
            tenantName: tenants.displayName,
            role: tenantMemberships.role,
            eventId: events.id,
            eventSlug: events.slug,
            eventConfig: events.config,
          })
          .from(tenantMemberships)
          .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
          .innerJoin(events, eq(events.tenantId, tenants.id))
          .innerJoin(appUsers, eq(appUsers.id, tenantMemberships.userId))
          .where(
            and(
              eq(tenantMemberships.userId, principal.userId),
              inArray(tenantMemberships.tenantId, tenantIds),
              isNull(tenantMemberships.disabledAt),
              isNull(tenants.disabledAt),
              isNull(events.disabledAt),
              isNull(appUsers.disabledAt),
            ),
          );
        return rows.map((row) => {
          if (row.role !== 'admin' && row.role !== 'staff') {
            throw new Error('Stored tenant membership role is invalid.');
          }
          const event = readManifestEvent(
            row.eventId,
            row.eventSlug,
            row.eventConfig,
          );
          return {
            tenantId: row.tenantId as TenantId,
            tenantSlug: row.tenantSlug,
            tenantName: row.tenantName,
            role: row.role,
            eventId: row.eventId as EventId,
            eventSlug: row.eventSlug,
            eventTitle: event.title,
          };
        });
      }),
  };
}
