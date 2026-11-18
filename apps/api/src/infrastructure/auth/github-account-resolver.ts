import { Octokit } from '@octokit/rest';
import type {
  GitHubAccountLookup,
  GitHubAccountResolver,
} from '../../application/configuration-management.ts';

export function createGitHubAccountResolver(
  fetchImplementation: typeof fetch = fetch,
): GitHubAccountResolver {
  const lookup = async (
    accessToken: string | null,
    request: (octokit: Octokit) => Promise<{
      data: {
        id: number | bigint;
        login: string;
        name?: string | null;
        type: string;
      };
    }>,
  ): Promise<GitHubAccountLookup> => {
    const octokit = new Octokit({
      ...(accessToken === null ? {} : { auth: accessToken }),
      request: { fetch: fetchImplementation, timeout: 10_000 },
    });
    try {
      const { data } = await request(octokit);
      const id = Number(data.id);
      if (data.type !== 'User' || !Number.isSafeInteger(id) || id <= 0) {
        return { kind: 'not_found' };
      }
      return {
        kind: 'ok',
        subject: String(id),
        login: data.login,
        displayName: data.name ?? data.login,
      };
    } catch (error) {
      const status =
        error !== null &&
        typeof error === 'object' &&
        'status' in error &&
        typeof error.status === 'number'
          ? error.status
          : undefined;
      return status === 404 ? { kind: 'not_found' } : { kind: 'unavailable' };
    }
  };

  return {
    findByLogin: (login, accessToken) =>
      lookup(accessToken, (octokit) =>
        octokit.rest.users.getByUsername({ username: login }),
      ),
    findBySubject: (subject, accessToken) =>
      lookup(accessToken, (octokit) =>
        octokit.request('GET /user/{account_id}', {
          account_id: Number(subject),
        }),
      ),
  };
}
