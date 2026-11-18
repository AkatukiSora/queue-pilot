import { expect, it } from 'vitest';
import { createGitHubActiveMembershipReader } from './github-active-membership-reader.ts';

function membership(userId: number | null, organizationId: number) {
  return {
    state: 'active',
    role: 'member',
    user: userId === null ? null : { id: userId },
    organization: { id: organizationId },
  };
}

it('reads every active-membership page and ignores unsafe numeric IDs', async () => {
  const pages: number[] = [];
  const firstPage = [
    ...Array.from({ length: 98 }, (_, index) =>
      membership(1234567, 1000 + index),
    ),
    membership(null, 2000),
    membership(1234567, Number.MAX_SAFE_INTEGER + 1),
  ];
  const fetchImplementation: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const page = Number(url.searchParams.get('page') ?? '1');
    pages.push(page);
    return new Response(
      JSON.stringify(
        page === 1
          ? firstPage
          : [
              membership(1234567, 7654321),
              membership(Number.MAX_SAFE_INTEGER + 1, 7654321),
            ],
      ),
      {
        status: 200,
        headers:
          page === 1
            ? {
                'content-type': 'application/json',
                link: '<https://api.github.com/user/memberships/orgs?state=active&per_page=100&page=2>; rel="next", <https://api.github.com/user/memberships/orgs?state=active&per_page=100&page=2>; rel="last"',
              }
            : { 'content-type': 'application/json' },
      },
    );
  };

  const result =
    await createGitHubActiveMembershipReader(
      fetchImplementation,
    ).listActiveMemberships('test-access-token');

  expect(pages).toEqual([1, 2]);
  expect(result).toEqual({
    kind: 'ok',
    memberships: [
      ...Array.from({ length: 98 }, (_, index) => ({
        userId: '1234567',
        organizationId: String(1000 + index),
      })),
      { userId: '1234567', organizationId: '7654321' },
    ],
  });
});

it.each([
  [401, { kind: 'reauth_required' }],
  [403, { kind: 'reauth_required' }],
  [500, { kind: 'unavailable' }],
])(
  'classifies GitHub membership API status %s safely',
  async (status, expected) => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ message: 'request failed' }), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      createGitHubActiveMembershipReader(
        fetchImplementation,
      ).listActiveMemberships('test-access-token'),
    ).resolves.toEqual(expected);
  },
);
