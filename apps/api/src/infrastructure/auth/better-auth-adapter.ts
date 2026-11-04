import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import type { Principal, AuthenticationAdapter } from '../../application/security-ports.ts';
import type { SharedAuthConfig } from '../../config.ts';
import type { DrizzleDatabase } from '../persistence/drizzle/client.ts';
import {
  appUsers,
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from '../persistence/drizzle/schema.ts';

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
): Promise<AuthenticationAdapter> {
  const provider = config.provider;
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
          accountSubject: ({ profile }: { profile: Record<string, unknown> }) => {
            const subject = profile.id;
            if (typeof subject !== 'number' && typeof subject !== 'string') {
              throw new Error('GitHub OAuth profile has no immutable numeric user ID.');
            }
            return String(subject);
          },
          mapProfileToUser: (profile: Record<string, unknown>) => {
            const subject = profile.id;
            if (typeof subject !== 'number' && typeof subject !== 'string') {
              throw new Error('GitHub OAuth profile has no immutable numeric user ID.');
            }
            return identityProfile(profile, issuer, String(subject));
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
          accountSubject: ({ profile }: { profile: Record<string, unknown> }) => {
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
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 900,
      disableSessionRefresh: true,
    },
    advanced: {
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    },
    plugins: [genericOAuth({ config: [genericProvider] })],
  });

  return {
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

      const [user] = await database
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
