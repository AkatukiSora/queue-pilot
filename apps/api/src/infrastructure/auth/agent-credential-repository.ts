import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
  AgentCredentialAdministration,
  AgentCredentialSummary,
  RequestContextStorage,
  TenantEventScope,
} from '../../application/security-ports.ts';
import type { PrinterId } from '../../domain/tenant-manifest.ts';
import type {
  DrizzleDatabase,
  DrizzleTransaction,
} from '../persistence/drizzle/client.ts';
import {
  agentCredentials,
  agents,
  printers,
} from '../persistence/drizzle/schema.ts';

function requireAdminContext(
  requestContext: RequestContextStorage,
  scope: TenantEventScope,
) {
  const context = requestContext.current();
  if (
    context?.kind !== 'member' ||
    context.role !== 'admin' ||
    context.userId === undefined ||
    context.tenantId !== scope.tenantId ||
    context.eventId !== scope.eventId
  ) {
    throw new Error('An authorized tenant admin context is required.');
  }
  return context;
}

async function setAdminScope(
  transaction: DrizzleTransaction,
  userId: string,
  scope: TenantEventScope,
): Promise<void> {
  await transaction.execute(sql`
    SELECT set_config('app.tenant_id', ${scope.tenantId}, true),
           set_config('app.event_id', ${scope.eventId}, true),
           set_config('app.user_id', ${userId}, true)
  `);
}

function newAgentToken(): { token: string; secretHash: string } {
  const token = randomBytes(32).toString('base64url');
  const secretHash = createHash('sha256').update(token).digest('hex');
  return { token, secretHash };
}

export function createDrizzleAgentCredentialAdministration(
  database: DrizzleDatabase,
  requestContext: RequestContextStorage,
): AgentCredentialAdministration {
  return {
    list: async (scope) => {
      const context = requireAdminContext(requestContext, scope);
      return database.transaction(async (transaction) => {
        await setAdminScope(transaction, context.userId!, scope);
        const rows = await transaction
          .select({
            id: agents.id,
            printerId: printers.slug,
            agentDisabledAt: agents.disabledAt,
            lastSeenAt: agents.lastSeenAt,
            expiresAt: agentCredentials.expiresAt,
            credentialRevokedAt: agentCredentials.revokedAt,
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
          .innerJoin(agentCredentials, eq(agentCredentials.agentId, agents.id))
          .where(
            and(
              eq(agents.tenantId, scope.tenantId),
              eq(agents.eventId, scope.eventId),
            ),
          )
          .orderBy(asc(agents.id), desc(agentCredentials.createdAt));
        const latest = new Map<string, AgentCredentialSummary>();
        for (const row of rows) {
          if (latest.has(row.id)) continue;
          latest.set(row.id, {
            id: row.id,
            printerId: row.printerId as PrinterId,
            expiresAt: row.expiresAt,
            revokedAt: row.agentDisabledAt ?? row.credentialRevokedAt,
            lastSeenAt: row.lastSeenAt,
          });
        }
        return [...latest.values()];
      });
    },

    create: async (scope, printerSlug, expiresAt) => {
      const context = requireAdminContext(requestContext, scope);
      const { token, secretHash } = newAgentToken();
      const agentId = randomUUID();
      const credentialId = randomUUID();
      await database.transaction(async (transaction) => {
        await setAdminScope(transaction, context.userId!, scope);
        const [printer] = await transaction
          .select({ id: printers.id })
          .from(printers)
          .where(
            and(
              eq(printers.tenantId, scope.tenantId),
              eq(printers.eventId, scope.eventId),
              eq(printers.slug, printerSlug),
              isNull(printers.disabledAt),
            ),
          )
          .limit(1);
        if (printer === undefined)
          throw new Error('Printer is not active in this event.');
        await transaction.execute(sql`
          SELECT public.create_agent_credential(
            ${agentId}::uuid,
            ${credentialId}::uuid,
            ${printer.id}::uuid,
            ${secretHash},
            ${expiresAt}
          )
        `);
      });
      return { id: agentId, token, expiresAt };
    },

    revoke: async (scope, agentId) => {
      const context = requireAdminContext(requestContext, scope);
      return database.transaction(async (transaction) => {
        await setAdminScope(transaction, context.userId!, scope);
        const result = await transaction.execute(sql`
          SELECT public.revoke_agent_credential(${agentId}::uuid) AS revoked
        `);
        const [row] = result.rows as Array<{ revoked: boolean }>;
        return row?.revoked ?? false;
      });
    },

    rotate: async (scope, agentId, expiresAt) => {
      const context = requireAdminContext(requestContext, scope);
      const { token, secretHash } = newAgentToken();
      const credentialId = randomUUID();
      const rotated = await database.transaction(async (transaction) => {
        await setAdminScope(transaction, context.userId!, scope);
        const result = await transaction.execute(sql`
          SELECT public.rotate_agent_credential(
            ${agentId}::uuid,
            ${credentialId}::uuid,
            ${secretHash},
            ${expiresAt}
          ) AS rotated
        `);
        const [row] = result.rows as Array<{ rotated: boolean }>;
        return row?.rotated ?? false;
      });
      return rotated ? { id: agentId, token, expiresAt } : null;
    },
  };
}
