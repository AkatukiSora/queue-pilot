import { Octokit } from '@octokit/rest';
import type { ActiveOrganizationMembershipReader } from '../../application/tenant-registration.ts';

export function createGitHubActiveMembershipReader(
  fetchImplementation: typeof fetch = fetch,
): ActiveOrganizationMembershipReader {
  return {
    listActiveMemberships: async (accessToken) => {
      try {
        const octokit = new Octokit({
          auth: accessToken,
          request: { fetch: fetchImplementation, timeout: 10_000 },
        });
        const memberships = await octokit.paginate(
          octokit.rest.orgs.listMembershipsForAuthenticatedUser,
          { state: 'active', per_page: 100 },
        );
        return {
          kind: 'ok',
          memberships: memberships.flatMap(({ user, organization }) =>
            user === null ||
            !Number.isSafeInteger(user.id) ||
            user.id <= 0 ||
            !Number.isSafeInteger(organization.id) ||
            organization.id <= 0
              ? []
              : [
                  {
                    userId: String(user.id),
                    organizationId: String(organization.id),
                  },
                ],
          ),
        };
      } catch (error) {
        const status =
          error !== null &&
          typeof error === 'object' &&
          'status' in error &&
          typeof error.status === 'number'
            ? error.status
            : undefined;
        return status === 401 || status === 403
          ? { kind: 'reauth_required' }
          : { kind: 'unavailable' };
      }
    },
  };
}
