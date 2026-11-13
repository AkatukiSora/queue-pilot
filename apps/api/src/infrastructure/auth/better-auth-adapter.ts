import { createHash } from 'node:crypto';
import { type BetterAuthPlugin, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type {
  AuthenticationAdapter,
  Principal,
} from '../../application/security-ports.ts';
import type { SharedAuthConfig } from '../../config.ts';
import type { DrizzleDatabase } from '../persistence/drizzle/client.ts';
import {
  appUsers,
  authAccounts,
  authRateLimits,
  authSessions,
  authUsers,
  authVerifications,
} from '../persistence/drizzle/schema.ts';
import { githubSubject } from './github-oauth.ts';

export type BetterAuthAdapter = AuthenticationAdapter & {
  pruneExpiredRateLimits: () => Promise<void>;
  rateLimitWindowMs: number;
};

function profileString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function identityProfile(
  profile: Record<string, unknown>,
  issuer: string,
  subject: string,
) {
  const displayName =
    profileString(profile.name) ??
    profileString(profile.login) ??
    profileString(profile.preferred_username) ??
    subject;
  const emailKey = createHash('sha256')
    .update(`${issuer}\u0000${subject}`)
    .digest('hex');
  return {
    name: displayName,
    email: `${emailKey}@identity.invalid`,
    emailVerified: false,
  };
}

async function verifyDiscoveryIssuer(
  issuer: string,
  discoveryURL: string,
): Promise<void> {
  const response = await fetch(discoveryURL, { redirect: 'error' });
  if (!response.ok) {
    throw new Error('OIDC discovery metadata could not be loaded.');
  }
  const metadata: unknown = await response.json();
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('issuer' in metadata) ||
    metadata.issuer !== issuer
  ) {
    throw new Error('OIDC discovery issuer does not match OIDC_ISSUER.');
  }
}

export async function createBetterAuthAdapter(
  database: DrizzleDatabase,
  config: SharedAuthConfig,
  plugins: BetterAuthPlugin[] = [],
): Promise<BetterAuthAdapter> {
  const provider = config.provider;
  const rateLimitWindowMs = Math.max(
    60_000,
    ...plugins.flatMap(
      (plugin) => plugin.rateLimit?.map(({ window }) => window * 1000) ?? [],
    ),
  );
  const issuer =
    provider.kind === 'github' ? 'https://github.com' : provider.issuer;
  const providerId = provider.kind;
  if (provider.kind === 'oidc') {
    await verifyDiscoveryIssuer(provider.issuer, provider.discoveryURL);
  }

  const genericProvider =
    provider.kind === 'github'
      ? {
          providerId: 'github',
          name: 'GitHub',
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          authorizationUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userInfoUrl: 'https://api.github.com/user',
          scopes: ['read:user'],
          pkce: true,
          accountSubject: ({ profile }: { profile: Record<string, unknown> }) =>
            githubSubject(profile),
          mapProfileToUser: (profile: Record<string, unknown>) => {
            return identityProfile(profile, issuer, githubSubject(profile));
          },
        }
      : {
          providerId: 'oidc',
          name: 'OpenID Connect',
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          discoveryUrl: provider.discoveryURL,
          requireIdTokenVerification: true,
          scopes: ['openid', 'profile', 'email'],
          pkce: true,
          accountSubject: ({
            profile,
          }: {
            profile: Record<string, unknown>;
          }) => {
            const subject = profile.sub;
            if (typeof subject !== 'string' || subject.length === 0) {
              throw new Error('Verified OIDC profile has no subject.');
            }
            return subject;
          },
          mapProfileToUser: (profile: Record<string, unknown>) => {
            const subject = profile.sub;
            if (typeof subject !== 'string' || subject.length === 0) {
              throw new Error('Verified OIDC profile has no subject.');
            }
            return identityProfile(profile, issuer, subject);
          },
        };

  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [new URL(config.baseURL).origin],
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits,
      },
    }),
    rateLimit: { enabled: true, storage: 'database' },
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 900,
      disableSessionRefresh: true,
    },
    advanced: {
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders:
          config.clientIpTrustedProxies.length === 0 ? [] : ['x-forwarded-for'],
        trustedProxies: [...config.clientIpTrustedProxies],
      },
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    },
    plugins: [genericOAuth({ config: [genericProvider] }), ...plugins],
  });

  return {
    pruneExpiredRateLimits: async () => {
      await database
        .delete(authRateLimits)
        .where(lt(authRateLimits.lastRequest, Date.now() - rateLimitWindowMs));
    },
    rateLimitWindowMs,
    handle: (request) => auth.handler(request),
    resolveSession: async (headers: Headers): Promise<Principal | null> => {
      const current = await auth.api.getSession({ headers });
      if (current === null) return null;

      const [account] = await database
        .select({ subject: authAccounts.accountId })
        .from(authAccounts)
        .where(
          and(
            eq(authAccounts.userId, current.user.id),
            eq(authAccounts.providerId, providerId),
          ),
        )
        .limit(1);
      if (account === undefined) return null;

      const [user] = await database.transaction(async (transaction) => {
        await transaction.execute(sql`
          SELECT set_config('app.identity_issuer', ${issuer}, true),
                 set_config('app.identity_subject', ${account.subject}, true)
        `);
        return transaction
          .select({ id: appUsers.id })
          .from(appUsers)
          .where(
            and(
              eq(appUsers.issuer, issuer),
              eq(appUsers.subject, account.subject),
              isNull(appUsers.disabledAt),
            ),
          )
          .limit(1);
      });
      if (user === undefined) return null;

      return {
        userId: user.id,
        issuer,
        subject: account.subject,
        sessionId: current.session.id,
      };
    },
    revokeMemberSessions: async (memberIssuer, subject) => {
      if (memberIssuer !== issuer) return;
      const accountRows = await database
        .select({ userId: authAccounts.userId })
        .from(authAccounts)
        .where(
          and(
            eq(authAccounts.providerId, providerId),
            eq(authAccounts.accountId, subject),
          ),
        );
      const userIds = [...new Set(accountRows.map(({ userId }) => userId))];
      if (userIds.length === 0) return;
      await database
        .delete(authSessions)
        .where(inArray(authSessions.userId, userIds));
    },
  };
}
