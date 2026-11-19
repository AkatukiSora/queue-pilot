import { Octokit } from '@octokit/rest';
import type {
  GitHubAccountLookup,
  GitHubAccountResolver,
} from '../../application/configuration-management.ts';

export function createGitHubAccountResolver(
  fetchImplementation: typeof fetch = fetch,
): GitHubAccountResolver {
  const positiveSeconds = (value: unknown): number | undefined => {
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
    const date = Date.parse(value);
    const remaining = Math.ceil((date - Date.now()) / 1_000);
    return Number.isFinite(date) && remaining > 0 ? remaining : undefined;
  };
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
      const githubError = error as {
        status?: unknown;
        response?: { headers?: Record<string, unknown> } | null;
      } | null;
      const status =
        typeof githubError?.status === 'number'
          ? githubError.status
          : undefined;
      if (status === 401) return { kind: 'reauth_required' };
      if (status === 404) return { kind: 'not_found' };
      const headers = githubError?.response?.headers;
      const retryAfterSeconds = positiveSeconds(headers?.['retry-after']);
      const resetAt = Number(headers?.['x-ratelimit-reset']);
      const resetDelay =
        headers?.['x-ratelimit-remaining'] === '0' && Number.isFinite(resetAt)
          ? Math.ceil(resetAt - Date.now() / 1_000)
          : undefined;
      if (
        status === 429 ||
        (status === 403 &&
          (retryAfterSeconds !== undefined ||
            headers?.['x-ratelimit-remaining'] === '0'))
      ) {
        const delay = retryAfterSeconds ?? resetDelay;
        return {
          kind: 'rate_limited',
          ...(delay !== undefined && delay > 0
            ? { retryAfterSeconds: delay }
            : {}),
        };
      }
      return { kind: 'unavailable' };
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
