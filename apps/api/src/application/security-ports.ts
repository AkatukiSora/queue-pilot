import type {
  EventId,
  ManifestEvent,
  PrinterId,
  TenantId,
} from '../domain/tenant-manifest.ts';

export type TenantEventScope = {
  tenantId: TenantId;
  eventId: EventId;
};

export type TenantRole = 'admin' | 'staff';

export type Principal = {
  userId: string;
  issuer: string;
  subject: string;
  sessionId: string;
};

export type AuthenticatedRequestContext = TenantEventScope & {
  kind: 'member' | 'agent' | 'legacy' | 'public';
  event?: ManifestEvent;
  userId?: string;
  role?: TenantRole;
  agentId?: string;
  printerId?: PrinterId;
  acceptedPayloadVersions?: readonly number[];
  publicTicketId?: string;
};

export type PublicTicketLocation = TenantEventScope & {
  ticketId: string;
};

export interface AuthenticationAdapter {
  handle(request: Request): Promise<Response>;
  resolveSession(headers: Headers): Promise<Principal | null>;
  revokeMemberSessions(issuer: string, subject: string): Promise<void>;
}

export interface AuthorizationRepository {
  resolveMemberScope(
    principal: Principal,
    tenantSlug: string,
    eventSlug: string,
  ): Promise<AuthenticatedRequestContext | null>;
  resolveAgentScope(
    token: string,
    acceptedPayloadVersions?: readonly number[],
  ): Promise<AuthenticatedRequestContext | null>;
  findPublicTicket(token: string): Promise<PublicTicketLocation | null>;
  listTenantEvents(principal: Principal): Promise<
    Array<{
      tenantId: TenantId;
      tenantSlug: string;
      tenantName: string;
      role: TenantRole;
      eventId: EventId;
      eventSlug: string;
      eventTitle: string;
    }>
  >;
}

export interface RequestContextStorage {
  current(): AuthenticatedRequestContext | undefined;
  run<T>(
    context: AuthenticatedRequestContext,
    operation: () => Promise<T>,
  ): Promise<T>;
}

export type AgentCredentialSummary = {
  id: string;
  printerId: PrinterId;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
};

export interface AgentCredentialAdministration {
  list(
    scope: TenantEventScope,
  ): Promise<AgentCredentialSummary[]>;
  create(
    scope: TenantEventScope,
    printerId: PrinterId,
    expiresAt: Date,
  ): Promise<{ id: string; token: string; expiresAt: Date }>;
  revoke(scope: TenantEventScope, agentId: string): Promise<boolean>;
  rotate(
    scope: TenantEventScope,
    agentId: string,
    expiresAt: Date,
  ): Promise<{ id: string; token: string; expiresAt: Date } | null>;
}
